// Isolated local acceptance: every non-local request receives a synthetic response.
// NODE_PATH=<Playwright runtime> node apps/cruise-port/tests/standard-readiness-browser.cjs [origin] [output]
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.argv[2]||'http://127.0.0.1:8765';
const out=process.argv[3]||'/tmp/port-standard-readiness';
const root='/apps/cruise-port/',pro=root+'pro_9a3943176561/';
const credential='scp1.00000000-0000-4000-8000-000000000000.'+'A'.repeat(43);
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:393,height:852},reducedMotion:'reduce'});
 const page=await context.newPage();const errors=[],external=[];let authMode='valid';
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await context.route('**/*',async route=>{
  const u=route.request().url();if(u.includes('/__cruise_preview/news'))return route.fulfill({contentType:'application/json',body:JSON.stringify({contractVersion:1,items:[],nextOffset:null})});if(new URL(u).origin===base)return route.continue();
  external.push({url:u,method:route.request().method()});
  if(u.includes('/v2/pro-auth/')){
   if(authMode==='offline')return route.abort();
   return route.fulfill({status:authMode==='invalid'?401:u.endsWith('/verify')?201:200,contentType:'application/json',body:JSON.stringify({ok:authMode!=='invalid',generation:authMode==='generation'?2:1,legacyCompatibilityEnabled:false,credential})});
  }
  if(u.includes('/v1/news'))return route.fulfill({contentType:'application/json',body:JSON.stringify({contractVersion:1,items:[],nextOffset:null})});
  return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"isolated-local-test"}'});
 });
 async function ready(path=root){await page.goto(base+path,{waitUntil:'networkidle'});await page.locator('.port-app-version-display').first().filter({hasText:'Ver 1.18.0'}).waitFor();}
 async function hash(h){await page.evaluate(h=>location.hash=h,h);await page.waitForTimeout(70);}
 async function overflow(){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),page.url()+' overflow');}
 async function shot(name,width){await overflow();await page.screenshot({path:out+'/'+name+'-'+width+'.png',fullPage:true});}
 async function seedAuth(){await page.evaluate(credential=>localStorage.setItem('soundCruiseProAuth',JSON.stringify({v:2,credential,generation:1,validatedAt:Date.now()})),credential);}
 try{
  // Fresh isolated browser has no prior Pro credential: boot stays locked until verification.
  await page.goto(base+pro,{waitUntil:'networkidle'});
  await page.locator('#pro-gate-overlay').waitFor({state:'visible'});
  assert.equal(await page.locator('.port-app-version-display').first().textContent(),'');
  await page.evaluate(()=>{window.__SOUND_CRUISE_ACCOUNT_TURNSTILE__={getToken:async()=> 'synthetic-local-token'};});
  await page.locator('#pro-gate-input').fill('0000');await page.locator('#pro-gate-submit').click();
  await page.locator('.port-app-version-display').first().filter({hasText:'Ver 1.18.0'}).waitFor();
  assert.equal(await page.locator('#pro-gate-overlay').count(),0);
  await ready(pro);assert.equal(await page.locator('#pro-gate-overlay').count(),0);
  await ready();
  assert.equal(await page.locator('[data-standard-pro-link]:visible').count(),1);
  // Seed representative pre-existing data before the next app bootstrap.
  await page.goto(base+root+'pro-access.html');
  const snapshot=await page.evaluate(async()=>{
   const pm=await import('./practice-menu-store.js');const ma=await import('./my-apps-store.js');
   const menus=[];for(let i=0;i<5;i++)menus.push(pm.createPracticeMenu({...pm.INITIAL_PRACTICE_MENU_VALUES,name:'Local QA '+i,memo:'preserve me'},menus));
   assertResult(pm.savePracticeMenus(menus));
   const apps=[];for(let i=0;i<5;i++){const r=ma.createMyApp({name:'Local app '+i,url:'https://example.invalid/'+i},apps);assertResult(r);apps.push(r.item);}assertResult(ma.saveMyApps(apps));
   const tuner=await import('./tuner-store.js');assertResult(tuner.saveTunerSettings({...tuner.TUNER_DEFAULTS,capo:4}));
   function assertResult(r){if(!r.ok)throw new Error(JSON.stringify(r));}
   return {menus:localStorage.getItem('cruisePort.practiceMenus'),apps:localStorage.getItem('cruisePort.myApps'),tuner:localStorage.getItem('cruisePort.tuner')};
  });
  await seedAuth();await ready(root+'?edition=pro&pro=1');
  for(const width of [375,393,768,1280]){
   await page.setViewportSize({width,height:852});await hash('');await shot('standard-home',width);
   await hash('#settings');assert.equal(await page.locator('[data-standard-pro-link]:visible').count(),1);await shot('standard-settings',width);
   await hash('#tuner');assert(await page.locator('#tuner-capo-lock').isVisible());assert(await page.locator('#tuner-capo-up').isHidden());await shot('standard-locked-tuner',width);
   await hash('#pro-access');assert(await page.locator('#pro-access-title').isVisible());await shot('standard-access',width);
   await page.goto(base+root+'pro-access.html',{waitUntil:'networkidle'});await page.locator('#pro-access-title').waitFor();await shot('standalone-access',width);
   assert.equal(await page.locator('.pro-access-step').count(),3);
   assert.equal(await page.locator('a[target="_blank"][rel="noopener noreferrer"]').count(),2);
   assert.equal(await page.locator('a').filter({hasText:'Pro版を開く'}).getAttribute('href'),pro);
   await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement.tagName==='A'));
   await ready();
  }
  await hash('#practice-menu/new');assert.notEqual(new URL(page.url()).hash,'#practice-menu/new');assert(await page.locator('.port-pro-prompt').isVisible());await page.keyboard.press('Escape');assert(await page.locator('.port-pro-prompt').isHidden());
  await hash('#my-apps/new');assert.notEqual(new URL(page.url()).hash,'#my-apps/new');assert(await page.locator('.port-pro-prompt').isVisible());await page.keyboard.press('Escape');
  const denial=await page.evaluate(async()=>{
   const caps=(await import('./cruise-port-capabilities.js?v=1.18.0')).getCapabilities();
   const {createGearPhotoStore}=await import('./gear-photo-store.js?v=1.18.0');
   const {createMyAppsIconStore}=await import('./my-apps-icon-store.js?v=1.18.0');
   const {createPracticeAttachmentStore}=await import('./practice-menu-attachment-store.js?v=1.18.0');
   const {createMyAppEntry}=await import('./my-apps-icon-workflow.js?v=1.18.0');
   const r=await createMyAppEntry({items:[],values:{name:'denied',url:'https://example.invalid/'}});
   return {caps,results:await Promise.all([createGearPhotoStore().savePhoto(new Blob()),createMyAppsIconStore().saveIcon(new Blob()),createPracticeAttachmentStore().addAttachment('x',new Blob()),Promise.resolve(r)])};
  });assert.equal(denial.caps.tunerCapo,false);assert.deepEqual(denial.results.map(r=>r.reason),['pro-required','pro-required','pro-required','creation-blocked']);
  assert.deepEqual(await page.evaluate(()=>({menus:localStorage.getItem('cruisePort.practiceMenus'),apps:localStorage.getItem('cruisePort.myApps'),tuner:localStorage.getItem('cruisePort.tuner')})),snapshot);
  // Invalid session / generation are rejected; previously validated offline access is intentionally retained.
  for(const mode of ['invalid','generation','offline','valid']){
   console.log('Checking auth mode:',mode);
   await page.goto(base+root+'pro-access.html',{waitUntil:'networkidle'});await seedAuth();authMode=mode;await page.goto(base+pro+'#tuner',{waitUntil:'networkidle'});
   if(['invalid','generation'].includes(mode)){
    assert(await page.locator('#pro-gate-overlay').isVisible());
    assert.equal(await page.locator('.port-app-version-display').first().textContent(),'');
    assert.equal(await page.evaluate(async()=> (await import('../cruise-port-capabilities.js?v=1.18.0')).getCapabilities().gearPhotoWrite),false);
   }else{
    await page.locator('.port-app-version-display').first().filter({hasText:'Ver 1.18.0'}).waitFor();
    await hash('#tuner');
    assert.equal(await page.locator('#pro-gate-overlay').count(),0);assert(await page.locator('#tuner-capo-lock').isHidden());assert(await page.locator('#tuner-capo-up').isVisible());
   }
  }
  assert.equal(await page.locator('[data-standard-pro-link]:visible').count(),0);
  for(const width of [375,393,768,1280]){
   await page.setViewportSize({width,height:852});await hash('');await shot('pro-home',width);
   await hash('#settings');assert.equal(await page.locator('[data-standard-pro-link]:visible').count(),0);await shot('pro-settings',width);
   await hash('#tuner');assert(await page.locator('#tuner-capo-up').isVisible());await shot('pro-tuner',width);
  }
  assert.deepEqual(await page.evaluate(()=>({menus:localStorage.getItem('cruisePort.practiceMenus'),apps:localStorage.getItem('cruisePort.myApps'),tuner:localStorage.getItem('cruisePort.tuner')})),snapshot);
  await hash('#practice-menu/new');assert.equal(new URL(page.url()).hash,'#practice-menu/new');assert(await page.locator('#practice-name').isVisible());
  await page.locator('#practice-name-preset').selectOption('custom');await page.locator('#practice-name').fill('Local QA sixth');await page.locator('#practice-menu-form').evaluate(f=>f.requestSubmit());await page.waitForTimeout(120);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cruisePort.practiceMenus')).items.length),6);
  await hash('#settings');await page.locator('#settings-pro-auth-reset').click();await page.waitForLoadState('networkidle');await page.locator('#pro-gate-overlay').waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cruisePort.practiceMenus')).items.length),6);
  await page.evaluate(()=>{window.__SOUND_CRUISE_ACCOUNT_TURNSTILE__={getToken:async()=> 'synthetic-local-token'};});
  await page.locator('#pro-gate-input').fill('0000');await page.locator('#pro-gate-submit').click();
  await page.locator('.port-app-version-display').first().filter({hasText:'Ver 1.18.0'}).waitFor();assert.equal(await page.locator('#pro-gate-overlay').count(),0);
  await ready();await hash('#practice-menu/new');assert(await page.locator('.port-pro-prompt').isVisible());await page.keyboard.press('Escape');
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cruisePort.practiceMenus')).items.length),6);
  // Existing tools, NEWS (internal article), calendar, Settings and Account UI continue to render.
  for(const h of ['#metronome','#wishlist','#practice-menu','#practice-menu/calendar','#my-apps','#news','#sync-center','#settings']){await hash(h);await overflow();}
  await hash('#news');assert(await page.locator('#news-category').isVisible());await page.locator('#news-category').selectOption('cruise_apps');assert.equal(await page.locator('.news-card').count(),1);await page.locator('.news-card').click();await page.locator('#news-article-view').waitFor({state:'visible'});
  // Series design comparison, rendered at mobile width.
  await page.setViewportSize({width:393,height:852});
  for(const app of ['pitch-cruise','fretboard_cruise','rhythm-cruise','chord-cruise']){await page.goto(base+'/apps/'+app+'/pro-access.html',{waitUntil:'networkidle'});await page.screenshot({path:out+'/'+app+'-access-393.png',fullPage:true});}
  assert.deepEqual(errors,[]);
  assert(external.every(r=>r.method==='GET'||r.url.includes('/v2/pro-auth/')));
  const result={result:'PASS',widths:[375,393,768,1280],standardCapAndWriteGuards:true,lockedProBoot:true,invalidAndGenerationRejected:true,offlinePolicyPreserved:true,transitionStoragePreserved:true,authResetPreservesData:true,proSixthMenuCreated:true,standardReadsSixButCannotAdd:true,proUpgradeCTAHidden:true,seriesDesignRendered:true,newsAndToolsRegression:true,pageErrors:errors,externalRequestsIntercepted:external.length,productionRequests:0};
  fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(error){console.error({url:page.url(),errors,auth:await page.evaluate(()=>localStorage.getItem('soundCruiseProAuth')),body:await page.locator('body').innerText(),gate:await page.locator('body').getAttribute('class')});throw error;}finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
