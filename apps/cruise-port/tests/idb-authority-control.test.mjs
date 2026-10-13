import {validateEvidenceLifetimeRow} from '../port-authority-evidence-lifetime.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,raw,dump,patchPointer,stage,bpmHandle,IDBObjectStore,IDBFactory} from './authority-store/pointer-fixture.mjs';
import {control,values} from './authority-store/fixture.mjs';
import {createTestAuthorityScope} from './authority-store/test-authority.mjs';
import {openIDBAuthorityStore,claimPortAuthorityIssuer,createIsolatedIDBAuthorityScope} from '../port-indexeddb-authority-store.mjs';
import {openIsolatedIDBRepositoryBackend} from '../port-indexeddb-repository-backend.mjs';
import {CONTROL_OPERATIONS,captureControlRequest} from '../port-authority-control.mjs';
import {verifyCapability} from '../port-authority-capabilities.mjs';
const boundIdentity={...control().identity,ownership:'bound-account',accountId:'A',accountGeneration:2,membershipId:'member-A',membershipGeneration:3};
async function setup(t,{bound=false,now=Date.now}={}){
 const factory=new IDBFactory(),scope=createTestAuthorityScope({indexedDB:factory,partitionId:'fixture-partition',now}),store=await openIDBAuthorityStore(scope);
 t.after(()=>store.dispose());const x={factory,scope,store,issuer:claimPortAuthorityIssuer(scope)};
 const c={...control(),identity:bound?boundIdentity:control().identity};assert((await store.initialize({generation:'g1',control:c,values:values(),operationId:'seed'})).ok);return x;
}
async function request(x,action,id=action,overrides={}){
 const h=await x.store.hydrate('g1'),s=h.snapshot;
 return {generation:'g1',operationId:id,identity:s.control.identity,expectedEpoch:s.control.epoch,expectedPointerEpoch:s.pointer.pointerEpoch,
  capability:x.issuer.issue(CONTROL_OPERATIONS[action],{generation:'g1'}),...overrides};
}
const run=async(x,action,id,overrides)=>x.store[action](await request(x,action,id,overrides));
async function evidence(x,{fenceEpoch=2,now=Date.now(),...extra}={}){
 const current=(await x.store.hydrate('g1')).snapshot;return x.issuer.attestFixtureFence({controlEpoch:current.control.epoch,source:'isolated-server',evidenceId:'server-'+fenceEpoch+'-'+crypto.randomUUID(),generation:'g1',pointerEpoch:1,
  identity:boundIdentity,fenceEpoch,issuedAt:now,expiresAt:now+60000,...extra});
}
async function assertDenied(x,before,id){
 const after=await dump(x);for(const name of Object.keys(before).filter(n=>n!=='reservations'))assert.deepEqual(after[name],before[name]);
 for(const r of after.reservations.filter(r=>r.kind==='evidence-lifetime'))validateEvidenceLifetimeRow(r);
 const old=before.reservations.filter(r=>r.operationId!==id&&r.kind!=='evidence-lifetime'),kept=after.reservations.filter(r=>r.operationId!==id&&r.kind!=='evidence-lifetime');assert.deepEqual(kept,old);
 const row=after.reservations.find(r=>r.operationId===id);if(row){assert.equal(row.kind,'control');assert.equal(row.control.result,null);}
}
for(const [action,flag] of [['suspendWrites','suspended'],['revokeFence','fenceRevoked'],['invalidateIdentity','identityInvalidated'],['markRecoveryRequired','recoveryRequired']]){
 test(action+' stops idempotently, preserves identity/head, records every distinct ID',async t=>{
  const x=await setup(t),before=await dump(x),r=await run(x,action,'stop');assert(r.ok);assert.equal(r.changed,true);
  const h=await x.store.hydrate('g1');assert(h.ok);assert.equal(h.snapshot.control[flag],true);assert.equal(h.snapshot.control.epoch,2);
  assert.deepEqual(h.snapshot.control.identity,before.control[0].identity);
  assert.equal((await run(x,action,'another',{expectedEpoch:1})).changed,false,'stale epoch must not prevent a stop/no-op');
  const after=await dump(x);for(const key of ['head','manifests','records','oplog','pointer'])assert.deepEqual(after[key],before[key]);
  assert.equal(after.reservations.length,before.reservations.length+2);
 });
}
for(const action of ['resumeWrites','renewFence'])for(const kind of ['missing','forged','clone','scope','generation','purpose'])test(action+' rejects '+kind+' operator',async t=>{
 const x=await setup(t),good=await request(x,action);let capability;
 if(kind==='forged')capability={purpose:CONTROL_OPERATIONS[action],generation:'g1'};
 if(kind==='clone')capability=structuredClone(good.capability);
 if(kind==='scope'){const other=await setup(t);capability=other.issuer.issue(CONTROL_OPERATIONS[action],{generation:'g1'});}
 if(kind==='generation')capability=x.issuer.issue(CONTROL_OPERATIONS[action],{generation:'g2'});
 if(kind==='purpose')capability=x.issuer.issue('control:suspend',{generation:'g1'});
 const before=await dump(x);assert.equal((await x.store[action]({...good,capability})).reason,'capability-invalid');assert.deepEqual(await dump(x),before);
});
for(const action of Object.keys(CONTROL_OPERATIONS))test(action+' rejects migration publication capability',async t=>{
 const x=await setup(t);assert.equal((await run(x,action,'wrong',{capability:x.issuer.issue('migration-publication',{generation:'g1'})})).reason,'capability-invalid');
});
test('unknown action/payload and system ACK are fail-closed',async t=>{
 const x=await setup(t);assert.throws(()=>captureControlRequest('custom',{}),/control-action-invalid/);
 assert.equal((await run(x,'suspendWrites','unknown',{patch:{identity:boundIdentity}})).reason,'control-request-invalid');
 assert.equal((await run(x,'resumeWrites','ack',{capability:Object.freeze({ack:true})})).reason,'capability-invalid');
});
test('disposed/reopened runtime and same-name new scope cannot inherit capabilities or evidence',async t=>{
 const x=await setup(t,{bound:true}),r=await request(x,'renewFence','old',{evidence:await evidence(x)});x.store.dispose();
 assert.throws(()=>verifyCapability(r.capability,{scope:x.scope,generation:'g1',purpose:'control:renew'}),/capability-invalid/);
 x.store=await openIDBAuthorityStore(x.scope);t.after(()=>x.store.dispose());assert.equal((await x.store.renewFence(r)).reason,'capability-invalid');
 assert.equal((await run(x,'renewFence','e-old',{evidence:r.evidence})).reason,'control-evidence-invalid');
 const scope=createTestAuthorityScope({indexedDB:x.factory,partitionId:'fixture-partition',name:x.scope.name}),store=await openIDBAuthorityStore(scope);t.after(()=>store.dispose());
 assert.equal((await store.renewFence(r)).reason,'capability-invalid');
 assert((await run(x,'renewFence','fresh',{evidence:await evidence(x)})).ok);
});
for(const action of ['invalidateIdentity','markRecoveryRequired'])for(const lower of ['resumeWrites','renewFence'])test(action+' cannot be undone by '+lower,async t=>{
 const x=await setup(t,{bound:true});assert((await run(x,action,'latch')).ok);const before=await dump(x);
 assert.equal((await run(x,lower,'lower',{evidence:await evidence(x,{fenceEpoch:lower==='resumeWrites'?1:2})})).reason,'authority-invalidated');await assertDenied(x,before,'lower');
});
for(const action of ['resumeWrites','renewFence'])test(action+' strict epoch and pointer CAS',async t=>{
 const x=await setup(t,{bound:true}),e=await evidence(x,{fenceEpoch:action==='resumeWrites'?1:2});
 assert.equal((await run(x,action,'stale',{expectedEpoch:99,evidence:e})).reason,'control-stale');
 assert.equal((await run(x,action,'pointer',{expectedPointerEpoch:99,evidence:e})).reason,'pointer-stale');
});
for(const field of ['accountId','accountGeneration','membershipId','membershipGeneration'])test('renew rejects evidence '+field+' mismatch',async t=>{
 const x=await setup(t,{bound:true}),identity={...boundIdentity,[field]:typeof boundIdentity[field]==='number'?99:'B'};
 assert.equal((await run(x,'renewFence','bad',{evidence:await evidence(x,{identity})})).reason,'control-evidence-identity-mismatch');
});
for(const field of ['accountId','accountGeneration','membershipId','membershipGeneration'])test('Control cannot retag request '+field,async t=>{
 const x=await setup(t,{bound:true}),identity={...boundIdentity,[field]:typeof boundIdentity[field]==='number'?99:'B'};
 assert.equal((await run(x,'suspendWrites','bad',{identity})).reason,'control-identity-mismatch');
});
for(const kind of ['absent','plain','clone','expired','nonmonotonic','wrongPointer'])test('renew rejects '+kind+' server evidence',async t=>{
 const x=await setup(t,{bound:true});let e;
 if(kind==='plain')e={fresh:true,valid:true,epoch:999};if(kind==='clone')e=structuredClone(await evidence(x));
 if(kind==='expired')e=await evidence(x,{now:Date.now()-60000});if(kind==='nonmonotonic')e=await evidence(x,{fenceEpoch:1});if(kind==='wrongPointer')e=await evidence(x,{pointerEpoch:2});
 const before=await dump(x);assert.equal((await run(x,'renewFence','bad',{evidence:e})).ok,false);await assertDenied(x,before,'bad');
});
test('queued evidence expires at transaction admission, not just dispatch',async t=>{
 let clock=100000;const x=await setup(t,{bound:true,now:()=>clock}),e=await evidence(x,{now:clock});clock+=31000;
 assert.equal((await run(x,'renewFence','expired',{evidence:e})).reason,'control-evidence-stale');
});
test('resume changes only suspended; valid bound receipt required; renew preserves suspension',async t=>{
 const x=await setup(t,{bound:true});await run(x,'suspendWrites','stop');await run(x,'revokeFence','revoke');
 assert.equal((await run(x,'resumeWrites','denied',{evidence:await evidence(x,{fenceEpoch:1})})).reason,'fence-revoked');
 assert((await run(x,'renewFence','renew',{evidence:await evidence(x)})).ok);
 let h=await x.store.hydrate('g1');assert.equal(h.snapshot.control.suspended,true);assert.equal(h.snapshot.control.fenceRevoked,false);
 assert.equal((await run(x,'resumeWrites','no-server')).ok,false);
 assert((await run(x,'resumeWrites','resume',{evidence:await evidence(x)})).ok);h=await x.store.hydrate('g1');assert.equal(h.readiness,'writable');assert.equal(h.snapshot.control.fenceEpoch,2);
});
for(const later of ['revokeFence','invalidateIdentity','markRecoveryRequired'])test('historical resume replay after '+later+' cannot clear restrictions',async t=>{
 const x=await setup(t);await run(x,'suspendWrites','stop');const r=await request(x,'resumeWrites','resume');assert((await x.store.resumeWrites(r)).ok);
 await run(x,later,'later');const before=await dump(x),reply=await x.store.resumeWrites(r);assert.equal(reply.replayed,true);assert.equal(reply.historical,true);assert.equal(reply.operationAuthorized,false);assert.deepEqual(await dump(x),before);
 assert.equal((await x.store.lookupControlOperation('g1','resume')).result.publish,false);
});
test('response loss lookup/replay survives reopen with fresh operator, no duplicate mutation',async t=>{
 const x=await setup(t),r=await request(x,'suspendWrites','response-lost');assert((await x.store.suspendWrites(r)).ok);x.store.dispose();x.store=await openIDBAuthorityStore(x.scope);t.after(()=>x.store.dispose());
 const before=await dump(x);assert.equal((await x.store.lookupControlOperation('g1',r.operationId)).result.controlEpoch,2);
 assert.equal((await x.store.suspendWrites({...r,capability:x.issuer.issue('control:suspend',{generation:'g1'})})).replayed,true);assert.deepEqual(await dump(x),before);
});
for(const collision of ['dataset','publication','reserved-Pro','control'])test('shared operation identity rejects '+collision+' collision',async t=>{
 const x=await setup(t),h=(await x.store.hydrate('g1')).snapshot;
 if(collision==='dataset')assert((await x.store.commit(bpmHandle(x.store,h,'occupied'))).ok);
 if(collision==='control')assert((await run(x,'suspendWrites','occupied')).ok);
 if(collision==='reserved-Pro'){const p=x.store.prepare({base:h,operationId:'occupied',action:'saveAdvanced',changes:{'cruisePort.metronome':JSON.stringify({...JSON.parse(h.values['cruisePort.metronome']),volume:90})}});assert((await x.store.reserveOperation(p)).ok);}
 if(collision==='publication'){const r=await stage(x,{operationId:'occupied'});assert((await x.store.publish(r)).ok);const s=(await x.store.hydrate('g2')).snapshot;const cap=x.issuer.issue('control:suspend',{generation:'g2'});assert.equal((await x.store.suspendWrites({generation:'g2',operationId:'occupied',identity:s.control.identity,capability:cap})).reason,'operation-id-payload-conflict');return;}
 assert.equal((await run(x,'revokeFence','occupied')).reason,'operation-id-payload-conflict');
});
test('control ID cannot become dataset operation, same ID payload/epoch cannot change',async t=>{
 const x=await setup(t),s=(await x.store.hydrate('g1')).snapshot,r=await request(x,'suspendWrites','same');assert((await x.store.suspendWrites(r)).ok);
 assert.equal((await x.store.commit(bpmHandle(x.store,s,'same'))).reason,'operation-id-payload-conflict');
 assert.equal((await x.store.suspendWrites({...r,expectedEpoch:99})).reason,'operation-id-payload-conflict');
});
for(const lower of ['resumeWrites','renewFence'])test('old prepared dataset handle rejected after '+lower,async t=>{
 const x=await setup(t,{bound:lower==='renewFence'}),s=(await x.store.hydrate('g1')).snapshot,old=bpmHandle(x.store,s,'old');
 if(lower==='resumeWrites'){await run(x,'suspendWrites','stop');assert((await run(x,lower,'resume')).ok);}else assert((await run(x,lower,'renew',{evidence:await evidence(x)})).ok);
 assert.equal((await x.store.commit(old)).reason,'control-stale');
});
for(const target of ['control','reservations'])test('partial Control transaction abort at '+target+' leaves every store unchanged',async t=>{
 const x=await setup(t),r=await x.store.prepareControlOperation('suspendWrites',await request(x,'suspendWrites','abort')),before=await dump(x),method='put',original=IDBObjectStore.prototype[method];
 IDBObjectStore.prototype[method]=function(...args){if(this.name===target){this.transaction.abort();throw Error('injected');}return original.apply(this,args);};
 try{assert.equal((await x.store.suspendWrites(r)).ok,false);}finally{IDBObjectStore.prototype[method]=original;}
 assert.deepEqual(await dump(x),before);assert.equal((await x.store.lookupControlOperation('g1','abort')).result,null);assert.equal((await x.store.lookupControlOperation('g1','abort')).pending,true);
});
for(const kind of ['missing','corrupt'])test(kind+' pointer forbids control mutation',async t=>{
 const x=await setup(t),r=await request(x,'resumeWrites','bad');if(kind==='missing')await raw(x,['pointer'],tx=>tx.objectStore('pointer').delete('active'));else await patchPointer(x,p=>({...p,migrationId:'wrong'}));
 assert.equal((await x.store.resumeWrites(r)).status,'recovery-required');
});
test('recovery retains healthy read/export and disables Store and backend writes',async t=>{
 const x=await setup(t),before=(await x.store.hydrate('g1')).snapshot;assert((await run(x,'markRecoveryRequired','recover')).ok);
 const h=await x.store.hydrate('g1');assert(h.ok);assert.equal(h.readiness,'recovery-required');assert.equal(h.exportable,true);assert.equal(h.readOnly,true);assert.deepEqual(h.snapshot.values,before.values);
 assert.equal((await x.store.commit(bpmHandle(x.store,before,'deny'))).ok,false);
 const scope=createTestAuthorityScope({indexedDB:x.factory,partitionId:'fixture-partition'}),backend=await openIsolatedIDBRepositoryBackend({scope,generation:'g1',channelFactory:()=>null});t.after(()=>backend.dispose());
 const state=await backend.hydrate();assert.equal(state.readiness,'recovery-required');assert.equal(state.sharedWriteCapable,false);assert.deepEqual(state.values,before.values);
});
test('stopping damaged current head does not require lowering integrity check',async t=>{
 const x=await setup(t),r=await request(x,'markRecoveryRequired','damage');await raw(x,['head'],tx=>tx.objectStore('head').delete('g1'));assert((await x.store.markRecoveryRequired(r)).ok);assert.equal((await x.store.hydrate('g1')).readOnly,true);
});
test('production-like scope has no Control provider or evidence issuer',async t=>{
 const scope=createIsolatedIDBAuthorityScope({indexedDB:new IDBFactory(),partitionId:'fixture-partition'}),store=await openIDBAuthorityStore(scope);t.after(()=>store.dispose());const issuer=claimPortAuthorityIssuer(scope);
 assert.throws(()=>issuer.issue('control:renew',{generation:'g1'}),/control-provider-unavailable/);assert.throws(()=>issuer.attestFixtureFence({fresh:true}),/control-provider-unavailable/);
});
for(const latch of ['invalidateIdentity','markRecoveryRequired'])test('publication cannot silently replace '+latch+' active Authority',async t=>{
 const x=await setup(t),next=await stage(x);assert((await run(x,latch,'latch')).ok);const before=await dump(x);
 assert.equal((await x.store.publish(next)).reason,'authority-invalidated');assert.deepEqual(await dump(x),before);
});
for(const later of ['revokeFence','invalidateIdentity'])test('renew replay after '+later+' returns only historical fact',async t=>{
 const x=await setup(t,{bound:true}),r=await request(x,'renewFence','renew',{evidence:await evidence(x)});assert((await x.store.renewFence(r)).ok);await run(x,later,'later');const before=await dump(x);
 assert.equal((await x.store.renewFence(r)).replayed,true);assert.deepEqual(await dump(x),before);
});
test('denied Control retains identity; another action or fresh evidence cannot reuse the ID',async t=>{
 const x=await setup(t,{bound:true});assert.equal((await run(x,'renewFence','pending',{expectedEpoch:99,evidence:await evidence(x)})).reason,'control-stale');
 const fact=await x.store.lookupControlOperation('g1','pending');assert.equal(fact.result,null);assert.equal(fact.pending,true);
 assert.equal((await run(x,'revokeFence','pending')).reason,'operation-id-payload-conflict');
 assert.equal((await run(x,'renewFence','pending',{evidence:await evidence(x)})).reason,'operation-id-payload-conflict');
});
test('prepared Control token cannot change action or be cloned',async t=>{
 const x=await setup(t),p=await x.store.prepareControlOperation('suspendWrites',await request(x,'suspendWrites','prepared'));
 assert.equal((await x.store.resumeWrites(p)).reason,'capability-invalid');assert.equal((await x.store.suspendWrites(structuredClone(p))).reason,'capability-invalid');assert((await x.store.suspendWrites(p)).ok);
});
test('even higher-epoch fence proof captured before revoke cannot release later revoke',async t=>{
 const x=await setup(t,{bound:true}),old=await evidence(x);assert((await run(x,'revokeFence','revoke')).ok);
 assert.equal((await run(x,'renewFence','stale-pre-revoke',{evidence:old})).reason,'control-evidence-stale');
 assert((await run(x,'renewFence','fresh-after-revoke',{evidence:await evidence(x)})).ok);
});
