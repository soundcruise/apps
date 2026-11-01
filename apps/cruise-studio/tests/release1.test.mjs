import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {packagePortPC,RELEASE_FILES} from '../scripts/package-port-pc.mjs';
const root=new URL('../',import.meta.url),read=name=>fs.readFileSync(new URL(name,root),'utf8');
test('public entry and Home/nav contain only the initial Port PC scope',()=>{
 const html=read('index.html');assert.match(html,/data-studio-product="port-pc"/);
 for(const id of ['sheetCruise','preDtm','practice','gear','myApps','news','series'])assert.doesNotMatch(html,new RegExp('data-workspace="'+id+'"'));
 assert.doesNotMatch(html,/screen-sheet-cruise|screen-pre-dtm|data-studio-cloud-panel|dev-create-sample/);
 const nav=html.slice(html.indexOf('<nav'),html.indexOf('</nav>'));
 const actual=[...nav.matchAll(/data-workspace="([^"]+)"/g)].map(x=>x[1]);
 const tools=[...html.matchAll(/data-home-workspace="([^"]+)"/g)].map(x=>x[1]);
 const apps=[...html.matchAll(/data-studio-cruise-app="([^"]+)"/g)].map(x=>'app_'+x[1]);
 assert.deepEqual(actual,['home','portSync',...tools,...apps]);assert.equal(tools.length,6);assert.equal(apps.length,4);
});
test('release package is an explicit Studio-only artifact without future code or native app releases',t=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'studio-release1-'));t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));const out=path.join(parent,'artifact'),manifest=packagePortPC(out);
 assert.equal(manifest.version,'1.0.0');assert.equal(manifest.productionReady,false);assert.equal(Object.keys(manifest.files).length,RELEASE_FILES.length);
 for(const [name,hash]of Object.entries(manifest.files)){assert(name.startsWith('apps/cruise-studio/'));assert.equal(createHash('sha256').update(fs.readFileSync(path.join(out,name))).digest('hex'),hash);}
 for(const name of ['development.html','js/app.js','js/core/schema2.js','js/core/song-model.js','js/core/project-repository.js','js/core/editing-session.js','js/cloud/identity-host.mjs','js/cloud/studio-sync-client.mjs','js/modules/pre-dtm-cruise/pre-dtm.js'])assert.equal(fs.existsSync(path.join(out,'apps/cruise-studio',name)),false,name);
 assert.equal(fs.existsSync(path.join(out,'workers')),false);assert.equal(fs.existsSync(path.join(out,'apps/shared')),false);
 assert.throws(()=>packagePortPC(out),/new-external-output/);
});
test('all literal Studio script/import dependencies in the release are packaged; no Project initialization is present',()=>{
 const allowed=new Set(RELEASE_FILES);
 for(const name of RELEASE_FILES){
  if(!/\.(html|js|mjs)$/.test(name))continue;const text=read(name);
  assert.doesNotMatch(text,/__SOUND_CRUISE_STUDIO_CLOUD__|createRepository\(|createRegistry\(|STUDIO_DOCUMENT_DDL|studio-sync-client/);
  const refs=name==='index.html'?[...text.matchAll(/(?:src|href)="([^"]+)"/g)].map(x=>x[1]):[...text.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)].map(x=>x[1]);
  for(const ref of refs){const u=new URL(ref,new URL(name,root));if(!u.pathname.startsWith(root.pathname))continue;const relative=u.pathname.slice(root.pathname.length);assert(allowed.has(relative),name+' -> '+relative);}
 }
});
test('development entry retains the existing editor, Project and Pre-DTM modules independently of public packaging',()=>{
 const html=read('development.html');assert.match(html,/data-studio-product="development"/);
 for(const name of ['js/core/song-model.js','js/core/project-repository.js','js/modules/sheet-cruise/sheet-cruise.js','js/modules/pre-dtm-cruise/pre-dtm.js','js/cloud/cloud-panel.mjs']){assert(html.includes(name),name);assert(fs.existsSync(new URL(name,root)));}
 assert.match(html,/id="screen-sheet-cruise"/);assert.match(html,/id="screen-pre-dtm"/);
 assert.match(read('js/core/project-repository.js'),/cruiseStudio\.project\./);
});
