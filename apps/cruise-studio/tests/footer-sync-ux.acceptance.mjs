import assert from 'node:assert/strict';
export async function acceptFooterSync({profile,bootstrapPro,createAccount,check,result,OUT,db}){
 const p=await profile('footer-sync',false);await bootstrapPro(p);const page=p.page;
 await page.goto('https://soundcruise.jp/apps/cruise-studio/index.html');await page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized());
 await check('shared footer, official information links and guarded refresh across widths',async()=>{
 for(const width of [1440,1024,768,390]){
 await page.setViewportSize({width,height:width===390?844:1000});await page.locator('#studio-info-open').click();assert.equal(await page.locator('#studio-information a').count(),4);await page.locator('#studio-information button').click();
 assert.equal(await page.locator('[data-studio-footer-version]').textContent(),await page.locator('#studio-version').textContent());
 await page.locator('#studio-footer-refresh').scrollIntoViewIfNeeded();await page.screenshot({path:OUT+'/footer-'+width+'.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await page.locator('#studio-footer-refresh').click();await page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized());
 });
 await check('no Account: existing native addition-code dialog; Project hidden',async()=>{
 await page.locator('#home-cruise-sync').click();await page.waitForFunction(()=>document.querySelector('[data-connection-state=disconnected]'));const native=await(await page.locator('#port-sync-surface iframe').elementHandle()).contentFrame();await native.waitForFunction(()=>document.body.dataset.componentState==='ready');
 for(const width of [1440,1024,768,390]){
 await page.setViewportSize({width,height:width===390?844:1000});await page.evaluate(()=>document.getElementById('studio-main').scrollTop=0);await page.screenshot({path:OUT+'/sync-unconnected-'+width+'.png'});
 await page.locator('[data-connection-action]').click();const f=await(await page.locator('#port-sync-surface iframe').elementHandle()).contentFrame();await f.locator('#sync-center-port-connect').waitFor({state:'visible'});await page.screenshot({path:OUT+'/connect-dialog-'+width+'.png'});await f.locator('#sync-center-port-connect-cancel').click();assert(await page.locator('[data-open-project-details]').isHidden());
 }

 });
 const account=await createAccount(p);await page.evaluate(()=>CruiseStudio.accountStatus.refresh());
 await check('normal Account; Project permission separate; communication failure and recovery retain storage',async()=>{
 await page.waitForFunction(()=>document.querySelector('[data-connection-state=connected]'));await page.evaluate(()=>document.getElementById('studio-main').scrollTop=0);await page.screenshot({path:OUT+'/sync-connected.png'});
 assert(await page.locator('[data-open-project-details]').isHidden());
 const {changeStudioActivation}=await import(process.env.STUDIO_WORKER_ROOT+'/workers/sound-cruise-sync/src/studio-activation.js');
 await changeStudioActivation(db,{expectedRevision:0,operationId:crypto.randomUUID(),mode:'canary',targets:[{accountId:account.accountId,deviceId:account.accountDeviceId,datasetId:crypto.randomUUID()}],reason:'synthetic UI acceptance only'});await db.prepare('UPDATE studio_document_control SET enabled=1').run();await page.evaluate(()=>CruiseStudio.projectCloud.refresh());await page.locator('[data-open-project-details]').waitFor({state:'visible'});await page.evaluate(()=>document.getElementById('studio-main').scrollTop=0);await page.screenshot({path:OUT+'/sync-owner-allowed.png'});
 const before=await page.evaluate(async()=>JSON.stringify(await SoundCruiseSyncAccount.storage.getAccount()));
 await p.context.route('**/v2/accounts/summary',r=>r.fulfill({status:503,headers:{'access-control-allow-origin':'https://soundcruise.jp'},contentType:'application/json',body:JSON.stringify({ok:false,code:'service_unavailable'})}));
 await page.evaluate(()=>CruiseStudio.accountStatus.refresh());await page.waitForFunction(()=>document.querySelector('[data-connection-state=error]'));assert.equal(await page.evaluate(async()=>JSON.stringify(await SoundCruiseSyncAccount.storage.getAccount())),before);await page.screenshot({path:OUT+'/sync-outage.png'});
 await p.context.unroute('**/v2/accounts/summary');await page.evaluate(()=>CruiseStudio.accountStatus.refresh());await page.waitForFunction(()=>document.querySelector('[data-connection-state=connected]'));
 await p.context.route('**/v2/accounts/summary',r=>r.fulfill({status:410,headers:{'access-control-allow-origin':'https://soundcruise.jp'},contentType:'application/json',body:JSON.stringify({ok:false,code:'account_device_revoked'})}));await page.evaluate(()=>CruiseStudio.accountStatus.refresh());await page.waitForFunction(()=>document.querySelector('[data-connection-state=attention]'));assert.equal(await page.evaluate(async()=>JSON.stringify(await SoundCruiseSyncAccount.storage.getAccount())),before);await page.screenshot({path:OUT+'/sync-attention.png'});await p.context.unroute('**/v2/accounts/summary');await page.evaluate(()=>CruiseStudio.accountStatus.refresh());
 await p.context.setOffline(true);await page.evaluate(()=>CruiseStudio.accountStatus.refresh());await page.waitForFunction(()=>document.querySelector('[data-connection-state=offline]'));assert.equal(await page.evaluate(async()=>JSON.stringify(await SoundCruiseSyncAccount.storage.getAccount())),before);await p.context.setOffline(false);await page.evaluate(()=>CruiseStudio.accountStatus.refresh());await page.waitForFunction(()=>document.querySelector('[data-connection-state=connected]'));
 });
 result.realCredentialsUsed=false;
}
