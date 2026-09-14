export const CLEANUP_RETENTION = Object.freeze({
  pairingMs: 24 * 60 * 60 * 1000,
  orphanDeviceMs: 15 * 60 * 1000,
  recoveryClaimMs: 24 * 60 * 60 * 1000,
  recoveryAttemptMs: 30 * 60 * 1000,
  pairingAttemptMs: 10 * 60 * 1000,
  changeMs: 90 * 24 * 60 * 60 * 1000,
  tombstoneMs: 365 * 24 * 60 * 60 * 1000,
  deleteIntentMs: 7 * 24 * 60 * 60 * 1000,
  accountHandoffMs: 24 * 60 * 60 * 1000,
  accountAppJoinMs: 24 * 60 * 60 * 1000,
  accountLifecycleOperationMs: 30 * 24 * 60 * 60 * 1000,
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

async function expirePreparedChordBridges(db, now, limit) {
  const selected = await db.prepare(`
    SELECT bridge_id AS id FROM sync_chord_account_bridges
    WHERE state = 'prepared' AND expires_at <= ?
    ORDER BY expires_at ASC LIMIT ${limit}
  `).bind(now).all();
  const ids = (selected.results || []).map((row) => row.id);
  if (!ids.length) return 0;
  const statements = ids.map((id) => db.prepare(`
    UPDATE sync_chord_account_bridges
    SET state = 'rolled_back', generation = generation + 1,
        updated_at = ?, rolled_back_at = ?
    WHERE bridge_id = ? AND state = 'prepared' AND expires_at <= ?
  `).bind(now, now, id, now));
  const results = await db.batch(statements);
  return results.reduce((total, result) => total + Number(result?.meta?.changes || 0), 0);
}

async function purgeAccountMemberships(db, now, limit) {
  const selected = await db.prepare(`
    SELECT id, sync_user_id FROM sync_account_memberships
    WHERE state = 'deleting' AND purge_after IS NOT NULL AND purge_after <= ?
    ORDER BY purge_after ASC LIMIT ${limit}
  `).bind(now).all();
  let purged = 0;
  for (const row of selected.results || []) {
    const finish = db.prepare(`
      UPDATE sync_account_memberships
      SET state = 'deleted', sync_user_id = NULL, deleted_at = COALESCE(deleted_at, ?),
          updated_at = ?, generation = generation + 1
      WHERE id = ? AND state = 'deleting' AND sync_user_id = ?
        AND purge_after IS NOT NULL AND purge_after <= ?
    `).bind(now, now, row.id, row.sync_user_id, now);
    const purge = db.prepare(`
      DELETE FROM sync_users WHERE id = ? AND state = 'deleting'
        AND purge_after IS NOT NULL AND purge_after <= ?
        AND EXISTS (SELECT 1 FROM sync_account_memberships
          WHERE id = ? AND state = 'deleted' AND sync_user_id IS NULL)
    `).bind(row.sync_user_id, now, row.id);
    const results = await db.batch([finish, purge]);
    if (results.every((result) => result?.success !== false) &&
        Number(results[0]?.meta?.changes || 0) === 1 &&
        Number(results[1]?.meta?.changes || 0) === 1) purged += 1;
  }
  return purged;
}

async function finishDeletedAccounts(db, now, limit) {
  const selected = await db.prepare(`
    SELECT id FROM sync_accounts a
    WHERE a.state = 'deleting' AND a.purge_after IS NOT NULL AND a.purge_after <= ?
      AND NOT EXISTS (SELECT 1 FROM sync_account_memberships m
        WHERE m.account_id = a.id AND m.state <> 'deleted')
    ORDER BY a.purge_after ASC LIMIT ${limit}
  `).bind(now).all();
  const ids = (selected.results || []).map((row) => row.id);
  if (!ids.length) return 0;
  let purged = 0;
  for (const id of ids) {
    // Invitations use restrictive foreign keys so that normal Account removal
    // can never silently erase live grants. At the scheduled purge boundary we
    // delete those already-cancelled control rows explicitly, then let the
    // Account cascade remove the remaining lifecycle metadata.
    const statements = [
      db.prepare('DELETE FROM sync_app_join_invitations WHERE account_id = ?').bind(id),
      db.prepare('DELETE FROM sync_membership_handoffs WHERE account_id = ?').bind(id),
      db.prepare('DELETE FROM sync_chord_account_bridges WHERE account_id = ?').bind(id),
      // App-scoped QA sessions point at their Port parent with ON DELETE
      // RESTRICT. Remove children first so an Account with completed QA
      // enrollment can still be purged atomically at the grace boundary.
      db.prepare("DELETE FROM sync_account_qa_sessions WHERE account_id = ? AND scope = 'app'").bind(id),
      db.prepare("DELETE FROM sync_account_qa_sessions WHERE account_id = ? AND scope = 'port'").bind(id),
      db.prepare(`DELETE FROM sync_accounts
        WHERE id = ? AND state = 'deleting' AND purge_after IS NOT NULL AND purge_after <= ?
          AND NOT EXISTS (SELECT 1 FROM sync_account_memberships m
            WHERE m.account_id = sync_accounts.id AND m.state <> 'deleted')`).bind(id, now)
    ];
    const results = await db.batch(statements);
    if (results.every((result) => result?.success !== false) &&
        Number(results.at(-1)?.meta?.changes || 0) === 1) purged += 1;
  }
  return purged;
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
    try {
      results.accountHandoffs = await deleteLimited(
        db,
        `SELECT handoff_id AS id FROM sync_membership_handoffs
         WHERE expires_at <= ?
           AND (consumed_at IS NULL OR consumed_at <= ?)
           AND (cancelled_at IS NULL OR cancelled_at <= ?)
         LIMIT ${limit}`,
        'DELETE FROM sync_membership_handoffs WHERE handoff_id = ?',
        [
          now - CLEANUP_RETENTION.accountHandoffMs,
          now - CLEANUP_RETENTION.accountHandoffMs,
          now - CLEANUP_RETENTION.accountHandoffMs
        ]
      );
    } catch {
      // Account schema is a staged additive rollout. A Worker started before
      // migration 0008/0009 must not interrupt the legacy Chord cleanup chain.
      results.accountHandoffs = 0;
    }
    try {
      results.accountAppJoins = await deleteLimited(
        db,
        `SELECT invitation_id AS id FROM sync_app_join_invitations
         WHERE expires_at <= ?
           AND (consumed_at IS NULL OR consumed_at <= ?)
           AND (cancelled_at IS NULL OR cancelled_at <= ?)
         LIMIT ${limit}`,
        'DELETE FROM sync_app_join_invitations WHERE invitation_id = ?',
        [
          now - CLEANUP_RETENTION.accountAppJoinMs,
          now - CLEANUP_RETENTION.accountAppJoinMs,
          now - CLEANUP_RETENTION.accountAppJoinMs
        ]
      );
    } catch {
      // M9.5 is additive; an older remote schema must not stop legacy cleanup.
      results.accountAppJoins = 0;
    }
    try {
      results.accountRecoveryAttempts = await deleteLimited(
        db,
        `SELECT recovery_verifier AS id FROM sync_account_recovery_attempts
         WHERE first_attempt_at <= ? LIMIT ${limit}`,
        'DELETE FROM sync_account_recovery_attempts WHERE recovery_verifier = ?',
        [now - CLEANUP_RETENTION.recoveryAttemptMs]
      );
      results.accountRecoveryClaims = await deleteLimited(
        db,
        `SELECT claim_id AS id FROM sync_account_recovery_claims
         WHERE (expires_at <= ? AND committed_at IS NULL)
            OR committed_at <= ? OR cancelled_at <= ? LIMIT ${limit}`,
        'DELETE FROM sync_account_recovery_claims WHERE claim_id = ?',
        [now - CLEANUP_RETENTION.recoveryClaimMs,
          now - CLEANUP_RETENTION.recoveryClaimMs,
          now - CLEANUP_RETENTION.recoveryClaimMs]
      );
      results.accountDeleteIntents = await deleteLimited(
        db,
        `SELECT intent_id AS id FROM sync_account_delete_intents
         WHERE (expires_at <= ? AND consumed_at IS NULL)
            OR consumed_at <= ? OR cancelled_at <= ? LIMIT ${limit}`,
        'DELETE FROM sync_account_delete_intents WHERE intent_id = ?',
        [now - CLEANUP_RETENTION.deleteIntentMs,
          now - CLEANUP_RETENTION.deleteIntentMs,
          now - CLEANUP_RETENTION.deleteIntentMs]
      );
      results.accountLifecycleOperations = await deleteLimited(
        db,
        `SELECT operation_id AS id FROM sync_account_lifecycle_operations
         WHERE created_at <= ? LIMIT ${limit}`,
        'DELETE FROM sync_account_lifecycle_operations WHERE operation_id = ?',
        [now - CLEANUP_RETENTION.accountLifecycleOperationMs]
      );
      results.accountMembershipsPurged = await purgeAccountMemberships(db, now, limit);
      results.accountsDeleted = await finishDeletedAccounts(db, now, limit);
    } catch {
      // Migration 0017 is additive. Older schemas keep the established cleanup chain.
      results.accountRecoveryAttempts = 0;
      results.accountRecoveryClaims = 0;
      results.accountDeleteIntents = 0;
      results.accountLifecycleOperations = 0;
      results.accountMembershipsPurged = 0;
      results.accountsDeleted = 0;
    }
    try {
      results.chordAccountBridges = await expirePreparedChordBridges(db, now, limit);
    } catch {
      // M4 is also staged additively. Legacy scheduled cleanup must continue
      // when migration 0010 has not been applied yet.
      results.chordAccountBridges = 0;
    }
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
    results.deletedUsers = await deleteLimited(db, `SELECT id FROM sync_users u WHERE state = 'deleting' AND purge_after IS NOT NULL AND purge_after <= ? AND NOT EXISTS (SELECT 1 FROM sync_account_memberships m WHERE m.sync_user_id = u.id) LIMIT ${limit}`, 'DELETE FROM sync_users WHERE id = ? AND state = \'deleting\'', [now]);
    return results;
  }
  return Object.freeze({ cleanup, retention: CLEANUP_RETENTION });
}
