import test from 'node:test';import assert from 'node:assert/strict';
import {backendSaveFixture} from './authority-store/backend-save-fixture.mjs';
import {ownerRouteFixture} from '../../../workers/sound-cruise-sync/test/account-save-routes-fixture.js';
import {createIsolatedOwnerRouteTransport} from './authority-store/owner-route-transport.mjs';
import {createIsolatedBackendSaveCoordinator} from '../port-backend-save-isolated.mjs';
async function setup(t,{checkpoint,localCheckpoint,dispatch,timeoutMs=1000}={}){
 const x=await backendSaveFixture(t,{localCheckpoint}),s=await ownerRouteFixture({existing:x.f,checkpoint});t.after(()=>s.dispose());
 const backend=createIsolatedOwnerRouteTransport({url:'https://owner-route.invalid/__isolated/account/v1/',dispatch:dispatch?req=>dispatch(req,s):req=>s.routes.handle(req),credentials:()=>s.credentials,fixtureOnly:true}),c=createIsolatedBackendSaveCoordinator({...x.options,backend,timeoutMs});t.after(()=>c.dispose());return {...x,s,c,prepare:()=>c.prepare({operationId:crypto.randomUUID(),bpm:150,expectedBackendRevision:0})};
}
test('authenticated Request/Response transport -> same SQL owner -> independent local Authority succeeds',async t=>{
 const x=await setup(t),p=await x.prepare();assert(p.ok,p.reason);const rows=await x.rows(),r=await x.c.commit(p);assert(r.ok,r.reason);assert(r.backendCommitted&&r.localCommitted);assert((await x.c.recover(p)).ok);assert.deepEqual(await x.rows(),rows);
});
test('renew starts after prepare: route denies, no dataset mutation and original pending retained',async t=>{
 const x=await setup(t),p=await x.prepare();assert(p.ok);const before=await x.head(),ticket=await x.pending.read(p.operationId);assert.equal((await x.s.send('credential/renew/begin',x.s.lifecycle())).status,200);assert.equal((await x.c.commit(p)).ok,false);assert.deepEqual(await x.head(),before);assert.deepEqual(await x.pending.read(p.operationId),ticket);assert.equal(x.f.db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,0);
});
for(const condition of ['local-failure','lost-backend-ack','reconcile-timeout'])test('route partial result '+condition+' keeps per-operation backup and never replays',async t=>{
 const x=await setup(t,{timeoutMs:20,localCheckpoint:p=>{if(condition==='local-failure'&&p==='before-commit')throw Error('local-abort');},checkpoint:p=>{if(condition==='lost-backend-ack'&&p==='after-transaction')throw Error('ack-lost');},dispatch:async(req,s)=>condition==='reconcile-timeout'&&req.url.endsWith('/reconcile')?new Promise(()=>{}):s.routes.handle(req)});
 const p=await x.prepare();assert(p.ok,p.reason);const before=await x.head(),r=await x.c.commit(p);assert.equal(r.ok,false);assert.deepEqual(await x.head(),before);assert(await x.pending.read(p.operationId));const data=x.f.state();assert.equal((await x.c.commit(p)).ok,false);assert.equal(x.f.state(),data);
 if(condition!=='reconcile-timeout'){const recovered=await x.c.recover(p);assert(recovered.backendCommitted);assert.equal(recovered.localCommitted,false);}
});
test('foreign credential cannot reconcile old account packet or change normal account data',async t=>{
 const x=await setup(t),p=await x.prepare();assert(p.ok);assert((await x.c.commit(p)).ok);const b=await x.f.otherAccount('B');x.s.credentials.accountAuthorization=b.credentials.accountAuthorization;const before=x.f.state(),r=await x.c.recover(p);assert.equal(r.backendCommitted,false);assert.equal(r.ok,false);assert.equal(x.f.state(),before);assert(await x.pending.read(p.operationId));b.owner.dispose();
});
