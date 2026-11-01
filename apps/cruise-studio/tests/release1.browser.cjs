const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const url=process.env.STUDIO_URL,shots=process.env.STUDIO_SHOTS||'/tmp/studio-release1-shots';
async function fixture(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH}),page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());requests.push(u.pathname);return u.origin===new URL(url).origin?route.continue():route.abort();});
 await page.addInitScript(()=>{localStorage.setItem('cruiseStudio.project.future-song','synthetic-keep');window.projectWrites=[];const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('cruiseStudio.project'))projectWrites.push(k);return set.call(this,k,v);};});
 await page.goto(url);await page.waitForFunction(()=>!!CruiseStudio.entryAuth&&!!CruiseStudio.portPC);return {browser,page,requests,errors};
}
test('packaged release has no Project APIs, future URL/module/command entry or Project background writes',async()=>{
 const f=await fixture(),p=f.page;try{
  for(const id of ['sheetCruise','preDtm','practice','gear','myApps','news','series'])assert.equal(await p.evaluate(id=>CruiseStudio.shellHost.navigate(id),id),false);
  assert.deepEqual(await p.evaluate(()=>['model','repository','sessions','documents','identityHost','preDtm','metronomeM1'].filter(k=>CruiseStudio[k])),[]);
  assert.equal(await p.evaluate(()=>CruiseStudio.shellHost.commands.execute('studio.save').consumed),false);
  await p.evaluate(()=>location.hash='#sheetCruise');assert.equal(await p.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),'home');
  for(const path of ['development.html','js/app.js','js/core/project-repository.js','js/cloud/cloud-panel.mjs','js/cloud/studio-sync-client.mjs','js/modules/pre-dtm-cruise/pre-dtm.js'])assert.equal(await p.evaluate(path=>fetch(path).then(r=>r.status),path),404,path);
  assert.equal(await p.evaluate(()=>localStorage.getItem('cruiseStudio.project.future-song')),'synthetic-keep');assert.deepEqual(await p.evaluate(()=>projectWrites),[]);
  assert.deepEqual(await p.evaluate(async()=>(await indexedDB.databases()).filter(x=>x.name.startsWith('cruiseStudio.')).map(x=>x.name)),[]);
  assert(!f.requests.some(p=>p.startsWith('/v2/studio/')||p.startsWith('/isolated/studio/')));assert.deepEqual(f.errors,[]);
 }finally{await f.browser.close();}
});
test('release central/right single-owner UI, central unsaved refresh guard, five themes and four widths',async()=>{
 const f=await fixture(),p=f.page;fs.mkdirSync(shots,{recursive:true});try{
  await p.locator('[data-home-workspace=portMyApps]').click();await p.waitForFunction(()=>document.querySelector('#port-my-apps-surface iframe')?.contentDocument?.body?.dataset.componentState==='ready');const frame=p.frameLocator('#port-my-apps-surface iframe');
  await frame.locator('#my-apps-add').click();await frame.locator('#my-apps-name').fill('Keep central form');
  await p.locator('#studio-refresh').evaluate(e=>e.click());assert.match(await p.locator('#studio-refresh-status').innerText(),/編集中/);assert.equal(await frame.locator('#my-apps-name').inputValue(),'Keep central form');
  await p.evaluate(()=>CruiseStudio.shellHost.navigate('home'));await p.locator('[data-leave-action=discard]').click();
  await p.locator('[data-studio-cruise-app=pitch]').click();await p.frameLocator('#series-pitch-surface iframe').locator('#home-settings-btn').waitFor();
  await p.evaluate(()=>window.originalApp=document.querySelector('#series-pitch-surface iframe'));
  await p.locator('#screen-app-pitch [data-open-tool]').click();assert.equal(await p.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),'home');
  assert(await p.evaluate(()=>originalApp===document.querySelector('#tool-window-slot iframe')));
  for(const theme of ['dark','midnight','charcoal','gray','light']){
   await p.evaluate(t=>CruiseStudio.colorTheme.setColorTheme(t),theme);await p.frameLocator('#tool-window-slot iframe').locator('html[data-studio-theme='+theme+']').waitFor();
   for(const width of [1440,1024,768,390]){await p.setViewportSize({width,height:1000});await p.evaluate(()=>new Promise(requestAnimationFrame));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:shots+'/'+theme+'-'+width+'.png'});}
  }
  await p.setViewportSize({width:1440,height:1000});const resize=p.locator('#tool-window-resize'),box=await resize.boundingBox();await p.mouse.move(box.x+2,box.y+120);await p.mouse.down();await p.mouse.move(box.x-80,box.y+120);await p.mouse.up();
  assert(await p.evaluate(()=>originalApp===document.querySelector('#tool-window-slot iframe')));
  await p.locator('#studio-tool-toggle').click();assert.equal(await p.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),'home');
  await p.locator('[data-port-sync-status] button').click();await p.frameLocator('#port-sync-surface iframe').locator('#sync-center-view:not([hidden])').waitFor();
  assert.deepEqual(f.errors,[]);assert.equal(await p.evaluate(()=>localStorage.getItem('cruiseStudio.project.future-song')),'synthetic-keep');
 }finally{await f.browser.close();}
});

test('canonical five Port Pro tools retain a single ready frame in the right pane and do not save projected themes',async()=>{
 const f=await fixture(),p=f.page;try{
  for(const [id,surface,view] of [['tuner','port-tuner-surface','tuner-view'],['metronome','port-metronome-surface','metronome-view'],['portPractice','port-practice-surface','practice-list-view'],['portGear','port-gear-surface','wishlist-view'],['portMyApps','port-my-apps-surface','home-view']]){
   await p.evaluate(id=>CruiseStudio.shellHost.navigate(id),id);
   await p.waitForFunction(surface=>document.querySelector('#'+surface+' iframe')?.contentDocument?.body?.dataset.componentState==='ready',surface);
   const frame=p.frameLocator('#'+surface+' iframe');await frame.locator('#'+view+':not([hidden])').waitFor();
   await p.evaluate(surface=>window.originalPort=document.querySelector('#'+surface+' iframe'),surface);
   const settings=await p.evaluate(()=>localStorage.getItem('cruisePort.settings'));
   await p.locator('#'+({tuner:'screen-tuner',metronome:'screen-metronome',portPractice:'screen-port-practice',portGear:'screen-port-gear',portMyApps:'screen-port-my-apps'}[id])+' [data-open-tool]').click();
   assert(await p.evaluate(()=>originalPort===document.querySelector('#tool-window-slot iframe')));
   assert.equal(await p.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),'home');
   for(const theme of ['dark','midnight','charcoal','gray','light']){
    await p.evaluate(t=>CruiseStudio.colorTheme.setColorTheme(t),theme);await frame.locator('html[data-studio-theme='+theme+']').waitFor();
    assert.equal(await p.evaluate(()=>localStorage.getItem('cruisePort.settings')),settings);
   }
   for(const width of [1440,1024,768,390]){await p.setViewportSize({width,height:1000});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await p.locator('#studio-tool-toggle').isVisible());}
   await p.locator('#shell-audio-stop').click();await p.locator('#studio-tool-toggle').click();assert.equal(await p.locator('#'+surface+' iframe').count(),0);
   await p.setViewportSize({width:1440,height:1000});
  }
  assert.deepEqual(f.errors,[]);
 }finally{await f.browser.close();}
});

test('Account Sync stays in the current Port owner and back survives a native document reload',async()=>{
 const f=await fixture(),p=f.page;try{
  for(const [workspace,surface,route]of [['portPractice','port-practice-surface','#practice-menu'],['portGear','port-gear-surface','#wishlist'],['portMyApps','port-my-apps-surface','']]){
   await p.locator('[data-workspace='+workspace+']').click();await p.waitForFunction(id=>document.querySelector('#'+id+' iframe')?.contentDocument?.body?.dataset.componentState==='ready',surface);
   const handle=await p.locator('#'+surface+' iframe').elementHandle(),frame=await handle.contentFrame();
   await p.locator('.studio-nav [data-workspace=portSync]').click();await frame.locator('#sync-center-view:not([hidden])').waitFor();
   assert.equal(await p.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),workspace);
   await frame.goto(frame.url());await frame.waitForFunction(()=>document.body.dataset.componentState==='ready');
   await frame.locator('#sync-center-back').click();await frame.waitForFunction(hash=>location.hash===hash,route);
   assert.equal(await p.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),workspace);
   assert.equal(await p.locator('#'+surface+' iframe').evaluate((node,old)=>node===old,handle),true);
  }
  assert.deepEqual(f.errors,[]);
 }finally{await f.browser.close();}
});
