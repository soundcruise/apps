import {createIsolatedAccountSaveAdmissionOwner} from '../../../workers/sound-cruise-sync/src/account-save-admission.js';
import {createIsolatedPortSaveAdmission} from '../port-account-save-admission.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {backendSaveFixture} from './authority-store/backend-save-fixture.mjs';
import {testProAuthorization} from './authority-store/test-authority.mjs';
import {openIsolatedPortOwnerRepository} from '../port-owner-repository-isolated.mjs';
import {createIsolatedAccountSaveTransaction} from '../../../workers/sound-cruise-sync/src/account-save-transaction.js';
import {hashRecord} from '../../../workers/sound-cruise-sync/src/records.js';
const key='cruisePort.gearList';
async function setup(t,{checkpoint,proAllowed=true}={}){const x=await backendSaveFixture(t);let pro=proAllowed;
 const proAdapter={authorize:async q=>{if(!pro)throw Error('pro-revoked');return testProAuthorization(x.scope,{operationId:q.operationId,action:q.action});}};
 const accountOwner=createIsolatedAccountSaveAdmissionOwner({backend:x.server.backend,pepper:x.server.pepper,now:()=>x.clock.server,allowPortDataset:true});t.after(()=>accountOwner.dispose());
 const finalAdmission=createIsolatedPortSaveAdmission({scope:x.scope,mutationStore:x.mutationStore,owner:accountOwner,allowPortDataset:true});t.after(()=>finalAdmission.dispose());
 const owner=await openIsolatedPortOwnerRepository({scope:x.scope,indexedDB:x.indexedDB,generation:'g1',source:x.mutationStore,provider:x.provider,proAdapter,finalAdmission,checkpoint});t.after(()=>owner.dispose());
 return{...x,owner,setPro:v=>pro=v};}
async function prepare(x,name='Owner gear'){const base=x.owner.repository.inspect();return x.owner.prepare({expectedRevision:base.revision},draft=>{const gear=JSON.parse(draft.getItem(key));gear.items.push({...gear.items[0],id:crypto.randomUUID(),name,order:gear.items.length});draft.setItem(key,JSON.stringify(gear));return{ok:true};});}
test('authenticated Account Owner + branded Pro writes existing Port Authority; legacy storage is not the adopted source',async t=>{const x=await setup(t),h=await prepare(x),r=await x.owner.commit(h);assert(r.ok,r.reason);assert.equal((await x.store.hydrate('g1')).snapshot.values[key],r.state.values[key]);assert(JSON.parse(r.state.values[key]).items.some(a=>a.name==='Owner gear'));assert.equal((await x.owner.reconcile(h.operationId)).status,'HISTORICAL');assert.equal((await x.owner.commit(h)).ok,false);});
test('writer retirement and missing Pro refuse without mutation',async t=>{const x=await setup(t);x.setPro(false);await assert.rejects(prepare(x),/pro-revoked/);x.owner.retire();await assert.rejects(x.owner.refresh(),/retired/);});
test('Account generation change after form preparation refuses old form; no normal B mutation',async t=>{const x=await setup(t),h=await prepare(x),before=(await x.store.hydrate('g1')).snapshot.values;x.server.db.raw.exec('UPDATE sync_accounts SET generation=8');const r=await x.owner.commit(h);assert.equal(r.ok,false);assert.deepEqual((await x.store.hydrate('g1')).snapshot.values,before);});
test('lost local ACK is UNKNOWN, no automatic resend; explicit lookup resolves original operation',async t=>{let drop=true;const x=await setup(t,{checkpoint:phase=>{if(phase==='after-commit'&&drop){drop=false;throw Error('lost');}}}),h=await prepare(x),r=await x.owner.commit(h);assert.equal(r.status,'UNKNOWN');assert.equal((await x.owner.commit(h)).ok,false);assert.equal((await x.owner.reconcile(h.operationId)).status,'HISTORICAL');});
test('stale form CAS rejects after another committed local writer',async t=>{const x=await setup(t),first=await prepare(x,'first'),second=await prepare(x,'second');assert((await x.owner.commit(first)).ok);const r=await x.owner.commit(second);assert.equal(r.ok,false);const text=(await x.store.hydrate('g1')).snapshot.values[key];assert(text.includes('first'));assert(!text.includes('second'));});

test('Account changes at final boundary reject inside the Authority transaction',async t=>{let x;x=await setup(t,{checkpoint:p=>{if(p==='before-commit')x.server.db.raw.exec('UPDATE sync_accounts SET generation=8');}});const h=await prepare(x),before=(await x.store.hydrate('g1')).snapshot.values;const r=await x.owner.commit(h);assert.equal(r.ok,false);assert.deepEqual((await x.store.hydrate('g1')).snapshot.values,before);});
test('retirement at final boundary denies publication even after valid prepare',async t=>{let x;x=await setup(t,{checkpoint:p=>{if(p==='before-commit')x.owner.retire();}});const h=await prepare(x),before=(await x.store.hydrate('g1')).snapshot.values;assert.equal((await x.owner.commit(h)).ok,false);assert.deepEqual((await x.store.hydrate('g1')).snapshot.values,before);});
test('direct backend cannot replace the Account guard with a true-returning callback',async t=>{
 const x=await setup(t),{openIsolatedIDBRepositoryBackend}=await import('../port-indexeddb-repository-backend.mjs'),{PORT_DATASET_KEYS}=await import('../port-dataset-repository.js?v=1.26.0');
 const b=await openIsolatedIDBRepositoryBackend({scope:x.scope,generation:'g1'});t.after(()=>b.dispose());await b.hydrate();const id=crypto.randomUUID(),auth=testProAuthorization(x.scope,{operationId:id,action:'savePortDataset'}),before=(await x.store.hydrate('g1')).snapshot.values;
 x.server.db.raw.exec('UPDATE sync_accounts SET generation=8');
 const h=await b.prepareWrite({source:'savePortDataset',operationId:id,expectedRevision:b.inspect().revision,dependencyKeys:PORT_DATASET_KEYS,authorizationContext:auth.authorizationContext},d=>{const v=JSON.parse(d.getItem(key));v.items[0].name='must refuse';d.setItem(key,JSON.stringify(v));return{ok:true};});
 const r=await b.commitPreparedWrite(h,{commitGuard:auth.commitGuard,ownerCommitGuard:()=>true});assert.equal(r.ok,false);assert.equal(r.reason,'owner-commit-guard-required');assert.deepEqual((await x.store.hydrate('g1')).snapshot.values,before);
});
