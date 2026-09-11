import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const migration = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0001_create_sync_foundation.sql'), 'utf8');

test('fresh migration creates the isolated sync schema and indexes', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(migration);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'sync_%' ORDER BY name").all().map((row) => row.name);
  assert.deepEqual(tables, ['sync_changes', 'sync_datasets', 'sync_devices', 'sync_records', 'sync_users']);
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pairing_codes'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sync_changes_pull'").get());
  db.close();
});

test('P1 provisioning permits no recovery verifier only while provisioning', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(migration);
  db.prepare("INSERT INTO sync_users (id,state,recovery_version,recovery_verifier,created_at,updated_at) VALUES (?, 'provisioning', 0, NULL, 1, 1)").run('u1');
  assert.throws(() => db.prepare("INSERT INTO sync_users (id,state,recovery_version,recovery_verifier,created_at,updated_at) VALUES (?, 'active', 0, NULL, 1, 1)").run('u2'));
  assert.throws(() => db.prepare("INSERT INTO sync_users (id,state,recovery_version,recovery_verifier,created_at,updated_at) VALUES (?, 'provisioning', 1, ?, 1, 1)").run('u3', 'verifier'));
  db.close();
});

test('record types, revisions, tombstones, idempotency, and foreign keys are constrained', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(migration);
  db.prepare("INSERT INTO sync_users (id,state,recovery_version,recovery_verifier,created_at,updated_at) VALUES (?, 'provisioning', 0, NULL, 1, 1)").run('u1');
  assert.throws(() => db.prepare("INSERT INTO sync_records VALUES ('u1','chord','bad','x','{}','hash',1,1,NULL,NULL,'op')").run());
  assert.throws(() => db.prepare("INSERT INTO sync_records VALUES ('u1','chord','chord','x',NULL,'hash',1,1,NULL,NULL,'op')").run());
  db.prepare("INSERT INTO sync_changes (user_id,app_id,record_type,record_id,revision,operation_id,operation_hash,payload_json,payload_hash,deleted_at,changed_at) VALUES ('u1','chord','chord','x',1,'op-1','oh','{}','ph',NULL,1)").run();
  assert.throws(() => db.prepare("INSERT INTO sync_changes (user_id,app_id,record_type,record_id,revision,operation_id,operation_hash,payload_json,payload_hash,deleted_at,changed_at) VALUES ('u1','chord','chord','y',1,'op-1','oh','{}','ph',NULL,1)").run());
  db.close();
});
