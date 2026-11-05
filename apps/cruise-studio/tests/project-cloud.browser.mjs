/* Actual current product entrance + the existing Port native fixture + retained
 * Project Owner. All requests intercepted; only disposable local D1 is changed. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),out=process.env.STUDIO_CLIENT_OUTPUT;
assert(out?.startsWith('/private/tmp/')&&process.env.STUDIO_WORKER_ROOT,'isolated retained source/output required');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(here,'port-product-sync.browser.mjs'),'utf8'),start=source.indexOf(process.env.STUDIO_DEVICE_UI_ONLY==='1'?" await check('normal Account detach":" await check('public Studio restores");assert(start>0);
let run=source.slice(0,start)+`
 ${process.env.STUDIO_DEVICE_UI_ONLY==='1'?`await(await import(${JSON.stringify(path.join(here,'device-ui-polish.acceptance.mjs'))})).acceptDeviceUI({profile,bootstrapPro,check,result,OUT});`:`await(await import(${JSON.stringify(path.join(here,'project-cloud-product.acceptance.mjs'))})).acceptProjectCloud({profile,bootstrapPro,createAccount,createAccountCredential,accountCredentialVerifier,pepper,db,check,result,network,faults,OUT,port,nativeRuntime,normalGear,sync,go,ready});`}
 assert.deepEqual(errors,[]);result.status='PASS';result.realCredentialsUsed=false;
}catch(error){result.status='FAIL';result.error=String(error.stack||error);console.error(result.error);process.exitCode=1;}
finally{fs.writeFileSync(OUT+'/PROJECT-PRODUCT.json',JSON.stringify(result,null,2));for(const context of contexts)await context.close();await browser?.close();await mf?.dispose();stopBuildService();}process.exit(result.status==='PASS'?0:1);`;
// Reuse the first-connection, bidirectional save, reload and refresh portion of
// the existing four-app product cases. The later legacy conflict/right-pane suite
// is outside this scoped acceptance. No changed expectations or new Sync code.
if(process.env.STUDIO_NATIVE_APPS_ACCEPTANCE==='1'){
 const begin=source.indexOf(" const A=await profile('Port-A')"),end=source.indexOf('  const frameWindow=',begin);
 assert(begin>start&&end>begin,'existing native-app product case boundaries');
 run=run.replace(' assert.deepEqual(errors,[]);',` {${source.slice(begin,end)} }); await appSource.close();} assert.deepEqual(errors,[]);`);
}
run=run.replace(/const W=.*?,OUT=/,`const W=${JSON.stringify(root)},OUT=`).replace("from './fixtures/port-pc-profile.mjs'",`from '${here}/fixtures/port-pc-profile.mjs'`);
// Keep the legacy/native service used by current Port regression; add only the
// exact retained Project Owner to its synthetic route. Never edit Worker source.
run=run.replace('entry=workerWithoutProject(entry,src);',`const init=entry.slice(entry.indexOf('globalThis.window='),entry.indexOf('const {createStudioActivatedWorker}'));entry=workerWithoutProject(entry,src);entry="import {createIsolatedStudioDocumentOwner} from '"+src+"/studio-owner-document.js';"+init+entry.replace("return legacy.fetch(request,env,{});},scheduled:legacy.scheduled", "if(path==='/v2/studio/document')return createIsolatedStudioDocumentOwner({db:env.DB,env:{...env,STUDIO_DOCUMENT_RATE_LIMITER:{limit:async()=>({success:true})},STUDIO_REGISTRATION_RATE_LIMITER:{limit:async()=>({success:true})}},validateProject:window.CruiseStudio.model.validateProject,enabled:true,limits:{documents:100,operations:200,bytes:134217728},allowedOrigins:['https://studio.fixture.invalid'],verifyEnrollment:async()=>({ok:true})}).fetch(new Request(new URL('/isolated/studio/document',request.url),request));return legacy.fetch(request,env,{});},scheduled:legacy.scheduled");`);
if(process.env.STUDIO_PROJECT_RELEASE_PROFILE==='1'){
 run=run.replace("enabled:true,limits:{documents:100,operations:200,bytes:134217728}","enabled:true,release:true,retentionPolicy:{id:'synthetic-only',physicalDelete:true,minHistoryAgeMs:0,rateKeepMs:120000,intentLifetimeMs:60000},limits:{documents:100,operations:200,bytes:134217728}");
}
run=run.replace('db=await mf.getD1Database(\'DB\');',"db=await mf.getD1Database('DB');for(const sql of (await import(src+'/studio-document-schema.js')).STUDIO_DOCUMENT_DDL)await db.prepare(sql).run();await db.prepare('INSERT INTO studio_document_control VALUES(1,1,1,1)').run();");
run=run.replace("else assert.equal((await db.prepare(\"SELECT name FROM sqlite_master WHERE name LIKE 'studio_%'\").all()).results.length,0)","else assert((await db.prepare(\"SELECT name FROM sqlite_master WHERE name='studio_document_control'\").all()).results.length===1)");
if(process.env.STUDIO_PROJECT_RELEASE_PROFILE==='1')run=run.replace("for(const sql of (await import(src+'/studio-document-schema.js')).STUDIO_DOCUMENT_DDL)await db.prepare(sql).run();await db.prepare('INSERT INTO studio_document_control VALUES(1,1,1,1)').run();", "await (await import(src+'/studio-release-schema.js')).installStudioRelease(db);await db.prepare('UPDATE studio_document_control SET enabled=1').run();");
if(process.env.STUDIO_PROJECT_ACTIVATED_REHEARSAL==='1'){
 assert.equal(process.env.STUDIO_PROJECT_RELEASE_PROFILE,'1');
 // Exercise the retained deployment factory, including server activation,
 // evidence epoch and rate fences. Values below are synthetic, not rollout defaults.
 run=run.replace("fs.writeFileSync(OUT+'/entry.mjs',entry);",`entry="import {createStudioActivatedWorker} from '"+src+"/studio-release-worker.js';"+entry;
 const before=entry;entry=entry.replace(/return createIsolatedStudioDocumentOwner\\((\\{[\\s\\S]+?\\})\\)\\.fetch\\((new Request\\([\\s\\S]+?\\))\\);/,(_,configuration,request)=>"return createStudioActivatedWorker({legacy:{fetch(){return new Response(null,{status:404});},scheduled(){}},configuration:{...("+configuration+"),routeEnabled:true,evidencePolicy:{maxRows:4096,maxBytes:16777216},rate:{requests:600,windowMs:60000}}}).fetch("+request+",env,{});");assert.notEqual(entry,before,'activated fixture route installed');fs.writeFileSync(OUT+'/entry.mjs',entry);`);
 run=run.replace("await db.prepare('UPDATE studio_document_control SET enabled=1').run();","await db.prepare('UPDATE studio_document_control SET enabled=1').run();await (await import(src+'/studio-activation.js')).changeStudioActivation(db,{expectedRevision:0,operationId:randomUUID(),mode:'general',targets:[],reason:'synthetic deployment rehearsal only'});");
}
if(process.env.STUDIO_PROJECT_CANARY==='1'){
 assert.equal(process.env.STUDIO_PROJECT_RELEASE_PROFILE,'1');assert.notEqual(process.env.STUDIO_PROJECT_ACTIVATED_REHEARSAL,'1');
 // Existing harness, native credentials and route interception. This formal entry
 // is bundled unchanged; no localhost injection or synthetic Project Owner.
 run=run.replace("entry=workerWithoutProject(entry,src);", "entry=workerWithoutProject(entry,src);");
 const begin=run.indexOf('const init=entry.slice('),end=run.indexOf("fs.writeFileSync(OUT+'/entry.mjs',entry);",begin);
 assert(begin>0&&end>begin);run=run.slice(0,begin)+"entry=workerWithoutProject(entry,src);entry=\"import canary from '\"+src+\"/studio-canary-entry.js';\"+entry.replace('return legacy.fetch(request,env,{});},scheduled:legacy.scheduled','return canary.fetch(request,env,{});},scheduled:canary.scheduled');entry=entry.replaceAll('studio.fixture.invalid','soundcruise.jp');"+run.slice(end);
 run=run.replace("await db.prepare('UPDATE studio_document_control SET enabled=1').run();",'');
 run=run.replace("if(cloud)await context.addInitScript(()=>{globalThis.__SOUND_CRUISE_STUDIO_CLOUD__={endpoint:'https://backend.fixture.invalid/v2/studio/document',turnstile:async()=> 'synthetic'};});",'');
 run=run.replace('normalGear,sync,go,ready});',"normalGear,sync,go,ready,canary:(await import("+JSON.stringify(path.join(here,'project-canary.acceptance.mjs'))+")).canaryAcceptance({db,mf,src,check,network,OUT,profile,bootstrapPro})});");
 // Reused acceptance runs the normal packaged product entrance. The operator
 // activation fixture is retained; every browser request is intercepted.
 const acceptance=fs.readFileSync(path.join(here,'project-cloud-product.acceptance.mjs'),'utf8').replaceAll('https://studio.fixture.invalid/apps/cruise-studio/','https://soundcruise.jp/apps/cruise-studio/index.html');
 const acceptanceFile=path.join(out,'canary-product.acceptance.mjs');fs.writeFileSync(acceptanceFile,acceptance);
 run=run.replace(JSON.stringify(path.join(here,'project-cloud-product.acceptance.mjs')),JSON.stringify(acceptanceFile));
 run=run.replace("p.page.goto('https://studio.fixture.invalid/apps/cruise-studio/'+studioPage)", "p.page.goto('https://studio.fixture.invalid/apps/cruise-studio/index.html')");
 run=run.replaceAll('https://studio.fixture.invalid','https://soundcruise.jp');
 run=run.replace("entry:'workers/sound-cruise-sync/src/index.js'","entry:'workers/sound-cruise-sync/src/studio-canary-entry.js',delegate:'workers/sound-cruise-sync/src/index.js'");
 if(process.env.STUDIO_PROJECT_FINAL_ACCEPTANCE==='1')run=run.replace('scheduled:canary.scheduled','scheduled(event,env,ctx){return canary.scheduled(event,{...env,SYNC_DB:env.DB,SYNC_ASSETS:env.ASSETS,SYNC_ASSET_CLEANUP_ENABLED:\"true\"},ctx);}');
 run=run.replace("p.includes('/workers/sound-cruise-sync/')","p.includes('workers/sound-cruise-sync/')").replace('const inputs=Object.keys(built.metafile.inputs);',"const inputs=Object.keys(built.metafile.inputs);assert(inputs.some(p=>p.endsWith('/src/studio-canary-entry.js')));");
}
if(process.env.STUDIO_UI_BROWSER==='webkit'){
 run=run.replace("{chromium}=require('playwright')","{webkit:chromium}=require('playwright')");
 run=run.replaceAll("executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',",'').replaceAll("executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'",'');
 // WebKit's routed request inspection can omit or UTF-8-reencode binary bodies. Carry
 // original synthetic asset bytes through the existing local fixture binding;
 // the Worker still receives the original API, headers, hash and byte stream.
 run=run.replace('const tests=[],network=[]', 'const binaryBodies=new Map();const tests=[],network=[]');
 run=run.replace('await routeContext(context,label);', `await routeContext(context,label);
 await context.exposeBinding('__studioFixtureBinary',(_source,url,encoded)=>{binaryBodies.set(label+'|'+url,Buffer.from(encoded,'base64'));});
 await context.addInitScript(()=>{const native=globalThis.fetch;globalThis.fetch=async(input,options={})=>{const url=new URL(input instanceof Request?input.url:String(input),location.href).href,body=options.body;if(url.includes('/v1/sync/assets/')&&body instanceof Blob){const bytes=new Uint8Array(await body.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));await globalThis.__studioFixtureBinary(url,btoa(text));}return native(input,options);};});`);
 run=run.replace("const response=await mf.dispatchFetch(", "const original=binaryBodies.get(label+'|'+q.url());if(original){(result.webkitBinaryFixture??=[]).push({originalBytes:original.length,interceptedBytes:q.postDataBuffer()?.length});binaryBodies.delete(label+'|'+q.url());}const response=await mf.dispatchFetch(");
 run=run.replace('...(q.postDataBuffer()?', '...(original||q.postDataBuffer()?').replace('body:q.postDataBuffer()', 'body:original||q.postDataBuffer()');
}
// Record only status/code for synthetic Pro diagnostics, never credentials or payloads.
run=run.replace('const data=Buffer.from(await response.arrayBuffer());',`const data=Buffer.from(await response.arrayBuffer());if(u.pathname.startsWith('/v2/pro-auth/')){let code;try{code=JSON.parse(data.toString()).code;}catch{}(result.authResponses??=[]).push({label,path:u.pathname,status:response.status,...(code?{code}:{})});}`);
const file=path.join(out,'project-product-run.mjs');fs.writeFileSync(file,run);execFileSync(process.execPath,[file],{stdio:'inherit',env:process.env});
