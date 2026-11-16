async function openPaperSettings(page){return (await require('./helpers/score-toolbar.cjs').toolbarControl(page,'#sc-paper-settings')).click();}
const {toolbarControl}=require('./helpers/score-toolbar.cjs');
// Fresh loopback contexts and synthetic data only; never uses the user's profile.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'../../..'),origin='http://127.0.0.1:18874';
for(const engine of ['chrome','webkit'])test('long score style updates keep paper and form nodes; structure, cancel and save still work: '+engine,async()=>{
 const {createUITestProject}=await import(pathToFileURL(path.join(root,'apps/cruise-studio/scripts/create-ui-test-project.mjs')));
 const project=createUITestProject();
 // Repeat entire independently identified Projects through the existing generator's data.
 const source=structuredClone(project);project.bars=[];project.performance.formBindings=[];project.performance.barRhythms=[];project.notation.lineBreakAfter=[];
 for(let i=0;i<128;i++){
  const old=source.bars[i%source.bars.length],bar=structuredClone(old),ids=new Map();bar.id=crypto.randomUUID();
  for(const key of ['chords','lyrics','melody'])for(const e of bar[key]){const id=e.id;e.id=crypto.randomUUID();ids.set(id,e.id);}project.bars.push(bar);
  for(const b of source.performance.formBindings)if(ids.has(b.chordEventId))project.performance.formBindings.push({...b,id:crypto.randomUUID(),chordEventId:ids.get(b.chordEventId)});
  for(const b of source.performance.barRhythms)if(b.barId===old.id)project.performance.barRhythms.push({...b,id:crypto.randomUUID(),barId:bar.id});
 }
 const browser=await(engine==='chrome'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch());
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[],external=[];
  await context.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});
  const p=await context.newPage();p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto(origin);await p.locator('#open-sheet-cruise').click();await p.locator('#sc-import-json').setInputFiles({name:'long.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await p.waitForFunction(()=>CruiseStudio.sheetCruise.getSession().draft.bars.length===128);await (await toolbarControl(p,'#sc-show-forms')).check();
  const before=await p.evaluate(()=>({project:CruiseStudio.sheetCruise.getSession().workingSnapshot(),history:CruiseStudio.sheetCruise.getSession().getHistory()}));
  await openPaperSettings(p);
  await p.evaluate(()=>{window.__retained=[document.querySelector('#sc-sheet-scale-box .sheet-page'),document.querySelector('.sc-layout-example-paper .sheet-page'),document.querySelector('.sc-layout-example-paper .sheet-form-event svg')];window.__renders=0;const render=CruiseStudio.sheetRenderer.render;CruiseStudio.sheetRenderer.render=(...args)=>{__renders++;return render(...args);};});
  async function range(selector,value){await p.locator(selector).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},value);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
  await range('[data-layout-setting=chordSize]',24);await range('[data-text-color=lyrics]','#123456');await range('[data-line-width=bar]',3);
  assert.equal(await p.evaluate(()=>__renders),0);assert(await p.evaluate(()=>__retained.every(e=>e.isConnected)));
  for(const host of ['#sc-sheet-scale-box','.sc-layout-example-paper'])assert.equal(await p.locator(host+' .sheet-bar-chord').first().evaluate(e=>getComputedStyle(e).fontSize),'24px');
  for(const host of ['#sc-sheet-scale-box','.sc-layout-example-paper']){assert.equal(await p.locator(host+' .sheet-bar-lyrics').first().evaluate(e=>getComputedStyle(e).color),'rgb(18, 52, 86)');assert.equal(await p.locator(host+' .sheet-line').first().evaluate(e=>getComputedStyle(e).borderLeftWidth),'3px');}
  await p.locator('[data-layout-setting=barsPerLine]').selectOption('2');assert.equal(await p.evaluate(()=>__renders),2);assert(await p.evaluate(()=>__retained.every(e=>e.isConnected)));
  await p.locator('[data-layout-cancel]').click();assert.equal(await p.locator('#sc-sheet-scale-box .sheet-bar-chord').first().evaluate(e=>getComputedStyle(e).fontSize),'16px');
  await openPaperSettings(p);await range('[data-layout-setting=chordSize]',22);await p.locator('[data-layout-save]').click();
  await openPaperSettings(p);assert.equal(await p.locator('[data-layout-setting=chordSize]').inputValue(),'22');await p.locator('[data-layout-cancel]').click();
  assert.deepEqual(await p.evaluate(()=>({project:CruiseStudio.sheetCruise.getSession().workingSnapshot(),history:CruiseStudio.sheetCruise.getSession().getHistory()})),before);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 }finally{await browser.close();}
});
