import {CONTROL_OPERATIONS} from '../../port-authority-control.mjs';
import {pointerRaceHooks} from './pointer-race-hooks.mjs';
import { createTestAuthorityScope as createIsolatedIDBAuthorityScope, testProAuthorization } from '../authority-store/test-authority.mjs';
// Real Repository + real L2a Store, native IDB, no locks or delivery hints.
import { PortDatasetRepository, PORT_DATASET_KEYS } from '../../port-dataset-repository.js';
import { openIsolatedIDBRepositoryBackend } from '../../port-indexeddb-repository-backend.mjs';
import { values, control } from '../authority-store/fixture.mjs';
import { referenceValues, REF_KEYS, attachment, danglingAttachments } from '../authority-store/reference-fixture.mjs';
import { KEYS, CONTROL_SCENARIOS, counterLoop, deleteLoop, seedDeleteCollections } from './cross-tab-scenarios.mjs';
import { claimPortAuthorityIssuer, openIDBAuthorityStore } from '../../port-indexeddb-authority-store.mjs';
import { AUTHORITY_DB_VERSION, V1_STORE_KEYS, POINTER_KEY, reservationKey } from '../../port-idb-authority-contract.mjs';
let token, scope, generation, backend, repository;
let publicationPackets=new Map(),controlPackets=new Map();
let proValid=true;const authorizations=new Map();
const handles=new Map();
function assertFixture() {
 if(!token || !['127.0.0.1','localhost','[::1]'].includes(location.hostname))throw Error('driver isolation required');
}
async function snapshot() { await backend.hydrate(); return backend.store.hydrate(generation).then(r=>{if(!r.ok)throw Error(r.reason);return r.snapshot;}); }
window.crossTab={
 ...pointerRaceHooks({name:()=>scope.name,commitOld:id=>controlPackets.has('dataset-'+id)?backend.store.commit(handles.get(id)):backend.commitPreparedWrite(handles.get(id)),commitPublication:id=>backend.store.publish(publicationPackets.get(id)),commitControl:id=>{const p=controlPackets.get(id);return backend.store[p.action](p.request);}}),
 claim(id) { if(token&&token!==id)throw Error('different fixture owner');if(typeof id!=='string'||id.length<16)throw Error('driver token');token=id;assertFixture();return true; },
 async prepare({scenario,role,iterations,generation:gen,reference=false,attached=false,payload=0,policy=false,controlBound=false}) {
  assertFixture();backend?.dispose();generation=gen;
  scope=createIsolatedIDBAuthorityScope({indexedDB,partitionId:token,name:'sound-cruise-port-authority-v1-fixture-'+token},{fixtureMutations:!policy});
  backend=await openIsolatedIDBRepositoryBackend({scope,generation,channelFactory:()=>null});
  if(role==='primary') {
   let v=reference?referenceValues({attached,payload}):values();if(scenario==='delete-intent')v=seedDeleteCollections(v,iterations);
   const seeded=await backend.store.initialize({generation,control:{...control(generation,token),...(controlBound?{identity:{...control(generation,token).identity,ownership:'bound-account',accountId:'fixture-A',accountGeneration:2,membershipId:'fixture-member',membershipGeneration:3}}:{})},values:v,operationId:'seed-'+generation});
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
 async upgrade(){return new Promise((ok,no)=>{const r=indexedDB.open(scope.name,AUTHORITY_DB_VERSION+1);r.onupgradeneeded=()=>r.result.createObjectStore('future');r.onsuccess=()=>{r.result.close();ok(backend.store.status);};r.onerror=()=>no(r.error);});},
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
  const db=await new Promise((ok,no)=>{const r=indexedDB.open(scope.name);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
  try{return await new Promise((ok,no)=>{const tx=db.transaction(['oplog','manifests'],'readonly'),r=tx.objectStore('oplog').getAll(),m=tx.objectStore('manifests').getAll();
   tx.oncomplete=()=>{const logs=r.result.filter(l=>l.generation===generation),manifests=m.result.filter(v=>v.generation===generation);
    ok({seq:s.head.seq,logs:logs.length,unique:new Set(logs.map(l=>l.operationId)).size,partial:manifests.filter(v=>Object.keys(v.versions).length!==15).length});};tx.onabort=()=>no(tx.error);});}finally{db.close();}
 },
 release(){backend?.dispose();v1Connection?.close();return true;},
 // ---- L3b-1 pointer / publication / schema v2 (isolated fixture names only) ----
 async pointerStage({generation:gen,migrationId}) {
  assertFixture();const store=backend.store,c={...control(gen,token),state:'prepared'};
  const seeded=await store.initialize({generation:gen,control:c,values:values(),operationId:'stage-'+gen});if(!seeded.ok)throw Error(seeded.reason);
  const j=await store.writeJournal({schemaVersion:1,migrationId,generation:gen,revision:1,state:'prepared',identity:c.identity});if(!j.ok)throw Error(j.reason);
  const sealed=await store.seal({generation:gen,migrationId,capability:issuer().issue('migration-publication',{generation:gen})});if(!sealed.ok)throw Error(sealed.reason);
  return {sealHash:sealed.sealHash,controlEpoch:sealed.controlEpoch};
 },
 async pointerPublish({generation:gen,migrationId,operationId,expectedPointerEpoch=null}) {
  assertFixture();const store=backend.store,journal=(await store.readJournal(migrationId)).journal,h=await store.hydrate(gen);
  if(!journal||!h.ok)return {ok:false,reason:'stage-missing'};
  const cap=issuer().issue('migration-publication',{generation:gen});
  const attestation=issuer().attestFixtureEvidence({generation:gen,migrationId,sealHash:journal.sealHash,
   binary:{manifestDigest:'a'.repeat(64),assetCount:0},sync:{checkpointDigest:'b'.repeat(64),outboxPending:0}});
  return store.publish({generation:gen,migrationId,operationId,capability:cap,attestation,expectedPointerEpoch,expectedControlEpoch:journal.publication?.request?.operationId===operationId?journal.publication.request.expectedControlEpoch:h.snapshot.control.epoch});
 },
 async controlPacket({id,action,expectedEpoch}){
  const s=(await backend.store.hydrate(generation)).snapshot;
  const request={generation,operationId:id,identity:s.control.identity,expectedEpoch:expectedEpoch??s.control.epoch,expectedPointerEpoch:s.pointer.pointerEpoch,
   capability:issuer().issue(CONTROL_OPERATIONS[action],{generation})};
  if(action==='renewFence'||action==='resumeWrites'&&s.control.identity.ownership==='bound-account'){
   const now=Date.now();request.evidence=issuer().attestFixtureFence({controlEpoch:s.control.epoch,source:'isolated-server',evidenceId:id+'-server',generation,pointerEpoch:s.pointer.pointerEpoch,
    identity:s.control.identity,fenceEpoch:s.control.fenceEpoch+(action==='renewFence'?1:0),issuedAt:now,expiresAt:now+60000});
  }
  controlPackets.set(id,{action,request:await backend.store.prepareControlOperation(action,request)});return {expectedEpoch:request.expectedEpoch};
 },
 controlPacketCommit:id=>{const p=controlPackets.get(id);return backend.store[p.action](p.request);},
 controlFact:id=>backend.store.lookupControlOperation(generation,id),
 async controlSavePacket(id){controlPackets.set('dataset-'+id,{});const s=(await backend.store.hydrate(generation)).snapshot;handles.set(id,backend.store.prepare({base:s,operationId:id,action:'fixture-save',changes:{'cruisePort.metronome':JSON.stringify({...JSON.parse(s.values['cruisePort.metronome']),bpm:145})}}));return true;},
 controlRead:()=>backend.store.hydrate(generation),
 async pointerPacket({id,generation:gen,migrationId,operationId,expectedPointerEpoch=null}) {
  const j=(await backend.store.readJournal(migrationId)).journal,h=await backend.store.hydrate(gen);
  if(!j||!h.ok)throw Error('packet stage missing');
  const request={generation:gen,migrationId,operationId,expectedPointerEpoch,
   expectedControlEpoch:j.publication?.request?.operationId===operationId?j.publication.request.expectedControlEpoch:h.snapshot.control.epoch,
   capability:issuer().issue('migration-publication',{generation:gen}),
   attestation:issuer().attestFixtureEvidence({generation:gen,migrationId,sealHash:j.sealHash,binary:{manifestDigest:'a'.repeat(64),assetCount:0},sync:{checkpointDigest:'b'.repeat(64),outboxPending:0}})};
  publicationPackets.set(id,request);return true;
 },
 pointerPacketCommit:id=>backend.store.publish(publicationPackets.get(id)),
 pointerFact:({generation:gen,operationId})=>backend.store.lookupPublication(gen,operationId),
 async pointerDamage({store,key,patch,remove=false}) {
  const db=await new Promise((ok,no)=>{const r=indexedDB.open(scope.name);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
  try{return await new Promise((ok,no)=>{const tx=db.transaction(store,'readwrite'),st=tx.objectStore(store);tx.oncomplete=()=>ok(true);tx.onabort=()=>no(tx.error);
   if(remove)st.delete(key);else {const r=st.get(key);r.onsuccess=()=>st.put({...r.result,...patch});}
  });}finally{db.close();}
 },
 pointerSnapshot:gen=>backend.store.hydrate(gen),
 async pointerState(gen) {
  const p=await backend.store.readPointer(),h=gen?await backend.store.hydrate(gen):null;
  return {pointer:p.pointer??null,pointerStatus:p.ok?'ok':p.status,pointerReason:p.reason??null,
   hydrate:h&&{status:h.status,activity:h.activity??null,readOnly:h.readOnly??null,reason:h.reason??null,state:h.snapshot?.control.state??null,epoch:h.snapshot?.control.epoch??null}};
 },
 async pointerPrepareOld(id) {
  await backend.hydrate();const s=repository.inspect(),key=KEYS.a;
  handles.set(id,await backend.prepareWrite({operationId:id,expectedValues:{[key]:s.values[key]}},d=>d.setItem(key,JSON.stringify({...JSON.parse(d.getItem(key)),bpm:133}))));
  return true;
 },
 pointerCommitOld:id=>backend.commitPreparedWrite(handles.get(id)),
 pointerArmCrash(){const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const r=put.apply(this,args);if(this.name==='pointer')r.addEventListener('success',()=>{debugger;},{once:true});return r;};return true;},
 async pointerRaw(kind) {
  const db=await new Promise((ok,no)=>{const r=indexedDB.open(scope.name);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
  try{return await new Promise((ok,no)=>{const tx=db.transaction(['pointer'],'readwrite'),store=tx.objectStore('pointer');let saved;tx.oncomplete=()=>ok(saved);tx.onabort=()=>no(tx.error);
   const r=store.get(POINTER_KEY);r.onsuccess=()=>{saved=r.result;
    if(kind==='corrupt')store.put({...r.result,pointerEpoch:0});else if(kind==='delete')store.delete(POINTER_KEY);else if(kind?.key===POINTER_KEY)store.put(kind);};});}
  finally{db.close();}
 },
 async v1Create({name,handler}) {
  assertFixture();if(!/^sound-cruise-port-authority-v1-fixture-[A-Za-z0-9_-]+$/.test(name))throw Error('fixture name required');
  v1Events=[];v1Connection=await new Promise((ok,no)=>{const r=indexedDB.open(name,1);
   r.onupgradeneeded=()=>{for(const [n,k] of Object.entries(V1_STORE_KEYS))r.result.createObjectStore(n,{keyPath:k});
    const j=r.transaction.objectStore('journal');
    j.add({migrationId:reservationKey('g1','pending'),kind:'operation-identity',schemaVersion:1,generation:'g1',operationId:'pending',fingerprint:'c'.repeat(64)});
    j.add({migrationId:'m-keep',schemaVersion:1,generation:'g1',revision:1,state:'prepared'});
    r.transaction.objectStore('roots').add({generation:'g1',rootId:'r-keep',schemaVersion:1,kind:'recovery',manifestIds:[],recordRefs:[],journalIds:[]});};
   r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
  if(handler)v1Connection.onversionchange=()=>{v1Events.push('versionchange');v1Connection.close();};
  return {version:v1Connection.version};
 },
 v1Close(){v1Connection?.close();v1Connection=null;return true;},
 v1Events:()=>v1Events,
 async v1Open(name) {
  const s=createIsolatedIDBAuthorityScope({indexedDB,partitionId:token,name});
  try{const store=await openIDBAuthorityStore(s);store.dispose();}catch(e){return {ok:false,reason:e.code};}
  return {ok:true};
 },
 async v1Inspect(name) {
  const db=await new Promise((ok,no)=>{const r=indexedDB.open(name);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
  try{const names=[...db.objectStoreNames];return await new Promise((ok,no)=>{const tx=db.transaction(names,'readonly'),out={version:db.version,stores:names.sort()};let pending=names.length;
   tx.onabort=()=>no(tx.error);for(const n of names){const r=tx.objectStore(n).getAll();r.onsuccess=()=>{out[n]=r.result;if(!--pending)ok(out);};}});}
  finally{db.close();}
 }
};
let v1Connection=null,v1Events=[];const issuers=new WeakMap();
function issuer(){if(!issuers.has(scope))issuers.set(scope,claimPortAuthorityIssuer(scope));return issuers.get(scope);}
