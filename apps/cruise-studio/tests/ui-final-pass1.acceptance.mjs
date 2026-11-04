// UI-only additions to the existing native Account/Project product fixture.
import assert from 'node:assert/strict';import fs from 'node:fs';
export async function acceptUI({A,projectId,check,OUT,network,profile,bootstrapPro}){
 const p=A.page,baseline=process.env.STUDIO_UI_BASELINE==='1',engine=process.env.STUDIO_UI_BROWSER||'chrome';
 const evidence={engine,baseline,measurements:[]},settle=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await p.evaluate(id=>CruiseStudio.documents.select(id),projectId);
 async function cloud(width,height,label){await p.setViewportSize({width,height});await settle();await p.locator('[data-project-canary]').evaluate(e=>{e.open=true;e.scrollIntoView({block:'start'});});await settle();
  const m=await p.evaluate(()=>{const cloud=document.querySelector('[data-project-canary]'),summary=cloud.querySelector('summary'),toolbar=document.querySelector('.sheet-toolbar'),main=document.querySelector('.studio-main'),rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};},s=summary.getBoundingClientRect(),hit=document.elementFromPoint(s.x+s.width/2,s.y+s.height/2);return{cloud:rect(cloud),toolbar:rect(toolbar),main:rect(main),summaryClickable:!!hit&&summary.contains(hit),horizontalOverflow:document.documentElement.scrollWidth>innerWidth,safeBottom:getComputedStyle(main).scrollPaddingBottom};});
  evidence.measurements.push({label,width,height,...m});await p.screenshot({path:OUT+'/ui-'+engine+'-'+label+'.png'});return m;
 }
 if(baseline){await cloud(390,844,'before-cloud-390');await p.locator('button[data-workspace=home]').click();await p.screenshot({path:OUT+'/ui-'+engine+'-before-home-390.png'});fs.writeFileSync(OUT+'/UI-'+engine+'.json',JSON.stringify(evidence,null,2));return;}
 await check('390px Cloud summary and every action remain reachable below the score toolbar, with safe-area scroll clearance',async()=>{
  const m=await cloud(390,844,'after-cloud-390');assert(m.summaryClickable);assert(m.toolbar.bottom<=m.cloud.y+1);assert(!m.horizontalOverflow);
  await p.evaluate(()=>document.documentElement.style.setProperty('--studio-safe-bottom','34px'));
  const dock=p.locator('#shell-dock-toggle');evidence.dockPresent=!!await dock.count();if(evidence.dockPresent)await dock.click();
  for(const action of ['refresh','observe','reconcile','delete']){const b=p.locator('[data-cloud-action='+action+']');await b.scrollIntoViewIfNeeded();await settle();assert(await b.evaluate(e=>{const r=e.getBoundingClientRect(),m=document.querySelector('.studio-main').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.bottom<=m.bottom+1&&!!hit&&e.contains(hit);}));}
  const safe=await p.locator('.studio-main').evaluate(e=>parseFloat(getComputedStyle(e).scrollPaddingBottom));assert(safe>=34);await p.screenshot({path:OUT+'/ui-'+engine+'-safe-dock-390.png'});
  if(await dock.count())await dock.click();await p.evaluate(()=>document.documentElement.style.removeProperty('--studio-safe-bottom'));
 });
 await check('canary Home uses the existing Project status and opens its original Cloud UI without a write',async()=>{
  await p.locator('button[data-workspace=home]').click();const note=p.locator('.home-project-storage-note');assert(!await note.textContent().then(s=>s.includes('Cruise Syncの対象外')));
  assert.equal(await p.locator('[data-project-home-status]').textContent(),await p.locator('[data-project-sync-status]').textContent());
  const start=network.length;await p.locator('[data-open-project-cloud]').focus();await p.keyboard.press('Enter');await settle();assert.equal(await p.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),'sheetCruise');assert(await p.locator('[data-project-canary] summary').evaluate(e=>e===document.activeElement));
  assert(!network.slice(start).some(x=>x.path==='/v2/studio/document'&&['begin','upload','upload-batch','commit'].includes(x.kind)));
  await p.locator('button[data-workspace=home]').click();await p.screenshot({path:OUT+'/ui-'+engine+'-after-home-390.png'});
 });
 await check('local unsaved score survives Home/PreDTM navigation and Cloud UI does not enter print output',async()=>{
  await p.locator('#open-sheet-cruise').click();const before=await p.evaluate(()=>CruiseStudio.documents.capture().project.songInfo.bpm);
  await p.locator('#sc-editor-drawer').evaluate(e=>e.open=true);await p.locator('#sc-bpm').fill(String(before===103?104:103));await p.locator('#sc-bpm').press('Tab');assert(await p.evaluate(()=>CruiseStudio.documents.getSession().dirty));
  await p.locator('#sc-goto-pre-dtm').click();await p.locator('#pd-goto-sheet').click();assert.equal(await p.locator('#sc-bpm').inputValue(),String(before===103?104:103));await p.locator('#sc-undo').click();assert.equal(await p.locator('#sc-bpm').inputValue(),String(before));await p.locator('#sc-editor-drawer').evaluate(e=>e.open=false);
  await p.emulateMedia({media:'print'});assert.equal(await p.locator('[data-project-canary]').isVisible(),false);await p.emulateMedia({media:'screen'});
 });
 await check('Cloud layout retains five themes and mobile/desktop widths',async()=>{
  for(const width of [375,390,430,1024,1440]){const m=await cloud(width,width<600?844:1000,'cloud-'+width);assert(m.summaryClickable);assert(!m.horizontalOverflow);}
  for(const theme of ['dark','midnight','charcoal','gray','light']){await p.evaluate(t=>CruiseStudio.colorTheme.setColorTheme(t),theme);await cloud(1440,1000,'desktop-'+theme);}
 });
 await check('native Port tools, calendar, NEWS and right-side tool remain usable beside Project UI',async()=>{
  await p.setViewportSize({width:1440,height:1000});
  for(const [workspace,surface]of [['tuner','port-tuner'],['metronome','port-metronome'],['portPractice','port-practice'],['portGear','port-gear'],['portMyApps','port-my-apps'],['portNews','port-news']]){
   await p.locator('button[data-workspace='+workspace+']').click();if(workspace!=='portNews')await p.waitForFunction(id=>document.querySelector('#'+id+'-surface iframe')?.contentDocument?.body?.dataset.componentState==='ready',surface);else await p.frameLocator('#'+surface+'-surface iframe').locator('#news-view:not([hidden])').waitFor();
   const child=await(await p.locator('#'+surface+'-surface iframe').elementHandle()).contentFrame();assert.equal(await child.locator('#pro-gate-overlay').count(),0);
  }
  await p.locator('button[data-workspace=home]').click();await p.locator('#screen-home [data-open-calendar]').click();const cal=await(await p.locator('#port-practice-surface iframe').elementHandle()).contentFrame();await cal.locator('#practice-calendar-note-add').waitFor({state:'visible'});
  await p.locator('button[data-workspace=home]').click();await p.locator('#studio-tool-toggle').click();await p.locator('#tool-window-select').selectOption('metronome');await p.locator('#studio-tool-window #port-metronome-surface iframe').waitFor({state:'visible'});
  await p.locator('#screen-home [data-open-project-cloud]').click();assert(await p.locator('#studio-tool-window #port-metronome-surface iframe').isVisible());assert(await p.locator('[data-project-canary]').isVisible());await p.screenshot({path:OUT+'/ui-'+engine+'-right-tool-cloud-1440.png'});await p.locator('#studio-tool-toggle').click();
 });
 await check('Safari-style empty storage explains PWA separation and opens the existing Account connection form',async()=>{
  const q=await profile('UI-empty-browser',false);await bootstrapPro(q);await q.page.setViewportSize({width:390,height:844});const start=network.length;
  await q.page.goto('https://soundcruise.jp/apps/cruise-studio-canary/project-canary.html');await q.page.locator('[data-entry-browser-note]').waitFor({state:'visible'});assert((await q.page.locator('[data-entry-browser-note]').textContent()).includes('Safari'));
  await q.page.locator('[data-entry-connect]').click();const frame=await(await q.page.locator('#studio-entry-account iframe').elementHandle()).contentFrame();await frame.locator('#sync-center-port-connect-open').click();await frame.locator('#sync-center-port-connect').waitFor({state:'visible'});
  assert.equal(await q.page.evaluate(()=>CruiseStudio.entryAuth.isAuthorized()),false);assert(!network.slice(start).some(x=>x.label==='UI-empty-browser'&&['/v2/accounts/start','/v2/accounts/port-device','/v1/sync/push'].includes(x.path)));await q.page.screenshot({path:OUT+'/ui-'+engine+'-account-guide-390.png'});
 });
 await p.setViewportSize({width:1440,height:1000});await p.locator('button[data-workspace=home]').click();await p.screenshot({path:OUT+'/ui-'+engine+'-after-home-1440.png'});fs.writeFileSync(OUT+'/UI-'+engine+'.json',JSON.stringify(evidence,null,2));
}
