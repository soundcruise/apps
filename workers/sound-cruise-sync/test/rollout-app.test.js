import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/app.js';

const ORIGIN = 'https://soundcruise.jp';
const DEVICE_ID = '123e4567-e89b-42d3-a456-426614174000';
const USER_ID = '123e4567-e89b-42d3-a456-426614174001';
const CREDENTIAL = `scd1.${DEVICE_ID}.${'A'.repeat(43)}`;
const ENROLLMENT = 'SCE1-0123-4567-89AB-CDEF-GHJK';
const control = (overrides = {}) => ({
  rolloutMode: 'open', admissionEnabled: true, dataWriteEnabled: true,
  dataReadEnabled: true, recoveryEnabled: true, cloudDeleteEnabled: true,
  generation: 1, updatedAt: 1, ...overrides
});

function env(overrides = {}) {
  return {
    ALLOWED_ORIGINS: ORIGIN, SYNC_ALLOWED_APP_IDS: 'chord',
    SYNC_CREDENTIAL_PEPPER: 'p'.repeat(64), SYNC_RECOVERY_PEPPER: 'r'.repeat(64),
    SYNC_ENROLLMENT_PEPPER: 'e'.repeat(64), SYNC_PAIRING_CODE_PEPPER: 'q'.repeat(64),
    SYNC_DB: { prepare() {}, batch() {} },
    START_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SYNC_RATE_LIMITER: { limit: async () => ({ success: true }) },
    RECOVERY_RATE_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides
  };
}

function start(enrollmentCode) {
  const body = {
    appId: 'chord', turnstileToken: 'token', deviceLabel: 'QA',
    initialSummary: { schemaVersion: 1, recordCount: 0, manifestHash: '0'.repeat(64) }
  };
  if (enrollmentCode !== undefined) body.enrollmentCode = enrollmentCode;
  return new Request('https://sync.soundcruise.jp/v1/sync/start', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
}

function dependencies(runtime, createStatus = 'created') {
  return {
    readRuntimeControl: async () => runtime,
    verifyTurnstileToken: async () => ({ ok: true }),
    createIdentityMaterial: async () => ({
      userId: USER_ID, deviceId: DEVICE_ID, credential: CREDENTIAL, credentialVerifier: 'c'.repeat(64)
    }),
    createRecoveryCode: () => '0123456789ABCDEFGHJK',
    recoveryCodeVerifier: async () => 'r'.repeat(64),
    enrollmentCodeVerifier: async () => 'e'.repeat(64),
    createProvisioningIdentity: async (_db, input) => ({ status: createStatus, input })
  };
}

test('closed blocks direct start before Turnstile even when an Enrollment Code is supplied', async () => {
  let turnstile = 0;
  const deps = dependencies(control({ rolloutMode: 'closed', admissionEnabled: false }));
  deps.verifyTurnstileToken = async () => { turnstile += 1; return { ok: true }; };
  const response = await handleRequest(start(ENROLLMENT), env(), null, deps);
  assert.equal(response.status, 423);
  assert.equal((await response.json()).code, 'sync_admission_paused');
  assert.equal(turnstile, 0);
});

test('cohort requires a valid one-time Enrollment verifier while open needs no code', async () => {
  const cohort = control({ rolloutMode: 'cohort' });
  let response = await handleRequest(start(), env(), null, dependencies(cohort));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'enrollment_required');
  const queryOnly = start();
  response = await handleRequest(new Request(`${queryOnly.url}?enrollmentCode=${encodeURIComponent(ENROLLMENT)}`, queryOnly), env(), null, dependencies(cohort));
  assert.equal(response.status, 403, 'query parameters cannot bypass cohort admission');
  assert.equal((await response.json()).code, 'enrollment_required');
  response = await handleRequest(start(ENROLLMENT), env(), null, dependencies(cohort, 'enrollment_invalid'));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'enrollment_invalid');
  response = await handleRequest(start(ENROLLMENT), env(), null, dependencies(cohort));
  assert.equal(response.status, 201);
  response = await handleRequest(start(), env(), null, dependencies(control()));
  assert.equal(response.status, 201);
});

test('write/read pause is server authoritative while Recovery and Cloud Delete stay independently available', async () => {
  const emergency = control({ rolloutMode: 'closed', admissionEnabled: false, dataWriteEnabled: false, dataReadEnabled: false });
  const deps = { readRuntimeControl: async () => emergency };
  const post = (path) => new Request(`https://sync.soundcruise.jp${path}`, {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Authorization: `Bearer ${CREDENTIAL}` }, body: '{}'
  });
  let response = await handleRequest(post('/v1/sync/push'), env(), null, deps);
  assert.equal((await response.json()).code, 'sync_write_paused');
  response = await handleRequest(post('/v1/sync/pairing-codes'), env(), null, deps);
  assert.equal((await response.json()).code, 'sync_admission_paused');
  response = await handleRequest(post('/v1/sync/pair'), env(), null, deps);
  assert.equal((await response.json()).code, 'sync_admission_paused');
  response = await handleRequest(new Request('https://sync.soundcruise.jp/v1/sync/snapshot?appId=chord', {
    method: 'GET', headers: { Origin: ORIGIN, Authorization: `Bearer ${CREDENTIAL}` }
  }), env(), null, deps);
  assert.equal((await response.json()).code, 'sync_read_paused');
  response = await handleRequest(post('/v1/sync/recover'), env(), null, deps);
  assert.equal(response.status, 400, 'Recovery reaches its own validation instead of the read/write gates');
  response = await handleRequest(post('/v1/sync/account/delete-intent'), env(), null, deps);
  assert.equal(response.status, 400, 'Cloud Delete reaches its own validation instead of the read/write gates');
});

test('Recovery and Cloud Delete close only through their independent server gates', async () => {
  const post = (path) => new Request(`https://sync.soundcruise.jp${path}`, {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Authorization: `Bearer ${CREDENTIAL}` }, body: '{}'
  });
  let response = await handleRequest(post('/v1/sync/recover'), env(), null, {
    readRuntimeControl: async () => control({ recoveryEnabled: false })
  });
  assert.equal(response.status, 423);
  assert.equal((await response.json()).code, 'sync_recovery_paused');
  response = await handleRequest(post('/v1/sync/account/delete-intent'), env(), null, {
    readRuntimeControl: async () => control({ cloudDeleteEnabled: false })
  });
  assert.equal(response.status, 423);
  assert.equal((await response.json()).code, 'sync_cloud_delete_paused');
});

test('missing or failed runtime-control reads fail closed before route handlers', async () => {
  let response = await handleRequest(start(), env(), null, { readRuntimeControl: async () => null });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'rollout_control_unavailable');
  response = await handleRequest(start(), env(), null, { readRuntimeControl: async () => { throw new Error('D1 unavailable'); } });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'rollout_control_unavailable');
});
