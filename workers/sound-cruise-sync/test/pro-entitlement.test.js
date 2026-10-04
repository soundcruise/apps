import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/app.js';
import { createSqliteD1, seedIdentity } from './sqlite-d1.js';
import { hmacVerifier } from '../src/crypto.js';
import { createAccountCredential, accountCredentialVerifier } from '../src/account-crypto.js';
import { seedTestPro, TEST_PRO_PEPPER, TEST_PRO_TOKEN } from './pro-entitlement-fixture.js';
import { manifestHash } from '../src/records.js';

const ORIGIN = 'https://soundcruise.jp';
const APPS = ['pitch', 'fretboard', 'rhythm', 'chord', 'port'];
const APP_PEPPER = 'isolated-app-credential-pepper-at-least-32';
const ACCOUNT_PEPPER = 'isolated-account-credential-pepper-at-least-32';
const ASSET_ID = '123e4567-e89b-42d3-a456-426614174010';
const control = { rolloutMode: 'open', admissionEnabled: true, dataWriteEnabled: true,
  dataReadEnabled: true, recoveryEnabled: true, cloudDeleteEnabled: true, generation: 1, updatedAt: 1 };
const dependencies = { readRuntimeControl: async () => control };

async function fixture(appId = 'port') {
  const db = createSqliteD1();
  await seedTestPro(db);
  const account = createAccountCredential();
  db.raw.prepare(`INSERT INTO sync_accounts
    (id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,recovery_created_at,recovery_rotated_at,admission_provenance)
    VALUES ('account-a','active',1,?,1,1,1,1,1,'production')`).run('1'.repeat(64));
  db.raw.prepare(`INSERT INTO sync_account_devices
    (id,account_id,credential_version,credential_verifier,created_at,last_seen_at)
    VALUES (?,'account-a',1,?,1,1)`).run(account.deviceId,
      await accountCredentialVerifier(account.credential, ACCOUNT_PEPPER));
  const credential = `scd1.123e4567-e89b-42d3-a456-426614174000.${'A'.repeat(43)}`;
  const identity = seedIdentity(db, { appId, verifier: await hmacVerifier(credential, APP_PEPPER) });
  db.raw.prepare(`UPDATE sync_users SET state='active', recovery_version=1, recovery_verifier='2222222222222222222222222222222222222222222222222222222222222222' WHERE id=?`).run(identity.userId);
  db.raw.prepare(`UPDATE sync_datasets SET state='ready', initialized_at=1 WHERE user_id=?`).run(identity.userId);
  db.raw.prepare(`INSERT INTO sync_account_memberships
    (id,account_id,app_id,state,sync_user_id,recovery_mode,generation,created_at,activated_at,updated_at)
    VALUES ('membership-a','account-a',?,'active',?,'account',1,1,1,1)`).run(appId, identity.userId);
  db.raw.prepare(`INSERT INTO sync_account_managed_users
    (sync_user_id,account_id,membership_id,app_id,created_at)
    VALUES (?,'account-a','membership-a',?,1)`).run(identity.userId, appId);
  let objectReads = 0, objectWrites = 0;
  const env = { SYNC_DB: db, ALLOWED_ORIGINS: ORIGIN, ACCOUNT_ALLOWED_ORIGINS: ORIGIN,
    SYNC_ALLOWED_APP_IDS: 'chord', SYNC_QA_ALLOWED_APP_IDS: APPS.join(','),
    SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED: 'true', SYNC_ACCOUNT_PUBLIC_APP_IDS: APPS.join(','),
    SYNC_CREDENTIAL_PEPPER: APP_PEPPER, SYNC_ACCOUNT_CREDENTIAL_PEPPER: ACCOUNT_PEPPER,
    PRO_CREDENTIAL_PEPPER: TEST_PRO_PEPPER,
    SYNC_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SYNC_ASSETS: { get: async () => { objectReads++; return null; }, put: async () => { objectWrites++; } } };
  async function call(path, { method = 'GET', body, pro = null, device = credential, extra = {} } = {}) {
    const headers = new Headers({ Origin: ORIGIN, Authorization: `Bearer ${device}`, ...extra });
    if (pro) headers.set('X-Sound-Cruise-Pro-Authorization', `Bearer ${pro}`);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await handleRequest(new Request('https://sync.example' + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    }), env, null, dependencies);
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  const data = () => JSON.stringify(['sync_accounts', 'sync_account_memberships', 'sync_account_devices',
    'sync_users', 'sync_devices', 'sync_datasets', 'sync_records', 'sync_changes', 'sync_assets']
    .map(table => db.raw.prepare(`SELECT * FROM ${table}`).all()));
  return { db, env, call, account, credential, identity, data,
    get objectReads() { return objectReads; }, get objectWrites() { return objectWrites; } };
}

for (const appId of APPS) {
  test(`${appId}: valid Account/device alone cannot push, pull or snapshot; existing Pro can`, async () => {
    const f = await fixture(appId);
    try {
      const before = f.data();
      for (const [path, options] of [
        [`/v1/sync/snapshot?appId=${appId}`, {}],
        [`/v1/sync/changes?appId=${appId}`, {}],
        ['/v1/sync/push', { method: 'POST', body: { appId, operations: [] } }],
        ['/v1/sync/bootstrap', { method: 'POST', body: { appId } }],
        ['/v1/sync/migration/complete', { method: 'POST', body: { appId } }],
        ['/v1/sync/removal-safety', { method: 'POST', body: { appId } }],
        ['/v1/sync/pairing-codes', { method: 'POST', body: { appId } }],
        ['/v1/sync/start', { method: 'POST', body: { appId, edition: 'pro' } }],
        ['/v1/sync/pair', { method: 'POST', body: { appId } }]
      ]) {
        const denied = await f.call(path, options);
        assert.equal(denied.status, 403, path);
        assert.equal(denied.body.code, 'pro_required');
        assert.equal(f.data(), before, 'no data/identity mutation before entitlement');
      }
      const allowed = await f.call(`/v1/sync/snapshot?appId=${appId}`, { pro: TEST_PRO_TOKEN });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.body.recordCount, 0);
    } finally { f.db.close(); }
  });
}

test('attachments: prepare/upload/commit/unreference/download all require Pro before R2 or data writes', async () => {
  const f = await fixture();
  try {
    const before = f.data();
    for (const [path, method] of [
      ['/v1/sync/assets/prepare', 'POST'], ['/v1/sync/assets/commit', 'POST'],
      ['/v1/sync/assets/unreference', 'POST'], [`/v1/sync/assets/${ASSET_ID}/content`, 'PUT'],
      [`/v1/sync/assets/${ASSET_ID}`, 'GET']
    ]) {
      const result = await f.call(path, { method, ...(method !== 'GET' ? { body: { appId: 'port' } } : {}) });
      assert.equal(result.status, 403, path);
      assert.equal(result.body.code, 'pro_required');
    }
    assert.equal(f.data(), before);
    assert.equal(f.objectReads, 0);
    assert.equal(f.objectWrites, 0);
  } finally { f.db.close(); }
});

test('real verifier rejects revoked, unknown, tampered and generation-retired Pro tokens', async () => {
  const f = await fixture();
  try {
    const before = f.data();
    for (const token of ['invalid', TEST_PRO_TOKEN.replace(/T$/, 'U'),
      TEST_PRO_TOKEN.replace('174999', '174998')]) {
      const result = await f.call('/v1/sync/snapshot?appId=port', { pro: token });
      assert.equal(result.status, 403); assert.equal(result.body.code, 'pro_required');
    }
    f.db.raw.prepare('UPDATE pro_credentials SET revoked_at=2').run();
    const guardedCalls = [
      ['/v1/sync/snapshot?appId=port', {}],
      ['/v1/sync/push', { method: 'POST', body: { appId: 'port' } }],
      [`/v1/sync/assets/${ASSET_ID}/content`, { method: 'PUT', body: { appId: 'port' } }],
      [`/v1/sync/assets/${ASSET_ID}`, {}]
    ];
    for (const [path, options] of guardedCalls) {
      const revoked = await f.call(path, { ...options, pro: TEST_PRO_TOKEN });
      assert.equal(revoked.status, 403); assert.equal(revoked.body.code, 'pro_required');
    }
    f.db.raw.prepare('UPDATE pro_credentials SET revoked_at=NULL').run();
    f.db.raw.prepare('UPDATE pro_auth_state SET generation=generation+1').run();
    for (const [path, options] of guardedCalls) {
      const retired = await f.call(path, { ...options, pro: TEST_PRO_TOKEN });
      assert.equal(retired.status, 403); assert.equal(retired.body.code, 'pro_reauth_required');
    }
    // The existing policy has generation/revocation expiry, no wall-clock TTL.
    assert.equal(f.data(), before);
  } finally { f.db.close(); }
});

test('valid Pro does not grant Account or device authority, or cross-app data access', async () => {
  const f = await fixture('pitch');
  try {
    for (const device of ['invalid', f.credential.replace(/A$/, 'B'), f.account.credential]) {
      const result = await f.call('/v1/sync/snapshot?appId=pitch', { pro: TEST_PRO_TOKEN, device });
      assert.equal(result.status, 401);
    }
    const wrongApp = await f.call('/v1/sync/snapshot?appId=rhythm', { pro: TEST_PRO_TOKEN });
    assert.equal(wrongApp.status, 401);
    f.db.raw.prepare(`UPDATE sync_accounts SET state='deleting'`).run();
    const wrongAccount = await f.call('/v1/sync/snapshot?appId=pitch', { pro: TEST_PRO_TOKEN });
    assert.equal(wrongAccount.status, 410);
    assert.equal(wrongAccount.body.code, 'account_deleting');
  } finally { f.db.close(); }
});

test('Account summary/devices/memberships remain available without Pro; invalid Account still rejected', async () => {
  const f = await fixture();
  try {
    f.db.raw.prepare(`UPDATE sync_account_runtime_control SET rollout_mode='open', account_read_enabled=1`).run();
    for (const path of ['/v2/accounts/summary', '/v2/accounts/devices', '/v2/accounts/memberships']) {
      assert.equal((await f.call(path, { device: f.account.credential })).status, 200, path);
      assert.equal((await f.call(path, { device: 'invalid', pro: TEST_PRO_TOKEN })).status, 401, path);
    }
  } finally { f.db.close(); }
});

test('Pro verification store outage fails closed, preflight accepts the independent Pro header', async () => {
  const f = await fixture();
  try {
    f.env.PRO_CREDENTIAL_PEPPER = undefined;
    const result = await f.call('/v1/sync/snapshot?appId=port', { pro: TEST_PRO_TOKEN });
    assert.equal(result.status, 503); assert.equal(result.body.code, 'pro_auth_unavailable');
    const response = await handleRequest(new Request('https://sync.example/v1/sync/snapshot', {
      method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,x-sound-cruise-pro-authorization' }
    }), f.env);
    assert.equal(response.status, 204);
    assert.match(response.headers.get('Access-Control-Allow-Headers'), /X-Sound-Cruise-Pro-Authorization/);
  } finally { f.db.close(); }
});

test('authorized initial-sync bootstrap still uses existing dataset policy without migrating existing data', async () => {
  const f = await fixture('pitch');
  try {
    f.db.raw.prepare(`UPDATE sync_users SET state='provisioning', recovery_version=0, recovery_verifier=NULL`).run();
    f.db.raw.prepare(`UPDATE sync_datasets SET state='initializing', initialized_at=NULL`).run();
    const hash = await manifestHash([], 1, crypto, 'pitch');
    const result = await f.call('/v1/sync/bootstrap', { pro: TEST_PRO_TOKEN, method: 'POST',
      body: { appId: 'pitch', schemaVersion: 1, recordCount: 0, manifestHash: hash } });
    assert.equal(result.status, 200); // Existing initializing dataset, not a new dataset.
    assert.equal(result.body.alreadyCreated, true);
  } finally { f.db.close(); }
});

test('valid Pro attachment prepare uses real device authorization; another Account cannot download it', async () => {
  const f = await fixture();
  try {
    const prepared = await f.call('/v1/sync/assets/prepare', { method: 'POST', pro: TEST_PRO_TOKEN,
      body: { appId: 'port', assetId: ASSET_ID, operationId: crypto.randomUUID(),
        kind: 'gear_photo_final', hash: '4'.repeat(64), mime: 'image/webp', byteSize: 30, width: 512, height: 512 } });
    assert.equal(prepared.status, 201);
    const other = `scd1.123e4567-e89b-42d3-a456-426614174002.${'B'.repeat(43)}`;
    const identity = seedIdentity(f.db, { appId: 'port', deviceId: other.split('.')[1],
      userId: crypto.randomUUID(), verifier: await hmacVerifier(other, APP_PEPPER) });
    f.db.raw.prepare(`INSERT INTO sync_accounts
      (id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,recovery_created_at,recovery_rotated_at,admission_provenance)
      VALUES ('account-b','active',1,?,1,1,1,1,1,'production')`).run('5'.repeat(64));
    f.db.raw.prepare(`INSERT INTO sync_account_memberships
      (id,account_id,app_id,state,sync_user_id,recovery_mode,generation,created_at,activated_at,updated_at)
      VALUES ('membership-b','account-b','port','active',?,'account',1,1,1,1)`).run(identity.userId);
    f.db.raw.prepare(`INSERT INTO sync_account_managed_users
      (sync_user_id,account_id,membership_id,app_id,created_at)
      VALUES (?,'account-b','membership-b','port',1)`).run(identity.userId);
    f.db.raw.prepare(`UPDATE sync_datasets SET state='ready', initialized_at=1 WHERE user_id=?`).run(identity.userId);
    const denied = await f.call(`/v1/sync/assets/${ASSET_ID}`, { pro: TEST_PRO_TOKEN, device: other });
    assert.equal(denied.status, 404);
    assert.equal(f.objectReads, 0);
    assert.equal((await f.call(`/v1/sync/assets/${ASSET_ID}`, { pro: TEST_PRO_TOKEN, device: 'invalid' })).status, 401);
  } finally { f.db.close(); }
});

test('entitlement denial preserves an existing nonempty dataset, record and identities', async () => {
  const f = await fixture();
  try {
    f.db.raw.prepare(`INSERT INTO sync_records
      (user_id,app_id,record_type,record_id,payload_json,payload_hash,revision,updated_at,updated_by_device_id,last_operation_id,schema_version)
      VALUES (?,'port','gear_item','existing','{"id":"existing","name":"kept"}',?,1,1,?, ?,1)`)
      .run(f.identity.userId, '4'.repeat(64), f.identity.deviceId, crypto.randomUUID());
    const before = f.data();
    const denied = await f.call('/v1/sync/push', { method: 'POST', body: { appId: 'port', operations: [] } });
    assert.equal(denied.status, 403);
    assert.equal(f.data(), before);
  } finally { f.db.close(); }
});
