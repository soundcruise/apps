import {morrisConfirmedFacts,morrisNoticeLabel,MORRIS_FACT_CHECKS} from './morris-editorial-policy.js';
import {morrisReviewEvidence} from './morris-collector.js';
import {morrisPermissionValid,MORRIS_PERMISSION} from './morris-policy.js';
import {candidateSnapshot,canonical,reviewDetail} from './operator-review.js';
import {publicationValidation} from './decision-policy.js';
import {eventEndsAt} from './event.js';
import {hash} from './policy.js';
// Human primary-source fact verification is an operational correction, not a
// publication verdict. This never writes the Decision Ledger, feedback or Shadow.
export async function confirmMorrisFacts(store,input,now,registry,pepper,actor){
 if(actor?.type!=='human_operator'||typeof actor.id!=='string')throw Error('operator_identity_required');
 if(!input||Object.keys(input).some(k=>!['id','revision','snapshot','requestId','facts','checks'].includes(k))||!/^[-a-zA-Z0-9_]{1,128}$/.test(input.id||'')||!/^[-a-zA-Z0-9_]{16,100}$/.test(input.requestId||'')||!/^[a-f0-9]{64}$/.test(input.snapshot||'')||!Number.isSafeInteger(input.revision)||input.revision<0||!input.checks||Object.keys(input.checks).length!==MORRIS_FACT_CHECKS.length||!MORRIS_FACT_CHECKS.every(k=>input.checks[k]===true))throw Error('facts_confirmation_invalid');
 const payloadHash=await hash(canonical({input,actor})),saved=await store.db.prepare('SELECT * FROM news_facts_rechecks WHERE request_id=?').bind(input.requestId).first();
 if(saved){if(saved.request_payload_hash!==payloadHash)throw Error('idempotency_payload_changed');return {id:saved.candidate_id,replayed:true,outcome:saved.outcome};}
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first();
 if(!row)throw Error('candidate_not_found');
 if(!['pending','reopened'].includes(row.review_status))throw Error('already_decided');
 if(row.review_revision!==input.revision||await candidateSnapshot(row)!==input.snapshot)throw Error('candidate_changed');
 const source=registry.find(s=>s.id===row.source_id);
 if(row.source_id!=='morris'||!morrisPermissionValid(source))throw Error('facts_source_gate');
 const facts=morrisConfirmedFacts(input.facts,row.source_url),label=morrisNoticeLabel(facts,'morris_notice');
 if(!facts||!label||facts.releaseDate&&Date.parse(facts.releaseDate+'T00:00:00+09:00')>now)throw Error('facts_confirmation_invalid');
 const listing=await morrisReviewEvidence(store,row,now);if(!listing)throw Error('facts_provenance_invalid');
 const proof={verificationMethod:'human_primary_confirmation',sourceId:'morris',sourceUrl:row.source_url,publishedAt:row.published_at,permissionRef:MORRIS_PERMISSION,verifiedAt:now,confirmationId:input.requestId,confirmationHash:payloadHash,verifierHash:await hash(actor.id),checks:input.checks,listingResponseHash:listing.listing.response_hash,listingVerifiedAt:listing.listing.attempted_at};
 const provenance=JSON.stringify(Object.keys(facts).map(factField=>({...proof,factField}))),patch={product_facts:JSON.stringify(facts),label,category:facts.category,event_type:'morris_notice',topic_key:row.topic_key,event_ends_at:eventEndsAt(facts)};
 const validation=await publicationValidation(store,{...row,...patch,facts_provenance:provenance},now,registry,pepper);
 // The confirmation record does not exist yet. Only that single provenance
 // check may be provisional; all ordinary date, duplicate and policy gates run.
 if(validation.errors.some(e=>e!=='facts_provenance_invalid'))throw Error(validation.errors.find(e=>e!=='facts_provenance_invalid'));
 const columns=Object.keys(row);await store.db.prepare(`INSERT INTO news_facts_rechecks(request_id,request_payload_hash,candidate_id,checked_at,outcome,provenance_json,patch_json)
 SELECT ?,?,?,?,'morris_primary_facts_confirmed',?,? WHERE EXISTS(SELECT 1 FROM candidate_items WHERE ${columns.map(k=>k+' IS ?').join(' AND ')} AND review_status IN ('pending','reopened'))
 AND EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND collection_enabled=1 AND publication_enabled=1)
 AND EXISTS(SELECT 1 FROM source_state WHERE source_id='morris' AND disabled=0 AND takedown=0 AND publication_blocked=0 AND backoff_until<=?)
 AND EXISTS(SELECT 1 FROM source_health WHERE source_id='morris' AND status='healthy' AND last_successful_run_at=?)
 AND EXISTS(SELECT 1 FROM news_morris_acquisition WHERE request_key=? AND outcome='verified' AND response_hash=? AND entries_json IS ? AND proof_json IS ?)
 AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=?)`)
 .bind(input.requestId,payloadHash,row.id,now,provenance,JSON.stringify(patch),...columns.map(k=>row[k]),now,validation.healthSuccessfulAt,listing.listing.request_key,listing.listing.response_hash,listing.listing.entries_json,listing.listing.proof_json,row.id).run();
 if(!await store.db.prepare('SELECT request_id FROM news_facts_rechecks WHERE request_id=? AND request_payload_hash=?').bind(input.requestId,payloadHash).first())throw Error('candidate_changed');
 const detail=await reviewDetail(store,row.id,now,registry,pepper);
 return {id:row.id,outcome:'morris_primary_facts_confirmed',validation:detail.validation,publisherRequests:0};
}
