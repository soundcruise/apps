import {productionAccountAppAllowed} from './account-admission.js';
import {createIsolatedMaintenanceBridgeV2,maintenanceCanonical,maintenanceDigest} from './maintenance-bridge-v2.js';
import {ownerContext,accountOwnerAssertions} from './maintenance-owner-profiles.js';
import {hmacVerifier,parseDeviceCredential,timingSafeHexEqual} from './crypto.js';
import {inspectProCredentialReadOnly} from './pro-auth-app.js';
import {PRO_SESSION_IDLE_MS} from './pro-device-session.js';
import {createD1ChordAccountBridgeRepository} from './account-bridge-database.js';
import {createD1DeviceRepository} from './device-database.js';
import {accountManagedRecoveryVerifier} from './account-crypto.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safe=x=>Number.isSafeInteger(x)&&x>=1&&x<Number.MAX_SAFE_INTEGER;
const NOW="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
export const chordQuery=(sql,...params)=>({sql:'SELECT CASE WHEN ('+sql+') THEN 1 ELSE 0 END AS ok',params});
const q=chordQuery;
export function chordAccountPendingGuard(accountId){
 const targets=[['sync_account_recovery_claims','committed_at'],['sync_account_recovery_rotations','committed_at'],['sync_account_delete_intents','consumed_at'],['sync_membership_handoffs','consumed_at'],['sync_app_join_invitations','consumed_at'],['sync_port_join_invitations','consumed_at']];
 return q(targets.map(([table,completed])=>'NOT EXISTS(SELECT 1 FROM '+table+' WHERE account_id=? AND '+completed+' IS NULL AND cancelled_at IS NULL)').join(' AND '),...targets.map(()=>accountId));
}
export async function chordSnapshot(db,table,where,params=[]){
 const allowed=['sync_accounts','sync_account_devices','sync_account_memberships','sync_users','sync_devices','sync_datasets','sync_records','sync_changes','sync_chord_account_bridges','sync_membership_device_links','sync_account_managed_users'];
 if(!allowed.includes(table))throw Error('snapshot_table_hold');
 const columns=(await db.prepare("SELECT name FROM pragma_table_info('"+table+"') ORDER BY cid").all()).results.map(x=>x.name);if(!columns.length||columns.some(x=>!/^[a-z_]+$/.test(x)))throw Error('snapshot_schema_hold');
 const sql='SELECT json_group_array(json_array('+columns.join(',')+')) encoded FROM (SELECT * FROM '+table+' WHERE '+where+' ORDER BY '+columns.join(',')+')';
 const encoded=(await db.prepare(sql).bind(...params).first()).encoded;if(typeof encoded!=='string'||new TextEncoder().encode(encoded).byteLength>512*1024)throw Error('snapshot_bounded_scope_hold');
 return{table,sql,params,columns,encoded,guard:q('(SELECT encoded FROM ('+sql+'))=?',...params,encoded)};
}
export async function chordSource(db,userId,appId='chord'){
 const specs=[['sync_datasets',"user_id=? AND app_id=?"],['sync_records',"user_id=? AND app_id=?"],['sync_changes',"user_id=? AND app_id=?"]];
 const rows=await Promise.all(specs.map(([t,w])=>chordSnapshot(db,t,w,[userId,appId])));
 return{rows,digest:await maintenanceDigest({userId,appId,rows:rows.map(x=>({table:x.table,encoded:x.encoded}))})};
}
// Existing Account verifier and Pro verifier, read only. App HMAC check deliberately does
// not call inspectDeviceCredential(), which touches last_seen/activity on authentication.
export async function chordOwnerContext({db,env,request,job,history=false}){
 if(!UUID.test(job?.operationId||'')||Object.keys(job).some(k=>!['operationId','kind','bridgeId','expectedAccountGeneration','expectedBridgeGeneration','accountRecoveryVersion','recoverySaved'].includes(k)))throw Error('migration_job_hold');
 if(!String(env.ACCOUNT_ALLOWED_ORIGINS).split(',').map(x=>x.trim()).includes(request.headers.get('Origin'))||request.headers.has('X-Sound-Cruise-QA-Authorization'))throw Error('migration_origin_qa_hold');
 const body={...job,appAuthorization:request.headers.get('X-Sound-Cruise-App-Authorization')||'',proAuthorization:request.headers.get('X-Sound-Cruise-Pro-Authorization')||''};
 const ctx=await ownerContext({request,body,route:{method:'GET',owner:'account',state:'account-device',lane:'writer'},operationId:job.operationId,env,db,dependencies:{}});if(!ctx.account||![ctx.account.generation,ctx.account.recoveryVersion,ctx.device?.credential_version].every(safe))throw Error('migration_account_hold');
 const pro=await inspectProCredentialReadOnly(request.headers.get('X-Sound-Cruise-Pro-Authorization'),{...env,SYNC_DB:db},{includeWriterProof:true});
 if(pro?.ok!==true||!pro.writerProof)throw Error('migration_pro_hold');
 const generation=(await db.prepare('SELECT generation FROM pro_credentials WHERE id=?').bind(pro.writerProof.id).first())?.generation;if(!safe(generation))throw Error('migration_pro_generation');
 const proof=pro.writerProof,proGuard=q(`EXISTS(SELECT 1 FROM pro_credentials p JOIN pro_auth_state s ON s.singleton_id=1 WHERE p.id=? AND p.verifier=? AND p.revoked_at IS NULL AND p.scope='global_pro' AND p.generation=s.generation AND p.generation=? AND ${NOW}<COALESCE(p.last_validated_at,MAX(p.created_at,s.session_lifecycle_started_at))+${PRO_SESSION_IDLE_MS} AND ${NOW}<CASE WHEN p.device_public_key IS NOT NULL THEN p.lease_expires_at ELSE s.unbound_backend_until END)`,proof.id,proof.verifier,generation);
 const control=await db.prepare('SELECT * FROM sync_runtime_control WHERE singleton_id=1').first();if(!safe(control?.generation))throw Error('migration_sync_control');
 const controlGuard=q('EXISTS(SELECT 1 FROM sync_runtime_control WHERE singleton_id=1 AND generation=? AND rollout_mode=? AND admission_enabled=? AND data_read_enabled=? AND data_write_enabled=? AND recovery_enabled=? AND cloud_delete_enabled=?)',control.generation,control.rollout_mode,control.admission_enabled,control.data_read_enabled,control.data_write_enabled,control.recovery_enabled,control.cloud_delete_enabled);
 let app=null;const auth=request.headers.get('X-Sound-Cruise-App-Authorization');
 if(auth){const parsed=parseDeviceCredential(auth.startsWith('Bearer ')?auth.slice(7):'');if(!parsed)throw Error('migration_app_credential');
  app=await db.prepare("SELECT d.*,u.state user_state,u.recovery_version legacy_recovery_version,u.deleted_at user_deleted_at FROM sync_devices d JOIN sync_users u ON u.id=d.user_id WHERE d.id=? AND d.app_id='chord'").bind(parsed.deviceId).first();
  if(!app||!timingSafeHexEqual(await hmacVerifier(auth.slice(7),env.SYNC_CREDENTIAL_PEPPER),app.credential_verifier)||!safe(app.credential_version)||!safe(app.legacy_recovery_version)||app.user_state!=='active'||app.user_deleted_at!==null||(!history&&app.revoked_at!==null))throw Error('migration_app_hold');
 }
 if(app){const managed=await db.prepare('SELECT account_id FROM sync_account_managed_users WHERE sync_user_id=?').bind(app.user_id).first();if(managed&&managed.account_id!==ctx.account.accountId)throw Error('migration_foreign_managed_owner');if(history&&app.revoked_at!==null&&!await db.prepare('SELECT 1 ok FROM sync_chord_account_bridges WHERE account_id=? AND app_device_id=? AND sync_user_id=?').bind(ctx.account.accountId,app.id,app.user_id).first())throw Error('migration_revoked_history_owner');}
 const member=await db.prepare("SELECT * FROM sync_account_memberships WHERE account_id=? AND app_id='chord'").bind(ctx.account.accountId).first();if(member&&!safe(member.generation))throw Error('migration_member_generation');
 const actor=Object.freeze({ownerId:'maintenance-chord-migration-v1',profile:'chord-migration-v1',purpose:job.kind,requestFingerprint:ctx.fingerprint,subject:{accountId:ctx.account.accountId,accountDeviceId:ctx.account.accountDeviceId,appDeviceId:app?.id||null,syncUserId:app?.user_id||null}});
 const appGuards=app?[q("EXISTS(SELECT 1 FROM sync_devices d JOIN sync_users u ON u.id=d.user_id WHERE d.id=? AND d.user_id=? AND d.app_id='chord' AND d.credential_verifier=? AND d.credential_version=? AND d.revoked_at IS ? AND u.state=? AND u.recovery_version=? AND u.deleted_at IS NULL)",app.id,app.user_id,app.credential_verifier,app.credential_version,app.revoked_at,app.user_state,app.legacy_recovery_version)]:[];
 return{ctx,app,member,actor,proGuard,controlGuard,syncControl:control,guards:[...accountOwnerAssertions(ctx),proGuard,controlGuard,...appGuards]};
}
export function createIsolatedChordMigration({db,env,scopeForAccount}){
 if(!db?.batch||typeof scopeForAccount!=='function')throw Error('migration_dependencies');
 async function context(request,job,history=false){const c=await chordOwnerContext({db,env,request,job,history});c.scope=scopeForAccount(c.ctx.account.accountId);if(typeof c.scope!=='string'||!c.scope)throw Error('migration_scope');c.control=await db.prepare('SELECT epoch,phase FROM sync_maintenance_v2_control WHERE scope=?').bind(c.scope).first();if(!c.control)throw Error('migration_handover_required');
  c.owner={id:c.actor.ownerId,validateIdentity:i=>maintenanceCanonical(i)===maintenanceCanonical(c.actor),async verify(r){return{allowed:maintenanceCanonical(r.identity)===maintenanceCanonical(c.actor),identityDigest:await maintenanceDigest(c.actor),assertions:c.guards};},async verifyHandover(){return false;}};c.core=createIsolatedMaintenanceBridgeV2({db,owner:c.owner});await c.core.checkSchema();return c;}
 async function inspect(request,job){const c=await context(request,job,true),members=(await db.prepare('SELECT id,app_id,state,generation,sync_user_id,recovery_mode FROM sync_account_memberships WHERE account_id=? ORDER BY app_id').bind(c.ctx.account.accountId).all()).results;
  if(members.some(m=>!safe(m.generation)))throw Error('migration_generation_unknown');
  for(const m of members){if(!['pending','active'].includes(m.state)||(m.state==='pending'&&m.sync_user_id!==null))throw Error('migration_member_partial');if(m.state==='active'){const mapped=await db.prepare("SELECT 1 ok FROM sync_account_managed_users WHERE sync_user_id=? AND account_id=? AND membership_id=? AND app_id=? UNION ALL SELECT 1 ok FROM sync_chord_account_bridges WHERE ?='dual' AND account_id=? AND membership_id=? AND sync_user_id=? AND state='dual' LIMIT 1").bind(m.sync_user_id,c.ctx.account.accountId,m.id,m.app_id,m.recovery_mode,c.ctx.account.accountId,m.id,m.sync_user_id).first();if(!mapped)throw Error('migration_member_owner_unknown');}}
  const bridge=c.app?await db.prepare('SELECT * FROM sync_chord_account_bridges WHERE account_id=? AND sync_user_id=? ORDER BY created_at DESC,bridge_id DESC LIMIT 1').bind(c.ctx.account.accountId,c.app.user_id).first():null;
  if(bridge){if(!['prepared','dual','finalized','rolled_back'].includes(bridge.state)||![bridge.generation,bridge.expected_account_generation,bridge.expected_membership_generation,bridge.expected_legacy_recovery_version,bridge.account_recovery_version].every(safe))throw Error('migration_bridge_unknown');
   const delta=bridge.state==='rolled_back'&&bridge.dual_committed_at!==null?1:0;
   if(!c.member||bridge.membership_id!==c.member.id||c.ctx.account.generation!==bridge.expected_account_generation+delta||c.member.generation!==bridge.expected_membership_generation+delta||(['prepared','rolled_back'].includes(bridge.state)?c.member.state!=='pending'||c.member.sync_user_id!==null:c.member.state!=='active'||c.member.sync_user_id!==c.app.user_id||c.member.recovery_mode!==(bridge.state==='dual'?'dual':'account')))throw Error('migration_partial_state_hold');}
  let state=!c.app?(members.some(m=>m.app_id==='port'&&m.state==='active')?'Account+Port':'Account-only'):bridge?{prepared:'Chord Bridge途中',dual:'Chord Dual',finalized:'Chord Finalize済み',rolled_back:'Chord Rollback済み'}[bridge.state]:'Legacy Sync + Account移行待ち';
  if(c.app&&c.member?.sync_user_id&&c.member.sync_user_id!==c.app.user_id)throw Error('migration_owner_conflict');
  return{state,ownerAdoption:'PENDING_NOT_PRODUCTION_ADOPTED',accountGeneration:c.ctx.account.generation,memberGeneration:c.member?.generation||null,bridgeGeneration:bridge?.generation||null,sourceDigest:c.app?(await chordSource(db,c.app.user_id)).digest:null,pro:'currently-verified',productionHandover:'UNPROVEN'};}
 async function run(request,job){
  if(!['account-only-readiness','prepare','dual','finalize','rollback'].includes(job.kind))throw Error('migration_kind');
  const c=await context(request,job),accountId=c.ctx.account.accountId;const accountPending=chordAccountPendingGuard(accountId);if((await db.prepare(accountPending.sql).bind(...accountPending.params).first())?.ok!==1)throw Error('migration_account_pending_unknown');c.guards.push(accountPending);
  if(c.ctx.control.rollout_mode!=='open'||c.ctx.control.account_read_enabled!==1)throw Error('migration_account_runtime_hold');
  if(job.kind!=='account-only-readiness'&&(c.ctx.control.membership_admission_enabled!==1||c.syncControl.rollout_mode!=='open'||c.syncControl.data_read_enabled!==1||c.syncControl.data_write_enabled!==1||!productionAccountAppAllowed(env,'chord')))throw Error('migration_write_runtime_hold');
  if(await db.prepare('SELECT 1 n FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(job.operationId).first())throw Error('migration_reconcile_required');
  if(job.kind!=='account-only-readiness'&&(!c.app||!c.member||!UUID.test(job.bridgeId||'')))throw Error('migration_chord_identity');
  c.guards.push(q("NOT EXISTS(SELECT 1 FROM sync_account_memberships WHERE account_id=? AND (typeof(generation)<>'integer' OR generation<1 OR generation>=9007199254740991))",accountId));
  if(['dual','finalize','rollback'].includes(job.kind)){const b=await db.prepare('SELECT * FROM sync_chord_account_bridges WHERE bridge_id=? AND account_id=?').bind(job.bridgeId,accountId).first();if(!b||![b.generation,b.expected_account_generation,b.expected_membership_generation,b.expected_legacy_recovery_version,b.account_recovery_version].every(safe))throw Error('migration_bridge_generation_unknown');}
  const snapshots=[await chordSnapshot(db,'sync_account_memberships','account_id=?',[accountId])];
  if(c.app){for(const [t,w,p]of [['sync_users','id=?',[c.app.user_id]],['sync_devices',"user_id=? AND app_id='chord'",[c.app.user_id]],['sync_chord_account_bridges','account_id=?',[accountId]],['sync_membership_device_links','account_id=?',[accountId]],['sync_account_managed_users','account_id=?',[accountId]]])snapshots.push(await chordSnapshot(db,t,w,p));}
  const source=c.app?await chordSource(db,c.app.user_id):null;
  if(c.app)c.guards.push(q("EXISTS(SELECT 1 FROM sync_datasets WHERE user_id=? AND app_id='chord' AND state='ready' AND schema_version=1) AND NOT EXISTS(SELECT 1 FROM sync_records WHERE user_id=? AND app_id='chord' AND (record_type NOT IN('chord','folder') OR schema_version<>1 OR revision<1 OR (deleted_at IS NULL AND NOT json_valid(payload_json))))",c.app.user_id,c.app.user_id));
  c.guards.push(...snapshots.map(x=>x.guard),...(source?source.rows.map(x=>x.guard):[]));
  c.guards.push(q("NOT EXISTS(SELECT 1 FROM sync_maintenance_v2_operations o WHERE o.operation_id<>? AND o.phase NOT IN('committed','resolved') AND (COALESCE(json_extract(o.binding_json,'$.subject.accountId'),json_extract(o.binding_json,'$.accountId'))=? OR COALESCE(json_extract(o.binding_json,'$.subject.accountId'),json_extract(o.binding_json,'$.accountId')) IS NULL))",job.operationId,accountId));
  if(c.app){c.guards.push(q("NOT EXISTS(SELECT 1 FROM sync_account_managed_users WHERE sync_user_id=?)",c.app.user_id));c.guards.push((await chordSnapshot(db,'sync_account_managed_users','sync_user_id=?',[c.app.user_id])).guard);c.guards.push(q("NOT EXISTS(SELECT 1 FROM recovery_claims WHERE user_id=? AND committed_at IS NULL AND cancelled_at IS NULL) AND NOT EXISTS(SELECT 1 FROM account_delete_intents WHERE user_id=? AND consumed_at IS NULL)",c.app.user_id,c.app.user_id));
   const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.map(x=>x.name);for(const t of ['sync_authority_cleanup_claims','sync_asset_deletions'])if(tables.includes(t))c.guards.push(q('NOT EXISTS(SELECT 1 FROM '+t+' WHERE account_id=?)',accountId));
  }
  const identity={accountId,accountDeviceId:c.ctx.account.accountDeviceId,syncUserId:c.app?.user_id,appDeviceId:c.app?.id};
  const normal=s=>s.replace(/\s+/g,' ').trim(),specs=new WeakMap();let batches=0;
  async function transact(items){
   if(++batches!==1)throw Error('migration_multiple_batches');if(['dual','finalize','rollback'].includes(job.kind)&&!safe(job.expectedBridgeGeneration+1))throw Error('migration_post_generation_hold');let required,postAccount=c.ctx.account.generation,postMember=c.member?.generation||null,postBridge=null;
   if(job.kind==='prepare'){if(items.length!==1||!normal(items[0].sql).startsWith('INSERT INTO sync_chord_account_bridges'))throw Error('prepare_plan');required=[0];postBridge='prepared';}
   else if(job.kind==='dual'){if(items.length!==5||!normal(items[0].sql).startsWith('INSERT INTO sync_membership_device_links'))throw Error('dual_plan');required=[0,1,2,3,4];postAccount++;postMember++;postBridge='dual';}
   else if(job.kind==='finalize'){if(items.length!==8||!normal(items[0].sql).startsWith('UPDATE sync_users'))throw Error('finalize_plan');required=[0,3,4,5,6,7];postAccount++;postMember++;postBridge='finalized';
    // Keep old recovery-attempt evidence. Native plan's deletion is not needed for ownership.
    if(!normal(items[2].sql).startsWith('DELETE FROM recovery_attempts'))throw Error('finalize_retention_shape');items=items.map((s,i)=>i===2?{sql:'SELECT 1 AS retained_legacy_attempt',values:[]}:s);
    // Capture the existing Device repository's revoke SQL, append to SAME protected batch.
    const collector={prepare(sql){return{bind(...values){return{sql,values};},async first(){throw Error('collector_read_shape');}};},async batch(entries){for(const entry of entries){if(normal(entry.sql).startsWith('UPDATE sync_devices'))required.push(items.length);items.push({sql:entry.sql,values:entry.values});}return entries.map(()=>({success:true,meta:{changes:1}}));}};
    // Device repository post-read uses first() on bound statement.
    collector.prepare=sql=>({bind(...values){return{sql,values,first:()=>db.prepare(sql).bind(...values).first()};}});
    const devices=(await db.prepare("SELECT id FROM sync_devices WHERE user_id=? AND app_id='chord' AND revoked_at IS NULL ORDER BY id").bind(c.app.user_id).all()).results;
    for(const d of devices)await createD1DeviceRepository(collector).revoke({userId:c.app.user_id,deviceId:c.app.id,appId:'chord'},d.id,Date.now());
   }else if(job.kind==='rollback'){required=items.map((_,i)=>i);if(items.length===1){postBridge='rolled_back';}else if(items.length===5){postAccount++;postMember++;postBridge='rolled_back';}else throw Error('rollback_plan');}
   else if(job.kind==='account-only-readiness'){required=[];postBridge=null;}else throw Error('migration_plan');
   if(!safe(postAccount)||(postMember!==null&&!safe(postMember)))throw Error('migration_post_generation_hold');
   const r={kind:'mutation',operationId:job.operationId,scope:c.scope,expectedEpoch:c.control.epoch,identity:c.actor,action:{purpose:'chord-migration-'+job.kind,sourceDigest:source?.digest||null,statementDigest:await maintenanceDigest(items),accountGeneration:c.ctx.account.generation,memberGeneration:c.member?.generation||null}};
   const outcome=q("EXISTS(SELECT 1 FROM sync_accounts WHERE id=? AND generation=? AND state='active')"+(postBridge?" AND EXISTS(SELECT 1 FROM sync_chord_account_bridges WHERE bridge_id=? AND state=?)":''),accountId,postAccount,...(postBridge?[job.bridgeId,postBridge]:[]));
   const after=[outcome,c.proGuard,...(source?source.rows.map(x=>x.guard):[])];
   if(postMember!==null)after.push(q('EXISTS(SELECT 1 FROM sync_account_memberships WHERE id=? AND account_id=? AND generation=?)',c.member.id,accountId,postMember));
   if(job.kind==='finalize')after.push(q("NOT EXISTS(SELECT 1 FROM sync_devices WHERE user_id=? AND app_id='chord' AND revoked_at IS NULL)",c.app.user_id));
   const combined={sql:'SELECT CASE WHEN '+after.map(x=>'(SELECT ok FROM ('+x.sql+'))=1').join(' AND ')+' THEN 1 ELSE 0 END AS ok',params:after.flatMap(x=>x.params)};
   const out=await c.core.execute(r,{outcome:combined,receiptDetails:{type:'chord-migration-'+job.kind,action:r.action,sourceDigest:source?.digest||null,preAccountGeneration:c.ctx.account.generation,postAccountGeneration:postAccount,postMemberGeneration:postMember,legacyDevicesRevoked:job.kind==='finalize',productionAdoption:false},run:async d=>{const indices=[],s=[];for(const [i,x]of items.entries()){indices.push(s.length);s.push(d.prepare(x.sql).bind(...x.values));if(required.includes(i))s.push(d.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('migration-required-change','$.invalid') END"));}const results=await d.batch(s);return indices.map(i=>results[i]);}});
   return out.value;
  }
  function prepare(sql,values=[]){if(!/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql)||sql.includes(';')||/sync_maintenance_v2_|maintenance_v2_/i.test(sql))throw Error('migration_sql_hold');const read=/^\s*SELECT\b/i.test(sql);const s={bind(...v){return prepare(sql,v);},async run(){return(await transact([{sql,values}]))[0];},all(){if(!read)throw Error('mutation_read_escape');return db.prepare(sql).bind(...values).all();},first(){if(!read)throw Error('mutation_read_escape');return db.prepare(sql).bind(...values).first();}};specs.set(s,{sql,values});return s;}
  const bound={prepare,batch(entries){if(entries.some(s=>!specs.has(s)))throw Error('migration_raw_statement');return transact(entries.map(s=>specs.get(s)));}};
  if(job.kind==='account-only-readiness'){await transact([{sql:'SELECT 1 AS Account_binding_observed',values:[]}]);return{status:'account-owner-binding-observed',productionAdoption:false};}
  const repo=createD1ChordAccountBridgeRepository(bound),now=Date.now(),input={...job,now,requestFingerprint:c.actor.requestFingerprint};let result;
  if(job.kind==='prepare'){if(job.expectedAccountGeneration!==c.ctx.account.generation)throw Error('migration_account_cas');result=await repo.prepare(identity,{...input,membershipId:c.member.id});}
  else{if(!safe(job.expectedBridgeGeneration))throw Error('migration_bridge_generation');
   if(job.kind==='dual')result=await repo.commitDual(identity,input);
   else if(job.kind==='rollback')result=await repo.rollback(identity,input);
   else{const material=await repo.finalizeMaterial(identity,job.bridgeId);if(!material)throw Error('migration_material');result=await repo.finalize(identity,{...input,legacyRecoveryVerifier:material.legacyRecoveryVerifier,disabledLegacyRecoveryVerifier:await accountManagedRecoveryVerifier(material.accountRecoveryVerifier,'chord',env.SYNC_ACCOUNT_RECOVERY_PEPPER)});}
  }
  if(batches!==1)throw Error('migration_not_committed_'+result?.status);const fact=await db.prepare('SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(job.operationId).first();if(!fact?.receipt_json)throw Error('migration_result_unknown');const receipt=JSON.parse(fact.receipt_json);if(!receipt.details?.action||await maintenanceDigest(receipt)!==fact.receipt_digest)throw Error('migration_receipt_unknown');const checked=await c.core.reconcile({kind:'mutation',operationId:job.operationId,scope:c.scope,expectedEpoch:fact.epoch,identity:c.actor,action:receipt.details.action});if(checked.status!=='historical')throw Error('migration_result_unknown');return{...result,maintenanceReceiptDigest:fact.receipt_digest};
 }
 async function reconcile(request,job){const c=await context(request,job,true),row=await db.prepare('SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(job.operationId).first();if(!row||row.scope!==c.scope||row.binding_json!==maintenanceCanonical(c.actor))throw Error('migration_reconcile_owner');if(!row.receipt_json)return{status:'unknown',pendingRetained:true};const receipt=JSON.parse(row.receipt_json);if(await maintenanceDigest(receipt)!==row.receipt_digest||!receipt.details?.action)throw Error('migration_receipt_unknown');return c.core.reconcile({kind:'mutation',operationId:job.operationId,scope:c.scope,expectedEpoch:row.epoch,identity:c.actor,action:receipt.details.action});}
 async function resolveUnknown(request,job,{resolutionOperationId}={}){
  if(!UUID.test(resolutionOperationId||''))throw Error('migration_resolution_id');const c=await context(request,job),source=await db.prepare('SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(job.operationId).first();
  if(!source||source.scope!==c.scope||source.binding_json!==maintenanceCanonical(c.actor)||source.kind!=='mutation'||source.phase!=='registered'||source.receipt_json!==null||source.pending_json!==null||source.resolved_by!==null)throw Error('migration_resolution_hold');
  c.owner.verifyRecovery=async(r,old)=>({allowed:old.operation_id===job.operationId,operationFenceOnly:true,sourceDigest:await maintenanceDigest(old),outcomeDigest:await maintenanceDigest(r.outcome)});
  return createIsolatedMaintenanceBridgeV2({db,owner:c.owner}).recover({kind:'recovery',operationId:resolutionOperationId,scope:c.scope,expectedEpoch:(await db.prepare('SELECT epoch FROM sync_maintenance_v2_control WHERE scope=?').bind(c.scope).first()).epoch,identity:c.actor,sourceOperationId:source.operation_id,sourceRequestDigest:source.request_digest,pendingDigest:null,outcome:{classification:'migration-registration-fenced-no-business-commit',sourcePreserved:true}});
 }
 return Object.freeze({inspect,run,reconcile,resolveUnknown});
}
