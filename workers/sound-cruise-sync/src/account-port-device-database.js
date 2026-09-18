import { timingSafeHexEqual } from './crypto.js';
import { accountManagedRecoveryVerifier } from './account-crypto.js';

function changes(result) {
  return Number(result?.meta?.changes || 0);
}

function batchSucceeded(results, expected) {
  return Array.isArray(results) && results.length === expected &&
    results.every((result) => result?.success !== false && changes(result) === 1);
}

function publicResult(row, alreadyProvisioned) {
  return {
    status: 'active',
    accountId: row.account_id,
    accountDeviceId: row.account_device_id,
    membershipId: row.membership_id,
    syncUserId: row.sync_user_id,
    appDeviceId: row.app_device_id,
    alreadyProvisioned
  };
}

export function createD1PortDeviceRepository(db) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new Error('D1 Port device session is unavailable');
  }

  async function operation(operationId) {
    return db.prepare(`
      SELECT operation_id, request_fingerprint, account_id, account_device_id,
             membership_id, sync_user_id, app_device_id, created_at
      FROM sync_port_device_operations WHERE operation_id = ?
    `).bind(operationId).first();
  }

  async function provision(identity, input) {
    const previous = await operation(input.operationId);
    if (previous) {
      return previous.account_id === identity.accountId &&
        previous.account_device_id === identity.accountDeviceId &&
        previous.app_device_id === input.appDeviceId &&
        timingSafeHexEqual(previous.request_fingerprint, input.requestFingerprint)
        ? publicResult(previous, true)
        : { status: 'conflict' };
    }

    const membershipId = input.membershipId;
    const createMembership = await db.prepare(`
      INSERT INTO sync_account_memberships (
        id, account_id, app_id, state, sync_user_id, recovery_mode,
        generation, created_at, activated_at, updated_at, deleted_at
      )
      SELECT ?, a.id, 'port', 'pending', NULL, 'account', 1, ?, NULL, ?, NULL
      FROM sync_accounts a
      JOIN sync_account_devices ad ON ad.account_id = a.id
      WHERE a.id = ? AND a.state = 'active' AND a.deleted_at IS NULL
        AND ad.id = ? AND ad.revoked_at IS NULL
      ON CONFLICT(account_id, app_id) DO NOTHING
    `).bind(
      membershipId, input.now, input.now,
      identity.accountId, identity.accountDeviceId
    ).run();
    if (createMembership?.success === false) throw new Error('Port membership prepare failed');

    const membership = await db.prepare(`
      SELECT m.id, m.account_id, m.state, m.sync_user_id, a.recovery_verifier,
             a.admission_provenance, d.state AS dataset_state
      FROM sync_account_memberships m
      JOIN sync_accounts a ON a.id = m.account_id
      JOIN sync_account_devices ad
        ON ad.id = ? AND ad.account_id = a.id AND ad.revoked_at IS NULL
      LEFT JOIN sync_datasets d ON d.user_id = m.sync_user_id AND d.app_id = 'port'
      WHERE m.account_id = ? AND m.app_id = 'port'
        AND a.state = 'active' AND a.deleted_at IS NULL
    `).bind(identity.accountDeviceId, identity.accountId).first();
    if (!membership || !['pending', 'active'].includes(membership.state)) {
      return { status: 'membership_unavailable' };
    }

    if (membership.state === 'active') {
      if (!membership.sync_user_id ||
          (membership.dataset_state && !['initializing', 'ready'].includes(membership.dataset_state))) {
        return { status: 'membership_unavailable' };
      }
      const statements = [
        db.prepare(`
          INSERT INTO sync_devices (
            id, user_id, app_id, credential_version, credential_verifier, label,
            last_cursor, created_at, last_seen_at, revoked_at,
            pairing_pending_at, paired_at
          ) VALUES (?, ?, 'port', 1, ?, ?, 0, ?, ?, NULL, NULL, ?)
        `).bind(
          input.appDeviceId, membership.sync_user_id, input.appCredentialVerifier,
          input.deviceLabel, input.now, input.now, input.now
        ),
        db.prepare(`
          INSERT INTO sync_membership_device_links (
            account_id, membership_id, app_device_id, account_device_id, linked_at
          ) VALUES (?, ?, ?, ?, ?)
        `).bind(
          identity.accountId, membership.id, input.appDeviceId,
          identity.accountDeviceId, input.now
        ),
        db.prepare(`
          INSERT INTO sync_port_device_operations (
            operation_id, request_fingerprint, account_id, account_device_id,
            membership_id, sync_user_id, app_device_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          input.operationId, input.requestFingerprint, identity.accountId,
          identity.accountDeviceId, membership.id, membership.sync_user_id,
          input.appDeviceId, input.now
        )
      ];
      try {
        const results = await db.batch(statements);
        if (!batchSucceeded(results, statements.length)) throw new Error('Port device link incomplete');
      } catch (error) {
        const raced = await operation(input.operationId);
        if (raced && raced.account_id === identity.accountId &&
            raced.account_device_id === identity.accountDeviceId &&
            raced.app_device_id === input.appDeviceId &&
            timingSafeHexEqual(raced.request_fingerprint, input.requestFingerprint)) {
          return publicResult(raced, true);
        }
        throw error;
      }
      return publicResult({
        account_id: identity.accountId,
        account_device_id: identity.accountDeviceId,
        membership_id: membership.id,
        sync_user_id: membership.sync_user_id,
        app_device_id: input.appDeviceId
      }, false);
    }

    const managedRecoveryVerifier = await accountManagedRecoveryVerifier(
      membership.recovery_verifier,
      'port',
      input.accountRecoveryPepper
    );
    const statements = [
      db.prepare(`
        INSERT INTO sync_users (
          id, state, recovery_version, recovery_verifier, created_at, updated_at,
          deleted_at, recovery_created_at, recovery_rotated_at,
          delete_requested_at, purge_after
        ) VALUES (?, 'active', 1, ?, ?, ?, NULL, ?, ?, NULL, NULL)
      `).bind(
        input.syncUserId, managedRecoveryVerifier, input.now, input.now,
        input.now, input.now
      ),
      db.prepare(`
        INSERT INTO sync_devices (
          id, user_id, app_id, credential_version, credential_verifier, label,
          last_cursor, created_at, last_seen_at, revoked_at,
          pairing_pending_at, paired_at
        ) VALUES (?, ?, 'port', 1, ?, ?, 0, ?, ?, NULL, NULL, ?)
      `).bind(
        input.appDeviceId, input.syncUserId, input.appCredentialVerifier,
        input.deviceLabel, input.now, input.now, input.now
      ),
      db.prepare(`
        INSERT INTO sync_membership_device_links (
          account_id, membership_id, app_device_id, account_device_id, linked_at
        ) VALUES (?, ?, ?, ?, ?)
      `).bind(
        identity.accountId, membership.id, input.appDeviceId,
        identity.accountDeviceId, input.now
      ),
      db.prepare(`
        INSERT INTO sync_account_managed_users (
          sync_user_id, account_id, membership_id, app_id, created_at
        ) VALUES (?, ?, ?, 'port', ?)
      `).bind(input.syncUserId, identity.accountId, membership.id, input.now),
      db.prepare(`
        UPDATE sync_account_memberships
        SET state = 'active', sync_user_id = ?, recovery_mode = 'account',
            generation = generation + 1, activated_at = ?, updated_at = ?
        WHERE id = ? AND account_id = ? AND app_id = 'port'
          AND state = 'pending' AND sync_user_id IS NULL
      `).bind(
        input.syncUserId, input.now, input.now, membership.id, identity.accountId
      ),
      db.prepare(`
        INSERT INTO sync_port_device_operations (
          operation_id, request_fingerprint, account_id, account_device_id,
          membership_id, sync_user_id, app_device_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        input.operationId, input.requestFingerprint, identity.accountId,
        identity.accountDeviceId, membership.id, input.syncUserId,
        input.appDeviceId, input.now
      )
    ];
    try {
      const results = await db.batch(statements);
      if (!batchSucceeded(results, statements.length)) throw new Error('Port identity activation incomplete');
    } catch (error) {
      const raced = await operation(input.operationId);
      if (raced && raced.account_id === identity.accountId &&
          raced.account_device_id === identity.accountDeviceId &&
          raced.app_device_id === input.appDeviceId &&
          timingSafeHexEqual(raced.request_fingerprint, input.requestFingerprint)) {
        return publicResult(raced, true);
      }
      throw error;
    }
    return publicResult({
      account_id: identity.accountId,
      account_device_id: identity.accountDeviceId,
      membership_id: membership.id,
      sync_user_id: input.syncUserId,
      app_device_id: input.appDeviceId
    }, false);
  }

  return Object.freeze({ provision });
}
