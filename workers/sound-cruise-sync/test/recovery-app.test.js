import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/app.js';

const ORIGIN = 'https://soundcruise.jp';
const DEVICE_ID = '123e4567-e89b-42d3-a456-426614174020';
const CLAIM_ID = '123e4567-e89b-42d3-a456-426614174030';
const CREDENTIAL = `scd1.${DEVICE_ID}.${'A'.repeat(43)}`;
const CLAIM = `scr1.${CLAIM_ID}.${'B'.repeat(43)}`;
const OPEN_CONTROL = Object.freeze({ rolloutMode: 'open', admissionEnabled: true, dataWriteEnabled: true, dataReadEnabled: true, recoveryEnabled: true, cloudDeleteEnabled: true });

function env(overrides = {}) {
  return {
    readRuntimeControl: async () => OPEN_CONTROL,
    ALLOWED_ORIGINS: ORIGIN,
    SYNC_ALLOWED_APP_IDS: 'chord',
    SYNC_DB: { prepare() {}, batch() {} },
    SYNC_CREDENTIAL_PEPPER: 'p'.repeat(64),
    SYNC_RECOVERY_PEPPER: 'r'.repeat(64),
    TURNSTILE_PRODUCTION_SECRET_KEY: 'secret',
    TURNSTILE_EXPECTED_HOSTNAME: 'soundcruise.jp',
    TURNSTILE_RECOVER_EXPECTED_ACTION: 'sound_cruise_sync_recover',
    START_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SYNC_RATE_LIMITER: { limit: async () => ({ success: true }) },
    RECOVERY_RATE_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides
  };
}

function request(body, path = '/v1/sync/recover', headers = {}) {
  return new Request(`https://sync.soundcruise.jp${path}`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

function prepareDependencies(repository, calls = {}) {
  return {
    readRuntimeControl: async () => OPEN_CONTROL,
    verifyTurnstileToken: async (_token, _env, options) => {
      calls.action = options.expectedAction;
      return { ok: true };
    },
    recoveryCodeVerifier: async (code) => code.startsWith('0123') ? '1'.repeat(64) : '2'.repeat(64),
    createRecoveryCode: () => '23456789ABCDEFGHJKMN',
    createIdentityMaterial: async () => ({
      userId: 'unused', deviceId: DEVICE_ID, credential: CREDENTIAL, credentialVerifier: '3'.repeat(64)
    }),
    createRecoveryClaim: async () => ({ claimId: CLAIM_ID, claimToken: CLAIM, claimVerifier: '4'.repeat(64) }),
    createRecoveryRepository: () => repository
  };
}

test('Recovery prepare uses dedicated Turnstile, no user selector, and returns secrets once', async () => {
  let preparedInput;
  const calls = {};
  const repository = {
    reserveAttempt: async () => ({ status: 'allowed' }),
    prepare: async (input) => { preparedInput = input; return {
      status: 'prepared', expiresAt: 700000,
      summary: { appId: 'chord', recordCount: 6, chordCount: 3, folderCount: 1, updatedAt: 123456, activeDeviceCount: 2 }
    }; }
  };
  const response = await handleRequest(request({
    operation: 'prepare', appId: 'chord', recoveryCode: '0123-4567-89ab-cdef-ghjk',
    turnstileToken: 'token', deviceLabel: 'Recovery iPhone'
  }), env(), null, prepareDependencies(repository, calls));
  assert.equal(response.status, 200);
  assert.equal(calls.action, 'sound_cruise_sync_recover');
  assert.equal(Object.hasOwn(preparedInput, 'userId'), false);
  assert.equal(Object.hasOwn(preparedInput, 'currentRecoveryCode'), false);
  assert.equal(preparedInput.currentRecoveryVerifier, '1'.repeat(64));
  const body = await response.json();
  assert.deepEqual(body, {
    ok: true, operation: 'prepared', appId: 'chord', claimToken: CLAIM, expiresAt: 700000,
    deviceId: DEVICE_ID, deviceCredential: CREDENTIAL,
    recoveryCode: '2345-6789-ABCD-EFGH-JKMN',
    summary: { appId: 'chord', recordCount: 6, chordCount: 3, folderCount: 1, updatedAt: 123456, activeDeviceCount: 2 }
  });
  assert.equal(JSON.stringify(body).includes('userId'), false);
  assert.equal(JSON.stringify(body).includes('chordName'), false);
});

test('wrong Recovery Code, Turnstile failure, rate limiting and identity injection fail closed', async () => {
  let repositoryCalls = 0;
  const repository = {
    reserveAttempt: async () => ({ status: 'allowed' }),
    prepare: async () => { repositoryCalls += 1; return { status: 'invalid' }; }
  };
  const deps = prepareDependencies(repository);
  let response = await handleRequest(request({
    operation: 'prepare', appId: 'chord', recoveryCode: '0123-4567-89AB-CDEF-GHJK', turnstileToken: 'token'
  }), env(), null, deps);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, code: 'recovery_invalid' });
  response = await handleRequest(request({
    operation: 'prepare', appId: 'chord', recoveryCode: '0123-4567-89AB-CDEF-GHJK', turnstileToken: 'token'
  }), env(), null, { ...deps, verifyTurnstileToken: async () => ({ ok: false }) });
  assert.equal(response.status, 403);
  response = await handleRequest(request({
    operation: 'prepare', appId: 'chord', recoveryCode: '0123-4567-89AB-CDEF-GHJK', turnstileToken: 'token'
  }), env(), null, { ...deps, verifyTurnstileToken: async () => { throw new Error('Turnstile unavailable'); } });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: 'turnstile_failed' });
  response = await handleRequest(request({
    operation: 'prepare', appId: 'chord', recoveryCode: '0123-4567-89AB-CDEF-GHJK', turnstileToken: 'token'
  }), env({ RECOVERY_RATE_LIMITER: { limit: async () => ({ success: false }) } }), null, deps);
  assert.equal(response.status, 429);
  response = await handleRequest(request({
    operation: 'prepare', appId: 'chord', recoveryCode: '0123-4567-89AB-CDEF-GHJK', turnstileToken: 'token'
  }), env({ SYNC_RATE_LIMITER: null }), null, deps);
  assert.equal(response.status, 429, 'global abuse limiter is also required');
  response = await handleRequest(request({
    operation: 'prepare', appId: 'chord', recoveryCode: '0123-4567-89AB-CDEF-GHJK', turnstileToken: 'token', userId: 'victim'
  }), env(), null, deps);
  assert.equal(response.status, 400);
  assert.equal(repositoryCalls, 1);
  response = await handleRequest(new Request('https://sync.soundcruise.jp/v1/sync/recover', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: 'x'.repeat(9000)
  }), env(), null, deps);
  assert.equal(response.status, 413);
});

test('Recovery commit authenticates only the short claim and returns no credential plaintext', async () => {
  let commitInput;
  const deps = {
    readRuntimeControl: async () => OPEN_CONTROL,
    recoveryClaimVerifier: async () => ({ claimId: CLAIM_ID, claimVerifier: '4'.repeat(64) }),
    createRecoveryRepository: () => ({
      commit: async (input) => { commitInput = input; return { status: 'recovered', deviceId: DEVICE_ID, recoveryVersion: 2 }; }
    })
  };
  const response = await handleRequest(request({ operation: 'commit', appId: 'chord', claimToken: CLAIM }), env(), null, deps);
  assert.equal(response.status, 200);
  assert.equal(commitInput.claimId, CLAIM_ID);
  assert.equal(Object.hasOwn(commitInput, 'claimToken'), false);
  assert.deepEqual(await response.json(), {
    ok: true, operation: 'committed', appId: 'chord', deviceId: DEVICE_ID,
    recoveryVersion: 2, datasetState: 'remote_pending'
  });

  const malformed = await handleRequest(request({
    operation: 'commit', appId: 'chord', claimToken: 'not-a-recovery-claim'
  }), env(), null, { readRuntimeControl: async () => OPEN_CONTROL });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { ok: false, code: 'recovery_invalid' });
});

test('authenticated regeneration rotates only Recovery Code and preserves generic endpoint protections', async () => {
  const deps = {
    readRuntimeControl: async () => OPEN_CONTROL,
    authenticateDevice: async () => ({ userId: 'u1', deviceId: 'd1', appId: 'chord', userState: 'active' }),
    createRepository: () => ({}),
    createRecoveryCode: () => '23456789ABCDEFGHJKMN',
    recoveryCodeVerifier: async () => '2'.repeat(64),
    createRecoveryRepository: () => ({ regenerate: async () => ({ status: 'rotated', recoveryVersion: 3 }) })
  };
  const response = await handleRequest(request(
    { appId: 'chord' }, '/v1/sync/recovery-codes', { Authorization: 'Bearer ' + CREDENTIAL }
  ), env(), null, deps);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    ok: true, appId: 'chord', recoveryCode: '2345-6789-ABCD-EFGH-JKMN', recoveryVersion: 3
  });
  const evil = await handleRequest(new Request('https://sync.soundcruise.jp/v1/sync/recover', {
    method: 'OPTIONS', headers: {
      Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type'
    }
  }), env());
  assert.equal(evil.status, 403);
});
