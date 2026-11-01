import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {seed} from './writer-authority-fixture.js';
import {lifecycleFixture} from './asset-lifecycle-fixture.js';
import {handleScheduled} from '../src/app.js';
import {createD1SyncRepository} from '../src/sync-database.js';
import {validateOperation} from '../src/records.js';

const DAY=86400000;
async function fixture(t){const f=await lifecycleFixture({db:seed({schemaVersion:33})});t.after(()=>f.db.close());f.env.SYNC_ASSET_CLEANUP_ENABLED='true';return f;}
async function reference(f){const op=(await validateOperation(await f.operation(),crypto,'port')).operation;assert(op);return createD1SyncRepository(f.db).applyOperation({userId:'port-user-a',appId:'port',deviceId:'323e4567-e89b-42d3-a456-426614174000'},op);}
const noRetention={createCleanupRepository:()=>({cleanup:async()=>({})})};

test('schema0033 scheduled cleanup restores references while retaining physically eligible objects under HOLD',async t=>{
 const f=await fixture(t);assert.equal((await reference(f)).status,'applied');
 assert.equal(await handleScheduled(null,f.env,noRetention),undefined);
 assert.equal((await f.row()).state,'available');assert(await f.r2.head(f.key));
 assert.equal(f.db.raw.prepare("SELECT count(*) n FROM sqlite_master WHERE name='sync_asset_deletions'").get().n,0);
});

test('schema0033 expiry boundaries match legacy: prepared 24h, unreferenced 30d; physical deletion remains HOLD',async t=>{
 const f=await fixture(t),now=Date.now();
 f.db.raw.prepare("UPDATE sync_assets SET state='prepared',updated_at=?").run(now-DAY+1);
 assert.equal((await f.repo.cleanupCandidates(now,30*DAY,DAY,100)).length,0);
 f.db.raw.prepare('UPDATE sync_assets SET updated_at=?').run(now-DAY);
 assert.equal((await f.repo.cleanupCandidates(now,30*DAY,DAY,100)).length,1);
 f.db.raw.prepare("UPDATE sync_assets SET state='unreferenced',unreferenced_at=?").run(now-30*DAY+1);
 assert.equal((await f.repo.cleanupCandidates(now,30*DAY,DAY,100)).length,0);
 f.db.raw.prepare('UPDATE sync_assets SET unreferenced_at=?').run(now-30*DAY);
 assert.equal((await f.repo.cleanupCandidates(now,30*DAY,DAY,100)).length,1);
 let deletes=0;f.r2.delete=async()=>{deletes++;};const result=await handleScheduled(null,f.env,noRetention);
 assert.equal(result.status,'HOLD_SCHEMA0033_ASSET_CLEANUP');assert.equal(deletes,0);assert(await f.r2.head(f.key));
});

test('schema0033 HOLD on an earlier unreferenced object does not prevent restoring a later referenced candidate',async t=>{
 const f=await fixture(t);assert.equal((await reference(f)).status,'applied');
 const copy={...await f.row(),asset_id:'123e4567-e89b-42d3-a456-426614174001',object_key:'earlier-key',created_at:0,updated_at:0,unreferenced_at:0};
 const columns=Object.keys(copy);f.db.raw.prepare(`INSERT INTO sync_assets (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...Object.values(copy));
 const result=await handleScheduled(null,f.env,noRetention);assert.equal(result.status,'HOLD_SCHEMA0033_ASSET_CLEANUP');
 assert.equal((await f.row()).state,'available');assert(await f.r2.head(f.key));
});

test('preserved v137 cleanup admits a reference between its check and physical deletion; not evidence for safe v138 reuse',async t=>{
 const f=await fixture(t);const source=fs.readFileSync(new URL('../src/studio-legacy-v137.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async function handleScheduled('),end=source.indexOf('\n__name(handleScheduled',start);assert(start>=0&&end>start);
 // Execute the exact preserved handler, injecting only its documented test dependencies.
 const legacy=vm.runInNewContext('('+source.slice(start,end)+')',{Date,assetFeatureEnabled:(env,key)=>env[key]==='true',cleanupProLockouts:async()=>{}});
 let accepted;const remove=f.r2.delete.bind(f.r2);f.r2.delete=async key=>{accepted=await reference(f);await remove(key);};
 await legacy(null,f.env,{...noRetention,createAssetRepository:()=>f.repo});
 assert.equal(accepted.status,'applied');assert.equal(await f.r2.head(f.key),null);
 assert(f.db.raw.prepare("SELECT payload_json FROM sync_records WHERE record_type='gear_item'").get().payload_json.includes(f.assetId));
 assert.equal((await f.row()).state,'deleted','reproducible legacy race: metadata and live reference outlast the bytes');
});
