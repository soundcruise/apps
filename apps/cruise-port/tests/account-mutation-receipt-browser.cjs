// Native fixture acceptance. No production Account/credential or existing server.
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const base=process.env.ACCOUNT_COORDINATION_BASE_URL;
if(!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(base||'') || /:(8765|8766)\/$/.test(base))throw Error('isolated-loopback-required');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),results=[];
 try{for(const scenario of ['receipt-abort','receipt-ack-crash','same-account-rotation','two-tabs','late-success']){
  const ctx=await browser.newContext({serviceWorkers:'block'}),errors=[],network=[];
  await ctx.addInitScript(()=>{window.BroadcastChannel=class{postMessage(){}close(){}};});
  await ctx.route('**/*',r=>{if(r.request().url()===base+'favicon.ico')return r.fulfill({status:204,body:''});if(r.request().url().startsWith(base)&&r.request().method()==='GET')return r.continue();network.push(r.request().url());return r.abort();});
  const pages=[await ctx.newPage(),await ctx.newPage()];for(const p of pages){p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});await p.goto(base+'apps/cruise-port/tests/account-coordination-fixture.html');await p.waitForFunction(()=>window.accountFixture);}
  const [a,b]=pages,name='sound-cruise-port-authority-v1-fixture-receipt-'+scenario;
  assert((await a.evaluate(o=>accountFixture.init(o),{name,seed:true,receipts:true})).observed);assert((await b.evaluate(o=>accountFixture.init(o),{name,receipts:true})).observed);
  await a.evaluate(()=>accountFixture.prepare());await b.evaluate(()=>accountFixture.prepare());
  if(scenario==='receipt-abort'){
   await a.evaluate(()=>accountFixture.abortReceipt());assert.equal((await a.evaluate(()=>accountFixture.transition('B','abort'))).ok,false);
   assert.equal(await b.evaluate(()=>accountFixture.readAccount()),'A');assert.equal((await b.evaluate(()=>accountFixture.current())).snapshot.control.identityInvalidated,true);
   assert.equal((await b.evaluate(()=>accountFixture.commit())).ok,false);await a.close();await b.evaluate(()=>accountFixture.close());await b.reload();await b.waitForFunction(()=>window.accountFixture);await b.evaluate(o=>accountFixture.init(o),{name,receipts:true});
   const proof=await b.evaluate(()=>accountFixture.reconcile('abort'));assert.equal(proof.mutationProven,false);assert(proof.recoveryRequired);assert.equal(await b.evaluate(()=>accountFixture.readAccount()),'A');
  }else if(scenario==='receipt-ack-crash'||scenario==='late-success'){
   await a.evaluate(()=>{accountFixture.afterCas();window.transition=accountFixture.transition('B','committed');});await a.waitForFunction(()=>accountFixture.entered());
   assert.equal(await b.evaluate(()=>accountFixture.readAccount()),'B');
   if(scenario==='late-success'){
    await b.evaluate(()=>accountFixture.setAccount('C'));await a.evaluate(()=>accountFixture.release());assert.equal((await a.evaluate(()=>window.transition)).ok,false);
    const proof=await b.evaluate(()=>accountFixture.reconcile('committed'));assert(proof.mutationProven);assert.equal(proof.currentObservation,false);assert.equal(await b.evaluate(()=>accountFixture.readAccount()),'C');
   }else{
    assert.equal((await b.evaluate(()=>accountFixture.commit())).ok,false);await a.close();await b.evaluate(()=>accountFixture.close());await b.reload();await b.waitForFunction(()=>window.accountFixture);const reopened=await b.evaluate(o=>accountFixture.init(o),{name,receipts:true});assert.equal(reopened.observed,false);
    const before=await b.evaluate(()=>accountFixture.intents()),proof=await b.evaluate(()=>accountFixture.reconcile('committed'));
    assert(proof.ok&&proof.mutationProven&&proof.currentObservation);assert.equal(proof.continuityProven,false);assert(proof.recoveryRequired);assert.equal(proof.canWrite,false);assert.equal(proof.accountIntentPhase,'stopped');
    assert.deepEqual(await b.evaluate(()=>accountFixture.intents()),before);assert.equal(await b.evaluate(()=>accountFixture.readAccount()),'B');assert.equal((await b.evaluate(()=>accountFixture.current())).snapshot.control.identityInvalidated,true);
   }
  }else if(scenario==='same-account-rotation'){
   assert((await a.evaluate(()=>accountFixture.rotate())).ok);const proof=await b.evaluate(()=>accountFixture.reconcile('rotate'));assert(proof.mutationProven);assert.equal(proof.accountIntentPhase,'account-confirmed');assert.equal(proof.canWrite,false);assert.equal((await b.evaluate(()=>accountFixture.commit())).ok,false);
  }else{
   const outcomes=await Promise.all([a.evaluate(()=>accountFixture.transition('B','one')),b.evaluate(()=>accountFixture.transition('C','two'))]);assert.equal(outcomes.filter(x=>x.ok).length,1);
   const winner=outcomes[0].ok?'one':'two',proof=await b.evaluate(id=>accountFixture.reconcile(id),winner);assert(proof.mutationProven);assert(proof.recoveryRequired);assert.equal((await b.evaluate(()=>accountFixture.current())).snapshot.control.identityInvalidated,true);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);results.push({scenario,pass:true,nativeIndexedDB:true,notifications:'dropped',console404:0,unexpectedNetwork:0});await ctx.close();
 }}finally{await browser.close();}
 console.log(JSON.stringify({pass:true,cases:results.length,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
