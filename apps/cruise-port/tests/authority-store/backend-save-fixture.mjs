import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from './pointer-fixture.mjs';
import {setupSaveAdmission} from './save-admission-fixture.mjs';
import {backendFixture} from '../../../../workers/sound-cruise-sync/test/account-save-transaction-fixture.js';
import {hashRecord} from '../../../../workers/sound-cruise-sync/src/records.js';
import {createIsolatedBackendSaveCoordinator,createIsolatedBackendSavePending} from '../../port-backend-save-isolated.mjs';
import {digest} from '../../port-idb-authority-contract.mjs';
import {setupProvider} from './account-provider-fixture.mjs';
import {createTestAuthorityScope} from './test-authority.mjs';
import {createIsolatedPortSaveAdmission} from '../../port-account-save-admission.mjs';
import {createIsolatedMetronomeBpmOwner} from '../../port-metronome-bpm-isolated.mjs';
import {handleIsolatedAccountOwnerContext} from '../../../../workers/sound-cruise-sync/src/account-owner-context.js';
const scripts=await Promise.all(['sync-account-db.js','sync-account-client.js'].map(f=>readFile(new URL('../../../shared/sync-account/'+f,import.meta.url),'utf8')));
export async function backendSaveFixture(t,{localCheckpoint,backendCheckpoint,coordinatorCheckpoint,wrapBackend,localOwner,timeoutMs=1000}={}){
 const indexedDB=new IDBFactory(),root={indexedDB,structuredClone,setTimeout,clearTimeout,Headers,AbortController,fetch(){throw Error('forbidden-network');}};
 for(const s of scripts)vm.runInNewContext(s,root);
 const x=await setupSaveAdmission({indexedDB,root:root.SoundCruiseSyncAccount,checkpoint:localCheckpoint}),f=await backendFixture({existing:x.server,clock:x.clock,checkpoint:backendCheckpoint,synchronousBatch:true});
 const pending=createIsolatedBackendSavePending({indexedDB,scopeName:x.scope.name});
 const backend={fixtureOnly:true,prepare:q=>f.owner.prepare(q,f.credentials),commit:h=>f.owner.commit(h),reconcile:b=>f.owner.reconcile(b,f.credentials)};
 const makeBackendRequest=async({operationId,bpm,expectedBackendRevision,localTicket})=>{
  const q=await f.request({id:operationId,bpm,revision:expectedBackendRevision});q.localGeneration=localTicket.generation;q.localRevision=digest(localTicket.body.base);
  q.operation.payload.value=JSON.parse(localTicket.body.changes['cruisePort.metronome']);q.operation.payloadHash=await hashRecord(q.operation,crypto,'port');return q;
 };
 const options={scope:x.scope,source:x.mutationStore,localOwner:localOwner?localOwner(x.owner):x.owner,pending,backend:wrapBackend?wrapBackend(backend):backend,makeBackendRequest,timeoutMs,checkpoint:coordinatorCheckpoint};
 const coordinator=createIsolatedBackendSaveCoordinator(options);t.after(()=>{coordinator.dispose();f.dispose();x.dispose();});
 async function secondTab(){
  const opts={indexedDB,name:x.scope.name,partitionId:'fixture-partition',now:()=>x.clock.wall,monotonicNow:()=>x.clock.mono,clockIdentity:()=>x.clock.origin};
  const tab=await setupProvider({indexedDB,root:root.SoundCruiseSyncAccount,scopeName:x.scope.name,seed:false,ownerContext:true,clockOptions:opts});
  tab.respond((url,o)=>handleIsolatedAccountOwnerContext(new Request(url,{headers:o.headers}),{db:x.server.db,pepper:x.server.pepper,now:()=>x.clock.server}));
  const scope=createTestAuthorityScope(opts),admission=createIsolatedPortSaveAdmission({scope,mutationStore:tab.mutationStore,owner:x.server.createOwner()}),owner=await createIsolatedMetronomeBpmOwner({scope,indexedDB,generation:'g1',provider:tab.provider,finalAdmission:admission});
  const c=createIsolatedBackendSaveCoordinator({...options,scope,source:tab.mutationStore,localOwner:owner});t.after(()=>{c.dispose();owner.dispose();admission.dispose();tab.dispose();});return c;
 }
 return {...x,indexedDB,f,pending,coordinator,options,secondTab,head:()=>x.store.hydrate('g1'),prepare:(bpm=149,revision=0,id=crypto.randomUUID())=>coordinator.prepare({operationId:id,bpm,expectedBackendRevision:revision})};
}
