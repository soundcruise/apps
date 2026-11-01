import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {PortDatasetRepository} from './port-dataset-repository.js';
function fixture(initial={accountId:'A',accountDeviceId:'device-A',accountCredential:'synthetic-A'}) {
 let account=initial,generation=0;
 const accountStorage={getGeneration:()=>generation,getAccount:async()=>account};
 const data=new Map(),events=[];
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const repo=new PortDatasetRepository({storage,accountStorage,locks:{request:async(_n,_o,fn)=>fn()},token:()=>webcrypto.randomUUID(),notify:e=>events.push(e)});
 const change=value=>{account=value;generation++;};
 return {repo,data,events,storage,change,accountStorage,initial};
}
const B={accountId:'B',accountDeviceId:'device-B',accountCredential:'synthetic-B'};
async function write(f,writer=tx=>{tx.setItem('cruisePort.gearCategories',JSON.stringify({version:1,categories:[]}));return {ok:true};},options={}){
 const base=await f.repo.readDatasetState();return f.repo.runWrite({expectedRevision:base.revision,...options},writer);
}
test('same native Account saves; old document refuses B without mutating bytes or notifying Sync; A can resume',async()=>{
 const f=fixture();assert((await write(f)).ok);const before=[...f.data],n=f.events.length;f.change(B);
 assert.equal((await write(f)).reason,'account-changed');assert.deepEqual([...f.data],before);assert.equal(f.events.length,n);
 f.change(f.initial);assert((await write(f)).ok);
});
for(const change of ['account','device','credential','cleared'])test('reject changed '+change+' context before calling writer',async()=>{
 const f=fixture();await f.repo.accountBaseline;f.change(change==='account'?B:change==='device'?{...f.initial,accountDeviceId:'other'}:change==='credential'?{...f.initial,accountCredential:'other'}:null);let ran=false;
 assert.equal((await write(f,()=>{ran=true;return {ok:true};})).reason,'account-changed');assert.equal(ran,false);assert.equal(f.data.size,0);
});
test('same identity reauthentication generation does not permanently reject legitimate saves',async()=>{
 const f=fixture();await f.repo.accountBaseline;f.change({...f.initial,label:'new label'});assert((await write(f)).ok);
});
test('unconfigured local-only Port retains its local-save behavior; connecting requires a fresh document',async()=>{
 const f=fixture(null);assert((await write(f)).ok);f.change(B);assert.equal((await write(f)).reason,'account-changed');
 const fresh=new PortDatasetRepository({storage:f.storage,accountStorage:f.accountStorage,locks:{request:async(_n,_o,fn)=>fn()},token:()=>webcrypto.randomUUID()});
 assert((await fresh.runWrite({expectedRevision:fresh.inspect().revision},()=>({ok:true}))).ok);
});
test('Account changes during async preparation and A-B-A cannot publish',async()=>{
 const f=fixture();const r=await write(f,async tx=>{tx.setItem('cruisePort.gearCategories',JSON.stringify({version:1,categories:[]}));f.change(B);f.change(f.initial);return {ok:true};});assert.equal(r.reason,'account-changed');assert.equal(f.data.size,0);
});
test('Account change at synchronous storage I/O rolls back and preserves all previous bytes',async()=>{
 const f=fixture();assert((await write(f)).ok);const before=[...f.data];let once=true;const set=f.storage.setItem;f.storage.setItem=(k,v)=>{set(k,v);if(once){once=false;f.change(B);}};
 const r=await write(f,tx=>{tx.setItem('cruisePort.gearCategories',JSON.stringify({version:1,categories:[{id:'g',name:'Synthetic'}]}));return {ok:true};});assert.equal(r.reason,'account-changed');assert.equal(r.status,'rolled-back');assert.deepEqual([...f.data],before);assert.equal(f.events.length,1);
});
test('existing caller commit guard remains enforced',async()=>{const f=fixture();const r=await write(f,undefined,{commitGuard:()=>false});assert.equal(r.reason,'operation-authorization-rejected');assert.equal(f.data.size,0);});
test('post-publication Account invalidation reports historical commit but suppresses authorized notification',async()=>{
 const f=fixture();f.repo.subscribe(()=>f.change(B));const r=await write(f);assert(r.ok);assert.equal(r.operationAuthorized,false);assert.equal(f.events[0].operationAuthorized,false);
});
test('Account DB failure is not an anonymous grant',async()=>{const f=fixture();await f.repo.accountBaseline;f.accountStorage.getAccount=async()=>{throw Error('synthetic-unavailable');};assert.equal((await write(f)).ok,false);assert.equal(f.data.size,0);});

// Exercise the actual stores and production repository factory, not only a raw transaction.
for(const family of ['gear','categories','myApps','practice'])test('real '+family+' store rejects B even after an incidental reread, then permits A',async()=>{
 const f=fixture(),savedRoot=globalThis.SoundCruiseSyncAccount;
 globalThis.SoundCruiseSyncAccount={storage:f.accountStorage};
 try {
  const {portRepository}=await import('./port-dataset-storage.js?v=1.24.23');
  const repo=portRepository(f.storage);repo.locks={request:async(_n,_o,fn)=>fn()};
  let load,save,item;
  if(family==='gear'){
   const s=await import('./gear-list-store.js?v=1.24.23');load=()=>s.loadGearList(f.storage);save=()=>s.saveGearList([item],f.storage);item=s.createGearItem({name:'Synthetic',manufacturer:'',category:'guitar',status:'owned',priority:'medium',priceText:'',memo:''},[]);
  }else if(family==='categories'){
   const s=await import('./gear-category-store.js?v=1.24.23');load=()=>s.loadGearCategories([],f.storage);save=()=>s.saveGearCategories([{id:'synthetic-category',name:'Synthetic category'}],f.storage);
  }else if(family==='myApps'){
   const s=await import('./my-apps-store.js?v=1.24.23');load=()=>s.loadMyApps(f.storage);save=()=>s.saveMyApps([item],f.storage);item=s.createMyApp({name:'Synthetic',url:'https://example.invalid'},[]).item;
  }else{
   const s=await import('./practice-menu-store.js?v=1.24.23');load=()=>s.loadPracticeMenus(f.storage);save=()=>s.savePracticeMenus([item],f.storage);item=s.createPracticeMenu({name:'Synthetic',durationMinutes:5,appId:null,memo:''},[]);
  }
  load();assert((await save()).ok);const before=[...f.data];f.change(B);load();const r=await save();assert.equal(r.reason,'account-changed');assert.deepEqual([...f.data],before);f.change(f.initial);assert((await save()).ok);
 } finally {globalThis.SoundCruiseSyncAccount=savedRoot;}
});

test('native Account rejection is not a replacement for a missing or invalid operation permission guard',async()=>{const f=fixture();assert.equal((await write(f,undefined,{authorizationContext:{}})).reason,'operation-commit-guard-required');assert.equal((await write(f,undefined,{commitGuard:true})).reason,'operation-commit-guard-invalid');assert.equal(f.data.size,0);});
test('historical native Account shape remains readable/writable without a new identity schema',async()=>{const f=fixture({accountCredential:'synthetic-legacy'});assert((await write(f)).ok);f.change({accountCredential:'synthetic-other'});assert.equal((await write(f)).reason,'account-changed');});

test('the native DB comparison rejects a changed identity even before a delayed cross-tab generation notification',async()=>{const f=fixture();await f.repo.accountBaseline;f.accountStorage.getAccount=async()=>B;assert.equal((await write(f)).reason,'account-changed');assert.equal(f.data.size,0);});
test('Account change while the existing dataset lock is queued rejects before the writer',async()=>{const f=fixture();await f.repo.accountBaseline;let enter,release;const queued=new Promise(r=>enter=r),gate=new Promise(r=>release=r);f.repo.locks={request:async(_n,_o,fn)=>{enter();await gate;return fn();}};const pending=write(f);await queued;f.change(B);release();assert.equal((await pending).reason,'account-changed');assert.equal(f.data.size,0);});
