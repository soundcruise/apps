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
const migration10 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0010_add_chord_account_bridge.sql'), 'utf8');
const migration11 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0011_add_pitch_record_types.sql'), 'utf8');
const migration12 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0012_add_rhythm_record_types.sql'), 'utf8');
const migration13 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0013_add_fretboard_record_types.sql'), 'utf8');
const migration14 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0014_add_handoff_consume_mode.sql'), 'utf8');
const migration15 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0015_add_account_qa_admission.sql'), 'utf8');
const migration16 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0016_add_app_join_invitations.sql'), 'utf8');
const migration17 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0017_add_account_lifecycle.sql'), 'utf8');
const migration18 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0018_add_account_admission_provenance.sql'), 'utf8');
const migration19 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0019_add_authenticated_recovery_rotation.sql'), 'utf8');
const migration20 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0020_add_port_join_invitations.sql'), 'utf8');
const migration21 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0021_add_port_data_plane.sql'), 'utf8');
const migration22 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0022_add_binary_assets.sql'), 'utf8');
const migration23 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0023_add_asset_quota_and_account_activity.sql'), 'utf8');
const migration24 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0024_add_auto_rejoin_handoffs.sql'), 'utf8');
const migration25 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0025_add_app_sync_safety.sql'), 'utf8');
const migration26 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0026_add_practice_attachment_assets.sql'), 'utf8');
const migration27 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0027_add_practice_attachment_record_types.sql'), 'utf8');
const migration28 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0028_add_app_attention_count.sql'), 'utf8');
const migration29 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0029_add_pro_auth.sql'), 'utf8');
const migration30 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0030_add_pro_auth_lockout.sql'), 'utf8');

function migrateThrough17(db) {
  db.exec(migration);
  db.exec(migration2);
  db.exec(migration3);
  db.exec(migration4);
  db.exec(migration5);
  db.exec(migration6);
  db.exec(migration7);
  db.exec(migration8);
  db.exec(migration9);
  db.exec(migration10);
  db.exec(migration11);
  db.exec(migration12);
  db.exec(migration13);
  db.exec(migration14);
  db.exec(migration15);
  db.exec(migration16);
  db.exec(migration17);
}

function migrateThrough25(db) {
  migrateThrough17(db);
  db.exec(migration18);
  db.exec(migration19);
  db.exec(migration20);
  db.exec(migration21);
  db.exec(migration22);
  db.exec(migration23);
  db.exec(migration24);
  db.exec(migration25);
}

function migrate(db) {
  migrateThrough25(db);
  db.exec(migration26);
  db.exec(migration27);
  db.exec(migration28);
  db.exec(migration29);
  db.exec(migration30);
}

function migrateThrough20(db) {
  migrateThrough17(db);
  db.exec(migration18);
  db.exec(migration19);
  db.exec(migration20);
}

test('M29 is additive, repeatable and constrains Pro credentials without changing sync data', () => {
  const db = new DatabaseSync(':memory:');
  migrateThrough25(db);
  db.exec(migration26);
  db.exec(migration27);
  db.exec(migration28);
  db.prepare(`INSERT INTO sync_users
    (id,state,recovery_version,recovery_verifier,created_at,updated_at)
    VALUES ('m29-existing-user','provisioning',0,NULL,1,1)`).run();
  const before = db.prepare("SELECT * FROM sync_users WHERE id='m29-existing-user'").get();
  db.exec(migration29);
  assert.deepEqual(db.prepare("SELECT * FROM sync_users WHERE id='m29-existing-user'").get(), before);
  assert.deepEqual({ ...db.prepare('SELECT * FROM pro_auth_state').get() }, {
    singleton_id: 1, generation: 1, active_code_slot: 'A', legacy_compat_enabled: 1,
    legacy_retired_at: null, updated_at: 0
  });
  db.exec(migration29);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pro_auth_state').get().n, 1);
  db.exec("UPDATE pro_auth_state SET generation=2, active_code_slot='B', legacy_compat_enabled=0, legacy_retired_at=2, updated_at=2");
  db.exec(migration29);
  assert.equal(db.prepare('SELECT generation FROM pro_auth_state').get().generation, 2);
  assert.equal(db.prepare('SELECT legacy_compat_enabled FROM pro_auth_state').get().legacy_compat_enabled, 0);
  assert.throws(() => db.exec("UPDATE pro_auth_state SET legacy_compat_enabled=0, legacy_retired_at=NULL"));
  assert.throws(() => db.exec("UPDATE pro_auth_state SET generation=0"));
  assert.throws(() => db.exec("UPDATE pro_auth_state SET active_code_slot='C'"));
  assert.throws(() => db.exec("INSERT INTO pro_credentials VALUES ('bad','x',1,'global_pro',1,NULL)"));
  assert.throws(() => db.exec("INSERT INTO pro_credentials VALUES ('bad','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,'account',1,NULL)"));
  assert.equal(db.prepare("SELECT * FROM sync_users WHERE id='m29-existing-user'").get().id, before.id);
  db.close();
});

test('M30 is repeatable and preserves M29 state and credentials while constraining lockouts', () => {
  const db = new DatabaseSync(':memory:');
  migrateThrough25(db);
  db.exec(migration26);
  db.exec(migration27);
  db.exec(migration28);
  db.exec(migration29);
  db.prepare(`INSERT INTO pro_credentials
    (id, verifier, generation, scope, created_at) VALUES (?, ?, 1, 'global_pro', 1)`)
    .run('test-credential', 'a'.repeat(64));
  const before = db.prepare('SELECT * FROM pro_auth_state').get();
  db.exec(migration30);
  db.exec(migration30);
  assert.deepEqual(db.prepare('SELECT * FROM pro_auth_state').get(), before);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pro_credentials').get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='pro_auth_lockouts'").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='pro_auth_lockouts_last_failure_idx'").get().n, 1);
  assert.throws(() => db.prepare(`INSERT INTO pro_auth_lockouts VALUES (?, 0, 0, NULL, 1, 1)`).run('192.0.2.4'));
  assert.throws(() => db.prepare(`INSERT INTO pro_auth_lockouts VALUES (?, 5, 0, NULL, 1, 1)`).run('b'.repeat(64)));
  assert.throws(() => db.prepare(`INSERT INTO pro_auth_lockouts VALUES (?, 0, 3, NULL, 1, 1)`).run('b'.repeat(64)));
  assert.throws(() => db.prepare(`INSERT INTO pro_auth_lockouts VALUES (?, 0, 0, -1, 1, 1)`).run('b'.repeat(64)));
  db.close();
});

test('M21 preserves populated Account links and durable records while adding Port', () => {
  assert.equal((migration21.match(/INSERT OR IGNORE INTO sync_(?:membership_device_links|account_recovery_claims|account_delete_intents|membership_handoffs|chord_account_bridges|app_join_invitations)/gu) || []).length, 6,
    'deferred-cascade differences must not duplicate or omit existing lifecycle children');
  const db = new DatabaseSync(':memory:');
  migrateThrough20(db);
  db.prepare(`INSERT INTO sync_users
    (id,state,recovery_version,recovery_verifier,created_at,updated_at,recovery_created_at,recovery_rotated_at)
    VALUES ('user-1','active',1,?,1,1,1,1)`).run('1'.repeat(64));
  db.prepare(`INSERT INTO sync_devices
    (id,user_id,app_id,credential_version,credential_verifier,last_cursor,created_at,last_seen_at,paired_at)
    VALUES ('app-device-1','user-1','pitch',1,?,0,1,1,1)`).run('2'.repeat(64));
  db.prepare(`INSERT INTO sync_accounts
    (id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,recovery_created_at,recovery_rotated_at,admission_provenance)
    VALUES ('account-1','active',1,?,1,1,1,1,1,'qa')`).run('3'.repeat(64));
  db.prepare(`INSERT INTO sync_account_devices
    (id,account_id,credential_version,credential_verifier,created_at,last_seen_at)
    VALUES ('account-device-1','account-1',1,?,1,1)`).run('4'.repeat(64));
  db.exec(`INSERT INTO sync_account_memberships
    (id,account_id,app_id,state,sync_user_id,recovery_mode,generation,created_at,activated_at,updated_at)
    VALUES ('membership-1','account-1','pitch','active','user-1','account',1,1,1,1);
    INSERT INTO sync_membership_device_links
    (account_id,membership_id,app_device_id,account_device_id,linked_at)
    VALUES ('account-1','membership-1','app-device-1','account-device-1',1);
    INSERT INTO sync_account_managed_users
    (sync_user_id,account_id,membership_id,app_id,created_at)
    VALUES ('user-1','account-1','membership-1','pitch',1);
    INSERT INTO sync_records
    (user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,deleted_at,updated_by_device_id,last_operation_id,schema_version)
    VALUES ('user-1','pitch','settings','settings','{}','hash',1,1,NULL,'app-device-1','operation-1',1);
    INSERT INTO sync_changes
    (user_id,app_id,record_type,record_id,revision,operation_id,operation_hash,payload_json,payload_hash,deleted_at,changed_at,schema_version)
    VALUES ('user-1','pitch','settings','settings',1,'operation-1','operation-hash','{}','hash',NULL,1,1);`);

  db.exec(migration21);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM sync_account_memberships').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM sync_membership_device_links').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM sync_account_managed_users').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM sync_records').get().count, 1);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM sync_changes').get().count, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.prepare(`INSERT INTO sync_account_memberships
    (id,account_id,app_id,state,recovery_mode,generation,created_at,updated_at)
    VALUES ('port-membership','account-1','port','pending','account',1,2,2)`).run();
  assert.equal(db.prepare("SELECT app_id FROM sync_account_memberships WHERE id='port-membership'").get().app_id, 'port');
  db.close();
});

test('fresh migration creates the isolated sync schema and indexes', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'sync_%' ORDER BY name").all().map((row) => row.name);
  assert.deepEqual(tables, [
    'sync_account_activity', 'sync_account_asset_quotas', 'sync_account_delete_intents',
    'sync_account_devices', 'sync_account_lifecycle_operations',
    'sync_account_managed_users',
    'sync_account_memberships', 'sync_account_qa_enrollments', 'sync_account_qa_sessions',
    'sync_account_recovery_attempts', 'sync_account_recovery_claims',
    'sync_account_recovery_rotations', 'sync_account_runtime_control',
    'sync_account_start_operations', 'sync_accounts', 'sync_app_device_sync_safety', 'sync_app_join_invitations',
    'sync_asset_daily_variant_counts', 'sync_asset_operations', 'sync_assets',
    'sync_changes', 'sync_chord_account_bridges', 'sync_datasets', 'sync_devices', 'sync_enrollment_codes',
    'sync_membership_device_links', 'sync_membership_handoffs', 'sync_port_device_operations', 'sync_port_join_invitations', 'sync_records',
    'sync_runtime_control', 'sync_users'
  ]);
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pairing_codes'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sync_changes_pull'").get());
  assert(db.prepare("SELECT schema_version FROM sync_records LIMIT 1"));
  assert(db.prepare("SELECT schema_version FROM sync_changes LIMIT 1"));
  assert(db.prepare("SELECT last_change_seq FROM sync_datasets LIMIT 1"));
  assert(db.prepare("SELECT pairing_pending_at, paired_at FROM sync_devices LIMIT 1"));
  assert(db.prepare("SELECT consume_mode, qa_issuer_session_id, qa_app_session_id FROM sync_membership_handoffs LIMIT 1"));
  assert(db.prepare("SELECT target_app_id, code_verifier, consume_mode, admission_provenance FROM sync_app_join_invitations LIMIT 1"));
  assert(db.prepare(`SELECT code_verifier, account_id, admission_provenance,
    created_by_account_device_id, expected_recovery_version, expected_account_generation,
    issue_operation_id, consume_operation_id FROM sync_port_join_invitations LIMIT 1`));
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_port_join_active_issuer'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sync_port_device_operations_account'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sync_assets_cleanup'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sync_assets_practice_owner'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_sync_account_activity_lifecycle'").get());
  assert(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_app_device_sync_safety_membership'").get());
  assert(db.prepare('SELECT storage_category FROM sync_assets LIMIT 1'));
  assert(db.prepare('SELECT owner_record_type, owner_record_id, original_filename FROM sync_assets LIMIT 1'));
  assert.match(db.prepare(`SELECT sql FROM sqlite_master
    WHERE type = 'table' AND name = 'sync_account_memberships'`).get().sql, /'port'/);
  assert.match(db.prepare(`SELECT sql FROM sqlite_master
    WHERE type = 'table' AND name = 'sync_records'`).get().sql, /'practice_cycle'/);
  assert.match(db.prepare(`SELECT sql FROM sqlite_master
    WHERE type = 'table' AND name = 'sync_records'`).get().sql, /'practice_attachment'/);
  assert(db.prepare("SELECT admission_provenance FROM sync_accounts LIMIT 1"));
  assert(db.prepare('SELECT delete_requested_at, purge_after FROM sync_account_memberships LIMIT 1'));
  assert(db.prepare(`SELECT prepare_operation_id, prepare_fingerprint,
    commit_operation_id, commit_fingerprint FROM sync_account_recovery_claims LIMIT 1`));
  assert(db.prepare(`SELECT requested_by_account_device_id, expected_recovery_version,
    expected_account_generation, next_recovery_verifier, prepare_operation_id,
    prepare_fingerprint, commit_operation_id, commit_fingerprint
    FROM sync_account_recovery_rotations LIMIT 1`));
  assert(db.prepare(`SELECT issue_operation_id, issue_fingerprint,
    consume_operation_id, consume_fingerprint FROM sync_account_delete_intents LIMIT 1`));
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

test('M26 preserves existing image assets and idempotency operations while adding practice ownership', () => {
  const db = new DatabaseSync(':memory:');
  migrateThrough25(db);
  db.prepare(`INSERT INTO sync_assets (
    asset_id, account_id, membership_id, sync_user_id, kind, state, storage_category,
    content_hash, mime_type, byte_size, width, height, object_key, object_version,
    created_by_device_id, created_at, updated_at, uploaded_at, committed_at
  ) VALUES ('123e4567-e89b-42d3-a456-426614174200', 'account-a', 'membership-a', 'user-a',
    'gear_photo_final', 'available', 'image', ?, 'image/webp', 12, 512, 512,
    'assets/existing-image', 1, 'device-a', 1, 2, 2, 2)`).run('a'.repeat(64));
  db.prepare(`INSERT INTO sync_asset_operations (
    operation_id, asset_id, account_id, sync_user_id, app_device_id,
    request_fingerprint, created_at, updated_at
  ) VALUES ('223e4567-e89b-42d3-a456-426614174200',
    '123e4567-e89b-42d3-a456-426614174200', 'account-a', 'user-a', 'device-a', ?, 1, 2)`)
    .run('b'.repeat(64));
  db.exec(migration26);
  const asset = db.prepare(`SELECT kind, state, storage_category, owner_record_type,
    owner_record_id, original_filename FROM sync_assets`).get();
  assert.deepEqual({ ...asset }, {
    kind: 'gear_photo_final', state: 'available', storage_category: 'image',
    owner_record_type: null, owner_record_id: null, original_filename: null
  });
  assert.equal(db.prepare('SELECT COUNT(*) count FROM sync_asset_operations').get().count, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
});

test('M27 preserves structured data and registers Practice attachment records and changes', () => {
  const db = new DatabaseSync(':memory:');
  migrateThrough25(db);
  db.exec(migration26);
  db.prepare(`INSERT INTO sync_users
    (id,state,recovery_version,recovery_verifier,created_at,updated_at,recovery_created_at,recovery_rotated_at)
    VALUES ('port-user','active',1,?,1,1,1,1)`).run('a'.repeat(64));
  db.prepare(`INSERT INTO sync_records
    (user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,
     deleted_at,updated_by_device_id,last_operation_id,schema_version)
    VALUES ('port-user','port','gear_item','gear-1','{}',?,1,1,NULL,NULL,'gear-op',1)`)
    .run('b'.repeat(64));
  db.prepare(`INSERT INTO sync_changes
    (change_seq,user_id,app_id,record_type,record_id,revision,operation_id,operation_hash,
     payload_json,payload_hash,deleted_at,changed_at,schema_version)
    VALUES (27,'port-user','port','gear_item','gear-1',1,'gear-op',?,'{}',?,NULL,1,1)`)
    .run('c'.repeat(64), 'b'.repeat(64));

  db.exec(migration27);

  assert.equal(db.prepare("SELECT COUNT(*) count FROM sync_records WHERE record_type='gear_item'").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM sync_changes WHERE change_seq=27").get().count, 1);
  const insertRecord = db.prepare(`INSERT INTO sync_records
    (user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,
     deleted_at,updated_by_device_id,last_operation_id,schema_version)
    VALUES ('port-user','port',?,?,'{}',?,1,2,NULL,NULL,?,1)`);
  insertRecord.run('practice_attachment', 'attachment-1', 'd'.repeat(64), 'attachment-op');
  insertRecord.run('practice_attachment_set', 'practice-1', 'e'.repeat(64), 'attachment-set-op');
  db.prepare(`INSERT INTO sync_changes
    (user_id,app_id,record_type,record_id,revision,operation_id,operation_hash,
     payload_json,payload_hash,deleted_at,changed_at,schema_version)
    VALUES ('port-user','port','practice_attachment','attachment-1',1,'attachment-op',?,
      '{}',?,NULL,2,1)`).run('f'.repeat(64), 'd'.repeat(64));
  assert.throws(() => insertRecord.run('unregistered', 'bad-1', '0'.repeat(64), 'bad-op'));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
});

test('M10 admission provenance migration preserves existing 0017 QA and Legacy data', () => {
  const db = new DatabaseSync(':memory:');
  migrateThrough17(db);

  db.prepare(`INSERT INTO sync_users (
    id,state,recovery_version,recovery_verifier,created_at,updated_at,recovery_created_at,recovery_rotated_at
  ) VALUES ('legacy-user','active',1,?,1,1,1,1)`).run('0'.repeat(64));
  db.prepare(`INSERT INTO sync_devices (
    id,user_id,app_id,credential_version,credential_verifier,label,last_cursor,
    created_at,last_seen_at,revoked_at,pairing_pending_at,paired_at
  ) VALUES ('legacy-device','legacy-user','chord',1,?,'Legacy',0,1,1,NULL,NULL,1)`).run('1'.repeat(64));
  db.prepare(`INSERT INTO sync_datasets (
    user_id,app_id,state,schema_version,record_count,manifest_hash,min_change_seq,
    initialized_at,updated_at,last_change_seq
  ) VALUES ('legacy-user','chord','ready',1,1,?,0,1,1,1)`).run('2'.repeat(64));
  db.prepare(`INSERT INTO sync_records (
    user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,
    deleted_at,updated_by_device_id,last_operation_id,schema_version
  ) VALUES ('legacy-user','chord','chord','legacy-record','{}',?,1,1,NULL,'legacy-device','legacy-op',1)`)
    .run('3'.repeat(64));
  db.prepare(`INSERT INTO sync_changes (
    user_id,app_id,record_type,record_id,revision,operation_id,operation_hash,
    payload_json,payload_hash,deleted_at,changed_at,schema_version
  ) VALUES ('legacy-user','chord','chord','legacy-record',1,'legacy-change',?,'{}',?,NULL,1,1)`)
    .run('4'.repeat(64), '3'.repeat(64));

  db.prepare(`INSERT INTO sync_accounts (
    id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,
    recovery_created_at,recovery_rotated_at
  ) VALUES ('qa-account','active',1,?,1,1,1,1,1)`).run('5'.repeat(64));
  db.prepare(`INSERT INTO sync_account_devices (
    id,account_id,credential_version,credential_verifier,label,created_at,last_seen_at,revoked_at
  ) VALUES ('qa-account-device','qa-account',1,?,'QA Port',1,1,NULL)`).run('6'.repeat(64));
  db.prepare(`INSERT INTO sync_users (
    id,state,recovery_version,recovery_verifier,created_at,updated_at,recovery_created_at,recovery_rotated_at
  ) VALUES ('qa-app-user','active',1,?,1,1,1,1)`).run('7'.repeat(64));
  db.prepare(`INSERT INTO sync_devices (
    id,user_id,app_id,credential_version,credential_verifier,label,last_cursor,
    created_at,last_seen_at,revoked_at,pairing_pending_at,paired_at
  ) VALUES ('qa-app-device','qa-app-user','pitch',1,?,'QA Pitch',0,1,1,NULL,NULL,1)`).run('8'.repeat(64));
  db.prepare(`INSERT INTO sync_datasets (
    user_id,app_id,state,schema_version,record_count,manifest_hash,min_change_seq,
    initialized_at,updated_at,last_change_seq
  ) VALUES ('qa-app-user','pitch','ready',1,0,?,0,1,1,0)`).run('9'.repeat(64));
  db.prepare(`INSERT INTO sync_account_memberships (
    id,account_id,app_id,state,sync_user_id,recovery_mode,generation,created_at,
    activated_at,updated_at,deleted_at
  ) VALUES ('qa-membership','qa-account','pitch','active','qa-app-user','account',1,1,1,1,NULL)`).run();
  db.prepare(`INSERT INTO sync_account_managed_users (
    sync_user_id,account_id,membership_id,app_id,created_at
  ) VALUES ('qa-app-user','qa-account','qa-membership','pitch',1)`).run();
  db.prepare(`INSERT INTO sync_membership_device_links (
    account_id,membership_id,app_device_id,account_device_id,linked_at
  ) VALUES ('qa-account','qa-membership','qa-app-device','qa-account-device',1)`).run();
  db.prepare(`INSERT INTO sync_account_qa_enrollments (
    id,code_verifier,created_at,expires_at,consumed_at,cancelled_at,consumed_by_session_id
  ) VALUES ('qa-enrollment',?,1,100,2,NULL,'qa-session')`).run('a'.repeat(64));
  db.prepare(`INSERT INTO sync_account_qa_sessions (
    id,credential_verifier,enrollment_id,scope,account_id,app_id,app_device_id,
    parent_session_id,created_at,expires_at,last_used_at,revoked_at,generation
  ) VALUES ('qa-session',?,'qa-enrollment','port','qa-account',NULL,NULL,NULL,1,100,1,NULL,1)`)
    .run('b'.repeat(64));
  db.prepare(`INSERT INTO sync_app_join_invitations (
    invitation_id,code_verifier,account_id,membership_id,target_app_id,
    created_by_account_device_id,created_at,expires_at,issue_operation_id,
    issue_fingerprint,qa_issuer_session_id
  ) VALUES ('11111111-1111-4111-8111-111111111111',?,'qa-account','qa-membership','pitch',
    'qa-account-device',1,100,'qa-issue',?,'qa-session')`).run('c'.repeat(64), 'd'.repeat(64));

  const legacyBefore = db.prepare(`SELECT
    (SELECT COUNT(*) FROM sync_users WHERE id='legacy-user') users,
    (SELECT COUNT(*) FROM sync_devices WHERE user_id='legacy-user') devices,
    (SELECT COUNT(*) FROM sync_datasets WHERE user_id='legacy-user') datasets,
    (SELECT COUNT(*) FROM sync_records WHERE user_id='legacy-user') records,
    (SELECT COUNT(*) FROM sync_changes WHERE user_id='legacy-user') changes`).get();
  const qaBefore = db.prepare(`SELECT
    (SELECT COUNT(*) FROM sync_accounts WHERE id='qa-account') accounts,
    (SELECT COUNT(*) FROM sync_account_memberships WHERE account_id='qa-account') memberships,
    (SELECT COUNT(*) FROM sync_datasets WHERE user_id='qa-app-user') datasets,
    (SELECT COUNT(*) FROM sync_app_join_invitations WHERE account_id='qa-account') invitations`).get();
  const invitationBefore = { ...db.prepare('SELECT * FROM sync_app_join_invitations').get() };

  db.exec(migration18);

  assert.deepEqual({ ...db.prepare(`SELECT
    (SELECT COUNT(*) FROM sync_users WHERE id='legacy-user') users,
    (SELECT COUNT(*) FROM sync_devices WHERE user_id='legacy-user') devices,
    (SELECT COUNT(*) FROM sync_datasets WHERE user_id='legacy-user') datasets,
    (SELECT COUNT(*) FROM sync_records WHERE user_id='legacy-user') records,
    (SELECT COUNT(*) FROM sync_changes WHERE user_id='legacy-user') changes`).get() }, { ...legacyBefore });
  assert.deepEqual({ ...db.prepare(`SELECT
    (SELECT COUNT(*) FROM sync_accounts WHERE id='qa-account') accounts,
    (SELECT COUNT(*) FROM sync_account_memberships WHERE account_id='qa-account') memberships,
    (SELECT COUNT(*) FROM sync_datasets WHERE user_id='qa-app-user') datasets,
    (SELECT COUNT(*) FROM sync_app_join_invitations WHERE account_id='qa-account') invitations`).get() }, { ...qaBefore });
  assert.equal(db.prepare("SELECT admission_provenance FROM sync_accounts WHERE id='qa-account'").get().admission_provenance, 'qa');
  const invitationAfter = { ...db.prepare('SELECT * FROM sync_app_join_invitations').get() };
  assert.equal(invitationAfter.admission_provenance, 'qa');
  delete invitationAfter.admission_provenance;
  assert.deepEqual(invitationAfter, invitationBefore);
  db.prepare("UPDATE sync_app_join_invitations SET cancelled_at=3 WHERE issue_operation_id='qa-issue'").run();
  db.prepare(`INSERT INTO sync_app_join_invitations (
    invitation_id,code_verifier,account_id,membership_id,target_app_id,
    created_by_account_device_id,created_at,expires_at,issue_operation_id,
    issue_fingerprint,qa_issuer_session_id
  ) VALUES ('44444444-4444-4444-8444-444444444444',?,'qa-account','qa-membership','pitch',
    'qa-account-device',1,100,'old-worker-qa-issue',?,'qa-session')`)
    .run('e'.repeat(64), 'f'.repeat(64));
  assert.equal(db.prepare("SELECT admission_provenance FROM sync_app_join_invitations WHERE issue_operation_id='old-worker-qa-issue'")
    .get().admission_provenance, 'qa', 'old Worker QA insert remains compatible after migration');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  db.close();
});

test('M10 admission provenance constraints distinguish production and QA invitations', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  db.prepare(`INSERT INTO sync_accounts (
    id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,
    recovery_created_at,recovery_rotated_at,admission_provenance
  ) VALUES ('production-account','active',1,?,1,1,1,1,1,'production')`).run('e'.repeat(64));
  db.prepare(`INSERT INTO sync_account_devices (
    id,account_id,credential_version,credential_verifier,label,created_at,last_seen_at,revoked_at
  ) VALUES ('production-device','production-account',1,?,'Production Port',1,1,NULL)`).run('f'.repeat(64));
  db.prepare(`INSERT INTO sync_account_memberships (
    id,account_id,app_id,state,sync_user_id,recovery_mode,generation,created_at,
    activated_at,updated_at,deleted_at
  ) VALUES ('production-membership','production-account','rhythm','pending',NULL,'account',1,1,NULL,1,NULL)`).run();
  const insert = db.prepare(`INSERT INTO sync_app_join_invitations (
    invitation_id,code_verifier,account_id,membership_id,target_app_id,admission_provenance,
    created_by_account_device_id,created_at,expires_at,issue_operation_id,
    issue_fingerprint,qa_issuer_session_id
  ) VALUES (?,?, 'production-account','production-membership','rhythm',?,
    'production-device',1,100,?,?,?)`);
  insert.run('22222222-2222-4222-8222-222222222222', '1'.repeat(64), 'production', 'production-issue', '2'.repeat(64), null);
  assert.equal(db.prepare("SELECT admission_provenance FROM sync_app_join_invitations WHERE invitation_id LIKE '2222%'").get().admission_provenance, 'production');
  assert.throws(() => insert.run(
    '33333333-3333-4333-8333-333333333333', '3'.repeat(64), 'qa', 'qa-without-issuer', '4'.repeat(64), null
  ));
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  db.close();
});

test('M5 migration preserves Chord rows and permits only registered Pitch storage types', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(migration);
  db.exec(migration2);
  db.prepare(`INSERT INTO sync_users (id,state,recovery_version,recovery_verifier,created_at,updated_at)
    VALUES ('u', 'active', 1, ?, 1, 1)`).run('a'.repeat(64));
  db.prepare(`INSERT INTO sync_records (
    user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,
    deleted_at,updated_by_device_id,last_operation_id,schema_version
  ) VALUES ('u','chord','chord','c1','{}',?,1,1,NULL,NULL,'op',1)`).run('b'.repeat(64));
  db.exec(migration3); db.exec(migration4); db.exec(migration5); db.exec(migration6);
  db.exec(migration7); db.exec(migration8); db.exec(migration9); db.exec(migration10);
  db.exec(migration11);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE app_id='chord'").get().count, 1);
  db.prepare(`INSERT INTO sync_records (
    user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,
    deleted_at,updated_by_device_id,last_operation_id,schema_version
  ) VALUES ('u','pitch','custom_chord','p1','{}',?,1,1,NULL,NULL,'op2',1)`).run('c'.repeat(64));
  assert.throws(() => db.prepare(`INSERT INTO sync_records (
    user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,
    deleted_at,updated_by_device_id,last_operation_id,schema_version
  ) VALUES ('u','pitch','unregistered','p2','{}',?,1,1,NULL,NULL,'op3',1)`).run('d'.repeat(64)));
  db.close();
});

test('M6 migration preserves Chord and Pitch rows and permits registered Rhythm storage types', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(migration); db.exec(migration2); db.exec(migration3); db.exec(migration4);
  db.exec(migration5); db.exec(migration6); db.exec(migration7); db.exec(migration8);
  db.exec(migration9); db.exec(migration10); db.exec(migration11);
  db.prepare(`INSERT INTO sync_users (id,state,recovery_version,recovery_verifier,created_at,updated_at)
    VALUES ('u-m6', 'active', 1, ?, 1, 1)`).run('e'.repeat(64));
  let insert = db.prepare(`INSERT INTO sync_records (
    user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,
    deleted_at,updated_by_device_id,last_operation_id,schema_version
  ) VALUES ('u-m6',?,?,?,'{}',?,1,1,NULL,NULL,?,1)`);
  insert.run('chord', 'chord', 'c1', 'a'.repeat(64), 'op-c');
  insert.run('pitch', 'custom_chord', 'p1', 'b'.repeat(64), 'op-p');
  db.prepare(`INSERT INTO sync_changes (
    user_id,app_id,record_type,record_id,revision,operation_id,operation_hash,
    payload_json,payload_hash,deleted_at,changed_at,schema_version
  ) VALUES ('u-m6','pitch','custom_chord','p1',1,'change-p','hash-p','{}',?,NULL,1,1)`)
    .run('b'.repeat(64));
  db.exec(migration12);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE app_id IN ('chord','pitch')").get().count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sync_changes WHERE app_id='pitch'").get().count, 1);
  insert = db.prepare(`INSERT INTO sync_records (
    user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,
    deleted_at,updated_by_device_id,last_operation_id,schema_version
  ) VALUES ('u-m6',?,?,?,'{}',?,1,1,NULL,NULL,?,1)`);
  insert.run('rhythm', 'custom_stage', 'r1', 'c'.repeat(64), 'op-r');
  const insertChange = db.prepare(`INSERT INTO sync_changes (
    user_id,app_id,record_type,record_id,revision,operation_id,operation_hash,
    payload_json,payload_hash,deleted_at,changed_at,schema_version
  ) VALUES ('u-m6',?,?,?,1,?,?,'{}',?,NULL,1,1)`);
  insertChange.run('rhythm', 'custom_stage', 'r1', 'change-r', 'hash-r', 'c'.repeat(64));
  assert.throws(() => insert.run('rhythm', 'unregistered', 'r2', 'd'.repeat(64), 'op-bad'));
  assert.throws(() => insertChange.run('rhythm', 'unregistered', 'r2', 'change-bad', 'hash-bad', 'd'.repeat(64)));
  db.close();
});

test('M7 migration preserves prior app rows and permits only registered Fretboard storage types', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(migration); db.exec(migration2); db.exec(migration3); db.exec(migration4);
  db.exec(migration5); db.exec(migration6); db.exec(migration7); db.exec(migration8);
  db.exec(migration9); db.exec(migration10); db.exec(migration11); db.exec(migration12);
  db.prepare(`INSERT INTO sync_users (id,state,recovery_version,recovery_verifier,created_at,updated_at)
    VALUES ('u-m7', 'active', 1, ?, 1, 1)`).run('f'.repeat(64));
  let insert = db.prepare(`INSERT INTO sync_records (
    user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,
    deleted_at,updated_by_device_id,last_operation_id,schema_version
  ) VALUES ('u-m7',?,?,?,'{}',?,1,1,NULL,NULL,?,1)`);
  insert.run('chord', 'chord', 'c1', 'a'.repeat(64), 'op-c');
  insert.run('pitch', 'custom_chord', 'p1', 'b'.repeat(64), 'op-p');
  insert.run('rhythm', 'custom_stage', 'r1', 'c'.repeat(64), 'op-r');
  db.exec(migration13);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE app_id IN ('chord','pitch','rhythm')").get().count, 3);
  insert = db.prepare(`INSERT INTO sync_records (
    user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,
    deleted_at,updated_by_device_id,last_operation_id,schema_version
  ) VALUES ('u-m7',?,?,?,'{}',?,1,1,NULL,NULL,?,1)`);
  insert.run('fretboard', 'custom_route', 'f1', 'd'.repeat(64), 'op-f');
  const insertChange = db.prepare(`INSERT INTO sync_changes (
    user_id,app_id,record_type,record_id,revision,operation_id,operation_hash,
    payload_json,payload_hash,deleted_at,changed_at,schema_version
  ) VALUES ('u-m7',?,?,?,1,?,?,'{}',?,NULL,1,1)`);
  insertChange.run('fretboard', 'custom_quiz', 'f2', 'change-f', 'hash-f', 'e'.repeat(64));
  assert.throws(() => insert.run('fretboard', 'unregistered', 'f3', 'f'.repeat(64), 'op-bad'));
  assert.throws(() => insertChange.run('fretboard', 'unregistered', 'f3', 'change-bad', 'hash-bad', 'f'.repeat(64)));
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

test('M4 migration adds only bridge metadata and leaves an existing Chord identity untouched', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(migration);
  db.exec(migration2);
  db.exec(migration3);
  db.exec(migration4);
  db.exec(migration5);
  db.exec(migration6);
  db.exec(migration7);
  db.exec(migration8);
  db.exec(migration9);
  db.prepare(`
    INSERT INTO sync_users (
      id, state, recovery_version, recovery_verifier, created_at, updated_at,
      recovery_created_at, recovery_rotated_at
    ) VALUES ('m4-legacy', 'active', 1, ?, 1, 1, 1, 1)
  `).run('6'.repeat(64));
  db.prepare(`
    INSERT INTO sync_devices (
      id, user_id, app_id, credential_version, credential_verifier, label,
      last_cursor, created_at, last_seen_at, revoked_at, pairing_pending_at, paired_at
    ) VALUES ('m4-device', 'm4-legacy', 'chord', 1, ?, NULL,
              0, 1, 1, NULL, NULL, 1)
  `).run('7'.repeat(64));
  db.prepare(`
    INSERT INTO sync_datasets (
      user_id, app_id, state, schema_version, record_count, manifest_hash,
      min_change_seq, initialized_at, updated_at, last_change_seq
    ) VALUES ('m4-legacy', 'chord', 'ready', 1, 0, ?, 0, 1, 1, 0)
  `).run('8'.repeat(64));
  const before = { ...db.prepare(`
    SELECT u.state, u.recovery_version, u.recovery_verifier,
           d.credential_verifier, d.revoked_at,
           s.state AS dataset_state, s.record_count, s.manifest_hash
    FROM sync_users u
    JOIN sync_devices d ON d.user_id = u.id
    JOIN sync_datasets s ON s.user_id = u.id AND s.app_id = d.app_id
    WHERE u.id = 'm4-legacy'
  `).get() };

  db.exec(migration10);

  assert.deepEqual({ ...db.prepare(`
    SELECT u.state, u.recovery_version, u.recovery_verifier,
           d.credential_verifier, d.revoked_at,
           s.state AS dataset_state, s.record_count, s.manifest_hash
    FROM sync_users u
    JOIN sync_devices d ON d.user_id = u.id
    JOIN sync_datasets s ON s.user_id = u.id AND s.app_id = d.app_id
    WHERE u.id = 'm4-legacy'
  `).get() }, before);
  assert(db.prepare(`
    SELECT legacy_recovery_disabled_at FROM sync_account_memberships LIMIT 1
  `));
  assert(db.prepare(`
    SELECT bridge_id, state, generation, prepare_operation_id, dual_operation_id,
           finalize_operation_id, rollback_operation_id
    FROM sync_chord_account_bridges LIMIT 1
  `));
  assert(db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'index' AND name = 'idx_sync_chord_account_bridges_active_user'
  `).get());
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sync_chord_account_bridges').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sync_account_memberships').get().count, 0);
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
