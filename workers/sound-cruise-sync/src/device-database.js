const DELETE_INTENT_TTL_MS = 10 * 60 * 1000;
const DELETE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function changes(result) { return Number(result?.meta?.changes || 0); }
function batchSucceeded(results, expected) {
  return Array.isArray(results) && results.length === expected && results.every((result) => result?.success !== false);
}

export function createD1DeviceRepository(db, clock = Date.now) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') throw new Error('D1 session is unavailable');

  async function list(identity) {
    const rows = await db.prepare(`
      SELECT id, label, app_id, created_at, last_seen_at, revoked_at
      FROM sync_devices
      WHERE user_id = ? AND app_id = ? AND revoked_at IS NULL
      ORDER BY created_at ASC, id ASC
    `).bind(identity.userId, identity.appId).all();
    return (rows.results || []).map((row) => ({
      deviceId: row.id, label: row.label, appId: row.app_id,
      createdAt: row.created_at, lastSeenAt: row.last_seen_at,
      revokedAt: row.revoked_at, isCurrent: row.id === identity.deviceId
    }));
  }

  async function revoke(identity, targetDeviceId, now = clock()) {
    const revokeDevice = db.prepare(`
      UPDATE sync_devices SET revoked_at = COALESCE(revoked_at, ?)
      WHERE id = ? AND user_id = ? AND app_id = ?
    `).bind(now, targetDeviceId, identity.userId, identity.appId);
    const cancelCodes = db.prepare(`
      UPDATE pairing_codes SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE user_id = ? AND target_app_id = ? AND created_by_device_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL
    `).bind(now, identity.userId, identity.appId, targetDeviceId);
    const results = await db.batch([revokeDevice, cancelCodes]);
    if (!batchSucceeded(results, 2)) throw new Error('D1 device revoke transaction failed');
    // An already revoked own device is deliberately idempotent. Unknown and
    // cross-user identifiers are indistinguishable and disclose nothing.
    const row = await db.prepare(`SELECT id, user_id, app_id FROM sync_devices WHERE id = ?`).bind(targetDeviceId).first();
    if (!row || row.user_id !== identity.userId || row.app_id !== identity.appId) return { status: 'not_found' };
    return { status: 'revoked', deviceId: targetDeviceId, isCurrent: targetDeviceId === identity.deviceId, pairingCancelled: changes(results[1]) > 0 };
  }

  async function createDeleteIntent(identity, input) {
    const now = input.now || clock();
    const expiresAt = now + DELETE_INTENT_TTL_MS;
    const expireOld = db.prepare(`
      DELETE FROM account_delete_intents
      WHERE user_id = ? AND app_id = ? AND (expires_at <= ? OR consumed_at IS NOT NULL)
    `).bind(identity.userId, identity.appId, now);
    const insert = db.prepare(`
      INSERT INTO account_delete_intents (
        intent_id, intent_verifier, user_id, app_id, requested_by_device_id, created_at, expires_at, consumed_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, NULL
      WHERE EXISTS (
        SELECT 1 FROM sync_users WHERE id = ? AND state IN ('provisioning', 'active') AND deleted_at IS NULL
      )
    `).bind(input.intentId, input.intentVerifier, identity.userId, identity.appId, identity.deviceId, now, expiresAt, identity.userId);
    const results = await db.batch([expireOld, insert]);
    if (!batchSucceeded(results, 2)) throw new Error('D1 account delete intent transaction failed');
    return changes(results[1]) === 1 ? { status: 'issued', expiresAt } : { status: 'invalid' };
  }

  async function deleteAccount(identity, input) {
    const now = input.now || clock();
    const intent = await db.prepare(`
      SELECT intent_id, intent_verifier, user_id, app_id, requested_by_device_id, expires_at, consumed_at
      FROM account_delete_intents WHERE intent_id = ?
    `).bind(input.intentId).first();
    if (!intent || intent.intent_verifier !== input.intentVerifier || intent.user_id !== identity.userId ||
        intent.app_id !== identity.appId || intent.requested_by_device_id !== identity.deviceId) return { status: 'invalid' };
    if (intent.consumed_at != null) return { status: 'deleted' };
    if (intent.expires_at <= now) return { status: 'expired' };
    const markDeleting = db.prepare(`
      UPDATE sync_users
      SET state = 'deleting', deleted_at = ?, delete_requested_at = ?, purge_after = ?, updated_at = ?
      WHERE id = ? AND state IN ('provisioning', 'active') AND deleted_at IS NULL
    `).bind(now, now, now + DELETE_GRACE_MS, now, identity.userId);
    const revokeDevices = db.prepare(`
      UPDATE sync_devices SET revoked_at = COALESCE(revoked_at, ?)
      WHERE user_id = ? AND revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM sync_users WHERE id = ? AND state = 'deleting' AND deleted_at = ?)
    `).bind(now, identity.userId, identity.userId, now);
    const cancelPairing = db.prepare(`
      UPDATE pairing_codes SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE user_id = ? AND consumed_at IS NULL AND cancelled_at IS NULL
        AND EXISTS (SELECT 1 FROM sync_users WHERE id = ? AND state = 'deleting' AND deleted_at = ?)
    `).bind(now, identity.userId, identity.userId, now);
    const cancelClaims = db.prepare(`
      UPDATE recovery_claims SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE user_id = ? AND committed_at IS NULL AND cancelled_at IS NULL
        AND EXISTS (SELECT 1 FROM sync_users WHERE id = ? AND state = 'deleting' AND deleted_at = ?)
    `).bind(now, identity.userId, identity.userId, now);
    const consumeIntent = db.prepare(`
      UPDATE account_delete_intents SET consumed_at = ?
      WHERE intent_id = ? AND intent_verifier = ? AND consumed_at IS NULL
        AND EXISTS (SELECT 1 FROM sync_users WHERE id = ? AND state = 'deleting' AND deleted_at = ?)
    `).bind(now, intent.intent_id, input.intentVerifier, identity.userId, now);
    const results = await db.batch([markDeleting, revokeDevices, cancelPairing, cancelClaims, consumeIntent]);
    if (!batchSucceeded(results, 5) || changes(results[0]) !== 1 || changes(results[4]) !== 1) throw new Error('D1 account delete transaction failed');
    return { status: 'deleted', purgeAfter: now + DELETE_GRACE_MS };
  }

  async function resolveDeletedIntent(input) {
    const row = await db.prepare(`
      SELECT i.user_id, i.app_id, i.consumed_at, u.state
      FROM account_delete_intents i JOIN sync_users u ON u.id = i.user_id
      WHERE i.intent_id = ? AND i.intent_verifier = ? AND i.app_id = ?
    `).bind(input.intentId, input.intentVerifier, input.appId).first();
    return row && row.consumed_at != null && row.state === 'deleting' ? { status: 'deleted' } : { status: 'invalid' };
  }

  return Object.freeze({ list, revoke, createDeleteIntent, deleteAccount, resolveDeletedIntent, DELETE_INTENT_TTL_MS, DELETE_GRACE_MS });
}
