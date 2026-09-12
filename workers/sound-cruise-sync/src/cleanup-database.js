export const CLEANUP_RETENTION = Object.freeze({
  pairingMs: 24 * 60 * 60 * 1000,
  orphanDeviceMs: 15 * 60 * 1000,
  recoveryClaimMs: 24 * 60 * 60 * 1000,
  recoveryAttemptMs: 30 * 60 * 1000,
  pairingAttemptMs: 10 * 60 * 1000,
  changeMs: 90 * 24 * 60 * 60 * 1000,
  tombstoneMs: 365 * 24 * 60 * 60 * 1000,
  deleteIntentMs: 7 * 24 * 60 * 60 * 1000,
  batchSize: 100
});

async function deleteLimited(db, selectSql, deleteSql, values) {
  const selected = await db.prepare(selectSql).bind(...values).all();
  const ids = (selected.results || []).map((row) => row.id);
  if (!ids.length) return 0;
  const statements = ids.map((id) => db.prepare(deleteSql).bind(id));
  const results = await db.batch(statements);
  return results.filter((result) => result?.success !== false).length;
}

export function createD1CleanupRepository(db, clock = Date.now) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') throw new Error('D1 session is unavailable');
  async function cleanup(now = clock()) {
    const limit = CLEANUP_RETENTION.batchSize;
    const results = {};
    results.pairingCodes = await deleteLimited(db, `SELECT code_verifier AS id FROM pairing_codes WHERE (consumed_at IS NOT NULL AND consumed_at <= ?) OR (cancelled_at IS NOT NULL AND cancelled_at <= ?) OR expires_at <= ? LIMIT ${limit}`, 'DELETE FROM pairing_codes WHERE code_verifier = ?', [now - CLEANUP_RETENTION.pairingMs, now - CLEANUP_RETENTION.pairingMs, now - CLEANUP_RETENTION.pairingMs]);
    results.orphanDevices = await deleteLimited(db, `SELECT id FROM sync_devices WHERE pairing_pending_at IS NOT NULL AND paired_at IS NULL AND pairing_pending_at <= ? LIMIT ${limit}`, 'DELETE FROM sync_devices WHERE id = ?', [now - CLEANUP_RETENTION.orphanDeviceMs]);
    results.recoveryClaims = await deleteLimited(db, `SELECT claim_id AS id FROM recovery_claims WHERE (expires_at <= ? AND committed_at IS NULL) OR committed_at <= ? OR cancelled_at <= ? LIMIT ${limit}`, 'DELETE FROM recovery_claims WHERE claim_id = ?', [now - CLEANUP_RETENTION.recoveryClaimMs, now - CLEANUP_RETENTION.recoveryClaimMs, now - CLEANUP_RETENTION.recoveryClaimMs]);
    results.recoveryAttempts = await deleteLimited(db, `SELECT recovery_verifier AS id FROM recovery_attempts WHERE first_attempt_at <= ? LIMIT ${limit}`, 'DELETE FROM recovery_attempts WHERE recovery_verifier = ?', [now - CLEANUP_RETENTION.recoveryAttemptMs]);
    results.pairingAttempts = await deleteLimited(db, `SELECT code_verifier AS id FROM pairing_attempts WHERE first_attempt_at <= ? LIMIT ${limit}`, 'DELETE FROM pairing_attempts WHERE code_verifier = ?', [now - CLEANUP_RETENTION.pairingAttemptMs]);
    results.deleteIntents = await deleteLimited(db, `SELECT intent_id AS id FROM account_delete_intents WHERE (consumed_at IS NULL AND expires_at <= ?) OR consumed_at <= ? LIMIT ${limit}`, 'DELETE FROM account_delete_intents WHERE intent_id = ?', [now, now - CLEANUP_RETENTION.deleteIntentMs]);
    const oldChanges = await db.prepare(`
      SELECT change_seq, user_id, app_id FROM sync_changes
      WHERE changed_at <= ? ORDER BY change_seq ASC LIMIT ${limit}
    `).bind(now - CLEANUP_RETENTION.changeMs).all();
    const changeRows = oldChanges.results || [];
    if (changeRows.length) {
      const watermarkByDataset = new Map();
      changeRows.forEach((row) => {
        const key = `${row.user_id}\u0000${row.app_id}`;
        watermarkByDataset.set(key, { userId: row.user_id, appId: row.app_id, sequence: row.change_seq });
      });
      const statements = [];
      watermarkByDataset.forEach((entry) => {
        statements.push(db.prepare(`
          UPDATE sync_datasets SET min_change_seq = MAX(min_change_seq, ?)
          WHERE user_id = ? AND app_id = ?
        `).bind(entry.sequence, entry.userId, entry.appId));
      });
      changeRows.forEach((row) => statements.push(db.prepare('DELETE FROM sync_changes WHERE change_seq = ?').bind(row.change_seq)));
      const changeResults = await db.batch(statements);
      results.changes = changeResults.filter((result) => result?.success !== false).length - watermarkByDataset.size;
    } else results.changes = 0;
    results.tombstones = await deleteLimited(db, `SELECT rowid AS id FROM sync_records WHERE deleted_at IS NOT NULL AND deleted_at <= ? LIMIT ${limit}`, 'DELETE FROM sync_records WHERE rowid = ?', [now - CLEANUP_RETENTION.tombstoneMs]);
    results.deletedUsers = await deleteLimited(db, `SELECT id FROM sync_users WHERE state = 'deleting' AND purge_after IS NOT NULL AND purge_after <= ? LIMIT ${limit}`, 'DELETE FROM sync_users WHERE id = ? AND state = \'deleting\'', [now]);
    return results;
  }
  return Object.freeze({ cleanup, retention: CLEANUP_RETENTION });
}
