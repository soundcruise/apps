import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CRUISE_PORT_APP_VERSION } from '../app-version.js';
import { loadSettings, saveSettings, MIDNIGHT_STORAGE_KEY } from '../settings-store.js';
const read = name => readFileSync(new URL('../'+name,import.meta.url),'utf8');
function storage() { const map=new Map(); return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}; }
test('integrated candidate retains Midnight through normal local settings saves',()=>{
 const s=storage();
 assert.equal(saveSettings({...loadSettings(s).settings,theme:'midnight'},s,{themeChanged:true}).ok,true);
 assert.equal(loadSettings(s).settings.theme,'midnight');
 assert.ok(s.getItem(MIDNIGHT_STORAGE_KEY));
 assert.equal(saveSettings({...loadSettings(s).settings,fontSize:'large'},s).ok,true);
 assert.equal(loadSettings(s).settings.theme,'midnight');
 assert.equal(loadSettings(s).settings.fontSize,'large');
});
test('both entries keep Midnight bootstrap and new automatic controller cache',()=>{
 for(const entry of ['index.html','pro_9a3943176561/index.html']){
  const html=read(entry);assert.match(html,/midnightTheme\.v1/);assert.match(html,/port-sync-controller\.js\?v=1\.30\.5/);
  assert.match(html,/multi-app-sync-runtime\.js\?v=36/);
 }
 assert.equal(CRUISE_PORT_APP_VERSION,'1.30.5');
 assert.match(read('style.css'),/\[data-theme="midnight"\]/);
});
test('recovery is automatic-only while the existing explicit merge consent remains',()=>{
 const orchestrator=read('sync-center-orchestrator.js');assert.match(orchestrator,/await portSync.resumeAutomatically\(\)/);
 assert.doesNotMatch(orchestrator,/portSync\??\.ensure/);
 assert.match(read('practice-menu-app.js'),/旧Accountのデータが残っている場合も送信対象/);
 assert.match(read('practice-menu-app.js'),/送信・統合を許可しますか/);
});
