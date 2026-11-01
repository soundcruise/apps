import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createSyncCenterController} from './sync-center-controller.js';
import {createPortSyncStatus} from './port-sync-status.js';
const endpoint='https://account.fixture.invalid';
function fixture(){
 let account={accountId:'A',accountCredential:'fixture-A'},generation=0,online=true,fail=null,delay=null;
 const calls=[],writes=[];
 class Client{
  async summary(c){calls.push(['summary',c]);if(delay)await delay();if(fail)throw fail;return {account:{id:c==='fixture-A'?'A':'B',state:'active'},memberships:[]};}
  async devices(c){calls.push(['devices',c]);if(fail)throw fail;return {devices:[],appDevices:[]};}
 }
 const storage={getGeneration:()=>generation,getAccount:async()=>account,clearAccount:async()=>writes.push('clear'),setAccount:async()=>writes.push('set')};
 const controller=createSyncCenterController({config:{enabled:true,endpoint},accountRoot:{storage,AccountClient:Client,core:{}},online:()=>online,readPortCredential:()=>null});
 return {controller,calls,writes,storage,choose(a){account=a;generation++;},fail(e){fail=e;},delay(fn){delay=fn;},offline(){online=false;}};
}
test('auto readonly observation confirms Account/devices and primes the existing local cache without any write',async()=>{
 const f=fixture();assert.equal((await f.controller.loadLocal()).kind,'unknown');
 const p=await f.controller.load({readOnly:true});assert.equal(p.accountState,'active');assert.equal((await f.controller.loadLocal()).kind,'ready');assert.deepEqual(f.calls.map(c=>c[0]),['summary','devices']);assert.deepEqual(f.writes,[]);
});
test('same-generation overlapping observations share the existing operation, not another runtime',async()=>{
 const f=fixture();let finish;f.delay(()=>new Promise(r=>finish=r));const a=f.controller.load({readOnly:true}),b=f.controller.load({readOnly:true});assert.equal(a,b);await Promise.resolve();await Promise.resolve();finish();await a;assert.equal(f.calls.length,2);assert.deepEqual(f.writes,[]);
});
test('unconnected/disabled/offline never requests or creates an Account',async()=>{
 const f=fixture();f.choose(null);assert.equal((await f.controller.load({readOnly:true})).kind,'unset');assert.equal(f.calls.length,0);
 f.choose({accountId:'A',accountCredential:'fixture-A'});f.offline();assert.equal((await f.controller.load({readOnly:true})).kind,'offline');assert.equal(f.calls.length,0);
 assert.equal((await createSyncCenterController({config:{enabled:false}}).load({readOnly:true})).kind,'disabled');assert.deepEqual(f.writes,[]);
});
for(const code of ['account_device_revoked','account_deleted','account_deleting','rate_limited','service_unavailable'])test('readonly '+code+' preserves binding and does not retain a successful current badge',async()=>{
 const f=fixture();await f.controller.load({readOnly:true});f.fail(Object.assign(Error('synthetic'),{code}));const p=await f.controller.load({readOnly:true});assert.equal(p.kind,'error');assert.equal(p.accountState,'unknown');assert.equal((await f.storage.getAccount()).accountId,'A');assert.deepEqual(f.writes,[]);
});
test('late A response cannot overwrite the current B presentation',async()=>{
 const f=fixture();let finish;f.delay(()=>new Promise(r=>finish=r));const old=f.controller.load({readOnly:true});await Promise.resolve();await Promise.resolve();f.choose({accountId:'B',accountCredential:'fixture-B'});f.delay(null);assert.equal((await f.controller.load({readOnly:true})).accountState,'active');finish();assert.equal((await old).kind,'unknown');assert.equal(f.controller.getCachedPresentation().kind,'ready');assert.deepEqual(f.writes,[]);
});
test('credential replacement without a generation hint still discards the read',async()=>{
 const f=fixture();let reads=0;f.storage.getAccount=async()=>++reads===1?{accountId:'A',accountCredential:'fixture-A'}:{accountId:'B',accountCredential:'fixture-B'};assert.equal((await f.controller.load({readOnly:true})).kind,'unknown');assert.deepEqual(f.writes,[]);
});
test('confirmed Account with no Port credential is unstarted, never synced',()=>{
 assert.equal(createPortSyncStatus({accountState:'active',structured:{known:true,credentialExists:false,connected:false}}).state,'unstarted');
 assert.equal(createPortSyncStatus({accountState:'active',structured:{known:true,credentialExists:false,conflictCount:1}}).state,'attention');
});
// Execute the actual historical route function with the same dependencies. Do not
// emulate its choice between load/loadLocal/ensure or alter historical source.
const historical=ref=>execFileSync('git',['show',ref+':apps/cruise-port/practice-menu-app.js'],{encoding:'utf8'});
async function route(source,activate=false,{discardedStore=false}={}){
 const begin=source.indexOf('async function renderSyncCenterView'),end=source.indexOf('\nfunction findGearItem',begin),fn=source.slice(begin,end),calls=[];
 const ctx={syncCenterController:{enabled:true,load:async o=>{calls.push(o?.readOnly?'readonly':'remote');return {accountState:'active',apps:[]};},loadLocal:async()=>{calls.push('local');return {accountState:'unknown',apps:[]};},planFourAppSetup:()=>({})},syncCenterOrchestrator:{enabled:true,hasConfiguredAccount:async()=>true,resume:async()=>calls.push('resume')},syncCenterActions:{ensureQaAdmission:async()=>calls.push('admission')},portSyncController:{ensure:async()=>calls.push('ensure'),status:async()=>({}),store:{listOutbox:async()=>{if(discardedStore)throw Error('account_generation_changed');return [];}}},portAssetSync:{status:async()=>({})},syncCenterRenderSequence:0,syncCenterResumeChecked:false,syncCenterReturnRefresh:{noteRefreshed(){}},syncCenterMismatchRetry:{shouldRetry:()=>false},elements:{syncCenterTitle:{focus(){}},syncCenterView:{querySelector:()=>({dataset:{bound:true}}),append(){}}},SYNC_CENTER_ROUTE:'#sync-center',location:{hash:'#sync-center'},getCapabilities:()=>({cloudSyncOperations:true}),showView(){},refreshVisibleSyncCenterStatus(){},markAppRowsChecking(){},renderSyncCenter(){},createPortSyncStatus:()=>({}),aiSupportPanel:null,navigator:{onLine:true},document:{documentElement:{dataset:{edition:'pro'}}}};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('ctx','activate',`const {${Object.keys(ctx).filter(k=>k!=='syncCenterRenderSequence'&&k!=='syncCenterResumeChecked').join(',')}}=ctx;let syncCenterRenderSequence=0,syncCenterResumeChecked=false;${fn};return renderSyncCenterView({activate});`)(ctx,activate);return calls;
}
test('historical route comparison: 1.21.3 auto remote/resume, 1.22.0 and 1.24.24 local-only, fix readonly',async()=>{
 const old=historical('7ebba2286^'),changed=historical('7ebba2286'),base=historical('7a6663c'),fixed=readFileSync(new URL('./practice-menu-app.js',import.meta.url),'utf8');
 assert.deepEqual(await route(old),['resume','admission','remote']);assert.match(old,/portSyncController\?\.ensure\?\.\(\)\.catch/);
 for(const source of [changed,base]){assert.deepEqual(await route(source),['local']);assert.doesNotMatch(source,/portSyncController\?\.ensure\?\.\(\)\.catch/);}
 assert.deepEqual(await route(fixed),['readonly']);assert.deepEqual(await route(fixed,true),['admission','ensure','remote']);
});

test('a quick online return is retained once within the original three-second throttle and disposed cleanly',async()=>{
 const {bindSyncCenterReturnRefresh}=await import('./sync-center-refresh.js');let clock=10000,wake,checks=0,cancelled=0;
 const handlers=new Map(),windowObject={addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener(){},setTimeout(fn,delay){assert.equal(delay,3000);wake=fn;return 1;},clearTimeout(){cancelled++;}};
 const binder=bindSyncCenterReturnRefresh({isVisible:()=>true,documentObject:{addEventListener(){},removeEventListener(){}},windowObject,now:()=>clock,refresh:()=>{checks++;}});
 binder.noteRefreshed();handlers.get('online')();handlers.get('online')();assert.equal(checks,0);clock+=3000;wake();await new Promise(r=>setImmediate(r));assert.equal(checks,1);binder.noteRefreshed();handlers.get('online')();binder.dispose();assert.equal(cancelled,1);
});

test('an older readonly reply cannot replace a newer explicit same-Account result',async()=>{
 let finish,calls=0;
 const account={accountId:'A',accountCredential:'fixture-A'};
 class Client{summary(){return ++calls===1?new Promise(r=>finish=r):Promise.resolve({account:{id:'A',state:'active'},memberships:[{appId:'chord',state:'active',dataset:{state:'ready',recordCount:7}}]});}async devices(){return {devices:[],appDevices:[]};}}
 const c=createSyncCenterController({config:{enabled:true,endpoint},accountRoot:{storage:{getGeneration:()=>1,getAccount:async()=>account},AccountClient:Client,core:{}},online:()=>true,readPortCredential:()=>null});
 const old=c.load({readOnly:true});await Promise.resolve();await Promise.resolve();await c.load();finish({account:{id:'A',state:'active'},memberships:[]});await old;
 assert.equal(c.getCachedPresentation().apps.find(a=>a.id==='chord').status,'synced');
});

test('a discarded read-only Outbox handle cannot strand the product status paint',async()=>{
 const source=readFileSync(new URL('./practice-menu-app.js',import.meta.url),'utf8');
 assert.deepEqual(await route(source,false,{discardedStore:true}),['readonly']);
});
