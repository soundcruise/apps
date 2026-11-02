import {releaseMode,studioPage,workerWithoutProject,removeProjectFixture,fixtureFile} from './fixtures/port-pc-profile.mjs';
// Real Port Pro and Studio entry, separate Chrome profiles; local native D1/R2 only.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {randomUUID,createHash} from 'node:crypto';
const require=createRequire(process.env.STUDIO_TEST_RUNTIME),{chromium}=require('playwright'),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{build}=require('esbuild');
const W=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),OUT=process.env.STUDIO_CLIENT_OUTPUT;assert(OUT);
const src=(process.env.STUDIO_WORKER_ROOT||W)+'/workers/sound-cruise-sync/src',pepper='synthetic-account-key-not-production-key-0000',proPepper='synthetic-pro-key-not-production-key-000000';
const {createAccountCredential,accountCredentialVerifier}=await import(src+'/account-crypto.js');
const old=fs.readFileSync(W+'/apps/cruise-studio/tests/identity-cloud.browser.mjs','utf8');
const literal=old.slice(old.indexOf('const entry=`')+'const entry='.length,old.indexOf(';'+String.fromCharCode(10)+'fs.writeFileSync'));
let entry=Function('src','W','return '+literal)(src,W);
entry="import legacy from '"+src+"/index.js';"+entry;
entry=entry.replace("legacy:{fetch:()=>new Response(null,{status:404}),scheduled:()=>null}","legacy");
entry=entry.replace("SYNC_ACCOUNT_PUBLIC_APP_IDS:'chord,pitch,fretboard,rhythm'", "SYNC_ACCOUNT_PUBLIC_APP_IDS:'chord,pitch,fretboard,rhythm,port',SYNC_ALLOWED_APP_IDS:'chord,pitch,fretboard,rhythm,port',SYNC_ASSET_WRITE_ENABLED:'true',SYNC_ASSET_DOWNLOAD_ENABLED:'true',SYNC_ACCOUNT_APP_JOIN_PEPPER:'synthetic-join-key-not-production-000000',ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER:{limit:async()=>({success:true})},ACCOUNT_APP_JOIN_CONSUME_RATE_LIMITER:{limit:async()=>({success:true})},ACCOUNT_START_RATE_LIMITER:{limit:async()=>({success:true})},ACCOUNT_API_RATE_LIMITER:{limit:async()=>({success:true})}");
entry=entry.replace("if(path.startsWith('/v2/accounts/'))","if(path==='/v2/accounts/port-device')return legacy.fetch(request,env,{});if(path.startsWith('/v2/accounts/'))");
entry=entry.replace('SYNC_DB:env.DB,','SYNC_DB:env.DB,SYNC_ASSETS:env.ASSETS,');
entry=workerWithoutProject(entry,src);fs.writeFileSync(OUT+'/entry.mjs',entry);await build({entryPoints:[OUT+'/entry.mjs'],bundle:true,format:'esm',platform:'browser',outfile:OUT+'/worker.mjs',logLevel:'silent'});
const tests=[],network=[],errors=[],contexts=[],navigation=[],faults=new Map(),holds=new Map(),httpFailures=new Map(),offlineLabels=new Set();let mf,db,browser;
async function check(name,fn){if(releaseMode&&['real shared Studio Identity enrolment and Project UNKNOWN survive Account isolation','shared Account change recreates Project client without sending A UNKNOWN under B','native Pro revoke-pending disables shared Project writes without discarding UNKNOWN'].includes(name)){(result.deferredDevelopmentCases??=[]).push(name);return;}let timer;try{await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('check deadline: '+name)),60000);})]);}finally{clearTimeout(timer);}tests.push({name,status:'PASS'});console.log('PASS '+name);}
const result={production:false,profile:releaseMode?'port-pc-release-artifact-project-backend-absent':'full-development',entry:'actual Studio index and native Port Pro index',tests,errors,network,navigation};
async function routeContext(context,label){await context.route('**/*',async route=>{
 const q=route.request(),u=new URL(q.url());
 if(u.origin==='https://studio.fixture.invalid'){
  if(u.pathname==='/bootstrap')return route.fulfill({contentType:'text/html',body:'<!doctype html><script src="/apps/shared/sync-account/sync-account-core.js"></script><script src="/apps/shared/sync-account/sync-account-db.js"></script><script src="/apps/shared/sync-account/sync-account-client.js"></script><script src="/apps/shared/pro-device-session.js"></script>'});
  let file=path.resolve(W,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(W+'/'))return route.abort();if(u.pathname.endsWith('/'))file+='/index.html';
  try{return route.fulfill({contentType:({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'),body:fixtureFile(W,u.pathname)});}catch{return route.fulfill({status:404,body:'missing'});}
 }
 if(!['sound-cruise-sync.cruise-port-requests.workers.dev','backend.fixture.invalid'].includes(u.hostname))return route.abort();
 let body;try{body=JSON.parse(q.postData()||'{}');}catch{}
 network.push({label,path:u.pathname,kind:body?.kind,method:q.method()});
 const held=holds.get(label);if(held&&u.pathname==='/v2/accounts/devices'&&++held.reads>1){held.enter();await held.wait;}
 if(offlineLabels.has(label))return route.abort('internetdisconnected');
 const failure=httpFailures.get(label);if(failure&&u.pathname==='/v2/accounts/devices')return route.fulfill({status:failure,headers:{'access-control-allow-origin':'https://studio.fixture.invalid'},contentType:'application/json',body:JSON.stringify({ok:false,code:failure===429?'rate_limited':'service_unavailable'})});
 const response=await mf.dispatchFetch('http://native.fixture.invalid'+u.pathname+u.search,{method:q.method(),headers:{...await q.allHeaders(),'CF-Connecting-IP':'192.0.2.4'},...(q.postDataBuffer()?{body:q.postDataBuffer()}: {})});
 const f=faults.get(label);if(f&&u.pathname===f.path&&(!f.kind||f.kind===body?.kind)){faults.delete(label);await response.arrayBuffer();return route.abort('failed');}
 const data=Buffer.from(await response.arrayBuffer());if(u.pathname==='/v1/sync/snapshot'){result.snapshotProof||=[];result.snapshotProof.push({label,status:response.status,legacyNetwork:data.includes(Buffer.from('Legacy network')),legacy503:data.includes(Buffer.from('Legacy 503')),gearPhoto:data.includes(Buffer.from('gear_photo_final'))});}if(response.status>=400){let code;try{code=JSON.parse(data).code;}catch{}console.log('REFUSAL',label,u.pathname,response.status,code);}
 try{return await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:data});}catch(e){if(!/closed/i.test(String(e)))throw e;}
 });}
async function profile(label,cloud=true){const context=await chromium.launchPersistentContext(fs.mkdtempSync(OUT+'/profile-'+label+'-'),{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',serviceWorkers:'block'});contexts.push(context);await routeContext(context,label);
 if(cloud)await context.addInitScript(()=>{globalThis.__SOUND_CRUISE_STUDIO_CLOUD__={endpoint:'https://backend.fixture.invalid/v2/studio/document',turnstile:async()=> 'synthetic'};});
 const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push({label,message:e.message,stack:e.stack,phase:tests.length}));page.on('framenavigated',f=>navigation.push({label,phase:tests.length,url:f.url()}));page.on('framedetached',f=>navigation.push({label,phase:tests.length,detached:f.url()}));await page.goto('https://studio.fixture.invalid/bootstrap');return{context,page,label};}
async function bootstrapPro(p){await p.page.evaluate(async()=>{
 const base='https://sound-cruise-sync.cruise-port-requests.workers.dev/v2/pro-auth';
 const request=async(path,options={})=>{const r=await fetch(base+path,options);return{status:r.status,body:await r.json()};};
 const epoch=crypto.randomUUID();localStorage.setItem('soundCruiseProOperationEpoch',epoch);
 const client=SoundCruiseProDeviceSession.createClient({request,isCurrent:()=>true});
 const r=await request('/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passcode:'0007',turnstileToken:'synthetic',devicePublicKey:await client.publicKey()})});
 if(r.status!==201)throw Error('Pro authentication '+r.status+' '+r.body.code);
 const auth={credential:r.body.credential,generation:r.body.generation,sessionVersion:r.body.session.version===3?3:2,operationRevision:JSON.stringify([epoch,0,false])};
 if(!await client.accept(auth,r.body.session))throw Error('Pro proof rejected');
 localStorage.setItem('soundCruiseProAuth',JSON.stringify({v:2,...auth,validatedAt:Date.now()}));
 });}
async function createAccount(p){return p.page.evaluate(async()=>{
 const root=SoundCruiseSyncAccount, client=new root.AccountClient({endpoint:'https://sound-cruise-sync.cruise-port-requests.workers.dev',storage:root.storage,core:root.core,admissionMode:'production'}),material=root.core.createAccountMaterial();
 await client.startAccount({appIds:['chord','pitch','fretboard','rhythm'],deviceLabel:'Synthetic Port',turnstileToken:'synthetic',material,recoverySaved:true});
 await client.summary((await root.storage.getAccount()).accountCredential);return root.storage.getAccount();
 });}
async function port(p,studio){if(!studio){await p.page.goto('https://studio.fixture.invalid/apps/cruise-port/pro_9a3943176561/#sync-center');return p.page;}
 await p.page.goto('https://studio.fixture.invalid/apps/cruise-studio/'+studioPage);await p.page.locator('[data-home-workspace="portGear"]').click();
 const frame=await p.page.locator('#port-gear-surface iframe').elementHandle();const child=await frame.contentFrame();return child;}
async function ready(frame){await frame.waitForFunction(({main,version})=>main?document.querySelector('.port-app-version-display')?.textContent==='Ver '+version&&(window.parent===window||document.body?.dataset.componentState==='ready'):document.documentElement.dataset.portWriterReady==='true',{main:!!process.env.STUDIO_NATIVE_ROOT,version:process.env.STUDIO_EXPECTED_PORT_VERSION||'1.24.29'});}
async function nativeRuntime(frame){
 for(let activation=0;activation<2;activation++){
  await frame.waitForLoadState('domcontentloaded');await ready(frame);
  if(await readStable(frame,()=>!!SoundCruiseMultiAppSync?.runtimes?.port&&!SoundCruiseMultiAppSync.runtimes.port.disposed))return;
  // Exercise the native entry on this owner. Parent navigation may legitimately
  // replace a loading iframe after a remote-apply reload; its UI is tested separately.
  await readStable(frame,()=>document.getElementById('settings-sync-center-open').click());
  const activationUrl=frame.url();
  await frame.waitForFunction(()=>{const r=SoundCruiseMultiAppSync?.runtimes?.port,b=document.getElementById('port-sync-activate');return r&&!r.disposed||b&&!b.hidden&&!b.disabled;});
  // Auto resume can finish between observation and click. Keep this check and
  // the native button event in one task, instead of clicking a now-hidden start.
  const action=await frame.evaluate(()=>{const r=SoundCruiseMultiAppSync?.runtimes?.port;if(r&&!r.disposed)return 'active';const b=document.getElementById('port-sync-activate');if(!b||b.hidden||b.disabled)throw Error('native_start_not_ready');b.click();return 'clicked';});
  if(action==='active')return;
  await frame.waitForFunction(({url,version})=>location.href!==url||(document.querySelector('.port-app-version-display')?.textContent==='Ver '+version&&document.querySelector('#port-sync-activate')?.disabled===false),{url:activationUrl,version:process.env.STUDIO_EXPECTED_PORT_VERSION||'1.24.29'});
  await frame.waitForLoadState('domcontentloaded');await ready(frame);
  if(await readStable(frame,()=>!!SoundCruiseMultiAppSync?.runtimes?.port&&!SoundCruiseMultiAppSync.runtimes.port.disposed))return;
  if(frame.url()===activationUrl)throw Error('native activation ended without runtime or reload');
  // Main intentionally tears down Sync after applying a remote snapshot/reload.
  // Drive its existing explicit control once in the new document, not an auto-retry.
 }
 throw Error('native activation keeps reloading');
}
async function go(frame,hash){
 for(let i=0;i<3;i++){
  await frame.waitForLoadState('domcontentloaded');await ready(frame);
  try{await frame.evaluate(h=>location.hash=h,hash);}catch(error){if(!/Execution context was destroyed/.test(String(error)))throw error;}
  await frame.waitForLoadState('domcontentloaded');await ready(frame);
  try{if(await frame.evaluate(()=>location.hash)===hash)return;}catch(error){if(!/Execution context was destroyed/.test(String(error)))throw error;}
 }
 throw Error('view keeps navigating: '+hash);
}
async function readStable(frame,fn,arg){for(let i=0;i<3;i++){try{return await frame.evaluate(fn,arg);}catch(error){if(!/Execution context was destroyed/.test(String(error)))throw error;await frame.waitForLoadState('domcontentloaded');await ready(frame);}}throw Error('read keeps navigating');}
async function previewHash(frame){return readStable(frame,async()=>{const url=document.querySelector('#gear-photo-preview img')?.src;if(!url)return null;const bytes=await(await fetch(url)).arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');});}
async function consent(frame){await nativeRuntime(frame);return {ok:true};}
async function sync(frame){
 await frame.waitForLoadState('domcontentloaded');await ready(frame);
 if(process.env.STUDIO_NATIVE_ROOT&&!await readStable(frame,()=>!!SoundCruiseMultiAppSync?.runtimes?.port&&!SoundCruiseMultiAppSync.runtimes.port.disposed)){await consent(frame);return {ok:true};}
 const page=frame.page?.()||frame,target=frame.mainFrame?.()||frame,oldUrl=frame.url();let navigated=false;const onNav=f=>{if(f===target)navigated=true;};page.on('framenavigated',onNav);let value;
 try{value=await frame.evaluate(()=>SoundCruiseMultiAppSync.runtimes.port.sync('explicit-test'));}catch(e){if(!/Execution context was destroyed|runtime_disposed/.test(String(e)))throw e;await frame.waitForURL(u=>u.href!==oldUrl,{timeout:10000});navigated=true;}
 await frame.waitForLoadState('domcontentloaded');page.off('framenavigated',onNav);
 if(navigated){await frame.waitForLoadState('load');await ready(frame);await nativeRuntime(frame);}
 return value;
}
async function normalGear(frame,name){await go(frame,'#wishlist');await frame.locator('#gear-list-title-add').click();await frame.locator('#gear-name').fill(name);await frame.locator('#gear-category').selectOption('guitar');await frame.locator('#gear-status').selectOption('owned');await frame.locator('#gear-list-form button[type=submit]').click();await frame.waitForFunction(name=>Array.from(document.querySelectorAll('.gear-card')).some(e=>e.textContent.includes(name))||!document.getElementById('gear-form-error').hidden,name);assert.equal(await frame.locator('#gear-form-error').isVisible(),false,'normal Account save must succeed');await frame.locator('.gear-card',{hasText:name}).waitFor();}
async function nativeClient(frame,action,arg){return frame.evaluate(async({action,arg})=>{const root=SoundCruiseSyncAccount,client=new root.AccountClient({endpoint:'https://sound-cruise-sync.cruise-port-requests.workers.dev',storage:root.storage,core:root.core,admissionMode:'production'});if(action==='detach'){const a=await root.storage.getAccount();return client.detachCurrentEnvironment({accountCredential:a.accountCredential,operationId:root.core.createOperationId()});}const{createPortAccountJoin}=await import('/apps/cruise-port/port-account-join.js?v=1.24.24'),join=createPortAccountJoin({client,admissionMode:'production',accountRoot:root});return action==='issue'?join.issue((await root.storage.getAccount()).accountCredential):join.consume(arg);},{action,arg});}
try{
 const run=fs.mkdtempSync(OUT+'/native-');const seed=process.env.STUDIO_SCHEMA_SEED;assert(seed&&fs.realpathSync(seed).startsWith('/private/tmp/studio070-remaining-rerun/native-'),'Existing disposable synthetic schema required');fs.cpSync(seed,run,{recursive:true});removeProjectFixture(run);mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:fs.readFileSync(OUT+'/worker.mjs','utf8'),compatibilityDate:'2026-09-01',host:'127.0.0.1',port:0,inspectorPort:0,d1Databases:{DB:'product-sync'},r2Buckets:{ASSETS:'product-assets'},bindings:{SYNC_ACCOUNT_CREDENTIAL_PEPPER:pepper,SYNC_ACCOUNT_RECOVERY_PEPPER:pepper,PRO_CREDENTIAL_PEPPER:proPepper,SYNC_CREDENTIAL_PEPPER:'synthetic-device-key-not-production-key-000000'},resourcePersistencePath:run,resourceTmpPath:run+'/tmp',outboundService:()=>{throw Error('Production network forbidden');}}));db=await mf.getD1Database('DB');
 if(!releaseMode){await(await import(src+'/studio-release-schema.js')).inspectStudioRelease(db);await db.prepare('UPDATE studio_document_control SET enabled=1').run();}else assert.equal((await db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'studio_%'").all()).results.length,0);
 await db.prepare("INSERT OR REPLACE INTO sync_runtime_control VALUES(1,'open',1,1,1,1,1,1,1)").run();await db.prepare("INSERT OR REPLACE INTO sync_account_runtime_control VALUES(1,'open',1,1,1,1,1,0,1,1)").run();
 await db.prepare("INSERT OR REPLACE INTO pro_auth_state(singleton_id,generation,active_code_slot,legacy_compat_enabled,updated_at,session_lifecycle_started_at,unbound_backend_until) VALUES(1,1,'A',1,?,?,?)").bind(Date.now(),Date.now(),Date.now()+3600000).run();
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 // New public normal-operation acceptance, separate from the existing25 cases.
 for(const pro of [false,true])await check((pro?'Pro':'Standard')+' cold Port connects Account and saves/disconnects without manual reload',async()=>{
  const p=await profile(pro?'Cold-Pro':'Cold-Standard',false);if(pro)await bootstrapPro(p);await p.page.goto('https://studio.fixture.invalid/apps/cruise-port/'+(pro?'pro_9a3943176561/':'')+'#wishlist');await ready(p.page);const origin=await p.page.evaluate(()=>performance.timeOrigin);await normalGear(p.page,'Before connection '+pro);await createAccount(p);await normalGear(p.page,'After connection '+pro);assert.equal(await p.page.evaluate(()=>performance.timeOrigin),origin);
  if(pro){globalThis.coldIssuer=p;await nativeRuntime(p.page);await p.page.waitForFunction(()=>!!SoundCruiseMultiAppSync.runtimes?.port);}
  else{assert.equal(await p.page.evaluate(async()=>(await import('/apps/cruise-port/cruise-port-capabilities.js?v=1.24.24')).getCapabilities().cloudSyncOperations),false);await nativeClient(p.page,'detach');await normalGear(p.page,'After detach Standard');assert.equal(await p.page.evaluate(()=>performance.timeOrigin),origin);await p.context.close();}
 });
 for(const studio of [false,true])await check('native Port invitation join and first Cloud receive in '+(studio?'Studio iframe':'standalone Pro'),async()=>{
  const p=await profile(studio?'Cold-Studio-join':'Cold-Port-join',false);await bootstrapPro(p);await p.page.goto('https://studio.fixture.invalid/apps/cruise-port/pro_9a3943176561/');await ready(p.page);const issued=await nativeClient(coldIssuer.page,'issue');const joined=await nativeClient(p.page,'consume',issued.displayJoinCode);assert(joined.accountId);let frame=p.page;
  if(studio){await p.page.goto('https://studio.fixture.invalid/apps/cruise-studio/'+studioPage);await p.page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized());await p.page.locator('[data-home-workspace=portGear]').click();frame=await(await p.page.locator('#port-gear-surface iframe').elementHandle()).contentFrame();await ready(frame);}
  await nativeRuntime(frame);await frame.waitForFunction(()=>localStorage.getItem('cruisePort.gearList')?.includes('After connection true'));await normalGear(frame,'Joined '+studio);await sync(frame);await sync(coldIssuer.page);await coldIssuer.page.waitForFunction(name=>localStorage.getItem('cruisePort.gearList')?.includes(name),'Joined '+studio);await p.context.close();
 });
 await check('Pro detach keeps the local dataset writable on the same document',async()=>{const p=coldIssuer;await go(p.page,'#wishlist');const origin=await p.page.evaluate(()=>performance.timeOrigin);await nativeClient(p.page,'detach');await normalGear(p.page,'After detach Pro');assert.equal(await p.page.evaluate(()=>performance.timeOrigin),origin);assert.equal(await p.page.evaluate(()=>!!SoundCruiseMultiAppSync.runtimes?.port),false);await p.context.close();});
 await check('normal actual Studio boot stays Cloud-disconnected and performs no local writes',async()=>{
  const N=await profile('Normal',false);await N.context.addInitScript(()=>{globalThis.normalWrites=[];const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){normalWrites.push({kind:'storage',key:k});return set.call(this,k,v);};for(const method of ['put','add','delete','clear']){const old=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(...args){normalWrites.push({kind:'idb',method});return old.apply(this,args);};}});await N.page.goto('https://studio.fixture.invalid/apps/cruise-studio/'+studioPage);await N.page.waitForFunction(()=>!!CruiseStudio.shellHost);await N.page.waitForTimeout(150);await N.page.waitForFunction(()=>!!CruiseStudio.entryAuth);assert.deepEqual(await N.page.evaluate(()=>normalWrites.filter(x=>x.kind==='idb'||!['soundCruiseProLegacyRetired'].includes(x.key))),[]);assert.equal(await N.page.evaluate(()=>document.getElementById('studio-shell').inert),true);assert.equal(await N.page.evaluate(()=>CruiseStudio.entryAuth.isAuthorized()),false);assert.equal(await N.page.evaluate(()=>CruiseStudio.portDataHost?.canWrite??false),false);assert.equal(network.some(x=>x.label==='Normal'),false);await N.context.close();
 });

 const E=await profile('Entrance',false);let entranceAccount,heldFrame,heldDraft;
 async function entranceCode(code){
  await E.page.evaluate(()=>{window.__SOUND_CRUISE_ACCOUNT_TURNSTILE__={getToken:async()=> 'synthetic'};});
  // The previous native submit clears its input in finally, after showing errors.
  await E.page.waitForFunction(()=>document.getElementById('pro-gate-input')?.value===''&&document.getElementById('pro-gate-submit')?.disabled===false);
  // Submit through the unchanged native gate handler in one browser task. A
  // terminal-revocation/modal transition can replace or clear the input between
  // two separate Playwright commands; no qualification or gate result is injected.
  await E.page.evaluate(value=>{const input=document.getElementById('pro-gate-input'),submit=document.getElementById('pro-gate-submit');if(!input||!submit||submit.disabled)throw Error('native gate not ready');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));submit.click();},code);
 }
 await check('formal Studio entrance rejects wrong Pro and requires native Account in addition to Pro',async()=>{
  await E.page.goto('https://studio.fixture.invalid/apps/cruise-studio/'+studioPage+'?syntheticPro=1');
  await E.page.locator('#pro-gate-input').waitFor();await E.page.screenshot({path:OUT+'/entrance-locked.png'});assert.equal(await E.page.evaluate(()=>CruiseStudio.entryAuth.isAuthorized()),false);
  await entranceCode('0008');await E.page.locator('#pro-gate-error').filter({hasText:'番号が違います'}).waitFor();
  await entranceCode('0007');await E.page.locator('#studio-entry-account').waitFor();
  assert.equal(await E.page.evaluate(()=>CruiseStudio.entryAuth.isAuthorized()),false);
  await E.page.locator('[data-entry-connect]').click();
  await E.page.frameLocator('[data-entry-account-frame] iframe').locator('#sync-center-view:not([hidden])').waitFor();
  await E.page.evaluate(()=>document.querySelector('[data-entry-account-frame] iframe').contentWindow.location.hash='#wishlist');
  await E.page.waitForFunction(()=>document.querySelector('[data-entry-account-frame] iframe').contentWindow.location.hash==='#sync-center');
  entranceAccount=await createAccount(E);await E.page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
  result.entranceTiming=await E.page.evaluate(()=>CruiseStudio.entryAuth.diagnostics());
  assert.equal(await E.page.locator('#pro-gate-overlay').count(),0);assert.equal(await E.page.locator('#studio-shell').evaluate(e=>e.inert),false);if(releaseMode)await E.page.locator('[data-account-status]').filter({hasText:'Pro認証済み'}).waitFor();else await E.page.locator('[data-studio-cloud-panel]').getByText('Studio Pro認証済み',{exact:true}).waitFor();await E.page.screenshot({path:OUT+'/entrance-ready.png'});
 });
 await check('one native entrance qualification admits all five actual Port Pro tools without another passcode',async()=>{
  const before=network.filter(n=>n.label==='Entrance'&&n.path==='/v2/pro-auth/verify').length;
  for(const [workspace,selector]of [['tuner','#port-tuner-surface iframe'],['metronome','#port-metronome-surface iframe'],['portPractice','#port-practice-surface iframe'],['portGear','#port-gear-surface iframe'],['portMyApps','#port-my-apps-surface iframe']]){
   await E.page.evaluate(w=>CruiseStudio.shellHost.navigate(w),workspace);
   await E.page.waitForFunction(sel=>document.querySelector(sel)?.contentDocument?.body?.dataset.componentState==='ready',selector);
   const child=await(await E.page.locator(selector).elementHandle()).contentFrame();
   assert.equal(await child.locator('#pro-gate-overlay').count(),0);assert.equal(await child.evaluate(()=>SoundCruiseProOperationSource.read().revoked),false);
  }
  assert.equal(network.filter(n=>n.label==='Entrance'&&n.path==='/v2/pro-auth/verify').length,before);
 });
 await check('four original app controllers receive the trusted native source, preserving five themes without further Pro login',async()=>{
  const before=network.filter(n=>n.label==='Entrance'&&n.path==='/v2/pro-auth/verify').length;
  for(const [id,settings]of [['pitch','#home-settings-btn'],['fretboard','#btn-settings-home'],['rhythm','#settings-btn'],['chord','#cc-settings-btn']]){
   await E.page.evaluate(id=>CruiseStudio.shellHost.navigate('app_'+id),id);
   const child=E.page.frameLocator('#series-'+id+'-surface iframe');await child.locator(settings).click();
   assert.equal(await child.locator('#pro-gate-overlay').count(),0);
   assert.equal(await child.locator('body').evaluate(()=>SoundCruiseProOperationSource.read().revoked),false);
   for(const theme of ['dark','midnight','charcoal','gray','light']){await E.page.evaluate(t=>CruiseStudio.colorTheme.setColorTheme(t),theme);await child.locator('html[data-studio-theme='+theme+']').waitFor();}
   await E.page.evaluate(()=>{for(const f of document.querySelectorAll('.studio-series-frame'))f.contentWindow.studioAppDirty=false;});
  }
  assert.equal(network.filter(n=>n.label==='Entrance'&&n.path==='/v2/pro-auth/verify').length,before);
 });
 await check('native Pro offline grace retains the same playing metronome, reconnects, and explicit revocation stops it',async()=>{
  await E.page.evaluate(()=>CruiseStudio.shellHost.navigate('metronome'));
  const metro=await(await E.page.locator('#port-metronome-surface iframe').elementHandle()).contentFrame();
  await metro.locator('#metronome-view:not([hidden])').waitFor();
  await metro.locator('#metronome-toggle').click();await metro.locator('#metronome-toggle[aria-pressed=true]').waitFor();
  await E.page.evaluate(()=>window.offlineFrame=document.querySelector('#port-metronome-surface iframe'));
  offlineLabels.add('Entrance');await E.context.setOffline(true);
  assert.equal(await E.page.evaluate(()=>CruiseStudio.entryAuth.check()),true);
  assert.equal(await E.page.evaluate(()=>CruiseStudio.entryAuth.read().offline),true);
  assert.equal(await metro.locator('#metronome-toggle').getAttribute('aria-pressed'),'true');
  assert(await E.page.evaluate(()=>offlineFrame===document.querySelector('#port-metronome-surface iframe')));
  await E.page.screenshot({path:OUT+'/metronome-offline.png'});
  offlineLabels.delete('Entrance');await E.context.setOffline(false);
  assert.equal(await E.page.evaluate(()=>CruiseStudio.entryAuth.check()),true);
  assert.equal(await E.page.evaluate(()=>CruiseStudio.entryAuth.read().offline),false);
  assert.equal(await metro.locator('#metronome-toggle').getAttribute('aria-pressed'),'true');
  await E.page.evaluate(()=>{const auth=JSON.parse(localStorage.getItem('soundCruiseProAuth'));localStorage.setItem('soundCruiseProRevokePending',JSON.stringify([auth.credential]));});
  assert.equal(await E.page.evaluate(()=>CruiseStudio.entryAuth.check()),false);
  await metro.locator('#metronome-toggle[aria-pressed=false]').waitFor();
  assert(await E.page.evaluate(()=>offlineFrame===document.querySelector('#port-metronome-surface iframe')));
  await E.page.evaluate(()=>__soundCruiseClearGate());await entranceCode('0007');await E.page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
  result.offlineEntrance={retainedSameOwner:true,playingThroughOutage:true,reconnected:true,explicitRevocationStops:true};
 });
 await check('a revoked Account Device locks the entrance and refuses new Project save while keeping the actual Gear form and Project draft',async()=>{
  if(!releaseMode){
  await E.page.evaluate(()=>CruiseStudio.shellHost.navigate('sheetCruise'));await E.page.locator('#sc-new-project').click();
  await E.page.locator('#sc-editor-drawer').evaluate(e=>e.open=true);await E.page.locator('#sc-title').fill('未保存の入口テスト曲');await E.page.locator('#sc-title').press('Tab');
  heldDraft=await E.page.evaluate(release=>release?localStorage.getItem('cruiseStudio.project.release-sentinel'):JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot()),releaseMode);
  }else {await E.page.evaluate(()=>localStorage.setItem('cruiseStudio.project.release-sentinel','preserved'));heldDraft='preserved';}
  await E.page.evaluate(()=>CruiseStudio.shellHost.navigate('portGear'));heldFrame=await(await E.page.locator('#port-gear-surface iframe').elementHandle()).contentFrame();await ready(heldFrame);
  await heldFrame.locator('#gear-list-title-add').click();await heldFrame.locator('#gear-name').fill('入口失効時の未保存ギター');
  await E.page.evaluate(()=>window.heldGear=document.querySelector('#port-gear-surface iframe'));
  await db.prepare('UPDATE sync_account_devices SET revoked_at=? WHERE id=?').bind(Date.now(),entranceAccount.accountDeviceId).run();
  assert.equal(await E.page.evaluate(()=>CruiseStudio.entryAuth.check()),false);
  assert.equal(await E.page.locator('#studio-shell').evaluate(e=>e.inert),true);
  assert.equal(await heldFrame.locator('#gear-name').inputValue(),'入口失効時の未保存ギター');
  assert.equal(await E.page.evaluate(release=>release?localStorage.getItem('cruiseStudio.project.release-sentinel'):JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot()),releaseMode),heldDraft);
  if(!releaseMode){const denied=await E.page.evaluate(()=>CruiseStudio.repository.save({target:{type:'project',projectId:'denied-entry'},snapshot:{},baseRevision:null}));assert.equal(denied.code,'studio-entry-required');}else assert.equal(await E.page.evaluate(()=>typeof CruiseStudio.repository),'undefined');
 });
 await check('Account replacement revalidates the native session and keeps the old Account form inert instead of silently adopting it',async()=>{
  entranceAccount=await createAccount(E);await E.page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
  assert.equal(await E.page.evaluate(()=>window.heldGear===document.querySelector('#port-gear-surface iframe')),true);
  assert.equal(await E.page.evaluate(()=>window.heldGear.inert),true);
  assert.equal(await heldFrame.locator('#gear-name').inputValue(),'入口失効時の未保存ギター');
  assert.equal(await E.page.evaluate(release=>release?localStorage.getItem('cruiseStudio.project.release-sentinel'):JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot()),releaseMode),heldDraft);
 });
 await check('terminal Pro revocation and formal reauthentication reuse native APIs without dropping the preserved draft or old form',async()=>{
  await E.page.evaluate(()=>{const input=document.createElement('input');input.id='entrance-modal-draft';input.value='保持するダイアログ入力';window.entryDialog=CruiseStudio.shellHost.modal.open({title:'合成の編集',content:input});});
  const proId=await E.page.evaluate(()=>JSON.parse(localStorage.getItem('soundCruiseProAuth')).credential.split('.')[1]);
  await db.prepare('UPDATE pro_credentials SET revoked_at=? WHERE id=?').bind(Date.now(),proId).run();
  assert.equal(await E.page.evaluate(()=>CruiseStudio.entryAuth.check()),false);await E.page.locator('#pro-gate-input').waitFor();
  assert.equal(await heldFrame.locator('#gear-name').inputValue(),'入口失効時の未保存ギター');
  await entranceCode('0007');await E.page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
  assert.equal(await E.page.evaluate(release=>release?localStorage.getItem('cruiseStudio.project.release-sentinel'):JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot()),releaseMode),heldDraft);
  assert.equal(await E.page.evaluate(()=>window.heldGear.inert),true);await E.page.screenshot({path:OUT+'/entrance-resumed-modal.png'});
  assert.equal(await E.page.locator('#entrance-modal-draft').inputValue(),'保持するダイアログ入力');
  assert.equal(await E.page.evaluate(()=>window.entryDialog.matches(':modal')),true);await E.page.evaluate(()=>CruiseStudio.shellHost.modal.close('test-complete'));
 });
 await check('discarding a retained previous-Account form requires explicit confirmation; cancel preserves both form and draft',async()=>{
  E.page.once('dialog',d=>d.dismiss());await E.page.locator('[data-entry-owner-hold] button').click();assert.equal(await E.page.evaluate(()=>window.heldGear.isConnected),true);
  E.page.once('dialog',d=>d.accept());await E.page.locator('[data-entry-owner-hold] button').click();await E.page.waitForFunction(()=>!window.heldGear.isConnected);
  assert.equal(await E.page.evaluate(release=>release?localStorage.getItem('cruiseStudio.project.release-sentinel'):JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot()),releaseMode),heldDraft);
 });
 await check('expired native Pro session requires formal reauthentication and retains the Project draft',async()=>{
  const id=await E.page.evaluate(()=>JSON.parse(localStorage.getItem('soundCruiseProAuth')).credential.split('.')[1]);
  await db.prepare('UPDATE pro_credentials SET last_validated_at=?,lease_expires_at=? WHERE id=?').bind(Date.now()-91*86400000,Date.now()-1,id).run();
  assert.equal(await E.page.evaluate(()=>CruiseStudio.entryAuth.check()),false);await E.page.locator('#pro-gate-input').waitFor();
  assert.equal(await E.page.evaluate(release=>release?localStorage.getItem('cruiseStudio.project.release-sentinel'):JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot()),releaseMode),heldDraft);
  await entranceCode('0007');await E.page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
 });
 if(releaseMode)await check('public artifact rejects future routes/modules/APIs and preserves previous Project bytes with no Project backend',async()=>{
  for(const id of ['sheetCruise','preDtm','practice','gear','news'])assert.equal(await E.page.evaluate(id=>CruiseStudio.shellHost.navigate(id),id),false);
  assert.deepEqual(await E.page.evaluate(()=>['model','repository','sessions','documents','identityHost','preDtm'].filter(k=>CruiseStudio[k])),[]);
  for(const path of ['development.html','js/app.js','js/core/song-model.js','js/core/project-repository.js','js/cloud/identity-host.mjs','js/cloud/studio-sync-client.mjs','js/modules/pre-dtm-cruise/pre-dtm.js'])assert.equal(await E.page.evaluate(path=>fetch('/apps/cruise-studio/'+path).then(r=>r.status),path),404,path);
  assert.equal(await E.page.evaluate(()=>localStorage.getItem('cruiseStudio.project.release-sentinel')),'preserved');
  assert.equal((await db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'studio_%'").all()).results.length,0);
 });
 const A=await profile('Port-A');await bootstrapPro(A);let account;
 await check('native Account and device-bound Pro authentication through existing libraries',async()=>{account=await createAccount(A);assert(account.accountId);});
 const B=await profile('Studio-B');await bootstrapPro(B);
 const second=createAccountCredential(),row=await db.prepare('SELECT * FROM sync_account_devices WHERE id=?').bind(account.accountDeviceId).first();
 const newRow={...row,id:second.deviceId,credential_verifier:await accountCredentialVerifier(second.credential,pepper)};const ks=Object.keys(newRow);await db.prepare(`INSERT INTO sync_account_devices (${ks.join(',')}) VALUES (${ks.map(()=>'?').join(',')})`).bind(...Object.values(newRow)).run();
 await B.page.evaluate(value=>SoundCruiseSyncAccount.storage.setAccount(value),{...account,accountDeviceId:second.deviceId,accountCredential:second.credential});
 let pa,pb;
 await check('real Port Pro boot and real Studio to canonical Port Pro boot with native gates intact',async()=>{pa=await port(A,false);pb=await port(B,true);await ready(pa);await ready(pb);assert(pb.url().includes('/cruise-port/pro_'));assert.equal(await pb.evaluate(()=>document.querySelector('#pro-gate-overlay')===null),true);});
 await check('real Sync Center attribution and existing runtime bootstrap on both profiles',async()=>{await consent(pa);await consent(pb);assert.notEqual(A.context,B.context);});
 await check('real Port Gear UI save -> Cloud push -> Studio frame pull',async()=>{
  await go(pa,'#wishlist');await pa.locator('#gear-list-title-add').click();await pa.locator('#gear-name').fill('Synthetic Port guitar');await pa.locator('#gear-category').selectOption('guitar');await pa.locator('#gear-status').selectOption('owned');await pa.locator('#gear-list-form button[type=submit]').click();await pa.locator('.gear-card',{hasText:'Synthetic Port guitar'}).waitFor();await sync(pa);await sync(pb);assert(await readStable(pb,()=>localStorage.getItem('cruisePort.gearList').includes('Synthetic Port guitar')));
 });
 await check('Studio actual Gear form edits Cloud data and Port receives the edit',async()=>{
  await go(pb,'#wishlist');await pb.locator('.gear-card',{hasText:'Synthetic Port guitar'}).click();await pb.locator('#gear-name').fill('Studio edited guitar');await pb.locator('#gear-list-form button[type=submit]').click();await pb.locator('.gear-card',{hasText:'Studio edited guitar'}).waitFor();await sync(pb);await sync(pa);assert(await readStable(pa,()=>localStorage.getItem('cruisePort.gearList').includes('Studio edited guitar')));
 });
 for(const [label,frame] of [['standalone Pro',pa],['Studio iframe',pb]])await check('completed '+label+' connection auto resumes on cold product boot without bootstrap or button',async()=>{
  const productPage=frame.page?.()||frame;
  await productPage.setViewportSize({width:label==='standalone Pro'?390:1280,height:900});
  await sync(frame);
  // Reproduce the phone: six old history intents, no corresponding live record,
  // no pending operation, then an ordinary successful manual Sync.
  const retainedIntents=await frame.evaluate(()=>{const k='cruisePort.syncDeletionIntent.v1',j=JSON.parse(localStorage.getItem(k)||'{}');for(let i=0;i<6;i++)j['practice_history_event/inert-never-sent-'+i]={generation:'synthetic-old-delete'};const raw=JSON.stringify(j);localStorage.setItem(k,raw);return raw;});
  await sync(frame);assert.equal(await readStable(frame,()=>localStorage.getItem('cruisePort.syncDeletionIntent.v1')),retainedIntents);
  const credential=await frame.evaluate(()=>SoundCruiseMultiAppSync.runtimes.port.store.readMeta('credential')),before=network.length;
  const profileLabel=label==='standalone Pro'?'Port-A':'Studio-B';
  let release,entered;const arrived=new Promise(r=>entered=r),wait=new Promise(r=>release=r);holds.set(profileLabel,{wait,enter:entered,reads:0});
  const u=new URL(frame.url());u.searchParams.set('autoResume','1');u.hash='sync-center';
  try{
   await frame.goto(u.href);await ready(frame);await arrived;
   await frame.locator('#sync-center-account-status[data-sync-account-state=active]').waitFor();
   await frame.locator('#sync-center-port-status-chip[data-sync-port-status=checking]').waitFor();
   assert.equal(await frame.locator('#port-sync-activate').isVisible(),false);
   assert.equal(await frame.locator('#sync-center-port-conflicts-open').isVisible(),false);
   assert.equal(await frame.locator('#sync-center-port-status-detail').textContent(),'');
   assert.equal(await frame.locator('#sync-center-alert').isVisible(),false);
   await frame.locator('#sync-center-account-display-id').evaluateAll(es=>es.forEach(e=>e.style.visibility='hidden'));
   await productPage.locator('[data-account-target]').evaluateAll(es=>es.forEach(e=>e.style.visibility='hidden'));
   await productPage.screenshot({path:OUT+(label==='standalone Pro'?'/checking-phone.png':'/checking-studio.png')});
  }finally{holds.delete(profileLabel);release();}
  try{await frame.waitForFunction(async()=>{const r=SoundCruiseMultiAppSync?.runtimes?.port;return r&&!r.disposed&&await r.store.readMeta('runtimeState')==='ready';});}catch(error){
   result.autoResumeProof=await frame.evaluate(async()=>{const a=await SoundCruiseSyncAccount.storage.getAccount(),store=SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:a.accountId});const meta=Object.fromEntries(await Promise.all(['membership','migrationState','datasetState','lastSyncAt','legacyInspected','pendingProvision','runtimeState'].map(async k=>[k,await store.readMeta(k)])));meta.membership=meta.membership?.state;meta.pendingProvision=!!meta.pendingProvision;const local=await new SoundCruisePortSync.PortSyncAdapter().serializeRecords(new SoundCruisePortSync.PortSyncAdapter().readLocalSnapshot()),shadow=await store.listShadow(),outbox=await store.listOutbox();return{meta,localCount:local.length,shadowCount:shadow.length,outboxCount:outbox.length,mismatchedTypes:local.filter(r=>![...shadow,...outbox].some(s=>s.recordType===r.recordType&&s.recordId===r.recordId&&s.payloadHash===r.payloadHash)).map(r=>r.recordType),runtime:!!SoundCruiseMultiAppSync.runtimes?.port};});throw error;
  }
  await frame.locator('#sync-center-port-status-chip[data-sync-port-status=synced]').waitFor();
  assert.equal(await frame.locator('#port-sync-activate').isHidden(),true);
  assert.equal(await readStable(frame,()=>localStorage.getItem('cruisePort.syncDeletionIntent.v1')),retainedIntents);
  assert.equal(await frame.evaluate(()=>SoundCruiseMultiAppSync.runtimes.port.store.readMeta('credential')),credential);
  assert(!network.slice(before).some(q=>q.path==='/v1/sync/bootstrap'||q.path==='/v2/accounts/port-device'));
  await frame.locator('#sync-center-account-display-id').evaluateAll(es=>es.forEach(e=>e.style.visibility='hidden'));
  await productPage.locator('[data-account-target]').evaluateAll(es=>es.forEach(e=>e.style.visibility='hidden'));
  await productPage.screenshot({path:OUT+(label==='standalone Pro'?'/auto-phone-width.png':'/auto-studio.png')});
  await productPage.setViewportSize({width:1280,height:720});
 });
 for(const status of [429,503])await check('native automatic Device confirmation exits checking on HTTP '+status+' and recovers without bootstrap',async()=>{
  const raw=await pa.evaluate(()=>localStorage.getItem('cruisePort.gearList'));const before=network.length;
  httpFailures.set('Port-A',status);
  try{
   const u=new URL(pa.url());u.searchParams.set('failed-check',String(status));u.hash='sync-center';await pa.goto(u.href);await ready(pa);
   await pa.locator('#sync-center-port-status-chip[data-sync-port-status=attention]').waitFor();
   await pa.locator('#port-sync-activate:not([hidden])').waitFor();
   assert.match(await pa.locator('#sync-center-port-status-detail').textContent(),status===429?/混み合っています/:/通信を完了できません/);
   assert.equal(await pa.evaluate(()=>localStorage.getItem('cruisePort.gearList')),raw);
   if(status===503)await pa.screenshot({path:OUT+'/device-error-phone.png'});
  }finally{httpFailures.delete('Port-A');}
  await pa.reload();await ready(pa);await pa.locator('#sync-center-port-status-chip[data-sync-port-status=synced]').waitFor();
  assert(!network.slice(before).some(q=>q.path==='/v1/sync/bootstrap'||q.path==='/v2/accounts/port-device'));
 });
 await check('PWA-style pagehide/pageshow and offline-online automatically resume the established native owner',async()=>{
  await A.context.setOffline(true);await pa.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  await pa.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  assert.equal(await pa.evaluate(()=>{const r=SoundCruiseMultiAppSync.runtimes?.port;return !r||r.disposed;}),true);
  await A.context.setOffline(false);await pa.waitForFunction(()=>{const r=SoundCruiseMultiAppSync?.runtimes?.port;return r&&!r.disposed&&r.store.readMeta('runtimeState').then(s=>s==='ready');});
  await pa.locator('#sync-center-port-status-chip[data-sync-port-status=synced]').waitFor();
 });
 await check('a previously completed B connection cannot auto adopt A local edits after Account switch and reload',async()=>{
  const P=await profile('Auto-ownership');await bootstrapPro(P);const b=await createAccount(P);await port(P,false);await ready(P.page);await consent(P.page);await sync(P.page);
  await createAccount(P);await consent(P.page);await normalGear(P.page,'Keep Account A local');await sync(P.page);
  const raw=await P.page.evaluate(()=>localStorage.getItem('cruisePort.gearList'));
  await P.page.evaluate(a=>SoundCruiseSyncAccount.storage.setAccount(a),b);const before=network.length;
  await P.page.goto('https://studio.fixture.invalid/apps/cruise-port/pro_9a3943176561/?ownershipReturn=1#sync-center');await ready(P.page);
  await P.page.locator('#sync-center-port-status-detail').filter({hasText:'Account帰属を自動確認できません'}).waitFor();
  assert.equal(await P.page.evaluate(()=>localStorage.getItem('cruisePort.gearList')),raw);
  assert.equal(await P.page.evaluate(()=>{const r=SoundCruiseMultiAppSync.runtimes?.port;return !r||r.disposed;}),true);
  assert(!network.slice(before).some(q=>q.label==='Auto-ownership'&&(q.path.startsWith('/v1/sync/')||q.path==='/v2/accounts/port-device')));
  await P.context.close();
 });
 await check('real tuner/metronome UI and existing presets/practice/calendar/My Apps stores roundtrip',async()=>{
  await go(pa,'#tuner');await pa.locator('#tuner-capo-up').click();
  await go(pa,'#metronome');await pa.locator('#metronome-bpm').fill('157');await pa.locator('#metronome-bpm').press('Tab');
  const values=await pa.evaluate(async()=>{
   const menu=await import('/apps/cruise-port/practice-menu-store.js?v=1.24.24'),apps=await import('/apps/cruise-port/my-apps-store.js?v=1.24.24'),cal=await import('/apps/cruise-port/practice-menu-calendar-store.js?v=1.24.24'),presets=await import('/apps/cruise-port/metronome-presets-store.js?v=1.24.24'),metro=await import('/apps/cruise-port/metronome-store.js?v=1.24.24');
   const old=menu.loadPracticeMenus(),item=menu.createPracticeMenu({name:'Synthetic practice',durationMinutes:5,appId:null,memo:'fixture'},old.items);const m=await menu.savePracticeMenus([...old.items,item]);
   const a=apps.loadMyApps(),created=apps.createMyApp({name:'Synthetic My App',url:'https://example.invalid/'},a.items);if(!created.ok)throw Error(created.reason);const ar=await apps.saveMyApps([...a.items,created.item]);
   const c=cal.loadPracticeCalendar(),note=cal.createPracticeCalendarNote(c.calendar,{localDate:'2026-10-31',text:'Synthetic calendar'});if(!note.ok)throw Error(note.reason);const cr=await cal.savePracticeCalendar(note.calendar);
   const current=metro.loadMetronomeSettings().settings,pr=presets.loadMetronomePresets();const preset={...current,id:crypto.randomUUID(),name:'Synthetic preset',createdAt:Date.now(),updatedAt:Date.now()};const sr=await presets.saveMetronomePresets([...pr.presets,preset]);
   return{ok:[m.ok,ar.ok,cr.ok,sr.ok],practiceId:item.id};
  });assert.deepEqual(values.ok,[true,true,true,true]);globalThis.practiceId=values.practiceId;
  await sync(pa);await sync(pb);const data=await readStable(pb,()=>({practice:localStorage.getItem('cruisePort.practiceMenus'),apps:localStorage.getItem('cruisePort.myApps'),calendar:localStorage.getItem('cruisePort.practiceCalendar'),preset:localStorage.getItem('cruisePort.metronomePresets'),tuner:JSON.parse(localStorage.getItem('cruisePort.tuner')),metro:JSON.parse(localStorage.getItem('cruisePort.metronome'))}));
  assert(data.practice.includes('Synthetic practice'));assert(data.apps.includes('Synthetic My App'));assert(data.calendar.includes('Synthetic calendar'));assert(data.preset.includes('Synthetic preset'));assert.equal(data.metro.bpm,157);assert.equal(data.tuner.capo,1);
 });
 await check('latest UI My Apps focus is preserved with native Port and one Sync runtime',async()=>{
  await B.page.locator('[data-workspace=portMyApps]').click();let my=await(await B.page.locator('#port-my-apps-surface iframe').elementHandle()).contentFrame();await ready(my);await my.locator('#my-apps-section').waitFor({state:'visible'});assert.equal(await my.locator('[data-home-section=tools]').isVisible(),false);assert.equal(await my.locator('[data-home-section=cruiseApps]').isVisible(),false);if(process.env.STUDIO_NATIVE_ROOT){await consent(my);await my.evaluate(()=>location.hash='');}await my.waitForFunction(()=>!!SoundCruiseMultiAppSync?.runtimes?.port&&!SoundCruiseMultiAppSync.runtimes.port.disposed);assert.equal(await my.evaluate(()=>Object.keys(SoundCruiseMultiAppSync.runtimes).filter(x=>x==='port').length),1);
  await B.page.locator('[data-workspace=portGear]').click();pb=await(await B.page.locator('#port-gear-surface iframe').elementHandle()).contentFrame();await ready(pb);if(process.env.STUDIO_NATIVE_ROOT){await consent(pb);await go(pb,'#wishlist');}await pb.waitForFunction(()=>!!SoundCruiseMultiAppSync?.runtimes?.port&&!SoundCruiseMultiAppSync.runtimes.port.disposed);
 });
 await check('actual Gear photo workflow uploads source/final and Studio hydrates bytes through Asset Sync',async()=>{
  await go(pa,'#wishlist');await pa.locator('.gear-card',{hasText:'Studio edited guitar'}).click();
  await pa.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;const ctx=canvas.getContext('2d'),image=ctx.createImageData(1024,1024);for(let i=0;i<image.data.length;i+=4){image.data[i]=(i*31)%251;image.data[i+1]=(i*17)%239;image.data[i+2]=(i*7)%233;image.data[i+3]=255;}ctx.putImageData(image,0,0);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const transfer=new DataTransfer();transfer.items.add(new File([blob],'synthetic.png',{type:'image/png'}));const input=document.getElementById('gear-photo-input');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));});
  await pa.locator('#gear-photo-crop-dialog').waitFor({state:'visible'});await pa.locator('#gear-photo-crop-confirm').click();await pa.locator('#gear-photo-crop-dialog').waitFor({state:'hidden'});await pa.locator('#gear-list-form button[type=submit]').click();
  await pa.waitForFunction(()=>{const m=JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')||'{}');return Object.values(m.gear||{}).some(e=>e.published?.final?.assetId&&e.published?.source?.assetId);},{},{timeout:30000});
  await sync(pa);await sync(pb);await nativeRuntime(pb);await pb.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.gearList')).items.some(i=>i.photoId&&i.photoSourceId),{},{timeout:30000});
  const read=async frame=>readStable(frame,async()=>{const {createGearPhotoStore}=await import('/apps/cruise-port/gear-photo-store.js?v=1.24.24'),store=createGearPhotoStore(),item=JSON.parse(localStorage.getItem('cruisePort.gearList')).items.find(i=>i.photoId);return Promise.all([item.photoId,item.photoSourceId].map(async id=>{const r=await store.getPhoto(id);if(!r.record)throw Error('binary missing');const b=new Uint8Array(await crypto.subtle.digest('SHA-256',await r.record.blob.arrayBuffer()));return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');}));});
  assert.deepEqual(await read(pa),await read(pb));
  result.binaryInspection=await readStable(pa,async()=>{const start=performance.now();const adapter=new SoundCruisePortSync.PortSyncAdapter();await (typeof adapter.inspectLocalAccount==='function'?adapter.inspectLocalAccount():adapter.readLocalSnapshot());return{milliseconds:performance.now()-start};});
 });
 await check('existing Practice attachment Asset Sync stores and hydrates real binary',async()=>{
  await pa.evaluate(async id=>{const {createPracticeAttachmentStore}=await import('/apps/cruise-port/practice-menu-attachment-store.js?v=1.24.24');const r=await createPracticeAttachmentStore().addAttachment(id,new Blob(['synthetic attachment bytes'],{type:'text/plain'}),{fileName:'synthetic.txt'});if(!r.ok)throw Error(r.reason);window.dispatchEvent(new Event('cruise-port-local-data-changed'));},globalThis.practiceId);
  await pa.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')||'{}').attachments||{}).some(e=>e.published?.asset?.assetId),{},{timeout:30000});await sync(pa);await sync(pb);
  const remote=await readStable(pb,()=>JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')).attachments);assert(Object.values(remote).some(e=>e.published?.asset?.hash));
  await B.page.locator('[data-workspace=portPractice]').click();pb=await (await B.page.locator('#port-practice-surface iframe').elementHandle()).contentFrame();await ready(pb);if(process.env.STUDIO_NATIVE_ROOT){await consent(pb);await pb.locator('#sync-center-back').click();}await pb.waitForFunction(()=>!!SoundCruiseMultiAppSync?.runtimes?.port&&!SoundCruiseMultiAppSync.runtimes.port.disposed);await pb.locator('[data-practice-id="'+globalThis.practiceId+'"] .practice-card-link').click();await pb.locator('[data-attachment-action=open]').click();
  await pb.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')).attachments).some(e=>e.binding?.localId));
  const bytes=await readStable(pb,async()=>{const {createPracticeAttachmentStore}=await import('/apps/cruise-port/practice-menu-attachment-store.js?v=1.24.24');const r=await createPracticeAttachmentStore().getAllAttachments();return Promise.all(r.records.map(x=>x.blob.text()));});assert(bytes.includes('synthetic attachment bytes'));

 });
 await check('offline edit is retained and reconciles through existing Sync after reconnect',async()=>{
  await A.context.setOffline(true);await go(pa,'#wishlist');await pa.locator('.gear-card',{hasText:'Studio edited guitar'}).click();await pa.locator('#gear-name').fill('Offline guitar');await pa.locator('#gear-list-form button[type=submit]').click();await pa.locator('.gear-card',{hasText:'Offline guitar'}).waitFor();assert(await readStable(pa,()=>localStorage.getItem('cruisePort.gearList').includes('Offline guitar')));await A.context.setOffline(false);await sync(pa);await sync(pb);await pb.waitForFunction(()=>localStorage.getItem('cruisePort.gearList').includes('Offline guitar'),{},{timeout:20000});
 });
 await check('real shared Studio Identity enrolment and Project UNKNOWN survive Account isolation',async()=>{
  const page=B.page;await page.locator('[data-workspace=home]').click();await page.locator('[data-identity-action=connect]').click();await page.waitForFunction(()=>!document.querySelector('[data-identity-action=connect]').disabled);const status=await page.locator('[data-identity-status]').innerText();assert(!status.includes('操作を停止'),status);
  const id=await page.evaluate(async()=>{const C=CruiseStudio,p=C.model.createSampleProject();p.projectId=crypto.randomUUID();const r=await C.repository.save({target:{type:'project',projectId:p.projectId},baseRevision:null,snapshot:p});if(!r.ok)throw Error(r.error);return p.projectId;});
  await page.locator('[data-identity-field=project]').fill(id);faults.set(B.label,{path:'/v2/studio/document',kind:'commit'});await page.locator('[data-cloud-action=save]').click();await page.waitForFunction(()=>!document.querySelector('[data-cloud-action=save]').disabled);await page.waitForFunction(()=>Array.from(document.querySelectorAll('select[aria-label="未送信・復旧操作"] option')).some(x=>x.textContent.startsWith('結果不明')),{},{timeout:5000});
  result.projectUnknown={projectId:id,retained:await page.evaluate(id=>CruiseStudio.repository.read({type:'project',projectId:id}).exists,id)};assert(result.projectUnknown.retained);const committed=await db.prepare('SELECT revision FROM studio_document_records WHERE record_id=?').bind(id).first();assert.equal(committed.revision,1);result.projectUnknown.remoteCommitted=true;
 });
 const foreign=await profile('Foreign Account',false),foreignAccount=await createAccount(foreign);
 await check('Account A-B-A rejects the old standalone form, keeps A pending/images/attachments and resumes A',async()=>{
  await A.context.setOffline(true);await go(pa,'#wishlist');await pa.locator('.gear-card',{hasText:'Offline guitar'}).click();await pa.locator('#gear-name').fill('A pending guitar');await pa.locator('#gear-list-form button[type=submit]').click();await pa.locator('.gear-card',{hasText:'A pending guitar'}).waitFor();
  // Prepare a genuine A diff through the unchanged runtime, without sending it.
  await pa.evaluate(async()=>{const r=SoundCruiseMultiAppSync.runtimes.port;await r.runExclusive(async scoped=>{const local=await scoped.localRecords(),shadow=await scoped.store.listShadow();await scoped.queueDiff(local.records,shadow,shadow);});});
  await pa.locator('.gear-card',{hasText:'A pending guitar'}).click();await pa.locator('#gear-name').fill('Offline guitar');
  await pa.evaluate(async()=>{const c=document.createElement('canvas');c.width=c.height=512;c.getContext('2d').fillRect(0,0,512,512);const blob=await new Promise(r=>c.toBlob(r,'image/png')),d=new DataTransfer();d.items.add(new File([blob],'account-draft.png',{type:'image/png'}));const input=document.getElementById('gear-photo-input');input.files=d.files;input.dispatchEvent(new Event('change',{bubbles:true}));});await pa.locator('#gear-photo-crop-dialog').waitFor({state:'visible'});await pa.locator('#gear-photo-crop-confirm').click();await pa.locator('#gear-photo-crop-dialog').waitFor({state:'hidden'});
  const before=await pa.evaluate(async id=>({gear:localStorage.getItem('cruisePort.gearList'),assets:localStorage.getItem('cruisePort.syncAssetMetadata'),outbox:await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:id}).listOutbox(),preview:await (async()=>{const url=document.querySelector('#gear-photo-preview img')?.src;if(!url)return null;const bytes=await(await fetch(url)).arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');})()}),account.accountId);assert(before.outbox.some(o=>o.recordType==='gear_item'));
  await pa.evaluate(value=>SoundCruiseSyncAccount.storage.setAccount(value),foreignAccount);
  await pa.locator('#gear-list-form button[type=submit]').click();await pa.locator('#gear-form-error:not([hidden])').waitFor();
  assert.equal(await readStable(pa,()=>localStorage.getItem('cruisePort.gearList')),before.gear);assert.equal(await pa.locator('#gear-name').inputValue(),'Offline guitar');
  assert.equal(await readStable(pa,()=>localStorage.getItem('cruisePort.syncAssetMetadata')),before.assets);assert.equal(await previewHash(pa),before.preview);
  const isolated=await pa.evaluate(async({a,b})=>({old:await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:a}).listOutbox(),next:await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:b}).listOutbox(),runtime:!!SoundCruiseMultiAppSync.runtimes.port}),{a:account.accountId,b:foreignAccount.accountId});assert.deepEqual(isolated.old,before.outbox);assert.deepEqual(isolated.next,[]);assert.equal(isolated.runtime,false);
  await pa.evaluate(value=>SoundCruiseSyncAccount.storage.setAccount(value),account);await pa.locator('#gear-list-form button[type=submit]').click();await pa.locator('.gear-card',{hasText:'Offline guitar'}).waitFor();
  await A.context.setOffline(false);await nativeRuntime(pa);await sync(pa);
  // The next independent form test must not race this case's photo hydration.
  await go(pa,'#sync-center');await pa.locator('#sync-center-port-status-chip[data-sync-port-status=synced]').waitFor();
  result.accountSwitch={oldFormRejected:true,pendingAUnchangedUnderB:true,outboxBEmpty:true,previewAndAssetMetadataRetained:true,sameAccountResume:true};
 });
 await check('Studio retained Port form independently rejects another Account and resumes the original Device',async()=>{
  await B.page.locator('[data-workspace=portGear]').click();pb=await(await B.page.locator('#port-gear-surface iframe').elementHandle()).contentFrame();await ready(pb);await sync(pb);await go(pb,'#sync-center');await pb.locator('#sync-center-port-status-chip[data-sync-port-status=synced]').waitFor();await go(pb,'#wishlist');await pb.locator('.gear-card').first().click();await pb.locator('#gear-name').fill('Studio A draft');
  const original=await B.page.evaluate(()=>SoundCruiseSyncAccount.storage.getAccount()),before=await readStable(pb,()=>localStorage.getItem('cruisePort.gearList')),frameElement=await B.page.locator('#port-gear-surface iframe').elementHandle();
  await B.page.evaluate(value=>SoundCruiseSyncAccount.storage.setAccount(value),foreignAccount);await B.page.waitForFunction(()=>CruiseStudio.entryAuth.read().accountId!==null&&CruiseStudio.entryAuth.read().accountId!==undefined);await B.page.evaluate(()=>CruiseStudio.entryAuth.check());
  assert.equal(await frameElement.evaluate(e=>e.inert),true);
  // Exercise the repository even if an obsolete script invokes submit behind inert.
  await pb.evaluate(()=>document.querySelector('#gear-list-form').requestSubmit());await pb.locator('#gear-form-error:not([hidden])').waitFor();assert.equal(await readStable(pb,()=>localStorage.getItem('cruisePort.gearList')),before);assert.equal(await pb.locator('#gear-name').inputValue(),'Studio A draft');
  await B.page.evaluate(value=>SoundCruiseSyncAccount.storage.setAccount(value),original);await B.page.evaluate(()=>CruiseStudio.entryAuth.check());await frameElement.waitForElementState('stable');await B.page.waitForFunction(id=>CruiseStudio.entryAuth.isAuthorized()&&CruiseStudio.entryAuth.read().accountId===id&&!document.querySelector('#port-gear-surface iframe').inert,original.accountId);await pb.locator('#gear-list-form button[type=submit]').click();await pb.waitForFunction(()=>Array.from(document.querySelectorAll('.gear-card')).some(e=>e.textContent.includes('Studio A draft'))||!document.getElementById('gear-form-error').hidden);assert.equal(await pb.locator('#gear-form-error').isVisible(),false,'the requalified original Account must save its retained form');await pb.locator('.gear-card',{hasText:'Studio A draft'}).waitFor();
 });
 await check('native Port App Device revocation rejects subsequent Sync and retains local bytes',async()=>{
  const credential=await pa.evaluate(()=>SoundCruiseMultiAppSync.runtimes.port.store.readMeta('credential')),before=await readStable(pa,()=>localStorage.getItem('cruisePort.gearList'));
  await db.prepare('UPDATE sync_devices SET revoked_at=? WHERE id=?').bind(Date.now(),credential.split('.')[1]).run();
  const code=await pa.evaluate(async()=>{try{await SoundCruiseMultiAppSync.runtimes.port.sync('explicit-device-revoked');return 'unexpected';}catch(e){return e.code||e.message;}});assert.match(code,/revoked|invalid_credential/);assert.equal(await readStable(pa,()=>localStorage.getItem('cruisePort.gearList')),before);
 });
 await check('a fresh B document permits normal B editing without inheriting the old A runtime or Outbox',async()=>{
  await pa.evaluate(value=>SoundCruiseSyncAccount.storage.setAccount(value),foreignAccount);
  const fresh=await A.context.newPage();fresh.setDefaultTimeout(20000);fresh.on('dialog',async d=>{(result.freshDialogs??=[]).push(d.type());await d.accept();});await fresh.goto('https://studio.fixture.invalid/apps/cruise-port/pro_9a3943176561/#wishlist');await ready(fresh);await go(fresh,'#wishlist');await fresh.locator('#gear-list-title-add').click();await fresh.locator('#gear-name').fill('B fresh document');await fresh.locator('#gear-category').selectOption('guitar');await fresh.locator('#gear-status').selectOption('owned');await fresh.locator('#gear-list-form button[type=submit]').click();await fresh.locator('.gear-card',{hasText:'B fresh document'}).waitFor();
  assert.equal(await fresh.evaluate(()=>!!SoundCruiseMultiAppSync.runtimes?.port),false);assert.deepEqual(await fresh.evaluate(async id=>SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:id}).listOutbox(),foreignAccount.accountId),[]);// Category, My Apps and Practice also use the same repository guard.
  await fresh.evaluate(()=>{const repo=SoundCruisePortSync.portRepository(),capture=repo.captureAccountContext.bind(repo);repo.captureAccountContext=(...args)=>{const p=capture(...args);window.fixtureFormAccount=p;return p;};});await fresh.locator('#gear-category-menu-toggle').click();await fresh.locator('#gear-category-add').click();await fresh.locator('#gear-category-name').fill('B category');const categories=await fresh.evaluate(()=>localStorage.getItem('cruisePort.gearCategories'));assert.equal(await fresh.evaluate(async()=>(await fixtureFormAccount).unavailable===true),false,'native form Account capture completes before switching Accounts');await fresh.evaluate(a=>SoundCruiseSyncAccount.storage.setAccount(a),account);await fresh.locator('#gear-category-form button[type=submit]').click();await fresh.locator('#gear-category-error:not([hidden])').waitFor();assert.equal(await fresh.evaluate(()=>localStorage.getItem('cruisePort.gearCategories')),categories);assert.equal(await fresh.locator('#gear-category-name').inputValue(),'B category');await fresh.evaluate(a=>SoundCruiseSyncAccount.storage.setAccount(a),foreignAccount);await fresh.locator('#gear-category-form button[type=submit]').click();await fresh.locator('#gear-category-dialog').waitFor({state:'hidden'});
  await go(fresh,'#my-apps/new');await fresh.locator('#my-apps-name').fill('B registered app');await fresh.locator('#my-apps-other-urls').evaluate(e=>e.open=true);await fresh.locator('#my-apps-web-url').fill('https://example.invalid/');const apps=await fresh.evaluate(()=>localStorage.getItem('cruisePort.myApps'));assert.equal(await fresh.evaluate(async()=>(await fixtureFormAccount).unavailable===true),false);await fresh.evaluate(a=>SoundCruiseSyncAccount.storage.setAccount(a),account);await fresh.locator('#my-apps-submit').click();await fresh.locator('#my-apps-form-error:not([hidden])').waitFor();assert.equal(await fresh.evaluate(()=>localStorage.getItem('cruisePort.myApps')),apps);assert.equal(await fresh.locator('#my-apps-name').inputValue(),'B registered app');await fresh.evaluate(a=>SoundCruiseSyncAccount.storage.setAccount(a),foreignAccount);await fresh.locator('#my-apps-submit').click();await fresh.waitForFunction(()=>localStorage.getItem('cruisePort.myApps')?.includes('B registered app'));await fresh.locator('#my-apps-form-view').waitFor({state:'hidden'});
  await go(fresh,'#practice-menu');await fresh.locator('#practice-menu-add').click();await fresh.locator('#practice-name-preset').selectOption('custom');await fresh.locator('#practice-name').fill('B practice with draft file');await fresh.locator('#practice-duration').fill('5');await fresh.locator('#practice-form-attachment-input').setInputFiles({name:'account-draft.txt',mimeType:'text/plain',buffer:Buffer.from('preserved draft attachment')});const menus=await fresh.evaluate(()=>localStorage.getItem('cruisePort.practiceMenus'));assert.equal(await fresh.evaluate(async()=>(await fixtureFormAccount).unavailable===true),false);await fresh.evaluate(a=>SoundCruiseSyncAccount.storage.setAccount(a),account);await fresh.locator('#practice-menu-form button[type=submit]').click();await fresh.locator('#practice-form-error:not([hidden])').waitFor();assert.equal(await fresh.evaluate(()=>localStorage.getItem('cruisePort.practiceMenus')),menus);assert.equal(await fresh.locator('#practice-name').inputValue(),'B practice with draft file');assert(await fresh.locator('#practice-form-view').innerText().then(t=>t.includes('account-draft.txt')));await fresh.evaluate(a=>SoundCruiseSyncAccount.storage.setAccount(a),foreignAccount);await fresh.locator('#practice-menu-form button[type=submit]').click();await fresh.waitForFunction(()=>localStorage.getItem('cruisePort.practiceMenus')?.includes('B practice with draft file'));await fresh.locator('#practice-form-view').waitFor({state:'hidden'});
  const menuId=await fresh.evaluate(()=>JSON.parse(localStorage.getItem('cruisePort.practiceMenus')).items.find(i=>i.name==='B practice with draft file').id);await go(fresh,'#practice-menu/'+menuId);await fresh.locator('#practice-detail-view').waitFor({state:'visible'});await fresh.locator('[data-attachment-action=delete]').waitFor();assert.equal(await fresh.evaluate(async()=>(await fixtureFormAccount).unavailable===true),false);await fresh.evaluate(()=>{const repo=SoundCruisePortSync.portRepository(),run=repo.runWrite.bind(repo);repo.runWrite=(...args)=>run(...args).then(result=>{window.fixtureAttachmentAdmission=result.reason||result.status;return result;});});await fresh.evaluate(a=>SoundCruiseSyncAccount.storage.setAccount(a),account);await fresh.locator('[data-attachment-action=delete]').click();await fresh.waitForFunction(()=>globalThis.fixtureAttachmentAdmission==='account-changed');assert(await fresh.locator('[data-attachment-action=delete]').isVisible());await fresh.evaluate(a=>SoundCruiseSyncAccount.storage.setAccount(a),foreignAccount);await fresh.locator('[data-attachment-action=delete]').click();await fresh.locator('[data-attachment-action=delete]').waitFor({state:'hidden'});
  assert.deepEqual(await fresh.evaluate(async id=>SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:id}).listOutbox(),foreignAccount.accountId),[]);
  await fresh.close();
 });
 await check('shared Account change recreates Project client without sending A UNKNOWN under B',async()=>{
  const page=B.page,unknown=result.projectUnknown.projectId;
  const management=await B.context.newPage();await management.goto('https://studio.fixture.invalid/bootstrap');const newAccount=await createAccount({...B,page:management});await management.close();assert.notEqual(newAccount.accountId,account.accountId);const start=network.length;
  await page.locator('[data-identity-action=connect]').click();await page.waitForFunction(()=>!document.querySelector('[data-identity-action=connect]').disabled);
  await page.locator('[data-identity-field=project]').fill(unknown);await page.waitForTimeout(150);assert.equal(await page.locator('select[aria-label="未送信・復旧操作"] option').count(),0);assert.equal(await page.evaluate(id=>CruiseStudio.repository.read({type:'project',projectId:id}).exists,unknown),true);
  assert.equal(network.slice(start).some(x=>x.path==='/v2/studio/document'&&['begin','chunk','commit'].includes(x.kind)),false);
 });
 await check('native Pro revoke-pending disables shared Project writes without discarding UNKNOWN',async()=>{
  const start=network.length;await B.page.evaluate(()=>{const auth=JSON.parse(localStorage.getItem('soundCruiseProAuth'));localStorage.setItem('soundCruiseProRevokePending',JSON.stringify([auth.credential]));});await B.page.waitForFunction(()=>document.querySelector('[data-cloud-action=save]').disabled);assert.equal(network.slice(start).some(x=>x.path==='/v2/studio/document'&&['begin','upload','commit'].includes(x.kind)),false);assert(await B.page.evaluate(id=>CruiseStudio.repository.read({type:'project',projectId:id}).exists,result.projectUnknown.projectId));
 });
 assert.equal(errors.length,0);result.productionRequestsSent=0;
}catch(e){
 result.status='FAIL';result.failure=String(e);
 result.failureDiagnostics=[];result.entranceDiagnostics=[];
 for(const context of contexts)for(const page of context.pages())for(const frame of page.frames()){try{result.failureDiagnostics.push(await frame.evaluate(async()=>{const r=globalThis.SoundCruiseMultiAppSync?.runtimes?.port,m=JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')||'{}'),g=JSON.parse(localStorage.getItem('cruisePort.gearList')||'{"items":[]}');return{runtime:!!r,route:location.hash,attachmentStatus:document.querySelector('#practice-attachment-status')?.textContent,photos:g.items.map(i=>({final:!!i.photoId,source:!!i.photoSourceId,crop:!!i.photoCrop})),metadata:Object.values(m.gear||{}).map(e=>({published:!!e.published,pending:!!e.pending,final:!!e.binding?.final?.localId,source:!!e.binding?.source?.localId})),outbox:r?(await r.store.listOutbox()).map(o=>({recordType:o.recordType,error:o.terminalError,conflict:o.conflict})):null,conflicts:r?(await r.store.listConflicts()).map(c=>({kind:c.kind,recordType:c.localRecord?.recordType||c.remoteRecord?.recordType})):null};}));}catch{}}

 for(const context of contexts)for(const page of context.pages()){try{result.entranceDiagnostics.push(await page.evaluate(()=>({url:location.pathname,entry:globalThis.CruiseStudio?.entryAuth?.read(),locked:document.body.classList.contains('pro-gate-active'),gateError:document.getElementById('pro-gate-error')?.textContent,accountMessage:document.querySelector('#studio-entry-account p')?.textContent,sourceRevoked:globalThis.SoundCruiseProOperationSource?.read()?.revoked})));}catch{}}
 for(const context of contexts)for(const page of context.pages())for(const frame of page.frames()){
  if(!frame.url().includes('/apps/cruise-port/pro_'))continue;
  try{result.failureDiagnostics.push(await frame.evaluate(async()=>{
   const {createPortWriterContext}=await import('/apps/cruise-port/port-writer-context.mjs?v=1.23.1');
   const c=createPortWriterContext({root:window,storage:localStorage});await c.initialized;let admission='accepted';try{c.assertCurrent();}catch(error){admission=error.code||error.message;}
   return {route:location.hash,admission,ready:document.documentElement.dataset.portWriterReady,sharedAccountPresent:!!SoundCruiseSyncAccount?.storage,status:document.querySelector('[data-port-local-account] [role=status]')?.textContent};
  }));}catch{}
 }
 throw e;
}finally{result.status||='PASS';fs.writeFileSync(OUT+'/PRODUCT-E2E-RESULT.json',JSON.stringify(result,null,2));for(const c of contexts)await Promise.race([c.close(),new Promise(r=>setTimeout(r,3000))]);await browser?.close();await mf?.dispose();}
