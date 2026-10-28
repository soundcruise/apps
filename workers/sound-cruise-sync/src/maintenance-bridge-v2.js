import { MAINTENANCE_V2_DDL } from './maintenance-v2-schema.js';
import { MAINTENANCE_V2_PROFILES } from './maintenance-v2-profiles.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX=/^[0-9a-f]{64}$/;
const TABLE='sync_maintenance_v2_';
const metadataName=name=>/^(sync_maintenance_v2_|maintenance_v2_|idx_maintenance_v2_)/.test(name);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const normal=sql=>sql.trim().replace(/;$/,'');
function plain(value,seen=new Set()){
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isSafeInteger(value))fail('invalid_number');return value;}
 if(typeof value!=='object'||seen.has(value))fail('invalid_metadata');
 if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype)fail('invalid_metadata');
 seen.add(value);
 const result=Array.isArray(value)?value.map(x=>plain(x,seen)):Object.fromEntries(Object.keys(value).sort().map(k=>{
  const d=Object.getOwnPropertyDescriptor(value,k);if(!d||!('value'in d))fail('invalid_metadata');return [k,plain(d.value,seen)];
 }));
 seen.delete(value);return result;
}
export const maintenanceCanonical=value=>JSON.stringify(plain(value));
export async function maintenanceDigest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(maintenanceCanonical(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function snapshot(value){return JSON.parse(maintenanceCanonical(value));}
function int(value){if(!Number.isSafeInteger(value)||value<1||value>=Number.MAX_SAFE_INTEGER)fail('invalid_epoch');return value;}
function spec(value){
 const s=snapshot(value);if(typeof s.sql!=='string'||!Array.isArray(s.params)||!/^\s*SELECT\b/i.test(s.sql)||/[;]/.test(s.sql))fail('invalid_owner_assertion');
 return s;
}
function request(value,kind,ownerIdentityValidator){
 const r=snapshot(value);if(!UUID.test(r.operationId)||typeof r.scope!=='string'||!r.scope||r.scope.length>128||r.kind!==kind)fail('invalid_request');
 int(r.expectedEpoch);
 const i=r.identity;
 if(i?.profile!==undefined){
  if(typeof i.ownerId!=='string'||typeof ownerIdentityValidator!=='function'||ownerIdentityValidator(snapshot(i))!==true)fail('invalid_owner_profile');
  return r;
 }
 if(!i||['ownerId','accountId','membershipId','deviceId','datasetId'].some(k=>typeof i[k]!=='string'||!i[k])||
 ['accountGeneration','membershipGeneration','credentialVersion','writerEpoch','proGeneration'].some(k=>!Number.isSafeInteger(i[k])||i[k]<1))fail('invalid_identity');
 return r;
}

// Isolated module only: no HTTP dispatcher import, env flag activation or normal boot connection.
// owner is the existing owner's verifier + SQL assertions, supplied by a trusted isolated adapter.
// It is NOT a new authentication issuer, and JavaScript construction is not a security credential.
export function createIsolatedMaintenanceBridgeV2({db,owner,clock=Date.now}){
 if(!db?.prepare||!db?.batch||typeof owner?.id!=='string'||!owner.id||typeof owner?.verify!=='function'||typeof owner?.verifyHandover!=='function')fail('bridge_dependencies_missing');
 const statement=(sql,...values)=>db.prepare(sql).bind(...values);
 const parseRequest=(value,kind)=>request(value,kind,owner.validateIdentity);
 const stamp=()=>{const t=clock();if(!Number.isSafeInteger(t)||t<0)fail('invalid_clock');return t;};
 async function checkSchema(){
  const rows=(await db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'_cf_KV' ORDER BY type,name").all()).results;
  const expected=MAINTENANCE_V2_DDL.map(sql=>{const m=/^CREATE (TABLE|INDEX|TRIGGER) (\w+)/.exec(sql);return {type:m[1].toLowerCase(),name:m[2],sql:normal(sql)};}).sort((a,b)=>a.type.localeCompare(b.type)||a.name.localeCompare(b.name));
  const meta=rows.filter(x=>metadataName(x.name)).map(x=>({...x,sql:normal(x.sql)})).sort((a,b)=>a.type.localeCompare(b.type)||a.name.localeCompare(b.name));
  if(maintenanceCanonical(meta)!==maintenanceCanonical(expected))fail('maintenance_schema_unknown');
  const names=(await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all()).results.map(x=>x.name);
  const base=rows.filter(x=>!metadataName(x.name)).map(x=>({...x,sql:normal(x.sql)}));
  const fingerprint=await maintenanceDigest(base);
  const profile=Object.values(MAINTENANCE_V2_PROFILES).find(x=>x.fingerprint===fingerprint&&maintenanceCanonical(x.journal)===maintenanceCanonical(names));
  if(!profile)fail('base_schema_unknown');
  return profile.stage;
 }
 async function verified(r,purpose){
  if(r.identity.ownerId!==owner.id)fail('owner_identity_mismatch');
  const proof=snapshot(await owner.verify(snapshot(r),purpose));
  if(!proof||Object.getPrototypeOf(proof)!==Object.prototype||proof.allowed!==true||proof.identityDigest!==await maintenanceDigest(r.identity)||
     !Array.isArray(proof.assertions)||!proof.assertions.length)fail('owner_unverified');
  return proof.assertions.map(spec);
 }
 function assertion(sql,values=[]){
  const id=crypto.randomUUID();
  return {id,q:statement(`INSERT INTO ${TABLE}assertions(id,ok) SELECT ?,CASE WHEN (${sql}) THEN 1 ELSE 0 END`,id,...values)};
 }
 function ownerGuards(items){return items.map(x=>assertion(`(SELECT ok FROM (${x.sql}))=1`,x.params));}
 const clear=items=>statement(`DELETE FROM ${TABLE}assertions WHERE id IN (${items.map(()=>'?').join(',')})`,...items.map(x=>x.id));
 async function row(id){return statement(`SELECT * FROM ${TABLE}operations WHERE operation_id=?`,id).first();}
 async function control(scope){return statement(`SELECT * FROM ${TABLE}control WHERE scope=?`,scope).first();}
 async function match(r,digest){
  const o=await row(r.operationId);if(!o)return null;
  if(o.request_digest!==digest||o.binding_json!==maintenanceCanonical(r.identity)||o.binding_digest!==await maintenanceDigest(r.identity)||o.scope!==r.scope||o.kind!==r.kind||o.epoch!==r.expectedEpoch)fail('operation_mismatch');
  if(o.pending_json!==null&&(!HEX.test(o.pending_digest||'')||await maintenanceDigest(JSON.parse(o.pending_json))!==o.pending_digest))fail('pending_corrupt');
  if(o.phase==='committed'){
   let receipt;try{receipt=JSON.parse(o.receipt_json);}catch{fail('receipt_unknown');}
   if(await maintenanceDigest(receipt)!==o.receipt_digest||receipt.operationId!==r.operationId||receipt.scope!==r.scope||receipt.requestDigest!==digest||
      receipt.type!==r.kind||receipt.identityDigest!==o.binding_digest)fail('receipt_unknown');
   return {row:o,receipt};
  }
  return {row:o,receipt:null};
 }
 async function committed(r,digest,body,items=[]){
  const receipt={type:r.kind,operationId:r.operationId,scope:r.scope,requestDigest:digest,identityDigest:await maintenanceDigest(r.identity),epoch:r.expectedEpoch,...body};
  return {receipt,json:maintenanceCanonical(receipt),hash:await maintenanceDigest(receipt),items};
 }
 async function insert(r,digest,phase,receipt=null,pending=null,source=null){
  return statement(`INSERT INTO ${TABLE}operations(operation_id,scope,epoch,kind,request_digest,binding_json,binding_digest,phase,pending_json,pending_digest,receipt_json,receipt_digest,source_id,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,r.operationId,r.scope,r.expectedEpoch,r.kind,digest,maintenanceCanonical(r.identity),await maintenanceDigest(r.identity),phase,pending?maintenanceCanonical(pending):null,pending?await maintenanceDigest(pending):null,receipt?.json||null,receipt?.hash||null,source,stamp(),stamp());
 }
 async function transition(r,kind,build){
  await checkSchema();const digest=await maintenanceDigest(r);const guards=ownerGuards(await verified(r,'control'));
  const old=await match(r,digest);if(old){if(old.receipt)return {status:'historical',receipt:old.receipt};fail('control_result_unknown');}
  const c=await control(r.scope);if(!c||c.epoch!==r.expectedEpoch)fail('epoch_conflict');
  const item=assertion(`EXISTS(SELECT 1 FROM ${TABLE}control WHERE scope=? AND epoch=?)`,[r.scope,r.expectedEpoch]);
  const {sql,params,body,extra=[]}=await build(c,digest);
  const receipt=await committed(r,digest,{nextEpoch:r.expectedEpoch+1,...body});
  const all=[...guards,item,...extra];
  const changed=assertion('changes()=1');
  await db.batch([...all.map(x=>x.q),await insert(r,digest,'committed',receipt),statement(sql,...params),changed.q,clear([...all,changed])]);
  const read=await match(r,digest);if(!read?.receipt)fail('control_result_unknown');
  return {status:'committed',receipt:read.receipt};
 }
 async function stop(input){const r=parseRequest(input,'stop');return transition(r,'stop',async()=>({
  sql:`UPDATE ${TABLE}control SET phase='closed',epoch=epoch+1,stop_id=?,handover_id=NULL,transition_id=?,updated_at=? WHERE scope=? AND epoch=?`,
  params:[r.operationId,r.operationId,stamp(),r.scope,r.expectedEpoch],body:{state:'closed'}
 }));}
 async function handover(input){
  const r=parseRequest(input,'handover'),e=r.evidence;
  if(!e||e.environment!=='isolated'||!HEX.test(e.inventoryDigest||'')||!HEX.test(e.sourceDigest||''))fail('handover_evidence_missing');
  const names=['oldIngressExcluded','oldVersionsExcluded','oldScheduledExcluded','externalWritersExcluded','oldInflightExcluded','partialResultsExcluded','newClaimsAbsent','unknownResultsAbsent'];
  if(names.some(k=>!HEX.test(e[k]||'')))fail('handover_hold');
  if(await owner.verifyHandover(snapshot(r))!==true)fail('handover_hold');
  return transition(r,'handover',async(c)=>{
   if(c.phase!=='closed'||!c.stop_id||r.stopOperationId!==c.stop_id)fail('handover_hold');
   const stopFact=await row(c.stop_id);
   if(stopFact?.kind!=='stop'||stopFact.phase!=='committed'||!stopFact.receipt_json)fail('handover_hold');
   const stopReceipt=JSON.parse(stopFact.receipt_json);
   if(await maintenanceDigest(stopReceipt)!==stopFact.receipt_digest||stopReceipt.nextEpoch!==r.expectedEpoch||stopReceipt.scope!==r.scope)fail('handover_hold');
   const empty=assertion(`NOT EXISTS(SELECT 1 FROM ${TABLE}operations WHERE scope=? AND phase NOT IN ('committed','resolved'))`,[r.scope]);
   return {sql:`UPDATE ${TABLE}control SET epoch=epoch+1,handover_id=?,transition_id=?,updated_at=? WHERE scope=? AND epoch=? AND phase='closed' AND stop_id=?`,
    params:[r.operationId,r.operationId,stamp(),r.scope,r.expectedEpoch,r.stopOperationId],body:{handoverDigest:await maintenanceDigest(e),environment:'isolated',stopOperationId:c.stop_id},extra:[empty]};
  });
 }
 async function open(input){
  const r=parseRequest(input,'open');
  return transition(r,'open',async(c)=>{
   if(c.phase!=='closed'||r.handoverOperationId!==c.handover_id||!c.stop_id)fail('handover_hold');
   const h=await row(c.handover_id);
   if(h?.kind!=='handover'||h.phase!=='committed')fail('handover_hold');
   const receipt=JSON.parse(h.receipt_json);
   if(await maintenanceDigest(receipt)!==h.receipt_digest||receipt.nextEpoch!==r.expectedEpoch||receipt.environment!=='isolated'||receipt.stopOperationId!==c.stop_id)fail('handover_hold');
   const empty=assertion(`NOT EXISTS(SELECT 1 FROM ${TABLE}operations WHERE scope=? AND phase NOT IN('committed','resolved'))`,[r.scope]);
   return {sql:`UPDATE ${TABLE}control SET phase='open',epoch=epoch+1,transition_id=?,updated_at=? WHERE scope=? AND epoch=? AND handover_id=?`,
    params:[r.operationId,stamp(),r.scope,r.expectedEpoch,r.handoverOperationId],body:{state:'open',handoverOperationId:r.handoverOperationId},extra:[empty]};
  });
 }
 function fence(r,digest,phases=['registered']){
  return assertion(`EXISTS(SELECT 1 FROM ${TABLE}control c JOIN ${TABLE}operations o ON o.scope=c.scope
   WHERE c.scope=? AND c.phase='open' AND c.epoch=? AND c.handover_id IS NOT NULL
   AND o.operation_id=? AND o.epoch=c.epoch AND o.request_digest=? AND o.binding_json=?
   AND o.phase IN(${phases.map(()=>'?').join(',')}))`,
   [r.scope,r.expectedEpoch,r.operationId,digest,maintenanceCanonical(r.identity),...phases]);
 }
 async function admit(r,digest,pending=null){
  const guards=ownerGuards(await verified(r,'admit'));
  const gate=assertion(`EXISTS(SELECT 1 FROM ${TABLE}control WHERE scope=? AND phase='open' AND epoch=? AND handover_id IS NOT NULL)
   AND NOT EXISTS(SELECT 1 FROM ${TABLE}operations WHERE scope=? AND kind='external' AND phase NOT IN('committed','resolved'))`,
   [r.scope,r.expectedEpoch,r.scope]);
  // An external action is exclusive among participating operations; old writers remain out of scope.
  const exclusive=r.kind==='external'?[assertion(`NOT EXISTS(SELECT 1 FROM ${TABLE}operations WHERE scope=? AND phase NOT IN('committed','resolved'))`,[r.scope])]:[];
  const all=[...guards,gate,...exclusive];
  await db.batch([...all.map(x=>x.q),await insert(r,digest,'registered',null,pending),clear(all)]);
 }
 function protectedOperation(r,digest,outcome,receiptDetails){
  const natives=new WeakMap();let batches=0;
  async function batch(wrapped){
   if(++batches!==1)fail('multiple_mutation_batches_unsupported');
   if(!Array.isArray(wrapped)||!wrapped.length||wrapped.some(x=>!natives.has(x)))fail('raw_statement_escape');
   await checkSchema();
   const guards=[...ownerGuards(await verified(r,'commit')),fence(r,digest)];
   const exclusive=assertion(`NOT EXISTS(SELECT 1 FROM ${TABLE}operations WHERE scope=? AND kind='external' AND phase NOT IN('committed','resolved') AND operation_id<>?)`,[r.scope,r.operationId]);guards.push(exclusive);
   const body=wrapped.map(x=>natives.get(x));
   const q=spec(outcome);
   const verifiedOutcome=assertion(`(SELECT ok FROM (${q.sql}))=1`,q.params);
   const receipt=await committed(r,digest,{outcomeDigest:await maintenanceDigest(q),...(receiptDetails?{details:receiptDetails}:{})});
   const result=await db.batch([...guards.map(x=>x.q),...body,verifiedOutcome.q,
    statement(`UPDATE ${TABLE}operations SET phase='committed',receipt_json=?,receipt_digest=?,updated_at=? WHERE operation_id=? AND phase='registered'`,receipt.json,receipt.hash,stamp(),r.operationId),clear([...guards,verifiedOutcome])]);
   if(!Array.isArray(result)||result.length!==guards.length+body.length+3)fail('commit_ack_unknown');
   return result.slice(guards.length,guards.length+body.length);
  }
  function prepare(sql,values=[]){
   if(typeof sql!=='string'||!/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(sql)||/sync_maintenance_v2_|maintenance_v2_/i.test(sql)||sql.includes(';'))fail('unsupported_sql');
   const native=statement(sql,...values),readonly=/^\s*SELECT\b/i.test(sql);
   const wrapped=Object.freeze({
    bind(...v){return prepare(sql,snapshot(v));},
    async run(){return (await batch([wrapped]))[0];},
    async all(){return readonly?native.all():(await batch([wrapped]))[0];},
    async first(column){const data=readonly?await native.first():((await batch([wrapped]))[0].results?.[0]||null);return column===undefined||data===null?data:data[column];}
   });natives.set(wrapped,native);return wrapped;
  }
  const binding=Object.freeze({prepare,batch,exec(){fail('raw_exec_unsupported');},withSession(){fail('session_escape_unsupported');},dump(){fail('dump_unsupported');}});
  return {binding,get batches(){return batches;}};
 }
 async function execute(input,{outcome,run,receiptDetails=null}){
  const r=parseRequest(input,'mutation');if(typeof run!=='function')fail('missing_owner_adapter');const outcomeSnapshot=spec(outcome);
  const detailsSnapshot=receiptDetails===null?null:snapshot(receiptDetails);
  await checkSchema();await verified(r,'admit');const digest=await maintenanceDigest(r),old=await match(r,digest);
  if(old){if(old.receipt)return {status:'historical',receipt:old.receipt};fail('pending_requires_explicit_recovery');}
  await admit(r,digest);
  const protectedDb=protectedOperation(r,digest,outcomeSnapshot,detailsSnapshot);
  const value=await run(protectedDb.binding);
  if(protectedDb.batches!==1)fail('owner_adapter_did_not_commit');
  const read=await match(r,digest);if(!read?.receipt)fail('commit_result_unknown');
  return {status:'committed',receipt:read.receipt,value};
 }
 async function reserveOwnerRequest(input){
  if(owner.allowRequestReservations!==true)fail('request_reservation_not_allowed');
  const r=parseRequest(input,'mutation');await checkSchema();await verified(r,'admit');
  const digest=await maintenanceDigest(r),old=await match(r,digest);
  if(old)return {status:'existing',phase:old.row.phase};
  await admit(r,digest);return {status:'reserved'};
 }
 async function finishOwnerRequest(input,{outcome,run,receiptDetails}){
  if(owner.allowRequestReservations!==true)fail('request_reservation_not_allowed');
  const r=parseRequest(input,'mutation');await checkSchema();await verified(r,'commit');
  const digest=await maintenanceDigest(r),old=await match(r,digest);
  if(!old)fail('request_reservation_missing');if(old.receipt)return {status:'historical',receipt:old.receipt};
  if(old.row.phase!=='registered')fail('request_reservation_fenced');
  const protectedDb=protectedOperation(r,digest,spec(outcome),snapshot(receiptDetails));
  const value=await run(protectedDb.binding);if(protectedDb.batches!==1)fail('owner_adapter_did_not_commit');
  const read=await match(r,digest);if(!read?.receipt)fail('commit_result_unknown');
  return {status:'committed',receipt:read.receipt,value};
 }
 async function reconcile(input){
  const r=parseRequest(input,input.kind);await checkSchema();await verified(r,'reconcile');
  const read=await match(r,await maintenanceDigest(r));
  if(!read)return {status:'unknown'};
  return read.receipt?{status:'historical',receipt:read.receipt}:{status:'unknown',phase:read.row.phase,pendingDigest:read.row.pending_digest};
 }
 async function externalIntent(input,pending){
  const r=parseRequest(input,'external'),p=snapshot(pending);
  if(r.pendingDigest!==await maintenanceDigest(p))fail('pending_request_mismatch');
  await checkSchema();await verified(r,'admit');
  if(!p||!HEX.test(p.sourceManifestDigest||'')||!HEX.test(p.objectDigest||'')||typeof p.objectKey!=='string'||!p.objectKey)fail('invalid_pending');
  const digest=await maintenanceDigest(r),old=await match(r,digest);if(old)fail('external_replay_requires_reconcile');
  await admit(r,digest,p);
  const guards=[...ownerGuards(await verified(r,'external')),fence(r,digest)];
  const changed=assertion('changes()=1');
  await db.batch([...guards.map(x=>x.q),statement(`UPDATE ${TABLE}operations SET phase='external_pending',updated_at=? WHERE operation_id=? AND phase='registered'`,stamp(),r.operationId),changed.q,clear([...guards,changed])]);
  const read=await match(r,digest);if(read?.row.phase!=='external_pending'||!read.row.pending_digest)fail('pending_readback_unknown');
  // Does not execute delete/upload. Existing Asset owner must consume the fact through a dedicated adapter.
  return {status:'external_pending',operationId:r.operationId,pendingDigest:read.row.pending_digest};
 }
 async function recordExternalUnknown(input){
  const r=parseRequest(input,'external');await checkSchema();const guards=ownerGuards(await verified(r,'reconcile'));const digest=await maintenanceDigest(r),old=await match(r,digest);
  if(!old||!['external_pending','unknown'].includes(old.row.phase))fail('pending_unknown');
  if(old.row.phase==='unknown')return {status:'unknown'};
  const one=assertion('changes()=1');
  await db.batch([...guards.map(x=>x.q),statement(`UPDATE ${TABLE}operations SET phase='unknown',updated_at=? WHERE operation_id=? AND phase='external_pending'`,stamp(),r.operationId),one.q,clear([...guards,one])]);
  return {status:'unknown'};
 }
 async function inspect(scope){
  await checkSchema();const c=await control(scope);if(!c)return {state:'HOLD',reason:'control_missing'};
  const pending=(await statement(`SELECT operation_id,kind,phase,epoch FROM ${TABLE}operations WHERE scope=? AND phase NOT IN('committed','resolved') ORDER BY operation_id`,scope).all()).results;
  return {state:pending.length?'HOLD':c.phase,control:c,pending,initialProductionHandover:'UNPROVEN'};
 }
 async function recover(input){
  const r=parseRequest(input,'recovery');await checkSchema();const digest=await maintenanceDigest(r);
  const guards=ownerGuards(await verified(r,'recovery'));
  const existing=await match(r,digest);if(existing){if(existing.receipt)return {status:'historical',receipt:existing.receipt};fail('recovery_unknown');}
  const source=await row(r.sourceOperationId);
  if(!source||!['mutation','external'].includes(source.kind)||!['registered','external_pending','external_proven','unknown'].includes(source.phase)||source.scope!==r.scope||
     source.binding_json!==maintenanceCanonical(r.identity)||source.binding_digest!==await maintenanceDigest(r.identity)||r.sourceRequestDigest!==source.request_digest||
     r.pendingDigest!==source.pending_digest)fail('recovery_source_mismatch');
  if(source.pending_json!==null && await maintenanceDigest(JSON.parse(source.pending_json))!==source.pending_digest)fail('pending_corrupt');
  if(typeof owner.verifyRecovery!=='function')fail('recovery_owner_missing');
  const proof=snapshot(await owner.verifyRecovery(snapshot(r),snapshot(source)));
  if(proof.allowed!==true||proof.sourceDigest!==await maintenanceDigest(source)||proof.outcomeDigest!==await maintenanceDigest(r.outcome))fail('recovery_unverified');
  const operationFenceOnly=proof.operationFenceOnly===true;
  if(operationFenceOnly&&(source.kind!=='mutation'||source.phase!=='registered'||source.receipt_json!==null||source.pending_json!==null||source.resolved_by!==null))fail('operation_fence_not_safe');
  const gate=assertion('EXISTS(SELECT 1 FROM '+TABLE+'control WHERE scope=? AND epoch=? AND (phase=\'closed\' OR (?=1 AND phase=\'open\')))',[r.scope,r.expectedEpoch,operationFenceOnly?1:0]);
  const sourceGuard=assertion('EXISTS(SELECT 1 FROM '+TABLE+'operations WHERE operation_id=? AND request_digest=? AND binding_digest=? AND phase=?)',[source.operation_id,source.request_digest,source.binding_digest,source.phase]);
  const receipt=await committed(r,digest,{sourceOperationId:source.operation_id,sourceRequestDigest:source.request_digest,pendingDigest:source.pending_digest,outcome:r.outcome});
  const one=assertion('changes()=1'),all=[...guards,gate,sourceGuard];
  await db.batch([...all.map(x=>x.q),await insert(r,digest,'committed',receipt,null,source.operation_id),
   statement('UPDATE '+TABLE+'operations SET phase=\'resolved\',resolved_by=?,updated_at=? WHERE operation_id=? AND phase=?',r.operationId,stamp(),source.operation_id,source.phase),one.q,clear([...all,one])]);
  const read=await match(r,digest);if(!read?.receipt)fail('recovery_unknown');return {status:'committed',receipt:read.receipt};
 }
 return Object.freeze({checkSchema,stop,handover,open,execute,reserveOwnerRequest,finishOwnerRequest,reconcile,externalIntent,recordExternalUnknown,recover,inspect});
}
