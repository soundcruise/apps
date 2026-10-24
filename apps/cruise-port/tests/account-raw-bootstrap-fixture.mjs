import {createTestAuthorityScope} from './authority-store/test-authority.mjs';import {bootstrapFixtureProof} from './authority-store/account-bootstrap-proof.mjs';
import {control,values} from './authority-store/fixture.mjs';import {openIDBAuthorityStore} from '../port-indexeddb-authority-store.mjs';
import {createIsolatedAccountBootstrapCoordinator} from '../port-account-bootstrap.mjs';
import {enrollIsolatedAccountWriters,cutoverIsolatedAccountStore,provisionEmptyIsolatedAccountStore,createIsolatedAccountMutationStore,ACCOUNT_CANONICAL_STORE_V3 as STORE} from '../../shared/sync-account/account-mutation-receipts.mjs';
const account=id=>({accountId:id,accountDeviceId:'device-'+id,accountCredential:'fixture-credential-'+id});let name,co,store,context,scopeFactory,held,state,entered=false;
async function rows(storeName=STORE,edit){const db=await new Promise((r,j)=>{const q=indexedDB.open('sound-cruise-sync-account');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});try{return await new Promise((r,j)=>{let tx;try{tx=db.transaction(storeName,edit?'readwrite':'readonly');}catch(e){j(e);return;}const s=tx.objectStore(storeName),k=s.getAllKeys(),v=s.getAll();v.onsuccess=()=>edit?.(s);tx.oncomplete=()=>r({version:db.version,stores:[...db.objectStoreNames],entries:k.result.map((key,n)=>[key,v.result[n]])});tx.onabort=()=>j(tx.error);});}finally{db.close();}}
window.rawBootstrap={
 async init({scopeName,seed=false,legacy=false}){name=scopeName;state={active:true,revision:1,retired:['A']};scopeFactory=()=>createTestAuthorityScope({indexedDB,name,partitionId:'fixture-partition'});
  if(seed){if(legacy)await SoundCruiseSyncAccount.storage.setAccount(account('B'));else await provisionEmptyIsolatedAccountStore({indexedDB,scopeName:name});}
  store=await openIDBAuthorityStore(scopeFactory());if(seed){const r=await store.initialize({generation:'g1',control:control(),values:values(),operationId:'seed'});if(!r.ok)throw Error(r.reason);}
  co=await createIsolatedAccountBootstrapCoordinator({scope:scopeFactory(),indexedDB,locks:navigator.locks,fixtureProof:bootstrapFixtureProof(state)});return true;
 },rows:(s=STORE)=>rows(s),enroll:()=>enrollIsolatedAccountWriters({indexedDB,scopeName:name}),cutover:()=>cutoverIsolatedAccountStore({indexedDB,scopeName:name}),
 async capture(){context=await co.capture('g1');return true;},start:(id='B',kind='create',op='bootstrap')=>co.start({context,operationId:op,kind,candidate:account(id)}),
 recover:(op='bootstrap')=>co.reconcile({generation:'g1',operationId:op}),authority:()=>store.hydrate('g1'),intents:()=>store.accountBootstraps('g1'),
 oldRaw:()=>rows('meta',s=>s.put(account('A'),'account')),raw:id=>rows(STORE,s=>s.put(account(id),'account')),
 staleCapture:()=>createIsolatedAccountMutationStore({indexedDB,scopeName:name,protocol:3}).capture().then(()=>true),
 oldClassic:()=>SoundCruiseSyncAccount.storage.setAccount(account('A')),
 async hold(){held=await new Promise(r=>{const q=indexedDB.open('sound-cruise-sync-account',2);q.onsuccess=()=>r(q.result);});held.onversionchange=()=>{};},unhold(){held.close();},
 revoke(){state.active=false;state.revision++;},
 abort(){const old=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(v,k){if(k==='accountBootstrapReceipt:v1'){this.transaction.abort();throw Error('injected');}return old.call(this,v,k);};},
 pauseAck(){const old=IDBDatabase.prototype.transaction,descriptor=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete');IDBDatabase.prototype.transaction=function(names,mode,...args){const tx=old.call(this,names,mode,...args);if(names===STORE&&mode==='readwrite')Object.defineProperty(tx,'oncomplete',{set(fn){descriptor.set.call(tx,()=>{entered=true;/* intentionally never acknowledges to caller */});},configurable:true});return tx;};},entered:()=>entered
};
