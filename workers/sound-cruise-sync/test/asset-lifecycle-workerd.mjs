import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { seed, environment, jsonRequest } from './writer-authority-fixture.js';
import { seedTestPro, TEST_PRO_TOKEN, TEST_PRO_PEPPER } from './pro-entitlement-fixture.js';
import { lifecycleFixture } from './asset-lifecycle-fixture.js';
import { createD1AssetRepository } from '../src/asset-database.js';
import { recoverAssetDeletion } from '../src/asset-deletion.js';

async function runtime(t) {
 const bundle=await build({entryPoints:[new URL('./asset-lifecycle-worker-entry.js',import.meta.url).pathname],bundle:true,format:'esm',platform:'browser',write:false});
 const worker={modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',
  d1Databases:{SYNC_DB:'asset-lifecycle-isolated'},r2Buckets:['SYNC_ASSETS'],
  bindings:{...Object.fromEntries(Object.entries(environment(null,null)).filter(([,v])=>typeof v==='string')),PRO_CREDENTIAL_PEPPER:TEST_PRO_PEPPER}};
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{...worker,name:'one'},{...worker,name:'two'}]}));
 t.after(()=>mf.dispose());const db=await mf.getD1Database('SYNC_DB','one'),r2=await mf.getR2Bucket('SYNC_ASSETS','one'),source=seed();t.after(()=>source.close());await seedTestPro(source);
 const schema=source.raw.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all();
 for(const row of schema)await db.prepare(row.sql).run();
 for(const table of schema.filter(r=>r.type==='table'))for(const row of source.raw.prepare(`SELECT * FROM ${table.name}`).all()){
  const keys=Object.keys(row);await db.prepare(`INSERT INTO ${table.name} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...Object.values(row)).run();
 }
 await db.prepare('CREATE TABLE test_cleanup_gate(phase TEXT)').run();
 await db.prepare("INSERT INTO test_cleanup_gate VALUES ('initial')").run();
 return {mf,db,r2};
}

test('actual HTTP Worker + D1 + R2: paused delete rejects push and resumes safely',async t=>{
 const {mf,db,r2}=await runtime(t),f=await lifecycleFixture({db,r2});
 const cleanup=mf.dispatchFetch('https://fixture.test/__fixture__/cleanup');
 // Release even on an assertion failure so the worker cannot hang the test runner.
 try {
  let waiting=false;
  for(let i=0;i<100&&!waiting;i++){waiting=(await (await mf.dispatchFetch('https://fixture.test/__fixture__/waiting')).json()).waiting;if(!waiting)await new Promise(r=>setTimeout(r,10));}
  assert.ok(waiting,'cleanup reached actual R2 delete boundary');
  const req=jsonRequest('/v1/sync/push',{appId:'port',mode:'sync',operations:[await f.operation()]});
  req.headers.set('X-Sound-Cruise-Pro-Authorization',`Bearer ${TEST_PRO_TOKEN}`);
  const response=await mf.dispatchFetch(req.url,{method:'POST',headers:Object.fromEntries(req.headers),body:await req.text()});
  assert.equal(response.status,409);assert.equal((await response.json()).code,'asset_reference_unavailable');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_changes').first()).n,0);assert.ok(await r2.head(f.key));
 } finally {await mf.dispatchFetch('https://fixture.test/__fixture__/release');await cleanup;}
 assert.equal(await r2.head(f.key),null);assert.equal((await f.row()).state,'deleted');
});

test('actual D1/R2: two repositories race claim and concurrently retry the immutable deletion',async t=>{
 const {db,r2}=await runtime(t),f=await lifecycleFixture({db,r2}),second=createD1AssetRepository(db.withSession('first-primary'));
 const row=await f.row(),claims=await Promise.all([f.repo.claimCleanup(row,Date.now()),second.claimCleanup(row,Date.now())]);
 assert.equal(claims.filter(Boolean).length,1);
 const claim=await f.repo.getCleanupClaim(f.assetId);
 const results=await Promise.all([recoverAssetDeletion(f.repo,r2,claim),recoverAssetDeletion(second,r2,claim)]);
 assert.deepEqual(results,['deleted','deleted']);assert.equal(await r2.head(f.key),null);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_asset_deletions').first()).n,1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_authority_cleanup_claims').first()).n,0);
});

test('two actual Worker instances share D1/R2 and concurrently execute cleanup safely',async t=>{
 const {mf,db,r2}=await runtime(t),f=await lifecycleFixture({db,r2});
 const [one,two]=await Promise.all([mf.getWorker('one'),mf.getWorker('two')]);
 const responses=await Promise.all([one.fetch('https://fixture.test/__fixture__/cleanup-immediate'),two.fetch('https://fixture.test/__fixture__/cleanup-immediate')]);
 assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.equal(await r2.head(f.key),null);
 assert.equal((await f.row()).state,'deleted');
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_asset_deletions').first()).n,1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_authority_cleanup_claims').first()).n,0);
});
