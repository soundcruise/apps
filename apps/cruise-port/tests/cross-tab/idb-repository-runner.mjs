import { createTestAuthorityScope as createIsolatedIDBAuthorityScope, testProAuthorization } from '../authority-store/test-authority.mjs';
// Real Repository + real L2a Store, native IDB, no locks or delivery hints.
import { PortDatasetRepository, PORT_DATASET_KEYS } from '../../port-dataset-repository.js';
import { openIsolatedIDBRepositoryBackend } from '../../port-indexeddb-repository-backend.mjs';
import { values, control } from '../authority-store/fixture.mjs';
import { referenceValues, REF_KEYS, attachment, danglingAttachments } from '../authority-store/reference-fixture.mjs';
import { KEYS, CONTROL_SCENARIOS, counterLoop, deleteLoop, seedDeleteCollections } from './cross-tab-scenarios.mjs';
let token, scope, generation, backend, repository;
let proValid=true;const authorizations=new Map();
const handles=new Map();
function assertFixture() {
 if(!token || !['127.0.0.1','localhost','[::1]'].includes(location.hostname))throw Error('driver isolation required');
}
async function snapshot() { await backend.hydrate(); return backend.store.hydrate(generation).then(r=>{if(!r.ok)throw Error(r.reason);return r.snapshot;}); }
window.crossTab={
 claim(id) { if(token&&token!==id)throw Error('different fixture owner');if(typeof id!=='string'||id.length<16)throw Error('driver token');token=id;assertFixture();return true; },
 async prepare({scenario,role,iterations,generation:gen,reference=false,attached=false,payload=0,policy=false}) {
  assertFixture();backend?.dispose();generation=gen;
  scope=createIsolatedIDBAuthorityScope({indexedDB,partitionId:token,name:'sound-cruise-port-authority-v1-fixture-'+token},{fixtureMutations:!policy});
  backend=await openIsolatedIDBRepositoryBackend({scope,generation,channelFactory:()=>null});
  if(role==='primary') {
   let v=reference?referenceValues({attached,payload}):values();if(scenario==='delete-intent')v=seedDeleteCollections(v,iterations);
   const seeded=await backend.store.initialize({generation,control:control(generation,token),values:v,operationId:'seed-'+generation});
   if(!seeded.ok)throw Error(seeded.reason);
  }
  await backend.hydrate();repository=new PortDatasetRepository({backend,locks:null,
   storage:{getItem(){throw Error('legacy fallback');},setItem(){throw Error('legacy write');}}});
  return {backend:backend.kind,locks:false,notifications:false};
 },
 async run({scenario,role,iterations,payload,changeDelayMs=120}) {
  assertFixture();const pad='x'.repeat(payload);
  if(CONTROL_SCENARIOS.includes(scenario)) {
   if(role==='primary') return {commits:await counterLoop({repository,key:KEYS.a,iterations,pad,durationMs:changeDelayMs+600})};
   await new Promise(r=>setTimeout(r,changeDelayMs));
   const s=await snapshot(),patch=scenario==='save-suspend'?{suspended:true}:scenario==='save-fence-revoke'?{fenceRevoked:true}:{identityInvalidated:true};
   const r=await backend.store.updateControl(generation,{expectedEpoch:s.control.epoch,patch});if(!r.ok)throw Error(r.reason);
   return {changedAt:Date.now(),fixtureOnly:true};
  }
  if(scenario==='delete-intent')return deleteLoop({repository,key:role==='primary'?KEYS.deleteA:KEYS.deleteB,iterations,pad});
  return {commits:await counterLoop({repository,key:scenario==='save-save-different-keys'&&role==='peer'?KEYS.b:KEYS.a,iterations,pad})};
 },
 async observe() {
  const s=await snapshot(),read=k=>s.values[k],counter=k=>JSON.parse(read(k)||'{}').probeCounter||0;
  const ids=k=>(JSON.parse(read(k)||'{"items":[]}').items||[]).map(i=>i.id);
  if(Object.keys(s.manifest.versions).length!==PORT_DATASET_KEYS.length)throw Error('partial manifest');
  return {counterA:counter(KEYS.a),counterB:counter(KEYS.b),journal:read(KEYS.intents),itemsA:ids(KEYS.deleteA),itemsB:ids(KEYS.deleteB),authorityCounter:null};
 },
 async preparePacket(id,key=KEYS.a,fields={bpm:170},dependencyKeys=[]) {
  await backend.hydrate();const s=repository.inspect();
  const handle=await backend.prepareWrite({operationId:id,expectedValues:{[key]:s.values[key]},dependencyKeys},d=>d.setItem(key,JSON.stringify({...JSON.parse(d.getItem(key)),...fields})));
  handles.set(id,handle);return handle.request;
 },
 commitPacket:id=>backend.commitPreparedWrite(handles.get(id)),
 retryPacket:request=>backend.retryWrite(request),
 async policyPrepare({id,action='saveAdvanced',fields={volume:95}}) {
  await backend.hydrate();const s=repository.inspect(),key='cruisePort.metronome';
  const auth=action==='saveAdvanced'?testProAuthorization(scope,{operationId:id,action,resolve:()=>proValid?
   {ok:true,policy:'pro',generation:1,credentialFingerprint:'a'.repeat(64),wallMarginMs:31000,monoMarginMs:31000}:false,credentialFingerprint:'a'.repeat(64)}):{};
  authorizations.set(id,auth);const p=await backend.prepareWrite({operationId:id,source:action,expectedValues:{[key]:s.values[key]},...auth},d=>d.setItem(key,JSON.stringify({...JSON.parse(s.values[key]),...fields})));
  handles.set(id,p);return p.request;
 },
 policyCommit:(id,guard=true)=>backend.commitPreparedWrite(handles.get(id),guard?authorizations.get(id):{}),
 policyRetry(request,{authorized=false}={}) {
  const auth=authorized?testProAuthorization(scope,{operationId:request.operationId,action:request.action,credentialFingerprint:'a'.repeat(64),resolve:()=>proValid?
   {ok:true,policy:'pro',generation:1,credentialFingerprint:'a'.repeat(64),wallMarginMs:31000,monoMarginMs:31000}:false}):{};
  return backend.retryWrite(request,auth);
 },
 policyRevoke:()=>{proValid=false;return true;},
 lookup:id=>backend.lookupOperation(id),
 snapshot,
 async reopen(){backend.dispose();backend=await openIsolatedIDBRepositoryBackend({scope,generation,channelFactory:()=>null});repository=new PortDatasetRepository({backend,locks:null});await backend.hydrate();return snapshot();},
 armCrash(){const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){const r=add.apply(this,args);if(this.name==='records')r.addEventListener('success',()=>{debugger;},{once:true});return r;};},
 async abortPacket(id){
  const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='records')this.transaction.abort();return add.apply(this,args);};
  try{return await backend.commitPreparedWrite(handles.get(id));}finally{IDBObjectStore.prototype.add=add;}
 },
 async upgrade(){return new Promise((ok,no)=>{const r=indexedDB.open(scope.name,2);r.onupgradeneeded=()=>r.result.createObjectStore('future');r.onsuccess=()=>{r.result.close();ok(backend.store.status);};r.onerror=()=>no(r.error);});},
 async futureOpen(){try{await openIsolatedIDBRepositoryBackend({scope,generation,channelFactory:()=>null});return {ok:true};}catch(e){return {ok:false,reason:e.code};}},
 status:()=>backend.store.status,
 async referencePrepare({id,kind,owner='menu-0',attachmentId='attachment-a',acknowledgements=[],dependencyKeys=[]}) {
  const keys=kind==='menu-delete'||kind==='menu-edit'||kind==='my-app-link'?[REF_KEYS.menus]:kind.startsWith('my-app')?[REF_KEYS.apps]:
   kind==='coordinated-delete'?[REF_KEYS.menus,REF_KEYS.assets]:kind==='old-ack'?[]:[REF_KEYS.assets];
  const s=repository.inspect();let release;
  const promise=repository.runWrite({operationId:id,expectedValues:Object.fromEntries(keys.map(k=>[k,s.values[k]])),acknowledgements,dependencyKeys},async d=>{
   await new Promise(r=>release=r);
   const mutate=(key,fn)=>{const v=JSON.parse(d.getItem(key));fn(v);d.setItem(key,JSON.stringify(v));};
   if(kind==='menu-delete'||kind==='coordinated-delete')mutate(REF_KEYS.menus,v=>v.items=v.items.filter(m=>m.id!==owner));
   if(kind==='coordinated-delete')mutate(REF_KEYS.assets,v=>{for(const [id,e]of Object.entries(v.attachments))if(e.practiceId===owner)delete v.attachments[id];});
   if(kind==='menu-edit')mutate(REF_KEYS.menus,v=>{v.items.find(m=>m.id===owner).memo=id;});
   if(kind==='my-app-delete')mutate(REF_KEYS.apps,v=>v.items=[]);
   if(kind==='my-app-link')mutate(REF_KEYS.menus,v=>v.items[0].appId='myapp:'+JSON.parse(s.values[REF_KEYS.apps]).items[0].id);
   if(kind==='attachment-add')mutate(REF_KEYS.assets,v=>v.attachments[attachmentId]=attachment(owner,attachmentId));
   if(kind==='attachment-delete')mutate(REF_KEYS.assets,v=>delete v.attachments[attachmentId]);
   return {ok:true};
  });
  while(!release)await new Promise(r=>setTimeout(r,0));
  handles.set(id,{release,promise});return true;
 },
 referenceCommit(id){const p=handles.get(id);p.release();return p.promise;},
 async referenceFailure(id,kind){
  const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){
   if(this.name==='records'){if(kind==='quota')throw new DOMException('full','QuotaExceededError');this.transaction.abort();}
   return add.apply(this,args);
  };
  try{return await crossTab.referenceCommit(id);}finally{IDBObjectStore.prototype.add=add;}
 },
 async referenceObserve(){const s=await snapshot();return {values:s.values,versions:s.versions,seq:s.head.seq,dangling:danglingAttachments(s.values)};},
 async integrity(){
  const s=await snapshot();
  const db=await new Promise((ok,no)=>{const r=indexedDB.open(scope.name,1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
  try{return await new Promise((ok,no)=>{const tx=db.transaction(['oplog','manifests'],'readonly'),r=tx.objectStore('oplog').getAll(),m=tx.objectStore('manifests').getAll();
   tx.oncomplete=()=>{const logs=r.result.filter(l=>l.generation===generation),manifests=m.result.filter(v=>v.generation===generation);
    ok({seq:s.head.seq,logs:logs.length,unique:new Set(logs.map(l=>l.operationId)).size,partial:manifests.filter(v=>Object.keys(v.versions).length!==15).length});};tx.onabort=()=>no(tx.error);});}finally{db.close();}
 },
 release(){backend?.dispose();return true;}
};
