/* Actual current product entrance + the existing Port native fixture + retained
 * Project Owner. All requests intercepted; only disposable local D1 is changed. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),out=process.env.STUDIO_CLIENT_OUTPUT;
assert(out?.startsWith('/private/tmp/')&&process.env.STUDIO_WORKER_ROOT,'isolated retained source/output required');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(here,'port-product-sync.browser.mjs'),'utf8'),start=source.indexOf(" await check('public Studio restores");assert(start>0);
let run=source.slice(0,start)+`
 await(await import(${JSON.stringify(path.join(here,'project-cloud-product.acceptance.mjs'))})).acceptProjectCloud({profile,bootstrapPro,createAccount,createAccountCredential,accountCredentialVerifier,pepper,db,check,result,network,faults,OUT,port,nativeRuntime,normalGear,sync,go,ready});
 assert.deepEqual(errors,[]);result.status='PASS';result.realCredentialsUsed=false;
}catch(error){result.status='FAIL';result.error=String(error.stack||error);console.error(result.error);process.exitCode=1;}
finally{fs.writeFileSync(OUT+'/PROJECT-PRODUCT.json',JSON.stringify(result,null,2));for(const context of contexts)await context.close();await browser?.close();await mf?.dispose();stopBuildService();}process.exit(result.status==='PASS'?0:1);`;
run=run.replace(/const W=.*?,OUT=/,`const W=${JSON.stringify(root)},OUT=`).replace("from './fixtures/port-pc-profile.mjs'",`from '${here}/fixtures/port-pc-profile.mjs'`);
// Keep the legacy/native service used by current Port regression; add only the
// exact retained Project Owner to its synthetic route. Never edit Worker source.
run=run.replace('entry=workerWithoutProject(entry,src);',`const init=entry.slice(entry.indexOf('globalThis.window='),entry.indexOf('const {createStudioActivatedWorker}'));entry=workerWithoutProject(entry,src);entry="import {createIsolatedStudioDocumentOwner} from '"+src+"/studio-owner-document.js';"+init+entry.replace("return legacy.fetch(request,env,{});},scheduled:legacy.scheduled", "if(path==='/v2/studio/document')return createIsolatedStudioDocumentOwner({db:env.DB,env:{...env,STUDIO_DOCUMENT_RATE_LIMITER:{limit:async()=>({success:true})},STUDIO_REGISTRATION_RATE_LIMITER:{limit:async()=>({success:true})}},validateProject:window.CruiseStudio.model.validateProject,enabled:true,limits:{documents:100,operations:200,bytes:134217728},allowedOrigins:['https://studio.fixture.invalid'],verifyEnrollment:async()=>({ok:true})}).fetch(new Request(new URL('/isolated/studio/document',request.url),request));return legacy.fetch(request,env,{});},scheduled:legacy.scheduled");`);
if(process.env.STUDIO_PROJECT_RELEASE_PROFILE==='1'){
 run=run.replace("enabled:true,limits:{documents:100,operations:200,bytes:134217728}","enabled:true,release:true,retentionPolicy:{id:'synthetic-only',physicalDelete:true,minHistoryAgeMs:0,rateKeepMs:120000,intentLifetimeMs:60000},limits:{documents:100,operations:200,bytes:134217728}");
}
// Only fixture delivery may load excluded Cloud modules; the entry document is
// still the unmodified real release index, and production never requests them.
run=run.replace('body:fixtureFile(W,u.pathname)',"body:(u.pathname.startsWith('/apps/cruise-studio/js/cloud/')||u.pathname==='/apps/cruise-studio/cloud-panel.css')?fs.readFileSync(path.resolve(W,'.'+u.pathname)):fixtureFile(W,u.pathname)");
run=run.replace('db=await mf.getD1Database(\'DB\');',"db=await mf.getD1Database('DB');for(const sql of (await import(src+'/studio-document-schema.js')).STUDIO_DOCUMENT_DDL)await db.prepare(sql).run();await db.prepare('INSERT INTO studio_document_control VALUES(1,1,1,1)').run();");
run=run.replace("else assert.equal((await db.prepare(\"SELECT name FROM sqlite_master WHERE name LIKE 'studio_%'\").all()).results.length,0)","else assert((await db.prepare(\"SELECT name FROM sqlite_master WHERE name='studio_document_control'\").all()).results.length===1)");
if(process.env.STUDIO_PROJECT_RELEASE_PROFILE==='1')run=run.replace("for(const sql of (await import(src+'/studio-document-schema.js')).STUDIO_DOCUMENT_DDL)await db.prepare(sql).run();await db.prepare('INSERT INTO studio_document_control VALUES(1,1,1,1)').run();", "await (await import(src+'/studio-release-schema.js')).installStudioRelease(db);await db.prepare('UPDATE studio_document_control SET enabled=1').run();");
const file=path.join(out,'project-product-run.mjs');fs.writeFileSync(file,run);execFileSync(process.execPath,[file],{stdio:'inherit',env:process.env});
