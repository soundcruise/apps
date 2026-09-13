import test from 'node:test';
import assert from 'node:assert/strict';
import { gateDecision, normalizeRuntimeControl, readRuntimeControl, ROUTE_GATE } from '../src/rollout-control.js';
import { createSqliteD1 } from './sqlite-d1.js';

const row = (overrides = {}) => ({
  singleton_id: 1, rollout_mode: 'closed', admission_enabled: 0,
  data_write_enabled: 1, data_read_enabled: 1, recovery_enabled: 1,
  cloud_delete_enabled: 1, generation: 1, updated_at: 0, ...overrides
});

test('runtime control is D1 authoritative and missing or malformed state fails closed', async () => {
  const db = createSqliteD1();
  assert.equal((await readRuntimeControl(db)).rolloutMode, 'closed');
  db.raw.prepare('DELETE FROM sync_runtime_control').run();
  assert.equal(await readRuntimeControl(db), null);
  assert.deepEqual(gateDecision('/v1/sync/start', null), {
    allowed: false, status: 503, code: 'rollout_control_unavailable'
  });
  assert.equal(normalizeRuntimeControl(row({ rollout_mode: 'unexpected' })), null);
  assert.equal(normalizeRuntimeControl(row({ data_read_enabled: 2 })), null);
  assert.equal(normalizeRuntimeControl(row({ generation: 0 })), null);
  db.close();
});

test('closed, cohort and open admission semantics cannot be bypassed by a client flag', () => {
  const closed = normalizeRuntimeControl(row());
  const cohort = normalizeRuntimeControl(row({ rollout_mode: 'cohort', admission_enabled: 1 }));
  const open = normalizeRuntimeControl(row({ rollout_mode: 'open', admission_enabled: 1 }));
  assert.equal(gateDecision('/v1/sync/start', closed).code, 'sync_admission_paused');
  assert.equal(gateDecision('/v1/sync/start', cohort).allowed, true);
  assert.equal(gateDecision('/v1/sync/start', open).allowed, true);
  assert.equal(gateDecision('/v1/sync/start', { ...open, admissionEnabled: false }).code, 'sync_admission_paused');
});

test('route gates separate admission, writes, reads, Recovery, deletion and device management', () => {
  const emergency = normalizeRuntimeControl(row({
    rollout_mode: 'closed', admission_enabled: 0, data_write_enabled: 0, data_read_enabled: 0
  }));
  assert.equal(gateDecision('/v1/sync/pairing-codes', emergency).code, 'sync_admission_paused');
  assert.equal(gateDecision('/v1/sync/pair', emergency).code, 'sync_admission_paused');
  assert.equal(gateDecision('/v1/sync/push', emergency).code, 'sync_write_paused');
  assert.equal(gateDecision('/v1/sync/migration/complete', emergency).code, 'sync_write_paused');
  assert.equal(gateDecision('/v1/sync/changes', emergency).code, 'sync_read_paused');
  assert.equal(gateDecision('/v1/sync/snapshot', emergency).code, 'sync_read_paused');
  assert.equal(gateDecision('/v1/sync/recover', emergency).allowed, true);
  assert.equal(gateDecision('/v1/sync/recovery-codes', emergency).allowed, true);
  assert.equal(gateDecision('/v1/sync/account/delete-intent', emergency).allowed, true);
  assert.equal(gateDecision('/v1/sync/account', emergency).allowed, true);
  assert.equal(gateDecision('/v1/sync/devices', emergency).allowed, true);
  assert.equal(gateDecision('/v1/sync/devices/revoke', emergency).allowed, true);
  assert.equal(gateDecision('/v1/sync/recover', { ...emergency, recoveryEnabled: false }).code, 'sync_recovery_paused');
  assert.equal(gateDecision('/v1/sync/account', { ...emergency, cloudDeleteEnabled: false }).code, 'sync_cloud_delete_paused');
  assert.equal(gateDecision('/v1/sync/future-route', emergency).code, 'rollout_route_unclassified');
  assert.equal(Object.keys(ROUTE_GATE).length, 13);
});
