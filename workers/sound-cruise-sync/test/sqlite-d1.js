import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const migration1 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0001_create_sync_foundation.sql'), 'utf8');
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
const migration31 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0031_add_sync_target_user_labels.sql'), 'utf8');

function statementWrapper(database, sql, values = []) {
  return {
    sql,
    values,
    bind(...nextValues) { return statementWrapper(database, sql, nextValues); },
    async first() { return database.prepare(sql).get(...values) || null; },
    async all() { return { success: true, results: database.prepare(sql).all(...values) }; },
    async run() {
      const result = database.prepare(sql).run(...values);
      return { success: true, meta: { changes: Number(result.changes) } };
    }
  };
}

export function createSqliteD1() {
  const database = new DatabaseSync(':memory:');
  database.exec(migration1);
  database.exec(migration2);
  database.exec(migration3);
  database.exec(migration4);
  database.exec(migration5);
  database.exec(migration6);
  database.exec(migration7);
  database.exec(migration8);
  database.exec(migration9);
  database.exec(migration10);
  database.exec(migration11);
  database.exec(migration12);
  database.exec(migration13);
  database.exec(migration14);
  database.exec(migration15);
  database.exec(migration16);
  database.exec(migration17);
  database.exec(migration18);
  database.exec(migration19);
  database.exec(migration20);
  database.exec(migration21);
  database.exec(migration22);
  database.exec(migration23);
  database.exec(migration24);
  database.exec(migration25);
  database.exec(migration26);
  database.exec(migration27);
  database.exec(migration28);
  database.exec(migration29);
  database.exec(migration30);
  database.exec(migration31);
  let bookmark = 0;
  const binding = {
    prepare(sql) { return statementWrapper(database, sql); },
    async batch(statements) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) {
          const isRead = /^\s*(SELECT|PRAGMA|WITH)\b/i.test(statement.sql);
          results.push(isRead ? await statement.all() : await statement.run());
        }
        database.exec('COMMIT');
        bookmark += 1;
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    withSession() { return binding; },
    getBookmark() { return `local-${bookmark}`; },
    close() { database.close(); },
    raw: database
  };
  return binding;
}

export function seedIdentity(binding, input = {}) {
  const userId = input.userId || '123e4567-e89b-42d3-a456-426614174001';
  const deviceId = input.deviceId || '123e4567-e89b-42d3-a456-426614174000';
  const appId = input.appId || 'chord';
  const verifier = input.verifier || 'f'.repeat(64);
  binding.raw.prepare(`
    INSERT INTO sync_users (id,state,recovery_version,recovery_verifier,created_at,updated_at)
    VALUES (?, 'provisioning', 0, NULL, 1, 1)
  `).run(userId);
  binding.raw.prepare(`
    INSERT INTO sync_devices (
      id,user_id,app_id,credential_version,credential_verifier,label,last_cursor,
      created_at,last_seen_at,revoked_at
    ) VALUES (?, ?, ?, 1, ?, NULL, 0, 1, 1, NULL)
  `).run(deviceId, userId, appId, verifier);
  binding.raw.prepare(`
    INSERT INTO sync_datasets (
      user_id,app_id,state,schema_version,record_count,manifest_hash,min_change_seq,
      initialized_at,updated_at,last_change_seq
    ) VALUES (?, ?, 'initializing', 1, 0, NULL, 0, NULL, 1, 0)
  `).run(userId, appId);
  return { userId, deviceId, appId, userState: 'provisioning' };
}
