// Actual local D1. No route, remote binding, Worker config or production DB.
import test from 'node:test';import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {backendFixture,DEVICE_PEPPER} from './account-save-transaction-fixture.js';
import {TEST_PRO_PEPPER} from './pro-entitlement-fixture.js';
import {createIsolatedWriterPolicy} from '../src/writer-fence.js';
import {createIsolatedAccountSaveTransaction} from '../src/account-save-transaction.js';
test('actual local workerd D1: Account revoke race, atomic CAS/receipt, two-tab serialization, readback',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture");}}',compatibilityDate:'2026-09-01',d1Databases:{SYNC_DB:'save-transaction-fixture'}}));t.after(()=>mf.dispose());
 const db=await mf.getD1Database('SYNC_DB'),s=await backendFixture({clock:{server:Date.now()}});t.after(()=>s.dispose());
 const schema=s.db.raw.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all();
 for(const row of schema)await db.prepare(row.sql).run();const seed=[];for(const table of schema.filter(r=>r.type==='table'))for(const row of s.db.raw.prepare('SELECT * FROM '+table.name).all()){
  const k=Object.keys(row);seed.push(db.prepare(`INSERT INTO ${table.name} (${k.join(',')}) VALUES (${k.map(()=>'?').join(',')})`).bind(...Object.values(row)));}
 await db.batch([db.prepare('PRAGMA defer_foreign_keys=ON'),...seed]);
 const owner=createIsolatedAccountSaveTransaction({db,policy:createIsolatedWriterPolicy('A'),accountPepper:s.pepper,devicePepper:DEVICE_PEPPER,proPepper:TEST_PRO_PEPPER,fixtureOnly:true});t.after(()=>owner.dispose());
 const q=await s.request(),p=await owner.prepare(q,s.credentials);assert(p.ok,p.reason);
 await db.prepare('UPDATE sync_account_devices SET revoked_at=1').run();assert.equal((await owner.commit(p)).ok,false);assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_changes').first()).n,0);
 await db.prepare('UPDATE sync_account_devices SET revoked_at=NULL').run();const a=await owner.prepare(await s.request(),s.credentials),b=await owner.prepare(await s.request({bpm:151}),s.credentials);assert(a.ok,a.reason);assert(b.ok,b.reason);
 const result=await Promise.all([owner.commit(a),owner.commit(b)]);assert.equal(result.filter(r=>r.ok).length,1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_changes').first()).n,1);
 const winner=result[0].ok?a:b;assert((await owner.reconcile(winner.binding,s.credentials)).ok);
 await db.prepare('UPDATE sync_account_devices SET credential_expires_at=credential_issued_at+1').run();assert.equal((await owner.prepare(await s.request({revision:1}),s.credentials)).ok,false);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_changes').first()).n,1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_writer_fence_assertion').first()).n,0);
});
