import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { UPSERT_APP_REQUEST_SQL } from '../src/database.js';

const migration = readFileSync(new URL('../migrations/0001_create_app_requests.sql', import.meta.url), 'utf8');

function createDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec(migration);
  return database;
}

function upsert(database, {
  requestKey = 'ios:123456789',
  platform = 'ios',
  identifier = '123456789',
  canonicalStoreUrl = 'https://apps.apple.com/app/id123456789',
  appName = 'Example',
  sourceVersion = '0.9.0'
} = {}) {
  return database.prepare(UPSERT_APP_REQUEST_SQL).get(
    requestKey,
    platform,
    identifier,
    canonicalStoreUrl,
    appName,
    sourceVersion
  );
}

test('fresh migration creates the table and queue index', () => {
  const database = createDatabase();
  assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_requests'").get().name, 'app_requests');
  assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='app_requests_queue'").get().name, 'app_requests_queue');
  database.close();
});

test('migration constraints reject invalid platform, count, status, and unsupported app key state', () => {
  const database = createDatabase();
  const insert = database.prepare(`
    INSERT INTO app_requests (
      request_key, platform, store_identifier, canonical_store_url,
      request_count, status, app_key
    ) VALUES (?, ?, 'id', 'https://example.test', ?, ?, ?)
  `);

  assert.throws(() => insert.run('bad-platform', 'web', 1, 'pending', null));
  assert.throws(() => insert.run('bad-count', 'ios', 0, 'pending', null));
  assert.throws(() => insert.run('bad-status', 'ios', 1, 'unknown', null));
  assert.throws(() => insert.run('bad-supported', 'ios', 1, 'supported', null));
  assert.doesNotThrow(() => insert.run('valid-supported', 'ios', 1, 'supported', 'example'));
  database.close();
});

test('reapplying the initial SQL cannot destroy existing data', () => {
  const database = createDatabase();
  upsert(database);
  assert.throws(() => database.exec(migration));
  assert.equal(database.prepare('SELECT request_count FROM app_requests').get().request_count, 1);
  database.close();
});

test('atomic upsert increments count and preserves first_seen, status, and app_key', () => {
  const database = createDatabase();
  assert.equal(upsert(database).request_key, 'ios:123456789');
  database.prepare(`
    UPDATE app_requests
    SET first_seen = '2020-01-01 00:00:00',
        last_seen = '2020-01-01 00:00:00',
        status = 'researching',
        app_key = 'example'
    WHERE request_key = 'ios:123456789'
  `).run();

  upsert(database, { appName: 'New name', sourceVersion: '0.9.1' });
  const row = database.prepare('SELECT * FROM app_requests WHERE request_key = ?').get('ios:123456789');
  assert.equal(row.request_count, 2);
  assert.equal(row.first_seen, '2020-01-01 00:00:00');
  assert.notEqual(row.last_seen, '2020-01-01 00:00:00');
  assert.equal(row.latest_app_name, 'New name');
  assert.equal(row.latest_source_version, '0.9.1');
  assert.equal(row.status, 'researching');
  assert.equal(row.app_key, 'example');
  database.close();
});

test('empty or null appName preserves the existing name', () => {
  const database = createDatabase();
  upsert(database, { appName: 'Existing name' });
  upsert(database, { appName: '' });
  upsert(database, { appName: null });
  assert.equal(database.prepare('SELECT latest_app_name FROM app_requests').get().latest_app_name, 'Existing name');
  database.close();
});

test('supported and rejected statuses remain unchanged while demand increases', () => {
  for (const [status, appKey] of [['supported', 'example'], ['rejected', null]]) {
    const database = createDatabase();
    upsert(database);
    database.prepare('UPDATE app_requests SET status = ?, app_key = ?').run(status, appKey);
    upsert(database);
    const row = database.prepare('SELECT request_count, status, app_key FROM app_requests').get();
    assert.equal(row.request_count, 2);
    assert.equal(row.status, status);
    assert.equal(row.app_key, appKey);
    database.close();
  }
});

test('TikTok JP and US Store IDs remain separate records', () => {
  const database = createDatabase();
  upsert(database, {
    requestKey: 'ios:1235601864',
    identifier: '1235601864',
    canonicalStoreUrl: 'https://apps.apple.com/app/id1235601864'
  });
  upsert(database, {
    requestKey: 'ios:835599320',
    identifier: '835599320',
    canonicalStoreUrl: 'https://apps.apple.com/app/id835599320'
  });
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM app_requests').get().count, 2);
  database.close();
});
