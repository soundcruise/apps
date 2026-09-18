import { canonicalJson, manifestHash } from './records.js';

function resultsOf(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function successfulBatch(results, expected) {
  return Array.isArray(results) && results.length === expected && results.every((result) => result?.success !== false);
}

function rowToRecord(row) {
  if (!row) return null;
  return {
    recordType: row.record_type,
    recordId: row.record_id,
    schemaVersion: row.schema_version,
    revision: row.revision,
    payload: row.payload_json == null ? null : JSON.parse(row.payload_json),
    payloadHash: row.payload_hash,
    deletedAt: row.deleted_at == null ? null : row.deleted_at,
    operationId: row.operation_id || row.last_operation_id || null,
    changeSeq: row.change_seq == null ? null : row.change_seq
  };
}

export function createD1SyncRepository(db, clock = Date.now) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new Error('D1 session is unavailable');
  }

  async function getDataset(userId, appId) {
    return db.prepare(`
      SELECT state, schema_version, record_count, manifest_hash, min_change_seq,
             last_change_seq, updated_at
      FROM sync_datasets WHERE user_id = ? AND app_id = ?
    `).bind(userId, appId).first();
  }

  async function bootstrapDataset(identity, initial) {
    const managed = await db.prepare(`
      SELECT 1 AS allowed
      FROM sync_account_managed_users
      WHERE sync_user_id = ? AND app_id = ?
    `).bind(identity.userId, identity.appId).first();
    if (!managed) return { status: 'forbidden' };
    const existing = await getDataset(identity.userId, identity.appId);
    if (existing) return { status: 'ready', dataset: existing, alreadyCreated: true };
    const result = await db.prepare(`
      INSERT INTO sync_datasets (
        user_id, app_id, state, schema_version, record_count, manifest_hash,
        min_change_seq, last_change_seq, initialized_at, updated_at
      ) VALUES (?, ?, 'initializing', ?, ?, ?, 0, 0, NULL, ?)
      ON CONFLICT(user_id, app_id) DO NOTHING
    `).bind(
      identity.userId,
      identity.appId,
      initial.schemaVersion,
      initial.recordCount,
      initial.manifestHash,
      clock()
    ).run();
    if (result?.success === false) throw new Error('D1 bootstrap failed');
    const dataset = await getDataset(identity.userId, identity.appId);
    return dataset
      ? { status: 'ready', dataset, alreadyCreated: Number(result?.meta?.changes || 0) === 0 }
      : { status: 'failed' };
  }

  async function getChangeByOperation(userId, appId, operationId) {
    const row = await db.prepare(`
      SELECT change_seq, record_type, record_id, schema_version, revision,
             operation_id, operation_hash, payload_json, payload_hash, deleted_at
      FROM sync_changes
      WHERE user_id = ? AND app_id = ? AND operation_id = ?
    `).bind(userId, appId, operationId).first();
    if (!row) return null;
    const record = rowToRecord(row);
    record.operationHash = row.operation_hash;
    return record;
  }

  async function getRecord(userId, appId, recordType, recordId) {
    const row = await db.prepare(`
      SELECT record_type, record_id, schema_version, revision, payload_json,
             payload_hash, deleted_at, last_operation_id
      FROM sync_records
      WHERE user_id = ? AND app_id = ? AND record_type = ? AND record_id = ?
    `).bind(userId, appId, recordType, recordId).first();
    return rowToRecord(row);
  }

  async function applyOperation(identity, operation) {
    const existing = await getChangeByOperation(identity.userId, identity.appId, operation.operationId);
    if (existing) {
      return existing.operationHash === operation.operationHash
        ? { status: 'duplicate', record: existing }
        : { status: 'invalid', code: 'operation_id_reused' };
    }
    if (operation.baseRevision !== 0) {
      const current = await getRecord(identity.userId, identity.appId, operation.recordType, operation.recordId);
      if (!current) return { status: 'conflict', record: null };
    }
    const now = clock();
    const payloadJson = operation.deleted ? null : canonicalJson(operation.payload);
    const deletedAt = operation.deleted ? now : null;
    const upsert = db.prepare(`
      INSERT INTO sync_records (
        user_id, app_id, record_type, record_id, payload_json, payload_hash,
        revision, updated_at, deleted_at, updated_by_device_id, last_operation_id,
        schema_version
      )
      SELECT ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM sync_devices d
        JOIN sync_users u ON u.id = d.user_id
        WHERE d.id = ? AND d.user_id = ? AND d.app_id = ?
          AND d.revoked_at IS NULL AND u.state IN ('provisioning', 'active')
      )
      ON CONFLICT(user_id, app_id, record_type, record_id) DO UPDATE SET
        payload_json = excluded.payload_json,
        payload_hash = excluded.payload_hash,
        revision = sync_records.revision + 1,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        updated_by_device_id = excluded.updated_by_device_id,
        last_operation_id = excluded.last_operation_id,
        schema_version = excluded.schema_version
      WHERE sync_records.revision = ?
        AND sync_records.last_operation_id <> excluded.last_operation_id
        AND EXISTS (
          SELECT 1 FROM sync_devices d
          JOIN sync_users u ON u.id = d.user_id
          WHERE d.id = ? AND d.user_id = ? AND d.app_id = ?
            AND d.revoked_at IS NULL AND u.state IN ('provisioning', 'active')
        )
    `).bind(
      identity.userId, identity.appId, operation.recordType, operation.recordId,
      payloadJson, operation.payloadHash, now, deletedAt, identity.deviceId,
      operation.operationId, operation.schemaVersion,
      identity.deviceId, identity.userId, identity.appId,
      operation.baseRevision, identity.deviceId, identity.userId, identity.appId
    );
    const insertChange = db.prepare(`
      INSERT INTO sync_changes (
        user_id, app_id, record_type, record_id, revision, operation_id,
        operation_hash, payload_json, payload_hash, deleted_at, changed_at,
        schema_version
      )
      SELECT user_id, app_id, record_type, record_id, revision, ?, ?, payload_json,
             payload_hash, deleted_at, ?, schema_version
      FROM sync_records
      WHERE user_id = ? AND app_id = ? AND record_type = ? AND record_id = ?
        AND last_operation_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM sync_changes
          WHERE user_id = ? AND app_id = ? AND operation_id = ?
        )
    `).bind(
      operation.operationId, operation.operationHash, now,
      identity.userId, identity.appId, operation.recordType, operation.recordId,
      operation.operationId, identity.userId, identity.appId, operation.operationId
    );
    const updateDataset = db.prepare(`
      UPDATE sync_datasets SET
        record_count = (
          SELECT COUNT(*) FROM sync_records
          WHERE user_id = ? AND app_id = ? AND deleted_at IS NULL
        ),
        manifest_hash = NULL,
        last_change_seq = COALESCE((
          SELECT MAX(change_seq) FROM sync_changes WHERE user_id = ? AND app_id = ?
        ), last_change_seq),
        updated_at = ?
      WHERE user_id = ? AND app_id = ?
        AND EXISTS (
          SELECT 1 FROM sync_changes
          WHERE user_id = ? AND app_id = ? AND operation_id = ?
        )
    `).bind(
      identity.userId, identity.appId, identity.userId, identity.appId, now,
      identity.userId, identity.appId, identity.userId, identity.appId,
      operation.operationId
    );
    const batch = await db.batch([upsert, insertChange, updateDataset]);
    if (!successfulBatch(batch, 3)) throw new Error('D1 operation transaction failed');
    const applied = await getChangeByOperation(identity.userId, identity.appId, operation.operationId);
    if (applied) {
      return applied.operationHash === operation.operationHash
        ? { status: 'applied', record: applied }
        : { status: 'invalid', code: 'operation_id_reused' };
    }
    const stillAuthorized = await db.prepare(`
      SELECT 1 AS allowed FROM sync_devices d
      JOIN sync_users u ON u.id = d.user_id
      WHERE d.id = ? AND d.user_id = ? AND d.app_id = ?
        AND d.revoked_at IS NULL AND u.state IN ('provisioning', 'active')
    `).bind(identity.deviceId, identity.userId, identity.appId).first();
    if (!stillAuthorized) return { status: 'forbidden', code: 'credential_inactive' };
    return {
      status: 'conflict',
      record: await getRecord(identity.userId, identity.appId, operation.recordType, operation.recordId)
    };
  }

  async function listChanges(identity, afterSequence, limit) {
    const result = await db.prepare(`
      SELECT change_seq, record_type, record_id, schema_version, revision,
             operation_id, payload_json, payload_hash, deleted_at
      FROM sync_changes
      WHERE user_id = ? AND app_id = ? AND change_seq > ?
      ORDER BY change_seq ASC LIMIT ?
    `).bind(identity.userId, identity.appId, afterSequence, limit + 1).all();
    const rows = resultsOf(result);
    return {
      changes: rows.slice(0, limit).map(rowToRecord),
      hasMore: rows.length > limit
    };
  }

  async function readSnapshot(identity) {
    const recordsStatement = db.prepare(`
      SELECT record_type, record_id, schema_version, revision, payload_json,
             payload_hash, deleted_at, last_operation_id
      FROM sync_records
      WHERE user_id = ? AND app_id = ?
      ORDER BY record_type ASC, record_id ASC
    `).bind(identity.userId, identity.appId);
    const datasetStatement = db.prepare(`
      SELECT state, schema_version, record_count, manifest_hash, min_change_seq,
             last_change_seq, updated_at
      FROM sync_datasets WHERE user_id = ? AND app_id = ?
    `).bind(identity.userId, identity.appId);
    const batch = await db.batch([recordsStatement, datasetStatement]);
    if (!successfulBatch(batch, 2)) throw new Error('D1 snapshot transaction failed');
    const records = resultsOf(batch[0]).map(rowToRecord);
    const dataset = resultsOf(batch[1])[0];
    if (!dataset) throw new Error('Sync dataset does not exist');
    const liveRecords = records.filter((record) => record.deletedAt == null);
    return {
      dataset,
      records,
      recordCount: liveRecords.length,
      manifestHash: await manifestHash(liveRecords, dataset.schema_version, crypto, identity.appId)
    };
  }

  async function completeMigration(identity, expected) {
    const snapshot = await readSnapshot(identity);
    if (snapshot.recordCount !== expected.recordCount || snapshot.manifestHash !== expected.manifestHash) {
      return { status: 'mismatch', snapshot };
    }
    const now = clock();
    const result = await db.prepare(`
      UPDATE sync_datasets SET state = 'ready', record_count = ?, manifest_hash = ?,
             initialized_at = COALESCE(initialized_at, ?), updated_at = ?
      WHERE user_id = ? AND app_id = ? AND last_change_seq = ?
    `).bind(
      snapshot.recordCount, snapshot.manifestHash, now, now,
      identity.userId, identity.appId, snapshot.dataset.last_change_seq
    ).run();
    if (result?.success === false) throw new Error('D1 migration completion failed');
    if ((result?.meta?.changes ?? 1) < 1) return { status: 'retry' };
    return { status: 'ready', snapshot };
  }

  async function reportRemovalSafety(identity, authority, state) {
    if (!authority || authority.accountState !== 'active' || authority.membershipState !== 'active' ||
        authority.datasetState !== 'ready') return { status: 'unavailable' };
    const now = clock();
    const lastSuccessfulSyncAt = state === 'clean' ? now : null;
    const result = await db.prepare(`
      INSERT INTO sync_app_device_sync_safety
        (app_device_id, account_id, membership_id, app_id, state, last_successful_sync_at, reported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(app_device_id) DO UPDATE SET
        state = excluded.state,
        last_successful_sync_at = CASE WHEN excluded.state = 'clean'
          THEN excluded.last_successful_sync_at ELSE sync_app_device_sync_safety.last_successful_sync_at END,
        reported_at = excluded.reported_at
      WHERE sync_app_device_sync_safety.account_id = excluded.account_id
        AND sync_app_device_sync_safety.membership_id = excluded.membership_id
        AND sync_app_device_sync_safety.app_id = excluded.app_id
    `).bind(identity.deviceId, authority.accountId, authority.membershipId, identity.appId,
      state, lastSuccessfulSyncAt, now).run();
    if (result?.success === false) throw new Error('D1 safety report failed');
    return { status: 'reported' };
  }

  return Object.freeze({
    getDataset,
    bootstrapDataset,
    getChangeByOperation,
    getRecord,
    applyOperation,
    listChanges,
    readSnapshot,
    completeMigration,
    reportRemovalSafety
  });
}
