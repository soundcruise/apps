// Real UI regression for the explicit Repeat button, including one-bar ranges.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright'),origin='http://127.0.0.1:18874';
for(const engine of ['chrome','webkit'])test('editor explicit repeat, tempo restart and stop: '+engine,async()=>{
 const {viewerFixture}=await import('./helpers/viewer-fixture.mjs'),f=viewerFixture();f.score.songInfo.bpm=400;
 const browser=await(engine==='chrome'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch()),c=await browser.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage(),errors=[];
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();if(u.pathname.endsWith('/sheet-cruise/sheet-cruise.js'))return r.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../js/modules/sheet-cruise/sheet-cruise.js'),'utf8').replace('function playPreviewPlan(plan,scope){','function playPreviewPlan(plan,scope){window.__repeatPlans.push({scope,spans:plan.spans,loopPeriod:plan.loopPeriod});')});return r.continue();});
 await c.addInitScript(()=>{window.__repeatPlans=[];window.__stopContexts=[];const Base=window.AudioContext||window.webkitAudioContext;window.AudioContext=class extends Base{constructor(...args){super(...args);__stopContexts.push(this);}};});p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
 try{
 await p.goto(origin);await p.click('#open-sheet-cruise');await p.locator('#sc-import-json').setInputFiles({name:'repeat.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.score))});await p.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,f.score.projectId);
 await p.click('#sc-playback-settings');await p.locator('#sc-count-in').uncheck();await p.click('[data-playback-done]');const before=await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
 await p.locator('#sc-sheet-scale-box .sheet-bar[data-bar-number="2"]').click({position:{x:3,y:3}});await p.click('#sc-repeat');await p.click('#sc-song-preview');await p.locator('#sc-sheet-scale-box>[data-playhead-bar="2"]').waitFor();
 assert.deepEqual(await p.evaluate(()=>__repeatPlans.at(-1).spans.map(s=>s.index)),[1]);assert(Math.abs(await p.evaluate(()=>__repeatPlans.at(-1).loopPeriod)-.6)<1e-8);
 await p.waitForTimeout(1400);assert.equal(await p.locator('#sc-song-preview').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('#sc-sheet-scale-box>[data-score-playhead]').count(),1);
 await p.click('#sc-song-preview');assert.equal(await p.evaluate(()=>__stopContexts.at(-1).state),'running');const contexts=await p.evaluate(()=>__stopContexts.length);await p.click('#sc-song-preview');await p.locator('#sc-sheet-scale-box>[data-playhead-bar="2"]').waitFor();assert.equal(await p.evaluate(()=>__stopContexts.length),contexts);
 await p.locator('#sc-practice-tempo').fill('200');await p.locator('#sc-practice-tempo').press('Tab');await p.waitForFunction(()=>Math.abs(__repeatPlans.at(-1).loopPeriod-1.2)<1e-8);await p.locator('#sc-sheet-scale-box>[data-playhead-bar="2"]').waitFor();await p.click('#sc-song-preview');await p.waitForFunction(()=>CruiseStudio.audio.snapshot().every(s=>!s.contextCount&&!s.resourceType));
 // With nothing selected Repeat covers the whole song, including silent bars.
 await p.locator('#sc-sheet-scale-box .sheet-page').click({position:{x:15,y:130}});assert.deepEqual(await p.evaluate(()=>CruiseStudio.sheetCruise.getSelectionSnapshot().barNumbers),[]);await p.click('#sc-song-preview');await p.waitForFunction(()=>__repeatPlans.at(-1).spans.length===12);assert(await p.evaluate(()=>__repeatPlans.at(-1).loopPeriod>0));await p.click('#sc-song-preview');await p.waitForFunction(()=>CruiseStudio.audio.snapshot().every(s=>!s.contextCount&&!s.resourceType));
 assert.deepEqual(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot()),before);assert.deepEqual(errors,[]);
 }finally{await c.close();await browser.close();}
});
