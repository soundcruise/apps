// One explicitly authorized correction; never a scheduled article-body crawler.
import {parseDocument,DomUtils} from 'htmlparser2';
import {productFacts,factualLabel} from './metadata.js';
import {optOut} from './policy.js';
export const VOLT_CORRECTION_URL='https://www.ikebe-gakki-pb.com/new_product/172671/';
const find=(n,p)=>DomUtils.findAll(x=>!!x.name&&p(x),n.children||[]);
const cls=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
const hidden=n=>{for(let p=n;p;p=p.parent)if(['script','style','nav','footer','header','template','noscript'].includes(p.name)||p.attribs?.hidden!==undefined||p.attribs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attribs?.style||''))return true;return false;};
const text=n=>hidden(n)?'':n.type==='text'?n.data:(n.children||[]).map(text).join('');
const plain=n=>text(n).replace(/\s+/g,' ').trim();
export function correctedVoltFacts(html,row){
 if(row.source_id!=='ikebe'||row.source_url!==VOLT_CORRECTION_URL||row.review_status!=='pending'||row.event_type!=='release'||row.published_at!=='2026-10-01T15:00:00.000Z')throw Error('correction_target_changed');
 const old=JSON.parse(row.product_facts||'null');
 if(old?.brand!=='Universal Audio'||!['Gen2','Gen 2'].includes(old.product)||old.version!==null||old.category!==row.category||old.identifierBasis!=='explicit_model_code')throw Error('correction_identity_changed');
 if(typeof html!=='string'||new TextEncoder().encode(html).length>512000)throw Error('correction_response_size');
 const doc=parseDocument(html);
 if(find(doc,n=>n.name==='meta'&&/robots/i.test(n.attribs?.name||'')&&optOut(n.attribs?.content||'')).length)throw Error('correction_optout');
 const dates=find(doc,n=>n.name==='time'&&cls(n,'sub_info_date')&&!hidden(n));
 if(dates.length!==1||plain(dates[0])!=='2026年10月02日公開')throw Error('correction_date_changed');
 const titles=find(doc,n=>cls(n,'blog_title__inner')&&!hidden(n));
 if(titles.length!==1)throw Error('correction_structure_changed');
 const heads=find(titles[0],n=>n.name==='h1'&&!hidden(n));
 const bodies=find(doc,n=>cls(n,'main_wrap')&&!hidden(n));
 const title=plain(heads[0]||{});
 if(heads.length!==1||!/^【Universal Audio】/.test(title)||!/[『「]Volt Gen ?2[』」]/.test(title)||!/リリース|発売/.test(title))throw Error('correction_release_not_explicit');
 if(!bodies.some(body=>find(body,n=>n.name==='p'&&!hidden(n)&&/Volt Gen 2およびVolt Maxシリーズは/.test(plain(n))).length))throw Error('correction_family_not_explicit');
 const parsed=productFacts(title);
 if(parsed?.brand!==old.brand||parsed.product!=='Volt Gen 2'||parsed.category!==old.category)throw Error('correction_parser_mismatch');
 const facts={...old,product:parsed.product};
 return {facts,label:factualLabel(facts,row.event_type)};
}
export function correctionInsertSql(row,plan,digest,now,q){
 const cas=Object.keys(row).map(k=>`"${k}" IS ${q(row[k])}`).join(' AND ');
 return `INSERT INTO news_facts_rechecks(request_id,request_payload_hash,candidate_id,checked_at,outcome,provenance_json,patch_json)
 SELECT ${q(plan.requestId)},${q(digest)},${q(row.id)},${plan.at},'facts_recovered',${q(JSON.stringify(plan.provenance))},${q(JSON.stringify(plan.patch))}
 WHERE EXISTS(SELECT 1 FROM candidate_items WHERE ${cas} AND review_status='pending')
 AND EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND collection_enabled=1)
 AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id='ikebe' AND (disabled=1 OR publication_blocked=1 OR takedown=1 OR backoff_until>${now} OR (failures>0 AND next_at>${now})))
 AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=${q(row.id)});`;
}
