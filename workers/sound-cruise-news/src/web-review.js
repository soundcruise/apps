import {hash} from './policy.js';
import {publicSearchUrl,generalPage,searchDate,knownProductOverlap} from './web-discovery-quality.js';
import {SOURCES} from './registry.js';
// This is a read-only presentation queue, never a reduced publication validator.
const visibility=/^web_review:(defer|later|review):[-a-zA-Z0-9_]{16,64}$/;
export const webVisibility=reason=>visibility.exec(reason||'')?.[1]||null;
export const webHintSnapshot=row=>hash(JSON.stringify(row));
const parse=s=>{try{return JSON.parse(s);}catch{return null;}};
const variant=/限定|新色|復刻|再発売|記念|周年|仕様|新機能|改良|リニューアル|\bHH\b|limited|special|custom|reissue|signature|anniversary|colou?r/i;
export function webReviewDisposition(item,known,now){
 const result=(queue,reason,extra={})=>({queue,reason,formalReady:false,...extra}),url=publicSearchUrl(item.url),draft=item.articleDraft,e=item.estimate||{},title=item.title||'';
 if(!url)return result('low','unsafe_url');
 if(item.existingCandidate)return result('existing','existing_candidate',{candidateId:item.existingCandidate.id,status:item.existingCandidate.status});
 if(item.reviewBlocked)return result('low',item.reviewBlocked,{blocked:true});
 const state=webVisibility(item.reason);if(state==='defer'||state==='later')return result('low',state==='defer'?'operator_deferred':'operator_later',{canRestore:true});
 if(!draft)return result('low','no_article_draft');
 if(state==='review')return result('judgment','operator_requested_review',{needsSourceReview:!item.humanEntry});
 const overlap=knownProductOverlap(item,known,now);if(overlap)return result('low','possible_known_event',{candidateId:overlap.candidateId});
 // Human-confirmed facts have object provenance; do not fake a machine receipt
 // just to compare them. This is only a duplicate suspicion, never a rejection.
 for(const row of known){const f=parse(row.product_facts),p=parse(row.facts_provenance);if(row.review_status!=='approved'||p?.method!=='human_public_facts_confirmation'||!f?.brand||!f.product||variant.test(title))continue;
  const mentions=token=>{const escaped=token.normalize('NFKC').toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('(?<![a-z0-9])'+escaped+'(?![a-z0-9])','u').test(title.normalize('NFKC').toLowerCase());};if(/[0-9]/.test(f.product)&&mentions(f.brand)&&mentions(f.product))return result('low','possible_known_event',{candidateId:row.id});
 }
 if(generalPage(url)||/製品ラインアップ|製品情報.*概要|会社概要|^ABOUT\b|在庫有ります/i.test(title)||/^(?:Product Page|Company Website|About Page)$/i.test(e.event||'')||/^(?:Company Website|About Page)$/i.test(e.product||''))return result('low','general_page');
 const stamp=searchDate(item.searchMetadata?.publishedAtHint);if(stamp&&now-Date.parse(stamp)>30*86400000)return result('low','old_date_hint');
 // URL text may lower display priority, but NEVER supplies a publication date.
 const path=new URL(url).pathname,m=path.match(/(?:\/|-)(20\d\d)[-\/]?(\d\d)(?:[-\/]?(\d\d))?(?:[^0-9]|$)/);
 const urlDate=m&&searchDate(m[1]+'-'+m[2]+'-'+(m[3]||'01'));
 if(new URL(url).hostname.startsWith('archive.')||urlDate&&now-Date.parse(urlDate)>30*86400000)return result('low','archive_or_old_url_hint');
 if(/新製品まとめ|全貌|という哲学|^Momose\s*\||「HD-\d+の日」|^Syezo Acoustics\s*-/.test(title))return result('low','background_or_roundup');
 const relevant=/ギター|アコギ|弾き語り|アンプ|録音|音楽機材|guitar|acoustic|pickup|amplifier/i.test(title+' '+e.category+' '+e.product);
 if(!relevant&&e.relevance!=='high')return result('low','relevance_unconfirmed');
 return result('judgment','human_facts_or_conditions',{needsSourceReview:!item.humanEntry});
}
export async function addWebReview(db,items,now){
 const known=(await db.prepare('SELECT id,source_id,source_url,normalized_url,review_status,published_at,label,product_facts,facts_provenance FROM candidate_items LIMIT 5001').all()).results;
 if(known.length>5000)throw Error('web_review_history_limit');
 const states=(await db.prepare('SELECT source_id,disabled,takedown,publication_blocked FROM source_state').all()).results;
 const tombstones=new Set((await db.prepare('SELECT item_id FROM news_takedowns').all()).results.map(r=>r.item_id));
 for(const item of items){
  const url=publicSearchUrl(item.url),existing=url&&known.find(c=>[publicSearchUrl(c.source_url),publicSearchUrl(c.normalized_url)].includes(url)),source=SOURCES.find(s=>{try{return new URL(s.baseUrl).hostname.replace(/^www\./,'')===new URL(url).hostname.replace(/^www\./,'');}catch{return false;}});
  item.existingCandidate=existing?{id:existing.id,status:existing.review_status}:null;
  const state=states.find(s=>s.source_id===(item.humanEntry?.sourceId||source?.id));
  // A Bot collection stop alone does not revoke an approved human-entry scope.
  item.reviewBlocked=tombstones.has(await hash(item.url))?'candidate_takedown':source&&(source.humanFactsProhibited||['DO_NOT_USE','PROHIBITED'].includes(source.legalStatus))?'source_prohibited':state&&(state.takedown||state.publication_blocked||state.disabled&&!item.humanEntry)?'source_stopped':null;
  item.webReview=webReviewDisposition(item,known,now);
 }
 return items;
}
// A hint visibility action is not an editorial decision or a learning teacher.
export async function setWebHintReview(store,input,now,actor){
 if(actor?.type!=='human_operator')throw Error('operator_denied');
 if(!input||Object.keys(input).some(k=>!['url','action','snapshot','requestId'].includes(k))||!['defer','later','review'].includes(input.action)||publicSearchUrl(input.url)!==input.url||!/^[-a-zA-Z0-9_]{16,64}$/.test(input.requestId||'')||!/^[a-f0-9]{64}$/.test(input.snapshot||''))throw Error('web_review_invalid');
 const target=await hash(input.url),payloadHash=await hash(JSON.stringify({input,actor})),auditId='web-review:'+input.requestId;
 const replay=async()=>{const a=await store.db.prepare('SELECT * FROM news_admin_audit WHERE id=?').bind(auditId).first();if(!a)return null;if(a.action!=='web-hint-visibility'||a.target!==target||parse(a.reason_code)?.payloadHash!==payloadHash)throw Error('idempotency_payload_changed');return {saved:true,replayed:true};};
 const prior=await replay();if(prior)return prior;
 const row=await store.db.prepare('SELECT * FROM news_web_hints WHERE url=?').bind(input.url).first();if(!row||row.expires_at<=now)throw Error('web_review_missing');if(await webHintSnapshot(row)!==input.snapshot)throw Error('candidate_changed');
 const reason='web_review:'+input.action+':'+input.requestId,keys=Object.keys(row),audit=JSON.stringify({kind:'web_hint_visibility',actor,payloadHash,from:{status:row.status,reason:row.reason},to:input.action});
 try{const result=await store.db.batch([
  store.db.prepare("UPDATE news_web_hints SET status='hold',reason=?,attempts=MAX(attempts,3) WHERE "+keys.map(k=>k+' IS ?').join(' AND ')).bind(reason,...keys.map(k=>row[k])),
  store.db.prepare("INSERT INTO news_admin_audit SELECT ?,'web-hint-visibility',?,?,? FROM news_web_hints WHERE url=? AND reason=?").bind(auditId,target,now,audit,input.url,reason)
 ]);if(result[0].meta.changes!==1||result[1].meta.changes!==1)throw Error('candidate_changed');return {saved:true,replayed:false};}catch(e){const replayed=await replay();if(replayed)return replayed;throw e;}
}
