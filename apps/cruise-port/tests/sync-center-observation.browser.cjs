// Disposable loopback product pages only; no real Account, qualification or remote request.
const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright'),fs=require('node:fs');
const fixed=process.env.PORT_FIXED_URL,baseline=process.env.PORT_BASELINE_URL,old=process.env.PORT_OLD_URL,previous=process.env.PORT_PREVIOUS_URL;
for(const u of [fixed,baseline,old,previous])assert(['127.0.0.1','localhost'].includes(new URL(u).hostname));
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
async function fixture(origin,edition='pro',account=A){
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),calls=[],errors=[],mode={status:200,delay:0},tokens=new Map();page.setDefaultTimeout(12000);
 await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{get:()=>true}));page.on('pageerror',e=>errors.push(e.stack||e.message));
 await context.route('**/*',async route=>{
  const q=route.request(),u=new URL(q.url());
  if(u.origin===origin){
   if(u.pathname==='/__seed')return route.fulfill({contentType:'text/html',body:'<script src="/apps/shared/sync-account/sync-account-core.js"></script><script src="/apps/shared/sync-account/sync-account-db.js"></script><script src="/apps/shared/sync-account/multi-app-sync-db.js"></script>'});
   if(u.pathname.endsWith('.html')||u.pathname.endsWith('/')){const response=await route.fetch();return route.fulfill({response,headers:{...response.headers(),'content-security-policy':"connect-src 'self' https://sound-cruise-sync.cruise-port-requests.workers.dev; form-action 'self'"}});}
   return route.continue();
  }
  if(u.hostname!=='sound-cruise-sync.cruise-port-requests.workers.dev')return route.abort();
  const headers={'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST','access-control-allow-headers':'authorization,content-type,x-sound-cruise-pro-authorization'};
  if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  calls.push({path:u.pathname,method:q.method()});
  if(!['/v2/accounts/summary','/v2/accounts/devices'].includes(u.pathname))return route.fulfill({status:503,headers,json:{ok:false,code:'synthetic_write_blocked'}});
  const id=tokens.get(q.headers().authorization?.replace('Bearer ',''));assert(id,'synthetic credentials only');if(mode.delay)await new Promise(r=>setTimeout(r,mode.delay));
  return route.fulfill({status:mode.status,headers,json:mode.status===200?(u.pathname.endsWith('/summary')?{ok:true,account:{id,state:'active'},memberships:[]}:{ok:true,devices:[],appDevices:[]}):{ok:false,code:mode.status===410?'account_device_revoked':mode.status===429?'rate_limited':'service_unavailable'}});
 });
 await page.goto(origin+'/__seed');
 async function choose(id){const material=await page.evaluate(async id=>{if(!id){await SoundCruiseSyncAccount.storage.clearAccount();return null;}const m=SoundCruiseSyncAccount.core.createAccountCredential();await SoundCruiseSyncAccount.storage.setAccount({accountId:id,...m});return m.accountCredential;},id);if(material)tokens.set(material,id);}
 await choose(account);const url=origin+'/apps/cruise-port/'+(edition==='pro'?'pro_9a3943176561/':'')+'#sync-center';await page.goto(url);await page.locator('#sync-center-view:not([hidden])').waitFor();
 return {browser,context,page,calls,errors,mode,choose,url,async close(){await browser.close();assert.deepEqual(errors,[]);}};
}
async function snapshot(f,name){
 const dir=process.env.PORT_SHOTS;if(!dir)return;fs.mkdirSync(dir,{recursive:true});
 await f.page.locator('#sync-center-account-display-id').evaluateAll(es=>es.forEach(e=>e.style.visibility='hidden'));
 await f.page.screenshot({path:dir+'/'+name+'.png'});
}
async function confirmed(f){await f.page.locator('#sync-center-account-status[data-sync-account-state=active]').filter({hasText:'作成済み'}).waitFor();}
function readonly(f){assert(f.calls.every(c=>c.method==='GET'&&['/v2/accounts/summary','/v2/accounts/devices'].includes(c.path)));}
test('same product scenario: old 1.21.3 automatically reads remote Account; 1.24.24 remains local unknown',async()=>{
 const a=await fixture(old);try{await confirmed(a);assert(a.calls.some(c=>c.path.endsWith('/summary')));assert(a.calls.some(c=>c.path.endsWith('/devices')));assert(await a.page.evaluate(()=>!!SoundCruiseMultiAppSync.runtimes?.port));}finally{await a.close();}
 const b=await fixture(baseline);try{await b.page.locator('#sync-center-account-status[data-sync-account-state=unknown]').waitFor();await snapshot(b,'before-12424');assert.equal(b.calls.length,0);assert.equal(await b.page.evaluate(()=>!!SoundCruiseMultiAppSync.runtimes?.port),false);}finally{await b.close();}
});
for(const edition of ['standard','pro'])test(edition+' native product auto confirms Account without provisioning/runtime/adoption',async()=>{
 const f=await fixture(fixed,edition);try{await confirmed(f);await f.page.locator('#sync-center-port-status-chip[data-sync-port-status=unstarted]').waitFor();readonly(f);assert.equal(await f.page.evaluate(()=>!!SoundCruiseMultiAppSync.runtimes?.port),false);if(edition==='pro')await snapshot(f,'after-12425');const n=f.calls.length;await f.page.evaluate(()=>dispatchEvent(new CustomEvent('cruise-port-sync-state')));await f.page.locator('#sync-center-account-status[data-sync-account-state=active]').filter({hasText:'作成済み'}).waitFor();assert.equal(f.calls.length,n);
 if(edition==='pro'){
  const response=f.page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/accounts/summary');
  await f.page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  await response;await confirmed(f);assert.equal(f.calls.length,n+2);readonly(f);
 }
 }finally{await f.close();}
});
test('slow Account read survives local status notifications and overlapping view renders',async()=>{
 const f=await fixture(fixed);try{await confirmed(f);f.mode.delay=300;const n=f.calls.length;await f.page.evaluate(()=>{location.hash='';});await f.page.locator('#home-view:not([hidden])').waitFor();await f.page.evaluate(()=>{location.hash='#sync-center';});await f.page.locator('#sync-center-account-status').filter({hasText:'確認中'}).waitFor();await f.page.evaluate(()=>{dispatchEvent(new CustomEvent('cruise-port-sync-state'));dispatchEvent(new CustomEvent('cruise-port-sync-state'));});await confirmed(f);assert.equal(f.calls.length,n+2);readonly(f);}finally{await f.close();}
});
test('PWA-style return, 429/503/offline and Device refusal retain Account and restore through real readonly entry',async()=>{
 const f=await fixture(fixed);try{await confirmed(f);for(const status of [429,503,410]){
 f.mode.status=status;await f.page.evaluate(()=>location.hash='');await f.page.locator('#home-view:not([hidden])').waitFor();await f.page.evaluate(()=>location.hash='#sync-center');await f.page.locator('#sync-center-view[data-sync-state=error]').waitFor();assert.equal(await f.page.evaluate(()=>SoundCruiseSyncAccount.storage.getAccount().then(a=>a.accountId)),A);
 f.mode.status=200;await f.page.locator('[aria-controls=sync-center-app-info-pitch]').click();await f.page.locator('#sync-center-app-info-pitch .sync-center-app-info-retry').click();await confirmed(f);}
 await f.context.setOffline(true);await f.page.evaluate(()=>location.hash='');await f.page.locator('#home-view:not([hidden])').waitFor();await f.page.evaluate(()=>location.hash='#sync-center');await f.page.locator('#sync-center-view[data-sync-state=offline]').waitFor();await f.context.setOffline(false);await confirmed(f);readonly(f);
 }finally{await f.close();}
});
test('unconnected has no API and A-B-A readonly return never moves local data or Account-scoped pending',async()=>{
 const u=await fixture(fixed,'standard',null);try{await u.page.locator('#sync-center-account-status[data-sync-account-state=unset]').waitFor();assert.equal(u.calls.length,0);}finally{await u.close();}
 const f=await fixture(fixed);try{await confirmed(f);await f.page.evaluate(async A=>{localStorage.setItem('synthetic-original-data','keep');globalThis.keepA=SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:A});await keepA.putOutbox({operationId:'synthetic-pending',recordType:'gear_item',recordId:'only-A',payload:{name:'synthetic'}});},A);const before=await f.page.evaluate(async()=>({pending:await keepA.listOutbox(),local:localStorage.getItem('synthetic-original-data')}));
 for(const id of [B,A]){await f.choose(id);await f.page.evaluate(()=>location.hash='');await f.page.locator('#home-view:not([hidden])').waitFor();await f.page.evaluate(()=>location.hash='#sync-center');await confirmed(f);assert.equal(await f.page.evaluate(()=>SoundCruiseSyncAccount.storage.getAccount().then(a=>a.accountId)),id);}
 assert.deepEqual(await f.page.evaluate(async()=>({pending:await keepA.listOutbox(),local:localStorage.getItem('synthetic-original-data')})),before);assert.equal(await f.page.evaluate(async B=>(await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:B}).listOutbox()).length,B),0);readonly(f);
 }finally{await f.close();}
});

for(const edition of ['standard','pro'])test(edition+' product shows retained inactive credential as stopped and exposes explicit guarded action',async()=>{
 const f=await fixture(fixed,edition);try{await confirmed(f);
 await retainCredential(f);
 await f.page.evaluate(()=>location.hash='');await f.page.locator('#home-view:not([hidden])').waitFor();await f.page.evaluate(()=>location.hash='#sync-center');await confirmed(f);
 await f.page.locator('#sync-center-port-status-chip').filter({hasText:'同期は停止中'}).waitFor();await f.page.locator('#sync-center-port-status-detail').filter({hasText:'Accountは確認済み'}).waitFor();
 readonly(f);assert.equal(await f.page.evaluate(()=>!!SoundCruiseMultiAppSync.runtimes?.port),false);
 for(const width of [390,1280]){await f.page.setViewportSize({width,height:900});assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await snapshot(f,'stopped-'+edition+'-'+width+'-12426');}
 await f.page.locator('#port-sync-activate').click({force:true});
 if(edition==='standard'){await f.page.locator('.sync-pro-feedback').filter({hasText:'Pro版'}).waitFor();readonly(f);}
 else {await f.page.locator('#sync-center-alert:not([hidden])').filter({hasText:'保存内容は保持'}).waitFor();assert(f.calls.some(c=>!['/v2/accounts/summary','/v2/accounts/devices'].includes(c.path)));}
 await f.page.locator('#sync-center-apps:not([aria-busy])').waitFor();
 await snapshot(f,'retained-'+edition+'-12426');
 }finally{await f.close();}
});

async function retainCredential(f){await f.page.evaluate(async A=>{const s=SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:A});const c=SoundCruiseSyncAccount.core.createAppCredential();await s.setMeta('credential',c.appDeviceCredential);await s.setMeta('membership',{state:'active'});await s.setMeta('runtimeState','ready');await s.setMeta('migrationState','complete');await s.setMeta('datasetState','ready');await s.setMeta('lastSyncAt',1);},A);}
test('published 1.24.25 same retained-credential scenario reproduces non-actionable attention',async()=>{
 const f=await fixture(previous);try{await confirmed(f);await retainCredential(f);await f.page.evaluate(()=>location.hash='');await f.page.locator('#home-view:not([hidden])').waitFor();await f.page.evaluate(()=>location.hash='#sync-center');await confirmed(f);await f.page.locator('#sync-center-port-status-chip[data-sync-port-status=attention]').waitFor();assert.equal(await f.page.locator('#sync-center-port-status-chip').evaluate(e=>e.tagName),'SPAN');readonly(f);await snapshot(f,'before-12425-retained');}finally{await f.close();}
});
