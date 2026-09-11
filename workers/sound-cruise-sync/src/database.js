export async function createProvisioningIdentity(db, input) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new Error('D1 binding is unavailable');
  }
  const userStatement = db.prepare(`
    INSERT INTO sync_users (
      id, state, recovery_version, recovery_verifier, created_at, updated_at, deleted_at
    ) VALUES (?, 'provisioning', 0, NULL, ?, ?, NULL)
  `).bind(input.userId, input.now, input.now);
  const deviceStatement = db.prepare(`
    INSERT INTO sync_devices (
      id, user_id, app_id, credential_version, credential_verifier,
      label, last_cursor, created_at, last_seen_at, revoked_at
    ) VALUES (?, ?, ?, 1, ?, ?, 0, ?, ?, NULL)
  `).bind(
    input.deviceId,
    input.userId,
    input.appId,
    input.credentialVerifier,
    input.deviceLabel,
    input.now,
    input.now
  );
  const datasetStatement = db.prepare(`
    INSERT INTO sync_datasets (
      user_id, app_id, state, schema_version, record_count,
      manifest_hash, min_change_seq, initialized_at, updated_at
    ) VALUES (?, ?, 'initializing', ?, ?, ?, 0, NULL, ?)
  `).bind(
    input.userId,
    input.appId,
    input.initialSummary.schemaVersion,
    input.initialSummary.recordCount,
    input.initialSummary.manifestHash,
    input.now
  );

  const results = await db.batch([userStatement, deviceStatement, datasetStatement]);
  if (!Array.isArray(results) || results.length !== 3 || results.some((result) => result?.success !== true)) {
    throw new Error('D1 provisioning transaction failed');
  }
  return { userId: input.userId, deviceId: input.deviceId, datasetState: 'initializing' };
}
