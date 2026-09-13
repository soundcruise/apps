import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/app.js';
import { hashRecord } from '../src/records.js';

const ORIGIN = 'https://soundcruise.jp';
const DEVICE_ID = '123e4567-e89b-42d3-a456-426614174000';
const USER_ID = '123e4567-e89b-42d3-a456-426614174001';
const CREDENTIAL = `scd1.${DEVICE_ID}.${'A'.repeat(43)}`;
const OPEN_CONTROL = Object.freeze({
  rolloutMode: 'open', admissionEnabled: true, dataWriteEnabled: true,
  dataReadEnabled: true, recoveryEnabled: true, cloudDeleteEnabled: true,
  generation: 1, updatedAt: 1
});

function dbBinding() {
  return { prepare() {}, batch() {} };
}

function env(overrides = {}) {
  return {
    ALLOWED_ORIGINS: ORIGIN,
    SYNC_ALLOWED_APP_IDS: 'chord',
    TURNSTILE_EXPECTED_HOSTNAME: 'soundcruise.jp',
    TURNSTILE_EXPECTED_ACTION: 'sound_cruise_sync_start',
    TURNSTILE_SECRET_KEY: 'secret',
    SYNC_CREDENTIAL_PEPPER: 'p'.repeat(64),
    SYNC_RECOVERY_PEPPER: 'r'.repeat(64),
    SYNC_DB: dbBinding(),
    START_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SYNC_RATE_LIMITER: { limit: async () => ({ success: true }) },
    RECOVERY_RATE_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides
  };
}

function body(overrides = {}) {
  return {
    appId: 'chord', turnstileToken: 'turnstile-token', deviceLabel: 'QA iPhone',
    initialSummary: { schemaVersion: 1, recordCount: 4, manifestHash: 'a'.repeat(64) },
    ...overrides
  };
}

function request(path = '/v1/sync/start', payload = body(), overrides = {}) {
  return new Request(`https://sync.soundcruise.jp${path}`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...(overrides.headers || {}) },
    body: JSON.stringify(payload),
    ...overrides
  });
}

function dependencies(calls) {
  return {
    readRuntimeControl: async () => OPEN_CONTROL,
    verifyTurnstileToken: async (token) => { calls.turnstile.push(token); return { ok: true }; },
    createIdentityMaterial: async () => ({
      userId: USER_ID, deviceId: DEVICE_ID, credential: CREDENTIAL, credentialVerifier: 'f'.repeat(64)
    }),
    createRecoveryCode: () => '0123456789ABCDEFGHJK',
    recoveryCodeVerifier: async () => 'e'.repeat(64),
    createProvisioningIdentity: async (_db, input) => { calls.database.push(input); return { datasetState: 'initializing' }; }
  };
}

test('health is minimal, no-store, and independent of provisioning bindings', async () => {
  const response = await handleRequest(new Request('https://sync.soundcruise.jp/health'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { ok: true, service: 'sound-cruise-sync', phase: 'p-roll-1' });
});

test('valid start provisions verifier-only identity and returns the secret once', async () => {
  const calls = { turnstile: [], database: [] };
  const response = await handleRequest(request(), env(), null, dependencies(calls));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), {
    ok: true, appId: 'chord', syncState: 'provisioning', datasetState: 'initializing',
    deviceId: DEVICE_ID, deviceCredential: CREDENTIAL,
    recoveryCode: '0123-4567-89AB-CDEF-GHJK', recoveryVersion: 1
  });
  assert.deepEqual(calls.turnstile, ['turnstile-token']);
  assert.equal(calls.database.length, 1);
  assert.equal(calls.database[0].credentialVerifier, 'f'.repeat(64));
  assert.equal(calls.database[0].recoveryVerifier, 'e'.repeat(64));
  assert.equal(JSON.stringify(calls.database[0]).includes(CREDENTIAL), false, 'plaintext credential does not reach D1 adapter');
  assert.equal(Object.prototype.hasOwnProperty.call(calls.database[0], 'turnstileToken'), false, 'Turnstile token does not reach D1');
});

test('origin, method, content type, body size, app allowlist, and client identities are rejected', async () => {
  const calls = { turnstile: [], database: [] };
  const deps = dependencies(calls);
  let response = await handleRequest(request('/v1/sync/start', body(), { headers: { Origin: 'https://evil.example' } }), env(), null, deps);
  assert.equal(response.status, 403);
  response = await handleRequest(new Request('https://sync.soundcruise.jp/v1/sync/start', { method: 'GET', headers: { Origin: ORIGIN } }), env(), null, deps);
  assert.equal(response.status, 405);
  response = await handleRequest(new Request('https://sync.soundcruise.jp/v1/sync/start', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain' }, body: '{}' }), env(), null, deps);
  assert.equal(response.status, 415);
  response = await handleRequest(request('/v1/sync/start', body({ appId: 'pitch' })), env(), null, deps);
  assert.equal(response.status, 400);
  response = await handleRequest(request('/v1/sync/start', body({ userId: 'attacker' })), env(), null, deps);
  assert.equal(response.status, 400);
  response = await handleRequest(new Request('https://sync.soundcruise.jp/v1/sync/start', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: 'x'.repeat(9000)
  }), env(), null, deps);
  assert.equal(response.status, 413);
  assert.equal(calls.turnstile.length, 0, 'invalid input never reaches Turnstile');
  assert.equal(calls.database.length, 0, 'invalid input never reaches D1');
});

test('rate limiter, Turnstile, secrets, D1, and provisioning failures are fail closed', async () => {
  const baseCalls = { turnstile: [], database: [] };
  let response = await handleRequest(request(), env({ START_RATE_LIMITER: { limit: async () => ({ success: false }) } }), null, dependencies(baseCalls));
  assert.equal(response.status, 429);
  assert.equal(baseCalls.turnstile.length, 0);

  response = await handleRequest(request(), env(), null, {
    ...dependencies(baseCalls), verifyTurnstileToken: async () => ({ ok: false })
  });
  assert.equal(response.status, 403);
  response = await handleRequest(request(), env(), null, {
    ...dependencies(baseCalls), verifyTurnstileToken: async () => ({ ok: false, unavailable: true })
  });
  assert.equal(response.status, 503);
  response = await handleRequest(request(), env(), null, {
    ...dependencies(baseCalls), verifyTurnstileToken: async () => { throw new Error('Turnstile down'); }
  });
  assert.equal(response.status, 503);
  response = await handleRequest(request(), env({ SYNC_CREDENTIAL_PEPPER: '' }), null, dependencies(baseCalls));
  assert.equal(response.status, 503);
  response = await handleRequest(request(), env({ SYNC_RECOVERY_PEPPER: '' }), null, dependencies(baseCalls));
  assert.equal(response.status, 503);
  response = await handleRequest(request(), env({ SYNC_DB: null }), null, dependencies(baseCalls));
  assert.equal(response.status, 503);
  response = await handleRequest(request(), env(), null, {
    ...dependencies(baseCalls), createProvisioningIdentity: async () => { throw new Error('D1 down'); }
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: 'server_error' });
});

test('OPTIONS is exact and unknown routes disclose no internals', async () => {
  let response = await handleRequest(new Request('https://sync.soundcruise.jp/v1/sync/start', {
    method: 'OPTIONS', headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type'
    }
  }), env());
  assert.equal(response.status, 204);
  response = await handleRequest(new Request('https://sync.soundcruise.jp/v1/sync/start', {
    method: 'OPTIONS', headers: {
      Origin: ORIGIN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type, Authorization'
    }
  }), env());
  assert.equal(response.status, 403);
  response = await handleRequest(new Request('https://sync.soundcruise.jp/unknown'));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { ok: false, code: 'not_found' });
});

test('configured same-origin GET accepts iOS standalone fetch metadata without weakening origin lockout', async () => {
  const repository = {
    getDataset: async () => ({ state: 'ready', schema_version: 1, min_change_seq: 0, last_change_seq: 0 }),
    readSnapshot: async () => ({
      dataset: { state: 'ready', schema_version: 1, last_change_seq: 0 },
      recordCount: 0,
      manifestHash: '0'.repeat(64),
      records: []
    })
  };
  const deps = authDependencies(repository);
  const standaloneRequest = (site = 'same-origin', origin) => new Request(
    'https://sound-cruise-sync.cruise-port-requests.workers.dev/v1/sync/snapshot?appId=chord',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${CREDENTIAL}`,
        'Sec-Fetch-Site': site,
        ...(origin ? { Origin: origin } : {})
      }
    }
  );
  const pilotEnv = env({ ALLOWED_ORIGINS: `${ORIGIN},https://sound-cruise-sync.cruise-port-requests.workers.dev` });

  let response = await handleRequest(standaloneRequest(), pilotEnv, null, deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://sound-cruise-sync.cruise-port-requests.workers.dev');

  response = await handleRequest(standaloneRequest(), env(), null, deps);
  assert.equal(response.status, 403, 'request URL origin must be explicitly configured');
  response = await handleRequest(new Request(
    'https://sound-cruise-sync.cruise-port-requests.workers.dev/v1/sync/snapshot?appId=chord',
    { method: 'GET', headers: { Authorization: `Bearer ${CREDENTIAL}` } }
  ), pilotEnv, null, deps);
  assert.equal(response.status, 403, 'a missing Origin without trusted Fetch Metadata remains rejected');
  response = await handleRequest(standaloneRequest('cross-site'), pilotEnv, null, deps);
  assert.equal(response.status, 403, 'cross-site fetch metadata remains rejected');
  response = await handleRequest(standaloneRequest('same-origin', 'https://evil.example'), pilotEnv, null, deps);
  assert.equal(response.status, 403, 'an explicit untrusted Origin takes precedence');
});

async function pushOperation(overrides = {}) {
  const value = {
    operationId: '123e4567-e89b-52d3-a456-426614174000',
    recordType: 'chord', recordId: 'c1', schemaVersion: 1, baseRevision: 0,
    payload: { id: 'c1', chordName: 'C' }, payloadHash: '', deleted: false,
    ...overrides
  };
  value.payloadHash = await hashRecord(value);
  return value;
}

function authDependencies(repository, authenticate = async (_db, _authorization, appId) => ({
  userId: USER_ID, deviceId: DEVICE_ID, appId, userState: 'provisioning'
})) {
  return { readRuntimeControl: async () => OPEN_CONTROL, authenticateDevice: authenticate, createRepository: () => repository };
}

function authRequest(path, options = {}) {
  const method = options.method || 'GET';
  return new Request(`https://sync.soundcruise.jp${path}`, {
    method,
    headers: {
      Origin: ORIGIN,
      Authorization: `Bearer ${CREDENTIAL}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    },
    body: method === 'POST' ? JSON.stringify(options.body) : undefined
  });
}

test('authenticated push returns per-operation applied, invalid, and conflict outcomes', async () => {
  const valid = await pushOperation();
  const conflictRecord = {
    recordType: 'chord', recordId: 'c2', schemaVersion: 1, revision: 2,
    payload: { id: 'c2', chordName: 'Dm' }, payloadHash: '', deletedAt: null,
    operationId: 'server-op', changeSeq: 2
  };
  conflictRecord.payloadHash = await hashRecord(conflictRecord);
  const repository = {
    getDataset: async () => ({ state: 'ready', min_change_seq: 0 }),
    applyOperation: async (_identity, operation) => operation.recordId === 'c2'
      ? { status: 'conflict', record: conflictRecord }
      : {
          status: 'applied',
          record: { ...operation, revision: 1, deletedAt: null, changeSeq: 1 }
        }
  };
  const conflict = await pushOperation({
    operationId: '123e4567-e89b-52d3-a456-426614174002',
    recordId: 'c2', payload: { id: 'c2', chordName: 'D' }
  });
  conflict.payloadHash = await hashRecord(conflict);
  const tampered = { ...await pushOperation({ operationId: '123e4567-e89b-52d3-a456-426614174003' }), payloadHash: '0'.repeat(64) };
  const response = await handleRequest(authRequest('/v1/sync/push', {
    method: 'POST', body: { appId: 'chord', mode: 'sync', operations: [valid, tampered, conflict] }
  }), env(), null, authDependencies(repository));
  assert.equal(response.status, 200);
  const responseBody = await response.json();
  assert.deepEqual(responseBody.results.map((result) => result.status), ['applied', 'invalid', 'conflict']);
});

test('changes, snapshot, and migration completion are credential-authenticated and cursor-safe', async () => {
  const record = {
    recordType: 'chord', recordId: 'c1', schemaVersion: 1, revision: 1,
    payload: { id: 'c1', chordName: 'C' }, payloadHash: '', deletedAt: null,
    operationId: 'op', changeSeq: 1
  };
  record.payloadHash = await hashRecord(record);
  const repository = {
    getDataset: async () => ({ state: 'ready', schema_version: 1, min_change_seq: 0, last_change_seq: 1 }),
    listChanges: async () => ({ changes: [record], hasMore: false }),
    readSnapshot: async () => ({
      dataset: { state: 'ready', schema_version: 1, last_change_seq: 1 },
      recordCount: 1, manifestHash: 'a'.repeat(64), records: [record]
    }),
    completeMigration: async () => ({
      status: 'ready',
      snapshot: { dataset: { last_change_seq: 1 }, recordCount: 1, manifestHash: 'a'.repeat(64) }
    })
  };
  const deps = authDependencies(repository);
  let response = await handleRequest(authRequest('/v1/sync/changes?appId=chord&cursor=scc1.MA'), env(), null, deps);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).nextCursor, 'scc1.MQ');
  response = await handleRequest(authRequest('/v1/sync/changes?appId=chord&cursor=raw-sequence'), env(), null, deps);
  assert.equal(response.status, 400);
  response = await handleRequest(authRequest('/v1/sync/snapshot?appId=chord'), env(), null, deps);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).records.length, 1);
  response = await handleRequest(authRequest('/v1/sync/migration/complete', {
    method: 'POST', body: { appId: 'chord', schemaVersion: 1, recordCount: 1, manifestHash: 'a'.repeat(64) }
  }), env(), null, deps);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).datasetState, 'ready');
});

test('auth API rejects missing rate limiter, invalid credential, cross-app input, and oversized push', async () => {
  const valid = await pushOperation();
  const payload = { appId: 'chord', mode: 'sync', operations: [valid] };
  let response = await handleRequest(authRequest('/v1/sync/push', { method: 'POST', body: payload }), env({ SYNC_RATE_LIMITER: null }), null, authDependencies({}));
  assert.equal(response.status, 429);
  response = await handleRequest(authRequest('/v1/sync/push', { method: 'POST', body: payload }), env(), null,
    authDependencies({}, async () => null));
  assert.equal(response.status, 401);
  response = await handleRequest(authRequest('/v1/sync/push', {
    method: 'POST', body: { ...payload, appId: 'pitch' }
  }), env(), null, authDependencies({}));
  assert.equal(response.status, 400);
  response = await handleRequest(new Request('https://sync.soundcruise.jp/v1/sync/push', {
    method: 'POST', headers: { Origin: ORIGIN, Authorization: `Bearer ${CREDENTIAL}`, 'Content-Type': 'application/json' },
    body: 'x'.repeat(257 * 1024)
  }), env(), null, authDependencies({}));
  assert.equal(response.status, 413);
  response = await handleRequest(new Request('https://sync.soundcruise.jp/v1/sync/push', {
    method: 'POST', headers: { Origin: ORIGIN, Authorization: `Bearer ${CREDENTIAL}`, 'Content-Type': 'application/json' },
    body: '{not-json'
  }), env(), null, authDependencies({}));
  assert.equal(response.status, 400);
});
