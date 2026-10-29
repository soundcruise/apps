// Synthetic candidate tests. Real native D1 only; no Production access or credentials.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto,randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
if(!process.env.STUDIO_TEST_OUTPUT || !process.env.STUDIO_TEST_RUNTIME){
 const {test}=await import('node:test');test('Studio Owner native integration',{skip:'Dedicated synthetic runtime/output required; see STUDIO_OWNER_DOCUMENT.md'},()=>{});
}else{
const ROOT=process.env.STUDIO_TEST_OUTPUT, W=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'); if(!ROOT)throw Error('STUDIO_TEST_OUTPUT required');
const runtime=process.env.STUDIO_TEST_RUNTIME; if(!runtime)throw Error('STUDIO_TEST_RUNTIME required');
const {Miniflare,convertV4MiniflareOptions}=createRequire(runtime)('miniflare');
const {build}=createRequire(runtime)('esbuild');
const {spawnSync}=await import('node:child_process');
const release=await import(path.join(srcPlaceholder(),'studio-release-schema.js'));
function srcPlaceholder(){return path.join(W,'workers/sound-cruise-sync/src');}
const src=path.join(W,'workers/sound-cruise-sync/src');
const {createAccountCredential,accountCredentialVerifier,createAccountRecoveryCode}=await import(path.join(src,'account-crypto.js'));
const {hmacVerifier}=await import(path.join(src,'crypto.js'));
const sha=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const now=Date.now(), pepper='synthetic-only-account-key-not-a-production-secret',proPepper='synthetic-only-pro-key-not-a-production-secret';
const result={scope:'studio-release-rc3-batch-boundaries',production:false,productAcceptance:false,tests:[]};
const HTTP_PROBE=false;
let mf,db;
const state=fs.mkdtempSync(path.join(ROOT,'native-state-'));
let legacyScript;
async function boot(){
 if(process.env.STUDIO_RC2_HTTP_ONLY==='1'&&!legacyScript){const entry=`globalThis.window={CruiseStudio:{},ChordCruise:{},crypto};await import('${W}/apps/cruise-studio/js/core/music-theory.js');await import('${W}/apps/cruise-studio/js/core/song-model.js');await import('${W}/apps/chord-cruise/js/core/music-theory.js');const schema=await import('${W}/apps/cruise-studio/js/core/schema2.js');window.CruiseStudio.schema2=schema.default;window.CruiseStudio.model.configureSchema2();const {createIsolatedStudioDocumentOwner}=await import('${src}/studio-owner-document.js');export default {fetch(request,env){return createIsolatedStudioDocumentOwner({db:env.DB,env:{...env,STUDIO_DOCUMENT_RATE_LIMITER:{limit:async()=>({success:true})}},validateProject:window.CruiseStudio.model.validateProject,enabled:true,release:true,limits:{documents:100,operations:200,bytes:134217728},allowedOrigins:['https://studio.fixture.invalid']}).fetch(request)}};`;legacyScript=(await build({stdin:{contents:entry,resolveDir:W,sourcefile:'rc2-http.mjs'},bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,logLevel:'silent'})).outputFiles[0].text;}

 if(process.env.STUDIO_RC_V137_ONLY==='1'&&!legacyScript){const entry=`import worker from '${src}/studio-release-entry.js';export default {async fetch(request,env,ctx){env={...env,SYNC_RATE_LIMITER:{limit:async()=>({success:true})}};if(new URL(request.url).pathname==='/fixture/scheduled'){const jobs=[];await worker.scheduled({},env,{waitUntil:p=>jobs.push(p)});await Promise.all(jobs);return new Response('done');}return worker.fetch(request,env,ctx);}};`;legacyScript=(await build({stdin:{contents:entry,resolveDir:W,sourcefile:'rc-v137-fixture.mjs'},bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,logLevel:'silent'})).outputFiles[0].text;}
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:legacyScript||'export default {fetch(){return new Response("fixture only",{status:404})}}',bindings:{SYNC_ACCOUNT_CREDENTIAL_PEPPER:pepper,SYNC_ACCOUNT_RECOVERY_PEPPER:pepper,SYNC_CREDENTIAL_PEPPER:pepper,PRO_CREDENTIAL_PEPPER:proPepper,ALLOWED_ORIGINS:'https://studio.fixture.invalid',ACCOUNT_ALLOWED_ORIGINS:'https://studio.fixture.invalid',SYNC_ALLOWED_APP_IDS:'port,chord,pitch,fretboard,rhythm'},compatibilityDate:'2026-09-01',host:'127.0.0.1',port:0,inspectorPort:0,d1Databases:{DB:'studio-feasibility-shared',SYNC_DB:'studio-feasibility-shared'},r2Buckets:{BUCKET:'fixture-r2',SYNC_ASSETS:'fixture-r2'},resourcePersistencePath:state,resourceTmpPath:path.join(state,'tmp'),outboundService:()=>{throw Error('external network forbidden');}}));db=await mf.getD1Database('DB');}

const fixture=JSON.parse(fs.readFileSync(path.join(W,'workers/sound-cruise-sync/test/fixtures/maintenance-v2-schema33.json')));
const realm={window:{CruiseStudio:{},ChordCruise:{},crypto:webcrypto},TextEncoder,Date};
for(const f of ['core/music-theory.js','core/song-model.js'])vm.runInNewContext(fs.readFileSync(path.join(W,'apps/cruise-studio/js',f),'utf8'),realm);
vm.runInNewContext(fs.readFileSync(path.join(W,'apps/chord-cruise/js/core/music-theory.js'),'utf8'),realm);
const C=realm.window.CruiseStudio;C.schema2=createRequire(import.meta.url)(path.join(W,'apps/cruise-studio/js/core/schema2.js'));C.model.configureSchema2();
const project=JSON.parse(JSON.stringify(C.model.createSampleProject()));
async function init(){
 for(const sql of fixture.base_sql)await db.prepare(sql).run();
 for(const row of fixture.journal)await db.prepare('INSERT INTO d1_migrations(id,name) VALUES (?,?)').bind(row.id,row.name).run();
 const migrationPlan=await release.studioReleasePlan(db);fs.writeFileSync(path.join(ROOT,'MIGRATION-PLAN.json'),JSON.stringify({hash:migrationPlan.hash,fingerprint:migrationPlan.fingerprint,schema:migrationPlan.schema,journal:migrationPlan.journal},null,2)+'\n');await release.installStudioRelease(db);
 await db.prepare('UPDATE studio_document_control SET enabled=1').run();
 await db.prepare("INSERT INTO sync_account_runtime_control(singleton_id,rollout_mode,account_admission_enabled,membership_admission_enabled,account_read_enabled,account_recovery_enabled,account_delete_enabled,port_orchestration_enabled,generation,updated_at) VALUES(1,'open',1,0,1,0,1,0,1,1)").run();
 await db.prepare("INSERT INTO pro_auth_state(singleton_id,generation,active_code_slot,legacy_compat_enabled,updated_at,session_lifecycle_started_at,unbound_backend_until) VALUES(1,1,'A',1,?,?,?)").bind(now,now,now+600000).run();
}
async function account(){const id=randomUUID(),c=createAccountCredential();await db.prepare("INSERT INTO sync_accounts(id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,admission_provenance) VALUES(?,'active',1,?,1,1,1,'production')").bind(id,sha(id)).run();return device({id},c);}
async function device(a,c=createAccountCredential()){const verifier=await accountCredentialVerifier(c.credential,pepper);await db.prepare('INSERT INTO sync_account_devices(id,account_id,credential_version,credential_verifier,created_at,last_seen_at) VALUES(?,?,1,?,1,1)').bind(c.deviceId,a.id,verifier).run();return {...a,...c,verifier};}
async function pro(){const id=randomUUID(),token='scp1.'+id+'.'+'a'.repeat(43),verifier=await hmacVerifier('sound-cruise-pro:v1:'+token,proPepper);await db.prepare("INSERT INTO pro_credentials(id,verifier,generation,scope,created_at) VALUES(?,?,1,'global_pro',?)").bind(id,verifier,now).run();return{id,token,verifier};}
async function count(table){return(await db.prepare('SELECT count(*) n FROM '+table).first()).n;}
async function oldRows(){const pairs=[];for(const sql of fixture.base_sql){const m=/^CREATE TABLE\s+["`]?([a-zA-Z0-9_]+)/.exec(sql);if(m&&!m[1].startsWith('sqlite_')&&m[1]!=='sync_account_activity')pairs.push([m[1],(await db.prepare('SELECT * FROM '+m[1]).all()).results]);}return sha(pairs);}
async function check(name,fn){await fn();result.tests.push({name,result:'PASS'});console.log('PASS '+name);}

const {STUDIO_DOCUMENT_DDL}=await import(path.join(src,'studio-document-schema.js'));
const {createIsolatedStudioDocumentOwner,studioCanonical,studioDigest,studioDocumentUpload}=await import(path.join(src,'studio-owner-document.js'));
function headers(a,p){return new Headers({Authorization:'Bearer '+a.credential,'X-Sound-Cruise-Pro-Authorization':'Bearer '+p.token});}
let owner,A,B,P,id;
function makeOwner(binding=db,options={}){return createIsolatedStudioDocumentOwner({db:binding,env:{SYNC_ACCOUNT_CREDENTIAL_PEPPER:pepper,PRO_CREDENTIAL_PEPPER:proPepper,SYNC_ACCOUNT_RECOVERY_PEPPER:pepper},validateProject:C.model.validateProject,enabled:true,release:true,limits:{documents:100,operations:200,bytes:128*1024*1024},...options});} // OWNER_FACTORY_END
async function input(doc,revision=0,deleted=false){const text=deleted?'':studioCanonical(doc),parts=[];for(let i=0;i<text.length;i+=30000)parts.push(text.slice(i,i+30000));const chunks=[];for(const p of parts)chunks.push({digest:await studioDigest(p),bytes:Buffer.byteLength(p)});return {body:{operationId:randomUUID(),documentId:doc.projectId,expectedRevision:revision,manifest:{digest:await studioDigest(text),bytes:Buffer.byteLength(text),chunks,deleted}},parts};}
async function stage(a,doc,rev=0,deleted=false){await owner.enroll(headers(a,P));const uploaded=deleted?null:await studioDocumentUpload(doc,rev);const x=deleted?await input(doc,rev,true):{body:uploaded.request,parts:uploaded.parts};await owner.begin(headers(a,P),x.body);for(let i=0;i<x.parts.length;i++)await owner.upload(headers(a,P),x.body.operationId,i,x.parts[i]);return x;}
const {studioRetentionDryRun,studioPhysicalPurge,studioLegacyCleanupGate}=await import(path.join(src,'studio-retention-rc.js'));
const {createStudioReleaseWorker,createStudioReleaseFixtureCapability}=await import(path.join(src,'studio-release-worker.js'));
const backup=await import(path.join(W,'workers/sound-cruise-sync/scripts/studio-fixture-backup.mjs'));
let bucket;
async function freshBase(fn){const local=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response(null,{status:404})}}',compatibilityDate:'2026-09-01',host:'127.0.0.1',port:0,inspectorPort:0,d1Databases:{DB:randomUUID()},outboundService:()=>{throw Error('forbidden network')}}));try{const d=await local.getD1Database('DB');for(const sql of fixture.base_sql)await d.prepare(sql).run();for(const r of fixture.journal)await d.prepare('INSERT INTO d1_migrations(id,name) VALUES(?,?)').bind(r.id,r.name).run();return await fn(d);}finally{await local.dispose();}}
async function raceCommit(x,alter){const spec=new WeakMap();let fired=false;function stmt(sql,v=[]){const native=db.prepare(sql).bind(...v),s={bind(...a){return stmt(sql,a)},first:(...a)=>native.first(...a),all:(...a)=>native.all(...a),run:(...a)=>native.run(...a)};spec.set(s,{sql,native});return s;}const r={prepare:s=>stmt(s),async batch(ss){const a=ss.map(s=>spec.get(s));if(!fired&&a.some(s=>/INSERT INTO studio_document_records/.test(s.sql))){fired=true;await alter();}return db.batch(a.map(s=>s.native));}};await assert.rejects(()=>makeOwner(r).commit(headers(B,P),x.body.operationId));assert(fired);assert.equal((await db.prepare('SELECT count(*) n FROM studio_document_receipts WHERE operation_id=?').bind(x.body.operationId).first()).n,0);}


let x;
const chunks=(x,start=0,n=4)=>x.parts.slice(start,start+n).map((data,j)=>({index:start+j,data}));
async function pendingDoc(a=A){const doc={...project,projectId:randomUUID(),extensions:{batch:'あ'.repeat(190000)}};const u=await studioDocumentUpload(doc,0);await owner.enroll(headers(a,P));await owner.begin(headers(a,P),u.request);return{body:u.request,parts:u.parts,doc};}
async function rows(x){return (await db.prepare('SELECT * FROM studio_document_chunks WHERE operation_id=? ORDER BY ordinal').bind(x.body.operationId).all()).results;}
try{await boot();await init();A=await account();B=await account();P=await pro();owner=makeOwner();
 await check('four chunks one authorized batch and exact ACK binding',async()=>{x=await pendingDoc();const r=await owner.uploadBatch(headers(A,P),{operationId:x.body.operationId,chunks:chunks(x)});assert.equal(r.operationId,x.body.operationId);assert.equal(r.manifestDigest,x.body.manifest.digest);assert.deepEqual(r.indexes,[0,1,2,3]);assert.equal((await rows(x)).length,4);});
 await check('lost ACK explicit replay is idempotent; no double charge',async()=>{const before=await rows(x);await owner.uploadBatch(headers(A,P),{operationId:x.body.operationId,chunks:chunks(x)});assert.deepEqual(await rows(x),before);assert.equal((await owner.reconcile(headers(A,P),x.body.operationId)).status,'pending');});
 await check('bad second digest rejects all chunks',async()=>{const y=await pendingDoc(),c=chunks(y);c[1].data+='x';await assert.rejects(()=>owner.uploadBatch(headers(A,P),{operationId:y.body.operationId,chunks:c}));assert.equal((await rows(y)).length,0);});
 await check('duplicate ordinal and oversized batch rejected',async()=>{const y=await pendingDoc();for(const c of [[chunks(y)[0],chunks(y)[0]],chunks(y,0,5)])await assert.rejects(()=>owner.uploadBatch(headers(A,P),{operationId:y.body.operationId,chunks:c}));assert.equal((await rows(y)).length,0);});
 await check('collision in last chunk rolls back preceding inserts',async()=>{const y=await pendingDoc();await db.prepare('INSERT INTO studio_document_chunks VALUES(?,?,?,?,?,?)').bind(A.id,y.body.operationId,3,'wrong','0'.repeat(64),5).run();await assert.rejects(()=>owner.uploadBatch(headers(A,P),{operationId:y.body.operationId,chunks:chunks(y)}));const r=await rows(y);assert.equal(r.length,1);assert.equal(r[0].ordinal,3);});
 await check('foreign Account cannot stage A; normal B continues',async()=>{await owner.enroll(headers(B,P));await assert.rejects(()=>owner.uploadBatch(headers(B,P),{operationId:x.body.operationId,chunks:chunks(x)}));const y=await pendingDoc(B);await owner.uploadBatch(headers(B,P),{operationId:y.body.operationId,chunks:chunks(y)});assert.equal((await rows(y)).length,4);});
 await check('final SQL revocation rolls back entire batch',async()=>{const y=await pendingDoc(),spec=new WeakMap();let fired=false;function prep(sql,v=[]){const n=db.prepare(sql).bind(...v),s={bind:(...a)=>prep(sql,a),all:()=>n.all(),first:(...a)=>n.first(...a),run:()=>n.run()};spec.set(s,{sql,n});return s;}const wrapped={prepare:prep,async batch(ss){const a=ss.map(s=>spec.get(s));if(!fired&&a.some(s=>s.sql.startsWith('INSERT INTO studio_document_chunks'))){fired=true;await db.prepare('UPDATE sync_account_devices SET revoked_at=1 WHERE id=?').bind(A.deviceId).run();}return db.batch(a.map(s=>s.n));}};await assert.rejects(()=>makeOwner(wrapped).uploadBatch(headers(A,P),{operationId:y.body.operationId,chunks:chunks(y)}));assert(fired);assert.equal((await rows(y)).length,0);await db.prepare('UPDATE sync_account_devices SET revoked_at=NULL WHERE id=?').bind(A.deviceId).run();});
 await check('incomplete manifest cannot commit',async()=>{await assert.rejects(()=>owner.commit(headers(A,P),x.body.operationId));});
 await check('remaining batch complete manifest commit and readback',async()=>{for(let i=4;i<x.parts.length;i+=4)await owner.uploadBatch(headers(A,P),{operationId:x.body.operationId,chunks:chunks(x,i)});assert.equal((await owner.commit(headers(A,P),x.body.operationId)).revision,1);assert.deepEqual((await owner.snapshot(headers(A,P),x.doc.projectId)).project,x.doc);});
 await check('crash reopen preserves committed receipt and B operation',async()=>{await mf.dispose();mf=null;await boot();owner=makeOwner();assert.equal((await owner.reconcile(headers(A,P),x.body.operationId)).revision,1);const y=await pendingDoc(B);await owner.uploadBatch(headers(B,P),{operationId:y.body.operationId,chunks:chunks(y)});assert.equal((await rows(y)).length,4);});
 result.pass=result.tests.length;result.status='PASS';
}catch(e){result.status='FAIL';result.error=String(e.stack);console.error(e);process.exitCode=1;}finally{if(mf)await mf.dispose();fs.writeFileSync(path.join(ROOT,'RC3-NATIVE-RESULT.json'),JSON.stringify(result,null,2)+'\n');}
}
