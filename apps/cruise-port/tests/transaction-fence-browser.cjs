// Browser HTTP bridge to the real handler + isolated SQLite/R2. Never contacts production.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
const origin=process.argv[2]||'http://127.0.0.1:8766';
(async()=>{
 const {seed,environment,deps,bucket,webp,assetId,operationId}=await import('../../../workers/sound-cruise-sync/test/writer-authority-fixture.js');
 const {handleProAuthorizedRequest}=await import('../../../workers/sound-cruise-sync/test/pro-entitlement-fixture.js');
 const {createIsolatedWriterPolicy}=await import('../../../workers/sound-cruise-sync/src/writer-fence.js');
 const {createIsolatedCutoverController}=await import('../../../workers/sound-cruise-sync/src/authority-cutover.js');
 const {hashRecord}=await import('../../../workers/sound-cruise-sync/src/records.js');
 const {sha256Hex}=await import('../../../workers/sound-cruise-sync/src/asset-validation.js');
 const db=seed(),env={...environment(db,bucket()),ALLOWED_ORIGINS:origin},policy=createIsolatedWriterPolicy('account-a'),dependencies={...deps(),writerPolicy:policy};
 const ctl=createIsolatedCutoverController(db,policy),transition=phase=>ctl.transition({accountId:'account-a',migrationId:'browser-m',generation:'browser-g',operationId:phase,phase});
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const ctx=await browser.newContext(),page=await ctx.newPage(),errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
  await ctx.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();assert.equal(url.origin,'https://sync.example');
   const headers={...req.headers(),origin},body=req.postDataBuffer();const response=await handleProAuthorizedRequest(new Request(req.url(),{method:req.method(),headers,...(body?{body}:{})}),env,null,dependencies);
   calls.push({path:url.pathname,status:response.status});await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});});
  await page.goto(origin+'/apps/shared/sync-account/');
  const request=(path,body)=>page.evaluate(async({path,body})=>{const r=await fetch('https://sync.example/v1/sync/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer fixture',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify({appId:'port',...body})}:{})});return {status:r.status,body:await r.json()};},{path,body});
  const op={operationId:crypto.randomUUID(),recordType:'metronome_settings',recordId:'default',schemaVersion:1,baseRevision:0,deleted:false,payload:{id:'default',value:{version:3,bpm:120,meter:'4/4',rhythm:'quarter',sound:'electronic',volume:70,accents:[true,false,false,false]}}};op.payloadHash=await hashRecord(op,crypto,'port');
  assert.equal((await request('push',{mode:'sync',operations:[op]})).body.results[0].status,'applied');
  const hash=await sha256Hex(webp(512,512));assert.equal((await request('assets/prepare',{assetId,operationId,hash,kind:'gear_photo_final',mime:'image/webp',byteSize:30,width:512,height:512})).status,201);
  const original=db.batch;let fired=false;db.batch=async statements=>{if(!fired&&statements.some(s=>s.sql?.includes('INSERT INTO sync_records'))){fired=true;await transition('prepared');await transition('paused');await transition('enforced');}return original(statements);};
  const changed={...op,operationId:crypto.randomUUID(),baseRevision:1};
  assert.equal((await request('push',{mode:'sync',operations:[changed]})).body.code,'dataset_epoch_stale');assert.equal(fired,true);
  assert.equal((await request('push',{mode:'sync',operations:[changed]})).body.code,'writer_protocol_required');
  const fields={writerProtocol:2,syncProtocol:1,expectedWriteEpoch:2};assert.equal((await request('push',{mode:'sync',operations:[changed],...fields})).body.results[0].status,'applied');
  assert.equal((await request('push',{mode:'sync',operations:[changed],...fields,expectedWriteEpoch:1})).body.code,'dataset_epoch_stale');
  assert.equal((await request('assets/commit',{assetId,operationId,hash,...fields})).body.code,'dataset_epoch_stale');
  assert.equal((await request('snapshot?appId=port')).status,200);assert.equal((await request('changes?appId=port')).status,200);
  assert.equal((await request('writer-authority?appId=port')).body.authority.fence.epoch,2);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM sync_changes').get().n,2);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',checks:10,requests:calls.length,pageErrors:errors,unexpected404:calls.filter(c=>c.status===404).length}));
 }finally{await browser.close();db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
