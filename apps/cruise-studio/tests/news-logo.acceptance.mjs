import assert from 'node:assert/strict';import fs from 'node:fs';
import{PRO_DIRECTORY}from'../scripts/edition-layout.mjs';
const entry='https://soundcruise.jp/apps/cruise-studio/'+PRO_DIRECTORY+'/';
export async function acceptNewsLogo({profile,bootstrapPro,check,OUT}){
 const p=await profile('news-logo',false);await bootstrapPro(p);const page=p.page;let mode='hold',release,requests=0;
 const item={id:'ui-fixture-article',label:'Synthetic news acceptance',sourceName:'Fixture Music',sourceUrl:'https://example.invalid/article',publishedAt:new Date(Date.now()-3600000).toISOString(),category:'acoustic_guitar',publishable:true};
 await p.context.route('https://sound-cruise-news.cruise-port-requests.workers.dev/**',async route=>{requests++;if(mode==='hold')await new Promise(r=>release=r);return route.fulfill({status:mode==='offline'?503:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify(mode==='offline'?{}:{contractVersion:1,items:[item],nextOffset:null})});});
 await p.context.route('https://example.invalid/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Synthetic external article</h1>'}));
 await page.goto(entry);await page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
 const news=()=>page.frameLocator('#port-news-surface iframe');
 await check('NEWS starts loading, then renders native success without an initial error',async()=>{
  await page.locator('[data-home-workspace=portNews]').click();await news().locator('#news-content').filter({hasText:'ニュースを読み込み中…'}).waitFor();
  assert(!await news().locator('#news-content').textContent().then(x=>x.includes('読み込めませんでした')));assert(release);mode='ready';release();await news().locator('.news-label').filter({hasText:item.label}).waitFor();
 });
 await check('External tab return preserves NEWS iframe, category and scroll; no duplicate request',async()=>{
  await news().locator('#news-category').selectOption('acoustic_guitar');await page.evaluate(()=>{window.originalNewsFrame=document.querySelector('#port-news-surface iframe');window.originalNewsHTML=originalNewsFrame.contentDocument.querySelector('#news-content').innerHTML;document.querySelector('.studio-main').scrollTop=150;window.newsScroll=document.querySelector('.studio-main').scrollTop;});
  const count=requests,popupPromise=p.context.waitForEvent('page');await news().locator('.news-card[href="https://example.invalid/article"]').click();const popup=await popupPromise;await popup.waitForURL('https://example.invalid/article');
  // Headless engines do not consistently expose OS focus as document.hidden.
  // Dispatch real product listeners with a synthetic hidden state as well.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await popup.close();await page.bringToFront();await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  assert(await page.evaluate(()=>document.querySelector('#port-news-surface iframe')===originalNewsFrame));assert.equal(await news().locator('#news-category').inputValue(),'acoustic_guitar');assert.equal(await news().locator('#news-content').innerHTML(),await page.evaluate(()=>originalNewsHTML));assert.equal(requests,count);
  assert.equal(await page.evaluate(()=>document.querySelector('.studio-main').scrollTop),await page.evaluate(()=>newsScroll));
 });
 await check('Native article Back, workspace leave and explicit Stop retain their contracts',async()=>{
  await news().locator('#news-category').selectOption('');await news().locator('.news-card[href^="#news/"]').first().click();await news().locator('#news-article-view:not([hidden])').waitFor();
  await news().locator('#news-article-view > .view-panel > .view-back').click();await news().locator('#news-view:not([hidden])').waitFor();
  await news().locator('.news-card[href^="#news/"]').first().click();await news().locator('#news-article-view:not([hidden])').waitFor();await page.evaluate(()=>history.back());await news().locator('#news-view:not([hidden])').waitFor();
  await page.locator('#shell-audio-stop').click();assert.equal(await page.locator('#port-news-surface iframe').count(),0);await page.locator('#port-news-resume').click();await news().locator('.news-label').filter({hasText:item.label}).waitFor();
  await page.locator('button[data-workspace=home]').click();assert.equal(await page.locator('#port-news-surface iframe').count(),0);await page.locator('[data-home-workspace=portNews]').click();await news().locator('.news-label').filter({hasText:item.label}).waitFor();
 });
 await check('Native provider failure keeps first-party fallback and reports external failure',async()=>{
  mode='offline';await page.locator('button[data-workspace=home]').click();await page.locator('[data-home-workspace=portNews]').click();await news().locator('#news-content').filter({hasText:'外部ニュースを読み込めませんでした'}).waitFor();assert(await news().locator('.news-card').count()>0);assert.equal(await news().locator('.news-label').filter({hasText:item.label}).count(),0);mode='ready';
 });
 await check('Broken native NEWS module shows a real error; Standard and Pro loading placeholders match',async()=>{
  for(const file of ['index.html','pro_9a3943176561/index.html']){const html=fs.readFileSync(new URL('../../cruise-port/'+file,import.meta.url),'utf8');assert(html.includes('<div id="news-content"><p>ニュースを読み込み中…</p></div>'));}
  const q=await profile('news-load-failure',false);await q.context.route('https://soundcruise.jp/apps/cruise-port/news-provider.js*',r=>r.fulfill({status:503,contentType:'text/javascript',body:'unavailable'}));await q.page.goto('https://soundcruise.jp/apps/cruise-port/#news');await q.page.locator('#news-content').filter({hasText:'ニュースを読み込めませんでした。'}).waitFor();assert.equal(await q.page.locator('.news-card').count(),0);
 });
 await check('Both logos use guarded refresh, including keyboard; feedback visible outside Home',async()=>{
  await page.locator('button[data-workspace=home]').click();const matrix=[];
  for(const width of [1440,1024,768,390])for(const theme of ['midnight','dark','charcoal','gray','light']){
   await page.setViewportSize({width,height:width===390?844:1000});await page.evaluate(t=>CruiseStudio.colorTheme.applyColorTheme(t),theme);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const m=await page.evaluate(()=>{const h=document.querySelector('.studio-header h1').getBoundingClientRect(),b=document.querySelector('.studio-pro-badge').getBoundingClientRect(),c=document.querySelector('#home-cruise-sync').getBoundingClientRect(),logo=document.querySelector('h1 [data-studio-refresh]');const brand=document.querySelector('.studio-brand [data-studio-refresh]'),bc=getComputedStyle(brand),pc=getComputedStyle(brand.parentElement);return{brandVisible:brand.getClientRects().length>0,brandFont:bc.fontSize,brandOriginalFont:pc.fontSize,brandColor:bc.color,brandOriginalColor:pc.color,brandPadding:bc.padding,overflow:document.documentElement.scrollWidth>innerWidth,badgeFits:b.right<=c.left,logoFont:getComputedStyle(logo).fontSize,titleFont:getComputedStyle(logo.parentElement).fontSize};});assert(!m.overflow&&m.badgeFits);assert.equal(m.logoFont,m.titleFont);assert.equal(m.brandFont,m.brandOriginalFont);assert.equal(m.brandVisible,width>600);if(m.brandVisible)assert.equal(m.brandColor,m.brandOriginalColor,JSON.stringify({width,theme,m}));assert.equal(m.brandPadding,'0px');matrix.push({width,theme,...m});
  }fs.writeFileSync(OUT+'/logo-design-matrix.json',JSON.stringify(matrix,null,2));await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>CruiseStudio.colorTheme.applyColorTheme('midnight'));await page.evaluate(async()=>{document.querySelector('.studio-main').scrollTop=0;getComputedStyle(document.querySelector('.home-tools button')).backgroundColor;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})));});await page.locator('.studio-header-title').scrollIntoViewIfNeeded();await page.screenshot({path:OUT+'/logos-midnight.png'});
  // A genuine unsaved score edit exercises the real session guard, not a stub.
  await page.locator('#open-sheet-cruise').click();await page.locator('#sc-editor-drawer').evaluate(e=>e.open=true);await page.locator('#sc-title').fill('Synthetic unsaved title');await page.locator('#sc-title').press('Tab');await page.locator('button[data-workspace=home]').click();
  let navigations=0;const track=f=>{if(f===page.mainFrame())navigations++;};page.on('framenavigated',track);
  for(const logo of [page.locator('.studio-brand [data-studio-refresh]'),page.locator('h1 [data-studio-refresh]')]){await logo.focus();await logo.press('Enter');await page.locator('#studio-refresh-status').filter({hasText:'保存'}).waitFor();await logo.press('Space');assert.equal(navigations,0);}
  await page.locator('button[data-workspace=portNews]').click();await page.locator('.studio-brand [data-studio-refresh]').click();await page.locator('#studio-refresh-status').filter({hasText:'保存'}).waitFor({state:'visible'});assert.equal(navigations,0);page.off('framenavigated',track);
  // Fresh disposable profile has no draft; both logos must perform real reloads.
  const clean=await profile('clean-logo',false);await bootstrapPro(clean);await clean.page.goto(entry);await clean.page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
  for(const selector of ['.studio-brand [data-studio-refresh]','h1 [data-studio-refresh]','#studio-refresh','#studio-footer-refresh']){const navigation=clean.page.waitForNavigation({waitUntil:'domcontentloaded'});await clean.page.locator(selector).click();await navigation;await clean.page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());}
 });
 await check('Invalid Pro does not resume background NEWS',async()=>{
  const q=await profile('news-revoked',false);await bootstrapPro(q);await q.page.goto(entry);await q.page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());await q.page.locator('[data-home-workspace=portNews]').click();await q.page.frameLocator('#port-news-surface iframe').locator('.news-card').first().waitFor();
  await q.page.evaluate(()=>{CruiseStudio.entryAuth.invalidate('pro-required');Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await q.page.locator('#port-news-surface iframe').count(),0);
 });
}
