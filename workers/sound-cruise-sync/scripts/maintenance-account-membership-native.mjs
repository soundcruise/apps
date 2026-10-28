import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire}from'node:module';import{randomUUID}from'node:crypto';
import{createIsolatedMaintenanceOwnerHttp}from'../src/maintenance-owner-http.js';
import{createIsolatedMaintenanceBridgeV2,maintenanceDigest}from'../src/maintenance-bridge-v2.js';
import{MAINTENANCE_V2_DDL}from'../src/maintenance-v2-schema.js';
import{createAccountCredential,createAccountRecoveryCode,createAccountRecoveryClaim,accountCredentialVerifier,accountRecoveryCodeVerifier}from'../src/account-crypto.js';
import{createAppJoinCode,createAccountHandoff}from'../src/account-crypto.js';
import{createIdentityMaterial}from'../src/crypto.js';
const OUT=process.env.MAINTENANCE_MEMBERSHIP_EVIDENCE_DIR,RUNTIME=process.env.MAINTENANCE_V2_RUNTIME_PACKAGE;if(!OUT||!RUNTIME)throw Error('Explicit local fixture paths required');
const RUN=fs.mkdtempSync(path.join(OUT,'membership-native-'));
const{Miniflare,convertV4MiniflareOptions}=createRequire(RUNTIME)('miniflare');
const input=JSON.parse(fs.readFileSync(new URL('../test/fixtures/maintenance-v2-schema33.json',import.meta.url)));
const result={scope:'13 membership/grant HTTP owners + native D1; no Production',tests:[],productionAccess:false};
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
 SYNC_ACCOUNT_APP_JOIN_PEPPER:'synthetic-join-pepper-at-least-32-bytes',SYNC_ACCOUNT_HANDOFF_PEPPER:'synthetic-handoff-pepper-at-least-32-bytes',ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER:limit,ACCOUNT_APP_JOIN_CONSUME_RATE_LIMITER:limit,ACCOUNT_HANDOFF_ISSUE_RATE_LIMITER:limit,ACCOUNT_HANDOFF_CONSUME_RATE_LIMITER:limit,ACCOUNT_START_RATE_LIMITER:limit,ACCOUNT_RECOVERY_RATE_LIMITER:limit,SYNC_RATE_LIMITER:limit,PRO_VERIFY_RATE_LIMITER:limit,
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
const paths={app:'/v2/accounts/app-join-invitations',port:'/v2/accounts/port-join-invitations',handoff:'/v2/accounts/handoffs'};
const tables={app:'sync_app_join_invitations',port:'sync_port_join_invitations',handoff:'sync_membership_handoffs'};
async function prepareMember(a){const r=await http.fetch(request('/v2/accounts/memberships',{operationId:randomUUID(),appId:'pitch'},{credential:a.credential}));assert.equal(r.status,201);return(await r.json()).membershipId;}
async function grant(family,a=null,{active=false}={}){
 a=a||await seedAccount();if(family!=='port'){
  if(!await db.prepare("SELECT id FROM sync_account_memberships WHERE account_id=? AND app_id='pitch'").bind(a.id).first())await prepareMember(a);
  if(active||family==='handoff'){
   const row=await db.prepare("SELECT state FROM sync_account_memberships WHERE account_id=? AND app_id='pitch'").bind(a.id).first();
   if(row.state==='pending'){const g=await grant('app',a),c=await consume(g);assert.equal(c.response.status,201);const m=await db.prepare("SELECT sync_user_id FROM sync_account_memberships WHERE account_id=? AND app_id='pitch'").bind(a.id).first();await db.prepare("INSERT INTO sync_datasets(user_id,app_id,schema_version,state,initialized_at,updated_at)VALUES(?,'pitch',1,'ready',1,1)").bind(m.sync_user_id).run();}
  }
 }
 const h=createAccountHandoff(),joinCode=createAppJoinCode(),id=family==='handoff'?h.handoffId:randomUUID();
 const body=family==='handoff'?{operationId:randomUUID(),appId:'pitch',handoffToken:h.handoffToken}:{operationId:randomUUID(),invitationId:id,...(family==='app'?{appId:'pitch'}:{}),joinCode};
 const req=request(paths[family],body,{credential:a.credential}),response=await http.fetch(req.clone());assert.equal(response.status,201,`${family} issue ${response.status}`);
 return{family,a,id,joinCode,handoffToken:h.handoffToken,req,body};
}
async function consumeRequest(g,overrides={}){const account=createAccountCredential(),app=await createIdentityMaterial(env.SYNC_CREDENTIAL_PEPPER);const body={operationId:randomUUID(),...(g.family==='handoff'?{handoffToken:g.handoffToken}:{joinCode:g.joinCode}),accountCredential:account.credential,deviceLabel:'isolated new environment',...(g.family!=='port'?{appId:'pitch',appDeviceCredential:app.credential,consumeMode:'new_app'}:{}),...overrides};return{body,req:request(paths[g.family]+'/consume',body),account,app};}
async function consume(g,adapter=http){const c=await consumeRequest(g);return{...c,response:await adapter.fetch(c.req.clone())};}
function cancelRequest(g,a=g.a){return request(paths[g.family]+'/cancel',{[g.family==='handoff'?'handoffId':'invitationId']:g.id},{credential:a.credential});}
async function grantRow(g){return db.prepare(`SELECT * FROM ${tables[g.family]} WHERE ${g.family==='handoff'?'handoff_id':'invitation_id'}=?`).bind(g.id).first();}
async function assertNotJoined(g,c){assert.equal((await grantRow(g)).consumed_at,null);assert.equal(await db.prepare('SELECT id FROM sync_account_devices WHERE id=?').bind(c.account.deviceId).first(),null);assert.equal(await db.prepare('SELECT id FROM sync_devices WHERE id=?').bind(c.app.deviceId).first(),null);}
const consumePattern=f=>new RegExp('^\\s*UPDATE '+tables[f]+'\\s+SET claimed_by');
let B,failed=false;
try{
 await openRuntime();for(const sql of input.base_sql)await db.prepare(sql).run();for(const x of input.journal)await db.prepare('INSERT INTO d1_migrations(id,name)VALUES(?,?)').bind(x.id,x.name).run();await db.batch(MAINTENANCE_V2_DDL.map(sql=>db.prepare(sql)));
 await db.prepare("INSERT INTO sync_account_runtime_control(singleton_id,rollout_mode,account_admission_enabled,membership_admission_enabled,account_read_enabled,account_recovery_enabled,account_delete_enabled,port_orchestration_enabled,generation,updated_at)VALUES(1,'open',1,1,1,1,1,1,1,1)").run();
 const now=Date.now();await db.prepare("INSERT INTO pro_auth_state(singleton_id,generation,active_code_slot,legacy_compat_enabled,updated_at,session_lifecycle_started_at,unbound_backend_until)VALUES(1,1,'A',1,?,?,?)").bind(now,now-1,now+86400000).run();
 await activate(writer);await activate(security);env=environment();http=makeHttp();B=await seedAccount();
 await test('memberships POST first pending and GET reuse native owner; invalid/foreign credential refused',async()=>{await prepareMember(B);assert.equal((await http.fetch(request('/v2/accounts/memberships',null,{credential:B.credential}))).status,200);assert.equal((await http.fetch(request('/v2/accounts/memberships',{operationId:randomUUID(),appId:'pitch'}))).status,401);assert.equal((await http.fetch(request('/v2/accounts/memberships'))).status,401);});
 for(const family of Object.keys(paths)){
  await test(family+' issue / consume real HMAC owner, exact parent-child result, no credential in reconcile',async()=>{
   const g=await grant(family),c=await consume(g);assert.equal(c.response.status,201);const payload=await c.response.json();assert.equal(payload.accountId,g.a.id);assert.equal((await grantRow(g)).consume_operation_id,c.body.operationId);
   const meta=await http.reconcile(c.req.clone());assert.equal(meta.status,200);const text=await meta.text();assert(text.includes('joined')||text.includes('activated'));assert(!text.includes(c.body.accountCredential));assert(!text.includes(c.body.appDeviceCredential||'NEVER-SENT'));assert.equal((await http.fetch(c.req.clone())).status,409);
  });
  await test(family+' explicit cancel ownership and consumed rejection',async()=>{
   const g=await grant(family);assert.equal((await http.fetch(cancelRequest(g,B))).status,404);assert.equal((await http.fetch(cancelRequest(g))).status,200);const c=await consume(g);assert.equal(c.response.status,409);await assertNotJoined(g,c);
   const h=await grant(family);assert.equal((await consume(h)).response.status,201);assert.equal((await http.fetch(cancelRequest(h))).status,409);
  });
  if(family!=='handoff')await test(family+' GET is issuer-only exact-ID status, not list',async()=>{const g=await grant(family);assert.equal((await http.fetch(request(paths[family]+'?invitationId='+g.id,null,{credential:g.a.credential}))).status,200);assert.equal((await http.fetch(request(paths[family]+'?invitationId='+g.id,null,{credential:B.credential}))).status,404);assert.equal((await http.fetch(request(paths[family],null,{credential:g.a.credential}))).status,400);});
  await test(family+' expired / tampered proof / foreign existing Account credential never joins',async()=>{
   const g=await grant(family);const foreign=await consumeRequest(g,{accountCredential:B.credential});const r=await http.fetch(foreign.req.clone());assert(r.status>=400);assert.equal((await grantRow(g)).consumed_at,null);assert.equal((await db.prepare('SELECT revoked_at FROM sync_account_devices WHERE id=?').bind(B.deviceId).first()).revoked_at,null);
   const bad=await consumeRequest(g,g.family==='handoff'?{handoffToken:createAccountHandoff().handoffToken}:{joinCode:createAppJoinCode()});assert((await http.fetch(bad.req)).status>=400);
   await db.prepare(`UPDATE ${tables[family]} SET expires_at=created_at+1 WHERE ${family==='handoff'?'handoff_id':'invitation_id'}=?`).bind(g.id).run();const c=await consume(g);assert.equal(c.response.status,409);await assertNotJoined(g,c);
  });
  await test(family+' delayed issuer revocation / old A cannot alter B',async()=>{
   const g=await grant(family),c=await consumeRequest(g),p=pauseBusiness(consumePattern(family));const running=makeHttp(instrument(db,p.hooks)).fetch(c.req.clone());await p.ready;
   const bBefore=await db.prepare('SELECT * FROM sync_account_devices WHERE id=?').bind(B.deviceId).first();assert.equal((await http.fetch(request('/v2/accounts/devices/revoke',{operationId:randomUUID(),accountDeviceId:g.a.deviceId},{credential:g.a.credential}))).status,200);
   p.release();assert.equal((await running).status,503);await assertNotJoined(g,c);assert.deepEqual(await db.prepare('SELECT * FROM sync_account_devices WHERE id=?').bind(B.deviceId).first(),bBefore);assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:B.credential}))).status,200);await closePending(c.req);
  });
  await test(family+' cancel races native business batch; complete rollback',async()=>{const g=await grant(family),c=await consumeRequest(g),p=pauseBusiness(consumePattern(family));const running=makeHttp(instrument(db,p.hooks)).fetch(c.req.clone());await p.ready;assert.equal((await http.fetch(cancelRequest(g))).status,200);p.release();assert.equal((await running).status,503);await assertNotJoined(g,c);await closePending(c.req);});
  await test(family+' generation drift fences commit, preserving pending and no false receipt',async()=>{
   const g=await grant(family),c=await consumeRequest(g),p=pauseBusiness(consumePattern(family));const running=makeHttp(instrument(db,p.hooks)).fetch(c.req.clone());await p.ready;
   if(family==='port')await db.prepare('UPDATE sync_accounts SET generation=generation+1 WHERE id=?').bind(g.a.id).run();else await db.prepare('UPDATE sync_account_memberships SET generation=generation+1 WHERE account_id=?').bind(g.a.id).run();p.release();assert.equal((await running).status,503);await assertNotJoined(g,c);assert(await registered(c.body.operationId));await closePending(c.req);
  });
  await test(family+' UPDATE0 cannot commit device/link or successful receipt',async()=>{
   const g=await grant(family),c=await consumeRequest(g),hooks={matches:ss=>ss.some(s=>consumePattern(family).test(s)),zeroSQL:consumePattern(family)};assert.equal((await makeHttp(instrument(db,hooks)).fetch(c.req.clone())).status,503);await assertNotJoined(g,c);assert(await registered(c.body.operationId));await closePending(c.req);
  });
  await test(family+' concurrent claim from two adapter instances has one winner',async()=>{const g=await grant(family),a=await consumeRequest(g),b=await consumeRequest(g);const responses=await Promise.all([makeHttp().fetch(a.req.clone()),makeHttp().fetch(b.req.clone())]);assert.equal(responses.filter(r=>r.status===201).length,1);const winner=responses[0].status===201?a:b,loser=winner===a?b:a;assert.equal((await grantRow(g)).consume_operation_id,winner.body.operationId);assert.equal(await db.prepare('SELECT id FROM sync_account_devices WHERE id=?').bind(loser.account.deviceId).first(),null);await closePending(loser.req);});
  await test(family+' ACK loss / duplicate / changed digest / explicit reopen reconcile',async()=>{
   const g=await grant(family),c=await consumeRequest(g),hooks={matches:ss=>ss.some(s=>consumePattern(family).test(s)),loseAck:true};assert.equal((await makeHttp(instrument(db,hooks)).fetch(c.req.clone())).status,503);assert.equal((await grantRow(g)).consume_operation_id,c.body.operationId);
   await mf.dispose();mf=null;await openRuntime();env=environment();http=makeHttp();const meta=await http.reconcile(c.req.clone());assert.equal(meta.status,200);assert((await meta.text()).includes('historical-owner-facts-only'));assert.equal((await http.fetch(c.req.clone())).status,409);assert.equal((await http.fetch(request(paths[family]+'/consume',{...c.body,deviceLabel:'changed'}))).status,503);await closePending(c.req);
  });
 }
 await test('active App membership reconnect preserves canonical user and generation',async()=>{const g=await grant('app',null,{active:true}),before=await db.prepare('SELECT sync_user_id,generation FROM sync_account_memberships WHERE account_id=?').bind(g.a.id).first();assert.equal((await consume(g)).response.status,201);assert.deepEqual(await db.prepare('SELECT sync_user_id,generation FROM sync_account_memberships WHERE account_id=?').bind(g.a.id).first(),before);});
 await test('existing_chord / QA modes stop before legacy activity',async()=>{const g=await grant('app'),c=await consumeRequest(g,{consumeMode:'existing_chord',appId:'chord'});const before=await count('sync_maintenance_v2_operations');assert.equal((await http.fetch(c.req)).status,503);assert.equal(await count('sync_maintenance_v2_operations'),before);const q=await consumeRequest(g,{qaCredential:'invalid-synthetic'});assert.equal((await http.fetch(q.req)).status,503);assert.equal(await count('sync_maintenance_v2_operations'),before);});
 await test('member reprepare after deletion stays HOLD without proving scheduled purge',async()=>{const a=await seedAccount();await prepareMember(a);await db.prepare("UPDATE sync_account_memberships SET state='deleted',sync_user_id=NULL,delete_requested_at=1,purge_after=2 WHERE account_id=?").bind(a.id).run();assert.equal((await http.fetch(request('/v2/accounts/memberships',{operationId:randomUUID(),appId:'pitch'},{credential:a.credential}))).status,503);});
 await test('production initial handoff not invented',async()=>{const a=await seedAccount();await prepareMember(a);const h=createAccountHandoff();assert((await http.fetch(request(paths.handoff,{operationId:randomUUID(),appId:'pitch',handoffToken:h.handoffToken},{credential:a.credential}))).status>=400);});
 for(const family of Object.keys(paths)){
  await test(family+' live SQL expiry rejects a request admitted before its deadline',async()=>{
   const g=await grant(family);const table=tables[family],key=family==='handoff'?'handoff_id':'invitation_id';
   const expiry=Date.now()+3000;await db.prepare(`UPDATE ${table} SET expires_at=? WHERE ${key}=?`).bind(expiry,g.id).run();
   const c=await consumeRequest(g),p=pauseBusiness(consumePattern(family)),running=makeHttp(instrument(db,p.hooks)).fetch(c.req.clone());await p.ready;
   await new Promise(r=>setTimeout(r,Math.max(0,expiry-Date.now()+20)));p.release();assert.equal((await running).status,503);await assertNotJoined(g,c);await closePending(c.req);
  });
  await test(family+' Recovery cancels old grant and preserves normal B owner',async()=>{
   const g=await grant(family),next=createAccountCredential(),claim=createAccountRecoveryClaim();
   const body={operationId:randomUUID(),claimToken:claim.claimToken,accountCredential:next.credential,recoveryCode:g.a.recovery,nextRecoveryCode:createAccountRecoveryCode(),turnstileToken:'synthetic',deviceLabel:'recovery'};
   assert.equal((await http.fetch(request('/v2/accounts/recovery/prepare',body))).status,201);
   assert.equal((await http.fetch(request('/v2/accounts/recovery/commit',{operationId:randomUUID(),claimToken:claim.claimToken,accountCredential:next.credential}))).status,201);
   const c=await consume(g);assert(c.response.status>=400);await assertNotJoined(g,c);assert.equal((await http.fetch(request('/v2/accounts/summary',null,{credential:B.credential}))).status,200);
  });
 }
 await test('Port INSERT0 with grant UPDATE1 rolls back the entire native transaction',async()=>{
  const g=await grant('port'),c=await consumeRequest(g),hooks={matches:ss=>ss.some(s=>consumePattern('port').test(s)),zeroSQL:/^\s*INSERT INTO sync_account_devices/};
  assert.equal((await makeHttp(instrument(db,hooks)).fetch(c.req.clone())).status,503);await assertNotJoined(g,c);await closePending(c.req);
 });
 for(const family of ['app','handoff'])await test(family+' ready managed-user binding change cannot create an orphan environment',async()=>{
  const g=await grant(family,null,{active:true}),c=await consumeRequest(g),p=pauseBusiness(consumePattern(family));const running=makeHttp(instrument(db,p.hooks)).fetch(c.req.clone());await p.ready;
  await db.prepare('UPDATE sync_datasets SET state=\'initializing\' WHERE user_id=(SELECT sync_user_id FROM sync_account_memberships WHERE account_id=?)').bind(g.a.id).run();p.release();assert.equal((await running).status,503);await assertNotJoined(g,c);await closePending(c.req);
 });
 await test('App initial membership UPDATE0 rolls back new canonical user and credentials',async()=>{
  const g=await grant('app'),c=await consumeRequest(g),users=await count('sync_users'),hooks={matches:ss=>ss.some(s=>consumePattern('app').test(s)),zeroSQL:/^\s*UPDATE sync_account_memberships\s+SET state/};
  assert.equal((await makeHttp(instrument(db,hooks)).fetch(c.req.clone())).status,503);await assertNotJoined(g,c);assert.equal(await count('sync_users'),users);await closePending(c.req);
 });
 await test('managed-user ownership loss at reconnect final fence remains fail-closed',async()=>{
  const g=await grant('app',null,{active:true}),c=await consumeRequest(g),p=pauseBusiness(consumePattern('app'));const running=makeHttp(instrument(db,p.hooks)).fetch(c.req.clone());await p.ready;
  await db.prepare('DELETE FROM sync_account_managed_users WHERE account_id=?').bind(g.a.id).run();p.release();assert.equal((await running).status,503);await assertNotJoined(g,c);await closePending(c.req);
 });
 await test('reconnect environment limit race rolls back newly inserted Account/link/grant',async()=>{
  const g=await grant('app',null,{active:true}),c=await consumeRequest(g),p=pauseBusiness(consumePattern('app'));const running=makeHttp(instrument(db,p.hooks)).fetch(c.req.clone());await p.ready;
  for(let i=0;i<9;i++)await seedApp(g.a);p.release();assert.equal((await running).status,503);await assertNotJoined(g,c);await closePending(c.req);
 });
 await test('grant request cannot select a foreign membership or smuggle Account identity',async()=>{
  const g=await grant('app'),c=await consumeRequest(g,{appId:'chord'});assert((await http.fetch(c.req)).status>=400);assert.equal((await grantRow(g)).consumed_at,null);
  const extra=await consumeRequest(g,{accountId:B.id});assert.equal((await http.fetch(extra.req)).status,400);assert.equal((await grantRow(g)).consumed_at,null);
 });
 await test('writer stop during consume and after stop blocks issuance but preserves cancel and B observations',async()=>{
  const gs=[];for(const f of Object.keys(paths))gs.push(await grant(f));const c=await consumeRequest(gs[0]),p=pauseBusiness(consumePattern('app'));const running=makeHttp(instrument(db,p.hooks)).fetch(c.req.clone());await p.ready;await admin.stop(controlReq('stop',writer,4));p.release();assert.equal((await running).status,503);await assertNotJoined(gs[0],c);await closePending(c.req);
  for(const g of gs){assert.equal((await consume(g)).response.status,423);assert.equal((await http.fetch(cancelRequest(g))).status,200);const body={...g.body,operationId:randomUUID()};assert.equal((await http.fetch(request(paths[g.family],body,{credential:g.a.credential}))).status,423);}
  assert.equal((await http.fetch(request('/v2/accounts/memberships',{operationId:randomUUID(),appId:'pitch'},{credential:(await seedAccount()).credential}))).status,423);assert.equal((await http.fetch(request('/v2/accounts/memberships',null,{credential:B.credential}))).status,200);
 });
 if(process.env.MAINTENANCE_MEMBERSHIP_BROWSER==='true'){const {runOwnerBrowser}=await import('./maintenance-owner-http-browser-fixture.mjs');await runOwnerBrowser({db,env,writerScope:writer,securityScope:security,dependencies,out:OUT,runtime:RUNTIME,bootstrapBody:startBody(),membershipFixture:{credential:(await seedAccount()).credential}});}
}catch(e){failed=true;result.failure=String(e.stack||e);console.log('FAIL '+result.failure);}
finally{if(mf)await mf.dispose();result.summary={pass:result.tests.filter(x=>x.status==='PASS').length,fail:result.tests.filter(x=>x.status==='FAIL').length,skip:0};fs.writeFileSync(path.join(OUT,'MEMBERSHIP-NATIVE-RESULT.json'),JSON.stringify(result,null,2)+'\n');}
if(failed)process.exitCode=1;
