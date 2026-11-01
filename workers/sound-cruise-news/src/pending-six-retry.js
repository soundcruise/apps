// Explicit operator-authorized recovery on 2026-11-01 only. This grants one
// extra article attempt, not source permission, facts, or a publication verdict.
const starts=Date.parse('2026-11-01T00:00:00+09:00'),ends=Date.parse('2026-11-02T00:00:00+09:00');
export const PENDING_SIX_RETRIES=Object.freeze([
 ['5940482093e3620b75e74be52a3303e7a5e45acdbeb7e291cf93047dc13a03f6','shimamura','https://www.shimamura.co.jp/update/dtm-recording/2026/10/105214/',0],
 ['0b58148d7d4f7a69b10870e4390ed3a08a9da24f13376a5251eed03ee391482d','ikebe','https://www.ikebe-gakki-pb.com/new_product/173848/',0],
 ['3d5e36ec6b1125a59285d8701e452dc98c61614fe1be9acee1e500b1bff7d185','shimamura','https://www.shimamura.co.jp/update/amp-effector/2026/10/103352/',0],
 ['9737b3764182af2b8df259975e6491b680289871364e16888c3293d14eff5852','ikebe','https://www.ikebe-gakki-pb.com/new_product/173861/',0],
 ['faa8f7e85e816f8a4d4a7cbdce167009f7b700a54f7ab5fd0cb9665e45abc367','ikebe','https://www.ikebe-gakki-pb.com/new_product/173801/',1],
 ['bed7cc84e90641f454f504bc54dbc0f09ab9c649c4be6f488eadaa37e8197519','shimamura','https://www.shimamura.co.jp/update/dtm-recording/2026/10/102807/',1]
].map(Object.freeze));
export async function claimPendingSixRetry(store,row,input,actor,now){
 if(actor.type!=='human_operator'||now<starts||now>=ends)return null;
 const target=PENDING_SIX_RETRIES.find(([id,source,url,revision])=>row.id===id&&row.source_id===source&&row.source_url===url&&row.review_revision===revision);
 if(!target||row.expires_at<=now)return null;
 const key='pending-six-20261101:'+row.id,columns=Object.keys(row);
 // A unique audit ID survives cache cleanup and atomically consumes the grant.
 // Network/SQL failure consumes it too: no automatic paid/publisher retry.
 const claimed=await store.db.prepare(`INSERT OR IGNORE INTO news_admin_audit(id,action,target,occurred_at,reason_code)
 SELECT ?,'bounded-primary-retry',?,?,? WHERE EXISTS(SELECT 1 FROM candidate_items WHERE ${columns.map(k=>k+' IS ?').join(' AND ')} AND review_status IN ('pending','reopened'))
 AND EXISTS(SELECT 1 FROM news_controls WHERE id=1 AND collection_enabled=1)
 AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=? AND (disabled=1 OR takedown=1 OR publication_blocked=1 OR backoff_until>? OR (failures>0 AND next_at>?)))
 AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=?)`)
 .bind(key,row.id,now,JSON.stringify({requestId:input.requestId,revision:input.revision,snapshot:input.snapshot,actor:actor.id,expiresAt:ends}),...columns.map(k=>row[k]),row.source_id,now,now,row.id).run();
 if(claimed.meta.changes!==1)throw Error('facts_limited_retry_consumed');
 return key;
}
