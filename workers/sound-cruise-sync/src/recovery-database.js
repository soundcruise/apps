import { timingSafeHexEqual } from './crypto.js';

const RECOVERY_MAX_ATTEMPTS = 5;
const RECOVERY_ATTEMPT_WINDOW_MS = 30 * 60 * 1000;
const RECOVERY_CLAIM_TTL_MS = 10 * 60 * 1000;
const RECOVERY_CLAIM_RETENTION_MS = 24 * 60 * 60 * 1000;

function changes(result) {
  return Number(result?.meta?.changes || 0);
}

function batchSucceeded(results, expected) {
  return Array.isArray(results) && results.length === expected && results.every((result) => result?.success !== false);
}

export function createD1RecoveryRepository(db, clock = Date.now) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new Error('D1 session is unavailable');
  }

  async function reserveAttempt(recoveryVerifier, now = clock()) {
    const cutoff = now - RECOVERY_ATTEMPT_WINDOW_MS;
    const cleanup = db.prepare('DELETE FROM recovery_attempts WHERE first_attempt_at <= ?').bind(cutoff);
    const reserve = db.prepare(`
      INSERT INTO recovery_attempts (recovery_verifier, first_attempt_at, last_attempt_at, attempts)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(recovery_verifier) DO UPDATE SET
        first_attempt_at = CASE WHEN recovery_attempts.first_attempt_at <= ? THEN excluded.first_attempt_at ELSE recovery_attempts.first_attempt_at END,
        last_attempt_at = excluded.last_attempt_at,
        attempts = CASE WHEN recovery_attempts.first_attempt_at <= ? THEN 1 ELSE recovery_attempts.attempts + 1 END
      WHERE recovery_attempts.first_attempt_at <= ? OR recovery_attempts.attempts < ?
    `).bind(recoveryVerifier, now, now, cutoff, cutoff, cutoff, RECOVERY_MAX_ATTEMPTS);
    const results = await db.batch([cleanup, reserve]);
    if (!batchSucceeded(results, 2)) throw new Error('D1 recovery attempt transaction failed');
    return changes(results[1]) === 1 ? { status: 'allowed' } : { status: 'attempts_exhausted' };
  }

  async function prepare(input) {
    const now = input.now || clock();
    const expiresAt = now + RECOVERY_CLAIM_TTL_MS;
    const cleanupClaims = db.prepare(`
      DELETE FROM recovery_claims
      WHERE (expires_at <= ? AND committed_at IS NULL)
         OR committed_at <= ? OR cancelled_at <= ?
    `).bind(now - RECOVERY_CLAIM_RETENTION_MS, now - RECOVERY_CLAIM_RETENTION_MS, now - RECOVERY_CLAIM_RETENTION_MS);
    const clearValidAttempt = db.prepare('DELETE FROM recovery_attempts WHERE recovery_verifier = ?').bind(input.currentRecoveryVerifier);
    const insertClaim = db.prepare(`
      INSERT INTO recovery_claims (
        claim_id, claim_verifier, user_id, target_app_id, expected_recovery_version,
        next_recovery_verifier, next_device_id, next_credential_verifier, device_label,
        created_at, expires_at, committed_at, cancelled_at
      )
      SELECT ?, ?, u.id, ?, u.recovery_version, ?, ?, ?, ?, ?, ?, NULL, NULL
      FROM sync_users u
      JOIN sync_datasets s ON s.user_id = u.id AND s.app_id = ?
      WHERE u.recovery_verifier = ? AND u.state = 'active' AND u.deleted_at IS NULL
        AND u.recovery_version >= 1
    `).bind(
      input.claimId, input.claimVerifier, input.appId, input.nextRecoveryVerifier,
      input.nextDeviceId, input.nextCredentialVerifier, input.deviceLabel,
      now, expiresAt, input.appId, input.currentRecoveryVerifier
    );
    const results = await db.batch([cleanupClaims, clearValidAttempt, insertClaim]);
    if (!batchSucceeded(results, 3)) throw new Error('D1 recovery prepare transaction failed');
    if (changes(results[2]) !== 1) return { status: 'invalid' };
    const summary = await db.prepare(`
      SELECT r.target_app_id AS app_id,
             s.record_count AS record_count,
             s.updated_at AS updated_at,
             (SELECT COUNT(*) FROM sync_records sr
              WHERE sr.user_id = r.user_id AND sr.app_id = r.target_app_id
                AND sr.record_type = 'chord' AND sr.deleted_at IS NULL) AS chord_count,
             (SELECT COUNT(*) FROM sync_records sr
              WHERE sr.user_id = r.user_id AND sr.app_id = r.target_app_id
                AND sr.record_type = 'folder' AND sr.deleted_at IS NULL) AS folder_count,
             (SELECT COUNT(*) FROM sync_devices d
              WHERE d.user_id = r.user_id AND d.app_id = r.target_app_id
                AND d.revoked_at IS NULL) AS active_device_count
      FROM recovery_claims r
      JOIN sync_datasets s ON s.user_id = r.user_id AND s.app_id = r.target_app_id
      WHERE r.claim_id = ? AND r.claim_verifier = ?
        AND r.committed_at IS NULL AND r.cancelled_at IS NULL AND r.expires_at > ?
    `).bind(input.claimId, input.claimVerifier, now).first();
    if (!summary) throw new Error('D1 recovery summary unavailable');
    return {
      status: 'prepared',
      expiresAt,
      summary: {
        appId: summary.app_id,
        recordCount: Number(summary.record_count),
        chordCount: Number(summary.chord_count),
        folderCount: Number(summary.folder_count),
        updatedAt: Number(summary.updated_at),
        activeDeviceCount: Number(summary.active_device_count)
      }
    };
  }

  async function getClaim(claimId) {
    return db.prepare(`
      SELECT claim_id, claim_verifier, user_id, target_app_id, expected_recovery_version,
             next_recovery_verifier, next_device_id, next_credential_verifier, device_label,
             created_at, expires_at, committed_at, cancelled_at
      FROM recovery_claims WHERE claim_id = ?
    `).bind(claimId).first();
  }

  async function commit(input) {
    const now = input.now || clock();
    const claim = await getClaim(input.claimId);
    if (!claim || !timingSafeHexEqual(claim.claim_verifier, input.claimVerifier) || claim.target_app_id !== input.appId) {
      return { status: 'invalid' };
    }
    // Recovery commit is idempotent for the same short-lived claim. This is the
    // response-loss proof path and does not depend on the normal snapshot gate.
    if (claim.committed_at != null) {
      const committed = await db.prepare(`
        SELECT u.recovery_version, d.id AS device_id
        FROM sync_users u JOIN sync_devices d ON d.user_id = u.id
        WHERE u.id = ? AND u.state = 'active' AND u.deleted_at IS NULL
          AND u.recovery_version = ? AND u.recovery_verifier = ?
          AND d.id = ? AND d.app_id = ? AND d.revoked_at IS NULL
      `).bind(
        claim.user_id, claim.expected_recovery_version + 1, claim.next_recovery_verifier,
        claim.next_device_id, claim.target_app_id
      ).first();
      return committed ? {
        status: 'recovered', userId: claim.user_id, deviceId: committed.device_id,
        recoveryVersion: Number(committed.recovery_version), alreadyRecovered: true
      } : { status: 'invalid' };
    }
    if (claim.cancelled_at != null || claim.expires_at <= now) return { status: 'invalid' };
    const nextVersion = claim.expected_recovery_version + 1;
    const rotate = db.prepare(`
      UPDATE sync_users
      SET recovery_version = ?, recovery_verifier = ?, recovery_rotated_at = ?, updated_at = ?
      WHERE id = ? AND state = 'active' AND deleted_at IS NULL
        AND recovery_version = ?
        AND EXISTS (
          SELECT 1 FROM recovery_claims r
          WHERE r.claim_id = ? AND r.claim_verifier = ? AND r.user_id = sync_users.id
            AND r.committed_at IS NULL AND r.cancelled_at IS NULL AND r.expires_at > ?
        )
    `).bind(
      nextVersion, claim.next_recovery_verifier, now, now, claim.user_id,
      claim.expected_recovery_version, claim.claim_id, input.claimVerifier, now
    );
    const revokeDevices = db.prepare(`
      UPDATE sync_devices SET revoked_at = COALESCE(revoked_at, ?)
      WHERE user_id = ? AND revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM sync_users WHERE id = ? AND recovery_version = ? AND recovery_verifier = ?)
    `).bind(now, claim.user_id, claim.user_id, nextVersion, claim.next_recovery_verifier);
    const cancelPairing = db.prepare(`
      UPDATE pairing_codes SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE user_id = ? AND consumed_at IS NULL AND cancelled_at IS NULL
        AND EXISTS (SELECT 1 FROM sync_users WHERE id = ? AND recovery_version = ? AND recovery_verifier = ?)
    `).bind(now, claim.user_id, claim.user_id, nextVersion, claim.next_recovery_verifier);
    const cancelOtherClaims = db.prepare(`
      UPDATE recovery_claims SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE user_id = ? AND claim_id <> ? AND committed_at IS NULL AND cancelled_at IS NULL
        AND EXISTS (SELECT 1 FROM sync_users WHERE id = ? AND recovery_version = ? AND recovery_verifier = ?)
    `).bind(now, claim.user_id, claim.claim_id, claim.user_id, nextVersion, claim.next_recovery_verifier);
    const createDevice = db.prepare(`
      INSERT INTO sync_devices (
        id, user_id, app_id, credential_version, credential_verifier, label,
        last_cursor, created_at, last_seen_at, revoked_at, pairing_pending_at, paired_at
      )
      SELECT r.next_device_id, r.user_id, r.target_app_id, 1, r.next_credential_verifier,
             r.device_label, 0, ?, ?, NULL, NULL, ?
      FROM recovery_claims r
      JOIN sync_users u ON u.id = r.user_id
      WHERE r.claim_id = ? AND r.claim_verifier = ? AND r.target_app_id = ?
        AND r.committed_at IS NULL AND r.cancelled_at IS NULL AND r.expires_at > ?
        AND u.recovery_version = ? AND u.recovery_verifier = ? AND u.state = 'active'
    `).bind(now, now, now, claim.claim_id, input.claimVerifier, input.appId, now, nextVersion, claim.next_recovery_verifier);
    // The CHECK on committed_at deliberately aborts and rolls back the whole D1
    // batch if rotation did not produce the exact new device. This turns the
    // conditional write into an atomic compare-and-swap under concurrent recovery.
    const finishClaim = db.prepare(`
      UPDATE recovery_claims
      SET committed_at = CASE
        WHEN EXISTS (
          SELECT 1 FROM sync_devices d JOIN sync_users u ON u.id = d.user_id
          WHERE d.id = recovery_claims.next_device_id AND d.user_id = recovery_claims.user_id
            AND d.revoked_at IS NULL AND u.recovery_version = ? AND u.recovery_verifier = ?
        ) THEN ? ELSE created_at - 1 END
      WHERE claim_id = ? AND claim_verifier = ? AND committed_at IS NULL AND cancelled_at IS NULL
    `).bind(nextVersion, claim.next_recovery_verifier, now, claim.claim_id, input.claimVerifier);
    try {
      const results = await db.batch([rotate, revokeDevices, cancelPairing, cancelOtherClaims, createDevice, finishClaim]);
      if (!batchSucceeded(results, 6) || changes(results[0]) !== 1 || changes(results[4]) !== 1 || changes(results[5]) !== 1) {
        throw new Error('D1 recovery compare-and-swap failed');
      }
      return { status: 'recovered', userId: claim.user_id, deviceId: claim.next_device_id, recoveryVersion: nextVersion };
    } catch (error) {
      // A competing recovery changes the version and invalidates this claim.
      // Treat that expected CAS loss as a generic invalid recovery, but do not
      // disguise a genuine D1 outage as a bad user code.
      const state = await db.prepare(`
        SELECT u.recovery_version, r.committed_at, r.cancelled_at
        FROM recovery_claims r
        LEFT JOIN sync_users u ON u.id = r.user_id
        WHERE r.claim_id = ?
      `).bind(claim.claim_id).first();
      if (!state || state.committed_at != null || state.cancelled_at != null ||
          state.recovery_version !== claim.expected_recovery_version) {
        return { status: 'invalid' };
      }
      throw error;
    }
  }

  async function regenerate(identity, nextRecoveryVerifier, now = clock()) {
    const current = await db.prepare(`
      SELECT recovery_version FROM sync_users
      WHERE id = ? AND state = 'active' AND deleted_at IS NULL
    `).bind(identity.userId).first();
    if (!current || current.recovery_version < 1) return { status: 'invalid' };
    const nextVersion = current.recovery_version + 1;
    const rotate = db.prepare(`
      UPDATE sync_users SET recovery_version = ?, recovery_verifier = ?, recovery_rotated_at = ?, updated_at = ?
      WHERE id = ? AND state = 'active' AND deleted_at IS NULL AND recovery_version = ?
    `).bind(nextVersion, nextRecoveryVerifier, now, now, identity.userId, current.recovery_version);
    const cancelClaims = db.prepare(`
      UPDATE recovery_claims SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE user_id = ? AND committed_at IS NULL AND cancelled_at IS NULL
        AND EXISTS (SELECT 1 FROM sync_users WHERE id = ? AND recovery_version = ? AND recovery_verifier = ?)
    `).bind(now, identity.userId, identity.userId, nextVersion, nextRecoveryVerifier);
    const results = await db.batch([rotate, cancelClaims]);
    if (!batchSucceeded(results, 2)) throw new Error('D1 recovery regeneration transaction failed');
    return changes(results[0]) === 1 ? { status: 'rotated', recoveryVersion: nextVersion } : { status: 'invalid' };
  }

  return Object.freeze({
    reserveAttempt,
    prepare,
    getClaim,
    commit,
    regenerate,
    RECOVERY_MAX_ATTEMPTS,
    RECOVERY_ATTEMPT_WINDOW_MS,
    RECOVERY_CLAIM_TTL_MS,
    RECOVERY_CLAIM_RETENTION_MS
  });
}
