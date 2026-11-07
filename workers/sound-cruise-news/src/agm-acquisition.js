// Shared by discovery and facts recheck. Cache hits never authorize publication.
import {AGM_ARTICLE_PARSER,AGM_ARTICLE_PARSERS} from './agm-article-evidence.js';
import {AGM_SECTIONS,agmArticleUrl} from './agm-sections.js';
import {fingerprint,validatedFingerprint} from './fingerprint.js';
import {publicationValidation} from './decision-policy.js';
import {factualLabel} from './metadata.js';
import {eventEndsAt} from './event.js';
import {DAY,hash} from './policy.js';
export const AGM_DETAIL_BUDGET=9;
const FORMAT='agm-evidence-cache-1';
const safeHeader=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value)?value:null;
export function agmRevalidationDays(value){const n=Number(value??7);return Number.isInteger(n)&&n>=1&&n<=30?n:7;}
export function agmProof(url,now,responseHash){return {sourceId:'agm',sourceUrl:url,verifiedAt:now,extractionMethod:'explicit_agm_article_fields',parserVersion:AGM_ARTICLE_PARSER,responseHash};}
export function agmProvenance(facts,proof){return JSON.stringify([...Object.keys(facts||{}).map(factField=>({...proof,factField})),{...proof,factField:'event_type'}]);}
function validationRow(i){return {id:i.id,source_id:i.sourceId,source_url:i.sourceUrl,normalized_url:i.normalizedUrl,published_at:i.publishedAt,expires_at:Date.parse(i.publishedAt)+90*DAY,title_fingerprint:i.titleFingerprint,product_facts:JSON.stringify(i.productFacts),facts_provenance:i.factsProvenance,event_type:i.eventType,category:i.category,label:i.label,topic_key:i.topicKey,publication_decision:i.publicationDecision,event_ends_at:eventEndsAt(i.productFacts)};}
async function complete(store,source,p,now,pepper){
 const i=p?.item,q=p?.proof;
 if(p?.format!==FORMAT||!AGM_ARTICLE_PARSERS.includes(p.parser)||!i||i.sourceId!=='agm'||i.id!==await hash(i.sourceUrl)||i.normalizedUrl!==i.sourceUrl||!AGM_SECTIONS.some(s=>agmArticleUrl(i.sourceUrl,s))||i.publicationDecision!=='PUBLISH_REVIEW'||!Number.isFinite(Date.parse(i.publishedAt))||!await validatedFingerprint(i.titleFingerprint,pepper)||!factualLabel(i.productFacts,i.eventType)||i.label!==factualLabel(i.productFacts,i.eventType))return false;
 if(q?.sourceId!=='agm'||q.sourceUrl!==i.sourceUrl||q.parserVersion!==p.parser||q.extractionMethod!=='explicit_agm_article_fields'||!Number.isSafeInteger(q.verifiedAt)||q.verifiedAt>now||! /^[a-f0-9]{64}$/.test(q.responseHash||''))return false;
 let provenance;try{provenance=JSON.parse(i.factsProvenance);}catch{return false;}
 if(!Array.isArray(provenance)||![...Object.keys(i.productFacts),'event_type'].every(field=>provenance.some(v=>v.factField===field&&Object.keys(q).every(k=>v[k]===q[k]))))return false;
 // Reuse the formal evidence validator. Operational/duplicate/expiry decisions still
 // run at their existing boundaries; they are not reasons to re-download a page.
 const checked=await publicationValidation(store,validationRow(i),now,[source],pepper);
 return !checked.errors.some(e=>!['operator_source_gate','duplicate','expired_candidate','event_validation_failed'].includes(e));
}
export async function inspectAgmArticle(store,source,url,now,pepper,{listingTitle,expectedPublishedAt,forceRevalidate=false}={}){
 if(source.id!=='agm'||!AGM_SECTIONS.some(s=>agmArticleUrl(url,s)))throw Error('facts_source_invalid');
 let row=await store.db.prepare('SELECT * FROM news_agm_article_cache WHERE canonical_url=?').bind(url).first();
 const existing=await store.db.prepare('SELECT * FROM candidate_items WHERE source_id=? AND source_url=?').bind('agm',url).first();
 let payload=null;try{if(row?.payload_json?.length<=64000&&await hash(row.payload_json)===row.payload_hash)payload=JSON.parse(row.payload_json);}catch{/* Corruption is a miss, never permission to reuse. */}
 // Upgrade valid retained evidence without a warm-up download. Never infer a cache
 // time from collection/publication dates, or upgrade an old parser's provenance.
 if(!row&&existing){try{
  const facts=JSON.parse(existing.product_facts),provenance=JSON.parse(existing.facts_provenance),p=provenance.find(p=>p.factField==='event_type');
  const proof=Object.fromEntries(['sourceId','sourceUrl','verifiedAt','extractionMethod','parserVersion','responseHash'].map(k=>[k,p[k]]));
  payload={format:FORMAT,parser:proof.parserVersion,proof,listingFingerprint:JSON.parse(existing.title_fingerprint),item:{id:existing.id,sourceId:'agm',sourceName:source.name,sourceUrl:url,normalizedUrl:existing.normalized_url,publishedAt:existing.published_at,
   category:existing.category,label:factualLabel(facts,existing.event_type),topicKey:existing.topic_key,collectedAt:existing.collected_at,eventType:existing.event_type,productFacts:facts,factsProvenance:existing.facts_provenance,titleFingerprint:existing.title_fingerprint,
   feedPublishedAt:existing.feed_published_at,publicationDecision:'PUBLISH_REVIEW',decisionReason:'agm_editorial_review',reviewReason:'agm_editorial_review'}};
  row={checked_at:proof.verifiedAt,attempted_at:0,lease_until:0};
 }catch{/* Legacy incomplete evidence requires a normal bounded fetch. */}}
 let valid=payload?.item?.sourceUrl===url&&await complete(store,source,payload,now,pepper);
 if(expectedPublishedAt&&payload?.item?.publishedAt!==expectedPublishedAt||existing?.published_at&&payload?.item?.publishedAt!==existing.published_at)valid=false;
 const listing=listingTitle===undefined?null:await fingerprint(listingTitle,pepper);
 const unchanged=!listing||(await validatedFingerprint(payload?.listingFingerprint,pepper))?.exact===listing.exact;
 const checked=Number.isSafeInteger(row?.checked_at)&&row.checked_at<=now&&row.checked_at>=payload?.proof?.verifiedAt;
 let parserUpgrade=!valid&&AGM_ARTICLE_PARSERS.includes(payload?.parser)&&payload.parser!==AGM_ARTICLE_PARSER&&payload.attemptParser!==AGM_ARTICLE_PARSER&&!(payload.upgradeAttemptAt>now-DAY);
 if(parserUpgrade&&await store.db.prepare("SELECT 1 FROM news_agm_article_cache WHERE json_valid(payload_json) AND json_extract(payload_json,'$.upgradeAttemptAt')>? LIMIT 1").bind(now-DAY).first())parserUpgrade=false;
 const fresh=valid&&unchanged&&checked&&row.checked_at>now-agmRevalidationDays(source.agmRevalidationDays)*DAY&&!forceRevalidate;
 return {row,payload,listing,parserUpgrade,valid:!!valid,unchanged,hit:!!fresh,
  conditional:!!(valid&&unchanged&&checked&&!forceRevalidate),
  // A failed/incomplete attempt is shared too, preventing a same-day retry by recheck.
  attempted:!!(row?.attempted_at>now-DAY&&row.attempted_at<=now),busy:row?.lease_until>now};
}
export async function acquireAgmArticle({store,source,url,now,pepper,listingTitle,expectedPublishedAt,forceRevalidate=false,request,parse}){
 const cached=await inspectAgmArticle(store,source,url,now,pepper,{listingTitle,expectedPublishedAt,forceRevalidate});
 if(cached.busy)throw Error('facts_recheck_busy');
 if(cached.hit)return {...cached.payload,cache:'hit'};
 if(cached.attempted&&!cached.parserUpgrade&&!forceRevalidate)return {cache:'attempted',item:null};
 const attemptPayload=!cached.valid?JSON.stringify({...cached.payload,format:FORMAT,parser:cached.payload?.parser||AGM_ARTICLE_PARSER,attemptParser:AGM_ARTICLE_PARSER,...(cached.parserUpgrade?{upgradeAttemptAt:now}:{})}):null;
 const token=crypto.randomUUID(),claimed=await store.db.prepare(`INSERT INTO news_agm_article_cache(canonical_url,lease_token,lease_until,attempted_at,payload_json,payload_hash) VALUES(?,?,?,?,?,?)
 ON CONFLICT(canonical_url) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until,attempted_at=excluded.attempted_at,checked_at=0,payload_json=COALESCE(excluded.payload_json,news_agm_article_cache.payload_json),payload_hash=COALESCE(excluded.payload_hash,news_agm_article_cache.payload_hash)
 WHERE lease_until<=? AND (attempted_at<=? OR ?=1 OR (?=1 AND payload_hash IS ? AND attempted_at=? AND (SELECT COUNT(*) FROM news_agm_article_cache a WHERE a.attempted_at>=?)<? AND NOT EXISTS(SELECT 1 FROM news_agm_article_cache a WHERE json_valid(a.payload_json) AND json_extract(a.payload_json,'$.upgradeAttemptAt')>?)))`)
 .bind(url,token,now+60000,now,attemptPayload,attemptPayload?await hash(attemptPayload):null,now,now-DAY,forceRevalidate?1:0,+cached.parserUpgrade,cached.row?.payload_hash??null,cached.row?.attempted_at??0,Math.floor((now+9*3600000)/DAY)*DAY-9*3600000,AGM_DETAIL_BUDGET,now-DAY).run();
 if(claimed.meta.changes!==1)throw Error('facts_recheck_busy');
 let response;
 try{
  const headers={Accept:'text/html','Cache-Control':'no-cache'};
  if(cached.conditional){const etag=safeHeader(cached.row.etag,200),modified=safeHeader(cached.row.last_modified,100);if(etag)headers['If-None-Match']=etag;if(modified)headers['If-Modified-Since']=modified;}
  response=await request(url,{maxBytes:1000000,headers});
  if(response.status===304){
   if(!cached.conditional||!headers['If-None-Match']&&!headers['If-Modified-Since'])throw Error('facts_unbound_not_modified');
   // Keep the original 200 response hash/verification time. 304 is only revalidation.
   await store.db.prepare('UPDATE news_agm_article_cache SET checked_at=?,etag=?,last_modified=? WHERE canonical_url=? AND lease_token=?').bind(now,safeHeader(response.headers.get('etag'),200)||cached.row.etag,safeHeader(response.headers.get('last-modified'),100)||cached.row.last_modified,url,token).run();
   return {...cached.payload,cache:'not_modified'};
  }
  if(response.status!==200||!/text\/html/i.test(response.headers.get('content-type')||''))throw Error('facts_source_unavailable');
  const result=await parse(response.text),payload={...(cached.parserUpgrade?{upgradeAttemptAt:now}:cached.payload?.upgradeAttemptAt?{upgradeAttemptAt:cached.payload.upgradeAttemptAt}:{}),format:FORMAT,parser:AGM_ARTICLE_PARSER,item:result.item,proof:result.proof,listingFingerprint:cached.listing||result.listingFingerprint||null};
  const json=JSON.stringify(payload);if(json.length>64000)throw Error('facts_cache_too_large');
  await store.db.prepare('UPDATE news_agm_article_cache SET payload_json=?,payload_hash=?,checked_at=?,etag=?,last_modified=? WHERE canonical_url=? AND lease_token=?').bind(json,await hash(json),now,safeHeader(response.headers.get('etag'),200),safeHeader(response.headers.get('last-modified'),100),url,token).run();
  return {...payload,cache:'fetched'};
 }finally{
  if(response)response.text='';
  await store.db.prepare('UPDATE news_agm_article_cache SET lease_until=0 WHERE canonical_url=? AND lease_token=?').bind(url,token).run();
 }
}
