// RC2 candidate. Trusted policy injection only; no Production router imports this module.
import {inspectStudioRelease,STUDIO_SCHEMA_SQL,STUDIO_JOURNAL_SQL,releaseAssertion,studioReleaseHash} from './studio-release-schema.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const exact=(x,ks)=>x&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).sort().join('|')===ks.slice().sort().join('|');
export function retentionPolicy(input){
 if(input===null||input===undefined)return null;
 if(!exact(input,['id','physicalDelete','minHistoryAgeMs','rateKeepMs','intentLifetimeMs'])||typeof input.id!=='string'||!input.id||input.physicalDelete!==true||['minHistoryAgeMs','rateKeepMs','intentLifetimeMs'].some(k=>!Number.isSafeInteger(input[k])||input[k]<0)||input.rateKeepMs<60000||input.intentLifetimeMs<1)throw Error('retention-policy-invalid');
 return Object.freeze({...input});
}
// Metadata observation, not a deletion capability. All values are account scoped.
const scopeSQL=`SELECT json_array(
 (SELECT json_group_array(json_array(operation_id,request_digest,manifest_json,binding_json)) FROM (SELECT * FROM studio_document_pending WHERE account_id=?1 ORDER BY operation_id)),
 (SELECT json_group_array(json_array(operation_id,ordinal,digest,bytes)) FROM (SELECT * FROM studio_document_chunks WHERE account_id=?1 ORDER BY operation_id,ordinal)),
 (SELECT json_group_array(json_array(record_id,last_operation_id,revision,payload_hash,deleted_at)) FROM (SELECT * FROM studio_document_records WHERE user_id=?1 ORDER BY record_id)),
 (SELECT json_group_array(json_array(operation_id,binding_json,receipt_json)) FROM (SELECT * FROM studio_document_receipts WHERE account_id=?1 ORDER BY operation_id)),
 (SELECT json_group_array(json_array(operation_id,source_operation_id,source_digest,request_digest,binding_json,receipt_json)) FROM (SELECT * FROM studio_document_owner_events WHERE account_id=?1 ORDER BY operation_id)),
 (SELECT json_group_array(json_array(operation_id,request_digest,state,receipt_json)) FROM (SELECT * FROM studio_document_resolutions WHERE account_id=?1 ORDER BY operation_id)),
 (SELECT json_group_array(json_array(device_id,generation,revoked)) FROM (SELECT * FROM studio_document_enrollments WHERE account_id=?1 ORDER BY device_id))
) encoded`;
export function createStudioRetentionOwner({db,release,policy:input,authorize,read,pending,receipt,eventReceipt,recoveryProof,proofStatements,canonical,digest,fail}){
 const policy=retentionPolicy(input);
 const required=()=>{if(!release)fail('release-required');};
 async function observation(c){return(await read(c,scopeSQL,c.binding.accountId))[0].encoded;}
 function pinned(c,encoded){return c.guarded.prepare(`SELECT CASE WHEN (SELECT encoded FROM (${scopeSQL}))=?2 THEN 1 ELSE json_extract('retention_scope_changed','$.abort') END`).bind(c.binding.accountId,encoded);}
 async function inspect(c,id){
  const p=await pending(c,id);if(!p)fail('operation-absent');
  const encoded=await observation(c),terminal=(await read(c,'SELECT * FROM studio_document_resolutions WHERE account_id=? AND operation_id=?',c.binding.accountId,id))[0];
  const head=(await read(c,'SELECT last_operation_id,deleted_at FROM studio_document_records WHERE user_id=? AND record_id=?',c.binding.accountId,p.document_id))[0];
  let committed=await receipt(c,p),state='UNKNOWN_OR_PENDING_HOLD',via=null;
  if(terminal)state='ALREADY_RESOLVED';
  else if(head?.last_operation_id===id&&head.deleted_at===null)state='CURRENT_HEAD_HOLD';
  else{
   if(!committed){let current=id;const visited=new Set([id]);for(let depth=0;depth<32;depth++){
    const e=(await read(c,'SELECT * FROM studio_document_owner_events WHERE account_id=? AND source_operation_id=?',c.binding.accountId,current))[0];if(!e)break;
    await eventReceipt(c,e);if(visited.has(e.operation_id))fail('adoption-cycle');visited.add(e.operation_id);const next=await pending(c,e.operation_id);committed=await receipt(c,next);if(committed){via=e.operation_id;break;}current=e.operation_id;
   }}
   if(committed){const ch=(await read(c,'SELECT changed_at FROM studio_document_changes WHERE user_id=? AND operation_id=?',c.binding.accountId,via||id))[0];if(!ch)fail('history-missing');state=policy&&ch.changed_at+policy.minHistoryAgeMs<=Date.now()?'COLLECTIBLE':'POLICY_OR_AGE_HOLD';}
  }
  const chunks=(await read(c,'SELECT count(*) n,COALESCE(sum(bytes),0) bytes FROM studio_document_chunks WHERE account_id=? AND operation_id=?',c.binding.accountId,id))[0];
  const view={type:'studio-retention-plan-v2',accountId:c.binding.accountId,operationId:id,requestDigest:p.request_digest,state,bytes:chunks.bytes,chunks:chunks.n,viaOperation:via,policyDigest:policy?await digest(canonical(policy)):null,scopeDigest:await digest(encoded),binding:c.binding};
  return{p,encoded,view:{...view,planDigest:await digest(canonical(view))},terminal,head};
 }
 async function plan(headers,input){required();if(!exact(input,['operationId'])||!uuid.test(input.operationId))fail('retention-request');return(await inspect(await authorize(headers,{securityDelete:true}),input.operationId)).view;}
 async function prior(c,operationId,rd){const r=(await read(c,'SELECT * FROM studio_document_maintenance_receipts WHERE account_id=? AND operation_id=?',c.binding.accountId,operationId))[0];if(!r)return null;if(r.digest!==rd)fail('maintenance-operation-reused');return{...JSON.parse(r.result_json),historical:true,authorizesNewOperation:false};}
 function audit(c,id,rd,result){return c.guarded.prepare('INSERT INTO studio_document_maintenance_receipts VALUES(?,?,?,?)').bind(c.binding.accountId,id,rd,canonical(result));}
 async function collect(headers,input){required();if(!policy)fail('retention-policy-unapproved');if(!exact(input,['operationId','targetOperationId','planDigest'])||!uuid.test(input.operationId)||!uuid.test(input.targetOperationId))fail('collect-request');
  const c=await authorize(headers,{securityDelete:true}),rd=await digest(canonical({kind:'collect',input,account:c.binding.accountId,policy})),old=await prior(c,input.operationId,rd);if(old)return old;
  const x=await inspect(c,input.targetOperationId);if(x.view.state!=='COLLECTIBLE'||x.view.planDigest!==input.planDigest)fail('retention-plan-stale-or-hold');
  const result={type:'studio-collection-v2',accountId:c.binding.accountId,operationId:input.operationId,targetOperationId:input.targetOperationId,requestDigest:x.p.request_digest,removedBytes:x.view.bytes,policyDigest:x.view.policyDigest,scopeDigest:x.view.scopeDigest};
  await c.guarded.batch([pinned(c,x.encoded),c.guarded.prepare('INSERT INTO studio_document_resolutions VALUES(?,?,?,?,?)').bind(c.binding.accountId,x.p.operation_id,x.p.request_digest,'collected',canonical(result)),c.guarded.prepare('DELETE FROM studio_document_chunks WHERE account_id=? AND operation_id=?').bind(c.binding.accountId,x.p.operation_id),audit(c,input.operationId,rd,result)]);
  return{...result,historical:false,authorizesNewOperation:false};
 }
 async function discard(headers,input){required();if(!policy)fail('retention-policy-unapproved');if(!exact(input,['operationId','targetOperationId','requestDigest','proofOperationId'])||!uuid.test(input.operationId)||!uuid.test(input.targetOperationId))fail('discard-request');
  const c=await authorize(headers,{securityDelete:true}),rd=await digest(canonical({kind:'discard',input,account:c.binding.accountId,policy})),old=await prior(c,input.operationId,rd);if(old)return old;
  const x=await inspect(c,input.targetOperationId);if(x.head?.last_operation_id===x.p.operation_id||x.p.request_digest!==input.requestDigest||x.terminal||await receipt(c,x.p))fail('discard-not-uncommitted');
  if((await read(c,'SELECT operation_id FROM studio_document_owner_events WHERE account_id=? AND (source_operation_id=? OR operation_id=?)',c.binding.accountId,x.p.operation_id,x.p.operation_id)).length)fail('discard-adoption-dependency');
  const b=JSON.parse(x.p.binding_json),same=['accountId','deviceId','generation','recoveryVersion','credentialVersion'].every(k=>b[k]===c.binding[k]);const proof=same&&input.proofOperationId===null?null:await recoveryProof(c,input.proofOperationId);
  const result={type:'studio-discard-v2',accountId:c.binding.accountId,operationId:input.operationId,targetOperationId:x.p.operation_id,requestDigest:x.p.request_digest,proofOperationId:proof?.operation_id??null,removedBytes:x.view.bytes};
  await c.guarded.batch([...(proof?proofStatements(c,proof):[]),pinned(c,x.encoded),c.guarded.prepare('INSERT INTO studio_document_resolutions VALUES(?,?,?,?,?)').bind(c.binding.accountId,x.p.operation_id,x.p.request_digest,'discarded',canonical(result)),c.guarded.prepare('DELETE FROM studio_document_chunks WHERE account_id=? AND operation_id=?').bind(c.binding.accountId,x.p.operation_id),audit(c,input.operationId,rd,result)]);return{...result,historical:false,authorizesNewOperation:false};
 }
 async function requestAccountErase(headers,input){required();if(!policy)fail('retention-policy-unapproved');if(!exact(input,['operationId','confirmAccountId'])||!uuid.test(input.operationId))fail('erase-request');const c=await authorize(headers,{securityDelete:true});if(input.confirmAccountId!==c.binding.accountId)fail('erase-account-mismatch');
  const existing=(await read(c,'SELECT * FROM studio_document_erase_intents WHERE account_id=? AND operation_id=?',c.binding.accountId,input.operationId))[0];if(existing)return{type:'studio-erase-request-v2',operationId:input.operationId,scopeDigest:existing.scope_digest,expiresAt:existing.expires_at,historical:true};
  const encoded=await observation(c),scopeDigest=await digest(encoded),pd=await digest(canonical(policy)),expires=Date.now()+policy.intentLifetimeMs;
  await c.guarded.batch([pinned(c,encoded),c.guarded.prepare('INSERT INTO studio_document_erase_intents VALUES(?,?,?,?,?,?,?)').bind(c.binding.accountId,input.operationId,canonical(c.binding),encoded,scopeDigest,pd,expires)]);
  return{type:'studio-erase-request-v2',operationId:input.operationId,scopeDigest,expiresAt:expires,historical:false,requiresNativeAccountDeletion:true};
 }
 return Object.freeze({plan,collect,discard,requestAccountErase});
}
// Internal job only, no HTTP path. Authority is the immutable intent captured while the
// Account was active, exact unchanged scope, approved injected policy and Account absence.
export async function completeStudioAccountErase({db,policy:input,accountId,operationId,canonical,digest}){
 const policy=retentionPolicy(input);if(!policy||!uuid.test(accountId)||!uuid.test(operationId))throw Error('erase-capability-required');
 await inspectStudioRelease(db);const pd=await digest(canonical(policy)),p=await db.prepare('SELECT * FROM studio_document_erase_intents WHERE account_id=? AND operation_id=?').bind(accountId,operationId).first();if(!p||p.policy_digest!==pd||p.scope_digest!==await digest(p.scope_json)||JSON.parse(p.binding_json).accountId!==accountId)throw Error('erase-authority-missing');
 const old=await db.prepare('SELECT * FROM studio_document_erased_accounts WHERE account_id=?').bind(accountId).first();if(old){if(old.operation_id!==operationId)throw Error('erase-operation-reused');return{...JSON.parse(old.receipt_json),historical:true};}
 if(p.expires_at<=Date.now())throw Error('erase-authority-expired');
 const schema=(await db.prepare(STUDIO_SCHEMA_SQL).first()).encoded,journal=(await db.prepare(STUDIO_JOURNAL_SQL).first()).encoded,hash=await studioReleaseHash();
 const guard=db.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sync_accounts WHERE id=?1) AND (SELECT encoded FROM (${scopeSQL}))=?2 AND EXISTS(SELECT 1 FROM studio_document_erase_intents WHERE account_id=?1 AND operation_id=?3 AND policy_digest=?4 AND expires_at>unixepoch('subsec')*1000 AND scope_json=?2) AND (SELECT encoded FROM (${STUDIO_SCHEMA_SQL}))=?5 AND (SELECT encoded FROM (${STUDIO_JOURNAL_SQL}))=?6 THEN 1 ELSE json_extract('erase_scope_or_authority','$.abort') END`).bind(accountId,p.scope_json,operationId,pd,schema,journal);
 const result={type:'studio-account-erasure-v2',accountId,operationId,scopeDigest:p.scope_digest,policyDigest:pd,payloadErased:true,metadataRetained:true};
 const binding=JSON.parse(p.binding_json);
 const finalAuthority=()=>db.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sync_accounts WHERE id=?) AND EXISTS(SELECT 1 FROM studio_document_control WHERE id=1 AND enabled=1 AND epoch=?) AND EXISTS(SELECT 1 FROM studio_document_erase_intents WHERE account_id=? AND operation_id=? AND binding_json=? AND policy_digest=? AND expires_at>unixepoch('subsec')*1000) THEN 1 ELSE json_extract('erase_authority_changed','$.abort') END`).bind(accountId,binding.epoch,accountId,operationId,p.binding_json,pd);
 const statements=[releaseAssertion(db,hash),finalAuthority(),guard,
 db.prepare('INSERT INTO studio_document_erased_accounts VALUES(?,?,?)').bind(accountId,operationId,canonical(result)),
 db.prepare('DELETE FROM studio_document_chunks WHERE account_id=?').bind(accountId),db.prepare('DELETE FROM studio_document_records WHERE user_id=?').bind(accountId),
 db.prepare('UPDATE studio_document_changes SET payload_json=NULL WHERE user_id=?').bind(accountId),
 db.prepare('UPDATE studio_document_enrollments SET revoked=1 WHERE account_id=?').bind(accountId),finalAuthority(),releaseAssertion(db,hash)];
 await db.batch(statements);return{...result,historical:false};
}
