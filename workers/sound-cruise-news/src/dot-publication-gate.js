import {findDotReceipt} from './dot-receipt.js';
import {dotSnapshot} from './dot-human-confirmation.js';
import {publicationValidation} from './decision-policy.js';
import {readDotNewsSnapshot} from './dot-news-snapshot.js';
import {hash,DAY} from './policy.js';
import {manualFactsPolicy} from './manual-facts-policy.js';
import {candidateSnapshot} from './operator-review.js';

// Read-only diagnostic. It cannot prove source freshness or atomically lock
// Firestore and D1, so it never grants publication authority.
export async function dotPublicationGate(store,reader,id,now,registry,pepper){
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(id).first();if(!row)throw Error('candidate_not_found');
 const receipt=await findDotReceipt(store,id);if(!receipt)throw Error('candidate_not_found');
 const checks={candidate:'UNCERTAIN',confirmation:'UNCERTAIN',formalFacts:'UNCERTAIN',sourcePolicy:'UNCERTAIN',duplicate:'UNCERTAIN',history:'UNCERTAIN',externalSource:'UNCERTAIN',atomicity:'UNRESOLVED'},blockers=[];
 const confirmation=await store.db.prepare('SELECT * FROM news_dot_confirmations WHERE request_id=?').bind(receipt.confirmation_id).first();
 if(confirmation){const digest=await hash(JSON.stringify({candidateId:confirmation.candidate_id,digest:confirmation.candidate_digest,revision:confirmation.staging_revision,actor:confirmation.actor_id,evidence:confirmation.evidence_json}));checks.confirmation=confirmation.outcome==='confirmed'&&confirmation.candidate_id===receipt.dot_candidate_id&&confirmation.candidate_digest===receipt.candidate_digest&&confirmation.staging_revision===receipt.staging_revision&&confirmation.actor_id===receipt.actor_id&&confirmation.evidence_hash===receipt.evidence_hash&&digest===confirmation.evidence_hash&&confirmation.confirmed_at<=now&&now-confirmation.confirmed_at<DAY?'MATCH':'INVALID';}
 if(checks.confirmation!=='MATCH')blockers.push('confirmation_missing_changed_or_stale');
 let current=null;try{if(reader){current=await reader.detail(receipt.dot_candidate_id);const snapshot=await dotSnapshot(current,receipt.dot_candidate_id);checks.candidate=snapshot.digest===receipt.candidate_digest&&snapshot.revision===receipt.staging_revision&&current.deliveryKeyHash===receipt.delivery_key_hash?'MATCH':'CHANGED';}}catch{}
 if(checks.candidate!=='MATCH')blockers.push(checks.candidate==='CHANGED'?'staging_changed':'staging_unavailable');
 const validation=await publicationValidation(store,row,now,registry,pepper);checks.formalFacts=validation.errors.some(e=>/facts_|label_|date_|expired_|event_/.test(e))?'HOLD':'PASS';checks.sourcePolicy=validation.errors.some(e=>['operator_source_gate','source_url_invalid','publication_policy_rejected'].includes(e))||(row.source_id!=='yamaha'&&!manualFactsPolicy(registry.find(s=>s.id===row.source_id),row.source_url,now))?'HOLD':'PASS';
 if(!validation.valid)blockers.push(...validation.errors);if(!['pending','reopened'].includes(row.review_status))blockers.push('candidate_not_pending');
 let scopeCoverage=null;
 if(validation.errors.includes('duplicate'))checks.duplicate='SAME';
 if(current?.candidate){const snapshot=await readDotNewsSnapshot(store.db,current.candidate);if(snapshot){scopeCoverage=Object.fromEntries(Object.entries(snapshot).map(([scope,part])=>[scope,part.complete?'RETAINED_SEARCH_COMPLETE':'INCOMPLETE']));if(Object.values(snapshot).every(s=>s.complete)){const matches=Object.entries(snapshot).flatMap(([scope,part])=>part.items.filter(x=>!(scope==='pending'&&x.candidate_id===row.id)));checks.history='RETAINED_SEARCH_COMPLETE';if(checks.duplicate!=='SAME')checks.duplicate=matches.length?'RELATED_OR_HISTORY':'UNCERTAIN';if(matches.length)blockers.push('related_or_retained_history');}else blockers.push('history_read_incomplete');}else blockers.push('history_read_incomplete');}else blockers.push('history_read_incomplete');
 // Fresh, explicit human observation is distinct from the admission-time evidence.
 let sourceCheck=null;try{sourceCheck=await store.db.prepare('SELECT * FROM news_dot_publication_checks WHERE candidate_id=? ORDER BY checked_at DESC,request_id DESC LIMIT 1').bind(id).first();}catch(e){if(!/no such table:\s*(?:main\.)?news_dot_publication_checks\b/i.test(String(e?.message)))throw e;}
 if(sourceCheck){const evidence=JSON.stringify({checkedAt:sourceCheck.checked_at,id:row.id,snapshot:sourceCheck.candidate_snapshot,revision:sourceCheck.candidate_revision,receipt:sourceCheck.receipt_id,digest:sourceCheck.candidate_digest,stagingRevision:sourceCheck.staging_revision,deliveryKeyHash:sourceCheck.delivery_key_hash,url:sourceCheck.source_url,actor:sourceCheck.actor_id,observation:sourceCheck.observation,checks:{facts:true,original:true,rights:true}});if(sourceCheck.evidence_hash===await hash(evidence)&&sourceCheck.candidate_snapshot===await candidateSnapshot(row)&&sourceCheck.candidate_revision===row.review_revision&&sourceCheck.receipt_id===receipt.request_id&&sourceCheck.dot_candidate_id===receipt.dot_candidate_id&&sourceCheck.candidate_digest===receipt.candidate_digest&&sourceCheck.staging_revision===receipt.staging_revision&&sourceCheck.delivery_key_hash===receipt.delivery_key_hash&&sourceCheck.source_url===row.source_url&&sourceCheck.checked_at>=receipt.created_at&&sourceCheck.checked_at<=now&&now-sourceCheck.checked_at<300000)checks.externalSource='HUMAN_CONFIRMED';}
 if(checks.externalSource!=='HUMAN_CONFIRMED')blockers.push('external_evidence_recheck_required');
 // Retention expiry, aliases and orphan histories are not fully reconstructible.
 blockers.push('history_retention_incomplete','cross_system_atomicity_unresolved');
 return {status:'HOLD',candidateId:id,checkedAt:now,checks,scopeCoverage,blockers:[...new Set(blockers)]};
}
