import test from 'node:test';
import assert from 'node:assert/strict';
import { lifecycleFixture } from './asset-lifecycle-fixture.js';
import { recoverAssetDeletion } from '../src/asset-deletion.js';

async function fixture(t,options) {const f=await lifecycleFixture(options);t.after(()=>f.db.close());return f;}
async function blocked(response) {assert.equal(response.status,409);assert.equal((await response.json()).code,'asset_reference_unavailable');}
async function applied(response) {assert.equal(response.status,200);assert.equal((await response.json()).results[0].status,'applied');}

for(const kind of ['gear_photo_final','my_app_icon_final','practice_attachment_text']) for(const policy of [false,true]) {
 test(`${kind} policy=${policy}: reference commits before reservation, cleanup cannot delete`,async t=>{
  const f=await fixture(t,{kind,policy});await applied(await f.push());assert.equal(await f.claim(),null);
  await f.scheduled();assert.ok(await f.r2.head(f.key));
 });
 test(`${kind} policy=${policy}: reservation commits first, all later reference publication rejects`,async t=>{
  const f=await fixture(t,{kind,policy}),claim=await f.claim();assert.ok(claim);await blocked(await f.push());
  const del=f.r2.delete.bind(f.r2);let checked=false;
  f.r2.delete=async key=>{await blocked(await f.push());checked=true;await del(key);await blocked(await f.push());};
  assert.equal(await recoverAssetDeletion(f.repo,f.r2,claim),'deleted');assert.ok(checked);
  if(policy){const response=await f.push();assert.equal(response.status,503);assert.equal((await response.json()).code,'dataset_authority_unavailable');}
  else await blocked(await f.push());
  assert.equal((await f.row()).state,'deleted');assert.equal(await f.r2.head(f.key),null);
 });
}

for(const policy of [false,true]) test(`claim just before record transaction rolls back record/change/dataset, policy=${policy}`,async t=>{
 const f=await fixture(t,{policy});const original=f.db.batch;let once=false;
 f.db.batch=async statements=>{if(!once&&statements.some(s=>s.sql?.includes('INSERT INTO sync_records'))){once=true;await f.claim();}return original(statements);};
 await blocked(await f.push());assert.ok(once);
 assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM sync_records').get().n,0);
 assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);
 assert.equal(f.db.raw.prepare('SELECT record_count FROM sync_datasets').get().record_count,0);
});

for(const failure of ['r2-failure','r2-response-lost','d1-finalize-failure','crash-after-claim','crash-after-delete']) test(`${failure}: restart safely retries same reservation`,async t=>{
 const f=await fixture(t),claim=await f.claim();const original=f.r2.delete.bind(f.r2),batch=f.db.batch;
 if(failure==='r2-failure')f.r2.delete=async()=>{throw Error('unavailable');};
 if(failure==='r2-response-lost')f.r2.delete=async key=>{await original(key);throw Error('response lost');};
 if(failure==='d1-finalize-failure')f.db.batch=async()=>{throw Error('D1 finalize unavailable');};
 if(failure==='crash-after-delete')await original(f.key);
 if(!failure.startsWith('crash'))assert.equal(await recoverAssetDeletion(f.repo,f.r2,claim),'recovery-required');
 f.db.batch=batch;
 await blocked(await f.push());
 f.r2.delete=original;
 await f.scheduled();assert.equal((await f.row()).state,'deleted');assert.equal(await f.r2.head(f.key),null);
 assert.equal((await f.repo.getCleanupClaim(f.assetId)).claim_id,claim.claim_id);
 assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM sync_authority_cleanup_claims').get().n,0);
});

test('D1 claim failure rolls back both ledgers and leaves bytes usable',async t=>{
 const f=await fixture(t),batch=f.db.batch;
 f.db.batch=statements=>batch([...statements,f.db.prepare('UPDATE sync_datasets SET record_count=-1')]);
 await assert.rejects(f.claim());f.db.batch=batch;
 assert.equal(await f.repo.getCleanupClaim(f.assetId),null);
 assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM sync_authority_cleanup_claims').get().n,0);
 await applied(await f.push());assert.ok(await f.r2.head(f.key));
});

test('D1 reference failure rolls back all publication and permits later reservation',async t=>{
 const f=await fixture(t),batch=f.db.batch;
 f.db.batch=statements=>batch([...statements,f.db.prepare('UPDATE sync_datasets SET record_count=-1')]);
 assert.equal((await f.push()).status,503);f.db.batch=batch;assert.ok(await f.claim());
 assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);
});

test('two Workers race reservation; duplicate deletion/finalization uses one immutable claim',async t=>{
 const f=await fixture(t);const row=await f.row();
 // SQLite adapter serializes synchronously; actual concurrent D1 batches are covered by workerd.
 assert.equal(await f.repo.claimCleanup(row,Date.now()),true);assert.equal(await f.repo.claimCleanup(row,Date.now()),false);
 const claim=await f.repo.getCleanupClaim(f.assetId);
 assert.equal(await recoverAssetDeletion(f.repo,f.r2,claim),'deleted');
 assert.equal(await f.repo.completeCleanup(claim,Date.now()),true);
 assert.equal(await recoverAssetDeletion(f.repo,f.r2,claim),'deleted');
 assert.equal((await f.repo.getCleanupClaim(f.assetId)).state,'deleted');
});

for(const change of ['account','membership','epoch']) for(const when of ['before-delete','after-delete']) test(`${change} generation changes ${when}: retain recovery claim`,async t=>{
 const f=await fixture(t),claim=await f.claim();
 const mutate=()=>f.db.raw.exec(change==='account'?'UPDATE sync_accounts SET generation=generation+1':change==='membership'?'UPDATE sync_account_memberships SET generation=generation+1':'UPDATE sync_account_memberships SET write_epoch=write_epoch+1');
 if(when==='before-delete')mutate();else {const del=f.r2.delete.bind(f.r2);f.r2.delete=async key=>{await del(key);mutate();};}
 assert.equal(await recoverAssetDeletion(f.repo,f.r2,claim),'recovery-required');
 assert.equal((await f.repo.getCleanupClaim(f.assetId)).state,'recovery-required');
 assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM sync_authority_cleanup_claims').get().n,1);
 if(when==='before-delete')assert.ok(await f.r2.head(f.key));await blocked(await f.push());
});

for(const field of ['claim_id','object_key','object_version','content_hash','account_id','membership_id','sync_user_id','account_generation','membership_generation','write_epoch']) test(`stale ${field} never authorizes R2 delete`,async t=>{
 const f=await fixture(t),claim=await f.claim();let deletes=0;f.r2.delete=async()=>{deletes++;};
 assert.equal(await recoverAssetDeletion(f.repo,f.r2,{...claim,[field]:field==='object_version'?2:'stale'}),'recovery-required');
 assert.equal(deletes,0);assert.ok(await f.r2.head(f.key));
});

test('same ID/key/generation cannot be recreated or reassigned while an old deletion may run',async t=>{
 const f=await fixture(t),claim=await f.claim();
 for(const sql of ["UPDATE sync_assets SET object_version=2","UPDATE sync_assets SET object_key='replacement'","UPDATE sync_assets SET content_hash='"+'f'.repeat(64)+"'","UPDATE sync_assets SET account_id='account-b'","DELETE FROM sync_assets","DELETE FROM sync_authority_cleanup_claims","DELETE FROM sync_asset_deletions"])
   assert.throws(()=>f.db.raw.exec(sql),/asset_cleanup_conflict/);
 assert.equal(await recoverAssetDeletion(f.repo,f.r2,claim),'deleted');
 assert.throws(()=>f.db.raw.exec("UPDATE sync_assets SET state='available'"),/asset_cleanup_conflict/);
 assert.throws(()=>f.db.raw.exec('INSERT OR REPLACE INTO sync_assets SELECT * FROM sync_assets'),/asset_cleanup_conflict/);
 const response=await f.send('assets/prepare',{assetId:f.assetId,operationId:crypto.randomUUID(),hash:f.hash,kind:'gear_photo_final',mime:'image/webp',byteSize:30,width:512,height:512});
 assert.equal(response.status,409);
});

test('duplicate operation response cannot resurrect a deleted owner reference',async t=>{
 const f=await fixture(t),op=await f.operation();await applied(await f.push(op));
 await applied(await f.push(await f.operation({baseRevision:1,deleted:true})));
 const claim=await f.claim();assert.equal(await recoverAssetDeletion(f.repo,f.r2,claim),'deleted');
 const response=await f.push(op);assert.equal(response.status,200);assert.equal((await response.json()).results[0].status,'duplicate');
 assert.notEqual(f.db.raw.prepare('SELECT deleted_at FROM sync_records').get().deleted_at,null);
 assert.equal(await f.r2.head(f.key),null);
});

for(const kind of ['gear_photo_final','my_app_icon_final','practice_attachment_text']) test(`enforced ${kind}: live references retained; retired references denied`,async t=>{
 const f=await fixture(t,{kind});await f.enforce();await applied(await f.push());await f.scheduled();assert.ok(await f.r2.head(f.key));assert.equal(await f.claim(),null);
 const retired=await fixture(t,{kind});const claim=await retired.claim();await recoverAssetDeletion(retired.repo,retired.r2,claim);await retired.enforce();
 const response=await retired.push();assert.equal(response.status,503);assert.equal((await response.json()).code,'dataset_authority_unavailable');
});

test('legacy unresolved claims cannot be expired or adopted without object identity evidence',async t=>{
 const f=await fixture(t);await f.db.prepare('INSERT INTO sync_authority_cleanup_claims VALUES (?,?,1)').bind('account-a',f.assetId).run();
 await f.scheduled();await blocked(await f.push());assert.ok(await f.r2.head(f.key));assert.equal(await f.repo.getCleanupClaim(f.assetId),null);
 await f.repo.releaseCleanup(await f.row());assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM sync_authority_cleanup_claims').get().n,1);
});

test('stale cleanup candidate cannot reserve a newly committed or updated asset',async t=>{
 const f=await fixture(t),old=await f.row();
 await f.db.prepare("UPDATE sync_assets SET state='available',unreferenced_at=NULL,updated_at=2").run();
 assert.equal(await f.repo.claimCleanup(old,Date.now()),false);assert.ok(await f.r2.head(f.key));await applied(await f.push());
});

test('known unpublished assets are not referenceable in legacy mode either',async t=>{
 const f=await fixture(t);await f.db.prepare("UPDATE sync_assets SET state='uploaded'").run();await blocked(await f.push());
});

test('claim blocks upload completion, asset commit and explicit cancellation, including legacy direct repositories',async t=>{
 const f=await fixture(t);await f.db.prepare("UPDATE sync_assets SET state='uploaded'").run();
 const operationId=crypto.randomUUID();await f.db.prepare(`INSERT INTO sync_asset_operations
  (operation_id,asset_id,account_id,sync_user_id,app_device_id,request_fingerprint,created_at,updated_at)
  VALUES (?,?,'account-a','port-user-a','323e4567-e89b-42d3-a456-426614174000',?,1,1)`)
  .bind(operationId,f.assetId,'f'.repeat(64)).run();
 const row=await f.row(),claim=await f.claim();assert.ok(claim);
 await assert.rejects(f.repo.markUploaded({...row,operation_id:operationId},Date.now()),/asset_cleanup_conflict/);
 const commit=await f.send('assets/commit',{assetId:f.assetId,operationId,hash:f.hash});await blocked(commit);
 await f.repo.releaseCleanup(row);await blocked(await f.push());
 await recoverAssetDeletion(f.repo,f.r2,claim);
 await assert.rejects(f.repo.markUploaded({...row,operation_id:operationId},Date.now()),/asset_reference_unavailable/);
});

test('a failed cleanup finalize batch cannot release a reservation or partially mark metadata deleted',async t=>{
 const f=await fixture(t),claim=await f.claim(),batch=f.db.batch;
 f.db.batch=statements=>batch([...statements,f.db.prepare('UPDATE sync_datasets SET record_count=-1')]);
 assert.equal(await recoverAssetDeletion(f.repo,f.r2,claim),'recovery-required');f.db.batch=batch;
 assert.equal((await f.row()).state,'unreferenced');
 assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM sync_authority_cleanup_claims').get().n,1);
 await blocked(await f.push());await f.scheduled();assert.equal((await f.row()).state,'deleted');
});

test('unreference after successful publication never makes a still referenced object deletable',async t=>{
 const f=await fixture(t);await f.db.prepare("UPDATE sync_assets SET state='available',unreferenced_at=NULL").run();
 await applied(await f.push());assert.equal((await f.send('assets/unreference',{assetIds:[f.assetId]})).status,200);
 assert.equal(await f.claim(),null);await f.scheduled();assert.ok(await f.r2.head(f.key));
});

test('rollback cannot release or rewrite a completed deletion reservation',async t=>{
 const f=await fixture(t),claim=await f.claim();await recoverAssetDeletion(f.repo,f.r2,claim);
 for(const sql of ["UPDATE sync_asset_deletions SET state='deleting'","UPDATE sync_asset_deletions SET claim_id='other'","UPDATE sync_asset_deletions SET write_epoch=2"])
  assert.throws(()=>f.db.raw.exec(sql),/asset_cleanup_conflict/);
 await blocked(await f.push());
});

test('migration push and tombstone resurrection use the same record transaction guard',async t=>{
 const f=await fixture(t),op=await f.operation();await applied(await f.push(op));
 await applied(await f.push(await f.operation({baseRevision:1,deleted:true})));const claim=await f.claim();assert.ok(claim);
 await blocked(await f.push(await f.operation({baseRevision:2})));
 await f.db.prepare("UPDATE sync_datasets SET state='initializing'").run();
 await blocked(await f.send('push',{mode:'migration',operations:[await f.operation({baseRevision:2})]}));
 assert.notEqual(f.db.raw.prepare('SELECT deleted_at FROM sync_records').get().deleted_at,null);
});

test('0036 is additive: existing bytes metadata and unresolved B1-5 claims remain unchanged',async t=>{
 const {DatabaseSync}=await import('node:sqlite'),fs=await import('node:fs');
 const old=new DatabaseSync(':memory:');t.after(()=>old.close());
 const dir=new URL('../migrations/',import.meta.url);
 for(const file of fs.readdirSync(dir).filter(n=>n.endsWith('.sql')&&n<'0036').sort())old.exec(fs.readFileSync(new URL(file,dir),'utf8'));
 const f=await fixture(t),row=await f.row(),keys=Object.keys(row);
 old.prepare(`INSERT INTO sync_assets (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...Object.values(row));
 old.prepare('INSERT INTO sync_authority_cleanup_claims VALUES (?,?,1)').run('account-a',f.assetId);
 const before=JSON.stringify(old.prepare('SELECT * FROM sync_assets').all()),claims=JSON.stringify(old.prepare('SELECT * FROM sync_authority_cleanup_claims').all());
 old.exec(fs.readFileSync(new URL('0036_add_asset_deletion_reservations.sql',dir),'utf8'));
 assert.equal(JSON.stringify(old.prepare('SELECT * FROM sync_assets').all()),before);
 assert.equal(JSON.stringify(old.prepare('SELECT * FROM sync_authority_cleanup_claims').all()),claims);
 assert.equal(old.prepare('SELECT COUNT(*) n FROM sync_asset_deletions').get().n,0);
});

test('explicit replacement uses a fresh asset ID/key; old cleanup cannot delete replacement bytes',async t=>{
 const f=await fixture(t),claim=await f.claim(),old=await f.row();
 const replacement={...old,asset_id:crypto.randomUUID(),object_key:f.key+'/replacement',state:'available',unreferenced_at:null};
 const keys=Object.keys(replacement);
 await f.db.prepare(`INSERT INTO sync_assets (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...Object.values(replacement)).run();
 await f.r2.put(replacement.object_key,f.bytes,{customMetadata:{hash:f.hash}});
 const op=await f.operation();op.payload.value.asset.final.assetId=replacement.asset_id;
 const {hashRecord}=await import('../src/records.js');op.payloadHash=await hashRecord(op,crypto,'port');await applied(await f.push(op));
 assert.equal(await recoverAssetDeletion(f.repo,f.r2,claim),'deleted');
 assert.equal(await f.r2.head(f.key),null);assert.ok(await f.r2.head(replacement.object_key));
 assert.equal(f.db.raw.prepare('SELECT state FROM sync_assets WHERE asset_id=?').get(replacement.asset_id).state,'available');
});
