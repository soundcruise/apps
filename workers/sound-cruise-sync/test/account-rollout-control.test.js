import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_GATE_ACTIONS,
  accountGateDecision,
  normalizeAccountRuntimeControl,
  readAccountRuntimeControl
} from '../src/account-rollout-control.js';
import { createSqliteD1 } from './sqlite-d1.js';

const row = (overrides = {}) => ({
  singleton_id: 1,
  rollout_mode: 'development',
  account_admission_enabled: 0,
  membership_admission_enabled: 0,
  account_read_enabled: 0,
  account_recovery_enabled: 0,
  account_delete_enabled: 0,
  port_orchestration_enabled: 0,
  generation: 1,
  updated_at: 0,
  ...overrides
});

test('Multi-App control defaults to development/off and fails closed when unavailable', async () => {
  const db = createSqliteD1();
  const control = await readAccountRuntimeControl(db);
  assert.equal(control.rolloutMode, 'development');
  assert.equal(control.accountAdmissionEnabled, false);
  assert.equal(control.membershipAdmissionEnabled, false);
  assert.equal(control.accountReadEnabled, false);
  assert.equal(control.accountRecoveryEnabled, false);
  assert.equal(control.accountDeleteEnabled, false);
  assert.equal(control.portOrchestrationEnabled, false);
  assert.equal(
    accountGateDecision(ACCOUNT_GATE_ACTIONS.ACCOUNT_ADMISSION, control).code,
    'account_admission_paused'
  );
  db.raw.prepare('DELETE FROM sync_account_runtime_control').run();
  assert.equal(await readAccountRuntimeControl(db), null);
  assert.equal(
    accountGateDecision(ACCOUNT_GATE_ACTIONS.ACCOUNT_READ, null).code,
    'account_rollout_control_unavailable'
  );
  db.close();
});

test('Multi-App gates are independent from the existing Chord runtime control', () => {
  const open = normalizeAccountRuntimeControl(row({
    rollout_mode: 'open',
    account_admission_enabled: 1,
    membership_admission_enabled: 1,
    account_read_enabled: 1,
    account_recovery_enabled: 1,
    account_delete_enabled: 1,
    port_orchestration_enabled: 1
  }));
  for (const action of Object.values(ACCOUNT_GATE_ACTIONS)) {
    assert.equal(accountGateDecision(action, open).allowed, true);
  }

  const emergency = normalizeAccountRuntimeControl(row({
    rollout_mode: 'closed',
    account_recovery_enabled: 1,
    account_delete_enabled: 1
  }));
  assert.equal(
    accountGateDecision(ACCOUNT_GATE_ACTIONS.ACCOUNT_ADMISSION, emergency).allowed,
    false
  );
  assert.equal(
    accountGateDecision(ACCOUNT_GATE_ACTIONS.MEMBERSHIP_ADMISSION, emergency).allowed,
    false
  );
  assert.equal(
    accountGateDecision(ACCOUNT_GATE_ACTIONS.ACCOUNT_RECOVERY, emergency).allowed,
    true
  );
  assert.equal(
    accountGateDecision(ACCOUNT_GATE_ACTIONS.ACCOUNT_DELETE, emergency).allowed,
    true
  );
});

test('malformed Multi-App control never enables an operation', () => {
  assert.equal(normalizeAccountRuntimeControl(row({ rollout_mode: 'unexpected' })), null);
  assert.equal(normalizeAccountRuntimeControl(row({ account_read_enabled: 2 })), null);
  assert.equal(normalizeAccountRuntimeControl(row({ generation: 0 })), null);
  assert.equal(
    accountGateDecision('unknown', normalizeAccountRuntimeControl(row())).code,
    'account_rollout_action_unclassified'
  );
});
