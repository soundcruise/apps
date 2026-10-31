const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright');
test('Studio Pro uploads, crops, reopens, recrops and removes Gear/My Apps image bodies',async()=>{
 const url=process.env.STUDIO_URL;assert(url);const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
 const p=await context.newPage();p.setDefaultTimeout(12000);p.on('dialog',d=>d.accept());const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try {
 await p.goto(url);await p.waitForFunction(()=>!!CruiseStudio.shellHost);
 const png=Buffer.from(await p.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=160;const x=c.getContext('2d');x.fillStyle='#b99045';x.fillRect(0,0,240,160);x.fillStyle='#132035';x.fillRect(30,30,60,60);return c.toDataURL().split(',')[1];}),'base64');
 const file={name:'synthetic.png',mimeType:'image/png',buffer:png};
 const configs=[{route:'portGear',surface:'gear',input:'gear-photo-input',crop:'gear-photo-crop-confirm',key:'cruisePort.gearList',final:'photoId',source:'photoSourceId',db:'cruisePortGear',store:'photos'},{route:'portMyApps',surface:'my-apps',input:'my-apps-icon-input',crop:'my-apps-crop-confirm',key:'cruisePort.myApps',final:'iconId',source:'iconSourceId',db:'cruisePortMyApps',store:'icons'}];
 for(const c of configs){
  await p.evaluate(route=>CruiseStudio.shellHost.navigate(route),c.route);const f=p.frameLocator('#port-'+c.surface+'-surface iframe');
  const gear=c.surface==='gear';await f.locator(gear?'#gear-list-title-add':'#my-apps-add').click();
  await f.locator(gear?'#gear-name':'#my-apps-name').fill('Synthetic image');
  if(gear){await f.locator('#gear-category').selectOption('guitar');await f.locator('#gear-status').selectOption('owned');}else{await f.locator('#my-apps-other-urls summary').click();await f.locator('#my-apps-web-url').fill('https://example.invalid/image');}
  await f.locator('#'+c.input).setInputFiles(file);await f.locator('#'+c.crop).click();
  await f.locator(gear?'#gear-list-form button[type=submit]':'#my-apps-submit').click();
  await p.waitForFunction(k=>JSON.parse(localStorage.getItem(k)||'{}').items?.length===1,c.key);
  const saved=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).items[0],c.key);assert(saved[c.final]);assert(saved[c.source]);
  await p.reload();await p.waitForFunction(()=>!!CruiseStudio.shellHost);await p.evaluate(route=>CruiseStudio.shellHost.navigate(route),c.route);
  if(gear){await f.locator('[data-gear-card-id]').first().click();await f.locator('#gear-photo-readjust').click();}else{await f.locator('#my-apps-manage').click();await f.locator('.my-app-edit-button').click();await f.locator('#my-apps-icon-preview').click();}
  await f.locator('#'+c.crop).click();await f.locator(gear?'#gear-photo-remove':'#my-apps-icon-remove').click();
  await f.locator(gear?'#gear-list-form button[type=submit]':'#my-apps-submit').click();
  await p.waitForFunction(({key,field})=>JSON.parse(localStorage.getItem(key)).items[0][field]===null,{key:c.key,field:c.final});
  const bodies=await p.evaluate(({db,store,ids})=>new Promise((resolve,reject)=>{const request=indexedDB.open(db);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const database=request.result;Promise.all(ids.map(id=>new Promise(done=>{const q=database.transaction(store).objectStore(store).get(id);q.onsuccess=()=>done(!!q.result);}))).then(values=>{database.close();resolve(values);});}}),{db:c.db,store:c.store,ids:[saved[c.final],saved[c.source]]});assert.deepEqual(bodies,[false,false]);
  const remaining=await p.evaluate(({db,store})=>new Promise((resolve,reject)=>{const q=indexedDB.open(db);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const d=q.result,r=d.transaction(store).objectStore(store).getAllKeys();r.onsuccess=()=>{d.close();resolve(r.result);};};}),{db:c.db,store:c.store});assert.deepEqual(remaining,[]);
  await p.evaluate(()=>CruiseStudio.shellHost.navigate('home'));
 }
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
