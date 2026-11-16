// Local-only benchmark. Synthetic Projects, disposable contexts, no external requests.
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'../../..'),origin='http://127.0.0.1:18874';
function longProject(source,count){
 const p=structuredClone(source);p.bars=[];p.performance.formBindings=[];p.performance.barRhythms=[];p.notation.lineBreakAfter=[];delete p.extensions?.scoreLayoutV1;
 for(let i=0;i<count;i++){const old=source.bars[i%source.bars.length],bar=structuredClone(old),ids=new Map();bar.id=crypto.randomUUID();bar.sectionId=p.sections[Math.min(3,Math.floor(i*4/count))].id;
  for(const key of ['chords','lyrics','melody'])for(const e of bar[key]){const id=e.id;e.id=crypto.randomUUID();ids.set(id,e.id);}p.bars.push(bar);
  for(const b of source.performance.formBindings)if(ids.has(b.chordEventId))p.performance.formBindings.push({...b,id:crypto.randomUUID(),chordEventId:ids.get(b.chordEventId)});
  for(const b of source.performance.barRhythms)if(b.barId===old.id)p.performance.barRhythms.push({...b,id:crypto.randomUUID(),barId:bar.id});
 }return p;
}
async function measure(page,selector,event,value,ready){return page.evaluate(async({selector,event,value,ready})=>{
 const el=document.querySelector(selector);if(!el)throw Error(selector);window.__renderCalls=[];const t=performance.now();if(event==='click')el.click();else{el.value=value;el.dispatchEvent(new Event(event,{bubbles:true}));}const sync=performance.now()-t;
 const ok=()=>ready==='settings'?!!document.querySelector('[data-paper-layout] .sheet-form-event'):document.querySelectorAll('#sc-sheet-scale-box .sheet-bar[data-bar-number]').length===ready;
 if(ready){const start=performance.now();while(!ok()){if(performance.now()-start>30000)throw Error('ready timeout '+JSON.stringify({ready,bars:CruiseStudio.sheetCruise.getSession()?.draft.bars.length,count:document.querySelectorAll('#sc-sheet-scale-box .sheet-bar[data-bar-number]').length,active:CruiseStudio.shellHost.getActiveWorkspace()}));await new Promise(r=>setTimeout(r,16));}}
 await Promise.race([new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),new Promise((_,reject)=>setTimeout(()=>reject(Error('frame timeout '+document.visibilityState)),5000))]);const elapsed=performance.now()-t;
 return {syncMs:sync,settledMs:elapsed,renders:window.__renderCalls,mainNodes:document.querySelector('#sc-sheet-scale-box').querySelectorAll('*').length,sampleNodes:document.querySelector('.sc-layout-example-paper')?.querySelectorAll('*').length||0};
 },{selector,event,value,ready});}
async function run(){
 const out=process.argv[2];if(!out||!path.isAbsolute(out))throw Error('absolute output path required');
 const engine=process.env.SCORE_ENGINE||'chrome',counts=(process.env.SCORE_BARS||'12,128,256').split(',').map(Number),rounds=Number(process.env.SCORE_ROUNDS||3);
 const {createUITestProject}=await import(pathToFileURL(path.join(root,'apps/cruise-studio/scripts/create-ui-test-project.mjs')));
 const browser=await(engine==='webkit'?webkit.launch():chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}));
 const result={node:process.version,fixture:'repeated synthetic score, four contiguous sections',sourceRef:process.env.SCORE_SOURCE_REF||'working-tree',engine,browser:browser.version(),viewport:{width:1440,height:1000},rounds,counts,results:[]};
 try{for(const bars of counts)for(let round=0;round<rounds;round++){
  const c=await browser.newContext({viewport:result.viewport}),p=await c.newPage(),errors=[],external=[];p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await c.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}const file=new URL(r.request().url()).pathname;if(process.env.SCORE_SOURCE_REF&&['sheet-cruise.js','paper-forms.mjs','paper-layout.mjs','sheet-renderer.js'].some(name=>file.endsWith('/'+name)))return r.fulfill({contentType:'text/javascript',body:execFileSync('git',['show',process.env.SCORE_SOURCE_REF+':'+file.slice(1)],{cwd:root})});return r.continue();});
  try{await p.goto(origin);await p.click('#open-sheet-cruise');const project=longProject(createUITestProject(),bars);await p.locator('#sc-import-json').setInputFiles({name:'geometry.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await p.waitForFunction(id=>CruiseStudio.sheetCruise.getSession().draft.projectId===id,project.projectId);
   await p.evaluate(()=>CruiseStudio.localPaperLayout.set({barsPerLine:4,formScale:100,appearance:{visibility:{forms:true}}}));if(await p.locator('#sc-save').isEnabled())await p.click('#sc-save');await p.waitForFunction(()=>!CruiseStudio.sheetCruise.getSession().dirty);await p.reload();await p.waitForFunction(()=>document.documentElement.dataset.studioEntry==='ready'&&CruiseStudio.documents);await p.locator('#open-sheet-cruise').waitFor();await p.waitForFunction(()=>!document.querySelector('#open-sheet-cruise').disabled);
   await p.evaluate(()=>window.addEventListener('click',()=>{window.__firstStart=performance.now();},{capture:true,once:true}));await p.click('#open-sheet-cruise');const first=await p.evaluate(async bars=>{const deadline=performance.now()+30000;while(document.querySelectorAll('#sc-sheet-scale-box .sheet-bar[data-bar-number]').length!==bars){if(performance.now()>deadline)throw Error('first render timeout');await new Promise(r=>setTimeout(r,16));}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {settledMs:performance.now()-__firstStart,mainNodes:document.querySelector('#sc-sheet-scale-box').querySelectorAll('*').length};},bars);await p.waitForFunction(n=>document.querySelectorAll('#sc-sheet-scale-box .sheet-form-event').length>=n,bars);
   await p.evaluate(()=>{window.__renderCalls=[];const original=CruiseStudio.sheetRenderer.render;CruiseStudio.sheetRenderer.render=function(project,host,options){const t=performance.now();const value=original(project,host,options);__renderCalls.push({host:host.id||host.className,ms:performance.now()-t});return value;};});
   const before=await p.evaluate(()=>JSON.stringify({project:CruiseStudio.sheetCruise.getSession().workingSnapshot(),history:CruiseStudio.sheetCruise.getSession().getHistory()}));await p.click('#sc-display-menu-toggle');await p.locator('#sc-paper-settings').waitFor();const open=await measure(p,'#sc-paper-settings','click',null,'settings');
   const profiler=process.env.SCORE_PROFILE&&engine==='chrome'?await c.newCDPSession(p):null;if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.start');}const scaling=[];for(const value of [80,100,120,140,60,100])scaling.push({value,...await measure(p,'[data-layout-setting=formScale]','input',value)});
   const columns=[];for(const value of [2,4,3,1,4])columns.push({value,...await measure(p,'[data-layout-setting=barsPerLine]','change',value)});
   if(profiler){const profile=await profiler.send('Profiler.stop');fs.writeFileSync(out.replace('.json','.profile.json'),JSON.stringify(profile.profile));await profiler.detach();}await p.locator('[data-layout-cancel]').click();await p.locator('[data-paper-layout]').waitFor({state:'detached'});assert.equal(await p.evaluate(()=>JSON.stringify({project:CruiseStudio.sheetCruise.getSession().workingSnapshot(),history:CruiseStudio.sheetCruise.getSession().getHistory()})),before);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
   const row={bars,round,first,open,scaling,columns};result.results.push(row);console.log(JSON.stringify({engine,bars,round,first:Math.round(first.settledMs),open:Math.round(open.settledMs),scaling:scaling.map(v=>Math.round(v.settledMs)),columns:columns.map(v=>Math.round(v.settledMs))}));
   fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  }finally{await c.close();}
 }}finally{await browser.close();}
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={longProject,measure};
