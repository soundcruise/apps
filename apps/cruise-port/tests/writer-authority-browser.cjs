// Isolated Chrome + real Worker handler / SQLite / in-memory R2. No live API.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = process.argv[2] || 'http://127.0.0.1:8766';
(async () => {
 const { seed, environment, deps, bucket, webp } = await import('../../../workers/sound-cruise-sync/test/writer-authority-fixture.js');
 const { handleProAuthorizedRequest } = await import('../../../workers/sound-cruise-sync/test/pro-entitlement-fixture.js');
 const { hashRecord } = await import('../../../workers/sound-cruise-sync/src/records.js');
 const db=seed(), env={...environment(db,bucket()),ALLOWED_ORIGINS:origin};
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  const ctx=await browser.newContext(), page=await ctx.newPage(), calls=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await ctx.route('**/*',async route=>{
   const source=route.request(),url=new URL(source.url());
   if(url.origin===origin)return route.continue();
   assert.equal(url.origin,'https://sync.example','unexpected external request');
   const headers=source.headers();headers.origin=origin;
   const body=source.postDataBuffer();
   const request=new Request(source.url(),{method:source.method(),headers,...(body?{body}: {})});
   const response=await handleProAuthorizedRequest(request,env,null,deps());
   calls.push({path:url.pathname,method:source.method(),headers,body:headers['content-type']?.includes('json')&&body?JSON.parse(body.toString()):null,status:response.status});
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  await page.goto(origin+'/apps/shared/sync-account/');
  await page.addScriptTag({url:origin+'/apps/shared/sync-account/multi-app-sync-runtime.js'});
  const op={operationId:crypto.randomUUID(),recordType:'metronome_settings',recordId:'default',schemaVersion:1,baseRevision:0,deleted:false,
   payload:{id:'default',value:{version:3,bpm:120,meter:'4/4',rhythm:'quarter',sound:'electronic',volume:70,accents:[true,false,false,false]}}};
  op.payloadHash=await hashRecord(op,crypto,'port');
  const output=await page.evaluate(async({op,bytes})=>{
   const {createWriterAuthorityClient}=await import('/apps/shared/sync-account/writer-authority.mjs');
   const {PortAssetSync}=await import('/apps/cruise-port/port-asset-sync.js');
   const store={accountId:'account-a',authorityGeneration:'browser-g1',readMeta:async key=>key==='credential'?'scd1.fixture':null,setMeta:async()=>{}};
   const runtime=new SoundCruiseMultiAppSync.MultiAppSyncRuntime({appId:'port',accountId:'account-a',endpoint:'https://sync.example',
    store,adapter:{},accountClient:{},accountCore:{validAppCredential:()=>true},admissionMode:'production'});
   await runtime.prepareWriterAuthority(createWriterAuthorityClient({runtime,readLocalAuthority:()=>({state:'prepared',owner:'port',accountId:'account-a',generation:'browser-g1'})}));
   const snapshot=await runtime.serverSnapshot();
   const summary={appId:'port',schemaVersion:1,recordCount:snapshot.recordCount,manifestHash:snapshot.manifestHash};
   await runtime.request('POST','/v1/sync/bootstrap',summary);
   await runtime.request('POST','/v1/sync/migration/complete',summary);
   const first=await runtime.pushRequest({appId:'port',mode:'sync',operations:[op]});
   const retry=await runtime.pushRequest({appId:'port',mode:'sync',operations:[op]});
   const asset=new PortAssetSync({controller:{runtime},storage:{getItem:()=>null},canSync:()=>true});
   const uploaded=await asset.upload({id:'fixture-image',blob:new Blob([new Uint8Array(bytes)],{type:'image/webp'}),mimeType:'image/webp',width:512,height:512},'gear_photo_final');
   await asset.download(uploaded.asset);
   await asset.json('/v1/sync/assets/unreference',{appId:'port',assetIds:[uploaded.asset.assetId]});
   runtime.dispose();
   // A genuinely legacy runtime still works against the updated Worker.
   const legacy=new SoundCruiseMultiAppSync.MultiAppSyncRuntime({appId:'port',accountId:'account-a',endpoint:'https://sync.example',
    store,adapter:{},accountClient:{},accountCore:{validAppCredential:()=>true},admissionMode:'production'});
   const old=await legacy.pushRequest({appId:'port',mode:'sync',operations:[op]});legacy.dispose();
   return {first:first.results[0].status,retry:retry.results[0].status,legacy:old.results[0].status};
  },{op,bytes:[...webp(512,512)]});
  assert.deepEqual(output,{first:'applied',retry:'duplicate',legacy:'duplicate'});
  const posts=calls.filter(c=>c.method==='POST');
  for(const c of posts.slice(0,-1)){
   assert.equal(c.body.writerProtocol,2,c.path);assert.equal(c.body.syncProtocol,1,c.path);assert.equal(c.body.expectedWriteEpoch,1,c.path);
  }
  assert.equal(posts.at(-1).body.writerProtocol,undefined);
  const upload=calls.find(c=>c.method==='PUT');assert.equal(upload.headers['x-sound-cruise-write-epoch'],'1');
  assert.equal(upload.headers['x-sound-cruise-writer-protocol'],'2');
  assert.ok(calls.every(c=>c.status<400));assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',...output,requests:calls.map(c=>({path:c.path,method:c.method,status:c.status})),errors}));
 } finally { await browser.close(); db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
