import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore, bpmHandle, raw, dump } from './authority-store/pointer-fixture.mjs';
import { createTestAuthorityScope } from './authority-store/test-authority.mjs';
import { control, values } from './authority-store/fixture.mjs';
import { openIDBAuthorityStore, claimPortAuthorityIssuer } from '../port-indexeddb-authority-store.mjs';
import { captureAccountTransition, accountTransitionRow, accountTransitionFingerprint, validateAccountTransition } from '../port-account-transition-intent.mjs';
const identity = id => ({ ...control().identity, ownership:'bound-account', accountId:id,
    accountGeneration:7, membershipId:'member-'+id, membershipGeneration:11 });
const request = (id='switch') => ({ generation:'g1', operationId:id, identity:identity('A'), expectedEpoch:1,
    expectedPointerEpoch:1, kind:'switch', destination:{accountId:'B',accountDeviceId:'device-B'} });
async function setup(t) {
    const factory=new IDBFactory(),scope=createTestAuthorityScope({indexedDB:factory,name:'sound-cruise-port-authority-v1-fixture-intent',partitionId:'fixture-partition'});
    const store=await openIDBAuthorityStore(scope),issuer=claimPortAuthorityIssuer(scope);
    assert((await store.initialize({generation:'g1',control:{...control(),identity:identity('A')},values:values(),operationId:'seed'})).ok);
    t.after(()=>store.dispose());
    return {factory,scope,store,issuer,capability:issuer.issue('control:invalidate',{generation:'g1'})};
}
const begin=(x,q=request())=>x.store.beginAccountTransition({...q,capability:x.capability});
test('typed bounded non-secret request rejects unknown/future/malformed/destination credential fields',()=>{
    assert.deepEqual(captureAccountTransition(request()),request());
    for(const patch of [{schemaVersion:2},{kind:'unknown'},{expectedEpoch:0},{expectedPointerEpoch:0},
        {identity:{...identity('A'),accountCredential:'must-not-persist'}},
        {destination:{accountId:'B',accountDeviceId:'device-B',accountCredential:'must-not-persist'}},
        {destination:{accountId:'x'.repeat(129),accountDeviceId:null}},{kind:'detach',destination:request().destination}])
        assert.throws(()=>captureAccountTransition({...request(),...patch}));
    const row=accountTransitionRow(request(),{...control(),identity:identity('A')});
    for(const edit of [r=>r.schemaVersion=2,r=>r.accountTransition.schemaVersion=2,r=>r.accountTransition.phase='cancelled',
        r=>r.accountTransition.after.identityInvalidated=false,r=>r.accountTransition.request.operationId='other']) {
        const copy=structuredClone(row);edit(copy);assert.throws(()=>validateAccountTransition(copy));
    }
    assert(!JSON.stringify(row).includes('Credential'));
});
test('begin atomically persists the actual admission restriction and intent, only resolves after complete',async t=>{
    const x=await setup(t),before=(await x.store.hydrate('g1')).snapshot,old=bpmHandle(x.store,before,'pending-old');
    let complete=false;const original=IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add=function(value,...args){if(value.kind==='account-transition')this.transaction.addEventListener('complete',()=>{complete=true;});return original.call(this,value,...args);};
    try{assert((await begin(x)).ok);assert.equal(complete,true);}finally{IDBObjectStore.prototype.add=original;}
    const facts=await x.store.accountTransitions('g1');assert.equal(facts.intents.length,1);assert.equal(facts.recoveryRequired,true);
    assert.equal((await x.store.hydrate('g1')).snapshot.control.identityInvalidated,true);
    assert.equal((await x.store.commit(old)).ok,false);
    assert.deepEqual((await x.store.hydrate('g1')).snapshot.values,before.values);
});
test('abort after Control put before intent add leaves neither accepted intent nor stop and permits earlier valid save',async t=>{
    const x=await setup(t),before=await dump(x),original=IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add=function(value,...args){if(value.kind==='account-transition'){this.transaction.abort();throw Error('fixture-after-stop-request');}return original.call(this,value,...args);};
    try{assert.equal((await begin(x)).ok,false);}finally{IDBObjectStore.prototype.add=original;}
    assert.deepEqual(await dump(x),before);
    assert((await x.store.commit(bpmHandle(x.store,(await x.store.hydrate('g1')).snapshot,'safe-before-accepted-begin'))).ok);
});
test('exact retry is historical only, payload/oplog/reservation collisions do not retag or publish',async t=>{
    const x=await setup(t);assert((await begin(x)).ok);const before=await dump(x);
    const replay=await begin(x);assert.equal(replay.replayed,true);assert.equal(replay.operationAuthorized,false);
    for(const patch of [{destination:{accountId:'C',accountDeviceId:null}},{expectedEpoch:2},{kind:'detach',destination:null}])
        assert.equal((await begin(x,{...request(),...patch})).reason,'operation-id-payload-conflict');
    assert.equal((await begin(x,request('seed'))).reason,'operation-id-payload-conflict');
    assert.deepEqual(await dump(x),before);
});
test('foreign identity, stale epoch and stale pointer never stop current B or reserve an operation',async t=>{
    const x=await setup(t),before=await dump(x);
    for(const patch of [{identity:identity('B')},{expectedEpoch:2},{expectedPointerEpoch:2}]) assert.equal((await begin(x,{...request(),...patch})).ok,false);
    assert.deepEqual(await dump(x),before);
});
test('reopen with missing notifications preserves recovery state, historical completion cannot resume A',async t=>{
    const x=await setup(t),receipt=await begin(x);assert(receipt.ok);x.store.dispose();
    const scope=createTestAuthorityScope({indexedDB:x.factory,name:x.scope.name,partitionId:'fixture-partition'}),store=await openIDBAuthorityStore(scope),issuer=claimPortAuthorityIssuer(scope);
    t.after(()=>store.dispose());
    assert.equal((await store.accountTransitions('g1')).recoveryRequired,true);
    assert.equal((await store.beginAccountTransition({...request(),capability:x.capability})).reason,'capability-invalid');
    const capability=issuer.issue('control:invalidate',{generation:'g1'});
    for(const copied of [receipt,structuredClone(receipt),undefined])
        assert.equal((await store.confirmAccountTransition({generation:'g1',operationId:'switch',capability,receipt:copied})).reason,'account-intent-receipt-invalid');
    assert.equal((await store.accountTransitions('g1')).recoveryRequired,true);
    assert.equal((await store.hydrate('g1')).readiness,'identity-invalidated');
    assert.equal((await store.commit(bpmHandle(store,(await store.hydrate('g1')).snapshot,'cannot-revive'))).ok,false);
});
test('malformed durable intent and missing barrier are not hidden by readonly recovery',async t=>{
    const x=await setup(t);assert((await begin(x)).ok);
    await raw(x,['control'],tx=>{const r=tx.objectStore('control').get('g1');r.onsuccess=()=>tx.objectStore('control').put({...r.result,identityInvalidated:false});});
    assert.equal((await x.store.accountTransitions('g1')).reason,'account-intent-barrier-missing');
    await raw(x,['reservations'],tx=>{const r=tx.objectStore('reservations').get(['g1','switch']);r.onsuccess=()=>{r.result.accountTransition.schemaVersion=2;tx.objectStore('reservations').put(r.result);};});
    assert.equal((await x.store.accountTransitions('g1')).reason,'account-intent-invalid');
});
test('capacity is bounded, unresolved facts are never silently garbage collected',async t=>{
    const x=await setup(t),row=accountTransitionRow(request(),{...control(),identity:identity('A')});
    // Privileged damaged-history fixture: exercise the declared hard bound even
    // though normal irreversible stopping admits at most one begin per generation.
    await raw(x,['reservations'],tx=>{for(let n=0;n<64;n++){const copy=structuredClone(row);copy.operationId='history-'+n;copy.accountTransition.request.operationId=copy.operationId;copy.fingerprint=accountTransitionFingerprint(copy.accountTransition.request);tx.objectStore('reservations').add(copy);}});
    const before=await dump(x);assert.equal((await begin(x)).reason,'account-intent-capacity');assert.deepEqual(await dump(x),before);
});
test('current Authority B and its prepared operation survive a delayed begin for superseded A', async t => {
    const x=await setup(t);
    assert((await x.store.initialize({generation:'g2',control:{...control('g2'),identity:identity('B')},values:values(),operationId:'seed-B'})).ok);
    const current=(await x.store.hydrate('g2')).snapshot,preparedB=bpmHandle(x.store,current,'prepared-B');
    const before=await dump(x),stale=await begin(x);
    assert.equal(stale.reason,'generation-not-active');assert.deepEqual(await dump(x),before);
    assert((await x.store.commit(preparedB)).ok);
    assert.equal((await x.store.hydrate('g2')).snapshot.control.identityInvalidated,false);
    assert.equal((await x.store.accountTransitions('g1')).intents.length,0);
});
test('existing nonempty owner identity syntax is preserved with bounded punctuation values', () => {
    const q={...request(),identity:{...identity('account:A'),partitionId:'port:partition/1',membershipId:'member:A'},
        destination:{accountId:'account:B',accountDeviceId:'device:B'}};
    assert.deepEqual(captureAccountTransition(q),q);
});
test('pending existing Control reservation collision cannot be reused for an Account intent', async t => {
    const x=await setup(t),operationId='existing-control';
    await x.store.prepareControlOperation('suspendWrites',{generation:'g1',operationId,identity:identity('A'),
        capability:x.issuer.issue('control:suspend',{generation:'g1'})});
    const before=await dump(x);
    assert.equal((await begin(x,request(operationId))).reason,'operation-id-payload-conflict');
    assert.deepEqual(await dump(x),before);
});
