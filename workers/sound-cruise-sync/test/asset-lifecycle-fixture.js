import { seed, environment, deps, jsonRequest, bucket, assetId, credential, webp } from './writer-authority-fixture.js';
import { handleProAuthorizedRequest } from './pro-entitlement-fixture.js';
import { handleRequest, handleScheduled } from '../src/app.js';
import { TEST_PRO_TOKEN, TEST_PRO_PEPPER } from './pro-entitlement-fixture.js';
import { createD1AssetRepository } from '../src/asset-database.js';
import { createIsolatedWriterPolicy } from '../src/writer-fence.js';
import { createIsolatedCutoverController } from '../src/authority-cutover.js';
import { hashRecord } from '../src/records.js';
import { sha256Hex } from '../src/asset-validation.js';

export async function lifecycleFixture({ db = seed(), r2 = bucket(), policy = false, kind = 'gear_photo_final' } = {}) {
  const practice = kind === 'practice_attachment_text';
  const bytes = practice ? new TextEncoder().encode('isolated attachment') : webp(512,512);
  const hash = await sha256Hex(bytes), key = `assets/account-a/port-user-a/${assetId}/${kind}`;
  const mime = practice ? 'text/plain' : 'image/webp', dimension = practice ? 1 : 512;
  if (practice) await db.prepare(`INSERT INTO sync_records(user_id,app_id,record_type,record_id,payload_json,
    payload_hash,revision,updated_at,updated_by_device_id,last_operation_id,schema_version)
    VALUES ('port-user-a','port','practice_menu','practice-a','{}',?,1,1,?,'practice-seed',1)`)
    .bind('4'.repeat(64),credential.split('.')[1]).run();
  await db.prepare(`INSERT INTO sync_assets(asset_id,account_id,membership_id,sync_user_id,kind,state,
    storage_category,content_hash,mime_type,byte_size,width,height,object_key,object_version,
    created_by_device_id,owner_record_type,owner_record_id,original_filename,created_at,updated_at,uploaded_at,committed_at,unreferenced_at)
    VALUES (?,'account-a','port-membership-a','port-user-a',?,'unreferenced',?,?,?,?,?,?,?,1,?,?,?,?,1,1,1,1,1)`)
    .bind(assetId,kind,practice?'practice_attachment':'image',hash,mime,bytes.byteLength,dimension,dimension,key,
      credential.split('.')[1],practice?'practice_menu':null,practice?'practice-a':null,practice?'note.txt':null).run();
  await r2.put(key,bytes,{customMetadata:{hash,assetId,kind}});
  const env={...environment(db,r2),PRO_CREDENTIAL_PEPPER:TEST_PRO_PEPPER};
  const capability=createIsolatedWriterPolicy('account-a');
  const dependencies={...deps(),...(policy?{writerPolicy:capability}:{})};
  const repo=createD1AssetRepository(db);
  let wire=policy?{writerProtocol:2,syncProtocol:1,expectedWriteEpoch:1}:{};
  async function send(path,body) {
    const req=jsonRequest('/v1/sync/'+path,{appId:'port',...body,...wire});
    if (db.raw) return handleProAuthorizedRequest(req,env,null,dependencies);
    req.headers.set('X-Sound-Cruise-Pro-Authorization',`Bearer ${TEST_PRO_TOKEN}`);
    return handleRequest(req,env,null,dependencies);
  }
  async function operation({baseRevision=0,deleted=false}={}) {
    const asset={assetId,kind,hash,mime,byteSize:bytes.byteLength,width:dimension,height:dimension,objectVersion:1,availability:'available'};
    const recordType=practice?'practice_attachment':kind.startsWith('gear')?'gear_item':'my_app';
    const recordId=practice?'423e4567-e89b-42d3-a456-426614174000':'owner-1';
    const value=practice?{practiceId:'practice-a',fileName:'note.txt',kind:'file',mimeType:mime,byteSize:bytes.byteLength,
      createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',asset:{...asset,ownerRecordId:'practice-a',originalFilename:'note.txt'}}
      :{item:{id:recordId,name:'Lifecycle fixture'},asset:{version:1,availability:'available',final:asset,source:null,crop:null}};
    const op={operationId:crypto.randomUUID(),recordType,recordId,schemaVersion:1,baseRevision,deleted,
      payload:deleted?null:{id:recordId,value}};
    op.payloadHash=await hashRecord(op,crypto,'port');return op;
  }
  const row=()=>db.prepare('SELECT * FROM sync_assets WHERE asset_id=?').bind(assetId).first();
  const claim=async()=>{const ok=await repo.claimCleanup(await row(),Date.now());return ok?repo.getCleanupClaim(assetId):null;};
  const push=async op=>send('push',{mode:'sync',operations:[op||await operation()]});
  const scheduled=()=>handleScheduled(null,env,{createCleanupRepository:()=>({cleanup:async()=>({})})});
  const controller=createIsolatedCutoverController(db,capability);
  const enforce=async()=>{for(const phase of ['prepared','paused','enforced'])await controller.transition({accountId:'account-a',migrationId:'lifecycle',generation:'g1',operationId:phase,phase});wire={writerProtocol:2,syncProtocol:1,expectedWriteEpoch:2};};
  return {db,r2,env,repo,send,operation,push,row,claim,scheduled,enforce,key,hash,bytes,assetId};
}
