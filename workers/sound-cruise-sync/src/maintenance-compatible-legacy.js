import {parseWriterFields} from '../../../apps/shared/sync-account/writer-authority.mjs';
import {compatibleSchemaSnapshot,guardCompatibleD1} from './maintenance-compatible-schema.js';
import {readSyncContext,syncOwnerAssertions} from './maintenance-sync-owner.js';
import {inspectProCredentialReadOnly} from './pro-auth-app.js';
import {PRO_SESSION_IDLE_MS} from './pro-device-session.js';
const safe=n=>Number.isSafeInteger(n)&&n>=1&&n<Number.MAX_SAFE_INTEGER;
const q=(sql,...params)=>({sql:'SELECT CASE WHEN ('+sql+') THEN 1 ELSE 0 END AS ok',params});
const NOW="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
// Exact0033 compatibility only. Native handler still performs Origin/rate/HMAC/Pro/
// payload validation. This adapter neither issues credentials nor fabricates0034 fields.
export function legacy33AdmissionDependencies({request,env}){
 const admissions=new WeakMap();
 return Object.freeze({
  async admitWriter(db,identity,input,authority,options){
   const parsed=parseWriterFields(input);if(!parsed.ok)return{error:parsed.code,status:parsed.status};
   // A protocol/epoch-bearing caller is NOT an old0033 writer. Never invent metadata.
   if(Object.keys(parsed.value).length)return{error:'dataset_authority_unavailable',status:503};
   const stage=await compatibleSchemaSnapshot(db);if(stage.stage!==33||stage.metadata!=='absent')throw Error('legacy33_schema_hold');
   if(!identity?.userId||!identity?.deviceId||!identity.appId||!options.deviceVerifier)throw Error('legacy33_native_proof_missing');
   const runtime=await db.prepare('SELECT * FROM sync_runtime_control WHERE singleton_id=1').first();if(!runtime||!safe(runtime.generation)||runtime.rollout_mode!=='open'||runtime.data_write_enabled!==1)throw Error('legacy33_runtime_stopped');const runtimeGuard=q('EXISTS(SELECT 1 FROM sync_runtime_control WHERE singleton_id=1 AND generation=? AND rollout_mode=? AND admission_enabled=? AND data_write_enabled=? AND data_read_enabled=? AND recovery_enabled=? AND cloud_delete_enabled=?)',runtime.generation,runtime.rollout_mode,runtime.admission_enabled,runtime.data_write_enabled,runtime.data_read_enabled,runtime.recovery_enabled,runtime.cloud_delete_enabled);let guards;
   if(authority){
    const u=new URL(request.url);u.pathname='/v1/sync/snapshot';u.search='?appId='+encodeURIComponent(identity.appId);
    const c=await readSyncContext({request:new Request(u,{headers:request.headers}),body:{appId:identity.appId},route:{owner:'sync',state:'managed-proof',method:'GET',lane:'security'},operationId:crypto.randomUUID(),env,db,dependencies:{},fingerprint:'legacy33-existing-provider-proof'});
    if(!c.valid||c.userId!==identity.userId||c.deviceId!==identity.deviceId||c.proof[8]!==authority.accountId||c.proof[9]!==authority.membershipId||c.proof[3]!==options.deviceVerifier)throw Error('legacy33_managed_owner_hold');
    guards=syncOwnerAssertions(c);
   }else{
    const row=await db.prepare('SELECT d.credential_version,u.recovery_version FROM sync_devices d JOIN sync_users u ON u.id=d.user_id WHERE d.id=? AND d.user_id=? AND d.app_id=? AND d.credential_verifier=? AND d.revoked_at IS NULL AND u.state IN(\'active\',\'provisioning\') AND u.deleted_at IS NULL').bind(identity.deviceId,identity.userId,identity.appId,options.deviceVerifier).first();
    if(!row||!safe(row.credential_version)||!safe(row.recovery_version))throw Error('legacy33_standalone_unknown');
    guards=[q("EXISTS(SELECT 1 FROM sync_devices d JOIN sync_users u ON u.id=d.user_id WHERE d.id=? AND d.user_id=? AND d.app_id=? AND d.credential_verifier=? AND d.credential_version=? AND d.revoked_at IS NULL AND u.state IN('active','provisioning') AND u.deleted_at IS NULL AND u.recovery_version=?) AND NOT EXISTS(SELECT 1 FROM sync_account_managed_users WHERE sync_user_id=?)",identity.deviceId,identity.userId,identity.appId,options.deviceVerifier,row.credential_version,row.recovery_version,identity.userId)];
    const pro=await inspectProCredentialReadOnly(request.headers.get('X-Sound-Cruise-Pro-Authorization'),{...env,SYNC_DB:db},{includeWriterProof:true});
    const proof=pro?.writerProof;if(pro?.ok!==true||!proof||proof.id!==options.proCredentialId||proof.verifier!==options.proVerifier)throw Error('legacy33_pro_hold');
    const generation=(await db.prepare('SELECT generation FROM pro_credentials WHERE id=?').bind(proof.id).first())?.generation;if(!safe(generation))throw Error('legacy33_pro_generation');
    guards.push(q(`EXISTS(SELECT 1 FROM pro_credentials p JOIN pro_auth_state s ON s.singleton_id=1 WHERE p.id=? AND p.verifier=? AND p.revoked_at IS NULL AND p.scope='global_pro' AND p.generation=s.generation AND p.generation=? AND ${NOW}<COALESCE(p.last_validated_at,MAX(p.created_at,s.session_lifecycle_started_at))+${PRO_SESSION_IDLE_MS} AND ${NOW}<CASE WHEN p.device_public_key IS NOT NULL THEN p.lease_expires_at ELSE s.unbound_backend_until END)`,proof.id,proof.verifier,generation));
   }
   guards.push(runtimeGuard);const combined={sql:'SELECT CASE WHEN '+guards.map(x=>'(SELECT ok FROM ('+x.sql+'))=1').join(' AND ')+' THEN 1 ELSE 0 END AS ok',params:guards.flatMap(x=>x.params)};
   const admission=Object.freeze({legacySchema:33});admissions.set(admission,guardCompatibleD1(db,{guard:combined}));return admission;
  },
  writerMutationDatabase(db,admission){if(admission===null)return db;const bound=admissions.get(admission);if(!bound)throw Error('legacy33_admission_brand');return bound;}
 });
}
