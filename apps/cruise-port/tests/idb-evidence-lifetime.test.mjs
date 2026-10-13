import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,dump,raw,IDBObjectStore,stage} from './authority-store/pointer-fixture.mjs';
import {control,values} from './authority-store/fixture.mjs';
import {createTestAuthorityScope} from './authority-store/test-authority.mjs';
import {openIDBAuthorityStore,claimPortAuthorityIssuer} from '../port-indexeddb-authority-store.mjs';
import {CONTROL_OPERATIONS} from '../port-authority-control.mjs';
const identity={...control().identity,ownership:'bound-account',accountId:'A',accountGeneration:2,membershipId:'member-A',membershipGeneration:3};
export async function lifetimeFixture(t,{action='renewFence',clock={wall:100000,mono:0,origin:'fixture-origin'}}={}){
 const factory=new IDBFactory(),scope=createTestAuthorityScope({indexedDB:factory,partitionId:'fixture-partition',now:()=>clock.wall,monotonicNow:()=>clock.mono,clockIdentity:()=>clock.origin}),store=await openIDBAuthorityStore(scope),issuer=claimPortAuthorityIssuer(scope);
 t.after(()=>store.dispose());const x={factory,scope,store,issuer,clock};
 assert((await store.initialize({generation:'g1',operationId:'seed',control:{...control(),identity},values:values()})).ok);
 if(action==='resumeWrites')assert((await store.suspendWrites({generation:'g1',operationId:'suspend',identity,capability:issuer.issue('control:suspend',{generation:'g1'})})).ok);
 return x;
}
export async function lifetimePacket(x,{action='renewFence',id='lifetime',evidenceId=id,issuedAt=100000,expiresAt=160000}={}){
 const s=(await x.store.hydrate('g1')).snapshot;
 const evidence=x.issuer.attestFixtureFence({source:'isolated-server',evidenceId,generation:'g1',pointerEpoch:s.pointer.pointerEpoch,controlEpoch:s.control.epoch,identity,fenceEpoch:s.control.fenceEpoch+(action==='renewFence'?1:0),issuedAt,expiresAt});
 const capability=x.issuer.issue(CONTROL_OPERATIONS[action],{generation:'g1'}),request={generation:'g1',operationId:id,identity,expectedEpoch:s.control.epoch,expectedPointerEpoch:s.pointer.pointerEpoch,capability,evidence};
 const handle=await x.store.prepareControlOperation(action,request);return {action,request,handle,evidence,capability};
}
for(const action of ['resumeWrites','renewFence'])test('regression: expired evidence cannot revive after wall rollback: '+action,async t=>{
 const x=await lifetimeFixture(t,{action}),p=await lifetimePacket(x,{action});
 x.clock.wall=170000;const expired=await x.store[action](p.handle);assert.equal(expired.reason,'control-evidence-stale');
 x.clock.wall=110000;const retried=await x.store[action](p.handle);
 assert.equal(retried.reason,'control-evidence-stale',JSON.stringify({sameHandle:true,sameEvidence:true,sameCapability:true,sameOperationId:true,expired,retried}));
});
import {evidenceLifetimeKey,validateEvidenceLifetimeRow} from '../port-authority-evidence-lifetime.mjs';
const lifetimeRow=async x=>(await dump(x)).reservations.find(r=>r.kind==='evidence-lifetime');
for(const action of ['resumeWrites','renewFence'])test('valid evidence commits before expiry: '+action,async t=>{
 const x=await lifetimeFixture(t,{action}),p=await lifetimePacket(x,{action});assert((await x.store[action](p.handle)).ok);
 const r=await lifetimeRow(x);validateEvidenceLifetimeRow(r);assert.equal(r.evidenceLifetime.expired,false);
});
for(const retry of ['same handle','same operationId raw','same evidence new operation'])test('expiration is sticky for '+retry,async t=>{
 const x=await lifetimeFixture(t),p=await lifetimePacket(x);x.clock.wall=170000;assert.equal((await x.store.renewFence(p.handle)).reason,'control-evidence-stale');x.clock.wall=110000;
 let input=p.handle;if(retry==='same operationId raw')input=p.request;if(retry==='same evidence new operation')input={...p.request,operationId:'new-id-old-evidence'};
 assert.equal((await x.store.renewFence(input)).reason,'control-evidence-stale');assert.equal((await lifetimeRow(x)).evidenceLifetime.expired,true);
});
for(const source of ['wall','mono'])test(source+' expiration persists after rollback',async t=>{
 const x=await lifetimeFixture(t),p=await lifetimePacket(x);x.clock[source]=source==='wall'?170000:31000;
 assert.equal((await x.store.renewFence(p.handle)).reason,'control-evidence-stale');x.clock[source]=source==='wall'?110000:1000;
 assert.equal((await x.store.renewFence(p.handle)).reason,'control-evidence-stale');assert.equal((await lifetimeRow(x)).evidenceLifetime.expired,true);
});
for(const source of ['wall','mono'])for(const seconds of [29,30,31])test(source+' margin '+seconds+' seconds',async t=>{
 const x=await lifetimeFixture(t),p=await lifetimePacket(x);x.clock[source]=(source==='wall'?100000:0)+(60-seconds)*1000;
 const result=await x.store.renewFence(p.handle);assert.equal(result.ok,seconds>=30,JSON.stringify(result));
 if(seconds<30){x.clock.wall=100000;x.clock.mono=0;assert.equal((await x.store.renewFence(p.handle)).reason,'control-evidence-stale');}
});
for(const kind of ['wall rollback','monotonic rollback','origin change','nonfinite wall','nonfinite mono','source throws'])test('clock invalidation cannot be undone: '+kind,async t=>{
 const x=await lifetimeFixture(t),p=await lifetimePacket(x);
 if(kind==='wall rollback')x.clock.wall=99999;if(kind==='monotonic rollback')x.clock.mono=-1;if(kind==='origin change')x.clock.origin='another-origin';
 if(kind==='nonfinite wall')x.clock.wall=NaN;if(kind==='nonfinite mono')x.clock.mono=Infinity;
 if(kind==='source throws')Object.defineProperty(x.clock,'mono',{configurable:true,get(){throw Error('clock unavailable');}});
 assert.equal((await x.store.renewFence(p.handle)).reason,'control-evidence-stale');
 Object.defineProperty(x.clock,'mono',{value:0,writable:true,configurable:true});x.clock.wall=100000;x.clock.origin='fixture-origin';
 assert.equal((await x.store.renewFence(p.handle)).reason,'control-evidence-stale');assert.equal((await lifetimeRow(x)).evidenceLifetime.invalidated,true);
});
test('re-attestation of the same ID does not reset deadline or expired latch',async t=>{
 const x=await lifetimeFixture(t),p=await lifetimePacket(x);x.clock.mono=31000;assert.equal((await x.store.renewFence(p.handle)).reason,'control-evidence-stale');x.clock.mono=0;
 const token=x.issuer.attestFixtureFence((await lifetimeRow(x)).evidenceLifetime.evidence);
 assert.equal((await x.store.renewFence({...p.request,evidence:token})).reason,'control-evidence-stale');
});
test('evidence ID cannot be reissued with extended expiry or changed identity',async t=>{
 const x=await lifetimeFixture(t);await lifetimePacket(x);const e=(await lifetimeRow(x)).evidenceLifetime.evidence;
 assert.throws(()=>x.issuer.attestFixtureFence({...e,issuedAt:110000,expiresAt:170000}),/control-evidence-identity-conflict/);
});
test('fresh evidence and explicit new operation succeeds after old expiry/rollback',async t=>{
 const x=await lifetimeFixture(t),p=await lifetimePacket(x);x.clock.wall=170000;assert.equal((await x.store.renewFence(p.handle)).ok,false);x.clock.wall=110000;
 const fresh=await lifetimePacket(x,{id:'fresh',issuedAt:110000,expiresAt:170000});assert((await x.store.renewFence(fresh.handle)).ok);
 assert.equal((await x.store.renewFence(p.handle)).ok,false);
});
async function peer(t,x){
 const clock={wall:110000,mono:0,origin:'different-renderer'},scope=createTestAuthorityScope({indexedDB:x.factory,partitionId:'fixture-partition',now:()=>clock.wall,monotonicNow:()=>clock.mono,clockIdentity:()=>clock.origin});
 const store=await openIDBAuthorityStore(scope);t.after(()=>store.dispose());return {clock,scope,store,issuer:claimPortAuthorityIssuer(scope)};
}
for(const expire of [false,true])test('same evidence cannot transfer to another runtime, expired='+expire,async t=>{
 const x=await lifetimeFixture(t),p=await lifetimePacket(x);if(expire){x.clock.wall=170000;assert.equal((await x.store.renewFence(p.handle)).ok,false);}
 const y=await peer(t,x),e=(await lifetimeRow(x)).evidenceLifetime.evidence,token=y.issuer.attestFixtureFence(e);
 const result=await y.store.renewFence({...p.request,evidence:token,capability:y.issuer.issue('control:renew',{generation:'g1'})});
 assert.equal(result.reason,'control-evidence-runtime-mismatch');
});
test('clone and plain evidence do not transfer a brand or lifetime authority',async t=>{
 const x=await lifetimeFixture(t),p=await lifetimePacket(x);
 for(const e of [structuredClone(p.evidence),{fresh:true,valid:true,epoch:999}])assert.equal((await x.store.renewFence({...p.request,evidence:e})).reason,'control-evidence-invalid');
});
test('dispose/reopen rejects old object and re-attested cached evidence identity',async t=>{
 const x=await lifetimeFixture(t),p=await lifetimePacket(x),e=(await lifetimeRow(x)).evidenceLifetime.evidence;x.store.dispose();x.store=await openIDBAuthorityStore(x.scope);t.after(()=>x.store.dispose());
 assert.equal((await x.store.renewFence(p.handle)).reason,'capability-invalid');
 const capability=x.issuer.issue('control:renew',{generation:'g1'});
 assert.equal((await x.store.renewFence({...p.request,capability})).reason,'control-evidence-invalid');
 const evidence=x.issuer.attestFixtureFence(e);assert.equal((await x.store.renewFence({...p.request,capability,evidence})).reason,'control-evidence-runtime-mismatch');
});
test('failed persistence retains private expiration and durable runtime ownership',async t=>{
 const x=await lifetimeFixture(t),p=await lifetimePacket(x),before=await dump(x),original=IDBObjectStore.prototype.put;x.clock.wall=170000;
 IDBObjectStore.prototype.put=function(value,...args){if(value.kind==='evidence-lifetime'&&value.evidenceLifetime.expired){this.transaction.abort();throw Error('injected abort');}return original.call(this,value,...args);};
 try{assert.equal((await x.store.renewFence(p.handle)).ok,false);}finally{IDBObjectStore.prototype.put=original;}
 assert.deepEqual(await dump(x),before);x.clock.wall=110000;
 const y=await peer(t,x),e=(await lifetimeRow(x)).evidenceLifetime.evidence;
 assert.equal((await y.store.renewFence({...p.request,capability:y.issuer.issue('control:renew',{generation:'g1'}),evidence:y.issuer.attestFixtureFence(e)})).reason,'control-evidence-runtime-mismatch');
 assert.equal((await x.store.renewFence(p.handle)).reason,'control-evidence-stale');assert.equal((await lifetimeRow(x)).evidenceLifetime.expired,true);
});
test('expired rejection preserves Control, head and pending operation identity',async t=>{
 const x=await lifetimeFixture(t),p=await lifetimePacket(x),before=await dump(x);x.clock.wall=170000;assert.equal((await x.store.renewFence(p.handle)).ok,false);const after=await dump(x);
 for(const n of Object.keys(before).filter(n=>n!=='reservations'))assert.deepEqual(after[n],before[n]);
 assert.deepEqual(after.reservations.filter(r=>r.kind==='control'),before.reservations.filter(r=>r.kind==='control'));
 const fresh=await lifetimePacket(x,{id:'fresh-helper',issuedAt:170000,expiresAt:230000});
 assert.equal((await x.store.renewFence({...fresh.request,operationId:p.request.operationId})).reason,'operation-id-payload-conflict');
});
test('successful fact replay after expiry/rollback/revoke never changes current Control',async t=>{
 const x=await lifetimeFixture(t),p=await lifetimePacket(x);assert((await x.store.renewFence(p.handle)).ok);
 assert((await x.store.revokeFence({generation:'g1',operationId:'revoke',identity,capability:x.issuer.issue('control:revoke',{generation:'g1'})})).ok);
 x.clock.wall=170000;const before=await dump(x);assert.equal((await x.store.renewFence(p.handle)).replayed,true);x.clock.wall=110000;assert.equal((await x.store.renewFence(p.request)).replayed,true);assert.deepEqual(await dump(x),before);
});
test('old pending reservation without lifetime data is not rebased from the current clock',async t=>{
 const x=await lifetimeFixture(t),p=await lifetimePacket(x),row=await lifetimeRow(x);await raw(x,['reservations'],tx=>tx.objectStore('reservations').delete(['g1',row.operationId]));
 assert.equal((await x.store.renewFence(p.request)).reason,'control-evidence-unregistered');assert.equal((await x.store.renewFence(p.handle)).reason,'control-evidence-unregistered');
});
