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
        cancelJoins, createDevice, cancelOtherClaims, finish, record];
      const bindIndex = bindQaSession ? statements.push(bindQaSession) - 1 : -1;
      const guardIndex = statements.push(guard) - 1;
      const results = await db.batch(statements);
      if (!batchSucceeded(results, statements.length) || changes(results[0]) !== 1 ||
          changes(results[5]) !== 1 || changes(results[7]) !== 1 ||
          changes(results[8]) !== 1 || (bindIndex >= 0 && changes(results[bindIndex]) !== 1) ||
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

  async function listEnvironments(identity) {
    const rows = await db.prepare(`
      SELECT d.id, d.label, d.credential_version, d.created_at, d.last_seen_at, d.revoked_at,
             GROUP_CONCAT(DISTINCT m.app_id) AS related_apps
      FROM sync_account_devices d
      LEFT JOIN sync_membership_device_links l ON l.account_device_id = d.id
      LEFT JOIN sync_account_memberships m ON m.id = l.membership_id
      WHERE d.account_id = ?
      GROUP BY d.id, d.label, d.credential_version, d.created_at, d.last_seen_at, d.revoked_at
      ORDER BY d.created_at ASC, d.id ASC
    `).bind(identity.accountId).all();
    return (rows?.results || []).map((row) => ({
      id: row.id,
      label: row.label,
      credentialVersion: Number(row.credential_version),
      createdAt: Number(row.created_at),
      lastSeenAt: Number(row.last_seen_at),
      revokedAt: row.revoked_at == null ? null : Number(row.revoked_at),
      isCurrent: row.id === identity.accountDeviceId,
      relatedApps: row.related_apps ? String(row.related_apps).split(',').sort() : []
    }));
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
    const record = db.prepare(`
      INSERT INTO sync_account_lifecycle_operations (
        operation_id, request_fingerprint, account_id, kind, target_id, result_json, created_at
      ) VALUES (?, ?, ?, 'device_revoke', ?, ?, ?)
    `).bind(input.operationId, input.requestFingerprint, identity.accountId,
      input.targetDeviceId, JSON.stringify(resultBody), input.now);
    const results = await db.batch([revoke, revokeApps, cancelHandoffs, cancelJoins, record]);
    if (!batchSucceeded(results, 5) || changes(results[0]) !== 1 || changes(results[4]) !== 1) {
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
    listEnvironments, revokeEnvironment, resolveRevokeAfterCredentialLoss, issueDeleteIntent,
    commitDelete, resolveDeleteAfterCredentialLoss, operation
  });
}
