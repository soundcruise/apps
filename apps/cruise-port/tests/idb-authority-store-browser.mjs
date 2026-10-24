// L2a native IDB integration, independent of the L1 Repository acceptance driver.
// Reuses its CDP / separate-window / private-loopback / throwaway-profile pattern.
// No real browser profile, Worker, Account, credentials or production data.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(fileURLToPath(new URL('../../..',import.meta.url))),apps=join(root,'apps');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'};
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1'),file=resolve(root,'.'+decodeURIComponent(url.pathname));
 if(url.pathname==='/favicon.ico'){res.writeHead(204).end();return;}
 if(req.method!=='GET'||!file.startsWith(apps+sep)||file.slice(root.length).split(sep).some(p=>p.startsWith('.')||p==='node_modules')||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(readFileSync(file));
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`,profile=mkdtempSync(join(tmpdir(),'cruise-l2a-chrome-'));
const chrome=spawn(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--site-per-process','about:blank'],{stdio:'ignore'});
const cleanup=()=>{try{chrome.kill();}catch{}server.close();try{rmSync(profile,{recursive:true,force:true});}catch{}};
process.on('exit',cleanup);
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),report={cases:[],errors:[],missing:[],externalWrites:[],contexts:[],mode:'L2a isolated store; not L2b acceptance'};
let ws,nextId=0;const pending=new Map(),paused=new Set(),fetchHandlers=new Set(),fetchCompletions=[];
async function poll(fn){for(let n=0;n<200;n++){if(await fn())return;await sleep(25);}throw Error('native checkpoint timeout');}
try{
 const portFile=join(profile,'DevToolsActivePort');await poll(()=>existsSync(portFile));
 const [port,path]=readFileSync(portFile,'utf8').trim().split('\n');ws=new WebSocket(`ws://127.0.0.1:${port}${path}`);
 await new Promise((ok,no)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',no,{once:true});});
 const send=(method,params={},sessionId)=>new Promise((ok,no)=>{const id=++nextId;pending.set(id,{ok,no});ws.send(JSON.stringify({id,method,params,sessionId}));});
 ws.addEventListener('message',event=>{
  const m=JSON.parse(event.data);
  if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.no(Error(JSON.stringify(m.error))):p.ok(m.result);return;}
  if(m.method==='Debugger.paused')paused.add(m.sessionId);
  if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params.exceptionDetails.text);
  if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')report.errors.push(m.params.entry.text);
  if(m.method==='Network.responseReceived'&&m.params.response.status===404)report.missing.push(m.params.response.url);
  if(m.method==='Fetch.requestPaused'){
   const r=m.params.request,u=new URL(r.url);let body;
   if(u.pathname==='/v1/news'||u.pathname==='/__cruise_preview/news')body=JSON.stringify({contractVersion:1,items:[],nextOffset:null});
   else if(u.origin!==origin){body='';if(r.method!=='GET')report.externalWrites.push({url:u.href,method:r.method});}
   const promise=body===undefined?send('Fetch.continueRequest',{requestId:m.params.requestId},m.sessionId):send('Fetch.fulfillRequest',{
    requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:u.hostname==='fonts.googleapis.com'?'text/css':'application/json'}],body:Buffer.from(body).toString('base64')},m.sessionId);
   const handler={sessionId:m.sessionId,requestId:m.params.requestId};fetchHandlers.add(handler);
   const completed=error=>{fetchHandlers.delete(handler);fetchCompletions.push({...handler,news:u.pathname==='/v1/news'||u.pathname==='/__cruise_preview/news',ok:!error});if(error)report.errors.push(error.message);};
   promise.then(()=>completed(),completed);
  }
 });
 const evaluate=async(session,expression,awaitPromise=true)=>{
  const r=await send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true,timeout:15000},session);
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;
 };
 const fixture=origin+'/apps/cruise-port/tests/authority-store/fixture.html';
 async function tab(browserContextId){
  const target=await send('Target.createTarget',{url:'about:blank',newWindow:true,...(browserContextId?{browserContextId}:{})});
  const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  for(const method of ['Runtime.enable','Log.enable','Network.enable'])await send(method,{},sessionId);
  await send('Fetch.enable',{patterns:[{urlPattern:'https://*'},{urlPattern:'*/v1/news*'},{urlPattern:'*/__cruise_preview/news*'}]},sessionId);await send('Page.navigate',{url:fixture},sessionId);
  await poll(async()=>{try{return await evaluate(sessionId,"typeof IDBQA==='object'");}catch{return false;}});
  return {sessionId,targetId:target.targetId};
 }
 const record=name=>report.cases.push({name,pass:true});
 report.chrome=(await send('Browser.getVersion')).product;
 let a=await tab(),b=await tab();const partition='fixture-'+randomUUID();
 assert.equal((await evaluate(a.sessionId,'indexedDB.databases()')).length,0);record('import / no automatic DB creation');
 // Real normally read-only product startup must not instantiate the new DB.
 const normal=await tab();
 for(const url of ['/apps/cruise-port/index.html','/apps/cruise-studio/index.html']){
  await send('Page.navigate',{url:origin+url},normal.sessionId);
  await poll(async()=>{try{return await evaluate(normal.sessionId,url.includes('studio')?"document.readyState==='complete'&&!!window.CruiseStudio?.portDataHost":"document.readyState==='complete'&&!!document.querySelector('.port-app-version-display')?.textContent.trim()&&!!document.querySelector('#news-category')");}catch{return false;}});
  // The static version element exists before bootstrap. Wait for NEWS presentation
  // and its owned Fetch handler before replacing the document with Studio.
  await poll(()=>![...fetchHandlers].some(h=>h.sessionId===normal.sessionId));
  if(!url.includes('studio'))assert(fetchCompletions.some(h=>h.sessionId===normal.sessionId&&h.news&&h.ok));
  assert.equal((await evaluate(normal.sessionId,'indexedDB.databases()')).some(d=>d.name==='sound-cruise-port-authority-v1'),false);
  (report.normalStartups??=[]).push({url,unfinishedHandlers:[...fetchHandlers].filter(h=>h.sessionId===normal.sessionId).length,news:fetchCompletions.filter(h=>h.sessionId===normal.sessionId&&h.news)});
 }
 await send('Target.closeTarget',{targetId:normal.targetId});record('normal Port / Studio read-only start creates no new Authority DB');
 await evaluate(a.sessionId,`IDBQA.setup(${JSON.stringify(partition)})`);await evaluate(b.sessionId,`IDBQA.setup(${JSON.stringify(partition)})`);
 const checksum=await evaluate(a.sessionId,'IDBQA.checksum()');assert.equal(checksum.ours,checksum.native);record('native creation / hydration / SubtleCrypto digest match');
 const counts=await evaluate(a.sessionId,'IDBQA.counts()');assert.equal(counts.head,1);assert.equal(counts.manifests,1);assert.equal(counts.records,14);assert.equal(counts.pointer,2);assert.equal(counts.reservations,1);
 assert.deepEqual(Object.keys(counts).sort(),['control','head','journal','manifests','oplog','pointer','records','reservations','roots']);record('exact nine v2 stores / one fixture pointer + namespace / full initial head / explicit absence');
 report.rendererProcesses=(await send('SystemInfo.getProcessInfo')).processInfo.filter(p=>p.type==='renderer').length;
 assert(report.rendererProcesses>=2);
 await Promise.all([evaluate(a.sessionId,"IDBQA.prepare('same-a',IDBQA.keys.met,{bpm:141})"),evaluate(b.sessionId,"IDBQA.prepare('same-b',IDBQA.keys.met,{bpm:142})")]);
 const same=await Promise.all([evaluate(a.sessionId,"IDBQA.commit('same-a')"),evaluate(b.sessionId,"IDBQA.commit('same-b')")]);
 assert.equal(same.filter(r=>r.ok).length,1);assert.equal(same.filter(r=>r.reason==='stale').length,1);record('two-renderer same-key CAS has exactly one commit');
 await Promise.all([evaluate(a.sessionId,"IDBQA.prepare('different-a',IDBQA.keys.met,{bpm:150})"),evaluate(b.sessionId,"IDBQA.prepare('different-b',IDBQA.keys.tuner,{thresholdDb:-75})")]);
 const different=await Promise.all([evaluate(a.sessionId,"IDBQA.commit('different-a')"),evaluate(b.sessionId,"IDBQA.commit('different-b')")]);assert(different.every(r=>r.ok));
 let observed=await evaluate(b.sessionId,'IDBQA.snapshot()');assert.equal(JSON.parse(observed.values['cruisePort.metronome']).bpm,150);assert.equal(JSON.parse(observed.values['cruisePort.tuner']).thresholdDb,-75);record('different-key transactions preserve both writes');
 await Promise.all([evaluate(a.sessionId,"IDBQA.prepareIntent('intent-a','metronome_preset/a')"),evaluate(b.sessionId,"IDBQA.prepareIntent('intent-b','metronome_preset/b')")]);
 const intents=await Promise.all([evaluate(a.sessionId,"IDBQA.commit('intent-a')"),evaluate(b.sessionId,"IDBQA.commit('intent-b')")]);assert(intents.every(r=>r.ok));
 observed=await evaluate(b.sessionId,'IDBQA.snapshot()');const journal=JSON.parse(observed.values['cruisePort.syncDeletionIntent.v1']);assert(journal['metronome_preset/a']);assert(journal['metronome_preset/b']);record('concurrent intent merge preserves both generations');
 const beforeAbort=await evaluate(a.sessionId,'IDBQA.counts()');
 for(const kind of ['promise','throw']){assert.equal((await evaluate(a.sessionId,`IDBQA.guardAbort('${kind}')`)).ok,false);assert.deepEqual(await evaluate(a.sessionId,'IDBQA.counts()'),beforeAbort);}
 record('native Promise / exception guard aborts all stores');
 await evaluate(a.sessionId,"IDBQA.prepare('retry',IDBQA.keys.met,{bpm:160})");const first=await evaluate(a.sessionId,"IDBQA.commit('retry')");
 const beforeRetry=await evaluate(a.sessionId,'IDBQA.counts()');const retry=await evaluate(a.sessionId,"IDBQA.commit('retry')");assert.equal(retry.replayed,true);assert.equal(retry.seq,first.seq);assert.deepEqual(await evaluate(a.sessionId,'IDBQA.counts()'),beforeRetry);record('native operationId retry has no duplicate commit');
 await evaluate(a.sessionId,'IDBQA.reopen()');assert.equal((await evaluate(a.sessionId,"IDBQA.lookup('retry')")).result.seq,first.seq);record('reopen / operation log readback');
 const beforeCrash=await evaluate(b.sessionId,'IDBQA.snapshot()');await evaluate(a.sessionId,"IDBQA.prepare('crash-before',IDBQA.keys.met,{bpm:170})");
 await send('Debugger.enable',{},a.sessionId);await evaluate(a.sessionId,"IDBQA.armCrash(); IDBQA.commit('crash-before'); 'started'",false);
 await poll(()=>paused.has(a.sessionId));await send('Target.closeTarget',{targetId:a.targetId});
 const terminationFact=(await evaluate(b.sessionId,"IDBQA.lookup('crash-before')")).result;
 const afterTermination=await evaluate(b.sessionId,'IDBQA.snapshot()');
 if(terminationFact){assert.equal(terminationFact.seq,beforeCrash.head.seq+1);assert.equal(afterTermination.head.seq,terminationFact.seq);
  assert.deepEqual(afterTermination.values,{...beforeCrash.values,'cruisePort.metronome':JSON.stringify({...JSON.parse(beforeCrash.values['cruisePort.metronome']),bpm:170})});}
 else{assert.equal(afterTermination.head.seq,beforeCrash.head.seq);assert.deepEqual(afterTermination.values,beforeCrash.values);}
 report.recordCallbackTermination=terminationFact?'committed-with-lost-response':'aborted';record('tab close during record callback: full commit fact or exact old snapshot, never partial');
 a=await tab();await evaluate(a.sessionId,`IDBQA.setup(${JSON.stringify(partition)})`);const packet=await evaluate(a.sessionId,"IDBQA.prepare('crash-after',IDBQA.keys.met,{bpm:175})");
 await evaluate(a.sessionId,"IDBQA.commit('crash-after'); 'response deliberately unobserved'",false);
 let fact;await poll(async()=>{fact=await evaluate(b.sessionId,"IDBQA.lookup('crash-after')");return !!fact.result;});
 await send('Target.closeTarget',{targetId:a.targetId});a=await tab();await evaluate(a.sessionId,`IDBQA.setup(${JSON.stringify(partition)})`);
 await evaluate(a.sessionId,`IDBQA.preparePacket(${JSON.stringify(packet)})`);assert.equal((await evaluate(a.sessionId,"IDBQA.commit('crash-after')")).replayed,true);
 assert.equal((await evaluate(a.sessionId,'IDBQA.snapshot()')).head.seq,fact.result.seq);record('tab close after commit / lost response retry preserves historical fact');
 const contexts=[];
 for(let i=0;i<2;i++){const c=await send('Target.createBrowserContext');contexts.push(c.browserContextId);const page=await tab(c.browserContextId);await evaluate(page.sessionId,`IDBQA.setup('partition-${i}')`);report.contexts.push(page);}
 const [c1,c2]=report.contexts;await evaluate(c1.sessionId,"IDBQA.prepare('private',IDBQA.keys.met,{bpm:181})");assert((await evaluate(c1.sessionId,"IDBQA.commit('private')")).ok);
 assert.equal((await evaluate(c1.sessionId,'IDBQA.snapshot()')).head.seq,2);assert.equal((await evaluate(c2.sessionId,'IDBQA.snapshot()')).head.seq,1);record('two BrowserContexts are distinct storage partitions; no cross-partition CAS claim');
 for(const id of contexts)await send('Target.disposeBrowserContext',{browserContextId:id});
 const upgrade=await evaluate(b.sessionId,'IDBQA.upgrade()');assert.equal(upgrade.status,'versionchange');assert.equal((await evaluate(a.sessionId,'IDBQA.status()')).status,'versionchange');
 assert.equal((await evaluate(a.sessionId,'IDBQA.futureOpen()')).reason,'future-schema');record('native versionchange closes both connections; future schema not overwritten');
 await poll(()=>fetchHandlers.size===0);report.fetchCompletions=fetchCompletions;report.unfinishedFetchHandlers=fetchHandlers.size;
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.missing,[]);assert.deepEqual(report.externalWrites,[]);report.result='PASS';
}catch(error){report.result='FAIL';report.failure=String(error.stack||error);process.exitCode=1;}
finally{writeFileSync('/private/tmp/l2a-native-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));ws?.close();cleanup();}
