import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {createIsolatedMaintenanceBridgeV2,maintenanceDigest,maintenanceCanonical} from '../src/maintenance-bridge-v2.js';
import {createIsolatedMaintenanceBpmAdapter} from '../src/maintenance-v2-bpm-adapter.js';
import {MAINTENANCE_V2_DDL} from '../src/maintenance-v2-schema.js';
import {createD1SyncRepository} from '../src/sync-database.js';
const OUT=process.env.MAINTENANCE_V2_EVIDENCE_DIR,RUNTIME=process.env.MAINTENANCE_V2_RUNTIME_PACKAGE;
if(!OUT||!RUNTIME)throw Error('Explicit disposable evidence dir and local runtime package required');
const {Miniflare,convertV4MiniflareOptions}=createRequire(RUNTIME)('miniflare');
const fixture=JSON.parse(fs.readFileSync(new URL('../test/fixtures/maintenance-v2-schema33.json',import.meta.url)));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const result={scope:'Isolated Bridge v2 core + trusted BPM owner adapter, NOT Full Bridge/production handover',started:new Date().toISOString(),tests:[],productionAccess:false,remoteBindings:false};
let mf,db,r2,ackRequest;
async function openRuntime(){mf=new Miniflare(convertV4MiniflareOptions({name:'maintenance-v2-native',modules:true,script:'export default {fetch(){return new Response("fixture-only")}}',compatibilityDate:'2026-09-01',cf:false,d1Databases:{DB:'core',DRIFT:'drift',STAGES:'stages'},r2Buckets:['R2'],resourcePersistencePath:path.join(OUT,'native-final-local-state'),resourceTmpPath:path.join(OUT,'native-final-local-tmp'),outboundService:()=>{throw Error('external network forbidden')}}));db=await mf.getD1Database('DB');r2=await mf.getR2Bucket('R2');}
const st=(d,sql,...v)=>d.prepare(sql).bind(...v);
async function base(d){for(const sql of fixture.base_sql)await d.prepare(sql).run();for(const q of fixture.journal)await st(d,'INSERT INTO d1_migrations(id,name) VALUES (?,?)',q.id,q.name).run();await d.batch(MAINTENANCE_V2_DDL.map(sql=>d.prepare(sql)));}
function identity(letter){return {ownerId:'port-account-owner-fixture',accountId:'account-'+letter,membershipId:'member-'+letter,syncUserId:'user-'+letter,deviceId:letter==='a'?'323e4567-e89b-42d3-a456-426614174000':'423e4567-e89b-42d3-a456-426614174000',datasetId:'port:metronome_settings',accountGeneration:1,membershipGeneration:1,credentialVersion:1,writerEpoch:1,proGeneration:1};}
const a=identity('a'),b=identity('b'),legacy=i=>({userId:i.syncUserId,deviceId:i.deviceId,appId:'port'});
async function seed(d,i){await d.batch([
st(d,"INSERT INTO sync_accounts(id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,recovery_created_at,recovery_rotated_at,admission_provenance) VALUES (?,'active',1,?,1,1,1,1,1,'production')",i.accountId,hash(i.accountId)),
st(d,"INSERT INTO sync_users(id,state,recovery_version,recovery_verifier,created_at,updated_at,recovery_created_at,recovery_rotated_at) VALUES (?,'active',1,?,1,1,1,1)",i.syncUserId,hash(i.syncUserId)),
st(d,"INSERT INTO sync_devices(id,user_id,app_id,credential_version,credential_verifier,last_cursor,created_at,last_seen_at,paired_at) VALUES (?,?,'port',1,?,0,1,1,1)",i.deviceId,i.syncUserId,hash(i.deviceId)),
st(d,"INSERT INTO sync_account_memberships(id,account_id,app_id,state,sync_user_id,recovery_mode,generation,created_at,activated_at,updated_at) VALUES (?,?,'port','active',?,'account',1,1,1,1)",i.membershipId,i.accountId,i.syncUserId),
st(d,"INSERT INTO sync_account_managed_users(sync_user_id,account_id,membership_id,app_id,created_at) VALUES (?,?,?,'port',1)",i.syncUserId,i.accountId,i.membershipId),
st(d,"INSERT INTO sync_datasets(user_id,app_id,state,schema_version,record_count,min_change_seq,updated_at,last_change_seq) VALUES (?,'port','ready',1,0,0,1,0)",i.syncUserId),
st(d,"INSERT INTO pro_credentials(id,verifier,generation,scope,created_at,device_public_key,lease_expires_at) VALUES (?, ?,1,'global_pro',1,?,100000)",'pro-'+i.accountId,hash('pro-'+i.accountId),'synthetic-'+i.deviceId)
]);}
function owner(overrides={}){
 return {
  id:'port-account-owner-fixture',
  async verify(r,purpose){return {allowed:true,identityDigest:await maintenanceDigest(r.identity),assertions:[{
   sql:`SELECT CASE WHEN EXISTS(SELECT 1 FROM sync_accounts a
    JOIN sync_account_memberships m ON m.account_id=a.id
    JOIN sync_devices d ON d.user_id=m.sync_user_id
    JOIN pro_credentials p ON p.id=?
    WHERE a.id=? AND a.state='active' AND a.generation=? AND m.id=? AND m.state='active' AND m.generation=?
    AND d.id=? AND d.revoked_at IS NULL AND d.credential_version=?
    AND p.revoked_at IS NULL AND p.generation=? AND p.lease_expires_at>100)
    THEN 1 ELSE 0 END AS ok`,
   params:['pro-'+r.identity.accountId,r.identity.accountId,r.identity.accountGeneration,r.identity.membershipId,r.identity.membershipGeneration,r.identity.deviceId,r.identity.credentialVersion,r.identity.proGeneration]
  }]};},
  async verifyHandover(r){return r.evidence?.environment==='isolated'&&r.evidence?.oldInflightExcluded===hash('synthetic-exclusive-proof');},
  async verifyRecovery(r,source){return {allowed:r.outcome?.verifiedBy==='synthetic-owner-readback',sourceDigest:await maintenanceDigest(source),outcomeDigest:await maintenanceDigest(r.outcome)};},
  ...overrides
 };
}
const bridge=(d=db,o=owner())=>createIsolatedMaintenanceBridgeV2({db:d,owner:o,clock:()=>200});
const req=(kind,scope,epoch,i=a,extra={})=>({kind,scope,expectedEpoch:epoch,operationId:randomUUID(),identity:i,...extra});
async function bootstrap(scope,d=db){await st(d,"INSERT INTO sync_maintenance_v2_control(scope,contract_version,epoch,phase,updated_at) VALUES (?,2,1,'closed',1)",scope).run();}
async function activate(scope,d=db){
 await bootstrap(scope,d);const x=bridge(d),stop=req('stop',scope,1);await x.stop(stop);
 const e=Object.fromEntries(['oldIngressExcluded','oldVersionsExcluded','oldScheduledExcluded','externalWritersExcluded','oldInflightExcluded','partialResultsExcluded','newClaimsAbsent','unknownResultsAbsent'].map(k=>[k,hash('synthetic-exclusive-proof')]));
 const hand=req('handover',scope,2,a,{stopOperationId:stop.operationId,evidence:{...e,environment:'isolated',inventoryDigest:hash('inventory'),sourceDigest:hash('source')}});
 await x.handover(hand);const start=req('open',scope,3,a,{handoverOperationId:hand.operationId});await x.open(start);
 return {x,epoch:4,stop,hand,start};
}
function op(recordId,revision=0){const payload={id:recordId,value:{bpm:123}},id=randomUUID();return {operationId:id,recordType:'metronome_settings',recordId,baseRevision:revision,schemaVersion:1,deleted:false,payload,payloadHash:hash(payload),operationHash:hash({id,recordId,revision,payload})};}
async function save(scope,epoch,i=a,operation=op(randomUUID()),d=db){
 return createIsolatedMaintenanceBpmAdapter({bridge:bridge(d),clock:()=>1000}).save({scope,expectedEpoch:epoch,identity:i,legacyIdentity:legacy(i),operation});
}
function mutation(scope,epoch,i=a){return req('mutation',scope,epoch,i,{action:{id:randomUUID(),purpose:'synthetic primitive test'}});}
const always={sql:'SELECT 1 AS ok',params:[]}; // Only primitive tests; real BPM adapter uses a fixed typed outcome.
async function count(d= db){return (await d.prepare('SELECT COUNT(*) n FROM sync_records').first()).n;}
async function test(name,fn){try{await fn();result.tests.push({name,status:'PASS'});console.log('PASS '+name);}catch(e){result.tests.push({name,status:'FAIL',error:String(e.stack||e)});throw e;}}
let failed=false;
try{
 await openRuntime();await base(db);
 await st(db,"INSERT INTO pro_auth_state(singleton_id,generation,active_code_slot,legacy_compat_enabled,updated_at) VALUES (1,1,'A',1,0)").run();
 await seed(db,a);await seed(db,b);
 await test('0033+metadata exact schema classified; missing scope/default closed deny',async()=>{
  assert.equal(await bridge().checkSchema(),33);await bootstrap('default');
  assert.equal((await bridge().inspect('default')).state,'closed');
  await assert.rejects(save('default',1));await assert.rejects(bridge().stop(req('stop','missing',1)));
 });
 await test('duplicate metadata schema aborts without journal changes',async()=>{
  await assert.rejects(db.batch(MAINTENANCE_V2_DDL.map(sql=>db.prepare(sql))));
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM d1_migrations').first()).n,33);
 });
 await test('metadata partial trigger missing and exact literal tamper refused',async()=>{
  const d=await mf.getD1Database('DRIFT');await base(d);
  const trigger=MAINTENANCE_V2_DDL.find(x=>x.startsWith('CREATE TRIGGER maintenance_v2_control_delete'));
  await d.prepare('DROP TRIGGER maintenance_v2_control_delete').run();await assert.rejects(bridge(d).checkSchema());
  await d.prepare(trigger.replace('maintenance control retained','MAINTENANCE control retained')).run();
  await assert.rejects(bridge(d).checkSchema());
 });
 await test('stop epoch CAS, zero-row/missing control and replay digest bound',async()=>{
  await bootstrap('stop-cas');const x=bridge(),r=req('stop','stop-cas',1);const s=await x.stop(r);assert.equal(s.receipt.nextEpoch,2);
  assert.equal((await x.stop(r)).status,'historical');
  await assert.rejects(x.stop({...r,reason:'different'}));await assert.rejects(x.stop(req('stop','stop-cas',1)));
  assert.equal((await x.inspect('stop-cas')).control.epoch,2);
 });
 await test('stop ACK loss reconciles fixed operation without epoch bump or resending',async()=>{
  await bootstrap('stop-ack');const r=req('stop','stop-ack',1);let drop=true;
  const d={prepare:sql=>db.prepare(sql),batch:async body=>{const out=await db.batch(body);if(drop){drop=false;throw Error('synthetic ack lost');}return out;}};
  await assert.rejects(bridge(d).stop(r));assert.equal((await bridge().stop(r)).status,'historical');
  assert.equal((await bridge().inspect('stop-ack')).control.epoch,2);
 });
 await test('handover requires exact source/stop/evidence; empty registry or fixed wait insufficient',async()=>{
  await bootstrap('handover-hold');const x=bridge(),s=req('stop','handover-hold',1);await x.stop(s);
  await assert.rejects(x.open(req('open','handover-hold',2,a,{handoverOperationId:randomUUID()})));
  await assert.rejects(x.handover(req('handover','handover-hold',2,a,{stopOperationId:s.operationId,evidence:{environment:'isolated',waitMs:999999}})));
  assert.equal((await x.inspect('handover-hold')).initialProductionHandover,'UNPROVEN');
 });
 await test('synthetic complete handover receipt opens only exact isolated epoch',async()=>{
  const {x,hand}=await activate('normal');const c=await x.inspect('normal');assert.equal(c.control.epoch,4);assert.equal(c.control.handover_id,hand.operationId);
  assert.equal(c.initialProductionHandover,'UNPROVEN');
  await assert.rejects(st(db,"UPDATE sync_maintenance_v2_control SET phase='open',epoch=epoch+1,transition_id=NULL WHERE scope='normal'").run());
 });
 await test('existing Port repository BPM normal B commits and typed historical receipt remains distinct from auth',async()=>{
  const operation=op('normal-b');const saved=await save('normal',4,b,operation);assert.equal(saved.status,'committed');assert.equal(saved.value.status,'applied');
  const historical=await save('normal',4,b,operation);assert.equal(historical.status,'historical');
  assert.equal((await st(db,'SELECT COUNT(*) n FROM sync_changes WHERE operation_id=?',operation.operationId).first()).n,1);
 });
 await test('operation UUID/digest/Account/device/generation substitutions refused',async()=>{
  const operation=op('binding');await save('normal',4,a,operation);
  await assert.rejects(save('normal',4,a,{...operation,payload:{id:'binding',value:{bpm:88}}}));
  await assert.rejects(save('normal',4,b,operation));await assert.rejects(save('normal',4,{...a,deviceId:b.deviceId},operation));
  await assert.rejects(save('normal',4,{...a,accountGeneration:2},op('wrong-generation')));
 });
 await test('Pro revocation between admission and final SQL rejects without corrupting B',async()=>{
  await activate('revoke');const x=bridge(),r=mutation('revoke',4),n=await count();
  await assert.rejects(x.execute(r,{outcome:always,run:async d=>{
   await st(db,'UPDATE pro_credentials SET revoked_at=200 WHERE id=?','pro-'+a.accountId).run();
   return d.prepare("UPDATE sync_devices SET last_seen_at=201 WHERE id=?").bind(a.deviceId).run();
  }}));assert.equal(await count(),n);
  await st(db,'UPDATE pro_credentials SET revoked_at=NULL WHERE id=?','pro-'+a.accountId).run();
  assert.equal((await save('normal',4,b,op('b-after-a-revoke'))).status,'committed');
 });
 await test('admission before stop and commit after stop refuses in another instance',async()=>{
  await activate('race');const x=bridge(),r=mutation('race',4);let entered,release;const ready=new Promise(v=>entered=v),pause=new Promise(v=>release=v);
  const pending=x.execute(r,{outcome:always,run:async d=>{entered();await pause;return d.prepare('UPDATE sync_devices SET last_seen_at=300 WHERE id=?').bind(a.deviceId).run();}});
  await ready;await bridge().stop(req('stop','race',4));release();await assert.rejects(pending);
  assert.notEqual((await st(db,'SELECT last_seen_at FROM sync_devices WHERE id=?',a.deviceId).first()).last_seen_at,300);
  assert.equal((await bridge().inspect('race')).state,'HOLD');await assert.rejects(save('race',4));
 });
 await test('owner exceptions, malformed result, missing SQL and accessor proofs fail closed',async()=>{
  for(const verify of [async()=>null,async()=>({allowed:true}),async()=>{throw Error('owner timeout');},async()=>Object.defineProperty({},'allowed',{get(){return true;}})]){
   await assert.rejects(bridge(db,owner({verify})).execute(mutation('normal',4),{outcome:always,run:()=>{throw Error('must not execute');}}));
  }
 });
 await test('false typed outcome rolls back SQL without committed receipt',async()=>{
  await activate('zero');const r=mutation('zero',4),n=await count();
  await assert.rejects(bridge().execute(r,{outcome:{sql:'SELECT 0 AS ok',params:[]},run:d=>d.prepare('UPDATE sync_devices SET last_seen_at=999 WHERE id=?').bind(a.deviceId).run()}));
  assert.notEqual((await st(db,'SELECT last_seen_at FROM sync_devices WHERE id=?',a.deviceId).first()).last_seen_at,999);assert.equal(await count(),n);
  assert.equal((await st(db,'SELECT phase FROM sync_maintenance_v2_operations WHERE operation_id=?',r.operationId).first()).phase,'registered');
 });
 await test('raw/session/PRAGMA/DDL escapes and foreign statements refused before SQL',async()=>{
  for(const sql of ['PRAGMA ignore_check_constraints=ON','CREATE TABLE bypass(id)','DROP TABLE sync_devices','BEGIN']){
   await assert.rejects(bridge().execute(mutation('normal',4),{outcome:always,run:d=>d.prepare(sql).run()}));
  }
  for(const invoke of [d=>d.exec('DELETE FROM sync_users'),d=>d.withSession(),d=>d.batch([db.prepare('DELETE FROM sync_users')])]){
   await assert.rejects(bridge().execute(mutation('normal',4),{outcome:always,run:invoke}));
  }
 });
 await test('mutation RETURNING first/all goes through final fence; GET activity is tracked',async()=>{
  const r=mutation('normal',4);const out=await bridge().execute(r,{outcome:{sql:'SELECT CASE WHEN last_seen_at=401 THEN 1 ELSE 0 END ok FROM sync_devices WHERE id=?',params:[a.deviceId]},run:d=>d.prepare('UPDATE sync_devices SET last_seen_at=401 WHERE id=? RETURNING last_seen_at').bind(a.deviceId).first()});
  assert.equal(out.value.last_seen_at,401);
  const q=mutation('normal',4);const all=await bridge().execute(q,{outcome:{sql:'SELECT CASE WHEN last_seen_at=402 THEN 1 ELSE 0 END ok FROM sync_devices WHERE id=?',params:[a.deviceId]},run:d=>d.prepare('UPDATE sync_devices SET last_seen_at=402 WHERE id=? RETURNING last_seen_at').bind(a.deviceId).all()});assert.equal(all.value.results[0].last_seen_at,402);
 });
 await test('commit ACK loss remains unknown to caller then explicit receipt readback succeeds',async()=>{
  await activate('commit-ack');let drop=false;const d={prepare:sql=>db.prepare(sql),batch:async body=>{const x=await db.batch(body);if(drop){drop=false;throw Error('synthetic commit ack lost');}return x;}};
  const r=mutation('commit-ack',4);ackRequest=r;
  await assert.rejects(bridge(d).execute(r,{outcome:always,run:protectedDb=>{drop=true;return protectedDb.prepare('UPDATE sync_devices SET last_seen_at=500 WHERE id=?').bind(a.deviceId).run();}}));
  assert.equal((await bridge().reconcile(r)).status,'historical');
 });
 await test('external pending is durable before R2; deletion/SQL partial unknown keeps pending and blocks drain',async()=>{
  await activate('external');const x=bridge(),r=req('external','external',4,a,{action:{kind:'synthetic-object-delete'}}),pending={sourceManifestDigest:hash('source'),objectDigest:hash('bytes'),objectKey:'synthetic-object'};
  await r2.put('synthetic-object','synthetic bytes');
  r.pendingDigest=await maintenanceDigest(pending);
  await assert.rejects(x.externalIntent(r,{...pending,objectKey:'other-object'}));
  const fact=await x.externalIntent(r,pending);assert.equal(fact.status,'external_pending');
  assert.equal((await st(db,'SELECT phase FROM sync_maintenance_v2_operations WHERE operation_id=?',r.operationId).first()).phase,'external_pending');
  await r2.delete('synthetic-object');await x.stop(req('stop','external',4));await x.recordExternalUnknown(r);
  assert.equal((await x.reconcile(r)).status,'unknown');assert.equal((await x.inspect('external')).state,'HOLD');
  await assert.rejects(x.externalIntent(r,pending));
  await assert.rejects(st(db,"UPDATE sync_maintenance_v2_operations SET pending_json='{}' WHERE operation_id=?",r.operationId).run());
  const source=await st(db,'SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?',r.operationId).first();
  const recovery=req('recovery','external',5,a,{sourceOperationId:r.operationId,sourceRequestDigest:source.request_digest,pendingDigest:source.pending_digest,outcome:{verifiedBy:'synthetic-owner-readback',state:'external-deleted-local-unapplied'}});
  await assert.rejects(x.recover({...recovery,identity:b}));
  assert.equal((await x.recover(recovery)).status,'committed');
  assert.equal((await x.recover(recovery)).status,'historical');
  const resolved=await st(db,'SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?',r.operationId).first();
  assert.equal(resolved.phase,'resolved');assert.equal(resolved.pending_json,source.pending_json);assert.equal(resolved.resolved_by,recovery.operationId);
 });
 await test('operation registration lost or zero business rows never bypass final assertion',async()=>{
  let first=true;
  const d={prepare:sql=>db.prepare(sql),batch:async body=>{if(first){first=false;return db.batch(body.filter((_,index)=>index!==2));}return db.batch(body);}};
  const r=mutation('normal',4);
  await assert.rejects(bridge(d).execute(r,{outcome:always,run:p=>p.prepare('UPDATE sync_devices SET last_seen_at=987 WHERE id=?').bind(a.deviceId).run()}));
  assert.notEqual((await st(db,'SELECT last_seen_at FROM sync_devices WHERE id=?',a.deviceId).first()).last_seen_at,987);
  await assert.rejects(bridge().execute(mutation('normal',4),{outcome:{sql:'SELECT CASE WHEN last_seen_at=986 THEN 1 ELSE 0 END AS ok FROM sync_devices WHERE id=?',params:[a.deviceId]},run:p=>p.prepare('UPDATE sync_devices SET last_seen_at=986 WHERE id=?').bind('missing-device').run()}));
 });
 await test('external-proven source requires exact explicit recovery and preserves pending',async()=>{
  await activate('external-proven');const x=bridge(),r=req('external','external-proven',4,a,{action:{kind:'synthetic-delete'}}),pending={sourceManifestDigest:hash('source2'),objectDigest:hash('bytes2'),objectKey:'synthetic-object2'};
  r.pendingDigest=await maintenanceDigest(pending);await x.externalIntent(r,pending);await st(db,"UPDATE sync_maintenance_v2_operations SET phase='external_proven' WHERE operation_id=?",r.operationId).run();
  await x.stop(req('stop','external-proven',4));const source=await st(db,'SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?',r.operationId).first();
  const recover=req('recovery','external-proven',5,a,{sourceOperationId:r.operationId,sourceRequestDigest:source.request_digest,pendingDigest:source.pending_digest,outcome:{verifiedBy:'synthetic-owner-readback',state:'external-proven-local-unapplied'}});
  assert.equal((await x.recover(recover)).status,'committed');assert.equal((await st(db,'SELECT phase FROM sync_maintenance_v2_operations WHERE operation_id=?',r.operationId).first()).phase,'resolved');
 });
 await test('unknown typed receipt and unrecognized owner are rejected before mutation',async()=>{
  const r=mutation('normal',4),requestDigest=await maintenanceDigest(r),bindingDigest=await maintenanceDigest(r.identity);
  const receipt={type:'mutation',operationId:r.operationId,scope:r.scope,requestDigest,identityDigest:bindingDigest,epoch:4};
  await st(db,"INSERT INTO sync_maintenance_v2_operations(operation_id,scope,epoch,kind,request_digest,binding_json,binding_digest,phase,receipt_json,receipt_digest,created_at,updated_at) VALUES (?, ?,4,'mutation',?,?,?,'committed',?,?,1,1)",r.operationId,r.scope,requestDigest,maintenanceCanonical(r.identity),bindingDigest,maintenanceCanonical(receipt),'a'.repeat(64)).run();
  await assert.rejects(bridge().execute(r,{outcome:always,run:()=>{throw Error('must not execute');}}));
  await assert.rejects(bridge().execute({...mutation('normal',4),identity:{...a,ownerId:'unknown-owner'}},{outcome:always,run:()=>{throw Error('must not execute');}}));
 });
 await test('registry empty does not fence existing untracked v137-compatible repository',async()=>{
  await bootstrap('untracked');assert.equal((await bridge().inspect('untracked')).pending.length,0);
  const applied=await createD1SyncRepository(db,()=>1000).applyOperation(legacy(a),op('untracked-old-writer'));assert.equal(applied.status,'applied');
  assert.equal((await bridge().inspect('untracked')).initialProductionHandover,'UNPROVEN');
 });
 await test('exact metadata core remains compatible at each0034-0037 stage; literal mutation rejected',async()=>{
  const d=await mf.getD1Database('STAGES');await base(d);assert.equal(await bridge(d).checkSchema(),33);
  for(const m of fixture.migrations){await d.batch([...m.statements.map(sql=>d.prepare(sql)),st(d,'INSERT INTO d1_migrations(name) VALUES (?)',m.name)]);assert.equal(await bridge(d).checkSchema(),Number(m.name.slice(0,4)));}
  const trigger=await d.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND sql LIKE '%''port''%' LIMIT 1").first();
  assert(trigger);await d.prepare('DROP TRIGGER '+trigger.name).run();await d.prepare(trigger.sql.replace("'port'","'PORT'")).run();await assert.rejects(bridge(d).checkSchema());
 });
 const saved=await st(db,'SELECT COUNT(*) n FROM sync_changes').first();await mf.dispose();mf=null;await openRuntime();
 await test('native orderly dispose/reopen retains stop receipt, pending evidence and historical save',async()=>{
  assert.equal((await bridge().reconcile(ackRequest)).status,'historical');assert.equal((await bridge().inspect('stop-ack')).control.epoch,2);
  assert.equal((await st(db,'SELECT COUNT(*) n FROM sync_changes').first()).n,saved.n);
  assert.equal((await bridge().inspect('race')).state,'HOLD');
 });
}catch(e){failed=true;result.failure=String(e.stack||e);console.log('FAIL '+result.failure);}
finally{if(mf)await mf.dispose();result.finished=new Date().toISOString();result.summary={pass:result.tests.filter(x=>x.status==='PASS').length,fail:result.tests.filter(x=>x.status==='FAIL').length,skip:0};fs.writeFileSync(path.join(OUT,'NATIVE-RESULT.json'),JSON.stringify(result,null,2)+'\n');}
if(failed)process.exitCode=1;
