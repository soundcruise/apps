// Isolated acceptance: external APIs are synthetic; no production data writes.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.argv[2] || 'http://127.0.0.1:8778';
const production = base.startsWith('https:');
(async () => {
 const browser = await chromium.launch({headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context = await browser.newContext({reducedMotion:'reduce'});
 if (!production) await context.route('**/*', route => route.request().url().includes('/shared/pro-gate.js?') ? route.fulfill({contentType:'application/javascript',body:'window.__soundCruiseClearGate = () => {}; // isolated UI fixture, no authentication requests'}) : new URL(route.request().url()).origin === base ? route.continue() : route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'}));
 if (!production) await context.addInitScript(()=>{ if(localStorage.getItem('cruisePort.practiceMenus')===null){localStorage.setItem('cruisePort.schemaVersion','3');localStorage.setItem('cruisePort.practiceMenus',JSON.stringify({version:3,items:[]}));} });
 const page = await context.newPage(); const errors=[];
 page.on('pageerror', error => errors.push(error.message));
 try {
 for (const edition of production ? [''] : ['', 'pro_9a3943176561/']) {
  await page.goto(base+'/apps/cruise-port/'+edition);
  if (edition) {
   // Synthetic gate module in the isolated local context only; production is never altered.
   await page.evaluate(() => { document.querySelector('#pro-gate-overlay')?.remove(); document.body.classList.remove('pro-gate-active'); document.querySelectorAll('[inert]').forEach(el=>el.removeAttribute('inert')); window.__SOUNDCRUISE_PRO_GATE__=true; window.__soundCruiseClearGate=()=>{}; });
   await page.evaluate(() => import('../practice-menu-app.js?v=1.21.1'));
  }
  await page.locator('.port-app-version-display').first().filter({hasText:'1.21.1'}).waitFor();
  for (const width of process.argv[3]==='--regression-only'?[]:[375,393,768,1280]) {
   await page.setViewportSize({width,height:852});
   for (const [key,hash,title] of [['practice','#practice-menu','練習メニューの使い方'],['gear','#wishlist','機材リストの使い方']]) {
    await page.evaluate(hash=>location.hash=hash,hash);
    const button=page.locator(`[data-feature-help="${key}"]`);await button.waitFor({state:'visible'});
    if (key==='practice') { assert(await page.evaluate(()=>document.querySelector('#home-calendar-button svg').outerHTML===document.querySelector('#practice-history-open svg').outerHTML));assert.equal(await page.locator('#practice-history-open').evaluate(el=>getComputedStyle(el).borderTopWidth),'1px'); const layout=await page.evaluate(()=>{ const h=document.getElementById('practice-heading').getBoundingClientRect(), b=document.getElementById('practice-history-open').getBoundingClientRect(), q=document.querySelector('[data-feature-help=practice]').getBoundingClientRect();return {sameRow:Math.abs((h.y+h.height/2)-(b.y+b.height/2))<25,noOverlap:q.right<=b.left,hNoOverlap:h.right<=q.left};}); assert(layout.sameRow && layout.noOverlap && layout.hNoOverlap); }
    const before=await page.evaluate(()=>JSON.stringify({...localStorage}));
    const rect=await button.boundingBox();assert(rect.width>=44 && rect.height>=44);
    await button.click();const dialog=page.locator('#port-feature-help-dialog');await dialog.waitFor({state:'visible'});
    assert.equal(await page.locator('#port-feature-help-title').textContent(),title);
    assert.equal(await page.locator('#port-feature-help-title').evaluate(el=>document.activeElement===el),true);
    await page.keyboard.press('Tab');assert(await dialog.evaluate(el=>el.contains(document.activeElement)));
    const bounds=await dialog.boundingBox();assert(bounds.x>=0 && bounds.x+bounds.width<=width && bounds.y>=0 && bounds.y+bounds.height<=852);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    fs.mkdirSync('/tmp/port-feature-tutorial',{recursive:true});await page.screenshot({path:`/tmp/port-feature-tutorial/${production?'production':'local'}-${edition?'pro':'standard'}-${key}-${width}.png`});
    await page.keyboard.press('Escape');assert(await dialog.isHidden());assert(await button.evaluate(el=>document.activeElement===el));
    await button.click();await page.locator('[data-feature-help-close]').click();assert(await dialog.isHidden());
    await button.click();await page.mouse.click(2,2);assert(await dialog.isHidden());
    await button.click();await page.locator('[data-feature-tutorial]').click();
    const tour=page.locator('.port-tutorial');await tour.waitFor({state:'visible'});
    const total=key==='practice'?6:5;assert((await page.locator('.port-tutorial-progress').textContent()).includes(`1 / ${total}`));
    assert(await page.locator('[data-tutorial-back]').isDisabled());
    await page.locator('[data-tutorial-next]').click();await page.locator('[data-tutorial-back]').click();assert((await page.locator('.port-tutorial-progress').textContent()).includes(`1 / ${total}`));
    for(let step=0;step<total;step++){
     const bubbleBounds=await page.locator('.port-tutorial-bubble').boundingBox();assert(bubbleBounds.x>=0 && bubbleBounds.x+bubbleBounds.width<=width && bubbleBounds.y>=0 && bubbleBounds.y+bubbleBounds.height<=852);
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
     assert(await page.locator('[data-tutorial-next]').evaluate(el=>document.activeElement===el));
     await page.keyboard.press('Tab');assert(await tour.evaluate(el=>el.contains(document.activeElement)));
     if(step===0 || step===total-1)await page.screenshot({path:`/tmp/port-feature-tutorial/${production?'production':'local'}-${edition?'pro':'standard'}-${key}-${width}-step${step+1}.png`});
     await page.locator('[data-tutorial-next]').click();
    }
    await tour.waitFor({state:'detached'});assert.equal(await tour.count(),0);assert(await button.evaluate(el=>document.activeElement===el));
    for(const mode of ['esc','x','end']){await button.click();await page.locator('[data-feature-tutorial]').click();if(mode==='esc')await page.keyboard.press('Escape');else await page.locator(mode==='x'?'[data-tutorial-close]':'[data-tutorial-end]').click();await tour.waitFor({state:'detached'});assert.equal(await tour.count(),0);assert(await button.evaluate(el=>document.activeElement===el));}
    // Highlighting does not activate the real addition/timer/finish/card controls.
    assert.equal(new URL(page.url()).hash,hash);
    assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),before);
   }
  }
 }
 if (!production) {
  // Save/edit regression in the isolated Standard UI, with representative dynamic cards.
  await page.goto(base+'/apps/cruise-port/');
  await page.evaluate(()=>location.hash='#practice-menu');
  await page.locator('#practice-menu-add').click();
  await page.locator('#practice-name-preset').selectOption('custom');
  await page.locator('#practice-name').fill('Tutorial QA');
  await page.locator('#practice-duration').fill('12');
  await page.locator('#practice-app').selectOption('pitch');
  await page.locator('#practice-menu-form button[type=submit]').click();
  await page.locator('.practice-menu-card .practice-card-link').first().click();
  await page.locator('#practice-edit').click();await page.locator('#practice-memo').fill('Edit preserved');
  await page.locator('#practice-menu-form button[type=submit]').click();
  await page.evaluate(()=>location.hash='#wishlist');await page.locator('#gear-list-title-add').click();
  await page.locator('#gear-name').fill('Gear QA');await page.locator('#gear-category').selectOption('guitar');await page.locator('#gear-list-form button[type=submit]').click();
  await page.locator('.gear-card').filter({hasText:'Gear QA'}).click();await page.locator('#gear-memo').fill('Gear edit preserved');await page.locator('#gear-list-form button[type=submit]').click();
  for(const [key,hash,cardSelector] of [['practice','#practice-menu','.practice-menu-card'],['gear','#wishlist','.gear-card']]){
   await page.evaluate(hash=>location.hash=hash,hash);const button=page.locator(`[data-feature-help="${key}"]`);
   const before=await page.evaluate(()=>JSON.stringify({...localStorage}));await button.click();await page.locator('[data-feature-tutorial]').click();
   const total=key==='practice'?6:5;
   for(let step=0;step<total;step++){await page.locator('[data-tutorial-next]').click();}
   await page.locator('.port-tutorial').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),before);assert(await page.locator(cardSelector).count()>0);
  }
  // The running upper finish button is the actual tutorial spotlight target.
  await page.evaluate(()=>location.hash='#practice-menu');await page.locator('#practice-timer-toggle').click();
  await page.locator('#practice-timer-stop').waitFor({state:'visible'});
  const runningBefore=await page.evaluate(()=>JSON.stringify({...localStorage}));
  await page.locator('[data-feature-help="practice"]').click();await page.locator('[data-feature-tutorial]').click();
  for(let step=0;step<4;step++)await page.locator('[data-tutorial-next]').click();
  assert.equal(await page.locator('#port-tutorial-title').textContent(),'練習を終了');
  assert(await page.evaluate(()=>{const a=document.querySelector('#practice-timer-stop').getBoundingClientRect(),b=document.querySelector('.port-tutorial-spotlight').getBoundingClientRect();return Math.abs(a.left-b.left)<=5 && Math.abs(a.right-b.right)<=5;}));
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),runningBefore);
  // Observe existing app link and calendar destination without external launch/data changes.
  await page.evaluate(()=>location.hash='#practice-menu');assert((await page.locator('.practice-launch').first().getAttribute('href')).includes('pitch-cruise'));
  await page.locator('#practice-history-open').click();assert(await page.locator('#practice-history-view').isVisible());
  // Normal motion scrolls gently; reduced-motion runs above are instantaneous.
  await page.setViewportSize({width:375,height:440});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>location.hash='#practice-menu');await page.locator('[data-feature-help="practice"]').click();await page.locator('[data-feature-tutorial]').click();
  await page.waitForFunction(()=>{const r=document.getElementById('practice-menu-add').getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight && scrollY>0;});
  assert(await page.evaluate(()=>scrollY>0));await page.keyboard.press('Escape');await page.locator('.port-tutorial').waitFor({state:'detached'});
  // A missing optional target is skipped rather than causing a broken step.
  await page.evaluate(()=>location.hash='#wishlist');await page.locator('[data-feature-help="gear"]').click();
  await page.evaluate(()=>document.querySelector('.gear-grid-picker').hidden=true);
  await page.locator('[data-feature-tutorial]').click();assert((await page.locator('.port-tutorial-progress').textContent()).includes('1 / 4'));await page.keyboard.press('Escape');await page.locator('.port-tutorial').waitFor({state:'detached'});
 }
 assert.deepEqual(errors,[]);console.log('PASS: header/help/tutorial start/next/back/final/ESC/x/end/focus/empty state/layout/storage/console; 375/393/768/1280');
 } finally {await browser.close();}
})();
