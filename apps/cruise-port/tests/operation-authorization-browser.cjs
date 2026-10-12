const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const origin=process.argv[2]||'http://127.0.0.1:8766';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const result={cases:[],errors:[],missing:[],writes:[]};
 const attach=p=>{p.on('pageerror',e=>result.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});p.on('response',r=>{if(r.status()===404)result.missing.push(r.url());});};
 async function setup(p,fresh){await p.evaluate(async fresh=>{
  const F=await import('./migration-fixture.mjs'),M=await import('../port-authority-migration.mjs'),R=await import('../port-write-readiness.mjs'),S=await import('../../cruise-studio/js/port-data/metronome-facade.mjs');window.M=M;
  if(fresh){for(const[k,v]of Object.entries(F.cleanValues()))localStorage.setItem(k,v);localStorage.setItem('fixture.pro',JSON.stringify({credential:'fixture',generation:1,operationRevision:1}));}
  window.f=await F.migrationFixture({bound:true,storage:localStorage,locks:navigator.locks});window.e=f.engine();
  if(fresh){const s=await F.sealed(f);window.e=s.e;window.qaFence=s.fence;await e.publish({fence:qaFence});}else window.qaFence=f.fence(f.cloud(await f.capture()));
  window.r=await e.activeRepository({fence:qaFence});const auth=()=>JSON.parse(localStorage.getItem('fixture.pro'));
  const context=()=>({generation:1,accountId:'A',accountGeneration:1,membershipGeneration:1,repositoryEpoch:'g1',writerProtocol:1,repositoryProtocol:1,locksAvailable:true,pro:{allowed:true,generation:auth()?.generation,credentialIdentity:auth()?.credential,validUntil:2000}});
  const resolvePro=R.createProOperationResolver({readAuth:async()=>auth(),readAuthSync:auth,now:()=>1000,monotonicNow:()=>100,knownRevoked:()=>!auth(),client:{validate:async()=>({ok:true,offlineRemainingMs:1000})}});
  window.facade=S.createPortMetronomeFacade({host:{subscribe:()=>()=>{}},fixtureExecutor:{repository:r,readContext:async()=>context(),readContextSync:context,resolvePro,allWritersCompatible:true,now:()=>1000}});
  window.loaded=await facade.load();window.base=r.inspect();
 },fresh);}
 try{
  for(const kind of ['Pro revoke','Pro generation','Account switch','suspend','save/save','same Account tabs']){
   const ctx=await browser.newContext();await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   const a=await ctx.newPage(),b=await ctx.newPage();attach(a);attach(b);
   try{
    for(const p of [a,b])await p.goto(origin+'/apps/cruise-port/tests/migration-browser-fixture.html');await setup(a,true);await setup(b,false);
    await a.evaluate(()=>{
     const native=navigator.locks.request.bind(navigator.locks);let gated=false;
     r.locks={request(name,options,callback){if(!gated&&options.mode==='exclusive'){gated=true;window.held=native(name,options,async()=>{window.entered=true;await new Promise(done=>{window.release=done;});});}return native(name,options,callback);}};
     window.saving=facade.saveSettings({volume:35},{baseToken:loaded.baseToken});
    });await a.waitForFunction(()=>window.entered);
    if(kind==='Pro revoke')await b.evaluate(()=>localStorage.removeItem('fixture.pro'));
    if(kind==='Pro generation')await b.evaluate(()=>localStorage.setItem('fixture.pro',JSON.stringify({credential:'fixture',generation:2,operationRevision:2})));
    if(kind==='Account switch'||kind==='suspend'){
     await b.evaluate(kind=>{window.changing=kind==='suspend'?e.suspendWrites():M.changeIsolatedIdentity(f.scope,{...f.state.identity,accountId:'B'});},kind);
     await b.waitForFunction(async()=>(await navigator.locks.query()).pending.some(x=>x.name===r.lockName));
    }
    // Source changes after the queued save request cannot win that same lock.
    // They may linearize after the save; this is the required save-first control.
    await a.evaluate(()=>release());const value=await a.evaluate(()=>saving);
    if(kind==='Account switch'||kind==='suspend')await b.evaluate(()=>changing);
    assert.equal(value.ok,!kind.startsWith('Pro '));if(value.ok)assert.equal(value.publish,false);
    const after=await a.evaluate(()=>r.inspect());assert.equal(after.revision=== (await a.evaluate(()=>base.revision)),kind.startsWith('Pro '));
    if(kind==='save/save'){const second=await b.evaluate(()=>facade.saveSettings({volume:45},{baseToken:loaded.baseToken}));assert.equal(second.ok,false);}
    if(kind==='same Account tabs'){await b.evaluate(async()=>{window.loaded=await facade.load();});assert.equal((await b.evaluate(()=>facade.saveSettings({volume:45},{baseToken:loaded.baseToken}))).ok,true);}
    result.cases.push(kind);
   }finally{await ctx.close();}
  }
  // Real Port UI + real encrypted device session; only the remote server is stubbed.
  for(const action of ['advanced save','preset create']){
   const ctx=await browser.newContext();const p=await ctx.newPage();attach(p);
   const credential='scp1.123e4567-e89b-42d3-a456-426614174000.'+'A'.repeat(43);
   await ctx.addInitScript(credential=>{localStorage.setItem('soundCruiseProAuth',JSON.stringify({v:2,credential,generation:1,sessionVersion:3}));localStorage.setItem('soundCruiseProAuthMigrated','1');},credential);
   await ctx.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.pathname.includes('/v2/pro-auth/')){
     const body=req.postDataJSON()||{},now=Date.now();let response={ok:true,generation:1};
     if(u.pathname.endsWith('/challenge'))response={ok:true,message:'isolated-operation',challenge:'fixture',mac:'fixture'};
     if(u.pathname.endsWith('/renew'))response={ok:true,generation:1,session:{version:3,serverTime:now,issuedAt:now,boundAt:now,lastValidatedAt:now,inactiveExpiresAt:now+90*86400000,accessExpiresAt:now+7*86400000,offlineUntil:now+7*86400000,revalidateAfter:now+43200000,devicePublicKey:body.publicKey}};
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
    }
    if(['/v1/news','/__cruise_preview/news'].includes(u.pathname))return route.fulfill({contentType:'application/json',body:JSON.stringify({contractVersion:1,items:[],nextOffset:null})});
    if(u.origin===origin)return route.continue();return route.fulfill({body:'',contentType:'text/css'});
   });
   try{
    await p.goto(origin+'/apps/cruise-port/pro_9a3943176561/');await p.waitForFunction(()=>!!SoundCruiseProOperationSource&&!document.querySelector('#pro-gate-overlay'));
    await p.locator('.port-app-version-display').filter({hasText:'1.22.9'}).first().waitFor({state:'visible'});
    await p.evaluate(()=>location.hash='#metronome');await p.locator('#metronome-view').waitFor({state:'visible'});
    if(action==='advanced save') {
     await p.evaluate(()=>{const input=document.querySelector('#metronome-volume');input.value='25';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
     await p.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.metronome')||'{}').volume===25);
    } else {
     await p.locator('#metronome-preset-save-open').click();await p.locator('#metronome-preset-name').fill('Authorized');await p.locator('#metronome-preset-save').click();
     await p.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.metronomePresets')||'{}').items?.length===1);
    }
    result.cases.push('production Port '+action+' valid proof control');
    const before=await p.evaluate(()=>({settings:localStorage.getItem('cruisePort.metronome'),presets:localStorage.getItem('cruisePort.metronomePresets')}));
    await p.evaluate(()=>{const native=navigator.locks.request.bind(navigator.locks);let gated=false;navigator.locks.request=(name,options,callback)=>{
     if(!gated&&name==='sound-cruise:port:dataset:v1'&&options.mode==='exclusive'){gated=true;window.held=native(name,options,async()=>{window.entered=true;await new Promise(done=>window.release=done);});}
     return native(name,options,callback);
    };});
    if(action==='advanced save')await p.evaluate(()=>{const input=document.querySelector('#metronome-volume');input.value='35';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});
    else{await p.locator('#metronome-preset-save-open').click();await p.locator('#metronome-preset-name').fill('Final guard');await p.locator('#metronome-preset-save').click();}
    await p.waitForFunction(()=>window.entered);
    await p.evaluate(async()=>{await __soundCruiseClearGate();release();});await p.evaluate(()=>held);await p.waitForTimeout(80);
    const after=await p.evaluate(()=>({settings:localStorage.getItem('cruisePort.metronome'),presets:localStorage.getItem('cruisePort.metronomePresets')}));assert.deepEqual(after,before);
    result.cases.push('production Port '+action+' revoke while queued');
   }finally{await ctx.close();}
  }
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.missing,[]);result.result='PASS';
 }catch(error){result.result='FAIL';result.failure=error.stack;process.exitCode=1;}
 finally{fs.writeFileSync('/private/tmp/pro-browser-authorization.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
