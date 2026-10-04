import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { handleRequest } from '../src/app.js';
import { inspectProCredentialReadOnly } from '../src/pro-auth-app.js';
import { createSqliteD1, seedIdentity } from './sqlite-d1.js';
import { hmacVerifier } from '../src/crypto.js';
import { cleanupProLockouts } from '../src/pro-auth-lockout.js';
import { PRO_SESSION_IDLE_MS, PRO_SESSION_LEASE_MS } from '../src/pro-device-session.js';

const ORIGIN = 'https://soundcruise.jp', PEPPER = 'isolated-pro-session-verifier-pepper-32-min';
const CODE = '0007'; // Isolated fixture, never a production passcode.
const encode = bytes => Buffer.from(bytes).toString('base64url');
async function fixture() {
  const db = createSqliteD1();
  let now = 1_790_000_000_000;
  db.raw.prepare('UPDATE pro_auth_state SET session_lifecycle_started_at=?,unbound_backend_until=?').run(now, now + PRO_SESSION_IDLE_MS);
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const env = { SYNC_DB: db, ALLOWED_ORIGINS: ORIGIN, PRO_CREDENTIAL_PEPPER: PEPPER,
    PRO_LOCKOUT_PEPPER: 'isolated-pro-session-lockout-pepper-32-min', PRO_PASSCODE_SLOT_A: CODE,
    PRO_VERIFY_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SYNC_RATE_LIMITER: { limit: async () => ({ success: true }) } };
  const deps = { now: () => now, verifyProTurnstile: async () => ({ ok: true }) };
  async function call(path, token, body, extra = {}) {
    const response = await handleRequest(new Request('https://sync.example/v2/pro-auth' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: ORIGIN, 'CF-Connecting-IP': '192.0.2.10',
        ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    }), env, null, deps);
    return { status: response.status, body: await response.json() };
  }
  async function issue(bound = true) {
    const response = await call('/verify', null, { passcode: CODE, turnstileToken: 'isolated',
      ...(bound ? { devicePublicKey: publicKey } : {}) });
    assert.equal(response.status, 201); return response.body;
  }
  async function proof(token, key = publicKey, signer = pair.privateKey) {
    const response = await call('/device-session/challenge', token, { publicKey: key });
    if (response.status !== 200) return response;
    const { challenge, mac, message } = response.body;
    return { publicKey: key, challenge, mac, signature: encode(await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' }, signer, new TextEncoder().encode(message))) };
  }
  async function renew(token) {
    const body = await proof(token);
    return body.status ? body : call('/device-session/renew', token, body);
  }
  return { db, env, deps, pair, publicKey, call, issue, proof, renew,
    advance(ms) { now += ms; }, get now() { return now; } };
}

test('first login binds a non-secret public key, same device silently renews over many months', async () => {
  const f = await fixture();
  try {
    const issued = await f.issue(); const token = issued.credential;
    assert.equal(issued.session.version, 3);
    assert.equal(issued.session.offlineUntil, f.now + PRO_SESSION_LEASE_MS);
    for (let month = 0; month < 14; month++) {
      f.advance(28 * 86400_000);
      const expiredLease = await inspectProCredentialReadOnly('Bearer ' + token, f.env, f.deps);
      assert.equal(expiredLease.code, 'pro_revalidation_required');
      const renewed = await f.renew(token);
      assert.equal(renewed.status, 200);
      assert.equal(renewed.body.session.lastValidatedAt, f.now);
      assert.equal((await inspectProCredentialReadOnly('Bearer ' + token, f.env, f.deps)).ok, true);
    }
    assert.equal(f.db.raw.prepare('SELECT count(*) AS n FROM pro_credentials').get().n, 1);
    assert.equal(f.db.raw.prepare('SELECT count(*) AS n FROM pro_auth_lockouts').get().n, 0);
  } finally { f.db.close(); }
});

test('90-day inactivity is server enforced and cannot be renewed with the old browser key', async () => {
  const f = await fixture();
  try {
    const { credential: token } = await f.issue(); f.advance(PRO_SESSION_IDLE_MS);
    assert.equal((await f.renew(token)).status, 401);
    assert.equal((await f.call('/session', token)).body.code, 'reauth_required');
    assert.equal((await inspectProCredentialReadOnly('Bearer ' + token, f.env, f.deps)).code, 'pro_reauth_required');
  } finally { f.db.close(); }
});

test('valid existing opaque token upgrades without passcode or token replacement; flags alone never upgrade', async () => {
  const f = await fixture();
  try {
    const { credential: token } = await f.issue(false);
    const before = f.db.raw.prepare('SELECT verifier,generation,created_at FROM pro_credentials').get();
    assert.equal((await f.renew(token)).status, 200);
    assert.deepEqual(f.db.raw.prepare('SELECT verifier,generation,created_at FROM pro_credentials').get(), before);
    assert.equal((await f.call('/device-session/challenge', 'legacy-pro-ok', { publicKey: f.publicKey })).status, 401);
    assert.equal((await f.call('/device-session/challenge', null, { publicKey: f.publicKey })).status, 401);
    assert.equal(f.db.raw.prepare('SELECT legacy_compat_enabled FROM pro_auth_state').get().legacy_compat_enabled, 1);
  } finally { f.db.close(); }
});

test('old unbound credentials have a finite transition; genuine old token can upgrade while active', async () => {
  const f = await fixture();
  try {
    const { credential: token } = await f.issue(false);
    f.db.raw.prepare('UPDATE pro_auth_state SET unbound_backend_until=?').run(f.now);
    assert.equal((await inspectProCredentialReadOnly('Bearer ' + token, f.env, f.deps)).code, 'pro_revalidation_required');
    assert.equal((await f.renew(token)).status, 200);
  } finally { f.db.close(); }
});

test('copied bearer cannot rebind to a different browser and cannot maintain backend access after its lease', async () => {
  const f = await fixture();
  try {
    const { credential: token } = await f.issue();
    const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
    const key = await crypto.subtle.exportKey('jwk', other.publicKey);
    assert.equal((await f.proof(token, key, other.privateKey)).body.code, 'device_session_mismatch');
    const body = await f.proof(token);
    body.signature = encode(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, other.privateKey,
      new TextEncoder().encode('forged')));
    assert.equal((await f.call('/device-session/renew', token, body)).status, 401);
    f.advance(PRO_SESSION_LEASE_MS);
    assert.equal((await inspectProCredentialReadOnly('Bearer ' + token, f.env, f.deps)).code, 'pro_revalidation_required');
    assert.equal((await f.renew(token)).status, 200);
  } finally { f.db.close(); }
});

test('one-use proof rejects replay, forgery, expiry and a proof for a different credential', async () => {
  const f = await fixture();
  try {
    const { credential: token } = await f.issue(); const body = await f.proof(token);
    assert.equal((await f.call('/device-session/renew', token, { ...body, mac: '0'.repeat(64) })).status, 401);
    assert.equal((await f.call('/device-session/renew', token, body)).status, 200);
    assert.equal((await f.call('/device-session/renew', token, body)).status, 401);
    const { credential: other } = await f.issue();
    assert.equal((await f.call('/device-session/renew', other, body)).status, 401);
    const expiring = await f.proof(token); f.advance(120_000);
    assert.equal((await f.call('/device-session/renew', token, expiring)).status, 401);
    await cleanupProLockouts(f.db, f.now);
    assert.equal(f.db.raw.prepare('SELECT count(*) AS n FROM pro_session_proofs').get().n, 0);
  } finally { f.db.close(); }
});

test('revocation, generation change and races during proof verification never resurrect a session', async () => {
  for (const mutation of ['revoke', 'generation']) {
    const f = await fixture();
    try {
      const { credential: token } = await f.issue(); const body = await f.proof(token);
      if (mutation === 'revoke') assert.equal((await f.call('/revoke', token, {})).status, 200);
      else f.db.raw.exec('UPDATE pro_auth_state SET generation=generation+1');
      assert.equal((await f.call('/device-session/renew', token, body)).status, 401);
      assert.equal((await inspectProCredentialReadOnly('Bearer ' + token, f.env, f.deps)).ok, false);
    } finally { f.db.close(); }
  }
  const f = await fixture();
  try {
    const { credential: token } = await f.issue(), body = await f.proof(token);
    const subtle = new Proxy(crypto.subtle, { get(target, key) {
      if (key === 'verify') return async (...args) => {
        f.db.raw.prepare('UPDATE pro_credentials SET revoked_at=?').run(f.now);
        return target.verify(...args);
      };
      return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
    } });
    f.deps.cryptoImpl = { subtle, randomUUID: crypto.randomUUID.bind(crypto) };
    assert.equal((await f.call('/device-session/renew', token, body)).status, 401);
  } finally { f.db.close(); }
});

test('bounded session checks remain shared by Sync, attachment and AI entitlement', async () => {
  const f = await fixture();
  try {
    const { credential: token } = await f.issue();
    const guard = () => inspectProCredentialReadOnly('Bearer ' + token, f.env, f.deps);
    assert.equal((await guard()).ok, true);
    f.advance(PRO_SESSION_LEASE_MS);
    assert.equal((await guard()).code, 'pro_revalidation_required');
    const request = new Request('https://sync.example/v1/sync/assets/123e4567-e89b-42d3-a456-426614174099', {
      headers: { Origin: ORIGIN, 'X-Sound-Cruise-Pro-Authorization': 'Bearer ' + token }
    });
    const response = await handleRequest(request, f.env, null, { ...f.deps,
      readRuntimeControl: async () => ({ rolloutMode: 'open', dataReadEnabled: true }) });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'pro_revalidation_required');
  } finally { f.db.close(); }
});

test('session renewal affects only Pro metadata, never Account or app data', async () => {
  const f = await fixture();
  try {
    const tables = ['sync_accounts','sync_account_devices','sync_devices','sync_datasets','sync_records','sync_changes','sync_assets'];
    const data = () => JSON.stringify(tables.map(table => f.db.raw.prepare('SELECT * FROM '+table).all()));
    const before = data(), { credential: token } = await f.issue();
    assert.equal((await f.renew(token)).status, 200); assert.equal(data(), before);
    f.env.SYNC_RATE_LIMITER.limit = async () => ({ success: false });
    assert.equal((await f.renew(token)).status, 429);
    f.env.PRO_CREDENTIAL_PEPPER = undefined;
    f.env.SYNC_RATE_LIMITER.limit = async () => ({ success: true });
    assert.equal((await f.renew(token)).status, 503);
  } finally { f.db.close(); }
});

test('migration 0033 preserves populated application tables and existing Pro verifier/state', () => {
  const database = new DatabaseSync(':memory:');
  try {
    const directory = path.join(import.meta.dirname, '../migrations');
    for (const file of readdirSync(directory).filter(name => /^00\d\d_.*\.sql$/.test(name)).sort()) {
      if (file.startsWith('0033_')) break;
      database.exec(readFileSync(path.join(directory, file), 'utf8'));
    }
    const identity = seedIdentity({ raw: database });
    database.prepare(`INSERT INTO sync_records (user_id,app_id,record_type,record_id,payload_json,
      payload_hash,revision,updated_at,last_operation_id) VALUES (?,?,'settings','qa-settings',?, ?,1,1,'qa-operation')`)
      .run(identity.userId, identity.appId, JSON.stringify({ theme: 'dark', qa: 'preserved' }), 'c'.repeat(64));
    database.prepare(`INSERT INTO pro_credentials (id,verifier,generation,scope,created_at,revoked_at)
      VALUES ('old-valid-pro',?,1,'global_pro',1,NULL)`).run('a'.repeat(64));
    const tables = database.prepare(`SELECT name FROM sqlite_master WHERE type='table'
      AND name NOT LIKE 'pro_%' ORDER BY name`).all().map(row => row.name);
    const snapshot = () => JSON.stringify(tables.map(table => database.prepare('SELECT * FROM '+table).all()));
    const before = snapshot();
    const state = database.prepare('SELECT * FROM pro_auth_state').get();
    const credential = database.prepare('SELECT * FROM pro_credentials').get();
    database.exec(readFileSync(path.join(directory, '0033_add_pro_device_sessions.sql'), 'utf8'));
    assert.equal(snapshot(), before);
    const migratedState = database.prepare('SELECT * FROM pro_auth_state').get();
    const migratedCredential = database.prepare('SELECT * FROM pro_credentials').get();
    for (const key of Object.keys(state)) assert.equal(migratedState[key], state[key]);
    for (const key of Object.keys(credential)) assert.equal(migratedCredential[key], credential[key]);
    assert.equal(migratedState.unbound_backend_until - migratedState.session_lifecycle_started_at, PRO_SESSION_IDLE_MS);
    assert.equal(migratedCredential.device_public_key, null);
    assert.equal(database.prepare('SELECT count(*) AS n FROM pro_session_proofs').get().n, 0);
  } finally { database.close(); }
});
