// Disposable Chrome and native local D1/R2 only. No Cloudflare credentials/network.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
import {backendFixture,DEVICE_PEPPER} from '../../../workers/sound-cruise-sync/test/account-save-transaction-fixture.js';
import {TEST_PRO_PEPPER} from '../../../workers/sound-cruise-sync/test/pro-entitlement-fixture.js';
import {handleRequest} from '../../../workers/sound-cruise-sync/src/app.js';
const require=createRequire(process.env.STUDIO_TEST_RUNTIME),{chromium}=require('playwright'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const OUT=process.env.PORT_ATTRIBUTION_OUTPUT;assert(OUT);const W=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const tests=[],errors=[],blocked=[],contexts=[];let browser,mf,seed,second;
const check=async(name,work)=>{await work();tests.push({name,status:'PASS'});console.log('PASS '+name);};
async function profile(studio=false){
 const context=await browser.newContext({serviceWorkers:'block'});contexts.push(context);
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!=='https://port.fixture.invalid'){blocked.push(u.origin);return route.abort();}
  if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:'<!doctype html><main id="sync"></main><script src="/apps/shared/sync-account/sync-account-db.js"></script><script src="/apps/cruise-port/port-sync-adapter.js"></script><script src="/apps/cruise-port/port-sync-controller.js"></script>'});
  const file=path.resolve(W,'.'+u.pathname);if(!file.startsWith(W+'/'))return route.abort();try{return route.fulfill({contentType:u.pathname.endsWith('.html')?'text/html':'text/javascript',body:fs.readFileSync(file)});}catch{return route.fulfill({status:404,body:'missing'});}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
 if(studio){await page.goto('https://port.fixture.invalid/fixture');await page.setContent('<iframe src="https://port.fixture.invalid/fixture"></iframe>');const frame=page.frames().find(f=>f!==page.mainFrame());await frame.waitForFunction(()=>globalThis.SoundCruisePortSync);return{context,page,target:frame};}
 await page.goto('https://port.fixture.invalid/fixture');return{context,page,target:page};
}
async function setup(target, account='A') {return target.evaluate(async account=>{
 const shared=SoundCruiseSyncAccount.storage;if(account)await shared.setAccount({accountId:account,accountCredential:'sca1.'+account+'.synthetic'});
 const mod=await import('/apps/cruise-port/port-dataset-storage.js?v=1.26.0');await mod.initializePortWriterContext();
 const repo=mod.portRepository(localStorage);globalThis.localRepo=repo;globalThis.storeModule=mod;
 SoundCruiseSyncAccount.core={validAccountCredential:v=>v?.startsWith('sca1.'),validAppCredential:v=>v?.startsWith('scd1.'),createOperationId:()=>crypto.randomUUID(),createAppCredential:()=>({appDeviceCredential:'scd1.port.synthetic'})};
 globalThis.calls=0;
 SoundCruiseSyncAccount.AccountClient=class{async provisionPortDevice(){calls++;return{membershipId:'m'};}async devices(){return{devices:[]};}};
 const map=new Map();globalThis.dataStores=map;
 const dataStorage={createStore(_app,{accountId='legacy'}={}){if(!map.has(accountId)){const meta=new Map();map.set(accountId,{accountId,meta,async readMeta(k){return meta.get(k)??null;},async setMeta(k,v){meta.set(k,v);},async removeMeta(k){meta.delete(k);},async listOutbox(){return[];},async listShadow(){return[];},async listConflicts(){return[];}});}return map.get(accountId);}};
 class Runtime extends EventTarget{constructor(o){super();Object.assign(this,o);}runExclusive(fn){return fn(this);}async initializeDataset(){await this.assertCurrentAsync();globalThis.bootstrapped=JSON.parse(localStorage.getItem('cruisePort.gearList')||'{}');return{ok:true};}async sync(){await this.assertCurrentAsync();return{ok:true};}dispose(){}listConflictPresentations(){return[];}}
 SoundCruiseMultiAppSync={dataStorage,MultiAppSyncRuntime:Runtime};globalThis.ctrl=SoundCruisePortSync.createPortSyncController({config:{enabled:true,environment:'production',endpoint:'https://port.fixture.invalid'},canSync:()=>true});
 globalThis.attachment=(await import('/apps/cruise-port/practice-menu-attachment-store.js?v=1.26.0')).createPracticeAttachmentStore({canWrite:()=>true});
 globalThis.photos=(await import('/apps/cruise-port/gear-photo-store.js?v=1.26.0')).createGearPhotoStore({canWrite:()=>true});
 return true;
 },account);}
async function choose(target,choice='current'){return target.evaluate(async choice=>{const s=await ctrl.inspectLocalAccount();return ctrl.chooseLocalAccount({choice,snapshotId:s.snapshotId,confirmed:true});},choice);}
try{
 if(!process.env.PORT_ATTRIBUTION_NATIVE_ONLY){
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 await check('Chrome Port: existing unbound local data adopts only after explicit current choice; A to B blocked',async()=>{
  const {target}=await profile();await setup(target);await target.evaluate(()=>localStorage.setItem('cruisePort.gearList',JSON.stringify({version:5,items:[]})));
  assert.equal(await target.evaluate(async()=>{try{await ctrl.ensure();return'bad';}catch(e){return e.message;}}),'port_local_account_unconfirmed');
  await choose(target);await target.evaluate(()=>ctrl.ensure());assert.equal(await target.evaluate(()=>calls),1);
  await target.evaluate(()=>SoundCruiseSyncAccount.storage.setAccount({accountId:'B',accountCredential:'sca1.B.synthetic'}));
  assert.equal(await target.evaluate(async()=>{try{await ctrl.ensure();return'bad';}catch(e){return e.message;}}),'port_local_account_unconfirmed');
  assert.equal(await target.evaluate(()=>JSON.parse(localStorage.getItem('cruisePort.syncLocalAccount.v1')).accountId),'A');
 });
 await check('Chrome same-origin Port iframe: previous/device choices preserve bytes and remain offline from Cloud',async()=>{
  const {target}=await profile(true);await setup(target);await target.evaluate(()=>localStorage.setItem('cruisePort.gearList','retained synthetic A'));
  await choose(target,'previous');assert.equal(await target.evaluate(()=>localStorage.getItem('cruisePort.gearList')),'retained synthetic A');
  await choose(target,'device');assert.equal(await target.evaluate(()=>calls),0);
 });
 await check('Chrome real Sync Center: consent required and three visible choices; no deletion',async()=>{
  const {target}=await profile();await setup(target);
  await target.evaluate(async()=>{const {mountPortLocalAccountChoices}=await import('/apps/cruise-port/sync-center-ui.js?v=1.26.0');mountPortLocalAccountChoices(document.querySelector('#sync'),{orchestrator:{inspectPortLocalAccount:()=>ctrl.inspectLocalAccount(),choosePortLocalAccount:v=>ctrl.chooseLocalAccount(v)}});});
  await target.getByText('同期先と端末データを確認',{exact:true}).click();const adopt=target.locator('[data-port-attribution-choice="current"]');await target.waitForFunction(()=>!document.querySelector('[data-port-attribution-choice]').parentElement.hidden);
  assert.equal(await adopt.isDisabled(),true);await target.locator('[data-port-local-account] input').check();await adopt.click();
  await target.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.syncLocalAccount.v1')||'null')?.accountId==='A');
 });
 await check('Chrome two tabs reject stale consent after first tab claims A',async()=>{
  const first=await profile();await setup(first.target);const other=await first.context.newPage();await other.goto('https://port.fixture.invalid/fixture');await setup(other,null);
  const old=await other.evaluate(()=>ctrl.inspectLocalAccount());await choose(first.target);
  assert.equal(await other.evaluate(async s=>{try{await ctrl.chooseLocalAccount({choice:'current',snapshotId:s.snapshotId,confirmed:true});return'bad';}catch(e){return e.message;}},old),'port_local_account_changed');
 });
 await check('Chrome attachment/source/final changes invalidate consent; exact binary hashes retained after adoption',async()=>{
  const {target}=await profile();await setup(target);const before=await target.evaluate(()=>ctrl.inspectLocalAccount());
  const bytes=await target.evaluate(async()=>{
   const a=await attachment.addAttachment('p1',new Blob(['attachment'],{type:'text/plain'}),{fileName:'synthetic.txt'});
   const s=await photos.savePhoto(new Blob(['source'],{type:'image/webp'}),{kind:'source',width:1,height:1});
   const f=await photos.savePhoto(new Blob(['final'],{type:'image/webp'}),{kind:'final',width:1,height:1});
   globalThis.savedBinaryIds={attachment:a.record.id,source:s.record.id,final:f.record.id};return{a:a.ok,s:s.ok,f:f.ok};});assert.deepEqual(bytes,{a:true,s:true,f:true});
  assert.equal(await target.evaluate(async s=>{try{await ctrl.chooseLocalAccount({choice:'current',snapshotId:s.snapshotId,confirmed:true});return'bad';}catch(e){return e.message;}},before),'port_local_account_changed');
  await choose(target);
  const restored=await target.evaluate(async()=>{
   const records=[(await attachment.getAttachment(savedBinaryIds.attachment)).record,(await photos.getPhoto(savedBinaryIds.source)).record,(await photos.getPhoto(savedBinaryIds.final)).record];
   const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   return Promise.all(records.map(async(r,i)=>({text:await r.blob.text(),matches:await hash(await r.blob.arrayBuffer())===await hash(new TextEncoder().encode(['attachment','source','final'][i]))})));
  });assert.deepEqual(restored,[{text:'attachment',matches:true},{text:'source',matches:true},{text:'final',matches:true}]);
  const next=await target.evaluate(()=>ctrl.inspectLocalAccount());
  await target.evaluate(()=>photos.deletePhoto(savedBinaryIds.source));
  assert.equal(await target.evaluate(async s=>{try{await ctrl.chooseLocalAccount({choice:'current',snapshotId:s.snapshotId,confirmed:true});return'bad';}catch(e){return e.message;}},next),'port_local_account_changed');
 });
 await check('Chrome old form/Account switch rejects commit; reload B cannot edit A-owned dataset or attach bytes',async()=>{
  const p=await profile();await setup(p.target);await choose(p.target);
  await p.target.evaluate(()=>{storeModule.readPortStore(localStorage,v=>v.getItem('cruisePort.gearList'));});
  await p.target.evaluate(()=>SoundCruiseSyncAccount.storage.setAccount({accountId:'B',accountCredential:'sca1.B.synthetic'}));
  assert.equal(await p.target.evaluate(async()=> (await storeModule.writePortStore(localStorage,['cruisePort.gearList'],tx=>{tx.setItem('cruisePort.gearList','{}');return{ok:true};})).ok),false);
  await p.page.reload();await setup(p.target,null);
  assert.equal(await p.target.evaluate(async()=> (await attachment.addAttachment('p1',new Blob(['B'],{type:'text/plain'}),{fileName:'b.txt'})).ok),false);
  const snapshot=await p.target.evaluate(()=>ctrl.inspectLocalAccount());await p.target.evaluate(s=>ctrl.chooseLocalAccount({choice:'previous',snapshotId:s.snapshotId}),snapshot);
  assert.equal(await p.target.evaluate(()=>JSON.parse(localStorage.getItem('cruisePort.syncLocalAccount.v1')).accountId),'A');
 });
 await check('Chrome anonymous/offline local save remains available without Account adoption',async()=>{
  const {target,context}=await profile();await setup(target,null);await context.setOffline(true);
  assert.equal(await target.evaluate(async()=> (await localRepo.runWrite({expectedRevision:localRepo.inspect().revision},tx=>{tx.setItem('cruisePort.gearList',JSON.stringify({version:5,items:[]}));return{ok:true};})).ok),true);
 });
 await check('Chrome queued native binary writer rejects Account swap; failed tx releases dataset lock',async()=>{
  const {target}=await profile();await setup(target);
  await target.evaluate(()=>{globalThis.releaseLock=null;globalThis.held=navigator.locks.request('sound-cruise:port:dataset:v1',()=>new Promise(r=>{releaseLock=r;}));});
  await target.waitForFunction(()=>typeof releaseLock==='function');
  await target.evaluate(()=>{globalThis.queued=attachment.addAttachment('p',new Blob(['old A'],{type:'text/plain'}),{fileName:'a.txt'});});
  await target.evaluate(()=>SoundCruiseSyncAccount.storage.setAccount({accountId:'B',accountCredential:'sca1.B.synthetic'}));
  await target.evaluate(()=>releaseLock());assert.equal(await target.evaluate(async()=> (await queued).ok),false);
  const p=await profile();await setup(p.target);const result=await p.target.evaluate(async()=>{
   const options={fileName:'same.txt',idFactory:()=> 'same-id'};
   const first=await attachment.addAttachment('p',new Blob(['one'],{type:'text/plain'}),options);
   const failed=await attachment.addAttachment('p',new Blob(['two'],{type:'text/plain'}),options);
   const observed=await ctrl.inspectLocalAccount();await ctrl.chooseLocalAccount({choice:'current',snapshotId:observed.snapshotId,confirmed:true});
   return[first.ok,failed.ok,JSON.parse(localStorage.getItem('cruisePort.syncLocalAccount.v1')).accountId];});assert.deepEqual(result,[true,false,'A']);
 });
 await check('Chrome shared Account DB prototype disposes/recreates Project client; A UNKNOWN never sends as B',async()=>{
  const {target}=await profile();await setup(target);
  const result=await target.evaluate(async()=>{
   const {createIsolatedStudioSyncClient}=await import('/apps/cruise-studio/js/cloud/studio-sync-client.mjs');
   const A=crypto.randomUUID(),B=crypto.randomUUID(),device=crypto.randomUUID(),pro=crypto.randomUUID(),projectId=crypto.randomUUID();
   const storage=SoundCruiseSyncAccount.storage;
   await storage.setAccount({accountId:A,accountCredential:'sca1.'+device+'.synthetic'});
   const snapshot={schemaVersion:2,projectId,songInfo:{title:'synthetic Project'},tracks:[]};
   const repository={read:()=>({ok:true,exists:true,snapshot,revision:'local-r1'}),save:()=>{throw Error('Project must not be written by Port');}};
   let client,selected=null,requests=0,invalid=false;
   storage.subscribeAccount(()=>{invalid=true;void client?.dispose();});
   async function reopen(){selected=await storage.getAccount();invalid=false;
    const binding={audience:'studio-document-v1',accountId:selected.accountId,deviceId:device,generation:1,recoveryVersion:1,credentialVersion:1,proId:pro,proGeneration:1,epoch:1};
    const captured=selected.accountCredential;
    client=createIsolatedStudioSyncClient({enabled:true,endpoint:'https://project.fixture.invalid/isolated/studio/document',repository,model:{validateProject:()=>({ok:true})},readSession:()=>{
     if(invalid)throw Error('shared-account-changed');return{binding,sessionId:binding.accountId+':1',credential:captured,proCredential:'synthetic-pro',validUntil:Date.now()+60000};
    },fetchImpl:async()=>{requests++;throw Error('synthetic ACK loss');}});
   }
   await reopen();const op=await client.enqueue(projectId);try{await client.send(op.operationId);}catch{}
   const unknown=(await client.inspect(op.operationId)).state;
   const before=requests;await storage.setAccount({accountId:B,accountCredential:'sca1.'+device+'.B'});await reopen();
   let code;try{await client.send(op.operationId);}catch(e){code=e.code||e.message;}
   const after=requests;await storage.setAccount({accountId:A,accountCredential:'sca1.'+device+'.synthetic'});await reopen();
   const preserved=(await client.inspect(op.operationId)).state;await client.dispose();return{unknown,code,before,after,preserved};
  });assert.equal(result.unknown,'UNKNOWN');assert.equal(result.code,'operation-owner');assert.equal(result.before,result.after);assert.equal(result.preserved,'UNKNOWN');
 });
 }
 // Reuse only synthetic seed/schema helpers. Never call SQL Owner save routes.
 seed=await backendFixture({clock:{server:Date.now()},synchronousBatch:true});second=await seed.otherAccount('B');
 const run=fs.mkdtempSync(OUT+'/native-');mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default{fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-01',host:'127.0.0.1',port:0,inspectorPort:0,d1Databases:{DB:'attribution'},r2Buckets:{ASSETS:'attribution'},resourcePersistencePath:run,resourceTmpPath:run+'/tmp',outboundService:()=>{throw Error('external network forbidden');}}));
 const db=await mf.getD1Database('DB'),r2=await mf.getR2Bucket('ASSETS');const schema=seed.db.raw.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all();for(const v of schema)await db.prepare(v.sql).run();
 const rows=[];for(const t of schema.filter(x=>x.type==='table'))for(const v of seed.db.raw.prepare('SELECT * FROM '+t.name).all()){const ks=Object.keys(v);rows.push(db.prepare(`INSERT INTO ${t.name} (${ks.join(',')}) VALUES (${ks.map(()=>'?').join(',')})`).bind(...Object.values(v)));}await db.batch([db.prepare('PRAGMA defer_foreign_keys=ON'),...rows]);
 const env={SYNC_DB:db,SYNC_ASSETS:r2,ALLOWED_ORIGINS:'https://port.fixture.invalid',SYNC_CREDENTIAL_PEPPER:DEVICE_PEPPER,PRO_CREDENTIAL_PEPPER:TEST_PRO_PEPPER,SYNC_ACCOUNT_PUBLIC_APP_IDS:'port',SYNC_ALLOWED_APP_IDS:'port',SYNC_RATE_LIMITER:{limit:async()=>({success:true})}};
 async function push(op,credentials=seed.credentials){const r=await handleRequest(new Request('https://sync.fixture.invalid/v1/sync/push',{method:'POST',headers:{Origin:'https://port.fixture.invalid','Content-Type':'application/json',Authorization:credentials.appAuthorization,'X-Sound-Cruise-Pro-Authorization':credentials.proAuthorization},body:JSON.stringify({appId:'port',mode:'sync',operations:[op]})}),env,null,{readRuntimeControl:async()=>({rolloutMode:'open',admissionEnabled:true,dataWriteEnabled:true,dataReadEnabled:true,recoveryEnabled:true,cloudDeleteEnabled:true,generation:1,updatedAt:1})});return{status:r.status,body:await r.json()};}
 await check('Native D1 existing push: applied, ACK loss duplicate, stale CAS and normal B isolation',async()=>{
  const op=(await seed.request()).operation;let r=await push(op);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.results[0].status,'applied',JSON.stringify(r));
  r=await push(op);assert.equal(r.body.results[0].status,'duplicate');
  r=await push((await seed.request({bpm:150,revision:0})).operation);assert.equal(r.body.results[0].status,'conflict');
  r=await push((await second.request({bpm:160})).operation,second.credentials);assert.equal(r.body.results[0].status,'applied');
  const values=await db.prepare('SELECT user_id,payload_json FROM sync_records ORDER BY user_id').all();assert.equal(values.results.length,2);assert(values.results.find(x=>x.user_id==='user-A').payload_json.includes('145'));assert(values.results.find(x=>x.user_id==='user-B').payload_json.includes('160'));
 });
 await check('Native R2 synthetic source/final binary readback (not a new Asset Sync E2E)',async()=>{for(const kind of ['source','final']){await r2.put('synthetic/'+kind,new TextEncoder().encode(kind));assert.equal(await(await r2.get('synthetic/'+kind)).text(),kind);}});
 assert.deepEqual(errors,[]);fs.writeFileSync(OUT+'/NATIVE-BROWSER-RESULT.json',JSON.stringify({status:'PASS',production:false,tests,errors,blocked,scope:'real Chrome/IDB/WebLocks and native D1/R2; UI controller Runtime is a fixture; existing HTTP push uses real handler against local D1; no SQL Owner saves'},null,2));
}finally{for(const c of contexts)await c.close();await browser?.close();await mf?.dispose();second?.owner?.dispose();seed?.dispose();}
