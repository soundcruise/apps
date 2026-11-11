import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source = fs.readFileSync(new URL('./port-sync-controller.js', import.meta.url), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => {resolve = r;}); return {promise,resolve}; };
function harness({canSync = () => true, readerFirst = false} = {}) {
  let account = {accountId:'A',accountCredential:'sca1.A.secret'}, generation = 0;
  const listeners = new Set(), databases = new Map(), events=[], network=[], runtimes=[], deviceReads=[];
  const window = new EventTarget(), document = new EventTarget(); document.visibilityState='visible';
  const intervals = new Set(), policyListeners = new Set(); let dbReads=0, provisionGate=null, bootstrapGate=null, failFirst=false, localRecords=[], deviceRefused=false, intents={};
  function createStore(appId, options={}) {
    const id=options.accountId || 'legacy'; if(!databases.has(id)) databases.set(id,{meta:new Map(),outbox:[],shadow:[],conflicts:[]});
    const data=databases.get(id);
    const check = () => {options.assertCurrent?.();if(options.signal?.aborted)throw Error('runtime_disposed');};
    return {accountId:options.accountId, data,
      async readMeta(key){check();dbReads++;return data.meta.get(key)??null;},
      async setMeta(key,value){check();data.meta.set(key,structuredClone(value));},
      async removeMeta(key){check();data.meta.delete(key);},
      async listOutbox(){check();dbReads++;return data.outbox;},async listShadow(){check();dbReads++;return data.shadow;},async listConflicts(){check();dbReads++;return data.conflicts;},
      async putOutbox(op){check();data.outbox.push(op);},async putShadow(key,record){check();data.shadow.push(record);},async putConflict(conflict){check();data.conflicts.push(conflict);},
      async clearCloudState(){check();data.meta.clear();data.outbox=[];data.shadow=[];data.conflicts=[];}
    };
  }
  class Client {
    constructor(options){Object.assign(this,options);}
    async provisionPortDevice(value){network.push(value); if(provisionGate) await provisionGate.promise;if(failFirst){failFirst=false;throw Error('network_error');}return {membershipId:'membership-'+value.accountCredential.split('.')[1]};}
    async devices(){deviceReads.push(true);if(deviceRefused)throw Object.assign(Error('account_device_revoked'),{code:'account_device_revoked'});return {devices:[{portAppDeviceIds:['port'],revokedAt:null}]};}
  }
  class Runtime extends EventTarget {
    constructor(options){super();Object.assign(this,options);this.initialized=0;this.synced=0;this.disposed=false;runtimes.push(this);}
    async initializeDataset(){this.assertCurrent();this.initialized++;if(bootstrapGate)await bootstrapGate.promise;this.assertCurrent();await this.store.setMeta('migrationState','complete');return {ok:true};}
    async sync(){this.assertCurrent();this.synced++;return {ok:true};}
    runExclusive(work){return work(this);}
    listConflictPresentations(){return [];}
    async resolveConflict(){return {ok:true};}
    async retryLegacyFailures(){return {ok:true};}
    dispose(){this.disposed=true;}
  }
  const context={EventTarget,CustomEvent,AbortController,structuredClone,Date,
    addEventListener(type,fn){policyListeners.add(fn);window.addEventListener(type,fn);},removeEventListener(type,fn){policyListeners.delete(fn);window.removeEventListener(type,fn);},dispatchEvent:e=>events.push(e),document,
    navigator:{onLine:true,locks:{request:async (_name,_options,work)=>work()}},setInterval(fn){intervals.add(fn);return fn;},clearInterval:id=>intervals.delete(id),
    SoundCruisePortSync:{PortSyncAdapter:class {constructor(){this.changed=false;this.storage={getItem:k=>k==='cruisePort.syncDeletionIntent.v1'?JSON.stringify(intents):null};}readLocalSnapshot(){return localRecords;}normalizeLocalSnapshot(x){return x;}async serializeRecords(x){return x;}primeRemoteReferences(records){this.primed=records;}reconcileRemoteReferences(records){return records.length>0;}consumeRemoteApplyChanged(){const value=this.changed;this.changed=false;return value;}}},
    SoundCruiseSyncAccount:{AccountClient:Client,storage:{getAccount:async()=>account,getGeneration:()=>generation,subscribeAccount:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);},getQaAdmission:async()=>null},
      core:{validAccountCredential:x=>x?.startsWith('sca1.'),validAppCredential:x=>x?.startsWith('scd1.'),createAppCredential:()=>({appDeviceCredential:'scd1.port.secret'}),createOperationId:()=> 'stable-id'}},
    SoundCruiseMultiAppSync:{dataStorage:{createStore},MultiAppSyncRuntime:Runtime}};
  vm.runInNewContext(source,context);
  const config={enabled:true,environment:'production',endpoint:'https://sync.example'};
  const create=(readOnly=false)=>context.SoundCruisePortSync.createPortSyncController({config,canSync,readOnly}); const controller=create(readerFirst);
  return {controller,create,acquire: options => context.SoundCruisePortSync.createPortSyncController({config,canSync,...options}), config, databases,network,runtimes,events,context,intervals,listeners,policyListeners,deviceReads,window,setIntents:value=>intents=value,getIntents:()=>structuredClone(intents),setLocal:rows=>localRecords=rows,refuseDevice:()=>deviceRefused=true,get dbReads(){return dbReads;},
    gateProvision(){return provisionGate=deferred();},gateBootstrap(){return bootstrapGate=deferred();},failProvision(){failFirst=true;},
    changeAccount(id){generation++;account={accountId:id,accountCredential:'sca1.'+id+'.secret'};for(const fn of listeners)fn();},createStore};
}

test('strict cached status and subscriptions neither open DB nor create runtime/network',async()=>{
  const h=harness();let count=0;const stop=h.controller.subscribe(()=>count++);
  for(let i=0;i<50;i++)assert.equal(h.controller.getCachedStatus().state,'unknown');
  assert.equal(h.dbReads,0);assert.equal(h.databases.size,0);assert.equal(h.runtimes.length,0);assert.equal(h.network.length,0);assert.equal(count,0);assert.equal(h.intervals.size,0);
  stop();assert.equal((await h.controller.readLocalStatus()).credentialState,'unknown');assert.equal(h.runtimes.length,0);assert.equal(h.network.length,0);
});
test('explicit ensure coalesces and shares one runtime across consumers; release is owned',async()=>{
  const h=harness(), b=h.create();assert.equal(h.controller.runtime,null);
  await Promise.all([h.controller.ensure(),b.ensure()]);assert.equal(h.runtimes.length,1);assert.equal(h.network.length,1);assert.equal(h.controller.runtime,b.runtime);assert.equal(h.intervals.size,1);
  const runtime=b.runtime;h.controller.dispose();h.controller.dispose();assert.equal(runtime.disposed,false);assert.equal(h.controller.runtime,null);
  b.release();assert.equal(runtime.disposed,true);assert.equal(h.intervals.size,0);assert.equal(h.listeners.size,0);
  const c=h.create();await c.ensure();assert.notEqual(c.runtime,runtime);assert.ok(c.identity.generation>runtime.identity.generation);c.dispose();
});
test('lost provision reply retries stable credential and operationId',async()=>{
  const h=harness();h.failProvision();await assert.rejects(h.controller.ensure(),/network_error/);
  await h.controller.ensure();assert.deepEqual(h.network[0],h.network[1]);assert.equal(h.network.length,2);assert.equal(h.controller.runtime.initialized,1);await h.controller.ensure();assert.equal(h.network.length,2);assert.equal(h.controller.runtime.synced,1);h.controller.dispose();
});
test('A late provision cannot publish any credential or membership into B',async()=>{
  const h=harness(), gate=h.gateProvision();const task=h.controller.ensure();while(!h.network.length)await Promise.resolve();
  h.changeAccount('B');assert.equal(h.controller.getCachedStatus().state,'unknown');assert.equal(h.controller.runtime,null);gate.resolve();await assert.rejects(task,/account_generation_changed/);
  assert.equal(h.databases.get('A').meta.has('credential'),false);await h.controller.ensure();assert.equal(h.controller.identity.accountId,'B');assert.equal(h.databases.get('B').meta.get('membership').id,'membership-B');h.controller.dispose();
});
test('A late bootstrap cannot complete B; Account-scoped outbox and AppDevice stay separated',async()=>{
  const h=harness(), gate=h.gateBootstrap();const task=h.controller.ensure();while(!h.runtimes[0]?.initialized)await Promise.resolve();
  h.databases.get('A').outbox.push({operationId:'A-op'});h.changeAccount('B');gate.resolve();await assert.rejects(task,/account_generation_changed/);
  await h.controller.ensure();assert.equal(h.databases.get('A').meta.has('migrationState'),false);assert.equal(h.databases.get('A').outbox[0].operationId,'A-op');assert.equal(h.databases.get('B').outbox.length,0);h.controller.dispose();
});
test('local status is cached credential evidence, never token-existence validity',async()=>{
  const h=harness();const s=h.createStore('port',{accountId:'A'});await s.setMeta('credential','scd1.port.secret');await s.setMeta('membership',{state:'active'});
  const status=await h.controller.status();assert.equal(status.connected,true);assert.equal(status.credentialState,'stale');assert.equal(status.membershipKnown,true);assert.equal(h.network.length,0);
  await s.setMeta('membership',{state:'revoked'});assert.equal((await h.controller.status()).credentialState,'revoked');h.controller.dispose();
});
test('offline/focus before activation never provisions; active policy is removed on dispose',async()=>{
  const h=harness();await h.controller.resume();h.context.navigator.onLine=false;assert.equal(h.network.length,0);
  h.context.navigator.onLine=true;await h.controller.ensure();const runtime=h.controller.runtime;runtime.synced=0;h.controller.dispose();
  for(const fn of h.intervals)fn();assert.equal(runtime.synced,0);assert.equal(h.intervals.size,0);
});
test('50 create/dispose cycles remove runtime, poll and Account subscription; generation increases',async()=>{
  const h=harness();h.controller.dispose();let generation=0;
  for(let i=0;i<50;i++){const c=h.create();await c.ensure();assert.ok(c.identity.generation>generation);generation=c.identity.generation;c.dispose();c.dispose();assert.equal(h.intervals.size,0);assert.equal(h.listeners.size,0);assert.equal(h.policyListeners.size,0);assert.equal(c.runtime,null);}
  assert.ok(h.runtimes.every(r=>r.disposed));
});
test('Standard gate blocks activation and exposed runtime entries recheck Pro reset',async()=>{
  let allowed=false;const h=harness({canSync:()=>allowed});assert.equal(h.controller.restricted,true);assert.equal((await h.controller.ensure()).code,'pro_required');assert.equal(h.runtimes.length,0);
  allowed=true;await h.controller.ensure();const before=h.network.length;allowed=false;
  for(const fn of [()=>h.controller.ensure(),()=>h.controller.runtime.sync(),()=>h.controller.runtime.initializeDataset(),()=>h.controller.resolveConflict('x','local'),()=>h.controller.reconcileAssetReferences()])assert.equal((await fn()).code,'pro_required');
  assert.equal(h.network.length,before);h.controller.dispose();
});
test('legacy binding is adopted only after ownership proof; cloud apply notification is retained',async()=>{
  const h=harness();const old=h.createStore('port');await old.setMeta('credential','scd1.port.secret');await old.setMeta('membership',{state:'active'});await old.setMeta('migrationState','complete');old.data.outbox.push({operationId:'old-op'});
  await h.controller.ensure();assert.equal(h.network.length,0);assert.equal(h.databases.get('A').outbox[0].operationId,'old-op');h.controller.runtime.adapter.changed=true;
  h.controller.runtime.dispatchEvent(new CustomEvent('statechange',{detail:{state:'attention'}}));assert.equal(h.events.filter(e=>e.type==='cruise-port-cloud-data-applied').length,1);h.controller.dispose();
});

test('offline ensure never provisions; subscriptions remain inert until explicit activation',async()=>{
 const h=harness();h.context.navigator.onLine=false;assert.equal((await h.controller.ensure()).code,'offline');assert.equal(h.network.length,0);assert.equal(h.runtimes.length,0);h.controller.dispose();
});
test('disposing a Port owner leaves another app runtime untouched',async()=>{
 const h=harness();const other={appId:'pitch'};h.context.SoundCruiseMultiAppSync.runtimes={pitch:other};await h.controller.ensure();h.controller.dispose();assert.equal(h.context.SoundCruiseMultiAppSync.runtimes.pitch,other);
});

test('read-only consumer has no activation/runtime/credential API and cannot keep owner network alive',async()=>{
 const h=harness(), reader=h.create(true);assert.equal(reader.ensure,undefined);assert.equal(reader.runtime,undefined);assert.equal(reader.store,undefined);assert.equal(reader.getCachedStatus().state,'unknown');assert.equal(h.dbReads,0);
 await h.controller.ensure();const runtime=h.controller.runtime;assert.equal(reader.identity.generation,h.controller.identity.generation);h.controller.dispose();assert.equal(runtime.disposed,true);assert.equal(reader.getCachedStatus().state,'unknown');assert.equal(h.intervals.size,0);reader.dispose();assert.equal(h.listeners.size,0);
});

test('reader first cannot freeze endpoint, canSync or credential resolver; owner binds once', async () => {
 const h=harness({readerFirst:true});
 const ignored=h.acquire({readOnly:true,config:{enabled:true,endpoint:'https://ignored.invalid'},canSync:()=>false});
 assert.equal(h.runtimes.length,0); assert.equal(h.network.length,0);
 const owner=h.create(); await owner.ensure();
 assert.equal(owner.runtime.endpoint,'https://sync.example'); assert.equal(owner.restricted,false);
 assert.equal(owner.runtime.accountClient.storage,h.context.SoundCruiseSyncAccount.storage);
 assert.equal(h.network.length,1); assert.equal(h.intervals.size,1);
 const reuse=h.create(); ignored.release();h.controller.release();assert.equal(owner.runtime.disposed,false);
 owner.release();assert.equal(reuse.runtime.disposed,false);const runtime=reuse.runtime;reuse.release();assert.equal(runtime.disposed,true);
});
test('reader dependency cannot freeze owner Account resolver', async () => {
 const h=harness({readerFirst:true});const storage={...h.context.SoundCruiseSyncAccount.storage};
 const root={...h.context.SoundCruiseSyncAccount,storage};
 const owner=h.acquire({accountRoot:root}); await owner.ensure();assert.equal(owner.runtime.accountClient.storage,storage);
 h.controller.release();owner.release();
});
test('owner mismatch fails explicitly without replacing active runtime', async () => {
 const h=harness();await h.controller.ensure();const runtime=h.controller.runtime;
 for(const options of [{config:{...h.config,endpoint:'https://other.invalid'}},{canSync:()=>true},{accountRoot:{...h.context.SoundCruiseSyncAccount}},{config:{...h.config,admissionMode:'qa'}}])
   assert.throws(()=>h.acquire(options), /owner_config_mismatch/);
 assert.equal(h.controller.runtime,runtime);assert.equal(runtime.disposed,false);h.controller.release();
});
test('no Web Locks rejects activation before provision while local status remains readable', async () => {
 const h=harness();delete h.context.navigator.locks;await assert.rejects(h.controller.ensure(),/sync_locks_unavailable/);
 assert.equal(h.network.length,0);assert.equal(h.runtimes.length,0);await h.controller.readLocalStatus();h.controller.release();
});


async function connected(h,id='A') {
 const store=h.createStore('port',{accountId:id});
 for(const [key,value] of Object.entries({credential:'scd1.port.secret',membership:{state:'active'},migrationState:'complete',datasetState:'ready',lastSyncAt:1,legacyInspected:true,runtimeState:'ready'}))await store.setMeta(key,value);
 return store;
}
async function settled(){for(let i=0;i<80;i++)await Promise.resolve();}
const row={recordType:'gear_item',recordId:'one',payloadHash:'same',payload:{name:'synthetic'}};
test('product opt-in resumes a proven Account without provision, legacy adoption or bootstrap',async()=>{
 const h=harness();const s=await connected(h);s.data.shadow.push(row);h.setLocal([row]);
 await h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0,error:false})}});await settled();assert.equal(h.runtimes.length,1);assert.equal(h.runtimes[0].initialized,0);assert.equal(h.runtimes[0].synced,1);assert.equal(h.network.length,0);assert.equal(h.deviceReads.length,1);
 h.window.dispatchEvent(new Event('pagehide'));assert.equal(h.controller.runtime,null);h.window.dispatchEvent(new Event('pageshow'));await settled();assert.equal(h.runtimes.length,2);assert.equal(h.runtimes[1].initialized,0);
 h.controller.dispose();assert.equal(h.policyListeners.size,0);
});
test('Account confirmation, legacy-only data and partial completion never authorize automatic activation',async()=>{
 for(const missing of ['credential','membership','migrationState','datasetState','lastSyncAt','legacyInspected']){
  const h=harness();const s=await connected(h);s.data.meta.delete(missing);await h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0,error:false})}});await settled();assert.equal(h.runtimes.length,0,missing);assert.equal(h.network.length,0);assert.equal(h.deviceReads.length,0);h.controller.dispose();
 }
 const h=harness();await h.createStore('port').setMeta('credential','scd1.port.secret');await h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0,error:false})}});await settled();assert.equal(h.runtimes.length,0);assert.equal(h.network.length,0);h.controller.dispose();
});
test('local edits not attributable to the Account shadow or pending data keep explicit adoption',async()=>{
 const h=harness();const s=await connected(h);s.data.shadow.push(row);h.setLocal([{...row,payloadHash:'other-Account'}]);await h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0,error:false})}});await settled();
 assert.equal(h.runtimes.length,0);assert.equal(h.deviceReads.length,0);assert.equal((await h.controller.status()).autoResumeCode,'local_data_unconfirmed');h.controller.dispose();
});
test('matching Account-scoped pending and local conflict candidates resume without changing pending operations',async()=>{
 for(const kind of ['outbox','conflicts']){
  const h=harness();const s=await connected(h);h.setLocal([row]);s.data[kind].push(kind==='outbox'?{...row,operationId:'fixed'}:{id:'conflict',localRecord:row});const before=structuredClone(s.data[kind]);
  await h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0,error:false})}});await settled();assert.equal(h.runtimes.length,1);assert.deepEqual(s.data[kind],before);assert.equal(h.runtimes[0].initialized,0);h.controller.dispose();
 }
});
test('A-B-A changes invalidate cold auto resume even if both Account databases completed in the past',async()=>{
 const h=harness();await connected(h);await connected(h,'B');h.context.navigator.onLine=false;await h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0,error:false})}});h.changeAccount('B');h.context.navigator.onLine=true;h.window.dispatchEvent(new Event('online'));await settled();assert.equal(h.runtimes.length,0);h.changeAccount('A');h.window.dispatchEvent(new Event('pageshow'));await settled();assert.equal(h.runtimes.length,0);assert.equal(h.network.length,0);
 await h.controller.ensure();assert.equal(h.runtimes.length,1);h.window.dispatchEvent(new Event('pagehide'));h.window.dispatchEvent(new Event('pageshow'));await settled();assert.equal(h.runtimes.length,2);h.controller.dispose();
});
test('offline, Pro refusal and server Device refusal never automatically bootstrap or provision',async()=>{
 for(const mode of ['offline','pro','device']){
  const h=harness({canSync:()=>mode!=='pro'});await connected(h);if(mode==='offline')h.context.navigator.onLine=false;if(mode==='device')h.refuseDevice();await h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0,error:false})}});await settled();assert.equal(h.runtimes.length,0);assert.equal(h.network.length,0);
  if(mode==='offline'){h.context.navigator.onLine=true;h.window.dispatchEvent(new Event('online'));await settled();assert.equal(h.runtimes.length,1);}
  h.controller.dispose();
 }
});


test('pending native Account operations or unattributed binary work leave the existing explicit action',async()=>{
 for(const mode of ['pendingAccount','pendingAsset','unknownAssets']){
  const h=harness();await connected(h);if(mode==='pendingAccount')h.context.SoundCruiseSyncAccount.storage.getPendingConsume=async()=>({phase:'prepared'});
  await h.controller.bindAutoResume({assets:{status:async()=>({known:mode!=='unknownAssets',pendingCount:mode==='pendingAsset'?1:0})}});await settled();assert.equal(h.runtimes.length,0);assert.equal(h.network.length,0);h.controller.dispose();
 }
});
test('an explicit first-start click is not swallowed by an in-flight automatic eligibility check',async()=>{
 const h=harness();h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0})}});await h.controller.ensure();assert.equal(h.runtimes.length,1);assert.equal(h.runtimes[0].initialized,1);assert.equal(h.network.length,1);h.controller.dispose();
});


test('public ensure keeps its original explicit-start contract; internal resume mode is not a public option',async()=>{
 const h=harness();await h.controller.ensure({resumeOnly:true});assert.equal(h.runtimes.length,1);assert.equal(h.runtimes[0].initialized,1);h.controller.dispose();
});


for(const kind of ['orphan','already-deleted','live-and-identical'])test('inert deletion intent '+kind+' cannot block an otherwise proven completed connection',async()=>{
 const h=harness(),s=await connected(h),k='gear_item/one',journal={[k]:{generation:'old-local-intent'}};h.setIntents(journal);
 if(kind==='already-deleted')s.data.shadow.push({...row,deleted:true,deletedAt:1});
 if(kind==='live-and-identical'){s.data.shadow.push(row);h.setLocal([row]);}
 await h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0,error:false})}});await settled();
 assert.equal(h.runtimes.length,1);assert.equal(h.network.length,0);assert.equal(h.runtimes[0].initialized,0);assert.deepEqual(h.getIntents(),journal);assert.equal(s.data.outbox.length,0);h.controller.dispose();
});
for(const match of ['none','wrong-generation','same-generation'])test('a fresh deletion against a live Account shadow still requires its pending generation: '+match,async()=>{
 const h=harness(),s=await connected(h);s.data.shadow.push(row);h.setIntents({'gear_item/one':{generation:'new-delete'}});
 if(match!=='none')s.data.outbox.push({...row,operationId:'keep-operation',deleted:true,deleteIntentGeneration:match==='same-generation'?'new-delete':'old-delete'});
 const before=structuredClone(s.data.outbox);await h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0,error:false})}});await settled();assert.equal(h.runtimes.length,match==='same-generation'?1:0);assert.deepEqual(s.data.outbox,before);h.controller.dispose();
});
test('real incremental runtime cannot generate a delete for a remote-only record absent from local and shadow',async()=>{
 const h=harness();vm.runInNewContext(fs.readFileSync(new URL('../shared/sync-account/multi-app-sync-runtime.js',import.meta.url),'utf8'),h.context);
 const store=h.createStore('port',{accountId:'A'}),runtime=new h.context.SoundCruiseMultiAppSync.MultiAppSyncRuntime({appId:'port',endpoint:'https://sync.example',store,adapter:{canDeleteRecord:()=>true},accountClient:{admissionMode:'production'},accountCore:h.context.SoundCruiseSyncAccount.core,fetchImpl:async()=>{throw Error('network forbidden');}});
 await runtime.queueDiff([], [{...row,revision:1,deleted:false}], []);assert.equal(store.data.outbox.length,0);runtime.dispose();h.controller.dispose();
});

test('automatic eligibility publishes checking for the actual asset/device/sync flight and coalesces return events',async()=>{
 const h=harness(),s=await connected(h),gate=deferred();let reads=0;const seen=[];h.controller.subscribe(s=>seen.push(s.checking));
 h.controller.bindAutoResume({assets:{status:async()=>{reads++;await gate.promise;return {known:true,pendingCount:0};}}});
 assert.equal(h.controller.getCachedStatus().checking,true);assert.equal((await h.controller.status()).checking,true);
 for(const name of ['focus','pageshow','online'])h.window.dispatchEvent(new Event(name));await settled();assert.equal(reads,1);
 gate.resolve();await settled();assert.equal(h.runtimes.length,1);assert.equal(h.controller.getCachedStatus().checking,false);assert(seen.includes(true));assert.equal(seen.at(-1),false);h.controller.dispose();
});
test('eligibility rejection and Device error always leave checking and retain the exact cause',async()=>{
 for(const mode of ['local','device']){
  const h=harness(),s=await connected(h);if(mode==='local')h.setLocal([row]);else h.refuseDevice();
  h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0})}});await settled();
  const status=await h.controller.status();assert.equal(status.checking,false);assert.equal(status.autoResumeCode,mode==='local'?'local_data_unconfirmed':'account_device_revoked');assert.equal(h.runtimes.length,0);h.controller.dispose();
 }
});
test('Account change while automatic asset check is pending cancels checking and cannot resurrect the old flight',async()=>{
 const h=harness(),s=await connected(h),gate=deferred();
 h.controller.bindAutoResume({assets:{status:async()=>{await gate.promise;return {known:true,pendingCount:0};}}});assert.equal(h.controller.getCachedStatus().checking,true);
 h.changeAccount('B');assert.notEqual(h.controller.getCachedStatus().checking,true);gate.resolve();await settled();assert.equal(h.runtimes.length,0);assert.equal(h.network.length,0);assert.notEqual(h.controller.getCachedStatus().checking,true);h.controller.dispose();
});

test('a previous Account automatic refusal cannot be shown as the next Account failure',async()=>{
 const h=harness();await connected(h);h.setLocal([row]);h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0})}});await settled();assert.equal((await h.controller.status()).autoResumeCode,'local_data_unconfirmed');
 h.changeAccount('B');assert.equal((await h.controller.status()).autoResumeCode,null);h.controller.dispose();
});

function allowEmptyJoin(h, rows=[{id:'A',isPortEnvironment:true,revokedAt:null}]) {
 h.context.SoundCruiseSyncAccount.core.accountDeviceIdFromCredential=c=>c.split('.')[1];
 h.context.SoundCruiseSyncAccount.AccountClient.prototype.devices=async function(){h.deviceReads.push(true);return {devices:rows};};
 return {assets:{status:async()=>({known:true,pendingCount:0})},canInitialize:async()=>true};
}
test('an old joined empty Port initializes through the existing path after authenticated current Device proof',async()=>{
 const h=harness();await h.controller.bindAutoResume(allowEmptyJoin(h));await new Promise(setImmediate);
 assert.equal(h.runtimes.length,1);assert.equal(h.runtimes[0].initialized,1);assert.equal(h.network.length,1);assert.equal(h.deviceReads.length,1);h.controller.dispose();
});
test('incomplete join with retained local work cannot provision or adopt on auto resume',async()=>{
 const h=harness(),options=allowEmptyJoin(h);options.canInitialize=async()=>false;h.setLocal([row]);
 const a=h.createStore('port',{accountId:'old-A'});a.data.outbox.push({...row,operationId:'unchanged-A'});const before=structuredClone(a.data.outbox);
 await h.controller.bindAutoResume(options);await settled();assert.equal(h.runtimes.length,0);assert.equal(h.network.length,0);assert.equal(h.deviceReads.length,0);assert.deepEqual(a.data.outbox,before);h.controller.dispose();
});
test('empty join cannot use another Account Device, non-Port Device, or revoked Device',async()=>{
 for(const rows of [[{id:'B',isPortEnvironment:true,revokedAt:null}],[{id:'A',isPortEnvironment:false,revokedAt:null}],[{id:'A',isPortEnvironment:true,revokedAt:1}]]){
  const h=harness();await h.controller.bindAutoResume(allowEmptyJoin(h,rows));await settled();assert.equal(h.runtimes.length,0);assert.equal(h.network.length,0);h.controller.dispose();
 }
});
test('previously invalid Port credentials are not automatically initialized even on an empty device',async()=>{
 const h=harness(),s=await connected(h);await s.setMeta('runtimeState','credential_invalid');
 await h.controller.bindAutoResume(allowEmptyJoin(h));await settled();assert.equal(h.runtimes.length,0);assert.equal(h.network.length,0);h.controller.dispose();
});
test('Account change during empty-Port eligibility cannot initialize either Account',async()=>{
 const h=harness(),gate=deferred(),options=allowEmptyJoin(h);options.canInitialize=async()=>{await gate.promise;return true;};
 await h.controller.bindAutoResume(options);await settled();h.changeAccount('B');gate.resolve();await settled();
 assert.equal(h.runtimes.length,0);assert.equal(h.network.length,0);h.controller.dispose();
});


async function materializedGear(h) {
 const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 Object.assign(h.context,{crypto:webcrypto,TextEncoder,URL,localStorage:storage});
 vm.runInNewContext(fs.readFileSync(new URL('./port-sync-adapter.js',import.meta.url),'utf8'),h.context);
 const adapter=new h.context.SoundCruisePortSync.PortSyncAdapter();
 storage.setItem('cruisePort.gearList',JSON.stringify({version:5,items:[{id:'gear-one',name:'Synthetic',status:'owned',order:-1}]}));
 const records=await adapter.serializeRecords(adapter.readLocalSnapshot());
 const s=await connected(h);s.data.shadow.push(...records);
 await adapter.applyRemoteSnapshot(adapter.deserializeRecords(records));
 return {storage,values,records};
}
async function autoFlight(h) {
 const done=new Promise(resolve=>{let started=false;const unsubscribe=h.controller.subscribe(s=>{if(s.checking)started=true;else if(started){unsubscribe();resolve();}});});
 h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0})}});await done;
}
test('native applied Gear order ranks are proven by own shadow without writes or ignoring content',async()=>{
 const h=harness(),g=await materializedGear(h),before=JSON.stringify([...g.values]),shadow=JSON.stringify(h.databases.get('A').shadow);
 const applied=JSON.parse(g.storage.getItem('cruisePort.gearList')).items[0];assert.equal(applied.order,0);assert.equal(applied.manufacturer,'');
 await autoFlight(h);
 assert.equal(h.runtimes.length,1);assert.equal(h.runtimes[0].initialized,0);assert.equal(h.network.length,0);
 assert.equal(JSON.stringify([...g.values]),before);assert.equal(JSON.stringify(h.databases.get('A').shadow),shadow);h.controller.dispose();
});
test('Gear content, order and image edits outside the Account baseline remain blocked',async()=>{
 for(const change of [{name:'Different Account edit'},{order:42},{photoId:'unconfirmed-image'}]){
  const h=harness(),g=await materializedGear(h),gear=JSON.parse(g.storage.getItem('cruisePort.gearList'));Object.assign(gear.items[0],change);g.storage.setItem('cruisePort.gearList',JSON.stringify(gear));
  await autoFlight(h);
  assert.equal(h.runtimes.length,0);assert.equal(h.network.length,0);assert.equal((await h.controller.status()).autoResumeCode,'local_data_unconfirmed');h.controller.dispose();
 }
});

test('initial asset reference preparation follows authenticated provisioning and precedes bootstrap, never normal resume', async () => {
  const h=harness();let prepared=0;
  h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0}),prepareInitialAccountReferences:async()=>{
    prepared++;const runtime=h.controller.runtime;
    assert.equal(runtime.initialized,0);
    assert.equal(h.databases.get('A').meta.get('membership').state,'active');
    assert.ok(h.databases.get('A').meta.get('credential'));
  }},canInitialize:()=>false});
  await h.controller.ensure();assert.equal(prepared,1);assert.equal(h.controller.runtime.initialized,1);
  await h.controller.ensure();assert.equal(prepared,1);
  h.controller.dispose();
});
test('failed initial asset preparation prevents bootstrap and retains Account-scoped pending records', async () => {
  const h=harness();const store=h.createStore('port',{accountId:'A'});await store.putOutbox({operationId:'retained'});
  h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0}),prepareInitialAccountReferences:async()=>{throw Error('asset_local_missing');}},canInitialize:()=>false});
  await assert.rejects(h.controller.ensure(),/asset_local_missing/);
  assert.equal(h.runtimes[0].initialized,0);assert.equal(h.runtimes[0].disposed,true);
  assert.equal(h.databases.get('A').outbox[0].operationId,'retained');
  h.controller.dispose();
});

// Journal + actual domain stores + actual adapter. No runtime is required to save anchors.
async function journalHarness({ seedUnknown = false, canSync = () => true } = {}) {
 const { PortDatasetRepository, PORT_DATASET_META } = await import('./port-dataset-repository.js');
 const { registerPortRepository } = await import('./port-dataset-storage.js?v=1.29.2');
 const history = await import('./practice-menu-history-store.js');
 const progress = await import('./practice-menu-progress-store.js');
 const { commitPracticeActivity } = await import('./practice-dataset-writes.js');
 const h=harness({canSync}), s=await connected(h), values=new Map();
 const storage={fail:()=>false,getItem:k=>values.get(k)??null,setItem(k,v){if(this.fail(k,v))throw Error('disk-full');values.set(k,String(v));},removeItem:k=>values.delete(k)};
 Object.assign(h.context,{crypto:webcrypto,TextEncoder,URL,localStorage:storage});
 vm.runInNewContext(fs.readFileSync(new URL('./port-sync-adapter.js',import.meta.url),'utf8'),h.context);
 const repo=new PortDatasetRepository({storage,locks:h.context.navigator.locks,accountStorage:h.context.SoundCruiseSyncAccount.storage,
   prepareLocalSync:r=>h.context.SoundCruisePortSync.prepareLocalCommit(r)});
 registerPortRepository(storage,repo);h.context.SoundCruisePortSync.portRepository=()=>repo;
 const event=history.createManualPracticeRecord({localDate:'2026-11-08',practiceId:'synthetic-menu',practiceName:'PRIVATE SYNTHETIC TEXT',durationMinutes:15},new Date('2026-11-08T00:00:00Z'));
 const activity={...history.createEmptyPracticeHistory(),events:[event]};
 if(seedUnknown)storage.setItem('cruisePort.practiceHistory',JSON.stringify(activity));
 const cycle=progress.createEmptyPracticeProgress(new Date('2026-11-08T00:00:00Z'));
 return {...h,s,repo,values,storage,meta:()=>JSON.parse(storage.getItem(PORT_DATASET_META)||'null'),
  save:()=>{progress.loadPracticeProgress(storage);history.loadPracticeHistory(storage);return commitPracticeActivity(cycle,activity,storage);},
  async restart(account='A'){
    h.controller.dispose();const fresh=h.create();h.controller=fresh;
    // New host, same persistent local dataset and same Account store, as after a reload.
    fresh.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0})}});
    for(let i=0;i<100;i++){await new Promise(r=>setImmediate(r));if(!fresh.getCachedStatus().checking)break;}
    return fresh;
  }};
}

test('journal: activity save without a runtime atomically persists only Account-bound anchors and cold resumes',async()=>{
 const h=await journalHarness();assert.equal(h.controller.runtime,null);assert.equal((await h.save()).ok,true);
 assert.equal(h.meta().pendingSync.records.length,2);assert.equal(h.s.data.outbox.length,0);
 const text=JSON.stringify(h.meta());assert.doesNotMatch(text,/PRIVATE SYNTHETIC TEXT|sca1\.|scd1\.|secret/);
 const before=JSON.stringify([...h.values]);const c=await h.restart();
 assert.ok(c.runtime);assert.equal(h.network.length,0,'never provisions');assert.equal(h.deviceReads.length,1);
 assert.equal(JSON.stringify([...h.values]),before,'resume does not modify dataset/journal');c.dispose();
});
test('journal: pagehide immediately after successful save retains evidence for pageshow',async()=>{
 const h=await journalHarness();await h.controller.ensure();assert.equal((await h.save()).ok,true);
 h.controller.bindAutoResume({assets:{status:async()=>({known:true,pendingCount:0})}});
 h.window.dispatchEvent(new Event('pagehide'));h.window.dispatchEvent(new Event('pageshow'));
 for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));
 assert.ok(h.controller.runtime);assert.equal(h.meta().pendingSync.records.length,2);h.controller.dispose();
});
test('journal: final metadata failure rolls back dataset and evidence; no successful partial save',async()=>{
 const h=await journalHarness(), before=JSON.stringify([...h.values]);let final=false;
 h.storage.fail=(k,v)=>k==='cruisePort.datasetRepository.v1'&&!JSON.parse(v).pending&&!final&&(final=true);
 assert.equal((await h.save()).ok,false);assert.equal(JSON.stringify([...h.values]),before);h.controller.dispose();
});
test('journal: existing unknown history is not retrospectively stamped; cold resume stays blocked',async()=>{
 const h=await journalHarness({seedUnknown:true});assert.equal((await h.save()).ok,true);
 assert.equal(h.meta().pendingSync,undefined);const c=await h.restart();assert.equal(c.runtime,null);
 assert.equal((await c.status()).autoResumeCode,'local_data_unconfirmed');c.dispose();
});
test('journal: Account replacement and a new AppDevice cannot reuse old anchors',async()=>{
 for(const mode of ['B','replacement-device']){
  const h=await journalHarness();assert.equal((await h.save()).ok,true);
  if(mode==='B'){h.changeAccount('B');await connected(h,'B');}
  else await h.s.setMeta('credential','scd1.new-device.secret');
  const c=await h.restart();assert.equal(c.runtime,null);assert.equal(h.deviceReads.length,0);c.dispose();
 }
});
test('journal: Account mutation during async proof preparation refuses the entire local commit',async()=>{
 const h=await journalHarness();
 // createStore returns fresh wrappers over the same persistent maps; gate the native Account read instead.
 const get=h.context.SoundCruiseSyncAccount.storage.getAccount;let n=0;
 h.context.SoundCruiseSyncAccount.storage.getAccount=async()=>{const value=await get();if(++n===3)h.changeAccount('B');return value;};
 assert.equal((await h.save()).ok,false);assert.equal(h.values.size,0);h.controller.dispose();
});
test('journal: Pro reauthentication with the same native Account preserves anchors without allowing Pro refusal',async()=>{
 let pro=true;const h=await journalHarness({canSync:()=>pro});assert.equal((await h.save()).ok,true);
 pro=false;let c=await h.restart();assert.equal(c.runtime,null);
 pro=true;c=await h.restart();assert.ok(c.runtime);c.dispose();
});
test('journal: unexpected mutation after commit cannot borrow an earlier saved hash',async()=>{
 const h=await journalHarness();assert.equal((await h.save()).ok,true);
 const history=JSON.parse(h.storage.getItem('cruisePort.practiceHistory'));history.events[0].practiceName='UNATTRIBUTED CHANGE';
 h.storage.setItem('cruisePort.practiceHistory',JSON.stringify(history));
 const c=await h.restart();assert.equal(c.runtime,null);assert.equal((await c.status()).autoResumeCode,'local_data_unconfirmed');c.dispose();
});
test('journal: an active pending transaction is never evidence of a successful save',async()=>{
 const h=await journalHarness();let count=0;
 const remove=h.storage.removeItem;h.storage.removeItem=()=>{throw Error('rollback-failed');};
 h.storage.fail=()=>++count>1; // pending journal persists; both commit and rollback fail
 assert.equal((await h.save()).ok,false);h.storage.fail=()=>false;h.storage.removeItem=remove;
 assert.throws(()=>h.repo.inspect(),/recovery-required/);const c=await h.restart();assert.equal(c.runtime,null);c.dispose();
});
test('journal: local save during Pro reauthentication preserves Account proof without granting network permission',async()=>{
 let pro=false;const h=await journalHarness({canSync:()=>pro});assert.equal((await h.save()).ok,true);
 assert.equal(h.meta().pendingSync.records.length,2);let c=await h.restart();assert.equal(c.runtime,null);assert.equal(h.deviceReads.length,0);
 pro=true;c=await h.restart();assert.ok(c.runtime);c.dispose();
});

test('automatic Account entry cannot bypass native asset readiness or adopt an unowned dataset', async () => {
 for (const mode of ['unknown-assets', 'pending-assets', 'unowned', 'new-account']) {
  const h = harness();
  await connected(h);
  h.context.navigator.onLine = false;
  h.controller.bindAutoResume({assets:{status:async()=>({known:mode!=='unknown-assets',pendingCount:mode==='pending-assets'?1:0})}});
  await settled();
  if (mode === 'unowned') h.setLocal([row]);
  if (mode === 'new-account') { h.setLocal([row]); h.changeAccount('recreated-A'); }
  h.context.navigator.onLine = true;
  const result = await h.controller.resumeAutomatically();
  assert.equal(result.ok, false, mode);
  assert.equal(h.runtimes.length, 0, mode);
  assert.equal(h.network.length, 0, mode);
  h.controller.dispose();
 }
});
test('Account replacement during automatic readiness does not provision or transmit either Account', async () => {
 const h = harness(), gate = deferred();
 await connected(h);
 h.context.navigator.onLine = false;
 h.controller.bindAutoResume({assets:{status:async()=>{await gate.promise;return {known:true,pendingCount:0};}}});
 await settled(); h.context.navigator.onLine = true;
 const task = h.controller.resumeAutomatically(); await settled();
 h.changeAccount('B'); gate.resolve();
 await assert.rejects(task, /account_generation_changed/);
 assert.equal(h.runtimes.length, 0); assert.equal(h.network.length, 0);
 h.controller.dispose();
});
