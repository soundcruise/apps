import test from 'node:test';import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {ownerRouteFixture} from './account-save-routes-fixture.js';
import {createIsolatedAccountSaveRoutes} from '../src/account-save-routes-isolated.js';
test('actual local D1: authenticated routes, renew/revoke ordering, old receipt with new credential and denied rollback',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture");}}',compatibilityDate:'2026-09-01',d1Databases:{SYNC_DB:'owner-lifecycle-fixture'}}));t.after(()=>mf.dispose());
 const db=await mf.getD1Database('SYNC_DB'),s=await ownerRouteFixture({clock:{server:Date.now()}});t.after(()=>s.dispose());
 const schema=s.db.raw.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all();for(const v of schema)await db.prepare(v.sql).run();const rows=[];
 for(const table of schema.filter(r=>r.type==='table'))for(const row of s.db.raw.prepare('SELECT * FROM '+table.name).all()){const k=Object.keys(row);rows.push(db.prepare(`INSERT INTO ${table.name} (${k.join(',')}) VALUES (${k.map(()=>'?').join(',')})`).bind(...Object.values(row)));}await db.batch([db.prepare('PRAGMA defer_foreign_keys=ON'),...rows]);
 let revoke=false;const routes=createIsolatedAccountSaveRoutes({...s.routeOptions,db,checkpoint:async p=>{if(revoke&&p==='before-transaction')await db.prepare('UPDATE sync_account_devices SET revoked_at=1').run();}});t.after(()=>routes.dispose());
 const send=(path,q,headers)=>s.send(path,q,{owner:routes,headers}),q=await s.saveRequest();assert.equal((await send('save',q)).status,200);
 const begin=await send('credential/renew/begin',s.lifecycle());assert.equal(begin.status,200,JSON.stringify(begin));
 const req={...s.lifecycle(),expectedLeaseRevision:begin.body.credentialLeaseRevision,transitionId:begin.body.transitionId},finish=await send('credential/renew/finish',req);assert.equal(finish.status,200,JSON.stringify(finish));s.adopt(finish);
 assert.equal((await send('reconcile',{binding:s.binding(q)})).status,200);
 const next=await s.saveRequest({revision:1,bpm:154});next.request.credentialVersion=finish.body.credentialVersion;next.request.credentialLeaseRevision=finish.body.credentialLeaseRevision;
 const {exactRequestDigest}=await import('../src/account-credential-lifecycle.js');next.requestDigest=await exactRequestDigest(next.request);revoke=true;assert.notEqual((await send('save',next)).status,200);assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_changes').first()).n,1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_writer_fence_assertion').first()).n,0);
});
