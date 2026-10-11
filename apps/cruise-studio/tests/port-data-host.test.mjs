import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createPortDataHost } from '../js/port-data/host.mjs';
const require = createRequire(import.meta.url), schema = require('../js/modules/metronome/settings-schema.js');
const raw = () => ({...schema.defaults(),bpm:173,sound:'analog',privateUnknown:{secret:'do-not-export'}});
function fixture() {
 let notification, epoch=0, release=0, disposed=0, calls=0;
 const source={generation:()=>epoch,account:async()=>({accountId:'A',accountCredential:'secretA'}),localStatus:async()=>({}),
 dataset:async()=>({revision:'r1',generation:'repo1',state:'available',metronome:raw(),presetsSchema:1,presets:[{...raw(),id:'z',name:'Z'},{...raw(),id:'a',name:'A'}]}),pro:async()=>'standard',identity:()=>({generation:42}),detachConsumer:()=>release++,dispose:()=>disposed++};
 const host=createPortDataHost({schema,connect:async notify=>{calls++;notification=notify;return source;}});
 return {host,source,notify:()=>notification(),accountChange(){epoch++;notification();},stats:()=>({release,disposed,calls})};
}
test('construction, cache, subscriptions and early dispose do not connect or perform I/O',async()=>{
 const f=fixture();for(let n=0;n<50;n++)assert.equal(f.host.getCachedStatus().account,'unknown');const off=f.host.subscribe(()=>{});off();assert.equal(f.stats().calls,0);f.host.dispose();assert.equal(f.stats().calls,0);await f.host.readLocalStatus();assert.equal(f.stats().calls,0);
});
test('only read APIs exposed; no credential or full dataset enters the feature model',async()=>{
 const f=fixture(),s=await f.host.readLocalStatus();assert(s.canRead);assert.equal(s.canWrite,false);
 for(const key of ['save','commit','ensure','provision','bootstrap','push','pull','resolveConflict','store','runtime'])assert.equal(key in f.host,false);
 assert(!JSON.stringify(s).includes('secret'));assert(!JSON.stringify(s).includes('privateUnknown'));assert(Object.isFrozen(s.dataset.settings));assert.equal(s.account,'account-known');assert.equal(s.runtimeGeneration,42);f.host.dispose();
});
for(const [pro,sound] of [['standard','electronic'],['cached-valid','analog'],['unknown','electronic'],['expired','electronic'],['unavailable','electronic'],['stale','electronic']])test(`formal Pro read projection ${pro}`,async()=>{const f=fixture();f.source.pro=async()=>pro;const s=await f.host.readLocalStatus();assert.equal(s.pro,pro);assert.equal(s.dataset.settings.effective.sound,sound);assert.equal(s.dataset.settings.savedBpm,173);f.host.dispose();});
for(const [local,sync] of [[{},'unknown'],[{membershipKnown:true},'unknown'],[{pendingCount:2},'pending'],[{conflictCount:1},'conflict'],[{credentialState:'usable'},'synced'],[{credentialState:'stale'},'unknown'],[{state:'error'},'error']])test(`Sync projection ${JSON.stringify(local)}`,async()=>{const f=fixture();f.source.localStatus=async()=>local;const s=await f.host.readLocalStatus();assert.equal(s.sync,sync);f.host.dispose();});
test('no-account differs from unknown/unavailable; presets retain stable order and IDs',async()=>{const f=fixture();f.source.account=async()=>null;const s=await f.host.readLocalStatus();assert.equal(s.account,'no-account-known');assert.deepEqual(s.dataset.presets.map(p=>[p.id,p.name,p.order]),[['z','Z',0],['a','A',1]]);f.source.account=async()=>{throw Error('blocked');};assert.equal((await f.host.readLocalStatus()).account,'unavailable');f.host.dispose();});
test('forward values expose known BPM but no normalized effective settings or writes',async()=>{const f=fixture();f.source.dataset=async()=>({revision:'future',state:'forward-incompatible',metronome:{version:999,bpm:201,hidden:'preserved'},presetsSchema:2,presets:[{id:'x',name:'Future',bpm:202}]});const s=await f.host.readLocalStatus();assert.equal(s.dataset.settings.savedBpm,201);assert.equal(s.dataset.settings.effective,null);assert.equal(s.dataset.presets[0].effective,null);assert.equal(s.canWrite,false);f.host.dispose();});
for(const mode of ['dispose','account','newer-read'])test(`late completion rejected after ${mode}`,async()=>{
 const f=fixture();let finish;const pending=new Promise(r=>finish=r);f.source.dataset=()=>pending;
 const read=f.host.readLocalStatus();await new Promise(r=>setImmediate(r));
 if(mode==='dispose')f.host.dispose();else {f.source.account=async()=>({accountId:'B'});f.source.dataset=async()=>({revision:'B',state:'available',metronome:null,presets:[]});if(mode==='account')f.accountChange();else await f.host.readLocalStatus();await new Promise(r=>setImmediate(r));}
 finish({revision:'A',state:'available',metronome:raw(),presets:[]});await read;
 assert.notEqual(f.host.getCachedStatus().dataset?.revision,'A');if(mode!=='dispose')assert.equal(f.host.getCachedStatus().accountId,'B');f.host.dispose();
});
test('50 mounts release each consumer once; read-only detach does not own runtime stop',async()=>{for(let i=0;i<50;i++){const f=fixture();let notices=0;f.host.subscribe(()=>notices++);await f.host.readLocalStatus();f.host.dispose();f.host.dispose();f.notify();assert.equal(f.stats().disposed,1);assert.equal(notices,1);}});
test('repository notification refreshes read model independently of M2 controller',async()=>{const f=fixture();await f.host.readLocalStatus();f.source.dataset=async()=>({revision:'new',state:'available',metronome:{...raw(),bpm:190},presets:[]});f.notify();await new Promise(r=>setImmediate(r));assert.equal(f.host.getCachedStatus().dataset.settings.savedBpm,190);assert.equal(f.stats().release,1);f.host.dispose();});
test('dispose during connection acquisition releases the late consumer without reading it',async()=>{
 let finish,closed=0,reads=0;const connection=new Promise(r=>finish=r);
 const h=createPortDataHost({schema,connect:()=>connection});const pending=h.readLocalStatus();await Promise.resolve();h.dispose();
 finish({dispose(){closed++;},generation(){reads++;},account(){reads++;}});await pending;assert.equal(closed,1);assert.equal(reads,0);
});
test('observer failure does not replace a valid read model with unavailable',async()=>{
 const f=fixture();f.host.subscribe(()=>{throw Error('observer');});assert.equal((await f.host.readLocalStatus()).dataset.settings.savedBpm,173);f.host.dispose();
});
test('dispose during Account lookup cannot begin later dataset/status/Pro reads',async()=>{
 const f=fixture();let finish,reads=0;f.source.account=()=>new Promise(r=>finish=r);
 for(const name of ['dataset','localStatus','pro'])f.source[name]=async()=>{reads++;};
 const pending=f.host.readLocalStatus();await new Promise(r=>setImmediate(r));f.host.dispose();finish({accountId:'A'});await pending;assert.equal(reads,0);
});
