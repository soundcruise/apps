// Real Port Pro and Studio entry, separate Chrome profiles; local native D1/R2 only.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {randomUUID,createHash} from 'node:crypto';
const require=createRequire(process.env.STUDIO_TEST_RUNTIME),{chromium}=require('playwright'),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{build}=require('esbuild');
const W=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),OUT=process.env.STUDIO_CLIENT_OUTPUT;assert(OUT);
const src=W+'/workers/sound-cruise-sync/src',pepper='synthetic-account-key-not-production-key-0000',proPepper='synthetic-pro-key-not-production-key-000000';
const {createAccountCredential,accountCredentialVerifier}=await import(src+'/account-crypto.js');
const old=fs.readFileSync(W+'/apps/cruise-studio/tests/identity-cloud.browser.mjs','utf8');
const literal=old.slice(old.indexOf('const entry=`')+'const entry='.length,old.indexOf(';'+String.fromCharCode(10)+'fs.writeFileSync'));
let entry=Function('src','W','return '+literal)(src,W);
entry="import legacy from '"+src+"/index.js';"+entry;
entry=entry.replace("legacy:{fetch:()=>new Response(null,{status:404}),scheduled:()=>null}","legacy");
entry=entry.replace("SYNC_ACCOUNT_PUBLIC_APP_IDS:'chord,pitch,fretboard,rhythm'", "SYNC_ACCOUNT_PUBLIC_APP_IDS:'chord,pitch,fretboard,rhythm,port',SYNC_ALLOWED_APP_IDS:'chord,pitch,fretboard,rhythm,port',SYNC_ASSET_WRITE_ENABLED:'true',SYNC_ASSET_DOWNLOAD_ENABLED:'true',ACCOUNT_START_RATE_LIMITER:{limit:async()=>({success:true})},ACCOUNT_API_RATE_LIMITER:{limit:async()=>({success:true})}");
entry=entry.replace("if(path.startsWith('/v2/accounts/'))","if(path==='/v2/accounts/port-device')return legacy.fetch(request,env,{});if(path.startsWith('/v2/accounts/'))");
entry=entry.replace('SYNC_DB:env.DB,','SYNC_DB:env.DB,SYNC_ASSETS:env.ASSETS,');
fs.writeFileSync(OUT+'/entry.mjs',entry);await build({entryPoints:[OUT+'/entry.mjs'],bundle:true,format:'esm',platform:'browser',outfile:OUT+'/worker.mjs',logLevel:'silent'});
const tests=[],network=[],errors=[],contexts=[],navigation=[],faults=new Map();let mf,db,browser;
async function check(name,fn){let timer;try{await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('check deadline: '+name)),60000);})]);}finally{clearTimeout(timer);}tests.push({name,status:'PASS'});console.log('PASS '+name);}
const result={production:false,entry:'actual Studio index and native Port Pro index',tests,errors,network,navigation};
async function routeContext(context,label){await context.route('**/*',async route=>{
 const q=route.request(),u=new URL(q.url());
 if(u.origin==='https://studio.fixture.invalid'){
  if(u.pathname==='/bootstrap')return route.fulfill({contentType:'text/html',body:'<!doctype html><script src="/apps/shared/sync-account/sync-account-core.js"></script><script src="/apps/shared/sync-account/sync-account-db.js"></script><script src="/apps/shared/sync-account/sync-account-client.js"></script><script src="/apps/shared/pro-device-session.js"></script>'});
  let file=path.resolve(W,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(W+'/'))return route.abort();if(u.pathname.endsWith('/'))file+='/index.html';
  try{return route.fulfill({contentType:({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'),body:fs.readFileSync(file)});}catch{return route.fulfill({status:404,body:'missing'});}
 }
 if(!['sound-cruise-sync.cruise-port-requests.workers.dev','backend.fixture.invalid'].includes(u.hostname))return route.abort();
 let body;try{body=JSON.parse(q.postData()||'{}');}catch{}
 network.push({label,path:u.pathname,kind:body?.kind,method:q.method()});
 const response=await mf.dispatchFetch('http://native.fixture.invalid'+u.pathname+u.search,{method:q.method(),headers:{...await q.allHeaders(),'CF-Connecting-IP':'192.0.2.4'},...(q.postDataBuffer()?{body:q.postDataBuffer()}: {})});
 const f=faults.get(label);if(f&&u.pathname===f.path&&(!f.kind||f.kind===body?.kind)){faults.delete(label);await response.arrayBuffer();return route.abort('failed');}
 const data=Buffer.from(await response.arrayBuffer());if(response.status>=400){let code;try{code=JSON.parse(data).code;}catch{}console.log('REFUSAL',label,u.pathname,response.status,code);}
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
 await p.page.goto('https://studio.fixture.invalid/apps/cruise-studio/index.html');await p.page.locator('[data-home-workspace="portGear"]').click();
 const frame=await p.page.locator('#port-gear-surface iframe').elementHandle();const child=await frame.contentFrame();return child;}
async function ready(frame){await frame.waitForFunction(()=>document.documentElement.dataset.portWriterReady==='true');}
async function consent(frame){await frame.evaluate(()=>location.hash='#sync-center');await frame.getByText('同期先と端末データを確認',{exact:true}).click();await frame.locator('[data-port-local-account] input').check();await frame.locator('[data-port-attribution-choice=current]').click();await frame.waitForFunction(()=>!!SoundCruiseMultiAppSync?.runtimes?.port);await frame.evaluate(()=>SoundCruiseMultiAppSync.runtimes.port.sync('explicit-test'));}
async function sync(frame){
 const page=frame.page?.()||frame,target=frame.mainFrame?.()||frame,oldUrl=frame.url();let navigated=false;const onNav=f=>{if(f===target)navigated=true;};page.on('framenavigated',onNav);let value;
 try{value=await frame.evaluate(()=>SoundCruiseMultiAppSync.runtimes.port.sync('explicit-test'));}catch(e){if(!/Execution context was destroyed|runtime_disposed/.test(String(e)))throw e;await frame.waitForURL(u=>u.href!==oldUrl,{timeout:10000});navigated=true;}
 await new Promise(r=>setTimeout(r,300));page.off('framenavigated',onNav);
 if(navigated){await ready(frame);await frame.waitForFunction(()=>!!SoundCruiseMultiAppSync?.runtimes?.port);}
 return value;
}
try{
 const run=fs.mkdtempSync(OUT+'/native-');const seed=process.env.STUDIO_SCHEMA_SEED;assert(seed&&fs.realpathSync(seed).startsWith('/private/tmp/studio070-remaining-rerun/native-'),'Existing disposable synthetic schema required');fs.cpSync(seed,run,{recursive:true});mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:fs.readFileSync(OUT+'/worker.mjs','utf8'),compatibilityDate:'2026-09-01',host:'127.0.0.1',port:0,inspectorPort:0,d1Databases:{DB:'product-sync'},r2Buckets:{ASSETS:'product-assets'},bindings:{SYNC_ACCOUNT_CREDENTIAL_PEPPER:pepper,SYNC_ACCOUNT_RECOVERY_PEPPER:pepper,PRO_CREDENTIAL_PEPPER:proPepper,SYNC_CREDENTIAL_PEPPER:'synthetic-device-key-not-production-key-000000'},resourcePersistencePath:run,resourceTmpPath:run+'/tmp',outboundService:()=>{throw Error('Production network forbidden');}}));db=await mf.getD1Database('DB');
 await(await import(src+'/studio-release-schema.js')).inspectStudioRelease(db);
 await db.prepare('UPDATE studio_document_control SET enabled=1').run();
 await db.prepare("INSERT OR REPLACE INTO sync_runtime_control VALUES(1,'open',1,1,1,1,1,1,1)").run();await db.prepare("INSERT OR REPLACE INTO sync_account_runtime_control VALUES(1,'open',1,1,1,1,1,0,1,1)").run();
 await db.prepare("INSERT OR REPLACE INTO pro_auth_state(singleton_id,generation,active_code_slot,legacy_compat_enabled,updated_at,session_lifecycle_started_at,unbound_backend_until) VALUES(1,1,'A',1,?,?,?)").bind(Date.now(),Date.now(),Date.now()+3600000).run();
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 await check('normal actual Studio boot stays Cloud-disconnected and performs no local writes',async()=>{
  const N=await profile('Normal',false);await N.context.addInitScript(()=>{globalThis.normalWrites=[];const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){normalWrites.push({kind:'storage',key:k});return set.call(this,k,v);};for(const method of ['put','add','delete','clear']){const old=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(...args){normalWrites.push({kind:'idb',method});return old.apply(this,args);};}});await N.page.goto('https://studio.fixture.invalid/apps/cruise-studio/index.html');await N.page.waitForFunction(()=>!!CruiseStudio.repository);await N.page.waitForTimeout(150);await N.page.waitForFunction(()=>!!CruiseStudio.entryAuth);assert.deepEqual(await N.page.evaluate(()=>normalWrites.filter(x=>x.kind==='idb'||!['soundCruiseProLegacyRetired'].includes(x.key))),[]);assert.equal(await N.page.evaluate(()=>document.getElementById('studio-shell').inert),true);assert.equal(await N.page.evaluate(()=>CruiseStudio.entryAuth.isAuthorized()),false);assert.equal(await N.page.evaluate(()=>CruiseStudio.portDataHost.canWrite),false);assert.equal(network.some(x=>x.label==='Normal'),false);await N.context.close();
 });

 const E=await profile('Entrance',false);let entranceAccount,heldFrame,heldDraft;
 async function entranceCode(code){
  await E.page.evaluate(()=>{window.__SOUND_CRUISE_ACCOUNT_TURNSTILE__={getToken:async()=> 'synthetic'};});
  await E.page.locator('#pro-gate-input').fill(code);await E.page.locator('#pro-gate-submit').click();
 }
 await check('formal Studio entrance rejects wrong Pro and requires native Account in addition to Pro',async()=>{
  await E.page.goto('https://studio.fixture.invalid/apps/cruise-studio/index.html?syntheticPro=1');
  await E.page.locator('#pro-gate-input').waitFor();await E.page.screenshot({path:OUT+'/entrance-locked.png'});assert.equal(await E.page.evaluate(()=>CruiseStudio.entryAuth.isAuthorized()),false);
  await entranceCode('0008');await E.page.locator('#pro-gate-error').filter({hasText:'番号が違います'}).waitFor();
  await entranceCode('0007');await E.page.locator('#studio-entry-account').waitFor();
  assert.equal(await E.page.evaluate(()=>CruiseStudio.entryAuth.isAuthorized()),false);
  await E.page.locator('[data-entry-connect]').click();
  await E.page.frameLocator('[data-entry-account-frame] iframe').locator('#sync-center-view:not([hidden])').waitFor();
  await E.page.evaluate(()=>document.querySelector('[data-entry-account-frame] iframe').contentWindow.location.hash='#wishlist');
  await E.page.waitForFunction(()=>document.querySelector('[data-entry-account-frame] iframe').contentWindow.location.hash==='#sync-center');
  entranceAccount=await createAccount(E);await E.page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
  assert.equal(await E.page.locator('#pro-gate-overlay').count(),0);assert.equal(await E.page.locator('#studio-shell').evaluate(e=>e.inert),false);await E.page.screenshot({path:OUT+'/entrance-ready.png'});
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
 await check('a revoked Account Device locks the entrance and refuses new Project save while keeping the actual Gear form and Project draft',async()=>{
  await E.page.evaluate(()=>CruiseStudio.shellHost.navigate('sheetCruise'));await E.page.locator('#sc-new-project').click();
  await E.page.locator('#sc-editor-drawer').evaluate(e=>e.open=true);await E.page.locator('#sc-title').fill('未保存の入口テスト曲');await E.page.locator('#sc-title').press('Tab');
  heldDraft=await E.page.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot()));
  await E.page.evaluate(()=>CruiseStudio.shellHost.navigate('portGear'));heldFrame=await(await E.page.locator('#port-gear-surface iframe').elementHandle()).contentFrame();await ready(heldFrame);
  await heldFrame.locator('#gear-list-title-add').click();await heldFrame.locator('#gear-name').fill('入口失効時の未保存ギター');
  await E.page.evaluate(()=>window.heldGear=document.querySelector('#port-gear-surface iframe'));
  await db.prepare('UPDATE sync_account_devices SET revoked_at=? WHERE id=?').bind(Date.now(),entranceAccount.accountDeviceId).run();
  assert.equal(await E.page.evaluate(()=>CruiseStudio.entryAuth.check()),false);
  assert.equal(await E.page.locator('#studio-shell').evaluate(e=>e.inert),true);
  assert.equal(await heldFrame.locator('#gear-name').inputValue(),'入口失効時の未保存ギター');
  assert.equal(await E.page.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot())),heldDraft);
  const denied=await E.page.evaluate(()=>CruiseStudio.repository.save({target:{type:'project',projectId:'denied-entry'},snapshot:{},baseRevision:null}));assert.equal(denied.code,'studio-entry-required');
 });
 await check('Account replacement revalidates the native session and keeps the old Account form inert instead of silently adopting it',async()=>{
  entranceAccount=await createAccount(E);await E.page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
  assert.equal(await E.page.evaluate(()=>window.heldGear===document.querySelector('#port-gear-surface iframe')),true);
  assert.equal(await E.page.evaluate(()=>window.heldGear.inert),true);
  assert.equal(await heldFrame.locator('#gear-name').inputValue(),'入口失効時の未保存ギター');
  assert.equal(await E.page.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot())),heldDraft);
 });
 await check('terminal Pro revocation and formal reauthentication reuse native APIs without dropping the preserved draft or old form',async()=>{
  await E.page.evaluate(()=>{const input=document.createElement('input');input.id='entrance-modal-draft';input.value='保持するダイアログ入力';window.entryDialog=CruiseStudio.shellHost.modal.open({title:'合成の編集',content:input});});
  const proId=await E.page.evaluate(()=>JSON.parse(localStorage.getItem('soundCruiseProAuth')).credential.split('.')[1]);
  await db.prepare('UPDATE pro_credentials SET revoked_at=? WHERE id=?').bind(Date.now(),proId).run();
  assert.equal(await E.page.evaluate(()=>CruiseStudio.entryAuth.check()),false);await E.page.locator('#pro-gate-input').waitFor();
  assert.equal(await heldFrame.locator('#gear-name').inputValue(),'入口失効時の未保存ギター');
  await entranceCode('0007');await E.page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
  assert.equal(await E.page.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot())),heldDraft);
  assert.equal(await E.page.evaluate(()=>window.heldGear.inert),true);await E.page.screenshot({path:OUT+'/entrance-resumed-modal.png'});
  assert.equal(await E.page.locator('#entrance-modal-draft').inputValue(),'保持するダイアログ入力');
  assert.equal(await E.page.evaluate(()=>window.entryDialog.matches(':modal')),true);await E.page.evaluate(()=>CruiseStudio.shellHost.modal.close('test-complete'));
 });
 await check('discarding a retained previous-Account form requires explicit confirmation; cancel preserves both form and draft',async()=>{
  E.page.once('dialog',d=>d.dismiss());await E.page.locator('[data-entry-owner-hold] button').click();assert.equal(await E.page.evaluate(()=>window.heldGear.isConnected),true);
  E.page.once('dialog',d=>d.accept());await E.page.locator('[data-entry-owner-hold] button').click();await E.page.waitForFunction(()=>!window.heldGear.isConnected);
  assert.equal(await E.page.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot())),heldDraft);
 });
 await check('expired native Pro session requires formal reauthentication and retains the Project draft',async()=>{
  const id=await E.page.evaluate(()=>JSON.parse(localStorage.getItem('soundCruiseProAuth')).credential.split('.')[1]);
  await db.prepare('UPDATE pro_credentials SET last_validated_at=?,lease_expires_at=? WHERE id=?').bind(Date.now()-91*86400000,Date.now()-1,id).run();
  assert.equal(await E.page.evaluate(()=>CruiseStudio.entryAuth.check()),false);await E.page.locator('#pro-gate-input').waitFor();
  assert.equal(await E.page.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot())),heldDraft);
  await entranceCode('0007');await E.page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
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
  await pa.evaluate(()=>location.hash='#wishlist');await pa.locator('#gear-list-title-add').click();await pa.locator('#gear-name').fill('Synthetic Port guitar');await pa.locator('#gear-category').selectOption('guitar');await pa.locator('#gear-status').selectOption('owned');await pa.locator('#gear-list-form button[type=submit]').click();await pa.locator('.gear-card',{hasText:'Synthetic Port guitar'}).waitFor();await sync(pa);await sync(pb);assert(await pb.evaluate(()=>localStorage.getItem('cruisePort.gearList').includes('Synthetic Port guitar')));
 });
 await check('Studio actual Gear form edits Cloud data and Port receives the edit',async()=>{
  await pb.evaluate(()=>location.hash='#wishlist');await pb.locator('.gear-card',{hasText:'Synthetic Port guitar'}).click();await pb.locator('#gear-name').fill('Studio edited guitar');await pb.locator('#gear-list-form button[type=submit]').click();await pb.locator('.gear-card',{hasText:'Studio edited guitar'}).waitFor();await sync(pb);await sync(pa);assert(await pa.evaluate(()=>localStorage.getItem('cruisePort.gearList').includes('Studio edited guitar')));
 });
 await check('real tuner/metronome UI and existing presets/practice/calendar/My Apps stores roundtrip',async()=>{
  await pa.evaluate(()=>location.hash='#tuner');await pa.locator('#tuner-capo-up').click();
  await pa.evaluate(()=>location.hash='#metronome');await pa.locator('#metronome-bpm').fill('157');await pa.locator('#metronome-bpm').press('Tab');
  const values=await pa.evaluate(async()=>{
   const menu=await import('/apps/cruise-port/practice-menu-store.js?v=1.28.2'),apps=await import('/apps/cruise-port/my-apps-store.js?v=1.28.2'),cal=await import('/apps/cruise-port/practice-menu-calendar-store.js?v=1.28.2'),presets=await import('/apps/cruise-port/metronome-presets-store.js?v=1.28.2'),metro=await import('/apps/cruise-port/metronome-store.js?v=1.28.2');
   const old=menu.loadPracticeMenus(),item=menu.createPracticeMenu({name:'Synthetic practice',durationMinutes:5,appId:null,memo:'fixture'},old.items);const m=await menu.savePracticeMenus([...old.items,item]);
   const a=apps.loadMyApps(),created=apps.createMyApp({name:'Synthetic My App',url:'https://example.invalid/'},a.items);if(!created.ok)throw Error(created.reason);const ar=await apps.saveMyApps([...a.items,created.item]);
   const c=cal.loadPracticeCalendar(),note=cal.createPracticeCalendarNote(c.calendar,{localDate:'2026-10-31',text:'Synthetic calendar'});if(!note.ok)throw Error(note.reason);const cr=await cal.savePracticeCalendar(note.calendar);
   const current=metro.loadMetronomeSettings().settings,pr=presets.loadMetronomePresets();const preset={...current,id:crypto.randomUUID(),name:'Synthetic preset',createdAt:Date.now(),updatedAt:Date.now()};const sr=await presets.saveMetronomePresets([...pr.presets,preset]);
   return{ok:[m.ok,ar.ok,cr.ok,sr.ok],practiceId:item.id};
  });assert.deepEqual(values.ok,[true,true,true,true]);globalThis.practiceId=values.practiceId;
  await sync(pa);await sync(pb);const data=await pb.evaluate(()=>({practice:localStorage.getItem('cruisePort.practiceMenus'),apps:localStorage.getItem('cruisePort.myApps'),calendar:localStorage.getItem('cruisePort.practiceCalendar'),preset:localStorage.getItem('cruisePort.metronomePresets'),tuner:JSON.parse(localStorage.getItem('cruisePort.tuner')),metro:JSON.parse(localStorage.getItem('cruisePort.metronome'))}));
  assert(data.practice.includes('Synthetic practice'));assert(data.apps.includes('Synthetic My App'));assert(data.calendar.includes('Synthetic calendar'));assert(data.preset.includes('Synthetic preset'));assert.equal(data.metro.bpm,157);assert.equal(data.tuner.capo,1);
 });
 await check('latest UI My Apps focus is preserved with native Port and one Sync runtime',async()=>{
  await B.page.locator('[data-workspace=portMyApps]').click();let my=await(await B.page.locator('#port-my-apps-surface iframe').elementHandle()).contentFrame();await ready(my);await my.locator('#my-apps-section').waitFor({state:'visible'});assert.equal(await my.locator('[data-home-section=tools]').isVisible(),false);assert.equal(await my.locator('[data-home-section=cruiseApps]').isVisible(),false);await my.waitForFunction(()=>!!SoundCruiseMultiAppSync?.runtimes?.port);assert.equal(await my.evaluate(()=>Object.keys(SoundCruiseMultiAppSync.runtimes).filter(x=>x==='port').length),1);
  await B.page.locator('[data-workspace=portGear]').click();pb=await(await B.page.locator('#port-gear-surface iframe').elementHandle()).contentFrame();await ready(pb);await pb.waitForFunction(()=>!!SoundCruiseMultiAppSync?.runtimes?.port);
 });
 await check('actual Gear photo workflow uploads source/final and Studio hydrates bytes through Asset Sync',async()=>{
  await pa.evaluate(()=>location.hash='#wishlist');await pa.locator('.gear-card',{hasText:'Studio edited guitar'}).click();
  await pa.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;const ctx=canvas.getContext('2d'),image=ctx.createImageData(1024,1024);for(let i=0;i<image.data.length;i+=4){image.data[i]=(i*31)%251;image.data[i+1]=(i*17)%239;image.data[i+2]=(i*7)%233;image.data[i+3]=255;}ctx.putImageData(image,0,0);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const transfer=new DataTransfer();transfer.items.add(new File([blob],'synthetic.png',{type:'image/png'}));const input=document.getElementById('gear-photo-input');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));});
  await pa.locator('#gear-photo-crop-dialog').waitFor({state:'visible'});await pa.locator('#gear-photo-crop-confirm').click();await pa.locator('#gear-photo-crop-dialog').waitFor({state:'hidden'});await pa.locator('#gear-list-form button[type=submit]').click();
  await pa.waitForFunction(()=>{const m=JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')||'{}');return Object.values(m.gear||{}).some(e=>e.published?.final?.assetId&&e.published?.source?.assetId);},{},{timeout:30000});
  await sync(pa);await sync(pb);await pb.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.gearList')).items.some(i=>i.photoId&&i.photoSourceId),{},{timeout:30000});
  const read=async frame=>frame.evaluate(async()=>{const {createGearPhotoStore}=await import('/apps/cruise-port/gear-photo-store.js?v=1.28.2'),store=createGearPhotoStore(),item=JSON.parse(localStorage.getItem('cruisePort.gearList')).items.find(i=>i.photoId);return Promise.all([item.photoId,item.photoSourceId].map(async id=>{const r=await store.getPhoto(id);if(!r.record)throw Error('binary missing');const b=new Uint8Array(await crypto.subtle.digest('SHA-256',await r.record.blob.arrayBuffer()));return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');}));});
  assert.deepEqual(await read(pa),await read(pb));
  result.binaryInspection=await pa.evaluate(async()=>{const start=performance.now();await new SoundCruisePortSync.PortSyncAdapter().inspectLocalAccount();return{milliseconds:performance.now()-start};});
 });
 await check('existing Practice attachment Asset Sync stores and hydrates real binary',async()=>{
  await pa.evaluate(async id=>{const {createPracticeAttachmentStore}=await import('/apps/cruise-port/practice-menu-attachment-store.js?v=1.28.2');const r=await createPracticeAttachmentStore().addAttachment(id,new Blob(['synthetic attachment bytes'],{type:'text/plain'}),{fileName:'synthetic.txt'});if(!r.ok)throw Error(r.reason);window.dispatchEvent(new Event('cruise-port-local-data-changed'));},globalThis.practiceId);
  await pa.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')||'{}').attachments||{}).some(e=>e.published?.asset?.assetId),{},{timeout:30000});await sync(pa);await sync(pb);
  const remote=await pb.evaluate(()=>JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')).attachments);assert(Object.values(remote).some(e=>e.published?.asset?.hash));
  await B.page.locator('[data-workspace=portPractice]').click();pb=await (await B.page.locator('#port-practice-surface iframe').elementHandle()).contentFrame();await ready(pb);await pb.waitForFunction(()=>!!SoundCruiseMultiAppSync?.runtimes?.port);await pb.locator('[data-practice-id="'+globalThis.practiceId+'"] .practice-card-link').click();await pb.locator('[data-attachment-action=open]').click();
  await pb.waitForFunction(()=>Object.values(JSON.parse(localStorage.getItem('cruisePort.syncAssetMetadata')).attachments).some(e=>e.binding?.localId));
  const bytes=await pb.evaluate(async()=>{const {createPracticeAttachmentStore}=await import('/apps/cruise-port/practice-menu-attachment-store.js?v=1.28.2');const r=await createPracticeAttachmentStore().getAllAttachments();return Promise.all(r.records.map(x=>x.blob.text()));});assert(bytes.includes('synthetic attachment bytes'));

 });
 await check('offline edit is retained and reconciles through existing Sync after reconnect',async()=>{
  await A.context.setOffline(true);await pa.evaluate(()=>location.hash='#wishlist');await pa.locator('.gear-card',{hasText:'Studio edited guitar'}).click();await pa.locator('#gear-name').fill('Offline guitar');await pa.locator('#gear-list-form button[type=submit]').click();await pa.locator('.gear-card',{hasText:'Offline guitar'}).waitFor();assert(await pa.evaluate(()=>localStorage.getItem('cruisePort.gearList').includes('Offline guitar')));await A.context.setOffline(false);await sync(pa);await sync(pb);await pb.waitForFunction(()=>localStorage.getItem('cruisePort.gearList').includes('Offline guitar'),{},{timeout:20000});
 });
 await check('real shared Studio Identity enrolment and Project UNKNOWN survive Account isolation',async()=>{
  const page=B.page;await page.locator('[data-workspace=home]').click();await page.locator('[data-identity-action=connect]').click();await page.waitForFunction(()=>!document.querySelector('[data-identity-action=connect]').disabled);const status=await page.locator('[data-identity-status]').innerText();assert(!status.includes('操作を停止'),status);
  const id=await page.evaluate(async()=>{const C=CruiseStudio,p=C.model.createSampleProject();p.projectId=crypto.randomUUID();const r=await C.repository.save({target:{type:'project',projectId:p.projectId},baseRevision:null,snapshot:p});if(!r.ok)throw Error(r.error);return p.projectId;});
  await page.locator('[data-identity-field=project]').fill(id);faults.set(B.label,{path:'/v2/studio/document',kind:'commit'});await page.locator('[data-cloud-action=save]').click();await page.waitForFunction(()=>!document.querySelector('[data-cloud-action=save]').disabled);await page.waitForFunction(()=>Array.from(document.querySelectorAll('select[aria-label="未送信・復旧操作"] option')).some(x=>x.textContent.startsWith('結果不明')),{},{timeout:5000});
  result.projectUnknown={projectId:id,retained:await page.evaluate(id=>CruiseStudio.repository.read({type:'project',projectId:id}).exists,id)};assert(result.projectUnknown.retained);const committed=await db.prepare('SELECT revision FROM studio_document_records WHERE record_id=?').bind(id).first();assert.equal(committed.revision,1);result.projectUnknown.remoteCommitted=true;
 });
 await check('native Port App Device revocation rejects subsequent Sync and retains local bytes',async()=>{
  const credential=await pa.evaluate(()=>SoundCruiseMultiAppSync.runtimes.port.store.readMeta('credential')),before=await pa.evaluate(()=>localStorage.getItem('cruisePort.gearList'));
  await db.prepare('UPDATE sync_devices SET revoked_at=? WHERE id=?').bind(Date.now(),credential.split('.')[1]).run();
  const code=await pa.evaluate(async()=>{try{await SoundCruiseMultiAppSync.runtimes.port.sync('explicit-device-revoked');return 'unexpected';}catch(e){return e.code||e.message;}});assert.match(code,/revoked|invalid_credential/);assert.equal(await pa.evaluate(()=>localStorage.getItem('cruisePort.gearList')),before);
 });
 await check('Account A to B replacement fences the open Port form and preserves A data/binary/Outbox',async()=>{
  await pa.evaluate(()=>location.hash='#wishlist');await pa.locator('.gear-card',{hasText:'Offline guitar'}).click();await pa.locator('#gear-name').fill('FORBIDDEN old A form');
  const before=await pa.evaluate(async()=>({gear:localStorage.getItem('cruisePort.gearList'),assets:localStorage.getItem('cruisePort.syncAssetMetadata'),outbox:await SoundCruiseMultiAppSync.runtimes.port.store.listOutbox(),binding:localStorage.getItem('cruisePort.syncLocalAccount.v1')}));
  const newAccount=await createAccount(A);assert.notEqual(newAccount.accountId,account.accountId);
  await pa.locator('#gear-list-form button[type=submit]').click();await pa.waitForTimeout(200);
  assert.equal(await pa.evaluate(()=>localStorage.getItem('cruisePort.gearList')),before.gear);assert.equal(await pa.evaluate(()=>localStorage.getItem('cruisePort.syncLocalAccount.v1')),before.binding);
  await pa.goto('https://studio.fixture.invalid/apps/cruise-port/pro_9a3943176561/#sync-center');await ready(pa);
  const denial=await pa.evaluate(async id=>{const adapter=new SoundCruisePortSync.PortSyncAdapter();try{const p=await adapter.inspectLocalAccount();await adapter.chooseLocalAccount({accountId:id,choice:'current',snapshotId:p.snapshotId,confirmed:true},()=>{});return 'unexpected';}catch(e){return e.message;}},newAccount.accountId);assert.equal(denial,'port_local_account_mismatch');
  assert.equal(await pa.evaluate(()=>localStorage.getItem('cruisePort.gearList')),before.gear);assert.equal(await pa.evaluate(()=>localStorage.getItem('cruisePort.syncAssetMetadata')),before.assets);
  result.accountSwitch={oldFormRejected:true,knownOwnerAdoptionRejected:true,localDataRetained:true};
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
 for(const context of contexts)for(const page of context.pages()){try{result.entranceDiagnostics.push(await page.evaluate(()=>({url:location.pathname,entry:globalThis.CruiseStudio?.entryAuth?.read(),locked:document.body.classList.contains('pro-gate-active'),gateError:document.getElementById('pro-gate-error')?.textContent,accountMessage:document.querySelector('#studio-entry-account p')?.textContent,sourceRevoked:globalThis.SoundCruiseProOperationSource?.read()?.revoked})));}catch{}}
 for(const context of contexts)for(const page of context.pages())for(const frame of page.frames()){
  if(!frame.url().includes('/apps/cruise-port/pro_'))continue;
  try{result.failureDiagnostics.push(await frame.evaluate(async()=>{
   const {createPortWriterContext}=await import('/apps/cruise-port/port-writer-context.mjs?v=1.28.2');
   const c=createPortWriterContext({root:window,storage:localStorage});await c.initialized;let admission='accepted';try{c.assertCurrent();}catch(error){admission=error.code||error.message;}
   return {route:location.hash,admission,ready:document.documentElement.dataset.portWriterReady,sharedAccountPresent:!!SoundCruiseSyncAccount?.storage,status:document.querySelector('[data-port-local-account] [role=status]')?.textContent};
  }));}catch{}
 }
 throw e;
}finally{result.status||='PASS';fs.writeFileSync(OUT+'/PRODUCT-E2E-RESULT.json',JSON.stringify(result,null,2));for(const c of contexts)await Promise.race([c.close(),new Promise(r=>setTimeout(r,3000))]);await browser?.close();await mf?.dispose();}
