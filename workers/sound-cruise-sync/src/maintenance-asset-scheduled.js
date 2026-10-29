import { assertion, clearAssertions } from './writer-fence.js';
import { createD1AssetRepository } from './asset-database.js';
import { createIsolatedMaintenanceBridgeV2, maintenanceCanonical, maintenanceDigest } from './maintenance-bridge-v2.js';
// Dedicated isolated scheduler capability. Never imported by app/index.
// Caller provides the existing Asset Owner verifier, not an unverified event payload.
export function createIsolatedMaintenanceAssetScheduled({db,bucket,owner,scope}){
 const core=createIsolatedMaintenanceBridgeV2({db,owner}),repo=createD1AssetRepository(db);
 async function references(row){
  if((await db.prepare('SELECT COUNT(*) n FROM sync_records WHERE deleted_at IS NULL AND NOT json_valid(payload_json)').first()).n)throw Error('cleanup_unknown_json');
  const hit=await db.prepare("SELECT 1 found FROM sync_records r,json_tree(r.payload_json) j WHERE r.deleted_at IS NULL AND j.type='text' AND j.value=? LIMIT 1").bind(row.asset_id).first();
  if(hit)throw Error('cleanup_reference_hold');
 }
 async function run(request,{assetId}={}){
  if(request.scope!==scope||request.kind!=='external')throw Error('cleanup_scope');
  const stage=await core.checkSchema();if(![36,37,'owner-candidate'].includes(stage))return{status:'HOLD',reason:'cleanup_schema',stage};
  const prior=await db.prepare('SELECT phase FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(request.operationId).first();
  if(prior)return{status:'HOLD',reason:'explicit_reconcile_required'};
  const row=await db.prepare('SELECT * FROM sync_assets WHERE asset_id=?').bind(assetId).first();
  if(!row||row.state!=='unreferenced'||!Number.isSafeInteger(row.unreferenced_at)||row.unreferenced_at>Date.now()-30*86400000)throw Error('cleanup_retention_hold');
  if(typeof owner.verifyCleanup!=='function')throw Error('cleanup_owner_missing');
  const proof=await owner.verifyCleanup(request,row);if(proof?.allowed!==true||proof.assetDigest!==await maintenanceDigest(row))throw Error('cleanup_owner_hold');
  await references(row);
  const pending={sourceManifestDigest:await maintenanceDigest(row),objectDigest:row.content_hash,objectKey:row.object_key,assetId:row.asset_id,objectVersion:row.object_version,kind:'asset-delete'};
  const input={...request,pendingDigest:await maintenanceDigest(pending)};
  // Scope's verified handover excludes old ingress/version URLs/scheduled/in-flight writers.
  // It is synthetic evidence here, never proof that Production v137 was drained.
  await core.externalIntent(input,pending);
  try{
   // Existing repository owns the permanent claim; a crash here leaves Bridge pending.
   if(!await createD1AssetRepository({prepare:sql=>db.prepare(sql),async batch(items){
    const verified=await owner.verify(input,'claim');if(verified?.allowed!==true||verified.identityDigest!==await maintenanceDigest(input.identity)||!verified.assertions?.length)throw Error('cleanup_claim_owner');
    const guards=verified.assertions.map(a=>assertion(db,'(SELECT ok FROM ('+a.sql+'))=1',a.params));
    guards.push(assertion(db,"EXISTS(SELECT 1 FROM sync_maintenance_v2_control c JOIN sync_maintenance_v2_operations o ON o.scope=c.scope WHERE c.scope=? AND c.phase='open' AND c.epoch=? AND o.operation_id=? AND o.phase='external_pending' AND o.pending_digest=?)",[scope,request.expectedEpoch,input.operationId,input.pendingDigest]));
    const out=await db.batch([...guards,...items,clearAssertions(db)]);return out.slice(guards.length,guards.length+items.length);
   }}).claimCleanup(row,Date.now(),{graceMs:30*86400000,preparedMs:86400000}))throw Error('cleanup_claim_conflict');
   const claim=await repo.getCleanupClaim(row.asset_id);await references(row);
   if(!await repo.validateCleanupClaim(claim))throw Error('cleanup_claim_hold');
   const fresh=await owner.verify(input,'external');
   if(fresh?.allowed!==true||fresh.identityDigest!==await maintenanceDigest(input.identity)||!fresh.assertions?.length)throw Error('cleanup_owner_hold');
   for(const a of fresh.assertions)if((await db.prepare(a.sql).bind(...a.params).first())?.ok!==1)throw Error('cleanup_final_fence');
   const c=await db.prepare('SELECT phase,epoch FROM sync_maintenance_v2_control WHERE scope=?').bind(scope).first();if(c?.phase!=='open'||c.epoch!==request.expectedEpoch)throw Error('cleanup_stopped');
   await bucket.delete(claim.object_key);
   // No further destructive action. Even successful delete retains pending until explicit reconcile.
   return{status:'external_pending',classification:'r2-delete-ack-d1-unconfirmed',operationId:input.operationId};
  }catch{await core.recordExternalUnknown(input).catch(()=>{});return{status:'unknown',operationId:input.operationId,pendingRetained:true};}
 }
 async function reconcile(request,{resolutionOperationId}={}){
  const source=await db.prepare('SELECT * FROM sync_maintenance_v2_operations WHERE operation_id=?').bind(request.operationId).first();
  if(!source||source.scope!==scope||source.binding_json!==maintenanceCanonical(request.identity)||source.kind!=='external')throw Error('cleanup_source_hold');
  const pending=JSON.parse(source.pending_json);if(await maintenanceDigest(pending)!==source.pending_digest)throw Error('cleanup_pending_corrupt');
  const input={...request,pendingDigest:source.pending_digest};await core.reconcile(input);
  const row=await db.prepare('SELECT * FROM sync_assets WHERE asset_id=?').bind(pending.assetId).first(),claim=await repo.getCleanupClaim(pending.assetId);
  if(!row||!claim||pending.objectKey!==claim.object_key||pending.objectDigest!==claim.content_hash||pending.objectVersion!==claim.object_version)throw Error('cleanup_identity_hold');
  await references(row);
  const current=await repo.validateCleanupClaim(claim),head=await bucket.head(claim.object_key);
  if(head||!current)return{status:'unknown',pendingRetained:true};
  // Observation proves absence now, never attributes it to an earlier request. No retry delete.
  if(!resolutionOperationId)return{status:'external_pending',classification:'absent-reservation-held',pendingRetained:true};
  const control=await db.prepare('SELECT phase,epoch FROM sync_maintenance_v2_control WHERE scope=?').bind(scope).first();
  if(control?.phase!=='closed')return{status:'HOLD',reason:'explicit-stop-required',pendingRetained:true};
  const outcome={sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM sync_assets WHERE asset_id=? AND state='deleted') AND EXISTS(SELECT 1 FROM sync_asset_deletions WHERE asset_id=? AND claim_id=? AND state='deleted') AND NOT EXISTS(SELECT 1 FROM sync_authority_cleanup_claims WHERE asset_id=?) THEN 1 ELSE 0 END AS ok",params:[row.asset_id,row.asset_id,claim.claim_id,row.asset_id]};
  const baseVerify=owner.verify.bind(owner);
  const recoveryOwner={...owner,async verify(r,purpose){const proof=await baseVerify(r,purpose);return{...proof,assertions:[...proof.assertions,
   {sql:"SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sync_records WHERE deleted_at IS NULL AND NOT json_valid(payload_json)) AND NOT EXISTS(SELECT 1 FROM sync_records r,json_tree(r.payload_json) j WHERE r.deleted_at IS NULL AND j.type='text' AND j.value=?) THEN 1 ELSE 0 END AS ok",params:[row.asset_id]}]};},
   async verifyRecovery(r,old){const proof=await owner.verifyCleanup(r,row);return{allowed:proof?.allowed===true&&proof.assetDigest===await maintenanceDigest(row)&&old.operation_id===source.operation_id,sourceDigest:await maintenanceDigest(old),outcomeDigest:await maintenanceDigest(r.outcome),businessOutcomeDigest:await maintenanceDigest(outcome)};}};
  return createIsolatedMaintenanceBridgeV2({db,owner:recoveryOwner}).recover({kind:'recovery',operationId:resolutionOperationId,scope,expectedEpoch:control.epoch,identity:request.identity,sourceOperationId:source.operation_id,sourceRequestDigest:source.request_digest,pendingDigest:source.pending_digest,outcome:{classification:'asset-absence-readback-lifecycle-completed',claimId:claim.claim_id}},
   {outcome,run:binding=>createD1AssetRepository(binding).completeCleanup(claim,Date.now())});
 }
 return Object.freeze({run,reconcile,retention:'HOLD: Account purge, receipts, changes, tombstones and lockouts are not delegated to legacy Scheduled'});
}
