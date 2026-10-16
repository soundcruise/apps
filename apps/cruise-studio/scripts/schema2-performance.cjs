/* Run only with two isolated loopback origins. Output keeps exact shared fixtures and every sample. */
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const runs=Number(process.env.PERF_RUNS||20),counts=(process.env.PERF_COUNTS||'8,32,64,128').split(',').map(Number),warmup=3;
const stats=a=>{const s=[...a].sort((a,b)=>a-b);return{n:a.length,p50:s[Math.ceil(s.length*.5)-1],p95:s[Math.ceil(s.length*.95)-1],max:s.at(-1)};};
(async()=>{
 const urls=[['0.38.1',process.env.BASELINE_URL],['0.39.1',process.env.STUDIO_URL]];for(const[,u]of urls)assert.equal(new URL(u).hostname,'127.0.0.1');
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-background-networking','--disable-component-update','--disable-sync']}),result={environment:{browser:browser.version(),node:process.version,platform:process.platform,arch:process.arch,viewport:{width:1440,height:1000},runs,warmup},fixtures:{},rows:[],errors:[],http:[],network:[]},out=process.env.PERF_OUT;
 const persist=()=>fs.writeFileSync(out,JSON.stringify(result,null,2));
 try{for(const[version,url]of urls)for(const count of counts){
  const context=await browser.newContext({viewport:result.environment.viewport,serviceWorkers:'block'}),p=await context.newPage(),origin=new URL(url).origin;
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin&&r.request().method()==='GET')return r.continue();if(u.hostname==='fonts.googleapis.com')return r.fulfill({body:'',contentType:'text/css'});result.network.push(r.request().method()+' '+u.href);return r.abort();});
  p.on('pageerror',e=>result.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)result.http.push(r.url());});
  await p.goto(url);await p.waitForFunction(()=>!!window.CruiseStudio?.sheetCruise);assert.equal(await p.evaluate(()=>CruiseStudio.model.APP_VERSION),version);
  if(!result.fixtures[count])result.fixtures[count]=await p.evaluate(n=>{const C=CruiseStudio,d=C.model.createSampleProject();d.projectId='perf-'+n;d.songInfo.title='Performance '+n;d.createdAt=d.updatedAt='2026-10-16T00:00:00.000Z';d.sections=[{...d.sections[0],id:'section-1',name:'A'}];const b=d.bars[0];d.bars=Array.from({length:n},(_,i)=>({...JSON.parse(JSON.stringify(b)),barNumber:i+1,sectionId:'section-1',lineBreakAfter:false,chords:[{tick:0,symbol:'C'}],melody:Array.from({length:4},(_,j)=>({tick:j*480,durationTicks:480,step:j,alter:0,octave:0})),lyrics:Array.from({length:4},(_,j)=>({tick:j*480,text:'ら'})),strumOverride:null}));return JSON.stringify(d);},count);
  const raw=result.fixtures[count],row={version,bars:count,samples:{migration:[],commandBefore:[],commandAfter:[],conversionBefore:[],conversionAfter:[],staffBefore:[],staffAfter:[],save:[],load:[]}};result.rows.push(row);
  row.samples.migration=await p.evaluate(({raw,runs,warmup})=>{const a=[];for(let i=0;i<runs+warmup;i++){const t=performance.now(),r=CruiseStudio.model.migrateProject(JSON.parse(raw),raw);if(!r.ok)throw Error(r.error);if(i>=warmup)a.push(performance.now()-t);}return a;},{raw,runs,warmup});
  await p.evaluate(raw=>{const C=CruiseStudio,d=JSON.parse(raw);localStorage.setItem('cruiseStudio.project.'+d.projectId,raw);C.storage.setCurrentProjectId(d.projectId);C.shellHost.navigate('sheetCruise');window.__perfWrites=[];for(const name of ['setItem','removeItem','clear']){const f=Storage.prototype[name];Storage.prototype[name]=function(...args){__perfWrites.push([name,args[0]]);return f.apply(this,args);};}},raw);
  await p.selectOption('#sc-score-style','melody');
  const ready=()=>p.waitForFunction(()=>{const C=CruiseStudio,m=C.sheetCruise.getStaffMetrics();return document.querySelector('.melody-page')?.dataset.ready==='true'&&m.source?.snapshotVersion===C.documents.getSession().snapshotVersion;});await ready();
  for(const stage of ['Before','After']){
   if(stage==='After'){
    for(let i=0;i<runs+warmup;i++){const v=await p.evaluate(async i=>{const C=CruiseStudio,s=C.documents.getSession();const edit=s.runOperation('save benchmark',d=>d.songInfo.title='Saved '+i);if(!edit.ok)throw Error(JSON.stringify(edit));let t=performance.now(),r=await s.commit(),save=performance.now()-t;if(!r.ok)throw Error(JSON.stringify(r));t=performance.now();r=C.repository.read(s.target);const load=performance.now()-t;if(!r.ok)throw Error(JSON.stringify(r));return{save,load};},i);await ready();if(i>=warmup){row.samples.save.push(v.save);row.samples.load.push(v.load);}}
    await p.reload();await p.evaluate(()=>CruiseStudio.shellHost.navigate('sheetCruise'));await p.selectOption('#sc-score-style','melody');await ready();
   }
   for(let i=0;i<runs+warmup;i++){
    const ms=await p.evaluate(i=>{const C=CruiseStudio,s=C.documents.getSession(),t=performance.now();let r;if(s.draft.schemaVersion===2){const b=s.draft.bars[0];r=C.melodyEditing.execute('melody.setDuration',C.melodyEditing.capture(b.id,b.melody[0].id),{durationTicks:i%2?480:240});}else r=s.runOperation('duration benchmark',d=>d.bars[0].melody[0].durationTicks=i%2?480:240);if(!r.ok)throw Error(JSON.stringify(r));return performance.now()-t;},i);await ready();if(i>=warmup)row.samples['command'+stage].push(ms);
    const conv=await p.evaluate(()=>{const t=performance.now(),r=CruiseStudio.musicConversion.convert(),ms=performance.now()-t;if(!r.ok)throw Error(JSON.stringify(r.diagnostics));return ms;});if(i>=warmup)row.samples['conversion'+stage].push(conv);
    await p.evaluate(i=>{const C=CruiseStudio,s=C.documents.getSession(),r=s.runOperation('all bars pitch',d=>{for(const b of d.bars){if(d.schemaVersion===2)b.melody[1].pitch.step=i%2?'D':'E';else b.melody[1].step=i%2?1:2;}});if(!r.ok)throw Error(JSON.stringify(r));},i);await ready();if(i>=warmup)row.samples['staff'+stage].push(await p.evaluate(()=>CruiseStudio.sheetCruise.getStaffMetrics().totalMs));
   }
   if(stage==='Before')assert.deepEqual(await p.evaluate(()=>__perfWrites),[],'conversion/edit/render no-write');
   row[stage]=Object.fromEntries(['command','conversion','staff'].map(k=>[k,stats(row.samples[k+stage])]));persist();console.log(JSON.stringify({version,bars:count,stage,stats:row[stage]}));
  }
  row.migration=stats(row.samples.migration);row.save=stats(row.samples.save);row.load=stats(row.samples.load);persist();await context.close();
 }
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.http,[]);assert.deepEqual(result.network,[]);result.complete=true;persist();
 }catch(e){result.failure={message:e.message,stack:e.stack};persist();throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
