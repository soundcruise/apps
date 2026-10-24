// Local workerd/D1 only. No remote bindings, account secret or product route.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {seedAccountOwnerContext} from './account-owner-context-fixture.js';
import {readAccountOwnerContext} from '../src/account-owner-context.js';
const {Miniflare,convertV4MiniflareOptions}=createRequire(import.meta.url)('miniflare');
test('native workerd/D1 Account owner primary snapshot and lifecycle',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,port:0,host:'127.0.0.1',
  script:'export default {fetch(){return new Response("isolated owner");}}',compatibilityDate:'2026-09-01',d1Databases:{DB:'owner-isolated'}}));
 t.after(()=>mf.dispose());const db=await mf.getD1Database('DB'),source=await seedAccountOwnerContext();t.after(()=>source.db.close());
 const schema=source.db.raw.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all();
 for(const row of schema)await db.prepare(row.sql).run();
 // Migration table recreation changes schema enumeration order. Seed the valid
 // graph in one transaction; defer FK checks until commit, never disable them.
 const inserts=[db.prepare('PRAGMA defer_foreign_keys = ON')];
 for(const table of schema.filter(r=>r.type==='table'))for(const row of source.db.raw.prepare('SELECT * FROM '+table.name).all()){
  const keys=Object.keys(row);inserts.push(db.prepare(`INSERT INTO ${table.name} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...Object.values(row)));
 }
 await db.batch(inserts);assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
 const read=(binding=db)=>readAccountOwnerContext({db:binding,pepper:source.pepper,authorization:'Bearer '+source.account.accountCredential,
  requestId:crypto.randomUUID(),challenge:crypto.randomUUID(),now:()=>100000});
 await t.test('primary session API supplies exact linked Account/member generations',async()=>{const r=await read();assert.equal(r.ok,true);assert.equal(r.identity.membershipGeneration,11);assert.equal(r.identity.accountGeneration,7);assert.equal(r.canWrite,false);});
 await t.test('membership change visible in subsequent new primary session',async()=>{await db.prepare('UPDATE sync_account_memberships SET generation=12').run();const r=await read();assert.equal(r.identity.membershipGeneration,12);});
 await t.test('revocation after SELECT is historical only, following read denies',async()=>{
  const binding={withSession(mode){assert.equal(mode,'first-primary');const session=db.withSession(mode);return {prepare(sql){return {bind(...args){return {async first(){const row=await session.prepare(sql).bind(...args).first();await db.prepare('UPDATE sync_account_devices SET revoked_at=2').run();return row;}};}};}};}};
  const r=await read(binding);assert.equal(r.ok,true);assert.equal(r.operationAuthorized,false);assert.equal((await read()).code,'account_device_revoked');
 });
 await t.test('no Account activity touch or mutation receipt side effects',async()=>{assert.equal((await db.prepare('SELECT last_seen_at FROM sync_account_devices').first()).last_seen_at,1);assert.equal((await db.prepare('SELECT count(*) n FROM sync_account_activity').first()).n,0);});
});
