import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {createNativeSyncHost} from '../js/modules/series/internal-app.mjs';
test('Studio defers automatic native attention but retains explicit review through the existing guide',async()=>{
 const host=createNativeSyncHost('pitch',()=>true,{read:()=>({accountId:null}),isAuthorized:()=>true},{storage:{getGeneration:()=>0,subscribeAccount:()=>()=>{}},AccountClient:class{}},new URL('https://fixture.invalid/'));
 const guide=host.attentionWindow[Symbol.for('soundCruise.syncAttentionGuide')];let opened=0;const issue={key:'studio-explicit-review',open:()=>opened++};
 assert.equal(await guide.open(issue,true),false);assert.equal(opened,0);assert.equal(await guide.open(issue,false),true);assert.equal(opened,1);host.dispose();
});
for(const studio of [false,true])test('Fretboard boot '+(studio?'projects Home without rewriting saved state':'retains standalone view restoration'),()=>{
 const source=readFileSync(new URL('../../fretboard_cruise/script.js',import.meta.url),'utf8');const begin=source.indexOf('function runFretboardBoot()'),end=source.indexOf("\nif (document.readyState",begin);assert(begin>=0&&end>begin);
 const raw=JSON.stringify({course:'settings',settings:{tempo:151},practice:{retained:true}});const state={settings:{},course:null};let rendered;
 const context={window:{SoundCruiseNativeSyncHost:studio?{}:undefined},state,localStorage:{getItem:()=>raw,setItem(){throw Error('must not write storage');}},handleReloadToHomeFlagIfNeeded:()=>false,applyStandardEditionRuntimeDefaults(){},saveState(){throw Error('must not save');},tryRenderApp(){rendered=state.course;},console};
 vm.runInNewContext(source.slice(begin,end)+';runFretboardBoot();',context);assert.equal(rendered,studio?null:'settings');assert.equal(state.settings.tempo,151);assert.equal(raw,JSON.stringify({course:'settings',settings:{tempo:151},practice:{retained:true}}));
});
test('theme observation follows the new iframe document and corrects a late native theme bootstrap',()=>{
 const source=readFileSync(new URL('../js/modules/series/presentation.mjs',import.meta.url),'utf8');const observers=[];
 function doc(){const attributes={},root={dataset:{},style:{setProperty(){}},getAttribute:k=>attributes[k]??null,setAttribute:(k,v)=>{attributes[k]=v;}};const nodes=[];return{documentElement:root,head:{append:e=>nodes.push(e)},getElementById:id=>nodes.find(n=>n.id===id),createElement:()=>({})};}
 const first=doc(),second=doc();let load;const frame={contentDocument:first,closest:()=>null,addEventListener:(_e,f)=>load=f,removeEventListener(){}};
 const context={frame,window:{CruiseStudio:{colorTheme:{getColorTheme:()=> 'midnight',subscribeColorTheme:()=>()=>{}}}},document:{baseURI:'https://fixture.invalid/apps/cruise-studio/',getElementById:()=>({})},URL,getComputedStyle:()=>({getPropertyValue:()=> '#10151c'}),MutationObserver:class{constructor(f){this.callback=f;observers.push(this);}observe(root){this.root=root;}disconnect(){this.disconnected=true;}},ResizeObserver:class{constructor(f){this.callback=f;}observe(){this.callback();}disconnect(){}}};
 const handle=vm.runInNewContext(source.replace('export function','function')+';attachPresentation(frame);',context);assert.equal(observers.at(-1).root,first.documentElement);
 frame.contentDocument=second;load();assert.equal(observers[0].disconnected,true);assert.equal(observers.at(-1).root,second.documentElement);
 second.documentElement.dataset.theme='charcoal';second.documentElement.setAttribute('data-midnight','false');observers.at(-1).callback();assert.equal(second.documentElement.dataset.theme,'dark');assert.equal(second.documentElement.getAttribute('data-midnight'),'true');handle.dispose();assert(observers.at(-1).disconnected);
});
