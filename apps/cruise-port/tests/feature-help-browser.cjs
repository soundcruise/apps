// Isolated acceptance: external APIs are synthetic; no production data writes.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.argv[2] || 'http://127.0.0.1:8778';
const production = base.startsWith('https:');
(async () => {
 const browser = await chromium.launch({headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context = await browser.newContext();
 if (!production) await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'}));
 const page = await context.newPage(); const errors=[];
 page.on('pageerror', error => errors.push(error.message));
 try {
 for (const edition of production ? [''] : ['', 'pro_9a3943176561/']) {
  await page.goto(base+'/apps/cruise-port/'+edition);
  if (edition) {
   // Synthetic gate state in the isolated local context only.
   await page.evaluate(() => { document.querySelector('#pro-gate-overlay')?.remove(); document.body.classList.remove('pro-gate-active'); document.querySelectorAll('[inert]').forEach(el=>el.removeAttribute('inert')); window.__SOUNDCRUISE_PRO_GATE__=true; window.__soundCruiseClearGate=()=>{}; });
   await page.evaluate(() => import('../practice-menu-app.js?v=1.21.2'));
  }
  await page.locator('.port-app-version-display').first().filter({hasText:'1.21.2'}).waitFor();
  for (const width of [375,393,768,1280]) {
   await page.setViewportSize({width,height:852});
   for (const [key,hash,title] of [['practice','#practice-menu','練習メニューの使い方'],['gear','#wishlist','機材リストの使い方']]) {
    await page.evaluate(hash=>location.hash=hash,hash);
    const button=page.locator(`[data-feature-help="${key}"]`);await button.waitFor({state:'visible'});
    if (key==='practice') { const layout=await page.evaluate(()=>{ const h=document.getElementById('practice-heading').getBoundingClientRect(), b=document.getElementById('practice-history-open').getBoundingClientRect(), q=document.querySelector('[data-feature-help=practice]').getBoundingClientRect();return {sameRow:Math.abs((h.y+h.height/2)-(b.y+b.height/2))<25,noOverlap:q.right<=b.left,hNoOverlap:h.right<=q.left};}); assert(layout.sameRow && layout.noOverlap && layout.hNoOverlap); }
    const before=await page.evaluate(()=>JSON.stringify({...localStorage}));
    const rect=await button.boundingBox();assert(rect.width>=44 && rect.height>=44);
    await button.click();const dialog=page.locator('#port-feature-help-dialog');await dialog.waitFor({state:'visible'});
    assert.equal(await page.locator('#port-feature-help-title').textContent(),title);
    assert.equal(await page.locator('#port-feature-help-title').evaluate(el=>document.activeElement===el),true);
    await page.keyboard.press('Tab');assert(await dialog.evaluate(el=>el.contains(document.activeElement)));
    const bounds=await dialog.boundingBox();assert(bounds.x>=0 && bounds.x+bounds.width<=width && bounds.y>=0 && bounds.y+bounds.height<=852);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    fs.mkdirSync('/tmp/port-feature-help',{recursive:true});await page.screenshot({path:`/tmp/port-feature-help/${production?'production':'local'}-${edition?'pro':'standard'}-${key}-${width}.png`});
    await page.keyboard.press('Escape');assert(await dialog.isHidden());assert(await button.evaluate(el=>document.activeElement===el));
    await button.click();await page.locator('[data-feature-help-close]').click();assert(await dialog.isHidden());
    await button.click();await page.mouse.click(2,2);assert(await dialog.isHidden());
    assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),before);
   }
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS: help content/open/close/backdrop/ESC/focus/44px/layout/storage/console; 375/393/768/1280');
 } finally {await browser.close();}
})();
