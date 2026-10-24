/* Schema 2 integration on isolated loopback/disposable Chrome only. */
const fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const url=process.env.STUDIO_URL,origin=new URL(url).origin;
test('Schema 2 M1 real Studio integration',async t=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),ctx=await browser.newContext({viewport:{width:1440,height:1000}}),p=await ctx.newPage();
 const ledger=[],phases=[];
 async function installAudit(context,scope){
  await context.exposeBinding('__recordSchema2Write',(_source,entry)=>{if(entry.kind==='barrier')return ledger.length;ledger.push({scope,...entry,sequence:ledger.length});return ledger.length;});
  await context.addInitScript(()=>{
   const documentId=crypto.randomUUID();window.__schema2Writes=[];
   window.__schema2AuditFlush=()=>window.__recordSchema2Write({kind:'barrier',documentId});
   window.__recordSchema2Write({kind:'document',documentId}).catch(()=>{});
   for(const method of ['setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(key,...args){
    window.__schema2Writes.push(method==='clear'?'*':String(key));
    window.__recordSchema2Write({kind:'storage',method,key:method==='clear'?'*':String(key),...(key==='cruiseStudio.currentProjectId'?{value:String(args[0])}:{}),documentId}).catch(()=>{});
    return original.call(this,key,...args);
   };}
  });
 }
 async function flush(page){await page.evaluate(()=>{if(typeof window.__schema2AuditFlush!=='function')throw Error('Storage audit not installed');return window.__schema2AuditFlush();});}
 const writes=(scope,from=0)=>ledger.slice(from).filter(e=>e.scope===scope&&e.kind==='storage');
 const assertNoWrites=(scope,from)=>assert.deepEqual(writes(scope,from),[],'Unexpected storage writes');
 await installAudit(ctx,'primary');let primaryStart=0;
 const errors=[],http=[],network=[];await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin&&r.request().method()==='GET')return r.continue();if(u.hostname==='fonts.googleapis.com')return r.fulfill({body:'',contentType:'text/css'});network.push(u.href);return r.abort();});
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)http.push(r.url());});
 try{
 await p.goto(url);await p.waitForFunction(()=>!!window.CruiseStudio?.melodyEditing);
 await p.evaluate(()=>{const C=CruiseStudio;window.__schema2Raw={};for(const id of ['A','B']){const v=C.model.createLegacySampleProject();v.projectId=id;v.songInfo.title=id;v.bars[0].melody=[{tick:240,durationTicks:180,step:0,alter:0,octave:0}];const raw=' \n'+JSON.stringify(v,null,2)+'\n';__schema2Raw[id]=raw;localStorage.setItem('cruiseStudio.project.'+id,raw);}C.storage.setCurrentProjectId('A');});
 await flush(p);primaryStart=ledger.length;await p.evaluate(()=>CruiseStudio.shellHost.navigate('sheetCruise'));
 async function check(){await flush(p);const state=await p.evaluate(()=>{const C=CruiseStudio,s=C.documents.getSession();return {draft:s.workingSnapshot(),dirty:s.dirty,history:s.getHistory(),revision:s.baseRevision,raw:localStorage.getItem('cruiseStudio.project.A')};});return {...state,writes:writes('primary',primaryStart)};}
 async function command(type,payload={}){return p.evaluate(({type,payload})=>{const C=CruiseStudio,s=C.documents.getSession(),b=s.draft.bars[0];return C.melodyEditing.execute(type,C.melodyEditing.capture(b.id,b.melody[0]?.id),payload);},{type,payload});}
 await t.test('runner audit detects real writes before and after reload without resetting records',async()=>{
  const probe=await browser.newContext({serviceWorkers:'block'});await installAudit(probe,'counterexample');
  await probe.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin&&r.request().method()==='GET')return r.continue();if(u.hostname==='fonts.googleapis.com')return r.fulfill({body:'',contentType:'text/css'});network.push(u.href);return r.abort();});
  const page=await probe.newPage();try{
   await page.goto(url);await flush(page);const first=ledger.length;
   await page.evaluate(()=>localStorage.setItem('schema2.audit.counterexample','before'));await flush(page);const firstEnd=ledger.length;assert.throws(()=>assertNoWrites('counterexample',first),{code:'ERR_ASSERTION'});
   await page.reload();await flush(page);const second=ledger.length;
   await page.evaluate(()=>localStorage.setItem('schema2.audit.counterexample','after'));await flush(page);assert.throws(()=>assertNoWrites('counterexample',second),{code:'ERR_ASSERTION'});
   const recorded=writes('counterexample',first).filter(e=>e.key==='schema2.audit.counterexample');assert.equal(recorded.length,2);assert.equal(new Set(recorded.map(e=>e.documentId)).size,2);assert(recorded[0].sequence<firstEnd);assert(recorded[1].sequence>=second);
  }finally{await probe.close();}
 });
 await t.test('load migrates memory only and displays pending migration separately',async()=>{let s=await check();assert.equal(s.draft.schemaVersion,2);assert.equal(s.raw,s.revision);assert.equal(s.dirty,false);assert.deepEqual(s.writes,[]);assert.match(await p.locator('#sc-save-status').innerText(),/変換済み・未保存/);assert.equal(await p.evaluate(()=>CruiseStudio.model.APP_VERSION),'0.47.9');});
 await t.test('F1 unconfirmed legacy pitch edit retains 240/180, ID/provenance, Undo and A/B',async()=>{
  const before=await check();await p.locator('.sheet-bar').first().click();await p.locator('[data-overlay-field=doremi]').fill('レ');await p.locator('[data-overlay-field=doremi]').press('Tab');
  const after=await check(),old=before.draft.bars[0].melody[0],note=after.draft.bars[0].melody[0];
  assert.equal(note.pitch.step,'D');assert.deepEqual({...note,pitch:old.pitch},old);assert.equal(note.onsetTick,240);assert.equal(note.durationTicks,180);assert.deepEqual(after.writes,[]);
  const input=p.locator('[data-overlay-field=doremi]');await input.fill('ドレ');await input.press('Tab');
  assert.deepEqual((await check()).draft,after.draft);assert.equal(await input.getAttribute('aria-invalid'),'true');
  await input.fill('レ');await input.press('Tab');assert.equal(await input.getAttribute('aria-invalid'),null);
  assert(await p.evaluate(()=>CruiseStudio.documents.getSession().undo().ok));assert.deepEqual((await check()).draft,before.draft);
  assert(await p.evaluate(()=>CruiseStudio.documents.getSession().redo().ok));assert.deepEqual((await check()).draft,after.draft);
  await flush(p);const selectionStart=ledger.length;
  await p.evaluate(()=>{CruiseStudio.documents.select('B');CruiseStudio.documents.select('A');});assert.deepEqual((await check()).draft,after.draft);
  const selectionEnd=ledger.length;
  assert.deepEqual(writes('primary',selectionStart).map(({method,key,value})=>({method,key,value})),[
   {method:'setItem',key:'cruiseStudio.currentProjectId',value:'B'},
   {method:'setItem',key:'cruiseStudio.currentProjectId',value:'A'}]);
  phases.push({name:'F1 explicit B/A selection',scope:'primary',start:selectionStart,end:selectionEnd,expectedWrites:2});
  await p.evaluate(()=>CruiseStudio.documents.getSession().cancel());assert.deepEqual((await check()).draft,before.draft);
  assertNoWrites('primary',selectionEnd);
 });
 await t.test('F2 inherited array toJSON and schema getter refuse without hook/write/state changes',async()=>{
  const before=await check();const result=await p.evaluate(async()=>{
   const C=CruiseStudio,s=C.documents.getSession();let calls=0;const bad=JSON.parse(JSON.stringify(s.workingSnapshot()));
   Object.setPrototypeOf(bad.bars[0].melody,Object.assign(Object.create(Array.prototype),{toJSON(){calls++;return [];}}));
   const saved=await C.repository.save({target:s.target,baseRevision:s.baseRevision,snapshot:bad});let exported=false;try{C.storage.exportProjectJson(bad);}catch(_){exported=true;}
   const edit=s.runOperation('unsafe array',d=>Object.setPrototypeOf(d.bars[0].melody,Object.getPrototypeOf(bad.bars[0].melody)));
   const accessor=JSON.parse(JSON.stringify(s.workingSnapshot()));Object.defineProperty(accessor,'schemaVersion',{enumerable:true,get(){calls++;return 2;}});
   let replaced=false;try{s.replaceDraft(accessor);}catch(_){replaced=true;}
   return {calls,saved:saved.ok,edited:edit.ok,exported,replaced};
  });assert.deepEqual(result,{calls:0,saved:false,edited:false,exported:true,replaced:true});assert.deepEqual(await check(),before);
 });
 await t.test('pure command preserves raw, pitch, onset and uses one domain Undo',async()=>{let before=await check();const start=ledger.length;assert((await command('melody.setDuration',{durationTicks:240})).ok);let after=await check();assert.equal(after.draft.bars[0].melody[0].onsetTick,240);assert.deepEqual(after.draft.bars[0].melody[0].pitch,before.draft.bars[0].melody[0].pitch);assert.equal(after.history.cursor,1);assert.equal(after.raw,before.raw);assert.deepEqual(after.writes,before.writes);assertNoWrites('primary',start);phases.push({name:'pure command no-write',scope:'primary',start,end:ledger.length,expectedWrites:0});});
 await t.test('rejection leaves all draft/history/base/raw intact',async()=>{let before=await check();assert(!(await command('melody.setDuration',{durationTicks:1920})).ok);assert.deepEqual(await check(),before);});
 await t.test('IME-pending and stale generation reject without writes',async()=>{await p.evaluate(()=>{const C=CruiseStudio,s=C.documents.getSession(),b=s.draft.bars[0];window.__oldM1=C.melodyEditing.capture(b.id,b.melody[0].id);s.setInputPending(true);});const before=await check();assert(!(await command('melody.delete')).ok);assert.deepEqual(await check(),before);await p.evaluate(()=>CruiseStudio.documents.getSession().setInputPending(false));});
 await t.test('A/B/A preserves independent domain histories and rejects old callback',async()=>{const a=await check();await p.evaluate(()=>CruiseStudio.documents.select('B'));assert((await command('melody.setDuration',{durationTicks:120})).ok);await p.evaluate(()=>CruiseStudio.documents.select('A'));let r=await p.evaluate(()=>CruiseStudio.melodyEditing.execute('melody.delete',__oldM1));assert(!r.ok);assert.deepEqual((await check()).draft,a.draft);assert.equal((await check()).history.cursor,a.history.cursor);});
 await t.test('staff view and display switching never rebuild canonical timing',async()=>{const before=await check();await p.selectOption('#sc-score-style','melody');await p.waitForFunction(()=>document.querySelector('.melody-page')?.dataset.ready==='true');assert(await p.locator('.melody-svg svg').count());await p.selectOption('#sc-score-style','code');assert.deepEqual((await check()).draft,before.draft);});
 await t.test('Structure pitch-only text preserves manual onset and duration',async()=>{const before=await check();await p.locator('.sheet-bar').first().click();await p.locator('[data-overlay-field=doremi]').fill('レ');await p.locator('[data-overlay-field=doremi]').press('Tab');const after=await check();assert.equal(after.draft.bars[0].melody[0].id,before.draft.bars[0].melody[0].id);assert.equal(after.draft.bars[0].melody[0].onsetTick,240);assert.equal(after.draft.bars[0].melody[0].durationTicks,240);});
 await t.test('original invalid memory is rejected before repository, export and staged draft normalization',async()=>{const r=await p.evaluate(async()=>{const C=CruiseStudio,s=C.documents.getSession(),before=JSON.stringify({draft:s.workingSnapshot(),base:s.baseRevision,history:s.getHistory(),writes:__schema2Writes}),bad=JSON.parse(JSON.stringify(s.workingSnapshot()));bad.extensions={nested:[Infinity]};const saved=await C.repository.save({target:s.target,baseRevision:s.baseRevision,snapshot:bad});let rejected=false;try{C.storage.exportProjectJson(bad);}catch(_){rejected=true;}const edit=s.runOperation('invalid original',d=>d.extensions={nested:[undefined]});return {saved,edit,rejected,before,after:JSON.stringify({draft:s.workingSnapshot(),base:s.baseRevision,history:s.getHistory(),writes:__schema2Writes})};});assert(!r.saved.ok);assert(!r.edit.ok);assert(r.rejected);assert.equal(r.after,r.before);});
 await t.test('180-tick manual duration survives blur, workspace return and JSON export',async()=>{assert((await command('melody.setDuration',{durationTicks:180})).ok);const before=(await check()).draft.bars[0].melody;await p.locator('.sheet-bar').first().click();const input=p.locator('[data-overlay-field=doremi]');await input.focus();await input.press('Tab');await p.evaluate(()=>{CruiseStudio.shellHost.navigate('preDtm');CruiseStudio.shellHost.navigate('sheetCruise');});const after=await check();assert.deepEqual(after.draft.bars[0].melody,before);assert.equal(await p.evaluate(()=>JSON.parse(CruiseStudio.storage.exportProjectJson(CruiseStudio.documents.getSession().workingSnapshot())).bars[0].melody[0].durationTicks),180);});
 await t.test('Save/Load uses same key and keeps stable IDs and original raw',async()=>{const before=await check();let r=await p.evaluate(()=>CruiseStudio.documents.getSession().commit());assert(r.ok,r.error);const after=await check();assert.equal(JSON.parse(after.raw).schemaVersion,2);assert.equal(after.draft.provenance.legacySource.raw,await p.evaluate(()=>__schema2Raw.A));assert.deepEqual(after.draft.bars.map(b=>b.id),before.draft.bars.map(b=>b.id));assert.equal(after.dirty,false);await p.reload();await p.evaluate(()=>CruiseStudio.shellHost.navigate('sheetCruise'));assert.deepEqual(await p.evaluate(()=>CruiseStudio.documents.getSession().draft.bars.map(b=>b.id)),before.draft.bars.map(b=>b.id));});

 // The original raw-corruption test mixed two owners. Draft now refuses the
 // mutation itself. Keep that contract separate from the renderer's diagnostics.
 await t.test('descriptor Infinity assignment rejects before mutation and keeps Session usable without writes',async()=>{
  await p.selectOption('#sc-score-style','melody');
  const ready=()=>p.waitForFunction(()=>{const C=CruiseStudio;return document.querySelector('.melody-page')?.dataset.ready==='true'&&C.sheetCruise.getStaffMetrics().source?.snapshotVersion===C.documents.getSession().snapshotVersion;});await ready();await flush(p);const start=ledger.length;
  const r=await p.evaluate(()=>{
   const C=CruiseStudio,s=C.documents.getSession();
   const state=()=>({draft:s.workingSnapshot(),base:s.baseSnapshot,revision:s.baseRevision,dirty:s.dirty,history:s.getHistory(),version:s.snapshotVersion,raw:C.repository.readRevision(s.target).revision});
   const before=state(),rendered=C.musicConversion.convert();let error=null,continued=false;
   try {Object.getOwnPropertyDescriptor(s.draft,'songInfo').value.bpm=Infinity;continued=true;}
   catch(e){error={name:e.name,message:e.message};}
   return {before,after:state(),error,continued,current:C.musicConversion.isCurrent(rendered)};
  });
  assert.equal(r.continued,false);assert.deepEqual(r.error,{name:'TypeError',message:'non-json-number'});assert.deepEqual(r.after,r.before);assert.equal(r.current,true);
  assert.equal(await p.locator('.schema-invalid-project').count(),0);assert.equal(await p.locator('.melody-page[data-ready=true]').count(),1);assertNoWrites('primary',start);
  const recovered=await p.evaluate(()=>{
   const C=CruiseStudio,s=C.documents.getSession(),before=s.workingSnapshot(),base=s.baseRevision,raw=C.repository.readRevision(s.target).revision,history=s.getHistory(),version=s.snapshotVersion,old=C.musicConversion.convert(),b=s.draft.bars[0],handle=C.melodyEditing.capture(b.id,b.melody[0].id);
   const edited=s.runOperation('valid edit after refused Infinity',d=>d.songInfo.title='Valid after refusal');const after=s.workingSnapshot(),newVersion=s.snapshotVersion,current=C.musicConversion.isCurrent(old);
   const stale=C.melodyEditing.execute('melody.delete',handle),afterStale=s.workingSnapshot(),undo=s.undo(),undone=s.workingSnapshot(),redo=s.redo(),redone=s.workingSnapshot(),restore=s.undo();
   return {before,after,afterStale,undone,redone,edited,undo,redo,restore,stale,current,version,newVersion,historyCount:s.getHistory().entries.length,previousHistoryCount:history.entries.length,baseUnchanged:s.baseRevision===base,rawUnchanged:C.repository.readRevision(s.target).revision===raw};
  });
  assert(recovered.edited.ok&&recovered.undo.ok&&recovered.redo.ok&&recovered.restore.ok);assert.equal(recovered.after.songInfo.title,'Valid after refusal');assert.notEqual(recovered.newVersion,recovered.version);assert.equal(recovered.current,false);assert.equal(recovered.stale.ok,false);assert.deepEqual(recovered.afterStale,recovered.after);assert.deepEqual(recovered.undone,recovered.before);assert.deepEqual(recovered.redone,recovered.after);assert.equal(recovered.historyCount,recovered.previousHistoryCount+1);assert(recovered.baseUnchanged&&recovered.rawUnchanged);await ready();await flush(p);assertNoWrites('primary',start);phases.push({name:'descriptor Infinity early refusal and normal Undo recovery',scope:'primary',start,end:ledger.length,expectedWrites:0});
 });
 // Both paths below exercise the real Structure invalid-Project alert, not a
 // melody-conversion diagnostic. The external input is a separate object; the
 // real Draft is never corrupted and its descriptor defenses remain installed.
 for(const kind of ['external-project-validation','external-snapshot-validation'])await t.test(kind+' preserves invalid Project diagnostic UI and restores a normal score without writes',async()=>{
  const primary=await check(),isolated=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),qa=await isolated.newPage();await installAudit(isolated,kind);let start=0;
  qa.on('pageerror',e=>errors.push(e.message));qa.on('console',m=>{if(m.type()==='error')errors.push(m.text());});qa.on('response',r=>{if(r.status()>=400)http.push(r.url());});
  await isolated.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin&&r.request().method()==='GET')return r.continue();if(u.hostname==='fonts.googleapis.com')return r.fulfill({body:'',contentType:'text/css'});network.push(u.href);return r.abort();});
  const ready=()=>qa.waitForFunction(()=>{const C=CruiseStudio;return document.querySelector('.melody-page')?.dataset.ready==='true'&&C.sheetCruise.getStaffMetrics().source?.snapshotVersion===C.documents.getSession().snapshotVersion;});
  try {
   await qa.goto(url);await qa.waitForFunction(()=>!!window.CruiseStudio?.melodyEditing);
   await qa.evaluate(kind=>{const C=CruiseStudio,d=C.model.createSampleProject();d.projectId=kind;localStorage.setItem('cruiseStudio.project.'+kind,JSON.stringify(d));C.storage.setCurrentProjectId(kind);C.shellHost.navigate('sheetCruise');},kind);
   await qa.selectOption('#sc-score-style','melody');await ready();assert(await qa.locator('.melody-svg svg').count());await flush(qa);start=ledger.length;
   await qa.evaluate(kind=>{
    const C=CruiseStudio,s=C.documents.getSession();
    const capture=()=>({draft:s.workingSnapshot(),base:s.baseSnapshot,revision:s.baseRevision,history:s.getHistory(),dirty:s.dirty,raw:C.repository.readRevision(s.target).revision});
    const f={original:C.model.toStructureView,capture,before:capture(),calls:0,successfulProjections:0,kind};window.__projectValidationFixture=f;
    C.model.toStructureView=function(project){
     f.calls++;const external=structuredClone(project);external.songInfo.bpm=Infinity;
     // Do not JSON-normalize the bad input. These are the actual validators:
     // one returns the typed invalid-project error; the other throws TypeError.
     const result=kind==='external-project-validation'?f.original(external):C.editing.snapshot(external);
     f.successfulProjections++;return result;
    };
    // A legal equal-content replacement only invalidates the derived view.
    // No unsafe Draft mutation, second Project owner, or persistent write.
    f.version=s.snapshotVersion;s.draft.songInfo={...s.draft.songInfo};
   },kind);
   const box=qa.locator('.schema-invalid-project'),details=box.locator('details'),body=details.locator('pre');await qa.waitForFunction(()=>!!document.querySelector('.schema-invalid-project'));
   assert.equal(await box.count(),1);assert.equal(await box.getAttribute('role'),'alert');assert.equal(await qa.locator('.melody-page').count(),0);assert.equal(await qa.locator('.sheet-page').count(),0);assert.equal(await qa.locator('.melody-svg svg').count(),0);
   assert.match(await box.locator('p').innerText(),/譜面を表示できません.*入力値/);assert.equal(await details.evaluate(e=>e.open),false);assert.equal(await body.innerText(),'');assert.equal(await body.textContent(),'non-json-number');assert(!/non-json-number/.test(await box.innerText()));
   await details.locator('summary').click();assert.equal(await details.evaluate(e=>e.open),true);assert.equal(await body.innerText(),'non-json-number');assert(await body.evaluate(e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return b.width>0&&b.height>0&&s.visibility==='visible';}));
   await qa.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const painted=await body.evaluate(e=>{const range=document.createRange();range.selectNodeContents(e);const text=range.getBoundingClientRect(),clippedBy=[];for(let parent=e.parentElement;parent;parent=parent.parentElement){const r=parent.getBoundingClientRect(),s=getComputedStyle(parent),clips=v=>['hidden','clip','scroll','auto'].includes(v);if(clips(s.overflowY)&&(text.top<r.top-1||text.bottom>r.bottom+1)||clips(s.overflowX)&&(text.left<r.left-1||text.right>r.right+1))clippedBy.push({tag:parent.tagName,class:parent.className,height:r.height,overflow:s.overflow});}return {text:{top:text.top,bottom:text.bottom,height:text.height},clippedBy};});
   assert(painted.text.height>0);assert.deepEqual(painted.clippedBy,[],'Expanded diagnostic text must actually paint inside every clipping ancestor: '+JSON.stringify(painted));
   if(process.env.STAFF_QA_DIR)await box.screenshot({path:path.join(process.env.STAFF_QA_DIR,kind+'-expanded.png')});
   await details.locator('summary').click();assert.equal(await details.evaluate(e=>e.open),false);assert.equal(await body.innerText(),'');assert(!/non-json-number/.test(await box.innerText()));
   const state=await qa.evaluate(()=>{const C=CruiseStudio,f=__projectValidationFixture;return {before:f.before,after:f.capture(),calls:f.calls,successfulProjections:f.successfulProjections,trackedRefresh:C.documents.getSession().snapshotVersion!==f.version};});assert.deepEqual(state.after,state.before);assert(state.calls>0);assert.equal(state.successfulProjections,0);assert.equal(state.trackedRefresh,true);await flush(qa);assertNoWrites(kind,start);
   assert(await qa.evaluate(()=>{const C=CruiseStudio,f=__projectValidationFixture;C.model.toStructureView=f.original;C.documents.getSession().draft.songInfo={...C.documents.getSession().draft.songInfo};return C.model.toStructureView===f.original;}));await ready();assert.equal(await box.count(),0);assert(await qa.locator('.melody-svg svg').count());assert.deepEqual(await qa.evaluate(()=>__projectValidationFixture.capture()),state.before);await flush(qa);assertNoWrites(kind,start);phases.push({name:kind+' Structure alert and recovery (external fixture, not live corruption)',scope:kind,start,end:ledger.length,expectedWrites:0});
  } finally {
   try {if(!qa.isClosed())assert(await qa.evaluate(()=>{const f=window.__projectValidationFixture;if(!f)return true;CruiseStudio.model.toStructureView=f.original;delete window.__projectValidationFixture;return CruiseStudio.model.toStructureView===f.original;}));}finally{await isolated.close();}
  }
  assert.deepEqual(await check(),primary,'diagnostic fixture cannot alter the primary Project, Session, history or repository');
 });
 await t.test('diagnostic grouping retains bar numbers and hides internal codes until expanded',async()=>{
  const before=await check(),isolated=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),qa=await isolated.newPage();
  await installAudit(isolated,'diagnostic');let diagnosticStart=0;
  qa.on('pageerror',e=>errors.push(e.message));qa.on('console',m=>{if(m.type()==='error')errors.push(m.text());});qa.on('response',r=>{if(r.status()>=400)http.push(r.url());});
  await isolated.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin&&r.request().method()==='GET')return r.continue();if(u.hostname==='fonts.googleapis.com')return r.fulfill({body:'',contentType:'text/css'});network.push(u.href);return r.abort();});
  try {
   await qa.goto(url);await qa.waitForFunction(()=>!!window.CruiseStudio?.melodyStaff);await flush(qa);diagnosticStart=ledger.length;
   await qa.evaluate(()=>{const C=CruiseStudio,host=document.createElement('div');host.id='diagnostic-renderer-fixture';host.style.cssText='position:fixed;inset:0;z-index:99999;overflow:auto;background:white;color:black';document.body.appendChild(host);
    const fixture={real:C.musicConversion,host,view:null};window.__diagnosticFixture=fixture;
    C.musicConversion={convert:()=>({ok:false,diagnostics:[0,0,1].map(barIndex=>({severity:'fatal',code:'invalid-melody-pitch',sourceLocation:{barIndex}}))})};
    fixture.view=C.melodyStaff.create({host,active:()=>true});fixture.view.render(C.model.createLegacySampleProject());});
   const host=qa.locator('#diagnostic-renderer-fixture'),details=host.locator('details'),body=details.locator('pre');await qa.waitForFunction(()=>document.querySelector('#diagnostic-renderer-fixture pre')?.textContent.includes('×3'));
   assert.equal(await body.textContent(),'invalid-melody-pitch（1・2小節目） ×3');assert.equal(await body.innerText(),'');assert(!/invalid-melody-pitch/.test(await host.innerText()));assert.match(await host.locator('.melody-status').innerText(),/1・2小節目/);
   await details.locator('summary').click();assert.equal(await body.innerText(),'invalid-melody-pitch（1・2小節目） ×3');assert.equal((await body.innerText()).split('\n').length,1);
   assert(await body.evaluate(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(e).visibility==='visible';}));
   await details.locator('summary').click();assert.equal(await body.innerText(),'');
  } finally {
   try {if(!qa.isClosed())assert(await qa.evaluate(()=>{const f=window.__diagnosticFixture;if(!f)return true;
    // Restore service first; renderer invalidation or DOM cleanup must never prevent restoration.
    CruiseStudio.musicConversion=f.real;
    try {if(f.view)f.view.invalidate();} finally {f.host.remove();delete window.__diagnosticFixture;}
    return CruiseStudio.musicConversion===f.real&&!document.querySelector('#diagnostic-renderer-fixture');
   }));await flush(qa);assertNoWrites('diagnostic',diagnosticStart);} finally {await isolated.close();}
  }
  assert.deepEqual(await check(),before,'isolated fixture cannot change the primary document, service, storage or history');
 });
 for(const count of [8,32,64,128])await t.test('large score '+count+' before/after Save, reload, Undo/Redo and A/B remains current and bounded',async()=>{
  const id='large-'+count;
  await p.evaluate(({id,count})=>{const C=CruiseStudio,d=C.model.createLegacySampleProject();d.projectId=id;d.songInfo.title=id;d.sections=[{...d.sections[0],id:'section-large'}];const b=d.bars[0];d.bars=Array.from({length:count},(_,i)=>({...JSON.parse(JSON.stringify(b)),barNumber:i+1,sectionId:'section-large',lineBreakAfter:false,chords:[{tick:0,symbol:'C'}],lyrics:[{tick:0,text:'あ'}],melody:Array.from({length:4},(_,j)=>({tick:j*480,durationTicks:480,step:j,alter:0,octave:0})),strumOverride:null}));localStorage.setItem('cruiseStudio.project.'+id,JSON.stringify(d));C.documents.select(id);}, {id,count});
  await p.selectOption('#sc-score-style','melody');
  const ready=()=>p.waitForFunction(()=>{const C=CruiseStudio;return document.querySelector('.melody-page')?.dataset.ready==='true'&&C.sheetCruise.getStaffMetrics().source?.snapshotVersion===C.documents.getSession().snapshotVersion;});await ready();
  const before=await p.evaluate(()=>{const C=CruiseStudio,s=C.documents.getSession();window.__largeOld=C.musicConversion.convert();return {raw:s.baseRevision,backup:s.workingSnapshot().provenance.legacySource.raw,ids:s.draft.bars.map(b=>b.id),notes:s.workingSnapshot().bars.map(b=>b.melody.map(e=>[e.pitch,e.onsetTick]))};});
  assert.equal(await p.locator('.melody-measure').count(),count);
  const converted=await p.evaluate(()=>{const C=CruiseStudio,r=C.musicConversion.convert(),json=JSON.stringify(r);return {ok:r.ok,size:json.length,raw:json.includes('baseRevision')||json.includes('legacySource'),saved:C.documents.getSession().baseRevision};});assert(converted.ok);assert(!converted.raw);assert(converted.size<count*24000);assert.equal(converted.saved,before.raw);
  await p.locator('.melody-measure').first().locator('.melody-bar-heading').click();const input=p.locator('[data-overlay-field=doremi]');await input.focus();await input.evaluate(e=>e.setSelectionRange(1,1));
  assert(await p.evaluate(()=>{const C=CruiseStudio,s=C.documents.getSession(),b=s.draft.bars[0];return C.melodyEditing.execute('melody.setDuration',C.melodyEditing.capture(b.id,b.melody[0].id),{durationTicks:240}).ok;}));await ready();
  assert.equal(await input.evaluate(e=>document.activeElement===e&&e.selectionStart===1),true);assert.equal(await p.evaluate(()=>CruiseStudio.musicConversion.isCurrent(__largeOld)),false);
  const change=await p.evaluate(()=>JSON.stringify(CruiseStudio.documents.getSession().workingSnapshot().bars));
  assert(await p.evaluate(()=>CruiseStudio.documents.getSession().undo().ok));await ready();assert(await p.evaluate(()=>CruiseStudio.documents.getSession().redo().ok));await ready();assert.equal(await p.evaluate(()=>JSON.stringify(CruiseStudio.documents.getSession().workingSnapshot().bars)),change);
  await p.evaluate(()=>{window.__largePreSave=CruiseStudio.musicConversion.convert();});assert((await p.evaluate(()=>CruiseStudio.documents.getSession().commit())).ok);await ready();assert.equal(await p.evaluate(()=>CruiseStudio.musicConversion.isCurrent(__largePreSave)),false);
  await p.evaluate(()=>{const C=CruiseStudio;window.__largeBeforeSwitch=C.musicConversion.convert();C.documents.select('B');});await ready();await p.evaluate(id=>CruiseStudio.documents.select(id),id);await ready();assert.equal(await p.evaluate(()=>CruiseStudio.musicConversion.isCurrent(__largeBeforeSwitch)),false);
  await p.reload();await p.evaluate(()=>CruiseStudio.shellHost.navigate('sheetCruise'));await p.selectOption('#sc-score-style','melody');await ready();
  const after=await p.evaluate(()=>{const C=CruiseStudio,s=C.documents.getSession(),r=C.musicConversion.convert();return {id:s.target.projectId,backup:s.workingSnapshot().provenance.legacySource.raw,ids:s.draft.bars.map(b=>b.id),notes:s.workingSnapshot().bars.map(b=>b.melody.map(e=>[e.pitch,e.onsetTick])),current:C.musicConversion.isCurrent(r),size:JSON.stringify(r).length};});assert.equal(after.id,id);assert.equal(after.backup,before.backup);assert.deepEqual(after.ids,before.ids);assert.deepEqual(after.notes,before.notes);assert(after.current);assert(after.size<count*24000);assert.equal(await p.locator('.melody-measure').count(),count);
 });
 await t.test('Console/404/forbidden zero and shared write remains OFF',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(http,[]);assert.deepEqual(network,[]);assert.equal(await p.evaluate(()=>CruiseStudio.portDataHost.canWrite),false);});
 }finally{try{if(!p.isClosed())await flush(p);}finally{try{await ctx.close();}finally{await browser.close();if(process.env.STAFF_QA_DIR)fs.writeFileSync(path.join(process.env.STAFF_QA_DIR,'schema2-storage-audit.json'),JSON.stringify({primaryFixtureEnd:primaryStart,phases,records:ledger},null,2));}}}
});
