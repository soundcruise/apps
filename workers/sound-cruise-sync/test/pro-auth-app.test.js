import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/app.js';
import { createSqliteD1 } from './sqlite-d1.js';
import { cleanupProLockouts } from '../src/pro-auth-lockout.js';

// Deliberately nonproduction fixture. No live passcode or secret is used here.
const DUMMY_CODE = '0007';
const DUMMY_PEPPER = 'test-only-pro-credential-pepper-32-bytes-minimum';
const DUMMY_LOCKOUT_PEPPER = 'test-only-distinct-pro-lockout-pepper-32-bytes';
const ORIGIN = 'https://soundcruise.jp';
const BASE = 'https://example.workers.dev/v2/pro-auth';

function fixture(overrides = {}) {
  const database = createSqliteD1();
  const env = {
    SYNC_DB: database,
    ALLOWED_ORIGINS: ORIGIN,
    PRO_PASSCODE_SLOT_A: DUMMY_CODE,
    PRO_CREDENTIAL_PEPPER: DUMMY_PEPPER,
    PRO_LOCKOUT_PEPPER: DUMMY_LOCKOUT_PEPPER,
    PRO_VERIFY_RATE_LIMITER: { async limit() { return { success: true }; } },
    ...overrides
  };
  let turnstileCalls = 0;
  let now = 1_000_000_000;
  const dependencies = {
    now: () => now,
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
  return { database, env, dependencies, call, setNow(value) { now = value; },
    advance(ms) { now += ms; }, get now() { return now; },
    get turnstileCalls() { return turnstileCalls; } };
}

function wrong(f, ip = '192.0.2.4') {
  return f.call('/verify', { method: 'POST', ip,
    body: { passcode: '0008', turnstileToken: 'nonproduction-test-turnstile' } });
}

function lockoutRow(f) {
  return f.database.raw.prepare('SELECT * FROM pro_auth_lockouts').get();
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
    { PRO_LOCKOUT_PEPPER: undefined },
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

test('five wrong codes lock for 5, then 15, then at most 30 minutes', async () => {
  const f = fixture();
  try {
    for (const [duration, level] of [[300_000, 1], [900_000, 2], [1_800_000, 2], [1_800_000, 2]]) {
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        assert.equal((await wrong(f)).status, 401);
        assert.equal(lockoutRow(f).failure_count, attempt);
        assert.equal(lockoutRow(f).locked_until, null);
      }
      assert.equal((await wrong(f)).status, 401);
      const row = lockoutRow(f);
      assert.equal(row.failure_count, 0);
      assert.equal(row.lock_level, level);
      assert.equal(row.locked_until, f.now + duration);
      const beforeChallenge = f.turnstileCalls;
      const locked = await wrong(f);
      assert.equal(locked.status, 429);
      assert.equal(locked.headers.get('Retry-After'), String(duration / 1000));
      assert.deepEqual(locked.body, { ok: false, code: 'rate_limited' });
      assert.equal(f.turnstileCalls, beforeChallenge, 'locked request does not consume Turnstile');
      f.advance(duration);
    }
    assert.equal((await wrong(f)).status, 401, 'retry is possible at lock expiry');
  } finally { f.database.close(); }
});

test('correct code resets failure and escalation only after credential issue succeeds', async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 5; i += 1) await wrong(f);
    assert.equal((await f.call('/verify', { method: 'POST', body: {
      passcode: DUMMY_CODE, turnstileToken: 'nonproduction-test-turnstile'
    } })).status, 429, 'correct code is still locked');
    f.advance(300_000);
    const token = await issue(f);
    assert.equal(lockoutRow(f), undefined);
    assert.equal((await f.call('/session', { token })).status, 200);
    assert.equal((await wrong(f)).status, 401);
    assert.equal(lockoutRow(f).failure_count, 1);
    assert.equal(lockoutRow(f).lock_level, 0);

    // A failed batch cannot erase the failure state without issuing a credential.
    f.database.raw.exec('DROP TABLE pro_credentials');
    assert.equal((await f.call('/verify', { method: 'POST', body: {
      passcode: DUMMY_CODE, turnstileToken: 'nonproduction-test-turnstile'
    } })).status, 503);
    assert.equal(lockoutRow(f).failure_count, 1);
  } finally { f.database.close(); }
});

test('24-hour wrong-passcode inactivity resets escalation and stale rows are cleaned', async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 5; i += 1) await wrong(f);
    f.advance(24 * 60 * 60 * 1000);
    assert.equal((await wrong(f)).status, 401);
    assert.equal(lockoutRow(f).failure_count, 1);
    assert.equal(lockoutRow(f).lock_level, 0);
    f.advance(24 * 60 * 60 * 1000);
    await cleanupProLockouts(f.database, f.now);
    assert.equal(lockoutRow(f), undefined);
  } finally { f.database.close(); }
});

test('different IPs are isolated, while the same IP shares a lock', async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 5; i += 1) await wrong(f, '192.0.2.4');
    assert.equal((await wrong(f, '192.0.2.4')).status, 429);
    assert.equal((await wrong(f, '192.0.2.5')).status, 401);
    assert.equal((await f.call('/verify', { method: 'POST', ip: '192.0.2.5', body: {
      passcode: DUMMY_CODE, turnstileToken: 'nonproduction-test-turnstile'
    } })).status, 201);
    assert.equal(f.database.raw.prepare('SELECT COUNT(*) AS n FROM pro_auth_lockouts').get().n, 1);
  } finally { f.database.close(); }
});

test('only Turnstile-passed wrong codes count; failed dependencies fail closed', async () => {
  const f = fixture();
  try {
    const malformed = await f.call('/verify', { method: 'POST', body: {
      passcode: '007', turnstileToken: 'nonproduction-test-turnstile'
    } });
    assert.equal(malformed.status, 400);
    assert.equal((await f.call('/verify', { method: 'POST', body: {
      passcode: '0008', turnstileToken: 'bad'
    } })).status, 403);
    assert.equal((await f.call('/verify', { method: 'POST', origin: 'https://wrong.example', body: {
      passcode: '0008', turnstileToken: 'nonproduction-test-turnstile'
    } })).status, 403);
    assert.equal(lockoutRow(f), undefined);

    f.env.PRO_VERIFY_RATE_LIMITER = { async limit() { return { success: false }; } };
    assert.equal((await wrong(f)).status, 429);
    assert.equal(lockoutRow(f), undefined);
    f.env.PRO_VERIFY_RATE_LIMITER = { async limit() { return { success: true }; } };
    f.env.PRO_LOCKOUT_PEPPER = undefined;
    assert.equal((await wrong(f)).status, 503);
    assert.equal(lockoutRow(f), undefined);
    f.env.PRO_LOCKOUT_PEPPER = DUMMY_LOCKOUT_PEPPER;
    f.database.raw.exec('DROP TABLE pro_auth_lockouts');
    assert.equal((await wrong(f)).status, 503);
    assert.equal(f.database.raw.prepare('SELECT COUNT(*) AS n FROM pro_credentials').get().n, 0);
  } finally { f.database.close(); }
});

test('parallel failures cannot skip the lock threshold', async () => {
  const f = fixture();
  try {
    const results = await Promise.all(Array.from({ length: 10 }, () => wrong(f)));
    assert.equal(results.filter((result) => result.status === 401).length, 5);
    assert.equal(results.filter((result) => result.status === 429).length, 5);
    assert.equal(lockoutRow(f).lock_level, 1);
    assert.equal(lockoutRow(f).failure_count, 0);
  } finally { f.database.close(); }
});

test('lockout never affects legacy policy, Server session, or revoke', async () => {
  const f = fixture();
  try {
    const token = await issue(f);
    for (let i = 0; i < 5; i += 1) await wrong(f);
    assert.equal((await f.call('/policy')).body.legacyCompatibilityEnabled, true);
    assert.equal((await f.call('/session', { token })).status, 200);
    assert.equal((await f.call('/revoke', { method: 'POST', body: {}, token })).status, 200);
    assert.equal((await f.call('/session', { token })).status, 401);
    assert.equal(lockoutRow(f).failure_count, 0, 'revoke does not count as a wrong passcode');
  } finally { f.database.close(); }
});

test('lockout persistence contains HMAC only, never IP, passcode, or token', async () => {
  const f = fixture();
  try {
    const token = await issue(f);
    await wrong(f);
    const row = lockoutRow(f);
    assert.match(row.ip_key, /^[0-9a-f]{64}$/);
    assert.equal(row.ip_key.includes('192.0.2.4'), false);
    assert.equal(JSON.stringify(row).includes('0008'), false);
    assert.equal(JSON.stringify(row).includes(token), false);
    assert.equal(Object.keys(row).some((key) => /ip_address|passcode|token|authorization/u.test(key)), false);
  } finally { f.database.close(); }
});
