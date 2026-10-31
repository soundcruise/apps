/* Isolated service harness, never loaded by the product. Ledger survives reload. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const url=process.env.STUDIO_URL;
test('persistent form adoption through released Studio Session/Repository',async t=>{
 assert(url,'isolated STUDIO_URL required');const origin=new URL(url).origin,ledger=[],errors=[],http=[],network=[];
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH}),context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.exposeBinding('__recordFormWrite',(_,record)=>{ledger.push({...record,sequence:ledger.length});});
 await context.addInitScript(()=>{
  window.__formPhase='boot';window.__formPromises=[];const documentId=crypto.randomUUID();
  const record=e=>{__formPromises.push(window.__recordFormWrite({...e,phase:__formPhase,documentId}));};
  window.__flushFormLedger=()=>Promise.all(__formPromises.slice());
  for(const method of ['setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(key,...rest){record({kind:'storage',method,key:method==='clear'?'*':String(key)});return original.call(this,key,...rest);};}
  for(const method of ['put','add','delete','clear']){const original=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(...args){record({kind:'indexedDB',method});return original.apply(this,args);};}
 });
 await context.route('**/*',r=>{const q=r.request(),u=new URL(q.url());if(u.origin===origin&&['GET','HEAD'].includes(q.method()))return r.continue();if(u.hostname==='fonts.googleapis.com')return r.fulfill({body:'',contentType:'text/css'});network.push(q.method()+' '+u.href);return r.abort();});
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)http.push(r.url());});
 async function flush(){await p.evaluate(()=>__flushFormLedger());}
 async function install(){
  await p.addScriptTag({url:origin+'/apps/chord-cruise/js/core/caged-forms.js?v=1.21.0'});
  await p.evaluate(async()=>{const C=CruiseStudio,a=await import('/apps/cruise-studio/js/modules/chord/form-adapter.mjs'),s=await import('/apps/cruise-studio/js/modules/chord/form-adoption.mjs');
   window.__formOwnerData=JSON.stringify(ChordCruise.caged.FORMS);window.__formAdapter=a.createChordFormAdapter({chordTheory:ChordCruise.theory,caged:ChordCruise.caged,parseChordSymbol:C.theory.parseBasicChordSymbol,ownerVersion:'1.21.0'});
   window.__forms=s.createFormAdoptionService({owner:C.documents,schema:C.model.schema2,adapter:__formAdapter,ownerVersion:'1.21.0',repository:C.repository,chordTheory:ChordCruise.theory,parseChordSymbol:C.theory.parseBasicChordSymbol,getContext:()=>({workspaceId:C.shellHost.getActiveWorkspace(),generation:C.shellHost.getWorkspaceGeneration(),blocked:!!C.shellHost.modal.getActive()||C.shellHost.keyboard.isIMEBlocked({})})});
   window.__formRequest=()=>{const b=C.documents.getSession().draft.bars[0];return {barId:b.id,chordEventId:b.chords[0].id,instrument:{confirmed:true,tuningMidi:[64,59,55,50,45,40],maxAbsoluteFret:24},playedStrings:[1,2,3,4,5]};};
  });
 }
 const reports={};
 try{
  await p.goto(url,{waitUntil:'networkidle'});await p.waitForFunction(()=>!!CruiseStudio.documents&&!!CruiseStudio.repository);
  await p.evaluate(async()=>{window.__formPhase='fixture';const C=CruiseStudio,project=C.model.createSampleProject();project.projectId='form-browser-A';const r=await C.repository.save({target:{type:'project',projectId:project.projectId},snapshot:project,baseRevision:null});if(!r.ok)throw Error(r.error);C.sheetCruise.load(project.projectId);C.shellHost.navigate('sheetCruise');});
  await install();
  await t.test('production boot and memory-only issued candidate adoption use one Undo',async()=>{
   reports.adoption=await p.evaluate(()=>{__formPhase='preview-adopt';const C=CruiseStudio,s=C.documents.getSession(),before=s.workingSnapshot(),raw=s.baseRevision;
    const candidate=__forms.prepare(__formRequest());if(!candidate.ok)throw Error(JSON.stringify(candidate));
    const forged=__forms.apply({...candidate});if(forged.ok)throw Error('forged candidate accepted');const r=__forms.apply(candidate);if(!r.ok)throw Error(JSON.stringify(r));
    const adopted=s.workingSnapshot(),binding=adopted.performance.formBindings[0],ready=__forms.evaluate(adopted,binding);if(!s.undo().ok||!s.redo().ok)throw Error('history failed');
    return {schema:adopted.schemaVersion,version:C.model.APP_VERSION,canWrite:C.portDataHost.canWrite,ready,forms:adopted.materials.forms.length,bindings:adopted.performance.formBindings.length,history:s.getHistory().cursor,baseUnchanged:s.baseRevision===raw,sourceUnchanged:JSON.stringify(ChordCruise.caged.FORMS)===__formOwnerData,beforeInstrument:before.instrument};
   });
   assert.equal(reports.adoption.version,'0.62.1');assert.equal(reports.adoption.schema,2);assert.equal(reports.adoption.canWrite,false);assert(reports.adoption.ready.ready);assert.equal(reports.adoption.history,1);assert.equal(reports.adoption.forms,1);assert.equal(reports.adoption.bindings,1);assert(reports.adoption.baseUnchanged&&reports.adoption.sourceUnchanged);
   await flush();assert.equal(ledger.filter(e=>e.phase==='preview-adopt').length,0);
  });
  await t.test('legacy editors, JSON export/import and Pre-DTM retain snapshot and binding',async()=>{
   reports.legacy=await p.evaluate(()=>{__formPhase='legacy-read';const C=CruiseStudio,s=C.documents.getSession(),before=JSON.stringify([s.draft.materials.forms,s.draft.performance.formBindings]);
    const r=s.runOperation('legacy retain',p=>C.model.editLegacy(p,v=>{v.songInfo.bpm=121;v.sections[0].name='Changed';C.model.setBarLyricsText(v,1,'form test');v.sheetSettings.showStrum=false;}));if(!r.ok)throw Error(JSON.stringify(r));
    const p=s.workingSnapshot(),imported=C.storage.importProjectJson(C.storage.exportProjectJson(p));if(!imported.ok)throw Error(imported.error);C.arrangement.generateArrangement(p);C.model.toLegacyView(p);
    return {retained:before===JSON.stringify([p.materials.forms,p.performance.formBindings]),json:JSON.stringify(imported.project)===JSON.stringify(p)};
   });assert(reports.legacy.retained&&reports.legacy.json);await flush();assert.equal(ledger.filter(e=>e.phase==='legacy-read').length,0);
  });
  await t.test('only explicit Save writes; Save/Load/Undo/Redo preserve IDs and dirty point',async()=>{
   reports.save=await p.evaluate(async()=>{__formPhase='explicit-save';const s=CruiseStudio.documents.getSession(),forms=JSON.stringify([s.draft.materials,s.draft.performance.formBindings]),r=await s.commit();if(!r.ok)throw Error(JSON.stringify(r));
    __formPhase='after-save';const loaded=CruiseStudio.repository.read(s.target);if(!s.undo().ok||!s.dirty||!s.redo().ok||s.dirty)throw Error('savepoint/history');
    return {same:forms===JSON.stringify([loaded.snapshot.materials,loaded.snapshot.performance.formBindings]),raw:localStorage.getItem('cruiseStudio.project.form-browser-A')};
   });assert(reports.save.same);await flush();assert.deepEqual(ledger.filter(e=>e.phase==='explicit-save').map(e=>e.key),['cruiseStudio.project.form-browser-A','cruiseStudio.projects.index']);assert.equal(ledger.filter(e=>e.phase==='after-save').length,0);
  });
  await t.test('reload retains snapshot, provenance, event IDs and confirmation without auto adoption',async()=>{
   await p.reload({waitUntil:'networkidle'});await p.waitForFunction(()=>!!CruiseStudio.documents);await install();await p.evaluate(()=>{__formPhase='reload-read';CruiseStudio.shellHost.navigate('sheetCruise');});
   reports.reload=await p.evaluate(raw=>{const C=CruiseStudio,s=C.documents.getSession(),p=s.workingSnapshot(),saved=JSON.parse(raw);return {same:JSON.stringify(p.materials)===JSON.stringify(saved.materials)&&JSON.stringify(p.performance.formBindings)===JSON.stringify(saved.performance.formBindings),ready:__forms.evaluate(p,p.performance.formBindings[0]),history:s.getHistory().cursor};},reports.save.raw);assert(reports.reload.same&&reports.reload.ready.ready);assert.equal(reports.reload.history,0);await flush();assert.equal(ledger.filter(e=>e.phase==='reload-read').length,0);
  });
  await t.test('workspace stale, pending IME and malformed form refuse without write/state mutation',async()=>{
   reports.reject=await p.evaluate(async()=>{__formPhase='reject';const C=CruiseStudio,s=C.documents.getSession(),candidate=__forms.prepare(__formRequest());C.shellHost.navigate('preDtm');C.shellHost.navigate('sheetCruise');const before=JSON.stringify([s.workingSnapshot(),s.getHistory(),s.baseRevision]);const stale=__forms.apply(candidate);s.setInputPending(true);const pending=__forms.prepare(__formRequest());s.setInputPending(false);
    const p=JSON.parse(JSON.stringify(s.workingSnapshot()));p.materials.forms[0].snapshot.strings[0].relativeFret=-1;const invalid=await C.repository.save({target:s.target,snapshot:p,baseRevision:s.baseRevision});
    return {rejected:!stale.ok&&!pending.ok&&!invalid.ok,unchanged:before===JSON.stringify([s.workingSnapshot(),s.getHistory(),s.baseRevision]),rawSame:localStorage.getItem('cruiseStudio.project.form-browser-A')===s.baseRevision};
   });assert(reports.reject.rejected&&reports.reject.unchanged&&reports.reject.rawSame);await flush();assert.equal(ledger.filter(e=>e.phase==='reject').length,0);
  });
  await t.test('P2 key-order JSON roundtrip permits explicit Save without changing material identity',async()=>{
   reports.p2Order=await p.evaluate(async()=>{
    __formPhase='p2-order-preview';const C=CruiseStudio,s=C.documents.getSession(),original=s.workingSnapshot();
    const reorder=x=>Array.isArray(x)?x.map(reorder):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).reverse().map(([k,v])=>[k,reorder(v)])):x;
    const value=JSON.parse(C.storage.exportProjectJson(original));value.materials.forms=reorder(value.materials.forms);value.songInfo.title='P2 imported title';
    const imported=C.storage.importProjectJson(JSON.stringify(value));if(!imported.ok)throw Error(imported.error);
    const r=s.runOperation('import reordered material',d=>{d.materials.forms=imported.project.materials.forms;d.songInfo.title=imported.project.songInfo.title;});if(!r.ok)throw Error(JSON.stringify(r));
    __formPhase='p2-order-save';const saved=await s.commit();if(!saved.ok)throw Error(JSON.stringify(saved));__formPhase='p2-order-read';
    const loaded=C.repository.read(s.target);return {valid:C.model.validateProject(loaded.snapshot).ok,material:loaded.snapshot.materials.forms,binding:loaded.snapshot.performance.formBindings,originalMaterial:original.materials.forms,originalBinding:original.performance.formBindings};
   });assert(reports.p2Order.valid);assert.deepEqual(reports.p2Order.material,reports.p2Order.originalMaterial);assert.deepEqual(reports.p2Order.binding,reports.p2Order.originalBinding);
   await flush();assert.equal(ledger.filter(e=>['p2-order-preview','p2-order-read'].includes(e.phase)).length,0);assert.deepEqual(ledger.filter(e=>e.phase==='p2-order-save').map(e=>e.key),['cruiseStudio.project.form-browser-A','cruiseStudio.projects.index']);
  });
  await t.test('P2 inherited fields and changed same-ID material reject before any write',async()=>{
   reports.p2Reject=await p.evaluate(async()=>{
    __formPhase='p2-reject';const C=CruiseStudio,s=C.documents.getSession(),state=()=>JSON.stringify([s.workingSnapshot(),s.getHistory(),s.baseRevision,localStorage.getItem('cruiseStudio.projects.index'),localStorage.getItem('cruiseStudio.project.form-browser-A')]),before=state(),results=[];
    const fields=[['snapshot','capo'],['snapshot','tuningMidi'],['snapshot','strings'],['material','encoding'],['provenance','ownerVersion'],['generation','maxRelativeFret'],['binding','chordEventId'],['binding','materialId'],['binding','playedStrings'],['confirmation','basisKey']];
    for(const [record,key]of fields){const q=JSON.parse(JSON.stringify(s.workingSnapshot())),m=q.materials.forms[0],b=q.performance.formBindings[0],o={material:m,snapshot:m.snapshot,provenance:m.provenance,generation:m.provenance.generation,binding:b,confirmation:b.confirmation}[record],v=o[key];delete o[key];Object.setPrototypeOf(o,{[key]:v});
     const valid=C.model.schema2.validate(q),migration=C.model.schema2.migrate(q),saved=await C.repository.save({target:s.target,snapshot:q,baseRevision:s.baseRevision});if(valid.ok||migration.ok||saved.ok||state()!==before)throw Error('P2 inherited accepted or state changed: '+record+'.'+key);results.push(record+'.'+key);
    }
    const changed=JSON.parse(JSON.stringify(s.workingSnapshot()));changed.materials.forms[0].snapshot.strings[0].relativeFret=1;
    const saved=await C.repository.save({target:s.target,snapshot:changed,baseRevision:s.baseRevision});if(saved.code!=='protected-form-material'||state()!==before)throw Error('changed material protection');return {results,changed:saved.code,unchanged:state()===before};
   });assert.equal(reports.p2Reject.results.length,10);assert(reports.p2Reject.unchanged);await flush();assert.equal(ledger.filter(e=>e.phase==='p2-reject').length,0);
  });
  await t.test('no forbidden writes, owner mutation, Console errors, 404 or external requests',async()=>{
   await flush();assert.equal(ledger.filter(e=>e.kind==='indexedDB').length,0);assert.deepEqual(errors,[]);assert.deepEqual(http,[]);assert.deepEqual(network,[]);
  });
  const dir=process.env.STAFF_QA_DIR;if(dir){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'chord-form-adoption-browser.json'),JSON.stringify({reports,ledger,errors,http,network},null,2));await p.screenshot({path:path.join(dir,'chord-form-adoption.png'),fullPage:true});}
 }finally{await context.close();await browser.close();}
});
