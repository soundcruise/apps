import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,stage,raw,patchPointer,bpmHandle,dump} from './authority-store/pointer-fixture.mjs';
import {openIDBAuthorityStore} from '../port-indexeddb-authority-store.mjs';
import {namespaceState,digest} from '../port-idb-authority-contract.mjs';
const current=x=>x.store.hydrate('g2');
async function published(t) {const x=await fixture(t),r=await stage(x);assert((await x.store.publish(r)).ok);return {...x,r};}
for(const [name,mutate] of [
 ['migrationId',p=>({...p,migrationId:'fake-migration'})],['operationId',p=>({...p,operationId:'fake-operation'})],
 ['previousGeneration',p=>({...p,previousGeneration:'ghost'})],['activeGeneration',p=>({...p,activeGeneration:'ghost'})],
 ['pointerEpoch',p=>({...p,pointerEpoch:p.pointerEpoch+1})],['manifestId',p=>({...p,publication:{...p.publication,manifestId:'fake-manifest'}})],
 ['headSeq',p=>({...p,publication:{...p.publication,headSeq:p.publication.headSeq+1}})],
 ['sealHash',p=>({...p,publication:{...p.publication,sealHash:'f'.repeat(64)}})],
 ['controlEpoch',p=>({...p,publication:{...p.publication,controlEpoch:p.publication.controlEpoch+1}})],
 ['namespaceVersion',p=>({...p,namespaceVersion:2})],['writerProtocol',p=>({...p,writerProtocol:9})],
 ['malformed',p=>({...p,operationId:'invalid/slash'})]
])test('pointer provenance rejects '+name+' despite valid current dataset',async t=>{
 const x=await published(t),before=(await current(x)).snapshot,handle=bpmHandle(x.store,before);assert((await x.store.reserveOperation(handle)).ok);await patchPointer(x,mutate);
 const disk=await dump(x),h=await current(x);assert.equal(h.status,'recovery-required');assert.equal(h.readOnly,true);
 assert.equal((await x.store.commit(handle)).ok,false);assert.deepEqual(await dump(x),disk,'no automatic repair');
});
for(const missing of ['journal','reservations'])test('publication needs independent '+missing,async t=>{
 const x=await published(t),base=(await current(x)).snapshot;
 await raw(x,[missing],tx=>tx.objectStore(missing).delete(missing==='journal'?x.r.migrationId:['g2',x.r.operationId]));
 assert.equal((await current(x)).status,'recovery-required');assert.equal((await x.store.commit(bpmHandle(x.store,base))).ok,false);
 assert.equal((await x.store.publish(x.r)).status,'recovery-required');
});
for(const mode of ['missing head','corrupt head','missing manifest','corrupt manifest','missing record','record digest','identity','missing control'])test('active integrity before duplicate/new publication: '+mode,async t=>{
 const x=await published(t),next=await stage(x,{generation:'g3',migrationId:'m-g3',operationId:'pub-g3',expectedPointerEpoch:2});
 const s=(await current(x)).snapshot;
 // A benign post-publication save makes current head distinct from the historical publication point.
 assert((await x.store.commit(bpmHandle(x.store,s,'post-publish'))).ok);
 const now=(await current(x)).snapshot;
 await raw(x,['head','manifests','records','control'],tx=>{
  if(mode==='missing head')tx.objectStore('head').delete('g2');
  if(mode==='corrupt head')tx.objectStore('head').put({...now.head,seq:999});
  if(mode==='missing manifest')tx.objectStore('manifests').delete(['g2',now.head.manifestId]);
  if(mode==='corrupt manifest')tx.objectStore('manifests').put({...now.manifest,digest:'f'.repeat(64)});
  if(mode==='missing record')tx.objectStore('records').delete(['g2','cruisePort.metronome',now.versions['cruisePort.metronome']]);
  if(mode==='record digest') {const st=tx.objectStore('records'),r=st.get(['g2','cruisePort.metronome',now.versions['cruisePort.metronome']]);r.onsuccess=()=>st.put({...r.result,digest:'f'.repeat(64)});}
  if(mode==='identity')tx.objectStore('control').put({...now.control,identity:{...now.control.identity,ownership:'bound-account',accountId:'foreign',accountGeneration:1,membershipGeneration:1,membershipId:'foreign-member'}});
  if(mode==='missing control')tx.objectStore('control').delete('g2');
 });
 const before=await dump(x);assert.equal((await current(x)).status,'recovery-required');
 for(const r of [x.r,next])assert.equal((await x.store.publish(r)).status,'recovery-required');
 assert.equal((await x.store.initialize({generation:'g4',control:{...now.control,generation:'g4'},values:now.values,operationId:'cannot-repair'})).ok,false);
 assert.deepEqual(await dump(x),before,'no supersession or repair');
 const fact=await x.store.lookupPublication('g2',x.r.operationId);assert.equal(fact.result.status,'published');assert.equal(fact.result.currentAuthorityVerified,false);assert.equal(fact.result.publish,false);
});
test('first publication and formal same-ID retry are atomic and idempotent',async t=>{
 const x=await fixture(t,{seed:false}),r=await stage(x,{expectedPointerEpoch:null});
 assert.equal((await x.store.publish(r)).status,'published');const disk=await dump(x);
 assert.equal((await x.store.publish(r)).status,'already-active');assert.deepEqual(await dump(x),disk);
 x.store.dispose();x.store=await openIDBAuthorityStore(x.scope);t.after(()=>x.store.dispose());
 assert.equal((await x.store.publish(r)).status,'already-active');assert.equal((await x.store.lookupPublication('g2',r.operationId)).result.historical,true);
});
for(const mode of ['pointer deleted','namespace deleted','marker reset','journal reset','reservation reset'])test('missing pointer is not a new initial publication: '+mode,async t=>{
 const x=await published(t),next=await stage(x,{generation:'g3',migrationId:'m-g3',operationId:'pub-g3',expectedPointerEpoch:null});
 await raw(x,['pointer','journal','reservations'],tx=>{
  tx.objectStore('pointer').delete('active');
  if(mode==='namespace deleted')tx.objectStore('pointer').delete('namespace');
  if(mode==='marker reset')tx.objectStore('pointer').put(namespaceState('fixture-partition'));
  if(mode==='journal reset')tx.objectStore('journal').delete(x.r.migrationId);
  if(mode==='reservation reset')tx.objectStore('reservations').delete(['g2',x.r.operationId]);
 });
 const before=await dump(x);assert.equal((await x.store.publish(next)).status,'recovery-required');assert.deepEqual(await dump(x),before);
});
test('normal staging/prepared/sealed states stay read-only without corruption',async t=>{
 const x=await fixture(t,{seed:false});const r=await stage(x,{expectedPointerEpoch:null});const h=await current(x);
 assert.equal(h.ok,true);assert.equal(h.activity,'inactive');assert.equal(h.readOnly,true);assert.equal(h.snapshot.control.state,'sealed');
 assert.equal((await x.store.publish(r)).status,'published');
});
test('unknown namespace schema is retained and reported unsupported, never repaired',async t=>{
 const x=await fixture(t,{seed:false});await raw(x,['pointer'],tx=>tx.objectStore('pointer').put({...namespaceState('fixture-partition'),schemaVersion:2}));
 const h=await x.store.hydrate('g1');assert.equal(h.reason,'namespace-schema-unsupported');assert.equal((await dump(x)).pointer[0].schemaVersion,2);
});
for(const id of ['stage-g2','reserved-Pro'])test('dataset operationId cannot become publication: '+id,async t=>{
 const x=await fixture(t),r=await stage(x,{operationId:id});
 if(id==='reserved-Pro'){const base=(await current(x)).snapshot,p=x.store.prepare({base,operationId:id,action:'saveAdvanced',changes:{'cruisePort.metronome':JSON.stringify({...JSON.parse(base.values['cruisePort.metronome']),volume:99})}});assert((await x.store.reserveOperation(p)).ok);}
 const before=await dump(x);assert.equal((await x.store.publish(r)).reason,'operation-id-payload-conflict');assert.deepEqual(await dump(x),before);
 assert.equal((await x.store.lookupPublication('g2',id)).result,null);
});
test('same publication ID cannot change payload/evidence/expected epochs or migration',async t=>{
 const x=await published(t);const before=await dump(x);
 for(const patch of [{expectedPointerEpoch:2},{expectedControlEpoch:3},{migrationId:'other'}])assert.equal((await x.store.publish({...x.r,...patch})).ok,false);
 const attestation=x.issuer.attestFixtureEvidence({generation:'g2',migrationId:x.r.migrationId,sealHash:(await x.store.readJournal(x.r.migrationId)).journal.sealHash,binary:{manifestDigest:'c'.repeat(64),assetCount:1},sync:{checkpointDigest:'b'.repeat(64),outboxPending:0}});
 assert.equal((await x.store.publish({...x.r,attestation})).reason,'operation-id-payload-conflict');
 assert.equal((await x.store.publish({...x.r,operationId:'unrelated-new-id'})).reason,'publication-operation-conflict');assert.deepEqual(await dump(x),before);
});
test('publication ID cannot be reused by direct dataset commit, including privileged fixture action',async t=>{
 const x=await published(t),base=(await current(x)).snapshot;
 const h=x.store.prepare({base,operationId:x.r.operationId,changes:{'cruisePort.metronome':JSON.stringify({...JSON.parse(base.values['cruisePort.metronome']),bpm:147})}});
 assert.equal((await x.store.commit(h)).reason,'operation-id-payload-conflict');
 assert.equal((await x.store.lookupOperation('g2',x.r.operationId)).result,null);
});
test('old handle and old generation reject after publication; prior dataset fact remains',async t=>{
 const x=await fixture(t),base=(await x.store.hydrate('g1')).snapshot,h=bpmHandle(x.store,base,'old-handle'),r=await stage(x);
 assert((await x.store.publish(r)).ok);assert.equal((await x.store.commit(h)).reason,'generation-not-active');
 assert.equal((await x.store.lookupOperation('g1','seed')).result.status,'committed');assert.equal((await x.store.lookupPublication('g1','seed')).result,null);
});
test('valid-format pointer identifiers on initialization also require initialization commit provenance',async t=>{
 const x=await fixture(t),base=(await x.store.hydrate('g1')).snapshot;await patchPointer(x,p=>({...p,migrationId:'fake',previousGeneration:'ghost'}));
 assert.equal((await x.store.hydrate('g1')).status,'recovery-required');assert.equal((await x.store.commit(bpmHandle(x.store,base))).ok,false);
});
test('old v2 prepared candidate remains read-only; missing namespace does not grant initial publication',async t=>{
 const x=await fixture(t,{seed:false}),r=await stage(x,{expectedPointerEpoch:null});await raw(x,['pointer'],tx=>tx.objectStore('pointer').delete('namespace'));
 const h=await current(x);assert.equal(h.ok,true);assert.equal(h.readOnly,true);assert.equal(h.activity,'inactive');
 assert.equal((await x.store.publish(r)).reason,'namespace-provenance-missing');
});
test('current head must refer to its exact dataset oplog fact',async t=>{
 const x=await published(t),s=(await current(x)).snapshot;assert((await x.store.commit(bpmHandle(x.store,s,'advance'))).ok);
 const h=(await current(x)).snapshot;await raw(x,['oplog'],tx=>{const st=tx.objectStore('oplog'),r=st.get(['g2',h.head.operationId]);r.onsuccess=()=>st.put({...r.result,result:{...r.result.result,revision:'wrong-revision'}});});
 assert.equal((await x.store.publish(x.r)).status,'recovery-required');assert.equal((await current(x)).reason,'oplog-invalid');
 assert.equal((await x.store.lookupPublication('g2',x.r.operationId)).result.historical,true);
});
test('fixture initialization cannot publish over a missing namespace marker',async t=>{
 const x=await fixture(t,{seed:false});await raw(x,['pointer'],tx=>tx.objectStore('pointer').delete('namespace'));
 const {values,control}=await import('./authority-store/fixture.mjs');
 assert.equal((await x.store.initialize({generation:'fresh',control:control('fresh'),values:values(),operationId:'unknown-namespace'})).reason,'namespace-provenance-missing');
 assert.deepEqual((await dump(x)).pointer,[]);
});
