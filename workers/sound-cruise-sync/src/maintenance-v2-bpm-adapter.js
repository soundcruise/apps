import { createD1SyncRepository } from './sync-database.js';
import { maintenanceCanonical } from './maintenance-bridge-v2.js';

// Trusted isolated owner adapter. Not imported by app.js/index.js and not an HTTP auth path.
// HMAC, Pro verification and current Account proof remain the existing owner's responsibility.
export function createIsolatedMaintenanceBpmAdapter({bridge,clock=Date.now}){
 return Object.freeze({
  async save({operation,identity,legacyIdentity,scope,expectedEpoch}){
   const op=JSON.parse(maintenanceCanonical(operation)),who=JSON.parse(maintenanceCanonical(legacyIdentity));
   const actor=JSON.parse(maintenanceCanonical(identity));
   if(op.recordType!=='metronome_settings'||who.appId!=='port'||actor.syncUserId!==who.userId||actor.deviceId!==who.deviceId||
      actor.datasetId!=='port:metronome_settings'||!Number.isSafeInteger(op.baseRevision)||op.baseRevision<0)throw Error('unsupported_bpm_owner_request');
   const req={kind:'mutation',operationId:op.operationId,scope,expectedEpoch,identity:actor,action:op};
   const outcome={
    sql:`SELECT CASE WHEN EXISTS(
     SELECT 1 FROM sync_changes c JOIN sync_records r ON r.user_id=c.user_id AND r.app_id=c.app_id
      AND r.record_type=c.record_type AND r.record_id=c.record_id
     WHERE c.user_id=? AND c.app_id='port' AND c.record_type='metronome_settings' AND c.record_id=?
      AND c.operation_id=? AND c.operation_hash=? AND c.revision=? AND c.payload_hash=?
      AND r.last_operation_id=c.operation_id AND r.revision=c.revision AND r.payload_hash=c.payload_hash
    ) THEN 1 ELSE 0 END AS ok`,
    params:[who.userId,op.recordId,op.operationId,op.operationHash,op.baseRevision+1,op.payloadHash]
   };
   return bridge.execute(req,{outcome,run:db=>createD1SyncRepository(db,clock).applyOperation(who,op)});
  }
 });
}
