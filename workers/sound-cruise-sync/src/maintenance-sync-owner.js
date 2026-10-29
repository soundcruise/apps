import { readAuthorityEvidence } from './authority-cutover.js';
import { fenceQuery } from './writer-fence.js';
import { hmacVerifier, parseDeviceCredential, timingSafeHexEqual } from './crypto.js';
import { inspectProCredentialReadOnly } from './pro-auth-app.js';
import { maintenanceCanonical, maintenanceDigest } from './maintenance-bridge-v2.js';
import { PRO_SESSION_IDLE_MS } from './pro-device-session.js';

// Only Account-managed canonical datasets. Legacy/dual recovery, QA and all R2 paths stay HOLD.
export const SYNC_OWNER_ROUTES=Object.freeze(Object.fromEntries([
 ['POST','bootstrap','writer'],['POST','push','writer'],['POST','migration/complete','writer'],
 ['GET','changes','security'],['GET','snapshot','security'],['GET','devices','security'],
 ['POST','devices/revoke','security'],['POST','removal-safety','writer'],['GET','writer-authority','security']
].map(([method,path,lane])=>['/v1/sync/'+path,{method,owner:'sync',state:'sync-managed-device',lane}])));
const safe=n=>Number.isSafeInteger(n)&&n>=1&&n<Number.MAX_SAFE_INTEGER;
const q=(sql,...params)=>({sql:'SELECT CASE WHEN ('+sql+') THEN 1 ELSE 0 END AS ok',params});
const NOW="CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
const normalize=s=>s.replace(/\s+/g,' ').trim();
const FENCE_READ=normalize(fenceQuery({identity:{},fields:{},authority:null}).sql);
export const syncReadOnlySql=sql=>normalize(sql)===FENCE_READ;
const GRAPH=`SELECT json_array(d.id,d.user_id,d.app_id,d.credential_verifier,d.credential_version,d.revoked_at,u.state,u.deleted_at,
 am.account_id,am.membership_id,am.app_id,a.state,a.generation,a.recovery_version,a.deleted_at,a.admission_provenance,
 m.state,m.generation,m.recovery_mode,m.sync_user_id,l.account_id,l.membership_id,l.account_device_id,
 ad.account_id,ad.credential_version,ad.revoked_at) proof
 FROM sync_devices d JOIN sync_users u ON u.id=d.user_id
 JOIN sync_account_managed_users am ON am.sync_user_id=d.user_id AND am.app_id=d.app_id
 JOIN sync_accounts a ON a.id=am.account_id
 JOIN sync_account_memberships m ON m.id=am.membership_id AND m.account_id=a.id AND m.app_id=d.app_id AND m.sync_user_id=d.user_id
 JOIN sync_membership_device_links l ON l.app_device_id=d.id AND l.account_id=a.id AND l.membership_id=m.id
 JOIN sync_account_devices ad ON ad.id=l.account_device_id AND ad.account_id=a.id
 WHERE d.id=? AND d.app_id=?`;
export async function readSyncContext({request,body,route,operationId,env,db,dependencies,fingerprint}){
 const url=new URL(request.url),appId=body?.appId||url.searchParams.get('appId');
 if(url.pathname.endsWith('/removal-safety')&&appId==='port')throw Error('sync_native_app_scope_hold');
 if(!['port','chord','pitch','fretboard','rhythm'].includes(appId))throw Error('sync_app_hold');
 if(url.pathname.endsWith('/push')){
  const external=value=>value&&typeof value==='object'&&(Array.isArray(value)?value.some(external):Object.entries(value).some(([k,v])=>/asset|attachment|object.?key|storage.?key|r2.?key|blob|image|binary/i.test(k)||external(v)));
  if(body?.operations?.some(op=>/attachment|image|binary/i.test(op.recordType||'')||external(op.payload)))throw Error('sync_external_reference_owner_hold');
 }
 const auth=request.headers.get('Authorization')||'',parsed=parseDeviceCredential(auth.startsWith('Bearer ')?auth.slice(7):'');
 if(!parsed)throw Error('sync_identity_unknown');
 const rows=(await db.prepare(GRAPH).bind(parsed.deviceId,appId).all()).results;if(rows.length!==1)throw Error('sync_legacy_or_graph_hold');
 const proof=JSON.parse(rows[0].proof),verifier=await hmacVerifier(auth.slice(7),env.SYNC_CREDENTIAL_PEPPER);
 if(!timingSafeHexEqual(verifier,proof[3]))throw Error('sync_identity_unknown');
 if(![proof[4],proof[12],proof[13],proof[17],proof[24]].every(safe))throw Error('sync_generation_unknown');
 const control=await db.prepare('SELECT * FROM sync_runtime_control WHERE singleton_id=1').first();
 const accountControl=await db.prepare('SELECT * FROM sync_account_runtime_control WHERE singleton_id=1').first();
 if(!safe(control?.generation)||!safe(accountControl?.generation))throw Error('sync_control_unknown');
 const membership=await db.prepare('SELECT * FROM sync_account_memberships WHERE id=?').bind(proof[9]).first();
 const authority=Object.hasOwn(membership,'write_epoch')?[membership.minimum_writer_protocol,membership.write_epoch,membership.authority_state,membership.authority_updated_at]:null;
 if(authority&&(!Number.isSafeInteger(authority[0])||authority[0]<0||!safe(authority[1])||!['legacy','prepared','paused','enforced'].includes(authority[2])||!Number.isSafeInteger(authority[3])||authority[3]<0))throw Error('sync_authority_unknown');
 if(route.lane==='writer'||url.pathname.endsWith('/writer-authority')){
  const columns=(await db.prepare("SELECT name FROM pragma_table_info('sync_authority_cutovers')").all()).results.map(r=>r.name);
  if(!authority||!['account_generation','membership_generation'].every(k=>columns.includes(k)))throw Error('sync_schema_stage_hold');
 }
 if(route.lane==='writer'){
  if(authority[2]==='paused')throw Error('sync_authority_paused');
  if(authority[2]!=='legacy'){
   if(appId!=='port')throw Error('sync_authority_owner_hold');
   const existing=await readAuthorityEvidence(db,{accountId:proof[8],membershipId:proof[9]});
   if(!existing.fence||!['prepared','enforced'].includes(existing.fence.barrierState))throw Error('sync_authority_evidence_hold');
  }
 }
 const management=url.pathname.endsWith('/devices')||url.pathname.endsWith('/devices/revoke');
 let pro=null;if(!management){const checked=await inspectProCredentialReadOnly(request.headers.get('X-Sound-Cruise-Pro-Authorization'),{...env,SYNC_DB:db},{...dependencies,includeWriterProof:true});if(checked?.ok===true)pro=checked.writerProof;}
 const proGeneration=pro?(await db.prepare('SELECT generation FROM pro_credentials WHERE id=?').bind(pro.id).first())?.generation:null;
 if(pro&&!safe(proGeneration))throw Error('sync_pro_generation_unknown');
 const dataset=await db.prepare('SELECT state,schema_version FROM sync_datasets WHERE user_id=? AND app_id=?').bind(proof[1],appId).first();
 const valid=proof[5]===null&&['active','provisioning'].includes(proof[6])&&proof[7]===null&&proof[11]==='active'&&proof[14]===null&&proof[15]==='production'&&proof[16]==='active'&&proof[18]==='account'&&proof[25]===null&&(management||Boolean(pro));
 const subject={kind:'managed-sync-device',accountId:proof[8],membershipId:proof[9],userId:proof[1],deviceId:proof[0],accountDeviceId:proof[22],appId,accountGeneration:proof[12],membershipGeneration:proof[17],credentialVersion:proof[4]};
 const ctx={request,route,path:url.pathname,body,operationId,fingerprint,env,db,dependencies,proof,control,accountControl,authority,dataset,pro,proGeneration,management,valid,appId,deviceId:proof[0],userId:proof[1]};
 ctx.actor=Object.freeze({ownerId:'maintenance-sync-owner-v1',profile:'owner-http-v1',purpose:route.state,invocationId:operationId,requestFingerprint:fingerprint,subject});return ctx;
}
export function syncControlAssertion(ctx){return q('EXISTS(SELECT 1 FROM sync_runtime_control WHERE singleton_id=1 AND generation=? AND rollout_mode=? AND admission_enabled=? AND data_write_enabled=? AND data_read_enabled=? AND recovery_enabled=? AND cloud_delete_enabled=?) AND EXISTS(SELECT 1 FROM sync_account_runtime_control WHERE singleton_id=1 AND generation=?)',ctx.control.generation,ctx.control.rollout_mode,ctx.control.admission_enabled,ctx.control.data_write_enabled,ctx.control.data_read_enabled,ctx.control.recovery_enabled,ctx.control.cloud_delete_enabled,ctx.accountControl.generation);}
export function syncOwnerAssertions(ctx,{postRevoke=null,completion=false}={}){
 if(!ctx.valid||(ctx.selfRevoked&&!completion))throw Error('sync_owner_unverified');
 const p=[...ctx.proof];if(postRevoke&&ctx.body.deviceId===ctx.deviceId)p[5]=postRevoke;
 const a=[syncControlAssertion(ctx),q('(SELECT proof FROM ('+GRAPH+'))=?',ctx.deviceId,ctx.appId,JSON.stringify(p))];
 if(ctx.authority)a.push(q('EXISTS(SELECT 1 FROM sync_account_memberships WHERE id=? AND minimum_writer_protocol=? AND write_epoch=? AND authority_state=? AND authority_updated_at=?)',p[9],...ctx.authority));
 if(ctx.pro){a.push(q(`EXISTS(SELECT 1 FROM pro_credentials p JOIN pro_auth_state s ON s.singleton_id=1 WHERE p.id=? AND p.verifier=? AND p.scope='global_pro' AND p.revoked_at IS NULL AND p.generation=s.generation AND p.generation=? AND ${NOW}<COALESCE(p.last_validated_at,MAX(p.created_at,s.session_lifecycle_started_at))+${PRO_SESSION_IDLE_MS} AND ${NOW}<CASE WHEN p.device_public_key IS NOT NULL THEN p.lease_expires_at ELSE s.unbound_backend_until END)`,ctx.pro.id,ctx.pro.verifier,ctx.proGeneration));}
 return a;
}
function combine(items){return{sql:'SELECT CASE WHEN '+items.map(x=>'(SELECT ok FROM ('+x.sql+'))=1').join(' AND ')+' THEN 1 ELSE 0 END AS ok',params:items.flatMap(x=>x.params)};}
export function syncTransactionProfile(ctx,items){
 let core=[...items];if(/^INSERT INTO sync_writer_fence_assertion\b/i.test(normalize(core[0].sql))){if(!/^DELETE FROM sync_writer_fence_assertion$/i.test(normalize(core.at(-1).sql)))throw Error('sync_fence_shape_hold');core=core.slice(1,-1);}else if(/^SELECT minimum_writer_protocol, write_epoch, authority_state FROM sync_account_memberships/i.test(normalize(core[0].sql)))core=core.slice(1);
 if(!core.length)throw Error('sync_empty_plan');
 const offset=items.indexOf(core[0]);let required=[];
 const sql=core.map(s=>normalize(s.sql)),p=core[0].values,a=syncOwnerAssertions(ctx);let label,lane='security',outcome,type='sync-owner-observation';
 const datasetFence=()=>ctx.dataset?q('EXISTS(SELECT 1 FROM sync_datasets WHERE user_id=? AND app_id=? AND state=? AND schema_version=?)',ctx.userId,ctx.appId,ctx.dataset.state,ctx.dataset.schema_version):q('NOT EXISTS(SELECT 1 FROM sync_datasets WHERE user_id=? AND app_id=?)',ctx.userId,ctx.appId);
 if(core.length===1&&/^UPDATE sync_devices SET last_seen_at = CASE/i.test(sql[0])){label='sync-device-activity';if(p[5])required=[offset];if(p[3]!==ctx.deviceId||p[4]!==ctx.userId)throw Error('sync_device_scope');outcome=q('changes()=? AND EXISTS(SELECT 1 FROM sync_devices WHERE id=? AND paired_at IS NOT NULL AND last_seen_at>=?)',p[5]?1:0,ctx.deviceId,p[0]?p[1]:0);}
 else if(core.length===1&&/^INSERT OR IGNORE INTO sync_account_activity /i.test(sql[0])){label='sync-account-activity-insert';if(p[2]!==ctx.proof[8])throw Error('sync_account_scope');outcome=q('EXISTS(SELECT 1 FROM sync_account_activity WHERE account_id=?)',ctx.proof[8]);}
 else if(core.length===1&&/^UPDATE sync_account_activity SET state = 'active'/i.test(sql[0])){label='sync-account-activity-touch';if(p[2]!==ctx.proof[8])throw Error('sync_account_scope');outcome=q("EXISTS(SELECT 1 FROM sync_account_activity WHERE account_id=? AND state='active')",ctx.proof[8]);}
 else if(core.length===2&&/^SELECT record_type, record_id/i.test(sql[0])&&/^SELECT state, schema_version, record_count/i.test(sql[1])){label='sync-snapshot-observation';if(core.some(s=>s.values[0]!==ctx.userId||s.values[1]!==ctx.appId))throw Error('sync_snapshot_scope');outcome=datasetFence();}
 else if(ctx.path.endsWith('/bootstrap')&&core.length===1&&/^INSERT INTO sync_datasets /i.test(sql[0])){label='sync-bootstrap';required=[offset];lane='writer';a.push(datasetFence());outcome=q("changes()=1 AND EXISTS(SELECT 1 FROM sync_datasets WHERE user_id=? AND app_id=? AND state='initializing' AND schema_version=? AND record_count=? AND manifest_hash IS ?)",ctx.userId,ctx.appId,p[2],p[3],p[4]);type='sync-dataset-bootstrap';}
 else if(ctx.path.endsWith('/push')&&core.length===3&&/^INSERT INTO sync_records /i.test(sql[0])&&/^INSERT INTO sync_changes /i.test(sql[1])&&/^UPDATE sync_datasets SET record_count/i.test(sql[2])){
  if(p[0]!==ctx.userId||p[1]!==ctx.appId||p[8]!==ctx.deviceId||p[11]!==ctx.deviceId||p[12]!==ctx.userId||p[13]!==ctx.appId)throw Error('sync_push_scope');
  label='sync-push-'+p[9];required=[offset,offset+1,offset+2];lane='writer';a.push(datasetFence());outcome=q('changes()=1 AND EXISTS(SELECT 1 FROM sync_records r JOIN sync_changes c ON c.user_id=r.user_id AND c.app_id=r.app_id AND c.record_type=r.record_type AND c.record_id=r.record_id AND c.operation_id=r.last_operation_id WHERE r.user_id=? AND r.app_id=? AND r.record_type=? AND r.record_id=? AND r.last_operation_id=? AND r.revision=? AND c.operation_hash=? AND r.payload_hash=?)',ctx.userId,ctx.appId,p[2],p[3],p[9],p[14]+1,core[1].values[1],p[5]);type='sync-record-cas-committed';
 }
 else if(ctx.path.endsWith('/migration/complete')&&core.length===1&&/^UPDATE sync_datasets SET state = 'ready'/i.test(sql[0])){label='sync-migration-complete';required=[offset];lane='writer';a.push(datasetFence());outcome=q("changes()=1 AND EXISTS(SELECT 1 FROM sync_datasets WHERE user_id=? AND app_id=? AND state='ready' AND record_count=? AND manifest_hash=? AND last_change_seq=?)",ctx.userId,ctx.appId,p[0],p[1],p[6]);type='sync-dataset-ready';}
 else if(ctx.path.endsWith('/removal-safety')&&core.length===1&&/^INSERT INTO sync_app_device_sync_safety /i.test(sql[0])){label='sync-removal-safety';required=[offset];lane='writer';a.push(datasetFence());if(p[0]!==ctx.deviceId||p[1]!==ctx.proof[8]||p[2]!==ctx.proof[9]||p[3]!==ctx.appId)throw Error('sync_safety_scope');outcome=q('changes()=1 AND EXISTS(SELECT 1 FROM sync_app_device_sync_safety WHERE app_device_id=? AND account_id=? AND membership_id=? AND state=? AND reported_at=? AND attention_count=?)',p[0],p[1],p[2],p[4],p[6],p[7]);type='sync-removal-state-reported';}
 else if(ctx.path.endsWith('/devices/revoke')&&core.length===2&&/^UPDATE sync_devices SET revoked_at/i.test(sql[0])&&/^UPDATE pairing_codes SET cancelled_at/i.test(sql[1])){label='sync-device-revoke';if(p[1]!==ctx.body.deviceId||p[2]!==ctx.userId||p[3]!==ctx.appId)throw Error('sync_revoke_scope');a.push(q('EXISTS(SELECT 1 FROM sync_devices WHERE id=? AND user_id=? AND app_id=?)',p[1],ctx.userId,ctx.appId));outcome=q('EXISTS(SELECT 1 FROM sync_devices WHERE id=? AND user_id=? AND app_id=? AND revoked_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM pairing_codes WHERE user_id=? AND target_app_id=? AND created_by_device_id=? AND consumed_at IS NULL AND cancelled_at IS NULL)',p[1],ctx.userId,ctx.appId,ctx.userId,ctx.appId,p[1]);return{label,lane,requiredChanges:[offset],selfRevocation:ctx.body.deviceId===ctx.deviceId?p[0]:null,assertions:a,outcome:combine([outcome,...syncOwnerAssertions(ctx,{postRevoke:p[0]})]),summary:{type:'sync-device-revocation-state-proven'}};}
 else throw Error('sync_statement_plan_hold');
 return{label,lane,requiredChanges:required,assertions:a,outcome:combine([outcome,...syncOwnerAssertions(ctx)]),summary:{type}};
}
export function syncBridgeOwner(ctx,plan=null,{parentRequired=Boolean(plan)}={}){
 const identity=maintenanceCanonical(ctx.actor);return{id:ctx.actor.ownerId,allowRequestReservations:plan===null,validateIdentity:i=>maintenanceCanonical(i)===identity,
 async verify(r,purpose){if(maintenanceCanonical(r.identity)!==identity)return{allowed:false};const a=plan?[...plan.assertions]:['reconcile','recovery'].includes(purpose)?[syncControlAssertion(ctx)]:syncOwnerAssertions(ctx,{completion:true});
 if(parentRequired)a.push(q("EXISTS(SELECT 1 FROM sync_maintenance_v2_operations o JOIN sync_maintenance_v2_control c ON c.scope=o.scope AND c.epoch=o.epoch WHERE o.operation_id=? AND o.phase='registered' AND o.binding_digest=? AND c.phase='open' AND c.epoch=?)",ctx.operationId,await maintenanceDigest(ctx.actor),ctx.security.epoch));
 return{allowed:true,identityDigest:await maintenanceDigest(ctx.actor),assertions:a};},async verifyHandover(){return false;}};
}
