// Fresh contexts + synthetic JSON only; real local Web Audio, no account/network APIs.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'../../..'),origin='http://127.0.0.1:18874';
for(const engine of ['chrome','webkit'])test('registered acoustic form through every playback control: '+engine,async()=>{
 const {createUITestProject}=await import(pathToFileURL(path.join(root,'apps/cruise-studio/scripts/create-ui-test-project.mjs')));
 const p=createUITestProject();p.songInfo.bpm=80;
 const browser=await (engine==='chrome'?chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}):webkit.launch());
 const context=await browser.newContext(),external=[],errors=[];
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!==origin){external.push(u.origin);return route.abort();}
  if(u.pathname.endsWith('/sheet-cruise/sheet-cruise.js')){
   const source=fs.readFileSync(path.join(root,'apps/cruise-studio/js/modules/sheet-cruise/sheet-cruise.js'),'utf8');
   return route.fulfill({contentType:'text/javascript',body:source.replace('function playPreviewPlan(plan,scope){','function playPreviewPlan(plan,scope){ window.__plans.push({scope,plan:JSON.parse(JSON.stringify(plan))});')});
  }
  return route.continue();
 });
 await context.addInitScript(()=>{
  window.__plans=[];window.__starts=0;window.__decodes=0;const Base=window.AudioContext||window.webkitAudioContext;
  window.AudioContext=class extends Base{
   decodeAudioData(...a){window.__decodes++;return super.decodeAudioData(...a);}
   createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n);n.start=(...a)=>{window.__starts++;return start(...a);};return n;}
  };
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 try {
  await page.goto(origin);await page.locator('#open-sheet-cruise').click();
  await page.locator('#sc-import-json').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
  await page.waitForFunction(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot().songInfo.bpm===80);
  const before=await page.evaluate(()=>({project:CruiseStudio.sheetCruise.getSession().workingSnapshot(),history:CruiseStudio.sheetCruise.getSession().getHistory()}));
  const chord=before.project.bars[0].chords[0],binding=before.project.performance.formBindings.find(b=>b.chordEventId===chord.id),form=before.project.materials.forms.find(m=>m.id===binding.materialId).snapshot;
  const expected=binding.playedStrings.map(string=>form.tuningMidi[string-1]+form.capo+form.strings.find(n=>n.string===string).relativeFret).sort((a,b)=>a-b);
  async function audition(selector,scope){
   const prior=await page.evaluate(()=>({n:__plans.length,starts:__starts}));await page.locator(selector).click();
   await page.waitForFunction(({n,starts})=>__plans.length>n&&__starts>starts,prior);
   const result=await page.evaluate(()=>__plans.at(-1));assert.equal(result.scope,scope);
   const notes=result.plan.events.filter(e=>e.part==='guitar'&&e.tick===0&&(e.barIndex===undefined||e.barIndex===0));
   assert.deepEqual(notes.map(e=>e.midi).sort((a,b)=>a-b),expected);
   assert.deepEqual(notes.map(e=>e.string),binding.playedStrings.slice().sort((a,b)=>b-a));
   await page.evaluate(()=>CruiseStudio.audio.stopAll());
   assert((await page.evaluate(()=>CruiseStudio.audio.snapshot())).every(s=>s.contextCount===0&&!s.resourceType));
  }
  await audition('#sc-song-preview','song');
  await page.locator('.sheet-bar').first().focus();await page.keyboard.press('Enter');
  await page.locator('[data-editor-bars="1"]').click();await audition('[data-bar-preview]','all');
  await page.locator('[data-editor-bars="2"]').click();await audition('[data-bar-preview]','all');
  await page.locator('[data-overlay-field=chord]').first().focus();await page.locator('[data-chord-toggle]').click();
  await audition('[data-chord-progression]','chords');await audition('[data-chord-audition=selected]','chord');
  assert.deepEqual(await page.evaluate(()=>({project:CruiseStudio.sheetCruise.getSession().workingSnapshot(),history:CruiseStudio.sheetCruise.getSession().getHistory()})),before);
  assert(await page.evaluate(()=>__decodes>0));assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 }finally{await browser.close();}
});

test('explicit JSON/Print reject invalid and composing text, then export corrected canonical input',async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const p=await context.newPage(),downloads=[];p.on('download',d=>downloads.push(d));await p.goto(origin);await p.locator('#open-sheet-cruise').click();
  await p.evaluate(()=>{window.__prints=0;window.print=()=>{window.__prints++;};});
  await p.locator('.sheet-bar').first().focus();await p.keyboard.press('Enter');const field=p.locator('[data-overlay-field=doremi]').first();
  await field.fill('ド');await field.press('Tab');const before=await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
  await field.fill('不正');await field.press('Tab');await p.locator('#sc-export-json').click();await p.locator('#sc-print').click();
  assert.match(await p.locator('#sc-save-status').innerText(),/出力を中止/);assert.equal(await field.inputValue(),'不正');
  assert.deepEqual(await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot()),before);
  await field.fill('レ');await field.press('Tab');await field.dispatchEvent('compositionstart');
  await p.locator('#sc-export-json').click();await p.locator('#sc-print').click();assert.equal(downloads.length,0);assert.equal(await p.evaluate(()=>__prints),0);
  await field.dispatchEvent('compositionend');await p.evaluate(()=>new Promise(r=>setTimeout(r,0)));
  const event=p.waitForEvent('download');await p.locator('#sc-export-json').click();const output=JSON.parse(fs.readFileSync(await(await event).path(),'utf8'));
  assert.deepEqual(output,await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot()));assert.notDeepEqual(output.bars[0].melody,before.bars[0].melody);
  await p.locator('#sc-print').click();assert.equal(await p.evaluate(()=>__prints),1);
 }finally{await browser.close();}
});
