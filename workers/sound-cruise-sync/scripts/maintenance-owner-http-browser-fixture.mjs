import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createIsolatedMaintenanceOwnerHttp} from '../src/maintenance-owner-http.js';

// Explicitly invoked by the native harness, never discovered as a default test.
export async function runOwnerBrowser({db,env,writerScope,securityScope,dependencies,out,runtime,bootstrapBody}){
 const {chromium}=createRequire(runtime)('playwright');
 const root=path.resolve(fileURLToPath(new URL('../../../',import.meta.url)));
 const result={scope:'Disposable Chrome; real isolated HTTP + native D1; normal Studio boot',tests:[],pageErrors:[],missing:[],blockedOrigins:[],productionAccess:false};
 let browser,api;
 const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.woff2':'font/woff2'};
 const web=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://fixture');
  if(url.pathname==='/__owner-fixture'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>Isolated owner HTTP</title><h1>Isolated owner HTTP</h1>');}
  if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 });
 const service=http.createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const url=new URL(req.url,apiOrigin),reconcile=url.pathname.startsWith('/__reconcile/');if(reconcile)url.pathname=url.pathname.slice('/__reconcile'.length);
   const headers=new Headers(req.headers);headers.set('CF-Connecting-IP','192.0.2.10');
   const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD','OPTIONS'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const response=await api[reconcile?'reconcile':'fetch'](request);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503);res.end('isolated fixture transport failure');}
 });
 const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 await listen(web);await listen(service);
 const webOrigin='http://127.0.0.1:'+web.address().port,apiOrigin='http://127.0.0.1:'+service.address().port;
 assert(![8765,8766].includes(web.address().port));assert(![8765,8766].includes(service.address().port));
 api=createIsolatedMaintenanceOwnerHttp({db,env:{...env,ACCOUNT_ALLOWED_ORIGINS:webOrigin,ALLOWED_ORIGINS:webOrigin},writerScope,securityScope,dependencies});
 const pass=name=>result.tests.push({name,status:'PASS'});
 try{
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if([webOrigin,apiOrigin].includes(url.origin))return route.continue();
   result.blockedOrigins.push(url.origin);
   if(url.hostname==='fonts.googleapis.com')return route.fulfill({body:'',contentType:'text/css'});
   return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>result.pageErrors.push(e.message));page.on('response',r=>{if(r.status()===404)result.missing.push(new URL(r.url()).pathname);});
  await page.goto(webOrigin+'/__owner-fixture');
  const policy=await page.evaluate(async({apiOrigin,id})=>{const r=await fetch(apiOrigin+'/v2/pro-auth/policy',{headers:{'X-Maintenance-Operation-Id':id}});return{status:r.status,id:r.headers.get('X-Maintenance-Operation-Id'),ok:(await r.json()).ok};},{apiOrigin,id:randomUUID()});
  assert.equal(policy.status,200);assert(policy.id);assert.equal(policy.ok,true);pass('real CORS preflight and Pro policy read expose operation ID');
  const before=(await db.prepare('SELECT COUNT(*) n FROM sync_accounts').first()).n;
  const stopped=await page.evaluate(async({apiOrigin,body})=>{
   const headers={'Content-Type':'application/json','X-Maintenance-Operation-Id':body.operationId};
   const r=await fetch(apiOrigin+'/v2/accounts/start',{method:'POST',headers,body:JSON.stringify(body)});const code=(await r.json()).code;
   const m=await fetch(apiOrigin+'/__reconcile/v2/accounts/start',{method:'POST',headers,body:JSON.stringify(body)});const facts=await m.json();
   const duplicate=await fetch(apiOrigin+'/v2/accounts/start',{method:'POST',headers,body:JSON.stringify(body)});
   return{status:r.status,code,reconcile:m.status,classification:facts.classification,duplicate:duplicate.status};
  },{apiOrigin,body:bootstrapBody});
  assert.deepEqual(stopped,{status:423,code:'maintenance_writer_stopped',reconcile:200,classification:'historical-owner-facts-only',duplicate:409});
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_accounts').first()).n,before);pass('stopped bootstrap refusal and explicit reconcile readable across origins without replay');
  assert.equal(result.pageErrors.length,0);pass('isolated HTTP Browser page has no uncaught errors');
  const studio=await context.newPage();
  await studio.addInitScript(()=>{
   window.__ownerNoWrite={opens:0,writes:0,fetches:0};const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{__ownerNoWrite.opens++;return open(...args);};
   for(const key of ['add','put','delete','clear']){const original=IDBObjectStore.prototype[key];IDBObjectStore.prototype[key]=function(...args){__ownerNoWrite.writes++;return original.apply(this,args);};}
   window.fetch=()=>{__ownerNoWrite.fetches++;throw Error('Unexpected normal boot data request');};
  });
  studio.on('pageerror',e=>result.pageErrors.push(e.message));studio.on('response',r=>{if(r.status()===404)result.missing.push(new URL(r.url()).pathname);});
  await studio.goto(webOrigin+'/apps/cruise-studio/',{waitUntil:'networkidle'});await studio.waitForFunction(()=>!!globalThis.CruiseStudio?.portDataHost);
  const boot=await studio.evaluate(()=>({sentinel:__ownerNoWrite,status:CruiseStudio.portDataHost.getCachedStatus(),capabilities:CruiseStudio.portDataHost.getCapabilities()}));
  assert.deepEqual(boot.sentinel,{opens:0,writes:0,fetches:0});assert.equal(boot.status.canWrite,false);assert.equal(boot.capabilities.canSaveBpm,false);assert.equal(boot.capabilities.canPushCloud,false);pass('normal Studio boot retains zero Account/Port DB opens writes or fetch; canWrite false');
  const imported=fs.readFileSync(path.join(root,'workers/sound-cruise-sync/src/index.js'),'utf8')+fs.readFileSync(path.join(root,'workers/sound-cruise-sync/src/app.js'),'utf8');assert(!/maintenance-(owner|bridge-v2|v2-bpm)/.test(imported));pass('normal Worker router never imports isolated maintenance HTTP/core');
  assert.deepEqual(result.missing,[]);assert.deepEqual(result.pageErrors,[]);assert(result.blockedOrigins.every(x=>x==='https://fonts.googleapis.com'));pass('no 404 uncaught error or Account/Worker external communication');
  await studio.screenshot({path:path.join(out,'STUDIO-NO-WRITE.png'),fullPage:true});await context.close();
 }catch(e){result.error=String(e.stack||e);throw e;}
 finally{if(browser)await browser.close();await Promise.all([new Promise(r=>web.close(r)),new Promise(r=>service.close(r))]);result.summary={pass:result.tests.length,fail:result.error?1:0,skip:0};fs.writeFileSync(path.join(out,'OWNER-BROWSER-RESULT.json'),JSON.stringify(result,null,2)+'\n');}
 return result;
}
