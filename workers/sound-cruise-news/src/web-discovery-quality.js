import {legacyProductIdentity} from './legacy-product-identity.js';
import {productBrandVariants} from './product-brand-identity.js';

export const WEB_QUALITY_VERSION='web-quality-2';
export const WEB_WINDOW_DAYS=14;
const DAY=86400000;
const japanese=t=>/[\u3040-\u30ff\u3400-\u9fff]/u.test(t);
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const parse=s=>{try{return JSON.parse(s);}catch{return null;}};
export const DEFAULT_WEB_QUERIES=Object.freeze([
 'アコースティックギター アコギ 新製品 発表 発売 日本語 メーカー ニュース',
 'アコースティックギター 限定仕様 復刻 特別モデル 新興ブランド 製作工房 発表 日本語',
 'アコギアンプ 弾き語り マイク 録音 オーディオインターフェース 新製品 発表 日本語'
]);
// The binding has no documented native date filter. This is a query hint only.
export function searchPlan(queries,now){
 const day=new Date(now+9*3600000).toISOString().slice(0,10),from=new Date(now+9*3600000-WEB_WINDOW_DAYS*DAY).toISOString().slice(0,10);
 return queries.slice(0,3).map((query,i)=>{const lane=DEFAULT_WEB_QUERIES.indexOf(query);return {id:`${WEB_QUALITY_VERSION}-${lane<0?'custom-'+(i+1):['acoustic','edition','equipment'][lane]}`,query:`${query} 記事公開日 ${from}〜${day} の新着ニュース`,from,to:day};});
}

// Keep public numeric article IDs, strip tracking, never retain credentials or
// arbitrary query values (which can contain tokens or personal information).
export function publicSearchUrl(raw){
 if(typeof raw!=='string'||raw.length>2048)return null;
 try{
  const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||u.hostname.endsWith('.local')||u.hostname.endsWith('.localhost')||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname))return null;
  for(const [k,v] of [...u.searchParams]){
   if(/^utm_|^(?:gclid|fbclid)$/i.test(k)){u.searchParams.delete(k);continue;}
   if(!/^(?:p|id|page|NewsNo)$/i.test(k)||!/^\d{1,12}$/.test(v))return null;
  }
  u.hash='';return u.href;
 }catch{return null;}
}
export function searchDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d))?$/.test(value))return null;
 const date=Date.parse(value),calendar=Date.parse(value.slice(0,10)+'T00:00:00Z');
 return Number.isFinite(date)&&Number.isFinite(calendar)&&new Date(calendar).toISOString().slice(0,10)===value.slice(0,10)?value:null;
}
export function resultMetadata(item,queryId,rank){
 // These optional provider values are hints, even if called publishedDate.
 // lastModifiedDate/last_modified/lastModified must never be substituted for publication date.
 return {version:WEB_QUALITY_VERSION,queryId,rank,publishedAtHint:searchDate(item?.publishedDate),dateSource:searchDate(item?.publishedDate)?'provider_unverified':'unknown',lastModifiedHint:searchDate(item?.lastModifiedDate)||searchDate(item?.last_modified)||searchDate(item?.lastModified),languageHint:typeof item?.language==='string'&&/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(item.language)?item.language:null};
}
export function generalPage(url){
 const u=new URL(url),p=u.pathname.replace(/\/$/,'');
 return !p&&!u.search||/^\/(?:archives\/\d{4}(?:\/\d{2})?|news-events)$/i.test(p)||/\/(?:[^/]+-tags)\/[^/]+$/i.test(p)||/\.(?:pdf)$/i.test(p)||/^\/(?:about|company)(?:\/|$)/i.test(p)||/^\/(?:brands|collections|category|tag)(?:\/[^/]+)?$/i.test(p)||/\/lineup\.html$/i.test(p)||/\/list(?:\/|$)/.test(p)||u.hostname==='linkedin.com'||u.hostname.endsWith('.linkedin.com');
}
function mentioned(title,token){
 const t=norm(title),s=norm(token);if(s.length<2)return false;
 const escaped=s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`,'u').test(t);
}
export function knownProductOverlap(hint,rows,now){
 // A conservative no-AI hold, NOT a formal duplicate or rejection. No names
 // are extracted from display labels or model estimates.
 for(const row of rows){
  if(row.review_status!=='approved')continue;
  let f=parse(row.product_facts),legacy=legacyProductIdentity(row,now);
  if(legacy)f=legacy;
  else {const provenance=parse(row.facts_provenance);if(!Array.isArray(f?.models)||!f.models.length||!Array.isArray(provenance)||!provenance.length)continue;}
  // Search-side spelling aid only; it grants no formal brand/identity authority.
  const spellings=productBrandVariants(f.brand);
  if(norm(f.brand)==='yamaha')spellings.push('ヤマハ');
  if(!f.brand||!spellings.some(b=>mentioned(hint.title,b)))continue;
  const models=f.models;if(!models.every(m=>typeof m==='string'&&mentioned(hint.title,m)))continue;
  // Different editions/events must not be collapsed merely by model name.
  if(/限定|新色|復刻|再発売|記念|シグネチャ|仕様変更|新仕様|新機能|改良|リニューアル|HH|limited|special|custom|reissue|signature|anniversary|new colou?r/i.test(hint.title))continue;
  if(!/発表|発売|登場|リリース|launch|release/i.test(hint.title))continue;
  return {candidateId:row.id,reason:'known_product_event_unconfirmed'};
 }
 return null;
}
export function screenWebHint(hint,metadata,rows,now){
 if(generalPage(hint.url))return {status:'excluded',reason:'general_page',ai:false};
 if(/まとめ|roundup|round-up/i.test(hint.title))return {status:'hold',reason:'roundup_requires_primary',ai:false};
 const overlap=knownProductOverlap(hint,rows,now);if(overlap)return {status:'hold',reason:overlap.reason,ai:false,relatedCandidateId:overlap.candidateId};
 if(metadata.publishedAtHint){
  const age=now-Date.parse(metadata.publishedAtHint);
  if(age<0)return {status:'hold',reason:'future_publication_unverified',ai:false};
  if(age>WEB_WINDOW_DAYS*DAY)return {status:'hold',reason:'old_publication_unverified',ai:false};
 }
 if(metadata.languageHint&&!/^ja(?:-|$)/.test(metadata.languageHint)||!japanese(hint.title)&&!/^ja(?:-|$)/.test(metadata.languageHint||''))return {status:'hold',reason:'japanese_article_unconfirmed',ai:false};
 if(!metadata.publishedAtHint){
  // Recent modification prioritizes semantic triage only. It never proves
  // publication/freshness, nor authorizes an article fetch or registration.
  const modified=metadata.lastModifiedHint&&Date.parse(metadata.lastModifiedHint);
  if(modified&&modified<=now&&now-modified<=WEB_WINDOW_DAYS*DAY)return {status:'unreviewed',reason:'triage_date_unconfirmed',ai:true,semanticOnly:true};
  return {status:'hold',reason:'publication_date_unconfirmed',ai:false};
 }
 // Search-side language and dates still do not constitute verified NEWS facts.
 return {status:'unreviewed',reason:'triage_pending_unverified',ai:true};
}

export async function beginWebSearch(db,{id,plan,now}){
 await db.prepare(`INSERT INTO news_web_searches(id,query_id,queried_at,query_text,provider,outcome,results_json,expires_at)
 SELECT ?,?,?,?,'exa','started','[]',? WHERE (SELECT COUNT(*) FROM news_web_searches)<200`).bind(id,plan.id,now,plan.query,now+30*DAY).run();
 if(!await db.prepare('SELECT id FROM news_web_searches WHERE id=?').bind(id).first())throw Error('web_search_log_full');
}
export async function finishWebSearch(db,id,outcome,results){
 const text=JSON.stringify(results);if(results.length>10||new TextEncoder().encode(text).length>32768)throw Error('web_search_log_invalid');
 await db.prepare('UPDATE news_web_searches SET outcome=?,results_json=? WHERE id=?').bind(outcome,text,id).run();
}
export async function recentWebSearches(db,now){
 const rows=(await db.prepare('SELECT id,query_id,queried_at,query_text,outcome,results_json FROM news_web_searches WHERE expires_at>? ORDER BY queried_at DESC,id DESC LIMIT 15').bind(now).all()).results;
 return rows.map(({results_json,...r})=>({...r,results:JSON.parse(results_json)}));
}
