// Isolated synthetic UI measurement. No project or preference is written in a user profile.
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{randomUUID}=require('node:crypto');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../../..');
const output=process.env.SCORE_LAYOUT_METRICS_OUT||path.join(root,'apps/cruise-studio/docs/acoustic-review-20261115');
(async()=>{
 const {createUITestProject}=await import(pathToFileURL(path.join(root,'apps/cruise-studio/scripts/create-ui-test-project.mjs')));
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const rows=[];fs.mkdirSync(output,{recursive:true});
 try{for(const count of [12,128,256]){
  const p=createUITestProject(),source=structuredClone(p);p.bars=[];p.performance.formBindings=[];p.performance.barRhythms=[];p.notation.lineBreakAfter=[];
  for(let i=0;i<count;i++){
   const original=source.bars[i%source.bars.length],bar=structuredClone(original),ids=new Map();bar.id=randomUUID();
   for(const field of ['chords','melody','lyrics'])for(const e of bar[field]){ids.set(e.id,randomUUID());e.id=ids.get(e.id);}
   p.bars.push(bar);
   for(const b of source.performance.formBindings)if(ids.has(b.chordEventId))p.performance.formBindings.push({...b,id:randomUUID(),chordEventId:ids.get(b.chordEventId)});
   for(const b of source.performance.barRhythms)if(b.barId===original.id)p.performance.barRhythms.push({...b,id:randomUUID(),barId:bar.id});
  }
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(60000);
  await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:18874'?route.continue():route.abort());
  page.on('dialog',d=>d.accept());await page.goto('http://127.0.0.1:18874');await page.locator('#open-sheet-cruise').click();
  await page.locator('#sc-import-json').setInputFiles({name:'synthetic-layout.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
  await page.waitForFunction(n=>CruiseStudio.sheetCruise.getSession().workingSnapshot().bars.length===n,count);
  await page.locator('#sc-show-forms').check();
  const before=await page.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot()));
  if(count===12)await page.screenshot({path:path.join(output,'score-toolbar.png')});
  await page.locator('#sc-paper-settings').click();await page.locator('[data-paper-layout] .sheet-bar').first().waitFor();
  const measured=await page.evaluate(()=>{
   const slider=document.querySelector('[data-layout-setting=chordSize]'),times=[];
   for(const value of [17,18,19,20,21]){slider.value=value;const start=performance.now();slider.dispatchEvent(new Event('input',{bubbles:true}));void document.body.offsetHeight;times.push(performance.now()-start);}
   return {timesMs:times,domNodes:document.querySelectorAll('*').length,formSVGs:document.querySelectorAll('.sheet-form-event svg').length,
    localNotice:/端末|ブラウザ/.test(document.querySelector('[data-paper-layout]').textContent),visibleButtons:[...document.querySelectorAll('.sheet-toolbar button')].filter(e=>e.getClientRects().length).length};
  });
  if(count===128)await page.screenshot({path:path.join(output,'layout-128-bars.png')});
  await page.keyboard.press('Escape');if(await page.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession().workingSnapshot()))!==before)throw Error('Project changed');
  rows.push({bars:count,...measured});await context.close();
 }}finally{await browser.close();}
 fs.writeFileSync(path.join(output,'layout-metrics.json'),JSON.stringify({engine:'Chrome',viewport:[1440,1000],note:'Synchronous input + forced layout, 5 consecutive values; single-machine observation, not a mobile benchmark.',rows},null,2)+'\n');console.log(JSON.stringify(rows));
})().catch(e=>{console.error(e);process.exitCode=1;});
