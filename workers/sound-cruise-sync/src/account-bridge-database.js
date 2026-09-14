const BRIDGE_PREPARE_TTL_MS = 24 * 60 * 60 * 1000;

function changes(result) {
  return Number(result?.meta?.changes || 0);
}

function batchSucceeded(results, expected) {
  return Array.isArray(results) && results.length === expected &&
    results.every((result) => result?.success !== false);
}

function publicBridge(row) {
  if (!row) return null;
  return {
    bridgeId: row.bridge_id,
    accountId: row.account_id,
    membershipId: row.membership_id,
    state: row.state,
    generation: Number(row.generation),
    accountRecoveryVersion: Number(row.account_recovery_version),
    recoveryAcknowledgedAt: row.recovery_acknowledged_at == null
      ? null : Number(row.recovery_acknowledged_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    expiresAt: Number(row.expires_at),
    dualCommittedAt: row.dual_committed_at == null ? null : Number(row.dual_committed_at),
    finalizedAt: row.finalized_at == null ? null : Number(row.finalized_at),
    rolledBackAt: row.rolled_back_at == null ? null : Number(row.rolled_back_at)
  };
}

function publicSummary(row) {
  if (!row) return null;
  return {
    appId: 'chord',
    appName: 'Chord Cruise',
    datasetState: row.dataset_state,
    recordCount: Number(row.record_count),
    chordCount: Number(row.chord_count),
    folderCount: Number(row.folder_count),
    activeDeviceCount: Number(row.active_device_count),
    manifestHash: row.manifest_hash,
    updatedAt: Number(row.dataset_updated_at),
    recoveryMode: row.membership_state === 'active' ? row.recovery_mode : 'legacy',
    membershipState: row.membership_state
  };
}

export function createD1ChordAccountBridgeRepository(db, clock = Date.now) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new Error('D1 Chord Account bridge session is unavailable');
  }

  async function readBridge(bridgeId) {
    return db.prepare(`
      SELECT b.*, m.state AS membership_state, m.recovery_mode,
             m.sync_user_id AS membership_sync_user_id, m.generation AS membership_generation,
             m.legacy_recovery_disabled_at,
             a.state AS account_state, a.generation AS account_generation,
             a.recovery_version AS current_account_recovery_version,
             a.recovery_verifier AS account_recovery_verifier,
             u.state AS user_state, u.recovery_version AS legacy_recovery_version,
             u.recovery_verifier AS legacy_recovery_verifier,
             d.revoked_at AS app_device_revoked_at,
             ad.revoked_at AS account_device_revoked_at,
             s.state AS dataset_state
      FROM sync_chord_account_bridges b
      JOIN sync_account_memberships m
        ON m.id = b.membership_id AND m.account_id = b.account_id AND m.app_id = 'chord'
      JOIN sync_accounts a ON a.id = b.account_id
      JOIN sync_users u ON u.id = b.sync_user_id
      JOIN sync_devices d ON d.id = b.app_device_id AND d.user_id = b.sync_user_id
      JOIN sync_account_devices ad
        ON ad.id = b.account_device_id AND ad.account_id = b.account_id
      JOIN sync_datasets s ON s.user_id = b.sync_user_id AND s.app_id = 'chord'
      WHERE b.bridge_id = ?
    `).bind(bridgeId).first();
  }

  async function readCurrent(identity) {
    return db.prepare(`
      SELECT b.*
      FROM sync_chord_account_bridges b
      WHERE b.account_id = ? AND b.account_device_id = ?
        AND b.sync_user_id = ? AND b.app_device_id = ?
        AND b.state IN ('prepared', 'dual', 'finalized')
      ORDER BY b.created_at DESC LIMIT 1
    `).bind(
      identity.accountId,
      identity.accountDeviceId,
      identity.syncUserId,
      identity.appDeviceId
    ).first();
  }

  async function readSummary(bridgeId) {
    const row = await db.prepare(`
      SELECT m.state AS membership_state, m.recovery_mode,
             s.state AS dataset_state, s.record_count, s.manifest_hash,
             s.updated_at AS dataset_updated_at,
             (SELECT COUNT(*) FROM sync_records r
              WHERE r.user_id = b.sync_user_id AND r.app_id = 'chord'
                AND r.record_type = 'chord' AND r.deleted_at IS NULL) AS chord_count,
             (SELECT COUNT(*) FROM sync_records r
              WHERE r.user_id = b.sync_user_id AND r.app_id = 'chord'
                AND r.record_type = 'folder' AND r.deleted_at IS NULL) AS folder_count,
             (SELECT COUNT(*) FROM sync_devices d
              WHERE d.user_id = b.sync_user_id AND d.app_id = 'chord'
                AND d.revoked_at IS NULL) AS active_device_count
      FROM sync_chord_account_bridges b
      JOIN sync_account_memberships m
        ON m.id = b.membership_id AND m.account_id = b.account_id
      JOIN sync_datasets s ON s.user_id = b.sync_user_id AND s.app_id = 'chord'
      WHERE b.bridge_id = ?
    `).bind(bridgeId).first();
    return publicSummary(row);
  }

  async function state(identity) {
    const row = await readCurrent(identity);
    if (!row) return { status: 'not_found' };
    return {
      status: 'ok',
      bridge: publicBridge(row),
      summary: await readSummary(row.bridge_id)
    };
  }

  async function resolvePrepareRetry(identity, input) {
    const byOperation = await db.prepare(`
      SELECT * FROM sync_chord_account_bridges WHERE prepare_operation_id = ?
    `).bind(input.operationId).first();
    if (byOperation) {
      if (byOperation.prepare_fingerprint !== input.requestFingerprint ||
          byOperation.account_id !== identity.accountId ||
          byOperation.sync_user_id !== identity.syncUserId ||
          byOperation.app_device_id !== identity.appDeviceId ||
          byOperation.account_device_id !== identity.accountDeviceId) {
        return { status: 'operation_conflict' };
      }
      return {
        status: byOperation.state,
        bridge: publicBridge(byOperation),
        summary: await readSummary(byOperation.bridge_id),
        alreadyPrepared: true
      };
    }
    return null;
  }

  async function prepare(identity, input) {
    const retry = await resolvePrepareRetry(identity, input);
    if (retry) return retry;

    const existing = await db.prepare(`
      SELECT * FROM sync_chord_account_bridges
      WHERE (sync_user_id = ? OR (account_id = ? AND membership_id = ?))
        AND state IN ('prepared', 'dual', 'finalized')
      LIMIT 1
    `).bind(identity.syncUserId, identity.accountId, input.membershipId).first();
    if (existing) {
      const sameOwners = existing.account_id === identity.accountId &&
        existing.membership_id === input.membershipId &&
        existing.sync_user_id === identity.syncUserId &&
        existing.app_device_id === identity.appDeviceId &&
        existing.account_device_id === identity.accountDeviceId;
      return sameOwners
        ? { status: 'bridge_exists', bridge: publicBridge(existing), summary: await readSummary(existing.bridge_id) }
        : { status: 'ownership_conflict' };
    }

    const eligible = await db.prepare(`
      SELECT a.generation AS account_generation, a.recovery_version AS account_recovery_version,
             m.generation AS membership_generation, u.recovery_version AS legacy_recovery_version
      FROM sync_accounts a
      JOIN sync_account_devices ad
        ON ad.id = ? AND ad.account_id = a.id AND ad.revoked_at IS NULL
      JOIN sync_account_memberships m
        ON m.account_id = a.id AND m.id = ? AND m.app_id = 'chord'
      JOIN sync_users u ON u.id = ? AND u.state = 'active' AND u.deleted_at IS NULL
      JOIN sync_devices d
        ON d.id = ? AND d.user_id = u.id AND d.app_id = 'chord' AND d.revoked_at IS NULL
      JOIN sync_datasets s
        ON s.user_id = u.id AND s.app_id = 'chord' AND s.state = 'ready'
      WHERE a.id = ? AND a.state = 'active' AND a.deleted_at IS NULL
        AND a.generation = ? AND a.recovery_version >= 1 AND a.recovery_verifier IS NOT NULL
        AND m.state = 'pending' AND m.sync_user_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM sync_account_managed_users am WHERE am.sync_user_id = u.id)
        AND NOT EXISTS (
          SELECT 1 FROM recovery_claims r
          WHERE r.user_id = u.id AND r.target_app_id = 'chord'
            AND r.committed_at IS NULL AND r.cancelled_at IS NULL AND r.expires_at > ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM account_delete_intents i
          WHERE i.user_id = u.id AND i.app_id = 'chord'
            AND i.consumed_at IS NULL AND i.expires_at > ?
        )
    `).bind(
      identity.accountDeviceId,
      input.membershipId,
      identity.syncUserId,
      identity.appDeviceId,
      identity.accountId,
      input.expectedAccountGeneration,
      input.now,
      input.now
    ).first();
    if (!eligible) return { status: 'ineligible' };

    const expiresAt = input.now + BRIDGE_PREPARE_TTL_MS;
    try {
      const result = await db.prepare(`
        INSERT INTO sync_chord_account_bridges (
          bridge_id, account_id, membership_id, sync_user_id, app_device_id,
          account_device_id, state, generation, expected_account_generation,
          expected_membership_generation, expected_legacy_recovery_version,
          account_recovery_version, recovery_acknowledged_at,
          prepare_operation_id, prepare_fingerprint,
          dual_operation_id, dual_fingerprint, finalize_operation_id,
          finalize_fingerprint, rollback_operation_id, rollback_fingerprint,
          created_at, updated_at, expires_at, dual_committed_at, finalized_at, rolled_back_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'prepared', 1, ?, ?, ?, ?, NULL, ?, ?,
                  NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, NULL, NULL, NULL)
      `).bind(
        input.bridgeId,
        identity.accountId,
        input.membershipId,
        identity.syncUserId,
        identity.appDeviceId,
        identity.accountDeviceId,
        Number(eligible.account_generation),
        Number(eligible.membership_generation),
        Number(eligible.legacy_recovery_version),
        Number(eligible.account_recovery_version),
        input.operationId,
        input.requestFingerprint,
        input.now,
        input.now,
        expiresAt
      ).run();
      if (result?.success === false || changes(result) !== 1) throw new Error('Bridge prepare failed');
      const row = await readBridge(input.bridgeId);
      return {
        status: 'prepared',
        bridge: publicBridge(row),
        summary: await readSummary(input.bridgeId),
        alreadyPrepared: false
      };
    } catch (error) {
      const raced = await db.prepare(`
        SELECT * FROM sync_chord_account_bridges
        WHERE (sync_user_id = ? OR (account_id = ? AND membership_id = ?))
          AND state IN ('prepared', 'dual', 'finalized') LIMIT 1
      `).bind(identity.syncUserId, identity.accountId, input.membershipId).first();
      if (raced) {
        const sameOwners = raced.account_id === identity.accountId &&
          raced.membership_id === input.membershipId && raced.sync_user_id === identity.syncUserId &&
          raced.app_device_id === identity.appDeviceId &&
          raced.account_device_id === identity.accountDeviceId;
        return sameOwners
          ? { status: 'bridge_exists', bridge: publicBridge(raced), summary: await readSummary(raced.bridge_id) }
          : { status: 'ownership_conflict' };
      }
      throw error;
    }
  }

  async function resolveTransitionRetry(kind, identity, input) {
    const fields = {
      dual: ['dual_operation_id', 'dual_fingerprint', ['dual', 'finalized']],
      finalize: ['finalize_operation_id', 'finalize_fingerprint', ['finalized']],
      rollback: ['rollback_operation_id', 'rollback_fingerprint', ['rolled_back']]
    }[kind];
    const row = await readBridge(input.bridgeId);
    if (!row || row.account_id !== identity.accountId || row.sync_user_id !== identity.syncUserId ||
        row.app_device_id !== identity.appDeviceId || row.account_device_id !== identity.accountDeviceId) {
      return { status: 'not_found' };
    }
    if (row[fields[0]] == null) return null;
    if (row[fields[0]] !== input.operationId || row[fields[1]] !== input.requestFingerprint) {
      return { status: 'operation_conflict' };
    }
    if (!fields[2].includes(row.state)) return { status: 'operation_conflict' };
    return { status: row.state, bridge: publicBridge(row), alreadyApplied: true };
  }

  async function commitDual(identity, input) {
    const retry = await resolveTransitionRetry('dual', identity, input);
    if (retry) return retry;
    const row = await readBridge(input.bridgeId);
    if (!row || row.account_id !== identity.accountId || row.sync_user_id !== identity.syncUserId ||
        row.app_device_id !== identity.appDeviceId || row.account_device_id !== identity.accountDeviceId) {
      return { status: 'not_found' };
    }
    if (row.state !== 'prepared' || Number(row.expires_at) <= input.now ||
        Number(row.generation) !== input.expectedBridgeGeneration ||
        Number(row.account_generation) !== Number(row.expected_account_generation) ||
        Number(row.membership_generation) !== Number(row.expected_membership_generation) ||
        Number(row.current_account_recovery_version) !== input.accountRecoveryVersion ||
        Number(row.account_recovery_version) !== input.accountRecoveryVersion || !input.recoverySaved ||
        row.account_state !== 'active' || row.user_state !== 'active' || row.dataset_state !== 'ready' ||
        row.membership_state !== 'pending' || row.membership_sync_user_id != null ||
        row.app_device_revoked_at != null || row.account_device_revoked_at != null ||
        Number(row.legacy_recovery_version) !== Number(row.expected_legacy_recovery_version)) {
      return { status: 'precondition_failed' };
    }
    const activeRecovery = await db.prepare(`
      SELECT 'recovery' AS conflict FROM recovery_claims
      WHERE user_id = ? AND target_app_id = 'chord'
        AND committed_at IS NULL AND cancelled_at IS NULL AND expires_at > ?
      UNION ALL
      SELECT 'delete' AS conflict FROM account_delete_intents
      WHERE user_id = ? AND app_id = 'chord'
        AND consumed_at IS NULL AND expires_at > ?
      LIMIT 1
    `).bind(identity.syncUserId, input.now, identity.syncUserId, input.now).first();
    if (activeRecovery) return { status: 'recovery_active' };

    const linkDevice = db.prepare(`
      INSERT INTO sync_membership_device_links (
        account_id, membership_id, app_device_id, account_device_id, linked_at
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(identity.accountId, row.membership_id, identity.appDeviceId, identity.accountDeviceId, input.now);
    const activate = db.prepare(`
      UPDATE sync_account_memberships
      SET state = 'active', sync_user_id = ?, recovery_mode = 'dual',
          generation = CASE
            WHEN state = 'pending' AND sync_user_id IS NULL AND generation = ?
            THEN generation + 1 ELSE 0 END,
          activated_at = ?, updated_at = ?
      WHERE id = ? AND account_id = ? AND app_id = 'chord'
    `).bind(
      identity.syncUserId,
      Number(row.expected_membership_generation),
      input.now,
      input.now,
      row.membership_id,
      identity.accountId
    );
    const bumpAccount = db.prepare(`
      UPDATE sync_accounts
      SET generation = CASE
            WHEN state = 'active' AND deleted_at IS NULL AND generation = ?
              AND recovery_version = ? AND recovery_verifier IS NOT NULL
            THEN generation + 1 ELSE 0 END,
          updated_at = ?
      WHERE id = ?
    `).bind(
      Number(row.expected_account_generation),
      input.accountRecoveryVersion,
      input.now,
      identity.accountId
    );
    const finish = db.prepare(`
      UPDATE sync_chord_account_bridges
      SET state = 'dual', generation = generation + 1,
          expected_account_generation = expected_account_generation + 1,
          expected_membership_generation = expected_membership_generation + 1,
          recovery_acknowledged_at = ?, dual_operation_id = ?, dual_fingerprint = ?,
          updated_at = ?, dual_committed_at = ?
      WHERE bridge_id = ? AND state = 'prepared' AND generation = ?
        AND dual_operation_id IS NULL
        AND EXISTS (
          SELECT 1 FROM sync_account_memberships m
          WHERE m.id = membership_id AND m.account_id = account_id AND m.state = 'active'
            AND m.sync_user_id = sync_chord_account_bridges.sync_user_id
            AND m.recovery_mode = 'dual'
        )
    `).bind(
      input.now,
      input.operationId,
      input.requestFingerprint,
      input.now,
      input.now,
      input.bridgeId,
      input.expectedBridgeGeneration
    );
    const guard = db.prepare(`
      UPDATE sync_chord_account_bridges
      SET updated_at = CASE
        WHEN state = 'dual' AND dual_operation_id = ? AND dual_fingerprint = ?
        THEN updated_at ELSE created_at - 1 END
      WHERE bridge_id = ?
    `).bind(input.operationId, input.requestFingerprint, input.bridgeId);
    try {
      const results = await db.batch([linkDevice, activate, bumpAccount, finish, guard]);
      if (!batchSucceeded(results, 5) || results.some((result) => changes(result) !== 1)) {
        throw new Error('D1 bridge dual commit transaction was incomplete');
      }
      return { status: 'dual', bridge: publicBridge(await readBridge(input.bridgeId)), alreadyApplied: false };
    } catch (error) {
      const raced = await resolveTransitionRetry('dual', identity, input);
      if (raced) return raced;
      throw error;
    }
  }

  async function finalizeMaterial(identity, bridgeId) {
    const row = await readBridge(bridgeId);
    if (!row || row.account_id !== identity.accountId || row.sync_user_id !== identity.syncUserId ||
        row.app_device_id !== identity.appDeviceId || row.account_device_id !== identity.accountDeviceId) return null;
    return {
      state: row.state,
      accountRecoveryVerifier: row.account_recovery_verifier,
      legacyRecoveryVerifier: row.legacy_recovery_verifier
    };
  }

  async function finalize(identity, input) {
    const retry = await resolveTransitionRetry('finalize', identity, input);
    if (retry) return retry;
    const row = await readBridge(input.bridgeId);
    if (!row || row.account_id !== identity.accountId || row.sync_user_id !== identity.syncUserId ||
        row.app_device_id !== identity.appDeviceId || row.account_device_id !== identity.accountDeviceId) {
      return { status: 'not_found' };
    }
    if (row.state !== 'dual' || Number(row.generation) !== input.expectedBridgeGeneration ||
        row.account_state !== 'active' || row.user_state !== 'active' || row.dataset_state !== 'ready' ||
        row.app_device_revoked_at != null || row.account_device_revoked_at != null ||
        row.membership_state !== 'active' || row.recovery_mode !== 'dual' ||
        row.membership_sync_user_id !== identity.syncUserId ||
        Number(row.account_generation) !== Number(row.expected_account_generation) ||
        Number(row.membership_generation) !== Number(row.expected_membership_generation) ||
        Number(row.current_account_recovery_version) !== Number(row.account_recovery_version) ||
        Number(row.legacy_recovery_version) !== Number(row.expected_legacy_recovery_version) ||
        row.recovery_acknowledged_at == null ||
        input.legacyRecoveryVerifier !== row.legacy_recovery_verifier) {
      return { status: 'precondition_failed' };
    }
    const activeRecovery = await db.prepare(`
      SELECT claim_id FROM recovery_claims
      WHERE user_id = ? AND target_app_id = 'chord'
        AND committed_at IS NULL AND cancelled_at IS NULL AND expires_at > ? LIMIT 1
    `).bind(identity.syncUserId, input.now).first();
    if (activeRecovery) return { status: 'recovery_active' };

    const rotateLegacy = db.prepare(`
      UPDATE sync_users
      SET recovery_version = CASE
            WHEN state = 'active' AND deleted_at IS NULL AND recovery_version = ?
              AND recovery_verifier = ?
            THEN recovery_version + 1 ELSE 0 END,
          recovery_verifier = ?,
          recovery_rotated_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      Number(row.expected_legacy_recovery_version),
      input.legacyRecoveryVerifier,
      input.disabledLegacyRecoveryVerifier,
      input.now,
      input.now,
      identity.syncUserId
    );
    const cancelClaims = db.prepare(`
      UPDATE recovery_claims SET cancelled_at = COALESCE(cancelled_at, ?)
      WHERE user_id = ? AND committed_at IS NULL AND cancelled_at IS NULL
    `).bind(input.now, identity.syncUserId);
    const clearAttempts = db.prepare(`
      DELETE FROM recovery_attempts WHERE recovery_verifier = ?
    `).bind(input.legacyRecoveryVerifier);
    const markManaged = db.prepare(`
      INSERT INTO sync_account_managed_users (
        sync_user_id, account_id, membership_id, app_id, created_at
      ) VALUES (?, ?, ?, 'chord', ?)
    `).bind(identity.syncUserId, identity.accountId, row.membership_id, input.now);
    const updateMembership = db.prepare(`
      UPDATE sync_account_memberships
      SET recovery_mode = 'account', legacy_recovery_disabled_at = ?,
          generation = CASE
            WHEN state = 'active' AND sync_user_id = ? AND recovery_mode = 'dual'
              AND generation = ?
              AND EXISTS (
                SELECT 1 FROM sync_membership_device_links l
                JOIN sync_devices d ON d.id = l.app_device_id
                WHERE l.membership_id = sync_account_memberships.id
                  AND l.app_device_id = ? AND l.account_device_id = ?
                  AND d.revoked_at IS NULL
              )
            THEN generation + 1 ELSE 0 END,
          updated_at = ?
      WHERE id = ? AND account_id = ? AND app_id = 'chord'
    `).bind(
      input.now,
      identity.syncUserId,
      Number(row.expected_membership_generation),
      identity.appDeviceId,
      identity.accountDeviceId,
      input.now,
      row.membership_id,
      identity.accountId
    );
    const bumpAccount = db.prepare(`
      UPDATE sync_accounts
      SET generation = CASE
            WHEN state = 'active' AND deleted_at IS NULL AND generation = ?
              AND recovery_version = ? AND recovery_verifier = ?
            THEN generation + 1 ELSE 0 END,
          updated_at = ?
      WHERE id = ?
    `).bind(
      Number(row.expected_account_generation),
      Number(row.account_recovery_version),
      row.account_recovery_verifier,
      input.now,
      identity.accountId
    );
    const finish = db.prepare(`
      UPDATE sync_chord_account_bridges
      SET state = 'finalized', generation = generation + 1,
          expected_account_generation = expected_account_generation + 1,
          expected_membership_generation = expected_membership_generation + 1,
          expected_legacy_recovery_version = expected_legacy_recovery_version + 1,
          finalize_operation_id = ?, finalize_fingerprint = ?,
          updated_at = ?, finalized_at = ?
      WHERE bridge_id = ? AND state = 'dual' AND generation = ?
        AND finalize_operation_id IS NULL
        AND EXISTS (
          SELECT 1 FROM sync_account_memberships m
          WHERE m.id = membership_id AND m.account_id = account_id
            AND m.state = 'active' AND m.recovery_mode = 'account'
            AND m.legacy_recovery_disabled_at = ?
        )
    `).bind(
      input.operationId,
      input.requestFingerprint,
      input.now,
      input.now,
      input.bridgeId,
      input.expectedBridgeGeneration,
      input.now
    );
    const guard = db.prepare(`
      UPDATE sync_chord_account_bridges
      SET updated_at = CASE
        WHEN state = 'finalized' AND finalize_operation_id = ? AND finalize_fingerprint = ?
        THEN updated_at ELSE created_at - 1 END
      WHERE bridge_id = ?
    `).bind(input.operationId, input.requestFingerprint, input.bridgeId);
    try {
      const results = await db.batch([
        rotateLegacy, cancelClaims, clearAttempts, markManaged,
        updateMembership, bumpAccount, finish, guard
      ]);
      const exact = [0, 3, 4, 5, 6, 7];
      if (!batchSucceeded(results, 8) || exact.some((index) => changes(results[index]) !== 1)) {
        throw new Error('D1 bridge finalize transaction was incomplete');
      }
      return { status: 'finalized', bridge: publicBridge(await readBridge(input.bridgeId)), alreadyApplied: false };
    } catch (error) {
      const raced = await resolveTransitionRetry('finalize', identity, input);
      if (raced) return raced;
      throw error;
    }
  }

  async function rollback(identity, input) {
    const retry = await resolveTransitionRetry('rollback', identity, input);
    if (retry) return retry;
    const row = await readBridge(input.bridgeId);
    if (!row || row.account_id !== identity.accountId || row.sync_user_id !== identity.syncUserId ||
        row.app_device_id !== identity.appDeviceId || row.account_device_id !== identity.accountDeviceId) {
      return { status: 'not_found' };
    }
    if (row.state === 'finalized') return { status: 'forward_only' };
    if (!['prepared', 'dual'].includes(row.state) ||
        Number(row.generation) !== input.expectedBridgeGeneration) {
      return { status: 'precondition_failed' };
    }

    if (row.state === 'prepared') {
      const result = await db.prepare(`
        UPDATE sync_chord_account_bridges
        SET state = 'rolled_back', generation = generation + 1,
            rollback_operation_id = ?, rollback_fingerprint = ?,
            updated_at = ?, rolled_back_at = ?
        WHERE bridge_id = ? AND state = 'prepared' AND generation = ?
      `).bind(
        input.operationId,
        input.requestFingerprint,
        input.now,
        input.now,
        input.bridgeId,
        input.expectedBridgeGeneration
      ).run();
      if (result?.success === false || changes(result) !== 1) {
        const raced = await resolveTransitionRetry('rollback', identity, input);
        return raced || { status: 'precondition_failed' };
      }
      return { status: 'rolled_back', bridge: publicBridge(await readBridge(input.bridgeId)), alreadyApplied: false };
    }

    const resetMembership = db.prepare(`
      UPDATE sync_account_memberships
      SET state = 'pending', sync_user_id = NULL, recovery_mode = 'account',
          generation = CASE
            WHEN state = 'active' AND sync_user_id = ? AND recovery_mode = 'dual'
              AND generation = ?
              AND EXISTS (
                SELECT 1 FROM sync_membership_device_links l
                WHERE l.account_id = sync_account_memberships.account_id
                  AND l.membership_id = sync_account_memberships.id
                  AND l.app_device_id = ? AND l.account_device_id = ?
              )
            THEN generation + 1 ELSE 0 END,
          activated_at = NULL, updated_at = ?,
          legacy_recovery_disabled_at = NULL
      WHERE id = ? AND account_id = ? AND app_id = 'chord'
    `).bind(
      identity.syncUserId,
      Number(row.expected_membership_generation),
      identity.appDeviceId,
      identity.accountDeviceId,
      input.now,
      row.membership_id,
      identity.accountId
    );
    const unlink = db.prepare(`
      DELETE FROM sync_membership_device_links
      WHERE account_id = ? AND membership_id = ? AND app_device_id = ?
        AND account_device_id = ?
    `).bind(identity.accountId, row.membership_id, identity.appDeviceId, identity.accountDeviceId);
    const bumpAccount = db.prepare(`
      UPDATE sync_accounts
      SET generation = CASE
            WHEN state = 'active' AND deleted_at IS NULL AND generation = ?
            THEN generation + 1 ELSE 0 END,
          updated_at = ?
      WHERE id = ?
    `).bind(Number(row.expected_account_generation), input.now, identity.accountId);
    const finish = db.prepare(`
      UPDATE sync_chord_account_bridges
      SET state = 'rolled_back', generation = generation + 1,
          rollback_operation_id = ?, rollback_fingerprint = ?,
          updated_at = ?, rolled_back_at = ?
      WHERE bridge_id = ? AND state = 'dual' AND generation = ?
        AND EXISTS (
          SELECT 1 FROM sync_account_memberships m
          WHERE m.id = membership_id AND m.account_id = account_id
            AND m.state = 'pending' AND m.sync_user_id IS NULL
        )
    `).bind(
      input.operationId,
      input.requestFingerprint,
      input.now,
      input.now,
      input.bridgeId,
      input.expectedBridgeGeneration
    );
    const guard = db.prepare(`
      UPDATE sync_chord_account_bridges
      SET updated_at = CASE
        WHEN state = 'rolled_back' AND rollback_operation_id = ? AND rollback_fingerprint = ?
        THEN updated_at ELSE created_at - 1 END
      WHERE bridge_id = ?
    `).bind(input.operationId, input.requestFingerprint, input.bridgeId);
    try {
      const results = await db.batch([resetMembership, unlink, bumpAccount, finish, guard]);
      if (!batchSucceeded(results, 5) || results.some((result) => changes(result) !== 1)) {
        throw new Error('D1 bridge rollback transaction was incomplete');
      }
      return { status: 'rolled_back', bridge: publicBridge(await readBridge(input.bridgeId)), alreadyApplied: false };
    } catch (error) {
      const raced = await resolveTransitionRetry('rollback', identity, input);
      if (raced) return raced;
      throw error;
    }
  }

  return Object.freeze({
    state,
    resolvePrepareRetry,
    prepare,
    resolveTransitionRetry,
    commitDual,
    finalizeMaterial,
    finalize,
    rollback,
    readBridge,
    readSummary,
    BRIDGE_PREPARE_TTL_MS
  });
}
