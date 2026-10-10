import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEATURE_HELP, bindFeatureHelp } from './feature-help.js';
function fixture() {
 const element = (dataset={}) => ({dataset, events:{}, textContent:'', addEventListener(type, fn){this.events[type]=fn;}});
 const title=element(), description=element(), close=element(), tutorial=element(), steps=element(), note=element();close.focus=()=>close.focused=true; tutorial.focus=()=>tutorial.focused=true; steps.replaceChildren=(...items)=>steps.items=items;
 const dialog=element();dialog.open=false;dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;
 dialog.getBoundingClientRect=()=>({left:10,right:100,top:10,bottom:100});
 dialog.querySelector=selector=>({'#port-feature-help-title':title,'#port-feature-help-description':description,'[data-feature-help-close]':close,'[data-feature-tutorial]':tutorial,'#port-feature-help-steps':steps,'#port-feature-help-note':note}[selector]);
 const buttons=['practice','gear'].map(key=>element({featureHelp:key}));
 const root={querySelector:()=>dialog,querySelectorAll:()=>buttons,createElement:()=>element(),activeElement:close};
 bindFeatureHelp(root);return {root,dialog,title,description,close,tutorial,buttons};
}
test('each help opens the correct content and closes without retaining the other help',()=>{
 const f=fixture();for(const [i,key] of ['practice','gear'].entries()){f.buttons[i].events.click();assert(f.dialog.open);assert.equal(f.title.textContent,FEATURE_HELP[key].title);assert.equal(f.description.textContent,FEATURE_HELP[key].description);f.close.events.click();assert(!f.dialog.open);}
});
test('backdrop closes but dialog content and padding do not',()=>{
 const f=fixture();f.buttons[0].events.click();f.dialog.events.click({target:f.dialog,clientX:20,clientY:20});assert(f.dialog.open);f.dialog.events.click({target:f.description,clientX:0,clientY:0});assert(f.dialog.open);f.dialog.events.click({target:f.dialog,clientX:0,clientY:0});assert(!f.dialog.open);
});
test('Tab keeps focus on close and binding is idempotent',()=>{
 const f=fixture();let prevented=false;f.dialog.events.keydown({key:'Tab',preventDefault(){prevented=true;}});assert(prevented && f.tutorial.focused);const handler=f.buttons[0].events.click;bindFeatureHelp(f.root);assert.equal(handler,f.buttons[0].events.click);
});
test('Standard and Pro share accessible triggers, native dialog and module',()=>{
 for(const file of ['index.html','pro_9a3943176561/index.html']){const html=readFileSync(new URL(file,import.meta.url),'utf8');for(const key of ['practice','gear'])assert(html.includes(`data-feature-help="${key}"`));for(const help of Object.values(FEATURE_HELP))assert(html.includes(`aria-label="${help.title}"`));assert.equal((html.match(/<dialog id="port-feature-help-dialog"/g)||[]).length,1);assert(html.includes('feature-help.css?v=1.21.2'));}
 const script=readFileSync(new URL('feature-help.js',import.meta.url),'utf8');assert.doesNotMatch(script,/localStorage|indexedDB|fetch\(|innerHTML/);
});
