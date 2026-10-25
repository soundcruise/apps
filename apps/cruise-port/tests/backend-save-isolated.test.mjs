import test from 'node:test';
import assert from 'node:assert/strict';
import {backendSaveFixture} from './authority-store/backend-save-fixture.mjs';
import {createIsolatedBackendSaveCoordinator,createIsolatedBackendSavePending} from '../port-backend-save-isolated.mjs';
import {readFile} from 'node:fs/promises';
const yes=p=>assert.equal(p.ok,true,p.reason);
test('actual SQL owner + separate local Authority: explicit two outcomes, readback and continued save',async t=>{
 const x=await backendSaveFixture(t),account=await x.rows(),p=await x.prepare();yes(p);const r=await x.coordinator.commit(p);yes(r);assert(r.backendCommitted&&r.localCommitted);assert.equal(r.canWrite,false);
 const pin=await x.pending.read(p.operationId);assert(pin);yes(await x.coordinator.recover(p));assert.deepEqual(await x.rows(),account);
 const n=await x.prepare(151,1);yes(n);yes(await x.coordinator.commit(n));assert.equal(x.f.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,2);
});
for(const phase of ['before-commit','after-commit'])test('local '+phase+' failure keeps SQL result and immutable backup, recovery does not resend',async t=>{
 let once=true;const x=await backendSaveFixture(t,{localCheckpoint:p=>{if(p===phase&&once){once=false;throw Error('local-crash');}}}),p=await x.prepare();yes(p);
 const pin=await x.pending.read(p.operationId),r=await x.coordinator.commit(p);assert.equal(r.ok,false);assert.equal(r.backendCommitted,true);assert.deepEqual(await x.pending.read(p.operationId),pin);
 const before=x.f.state(),h=await x.head(),recovered=await x.coordinator.recover(p);assert.equal(recovered.backendCommitted,true);assert.equal(recovered.localCommitted,phase==='after-commit');assert.deepEqual(await x.head(),h);assert.equal(x.f.state(),before);
});
test('backend ack loss remains unknown, reopen reconciles historical backend only without implicit local commit',async t=>{
 let once=true;const x=await backendSaveFixture(t,{backendCheckpoint:p=>{if(p==='after-transaction'&&once){once=false;throw Error('ack-lost');}}}),p=await x.prepare();yes(p);const before=await x.head();assert.equal((await x.coordinator.commit(p)).ok,false);
 x.coordinator.dispose();const reopened=createIsolatedBackendSaveCoordinator(x.options);t.after(()=>reopened.dispose());const r=await reopened.recover(p);assert(r.backendCommitted);assert.equal(r.localCommitted,false);assert.deepEqual(await x.head(),before);assert(await x.pending.read(p.operationId));
});
test('authorization backend timeout preserves existing data and never attempts local commit',async t=>{
 const x=await backendSaveFixture(t,{timeoutMs:15,wrapBackend:b=>({...b,commit:()=>new Promise(()=>{})})}),p=await x.prepare();yes(p);const before=await x.head();assert.equal((await x.coordinator.commit(p)).reason,'backend-outcome-unknown');assert.deepEqual(await x.head(),before);assert(await x.pending.read(p.operationId));assert.equal(x.f.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);
});
test('revocation after prepare rejects whole SQL mutation; local prepared and pending remain',async t=>{
 const x=await backendSaveFixture(t),p=await x.prepare();yes(p);const before=await x.head(),pin=await x.pending.read(p.operationId);
 x.f.db.raw.exec("UPDATE sync_accounts SET state='deleting' WHERE id='A'");assert.equal((await x.coordinator.commit(p)).ok,false);assert.deepEqual(await x.head(),before);assert.deepEqual(await x.pending.read(p.operationId),pin);assert.equal(x.f.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);
});
test('missing or spoofed backend response cannot grant local commit, authoritative reconciliation required',async t=>{
 const x=await backendSaveFixture(t,{wrapBackend:b=>({...b,reconcile:async()=>({ok:true})})}),p=await x.prepare();yes(p);const h=await x.head();assert.equal((await x.coordinator.commit(p)).ok,false);assert.deepEqual(await x.head(),h);assert(await x.pending.read(p.operationId));
});
test('two tabs/CAS: one SQL and local success; losing ticket and unrelated backup are retained',async t=>{
 const x=await backendSaveFixture(t),tab=await x.secondTab();const a=await x.prepare(148),b=await tab.prepare({operationId:crypto.randomUUID(),bpm:150,expectedBackendRevision:0});yes(a);yes(b);
 const results=await Promise.all([x.coordinator.commit(a),tab.commit(b)]);assert.equal(results.filter(r=>r.ok).length,1,JSON.stringify(results));assert(await x.pending.read(a.operationId));assert(await x.pending.read(b.operationId));assert.equal(x.f.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,1);
});
test('same operation ID/different pending cannot overwrite original; distinct IDs remain independent',async t=>{
 const x=await backendSaveFixture(t),p=await x.prepare();yes(p);const pin=await x.pending.read(p.operationId),other=createIsolatedBackendSavePending({indexedDB:x.indexedDB,scopeName:x.scope.name});
 await assert.rejects(other.claim({...pin,checksum:'bad'}),/conflict/);assert.deepEqual(await other.read(p.operationId),pin);assert.equal((await x.prepare(152,0,p.operationId)).reason,'backend-pending-requires-recovery');
});
test('prepared-only crash recovery proves neither result and does not publish or delete pending',async t=>{
 const x=await backendSaveFixture(t),p=await x.prepare();yes(p);x.coordinator.dispose();const fresh=createIsolatedBackendSaveCoordinator(x.options);t.after(()=>fresh.dispose());const h=await x.head(),r=await fresh.recover(p);assert.equal(r.backendCommitted,false);assert.equal(r.localCommitted,false);assert.deepEqual(await x.head(),h);assert(await x.pending.read(p.operationId));
});
test('switch without subscription notification is detected from persistent source, late A is not used',async t=>{
 const x=await backendSaveFixture(t),p=await x.prepare();yes(p);const before=await x.head();const source={...x.options.source,current:async()=>false};
 const remote=createIsolatedBackendSaveCoordinator({...x.options,source});t.after(()=>remote.dispose());assert.equal((await remote.recover(p)).ok,false);assert.deepEqual(await x.head(),before);assert(await x.pending.read(p.operationId));
});
test('new modules are absent from product startup/import graph and retain no writer capability',async()=>{
 for(const file of ['../../cruise-studio/js/app.js','../index.html','../port-account-provider.mjs'])assert.doesNotMatch(await readFile(new URL(file,import.meta.url),'utf8'),/port-backend-save-isolated|account-save-transaction/);
 assert.throws(()=>createIsolatedBackendSaveCoordinator({}),/scope|environment|invalid|required/i);
});
for(const stage of ['reconcile-throw','before-local-throw','local-throw'])test('proven backend fact survives '+stage+' and pending is kept',async t=>{
 const x=await backendSaveFixture(t,{wrapBackend:b=>stage==='reconcile-throw'?{...b,reconcile(){throw Error('readback-offline');}}:b,
  coordinatorCheckpoint:p=>{if(stage==='before-local-throw'&&p==='before-local')throw Error('coordinator-crash');},
  localOwner:o=>stage==='local-throw'?{...o,commit(){throw Error('local-crash');}}:o}),p=await x.prepare();yes(p);const before=await x.head(),r=await x.coordinator.commit(p);
 assert.equal(r.ok,false);assert.equal(r.backendCommitted,true);assert.equal(r.localCommitted,false);assert.equal(r.accountId,'A');assert.equal(r.operationId,p.operationId);assert.deepEqual(await x.head(),before);assert(await x.pending.read(p.operationId));
});
test('readonly recovery preserves proven SQL result if local receipt read throws',async t=>{
 const x=await backendSaveFixture(t),p=await x.prepare();yes(p);yes(await x.coordinator.commit(p));const c=createIsolatedBackendSaveCoordinator({...x.options,localOwner:{...x.owner,recover(){throw Error('local-readback-offline');}}});t.after(()=>c.dispose());
 const r=await c.recover(p);assert.equal(r.ok,false);assert.equal(r.backendCommitted,true);assert.equal(r.localCommitted,false);assert.equal(r.historical,true);assert.equal(r.accountId,'A');assert.equal(r.operationId,p.operationId);assert(await x.pending.read(p.operationId));
});
