// Additional activation boundary checks around the existing product acceptance.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
export function canaryAcceptance({db,mf,src,check,network,OUT,profile,bootstrapPro}){
 let revision=0,targets=[],devices=[],account,projectId;const reserve=[randomUUID(),randomUUID()];
 async function activate(mode='canary'){
  const {changeStudioActivation}=await import(src+'/studio-activation.js');
  await changeStudioActivation(db,{expectedRevision:revision++,operationId:randomUUID(),mode,targets:mode==='canary'?targets:[],reason:'synthetic operator-only product acceptance'});
 }
 function setTargets(){targets=devices.flatMap(deviceId=>[...(projectId?[projectId]:[]),...reserve].map(datasetId=>({accountId:account.accountId,deviceId,datasetId})));}
 // Uses the existing transport and real Session; no fixture authentication bypass.
 async function request(page,kind,payload={}){return page.evaluate(async({kind,payload})=>{
  const s=CruiseStudio.projectCloud.session.readSession(),r=await fetch('https://sound-cruise-sync.cruise-port-requests.workers.dev/v2/studio/document',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.credential,'X-Sound-Cruise-Pro-Authorization':'Bearer '+s.proCredential},body:JSON.stringify({kind,payload})});return{status:r.status,body:await r.json()};
 },{kind,payload});}
 return{
 async identity(x){account=x.account;devices=[account.accountDeviceId];setTargets();
  await check('normal Studio includes the client while server admission stays 423 OFF before activation',async()=>{
   const r=await mf.dispatchFetch('http://native.fixture.invalid/v2/studio/document',{method:'POST',headers:{Origin:'https://soundcruise.jp','Content-Type':'application/json'},body:JSON.stringify({kind:'catalogue',payload:{}})});assert.equal(r.status,423);assert.equal((await r.json()).code,'studio_off');
   await x.A.page.goto('https://soundcruise.jp/apps/cruise-studio/index.html');await x.A.page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized());await x.A.page.waitForFunction(()=>!!CruiseStudio.projectCloud);assert(await x.A.page.evaluate(()=>{try{CruiseStudio.projectCloud.session.readSession();return false;}catch{return true;}}));
  });
  await activate();await db.prepare('UPDATE studio_document_control SET enabled=1 WHERE id=1 AND enabled=0').run();
 },
 async peer({second}){devices.push(second.deviceId);setTargets();await activate();},
 async project({A,B,id}){projectId=id;setTargets();await activate();await Promise.all([A.page.evaluate(()=>CruiseStudio.projectCloud.session.refresh()),B.page.evaluate(()=>CruiseStudio.projectCloud.session.refresh())]);},
 async unknown({A,id}){const before=(await db.prepare('SELECT count(*) n FROM studio_document_resolutions').first()).n;await assert.rejects(()=>A.page.evaluate(async id=>{const c=CruiseStudio.projectCloud.client,l=await c.tracking(id);return c.discardConflict(l.active,{confirm:true});},id),/discard-conflict-only/);assert.equal((await db.prepare('SELECT count(*) n FROM studio_document_resolutions').first()).n,before);},
 async conflict({A,B,id}){await check('real CAS conflict uses explicit existing resolution, retaining local export and Outbox; UNKNOWN cannot be discarded',async()=>{
  const before=await B.page.evaluate(id=>localStorage.getItem('cruiseStudio.project.'+id),id);const download=B.page.waitForEvent('download');await B.page.locator('#sc-export-json').click();assert.deepEqual(JSON.parse(fs.readFileSync(await(await download).path(),'utf8')),JSON.parse(before));
  await B.page.locator('[data-cloud-action=save]').click();await B.page.locator('[data-discard-confirm]').check();await B.page.locator('[data-cloud-action=discard]:not([disabled])').waitFor({state:'attached'});
  const operation=await B.page.evaluate(async id=>(await CruiseStudio.projectCloud.client.list(id)).find(o=>o.state==='CONFLICT').operationId,id);
  await B.page.locator('[data-discard-confirm]').check();await B.page.locator('[data-cloud-action=discard]').click();
  const deadline=Date.now()+20000;let done=false;while(Date.now()<deadline){done=await B.page.evaluate(async op=>(await CruiseStudio.projectCloud.client.inspect(op)).state==='DISCARDED_LOCAL_RETAINED',operation);if(done)break;await B.page.waitForTimeout(50);}assert(done);
  assert.equal(await B.page.evaluate(id=>localStorage.getItem('cruiseStudio.project.'+id),id),before);assert((await B.page.evaluate(async id=>CruiseStudio.projectCloud.client.list(id),id)).some(o=>o.operationId===operation));
  await B.page.locator('[data-cloud-action=load]').click();await B.page.waitForFunction(id=>CruiseStudio.repository.read({type:'project',projectId:id}).snapshot.songInfo.title==='Winning Cloud',id);await B.page.evaluate(id=>CruiseStudio.documents.select(id),id);
 });},
 async finish({A,B}){
  await check('synthetic Pro challenge preflight preserves the expected CORS contract',async()=>{
   const r=await mf.dispatchFetch('http://native.fixture.invalid/v2/pro-auth/device-session/challenge',{method:'OPTIONS',headers:{Origin:'https://soundcruise.jp','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
   assert(r.status>=200&&r.status<300);assert.equal(r.headers.get('access-control-allow-origin'),'https://soundcruise.jp');assert.match(r.headers.get('access-control-allow-methods')||'',/POST/i);assert.match(r.headers.get('access-control-allow-headers')||'',/content-type/i);
  });
  if(process.env.STUDIO_UI_ACCEPTANCE==='1')await(await import('./ui-final-pass1.acceptance.mjs')).acceptUI({A,projectId,check,OUT,network,profile,bootstrapPro});
  // B was intentionally changed to a foreign Account by the reused regression.
  await check('normal Studio score and PreDTM share unchanged local schema2 with JSON and MIDI exports',async()=>{
   await A.page.evaluate(id=>CruiseStudio.documents.select(id),projectId);await A.page.locator('button[data-workspace=sheetCruise]').click();
   const before=await A.page.evaluate(id=>localStorage.getItem('cruiseStudio.project.'+id),projectId);assert(before);
   await A.page.locator('#sc-goto-pre-dtm').click();assert.equal(await A.page.evaluate(()=>CruiseStudio.documents.capture().project.projectId),projectId);
   let download=A.page.waitForEvent('download');await A.page.locator('#pd-export-json').click();const json=JSON.parse(fs.readFileSync(await(await download).path(),'utf8'));assert.equal(typeof json,'object');assert(JSON.stringify(json).includes(projectId));
   download=A.page.waitForEvent('download');await A.page.locator('#pd-export-midi').click();const midi=fs.readFileSync(await(await download).path());assert.equal(midi.subarray(0,4).toString(),'MThd');assert(midi.length>14);
   await A.page.locator('#pd-goto-sheet').click();assert.equal(await A.page.evaluate(id=>localStorage.getItem('cruiseStudio.project.'+id),projectId),before);
  });
  await check('normal Studio retains all four native app Account/Pro hosts and page refresh',async()=>{
   const settings={pitch:'#home-settings-btn',fretboard:'#btn-settings-home',rhythm:'#settings-btn',chord:'#cc-settings-btn'};
   for(const id of ['pitch','fretboard','rhythm','chord']){
    const leave=d=>d.accept();A.page.on('dialog',leave);try{await A.page.evaluate(()=>CruiseStudio.shellHost.navigate('home'));}finally{A.page.off('dialog',leave);}
    await A.page.locator('#screen-home [data-studio-cruise-app='+id+']').click();
    let child=await(await A.page.locator('#series-'+id+'-surface iframe').elementHandle()).contentFrame();
    if(id!=='fretboard'||!await child.locator('#tempo-slider').isVisible())await child.locator(settings[id]).click();
    await child.locator('[data-sync-join-entry-host] [data-sync-settings-state=ready]').waitFor({state:'attached'});
    assert.equal(await child.evaluate(async id=>id==='chord'?await(await ChordCruiseSync.pilotClient.openStore()).getMeta('migrationState'):await SoundCruiseMultiAppSync.runtimes[id].store.readMeta('migrationState'),id),'complete');
    await A.page.evaluate(id=>{window.canaryPreviousAppFrame=document.querySelector('#series-'+id+'-surface iframe').contentWindow;},id);const accept=d=>d.accept();A.page.on('dialog',accept);try{await A.page.locator('[data-refresh-series-app='+id+']').click();}finally{A.page.off('dialog',accept);}
    await A.page.waitForFunction(id=>{const w=document.querySelector('#series-'+id+'-surface iframe')?.contentWindow;return w&&w!==window.canaryPreviousAppFrame&&!!w.SoundCruiseNativeSyncHost;},id);
    child=await(await A.page.locator('#series-'+id+'-surface iframe').elementHandle()).contentFrame();if(id!=='fretboard'||!await child.locator('#tempo-slider').isVisible())await child.locator(settings[id]).click();await child.locator('[data-sync-join-entry-host] [data-sync-settings-state=ready]').waitFor({state:'attached'});
   }
   const leave=d=>d.accept();A.page.on('dialog',leave);try{await A.page.evaluate(()=>CruiseStudio.shellHost.navigate('home'));}finally{A.page.off('dialog',leave);}await A.page.locator('#open-sheet-cruise').click();
  });
  await check('formal Session grant contains only approved dataset IDs; foreign Project read/write and catalogue leakage denied',async()=>{
   const s=await A.page.evaluate(()=>CruiseStudio.projectCloud.session.readSession());assert.equal(s.activation.mode,'canary');assert.deepEqual(new Set(s.activation.datasetIds),new Set([projectId,...reserve]));
   const foreign=randomUUID(),r=await request(A.page,'snapshot',{documentId:foreign});assert(r.status>=400);assert.equal(r.body.code,'activation-dataset');
   const before=(await db.prepare('SELECT count(*) n FROM studio_document_pending').first()).n;
   await assert.rejects(()=>A.page.evaluate(async id=>{const p=CruiseStudio.model.createSampleProject();p.projectId=id;await CruiseStudio.repository.save({target:{type:'project',projectId:id},snapshot:p,baseRevision:null});const o=await CruiseStudio.projectCloud.client.enqueue(id);return CruiseStudio.projectCloud.client.send(o.operationId);},foreign),/activation-dataset/);
   assert.equal((await db.prepare('SELECT count(*) n FROM studio_document_pending').first()).n,before);
   const original=targets;targets=targets.filter(t=>t.datasetId!==reserve[0]);await activate();const list=await request(A.page,'catalogue',{limit:20,cursor:null});assert.equal(list.status,200);assert(list.body.items.length>0);assert(list.body.items.every(x=>[projectId,reserve[1]].includes(x.projectId)));targets=original;await activate();
  });
  await check('Account erasure request remains a canary maintenance HOLD without changing local or Cloud documents',async()=>{
   const n=(await db.prepare('SELECT count(*) n FROM studio_document_records').first()).n;
   const r=await request(A.page,'erase-request',{operationId:randomUUID(),confirmAccountId:account.accountId});assert(r.status>=400);assert.equal(r.body.code,'canary-account-maintenance-hold');assert.equal((await db.prepare('SELECT count(*) n FROM studio_document_records').first()).n,n);
  });
  await check('valid but unselected Account/Device and revoked Account/Device/Pro cannot use the canary',async()=>{
   const before=(await db.prepare('SELECT count(*) n FROM studio_document_records').first()).n;
   const foreign=await B.page.evaluate(async()=>{const a=await SoundCruiseSyncAccount.storage.getAccount(),p=JSON.parse(localStorage.getItem('soundCruiseProAuth'));const r=await fetch('https://sound-cruise-sync.cruise-port-requests.workers.dev/v2/studio/document',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+a.accountCredential,'X-Sound-Cruise-Pro-Authorization':'Bearer '+p.credential},body:JSON.stringify({kind:'enroll',payload:{}})});return{status:r.status,code:(await r.json()).code};});assert.equal(foreign.code,'activation-scope');
   const originalTargets=targets;targets=targets.filter(t=>t.deviceId!==account.accountDeviceId);await activate();const denied=await request(A.page,'catalogue',{limit:20,cursor:null});assert.equal(denied.body.code,'activation-scope');targets=originalTargets;await activate();
   for(const [sql,params,undo] of [
    ["UPDATE sync_account_devices SET revoked_at=created_at+1 WHERE id=?",[account.accountDeviceId],"UPDATE sync_account_devices SET revoked_at=NULL WHERE id=?"],
    ["UPDATE sync_accounts SET state='deleted' WHERE id=?",[account.accountId],"UPDATE sync_accounts SET state='active' WHERE id=?"]
   ]){await db.prepare(sql).bind(...params).run();assert((await request(A.page,'catalogue',{limit:20,cursor:null})).status>=400);await db.prepare(undo).bind(...params).run();}
   const proId=await A.page.evaluate(()=>CruiseStudio.projectCloud.session.readSession().binding.proId);await db.prepare('UPDATE pro_credentials SET revoked_at=created_at+1 WHERE id=?').bind(proId).run();assert((await request(A.page,'catalogue',{limit:20,cursor:null})).status>=400);await db.prepare('UPDATE pro_credentials SET revoked_at=NULL WHERE id=?').bind(proId).run();
   assert.equal((await request(A.page,'catalogue',{limit:20,cursor:null})).status,200);assert.equal((await db.prepare('SELECT count(*) n FROM studio_document_records').first()).n,before);
  });
  await check('server activation OFF denies subsequent Project writes and leaves immutable operations and local drafts intact',async()=>{
   const before=(await db.prepare('SELECT * FROM studio_document_records ORDER BY user_id,record_id').all()).results;
   await activate('off');const r=await request(A.page,'catalogue',{limit:20,cursor:null});assert.equal(r.status,423);assert.equal(r.body.code,'studio_off');
   const local=await A.page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('cruiseStudio.project.')).map(k=>[k,localStorage.getItem(k)])));assert(Object.keys(local).length>0);await A.page.evaluate(()=>CruiseStudio.projectCloud.refresh());assert.equal(await A.page.locator('[data-project-canary]').isVisible(),true);assert.equal(await A.page.locator('[data-project-canary] .studio-cloud-panel .studio-cloud-panel').evaluate(e=>e.inert),true);assert.match(await A.page.locator('[data-project-sync-status]').textContent(),/studio_off/);assert.deepEqual(await A.page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('cruiseStudio.project.')).map(k=>[k,localStorage.getItem(k)]))),local);
   assert.deepEqual((await db.prepare('SELECT * FROM studio_document_records ORDER BY user_id,record_id').all()).results,before);
   assert.equal((await db.prepare('SELECT count(*) n FROM d1_migrations').first()).n,33);
  });
  if(process.env.STUDIO_PROJECT_FINAL_ACCEPTANCE==='1')await(await import('./project-final-erasure.acceptance.mjs')).acceptFinalErasure({A,B,account,projectId,db,mf,check,activate,request});
 }
 };
}
