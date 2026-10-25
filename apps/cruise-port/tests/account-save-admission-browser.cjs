const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const base=process.env.ACCOUNT_COORDINATION_BASE_URL,u=new URL(base);assert(['127.0.0.1','localhost'].includes(u.hostname));assert(!['8765','8766'].includes(u.port));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),results=[];
 try{for(const scenario of ['normal-ui','expiry-at-final-guard','async-owner-probe','commit-ack-crash-reopen']){
  const context=await browser.newContext({serviceWorkers:'block'}),errors=[],network=[];
  await context.addInitScript(()=>{window.BroadcastChannel=class{postMessage(){}close(){}};});
  await context.route('**/*',r=>{if(new URL(r.request().url()).origin===u.origin&&r.request().method()==='GET')return r.continue();network.push(r.request().url());return r.abort();});
  const page=async()=>{const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)errors.push(r.url());});await p.goto(base+'apps/cruise-port/tests/account-save-admission-fixture.html');await p.waitForFunction(()=>window.saveAdmissionFixture);return p;};
  let p=await page();const name='sound-cruise-port-authority-v1-fixture-owner-admission-'+scenario;
  assert((await p.evaluate(o=>saveAdmissionFixture.init(o),{name,seed:true})).ok);const before=await p.evaluate(()=>saveAdmissionFixture.authority());
  if(scenario==='normal-ui'){
   await p.click('#load');await p.waitForFunction(()=>saveAdmissionFixture.state().status==='loaded');const rows=await p.evaluate(()=>saveAdmissionFixture.rows());await p.locator('#bpm').fill('148');await p.click('#save');await p.waitForFunction(()=>saveAdmissionFixture.state().status==='saved-historical');assert.deepEqual(await p.evaluate(()=>saveAdmissionFixture.rows()),rows);assert.equal((await p.evaluate(()=>saveAdmissionFixture.authority())).snapshot.head.seq,before.snapshot.head.seq+1);
  }else if(scenario==='commit-ack-crash-reopen'){
   assert((await p.evaluate(()=>saveAdmissionFixture.load())).ok);await p.evaluate(()=>{saveAdmissionFixture.edit(149);saveAdmissionFixture.hold('after-commit');window.pending=saveAdmissionFixture.save('ack-lost');});await p.waitForFunction(()=>saveAdmissionFixture.entered==='after-commit');await p.close();p=await page();await p.evaluate(o=>saveAdmissionFixture.init(o),{name,seed:false});const r=await p.evaluate(()=>saveAdmissionFixture.recover('ack-lost'));assert(r.saved);assert.equal(r.operationAuthorized,false);assert.equal(r.canWrite,false);assert.equal((await p.evaluate(()=>saveAdmissionFixture.authority())).snapshot.head.seq,before.snapshot.head.seq+1);
  }else{
   const prepared=await p.evaluate(()=>saveAdmissionFixture.prepare(150,'refuse'));assert(prepared.ok,prepared.reason);
   await p.evaluate(s=>s==='expiry-at-final-guard'?saveAdmissionFixture.expire():saveAdmissionFixture.asyncGuard(),scenario);
   assert.equal((await p.evaluate(()=>saveAdmissionFixture.commit())).ok,false);assert.deepEqual(await p.evaluate(()=>saveAdmissionFixture.authority()),before);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);results.push({scenario,pass:true,nativeIndexedDB:true,owner:'co-located synthetic model using actual Account HMAC',productionReady:false,canWrite:false});await context.close();
 }console.log(JSON.stringify({pass:true,cases:results.length,results},null,2));}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
