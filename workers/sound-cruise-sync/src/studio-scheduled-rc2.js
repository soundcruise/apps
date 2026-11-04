import {studioCanonical,studioDigest} from '../../../apps/cruise-studio/js/cloud/document-codec.mjs';
// Candidate-only transport around the byte-pinned v137 Scheduled handler. Shared
// schema and HTTP writer SQL are unchanged. Unknown schemas still HOLD globally.
import {inspectStudioRelease,STUDIO_SCHEMA_SQL,STUDIO_JOURNAL_SQL,releaseAssertion,studioReleaseHash} from './studio-release-schema.js';
const knownAccount=a=>`(EXISTS(SELECT 1 FROM studio_document_enrollments e WHERE e.account_id=${a}) OR EXISTS(SELECT 1 FROM studio_document_pending p WHERE p.account_id=${a}))`;
const verified=p=>`EXISTS(SELECT 1 FROM json_each(?) v WHERE v.value=json_array(${p}.account_id,${p}.operation_id,${p}.device_id,${p}.generation,${p}.recovery_version,${p}.request_fingerprint,${p}.result_json,${p}.proof_hash))`;
const captured=(o,r)=>`EXISTS(SELECT 1 FROM studio_document_recovery_proofs p WHERE p.account_id=${o}.account_id AND p.operation_id=${o}.operation_id AND p.device_id=${o}.target_id AND p.request_fingerprint=${o}.request_fingerprint AND p.result_json=${o}.result_json AND ${verified('p')} ${r?`AND p.generation=${r}.expected_account_generation+1 AND p.recovery_version=${r}.expected_recovery_version+1 AND p.device_id=${r}.next_account_device_id`:''})`;
const unresolved=o=>`${o}.kind='recovery' AND ${knownAccount(o+'.account_id')} AND NOT ${captured(o,null)}`;
export async function studioScheduledDatabase(db){
 const exists=await db.prepare("SELECT count(*) n FROM sqlite_master WHERE name GLOB 'studio_document_*'").first();if(!exists.n)return{allowed:true,db,status:'NO_STUDIO_SCHEMA'};
 try{await inspectStudioRelease(db);}catch{return{allowed:false,status:'HOLD_PARTIAL_OR_UNKNOWN_STUDIO_SCHEMA'};}
 const schema=(await db.prepare(STUDIO_SCHEMA_SQL).first()).encoded,journal=(await db.prepare(STUDIO_JOURNAL_SQL).first()).encoded;
 // Bound validation to this DELETE's native target. Oversized or malformed proof
 // is not captured; it retains the affected Account only. No global proof scan.
 async function verifiedFor(spec){
  let query;
  if(spec.sql.includes('DELETE FROM sync_account_recovery_claims'))query='SELECT p.* FROM sync_account_recovery_claims r JOIN studio_document_recovery_proofs p ON p.account_id=r.account_id AND p.operation_id=r.commit_operation_id WHERE r.claim_id=?';
  else if(spec.sql.includes('DELETE FROM sync_account_lifecycle_operations'))query='SELECT p.* FROM sync_account_lifecycle_operations o JOIN studio_document_recovery_proofs p ON p.account_id=o.account_id AND p.operation_id=o.operation_id WHERE o.operation_id=?';
  else query='SELECT p.* FROM studio_document_recovery_proofs p WHERE p.account_id=?';
  // 128 proof tuples / 128 KiB per deletion. Overflow stays protected, never trimmed.
  const rows=(await db.prepare(query+' AND length(p.result_json)<=8192 LIMIT 129').bind(spec.values[0]).all()).results;
  if(rows.length>128)return '[]';const valid=[];
  for(const p of rows){try{const result=JSON.parse(p.result_json),expected={accountId:p.account_id,operationId:p.operation_id,deviceId:p.device_id,generation:p.generation,recoveryVersion:p.recovery_version,fingerprint:p.request_fingerprint,result:p.result_json};
   if(p.proof_hash===await studioDigest(studioCanonical(expected))&&Number.isSafeInteger(p.generation)&&p.generation>0&&Number.isSafeInteger(p.recovery_version)&&p.recovery_version>0&&result.accountId===p.account_id&&result.accountDeviceId===p.device_id&&result.recoveryVersion===p.recovery_version)valid.push(JSON.stringify([p.account_id,p.operation_id,p.device_id,p.generation,p.recovery_version,p.request_fingerprint,p.result_json,p.proof_hash]));
  }catch{/* Broken proof retains native evidence for this Account. */}}
  const json=JSON.stringify(valid);return new TextEncoder().encode(json).length<=131072?json:'[]';
 }
 const releaseHash=await studioReleaseHash();const specs=new WeakMap();
 const guard=()=>db.prepare(`SELECT CASE WHEN (SELECT encoded FROM (${STUDIO_SCHEMA_SQL}))=? AND (SELECT encoded FROM (${STUDIO_JOURNAL_SQL}))=? THEN 1 ELSE json_extract('scheduled_schema_race','$.abort') END`).bind(schema,journal);
 function rewrite(sql){const norm=sql.trim().replace(/\s+/g,' ');
  if(norm==='DELETE FROM sync_account_recovery_claims WHERE claim_id = ?')return{protected:true,sql:sql+` AND NOT (committed_at IS NOT NULL AND ${knownAccount('sync_account_recovery_claims.account_id')} AND (NOT EXISTS(SELECT 1 FROM sync_account_lifecycle_operations o WHERE o.operation_id=sync_account_recovery_claims.commit_operation_id AND o.account_id=sync_account_recovery_claims.account_id AND o.kind='recovery') OR EXISTS(SELECT 1 FROM sync_account_lifecycle_operations o WHERE o.operation_id=sync_account_recovery_claims.commit_operation_id AND o.account_id=sync_account_recovery_claims.account_id AND o.kind='recovery' AND NOT ${captured('o','sync_account_recovery_claims')})))`};
  if(norm==='DELETE FROM sync_account_lifecycle_operations WHERE operation_id = ?')return{protected:true,sql:sql+` AND NOT (${unresolved('sync_account_lifecycle_operations')})`};
  if(norm.startsWith('DELETE FROM sync_accounts WHERE id = ? AND state = \'deleting\' AND purge_after IS NOT NULL AND purge_after <= ?'))return{protected:true,sql:sql+` AND NOT EXISTS(SELECT 1 FROM sync_account_lifecycle_operations o WHERE o.account_id=sync_accounts.id AND ${unresolved('o')}) AND NOT EXISTS(SELECT 1 FROM sync_account_recovery_claims r WHERE r.account_id=sync_accounts.id AND r.committed_at IS NOT NULL AND ${knownAccount('r.account_id')} AND NOT EXISTS(SELECT 1 FROM studio_document_recovery_proofs p WHERE p.account_id=r.account_id AND p.operation_id=r.commit_operation_id AND p.device_id=r.next_account_device_id AND p.generation=r.expected_account_generation+1 AND p.recovery_version=r.expected_recovery_version+1 AND ${verified('p')}))`};
  // Fail closed if a future bundle introduces a new deletion of evidence-bearing tables.
  if(/^DELETE\s+FROM\s+(sync_accounts|sync_account_recovery_claims|sync_account_lifecycle_operations)\b/i.test(norm))throw Error('scheduled_sql_unrecognized');
  return{protected:false,sql};
 }
 async function batch(ss){
  if(!Array.isArray(ss)||!ss.length||ss.some(s=>!specs.has(s)))throw Error('scheduled_foreign_statement');
  const xs=ss.map(s=>specs.get(s)),protect=xs.some(x=>x.protected),native=[];
  for(const x of xs){const json=x.protected?await verifiedFor(x):null;native.push(x.protected?db.prepare(x.sql).bind(...x.values,...Array((x.sql.match(/json_each\(\?\)/g)||[]).length).fill(json)):x.native);}
  const r=await db.batch(protect?[releaseAssertion(db,releaseHash),guard(),...native,guard(),releaseAssertion(db,releaseHash)]:native);return protect?r.slice(2,-2):r;
 }
 function prepare(sql,values=[]){const spec=rewrite(sql),native=spec.protected?null:db.prepare(spec.sql).bind(...values);const s={bind(...v){return prepare(sql,v)},async run(){return(await batch([s]))[0]},async all(){return /^\s*SELECT\b/i.test(sql)?native.all():(await batch([s]))[0]},async first(column){if(/^\s*SELECT\b/i.test(sql))return native.first(column);const row=(await batch([s]))[0].results?.[0]??null;return column===undefined||row===null?row:row[column]}};specs.set(s,{...spec,native,values});return Object.freeze(s);}

 return {allowed:true,status:'SCOPED_NATIVE_PROOF_RETENTION',db:Object.freeze({prepare,batch,exec(){throw Error('scheduled_exec_hold')}})};
}
