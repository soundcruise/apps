// Local browser acceptance with an intercepted API. Never contacts a publisher or production API.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:393,height:852}}),errors=[],unexpected=[];
  let mode='normal';
  const api='https://sound-cruise-news.cruise-port-requests.workers.dev';
  const item={id:'synthetic-auto-news',label:'BOSS、EX-4を発表',sourceName:'島村楽器',sourceUrl:'https://www.shimamura.co.jp/update/amp-effector/2026/09/99999/',publishedAt:new Date().toISOString(),category:'amps_effects',publishable:true};
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=route.request().url();
   if(url.startsWith(api))return route.fulfill({status:mode==='normal'?200:503,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:8765'},body:JSON.stringify(mode==='normal'?{contractVersion:1,items:[item],nextOffset:null}:mode==='disabled'?{disabled:true,items:[]}:{error:'news_unavailable'})});
   if(url.includes('/news-config.js'))return route.fulfill({contentType:'text/javascript',body:`export const NEWS_PROVIDER='api';export const NEWS_API_BASE='${api}';`});
   if(url.startsWith('http://127.0.0.1:8765/'))return route.continue();
   unexpected.push(url);return route.abort();
  });
  await page.goto('http://127.0.0.1:8765/apps/cruise-port/');
  await page.locator('#news-ticker').waitFor({state:'visible'});await page.locator('#news-ticker').click();
  await page.locator('.news-card').waitFor();assert.equal(await page.locator('.news-card').count(),1);
  assert.equal(await page.locator('.news-beta-note').count(),0);
  assert.equal(await page.locator('.news-card').getAttribute('target'),'_blank');assert.equal(await page.locator('.news-card').getAttribute('rel'),'noopener noreferrer');
  fs.mkdirSync('/tmp/news-final-visual',{recursive:true});
  for(const width of [375,393]){
   await page.setViewportSize({width,height:852});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:`/tmp/news-final-visual/api-${width}.png`,fullPage:true});
  }
  for(const failure of ['disabled','offline']){
   mode=failure;await page.reload();await page.evaluate(()=>location.hash='#news');
   await page.locator('#news-content').getByText(failure==='disabled'?'ニュースは現在公開を停止しています。':'ニュースを読み込めませんでした。').waitFor();
   assert.equal(await page.locator('.news-card').count(),0);assert.equal(await page.locator('#news-ticker').isVisible(),false);
   await page.locator('#news-view [data-action="home"]').click();assert.equal(await page.locator('#home-view').isVisible(),true);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log(JSON.stringify({result:'PASS',api:'intercepted synthetic',widths:[375,393],killFallback:true,offlineFallback:true,publisherRequests:0,pageErrors:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
