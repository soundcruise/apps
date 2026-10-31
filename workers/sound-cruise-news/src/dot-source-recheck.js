import {findDotReceipt} from './dot-receipt.js';
import {dotSnapshot} from './dot-human-confirmation.js';
import {candidateSnapshot} from './operator-review.js';
import {assistedUrl} from './assisted-facts.js';
import {manualFactsPolicy} from './manual-facts-policy.js';
import {hash} from './policy.js';

// This records a human observation only; neither permission nor approval is inferred.
export async function saveDotSourceRecheck(store,reader,input,actor,now,registry=[]){
 if(actor?.type!=='human_operator'||!/^[a-zA-Z0-9:_@.\-]{1,200}$/.test(actor.id||''))throw Error('operator_denied');
 if(!input||Object.keys(input).sort().join(',')!=='checks,id,observation,requestId,revision,snapshot'||!/^[a-zA-Z0-9_-]{1,128}$/.test(input.id||'')||!/^[a-f0-9]{64}$/.test(input.snapshot||'')||!Number.isSafeInteger(input.revision)||input.revision<0||!/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId||'')||typeof input.observation!=='string'||input.observation.trim()!==input.observation||input.observation.length<10||input.observation.length>500||/[\x00-\x1f<>]/.test(input.observation)||!input.checks||Object.keys(input.checks).sort().join(',')!=='facts,original,rights'||Object.values(input.checks).some(v=>v!==true))throw Error('operator_query_invalid');
 const row=await store.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(input.id).first(),receipt=await findDotReceipt(store,input.id);
 if(!row||!receipt)throw Error('candidate_not_found');
 if(!(row.source_id==='yamaha'?assistedUrl(row.source_url):manualFactsPolicy(registry.find(s=>s.id===row.source_id),row.source_url,now))||!['pending','reopened'].includes(row.review_status))throw Error('operator_source_gate');
 if(row.review_revision!==input.revision||await candidateSnapshot(row)!==input.snapshot)throw Error('candidate_changed');
 if(!reader)throw Error('operator_unavailable');
 const current=await reader.detail(receipt.dot_candidate_id),snap=await dotSnapshot(current,receipt.dot_candidate_id);
 if(snap.digest!==receipt.candidate_digest||snap.revision!==receipt.staging_revision||current.deliveryKeyHash!==receipt.delivery_key_hash)throw Error('candidate_changed');
 const prior=await store.db.prepare('SELECT checked_at FROM news_dot_publication_checks WHERE request_id=?').bind(input.requestId).first();const checkedAt=prior?.checked_at??now;if(!Number.isSafeInteger(checkedAt)||checkedAt>now)throw Error('operator_query_invalid');
 const evidence=JSON.stringify({checkedAt,id:input.id,snapshot:input.snapshot,revision:input.revision,receipt:receipt.request_id,digest:snap.digest,stagingRevision:snap.revision,deliveryKeyHash:receipt.delivery_key_hash,url:row.source_url,actor:actor.id,observation:input.observation,checks:{facts:true,original:true,rights:true}});
 const digest=await hash(evidence);
 const keys=Object.keys(row).sort();if(keys.some(k=>!/^[_a-z]+$/.test(k)))throw Error('candidate_schema_invalid');
 await store.db.prepare(`INSERT OR IGNORE INTO news_dot_publication_checks(request_id,candidate_id,candidate_snapshot,candidate_revision,receipt_id,dot_candidate_id,candidate_digest,staging_revision,delivery_key_hash,source_url,actor_id,checked_at,observation,evidence_hash) SELECT ?,c.id,?,?,?,?,?,?,?,?,?,?,?,? FROM candidate_items c WHERE c.id=? AND ${keys.map(k=>`c."${k}" IS ?`).join(' AND ')} AND EXISTS(SELECT 1 FROM news_dot_admission_receipts r WHERE r.request_id=? AND r.candidate_id=c.id AND r.candidate_digest=? AND r.staging_revision=? AND r.delivery_key_hash=?)`).bind(input.requestId,input.snapshot,input.revision,receipt.request_id,receipt.dot_candidate_id,snap.digest,snap.revision,receipt.delivery_key_hash,row.source_url,actor.id,checkedAt,input.observation,digest,row.id,...keys.map(k=>row[k]),receipt.request_id,snap.digest,snap.revision,receipt.delivery_key_hash).run();
 const saved=await store.db.prepare('SELECT evidence_hash,checked_at FROM news_dot_publication_checks WHERE request_id=?').bind(input.requestId).first();
 if(!saved)throw Error('candidate_changed');if(saved.evidence_hash!==digest)throw Error('idempotency_payload_changed');
 return {saved:true,checkedAt:saved.checked_at,publication:'HOLD'};
}
