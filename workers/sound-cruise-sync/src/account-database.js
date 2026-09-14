function changes(result) {
  return Number(result?.meta?.changes || 0);
}

function batchSucceeded(results, expected) {
  return Array.isArray(results) && results.length === expected &&
    results.every((result) => result?.success !== false);
}

export function createD1AccountRepository(db) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new Error('D1 account session is unavailable');
  }

  async function createAccountBackbone(input) {
    const account = db.prepare(`
      INSERT INTO sync_accounts (
        id, state, recovery_version, recovery_verifier, generation,
        created_at, updated_at, recovery_created_at, recovery_rotated_at,
        delete_requested_at, purge_after, deleted_at
      ) VALUES (?, 'active', 1, ?, 1, ?, ?, ?, ?, NULL, NULL, NULL)
    `).bind(
      input.accountId,
      input.recoveryVerifier,
      input.now,
      input.now,
      input.now,
      input.now
    );
    const accountDevice = db.prepare(`
      INSERT INTO sync_account_devices (
        id, account_id, credential_version, credential_verifier,
        label, created_at, last_seen_at, revoked_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?, NULL)
    `).bind(
      input.accountDeviceId,
      input.accountId,
      input.accountCredentialVerifier,
      input.accountDeviceLabel,
      input.now,
      input.now
    );
    const membershipStatements = input.memberships.map((membership) => db.prepare(`
      INSERT INTO sync_account_memberships (
        id, account_id, app_id, state, sync_user_id, recovery_mode,
        generation, created_at, activated_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, 'pending', NULL, 'account', 1, ?, NULL, ?, NULL)
    `).bind(membership.id, input.accountId, membership.appId, input.now, input.now));

    const startOperation = input.startOperation ? db.prepare(`
      INSERT INTO sync_account_start_operations (
        operation_id, request_fingerprint, account_id, account_device_id, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      input.startOperation.operationId,
      input.startOperation.requestFingerprint,
      input.accountId,
      input.accountDeviceId,
      input.now
    ) : null;
    const statements = [account, accountDevice, ...membershipStatements];
    if (startOperation) statements.push(startOperation);
    const results = await db.batch(statements);
    if (!batchSucceeded(results, statements.length) ||
        results.some((result) => changes(result) !== 1)) {
      throw new Error('D1 account provisioning transaction was incomplete');
    }
    return {
      status: 'created',
      accountId: input.accountId,
      accountDeviceId: input.accountDeviceId,
      memberships: input.memberships.map((membership) => ({
        id: membership.id,
        appId: membership.appId,
        state: 'pending'
      }))
    };
  }

  async function getStartOperation(operationId) {
    const row = await db.prepare(`
      SELECT operation_id, request_fingerprint, account_id, account_device_id, created_at
      FROM sync_account_start_operations
      WHERE operation_id = ?
    `).bind(operationId).first();
    if (!row) return null;
    const memberships = await db.prepare(`
      SELECT id, app_id, state
      FROM sync_account_memberships
      WHERE account_id = ?
      ORDER BY CASE app_id
        WHEN 'chord' THEN 1 WHEN 'pitch' THEN 2
        WHEN 'fretboard' THEN 3 WHEN 'rhythm' THEN 4 ELSE 5 END
    `).bind(row.account_id).all();
    return {
      operationId: row.operation_id,
      requestFingerprint: row.request_fingerprint,
      accountId: row.account_id,
      accountDeviceId: row.account_device_id,
      createdAt: Number(row.created_at),
      memberships: (memberships?.results || []).map((membership) => ({
        id: membership.id,
        appId: membership.app_id,
        state: membership.state
      }))
    };
  }

  async function getAccountSummary(accountId) {
    const account = await db.prepare(`
      SELECT id, state, recovery_version, generation, created_at, updated_at,
             recovery_created_at, recovery_rotated_at, delete_requested_at,
             purge_after, deleted_at
      FROM sync_accounts WHERE id = ?
    `).bind(accountId).first();
    if (!account) return null;

    const membershipResult = await db.prepare(`
      SELECT m.id, m.app_id, m.state, m.sync_user_id, m.recovery_mode,
             m.generation, m.created_at, m.activated_at, m.updated_at, m.deleted_at,
             d.state AS dataset_state, d.schema_version, d.record_count,
             d.manifest_hash, d.last_change_seq
      FROM sync_account_memberships m
      LEFT JOIN sync_datasets d
        ON d.user_id = m.sync_user_id AND d.app_id = m.app_id
      WHERE m.account_id = ?
      ORDER BY CASE m.app_id
        WHEN 'chord' THEN 1 WHEN 'pitch' THEN 2
        WHEN 'fretboard' THEN 3 WHEN 'rhythm' THEN 4 ELSE 5 END
    `).bind(accountId).all();
    return {
      account: {
        id: account.id,
        state: account.state,
        recoveryVersion: Number(account.recovery_version),
        generation: Number(account.generation),
        createdAt: Number(account.created_at),
        updatedAt: Number(account.updated_at),
        recoveryCreatedAt: account.recovery_created_at == null ? null : Number(account.recovery_created_at),
        recoveryRotatedAt: account.recovery_rotated_at == null ? null : Number(account.recovery_rotated_at),
        deleteRequestedAt: account.delete_requested_at == null ? null : Number(account.delete_requested_at),
        purgeAfter: account.purge_after == null ? null : Number(account.purge_after),
        deletedAt: account.deleted_at == null ? null : Number(account.deleted_at)
      },
      memberships: (membershipResult?.results || []).map((membership) => ({
        id: membership.id,
        appId: membership.app_id,
        state: membership.state,
        recoveryMode: membership.recovery_mode,
        generation: Number(membership.generation),
        createdAt: Number(membership.created_at),
        activatedAt: membership.activated_at == null ? null : Number(membership.activated_at),
        updatedAt: Number(membership.updated_at),
        deletedAt: membership.deleted_at == null ? null : Number(membership.deleted_at),
        dataset: membership.dataset_state == null ? null : {
          state: membership.dataset_state,
          schemaVersion: Number(membership.schema_version),
          recordCount: Number(membership.record_count),
          manifestHash: membership.manifest_hash,
          lastChangeSeq: Number(membership.last_change_seq)
        }
      }))
    };
  }

  async function getMembershipActivation(input) {
    return db.prepare(`
      SELECT m.id, m.account_id, m.app_id, m.state, m.sync_user_id,
             m.recovery_mode, l.app_device_id, l.account_device_id
      FROM sync_account_memberships m
      LEFT JOIN sync_membership_device_links l ON l.membership_id = m.id
      WHERE m.id = ? AND m.account_id = ? AND m.app_id = ?
    `).bind(input.membershipId, input.accountId, input.appId).first();
  }

  async function prepareMembership(identity, input) {
    const existing = await db.prepare(`
      SELECT id, account_id, app_id, state, sync_user_id, prepared_operation_id
      FROM sync_account_memberships
      WHERE account_id = ? AND app_id = ?
    `).bind(identity.accountId, input.appId).first();
    if (existing) {
      if (existing.prepared_operation_id === input.operationId ||
          existing.state === 'pending' || existing.state === 'active') {
        return {
          status: existing.state,
          membershipId: existing.id,
          appId: existing.app_id,
          alreadyPrepared: true
        };
      }
      return { status: 'invalid' };
    }

    try {
      const result = await db.prepare(`
        INSERT INTO sync_account_memberships (
          id, account_id, app_id, state, sync_user_id, recovery_mode,
          generation, created_at, activated_at, updated_at, deleted_at,
          prepared_operation_id, prepared_by_account_device_id
        )
        SELECT ?, a.id, ?, 'pending', NULL, 'account', 1, ?, NULL, ?, NULL, ?, ?
        FROM sync_accounts a
        JOIN sync_account_devices d
          ON d.id = ? AND d.account_id = a.id AND d.revoked_at IS NULL
        WHERE a.id = ? AND a.state = 'active' AND a.deleted_at IS NULL
      `).bind(
        input.membershipId,
        input.appId,
        input.now,
        input.now,
        input.operationId,
        identity.accountDeviceId,
        identity.accountDeviceId,
        identity.accountId
      ).run();
      if (result?.success === false || changes(result) !== 1) return { status: 'invalid' };
      return {
        status: 'pending',
        membershipId: input.membershipId,
        appId: input.appId,
        alreadyPrepared: false
      };
    } catch (error) {
      const raced = await db.prepare(`
        SELECT id, app_id, state, prepared_operation_id
        FROM sync_account_memberships
        WHERE account_id = ? AND app_id = ?
      `).bind(identity.accountId, input.appId).first();
      if (raced && (raced.prepared_operation_id === input.operationId ||
          raced.state === 'pending' || raced.state === 'active')) {
        return {
          status: raced.state,
          membershipId: raced.id,
          appId: raced.app_id,
          alreadyPrepared: true
        };
      }
      throw error;
    }
  }

  async function listAccountDevices(identity) {
    const result = await db.prepare(`
      SELECT id, label, credential_version, created_at, last_seen_at, revoked_at
      FROM sync_account_devices
      WHERE account_id = ?
      ORDER BY created_at ASC, id ASC
    `).bind(identity.accountId).all();
    return (result?.results || []).map((device) => ({
      id: device.id,
      label: device.label,
      credentialVersion: Number(device.credential_version),
      createdAt: Number(device.created_at),
      lastSeenAt: Number(device.last_seen_at),
      revokedAt: device.revoked_at == null ? null : Number(device.revoked_at),
      isCurrent: device.id === identity.accountDeviceId
    }));
  }

  async function activateMembership(input) {
    const current = await getMembershipActivation(input);
    if (current?.state === 'active' && current.sync_user_id === input.syncUserId &&
        current.recovery_mode === input.recoveryMode &&
        current.app_device_id === input.appDeviceId &&
        current.account_device_id === input.accountDeviceId) {
      return { status: 'active', membershipId: input.membershipId, alreadyActive: true };
    }
    if (!current || current.state !== 'pending' || current.sync_user_id != null ||
        current.app_device_id != null) return { status: 'invalid' };
    const candidate = await db.prepare(`
      SELECT m.id
      FROM sync_account_memberships m
      JOIN sync_accounts a
        ON a.id = m.account_id AND a.state = 'active' AND a.deleted_at IS NULL
      JOIN sync_devices d
        ON d.id = ? AND d.user_id = ? AND d.app_id = m.app_id AND d.revoked_at IS NULL
      JOIN sync_users u
        ON u.id = d.user_id AND u.state = 'active' AND u.deleted_at IS NULL
      JOIN sync_datasets s
        ON s.user_id = u.id AND s.app_id = m.app_id
      WHERE m.id = ? AND m.account_id = ? AND m.app_id = ?
        AND m.state = 'pending' AND m.sync_user_id IS NULL
        AND (
          ? IS NULL OR EXISTS (
            SELECT 1 FROM sync_account_devices ad
            WHERE ad.id = ? AND ad.account_id = a.id AND ad.revoked_at IS NULL
          )
        )
    `).bind(
      input.appDeviceId,
      input.syncUserId,
      input.membershipId,
      input.accountId,
      input.appId,
      input.accountDeviceId,
      input.accountDeviceId
    ).first();
    if (!candidate) return { status: 'invalid' };

    const linkDevice = db.prepare(`
      INSERT INTO sync_membership_device_links (
        account_id, membership_id, app_device_id, account_device_id, linked_at
      )
      SELECT m.account_id, m.id, d.id, ?, ?
      FROM sync_account_memberships m
      JOIN sync_accounts a ON a.id = m.account_id
      JOIN sync_devices d
        ON d.id = ? AND d.user_id = ? AND d.app_id = m.app_id AND d.revoked_at IS NULL
      JOIN sync_users u
        ON u.id = d.user_id AND u.state = 'active' AND u.deleted_at IS NULL
      JOIN sync_datasets s
        ON s.user_id = u.id AND s.app_id = m.app_id
      WHERE m.id = ? AND m.account_id = ? AND m.app_id = ?
        AND m.state = 'pending' AND m.sync_user_id IS NULL
        AND a.state = 'active' AND a.deleted_at IS NULL
        AND (
          ? IS NULL OR EXISTS (
            SELECT 1 FROM sync_account_devices ad
            WHERE ad.id = ? AND ad.account_id = a.id AND ad.revoked_at IS NULL
          )
        )
    `).bind(
      input.accountDeviceId,
      input.now,
      input.appDeviceId,
      input.syncUserId,
      input.membershipId,
      input.accountId,
      input.appId,
      input.accountDeviceId,
      input.accountDeviceId
    );
    const activate = db.prepare(`
      UPDATE sync_account_memberships
      SET state = 'active', sync_user_id = ?, recovery_mode = ?,
          generation = generation + 1, activated_at = ?, updated_at = ?
      WHERE id = ? AND account_id = ? AND app_id = ?
        AND state = 'pending' AND sync_user_id IS NULL
        AND EXISTS (
          SELECT 1 FROM sync_membership_device_links l
          WHERE l.membership_id = sync_account_memberships.id
            AND l.app_device_id = ?
            AND (l.account_device_id = ? OR (l.account_device_id IS NULL AND ? IS NULL))
        )
    `).bind(
      input.syncUserId,
      input.recoveryMode,
      input.now,
      input.now,
      input.membershipId,
      input.accountId,
      input.appId,
      input.appDeviceId,
      input.accountDeviceId,
      input.accountDeviceId
    );
    // The updated_at CHECK intentionally aborts the whole batch if either the
    // link or membership transition lost a race. No partial bridge may survive.
    const guard = db.prepare(`
      UPDATE sync_account_memberships
      SET updated_at = CASE
        WHEN state = 'active' AND sync_user_id = ? AND recovery_mode = ?
          AND EXISTS (
            SELECT 1 FROM sync_membership_device_links l
            WHERE l.membership_id = sync_account_memberships.id
              AND l.app_device_id = ?
              AND (l.account_device_id = ? OR (l.account_device_id IS NULL AND ? IS NULL))
          )
        THEN updated_at ELSE created_at - 1 END
      WHERE id = ? AND account_id = ? AND app_id = ?
    `).bind(
      input.syncUserId,
      input.recoveryMode,
      input.appDeviceId,
      input.accountDeviceId,
      input.accountDeviceId,
      input.membershipId,
      input.accountId,
      input.appId
    );

    try {
      const results = await db.batch([linkDevice, activate, guard]);
      if (!batchSucceeded(results, 3) || results.some((result) => changes(result) !== 1)) {
        throw new Error('D1 membership activation transaction was incomplete');
      }
      return { status: 'active', membershipId: input.membershipId, alreadyActive: false };
    } catch (error) {
      const finalState = await getMembershipActivation(input);
      if (finalState?.state === 'active' && finalState.sync_user_id === input.syncUserId &&
          finalState.recovery_mode === input.recoveryMode &&
          finalState.app_device_id === input.appDeviceId &&
          finalState.account_device_id === input.accountDeviceId) {
        return { status: 'active', membershipId: input.membershipId, alreadyActive: true };
      }
      if (!finalState || finalState.state !== 'pending') return { status: 'invalid' };
      throw error;
    }
  }

  return Object.freeze({
    createAccountBackbone,
    getStartOperation,
    getAccountSummary,
    prepareMembership,
    listAccountDevices,
    activateMembership
  });
}
