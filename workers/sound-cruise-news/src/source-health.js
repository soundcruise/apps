import {evidenceGate} from './registry.js';
// Structured operator signals only. Never include response bodies, titles or free text.
export const HEALTH_STATUSES=Object.freeze(['healthy','warning','paused','policy_review','robots_changed','structure_changed','http_blocked','rate_limited','error']);
export const HEALTH_REASONS=Object.freeze([
 'maintenance_redirect','redirect_blocked','approved_mass_visibility_loss','ok','not_modified','source_disabled','source_auto_disabled','global_collection_off','configuration_invalid','headline_pepper_required',
 'policy_expired','policy_changed','evidence_missing','robots_changed_review','robots_disallow','robots_unparseable','robots_unavailable',
 'http_401','http_403','http_451','rate_limited','listing_structure_changed',
 'listing_too_large','non_metadata_response','metadata_format','collector_repeated_failure','retention_purge_failed',
 'request_timeout','upstream_error','network_or_internal_error','listing_optout','header_optout'
]);
export function healthForOutcome(outcome,failures=0){
 if(['maintenance_redirect','redirect_blocked'].includes(outcome))return {status:'warning',reasonCode:'maintenance_redirect'};
 if(outcome==='collected')return {status:'healthy',reasonCode:'ok'};
 if(outcome==='not_modified')return {status:'healthy',reasonCode:'ok'};
 if(['policy_expired','policy_changed','evidence_missing'].includes(outcome))return {status:'policy_review',reasonCode:outcome};
 if(['robots_changed_review','robots_unparseable','robots_unavailable'].includes(outcome))return {status:'robots_changed',reasonCode:outcome};
 if(['listing_structure_changed','listing_too_large','non_metadata_response','metadata_format'].includes(outcome))return {status:'structure_changed',reasonCode:outcome};
 if(['http_401','http_403','http_451'].includes(outcome))return {status:'http_blocked',reasonCode:outcome};
 if(outcome==='rate_limited')return {status:failures>=2?'rate_limited':'warning',reasonCode:outcome};
 if(['source_disabled','global_collection_off','robots_disallow','listing_optout','header_optout'].includes(outcome))return {status:'paused',reasonCode:outcome};
 if(failures>=3)return {status:'error',reasonCode:'collector_repeated_failure'};
 return {status:'warning',reasonCode:HEALTH_REASONS.includes(outcome)?outcome:'network_or_internal_error'};
}

// A disabled runtime is only intentional when an explicit source stop is recorded.
export async function intentionalSourceStop(store,sourceId){
 const row=await store.db.prepare("SELECT action FROM news_admin_audit WHERE target=? AND action IN ('source-collection-stop','source-disable','source-delete','source-enable') ORDER BY occurred_at DESC,rowid DESC LIMIT 1").bind(sourceId).first();
 // Sleepfreaks is an explicitly maintained pause in NEWS-SOURCE-DECISION-REGISTER.md;
 // its legacy stop predates admin stop records. A later explicit enable supersedes it.
 return row?['source-collection-stop','source-disable','source-delete'].includes(row.action):sourceId==='sleepfreaks';
}
export function collectionHealth(results){
 const abnormal=results.some(r=>!['collected','not_modified','backoff','scheduled_day_or_lease_busy'].includes(r.outcome)&&!(r.outcome==='source_disabled'&&r.intentionalDisabled===true));
 return {status:abnormal?'warning':'healthy',reasonCode:abnormal?'network_or_internal_error':'ok'};
}

export const TRANSIENT_OUTCOMES=Object.freeze(['request_timeout','upstream_error','network_or_internal_error','rate_limited','non_metadata_response','metadata_format','xml_invalid','listing_structure_changed']);
export const publicationHealthSQL="(status='healthy' OR (status IN ('warning','error','rate_limited','structure_changed') AND reason_code IN ('request_timeout','upstream_error','network_or_internal_error','rate_limited','collector_repeated_failure','non_metadata_response','metadata_format','listing_structure_changed','xml_invalid')))";
export function publicationHealthAllowed(health,now){
 return !!health&&Number.isSafeInteger(health.last_successful_run_at)&&health.last_successful_run_at<=now&&(health.status==='healthy'||['warning','error','rate_limited','structure_changed'].includes(health.status)&&[...TRANSIENT_OUTCOMES,'collector_repeated_failure'].includes(health.reason_code));
}
// Only provably transient legacy auto-stops can resume. A manually stopped,
// permission-denied, opt-out, robots or redirect source never enters this path.
export async function resumeTransientSource(store,source,now){
 if(!source?.enabled||!source.productionEnabled||evidenceGate(source,now)||await intentionalSourceStop(store,source.id))return false;
 const state=await store.state(source.id);if(!state.disabled||state.publicationBlocked||state.backoffUntil>now)return false;
 const last=await store.db.prepare('SELECT * FROM collection_runs WHERE source_id=? ORDER BY collected_at DESC,rowid DESC LIMIT 1').bind(source.id).first();
 if(!last||!TRANSIENT_OUTCOMES.includes(last.outcome))return false;
 const health=(await store.sourceHealth()).find(h=>h.source_id===source.id);
 if(!health||!['warning','error','rate_limited','structure_changed'].includes(health.status))return false;
 const result=await store.db.batch([
 store.db.prepare(`UPDATE source_state SET disabled=0 WHERE source_id=? AND disabled=1 AND publication_blocked=0 AND takedown=0 AND lease_until<=? AND backoff_until<=?
 AND (SELECT id FROM collection_runs WHERE source_id=? ORDER BY collected_at DESC,rowid DESC LIMIT 1)=?
 AND NOT EXISTS(SELECT 1 FROM news_admin_audit WHERE target=? AND action IN ('source-collection-stop','source-disable','source-delete','maintenance-recovery-denied') AND occurred_at>=?)
 AND EXISTS(SELECT 1 FROM source_health WHERE source_id=? AND status=? AND reason_code=? AND last_checked_at=?)`).bind(source.id,now,now,source.id,last.id,source.id,last.collected_at,source.id,health.status,health.reason_code,health.last_checked_at),
 store.db.prepare("INSERT INTO news_admin_audit SELECT ?,'source-resume',?,?,'transient_failure_retry' WHERE changes()=1").bind(crypto.randomUUID(),source.id,now)]);
 return result[0].meta.changes===1;
}
