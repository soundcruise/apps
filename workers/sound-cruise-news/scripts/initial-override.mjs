// Operator CLI only. Not imported by any Worker request/scheduled handler.
export const INITIAL_REASON='initial_production_collection_2026_09_30';
export const INITIAL_AUDIT_ID='initial-production-collection-2026-09-30';
export async function consumeInitialOverride(store,now,reason){
 if(reason!==INITIAL_REASON||!Number.isSafeInteger(now)||now<Date.parse('2026-09-30T00:00:00+09:00')||now>=Date.parse('2026-10-01T00:00:00+09:00'))throw Error('explicit_initial_reason_required');
 const result=await store.db.prepare(`INSERT INTO news_admin_audit(id,action,target,occurred_at,reason_code)
 SELECT ?,'initial-interval-override','shimamura',?,?
 WHERE NOT EXISTS(SELECT 1 FROM news_admin_audit WHERE id=?)
 AND EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND collection_enabled=0 AND publication_enabled=0)
 AND NOT EXISTS(SELECT 1 FROM candidate_items)
 AND NOT EXISTS(SELECT 1 FROM collection_runs)
 AND EXISTS(SELECT 1 FROM source_state WHERE source_id='shimamura' AND disabled=0 AND takedown=0 AND lease_until<=?)`).bind(INITIAL_AUDIT_ID,now,reason,INITIAL_AUDIT_ID,now).run();
 if(result.meta.changes!==1)throw Error('initial_override_already_used_or_precondition_failed');
}
