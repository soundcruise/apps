import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {WORKSPACES,PERSISTENT_MIN,createWorkspaceHost,createLayoutState}=require('../js/shell.js');
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../index.html'),css=read('../shell.css'),source=read('../js/shell.js'),print=read('../print.css');
function fixture(){
 const events=[],loaded={sheetCruise:0,preDtm:0},visible={};
 const adapters=Object.fromEntries(Object.keys(WORKSPACES).map(id=>[id,{
  load(){events.push('load:'+id);if(id in loaded)loaded[id]++;},
  activate(){events.push('activate:'+id);},deactivate(){events.push('deactivate:'+id);}
 }]));
 const host=createWorkspaceHost(adapters,{show(id){for(const key of Object.keys(WORKSPACES))visible[key]={hidden:key!==id,inert:key!==id};events.push('show:'+id);},restore(id){events.push('restore:'+id);}});
 return {host,events,loaded,visible};
}
test('four Shell regions and two logical Dock slots exist once',()=>{
 for(const id of ['studio-shell','studio-main','studio-right-pane','studio-dock'])assert.equal(html.match(new RegExp('id="'+id+'"','g')).length,1);
 assert.match(html,/<nav class="studio-nav"/);assert.match(html,/data-dock-slot="transport"/);assert.match(html,/data-dock-slot="auxiliary"/);
});
test('Navigation IDs resolve to real workspaces including retained Home/Apps',()=>{
 assert.deepEqual(Object.keys(WORKSPACES),['home','sheetCruise','preDtm','series','portPractice','practice','tuner','metronome','portGear','gear','portMyApps','myApps','portNews','news']);
 for(const [id,node] of Object.entries(WORKSPACES)){if(!['practice','gear','myApps','news'].includes(id))assert.match(html,new RegExp('data-workspace="'+id+'"'));assert.match(html,new RegExp('id="'+node+'"'));}
 assert.match(html,/id="port-practice-overview"/);
 assert.match(html,/id="port-gear-overview"/);assert.match(html,/id="port-my-apps-overview"/);
});
test('active workspace remains unique and inactive views hidden/inert',()=>{
 const f=fixture();for(const id of ['home','sheetCruise','preDtm','sheetCruise','series']){f.host.activate(id);assert.equal(f.host.getActive(),id);assert.equal(Object.values(f.visible).filter(v=>!v.hidden).length,1);assert(Object.values(f.visible).every(v=>v.hidden===v.inert));}
 assert.match(source,/nodes\[key\]\.hidden = inactive/);assert.match(source,/nodes\[key\]\.inert = inactive/);
});
test('Structure round trip loads once and restores after activation',()=>{
 const f=fixture();f.host.activate('sheetCruise');f.host.activate('preDtm');f.host.activate('sheetCruise');assert.equal(f.loaded.sheetCruise,1);
 assert.deepEqual(f.events.slice(-4),['deactivate:preDtm','show:sheetCruise','activate:sheetCruise','restore:sheetCruise']);
});
test('same/unknown workspace navigation is a no-op',()=>{const f=fixture();f.host.activate('home');const before=[...f.events];assert.equal(f.host.activate('home'),false);assert.equal(f.host.activate('__proto__'),false);assert.deepEqual(f.events,before);});
test('Pre-DTM activation does not repeat load',()=>{const f=fixture();f.host.activate('preDtm');f.host.activate('home');f.host.activate('preDtm');assert.equal(f.loaded.preDtm,1);});
test('real Structure activate never reads storage or calls load/enter',()=>{
 const s=read('../js/modules/sheet-cruise/sheet-cruise.js');const activate=s.slice(s.indexOf('    function activate()'),s.indexOf('    function deactivate()'));
 assert.doesNotMatch(activate,/load\(|enter\(|storage|setProject/);assert.match(activate,/restorePosition/);assert.match(activate,/scheduleOverlayPosition\(false\)/);
});
test('real Pre-DTM lifecycle refreshes snapshots without re-running load',()=>{
 const s=read('../js/modules/pre-dtm-cruise/pre-dtm.js');assert.match(s,/function load\(\)/);assert.match(s,/function activate\(\) \{ active = true; refreshSource\(\); \}/);assert.match(s,/function deactivate\(\) \{ active = false; \}/);assert.match(s,/documentHost\.select\(els\.projectSelect\.value\)/);assert.doesNotMatch(s,/sheetCruise\.|setCurrentProjectId/);
});
test('Right pane starts closed; type switch and close are explicit',()=>{
 const l=createLayoutState(1440);assert.equal(l.get().rightOpen,false);l.openRight('tool');assert.equal(l.get().rightType,'tool');l.closeRight();assert.equal(l.get().rightOpen,false);assert.throws(()=>l.openRight('chord'),TypeError);
});
test('Inspector and Tool keep separate logical state without sharing mutable snapshots',()=>{
 const l=createLayoutState(1440),s=l.get();assert.notEqual(s.inspector,s.tool);s.inspector.selection='bar';assert.equal(l.get().inspector.selection,null);l.openRight('tool');assert.equal(l.get().inspector.selection,null);
});
test('Dock toggles independently of workspace/pane and has no audio effects',()=>{
 const l=createLayoutState(1440);l.openRight('tool');l.toggleDock();assert.equal(l.get().dockCollapsed,false);assert.equal(l.get().rightType,'tool');l.toggleDock();assert.equal(l.get().dockCollapsed,true);assert.doesNotMatch(source,/AudioContext|play\(|stop\(/);
});
test('responsive state closes pane across threshold; compact widths start closed',()=>{
 assert.equal(PERSISTENT_MIN,1280);for(const width of [1600,1440,1280,1024,900,800,680]){const l=createLayoutState(width);assert.equal(l.get().persistent,width>=1280);assert.equal(l.get().rightOpen,false);}
 const l=createLayoutState(1440);l.openRight('inspector');l.resize(1024);assert.equal(l.get().rightOpen,false);assert.equal(l.get().persistent,false);assert.match(css,/@media \(max-width: 800px\)/);
});
test('Shell colors use semantic tokens, with no palette literals or Port import',()=>{
 const declarations=css.replace(/\/\*[\s\S]*?\*\//g,'');assert.doesNotMatch(declarations,/#(?:[\da-f]{3})\b|#[\da-f]{6}\b|rgba?\(|hsla?\(|--port-|@import/i);
 assert.match(css,/color-scheme: var\(--studio-color-scheme\)/);assert.doesNotMatch(html,/cruise-port\/.*\.css/);
});
test('four themes use the existing runtime, save failure is visible',()=>{
 assert.match(source,/colorTheme\.listColorThemes\(\)/);assert.match(source,/colorTheme\.setColorTheme\(input\.value\)/);assert.match(source,/result\.ok/);assert.match(html,/id="shell-theme-status" role="status"/);assert.doesNotMatch(source,/localStorage|cruisePort\.settings/);
});
test('Main owns scroll and no Shell ancestor transforms fixed Loupe',()=>{
 assert.match(css,/\.studio-main \{[\s\S]*?overflow: auto; scrollbar-gutter: stable/);assert.match(source,/CS\.scroll\.setRoot\(id, main\)/);assert.doesNotMatch(css,/(?:^|\n)\s*(?:transform|filter|contain|backdrop-filter): (?!none)/);assert.doesNotMatch(source,/wheel/);
});
test('safe area uses actual Main bounds and leaves collapsed Dock out',()=>{
 assert.match(source,/bottom: box\.bottom/);assert.match(source,/dock\.hidden = s\.dockCollapsed/);assert.match(source,/rect\.bottom \+ 8/);assert.match(source,/main\.clientWidth === lastWidth && main\.clientHeight === lastHeight/);
});
test('print hides Shell regions and removes scroll viewport height',()=>{
 for(const cls of ['studio-nav','studio-right-pane','studio-dock'])assert.match(print,new RegExp('\\.'+cls+'[\\s\\S]*?display: none !important'));
 assert.match(print,/html, body, #studio-shell, \.studio-main \{[\s\S]*?height: auto !important;[\s\S]*?overflow: visible !important/);
});
test('focus restoration and centralized Escape preserve existing Structure gate',()=>{
 assert.match(source,/restoreHiddenFocus/);assert.match(source,/target\.focus\(\{ preventScroll: true \}\)/);assert.match(source,/keyboard\.registerEscape\(\{ scope: 'pane'/);assert.doesNotMatch(source,/doc(?:ument)?\.addEventListener\('keydown'/);
 assert.match(read('../js/modules/sheet-cruise/sheet-cruise.js'),/event\.defaultPrevented \|\| !isWorkspaceVisible\(\)/);
});
test('Shell module registration is inert before explicit initialization',()=>{
 const bomb=()=>{throw Error('unexpected side effect');};const context={CruiseStudio:{},document:new Proxy({},{get:bomb}),localStorage:new Proxy({},{get:bomb}),AudioContext:bomb,fetch:bomb,setTimeout:bomb};vm.runInNewContext(source,context);assert.equal(typeof context.CruiseStudio.shell.init,'function');
});
