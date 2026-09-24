import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/app.js';
import { createSqliteD1 } from './sqlite-d1.js';

// Deliberately nonproduction fixture. No live passcode or secret is used here.
const DUMMY_CODE = '0007';
const DUMMY_PEPPER = 'test-only-pro-credential-pepper-32-bytes-minimum';
const ORIGIN = 'https://soundcruise.jp';
const BASE = 'https://example.workers.dev/v2/pro-auth';

function fixture(overrides = {}) {
  const database = createSqliteD1();
  const env = {
    SYNC_DB: database,
    ALLOWED_ORIGINS: ORIGIN,
    PRO_PASSCODE_SLOT_A: DUMMY_CODE,
    PRO_CREDENTIAL_PEPPER: DUMMY_PEPPER,
    PRO_VERIFY_RATE_LIMITER: { async limit() { return { success: true }; } },
    ...overrides
  };
  let turnstileCalls = 0;
  const dependencies = {
    async verifyProTurnstile(token, _env, options) {
      turnstileCalls += 1;
      assert.equal(options.expectedAction, 'sound_cruise_pro_verify');
      return token === 'nonproduction-test-turnstile' ? { ok: true } : { ok: false };
    }
  };
  async function call(path, { method = 'GET', body, token, origin = ORIGIN, ip = '192.0.2.4', headers = {} } = {}) {
    const request = new Request(BASE + path, {
      method,
      headers: {
        Origin: origin,
        'CF-Connecting-IP': ip,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const response = await handleRequest(request, env, null, dependencies);
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { database, env, dependencies, call, get turnstileCalls() { return turnstileCalls; } };
}

async function issue(f) {
  const result = await f.call('/verify', { method: 'POST', body: {
    passcode: DUMMY_CODE, turnstileToken: 'nonproduction-test-turnstile'
  } });
  assert.equal(result.status, 201);
  assert.deepEqual(Object.keys(result.body).sort(), ['credential', 'generation', 'ok']);
  return result.body.credential;
}

test('dummy code issues a distinct 256-bit token and stores HMAC only', async () => {
  const f = fixture();
  try {
    const token = await issue(f);
    assert.match(token, /^scp1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    const row = f.database.raw.prepare('SELECT * FROM pro_credentials').get();
    assert.equal(row.scope, 'global_pro');
    assert.equal(row.generation, 1);
    assert.equal(row.verifier.length, 64);
    assert.equal(JSON.stringify(row).includes(token), false);
    assert.equal(await f.call('/session', { token }).then(r => r.status), 200);
  } finally { f.database.close(); }
});

test('verify validates ASCII exactly and preserves leading zero', async () => {
  const f = fixture();
  try {
    for (const passcode of ['0008', '０007', ' 0007', '0007 ', '007', '00007', 7, '00a7']) {
      const result = await f.call('/verify', { method: 'POST', body: { passcode, turnstileToken: 'nonproduction-test-turnstile' } });
      assert.equal(result.status, passcode === '0008' ? 401 : 400);
    }
    assert.equal((await f.call('/verify', { method: 'POST', body: {
      passcode: DUMMY_CODE, turnstileToken: 'nonproduction-test-turnstile', legacyAuthenticated: true
    } })).status, 400);
    assert.equal(f.database.raw.prepare('SELECT COUNT(*) AS n FROM pro_credentials').get().n, 0);
  } finally { f.database.close(); }
});

test('verify fails closed on absent/inactive secret, rate binding, and D1 errors', async () => {
  for (const overrides of [
    { PRO_PASSCODE_SLOT_A: undefined },
    { PRO_CREDENTIAL_PEPPER: undefined },
    { PRO_VERIFY_RATE_LIMITER: undefined },
    { PRO_VERIFY_RATE_LIMITER: { async limit() { throw Error('binding unavailable'); } } },
    { PRO_VERIFY_RATE_LIMITER: { async limit() { return { success: false }; } } }
  ]) {
    const f = fixture(overrides);
    try {
      const result = await f.call('/verify', { method: 'POST', body: {
        passcode: DUMMY_CODE, turnstileToken: 'nonproduction-test-turnstile'
      } });
      assert.equal(result.status, overrides.PRO_VERIFY_RATE_LIMITER?.limit &&
        (await overrides.PRO_VERIFY_RATE_LIMITER.limit({ key: 'test' }).catch(() => null))?.success === false ? 429 : 503);
    } finally { f.database.close(); }
  }
  const f = fixture({ PRO_PASSCODE_SLOT_B: undefined });
  try {
    assert.equal((await f.call('/verify', { method: 'POST', ip: '', body: {
      passcode: DUMMY_CODE, turnstileToken: 'nonproduction-test-turnstile'
    } })).status, 503);
    f.database.raw.exec("UPDATE pro_auth_state SET active_code_slot='B'");
    assert.equal((await f.call('/verify', { method: 'POST', body: {
      passcode: DUMMY_CODE, turnstileToken: 'nonproduction-test-turnstile'
    } })).status, 503);
    f.database.raw.exec('DROP TABLE pro_auth_state');
    assert.equal((await f.call('/policy')).status, 503);
  } finally { f.database.close(); }
});

test('Turnstile is required only for verify; invalid and replayed token fail', async () => {
  const f = fixture();
  try {
    assert.equal((await f.call('/verify', { method: 'POST', body: { passcode: DUMMY_CODE } })).status, 400);
    assert.equal((await f.call('/verify', { method: 'POST', body: {
      passcode: DUMMY_CODE, turnstileToken: 'bad'
    } })).status, 403);
    let used = false;
    f.dependencies.verifyProTurnstile = async () => {
      if (used) return { ok: false };
      used = true;
      return { ok: true };
    };
    assert.equal((await f.call('/verify', { method: 'POST', body: {
      passcode: DUMMY_CODE, turnstileToken: 'once'
    } })).status, 201);
    assert.equal((await f.call('/verify', { method: 'POST', body: {
      passcode: DUMMY_CODE, turnstileToken: 'once'
    } })).status, 403);
    f.dependencies.verifyProTurnstile = async () => ({ ok: false, unavailable: true });
    assert.equal((await f.call('/verify', { method: 'POST', body: {
      passcode: DUMMY_CODE, turnstileToken: 'outage'
    } })).status, 503);
    f.dependencies.verifyProTurnstile = async () => { throw Error('provider unavailable'); };
    assert.equal((await f.call('/verify', { method: 'POST', body: {
      passcode: DUMMY_CODE, turnstileToken: 'outage'
    } })).status, 503);
    assert.equal((await f.call('/policy')).status, 200);
  } finally { f.database.close(); }
});

test('revoke is immediate; generation change requires reauthentication', async () => {
  const f = fixture();
  try {
    const token = await issue(f);
    assert.equal((await f.call('/revoke', { method: 'POST', body: {}, token })).status, 200);
    assert.equal((await f.call('/session', { token })).body.code, 'invalid_credential');
    const next = await issue(f);
    f.database.raw.exec("UPDATE pro_auth_state SET generation=2, active_code_slot='B', legacy_compat_enabled=0, legacy_retired_at=1");
    assert.equal((await f.call('/session', { token: next })).body.code, 'reauth_required');
    assert.equal((await f.call('/policy')).body.legacyCompatibilityEnabled, false);
    assert.equal((await f.call('/revoke', { method: 'POST', body: {}, token: next })).status, 200);
  } finally { f.database.close(); }
});

test('malformed and unknown bearer fail; strict origin, CORS, no-store, and URLs', async () => {
  const f = fixture();
  try {
    const token = await issue(f);
    assert.equal((await f.call('/session', { token: 'scd1.other.bad' })).status, 401);
    const unknown = token.replace(/.$/, token.endsWith('A') ? 'B' : 'A');
    assert.equal((await f.call('/session', { token: unknown })).status, 401);
    assert.equal((await f.call('/session', { token, origin: 'https://evil.example' })).status, 403);
    assert.equal((await f.call('/session?credential=x', { token })).status, 400);
    const session = await f.call('/session', { token });
    assert.equal(session.headers.get('Cache-Control'), 'no-store');
    assert.equal(session.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    const preflight = await handleRequest(new Request(BASE + '/verify', {
      method: 'OPTIONS', headers: { Origin: ORIGIN,
        'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type' }
    }), f.env, null, f.dependencies);
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Cache-Control'), 'no-store');
    assert.equal((await f.call('/session', { token, origin: 'null' })).status, 403);
  } finally { f.database.close(); }
});
