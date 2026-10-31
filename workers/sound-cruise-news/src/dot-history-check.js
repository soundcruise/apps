import {candidateSnapshot} from './operator-review.js';
import {findDotReceipt} from './dot-receipt.js';
import {hash} from './policy.js';
// A bounded human attestation of a candidate-specific review, never an override
// for a known decision or an unresolved orphan.
export async function saveDotHistoryCheck(store,input,actor,now){
 if(actor?.type!=='human_operator'||!/^[a-zA-Z0-9:_@.\-]{1,200}$/.test(actor.id||''))throw Error('operator_denied');
 if(!input||Object.keys(input).sort().join(',')!=='basis,checks,evidenceRef,id,requestId,revision,snapshot'||!/^[a-zA-Z0-9_-]{1,128}$/.test(input.id||'')||!/^[a-f0-9]{64}$/.test(input.snapshot||'')||!Number.isSafeInteger(input.revision)||input.revision<0||!/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId||'')||typeof input.basis!=='string'||input.basis.trim()!==input.basis||input.basis.length<20||input.basis.length>500||/[\x00-\x1f<>]/.test(input.basis)||typeof input.evidenceRef!=='string'||input.evidenceRef.trim()!==input.evidenceRef||input.evidenceRef.length<8||input.evidenceRef.length>300||/[\x00-\x1f<>]/.test(input.evidenceRef)||!input.checks||Object.keys(input.checks).sort().join(',')!=='archives,identity,scope'||Object.values(input.checks).some(x=>x!==true))throw Error('operator_query_invalid');
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first(),receipt=await findDotReceipt(store,input.id);if(!row||!receipt)throw Error('candidate_not_found');
 if(!['pending','reopened'].includes(row.review_status)||row.review_revision!==input.revision||await candidateSnapshot(row)!==input.snapshot)throw Error('candidate_changed');
 const prior=await store.db.prepare('SELECT checked_at FROM news_dot_history_checks WHERE request_id=?').bind(input.requestId).first(),checkedAt=prior?.checked_at??now;if(!Number.isSafeInteger(checkedAt)||checkedAt>now)throw Error('operator_query_invalid');
 const evidence=JSON.stringify({checkedAt,id:input.id,snapshot:input.snapshot,revision:input.revision,receipt:receipt.request_id,actor:actor.id,basis:input.basis,evidenceRef:input.evidenceRef,checks:{archives:true,identity:true,scope:true}}),digest=await hash(evidence);
 const keys=Object.keys(row).sort();if(keys.some(k=>!/^[_a-z]+$/.test(k)))throw Error('candidate_schema_invalid');
 await store.db.prepare(`INSERT OR IGNORE INTO news_dot_history_checks(request_id,candidate_id,candidate_snapshot,candidate_revision,receipt_id,actor_id,checked_at,basis,evidence_ref,evidence_hash) SELECT ?,c.id,?,?,?,?,?,?,?,? FROM candidate_items c WHERE c.id=? AND ${keys.map(k=>`c."${k}" IS ?`).join(' AND ')} AND EXISTS(SELECT 1 FROM news_dot_admission_receipts r WHERE r.request_id=? AND r.candidate_id=c.id)`).bind(input.requestId,input.snapshot,input.revision,receipt.request_id,actor.id,checkedAt,input.basis,input.evidenceRef,digest,row.id,...keys.map(k=>row[k]),receipt.request_id).run();
 const saved=await store.db.prepare('SELECT evidence_hash,checked_at FROM news_dot_history_checks WHERE request_id=?').bind(input.requestId).first();if(!saved)throw Error('candidate_changed');if(saved.evidence_hash!==digest)throw Error('idempotency_payload_changed');return {saved:true,checkedAt:saved.checked_at};
}
