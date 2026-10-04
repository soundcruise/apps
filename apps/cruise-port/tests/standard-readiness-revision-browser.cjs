// Isolated fixtures and browser storage only. No production Account/data writes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
const base='http://127.0.0.1:8765',root='/apps/cruise-port/',pro=root+'pro_9a3943176561/';
const out='/tmp/port-standard-revision';
const credential='scp1.00000000-0000-4000-8000-000000000000.'+'A'.repeat(43);
const fixtures=['acoustic_guitar','artist_guitar','live_guitar'].map((category,i)=>({id:'local-news-'+i,label:'Local NEWS '+i,sourceName:'Local fixture',sourceUrl:'https://example.invalid/news/'+i,publishedAt:new Date(Date.now()-i*3600000).toISOString(),category,publishable:true}));
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:393,height:852},reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[],requests=[];let newsMode='fixture';
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await context.route('**/*',async r=>{
  const u=new URL(r.request().url());
  if(u.origin===base){
   if(u.pathname==='/__cruise_preview/news'){
    if(newsMode==='public')return r.continue();
    return r.fulfill({status:newsMode==='failure'?503:200,contentType:'application/json',body:JSON.stringify(newsMode==='failure'?{}:{contractVersion:1,items:fixtures,nextOffset:null})});
   }return r.continue();
  }
  requests.push({url:u.href,method:r.request().method()});
  let payload={ok:false,error:'isolated-local-test'},status=503;
  if(u.pathname.startsWith('/v2/pro-auth/')){status=200;payload={ok:true,generation:1,legacyCompatibilityEnabled:false,credential};}
  if(u.pathname==='/v2/accounts/summary'){status=200;payload={ok:true,account:{id:'00000000-0000-4000-8000-000000000001',state:'active',recoveryVersion:1},memberships:['pitch','fretboard','rhythm','chord','port'].map(appId=>appId==='pitch'?{appId,state:'pending',dataset:null}:{appId,state:'active',activeAppDeviceCount:1,dataset:{state:'ready',recordCount:1,schemaVersion:1}})};}
  if(u.pathname==='/v2/accounts/devices'){status=200;payload={ok:true,devices:[],appDevices:[]};}
  return r.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
 });
 const ready=async path=>{await page.goto(base+path,{waitUntil:'networkidle'});await page.locator('.port-app-version-display').first().filter({hasText:'1.18.0'}).waitFor();};
 const hash=async h=>{await page.evaluate(h=>location.hash=h,h);await page.waitForTimeout(120);};
 const openNews=async()=>{await hash('#news');await page.locator('#news-category').waitFor({state:'visible'});await page.locator('#news-category').selectOption('');};
 const overflow=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+page.url());
 const shot=async(name,w)=>{await overflow();await page.screenshot({path:out+'/'+name+'-'+w+'.png',fullPage:true});};
 const seedAuth=()=>page.evaluate(credential=>localStorage.setItem('soundCruiseProAuth',JSON.stringify({v:2,credential,generation:1,validatedAt:Date.now()})),credential);
 try{
  await ready(root);await page.locator('#news-entry').waitFor({state:'visible'});
  await page.evaluate(async()=>{
   const m=SoundCruiseSyncAccount.core.createAccountMaterial();
   await SoundCruiseSyncAccount.storage.setAccount({accountCredential:m.accountCredential,accountDeviceId:m.accountDeviceId,accountId:'00000000-0000-4000-8000-000000000001',state:'active'});
  });await seedAuth();requests.length=0;
  await ready(root+'?edition=pro&pro=1#sync-center');await page.locator('#sync-center-view').waitFor({state:'visible'});
  await page.locator('#sync-center-ai-support').waitFor({state:'hidden'});
  const saved=await page.evaluate(()=>SoundCruiseSyncAccount.storage.getAccount());
  assert.equal(requests.filter(r=>r.method!=='GET').length,0,'saved Account must not start sync');
  const defaultDenial=await page.evaluate(async()=>{
   const cap=await import('./cruise-port-capabilities.js?v=1.18.0');
   const controller=SoundCruisePortSync.createPortSyncController({config:__SOUND_CRUISE_SYNC_CENTER__});
   const {createSyncCenterOrchestrator}=await import('./sync-center-orchestrator.js?v=1.18.0');
   const {createPortAccountJoin}=await import('./port-account-join.js?v=1.18.0');
   const join=createPortAccountJoin({client:{request:async()=>{throw new Error('must not request');}}});
   const joinDenials=await Promise.all(['issue','consume','resume'].map(async key=>{try{await join[key]('local-probe');return 'bypass';}catch(e){return e.message;}}));
   const {PortAssetSync}=await import('./port-asset-sync.js?v=1.18.0');
   const {createAiSupportClient}=await import('./ai-support-client.js?v=1.18.0');
   const o=createSyncCenterOrchestrator({config:__SOUND_CRUISE_SYNC_CENTER__,navigate:()=>{}});
   const homeLaunch=await o.launchFromHome('pitch');
   const results=await Promise.all(['prepareAll','launch','addEnvironment','issuePortAddition','connectExistingAccount','launchSameContainer'].map(async key=>{try{await o[key]('pitch');return 'bypass';}catch(e){return e.message;}}));
   return {homeLaunch,joinDenials,allowed:cap.getCapabilities().cloudSyncOperations,runtime:!!controller.runtime,ops:await Promise.all([controller.ensure(),controller.sync(),controller.resolveConflict({}),controller.retryLegacyFailures(),new PortAssetSync().schedule('probe')]),results,ai:await createAiSupportClient({endpoint:__SOUND_CRUISE_SYNC_CENTER__.endpoint}).send({message:'同期を確認したいです'})};
  });
  assert(defaultDenial.joinDenials.every(r=>r==='pro_required'));assert.equal(defaultDenial.homeLaunch.kind,'open');assert(defaultDenial.homeLaunch.url.endsWith('/pitch-cruise/standard/'));assert.equal(defaultDenial.allowed,false);assert.equal(defaultDenial.runtime,false);
  assert(defaultDenial.ops.every(r=>r.code==='pro_required'));assert(defaultDenial.results.every(r=>r==='pro_required'));assert.equal(defaultDenial.ai.kind,'auth');
  assert.equal(requests.filter(r=>r.method!=='GET').length,0,'direct/default API must not send');
  for(const width of [375,393,768,1280]){
   await page.setViewportSize({width,height:852});await hash('');await page.locator('#news-entry').waitFor({state:'visible'});await page.locator('#news-ticker').waitFor({state:'visible'});await shot('standard-home',width);
   await openNews();assert.equal(await page.locator('.news-card').count(),4);await shot('standard-news',width);
   await page.locator('#news-category').selectOption('artist_event');assert.equal(await page.locator('.news-card').count(),2);
   await page.locator('#news-category').selectOption('acoustic_guitar');assert.equal(await page.locator('.news-card').count(),1);
   assert.equal(await page.locator('.news-card').getAttribute('target'),'_blank');
   await page.locator('#news-category').selectOption('cruise_apps');await page.locator('.news-card').click();await page.locator('#news-article-view').waitFor({state:'visible'});await overflow();
   await hash('#sync-center');await page.locator('.sync-pro-note').waitFor({state:'visible'});assert.equal(await page.locator('.sync-pro-note a').count(),1);
   await page.locator('[data-sync-app-action]:visible').first().click({force:true});await page.locator('.sync-pro-feedback').waitFor({state:'visible'});assert.equal(await page.locator('dialog[open]').count(),0);await shot('standard-sync-locked',width);
   await page.locator('#sync-center-account-help-toggle').click();await page.locator('#sync-center-account-help').waitFor({state:'visible'});await page.locator('#sync-center-account-help-toggle').click();
   await page.locator('.sync-pro-note a').click();await page.locator('#pro-access-title').waitFor({state:'visible'});await overflow();
  }
  await ready(root+'#sync-center');await page.locator('#sync-center-view').waitFor({state:'visible'});assert.deepEqual(await page.evaluate(()=>SoundCruiseSyncAccount.storage.getAccount()),saved);
  assert.equal(requests.filter(r=>r.method!=='GET').length,0,'Standard reload preserves data and blocks startup writes');
  newsMode='failure';await ready(root);await page.locator('#news-entry').waitFor({state:'visible'});await openNews();assert.equal(await page.locator('.news-card').count(),1);assert(await page.getByText('外部ニュースを読み込めませんでした。',{exact:false}).isVisible());
  newsMode='fixture';await seedAuth();await ready(pro+'#sync-center');await page.locator('#sync-center-view').waitFor({state:'visible'});
  for(const width of [375,393,768,1280]){
   await page.setViewportSize({width,height:852});await hash('');await page.locator('#news-entry').waitFor({state:'visible'});await shot('pro-home',width);
   await openNews();assert.equal(await page.locator('.news-card').count(),4);await shot('pro-news',width);
   await page.locator('#news-category').selectOption('cruise_apps');await page.locator('.news-card').click();await page.locator('#news-article-view').waitFor({state:'visible'});
   await hash('#sync-center');assert.equal(await page.locator('.sync-operation-locked').count(),0);await page.locator('.sync-pro-note').waitFor({state:'hidden'});assert.equal(await page.locator('[data-standard-pro-link]:visible').count(),0);await page.locator('#sync-center-ai-support').waitFor({state:'visible'});assert.equal(await page.locator('[data-sync-app-action]').first().getAttribute('aria-disabled'),null);await shot('pro-sync',width);
  }
  assert.equal(await page.evaluate(async()=> (await import('../cruise-port-capabilities.js?v=1.18.0')).getCapabilities().cloudSyncOperations),true);
  // Actual public feed, read-only via loopback proxy. Account cleared in isolated storage only.
  await page.evaluate(()=>SoundCruiseSyncAccount.storage.clearAccount());await page.setViewportSize({width:393,height:852});newsMode='public';const publicCounts={};
  for(const [edition,path] of [['standard',root],['pro',pro]]){
   await ready(path);await page.locator('#news-entry').waitFor({state:'visible'});await openNews();
   const all=await page.locator('.news-card').count();assert(all>1,'real external NEWS must load');
   await page.locator('#news-category').selectOption('cruise_apps');assert.equal(await page.locator('.news-card').count(),1);await page.locator('.news-card').click();await page.locator('#news-article-view').waitFor({state:'visible'});
   publicCounts[edition]={all,external:all-1,internal:1};await openNews();await page.locator('#news-category').selectOption('');await shot(edition+'-real-news',393);
  }
  assert.deepEqual(publicCounts.standard,publicCounts.pro);assert.deepEqual(errors,[]);
  const result={result:'PASS',widths:[375,393,768,1280],defaultDenial,standardSavedAccountNoWrites:true,standardReloadNoWrites:true,accountHelpAvailable:true,lockedCTAWorks:true,proNoLocks:true,proAIVisible:true,newsOutageOwnOnly:true,publicCounts,pageErrors:errors,allAccountAndAuthRequestsIntercepted:true,productionDataWrites:0};
  fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){console.error('Failure',page.url(),errors,(await page.locator('body').innerText()).slice(0,8000));throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
