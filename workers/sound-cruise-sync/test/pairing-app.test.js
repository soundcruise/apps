import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/app.js';

const ORIGIN = 'https://soundcruise.jp';
const DEVICE_ID = '123e4567-e89b-42d3-a456-426614174000';
const USER_ID = '123e4567-e89b-42d3-a456-426614174001';
const CREDENTIAL = `scd1.${DEVICE_ID}.${'A'.repeat(43)}`;
const OPEN_CONTROL = Object.freeze({ rolloutMode: 'open', admissionEnabled: true, dataWriteEnabled: true, dataReadEnabled: true, recoveryEnabled: true, cloudDeleteEnabled: true });
const withControl = (dependencies = {}) => ({ readRuntimeControl: async () => OPEN_CONTROL, ...dependencies });

function env(overrides = {}) {
  return {
    ALLOWED_ORIGINS: ORIGIN,
    SYNC_ALLOWED_APP_IDS: 'chord',
    TURNSTILE_EXPECTED_HOSTNAME: 'soundcruise.jp',
    TURNSTILE_EXPECTED_ACTION: 'sound_cruise_sync_start',
    TURNSTILE_PAIR_EXPECTED_ACTION: 'sound_cruise_sync_pair',
    TURNSTILE_PRODUCTION_SECRET_KEY: 'secret',
    SYNC_CREDENTIAL_PEPPER: 'p'.repeat(64),
    SYNC_PAIRING_CODE_PEPPER: 'q'.repeat(64),
    SYNC_DB: { prepare() {}, batch() {} },
    START_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SYNC_RATE_LIMITER: { limit: async () => ({ success: true }) },
    PAIRING_ISSUE_RATE_LIMITER: { limit: async () => ({ success: true }) },
    PAIR_RATE_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides
  };
}

function request(path, payload, headers = {}) {
  return new Request(`https://sync.soundcruise.jp${path}`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload)
  });
}

const auth = async (_db, _authorization, appId) => ({ userId: USER_ID, deviceId: DEVICE_ID, appId, userState: 'provisioning' });

test('pairing code issue is credential-authenticated, rate-limited, and returns plaintext only once', async () => {
  let issueInput;
  const response = await handleRequest(request('/v1/sync/pairing-codes', { appId: 'chord' }, { Authorization: `Bearer ${CREDENTIAL}` }), env(), null, withControl({
    authenticateDevice: auth,
    createPairingCode: () => '01234567',
    pairingCodeVerifier: async () => 'v'.repeat(64),
    createPairingRepository: () => ({ issue: async (_identity, input) => { issueInput = input; return { status: 'issued', expiresAt: 600001 }; } })
  }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true, appId: 'chord', pairingCode: '01234567', expiresAt: 600001 });
  assert.equal(issueInput.codeVerifier, 'v'.repeat(64));
  assert.equal(JSON.stringify(issueInput).includes('01234567'), false);

  const limited = await handleRequest(
    request('/v1/sync/pairing-codes', { appId: 'chord' }, { Authorization: `Bearer ${CREDENTIAL}` }),
    env({ PAIRING_ISSUE_RATE_LIMITER: { limit: async () => ({ success: false }) } }),
    null,
    withControl({ authenticateDevice: auth })
  );
  assert.equal(limited.status, 429);
});

test('pair requires Turnstile and atomically returns a new device credential only on a consumed code', async () => {
  const material = { deviceId: '123e4567-e89b-42d3-a456-426614174999', credential: `scd1.123e4567-e89b-42d3-a456-426614174999.${'B'.repeat(43)}`, credentialVerifier: 'd'.repeat(64) };
  let pairInput;
  const response = await handleRequest(request('/v1/sync/pair', {
    appId: 'chord', pairingCode: '0123 4567', turnstileToken: 'token', deviceLabel: 'Device B'
  }), env(), null, withControl({
    verifyTurnstileToken: async (_token, _env, options) => { assert.equal(options.expectedAction, 'sound_cruise_sync_pair'); return { ok: true }; },
    pairingCodeVerifier: async () => 'v'.repeat(64),
    createIdentityMaterial: async () => material,
    createPairingRepository: () => ({ reserveAttempt: async () => ({ status: 'allowed' }), consume: async (_identity, input) => { pairInput = input; return { status: 'paired', userId: USER_ID }; } })
  }));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.deviceCredential, material.credential);
  assert.equal(pairInput.codeVerifier, 'v'.repeat(64));
  assert.equal(JSON.stringify(pairInput).includes('01234567'), false);

  const invalidTurnstile = await handleRequest(request('/v1/sync/pair', {
    appId: 'chord', pairingCode: '01234567', turnstileToken: 'bad'
  }), env(), null, withControl({ verifyTurnstileToken: async () => ({ ok: false }) }));
  assert.equal(invalidTurnstile.status, 403);

  const exhausted = await handleRequest(request('/v1/sync/pair', {
    appId: 'chord', pairingCode: '01234567', turnstileToken: 'token'
  }), env(), null, withControl({
    verifyTurnstileToken: async () => ({ ok: true }),
    pairingCodeVerifier: async () => 'v'.repeat(64),
    createPairingRepository: () => ({ reserveAttempt: async () => ({ status: 'attempts_exhausted' }) })
  }));
  assert.equal(exhausted.status, 400);
  assert.equal((await exhausted.json()).code, 'pairing_attempts_exhausted');

  const evil = await handleRequest(new Request('https://sync.soundcruise.jp/v1/sync/pair', {
    method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}'
  }), env());
  assert.equal(evil.status, 403);
});
