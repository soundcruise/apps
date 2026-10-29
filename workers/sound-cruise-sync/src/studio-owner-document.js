import {touchAccountActivity} from './account-activity.js';
import {ACCOUNT_GATE_ACTIONS,accountGateDecision,readAccountRuntimeControl} from './account-rollout-control.js';
import {createD1AccountRepository} from './account-database.js';
import {verifyTurnstileToken} from './turnstile.js';
import {hmacVerifier} from './crypto.js';
import {verifyAccountCredentialSnapshot} from './account-auth.js';
import {parseAccountCredential,accountRecoveryCodeVerifier,normalizeAccountRecoveryCode,accountCredentialVerifier} from './account-crypto.js';
import {canonicalDeviceKey} from './pro-device-session.js';
import {inspectProCredentialReadOnly} from './pro-auth-app.js';
import {createD1SyncRepository} from './sync-database.js';
import {guardCompatibleD1} from './maintenance-compatible-schema.js';
import {maintenanceDigest,maintenanceCanonical} from './maintenance-bridge-v2.js';
import {MAINTENANCE_V2_PROFILES} from './maintenance-v2-profiles.js';
import {STUDIO_DOCUMENT_DDL} from './studio-document-schema.js';
import {STUDIO_RELEASE_DDL,studioReleaseHash,releaseAssertion} from './studio-release-schema.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX=/^[0-9a-f]{64}$/;
const fail=code=>{throw Object.assign(Error(code),{code});};
import {studioCanonical as canonical,studioDigest as digest,studioDocumentUpload} from '../../../apps/cruise-studio/js/cloud/document-codec.mjs';
const utf8=new TextEncoder();

const exact=(x,keys)=>x&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).sort().join('|')===keys.slice().sort().join('|');
const names={sync_records:'studio_document_records',sync_changes:'studio_document_changes',sync_datasets:'studio_document_datasets',sync_users:'studio_document_users',sync_devices:'studio_document_devices'};
// Trusted isolated adapter only: no production router imports this module. Validator is the real
// Studio schema2 validator supplied by the host bundle. Never accept it from HTTP input.
export function createIsolatedStudioDocumentOwner({db,env,validateProject,enabled=false,allowedOrigins=[],verifyEnrollment=verifyTurnstileToken,limits=null,release=false,rate=null}){
 if(!db?.batch||typeof validateProject!=='function')fail('dependencies');
 const q=(s,...v)=>db.prepare(s).bind(...v);
 if(rate&&(!release||!Number.isSafeInteger(rate.requests)||rate.requests<1||!Number.isSafeInteger(rate.windowMs)||rate.windowMs<1000))fail('rate-policy');
 const cap=limits===null?null:Object.freeze({...limits});
 if(cap&&(!exact(cap,['documents','operations','bytes'])||!Number.isSafeInteger(cap.documents)||cap.documents<1||!Number.isSafeInteger(cap.operations)||cap.operations<1||!Number.isSafeInteger(cap.bytes)||cap.bytes<2*24*1024*1024))fail('capacity-policy');
 async function quota(c){if(!cap)return null;const row=(await read(c,`SELECT (SELECT count(*) FROM (SELECT record_id FROM studio_document_records WHERE user_id=? UNION SELECT document_id FROM studio_document_pending WHERE account_id=?)) docs,(SELECT count(*) FROM studio_document_pending WHERE account_id=?) ops,(SELECT COALESCE(sum(bytes),0) FROM studio_document_chunks WHERE account_id=?) bytes`,...Array(4).fill(c.binding.accountId)))[0];if(row.docs>cap.documents||row.ops>cap.operations||row.bytes>cap.bytes)fail('quota-exceeded');return row;}
 function capacity(c){if(!cap)return;const underlying=c.guarded;c.guarded={prepare:sql=>underlying.prepare(sql),async batch(ss){const check=underlying.prepare(`SELECT CASE WHEN (SELECT count(*) FROM (SELECT record_id FROM studio_document_records WHERE user_id=? UNION SELECT document_id FROM studio_document_pending WHERE account_id=?))<=? AND (SELECT count(*) FROM studio_document_pending WHERE account_id=?)<=? AND (SELECT COALESCE(sum(bytes),0) FROM studio_document_chunks WHERE account_id=?)<=? THEN 1 ELSE json_extract('quota','$.abort') END`).bind(c.binding.accountId,c.binding.accountId,cap.documents,c.binding.accountId,cap.operations,c.binding.accountId,cap.bytes);const rows=await underlying.batch([...ss,check]);return rows.slice(0,ss.length);}};}

 async function authorize(headers,{registration=false,enrollment=false,admission=false,securityDelete=false,meter=true}={}){
  if(enabled!==true)fail('studio_off');
  const control=await q('SELECT * FROM studio_document_control WHERE id=1').first();if(control?.enabled!==1||control.version!==1)fail('studio_off');
  const schemaSQL="SELECT json_group_array(json_array(type,name,sql)) encoded FROM (SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'_cf_KV' ORDER BY type,name)";
  const journalSQL='SELECT json_group_array(json_array(id,name)) encoded FROM (SELECT id,name FROM d1_migrations ORDER BY id)';
  const schemaEncoded=(await q(schemaSQL).first()).encoded,journalEncoded=(await q(journalSQL).first()).encoded;
  const schema=JSON.parse(schemaEncoded).filter(x=>x[1].startsWith('studio_document_')).map(([type,name,sql])=>({type,name,sql})).sort((a,b)=>a.name.localeCompare(b.name));
  const expected=(release?STUDIO_RELEASE_DDL:STUDIO_DOCUMENT_DDL).map(sql=>({sql:sql.trim(),name:/CREATE (?:TABLE|VIEW|TRIGGER) (\w+)/.exec(sql)[1]})).sort((a,b)=>a.name.localeCompare(b.name));
  if(schema.length!==expected.length||schema.some((r,i)=>r.name!==expected[i].name||r.sql.trim()!==expected[i].sql))fail('studio_schema_unknown');
  const base=JSON.parse(schemaEncoded).filter(x=>!x[1].startsWith('studio_document_')).map(([type,name,sql])=>({type,name,sql:sql.trim().replace(/;$/,'')}));
  const journal=JSON.parse(journalEncoded),fingerprint=await maintenanceDigest(base);
  const profile=Object.values(MAINTENANCE_V2_PROFILES).find(x=>x.stage===33&&x.fingerprint===fingerprint&&maintenanceCanonical(x.journal)===maintenanceCanonical(journal.map(x=>x[1])));
  if(!profile||journal.some((x,i)=>x[0]!==i+1))fail('base_schema_unknown');
  const runtime=await readAccountRuntimeControl(db),needsAdmission=registration||enrollment||admission;
  const decision=accountGateDecision(needsAdmission?ACCOUNT_GATE_ACTIONS.ACCOUNT_ADMISSION:securityDelete?ACCOUNT_GATE_ACTIONS.ACCOUNT_DELETE:ACCOUNT_GATE_ACTIONS.ACCOUNT_READ,runtime);
  if(!decision.allowed||!Number.isSafeInteger(runtime.generation)||(needsAdmission&&runtime.rolloutMode!=='open'))fail('account_runtime_hold');
  const auth=headers.get('Authorization')||'',proHeader=headers.get('X-Sound-Cruise-Pro-Authorization')||'';
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  const deviceId=token.split('.')[1]||'';
  const row=registration?{account_id:null,id:null,generation:1,recovery_version:1,credential_version:1,deleted_at:null}:await q('SELECT d.*,a.state AS account_state,a.generation,a.recovery_version,a.admission_provenance,a.deleted_at FROM sync_account_devices d JOIN sync_accounts a ON a.id=d.account_id WHERE d.id=?',deviceId).first();
  if(!registration){const ai=await verifyAccountCredentialSnapshot(row,token,env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);if(!ai?.row||row.admission_provenance!=='production')fail('account_required');}
  const pi=await inspectProCredentialReadOnly(proHeader,{...env,SYNC_DB:db},{includeWriterProof:true});if(!pi.ok)fail(pi.code);
  const d=row,a={accountId:row.account_id,accountDeviceId:row.id,generation:row.generation};
  const verifier=registration?null:await accountCredentialVerifier(auth.slice(7),env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);
  if(!registration&&d?.credential_verifier!==verifier)fail('credential_changed');
  const pro=await q('SELECT * FROM pro_credentials WHERE id=?',pi.writerProof.id).first();
  if(row.deleted_at!==null||[row.generation,row.recovery_version,d.credential_version,pro.generation,control.epoch].some(n=>!Number.isSafeInteger(n)||n<1))fail('generation_unknown');
  const binding={audience:'studio-document-v1',accountId:a.accountId,deviceId:a.accountDeviceId,generation:a.generation,recoveryVersion:row.recovery_version,credentialVersion:d.credential_version,proId:pi.writerProof.id,proGeneration:pro.generation,epoch:control.epoch};
  const sql=`SELECT CASE WHEN (?=1 OR EXISTS(SELECT 1 FROM sync_accounts a JOIN sync_account_devices d ON d.account_id=a.id WHERE a.id=? AND a.generation=? AND a.state='active' AND a.admission_provenance='production' AND a.deleted_at IS NULL AND a.recovery_version=? AND d.id=? AND d.credential_version=? AND d.credential_verifier=? AND d.revoked_at IS NULL)) AND (?=1 OR EXISTS(SELECT 1 FROM studio_document_enrollments WHERE account_id=? AND device_id=? AND generation=? AND revoked=0)) AND EXISTS(SELECT 1 FROM pro_credentials p JOIN pro_auth_state s ON s.singleton_id=1 WHERE p.id=? AND p.verifier=? AND p.generation=? AND s.generation=p.generation AND p.scope='global_pro' AND p.revoked_at IS NULL AND CASE WHEN p.device_public_key IS NOT NULL THEN p.last_validated_at+7776000000>unixepoch('subsec')*1000 AND p.lease_expires_at>unixepoch('subsec')*1000 ELSE MAX(p.created_at,s.session_lifecycle_started_at)+7776000000>unixepoch('subsec')*1000 AND s.unbound_backend_until>unixepoch('subsec')*1000 END) AND EXISTS(SELECT 1 FROM studio_document_control WHERE id=1 AND enabled=1 AND version=1 AND epoch=?) THEN 1 ELSE 0 END AS ok`;
  const guarded=guardCompatibleD1(db,{guard:{sql:'SELECT CASE WHEN (SELECT ok FROM ('+sql+'))=1 AND EXISTS(SELECT 1 FROM sync_account_runtime_control WHERE singleton_id=1 AND generation=? AND ((?=1 AND account_admission_enabled=1 AND rollout_mode=\'open\') OR (?=0 AND account_read_enabled=1))) AND EXISTS(SELECT 1 FROM sync_account_runtime_control WHERE singleton_id=1 AND (?=0 OR account_delete_enabled=1)) AND (SELECT encoded FROM ('+schemaSQL+'))=? AND (SELECT encoded FROM ('+journalSQL+'))=? THEN 1 ELSE 0 END AS ok',params:[registration?1:0,a.accountId,a.generation,row.recovery_version,a.accountDeviceId,d.credential_version,verifier,(registration||enrollment)?1:0,a.accountId,a.accountDeviceId,a.generation,pi.writerProof.id,pi.writerProof.verifier,pro.generation,control.epoch,runtime.generation,needsAdmission?1:0,needsAdmission?1:0,securityDelete?1:0,schemaEncoded,journalEncoded]}});
  let releaseGuard=guarded;
  if(release){const hash=await studioReleaseHash();await releaseAssertion(db,hash).all();releaseGuard={prepare:sql=>guarded.prepare(sql),async batch(ss){const result=await guarded.batch([releaseAssertion(guarded,hash),...ss,releaseAssertion(guarded,hash)]);return result.slice(1,-1);}};}
  const result={binding,guarded:releaseGuard,identity:Object.freeze({userId:a.accountId,deviceId:a.accountDeviceId,appId:'studio'})};if(!registration)capacity(result);
  // Durable per-Account fixed-window ceiling. Current authorization is rechecked by the batch;
  // no unauthenticated request can charge another Account. Rows are retained until policy approval.
  if(rate&&!registration&&meter){const window=Math.floor(Date.now()/rate.windowMs);await result.guarded.batch([
   result.guarded.prepare('INSERT INTO studio_document_rate VALUES(?,?,1) ON CONFLICT(account_id,window) DO UPDATE SET requests=requests+1').bind(a.accountId,window),
   result.guarded.prepare("SELECT CASE WHEN (SELECT requests FROM studio_document_rate WHERE account_id=? AND window=?)<=? THEN 1 ELSE json_extract('rate_limited','$.abort') END").bind(a.accountId,window,rate.requests)]);}
  return result;
 }
 async function enroll(headers){const c=await authorize(headers,{enrollment:true});const old=(await read(c,'SELECT * FROM studio_document_enrollments WHERE account_id=? AND device_id=?',c.binding.accountId,c.binding.deviceId))[0];
  if(old){if(old.revoked!==0||old.generation!==c.binding.generation)fail('enrollment_recovery_required');return{status:'enrolled'};}
  await c.guarded.batch([c.guarded.prepare('INSERT INTO studio_document_enrollments VALUES(?,?,?,0)').bind(c.binding.accountId,c.binding.deviceId,c.binding.generation)]);return{status:'enrolled'};}
 // Caller must first establish Origin/rate/Turnstile in a trusted HTTP adapter.
 // This core is not connected to a public route until that adapter is accepted.
 async function register(headers,input){const c=await authorize(headers,{registration:true});
  if(!exact(input,['operationId','credential','recoveryCode','label'])||!UUID.test(input.operationId)||!parseAccountCredential(input.credential)||!normalizeAccountRecoveryCode(input.recoveryCode)||typeof input.label!=='string'||input.label.length>80)fail('registration_request');
  const requestFingerprint=await hmacVerifier('studio-register-v1:'+canonical({input,binding:c.binding}),env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);
  const verifier=await accountCredentialVerifier(input.credential,env.SYNC_ACCOUNT_CREDENTIAL_PEPPER),recoveryVerifier=await accountRecoveryCodeVerifier(input.recoveryCode,env.SYNC_ACCOUNT_RECOVERY_PEPPER);
  const native=createD1AccountRepository(c.guarded),old=await native.getStartOperation(input.operationId);
  if(old){if(old.requestFingerprint!==requestFingerprint||old.accountDeviceId!==parseAccountCredential(input.credential).deviceId)fail('registration_operation_reused');const auth=new Headers(headers);auth.set('Authorization','Bearer '+input.credential);await authorize(auth);return{status:'registered',accountId:old.accountId,deviceId:old.accountDeviceId};}
  const accountId=crypto.randomUUID(),deviceId=parseAccountCredential(input.credential).deviceId;
  const joined={prepare:sql=>c.guarded.prepare(sql),async batch(ss){const out=await c.guarded.batch([...ss,c.guarded.prepare('INSERT INTO studio_document_enrollments VALUES(?,?,1,0)').bind(accountId,deviceId)]);return out.slice(0,ss.length);}};
  await createD1AccountRepository(joined).createAccountBackbone({accountId,accountDeviceId:deviceId,accountCredentialVerifier:verifier,recoveryVerifier,accountDeviceLabel:input.label,memberships:[],admissionProvenance:'production',startOperation:{operationId:input.operationId,requestFingerprint},now:Date.now()});return{status:'registered',accountId,deviceId};
 }
 async function deviceOperation(headers,input){const c=await authorize(headers,{admission:input?.kind==='register',securityDelete:input?.kind==='revoke-studio'});if(!exact(input,['operationId','kind','credential','deviceId'])||!UUID.test(input.operationId)||!['register','revoke-studio'].includes(input.kind))fail('device_request');
  const target=input.kind==='register'?parseAccountCredential(input.credential)?.deviceId:input.deviceId;if(!UUID.test(target||'')||(input.kind==='revoke-studio'&&input.credential!==null)||(input.kind==='register'&&input.deviceId!==null))fail('device_target');
  const rd=await hmacVerifier('studio-device-v1:'+canonical({binding:c.binding,input}),env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);
  const old=(await read(c,'SELECT * FROM studio_document_identity_operations WHERE account_id=? AND operation_id=?',c.binding.accountId,input.operationId))[0];if(old){const expected={type:'studio-device-v1',kind:input.kind,accountId:c.binding.accountId,deviceId:target,operationId:input.operationId};if(old.digest!==rd||old.result_json!==canonical(expected))fail('operation_reused');const current=(await read(c,'SELECT e.revoked,d.revoked_at FROM studio_document_enrollments e JOIN sync_account_devices d ON d.id=e.device_id AND d.account_id=e.account_id WHERE e.account_id=? AND e.device_id=?',c.binding.accountId,target))[0];return{...expected,historical:true,authorizesNewOperation:false,currentState:!current?'absent':current.revoked===1||current.revoked_at!==null?'revoked':'active'};}
  const result={type:'studio-device-v1',kind:input.kind,accountId:c.binding.accountId,deviceId:target,operationId:input.operationId},ss=[];
  if(input.kind==='register'){const verifier=await accountCredentialVerifier(input.credential,env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);ss.push(c.guarded.prepare('INSERT INTO sync_account_devices(id,account_id,credential_version,credential_verifier,created_at,last_seen_at) VALUES(?,?,1,?,?,?)').bind(target,c.binding.accountId,verifier,Date.now(),Date.now()),c.guarded.prepare('INSERT INTO studio_document_enrollments VALUES(?,?,?,0)').bind(c.binding.accountId,target,c.binding.generation));}
  else{if(target===c.binding.deviceId)fail('self_revoke_requires_separate_recovery_contract');ss.push(c.guarded.prepare('UPDATE studio_document_enrollments SET revoked=1 WHERE account_id=? AND device_id=?').bind(c.binding.accountId,target),c.guarded.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM studio_document_enrollments WHERE account_id=? AND device_id=? AND revoked=1) THEN 1 ELSE json_extract('device_missing','$.x') END").bind(c.binding.accountId,target));}
  ss.push(c.guarded.prepare('INSERT INTO studio_document_identity_operations VALUES(?,?,?,?)').bind(c.binding.accountId,input.operationId,rd,canonical(result)));await c.guarded.batch(ss);return result;
 }
 // Every read also runs the final authorization assertion in the same native batch.
 async function read(ctx,sql,...v){return(await ctx.guarded.batch([ctx.guarded.prepare(sql).bind(...v)]))[0].results;}
 async function pending(c,id){if(!UUID.test(id))fail('operation_id');const p=(await read(c,'SELECT * FROM studio_document_pending WHERE account_id=? AND operation_id=?',c.binding.accountId,id))[0];if(p){const b=JSON.parse(p.binding_json),m=JSON.parse(p.manifest_json);if(b.accountId!==p.account_id||b.deviceId!==p.device_id||b.generation!==p.generation||b.epoch!==p.epoch||p.request_digest!==await digest(canonical({binding:b,operationId:p.operation_id,documentId:p.document_id,expectedRevision:p.expected_revision,manifest:m})))fail('pending_corrupt');}return p;}
 function match(c,p){if(!p||p.device_id!==c.binding.deviceId||p.generation!==c.binding.generation||p.epoch!==c.binding.epoch||p.binding_json!==canonical(c.binding))fail('pending_binding');}
 async function begin(headers,input){const c=await authorize(headers);if(!exact(input,['operationId','documentId','expectedRevision','manifest'])||!UUID.test(input.operationId)||typeof input.documentId!=='string'||!input.documentId||input.documentId.length>200||!Number.isSafeInteger(input.expectedRevision)||(input.expectedRevision<0||input.expectedRevision>=Number.MAX_SAFE_INTEGER))fail('request');
  const m=input.manifest;if(!exact(m,['digest','bytes','chunks','deleted'])||!HEX.test(m.digest)||!Number.isSafeInteger(m.bytes)||m.bytes<0||m.bytes>3*8*1024*1024||!Array.isArray(m.chunks)||m.chunks.length>256||typeof m.deleted!=='boolean')fail('manifest');
  if(m.deleted&&(m.bytes!==0||m.chunks.length||m.digest!==await digest('')))fail('tombstone_manifest');
  if(!m.deleted&&(!m.chunks.length||m.chunks.some(x=>!exact(x,['digest','bytes'])||!HEX.test(x.digest)||!Number.isSafeInteger(x.bytes)||x.bytes<1||x.bytes>128*1024)||m.chunks.reduce((n,x)=>n+x.bytes,0)!==m.bytes))fail('chunks');
  await quota(c);const request=canonical({binding:c.binding,...input}),rd=await digest(request),old=await pending(c,input.operationId);
  if(old){match(c,old);if(old.request_digest!==rd)fail('operation_reused');return{status:'pending',operationId:input.operationId};}
  await c.guarded.batch([c.guarded.prepare('INSERT INTO studio_document_pending VALUES(?,?,?,?,?,?,?,?,?,?)').bind(c.binding.accountId,input.operationId,c.binding.deviceId,c.binding.generation,c.binding.epoch,input.documentId,input.expectedRevision,rd,canonical(m),canonical(c.binding)),]);
  return{status:'pending',operationId:input.operationId};
 }
 async function upload(headers,id,index,data){const c=await authorize(headers),p=await pending(c,id);match(c,p);const m=JSON.parse(p.manifest_json);if(!Number.isSafeInteger(index)||index<0||index>=m.chunks.length||typeof data!=='string'||utf8.encode(data).length!==m.chunks[index].bytes||await digest(data)!==m.chunks[index].digest)fail('chunk_invalid');
  const old=(await read(c,'SELECT * FROM studio_document_chunks WHERE account_id=? AND operation_id=? AND ordinal=?',c.binding.accountId,id,index))[0];if(old){if(old.data!==data)fail('chunk_collision');return{status:'staged'};}
  await c.guarded.batch([c.guarded.prepare('INSERT INTO studio_document_chunks VALUES(?,?,?,?,?,?)').bind(c.binding.accountId,id,index,data,m.chunks[index].digest,m.chunks[index].bytes)]);return{status:'staged'};
 }
 async function assembled(c,p){const m=JSON.parse(p.manifest_json),rows=await read(c,'SELECT * FROM studio_document_chunks WHERE account_id=? AND operation_id=? ORDER BY ordinal',c.binding.accountId,p.operation_id);if(rows.length!==m.chunks.length)fail('chunk_missing');
  for(let i=0;i<rows.length;i++)if(rows[i].ordinal!==i||rows[i].digest!==m.chunks[i].digest||rows[i].bytes!==m.chunks[i].bytes||utf8.encode(rows[i].data).length!==rows[i].bytes||await digest(rows[i].data)!==m.chunks[i].digest)fail('chunk_corrupt');
  const text=rows.map(x=>x.data).join('');if(utf8.encode(text).length!==m.bytes||await digest(text)!==m.digest)fail('manifest_digest');
  if(!m.deleted){const project=JSON.parse(text);if(project.schemaVersion!==2||project.projectId!==p.document_id||validateProject(project)?.ok!==true||canonical(project)!==text)fail('project_invalid');}
  return{m,text,rows};
 }
 function expectedReceipt(p){const b=JSON.parse(p.binding_json),m=JSON.parse(p.manifest_json);return{type:'studio-document-commit-v1',accountId:p.account_id,deviceId:p.device_id,epoch:p.epoch,generation:p.generation,documentId:p.document_id,operationId:p.operation_id,requestDigest:p.request_digest,documentDigest:m.digest,revision:p.expected_revision+1,deleted:m.deleted};}
 async function receipt(c,p){const r=(await read(c,'SELECT * FROM studio_document_receipts WHERE account_id=? AND operation_id=?',c.binding.accountId,p.operation_id))[0];if(!r)return null;
 const expected=expectedReceipt(p);if(r.binding_json!==p.request_digest||r.receipt_json!==canonical(expected))fail('receipt_binding');
 const change=(await read(c,'SELECT * FROM studio_document_changes WHERE user_id=? AND app_id=\'studio\' AND operation_id=?',p.account_id,p.operation_id))[0];
 if(!change||change.record_id!==p.document_id||change.record_type!=='project'||change.operation_hash!==p.request_digest||change.revision!==expected.revision||change.payload_hash!==expected.documentDigest||(change.deleted_at!==null)!==expected.deleted)fail('receipt_change_mismatch');return expected;}
 async function reconcile(headers,id,requestDigest=null){return reconcileCurrent(await authorize(headers),id,requestDigest);}
 async function reconcileCurrent(c,id,requestDigest=null){const p=await pending(c,id);if(!p){if(!HEX.test(requestDigest||''))fail('pending_binding');return{status:'absent',operationId:id,accountId:c.binding.accountId,requestDigest};}if(requestDigest!==null&&p.request_digest!==requestDigest)fail('operation_digest_mismatch');const r=await receipt(c,p);if(r)return{...r,historical:true,authorizesNewOperation:false};return{status:p.binding_json===canonical(c.binding)?'pending':'pending-recovery-required',operationId:id};}
 async function commit(headers,id){const c=await authorize(headers),p=await pending(c,id);match(c,p);const adopted=(await read(c,'SELECT operation_id FROM studio_document_owner_events WHERE account_id=? AND source_operation_id=?',c.binding.accountId,id))[0];if(adopted)fail('operation_adopted');const prior=await reconcileCurrent(c,id);if(prior.status!=='pending')return prior;
  const current=(await read(c,'SELECT revision,deleted_at FROM studio_document_records WHERE user_id=? AND record_id=?',p.account_id,p.document_id))[0];if((current?.revision||0)!==p.expected_revision)return{status:'conflict',operationId:id,pendingPreserved:true};if(current?.deleted_at!=null)fail('document_deleted');
  const {m,rows}=await assembled(c,p);const specs=new WeakMap();
  const version={operationId:id,digest:m.digest,bytes:m.bytes,chunks:m.chunks};
  const receipt={type:'studio-document-commit-v1',accountId:c.binding.accountId,deviceId:c.binding.deviceId,epoch:p.epoch,generation:p.generation,documentId:p.document_id,operationId:id,requestDigest:p.request_digest,documentDigest:m.digest,revision:p.expected_revision+1,deleted:m.deleted};
  function wrap(sql,params=[]){
   const mapped=sql.replace(/\bsync_(records|changes|datasets|users|devices)\b/g,n=>names[n]);
   const obj={bind(...v){return wrap(sql,v);},async first(){return(await read(c,mapped,...params))[0]||null;},async all(){return{results:await read(c,mapped,...params)};}};
   specs.set(obj,{sql:mapped,params});return obj;
  }
  const engineDb={prepare:sql=>wrap(sql),async batch(ss){
   const stmt=(sql,...v)=>c.guarded.prepare(sql).bind(...v);
   const guard=(sql,...v)=>stmt(`SELECT CASE WHEN (${sql}) THEN 1 ELSE json_extract('studio-fence','$.x') END`,...v);
   const checks=[guard('NOT EXISTS(SELECT 1 FROM studio_document_owner_events WHERE account_id=? AND source_operation_id=?)',p.account_id,id),guard('EXISTS(SELECT 1 FROM studio_document_pending WHERE account_id=? AND operation_id=? AND request_digest=? AND binding_json=? AND manifest_json=?)',p.account_id,id,p.request_digest,p.binding_json,p.manifest_json),guard('COALESCE((SELECT revision FROM studio_document_records WHERE user_id=? AND app_id=\'studio\' AND record_type=\'project\' AND record_id=?),0)=?',p.account_id,p.document_id,p.expected_revision),guard('NOT EXISTS(SELECT 1 FROM studio_document_records WHERE user_id=? AND record_id=? AND deleted_at IS NOT NULL)',p.account_id,p.document_id),guard('(SELECT count(*) FROM studio_document_chunks WHERE account_id=? AND operation_id=?)=?',p.account_id,id,rows.length),...rows.map(r=>guard('EXISTS(SELECT 1 FROM studio_document_chunks WHERE account_id=? AND operation_id=? AND ordinal=? AND data=? AND digest=? AND bytes=?)',p.account_id,id,r.ordinal,r.data,r.digest,r.bytes))];
   const activity=[];
   function activityStatement(sql,values=[]){return{bind(...v){return activityStatement(sql,v);},async run(){activity.push(stmt(sql,...values));return{success:true,meta:{changes:0}};}};}
   // Reuse native activity SQL as a plan; the placeholder result never authorizes work.
   await touchAccountActivity({prepare:activityStatement},p.account_id,Date.now());checks.push(...activity);
   checks.push(stmt("INSERT OR IGNORE INTO studio_document_datasets(user_id,app_id,state,schema_version,updated_at) VALUES(?,'studio','ready',2,?)",p.account_id,Date.now()));
   const business=ss.map(s=>{const x=specs.get(s);if(!x)fail('foreign_statement');return stmt(x.sql,...x.params);});
   const post=[guard('EXISTS(SELECT 1 FROM studio_document_records WHERE user_id=? AND record_id=? AND last_operation_id=? AND revision=?)',p.account_id,p.document_id,id,receipt.revision),stmt('INSERT INTO studio_document_receipts VALUES(?,?,?,?)',p.account_id,id,p.request_digest,canonical(receipt))];
   const results=await c.guarded.batch([...checks,...business,...post]);return results.slice(checks.length,checks.length+business.length);
  }};
  const outcome=await createD1SyncRepository(engineDb).applyOperation(c.identity,{operationId:id,recordType:'project',recordId:p.document_id,baseRevision:p.expected_revision,schemaVersion:2,deleted:m.deleted,payload:version,payloadHash:m.digest,operationHash:p.request_digest});
  if(outcome.status==='conflict')return{status:'conflict',operationId:id,pendingPreserved:true};
  if(!['applied','duplicate'].includes(outcome.status))fail('save_'+outcome.status);
  const resolved=await reconcileCurrent(c,id);if(resolved.status==='pending')fail('unknown_commit');return resolved;
 }
 async function snapshot(headers,documentId){const c=await authorize(headers);const head=(await read(c,"SELECT * FROM studio_document_records WHERE user_id=? AND app_id='studio' AND record_type='project' AND record_id=?",c.binding.accountId,documentId))[0];if(!head)return{status:'absent'};
 const p=await pending(c,head.last_operation_id);if(!p||p.document_id!==documentId)fail('head_corrupt');const r=await receipt(c,p);if(!r||r.revision!==head.revision||r.documentDigest!==head.payload_hash||r.deleted!==(head.deleted_at!==null))fail('head_receipt');
 if(r.deleted)return{status:'deleted',revision:head.revision};const full=await assembled(c,p);const pointer={operationId:p.operation_id,digest:full.m.digest,bytes:full.m.bytes,chunks:full.m.chunks};if(canonical(JSON.parse(head.payload_json))!==canonical(pointer))fail('head_digest');return{status:'ready',revision:head.revision,project:JSON.parse(full.text)};
 }



 async function identityHistory(headers,input){if(!exact(input,['kind','operationId','targetDeviceId'])||!['registration','device'].includes(input.kind)||!UUID.test(input.operationId)||!UUID.test(input.targetDeviceId))fail('identity-history-request');const c=await authorize(headers);let operation;
  if(input.kind==='registration'){const row=await createD1AccountRepository(c.guarded).getStartOperation(input.operationId);if(!row||row.accountId!==c.binding.accountId||row.accountDeviceId!==input.targetDeviceId)fail('identity-history-absent');operation='registered';}
  else{const row=(await read(c,'SELECT result_json FROM studio_document_identity_operations WHERE account_id=? AND operation_id=?',c.binding.accountId,input.operationId))[0];if(!row)fail('identity-history-absent');const result=JSON.parse(row.result_json);if(result.type!=='studio-device-v1'||result.accountId!==c.binding.accountId||result.deviceId!==input.targetDeviceId||result.operationId!==input.operationId||!['register','revoke-studio'].includes(result.kind))fail('identity-history-mismatch');operation=result.kind;}
  const target=(await read(c,'SELECT e.revoked,d.revoked_at FROM studio_document_enrollments e JOIN sync_account_devices d ON d.id=e.device_id AND d.account_id=e.account_id WHERE e.account_id=? AND e.device_id=?',c.binding.accountId,input.targetDeviceId))[0];return{type:'studio-identity-history-v1',kind:input.kind,operationId:input.operationId,targetDeviceId:input.targetDeviceId,accountId:c.binding.accountId,operation,currentState:!target?'absent':target.revoked===1||target.revoked_at!==null?'revoked':'active',historical:true,authorizesNewOperation:false};
 }
 async function sessionInfo(headers,input){if(!cap)fail('capacity-policy-required');if(!exact(input,['publicKey']))fail('session-key');const c=await authorize(headers),p=(await read(c,'SELECT device_public_key,lease_expires_at FROM pro_credentials WHERE id=?',c.binding.proId))[0];if(!p?.device_public_key||p.device_public_key!==canonicalDeviceKey(input.publicKey)||!Number.isSafeInteger(p.lease_expires_at)||p.lease_expires_at<=Date.now())fail('bound-pro-required');return{type:'studio-owner-session-v1',binding:c.binding,serverTime:Date.now(),validUntil:p.lease_expires_at,capacity:cap};}
 async function recoveryProof(c,proofId){
  if(!UUID.test(proofId||''))fail('recovery-proof-required');
  const native=(await read(c,`SELECT o.operation_id,o.request_fingerprint,o.result_json,r.expected_account_generation,r.expected_recovery_version,r.next_account_device_id FROM sync_account_lifecycle_operations o JOIN sync_account_recovery_claims r ON r.commit_operation_id=o.operation_id WHERE o.operation_id=? AND o.kind='recovery' AND o.account_id=? AND o.target_id=? AND r.account_id=o.account_id AND r.committed_at IS NOT NULL AND r.cancelled_at IS NULL`,proofId,c.binding.accountId,c.binding.deviceId))[0];
  let proof=native;
  if(!proof&&release){const r=(await read(c,'SELECT * FROM studio_document_recovery_proofs WHERE account_id=? AND operation_id=?',c.binding.accountId,proofId))[0];if(r){const expected={accountId:r.account_id,operationId:r.operation_id,deviceId:r.device_id,generation:r.generation,recoveryVersion:r.recovery_version,fingerprint:r.request_fingerprint,result:r.result_json};if(r.proof_hash!==await digest(canonical(expected)))fail('retained-proof-corrupt');proof={operation_id:r.operation_id,request_fingerprint:r.request_fingerprint,result_json:r.result_json,expected_account_generation:r.generation-1,expected_recovery_version:r.recovery_version-1,next_account_device_id:r.device_id,retained:true,proof_hash:r.proof_hash};}}
  if(!proof||proof.expected_account_generation+1!==c.binding.generation||proof.expected_recovery_version+1!==c.binding.recoveryVersion||proof.next_account_device_id!==c.binding.deviceId)fail('recovery-proof-invalid');
  const result=JSON.parse(proof.result_json);if(result.accountId!==c.binding.accountId||result.accountDeviceId!==c.binding.deviceId||result.recoveryVersion!==c.binding.recoveryVersion)fail('recovery-proof-invalid');
  proof.proof_hash=await digest(canonical({accountId:c.binding.accountId,operationId:proof.operation_id,deviceId:c.binding.deviceId,generation:c.binding.generation,recoveryVersion:c.binding.recoveryVersion,fingerprint:proof.request_fingerprint,result:proof.result_json}));return proof;
 }
 function proofStatement(c,proof){
  if(proof.retained)return c.guarded.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM studio_document_recovery_proofs WHERE account_id=? AND operation_id=? AND device_id=? AND generation=? AND recovery_version=? AND proof_hash=? AND result_json=?) THEN 1 ELSE json_extract('retained_proof','$.abort') END`).bind(c.binding.accountId,proof.operation_id,c.binding.deviceId,c.binding.generation,c.binding.recoveryVersion,proof.proof_hash,proof.result_json);
  return c.guarded.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM sync_account_lifecycle_operations o JOIN sync_account_recovery_claims r ON r.commit_operation_id=o.operation_id WHERE o.operation_id=? AND o.account_id=? AND o.target_id=? AND o.kind='recovery' AND o.request_fingerprint=? AND o.result_json=? AND r.account_id=o.account_id AND r.next_account_device_id=o.target_id AND r.committed_at IS NOT NULL AND r.cancelled_at IS NULL AND r.expected_account_generation+1=? AND r.expected_recovery_version+1=?) THEN 1 ELSE json_extract('proof','$.abort') END`).bind(proof.operation_id,c.binding.accountId,c.binding.deviceId,proof.request_fingerprint,proof.result_json,c.binding.generation,c.binding.recoveryVersion);
 }
 function proofStatements(c,proof){const ss=[proofStatement(c,proof)];if(release&&!proof.retained)ss.push(c.guarded.prepare('INSERT INTO studio_document_recovery_proofs VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(account_id,operation_id) DO NOTHING').bind(c.binding.accountId,proof.operation_id,c.binding.deviceId,c.binding.generation,c.binding.recoveryVersion,proof.request_fingerprint,proof.result_json,proof.proof_hash),c.guarded.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM studio_document_recovery_proofs WHERE account_id=? AND operation_id=? AND proof_hash=?) THEN 1 ELSE json_extract('proof_collision','$.abort') END").bind(c.binding.accountId,proof.operation_id,proof.proof_hash));return ss;}

 async function recoverEnrollment(headers,input){if(!exact(input,['proofOperationId']))fail('recovery-request');const c=await authorize(headers,{enrollment:true}),proof=await recoveryProof(c,input.proofOperationId);await c.guarded.batch([...proofStatements(c,proof),c.guarded.prepare('INSERT INTO studio_document_enrollments VALUES(?,?,?,0) ON CONFLICT(account_id,device_id) DO UPDATE SET generation=excluded.generation WHERE revoked=0').bind(c.binding.accountId,c.binding.deviceId,c.binding.generation),c.guarded.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM studio_document_enrollments WHERE account_id=? AND device_id=? AND generation=? AND revoked=0) THEN 1 ELSE json_extract('enroll','$.abort') END").bind(c.binding.accountId,c.binding.deviceId,c.binding.generation)]);return{status:'enrolled',generation:c.binding.generation,proofOperationId:proof.operation_id};}

 async function eventReceipt(c,event){const source=await pending(c,event.source_operation_id),next=await pending(c,event.operation_id);if(!source||!next)fail('adoption-history-missing');const saved=JSON.parse(event.receipt_json),binding=JSON.parse(event.binding_json),request={operationId:next.operation_id,documentId:next.document_id,expectedRevision:next.expected_revision,manifest:JSON.parse(next.manifest_json)};
  const expected={type:'studio-pending-adoption-v1',accountId:c.binding.accountId,operationId:next.operation_id,sourceOperationId:source.operation_id,sourceDigest:source.request_digest,documentId:source.document_id,binding,requestDigest:next.request_digest,request,proofOperationId:saved.proofOperationId};
  const input={operationId:next.operation_id,sourceOperationId:source.operation_id,sourceDigest:source.request_digest,documentId:source.document_id,proofOperationId:saved.proofOperationId};
  if(canonical(saved)!==canonical(expected)||event.source_digest!==source.request_digest||next.binding_json!==event.binding_json||source.document_id!==next.document_id||source.manifest_json!==next.manifest_json||source.expected_revision!==next.expected_revision||event.request_digest!==await digest(canonical({binding,input})))fail('adoption-history-corrupt');return expected;
 }
 async function adoptionHistory(headers,input){if(!exact(input,['operationId'])||!UUID.test(input.operationId))fail('adoption-history-request');const c=await authorize(headers),event=(await read(c,'SELECT * FROM studio_document_owner_events WHERE account_id=? AND operation_id=?',c.binding.accountId,input.operationId))[0];if(!event)fail('adoption-history-absent');return{status:'historical-adoption',receipt:{...await eventReceipt(c,event),historical:true},authorizesNewOperation:false};}
 async function adopt(headers,input){
  if(!exact(input,['operationId','sourceOperationId','sourceDigest','documentId','proofOperationId'])||!UUID.test(input.operationId)||!UUID.test(input.sourceOperationId)||input.operationId===input.sourceOperationId||!HEX.test(input.sourceDigest))fail('adoption-request');
  const c=await authorize(headers),p=await pending(c,input.sourceOperationId);if(!p||p.document_id!==input.documentId||p.request_digest!==input.sourceDigest)fail('adoption-source');
  const oldBinding=JSON.parse(p.binding_json),sameDevice=['accountId','deviceId','generation','recoveryVersion','credentialVersion'].every(k=>oldBinding[k]===c.binding[k]);
  const proof=sameDevice&&input.proofOperationId===null?null:await recoveryProof(c,input.proofOperationId);
  const rd=await digest(canonical({binding:c.binding,input})),old=(await read(c,'SELECT * FROM studio_document_owner_events WHERE account_id=? AND operation_id=?',c.binding.accountId,input.operationId))[0];
  if(old){if(old.request_digest!==rd||old.binding_json!==canonical(c.binding))fail('adoption-operation-reused');return{...await eventReceipt(c,old),historical:true};}
  const successful=await receipt(c,p);if(successful)return{status:'source-committed',receipt:{...successful,historical:true,authorizesNewOperation:false},authorizesNewOperation:false};
  if((await read(c,'SELECT operation_id FROM studio_document_owner_events WHERE account_id=? AND source_operation_id=?',c.binding.accountId,input.sourceOperationId)).length)fail('source-already-adopted');
  const request={operationId:input.operationId,documentId:p.document_id,expectedRevision:p.expected_revision,manifest:JSON.parse(p.manifest_json)},newDigest=await digest(canonical({binding:c.binding,...request}));
  const typed={type:'studio-pending-adoption-v1',accountId:c.binding.accountId,operationId:input.operationId,sourceOperationId:p.operation_id,sourceDigest:p.request_digest,documentId:p.document_id,binding:c.binding,requestDigest:newDigest,request,proofOperationId:proof?.operation_id??null};
  const guard=c.guarded.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM studio_document_receipts WHERE account_id=? AND operation_id=?) AND EXISTS(SELECT 1 FROM studio_document_pending WHERE account_id=? AND operation_id=? AND request_digest=?) THEN 1 ELSE json_extract('source-race','$.abort') END`).bind(c.binding.accountId,p.operation_id,c.binding.accountId,p.operation_id,p.request_digest);
  await c.guarded.batch([...(proof?proofStatements(c,proof):[]),guard,c.guarded.prepare('INSERT INTO studio_document_pending VALUES(?,?,?,?,?,?,?,?,?,?)').bind(c.binding.accountId,input.operationId,c.binding.deviceId,c.binding.generation,c.binding.epoch,p.document_id,p.expected_revision,newDigest,p.manifest_json,canonical(c.binding)),c.guarded.prepare('INSERT INTO studio_document_chunks SELECT account_id,?,ordinal,data,digest,bytes FROM studio_document_chunks WHERE account_id=? AND operation_id=?').bind(input.operationId,c.binding.accountId,p.operation_id),c.guarded.prepare('INSERT INTO studio_document_owner_events VALUES(?,?,?,?,?,?,?)').bind(c.binding.accountId,input.operationId,p.operation_id,p.request_digest,rd,canonical(c.binding),canonical(typed))]);return{...typed,historical:false};
 }
 async function retention(headers){const c=await authorize(headers);const summary=(await read(c,`SELECT (SELECT count(*) FROM studio_document_pending WHERE account_id=?) pending,(SELECT count(*) FROM studio_document_receipts WHERE account_id=?) receipts,(SELECT count(*) FROM studio_document_records WHERE user_id=? AND deleted_at IS NOT NULL) tombstones,(SELECT COALESCE(sum(bytes),0) FROM studio_document_chunks WHERE account_id=?) bytes`,...Array(4).fill(c.binding.accountId)))[0];return{type:'studio-retention-inventory-v1',...summary,physicalPurge:'HOLD_POLICY_UNAPPROVED',retentionDeadline:null,capacity:cap};}
 async function fetchRequest(request){
  const origin=request.headers.get('Origin');const headers={'Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'};
  const respond=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(enabled!==true)return respond(423,{code:'studio_off'});
  if(!cap)return respond(423,{code:'capacity-policy-required'});
  if(!allowedOrigins.includes(origin))return respond(403,{code:'origin'});
  headers['Access-Control-Allow-Origin']=origin;
  if(request.method==='OPTIONS'){headers['Access-Control-Allow-Methods']='POST, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type, Authorization, X-Sound-Cruise-Pro-Authorization';return respond(200,{ok:true});}
  const rate=env.STUDIO_DOCUMENT_RATE_LIMITER;if(!rate?.limit||(await rate.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success!==true)return respond(429,{code:'studio_rate'});
  if(request.method!=='POST'||new URL(request.url).pathname!=='/isolated/studio/document'||new URL(request.url).search)return respond(404,{code:'route'});
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return respond(415,{code:'content_type'});
  let size=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true}),reader=request.body?.getReader();
  if(!reader)return respond(400,{code:'body'});
  try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>1024*1024){await reader.cancel();return respond(413,{code:'body_limit'});}text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();const body=JSON.parse(text);
   if(!exact(body,['kind','payload']))fail('envelope');let result;
   if(body.kind==='register'){if(!exact(body.payload,['input','turnstileToken'])||typeof body.payload.turnstileToken!=='string'||body.payload.turnstileToken.length>4096)fail('registration_payload');
    const limiter=env.STUDIO_REGISTRATION_RATE_LIMITER;if(!limiter?.limit||(await limiter.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success!==true)fail('registration_rate');
    if(!env.TURNSTILE_EXPECTED_HOSTNAME)fail('turnstile_hostname_required');const verified=await verifyEnrollment(body.payload.turnstileToken,env,{expectedAction:'studio_account_start'});if(verified?.ok!==true)fail('turnstile');result=await register(request.headers,body.payload.input);
   }else if(body.kind==='session'){result=await sessionInfo(request.headers,body.payload);}
   else if(body.kind==='recover-enrollment')result=await recoverEnrollment(request.headers,body.payload);
   else if(body.kind==='identity-history')result=await identityHistory(request.headers,body.payload);
   else if(body.kind==='adoption-history')result=await adoptionHistory(request.headers,body.payload);
   else if(body.kind==='adopt')result=await adopt(request.headers,body.payload);
   else if(body.kind==='retention'){if(!exact(body.payload,[]))fail('retention-payload');result=await retention(request.headers);}
   else if(body.kind==='purge')fail('retention-policy-unapproved');
   else if(body.kind==='enroll'){if(!exact(body.payload,[]))fail('enroll_payload');result=await enroll(request.headers);}
   else if(body.kind==='device')result=await deviceOperation(request.headers,body.payload);
   else if(body.kind==='begin')result=await begin(request.headers,body.payload);
   else if(body.kind==='upload'){if(!exact(body.payload,['operationId','index','data']))fail('upload_payload');result=await upload(request.headers,body.payload.operationId,body.payload.index,body.payload.data);}
   else if(body.kind==='commit'){if(!exact(body.payload,['operationId']))fail('operation_payload');result=await commit(request.headers,body.payload.operationId);}
   else if(body.kind==='reconcile'){if(!exact(body.payload,['operationId'])&&!exact(body.payload,['operationId','requestDigest']))fail('operation_payload');if(body.payload.requestDigest!==undefined&&!HEX.test(body.payload.requestDigest))fail('operation_digest');result=await reconcile(request.headers,body.payload.operationId,body.payload.requestDigest??null);}
   else if(body.kind==='snapshot'){if(!exact(body.payload,['documentId']))fail('snapshot_payload');result=await snapshot(request.headers,body.payload.documentId);}
   else fail('kind');if(body.kind!=='register'&&result.status!=='conflict'){const c=await authorize(request.headers,{meter:false});await touchAccountActivity(c.guarded,c.binding.accountId);}return respond(200,result);
  }catch(error){return respond(409,{status:'HOLD',code:typeof error.code==='string'?error.code:'unknown_result',retryAutomatically:false});}
 }
 async function active(fn,headers,...args){const result=await fn(headers,...args);if(result.status!=='conflict'){const c=await authorize(headers,{meter:false});await touchAccountActivity(c.guarded,c.binding.accountId);}return result;}
 return Object.freeze({identityHistory,adoptionHistory,session:sessionInfo,recoverEnrollment,adopt,retention,enroll:(...a)=>active(enroll,...a),register,deviceOperation:(...a)=>active(deviceOperation,...a),begin:(...a)=>active(begin,...a),upload:(...a)=>active(upload,...a),commit:(...a)=>active(commit,...a),reconcile:(...a)=>active(reconcile,...a),snapshot:(...a)=>active(snapshot,...a),fetch:fetchRequest});
}
export {canonical as studioCanonical,digest as studioDigest};


export {studioDocumentUpload};
