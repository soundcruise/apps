import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {IDBFactory,IDBObjectStore,bpmHandle} from './authority-store/pointer-fixture.mjs';
import {setupProvider,account,summary,devices,identity} from './authority-store/account-provider-fixture.mjs';
import {projectOfficialAccountObservation,createAccountObservationConsumer,createIsolatedPortAccountProvider} from '../port-account-provider.mjs';
import {describeProviderObservation} from '../../cruise-studio/js/port-data/account-provider-projection.mjs';
import {createIsolatedIDBAuthorityScope} from '../port-indexeddb-authority-store.mjs';
import {portAccountMutationBinding} from '../port-account-coordination.mjs';
import {control,values} from './authority-store/fixture.mjs';
const sources=await Promise.all(['sync-account-db.js','sync-account-client.js'].map(f=>readFile(new URL('../../shared/sync-account/'+f,import.meta.url),'utf8')));
function classic(indexedDB){const env={indexedDB,structuredClone,setTimeout,clearTimeout,Headers,AbortController,fetch:()=>{throw Error('production-network-forbidden');}};for(const s of sources)vm.runInNewContext(s,env);return env.SoundCruiseSyncAccount;}
async function setup(t){const indexedDB=new IDBFactory(),root=classic(indexedDB),x=await setupProvider({indexedDB,root});t.after(()=>x.dispose());return {...x,indexedDB,root};}
const refresh=x=>x.provider.refresh({generation:'g1',operationId:'observe-'+x.requests.length});
const denied={ok:false,status:401,json:async()=>({ok:false,code:'account_device_revoked'})};
const ok=(id='A')=>({ok:true,status:200,json:async()=>summary(id)});
const binding=(from,to,op)=>portAccountMutationBinding({generation:'g1',operationId:op,identity:identity(from),expectedEpoch:1,expectedPointerEpoch:1,kind:'switch',destination:{accountId:to,accountDeviceId:'device-'+to}},'sound-cruise-port-authority-v1-fixture-provider');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}

test('official shape exposes Account and device observations, never invents Port membership or TTL',()=>{
 const r=projectOfficialAccountObservation(account('A'),summary('A'),devices('A'));
 assert.equal(r.serverAccountGeneration,7);assert.equal(r.credentialVersion,3);assert.equal(r.portMembership,null);assert.equal(r.expiresAt,null);
 assert(!JSON.stringify(r).includes('synthetic-'));assert(Object.isFrozen(r.memberships));
});
for(const [name,change] of [
 ['missing-server-generation',s=>delete s.account.generation],['wrong-account',s=>s.account.id='B'],['inactive',s=>s.account.state='deleting'],
 ['fake-port-member',s=>s.memberships.push({appId:'port',id:'p',state:'active',generation:1})],['duplicate-member',s=>s.memberships.push({...s.memberships[0]})]
])test('unresolved official summary: '+name,()=>{const s=summary('A');change(s);assert.equal(projectOfficialAccountObservation(account('A'),s,devices('A')),null);});
for(const [name,change] of [['no-current',d=>d.devices=[]],['two-current',d=>d.devices.push({...d.devices[0]})],['wrong-device',d=>d.devices[0].id='other'],['revoked',d=>d.devices[0].revokedAt=123],['missing-version',d=>delete d.devices[0].credentialVersion]])
 test('unresolved device: '+name,()=>{const d=devices('A');change(d);assert.equal(projectOfficialAccountObservation(account('A'),summary('A'),d),null);});
test('actual owner AccountClient GETs only; readonly consumer has no mutation surface; Account/Authority unchanged',async t=>{
 const x=await setup(t),before=await x.rows(),authority=await x.store.hydrate('g1'),consumer=createAccountObservationConsumer(x.provider);
 assert.deepEqual(Object.keys(consumer),['getCachedStatus','refresh','subscribe']);assert.equal(x.requests.length,0);
 const r=await refresh(x);assert.equal(r.status,'observed');assert.equal(r.localNotificationGeneration,x.root.storage.getGeneration());assert.equal(r.serverAccountGeneration,7);
 assert.equal(r.canWrite,false);assert.equal(r.operationAuthorized,false);assert.equal(r.recoveryRequired,true);assert.equal(r.continuityProven,false);
 assert.equal(x.requests.length,2);assert.deepEqual(await x.rows(),before);assert.deepEqual(await x.store.hydrate('g1'),authority);
 assert.equal(describeProviderObservation(r).credentialFreshness,'unconfirmed');assert.equal(describeProviderObservation(r).canWrite,false);
 assert(!JSON.stringify(r).includes('synthetic-'));
});
test('missing notification and full-record change with same accountKey reject delayed success',async t=>{
 const x=await setup(t),gate=deferred();x.respond(()=>gate.promise);const p=refresh(x);while(x.requests.length===0)await new Promise(r=>setImmediate(r));
 await x.rows(s=>s.put({...account('A'),extra:{keep:false}},'account'));gate.resolve(ok());assert.notEqual((await p).status,'observed');
 assert.notEqual(x.provider.getCachedStatus().status,'observed');
});
test('delayed A terminal cannot stop or erase a separately advanced B; source revision is re-read',async t=>{
 const x=await setup(t),gate=deferred();x.respond(()=>gate.promise);const p=refresh(x);while(x.requests.length===0)await new Promise(r=>setImmediate(r));
 await x.rows(s=>s.put(account('B'),'account'));const before=await x.rows(),authority=await x.store.hydrate('g1');gate.resolve(denied);
 assert.equal((await p).status,'stale');assert.deepEqual(await x.rows(),before);assert.deepEqual(await x.store.hydrate('g1'),authority);
});
test('terminal A stops durably, does not mutate Account; reopen cannot adopt later success',async t=>{
 const x=await setup(t),before=await x.rows();x.respond(async()=>denied);assert.equal((await refresh(x)).status,'denied');
 assert.deepEqual(await x.rows(),before);assert.equal((await x.store.hydrate('g1')).snapshot.control.identityInvalidated,true);
 x.provider.dispose();const reopened=await setupProvider({indexedDB:x.indexedDB,root:classic(x.indexedDB),seed:false});t.after(()=>reopened.dispose());
 const count=reopened.requests.length,r=await refresh(reopened);assert.equal(r.status,'unconfirmed');assert.equal(reopened.requests.length,count);assert.equal(r.canWrite,false);
});
test('cooperative revision ABA rejects earlier A observation even with identical Account bytes',async t=>{
 const x=await setup(t),gate=deferred();x.respond(()=>gate.promise);const p=refresh(x);while(!x.requests.length)await new Promise(r=>setImmediate(r));
 await x.mutationStore.mutate({context:await x.mutationStore.capture(),binding:binding('A','B','aba-one'),nextAccount:account('B')});
 await x.mutationStore.mutate({context:await x.mutationStore.capture(),binding:binding('B','A','aba-two'),nextAccount:account('A')});
 gate.resolve(ok());assert.notEqual((await p).status,'observed');
});
test('old A denial cannot retire current B generation or break its receipt and prepared operation',async t=>{
 const x=await setup(t),gate=deferred();x.respond(()=>gate.promise);const old=refresh(x);while(!x.requests.length)await new Promise(r=>setImmediate(r));
 const q=binding('A','B','new-B');await x.mutationStore.mutate({context:await x.mutationStore.capture(),binding:q,nextAccount:account('B')});
 assert((await x.store.initialize({generation:'g2',control:{...control('g2'),identity:identity('B')},values:values(),operationId:'seed-B'})).ok);
 const b=await x.store.hydrate('g2'),prepared=bpmHandle(x.store,b.snapshot,'B-prepared'),before=await x.rows();
 gate.resolve(denied);assert.equal((await old).status,'stale');assert.deepEqual(await x.rows(),before);
 assert.deepEqual(await x.store.hydrate('g2'),b);assert.equal((await x.mutationStore.reconcile(q)).mutationProven,true);
 assert.equal((await x.store.commit(prepared)).ok,true);
 x.respond(async url=>({ok:true,status:200,json:async()=>url.endsWith('/summary')?summary('B'):devices('B')}));
 const r=await x.provider.refresh({generation:'g2',operationId:'B-read'});
 assert.equal(r.status,'observed');assert.equal(r.accountId,'B');assert.equal(r.canWrite,false);
});
test('malformed collection never calls a non-array filter',()=>{
 assert.equal(projectOfficialAccountObservation(account('A'),summary('A'),{ok:true,devices:{filter:1}}),null);
});
test('B publication in the final read/stop gap is fenced by the Authority transaction itself',async t=>{
 const x=await setup(t);let checks=0;x.respond(async()=>denied);
 x.onCurrent(async()=>{if(x.requests.length===1&&++checks===2){
  await x.mutationStore.mutate({context:await x.mutationStore.capture(),binding:binding('A','B','final-gap-B'),nextAccount:account('B')});
  assert((await x.store.initialize({generation:'g2',control:{...control('g2'),identity:identity('B')},values:values(),operationId:'gap-B'})).ok);
 }});
 assert.equal((await refresh(x)).status,'stale');assert.equal(checks>=2,true);
 assert.equal((await x.store.hydrate('g2')).snapshot.control.identityInvalidated,false);
 assert.equal((await x.store.hydrate('g1')).snapshot.control.identityInvalidated,false);
 assert.equal(new Map(await x.rows()).get('account').accountId,'B');
});
test('overlapping older terminal denial wins over newer success for the same source',async t=>{
 const x=await setup(t),gate=deferred();let n=0;x.respond(async(url)=>++n===1?gate.promise:{ok:true,status:200,json:async()=>url.endsWith('/summary')?summary('A'):devices('A')});
 const old=refresh(x);while(x.requests.length===0)await new Promise(r=>setImmediate(r));assert.equal((await refresh(x)).status,'observed');
 gate.resolve(denied);assert.equal((await old).status,'denied');assert.equal(x.provider.getCachedStatus().status,'denied');assert.equal((await refresh(x)).status,'unconfirmed');
});
test('newer pending success cannot revive a terminally stopped source',async t=>{
 const x=await setup(t),first=deferred(),second=deferred();let n=0;x.respond(()=>++n===1?first.promise:second.promise);
 const a=refresh(x);while(x.requests.length<1)await new Promise(r=>setImmediate(r));const b=refresh(x);while(x.requests.length<2)await new Promise(r=>setImmediate(r));
 first.resolve(denied);assert.equal((await a).status,'denied');second.resolve(ok());assert.equal((await b).status,'stale');assert.equal(x.provider.getCachedStatus().status,'denied');
});
test('missing response times out and never authorizes',async t=>{const x=await setup(t);x.respond(()=>new Promise(()=>{}));const r=await refresh(x);assert.equal(r.status,'unconfirmed');assert.equal(r.canWrite,false);});
test('unavailable/malformed receipt marker fails closed before querying',async t=>{const x=await setup(t);await x.rows(s=>s.put({schemaVersion:1,revision:1,headChecksum:'0'.repeat(64)},'accountMutationMarker:v1'));assert.equal((await refresh(x)).status,'unconfirmed');assert.equal(x.requests.length,0);});
test('stop transaction abort never certifies stop or changes Account',async t=>{
 const x=await setup(t),before=await x.rows(),put=IDBObjectStore.prototype.put;x.respond(async()=>denied);
 IDBObjectStore.prototype.put=function(v,...args){if(this.name==='control'&&v.identityInvalidated){this.transaction.abort();throw Error('fixture-stop-abort');}return put.call(this,v,...args);};
 try {const r=await refresh(x);assert.equal(r.status,'recovery-required');assert.equal(r.stopProven,false);}finally{IDBObjectStore.prototype.put=put;}
 assert.deepEqual(await x.rows(),before);
});
test('disposed provider cannot publish a late success, and projection cannot grant rights',async t=>{
 const x=await setup(t),gate=deferred();x.respond(()=>gate.promise);const p=refresh(x);while(!x.requests.length)await new Promise(r=>setImmediate(r));x.provider.dispose();gate.resolve(ok());assert.equal((await p).status,'disposed');
 assert.equal(describeProviderObservation({status:'observed',serverAccountGeneration:7,canWrite:true}).serverAccountGeneration,null);
});
test('ordinary unbranded scope cannot install provider',async()=>{
 const scope=createIsolatedIDBAuthorityScope({indexedDB:new IDBFactory(),name:'sound-cruise-port-authority-v1-fixture-plain',partitionId:'fixture-partition'});
 await assert.rejects(createIsolatedPortAccountProvider({scope}),/isolation-required/);
});
