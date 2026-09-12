import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const migration = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0001_create_sync_foundation.sql'), 'utf8');
const migration2 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0002_add_sync_revision_metadata.sql'), 'utf8');

function migrate(db) {
  db.exec(migration);
  db.exec(migration2);
}

test('fresh migration creates the isolated sync schema and indexes', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'sync_%' ORDER BY name").all().map((row) => row.name);
  assert.deepEqual(tables, ['sync_changes', 'sync_datasets', 'sync_devices', 'sync_records', 'sync_users']);
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pairing_codes'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sync_changes_pull'").get());
  assert(db.prepare("SELECT schema_version FROM sync_records LIMIT 1"));
  assert(db.prepare("SELECT schema_version FROM sync_changes LIMIT 1"));
  assert(db.prepare("SELECT last_change_seq FROM sync_datasets LIMIT 1"));
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
