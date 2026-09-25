import { timingSafeHexEqual } from './crypto.js';
import { accountOperationFingerprint } from './account-crypto.js';

export const ACCOUNT_LIFECYCLE = Object.freeze({
  recoveryClaimTtlMs: 10 * 60 * 1000,
  deleteIntentTtlMs: 10 * 60 * 1000,
  deleteGraceMs: 7 * 24 * 60 * 60 * 1000,
  recoveryAttemptWindowMs: 30 * 60 * 1000,
  recoveryMaxAttempts: 5
});

function changes(result) { return Number(result?.meta?.changes || 0); }
function batchSucceeded(results, expected) {
  return Array.isArray(results) && results.length === expected &&
    results.every((result) => result?.success !== false);
}

function lifecycleResult(row) {
  if (!row) return null;
  try { return JSON.parse(row.result_json); } catch { return null; }
}

export function createD1AccountLifecycleRepository(db, clock = Date.now) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new Error('D1 Account lifecycle session is unavailable');
  }

  async function operation(operationId) {
    return db.prepare(`
      SELECT o.operation_id, o.request_fingerprint, o.account_id, o.kind, o.target_id,
             o.result_json, o.created_at, a.admission_provenance
      FROM sync_account_lifecycle_operations o
      JOIN sync_accounts a ON a.id = o.account_id
      WHERE o.operation_id = ?
    `).bind(operationId).first();
  }

  async function qaSessionMatches(sessionId, accountId, now, allowUnbound) {
    if (!sessionId) return true;
    const row = await db.prepare(`
      SELECT account_id FROM sync_account_qa_sessions
      WHERE id = ? AND scope = 'port' AND revoked_at IS NULL AND expires_at > ?
    `).bind(sessionId, now).first();
    return Boolean(row && (row.account_id === accountId || (allowUnbound && row.account_id == null)));
  }

  async function recoverySummary(claimId, claimVerifier, now, admissionProvenance) {
    const claim = await db.prepare(`
      SELECT r.account_id, r.expected_recovery_version, r.expected_account_generation,
             r.expires_at, a.updated_at,
             (SELECT COUNT(*) FROM sync_account_devices d
               WHERE d.account_id = a.id AND d.revoked_at IS NULL) AS active_device_count
      FROM sync_account_recovery_claims r
      JOIN sync_accounts a ON a.id = r.account_id
      WHERE r.claim_id = ? AND r.claim_verifier = ?
        AND r.committed_at IS NULL AND r.cancelled_at IS NULL AND r.expires_at > ?
        AND a.state = 'active' AND a.recovery_version = r.expected_recovery_version
        AND a.generation = r.expected_account_generation
        AND a.admission_provenance = ?
    `).bind(claimId, claimVerifier, now, admissionProvenance).first();
    if (!claim) return null;
    const memberships = await db.prepare(`
      SELECT m.id, m.app_id, m.state, m.updated_at,
             d.state AS dataset_state, d.schema_version, d.record_count,
             d.manifest_hash, d.updated_at AS dataset_updated_at, d.last_change_seq
      FROM sync_account_memberships m
      LEFT JOIN sync_datasets d ON d.user_id = m.sync_user_id AND d.app_id = m.app_id
      WHERE m.account_id = ?
      ORDER BY CASE m.app_id WHEN 'chord' THEN 1 WHEN 'pitch' THEN 2
        WHEN 'fretboard' THEN 3 WHEN 'rhythm' THEN 4 ELSE 5 END
    `).bind(claim.account_id).all();
    return {
      accountId: claim.account_id,
      recoveryVersion: Number(claim.expected_recovery_version),
      generation: Number(claim.expected_account_generation),
      activeDeviceCount: Number(claim.active_device_count),
      updatedAt: Number(claim.updated_at),
      expiresAt: Number(claim.expires_at),
      memberships: (memberships?.results || []).map((row) => ({
        appId: row.app_id,
        state: row.state,
        updatedAt: Number(row.updated_at),
        dataset: row.dataset_state == null ? null : {
          state: row.dataset_state,
          schemaVersion: Number(row.schema_version),
          recordCount: Number(row.record_count),
          manifestHash: row.manifest_hash,
          updatedAt: Number(row.dataset_updated_at),
          lastChangeSeq: Number(row.last_change_seq)
        }
      }))
    };
  }

  async function resolveRecoveryPrepare(input) {
    input = { admissionProvenance: 'qa', ...input };
    const row = await db.prepare(`
      SELECT r.claim_id, r.claim_verifier, r.prepare_fingerprint, r.expires_at,
             r.committed_at, r.cancelled_at, r.account_id, a.admission_provenance
      FROM sync_account_recovery_claims r
      JOIN sync_accounts a ON a.id = r.account_id
      WHERE r.prepare_operation_id = ?
    `).bind(input.operationId).first();
    if (!row) return null;
    if (row.admission_provenance !== input.admissionProvenance ||
        row.prepare_fingerprint !== input.requestFingerprint || row.claim_id !== input.claimId ||
        !timingSafeHexEqual(row.claim_verifier, input.claimVerifier)) return { status: 'conflict' };
    if (row.committed_at != null) return { status: 'committed' };
    if (row.cancelled_at != null || Number(row.expires_at) <= input.now) return { status: 'expired' };
    if (!await qaSessionMatches(input.qaSessionId, row.account_id, input.now, true)) {
      return { status: 'invalid' };
    }
    const summary = await recoverySummary(row.claim_id, input.claimVerifier, input.now,
      input.admissionProvenance);
    return summary ? { status: 'prepared', summary, alreadyPrepared: true } : { status: 'invalid' };
  }

  async function reserveRecoveryAttempt(recoveryVerifier, now = clock()) {
    const cutoff = now - ACCOUNT_LIFECYCLE.recoveryAttemptWindowMs;
    const cleanup = db.prepare(`
      DELETE FROM sync_account_recovery_attempts WHERE first_attempt_at <= ?
    `).bind(cutoff);
    const reserve = db.prepare(`
      INSERT INTO sync_account_recovery_attempts (
        recovery_verifier, first_attempt_at, last_attempt_at, attempts
      ) VALUES (?, ?, ?, 1)
      ON CONFLICT(recovery_verifier) DO UPDATE SET
        first_attempt_at = CASE WHEN first_attempt_at <= ? THEN excluded.first_attempt_at ELSE first_attempt_at END,
        last_attempt_at = excluded.last_attempt_at,
        attempts = CASE WHEN first_attempt_at <= ? THEN 1 ELSE attempts + 1 END
      WHERE first_attempt_at <= ? OR attempts < ?
    `).bind(recoveryVerifier, now, now, cutoff, cutoff, cutoff,
      ACCOUNT_LIFECYCLE.recoveryMaxAttempts);
    const results = await db.batch([cleanup, reserve]);
    if (!batchSucceeded(results, 2)) throw new Error('D1 Account recovery attempt failed');
    return changes(results[1]) === 1 ? { status: 'allowed' } : { status: 'exhausted' };
  }

  async function prepareRecovery(input) {
    input = { admissionProvenance: 'qa', ...input };
    const retry = await resolveRecoveryPrepare(input);
    if (retry) return retry;
    const expiresAt = input.now + ACCOUNT_LIFECYCLE.recoveryClaimTtlMs;
    const insert = db.prepare(`
      INSERT INTO sync_account_recovery_claims (
        claim_id, claim_verifier, account_id, scope, target_membership_id,
        expected_recovery_version, expected_account_generation,
        next_recovery_verifier, next_account_device_id, next_account_credential_verifier,
        device_label, created_at, expires_at, committed_at, cancelled_at,
        prepare_operation_id, prepare_fingerprint, commit_operation_id, commit_fingerprint
      )
      SELECT ?, ?, a.id, 'account', NULL, a.recovery_version, a.generation,
             ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL
      FROM sync_accounts a
      WHERE a.recovery_verifier = ? AND a.state = 'active' AND a.deleted_at IS NULL
        AND a.recovery_version >= 1 AND a.admission_provenance = ?
        AND (? IS NULL OR EXISTS (
          SELECT 1 FROM sync_account_qa_sessions q
          WHERE q.id = ? AND q.scope = 'port' AND q.revoked_at IS NULL
            AND q.expires_at > ? AND (q.account_id IS NULL OR q.account_id = a.id)
        ))
    `).bind(
      input.claimId, input.claimVerifier, input.nextRecoveryVerifier,
      input.nextAccountDeviceId, input.nextAccountCredentialVerifier,
      input.deviceLabel, input.now, expiresAt, input.operationId,
      input.requestFingerprint, input.currentRecoveryVerifier, input.admissionProvenance,
      input.qaSessionId || null, input.qaSessionId || null, input.now
    );
    const clearAttempt = db.prepare(`
      DELETE FROM sync_account_recovery_attempts WHERE recovery_verifier = ?
        AND EXISTS (SELECT 1 FROM sync_account_recovery_claims
          WHERE claim_id = ? AND prepare_operation_id = ?)
    `).bind(input.currentRecoveryVerifier, input.claimId, input.operationId);
    const results = await db.batch([insert, clearAttempt]);
    if (!batchSucceeded(results, 2)) throw new Error('D1 Account recovery prepare failed');
    if (changes(results[0]) !== 1) return { status: 'invalid' };
    const summary = await recoverySummary(input.claimId, input.claimVerifier, input.now,
      input.admissionProvenance);
    if (!summary) throw new Error('D1 Account recovery summary unavailable');
    return { status: 'prepared', summary, alreadyPrepared: false };
  }

  async function commitRecovery(input) {
    input = { admissionProvenance: 'qa', ...input };
    const previous = await operation(input.operationId);
    if (previous) {
      if (previous.admission_provenance !== input.admissionProvenance ||
          previous.request_fingerprint !== input.requestFingerprint || previous.kind !== 'recovery') {
        return { status: 'conflict' };
      }
      if (!await qaSessionMatches(input.qaSessionId, previous.account_id, input.now, false)) {
        return { status: 'invalid' };
      }
      return { status: 'recovered', ...lifecycleResult(previous), alreadyRecovered: true };
    }
    const claim = await db.prepare(`
      SELECT claim_id, claim_verifier, account_id, expected_recovery_version,
             expected_account_generation, next_recovery_verifier,
             next_account_device_id, next_account_credential_verifier,
             device_label, expires_at, committed_at, cancelled_at,
             prepare_fingerprint, commit_operation_id, commit_fingerprint,
             (SELECT recovery_verifier FROM sync_accounts
               WHERE id = sync_account_recovery_claims.account_id) AS current_recovery_verifier,
             (SELECT admission_provenance FROM sync_accounts
               WHERE id = sync_account_recovery_claims.account_id) AS admission_provenance
      FROM sync_account_recovery_claims WHERE claim_id = ?
    `).bind(input.claimId).first();
    if (!claim || claim.admission_provenance !== input.admissionProvenance ||
        !timingSafeHexEqual(claim.claim_verifier || '', input.claimVerifier) ||
        !timingSafeHexEqual(claim.next_account_credential_verifier || '', input.nextAccountCredentialVerifier)) {
      return { status: 'invalid' };
    }
    const qaSessionId = input.qaSessionId || null;
    if (claim.committed_at != null) {
      const active = await db.prepare(`
        SELECT a.recovery_version FROM sync_accounts a
        JOIN sync_account_devices d ON d.account_id = a.id
        WHERE a.id = ? AND a.state = 'active' AND a.recovery_version = ?
          AND a.recovery_verifier = ? AND a.admission_provenance = ?
          AND d.id = ? AND d.revoked_at IS NULL
      `).bind(claim.account_id, Number(claim.expected_recovery_version) + 1,
        claim.next_recovery_verifier, input.admissionProvenance,
        claim.next_account_device_id).first();
      const qaSessionValid = await qaSessionMatches(qaSessionId, claim.account_id, input.now, false);
      return active && qaSessionValid ? {
        status: 'recovered', accountId: claim.account_id,
        accountDeviceId: claim.next_account_device_id,
        recoveryVersion: Number(active.recovery_version), alreadyRecovered: true
      } : { status: 'invalid' };
    }
    if (claim.cancelled_at != null) return { status: 'invalid' };
    if (Number(claim.expires_at) <= input.now) return { status: 'expired' };
    if (!await qaSessionMatches(qaSessionId, claim.account_id, input.now, true)) {
      return { status: 'invalid' };
    }
    if (qaSessionId) {
      const expectedPrepareFingerprint = await accountOperationFingerprint([
        'account-recovery-prepare', claim.claim_verifier, claim.current_recovery_verifier,
        claim.next_recovery_verifier, claim.next_account_device_id,
        claim.next_account_credential_verifier, claim.device_label || '', qaSessionId,
        input.admissionProvenance
      ]);
      if (!timingSafeHexEqual(claim.prepare_fingerprint || '', expectedPrepareFingerprint)) {
        return { status: 'invalid' };
      }
    }
    const nextVersion = Number(claim.expected_recovery_version) + 1;
    const resultBody = {
      accountId: claim.account_id,
      accountDeviceId: claim.next_account_device_id,
      recoveryVersion: nextVersion
    };
    const rotate = db.prepare(`
      UPDATE sync_accounts SET recovery_version = ?, recovery_verifier = ?,
        recovery_rotated_at = ?, updated_at = ?, generation = generation + 1
      WHERE id = ? AND state = 'active' AND recovery_version = ? AND generation = ?
        AND admission_provenance = ?
        AND EXISTS (SELECT 1 FROM sync_account_recovery_claims r
          WHERE r.claim_id = ? AND r.claim_verifier = ? AND r.committed_at IS NULL
            AND r.cancelled_at IS NULL AND r.expires_at > ?)
        AND (? IS NULL OR EXISTS (
          SELECT 1 FROM sync_account_qa_sessions q
          WHERE q.id = ? AND q.scope = 'port' AND q.revoked_at IS NULL
            AND q.expires_at > ?
            AND (q.account_id IS NULL OR q.account_id = sync_accounts.id)
        ))
    `).bind(nextVersion, claim.next_recovery_verifier, input.now, input.now,
      claim.account_id, claim.expected_recovery_version, claim.expected_account_generation,
      input.admissionProvenance,
      claim.claim_id, input.claimVerifier, input.now,
      qaSessionId, qaSessionId, input.now);
    const revokeAccountDevices = db.prepare(`
      UPDATE sync_account_devices SET revoked_at = COALESCE(revoked_at, ?)
      WHERE account_id = ? AND revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM sync_accounts WHERE id = ? AND recovery_version = ?)
    `).bind(input.now, claim.account_id, claim.account_id, nextVersion);
    const revokeAppDevices = db.prepare(`
      UPDATE sync_devices SET revoked_at = COALESCE(revoked_at, ?)
      WHERE id IN (SELECT l.app_device_id FROM sync_membership_device_links l
        WHERE l.account_id = ?) AND revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM sync_accounts WHERE id = ? AND recovery_version = ?)
    `).bind(input.now, claim.account_id, claim.account_id, nextVersion);
    const cancelHandoffs = db.prepare(`
      UPDATE sync_membership_handoffs SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE account_id = ? AND consumed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, claim.account_id);
    const cancelJoins = db.prepare(`
      UPDATE sync_app_join_invitations SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE account_id = ? AND consumed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, claim.account_id);
    const cancelPortJoins = db.prepare(`
      UPDATE sync_port_join_invitations SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE account_id = ? AND consumed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, claim.account_id);
    const createDevice = db.prepare(`
      INSERT INTO sync_account_devices (
        id, account_id, credential_version, credential_verifier,
        label, created_at, last_seen_at, revoked_at
      ) SELECT ?, ?, 1, ?, ?, ?, ?, NULL
      WHERE EXISTS (SELECT 1 FROM sync_accounts
        WHERE id = ? AND state = 'active' AND recovery_version = ? AND recovery_verifier = ?)
    `).bind(claim.next_account_device_id, claim.account_id,
      claim.next_account_credential_verifier, claim.device_label,
      input.now, input.now, claim.account_id, nextVersion, claim.next_recovery_verifier);
    const cancelOtherClaims = db.prepare(`
      UPDATE sync_account_recovery_claims SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE account_id = ? AND claim_id <> ? AND committed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, claim.account_id, claim.claim_id);
    const finish = db.prepare(`
      UPDATE sync_account_recovery_claims
      SET committed_at = ?, commit_operation_id = ?, commit_fingerprint = ?
      WHERE claim_id = ? AND claim_verifier = ? AND committed_at IS NULL AND cancelled_at IS NULL
        AND EXISTS (SELECT 1 FROM sync_account_devices d
          WHERE d.id = next_account_device_id AND d.account_id = sync_account_recovery_claims.account_id
            AND d.revoked_at IS NULL)
    `).bind(input.now, input.operationId, input.requestFingerprint,
      claim.claim_id, input.claimVerifier);
    const record = db.prepare(`
      INSERT INTO sync_account_lifecycle_operations (
        operation_id, request_fingerprint, account_id, kind, target_id, result_json, created_at
      ) SELECT ?, ?, ?, 'recovery', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM sync_account_recovery_claims
        WHERE claim_id = ? AND committed_at = ? AND commit_operation_id = ?)
    `).bind(input.operationId, input.requestFingerprint, claim.account_id,
      claim.next_account_device_id, JSON.stringify(resultBody), input.now,
      claim.claim_id, input.now, input.operationId);
    const bindQaSession = qaSessionId ? db.prepare(`
      UPDATE sync_account_qa_sessions SET account_id = ?, last_used_at = ?
      WHERE id = ? AND scope = 'port' AND revoked_at IS NULL AND expires_at > ?
        AND (account_id IS NULL OR account_id = ?)
        AND EXISTS (SELECT 1 FROM sync_account_lifecycle_operations o
          WHERE o.operation_id = ? AND o.account_id = ? AND o.kind = 'recovery')
    `).bind(claim.account_id, input.now, qaSessionId, input.now, claim.account_id,
      input.operationId, claim.account_id) : null;
    const guard = db.prepare(`
      UPDATE sync_accounts SET updated_at = CASE
        WHEN state = 'active' AND recovery_version = ? AND recovery_verifier = ?
          AND (SELECT COUNT(*) FROM sync_account_devices d
            WHERE d.account_id = sync_accounts.id AND d.revoked_at IS NULL) = 1
          AND EXISTS (SELECT 1 FROM sync_account_lifecycle_operations o
            WHERE o.operation_id = ? AND o.account_id = sync_accounts.id)
          AND (? IS NULL OR EXISTS (
            SELECT 1 FROM sync_account_qa_sessions q
            WHERE q.id = ? AND q.scope = 'port' AND q.account_id = sync_accounts.id
              AND q.revoked_at IS NULL AND q.expires_at > ?
          ))
        THEN updated_at ELSE created_at - 1 END
      WHERE id = ?
    `).bind(nextVersion, claim.next_recovery_verifier, input.operationId,
      qaSessionId, qaSessionId, input.now, claim.account_id);
    try {
      const statements = [rotate, revokeAccountDevices, revokeAppDevices, cancelHandoffs,
        cancelJoins, cancelPortJoins, createDevice, cancelOtherClaims, finish, record];
      const bindIndex = bindQaSession ? statements.push(bindQaSession) - 1 : -1;
      const guardIndex = statements.push(guard) - 1;
      const results = await db.batch(statements);
      if (!batchSucceeded(results, statements.length) || changes(results[0]) !== 1 ||
          changes(results[6]) !== 1 || changes(results[8]) !== 1 ||
          changes(results[9]) !== 1 || (bindIndex >= 0 && changes(results[bindIndex]) !== 1) ||
          changes(results[guardIndex]) !== 1) {
        throw new Error('D1 Account recovery compare-and-swap failed');
      }
      return { status: 'recovered', ...resultBody, alreadyRecovered: false };
    } catch (error) {
      const raced = await operation(input.operationId);
      if (raced?.admission_provenance === input.admissionProvenance &&
          raced?.request_fingerprint === input.requestFingerprint) {
        return { status: 'recovered', ...lifecycleResult(raced), alreadyRecovered: true };
      }
      const current = await db.prepare(`SELECT recovery_version, state FROM sync_accounts WHERE id = ?`)
        .bind(claim.account_id).first();
      if (!current || current.state !== 'active' || Number(current.recovery_version) !== Number(claim.expected_recovery_version)) {
        return { status: 'invalid' };
      }
      throw error;
    }
  }

  async function resolveRecoveryRotationPrepare(identity, input) {
    const row = await db.prepare(`
      SELECT r.claim_id, r.account_id, r.requested_by_account_device_id,
             r.prepare_fingerprint, r.expires_at, r.committed_at, r.cancelled_at,
             r.expected_recovery_version, a.recovery_version, a.state,
             a.admission_provenance, d.revoked_at
      FROM sync_account_recovery_rotations r
      JOIN sync_accounts a ON a.id = r.account_id
      JOIN sync_account_devices d ON d.id = r.requested_by_account_device_id
      WHERE r.prepare_operation_id = ?
    `).bind(input.operationId).first();
    if (!row) return null;
    if (row.account_id !== identity.accountId ||
        row.requested_by_account_device_id !== identity.accountDeviceId ||
        row.admission_provenance !== (identity.admissionProvenance || 'qa') ||
        row.prepare_fingerprint !== input.requestFingerprint ||
        row.claim_id !== input.claimId) return { status: 'conflict' };
    if (row.committed_at != null) return { status: 'committed' };
    if (row.cancelled_at != null || Number(row.expires_at) <= input.now ||
        row.state !== 'active' || row.revoked_at != null ||
        Number(row.recovery_version) !== Number(row.expected_recovery_version)) {
      return { status: 'invalid' };
    }
    return {
      status: 'prepared',
      recoveryVersion: Number(row.expected_recovery_version),
      expiresAt: Number(row.expires_at),
      alreadyPrepared: true
    };
  }

  async function prepareRecoveryRotation(identity, input) {
    const retry = await resolveRecoveryRotationPrepare(identity, input);
    if (retry) return retry;
    const expiresAt = input.now + ACCOUNT_LIFECYCLE.recoveryClaimTtlMs;
    try {
      const result = await db.prepare(`
        INSERT INTO sync_account_recovery_rotations (
          claim_id, claim_verifier, account_id, requested_by_account_device_id,
          expected_recovery_version, expected_account_generation,
          next_recovery_verifier, created_at, expires_at, committed_at, cancelled_at,
          prepare_operation_id, prepare_fingerprint, commit_operation_id, commit_fingerprint
        )
        SELECT ?, ?, a.id, d.id, a.recovery_version, a.generation,
               ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL
        FROM sync_accounts a
        JOIN sync_account_devices d ON d.account_id = a.id
        WHERE a.id = ? AND d.id = ? AND d.revoked_at IS NULL
          AND a.state = 'active' AND a.deleted_at IS NULL
          AND a.recovery_version = ? AND a.generation = ?
          AND a.admission_provenance = ?
      `).bind(
        input.claimId, input.claimVerifier, input.nextRecoveryVerifier,
        input.now, expiresAt, input.operationId, input.requestFingerprint,
        identity.accountId, identity.accountDeviceId,
        identity.recoveryVersion, identity.generation,
        identity.admissionProvenance || 'qa'
      ).run();
      if (changes(result) !== 1) return { status: 'invalid' };
      return {
        status: 'prepared', recoveryVersion: Number(identity.recoveryVersion),
        expiresAt, alreadyPrepared: false
      };
    } catch (error) {
      const raced = await resolveRecoveryRotationPrepare(identity, input);
      if (raced) return raced;
      throw error;
    }
  }

  async function commitRecoveryRotation(identity, input) {
    const rotation = await db.prepare(`
      SELECT r.claim_id, r.claim_verifier, r.account_id,
             r.requested_by_account_device_id, r.expected_recovery_version,
             r.expected_account_generation, r.next_recovery_verifier,
             r.expires_at, r.committed_at, r.cancelled_at,
             r.commit_operation_id, r.commit_fingerprint,
             a.state, a.recovery_version, a.recovery_verifier,
             a.generation, a.admission_provenance, d.revoked_at
      FROM sync_account_recovery_rotations r
      JOIN sync_accounts a ON a.id = r.account_id
      JOIN sync_account_devices d ON d.id = r.requested_by_account_device_id
      WHERE r.claim_id = ?
    `).bind(input.claimId).first();
    if (!rotation || rotation.account_id !== identity.accountId ||
        rotation.requested_by_account_device_id !== identity.accountDeviceId ||
        rotation.admission_provenance !== (identity.admissionProvenance || 'qa') ||
        !timingSafeHexEqual(rotation.claim_verifier || '', input.claimVerifier)) {
      return { status: 'invalid' };
    }
    const nextVersion = Number(rotation.expected_recovery_version) + 1;
    if (rotation.committed_at != null) {
      return rotation.commit_operation_id === input.operationId &&
        rotation.commit_fingerprint === input.requestFingerprint &&
        rotation.state === 'active' && rotation.revoked_at == null &&
        Number(rotation.recovery_version) === nextVersion &&
        timingSafeHexEqual(rotation.recovery_verifier || '', rotation.next_recovery_verifier)
        ? { status: 'rotated', recoveryVersion: nextVersion, alreadyRotated: true }
        : { status: 'conflict' };
    }
    if (rotation.commit_operation_id != null || rotation.cancelled_at != null ||
        Number(rotation.expires_at) <= input.now || rotation.state !== 'active' ||
        rotation.revoked_at != null ||
        Number(rotation.recovery_version) !== Number(rotation.expected_recovery_version) ||
        Number(rotation.generation) !== Number(rotation.expected_account_generation)) {
      return { status: 'invalid' };
    }
    const rotate = db.prepare(`
      UPDATE sync_accounts SET recovery_version = ?, recovery_verifier = ?,
        recovery_rotated_at = ?, updated_at = ?
      WHERE id = ? AND state = 'active' AND deleted_at IS NULL
        AND recovery_version = ? AND generation = ? AND admission_provenance = ?
        AND EXISTS (SELECT 1 FROM sync_account_devices d
          WHERE d.id = ? AND d.account_id = sync_accounts.id AND d.revoked_at IS NULL)
        AND EXISTS (SELECT 1 FROM sync_account_recovery_rotations r
          WHERE r.claim_id = ? AND r.claim_verifier = ?
            AND r.committed_at IS NULL AND r.cancelled_at IS NULL AND r.expires_at > ?)
    `).bind(
      nextVersion, rotation.next_recovery_verifier, input.now, input.now,
      identity.accountId, rotation.expected_recovery_version,
      rotation.expected_account_generation, identity.admissionProvenance || 'qa',
      identity.accountDeviceId, rotation.claim_id, input.claimVerifier, input.now
    );
    const accountGuard = db.prepare(`
      UPDATE sync_accounts SET updated_at = CASE WHEN changes() = 1
        THEN updated_at ELSE created_at - 1 END
      WHERE id = ?
    `).bind(identity.accountId);
    const finish = db.prepare(`
      UPDATE sync_account_recovery_rotations
      SET committed_at = ?, commit_operation_id = ?, commit_fingerprint = ?
      WHERE claim_id = ? AND claim_verifier = ?
        AND committed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, input.operationId, input.requestFingerprint,
      rotation.claim_id, input.claimVerifier);
    const cancelRotations = db.prepare(`
      UPDATE sync_account_recovery_rotations
      SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE account_id = ? AND claim_id <> ?
        AND committed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, identity.accountId, rotation.claim_id);
    const cancelRecoveries = db.prepare(`
      UPDATE sync_account_recovery_claims
      SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE account_id = ? AND committed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, identity.accountId);
    try {
      const results = await db.batch([
        rotate, accountGuard, finish, cancelRotations, cancelRecoveries
      ]);
      if (!batchSucceeded(results, 5) || changes(results[0]) !== 1 ||
          changes(results[1]) !== 1 || changes(results[2]) !== 1) {
        throw new Error('D1 Account Recovery rotation compare-and-swap failed');
      }
      return { status: 'rotated', recoveryVersion: nextVersion, alreadyRotated: false };
    } catch (error) {
      const raced = await db.prepare(`
        SELECT r.commit_operation_id, r.commit_fingerprint, r.committed_at,
               a.state, a.recovery_version, a.recovery_verifier, d.revoked_at
        FROM sync_account_recovery_rotations r
        JOIN sync_accounts a ON a.id = r.account_id
        JOIN sync_account_devices d ON d.id = r.requested_by_account_device_id
        WHERE r.claim_id = ? AND r.account_id = ?
          AND r.requested_by_account_device_id = ?
      `).bind(rotation.claim_id, identity.accountId, identity.accountDeviceId).first();
      if (raced?.commit_operation_id === input.operationId &&
          raced?.commit_fingerprint === input.requestFingerprint &&
          raced?.committed_at != null && raced.state === 'active' &&
          raced.revoked_at == null && Number(raced.recovery_version) === nextVersion &&
          timingSafeHexEqual(raced.recovery_verifier || '', rotation.next_recovery_verifier)) {
        return { status: 'rotated', recoveryVersion: nextVersion, alreadyRotated: true };
      }
      const current = await db.prepare(`
        SELECT state, recovery_version, generation FROM sync_accounts WHERE id = ?
      `).bind(identity.accountId).first();
      if (!current || current.state !== 'active' ||
          Number(current.recovery_version) !== Number(rotation.expected_recovery_version) ||
          Number(current.generation) !== Number(rotation.expected_account_generation)) {
        return { status: 'invalid' };
      }
      throw error;
    }
  }

  async function listEnvironments(identity) {
    const rows = await db.prepare(`
      SELECT d.id, d.label, d.user_label, d.credential_version, d.created_at, d.last_seen_at, d.revoked_at,
             CASE WHEN SUM(CASE WHEN m.app_id <> 'port' THEN 1 ELSE 0 END) = 0
               THEN 1 ELSE 0 END AS is_port_environment,
             GROUP_CONCAT(DISTINCT CASE WHEN m.app_id <> 'port' THEN m.app_id END) AS related_apps
      FROM sync_account_devices d
      LEFT JOIN sync_membership_device_links l ON l.account_device_id = d.id
      LEFT JOIN sync_account_memberships m ON m.id = l.membership_id
      WHERE d.account_id = ?
      GROUP BY d.id, d.label, d.user_label, d.credential_version, d.created_at, d.last_seen_at, d.revoked_at
      ORDER BY d.created_at ASC, d.id ASC
    `).bind(identity.accountId).all();
    return (rows?.results || []).map((row) => ({
      id: row.id,
      label: row.label,
      userLabel: row.user_label ?? null,
      credentialVersion: Number(row.credential_version),
      createdAt: Number(row.created_at),
      lastSeenAt: Number(row.last_seen_at),
      revokedAt: row.revoked_at == null ? null : Number(row.revoked_at),
      isCurrent: row.id === identity.accountDeviceId,
      isPortEnvironment: Number(row.is_port_environment) === 1,
      relatedApps: row.related_apps ? String(row.related_apps).split(',').sort() : []
    }));
  }

  // Active app devices also carry the latest safety report that device made for this same
  // Account, membership, and app (lastReport: null when it has never reported). The report is
  // only what the app last said; the time it was made is reportedAt, never lastSeenAt.
  async function listAppEnvironments(identity) {
    const rows = await db.prepare(`
      SELECT ad.id, ad.app_id, ad.label, ad.user_label, ad.created_at, ad.last_seen_at, ad.revoked_at,
             l.account_device_id,
             s.state AS report_state, s.reported_at AS report_reported_at,
             s.attention_count AS report_attention_count
      FROM sync_membership_device_links l
      JOIN sync_account_memberships m
        ON m.id = l.membership_id AND m.account_id = l.account_id
      JOIN sync_devices ad ON ad.id = l.app_device_id
      LEFT JOIN sync_app_device_sync_safety s
        ON s.app_device_id = ad.id AND s.account_id = l.account_id
          AND s.membership_id = l.membership_id AND s.app_id = m.app_id
          AND ad.revoked_at IS NULL
      WHERE l.account_id = ? AND m.app_id <> 'port'
      ORDER BY CASE m.app_id WHEN 'pitch' THEN 1 WHEN 'fretboard' THEN 2
        WHEN 'rhythm' THEN 3 WHEN 'chord' THEN 4 ELSE 5 END,
        ad.created_at ASC, ad.id ASC
    `).bind(identity.accountId).all();
    return (rows?.results || []).map((row) => {
      const device = {
        id: row.id,
        appId: row.app_id,
        label: row.label,
        userLabel: row.user_label ?? null,
        createdAt: Number(row.created_at),
        lastSeenAt: Number(row.last_seen_at),
        revokedAt: row.revoked_at == null ? null : Number(row.revoked_at),
        isCurrent: row.account_device_id === identity.accountDeviceId
      };
      if (device.revokedAt != null) return device;
      device.lastReport = row.report_state == null ? null : {
        state: row.report_state,
        reportedAt: Number(row.report_reported_at),
        attentionCount: Number(row.report_attention_count || 0)
      };
      return device;
    });
  }

  // Display name only. These writes touch user_label and nothing else: no identity, credential,
  // membership, dataset, report, generation or revoke state changes, so last write wins.
  // Revoked targets are history and stay read-only; another Account's target is not found.
  async function renameEnvironment(identity, input) {
    const result = await db.prepare(`
      UPDATE sync_account_devices SET user_label = ?
      WHERE id = ? AND account_id = ? AND revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM sync_accounts a WHERE a.id = sync_account_devices.account_id
          AND a.state = 'active' AND a.deleted_at IS NULL)
    `).bind(input.userLabel, input.accountDeviceId, identity.accountId).run();
    if (changes(result) === 1) return { status: 'renamed', accountDeviceId: input.accountDeviceId, userLabel: input.userLabel };
    const target = await db.prepare(`
      SELECT revoked_at FROM sync_account_devices WHERE id = ? AND account_id = ?
    `).bind(input.accountDeviceId, identity.accountId).first();
    return { status: target ? 'unavailable' : 'not_found' };
  }

  async function renameAppEnvironment(identity, input) {
    const result = await db.prepare(`
      UPDATE sync_devices SET user_label = ?
      WHERE id = ? AND app_id = ? AND revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM sync_membership_device_links l
          JOIN sync_account_memberships m ON m.id = l.membership_id AND m.account_id = l.account_id
          JOIN sync_accounts a ON a.id = l.account_id
          WHERE l.account_id = ? AND l.app_device_id = sync_devices.id AND m.app_id = ?
            AND m.state = 'active' AND a.state = 'active' AND a.deleted_at IS NULL)
    `).bind(input.userLabel, input.appDeviceId, input.appId, identity.accountId, input.appId).run();
    if (changes(result) === 1) {
      return { status: 'renamed', appId: input.appId, appDeviceId: input.appDeviceId, userLabel: input.userLabel };
    }
    const target = await db.prepare(`
      SELECT ad.revoked_at FROM sync_membership_device_links l
      JOIN sync_account_memberships m ON m.id = l.membership_id AND m.account_id = l.account_id
      JOIN sync_devices ad ON ad.id = l.app_device_id
      WHERE l.account_id = ? AND m.app_id = ? AND ad.id = ?
    `).bind(identity.accountId, input.appId, input.appDeviceId).first();
    return { status: target ? 'unavailable' : 'not_found' };
  }

  async function revokeEnvironment(identity, input) {
    const previous = await operation(input.operationId);
    if (previous) {
      if (previous.admission_provenance !== (identity.admissionProvenance || 'qa') ||
          previous.request_fingerprint !== input.requestFingerprint || previous.kind !== 'device_revoke') {
        return { status: 'conflict' };
      }
      return { status: 'revoked', ...lifecycleResult(previous), alreadyRevoked: true };
    }
    const target = await db.prepare(`
      SELECT id, revoked_at FROM sync_account_devices WHERE id = ? AND account_id = ?
    `).bind(input.targetDeviceId, identity.accountId).first();
    if (!target) return { status: 'not_found' };
    const resultBody = { accountDeviceId: input.targetDeviceId,
      isCurrent: input.targetDeviceId === identity.accountDeviceId };
    const revoke = db.prepare(`
      UPDATE sync_account_devices SET revoked_at = COALESCE(revoked_at, ?)
      WHERE id = ? AND account_id = ?
    `).bind(input.now, input.targetDeviceId, identity.accountId);
    const revokeApps = db.prepare(`
      UPDATE sync_devices SET revoked_at = COALESCE(revoked_at, ?)
      WHERE id IN (SELECT app_device_id FROM sync_membership_device_links
        WHERE account_id = ? AND account_device_id = ?)
    `).bind(input.now, identity.accountId, input.targetDeviceId);
    const cancelHandoffs = db.prepare(`
      UPDATE sync_membership_handoffs SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE account_id = ? AND created_by_account_device_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, identity.accountId, input.targetDeviceId);
    const cancelJoins = db.prepare(`
      UPDATE sync_app_join_invitations SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE account_id = ? AND created_by_account_device_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, identity.accountId, input.targetDeviceId);
    const cancelPortJoins = db.prepare(`
      UPDATE sync_port_join_invitations SET cancelled_at = COALESCE(cancelled_at, ?),
        cancelled_by_account_device_id = COALESCE(cancelled_by_account_device_id, ?)
      WHERE account_id = ? AND created_by_account_device_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, identity.accountDeviceId, identity.accountId, input.targetDeviceId);
    const record = db.prepare(`
      INSERT INTO sync_account_lifecycle_operations (
        operation_id, request_fingerprint, account_id, kind, target_id, result_json, created_at
      ) VALUES (?, ?, ?, 'device_revoke', ?, ?, ?)
    `).bind(input.operationId, input.requestFingerprint, identity.accountId,
      input.targetDeviceId, JSON.stringify(resultBody), input.now);
    const results = await db.batch([revoke, revokeApps, cancelHandoffs, cancelJoins, cancelPortJoins, record]);
    if (!batchSucceeded(results, 6) || changes(results[0]) !== 1 || changes(results[5]) !== 1) {
      throw new Error('D1 Account environment revoke failed');
    }
    return { status: 'revoked', ...resultBody, alreadyRevoked: target.revoked_at != null };
  }

  async function resolveRevokeAfterCredentialLoss(input) {
    const row = await db.prepare(`
      SELECT o.request_fingerprint, o.kind, o.result_json
      FROM sync_account_lifecycle_operations o
      JOIN sync_account_devices d
        ON d.account_id = o.account_id AND d.id = o.target_id
      JOIN sync_accounts a ON a.id = o.account_id
      WHERE o.operation_id = ? AND o.kind = 'device_revoke'
        AND o.target_id = ? AND d.credential_verifier = ? AND d.revoked_at IS NOT NULL
        AND a.admission_provenance = ?
    `).bind(input.operationId, input.targetDeviceId, input.accountCredentialVerifier,
      input.admissionProvenance).first();
    if (!row || (input.requestFingerprint != null &&
        row.request_fingerprint !== input.requestFingerprint)) return { status: 'invalid' };
    return { status: 'revoked', ...lifecycleResult(row), alreadyRevoked: true };
  }

  async function resolveCurrentEnvironmentDetachRetry(identity, input) {
    const previous = await operation(input.operationId);
    if (!previous) return null;
    const result = lifecycleResult(previous);
    if (previous.admission_provenance !== (identity.admissionProvenance || 'qa') ||
        previous.request_fingerprint !== input.requestFingerprint ||
        previous.kind !== 'device_revoke' || result?.scope !== 'current_environment' ||
        result?.accountDeviceId !== identity.accountDeviceId) return { status: 'conflict' };
    return { status: 'detached', ...result, alreadyDetached: true };
  }

  async function resolveCurrentEnvironmentDetachAfterCredentialLoss(input) {
    const row = await db.prepare(`
      SELECT o.request_fingerprint, o.kind, o.result_json
      FROM sync_account_lifecycle_operations o
      JOIN sync_account_devices d ON d.account_id = o.account_id AND d.id = o.target_id
      JOIN sync_accounts a ON a.id = o.account_id
      WHERE o.operation_id = ? AND o.kind = 'device_revoke' AND o.target_id = ?
        AND d.credential_verifier = ? AND d.revoked_at IS NOT NULL
        AND a.admission_provenance = ?
    `).bind(input.operationId, input.accountDeviceId, input.accountCredentialVerifier,
      input.admissionProvenance).first();
    const result = lifecycleResult(row);
    if (!row || result?.scope !== 'current_environment') return { status: 'invalid' };
    return { status: 'detached', ...result, alreadyDetached: true };
  }

  async function detachCurrentEnvironment(identity, input) {
    const retry = await resolveCurrentEnvironmentDetachRetry(identity, input);
    if (retry) return retry;

    // A Port environment may have its hidden Port App Device link, but never a
    // visible app link. App environments always create a non-Port membership
    // device link as part of consuming an app invitation.
    const target = await db.prepare(`
      SELECT d.id, d.revoked_at,
             (SELECT COUNT(*) FROM sync_account_devices p
                WHERE p.account_id = d.account_id AND p.revoked_at IS NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM sync_membership_device_links l
                    JOIN sync_account_memberships m ON m.id = l.membership_id
                      AND m.account_id = l.account_id
                    WHERE l.account_id = p.account_id AND l.account_device_id = p.id
                      AND m.app_id <> 'port'
                  ))
               AS active_port_count,
             (SELECT COUNT(DISTINCT h.claimed_by_account_device_id)
                FROM sync_app_join_invitations h
                JOIN sync_account_devices child ON child.id = h.claimed_by_account_device_id
                  AND child.account_id = h.account_id AND child.revoked_at IS NULL
                WHERE h.account_id = d.account_id
                  AND h.created_by_account_device_id = d.id
                  AND h.consumed_at IS NOT NULL
                  AND h.claimed_by_account_device_id IS NOT NULL) AS linked_account_device_count,
             (SELECT COUNT(DISTINCT h.claimed_by_app_device_id)
                FROM sync_app_join_invitations h
                JOIN sync_devices child ON child.id = h.claimed_by_app_device_id
                  AND child.revoked_at IS NULL
                WHERE h.account_id = d.account_id
                  AND h.created_by_account_device_id = d.id
                  AND h.consumed_at IS NOT NULL
                  AND h.claimed_by_app_device_id IS NOT NULL) AS linked_app_device_count
             ,(SELECT COUNT(DISTINCT l.app_device_id)
                FROM sync_membership_device_links l
                JOIN sync_account_memberships m ON m.id = l.membership_id
                  AND m.account_id = l.account_id AND m.app_id = 'port'
                JOIN sync_devices pd ON pd.id = l.app_device_id AND pd.revoked_at IS NULL
                WHERE l.account_id = d.account_id AND l.account_device_id = d.id)
               AS port_app_device_count
      FROM sync_account_devices d
      JOIN sync_accounts a ON a.id = d.account_id
      WHERE d.id = ? AND d.account_id = ? AND d.revoked_at IS NULL
        AND a.state = 'active' AND a.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM sync_membership_device_links l
          JOIN sync_account_memberships m ON m.id = l.membership_id
            AND m.account_id = l.account_id
          WHERE l.account_id = d.account_id AND l.account_device_id = d.id
            AND m.app_id <> 'port'
        )
    `).bind(identity.accountDeviceId, identity.accountId).first();
    if (!target) return { status: 'invalid' };

    const resultBody = {
      scope: 'current_environment', accountDeviceId: identity.accountDeviceId,
      revokedAccountDeviceCount: 1 + Number(target.linked_account_device_count || 0),
      revokedAppDeviceCount: Number(target.linked_app_device_count || 0) +
        Number(target.port_app_device_count || 0),
      isLastPort: Number(target.active_port_count || 0) === 1
    };
    const revokePort = db.prepare(`
      UPDATE sync_account_devices SET revoked_at = ?
      WHERE id = ? AND account_id = ? AND revoked_at IS NULL
    `).bind(input.now, identity.accountDeviceId, identity.accountId);
    const revokeLinkedAccountDevices = db.prepare(`
      UPDATE sync_account_devices SET revoked_at = COALESCE(revoked_at, ?)
      WHERE account_id = ? AND id IN (
        SELECT DISTINCT h.claimed_by_account_device_id
        FROM sync_app_join_invitations h
        WHERE h.account_id = ? AND h.created_by_account_device_id = ?
          AND h.consumed_at IS NOT NULL AND h.claimed_by_account_device_id IS NOT NULL
      )
    `).bind(input.now, identity.accountId, identity.accountId, identity.accountDeviceId);
    const revokeLinkedAppDevices = db.prepare(`
      UPDATE sync_devices SET revoked_at = COALESCE(revoked_at, ?)
      WHERE id IN (
        SELECT l.app_device_id
        FROM sync_membership_device_links l
        JOIN sync_account_memberships m ON m.id = l.membership_id
          AND m.account_id = l.account_id AND m.app_id = 'port'
        WHERE l.account_id = ? AND l.account_device_id = ?
        UNION
        SELECT DISTINCT h.claimed_by_app_device_id
        FROM sync_app_join_invitations h
        WHERE h.account_id = ? AND h.created_by_account_device_id = ?
          AND h.consumed_at IS NOT NULL AND h.claimed_by_app_device_id IS NOT NULL
      )
    `).bind(input.now, identity.accountId, identity.accountDeviceId,
      identity.accountId, identity.accountDeviceId);
    const revokeLinkedQaSessions = db.prepare(`
      UPDATE sync_account_qa_sessions SET revoked_at = COALESCE(revoked_at, ?)
      WHERE account_id = ? AND scope = 'app' AND revoked_at IS NULL
        AND app_device_id IN (
          SELECT DISTINCT h.claimed_by_app_device_id
          FROM sync_app_join_invitations h
          WHERE h.account_id = ? AND h.created_by_account_device_id = ?
            AND h.consumed_at IS NOT NULL AND h.claimed_by_app_device_id IS NOT NULL
        )
    `).bind(input.now, identity.accountId, identity.accountId, identity.accountDeviceId);
    const cancelAppJoins = db.prepare(`
      UPDATE sync_app_join_invitations SET cancelled_at = COALESCE(cancelled_at, ?),
        cancelled_by_account_device_id = COALESCE(cancelled_by_account_device_id, ?)
      WHERE account_id = ? AND created_by_account_device_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, identity.accountDeviceId, identity.accountId, identity.accountDeviceId);
    const cancelPortJoins = db.prepare(`
      UPDATE sync_port_join_invitations SET cancelled_at = COALESCE(cancelled_at, ?),
        cancelled_by_account_device_id = COALESCE(cancelled_by_account_device_id, ?)
      WHERE account_id = ? AND created_by_account_device_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, identity.accountDeviceId, identity.accountId, identity.accountDeviceId);
    const cancelHandoffs = db.prepare(`
      UPDATE sync_membership_handoffs SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE account_id = ? AND created_by_account_device_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, identity.accountId, identity.accountDeviceId);
    const record = db.prepare(`
      INSERT INTO sync_account_lifecycle_operations (
        operation_id, request_fingerprint, account_id, kind, target_id, result_json, created_at
      ) VALUES (?, ?, ?, 'device_revoke', ?, ?, ?)
    `).bind(input.operationId, input.requestFingerprint, identity.accountId,
      identity.accountDeviceId, JSON.stringify(resultBody), input.now);
    const statements = [revokePort, revokeLinkedAccountDevices, revokeLinkedAppDevices,
      revokeLinkedQaSessions, cancelAppJoins, cancelPortJoins, cancelHandoffs, record];
    const results = await db.batch(statements);
    if (!batchSucceeded(results, statements.length) || changes(results[0]) !== 1 ||
        changes(results[7]) !== 1) {
      throw new Error('D1 current Port environment detach failed');
    }
    return { status: 'detached', ...resultBody, alreadyDetached: false };
  }

  async function resolveCurrentAppEnvironmentDetachRetry(identity, input) {
    const previous = await operation(input.operationId);
    if (!previous) return null;
    const result = lifecycleResult(previous);
    if (previous.admission_provenance !== (identity.admissionProvenance || 'qa') ||
        previous.request_fingerprint !== input.requestFingerprint ||
        previous.kind !== 'device_revoke' || result?.scope !== 'current_app_environment' ||
        result?.appDeviceId !== identity.appDeviceId || result?.accountDeviceId !== identity.accountDeviceId) {
      return { status: 'conflict' };
    }
    return { status: 'detached', ...result, alreadyDetached: true };
  }

  async function resolveCurrentAppEnvironmentDetachAfterCredentialLoss(input) {
    const row = await db.prepare(`
      SELECT o.request_fingerprint, o.kind, o.result_json
      FROM sync_account_lifecycle_operations o
      JOIN sync_devices d ON d.id = o.target_id
      JOIN sync_accounts a ON a.id = o.account_id
      WHERE o.operation_id = ? AND o.kind = 'device_revoke' AND o.target_id = ?
        AND d.credential_verifier = ? AND d.revoked_at IS NOT NULL
        AND a.admission_provenance = ?
    `).bind(input.operationId, input.appDeviceId, input.appCredentialVerifier,
      input.admissionProvenance).first();
    const result = lifecycleResult(row);
    if (!row || result?.scope !== 'current_app_environment') return { status: 'invalid' };
    return { status: 'detached', ...result, alreadyDetached: true };
  }

  async function detachCurrentAppEnvironment(identity, input) {
    const retry = await resolveCurrentAppEnvironmentDetachRetry(identity, input);
    if (retry) return retry;

    // An Account app environment consists of exactly one app device and the
    // Account Device linked to it when the invitation was consumed.  Refuse a
    // malformed shared Account Device rather than widening the revoke scope.
    const target = await db.prepare(`
      SELECT l.account_id, l.membership_id, l.app_device_id, l.account_device_id,
             m.app_id, m.state AS membership_state, a.state AS account_state,
             ad.revoked_at AS app_revoked_at, cd.revoked_at AS account_revoked_at,
             (SELECT COUNT(*) FROM sync_membership_device_links x
                WHERE x.account_id = l.account_id AND x.account_device_id = l.account_device_id) AS account_link_count
      FROM sync_membership_device_links l
      JOIN sync_account_memberships m ON m.id = l.membership_id
      JOIN sync_accounts a ON a.id = l.account_id
      JOIN sync_devices ad ON ad.id = l.app_device_id
      JOIN sync_account_devices cd ON cd.id = l.account_device_id AND cd.account_id = l.account_id
      WHERE l.account_id = ? AND l.membership_id = ? AND l.app_device_id = ?
        AND l.account_device_id = ? AND m.app_id = ?
    `).bind(identity.accountId, identity.membershipId, identity.appDeviceId,
      identity.accountDeviceId, identity.appId).first();
    if (!target || target.account_state !== 'active' || target.membership_state !== 'active' ||
        target.app_revoked_at != null || target.account_revoked_at != null ||
        Number(target.account_link_count) !== 1) return { status: 'invalid' };

    const resultBody = {
      scope: 'current_app_environment', appId: identity.appId,
      membershipId: identity.membershipId, appDeviceId: identity.appDeviceId,
      accountDeviceId: identity.accountDeviceId, revokedAppDeviceCount: 1,
      revokedAccountDeviceCount: 1
    };
    const revokeApp = db.prepare(`
      UPDATE sync_devices SET revoked_at = ?
      WHERE id = ? AND app_id = ? AND revoked_at IS NULL
    `).bind(input.now, identity.appDeviceId, identity.appId);
    const revokeAccount = db.prepare(`
      UPDATE sync_account_devices SET revoked_at = ?
      WHERE id = ? AND account_id = ? AND revoked_at IS NULL
    `).bind(input.now, identity.accountDeviceId, identity.accountId);
    const revokeQa = db.prepare(`
      UPDATE sync_account_qa_sessions SET revoked_at = COALESCE(revoked_at, ?)
      WHERE account_id = ? AND scope = 'app' AND app_device_id = ? AND revoked_at IS NULL
    `).bind(input.now, identity.accountId, identity.appDeviceId);
    const record = db.prepare(`
      INSERT INTO sync_account_lifecycle_operations (
        operation_id, request_fingerprint, account_id, kind, target_id, result_json, created_at
      ) VALUES (?, ?, ?, 'device_revoke', ?, ?, ?)
    `).bind(input.operationId, input.requestFingerprint, identity.accountId,
      identity.appDeviceId, JSON.stringify(resultBody), input.now);
    const statements = [revokeApp, revokeAccount, revokeQa, record];
    const results = await db.batch(statements);
    if (!batchSucceeded(results, statements.length) || changes(results[0]) !== 1 ||
        changes(results[1]) !== 1 || changes(results[3]) !== 1) {
      throw new Error('D1 current app environment detach failed');
    }
    return { status: 'detached', ...resultBody, alreadyDetached: false };
  }

  async function resolveAppDetachRetry(identity, input) {
    const previous = await operation(input.operationId);
    if (!previous) return null;
    const result = lifecycleResult(previous);
    if (previous.admission_provenance !== (identity.admissionProvenance || 'qa') ||
        previous.request_fingerprint !== input.requestFingerprint ||
        previous.kind !== 'device_revoke' || result?.scope !== 'app' ||
        result?.appId !== input.appId) {
      return { status: 'conflict' };
    }
    return { status: 'detached', ...result, alreadyDetached: true };
  }

  async function detachApp(identity, input) {
    const retry = await resolveAppDetachRetry(identity, input);
    if (retry) return retry;
    const membership = await db.prepare(`
      SELECT m.id, m.generation, m.state, m.sync_user_id,
             a.generation AS account_generation, a.state AS account_state,
             d.state AS dataset_state,
             (SELECT COUNT(*) FROM sync_membership_device_links l
               JOIN sync_devices ad ON ad.id = l.app_device_id
               WHERE l.membership_id = m.id AND ad.revoked_at IS NULL) AS active_device_count
      FROM sync_account_memberships m
      JOIN sync_accounts a ON a.id = m.account_id
      LEFT JOIN sync_datasets d ON d.user_id = m.sync_user_id AND d.app_id = m.app_id
      WHERE m.account_id = ? AND m.app_id = ?
    `).bind(identity.accountId, input.appId).first();
    if (!membership || membership.account_state !== 'active' || membership.state !== 'active' ||
        !membership.sync_user_id || membership.dataset_state !== 'ready') {
      return { status: 'invalid' };
    }
    if (Number(membership.active_device_count || 0) === 0) {
      return {
        status: 'detached', scope: 'app', appId: input.appId,
        membershipId: membership.id, revokedAppDeviceCount: 0,
        alreadyDetached: true
      };
    }
    const resultBody = {
      scope: 'app', appId: input.appId, membershipId: membership.id,
      revokedAppDeviceCount: Number(membership.active_device_count || 0)
    };
    const accountCas = db.prepare(`
      UPDATE sync_accounts SET generation = generation + 1, updated_at = ?
      WHERE id = ? AND state = 'active' AND deleted_at IS NULL AND generation = ?
        AND EXISTS (SELECT 1 FROM sync_account_devices d
          WHERE d.id = ? AND d.account_id = sync_accounts.id AND d.revoked_at IS NULL)
    `).bind(input.now, identity.accountId, membership.account_generation, identity.accountDeviceId);
    const accountGuard = db.prepare(`
      UPDATE sync_accounts SET updated_at = CASE WHEN changes() = 1
        THEN updated_at ELSE created_at - 1 END WHERE id = ?
    `).bind(identity.accountId);
    const membershipCas = db.prepare(`
      UPDATE sync_account_memberships
      SET generation = generation + 1, updated_at = ?
      WHERE id = ? AND account_id = ? AND app_id = ? AND state = 'active'
        AND sync_user_id = ? AND generation = ?
        AND EXISTS (SELECT 1 FROM sync_datasets d
          WHERE d.user_id = sync_account_memberships.sync_user_id
            AND d.app_id = sync_account_memberships.app_id AND d.state = 'ready')
    `).bind(input.now, membership.id, identity.accountId, input.appId,
      membership.sync_user_id, membership.generation);
    const membershipGuard = db.prepare(`
      UPDATE sync_account_memberships SET updated_at = CASE WHEN changes() = 1
        THEN updated_at ELSE created_at - 1 END
      WHERE id = ? AND account_id = ?
    `).bind(membership.id, identity.accountId);
    const revokeDevices = db.prepare(`
      UPDATE sync_devices SET revoked_at = COALESCE(revoked_at, ?)
      WHERE revoked_at IS NULL AND id IN (
        SELECT app_device_id FROM sync_membership_device_links
        WHERE account_id = ? AND membership_id = ?
      )
    `).bind(input.now, identity.accountId, membership.id);
    const revokeQaSessions = db.prepare(`
      UPDATE sync_account_qa_sessions SET revoked_at = COALESCE(revoked_at, ?)
      WHERE account_id = ? AND scope = 'app' AND app_id = ? AND revoked_at IS NULL
        AND app_device_id IN (SELECT app_device_id FROM sync_membership_device_links
          WHERE account_id = ? AND membership_id = ?)
    `).bind(input.now, identity.accountId, input.appId, identity.accountId, membership.id);
    const cancelJoins = db.prepare(`
      UPDATE sync_app_join_invitations
      SET cancelled_at = COALESCE(cancelled_at, ?),
          cancelled_by_account_device_id = COALESCE(cancelled_by_account_device_id, ?)
      WHERE account_id = ? AND membership_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, identity.accountDeviceId, identity.accountId, membership.id);
    const cancelHandoffs = db.prepare(`
      UPDATE sync_membership_handoffs SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE account_id = ? AND membership_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, identity.accountId, membership.id);
    const record = db.prepare(`
      INSERT INTO sync_account_lifecycle_operations (
        operation_id, request_fingerprint, account_id, kind, target_id, result_json, created_at
      ) VALUES (?, ?, ?, 'device_revoke', ?, ?, ?)
    `).bind(input.operationId, input.requestFingerprint, identity.accountId,
      membership.id, JSON.stringify(resultBody), input.now);
    const statements = [accountCas, accountGuard, membershipCas, membershipGuard,
      revokeDevices, revokeQaSessions, cancelJoins, cancelHandoffs, record];
    try {
      const results = await db.batch(statements);
      if (!batchSucceeded(results, statements.length) || changes(results[0]) !== 1 ||
          changes(results[1]) !== 1 || changes(results[2]) !== 1 ||
          changes(results[3]) !== 1 || changes(results[8]) !== 1 ||
          changes(results[4]) !== resultBody.revokedAppDeviceCount) {
        throw new Error('D1 Account app detach compare-and-swap failed');
      }
      return { status: 'detached', ...resultBody, alreadyDetached: false };
    } catch (error) {
      const raced = await resolveAppDetachRetry(identity, input);
      if (raced?.status === 'detached') return raced;
      const current = await db.prepare(`
        SELECT a.state AS account_state, a.generation AS account_generation,
               m.state AS membership_state, m.generation AS membership_generation
        FROM sync_accounts a LEFT JOIN sync_account_memberships m
          ON m.account_id = a.id AND m.app_id = ? WHERE a.id = ?
      `).bind(input.appId, identity.accountId).first();
      if (!current || current.account_state !== 'active' || current.membership_state !== 'active' ||
          Number(current.account_generation) !== Number(membership.account_generation) ||
          Number(current.membership_generation) !== Number(membership.generation)) {
        return { status: 'invalid' };
      }
      throw error;
    }
  }

  async function revokeAppEnvironment(identity, input) {
    const previous = await operation(input.operationId);
    if (previous) {
      const result = lifecycleResult(previous);
      if (previous.admission_provenance !== (identity.admissionProvenance || 'qa') ||
          previous.request_fingerprint !== input.requestFingerprint ||
          previous.kind !== 'device_revoke' || result?.scope !== 'app_environment' ||
          result?.appId !== input.appId ||
          result?.appDeviceId !== input.appDeviceId) return { status: 'conflict' };
      return { status: 'revoked', ...result, alreadyRevoked: true };
    }
    const target = await db.prepare(`
      SELECT ad.id, ad.revoked_at, m.id AS membership_id, m.state AS membership_state,
             a.state AS account_state, a.generation AS account_generation
      FROM sync_membership_device_links l
      JOIN sync_account_memberships m
        ON m.id = l.membership_id AND m.account_id = l.account_id
      JOIN sync_accounts a ON a.id = l.account_id
      JOIN sync_devices ad ON ad.id = l.app_device_id
      WHERE l.account_id = ? AND m.app_id = ? AND ad.id = ?
    `).bind(identity.accountId, input.appId, input.appDeviceId).first();
    if (!target || target.account_state !== 'active' || target.membership_state !== 'active' ||
        target.revoked_at != null) return { status: 'invalid' };
    const resultBody = { scope: 'app_environment', appId: input.appId,
      appDeviceId: input.appDeviceId };
    const accountCas = db.prepare(`
      UPDATE sync_accounts SET generation = generation + 1, updated_at = ?
      WHERE id = ? AND state = 'active' AND deleted_at IS NULL AND generation = ?
    `).bind(input.now, identity.accountId, target.account_generation);
    const accountGuard = db.prepare(`
      UPDATE sync_accounts SET updated_at = CASE WHEN changes() = 1
        THEN updated_at ELSE created_at - 1 END WHERE id = ?
    `).bind(identity.accountId);
    const revoke = db.prepare(`
      UPDATE sync_devices SET revoked_at = ?
      WHERE id = ? AND app_id = ? AND revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM sync_membership_device_links l
          JOIN sync_account_memberships m ON m.id = l.membership_id
          WHERE l.account_id = ? AND l.app_device_id = sync_devices.id
            AND m.app_id = ? AND m.state = 'active')
    `).bind(input.now, input.appDeviceId, input.appId, identity.accountId, input.appId);
    const revokeGuard = db.prepare(`
      UPDATE sync_accounts SET updated_at = CASE WHEN changes() = 1
        THEN updated_at ELSE created_at - 1 END WHERE id = ?
    `).bind(identity.accountId);
    const revokeQa = db.prepare(`
      UPDATE sync_account_qa_sessions SET revoked_at = COALESCE(revoked_at, ?)
      WHERE account_id = ? AND scope = 'app' AND app_id = ? AND app_device_id = ?
    `).bind(input.now, identity.accountId, input.appId, input.appDeviceId);
    const record = db.prepare(`
      INSERT INTO sync_account_lifecycle_operations (
        operation_id, request_fingerprint, account_id, kind, target_id, result_json, created_at
      ) VALUES (?, ?, ?, 'device_revoke', ?, ?, ?)
    `).bind(input.operationId, input.requestFingerprint, identity.accountId,
      input.appDeviceId, JSON.stringify(resultBody), input.now);
    const statements = [accountCas, accountGuard, revoke, revokeGuard, revokeQa, record];
    try {
      const results = await db.batch(statements);
      if (!batchSucceeded(results, statements.length) || changes(results[0]) !== 1 ||
          changes(results[1]) !== 1 || changes(results[2]) !== 1 ||
          changes(results[3]) !== 1 || changes(results[5]) !== 1) {
        throw new Error('D1 app environment revoke compare-and-swap failed');
      }
      return { status: 'revoked', ...resultBody, alreadyRevoked: false };
    } catch (error) {
      const raced = await operation(input.operationId);
      const result = lifecycleResult(raced);
      if (raced?.admission_provenance === (identity.admissionProvenance || 'qa') &&
          raced?.request_fingerprint === input.requestFingerprint &&
          raced?.kind === 'device_revoke' && result?.scope === 'app_environment' &&
          result?.appDeviceId === input.appDeviceId) {
        return { status: 'revoked', ...result, alreadyRevoked: true };
      }
      const current = await db.prepare(`
        SELECT a.state AS account_state, a.generation AS account_generation,
               m.state AS membership_state, ad.revoked_at
        FROM sync_membership_device_links l
        JOIN sync_account_memberships m ON m.id = l.membership_id
        JOIN sync_accounts a ON a.id = l.account_id
        JOIN sync_devices ad ON ad.id = l.app_device_id
        WHERE l.account_id = ? AND m.app_id = ? AND ad.id = ?
      `).bind(identity.accountId, input.appId, input.appDeviceId).first();
      if (!current || current.account_state !== 'active' ||
          current.membership_state !== 'active' || current.revoked_at != null ||
          Number(current.account_generation) !== Number(target.account_generation)) {
        return { status: 'invalid' };
      }
      throw error;
    }
  }

  async function cancelAppDelete(identity, input) {
    const previous = await operation(input.operationId);
    if (previous) {
      const result = lifecycleResult(previous);
      if (previous.admission_provenance !== (identity.admissionProvenance || 'qa') ||
          previous.request_fingerprint !== input.requestFingerprint ||
          previous.kind !== 'app_delete' || result?.action !== 'cancel' ||
          result?.appId !== input.appId) {
        return { status: 'conflict' };
      }
      return { status: 'active', ...result, alreadyCancelled: true };
    }
    const target = await db.prepare(`
      SELECT m.id, m.sync_user_id, m.generation AS membership_generation,
             m.purge_after AS membership_purge_after,
             u.state AS user_state, u.purge_after AS user_purge_after,
             d.state AS dataset_state,
             a.state AS account_state, a.generation AS account_generation
      FROM sync_account_memberships m
      JOIN sync_accounts a ON a.id = m.account_id
      JOIN sync_users u ON u.id = m.sync_user_id
      JOIN sync_datasets d ON d.user_id = m.sync_user_id AND d.app_id = m.app_id
      WHERE m.account_id = ? AND m.app_id = ? AND m.state = 'deleting'
    `).bind(identity.accountId, input.appId).first();
    if (!target || target.account_state !== 'active' || target.user_state !== 'deleting' ||
        target.dataset_state !== 'ready' || target.membership_purge_after == null ||
        target.user_purge_after == null || Number(target.membership_purge_after) <= input.now ||
        Number(target.user_purge_after) <= input.now) return { status: 'invalid' };
    const resultBody = { action: 'cancel', scope: 'app', appId: input.appId,
      membershipId: target.id, syncUserId: target.sync_user_id };
    const accountCas = db.prepare(`
      UPDATE sync_accounts SET generation = generation + 1, updated_at = ?
      WHERE id = ? AND state = 'active' AND deleted_at IS NULL AND generation = ?
    `).bind(input.now, identity.accountId, target.account_generation);
    const accountGuard = db.prepare(`
      UPDATE sync_accounts SET updated_at = CASE WHEN changes() = 1
        THEN updated_at ELSE created_at - 1 END WHERE id = ?
    `).bind(identity.accountId);
    const membershipCas = db.prepare(`
      UPDATE sync_account_memberships
      SET state = 'active', delete_requested_at = NULL, purge_after = NULL,
          deleted_at = NULL, updated_at = ?, generation = generation + 1
      WHERE id = ? AND account_id = ? AND app_id = ? AND state = 'deleting'
        AND generation = ? AND purge_after > ?
    `).bind(input.now, target.id, identity.accountId, input.appId,
      target.membership_generation, input.now);
    const membershipGuard = db.prepare(`
      UPDATE sync_accounts SET updated_at = CASE WHEN changes() = 1
        THEN updated_at ELSE created_at - 1 END WHERE id = ?
    `).bind(identity.accountId);
    const userCas = db.prepare(`
      UPDATE sync_users
      SET state = 'active', delete_requested_at = NULL, purge_after = NULL,
          deleted_at = NULL, updated_at = ?
      WHERE id = ? AND state = 'deleting' AND purge_after > ?
    `).bind(input.now, target.sync_user_id, input.now);
    const userGuard = db.prepare(`
      UPDATE sync_accounts SET updated_at = CASE WHEN changes() = 1
        THEN updated_at ELSE created_at - 1 END WHERE id = ?
    `).bind(identity.accountId);
    const record = db.prepare(`
      INSERT INTO sync_account_lifecycle_operations (
        operation_id, request_fingerprint, account_id, kind, target_id, result_json, created_at
      ) VALUES (?, ?, ?, 'app_delete', ?, ?, ?)
    `).bind(input.operationId, input.requestFingerprint, identity.accountId,
      target.id, JSON.stringify(resultBody), input.now);
    const statements = [accountCas, accountGuard, membershipCas, membershipGuard,
      userCas, userGuard, record];
    try {
      const results = await db.batch(statements);
      if (!batchSucceeded(results, statements.length) ||
          [0, 1, 2, 3, 4, 5, 6].some((index) => changes(results[index]) !== 1)) {
        throw new Error('D1 app delete cancellation compare-and-swap failed');
      }
      return { status: 'active', ...resultBody, alreadyCancelled: false };
    } catch (error) {
      const raced = await operation(input.operationId);
      const result = lifecycleResult(raced);
      if (raced?.admission_provenance === (identity.admissionProvenance || 'qa') &&
          raced?.request_fingerprint === input.requestFingerprint &&
          raced?.kind === 'app_delete' && result?.action === 'cancel' &&
          result?.appId === input.appId) {
        return { status: 'active', ...result, alreadyCancelled: true };
      }
      const current = await db.prepare(`
        SELECT a.state AS account_state, a.generation AS account_generation,
               m.state AS membership_state, m.generation AS membership_generation,
               m.purge_after AS membership_purge_after,
               u.state AS user_state, u.purge_after AS user_purge_after,
               d.state AS dataset_state
        FROM sync_account_memberships m
        JOIN sync_accounts a ON a.id = m.account_id
        JOIN sync_users u ON u.id = m.sync_user_id
        JOIN sync_datasets d ON d.user_id = m.sync_user_id AND d.app_id = m.app_id
        WHERE m.account_id = ? AND m.app_id = ?
      `).bind(identity.accountId, input.appId).first();
      const unchanged = current?.account_state === 'active' &&
        Number(current.account_generation) === Number(target.account_generation) &&
        current.membership_state === 'deleting' &&
        Number(current.membership_generation) === Number(target.membership_generation) &&
        current.user_state === 'deleting' && current.dataset_state === 'ready' &&
        Number(current.membership_purge_after) > input.now &&
        Number(current.user_purge_after) > input.now;
      if (unchanged) throw error;
      return { status: 'invalid' };
    }
  }

  async function issueDeleteIntent(identity, input) {
    const existing = await db.prepare(`
      SELECT intent_id, intent_verifier, issue_fingerprint, expires_at, consumed_at, cancelled_at,
             scope, target_membership_id
      FROM sync_account_delete_intents WHERE issue_operation_id = ?
    `).bind(input.operationId).first();
    if (existing) {
      if (existing.issue_fingerprint !== input.requestFingerprint || existing.intent_id !== input.intentId ||
          !timingSafeHexEqual(existing.intent_verifier || '', input.intentVerifier)) return { status: 'conflict' };
      if (existing.cancelled_at != null || Number(existing.expires_at) <= input.now) return { status: 'expired' };
      return { status: 'issued', intentId: existing.intent_id, scope: existing.scope,
        targetMembershipId: existing.target_membership_id, expiresAt: Number(existing.expires_at),
        alreadyIssued: true };
    }
    let membershipId = null;
    if (input.scope === 'app') {
      const membership = await db.prepare(`
        SELECT id FROM sync_account_memberships
        WHERE account_id = ? AND app_id = ? AND state = 'active'
      `).bind(identity.accountId, input.appId).first();
      if (!membership) return { status: 'invalid' };
      membershipId = membership.id;
    }
    const expiresAt = input.now + ACCOUNT_LIFECYCLE.deleteIntentTtlMs;
    const insert = await db.prepare(`
      INSERT INTO sync_account_delete_intents (
        intent_id, intent_verifier, account_id, scope, target_membership_id,
        requested_by_account_device_id, expected_account_generation,
        created_at, expires_at, consumed_at, cancelled_at,
        issue_operation_id, issue_fingerprint, consume_operation_id, consume_fingerprint
      ) SELECT ?, ?, a.id, ?, ?, ?, a.generation, ?, ?, NULL, NULL, ?, ?, NULL, NULL
      FROM sync_accounts a WHERE a.id = ? AND a.state = 'active'
    `).bind(input.intentId, input.intentVerifier, input.scope, membershipId,
      identity.accountDeviceId, input.now, expiresAt, input.operationId,
      input.requestFingerprint, identity.accountId).run();
    if (insert?.success === false) throw new Error('D1 Account delete intent failed');
    return changes(insert) === 1 ? {
      status: 'issued', intentId: input.intentId, scope: input.scope,
      targetMembershipId: membershipId, expiresAt, alreadyIssued: false
    } : { status: 'invalid' };
  }

  async function commitDelete(identity, input) {
    const previous = await operation(input.operationId);
    if (previous) {
      if (previous.admission_provenance !== (identity.admissionProvenance || 'qa') ||
          previous.request_fingerprint !== input.requestFingerprint ||
          previous.kind !== (input.scope === 'account' ? 'account_delete' : 'app_delete')) {
        return { status: 'conflict' };
      }
      return { status: 'deleting', ...lifecycleResult(previous), alreadyDeleting: true };
    }
    const intent = await db.prepare(`
      SELECT intent_id, intent_verifier, account_id, scope, target_membership_id,
             requested_by_account_device_id, expected_account_generation,
             expires_at, consumed_at, cancelled_at,
             (SELECT app_id FROM sync_account_memberships
               WHERE id = sync_account_delete_intents.target_membership_id) AS target_app_id
      FROM sync_account_delete_intents WHERE intent_id = ?
    `).bind(input.intentId).first();
    if (!intent || !timingSafeHexEqual(intent.intent_verifier || '', input.intentVerifier) ||
        intent.account_id !== identity.accountId || intent.scope !== input.scope ||
        intent.requested_by_account_device_id !== identity.accountDeviceId ||
        (input.scope === 'app' && intent.target_app_id !== input.appId)) return { status: 'invalid' };
    if (intent.cancelled_at != null || Number(intent.expires_at) <= input.now) return { status: 'expired' };
    if (intent.consumed_at != null) return { status: 'invalid' };
    const purgeAfter = input.now + ACCOUNT_LIFECYCLE.deleteGraceMs;
    const resultBody = { scope: input.scope, appId: input.appId || null,
      membershipId: intent.target_membership_id, purgeAfter };
    const statements = [];
    if (input.scope === 'app') {
      statements.push(db.prepare(`
        UPDATE sync_account_memberships
        SET state = 'deleting', delete_requested_at = ?, purge_after = ?,
            updated_at = ?, generation = generation + 1
        WHERE id = ? AND account_id = ? AND app_id = ? AND state = 'active'
      `).bind(input.now, purgeAfter, input.now, intent.target_membership_id,
        identity.accountId, input.appId));
      statements.push(db.prepare(`
        UPDATE sync_users SET state = 'deleting', delete_requested_at = ?, purge_after = ?,
          deleted_at = ?, updated_at = ?
        WHERE id = (SELECT sync_user_id FROM sync_account_memberships WHERE id = ?)
          AND state = 'active'
      `).bind(input.now, purgeAfter, input.now, input.now, intent.target_membership_id));
      statements.push(db.prepare(`
        UPDATE sync_devices SET revoked_at = COALESCE(revoked_at, ?)
        WHERE id IN (SELECT app_device_id FROM sync_membership_device_links WHERE membership_id = ?)
      `).bind(input.now, intent.target_membership_id));
      statements.push(db.prepare(`
        UPDATE pairing_codes SET cancelled_at = COALESCE(cancelled_at, ?)
        WHERE user_id = (SELECT sync_user_id FROM sync_account_memberships WHERE id = ?)
          AND consumed_at IS NULL AND cancelled_at IS NULL
      `).bind(input.now, intent.target_membership_id));
      statements.push(db.prepare(`
        UPDATE recovery_claims SET cancelled_at = COALESCE(cancelled_at, ?)
        WHERE user_id = (SELECT sync_user_id FROM sync_account_memberships WHERE id = ?)
          AND committed_at IS NULL AND cancelled_at IS NULL
      `).bind(input.now, intent.target_membership_id));
      statements.push(db.prepare(`
        UPDATE sync_membership_handoffs SET cancelled_at = COALESCE(cancelled_at, ?)
        WHERE membership_id = ? AND consumed_at IS NULL AND cancelled_at IS NULL
      `).bind(input.now, intent.target_membership_id));
      statements.push(db.prepare(`
        UPDATE sync_app_join_invitations SET cancelled_at = COALESCE(cancelled_at, ?)
        WHERE membership_id = ? AND consumed_at IS NULL AND cancelled_at IS NULL
      `).bind(input.now, intent.target_membership_id));
      statements.push(db.prepare(`
        UPDATE sync_accounts SET generation = generation + 1, updated_at = ?
        WHERE id = ? AND state = 'active' AND generation = ?
      `).bind(input.now, identity.accountId, intent.expected_account_generation));
    } else {
      statements.push(db.prepare(`
        UPDATE sync_accounts SET state = 'deleting', delete_requested_at = ?, purge_after = ?,
          updated_at = ?, generation = generation + 1
        WHERE id = ? AND state = 'active' AND generation = ?
      `).bind(input.now, purgeAfter, input.now, identity.accountId, intent.expected_account_generation));
      statements.push(db.prepare(`
        UPDATE sync_account_memberships SET state = 'deleting', delete_requested_at = ?,
          purge_after = ?, updated_at = ?, generation = generation + 1
        WHERE account_id = ? AND state = 'active'
      `).bind(input.now, purgeAfter, input.now, identity.accountId));
      statements.push(db.prepare(`
        UPDATE sync_account_memberships SET state = 'deleted', delete_requested_at = ?,
          purge_after = ?, deleted_at = ?, updated_at = ?, generation = generation + 1
        WHERE account_id = ? AND state = 'pending'
      `).bind(input.now, purgeAfter, input.now, input.now, identity.accountId));
      statements.push(db.prepare(`
        UPDATE sync_users SET state = 'deleting', delete_requested_at = ?, purge_after = ?,
          deleted_at = ?, updated_at = ?
        WHERE id IN (SELECT sync_user_id FROM sync_account_memberships WHERE account_id = ?)
          AND state = 'active'
      `).bind(input.now, purgeAfter, input.now, input.now, identity.accountId));
      statements.push(db.prepare(`UPDATE sync_account_devices SET revoked_at = COALESCE(revoked_at, ?)
        WHERE account_id = ?`).bind(input.now, identity.accountId));
      statements.push(db.prepare(`UPDATE sync_devices SET revoked_at = COALESCE(revoked_at, ?)
        WHERE id IN (SELECT app_device_id FROM sync_membership_device_links WHERE account_id = ?)`)
        .bind(input.now, identity.accountId));
      statements.push(db.prepare(`UPDATE sync_membership_handoffs SET cancelled_at = COALESCE(cancelled_at, ?)
        WHERE account_id = ? AND consumed_at IS NULL AND cancelled_at IS NULL`).bind(input.now, identity.accountId));
      statements.push(db.prepare(`UPDATE sync_app_join_invitations SET cancelled_at = COALESCE(cancelled_at, ?)
        WHERE account_id = ? AND consumed_at IS NULL AND cancelled_at IS NULL`).bind(input.now, identity.accountId));
      statements.push(db.prepare(`UPDATE sync_port_join_invitations SET cancelled_at = COALESCE(cancelled_at, ?),
        cancelled_by_account_device_id = COALESCE(cancelled_by_account_device_id, ?)
        WHERE account_id = ? AND consumed_at IS NULL AND cancelled_at IS NULL`)
        .bind(input.now, identity.accountDeviceId, identity.accountId));
      statements.push(db.prepare(`UPDATE sync_account_recovery_claims SET cancelled_at = COALESCE(cancelled_at, ?)
        WHERE account_id = ? AND committed_at IS NULL AND cancelled_at IS NULL`).bind(input.now, identity.accountId));
      statements.push(db.prepare(`UPDATE pairing_codes SET cancelled_at = COALESCE(cancelled_at, ?)
        WHERE user_id IN (SELECT sync_user_id FROM sync_account_memberships WHERE account_id = ?)
          AND consumed_at IS NULL AND cancelled_at IS NULL`).bind(input.now, identity.accountId));
      statements.push(db.prepare(`UPDATE recovery_claims SET cancelled_at = COALESCE(cancelled_at, ?)
        WHERE user_id IN (SELECT sync_user_id FROM sync_account_memberships WHERE account_id = ?)
          AND committed_at IS NULL AND cancelled_at IS NULL`).bind(input.now, identity.accountId));
    }
    const primaryIndex = 0;
    const accountGenerationIndex = input.scope === 'app' ? statements.length - 1 : primaryIndex;
    // D1 batch is transactional, but a zero-row UPDATE is not itself an SQL
    // error. Place this immediately after the Account generation CAS and use
    // SQLite changes() to turn a lost race into a CHECK violation, rolling the
    // entire batch back instead of leaving a partially deleted membership.
    statements.splice(accountGenerationIndex + 1, 0, db.prepare(`
      UPDATE sync_accounts SET updated_at = CASE WHEN changes() = 1
        THEN updated_at ELSE created_at - 1 END
      WHERE id = ?
    `).bind(identity.accountId));
    const accountGuardIndex = accountGenerationIndex + 1;
    statements.push(db.prepare(`
      UPDATE sync_account_delete_intents SET consumed_at = ?, consume_operation_id = ?,
        consume_fingerprint = ?
      WHERE intent_id = ? AND intent_verifier = ? AND consumed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, input.operationId, input.requestFingerprint,
      intent.intent_id, input.intentVerifier));
    const consumeIndex = statements.length - 1;
    statements.push(db.prepare(`
      INSERT INTO sync_account_lifecycle_operations (
        operation_id, request_fingerprint, account_id, kind, target_id, result_json, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM sync_account_delete_intents WHERE intent_id = ? AND consumed_at = ?
      )
    `).bind(input.operationId, input.requestFingerprint, identity.accountId,
      input.scope === 'account' ? 'account_delete' : 'app_delete',
      intent.target_membership_id, JSON.stringify(resultBody), input.now,
      intent.intent_id, input.now));
    const operationIndex = statements.length - 1;
    try {
      const results = await db.batch(statements);
      if (!batchSucceeded(results, statements.length) || changes(results[primaryIndex]) !== 1 ||
          changes(results[accountGenerationIndex]) !== 1 ||
          changes(results[accountGuardIndex]) !== 1 ||
          changes(results[consumeIndex]) !== 1 || changes(results[operationIndex]) !== 1) {
        throw new Error('D1 Account delete compare-and-swap failed');
      }
      return { status: 'deleting', ...resultBody, alreadyDeleting: false };
    } catch (error) {
      const raced = await operation(input.operationId);
      if (raced?.admission_provenance === (identity.admissionProvenance || 'qa') &&
          raced?.request_fingerprint === input.requestFingerprint) {
        return { status: 'deleting', ...lifecycleResult(raced), alreadyDeleting: true };
      }
      const current = await db.prepare(`SELECT state, generation FROM sync_accounts WHERE id = ?`)
        .bind(identity.accountId).first();
      if (!current || current.state !== 'active' || Number(current.generation) !== Number(intent.expected_account_generation)) {
        return { status: 'invalid' };
      }
      throw error;
    }
  }

  async function resolveDeleteAfterCredentialLoss(input) {
    const row = await db.prepare(`
      SELECT o.request_fingerprint, o.kind, o.result_json
      FROM sync_account_delete_intents i
      JOIN sync_account_lifecycle_operations o ON o.operation_id = i.consume_operation_id
      JOIN sync_account_devices d ON d.id = i.requested_by_account_device_id
      JOIN sync_accounts a ON a.id = i.account_id
      WHERE i.intent_id = ? AND i.intent_verifier = ? AND i.consumed_at IS NOT NULL
        AND d.credential_verifier = ? AND a.admission_provenance = ?
    `).bind(input.intentId, input.intentVerifier, input.accountCredentialVerifier,
      input.admissionProvenance).first();
    if (!row || row.request_fingerprint !== input.requestFingerprint ||
        row.kind !== (input.scope === 'account' ? 'account_delete' : 'app_delete')) return { status: 'invalid' };
    return { status: 'deleting', ...lifecycleResult(row), alreadyDeleting: true };
  }

  return Object.freeze({
    resolveRecoveryPrepare, reserveRecoveryAttempt, prepareRecovery, commitRecovery,
    resolveRecoveryRotationPrepare, prepareRecoveryRotation, commitRecoveryRotation,
    listEnvironments, listAppEnvironments, renameEnvironment, renameAppEnvironment,
    revokeEnvironment, revokeAppEnvironment,
    resolveRevokeAfterCredentialLoss,
    resolveCurrentEnvironmentDetachRetry, resolveCurrentEnvironmentDetachAfterCredentialLoss,
    detachCurrentEnvironment, resolveCurrentAppEnvironmentDetachRetry,
    resolveCurrentAppEnvironmentDetachAfterCredentialLoss, detachCurrentAppEnvironment,
    resolveAppDetachRetry, detachApp, cancelAppDelete, issueDeleteIntent,
    commitDelete, resolveDeleteAfterCredentialLoss, operation
  });
}
