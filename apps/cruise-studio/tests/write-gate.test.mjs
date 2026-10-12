import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createProOperationResolver } from '../../cruise-port/port-write-readiness.mjs';
import { createPortMetronomeFacade } from '../js/port-data/metronome-facade.mjs';
import { PortDatasetRepository } from '../../cruise-port/port-dataset-repository.js';
import { createPortDataHost } from '../js/port-data/host.mjs';
const require=createRequire(import.meta.url),schema=require('../js/modules/metronome/settings-schema.js');
const {createController}=require('../js/modules/metronome/settings-controller.js');
const {createMemoryStore}=require('../js/modules/metronome/settings-store.js');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture() {
    const values=new Map([['cruisePort.metronome',JSON.stringify({...schema.defaults(),unknown:{keep:1}})],['cruisePort.metronomePresets',JSON.stringify({version:1,items:[]})]]);
    let sequence=0,context={generation:1,accountGeneration:1,accountId:'A',repositoryEpoch:'origin-fixture',writerProtocol:1,repositoryProtocol:1,locksAvailable:true,pro:{allowed:false}},wait=null;
    const repo=new PortDatasetRepository({storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},
        locks:{async request(_name,options,work){if(options.mode==='exclusive'&&wait)await wait;return work();}},token:()=>`r${++sequence}`});
    const host={subscribe:()=>()=>{}};
    const facade=createPortMetronomeFacade({host,fixtureExecutor:{repository:repo,readContext:async()=>context,readContextSync:()=>context,
        resolvePro:createProOperationResolver({readAuth:async()=>({credential:'fixture',generation:context.pro.generation}),
            readAuthSync:()=>({credential:'fixture',generation:context.pro.generation}),knownRevoked:()=>context.pro.allowed!==true,
            now:()=>100,client:{validate:async()=>({ok:context.pro.allowed===true,offlineRemainingMs:(context.pro.validUntil||0)-100})}}),
        allWritersCompatible:true,now:()=>100,id:()=>`op${++sequence}`}});
    return {facade,repo,values,get context(){return context;},set context(value){context=value;},hold(){let release;wait=new Promise(r=>release=r);return release;}};
}
function readonly() {
    let reads=0;
    const host=createPortDataHost({schema,connect:async()=>({account:async()=>null,generation:()=>0,localStatus:async()=>({}),
        dataset:async()=>{reads++;return {metronome:schema.defaults(),presets:[],revision:'hash',state:'available'};},pro:async()=> 'standard',
        identity:()=>null,readiness:()=>({locksAvailable:true,repositoryProtocol:1}),detachConsumer(){},dispose(){}})});
    return {host,get reads(){return reads;}};
}
test('production readiness remains closed after intent and cannot acquire owner/ensure',async()=>{
    const f=readonly();assert.equal(f.reads,0);assert.equal(f.host.getCapabilities().canSaveBpm,false);f.host.getWriteReadiness();assert.equal(f.reads,0);
    for(const value of [await f.host.checkWriteReadiness({action:'saveBpm'}),await f.host.enableLocalWrites({userIntent:true}),await f.host.activateSync({userIntent:true})])assert.equal(value.reason,'old-build-unknown');
    assert.equal(f.host.canWrite,false);assert.equal((await f.host.activateSync()).reason,'user-intent-required');f.host.dispose();
});
test('production facade load/list work, all write APIs reject with no mutation executor',async()=>{
    const f=readonly(),facade=createPortMetronomeFacade({host:f.host});assert((await facade.load()).ok);assert((await facade.listPresets()).ok);
    for(const result of [await facade.saveSettings({bpm:140}),await facade.createPreset({name:'x',settings:schema.defaults()}),await facade.deletePreset('x'),await facade.applyPreset('x')])assert.equal(result.reason,'old-build-unknown');
    facade.dispose();assert.equal((await facade.load()).reason,'disposed');f.host.dispose();
});
test('fixture facade private token binds raw base; BPM commit preserves unknown and rejects stale replay',async()=>{
    const f=fixture(),loaded=await f.facade.load();assert.deepEqual(Object.keys(loaded.baseToken),[]);
    assert.equal((await f.facade.saveSettings({bpm:144},{baseToken:'hash'})).reason,'invalid-base-token');
    assert.equal((await f.facade.saveSettings({bpm:144},{baseToken:loaded.baseToken})).ok,true);
    assert.equal(JSON.parse(f.values.get('cruisePort.metronome')).unknown.keep,1);
    assert.equal((await f.facade.saveSettings({bpm:155},{baseToken:loaded.baseToken})).reason,'stale');f.facade.dispose();
});
test('fixture preset create Pro / delete Standard uses repository deletion intent',async()=>{
    const f=fixture();let list=await f.facade.listPresets();assert.equal((await f.facade.createPreset({name:'x',settings:schema.defaults()},{baseToken:list.baseToken})).reason,'pro-required');
    f.context={...f.context,pro:{allowed:true,generation:1,validUntil:1000}};
    assert((await f.facade.createPreset({name:'x',settings:schema.defaults()},{baseToken:list.baseToken})).ok);
    list=await f.facade.listPresets();f.context={...f.context,pro:{allowed:false}};
    assert((await f.facade.deletePreset(list.presets[0].id,{baseToken:list.baseToken})).ok);
    assert(Object.keys(JSON.parse(f.values.get('cruisePort.syncDeletionIntent.v1'))).some(key=>key.startsWith('metronome_preset/')));f.facade.dispose();
});
for(const change of ['account','pro','dispose'])test(`facade rechecks ${change} after waiting repository lock`,async()=>{
    const f=fixture();f.context={...f.context,pro:{allowed:true,generation:1,validUntil:1000}};const loaded=await f.facade.load(),before=f.values.get('cruisePort.metronome'),release=f.hold();
    const pending=f.facade.saveSettings({volume:80},{baseToken:loaded.baseToken});await flush();
    if(change==='account')f.context={...f.context,accountGeneration:2,accountId:'B'};
    if(change==='pro')f.context={...f.context,pro:{allowed:false,generation:2}};
    if(change==='dispose')f.facade.dispose();release();assert.equal((await pending).ok,false);assert.equal(f.values.get('cruisePort.metronome'),before);f.facade.dispose();
});
test('postcommit generation change reports saved/unconfirmed, never erases committed data',async()=>{
    const f=fixture();f.repo.subscribe(()=>{f.context={...f.context,generation:2};});const loaded=await f.facade.load();
    const result=await f.facade.saveSettings({bpm:155},{baseToken:loaded.baseToken});assert(result.ok);assert.equal(result.publish,false);assert.equal(result.syncStatus,'sync-unconfirmed');assert.equal(JSON.parse(f.values.get('cruisePort.metronome')).bpm,155);
});
function controllerFixture(data=schema.defaults()) {
    const memory=createMemoryStore({schema,data});let saves=0;
    const store={load:()=>memory.load(),save:(...args)=>{saves++;return memory.save(...args);}};
    const controller=createController({schema,store});
    return {memory,controller,get saves(){return saves;},async external(patch){const current=await memory.load();return memory.save({...current.data,...patch},{baseRevision:current.revision});}};
}
test('persistent facade load projects migration without save; explicit save persists',async()=>{
    const legacy={version:1,bpm:120,meter:'4/4',sound:'standard',volume:70};const f=controllerFixture(legacy);await f.controller.load();assert.equal(f.saves,0);assert.deepEqual((await f.memory.load()).data,legacy);assert(f.controller.snapshot().dirty);
    assert((await f.controller.save()).ok);assert.equal(f.saves,1);assert.equal((await f.memory.load()).data.version,3);
});
test('clean external adopts; IME and dirty hold draft/base until explicit adopt',async()=>{
    const f=controllerFixture();await f.controller.load();const latest=await f.external({bpm:130});assert(f.controller.receiveExternalUpdate(latest).adopted);assert.equal(f.controller.snapshot().rawSettings.bpm,130);
    f.controller.setInputPending(true);const next=await f.external({bpm:140});assert(f.controller.receiveExternalUpdate(next).pending);assert.equal(f.controller.snapshot().baseRevision,latest.revision);assert.equal((await f.controller.adoptLatest()).reason,'input-pending');
    f.controller.setInputPending(false);assert((await f.controller.adoptLatest()).ok);assert.equal(f.controller.snapshot().rawSettings.bpm,140);
    f.memory.failNext();f.controller.setBpm(150);await flush();const incoming=await f.external({volume:80});f.controller.receiveExternalUpdate(incoming);
    const base=f.controller.snapshot().baseRevision;f.controller.keepLocal();assert.equal(f.controller.snapshot().baseRevision,base);assert.equal(f.controller.snapshot().rawSettings.bpm,150);assert.equal((await f.controller.save()).reason,'external-pending');
    assert((await f.controller.reapplyOnLatest()).ok);assert.equal(f.controller.snapshot().rawSettings.volume,80);assert.equal(f.controller.snapshot().rawSettings.bpm,150);assert((await f.controller.save()).ok);
});
test('reapply rejects same-field and dependent meter/rhythm changes',async()=>{
    const f=controllerFixture();await f.controller.load();f.memory.failNext();f.controller.setBpm(150);await flush();f.controller.receiveExternalUpdate(await f.external({bpm:160}));
    assert.equal((await f.controller.reapplyOnLatest()).reason,'field-conflict');assert.equal(f.controller.snapshot().rawSettings.bpm,150);
});
test('saving external stays pending after save ACK; future schema never overwrites draft',async()=>{
    let release;const gate=new Promise(r=>release=r),memory=createMemoryStore({schema,beforeSave:()=>gate});
    const controller=createController({schema,store:memory});await controller.load();const base=controller.snapshot().baseRevision;
    controller.setBpm(140);controller.receiveExternalUpdate({data:{...schema.defaults(),bpm:155},revision:'external'});release();await flush();
    assert(controller.inspectIncoming());assert.equal(controller.snapshot().rawSettings.bpm,140);assert.notEqual(controller.snapshot().baseRevision,base);
    controller.receiveExternalUpdate({data:{...schema.defaults(),version:999},revision:'future'});assert(controller.snapshot().forwardIncompatible);assert.equal(controller.snapshot().rawSettings.bpm,140);
});

test('preset apply Standard effective, advanced fresh proof, and mixed-epoch tokens reject',async()=>{
 const f=fixture();f.context={...f.context,pro:{allowed:true,generation:1,validUntil:1000}};
 let presets=await f.facade.listPresets();assert((await f.facade.createPreset({name:'advanced',settings:{...schema.defaults(),bpm:170,volume:40}},{baseToken:presets.baseToken})).ok);
 presets=await f.facade.listPresets();let settings=await f.facade.load();f.context={...f.context,pro:{allowed:false}};
 assert((await f.facade.applyPreset(presets.presets[0].id,{presetBaseToken:presets.baseToken,settingsBaseToken:settings.baseToken})).ok);
 assert.equal(JSON.parse(f.values.get('cruisePort.metronome')).volume,70);
 settings=await f.facade.load();assert.equal((await f.facade.applyPreset(presets.presets[0].id,{presetBaseToken:presets.baseToken,settingsBaseToken:settings.baseToken,advanced:true})).reason,'pro-required');
 f.context={...f.context,pro:{allowed:true,generation:1,validUntil:1000}};
 assert((await f.facade.applyPreset(presets.presets[0].id,{presetBaseToken:presets.baseToken,settingsBaseToken:settings.baseToken,advanced:true})).ok);
 assert.equal(JSON.parse(f.values.get('cruisePort.metronome')).volume,40);
 f.context={...f.context,generation:2};settings=await f.facade.load();assert.equal((await f.facade.applyPreset(presets.presets[0].id,{presetBaseToken:presets.baseToken,settingsBaseToken:settings.baseToken})).reason,'account-generation-changed');f.facade.dispose();
});
test('empty settings can save BPM; caller mutation after dispatch cannot alter the operation',async()=>{
 const f=fixture();f.values.delete('cruisePort.metronome');const base=await f.facade.load(),patch={bpm:145},release=f.hold();
 const pending=f.facade.saveSettings(patch,{baseToken:base.baseToken});patch.bpm=200;release();assert((await pending).ok);assert.equal(JSON.parse(f.values.get('cruisePort.metronome')).bpm,145);
});
