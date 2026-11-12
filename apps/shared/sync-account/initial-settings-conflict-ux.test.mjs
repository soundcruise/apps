import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = readFileSync(process.env.BOOTSTRAP_BEFORE || new URL('./multi-app-sync-bootstrap.js', import.meta.url), 'utf8');
function fixture(appId, outcome) {
  class Element {
    constructor(){this.hidden=false;this.disabled=false;this.dataset={};this.textContent='';this.listeners=[];}
    addEventListener(type,fn,options){this.listeners.push({type,fn,options});}
    async click(){for(const l of [...this.listeners].filter(l=>l.type==='click')){if(l.options?.once)this.listeners.splice(this.listeners.indexOf(l),1);await l.fn();}}
  }
  const els = Object.fromEntries(['summary','error','action="start"','action="continue"','action="return"','join-field','join-code'].map(k=>[`[data-sync-${k}]`,new Element()]));
  const dialog={dataset:{},closed:false,querySelector:s=>els[s],close(){this.closed=true;}};
  let calls=0, reviews=0, resolved=0, rejected=0, completed=0;
  const document={readyState:'loading',addEventListener(){},querySelector(){return null;}};
  const context={URL,URLSearchParams,document,location:{search:'',hash:'',pathname:'/',hostname:'example.test'},addEventListener(){},
    SoundCruiseMultiAppSync:{}, SoundCruiseSyncAccount:{core:{createSensitiveInputController:()=>({take:()=> 'synthetic-code',resolve(){resolved++;},reject(){rejected++;}})}},
    SoundCruiseSyncUI:{setJoinProcessing(){},restoreJoinInput(){},completeJoinDialog(){completed++;}}};
  context.globalThis=context;
  vm.runInNewContext(source.replace('syncRoot.resolveStartupState = resolveStartupState;', 'syncRoot.resolveStartupState = resolveStartupState; syncRoot.testLanding = {bindLanding, bindSettingsRuntime};'),context);
  const runtime={addEventListener(){},async consumeInvitation(){calls++;if(outcome instanceof Error)throw outcome;return outcome;}};
  const controller={async refresh(){reviews++;assert.equal(dialog.closed,true,'close setup before opening the existing resolver');}};
  const api=context.SoundCruiseMultiAppSync.testLanding;
  api.bindSettingsRuntime(runtime,controller,{appId});
  api.bindLanding(dialog,{appId},runtime,'join');
  return {dialog,els,start:()=>els['[data-sync-action="start"]'].click(),review:()=>els['[data-sync-action="continue"]'].click(),
    stats:()=>({calls,reviews,resolved,rejected,completed})};
}
for(const app of ['pitch','fretboard']) test(`${app}: initial merge conflict uses existing resolver without consuming another code`,async()=>{
  const f=fixture(app,{ok:false,code:'merge_conflict'});await f.start();
  assert.match(f.els['[data-sync-error]'].textContent,/接続は完了.*設定に違い/);
  assert.equal(f.els['[data-sync-action="start"]'].hidden,true);
  assert.equal(f.els['[data-sync-join-field]'].hidden,true);
  assert.equal(f.els['[data-sync-action="continue"]'].hidden,false);
  assert.equal(f.els['[data-sync-action="continue"]'].textContent,'設定を確認して解決');
  assert.deepEqual(f.stats(),{calls:1,reviews:0,resolved:1,rejected:0,completed:0},'no adoption or clean before a choice');
  await f.review();assert.equal(f.stats().reviews,1);assert.equal(f.stats().calls,1);
});
for(const code of ['dataset_authority_unavailable','account_mismatch','device_revoked','network_error']) test(`${code}: never offers settings adoption`,async()=>{
  const f=fixture('pitch',Object.assign(new Error(code),{code}));await f.start();
  assert.notEqual(f.els['[data-sync-action="continue"]'].textContent,'設定を確認して解決');
  assert.equal(f.stats().reviews,0);assert.equal(f.stats().completed,0);assert.equal(f.stats().rejected,1);
});
test('normal successful join alone completes setup',async()=>{const f=fixture('pitch',{ok:true});await f.start();assert.equal(f.stats().completed,1);assert.equal(f.stats().reviews,0);});
test('Rhythm keeps its accepted join path unchanged',async()=>{const f=fixture('rhythm',{ok:false,code:'merge_conflict'});await f.start();assert.equal(f.stats().reviews,0);assert.equal(f.stats().resolved,0);assert.equal(f.stats().rejected,1);});
