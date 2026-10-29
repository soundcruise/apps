import { assetRoute, readAssetContext, assetTransactionProfile } from './maintenance-asset-owner.js';
import { SYNC_OWNER_ROUTES, readSyncContext, syncTransactionProfile, syncBridgeOwner } from './maintenance-sync-owner.js';
import { accountDeviceRoute, readAccountDeviceContext, accountDeviceTransactionProfile } from './maintenance-account-device.js';
import { MEMBERSHIP_OWNER_ROUTES, readMembershipContext, membershipTransactionProfile } from './maintenance-account-membership.js';
import { inspectAccountCredentialReadOnly } from './account-auth.js';
import { accountCredentialVerifier, accountRecoveryCodeVerifier, accountRecoveryClaimVerifier, parseAccountCredential, parseAccountRecoveryClaim } from './account-crypto.js';
import { inspectProMaintenanceOwner } from './pro-auth-app.js';
import { maintenanceCanonical, maintenanceDigest } from './maintenance-bridge-v2.js';
import { hmacVerifier } from './crypto.js';
import { readLifecycleContext, lifecycleTransactionProfile } from './maintenance-account-lifecycle.js';

export const MAINTENANCE_OWNER_ROUTES = Object.freeze({
 '/v2/accounts/start': {method:'POST',owner:'account',state:'account-unregistered',lane:'writer'},
 '/v2/accounts/port-device': {method:'POST',owner:'account',state:'account-device',lane:'writer'},
 '/v2/accounts/summary': {method:'GET',owner:'account',state:'account-device',lane:'security'},
 '/v2/accounts/devices': {method:'GET',owner:'account',state:'account-device',lane:'security'},
 '/v2/accounts/devices/revoke': {method:'POST',owner:'account',state:'account-device',lane:'security'},
 '/v2/accounts/recovery/prepare': {method:'POST',owner:'account',state:'account-recovery',lane:'security'},
 '/v2/accounts/recovery/commit': {method:'POST',owner:'account',state:'account-recovery',lane:'security'},
 '/v2/accounts/recovery-rotation/prepare': {method:'POST',owner:'account',state:'account-device',lane:'security'},
 '/v2/accounts/recovery-rotation/commit': {method:'POST',owner:'account',state:'account-device',lane:'security'},
 '/v2/accounts/environments/current/detach': {method:'POST',owner:'account',state:'account-device',lane:'security'},
 '/v2/accounts/apps/current/detach': {method:'POST',owner:'account',state:'account-app-device',lane:'security'},
 '/v2/pro-auth/verify': {method:'POST',owner:'pro',state:'pro-attempt',lane:'security'},
 '/v2/pro-auth/session': {method:'GET',owner:'pro',state:'pro-observation',lane:'security'},
 '/v2/pro-auth/policy': {method:'GET',owner:'pro',state:'pro-observation',lane:'security'},
 '/v2/pro-auth/revoke': {method:'POST',owner:'pro',state:'pro-credential',lane:'security'},
 '/v2/pro-auth/device-session/challenge': {method:'POST',owner:'pro',state:'pro-credential',lane:'security'},
 '/v2/pro-auth/device-session/renew': {method:'POST',owner:'pro',state:'pro-credential',lane:'writer'}
});
export function maintenanceOwnerRoute(path,method){return assetRoute(path,method)||SYNC_OWNER_ROUTES[path]||accountDeviceRoute(path,method)||MEMBERSHIP_OWNER_ROUTES[method+' '+path]||MAINTENANCE_OWNER_ROUTES[path];}
export async function ownerFingerprint(value,env,route){
 const key=route.owner==='sync'?env.SYNC_CREDENTIAL_PEPPER:route.owner==='account'?env.SYNC_ACCOUNT_CREDENTIAL_PEPPER:env.PRO_CREDENTIAL_PEPPER;
 if(typeof key!=='string'||key.length<32)throw Error('owner_pepper_unavailable');
 // Keyed fingerprint, never a plain hash of a low-entropy passcode or Authorization value.
 return hmacVerifier('maintenance-owner-http:v1:'+maintenanceCanonical(value),key);
}
export async function ownerContext({request,body,route,operationId,env,db,dependencies}){
 const url=new URL(request.url),auth=request.headers.get('Authorization')||'';
 const fingerprint=await ownerFingerprint({method:request.method,path:url.pathname,query:url.search,origin:request.headers.get('Origin'),service:url.origin,body,authorization:auth,operationId,...(route.owner==='sync'?{proAuthorization:request.headers.get('X-Sound-Cruise-Pro-Authorization')||''}:{}),...(route.state==='account-app-device'?{appAuthorization:request.headers.get('X-Sound-Cruise-App-Authorization')||''}:{})},env,route);
 if(route.asset)return readAssetContext({request,body,route,operationId,env,db,dependencies,fingerprint});
 if(route.owner==='sync')return readSyncContext({request,body,route,operationId,env,db,dependencies,fingerprint});
 const ctx={route,path:url.pathname,body,operationId,fingerprint,env,db,dependencies,request,account:null,recovery:null,pro:null,accountVerifier:null};
 const control=route.owner==='account'
  ?await db.prepare('SELECT * FROM sync_account_runtime_control WHERE singleton_id=1').first()
  :await db.prepare('SELECT * FROM pro_auth_state WHERE singleton_id=1').first();
 if(!control||!Number.isSafeInteger(control.generation)||control.generation<1)throw Error('owner_control_unknown');
 ctx.control=control;
 if(route.owner==='account'&&route.state==='account-device'){
  const inspected=await inspectAccountCredentialReadOnly(db,auth,env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);
  if(inspected?.identity){
   if(inspected.identity.admissionProvenance!=='production')throw Error('qa_owner_profile_hold');
   ctx.account=inspected.identity;ctx.accountVerifier=await accountCredentialVerifier(auth.slice(7),env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);
   ctx.device=await db.prepare('SELECT credential_version FROM sync_account_devices WHERE id=? AND account_id=?').bind(ctx.account.accountDeviceId,ctx.account.accountId).first();
   if(!Number.isSafeInteger(ctx.account.generation)||ctx.account.generation<1||!Number.isSafeInteger(ctx.account.recoveryVersion)||ctx.account.recoveryVersion<1||!Number.isSafeInteger(ctx.device?.credential_version)||ctx.device.credential_version<1)throw Error('account_counter_unknown');
   if(url.pathname==='/v2/accounts/port-device')ctx.membership=await db.prepare("SELECT id,state,generation,sync_user_id FROM sync_account_memberships WHERE account_id=? AND app_id='port'").bind(ctx.account.accountId).first();
  }
 }
 if(route.state==='account-recovery'){
  try{
   if(url.pathname.endsWith('/prepare')){
    ctx.recoveryVerifier=await accountRecoveryCodeVerifier(body.recoveryCode,env.SYNC_ACCOUNT_RECOVERY_PEPPER);
    ctx.recovery=await db.prepare('SELECT id,generation,recovery_version FROM sync_accounts WHERE recovery_verifier=? AND state=\'active\' AND deleted_at IS NULL').bind(ctx.recoveryVerifier).first();
   }else{
    ctx.claimId=parseAccountRecoveryClaim(body.claimToken)?.claimId;ctx.claimVerifier=await accountRecoveryClaimVerifier(body.claimToken,env.SYNC_ACCOUNT_RECOVERY_PEPPER);
    ctx.nextVerifier=await accountCredentialVerifier(body.accountCredential,env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);
    ctx.claim=await db.prepare('SELECT * FROM sync_account_recovery_claims WHERE claim_id=? AND claim_verifier=? AND next_account_credential_verifier=?').bind(ctx.claimId||'',ctx.claimVerifier,ctx.nextVerifier).first();
    if(ctx.claim)ctx.recovery={id:ctx.claim.account_id,generation:ctx.claim.expected_account_generation,recovery_version:ctx.claim.expected_recovery_version};
   }
  }catch{ /* Unknown is not upgraded to an authenticated Account. Native owner returns rejection. */ }
 }
 if(route.owner==='pro'&&(route.state==='pro-credential'||url.pathname==='/v2/pro-auth/session')){
  ctx.pro=await inspectProMaintenanceOwner(request,{...env,SYNC_DB:db},url.pathname.endsWith('/revoke')?'revoke':'renew',dependencies);
 }
 await readLifecycleContext(ctx);
 await readMembershipContext(ctx);
 await readAccountDeviceContext(ctx);
 const subject=ctx.membershipSubject||ctx.lifecycleSubject|| (ctx.account?{kind:'account-device',accountId:ctx.account.accountId,accountDeviceId:ctx.account.accountDeviceId,generation:ctx.account.generation,recoveryVersion:ctx.account.recoveryVersion,credentialVersion:ctx.device?.credential_version||null}
 :ctx.recovery?{kind:'recovery-proof',accountId:ctx.recovery.id,generation:ctx.recovery.generation,recoveryVersion:ctx.recovery.recovery_version}
 :ctx.pro?{kind:'pro-credential',credentialId:ctx.pro.id,generation:ctx.pro.generation}
 :{kind:route.state==='account-unregistered'?'unregistered':route.state==='pro-attempt'?'pro-attempt':'unknown'});
 ctx.actor=Object.freeze({ownerId:'maintenance-'+route.owner+'-owner-v1',profile:'owner-http-v1',purpose:route.state,invocationId:operationId,requestFingerprint:fingerprint,subject});
 return ctx;
}
const query=(sql,...params)=>({sql:'SELECT CASE WHEN ('+sql+') THEN 1 ELSE 0 END AS ok',params});
function controlAssertion(ctx){
 if(ctx.route.owner==='pro')return query('EXISTS(SELECT 1 FROM pro_auth_state WHERE singleton_id=1 AND generation=? AND active_code_slot=?)',ctx.control.generation,ctx.control.active_code_slot);
 return query('EXISTS(SELECT 1 FROM sync_account_runtime_control WHERE singleton_id=1 AND generation=? AND rollout_mode=? AND account_admission_enabled=? AND membership_admission_enabled=? AND account_read_enabled=? AND account_recovery_enabled=? AND account_delete_enabled=? AND port_orchestration_enabled=?)',ctx.control.generation,ctx.control.rollout_mode,ctx.control.account_admission_enabled,ctx.control.membership_admission_enabled,ctx.control.account_read_enabled,ctx.control.account_recovery_enabled,ctx.control.account_delete_enabled,ctx.control.port_orchestration_enabled);
}
function accountAssertion(ctx,{history=false}={}){
 if(!ctx.account||!ctx.device)throw Error('account_owner_unverified');
 return query('EXISTS(SELECT 1 FROM sync_account_devices d JOIN sync_accounts a ON a.id=d.account_id WHERE d.id=? AND a.id=? AND d.credential_verifier=? AND d.credential_version=? AND d.revoked_at IS NULL AND a.state=\'active\' AND a.deleted_at IS NULL AND a.admission_provenance=\'production\' AND a.generation=? AND a.recovery_version=?)',
  ctx.account.accountDeviceId,ctx.account.accountId,ctx.accountVerifier,ctx.device.credential_version,ctx.account.generation,ctx.account.recoveryVersion);
}
function recoveryAssertion(ctx,activity=false){
 if(!ctx.recovery||!Number.isSafeInteger(ctx.recovery.generation)||ctx.recovery.generation<1||!Number.isSafeInteger(ctx.recovery.recovery_version)||ctx.recovery.recovery_version<1)throw Error('recovery_owner_unverified');
 if(activity)return query('EXISTS(SELECT 1 FROM sync_account_recovery_claims r JOIN sync_account_lifecycle_operations o ON o.operation_id=r.commit_operation_id AND o.account_id=r.account_id JOIN sync_accounts a ON a.id=r.account_id JOIN sync_account_devices d ON d.id=r.next_account_device_id AND d.account_id=a.id WHERE r.claim_id=? AND r.claim_verifier=? AND r.next_account_credential_verifier=? AND r.committed_at IS NOT NULL AND o.kind=\'recovery\' AND a.state=\'active\' AND a.recovery_version=? AND a.generation=? AND d.credential_verifier=r.next_account_credential_verifier AND d.revoked_at IS NULL)',ctx.claimId,ctx.claimVerifier,ctx.nextVerifier,ctx.recovery.recovery_version+1,ctx.recovery.generation+1);
 if(ctx.path.endsWith('/prepare'))return query('EXISTS(SELECT 1 FROM sync_accounts WHERE id=? AND recovery_verifier=? AND generation=? AND recovery_version=? AND state=\'active\' AND deleted_at IS NULL)',ctx.recovery.id,ctx.recoveryVerifier,ctx.recovery.generation,ctx.recovery.recovery_version);
 return query('EXISTS(SELECT 1 FROM sync_account_recovery_claims r JOIN sync_accounts a ON a.id=r.account_id WHERE r.claim_id=? AND r.claim_verifier=? AND r.next_account_credential_verifier=? AND r.committed_at IS NULL AND r.cancelled_at IS NULL AND r.expires_at>? AND a.state=\'active\' AND a.generation=r.expected_account_generation AND a.recovery_version=r.expected_recovery_version)',
  ctx.claimId,ctx.claimVerifier,ctx.nextVerifier,Date.now());
}
function proAssertion(ctx,revoke=false){
 if(!ctx.pro)throw Error('pro_owner_unverified');
 if(revoke)return query('EXISTS(SELECT 1 FROM pro_credentials WHERE id=? AND verifier=? AND scope=\'global_pro\')',ctx.pro.id,ctx.pro.verifier);
 return query('EXISTS(SELECT 1 FROM pro_credentials p JOIN pro_auth_state s ON s.singleton_id=1 WHERE p.id=? AND p.verifier=? AND p.revoked_at IS NULL AND p.generation=s.generation AND p.generation=? AND COALESCE(p.last_validated_at,MAX(p.created_at,s.session_lifecycle_started_at))>?)',
  ctx.pro.id,ctx.pro.verifier,ctx.pro.generation,(ctx.dependencies.now?ctx.dependencies.now():Date.now())-90*86400000);
}
function sqlText(items){return items.map(x=>x.sql.replace(/\s+/g,' ').trim()).join('\n');}
export function transactionProfile(ctx,items){
 if(ctx.route.asset)return assetTransactionProfile(ctx,items);
 if(ctx.route.owner==='sync')return syncTransactionProfile(ctx,items);
 const text=sqlText(items),first=items[0],p=first.values,base={assertions:[controlAssertion(ctx)],lane:'writer',summary:{}};
 const accountDevice=accountDeviceTransactionProfile(ctx,items,base,accountAssertion);if(accountDevice)return accountDevice;
 const membership=membershipTransactionProfile(ctx,items,base,accountAssertion);if(membership)return membership;
 const lifecycle=lifecycleTransactionProfile(ctx,items,base,accountAssertion);if(lifecycle)return lifecycle;
 // Source-owned statement plans only. An unmatched write is HOLD, never a generic permission.
 if(ctx.path==='/v2/accounts/start'&&/^INSERT INTO sync_accounts\b/i.test(text)){
  const record=items.find(x=>/INSERT INTO sync_account_start_operations/i.test(x.sql));
  if(!record||record.values[0]!==ctx.body.operationId||items.some(x=>/sync_account_qa_sessions/i.test(x.sql)))throw Error('bootstrap_plan_unknown');
  base.label='account-bootstrap';base.outcome=query('EXISTS(SELECT 1 FROM sync_account_start_operations o JOIN sync_accounts a ON a.id=o.account_id JOIN sync_account_devices d ON d.id=o.account_device_id WHERE o.operation_id=? AND o.request_fingerprint=? AND a.id=? AND a.state=\'active\' AND a.generation=1 AND d.account_id=a.id AND d.credential_verifier=? AND d.revoked_at IS NULL) AND (SELECT COUNT(*) FROM sync_account_memberships WHERE account_id=?)=?',
   record.values[0],record.values[1],p[0],items[1].values[2],p[0],ctx.body.appIds.length+1);
  base.summary={type:'account-created',accountId:p[0],accountDeviceId:items[1].values[0]};return base;
 }
 if(ctx.path==='/v2/accounts/port-device'&&/INSERT INTO sync_port_device_operations/i.test(text)){
  base.assertions.push(accountAssertion(ctx));base.label='port-device';
  if(!ctx.membership||!Number.isSafeInteger(ctx.membership.generation)||ctx.membership.generation<1)throw Error('membership_snapshot_unknown');
  base.assertions.push(query('EXISTS(SELECT 1 FROM sync_account_memberships WHERE id=? AND account_id=? AND app_id=\'port\' AND state=? AND generation=? AND sync_user_id IS ?)',ctx.membership.id,ctx.account.accountId,ctx.membership.state,ctx.membership.generation,ctx.membership.sync_user_id));
  base.witness={membershipId:ctx.membership.id,generation:ctx.membership.generation,state:ctx.membership.state,syncUserId:ctx.membership.sync_user_id};
  base.outcome=query('EXISTS(SELECT 1 FROM sync_port_device_operations o JOIN sync_membership_device_links l ON l.app_device_id=o.app_device_id JOIN sync_devices d ON d.id=o.app_device_id JOIN sync_account_memberships m ON m.id=o.membership_id JOIN sync_account_managed_users u ON u.sync_user_id=o.sync_user_id WHERE o.operation_id=? AND o.account_id=? AND o.account_device_id=? AND l.account_id=o.account_id AND l.membership_id=o.membership_id AND l.account_device_id=o.account_device_id AND d.user_id=o.sync_user_id AND d.revoked_at IS NULL AND m.account_id=o.account_id AND m.app_id=\'port\' AND m.state=\'active\' AND m.sync_user_id=o.sync_user_id AND m.generation=? AND u.account_id=o.account_id AND u.membership_id=m.id AND u.app_id=\'port\')',ctx.body.operationId,ctx.account.accountId,ctx.account.accountDeviceId,ctx.membership.generation+(ctx.membership.state==='pending'?1:0));
  const operation=items.find(x=>/INSERT INTO sync_port_device_operations/i.test(x.sql)).values;
  base.summary={type:'port-device-provisioned',accountId:operation[2],membershipId:operation[4],syncUserId:operation[5],appDeviceId:operation[6],membershipGeneration:ctx.membership.generation+(ctx.membership.state==='pending'?1:0)};return base;
 }
 if(ctx.path==='/v2/accounts/port-device'&&items.length===1&&/^INSERT INTO sync_account_memberships/i.test(text)){
  base.label='port-membership-ensure';base.assertions.push(accountAssertion(ctx));
  base.outcome=query('EXISTS(SELECT 1 FROM sync_account_memberships WHERE account_id=? AND app_id=\'port\' AND state IN(\'pending\',\'active\'))',ctx.account.accountId);
  base.summary={type:'port-membership-state-observed'};return base;
 }
 if(/sync_account_recovery_attempts/i.test(text)&&!items.some(x=>/sync_account_recovery_claims/i.test(x.sql))){
  base.label='recovery-attempt';base.lane='security';base.outcome={sql:'SELECT 1 AS ok',params:[]};base.summary={type:'recovery-attempt-transaction-only'};return base;
 }
 if(ctx.path==='/v2/accounts/recovery/prepare'&&/INSERT INTO sync_account_recovery_claims/i.test(text)){
  base.label='recovery-prepare';base.lane='security';base.assertions.push(recoveryAssertion(ctx));base.outcome=query('EXISTS(SELECT 1 FROM sync_account_recovery_claims WHERE claim_id=? AND claim_verifier=? AND prepare_operation_id=? AND cancelled_at IS NULL)',ctx.claimId||parseAccountRecoveryClaim(ctx.body.claimToken)?.claimId,ctx.claimVerifier||p[1],ctx.body.operationId);base.summary={type:'recovery-prepared'};return base;
 }
 if(ctx.path==='/v2/accounts/recovery/commit'&&/INSERT INTO sync_account_lifecycle_operations/i.test(text)){
  base.label='recovery-commit';base.lane='security';base.assertions.push(recoveryAssertion(ctx));base.outcome=query('EXISTS(SELECT 1 FROM sync_account_lifecycle_operations o JOIN sync_accounts a ON a.id=o.account_id WHERE o.operation_id=? AND o.account_id=? AND o.kind=\'recovery\' AND a.recovery_version=? AND a.generation=?)',ctx.body.operationId,ctx.recovery.id,ctx.recovery.recovery_version+1,ctx.recovery.generation+1);base.summary={type:'account-recovered',accountId:ctx.recovery.id};return base;
 }
 if(ctx.path==='/v2/accounts/devices/revoke'&&/INSERT INTO sync_account_lifecycle_operations/i.test(text)){
  base.label='account-device-revoke';base.lane='security';base.assertions.push(accountAssertion(ctx));base.outcome=query('EXISTS(SELECT 1 FROM sync_account_lifecycle_operations o JOIN sync_account_devices d ON d.id=o.target_id AND d.account_id=o.account_id WHERE o.operation_id=? AND o.account_id=? AND o.kind=\'device_revoke\' AND d.id=? AND d.revoked_at IS NOT NULL)',ctx.body.operationId,ctx.account.accountId,ctx.body.accountDeviceId);base.summary={type:'account-device-revoked'};return base;
 }
 if(ctx.route.owner==='account'&&/^(UPDATE sync_account_devices SET last_seen_at|INSERT OR IGNORE INTO sync_account_activity|UPDATE sync_account_activity)/i.test(text)){
  if(items.length!==1)throw Error('activity_plan_unknown');
  base.lane='security';base.label=/last_seen_at/i.test(first.sql)?'account-last-seen':/^INSERT/i.test(text)?'activity-insert':'activity-touch';
  base.assertions.push(ctx.path.endsWith('/recovery/commit')?recoveryAssertion(ctx,true):accountAssertion(ctx));
  const account=ctx.account?.accountId||ctx.recovery?.id;
  base.outcome=base.label==='account-last-seen'?query('EXISTS(SELECT 1 FROM sync_account_devices WHERE id=? AND account_id=? AND last_seen_at>=?)',ctx.account.accountDeviceId,account,p[0])
   :base.label==='activity-insert'?query('EXISTS(SELECT 1 FROM sync_account_activity WHERE account_id=? AND state IN(\'active\',\'dormant\'))',account)
   :query('EXISTS(SELECT 1 FROM sync_account_activity WHERE account_id=? AND state=\'active\')',account);
  base.summary={type:base.label==='activity-insert'?'activity-row-observed-before-touch':'activity-state-observed'};return base;
 }
 if(ctx.path==='/v2/pro-auth/verify'&&/^INSERT INTO pro_credentials\b/i.test(text)){
  base.label='pro-issue';base.outcome=query('EXISTS(SELECT 1 FROM pro_credentials WHERE id=? AND verifier=? AND generation=? AND revoked_at IS NULL)',p[0],p[1],ctx.control.generation);base.summary={type:'pro-issued-secret-not-retained',credentialId:p[0],generation:ctx.control.generation};return base;
 }
 if(ctx.path==='/v2/pro-auth/verify'&&/^INSERT INTO pro_auth_lockouts\b/i.test(text)){
  base.label='pro-lockout';base.lane='security';base.outcome=query('EXISTS(SELECT 1 FROM pro_auth_lockouts WHERE ip_key=?)',p[0]);base.summary={type:'pro-lockout-state-observed'};return base;
 }
 if(ctx.path==='/v2/pro-auth/revoke'&&/^UPDATE pro_credentials SET revoked_at/i.test(text)){
  base.label='pro-revoke';base.lane='security';base.assertions=[proAssertion(ctx,true)];
  base.outcome=query('EXISTS(SELECT 1 FROM pro_credentials WHERE id=? AND verifier=? AND revoked_at IS NOT NULL)',ctx.pro.id,ctx.pro.verifier);base.summary={type:'pro-revocation-state-proven'};return base;
 }
 if(ctx.path==='/v2/pro-auth/device-session/renew'&&/^UPDATE pro_credentials SET device_public_key/i.test(text)){
  base.label='pro-renew';base.assertions.push(proAssertion(ctx));const proof=items.find(x=>/INSERT OR IGNORE INTO pro_session_proofs/i.test(x.sql));if(!proof)throw Error('pro_renew_plan_unknown');
  base.assertions.push(query('NOT EXISTS(SELECT 1 FROM pro_session_proofs WHERE challenge_id=?)',proof.values[0]));
  base.outcome=query('EXISTS(SELECT 1 FROM pro_credentials p JOIN pro_session_proofs s ON s.credential_id=p.id WHERE p.id=? AND p.verifier=? AND p.device_public_key=? AND p.last_validated_at=? AND p.lease_expires_at=? AND s.challenge_id=? AND s.expires_at=?)',ctx.pro.id,ctx.pro.verifier,p[0],p[2],p[3],proof.values[0],proof.values[2]);base.summary={type:'pro-device-session-renewed'};return base;
 }
 throw Error('owner_mutation_profile_hold');
}
export function bridgeOwner(ctx,plan=null,{parentRequired=Boolean(plan)}={}){
 if(ctx.route.owner==='sync')return syncBridgeOwner(ctx,plan,{parentRequired});
 const identity=maintenanceCanonical(ctx.actor);
 return {id:ctx.actor.ownerId,allowRequestReservations:plan===null,validateIdentity:i=>maintenanceCanonical(i)===identity,
  async verify(r){if(maintenanceCanonical(r.identity)!==identity)return {allowed:false};
   const assertions=[...(plan?.assertions||[controlAssertion(ctx)])];
   if(parentRequired)assertions.push(query('EXISTS(SELECT 1 FROM sync_maintenance_v2_operations o JOIN sync_maintenance_v2_control c ON c.scope=o.scope AND c.epoch=o.epoch WHERE o.operation_id=? AND o.phase=\'registered\' AND o.binding_digest=? AND c.phase=\'open\' AND c.epoch=?)',ctx.operationId,await maintenanceDigest(ctx.actor),ctx.security.epoch));
   return {allowed:true,identityDigest:await maintenanceDigest(ctx.actor),assertions};},
  async verifyHandover(){return false;}
 };
}

// Read-only current Owner proofs reused by the isolated Scheduled adapter.
export function accountOwnerAssertions(ctx){return [controlAssertion(ctx),accountAssertion(ctx)];}
