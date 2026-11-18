import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {packagePortPC,RELEASE_FILES} from '../scripts/package-port-pc.mjs';
import {PRO_DIRECTORY} from '../scripts/edition-layout.mjs';
import {packageProjectCanary} from '../scripts/package-project-canary.mjs';

test('one Studio package publishes the guarded client and read-only legacy compatibility resources',async()=>{
 const parent=fs.mkdtempSync('/private/tmp/studio-unified-package-test-'),out=path.join(parent,'release');
 try{
  assert.equal(packageProjectCanary,packagePortPC,'the old command has no separate product builder');
  const manifest=packagePortPC(out),names=Object.keys(manifest.files);
  assert.deepEqual(names.filter(n=>n.startsWith('apps/cruise-studio/')).sort(),[...RELEASE_FILES,'index.html','manifest.webmanifest'].map(n=>'apps/cruise-studio/'+n).sort());
  const legacyRoot=new URL('../../cruise-studio-canary/',import.meta.url);
  assert.deepEqual(names.filter(n=>n.startsWith('apps/cruise-studio-canary/')).sort(),fs.readdirSync(legacyRoot,{recursive:true}).filter(n=>fs.statSync(new URL(n,legacyRoot)).isFile()).map(n=>'apps/cruise-studio-canary/'+n).sort());
  assert(RELEASE_FILES.includes('js/cloud/studio-session-adapter.mjs'));
  assert.equal(manifest.productionReady,false);assert.equal(manifest.channel,'single-studio-operator-owner');
  for(const [name,hash] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(fs.readFileSync(path.join(out,name))).digest('hex'),hash);
  // Resolve transitive imports from the artifact itself, including resources outside Studio.
  const settings=pathToFileURL(path.join(out,'apps/cruise-studio/js/modules/sheet-cruise/score-settings.mjs'));
  assert.equal(typeof (await import(settings.href)).createScoreSettings,'function');
  assert(names.includes('apps/score-viewer/ui/icons.mjs'));
  const html=fs.readFileSync(path.join(out,'apps/cruise-studio',PRO_DIRECTORY,'index.html'),'utf8');assert.match(html,/js\/cloud\/canary-entry\.mjs/);
  assert(!names.some(n=>/workers\/|development\.html|identity-host|tests\//.test(n)));
  for(const name of ['index.html','project-canary.html']){
   const legacy=fs.readFileSync(path.join(out,'apps/cruise-studio-canary',name),'utf8');
   assert.match(legacy,/location\.replace/);assert.match(legacy,/target\.hash=location\.hash/);
   assert(!/localStorage|indexedDB|deleteDatabase|clear\(/.test(legacy),'the redirect never moves or resets data');
  }
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});
