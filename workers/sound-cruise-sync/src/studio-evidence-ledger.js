// Explicit Account epoch compaction. No clock-based deletion and no UUID high-water inference.
export const EVIDENCE_TABLES = Object.freeze([
 ['pending','account_id'],['receipts','account_id'],['owner_events','account_id'],
 ['identity_operations','account_id'],['recovery_proofs','account_id'],['resolutions','account_id'],
 ['maintenance_receipts','account_id'],['erase_intents','account_id'],['changes','user_id']
]);
export const EVIDENCE_DDL = Object.freeze([
 `CREATE TABLE studio_document_evidence_state (account_id TEXT PRIMARY KEY,epoch INTEGER NOT NULL DEFAULT 1 CHECK(epoch BETWEEN 1 AND 4294967295),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),compacting INTEGER NOT NULL DEFAULT 0 CHECK(compacting IN(0,1)),checkpoint_json TEXT)`,
 ...[...EVIDENCE_TABLES,['chunks','account_id'],['records','user_id'],['enrollments','account_id']].flatMap(([table,key])=>['INSERT','UPDATE','DELETE'].map(op=>`CREATE TRIGGER studio_document_revision_${table}_${op.toLowerCase()} AFTER ${op} ON studio_document_${table} BEGIN INSERT INTO studio_document_evidence_state(account_id,revision) VALUES(${op==='DELETE'?'OLD':'NEW'}.${key},1) ON CONFLICT(account_id) DO UPDATE SET revision=revision+1; END`))
]);
export function evidencePolicy(p){if(p==null)return null;if(Object.keys(p).sort().join('|')!=='maxBytes|maxRows'||!Number.isSafeInteger(p.maxRows)||p.maxRows<16||p.maxRows>4096||!Number.isSafeInteger(p.maxBytes)||p.maxBytes<65536||p.maxBytes>16777216)throw Error('evidence-policy');return Object.freeze({...p});}
// SUM scalar aggregates, never an unbounded JSON row or a list of payloads.
export const EVIDENCE_USAGE_SQL=`SELECT ${EVIDENCE_TABLES.map(([t,k])=>`(SELECT count(*) FROM studio_document_${t} WHERE ${k}=?1)`).concat(["(SELECT count(*) FROM studio_document_enrollments WHERE account_id=?1)"]).join('+')} rows`;
export const EVIDENCE_BYTES_SQL=`SELECT ${[
 ['pending','length(CAST(manifest_json AS BLOB))+length(CAST(binding_json AS BLOB))+length(CAST(document_id AS BLOB))+320'],['receipts','length(CAST(receipt_json AS BLOB))+length(CAST(binding_json AS BLOB))+128'],['owner_events','length(CAST(receipt_json AS BLOB))+length(CAST(binding_json AS BLOB))+320'],['identity_operations','length(CAST(result_json AS BLOB))+128'],['recovery_proofs','length(CAST(result_json AS BLOB))+length(CAST(request_fingerprint AS BLOB))+256'],['resolutions','length(CAST(receipt_json AS BLOB))+192'],['maintenance_receipts','length(CAST(result_json AS BLOB))+128'],['erase_intents','length(CAST(binding_json AS BLOB))+length(CAST(scope_json AS BLOB))+256']
 ].map(([t,n])=>`(SELECT COALESCE(sum(${n}),0) FROM studio_document_${t} WHERE account_id=?1)`).concat(["(SELECT COALESCE(sum(length(CAST(COALESCE(payload_json,'') AS BLOB))+320),0) FROM studio_document_changes WHERE user_id=?1)","(SELECT count(*)*128 FROM studio_document_enrollments WHERE account_id=?1)"]).join('+')} bytes`;
export function epochOperation(id,epoch){return typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)&&id.slice(0,8)===epoch.toString(16).padStart(8,'0');}
export function evidenceEpochGuard(db,account,epoch){return db.prepare("SELECT CASE WHEN (SELECT epoch FROM studio_document_evidence_state WHERE account_id=?1)=?2 OR (?2=1 AND NOT EXISTS(SELECT 1 FROM studio_document_evidence_state WHERE account_id=?1) AND NOT EXISTS(SELECT 1 FROM studio_document_enrollments WHERE account_id=?1)) THEN 1 ELSE json_extract('operation_epoch_changed','$.abort') END").bind(account,epoch);}
export function createEvidenceLedger({policy,authorize,read,pending,receipt,canonical,digest,fail}){
 async function inspect(headers){const c=await authorize(headers,{securityDelete:true});if(!policy)fail('evidence-policy-unapproved');const row=(await read(c,'SELECT epoch,revision,checkpoint_json FROM studio_document_evidence_state WHERE account_id=?',c.binding.accountId))[0];const usage=(await read(c,EVIDENCE_USAGE_SQL,c.binding.accountId))[0],size=(await read(c,EVIDENCE_BYTES_SQL,c.binding.accountId))[0];return{type:'studio-evidence-v1',epoch:row?.epoch??1,revision:row?.revision??0,rows:usage.rows,bytes:size.bytes,maxRows:policy.maxRows,maxBytes:policy.maxBytes,compactionEligibility:'REQUIRES_EXPLICIT_REVALIDATION',checkpoint:row?.checkpoint_json?JSON.parse(row.checkpoint_json):null,automaticPurge:false};}
 async function compact(headers,input){
  if(!policy||!input||Object.keys(input).sort().join('|')!=='expectedEpoch|expectedRevision')fail('compaction-request');
  const c=await authorize(headers,{securityDelete:true});if(c.activationMode==='canary')fail('canary-account-maintenance-hold');
  const account=c.binding.accountId,epoch=c.binding.operationEpoch;
  if(epoch!==input.expectedEpoch||epoch>=4294967295||!Number.isSafeInteger(input.expectedRevision))fail('compaction-epoch');
  const state=(await read(c,'SELECT * FROM studio_document_evidence_state WHERE account_id=?',account))[0];if(!state||state.revision!==input.expectedRevision)fail('compaction-stale');
  // An Account-wide quiescent boundary is required. UNKNOWN is never inferred resolved by age.
  let cursor='',seen=0;
  for(;;){const rows=await read(c,`SELECT p.*,r.binding_json AS receipt_binding,r.receipt_json,h.record_id,h.operation_hash,h.revision AS saved_revision,h.payload_hash,h.deleted_at,z.request_digest AS resolved_digest,z.state AS resolution_state FROM studio_document_pending p LEFT JOIN studio_document_receipts r ON r.account_id=p.account_id AND r.operation_id=p.operation_id LEFT JOIN studio_document_changes h ON h.user_id=p.account_id AND h.operation_id=p.operation_id LEFT JOIN studio_document_resolutions z ON z.account_id=p.account_id AND z.operation_id=p.operation_id WHERE p.account_id=? AND p.operation_id>? ORDER BY p.operation_id LIMIT 32`,account,cursor);if(!rows.length)break;
   for(const p of rows){if(++seen>4096)fail('evidence-budget-hold');const binding=JSON.parse(p.binding_json),m=JSON.parse(p.manifest_json);
    if(binding.accountId!==account||binding.deviceId!==p.device_id||binding.generation!==p.generation||binding.epoch!==p.epoch||p.request_digest!==await digest(canonical({binding,operationId:p.operation_id,documentId:p.document_id,expectedRevision:p.expected_revision,manifest:m})))fail('pending-corrupt');
    if(p.receipt_json){const expected={type:'studio-document-commit-v1',accountId:account,deviceId:p.device_id,epoch:p.epoch,generation:p.generation,documentId:p.document_id,operationId:p.operation_id,requestDigest:p.request_digest,documentDigest:m.digest,revision:p.expected_revision+1,deleted:m.deleted};if(p.receipt_binding!==p.request_digest||p.receipt_json!==canonical(expected)||p.record_id!==p.document_id||p.operation_hash!==p.request_digest||p.saved_revision!==expected.revision||p.payload_hash!==m.digest||(p.deleted_at!==null)!==m.deleted)fail('receipt-corrupt');}
    else if(!p.resolution_state||p.resolved_digest!==p.request_digest)fail('unresolved-operation-hold');
    cursor=p.operation_id;
   }
  }
  const intents=await read(c,'SELECT operation_id FROM studio_document_erase_intents WHERE account_id=? LIMIT 1',account);if(intents.length)fail('erase-intent-hold');
  const result={type:'studio-epoch-checkpoint-v1',accountId:account,previousEpoch:epoch,epoch:epoch+1,observedRevision:state.revision,retiredHistory:true,authorizesNewOperation:false};
  const d=c.epochBase,q=(sql,...v)=>d.prepare(sql).bind(...v);
  const keep=`operation_id IN (SELECT last_operation_id FROM studio_document_records WHERE user_id=?1)`;
  const ss=[evidenceEpochGuard(d,account,epoch),q("SELECT CASE WHEN EXISTS(SELECT 1 FROM studio_document_evidence_state WHERE account_id=? AND revision=? AND compacting=0) THEN 1 ELSE json_extract('compaction_race','$.abort') END",account,state.revision),
   q('UPDATE studio_document_evidence_state SET compacting=1 WHERE account_id=?',account)];
  // Heads (including tombstones) retain their manifest/receipt/change. No local draft is touched.
  ss.push(q(`DELETE FROM studio_document_chunks WHERE account_id=?1 AND NOT (${keep})`,account));
  for(const [table,key] of EVIDENCE_TABLES){
   if(table==='erase_intents')continue;
   const predicate=['pending','receipts','changes','resolutions'].includes(table)?` AND NOT (${keep})`:'';
   ss.push(q(`DELETE FROM studio_document_${table} WHERE ${key}=?1${predicate}`,account));
  }
  ss.push(q('UPDATE studio_document_usage SET operations=(SELECT count(*) FROM studio_document_pending p WHERE account_id=?1 AND NOT EXISTS(SELECT 1 FROM studio_document_resolutions r WHERE r.account_id=p.account_id AND r.operation_id=p.operation_id)),bytes=(SELECT COALESCE(sum(bytes),0) FROM studio_document_chunks WHERE account_id=?1) WHERE account_id=?1',account),q('UPDATE studio_document_evidence_state SET epoch=?,compacting=0,checkpoint_json=? WHERE account_id=?',epoch+1,canonical(result),account),evidenceEpochGuard(d,account,epoch+1));
  await d.batch(ss);return result;
 }
 return Object.freeze({inspect,compact});
}
