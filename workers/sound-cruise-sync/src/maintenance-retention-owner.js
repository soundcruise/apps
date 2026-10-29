import { createIsolatedMaintenanceBridgeV2, maintenanceCanonical, maintenanceDigest } from './maintenance-bridge-v2.js';
import { ownerContext, accountOwnerAssertions } from './maintenance-owner-profiles.js';
import { readSyncContext, syncOwnerAssertions } from './maintenance-sync-owner.js';
import { CLEANUP_RETENTION } from './cleanup-database.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOW="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
const q=(sql,...params)=>({sql:'SELECT CASE WHEN ('+sql+') THEN 1 ELSE 0 END AS ok',params});
export const RETENTION_KINDS=Object.freeze(['account-dormancy','account-recovery-attempts','account-preservation-plan','sync-preservation-plan']);
// Explicit isolated Owner capability only. No normal Scheduled import or production service auth.
export function createIsolatedMaintenanceRetentionOwner({db,env,scopeForAccount}){
 if(!db?.batch||typeof scopeForAccount!=='function')throw Error('retention_dependencies');
 async function context(request,job){
  if(!job||!UUID.test(job.operationId||'')||!RETENTION_KINDS.includes(job.kind)||Object.keys(job).some(k=>!['operationId','kind','appId'].includes(k)))throw Error('retention_job_hold');
  const origin=request.headers.get('Origin');if(!origin||!String(env.ACCOUNT_ALLOWED_ORIGINS).split(',').map(x=>x.trim()).includes(origin)||new URL(request.url).hash)throw Error('retention_origin_hold');
  if(request.headers.has('X-Sound-Cruise-QA-Authorization'))throw Error('retention_qa_hold');
  const route={owner:'account',state:'account-device',lane:'security',method:'GET'};
  const ctx=await ownerContext({request,body:{...job,appAuthorization:request.headers.get('X-Sound-Cruise-App-Authorization')||'',proAuthorization:request.headers.get('X-Sound-Cruise-Pro-Authorization')||''},route,operationId:job.operationId,env,db,dependencies:{}});
  if(!ctx.account)throw Error('retention_account_owner_hold');
  let sync=null;
  if(job.kind==='sync-preservation-plan'){
   const syncAuth=request.headers.get('X-Sound-Cruise-App-Authorization');if(!syncAuth)throw Error('retention_sync_owner_hold');
   const headers=new Headers(request.headers);headers.set('Authorization',syncAuth);
   sync=await readSyncContext({request:new Request(request.url,{headers}),body:{appId:job.appId},route:{owner:'sync',state:'sync-managed-device',lane:'writer'},operationId:job.operationId,env,db,dependencies:{},fingerprint:ctx.fingerprint});
   if(!sync.valid||sync.proof[8]!==ctx.account.accountId)throw Error('retention_sync_account_mismatch');
  }else if(job.appId!==undefined)throw Error('retention_job_scope');
  const accountId=ctx.account.accountId,scope=scopeForAccount(accountId,job.kind);if(typeof scope!=='string'||!scope||scope.length>128)throw Error('retention_scope');
  const actor=Object.freeze({...ctx.actor,purpose:'scheduled-'+job.kind});
  const c=await db.prepare('SELECT epoch,phase FROM sync_maintenance_v2_control WHERE scope=?').bind(scope).first();if(!c)throw Error('retention_control_missing');
  // Account authority is always verified. Sync plan additionally needs independent App/Pro proofs.
  const guards=()=>[...accountOwnerAssertions(ctx),...(sync?syncOwnerAssertions(sync):[])];
  const owner={id:actor.ownerId,validateIdentity:i=>maintenanceCanonical(i)===maintenanceCanonical(actor),async verify(r){return{allowed:maintenanceCanonical(r.identity)===maintenanceCanonical(actor),identityDigest:await maintenanceDigest(actor),assertions:guards()};},async verifyHandover(){return false;}};
  return{ctx,sync,accountId,scope,actor,control:c,owner,guards,core:createIsolatedMaintenanceBridgeV2({db,owner})};
 }
 function pendingGuard(c,except){return q("NOT EXISTS(SELECT 1 FROM sync_maintenance_v2_operations o WHERE o.operation_id<>? AND o.phase NOT IN('committed','resolved') AND (COALESCE(json_extract(o.binding_json,'$.subject.accountId'),json_extract(o.binding_json,'$.accountId'))=? OR COALESCE(json_extract(o.binding_json,'$.subject.accountId'),json_extract(o.binding_json,'$.accountId')) IS NULL))",except,c.accountId);}
 async function plan(c,job){
  const statements=[],guards=[];let outcome,summary;
  if(job.kind==='account-dormancy'){guards.push(pendingGuard(c,job.operationId));
   const row=await db.prepare('SELECT * FROM sync_account_activity WHERE account_id=?').bind(c.accountId).first();if(!row||row.state!=='active'||![row.last_activity_at,row.updated_at].every(n=>Number.isSafeInteger(n)&&n>=0)||row.updated_at<row.last_activity_at)throw Error('retention_activity_hold');
   const proof=JSON.stringify([row.state,row.last_activity_at,row.dormant_at,row.inactive_purge_after,row.updated_at]);
   guards.push(q("EXISTS(SELECT 1 FROM sync_account_activity WHERE account_id=? AND json_array(state,last_activity_at,dormant_at,inactive_purge_after,updated_at)=? AND state='active' AND updated_at<= "+NOW+" AND last_activity_at<= "+NOW+'-?)',c.accountId,proof,CLEANUP_RETENTION.accountDormantMs));
   statements.push({sql:"UPDATE sync_account_activity SET state='dormant',dormant_at=last_activity_at+?,inactive_purge_after=last_activity_at+?,updated_at="+NOW+" WHERE account_id=? AND state='active' AND last_activity_at=?",params:[CLEANUP_RETENTION.accountDormantMs,CLEANUP_RETENTION.accountInactivePurgeMs,c.accountId,row.last_activity_at]});
   outcome=q("changes()=1 AND EXISTS(SELECT 1 FROM sync_account_activity WHERE account_id=? AND state='dormant' AND last_activity_at=? AND dormant_at=? AND inactive_purge_after=?)",c.accountId,row.last_activity_at,row.last_activity_at+CLEANUP_RETENTION.accountDormantMs,row.last_activity_at+CLEANUP_RETENTION.accountInactivePurgeMs);
   summary={type:'account-dormancy-only-no-purge',targetDigest:await maintenanceDigest(row),deletedRows:0};
  }else if(job.kind==='account-recovery-attempts'){guards.push(pendingGuard(c,job.operationId));
   const row=await db.prepare('SELECT r.* FROM sync_account_recovery_attempts r JOIN sync_accounts a ON a.recovery_verifier=r.recovery_verifier WHERE a.id=?').bind(c.accountId).first();if(!row)throw Error('retention_attempt_absent');if(![row.first_attempt_at,row.last_attempt_at,row.attempts].every(Number.isSafeInteger)||row.first_attempt_at<0||row.last_attempt_at<row.first_attempt_at||row.attempts<1||row.attempts>5)throw Error('retention_attempt_unknown');
   guards.push(q('EXISTS(SELECT 1 FROM sync_accounts a JOIN sync_account_recovery_attempts r ON r.recovery_verifier=a.recovery_verifier WHERE a.id=? AND r.recovery_verifier=? AND r.first_attempt_at=? AND r.last_attempt_at=? AND r.attempts=? AND r.first_attempt_at<='+NOW+'-? AND r.last_attempt_at<='+NOW+'-?)',c.accountId,row.recovery_verifier,row.first_attempt_at,row.last_attempt_at,row.attempts,CLEANUP_RETENTION.recoveryAttemptMs,CLEANUP_RETENTION.recoveryAttemptMs));
   statements.push({sql:'DELETE FROM sync_account_recovery_attempts WHERE recovery_verifier=? AND first_attempt_at=? AND last_attempt_at=? AND attempts=?',params:[row.recovery_verifier,row.first_attempt_at,row.last_attempt_at,row.attempts]});
   outcome=q('changes()=1 AND NOT EXISTS(SELECT 1 FROM sync_account_recovery_attempts WHERE recovery_verifier=?)',row.recovery_verifier);
   summary={type:'expired-account-recovery-attempt-only',targetDigest:await maintenanceDigest(row),deletedRows:1};
  }else{
   // Preservation planning is a typed observation, not permission to purge expired source data.
   const pending=(await db.prepare("SELECT operation_id,phase,kind,pending_digest,receipt_digest FROM sync_maintenance_v2_operations WHERE COALESCE(json_extract(binding_json,'$.subject.accountId'),json_extract(binding_json,'$.accountId'))=? ORDER BY operation_id").bind(c.accountId).all()).results;
   const members=(await db.prepare('SELECT id,state,generation,sync_user_id FROM sync_account_memberships WHERE account_id=? ORDER BY id').bind(c.accountId).all()).results;
   const activity=await db.prepare('SELECT * FROM sync_account_activity WHERE account_id=?').bind(c.accountId).first();
   let dataset=null;if(c.sync){dataset=await db.prepare('SELECT * FROM sync_datasets WHERE user_id=? AND app_id=?').bind(c.sync.userId,c.sync.appId).first();if(!dataset)throw Error('retention_dataset_unknown');guards.push(q('EXISTS(SELECT 1 FROM sync_datasets WHERE user_id=? AND app_id=? AND schema_version=? AND state=? AND min_change_seq=? AND last_change_seq=?)',c.sync.userId,c.sync.appId,dataset.schema_version,dataset.state,dataset.min_change_seq,dataset.last_change_seq));}
   summary={type:'preservation-plan-not-deletion-authorization',classification:'HOLD',digestMeaning:'non-atomic-metadata-observation-not-full-source-backup',sourceDigest:await maintenanceDigest({pending,members,activity,dataset}),reason:'full-source-backup-device-ack-recovery-dependency-proof-required',retained:['receipts','claims','credentials','tombstones','watermarks','accounts','memberships','R2']};
   statements.push({sql:'SELECT 1 AS retained',params:[]});outcome=q('1=1');
  }
  return{statements,guards,outcome,summary};
 }
 async function run(request,job){
  const c=await context(request,job);await c.core.checkSchema();const existing=await db.prepare('SELECT phase FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(job.operationId).first();if(existing)throw Error('retention_reconcile_required');
  const p=await plan(c,job),r={kind:'mutation',operationId:job.operationId,scope:c.scope,expectedEpoch:c.control.epoch,identity:c.actor,action:{purpose:'isolated-retention',kind:job.kind,planDigest:await maintenanceDigest({statements:p.statements,summary:p.summary})}};
  c.owner.verify=async input=>({allowed:maintenanceCanonical(input.identity)===maintenanceCanonical(c.actor),identityDigest:await maintenanceDigest(c.actor),assertions:[...c.guards(),...p.guards]});
  const core=createIsolatedMaintenanceBridgeV2({db,owner:c.owner});
  return core.execute(r,{outcome:p.outcome,receiptDetails:{...p.summary,action:r.action},run:binding=>binding.batch(p.statements.map(s=>binding.prepare(s.sql).bind(...s.params)))});
 }
 async function reconcile(request,job){
  const c=await context(request,job),row=await db.prepare('SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(job.operationId).first();
  if(!row||row.scope!==c.scope||row.binding_json!==maintenanceCanonical(c.actor)||row.kind!=='mutation')throw Error('retention_reconcile_owner');
  if(!row.receipt_json)return{status:'unknown',pendingRetained:true};
  const receipt=JSON.parse(row.receipt_json);if(await maintenanceDigest(receipt)!==row.receipt_digest||receipt.details?.type===undefined)throw Error('retention_receipt_unknown');
  // Reconstruct the exact immutable action only; never rerun SQL or restore credentials.
  const type=receipt.details.type;if(!['account-dormancy-only-no-purge','expired-account-recovery-attempt-only','preservation-plan-not-deletion-authorization'].includes(type))throw Error('retention_receipt_type');
  // Request digest is bound by core matching; action is persisted in the receipt's request proof below.
  if(!receipt.details.action)throw Error('retention_action_missing');
  return c.core.reconcile({kind:'mutation',operationId:job.operationId,scope:c.scope,expectedEpoch:row.epoch,identity:c.actor,action:receipt.details.action});
 }
 async function resolveUnknown(request,job,{resolutionOperationId}={}){
  if(!UUID.test(resolutionOperationId||''))throw Error('retention_resolution_id');
  const c=await context(request,job),source=await db.prepare('SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(job.operationId).first();
  if(!source||source.scope!==c.scope||source.binding_json!==maintenanceCanonical(c.actor)||source.kind!=='mutation'||source.phase!=='registered'||source.receipt_json!==null||source.pending_json!==null||source.resolved_by!==null)throw Error('retention_resolution_hold');
  c.owner.verifyRecovery=async(r,old)=>({allowed:old.operation_id===job.operationId,operationFenceOnly:true,sourceDigest:await maintenanceDigest(old),outcomeDigest:await maintenanceDigest(r.outcome)});
  return createIsolatedMaintenanceBridgeV2({db,owner:c.owner}).recover({kind:'recovery',operationId:resolutionOperationId,scope:c.scope,expectedEpoch:c.control.epoch,identity:c.actor,sourceOperationId:source.operation_id,sourceRequestDigest:source.request_digest,pendingDigest:null,outcome:{classification:'registered-mutation-fenced-no-business-commit',retainedSources:true}});
 }
 return Object.freeze({run,reconcile,resolveUnknown});
}
