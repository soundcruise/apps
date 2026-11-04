/* Fixture-only stale server report; native stores and saved data are never seeded/cleared. */
import assert from 'node:assert/strict';
async function standalone({A,appSource,port,nativeRuntime,openNativeApp,syncApp,go,ready,result,OUT,check,db,network}){
 let source,pa,deviceId,release,requested=0,marker=0,reportFailed=process.env.STALE_MODE==='failure';const mode=process.env.STALE_MODE||'success',gate=new Promise(r=>release=r);
 const local=frame=>frame.evaluate(async()=>{const s=await ChordCruiseSync.pilotClient.openStore(),id=await s.getMeta('activeMergeSessionId'),m=id?await s.getMergeSession(id):null;return{conflicts:(await s.listConflicts()).length,outbox:(await s.listOutbox()).length,unfinished:!!m&&m.stage!=='complete',state:await s.getMeta('syncState')};});
 const report=()=>db.prepare('SELECT state,attention_count FROM sync_app_device_sync_safety WHERE app_device_id=?').bind(deviceId).first();
 await check('prepare healthy native Chord with no local conflict, Outbox or unfinished merge',async()=>{
  const initialReport=appSource.waitForResponse(r=>r.url().endsWith('/v1/sync/removal-safety')&&r.request().postDataJSON()?.appId==='chord'&&r.request().postDataJSON()?.state==='clean'&&r.status()===200);source=await openNativeApp(appSource,'chord');await initialReport;
  deviceId=await source.evaluate(async()=>(await(await ChordCruiseSync.pilotClient.openStore()).getMeta('deviceCredential')).credential.split('.')[1]);
  assert.deepEqual(await local(source),{conflicts:0,outbox:0,unfinished:false,state:'pilot_ready'});
  await appSource.evaluate(()=>{for(const f of document.querySelectorAll('.studio-series-frame'))f.contentWindow.studioAppDirty=false;CruiseStudio.shellHost.navigate('home');});
  await A.page.setViewportSize({width:390,height:844});pa=await port(A,false);await nativeRuntime(pa);await go(pa,'#sync-center');await pa.waitForFunction(()=>document.querySelector('#sync-center-port-status-chip').textContent.includes('同期済み'));
  await A.context.route('**/v1/sync/removal-safety',async route=>{const b=route.request().postDataJSON();if(b?.appId!=='chord')return route.fallback();requested++;await gate;if(reportFailed)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,code:'sync_safety_unavailable'})});return route.fallback();});
  // Fixture-only previous report: no native store, Outbox or data is changed.
  await db.prepare("UPDATE sync_app_device_sync_safety SET state='attention',attention_count=1,reported_at=? WHERE app_device_id=?").bind(Date.now()-8456000,deviceId).run();assert.equal((await report()).attention_count,1);marker=network.length;
 });
 await check('old report alone opens native management and never invents a merge choice',async()=>{
  await pa.bringToFront();await pa.locator('#sync-center-account-recheck').evaluate(e=>e.click());await A.page.waitForURL(/chord-cruise\/pro_k7m4q9v2x8/);
  await A.page.waitForFunction(()=>document.querySelector('[data-sync-settings-state=ready]'));
  await A.page.waitForFunction(()=>document.querySelector('#cc-settings-btn'));
  assert.deepEqual(await local(A.page),{conflicts:0,outbox:0,unfinished:false,state:'pilot_ready'});
  assert.equal(await A.page.locator('[data-sync-merge-preview]').count(),0);result.destination='native Chord settings';await A.page.screenshot({path:OUT+'/old-report-management.png'});
 });
 await check(mode==='success'?'normal runtime posts clean and Port total returns to zero':'failed report stays unresolved and offers an accurate retry',async()=>{
  const reply=A.page.waitForResponse(r=>r.url().endsWith('/v1/sync/removal-safety')&&r.request().postDataJSON()?.appId==='chord');release();await reply;assert(requested>0);
  if(mode==='success'){await A.page.waitForFunction(()=>document.querySelector('[data-sync-settings-state=ready]'));assert.equal((await report()).state,'clean');assert.equal((await report()).attention_count,0);}
  else {assert.equal((await report()).state,'attention');result.failureCard=await A.page.locator('[data-sync-join-entry-host]').innerText();await A.page.getByText('端末報告の更新が必要',{exact:true}).waitFor();result.failureCard=await A.page.locator('[data-sync-join-entry-host]').innerText();assert.match(result.failureCard,/報告先が一時的に利用できません/);assert.match(result.failureCard,/同期して再確認/);await A.page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='同期して再確認'),r=b?.getBoundingClientRect();return r&&r.top>=0&&r.bottom<=innerHeight;});await A.page.screenshot({path:OUT+'/port-report-error.png',fullPage:true});}
  await A.page.goBack();await ready(A.page);await A.page.waitForFunction(expected=>document.getElementById('sync-center-overall-status')?.textContent===expected,mode==='success'?'同期の確認事項なし':'要確認1件');await A.page.waitForFunction(()=>document.querySelector('#sync-center-port-status-chip').textContent.includes('同期済み'));
  if(mode==='failure'){
   await A.page.locator('[data-sync-resolve-app=chord]').click();await A.page.waitForURL(/chord-cruise\/pro_k7m4q9v2x8/);await A.page.getByText('端末報告の更新が必要',{exact:true}).waitFor();
   const retry=A.page.waitForResponse(r=>r.url().endsWith('/v1/sync/removal-safety')&&r.request().postDataJSON()?.appId==='chord'&&r.status()===200);reportFailed=false;await A.page.getByRole('button',{name:'同期して再確認',exact:true}).click();await retry;
   assert.equal((await report()).state,'clean');assert.deepEqual(await local(A.page),{conflicts:0,outbox:0,unfinished:false,state:'pilot_ready'});await A.page.goBack();await ready(A.page);await A.page.waitForFunction(()=>document.getElementById('sync-center-overall-status')?.textContent==='同期の確認事項なし');result.retryRecovered=true;
  }

 });
 assert(!network.slice(marker).some(r=>r.appId==='chord'&&r.path==='/v1/sync/push'),'old report alone must not create Cloud data writes');delete result.failureCard;release();result.realAccountUsed=false;
}

async function studio({A,appSource,nativeRuntime,openNativeApp,result,OUT,check,db,network}){
 let source,pa,deviceId,release,marker=0,blocked=process.env.STALE_MODE==='failure';const gate=new Promise(r=>release=r),readReport=()=>db.prepare('SELECT state,attention_count FROM sync_app_device_sync_safety WHERE app_device_id=?').bind(deviceId).first();
 const cleanLocal=()=>source.evaluate(async()=>{const s=await ChordCruiseSync.pilotClient.openStore(),id=await s.getMeta('activeMergeSessionId'),m=id?await s.getMergeSession(id):null;return !(await s.listConflicts()).length&&!(await s.listOutbox()).length&&(!m||m.stage==='complete')&&(await s.getMeta('syncState'))==='pilot_ready';});
 await check('Studio right-pane Chord and central Port are healthy before fixture-only old report',async()=>{
  const first=appSource.waitForResponse(r=>r.url().endsWith('/v1/sync/removal-safety')&&r.request().postDataJSON()?.appId==='chord'&&r.request().postDataJSON()?.state==='clean'&&r.status()===200);source=await openNativeApp(appSource,'chord');await first;assert(await cleanLocal());
  deviceId=await source.evaluate(async()=>(await(await ChordCruiseSync.pilotClient.openStore()).getMeta('deviceCredential')).credential.split('.')[1]);await appSource.evaluate(()=>{for(const f of document.querySelectorAll('.studio-series-frame'))f.contentWindow.studioAppDirty=false;});await appSource.locator('#screen-app-chord [data-open-tool]').click();await appSource.evaluate(()=>CruiseStudio.shellHost.navigate('portSync'));
  await appSource.waitForFunction(()=>document.querySelector('#port-sync-surface iframe')?.contentDocument?.body?.dataset.componentState==='ready');pa=await(await appSource.locator('#port-sync-surface iframe').elementHandle()).contentFrame();await nativeRuntime(pa);await pa.waitForFunction(()=>document.querySelector('#sync-center-port-status-chip')?.textContent.includes('同期済み'));
  await A.context.route('**/v1/sync/removal-safety',async route=>{if(route.request().postDataJSON()?.appId!=='chord')return route.fallback();await gate;if(blocked)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,code:'sync_safety_unavailable'})});return route.fallback();});
  await db.prepare("UPDATE sync_app_device_sync_safety SET state='attention',attention_count=1,reported_at=? WHERE app_device_id=?").bind(Date.now()-8456000,deviceId).run();marker=network.length;
 });
 await check('old report opens existing right-pane management without moving central Sync Center or requiring a merge',async()=>{
  await appSource.bringToFront();await pa.locator('#sync-center-account-recheck').evaluate(e=>e.click());await pa.waitForFunction(()=>document.querySelector('#sync-center-overall-status').textContent==='要確認1件');assert.equal(await appSource.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),'portSync');assert(await cleanLocal());assert.equal(await source.locator('[data-sync-merge-preview]').count(),0);
  await appSource.screenshot({path:OUT+'/studio-old-report.png'});
 });
 await check(blocked?'503 retains attention, then explicit existing Sync retry reports clean and refreshes visible Port':'normal native report completion refreshes visible central Port to zero without another recheck',async()=>{
  // The native document is already running; its existing page-update control
  // restarts that same normal Sync contract. No Sync button is auto-clicked.
  await appSource.evaluate(()=>{for(const f of document.querySelectorAll('.studio-series-frame'))f.contentWindow.studioAppDirty=false;});await appSource.evaluate(()=>window.oldChordFrame=document.querySelector('#tool-window-slot iframe'));await appSource.locator('#tool-window-slot [data-refresh-series-app=chord]').click();await appSource.waitForFunction(()=>document.querySelector('#tool-window-slot iframe')!==oldChordFrame);source=await(await appSource.locator('#tool-window-slot iframe').elementHandle()).contentFrame();
  const response=appSource.waitForResponse(r=>r.url().endsWith('/v1/sync/removal-safety')&&r.request().postDataJSON()?.appId==='chord');release();await response;
  if(blocked){await source.getByText('端末報告の更新が必要',{exact:true}).waitFor();assert.equal((await readReport()).state,'attention');assert.equal(await pa.locator('#sync-center-overall-status').innerText(),'要確認1件');await appSource.screenshot({path:OUT+'/studio-report-error.png'});
   const reply=appSource.waitForResponse(r=>r.url().endsWith('/v1/sync/removal-safety')&&r.request().postDataJSON()?.appId==='chord'&&r.status()===200);blocked=false;await source.getByRole('button',{name:'同期して再確認',exact:true}).click();await reply;
  }
  assert.equal((await readReport()).state,'clean');assert.equal((await readReport()).attention_count,0);await pa.waitForFunction(()=>document.querySelector('#sync-center-overall-status').textContent==='同期の確認事項なし');await pa.waitForFunction(()=>document.querySelector('#sync-center-port-status-chip').textContent.includes('同期済み'));assert(await cleanLocal());assert.equal(await appSource.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),'portSync');await appSource.screenshot({path:OUT+'/studio-normal-report.png'});result.noManualPortRecheck=true;
 });
 assert(!network.slice(marker).some(r=>r.appId==='chord'&&r.path==='/v1/sync/push'),'read-only Port refresh must not cause an adoption or data push');release();
}

export async function acceptSyncAttentionProduct(context){return process.env.STALE_SURFACE==='studio'?studio(context):standalone(context);}
