import { createTestAuthorityScope as createIsolatedIDBAuthorityScope } from './authority-store/test-authority.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PortDatasetRepository, PORT_DATASET_KEYS, PORT_DELETE_INTENTS } from '../port-dataset-repository.js';
import { openIsolatedIDBRepositoryBackend } from '../port-indexeddb-repository-backend.mjs';
import { registerPortRepository, readPortStore, writePortStore } from '../port-dataset-storage.js?v=1.22.17';
import { values, control } from './authority-store/fixture.mjs';
import { AUTHORITY_DB_VERSION, V1_STORE_KEYS } from '../port-idb-authority-contract.mjs';
import { loadSettings, saveSettings } from '../settings-store.js';
import { loadMetronomeSettings, saveMetronomeSettings } from '../metronome-store.js';
import { loadMetronomePresets, saveMetronomePresets } from '../metronome-presets-store.js';
import { loadTunerSettings, saveTunerSettings } from '../tuner-store.js';
import { loadPracticeMenus, savePracticeMenus } from '../practice-menu-store.js';
import { loadPracticeProgress, savePracticeProgress } from '../practice-menu-progress-store.js';
import { loadPracticeHistory, savePracticeHistory } from '../practice-menu-history-store.js';
import { loadPracticeCalendar, savePracticeCalendar } from '../practice-menu-calendar-store.js';
import { loadPracticeMenuSets, savePracticeMenuSets } from '../practice-menu-sets-store.js';
import { loadGearList, saveGearList } from '../gear-list-store.js';
import { loadGearCategories, saveGearCategories } from '../gear-category-store.js';
import { loadMyApps, saveMyApps } from '../my-apps-store.js';
const { IDBFactory, IDBObjectStore, forceCloseDatabase } = createRequire(new URL('./authority-store/package.json', import.meta.url))('fake-indexeddb');
const met='cruisePort.metronome', tuner='cruisePort.tuner', presets='cruisePort.metronomePresets', gear='cruisePort.gearList', apps='cruisePort.myApps';
async function setup(t) {
 const factory=new IDBFactory(),scope=createIsolatedIDBAuthorityScope({indexedDB:factory,partitionId:'fixture-partition'});
 const a=await openIsolatedIDBRepositoryBackend({scope,generation:'g1',channelFactory:()=>null});
 t.after(()=>a.dispose());
 assert.equal((await a.store.initialize({generation:'g1',control:control(),values:values(),operationId:'seed'})).ok,true);
 await a.hydrate();const b=await openIsolatedIDBRepositoryBackend({scope,generation:'g1',channelFactory:()=>null});t.after(()=>b.dispose());await b.hydrate();
 const repository=backend=>new PortDatasetRepository({backend,locks:null,storage:{getItem(){throw Error('legacy access');},setItem(){throw Error('legacy write');}}});
 return {factory,scope,a,b,ra:repository(a),rb:repository(b)};
}
const bump=(repo,key=met,extra={})=>repo.runWrite({expectedValues:{[key]:repo.inspect().values[key]},...extra},draft=>{
 const v=JSON.parse(draft.getItem(key));draft.setItem(key,JSON.stringify({...v,probeCounter:(v.probeCounter||0)+1}));return {ok:true};
});
test('backend import / registration alone creates no DB; unbranded injection rejects',async()=>{
 const factory=new IDBFactory();assert.deepEqual(await factory.databases(),[]);
 assert.throws(()=>new PortDatasetRepository({backend:{kind:'indexeddb-authority'}}),/isolated-backend-required/);
});
test('explicit hydration state never reads legacy; absent generation fails closed',async t=>{
 const scope=createIsolatedIDBAuthorityScope({indexedDB:new IDBFactory(),partitionId:'fixture-partition'});
 const b=await openIsolatedIDBRepositoryBackend({scope,generation:'g1',channelFactory:()=>null});t.after(()=>b.dispose());
 assert.throws(()=>b.inspect(),/authority-hydrating/);await assert.rejects(b.hydrate(),/authority-absent/);
 assert.throws(()=>b.inspect(),/authority-absent/);
});
test('actual Repository same-key cache-stale save rejected without WebLocks or notifications',async t=>{
 const x=await setup(t);assert.equal(x.ra.sharedWriteCapable,true);
 const first=await bump(x.ra),second=await bump(x.rb);assert.equal(first.ok,true);assert.equal(second.reason,'stale');
 assert.equal(JSON.parse((await x.rb.readDatasetState()).values[met]).probeCounter,1);
});
test('different-key stale cache merges full dataset; original committed read base remains exact',async t=>{
 const x=await setup(t);const [a,b]=await Promise.all([bump(x.ra,met),bump(x.rb,tuner)]);
 assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(Object.keys(a.state.values).length,15);assert.equal(Object.keys(b.state.values).length,15);
 const s=await x.ra.readDatasetState();assert.equal(JSON.parse(s.values[met]).probeCounter,1);assert.equal(JSON.parse(s.values[tuner]).probeCounter,1);
 const earlier=a.seq<b.seq?a:b;assert.equal(earlier.state.seq,earlier.seq);
 assert.equal(JSON.parse(earlier.state.values[a.seq<b.seq?tuner:met]).probeCounter,undefined);
});
test('writer read dependencies reject on concurrent updates',async t=>{
 const x=await setup(t),raw=x.ra.inspect().values[met];
 const p=await x.a.prepareWrite({expectedValues:{[met]:raw}},draft=>{draft.getItem(tuner);draft.setItem(met,JSON.stringify({...JSON.parse(raw),bpm:145}));});
 await bump(x.rb,tuner);assert.equal((await x.a.commitPreparedWrite(p)).reason,'stale');
});
test('full revision retains whole dataset CAS',async t=>{
 const x=await setup(t),s=x.ra.inspect();const p=await x.a.prepareWrite({expectedRevision:s.revision},draft=>draft.setItem(met,JSON.stringify({...JSON.parse(s.values[met]),bpm:143})));
 await bump(x.rb,tuner);assert.equal((await x.a.commitPreparedWrite(p)).reason,'stale');
});
test('async writer base cannot advance on cache refresh; caller mutation after dispatch is frozen',async t=>{
 const x=await setup(t),raw=x.a.inspect().values[met];let release;
 const pending=x.a.prepareWrite({expectedValues:{[met]:raw}},async draft=>{await new Promise(r=>release=r);draft.setItem(met,JSON.stringify({...JSON.parse(raw),bpm:144}));});
 await new Promise(r=>setImmediate(r));await bump(x.rb);await x.a.hydrate();release();
 const p=await pending;assert(Object.isFrozen(p.request.base));assert.equal((await x.a.commitPreparedWrite(p)).reason,'stale');
});
for(const [label,key] of [['preset',presets],['Gear',gear],['My Apps',apps]])test('delete/recreate/new-generation/old ACK: '+label,async t=>{
 const x=await setup(t),old=x.ra.inspect().values[key],v=JSON.parse(old),id=v.items[0].id;
 const remove=repo=>repo.runWrite({expectedValues:{[key]:repo.inspect().values[key]}},d=>d.setItem(key,JSON.stringify({...JSON.parse(d.getItem(key)),items:[]})));
 assert.equal((await remove(x.ra)).ok,true);let s=x.ra.inspect(),intentKey=({'cruisePort.metronomePresets':'metronome_preset','cruisePort.gearList':'gear_item','cruisePort.myApps':'my_app'})[key]+'/'+id;
 const oldGeneration=JSON.parse(s.values[PORT_DELETE_INTENTS])[intentKey].generation;
 assert.equal((await x.ra.runWrite({expectedValues:{[key]:s.values[key]}},d=>d.setItem(key,old))).ok,true);
 await remove(x.ra);await x.b.hydrate();s=x.rb.inspect();const newGeneration=JSON.parse(s.values[PORT_DELETE_INTENTS])[intentKey].generation;assert.notEqual(newGeneration,oldGeneration);
 const ack=await x.rb.acknowledgeDelete(intentKey,oldGeneration,s.revision);assert.equal(ack.ok,true);assert.equal(ack.matched,false);
 assert.equal(JSON.parse(x.rb.inspect().values[PORT_DELETE_INTENTS])[intentKey].generation,newGeneration);
});
test('different collections delete intents merge despite dropped notifications',async t=>{
 const x=await setup(t);const drop=(repo,key)=>repo.runWrite({expectedValues:{[key]:repo.inspect().values[key]}},d=>d.setItem(key,JSON.stringify({...JSON.parse(d.getItem(key)),items:[]})));
 const a=await drop(x.ra,presets),b=await drop(x.rb,apps);assert.equal(a.ok,true);assert.equal(b.ok,true);
 const intents=JSON.parse((await x.ra.readDatasetState()).values[PORT_DELETE_INTENTS]);assert(Object.keys(intents).some(k=>k.startsWith('metronome_preset/')));assert(Object.keys(intents).some(k=>k.startsWith('my_app/')));
});
test('response loss original request retry after reopen / suspend is a fact; changed ID payload rejects',async t=>{
 const x=await setup(t),r=await bump(x.ra,met,{operationId:'op-response'}),seq=r.seq;
 x.a.dispose();const b=await openIsolatedIDBRepositoryBackend({scope:x.scope,generation:'g1',channelFactory:()=>null});t.after(()=>b.dispose());await b.hydrate();
 await b.store.updateControl('g1',{expectedEpoch:1,patch:{suspended:true}});
 assert.equal((await b.lookupOperation('op-response')).result.seq,seq);
 const retry=await b.retryWrite(r.retryRequest);assert.equal(retry.replayed,true);assert.equal(retry.seq,seq);
 const request=structuredClone(r.retryRequest);request.changes[met]=JSON.stringify({...JSON.parse(request.changes[met]),bpm:146});
 assert.equal((await b.retryWrite(request)).reason,'operation-id-payload-conflict');assert.equal((await b.store.hydrate('g1')).snapshot.head.seq,seq);
});
for(const [name,guard,reason] of [['false',()=>false,'operation-authorization-rejected'],['throws',()=>{throw Error('denied');},'idb-error'],['promise',()=>Promise.resolve(true),'operation-commit-guard-async'],['thenable',()=>({then(){}}),'operation-commit-guard-async'],['missing',undefined,'operation-commit-guard-required']])test('fixed opaque context / synchronous guard rejects: '+name,async t=>{
 const x=await setup(t),context=Object.freeze({proof:'fixture-only'}),r=await bump(x.ra,met,{authorizationContext:context,commitGuard:guard});assert.equal(r.reason,reason);assert.equal((await x.a.store.hydrate('g1')).snapshot.head.seq,1);
});
for(const patch of [{suspended:true},{fenceRevoked:true},{identityInvalidated:true}])test('fixture control first blocks prepared save '+JSON.stringify(patch),async t=>{
 const x=await setup(t),p=await x.a.prepareWrite({expectedValues:{[met]:x.ra.inspect().values[met]}},d=>d.setItem(met,JSON.stringify({...JSON.parse(d.getItem(met)),bpm:147})));
 assert.equal((await x.b.store.updateControl('g1',{expectedEpoch:1,patch})).ok,true);assert.equal((await x.a.commitPreparedWrite(p)).ok,false);
});
test('unknown raw fields retained; forward raw and domain-invalid writes reject',async t=>{
 const x=await setup(t),raw=x.ra.inspect().values['cruisePort.settings'];
 const r=await x.ra.runWrite({expectedValues:{'cruisePort.settings':raw}},d=>d.setItem('cruisePort.settings',JSON.stringify({version:3,theme:'dark'})));assert.equal(r.ok,true);assert.equal(JSON.parse(r.state.values['cruisePort.settings']).futurePreference.retained,true);
 const bad=await x.ra.runWrite({expectedValues:{[presets]:x.ra.inspect().values[presets]}},d=>d.setItem(presets,JSON.stringify({version:1,items:[{id:'bad'}]})));assert.equal(bad.ok,false);
 const future=await x.ra.runWrite({expectedValues:{[met]:x.ra.inspect().values[met]}},d=>d.setItem(met,'{"version":100}'));assert.equal(future.reason,'forward-incompatible');
});
test('Repository transaction abort leaves full head/oplog unchanged',async t=>{
 const x=await setup(t),original=IDBObjectStore.prototype.add;
 IDBObjectStore.prototype.add=function(value,...args){if(this.name==='records')this.transaction.abort();return original.call(this,value,...args);};
 let r;try{r=await bump(x.ra,met,{operationId:'aborted'});}finally{IDBObjectStore.prototype.add=original;}
 assert.equal(r.ok,false);assert.equal((await x.a.lookupOperation('aborted')).result,null);assert.equal((await x.a.store.hydrate('g1')).snapshot.head.seq,1);
});
const adapters=[
 ['settings',s=>loadSettings(s), (r,s)=>saveSettings(r.settings,s)],
 ['metronome',s=>loadMetronomeSettings(s),(r,s)=>saveMetronomeSettings(r.settings,s)],
 ['presets',s=>loadMetronomePresets(s),(r,s)=>saveMetronomePresets(r.presets,s)],
 ['tuner',s=>loadTunerSettings(s),(r,s)=>saveTunerSettings(r.settings,s)],
 ['Practice menus',s=>loadPracticeMenus(s),(r,s)=>savePracticeMenus(r.items,s)],
 ['Practice progress',s=>loadPracticeProgress(s),(r,s)=>savePracticeProgress(r.progress,s)],
 ['Practice history',s=>loadPracticeHistory(s),(r,s)=>savePracticeHistory(r.history,s)],
 ['Calendar',s=>loadPracticeCalendar(s),(r,s)=>savePracticeCalendar(r.calendar,s)],
 ['Practice sets',s=>loadPracticeMenuSets(s),(r,s)=>savePracticeMenuSets(r.items,s)],
 ['Gear',s=>loadGearList(s),(r,s)=>saveGearList(r.items,s)],
 ['Gear categories',s=>loadGearCategories([],s),(r,s)=>saveGearCategories(r.categories,s)],
 ['My Apps',s=>loadMyApps(s),(r,s)=>saveMyApps(r.items,s)]
];
for(const [name,load,save] of adapters)test('real feature sync-read / async-write adapter: '+name,async t=>{
 const x=await setup(t),storage=Object.freeze({getItem(){throw Error('unhydrated raw read');}});registerPortRepository(storage,x.ra);
 const r=load(storage);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(typeof r.then,'undefined');
 const pending=save(r,storage);assert.equal(typeof pending.then,'function');const out=await pending;assert.equal(out.ok,true,JSON.stringify(out));
 assert.equal(Object.keys(out.state.values).length,PORT_DATASET_KEYS.length);assert.equal(out.publish,false);
});
test('readPortStore before hydration exposes read-only reason rather than defaults as success',async t=>{
 const scope=createIsolatedIDBAuthorityScope({indexedDB:new IDBFactory(),partitionId:'fixture-partition'}),b=await openIsolatedIDBRepositoryBackend({scope,generation:'g1',channelFactory:()=>null});t.after(()=>b.dispose());
 const storage={},repo=new PortDatasetRepository({backend:b});registerPortRepository(storage,repo);
 const result=readPortStore(storage,d=>({ok:true,raw:d.getItem(met)}));assert.equal(result.ok,false);assert.equal(result.readOnly,true);assert.equal(result.reason,'authority-hydrating');
 assert.equal((await writePortStore(storage,[met],d=>d.setItem(met,'{}'))).reason,'authority-hydrating');
});
test('key-version Adapter rejects ABA after external cache refresh',async t=>{
 const x=await setup(t),storage={};registerPortRepository(storage,x.ra);
 readPortStore(storage,d=>({ok:true,raw:d.getItem(met)}));const original=x.ra.inspect().values[met];
 await x.rb.runWrite({expectedValues:{[met]:original}},d=>d.setItem(met,JSON.stringify({...JSON.parse(original),bpm:141})));await x.b.hydrate();assert.equal((await x.rb.runWrite({expectedValues:{[met]:x.rb.inspect().values[met]}},d=>d.setItem(met,original))).ok,true);
 await x.a.hydrate();assert.equal(x.ra.inspect().values[met],original);
 const result=await writePortStore(storage,[met],d=>d.setItem(met,JSON.stringify({...JSON.parse(original),bpm:141})));
 assert.equal(result.reason,'stale');
});
test('fixed authorization context reference is preserved; replay does not require fresh authorization',async t=>{
 const x=await setup(t),context=Object.freeze({proof:'opaque'});let seen;
 const r=await bump(x.ra,met,{operationId:'guarded',authorizationContext:context,commitGuard:(ctx,details)=>{seen=ctx;assert(Object.isFrozen(details));assert.equal(details.authorizationMarginMs,30000);return true;}});
 assert.equal(r.ok,true);assert.equal(seen,context);assert.equal(r.retryRequest.requiresAuthorization,true);
 const replay=await x.b.retryWrite(r.retryRequest,{authorizationContext:context,commitGuard:()=>false});assert.equal(replay.replayed,true);
 assert.equal((await x.b.retryWrite(r.retryRequest)).replayed,true);
});
test('notifications are hints; a delayed refresh cannot replace the exact commit state',async t=>{
 const x=await setup(t),storage={};registerPortRepository(storage,x.ra);
 readPortStore(storage,d=>({ok:true,raw:d.getItem(met)}));const first=await writePortStore(storage,[met],d=>d.setItem(met,JSON.stringify({...JSON.parse(d.getItem(met)),bpm:141})));
 await x.b.hydrate();await bump(x.rb);await x.a.hydrate();
 assert.equal(JSON.parse(first.state.values[met]).bpm,141);assert.equal(first.state.keyRevisions[met],2);
 assert.equal((await writePortStore(storage,[met],d=>d.setItem(met,JSON.stringify({...JSON.parse(d.getItem(met)),bpm:142})))).reason,'stale');
});
test('versionchange closes both backend connections / future DB is preserved',async t=>{
 const x=await setup(t);const upgraded=await new Promise((ok,no)=>{const r=x.factory.open(x.scope.name,AUTHORITY_DB_VERSION+1);r.onupgradeneeded=()=>r.result.createObjectStore("future");r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
 assert.throws(()=>x.ra.inspect(),/versionchange/);assert.equal((await bumpSafe(x.ra)).ok,false);
 await assert.rejects(openIsolatedIDBRepositoryBackend({scope:x.scope,generation:'g1',channelFactory:()=>null}),/future-schema/);assert(upgraded.objectStoreNames.contains('future'));upgraded.close();
});
async function bumpSafe(repo){try{return await bump(repo);}catch(e){return {ok:false,reason:e.code};}}
for(const kind of ['corrupt head','missing record'])test('Repository hydration fails closed without legacy fallback: '+kind,async t=>{
 const x=await setup(t),s=(await x.a.store.hydrate('g1')).snapshot;
 const db=await new Promise(ok=>{const r=x.factory.open(x.scope.name,AUTHORITY_DB_VERSION);r.onsuccess=()=>ok(r.result);});
 await new Promise((ok,no)=>{const tx=db.transaction(['head','records'],'readwrite');tx.oncomplete=ok;tx.onabort=no;
  if(kind==='corrupt head')tx.objectStore('head').put({...s.head,manifestId:'missing'});else tx.objectStore('records').delete(['g1',met,s.versions[met]]);
 });db.close();await assert.rejects(x.a.hydrate());assert.throws(()=>x.ra.inspect());assert.equal(x.ra.sharedWriteCapable,false);
});
test('unexpected native connection close invalidates backend display/read/write',async t=>{
 const factory=new IDBFactory();let db;const proxy={open(...args){const r=factory.open(...args);r.addEventListener('success',()=>db=r.result);return r;}};
 const scope=createIsolatedIDBAuthorityScope({indexedDB:proxy,partitionId:'fixture-partition'}),b=await openIsolatedIDBRepositoryBackend({scope,generation:'g1',channelFactory:()=>null});t.after(()=>b.dispose());
 await b.store.initialize({generation:'g1',control:control(),values:values(),operationId:'initial'});await b.hydrate();forceCloseDatabase(db);await new Promise(r=>setImmediate(r));
 assert.throws(()=>b.inspect(),/connection-lost/);assert.equal((await b.runWrite({expectedValues:{[met]:values()[met]}},()=>{})).ok,false);
});
test('caller cannot swap guard / dependency list while async writer is pending',async t=>{
 const x=await setup(t),raw=x.ra.inspect().values[met],dependencies=[tuner];let release;
 const options={expectedValues:{[met]:raw},dependencyKeys:dependencies,authorizationContext:Object.freeze({proof:'fixture'}),commitGuard:()=>false};
 const pending=x.ra.runWrite(options,async d=>{await new Promise(r=>release=r);d.setItem(met,JSON.stringify({...JSON.parse(raw),bpm:146}));});
 await new Promise(r=>setImmediate(r));options.commitGuard=()=>true;dependencies.length=0;release();
 assert.equal((await pending).reason,'operation-authorization-rejected');assert.equal((await x.a.store.hydrate('g1')).snapshot.head.seq,1);
});
test('explicit preset apply dependency rejects a stale preset even when settings key is current',async t=>{
 const x=await setup(t),raw=x.ra.inspect().values[met],p=await x.a.prepareWrite({expectedValues:{[met]:raw},dependencyKeys:[presets]},d=>d.setItem(met,JSON.stringify({...JSON.parse(raw),bpm:150})));
 const presetRaw=x.rb.inspect().values[presets];await x.rb.runWrite({expectedValues:{[presets]:presetRaw}},d=>d.setItem(presets,JSON.stringify({...JSON.parse(presetRaw),items:[]})));
 assert.equal((await x.a.commitPreparedWrite(p)).reason,'stale');
});
test('unavailable notification channel never becomes a lock or leaks a failed open',async t=>{
 const scope=createIsolatedIDBAuthorityScope({indexedDB:new IDBFactory(),partitionId:'fixture-partition'});
 const b=await openIsolatedIDBRepositoryBackend({scope,generation:'g1',channelFactory(){throw Error('channel unavailable');}});t.after(()=>b.dispose());
 assert.equal((await b.store.initialize({generation:'g1',control:control(),values:values(),operationId:'seed'})).ok,true);await b.hydrate();
 const repo=new PortDatasetRepository({backend:b,locks:null});assert.equal((await bump(repo)).ok,true);
});
test('blocked backend open cannot return display/cache or fall back to legacy',async()=>{
 // An existing v1 connection without a versionchange handler blocks the v1->v2 upgrade.
 const factory=new IDBFactory(),scope=createIsolatedIDBAuthorityScope({indexedDB:factory,partitionId:'fixture-partition'});
 const blocker=await new Promise(ok=>{const r=factory.open(scope.name,1);r.onupgradeneeded=()=>Object.entries(V1_STORE_KEYS).forEach(([name,keyPath])=>r.result.createObjectStore(name,{keyPath}));r.onsuccess=()=>ok(r.result);});
 await assert.rejects(openIsolatedIDBRepositoryBackend({scope,generation:'g1',channelFactory:()=>null}),/open-blocked/);blocker.close();
 await new Promise(r=>setTimeout(r,10));const db=await new Promise(ok=>{const r=factory.open(scope.name);r.onsuccess=()=>ok(r.result);});assert.equal(db.version,1);db.close();
});
