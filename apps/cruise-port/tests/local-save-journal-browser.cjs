// Run against a local static server. Synthetic network/Accounts; native Web Locks/IDB/localStorage.
const {chromium,webkit}=require('playwright');const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const origin=process.argv[2]||'http://127.0.0.1:8766';
async function waitState(page,predicate){let state;for(let i=0;i<200;i++){state=await page.evaluate(()=>journalFixture.inspect());if(predicate(state))return state;await new Promise(r=>setTimeout(r,25));}throw Error('Fixture state timeout '+JSON.stringify(state));}
(async()=>{
 const {manifestHash}=await import('../../../workers/sound-cruise-sync/src/records.js');
 const results=[];
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='chromium'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch({headless:true,...(process.env.PORT_JOURNAL_WEBKIT_EXECUTABLE?{executablePath:process.env.PORT_JOURNAL_WEBKIT_EXECUTABLE}:{})}));
  try{for(const mode of ['cold','offline-save','snapshot-failure','pagehide','other-account']){
   const ctx=await browser.newContext(),page=await ctx.newPage(),rows=new Map(),ids=new Set(),errors=[];let fail=false,revision=0;
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==origin)return route.abort();
    if(!url.pathname.startsWith('/v1/sync/'))return route.continue();
    let body;
    if(url.pathname.endsWith('/snapshot')){
     if(fail){fail=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,code:'server_error'})});}
     const records=[...rows.values()];body={ok:true,datasetState:'ready',schemaVersion:1,recordCount:records.length,manifestHash:await manifestHash(records,1,webcrypto,'port'),cursor:'synthetic-'+revision,records};
    }else if(url.pathname.endsWith('/push')){
     const input=req.postDataJSON();body={ok:true,results:input.operations.map(op=>{
      const key=op.recordType+'/'+op.recordId,old=rows.get(key);
      if(ids.has(op.operationId))return {operationId:op.operationId,status:'duplicate',record:old};
      if(op.baseRevision!==(old?.revision||0))return {operationId:op.operationId,status:'conflict',record:old};
      const record={...op,revision:(old?.revision||0)+1,deletedAt:null,operationId:op.operationId};rows.set(key,record);ids.add(op.operationId);revision++;
      return {operationId:op.operationId,status:'applied',record};
     })};
    }else if(url.pathname.endsWith('/removal-safety'))body={ok:true};
    else throw Error('Unexpected synthetic route '+url.pathname);
    return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   });
   const url=origin+'/apps/cruise-port/tests/local-save-journal.html';
   await page.goto(url);await page.waitForFunction(()=>!!globalThis.journalFixture);
   if(mode==='offline-save')await ctx.setOffline(true);
   assert.equal(await page.evaluate(()=>journalFixture.save()),true);
   assert.deepEqual(await page.evaluate(async()=>{const s=await journalFixture.inspect();return [s.anchors,s.outbox,s.history,s.active];}),[2,0,1,false]);
   if(mode==='offline-save')await ctx.setOffline(false);
   if(mode==='other-account')await page.evaluate(()=>journalFixture.switchAccount());
   await page.reload();await page.waitForFunction(()=>!!globalThis.journalFixture);
   if(mode==='snapshot-failure')fail=true;
   await page.evaluate(()=>journalFixture.start());
   if(mode==='pagehide')await page.evaluate(()=>{journalFixture.pagehide();journalFixture.pageshow();});
   if(mode==='snapshot-failure'){
    await waitState(page,s=>!s.checking&&!!s.code);
    assert.equal((await page.evaluate(()=>journalFixture.inspect())).anchors,2);
    await page.reload();await page.waitForFunction(()=>!!globalThis.journalFixture);await page.evaluate(()=>journalFixture.start());
   }
   if(mode==='other-account'){
    await waitState(page,s=>!s.checking&&s.code==='local_data_unconfirmed');
    assert.equal(rows.size,0);
   }else{
    await waitState(page,s=>!s.checking&&s.active&&s.outbox===0&&s.shadow===2);
    assert.equal(rows.size,2,engine+' '+mode+' rows');assert.equal(ids.size,2,engine+' '+mode+' ids');
   }
   assert.deepEqual(errors,[]);results.push({engine,mode,pass:true});await ctx.close();
  }}finally{await browser.close();}
 }
 console.log(JSON.stringify({results,passed:results.length},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
