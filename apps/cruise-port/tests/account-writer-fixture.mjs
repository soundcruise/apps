// Product-external fixture. No real credential, endpoint, qualification or writer activation.
import {createTestAuthorityScope} from './authority-store/test-authority.mjs';
import {control,values} from './authority-store/fixture.mjs';
import {openIDBAuthorityStore} from '../port-indexeddb-authority-store.mjs';
import {createIsolatedPortAccountCoordinator,portAccountMutationBinding} from '../port-account-coordination.mjs';
import {createPortAccountJoin} from '../port-account-join.js';
import {createIsolatedAccountWriterAdapter} from '../port-account-writer-participation.mjs';
import {createIsolatedAccountMutationStore,enrollIsolatedAccountWriters} from '../../shared/sync-account/account-mutation-receipts.mjs';
const account=id=>({accountId:id,accountDeviceId:'device-'+id,accountCredential:'fixture-credential-'+id});
const identity=id=>({...control().identity,ownership:'bound-account',accountId:id,accountGeneration:7,membershipId:'member-'+id,membershipGeneration:11});
const summary=id=>({account:{id,state:'active',generation:7},memberships:[{appId:'port',id:'member-'+id,state:'active',generation:11}]});
let name,store,service,adapter,scopeFactory,co,ticket,held,gate,release,entered=false;
const binding=(id,from,to)=>portAccountMutationBinding({generation:'g1',operationId:id,identity:identity(from),expectedEpoch:1,expectedPointerEpoch:1,kind:'switch',destination:{accountId:to,accountDeviceId:'device-'+to}},name);
async function rows(edit){const db=await new Promise((r,j)=>{const q=indexedDB.open('sound-cruise-sync-account');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});try{return await new Promise((r,j)=>{const tx=db.transaction('meta',edit?'readwrite':'readonly'),s=tx.objectStore('meta'),k=s.getAllKeys(),v=s.getAll();v.onsuccess=()=>edit?.(s);tx.oncomplete=()=>r({version:db.version,entries:k.result.map((key,n)=>[key,v.result[n]])});tx.onabort=()=>j(tx.error);});}finally{db.close();}}
async function coordinator(wrap=false){co?.dispose();co=await createIsolatedPortAccountCoordinator({scope:scopeFactory(),indexedDB,locks:navigator.locks,accountStorage:{getGeneration:()=>0,subscribeAccount:()=>()=>{},changeAccountIfCurrent:()=>{throw Error('wrong provider');}},mutationStore:wrap?{...service,async mutate(q){const r=await service.mutate(q);entered=true;await gate;return r;}}:service});return co;}
window.writerFixture={
 async init({scopeName,seed=false}){name=scopeName;scopeFactory=()=>createTestAuthorityScope({indexedDB,name,partitionId:'fixture-partition'});if(seed)await SoundCruiseSyncAccount.storage.setAccount(account('A'));
 store=await openIDBAuthorityStore(scopeFactory());if(seed){const r=await store.initialize({generation:'g1',control:{...control(),identity:identity('A')},values:values(),operationId:'seed'});if(!r.ok)throw Error(r.reason);}
 service=createIsolatedAccountMutationStore({indexedDB,scopeName:name,protocol:2});adapter=createIsolatedAccountWriterAdapter({indexedDB,scopeName:name,scopeFactory,locks:navigator.locks,summary:a=>({authorityGeneration:'g1',summary:summary(a.accountId)})});return true;},
 enroll:()=>enrollIsolatedAccountWriters({indexedDB,scopeName:name}),rows:()=>rows(),
 async capture(){ticket=await service.capture();return true;},
 aux:(id='new')=>service.auxiliary({context:ticket,key:'pendingStart',value:{operationId:id},write:true}).then(()=>true),
 mutate:(id='op',from='A',to='B')=>service.mutate({context:ticket,binding:binding(id,from,to),nextAccount:account(to)}).then(r=>({ok:r.ok,canWrite:r.canWrite})),
 proof:(id='op',from='A',to='B')=>service.reconcile(binding(id,from,to)),
 oldWrite:()=>SoundCruiseSyncAccount.storage.setAccount(account('C')),
 raw:id=>rows(s=>s.put(account(id),'account')),
 async hold(){held=await new Promise(r=>{const q=indexedDB.open('sound-cruise-sync-account',1);q.onsuccess=()=>r(q.result);});held.onversionchange=()=>{};},unhold(){held.close();},
 async transition({pause=false,abort=false}={}){if(pause){gate=new Promise(r=>release=r);entered=false;}if(abort){const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,k){if(k==='accountMutationJournal:v1'){this.transaction.abort();throw Error('fixture-abort');}return original.call(this,v,k);};}
 await coordinator(pause);const context=await co.observe({generation:'g1',summary:summary('A')});return co.transition({context,operationId:'transition',nextAccount:account('B')});},
 entered:()=>entered,release:()=>release?.(),
 async recover(){await coordinator();return co.reconcileTransition({generation:'g1',operationId:'transition'});},
 authority:()=>store.hydrate('g1'),intents:()=>store.accountTransitions('g1'),
 async joinResume(){const context=await adapter.capture(account('A'));return adapter.run({context,writerId:'port.join.resume',operationId:'join-resume',invoke:async storage=>{await storage.setPendingConsume({transport:'port_join',accountCredential:account('B').accountCredential,accountDeviceId:'device-B'});const join=createPortAccountJoin({canSync:()=>true,client:{request:()=>{throw Error('no network');},summary:async()=>({account:{id:'B',recoveryVersion:2}})},accountRoot:{core:{},storage,AccountApiError:SoundCruiseSyncAccount.AccountApiError}});return join.resume();}});},
 async owner(){const context=await adapter.capture(account('A'));return adapter.run({context,writerId:'client.detachCurrentEnvironment',operationId:'owner',invoke:storage=>new SoundCruiseSyncAccount.AccountClient({endpoint:'https://fixture.invalid',admissionMode:'production',storage,core:{validAccountCredential:()=>true},fetchImpl:async()=>({ok:true,status:200,json:async()=>({ok:true})})}).detachCurrentEnvironment({accountCredential:account('A').accountCredential,operationId:'owner'})});}
};
