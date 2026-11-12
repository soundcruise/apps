// Uses the real loopback server, without routing or authentication injection.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,webkit}=require('playwright');
const URL_LOCAL='http://127.0.0.1:18874/';
for(const engine of ['chrome','webkit'])test('real local UI server '+engine,async t=>{
 if(engine==='webkit'&&!fs.existsSync(webkit.executablePath())){t.skip('HOLD: WebKit runtime unavailable; Safari not verified');return;}
 const browser=await(engine==='chrome'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch({headless:true}));
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage();
 const external=[],errors=[],backend=[];
 // Real sample bytes/decoder through the unchanged local CSP, with no hardware output.
 await context.addInitScript(()=>{
  window.__localPiano={starts:0,decoded:0};
  window.AudioContext=class {
   constructor(){this.offline=new OfflineAudioContext(1,96000,48000);this.state='suspended';this.sampleRate=48000;this.currentTime=0;this.destination=this.offline.destination;}
   async resume(){this.state='running';}async close(){this.state='closed';}
   async decodeAudioData(bytes){const buffer=await this.offline.decodeAudioData(bytes);__localPiano.decoded++;return buffer;}
   createGain(){return this.offline.createGain();}
   createBuffer(...args){return this.offline.createBuffer(...args);}
   createBufferSource(){const source=this.offline.createBufferSource(),start=source.start.bind(source);source.start=(...args)=>{__localPiano.starts++;return start(...args);};return source;}
  };
 });
 p.on('request',r=>{const u=new URL(r.url());if(u.origin!==new URL(URL_LOCAL).origin&&!['blob:','data:'].includes(u.protocol))external.push(u.origin);if(/\/v2\/|\/cloud\//.test(u.pathname))backend.push(u.pathname)});
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 try{
 const response=await p.goto(URL_LOCAL);assert(response.headers()['content-security-policy'].includes("connect-src 'none'"));
 await p.locator('[data-local-ui-banner]').waitFor();await p.locator('#open-sheet-cruise').click();await p.locator('#sc-new-project').click();await p.getByRole('button',{name:'保存せず続行',exact:true}).click();
 await p.locator('#sc-editor-drawer').evaluate(e=>e.open=true);await p.locator('#sc-title').fill('LOCAL UI Original');await p.locator('#sc-bpm').fill('106');await p.locator('#sc-bpm').press('Tab');await p.locator('#sc-editor-drawer').evaluate(e=>e.open=false);
 await p.locator('.sheet-bar').first().focus();await p.keyboard.press('Enter');
 await p.locator('[data-overlay-field=chord]').first().fill('C');await p.locator('.dock-lyrics-cell').first().fill('夜');await p.locator('[data-overlay-field=doremi]').first().fill('ドレミ');await p.locator('[data-overlay-field=doremi]').first().press('Tab');await p.locator('.dock-strum-cell').first().click();
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
 await p.locator('.sheet-bar').first().focus();await p.keyboard.press('Enter');await p.locator('[data-overlay-field=doremi]').last().focus();await p.locator('[data-piano-toggle]').click();await p.locator('[data-piano-midi="69"]').click();
 await p.waitForFunction(()=>__localPiano.starts===1);assert.equal(await p.evaluate(()=>__localPiano.decoded),1);assert.equal(await p.locator('.piano-selected-cell').count(),1);await p.evaluate(()=>CruiseStudio.audio.stopAll());assert((await p.evaluate(()=>CruiseStudio.audio.snapshot())).every(s=>s.contextCount===0&&s.resourceType===null));
 const beforePreview=await snap();await p.locator('[data-bar-preview]').click();await p.waitForFunction(()=>__localPiano.starts>1&&document.querySelector('[data-bar-preview]').textContent==='■ 停止');assert(await p.evaluate(()=>!!CruiseStudio.guitarSamples));await p.evaluate(()=>CruiseStudio.audio.stopAll());assert.deepEqual(await snap(),beforePreview);assert((await p.evaluate(()=>CruiseStudio.audio.snapshot())).every(s=>s.contextCount===0&&s.resourceType===null));
 // Same real loopback entry, using the existing right tool window and Session history.
 await p.locator('[data-editor-placement]').click();await p.waitForFunction(()=>document.querySelector('#studio-tool-window #sc-slot-overlay'));assert.equal(await p.locator('#tool-window-select').inputValue(),'local-sheet-editor');assert.deepEqual(await snap(),beforePreview);
 await p.locator('.piano-selected-cell input').press('Meta+z');await p.locator('.piano-selected-cell input').press('Meta+Shift+z');assert.deepEqual(await snap(),beforePreview);await p.locator('#studio-tool-toggle').click();await p.waitForFunction(()=>!document.querySelector('#studio-tool-window #sc-slot-overlay'));assert.deepEqual(await snap(),beforePreview);
 // The same real entry mounts the exact owner UI and imports only synthetic names.
 await p.locator('.sheet-bar').first().focus();await p.keyboard.press('Enter');if(await p.locator('[data-piano-toggle]').getAttribute('aria-expanded')==='true')await p.locator('[data-piano-toggle]').click();await p.locator('[data-overlay-field=chord]').nth(1).focus();await p.locator('[data-chord-toggle]').click();await p.locator('[data-chord-advanced]').click();await p.locator('#cc-fretboard-host .cc-fb-stage').waitFor();const beforeNames=await snap();await p.locator('[data-chord-names-import]').setInputFiles({name:'synthetic-book.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'sound-cruise/chord-names',version:1,sourceApp:'chord-cruise',folders:[{id:'f',name:'合成'}],chords:[{id:'a',folderId:'f',name:'G7'}]}))});assert.deepEqual(await snap(),beforeNames);await p.locator('[data-book-folder-open=f]').click();await p.locator('[data-transfer-chord=a]').click();assert((await snap()).bars[0].chords.some(e=>e.onsetTick===240&&e.symbol==='G7'));const beforeAudition=await snap(),startCount=await p.evaluate(()=>__localPiano.starts);await p.locator('[data-chord-audition=selected]').click();await p.waitForFunction(n=>__localPiano.starts>n,startCount);assert.deepEqual(await snap(),beforeAudition);await p.evaluate(()=>CruiseStudio.audio.stopAll());const bookStarts=await p.evaluate(()=>__localPiano.starts);await p.locator('[data-chord-audition=a]').click();await p.waitForFunction(n=>__localPiano.starts>n,bookStarts);assert.deepEqual(await snap(),beforeAudition);await p.evaluate(()=>CruiseStudio.audio.stopAll());await p.getByRole('button',{name:'小節ルーペを閉じる',exact:true}).click();await p.locator('#sc-undo').click();assert.deepEqual(await snap(),beforeNames);assert.equal(await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('chordCruise.')).length),0);
 // Explicit hostile calls must fail before leaving the browser; no route mocks.
 const blocked=await p.evaluate(async()=>{try{await fetch('https://sound-cruise-sync.cruise-port-requests.workers.dev/v2/pro-auth/verify',{method:'POST',body:'{}'});return false}catch{return true}});assert(blocked);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(backend,[]);
 assert.equal((await context.request.get(URL_LOCAL,{headers:{Host:'evil.invalid'}})).status(),403);
 assert.equal((await context.request.get(URL_LOCAL+'apps/cruise-studio/index.html')).status(),404);
 }finally{await browser.close()}
});
