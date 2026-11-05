import {PRO_DIRECTORY} from '../scripts/edition-layout.mjs';
const studioEntry=process.env.STUDIO_PRO_EDITION==='1'?'https://soundcruise.jp/apps/cruise-studio/'+PRO_DIRECTORY+'/index.html':'https://soundcruise.jp/apps/cruise-studio/index.html';
import assert from 'node:assert/strict';import fs from 'node:fs';
export async function acceptDeletedRestart({profile,bootstrapPro,createAccount,check,db,nativeClient,normalGear,OUT}){
 if(process.env.STUDIO_LOCAL_CREATION_ONLY==='1')return check('isolated existing score/PreDTM save reload JSON MIDI PDF acceptance',async()=>{
  const p=await profile('local-creation',false);await bootstrapPro(p);
  await p.page.goto(studioEntry);await p.page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized());
  const receipt=await(await import('./score-return.acceptance.mjs')).acceptLocalCreation(p.page,OUT);
  fs.writeFileSync(OUT+'/local-creation.json',JSON.stringify(receipt,null,2));
 });
 if(process.env.STUDIO_INVITATION_VISIBILITY_ONLY==='1')return acceptInvitationVisibility({profile,bootstrapPro,createAccount,check,OUT});
 if(process.env.STUDIO_RESTART_GUARDS_ONLY==='1')return acceptReleaseGuards({profile,bootstrapPro,createAccount,check,db,normalGear,OUT});
 for(let repetition=0;repetition<(process.env.STUDIO_RESTART_FOCUSED==='1'?3:1);repetition++)for(const surface of (process.env.STUDIO_RESTART_FOCUSED==='1'||(process.env.STUDIO_RELEASE_RACE_BASELINE==='1'||process.env.STUDIO_SYNC_JOIN_INTERRUPTED==='1')?['studio']:['port','studio']))for(const deleted of (process.env.STUDIO_RESTART_FOCUSED==='1'||(process.env.STUDIO_RELEASE_RACE_BASELINE==='1'||process.env.STUDIO_SYNC_JOIN_INTERRUPTED==='1')?['deleted']:['deleting','deleted','invalid']))for(const mode of (process.env.STUDIO_RESTART_FOCUSED==='1'||(process.env.STUDIO_RELEASE_RACE_BASELINE==='1'||process.env.STUDIO_SYNC_JOIN_INTERRUPTED==='1')?['connect']:['create','connect']))await check(surface+' '+deleted+' restart '+mode+' retains old UNKNOWN and local data',async()=>{
  const p=await profile(surface+'-'+deleted+'-'+mode+'-'+repetition,false);await bootstrapPro(p);const account=await createAccount(p);
  await p.page.goto('https://soundcruise.jp/apps/cruise-port/pro_9a3943176561/#sync-center');await p.page.locator('#sync-center-view').waitFor({state:'visible'});await normalGear(p.page,'Retained old local instrument');

  if(deleted==='invalid')await db.prepare('UPDATE sync_account_devices SET credential_verifier=? WHERE account_id=?').bind(crypto.randomUUID().replaceAll('-','').repeat(2),account.accountId).run();else await db.prepare('UPDATE sync_accounts SET created_at=created_at-345600000,state=?,delete_requested_at=?,purge_after=? WHERE id=?').bind(deleted,Date.now()-(surface==='studio'?3:0)*86400000,Date.now()+(surface==='studio'?4:7)*86400000,account.accountId).run();
  let f=p.page;
  const evidence=[];p.page.on('response',async response=>{const u=new URL(response.url());if(!/^\/v2\/(accounts\/(summary|devices)|pro-auth\/device-session\/(challenge|renew))$/.test(u.pathname))return;let code=null;if(u.pathname.startsWith('/v2/accounts/'))try{const body=await response.json();code=/^[a-z][a-z0-9_-]{0,63}$/.test(body.code||'')?body.code:null;}catch{}evidence.push({path:u.pathname,status:response.status(),code});});

  if(surface==='studio'){await p.page.goto(studioEntry);await p.page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized());await p.page.locator('#home-cruise-sync').click();f=await(await p.page.locator('#port-sync-surface iframe').elementHandle()).contentFrame();}
  else{await p.page.goto('https://soundcruise.jp/apps/cruise-port/pro_9a3943176561/#sync-center');}
  let project=null;if(surface==='studio')project=await p.page.evaluate(async()=>{const C=CruiseStudio,p=C.model.createSampleProject();await C.repository.save({target:{type:'project',projectId:p.projectId},snapshot:p,baseRevision:null});return{id:p.projectId,bytes:localStorage.getItem('cruiseStudio.project.'+p.projectId)};});
  // Follow the current surface document rather than a Frame captured during startup.
  const restartPanel=surface==='studio'?p.page.frameLocator('#port-sync-surface iframe').locator('[data-deleted-account-restart]'):p.page.locator('[data-deleted-account-restart]');
  const snapshot=()=>p.page.evaluate(surface=>{const frame=surface==='studio'?document.querySelector('#port-sync-surface iframe'):null,doc=surface==='studio'?frame?.contentDocument:document;return{entry:surface==='studio'?CruiseStudio.entryAuth.read().phase:null,iframePresent:!!frame,iframeInert:frame?.inert??null,ready:doc?.body?.dataset.componentState||null,nativeState:doc?.querySelector('#sync-center-view')?.dataset.syncState||null,proGate:!!doc?.getElementById('pro-gate-overlay'),restartPresent:!!doc?.querySelector('[data-deleted-account-restart]'),restartHidden:doc?.querySelector('[data-deleted-account-restart]')?.hidden??null};},surface);
  try{await restartPanel.waitFor({state:'visible',timeout:20000});}
  catch(error){fs.writeFileSync(OUT+'/'+surface+'-'+deleted+'-'+mode+'-'+repetition+'-failure.json',JSON.stringify({stage:await snapshot(),capturedFrameDetached:f.isDetached?.()||false,requests:evidence},null,2));throw error;}
  fs.writeFileSync(OUT+'/'+surface+'-'+deleted+'-'+mode+'-'+repetition+'-ready.json',JSON.stringify({stage:await snapshot(),capturedFrameDetached:f.isDetached?.()||false,requests:evidence},null,2));
  if(surface==='studio')f=await(await p.page.locator('#port-sync-surface iframe').elementHandle()).contentFrame();

  await f.evaluate(async id=>{await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:id}).putOutbox({operationId:'retain-unknown',state:'UNKNOWN',terminalError:'account_deleting',value:'retained'});},account.accountId);
  assert(await f.locator('#port-sync-activate').isHidden());
  assert(await p.page.evaluate(async()=>!!(await SoundCruiseSyncAccount.storage.getAccount())?.accountCredential));
  await f.locator('[data-deleted-account-restart]').scrollIntoViewIfNeeded();await p.page.screenshot({path:OUT+'/'+surface+'-'+deleted+'-'+mode+'.png'});
  p.page.once('dialog',d=>d.dismiss());await f.locator('[data-restart-mode='+mode+']').click();assert(await p.page.evaluate(async()=>!!(await SoundCruiseSyncAccount.storage.getAccount())?.accountCredential));
  let releaseSummary,finishSummary,raceRoute,refreshRequest;
  if(process.env.STUDIO_RESTART_RELEASE_RACE==='1'){
   let enter;releaseSummary=new Promise(r=>enter=r);const wait=new Promise(r=>finishSummary=r);let held=false;
   raceRoute=async route=>{
    // Hold only the native release revalidation. Parent Studio observation is independent.
    if(route.request().frame()===(surface==='port'?p.page.mainFrame():f)){
     if(!held){held=true;enter();await wait;}
     else if(!refreshRequest)refreshRequest=route.request();
    }
    await route.fallback();
   };
   await p.context.route('**/v2/accounts/summary',raceRoute);
  }
  p.page.once('dialog',d=>d.accept());await f.locator('[data-restart-mode='+mode+']').click();
  if(releaseSummary){
   await releaseSummary;
   const observed=p.page.waitForResponse(r=>r.request()===refreshRequest);
   // Native return-refresh uses this existing online event; no controller injection.
   await f.evaluate(()=>window.dispatchEvent(new Event('online')));
   await observed;
   await f.waitForFunction(()=>{const s=document.getElementById('sync-center-account-status')?.textContent;return s==='削除済み・削除処理中'||s==='以前の接続資格が無効';});
   finishSummary();
   if(process.env.STUDIO_RELEASE_RACE_BASELINE==='1'){
    await f.waitForFunction(()=>document.getElementById('sync-center-alert')?.textContent.includes('接続資格を解除できませんでした'));
    const retained=await p.page.evaluate(async()=>!!(await SoundCruiseSyncAccount.storage.getAccount())?.accountCredential);
    assert(retained);fs.writeFileSync(OUT+'/BASELINE-RACE.json',JSON.stringify({reproduced:true,retained,summaryStatus:410,controllerReproduction:'account_deletion_unconfirmed before CAS'},null,2));
    await p.page.screenshot({path:OUT+'/baseline-release-failed.png'});
    await p.context.unroute('**/v2/accounts/summary',raceRoute);return;
   }
  }
  if(surface==='studio'){await p.page.waitForFunction(()=>document.querySelector('#port-sync-surface iframe')?.contentDocument?.querySelector('#sync-center-setup[open],#sync-center-port-connect[open]'));f=await(await p.page.locator('#port-sync-surface iframe').elementHandle()).contentFrame();}
  await f.locator(mode==='create'?'#sync-center-setup':'#sync-center-port-connect').waitFor({state:'visible'});
  if(raceRoute)await p.context.unroute('**/v2/accounts/summary',raceRoute);
  assert.equal(await p.page.evaluate(async()=>await SoundCruiseSyncAccount.storage.getAccount()),null);
  if(process.env.STUDIO_SYNC_JOIN_INTERRUPTED==='1'){
   // Code issuance happens in another browser. Returning to Sync after a
   // workspace/visibility interruption must still finish the native join.
   await p.page.locator('button[data-workspace=home]').click();
   await p.page.locator('#home-cruise-sync').click();
   f=await(await p.page.locator('#port-sync-surface iframe').elementHandle()).contentFrame();
   await f.waitForFunction(()=>document.body.dataset.componentState==='ready');
   await f.locator('#sync-center-port-connect-open').click();
   await f.locator('#sync-center-port-connect').waitFor({state:'visible'});
  }
  if(releaseSummary){
   fs.writeFileSync(OUT+'/'+surface+'-'+deleted+'-'+mode+'-release-race.json',JSON.stringify({nativeReturnRefreshCompleted:true,credentialReleased:true,nativeDialogVisible:true,requests:evidence},null,2));
   if(surface==='studio'&&deleted==='deleted'&&mode==='connect')await p.page.screenshot({path:OUT+'/fixed-release-dialog.png',mask:[f.locator('[data-sensitive]')]});
  }
  if(mode==='create'){
   await f.evaluate(()=>globalThis.__SOUND_CRUISE_ACCOUNT_TURNSTILE__={getToken:async()=> 'synthetic'});
console.log('SETUP_GEOMETRY',surface,await f.locator('#sync-center-setup-confirm').boundingBox(),surface==='studio'?await p.page.locator('#port-sync-surface iframe').boundingBox():null);await p.page.screenshot({path:OUT+'/setup-'+surface+'-'+deleted+'.png',mask:[f.locator('[data-sensitive]')]});
   await f.locator('#sync-center-setup-confirm').click();if(surface==='port')await f.waitForFunction(()=>document.getElementById('sync-center-setup').dataset.syncPhase==='complete');else await p.page.waitForFunction(()=>!document.querySelector('#port-sync-surface iframe')?.contentDocument?.querySelector('#sync-center-setup[open]'));
  }else{
   const b=await profile('issuer-'+surface+'-'+deleted,false);await bootstrapPro(b);await createAccount(b);await b.page.goto('https://soundcruise.jp/apps/cruise-port/pro_9a3943176561/#sync-center');await b.page.locator('#sync-center-view').waitFor({state:'visible'});const invitation=await nativeClient(b.page,'issue');
   await f.locator('#sync-center-port-connect-name').fill('Synthetic restart environment');await f.locator('#sync-center-port-connect-input').fill(invitation.displayJoinCode);await f.locator('#sync-center-port-connect-confirm').click();if(surface==='port')await f.waitForFunction(()=>document.getElementById('sync-center-port-connect-close').hidden===false);else await p.page.waitForFunction(()=>!document.querySelector('#port-sync-surface iframe')?.contentDocument?.querySelector('#sync-center-port-connect[open]'));
  }
  if(surface==='studio'){await p.page.waitForFunction(()=>document.querySelector('#port-sync-surface iframe')?.contentDocument?.body?.dataset.componentState==='ready');f=await(await p.page.locator('#port-sync-surface iframe').elementHandle()).contentFrame();}
  if(surface==='studio'){
   const handoff={ownerHold:await p.page.locator('#port-sync-surface [data-entry-owner-hold]').count(),inert:await p.page.locator('#port-sync-surface iframe').evaluate(e=>e.inert)};
   if(process.env.STUDIO_SYNC_JOIN_INTERRUPTED==='1')fs.writeFileSync(OUT+'/interrupted-join-handoff.json',JSON.stringify(handoff,null,2));
   assert.equal(handoff.ownerHold,0);assert.equal(handoff.inert,false);
  }
  const changed=await f.evaluate(async oldId=>{const a=await SoundCruiseSyncAccount.storage.getAccount(),old=await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:oldId}).listOutbox();return{different:!!a?.accountId&&a.accountId!==oldId,oldRetained:old.some(o=>o.operationId==='retain-unknown'&&o.state==='UNKNOWN'),newPortCredential:!!await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:a.accountId}).readMeta('credential'),rawRetained:Object.values(localStorage).some(s=>s.includes('Retained old local instrument'))};},account.accountId);
  if(project){assert(project.bytes);assert.equal(await p.page.evaluate(id=>localStorage.getItem('cruiseStudio.project.'+id),project.id),project.bytes);}
  assert(changed.different);assert(changed.oldRetained);assert(changed.rawRetained);assert.equal(changed.newPortCredential,false);

 });
 if(process.env.STUDIO_RESTART_RELEASE_GUARDS==='1')await acceptReleaseGuards({profile,bootstrapPro,createAccount,check,db,normalGear,OUT});
}

async function acceptInvitationVisibility({profile,bootstrapPro,createAccount,check,OUT}) {
 await check('Studio retains native addition code across browser visibility change',async()=>{
  const p=await profile('invitation-visibility',false);await bootstrapPro(p);await createAccount(p);
  await p.page.goto(studioEntry);
  await p.page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized());await p.page.locator('#home-cruise-sync').click();
  const f=await(await p.page.locator('#port-sync-surface iframe').elementHandle()).contentFrame();
  await f.locator('[data-sync-port-add-environment]').click();
  await f.locator('dialog[data-sync-join-invitation][open]').waitFor({state:'visible'});
  const invitation=await f.evaluate(()=>({id:document.querySelector('dialog[data-sync-join-invitation]').dataset.syncJoinInvitation,code:document.querySelector('.sync-center-join-code').textContent}));
  const status=()=>p.page.evaluate(async id=>{
   const r=SoundCruiseSyncAccount,c=new r.AccountClient({endpoint:'https://sound-cruise-sync.cruise-port-requests.workers.dev',storage:r.storage,core:r.core,admissionMode:'production'});
   return c.request('/v2/accounts/port-join-invitations?invitationId='+encodeURIComponent(id),{accountCredential:(await r.storage.getAccount()).accountCredential});
  },invitation.id);
  assert.equal((await status()).state,'active');
  await p.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  const kept=await p.page.locator('#port-sync-surface iframe').count();
  if(process.env.STUDIO_EXPECT_CODE_LOSS==='1'){
   assert.equal(kept,0);
   await p.page.goto('https://soundcruise.jp/apps/cruise-port/pro_9a3943176561/#sync-center');
   const denied=p.page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/accounts/port-join-invitations'&&r.request().method()==='POST');
   await p.page.locator('[data-sync-port-add-environment]').click();
   const response=await denied,body=await response.json(),refusal={status:response.status(),code:body.code};
   assert.deepEqual(refusal,{status:409,code:'port_join_already_active'});
   fs.writeFileSync(OUT+'/orphan-invitation.json',JSON.stringify({iframeLost:true,invitationState:(await status()).state,...refusal},null,2));return;
  }
  assert.equal(kept,1);assert.equal(await f.locator('.sync-center-join-code').textContent(),invitation.code);
  assert.equal((await status()).state,'active');
  await p.page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  const cancelled=p.page.waitForResponse(r=>new URL(r.url()).pathname==='/v2/accounts/port-join-invitations/cancel');
  await f.locator('dialog[data-sync-join-invitation] button',{hasText:'閉じる'}).click();
  await cancelled;
  assert.equal((await status()).state,'cancelled');
 });
}

// Disposable profiles only: exercise native failure UI and the REAL Account DB CAS.
async function acceptReleaseGuards({profile,bootstrapPro,createAccount,check,db,normalGear,OUT}) {
 await check('Studio Pro-only Home admission without Account',async()=>{
  const p=await profile('release-pro-only',false);await bootstrapPro(p);
  await p.page.goto(studioEntry);
  await p.page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized());
  assert.equal(await p.page.evaluate(async()=>await SoundCruiseSyncAccount.storage.getAccount()),null);
  assert(await p.page.locator('#screen-home').isVisible());
 });
 for(const fault of ['offline','active','generation','cas'])await check('Port release guard: '+fault,async()=>{
  const p=await profile('release-guard-'+fault,false);await bootstrapPro(p);const old=await createAccount(p);
  await p.page.goto('https://soundcruise.jp/apps/cruise-port/pro_9a3943176561/#sync-center');
  await p.page.locator('#sync-center-view').waitFor({state:'visible'});await normalGear(p.page,'Retained guard instrument');
  await db.prepare("UPDATE sync_accounts SET state='deleting',delete_requested_at=?,purge_after=? WHERE id=?").bind(Date.now(),Date.now()+7*86400000,old.accountId).run();
  await p.page.goto('https://soundcruise.jp/apps/cruise-port/pro_9a3943176561/#sync-center');
  await p.page.locator('[data-deleted-account-restart]').waitFor({state:'visible'});
  const before=await p.page.evaluate(async id=>{
   await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:id}).putOutbox({operationId:'guard-unknown',state:'UNKNOWN',value:'retain'});
   return {account:JSON.stringify(await SoundCruiseSyncAccount.storage.getAccount()),local:JSON.stringify(Object.entries(localStorage).sort())};
  },old.accountId);
  let enter,finish;const entered=new Promise(r=>enter=r),wait=new Promise(r=>finish=r);let held=false;
  const route=async r=>{if(!held){held=true;enter();await wait;if(fault==='offline')return r.abort('internetdisconnected');}return r.fallback();};
  await p.context.route('**/v2/accounts/summary',route);
  p.page.once('dialog',d=>d.accept());await p.page.locator('[data-restart-mode=connect]').click();await entered;
  let replacement=null;
  if(fault==='active')await db.prepare("UPDATE sync_accounts SET state='active',delete_requested_at=NULL,purge_after=NULL WHERE id=?").bind(old.accountId).run();
  if(fault==='generation')await p.page.evaluate(async()=>SoundCruiseSyncAccount.storage.setAccount(await SoundCruiseSyncAccount.storage.getAccount()));
  if(fault==='cas'){
   // Another tab may write before its BroadcastChannel hint arrives. No guard is bypassed:
   // the unchanged production CAS must reject this raw DB drift atomically.
   replacement={...old,accountId:crypto.randomUUID(),accountCredential:'isolated-replacement-credential',accountDeviceId:crypto.randomUUID()};
   await p.page.evaluate(async value=>{
    const db=await new Promise((ok,no)=>{const r=indexedDB.open('sound-cruise-sync-account');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
    try{await new Promise((ok,no)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(value,'account');tx.oncomplete=ok;tx.onabort=()=>no(tx.error);});}finally{db.close();}
   },replacement);
  }
  finish();await p.page.waitForFunction(()=>!!document.getElementById('sync-center-view').dataset.accountRestartDiagnostic);
  const d=await p.page.locator('#sync-center-view').evaluate(e=>JSON.parse(e.dataset.accountRestartDiagnostic));
  assert.equal(d.casSucceeded,false);
  if(fault==='cas'){assert.equal(d.stage,'cas');assert.equal(d.casAttempted,true);assert.equal(d.code,'account_identity_changed');}
  else {assert.equal(d.casAttempted,false);assert.equal(d.stage,'summary');}
  if(fault==='generation'){assert.equal(d.generationMatches,false);assert.equal(d.code,'account_generation_changed');}
  assert.equal(await p.page.locator('#sync-center-port-connect').isVisible(),false);
  const after=await p.page.evaluate(async oldId=>({account:JSON.stringify(await SoundCruiseSyncAccount.storage.getAccount()),local:JSON.stringify(Object.entries(localStorage).sort()),outbox:await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:oldId}).listOutbox()}),old.accountId);
  assert.equal(after.account,replacement?JSON.stringify(replacement):before.account);assert.equal(after.local,before.local);
  assert(after.outbox.some(x=>x.operationId==='guard-unknown'&&x.state==='UNKNOWN'));
  fs.writeFileSync(OUT+'/release-guard-'+fault+'.json',JSON.stringify(d,null,2));
  await p.context.unroute('**/v2/accounts/summary',route);
 });
}
