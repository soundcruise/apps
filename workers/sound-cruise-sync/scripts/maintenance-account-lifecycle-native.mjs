import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire}from'node:module';import{randomUUID}from'node:crypto';
import{createIsolatedMaintenanceOwnerHttp}from'../src/maintenance-owner-http.js';
import{createIsolatedMaintenanceBridgeV2,maintenanceDigest}from'../src/maintenance-bridge-v2.js';
import{MAINTENANCE_V2_DDL}from'../src/maintenance-v2-schema.js';
import{createAccountCredential,createAccountRecoveryCode,createAccountRecoveryClaim,accountCredentialVerifier,accountRecoveryCodeVerifier}from'../src/account-crypto.js';
import{createIdentityMaterial}from'../src/crypto.js';
const OUT=process.env.MAINTENANCE_LIFECYCLE_EVIDENCE_DIR,RUNTIME=process.env.MAINTENANCE_V2_RUNTIME_PACKAGE;if(!OUT||!RUNTIME)throw Error('Explicit local fixture paths required');
const RUN=fs.mkdtempSync(path.join(OUT,'lifecycle-native-'));
const{Miniflare,convertV4MiniflareOptions}=createRequire(RUNTIME)('miniflare');
const input=JSON.parse(fs.readFileSync(new URL('../test/fixtures/maintenance-v2-schema33.json',import.meta.url)));
const result={scope:'four actual Account lifecycle HTTP owners + native D1; no Production',tests:[],productionAccess:false};
const origin='https://fixture.invalid';const limit={async limit(){return{success:true};}};let mf,db,http,admin,env;const writer='account-pro-writer',security='account-pro-security';
const adminIdentity={ownerId:'fixture-admin',accountId:'fixture',membershipId:'fixture',deviceId:'fixture',datasetId:'maintenance',accountGeneration:1,membershipGeneration:1,credentialVersion:1,writerEpoch:1,proGeneration:1};
const adminOwner={id:'fixture-admin',async verify(r){return{allowed:true,identityDigest:await maintenanceDigest(r.identity),assertions:[{sql:'SELECT 1 AS ok',params:[]}]};},async verifyHandover(){return true;}};
function controlReq(kind,scope,epoch,extra={}){return{kind,scope,expectedEpoch:epoch,operationId:randomUUID(),identity:adminIdentity,...extra};}
async function openRuntime(){mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("isolated-only")}}',compatibilityDate:'2026-09-01',cf:false,d1Databases:{DB:'account-pro'},resourcePersistencePath:path.join(RUN,'state'),resourceTmpPath:path.join(RUN,'tmp'),outboundService:()=>{throw Error('external network forbidden');}}));db=await mf.getD1Database('DB');admin=createIsolatedMaintenanceBridgeV2({db,owner:adminOwner});}
async function activate(scope){await db.prepare("INSERT INTO sync_maintenance_v2_control(scope,contract_version,epoch,phase,updated_at) VALUES (?,2,1,'closed',1)").bind(scope).run();const stop=controlReq('stop',scope,1);await admin.stop(stop);
const proof=await maintenanceDigest('fixture-only exclusion proof');const evidence=Object.fromEntries(['oldIngressExcluded','oldVersionsExcluded','oldScheduledExcluded','externalWritersExcluded','oldInflightExcluded','partialResultsExcluded','newClaimsAbsent','unknownResultsAbsent'].map(k=>[k,proof]));
const hand=controlReq('handover',scope,2,{stopOperationId:stop.operationId,evidence:{...evidence,environment:'isolated',inventoryDigest:proof,sourceDigest:proof}});await admin.handover(hand);await admin.open(controlReq('open',scope,3,{handoverOperationId:hand.operationId}));}
function environment(){return{SYNC_DB:db,ACCOUNT_ALLOWED_ORIGINS:origin,ALLOWED_ORIGINS:origin,
 SYNC_ACCOUNT_CREDENTIAL_PEPPER:'synthetic-account-pepper-at-least-32-bytes',SYNC_ACCOUNT_RECOVERY_PEPPER:'synthetic-recovery-pepper-at-least-32-bytes',
 SYNC_CREDENTIAL_PEPPER:'synthetic-app-pepper-at-least-32-bytes',SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED:'true',SYNC_ACCOUNT_PUBLIC_APP_IDS:'pitch,port',
 PRO_CREDENTIAL_PEPPER:'synthetic-pro-pepper-at-least-32-bytes',PRO_LOCKOUT_PEPPER:'synthetic-lockout-pepper-at-least-32-bytes',PRO_PASSCODE_SLOT_A:'4826',
 ACCOUNT_START_RATE_LIMITER:limit,ACCOUNT_RECOVERY_RATE_LIMITER:limit,SYNC_RATE_LIMITER:limit,PRO_VERIFY_RATE_LIMITER:limit,
 TURNSTILE_PRODUCTION_SECRET_KEY:'synthetic-only-key'};}
const dependencies={async verifyTurnstileToken(){return{ok:true};},async verifyProTurnstile(){return{ok:true};}};
const makeHttp=(binding=db)=>createIsolatedMaintenanceOwnerHttp({db:binding,env,writerScope:writer,securityScope:security,dependencies});
function request(route,body=null,{id=body?.operationId||randomUUID(),credential,method=body===null?'GET':'POST',originValue=origin}={}){
 const headers={Origin:originValue,'CF-Connecting-IP':'192.0.2.9','X-Maintenance-Operation-Id':id};if(body!==null)headers['Content-Type']='application/json';if(credential)headers.Authorization='Bearer '+credential;
 return new Request('https://owner.fixture.invalid'+route,{method,headers,...(body!==null?{body:JSON.stringify(body)}:{})});
}
async function json(response){return response.json();}
async function test(name,fn){try{await fn();result.tests.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){result.tests.push({name,status:'FAIL',error:String(e.stack||e)});throw e;}}
async function count(table){return(await db.prepare('SELECT COUNT(*) n FROM '+table).first()).n;}
async function start(){const account=createAccountCredential(),recovery=createAccountRecoveryCode();const body={operationId:randomUUID(),appIds:['pitch'],accountCredential:account.credential,recoveryCode:recovery,turnstileToken:'synthetic-turnstile',deviceLabel:'Fixture PC'};const req=request('/v2/accounts/start',body),response=await http.fetch(req);return{account,recovery,body,request:req,response,payload:await response.json()};}

// Test-only native binding decorator. No SQL parameters or credentials are logged.
function instrument(binding,hooks){
 const statements=new WeakMap();
 function wrap(sql,native,values=[]){const s={bind(...v){return wrap(sql,native.bind(...v),v);},run:()=>native.run(),all:()=>native.all(),async first(c){if(hooks.beforeRead)await hooks.beforeRead(sql);return c===undefined?native.first():native.first(c);}};statements.set(s,{sql,native,values});return s;}
 return {prepare(sql){return wrap(sql,binding.prepare(sql));},withSession(bookmark){return instrument(binding.withSession?binding.withSession(bookmark):binding,hooks);},getBookmark(){return binding.getBookmark?.();},
 async batch(items){const entries=items.map(s=>statements.get(s));if(entries.some(x=>!x))throw Error('test instrumentation statement mismatch');const match=hooks.matches(entries.map(x=>x.sql));
 if(match&&hooks.before)await hooks.before();const result=await binding.batch(entries.map(x=>match&&hooks.zeroSQL?.test(x.sql)?binding.prepare(x.sql.replace(/WHERE\b/,'WHERE 0 AND')).bind(...x.values):x.native));if(match&&hooks.loseAck){hooks.loseAck=false;throw Error('synthetic business ACK loss');}return result;}
 };
}
function startBody(){return{operationId:randomUUID(),appIds:['pitch'],accountCredential:createAccountCredential().credential,recoveryCode:createAccountRecoveryCode(),turnstileToken:'synthetic',deviceLabel:'Isolated PC'};}
async function registered(id){return db.prepare("SELECT operation_id FROM sync_maintenance_v2_operations WHERE phase='registered' AND json_extract(binding_json,'$.invocationId')=? AND operation_id<>?").bind(id,id).first();}
const rotationPrepare='/v2/accounts/recovery-rotation/prepare',rotationCommit='/v2/accounts/recovery-rotation/commit',envDetach='/v2/accounts/environments/current/detach',appDetach='/v2/accounts/apps/current/detach';
async function seedAccount(){
 const credential=createAccountCredential(),recovery=createAccountRecoveryCode(),id=randomUUID();
 const verifier=await accountCredentialVerifier(credential.credential,env.SYNC_ACCOUNT_CREDENTIAL_PEPPER),rv=await accountRecoveryCodeVerifier(recovery,env.SYNC_ACCOUNT_RECOVERY_PEPPER);
 await db.batch([db.prepare("INSERT INTO sync_accounts(id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,recovery_created_at,recovery_rotated_at,admission_provenance)VALUES(?,'active',1,?,1,1,1,1,1,'production')").bind(id,rv),db.prepare('INSERT INTO sync_account_devices(id,account_id,credential_version,credential_verifier,label,created_at,last_seen_at)VALUES(?,?,1,?,?,1,1)').bind(credential.deviceId,id,verifier,'synthetic PC')]);return{id,credential:credential.credential,deviceId:credential.deviceId,recovery};
}
async function seedDevice(account){const c=createAccountCredential(),v=await accountCredentialVerifier(c.credential,env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);await db.prepare('INSERT INTO sync_account_devices(id,account_id,credential_version,credential_verifier,label,created_at,last_seen_at)VALUES(?,?,1,?,?,1,1)').bind(c.deviceId,account.id,v,'other PC').run();return{...account,credential:c.credential,deviceId:c.deviceId};}
async function seedApp(account,appId='pitch',issuer=null){
 const cd=await seedDevice(account),material=await createIdentityMaterial(env.SYNC_CREDENTIAL_PEPPER);let m=await db.prepare('SELECT id,sync_user_id FROM sync_account_memberships WHERE account_id=? AND app_id=?').bind(account.id,appId).first();
 if(!m){m={id:randomUUID(),sync_user_id:material.userId};await db.batch([db.prepare("INSERT INTO sync_users(id,state,recovery_version,recovery_verifier,created_at,updated_at)VALUES(?,'active',1,?,1,1)").bind(m.sync_user_id,await maintenanceDigest(randomUUID())),db.prepare("INSERT INTO sync_account_memberships(id,account_id,app_id,state,sync_user_id,recovery_mode,generation,created_at,activated_at,updated_at)VALUES(?,?,?,'active',?,'account',1,1,1,1)").bind(m.id,account.id,appId,m.sync_user_id)]);}
 await db.batch([db.prepare('INSERT INTO sync_devices(id,user_id,app_id,credential_version,credential_verifier,label,last_cursor,created_at,last_seen_at,paired_at)VALUES(?,?,?,1,?,?,0,1,1,1)').bind(material.deviceId,m.sync_user_id,appId,material.credentialVerifier,'synthetic app'),db.prepare('INSERT INTO sync_membership_device_links(account_id,membership_id,app_device_id,account_device_id,linked_at)VALUES(?,?,?,?,1)').bind(account.id,m.id,material.deviceId,cd.deviceId)]);
 if(issuer)await db.prepare("INSERT INTO sync_app_join_invitations(invitation_id,code_verifier,account_id,membership_id,target_app_id,admission_provenance,created_by_account_device_id,claimed_by_app_device_id,claimed_by_account_device_id,created_at,expires_at,consumed_at,issue_operation_id,issue_fingerprint,consume_operation_id,consume_fingerprint,consume_mode)VALUES(?,?,?,?,?,'production',?,?,?,1,10000,2,?,?,?,?,'new_app')").bind(randomUUID(),await maintenanceDigest(randomUUID()),account.id,m.id,appId,issuer,material.deviceId,cd.deviceId,randomUUID(),'c'.repeat(64),randomUUID(),'d'.repeat(64)).run();
 return{account,cd,appId,membershipId:m.id,deviceId:material.deviceId,credential:material.credential};
}
function appRequest(body,credential){const req=request(appDetach,body);if(credential)req.headers.set('X-Sound-Cruise-App-Authorization','Bearer '+credential);return req;}
async function rotation(account){const claim=createAccountRecoveryClaim(),nextRecovery=createAccountRecoveryCode(),body={operationId:randomUUID(),claimToken:claim.claimToken,nextRecoveryCode:nextRecovery,turnstileToken:'synthetic'};const req=request(rotationPrepare,body,{credential:account.credential});const response=await http.fetch(req.clone());assert.equal(response.status,201);const commit={operationId:randomUUID(),claimToken:claim.claimToken};return{account,body,req,commit,commitReq:request(rotationCommit,commit,{credential:account.credential}),claim,nextRecovery};}
async function accountState(a){return db.prepare('SELECT state,generation,recovery_version,recovery_verifier FROM sync_accounts WHERE id=?').bind(a.id).first();}
async function deviceState(id){return db.prepare('SELECT credential_version,revoked_at FROM sync_account_devices WHERE id=?').bind(id).first();}
async function closePending(req,adapter=http){const id=req.headers.get('X-Maintenance-Operation-Id'),rows=(await db.prepare("SELECT operation_id FROM sync_maintenance_v2_operations WHERE json_extract(binding_json,'$.invocationId')=? AND phase='registered' ORDER BY operation_id").bind(id).all()).results;for(const row of rows)assert.equal((await adapter.resolvePending(req.clone(),{sourceOperationId:row.operation_id,resolutionOperationId:randomUUID()})).status,200);}
function pauseBusiness(pattern){let enter,release,once=true;const ready=new Promise(r=>enter=r),wait=new Promise(r=>release=r);return{ready,release:()=>release(),hooks:{matches:ss=>ss.some(s=>pattern.test(s)),before:async()=>{if(once){once=false;enter();await wait;}}}};}
let B,failed=false;
try{
 await openRuntime();for(const sql of input.base_sql)await db.prepare(sql).run();for(const x of input.journal)await db.prepare('INSERT INTO d1_migrations(id,name)VALUES(?,?)').bind(x.id,x.name).run();await db.batch(MAINTENANCE_V2_DDL.map(sql=>db.prepare(sql)));
 await db.prepare("INSERT INTO sync_account_runtime_control(singleton_id,rollout_mode,account_admission_enabled,membership_admission_enabled,account_read_enabled,account_recovery_enabled,account_delete_enabled,port_orchestration_enabled,generation,updated_at)VALUES(1,'open',1,1,1,1,1,1,1,1)").run();
 const now=Date.now();await db.prepare("INSERT INTO pro_auth_state(singleton_id,generation,active_code_slot,legacy_compat_enabled,updated_at,session_lifecycle_started_at,unbound_backend_until)VALUES(1,1,'A',1,?,?,?)").bind(now,now-1,now+86400000).run();
 await activate(writer);await activate(security);env=environment();http=makeHttp();B=await seedAccount();
 await test('Recovery Code rotation uses real HMAC owner and increments only recovery version',async()=>{
  const a=await seedAccount(),r=await rotation(a),before=await accountState(a);assert.equal((await http.fetch(r.commitReq.clone())).status,201);
  const after=await accountState(a);assert.equal(after.recovery_version,2);assert.equal(after.generation,before.generation);assert.notEqual(after.recovery_verifier,before.recovery_verifier);assert.deepEqual(await deviceState(a.deviceId),{credential_version:1,revoked_at:null});
  assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:a.credential}))).status,200);
  const next=createAccountCredential(),claim=createAccountRecoveryClaim(),prepare=code=>request('/v2/accounts/recovery/prepare',{operationId:randomUUID(),claimToken:claim.claimToken,accountCredential:next.credential,recoveryCode:code,nextRecoveryCode:createAccountRecoveryCode(),turnstileToken:'synthetic',deviceLabel:'recovery'});
  const claims=await count('sync_account_recovery_claims');assert.equal((await http.fetch(prepare(a.recovery))).status,503);assert.equal(await count('sync_account_recovery_claims'),claims);assert.equal((await http.fetch(prepare(r.nextRecovery))).status,201);
  const meta=await http.reconcile(r.commitReq.clone());assert.equal(meta.status,200);const text=await meta.text();assert(text.includes('recovery-code-rotated'));assert(!text.includes(a.credential));assert(!text.includes(r.nextRecovery));
 });
 await test('rotation claim cannot be committed by another Account or a substituted digest',async()=>{
  const a=await seedAccount(),r=await rotation(a);assert.equal((await http.fetch(request(rotationCommit,{...r.commit,operationId:randomUUID()},{credential:B.credential}))).status,403);
  const changed={...r.body,nextRecoveryCode:createAccountRecoveryCode()};assert.equal((await http.fetch(request(rotationPrepare,changed,{credential:a.credential}))).status,503);assert.equal((await http.reconcile(request(rotationPrepare,changed,{credential:a.credential}))).status,409);
  assert.equal((await accountState(a)).recovery_version,1);assert.equal((await http.fetch(r.commitReq.clone())).status,201);
 });
 await test('revoked requester cannot finish delayed rotation while normal B remains valid',async()=>{
  const a=await seedAccount(),r=await rotation(a),p=pauseBusiness(/^\s*UPDATE sync_accounts SET recovery_version/);const running=makeHttp(instrument(db,p.hooks)).fetch(r.commitReq.clone());await p.ready;
  assert.equal((await http.fetch(request('/v2/accounts/devices/revoke',{operationId:randomUUID(),accountDeviceId:a.deviceId},{credential:a.credential}))).status,200);p.release();assert.equal((await running).status,503);assert.equal((await accountState(a)).recovery_version,1);await closePending(r.commitReq);
  assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:B.credential}))).status,200);
 });
 await test('two prepared rotations race through final CAS without reviving the cancelled claim',async()=>{
  const a=await seedAccount(),r1=await rotation(a),r2=await rotation(a),p=pauseBusiness(/^\s*UPDATE sync_accounts SET recovery_version/);const running=makeHttp(instrument(db,p.hooks)).fetch(r2.commitReq.clone());await p.ready;
  assert.equal((await http.fetch(r1.commitReq.clone())).status,201);p.release();assert.equal((await running).status,503);const state=await accountState(a);assert.equal(state.recovery_version,2);assert.equal(state.recovery_verifier,await accountRecoveryCodeVerifier(r1.nextRecovery,env.SYNC_ACCOUNT_RECOVERY_PEPPER));await closePending(r2.commitReq);
 });
 await test('rotation ACK loss retains exact committed receipt and duplicate never repeats rotation',async()=>{
  const a=await seedAccount(),r=await rotation(a),hooks={matches:ss=>ss.some(s=>/^\s*UPDATE sync_accounts SET recovery_version/.test(s)),loseAck:true};assert.equal((await makeHttp(instrument(db,hooks)).fetch(r.commitReq.clone())).status,503);
  assert.equal((await accountState(a)).recovery_version,2);const meta=await http.reconcile(r.commitReq.clone());assert((await meta.text()).includes('recovery-code-rotated'));assert.equal((await http.fetch(r.commitReq.clone())).status,409);assert.equal((await accountState(a)).recovery_version,2);await closePending(r.commitReq);
 });
 await test('delayed Account A generation cannot corrupt normal B rotation or receipt',async()=>{
  const a=await seedAccount(),r=await rotation(a),normal=await rotation(B),p=pauseBusiness(/^\s*UPDATE sync_accounts SET recovery_version/);const running=makeHttp(instrument(db,p.hooks)).fetch(r.commitReq.clone());await p.ready;
  await db.prepare('UPDATE sync_accounts SET generation=generation+1 WHERE id=?').bind(a.id).run();assert.equal((await http.fetch(normal.commitReq.clone())).status,201);p.release();assert.equal((await running).status,503);assert.equal((await accountState(a)).recovery_version,1);assert.equal((await accountState(B)).recovery_version,2);const m=await http.reconcile(normal.commitReq.clone());assert((await m.text()).includes('recovery-code-rotated'));await closePending(r.commitReq);
 });
 await test('expired rotation at final SQL fence cannot produce a rotation receipt',async()=>{
  const a=await seedAccount(),r=await rotation(a),p=pauseBusiness(/^\s*UPDATE sync_accounts SET recovery_version/);const running=makeHttp(instrument(db,p.hooks)).fetch(r.commitReq.clone());await p.ready;
  await db.prepare('UPDATE sync_account_recovery_rotations SET created_at=0,expires_at=1 WHERE claim_id=?').bind(r.claim.claimId).run();p.release();assert.equal((await running).status,503);assert.equal((await accountState(a)).recovery_version,1);await closePending(r.commitReq);
 });
 await test('current environment detach revokes only its linked descendants and preserves other environments',async()=>{
  const a=await seedAccount(),other=await seedDevice(a),owned=await seedApp(a,'pitch',a.deviceId),unrelated=await seedApp(a,'chord',other.deviceId);
  const req=request(envDetach,{operationId:randomUUID()},{credential:a.credential}),r=await http.fetch(req.clone());assert.equal(r.status,200);const payload=await r.json();assert.equal(payload.scope,'current_environment');assert.equal(payload.revokedAccountDeviceCount,2);assert.equal(payload.revokedAppDeviceCount,1);
  for(const id of [a.deviceId,owned.cd.deviceId,owned.deviceId])assert.notEqual((await deviceStateAny(id)).revoked_at,null);
  for(const id of [other.deviceId,unrelated.cd.deviceId,unrelated.deviceId])assert.equal((await deviceStateAny(id)).revoked_at,null);
  assert.equal((await accountState(a)).generation,1);assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:a.credential}))).status,410);assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:other.credential}))).status,200);assert.equal((await http.reconcile(req.clone())).status,200);
 });
 await test('current app detach binds App HMAC credential and exact two-device scope',async()=>{
  const a=await seedAccount(),app=await seedApp(a),other=await seedApp(a,'chord');const req=appRequest({operationId:randomUUID()},app.credential),r=await http.fetch(req.clone());assert.equal(r.status,200);const body=await r.json();assert.equal(body.scope,'current_app_environment');assert.equal(body.appDeviceId,app.deviceId);assert.equal(body.accountDeviceId,app.cd.deviceId);
  assert.notEqual((await deviceState(app.cd.deviceId)).revoked_at,null);assert.notEqual((await deviceStateAny(app.deviceId)).revoked_at,null);assert.equal((await deviceStateAny(other.deviceId)).revoked_at,null);assert.equal((await deviceState(a.deviceId)).revoked_at,null);
  assert.equal((await http.fetch(appRequest({operationId:randomUUID()},app.credential))).status,410);assert.equal((await http.reconcile(req.clone())).status,200);
  const swapped=appRequest({operationId:req.headers.get('X-Maintenance-Operation-Id')},other.credential);assert.equal((await http.reconcile(swapped)).status,409);assert.equal((await http.reconcile(appRequest({operationId:req.headers.get('X-Maintenance-Operation-Id')}))).status,409);
 });
 await test('app detach rejects body target selection and malformed shared Account-device binding',async()=>{
  const a=await seedAccount(),app=await seedApp(a),other=await seedApp(a,'chord');assert.equal((await http.fetch(appRequest({operationId:randomUUID(),appDeviceId:other.deviceId},app.credential))).status,400);
  await db.prepare('UPDATE sync_membership_device_links SET account_device_id=? WHERE app_device_id=?').bind(app.cd.deviceId,other.deviceId).run();assert.equal((await http.fetch(appRequest({operationId:randomUUID()},app.credential))).status,409);assert.equal((await deviceState(app.cd.deviceId)).revoked_at,null);
 });
 await test('generation change before app detach commit rejects stale request and preserves normal B',async()=>{
  const a=await seedAccount(),app=await seedApp(a),req=appRequest({operationId:randomUUID()},app.credential),p=pauseBusiness(/INSERT INTO sync_account_lifecycle_operations/);const running=makeHttp(instrument(db,p.hooks)).fetch(req.clone());await p.ready;
  await db.prepare('UPDATE sync_account_memberships SET generation=generation+1 WHERE id=?').bind(app.membershipId).run();p.release();assert.equal((await running).status,503);assert.equal((await deviceStateAny(app.deviceId)).revoked_at,null);assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:B.credential}))).status,200);await closePending(req);
 });
 await test('late non-Port link fences current environment detach before any business update',async()=>{
  const a=await seedAccount(),req=request(envDetach,{operationId:randomUUID()},{credential:a.credential}),p=pauseBusiness(/INSERT INTO sync_account_lifecycle_operations/);const running=makeHttp(instrument(db,p.hooks)).fetch(req.clone());await p.ready;
  const app=await seedApp(a);await db.prepare('UPDATE sync_membership_device_links SET account_device_id=? WHERE app_device_id=?').bind(a.deviceId,app.deviceId).run();p.release();assert.equal((await running).status,503);assert.equal((await deviceState(a.deviceId)).revoked_at,null);await closePending(req);
 });
 await test('native zero-row app revoke fault rolls back Account revoke and creates no success receipt',async()=>{
  const a=await seedAccount(),app=await seedApp(a),req=appRequest({operationId:randomUUID()},app.credential),hooks={matches:ss=>ss.some(s=>/INSERT INTO sync_account_lifecycle_operations/.test(s)),zeroSQL:/^\s*UPDATE sync_devices SET revoked_at = \?/};
  assert.equal((await makeHttp(instrument(db,hooks)).fetch(req.clone())).status,503);assert.equal((await deviceStateAny(app.deviceId)).revoked_at,null);assert.equal((await deviceState(app.cd.deviceId)).revoked_at,null);
  assert.equal(await db.prepare('SELECT operation_id FROM sync_account_lifecycle_operations WHERE operation_id=?').bind(req.headers.get('X-Maintenance-Operation-Id')).first(),null);const meta=await http.reconcile(req.clone());assert(!(await meta.text()).includes('current-app-environment-detached'));await closePending(req);
 });
 await test('missing App relation rejects genuine but unlinked credential before any detach',async()=>{
  const a=await seedAccount(),app=await seedApp(a);await db.prepare('DELETE FROM sync_membership_device_links WHERE app_device_id=?').bind(app.deviceId).run();assert.equal((await http.fetch(appRequest({operationId:randomUUID()},app.credential))).status,401);assert.equal((await deviceStateAny(app.deviceId)).revoked_at,null);assert.equal((await deviceState(app.cd.deviceId)).revoked_at,null);
 });
 await test('malformed Port link cannot revoke a foreign Account or app device',async()=>{
  const a=await seedAccount(),port=await seedApp(a,'port'),foreign=await seedApp(B,'chord');
  await db.prepare('DELETE FROM sync_membership_device_links WHERE app_device_id=?').bind(foreign.deviceId).run();
  await db.prepare('UPDATE sync_membership_device_links SET app_device_id=?,account_device_id=? WHERE app_device_id=?').bind(foreign.deviceId,a.deviceId,port.deviceId).run();
  const req=request(envDetach,{operationId:randomUUID()},{credential:a.credential});assert.equal((await http.fetch(req.clone())).status,503);assert.equal((await deviceStateAny(foreign.deviceId)).revoked_at,null);assert.equal((await deviceState(a.deviceId)).revoked_at,null);await closePending(req);
 });
 await test('provenance change at final fence stops detach without changing normal B',async()=>{
  const a=await seedAccount(),req=request(envDetach,{operationId:randomUUID()},{credential:a.credential}),p=pauseBusiness(/INSERT INTO sync_account_lifecycle_operations/);const running=makeHttp(instrument(db,p.hooks)).fetch(req.clone());await p.ready;
  await db.prepare("UPDATE sync_accounts SET admission_provenance='qa' WHERE id=?").bind(a.id).run();p.release();assert.equal((await running).status,503);assert.equal((await deviceState(a.deviceId)).revoked_at,null);await db.prepare("UPDATE sync_accounts SET admission_provenance='production' WHERE id=?").bind(a.id).run();await closePending(req);assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:B.credential}))).status,200);
 });
 await test('detach ACK loss and concurrent UUID never repeat business mutation',async()=>{
  const a=await seedAccount(),app=await seedApp(a),body={operationId:randomUUID()},req=appRequest(body,app.credential),hooks={matches:ss=>ss.some(s=>/INSERT INTO sync_account_lifecycle_operations/.test(s)),loseAck:true};assert.equal((await makeHttp(instrument(db,hooks)).fetch(req.clone())).status,503);
  const meta=await http.reconcile(req.clone());assert.equal(meta.status,200);assert((await meta.text()).includes('current-app-environment-detached'));assert.equal((await http.fetch(req.clone())).status,409);await closePending(req);
  const b=await seedAccount(),request2=request(envDetach,{operationId:randomUUID()},{credential:b.credential}),responses=await Promise.all([http.fetch(request2.clone()),makeHttp().fetch(request2.clone())]);assert.equal(responses.filter(x=>x.status===200).length,1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_account_lifecycle_operations WHERE operation_id=?').bind(request2.headers.get('X-Maintenance-Operation-Id')).first()).n,1);
 });
 await test('interrupted lifecycle request reopens durable pending and explicit fence never replays it',async()=>{
  const a=await seedAccount(),r=await rotation(a),p=pauseBusiness(/^\s*UPDATE sync_accounts SET recovery_version/);const running=makeHttp(instrument(db,p.hooks)).fetch(r.commitReq.clone());await p.ready;await mf.dispose();p.release();assert.equal((await running).status,503);await openRuntime();env=environment();http=makeHttp();assert.equal((await accountState(a)).recovery_version,1);assert.equal((await http.reconcile(r.commitReq.clone())).status,200);assert.equal((await http.fetch(r.commitReq.clone())).status,409);await closePending(r.commitReq);
 });
 await test('writer stop preserves all four security lifecycle routes without granting writer capability',async()=>{
  await admin.stop(controlReq('stop',writer,4));const a=await seedAccount(),r=await rotation(a);assert.equal((await http.fetch(r.commitReq.clone())).status,201);const app=await seedApp(a);assert.equal((await http.fetch(appRequest({operationId:randomUUID()},app.credential))).status,200);assert.equal((await http.fetch(request(envDetach,{operationId:randomUUID()},{credential:a.credential}))).status,200);
  const n=await count('sync_accounts'),blocked=await start();assert.equal(blocked.response.status,423);assert.equal(await count('sync_accounts'),n);assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:B.credential}))).status,200);
 });
 if(process.env.MAINTENANCE_LIFECYCLE_BROWSER==='true'){
  const {runOwnerBrowser}=await import('./maintenance-owner-http-browser-fixture.mjs');const a=await seedAccount(),app=await seedApp(a),claim=createAccountRecoveryClaim();
  const lifecycleFixture={accountCredential:a.credential,appCredential:app.credential,prepare:{operationId:randomUUID(),claimToken:claim.claimToken,nextRecoveryCode:createAccountRecoveryCode(),turnstileToken:'synthetic'},commit:{operationId:randomUUID(),claimToken:claim.claimToken},detach:{operationId:randomUUID()}};
  await runOwnerBrowser({db,env,writerScope:writer,securityScope:security,dependencies,out:OUT,runtime:RUNTIME,bootstrapBody:startBody(),lifecycleFixture});
 }
}catch(e){failed=true;result.failure=String(e.stack||e);console.log('FAIL '+result.failure);}
finally{if(mf)await mf.dispose();result.summary={pass:result.tests.filter(x=>x.status==='PASS').length,fail:result.tests.filter(x=>x.status==='FAIL').length,skip:0};fs.writeFileSync(path.join(OUT,'LIFECYCLE-NATIVE-RESULT.json'),JSON.stringify(result,null,2)+'\n');}
if(failed)process.exitCode=1;
async function deviceStateAny(id){return await deviceState(id)||db.prepare('SELECT credential_version,revoked_at FROM sync_devices WHERE id=?').bind(id).first();}
