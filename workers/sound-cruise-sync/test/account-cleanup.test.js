import test from 'node:test';
import assert from 'node:assert/strict';
import { CLEANUP_RETENTION, createD1CleanupRepository } from '../src/cleanup-database.js';
import { createD1AccountRepository } from '../src/account-database.js';
import { createSqliteD1 } from './sqlite-d1.js';

test('expired Account handoff cleanup is bounded and idempotent', async () => {
  const db = createSqliteD1();
  await createD1AccountRepository(db).createAccountBackbone({
    accountId: 'cleanup-account',
    accountDeviceId: 'cleanup-device',
    recoveryVerifier: 'a'.repeat(64),
    accountCredentialVerifier: 'b'.repeat(64),
    accountDeviceLabel: null,
    memberships: [{ id: 'cleanup-membership', appId: 'chord' }],
    now: 1
  });
  const insert = db.raw.prepare(`
    INSERT INTO sync_membership_handoffs (
      handoff_id, handoff_verifier, account_id, membership_id,
      created_by_account_device_id, claimed_by_app_device_id,
      created_at, expires_at, consumed_at, cancelled_at,
      issue_operation_id, issue_fingerprint
    ) VALUES (?, ?, 'cleanup-account', 'cleanup-membership', 'cleanup-device',
              NULL, 1, 2, NULL, NULL, ?, ?)
  `);
  for (let index = 0; index < CLEANUP_RETENTION.batchSize + 1; index += 1) {
    const suffix = String(index).padStart(3, '0');
    insert.run(`handoff-${suffix}`, `verifier-${suffix}`, `operation-${suffix}`, 'c'.repeat(64));
  }
  const now = CLEANUP_RETENTION.accountHandoffMs + 3;
  const repository = createD1CleanupRepository(db, () => now);
  assert.equal((await repository.cleanup()).accountHandoffs, CLEANUP_RETENTION.batchSize);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_membership_handoffs').get().count, 1);
  assert.equal((await repository.cleanup()).accountHandoffs, 1);
  assert.equal((await repository.cleanup()).accountHandoffs, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_membership_handoffs').get().count, 0);
  db.close();
});

test('expired prepared Chord bridge is safely rolled back without deleting Account or legacy data', async () => {
  const db = createSqliteD1();
  await createD1AccountRepository(db).createAccountBackbone({
    accountId: 'bridge-cleanup-account',
    accountDeviceId: 'bridge-cleanup-account-device',
    recoveryVerifier: '1'.repeat(64),
    accountCredentialVerifier: '2'.repeat(64),
    accountDeviceLabel: null,
    memberships: [{ id: 'bridge-cleanup-membership', appId: 'chord' }],
    now: 1
  });
  db.raw.prepare(`
    INSERT INTO sync_users (
      id, state, recovery_version, recovery_verifier,
      created_at, updated_at, recovery_created_at, recovery_rotated_at
    ) VALUES ('bridge-cleanup-user', 'active', 1, ?, 1, 1, 1, 1)
  `).run('3'.repeat(64));
  db.raw.prepare(`
    INSERT INTO sync_devices (
      id, user_id, app_id, credential_version, credential_verifier,
      last_cursor, created_at, last_seen_at, paired_at
    ) VALUES ('bridge-cleanup-app-device', 'bridge-cleanup-user', 'chord', 1, ?, 0, 1, 1, 1)
  `).run('4'.repeat(64));
  db.raw.prepare(`
    INSERT INTO sync_datasets (
      user_id, app_id, state, schema_version, record_count, manifest_hash,
      min_change_seq, initialized_at, updated_at, last_change_seq
    ) VALUES ('bridge-cleanup-user', 'chord', 'ready', 1, 0, ?, 0, 1, 1, 0)
  `).run('5'.repeat(64));
  db.raw.prepare(`
    INSERT INTO sync_chord_account_bridges (
      bridge_id, account_id, membership_id, sync_user_id, app_device_id,
      account_device_id, state, generation, expected_account_generation,
      expected_membership_generation, expected_legacy_recovery_version,
      account_recovery_version, prepare_operation_id, prepare_fingerprint,
      created_at, updated_at, expires_at
    ) VALUES (
      'bridge-cleanup', 'bridge-cleanup-account', 'bridge-cleanup-membership',
      'bridge-cleanup-user', 'bridge-cleanup-app-device',
      'bridge-cleanup-account-device', 'prepared', 1, 1, 1, 1, 1,
      'bridge-cleanup-operation', ?, 1, 1, 2
    )
  `).run('6'.repeat(64));

  const repository = createD1CleanupRepository(db, () => 3);
  assert.equal((await repository.cleanup()).chordAccountBridges, 1);
  assert.deepEqual({ ...db.raw.prepare(`
    SELECT state, generation, rolled_back_at FROM sync_chord_account_bridges
    WHERE bridge_id = 'bridge-cleanup'
  `).get() }, { state: 'rolled_back', generation: 2, rolled_back_at: 3 });
  assert.equal(db.raw.prepare(`SELECT COUNT(*) AS count FROM sync_accounts`).get().count, 1);
  assert.equal(db.raw.prepare(`SELECT COUNT(*) AS count FROM sync_users`).get().count, 1);
  assert.equal(db.raw.prepare(`SELECT COUNT(*) AS count FROM sync_datasets`).get().count, 1);
  assert.equal((await repository.cleanup()).chordAccountBridges, 0);
  db.close();
});
