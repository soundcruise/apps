export const ACCOUNT_INACTIVITY = Object.freeze({
  touchIntervalMs: 60 * 60 * 1000,
  dormantAfterMs: 365 * 24 * 60 * 60 * 1000,
  purgeAfterMs: 455 * 24 * 60 * 60 * 1000
});

// Only callers that have already completed credential verification invoke this
// function. It therefore cannot turn anonymous or hostile traffic into Account
// activity, and a valid request wakes a dormant Account atomically.
export async function touchAccountActivity(db, accountId, now = Date.now()) {
  if (!accountId) return false;
  const insert = await db.prepare(`INSERT OR IGNORE INTO sync_account_activity
    (account_id, state, last_activity_at, dormant_at, inactive_purge_after, updated_at)
    SELECT id, 'active', ?, NULL, NULL, ? FROM sync_accounts
    WHERE id = ? AND state = 'active' AND deleted_at IS NULL`).bind(now, now, accountId).run();
  if (insert?.success === false) throw new Error('Account activity insert failed');
  const result = await db.prepare(`UPDATE sync_account_activity
    SET state = 'active', last_activity_at = ?, dormant_at = NULL,
        inactive_purge_after = NULL, updated_at = ?
    WHERE account_id = ?
      AND (state = 'dormant' OR last_activity_at <= ?)
      AND EXISTS (SELECT 1 FROM sync_accounts a
        WHERE a.id = sync_account_activity.account_id AND a.state = 'active' AND a.deleted_at IS NULL)`)
    .bind(now, now, accountId, now - ACCOUNT_INACTIVITY.touchIntervalMs).run();
  if (result?.success === false) throw new Error('Account activity touch failed');
  return Number(insert?.meta?.changes || 0) + Number(result?.meta?.changes || 0) > 0;
}
