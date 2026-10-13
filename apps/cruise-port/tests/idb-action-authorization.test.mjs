import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createTestAuthorityScope,testProAuthorization,testAckCapability} from './authority-store/test-authority.mjs';
import {createIsolatedIDBAuthorityScope,openIDBAuthorityStore,installIsolatedAuthorityTestProvider} from '../port-indexeddb-authority-store.mjs';
import {openIsolatedIDBRepositoryBackend} from '../port-indexeddb-repository-backend.mjs';
import {PortDatasetRepository,PORT_DELETE_INTENTS} from '../port-dataset-repository.js';
import {values,control} from './authority-store/fixture.mjs';
import {METRONOME_KEY as met,PRESETS_KEY as presets,UNIMPLEMENTED_AUTHORITY_ACTIONS} from '../port-authority-action-policy.mjs';
const {IDBFactory}=createRequire(new URL('./authority-store/package.json',import.meta.url))('fake-indexeddb');
async function setup(t,{rawAdvanced=false}={}) {
 const factory=new IDBFactory(),scope=createTestAuthorityScope({indexedDB:factory,partitionId:'fixture-partition'},{fixtureMutations:false});
 const b=await openIsolatedIDBRepositoryBackend({scope,generation:'g1',channelFactory:()=>null});t.after(()=>b.dispose());
 const initial=values();if(rawAdvanced)initial[met]=JSON.stringify({...JSON.parse(initial[met]),volume:99,sound:'analog',retained:{raw:true}});
 assert((await b.store.initialize({generation:'g1',control:control(),values:initial,operationId:'seed'})).ok);await b.hydrate();
 return {factory,scope,b,repo:new PortDatasetRepository({backend:b,locks:null}),initial};
}
async function prepare(x,{id='op',action='saveAdvanced',fields={volume:90},key=met,auth,operationData,dependencyKeys=[]}={}) {
 const raw=x.b.inspect().values[key];return x.b.prepareWrite({operationId:id,source:action,expectedValues:{[key]:raw},...auth,operationData,dependencyKeys},
  d=>d.setItem(key,JSON.stringify({...JSON.parse(raw),...fields})));
}
const head=async x=>(await x.b.store.hydrate('g1')).snapshot.head.seq;
const pro=(x,id='op',action='saveAdvanced',options={})=>testProAuthorization(x.scope,{operationId:id,action,...options});
test('reproduction: flipping requiresAuthorization cannot bypass Pro policy',async t=>{
 const x=await setup(t),auth=pro(x),p=await prepare(x,{auth});
 assert.equal((await x.b.commitPreparedWrite(p)).reason,'operation-commit-guard-required');
 const request=structuredClone(p.request);request.requiresAuthorization=false;
 assert.equal((await x.b.retryWrite(request)).reason,'operation-commit-guard-required');assert.equal(await head(x),1);
});
for(const kind of ['action','payload','target','policy','credential'])test('uncommitted same ID cannot substitute '+kind+' across reopened Store',async t=>{
 const x=await setup(t),auth=pro(x),p=await prepare(x,{auth});assert.equal((await x.b.commitPreparedWrite(p)).ok,false);
 x.b.dispose();x.b=await openIsolatedIDBRepositoryBackend({scope:x.scope,generation:'g1',channelFactory:()=>null});t.after(()=>x.b.dispose());await x.b.hydrate();
 const r=structuredClone(p.request);
 if(kind==='action') {r.action='saveBpm';delete r.authorizationPolicy;}
 if(kind==='payload')r.changes[met]=JSON.stringify({...JSON.parse(r.changes[met]),volume:91});
 if(kind==='target'){r.changes={'cruisePort.tuner':r.base.values['cruisePort.tuner']};}
 if(kind==='policy')r.authorizationPolicy.policy='standard';
 if(kind==='credential')r.authorizationIdentity.credentialFingerprint='b'.repeat(64);
 const out=await x.b.retryWrite(r,auth);assert.equal(out.ok,false);assert(['operation-id-payload-conflict','authorization-policy-changed'].includes(out.reason),JSON.stringify(out));assert.equal(await head(x),1);
});
for(const [name,resolve,reason] of [
 ['false',()=>false,'operation-authorization-rejected'],['throws',()=>{throw Error('denied');},'idb-error'],
 ['Promise',()=>Promise.resolve(true),'operation-commit-guard-async'],['rejected Promise',()=>Promise.reject(Error('denied')),'operation-commit-guard-async'],
 ['thenable',()=>({then(){}}),'operation-commit-guard-async'],['true',()=>true,'pro-proof-result-invalid'],
 ['undefined',()=>undefined,'pro-proof-result-invalid'],['denied object',()=>({allowed:false}),'operation-authorization-rejected']])test('trusted Pro guard rejects '+name,async t=>{
 const x=await setup(t),auth=pro(x,'op','saveAdvanced',{resolve}),p=await prepare(x,{auth});assert.equal((await x.b.commitPreparedWrite(p,auth)).reason,reason);assert.equal(await head(x),1);
});
test('missing guard / arbitrary caller function / forged context deny',async t=>{
 const x=await setup(t),p=await prepare(x,{auth:pro(x)});
 assert.equal((await x.b.commitPreparedWrite(p)).reason,'operation-commit-guard-required');
 assert.equal((await x.b.commitPreparedWrite(p,{commitGuard:()=>true})).reason,'operation-guard-untrusted');
 const forged=await prepare(x,{id:'forged',auth:{authorizationContext:Object.freeze({operationId:'forged',action:'saveAdvanced'})}});
 assert.equal((await x.b.commitPreparedWrite(forged,{commitGuard:()=>true})).reason,'operation-guard-untrusted');
});
for(const clock of ['wall','mono'])for(const margin of [29000,30000,31000])test(clock+' margin '+margin,async t=>{
 const x=await setup(t),auth=pro(x,'op','saveAdvanced',{[clock+'MarginMs']:margin}),p=await prepare(x,{auth});
 const out=await x.b.commitPreparedWrite(p,auth);assert.equal(out.ok,margin>=30000);if(margin<30000)assert.equal(out.reason,'pro-proof-margin-insufficient');
});
test('Standard BPM requires no Account/device/member and preserves raw advanced values',async t=>{
 const x=await setup(t,{rawAdvanced:true}),old=JSON.parse(x.initial[met]),p=await prepare(x,{action:'saveBpm',fields:{bpm:145}}),r=await x.b.commitPreparedWrite(p);
 assert.equal(r.ok,true);assert.equal(r.publish,false);assert.deepEqual(JSON.parse(r.state.values[met]),{...old,bpm:145});
});
for(const fields of [{bpm:145,volume:90},{meter:'3/4',accents:[true,false,false]},{sound:'analog'},{retained:{new:true}}])test('Standard action cannot modify protected raw '+JSON.stringify(fields),async t=>{
 const x=await setup(t),p=await prepare(x,{action:'saveBpm',fields});assert.equal((await x.b.commitPreparedWrite(p)).reason,'action-semantics-invalid');assert.equal(await head(x),1);
});
test('direct Store advanced save requires trusted Pro, independent of backend boolean',async t=>{
 const x=await setup(t),base=(await x.b.store.hydrate('g1')).snapshot,changes={[met]:JSON.stringify({...JSON.parse(base.values[met]),volume:98})};
 const p=x.b.store.prepare({base,operationId:'direct',action:'saveAdvanced',changes,requiresAuthorization:false});
 assert.equal((await x.b.store.commit(p)).reason,'operation-commit-guard-required');assert.equal(await head(x),1);
});
test('Pro advanced save succeeds; uncommitted retry rechecks original trusted context',async t=>{
 const x=await setup(t);let valid=false;
 const identity={generation:1,credentialFingerprint:'a'.repeat(64)};
 const auth=pro(x,'op','saveAdvanced',{...identity,resolve:()=>valid?{ok:true,policy:'pro',...identity,wallMarginMs:31000,monoMarginMs:31000}:false});
 const p=await prepare(x,{auth});assert.equal((await x.b.commitPreparedWrite(p,auth)).ok,false);
 valid=true;assert.equal((await x.b.retryWrite(p.request,auth)).ok,true);assert.equal(await head(x),2);
 valid=false;const replay=await x.b.retryWrite(p.request);assert.equal(replay.replayed,true);assert.equal(replay.publish,false);assert.equal(await head(x),2);
});
for(const advanced of [false,true])test((advanced?'Pro':'Standard')+' preset apply validates exact preset and dependent key',async t=>{
 const x=await setup(t),v=JSON.parse(x.initial[presets]).items[0],action=advanced?'applyPresetAdvanced':'applyPresetStandard';
 const fields=advanced?{bpm:v.bpm,meter:v.meter,rhythm:v.rhythm,sound:v.sound,volume:v.volume,accents:v.accents}:{bpm:v.bpm};
 const auth=advanced?pro(x,'op',action):undefined,p=await prepare(x,{action,fields,auth,operationData:{presetId:v.id},dependencyKeys:[presets]});
 assert.equal((await x.b.commitPreparedWrite(p,auth)).ok,true);
});
test('Standard apply cannot introduce advanced / arbitrary BPM / omit preset dependency',async t=>{
 const x=await setup(t),id=JSON.parse(x.initial[presets]).items[0].id;
 for(const [n,fields,deps] of [['advanced',{volume:95},[presets]],['wrong-bpm',{bpm:239},[presets]],['no-dependency',{bpm:120},[]]]) {
  const p=await prepare(x,{id:n,action:'applyPresetStandard',fields,operationData:{presetId:id},dependencyKeys:deps});assert.equal((await x.b.commitPreparedWrite(p)).ok,false);
 }
});
test('preset create is Pro; delete is Standard with exact retained rows',async t=>{
 const x=await setup(t),v=JSON.parse(x.initial[presets]);const added={...v.items[0],id:'new',name:'New'};
 const auth=pro(x,'create','createPreset'),p=await prepare(x,{id:'create',action:'createPreset',key:presets,fields:{items:[...v.items,added]},auth});
 assert.equal((await x.b.commitPreparedWrite(p)).reason,'operation-commit-guard-required');assert.equal((await x.b.commitPreparedWrite(p,auth)).ok,true);
 const del=await prepare(x,{id:'delete',action:'deletePreset',key:presets,fields:{items:v.items}});const r=await x.b.commitPreparedWrite(del);assert.equal(r.ok,true);
 assert.equal(JSON.parse(r.state.values[PORT_DELETE_INTENTS])['metronome_preset/new'].generation,'delete');
});
test('deletePreset cannot update survivor or create record',async t=>{
 const x=await setup(t),v=JSON.parse(x.initial[presets]),p=await prepare(x,{action:'deletePreset',key:presets,fields:{items:[{...v.items[0],volume:98}]}});
 assert.equal((await x.b.commitPreparedWrite(p)).reason,'action-semantics-invalid');
});
test('system ACK needs branded exact-generation capability; spoof cannot write dataset',async t=>{
 const x=await setup(t),v=JSON.parse(x.initial[presets]),p=await prepare(x,{id:'delete',action:'deletePreset',key:presets,fields:{items:v.items.slice(1)}});assert((await x.b.commitPreparedWrite(p)).ok);
 const base=(await x.b.store.hydrate('g1')).snapshot,acknowledgements=[{key:'metronome_preset/'+v.items[0].id,generation:'delete'}];
 const no=x.b.store.prepare({base,operationId:'ack-no',action:'ackDelete',changes:{},acknowledgements});assert.equal((await x.b.store.commit(no)).reason,'system-capability-required');
 const cap=testAckCapability(x.scope,{generation:'g1',operationId:'ack',acknowledgements});
 const wrong=x.b.store.prepare({base,operationId:'wrong',action:'ackDelete',changes:{},acknowledgements,systemCapability:cap});assert.equal((await x.b.store.commit(wrong)).ok,false);
 const spoof=x.b.store.prepare({base,operationId:'ack',action:'ackDelete',changes:{[met]:x.initial[met]},acknowledgements,systemCapability:cap});assert.equal((await x.b.store.commit(spoof)).ok,false);
 const goodCap=testAckCapability(x.scope,{generation:'g1',operationId:'real-ack',acknowledgements});
 const good=x.b.store.prepare({base,operationId:'real-ack',action:'ackDelete',changes:{},acknowledgements,systemCapability:goodCap});assert.equal((await x.b.store.commit(good)).ok,true);
 assert.equal(JSON.parse((await x.b.store.hydrate('g1')).snapshot.values[PORT_DELETE_INTENTS])[acknowledgements[0].key],undefined);
});
for(const action of ['evil',...UNIMPLEMENTED_AUTHORITY_ACTIONS,'local','fixture-save','listPresets'])test('new Authority blocks undefined mutation '+action,async t=>{
 const x=await setup(t),p=await prepare(x,{action});const r=await x.b.commitPreparedWrite(p);assert.equal(r.ok,false);assert.equal(await head(x),1);
});
test('read-only preset list and legacy other-store writers remain available',async t=>{
 const x=await setup(t);assert.equal(JSON.parse(x.repo.inspect().values[presets]).items.length,2);
 const storage=new Map(Object.entries(x.initial));const repo=new PortDatasetRepository({storage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},locks:{request:async(_k,_o,fn)=>fn()}});
 for(const key of ['cruisePort.settings','cruisePort.tuner','cruisePort.practiceMenus','cruisePort.gearList','cruisePort.myApps']) {
  const raw=repo.inspect().values[key],r=await repo.runWrite({expectedValues:{[key]:raw}},d=>d.setItem(key,JSON.stringify({...JSON.parse(raw),legacyProbe:true})));assert.equal(r.ok,true);
 }
});
test('ordinary scope cannot initialize Authority or use fixture action; production route cannot install provider',async()=>{
 const scope=createIsolatedIDBAuthorityScope({indexedDB:new IDBFactory(),partitionId:'fixture-partition'}),s=await openIDBAuthorityStore(scope);
 assert.equal((await s.initialize({generation:'g1',control:control(),values:values(),operationId:'seed'})).reason,'initialize-capability-required');s.dispose();
 globalThis.window={};globalThis.location={hostname:'127.0.0.1',pathname:'/apps/cruise-port/index.html'};
 try {assert.throws(()=>installIsolatedAuthorityTestProvider(scope,Object.freeze({capture(){},describe(){},verify(){return true;}})),/test-provider-isolation-required/);} finally{delete globalThis.window;delete globalThis.location;}
});
test('Standard cannot erase raw advanced values by deleting settings',async t=>{
 const x=await setup(t,{rawAdvanced:true}),base=(await x.b.store.hydrate('g1')).snapshot;
 const p=x.b.store.prepare({base,operationId:'erase',action:'saveBpm',changes:{[met]:null}});
 assert.equal((await x.b.store.commit(p)).reason,'action-semantics-invalid');assert.equal(await head(x),1);
});
test('Pro proof is pinned to the prepared payload and action',async t=>{
 const x=await setup(t),auth=pro(x),first=await prepare(x,{auth}),second=await prepare(x,{auth,fields:{volume:91}});
 assert.equal((await x.b.commitPreparedWrite(second,auth)).reason,'operation-id-payload-conflict');
 assert.equal((await x.b.commitPreparedWrite(first,auth)).ok,true);
});
test('ordinary scope fixture control and journal/root APIs do not authorize mutation',async()=>{
 const scope=createIsolatedIDBAuthorityScope({indexedDB:new IDBFactory(),partitionId:'fixture-partition'}),s=await openIDBAuthorityStore(scope);
 assert.equal((await s.updateControl('g1',{expectedEpoch:1,patch:{suspended:false}})).reason,'fixture-control-capability-required');
 assert.equal((await s.writeJournal({})).reason,'fixture-journal-capability-required');
 assert.equal((await s.writeRoot({})).reason,'fixture-root-capability-required');s.dispose();
});
