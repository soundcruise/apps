import {hash,DAY} from './policy.js';
import {validatedFingerprint} from './fingerprint.js';
import {AGM_ARTICLE_PARSERS} from './agm-article-evidence.js';
import {agmArticleUrl} from './agm-sections.js';
export const AGM_HUMAN_BOOK='agm-human-book-confirmation-1';
export const AGM_BOOK_CHECKS=Object.freeze(['primaryArticleChecked','bookIdentityChecked','publicationAndReleaseDatesChecked','acousticRelevanceChecked','noOriginalTextCopied']);
export function humanAgmBook(f){return f?.kind==='agm_editorial'&&f.articleType==='book_release'&&f.evidence==='agm_human_book_v1';}
export async function agmBookAnchor(store,row,now,pepper){
 if(row.source_id!=='agm'||row.origin==='operator_assisted'||!agmArticleUrl(row.source_url,'news')||row.normalized_url!==row.source_url)return null;
 const cache=await store.db.prepare('SELECT * FROM news_agm_article_cache WHERE canonical_url=?').bind(row.source_url).first();let p;
 try{if(!cache?.payload_json||cache.payload_json.length>64000||await hash(cache.payload_json)!==cache.payload_hash)return null;p=JSON.parse(cache.payload_json);}catch{return null;}
 const i=p.item,q=p.proof;
 if(p.format!=='agm-evidence-cache-1'||!AGM_ARTICLE_PARSERS.includes(p.parser)||!i||i.id!==row.id||i.sourceId!=='agm'||i.sourceUrl!==row.source_url||i.normalizedUrl!==row.source_url||i.publishedAt!==row.published_at||i.titleFingerprint!==row.title_fingerprint||!await validatedFingerprint(row.title_fingerprint,pepper)||q?.sourceId!=='agm'||q.sourceUrl!==row.source_url||q.parserVersion!==p.parser||q.extractionMethod!=='explicit_agm_article_fields'||!Number.isSafeInteger(q.verifiedAt)||q.verifiedAt>now||q.verifiedAt<now-90*DAY||!/^[a-f0-9]{64}$/.test(q.responseHash||''))return null;
 return {cache,proof:q};
}
// The human receipt retains its original acquisition anchor. A later ordinary
// cache refresh cannot silently revoke an otherwise unchanged human confirmation.
export async function agmHumanBookProofValid(store,row,now){
 let f,fields;try{f=JSON.parse(row.product_facts);fields=JSON.parse(row.facts_provenance);}catch{return false;}
 if(!humanAgmBook(f)||row.source_id!=='agm'||f.articleUrl!==row.source_url||!agmArticleUrl(row.source_url,'news')||!Array.isArray(fields))return false;
 const p=fields[0],q=p?.articleProof;
 if(p?.parserVersion!==AGM_HUMAN_BOOK||p.extractionMethod!=='human_agm_book_fields'||p.verificationMethod!=='human_primary_confirmation'||p.sourceId!=='agm'||p.sourceUrl!==row.source_url||p.publishedAt!==row.published_at||!Number.isSafeInteger(p.verifiedAt)||p.verifiedAt>now||!/^[a-f0-9]{64}$/.test(p.cachePayloadHash||'')||!/^[a-f0-9]{64}$/.test(p.verifierHash||'')||!AGM_BOOK_CHECKS.every(k=>p.checks?.[k]===true)||q?.sourceId!=='agm'||q.sourceUrl!==row.source_url||!AGM_ARTICLE_PARSERS.includes(q.parserVersion)||q.extractionMethod!=='explicit_agm_article_fields'||!Number.isSafeInteger(q.verifiedAt)||q.verifiedAt>p.verifiedAt||!/^[a-f0-9]{64}$/.test(q.responseHash||''))return false;
 const receipt=await store.db.prepare("SELECT * FROM news_facts_rechecks WHERE request_id=? AND candidate_id=? AND outcome='agm_book_facts_confirmed'").bind(p.confirmationId,row.id).first();
 if(!receipt||receipt.checked_at!==p.verifiedAt||receipt.request_payload_hash!==p.confirmationHash||receipt.provenance_json!==row.facts_provenance)return false;
 let patch;try{patch=JSON.parse(receipt.patch_json);}catch{return false;}
 return ['product_facts','category','event_type','label','topic_key','event_ends_at'].every(k=>patch[k]===row[k])&&[...Object.keys(f),'event_type'].every(k=>fields.some(x=>x.factField===k&&JSON.stringify({...x,factField:''})===JSON.stringify({...p,factField:''})));
}
