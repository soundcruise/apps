import {createIsolatedMaintenanceAssetScheduled} from '../src/maintenance-asset-scheduled.js';
import {sha256Hex}from '../src/asset-validation.js';
import {manifestHash,canonicalJson,hashRecord}from '../src/records.js';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire}from'node:module';import{randomUUID}from'node:crypto';
import{createIsolatedMaintenanceOwnerHttp}from'../src/maintenance-owner-http.js';
import{createIsolatedMaintenanceBridgeV2,maintenanceDigest,maintenanceCanonical}from'../src/maintenance-bridge-v2.js';
import{MAINTENANCE_V2_DDL}from'../src/maintenance-v2-schema.js';
import{createAccountCredential,createAccountRecoveryCode,createAccountRecoveryClaim,accountCredentialVerifier,accountRecoveryCodeVerifier}from'../src/account-crypto.js';
import{createAccountDeleteIntent,createAppJoinCode,createAccountHandoff}from'../src/account-crypto.js';
import{createIdentityMaterial}from'../src/crypto.js';
const OUT=process.env.MAINTENANCE_ASSET_EVIDENCE_DIR,RUNTIME=process.env.MAINTENANCE_V2_RUNTIME_PACKAGE;if(!OUT||!RUNTIME)throw Error('Explicit local fixture paths required');
const RUN=fs.mkdtempSync(path.join(OUT,'asset-native-'));
const{Miniflare,convertV4MiniflareOptions}=createRequire(RUNTIME)('miniflare');
const input=JSON.parse(fs.readFileSync(new URL('../test/fixtures/maintenance-v2-schema33.json',import.meta.url)));
const result={scope:'Asset HTTP/Scheduled adapters + actual workerd HTTP + native D1/R2; synthetic only',tests:[],productionAccess:false};
const origin='https://localhost';const limit={async limit(){return{success:true};}};let mf,db,http,admin,env;const writer='account-pro-writer',security='account-pro-security';
const adminIdentity={ownerId:'fixture-admin',accountId:'fixture',membershipId:'fixture',deviceId:'fixture',datasetId:'maintenance',accountGeneration:1,membershipGeneration:1,credentialVersion:1,writerEpoch:1,proGeneration:1};
const adminOwner={id:'fixture-admin',async verify(r){return{allowed:true,identityDigest:await maintenanceDigest(r.identity),assertions:[{sql:'SELECT 1 AS ok',params:[]}]};},async verifyHandover(){return true;}};
function controlReq(kind,scope,epoch,extra={}){return{kind,scope,expectedEpoch:epoch,operationId:randomUUID(),identity:adminIdentity,...extra};}
async function openRuntime(){const {build}=createRequire(RUNTIME)('esbuild');const bundle=await build({entryPoints:[new URL('../test/maintenance-asset-worker-entry.js',import.meta.url).pathname],bundle:true,format:'esm',platform:'browser',write:false});const worker={modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',d1Databases:{DB:'account-pro'},r2Buckets:{ASSETS:'synthetic-assets',SYNC_ASSETS:'synthetic-assets'},bindings:Object.fromEntries(Object.entries(environment()).filter(([,v])=>typeof v==='string'))};mf=new Miniflare(convertV4MiniflareOptions({workers:[{...worker,name:'one'},{...worker,name:'two'}],cf:false,resourcePersistencePath:path.join(RUN,'state'),resourceTmpPath:path.join(RUN,'tmp'),outboundService:()=>{throw Error('external network forbidden');}}));db=await mf.getD1Database('DB','one');admin=createIsolatedMaintenanceBridgeV2({db,owner:adminOwner});}
async function activate(scope){await db.prepare("INSERT INTO sync_maintenance_v2_control(scope,contract_version,epoch,phase,updated_at) VALUES (?,2,1,'closed',1)").bind(scope).run();const stop=controlReq('stop',scope,1);await admin.stop(stop);
const proof=await maintenanceDigest('fixture-only exclusion proof');const evidence=Object.fromEntries(['oldIngressExcluded','oldVersionsExcluded','oldScheduledExcluded','externalWritersExcluded','oldInflightExcluded','partialResultsExcluded','newClaimsAbsent','unknownResultsAbsent'].map(k=>[k,proof]));
const hand=controlReq('handover',scope,2,{stopOperationId:stop.operationId,evidence:{...evidence,environment:'isolated',inventoryDigest:proof,sourceDigest:proof}});await admin.handover(hand);await admin.open(controlReq('open',scope,3,{handoverOperationId:hand.operationId}));}
function environment(){return{SYNC_DB:db,ACCOUNT_ALLOWED_ORIGINS:origin,ALLOWED_ORIGINS:origin,
 SYNC_ACCOUNT_CREDENTIAL_PEPPER:'synthetic-account-pepper-at-least-32-bytes',SYNC_ACCOUNT_RECOVERY_PEPPER:'synthetic-recovery-pepper-at-least-32-bytes',
 SYNC_CREDENTIAL_PEPPER:'synthetic-app-pepper-at-least-32-bytes',SYNC_ALLOWED_APP_IDS:'port,pitch,chord,fretboard,rhythm',SYNC_PUBLIC_APP_IDS:'port,pitch,chord,fretboard,rhythm',SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED:'true',SYNC_ACCOUNT_PUBLIC_APP_IDS:'chord,pitch,fretboard,rhythm,port',
 PRO_CREDENTIAL_PEPPER:'synthetic-pro-pepper-at-least-32-bytes',PRO_LOCKOUT_PEPPER:'synthetic-lockout-pepper-at-least-32-bytes',PRO_PASSCODE_SLOT_A:'4826',
 SYNC_ACCOUNT_APP_JOIN_PEPPER:'synthetic-join-pepper-at-least-32-bytes',SYNC_ACCOUNT_HANDOFF_PEPPER:'synthetic-handoff-pepper-at-least-32-bytes',ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER:limit,ACCOUNT_APP_JOIN_CONSUME_RATE_LIMITER:limit,ACCOUNT_HANDOFF_ISSUE_RATE_LIMITER:limit,ACCOUNT_HANDOFF_CONSUME_RATE_LIMITER:limit,ACCOUNT_START_RATE_LIMITER:limit,ACCOUNT_RECOVERY_RATE_LIMITER:limit,SYNC_RATE_LIMITER:limit,PRO_VERIFY_RATE_LIMITER:limit,
 TURNSTILE_PRODUCTION_SECRET_KEY:'synthetic-only-key'};}
const dependencies={async verifyTurnstileToken(){return{ok:true};},async verifyProTurnstile(){return{ok:true};}};
const makeHttp=(binding=db)=>createIsolatedMaintenanceOwnerHttp({db:binding,env,writerScope:writer,securityScope:security,dependencies,assetExternalScopeForAccount:id=>'asset-'+id});
function request(route,body=null,{id=body?.operationId||randomUUID(),credential,pro,method=body===null?'GET':'POST',originValue=origin}={}){
 const headers={Origin:originValue,'CF-Connecting-IP':'192.0.2.9','X-Maintenance-Operation-Id':id};if(body!==null)headers['Content-Type']='application/json';if(credential)headers.Authorization='Bearer '+credential;if(pro)headers['X-Sound-Cruise-Pro-Authorization']='Bearer '+pro;
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
 if(match&&hooks.before)await hooks.before();const result=await binding.batch(entries.map(x=>match&&hooks.zeroSQL?.test(x.sql)?binding.prepare(hooks.zeroLastWhere?x.sql.slice(0,x.sql.lastIndexOf('WHERE'))+'WHERE 0 AND'+x.sql.slice(x.sql.lastIndexOf('WHERE')+5):x.sql.replace(/WHERE\b/,'WHERE 0 AND')).bind(...x.values):x.native));if(match&&hooks.loseAck){hooks.loseAck=false;throw Error('synthetic business ACK loss');}return result;}
 };
}
function startBody(){return{operationId:randomUUID(),appIds:['pitch'],accountCredential:createAccountCredential().credential,recoveryCode:createAccountRecoveryCode(),turnstileToken:'synthetic',deviceLabel:'Isolated PC'};}
async function registered(id){return db.prepare("SELECT operation_id FROM sync_maintenance_v2_operations WHERE phase='registered' AND json_extract(binding_json,'$.invocationId')=? AND operation_id<>?").bind(id,id).first();}
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
async function closePending(req,adapter=http){const id=req.headers.get('X-Maintenance-Operation-Id'),rows=(await db.prepare("SELECT operation_id FROM sync_maintenance_v2_operations WHERE json_extract(binding_json,'$.invocationId')=? AND phase='registered' ORDER BY operation_id").bind(id).all()).results;for(const row of rows)assert.equal((await adapter.resolvePending(req.clone(),{sourceOperationId:row.operation_id,resolutionOperationId:randomUUID()})).status,200);}
function pauseBusiness(pattern){let enter,release,once=true;const ready=new Promise(r=>enter=r),wait=new Promise(r=>release=r);return{ready,release:()=>release(),hooks:{matches:ss=>ss.some(s=>pattern.test(s)),before:async()=>{if(once){once=false;enter();await wait;}}}};}
async function readyApp(a,appId='pitch'){
 const app=await seedApp(a,appId),m=await db.prepare('SELECT * FROM sync_account_memberships WHERE id=?').bind(app.membershipId).first();
 await db.batch([db.prepare('INSERT OR IGNORE INTO sync_account_managed_users(account_id,membership_id,sync_user_id,app_id,created_at)VALUES(?,?,?,?,1)').bind(a.id,m.id,m.sync_user_id,appId),db.prepare("INSERT OR IGNORE INTO sync_datasets(user_id,app_id,schema_version,state,initialized_at,updated_at)VALUES(?,?,1,'ready',1,1)").bind(m.sync_user_id,appId)]);return{...app,userId:m.sync_user_id};
}
const memberPath=app=>'/v2/accounts/memberships/'+app;
async function intent(a,appId=null){const i=createAccountDeleteIntent(),body={operationId:randomUUID(),intentToken:i.intentToken,...(appId?{appId}:{})},r=await http.fetch(request((appId?memberPath(appId):'/v2/accounts')+'/delete-intent',body,{credential:a.credential}));assert.equal(r.status,201,await r.text());return{...i,a,appId,body};}
function deletion(i){return request(i.appId?memberPath(i.appId):'/v2/accounts',{operationId:randomUUID(),intentToken:i.intentToken,...(i.appId?{appId:i.appId}:{})},{credential:i.a.credential,method:'DELETE'});}
function cancellation(a,appId='pitch'){return request(memberPath(appId)+'/delete/cancel',{operationId:randomUUID(),appId},{credential:a.credential});}
async function state(a){return db.prepare('SELECT state,generation FROM sync_accounts WHERE id=?').bind(a.id).first();}
async function member(app){return db.prepare('SELECT * FROM sync_account_memberships WHERE id=?').bind(app.membershipId).first();}
async function appDevice(app){return db.prepare('SELECT revoked_at,user_label FROM sync_devices WHERE id=?').bind(app.deviceId).first();}
const deletionPattern=/^\s*UPDATE sync_account_memberships\s+SET state = 'deleting'/;
let B,pro,legacyUnknown,failed=false;
const datasetReq=(a,path,body=null,extra={})=>request('/v1/sync/'+path,body,{credential:a.credential,pro,...extra});
async function seedSync({ready=true}={}){const a=await seedAccount(),app=await readyApp(a,'port');if(!ready)await db.prepare('DELETE FROM sync_datasets WHERE user_id=?').bind(app.userId).run();return{...app,id:a.id};}
const blank=async()=>({appId:'port',schemaVersion:1,recordCount:0,manifestHash:await manifestHash([],1,crypto,'port')});
async function pushBody({id=randomUUID(),baseRevision=0,bpm=120,recordId='default'}={}){const op={operationId:id,recordType:'metronome_settings',recordId,schemaVersion:1,baseRevision,payload:{id:recordId,value:{bpm}},deleted:false};op.payloadHash=await hashRecord(op,crypto,'port');return{appId:'port',mode:'sync',operations:[op]};}
async function send(a,path,body=null,adapter=http,extra={}){return adapter.fetch(datasetReq(a,path,body,extra));}
async function issuePro(){const r=await http.fetch(request('/v2/pro-auth/verify',{passcode:env.PRO_PASSCODE_SLOT_A,turnstileToken:'synthetic'}));assert.equal(r.status,201,await r.clone().text());pro=(await r.json()).credential;}
async function record(a){return db.prepare('SELECT revision,payload_json,last_operation_id FROM sync_records WHERE user_id=? AND app_id=\'port\' ORDER BY record_id').bind(a.userId).all();}
async function assertOK(r,status=200){assert.equal(r.status,status,await r.clone().text());return r.json();}
async function applyMigration(m,n){await db.batch(m.statements.map(sql=>db.prepare(sql)));await db.prepare('INSERT INTO d1_migrations(id,name)VALUES(?,?)').bind(n,m.name).run();}

let r2,oldInvalid;
async function assetUser(){const a=await seedSync();await activate('asset-'+a.id);return a;}
const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,2,0,0,0,2,0,8,2,0,0,0]);
async function prep(a){const body={appId:'port',operationId:randomUUID(),assetId:randomUUID(),kind:'gear_photo_final',hash:await sha256Hex(bytes),mime:'image/png',byteSize:bytes.length,width:512,height:512};const req=datasetReq(a,'assets/prepare',body,{id:randomUUID()});return{a,body,req,response:await http.fetch(req.clone())};}
function upload(f,id=randomUUID()){return new Request('https://owner.fixture.invalid/v1/sync/assets/'+f.body.assetId+'/content',{method:'PUT',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.9','X-Maintenance-Operation-Id':id,Authorization:'Bearer '+f.a.credential,'X-Sound-Cruise-Pro-Authorization':'Bearer '+pro,'X-Sound-Cruise-Operation-Id':f.body.operationId,'X-Content-SHA256':f.body.hash,'Content-Type':'image/png','Content-Length':String(bytes.length)},body:bytes});}
const row=f=>db.prepare('SELECT * FROM sync_assets WHERE asset_id=?').bind(f.body.assetId).first();
async function pending(req){return db.prepare("SELECT * FROM sync_maintenance_v2_operations WHERE kind='external' AND json_extract(binding_json,'$.invocationId')=?").bind(req.headers.get('X-Maintenance-Operation-Id')).first();}
async function initialize(){await openRuntime();r2=await mf.getR2Bucket('ASSETS','one');for(const sql of input.base_sql)await db.prepare(sql).run();for(const x of input.journal)await db.prepare('INSERT INTO d1_migrations(id,name)VALUES(?,?)').bind(x.id,x.name).run();await db.batch(MAINTENANCE_V2_DDL.map(sql=>db.prepare(sql)));await db.prepare("INSERT INTO sync_account_runtime_control(singleton_id,rollout_mode,account_admission_enabled,membership_admission_enabled,account_read_enabled,account_recovery_enabled,account_delete_enabled,port_orchestration_enabled,generation,updated_at)VALUES(1,'open',1,1,1,1,1,1,1,1)").run();
 await db.prepare("INSERT INTO sync_runtime_control(singleton_id,rollout_mode,admission_enabled,data_write_enabled,data_read_enabled,recovery_enabled,cloud_delete_enabled,generation,updated_at)VALUES(1,'open',1,1,1,1,1,1,1)").run();
 const now=Date.now();await db.prepare("INSERT INTO pro_auth_state(singleton_id,generation,active_code_slot,legacy_compat_enabled,updated_at,session_lifecycle_started_at,unbound_backend_until)VALUES(1,1,'A',1,?,?,?)").bind(now,now-1,now+86400000).run();
 await activate(writer);await activate(security);env={...environment(),SYNC_ASSETS:r2};http=makeHttp();await issuePro();}
try{
 await initialize();
 for(let i=0;i<=input.migrations.length;i++){
  const stage=33+i;
  await test('schema'+stage+' metadata exact and writer compatibility',async()=>{assert.equal(await admin.checkSchema(),stage);if(stage<37){const a=await assetUser(),f=await prep(a);assert.equal(f.response.status,503);assert.equal(await row(f),null);}});
  if(i===0){oldInvalid=await assetUser();await db.prepare("INSERT INTO sync_records(user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,updated_by_device_id,last_operation_id,schema_version)VALUES(?,'port','metronome_settings','legacy','bad-json',?,1,1,?,?,1)").bind(oldInvalid.userId,'b'.repeat(64),oldInvalid.deviceId,randomUUID()).run();}
  if(i<input.migrations.length)await applyMigration(input.migrations[i],34+i);
 }
 await test('prepare/upload/commit/download/unreference use native D1 and R2',async()=>{
 const a=await assetUser(),f=await prep(a);await assertOK(f.response,201);const req=upload(f);await assertOK(await http.fetch(req.clone()));assert.equal((await row(f)).state,'uploaded');assert.equal((await pending(req)).phase,'external_pending');
 await assertOK(await http.fetch(datasetReq(a,'assets/commit',{appId:'port',assetId:f.body.assetId,operationId:f.body.operationId,hash:f.body.hash},{id:randomUUID()})));
 const download=await http.fetch(datasetReq(a,'assets/'+f.body.assetId));assert.equal(download.status,200,await download.clone().text());assert.deepEqual(new Uint8Array(await download.arrayBuffer()),bytes);
 await assertOK(await http.fetch(datasetReq(a,'assets/unreference',{appId:'port',assetIds:[f.body.assetId]},{id:randomUUID()})));assert.equal((await row(f)).state,'unreferenced');
 assert.equal((await http.fetch(req.clone())).status,409);assert.equal((await http.reconcileExternal(req.clone())).status,200);
 const source=await pending(req);await admin.stop(controlReq('stop',source.scope,source.epoch));assert.equal((await http.reconcileExternal(req.clone(),{resolutionOperationId:randomUUID()})).status,200);assert.equal((await pending(req)).phase,'resolved');
 });

 await test('upload R2 success D1 rejection keeps pending and original prepared row',async()=>{
 const f=await prep(await assetUser());await assertOK(f.response,201);const req=upload(f);let puts=0;
 const saved=env.SYNC_ASSETS;env.SYNC_ASSETS={...saved,put:async(...args)=>{puts++;const v=await r2.put(...args);await db.prepare('UPDATE sync_accounts SET generation=generation+1 WHERE id=?').bind(f.a.id).run();return v;},head:k=>r2.head(k),get:k=>r2.get(k)};
 try{assert.equal((await makeHttp().fetch(req.clone())).status,503);}finally{env.SYNC_ASSETS=saved;}
 assert.equal(puts,1);assert.equal((await row(f)).state,'prepared');assert.ok(await r2.head((await row(f)).object_key));assert.ok(await pending(req));
 assert.equal((await http.fetch(req.clone())).status,409);assert.equal(puts,1);
 assert.equal((await http.reconcileExternal(req.clone(),{resolutionOperationId:randomUUID()})).status,409);
 });
 await test('R2 PUT unknown after actual write is retained without retry',async()=>{
 const f=await prep(await assetUser());await assertOK(f.response,201);const req=upload(f),saved=env.SYNC_ASSETS;let calls=0;
 env.SYNC_ASSETS={put:async(...args)=>{calls++;await r2.put(...args);throw Error('ACK lost');},head:k=>r2.head(k),get:k=>r2.get(k)};
 try{assert.equal((await makeHttp().fetch(req.clone())).status,503);}finally{env.SYNC_ASSETS=saved;}
 assert.equal((await pending(req)).phase,'unknown');assert.equal((await row(f)).state,'prepared');assert.equal((await http.fetch(req.clone())).status,409);assert.equal(calls,1);
 });
 await test('changed upload bytes same root is not replayed',async()=>{
 const f=await prep(await assetUser());await assertOK(f.response,201);const req=upload(f);await assertOK(await http.fetch(req.clone()));const altered=new Request(req,{body:new Uint8Array(bytes.map((v,i)=>i===28?1:v))});assert.equal((await http.fetch(altered)).status,503);assert.equal((await row(f)).state,'uploaded');
 });
 await test('another Account cannot observe or mutate Asset and B continues while A pending',async()=>{
 const a=await assetUser(),b=await assetUser(),f=await prep(a),g=await prep(b);await assertOK(f.response,201);await assertOK(g.response,201);await assertOK(await http.fetch(upload(f)));await assertOK(await http.fetch(upload(g)));
 assert.equal((await http.fetch(datasetReq(b,'assets/'+f.body.assetId))).status,503);assert.equal((await row(g)).state,'uploaded');assert.ok(await r2.head((await row(g)).object_key));
 });
 await test('concurrent upload of same Asset has exactly one R2 side effect',async()=>{
 const f=await prep(await assetUser());await assertOK(f.response,201);let calls=0;const saved=env.SYNC_ASSETS;env.SYNC_ASSETS={put:async(...args)=>{calls++;return r2.put(...args);},head:k=>r2.head(k),get:k=>r2.get(k)};
 try{const h1=makeHttp(),h2=makeHttp();const r=await Promise.all([h1.fetch(upload(f)),h2.fetch(upload(f))]);assert.equal(r.filter(x=>x.status===200).length,1);}finally{env.SYNC_ASSETS=saved;}assert.equal(calls,1);
 });
 function cleanupOwner(a){const identity={...adminIdentity,ownerId:'asset-fixture-owner',accountId:a.id,membershipId:a.membershipId,deviceId:a.deviceId};
 const owner={id:identity.ownerId,async verify(r){return{allowed:maintenanceDigest!==null&&maintenanceCanonicalLocal(r.identity)===maintenanceCanonicalLocal(identity),identityDigest:await maintenanceDigest(r.identity),assertions:[{sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM sync_accounts a JOIN sync_account_memberships m ON m.account_id=a.id WHERE a.id=? AND m.id=? AND a.generation=1 AND m.generation=1 AND a.state='active' AND m.state='active') THEN 1 ELSE 0 END AS ok",params:[a.id,a.membershipId]}]};},async verifyHandover(){return false;},async verifyCleanup(r,row){return{allowed:r.identity.accountId===a.id&&row.account_id===a.id,assetDigest:await maintenanceDigest(row)};}};return{owner,identity};}
 function maintenanceCanonicalLocal(x){return maintenanceCanonical(x);}
 async function staleAsset(){const f=await prep(await assetUser());await assertOK(f.response,201);await db.prepare("UPDATE sync_assets SET state='unreferenced',unreferenced_at=1,created_at=1,updated_at=1 WHERE asset_id=?").bind(f.body.assetId).run();await r2.put((await row(f)).object_key,bytes,{customMetadata:{hash:f.body.hash}});return f;}
 function scheduler(f,bucket=r2){const {owner,identity}=cleanupOwner(f.a),scope='asset-'+f.a.id;return{adapter:createIsolatedMaintenanceAssetScheduled({db,bucket,owner,scope}),req:{kind:'external',operationId:randomUUID(),scope,expectedEpoch:4,identity,action:{purpose:'scheduled-cleanup'}}};}
 await test('pre0036 invalid JSON blocks cleanup without repair',async()=>{
 const f=await staleAsset(),s=scheduler(f);await assert.rejects(s.adapter.run(s.req,{assetId:f.body.assetId}),/unknown_json/);assert.ok(await r2.head((await row(f)).object_key));assert.equal((await db.prepare('SELECT payload_json FROM sync_records WHERE user_id=?').bind(oldInvalid.userId).first()).payload_json,'bad-json');await db.prepare('DELETE FROM sync_records WHERE user_id=?').bind(oldInvalid.userId).run();
 });
 await test('scheduled delete retains claim then closed-scope readback atomically finishes D1',async()=>{
 const f=await staleAsset(),s=scheduler(f);assert.equal((await s.adapter.run(s.req,{assetId:f.body.assetId})).status,'external_pending');assert.equal(await r2.head((await row(f)).object_key),null);assert.equal((await row(f)).state,'unreferenced');assert.equal((await s.adapter.run(s.req,{assetId:f.body.assetId})).status,'HOLD');assert.equal((await s.adapter.reconcile(s.req)).classification,'absent-reservation-held');
 await admin.stop(controlReq('stop',s.req.scope,4));assert.equal((await s.adapter.reconcile(s.req,{resolutionOperationId:randomUUID()})).status,'committed');assert.equal((await row(f)).state,'deleted');assert.equal((await db.prepare('SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(s.req.operationId).first()).phase,'resolved');
 });
 await test('delete ACK loss preserves durable claim and does not auto-delete again',async()=>{
 const f=await staleAsset();let calls=0;const s=scheduler(f,{delete:async k=>{calls++;await r2.delete(k);throw Error('delete ACK lost');},head:k=>r2.head(k)});
 assert.equal((await s.adapter.run(s.req,{assetId:f.body.assetId})).status,'unknown');assert.equal((await s.adapter.run(s.req,{assetId:f.body.assetId})).status,'HOLD');await s.adapter.reconcile(s.req);assert.equal(calls,1);assert.ok(await db.prepare('SELECT * FROM sync_asset_deletions WHERE asset_id=?').bind(f.body.assetId).first());
 });
 await test('cross-account B reference refuses cleanup before R2 delete',async()=>{
 const f=await staleAsset(),b=await readyApp((await assetUser()).account,'pitch'),op=await pushBody();op.operations[0].payload.value.assetId=f.body.assetId;await db.prepare("INSERT INTO sync_records(user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,updated_by_device_id,last_operation_id,schema_version)VALUES(?,'pitch','metronome_settings','default',?, ?,1,1,?,?,1)").bind(b.userId,JSON.stringify(op.operations[0].payload),'a'.repeat(64),b.deviceId,randomUUID()).run();
 const s=scheduler(f);await assert.rejects(s.adapter.run(s.req,{assetId:f.body.assetId}),/reference/);assert.ok(await r2.head((await row(f)).object_key));await db.prepare('DELETE FROM sync_records WHERE user_id=?').bind(b.userId).run();
 });
 await test('cleanup stop between pending and claim forbids new claim and R2 action',async()=>{
 const f=await staleAsset(),s=scheduler(f),sourceOwner=cleanupOwner(f.a);let once=false,deletes=0;
 const owner={...sourceOwner.owner,async verify(r,p){if(p==='claim'&&!once){once=true;await admin.stop(controlReq('stop',s.req.scope,4));}return sourceOwner.owner.verify(r,p);}};
 const adapter=createIsolatedMaintenanceAssetScheduled({db,bucket:{delete:async()=>{deletes++;},head:k=>r2.head(k)},owner,scope:s.req.scope});
 assert.equal((await adapter.run(s.req,{assetId:f.body.assetId})).status,'unknown');assert.equal(deletes,0);assert.equal(await db.prepare('SELECT * FROM sync_asset_deletions WHERE asset_id=?').bind(f.body.assetId).first(),null);assert.ok(await db.prepare('SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(s.req.operationId).first());
 });
 await test('cleanup D1 completion rejects late Owner revocation and retains R2/D1 partial result',async()=>{
 const f=await staleAsset(),s=scheduler(f);await s.adapter.run(s.req,{assetId:f.body.assetId});await admin.stop(controlReq('stop',s.req.scope,4));
 const probe=instrument(db,{matches:ss=>ss.some(x=>/UPDATE sync_asset_deletions SET state='deleted'/.test(x)),before:async()=>{await db.prepare('UPDATE sync_accounts SET generation=2 WHERE id=?').bind(f.a.id).run();}});
 const owner=cleanupOwner(f.a).owner,adapter=createIsolatedMaintenanceAssetScheduled({db:probe,bucket:r2,owner,scope:s.req.scope});
 await assert.rejects(adapter.reconcile(s.req,{resolutionOperationId:randomUUID()}));assert.notEqual((await row(f)).state,'deleted');assert.equal(await r2.head((await row(f)).object_key),null);assert.notEqual((await db.prepare('SELECT phase FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(s.req.operationId).first()).phase,'resolved');
 });
 await test('Asset dataset stop after R2 keeps pending without logical commit',async()=>{
 const f=await prep(await assetUser());await assertOK(f.response,201);const saved=env.SYNC_ASSETS,req=upload(f);env.SYNC_ASSETS={put:async(...args)=>{const v=await r2.put(...args);await db.prepare("UPDATE sync_datasets SET state='initializing' WHERE user_id=? AND app_id='port'").bind(f.a.userId).run();return v;},head:k=>r2.head(k),get:k=>r2.get(k)};
 try{assert.equal((await makeHttp().fetch(req.clone())).status,503);}finally{env.SYNC_ASSETS=saved;}assert.equal((await row(f)).state,'prepared');assert.ok(await pending(req));
 });

 await test('two actual Worker instances share Asset D1/R2 and CAS one upload',async()=>{
 const f=await prep(await assetUser());await assertOK(f.response,201);const one=await mf.getWorker('one'),two=await mf.getWorker('two');const req=upload(f),responses=await Promise.all([one.fetch(req.clone()),two.fetch(upload(f))]);assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal((await row(f)).state,'uploaded');
 const d=await two.fetch(datasetReq(f.a,'assets/'+f.body.assetId));assert.equal(d.status,404); // prepared/uploaded bytes are not downloadable
 });

 await test('upload business ACK loss is historical D1 receipt not a second PUT',async()=>{
 const f=await prep(await assetUser());await assertOK(f.response,201);const req=upload(f),decorated=instrument(db,{matches:ss=>ss.some(x=>/UPDATE sync_assets SET state = 'uploaded'/.test(x)),loseAck:true});
 assert.equal((await makeHttp(decorated).fetch(req.clone())).status,503);assert.equal((await row(f)).state,'uploaded');assert.ok(await pending(req));assert.equal((await http.fetch(req.clone())).status,409);assert.equal((await http.reconcile(req.clone())).status,200);
 });
 await test('expired Pro during Asset commit rolls back and leaves uploaded bytes',async()=>{
 const f=await prep(await assetUser());await assertOK(f.response,201);await assertOK(await http.fetch(upload(f)));const before=await db.prepare('SELECT unbound_backend_until FROM pro_auth_state WHERE singleton_id=1').first();
 const decorated=instrument(db,{matches:ss=>ss.some(x=>/UPDATE sync_assets SET state = 'available'/.test(x)),before:async()=>db.prepare('UPDATE pro_auth_state SET unbound_backend_until=1 WHERE singleton_id=1').run()});
 try{assert.equal((await makeHttp(decorated).fetch(datasetReq(f.a,'assets/commit',{appId:'port',assetId:f.body.assetId,operationId:f.body.operationId,hash:f.body.hash},{id:randomUUID()}))).status,503);}finally{await db.prepare('UPDATE pro_auth_state SET unbound_backend_until=? WHERE singleton_id=1').bind(before.unbound_backend_until).run();}assert.equal((await row(f)).state,'uploaded');
 });
 await test('zero-row Asset state CAS cannot produce success or lose external pending',async()=>{
 const f=await prep(await assetUser());await assertOK(f.response,201);const req=upload(f),decorated=instrument(db,{matches:ss=>ss.some(x=>/UPDATE sync_assets SET state = 'uploaded'/.test(x)),zeroSQL:/UPDATE sync_assets SET state = 'uploaded'/});
 assert.equal((await makeHttp(decorated).fetch(req.clone())).status,503);assert.equal((await row(f)).state,'prepared');assert.ok(await pending(req));assert.ok(await r2.head((await row(f)).object_key));
 });
 await test('no handover cannot start new cleanup claim even with empty registry',async()=>{
 const f=await staleAsset(),scope='no-handover-'+randomUUID(),{owner,identity}=cleanupOwner(f.a);await db.prepare("INSERT INTO sync_maintenance_v2_control(scope,contract_version,epoch,phase,updated_at)VALUES(?,2,1,'closed',1)").bind(scope).run();let calls=0;
 const adapter=createIsolatedMaintenanceAssetScheduled({db,bucket:{delete:async()=>calls++},owner,scope});await assert.rejects(adapter.run({kind:'external',scope,expectedEpoch:1,operationId:randomUUID(),identity,action:{purpose:'cleanup'}},{assetId:f.body.assetId}));assert.equal(calls,0);assert.equal(await db.prepare('SELECT * FROM sync_asset_deletions WHERE asset_id=?').bind(f.body.assetId).first(),null);
 });
 await test('old pending cannot resolve a different Asset object version',async()=>{
 const f=await prep(await assetUser());await assertOK(f.response,201);const req=upload(f);await assertOK(await http.fetch(req.clone()));await db.prepare('UPDATE sync_assets SET object_version=2 WHERE asset_id=?').bind(f.body.assetId).run();assert.equal((await http.reconcileExternal(req.clone(),{resolutionOperationId:randomUUID()})).status,409);assert.equal((await pending(req)).phase,'external_pending');
 });
 await test('pending/claim survives runtime reopen without a second external action',async()=>{
 const f=await staleAsset(),s=scheduler(f);await s.adapter.run(s.req,{assetId:f.body.assetId});await mf.dispose();await openRuntime();r2=await mf.getR2Bucket('ASSETS','one');env={...environment(),SYNC_ASSETS:r2};http=makeHttp();const again=scheduler(f);assert.equal((await again.adapter.run(s.req,{assetId:f.body.assetId})).status,'HOLD');assert.equal((await again.adapter.reconcile(s.req)).classification,'absent-reservation-held');assert.ok(await db.prepare('SELECT * FROM sync_asset_deletions WHERE asset_id=?').bind(f.body.assetId).first());
 });
 await test('Owner candidate schema is explicitly unsupported and fails closed',async()=>{
 const statements=fs.readFileSync(new URL('../schema-candidates/0038_owner_route_candidate.sql',import.meta.url),'utf8').split('\n').filter(x=>!x.trim().startsWith('--')).join('\n').split(';').map(x=>x.trim()).filter(Boolean);await db.batch(statements.map(sql=>db.prepare(sql)));await assert.rejects(admin.checkSchema(),/base_schema_unknown/);
 });
}catch(e){failed=true;console.error(e.stack||e);}finally{if(mf)await mf.dispose();result.summary={pass:result.tests.filter(x=>x.status==='PASS').length,fail:result.tests.filter(x=>x.status==='FAIL').length,skip:0};fs.writeFileSync(path.join(OUT,'ASSET-NATIVE-RESULT.json'),JSON.stringify(result,null,2)+'\n');}if(failed)process.exitCode=1;
