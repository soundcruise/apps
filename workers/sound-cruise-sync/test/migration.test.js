import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const migration = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0001_create_sync_foundation.sql'), 'utf8');
const migration2 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0002_add_sync_revision_metadata.sql'), 'utf8');
const migration3 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0003_add_pairing_device_lifecycle.sql'), 'utf8');
const migration4 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0004_add_pairing_attempt_limiter.sql'), 'utf8');
const migration5 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0005_add_recovery_lifecycle.sql'), 'utf8');
const migration6 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0006_add_device_management_and_account_deletion.sql'), 'utf8');
const migration7 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0007_add_production_rollout_control.sql'), 'utf8');
const migration8 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0008_add_multi_app_account_backbone.sql'), 'utf8');
const migration9 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0009_add_account_api_handoff_state.sql'), 'utf8');

function migrate(db) {
  db.exec(migration);
  db.exec(migration2);
  db.exec(migration3);
  db.exec(migration4);
  db.exec(migration5);
  db.exec(migration6);
  db.exec(migration7);
  db.exec(migration8);
  db.exec(migration9);
}

test('fresh migration creates the isolated sync schema and indexes', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'sync_%' ORDER BY name").all().map((row) => row.name);
  assert.deepEqual(tables, [
    'sync_account_delete_intents', 'sync_account_devices', 'sync_account_managed_users',
    'sync_account_memberships',
    'sync_account_recovery_claims', 'sync_account_runtime_control',
    'sync_account_start_operations', 'sync_accounts',
    'sync_changes', 'sync_datasets', 'sync_devices', 'sync_enrollment_codes',
    'sync_membership_device_links', 'sync_membership_handoffs', 'sync_records',
    'sync_runtime_control', 'sync_users'
  ]);
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pairing_codes'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sync_changes_pull'").get());
  assert(db.prepare("SELECT schema_version FROM sync_records LIMIT 1"));
  assert(db.prepare("SELECT schema_version FROM sync_changes LIMIT 1"));
  assert(db.prepare("SELECT last_change_seq FROM sync_datasets LIMIT 1"));
  assert(db.prepare("SELECT pairing_pending_at, paired_at FROM sync_devices LIMIT 1"));
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_pairing_codes_user_active'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pairing_attempts'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='recovery_claims'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='recovery_attempts'").get());
  assert(db.prepare('SELECT recovery_created_at, recovery_rotated_at FROM sync_users LIMIT 1'));
  assert(db.prepare('SELECT delete_requested_at, purge_after FROM sync_users LIMIT 1'));
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='account_delete_intents'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sync_users_purge'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_runtime_control'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_enrollment_codes'").get());
  assert.deepEqual({ ...db.prepare(`
    SELECT rollout_mode, admission_enabled, data_write_enabled, data_read_enabled,
           recovery_enabled, cloud_delete_enabled, generation
    FROM sync_runtime_control WHERE singleton_id = 1
  `).get() }, {
    rollout_mode: 'closed', admission_enabled: 0, data_write_enabled: 1,
    data_read_enabled: 1, recovery_enabled: 1, cloud_delete_enabled: 1, generation: 1
  });
  assert.deepEqual({ ...db.prepare(`
    SELECT rollout_mode, account_admission_enabled, membership_admission_enabled,
           account_read_enabled, account_recovery_enabled, account_delete_enabled,
           port_orchestration_enabled, generation
    FROM sync_account_runtime_control WHERE singleton_id = 1
  `).get() }, {
    rollout_mode: 'development', account_admission_enabled: 0,
    membership_admission_enabled: 0, account_read_enabled: 0,
    account_recovery_enabled: 0, account_delete_enabled: 0,
    port_orchestration_enabled: 0, generation: 1
  });
  db.close();
});

test('M2 migration is additive, idempotent and leaves an existing Chord identity untouched', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  db.prepare(`
    UPDATE sync_runtime_control
    SET rollout_mode = 'open', admission_enabled = 1, generation = 9, updated_at = 99
    WHERE singleton_id = 1
  `).run();
  db.prepare(`
    INSERT INTO sync_users (
      id, state, recovery_version, recovery_verifier, created_at, updated_at,
      recovery_created_at, recovery_rotated_at
    ) VALUES ('legacy-chord-user', 'active', 1, ?, 1, 1, 1, 1)
  `).run('f'.repeat(64));
  db.prepare(`
    INSERT INTO sync_devices (
      id, user_id, app_id, credential_version, credential_verifier, label,
      last_cursor, created_at, last_seen_at, revoked_at, pairing_pending_at, paired_at
    ) VALUES ('legacy-chord-device', 'legacy-chord-user', 'chord', 1, ?, NULL,
              0, 1, 1, NULL, NULL, 1)
  `).run('e'.repeat(64));
  db.prepare(`
    INSERT INTO sync_datasets (
      user_id, app_id, state, schema_version, record_count, manifest_hash,
      min_change_seq, initialized_at, updated_at, last_change_seq
    ) VALUES ('legacy-chord-user', 'chord', 'ready', 1, 0, ?, 0, 1, 1, 0)
  `).run('d'.repeat(64));

  db.exec(migration8);

  assert.deepEqual({ ...db.prepare(`
    SELECT rollout_mode, admission_enabled, generation, updated_at
    FROM sync_runtime_control WHERE singleton_id = 1
  `).get() }, { rollout_mode: 'open', admission_enabled: 1, generation: 9, updated_at: 99 });
  assert.deepEqual({ ...db.prepare(`
    SELECT u.state, u.recovery_version, d.app_id, d.revoked_at, s.state AS dataset_state
    FROM sync_users u
    JOIN sync_devices d ON d.user_id = u.id
    JOIN sync_datasets s ON s.user_id = u.id AND s.app_id = d.app_id
    WHERE u.id = 'legacy-chord-user'
  `).get() }, {
    state: 'active', recovery_version: 1, app_id: 'chord',
    revoked_at: null, dataset_state: 'ready'
  });
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS count FROM sync_account_memberships
    WHERE sync_user_id = 'legacy-chord-user'
  `).get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sync_account_runtime_control').get().count, 1);
  db.close();
});

test('M3 migration is additive and adds response-loss metadata without touching legacy Chord', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(migration);
  db.exec(migration2);
  db.exec(migration3);
  db.exec(migration4);
  db.exec(migration5);
  db.exec(migration6);
  db.exec(migration7);
  db.exec(migration8);
  db.prepare(`
    INSERT INTO sync_users (
      id, state, recovery_version, recovery_verifier, created_at, updated_at,
      recovery_created_at, recovery_rotated_at
    ) VALUES ('m3-legacy', 'active', 1, ?, 1, 1, 1, 1)
  `).run('1'.repeat(64));
  db.prepare(`
    INSERT INTO sync_devices (
      id, user_id, app_id, credential_version, credential_verifier, label,
      last_cursor, created_at, last_seen_at, revoked_at, pairing_pending_at, paired_at
    ) VALUES ('m3-legacy-device', 'm3-legacy', 'chord', 1, ?, NULL,
              0, 1, 1, NULL, NULL, 1)
  `).run('2'.repeat(64));

  db.exec(migration9);

  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_account_start_operations'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_account_managed_users'").get());
  assert(db.prepare('SELECT prepared_operation_id, prepared_by_account_device_id FROM sync_account_memberships LIMIT 1'));
  assert(db.prepare(`
    SELECT issue_operation_id, consume_operation_id, claimed_by_account_device_id
    FROM sync_membership_handoffs LIMIT 1
  `));
  assert.deepEqual({ ...db.prepare(`
    SELECT u.state, u.recovery_version, d.app_id, d.revoked_at
    FROM sync_users u JOIN sync_devices d ON d.user_id = u.id
    WHERE u.id = 'm3-legacy'
  `).get() }, { state: 'active', recovery_version: 1, app_id: 'chord', revoked_at: null });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sync_account_managed_users').get().count, 0);
  db.close();
});

test('P-ROLL-1 migration is forward-only and safe to re-run without changing the singleton', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  db.prepare(`
    UPDATE sync_runtime_control SET rollout_mode = 'cohort', admission_enabled = 1,
      generation = 2, updated_at = 1234 WHERE singleton_id = 1
  `).run();
  db.exec(migration7);
  assert.deepEqual({ ...db.prepare(`
    SELECT rollout_mode, admission_enabled, generation, updated_at
    FROM sync_runtime_control WHERE singleton_id = 1
  `).get() }, { rollout_mode: 'cohort', admission_enabled: 1, generation: 2, updated_at: 1234 });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sync_runtime_control').get().count, 1);
  assert.throws(() => db.prepare(`
    INSERT INTO sync_enrollment_codes (code_verifier, app_id, created_at, expires_at)
    VALUES ('v', 'pitch', 1, 2)
  `).run());
  db.close();
});

test('P1 provisioning permits no recovery verifier only while provisioning', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  db.prepare("INSERT INTO sync_users (id,state,recovery_version,recovery_verifier,created_at,updated_at) VALUES (?, 'provisioning', 0, NULL, 1, 1)").run('u1');
  assert.throws(() => db.prepare("INSERT INTO sync_users (id,state,recovery_version,recovery_verifier,created_at,updated_at) VALUES (?, 'active', 0, NULL, 1, 1)").run('u2'));
  assert.throws(() => db.prepare("INSERT INTO sync_users (id,state,recovery_version,recovery_verifier,created_at,updated_at) VALUES (?, 'provisioning', 1, ?, 1, 1)").run('u3', 'verifier'));
  db.close();
});

test('record types, revisions, tombstones, idempotency, and foreign keys are constrained', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  db.prepare("INSERT INTO sync_users (id,state,recovery_version,recovery_verifier,created_at,updated_at) VALUES (?, 'provisioning', 0, NULL, 1, 1)").run('u1');
  const insertRecord = (recordType, payload, revision, deletedAt) => db.prepare(`
    INSERT INTO sync_records (
      user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,
      updated_at,deleted_at,updated_by_device_id,last_operation_id,schema_version
    ) VALUES ('u1','chord',?,'x',?,'hash',?,1,?,NULL,'op',1)
  `).run(recordType, payload, revision, deletedAt);
  assert.throws(() => insertRecord('bad', '{}', 1, null));
  assert.throws(() => insertRecord('chord', null, 1, null));
  assert.throws(() => insertRecord('chord', '{}', 0, null));
  insertRecord('chord', '{}', 1, null);
  db.prepare("INSERT INTO sync_changes (user_id,app_id,record_type,record_id,revision,operation_id,operation_hash,payload_json,payload_hash,deleted_at,changed_at) VALUES ('u1','chord','chord','x',1,'op-1','oh','{}','ph',NULL,1)").run();
  assert.throws(() => db.prepare("INSERT INTO sync_changes (user_id,app_id,record_type,record_id,revision,operation_id,operation_hash,payload_json,payload_hash,deleted_at,changed_at) VALUES ('u1','chord','chord','y',1,'op-1','oh','{}','ph',NULL,1)").run());
  db.close();
});
