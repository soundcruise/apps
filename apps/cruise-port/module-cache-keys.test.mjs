import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CRUISE_PORT_APP_VERSION} from './app-version.js';
const baseline=JSON.parse(readFileSync(new URL('./test-fixtures/port133-public-manifest.json',import.meta.url)));
const read=path=>readFileSync(new URL('../../'+path,import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const news=new Set(['news-quality.js','news-data.js','news-provider.js','news-ui.js']);
const boot=new Set(['app-version.js','practice-menu-app.js','tuner-app.js','pro-app-boot.js','index.html','pro_9a3943176561/index.html']);
// Reverse only this release's permitted boot/cache changes, not arbitrary source.
function beforeNewsChange(path,bytes){
 const name=path.replace('apps/cruise-port/','');if(!boot.has(name))return bytes;
 let source=bytes.toString();
 for(const module of ['app-version.js','practice-menu-app.js','tuner-app.js','pro-app-boot.js'])source=source.replaceAll(module+'?v=1.35.0',module+'?v=1.33.0');
 source=source.replaceAll('news-ui.js?v=1.35.0','news-ui.js?v=1.24.20').replaceAll('news-provider.js?v=1.35.0','news-provider.js?v=1.24.20');
 if(name==='app-version.js')source=source.replace("CRUISE_PORT_APP_VERSION = '1.35.0'","CRUISE_PORT_APP_VERSION = '1.33.0'");
 return Buffer.from(source);
}
test('the new release follows actual production 1.33.0 rather than main 1.28.0',()=>{
 assert.equal(CRUISE_PORT_APP_VERSION,'1.35.0');
 assert.equal(baseline.sourceCommit,'f26ec11f93561a6dc2164f3f2ecfd2f1b5f81e39');
 assert.equal(Object.keys(baseline.sha256).length,215);
});
test('all 211 non-NEWS public assets retain actual production bytes after permitted version/boot substitutions',()=>{
 let checked=0;
 for(const [path,hash]of Object.entries(baseline.sha256)){
  if(path.startsWith('apps/cruise-port/')&&news.has(path.slice('apps/cruise-port/'.length)))continue;
  assert.equal(sha(beforeNewsChange(path,read(path))),hash,path);checked++;
 }
 assert.equal(checked,211);
});
test('Standard and Pro load the changed app/boot while keeping the production CSS, auth and Sync keys',()=>{
 for(const path of ['apps/cruise-port/index.html','apps/cruise-port/pro_9a3943176561/index.html']){
  const html=read(path).toString();assert.match(html,/(?:practice-menu-app|pro-app-boot)\.js\?v=1\.35\.0/);
  assert.match(html,/style\.css\?v=1\.30\.6/);assert.match(html,/multi-app-sync-runtime\.js\?v=38/);
  assert.match(html,/port-sync-controller\.js\?v=1\.30\.5/);
 }
});
test('the complete changed NEWS import chain uses one new cache key',()=>{
 const app=read('apps/cruise-port/practice-menu-app.js').toString();
 for(const name of ['news-ui.js','news-provider.js'])assert.ok(app.includes(name+'?v=1.35.0'));
 for(const name of ['news-ui.js','news-provider.js'])assert.ok(read('apps/cruise-port/'+name).toString().includes('news-data.js?v=1.35.0'));
 assert.ok(read('apps/cruise-port/news-data.js').toString().includes('news-quality.js?v=1.35.0'));
 for(const name of ['practice-menu-app.js','tuner-app.js'])assert.ok(read('apps/cruise-port/'+name).toString().includes('app-version.js?v=1.35.0'));
 assert.ok(app.includes('tuner-app.js?v=1.35.0'));
 assert.ok(read('apps/cruise-port/pro-app-boot.js').toString().includes('practice-menu-app.js?v=1.35.0'));
});
test('no old URL remains for changed NEWS implementation modules',()=>{
 for(const file of readdirSync(new URL('.',import.meta.url)).filter(f=>f.endsWith('.js'))){
  const text=read('apps/cruise-port/'+file).toString();
  for(const module of news)for(const match of text.matchAll(new RegExp(module.replace('.','\\.')+'\\?v=([0-9.]+)','g')))assert.equal(match[1],'1.35.0',file+' -> '+module);
 }
});
