// Actual source entry, native SQLite with captured Production DDL, synthetic data only.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import worker from '../src/index.js';import offWorker from '../src/studio-release-entry.js';import canaryWorker from '../src/studio-canary-entry.js';
import {createSqliteD1,seedIdentity} from './sqlite-d1.js';
import {admitWriter,writerMutationDatabase} from '../src/writer-admission.js';
import {createD1SyncRepository} from '../src/sync-database.js';
import {createD1AssetRepository} from '../src/asset-database.js';
import {hashRecord,hashOperation,validateOperation} from '../src/records.js';import {hmacVerifier} from '../src/crypto.js';
import {prepareStudioRelease} from '../scripts/studio-release-plan.mjs';
import {bucket} from './writer-authority-fixture.js';
const metadata=JSON.parse(fs.readFileSync(new URL('./fixtures/studio-production-schema33.json',import.meta.url)));
const proId=crypto.randomUUID(),token='scp1.'+proId+'.'+'P'.repeat(43),pepper='synthetic-pro-0033-key-not-production',devicePepper='synthetic-device-0033-key-not-production';
async function fixture(){
 const db=createSqliteD1({schemaMetadata:metadata}),now=Date.now(),verifier=await hmacVerifier('sound-cruise-pro:v1:'+token,pepper);
 db.raw.prepare("INSERT INTO sync_accounts(id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,admission_provenance) VALUES('account','active',1,?,1,?,?,'production')").run('a'.repeat(64),now,now);
 db.raw.prepare("INSERT INTO sync_account_devices(id,account_id,credential_version,credential_verifier,created_at,last_seen_at) VALUES('account-device','account',1,?,?,?)").run('b'.repeat(64),now,now);
 db.raw.prepare("INSERT INTO pro_auth_state(singleton_id,generation,active_code_slot,legacy_compat_enabled,updated_at,session_lifecycle_started_at,unbound_backend_until) VALUES(1,1,'A',1,?,?,?)").run(now,now,now+600000);
 db.raw.prepare("INSERT INTO pro_credentials(id,verifier,generation,scope,created_at,device_public_key,last_validated_at,lease_expires_at) VALUES(?,?,1,'global_pro',?,'synthetic-bound-key',?,?)").run(proId,verifier,now,now,now+600000);
 db.raw.prepare("INSERT INTO sync_runtime_control VALUES(1,'open',1,1,1,1,1,1,?)").run(now);
 const ids={};for(const appId of ['port','pitch','fretboard','rhythm','chord']){
  const deviceId=crypto.randomUUID(),credential='scd1.'+deviceId+'.'+'D'.repeat(43),dv=await hmacVerifier(credential,devicePepper),i=seedIdentity(db,{userId:appId+'-user',deviceId,appId,verifier:dv});
  db.raw.prepare("UPDATE sync_users SET state='active',recovery_version=1,recovery_verifier=? WHERE id=?").run(appId.padEnd(64,'a'),i.userId);
  db.raw.prepare("UPDATE sync_datasets SET state='ready' WHERE user_id=?").run(i.userId);
  db.raw.prepare("INSERT INTO sync_account_memberships(id,account_id,app_id,state,sync_user_id,recovery_mode,generation,created_at,activated_at,updated_at) VALUES(?,'account',?,'active',?,'account',1,?,?,?)").run(appId+'-member',appId,i.userId,now,now,now);
  db.raw.prepare("INSERT INTO sync_account_managed_users VALUES(?,'account',?,?,?)").run(i.userId,appId+'-member',appId,now);
  db.raw.prepare("INSERT INTO sync_membership_device_links(account_id,membership_id,app_device_id,account_device_id,linked_at) VALUES('account',?,?,'account-device',?)").run(appId+'-member',deviceId,now);
  ids[appId]={...i,credential,dv};
 }
 const env={SYNC_DB:db,SYNC_ASSETS:bucket(),ALLOWED_ORIGINS:'https://soundcruise.jp',ACCOUNT_ALLOWED_ORIGINS:'https://soundcruise.jp',SYNC_CREDENTIAL_PEPPER:devicePepper,PRO_CREDENTIAL_PEPPER:pepper,SYNC_ALLOWED_APP_IDS:'chord,pitch,rhythm,fretboard,port',SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED:'true',SYNC_ACCOUNT_PUBLIC_APP_IDS:'chord,pitch,rhythm,fretboard,port',SYNC_RATE_LIMITER:{limit:async()=>({success:true})},SYNC_ASSET_CLEANUP_ENABLED:'true'};
 const authority=app=>({accountId:'account',membershipId:app+'-member',accountGeneration:1,membershipGeneration:1});
 const options=app=>({deviceVerifier:ids[app].dv,proCredentialId:proId,proVerifier:verifier,proGeneration:1});
 async function call(path,body,app='port',target=worker){return target.fetch(new Request('https://isolated.invalid'+path,{method:body?'POST':'GET',headers:{Origin:'https://soundcruise.jp',Authorization:'Bearer '+ids[app].credential,'X-Sound-Cruise-Pro-Authorization':'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(p){return p;}});}
 return{db,env,ids,authority,options,call};
}
async function operation(app='port',baseRevision=0){const o={operationId:crypto.randomUUID(),recordType:app==='port'?'metronome_settings':'settings',recordId:'default',schemaVersion:1,baseRevision,deleted:false,payload:{id:'default',value:{version:3,bpm:120,meter:'4/4',rhythm:'quarter',sound:'electronic',volume:70,accents:[true,false,false,false]}}};if(app!=='port'){o.recordId='settings';o.payload={id:'settings',values:{theme:'dark'}};}o.payloadHash=await hashRecord(o,crypto,app);const valid=await validateOperation(o,crypto,app);assert.equal(valid.ok,true,app+' fixture must validate');Object.defineProperty(o,'operationHash',{value:await hashOperation(o,crypto,app)});return o;}
test('actual index boots and Port native HTTP Sync works with Project OFF and no newer schema',async()=>{
 const f=await fixture();try{assert.equal((await f.call('/health')).status,200);assert.equal((await f.call('/v2/studio/document',{})).status,404);assert.equal((await f.call('/v2/studio/document',{},'port',offWorker)).status,423);
 const op=await operation();const p=await f.call('/v1/sync/push',{appId:'port',mode:'sync',operations:[op]});const b=await p.json();assert.equal(p.status,200,JSON.stringify(b));assert.equal(b.results[0].status,'applied');
 const r=await f.call('/v1/sync/snapshot?appId=port');assert.equal(r.status,200);assert.equal((await r.json()).records.length,1);
 for(const target of [offWorker,canaryWorker]){assert.equal((await f.call('/health',undefined,'port',target)).status,200);assert.equal((await f.call('/v1/sync/snapshot?appId=port',undefined,'port',target)).status,200);}
 const duplicate=await(await f.call('/v1/sync/push',{appId:'port',mode:'sync',operations:[op]})).json();assert.equal(duplicate.results[0].status,'duplicate');
 assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sqlite_schema WHERE name GLOB 'studio_document_*' OR name GLOB 'sync_authority_*' OR name='sync_writer_fence_assertion'").get().n,0);
 }finally{f.db.close();}
});
for(const [name,sql]of [
 ['Account generation',"UPDATE sync_accounts SET generation=2"],['Account deleted',"UPDATE sync_accounts SET state='deleted'"],['membership generation',"UPDATE sync_account_memberships SET generation=2 WHERE app_id='port'"],
 ['AppDevice revoke',"UPDATE sync_devices SET revoked_at=1 WHERE app_id='port'"],['AppDevice credential changed',"UPDATE sync_devices SET credential_verifier='changed' WHERE app_id='port'"],['Account Device revoke',"UPDATE sync_account_devices SET revoked_at=1"],
 ['Pro revoke',"UPDATE pro_credentials SET revoked_at=1"],['Pro generation',"UPDATE pro_auth_state SET generation=2"],['Pro lease expiry',"UPDATE pro_credentials SET lease_expires_at=1"],['Pro idle expiry',"UPDATE pro_credentials SET last_validated_at=1"]
])test('final SQL rejects '+name+' after admission with no record/change publication',async()=>{
 const f=await fixture();try{const admission=await admitWriter(f.db,f.ids.port,{},f.authority('port'),f.options('port')),guarded=writerMutationDatabase(f.db,admission),original=f.db.batch.bind(f.db);let once=true;f.db.batch=async ss=>{if(once){once=false;f.db.raw.exec(sql);}return original(ss);};
 await assert.rejects(createD1SyncRepository(guarded).applyOperation(f.ids.port,await operation()));assert.equal(f.db.raw.prepare('SELECT count(*) n FROM sync_records').get().n,0);assert.equal(f.db.raw.prepare('SELECT count(*) n FROM sync_changes').get().n,0);
 }finally{f.db.close();}
});
test('all four apps retain native source snapshots/mutation CAS with the same Account',async()=>{
 const f=await fixture();try{for(const app of ['pitch','fretboard','rhythm','chord']){const a=await admitWriter(f.db,f.ids[app],{},f.authority(app),f.options(app)),r=createD1SyncRepository(writerMutationDatabase(f.db,a));const op=await operation(app);assert.equal((await r.applyOperation(f.ids[app],op)).status,'applied');for(const target of [worker,offWorker,canaryWorker])assert.equal((await f.call('/v1/sync/snapshot?appId='+app,undefined,app,target)).status,200);assert.equal((await r.applyOperation(f.ids[app],await operation(app))).status,'conflict');}}finally{f.db.close();}
});
test('unsupported authority protocol is refused on 0033 and partial candidate schema fails closed',async()=>{
 const f=await fixture();try{assert.equal((await admitWriter(f.db,f.ids.port,{writerProtocol:2},f.authority('port'),f.options('port'))).error,'writer_protocol_unsupported');f.db.raw.exec('CREATE TABLE sync_authority_cutovers(id TEXT)');assert.equal((await admitWriter(f.db,f.ids.port,{},f.authority('port'),f.options('port'))).error,'dataset_authority_unavailable');}finally{f.db.close();}
});
test('Scheduled restores referenced assets, retains unreferenced bytes and continues established cleanup on 0033',async()=>{
 const f=await fixture();try{let deletes=0;const put=f.env.SYNC_ASSETS.put;f.env.SYNC_ASSETS.delete=async()=>{deletes++;};
 const referenced=crypto.randomUUID(),unreferenced=crypto.randomUUID();for(const id of [referenced,unreferenced]){f.db.raw.prepare("INSERT INTO sync_assets(asset_id,account_id,membership_id,sync_user_id,kind,state,storage_category,content_hash,mime_type,byte_size,width,height,object_key,object_version,created_by_device_id,created_at,updated_at,unreferenced_at) VALUES(?,'account','port-member','port-user','gear_photo_final','unreferenced','image',?,'image/webp',3,1,1,?,1,?,1,1,1)").run(id,'a'.repeat(64),id,f.ids.port.deviceId);await put(id,new Uint8Array([1,2,3]),{});}
 f.db.raw.prepare("INSERT INTO sync_records(user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,last_operation_id) VALUES('port-user','port','gear_item','owner',?, ?,1,?, 'asset-owner')").run(JSON.stringify({asset:{final:{assetId:referenced}}}),'a'.repeat(64),Date.now());
 const repo=createD1AssetRepository(f.db);await assert.rejects(repo.claimCleanup({asset_id:unreferenced},Date.now()),/requires_review/);
 const ctx={pending:null,waitUntil(p){this.pending=p;}};worker.scheduled({},f.env,ctx);await ctx.pending;assert.equal(deletes,0);assert.equal(f.db.raw.prepare("SELECT state FROM sync_assets WHERE asset_id=?").get(referenced).state,'available');assert.equal(f.db.raw.prepare("SELECT state FROM sync_assets WHERE asset_id=?").get(unreferenced).state,'unreferenced');assert(await f.env.SYNC_ASSETS.head(unreferenced));
 }finally{f.db.close();}
});

test('a linked AppDevice cannot be relabeled as unowned; a genuine legacy standalone app still saves',async()=>{
 const f=await fixture();try{
  await assert.rejects(admitWriter(f.db,f.ids.chord,{},null,f.options('chord')),/invalid_credential/);
  f.db.raw.prepare("DELETE FROM sync_membership_device_links WHERE membership_id='chord-member'").run();
  f.db.raw.prepare("DELETE FROM sync_account_managed_users WHERE membership_id='chord-member'").run();
  f.db.raw.prepare("DELETE FROM sync_account_memberships WHERE id='chord-member'").run();
  const r=await f.call('/v1/sync/push',{appId:'chord',mode:'sync',operations:[await operation('chord')]},'chord');assert.equal(r.status,200);assert.equal((await r.json()).results[0].status,'applied');
 }finally{f.db.close();}
});

test('actual OFF entry retains pending Project evidence through Scheduled and Port writes after additive DDL',async()=>{
 const f=await fixture();try{
  const plan=await prepareStudioRelease(metadata);f.db.raw.exec('BEGIN');try{f.db.raw.exec(plan.sql);f.db.raw.exec('COMMIT');}catch(e){f.db.raw.exec('ROLLBACK');throw e;}
  f.db.raw.prepare("INSERT INTO studio_document_enrollments VALUES('account','account-device',1,0)").run();
  const id=crypto.randomUUID();f.db.raw.prepare("INSERT INTO studio_document_pending VALUES('account',?,'account-device',1,1,?,0,?,'{}','{}')").run(id,crypto.randomUUID(),'a'.repeat(64));
  const pending=f.db.raw.prepare('SELECT * FROM studio_document_pending').all();
  const ctx={pending:null,waitUntil(p){this.pending=p;}};await offWorker.scheduled({},f.env,ctx);await ctx.pending;
  const r=await f.call('/v1/sync/push',{appId:'port',mode:'sync',operations:[await operation()]},'port',offWorker);assert.equal(r.status,200);assert.equal((await r.json()).results[0].status,'applied');
  assert.deepEqual(f.db.raw.prepare('SELECT * FROM studio_document_pending').all(),pending);assert.equal(f.db.raw.prepare('SELECT enabled FROM studio_document_control').get().enabled,0);assert.equal((await f.call('/v2/studio/document',{},'port',offWorker)).status,423);assert.equal(f.db.raw.prepare('SELECT count(*) n FROM d1_migrations').get().n,33);
 }finally{f.db.close();}
});
