import {canonicalBaseEvidence,canonicalMismatchAllowed,canonicalHumanFacts,canonicalHumanLabel,canonicalEvent,CANONICAL_CHECKS,CANONICAL_TYPES,CANONICAL_ACTIONS} from './canonical-evidence.js';
import {publicationValidation,parseFacts} from './decision-policy.js';
import {candidateSnapshot,canonical} from './operator-review.js';
import {publicationHealthSQL} from './source-health.js';
import {hash} from './policy.js';
export async function canonicalReview(store,row,validation,source,now){
 if(!['pending','reopened'].includes(row.review_status)||validation.valid||validation.errors.some(e=>!['facts_incomplete','facts_provenance_invalid'].includes(e)))return null;
 const base=await canonicalBaseEvidence(store,row,source,now);if(!base)return null;
 return {adoptedUrl:row.source_url,evidenceAt:base.proof.verifiedAt,responseHash:base.proof.responseHash,types:CANONICAL_TYPES,actions:CANONICAL_ACTIONS};
}
export async function confirmCanonicalFacts(store,input,now,registry,pepper,actor){
 if(actor?.type!=='human_operator'||!/^access:[a-zA-Z0-9_-]{1,128}$/.test(actor.id||''))throw Error('operator_identity_required');
 if(!input||Object.keys(input).some(k=>!['id','revision','snapshot','requestId','originalCanonical','reason','facts','checks'].includes(k))||!/^[a-zA-Z0-9_-]{1,128}$/.test(input.id||'')||!Number.isSafeInteger(input.revision)||input.revision<0||!/^[a-f0-9]{64}$/.test(input.snapshot||'')||!/^[-a-zA-Z0-9_]{16,100}$/.test(input.requestId||'')||input.reason!=='same_article_stale_path'||!input.checks||Object.keys(input.checks).length!==CANONICAL_CHECKS.length||CANONICAL_CHECKS.some(k=>input.checks[k]!==true))throw Error('facts_confirmation_invalid');
 const payloadHash=await hash(canonical({input,actor})),saved=await store.db.prepare('SELECT * FROM news_facts_rechecks WHERE request_id=?').bind(input.requestId).first();
 if(saved){if(saved.request_payload_hash!==payloadHash)throw Error('idempotency_payload_changed');return {id:saved.candidate_id,outcome:saved.outcome,replayed:true,publisherRequests:0};}
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first();if(!row)throw Error('candidate_not_found');
 if(!['pending','reopened'].includes(row.review_status)||row.origin==='legacy_fixture_backfill')throw Error('already_decided');
 if(row.review_revision!==input.revision||await candidateSnapshot(row)!==input.snapshot)throw Error('candidate_changed');
 const source=registry.find(s=>s.id===row.source_id);if(!source||!canonicalMismatchAllowed(source,row.source_url,input.originalCanonical))throw Error('facts_canonical_not_same_article');
 const before=await publicationValidation(store,row,now,registry,pepper);if(before.valid)return {id:row.id,outcome:'facts_already_complete',publisherRequests:0};
 const base=await canonicalBaseEvidence(store,row,source,now);if(!base)throw Error('facts_canonical_evidence_required');
 const facts=canonicalHumanFacts(input.facts,row),old=parseFacts(row);if(!facts)throw Error('facts_confirmation_invalid');
 const norm=s=>typeof s==='string'?s.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase():s;
 if(old&&['brand','product','productType'].some(k=>old[k]&&norm(old[k])!==norm(facts[k])))throw Error('facts_identity_changed');
 if(Array.isArray(old?.models)&&old.models.length&&JSON.stringify(old.models.map(norm).sort())!==JSON.stringify(facts.models.map(norm).sort()))throw Error('facts_identity_changed');
 const label=canonicalHumanLabel(facts,canonicalEvent(facts)),proof=JSON.stringify([{method:'human_canonical_confirmation_v1',confirmationId:input.requestId,confirmationHash:payloadHash,sourceId:row.source_id,publishedAt:row.published_at,adoptedUrl:row.source_url,originalCanonical:input.originalCanonical,reason:input.reason,targetObservation:'not_found_page',observationMethod:'human_browser_confirmation',actorType:actor.type,actorId:actor.id,confirmedAt:now,checks:input.checks,baseAcquisition:{key:base.cache.source_id,verifiedAt:base.proof.verifiedAt,responseHash:base.proof.responseHash,proofHash:await hash(base.cache.proof_json),httpStatus:200}}]);
 const patch={product_facts:JSON.stringify(facts),label,category:facts.category,event_type:canonicalEvent(facts),topic_key:row.topic_key,event_ends_at:null};
 const validation=await publicationValidation(store,{...row,...patch,facts_provenance:proof},now,registry,pepper);
 // The receipt does not exist until the atomic insertion. Only that missing
 // human receipt is provisional; all ordinary policy/facts/duplicate checks run.
 if(validation.errors.some(e=>e!=='facts_provenance_invalid'))throw Error(validation.errors.find(e=>e!=='facts_provenance_invalid'));
 const columns=Object.keys(row);
 await store.db.prepare(`INSERT INTO news_facts_rechecks(request_id,request_payload_hash,candidate_id,checked_at,outcome,provenance_json,patch_json)
 SELECT ?,?,?,?,'canonical_primary_facts_confirmed',?,? WHERE EXISTS(SELECT 1 FROM candidate_items WHERE ${columns.map(k=>k+' IS ?').join(' AND ')} AND review_status IN ('pending','reopened'))
 AND EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND collection_enabled=1 AND publication_enabled=1)
 AND EXISTS(SELECT 1 FROM source_state WHERE source_id=? AND disabled=0 AND publication_blocked=0 AND takedown=0 AND backoff_until<=?)
 AND EXISTS(SELECT 1 FROM source_health WHERE source_id=? AND ${publicationHealthSQL} AND last_successful_run_at=?)
 AND EXISTS(SELECT 1 FROM news_facts_sources WHERE source_id=? AND checked_at=? AND proof_json IS ? AND outcome=? AND lease_until<=?)
 AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=?)`)
 .bind(input.requestId,payloadHash,row.id,now,proof,JSON.stringify(patch),...columns.map(k=>row[k]),row.source_id,now,row.source_id,validation.healthSuccessfulAt,base.cache.source_id,base.cache.checked_at,base.cache.proof_json,base.cache.outcome,now,row.id).run();
 if(!await store.db.prepare('SELECT request_id FROM news_facts_rechecks WHERE request_id=? AND request_payload_hash=?').bind(input.requestId,payloadHash).first())throw Error('candidate_changed');
 const current=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(row.id).first();
 return {id:row.id,outcome:'canonical_primary_facts_confirmed',publisherRequests:0,validation:await publicationValidation(store,current,now,registry,pepper)};
}
