// Uses the real loopback server, without routing or authentication injection.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,webkit}=require('playwright');
const URL_LOCAL='http://127.0.0.1:18874/';
for(const engine of ['chrome','webkit'])test('real local UI server '+engine,async t=>{
 if(engine==='webkit'&&!fs.existsSync(webkit.executablePath())){t.skip('HOLD: WebKit runtime unavailable; Safari not verified');return;}
 const browser=await(engine==='chrome'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch({headless:true}));
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage();
 const external=[],errors=[],backend=[];
 p.on('request',r=>{const u=new URL(r.url());if(u.origin!==new URL(URL_LOCAL).origin&&!['blob:','data:'].includes(u.protocol))external.push(u.origin);if(/\/v2\/|\/cloud\//.test(u.pathname))backend.push(u.pathname)});
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 try{
 const response=await p.goto(URL_LOCAL);assert(response.headers()['content-security-policy'].includes("connect-src 'none'"));
 await p.locator('[data-local-ui-banner]').waitFor();await p.locator('#open-sheet-cruise').click();await p.locator('#sc-new-project').click();
 await p.locator('#sc-editor-drawer').evaluate(e=>e.open=true);await p.locator('#sc-title').fill('LOCAL UI Original');await p.locator('#sc-bpm').fill('106');await p.locator('#sc-bpm').press('Tab');await p.locator('#sc-editor-drawer').evaluate(e=>e.open=false);
 await p.locator('.sheet-bar').first().focus();await p.keyboard.press('Enter');
 await p.locator('[data-overlay-field=chord]').fill('C');await p.locator('.dock-lyrics-cell').first().fill('夜');await p.locator('[data-overlay-field=doremi]').fill('ド レ ミ');await p.locator('[data-overlay-field=doremi]').press('Tab');await p.locator('.dock-strum-cell').first().click();
 const snap=()=>p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());const before=await snap();
 await p.locator('[data-bar-operation=duplicateBar]').click();assert.equal((await snap()).bars.length,before.bars.length+1);await p.locator('#sc-undo').click();assert.deepEqual(await snap(),before);await p.locator('#sc-redo').click();await p.locator('#sc-save').click();
 await p.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty&&!CruiseStudio.sheetCruise.getSession().commitInFlight);
 const saved=await snap();assert.equal(saved.songInfo.bpm,106);assert(saved.bars[0].lyrics.length&&saved.bars[0].melody.length&&saved.performance.barRhythms.length);
 const download=p.waitForEvent('download');await p.locator('#sc-export-json').click();const file=JSON.parse(fs.readFileSync(await(await download).path(),'utf8'));assert.deepEqual(file,saved);
 await p.reload();await p.locator('#open-sheet-cruise').click();assert.deepEqual(await snap(),saved);
 await p.locator('#sc-import-json').setInputFiles({name:'local-original.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});await p.waitForFunction(()=>document.getElementById('sc-save-status').textContent.includes('読み込'));assert.deepEqual(await snap(),saved);
 await p.emulateMedia({media:'print'});assert.equal(await p.locator('#sc-slot-overlay').evaluate(e=>getComputedStyle(e).display),'none');
 if(engine==='chrome'){const pdf=await p.pdf({preferCSSPageSize:true});assert.equal(pdf.subarray(0,4).toString(),'%PDF');}
 await p.emulateMedia({media:'screen'});
 // Explicit hostile calls must fail before leaving the browser; no route mocks.
 const blocked=await p.evaluate(async()=>{try{await fetch('https://sound-cruise-sync.cruise-port-requests.workers.dev/v2/pro-auth/verify',{method:'POST',body:'{}'});return false}catch{return true}});assert(blocked);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(backend,[]);
 assert.equal((await context.request.get(URL_LOCAL,{headers:{Host:'evil.invalid'}})).status(),403);
 assert.equal((await context.request.get(URL_LOCAL+'apps/cruise-studio/index.html')).status(),404);
 }finally{await browser.close()}
});
