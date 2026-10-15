/* Disposable Chrome, local fixture songs, no auth/Sync/Authority probes. */
const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {install:installSvgProbe,read:readSvg,painted,assertMeasure,cases:engravingCases}=require('./helpers/staff-svg-probe.cjs');
const url=process.env.STUDIO_URL||'http://127.0.0.1:8767/apps/cruise-studio/index.html',origin=new URL(url).origin;
test('Melody staff preview in real Structure',async t=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),ctx=await browser.newContext(),p=await ctx.newPage();
 const errors=[],missing=[],external=[];
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin&&r.request().method()==='GET')return r.continue();if(u.hostname==='fonts.googleapis.com')return r.fulfill({body:'',contentType:'text/css'});external.push(u.href);return r.abort();});
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
 const ready=()=>p.waitForFunction(()=>document.querySelector('.melody-page')?.dataset.ready==='true');
 const midi=()=>p.locator('.melody-svg').first().getAttribute('data-notes');
 try{
 await p.goto(url);
 await p.evaluate(async()=>{
  const C=CruiseStudio;
  for(const id of ['staff-A','staff-B']){const d=C.model.createSampleProject();d.projectId=id;d.songInfo.title=id;d.bars[0].melody=[{tick:0,durationTicks:720,step:id==='staff-A'?0:2,alter:0,octave:0}];d.bars[0].lyrics=[{tick:120,text:'あした'}];const r=await C.repository.save({target:{type:'project',projectId:id},snapshot:d,baseRevision:null});if(!r.ok)throw Error(r.error);}
  C.storage.setCurrentProjectId('staff-A');C.shellHost.navigate('sheetCruise');window.__staffWrites=[];
  const save=C.repository.save; // repository facade is immutable: storage observes actual committed project writes.
  for(const name of ['setItem','removeItem','clear']){const f=Storage.prototype[name];Storage.prototype[name]=function(...a){if(name==='clear'||String(a[0]).startsWith('cruiseStudio.project.')||a[0]==='cruiseStudio.projects.index')__staffWrites.push([name,a[0]]);return f.apply(this,a);};}
  for(const name of ['open','deleteDatabase']){const f=indexedDB[name].bind(indexedDB);indexedDB[name]=(...a)=>{__staffWrites.push(name);return f(...a);};}
 });
 await t.test('two styles only; code sheet unchanged until explicit view selection',async()=>{
  assert.equal(await p.locator('#sc-score-style option').count(),2);assert.equal(await p.locator('.melody-page').count(),0);
  await p.selectOption('#sc-score-style','melody');await ready();assert.equal(await p.locator('.melody-measure').count(),4);assert.match(await midi(),/C0\/4@0:720/);
  assert.equal(await p.locator('.melody-timing').count(),4);assert.match(await p.locator('.melody-status').innerText(),/自動を含む/);
  assert.equal(await p.locator('.melody-chords').first().innerText(),'C');assert.equal(await p.locator('.melody-lyrics span').first().getAttribute('data-tick'),'120');
  assert(await p.locator('.melody-svg svg').first().locator('path').count()>0);
 });
 await t.test('Loupe input DOM, native Undo, cursor and scroll survive staff redraw',async()=>{
  await p.locator('.melody-measure').first().click();const input=p.locator('#sc-slot-overlay [data-overlay-field="doremi"]');await input.focus();
  await p.evaluate(()=>{window.__heldStaffInput=document.querySelector('#sc-slot-overlay [data-overlay-field="doremi"]');window.__staffScroll=document.querySelector('#studio-main').scrollTop;});
  await input.fill('ドレミ');await ready();assert(await p.evaluate(()=>document.activeElement===__heldStaffInput&&__heldStaffInput.isConnected));
  await p.evaluate(()=>{window.__staffDomainUndos=0;CruiseStudio.sessions.subscribe((s,k)=>{if(k==='undo')__staffDomainUndos++;});});
  await input.press('End');await input.press('Backspace');await input.press('Meta+z');await ready();assert.equal(await p.evaluate(()=>__staffDomainUndos),0);
  assert(await p.evaluate(()=>document.activeElement===__heldStaffInput));
 });
 await t.test('IME buffer never adopted; composition completion retains element and text',async()=>{
  const input=p.locator('#sc-slot-overlay [data-overlay-field="doremi"]');await input.dispatchEvent('compositionstart');
  await input.evaluate(e=>{e.value='ファ';e.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'ファ'}));});
  await p.waitForTimeout(50);assert.equal(await p.locator('.melody-page').getAttribute('data-ready'),'false');
  await input.dispatchEvent('compositionend',{data:'ファ'});await ready();assert.equal(await input.inputValue(),'ファ');assert(await p.evaluate(()=>document.activeElement===__heldStaffInput));
 });
 await t.test('domain Undo/Redo uses same draft and updates staff',async()=>{
  await p.locator('#sc-score-style').focus();await p.evaluate(()=>{const C=CruiseStudio;C.documents.getSession().finishTextGroup();C.documents.getSession().runOperation('staff fixture',d=>d.bars[0].melody=[{tick:0,durationTicks:480,step:4,alter:0,octave:0}]);});await ready();assert.match(await midi(),/G0\/4/);
  await p.locator('#sc-undo').click();await ready();assert.match(await midi(),/F0\/4/);await p.locator('#sc-redo').click();await ready();assert.match(await midi(),/G0\/4/);
 });
 await t.test('A/B/A and workspace round trip never restore stale callbacks',async()=>{
  await p.evaluate(()=>CruiseStudio.documents.select('staff-B'));await ready();assert.equal(await p.locator('.melody-page').getAttribute('data-project-id'),'staff-B');assert.match(await midi(),/E0\/4/);
  await p.evaluate(()=>{const C=CruiseStudio;C.documents.select('staff-A');C.shellHost.navigate('preDtm');C.shellHost.navigate('sheetCruise');});await ready();assert.equal(await p.locator('.melody-page').getAttribute('data-project-id'),'staff-A');assert.match(await midi(),/G0\/4/);
 });
 await t.test('4 Themes and narrow layout preserve contrast and no document overflow',async()=>{
  for(const theme of ['dark','light','charcoal','gray'])for(const width of [600,1280]){await p.setViewportSize({width,height:1000});await p.evaluate(x=>CruiseStudio.colorTheme.setColorTheme(x),theme);await ready();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await p.locator('.melody-bar-paper').first().evaluate(e=>getComputedStyle(e).color),'rgb(41, 37, 31)');}
 });
 await t.test('print remains traditional code sheet and returns to staff preview',async()=>{
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));await p.emulateMedia({media:'print'});assert.equal(await p.locator('.melody-page').evaluate(e=>getComputedStyle(e).display),'none');assert.equal(await p.locator('.melody-print-fallback').evaluate(e=>getComputedStyle(e).display),'block');assert(await p.locator('.melody-print-fallback .sheet-bar').count()>0);await p.emulateMedia({media:'screen'});await p.evaluate(()=>window.dispatchEvent(new Event('afterprint')));assert.equal(await p.locator('.melody-print-fallback').count(),0);
 });
 await t.test('8/32/64 bars bounded rendering and a single edited bar is incremental',async()=>{
  const measurements=[];
  for(const n of [8,32,64]){await p.evaluate(n=>{const C=CruiseStudio;C.documents.getSession().runOperation('size fixture',d=>{const bar=JSON.parse(JSON.stringify(d.bars[0]));d.bars=Array.from({length:n},(_,i)=>({...JSON.parse(JSON.stringify(bar)),barNumber:i+1,melody:Array.from({length:4},(_,j)=>({tick:j*480,durationTicks:480,step:j,alter:0,octave:0}))}));});},n);await ready();const m=await p.evaluate(()=>CruiseStudio.sheetCruise.getStaffMetrics());assert.equal(m.bars,n);assert(m.totalMs<5000);assert(m.maxFrameMs<250);measurements.push({bars:n,totalMs:m.totalMs,maxFrameMs:m.maxFrameMs});}
  await p.evaluate(()=>{window.__staffUnchanged=document.querySelectorAll('.melody-svg svg')[1];CruiseStudio.documents.getSession().runOperation('one bar',d=>d.bars[0].melody[0].step=5);});await ready();const m=await p.evaluate(()=>CruiseStudio.sheetCruise.getStaffMetrics());assert.equal(m.drawn,1);assert(await p.evaluate(()=>__staffUnchanged===document.querySelectorAll('.melody-svg svg')[1]));console.log('STAFF_PERFORMANCE',JSON.stringify(measurements));
 });
 await t.test('actual SVG notehead positions, accidentals and beams reflect the projected music',async()=>{
  await installSvgProbe(p);
  await p.evaluate(()=>CruiseStudio.documents.getSession().runOperation('engraving fixture',d=>d.bars[0].melody=[
   {tick:0,durationTicks:240,step:0,alter:0,octave:0},{tick:240,durationTicks:240,step:1,alter:0,octave:0},
   {tick:480,durationTicks:240,step:3,alter:1,octave:0},{tick:720,durationTicks:240,step:3,alter:0,octave:0},
   {tick:960,durationTicks:960,step:0,alter:0,octave:1}]));await ready();
  const r=await readSvg(p),centers=r.notes.map(n=>{const b=n.heads[0].bbox;return b.y+b.height/2;});
  const notes=[['c/4',240,0],['d/4',240,240],['f#/4',240,480],['f/4',240,720],['c/5',960,960]].map(([key,ticks,onset])=>({keys:[key],ticks,onset,rest:false}));
  assertMeasure(r,{notes,accidentals:[{note:2,type:'#'},{note:3,type:'n'}],beams:[[0,1],[2,3]],signature:{key:'C',codes:[]}});
  assert.equal(centers.length,5);assert(Math.abs(centers[0]-centers[1]-5)<0.5);assert(Math.abs(centers[1]-centers[2]-10)<0.5);assert(Math.abs(centers[2]-centers[3])<0.5);assert(Math.abs(centers[3]-centers[4]-20)<0.5);

 });
 for(const fixture of engravingCases)await t.test('engraving semantics and live paint: '+fixture.id,async()=>{
  await p.evaluate(c=>{const C=CruiseStudio,r=C.documents.getSession().runOperation('engraving '+c.id,d=>{
   d.songInfo.originalKey=d.songInfo.playKey=c.key;d.songInfo.capo=0;const sectionId=d.sections[0].id;
   d.bars=c.bars.map((melody,i)=>({barNumber:i+1,sectionId,chords:[],lyrics:[],melody,strumOverride:null,lineBreakAfter:false}));
  });if(!r.ok)throw Error(JSON.stringify(r));},fixture);await ready();
  assert.equal(await p.locator('.melody-measure').count(),fixture.expected.length);
  for(let i=0;i<fixture.expected.length;i++)assertMeasure(await readSvg(p,i),fixture.expected[i]);
  // A labelled group without paint must fail, even though its metadata still exists.
  const erase=fixture.id==='C-F-sharp'?'accidental':fixture.id==='eighth-note-beams'?'beam':fixture.id==='tie-across-beat'?'tie':null;
  if(erase){const group=p.locator('[data-score-qa="'+erase+'"]').first(),html=await group.evaluate(g=>{const h=g.innerHTML;g.replaceChildren();return h;});
   const missingPaint=await readSvg(p);assert.throws(()=>assertMeasure(missingPaint,fixture.expected[0]),/actual .*paint/);
   await group.evaluate((g,h)=>{g.innerHTML=h;},html);assertMeasure(await readSvg(p),fixture.expected[0]);
  }
 });
 await t.test('fatal and unsupported duration display reason and hide old notes',async()=>{
  await p.evaluate(()=>CruiseStudio.documents.getSession().runOperation('unsupported duration',d=>d.bars[0].melody[0].durationTicks=160));await p.waitForFunction(()=>document.querySelector('.melody-status').textContent.includes('unsupported-duration-grid'));assert.equal(await p.locator('.melody-page').getAttribute('data-ready'),'false');
  await p.evaluate(()=>CruiseStudio.documents.getSession().undo());await ready();await p.evaluate(()=>CruiseStudio.documents.getSession().runOperation('meter',d=>d.songInfo.timeSignature.beats=6));await p.waitForFunction(()=>document.querySelector('.melody-status').textContent.includes('unsupported-time-signature'));assert.equal(await p.locator('.melody-page').getAttribute('data-ready'),'false');
  await p.evaluate(()=>CruiseStudio.documents.getSession().undo());await ready();
 });
 await t.test('no project writes/IDB, schema1, shared write OFF, Console/404/network zero',async()=>{
  assert.deepEqual(await p.evaluate(()=>__staffWrites),[]);assert.equal(await p.evaluate(()=>CruiseStudio.model.APP_VERSION),'0.38.0');assert.equal(await p.evaluate(()=>CruiseStudio.documents.getSession().draft.schemaVersion),1);assert.equal(await p.evaluate(()=>CruiseStudio.portDataHost.canWrite),false);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.deepEqual(external,[]);
 });
 }finally{await ctx.close();await browser.close();}
});
