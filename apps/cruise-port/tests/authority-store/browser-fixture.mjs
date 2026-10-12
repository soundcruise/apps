import { createIsolatedIDBAuthorityScope, openIDBAuthorityStore, AUTHORITY_DB_NAME } from '../../port-indexeddb-authority-store.mjs';
import { STORE_KEYS, PORT_DELETE_INTENTS, hashText } from '../../port-idb-authority-contract.mjs';
import { values, control, patch } from './fixture.mjs';
let scope,store,partitionId;const packets=new Map(),handles=new Map(),events=[];
const met='cruisePort.metronome',tuner='cruisePort.tuner';
const snapshot=async()=>{const r=await store.hydrate('g1');if(!r.ok)throw Error(r.reason);return r.snapshot;};
window.IDBQA={
 async setup(id){
  partitionId=id;scope=createIsolatedIDBAuthorityScope({indexedDB,partitionId,onLifecycle:e=>events.push(e)});
  store=await openIDBAuthorityStore(scope);const before=await store.hydrate('g1');
  if(before.status==='absent'){const seeded=await store.initialize({generation:'g1',control:control('g1',partitionId),values:values(),operationId:'initial'});if(!seeded.ok)throw Error(seeded.reason);}
  else if(!before.ok)throw Error(before.reason);
  return snapshot();
 },
 snapshot,
 async prepare(id,key=met,fields={bpm:140},extra={}){
  const base=await snapshot(),packet={base,operationId:id,changes:patch(base,key,fields),...extra};packets.set(id,packet);handles.set(id,store.prepare(packet));return packet;
 },
 preparePacket(packet){packets.set(packet.operationId,packet);handles.set(packet.operationId,store.prepare(packet));},
 async prepareIntent(id,key){const base=await snapshot(),packet={base,operationId:id,changes:{[PORT_DELETE_INTENTS]:JSON.stringify({...JSON.parse(base.values[PORT_DELETE_INTENTS]||'{}'),[key]:{generation:id}})}};
  packets.set(id,packet);handles.set(id,store.prepare(packet));return packet;
 },
 commit(id){return store.commit(handles.get(id));},lookup:id=>store.lookupOperation('g1',id),
 async reopen(){store.dispose();store=await openIDBAuthorityStore(scope);return snapshot();},
 async counts(){
  const db=await new Promise((ok,no)=>{const r=indexedDB.open(AUTHORITY_DB_NAME,1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
  try{return await new Promise((ok,no)=>{const tx=db.transaction(Object.keys(STORE_KEYS),'readonly'),result={};tx.oncomplete=()=>ok(result);tx.onabort=()=>no(tx.error);
   for(const key of Object.keys(STORE_KEYS)){const r=tx.objectStore(key).count();r.onsuccess=()=>{result[key]=r.result;};}
  });}finally{db.close();}
 },
 async guardAbort(kind){
  const base=await snapshot(),h=store.prepare({base,operationId:'guard-'+kind,changes:patch(base,met,{bpm:178}),authorizationContext:Object.freeze({operationId:'guard-'+kind})});
  return store.commit(h,{commitGuard:()=>{if(kind==='promise')return Promise.resolve(true);throw Error('fixture denied');}});
 },
 armCrash(){
  const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){const r=add.apply(this,args);
   if(this.name==='records')r.addEventListener('success',()=>{ debugger; },{once:true});return r;
  };
 },
 async upgrade(){
  return new Promise((ok,no)=>{const r=indexedDB.open(AUTHORITY_DB_NAME,2);r.onupgradeneeded=()=>r.result.createObjectStore('future');r.onsuccess=()=>{r.result.close();ok({events:[...events],status:store.status});};r.onerror=()=>no(r.error);});
 },
 async futureOpen(){try{await openIDBAuthorityStore(scope);return {ok:true};}catch(e){return {ok:false,reason:e.code};}},
 async checksum(){const text='あ😀'+('x'.repeat(65)),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return {ours:hashText(text),native:[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('')};},
 status:()=>({status:store?.status,events:[...events]}), keys:{met,tuner},
};
