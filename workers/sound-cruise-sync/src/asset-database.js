import { ASSET_QUOTA } from './asset-validation.js';

function changes(result) { return Number(result?.meta?.changes || 0); }

function publicAsset(row) {
  if (!row) return null;
  return Object.freeze({
    assetId: row.asset_id, kind: row.kind, hash: row.content_hash,
    mime: row.mime_type, byteSize: Number(row.byte_size),
    width: Number(row.width), height: Number(row.height),
    objectVersion: Number(row.object_version), availability: row.state === 'available' ? 'available' : row.state
  });
}

export function createD1AssetRepository(db) {
  if (!db?.prepare || !db?.batch) throw new Error('D1 asset session is unavailable');

  async function operation(operationId) {
    return db.prepare(`
      SELECT o.operation_id, o.request_fingerprint, o.account_id, o.sync_user_id,
             o.app_device_id, a.* FROM sync_asset_operations o
      JOIN sync_assets a ON a.asset_id = o.asset_id WHERE o.operation_id = ?
    `).bind(operationId).first();
  }

  async function prepare(identity, authority, input) {
    const previous = await operation(input.operationId);
    if (previous) {
      return previous.account_id === authority.accountId && previous.sync_user_id === identity.userId &&
        previous.app_device_id === identity.deviceId && previous.request_fingerprint === input.fingerprint &&
        previous.asset_id === input.assetId ? { status: previous.state, asset: publicAsset(previous) } : { status: 'conflict' };
    }
    const collision = await db.prepare('SELECT account_id, sync_user_id FROM sync_assets WHERE asset_id = ?')
      .bind(input.assetId).first();
    if (collision) return { status: 'conflict' };
    const quota = await db.prepare(`
      SELECT COUNT(*) AS asset_count, COALESCE(SUM(byte_size), 0) AS total_bytes
      FROM sync_assets WHERE account_id = ? AND state <> 'deleted'
    `).bind(authority.accountId).first();
    if (Number(quota?.asset_count || 0) >= ASSET_QUOTA.maxCount ||
        Number(quota?.total_bytes || 0) + input.byteSize > ASSET_QUOTA.maxBytes) return { status: 'quota' };
    const now = input.now;
    const statements = [
      db.prepare(`INSERT INTO sync_assets (
        asset_id, account_id, membership_id, sync_user_id, kind, state,
        content_hash, mime_type, byte_size, width, height, object_key,
        object_version, created_by_device_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'prepared', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`)
        .bind(input.assetId, authority.accountId, authority.membershipId, identity.userId,
          input.kind, input.hash, input.mime, input.byteSize, input.width, input.height,
          input.objectKey, identity.deviceId, now, now),
      db.prepare(`INSERT INTO sync_asset_operations (
        operation_id, asset_id, account_id, sync_user_id, app_device_id,
        request_fingerprint, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(input.operationId, input.assetId, authority.accountId, identity.userId,
          identity.deviceId, input.fingerprint, now, now)
    ];
    try {
      const results = await db.batch(statements);
      if (results.some((result) => result?.success === false || changes(result) !== 1)) throw new Error('asset_prepare_failed');
    } catch (error) {
      const raced = await operation(input.operationId);
      if (raced && raced.request_fingerprint === input.fingerprint && raced.asset_id === input.assetId &&
          raced.account_id === authority.accountId && raced.sync_user_id === identity.userId) {
        return { status: raced.state, asset: publicAsset(raced) };
      }
      throw error;
    }
    const row = await operation(input.operationId);
    return { status: 'prepared', asset: publicAsset(row) };
  }

  async function uploadTarget(identity, authority, assetId, operationId) {
    const row = await operation(operationId);
    if (!row || row.asset_id !== assetId || row.account_id !== authority.accountId ||
        row.sync_user_id !== identity.userId || row.app_device_id !== identity.deviceId) return null;
    return row;
  }

  async function markUploaded(row, now) {
    const result = await db.prepare(`UPDATE sync_assets SET state = 'uploaded', uploaded_at = COALESCE(uploaded_at, ?),
      updated_at = ? WHERE asset_id = ? AND state IN ('prepared', 'uploaded')`)
      .bind(now, now, row.asset_id).run();
    if (result?.success === false) throw new Error('asset_upload_state_failed');
    return { status: 'uploaded', asset: publicAsset({ ...row, state: 'uploaded' }) };
  }

  async function commit(identity, authority, input) {
    const row = await uploadTarget(identity, authority, input.assetId, input.operationId);
    if (!row || row.content_hash !== input.hash) return { status: 'invalid' };
    if (row.state === 'available') return { status: 'available', asset: publicAsset(row) };
    if (row.state !== 'uploaded') return { status: 'not_uploaded' };
    const now = input.now;
    const result = await db.prepare(`UPDATE sync_assets SET state = 'available', committed_at = COALESCE(committed_at, ?),
      unreferenced_at = NULL, updated_at = ? WHERE asset_id = ? AND state = 'uploaded' AND content_hash = ?`)
      .bind(now, now, input.assetId, input.hash).run();
    if (result?.success === false || changes(result) !== 1) return { status: 'retry' };
    return { status: 'available', asset: publicAsset({ ...row, state: 'available' }) };
  }

  async function available(identity, authority, assetId) {
    return db.prepare(`SELECT * FROM sync_assets WHERE asset_id = ? AND account_id = ? AND sync_user_id = ?
      AND membership_id = ? AND state IN ('available', 'unreferenced')`)
      .bind(assetId, authority.accountId, identity.userId, authority.membershipId).first();
  }

  async function unreference(identity, authority, assetIds, now) {
    const statements = assetIds.map((assetId) => db.prepare(`UPDATE sync_assets
      SET state = 'unreferenced', unreferenced_at = COALESCE(unreferenced_at, ?), updated_at = ?
      WHERE asset_id = ? AND account_id = ? AND sync_user_id = ? AND membership_id = ? AND state = 'available'`)
      .bind(now, now, assetId, authority.accountId, identity.userId, authority.membershipId));
    const results = statements.length ? await db.batch(statements) : [];
    return results.reduce((total, result) => total + changes(result), 0);
  }

  async function cleanupCandidates(now, graceMs, preparedMs, limit) {
    return (await db.prepare(`SELECT a.* FROM sync_assets a
      WHERE (a.state = 'unreferenced' AND a.unreferenced_at <= ?)
         OR (a.state IN ('prepared', 'uploaded') AND a.updated_at <= ?)
         OR (a.state <> 'deleted' AND NOT EXISTS (SELECT 1 FROM sync_accounts x WHERE x.id = a.account_id))
      ORDER BY a.updated_at ASC LIMIT ${Number(limit)}`)
      .bind(now - graceMs, now - preparedMs).all()).results || [];
  }

  async function isReferenced(row) {
    const escaped = String(row.asset_id).replace(/[%_]/g, '\\$&');
    const found = await db.prepare(`SELECT 1 AS found FROM sync_records
      WHERE user_id = ? AND app_id = 'port' AND deleted_at IS NULL
        AND payload_json LIKE ? ESCAPE '\\' LIMIT 1`)
      .bind(row.sync_user_id, `%${escaped}%`).first();
    return Boolean(found);
  }

  async function restoreReferenced(assetId, now) {
    await db.prepare(`UPDATE sync_assets SET state = 'available', unreferenced_at = NULL, updated_at = ?
      WHERE asset_id = ? AND state = 'unreferenced'`).bind(now, assetId).run();
  }

  async function markDeleted(assetId, now) {
    await db.prepare(`UPDATE sync_assets SET state = 'deleted', deleted_at = ?, updated_at = ?
      WHERE asset_id = ? AND state <> 'deleted'`).bind(now, now, assetId).run();
  }

  return Object.freeze({ prepare, uploadTarget, markUploaded, commit, available, unreference,
    cleanupCandidates, isReferenced, restoreReferenced, markDeleted });
}

export { publicAsset };
