import { timingSafeHexEqual } from './crypto.js';
import { accountManagedRecoveryVerifier } from './account-crypto.js';
import { ACCOUNT_QA } from './account-qa-crypto.js';

export const ACCOUNT_APP_JOIN_TTL_MS = 5 * 60 * 1000;

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
    membershipId: row.membership_id,
    appId: row.app_id,
    admissionProvenance: row.admission_provenance,
    issuerDeviceId: row.created_by_account_device_id,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    consumedAt: row.consumed_at == null ? null : Number(row.consumed_at),
    cancelledAt: row.cancelled_at == null ? null : Number(row.cancelled_at)
  };
}

export function createD1AppJoinRepository(db) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new Error('D1 Account app-join session is unavailable');
  }

  async function readById(invitationId) {
    return db.prepare(`
      SELECT h.*, m.app_id, m.state AS membership_state, m.sync_user_id,
             claimed.user_id AS claimed_sync_user_id,
             a.state AS account_state, a.recovery_verifier,
             a.admission_provenance AS account_admission_provenance,
             issuer.revoked_at AS issuer_revoked_at,
             q.enrollment_id AS qa_enrollment_id, q.scope AS qa_issuer_scope,
             q.account_id AS qa_issuer_account_id, q.expires_at AS qa_issuer_expires_at,
             q.revoked_at AS qa_issuer_revoked_at
      FROM sync_app_join_invitations h
      JOIN sync_account_memberships m
        ON m.id = h.membership_id AND m.account_id = h.account_id
      JOIN sync_accounts a ON a.id = h.account_id
      LEFT JOIN sync_account_devices issuer
        ON issuer.id = h.created_by_account_device_id
      LEFT JOIN sync_devices claimed
        ON claimed.id = h.claimed_by_app_device_id
      LEFT JOIN sync_account_qa_sessions q ON q.id = h.qa_issuer_session_id
      WHERE h.invitation_id = ?
    `).bind(invitationId).first();
  }

  async function readByVerifier(codeVerifier) {
    return db.prepare(`
      SELECT h.*, m.app_id, m.state AS membership_state, m.sync_user_id,
             claimed.user_id AS claimed_sync_user_id,
             a.state AS account_state, a.recovery_verifier,
             a.admission_provenance AS account_admission_provenance,
             issuer.revoked_at AS issuer_revoked_at,
             q.enrollment_id AS qa_enrollment_id, q.scope AS qa_issuer_scope,
             q.account_id AS qa_issuer_account_id, q.expires_at AS qa_issuer_expires_at,
             q.revoked_at AS qa_issuer_revoked_at
      FROM sync_app_join_invitations h
      JOIN sync_account_memberships m
        ON m.id = h.membership_id AND m.account_id = h.account_id
        AND m.app_id = h.target_app_id
      JOIN sync_accounts a ON a.id = h.account_id
      LEFT JOIN sync_account_devices issuer
        ON issuer.id = h.created_by_account_device_id
      LEFT JOIN sync_devices claimed ON claimed.id = h.claimed_by_app_device_id
      LEFT JOIN sync_account_qa_sessions q ON q.id = h.qa_issuer_session_id
      WHERE h.code_verifier = ?
    `).bind(codeVerifier).first();
  }

  async function readByIssueOperation(operationId) {
    return db.prepare(`
      SELECT h.*, m.app_id, m.state AS membership_state
      FROM sync_app_join_invitations h
      JOIN sync_account_memberships m
        ON m.id = h.membership_id AND m.account_id = h.account_id
      WHERE h.issue_operation_id = ?
    `).bind(operationId).first();
  }

  async function resolveIssueRetry(identity, input) {
    input = { admissionProvenance: 'qa', ...input };
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
    input = { admissionProvenance: 'qa', ...input };
    const row = await readByVerifier(input.codeVerifier);
    const storedVerifier = row?.code_verifier || '0'.repeat(64);
    if (!timingSafeHexEqual(input.codeVerifier, storedVerifier) || !row) return null;
    if (row.admission_provenance !== input.admissionProvenance ||
        row.account_admission_provenance !== input.admissionProvenance ||
        row.consumed_at == null || row.consume_operation_id !== input.operationId ||
        row.consume_fingerprint !== input.requestFingerprint ||
        row.claimed_by_app_device_id !== input.appDeviceId ||
        row.claimed_by_account_device_id !== input.accountDeviceId) return null;
    if (row.qa_app_session_id !== input.qaSessionId) return null;
    return {
      status: row.consume_mode === 'existing_chord' ? 'bridge_required' : 'activated',
      accountId: row.account_id,
      membershipId: row.membership_id,
      syncUserId: row.sync_user_id || row.claimed_sync_user_id,
      appDeviceId: row.claimed_by_app_device_id,
      accountDeviceId: row.claimed_by_account_device_id,
      qaSessionId: row.qa_app_session_id,
      alreadyActivated: true
    };
  }

  async function issue(identity, input) {
    input = { admissionProvenance: 'qa', ...input };
    const retry = await resolveIssueRetry(identity, input);
    if (retry) return retry;

    const membership = input.admissionProvenance === 'qa'
      ? await db.prepare(`
          SELECT m.id, m.app_id, m.state, m.sync_user_id,
                 dataset.state AS dataset_state
          FROM sync_account_memberships m
          JOIN sync_accounts a ON a.id = m.account_id AND a.state = 'active'
            AND a.deleted_at IS NULL AND a.admission_provenance = 'qa'
          JOIN sync_account_devices d
            ON d.id = ? AND d.account_id = a.id AND d.revoked_at IS NULL
          JOIN sync_account_qa_sessions q
            ON q.id = ? AND q.scope = 'port' AND q.account_id = a.id
            AND q.revoked_at IS NULL AND q.expires_at > ?
          LEFT JOIN sync_datasets dataset
            ON dataset.user_id = m.sync_user_id AND dataset.app_id = m.app_id
          WHERE m.account_id = ? AND m.app_id = ?
        `).bind(identity.accountDeviceId, input.qaIssuerSessionId, input.now,
          identity.accountId, input.appId).first()
      : await db.prepare(`
          SELECT m.id, m.app_id, m.state, m.sync_user_id,
                 dataset.state AS dataset_state
          FROM sync_account_memberships m
          JOIN sync_accounts a ON a.id = m.account_id AND a.state = 'active'
            AND a.deleted_at IS NULL AND a.admission_provenance = 'production'
          JOIN sync_account_devices d
            ON d.id = ? AND d.account_id = a.id AND d.revoked_at IS NULL
          LEFT JOIN sync_datasets dataset
            ON dataset.user_id = m.sync_user_id AND dataset.app_id = m.app_id
          WHERE m.account_id = ? AND m.app_id = ?
        `).bind(identity.accountDeviceId, identity.accountId, input.appId).first();
    if (!membership || !['pending', 'active'].includes(membership.state)) {
      return { status: 'membership_unavailable' };
    }
    // The same verifier-only invitation primitive is intentionally reused for
    // both an initial app join and adding another environment. An active
    // membership may issue only when it has a ready dataset; consume keeps
    // the authoritative Account-managed binding check before it creates a
    // second app device. This preserves Recovery-issued invitation retries
    // while preventing a parallel identity or incomplete data-plane join.
    if (membership.state === 'active' && (
      !membership.sync_user_id ||
      membership.dataset_state !== 'ready'
    )) {
      return { status: 'membership_unavailable' };
    }

    // Expired invitations no longer occupy the one-active-invitation slot. This
    // lifecycle write is part of issuing a new invitation, never scheduled cleanup.
    await db.prepare(`
      UPDATE sync_app_join_invitations
      SET cancelled_at = ?, cancelled_by_account_device_id = ?
      WHERE account_id = ? AND membership_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at <= ?
    `).bind(
      input.now,
      identity.accountDeviceId,
      identity.accountId,
      membership.id,
      input.now
    ).run();

    const active = await db.prepare(`
      SELECT invitation_id
      FROM sync_app_join_invitations
      WHERE account_id = ? AND membership_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at > ?
      LIMIT 1
    `).bind(identity.accountId, membership.id, input.now).first();
    if (active) return { status: 'invitation_exists' };

    const expiresAt = input.now + ACCOUNT_APP_JOIN_TTL_MS;
    try {
      const result = await db.prepare(`
        INSERT INTO sync_app_join_invitations (
          invitation_id, code_verifier, account_id, membership_id, target_app_id,
          admission_provenance,
          created_by_account_device_id, claimed_by_app_device_id,
          created_at, expires_at, consumed_at, cancelled_at,
          issue_operation_id, issue_fingerprint, consume_operation_id,
          consume_fingerprint, claimed_by_account_device_id,
          cancelled_by_account_device_id, qa_issuer_session_id, qa_app_session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?, NULL, NULL, NULL, NULL, ?, NULL)
      `).bind(
        input.invitationId,
        input.codeVerifier,
        identity.accountId,
        membership.id,
        membership.app_id,
        input.admissionProvenance,
        identity.accountDeviceId,
        input.now,
        expiresAt,
        input.operationId,
        input.requestFingerprint,
        input.qaIssuerSessionId
      ).run();
      if (result?.success === false || changes(result) !== 1) throw new Error('App Join issue failed');
      return {
        status: 'issued',
        invitationId: input.invitationId,
        accountId: identity.accountId,
        membershipId: membership.id,
        appId: membership.app_id,
        issuerDeviceId: identity.accountDeviceId,
        createdAt: input.now,
        expiresAt,
        consumedAt: null,
        cancelledAt: null,
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

  async function cancel(identity, invitationId, now) {
    const row = await readById(invitationId);
    if (!row || row.account_id !== identity.accountId ||
        row.created_by_account_device_id !== identity.accountDeviceId) return { status: 'not_found' };
    if (row.consumed_at != null) return { status: 'used' };
    if (row.cancelled_at != null) return { status: 'cancelled', alreadyCancelled: true };
    const result = await db.prepare(`
      UPDATE sync_app_join_invitations
      SET cancelled_at = ?, cancelled_by_account_device_id = ?
      WHERE invitation_id = ? AND account_id = ? AND created_by_account_device_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL
    `).bind(
      now,
      identity.accountDeviceId,
      invitationId,
      identity.accountId,
      identity.accountDeviceId
    ).run();
    if (result?.success === false) throw new Error('App Join cancellation failed');
    if (changes(result) === 1) return { status: 'cancelled', alreadyCancelled: false };
    const raced = await readById(invitationId);
    return raced?.cancelled_at != null
      ? { status: 'cancelled', alreadyCancelled: true }
      : { status: raced?.consumed_at != null ? 'used' : 'not_found' };
  }

  async function consume(input) {
    input = { admissionProvenance: 'qa', ...input };
    const row = await readByVerifier(input.codeVerifier);
    const storedVerifier = row?.code_verifier || '0'.repeat(64);
    if (!timingSafeHexEqual(input.codeVerifier, storedVerifier) || !row) return { status: 'invalid' };
    input = { ...input, invitationId: row.invitation_id };
    if (row.app_id !== input.appId) return { status: 'wrong_app' };
    if (row.admission_provenance !== input.admissionProvenance ||
        row.account_admission_provenance !== input.admissionProvenance) return { status: 'invalid' };
    if (row.consumed_at != null) {
      if (row.consume_operation_id === input.operationId &&
          row.consume_fingerprint === input.requestFingerprint &&
          row.claimed_by_app_device_id === input.appDeviceId &&
          row.claimed_by_account_device_id === input.accountDeviceId) {
        return {
          status: row.consume_mode === 'existing_chord' ? 'bridge_required' : 'activated',
          accountId: row.account_id,
          membershipId: row.membership_id,
          syncUserId: row.sync_user_id || row.claimed_sync_user_id,
          appDeviceId: row.claimed_by_app_device_id,
          accountDeviceId: row.claimed_by_account_device_id,
          alreadyActivated: true
        };
      }
      return { status: 'used' };
    }
    if (row.cancelled_at != null) return { status: 'cancelled' };
    if (Number(row.expires_at) <= input.now) return { status: 'expired' };
    const newMembership = row.membership_state === 'pending' && row.sync_user_id == null;
    const reconnectMembership = row.membership_state === 'active' && row.sync_user_id != null;
    if (row.account_state !== 'active' || row.issuer_revoked_at != null ||
        (!newMembership && !reconnectMembership)) {
      return { status: 'membership_unavailable' };
    }
    let insertQaSession = null;
    if (input.admissionProvenance === 'qa') {
      if (!row.qa_enrollment_id || row.qa_issuer_scope !== 'port' ||
          row.qa_issuer_account_id !== row.account_id || row.qa_issuer_revoked_at != null ||
          Number(row.qa_issuer_expires_at) <= input.now || !input.qaSessionId ||
          !input.qaCredentialVerifier) {
        return { status: 'qa_admission_unavailable' };
      }
      const qaExpiresAt = Math.min(
        Number(row.qa_issuer_expires_at),
        input.now + ACCOUNT_QA.SESSION_TTL_MS
      );
      insertQaSession = db.prepare(`
        INSERT INTO sync_account_qa_sessions (
          id, credential_verifier, enrollment_id, scope, account_id, app_id,
          app_device_id, parent_session_id, created_at, expires_at,
          last_used_at, revoked_at, generation
        ) VALUES (?, ?, ?, 'app', ?, ?, ?, ?, ?, ?, ?, NULL, 1)
      `).bind(
        input.qaSessionId,
        input.qaCredentialVerifier,
        row.qa_enrollment_id,
        row.account_id,
        input.appId,
        input.appDeviceId,
        row.qa_issuer_session_id,
        input.now,
        qaExpiresAt,
        input.now
      );
    } else if (input.qaSessionId || input.qaCredentialVerifier || row.qa_issuer_session_id) {
      return { status: 'invalid' };
    }
    if (input.consumeMode === 'existing_chord') {
      if (!newMembership) return { status: 'membership_unavailable' };
      const existing = await db.prepare(`
        SELECT d.id, d.user_id, d.app_id, d.revoked_at, u.state AS user_state,
               u.deleted_at, s.state AS dataset_state
        FROM sync_devices d
        JOIN sync_users u ON u.id = d.user_id
        JOIN sync_datasets s ON s.user_id = d.user_id AND s.app_id = d.app_id
        LEFT JOIN sync_account_managed_users am ON am.sync_user_id = d.user_id
        WHERE d.id = ? AND d.user_id = ? AND d.app_id = 'chord'
          AND d.credential_verifier = ? AND d.revoked_at IS NULL
          AND u.state = 'active' AND u.deleted_at IS NULL
          AND s.state = 'ready' AND am.sync_user_id IS NULL
      `).bind(
        input.appDeviceId,
        input.syncUserId,
        input.appCredentialVerifier
      ).first();
      if (!existing) return { status: 'membership_unavailable' };

      const insertAccountDevice = db.prepare(`
        INSERT INTO sync_account_devices (
          id, account_id, credential_version, credential_verifier,
          label, created_at, last_seen_at, revoked_at
        ) VALUES (?, ?, 1, ?, ?, ?, ?, NULL)
      `).bind(
        input.accountDeviceId,
        row.account_id,
        input.accountCredentialVerifier,
        input.deviceLabel,
        input.now,
        input.now
      );
      const claim = db.prepare(`
        UPDATE sync_app_join_invitations
        SET claimed_by_app_device_id = ?, claimed_by_account_device_id = ?,
            consumed_at = ?, consume_operation_id = ?, consume_fingerprint = ?,
            consume_mode = 'existing_chord', qa_app_session_id = ?
        WHERE invitation_id = ? AND account_id = ? AND membership_id = ?
          AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at > ?
      `).bind(
        input.appDeviceId,
        input.accountDeviceId,
        input.now,
        input.operationId,
        input.requestFingerprint,
        input.qaSessionId,
        input.invitationId,
        row.account_id,
        row.membership_id,
        input.now
      );
      const guard = db.prepare(`
        UPDATE sync_account_memberships
        SET updated_at = CASE WHEN
          state = 'pending' AND sync_user_id IS NULL
          AND EXISTS (
            SELECT 1 FROM sync_app_join_invitations h
            WHERE h.invitation_id = ? AND h.membership_id = sync_account_memberships.id
              AND h.consume_mode = 'existing_chord'
              AND h.claimed_by_app_device_id = ?
              AND h.claimed_by_account_device_id = ?
              AND h.consume_operation_id = ? AND h.consume_fingerprint = ?
              AND h.consumed_at IS NOT NULL
          ) THEN updated_at ELSE created_at - 1 END
        WHERE id = ? AND account_id = ? AND app_id = 'chord'
      `).bind(
        input.invitationId,
        input.appDeviceId,
        input.accountDeviceId,
        input.operationId,
        input.requestFingerprint,
        row.membership_id,
        row.account_id
      );
      try {
        const statements = [insertAccountDevice, ...(insertQaSession ? [insertQaSession] : []), claim, guard];
        const results = await db.batch(statements);
        if (!batchSucceeded(results, statements.length)) {
          throw new Error('Existing Chord app-join transaction was incomplete');
        }
        return {
          status: 'bridge_required',
          accountId: row.account_id,
          membershipId: row.membership_id,
          syncUserId: input.syncUserId,
          appDeviceId: input.appDeviceId,
          accountDeviceId: input.accountDeviceId,
          qaSessionId: input.qaSessionId,
          alreadyActivated: false
        };
      } catch (error) {
        const finalState = await readById(input.invitationId);
        if (finalState?.consume_operation_id === input.operationId &&
            finalState.consume_fingerprint === input.requestFingerprint &&
            finalState.consume_mode === 'existing_chord') {
          return {
            status: 'bridge_required',
            accountId: finalState.account_id,
            membershipId: finalState.membership_id,
            syncUserId: input.syncUserId,
            appDeviceId: finalState.claimed_by_app_device_id,
            accountDeviceId: finalState.claimed_by_account_device_id,
            qaSessionId: finalState.qa_app_session_id,
            alreadyActivated: true
          };
        }
        throw error;
      }
    }

    if (reconnectMembership) {
      const reconnectable = await db.prepare(`
        SELECT u.id
        FROM sync_users u
        JOIN sync_datasets d ON d.user_id = u.id AND d.app_id = ? AND d.state = 'ready'
        JOIN sync_account_managed_users am
          ON am.sync_user_id = u.id AND am.account_id = ? AND am.membership_id = ? AND am.app_id = ?
        WHERE u.id = ? AND u.state = 'active' AND u.deleted_at IS NULL
      `).bind(input.appId, row.account_id, row.membership_id, input.appId, row.sync_user_id).first();
      if (!reconnectable) return { status: 'membership_unavailable' };
      const insertAppDevice = db.prepare(`
        INSERT INTO sync_devices (
          id, user_id, app_id, credential_version, credential_verifier, label,
          last_cursor, created_at, last_seen_at, revoked_at, pairing_pending_at, paired_at
        ) VALUES (?, ?, ?, 1, ?, ?, 0, ?, ?, NULL, NULL, ?)
      `).bind(input.appDeviceId, row.sync_user_id, input.appId,
        input.appCredentialVerifier, input.deviceLabel, input.now, input.now, input.now);
      const insertAccountDevice = db.prepare(`
        INSERT INTO sync_account_devices (
          id, account_id, credential_version, credential_verifier,
          label, created_at, last_seen_at, revoked_at
        ) VALUES (?, ?, 1, ?, ?, ?, ?, NULL)
      `).bind(input.accountDeviceId, row.account_id, input.accountCredentialVerifier,
        input.deviceLabel, input.now, input.now);
      const linkDevice = db.prepare(`
        INSERT INTO sync_membership_device_links (
          account_id, membership_id, app_device_id, account_device_id, linked_at
        ) VALUES (?, ?, ?, ?, ?)
      `).bind(row.account_id, row.membership_id, input.appDeviceId,
        input.accountDeviceId, input.now);
      const consumeInvitation = db.prepare(`
        UPDATE sync_app_join_invitations
        SET claimed_by_app_device_id = ?, claimed_by_account_device_id = ?,
            consumed_at = ?, consume_operation_id = ?, consume_fingerprint = ?,
            consume_mode = 'new_app', qa_app_session_id = ?
        WHERE invitation_id = ? AND account_id = ? AND membership_id = ?
          AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at > ?
      `).bind(input.appDeviceId, input.accountDeviceId, input.now,
        input.operationId, input.requestFingerprint, input.qaSessionId,
        input.invitationId, row.account_id, row.membership_id, input.now);
      const guard = db.prepare(`
        UPDATE sync_account_memberships SET updated_at = CASE WHEN
          state = 'active' AND sync_user_id = ?
          AND EXISTS (SELECT 1 FROM sync_membership_device_links l
            WHERE l.membership_id = sync_account_memberships.id
              AND l.app_device_id = ? AND l.account_device_id = ?)
          AND EXISTS (SELECT 1 FROM sync_app_join_invitations h
            WHERE h.invitation_id = ? AND h.consumed_at IS NOT NULL
              AND h.consume_operation_id = ? AND h.consume_fingerprint = ?)
          THEN updated_at ELSE created_at - 1 END
        WHERE id = ? AND account_id = ? AND app_id = ?
      `).bind(row.sync_user_id, input.appDeviceId, input.accountDeviceId,
        input.invitationId, input.operationId, input.requestFingerprint,
        row.membership_id, row.account_id, input.appId);
      try {
        const statements = [insertAppDevice, insertAccountDevice, ...(insertQaSession ? [insertQaSession] : []),
          linkDevice, consumeInvitation, guard];
        const results = await db.batch(statements);
        if (!batchSucceeded(results, statements.length)) {
          throw new Error('Account app reconnect transaction was incomplete');
        }
        return {
          status: 'activated', accountId: row.account_id,
          membershipId: row.membership_id, syncUserId: row.sync_user_id,
          appDeviceId: input.appDeviceId, accountDeviceId: input.accountDeviceId,
          qaSessionId: input.qaSessionId, alreadyActivated: false
        };
      } catch (error) {
        const finalState = await readById(input.invitationId);
        if (finalState?.consume_operation_id === input.operationId &&
            finalState.consume_fingerprint === input.requestFingerprint) {
          return {
            status: 'activated', accountId: finalState.account_id,
            membershipId: finalState.membership_id, syncUserId: finalState.sync_user_id,
            appDeviceId: finalState.claimed_by_app_device_id,
            accountDeviceId: finalState.claimed_by_account_device_id,
            qaSessionId: finalState.qa_app_session_id, alreadyActivated: true
          };
        }
        throw error;
      }
    }

    const managedRecoveryVerifier = await accountManagedRecoveryVerifier(
      row.recovery_verifier,
      input.appId,
      input.accountRecoveryPepper
    );

    const insertUser = db.prepare(`
      INSERT INTO sync_users (
        id, state, recovery_version, recovery_verifier, created_at, updated_at,
        deleted_at, recovery_created_at, recovery_rotated_at,
        delete_requested_at, purge_after
      ) VALUES (?, 'active', 1, ?, ?, ?, NULL, ?, ?, NULL, NULL)
    `).bind(
      input.syncUserId,
      managedRecoveryVerifier,
      input.now,
      input.now,
      input.now,
      input.now
    );
    const insertAppDevice = db.prepare(`
      INSERT INTO sync_devices (
        id, user_id, app_id, credential_version, credential_verifier, label,
        last_cursor, created_at, last_seen_at, revoked_at,
        pairing_pending_at, paired_at
      ) VALUES (?, ?, ?, 1, ?, ?, 0, ?, ?, NULL, NULL, ?)
    `).bind(
      input.appDeviceId,
      input.syncUserId,
      input.appId,
      input.appCredentialVerifier,
      input.deviceLabel,
      input.now,
      input.now,
      input.now
    );
    const insertAccountDevice = db.prepare(`
      INSERT INTO sync_account_devices (
        id, account_id, credential_version, credential_verifier,
        label, created_at, last_seen_at, revoked_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?, NULL)
    `).bind(
      input.accountDeviceId,
      row.account_id,
      input.accountCredentialVerifier,
      input.deviceLabel,
      input.now,
      input.now
    );
    const linkDevice = db.prepare(`
      INSERT INTO sync_membership_device_links (
        account_id, membership_id, app_device_id, account_device_id, linked_at
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      row.account_id,
      row.membership_id,
      input.appDeviceId,
      input.accountDeviceId,
      input.now
    );
    const markManaged = db.prepare(`
      INSERT INTO sync_account_managed_users (
        sync_user_id, account_id, membership_id, app_id, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      input.syncUserId,
      row.account_id,
      row.membership_id,
      input.appId,
      input.now
    );
    const activateMembership = db.prepare(`
      UPDATE sync_account_memberships
      SET state = 'active', sync_user_id = ?, recovery_mode = 'account',
          generation = generation + 1, activated_at = ?, updated_at = ?
      WHERE id = ? AND account_id = ? AND app_id = ?
        AND state = 'pending' AND sync_user_id IS NULL
    `).bind(
      input.syncUserId,
      input.now,
      input.now,
      row.membership_id,
      row.account_id,
      input.appId
    );
    const consumeInvitation = db.prepare(`
      UPDATE sync_app_join_invitations
      SET claimed_by_app_device_id = ?, claimed_by_account_device_id = ?,
          consumed_at = ?, consume_operation_id = ?, consume_fingerprint = ?,
          consume_mode = 'new_app', qa_app_session_id = ?
      WHERE invitation_id = ? AND account_id = ? AND membership_id = ?
        AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at > ?
    `).bind(
      input.appDeviceId,
      input.accountDeviceId,
      input.now,
      input.operationId,
      input.requestFingerprint,
      input.qaSessionId,
      input.invitationId,
      row.account_id,
      row.membership_id,
      input.now
    );
    const guard = db.prepare(`
      UPDATE sync_account_memberships
      SET updated_at = CASE WHEN
        state = 'active' AND sync_user_id = ? AND recovery_mode = 'account'
        AND EXISTS (
          SELECT 1 FROM sync_app_join_invitations h
          WHERE h.invitation_id = ? AND h.membership_id = sync_account_memberships.id
            AND h.claimed_by_app_device_id = ?
            AND h.claimed_by_account_device_id = ?
            AND h.consume_operation_id = ? AND h.consume_fingerprint = ?
            AND h.consumed_at IS NOT NULL
        )
        AND EXISTS (
          SELECT 1 FROM sync_account_managed_users u
          WHERE u.sync_user_id = ? AND u.membership_id = sync_account_memberships.id
        )
        THEN updated_at ELSE created_at - 1 END
      WHERE id = ? AND account_id = ? AND app_id = ?
    `).bind(
      input.syncUserId,
      input.invitationId,
      input.appDeviceId,
      input.accountDeviceId,
      input.operationId,
      input.requestFingerprint,
      input.syncUserId,
      row.membership_id,
      row.account_id,
      input.appId
    );

    try {
      const statements = [
        insertUser,
        insertAppDevice,
        insertAccountDevice,
        ...(insertQaSession ? [insertQaSession] : []),
        linkDevice,
        markManaged,
        activateMembership,
        consumeInvitation,
        guard
      ];
      const results = await db.batch(statements);
      if (!batchSucceeded(results, statements.length)) {
        throw new Error('Account app-join transaction was incomplete');
      }
      return {
        status: 'activated',
        accountId: row.account_id,
        membershipId: row.membership_id,
        syncUserId: input.syncUserId,
        appDeviceId: input.appDeviceId,
        accountDeviceId: input.accountDeviceId,
        qaSessionId: input.qaSessionId,
        alreadyActivated: false
      };
    } catch (error) {
      const finalState = await readById(input.invitationId);
      if (finalState?.consume_operation_id === input.operationId &&
          finalState.consume_fingerprint === input.requestFingerprint &&
          finalState.claimed_by_app_device_id === input.appDeviceId &&
          finalState.claimed_by_account_device_id === input.accountDeviceId) {
        return {
          status: 'activated',
          accountId: finalState.account_id,
          membershipId: finalState.membership_id,
          syncUserId: finalState.sync_user_id,
          appDeviceId: finalState.claimed_by_app_device_id,
          accountDeviceId: finalState.claimed_by_account_device_id,
          qaSessionId: finalState.qa_app_session_id,
          alreadyActivated: true
        };
      }
      if (finalState?.consumed_at != null) return { status: 'used' };
      if (finalState?.cancelled_at != null) return { status: 'cancelled' };
      if (finalState && Number(finalState.expires_at) <= input.now) return { status: 'expired' };
      throw error;
    }
  }

  async function status(identity, invitationId) {
    const row = await readById(invitationId);
    if (!row || row.account_id !== identity.accountId ||
        row.created_by_account_device_id !== identity.accountDeviceId) return { status: 'not_found' };
    return { status: 'ok', invitation: publicInvitation(row) };
  }

  return Object.freeze({ resolveIssueRetry, resolveConsumeRetry, issue, cancel, consume, status });
}
