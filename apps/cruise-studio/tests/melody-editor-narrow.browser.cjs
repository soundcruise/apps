/* No force clicks or post-selection test scrolling. Production layout must expose the target. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const url=process.env.STUDIO_URL,origin=new URL(url).origin;
test('responsive Inspector acceptance: 4 widths x 3 lengths x 4 themes',async t=>{
 const b=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),geometry=[];
 try{for(const width of [390,768,1440,1920])for(const bars of [8,64,128])for(const theme of ['dark','light','charcoal','gray'])await t.test(`${width}px/${bars}/${theme}`,async()=>{
 const c=await b.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),p=await c.newPage(),errors=[],http=[],foreign=[];
 try{await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin&&r.request().method()==='GET')return r.continue();if(u.hostname==='fonts.googleapis.com')return r.fulfill({body:'',contentType:'text/css'});foreign.push(u.href);return r.abort();});p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)http.push(r.url());});
 await p.goto(url);await p.waitForFunction(()=>!!window.CruiseStudio?.melodyInspector);
 await p.evaluate(()=>{window.__narrowWrites=[];for(const method of ['setItem','removeItem','clear']){const f=Storage.prototype[method];Storage.prototype[method]=function(...args){__narrowWrites.push([method,args[0]]);return f.apply(this,args);};}for(const method of ['open','deleteDatabase']){const f=indexedDB[method].bind(indexedDB);indexedDB[method]=(...args)=>{__narrowWrites.push(['idb:'+method,args[0]]);return f(...args);};}});
 const ready=()=>p.waitForFunction(()=>{const C=CruiseStudio,s=C.documents.getSession(),source=C.sheetCruise.getStaffMetrics()?.source,ticket=C.documents.ticket(),page=document.querySelector('.melody-page');return page?.dataset.ready==='true'&&page.dataset.projectId===s.target.projectId&&source?.projectId===s.target.projectId&&source.sessionId===s.sessionId&&source.snapshotVersion===s.snapshotVersion&&source.generation===ticket.generation&&source.workspaceId===C.shellHost.getActiveWorkspace()&&source.workspaceGeneration===C.shellHost.getWorkspaceGeneration();});
  await p.setViewportSize({width,height:1000});
  await p.evaluate(({bars,theme,width})=>{const C=CruiseStudio;C.melodyInspector.close();const d=C.model.createLegacySampleProject();d.projectId=`narrow-${width}-${bars}-${theme}`;d.songInfo.originalKey=d.songInfo.playKey='C';d.songInfo.capo=0;const bar=d.bars[0];d.bars=Array.from({length:bars},(_,i)=>({...structuredClone(bar),barNumber:i+1,melody:[{tick:240,durationTicks:180,step:0,alter:0,octave:0},{tick:960,durationTicks:480,step:1,alter:0,octave:0}]}));localStorage.setItem('cruiseStudio.project.'+d.projectId,JSON.stringify(d));C.documents.select(d.projectId);C.shellHost.navigate('sheetCruise');C.colorTheme.applyColorTheme(theme);},{bars,theme,width});
  await p.selectOption('#sc-score-style','melody');await ready();await p.waitForTimeout(80);const auditStart=await p.evaluate(()=>__narrowWrites.length);
  const note=p.locator('.melody-measure').nth(bars-1).locator('[data-melody-target][data-event-id]:not([data-event-id=""])').first(),id=await note.getAttribute('data-event-id');await note.click();await p.waitForTimeout(60);
  const measure=()=>p.evaluate(id=>{const target=Array.from(document.querySelectorAll('[data-melody-target]')).find(e=>e.dataset.eventId===id&&e.getAttribute('aria-pressed')==='true');const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};},panel=document.querySelector('#sc-melody-inspector'),main=document.querySelector('#studio-main'),s=getComputedStyle(panel);return{target:rect(target),panel:rect(panel),main:rect(main),selected:CruiseStudio.melodyInspector.controller.view().eventId,overflow:document.documentElement.scrollWidth-innerWidth,color:s.color,background:s.backgroundColor,scrollTop:main.scrollTop,panelScroll:panel.scrollTop};},id);
  const g=await measure();const toolbar=await p.locator('#screen-sheet-cruise .sheet-toolbar').boundingBox();assert(g.target.top>=toolbar.y+toolbar.height,'selected note clears sticky toolbar');assert.equal(g.selected,id);assert(g.overflow<=1);assert(g.panel.width>=200);assert(g.target.bottom>g.main.top&&g.target.top<g.main.bottom,'selected note in main viewport');assert.notEqual(g.color,g.background);
  if(width<1280){assert(g.panel.top>=g.main.top&&g.panel.bottom<=g.main.bottom+1);assert(g.panel.height<=360);assert(g.target.bottom<=g.panel.top-6,'selected note is above bottom panel');assert(g.target.top>=g.main.top);}
  else assert(g.panel.left>=g.target.right-1,'desktop side panel');
  const panel=p.locator('#sc-melody-inspector');await panel.locator('#sc-melody-duration').selectOption('1920');assert.match(await p.locator('#sc-melody-error').innerText(),/変更は適用していません/);
  const errorBox=await p.locator('#sc-melody-error').boundingBox(),panelBox=await panel.boundingBox();assert(errorBox.y>=panelBox.y&&errorBox.y+errorBox.height<=panelBox.y+panelBox.height,'local rejection is visible without test scrolling');
  await panel.locator('#sc-melody-duration').selectOption('120');await ready();assert.equal(await p.evaluate(()=>CruiseStudio.melodyInspector.controller.view().event.durationTicks),120);assert.equal(await p.evaluate(()=>CruiseStudio.melodyInspector.controller.view().eventId),id);
  const after=await measure();if(width<1280)assert(after.target.bottom<=after.panel.top-6,'edited note remains visible');
  await panel.locator('#sc-melody-onset').fill('480');await panel.getByRole('button',{name:'開始位置を変更',exact:true}).click();await ready();assert.equal(await p.evaluate(()=>CruiseStudio.melodyInspector.controller.view().event.onsetTick),480);
  // Focus and the native edit buffer survive a theme render without replacing inputs.
  const onset=panel.locator('#sc-melody-onset');await onset.focus();await p.evaluate(()=>window.__narrowInput=document.activeElement);
  await p.evaluate(t=>CruiseStudio.colorTheme.applyColorTheme(t),theme);await ready();assert(await p.evaluate(()=>__narrowInput.isConnected&&document.activeElement===__narrowInput));assert.equal(await onset.inputValue(),'480');
  const click=async name=>{await panel.getByRole('button',{name,exact:true}).click();await ready();};
  const barState=()=>p.evaluate(()=>{const s=CruiseStudio.documents.getSession();return {bar:s.draft.bars.at(-1),history:s.getHistory()};});
  const beforeRest=await barState();await click('休符にする');assert.equal((await barState()).bar.melody.find(e=>e.id===id).kind,'rest');
  await note.click();assert.match(await panel.locator('#sc-melody-target').innerText(),/休符/);
  await p.locator('#sc-undo').click();await ready();assert.deepEqual((await barState()).bar,beforeRest.bar);
  await p.locator('#sc-redo').click();await ready();assert.equal((await barState()).bar.melody.find(e=>e.id===id).kind,'rest');
  await p.locator('#sc-undo').click();await ready();
  const gap=p.locator('.melody-measure').last().locator('[data-gap="0:480"]').first();await gap.click();assert.match(await panel.innerText(),/空き時間/);
  const beforeGap=await barState();await click('空き全体を休符として確認');assert.equal((await barState()).bar.melody.find(e=>e.onsetTick===0).kind,'rest');
  await p.locator('#sc-undo').click();await ready();assert.deepEqual((await barState()).bar,beforeGap.bar);
  // The second note is still wholly unconfirmed.
  const second=p.locator('.melody-measure').last().locator('[data-event-id]:not([data-event-id=""])').last();
  await second.click();await click('開始位置だけ確認');let latest=await barState(),secondEvent=latest.bar.melody.find(e=>e.onsetTick===960);
  assert(secondEvent.provenance.timing.onset.confirmed);assert(!secondEvent.provenance.timing.duration.confirmed);
  const partial=latest.bar;await click('空きを休符にして小節を確認');assert((await barState()).bar.melody.every(e=>e.provenance.timing.onset.confirmed&&e.provenance.timing.duration.confirmed));
  await p.locator('#sc-undo').click();await ready();assert.deepEqual((await barState()).bar,partial);
  await note.click();
  // Actual Chromium composition at every geometry; OS Japanese IME remains a separate gate.
  await p.locator('[data-event-id]:not([data-event-id=""])').first().click();
  await p.locator('.melody-measure').first().locator('.melody-bar-heading').click();
  await p.waitForTimeout(80);
  const sharedGeometry=await p.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};},panel=document.querySelector('#sc-melody-inspector'),loupe=document.querySelector('#sc-slot-overlay'),toolbar=document.querySelector('#screen-sheet-cruise .sheet-toolbar'),pr=rect(panel);const hits=Array.from(panel.querySelectorAll('button')).filter(e=>{const r=e.getBoundingClientRect();return r.top>=pr.top&&r.bottom<=pr.bottom;}).map(e=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {text:e.textContent,reachable:hit===e||e.contains(hit)};});return{panel:pr,loupe:rect(loupe),toolbar:rect(toolbar),hits};});
  assert(sharedGeometry.hits.length>0);assert(sharedGeometry.hits.every(x=>x.reachable),'visible Inspector buttons must pass hit testing with Loupe open');
  if(width>=1280){assert(sharedGeometry.loupe.right<=sharedGeometry.panel.left-6,'Loupe clears wide Inspector');assert(sharedGeometry.panel.top>=sharedGeometry.toolbar.bottom+6,'sticky Inspector clears measured toolbar');}
  else assert(sharedGeometry.loupe.bottom<=sharedGeometry.panel.top-6,'Loupe clears bottom Inspector');
  await panel.getByRole('button',{name:'開始位置だけ確認',exact:true}).click();await ready();
  const input=p.locator('#sc-slot-overlay [data-overlay-field="doremi"]');await input.click();
  if(process.env.STAFF_QA_DIR)await p.screenshot({path:process.env.STAFF_QA_DIR+`/shared-${width}-${bars}-${theme}.png`});
  await p.evaluate(()=>window.__narrowIME=document.activeElement);
  const beforeIME=await p.evaluate(()=>{const s=CruiseStudio.documents.getSession();return {draft:s.workingSnapshot(),history:s.getHistory()};}),cdp=await c.newCDPSession(p);
  await cdp.send('Input.imeSetComposition',{text:'れ',selectionStart:1,selectionEnd:1});
  assert(await p.evaluate(()=>CruiseStudio.documents.getSession().inputPending));
  assert(!(await p.evaluate(()=>{const c=CruiseStudio.melodyInspector.controller;return c.execute(c.view()?.handle,'melody.setDuration',{durationTicks:120});})).ok);
  assert.deepEqual(await p.evaluate(()=>{const s=CruiseStudio.documents.getSession();return {draft:s.workingSnapshot(),history:s.getHistory()};}),beforeIME);
  assert(await p.evaluate(()=>__narrowIME.isConnected&&document.activeElement===__narrowIME));
  await cdp.send('Input.insertText',{text:'レミ'});await cdp.detach();await ready();
  assert(await p.evaluate(()=>__narrowIME.isConnected&&document.activeElement===__narrowIME&&__narrowIME.selectionStart===__narrowIME.selectionEnd&&__narrowIME.selectionStart>=2));
  assert.match(await input.inputValue(),/レミ/);await input.press('Escape');
  assert.deepEqual(await p.evaluate(start=>__narrowWrites.slice(start),auditStart),[]);geometry.push({width,bars,theme,id,click:g,edited:after,sharedGeometry,error:{...errorBox},errors,http,foreign,auditStart,ledger:await p.evaluate(()=>__narrowWrites)});
  if(process.env.STAFF_QA_DIR)await p.screenshot({path:process.env.STAFF_QA_DIR+`/narrow-${width}-${bars}-${theme}.png`});
 assert.deepEqual(errors,[]);assert.deepEqual(http,[]);assert.deepEqual(foreign,[]);
 }finally{await c.close();}
 });
 }finally{if(process.env.STAFF_QA_DIR)fs.writeFileSync(process.env.STAFF_QA_DIR+'/narrow-geometry.json',JSON.stringify({geometry},null,2));await b.close();}
});
