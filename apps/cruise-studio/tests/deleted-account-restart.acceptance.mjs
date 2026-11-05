import assert from 'node:assert/strict';
export async function acceptDeletedRestart({profile,bootstrapPro,createAccount,check,db,nativeClient,normalGear,OUT}){
 for(const surface of ['port','studio'])for(const deleted of ['deleting','deleted','invalid'])for(const mode of ['create','connect'])await check(surface+' '+deleted+' restart '+mode+' retains old UNKNOWN and local data',async()=>{
  const p=await profile(surface+'-'+deleted+'-'+mode,false);await bootstrapPro(p);const account=await createAccount(p);
  await p.page.goto('https://soundcruise.jp/apps/cruise-port/pro_9a3943176561/#sync-center');await p.page.locator('#sync-center-view').waitFor({state:'visible'});await normalGear(p.page,'Retained old local instrument');

  if(deleted==='invalid')await db.prepare('UPDATE sync_account_devices SET credential_verifier=? WHERE account_id=?').bind(crypto.randomUUID().replaceAll('-','').repeat(2),account.accountId).run();else await db.prepare('UPDATE sync_accounts SET created_at=created_at-345600000,state=?,delete_requested_at=?,purge_after=? WHERE id=?').bind(deleted,Date.now()-(surface==='studio'?3:0)*86400000,Date.now()+(surface==='studio'?4:7)*86400000,account.accountId).run();
  let f=p.page;
  if(surface==='studio'){await p.page.goto('https://soundcruise.jp/apps/cruise-studio/index.html');await p.page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized());await p.page.locator('#home-cruise-sync').click();f=await(await p.page.locator('#port-sync-surface iframe').elementHandle()).contentFrame();}
  else{await p.page.goto('https://soundcruise.jp/apps/cruise-port/pro_9a3943176561/#sync-center');}
  let project=null;if(surface==='studio')project=await p.page.evaluate(async()=>{const C=CruiseStudio,p=C.model.createSampleProject();await C.repository.save({target:{type:'project',projectId:p.projectId},snapshot:p,baseRevision:null});return{id:p.projectId,bytes:localStorage.getItem('cruiseStudio.project.'+p.projectId)};});
  await f.locator('[data-deleted-account-restart]').waitFor({state:'visible'}).catch(async e=>{console.log('RESTART_STATE',await f.evaluate(()=>({native:document.querySelector('#sync-center-view')?.dataset.syncState,panel:document.querySelector('[data-deleted-account-restart]')?.hidden,status:document.querySelector('#sync-center-account-status')?.textContent,version:document.querySelector('.port-app-version-display')?.textContent})));console.log('ROOT_STATE',surface==='studio'?await p.page.evaluate(()=>({phase:CruiseStudio.entryAuth.read().phase,inert:document.querySelector('#port-sync-surface iframe')?.inert,observation:CruiseStudio.accountStatus.diagnostics().state,errorCode:CruiseStudio.accountStatus.diagnostics().errorCode})):null);throw e;});
  await f.evaluate(async id=>{await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:id}).putOutbox({operationId:'retain-unknown',state:'UNKNOWN',terminalError:'account_deleting',value:'retained'});},account.accountId);
  assert(await f.locator('#port-sync-activate').isHidden());
  assert(await p.page.evaluate(async()=>!!(await SoundCruiseSyncAccount.storage.getAccount())?.accountCredential));
  await f.locator('[data-deleted-account-restart]').scrollIntoViewIfNeeded();await p.page.screenshot({path:OUT+'/'+surface+'-'+deleted+'-'+mode+'.png'});
  p.page.once('dialog',d=>d.dismiss());await f.locator('[data-restart-mode='+mode+']').click();assert(await p.page.evaluate(async()=>!!(await SoundCruiseSyncAccount.storage.getAccount())?.accountCredential));
  p.page.once('dialog',d=>d.accept());await f.locator('[data-restart-mode='+mode+']').click();
  if(surface==='studio'){await p.page.waitForFunction(()=>document.querySelector('#port-sync-surface iframe')?.contentDocument?.querySelector('#sync-center-setup[open],#sync-center-port-connect[open]'));f=await(await p.page.locator('#port-sync-surface iframe').elementHandle()).contentFrame();}
  await f.locator(mode==='create'?'#sync-center-setup':'#sync-center-port-connect').waitFor({state:'visible'});
  assert.equal(await p.page.evaluate(async()=>await SoundCruiseSyncAccount.storage.getAccount()),null);
  if(mode==='create'){
   await f.evaluate(()=>globalThis.__SOUND_CRUISE_ACCOUNT_TURNSTILE__={getToken:async()=> 'synthetic'});
console.log('SETUP_GEOMETRY',surface,await f.locator('#sync-center-setup-confirm').boundingBox(),surface==='studio'?await p.page.locator('#port-sync-surface iframe').boundingBox():null);await p.page.screenshot({path:OUT+'/setup-'+surface+'-'+deleted+'.png',mask:[f.locator('[data-sensitive]')]});
   await f.locator('#sync-center-setup-confirm').click();if(surface==='port')await f.waitForFunction(()=>document.getElementById('sync-center-setup').dataset.syncPhase==='complete');else await p.page.waitForFunction(()=>!document.querySelector('#port-sync-surface iframe')?.contentDocument?.querySelector('#sync-center-setup[open]'));
  }else{
   const b=await profile('issuer-'+surface+'-'+deleted,false);await bootstrapPro(b);await createAccount(b);await b.page.goto('https://soundcruise.jp/apps/cruise-port/pro_9a3943176561/#sync-center');await b.page.locator('#sync-center-view').waitFor({state:'visible'});const invitation=await nativeClient(b.page,'issue');
   await f.locator('#sync-center-port-connect-name').fill('Synthetic restart environment');await f.locator('#sync-center-port-connect-input').fill(invitation.displayJoinCode);await f.locator('#sync-center-port-connect-confirm').click();if(surface==='port')await f.waitForFunction(()=>document.getElementById('sync-center-port-connect-close').hidden===false);else await p.page.waitForFunction(()=>!document.querySelector('#port-sync-surface iframe')?.contentDocument?.querySelector('#sync-center-port-connect[open]'));
  }
  if(surface==='studio'){await p.page.waitForFunction(()=>document.querySelector('#port-sync-surface iframe')?.contentDocument?.body?.dataset.componentState==='ready');f=await(await p.page.locator('#port-sync-surface iframe').elementHandle()).contentFrame();}
  if(surface==='studio'){assert.equal(await p.page.locator('#port-sync-surface [data-entry-owner-hold]').count(),0);assert.equal(await p.page.locator('#port-sync-surface iframe').evaluate(e=>e.inert),false);}
  const changed=await f.evaluate(async oldId=>{const a=await SoundCruiseSyncAccount.storage.getAccount(),old=await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:oldId}).listOutbox();return{different:!!a?.accountId&&a.accountId!==oldId,oldRetained:old.some(o=>o.operationId==='retain-unknown'&&o.state==='UNKNOWN'),newPortCredential:!!await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:a.accountId}).readMeta('credential'),rawRetained:Object.values(localStorage).some(s=>s.includes('Retained old local instrument'))};},account.accountId);
  if(project){assert(project.bytes);assert.equal(await p.page.evaluate(id=>localStorage.getItem('cruiseStudio.project.'+id),project.id),project.bytes);}
  assert(changed.different);assert(changed.oldRetained);assert(changed.rawRetained);assert.equal(changed.newPortCredential,false);

 });
}
