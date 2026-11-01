import {releaseMode,studioPage,workerWithoutProject,removeProjectFixture,fixtureFile} from './fixtures/port-pc-profile.mjs';
// Real Port Pro and Studio entry, separate Chrome profiles; local native D1/R2 only.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {randomUUID,createHash} from 'node:crypto';
const require=createRequire(process.env.STUDIO_TEST_RUNTIME),{chromium}=require('playwright'),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{build,stop:stopBuildService}=require('esbuild');
const W=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),OUT=process.env.STUDIO_CLIENT_OUTPUT;assert(OUT);
const src=(process.env.STUDIO_WORKER_ROOT||W)+'/workers/sound-cruise-sync/src',pepper='synthetic-account-key-not-production-key-0000',proPepper='synthetic-pro-key-not-production-key-000000';
const {createAccountCredential,accountCredentialVerifier}=await import(src+'/account-crypto.js');
const old=fs.readFileSync(W+'/apps/cruise-studio/tests/identity-cloud.browser.mjs','utf8');
const literal=old.slice(old.indexOf('const entry=`')+'const entry='.length,old.indexOf(';'+String.fromCharCode(10)+'fs.writeFileSync'));
let entry=Function('src','W','return '+literal)(src,W);
entry="import legacy from '"+src+"/index.js';"+entry;
entry=entry.replace("legacy:{fetch:()=>new Response(null,{status:404}),scheduled:()=>null}","legacy");
entry=entry.replace("SYNC_ACCOUNT_PUBLIC_APP_IDS:'chord,pitch,fretboard,rhythm'", "SYNC_ACCOUNT_PUBLIC_APP_IDS:'chord,pitch,fretboard,rhythm,port',SYNC_ALLOWED_APP_IDS:'chord,pitch,fretboard,rhythm,port',SYNC_ASSET_WRITE_ENABLED:'true',SYNC_ASSET_DOWNLOAD_ENABLED:'true',ACCOUNT_START_RATE_LIMITER:{limit:async()=>({success:true})},ACCOUNT_API_RATE_LIMITER:{limit:async()=>({success:true})}");
entry=entry.replace("if(path.startsWith('/v2/accounts/'))","if(path==='/v2/accounts/port-device')return legacy.fetch(request,env,{});if(path.startsWith('/v2/accounts/'))");
entry=entry.replace('SYNC_DB:env.DB,','SYNC_DB:env.DB,SYNC_ASSETS:env.ASSETS,');
entry=entry.replace('const path=new URL(request.url).pathname;',`const flip=request.headers.get('X-Fixture-Pro-Flip');if(flip){const real=env.SYNC_DB;const wrap=d=>{let mutation=false;return {prepare(sql){if(sql.includes('INSERT INTO sync_records'))mutation=true;return d.prepare(sql);},getBookmark:()=>d.getBookmark?.(),async batch(ss){if(mutation){mutation=false;if(flip==='device')await real.prepare('UPDATE sync_devices SET revoked_at=1 WHERE id=?').bind(request.headers.get('Authorization').split('.')[1]).run();else if(flip==='generation')await real.prepare('UPDATE pro_auth_state SET generation=generation+1').run();else if(flip==='lease')await real.prepare('UPDATE pro_credentials SET lease_expires_at=1 WHERE id=?').bind(request.headers.get('X-Sound-Cruise-Pro-Authorization').split('.')[1]).run();}return d.batch(ss);}};};env.SYNC_DB={...wrap(real),withSession:b=>wrap(real.withSession(b))};}const path=new URL(request.url).pathname;`);
entry=workerWithoutProject(entry,src);fs.writeFileSync(OUT+'/entry.mjs',entry);await build({entryPoints:[OUT+'/entry.mjs'],bundle:true,format:'esm',platform:'browser',outfile:OUT+'/worker.mjs',logLevel:'silent'});
const tests=[],network=[],errors=[],contexts=[],navigation=[],faults=new Map(),serverFaults=new Map(),blocked=new Set();let pushBarrier=null;let mf,db,browser;
async function check(name,fn){ let timer;try{await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('check deadline: '+name)),60000);})]);}finally{clearTimeout(timer);}tests.push({name,status:'PASS'});console.log('PASS '+name);}
const result={production:false,scope:'Release 1.0 legacy outbox/retry and asset acceptance; not newer UNKNOWN/final-SQL acceptance',entry:'actual Studio index and native Port Pro index',tests,errors,network,navigation};
async function routeContext(context,label){await context.route('**/*',async route=>{
 const q=route.request(),u=new URL(q.url());
 if(u.origin==='https://studio.fixture.invalid'){
  if(u.pathname==='/bootstrap')return route.fulfill({contentType:'text/html',body:'<!doctype html><script src="/apps/shared/sync-account/sync-account-core.js"></script><script src="/apps/shared/sync-account/sync-account-db.js"></script><script src="/apps/shared/sync-account/sync-account-client.js"></script><script src="/apps/shared/pro-device-session.js"></script>'});
  let file=path.resolve(W,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(W+'/'))return route.abort();if(u.pathname.endsWith('/'))file+='/index.html';
  try{return route.fulfill({contentType:({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'),body:fixtureFile(W,u.pathname)});}catch{return route.fulfill({status:404,body:'missing'});}
 }
 if(!['sound-cruise-sync.cruise-port-requests.workers.dev','backend.fixture.invalid'].includes(u.hostname))return route.abort();
 if(blocked.has(label))return route.abort('internetdisconnected');
 let body;try{body=JSON.parse(q.postData()||'{}');}catch{}
 network.push({label,path:u.pathname,kind:body?.kind,method:q.method(),...(u.pathname==='/v1/sync/push'?{operations:body.operations?.map(o=>({operationId:o.operationId,recordType:o.recordType,recordId:o.recordId,baseRevision:o.baseRevision,wireHash:createHash('sha256').update(JSON.stringify(Object.fromEntries(['operationId','recordType','recordId','schemaVersion','baseRevision','payload','payloadHash','deleted'].map(k=>[k,o[k]])))).digest('hex')}))}: {})});
 if(pushBarrier&&u.pathname==='/v1/sync/push'&&body.operations?.some(o=>o.recordType==='gear_item')){const gate=pushBarrier;gate.arrivals.push({label,operations:body.operations});if(gate.arrivals.length===2){pushBarrier=null;gate.release();}await gate.wait;}
 const before=faults.get(label);if(before?.before&&u.pathname===before.path){faults.delete(label);before.onDrop?.(body);if(before.before==='network')return route.abort('failed');return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,code:'server_error'})});}
 const headers={...await q.allHeaders(),'CF-Connecting-IP':'192.0.2.4'};if(u.pathname==='/v1/sync/push'&&serverFaults.has(label)){const mode=serverFaults.get(label);serverFaults.delete(label);if(mode==='before')await db.prepare('UPDATE pro_credentials SET lease_expires_at=1 WHERE id=?').bind(new Headers(headers).get('X-Sound-Cruise-Pro-Authorization').split('.')[1]).run();else headers['X-Fixture-Pro-Flip']=mode;}

 const response=await mf.dispatchFetch('http://native.fixture.invalid'+u.pathname+u.search,{method:q.method(),headers,...(q.postDataBuffer()?{body:q.postDataBuffer()}: {})});
 const f=faults.get(label);if(f&&u.pathname===f.path&&(!f.kind||f.kind===body?.kind)){faults.delete(label);const data=Buffer.from(await response.arrayBuffer());f.onDrop?.({body,response:JSON.parse(data)});return route.abort('failed');}
 const data=Buffer.from(await response.arrayBuffer());if(u.pathname==='/v1/sync/snapshot'){result.snapshotProof||=[];result.snapshotProof.push({label,status:response.status,legacyNetwork:data.includes(Buffer.from('Legacy network')),legacy503:data.includes(Buffer.from('Legacy 503')),gearPhoto:data.includes(Buffer.from('gear_photo_final'))});}if(response.status>=400){let code;try{code=JSON.parse(data).code;}catch{}console.log('REFUSAL',label,u.pathname,response.status,code);}
 try{return await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:data});}catch(e){if(!/closed/i.test(String(e)))throw e;}
 });}
async function profile(label,cloud=true){const context=await chromium.launchPersistentContext(fs.mkdtempSync(OUT+'/profile-'+label+'-'),{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',serviceWorkers:'block'});contexts.push(context);await routeContext(context,label);
 if(cloud)await context.addInitScript(()=>{globalThis.__SOUND_CRUISE_STUDIO_CLOUD__={endpoint:'https://backend.fixture.invalid/v2/studio/document',turnstile:async()=> 'synthetic'};});
 context.on('requestfailed',q=>{result.failedRequests||=[];result.failedRequests.push({label,path:new URL(q.url()).pathname,failure:q.failure()?.errorText});});const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push({label,phase:tests.length,message:e.message,stack:e.stack}));page.on('framenavigated',f=>navigation.push({label,phase:tests.length,url:f.url()}));page.on('framedetached',f=>navigation.push({label,phase:tests.length,detached:f.url()}));await page.goto('https://studio.fixture.invalid/bootstrap');return{context,page,label};}
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
async function committed(operations){const until=Date.now()+20000;while(Date.now()<until){const rows=await Promise.all(operations.map(o=>db.prepare("SELECT count(*) n FROM sync_changes WHERE app_id='port' AND operation_id=?").bind(o.operationId).first()));if(rows.every(row=>row.n===1))return;await new Promise(r=>setTimeout(r,50));}throw Error('original operations did not commit within existing 20s budget');}
async function ready(frame){await frame.waitForFunction(({main,version})=>main?document.querySelector('.port-app-version-display')?.textContent==='Ver '+version:document.documentElement?.dataset.portWriterReady==='true',{main:!!process.env.STUDIO_NATIVE_ROOT,version:process.env.STUDIO_EXPECTED_PORT_VERSION||'1.24.25'});}
async function nativeRuntime(frame){
 for(let activation=0;activation<2;activation++){
  await frame.waitForLoadState('domcontentloaded');await ready(frame);
  if(await readStable(frame,()=>!!SoundCruiseMultiAppSync?.runtimes?.port))return;
  if(frame.parentFrame?.())await frame.page().locator('.studio-nav [data-workspace=portSync]').click();else await frame.evaluate(()=>location.hash='#sync-center');
  const activationUrl=frame.url();
  await frame.locator('#port-sync-activate').click();
  await frame.waitForFunction(({url,version})=>location.href!==url||(document.querySelector('.port-app-version-display')?.textContent==='Ver '+version&&document.querySelector('#port-sync-activate')?.disabled===false),{url:activationUrl,version:process.env.STUDIO_EXPECTED_PORT_VERSION||'1.24.25'});
  await frame.waitForLoadState('domcontentloaded');await ready(frame);
  if(await readStable(frame,()=>!!SoundCruiseMultiAppSync?.runtimes?.port))return;
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
async function consent(frame){await nativeRuntime(frame);return {ok:true};}
async function sync(frame){
 await ready(frame);await nativeRuntime(frame);
 const page=frame.page?.()||frame,target=frame.mainFrame?.()||frame,oldUrl=frame.url(),documentEpoch=await frame.evaluate(()=>performance.timeOrigin);let navigated=false;const onNav=f=>{if(f===target)navigated=true;};page.on('framenavigated',onNav);let value;
 try{value=await frame.evaluate(()=>SoundCruiseMultiAppSync.runtimes.port.sync('explicit-test'));}catch(e){
  if(/AbortError: signal is aborted/.test(String(e))){
   // Native remote-apply cache-bust destroys the old runtime. Accept that abort
   // only after a different actual document exists; a live-document abort fails.
   await frame.waitForFunction(epoch=>performance.timeOrigin!==epoch,documentEpoch,{timeout:10000});
  }else{
   if(!/Execution context was destroyed|runtime_disposed/.test(String(e)))throw e;
   await frame.waitForURL(u=>u.href!==oldUrl,{timeout:10000});
  }
  navigated=true;
 }
 await frame.waitForLoadState('domcontentloaded');page.off('framenavigated',onNav);
 if(navigated){await frame.waitForLoadState('load');await ready(frame);await nativeRuntime(frame);}
 return value;
}
try{
 const run=fs.mkdtempSync(OUT+'/native-');const seed=process.env.STUDIO_SCHEMA_SEED;assert(seed&&fs.realpathSync(seed).startsWith('/private/tmp/studio070-remaining-rerun/native-'),'Existing disposable synthetic schema seed required; no DDL');fs.cpSync(seed,run,{recursive:true});removeProjectFixture(run);mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:fs.readFileSync(OUT+'/worker.mjs','utf8'),compatibilityDate:'2026-09-01',host:'127.0.0.1',port:0,inspectorPort:0,d1Databases:{DB:'product-sync'},r2Buckets:{ASSETS:'product-assets'},bindings:{SYNC_ACCOUNT_CREDENTIAL_PEPPER:pepper,SYNC_ACCOUNT_RECOVERY_PEPPER:pepper,PRO_CREDENTIAL_PEPPER:proPepper,SYNC_CREDENTIAL_PEPPER:'synthetic-device-key-not-production-key-000000'},resourcePersistencePath:run,resourceTmpPath:run+'/tmp',outboundService:()=>{throw Error('Production network forbidden');}}));db=await mf.getD1Database('DB');
 if(!releaseMode){await(await import(src+'/studio-release-schema.js')).inspectStudioRelease(db);await db.prepare('UPDATE studio_document_control SET enabled=1').run();}else assert.equal((await db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'studio_%'").all()).results.length,0);
 await db.prepare("INSERT OR REPLACE INTO sync_runtime_control VALUES(1,'open',1,1,1,1,1,1,1)").run();await db.prepare("INSERT OR REPLACE INTO sync_account_runtime_control VALUES(1,'open',1,1,1,1,1,0,1,1)").run();
 await db.prepare("INSERT OR REPLACE INTO pro_auth_state(singleton_id,generation,active_code_slot,legacy_compat_enabled,updated_at,session_lifecycle_started_at,unbound_backend_until) VALUES(1,1,'A',1,?,?,?)").bind(Date.now(),Date.now(),Date.now()+3600000).run();
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const A=await profile('Port-A');await bootstrapPro(A);let account;
 account=await createAccount(A);assert(account.accountId);
 const B=await profile('Studio-B');await bootstrapPro(B);
 const second=createAccountCredential(),row=await db.prepare('SELECT * FROM sync_account_devices WHERE id=?').bind(account.accountDeviceId).first();
 const newRow={...row,id:second.deviceId,credential_verifier:await accountCredentialVerifier(second.credential,pepper)};const ks=Object.keys(newRow);await db.prepare(`INSERT INTO sync_account_devices (${ks.join(',')}) VALUES (${ks.map(()=>'?').join(',')})`).bind(...Object.values(newRow)).run();
 await B.page.evaluate(value=>SoundCruiseSyncAccount.storage.setAccount(value),{...account,accountDeviceId:second.deviceId,accountCredential:second.credential});
 let pa,pb;
 pa=await port(A,false);pb=await port(B,true);await ready(pa);await ready(pb);await consent(pa);await consent(pb);
 // Initial record is prepared through the real form; old accepted general cases are setup only.
 async function edit(frame,name){await frame.waitForLoadState('domcontentloaded');await ready(frame);await go(frame,'#wishlist');await frame.locator('.gear-card').first().click();await frame.locator('#gear-name').fill(name);await frame.locator('#gear-list-form button[type=submit]').click();await frame.locator('.gear-card',{hasText:name}).waitFor();}
 await go(pa,'#wishlist');await pa.locator('#gear-list-title-add').click();await pa.locator('#gear-name').fill('CAS base');await pa.locator('#gear-category').selectOption('guitar');await pa.locator('#gear-status').selectOption('owned');await pa.locator('#gear-list-form button[type=submit]').click();await pa.locator('.gear-card',{hasText:'CAS base'}).waitFor();await sync(pa);await sync(pb);
 // Release 1.0 tests main's durable outbox + exact-operation retry/own-echo contract.
 const wire=o=>Object.fromEntries(['operationId','recordType','recordId','schemaVersion','baseRevision','payload','payloadHash','deleted'].map(k=>[k,o[k]]));
 for(const kind of ['network','503'])await check('legacy '+kind+' retains exact pending operation and reconnects without replacement',async()=>{
  await A.context.setOffline(true);await edit(pa,'Legacy '+kind);let dropped;const lost=new Promise(r=>dropped=r);
  faults.set(A.label,{path:'/v1/sync/push',before:kind,onDrop:body=>{blocked.add(A.label);dropped(body);}});
  await A.context.setOffline(false);const [attempt]=await Promise.all([lost,Promise.allSettled([sync(pa)])]);await A.context.setOffline(true);
  const pending=await readStable(pa,async id=>SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:id}).listOutbox(),account.accountId);
  for(const operation of attempt.operations){const retained=pending.find(o=>o.operationId===operation.operationId);assert(retained);assert.deepEqual(wire(retained),wire(operation));}
  blocked.delete(A.label);await A.context.setOffline(false);await sync(pa);await committed(attempt.operations);await pa.waitForFunction(async ({id,ops})=>!(await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:id}).listOutbox()).some(o=>ops.includes(o.operationId)),{id:account.accountId,ops:attempt.operations.map(o=>o.operationId)});await sync(pb);
  await pb.waitForFunction(k=>localStorage.getItem('cruisePort.gearList')?.includes('Legacy '+k),kind);
  for(const operation of attempt.operations){const count=await db.prepare("SELECT count(*) n FROM sync_changes WHERE app_id='port' AND operation_id=?").bind(operation.operationId).first();assert.equal(count.n,1);}
 });
 await check('legacy committed ACK loss survives reload; same-operation retry or exact own echo makes one commit',async()=>{
  await A.context.setOffline(true);await edit(pa,'Legacy ACK retained');let dropped;const lost=new Promise(r=>dropped=r);
  const start=network.length;faults.set(A.label,{path:'/v1/sync/push',onDrop:receipt=>{blocked.add(A.label);dropped(receipt);}});
  await A.context.setOffline(false);const [receipt]=await Promise.all([lost,Promise.allSettled([sync(pa)])]);await A.context.setOffline(true);
  assert(receipt.response.results.some(x=>x.status==='applied'));
  const saved=await pa.evaluate(async id=>SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:id}).listOutbox(),account.accountId);
  for(const operation of receipt.body.operations)assert(saved.some(o=>o.operationId===operation.operationId&&o.payloadHash===operation.payloadHash));
  await pa.reload();await ready(pa);
  const after=await pa.evaluate(async id=>SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:id}).listOutbox(),account.accountId);
  assert.deepEqual(after.map(wire),saved.map(wire));
  blocked.delete(A.label);await A.context.setOffline(false);await nativeRuntime(pa);await sync(pa);await pa.waitForFunction(async ({id,ops})=>!(await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:id}).listOutbox()).some(o=>ops.includes(o.operationId)),{id:account.accountId,ops:receipt.body.operations.map(o=>o.operationId)});await sync(pb);
  assert(await readStable(pb,()=>localStorage.getItem('cruisePort.gearList').includes('Legacy ACK retained')));
  for(const op of receipt.body.operations){const rows=await db.prepare("SELECT count(*) n FROM sync_changes WHERE app_id='port' AND operation_id=?").bind(op.operationId).first();assert.equal(rows.n,1);}
  const attempts=network.slice(start).filter(x=>x.label===A.label&&x.path==='/v1/sync/push');
  for(const attempt of attempts)for(const op of attempt.operations||[]){const sameRecord=receipt.body.operations.find(x=>x.recordType===op.recordType&&x.recordId===op.recordId);if(!sameRecord)continue;assert.equal(op.operationId,sameRecord.operationId,'retry must not replace an operation for the same record');assert.equal(op.wireHash,createHash('sha256').update(JSON.stringify(wire(sameRecord))).digest('hex'));}
  result.legacyAck={pendingRetainedAcrossReload:true,oneCommitPerOperation:true,operationIdsUnchanged:true};
 });
 async function imageInput(frame,inputId,variant=0,nearLimit=false){return frame.evaluate(async({inputId,variant,nearLimit})=>{
  const c=document.createElement('canvas');c.width=1024;c.height=1024;const x=c.getContext('2d'),im=x.createImageData(c.width,c.height);for(let o=0;o<im.data.length;o+=65536)crypto.getRandomValues(im.data.subarray(o,Math.min(o+65536,im.data.length)));for(let i=3;i<im.data.length;i+=4)im.data[i]=255;x.putImageData(im,0,0);x.fillStyle=variant?'red':'blue';x.fillRect(0,0,200,200);const raw=await new Promise(r=>c.toBlob(r,'image/png'));const blob=nearLimit?new Blob([raw,new Uint8Array(15*1024*1024-raw.size)],{type:'image/png'}):raw;const transfer=new DataTransfer();transfer.items.add(new File([blob],'synthetic.png',{type:'image/png'}));const input=document.getElementById(inputId);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));return{inputBytes:blob.size};},{inputId,variant,nearLimit});}
 async function photoHash(frame){return readStable(frame,async()=>{const {createGearPhotoStore}=await import('/apps/cruise-port/gear-photo-store.js?v=1.24.24'),store=createGearPhotoStore(),item=JSON.parse(localStorage.getItem('cruisePort.gearList')).items[0];return Promise.all([item.photoId,item.photoSourceId].map(async id=>{const r=await store.getPhoto(id);if(!r.record)throw Error('binary missing');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await r.record.blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');}));});}
 await check('near-limit real Gear input, upload commit ACK loss and safe same-operation recovery',async()=>{
  await go(pa,'#wishlist');await pa.locator('.gear-card').first().click();result.binaryLoad=await imageInput(pa,'gear-photo-input',0,true);assert.equal(result.binaryLoad.inputBytes,15*1024*1024);
  let mark;const dropped=new Promise(r=>mark=r);faults.set(A.label,{path:'/v1/sync/assets/commit',onDrop:x=>{result.assetLostCommit={assetId:x.body.assetId,operationId:x.body.operationId};mark();}});
  await pa.locator('#gear-photo-crop-dialog').waitFor({state:'visible'});await pa.locator('#gear-photo-crop-confirm').click();await pa.locator('#gear-list-form button[type=submit]').click();await dropped;
  await pa.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')||'{}').gear||{}).some(e=>e.pending));
  await pa.evaluate(()=>window.dispatchEvent(new Event('online')));await pa.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')||'{}').gear||{}).some(e=>e.published?.final?.assetId&&e.published?.source?.assetId),{},{timeout:30000});await sync(pa);await sync(pb);await nativeRuntime(pb);await pb.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.gearList')).items[0].photoSourceId);assert.deepEqual(await photoHash(pa),await photoHash(pb));
 });
 await check('native image re-edit publishes a new matched source/final generation on both devices',async()=>{
  const before=await photoHash(pa),previousPhotoId=await readStable(pa,()=>JSON.parse(localStorage.getItem('cruisePort.gearList')).items[0].photoId);await go(pa,'#wishlist');await pa.locator('.gear-card').first().click();await imageInput(pa,'gear-photo-input',1);await pa.locator('#gear-photo-crop-dialog').waitFor({state:'visible'});await pa.locator('#gear-photo-crop-confirm').click();await pa.locator('#gear-list-form button[type=submit]').click();await pa.waitForFunction(old=>JSON.parse(localStorage.getItem('cruisePort.gearList')).items[0].photoId!==old,previousPhotoId);
  await pa.waitForFunction(()=>{const m=Object.values(JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')||'{}').gear||{})[0];return m?.published?.final?.assetId&&!m.pending&&m.binding?.final?.localId===JSON.parse(localStorage.getItem('cruisePort.gearList')).items[0].photoId;});await sync(pa);const expectedAssets=await pa.evaluate(()=>{const m=Object.values(JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')).gear)[0];return{final:m.published.final.assetId,source:m.published.source.assetId};});let published=false;for(let i=0;i<40;i++){const rows=await db.prepare("SELECT payload_json FROM sync_records WHERE app_id='port' AND record_type='gear_item'").all();if(rows.results.some(r=>r.payload_json.includes(expectedAssets.final)&&r.payload_json.includes(expectedAssets.source))){published=true;break;}await new Promise(r=>setTimeout(r,100));}assert(published,'new source/final reference must commit before receiver pulls');await sync(pb);await nativeRuntime(pb);await pb.waitForFunction(ids=>{const m=Object.values(JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')||'{}').gear||{})[0];return m?.published?.final?.assetId===ids.final&&m?.published?.source?.assetId===ids.source&&m?.binding?.final?.localId===JSON.parse(localStorage.getItem('cruisePort.gearList')).items[0].photoId;},expectedAssets);const after=await photoHash(pa);assert.notDeepEqual(before,after);assert.deepEqual(after,await photoHash(pb));
 });
 await check('explicit photo deletion propagates without treating a missing cache as deletion',async()=>{
  await go(pa,'#wishlist');await pa.locator('.gear-card').first().click();pa.once('dialog',d=>d.accept());await pa.locator('#gear-photo-remove').click();await pa.locator('#gear-list-form button[type=submit]').click();await pa.waitForFunction(()=>!JSON.parse(localStorage.getItem('cruisePort.gearList')).items[0].photoId);await sync(pa);await sync(pb);await nativeRuntime(pb);await pb.waitForFunction(()=>!JSON.parse(localStorage.getItem('cruisePort.gearList')).items[0].photoId);const m=await readStable(pb,()=>Object.values(JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')).gear)[0]);assert(!m.published);
 });
 await check('native My Apps icon source/final binary roundtrip through Studio entry',async()=>{
  await go(pa,'#my-apps/new');await pa.locator('#my-apps-name').fill('Native icon');await pa.locator('#my-apps-other-urls').evaluate(e=>e.open=true);await pa.locator('#my-apps-web-url').fill('https://example.invalid/');await imageInput(pa,'my-apps-icon-input',0);await pa.locator('#my-apps-crop-dialog').waitFor({state:'visible'});await pa.locator('#my-apps-crop-confirm').click();await pa.locator('#my-apps-submit').click();
  await pa.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')||'{}').myApps||{}).some(e=>e.published?.source?.assetId&&e.published?.final?.assetId));await sync(pa);await sync(pb);
  await B.page.locator('[data-workspace=portMyApps]').click();pb=await(await B.page.locator('#port-my-apps-surface iframe').elementHandle()).contentFrame();await ready(pb);await nativeRuntime(pb);await pb.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.myApps')).items.some(i=>i.name==='Native icon'&&i.iconSourceId));
  const hashes=async frame=>readStable(frame,async()=>{const {createMyAppsIconStore}=await import('/apps/cruise-port/my-apps-icon-store.js?v=1.24.24'),store=createMyAppsIconStore(),item=JSON.parse(localStorage.getItem('cruisePort.myApps')).items.find(i=>i.name==='Native icon');return Promise.all([item.iconId,item.iconSourceId].map(async id=>{const r=await store.getIcon(id);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await r.record.blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');}));});assert.deepEqual(await hashes(pa),await hashes(pb));
 });
 await check('two-device icon re-edit versus removal retains local bytes or explicit conflict, without mixed generations',async()=>{
  const id=await readStable(pa,()=>JSON.parse(localStorage.getItem('cruisePort.myApps')).items.find(i=>i.name==='Native icon').id);await B.context.setOffline(true);await go(pb,'#my-apps/'+id+'/edit');await pb.locator('#my-apps-form-view').waitFor({state:'visible'});await imageInput(pb,'my-apps-icon-input',1);await pb.locator('#my-apps-crop-dialog').waitFor({state:'visible'});await pb.locator('#my-apps-crop-confirm').click();await pb.locator('#my-apps-submit').click();await pb.waitForFunction(()=>!document.querySelector('#my-apps-form-view').offsetParent);
  const retained=await pb.evaluate(id=>{const i=JSON.parse(localStorage.getItem('cruisePort.myApps')).items.find(i=>i.id===id);return{final:i.iconId,source:i.iconSourceId};},id);assert(retained.final&&retained.source);
  await pa.evaluate(id=>location.hash='#my-apps/'+id+'/edit',id);await pa.locator('#my-apps-icon-remove').click();await pa.locator('#my-apps-submit').click();await pa.waitForFunction(id=>!JSON.parse(localStorage.getItem('cruisePort.myApps')).items.find(i=>i.id===id).iconId,id);await sync(pa);
  await B.context.setOffline(false);await sync(pb).catch(()=>{});const current=await pb.evaluate(id=>JSON.parse(localStorage.getItem('cruisePort.myApps')).items.find(i=>i.id===id),id);assert.equal(current.iconId,retained.final);assert.equal(current.iconSourceId,retained.source);const conflicts=await pb.evaluate(()=>SoundCruiseMultiAppSync.runtimes.port.store.listConflicts());assert(conflicts.some(c=>c.recordType==='my_app'));
  await go(pb,'#sync-center');await pb.getByRole('button',{name:'クラウドの内容でこの端末を更新',exact:true}).click();await pb.locator('[data-sync-conflict-resolution]').waitFor({state:'hidden'});await sync(pb);await nativeRuntime(pb);await pb.waitForFunction(id=>!JSON.parse(localStorage.getItem('cruisePort.myApps')).items.find(i=>i.id===id).iconId,id);
 });
 await check('legacy attachment deletion ACK loss preserves pending data while a new attachment is retained',async()=>{
  await go(pa,'#practice-menu');await pa.locator('#practice-menu-add').click();await pa.locator('#practice-name-preset').selectOption('custom');await pa.locator('#practice-name').fill('Native attachment race');await pa.locator('#practice-duration').fill('5');await pa.locator('#practice-menu-form button[type=submit]').click();await pa.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.practiceMenus')||'{"items":[]}').items.some(i=>i.name==='Native attachment race'));globalThis.practiceId=await readStable(pa,()=>JSON.parse(localStorage.getItem('cruisePort.practiceMenus')||'{"items":[]}').items.find(i=>i.name==='Native attachment race').id);await sync(pa);await sync(pb);
  await go(pa,'#practice-menu');await pa.locator('[data-practice-id="'+practiceId+'"] .practice-card-link').click();await pa.locator('#practice-detail-view').waitFor({state:'visible'});await pa.locator('#practice-attachment-input').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from('native attachment v1')});await pa.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')||'{}').attachments||{}).some(e=>e.published?.asset?.assetId)).catch(async error=>{result.attachmentDiagnostic=await pa.evaluate(async()=>({status:document.querySelector('#practice-attachment-status')?.textContent,all:await(await import('/apps/cruise-port/practice-menu-attachment-store.js?v=1.24.24')).createPracticeAttachmentStore().getAllAttachments(),metadata:JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')),sync:SoundCruiseMultiAppSync.runtimes.port.state,conflicts:await SoundCruiseMultiAppSync.runtimes.port.store.listConflicts(),outbox:await SoundCruiseMultiAppSync.runtimes.port.store.listOutbox()}));throw error;});await sync(pa);
  await B.page.locator('[data-workspace=portPractice]').click();pb=await(await B.page.locator('#port-practice-surface iframe').elementHandle()).contentFrame();await ready(pb);await nativeRuntime(pb);await pb.locator('#sync-center-back').click();await pb.waitForLoadState('domcontentloaded');await sync(pb);await pb.locator('[data-practice-id="'+practiceId+'"] .practice-card-link').click();await pb.locator('#practice-detail-view').waitFor({state:'visible'});await pb.locator('[data-attachment-action=open]').waitFor();
  let done;const lost=new Promise(r=>done=r);faults.set(A.label,{path:'/v1/sync/push',onDrop:x=>{result.attachmentDeleteLost=x.response.results.map(r=>r.status);done();}});pa.once('dialog',d=>d.accept());await pa.locator('[data-attachment-action=delete]').click();await lost;
  await pa.locator('#practice-attachment-input').setInputFiles({name:'synthetic.txt',mimeType:'text/plain',buffer:Buffer.from('native attachment v2')});await pa.waitForFunction(async()=>{const {createPracticeAttachmentStore}=await import('/apps/cruise-port/practice-menu-attachment-store.js?v=1.24.24');return(await createPracticeAttachmentStore().getAllAttachments()).records.some(x=>x.fileName==='synthetic.txt'&&x.blob.size===20);});
  assert((await pa.evaluate(()=>SoundCruiseMultiAppSync.runtimes.port.store.listOutbox())).length);await pb.locator('[data-attachment-action=open]').click();await pb.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')).attachments).some(e=>e.binding?.localId));
 });
 await check('legacy attachment pending retry and replacement download preserve v2 without resurrecting v1',async()=>{
  await sync(pa);await sync(pa);await sync(pb);await pa.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')).attachments).some(e=>e.published?.asset?.assetId));await sync(pa);await sync(pb);
  await go(pb,'#practice-menu');await pb.locator('[data-practice-id="'+practiceId+'"] .practice-card-link').click();await pb.locator('[data-attachment-action=open]').click();await pb.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')).attachments).some(e=>e.binding?.localId));
  const content=await pb.evaluate(async()=>{const {createPracticeAttachmentStore}=await import('/apps/cruise-port/practice-menu-attachment-store.js?v=1.24.24'),store=createPracticeAttachmentStore(),m=JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata'));return Promise.all(Object.values(m.attachments).map(async e=>(await store.getAttachment(e.binding.localId)).record.blob.text()));});assert.deepEqual(content,['native attachment v2']);
 });
 await B.page.locator('[data-workspace=portGear]').click();pb=await(await B.page.locator('#port-gear-surface iframe').elementHandle()).contentFrame();await ready(pb);await consent(pb);await sync(pa);await sync(pb);
 await check('two actual profiles submit the same Port baseRevision; one applies and one conflicts',async()=>{
  await A.context.setOffline(true);await B.context.setOffline(true);await edit(pa,'CAS A');await edit(pb,'CAS B');
  let release;const wait=new Promise(r=>release=r),gate={arrivals:[],wait,release};pushBarrier=gate;
  await A.context.setOffline(false);await B.context.setOffline(false);await Promise.allSettled([sync(pa),sync(pb)]);assert.equal(gate.arrivals.length,2);
  const ops=gate.arrivals.map(a=>a.operations.find(o=>o.recordType==='gear_item'));assert.equal(ops[0].baseRevision,ops[1].baseRevision);
  const conflicts=await Promise.all([pa,pb].map(f=>f.evaluate(()=>SoundCruiseMultiAppSync.runtimes.port.store.listConflicts())));assert.equal(conflicts.filter(x=>x.some(c=>c.recordType==='gear_item')).length,1);result.cas={baseRevision:ops[0].baseRevision,conflictCount:1};
  globalThis.loser=conflicts[0].length?pa:pb;globalThis.winner=conflicts[0].length?pb:pa;globalThis.conflictId=(conflicts[0].length?conflicts[0]:conflicts[1]).find(x=>x.recordType==='gear_item').id;
 });
 await check('actual conflict UI is visible; explicit remote choice preserves winner then normal save resumes',async()=>{
  await go(loser,'#sync-center');await loser.locator('#sync-center-port-conflicts-open').waitFor({state:'visible'});
  await loser.getByRole('button',{name:'クラウドの内容でこの端末を更新',exact:true}).click();await loser.waitForFunction(async()=>!(await SoundCruiseMultiAppSync.runtimes.port.store.listConflicts()).some(c=>c.recordType==='gear_item'));await loser.locator('[data-sync-conflict-resolution]').waitFor({state:'hidden'});await sync(loser);
  await edit(loser,'CAS resolved');await sync(loser);await sync(winner);await winner.waitForFunction(()=>localStorage.getItem('cruisePort.gearList')?.includes('CAS resolved'));
 });
 assert.equal(errors.length,0);result.productionRequestsSent=0;
}catch(e){result.status='FAIL';result.syncDiagnostics=[];for(const context of contexts)for(const page of context.pages())for(const frame of page.frames()){try{result.syncDiagnostics.push(await frame.evaluate(async()=>{const r=globalThis.SoundCruiseMultiAppSync?.runtimes?.port;if(!r)return null;return {outbox:(await r.store.listOutbox()).map(o=>({operationId:o.operationId,recordType:o.recordType,baseRevision:o.baseRevision,conflict:o.conflict,error:o.terminalError,attempts:o.attempts})),conflicts:(await r.store.listConflicts()).map(c=>({recordType:c.localRecord?.recordType||c.remoteRecord?.recordType,kind:c.kind,reason:c.reason,localHash:c.localRecord?.payloadHash,remoteHash:c.remoteRecord?.payloadHash,shadowHash:c.shadowRecord?.payloadHash}))};}));}catch{}};result.failure=String(e);result.diagnostics=[];for(const c of contexts)for(const p of c.pages())for(const f of p.frames()){try{result.diagnostics.push(await f.evaluate(()=>({url:location.pathname,ready:document.documentElement.dataset.portWriterReady,runtime:!!globalThis.SoundCruiseMultiAppSync?.runtimes?.port,conflict:document.querySelector('[data-sync-conflict-resolution]')?.innerText,syncState:globalThis.SoundCruiseMultiAppSync?.runtimes?.port?.state,status:[...document.querySelectorAll('[role=status]')].filter(e=>e.offsetParent).map(e=>e.textContent)})));}catch{}}throw e;}finally{result.status||='PASS';fs.writeFileSync(OUT+'/RELEASE1-SYNC-RESULT.json',JSON.stringify(result,null,2));for(const c of contexts)await Promise.race([c.close(),new Promise(r=>setTimeout(r,3000))]);await browser?.close();await mf?.dispose();stopBuildService();}
