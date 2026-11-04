/* Existing RC4 additive DDL in disposable Miniflare only. No deployment/remote DDL. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
import {installStudioRelease,inspectStudioRelease,STUDIO_RELEASE_DDL,STUDIO_RELEASE_ID} from '../src/studio-release-schema.js';
import {STUDIO_DOCUMENT_DDL} from '../src/studio-document-schema.js';
const runtime=process.env.STUDIO_TEST_RUNTIME;
test('existing release DDL preserves schema0033, shared rows and journal; OFF, replay and partial guards remain',{skip:!runtime&&'Dedicated local runtime required'},async()=>{
 const {Miniflare,convertV4MiniflareOptions}=createRequire(runtime)('miniflare'),fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/maintenance-v2-schema33.json',import.meta.url)));
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response(null,{status:404})}}',compatibilityDate:'2026-09-01',host:'127.0.0.1',port:0,inspectorPort:0,d1Databases:{DB:'release-ddl',PARTIAL:'partial-ddl'},outboundService:()=>{throw Error('remote forbidden');}}));
 try{
  const db=await mf.getD1Database('DB'),partial=await mf.getD1Database('PARTIAL');
  for(const target of [db,partial]){for(const sql of fixture.base_sql)await target.prepare(sql).run();for(const row of fixture.journal)await target.prepare('INSERT INTO d1_migrations(id,name) VALUES(?,?)').bind(row.id,row.name).run();}
  // Preexisting synthetic Account/Pro plus Port/four-app rows must survive too.
  await db.prepare("INSERT INTO sync_accounts(id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,admission_provenance) VALUES('existing-account','active',1,'existing-account-verifier',1,1,1,'production')").run();
  await db.prepare("INSERT INTO sync_account_devices(id,account_id,credential_version,credential_verifier,created_at,last_seen_at) VALUES('existing-device','existing-account',1,'existing-device-verifier',1,1)").run();
  await db.prepare("INSERT INTO pro_auth_state(singleton_id,generation,active_code_slot,legacy_compat_enabled,updated_at) VALUES(1,1,'A',1,1)").run();
  await db.prepare("INSERT INTO pro_credentials(id,verifier,generation,scope,created_at) VALUES('existing-pro',?,1,'global_pro',1)").bind('1'.repeat(64)).run();
  await db.prepare("INSERT INTO sync_users(id,state,created_at,updated_at) VALUES('existing-user','provisioning',1,1)").run();
  for(const [app,type]of [['port','gear_item'],['pitch','custom_stage'],['fretboard','custom_route'],['rhythm','custom_preset'],['chord','chord']])await db.prepare("INSERT INTO sync_records(user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,last_operation_id) VALUES('existing-user',?,?,'existing-record',?,'old-hash',1,1,'old-operation')").bind(app,type,JSON.stringify({synthetic:true})).run();
  const tables=fixture.base_sql.map(sql=>/^CREATE TABLE\s+["`]?([a-zA-Z0-9_]+)/.exec(sql)?.[1]).filter(Boolean),rows=await Promise.all(tables.map(async name=>[name,(await db.prepare('SELECT * FROM '+name).all()).results]));
  const before=(await db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all()).results,journal=(await db.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results;
  const info=await installStudioRelease(db);assert.equal(info.migrationId,STUDIO_RELEASE_ID);assert.deepEqual(await inspectStudioRelease(db),info);assert.equal((await db.prepare('SELECT enabled FROM studio_document_control').first()).enabled,0);
  assert.deepEqual((await db.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'studio_document_%' ORDER BY type,name").all()).results,before);
  assert.deepEqual((await db.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results,journal);
  assert.deepEqual(await Promise.all(tables.map(async name=>[name,(await db.prepare('SELECT * FROM '+name).all()).results])),rows);
  assert(STUDIO_RELEASE_DDL.every(sql=>/^CREATE (TABLE|VIEW|INDEX|TRIGGER) studio_document_/.test(sql)));
  await assert.rejects(installStudioRelease(db),/studio_migration_partial_or_replay/);
  await partial.prepare(STUDIO_DOCUMENT_DDL[0]).run();await assert.rejects(installStudioRelease(partial),/studio_migration_partial_or_replay/);assert.equal((await partial.prepare('SELECT count(*) n FROM d1_migrations').first()).n,33);
 }finally{await mf.dispose();}
});
