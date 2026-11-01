import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./pro-app-boot.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'const isProAccessReady=()=>ready;\n').replace(/import\('\.\/practice-menu-app\.js\?v=[0-9.]+'\)/,'load()');
function fixture(framed=true){
 let resolve,reject;const events=[],body={dataset:{},prepend(){events.push('error');}},location={hash:'#tuner'},handlers={};
 const window={__soundCruiseClearGate(){},dispatchEvent:e=>events.push(e.type)};window.parent=framed?{}:window;
 const c=vm.createContext({ready:false,load(){events.push('import');return new Promise((a,b)=>{resolve=a;reject=b;});},window,location,document:{body,createElement:()=>({setAttribute(){}}),getElementById:()=>({getAttribute:()=> '練習を一時停止する',click:()=>events.push('pause')})},Event:class{constructor(type){this.type=type;}},PageTransitionEvent:class{constructor(type){this.type=type;}},MutationObserver:class{constructor(cb){handlers.changed=cb;}observe(){}disconnect(){}}});
 c.__soundCruiseClearGate=window.__soundCruiseClearGate;vm.runInContext(source,c);return {c,body,window,location,events,open(){c.ready=true;handlers.changed();},complete(){location.hash='';resolve();},fail(){reject(Error('failed'));},tick:()=>new Promise(setImmediate)};
}
test('framed Port announces once only after canonical Pro-gated controllers finish, restoring the requested route',async()=>{
 const f=fixture();assert.deepEqual(f.events,[]);f.open();assert.deepEqual(f.events,['import']);assert.equal(f.body.dataset.componentState,undefined);f.complete();await f.tick();assert.equal(f.body.dataset.componentState,'ready');assert.equal(f.location.hash,'#tuner');assert.deepEqual(f.events,['import','studio-port-ready']);f.open();assert.equal(f.events.filter(x=>x==='import').length,1);f.window.CruiseStudioPortTool.pause();f.window.CruiseStudioPortTool.stop();assert.deepEqual(f.events.slice(-2),['pause','pagehide']);
});
test('standalone Port receives no Studio owner, route restoration or extra lifecycle events',async()=>{
 const f=fixture(false);f.open();f.complete();await f.tick();assert.equal(f.window.CruiseStudioPortTool,undefined);assert.equal(f.body.dataset.componentState,undefined);assert.equal(f.location.hash,'');assert.deepEqual(f.events,['import']);
});
test('failed or locked native Pro boot cannot signal tool readiness',async()=>{
 const f=fixture();assert.equal(f.window.CruiseStudioPortTool,undefined);f.open();f.fail();await f.tick();assert.equal(f.body.dataset.componentState,undefined);assert.deepEqual(f.events,['import','error']);
});

for(const preserveRoute of [false,true])test('refresh route preservation is opt-in: '+preserveRoute,async()=>{
 const {reloadAppWithCacheBust}=await import('./app-version.js?test-preserve='+preserveRoute);let target;
 assert(reloadAppWithCacheBust({preserveRoute,timestamp:5,locationObject:{href:'https://fixture.invalid/port/#sync-center',replace:value=>{target=value;}}}));
 assert.equal(new URL(target).hash,preserveRoute?'#sync-center':'');
});
