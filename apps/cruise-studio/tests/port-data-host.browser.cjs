const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.HOST_ORIGIN||'http://127.0.0.1:8766';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const result={cases:[],errors:[],missing:[],api:[]};
 try {
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base)return route.continue();if(url.hostname==='fonts.googleapis.com')return route.fulfill({body:'',contentType:'text/css'});result.api.push(url.href);return route.abort();});
  await context.addInitScript(()=>{
   window.__sentinel={opens:0,writes:0,fetches:0};const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...a)=>{__sentinel.opens++;return open(...a);};
   for(const name of ['put','add','delete','clear']){const original=IDBObjectStore.prototype[name];IDBObjectStore.prototype[name]=function(...a){__sentinel.writes++;return original.apply(this,a);};}
   window.fetch=()=>{__sentinel.fetches++;throw Error('Unexpected data network');};
   window.__rawPort=()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('cruisePort.')||k==='soundCruiseProAuth'));
  });
  const p=await context.newPage();p.setDefaultTimeout(10000);
  p.on('pageerror',e=>result.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});p.on('response',r=>{if(r.status()===404)result.missing.push(r.url());});
  await p.goto(base+'/apps/cruise-studio/',{waitUntil:'networkidle'});
  await p.waitForFunction(()=>!!CruiseStudio.portDataHost);
  assert.deepEqual(await p.evaluate(()=>__sentinel),{opens:0,writes:0,fetches:0});
  await p.click('#shell-tool');await p.locator('#studio-port-read').waitFor({state:'visible'});
  assert.equal(await p.locator('[data-port-sync]').innerText(),'未確認');
  result.cases.push('startup/cache/subscription zero DB/network');
  // Once definitions are loaded, spy on activation entry points and verify an
  // additional cached Host/pane consumer never acquires an owner or starts Sync.
  await p.evaluate(async()=>{
   const {createPortDataHost}=await import('/apps/cruise-studio/js/port-data/host.mjs');
   const {connectPortReadOnly}=await import('/apps/cruise-studio/js/port-data/connection.mjs');
   const connection=await connectPortReadOnly(()=>{});connection.dispose();
   const counter=globalThis.__activation={owner:0,ensure:0,provision:0,bootstrap:0,push:0,pull:0};
   const ns=SoundCruisePortSync, acquire=ns.createPortSyncController;
   ns.createPortSyncController=function(options){if(!options?.readOnly)counter.owner++;const handle=acquire(options);if(!handle.ensure)return handle;return new Proxy(handle,{get(target,key){if(key==='ensure')return (...args)=>{counter.ensure++;return target.ensure(...args);};return target[key];}});};
   const client=SoundCruiseSyncAccount.AccountClient.prototype;
   const provision=client.provisionPortDevice;client.provisionPortDevice=function(...args){counter.provision++;return provision.apply(this,args);};
   for(const name of ['bootstrap','pushRequest','serverSnapshot']){const original=SoundCruiseMultiAppSync.MultiAppSyncRuntime.prototype[name];SoundCruiseMultiAppSync.MultiAppSyncRuntime.prototype[name]=function(...args){counter[{bootstrap:'bootstrap',pushRequest:'push',serverSnapshot:'pull'}[name]]++;return original.apply(this,args);};}
   const before={...__sentinel};const h=createPortDataHost({schema:CruiseStudio.metronomeSchema,connect:connectPortReadOnly});h.subscribe(()=>{});h.getCachedStatus();h.getCapabilities();h.getWriteReadiness();h.dispose();
   if(JSON.stringify(before)!==JSON.stringify(__sentinel))throw Error('cached readiness has I/O');
  });
  assert.deepEqual(await p.evaluate(()=>__activation),{owner:0,ensure:0,provision:0,bootstrap:0,push:0,pull:0});

  await p.click('#studio-port-read');await p.waitForFunction(()=>CruiseStudio.portDataHost.getCachedStatus().account==='no-account-known');
  assert.equal(await p.evaluate(()=>__sentinel.writes),0);assert.equal(await p.evaluate(()=>CruiseStudio.portDataHost.getCachedStatus().pro),'standard');
  assert.deepEqual(await p.evaluate(async()=>(await indexedDB.databases()).filter(d=>/sound-cruise/.test(d.name))),[]);
  result.cases.push('no Account / Standard / absent databases not created');
  await p.evaluate(()=>{
   const raw={...CruiseStudio.metronomeSchema.defaults(),bpm:167,sound:'analog',unknown:{keep:true}};
   localStorage.setItem('cruisePort.metronome',JSON.stringify(raw));
   localStorage.setItem('cruisePort.metronomePresets',JSON.stringify({version:1,unknown:'keep',items:[{...raw,id:'b',name:'Second'},{...raw,id:'a',name:'First'}]}));
  });
  const before=await p.evaluate(()=>__rawPort());await p.click('#studio-port-read');await p.waitForFunction(()=>CruiseStudio.portDataHost.getCachedStatus().dataset?.settings.savedBpm===167);
  assert.deepEqual(await p.evaluate(()=>__rawPort()),before);
  assert.equal(await p.evaluate(()=>CruiseStudio.portDataHost.getCachedStatus().dataset.settings.effective.sound),'electronic');
  assert.deepEqual(await p.evaluate(()=>CruiseStudio.portDataHost.getCachedStatus().dataset.presets.map(x=>x.id)),['b','a']);
  assert.equal(await p.evaluate(()=>CruiseStudio.metronomeSettingsController.snapshot().effectiveSettings.bpm),120);
  result.cases.push('raw unknown preservation / Standard effective / ordered stable presets / M2 untouched');
  // Fixture writes are explicit and outside the sentinel interval.
  await p.evaluate(async()=>{
   window.__put=async(name,store,key,value)=>new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore(store);r.onsuccess=()=>{const db=r.result,t=db.transaction(store,'readwrite');t.objectStore(store).put(value,key);t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};r.onerror=()=>reject(r.error);});
   window.__account=id=>({accountId:id,accountDeviceId:id,accountCredential:'sca1.'+id+'.'+'A'.repeat(43)});
   window.__A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';window.__B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
   await __put('sound-cruise-sync-account','meta','account',__account(__A));
   const db='sound-cruise-sync-data-port-account-'+__A;
   await new Promise((resolve,reject)=>{const r=indexedDB.open(db,1);r.onupgradeneeded=()=>{for(const n of ['meta','outbox','shadow','conflicts'])r.result.createObjectStore(n);};r.onsuccess=()=>{r.result.close();resolve();};r.onerror=()=>reject(r.error);});
   await __put(db,'meta','credential',{value:'scd1.'+__A+'.'+'B'.repeat(43)});
   await __put(db,'meta','membership',{value:{state:'active'}});await __put(db,'conflicts','conflict',{id:'conflict'});
   window.__dump=async()=>{const out={};for(const item of await indexedDB.databases()){if(!item.name.startsWith('sound-cruise'))continue;out[item.name]=await new Promise((resolve,reject)=>{const r=indexedDB.open(item.name);r.onsuccess=async()=>{const db=r.result,result={};for(const name of db.objectStoreNames)result[name]=await new Promise((done,fail)=>{const t=db.transaction(name),s=t.objectStore(name),k=s.getAllKeys(),v=s.getAll();t.oncomplete=()=>done({keys:k.result,values:v.result});t.onerror=()=>fail(t.error);});db.close();resolve(result);};r.onerror=()=>reject(r.error);});}return out;};
  });
  const dbBefore=await p.evaluate(()=>__dump());const writes=await p.evaluate(()=>__sentinel.writes);
  await p.click('#studio-port-read');await p.waitForFunction(()=>CruiseStudio.portDataHost.getCachedStatus().sync==='conflict');
  assert.deepEqual(await p.evaluate(()=>__dump()),dbBefore);assert.equal(await p.evaluate(()=>__sentinel.writes),writes);
  assert.equal(await p.evaluate(()=>!!SoundCruiseMultiAppSync.runtimes?.port),false);
  result.cases.push('Account/membership/conflict status; Account and Sync DB unchanged; runtime absent');
  await p.evaluate(async()=>{
   await import('/apps/shared/pro-device-session.js');
   const read=async key=>(await import('/apps/cruise-studio/js/port-data/connection.mjs')).readExisting(indexedDB,'sound-cruise-pro-device-session-v1','state',key);
   const store={read,write:(k,v)=>__put('sound-cruise-pro-device-session-v1','state',k,v),install:async(k,v)=>{const old=await read(k);if(old)return old;await __put('sound-cruise-pro-device-session-v1','state',k,v);return v;},compareAndSwap:async(k,e,v)=>{await __put('sound-cruise-pro-device-session-v1','state',k,v);return true;}};
   const client=SoundCruiseProDeviceSession.createClient({store});const devicePublicKey=await client.publicKey(),now=Date.now();
   const auth={v:2,credential:'scp1.'+__A+'.'+'C'.repeat(43),generation:1};
   await client.accept(auth,{version:3,serverTime:now,issuedAt:now,boundAt:now,lastValidatedAt:now,inactiveExpiresAt:now+90*86400000,accessExpiresAt:now+7*86400000,offlineUntil:now+7*86400000,revalidateAfter:now+43200000,devicePublicKey});
   localStorage.setItem('soundCruiseProAuth',JSON.stringify(auth));
  });
  const proWrites=await p.evaluate(()=>__sentinel.writes);await p.click('#studio-port-read');await p.waitForFunction(()=>CruiseStudio.portDataHost.getCachedStatus().pro==='cached-valid');
  assert.equal(await p.evaluate(()=>__sentinel.writes),proWrites);assert.equal(await p.evaluate(()=>CruiseStudio.portDataHost.getCachedStatus().dataset.settings.effective.sound),'analog');
  await context.setOffline(true);await p.click('#studio-port-read');assert.equal(await p.evaluate(()=>CruiseStudio.portDataHost.getCachedStatus().pro),'cached-valid');await context.setOffline(false);
  result.cases.push('formal cached receipt verified without refresh/write; offline Pro read');
  await p.evaluate(async()=>{const CS=CruiseStudio, project=CS.model.createSampleProject();await CS.repository.save({target:{type:'project',projectId:project.projectId},snapshot:project,baseRevision:null});CS.storage.setCurrentProjectId(project.projectId);CS.sheetCruise.load(project.projectId);CS.shellHost.navigate('sheetCruise');CS.sessions.getActiveSession().draft.songInfo.title='Host must preserve this draft';window.__structureBefore=JSON.stringify(CS.sheetCruise.getSession());});
  await p.click('#shell-dock-toggle');await p.locator('#studio-metronome-bpm').fill('150');await p.locator('#studio-metronome-bpm').press('Tab');await p.click('#studio-metronome-start');await p.waitForFunction(()=>CruiseStudio.metronomeM1.snapshot().running);
  const other=await context.newPage();await other.goto(base+'/apps/cruise-studio/');await other.waitForFunction(()=>!!CruiseStudio.portDataHost);
  // Port repository writer in a second same-origin tab; only this tab writes.
  await other.evaluate(async()=>{window.repoModule=await import('/apps/cruise-port/port-dataset-repository.js');window.portRepo=new repoModule.PortDatasetRepository({storage:localStorage});await portRepo.runWrite({expectedRevision:(await portRepo.readDatasetState()).revision},tx=>{const v=JSON.parse(tx.getItem('cruisePort.metronome'));v.bpm=188;tx.setItem('cruisePort.metronome',JSON.stringify(v));return {};});});
  await p.waitForFunction(()=>CruiseStudio.portDataHost.getCachedStatus().dataset?.settings.savedBpm===188);
  assert.equal(await p.evaluate(()=>CruiseStudio.metronomeSettingsController.snapshot().effectiveSettings.bpm),150);
  assert.equal(await p.evaluate(()=>CruiseStudio.metronomeM1.snapshot().running),true);
  assert.equal(await p.evaluate(()=>JSON.stringify(CruiseStudio.sheetCruise.getSession())===__structureBefore),true);
  await other.evaluate(async()=>portRepo.runWrite({expectedRevision:(await portRepo.readDatasetState()).revision},tx=>{const v=JSON.parse(tx.getItem('cruisePort.metronomePresets'));v.items.pop();tx.setItem('cruisePort.metronomePresets',JSON.stringify(v));return {};}));
  await p.waitForFunction(()=>CruiseStudio.portDataHost.getCachedStatus().dataset?.presets.length===1);
  result.cases.push('Port writer / Studio reader simultaneous BPM and preset changes; M2 unchanged');
  await other.evaluate(async()=>{await import('/apps/shared/sync-account/sync-account-core.js');await import('/apps/shared/sync-account/sync-account-db.js');const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';await SoundCruiseSyncAccount.storage.setAccount({accountId:id,accountDeviceId:id,accountCredential:'sca1.'+id+'.'+'D'.repeat(43)});const data=JSON.parse(localStorage.getItem('cruisePort.metronome'));data.bpm=199;localStorage.setItem('cruisePort.metronome',JSON.stringify(data));localStorage.removeItem('soundCruiseProAuth');});
  await p.waitForFunction(()=>{const s=CruiseStudio.portDataHost.getCachedStatus();return s.accountId===__B&&s.dataset?.settings.savedBpm===199&&s.pro==='standard';});
  assert.equal(await p.evaluate(()=>CruiseStudio.portDataHost.getCachedStatus().sync),'unknown');
  result.cases.push('Account A→B clears old conflict/status and binds fresh result');
  await other.evaluate(()=>localStorage.setItem('cruisePort.metronome',JSON.stringify({version:999,bpm:221,future:'keep'})));
  await p.waitForFunction(()=>CruiseStudio.portDataHost.getCachedStatus().dataset?.settings.schemaState==='forward-incompatible');
  assert.equal(await p.evaluate(()=>CruiseStudio.portDataHost.getCachedStatus().canWrite),false);
  result.cases.push('forward-incompatible read-only display');
  for(const theme of ['light','gray','charcoal','dark']){await p.evaluate(t=>CruiseStudio.colorTheme.setColorTheme(t),theme);assert(await p.locator('#studio-port-data-title').isVisible());}
  await p.screenshot({path:'/private/tmp/studio-port-host-panel.png',fullPage:true});
  await p.locator('#studio-port-read').focus();await p.keyboard.press('Tab');
  await p.emulateMedia({media:'print'});assert.equal(await p.locator('#studio-port-data').isVisible(),false);await p.emulateMedia({media:'screen'});
  result.cases.push('four semantic themes / keyboard focus / print exclusion');
  await p.evaluate(async()=>{
   const {createPortDataHost}=await import('/apps/cruise-studio/js/port-data/host.mjs');const {connectPortReadOnly}=await import('/apps/cruise-studio/js/port-data/connection.mjs');
   const add=window.addEventListener,remove=window.removeEventListener;let count=0;
   window.addEventListener=function(...a){count++;return add.apply(this,a);};window.removeEventListener=function(...a){count--;return remove.apply(this,a);};
   try {for(let i=0;i<50;i++){const h=createPortDataHost({schema:CruiseStudio.metronomeSchema,connect:connectPortReadOnly});await h.readLocalStatus();h.dispose();h.dispose();}if(count!==0)throw Error('listener leak '+count);}finally{window.addEventListener=add;window.removeEventListener=remove;}
  });
  assert.equal(await p.evaluate(()=>__sentinel.fetches),0);result.cases.push('50 real mounts/unmounts; no listener growth; no API requests');
  await context.close();assert.deepEqual(result.errors,[]);assert.deepEqual(result.missing,[]);assert.deepEqual(result.api,[]);result.result='PASS';
 } catch(e){result.result='FAIL';result.failure=e.stack;process.exitCode=1;}finally{fs.writeFileSync('/private/tmp/studio-port-host-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();}
})();
