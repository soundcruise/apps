/* Disposable Chrome, local fixture songs, no auth/Sync/Authority probes. */
const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {install:installSvgProbe,read:readSvg,painted,assertMeasure,cases:engravingCases}=require('./helpers/staff-svg-probe.cjs');
const url=process.env.STUDIO_URL||'http://127.0.0.1:8767/apps/cruise-studio/index.html',origin=new URL(url).origin;
test('Melody staff preview in real Structure',async t=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),ctx=await browser.newContext();await require('./helpers/schema2-fixture.cjs').install(ctx);const p=await ctx.newPage();
 const errors=[],missing=[],external=[];
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin&&r.request().method()==='GET')return r.continue();if(u.hostname==='fonts.googleapis.com')return r.fulfill({body:'',contentType:'text/css'});external.push(u.href);return r.abort();});
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
 const ready=()=>p.waitForFunction(()=>document.querySelector('.melody-page')?.dataset.ready==='true');
 const midi=()=>p.locator('.melody-svg').first().getAttribute('data-notes');
 try{
 await p.goto(url);
 await p.evaluate(async()=>{
  const C=CruiseStudio;
  for(const id of ['staff-A','staff-B']){const d=C.model.createLegacySampleProject();d.projectId=id;d.songInfo.title=id;d.bars[0].melody=[{tick:0,durationTicks:720,step:id==='staff-A'?0:2,alter:0,octave:0}];d.bars[0].lyrics=[{tick:120,text:'あした'}];const r=await C.repository.save({target:{type:'project',projectId:id},snapshot:d,baseRevision:null});if(!r.ok)throw Error(r.error);}
  C.storage.setCurrentProjectId('staff-A');C.shellHost.navigate('sheetCruise');window.__staffWrites=[];
  const save=C.repository.save; // repository facade is immutable: storage observes actual committed project writes.
  for(const name of ['setItem','removeItem','clear']){const f=Storage.prototype[name];Storage.prototype[name]=function(...a){if(name==='clear'||String(a[0]).startsWith('cruiseStudio.project.')||a[0]==='cruiseStudio.projects.index')__staffWrites.push([name,a[0]]);return f.apply(this,a);};}
  for(const name of ['open','deleteDatabase']){const f=indexedDB[name].bind(indexedDB);indexedDB[name]=(...a)=>{__staffWrites.push(name);return f(...a);};}
 });
 await t.test('two styles only; code sheet unchanged until explicit view selection',async()=>{
  assert.equal(await p.locator('#sc-score-style option').count(),2);assert.equal(await p.locator('.melody-page').count(),0);
  await p.selectOption('#sc-score-style','melody');await ready();assert.equal(await p.locator('.melody-measure').count(),4);assert.match(await midi(),/C0\/4@0:720/);
  assert.equal(await p.locator('.melody-timing').count(),0);assert.match(await p.locator('.melody-status').innerText(),/自動を含む/);
  assert.equal(await p.locator('.melody-chords').first().innerText(),'C');assert.equal(await p.locator('.melody-lyrics span').first().getAttribute('data-tick'),'120');
  assert(await p.locator('.melody-svg svg').first().locator('path').count()>0);
 });
 await t.test('Loupe input DOM, native Undo, cursor and scroll survive staff redraw',async()=>{
  await p.locator('.melody-measure').first().locator('.melody-bar-heading').click();const input=p.locator('#sc-slot-overlay [data-overlay-field="doremi"]');await input.focus();
  await p.evaluate(()=>{window.__heldStaffInput=document.querySelector('#sc-slot-overlay [data-overlay-field="doremi"]');window.__staffScroll=document.querySelector('#studio-main').scrollTop;});
  await input.fill('ドレミ');await ready();
  const inputMs=await input.evaluate(e=>{const start=performance.now();e.dispatchEvent(new InputEvent('input',{bubbles:true,data:'ミ'}));return performance.now()-start;});assert(inputMs<100,'input handler remains responsive');console.log('STAFF_INPUT_RESPONSE_MS',inputMs);await ready();assert(await p.evaluate(()=>document.activeElement===__heldStaffInput&&__heldStaffInput.isConnected));
  await p.evaluate(()=>{window.__staffDomainUndos=0;CruiseStudio.sessions.subscribe((s,k)=>{if(k==='undo')__staffDomainUndos++;});});
  await input.press('End');await input.press('Backspace');await input.press('Meta+z');await ready();assert.equal(await p.evaluate(()=>__staffDomainUndos),0);
  assert(await p.evaluate(()=>document.activeElement===__heldStaffInput));
 });
 await t.test('IME buffer never adopted; composition completion retains element and text',async()=>{
  const input=p.locator('#sc-slot-overlay [data-overlay-field="doremi"]');await p.evaluate(()=>window.__beforeIME=document.querySelector('.melody-svg svg'));await input.dispatchEvent('compositionstart');
  await input.evaluate(e=>{e.value='ファ';e.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'ファ'}));});
  await p.waitForTimeout(50);if(process.env.STAFF_QA_DIR)await p.screenshot({path:process.env.STAFF_QA_DIR+'/ime-pending.png'});assert.equal(await p.locator('.melody-page').getAttribute('data-ready'),'false');
  assert.match(await p.locator('.melody-status').innerText(),/入力中.*確定後/);assert(await p.evaluate(()=>document.querySelector('.melody-svg svg')===__beforeIME&&getComputedStyle(__beforeIME.closest('.melody-bar-content')).visibility==='visible'));
  await input.dispatchEvent('compositionend',{data:'ファ'});await ready();assert.equal(await input.inputValue(),'ファ');assert(await p.evaluate(()=>document.activeElement===__heldStaffInput));
 });
 await t.test('domain Undo/Redo uses same draft and updates staff',async()=>{
  await p.locator('#sc-score-style').focus();await p.evaluate(()=>{const C=CruiseStudio;C.documents.getSession().finishTextGroup();C.documents.getSession().runOperation('staff fixture', __canonical => window.__editSchema1Fixture(__canonical, d=>d.bars[0].melody=[{tick:0,durationTicks:480,step:4,alter:0,octave:0}]));});await ready();assert.match(await midi(),/G0\/4/);
  await p.locator('#sc-undo').click();await ready();assert.match(await midi(),/F0\/4/);await p.locator('#sc-redo').click();await ready();assert.match(await midi(),/G0\/4/);
 });
 await t.test('A/B/A and workspace round trip never restore stale callbacks',async()=>{
  await p.evaluate(()=>CruiseStudio.documents.select('staff-B'));await ready();assert.equal(await p.locator('.melody-page').getAttribute('data-project-id'),'staff-B');assert.match(await midi(),/E0\/4/);
  await p.evaluate(()=>{const C=CruiseStudio;C.documents.select('staff-A');C.shellHost.navigate('preDtm');C.shellHost.navigate('sheetCruise');});await ready();assert.equal(await p.locator('.melody-page').getAttribute('data-project-id'),'staff-A');assert.match(await midi(),/G0\/4/);
 });
 await t.test('4 Themes and narrow layout preserve contrast and no document overflow',async()=>{
  for(const theme of ['dark','light','charcoal','gray'])for(const width of [390,768,1440,1920]){await p.setViewportSize({width,height:1000});await p.evaluate(x=>CruiseStudio.colorTheme.setColorTheme(x),theme);await ready();if(process.env.STAFF_QA_DIR)await p.screenshot({path:process.env.STAFF_QA_DIR+'/theme-'+theme+'-'+width+'.png'});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await p.locator('.melody-bar-paper').first().evaluate(e=>getComputedStyle(e).color),'rgb(41, 37, 31)');}
 });
 await t.test('print remains traditional code sheet and returns to staff preview',async()=>{
  await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));await p.emulateMedia({media:'print'});assert.equal(await p.locator('.melody-page').evaluate(e=>getComputedStyle(e).display),'none');assert.equal(await p.locator('.melody-print-fallback').evaluate(e=>getComputedStyle(e).display),'block');assert(await p.locator('.melody-print-fallback .sheet-bar').count()>0);await p.emulateMedia({media:'screen'});await p.evaluate(()=>window.dispatchEvent(new Event('afterprint')));assert.equal(await p.locator('.melody-print-fallback').count(),0);
 });
 await t.test('8/32/64 bars bounded rendering and a single edited bar is incremental',async()=>{
  const measurements=[];
  for(const n of [8,32,64]){await p.evaluate(n=>{const C=CruiseStudio;C.documents.getSession().runOperation('size fixture', __canonical => window.__editSchema1Fixture(__canonical, d=>{const bar=JSON.parse(JSON.stringify(d.bars[0]));d.bars=Array.from({length:n},(_,i)=>({...JSON.parse(JSON.stringify(bar)),barNumber:i+1,melody:Array.from({length:4},(_,j)=>({tick:j*480,durationTicks:480,step:j,alter:0,octave:0}))}));}));},n);await ready();const m=await p.evaluate(()=>CruiseStudio.sheetCruise.getStaffMetrics());assert.equal(m.bars,n);assert(m.totalMs<5000);assert(m.maxFrameMs<250);measurements.push({bars:n,totalMs:m.totalMs,maxFrameMs:m.maxFrameMs,timing:m.timing});for(const k of ['conversionMs','projectionMs','voicePreparationMs','widthMs','layoutMs','renderMs','domMs','rafWaitMs'])assert(Number.isFinite(m.timing[k])&&m.timing[k]>=0,'measured '+k);}
  await p.evaluate(()=>{window.__staffUnchanged=document.querySelectorAll('.melody-svg svg')[1];CruiseStudio.documents.getSession().runOperation('one bar', __canonical => window.__editSchema1Fixture(__canonical, d=>d.bars[0].melody[0].step=5));});await ready();const m=await p.evaluate(()=>CruiseStudio.sheetCruise.getStaffMetrics());assert.equal(m.drawn,1);assert(await p.evaluate(()=>__staffUnchanged===document.querySelectorAll('.melody-svg svg')[1]));console.log('STAFF_PERFORMANCE',JSON.stringify(measurements));
 });
 await t.test('queued multi-frame update cannot adopt after A/B or workspace identity changes',async()=>{
  await p.evaluate(()=>{const C=CruiseStudio;C.documents.getSession().runOperation('queued stale edit', __canonical => window.__editSchema1Fixture(__canonical, d=>d.bars[0].melody[0].step=6));C.documents.select('staff-B');});await ready();
  assert.equal(await p.locator('.melody-page').getAttribute('data-project-id'),'staff-B');assert.equal(await p.locator('.melody-measure').count(),4);assert((await midi()).includes('E0/4'));
  await p.evaluate(()=>{const C=CruiseStudio;C.documents.select('staff-A');C.shellHost.navigate('preDtm');});await p.waitForTimeout(50);
  await p.evaluate(()=>CruiseStudio.shellHost.navigate('sheetCruise'));await ready();assert.equal(await p.locator('.melody-page').getAttribute('data-project-id'),'staff-A');assert.equal(await p.locator('.melody-measure').count(),64);
 });
 await t.test('actual SVG notehead positions, accidentals and beams reflect the projected music',async()=>{
  await installSvgProbe(p);
  await p.evaluate(()=>CruiseStudio.documents.getSession().runOperation('engraving fixture', __canonical => window.__editSchema1Fixture(__canonical, d=>d.bars[0].melody=[
   {tick:0,durationTicks:240,step:0,alter:0,octave:0},{tick:240,durationTicks:240,step:1,alter:0,octave:0},
   {tick:480,durationTicks:240,step:3,alter:1,octave:0},{tick:720,durationTicks:240,step:3,alter:0,octave:0},
   {tick:960,durationTicks:960,step:0,alter:0,octave:1}])));await ready();
  const r=await readSvg(p),centers=r.notes.map(n=>{const b=n.heads[0].bbox;return b.y+b.height/2;});
  const notes=[['c/4',240,0],['d/4',240,240],['f#/4',240,480],['f/4',240,720],['c/5',960,960]].map(([key,ticks,onset])=>({keys:[key],ticks,onset,rest:false}));
  assertMeasure(r,{notes,accidentals:[{note:2,type:'#'},{note:3,type:'n'}],beams:[[0,1],[2,3]],signature:{key:'C',codes:[]}});
  assert.equal(centers.length,5);assert(Math.abs(centers[0]-centers[1]-5)<0.5);assert(Math.abs(centers[1]-centers[2]-10)<0.5);assert(Math.abs(centers[2]-centers[3])<0.5);assert(Math.abs(centers[3]-centers[4]-20)<0.5);

 });
 for(const fixture of engravingCases)await t.test('engraving semantics and live paint: '+fixture.id,async()=>{
  await p.evaluate(c=>{const C=CruiseStudio,r=C.documents.getSession().runOperation('engraving '+c.id, __canonical => window.__editSchema1Fixture(__canonical, d=>{
   d.songInfo.originalKey=d.songInfo.playKey=c.key;d.songInfo.capo=0;const sectionId=d.sections[0].id;
   d.bars=c.bars.map((melody,i)=>({barNumber:i+1,sectionId,chords:[],lyrics:[],melody,strumOverride:null,lineBreakAfter:false}));
  }));if(!r.ok)throw Error(JSON.stringify(r));},fixture);await ready();
  assert.equal(await p.locator('.melody-measure').count(),fixture.expected.length);
  for(let i=0;i<fixture.expected.length;i++)assertMeasure(await readSvg(p,i),fixture.expected[i]);
  if(process.env.STAFF_QA_DIR)await p.locator('.melody-page').screenshot({path:process.env.STAFF_QA_DIR+'/'+fixture.id+'.png'});
  // A labelled group without paint must fail, even though its metadata still exists.
  const erase=fixture.id==='C-F-sharp'?'accidental':fixture.id==='eighth-note-beams'?'beam':fixture.id==='tie-across-beat'?'tie':null;
  if(erase){const group=p.locator('[data-score-qa="'+erase+'"]').first(),html=await group.evaluate(g=>{const h=g.innerHTML;g.replaceChildren();return h;});
   const missingPaint=await readSvg(p);assert.throws(()=>assertMeasure(missingPaint,fixture.expected[0]),/actual .*paint/);
   await group.evaluate((g,h)=>{g.innerHTML=h;},html);assertMeasure(await readSvg(p),fixture.expected[0]);
  }
 });

 await t.test('integrated spacing: eighths, dense sixteenths, long adjacent text and shared ticks',async()=>{
  for(const [count,text] of [[8,false],[16,true]]){
   await p.evaluate(({count,text})=>CruiseStudio.documents.getSession().runOperation('layout fixture', __canonical => window.__editSchema1Fixture(__canonical, d=>{
    d.songInfo.originalKey=d.songInfo.playKey='C';d.songInfo.capo=0;d.sheetSettings.showChords=d.sheetSettings.showLyrics=true;d.sections[0].lyricsHidden=false;
    d.bars=d.bars.slice(0,1);const b=d.bars[0];b.melody=Array.from({length:count},(_,i)=>({tick:i*1920/count,durationTicks:1920/count,step:i%7,alter:0,octave:0}));
    b.chords=text?[{tick:0,symbol:'Cmaj7/G'},{tick:120,symbol:'Fmaj7/A'}]:[];
    b.lyrics=text?Array.from({length:16},(_,i)=>({tick:i*120,text:'Tomorrow morning '+i})):[];
   })),{count,text});await ready();
   const geometry=await p.locator('.melody-measure').evaluate(e=>{
    const root=e.querySelector('.melody-svg'),svg=root.querySelector('svg'),anchors=JSON.parse(root.dataset.anchors);
    const lanes=[...e.querySelectorAll('.melody-chords,.melody-lyrics')].map(row=>[...row.children].map(n=>({left:n.offsetLeft,width:n.getBoundingClientRect().width/(svg.getBoundingClientRect().width/svg.width.baseVal.value),tick:+n.dataset.tick})));
    return {lanes,anchors,viewport:e.querySelector('.melody-scroll').clientWidth,width:svg.width.baseVal.value,hint:!!e.querySelector('.melody-overflow-hint'),noteBounds:__staffSvgProbe.read(root).notes.map(n=>n.bbox)};
   });
   for(const lane of geometry.lanes){for(let i=1;i<lane.length;i++)assert(lane[i].left>=lane[i-1].left+lane[i-1].width+10,'adjacent text geometry never overlaps');for(const n of lane)assert(Math.abs(n.left-geometry.anchors.find(a=>a.tick===n.tick).x)<1,'text uses exact musical anchor');}
   for(const n of geometry.noteBounds)assert(n.x>=0&&n.x+n.width<=geometry.width,'all note glyphs inside paper');
   if(count===8)assert(geometry.width<=geometry.viewport+1,'eight eighths fully visible initially');else {assert(geometry.hint,'overflow is explained');await p.locator('.melody-scroll').evaluate(e=>e.scrollLeft=240);await p.evaluate(()=>CruiseStudio.documents.getSession().runOperation('scroll retained', __canonical => window.__editSchema1Fixture(__canonical, d=>d.bars[0].chords[0].symbol='Cmaj7')));await ready();assert.equal(await p.locator('.melody-scroll').evaluate(e=>e.scrollLeft),240);}
   if(process.env.STAFF_QA_DIR)await p.locator('.melody-page').screenshot({path:process.env.STAFF_QA_DIR+'/layout-'+count+'.png'});
  }
 });
 await t.test('system geometry, clef/key/time placement, song/capo and display settings',async()=>{
  await p.evaluate(()=>CruiseStudio.documents.getSession().runOperation('systems', __canonical => window.__editSchema1Fixture(__canonical, d=>{
   Object.assign(d.songInfo,{title:'カポの歌',originalKey:'D',playKey:'C',capo:2});const b=JSON.parse(JSON.stringify(d.bars[0]));
   d.bars=Array.from({length:4},(_,i)=>({...JSON.parse(JSON.stringify(b)),barNumber:i+1,lineBreakAfter:false,chords:[{tick:0,symbol:'C'}],lyrics:[{tick:0,text:'ことば'}],melody:[{tick:0,durationTicks:1920,step:0,alter:0,octave:i%2?-1:1}]}));
  })));await ready();
  const g=await p.locator('.melody-page').evaluate(e=>({rows:[...e.querySelectorAll('.melody-system')].map(r=>[...r.children].map(c=>{const s=c.querySelector('.melody-svg');return {y:s.getBoundingClientRect().top+(+s.dataset.staveY),start:s.dataset.systemStart,time:s.dataset.timeSignature,rect:c.getBoundingClientRect().toJSON()};})),caption:e.querySelector('.melody-caption').textContent}));
  assert(g.rows.every(r=>r.length===2));for(const row of g.rows){assert(Math.abs(row[0].y-row[1].y)<1);assert.equal(row[0].start,'true');assert.equal(row[1].start,'false');assert(Math.abs(row[0].rect.right-row[1].rect.left)<1,'connected measure boundary');}
  assert.equal(g.rows.flat().filter(x=>x.time==='true').length,1);assert.match(g.caption,/Key D.*Capo 2.*BPM 100.*4\/4/);assert.match(g.caption,/押さえ方.*実音/);
  if(process.env.STAFF_QA_DIR)await p.locator('.melody-page').screenshot({path:process.env.STAFF_QA_DIR+'/systems-capo.png'});
  await p.evaluate(()=>CruiseStudio.documents.getSession().runOperation('hide lanes', __canonical => window.__editSchema1Fixture(__canonical, d=>{d.sheetSettings.showChords=false;d.sheetSettings.showLyrics=false;})));await ready();assert.equal(await p.locator('.melody-chords,.melody-lyrics').count(),0);
  await p.evaluate(()=>CruiseStudio.documents.getSession().runOperation('section lyrics', __canonical => window.__editSchema1Fixture(__canonical, d=>{d.sheetSettings.showLyrics=true;d.sections[0].lyricsHidden=true;})));await ready();assert.equal(await p.locator('.melody-lyrics').count(),0);
 });
 await t.test('whole-measure rest is centred in the playable stave with actual visible paint',async()=>{
  await p.evaluate(()=>CruiseStudio.documents.getSession().runOperation('whole rest', __canonical => window.__editSchema1Fixture(__canonical, d=>{d.bars=d.bars.slice(0,1);d.bars[0].melody=[];d.bars[0].chords=[];d.bars[0].lyrics=[];})));await ready();
  const r=await readSvg(p);assert.equal(r.notes.length,1);assert.equal(r.notes[0].info.rest,true);assert.equal(r.notes[0].info.ticks,1920);assert(painted(r.notes[0].heads[0]));
  const w=await p.locator('.melody-svg svg').evaluate(s=>s.width.baseVal.value),bbox=r.notes[0].heads[0].bbox;
  assert(Math.abs((bbox.x+bbox.width/2)-(w+47)/2)<30,'full-measure rest centre, not at first attack');
  if(process.env.STAFF_QA_DIR)await p.locator('.melody-page').screenshot({path:process.env.STAFF_QA_DIR+'/whole-rest.png'});
 });
 await t.test('invalid solfege is rejected before publication with draft, saved point and Undo unchanged',async()=>{
  const r=await p.evaluate(()=>{const C=CruiseStudio,s=C.documents.getSession();
   const state=()=>JSON.stringify({draft:s.workingSnapshot(),base:s.baseSnapshot,revision:s.baseRevision,history:s.getHistory(),dirty:s.dirty,version:s.snapshotVersion,saved:C.repository.readRevision(s.target)});
   const before=state(),result=s.runOperation('rejected invalid solfege', __canonical => window.__editSchema1Fixture(__canonical, d=>d.bars[0].melody=[{tick:0,durationTicks:480,step:7,alter:0,octave:0}]));
   return {result,before,after:state()};});
  assert.equal(r.result.ok,false);assert.equal(r.result.code,'operation-failed');assert.equal(r.after,r.before,'rejected input cannot change draft/base/saved/history');await ready();
 });
 await t.test('fatal and unsupported duration: stored, expanded, collapsed and human-readable diagnostics',async()=>{
  await p.evaluate(()=>CruiseStudio.documents.getSession().runOperation('unsupported duration', __canonical => window.__editSchema1Fixture(__canonical, d=>d.bars[0].melody=[{tick:0,durationTicks:160,step:0,alter:0,octave:0}])));
  const unsupported=()=>p.waitForFunction(()=>document.querySelector('.melody-status').textContent.includes('三連符'));
  await unsupported();assert.equal(await p.locator('.melody-page').getAttribute('data-ready'),'false');
  const details=p.locator('.melody-details'),summary=details.locator('summary'),content=details.locator('pre');
  assert.equal(await details.count(),1);assert.equal(await details.evaluate(e=>e.open),false);
  assert.equal(await content.textContent(),'unsupported-duration-grid','technical code is stored even while closed');
  assert.equal(await content.innerText(),'','collapsed technical detail is not rendered text');
  assert(!/PPQ|unsupported-/.test(await p.locator('.melody-status').innerText()));assert.match(await p.locator('.melody-status').innerText(),/1小節目/);
  await summary.click();await unsupported();assert.equal(await details.evaluate(e=>e.open),true,'native details exposes expanded state');
  assert.equal(await content.innerText(),'unsupported-duration-grid');assert(await content.evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility==='visible';}));
  if(process.env.STAFF_QA_DIR)await details.screenshot({path:process.env.STAFF_QA_DIR+'/diagnostic-expanded.png'});
  await summary.click();await unsupported();assert.equal(await details.evaluate(e=>e.open),false);assert.equal(await content.innerText(),'');
  assert(!/unsupported-duration-grid/.test(await p.locator('.melody-page').innerText()));
  assert.equal(await p.locator('.melody-bar-content').first().evaluate(e=>getComputedStyle(e).visibility),'hidden','fatal hides previous engraving');
  await p.evaluate(()=>CruiseStudio.documents.getSession().undo());await ready();
  const rejected=await p.evaluate(()=>{const C=CruiseStudio,s=C.documents.getSession(),before=JSON.stringify(s.workingSnapshot()),result=s.runOperation('out of MIDI range', __canonical=>window.__editSchema1Fixture(__canonical,d=>C.model.setBarDoremiText(d,1,'ド↑↑↑↑↑↑ レ↑↑↑↑↑↑')));return {result,before,after:JSON.stringify(s.workingSnapshot())};});
  assert.equal(rejected.result.ok,false,'schema 2 rejects out-of-range pitch before publication');assert.equal(rejected.after,rejected.before);await ready();
  const diagnostic=await p.evaluate(()=>{const C=CruiseStudio,d=C.model.createLegacySampleProject();d.bars[0].melody=[{tick:0,durationTicks:480,step:0,alter:0,octave:6}];return C.commonMusic.createConverter({studioTheory:C.theory,chordTheory:ChordCruise.theory,validate:C.model.validateProject}).convert({source:'working',project:d,sessionId:'legacy-test',version:'1',baseRevision:null,token:{sessionId:'legacy-test',projectId:d.projectId,generation:1}});});assert.equal(diagnostic.ok,false);assert(diagnostic.diagnostics.some(d=>d.code==='invalid-melody-pitch'));
  // An explicitly unsupported schema 1 meter remains a read-only-compatible document.
  await p.evaluate(()=>{const C=CruiseStudio,d=C.model.createLegacySampleProject();d.projectId='legacy-meter';d.songInfo.timeSignature.beats=6;const priorWrites=__staffWrites.length;localStorage.setItem('cruiseStudio.project.legacy-meter',JSON.stringify(d));if(__staffWrites.length!==priorWrites+1)throw Error('fixture write accounting');__staffWrites.splice(priorWrites,1);if(!C.documents.select(d.projectId))throw Error('legacy meter open');});
  await p.waitForFunction(()=>document.querySelector('.melody-status').textContent.includes('この拍子'));assert.equal(await p.locator('.melody-page').getAttribute('data-ready'),'false');assert.equal(await p.evaluate(()=>CruiseStudio.documents.getSession().draft.schemaVersion),1);
  await p.evaluate(()=>{CruiseStudio.documents.select('staff-A');});await ready();
 });
 await t.test('no project writes/IDB, schema1, shared write OFF, Console/404/network zero',async()=>{
  assert.deepEqual(await p.evaluate(()=>__staffWrites),[]);assert.equal(await p.evaluate(()=>CruiseStudio.model.APP_VERSION),'0.43.1');assert.equal(await p.evaluate(()=>CruiseStudio.documents.getSession().draft.schemaVersion),2);assert.equal(await p.evaluate(()=>CruiseStudio.portDataHost.canWrite),false);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.deepEqual(external,[]);
 });
 }finally{await ctx.close();await browser.close();}
});
