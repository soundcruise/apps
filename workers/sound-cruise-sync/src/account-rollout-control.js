export const ACCOUNT_ROLLOUT_MODES = Object.freeze([
  'development', 'closed', 'cohort', 'open'
]);

export const ACCOUNT_GATE_ACTIONS = Object.freeze({
  ACCOUNT_ADMISSION: 'account_admission',
  MEMBERSHIP_ADMISSION: 'membership_admission',
  ACCOUNT_READ: 'account_read',
  ACCOUNT_RECOVERY: 'account_recovery',
  ACCOUNT_DELETE: 'account_delete',
  PORT_ORCHESTRATION: 'port_orchestration'
});

function booleanFlag(value) {
  return value === 0 ? false : value === 1 ? true : null;
}

export function normalizeAccountRuntimeControl(row) {
  if (!row || row.singleton_id !== 1 ||
      !ACCOUNT_ROLLOUT_MODES.includes(row.rollout_mode) ||
      !Number.isInteger(row.generation) || row.generation < 1 ||
      !Number.isInteger(row.updated_at) || row.updated_at < 0) return null;

  const accountAdmissionEnabled = booleanFlag(row.account_admission_enabled);
  const membershipAdmissionEnabled = booleanFlag(row.membership_admission_enabled);
  const accountReadEnabled = booleanFlag(row.account_read_enabled);
  const accountRecoveryEnabled = booleanFlag(row.account_recovery_enabled);
  const accountDeleteEnabled = booleanFlag(row.account_delete_enabled);
  const portOrchestrationEnabled = booleanFlag(row.port_orchestration_enabled);
  if ([
    accountAdmissionEnabled,
    membershipAdmissionEnabled,
    accountReadEnabled,
    accountRecoveryEnabled,
    accountDeleteEnabled,
    portOrchestrationEnabled
  ].includes(null)) return null;

  return Object.freeze({
    rolloutMode: row.rollout_mode,
    accountAdmissionEnabled,
    membershipAdmissionEnabled,
    accountReadEnabled,
    accountRecoveryEnabled,
    accountDeleteEnabled,
    portOrchestrationEnabled,
    generation: row.generation,
    updatedAt: row.updated_at
  });
}

export async function readAccountRuntimeControl(db) {
  if (!db || typeof db.prepare !== 'function') return null;
  try {
    const row = await db.prepare(`
      SELECT singleton_id, rollout_mode, account_admission_enabled,
             membership_admission_enabled, account_read_enabled,
             account_recovery_enabled, account_delete_enabled,
             port_orchestration_enabled, generation, updated_at
      FROM sync_account_runtime_control WHERE singleton_id = 1
    `).first();
    return normalizeAccountRuntimeControl(row);
  } catch {
    return null;
  }
}

export function accountGateDecision(action, control) {
  if (!control) {
    return { allowed: false, status: 503, code: 'account_rollout_control_unavailable' };
  }
  if (!Object.values(ACCOUNT_GATE_ACTIONS).includes(action)) {
    return { allowed: false, status: 503, code: 'account_rollout_action_unclassified' };
  }

  const admissionClosed = control.rolloutMode === 'development' || control.rolloutMode === 'closed';
  if (action === ACCOUNT_GATE_ACTIONS.ACCOUNT_ADMISSION &&
      (!control.accountAdmissionEnabled || admissionClosed)) {
    return { allowed: false, status: 423, code: 'account_admission_paused', gate: action };
  }
  if (action === ACCOUNT_GATE_ACTIONS.MEMBERSHIP_ADMISSION &&
      (!control.membershipAdmissionEnabled || admissionClosed)) {
    return { allowed: false, status: 423, code: 'membership_admission_paused', gate: action };
  }
  if (action === ACCOUNT_GATE_ACTIONS.ACCOUNT_READ && !control.accountReadEnabled) {
    return { allowed: false, status: 423, code: 'account_read_paused', gate: action };
  }
  if (action === ACCOUNT_GATE_ACTIONS.ACCOUNT_RECOVERY && !control.accountRecoveryEnabled) {
    return { allowed: false, status: 423, code: 'account_recovery_paused', gate: action };
  }
  if (action === ACCOUNT_GATE_ACTIONS.ACCOUNT_DELETE && !control.accountDeleteEnabled) {
    return { allowed: false, status: 423, code: 'account_delete_paused', gate: action };
  }
  if (action === ACCOUNT_GATE_ACTIONS.PORT_ORCHESTRATION && !control.portOrchestrationEnabled) {
    return { allowed: false, status: 423, code: 'port_orchestration_paused', gate: action };
  }
  return { allowed: true, gate: action };
}
