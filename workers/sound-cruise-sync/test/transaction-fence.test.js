import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, environment, deps, jsonRequest, bucket, webp, assetId, operationId, credential, ORIGIN } from './writer-authority-fixture.js';
import { handleProAuthorizedRequest as request } from './pro-entitlement-fixture.js';
import { handleRequest } from '../src/app.js';
import { createIsolatedWriterPolicy } from '../src/writer-fence.js';
import { createIsolatedCutoverController, readAuthorityEvidence } from '../src/authority-cutover.js';
import { createD1AssetRepository } from '../src/asset-database.js';
import { hashRecord } from '../src/records.js';
import { sha256Hex } from '../src/asset-validation.js';

export const fields = { writerProtocol:2, syncProtocol:1, expectedWriteEpoch:2 };
export async function op(baseRevision=0,deleted=false) {
  const o={operationId:crypto.randomUUID(),recordType:'metronome_settings',recordId:'default',schemaVersion:1,
    baseRevision,deleted,payload:deleted?null:{id:'default',value:{version:3,bpm:120,meter:'4/4',rhythm:'quarter',sound:'electronic',volume:70,accents:[true,false,false,false]}}};
  o.payloadHash=await hashRecord(o,crypto,'port'); return o;
}
function fixture(t) {
  const db=seed(),r2=bucket(),env=environment(db,r2),policy=createIsolatedWriterPolicy('account-a');
  t.after(()=>db.close()); const dependencies={...deps(),writerPolicy:policy};
  const controller=createIsolatedCutoverController(db,policy);
  const transition=phase=>controller.transition({accountId:'account-a',migrationId:'m1',generation:'g1',operationId:phase+'-op',phase});
  const enforce=async()=>{await transition('prepared');await transition('paused');return transition('enforced');};
  const send=(path,body={},d=dependencies)=>request(jsonRequest('/v1/sync/'+path,{appId:'port',...body}),env,null,d);
  const push=async(wire={},operation=null,d=dependencies)=>send('push',{mode:'sync',operations:[operation || await op()],...wire},d);
  const get=path=>request(new Request('https://sync.example/v1/sync/'+path+'?appId=port',{headers:{Origin:ORIGIN,Authorization:`Bearer ${credential}`,'X-Sound-Cruise-Writer-Protocol':'999'}}),env,null,dependencies);
  const state=()=>JSON.stringify(['sync_records','sync_changes','sync_datasets','sync_assets','sync_asset_operations','sync_app_device_sync_safety'].map(table=>db.raw.prepare('SELECT * FROM '+table).all()));
  return {db,r2,env,dependencies,controller,transition,enforce,send,push,get,state};
}
async function code(response,expected){assert.equal((await response.json()).code,expected);}

for(const [name,wire,expected] of [
 ['missing protocol',{},'writer_protocol_required'], ['missing sync',{writerProtocol:2,expectedWriteEpoch:2},'writer_protocol_required'],
 ['outdated',{...fields,writerProtocol:1},'writer_protocol_outdated'],['future',{...fields,writerProtocol:3},'writer_protocol_unsupported'],
 ['missing epoch',{writerProtocol:2,syncProtocol:1},'dataset_epoch_stale'],['stale',{...fields,expectedWriteEpoch:1},'dataset_epoch_stale'],
 ['wrong epoch',{...fields,expectedWriteEpoch:3},'dataset_epoch_stale']
])test('enforced '+name+' leaves all data unchanged',async t=>{const f=fixture(t);await f.enforce();const before=f.state();await code(await f.push(wire),expected);assert.equal(f.state(),before);});

test('legacy/prepared remain compatible; current writers CAS/dedupe/tombstone and two devices',async t=>{
 const f=fixture(t);assert.equal((await f.push()).status,200);await f.transition('prepared');assert.equal((await f.push({},await op(1))).status,200);
 await f.transition('paused');await f.transition('enforced');const o=await op(2);
 assert.equal((await (await f.push(fields,o)).json()).results[0].status,'applied');assert.equal((await (await f.push(fields,o)).json()).results[0].status,'duplicate');
 assert.equal((await (await f.push(fields,await op(1))).json()).results[0].status,'conflict');
 f.db.raw.exec(`INSERT INTO sync_devices(id,user_id,app_id,credential_version,credential_verifier,last_cursor,created_at,last_seen_at,paired_at)
 VALUES ('second-device','port-user-a','port',1,'${'b'.repeat(64)}',0,1,1,1)`);
 const second={...f.dependencies,authenticateDevice:async()=>({userId:'port-user-a',deviceId:'second-device',appId:'port'})};
 assert.equal((await (await f.push(fields,await op(3,true),second)).json()).results[0].status,'applied');
 assert.equal(f.db.raw.prepare('SELECT count(*) n FROM sync_changes').get().n,4);
 assert.notEqual(f.db.raw.prepare('SELECT deleted_at FROM sync_records').get().deleted_at,null);
});

for(const phase of ['paused','enforced']) for(const deleted of [false,true]) test(`in-flight ${deleted?'tombstone':'upsert'} cannot pass ${phase} barrier`,async t=>{
 const f=fixture(t);await f.push();const before=f.state();const o=await op(1,deleted);
 const original=f.db.batch;let fired=false;
 f.db.batch=async statements=>{if(!fired&&statements.some(s=>s.sql?.includes('INSERT INTO sync_records'))){fired=true;await f.transition('prepared');await f.transition('paused');if(phase==='enforced')await f.transition('enforced');}return original(statements);};
 await code(await f.push({writerProtocol:2,syncProtocol:1,expectedWriteEpoch:1},o),phase==='paused'?'dataset_authority_unavailable':'dataset_epoch_stale');
 assert.equal(fired,true);assert.equal(f.state(),before);
});

test('write linearizes before barrier and is included in checkpoint; retry after response loss increments epoch once',async t=>{
 const f=fixture(t);await f.push();await f.transition('prepared');await f.transition('paused');const result=await f.transition('enforced');
 assert.equal(JSON.parse(result.checkpoint_json).lastChangeSeq,1);assert.equal(JSON.parse(result.checkpoint_json).recordCount,1);
 for(let i=0;i<3;i++)assert.deepEqual(await f.transition('enforced'),result);
 assert.equal((await f.controller.recover('account-a','m1')).target_epoch,2);
 const metadata=(await (await f.get('writer-authority')).json()).authority;
 assert.equal(metadata.fence.transactionalAdmission,true);assert.equal(metadata.fence.epoch,2);
 const snapshot=await (await f.get('snapshot')).json();assert.equal(metadata.fence.checkpoint.manifestHash,snapshot.manifestHash);
 assert.equal((await f.get('changes')).status,200);
});

test('cutover rejects invalid order, unbranded/non-admin/foreign capability and differing migration/operation',async t=>{
 const f=fixture(t);await assert.rejects(f.transition('enforced'));const input={accountId:'account-a',migrationId:'m1',generation:'g1',operationId:'x',phase:'prepared'};
 for(const policy of [{},null,createIsolatedWriterPolicy('other')])await assert.rejects(createIsolatedCutoverController(f.db,policy).transition(input));
 await f.transition('prepared');await assert.rejects(f.controller.transition({...input,migrationId:'other'}));await assert.rejects(f.controller.transition({...input,operationId:'other'}));
 assert.equal((await handleRequest(jsonRequest('/v1/sync/cutover',input),f.env,null,f.dependencies)).status,404);
});

test('paused crash survives controller restart; rollback policy cannot lower durable fence',async t=>{
 const f=fixture(t);await f.transition('prepared');await f.transition('paused');await code(await f.push(fields),'dataset_authority_unavailable');
 const restarted=createIsolatedCutoverController(f.db,f.dependencies.writerPolicy);assert.equal((await restarted.recover('account-a','m1')).phase,'paused');await f.transition('enforced');
 await code(await f.push({},await op(),deps()),'writer_protocol_required');assert.equal((await f.push(fields,await op(),deps())).status,200);
 for(const sql of ["UPDATE sync_account_memberships SET write_epoch=1","UPDATE sync_account_memberships SET minimum_writer_protocol=0","UPDATE sync_account_memberships SET authority_state='legacy'","DELETE FROM sync_authority_cutovers","UPDATE sync_authority_cutovers SET phase='prepared'"])assert.throws(()=>f.db.raw.exec(sql));
});

test('fake enforced label is not fence evidence and cannot enable isolated writes',async t=>{
 const f=fixture(t);f.db.raw.exec("UPDATE sync_account_memberships SET authority_state='enforced',minimum_writer_protocol=2,write_epoch=2");
 assert.equal((await (await f.get('writer-authority')).json()).authority.fence,undefined);
 await code(await f.push(fields),'dataset_authority_unavailable');
 assert.equal((await f.push({},await op(),deps())).status,200); // ACCEPT_COMPAT remains explicit; label alone is inert
});

for(const [name,sql,expected] of [
 ['credential rotated',"UPDATE sync_devices SET credential_verifier='eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'",'invalid_credential'],
 ['Pro verifier rotated',"UPDATE pro_credentials SET verifier='eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'",'pro_required'],
 ['device revoked',"UPDATE sync_devices SET revoked_at=2",'invalid_credential'],
 ['membership revoked',"UPDATE sync_account_memberships SET state='deleted'",'account_membership_required'],
 ['Pro revoked',"UPDATE pro_credentials SET revoked_at=created_at+1",'pro_required'],
 ['Pro generation',"UPDATE pro_auth_state SET generation=generation+1",'pro_reauth_required'],
 ['Pro lease',"UPDATE pro_auth_state SET unbound_backend_until=0",'pro_revalidation_required'],
 ['corrupt epoch',"PRAGMA ignore_check_constraints=ON; UPDATE sync_account_memberships SET authority_updated_at=-1",'dataset_authority_unavailable']
])test('authorization still required: '+name,async t=>{
 const f=fixture(t);await f.enforce();await f.push(fields);const before=f.state();const original=f.db.batch;let fired=false;
 f.db.batch=async statements=>{if(!fired&&statements.some(s=>s.sql?.includes('INSERT INTO sync_records'))){fired=true;f.db.raw.exec(sql);}return original(statements);};
 await code(await f.push(fields,await op(1)),expected);assert.equal(f.state(),before);
});

for(const failure of ['partial','transient'])test('D1 '+failure+' failure rolls back all record/log/dataset writes',async t=>{
 const f=fixture(t);await f.enforce();const before=f.state(),original=f.db.batch;let fail=true;
 f.db.batch=async statements=>{if(fail&&statements.some(s=>s.sql?.includes('INSERT INTO sync_records'))){fail=false;if(failure==='transient')throw Error('D1 transient');return original([...statements,f.db.prepare('UPDATE sync_datasets SET record_count=-1')]);}return original(statements);};
 const o=await op();await code(await f.push(fields,o),'server_error');assert.equal(f.state(),before);assert.equal((await (await f.push(fields,o)).json()).results[0].status,'applied');
});

test('bootstrap no-op remains readable; creation and migration completion are fenced',async t=>{
 const f=fixture(t);await f.enforce();const summary={schemaVersion:1,recordCount:0,manifestHash:'0'.repeat(64)};
 assert.equal((await f.send('bootstrap',summary)).status,200);await code(await f.send('migration/complete',summary),'writer_protocol_required');
 f.db.raw.exec('DELETE FROM sync_datasets');await code(await f.send('bootstrap',summary),'writer_protocol_required');assert.equal(f.db.raw.prepare('SELECT count(*) n FROM sync_datasets').get().n,0);
 assert.equal((await f.send('bootstrap',{...summary,...fields})).status,201);
});

async function asset(f,wire={}) {
 const bytes=webp(512,512),hash=await sha256Hex(bytes),body={assetId,operationId,hash,kind:'gear_photo_final',mime:'image/webp',byteSize:30,width:512,height:512,...wire};
 const prepare=()=>f.send('assets/prepare',body);
 const upload=(w=wire)=>request(new Request(`https://sync.example/v1/sync/assets/${assetId}/content`,{method:'PUT',headers:{Origin:ORIGIN,Authorization:`Bearer ${credential}`,'Content-Type':'image/webp','X-Sound-Cruise-Operation-Id':operationId,'X-Content-SHA256':hash,
 ...Object.fromEntries(Object.entries({'X-Sound-Cruise-Writer-Protocol':w.writerProtocol,'X-Sound-Cruise-Sync-Protocol':w.syncProtocol,'X-Sound-Cruise-Write-Epoch':w.expectedWriteEpoch}).filter(([,v])=>v!==undefined))},body:bytes}),f.env,null,f.dependencies);
 const commit=(w=wire)=>f.send('assets/commit',{assetId,operationId,hash,...w});return {prepare,upload,commit};
}

test('current asset epoch capture, duplicate retry, upload/commit/download/unreference',async t=>{
 const f=fixture(t);await f.enforce();const a=await asset(f,fields);assert.equal((await a.prepare()).status,201);assert.equal((await a.upload()).status,200);assert.equal((await a.commit()).status,200);assert.equal((await a.commit()).status,200);assert.equal((await a.prepare()).status,200);
 assert.equal(f.db.raw.prepare('SELECT admitted_write_epoch FROM sync_asset_operations').get().admitted_write_epoch,2);
 const download=await request(new Request(`https://sync.example/v1/sync/assets/${assetId}`,{headers:{Origin:ORIGIN,Authorization:`Bearer ${credential}`}}),f.env,null,f.dependencies);assert.equal(download.status,200);
 assert.equal((await f.send('assets/unreference',{assetIds:[assetId],...fields})).status,200);
});

for(const when of ['before-upload','during-upload','after-upload'])test('asset cross epoch '+when+' cannot publish or retag operation',async t=>{
 const f=fixture(t),a=await asset(f);await a.prepare();
 if(when==='before-upload')await f.enforce();
 if(when==='during-upload'){const put=f.r2.put;f.r2.put=async(...args)=>{await put(...args);await f.enforce();};}
 if(when!=='before-upload'){const r=await a.upload();assert.equal(r.status,when==='during-upload'?409:200);}
 if(when==='after-upload')await f.enforce();
 await code(await a.commit(fields),'dataset_epoch_stale');await code(await a.upload(fields),'dataset_epoch_stale');
 assert.notEqual(f.db.raw.prepare('SELECT state FROM sync_assets').get().state,'available');
 assert.equal(f.r2.objects.size,when==='before-upload'?0:1);
 const a2=await asset(f,fields);await code(await a2.prepare(),'dataset_epoch_stale');
});

test('old unreference and removal-safety cannot change new authority; failed upload is unpublished',async t=>{
 const f=fixture(t),a=await asset(f);await a.prepare();const original=f.r2.put;f.r2.put=async()=>{throw Error('interrupted');};await code(await a.upload(),'server_error');f.r2.put=original;await a.upload();await a.commit();await f.enforce();const before=f.state();
 await code(await f.send('assets/unreference',{assetIds:[assetId],writerProtocol:2,syncProtocol:1,expectedWriteEpoch:1}),'dataset_epoch_stale');
 await code(await f.send('removal-safety',{state:'clean',writerProtocol:2,syncProtocol:1,expectedWriteEpoch:1}),'dataset_epoch_stale');assert.equal(f.state(),before);
});

test('cleanup claim blocks cutover; prepared/enforced assets retained including unpublished orphans',async t=>{
 const f=fixture(t),a=await asset(f);await a.prepare();const repo=createD1AssetRepository(f.db),row=f.db.raw.prepare('SELECT * FROM sync_assets').get();
 assert.equal(await repo.claimCleanup(row,Date.now()),true);await assert.rejects(f.transition('prepared'));await repo.releaseCleanup(row);await f.enforce();assert.equal(await repo.claimCleanup(row,Date.now()),false);
});

test('Account and app scope: another Port account and Chord do not inherit the barrier',async t=>{
 const f=fixture(t);await f.transition('prepared');await f.transition('paused');
 // Copy a genuinely separate identity/Account using a second seeded DB's schema-compatible rows.
 const other=seed();t.after(()=>other.close());
 for(const table of ['sync_accounts','sync_users','sync_devices','sync_account_memberships','sync_account_managed_users','sync_datasets']){
  for(const row of other.raw.prepare('SELECT * FROM '+table).all()){
   for(const key of Object.keys(row))if(typeof row[key]==='string')row[key]=row[key].replaceAll('account-a','account-b').replaceAll('port-user-a','port-user-b').replaceAll('port-membership-a','port-membership-b').replaceAll('323e4567-e89b-42d3-a456-426614174000','423e4567-e89b-42d3-a456-426614174000');
   if(table==='sync_devices')row.credential_verifier='c'.repeat(64);
   if(table==='sync_accounts'||table==='sync_users')row.recovery_verifier='d'.repeat(64);
   const keys=Object.keys(row);f.db.raw.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...Object.values(row));
  }
 }
 const b={...f.dependencies,authenticateDevice:async()=>({userId:'port-user-b',deviceId:'423e4567-e89b-42d3-a456-426614174000',appId:'port'})};
 assert.equal((await f.push({},await op(),b)).status,200);
 const {admitWriter,writerMutationDatabase}=await import('../src/writer-admission.js');
 const admission=await admitWriter(f.db,{userId:'chord-user',deviceId:'chord-device',appId:'chord'},{},null,{policy:f.dependencies.writerPolicy});
 const result=await writerMutationDatabase(f.db,admission).prepare("UPDATE sync_datasets SET updated_at=2 WHERE user_id='port-user-b'").run();assert.equal(result.meta.changes,1);
 await code(await f.push(),'dataset_authority_unavailable');
});

for(const path of ['assets/prepare','assets/unreference','removal-safety','migration/complete'])test('in-flight '+path+' rechecks barrier in D1',async t=>{
 const f=fixture(t),a=await asset(f);await a.prepare();await a.upload();await a.commit();
 const body=path==='assets/prepare'?{assetId:crypto.randomUUID(),operationId:crypto.randomUUID(),hash:'0'.repeat(64),kind:'gear_photo_final',mime:'image/webp',byteSize:30,width:512,height:512}
  :path==='assets/unreference'?{assetIds:[assetId]}:path==='removal-safety'?{state:'clean'}:{schemaVersion:1,recordCount:0,manifestHash:(await (await f.get('snapshot')).json()).manifestHash};
 const before=f.state(),original=f.db.batch;let fired=false;
 f.db.batch=async statements=>{if(!fired){fired=true;await f.transition('prepared');await f.transition('paused');}return original(statements);};
 await code(await f.send(path,body),'dataset_authority_unavailable');assert.equal(f.state(),before);assert.equal(fired,true);
});

test('removing managed mapping cannot bypass the sticky ledger in compatibility default',async t=>{
 const f=fixture(t);await f.enforce();f.db.raw.exec('DELETE FROM sync_account_managed_users');f.env.SYNC_ALLOWED_APP_IDS='port';
 await code(await f.push({},await op(),deps()),'account_membership_required');
});

test('asset references cannot connect an unpublished old object to the new dataset',async t=>{
 const f=fixture(t),a=await asset(f);await a.prepare();await a.upload();await f.enforce();
 const {admitWriter,writerMutationDatabase}=await import('../src/writer-admission.js');
 const admission=await admitWriter(f.db,{userId:'port-user-a',deviceId:credential.split('.')[1],appId:'port'},fields,
  {accountId:'account-a',membershipId:'port-membership-a'},{policy:f.dependencies.writerPolicy,proCredentialId:'123e4567-e89b-42d3-a456-426614174999'});
 const db=writerMutationDatabase(f.db,admission).withWriterConstraints({payload:{final:{assetId}}}),before=f.state();
 await assert.rejects(db.prepare('UPDATE sync_datasets SET record_count=123').run(),e=>e.code==='dataset_authority_unavailable');assert.equal(f.state(),before);
});

test('B1-4 consumes real ledger/checkpoint evidence and reaches ready-to-publish without publication',async t=>{
 const f=fixture(t);
 const {migrationFixture,prepared}=await import('../../../apps/cruise-port/tests/migration-fixture.mjs');
 const {legacySyncName}=await import('../../../apps/cruise-port/port-migration-contract.mjs');
 const {issueIsolatedFence}=await import('../../../apps/cruise-port/port-authority-migration.mjs');
 const {createD1SyncRepository}=await import('../src/sync-database.js');
 const {validateOperation}=await import('../src/records.js');
 const local=await migrationFixture({bound:true});local.state.identity.accountId='account-a';local.state.sync.provenance.accountId='account-a';local.state.sync.provenance.databaseName=legacySyncName('account-a');
 const {e,c}=await prepared(local),repo=createD1SyncRepository(f.db);
 for(const row of c.records){const parsed=await validateOperation({...row,operationId:crypto.randomUUID(),baseRevision:0,deleted:false},crypto,'port');assert.equal(parsed.ok,true);await repo.applyOperation({userId:'port-user-a',deviceId:credential.split('.')[1],appId:'port'},parsed.operation);}
 await f.enforce();const evidence=(await (await f.get('writer-authority')).json()).authority;
 const snapshot=await repo.readSnapshot({userId:'port-user-a',appId:'port'});assert.equal(snapshot.manifestHash,evidence.fence.checkpoint.manifestHash);assert.equal(snapshot.dataset.last_change_seq,evidence.fence.checkpoint.lastChangeSeq);
 const cloud={authenticated:true,complete:true,appId:'port',accountId:'account-a',datasetId:local.state.identity.datasetId,records:snapshot.records,checkpoint:evidence.fence.checkpoint};
 const ticket=issueIsolatedFence(local.scope,{...evidence.fence,accountId:evidence.accountId});
 assert.equal((await e.reconcile({cloud,fence:ticket})).complete,true);await e.seal({fence:ticket});assert.equal((await e.inspect()).state,'ready-to-publish');
 const {PORT_AUTHORITY_POINTER}=await import('../../../apps/cruise-port/port-local-authority.mjs');assert.equal(local.storage.getItem(PORT_AUTHORITY_POINTER),null);
});

for(const kind of ['transient','partial'])test('cutover '+kind+' failure retains paused recovery and no epoch increment',async t=>{
 const f=fixture(t);await f.transition('prepared');await f.transition('paused');const original=f.db.batch;let fail=true;
 f.db.batch=async statements=>{if(fail&&statements.some(s=>s.sql?.includes('UPDATE sync_authority_cutovers'))){fail=false;if(kind==='transient')throw Error('D1 unavailable');return original([...statements,f.db.prepare('UPDATE sync_datasets SET record_count=-1')]);}return original(statements);};
 await assert.rejects(f.transition('enforced'));assert.equal((await f.controller.recover('account-a','m1')).phase,'paused');assert.equal(f.db.raw.prepare('SELECT write_epoch FROM sync_account_memberships').get().write_epoch,1);
 await code(await f.push(),'dataset_authority_unavailable');assert.equal((await f.transition('enforced')).target_epoch,2);
});

test('enforced still needs AppDevice/Pro; QA admission cannot bypass fence',async t=>{
 const f=fixture(t);await f.enforce();assert.equal((await f.push(fields,await op(),{...f.dependencies,...deps(false)})).status,401);
 assert.equal((await handleRequest(jsonRequest('/v1/sync/push',{appId:'port',mode:'sync',operations:[await op()],...fields}),{...f.env,PRO_CREDENTIAL_PEPPER:'p'.repeat(64)},null,f.dependencies)).status,403);
 f.db.raw.exec("UPDATE sync_accounts SET admission_provenance='qa'");
 await code(await f.push({},await op(),{...f.dependencies,authenticateQaRequest:async()=>true}),'writer_protocol_required');
});

test('wire metadata is included in 256KiB bound and 50-operation maximum',async t=>{
 const f=fixture(t);await f.enforce();const o=await op();const value={appId:'port',mode:'sync',operations:[o],...fields};
 const sendBytes=size=>{const r=jsonRequest('/v1/sync/push',value),body=JSON.stringify(value);return request(new Request(r.url,{method:'POST',headers:r.headers,body:body+' '.repeat(size-body.length)}),f.env,null,f.dependencies);};
 assert.equal((await sendBytes(256*1024)).status,200);assert.equal((await sendBytes(256*1024+1)).status,413);
 assert.equal((await f.send('push',{mode:'sync',operations:Array(50).fill(o),...fields})).status,200);
 assert.equal((await f.send('push',{mode:'sync',operations:Array(51).fill(o),...fields})).status,400);
});

test('unknown R2 cleanup outcome holds claim and cannot be overtaken by cutover',async t=>{
 const f=fixture(t),a=await asset(f);await a.prepare();f.db.raw.exec('UPDATE sync_assets SET created_at=1,updated_at=1');f.r2.delete=async()=>{throw Error('unknown R2 result');};
 const {handleScheduled}=await import('../src/app.js');await handleScheduled(null,f.env,{createCleanupRepository:()=>({cleanup:async()=>({})})});
 assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM sync_authority_cleanup_claims').get().n,1);await assert.rejects(f.transition('prepared'));
 assert.equal(f.db.raw.prepare('SELECT state FROM sync_assets').get().state,'prepared');
});

test('additive 0035 preserves preexisting 0034 rows and leaves activation empty',async()=>{
 const {DatabaseSync}=await import('node:sqlite'),fs=await import('node:fs');const db=new DatabaseSync(':memory:');
 try{
  const dir=new URL('../migrations/',import.meta.url);for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.sql')&&n<'0035').sort())db.exec(fs.readFileSync(new URL(name,dir),'utf8'));
  db.exec("INSERT INTO sync_users(id,state,recovery_version,created_at,updated_at) VALUES ('preserved','provisioning',0,1,1)");
  db.exec("INSERT INTO sync_datasets(user_id,app_id,state,schema_version,record_count,min_change_seq,updated_at,last_change_seq) VALUES ('preserved','port','initializing',1,0,0,1,0)");
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  const snapshot=()=>JSON.stringify(tables.map(n=>[n,db.prepare('SELECT * FROM '+n).all()]));const before=snapshot();
  db.exec(fs.readFileSync(new URL('0035_add_transaction_fence.sql',dir),'utf8'));assert.equal(snapshot(),before);
  for(const name of ['sync_authority_cutovers','sync_writer_fence_assertion','sync_authority_cleanup_claims'])assert.equal(db.prepare('SELECT COUNT(*) n FROM '+name).get().n,0);
 }finally{db.close();}
});

test('retained assets do not occupy the scheduled cleanup candidate limit',async t=>{
 const f=fixture(t),a=await asset(f);await a.prepare();f.db.raw.exec('UPDATE sync_assets SET created_at=1,updated_at=1');
 const repo=createD1AssetRepository(f.db);assert.equal((await repo.cleanupCandidates(Date.now(),1,1,1)).length,1);
 await f.transition('prepared');assert.equal((await repo.cleanupCandidates(Date.now(),1,1,1)).length,0);
});

test('owner deletion between asset commit check and transaction cannot publish an attachment',async t=>{
 const f=fixture(t);await f.enforce();
 f.db.raw.prepare(`INSERT INTO sync_records(user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,updated_by_device_id,last_operation_id,schema_version)
 VALUES ('port-user-a','port','practice_menu','owner','{}',?,1,1,?,'owner-op',1)`).run('a'.repeat(64),credential.split('.')[1]);
 const bytes=new TextEncoder().encode('notes'),hash=await sha256Hex(bytes);
 assert.equal((await f.send('assets/prepare',{assetId,operationId,hash,kind:'practice_attachment_text',mime:'text/plain',byteSize:5,width:1,height:1,ownerRecordId:'owner',originalFilename:'notes.txt',...fields})).status,201);
 const upload=new Request(`https://sync.example/v1/sync/assets/${assetId}/content`,{method:'PUT',body:bytes,headers:{Origin:ORIGIN,Authorization:`Bearer ${credential}`,'Content-Type':'text/plain','X-Sound-Cruise-Operation-Id':operationId,'X-Content-SHA256':hash,'X-Sound-Cruise-Writer-Protocol':'2','X-Sound-Cruise-Sync-Protocol':'1','X-Sound-Cruise-Write-Epoch':'2'}});
 assert.equal((await request(upload,f.env,null,f.dependencies)).status,200);
 const original=f.db.batch;let raced=false;f.db.batch=async statements=>{if(!raced&&statements.some(s=>s.sql?.includes("SET state = 'available'"))){raced=true;f.db.raw.exec("UPDATE sync_records SET deleted_at=2,payload_json=NULL WHERE record_id='owner'");}return original(statements);};
 await code(await f.send('assets/commit',{assetId,operationId,hash,...fields}),'asset_retry');
 assert.equal(raced,true);const row=f.db.raw.prepare('SELECT state,owner_record_id FROM sync_assets').get();assert.equal(row.state,'uploaded');assert.equal(row.owner_record_id,'owner');assert.equal(f.r2.objects.size,1);
});
