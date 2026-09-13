export async function createProvisioningIdentity(db, input) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new Error('D1 binding is unavailable');
  }
  const cohort = typeof input.enrollmentVerifier === 'string' && input.enrollmentVerifier.length > 0;
  const enrollmentStatement = cohort ? db.prepare(`
    UPDATE sync_enrollment_codes
    SET consumed_at = ?, consumed_by_user_id = ?
    WHERE code_verifier = ? AND app_id = ? AND consumed_at IS NULL
      AND cancelled_at IS NULL AND expires_at > ?
  `).bind(input.now, input.userId, input.enrollmentVerifier, input.appId, input.now) : null;
  const userStatement = db.prepare(cohort ? `
    INSERT INTO sync_users (
      id, state, recovery_version, recovery_verifier, created_at, updated_at, deleted_at,
      recovery_created_at, recovery_rotated_at
    )
    SELECT ?, 'active', 1, ?, ?, ?, NULL, ?, ?
    FROM sync_enrollment_codes
    WHERE code_verifier = ? AND app_id = ? AND consumed_at = ? AND consumed_by_user_id = ?
  ` : `
    INSERT INTO sync_users (
      id, state, recovery_version, recovery_verifier, created_at, updated_at, deleted_at,
      recovery_created_at, recovery_rotated_at
    ) VALUES (?, 'active', 1, ?, ?, ?, NULL, ?, ?)
  `).bind(
    input.userId, input.recoveryVerifier, input.now, input.now, input.now, input.now,
    ...(cohort ? [input.enrollmentVerifier, input.appId, input.now, input.userId] : [])
  );
  const deviceStatement = db.prepare(`
    INSERT INTO sync_devices (
      id, user_id, app_id, credential_version, credential_verifier,
      label, last_cursor, created_at, last_seen_at, revoked_at, pairing_pending_at, paired_at
    )
    SELECT ?, ?, ?, 1, ?, ?, 0, ?, ?, NULL, NULL, ?
    WHERE EXISTS (SELECT 1 FROM sync_users WHERE id = ?)
  `).bind(
    input.deviceId,
    input.userId,
    input.appId,
    input.credentialVerifier,
    input.deviceLabel,
    input.now,
    input.now,
    input.now,
    input.userId
  );
  const datasetStatement = db.prepare(`
    INSERT INTO sync_datasets (
      user_id, app_id, state, schema_version, record_count,
      manifest_hash, min_change_seq, initialized_at, updated_at
    )
    SELECT ?, ?, 'initializing', ?, ?, ?, 0, NULL, ?
    WHERE EXISTS (SELECT 1 FROM sync_users WHERE id = ?)
  `).bind(
    input.userId,
    input.appId,
    input.initialSummary.schemaVersion,
    input.initialSummary.recordCount,
    input.initialSummary.manifestHash,
    input.now,
    input.userId
  );

  const statements = cohort
    ? [enrollmentStatement, userStatement, deviceStatement, datasetStatement]
    : [userStatement, deviceStatement, datasetStatement];
  const results = await db.batch(statements);
  if (!Array.isArray(results) || results.length !== statements.length || results.some((result) => result?.success !== true)) {
    throw new Error('D1 provisioning transaction failed');
  }
  const changes = results.map((result) => Number(result?.meta?.changes || 0));
  if (cohort && changes[0] !== 1) return { status: 'enrollment_invalid' };
  if (cohort && changes.slice(1).some((count) => count !== 1)) {
    throw new Error('D1 provisioning transaction was incomplete');
  }
  return { status: 'created', userId: input.userId, deviceId: input.deviceId, datasetState: 'initializing' };
}
