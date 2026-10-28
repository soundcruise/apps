import { inspectCurrentAppEnvironmentOwner } from './account-app.js';
import { parseAccountRecoveryClaim, accountRecoveryClaimVerifier, accountRecoveryCodeVerifier } from './account-crypto.js';

const q=(sql,...params)=>({sql:'SELECT CASE WHEN ('+sql+') THEN 1 ELSE 0 END AS ok',params});
const nowSQL="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
const positive=n=>Number.isSafeInteger(n)&&n>0;
const envPath='/v2/accounts/environments/current/detach',appPath='/v2/accounts/apps/current/detach';

// A source-owned relationship snapshot. No secret/verifier/body is copied into it.
// It excludes activity timestamps so normal reads do not invalidate this fence.
function graphSpecs(accountId,deviceId){
 const specs=[
  ["SELECT id,credential_version,revoked_at FROM sync_account_devices WHERE account_id=? ORDER BY id",[accountId]],
  ["SELECT id,app_id,state,generation,sync_user_id FROM sync_account_memberships WHERE account_id=? ORDER BY id",[accountId]],
  ["SELECT l.account_id,l.membership_id,l.app_device_id,l.account_device_id,d.user_id,d.app_id,d.credential_version,d.revoked_at FROM sync_membership_device_links l LEFT JOIN sync_devices d ON d.id=l.app_device_id WHERE l.account_id=? ORDER BY l.app_device_id",[accountId]],
  ["SELECT invitation_id,membership_id,target_app_id,claimed_by_account_device_id,claimed_by_app_device_id,consumed_at,cancelled_at FROM sync_app_join_invitations WHERE account_id=? AND created_by_account_device_id=? ORDER BY invitation_id",[accountId,deviceId]],
  ["SELECT invitation_id,claimed_by_account_device_id,consumed_at,cancelled_at FROM sync_port_join_invitations WHERE account_id=? AND created_by_account_device_id=? ORDER BY invitation_id",[accountId,deviceId]],
  ["SELECT handoff_id,claimed_by_app_device_id,consumed_at,cancelled_at FROM sync_membership_handoffs WHERE account_id=? AND created_by_account_device_id=? ORDER BY handoff_id",[accountId,deviceId]]
 ];
 return specs.map(([sql,params])=>({sql:`SELECT COALESCE(json_group_array(json_object(${sql.slice(7,sql.indexOf(' FROM')).split(',').map(s=>s.trim()).flatMap(s=>["'"+s.split('.').pop()+"'",s.split('.').pop()]).join(',')})),'[]') AS snapshot FROM (${sql})`,params}));
}
export async function readLifecycleContext(ctx){
 if(ctx.path.includes('/recovery-rotation/')){
  try{ctx.rotationClaimId=parseAccountRecoveryClaim(ctx.body?.claimToken)?.claimId;ctx.rotationVerifier=await accountRecoveryClaimVerifier(ctx.body?.claimToken,ctx.env.SYNC_ACCOUNT_RECOVERY_PEPPER);
   if(ctx.path.endsWith('/prepare'))ctx.nextRecoveryVerifier=await accountRecoveryCodeVerifier(ctx.body.nextRecoveryCode,ctx.env.SYNC_ACCOUNT_RECOVERY_PEPPER);
   else ctx.rotation=await ctx.db.prepare('SELECT * FROM sync_account_recovery_rotations WHERE claim_id=? AND claim_verifier=?').bind(ctx.rotationClaimId||'',ctx.rotationVerifier).first();
  }catch{ /* Native owner rejects malformed input. No identity is invented. */ }
 }
 if(ctx.path===appPath){
  const owner=await inspectCurrentAppEnvironmentOwner(ctx.request,{...ctx.env,SYNC_DB:ctx.db},{admissionProvenance:'production'});
  if(owner?.identity){
   const i=owner.identity;
   const row=await ctx.db.prepare(`SELECT a.generation,a.recovery_version,m.generation AS membership_generation,m.sync_user_id,d.credential_version AS app_credential_version,cd.credential_version AS account_credential_version
    FROM sync_membership_device_links l JOIN sync_accounts a ON a.id=l.account_id JOIN sync_account_memberships m ON m.id=l.membership_id AND m.account_id=a.id
    JOIN sync_devices d ON d.id=l.app_device_id AND d.user_id=m.sync_user_id AND d.app_id=m.app_id JOIN sync_account_devices cd ON cd.id=l.account_device_id AND cd.account_id=a.id
    WHERE l.app_device_id=? AND l.account_id=? AND l.membership_id=? AND l.account_device_id=? AND m.app_id=? AND d.credential_verifier=? AND a.admission_provenance='production'`).bind(i.appDeviceId,i.accountId,i.membershipId,i.accountDeviceId,i.appId,owner.verifier).first();
   if(!row||![row.generation,row.recovery_version,row.membership_generation,row.app_credential_version,row.account_credential_version].every(positive))throw Error('app_owner_counters_unknown');
   ctx.app={...i,...row,verifier:owner.verifier};ctx.lifecycleSubject={kind:'app-device',accountId:i.accountId,membershipId:i.membershipId,appDeviceId:i.appDeviceId,accountDeviceId:i.accountDeviceId,appId:i.appId,generation:row.generation,recoveryVersion:row.recovery_version,membershipGeneration:row.membership_generation,credentialVersion:row.app_credential_version,accountCredentialVersion:row.account_credential_version};
  }else if(owner?.error==='account_admission_mismatch')throw Error('qa_owner_profile_hold');
 }
 if(ctx.path===envPath&&ctx.account){
  ctx.detachGraph=[];
  for(const spec of graphSpecs(ctx.account.accountId,ctx.account.accountDeviceId)){
   const row=await ctx.db.prepare(spec.sql).bind(...spec.params).first();if(typeof row?.snapshot!=='string'||row.snapshot.length>65536)throw Error('detach_graph_unknown');ctx.detachGraph.push({...spec,snapshot:row.snapshot});
  }
 }
}
function appAssertion(ctx){
 const i=ctx.app;if(!i)throw Error('app_owner_unverified');
 return q(`EXISTS(SELECT 1 FROM sync_membership_device_links l JOIN sync_accounts a ON a.id=l.account_id
 JOIN sync_account_memberships m ON m.id=l.membership_id AND m.account_id=a.id JOIN sync_devices d ON d.id=l.app_device_id AND d.user_id=m.sync_user_id AND d.app_id=m.app_id
 JOIN sync_account_devices cd ON cd.id=l.account_device_id AND cd.account_id=a.id
 WHERE a.id=? AND a.state='active' AND a.deleted_at IS NULL AND a.admission_provenance='production' AND a.generation=? AND a.recovery_version=?
 AND m.id=? AND m.app_id=? AND m.state='active' AND m.generation=? AND m.sync_user_id=?
 AND d.id=? AND d.credential_verifier=? AND d.credential_version=? AND d.revoked_at IS NULL
 AND cd.id=? AND cd.credential_version=? AND cd.revoked_at IS NULL
 AND (SELECT COUNT(*) FROM sync_membership_device_links x WHERE x.account_id=a.id AND x.account_device_id=cd.id)=1)`,i.accountId,i.generation,i.recovery_version,i.membershipId,i.appId,i.membership_generation,i.sync_user_id,i.appDeviceId,i.verifier,i.app_credential_version,i.accountDeviceId,i.account_credential_version);
}
export function lifecycleTransactionProfile(ctx,items,base,accountAssertion){
 const text=items.map(x=>x.sql.replace(/\s+/g,' ').trim()).join('\n');
 if(ctx.path.includes('/recovery-rotation/')&&(/sync_account_recovery_rotations/.test(text))){
  base.lane='security';base.assertions.push(accountAssertion(ctx));
  if(ctx.path.endsWith('/prepare')&&items.length===1&&/^INSERT INTO sync_account_recovery_rotations/.test(text)){
   base.label='recovery-code-rotation-prepare';
   base.outcome=q(`EXISTS(SELECT 1 FROM sync_account_recovery_rotations WHERE claim_id=? AND claim_verifier=? AND account_id=? AND requested_by_account_device_id=? AND expected_recovery_version=? AND expected_account_generation=? AND next_recovery_verifier=? AND prepare_operation_id=? AND prepare_fingerprint=? AND committed_at IS NULL AND cancelled_at IS NULL AND expires_at>${nowSQL})`,ctx.rotationClaimId,ctx.rotationVerifier,ctx.account.accountId,ctx.account.accountDeviceId,ctx.account.recoveryVersion,ctx.account.generation,ctx.nextRecoveryVerifier,ctx.body.operationId,items[0].values[6]);
   base.summary={type:'recovery-code-rotation-prepared'};return base;
  }
  if(ctx.path.endsWith('/commit')&&/^UPDATE sync_accounts SET recovery_version/.test(text)){
   const r=ctx.rotation;if(!r||r.account_id!==ctx.account.accountId||r.requested_by_account_device_id!==ctx.account.accountDeviceId||!positive(r.expected_recovery_version)||!positive(r.expected_account_generation))throw Error('rotation_owner_unknown');
   base.label='recovery-code-rotation-commit';
   base.assertions.push(q(`EXISTS(SELECT 1 FROM sync_account_recovery_rotations WHERE claim_id=? AND claim_verifier=? AND account_id=? AND requested_by_account_device_id=? AND expected_recovery_version=? AND expected_account_generation=? AND next_recovery_verifier=? AND committed_at IS NULL AND cancelled_at IS NULL AND expires_at>${nowSQL})`,r.claim_id,ctx.rotationVerifier,r.account_id,r.requested_by_account_device_id,ctx.account.recoveryVersion,ctx.account.generation,r.next_recovery_verifier));
   const finish=items.find(x=>/SET committed_at/.test(x.sql));if(!finish)throw Error('rotation_plan_unknown');
   base.outcome=q(`EXISTS(SELECT 1 FROM sync_accounts a JOIN sync_account_recovery_rotations r ON r.account_id=a.id WHERE r.claim_id=? AND r.claim_verifier=? AND r.commit_operation_id=? AND r.commit_fingerprint=? AND r.committed_at IS NOT NULL AND r.cancelled_at IS NULL AND a.id=? AND a.state='active' AND a.recovery_version=? AND a.recovery_verifier=r.next_recovery_verifier AND a.generation=?) AND NOT EXISTS(SELECT 1 FROM sync_account_recovery_rotations WHERE account_id=? AND claim_id<>? AND committed_at IS NULL AND cancelled_at IS NULL) AND NOT EXISTS(SELECT 1 FROM sync_account_recovery_claims WHERE account_id=? AND committed_at IS NULL AND cancelled_at IS NULL)`,r.claim_id,ctx.rotationVerifier,ctx.body.operationId,finish.values[2],ctx.account.accountId,ctx.account.recoveryVersion+1,ctx.account.generation,ctx.account.accountId,r.claim_id,ctx.account.accountId);
   base.summary={type:'recovery-code-rotated',accountId:ctx.account.accountId,recoveryVersion:ctx.account.recoveryVersion+1,accountCredentialUnchanged:true};return base;
  }
 }
 if(ctx.path===envPath&&/INSERT INTO sync_account_lifecycle_operations/.test(text)){
  if(!ctx.detachGraph)throw Error('detach_graph_unknown');base.lane='security';base.label='current-environment-detach';base.assertions.push(accountAssertion(ctx));
  base.assertions.push(...ctx.detachGraph.map(s=>q(`(SELECT snapshot FROM (${s.sql}))=?`,...s.params,s.snapshot)));
  const a=ctx.account.accountId,d=ctx.account.accountDeviceId;
  base.assertions.push(q(`NOT EXISTS(SELECT 1 FROM sync_membership_device_links l LEFT JOIN sync_account_memberships m ON m.id=l.membership_id LEFT JOIN sync_devices ad ON ad.id=l.app_device_id LEFT JOIN sync_account_devices cd ON cd.id=l.account_device_id WHERE l.account_id=? AND l.account_device_id=? AND (m.id IS NULL OR m.account_id<>l.account_id OR ad.id IS NULL OR ad.user_id IS NOT m.sync_user_id OR ad.app_id<>m.app_id OR cd.id IS NULL OR cd.account_id<>l.account_id))`,a,d));
  base.assertions.push(q(`NOT EXISTS(SELECT 1 FROM sync_membership_device_links l JOIN sync_account_memberships m ON m.id=l.membership_id AND m.account_id=l.account_id WHERE l.account_id=? AND l.account_device_id=? AND m.app_id<>'port') AND NOT EXISTS(SELECT 1 FROM sync_app_join_invitations h WHERE h.account_id=? AND h.created_by_account_device_id=? AND h.consumed_at IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM sync_account_devices cd WHERE cd.id=h.claimed_by_account_device_id AND cd.account_id=h.account_id) OR NOT EXISTS(SELECT 1 FROM sync_membership_device_links l JOIN sync_account_memberships m ON m.id=l.membership_id AND m.account_id=l.account_id JOIN sync_devices ad ON ad.id=l.app_device_id AND ad.user_id=m.sync_user_id AND ad.app_id=m.app_id WHERE l.account_id=h.account_id AND l.membership_id=h.membership_id AND l.account_device_id=h.claimed_by_account_device_id AND l.app_device_id=h.claimed_by_app_device_id AND m.app_id=h.target_app_id)))`,a,d,a,d));
  const record=items.find(x=>/INSERT INTO sync_account_lifecycle_operations/.test(x.sql));
  base.outcome=q(`EXISTS(SELECT 1 FROM sync_account_lifecycle_operations o JOIN sync_account_devices d ON d.id=o.target_id AND d.account_id=o.account_id WHERE o.operation_id=? AND o.request_fingerprint=? AND o.account_id=? AND o.kind='device_revoke' AND o.target_id=? AND d.revoked_at IS NOT NULL AND json_extract(o.result_json,'$.scope')='current_environment' AND json_extract(o.result_json,'$.accountDeviceId')=d.id) AND NOT EXISTS(SELECT 1 FROM sync_app_join_invitations h JOIN sync_account_devices cd ON cd.id=h.claimed_by_account_device_id WHERE h.account_id=? AND h.created_by_account_device_id=? AND h.consumed_at IS NOT NULL AND cd.revoked_at IS NULL) AND NOT EXISTS(SELECT 1 FROM sync_devices ad WHERE ad.revoked_at IS NULL AND ad.id IN(SELECT l.app_device_id FROM sync_membership_device_links l JOIN sync_account_memberships m ON m.id=l.membership_id AND m.account_id=l.account_id AND m.app_id='port' WHERE l.account_id=? AND l.account_device_id=? UNION SELECT claimed_by_app_device_id FROM sync_app_join_invitations WHERE account_id=? AND created_by_account_device_id=? AND consumed_at IS NOT NULL))`,ctx.body.operationId,record.values[1],a,d,a,d,a,d,a,d);
  base.witness=ctx.detachGraph.map(s=>s.snapshot);base.summary={type:'current-environment-detached',accountId:a,accountDeviceId:d};return base;
 }
 if(ctx.path===appPath&&/INSERT INTO sync_account_lifecycle_operations/.test(text)){
  base.lane='security';base.label='current-app-environment-detach';base.assertions.push(appAssertion(ctx));const i=ctx.app,record=items.find(x=>/INSERT INTO sync_account_lifecycle_operations/.test(x.sql));
  base.outcome=q(`EXISTS(SELECT 1 FROM sync_account_lifecycle_operations o JOIN sync_devices ad ON ad.id=o.target_id JOIN sync_account_devices cd ON cd.id=? AND cd.account_id=o.account_id WHERE o.operation_id=? AND o.request_fingerprint=? AND o.account_id=? AND o.target_id=? AND o.kind='device_revoke' AND ad.revoked_at IS NOT NULL AND cd.revoked_at IS NOT NULL AND json_extract(o.result_json,'$.scope')='current_app_environment' AND json_extract(o.result_json,'$.appId')=? AND json_extract(o.result_json,'$.membershipId')=? AND json_extract(o.result_json,'$.appDeviceId')=? AND json_extract(o.result_json,'$.accountDeviceId')=?)`,i.accountDeviceId,ctx.body.operationId,record.values[1],i.accountId,i.appDeviceId,i.appId,i.membershipId,i.appDeviceId,i.accountDeviceId);
  base.summary={type:'current-app-environment-detached',accountId:i.accountId,membershipId:i.membershipId,appDeviceId:i.appDeviceId,accountDeviceId:i.accountDeviceId};return base;
 }
 return null;
}
