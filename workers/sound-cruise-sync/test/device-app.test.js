import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, handleScheduled } from '../src/app.js';

const ORIGIN = 'https://soundcruise.jp';
const DEVICE_ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER_DEVICE = '123e4567-e89b-42d3-a456-426614174002';
const INTENT = 'sdi1.123e4567-e89b-42d3-a456-426614174003.' + 'A'.repeat(43);
const identity = { userId: '123e4567-e89b-42d3-a456-426614174001', deviceId: DEVICE_ID, appId: 'chord', userState: 'active' };
const OPEN_CONTROL = Object.freeze({ rolloutMode: 'open', admissionEnabled: true, dataWriteEnabled: true, dataReadEnabled: true, recoveryEnabled: true, cloudDeleteEnabled: true });

function env() {
  return {
    readRuntimeControl: async () => OPEN_CONTROL,
    ALLOWED_ORIGINS: ORIGIN, SYNC_ALLOWED_APP_IDS: 'chord', SYNC_CREDENTIAL_PEPPER: 'p'.repeat(64),
    SYNC_DB: { prepare() {}, batch() {}, withSession() { return this; }, getBookmark() { return 'qa'; } },
    SYNC_RATE_LIMITER: { limit: async () => ({ success: true }) }
  };
}

function request(path, method, body, authorization = true) {
  return new Request(`https://sync.soundcruise.jp${path}`, {
    method,
    headers: { Origin: ORIGIN, ...(authorization ? { Authorization: 'Bearer test' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
}

function dependencies(overrides = {}) {
  return {
    readRuntimeControl: async () => OPEN_CONTROL,
    authenticateDevice: async () => identity,
    createRepository: () => ({}),
    createDeleteIntent: async () => ({ intentId: '123e4567-e89b-42d3-a456-426614174003', intentToken: INTENT, intentVerifier: 'intent-verifier' }),
    deleteIntentVerifier: async () => ({ intentId: '123e4567-e89b-42d3-a456-426614174003', intentVerifier: 'intent-verifier' }),
    createDeviceRepository: () => ({
      list: async () => [{ deviceId: DEVICE_ID, label: 'iPhone Safari', appId: 'chord', createdAt: 1, lastSeenAt: 2, revokedAt: null, isCurrent: true }],
      revoke: async (_identity, deviceId) => deviceId === OTHER_DEVICE ? { status: 'revoked', deviceId, isCurrent: false } : { status: 'not_found' },
      createDeleteIntent: async () => ({ status: 'issued', expiresAt: 999 }),
      deleteAccount: async () => ({ status: 'deleted', purgeAfter: 9999 }),
      resolveDeletedIntent: async () => ({ status: 'deleted' })
    }),
    ...overrides
  };
}

test('device API returns a credential-scoped active list and rejects identity injection', async () => {
  let response = await handleRequest(request('/v1/sync/devices?appId=chord', 'GET'), env(), null, dependencies());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.devices[0].isCurrent, true);
  assert.equal(JSON.stringify(body).includes('credential'), false);
  response = await handleRequest(request('/v1/sync/devices?appId=chord&userId=attacker', 'GET'), env(), null, dependencies());
  assert.equal(response.status, 400);
});

test('revoke and deletion endpoints use only authenticated identity plus a short delete intent', async () => {
  let response = await handleRequest(request('/v1/sync/devices/revoke', 'POST', { appId: 'chord', deviceId: OTHER_DEVICE }), env(), null, dependencies());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).isCurrent, false);
  response = await handleRequest(request('/v1/sync/devices/revoke', 'POST', { appId: 'chord', deviceId: OTHER_DEVICE, userId: 'attacker' }), env(), null, dependencies());
  assert.equal(response.status, 400);
  response = await handleRequest(request('/v1/sync/account/delete-intent', 'POST', { appId: 'chord' }), env(), null, dependencies());
  assert.equal(response.status, 201);
  assert.equal((await response.json()).intentToken, INTENT);
  response = await handleRequest(request('/v1/sync/account', 'DELETE', { appId: 'chord', intentToken: INTENT }), env(), null, dependencies());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).deleted, true);
});

test('account delete response loss may be resolved by the one-time token after device auth is revoked', async () => {
  const response = await handleRequest(request('/v1/sync/account', 'DELETE', { appId: 'chord', intentToken: INTENT }), env(), null, dependencies({ authenticateDevice: async () => null }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.alreadyDeleted, true);
});

test('CORS permits exact DELETE preflight and rejects mismatched headers', async () => {
  let response = await handleRequest(new Request('https://sync.soundcruise.jp/v1/sync/account', {
    method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'DELETE', 'Access-Control-Request-Headers': 'Content-Type, Authorization, X-D1-Bookmark' }
  }), env(), null, dependencies());
  assert.equal(response.status, 204);
  response = await handleRequest(new Request('https://sync.soundcruise.jp/v1/sync/account', {
    method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'DELETE', 'Access-Control-Request-Headers': 'Content-Type, X-Other' }
  }), env(), null, dependencies());
  assert.equal(response.status, 403);
});

test('scheduled cleanup uses the existing D1 binding and does not expose an HTTP cleanup route', async () => {
  let calls = 0;
  await handleScheduled({}, { SYNC_DB: { prepare() {}, batch() {} } }, {
    createCleanupRepository: () => ({ cleanup: async () => { calls += 1; } })
  });
  assert.equal(calls, 1);
});
