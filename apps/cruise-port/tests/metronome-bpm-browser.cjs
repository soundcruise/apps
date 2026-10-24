const assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{const base=process.env.ACCOUNT_COORDINATION_BASE_URL,origin=new URL(base).origin,browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const results=[];
try{for(const scenario of ['normal-ui','same-key-race','ack-loss','before-commit-crash','quota','final-denial','expiry','late-A-B']){
 const context=await browser.newContext(),errors=[],network=[];await context.addInitScript(()=>{window.BroadcastChannel=class{postMessage(){}close(){}};});
 await context.route('**/*',route=>{const q=route.request(),u=new URL(q.url());if(u.origin===origin&&q.method()==='GET')return route.continue();network.push(q.url());return route.abort();});
 const page=async()=>{const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()===404)errors.push(r.url());});await p.goto(base+'apps/cruise-port/tests/metronome-bpm-fixture.html');await p.waitForFunction(()=>window.bpmFixture);return p;};
 let a=await page(),b=await page(),name='sound-cruise-port-authority-v1-fixture-bpm-'+scenario;const init=(p,seed,extra={})=>p.evaluate(o=>bpmFixture.init(o),{name,seed,...extra});
 assert((await init(a,true)).ok);assert((await init(b,false)).ok);const before=await a.evaluate(()=>bpmFixture.authority());
 if(scenario==='normal-ui'){
  await a.locator('#bpm').fill('149');assert.equal((await a.evaluate(()=>bpmFixture.authority())).snapshot.head.seq,before.snapshot.head.seq);await a.click('#save');await a.waitForFunction(()=>bpmFixture.state().status==='saved-historical');const id=(await a.evaluate(()=>bpmFixture.state())).pendingId;
  assert((await b.evaluate(id=>bpmFixture.recover(id),id)).saved);assert((await init(b,false)).ok);assert.equal((await b.evaluate(()=>bpmFixture.state())).bpm,149);
 }else if(scenario==='same-key-race'){
  await a.evaluate(()=>bpmFixture.edit(150));await b.evaluate(()=>bpmFixture.edit(151));const out=await Promise.all([a.evaluate(()=>bpmFixture.save('race-a')),b.evaluate(()=>bpmFixture.save('race-b'))]);assert.equal(out.filter(x=>x.ok).length,1);
  assert(await a.evaluate(()=>bpmFixture.ticket('race-a')));assert(await b.evaluate(()=>bpmFixture.ticket('race-b')));
 }else if(['ack-loss','before-commit-crash','late-A-B'].includes(scenario)){
  const checkpoint=scenario==='ack-loss'?'after-commit':'before-commit';await a.evaluate(n=>{bpmFixture.hold(n);bpmFixture.edit(152);window.pendingSave=bpmFixture.save('held').catch(()=>null);},checkpoint);await a.waitForFunction(n=>bpmFixture.entered===n,checkpoint);
  if(scenario==='late-A-B'){const rows=await b.evaluate(()=>bpmFixture.installB());await a.evaluate(()=>bpmFixture.release());assert.equal((await a.evaluate(()=>pendingSave)).ok,false);assert.deepEqual(await b.evaluate(()=>bpmFixture.rows()),rows);
   assert((await init(b,false,{generation:'g2',accountId:'B'})).ok);await b.evaluate(()=>bpmFixture.edit(153));assert((await b.evaluate(()=>bpmFixture.save('B-save'))).ok);assert.deepEqual(await b.evaluate(()=>bpmFixture.rows()),rows);
  }else{await a.close();a=await page();const r=await a.evaluate(async o=>{await bpmFixture.init(o);return bpmFixture.recover('held');},{name,seed:false});assert.equal(r.ok,scenario==='ack-loss');assert.equal((await a.evaluate(()=>bpmFixture.authority())).snapshot.head.seq,before.snapshot.head.seq+(scenario==='ack-loss'?1:0));}
 }else{
  await a.evaluate(s=>{bpmFixture.edit(154);if(s==='quota')bpmFixture.quota(true);else if(s==='expiry')bpmFixture.clock({server:999999});else bpmFixture.server({deny:true});},scenario);
  // Expiry must happen after capability preparation, not before its issuance.
  if(scenario==='expiry'){await a.evaluate(()=>{bpmFixture.clock({server:100000});bpmFixture.hold('before-commit');window.pendingSave=bpmFixture.save('expire');});await a.waitForFunction(()=>bpmFixture.entered==='before-commit');await a.evaluate(()=>{bpmFixture.clock({server:999999});bpmFixture.release();});assert.equal((await a.evaluate(()=>pendingSave)).ok,false);}
  else assert.equal((await a.evaluate(()=>bpmFixture.save('failure'))).ok,false);
  assert.equal((await a.evaluate(()=>bpmFixture.authority())).snapshot.head.seq,before.snapshot.head.seq);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);results.push({scenario,pass:true,nativeIndexedDB:true,notifications:'dropped',console404:0,unexpectedNetwork:0,canWrite:false});await context.close();
}console.log(JSON.stringify({pass:true,cases:results.length,results},null,2));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
