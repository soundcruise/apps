import {createTestAuthorityScope} from './test-authority.mjs';
import {control,values} from './fixture.mjs';
import {identity,account} from './account-provider-fixture.mjs';
import {openIDBAuthorityStore} from '../../port-indexeddb-authority-store.mjs';
import {createIsolatedAccountPortCutover} from '../../port-account-cutover.mjs';
export function storageFixture(initial=values()){
 const entries=new Map(Object.entries(initial).filter(([,v])=>v!==null));
 return {get length(){return entries.size;},key:n=>[...entries.keys()][n]??null,getItem:k=>entries.get(k)??null,
  setItem(k,v){entries.set(k,String(v));},removeItem:k=>entries.delete(k)};
}
export async function accountRows(indexedDB,edit){
 const db=await new Promise((r,j)=>{const q=indexedDB.open('sound-cruise-sync-account');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
 try {const name=db.version===3?'account-meta-v3':'meta';return await new Promise((r,j)=>{const tx=db.transaction(name,edit?'readwrite':'readonly'),s=tx.objectStore(name),k=s.getAllKeys(),v=s.getAll();v.onsuccess=()=>edit?.(s);tx.oncomplete=()=>r({version:db.version,stores:[...db.objectStoreNames],rows:k.result.map((k,n)=>[k,v.result[n]])});tx.onabort=()=>j(tx.error);});}finally{db.close();}
}
export async function setupCutover({indexedDB,root,storage=storageFixture(),scopeName='sound-cruise-port-authority-v1-fixture-cutover',seed=true,checkpoint}={}){
 const scope=()=>createTestAuthorityScope({indexedDB,name:scopeName,partitionId:'fixture-partition'}),store=await openIDBAuthorityStore(scope());
 if(seed){await root.storage.setAccount(account('A'),indexedDB);const init=await store.initialize({generation:'g1',control:{...control(),identity:identity('A')},values:values(),operationId:'seed'});if(!init.ok)throw Error('cutover-seed-failed');}
 const engine=await createIsolatedAccountPortCutover({scope:scope(),indexedDB,storage,checkpoint});
 return {engine,store,storage,scopeName,rows:edit=>accountRows(indexedDB,edit),dispose(){engine.dispose();store.dispose();}};
}
