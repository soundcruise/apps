// Metadata only from Production; all DDL/data below is disposable and synthetic.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {prepareStudioRelease} from '../scripts/studio-release-plan.mjs';
import {inspectStudioRelease,STUDIO_RELEASE_DDL} from '../src/studio-release-schema.js';
import {MAINTENANCE_V2_PROFILES} from '../src/maintenance-v2-profiles.js';
import {createStudioReleaseWorker} from '../src/studio-release-worker.js';
import {admitWriter} from '../src/writer-admission.js';
const metadata=JSON.parse(fs.readFileSync(new URL('./fixtures/studio-production-schema33.json',import.meta.url)));
function native(){const db=new DatabaseSync(':memory:');for(const type of ['table','view','index','trigger'])for(const r of metadata.schema.filter(r=>r.type===type))db.exec(r.sql);for(const r of metadata.journal)db.prepare('INSERT INTO d1_migrations(id,name) VALUES(?,?)').run(r.id,r.name);return db;}
function binding(db){function prepare(sql,values=[]){return{bind(...v){return prepare(sql,v);},async first(){return db.prepare(sql).get(...values)||null;},async all(){return{success:true,results:db.prepare(sql).all(...values)};}};}return{prepare};}
test('exact observed Production schema0033 installs OFF without changing shared objects/journal',async()=>{
 const db=native();try{const before=db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),history=db.prepare('SELECT * FROM d1_migrations ORDER BY id').all();
 const plan=await prepareStudioRelease(metadata);assert.equal(plan.report.baseFingerprint,MAINTENANCE_V2_PROFILES['33-production'].fingerprint);assert.equal(plan.report.statements,88);
 db.exec('BEGIN');try{db.exec(plan.sql);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 assert.equal(db.prepare('SELECT enabled FROM studio_document_control').get().enabled,0);assert.equal((await inspectStudioRelease(binding(db))).ddlHash,plan.report.ddlHash);
 assert.deepEqual(db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT GLOB 'studio_document_*' ORDER BY type,name").all(),before);assert.deepEqual(db.prepare('SELECT * FROM d1_migrations ORDER BY id').all(),history);
 assert.equal(STUDIO_RELEASE_DDL.length,83);assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE type='table' AND name GLOB 'studio_document_*'").get().n,23);
 const installed={schema:db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL").all().map(r=>({...r})),journal:metadata.journal};await assert.rejects(prepareStudioRelease(installed),/partial_or_replay/);
 db.prepare('UPDATE studio_document_migrations SET base_fingerprint=?').run(MAINTENANCE_V2_PROFILES['33'].fingerprint);await assert.rejects(inspectStudioRelease(binding(db)),/base_marker_mismatch/);
 }finally{db.close();}
});
test('schema/journal drift and partial installation are refused; failed guarded batch rolls back',async()=>{
 await assert.rejects(prepareStudioRelease({...metadata,journal:metadata.journal.slice(1)}),/base_unknown/);
 const drift=structuredClone(metadata);drift.schema.push({type:'table',name:'unexpected_table',sql:'CREATE TABLE unexpected_table(id TEXT)'});await assert.rejects(prepareStudioRelease(drift),/base_unknown/);
 await assert.rejects(prepareStudioRelease({...metadata,schema:[...metadata.schema,{type:'table',name:'studio_document_partial',sql:'CREATE TABLE studio_document_partial(id TEXT)'}]}),/partial_or_replay/);
 const db=native();try{const p=await prepareStudioRelease(metadata);db.exec('CREATE TABLE drift_before_install(id TEXT)');db.exec('BEGIN');assert.throws(()=>db.exec(p.sql));db.exec('ROLLBACK');assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name GLOB 'studio_document_*'").get().n,0);}finally{db.close();}
});
test('alternate entry defaults OFF without accessing DB; existing requests are passed intact',async()=>{
 let calls=0,scheduled=0;const legacy={async fetch(r,env,ctx){calls++;assert.equal(env.marker,1);assert(ctx);return new Response('legacy:'+new URL(r.url).pathname,{status:202});},scheduled(){scheduled++;}};
 const worker=createStudioReleaseWorker({legacy});const env={marker:1,SYNC_DB:{prepare(){throw Error('unexpected schema access');}}};
 const off=await worker.fetch(new Request('https://worker.invalid/v2/studio/document',{method:'POST'}),env,{});assert.equal(off.status,423);assert.equal((await off.json()).code,'studio_off');
 for(const url of ['/v1/sync/snapshot','/v2/accounts/summary','/v2/pro-auth/session','/news'])assert.equal((await worker.fetch(new Request('https://worker.invalid'+url),env,{})).status,202);assert.equal(calls,4);assert.equal(scheduled,0);
});
test('schema0033 compatibility requires real qualification rather than missing authority columns',async()=>{
 const db=native();try{
  await assert.rejects(admitWriter(binding(db),{deviceId:'synthetic-device',userId:'synthetic-user',appId:'port'},{},{membershipId:'synthetic-membership',accountId:'synthetic-account'}),/invalid_credential/);
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name IN('sync_writer_fence_assertion','sync_authority_cutovers','sync_asset_deletions')").get().n,0);
 }finally{db.close();}
});
