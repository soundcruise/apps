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

function migrate(db) {
  db.exec(migration);
  db.exec(migration2);
  db.exec(migration3);
  db.exec(migration4);
  db.exec(migration5);
  db.exec(migration6);
  db.exec(migration7);
}

test('fresh migration creates the isolated sync schema and indexes', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'sync_%' ORDER BY name").all().map((row) => row.name);
  assert.deepEqual(tables, [
    'sync_changes', 'sync_datasets', 'sync_devices', 'sync_enrollment_codes',
    'sync_records', 'sync_runtime_control', 'sync_users'
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
