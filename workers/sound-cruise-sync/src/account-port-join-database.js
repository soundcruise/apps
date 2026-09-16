import { timingSafeHexEqual } from './crypto.js';
import { ACCOUNT_QA } from './account-qa-crypto.js';

export const ACCOUNT_PORT_JOIN_TTL_MS = 5 * 60 * 1000;

function changes(result) {
  return Number(result?.meta?.changes || 0);
}

function batchSucceeded(results, expected) {
  return Array.isArray(results) && results.length === expected &&
    results.every((result) => result?.success !== false && changes(result) === 1);
}

function publicInvitation(row) {
  if (!row) return null;
  return {
    invitationId: row.invitation_id,
    accountId: row.account_id,
    admissionProvenance: row.admission_provenance,
    issuerDeviceId: row.created_by_account_device_id,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    consumedAt: row.consumed_at == null ? null : Number(row.consumed_at),
    cancelledAt: row.cancelled_at == null ? null : Number(row.cancelled_at)
  };
}

export function createD1PortJoinRepository(db) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new Error('D1 Account Port-join session is unavailable');
  }

  async function readById(invitationId) {
    return db.prepare(`
      SELECT h.*, a.state AS account_state, a.recovery_version, a.generation,
             a.admission_provenance AS account_admission_provenance,
             issuer.revoked_at AS issuer_revoked_at,
             claimed.revoked_at AS claimed_revoked_at,
             q.enrollment_id AS qa_enrollment_id, q.scope AS qa_issuer_scope,
             q.account_id AS qa_issuer_account_id, q.expires_at AS qa_issuer_expires_at,
             q.revoked_at AS qa_issuer_revoked_at,
             claimed_q.expires_at AS qa_port_expires_at
      FROM sync_port_join_invitations h
      JOIN sync_accounts a ON a.id = h.account_id
      LEFT JOIN sync_account_devices issuer ON issuer.id = h.created_by_account_device_id
      LEFT JOIN sync_account_devices claimed ON claimed.id = h.claimed_by_account_device_id
      LEFT JOIN sync_account_qa_sessions q ON q.id = h.qa_issuer_session_id
      LEFT JOIN sync_account_qa_sessions claimed_q ON claimed_q.id = h.qa_port_session_id
      WHERE h.invitation_id = ?
    `).bind(invitationId).first();
  }

  async function readByVerifier(codeVerifier) {
    return db.prepare(`
      SELECT h.*, a.state AS account_state, a.recovery_version, a.generation,
             a.admission_provenance AS account_admission_provenance,
             issuer.revoked_at AS issuer_revoked_at,
             claimed.revoked_at AS claimed_revoked_at,
             q.enrollment_id AS qa_enrollment_id, q.scope AS qa_issuer_scope,
             q.account_id AS qa_issuer_account_id, q.expires_at AS qa_issuer_expires_at,
             q.revoked_at AS qa_issuer_revoked_at,
             claimed_q.expires_at AS qa_port_expires_at
      FROM sync_port_join_invitations h
      JOIN sync_accounts a ON a.id = h.account_id
      LEFT JOIN sync_account_devices issuer ON issuer.id = h.created_by_account_device_id
      LEFT JOIN sync_account_devices claimed ON claimed.id = h.claimed_by_account_device_id
      LEFT JOIN sync_account_qa_sessions q ON q.id = h.qa_issuer_session_id
      LEFT JOIN sync_account_qa_sessions claimed_q ON claimed_q.id = h.qa_port_session_id
      WHERE h.code_verifier = ?
    `).bind(codeVerifier).first();
  }

  async function readByIssueOperation(operationId) {
    return db.prepare(`
      SELECT * FROM sync_port_join_invitations WHERE issue_operation_id = ?
    `).bind(operationId).first();
  }

  async function resolveIssueRetry(identity, input) {
    const previous = await readByIssueOperation(input.operationId);
    if (!previous) return null;
    if (previous.account_id !== identity.accountId ||
        previous.created_by_account_device_id !== identity.accountDeviceId ||
        previous.admission_provenance !== input.admissionProvenance ||
        previous.issue_fingerprint !== input.requestFingerprint) {
      return { status: 'operation_conflict' };
    }
    return { status: 'issued', ...publicInvitation(previous), alreadyIssued: true };
  }

  async function resolveConsumeRetry(input) {
    const row = await readByVerifier(input.codeVerifier);
    const storedVerifier = row?.code_verifier || '0'.repeat(64);
    if (!timingSafeHexEqual(input.codeVerifier, storedVerifier) || !row) return null;
    if (row.admission_provenance !== input.admissionProvenance ||
        row.account_admission_provenance !== input.admissionProvenance ||
        row.consumed_at == null || row.consume_operation_id !== input.operationId ||
        row.consume_fingerprint !== input.requestFingerprint ||
        row.claimed_by_account_device_id !== input.accountDeviceId ||
        (row.qa_port_session_id || null) !== (input.qaSessionId || null) ||
        row.claimed_revoked_at != null) return null;
    return {
      status: 'joined',
      accountId: row.account_id,
      accountDeviceId: row.claimed_by_account_device_id,
      recoveryVersion: Number(row.expected_recovery_version),
      qaSessionId: row.qa_port_session_id || null,
      qaExpiresAt: row.qa_port_expires_at == null ? null : Number(row.qa_port_expires_at),
      alreadyJoined: true
    };
  }

  async function issue(identity, input) {
    const retry = await resolveIssueRetry(identity, input);
    if (retry) return retry;

    const issuer = input.admissionProvenance === 'qa'
      ? await db.prepare(`
          SELECT a.id, a.recovery_version, a.generation
          FROM sync_accounts a
          JOIN sync_account_devices d
            ON d.id = ? AND d.account_id = a.id AND d.revoked_at IS NULL
          JOIN sync_account_qa_sessions q
            ON q.id = ? AND q.scope = 'port' AND q.account_id = a.id
            AND q.revoked_at IS NULL AND q.expires_at > ?
          WHERE a.id = ? AND a.state = 'active' AND a.deleted_at IS NULL
            AND a.admission_provenance = 'qa'
        `).bind(identity.accountDeviceId, input.qaIssuerSessionId, input.now,
          identity.accountId).first()
      : await db.prepare(`
          SELECT a.id, a.recovery_version, a.generation
          FROM sync_accounts a
          JOIN sync_account_devices d
            ON d.id = ? AND d.account_id = a.id AND d.revoked_at IS NULL
          WHERE a.id = ? AND a.state = 'active' AND a.deleted_at IS NULL
            AND a.admission_provenance = 'production'
        `).bind(identity.accountDeviceId, identity.accountId).first();
    if (!issuer) return { status: 'issuer_unavailable' };

    await db.prepare(`
      UPDATE sync_port_join_invitations
      SET cancelled_at = ?, cancelled_by_account_device_id = ?
      WHERE account_id = ? AND created_by_account_device_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at <= ?
    `).bind(input.now, identity.accountDeviceId, identity.accountId,
      identity.accountDeviceId, input.now).run();

    const active = await db.prepare(`
      SELECT invitation_id FROM sync_port_join_invitations
      WHERE account_id = ? AND created_by_account_device_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at > ?
      LIMIT 1
    `).bind(identity.accountId, identity.accountDeviceId, input.now).first();
    if (active) return { status: 'invitation_exists' };

    const expiresAt = input.now + ACCOUNT_PORT_JOIN_TTL_MS;
    try {
      const result = await db.prepare(`
        INSERT INTO sync_port_join_invitations (
          invitation_id, code_verifier, account_id, admission_provenance,
          created_by_account_device_id, claimed_by_account_device_id,
          expected_recovery_version, expected_account_generation,
          created_at, expires_at, consumed_at, cancelled_at,
          issue_operation_id, issue_fingerprint, consume_operation_id,
          consume_fingerprint, cancelled_by_account_device_id,
          qa_issuer_session_id, qa_port_session_id
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL, NULL, ?, NULL)
      `).bind(
        input.invitationId, input.codeVerifier, identity.accountId,
        input.admissionProvenance, identity.accountDeviceId,
        Number(issuer.recovery_version), Number(issuer.generation),
        input.now, expiresAt, input.operationId, input.requestFingerprint,
        input.qaIssuerSessionId || null
      ).run();
      if (result?.success === false || changes(result) !== 1) throw new Error('Port Join issue failed');
      return {
        status: 'issued', invitationId: input.invitationId,
        accountId: identity.accountId, issuerDeviceId: identity.accountDeviceId,
        createdAt: input.now, expiresAt, consumedAt: null, cancelledAt: null,
        alreadyIssued: false
      };
    } catch (error) {
      const raced = await readByIssueOperation(input.operationId);
      if (raced && raced.account_id === identity.accountId &&
          raced.created_by_account_device_id === identity.accountDeviceId &&
          raced.issue_fingerprint === input.requestFingerprint) {
        return { status: 'issued', ...publicInvitation(raced), alreadyIssued: true };
      }
      throw error;
    }
  }

  async function status(identity, invitationId) {
    const row = await readById(invitationId);
    if (!row || row.account_id !== identity.accountId ||
        row.created_by_account_device_id !== identity.accountDeviceId) return { status: 'not_found' };
    return { status: 'found', invitation: publicInvitation(row) };
  }

  async function cancel(identity, invitationId, now) {
    const row = await readById(invitationId);
    if (!row || row.account_id !== identity.accountId ||
        row.created_by_account_device_id !== identity.accountDeviceId) return { status: 'not_found' };
    if (row.consumed_at != null) return { status: 'used' };
    if (row.cancelled_at != null) return { status: 'cancelled', alreadyCancelled: true };
    const result = await db.prepare(`
      UPDATE sync_port_join_invitations
      SET cancelled_at = ?, cancelled_by_account_device_id = ?
      WHERE invitation_id = ? AND account_id = ? AND created_by_account_device_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL
    `).bind(now, identity.accountDeviceId, invitationId,
      identity.accountId, identity.accountDeviceId).run();
    if (result?.success === false) throw new Error('Port Join cancellation failed');
    if (changes(result) === 1) return { status: 'cancelled', alreadyCancelled: false };
    const raced = await readById(invitationId);
    return raced?.cancelled_at != null
      ? { status: 'cancelled', alreadyCancelled: true }
      : { status: raced?.consumed_at != null ? 'used' : 'not_found' };
  }

  async function consume(input) {
    const row = await readByVerifier(input.codeVerifier);
    const storedVerifier = row?.code_verifier || '0'.repeat(64);
    if (!timingSafeHexEqual(input.codeVerifier, storedVerifier) || !row) return { status: 'invalid' };
    if (row.admission_provenance !== input.admissionProvenance ||
        row.account_admission_provenance !== input.admissionProvenance) return { status: 'invalid' };
    if (row.consumed_at != null) {
      const retry = await resolveConsumeRetry(input);
      return retry || { status: 'used' };
    }
    if (row.cancelled_at != null) return { status: 'cancelled' };
    if (Number(row.expires_at) <= input.now) return { status: 'expired' };
    if (row.account_state !== 'active' || row.issuer_revoked_at != null ||
        Number(row.recovery_version) !== Number(row.expected_recovery_version) ||
        Number(row.generation) !== Number(row.expected_account_generation)) {
      return { status: 'issuer_unavailable' };
    }
    const existingDevice = await db.prepare(`
      SELECT account_id FROM sync_account_devices WHERE id = ?
    `).bind(input.accountDeviceId).first();
    if (existingDevice) return { status: 'invalid' };

    let insertQaSession = null;
    let qaExpiresAt = null;
    if (input.admissionProvenance === 'qa') {
      if (!row.qa_enrollment_id || row.qa_issuer_scope !== 'port' ||
          row.qa_issuer_account_id !== row.account_id || row.qa_issuer_revoked_at != null ||
          Number(row.qa_issuer_expires_at) <= input.now || !input.qaSessionId ||
          !input.qaCredentialVerifier) return { status: 'qa_admission_unavailable' };
      qaExpiresAt = Math.min(
        Number(row.qa_issuer_expires_at), input.now + ACCOUNT_QA.SESSION_TTL_MS
      );
      insertQaSession = db.prepare(`
        INSERT INTO sync_account_qa_sessions (
          id, credential_verifier, enrollment_id, scope, account_id, app_id,
          app_device_id, parent_session_id, created_at, expires_at,
          last_used_at, revoked_at, generation
        ) VALUES (?, ?, ?, 'port', ?, NULL, NULL, ?, ?, ?, ?, NULL, 1)
      `).bind(
        input.qaSessionId, input.qaCredentialVerifier, row.qa_enrollment_id,
        row.account_id, row.qa_issuer_session_id, input.now, qaExpiresAt, input.now
      );
    } else if (input.qaSessionId || input.qaCredentialVerifier || row.qa_issuer_session_id) {
      return { status: 'invalid' };
    }

    const insertAccountDevice = db.prepare(`
      INSERT INTO sync_account_devices (
        id, account_id, credential_version, credential_verifier,
        label, created_at, last_seen_at, revoked_at
      )
      SELECT ?, h.account_id, 1, ?, ?, ?, ?, NULL
      FROM sync_port_join_invitations h
      JOIN sync_accounts a ON a.id = h.account_id
      JOIN sync_account_devices issuer ON issuer.id = h.created_by_account_device_id
      WHERE h.invitation_id = ? AND h.code_verifier = ?
        AND h.consumed_at IS NULL AND h.cancelled_at IS NULL AND h.expires_at > ?
        AND a.state = 'active' AND a.recovery_version = h.expected_recovery_version
        AND a.generation = h.expected_account_generation
        AND issuer.revoked_at IS NULL
    `).bind(
      input.accountDeviceId, input.accountCredentialVerifier, input.deviceLabel,
      input.now, input.now, row.invitation_id, input.codeVerifier, input.now
    );
    const claim = db.prepare(`
      UPDATE sync_port_join_invitations
      SET claimed_by_account_device_id = ?, consumed_at = ?,
          consume_operation_id = ?, consume_fingerprint = ?, qa_port_session_id = ?
      WHERE invitation_id = ? AND code_verifier = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at > ?
    `).bind(
      input.accountDeviceId, input.now, input.operationId, input.requestFingerprint,
      input.qaSessionId || null, row.invitation_id, input.codeVerifier, input.now
    );
    const statements = [insertAccountDevice, ...(insertQaSession ? [insertQaSession] : []), claim];
    try {
      const results = await db.batch(statements);
      if (!batchSucceeded(results, statements.length)) {
        const raced = await resolveConsumeRetry(input);
        return raced || { status: 'used' };
      }
      return {
        status: 'joined', accountId: row.account_id,
        accountDeviceId: input.accountDeviceId,
        recoveryVersion: Number(row.expected_recovery_version),
        qaSessionId: input.qaSessionId || null, qaExpiresAt, alreadyJoined: false
      };
    } catch (error) {
      const raced = await resolveConsumeRetry(input);
      if (raced) return raced;
      throw error;
    }
  }

  return Object.freeze({
    issue, status, cancel, consume, resolveIssueRetry, resolveConsumeRetry
  });
}
