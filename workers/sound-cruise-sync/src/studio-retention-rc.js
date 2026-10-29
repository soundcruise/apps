// Trusted dry-run inventory only. No delete statement or public purge capability.
// Unknown/partial pending and Account orphans are deliberately not time-inferred.
import {inspectStudioRelease} from './studio-release-schema.js';
import {studioDigest,studioCanonical} from '../../../apps/cruise-studio/js/cloud/document-codec.mjs';
export async function studioRetentionDryRun(db){
 const counts={};for(const table of ['pending','chunks','receipts','owner_events','recovery_proofs'])counts[table]=(await db.prepare('SELECT count(*) n FROM studio_document_'+table).first()).n;
 const rows=(await db.prepare(`SELECT p.account_id,p.operation_id,p.document_id,r.operation_id AS committed,h.last_operation_id AS head_operation,a.state AS account_state,a.deleted_at,(SELECT count(*) FROM studio_document_owner_events e WHERE e.account_id=p.account_id AND e.source_operation_id=p.operation_id) adoption_dependencies FROM studio_document_pending p LEFT JOIN studio_document_receipts r ON r.account_id=p.account_id AND r.operation_id=p.operation_id LEFT JOIN studio_document_records h ON h.user_id=p.account_id AND h.record_id=p.document_id LEFT JOIN sync_accounts a ON a.id=p.account_id ORDER BY p.account_id,p.operation_id`).all()).results;
 const classifications=rows.map(r=>({accountId:r.account_id,operationId:r.operation_id,state:!r.account_state||r.deleted_at!==null?'ORPHAN_HOLD':r.adoption_dependencies?'ADOPTION_EVIDENCE_HOLD':!r.committed?'UNKNOWN_OR_PENDING_HOLD':r.head_operation===r.operation_id?'CURRENT_HEAD_HOLD':'HISTORICAL_COMMITTED_POLICY_REQUIRED'}));
 return {type:'studio-retention-dry-run-v1',physicalPurge:'HOLD_POLICY_UNAPPROVED',durations:null,counts,classifications,digest:await studioDigest(studioCanonical({counts,classifications})),authorizesDeletion:false};
}
export function studioPhysicalPurge(){throw Object.assign(Error('retention-policy-unapproved'),{code:'retention-policy-unapproved'});}
// Legacy Scheduled may erase the only native recovery proof before explicit capture.
// A missing proof cannot be reconstructed. Suppress cleanup conservatively for any
// Studio Account with unresolved operations and a committed uncaptured native recovery.
export async function studioLegacyCleanupGate(db){
 const exists=await db.prepare("SELECT count(*) n FROM sqlite_master WHERE name GLOB 'studio_document_*'").first();if(!exists.n)return {allowed:true,scope:'no-studio-schema'};
 try{await inspectStudioRelease(db);}catch{return {allowed:false,status:'HOLD_PARTIAL_OR_UNKNOWN_STUDIO_SCHEMA'};}
 const r=await db.prepare(`SELECT count(*) n FROM sync_account_lifecycle_operations o WHERE o.kind='recovery' AND (EXISTS(SELECT 1 FROM studio_document_pending p WHERE p.account_id=o.account_id) OR EXISTS(SELECT 1 FROM studio_document_enrollments e WHERE e.account_id=o.account_id)) AND NOT EXISTS(SELECT 1 FROM studio_document_recovery_proofs r WHERE r.account_id=o.account_id AND r.operation_id=o.operation_id)`).first();
 return r.n?{allowed:false,status:'HOLD_UNCAPTURED_RECOVERY_PROOF'}:{allowed:true,scope:'captured-recovery-evidence'};
}
