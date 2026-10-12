const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.argv[2] || 'http://127.0.0.1:8766';
(async () => {
 const browser = await chromium.launch({headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const result = {routes:[], errors:[], missing:[], syncRequests:[]};
 try {
 for (const width of [1280,393]) {
  const context = await browser.newContext({viewport:{width,height:852}, reducedMotion:'reduce'});
  const page = await context.newPage();
  page.on('pageerror', e => result.errors.push(e.message));
  page.on('console', m => { if(m.type()==='error') result.errors.push(m.text()); });
  page.on('response', r => {if(r.status()===404 && r.url().startsWith(origin)) result.missing.push(r.url());});
  await context.route('**/*', async route => {
   const u = new URL(route.request().url());
   if(u.pathname.includes('/v2/') && !u.pathname.includes('/pro-auth/')) result.syncRequests.push({url:u.href,method:route.request().method()});
   if((u.pathname === '/__cruise_preview/news' || u.pathname === '/v1/news')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({contractVersion:1,items:[],nextOffset:null})});
   if(u.origin===origin) return route.continue();
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,generation:1,legacyCompatibilityEnabled:false})});
  });
  await page.goto(origin+'/apps/cruise-port/',{waitUntil:'networkidle'});
  await page.locator('.port-app-version-display').first().filter({hasText:'1.22.9'}).waitFor();
  await page.evaluate(async () => {
   const settings = await import('./metronome-store.js');
   const preset = {id:'baseline-preset',name:'Baseline',...settings.METRONOME_DEFAULTS,createdAt:1,updatedAt:1};
   delete preset.version;
   localStorage.setItem('cruisePort.metronome', JSON.stringify({...settings.METRONOME_DEFAULTS,bpm:137}));
   localStorage.setItem('cruisePort.metronomePresets', JSON.stringify({version:1,items:[preset]}));
  });
  const seeded = await page.evaluate(() => ({metronome:localStorage.getItem('cruisePort.metronome'),presets:localStorage.getItem('cruisePort.metronomePresets')}));
  await page.reload({waitUntil:'networkidle'});
  const initial = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('cruisePort.'))));
  for(const [hash,selector] of [['','#home-view'],['#metronome','#metronome-view'],['#tuner','#tuner-view'],['#practice-menu','#practice-list-view'],['#practice-menu/calendar','#practice-history-view'],['#wishlist','#wishlist-view'],['#my-apps/manage','#my-apps-manage-view'],['#settings','#settings-view'],['#sync-center','#sync-center-view']]) {
   await page.evaluate(h=>location.hash=h,hash);
   await page.locator(selector).waitFor({state:'visible'});
   result.routes.push({width,hash,visible:true});
  }
  assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('cruisePort.')))),initial,'browsing must preserve existing storage');
  await page.evaluate(()=>location.hash='#metronome');
  await page.locator('#metronome-preset-select').waitFor({state:'visible'});
  assert.equal(await page.locator('#metronome-preset-select option').filter({hasText:'Baseline'}).count(),1);
  assert.deepEqual(await page.evaluate(() => ({metronome:localStorage.getItem('cruisePort.metronome'),presets:localStorage.getItem('cruisePort.metronomePresets')})),seeded);
  await page.locator('#metronome-preset-save-open').click();
  await page.locator('.port-pro-prompt').waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  await page.evaluate(()=>location.hash='#settings');
  for(const theme of ['light','gray','charcoal','dark']) {
   await page.locator(`[data-theme-choice="${theme}"]`).click();
   await page.waitForFunction(theme => document.querySelector(`[data-theme-choice="${theme}"]`).getAttribute('aria-checked') === 'true', theme);
  }
  await page.goto(origin+'/apps/cruise-port/pro_9a3943176561/',{waitUntil:'networkidle'});
  await page.locator('#pro-gate-overlay').waitFor({state:'visible'});
  await context.close();
 }
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.missing,[]);assert.deepEqual(result.syncRequests,[]);
 result.result='PASS';
 } catch(e) {result.result='FAIL';result.failure=e.message;process.exitCode=1;} finally {fs.writeFileSync(process.argv[3] || '/private/tmp/port-runtime-standard-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
