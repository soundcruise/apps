import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {PortDatasetRepository} from './port-dataset-repository.js';
import {createPortWriterContext} from './port-writer-context.mjs';
const require=createRequire(process.env.STUDIO_TEST_RUNTIME || import.meta.url);
let newIDB;try{({indexedDB:newIDB}=require('fake-indexeddb'));}catch{}
const tick=()=>new Promise(r=>setTimeout(r,0));
const values=()=>{const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),m};};
function root(){return{parent:null};}
function repo(c,s){return new PortDatasetRepository({storage:s,localWriterContext:c,locks:{request:(_,__,f)=>f()},token:()=>crypto.randomUUID()});}
const write=(r,fn=()=>{})=>r.runWrite({expectedRevision:r.inspect().revision},async draft=>{draft.setItem('cruisePort.gearList',JSON.stringify({version:5,items:[]}));await fn();return{ok:true};});
test('anonymous local/offline writes need no network or new authority',async()=>{const s=values(),c=createPortWriterContext({root:root(),storage:s});assert.equal((await write(repo(c,s))).ok,true);});
test('late Account storage installation is fail closed',()=>{const s=values(),r=root(),c=createPortWriterContext({root:r,storage:s});r.SoundCruiseSyncAccount={storage:{}};assert.throws(()=>c.assertCurrent(),/source-changed/);});
test('asynchronous/unknown Pro source is rejected',()=>{for(const value of [undefined,Promise.resolve({}),null,{}, {auth:{}}]){const r={...root(),SoundCruiseProOperationSource:{read:()=>value}},c=createPortWriterContext({root:r,storage:values()});assert.throws(()=>c.assertCurrent(),/source-unavailable/);}});
test('Pro invalidation during async preparation preserves metadata',async()=>{const s=values(),c=createPortWriterContext({root:root(),storage:s}),r=repo(c,s);const out=await write(r,()=>s.setItem('soundCruiseProRevokePending','["synthetic"]'));assert.equal(out.ok,false);assert.equal(s.getItem('cruisePort.gearList'),null);});
test('persisted Pro credential without a live source is rejected',()=>{const s=values();s.setItem('soundCruiseProAuth','synthetic');const c=createPortWriterContext({root:root(),storage:s});assert.throws(()=>c.assertCurrent(),/revoked/);});
test('Studio identity cannot be reinterpreted as Port Owner authorization',async()=>{const r={...root(),[Symbol.for('sound-cruise.port-writer-context.v1')]:{hasIdentity:()=>true}},s=values(),c=createPortWriterContext({root:r,storage:s});assert.equal((await write(repo(c,s))).reason,'port-owner-admission-required');assert.equal(s.m.size,0);});
test('Account switch in preparation preserves A and leaves B untouched',async()=>{let gen=0,listener;const a={getGeneration:()=>gen,getAccount:async()=>({id:'A'}),subscribeAccount:fn=>listener=fn};const s=values(),r={...root(),SoundCruiseSyncAccount:{storage:a}},c=createPortWriterContext({root:r,storage:s});await tick();const result=await write(repo(c,s),()=>{gen++;listener();});assert.equal(result.ok,false);assert.equal(s.m.size,0);});
test('unknown Account observation never permits a write',async()=>{const r={...root(),SoundCruiseSyncAccount:{storage:{getAccount:async()=>{throw Error('unknown');}}}},c=createPortWriterContext({root:r,storage:values()});await tick();assert.throws(()=>c.assertCurrent(),/context-changed/);});
async function database(name){return new Promise((resolve,reject)=>{const q=newIDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('meta');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
async function put(db,v){await new Promise((resolve,reject)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(v,'account');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
async function accountFixture(){const name='fence-'+crypto.randomUUID(),db=await database(name),a={id:'A'};await put(db,a);const s=values(),r={...root(),indexedDB:newIDB,SoundCruiseSyncAccount:{storage:{DATABASE_NAME:name,getGeneration:()=>0,getAccount:async()=>a}}},c=createPortWriterContext({root:r,storage:s});await tick();return{db,c,s};}
test('raw cross-tab Account replacement is detected without BroadcastChannel',{skip:!newIDB && 'Dedicated fake-indexeddb runtime required'},async()=>{const{db,c,s}=await accountFixture();await put(db,{id:'B'});const result=await write(repo(c,s));assert.equal(result.reason,'port-account-context-changed');assert.equal(s.m.size,0);db.close();});
test('Account transaction serializes publication before queued replacement',{skip:!newIDB && 'Dedicated fake-indexeddb runtime required'},async()=>{const{db,c,s}=await accountFixture();let replacement;const fact=await c.commit(()=>{replacement=put(db,{id:'B'});s.setItem('linearization','A');return{ok:true};});assert.equal(fact.ok,true);await replacement;assert.equal(s.getItem('linearization'),'A');await assert.rejects(c.commit(()=>assert.fail('must not commit under B')),/context-changed/);db.close();});
test('failed local commit is not retried automatically',{skip:!newIDB && 'Dedicated fake-indexeddb runtime required'},async()=>{const{db,c}=await accountFixture();let calls=0;await assert.rejects(c.commit(()=>{calls++;throw Error('write-failed');}),/write-failed/);assert.equal(calls,1);db.close();});

test('read before Account observation cannot acquire authority retrospectively',async()=>{const r={...root(),SoundCruiseSyncAccount:{storage:{getAccount:async()=>null}}},c=createPortWriterContext({root:r,storage:values()}),token=c.captureRead();await tick();assert.throws(()=>c.assertRead(token),/read-admission-required/);c.assertRead(c.captureRead());});

test('first and repeated store saves retain the validated read admission',async()=>{
 const {registerPortRepository,readPortStore,writePortStore}=await import('./port-dataset-storage.js?v=1.27.0');
 const storage=values(),c=createPortWriterContext({root:root(),storage}),r=repo(c,storage),key='cruisePort.gearList';
 registerPortRepository(storage,r);readPortStore(storage,view=>view.getItem(key));
 for(let n=0;n<3;n++) {const result=await writePortStore(storage,[key],draft=>{draft.setItem(key,JSON.stringify({version:5,items:[{id:'item',name:'edit-'+n}]}));return{ok:true};});assert.equal(result.ok,true,result.reason);}
 assert.equal(JSON.parse(storage.getItem(key)).items[0].name,'edit-2');
});

test('Project-only identity remains quarantined even with a valid shared Account database',async()=>{
 const s=values(),account={DATABASE_NAME:'synthetic-account-db',getGeneration:()=>1,getAccount:async()=>({accountId:'A'}),subscribeAccount:()=>{}};
 const r={...root(),indexedDB:{open(){assert.fail('Owner-less Project must not open a publication transaction');}},SoundCruiseSyncAccount:{storage:account},parent:{[Symbol.for('sound-cruise.port-writer-context.v1')]:{hasIdentity:()=>true}}};
 const c=createPortWriterContext({root:r,storage:s});await c.initialized;
 const result=await write(repo(c,s));assert.equal(result.reason,'port-owner-admission-required');assert.equal(s.m.size,0);
});
