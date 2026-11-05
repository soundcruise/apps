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
 if(baseline){await cloud(390,844,'before-cloud-390');await p.locator('button[data-workspace=home]').click();for(const width of [390,1440]){await p.setViewportSize({width,height:width===390?844:1000});await p.evaluate(()=>{CruiseStudio.colorTheme.setColorTheme('midnight');document.querySelector('#studio-main').scrollTop=0;});await settle();await p.screenshot({path:OUT+'/header-before-'+width+'.png'});}fs.writeFileSync(OUT+'/UI-'+engine+'.json',JSON.stringify(evidence,null,2));return;}
 await check('390px Cloud summary and every action remain reachable below the score toolbar, with safe-area scroll clearance',async()=>{
  const m=await cloud(390,844,'after-cloud-390');assert(m.summaryClickable);assert(m.toolbar.bottom<=m.cloud.y+1);assert(!m.horizontalOverflow);
  await p.evaluate(()=>document.documentElement.style.setProperty('--studio-safe-bottom','34px'));
  const dock=p.locator('#shell-dock-toggle');evidence.dockPresent=!!await dock.count();if(evidence.dockPresent)await dock.click();
  for(const action of ['refresh','observe','reconcile','delete']){const b=p.locator('[data-cloud-action='+action+']');await b.scrollIntoViewIfNeeded();await settle();assert(await b.evaluate(e=>{const r=e.getBoundingClientRect(),m=document.querySelector('.studio-main').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.bottom<=m.bottom+1&&!!hit&&e.contains(hit);}));}
  const safe=await p.locator('.studio-main').evaluate(e=>parseFloat(getComputedStyle(e).scrollPaddingBottom));assert(safe>=34);await p.screenshot({path:OUT+'/ui-'+engine+'-safe-dock-390.png'});
  if(await dock.count())await dock.click();await p.evaluate(()=>document.documentElement.style.removeProperty('--studio-safe-bottom'));
 });
 await check('Home connects through Cruise Sync to the existing Project UI without a write',async()=>{
  await p.locator('button[data-workspace=home]').click();assert.equal(await p.locator('.home-project-storage-note').count(),0);assert.equal(await p.locator('.home-tools [data-home-workspace=portSync]').count(),1);
  assert.equal(await p.locator('[data-project-home-status]').textContent(),await p.locator('[data-project-sync-status]').textContent());
  const start=network.length;await p.locator('[data-home-workspace=portSync]').focus();await p.keyboard.press('Enter');await settle();assert.equal(await p.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),'portSync');await p.locator('[data-open-project-details]').click();await p.waitForFunction(()=>CruiseStudio.shellHost.getActiveWorkspace()==='sheetCruise');assert.equal(await p.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),'sheetCruise');assert(await p.locator('[data-project-canary] summary').evaluate(e=>e===document.activeElement));
  assert(!network.slice(start).some(x=>x.path==='/v2/studio/document'&&['begin','upload','upload-batch','commit'].includes(x.kind)));
  await p.locator('button[data-workspace=home]').click();await p.screenshot({path:OUT+'/ui-'+engine+'-after-home-390.png'});
 });
 await check('local unsaved score survives Home/PreDTM navigation and Cloud UI does not enter print output',async()=>{
  await p.locator('#open-sheet-cruise').click();const before=await p.evaluate(()=>CruiseStudio.documents.capture().project.songInfo.bpm);
  await p.locator('#sc-editor-drawer').evaluate(e=>e.open=true);await p.locator('#sc-bpm').fill(String(before===103?104:103));await p.locator('#sc-bpm').press('Tab');assert(await p.evaluate(()=>CruiseStudio.documents.getSession().dirty));await p.locator('#studio-refresh').evaluate(e=>e.click());assert.match(await p.locator('#studio-refresh-status').textContent(),/保存/);assert(await p.evaluate(()=>CruiseStudio.documents.getSession().dirty));
  await p.locator('#sc-goto-pre-dtm').click();await p.locator('#pd-goto-sheet').click();assert.equal(await p.locator('#sc-bpm').inputValue(),String(before===103?104:103));await p.locator('#sc-undo').click();assert.equal(await p.locator('#sc-bpm').inputValue(),String(before));await p.locator('#sc-editor-drawer').evaluate(e=>e.open=false);
  await p.emulateMedia({media:'print'});assert.equal(await p.locator('[data-project-canary]').isVisible(),false);if(engine==='chromium'){const pdf=await p.pdf({path:OUT+'/studio-score.pdf',format:'A4'});assert(pdf.subarray(0,4).toString()==='%PDF');}await p.emulateMedia({media:'screen'});
 });
 await check('Cloud layout retains five themes and mobile/desktop widths',async()=>{
  for(const width of [375,390,430,1024,1440]){const m=await cloud(width,width<600?844:1000,'cloud-'+width);assert(m.summaryClickable);assert(!m.horizontalOverflow);}
  for(const theme of ['dark','midnight','charcoal','gray','light']){await p.evaluate(t=>CruiseStudio.colorTheme.setColorTheme(t),theme);await cloud(1440,1000,'desktop-'+theme);}
 });
 await check('native Port tools, calendar, NEWS and right-side tool remain usable beside Project UI',async()=>{
  await p.setViewportSize({width:1440,height:1000});
  for(const [workspace,surface]of [['tuner','port-tuner'],['metronome','port-metronome'],['portPractice','port-practice'],['portGear','port-gear'],['portMyApps','port-my-apps'],['portNews','port-news']]){
   await p.locator('button[data-workspace='+workspace+']').click().catch(async error=>{console.log('ENTRY_FAIL',await p.evaluate(()=>({state:CruiseStudio.entryAuth.read(),diagnostics:CruiseStudio.entryAuth.diagnostics()})));throw error;});if(workspace!=='portNews')await p.waitForFunction(id=>document.querySelector('#'+id+'-surface iframe')?.contentDocument?.body?.dataset.componentState==='ready',surface);else await p.frameLocator('#'+surface+'-surface iframe').locator('#news-view:not([hidden])').waitFor();
   const child=await(await p.locator('#'+surface+'-surface iframe').elementHandle()).contentFrame();assert.equal(await child.locator('#pro-gate-overlay').count(),0);
  }
  await p.locator('button[data-workspace=home]').click();await p.locator('#screen-home [data-open-calendar]').click();const cal=await(await p.locator('#port-practice-surface iframe').elementHandle()).contentFrame();await cal.locator('#practice-calendar-note-add').waitFor({state:'visible'});
  await p.locator('button[data-workspace=home]').click();await p.locator('#studio-tool-toggle').click();await p.locator('#tool-window-select').selectOption('metronome');await p.locator('#studio-tool-window #port-metronome-surface iframe').waitFor({state:'visible'});
  await p.locator('#screen-home [data-home-workspace=portSync]').click();await p.locator('[data-open-project-details]').click();await p.waitForFunction(()=>CruiseStudio.shellHost.getActiveWorkspace()==='sheetCruise');assert(await p.locator('#studio-tool-window #port-metronome-surface iframe').isVisible());assert(await p.locator('[data-project-canary]').isVisible());await p.screenshot({path:OUT+'/ui-'+engine+'-right-tool-cloud-1440.png'});await p.locator('#studio-tool-toggle').click();
 });
 await check('Pro-only entry permits local work but never creates an Owner session',async()=>{
  const q=await profile('UI-Pro-only',false);await bootstrapPro(q);const start=network.length;
  await q.page.goto('https://soundcruise.jp/apps/cruise-studio/index.html');await q.page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized()&&!!CruiseStudio.projectCloud);
  assert.equal(await q.page.evaluate(()=>CruiseStudio.entryAuth.read().accountId),null);assert.equal(await q.page.evaluate(()=>CruiseStudio.colorTheme.getColorTheme()),'midnight');
  await q.page.locator('#open-sheet-cruise').click();assert(await q.page.locator('[data-project-canary]').textContent().then(s=>s.includes('Account未接続')));assert.equal(await q.page.locator('[data-project-canary] .studio-cloud-panel .studio-cloud-panel').evaluate(e=>e.inert),true);await q.page.locator('#sc-goto-pre-dtm').click();
  assert(await q.page.locator('#screen-pre-dtm').isVisible());await q.page.evaluate(()=>CruiseStudio.shellHost.navigate('metronome'));await q.page.waitForFunction(()=>document.querySelector('#port-metronome-surface iframe')?.contentDocument?.body?.dataset.componentState==='ready');
  for(const id of ['pitch','fretboard','rhythm','chord']){const leave=d=>d.accept();q.page.on('dialog',leave);try{await q.page.evaluate(id=>{CruiseStudio.shellHost.navigate('home');CruiseStudio.shellHost.navigate('app_'+id);},id);}finally{q.page.off('dialog',leave);}await q.page.locator('#series-'+id+'-surface iframe').waitFor();}
  assert(await q.page.evaluate(()=>{try{CruiseStudio.projectCloud.session.readSession();return false;}catch{return true;}}));
  assert(!network.slice(start).some(x=>x.label==='UI-Pro-only'&&x.path==='/v2/studio/document'));
 });
 await check('Home header and Sync navigation retain the existing Account observer',async()=>{
  await p.locator('button[data-workspace=home]').click();
  assert.equal(await p.locator('.studio-header > p').textContent(),'弾き語りストのワークスペース');
  assert(await p.locator('[data-port-sync-status]').isHidden());
  assert(await p.evaluate(()=>typeof CruiseStudio.accountStatus?.refresh==='function'));
  for(const width of [390,768,1024,1440]){await p.setViewportSize({width,height:width<600?844:1000});await settle();for(const theme of ['dark','midnight','charcoal','gray','light']){await p.evaluate(t=>CruiseStudio.colorTheme.setColorTheme(t),theme);assert(await p.locator('#home-cruise-sync').isVisible());assert(await p.locator('#studio-refresh').isVisible());assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}await p.evaluate(()=>{CruiseStudio.colorTheme.setColorTheme('midnight');document.querySelector('#studio-main').scrollTop=0;});await settle();await p.screenshot({path:OUT+'/header-'+engine+'-'+width+'.png'});}
  const loading=await p.evaluate(()=>{document.querySelector('#home-cruise-sync').click();return document.querySelector('#port-sync-status').textContent;});assert.equal(loading,'Cruise Syncに移動しています。');assert.equal(await p.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),'portSync');
  await p.locator('button[data-workspace=home]').click();await p.locator('button[data-workspace=portSync]').click();assert.equal(await p.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),'portSync');await p.waitForFunction(()=>document.querySelector('#port-sync-surface iframe')?.contentDocument?.body?.dataset.componentState==='ready');await settle();await p.screenshot({path:OUT+'/cruise-sync-'+engine+'-1440.png'});
  await p.evaluate(()=>CruiseStudio.accountStatus.refresh());assert(await p.evaluate(()=>!!CruiseStudio.accountStatus.diagnostics().state));
  await p.locator('button[data-workspace=home]').click();
  // Keep the two reload checks sequential: navigation cancels in-flight auth and Project requests in WebKit.
  await p.waitForLoadState('networkidle');
  await p.reload();await p.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized()&&typeof CruiseStudio.accountStatus?.refresh==='function');
  await p.waitForFunction(()=>document.querySelector('#home-cruise-sync')&&!document.querySelector('#studio-shell').inert);
  await p.waitForLoadState('networkidle');
  await Promise.all([p.waitForEvent('load'),p.locator('#studio-refresh').click()]);await p.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized()&&typeof CruiseStudio.accountStatus?.refresh==='function');await p.waitForLoadState('networkidle');
 });
 await check('legacy canary URLs use normal Studio without rewriting local Projects, Account or Outbox IDs',async()=>{
  await p.waitForLoadState('networkidle');
  const snapshot=()=>p.evaluate(async id=>({projects:Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('cruiseStudio.project.')).sort().map(k=>[k,localStorage.getItem(k)])),account:(await SoundCruiseSyncAccount.storage.getAccount())?.accountId,operations:(await CruiseStudio.projectCloud.client.list(id)).map(o=>o.operationId).sort()}),projectId);
  const before=await snapshot();
  for(const page of ['index.html','project-canary.html']){
   await p.goto('https://soundcruise.jp/apps/cruise-studio-canary/'+page);await p.waitForURL('https://soundcruise.jp/apps/cruise-studio/');await p.waitForFunction(()=>{try{return CruiseStudio.entryAuth?.isAuthorized()&&!!CruiseStudio.projectCloud?.session.readSession();}catch{return false;}});await p.waitForLoadState('networkidle');assert.deepEqual(await snapshot(),before);
  }
 });
 await check('center surfaces expand with their content and project Midnight without persisting app choices',async()=>{
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>CruiseStudio.colorTheme.setColorTheme('midnight'));
  const measurements=[];
  for(const [workspace,surface] of [['tuner','port-tuner'],['metronome','port-metronome'],['portPractice','port-practice'],['portGear','port-gear'],['portMyApps','port-my-apps'],['portSync','port-sync'],['calendar','port-practice'],...['pitch','fretboard','rhythm','chord'].map(id=>['app_'+id,'series-'+id])]){
   console.log('CENTER_CHECK',workspace);const leave=d=>d.accept();p.on('dialog',leave);try{await p.evaluate(id=>{CruiseStudio.shellHost.navigate('home');if(id!=='calendar')CruiseStudio.shellHost.navigate(id);},workspace);if(workspace==='calendar')await p.locator('#screen-home [data-open-calendar]').click();}finally{p.off('dialog',leave);}
   const locator=p.locator('#'+surface+'-surface iframe');await locator.waitFor();
   const child=await(await locator.elementHandle()).contentFrame();await child.waitForLoadState('load');
   await child.waitForFunction(()=>document.body&&document.getElementById('studio-center-height'));
   await child.waitForFunction(()=>document.scrollingElement.scrollHeight<=innerHeight+4).catch(async error=>{console.log('SCROLL_FAIL',workspace,await child.evaluate(()=>({height:innerHeight,root:document.scrollingElement.scrollHeight,body:document.body.getBoundingClientRect().height,children:[...document.body.children].map(e=>({tag:e.tagName,id:e.id,height:e.getBoundingClientRect().height,position:getComputedStyle(e).position})).slice(0,8)})));throw error;});
   if(workspace==='metronome'){await child.locator('#metronome-details').evaluate(e=>e.open=true);await child.waitForFunction(()=>document.scrollingElement.scrollHeight<=innerHeight+4);}
   if(workspace==='tuner'){await child.locator('#tuner-input-settings-toggle').click();await child.waitForFunction(()=>document.scrollingElement.scrollHeight<=innerHeight+4);}
   const bottom=await child.locator('button').evaluateAll(buttons=>{let target=null,max=-Infinity;for(const button of buttons){if(button.closest('details:not([open])')||button.matches(':disabled')||!button.getClientRects().length||getComputedStyle(button).visibility!=='visible')continue;let fixed=false;for(let n=button;n;n=n.parentElement)if(getComputedStyle(n).position==='fixed'||(n!==document.body&&n!==document.documentElement&&n.scrollHeight>n.clientHeight+1&&/auto|scroll/.test(getComputedStyle(n).overflowY))){fixed=true;break;}const r=button.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!fixed&&hit&&button.contains(hit)&&r.width>0&&r.height>0&&r.bottom>max){target=button;max=r.bottom;}}if(target)target.dataset.studioBottomQa='';return !!target;});
   assert(bottom,workspace+' has an actionable bottom control');await child.locator('[data-studio-bottom-qa]').scrollIntoViewIfNeeded();await child.locator('[data-studio-bottom-qa]').click({trial:true});assert.equal(await child.evaluate(()=>scrollY),0,workspace+' uses only outer vertical scrolling');
   measurements.push({workspace,...await child.evaluate(()=>({height:innerHeight,scroll:document.scrollingElement.scrollHeight,theme:document.documentElement.dataset.studioTheme}))});
  }
  fs.writeFileSync(OUT+'/center-scroll-'+engine+'.json',JSON.stringify(measurements,null,2));
 });
 await check('synthetic microphone and metronome contexts stop when leaving their workspace',async()=>{
  const q=await profile('UI-audio-only',false);await bootstrapPro(q);
  await q.context.addInitScript(()=>{const Native=window.AudioContext||window.webkitAudioContext;if(!Native)return;window.__qaContexts=[];for(const name of ['AudioContext','webkitAudioContext']){if(window[name])window[name]=class extends Native{constructor(...args){super(...args);window.__qaContexts.push(this);}};}if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{const context=new AudioContext(),source=context.createOscillator(),destination=context.createMediaStreamDestination();source.frequency.value=440;source.connect(destination);source.start();window.__qaGenerator=context;window.__qaMic=destination.stream;return destination.stream;};});
  await q.page.goto('https://soundcruise.jp/apps/cruise-studio/index.html');await q.page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized());await q.page.locator('button[data-workspace=tuner]').click();
  await q.page.waitForFunction(()=>document.querySelector('#port-tuner-surface iframe')?.contentWindow?.__qaMic?.getTracks().length).catch(async error=>{console.log('SYNTHETIC_MIC_DIAGNOSTIC',await q.page.evaluate(()=>{const f=document.querySelector('#port-tuner-surface iframe'),w=f?.contentWindow;return{entry:CruiseStudio.entryAuth.read(),ready:w?.document.body?.dataset.componentState,contexts:w?.__qaContexts?.map(c=>c.state),text:w?.document.getElementById('tuner-view')?.textContent};}));throw error;});
  await q.page.evaluate(()=>{const w=document.querySelector('#port-tuner-surface iframe').contentWindow;window.__qaTrack=w.__qaMic.getTracks()[0];window.__qaGenerator=w.__qaGenerator;CruiseStudio.shellHost.navigate('metronome');});await q.page.waitForFunction(()=>__qaTrack.readyState==='ended');await q.page.waitForFunction(()=>__qaGenerator.state==='closed');
  const frame=q.page.frameLocator('#port-metronome-surface iframe');await frame.locator('#metronome-toggle').click();await frame.locator('#metronome-toggle[aria-pressed=true]').waitFor();
  await q.page.evaluate(()=>{window.__qaOutput=document.querySelector('#port-metronome-surface iframe').contentWindow.__qaContexts;CruiseStudio.shellHost.navigate('home');});await q.page.waitForFunction(()=>__qaOutput.length&&__qaOutput.every(c=>c.state==='closed'));
 });
 await check('standalone mobile apps retain an explicit Midnight choice across reload',async()=>{
  const q=await profile('UI-mobile-midnight',false);await q.page.setViewportSize({width:390,height:844});
  for(const [app,settings] of [['pitch-cruise','#home-settings-btn'],['fretboard_cruise','#btn-settings-home'],['rhythm-cruise','#settings-btn'],['chord-cruise','#cc-settings-btn']]){
   await q.page.goto('https://soundcruise.jp/apps/'+app+'/standard/index.html');await q.page.locator(settings).click();if(app==='fretboard_cruise')await q.page.locator('[data-settings-tab=common]').click();await q.page.locator('[data-theme-choice=midnight]').click();
   assert(await q.page.locator('html').evaluate(e=>e.getAttribute('data-midnight')==='true'));await q.page.screenshot({path:OUT+'/midnight-'+app+'-'+engine+'.png'});
   if(app==='pitch-cruise')await q.page.locator('#confirm-settings').click();if(app==='fretboard_cruise')await q.page.locator('#btn-settings-apply').click();console.log('STANDALONE_THEME',app);await q.page.reload();await q.page.waitForFunction(()=>document.documentElement.getAttribute('data-midnight')==='true');
  }
 });
 await p.setViewportSize({width:1440,height:1000});const finalLeave=d=>d.accept();p.on('dialog',finalLeave);try{await p.locator('button[data-workspace=home]').click();}finally{p.off('dialog',finalLeave);}await p.screenshot({path:OUT+'/ui-'+engine+'-after-home-1440.png'});fs.writeFileSync(OUT+'/UI-'+engine+'.json',JSON.stringify(evidence,null,2));
}
