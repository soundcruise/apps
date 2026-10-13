import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createTestAuthorityScope} from './test-authority.mjs';
import {openIDBAuthorityStore,claimPortAuthorityIssuer} from '../../port-indexeddb-authority-store.mjs';
import {values,control} from './fixture.mjs';
import {STORE_KEYS} from '../../port-idb-authority-contract.mjs';
export const {IDBFactory,IDBObjectStore}=createRequire(new URL('./package.json',import.meta.url))('fake-indexeddb');
export async function fixture(t,{seed=true}={}) {
 const factory=new IDBFactory(),scope=createTestAuthorityScope({indexedDB:factory,partitionId:'fixture-partition'}),store=await openIDBAuthorityStore(scope);
 t?.after(()=>store.dispose());const x={factory,scope,store,issuer:claimPortAuthorityIssuer(scope)};
 if(seed)assert((await store.initialize({generation:'g1',control:control(),values:values(),operationId:'seed'})).ok);
 return x;
}
export async function raw(x,stores,build,mode='readwrite') {
 const db=await new Promise((ok,no)=>{const r=x.factory.open(x.scope.name);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
 try{return await new Promise((ok,no)=>{const tx=db.transaction(stores,mode);let result;tx.oncomplete=()=>ok(result);tx.onabort=()=>no(tx.error);build(tx,value=>result=value);});}finally{db.close();}
}
export const dump=x=>raw(x,Object.keys(STORE_KEYS),(tx,done)=>{const out={};let n=Object.keys(STORE_KEYS).length;for(const name of Object.keys(STORE_KEYS)){const r=tx.objectStore(name).getAll();r.onsuccess=()=>{out[name]=r.result;if(!--n)done(out);};}},'readonly');
export const patchPointer=(x,fn)=>raw(x,['pointer'],tx=>{const s=tx.objectStore('pointer'),r=s.get('active');r.onsuccess=()=>s.put(fn(r.result));});
export async function stage(x,{generation='g2',migrationId='m-g2',operationId='pub-g2',expectedPointerEpoch=1}={}) {
 const c={...control(generation),state:'prepared'};
 assert((await x.store.initialize({generation,control:c,values:values(),operationId:'stage-'+generation})).ok);
 assert((await x.store.writeJournal({schemaVersion:1,migrationId,generation,revision:1,state:'prepared',identity:c.identity})).ok);
 const capability=x.issuer.issue('migration-publication',{generation}),seal=await x.store.seal({generation,migrationId,capability});assert(seal.ok,seal.reason);
 const attestation=x.issuer.attestFixtureEvidence({generation,migrationId,sealHash:seal.sealHash,binary:{manifestDigest:'a'.repeat(64),assetCount:0},sync:{checkpointDigest:'b'.repeat(64),outboxPending:0}});
 return {generation,migrationId,operationId,expectedPointerEpoch,expectedControlEpoch:seal.controlEpoch,capability,attestation};
}
export const bpmHandle=(store,snapshot,id='bpm')=>store.prepare({base:snapshot,operationId:id,action:'saveBpm',changes:{'cruisePort.metronome':JSON.stringify({...JSON.parse(snapshot.values['cruisePort.metronome']),bpm:145})}});
