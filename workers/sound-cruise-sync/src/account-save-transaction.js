import {readTwoCycleArchive} from './account-two-cycle-history.js';
import {createSuccessorRecoveryOwner} from './account-successor-recovery.js';
import {validateSuccessorStopRequest} from '../../../apps/shared/sync-account/owner-successor-contract.mjs';
import {predecessorVerifier} from './account-successor-lineage.js';
import {createOwnerCutoverOwner} from './account-owner-cutover.js';
import {validateCutoverRequest,isDigest,isUUID} from '../../../apps/shared/sync-account/owner-cutover-contract.mjs';
import {createOperationLeaseOwner} from './account-operation-lease.js';
import {validateOperationEnvelope} from '../../../apps/shared/sync-account/owner-operation-lease-contract.mjs';
// UNROUTED fixture capability. No app.js/account-app.js import or production
// schema installation. The protected resource here is the EXISTING SQL record,
// never a promise of atomic commit with a browser's IndexedDB.
import {parseAccountCredential} from './account-crypto.js';
import {verifyAccountCredentialSnapshot} from './account-auth.js';
import {parseDeviceCredential,hmacVerifier} from './crypto.js';
import {inspectProCredentialReadOnly} from './pro-auth-app.js';
import {admitWriter,writerMutationDatabase} from './writer-admission.js';
import {policyAllows,assertion,clearAssertions,fenceQuery} from './writer-fence.js';
import {canonicalJson,validateOperation,hashRecord} from './records.js';
import {createD1SyncRepository} from './sync-database.js';
import {evaluateSaveCredential} from './account-save-admission.js';
import {observeOwnerClock} from './account-owner-clock.js';
import {validateReauthorizationRequest} from '../../../apps/shared/sync-account/authority-reauthorization-contract.mjs';
import {ownerBindingSQL} from './account-credential-lifecycle.js';

const TIME="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(x);
const positive=x=>Number.isSafeInteger(x)&&x>0;
const text=x=>typeof x==='string'&&x.length>0&&x.length<=256;
const keys=['contractVersion','purpose','accountId','accountDeviceId','accountGeneration','membershipId','membershipGeneration',
 'credentialVersion','credentialLeaseRevision','runtimeGeneration','datasetId','appDeviceId','writeEpoch','localGeneration','localRevision','operation'];
const closed=v=>Object.freeze({canWrite:false,operationAuthorized:false,productionReady:false,...v});
function error(code){const e=Error(code);e.code=code;return e;}
function data(value,depth=0,seen=new Set(),budget={nodes:0}){
 if(depth>16||++budget.nodes>5000)throw error('backend-request-invalid');
 if(value===null||['string','boolean'].includes(typeof value))return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(!value||typeof value!=='object'||seen.has(value)||Object.getOwnPropertySymbols(value).length||
  ![Object.prototype,null,Array.prototype].includes(Object.getPrototypeOf(value)))throw error('backend-request-invalid');
 seen.add(value);const result=Array.isArray(value)?[]:Object.create(null);
 for(const k of Object.keys(value)){const d=Object.getOwnPropertyDescriptor(value,k);if(!Object.hasOwn(d,'value'))throw error('backend-request-invalid');result[k]=data(d.value,depth+1,seen,budget);}
 seen.delete(value);return result;
}
async function checksum(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function frozen(value){if(value&&typeof value==='object'){for(const x of Object.values(value))frozen(x);Object.freeze(value);}return value;}
const OWNER_SQL=`SELECT d.id AS device_id,d.account_id,d.credential_version,d.credential_verifier,d.revoked_at,
 d.credential_issued_at,d.credential_expires_at,d.credential_lease_revision,d.credential_lifecycle,d.credential_clock_floor,
 a.state AS account_state,a.generation,a.admission_provenance,m.id AS membership_id,m.state AS membership_state,
 m.generation AS membership_generation,m.deleted_at AS membership_deleted_at,m.sync_user_id,m.write_epoch,
 c.generation AS runtime_generation,CASE WHEN c.rollout_mode IN ('cohort','open') AND c.account_save_enabled=1 THEN 1 ELSE 0 END AS save_enabled,${TIME} AS owner_now,
 EXISTS(SELECT 1 FROM sync_membership_device_links l JOIN sync_devices pd ON pd.id=l.app_device_id
 WHERE l.account_id=a.id AND l.membership_id=m.id AND l.account_device_id=d.id AND l.app_device_id=?
 AND pd.user_id=m.sync_user_id AND pd.app_id='port' AND pd.revoked_at IS NULL) AS device_linked
 FROM sync_account_devices d JOIN sync_accounts a ON a.id=d.account_id
 LEFT JOIN sync_account_memberships m ON m.account_id=a.id AND m.app_id='port'
 LEFT JOIN sync_account_runtime_control c ON c.singleton_id=1 WHERE d.id=?`;

export function createIsolatedAccountSaveTransaction({db,policy,accountPepper,devicePepper,proPepper,fixtureOnly=false,allowPortRecords=false,requireLifecycleBinding=false,enableAuthorityReauthorization=false,enableOperationLease=false,enableOwnerCutover=false,enableConsumerReadmission=false,enableSuccessorRecovery=false,enableSuccessorTwoCycle=false,operationLeaseTtlMs=10000,checkpoint=async()=>{}}={}){
 if(![true,false].includes(allowPortRecords)||allowPortRecords&&(enableOperationLease||enableOwnerCutover||enableAuthorityReauthorization)||fixtureOnly!==true||typeof db?.withSession!=='function'||[accountPepper,devicePepper,proPepper].some(p=>typeof p!=='string'||p.length<32))throw error('backend-isolation-required');
 const handles=new WeakMap();let disposed=false;
 let ownerSql=requireLifecycleBinding?OWNER_SQL.replace('SELECT d.id AS','SELECT d.credential_account_generation,d.credential_membership_id,d.credential_membership_generation,c.account_history_enabled AS history_enabled,d.id AS'):OWNER_SQL;
 if(enableSuccessorRecovery)ownerSql=ownerSql.replace('SELECT ','SELECT d.credential_recovery_json,d.credential_operations_json,d.credential_transition_id, ');
 if(enableOperationLease)ownerSql=ownerSql.replace('SELECT ','SELECT d.operation_fence_revision, ');
 if(enableOwnerCutover&&(!enableOperationLease||!requireLifecycleBinding))throw error('owner-cutover-mode-invalid');
 if(enableSuccessorTwoCycle&&!enableSuccessorRecovery)throw error('two-cycle-mode-invalid');
 if(enableSuccessorRecovery&&(!enableConsumerReadmission||!enableOwnerCutover))throw error('successor-mode-invalid');
 if(enableConsumerReadmission&&!enableOwnerCutover)throw error('consumer-readmission-mode-invalid');
 const successors=createSuccessorRecoveryOwner({db,checksum,guard,checkpoint,historical:successorHistory});
 const cutovers=createOwnerCutoverOwner({db,checksum,guard,checkpoint,enableConsumerReadmission,enableSuccessorRecovery,enableSuccessorTwoCycle});
 const leases=createOperationLeaseOwner({db,checksum,guard,checkpoint,leaseTtlMs:operationLeaseTtlMs,...(enableOwnerCutover?{operationGate:cutovers.operationGate}:{})});
 const live=()=>{if(disposed)throw error('backend-disposed');};
 const attempt=fn=>async(...args)=>{try{live();return await fn(...args);}catch(e){return closed({ok:false,reason:e.code||e.message||'backend-unavailable',recoveryRequired:true});}};
 async function fixed(input){
  const q=data(input);if(Object.keys(q).length!==keys.length||!keys.every(k=>Object.hasOwn(q,k))||
   q.contractVersion!==1||q.purpose!=='backend-port-save'||!policyAllows(policy,q.accountId)||
   !['accountId','accountDeviceId','membershipId','datasetId','appDeviceId','localGeneration','localRevision'].every(k=>text(q[k]))||
   !['accountGeneration','membershipGeneration','credentialVersion','credentialLeaseRevision','runtimeGeneration','writeEpoch'].every(k=>positive(q[k])))throw error('backend-binding-invalid');
  const parsed=await validateOperation(q.operation,crypto,'port');
  if(!parsed.ok||!uuid(q.operation.operationId))throw error('backend-operation-invalid');
  if(!allowPortRecords && (parsed.operation.recordType!=='metronome_settings'||parsed.operation.recordId!=='default'||parsed.operation.deleted))throw error('backend-operation-invalid');
  const bpm=parsed.operation.payload?.value?.bpm;if(!allowPortRecords&&(!Number.isInteger(bpm)||bpm<30||bpm>240))throw error('backend-operation-invalid');
  return {q,operation:parsed.operation,digest:await checksum(q)};
 }
 async function clockFact(session,q,verifier,observed){
  if(requireLifecycleBinding)return observeOwnerClock(session,observed);
  // Restrictive owner fact only, separate from data mutation. A denial is never
  // reported as durably observed expiry until this owner write is proven.
  const r=await session.prepare(`UPDATE sync_account_devices SET
   credential_clock_floor=MAX(credential_clock_floor,${TIME}),
   credential_lifecycle=CASE WHEN credential_lifecycle='active' AND typeof(credential_expires_at)='integer'
    AND credential_expires_at<=${TIME} THEN 'expired' ELSE credential_lifecycle END
   WHERE id=? AND account_id=? AND credential_version=? AND credential_verifier=? ${requireLifecycleBinding?"AND typeof(credential_clock_floor)='integer' AND credential_clock_floor>0":''}`)
   .bind(q.accountDeviceId,q.accountId,q.credentialVersion,verifier).run();
  if(r?.success===false)throw error('backend-owner-clock-unproven');
 }
 async function authenticate(q,credentials,{recordClock=true,history=false}={}){
  const token=typeof credentials?.accountAuthorization==='string'&&credentials.accountAuthorization.startsWith('Bearer ')?credentials.accountAuthorization.slice(7):null;
  if(parseAccountCredential(token)?.deviceId!==q.accountDeviceId)throw error('backend-account-credential-invalid');
  const session=db.withSession('first-primary');let row=await session.prepare(ownerSql).bind(q.appDeviceId,q.accountDeviceId).first();
  const verified=await verifyAccountCredentialSnapshot(row,token,accountPepper);if(!verified?.row)throw error('backend-account-credential-invalid');
  if(requireLifecycleBinding&&(!positive(row.credential_clock_floor)||!positive(row.credential_lease_revision)))throw error('backend-owner-clock-or-lease-unknown');
  if(history&&(row.account_id!==q.accountId||row.membership_id!==q.membershipId||row.sync_user_id!==q.datasetId))throw error('backend-history-identity-mismatch');
  if(recordClock){await clockFact(session,q,row.credential_verifier,row);row=await db.withSession('first-primary').prepare(ownerSql).bind(q.appDeviceId,q.accountDeviceId).first();
   if(!(await verifyAccountCredentialSnapshot(row,token,accountPepper))?.row)throw error('backend-account-credential-invalid');}
  if(requireLifecycleBinding&&(!row||row.credential_account_generation!==row.generation||row.credential_membership_id!==row.membership_id||row.credential_membership_generation!==row.membership_generation))throw error('backend-credential-generation-unbound');
  if(history){if(!requireLifecycleBinding||row.account_id!==q.accountId||row.device_id!==q.accountDeviceId||row.membership_id!==q.membershipId||row.sync_user_id!==q.datasetId)throw error('backend-history-identity-mismatch');
   q={...q,accountGeneration:row.generation,membershipGeneration:row.membership_generation,credentialVersion:row.credential_version,credentialLeaseRevision:row.credential_lease_revision,runtimeGeneration:row.runtime_generation,writeEpoch:row.write_epoch};}
  const lifecycle=evaluateSaveCredential(history?{...row,save_enabled:row.history_enabled}:row,q,row?.owner_now);
  if(lifecycle!=='valid'||row.credential_lease_revision!==q.credentialLeaseRevision||row.runtime_generation!==q.runtimeGeneration||row.sync_user_id!==q.datasetId||row.write_epoch!==q.writeEpoch)throw error('backend-owner-'+lifecycle);
  return {session,row,q};
 }
 async function writerAuthorization(q,credentials,auth){
   const appToken=credentials?.appAuthorization?.startsWith('Bearer ')?credentials.appAuthorization.slice(7):null;
   if(parseDeviceCredential(appToken)?.deviceId!==q.appDeviceId)throw error('backend-app-credential-invalid');
   const pro=await inspectProCredentialReadOnly(credentials.proAuthorization,{SYNC_DB:db,PRO_CREDENTIAL_PEPPER:proPepper},{includeWriterProof:true,now:()=>auth.row.owner_now});
   if(!pro.ok||!pro.writerProof)throw error(pro.code||'pro_required');
   const admission=await admitWriter(auth.session,{userId:q.datasetId,deviceId:q.appDeviceId,appId:'port'},
    {writerProtocol:2,syncProtocol:1,expectedWriteEpoch:q.writeEpoch},{accountId:q.accountId,membershipId:q.membershipId},
    {policy,deviceVerifier:await hmacVerifier(appToken,devicePepper),proCredentialId:pro.writerProof.id,proVerifier:pro.writerProof.verifier,defer:true});
   if(admission.error)throw error(admission.error);
   return admission;
 }
 function guard(session,p,{observation=false}={}){
  const {q,row}=p,sql=`EXISTS(SELECT 1 FROM (${ownerSql}) o WHERE
   o.account_id=? AND o.device_id=? AND o.generation=? AND o.membership_id=? AND o.membership_generation=?
   AND o.sync_user_id=? AND o.write_epoch=? AND o.credential_version=? AND o.credential_verifier=?
   AND o.credential_lease_revision=? AND o.runtime_generation=? AND o.account_state='active' AND o.admission_provenance='production'
   AND o.membership_state='active' AND o.membership_deleted_at IS NULL AND o.revoked_at IS NULL AND o.device_linked=1
   AND ${p.history?'o.history_enabled':'o.save_enabled'}=1 AND ${observation?"o.credential_lifecycle IN ('active','renewing','expired')":"o.credential_lifecycle='active'"}
   ${requireLifecycleBinding?'AND '+ownerBindingSQL('o'):''}
   AND typeof(o.credential_clock_floor)='integer' AND o.credential_clock_floor>0 AND o.owner_now>=o.credential_clock_floor
   AND typeof(o.credential_issued_at)='integer' AND o.credential_issued_at>0 AND o.credential_issued_at<=o.owner_now
   AND typeof(o.credential_expires_at)='integer' AND o.credential_expires_at>o.credential_issued_at ${observation?'':'AND o.owner_now<o.credential_expires_at'})`;
  return {sql,values:[q.appDeviceId,q.accountDeviceId,q.accountId,q.accountDeviceId,q.accountGeneration,q.membershipId,q.membershipGeneration,
   q.datasetId,q.writeEpoch,q.credentialVersion,row.credential_verifier,q.credentialLeaseRevision,q.runtimeGeneration]};
 }
 function guardedDatabase(session,p){
  const query=guard(session,p),q=p.q,op=p.operation;
  const noReplay=`NOT EXISTS(SELECT 1 FROM sync_changes WHERE user_id=? AND app_id='port' AND operation_id=?)`;
  const cas=`COALESCE((SELECT revision FROM sync_records WHERE user_id=? AND app_id='port' AND record_type=? AND record_id=?),0)=?`;
  return {prepare:session.prepare.bind(session),async batch(statements){
   const bind=session.prepare(`UPDATE sync_changes SET isolated_request_digest=?,isolated_account_binding=?
    WHERE user_id=? AND app_id='port' AND operation_id=? AND operation_hash=? AND isolated_request_digest IS NULL`)
    .bind(p.digest,canonicalJson(q),q.datasetId,op.operationId,op.operationHash);
   const exact=`EXISTS(SELECT 1 FROM sync_changes l JOIN sync_records r ON r.user_id=l.user_id AND r.app_id=l.app_id
    AND r.record_type=l.record_type AND r.record_id=l.record_id WHERE l.user_id=? AND l.app_id='port' AND l.operation_id=?
    AND l.operation_hash=? AND l.isolated_request_digest=? AND l.isolated_account_binding=? AND l.revision=?
    AND l.payload_hash=? AND l.payload_json IS ? AND ${op.deleted?'l.deleted_at IS NOT NULL':'l.deleted_at IS NULL'} AND l.schema_version=1
    AND r.revision=l.revision AND r.last_operation_id=l.operation_id AND r.payload_hash=l.payload_hash AND r.payload_json IS l.payload_json AND r.deleted_at IS l.deleted_at)`;
   const leasePrefix=p.lease?leases.condition(p):null;
   const prefix=assertion(session,query.sql+' AND '+noReplay+' AND '+cas+(leasePrefix?' AND '+leasePrefix.sql:''),[...query.values,q.datasetId,op.operationId,q.datasetId,op.recordType,op.recordId,op.baseRevision,...(leasePrefix?.values||[])]);
   const final=assertion(session,query.sql+' AND '+exact,[...query.values,q.datasetId,op.operationId,op.operationHash,p.digest,canonicalJson(q),op.baseRevision+1,op.payloadHash,op.deleted?null:canonicalJson(op.payload)]);
   const w=fenceQuery(p.admission,{payload:op.payload}),finalWriter=session.prepare('INSERT INTO sync_writer_fence_assertion(code) '+w.sql).bind(...w.values);
   const leaseFinal=p.lease?leases.condition(p,'committed'):null;
   const jointFinal=p.lease?assertion(session,query.sql+' AND '+exact+` AND EXISTS(SELECT 1 FROM (${w.sql}) f WHERE f.code='ok') AND `+leaseFinal.sql,[...query.values,q.datasetId,op.operationId,op.operationHash,p.digest,canonicalJson(q),op.baseRevision+1,op.payloadHash,op.deleted?null:canonicalJson(op.payload),...w.values,...leaseFinal.values]):final;
   const result=await session.batch([prefix,...statements,bind,...(p.lease?[leases.consume(session,p)]:[]),finalWriter,jointFinal,clearAssertions(session)]);
   if(!Array.isArray(result)||result.some(r=>r?.success===false))throw error('backend-transaction-unproven');
   return result.slice(1,1+statements.length);
  }};
 }
 async function receipt(binding,authorization){
  if(!binding||binding.contractVersion!==1||binding.purpose!=='backend-save-receipt-binding')throw error('backend-receipt-invalid');
  const p=await fixed(binding.request);if(p.digest!==binding.requestDigest)throw error('backend-receipt-mismatch');
  const q=p.q,op=p.operation,session=db.withSession('first-primary');
  let row;
  if(authorization){
   const g=guard(session,authorization,{observation:true});
   const fields=['operation_hash','isolated_request_digest','isolated_account_binding','record_type','record_id','revision','payload_hash','payload_json','deleted_at','schema_version','change_seq'];
   const encoded=fields.map(k=>"'"+k+"',l."+k).join(',');
   // One updated device row, one sqlite3_step: its 'now' is stable. Returning
   // no receipt still commits the terminal expired fact observed in this step.
   const out=await session.prepare(`UPDATE sync_account_devices SET credential_clock_floor=MAX(credential_clock_floor,${TIME}),
    credential_lifecycle=CASE WHEN credential_lifecycle IN ('active','renewing') AND credential_expires_at<=${TIME} THEN 'expired' ELSE credential_lifecycle END
    WHERE id=? AND ${g.sql}
    RETURNING CASE WHEN credential_lifecycle='active' AND ${TIME}<credential_expires_at THEN
    (SELECT json_object(${encoded}) FROM sync_changes l WHERE l.user_id=? AND l.app_id='port' AND l.operation_id=?) ELSE NULL END AS receipt_json`)
    .bind(q.accountDeviceId,...g.values,q.datasetId,op.operationId).all();
   if(out?.success!==true||out.results?.length!==1)throw error('backend-history-clock-unproven');
   row=out.results[0].receipt_json?JSON.parse(out.results[0].receipt_json):null;
  }else row=await session.prepare(`SELECT * FROM sync_changes WHERE user_id=? AND app_id='port' AND operation_id=?`).bind(q.datasetId,op.operationId).first();
  if(!row||row.isolated_request_digest!==p.digest||row.isolated_account_binding!==canonicalJson(q)||row.operation_hash!==op.operationHash||
   row.record_type!==op.recordType||row.record_id!==op.recordId||row.revision!==op.baseRevision+1||row.payload_hash!==op.payloadHash||
   row.payload_json!==(op.deleted?null:canonicalJson(op.payload))||(op.deleted?row.deleted_at===null:row.deleted_at!==null)||row.schema_version!==1||await hashRecord({recordType:row.record_type,recordId:row.record_id,schemaVersion:row.schema_version,payload:row.payload_json===null?null:JSON.parse(row.payload_json)},crypto,'port')!==row.payload_hash)
   throw error('backend-receipt-unproven');
  return closed({ok:true,backendCommitted:true,historical:true,receipt:{operationId:op.operationId,requestDigest:p.digest,datasetId:q.datasetId,
   accountId:q.accountId,accountGeneration:q.accountGeneration,membershipGeneration:q.membershipGeneration,revision:row.revision,changeSeq:row.change_seq,payloadHash:row.payload_hash}});
 }
 async function prepareSave(input,credentials){
   const p=await fixed(input);const auth=await authenticate(p.q,credentials);p.row=auth.row;
   const current=await auth.session.prepare("SELECT payload_json FROM sync_records WHERE user_id=? AND app_id='port' AND record_type='metronome_settings' AND record_id='default'").bind(p.q.datasetId).first();
   if(!allowPortRecords&&current){const previous=JSON.parse(current.payload_json),next=data(p.operation.payload);delete previous.value.bpm;delete next.value.bpm;
    if(canonicalJson(previous)!==canonicalJson(next))throw error('backend-non-bpm-conflict');}
   const admission=await writerAuthorization(p.q,credentials,auth);
   const binding=frozen(JSON.parse(canonicalJson({contractVersion:1,purpose:'backend-save-receipt-binding',request:p.q,requestDigest:p.digest})));
   const handle=closed({ok:true,binding});handles.set(handle,{...p,admission,credentials,attempted:false});await checkpoint('after-prepare');return handle;
 }
async function reconcileLease(envelope,lease,credentials,{current=false}={}){
   if(!enableOperationLease||!requireLifecycleBinding)throw error('operation-lease-unavailable');envelope=frozen(data(envelope));validateOperationEnvelope(envelope);if(envelope.schemaVersion===3&&!enableConsumerReadmission)throw error('consumer-readmission-unavailable');
   lease=frozen(data(lease));let p;if(current){const h=await prepareSave(envelope.request,credentials);p=handles.get(h);}else{p=await fixed(envelope.request);const auth=await authenticate(p.q,credentials,{recordClock:true,history:true});p.row=auth.row;p.admission=await writerAuthorization(p.q,credentials,auth);}
   const row=await leases.status(envelope,lease,p);if(row.state!=='committed')return closed({ok:true,state:row.state,backendCommitted:false,historical:true});
   if(current){if(enableOwnerCutover)await cutovers.binding(envelope,p);const c=leases.condition(p,'committed'),g=guard(db.withSession('first-primary'),p),w=fenceQuery(p.admission,{payload:p.operation.payload});const r=await db.withSession('first-primary').prepare('SELECT ('+c.sql+' AND '+g.sql+` AND EXISTS(SELECT 1 FROM (${w.sql}) f WHERE f.code='ok')) AS valid`).bind(...c.values,...g.values,...w.values).first();if(r?.valid!==1)throw error('operation-lease-current-unproven');}
   const auth=await authenticate(p.q,credentials,{recordClock:true,history:true}),saved=await receipt({contractVersion:1,purpose:'backend-save-receipt-binding',request:p.q,requestDigest:p.digest},{q:auth.q,row:auth.row,history:true});return closed({...saved,operationLeaseReceipt:await leases.commitReceipt(p,saved)});
  }
 async function successorHistory(envelope,lease,credentials){
  if(!enableSuccessorRecovery||!requireLifecycleBinding)throw error('successor-history-unavailable');
  envelope=frozen(data(envelope));lease=frozen(data(lease));validateOperationEnvelope(envelope);
  const p=await fixed(envelope.request),auth=await authenticate(p.q,credentials,{history:true});
  if(['accountGeneration','membershipGeneration','runtimeGeneration','writeEpoch'].some(k=>p.q[k]!==auth.q[k]))throw error('successor-history-identity-mismatch');
  const admission=await writerAuthorization(auth.q,credentials,auth),oldRow={...auth.row};
  const archive=enableSuccessorTwoCycle?await readTwoCycleArchive(db,auth.row):null;
  if(p.q.credentialVersion!==auth.q.credentialVersion||p.q.credentialLeaseRevision!==auth.q.credentialLeaseRevision)oldRow.credential_verifier=await predecessorVerifier(auth.row,p.q,archive?.packet);
  const historical={...p,row:oldRow,admission},row=await leases.status(envelope,lease,historical);
  let saved=null;if(row.state==='committed')saved=await receipt({contractVersion:1,purpose:'backend-save-receipt-binding',request:p.q,requestDigest:p.digest},{q:auth.q,row:auth.row,history:true});
  const current={q:auth.q,row:auth.row,admission,history:true},g=guard(auth.session,current),w=fenceQuery(admission);
  await checkpoint('before-successor-history-final');const final=await auth.session.prepare('SELECT ('+g.sql+` AND EXISTS(SELECT 1 FROM (${w.sql}) f WHERE f.code='ok') ${archive?'AND '+archive.guard.sql:''}) AS valid`).bind(...g.values,...w.values,...(archive?archive.guard.values:[])).first();
  if(final?.valid!==1)throw error('successor-history-permission-unproven');
  if(!saved)return closed({ok:true,historical:true,currentAuthorization:false,backendCommitted:false,state:auth.row.operation_fence_revision>lease.fencingRevision?'fenced-not-committed':'not-committed',operationId:p.q.operation.operationId});
  return closed({...saved,historical:true,currentAuthorization:false,operationLeaseReceipt:await leases.commitReceipt(historical,saved)});
 }
 async function successorContext(input,credentials){
  if(!enableSuccessorRecovery)throw error('successor-unavailable');const q=frozen(data(input));validateSuccessorStopRequest(q);validateReauthorizationRequest(q.request);const p=await fixed(q.anchorRequest),auth=await authenticate(p.q,credentials);p.row=auth.row;p.credentials=credentials;p.admission=await writerAuthorization(p.q,credentials,auth);
  if(q.request.contractVersion===3){if(!enableSuccessorTwoCycle)throw error('two-cycle-unavailable');const archive=await readTwoCycleArchive(db,p.row,{required:true}),a=archive.packet,s=q.request.successor;
   if(a.nextBeginOperationId!==p.row.credential_transition_id||a.scope.requestDigest!==s.previousRequestDigest||a.scope.completionDigest!==s.previousCompletionDigest||a.scope.registryRevision!==s.registryRevision||a.scope.stopFenceRevision!==s.stopFenceRevision||a.scope.pointerDigest!==await checksum(s.sourcePointer)||a.scope.consumerJSON!==canonicalJson(s.consumer))throw error('two-cycle-scope-unproven');
   await predecessorVerifier(p.row,{...p.q,credentialVersion:a.binding.oldVersion,credentialLeaseRevision:a.binding.oldLease-1},a);p.lineageGuard=archive.guard;
  }return {q,p};
 }
 async function cutoverContext(input,credentials){
  if(!enableOwnerCutover)throw error('owner-cutover-unavailable');const q=frozen(data(input));validateCutoverRequest(q);const p=await fixed(q.anchorRequest),auth=await authenticate(p.q,credentials);p.row=auth.row;p.admission=await writerAuthorization(p.q,credentials,auth);return {q,p};
 }
 return Object.freeze({fixtureOnly:true,
  successorHistory:attempt(successorHistory),
  successorStop:attempt(async(input,credentials)=>{const {q,p}=await successorContext(input,credentials);return closed({ok:true,...await successors.stop(q,p)});}),
  successorInspect:attempt(async(input,credentials)=>{const {q,p}=await successorContext(input,credentials);return closed({ok:true,...await successors.inspect(q,p)});}),
  successorConfirm:attempt(async(input,credentials)=>{const {q,p}=await successorContext(input?.request,credentials);return closed({ok:true,...await successors.confirm(q,p,frozen(data(input?.completion)))});}),
  successorReconcile:attempt(async(input,credentials)=>{const {q,p}=await successorContext(input,credentials);return closed({ok:true,...await successors.reconcile(q,p)});}),
  prepare:attempt(async(...args)=>{if(enableOperationLease)throw error('operation-lease-required');return prepareSave(...args);}),
  issueOperationLease:attempt(async(envelope,credentials)=>{
   if(!enableOperationLease||!requireLifecycleBinding)throw error('operation-lease-unavailable');envelope=frozen(data(envelope));validateOperationEnvelope(envelope);if(envelope.schemaVersion===3&&!enableConsumerReadmission)throw error('consumer-readmission-unavailable');
   const h=await prepareSave(envelope.request,credentials),p=handles.get(h);if(enableOwnerCutover)await cutovers.binding(envelope,p);const lease=await leases.issue(envelope,p);return closed({ok:true,lease});
  }),
  prepareLeased:attempt(async(envelope,lease,credentials)=>{
   if(!enableOperationLease||!requireLifecycleBinding)throw error('operation-lease-unavailable');envelope=frozen(data(envelope));validateOperationEnvelope(envelope);if(envelope.schemaVersion===3&&!enableConsumerReadmission)throw error('consumer-readmission-unavailable');lease=frozen(data(lease));const h=await prepareSave(envelope.request,credentials),p=handles.get(h);if(enableOwnerCutover)await cutovers.binding(envelope,p);await leases.requireIssued(envelope,lease,p);return h;
  }),
  reconcileLeased:attempt(reconcileLease),
  cutoverStop:attempt(async(input,credentials)=>{const {q,p}=await cutoverContext(input,credentials);return closed({ok:true,stopReceipt:await cutovers.stop(q,p),phase:'stopped'});}),
  cutoverInspect:attempt(async(input,credentials)=>{const {q,p}=await cutoverContext(input,credentials);return closed({ok:true,...await cutovers.inspect(q,p,(e,l)=>reconcileLease(e,l,credentials))});}),
  cutoverQualify:attempt(async(input,credentials)=>{
   const {q,p}=await cutoverContext(input?.request,credentials),intent=frozen(data(input?.intent));
   if(!intent||!isUUID(intent.operationId)||!isDigest(intent.sourceDigest)||!isDigest(intent.rosterDigest)||!['owner-cutover-publication-intent-v1','owner-cutover-recovery-intent-v1'].includes(intent.purpose))throw error('owner-cutover-intent-invalid');
   const roster=await cutovers.inspect(q,p,(e,l)=>reconcileLease(e,l,credentials));if(roster.rosterDigest!==intent.rosterDigest)throw error('owner-cutover-roster-stale');
   if(intent.purpose==='owner-cutover-recovery-intent-v1'){const item=roster.items.find(i=>i.operationId===intent.sourceOperationId);if(!item||item.state!=='backend-committed'||roster.latest?.last_operation_id!==item.operationId||roster.latest.revision!==item.backendFact.revision||roster.latest.payload_hash!==item.backendFact.payloadHash)throw error('owner-cutover-recovery-stale');}
   const qualification=await cutovers.qualify(q,p,{sourceDigest:intent.sourceDigest,rosterDigest:intent.rosterDigest,purpose:'owner-cutover-current-qualification-v1',operationId:intent.operationId,operationDigest:await checksum(intent)});return closed({ok:true,qualification:{...qualification,intent,intentDigest:await checksum(intent)}});
  }),
  cutoverConfirm:attempt(async(input,credentials)=>{const {q,p}=await cutoverContext(input?.request,credentials);return closed({ok:true,...await cutovers.confirm(q,p,frozen(data(input?.completion)))});}),
  cutoverReconcile:attempt(async(input,credentials)=>{const {q,p}=await cutoverContext(input,credentials);return closed({ok:true,...await cutovers.reconcile(q,p)});}),
  // A current owner qualification fact, NEVER a lease through local IDB
  // publication. Its purpose/ledger is separate from dataset/Account receipts.
  reauthorize:attempt(async(input,credentials)=>{
   if(!enableAuthorityReauthorization||!requireLifecycleBinding)throw error('reauthorization-unavailable');
   const request=data(input);validateReauthorizationRequest(request);if([2,3].includes(request.contractVersion)&&!enableSuccessorRecovery||request.contractVersion===3&&!enableSuccessorTwoCycle)throw error('successor-unavailable');const requestDigest=await checksum(request);
   const appToken=credentials?.appAuthorization?.startsWith('Bearer ')?credentials.appAuthorization.slice(7):null,appDeviceId=parseDeviceCredential(appToken)?.deviceId;
   if(!appDeviceId)throw error('reauthorization-app-invalid');
   const first=await db.withSession('first-primary').prepare(ownerSql).bind(appDeviceId,request.accountDeviceId).first();
   if(!first)throw error('reauthorization-owner-unknown');
   const q={...request,appDeviceId,datasetId:first.sync_user_id,writeEpoch:first.write_epoch},auth=await authenticate(q,credentials),admission=await writerAuthorization(q,credentials,auth);
   const g=guard(auth.session,{q,row:auth.row}),w=fenceQuery(admission),binding=canonicalJson(request);
   await checkpoint('before-reauthorization-transaction');live();
   const results=await auth.session.batch([
    assertion(auth.session,g.sql,g.values),
    auth.session.prepare('INSERT INTO sync_writer_fence_assertion(code) '+w.sql).bind(...w.values),
    auth.session.prepare(`INSERT INTO sync_account_authority_reauthorizations(account_id,operation_id,request_digest,request_json,observed_at)
     VALUES (?,?,?,?,${TIME}) ON CONFLICT(account_id,operation_id) DO UPDATE SET observed_at=${TIME}
     WHERE request_digest=excluded.request_digest AND request_json=excluded.request_json`).bind(q.accountId,q.operationId,requestDigest,binding),
    assertion(auth.session,g.sql+` AND EXISTS(SELECT 1 FROM (${w.sql}) f WHERE f.code='ok') AND EXISTS(SELECT 1 FROM sync_account_authority_reauthorizations WHERE account_id=? AND operation_id=? AND request_digest=? AND request_json=?)`,[...g.values,...w.values,q.accountId,q.operationId,requestDigest,binding]),clearAssertions(auth.session)]);
   if(!Array.isArray(results)||results.some(r=>r?.success===false))throw error('reauthorization-unproven');
   await checkpoint('after-reauthorization-transaction');live();
   return closed({ok:true,qualification:{purpose:'authority-reauthorization-qualification-v1',request:JSON.parse(binding),requestDigest,
    datasetId:q.datasetId,appDeviceId:q.appDeviceId,writeEpoch:q.writeEpoch,credentialExpiresAt:auth.row.credential_expires_at,
    proChecked:true,writerChecked:true,leaseThroughLocalCommit:false}});
  }),
  commit:attempt(async(handle)=>{
   const p=handles.get(handle);if(!p||p.attempted)throw error('backend-replay-requires-recovery');p.attempted=true;
   await checkpoint('before-transaction');live();
   const session=db.withSession('first-primary'),protectedDb=guardedDatabase(session,p),wrapped=writerMutationDatabase(protectedDb,p.admission);
   // Writer wrappers may clear their assertion rows, but the final Account/data
   // assertion remains in this same outer batch, after those statements.
   try{
    const result=await createD1SyncRepository(wrapped).applyOperation({userId:p.q.datasetId,deviceId:p.q.appDeviceId,appId:'port'},p.operation);
    if(result.status!=='applied')throw error(result.status==='duplicate'?'backend-replay-requires-recovery':'backend-'+result.status);
   }catch(e){await clockFact(db.withSession('first-primary'),p.q,p.row.credential_verifier,p.row);throw e;}
   await checkpoint('after-transaction');const saved=await receipt(handle.binding);return p.lease?closed({...saved,operationLeaseReceipt:await leases.commitReceipt(p,saved)}):saved;
  }),
  reconcile:attempt(async(binding,credentials)=>{const p=await fixed(binding?.request);await authenticate(p.q,credentials,{recordClock:false});return receipt(binding);}),
  // Separate current history permission from the historical operation binding.
  // Final identity/expiry/generation gate and receipt read are ONE SQL SELECT.
  reconcileCurrent:attempt(async(binding,credentials)=>{if(!requireLifecycleBinding)throw error('backend-history-contract-required');const p=await fixed(binding?.request),auth=await authenticate(p.q,credentials,{recordClock:true,history:true});
   await checkpoint('before-history-read');return receipt(binding,{q:auth.q,row:auth.row,history:true});}),
  dispose(){disposed=true;}
 });
}
