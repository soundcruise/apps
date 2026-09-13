import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const configPath = path.join(import.meta.dirname, '../wrangler.jsonc');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

test('production Worker remains exact-origin, observable, and secret-free in repo config', () => {
  const database = config.d1_databases.find((entry) => entry.binding === 'SYNC_DB');
  const origins = config.vars.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim());

  assert.equal(config.name, 'sound-cruise-sync');
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.triggers, { crons: ['15 3 * * *'] });
  assert.equal(database.database_name, 'sound-cruise-sync');
  assert.match(database.database_id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  assert.notEqual(database.database_id, '00000000-0000-0000-0000-000000000000');
  assert.notEqual(database.database_id, 'f39ebfce-a042-4914-9697-7e93c89f38b3');
  assert.deepEqual(origins, ['https://soundcruise.jp']);
  assert.equal(origins.includes('*'), false);
  assert.equal(config.vars.TURNSTILE_EXPECTED_HOSTNAME, 'soundcruise.jp');
  assert.equal(config.vars.TURNSTILE_EXPECTED_ACTION, 'sound_cruise_sync_start');
  assert.equal(config.vars.TURNSTILE_PAIR_EXPECTED_ACTION, 'sound_cruise_sync_pair');
  assert.equal(config.vars.TURNSTILE_RECOVER_EXPECTED_ACTION, 'sound_cruise_sync_recover');
  assert.deepEqual(config.ratelimits.map((entry) => entry.name), [
    'START_RATE_LIMITER', 'SYNC_RATE_LIMITER', 'PAIRING_ISSUE_RATE_LIMITER', 'PAIR_RATE_LIMITER', 'RECOVERY_RATE_LIMITER'
  ]);
  assert.equal(Object.hasOwn(config.vars, 'SYNC_CREDENTIAL_PEPPER'), false);
  assert.equal(Object.hasOwn(config.vars, 'SYNC_RECOVERY_PEPPER'), false);
  assert.equal(Object.hasOwn(config.vars, 'TURNSTILE_SECRET_KEY'), false);
  assert.equal(Object.hasOwn(config.vars, 'TURNSTILE_PRODUCTION_SECRET_KEY'), false);
  assert.equal(Object.hasOwn(config.vars, 'SYNC_ENROLLMENT_PEPPER'), false);
  assert.equal(config.observability.enabled, true);
  assert.equal(config.observability.head_sampling_rate, 1);
  assert.equal(config.observability.redact_query_string, true);
  assert.equal(config.observability.logs.enabled, true);
  assert.equal(config.observability.logs.invocation_logs, true);
  assert.equal(config.observability.logs.head_sampling_rate, 1);
  assert.equal(Object.hasOwn(config, 'assets'), false);
});
