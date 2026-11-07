import {AGM_BOOK_CHECKS,AGM_HUMAN_BOOK,agmBookAnchor} from './agm-human-evidence.js';
import {validBook} from './agm-book-evidence.js';
import {agmArticleLabel,factName} from './agm-article-label.js';
import {candidateSnapshot,canonical,reviewDetail} from './operator-review.js';
import {publicationValidation} from './decision-policy.js';
import {publicationHealthSQL} from './source-health.js';
import {hash} from './policy.js';
export {AGM_BOOK_CHECKS};
export function confirmedAgmBook(input,url){
 if(!input||Object.keys(input).some(k=>!['bookTitle','author','releaseDate','publisher'].includes(k))||!factName(input.bookTitle)||!factName(input.author)||input.publisher!==undefined&&!factName(input.publisher))return null;
 const facts={kind:'agm_editorial',section:'news',articleType:'book_release',category:'media_other',articleUrl:url,evidence:'agm_human_book_v1',relevance:'acoustic_guitar',...input,bookEvidence:{basis:'human_primary_book_release',subject:'named_book'}};
 return validBook(facts)?facts:null;
}
export async function confirmAgmBookFacts(store,input,now,registry,pepper,actor){
 if(actor?.type!=='human_operator'||typeof actor.id!=='string'||!actor.id)throw Error('operator_identity_required');
 if(!input||Object.keys(input).some(k=>!['id','revision','snapshot','requestId','facts','checks'].includes(k))||!/^[-a-zA-Z0-9_]{1,128}$/.test(input.id||'')||!/^[-a-zA-Z0-9_]{16,100}$/.test(input.requestId||'')||!/^[a-f0-9]{64}$/.test(input.snapshot||'')||!Number.isSafeInteger(input.revision)||input.revision<0||!input.checks||Object.keys(input.checks).length!==AGM_BOOK_CHECKS.length||!AGM_BOOK_CHECKS.every(k=>input.checks[k]===true))throw Error('facts_confirmation_invalid');
 const payloadHash=await hash(canonical({input,actor})),saved=await store.db.prepare('SELECT * FROM news_facts_rechecks WHERE request_id=?').bind(input.requestId).first();
 if(saved){if(saved.request_payload_hash!==payloadHash)throw Error('idempotency_payload_changed');return {id:saved.candidate_id,replayed:true,outcome:saved.outcome};}
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first();if(!row)throw Error('candidate_not_found');
 if(!['pending','reopened'].includes(row.review_status))throw Error('already_decided');
 if(row.review_revision!==input.revision||await candidateSnapshot(row)!==input.snapshot)throw Error('candidate_changed');
 if(row.source_id!=='agm'||row.product_facts&&row.product_facts!=='null')throw Error('facts_confirmation_invalid');
 const facts=confirmedAgmBook(input.facts,row.source_url),label=facts&&agmArticleLabel(facts,'agm_editorial');if(!facts||!label)throw Error('facts_confirmation_invalid');
 const anchor=await agmBookAnchor(store,row,now,pepper);if(!anchor)throw Error('facts_provenance_invalid');
 const p={verificationMethod:'human_primary_confirmation',sourceId:'agm',sourceUrl:row.source_url,publishedAt:row.published_at,verifiedAt:now,parserVersion:AGM_HUMAN_BOOK,extractionMethod:'human_agm_book_fields',confirmationId:input.requestId,confirmationHash:payloadHash,verifierHash:await hash(actor.id),checks:input.checks,cachePayloadHash:anchor.cache.payload_hash,articleProof:anchor.proof};
 const provenance=JSON.stringify([...Object.keys(facts),'event_type'].map(factField=>({...p,factField}))),patch={product_facts:JSON.stringify(facts),category:'media_other',event_type:'agm_editorial',label,topic_key:row.topic_key,event_ends_at:null};
 const v=await publicationValidation(store,{...row,...patch,facts_provenance:provenance},now,registry,pepper);if(v.errors.some(e=>e!=='facts_provenance_invalid'))throw Error(v.errors.find(e=>e!=='facts_provenance_invalid'));
 const cols=Object.keys(row);await store.db.prepare(`INSERT INTO news_facts_rechecks(request_id,request_payload_hash,candidate_id,checked_at,outcome,provenance_json,patch_json)
 SELECT ?,?,?,?,'agm_book_facts_confirmed',?,? WHERE EXISTS(SELECT 1 FROM candidate_items WHERE ${cols.map(k=>k+' IS ?').join(' AND ')} AND review_status IN ('pending','reopened'))
 AND EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND collection_enabled=1 AND publication_enabled=1)
 AND EXISTS(SELECT 1 FROM source_state WHERE source_id='agm' AND disabled=0 AND takedown=0 AND publication_blocked=0 AND backoff_until<=?)
 AND EXISTS(SELECT 1 FROM source_health WHERE source_id='agm' AND ${publicationHealthSQL} AND last_successful_run_at=?)
 AND EXISTS(SELECT 1 FROM news_agm_article_cache WHERE canonical_url=? AND payload_json IS ? AND payload_hash=? AND lease_until<=?)
 AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=?)`).bind(input.requestId,payloadHash,row.id,now,provenance,JSON.stringify(patch),...cols.map(k=>row[k]),now,v.healthSuccessfulAt,row.source_url,anchor.cache.payload_json,anchor.cache.payload_hash,now,row.id).run();
 const committed=await store.db.prepare('SELECT request_id FROM news_facts_rechecks WHERE request_id=? AND request_payload_hash=?').bind(input.requestId,payloadHash).first();if(!committed)throw Error('candidate_changed');
 return {id:row.id,outcome:'agm_book_facts_confirmed',validation:(await reviewDetail(store,row.id,now,registry,pepper)).validation,publisherRequests:0};
}
