// Isolated Chrome, synthetic Pro server, no Account or production requests.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.argv[2] || 'http://127.0.0.1:8766';
const output = process.argv[3] || '/private/tmp/port-readiness-core-browser.json';
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const result={cases:[],errors:[],missing:[],syncRequests:[]};
 try {
 for(const width of [1280,393]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.addInitScript(()=>{
   if(!localStorage.getItem('soundCruiseProAuth'))localStorage.setItem('soundCruiseProAuth',JSON.stringify({v:2,generation:1,credential:'scp1.00000000-0000-4000-8000-000000000000.'+'A'.repeat(43),validatedAt:Date.now()}));
  });
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname==='/__cruise_preview/news'||u.pathname==='/v1/news')return route.fulfill({json:{contractVersion:1,items:[],nextOffset:null}});
   if(u.origin===origin)return route.continue();
   if(u.pathname.includes('/v2/pro-auth/')){
    let body={ok:true,generation:1,legacyCompatibilityEnabled:false};
    if(u.pathname.endsWith('/challenge'))body={...body,message:'isolated test challenge',challenge:'fixture',mac:'fixture'};
    if(u.pathname.endsWith('/renew')){
     const now=Date.now(),day=86400000;
     body.session={version:3,devicePublicKey:route.request().postDataJSON().publicKey,serverTime:now,issuedAt:now,boundAt:now,lastValidatedAt:now,inactiveExpiresAt:now+90*day,accessExpiresAt:now+7*day,offlineUntil:now+7*day,revalidateAfter:now+12*3600000};
    }
    return route.fulfill({json:body});
   }
   if(u.pathname.includes('/v1/sync/')||u.pathname.includes('/v2/accounts/'))result.syncRequests.push(u.pathname);
   return route.fulfill({status:200,contentType:route.request().resourceType()==='stylesheet'?'text/css':'application/json',body:route.request().resourceType()==='stylesheet'?'':'{}'});
  });
  const page=await context.newPage();page.setDefaultTimeout(8000);
  page.on('dialog',d=>d.accept());page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
  page.on('response',r=>{if(r.status()===404&&r.url().startsWith(origin))result.missing.push(r.url());});
  const go=async(hash,selector)=>{await page.evaluate(h=>location.hash=h,hash);await page.locator(selector).waitFor({state:'visible'});};
  const saved=async(key,property,value)=>page.waitForFunction(({key,property,value})=>JSON.parse(localStorage.getItem(key)||'null')?.[property]===value,{key,property,value});
  await page.goto(origin+'/apps/cruise-port/pro_9a3943176561/',{waitUntil:'networkidle'});
  await page.locator('.port-app-version-display').first().filter({hasText:/Ver 1\.22\./}).waitFor();
  result.cases.push({width,case:'Home / mock formal Pro',pass:true});
  await go('#metronome','#metronome-view');await page.locator('#metronome-bpm').fill('137');await page.locator('#metronome-bpm').dispatchEvent('change');await saved('cruisePort.metronome','bpm',137);
  await page.locator('#metronome-preset-save-open').click();await page.locator('#metronome-preset-name').fill('Readiness QA');await page.locator('#metronome-preset-save').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.metronomePresets')||'{}').items?.length===1);
  const id=await page.evaluate(()=>JSON.parse(localStorage.getItem('cruisePort.metronomePresets')).items[0].id);
  await page.locator('#metronome-bpm').fill('150');await page.locator('#metronome-bpm').dispatchEvent('change');await saved('cruisePort.metronome','bpm',150);
  await page.locator('#metronome-preset-select').selectOption(id);await saved('cruisePort.metronome','bpm',137);
  await page.locator('#metronome-preset-delete').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.metronomePresets')).items.length===0);
  assert.equal(await page.evaluate(id=>typeof JSON.parse(localStorage.getItem('cruisePort.syncDeletionIntent.v1'))['metronome_preset/'+id].generation,id),'string');
  result.cases.push({width,case:'Metronome save / preset create apply delete',pass:true});
  await go('#tuner','#tuner-view');await page.locator('#tuner-input-settings-toggle').click();await page.locator('#tuner-threshold').fill('-75');await page.locator('#tuner-threshold').dispatchEvent('change');await saved('cruisePort.tuner','thresholdDb',-75);
  result.cases.push({width,case:'Tuner save',pass:true});
  await go('#practice-menu/new','#practice-form-view');await page.locator('#practice-name-preset').selectOption('custom');await page.locator('#practice-name').fill('Core QA');await page.locator('#practice-menu-form').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.practiceMenus')||'{}').items?.some(i=>i.name==='Core QA'));
  const menuId=await page.evaluate(()=>JSON.parse(localStorage.getItem('cruisePort.practiceMenus')).items.find(i=>i.name==='Core QA').id);
  await go('#practice-menu/'+menuId+'/edit','#practice-form-view');await page.locator('#practice-memo').fill('retained edit');await page.locator('#practice-menu-form').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.practiceMenus')).items.some(i=>i.memo==='retained edit'));
  result.cases.push({width,case:'Practice create/edit',pass:true});
  await go('#practice-menu/calendar','#practice-history-view');await page.locator('#practice-calendar-note-add').click();await page.locator('#practice-calendar-note-text').fill('Core calendar');await page.locator('#practice-calendar-note-form').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.practiceCalendar')||'{}').notes?.length>0);
  result.cases.push({width,case:'Calendar save',pass:true});
  await go('#wishlist','#wishlist-view');await page.locator('#gear-list-title-add').click();await page.locator('#gear-name').fill('Core Gear');await page.locator('#gear-category').selectOption('guitar');await page.locator('#gear-name').evaluate(e=>e.form.requestSubmit());
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.gearList')||'{}').items?.some(i=>i.name==='Core Gear'));
  result.cases.push({width,case:'Gear save',pass:true});
  await go('#my-apps/new','#my-apps-form-view');await page.locator('#my-apps-name').fill('Core My App');await page.locator('#my-apps-other-urls summary').click();await page.locator('#my-apps-web-url').fill('https://example.invalid/core');await page.locator('#my-apps-form').evaluate(f=>f.requestSubmit());
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.myApps')||'{}').items?.some(i=>i.name==='Core My App'));
  result.cases.push({width,case:'My Apps save',pass:true});
  const binary = await page.evaluate(async menuId=>{
   const [G,I,A,L,M]=await Promise.all([import('../gear-photo-store.js?v=1.22.14'),import('../my-apps-icon-store.js?v=1.22.14'),import('../practice-menu-attachment-store.js?v=1.22.14'),import('../gear-list-store.js?v=1.22.14'),import('../my-apps-store.js?v=1.22.14')]);
   const canvas=document.createElement('canvas');canvas.width=canvas.height=2;canvas.getContext('2d').fillRect(0,0,2,2);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   const g=await G.createGearPhotoStore({canWrite:()=>true}).savePhoto(blob,{kind:'final',width:2,height:2});
   const source=await G.createGearPhotoStore({canWrite:()=>true}).savePhoto(blob,{kind:'source',width:2,height:2});
   const i=await I.createMyAppsIconStore({canWrite:()=>true}).saveIcon(blob);
   const a=await A.createPracticeAttachmentStore({canWrite:()=>true}).addAttachment(menuId,new Blob(['asset lifecycle regression'],{type:'text/plain'}),{fileName:'lifecycle.txt'});
   if(!g.ok||!source.ok||!i.ok||!a.ok)throw Error('binary fixture save failed');
   const gear=L.loadGearList(localStorage);Object.assign(gear.items.find(x=>x.name==='Core Gear'),{photoId:g.record.id,photoSourceId:source.record.id,photoCrop:{x:0,y:0,size:1}});
   const apps=M.loadMyApps(localStorage);const app=apps.items.find(x=>x.name==='Core My App');app.iconId=i.record.id;app.iconPresetKey=null;
   const gearSaved=await L.saveGearList(gear.items,localStorage),appSaved=await M.saveMyApps(apps.items,localStorage);
   if(!gearSaved.ok||!appSaved.ok)throw Error('owner reference save failed '+JSON.stringify({gear:gearSaved.reason,app:appSaved.reason}));
   return {gear:g.record.id,icon:i.record.id,attachment:a.record.id,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
  },menuId);
  await page.reload({waitUntil:'networkidle'});
  await go('#wishlist','#wishlist-view');
  await page.waitForFunction(()=>[...document.querySelectorAll('#wishlist-view img[src^="blob:"]')].some(i=>i.complete&&i.naturalWidth===2));
  result.cases.push({width,case:'Gear image reference survives reload',pass:true});
  await go('#my-apps/manage','#my-apps-manage-view');
  await page.waitForFunction(()=>[...document.querySelectorAll('#my-apps-manage-view img[src^="blob:"]')].some(i=>i.complete&&i.naturalWidth===2));
  result.cases.push({width,case:'My Apps icon reference survives reload',pass:true});
  await go('#practice-menu/'+menuId,'#practice-detail-view');
  await page.locator('#practice-attachments-list').getByText('lifecycle.txt',{exact:true}).waitFor();
  const preserved=await page.evaluate(async ids=>{
   const [G,I,A]=await Promise.all([import('../gear-photo-store.js?v=1.22.14'),import('../my-apps-icon-store.js?v=1.22.14'),import('../practice-menu-attachment-store.js?v=1.22.14')]);
   const g=await G.createGearPhotoStore().getPhoto(ids.gear),i=await I.createMyAppsIconStore().getIcon(ids.icon),a=await A.createPracticeAttachmentStore().getAttachment(ids.attachment);
   return {gear:Array.from(new Uint8Array(await g.record.blob.arrayBuffer())),icon:Array.from(new Uint8Array(await i.record.blob.arrayBuffer())),attachment:await a.record.blob.text()};
  },binary);
  assert.deepEqual(preserved,{gear:binary.bytes,icon:binary.bytes,attachment:'asset lifecycle regression'});
  result.cases.push({width,case:'Practice attachment owner and all binary bytes preserved',pass:true});
  await go('#settings','#settings-view');for(const theme of ['light','gray','charcoal','dark']) {await page.locator(`[data-theme-choice="${theme}"]`).click();await saved('cruisePort.settings','theme',theme);}
  result.cases.push({width,case:'Settings / Theme save',pass:true});
  await page.evaluate(async()=>{
   await SoundCruiseSyncAccount.storage.setAccount({accountId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',accountDeviceId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',accountCredential:'sca1.bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.'+'A'.repeat(43)});
  });
  await go('#sync-center','#sync-center-view');
  await page.locator('#port-sync-activate').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>Boolean(SoundCruiseMultiAppSync.runtimes?.port)),false,'status screen must not create/start runtime');
  result.cases.push({width,case:'Account/Sync with saved Account: status-only no activation/network',pass:true});
  await go('#home','#home-view');
  const before=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('cruisePort.'))));
  await page.reload({waitUntil:'networkidle'});await page.locator('#home-view').waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('cruisePort.')))),before,'read-only reload must preserve all dataset bytes');
  result.cases.push({width,case:'read-only fixture reload byte equality',pass:true});
  await context.close();
 }
 assert.deepEqual(result.errors,[]);assert.deepEqual(result.missing,[]);assert.deepEqual(result.syncRequests,[]);result.result='PASS';
 }catch(e){result.result='FAIL';result.failure=e.stack;process.exitCode=1;}finally{fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
