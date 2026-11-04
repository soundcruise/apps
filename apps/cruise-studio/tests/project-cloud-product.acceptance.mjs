import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
export async function acceptProjectCloud({profile,bootstrapPro,createAccount,createAccountCredential,accountCredentialVerifier,pepper,db,check,result,network,faults,OUT,port,nativeRuntime,normalGear,sync,go,ready}){
 const A=await profile('Project-A');await bootstrapPro(A);let account,id;
 await check('current native Pro and Account entrance, without a second identity host',async()=>{
  account=await createAccount(A);await A.page.goto('https://studio.fixture.invalid/apps/cruise-studio/');
  await A.page.waitForFunction(()=>{try{return CruiseStudio.entryAuth?.isAuthorized()&&!!CruiseStudio.projectCloud?.session.readSession();}catch{return false;}});
 });
 const B=await profile('Project-B');await bootstrapPro(B);
 const second=createAccountCredential(),row=await db.prepare('SELECT * FROM sync_account_devices WHERE id=?').bind(account.accountDeviceId).first(),newRow={...row,id:second.deviceId,credential_verifier:await accountCredentialVerifier(second.credential,pepper)},keys=Object.keys(newRow);
 await db.prepare(`INSERT INTO sync_account_devices (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...Object.values(newRow)).run();
 await B.page.evaluate(value=>SoundCruiseSyncAccount.storage.setAccount(value),{...account,accountDeviceId:second.deviceId,accountCredential:second.credential});
 await B.page.goto('https://studio.fixture.invalid/apps/cruise-studio/');await B.page.waitForFunction(()=>{try{return CruiseStudio.entryAuth?.isAuthorized()&&!!CruiseStudio.projectCloud?.session.readSession();}catch{return false;}});
 // Installed browser runtime resolves async false predicates immediately. Observe
 // only (never retry operations), with the same existing 20s deadline.
 async function waitUntil(p,predicate,arg){const deadline=Date.now()+20000;do{if(await p.evaluate(predicate,arg))return;await p.waitForTimeout(50);}while(Date.now()<deadline);throw Error('Project state did not satisfy predicate within existing 20s deadline');}
 const project=p=>p.evaluate(()=>CruiseStudio.documents.capture().project);
 const click=(p,name)=>p.locator('[data-cloud-action='+name+']').click();
 async function edit(p,title){await p.locator('#sc-editor-drawer').evaluate(e=>e.open=true);await p.locator('#sc-title').fill(title);await p.locator('#sc-title').press('Tab');await p.locator('#sc-save').click();await p.waitForFunction(title=>{const f=CruiseStudio.documents.capture(),r=f.ok&&CruiseStudio.repository.read({type:'project',projectId:f.project.projectId});return r?.snapshot?.songInfo.title===title&&!CruiseStudio.documents.getSession().dirty&&!CruiseStudio.documents.getSession().commitInFlight;},title);}
 async function synced(p,expectedTitle){await waitUntil(p,async expectedTitle=>{try{const c=CruiseStudio.projectCloud,f=CruiseStudio.documents.capture();if(!f.ok)return false;const l=await c.client.tracking(f.project.projectId),r=CruiseStudio.repository.read({type:'project',projectId:f.project.projectId});return l&&l.lastLocalRevision===r.revision&&(await c.client.inspect(l.lastOperation)).state==='SYNCED'&&(!expectedTitle||(await c.client.observe(f.project.projectId)).head.project.songInfo.title===expectedTitle);}catch{return false;}},expectedTitle);}
 await check('new schema2 from score UI stays local until first explicit Cloud save',async()=>{
  await A.page.locator('#open-sheet-cruise').click();await A.page.locator('#sc-new-project').click();await edit(A.page,'Project A original');id=(await project(A.page)).projectId;
  assert.equal((await db.prepare('SELECT count(*) n FROM studio_document_records WHERE record_id=?').bind(id).first()).n,0);
  await click(A.page,'save');await synced(A.page);
 });
 await check('second admitted device discovers Account catalogue without a Project ID and receives selected schema2',async()=>{
  await B.page.reload();await B.page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized());await B.page.locator('#open-sheet-cruise').click();
  await B.page.locator('[aria-label="Cloud Project一覧"] option[value="'+id+'"]').waitFor({state:'attached'});
  assert.equal(await B.page.evaluate(id=>CruiseStudio.repository.read({type:'project',projectId:id}).exists,id),false);
  assert.deepEqual(await B.page.evaluate(id=>CruiseStudio.projectCloud.client.list(id),id),[]);
  const marker=network.length;await B.page.locator('[aria-label="Cloud Project一覧"]').selectOption(id);await B.page.locator('[data-project-catalogue-action=receive]').click();
  await B.page.waitForFunction(id=>CruiseStudio.repository.read({type:'project',projectId:id}).exists,id);
  await B.page.locator('#sc-project-select option[value="'+id+'"]').waitFor({state:'attached'});await B.page.selectOption('#sc-project-select',id);
  assert.equal((await project(B.page)).songInfo.title,'Project A original');assert.equal((await project(B.page)).schemaVersion,2);assert.equal(network.slice(marker).filter(x=>x.label==='Project-B'&&x.path==='/v2/studio/document'&&['begin','upload','commit'].includes(x.kind)).length,0);
 });
 await check('tracked local save automatically updates Cloud and peer reload resumes without a start button',async()=>{
  await edit(A.page,'Automatically uploaded');await synced(A.page);
  await B.page.reload();await B.page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized());await B.page.locator('#open-sheet-cruise').click();await B.page.evaluate(id=>CruiseStudio.documents.select(id),id);await B.page.evaluate(()=>CruiseStudio.projectCloud.refresh());
  await B.page.waitForFunction(id=>CruiseStudio.repository.read({type:'project',projectId:id}).snapshot?.songInfo.title==='Automatically uploaded',id);
 });
 await check('ACK loss retains UNKNOWN and explicit same-operation reconcile does not duplicate the commit',async()=>{
  faults.set('Project-A',{path:'/v2/studio/document',kind:'commit'});await edit(A.page,'Project ACK loss');
  await waitUntil(A.page,async id=>{try{const c=CruiseStudio.projectCloud.client,l=await c.tracking(id);return !!l?.active&&(await c.inspect(l.active)).state==='UNKNOWN';}catch{return false;}},id);
  const count=(await db.prepare('SELECT count(*) n FROM studio_document_changes WHERE record_id=?').bind(id).first()).n;
  await click(A.page,'reconcile');await synced(A.page);
  assert.equal((await db.prepare('SELECT count(*) n FROM studio_document_changes WHERE record_id=?').bind(id).first()).n,count);
 });
 await check('Offline edit survives; reconnect retains revision and uses same Account tracked flow',async()=>{
  await A.context.setOffline(true);await edit(A.page,'Offline local edit');assert.equal((await project(A.page)).songInfo.title,'Offline local edit');
  await A.context.setOffline(false);await A.page.evaluate(()=>CruiseStudio.projectCloud.refresh());await synced(A.page);
 });
 await check('concurrent remote and local changes require explicit conflict resolution and keep local draft',async()=>{
  await B.context.setOffline(true);await edit(B.page,'Peer conflicting local');await edit(A.page,'Winning Cloud');await synced(A.page,'Winning Cloud');
  await B.context.setOffline(false);await B.page.evaluate(()=>CruiseStudio.projectCloud.refresh());await B.page.locator('[data-project-sync-status]').filter({hasText:'確認が必要'}).waitFor();
  assert.equal((await project(B.page)).songInfo.title,'Peer conflicting local');
  const remote=await A.page.evaluate(id=>CruiseStudio.projectCloud.client.observe(id),id);assert.equal(remote.head.project.songInfo.title,'Winning Cloud');
 });
 await check('Cloud deletion retains local Project and original immutable operation receipt',async()=>{
  await A.page.locator('#studio-cloud-delete-confirm').check();await click(A.page,'delete');await waitUntil(A.page,async id=>{try{const c=CruiseStudio.projectCloud.client,l=await c.tracking(id);return !!l?.lastOperation&&(await c.inspect(l.lastOperation)).receipt?.deleted===true;}catch{return false;}},id);
  assert.equal((await project(A.page)).songInfo.title,'Winning Cloud');await A.page.locator('[data-project-sync-status]').filter({hasText:'Cloudは削除済み'}).waitFor();
 });
 await check('deleted Project restores under a new ID, preserving original raw data, tombstone and Outbox',async()=>{
  const before=await A.page.evaluate(async id=>({raw:localStorage.getItem('cruiseStudio.project.'+id),ops:await CruiseStudio.projectCloud.client.list(id)}),id);
  await A.page.locator('[data-project-catalogue-action=refresh]').click();await A.page.locator('[aria-label="Cloud Project一覧"]').selectOption(id);
  await A.page.locator('[data-project-catalogue-action=restore]:not([disabled])').click();
  await waitUntil(A.page,async id=>{try{const C=CruiseStudio,p=C.documents.capture().project;if(p.projectId===id)return false;const l=await C.projectCloud.client.tracking(p.projectId);return !!l?.lastOperation&&(await C.projectCloud.client.inspect(l.lastOperation)).state==='SYNCED';}catch{return false;}},id);
  const after=await A.page.evaluate(async id=>({raw:localStorage.getItem('cruiseStudio.project.'+id),ops:await CruiseStudio.projectCloud.client.list(id)}),id);assert.deepEqual(after,before);
  const copy=await project(A.page);assert.notEqual(copy.projectId,id);assert.equal(copy.songInfo.title,'Winning Cloud');
  const original=await A.page.evaluate(id=>CruiseStudio.projectCloud.client.observe(id),id),restored=await A.page.evaluate(id=>CruiseStudio.projectCloud.client.observe(id),copy.projectId);
  assert.equal(original.state,'REMOTE_DELETED');assert.equal(restored.head.project.songInfo.title,'Winning Cloud');
  await assert.rejects(()=>A.page.evaluate(id=>CruiseStudio.projectCloud.client.enqueue(id),id),/document-deleted/);
  result.restoredProjectIdDifferent=true;
 });
 await check('copy restoration ACK loss keeps the new local copy and reconciles the same operation',async()=>{
  await A.page.locator('[data-project-catalogue-action=refresh]').click();await A.page.locator('[aria-label="Cloud Project一覧"]').selectOption(id);
  const original=await A.page.evaluate(id=>localStorage.getItem('cruiseStudio.project.'+id),id);
  faults.set('Project-A',{path:'/v2/studio/document',kind:'commit'});await A.page.locator('[data-project-catalogue-action=restore]:not([disabled])').click();
  await waitUntil(A.page,async source=>{try{const copy=document.querySelector('[aria-label="Cloudから取得するProject ID"]').value;if(!copy||copy===source)return false;const c=CruiseStudio.projectCloud.client,l=await c.tracking(copy);return !!l?.active&&(await c.inspect(l.active)).state==='UNKNOWN';}catch{return false;}},id);
  const copy=await A.page.locator('[aria-label="Cloudから取得するProject ID"]').inputValue(),count=(await db.prepare('SELECT count(*) n FROM studio_document_changes').first()).n;
  await click(A.page,'reconcile');await waitUntil(A.page,async id=>{try{const c=CruiseStudio.projectCloud.client,l=await c.tracking(id);return !!l?.lastOperation&&(await c.inspect(l.lastOperation)).state==='SYNCED';}catch{return false;}},copy);
  assert.equal((await db.prepare('SELECT count(*) n FROM studio_document_changes').first()).n,count);assert.equal(await A.page.evaluate(id=>localStorage.getItem('cruiseStudio.project.'+id),id),original);
  await A.page.selectOption('#sc-project-select',copy);assert.equal((await project(A.page)).projectId,copy);
 });
 await check('existing Port writes and bidirectional Sync coexist with active Project release tables',async()=>{
  const before=(await db.prepare('SELECT user_id,record_id,revision,payload_hash,last_operation_id FROM studio_document_records ORDER BY user_id,record_id').all()).results;
  const pa=await port(A,true);await ready(pa);await nativeRuntime(pa);await normalGear(pa,'Project coexistence Gear');await sync(pa);
  const pb=await port(B,true);await ready(pb);await nativeRuntime(pb);await sync(pb);await pb.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.gearList')||'{"items":[]}').items.some(x=>x.name==='Project coexistence Gear'));
  assert.deepEqual((await db.prepare('SELECT user_id,record_id,revision,payload_hash,last_operation_id FROM studio_document_records ORDER BY user_id,record_id').all()).results,before);
  await A.page.locator('[data-workspace=home]').click();await A.page.locator('#open-sheet-cruise').click();await A.page.waitForFunction(()=>!!CruiseStudio.projectCloud);
 });
 await check('retained encrypted fixture backup restores Project proofs to a separate disposable database',async()=>{
  const {encryptFixtureBackup,restoreFixtureBackup}=await import(process.env.STUDIO_WORKER_ROOT+'/workers/sound-cruise-sync/scripts/studio-fixture-backup.mjs');
  fs.mkdirSync(OUT+'/backup',{recursive:true});const saved=await encryptFixtureBackup({db,directory:OUT+'/backup',syntheticFixture:true});
  const {Miniflare,convertV4MiniflareOptions}=createRequire(process.env.STUDIO_TEST_RUNTIME)('miniflare');
  const restored=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response(null,{status:404})}}',compatibilityDate:'2026-09-01',host:'127.0.0.1',port:0,inspectorPort:0,d1Databases:{DB:'restore'},resourcePersistencePath:OUT+'/restore',outboundService:()=>{throw Error('external network forbidden');}}));
  try{const target=await restored.getD1Database('DB'),r=await restoreFixtureBackup({db:target,...saved,expectedManifestHash:saved.manifestHash,expectedPlainHash:saved.anchor,syntheticFixture:true});assert.equal(r.state,'RESTORED');assert.equal((await target.prepare('SELECT count(*) n FROM studio_document_receipts').first()).n,(await db.prepare('SELECT count(*) n FROM studio_document_receipts').first()).n);}finally{await restored.dispose();}
 });
 await check('isolated Project panel keeps five themes and four viewport widths',async()=>{
  await A.page.locator('[data-project-sync-status]').scrollIntoViewIfNeeded();assert(!await A.page.locator('.studio-cloud-panel [role=status]').filter({hasText:'Cloud Syncは未接続'}).count());
  for(const theme of ['dark','midnight','charcoal','gray','light']){await A.page.evaluate(theme=>CruiseStudio.colorTheme.setColorTheme(theme),theme);await A.page.screenshot({path:OUT+'/project-'+theme+'.png'});}
  for(const width of [1440,1024,768,390]){await A.page.setViewportSize({width,height:1000});await A.page.locator('[data-project-sync-status]').scrollIntoViewIfNeeded();const fits=await A.page.locator('[data-project-sync-status]').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;});assert(fits);await A.page.screenshot({path:OUT+'/project-'+width+'.png'});}
  await A.page.setViewportSize({width:1440,height:1000});
 });
 await check('foreign Account cannot automatically send tracked local data and pending evidence survives',async()=>{
  const foreign=await profile('Project-foreign',false);await bootstrapPro(foreign);const next=await createAccount(foreign);
  const before=await B.page.evaluate(id=>localStorage.getItem('cruiseStudio.project.'+id),id),marker=network.length;
  await B.page.evaluate(a=>SoundCruiseSyncAccount.storage.setAccount(a),next);
  await B.page.waitForFunction(()=>!CruiseStudio.entryAuth.isAuthorized());
  assert.equal(await B.page.evaluate(id=>localStorage.getItem('cruiseStudio.project.'+id),id),before);
  assert.equal(network.slice(marker).filter(x=>x.label==='Project-B'&&x.path==='/v2/studio/document'&&['begin','upload','commit'].includes(x.kind)).length,0);
 });
 await A.page.screenshot({path:OUT+'/project-cloud-current-entry.png',fullPage:false});
 result.projectBackend='retained isolated candidate only';result.productionProjectEnabled=false;result.knownProjectIdRequired=false;
}
