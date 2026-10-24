import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {IDBFactory,IDBObjectStore,bpmHandle,dump} from './authority-store/pointer-fixture.mjs';
import {createTestAuthorityScope} from './authority-store/test-authority.mjs';
import {control,values} from './authority-store/fixture.mjs';
import {openIDBAuthorityStore} from '../port-indexeddb-authority-store.mjs';
import {createIsolatedPortAccountCoordinator,portAccountMutationBinding,readExistingPortAccount} from '../port-account-coordination.mjs';
import {createIsolatedAccountMutationStore,ACCOUNT_MUTATION_JOURNAL_KEY as JOURNAL,ACCOUNT_MUTATION_MARKER_KEY as MARKER} from '../../shared/sync-account/account-mutation-receipts.mjs';
const source=await readFile(new URL('../../shared/sync-account/sync-account-db.js',import.meta.url),'utf8');
const NAME='sound-cruise-port-authority-v1-fixture-mutation';
const account=id=>({accountId:id,accountDeviceId:'device-'+id,accountCredential:'credential-'+id,nested:{keep:'owner'}});
const identity=id=>({...control().identity,ownership:'bound-account',accountId:id,accountGeneration:7,membershipId:'member-'+id,membershipGeneration:11});
const summary=id=>({account:{id,state:'active',generation:7},memberships:[{appId:'port',id:'member-'+id,state:'active',generation:11}]});
const request=(id='switch')=>({generation:'g1',operationId:id,identity:identity('A'),expectedEpoch:1,expectedPointerEpoch:1,kind:'switch',destination:{accountId:'B',accountDeviceId:'device-B'}});
const binding=(id='switch')=>portAccountMutationBinding(request(id),NAME);
function shared(factory){const env={indexedDB:factory,structuredClone,setTimeout,clearTimeout};vm.runInNewContext(source,env);return env.SoundCruiseSyncAccount.storage;}
async function setup(t){const factory=new IDBFactory(),storage=shared(factory);await storage.setAccount(account('A'),factory);
 const scope=createTestAuthorityScope({indexedDB:factory,name:NAME,partitionId:'fixture-partition'}),store=await openIDBAuthorityStore(scope);
 assert((await store.initialize({generation:'g1',control:{...control(),identity:identity('A')},values:values(),operationId:'seed'})).ok);
 const mutation=createIsolatedAccountMutationStore({indexedDB:factory,scopeName:NAME});
 const coordinator=await createIsolatedPortAccountCoordinator({scope,indexedDB:factory,accountStorage:storage,locks:{request:(n,o,fn)=>fn()},mutationStore:mutation});
 t.after(()=>{coordinator.dispose();store.dispose();});return {factory,storage,scope,store,mutation,coordinator};}
async function meta(x,edit){const db=await new Promise((r,j)=>{const q=x.factory.open('sound-cruise-sync-account');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('meta',edit?'readwrite':'readonly'),s=tx.objectStore('meta'),a=s.get('account'),j=s.get(JOURNAL),m=s.get(MARKER);m.onsuccess=()=>{if(edit)edit(s,{account:a.result,journal:j.result,marker:m.result});};tx.oncomplete=()=>resolve({account:a.result,journal:j.result,marker:m.result});tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
const switchTo=(x,context,id='B',operationId='switch')=>x.coordinator.transition({context,operationId,nextAccount:account(id)});
async function observe(x){return x.coordinator.observe({generation:'g1',summary:summary('A')});}

test('pure import has no DOM/storage/audio/network side effects; normal boot remains disconnected',()=>{
 const url=new URL('../../shared/sync-account/account-mutation-receipts.mjs',import.meta.url).href;
 execFileSync(process.execPath,['--input-type=module','-e',`for(const name of ['indexedDB','localStorage','document','fetch','AudioContext'])Object.defineProperty(globalThis,name,{get(){throw Error(name)}});await import(${JSON.stringify(url)});`]);
 const f=createIsolatedAccountMutationStore;assert.throws(()=>f({indexedDB:new IDBFactory(),scopeName:'production'}),/isolation-required/);
});
test('inspection of absent DB creates no Account DB or receipt',async()=>{
 const factory=new IDBFactory(),s=createIsolatedAccountMutationStore({indexedDB:factory,scopeName:NAME});
 await assert.rejects(s.capture(),/storage-absent/);assert.deepEqual(await factory.databases(),[]);
});
test('CAS+receipt+marker become visible atomically and only after IDB transaction complete',async t=>{
 const x=await setup(t),context=await x.mutation.capture(),original=IDBObjectStore.prototype.put;let completed=false;
 IDBObjectStore.prototype.put=function(v,k){if(k===JOURNAL)this.transaction.addEventListener('complete',()=>completed=true);return original.call(this,v,k);};
 let result;try{result=await x.mutation.mutate({context,binding:binding(),nextAccount:account('B')});}finally{IDBObjectStore.prototype.put=original;}
 assert(completed);assert(result.ok);assert.equal(result.replayed,false);assert.equal(result.canWrite,false);
 const raw=await meta(x);assert.deepEqual(raw.account,account('B'));assert.equal(raw.journal.revision,1);assert.equal(raw.marker.revision,1);
 assert(!JSON.stringify(raw.journal).includes('credential-'));assert(!JSON.stringify(raw.journal).includes('accountCredential'));
 const proof=await x.mutation.reconcile(binding());assert(proof.mutationProven);assert(proof.currentObservation);assert.equal(proof.continuityProven,false);assert(proof.recoveryRequired);
});
for(const key of ['account',JOURNAL,MARKER])test('abort at '+key+' commits neither replacement nor receipt',async t=>{
 const x=await setup(t),context=await x.mutation.capture(),before=await meta(x),original=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(v,k){if(k===key){this.transaction.abort();throw Error('fixture');}return original.call(this,v,k);};
 try{await assert.rejects(x.mutation.mutate({context,binding:binding(),nextAccount:account('B')}),/transaction-aborted/);}finally{IDBObjectStore.prototype.put=original;}
 assert.deepEqual(await meta(x),before);assert.equal((await x.mutation.reconcile(binding())).reason,'account-mutation-receipt-missing');
});
test('duplicate is historical only, conflicting payload cannot retag and old A never rewrites B',async t=>{
 const x=await setup(t),context=await x.mutation.capture();await x.mutation.mutate({context,binding:binding(),nextAccount:account('B')});const before=await meta(x);
 const duplicate=await x.mutation.mutate({context,binding:binding(),nextAccount:account('B')});assert(duplicate.replayed);assert.equal(duplicate.operationAuthorized,false);
 await assert.rejects(x.mutation.mutate({context,binding:binding(),nextAccount:{...account('B'),nested:{changed:true}}}),/operation-conflict/);
 await assert.rejects(x.mutation.mutate({context,binding:binding('old-A'),nextAccount:account('B')}),/cas-conflict/);
 assert.deepEqual(await meta(x),before);
});
test('two real independent connections without Web Lock admit exactly one CAS/receipt',async t=>{
 const x=await setup(t),other=createIsolatedAccountMutationStore({indexedDB:x.factory,scopeName:NAME});
 const a=await x.mutation.capture(),b=await other.capture();const settled=await Promise.allSettled([
 x.mutation.mutate({context:a,binding:binding('one'),nextAccount:account('B')}),other.mutate({context:b,binding:binding('two'),nextAccount:account('B')})]);
 assert.equal(settled.filter(r=>r.status==='fulfilled').length,1);assert.equal(settled.filter(r=>r.status==='rejected').length,1);assert.equal((await meta(x)).journal.receipts.length,1);
});
test('full record mutation after capture and capture token forgery refuse without replacing fields',async t=>{
 const x=await setup(t),context=await x.mutation.capture();await x.storage.setAccount({...account('A'),nested:{changed:true}},x.factory);const before=await meta(x);
 await assert.rejects(x.mutation.mutate({context,binding:binding(),nextAccount:account('B')}),/cas-conflict/);
 await assert.rejects(x.mutation.mutate({context:{},binding:binding(),nextAccount:account('B')}),/context-invalid/);assert.deepEqual(await meta(x),before);
});
test('transient secrets, destination mismatch and forged/future binding reject before write',async t=>{
 const x=await setup(t),context=await x.mutation.capture(),before=await meta(x);
 for(const replacement of [{...account('B'),recoveryCode:'temporary'}, {...account('B'),x:'SAR1-ABCD-ABCD-ABCD-ABCD-ABCD'},account('C')])
 await assert.rejects(x.mutation.mutate({context,binding:binding(),nextAccount:replacement}));
 for(const patch of [{schemaVersion:2},{account:{...binding().account,membershipGeneration:0}},{authorityScope:NAME+'-other'},{secret:'x'}])
 await assert.rejects(x.mutation.mutate({context,binding:{...binding(),...patch},nextAccount:account('B')}));
 assert.deepEqual(await meta(x),before);
});
test('receipt missing/corruption, marker loss and mismatched server generation all fail closed',async t=>{
 const x=await setup(t),context=await x.mutation.capture();assert.equal((await x.mutation.reconcile(binding())).mutationProven,false);
 await x.mutation.mutate({context,binding:binding(),nextAccount:account('B')});const good=await meta(x);
 await assert.rejects(x.mutation.reconcile({...binding(),account:{...binding().account,accountGeneration:8}}),/binding-mismatch/);
 assert.equal((await x.mutation.reconcile({...binding(),authorityGeneration:'g2'})).mutationProven,false);
 for(const edit of [s=>s.delete(JOURNAL),s=>s.delete(MARKER),s=>s.put({...good.journal,schemaVersion:2},JOURNAL),s=>{const j=structuredClone(good.journal);j.receipts[0].afterDigest='0'.repeat(64);s.put(j,JOURNAL);}]){
  await meta(x,edit);await assert.rejects(x.mutation.reconcile(binding()));await assert.rejects(x.mutation.capture());
  await meta(x,s=>{s.put(good.journal,JOURNAL);s.put(good.marker,MARKER);});
 }
 assert.deepEqual((await meta(x)).account,account('B'));
});
test('superseded and noncooperating legacy ABA observations never become continuity or authorization',async t=>{
 const x=await setup(t);await x.mutation.mutate({context:await x.mutation.capture(),binding:binding(),nextAccount:account('B')});
 await x.storage.setAccount(account('C'),x.factory);assert.equal((await x.mutation.reconcile(binding())).currentObservation,false);await assert.rejects(x.mutation.capture(),/unattributed-state/);
 await x.storage.setAccount(account('A'),x.factory);await x.storage.setAccount(account('B'),x.factory);
 const proof=await x.mutation.reconcile(binding());assert(proof.currentObservation);assert.equal(proof.continuityProven,false);assert(proof.recoveryRequired);assert.equal(proof.canWrite,false);
});
test('coordinator live same-Account rotation has exact durable receipt but Authority never resumes',async t=>{
 const x=await setup(t),context=await observe(x),next={...account('A'),accountCredential:'rotated-credential'};
 const result=await x.coordinator.transition({context,operationId:'rotate',nextAccount:next});assert(result.ok);assert.equal(result.operationAuthorized,false);
 const raw=await meta(x);assert.equal(raw.account.accountCredential,'rotated-credential');assert.equal(raw.journal.receipts.length,1);
 assert.equal((await x.store.accountTransitions('g1')).intents[0].accountTransition.phase,'account-confirmed');
 assert.equal((await x.store.hydrate('g1')).snapshot.control.identityInvalidated,true);assert.equal(await observe(x),null);
});
test('CAS acknowledgment loss/reopen recovers history without changing stopped intent, tombstones or B',async t=>{
 const x=await setup(t);x.coordinator.dispose();const wrapped={...x.mutation,async mutate(q){await x.mutation.mutate(q);throw Error('lost-response');}};
 const liveScope=createTestAuthorityScope({indexedDB:x.factory,name:NAME,partitionId:'fixture-partition'});
 const co=await createIsolatedPortAccountCoordinator({scope:liveScope,indexedDB:x.factory,accountStorage:x.storage,locks:{request:(n,o,f)=>f()},mutationStore:wrapped});
 const token=await co.observe({generation:'g1',summary:summary('A')});assert.equal((await co.transition({context:token,operationId:'lost',nextAccount:account('B')})).ok,false);co.dispose();
 const before=await dump(x);const scope=createTestAuthorityScope({indexedDB:x.factory,name:NAME,partitionId:'fixture-partition'}),reopened=await createIsolatedPortAccountCoordinator({scope,indexedDB:x.factory,accountStorage:shared(x.factory),locks:{request:(n,o,f)=>f()},mutationStore:createIsolatedAccountMutationStore({indexedDB:x.factory,scopeName:NAME})});t.after(()=>reopened.dispose());
 const proof=await reopened.reconcileTransition({generation:'g1',operationId:'lost'});assert(proof.ok);assert(proof.mutationProven);assert.equal(proof.accountIntentPhase,'stopped');assert(proof.recoveryRequired);assert.equal(proof.canWrite,false);
 assert.deepEqual(await dump(x),before);assert.deepEqual(await readExistingPortAccount(x.factory),account('B'));assert.equal(await reopened.observe({generation:'g1',summary:summary('A')}),null);
});
test('stop accepted but CAS aborted has no success receipt and never retries during recovery',async t=>{
 const x=await setup(t),token=await observe(x),original=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(v,k){if(k===JOURNAL){this.transaction.abort();throw Error('abort');}return original.call(this,v,k);};
 try{assert.equal((await switchTo(x,token)).ok,false);}finally{IDBObjectStore.prototype.put=original;}
 const before=await meta(x);const proof=await x.coordinator.reconcileTransition({generation:'g1',operationId:'switch'});assert.equal(proof.mutationProven,false);assert(proof.recoveryRequired);assert.deepEqual(await meta(x),before);assert.equal((await x.store.hydrate('g1')).snapshot.control.identityInvalidated,true);
});
test('old A context cannot affect current Authority B or its prepared operation',async t=>{
 const x=await setup(t),token=await observe(x);await x.storage.setAccount(account('B'),x.factory);
 assert((await x.store.initialize({generation:'g2',control:{...control('g2'),identity:identity('B')},values:values(),operationId:'seed-B'})).ok);
 const prepared=bpmHandle(x.store,(await x.store.hydrate('g2')).snapshot,'prepared-B'),before=await dump(x);
 assert.equal((await switchTo(x,token)).reason,'account-context-stale');assert.deepEqual(await dump(x),before);assert.equal((await meta(x)).journal,undefined);assert((await x.store.commit(prepared)).ok);
});
test('detach and revoke receipts prove removal only, no credential or authorization appears',async t=>{
 for(const kind of ['detach','revoke']){const x=await setup(t),context=await x.mutation.capture(),q={...binding(kind),kind,destination:null};
 const result=await x.mutation.mutate({context,binding:q,nextAccount:null});assert(result.ok);assert.equal((await meta(x)).account,undefined);assert((await x.mutation.reconcile(q)).currentObservation);}
});
test('journal revision is bounded and append-only; no capacity-driven history deletion',async t=>{
 const x=await setup(t);let last;
 for(let n=0;n<64;n++){const id=n%2?'A':'B',from=n%2?'B':'A';const q={...binding('op-'+n),account:{...binding().account,accountId:from},destination:{accountId:id,accountDeviceId:'device-'+id}};
 last=await x.mutation.mutate({context:await x.mutation.capture(),binding:q,nextAccount:account(id)});}
 const before=await meta(x);assert.equal(before.journal.revision,64);assert.equal(last.receipt.afterRevision,64);
 await assert.rejects(x.mutation.mutate({context:await x.mutation.capture(),binding:binding('over'),nextAccount:account('B')}),/capacity/);assert.deepEqual(await meta(x),before);
});

test('sparse arrays/extra array properties cannot collide with dense full-record CAS',async t=>{
 const x=await setup(t),context=await x.mutation.capture(),before=await meta(x);
 for(const a of [Array(1),Object.assign([],{extra:'must-not-be-ignored'})])
 await assert.rejects(x.mutation.mutate({context,binding:binding(),nextAccount:{...account('B'),data:a}}),/value-invalid/);
 await x.storage.setAccount({...account('A'),data:[]},x.factory);const capture=await x.mutation.capture();
 await x.storage.setAccount({...account('A'),data:Array(1)},x.factory);
 await assert.rejects(x.mutation.mutate({context:capture,binding:binding(),nextAccount:account('B')}),/value-invalid/);
 assert.equal((await meta(x)).journal,undefined);assert.equal((await readExistingPortAccount(x.factory)).data.length,1);
});
