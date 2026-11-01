/* Disposable product-page tests; no Production traffic, credentials or account writes. */
const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright'),fs=require('node:fs');
const url=process.env.STUDIO_URL,origin=new URL(url).origin,shots=process.env.STUDIO_SHOTS||'/tmp/studio071-shots';assert(['127.0.0.1','localhost'].includes(new URL(url).hostname));fs.mkdirSync(shots,{recursive:true});
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
async function fixture(account=A){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH}),context=await browser.newContext({serviceWorkers:'block',viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(15000);const errors=[],calls=[],mode={status:200,delay:0},tokens=new Map();page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async r=>{
  const q=r.request(),u=new URL(q.url());
  if(u.origin===origin){
   if(u.pathname==='/__account_seed')return r.fulfill({contentType:'text/html',body:'<script src="/apps/shared/sync-account/sync-account-core.js"></script><script src="/apps/shared/sync-account/sync-account-db.js"></script><script src="/apps/shared/sync-account/multi-app-sync-db.js"></script>'});
   if(u.pathname.endsWith('/pro-app-boot.js')){await new Promise(resolve=>setTimeout(resolve,250));return r.continue();}
   if(u.pathname.endsWith('.html')||u.pathname.endsWith('/')){const response=await r.fetch();return r.fulfill({response,headers:{...response.headers(),'content-security-policy':"connect-src 'self' https://sound-cruise-sync.cruise-port-requests.workers.dev; form-action 'self'"}});}
   return r.continue();
  }
  if(u.hostname==='sound-cruise-sync.cruise-port-requests.workers.dev'){
   if(q.method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'GET','access-control-allow-headers':'authorization'}});
   calls.push({path:u.pathname,method:q.method()});assert.equal(q.method(),'GET','Account status must not activate Sync or mutate remote data');assert.equal(u.pathname,'/v2/accounts/summary');
   const id=tokens.get(q.headers().authorization?.replace('Bearer ',''));assert(id,'only fixture credentials permitted');
   if(mode.delay)await new Promise(resolve=>setTimeout(resolve,mode.delay));
   return r.fulfill({status:mode.status,headers:{'access-control-allow-origin':origin},contentType:'application/json',body:JSON.stringify(mode.status===200?{ok:true,account:{id,state:'active'},memberships:[]}:{ok:false,code:mode.status===429?'rate_limited':'service_unavailable'})});
  }
  return r.abort();
 });
 await page.goto(origin+'/__account_seed');
 async function set(id){if(!id){await page.evaluate(()=>SoundCruiseSyncAccount.storage.clearAccount());return;}const token=await page.evaluate(async id=>{const m=SoundCruiseSyncAccount.core.createAccountCredential();await SoundCruiseSyncAccount.storage.setAccount({accountId:id,...m});return m.accountCredential;},id);tokens.set(token,id);}
 await set(account);await page.goto(url);await page.waitForFunction(()=>!!CruiseStudio.accountStatus);
 return {browser,context,page,errors,calls,mode,set,async close(){assert.deepEqual(errors,[]);await browser.close();}};
}
test('old PC Account is explained separately from Pro; no automatic migration; native Sync initially stays unverified',async()=>{
 const f=await fixture();try{await f.page.locator('[data-port-sync-status][data-studio-account-state=connected]').waitFor({state:'attached'});assert.match(await f.page.locator('[data-account-origin]').innerText(),/このPCのPort/);assert.match(await f.page.locator('[data-account-status]').innerText(),/Pro認証済み/);await f.page.locator('[data-open-sync]').click();const frame=f.page.frameLocator('#port-sync-surface iframe');await frame.locator('#sync-center-view:not([hidden])').waitFor();await frame.locator('#sync-center-account-status').filter({hasText:'同期情報は未確認'}).waitFor();assert.equal(await frame.locator('#sync-center-account-status').getAttribute('data-sync-account-state'),'unknown');assert(f.calls.every(x=>x.method==='GET'));assert.equal(await frame.locator('#port-sync-activate').isEnabled(),true);await f.page.screenshot({path:shots+'/account-existing-pc.png'});
 }finally{await f.close();}
});
test('no Port Home flash while native boot is delayed; native state/Controller stays unchanged',async()=>{
 const f=await fixture();try{await f.page.evaluate(()=>{window.flashSamples=[];let frames=0;const sample=()=>{for(const e of document.querySelectorAll('#port-sync-surface iframe')){const h=e.contentDocument?.getElementById('home-view');if(e.getClientRects().length&&getComputedStyle(e).visibility==='visible'&&h&&!h.hidden)flashSamples.push('home');}if(++frames<120)requestAnimationFrame(sample);};requestAnimationFrame(sample);});await f.page.locator('[data-open-sync]').click();await f.page.waitForFunction(()=>document.querySelector('#port-sync-surface iframe')?.contentDocument?.getElementById('sync-center-view')?.hidden===false&&getComputedStyle(document.querySelector('#port-sync-surface iframe')).visibility==='visible');assert.deepEqual(await f.page.evaluate(()=>flashSamples),[]);await f.page.waitForFunction(()=>CruiseStudio.accountStatus.diagnostics().state!=='checking'&&CruiseStudio.accountStatus.diagnostics().frames[0]?.nativeFirstStateMs!==null);const d=await f.page.evaluate(()=>CruiseStudio.accountStatus.diagnostics());assert(d.frames[0].iframeReadyMs>=0);assert(!JSON.stringify(d).includes(A));fs.writeFileSync(shots+'/account-normal-timings.json',JSON.stringify({production:false,syntheticNativeBootDelayMs:250,homeFlashFrames:await f.page.evaluate(()=>flashSamples.length),...d},null,2));
 }finally{await f.close();}
});
test('unconnected, same-page connection, slow checking, 429, 503, offline and reconnection are distinct',async()=>{
 const f=await fixture(null);try{const card=f.page.locator('[data-port-sync-status]');await card.locator('[data-account-target]').filter({hasText:'未接続'}).waitFor();await f.set(A);await card.locator('[data-account-target]').filter({hasText:'接続先を確認しました'}).waitFor();
 f.mode.delay=350;await card.locator('[data-check-account]').click();await card.locator('[data-account-target]').filter({hasText:'確認中'}).waitFor();await card.locator('[data-account-target]').filter({hasText:'接続先を確認しました'}).waitFor();const time=await f.page.evaluate(()=>CruiseStudio.accountStatus.diagnostics().timings.requestMs);assert(time>=300);f.mode.delay=0;
 for(const status of [429,503]){f.mode.status=status;const n=f.calls.length;await card.locator('[data-check-account]').click();await card.locator('[data-account-target]').filter({hasText:'通信失敗'}).waitFor();assert.equal(f.calls.length,n+1);assert.equal(await f.page.evaluate(()=>SoundCruiseSyncAccount.storage.getAccount().then(a=>a.accountId)),A);}
 await f.context.setOffline(true);await card.locator('[data-check-account]').click();await card.locator('[data-account-target]').filter({hasText:'オフライン'}).waitFor();f.mode.status=200;await f.context.setOffline(false);await card.locator('[data-account-target]').filter({hasText:'接続先を確認しました'}).waitFor();await card.locator('[data-check-account]').click();await card.locator('[data-account-target]').filter({hasText:'接続先を確認しました'}).waitFor();
 }finally{await f.close();}
});
test('A form/data and actual native Outbox remain under B; no push/adoption from the status UI',async()=>{
 const f=await fixture();try{await f.page.locator('[data-port-sync-status][data-studio-account-state=connected]').waitFor({state:'attached'});await f.page.evaluate(async A=>{const db=globalThis.SoundCruiseMultiAppSync?.dataStorage;if(!db)await import('/apps/shared/sync-account/multi-app-sync-db.js');window.Apending=SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:A});await Apending.putOutbox({operationId:'synthetic-A-pending',entityId:'A-only',kind:'gear',value:{name:'Synthetic A'},baseRevision:1});},A);
 await f.page.locator('[data-home-workspace=portGear]').click();const fr=await(await f.page.locator('#port-gear-surface iframe').elementHandle()).contentFrame();await fr.locator('#gear-list-title-add').click();await fr.locator('#gear-name').fill('A unsaved');await fr.locator('#gear-category').selectOption('guitar');await fr.locator('#gear-status').selectOption('owned');await fr.evaluate(()=>SoundCruisePortSync.portRepository().captureAccountContext());const before=await f.page.evaluate(async()=>({gear:localStorage.getItem('cruisePort.gearList'),pending:await Apending.listOutbox()}));
 await f.set(B);await f.page.locator('[data-port-sync-status][data-studio-account-state=connected]').waitFor({state:'attached'});await fr.locator('#gear-list-form').evaluate(e=>e.requestSubmit());await fr.locator('#gear-form-error:not([hidden])').waitFor();assert.equal(await fr.locator('#gear-name').inputValue(),'A unsaved');assert.deepEqual(await f.page.evaluate(async()=>({gear:localStorage.getItem('cruisePort.gearList'),pending:await Apending.listOutbox()})),before);assert.equal(await f.page.evaluate(async B=>(await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:B}).listOutbox()).length,B),0);assert(f.calls.every(c=>c.path==='/v2/accounts/summary'&&c.method==='GET'));
 }finally{await f.close();}
});
test('five themes and four widths keep Account information, guide and Sync frame usable',async()=>{
 const f=await fixture();try{await f.page.locator('[data-open-sync]').click();await f.page.frameLocator('#port-sync-surface iframe').locator('[data-studio-account-summary]').waitFor();for(const theme of ['dark','midnight','charcoal','gray','light']){await f.page.evaluate(t=>CruiseStudio.colorTheme.setColorTheme(t),theme);for(const width of [1440,1024,768,390]){await f.page.setViewportSize({width,height:1000});assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await f.page.screenshot({path:shots+'/'+theme+'-'+width+'.png'});}}
 }finally{await f.close();}
});
