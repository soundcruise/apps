// Local-only browser acceptance. Start a static server on 127.0.0.1:8765.
// Requires Playwright and Chrome; screenshots go to /tmp/news-jp2a.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 require('node:fs').mkdirSync('/tmp/news-jp2a',{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:393,height:852}});
 const external=[]; const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  if(!route.request().url().startsWith('http://127.0.0.1:8765')) {external.push(route.request().url());return route.abort();}
  return route.continue();
 });
 await page.goto('http://127.0.0.1:8765/apps/cruise-port/');
 await page.locator('#news-entry').waitFor({state:'visible'});
 // Real fixture with actual browser clock; no publication-date rewriting.
 await page.locator('#news-ticker').waitFor({state:'visible'});
 external.length=0;
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const width of [375,393,1024]) {
  await page.setViewportSize({width,height:852});
  await page.screenshot({path:`/tmp/news-jp2a/real-home-${width}.png`,fullPage:true});
 }
 await page.locator('#news-ticker').click();
 assert.equal(new URL(page.url()).hash,'#news');
 await page.locator('.news-card').first().waitFor();
 assert.equal(await page.locator('.news-beta-note').textContent(),'Beta · 手動確認済みのニュース');
 const expected=await page.evaluate(async()=>{
  const {NEWS_BETA_ITEMS}=await import('./data/news-beta.js?v=1.3.0');
  const {prepareNews,tickerNews}=await import('./news-data.js?v=1.5.0');
  const ready=prepareNews(NEWS_BETA_ITEMS);
  return {ready,ticker:tickerNews(ready),now:new Date().toISOString()};
 });
 assert.equal(expected.ready.length,23);
 assert.deepEqual(await page.locator('.news-label').allTextContents(),expected.ready.map(i=>i.label));
 assert.deepEqual(await page.locator('.news-source').allTextContents(),expected.ready.map(i=>i.sourceName));
 assert.deepEqual(await page.locator('.news-card').evaluateAll(nodes=>nodes.map(n=>n.href)),expected.ready.map(i=>i.sourceUrl));
 for(const width of [375,393,1024]) {
  await page.setViewportSize({width,height:852});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`/tmp/news-jp2a/real-news-${width}.png`,fullPage:true});
 }
 for(const [category,count] of [['acoustic_guitar',6],['electric_guitar_bass',4],['amps_effects',7],['dtm_software',6],['artist_guitar',0]]) {
  await page.locator('#news-category').selectOption(category);
  assert.equal(await page.locator('.news-card').count(),count);
 }
 await page.locator('#news-category').selectOption('');
 assert.equal(external.length,0);
 console.log(JSON.stringify({realFixture:'PASS',now:expected.now,items:expected.ready.length,ticker:expected.ticker.map(i=>i.label),externalRequests:external.length}));
 await page.emulateMedia({reducedMotion:'no-preference'});
 const now=Date.parse('2026-09-28T12:00:00Z');
 const rows=Array.from({length:9},(_,i)=>({id:`test-${i}`, label:`テスト用：ギター・録音機材の製品情報 ${i+1}`,sourceName:'架空のテスト公式',sourceUrl:'https://example.invalid/product', publishedAt:new Date(now-i*86400000).toISOString(),createdAt:'2026-09-28T00:00:00Z',updatedAt:'2026-09-28T00:00:00Z',category:['acoustic_guitar','electric_guitar_bass','amps_effects','recording_audio','dtm_software','creator_streaming','artist_guitar','live_guitar','media_other'][i],topicKey:`test-${i}`,sourceKind:'official',sourceSafety:'safe',manualReviewStatus:'approved',guitarEvidence:'guitar_performance'}));
 const render=async(items=rows,mode='beta')=>page.evaluate(async({items,mode,now})=>{ const {renderNews}=await import('./news-ui.js?v=1.5.0');renderNews({items,mode,now});},{items,mode,now});
 await render([]);
 await page.locator('#news-content').getByText('表示できるニュースはありません。').waitFor();
 external.length=0;
 for(const width of [375,393,1024]){
  await page.setViewportSize({width,height:852});await render();
  assert.equal(await page.locator('.news-card').count(),9);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`/tmp/news-jp2a/list-${width}.png`,fullPage:true});
 }
 await page.locator('#news-category').selectOption('dtm_software');assert.equal(await page.locator('.news-card').count(),1);
 assert.equal(await page.locator('.news-card').getAttribute('rel'),'noopener noreferrer');
 assert.equal(await page.locator('.news-card').getAttribute('target'),'_blank');
 assert.equal(await page.locator('#news-view img, #news-view iframe').count(),0);
 await render([{...rows[0],label:'<img src=x onerror=alert(1)>'}]);
 assert.equal(await page.locator('.news-label').textContent(),'<img src=x onerror=alert(1)>');
 assert.equal(await page.locator('#news-view img').count(),0);
 await render(null);assert.equal(await page.locator('#news-content').textContent(),'ニュースを読み込めませんでした。');
 await render(rows,'off');assert.equal(await page.locator('#news-entry').isVisible(),false);
 assert.match(await page.locator('#news-content').textContent(),/現在利用できません/);
 await render(rows,'on');assert.equal(await page.locator('.news-beta-note').count(),0);
 await page.locator('#news-view [data-action="home"]').click();await render();
 await page.setViewportSize({width:393,height:852});
 await page.screenshot({path:'/tmp/news-jp2a/home-393.png',fullPage:true});
 await page.locator('#news-ticker').focus();
 assert.equal(await page.locator('.news-ticker-track').evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.news-ticker-track').evaluate(e=>getComputedStyle(e).animationName),'none');
 await page.locator('#news-ticker').click();assert.equal(new URL(page.url()).hash,'#news');
 assert.equal(external.length,0);
 // News chunk failure must preserve Home and show a local error on the News route.
 await page.route('**/news-ui.js*',route=>route.abort());await page.reload();
 await page.locator('#home-view').waitFor({state:'visible'});
 await page.evaluate(()=>location.hash='#news');
 await page.locator('#news-content').getByText('ニュースを読み込めませんでした。').waitFor();
 await page.locator('#news-view [data-action="home"]').click();
 assert.equal(await page.locator('#home-view').isVisible(),true);
 // Future API emergency stop must clear ticker and show a specific fallback.
 await page.unroute('**/news-ui.js*');
 await page.route('**/news-provider.js*',route=>route.fulfill({contentType:'text/javascript',body:'export async function loadConfiguredNews(){const e=new Error("news_disabled");e.name="NewsDisabledError";throw e;}'}));
 await page.reload();await page.evaluate(()=>location.hash='#news');
 await page.locator('#news-content').getByText('ニュースは現在公開を停止しています。').waitFor();
 assert.equal(await page.locator('#news-ticker').isVisible(),false);
 assert.equal(await page.locator('.news-card').count(),0);
 console.log(JSON.stringify({result:'PASS',widths:[375,393,1024],newsExternalRequests:0,pageErrors:errors}));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
