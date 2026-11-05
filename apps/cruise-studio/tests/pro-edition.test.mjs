import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import{PRO_DIRECTORY,renderProEntry}from'../scripts/edition-layout.mjs';import{packagePortPC}from'../scripts/package-port-pc.mjs';
const base=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,base),'utf8');
test('one canonical template generates the stable authenticated Pro edition; Standard is not shipped',()=>{
 assert.match(PRO_DIRECTORY,/^pro_[a-f0-9]{20}$/);
 const source=read('index.html'),generated=read(PRO_DIRECTORY+'/index.html');assert.equal(generated,renderProEntry(source));assert(!/<base\b/i.test(generated));
 for(const m of generated.matchAll(/\b(?:href|src)="([^"]+)"/g))assert(/^(\/|#|https?:|mailto:)/.test(m[1]),m[1]);
 assert.match(generated,/shared\/pro-gate.js/);assert.match(generated,/data-studio-edition="pro"/);
 assert.match(fs.readFileSync(new URL('../../../_config.yml',import.meta.url),'utf8'),/\n  - apps\/cruise-studio\/index.html/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-pro-edition-')),out=path.join(dir,'release');
 try{const m=packagePortPC(out);assert.equal(m.edition,'pro');assert.equal(m.standardPublished,false);assert.equal(Object.keys(m.files).length,192);assert(!fs.existsSync(path.join(out,'apps/cruise-studio/index.html')));assert(fs.existsSync(path.join(out,'apps/cruise-studio',PRO_DIRECTORY,'index.html')));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('authored icons use separate light faces without filters or theme persistence',()=>{
 for(const name of ['home','sheet','predtm','myapps','calendar','sync']){assert.notEqual(read('assets/tool-'+name+'.svg'),read('assets/tool-'+name+'-light.svg'));}
 const theme=read('js/core/studio-icon-theme.js');assert.match(theme,/subscribeColorTheme/);assert(!/localStorage|setColorTheme/.test(theme));
});
