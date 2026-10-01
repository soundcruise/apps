// NEWS category acceptance with publisher requests blocked. Use a fresh isolated browser context.
// Usage: NODE_PATH=<Playwright runtime> node tests/news-category-browser.cjs <Port origin> <output directory> [local API snapshot]
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const base=process.argv[2]||'http://127.0.0.1:8772';
 const out=process.argv[3]||'/tmp/news-category-decision/visual';fs.mkdirSync(out,{recursive:true});
 const api='https://sound-cruise-news.cruise-port-requests.workers.dev';
 const fixture=process.argv[4]?JSON.parse(fs.readFileSync(process.argv[4],'utf8')):null;
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:393,height:852},reducedMotion:'reduce'});
 const page=await context.newPage();const errors=[],blocked=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=route.request().url();
  if(url.startsWith(api+'/v1/news'))return fixture?route.fulfill({contentType:'application/json',body:JSON.stringify(fixture)}):route.continue();
  if(new URL(url).origin===new URL(base).origin)return route.continue();
  blocked.push(url);return route.abort();
 });
 try{
  await page.goto(base+'/apps/cruise-port/',{waitUntil:'networkidle'});
  assert.equal(await page.locator('.port-app-version-display').first().textContent(),'Ver 1.11.1');
  await page.locator('#news-entry').waitFor({state:'visible'});
  const homeTicker=await page.locator('#news-ticker').textContent();
  await page.locator('#news-entry').click();await page.locator('.news-card').first().waitFor();
  const allCount=await page.locator('.news-card').count();
  const options=await page.locator('#news-category option').evaluateAll(nodes=>nodes.map(n=>({value:n.value,text:n.textContent})));
  assert.deepEqual(options.find(o=>o.value==='live_guitar'),{value:'live_guitar',text:'イベント'});
  assert.equal(options.some(o=>o.text==='ライブ'),false);
  assert.equal(await page.getByRole('combobox',{name:'カテゴリ'}).count(),1);
  await page.locator('#news-category').selectOption('live_guitar');
  const eventCount=await page.locator('.news-card').count();assert.ok(eventCount>0);
  assert.ok((await page.locator('.news-category').allTextContents()).every(t=>t==='イベント'));
  for(const width of [375,393,1440]){
   await page.setViewportSize({width,height:852});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:out+'/events-'+width+'.png',fullPage:true});
  }
  for(const link of await page.locator('.news-card').evaluateAll(nodes=>nodes.map(n=>({url:n.href,target:n.target,rel:n.rel})))){
   assert.ok(link.url.startsWith('https:'));assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');
  }
  await page.locator('#news-category').selectOption('');assert.equal(await page.locator('.news-card').count(),allCount);
  // Transient render only: no persistent data writes or publisher link navigation.
  const label='テスト奏者、ギター弾き語りライブを開催';
  await page.evaluate(async label=>{
   const {renderNews}=await import('./news-ui.js?v=1.11.1');const now=Date.now(),at=new Date(now-86400000).toISOString();
   renderNews({mode:'on',now,category:'live_guitar',items:[{id:'synthetic-live',topicKey:'synthetic-live',label,sourceName:'テスト公式',sourceUrl:'https://example.invalid/live',category:'live_guitar',publishedAt:at,createdAt:at,updatedAt:at,sourceKind:'official',sourceSafety:'safe',manualReviewStatus:'approved',guitarEvidence:'guitar_performance'}]});
  },label);
  assert.equal(await page.locator('.news-category').textContent(),'イベント');assert.equal(await page.locator('.news-label').textContent(),label);
  assert.ok((await page.locator('#news-ticker').textContent()).includes(label));
  await page.locator('#news-category').selectOption('sale');assert.equal(await page.locator('.news-card').count(),0);
  assert.equal(await page.locator('.news-empty').textContent(),'表示できるニュースはありません。');
  assert.equal(await page.locator('#news-category').inputValue(),'sale');
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  const result={result:'PASS',base,widths:[375,393,1440],allCount,eventCount,display:'イベント',internalKey:'live_guitar',liveArticleTextPreserved:true,filterAndEmptyState:true,accessibleCategoryName:true,homeTicker,publisherRequests:0,pageErrors:errors};
  fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
