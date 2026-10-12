// Explicit local-runtime check. No production config, account ID, remote binding or network API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { seed, environment, deps, jsonRequest, bucket } from './writer-authority-fixture.js';
import { seedTestPro, TEST_PRO_TOKEN, TEST_PRO_PEPPER } from './pro-entitlement-fixture.js';
import { handleRequest } from '../src/app.js';
import { createIsolatedWriterPolicy } from '../src/writer-fence.js';
import { createIsolatedCutoverController } from '../src/authority-cutover.js';
import { hashRecord } from '../src/records.js';

test('actual local workerd D1: guard trigger, atomic rollback, race, concurrent idempotent cutover',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("isolated");}}',
   compatibilityDate:'2026-09-01',d1Databases:{SYNC_DB:'b15-isolated'},r2Buckets:['SYNC_ASSETS']}));
 t.after(()=>mf.dispose()); const db=await mf.getD1Database('SYNC_DB'),source=seed();t.after(()=>source.close());await seedTestPro(source);
 const schema=source.raw.prepare("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all();
 for(const row of schema)await db.prepare(row.sql).run();
 for(const table of schema.filter(r=>r.type==='table'))for(const row of source.raw.prepare(`SELECT * FROM ${table.name}`).all()){
   const keys=Object.keys(row);await db.prepare(`INSERT INTO ${table.name} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...Object.values(row)).run();
 }
 const env={...environment(db,await mf.getR2Bucket('SYNC_ASSETS')),PRO_CREDENTIAL_PEPPER:TEST_PRO_PEPPER};
 const policy=createIsolatedWriterPolicy('account-a'),dependencies={...deps(),writerPolicy:policy},ctl=createIsolatedCutoverController(db,policy);
 const transition=phase=>ctl.transition({accountId:'account-a',migrationId:'m1',generation:'g1',operationId:phase,phase});
 const op={operationId:crypto.randomUUID(),recordType:'metronome_settings',recordId:'default',schemaVersion:1,baseRevision:0,deleted:false,
 payload:{id:'default',value:{version:3,bpm:120,meter:'4/4',rhythm:'quarter',sound:'electronic',volume:70,accents:[true,false,false,false]}}};op.payloadHash=await hashRecord(op,crypto,'port');
 const send=async(fields={},operation=op)=>{const req=jsonRequest('/v1/sync/push',{appId:'port',mode:'sync',operations:[operation],...fields});req.headers.set('X-Sound-Cruise-Pro-Authorization',`Bearer ${TEST_PRO_TOKEN}`);return handleRequest(req,env,null,dependencies);};
 assert.equal((await send()).status,200);
 await transition('prepared');await transition('paused');
 const concurrent=await Promise.all([transition('enforced'),transition('enforced')]);assert.equal(concurrent[0].target_epoch,2);assert.deepEqual(concurrent[0],concurrent[1]);
 assert.equal((await (await send()).json()).code,'writer_protocol_required');
 const valid={writerProtocol:2,syncProtocol:1,expectedWriteEpoch:2};assert.equal((await send(valid)).status,200);
 await assert.rejects(db.batch([db.prepare('UPDATE sync_datasets SET record_count=999'),db.prepare("INSERT INTO sync_writer_fence_assertion VALUES ('dataset_epoch_stale')")]),/b15_dataset_epoch_stale/);
 assert.equal((await db.prepare('SELECT record_count FROM sync_datasets').first()).record_count,1);
 // Revoke after admission but before actual D1 batch. Real trigger must abort every mutation.
 const session=db.withSession('first-primary'),original=session.batch.bind(session);let raced=false;
 const hookedBatch=async statements=>{if(!raced){raced=true;await db.prepare('UPDATE sync_devices SET revoked_at=2').run();}return original(statements);};
 env.SYNC_DB={prepare:db.prepare.bind(db),withSession:()=>({prepare:session.prepare.bind(session),batch:hookedBatch})};
 const changed={...op,operationId:crypto.randomUUID(),baseRevision:1};
 assert.equal((await (await send(valid,changed)).json()).code,'invalid_credential');
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_changes').first()).n,1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM sync_writer_fence_assertion').first()).n,0);
});
