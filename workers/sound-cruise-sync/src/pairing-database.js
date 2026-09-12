const PAIRING_MAX_ACTIVE_CODES = 3;
const PAIRING_MAX_DEVICES = 10;
const PAIRING_MAX_ATTEMPTS = 5;
const PAIRING_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const PAIRING_CODE_RETENTION_MS = 24 * 60 * 60 * 1000;
const ORPHAN_PAIRING_DEVICE_MS = 15 * 60 * 1000;

function changes(result) {
  return Number(result?.meta?.changes || 0);
}

function batchSucceeded(results, expected) {
  return Array.isArray(results) && results.length === expected && results.every((result) => result?.success !== false);
}

export function createD1PairingRepository(db, clock = Date.now) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new Error('D1 session is unavailable');
  }

  async function getCode(verifier) {
    return db.prepare(`
      SELECT p.code_verifier, p.user_id, p.created_by_device_id, p.target_app_id,
             p.attempts_remaining, p.created_at, p.expires_at, p.consumed_at, p.cancelled_at,
             d.revoked_at AS creator_revoked_at
      FROM pairing_codes p
      LEFT JOIN sync_devices d ON d.id = p.created_by_device_id
      WHERE p.code_verifier = ?
    `).bind(verifier).first();
  }

  async function issue(identity, input) {
    const now = input.now || clock();
    const expiresAt = now + input.ttlMs;
    const issueId = input.issueId || crypto.randomUUID();
    // D1 has no scheduled cleanup binding in this Pilot. Purge finished code
    // lifecycle rows opportunistically, while preserving 24 hours of status
    // for a user who retries after an expired or already-used code.
    const cleanupFinished = db.prepare(`
      DELETE FROM pairing_codes
      WHERE (consumed_at IS NOT NULL AND consumed_at <= ?)
         OR (cancelled_at IS NOT NULL AND cancelled_at <= ?)
         OR (expires_at <= ?)
    `).bind(
      now - PAIRING_CODE_RETENTION_MS,
      now - PAIRING_CODE_RETENTION_MS,
      now - PAIRING_CODE_RETENTION_MS
    );
    // A newly issued code replaces earlier codes from this same device. Codes
    // created by another active device remain valid until the per-user cap.
    const cancelOwn = db.prepare(`
      UPDATE pairing_codes
      SET cancelled_at = ?
      WHERE user_id = ? AND target_app_id = ? AND created_by_device_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at > ?
    `).bind(now, identity.userId, identity.appId, identity.deviceId, now);
    const claimIssueWindow = db.prepare(`
      INSERT INTO pairing_issue_windows (device_id, window_started_at, issued_count, last_issue_id)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        window_started_at = CASE
          WHEN pairing_issue_windows.window_started_at <= ? THEN excluded.window_started_at
          ELSE pairing_issue_windows.window_started_at
        END,
        issued_count = CASE
          WHEN pairing_issue_windows.window_started_at <= ? THEN 1
          ELSE pairing_issue_windows.issued_count + 1
        END,
        last_issue_id = excluded.last_issue_id
      WHERE pairing_issue_windows.window_started_at <= ? OR pairing_issue_windows.issued_count < 3
    `).bind(
      identity.deviceId, now, issueId,
      now - input.windowMs, now - input.windowMs, now - input.windowMs
    );
    const insert = db.prepare(`
      INSERT INTO pairing_codes (
        code_verifier, user_id, created_by_device_id, target_app_id, attempts_remaining,
        created_at, expires_at, consumed_at, cancelled_at
      )
      SELECT ?, ?, ?, ?, 5, ?, ?, NULL, NULL
      WHERE EXISTS (
        SELECT 1 FROM pairing_issue_windows
        WHERE device_id = ? AND last_issue_id = ?
      ) AND (
        SELECT COUNT(*) FROM pairing_codes
        WHERE user_id = ? AND target_app_id = ?
          AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at > ?
      ) < ?
    `).bind(
      input.codeVerifier, identity.userId, identity.deviceId, identity.appId, now, expiresAt,
      identity.deviceId, issueId, identity.userId, identity.appId, now, PAIRING_MAX_ACTIVE_CODES
    );
    const results = await db.batch([cleanupFinished, cancelOwn, claimIssueWindow, insert]);
    if (!batchSucceeded(results, 4)) throw new Error('D1 pairing issue transaction failed');
    if (changes(results[2]) !== 1) return { status: 'rate_limited' };
    if (changes(results[3]) !== 1) return { status: 'code_limit' };
    return { status: 'issued', expiresAt };
  }

  // A wrong entry cannot be connected to an issued code without retaining
  // plaintext. This counter uses only the candidate's HMAC verifier; the IP
  // rate limiter separately bounds varied-code enumeration.
  async function reserveAttempt(codeVerifier, now = clock()) {
    const cutoff = now - PAIRING_ATTEMPT_WINDOW_MS;
    const deleteExpired = db.prepare(`
      DELETE FROM pairing_attempts
      WHERE first_attempt_at <= ?
    `).bind(cutoff);
    const reserve = db.prepare(`
      INSERT INTO pairing_attempts (code_verifier, first_attempt_at, last_attempt_at, attempts)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(code_verifier) DO UPDATE SET
        first_attempt_at = CASE WHEN pairing_attempts.first_attempt_at <= ? THEN excluded.first_attempt_at ELSE pairing_attempts.first_attempt_at END,
        last_attempt_at = excluded.last_attempt_at,
        attempts = CASE WHEN pairing_attempts.first_attempt_at <= ? THEN 1 ELSE pairing_attempts.attempts + 1 END
      WHERE pairing_attempts.first_attempt_at <= ? OR pairing_attempts.attempts < ?
    `).bind(codeVerifier, now, now, cutoff, cutoff, cutoff, PAIRING_MAX_ATTEMPTS);
    const results = await db.batch([deleteExpired, reserve]);
    if (!batchSucceeded(results, 2)) throw new Error('D1 pairing attempt transaction failed');
    return changes(results[1]) === 1 ? { status: 'allowed' } : { status: 'attempts_exhausted' };
  }

  function statusFor(row, now) {
    if (!row) return 'invalid';
    if (row.cancelled_at != null || row.created_by_device_id == null || row.creator_revoked_at != null) return 'cancelled';
    if (row.consumed_at != null) return 'used';
    if (row.expires_at <= now) return 'expired';
    if (row.attempts_remaining <= 0) return 'attempts_exhausted';
    return 'active';
  }

  async function consume(identityMaterial, input) {
    const now = input.now || clock();
    const current = await getCode(input.codeVerifier);
    const status = statusFor(current, now);
    if (status !== 'active') return { status };
    if (current.target_app_id !== input.appId) return { status: 'invalid' };

    const removeExpiredOrphans = db.prepare(`
      DELETE FROM sync_devices
      WHERE user_id = ? AND app_id = ? AND pairing_pending_at IS NOT NULL
        AND paired_at IS NULL AND pairing_pending_at <= ?
    `).bind(current.user_id, input.appId, now - ORPHAN_PAIRING_DEVICE_MS);
    const createDevice = db.prepare(`
      INSERT INTO sync_devices (
        id, user_id, app_id, credential_version, credential_verifier, label,
        last_cursor, created_at, last_seen_at, revoked_at, pairing_pending_at, paired_at
      )
      SELECT ?, p.user_id, p.target_app_id, 1, ?, ?, 0, ?, ?, NULL, ?, NULL
      FROM pairing_codes p
      JOIN sync_devices issuer ON issuer.id = p.created_by_device_id
      WHERE p.code_verifier = ? AND p.target_app_id = ? AND p.consumed_at IS NULL
        AND p.cancelled_at IS NULL AND p.expires_at > ? AND p.attempts_remaining > 0
        AND issuer.revoked_at IS NULL
        AND (
          SELECT COUNT(*) FROM sync_devices d
          WHERE d.user_id = p.user_id AND d.app_id = p.target_app_id AND d.revoked_at IS NULL
        ) < ?
    `).bind(
      identityMaterial.deviceId, identityMaterial.credentialVerifier, input.deviceLabel,
      now, now, now, input.codeVerifier, input.appId, now, PAIRING_MAX_DEVICES
    );
    const consumeCode = db.prepare(`
      UPDATE pairing_codes
      SET consumed_at = ?, attempts_remaining = attempts_remaining - 1
      WHERE code_verifier = ? AND target_app_id = ? AND consumed_at IS NULL
        AND cancelled_at IS NULL AND expires_at > ? AND attempts_remaining > 0
        AND EXISTS (
          SELECT 1 FROM sync_devices d
          WHERE d.id = ? AND d.user_id = pairing_codes.user_id
            AND d.app_id = pairing_codes.target_app_id AND d.revoked_at IS NULL
        )
    `).bind(now, input.codeVerifier, input.appId, now, identityMaterial.deviceId);
    const results = await db.batch([removeExpiredOrphans, createDevice, consumeCode]);
    if (!batchSucceeded(results, 3)) throw new Error('D1 pairing consume transaction failed');
    if (changes(results[1]) === 1 && changes(results[2]) === 1) return { status: 'paired', userId: current.user_id };
    const after = await getCode(input.codeVerifier);
    if (statusFor(after, now) === 'used') return { status: 'used' };
    const activeDevices = await db.prepare(`
      SELECT COUNT(*) AS count FROM sync_devices
      WHERE user_id = ? AND app_id = ? AND revoked_at IS NULL
    `).bind(current.user_id, input.appId).first();
    return Number(activeDevices?.count || 0) >= PAIRING_MAX_DEVICES ? { status: 'device_limit' } : { status: 'invalid' };
  }

  return Object.freeze({
    getCode, issue, reserveAttempt, consume, statusFor,
    PAIRING_MAX_ACTIVE_CODES, PAIRING_MAX_ATTEMPTS, PAIRING_MAX_DEVICES,
    PAIRING_ATTEMPT_WINDOW_MS, PAIRING_CODE_RETENTION_MS, ORPHAN_PAIRING_DEVICE_MS
  });
}
