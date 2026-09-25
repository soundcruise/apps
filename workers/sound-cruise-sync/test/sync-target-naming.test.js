import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { handleRequest } from '../src/app.js';
import { createAccountCredential, createAccountRecoveryCode, createAppJoinCode } from '../src/account-crypto.js';
import { createIdentityMaterial } from '../src/crypto.js';
import { createQaCredential, qaCredentialVerifier } from '../src/account-qa-crypto.js';
import {
  normalizeSyncTargetUserLabel,
  validateAccountAppEnvironmentRenamePayload,
  validateAccountDeviceRenamePayload
} from '../src/account-validation.js';
import { createSqliteD1 } from './sqlite-d1.js';

// Cloud Sync UX 2.0 Phase N1: a nullable user_label on App Devices and Account Devices, renamed
// only through the Account credential, never touching identity, credentials or sync semantics.
const origin = 'https://soundcruise.jp';
const accountCredentialPepper = 'n1-api-account-credential-pepper-32-chars';
const appPepper = 'n1-api-app-credential-pepper-at-least-32';
const qaPepper = 'n1-api-qa-credential-pepper-at-least-32c';
const qa = createQaCredential();
const qaVerifier = await qaCredentialVerifier(qa.credential, qaPepper);
const limiter = () => ({ async limit() { return { success: true }; } });
const turnstileOk = { verifyTurnstileToken: async () => ({ ok: true }) };
const migrationsDir = path.join(import.meta.dirname, '../migrations');

function enableControl(db) {
  db.raw.prepare(`
    UPDATE sync_account_runtime_control
    SET rollout_mode = 'open', account_admission_enabled = 1, membership_admission_enabled = 1,
        account_read_enabled = 1, account_recovery_enabled = 1, account_delete_enabled = 1,
        port_orchestration_enabled = 1, generation = generation + 1, updated_at = 2
    WHERE singleton_id = 1
  `).run();
}

function environment(db) {
  db.raw.prepare(`
    INSERT OR IGNORE INTO sync_account_qa_enrollments
      (id, code_verifier, created_at, expires_at, consumed_at, cancelled_at, consumed_by_session_id)
    VALUES ('qa-enrollment', ?, 1, ?, 1, NULL, ?)
  `).run('a'.repeat(64), Number.MAX_SAFE_INTEGER, qa.sessionId);
  db.raw.prepare(`
    INSERT OR IGNORE INTO sync_account_qa_sessions
      (id, credential_verifier, enrollment_id, scope, account_id, app_id, app_device_id,
       parent_session_id, created_at, expires_at, last_used_at, revoked_at, generation)
    VALUES (?, ?, 'qa-enrollment', 'port', NULL, NULL, NULL, NULL, 1, ?, 1, NULL, 1)
  `).run(qa.sessionId, qaVerifier, Number.MAX_SAFE_INTEGER);
  return {
    SYNC_DB: db,
    ACCOUNT_ALLOWED_ORIGINS: origin,
    SYNC_ACCOUNT_CREDENTIAL_PEPPER: accountCredentialPepper,
    SYNC_ACCOUNT_RECOVERY_PEPPER: 'n1-api-account-recovery-pepper-32-chars',
    SYNC_ACCOUNT_HANDOFF_PEPPER: 'n1-api-account-handoff-pepper-32-chars',
    SYNC_ACCOUNT_APP_JOIN_PEPPER: 'n1-api-account-app-join-pepper-32-chars',
    SYNC_CREDENTIAL_PEPPER: appPepper,
    SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER: qaPepper,
    ACCOUNT_START_RATE_LIMITER: limiter(),
    ACCOUNT_HANDOFF_ISSUE_RATE_LIMITER: limiter(),
    ACCOUNT_HANDOFF_CONSUME_RATE_LIMITER: limiter(),
    ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER: limiter(),
    ACCOUNT_APP_JOIN_CONSUME_RATE_LIMITER: limiter(),
    ACCOUNT_RECOVERY_RATE_LIMITER: limiter(),
    TURNSTILE_PRODUCTION_SECRET_KEY: 'test-only-turnstile-secret'
  };
}

function request(pathname, body, options = {}) {
  const headers = new Headers({ Origin: origin });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.credential) headers.set('Authorization', `Bearer ${options.credential}`);
  if (options.appCredential) headers.set('X-Sound-Cruise-App-Authorization', `Bearer ${options.appCredential}`);
  headers.set('X-Sound-Cruise-QA-Authorization', `Bearer ${options.qaCredential || qa.credential}`);
  return new Request(`https://sync.example${pathname}`, {
    method: options.method || (body === undefined ? 'GET' : 'POST'),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

// Each Account needs its own Port QA session (a session binds to the first Account it creates).
async function qaSession(db) {
  const session = createQaCredential();
  db.raw.prepare(`
    INSERT INTO sync_account_qa_sessions
      (id, credential_verifier, enrollment_id, scope, account_id, app_id, app_device_id,
       parent_session_id, created_at, expires_at, last_used_at, revoked_at, generation)
    VALUES (?, ?, 'qa-enrollment', 'port', NULL, NULL, NULL, NULL, 1, ?, 1, NULL, 1)
  `).run(session.sessionId, await qaCredentialVerifier(session.credential, qaPepper), Number.MAX_SAFE_INTEGER);
  return session.credential;
}

async function startAccount(env, apps = ['pitch'], qaCredential = undefined) {
  const account = createAccountCredential();
  const response = await handleRequest(request('/v2/accounts/start', {
    operationId: crypto.randomUUID(), appIds: apps, accountCredential: account.credential,
    recoveryCode: createAccountRecoveryCode(), turnstileToken: 'opaque-test-token', deviceLabel: 'QA Browser'
  }, { qaCredential }), env, null, turnstileOk);
  assert.equal(response.status, 201);
  return { credential: account.credential, qaCredential, payload: await response.json() };
}

function markPitchReady(db, accountId) {
  db.raw.prepare(`
    INSERT OR IGNORE INTO sync_datasets (user_id, app_id, state, schema_version, record_count, manifest_hash,
      min_change_seq, initialized_at, updated_at, last_change_seq)
    SELECT sync_user_id, 'pitch', 'ready', 1, 0, NULL, 0, 1, 1, 0
    FROM sync_account_memberships WHERE account_id = ? AND app_id = 'pitch'
  `).run(accountId);
  db.raw.prepare(`
    UPDATE sync_datasets SET state = 'ready', initialized_at = COALESCE(initialized_at, updated_at)
    WHERE app_id = 'pitch' AND user_id = (SELECT sync_user_id FROM sync_account_memberships
      WHERE account_id = ? AND app_id = 'pitch')
  `).run(accountId);
}

// Joins one pitch App Device (with its own Account Device) through the real invitation flow.
async function joinPitch(env, issuer, label = 'Android Chrome') {
  const joinCode = createAppJoinCode();
  let response = await handleRequest(request('/v2/accounts/app-join-invitations', {
    operationId: crypto.randomUUID(), invitationId: crypto.randomUUID(), appId: 'pitch', joinCode
  }, { credential: issuer }), env);
  assert.equal(response.status, 201);
  const account = createAccountCredential();
  const app = await createIdentityMaterial(appPepper);
  response = await handleRequest(request('/v2/accounts/app-join-invitations/consume', {
    operationId: crypto.randomUUID(), appId: 'pitch', joinCode,
    accountCredential: account.credential, appDeviceCredential: app.credential,
    qaCredential: createQaCredential().credential, deviceLabel: label, consumeMode: 'new_app'
  }), env);
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  return { appDeviceId: app.deviceId, appCredential: app.credential, accountCredential: account.credential };
}

async function setup() {
  const db = createSqliteD1();
  enableControl(db);
  const env = environment(db);
  const started = await startAccount(env);
  const joined = await joinPitch(env, started.credential);
  markPitchReady(db, started.payload.accountId);
  const accountDeviceId = db.raw.prepare(`SELECT id FROM sync_account_devices WHERE account_id = ?
    ORDER BY created_at ASC, id ASC LIMIT 1`).get(started.payload.accountId).id;
  return { db, env, credential: started.credential, accountId: started.payload.accountId, joined, accountDeviceId };
}

const renameApp = (env, credential, appDeviceId, userLabel, appId = 'pitch', extra = {}) => handleRequest(request(
  `/v2/accounts/memberships/${appId}/devices/name`, { appId, appDeviceId, userLabel, ...extra }, { credential }), env);
const renameAccount = (env, credential, accountDeviceId, userLabel) => handleRequest(request(
  '/v2/accounts/devices/name', { accountDeviceId, userLabel }, { credential }), env);
const listDevices = async (env, credential) => (await handleRequest(
  request('/v2/accounts/devices', undefined, { credential }), env)).json();

// Everything except user_label, so a rename provably changes nothing else.
function snapshot(db) {
  return {
    appDevices: db.raw.prepare(`SELECT id, user_id, app_id, credential_version, credential_verifier, label,
      last_cursor, created_at, revoked_at FROM sync_devices ORDER BY id`).all(),
    accountDevices: db.raw.prepare(`SELECT id, account_id, credential_version, credential_verifier, label,
      created_at, revoked_at FROM sync_account_devices ORDER BY id`).all(),
    links: db.raw.prepare('SELECT * FROM sync_membership_device_links ORDER BY app_device_id').all(),
    memberships: db.raw.prepare('SELECT * FROM sync_account_memberships ORDER BY id').all(),
    accounts: db.raw.prepare('SELECT * FROM sync_accounts ORDER BY id').all(),
    datasets: db.raw.prepare('SELECT * FROM sync_datasets ORDER BY user_id').all(),
    reports: db.raw.prepare('SELECT * FROM sync_app_device_sync_safety ORDER BY app_device_id').all(),
    operations: db.raw.prepare('SELECT COUNT(*) count FROM sync_account_lifecycle_operations').get().count
  };
}

test('migration 0031 adds nullable user_label to both device tables and rewrites nothing', () => {
  const database = new DatabaseSync(':memory:');
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  assert.equal(files.at(-1), '0031_add_sync_target_user_labels.sql', 'forward-only: appended last');
  for (const file of files.slice(0, -1)) database.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  database.prepare(`INSERT INTO sync_users (id, state, recovery_version, recovery_verifier, created_at, updated_at)
    VALUES ('u1', 'active', 1, ?, 1, 1)`).run('a'.repeat(64));
  database.prepare(`INSERT INTO sync_devices (id, user_id, app_id, credential_version, credential_verifier,
    label, last_cursor, created_at, last_seen_at, revoked_at) VALUES ('d1', 'u1', 'chord', 1, ?, 'Chord Cruise',
    7, 1, 2, NULL)`).run('b'.repeat(64));
  database.prepare(`INSERT INTO sync_accounts (id, state, recovery_version, recovery_verifier, generation,
    created_at, updated_at, recovery_created_at, recovery_rotated_at) VALUES ('a1', 'active', 1, ?, 1, 1, 1, 1, 1)`)
    .run('c'.repeat(64));
  database.prepare(`INSERT INTO sync_account_devices (id, account_id, credential_version, credential_verifier,
    label, created_at, last_seen_at, revoked_at) VALUES ('ad1', 'a1', 1, ?, 'QA Browser', 1, 1, NULL)`)
    .run('d'.repeat(64));
  const before = [database.prepare('SELECT * FROM sync_devices').all(), database.prepare('SELECT * FROM sync_account_devices').all()];
  const sql = fs.readFileSync(path.join(migrationsDir, files.at(-1)), 'utf8');
  assert.doesNotMatch(sql, /\b(UPDATE|DELETE|DROP|INSERT|RENAME|CREATE TABLE)\b/i, 'add-column only');
  database.exec(sql);
  const after = [database.prepare('SELECT * FROM sync_devices').all(), database.prepare('SELECT * FROM sync_account_devices').all()];
  for (const [index, rows] of after.entries()) {
    assert.equal(rows[0].user_label, null, 'existing rows default to NULL');
    const { user_label: _, ...rest } = rows[0];
    assert.deepEqual({ ...rest }, { ...before[index][0] }, 'identity, label and credentials are unchanged');
  }
  for (const table of ['sync_devices', 'sync_account_devices']) {
    const column = database.prepare(`PRAGMA table_info(${table})`).all().find((item) => item.name === 'user_label');
    assert.equal(column.notnull, 0);
    assert.equal(column.dflt_value, null);
    assert.throws(() => database.prepare(`UPDATE ${table} SET user_label = '' `).run(), /CHECK/);
    assert.throws(() => database.prepare(`UPDATE ${table} SET user_label = ?`).run('x'.repeat(41)), /CHECK/);
  }
  database.prepare(`UPDATE sync_devices SET user_label = ?`).run('あ'.repeat(40));
  assert.equal(database.prepare('SELECT user_label FROM sync_devices').get().user_label, 'あ'.repeat(40),
    'the bound counts characters, not bytes');
  database.close();
});

test('userLabel validation: NFC, trim, reset, 40 code points, controls, newlines, bidi, surrogates', () => {
  assert.equal(normalizeSyncTargetUserLabel('  Pixel  '), 'Pixel');
  assert.equal(normalizeSyncTargetUserLabel('Café'), 'Café', 'NFC');
  assert.equal(normalizeSyncTargetUserLabel('   '), null, 'blank resets');
  assert.equal(normalizeSyncTargetUserLabel(''), null);
  assert.equal(normalizeSyncTargetUserLabel(null), null);
  assert.equal(normalizeSyncTargetUserLabel('あ'.repeat(40)), 'あ'.repeat(40));
  assert.equal(normalizeSyncTargetUserLabel('🎸'.repeat(40)), '🎸'.repeat(40), 'code points, not UTF-16 units');
  assert.equal(normalizeSyncTargetUserLabel('あ'.repeat(41)), undefined);
  for (const bad of ['a\nb', 'a\rb', 'a\tb', 'a\u0000b', 'a\u007fb', 'a\u0085b', 'a b', 'a b',
    'a‮b', 'a‪b', 'a⁦b', 'a⁩b', 'a‎b', 'a‏b', 'a؜b', 'a\ud800b', 7, {}, [], true]) {
    assert.equal(normalizeSyncTargetUserLabel(bad), undefined, JSON.stringify(bad));
  }
  assert.equal(normalizeSyncTargetUserLabel('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>',
    'HTML is stored as plain text; the UI never interprets it');
  const id = crypto.randomUUID();
  assert.equal(validateAccountDeviceRenamePayload({ accountDeviceId: id, userLabel: 'Mac' }).ok, true);
  assert.equal(validateAccountDeviceRenamePayload({ accountDeviceId: id, userLabel: 'Mac', accountId: id }).ok, false,
    'the Account can never be chosen by the client');
  assert.equal(validateAccountDeviceRenamePayload({ accountDeviceId: 'not-a-uuid', userLabel: 'Mac' }).ok, false);
  assert.equal(validateAccountAppEnvironmentRenamePayload({ appId: 'port', appDeviceId: id, userLabel: 'x' }).ok, false);
  assert.equal(validateAccountAppEnvironmentRenamePayload({ appId: 'chord', appDeviceId: id }).ok, false,
    'userLabel is required (null to reset)');
});

test('App Device rename: Account credential only, stored trimmed/NFC, listed as userLabel, reset to null', async () => {
  const { db, env, credential, joined } = await setup();
  const before = snapshot(db);
  let response = await renameApp(env, credential, joined.appDeviceId, '  Pixel  ');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, appId: 'pitch', appDeviceId: joined.appDeviceId, userLabel: 'Pixel' });
  let listed = await listDevices(env, credential);
  let device = listed.appDevices.find((item) => item.id === joined.appDeviceId);
  assert.equal(device.userLabel, 'Pixel');
  assert.equal(device.label, 'Android Chrome', 'the original label is preserved');
  assert.deepEqual(snapshot(db), before, 'nothing but user_label changed');

  response = await renameApp(env, credential, joined.appDeviceId, '<b>"Pixel" & \'Co\'</b>');
  assert.equal((await response.json()).userLabel, '<b>"Pixel" & \'Co\'</b>', 'HTML characters round-trip as text');
  response = await renameApp(env, credential, joined.appDeviceId, 'Café');
  assert.equal((await response.json()).userLabel, 'Café');

  for (const bad of ['a\nb', 'a‮b', 'x'.repeat(41), 42]) {
    response = await renameApp(env, credential, joined.appDeviceId, bad);
    assert.equal(response.status, 400, JSON.stringify(bad));
  }
  response = await renameApp(env, credential, joined.appDeviceId, '   ');
  assert.equal((await response.json()).userLabel, null, 'blank resets to the original label');
  listed = await listDevices(env, credential);
  device = listed.appDevices.find((item) => item.id === joined.appDeviceId);
  assert.equal(device.userLabel, null);
  assert.equal(device.label, 'Android Chrome');

  response = await handleRequest(request('/v2/accounts/memberships/pitch/devices/name',
    { appId: 'pitch', appDeviceId: joined.appDeviceId, userLabel: 'Hijack' }, { appCredential: joined.appCredential }), env);
  assert.equal(response.status, 401, 'an App Device credential cannot rename');
  response = await handleRequest(request('/v2/accounts/memberships/pitch/devices/name',
    { appId: 'pitch', appDeviceId: joined.appDeviceId, userLabel: 'Hijack' }, { credential: joined.appCredential }), env);
  assert.equal(response.status, 401, 'an App credential sent as Authorization is not an Account credential');
  response = await renameApp(env, joined.accountCredential, joined.appDeviceId, 'Own container');
  assert.equal(response.status, 200, 'any active Account Device of the same Account may rename');
  db.close();
});

test('App Device target validation: unknown, app mismatch, route mismatch, revoked, other Account', async () => {
  const { db, env, credential, joined } = await setup();
  const otherQa = await qaSession(db);
  let response = await renameApp(env, credential, crypto.randomUUID(), 'Ghost');
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, 'app_device_not_found');
  response = await handleRequest(request('/v2/accounts/memberships/chord/devices/name',
    { appId: 'chord', appDeviceId: joined.appDeviceId, userLabel: 'Wrong app' }, { credential }), env);
  assert.equal(response.status, 404, 'a pitch device is not a chord target');
  response = await handleRequest(request('/v2/accounts/memberships/chord/devices/name',
    { appId: 'pitch', appDeviceId: joined.appDeviceId, userLabel: 'Route mismatch' }, { credential }), env);
  assert.equal(response.status, 400, 'route app and payload app must match');

  const other = await startAccount(env, ['pitch'], otherQa);
  response = await handleRequest(request('/v2/accounts/memberships/pitch/devices/name',
    { appId: 'pitch', appDeviceId: joined.appDeviceId, userLabel: 'Not yours' },
    { credential: other.credential, qaCredential: otherQa }), env);
  assert.equal(response.status, 404, 'another Account cannot see or rename this device');
  assert.equal(db.raw.prepare('SELECT user_label FROM sync_devices WHERE id = ?').get(joined.appDeviceId).user_label, null);

  assert.equal((await renameApp(env, credential, joined.appDeviceId, 'Pixel')).status, 200);
  response = await handleRequest(request('/v2/accounts/memberships/pitch/devices/revoke',
    { operationId: crypto.randomUUID(), appId: 'pitch', appDeviceId: joined.appDeviceId }, { credential }), env);
  assert.equal(response.status, 200);
  response = await renameApp(env, credential, joined.appDeviceId, 'After revoke');
  assert.equal(response.status, 409, 'revoked history is read-only');
  assert.equal((await response.json()).code, 'device_rename_unavailable');
  const listed = await listDevices(env, credential);
  const revoked = listed.appDevices.find((item) => item.id === joined.appDeviceId);
  assert.notEqual(revoked.revokedAt, null);
  assert.equal(revoked.userLabel, 'Pixel', 'history keeps the name the user gave it');
  db.close();
});

test('Account Device (Port environment) rename: own Account only, active only, current marker separate', async () => {
  const { db, env, credential, accountDeviceId, joined } = await setup();
  const otherQa = await qaSession(db);
  const before = snapshot(db);
  let response = await renameAccount(env, credential, accountDeviceId, 'iPhone Port');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, accountDeviceId, userLabel: 'iPhone Port' });
  const listed = await listDevices(env, credential);
  const device = listed.devices.find((item) => item.id === accountDeviceId);
  assert.equal(device.userLabel, 'iPhone Port');
  assert.equal(device.label, 'QA Browser', 'the original label is preserved');
  assert.equal(device.isCurrent, true, 'the system current marker is independent of the name');
  assert.deepEqual(snapshot(db), before);

  response = await renameAccount(env, credential, crypto.randomUUID(), 'Ghost');
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, 'account_device_not_found');
  const other = await startAccount(env, ['pitch'], otherQa);
  response = await handleRequest(request('/v2/accounts/devices/name', { accountDeviceId, userLabel: 'Not yours' },
    { credential: other.credential, qaCredential: otherQa }), env);
  assert.equal(response.status, 404);
  response = await handleRequest(request('/v2/accounts/devices/name', { accountDeviceId, userLabel: 'x' },
    { appCredential: joined.appCredential }), env);
  assert.equal(response.status, 401);

  const joinedAccountDevice = db.raw.prepare(`SELECT account_device_id FROM sync_membership_device_links
    WHERE app_device_id = ?`).get(joined.appDeviceId).account_device_id;
  assert.equal((await renameAccount(env, credential, joinedAccountDevice, 'Old tablet')).status, 200);
  response = await handleRequest(request('/v2/accounts/devices/revoke',
    { operationId: crypto.randomUUID(), accountDeviceId: joinedAccountDevice }, { credential }), env);
  assert.equal(response.status, 200);
  response = await renameAccount(env, credential, joinedAccountDevice, 'After revoke');
  assert.equal(response.status, 409);
  assert.equal(db.raw.prepare('SELECT user_label FROM sync_account_devices WHERE id = ?')
    .get(joinedAccountDevice).user_label, 'Old tablet', 'revoked history keeps its name');
  db.close();
});

test('duplicate names are allowed; device ID stays the identity', async () => {
  const { db, env, credential, joined } = await setup();
  const second = await joinPitch(env, credential, 'Android Chrome');
  assert.equal((await renameApp(env, credential, joined.appDeviceId, 'iPhone')).status, 200);
  assert.equal((await renameApp(env, credential, second.appDeviceId, 'iPhone')).status, 200);
  const listed = await listDevices(env, credential);
  const named = listed.appDevices.filter((item) => item.userLabel === 'iPhone').map((item) => item.id).sort();
  assert.deepEqual(named, [joined.appDeviceId, second.appDeviceId].sort());
  db.close();
});

test('rename leaves reports, removal safety, revoke scope, device counts and datasets untouched', async () => {
  const { db, env, credential, accountId, joined, accountDeviceId } = await setup();
  const membership = db.raw.prepare(`SELECT id FROM sync_account_memberships WHERE account_id = ? AND app_id = 'pitch'`)
    .get(accountId).id;
  db.raw.prepare(`INSERT INTO sync_app_device_sync_safety (app_device_id, account_id, membership_id, app_id, state,
    reported_at, attention_count) VALUES (?, ?, ?, 'pitch', 'attention', 5000, 2)`)
    .run(joined.appDeviceId, accountId, membership);
  const summaryBefore = await (await handleRequest(request('/v2/accounts/summary', undefined, { credential }), env)).json();
  const listedBefore = await listDevices(env, credential);
  const before = snapshot(db);
  assert.equal((await renameApp(env, credential, joined.appDeviceId, 'Pixel')).status, 200);
  assert.equal((await renameAccount(env, credential, accountDeviceId, 'Mac Port')).status, 200);
  assert.deepEqual(snapshot(db), before, 'credentials, links, memberships, datasets, reports and generation unchanged');
  const summaryAfter = await (await handleRequest(request('/v2/accounts/summary', undefined, { credential }), env)).json();
  assert.deepEqual(summaryAfter, summaryBefore, 'summary (removalSafety, counts) is identical');
  const listedAfter = await listDevices(env, credential);
  const strip = (list) => list.map(({ userLabel: _, ...rest }) => rest);
  assert.deepEqual(strip(listedAfter.appDevices), strip(listedBefore.appDevices), 'lastReport follows device ID');
  assert.deepEqual(strip(listedAfter.devices), strip(listedBefore.devices));
  db.close();
});

test('user_label is read only by the device listings and the rename writes', () => {
  const src = path.join(import.meta.dirname, '../src');
  const readers = fs.readdirSync(src).filter((name) => name.endsWith('.js') &&
    fs.readFileSync(path.join(src, name), 'utf8').includes('user_label'));
  assert.deepEqual(readers, ['account-lifecycle-database.js'],
    'join, handoff, Auto Rejoin, auth, reports, cleanup and limits never read or copy user_label');
  const lifecycle = fs.readFileSync(path.join(src, 'account-lifecycle-database.js'), 'utf8');
  assert.equal((lifecycle.match(/SET user_label = \?/g) || []).length, 2, 'exactly the two rename writes');
  assert.doesNotMatch(lifecycle, /user_label\s*=\s*[^?\s]/, 'no copy from another row');
  const app = fs.readFileSync(path.join(src, 'account-app.js'), 'utf8');
  const renameHandlers = app.slice(app.indexOf('async function handleEnvironmentRename'),
    app.indexOf('async function handleAppEnvironmentRevoke'));
  assert.doesNotMatch(renameHandlers, /console\.|log\(/, 'names are never logged');
});

test('rename pauses with device management (account_delete gate) and answers CORS preflight', async () => {
  const { db, env, credential, joined, accountDeviceId } = await setup();
  db.raw.prepare(`UPDATE sync_account_runtime_control SET account_delete_enabled = 0,
    generation = generation + 1, updated_at = 3 WHERE singleton_id = 1`).run();
  let response = await renameApp(env, credential, joined.appDeviceId, 'Paused');
  assert.equal(response.status, 423);
  response = await renameAccount(env, credential, accountDeviceId, 'Paused');
  assert.equal(response.status, 423);
  assert.equal(db.raw.prepare('SELECT user_label FROM sync_devices WHERE id = ?').get(joined.appDeviceId).user_label, null);
  for (const pathname of ['/v2/accounts/devices/name', '/v2/accounts/memberships/chord/devices/name']) {
    response = await handleRequest(new Request(`https://sync.example${pathname}`, { method: 'OPTIONS', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type, authorization' } }), env);
    assert.ok(response.status < 300, `${pathname} preflight ${response.status}`);
    assert.match(response.headers.get('Access-Control-Allow-Methods') || '', /POST/);
  }
  db.close();
});
