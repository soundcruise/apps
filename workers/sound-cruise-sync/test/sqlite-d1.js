import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const migration1 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0001_create_sync_foundation.sql'), 'utf8');
const migration2 = fs.readFileSync(path.join(import.meta.dirname, '../migrations/0002_add_sync_revision_metadata.sql'), 'utf8');

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
