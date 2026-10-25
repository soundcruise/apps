import test from 'node:test';import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {credentialAdoptionFixture} from '../../../apps/cruise-port/tests/authority-store/credential-adoption-fixture.mjs';
import {createIsolatedAccountSaveRoutes} from '../src/account-save-routes-isolated.js';
for(const scenario of ['normal','revoked-before-CAS','ACK-loss'])test('actual disposable D1 + Account IDB adoption: '+scenario,async t=>{
 const x=await credentialAdoptionFixture(t),mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("isolated");}}',compatibilityDate:'2026-09-01',d1Databases:{SYNC_DB:'credential-adoption'}}));t.after(()=>mf.dispose());
 const now=Date.now();x.s.db.raw.prepare('UPDATE sync_account_devices SET credential_issued_at=?,credential_expires_at=?,credential_recovery_until=?,credential_clock_floor=?').run(now-1000,now+120000,now+60000,now);
 const db=await mf.getD1Database('SYNC_DB'),schema=x.s.db.raw.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all();for(const v of schema)await db.prepare(v.sql).run();const rows=[];
 for(const table of schema.filter(r=>r.type==='table'))for(const row of x.s.db.raw.prepare('SELECT * FROM '+table.name).all()){const k=Object.keys(row);rows.push(db.prepare(`INSERT INTO ${table.name} (${k.join(',')}) VALUES (${k.map(()=>'?').join(',')})`).bind(...Object.values(row)));}await db.batch([db.prepare('PRAGMA defer_foreign_keys=ON'),...rows]);
 const routes=createIsolatedAccountSaveRoutes({...x.s.routeOptions,db});t.after(()=>routes.dispose());const owner=await x.make({dispatch:req=>routes.handle(req),checkpoint:p=>{if(scenario==='ACK-loss'&&p==='after-adoption-confirmed')throw Error('ack');}}),c=await owner.inspect({renewalOperationId:x.h.operationId,generation:'g1'});assert(c.ok,c.reason);
 const before=await x.rows(),op=crypto.randomUUID();if(scenario==='revoked-before-CAS')await db.prepare('UPDATE sync_account_devices SET revoked_at=?').bind(now).run();
 const r=await owner.adopt({candidate:c,operationId:op,explicit:true});assert.equal(r.ok,scenario==='normal');
 if(scenario==='revoked-before-CAS'){assert.deepEqual(await x.rows(),before);assert.equal((await owner.reconcile({operationId:op})).ok,false);}
 else{const reopened=await x.make({dispatch:req=>routes.handle(req),checkpoint:async()=>{}}),proof=await reopened.reconcile({operationId:op});assert(proof.ok,proof.reason);assert.equal(proof.canWrite,false);assert.equal((await x.record()).accountCredential,x.renewed.credential);assert((await x.head()).snapshot.control.identityInvalidated);assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_changes').first()).n,0);}
});
