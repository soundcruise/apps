import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {IDBFactory,bpmHandle} from './authority-store/pointer-fixture.mjs';
import {setupProvider,identity} from './authority-store/account-provider-fixture.mjs';
import {createIsolatedAccountObservationReader as createReader} from '../../shared/sync-account/account-observation-consumer.mjs';
import {createSyncCenterController} from '../sync-center-controller.js';
import {createPortDataHost} from '../../cruise-studio/js/port-data/host.mjs';
import {seedAccountOwnerContext} from '../../../workers/sound-cruise-sync/test/account-owner-context-fixture.js';
import {handleIsolatedAccountOwnerContext} from '../../../workers/sound-cruise-sync/src/account-owner-context.js';
import {portAccountMutationBinding} from '../port-account-coordination.mjs';
import {control,values} from './authority-store/fixture.mjs';
import {accountCredentialVerifier,createAccountCredential} from '../../../workers/sound-cruise-sync/src/account-crypto.js';
const schema=createRequire(import.meta.url)('../../cruise-studio/js/modules/metronome/settings-schema.js');
const scripts=await Promise.all(['sync-account-db.js','sync-account-client.js'].map(f=>readFile(new URL('../../shared/sync-account/'+f,import.meta.url),'utf8')));
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
const tick=()=>new Promise(r=>setImmediate(r));
const noLegacy=new Proxy({}, {get(){throw Error('legacy-consumer-access-forbidden');}});
function classic(indexedDB){const g={indexedDB,structuredClone,setTimeout,clearTimeout,Headers,AbortController,fetch:()=>{throw Error('network forbidden');}};for(const s of scripts)vm.runInNewContext(s,g);return g.SoundCruiseSyncAccount;}
async function setup(t,{ownerContext=true}={}){
 const owner=await seedAccountOwnerContext(),indexedDB=new IDBFactory(),root=classic(indexedDB),clock={wall:1000,mono:0,origin:'consumer-fixture'},options={indexedDB,root,record:owner.account,ownerContext,clockOptions:{now:()=>clock.wall,monotonicNow:()=>clock.mono,clockIdentity:()=>clock.origin}};
 const x=await setupProvider(options);let generation='g1';
 const ownerResponse=(u,o)=>handleIsolatedAccountOwnerContext(new Request(u,o),{db:owner.db,pepper:owner.pepper,now:()=>100000});if(ownerContext)x.respond(ownerResponse);
 const reader=createReader({provider:x.provider,generation:()=>generation});
 const controller=createSyncCenterController({config:{enabled:true},isolatedAccountConsumer:reader,accountRoot:noLegacy,readPortCredential(){throw Error('legacy-port-read-forbidden');}});
 const source={generation:()=>0,account:()=>{throw Error('legacy-account-read');},localStatus:()=>{throw Error('legacy-sync-read');},dataset:async()=>({revision:'local1',state:'available',metronome:null,presets:[]}),pro:async()=>'standard',identity:()=>null,detachConsumer(){},dispose(){}};
 const host=createPortDataHost({connect:async()=>source,schema,isolatedAccountConsumer:reader});
 t.after(()=>{host.dispose();reader.dispose();x.dispose();owner.db.close();});
 return {...x,owner,indexedDB,root,clock,options,reader,controller,source,host,ownerResponse,generation:v=>generation=v};
}
test('actual Port controller and Studio Host read owner evidence with zero legacy/writer calls',async t=>{
 const x=await setup(t),before=await x.rows(),authority=await x.store.hydrate('g1');
 const p=await x.controller.load();assert.equal(p.kind,'observed-readonly');assert.equal(p.accountState,'unknown');assert.equal(p.canSync,false);assert.deepEqual(p.apps,[]);assert.deepEqual(p.environments,[]);assert.deepEqual(x.controller.planFourAppSetup(p),{kind:'unavailable',appIds:[]});
 const s=await x.host.readLocalStatus();assert.equal(s.account,'owner-observed-readonly');assert.equal(s.sync,'unknown');assert.equal(s.pro,'standard');assert.equal(s.canWrite,false);assert.equal(s.accountObservation.membershipGeneration,11);assert.equal(s.accountObservation.serverAccountGeneration,7);assert.equal(s.accountObservation.credentialVersion,3);assert.equal(s.accountObservation.credentialExpiresAt,null);assert.equal(s.dataset.revision,'local1');
 assert(!JSON.stringify([s,p]).includes(x.owner.account.accountCredential));assert.deepEqual(await x.rows(),before);assert.deepEqual(await x.store.hydrate('g1'),authority);
 for(const k of ['save','mutate','resume','ensure','provision','sync','send','clearAccount','AccountClient'])assert.equal(k in x.reader,false);
 assert.equal((await x.host.enableLocalWrites({userIntent:true})).allowed,false);assert.equal((await x.host.activateSync({userIntent:true})).allowed,false);
});
test('unqualified summary-only provider cannot migrate readonly consumers',async t=>{const x=await setup(t,{ownerContext:false});assert.equal((await x.controller.load()).kind,'unknown');assert.equal((await x.host.readLocalStatus()).account,'unknown');assert.equal(x.reader.peek().canWrite,false);});
test('unbranded injection refuses rather than falling back to legacy consumers',()=>{assert.throws(()=>createSyncCenterController({isolatedAccountConsumer:{}}),/reader-required/);assert.throws(()=>createPortDataHost({isolatedAccountConsumer:{}}),/reader-required/);});
test('cached controller/Host observation expires without timer; rollback cannot resurrect it',async t=>{const x=await setup(t);await x.controller.load();await x.host.readLocalStatus();const old=x.reader.peek();x.clock.mono=5000;assert.equal(x.controller.getCachedPresentation().kind,'unknown');assert.equal(x.host.getCachedStatus().account,'unknown');assert.equal(await x.reader.current(old),false);x.clock.wall=500;x.clock.mono=0;assert.equal(x.host.getCachedStatus().accountId,null);assert.equal(x.controller.getCachedPresentation().kind,'unknown');});
for(const [label,change] of [['missing membership',v=>delete v.identity.membershipGeneration],['future contract',v=>v.contractVersion=9],['nonce mismatch',v=>v.challenge=crypto.randomUUID()],['unknown credential expiry',v=>v.credentialExpiresAt=200000]])
 test('consumer refuses '+label+' without legacy fallback',async t=>{const x=await setup(t);x.respond(async(u,o)=>{const r=await x.ownerResponse(u,o),v=await r.json();change(v);return {ok:true,status:200,json:async()=>v};});assert.equal((await x.controller.load()).kind,'unknown');assert.equal((await x.host.readLocalStatus()).account,'unknown');});
test('owner generation change preserves canonical bytes and Authority; no implicit generation adoption',async t=>{const x=await setup(t),a=await x.store.hydrate('g1'),before=await x.rows();x.owner.db.raw.exec('UPDATE sync_account_memberships SET generation=12');assert.equal((await x.controller.load()).kind,'unknown');assert.deepEqual(await x.rows(),before);assert.deepEqual(await x.store.hydrate('g1'),a);});
test('notification loss during Host dataset work revalidates exact durable source before publication',async t=>{
 const x=await setup(t),hold=deferred();x.source.dataset=()=>hold.promise;const pending=x.host.readLocalStatus();while(!x.requests.length)await tick();while(x.reader.peek().status!=='observed-readonly')await tick();
 await x.rows(s=>s.put({...x.owner.account,extra:{changedWithoutNotice:true}},'account'));hold.resolve({revision:'kept-local',state:'available',metronome:null,presets:[]});const r=await pending;assert.equal(r.account,'unknown');assert.equal(r.accountId,null);assert.equal(r.dataset.revision,'kept-local');assert.equal(r.canWrite,false);
});
test('expired result while Host awaits dataset cannot publish membership or current qualification',async t=>{const x=await setup(t),hold=deferred();x.source.dataset=()=>hold.promise;const pending=x.host.readLocalStatus();while(x.reader.peek().status!=='observed-readonly')await tick();x.clock.mono=6000;hold.resolve({revision:'late',state:'available',metronome:null,presets:[]});assert.equal((await pending).account,'unknown');});
test('terminal consumer read persists existing stop intent only, no Account clear; reopen stays blocked',async t=>{
 const x=await setup(t),before=await x.rows();x.owner.db.raw.exec('UPDATE sync_account_devices SET revoked_at=2');assert.equal((await x.controller.load()).kind,'unknown');assert.equal(x.provider.getCachedStatus().status,'denied');assert.deepEqual(await x.rows(),before);x.provider.dispose();
 const other=await setupProvider({...x.options,root:classic(x.indexedDB),seed:false});t.after(()=>other.dispose());other.respond(x.ownerResponse);const reader=createReader({provider:other.provider,generation:()=> 'g1'});t.after(()=>reader.dispose());assert.equal((await reader.read()).status,'unconfirmed');assert.equal(other.requests.length,0);
});
for(const terminal of [false,true])test('normal B receipt/prepared survives delayed A '+(terminal?'terminal':'success')+' through actual consumers',async t=>{
 const x=await setup(t),hold=deferred(),seen=deferred();x.respond(async(u,o)=>{const r=terminal?null:await x.ownerResponse(u,o);seen.resolve();await hold.promise;return terminal?{ok:false,status:401,json:async()=>({code:'account_device_revoked'})}:r;});const pending=x.controller.load();await seen.promise;
 const old=x.owner.account,token='sca1.'+old.accountDeviceId+'.'+createAccountCredential().credential.split('.')[2],b={...old,accountCredential:token};x.owner.db.raw.prepare('UPDATE sync_account_devices SET credential_version=4,credential_verifier=?').run(await accountCredentialVerifier(token,x.owner.pepper));
 const binding=portAccountMutationBinding({generation:'g1',operationId:'B-rotation',identity:identity('A'),expectedEpoch:1,expectedPointerEpoch:1,kind:'switch',destination:{accountId:'A',accountDeviceId:b.accountDeviceId}},'sound-cruise-port-authority-v1-fixture-provider');assert((await x.mutationStore.mutate({context:await x.mutationStore.capture(),binding,nextAccount:b})).ok);
 assert((await x.store.initialize({generation:'g2',control:{...control('g2'),identity:identity('A')},values:values(),operationId:'new-B'})).ok);x.generation('g2');const authority=await x.store.hydrate('g2'),prepared=bpmHandle(x.store,authority.snapshot,'B-prepared'),before=await x.rows();
 hold.resolve();assert.equal((await pending).kind,'unknown');assert.deepEqual(await x.rows(),before);assert.deepEqual(await x.store.hydrate('g2'),authority);assert.equal((await x.mutationStore.reconcile(binding)).mutationProven,true);assert.equal((await x.store.commit(prepared)).ok,true);
 x.respond(x.ownerResponse);const r=await x.host.readLocalStatus();assert.equal(r.account,'owner-observed-readonly');assert.equal(r.accountObservation.credentialVersion,4);
});
test('reader overlapping refresh and double response cannot overwrite newest view',async t=>{const x=await setup(t),hold=deferred(),seen=deferred();let calls=0;x.respond(async(u,o)=>{const r=await x.ownerResponse(u,o);if(++calls===1){seen.resolve();await hold.promise;}return r;});const a=x.reader.read();await seen.promise;const b=await x.reader.read();assert.equal(b.status,'observed-readonly');hold.resolve();assert.equal((await a).status,'unconfirmed');assert.equal(x.reader.peek(),b);assert.equal(await x.reader.current(b),true);});
test('dispose during pending read exposes no observed state and does not dispose owner',async t=>{const x=await setup(t),hold=deferred(),seen=deferred();x.respond(async(u,o)=>{const r=await x.ownerResponse(u,o);seen.resolve();await hold.promise;return r;});const p=x.reader.read();await seen.promise;x.reader.dispose();hold.resolve();assert.equal((await p).status,'unconfirmed');assert.equal(x.provider.getCachedStatus().status,'observed');});
