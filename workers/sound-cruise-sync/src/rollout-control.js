export const ROLLOUT_MODES = Object.freeze(['closed', 'cohort', 'open']);

export const ROUTE_GATE = Object.freeze({
  '/v1/sync/start': 'admission',
  '/v1/sync/pairing-codes': 'admission',
  '/v1/sync/pair': 'admission',
  '/v1/sync/push': 'write',
  '/v1/sync/migration/complete': 'write',
  '/v1/sync/changes': 'read',
  '/v1/sync/snapshot': 'read',
  '/v1/sync/recover': 'recovery',
  '/v1/sync/recovery-codes': 'recovery',
  '/v1/sync/account/delete-intent': 'cloud_delete',
  '/v1/sync/account': 'cloud_delete',
  '/v1/sync/devices': 'device_management',
  '/v1/sync/devices/revoke': 'device_management'
});

function booleanFlag(value) {
  return value === 0 ? false : value === 1 ? true : null;
}

export function normalizeRuntimeControl(row) {
  if (!row || row.singleton_id !== 1 || !ROLLOUT_MODES.includes(row.rollout_mode) ||
      !Number.isInteger(row.generation) || row.generation < 1 ||
      !Number.isInteger(row.updated_at) || row.updated_at < 0) return null;
  const admissionEnabled = booleanFlag(row.admission_enabled);
  const dataWriteEnabled = booleanFlag(row.data_write_enabled);
  const dataReadEnabled = booleanFlag(row.data_read_enabled);
  const recoveryEnabled = booleanFlag(row.recovery_enabled);
  const cloudDeleteEnabled = booleanFlag(row.cloud_delete_enabled);
  if ([admissionEnabled, dataWriteEnabled, dataReadEnabled, recoveryEnabled, cloudDeleteEnabled].includes(null)) {
    return null;
  }
  return Object.freeze({
    rolloutMode: row.rollout_mode,
    admissionEnabled,
    dataWriteEnabled,
    dataReadEnabled,
    recoveryEnabled,
    cloudDeleteEnabled,
    generation: row.generation,
    updatedAt: row.updated_at
  });
}

export async function readRuntimeControl(db) {
  if (!db || typeof db.prepare !== 'function') return null;
  try {
    const row = await db.prepare(`
      SELECT singleton_id, rollout_mode, admission_enabled, data_write_enabled,
             data_read_enabled, recovery_enabled, cloud_delete_enabled, generation, updated_at
      FROM sync_runtime_control WHERE singleton_id = 1
    `).first();
    return normalizeRuntimeControl(row);
  } catch {
    return null;
  }
}

export function gateDecision(pathname, control) {
  if (!control) return { allowed: false, status: 503, code: 'rollout_control_unavailable' };
  const gate = ROUTE_GATE[pathname];
  if (!gate) return { allowed: false, status: 503, code: 'rollout_route_unclassified' };
  if (gate === 'device_management') return { allowed: true, gate };
  if (gate === 'admission' && (!control.admissionEnabled || control.rolloutMode === 'closed')) {
    return { allowed: false, status: 423, code: 'sync_admission_paused', gate };
  }
  if (gate === 'write' && !control.dataWriteEnabled) {
    return { allowed: false, status: 423, code: 'sync_write_paused', gate };
  }
  if (gate === 'read' && !control.dataReadEnabled) {
    return { allowed: false, status: 423, code: 'sync_read_paused', gate };
  }
  if (gate === 'recovery' && !control.recoveryEnabled) {
    return { allowed: false, status: 423, code: 'sync_recovery_paused', gate };
  }
  if (gate === 'cloud_delete' && !control.cloudDeleteEnabled) {
    return { allowed: false, status: 423, code: 'sync_cloud_delete_paused', gate };
  }
  return { allowed: true, gate };
}
