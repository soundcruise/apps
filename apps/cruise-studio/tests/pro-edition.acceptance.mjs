import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {PRO_DIRECTORY}from'../scripts/edition-layout.mjs';
const root='https://soundcruise.jp/apps/cruise-studio/',entry=root+PRO_DIRECTORY+'/';
export async function acceptProEdition({profile,bootstrapPro,createAccount,check,OUT,db,src}){
 const p=await profile('edition',false),page=p.page;
 await check('Standard absent; Pro requires existing Pro authentication',async()=>{
  for(const url of [root,root+'index.html']){const r=await page.goto(url);assert.equal(r.status(),404);assert.equal(page.url(),url);assert.equal(await page.locator('#studio-shell').count(),0);}
  const r=await page.goto(entry);assert.equal(r.status(),200);await page.waitForFunction(()=>!!CruiseStudio.entryAuth);
  assert.equal(await page.evaluate(()=>CruiseStudio.entryAuth.isAuthorized()),false);assert(await page.locator('#studio-shell').evaluate(e=>e.inert));
 });
 await bootstrapPro(p);await page.goto(entry);await page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
 if(process.env.STUDIO_DESIGN_REVIEW==='1')return(await import('./pro-design-review.acceptance.mjs')).acceptDesignReview({p,check,OUT,root,entry});
 await check('Pro-only Home; 5 themes × 4 widths; original icons and Port badge',async()=>{
  assert.equal(await page.evaluate(async()=>SoundCruiseSyncAccount.storage.getAccount()),null);
  const matrix=[];
  for(const width of [1440,1024,768,390])for(const theme of ['midnight','dark','charcoal','gray','light']){
   await page.setViewportSize({width,height:width===390?844:1000});await page.evaluate(t=>CruiseStudio.colorTheme.applyColorTheme(t),theme);
   await page.locator('.studio-pro-badge').waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('img[data-studio-icon]')].every(i=>i.complete&&i.naturalWidth>0));
   const measure=await page.evaluate(()=>{const h=document.querySelector('.studio-header h1').getBoundingClientRect(),b=document.querySelector('.studio-pro-badge').getBoundingClientRect(),c=document.querySelector('#home-cruise-sync').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,badgeWithinTitle:b.right<=h.right+1,badgeBeforeSync:b.right<=c.left,images:[...document.querySelectorAll('img[data-studio-icon]')].map(i=>({name:i.dataset.studioIcon,loaded:i.complete&&i.naturalWidth>0,light:i.src.includes('-light.svg')}))};});
   assert(!measure.overflow);assert(measure.badgeWithinTitle);assert(measure.badgeBeforeSync);
   assert(measure.images.every(i=>i.loaded&&i.light===['gray','light'].includes(theme)));
   matrix.push({width,theme,...measure});await page.screenshot({path:OUT+'/after-'+theme+'-'+width+'.png'});
  }
  fs.writeFileSync(OUT+'/design-matrix.json',JSON.stringify(matrix,null,2));
 });
 await check('Pro-relative embedded tool and four-app entry paths',async()=>{
  await page.evaluate(()=>CruiseStudio.colorTheme.applyColorTheme('midnight'));
  for(const [id,surface]of [['tuner','port-tuner'],['metronome','port-metronome'],['portPractice','port-practice'],['portGear','port-gear'],['portMyApps','port-my-apps'],['portNews','port-news'],['portSync','port-sync'],...['pitch','fretboard','rhythm','chord'].map(id=>['app_'+id,'series-'+id])]){
   console.log('Checking embedded entry',id);await page.evaluate(id=>CruiseStudio.shellHost.navigate(id),id);
   const frame=await(await page.locator('#'+surface+'-surface iframe').elementHandle()).contentFrame();await frame.waitForURL(id.startsWith('app_')?'about:srcdoc':'https://soundcruise.jp/**');await frame.waitForLoadState('load');
   if(id.startsWith('app_'))await frame.waitForFunction(()=>document.documentElement.dataset.studioTheme==='midnight');
   else if(id==='portNews')await frame.locator('#news-view').waitFor({state:'visible'});
   else await frame.waitForFunction(()=>document.body.dataset.componentState==='ready');
   assert.equal(await frame.evaluate(()=>new URL(document.baseURI).origin),'https://soundcruise.jp');assert(!frame.url().includes('/cruise-studio/cruise-port/'));
  }
  await page.locator('button[data-workspace=home]').click();
  await page.locator('#screen-home [data-open-calendar]').click();const calendar=await(await page.locator('#port-practice-surface iframe').elementHandle()).contentFrame();await calendar.waitForFunction(()=>document.body.dataset.componentState==='ready');
  await page.locator('button[data-workspace=home]').click();
 });
 await check('Same-origin saved Project/Account/UNKNOWN and old-tab draft survive new Pro entry',async()=>{
  await createAccount(p);
  const baseline=process.env.STUDIO_BASELINE_ARTIFACT;assert(baseline?.startsWith('/private/tmp/'));
  const oldRoutes=async route=>{const u=new URL(route.request().url()),file=path.join(baseline,u.pathname);try{return route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'),body:fs.readFileSync(file)});}catch{return route.fallback();}};
  await p.context.route('https://soundcruise.jp/apps/cruise-studio/**',oldRoutes);
  await page.goto(root+'index.html');await page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
  const saved=await page.evaluate(async()=>{const C=CruiseStudio,s=C.model.createSampleProject();await C.repository.save({target:{type:'project',projectId:s.projectId},baseRevision:null,snapshot:s});return{id:s.projectId,raw:localStorage.getItem('cruiseStudio.project.'+s.projectId),account:JSON.stringify(await SoundCruiseSyncAccount.storage.getAccount())};});
  // Before images use the unchanged published 0.84.2 artifact.
  for(const width of [1440,1024,768,390])for(const theme of ['midnight','dark','charcoal','gray','light']){await page.setViewportSize({width,height:width===390?844:1000});await page.evaluate(t=>CruiseStudio.colorTheme.applyColorTheme(t),theme);await page.screenshot({path:OUT+'/before-'+theme+'-'+width+'.png'});}
  await page.locator('#home-cruise-sync').click();let child=await(await page.locator('#port-sync-surface iframe').elementHandle()).contentFrame();await child.waitForFunction(()=>document.body.dataset.componentState==='ready');
  await child.evaluate(async()=>{const a=await SoundCruiseSyncAccount.storage.getAccount();await SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:a.accountId}).putOutbox({operationId:'edition-retain',state:'UNKNOWN',value:'retained'});});
  await page.locator('button[data-workspace=home]').click();await page.locator('#open-sheet-cruise').click();await page.locator('#sc-editor-drawer').evaluate(e=>e.open=true);await page.locator('#sc-title').fill('Unsaved old tab retained');await page.locator('#sc-title').press('Tab');
  await p.context.unroute('https://soundcruise.jp/apps/cruise-studio/**',oldRoutes);
  const next=await p.context.newPage();await next.goto(entry);await next.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
  assert.equal(await next.evaluate(async()=>JSON.stringify(await SoundCruiseSyncAccount.storage.getAccount())),saved.account);
  assert.equal(await next.evaluate(id=>localStorage.getItem('cruiseStudio.project.'+id),saved.id),saved.raw);
  assert.equal(await page.locator('#sc-title').inputValue(),'Unsaved old tab retained');
  await next.locator('#home-cruise-sync').click();child=await(await next.locator('#port-sync-surface iframe').elementHandle()).contentFrame();await child.waitForFunction(()=>document.body.dataset.componentState==='ready');
  assert(await child.evaluate(async()=>{const a=await SoundCruiseSyncAccount.storage.getAccount(),s=SoundCruiseMultiAppSync.dataStorage.createStore('port',{accountId:a.accountId});return(await s.listOutbox()).some(o=>o.operationId==='edition-retain'&&o.state==='UNKNOWN');}));
  assert.equal(await next.locator('#port-sync-surface [data-entry-owner-hold]').count(),0);
  await next.locator('button[data-workspace=home]').click();await next.reload();await next.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
  assert.equal(await next.evaluate(id=>localStorage.getItem('cruiseStudio.project.'+id),saved.id),saved.raw);
 });
 await check('Pro URL retains operator Owner admission and rejects other Account',async()=>{
  const owner=await profile('edition-owner',false);await bootstrapPro(owner);const account=await createAccount(owner),datasetId=crypto.randomUUID();
  await(await import(src+'/studio-activation.js')).changeStudioActivation(db,{expectedRevision:0,operationId:crypto.randomUUID(),mode:'canary',targets:[{accountId:account.accountId,deviceId:account.accountDeviceId,datasetId}],reason:'isolated Pro URL admission regression'});
  await db.prepare('UPDATE studio_document_control SET enabled=1 WHERE id=1').run();
  await owner.page.goto(entry);await owner.page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized()&&!!CruiseStudio.projectCloud);
  await owner.page.waitForFunction(()=>{try{return !!CruiseStudio.projectCloud.session.readSession();}catch{return false;}});
  assert.equal(await owner.page.evaluate(()=>CruiseStudio.projectCloud.session.readSession().activation.mode),'canary');
  const other=await profile('edition-non-owner',false);await bootstrapPro(other);await createAccount(other);await other.page.goto(entry);await other.page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized()&&!!CruiseStudio.projectCloud);
  await assert.rejects(()=>other.page.evaluate(()=>CruiseStudio.projectCloud.session.refresh()),/activation-scope/);assert(await other.page.locator('#screen-home').isVisible());
 });
 await check('Pro entrance preserves existing local score/PreDTM JSON MIDI PDF acceptance',async()=>{
  const q=await profile('edition-creation',false);await bootstrapPro(q);await q.page.goto(entry);await q.page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
  const receipt=await(await import('./score-return.acceptance.mjs')).acceptLocalCreation(q.page,OUT,{printPDF:process.env.STUDIO_UI_BROWSER!=='webkit'});fs.writeFileSync(OUT+'/local-creation.json',JSON.stringify(receipt,null,2));
 });
}
