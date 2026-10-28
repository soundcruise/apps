import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire}from'node:module';import{randomUUID}from'node:crypto';
import{createIsolatedMaintenanceOwnerHttp}from'../src/maintenance-owner-http.js';
import{createIsolatedMaintenanceBridgeV2,maintenanceDigest}from'../src/maintenance-bridge-v2.js';
import{MAINTENANCE_V2_DDL}from'../src/maintenance-v2-schema.js';
import{createAccountCredential,createAccountRecoveryCode,createAccountRecoveryClaim,accountCredentialVerifier}from'../src/account-crypto.js';
import{createIdentityMaterial}from'../src/crypto.js';
const OUT=process.env.MAINTENANCE_OWNER_EVIDENCE_DIR,RUNTIME=process.env.MAINTENANCE_V2_RUNTIME_PACKAGE;if(!OUT||!RUNTIME)throw Error('Explicit local fixture paths required');
const RUN=fs.mkdtempSync(path.join(OUT,'owner-native-'));
const{Miniflare,convertV4MiniflareOptions}=createRequire(RUNTIME)('miniflare');
const input=JSON.parse(fs.readFileSync(new URL('../test/fixtures/maintenance-v2-schema33.json',import.meta.url)));
const result={scope:'real Account/Pro HTTP handlers + isolated owner profiles + native D1; no Production',tests:[],productionAccess:false};
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
 function wrap(sql,native){const s={bind(...v){return wrap(sql,native.bind(...v));},run:()=>native.run(),all:()=>native.all(),async first(c){if(hooks.beforeRead)await hooks.beforeRead(sql);return c===undefined?native.first():native.first(c);}};statements.set(s,{sql,native});return s;}
 return {prepare(sql){return wrap(sql,binding.prepare(sql));},withSession(bookmark){return instrument(binding.withSession?binding.withSession(bookmark):binding,hooks);},getBookmark(){return binding.getBookmark?.();},
 async batch(items){const entries=items.map(s=>statements.get(s));if(entries.some(x=>!x))throw Error('test instrumentation statement mismatch');const match=hooks.matches(entries.map(x=>x.sql));
 if(match&&hooks.before)await hooks.before();const result=await binding.batch(entries.map(x=>x.native));if(match&&hooks.loseAck){hooks.loseAck=false;throw Error('synthetic business ACK loss');}return result;}
 };
}
function startBody(){return{operationId:randomUUID(),appIds:['pitch'],accountCredential:createAccountCredential().credential,recoveryCode:createAccountRecoveryCode(),turnstileToken:'synthetic',deviceLabel:'Isolated PC'};}
async function registered(id){return db.prepare("SELECT operation_id FROM sync_maintenance_v2_operations WHERE phase='registered' AND json_extract(binding_json,'$.invocationId')=? AND operation_id<>?").bind(id,id).first();}
async function extraTests(){
 await test('stopping parent security scope fences delayed writer transaction',async()=>{
  const ws='parent-stop-writer',ss='parent-stop-security';await activate(ws);await activate(ss);
  const body=startBody(),req=request('/v2/accounts/start',body),n=await count('sync_accounts');let entered,release;const ready=new Promise(r=>entered=r),pause=new Promise(r=>release=r);
  const hooks={matches:q=>q.some(s=>/^\s*INSERT INTO sync_accounts\b/i.test(s)),before:async()=>{entered();await pause;}};
  const make=binding=>createIsolatedMaintenanceOwnerHttp({db:binding,env,writerScope:ws,securityScope:ss,dependencies});const own=make(db);
  const running=make(instrument(db,hooks)).fetch(req.clone());await ready;const child=await registered(body.operationId);await admin.stop(controlReq('stop',ss,4));release();assert.equal((await running).status,503);assert.equal(await count('sync_accounts'),n);
  for(const sourceOperationId of [body.operationId,child.operation_id])assert.equal((await own.resolvePending(req.clone(),{sourceOperationId,resolutionOperationId:randomUUID()})).status,200);
 });
 await test('same-time competing Pro keys cannot create a false renewal success receipt',async()=>{
  const r=await http.fetch(request('/v2/pro-auth/verify',{passcode:env.PRO_PASSCODE_SLOT_A,turnstileToken:'synthetic'}));assert.equal(r.status,201);const pro=await r.json(),now=Date.now()+100;
  const fixed={...dependencies,now:()=>now};const direct=createIsolatedMaintenanceOwnerHttp({db,env,writerScope:writer,securityScope:security,dependencies:fixed});
  const renew=[];
  for(let i=0;i<2;i++){
   const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),publicKey=await crypto.subtle.exportKey('jwk',key.publicKey);
   const challenge=await direct.fetch(request('/v2/pro-auth/device-session/challenge',{publicKey},{credential:pro.credential}));assert.equal(challenge.status,200);const c=await challenge.json();
   const signature=Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key.privateKey,new TextEncoder().encode(c.message))).toString('base64url');renew.push(request('/v2/pro-auth/device-session/renew',{publicKey,challenge:c.challenge,mac:c.mac,signature},{credential:pro.credential}));
  }
  let entered,release,waiting=0;const ready=new Promise(r=>entered=r),pause=new Promise(r=>release=r);const hooks={matches:q=>q.some(s=>/^\s*UPDATE pro_credentials SET device_public_key/i.test(s)),before:async()=>{if(++waiting===2)entered();await pause;}};
  const pending=renew.map(req=>createIsolatedMaintenanceOwnerHttp({db:instrument(db,hooks),env,writerScope:writer,securityScope:security,dependencies:fixed}).fetch(req.clone()));await ready;release();
  const statuses=(await Promise.all(pending)).map(r=>r.status);assert.equal(statuses.filter(s=>s===200).length,1);assert.equal(statuses.filter(s=>s===503).length,1);
  const credentialId=pro.credential.split('.')[1];assert.equal((await db.prepare('SELECT COUNT(*) n FROM pro_session_proofs WHERE credential_id=?').bind(credentialId).first()).n,1);
  const failedReq=renew[statuses.indexOf(503)],id=failedReq.headers.get('X-Maintenance-Operation-Id');const facts=await direct.reconcile(failedReq.clone());const text=await facts.text();assert(!text.includes('pro-device-session-renewed'));
  const child=await registered(id);for(const sourceOperationId of [id,child.operation_id])assert.equal((await direct.resolvePending(failedReq.clone(),{sourceOperationId,resolutionOperationId:randomUUID()})).status,200);
 });
 await test('zero-row Account revoke rolls back lifecycle receipt rather than proving success',async()=>{
  const target=createAccountCredential(),verifier=await accountCredentialVerifier(target.credential,env.SYNC_ACCOUNT_CREDENTIAL_PEPPER);
  await db.prepare('INSERT INTO sync_account_devices(id,account_id,credential_version,credential_verifier,label,created_at,last_seen_at)VALUES(?,?,1,?,?,1,1)').bind(target.deviceId,B.payload.accountId,verifier,'synthetic target').run();
  const body={operationId:randomUUID(),accountDeviceId:target.deviceId},req=request('/v2/accounts/devices/revoke',body,{credential:B.account.credential});let entered,release;const ready=new Promise(r=>entered=r),pause=new Promise(r=>release=r);
  const hooks={matches:q=>q.some(s=>/INSERT INTO sync_account_lifecycle_operations/.test(s)),before:async()=>{entered();await pause;}};
  const running=makeHttp(instrument(db,hooks)).fetch(req.clone());await ready;await db.prepare('DELETE FROM sync_account_devices WHERE id=?').bind(target.deviceId).run();release();assert.equal((await running).status,503);
  assert.equal(await db.prepare('SELECT operation_id FROM sync_account_lifecycle_operations WHERE operation_id=?').bind(body.operationId).first(),null);
  const facts=await http.reconcile(req.clone());assert(!(await facts.text()).includes('account-device-revoked'));const child=await registered(body.operationId);
  for(const sourceOperationId of [body.operationId,child.operation_id])assert.equal((await http.resolvePending(req.clone(),{sourceOperationId,resolutionOperationId:randomUUID()})).status,200);
  assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:B.account.credential}))).status,200);
 });
 await test('dormant Account activity reactivates through original insert-ignore then touch',async()=>{
  await db.prepare("UPDATE sync_account_activity SET state='dormant',dormant_at=1,inactive_purge_after=2 WHERE account_id=?").bind(B.payload.accountId).run();
  assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:B.account.credential}))).status,200);
  const activity=await db.prepare('SELECT state,dormant_at,inactive_purge_after FROM sync_account_activity WHERE account_id=?').bind(B.payload.accountId).first();assert.deepEqual(activity,{state:'active',dormant_at:null,inactive_purge_after:null});
 });
 await test('parent request remains pending and fencing it rejects delayed child commit',async()=>{
  const body=startBody(),req=request('/v2/accounts/start',body),n=await count('sync_accounts');let entered,release;const ready=new Promise(r=>entered=r),pause=new Promise(r=>release=r);let once=true;
  const hooks={matches:ss=>ss.some(s=>/^\s*INSERT INTO sync_accounts\b/i.test(s)),before:async()=>{if(once){once=false;entered();await pause;}}};
  const running=makeHttp(instrument(db,hooks)).fetch(req.clone());await Promise.race([ready,running.then(r=>{throw Error('parent barrier not reached '+r.status);})]);
  const root=await db.prepare('SELECT phase FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(body.operationId).first();assert.equal(root.phase,'registered');
  const child=await registered(body.operationId);assert(child);
  assert.equal((await http.resolvePending(req.clone(),{sourceOperationId:body.operationId,resolutionOperationId:randomUUID()})).status,200);
  release();assert.equal((await running).status,503);assert.equal(await count('sync_accounts'),n);
  assert.equal((await http.resolvePending(req.clone(),{sourceOperationId:child.operation_id,resolutionOperationId:randomUUID()})).status,200);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM sync_maintenance_v2_operations WHERE json_extract(binding_json,'$.invocationId')=? AND phase NOT IN('committed','resolved')").bind(body.operationId).first()).n,0);
 });
 await test('interrupted native Worker runtime reopens durable pending without replay',async()=>{
  const body=startBody(),req=request('/v2/accounts/start',body),n=await count('sync_accounts');let entered,release;const ready=new Promise(r=>entered=r),pause=new Promise(r=>release=r);let once=true;
  const hooks={matches:ss=>ss.some(s=>/^\s*INSERT INTO sync_accounts\b/i.test(s)),before:async()=>{if(once){once=false;entered();await pause;}}};
  const running=makeHttp(instrument(db,hooks)).fetch(req.clone());await ready;const child=await registered(body.operationId);assert(child);
  await mf.dispose();release();assert.equal((await running).status,503);
  await openRuntime();env=environment();http=makeHttp();
  assert.equal(await count('sync_accounts'),n);assert.equal((await http.reconcile(req.clone())).status,200);assert.equal((await http.fetch(req.clone())).status,409);
  for(const sourceOperationId of [body.operationId,child.operation_id])assert.equal((await http.resolvePending(req.clone(),{sourceOperationId,resolutionOperationId:randomUUID()})).status,200);
  assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:B.account.credential}))).status,200);
 });
 await test('cross-Account revoke cannot target normal B and missing identity stays rejected',async()=>{
  const r=await http.fetch(request('/v2/accounts/devices/revoke',{operationId:randomUUID(),accountDeviceId:B.account.deviceId},{credential:A.account.credential}));assert.equal(r.status,404);
  assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:B.account.credential}))).status,200);
  assert.equal((await http.fetch(request('/v2/accounts/summary'))).status,401);
  const bad=request('/v2/accounts/summary',null,{credential:B.account.credential});bad.headers.set('X-D1-Bookmark','x'.repeat(2049));assert.equal((await http.fetch(bad)).status,400);
 });
 await test('QA-only credential is HOLD before activity or canonical writes',async()=>{
  const before=(await db.prepare('SELECT last_seen_at FROM sync_account_devices WHERE id=?').bind(B.account.deviceId).first()).last_seen_at;
  await db.prepare("UPDATE sync_accounts SET admission_provenance='qa' WHERE id=?").bind(B.payload.accountId).run();
  assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:B.account.credential}))).status,503);
  assert.equal((await db.prepare('SELECT last_seen_at FROM sync_account_devices WHERE id=?').bind(B.account.deviceId).first()).last_seen_at,before);
  await db.prepare("UPDATE sync_accounts SET admission_provenance='production' WHERE id=?").bind(B.payload.accountId).run();
 });
 await test('admitted operation is explicitly fenced; delayed SQL cannot create Account',async()=>{
  const body=startBody(),req=request('/v2/accounts/start',body),n=await count('sync_accounts');let entered,release;const ready=new Promise(r=>entered=r),pause=new Promise(r=>release=r);let once=true;
  const hooks={matches:ss=>ss.some(s=>/^\s*INSERT INTO sync_accounts\b/i.test(s)),before:async()=>{if(once){once=false;entered();await pause;}}};
  const running=makeHttp(instrument(db,hooks)).fetch(req.clone());await Promise.race([ready,running.then(r=>{throw Error('barrier not reached; status '+r.status);})]);const source=await registered(body.operationId);assert(source);
  const resolutionOperationId=randomUUID();assert.equal((await http.resolvePending(req.clone(),{sourceOperationId:source.operation_id,resolutionOperationId})).status,200);
  assert.equal((await http.resolvePending(req.clone(),{sourceOperationId:source.operation_id,resolutionOperationId})).status,200);
  release();assert.equal((await running).status,503);assert.equal(await count('sync_accounts'),n);
  const meta=await http.reconcile(req.clone());assert.equal(meta.status,200);assert((await meta.text()).includes('no-protected-d1-commit-operation-fenced'));
 });
 await test('lost business ACK reconciles committed Account without token storage or reexecution',async()=>{
  const body=startBody(),req=request('/v2/accounts/start',body),n=await count('sync_accounts');
  const hooks={matches:ss=>ss.some(s=>/^\s*INSERT INTO sync_accounts\b/i.test(s)),loseAck:true};
  assert.equal((await makeHttp(instrument(db,hooks)).fetch(req.clone())).status,503);assert.equal(await count('sync_accounts'),n+1);
  const meta=await http.reconcile(req.clone());assert.equal(meta.status,200);const text=await meta.text();assert(text.includes('account-created'));assert(!text.includes(body.accountCredential));assert(!text.includes(body.recoveryCode));
  assert.equal((await http.fetch(req.clone())).status,409);assert.equal(await count('sync_accounts'),n+1);
 });
 await test('membership generation race aborts old device registration; fresh B continues',async()=>{
  const material=await createIdentityMaterial(env.SYNC_CREDENTIAL_PEPPER),body={operationId:randomUUID(),appDeviceCredential:material.credential,deviceLabel:'race'},req=request('/v2/accounts/port-device',body,{credential:B.account.credential});
  const before=await count('sync_devices');let entered,release;const ready=new Promise(r=>entered=r),pause=new Promise(r=>release=r);let once=true;
  const hooks={matches:ss=>ss.some(s=>/^\s*INSERT INTO sync_port_device_operations/i.test(s)),before:async()=>{if(once){once=false;entered();await pause;}}};
  const running=makeHttp(instrument(db,hooks)).fetch(req.clone());await Promise.race([ready,running.then(r=>{throw Error('barrier not reached; status '+r.status);})]);await db.prepare('UPDATE sync_account_memberships SET generation=generation+1 WHERE id=?').bind(port.membershipId).run();release();
  assert.equal((await running).status,503);assert.equal(await count('sync_devices'),before);const source=await registered(body.operationId);assert(source);
  assert.equal((await http.resolvePending(req.clone(),{sourceOperationId:source.operation_id,resolutionOperationId:randomUUID()})).status,200);
  const next=await createIdentityMaterial(env.SYNC_CREDENTIAL_PEPPER);assert.equal((await http.fetch(request('/v2/accounts/port-device',{operationId:randomUUID(),appDeviceCredential:next.credential,deviceLabel:'fresh'},{credential:B.account.credential}))).status,201);
 });
 await test('simultaneous same operation creates one canonical Account',async()=>{
  const body=startBody(),req=request('/v2/accounts/start',body),n=await count('sync_accounts');
  const responses=await Promise.all([http.fetch(req.clone()),makeHttp().fetch(req.clone())]);const statuses=responses.map(x=>x.status);assert.equal(statuses.filter(x=>x===201).length,1);assert.equal(await count('sync_accounts'),n+1);
 });
 await test('real Pro HMAC and signed device renewal preserve lifecycle and reject absent/expired credentials',async()=>{
  assert.equal((await http.fetch(request('/v2/pro-auth/device-session/challenge',{publicKey:{}},{credential:A.account.credential}))).status,401);
  const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),publicKey=await crypto.subtle.exportKey('jwk',key.publicKey);
  const r=await http.fetch(request('/v2/pro-auth/device-session/challenge',{publicKey},{credential:proB.credential}));assert.equal(r.status,200);const c=await r.json();
  const signature=Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key.privateKey,new TextEncoder().encode(c.message))).toString('base64url');
  assert.equal((await http.fetch(request('/v2/pro-auth/device-session/renew',{publicKey,challenge:c.challenge,mac:c.mac,signature},{credential:proB.credential}))).status,200);
  const expired=createIsolatedMaintenanceOwnerHttp({db,env,writerScope:writer,securityScope:security,dependencies:{...dependencies,now:()=>Date.now()+91*86400000}});
  assert.equal((await expired.fetch(request('/v2/pro-auth/session',null,{credential:proB.credential}))).status,401);
 });
 await test('old Account generation delayed response cannot overwrite normal B',async()=>{
  const material=await createIdentityMaterial(env.SYNC_CREDENTIAL_PEPPER),body={operationId:randomUUID(),appDeviceCredential:material.credential,deviceLabel:'old A'},req=request('/v2/accounts/port-device',body,{credential:A.account.credential});
  const n=await count('sync_devices');let entered,release;const ready=new Promise(r=>entered=r),pause=new Promise(r=>release=r);let once=true;
  const hooks={matches:ss=>ss.some(s=>/^\s*INSERT INTO sync_port_device_operations/i.test(s)),before:async()=>{if(once){once=false;entered();await pause;}}};
  const running=makeHttp(instrument(db,hooks)).fetch(req.clone());await Promise.race([ready,running.then(r=>{throw Error('Account barrier not reached '+r.status);})]);
  await db.prepare('UPDATE sync_accounts SET generation=generation+1 WHERE id=?').bind(A.payload.accountId).run();
  assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:B.account.credential}))).status,200);release();assert.equal((await running).status,503);assert.equal(await count('sync_devices'),n);
  for(const sourceOperationId of [body.operationId,(await registered(body.operationId)).operation_id])assert.equal((await http.resolvePending(req.clone(),{sourceOperationId,resolutionOperationId:randomUUID()})).status,200);
 });
}
let A,B,C,proA,proB,port,failed=false;
try{
 await openRuntime();for(const sql of input.base_sql)await db.prepare(sql).run();for(const x of input.journal)await db.prepare('INSERT INTO d1_migrations(id,name)VALUES(?,?)').bind(x.id,x.name).run();await db.batch(MAINTENANCE_V2_DDL.map(sql=>db.prepare(sql)));
 await db.prepare("INSERT INTO sync_account_runtime_control(singleton_id,rollout_mode,account_admission_enabled,membership_admission_enabled,account_read_enabled,account_recovery_enabled,account_delete_enabled,port_orchestration_enabled,generation,updated_at)VALUES(1,'open',1,1,1,1,1,1,1,1)").run();
 const now=Date.now();await db.prepare("INSERT INTO pro_auth_state(singleton_id,generation,active_code_slot,legacy_compat_enabled,updated_at,session_lifecycle_started_at,unbound_backend_until)VALUES(1,1,'A',1,?,?,?)").bind(now,now-1,now+86400000).run();
 await activate(writer);await activate(security);env=environment();http=makeHttp();
 await test('first Account creation through unchanged HTTP owner with unregistered profile',async()=>{A=await start();assert.equal(A.response.status,201);assert.equal(A.payload.operation,'created');assert.equal(A.payload.memberships.length,1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_account_memberships WHERE account_id=?').bind(A.payload.accountId).first()).n,2);
 const root=await db.prepare('SELECT binding_json FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(A.body.operationId).first();const subject=JSON.parse(root.binding_json).subject;assert.deepEqual(subject,{kind:'unregistered'});assert.equal(await count('sync_accounts'),1);});
 await test('UUID/digest mismatch cannot duplicate Account; explicit reconcile returns no credential',async()=>{
  const changed={...A.body,deviceLabel:'different'};assert.equal((await http.fetch(request('/v2/accounts/start',changed))).status,503);assert.equal(await count('sync_accounts'),1);
  const replay=await http.fetch(request('/v2/accounts/start',A.body));assert.equal(replay.status,409);
  const r=await http.reconcile(request('/v2/accounts/start',A.body));assert.equal(r.status,200);const text=await r.text();assert(!text.includes(A.account.credential));assert(!text.includes(A.recovery));});
 await test('unknown body identity is not promoted or backfilled',async()=>{const n=await count('sync_accounts');const s=createAccountCredential();const body={operationId:randomUUID(),appIds:['pitch'],accountCredential:s.credential,recoveryCode:createAccountRecoveryCode(),turnstileToken:'synthetic',deviceLabel:'test',accountId:'forged',generation:999};assert.equal((await http.fetch(request('/v2/accounts/start',body))).status,400);assert.equal(await count('sync_accounts'),n);});
 await test('normal B creation and authenticated GET activity uses separate guarded transactions',async()=>{B=await start();assert.equal(B.response.status,201);await db.prepare('UPDATE sync_account_devices SET created_at=1,last_seen_at=1 WHERE id=?').bind(B.account.deviceId).run();
 const req=request('/v2/accounts/summary',null,{credential:B.account.credential}),r=await http.fetch(req);assert.equal(r.status,200);
 assert((await db.prepare('SELECT last_seen_at FROM sync_account_devices WHERE id=?').bind(B.account.deviceId).first()).last_seen_at>1);
 const facts=await http.reconcile(req);assert.equal(facts.status,200);const text=await facts.text();assert(text.includes('activity-state-observed'));assert(!text.includes(B.account.credential));});
 await test('member pending and device registration are resolved by existing Port owner',async()=>{const material=await createIdentityMaterial(env.SYNC_CREDENTIAL_PEPPER);const body={operationId:randomUUID(),appDeviceCredential:material.credential,deviceLabel:'Port fixture'};const r=await http.fetch(request('/v2/accounts/port-device',body,{credential:B.account.credential}));assert.equal(r.status,201);port=await r.json();assert.equal(port.membershipState,'active');assert.equal(port.accountId,B.payload.accountId);});
 await test('real Pro verify issues credential and historical reconcile never reissues secret',async()=>{const req=request('/v2/pro-auth/verify',{passcode:env.PRO_PASSCODE_SLOT_A,turnstileToken:'synthetic'});const r=await http.fetch(req.clone());assert.equal(r.status,201);proA=await r.json();assert(proA.credential);
 assert.equal((await http.fetch(req.clone())).status,409);const meta=await http.reconcile(req.clone());const text=await meta.text();assert(!text.includes(proA.credential));assert(text.includes('pro-issued-secret-not-retained'));});
 await test('second normal Pro B preserved when revoking A including idempotent0-row revoke',async()=>{const r=await http.fetch(request('/v2/pro-auth/verify',{passcode:env.PRO_PASSCODE_SLOT_A,turnstileToken:'synthetic'}));assert.equal(r.status,201);proB=await r.json();assert.equal((await http.fetch(request('/v2/pro-auth/revoke',{}, {credential:proA.credential}))).status,200);assert.equal((await http.fetch(request('/v2/pro-auth/revoke',{}, {credential:proA.credential}))).status,200);assert.equal((await http.fetch(request('/v2/pro-auth/session',null,{credential:proB.credential}))).status,200);assert.equal((await http.fetch(request('/v2/pro-auth/session',null,{credential:proA.credential}))).status,401);});
 await extraTests();
 C=await start();assert.equal(C.response.status,201);
 await test('maintenance writer stop blocks creation/device/Pro issue while security revocation remains',async()=>{await admin.stop(controlReq('stop',writer,4));const n=await count('sync_accounts');const C=await start();assert.equal(C.response.status,423);assert.equal(await count('sync_accounts'),n);
 const creds=await count('pro_credentials');assert.equal((await http.fetch(request('/v2/pro-auth/verify',{passcode:env.PRO_PASSCODE_SLOT_A,turnstileToken:'synthetic'}))).status,423);assert.equal(await count('pro_credentials'),creds);
 assert.equal((await http.fetch(request('/v2/pro-auth/revoke',{}, {credential:proB.credential}))).status,200);});
 await test('stop preserves self Account revocation and metadata readback without B side effects',async()=>{
  const body={operationId:randomUUID(),accountDeviceId:C.account.deviceId},req=request('/v2/accounts/devices/revoke',body,{credential:C.account.credential});assert.equal((await http.fetch(req.clone())).status,200);
  assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:C.account.credential}))).status,410);
  assert.equal((await http.reconcile(req.clone())).status,200);assert.equal((await http.fetch(req.clone())).status,409);
  assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:B.account.credential}))).status,200);
 });
 await test('maintenance stop retains wrong-passcode lockout security operation',async()=>{const n=await count('pro_credentials');const r=await http.fetch(request('/v2/pro-auth/verify',{passcode:'1111',turnstileToken:'synthetic'}));assert.equal(r.status,401);assert.equal(await count('pro_credentials'),n);assert((await count('pro_auth_lockouts'))>0);});
 await test('Account recovery prepare/commit while normal writer stopped does not resume writer',async()=>{
  const next=createAccountCredential(),claim=createAccountRecoveryClaim(),nextRecovery=createAccountRecoveryCode();
  const body={operationId:randomUUID(),claimToken:claim.claimToken,accountCredential:next.credential,recoveryCode:A.recovery,nextRecoveryCode:nextRecovery,turnstileToken:'synthetic',deviceLabel:'Recovered'};
  const prepared=await http.fetch(request('/v2/accounts/recovery/prepare',body));assert.equal(prepared.status,201);
  const commit={operationId:randomUUID(),claimToken:claim.claimToken,accountCredential:next.credential};
  // Freeze B after its owner-context read but before the repository's current
  // claim read. A commits first; B may observe that exact already-committed claim.
  // This is distinct from two already-compiled mutation batches racing on CAS.
  let entered,release,once=true;const ready=new Promise(r=>entered=r),pause=new Promise(r=>release=r);
  const hooks={matches:()=>false,beforeRead:async sql=>{if(once&&/^\s*SELECT claim_id, claim_verifier, account_id/.test(sql)){once=false;entered();await pause;}}};
  const later={...commit,operationId:randomUUID()};const pending=makeHttp(instrument(db,hooks)).fetch(request('/v2/accounts/recovery/commit',later));await ready;
  const r=await http.fetch(request('/v2/accounts/recovery/commit',commit));assert.equal(r.status,201);release();assert.equal((await pending).status,200);
  const laterFacts=await http.reconcile(request('/v2/accounts/recovery/commit',later));const laterText=await laterFacts.text();assert(!laterText.includes('account-recovered'));assert(laterText.includes('activity-state-observed'));assert(laterText.includes('"httpStatus":200'));
  const result=await r.json();assert.equal(result.accountId,A.payload.accountId);assert.equal(result.recoveryVersion,2);
  const old=await http.fetch(request('/v2/accounts/summary',null,{credential:A.account.credential}));assert.equal(old.status,410);assert.equal((await old.json()).code,'account_device_revoked');
  assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:next.credential}))).status,200);
  const app=await createIdentityMaterial(env.SYNC_CREDENTIAL_PEPPER);assert.equal((await http.fetch(request('/v2/accounts/port-device',{operationId:randomUUID(),appDeviceCredential:app.credential,deviceLabel:'blocked'},{credential:next.credential}))).status,423);
 });
 await test('Origin/method/size/operation mismatch fail before canonical owner writes',async()=>{
  const n=await count('sync_accounts');assert.equal((await http.fetch(request('/v2/accounts/start',A.body,{originValue:'https://evil.invalid'}))).status,403);
  assert.equal((await http.fetch(request('/v2/accounts/start',null))).status,405);
  assert.equal((await http.fetch(request('/v2/accounts/start',A.body,{id:randomUUID()}))).status,409);
  const r=request('/v2/pro-auth/verify',{passcode:'4826',turnstileToken:'x'.repeat(5000)});assert.equal((await http.fetch(r)).status,413);assert.equal(await count('sync_accounts'),n);
 });
 if(process.env.MAINTENANCE_OWNER_BROWSER==='true'){
  const {runOwnerBrowser}=await import('./maintenance-owner-http-browser-fixture.mjs');
  await runOwnerBrowser({db,env,writerScope:writer,securityScope:security,dependencies,out:OUT,runtime:RUNTIME,bootstrapBody:startBody()});
 }
}catch(e){failed=true;result.failure=String(e.stack||e);console.log('FAIL '+result.failure);}
finally{if(mf)await mf.dispose();result.summary={pass:result.tests.filter(x=>x.status==='PASS').length,fail:result.tests.filter(x=>x.status==='FAIL').length,skip:0};fs.writeFileSync(path.join(OUT,'OWNER-NATIVE-RESULT.json'),JSON.stringify(result,null,2)+'\n');}
if(failed)process.exitCode=1;
