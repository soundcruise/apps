import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { handleRequest } from '../src/app.js';
import {
  createQaCredential,
  createQaEnrollmentCode,
  formatQaEnrollmentCode,
  normalizeQaEnrollmentCode,
  parseQaCredential,
  qaCredentialVerifier,
  qaEnrollmentCodeVerifier,
  ACCOUNT_QA
} from '../src/account-qa-crypto.js';
import { createD1AccountQaRepository } from '../src/account-qa-database.js';
import { createAccountCredential, createAccountRecoveryCode } from '../src/account-crypto.js';
import { createSqliteD1 } from './sqlite-d1.js';

const origin = 'https://soundcruise.jp';
const enrollmentPepper = 'm10-qa-enrollment-pepper-at-least-32-chars';
const credentialPepper = 'm10-qa-credential-pepper-at-least-32-chars';

function limiter(success = true) {
  return { async limit() { return { success }; } };
}

function enableAccount(db) {
  db.raw.prepare(`UPDATE sync_account_runtime_control
    SET rollout_mode='open', account_admission_enabled=1,
        membership_admission_enabled=1, account_read_enabled=1 WHERE singleton_id=1`).run();
}

function env(db) {
  return {
    SYNC_DB: db,
    ACCOUNT_ALLOWED_ORIGINS: origin,
    SYNC_ACCOUNT_QA_ENROLLMENT_PEPPER: enrollmentPepper,
    SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER: credentialPepper,
    SYNC_ACCOUNT_CREDENTIAL_PEPPER: 'm10-account-credential-pepper-at-least-32',
    SYNC_ACCOUNT_RECOVERY_PEPPER: 'm10-account-recovery-pepper-at-least-32',
    ACCOUNT_QA_ENROLL_RATE_LIMITER: limiter(),
    ACCOUNT_START_RATE_LIMITER: limiter(),
    TURNSTILE_PRODUCTION_SECRET_KEY: 'test-turnstile'
  };
}

function request(path, body, headers = {}) {
  return new Request(`https://sync.example${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

test('QA material is high-entropy, separately domain-bound and strictly parsed', async () => {
  const credential = createQaCredential();
  const code = createQaEnrollmentCode();
  assert.equal(parseQaCredential(credential.credential)?.sessionId, credential.sessionId);
  assert.match(credential.credential, /^scq1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(normalizeQaEnrollmentCode(formatQaEnrollmentCode(code)), code);
  assert.equal(parseQaCredential(credential.credential.replace('scq1', 'sca1')), null);
  assert.notEqual(
    await qaCredentialVerifier(credential.credential, credentialPepper),
    await qaEnrollmentCodeVerifier(code, enrollmentPepper)
  );
  assert.equal(ACCOUNT_QA.SESSION_TTL_MS, 7 * 24 * 60 * 60 * 1000);
});

test('one-time QA Enrollment stores only verifiers, expires, revokes and fails closed', async () => {
  const db = createSqliteD1();
  const repository = createD1AccountQaRepository(db);
  const code = createQaEnrollmentCode();
  const codeVerifier = await qaEnrollmentCodeVerifier(code, enrollmentPepper);
  const material = createQaCredential();
  const verifier = await qaCredentialVerifier(material.credential, credentialPepper);
  db.raw.prepare(`INSERT INTO sync_account_qa_enrollments
    (id,code_verifier,created_at,expires_at,consumed_at,cancelled_at,consumed_by_session_id)
    VALUES ('qa-e1',?,100,10000,NULL,NULL,NULL)`).run(codeVerifier);
  const consumed = await repository.consumeEnrollment({
    sessionId: material.sessionId, codeVerifier, credentialVerifier: verifier, now: 200
  });
  assert.equal(consumed.status, 'created');
  assert.equal(consumed.expiresAt, 200 + ACCOUNT_QA.SESSION_TTL_MS);
  assert.equal((await repository.consumeEnrollment({
    sessionId: createQaCredential().sessionId, codeVerifier, credentialVerifier: 'b'.repeat(64), now: 201
  })).status, 'used');
  assert.equal((await repository.authenticate({
    sessionId: material.sessionId, credentialVerifier: verifier, now: 300, scope: 'port'
  })).scope, 'port');
  assert.equal(await repository.authenticate({
    sessionId: material.sessionId, credentialVerifier: verifier, now: 300, scope: 'app'
  }), null);
  assert.equal(await repository.authenticate({
    sessionId: material.sessionId, credentialVerifier: '0'.repeat(64), now: 300
  }), null);
  assert.equal(await repository.authenticate({
    sessionId: material.sessionId, credentialVerifier: verifier, now: consumed.expiresAt
  }), null);
  assert.equal(await repository.revoke(material.sessionId, 400), true);
  assert.equal(await repository.authenticate({
    sessionId: material.sessionId, credentialVerifier: verifier, now: 401
  }), null);
  assert.equal(JSON.stringify(db.raw.prepare('SELECT * FROM sync_account_qa_enrollments').get()).includes(code), false);
  assert.equal(JSON.stringify(db.raw.prepare('SELECT * FROM sync_account_qa_sessions').get()).includes(material.credential), false);
  db.close();
});

test('expired and cancelled QA Enrollment codes fail closed before session creation', async () => {
  const db = createSqliteD1();
  const repository = createD1AccountQaRepository(db);
  for (const scenario of [
    { id: 'qa-expired', code: createQaEnrollmentCode(), expiresAt: 200, cancelledAt: null, status: 'expired' },
    { id: 'qa-cancelled', code: createQaEnrollmentCode(), expiresAt: 10_000, cancelledAt: 150, status: 'cancelled' }
  ]) {
    const verifier = await qaEnrollmentCodeVerifier(scenario.code, enrollmentPepper);
    db.raw.prepare(`INSERT INTO sync_account_qa_enrollments
      (id,code_verifier,created_at,expires_at,consumed_at,cancelled_at,consumed_by_session_id)
      VALUES (?,?,100,?,NULL,?,NULL)`).run(
      scenario.id, verifier, scenario.expiresAt, scenario.cancelledAt
    );
    const material = createQaCredential();
    assert.equal((await repository.consumeEnrollment({
      sessionId: material.sessionId,
      codeVerifier: verifier,
      credentialVerifier: await qaCredentialVerifier(material.credential, credentialPepper),
      now: 200
    })).status, scenario.status);
  }
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_account_qa_sessions').get().count, 0);
  db.close();
});

test('revoking a Port QA session also revokes its app-bound children', async () => {
  const db = createSqliteD1();
  const repository = createD1AccountQaRepository(db);
  const accountId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const appDeviceId = crypto.randomUUID();
  db.raw.prepare(`INSERT INTO sync_accounts
    (id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,recovery_created_at,recovery_rotated_at)
    VALUES (?,'active',1,?,1,1,1,1,1)`).run(accountId, 'd'.repeat(64));
  db.raw.prepare(`INSERT INTO sync_users
    (id,state,recovery_version,recovery_verifier,created_at,updated_at,recovery_created_at,recovery_rotated_at)
    VALUES (?,'active',1,?,1,1,1,1)`).run(userId, 'e'.repeat(64));
  db.raw.prepare(`INSERT INTO sync_devices
    (id,user_id,app_id,credential_version,credential_verifier,label,last_cursor,created_at,last_seen_at,revoked_at,paired_at)
    VALUES (?,?,'pitch',1,?,'QA',0,1,1,NULL,1)`)
    .run(appDeviceId, userId, 'f'.repeat(64));
  db.raw.prepare(`INSERT INTO sync_account_qa_enrollments
    (id,code_verifier,created_at,expires_at,consumed_at,cancelled_at,consumed_by_session_id)
    VALUES ('qa-tree',?,1,999999,2,NULL,?)`).run('a'.repeat(64), '00000000-0000-4000-8000-000000000001');
  db.raw.prepare(`INSERT INTO sync_account_qa_sessions
    (id,credential_verifier,enrollment_id,scope,account_id,app_id,app_device_id,parent_session_id,
     created_at,expires_at,last_used_at,revoked_at,generation)
    VALUES (?,?, 'qa-tree','port',?,NULL,NULL,NULL,2,999999,2,NULL,1)`)
    .run('00000000-0000-4000-8000-000000000001', 'b'.repeat(64), accountId);
  db.raw.prepare(`INSERT INTO sync_account_qa_sessions
    (id,credential_verifier,enrollment_id,scope,account_id,app_id,app_device_id,parent_session_id,
     created_at,expires_at,last_used_at,revoked_at,generation)
    VALUES (?,?, 'qa-tree','app',?,'pitch',?,?,2,999999,2,NULL,1)`)
    .run('00000000-0000-4000-8000-000000000002', 'c'.repeat(64), accountId,
      appDeviceId, '00000000-0000-4000-8000-000000000001');
  assert.equal((await repository.authenticate({
    sessionId: '00000000-0000-4000-8000-000000000002',
    credentialVerifier: 'c'.repeat(64), now: 9,
    scope: 'app', accountId, appId: 'pitch', appDeviceId
  }))?.appId, 'pitch');
  assert.equal(await repository.authenticate({
    sessionId: '00000000-0000-4000-8000-000000000002',
    credentialVerifier: 'c'.repeat(64), now: 9,
    scope: 'app', accountId, appId: 'rhythm', appDeviceId
  }), null);
  assert.equal(await repository.authenticate({
    sessionId: '00000000-0000-4000-8000-000000000002',
    credentialVerifier: 'c'.repeat(64), now: 9,
    scope: 'app', accountId, appId: 'pitch', appDeviceId: crypto.randomUUID()
  }), null);
  assert.equal(await repository.revoke('00000000-0000-4000-8000-000000000001', 10), true);
  const states = db.raw.prepare(`SELECT id, revoked_at FROM sync_account_qa_sessions ORDER BY id`).all();
  assert.deepEqual(states.map((row) => Number(row.revoked_at)), [10, 10]);
  db.raw.prepare(`UPDATE sync_account_qa_sessions SET revoked_at = NULL
    WHERE id = '00000000-0000-4000-8000-000000000002'`).run();
  assert.equal(await repository.authenticate({
    sessionId: '00000000-0000-4000-8000-000000000002',
    credentialVerifier: 'c'.repeat(64), now: 11,
    scope: 'app', accountId, appId: 'pitch', appDeviceId
  }), null, 'a child cannot outlive its revoked Port issuer');
  db.close();
});

test('QA enrollment API requires runtime, limiter and Turnstile, then gates Account start', async () => {
  const db = createSqliteD1();
  enableAccount(db);
  const environment = env(db);
  const code = createQaEnrollmentCode();
  const codeVerifier = await qaEnrollmentCodeVerifier(code, enrollmentPepper);
  db.raw.prepare(`INSERT INTO sync_account_qa_enrollments
    (id,code_verifier,created_at,expires_at,consumed_at,cancelled_at,consumed_by_session_id)
    VALUES ('qa-api',?,1,?,NULL,NULL,NULL)`).run(codeVerifier, Date.now() + 60_000);
  const qa = createQaCredential();
  const enrollBody = { enrollmentCode: code, qaCredential: qa.credential, turnstileToken: 'token' };
  let response = await handleRequest(request('/v2/accounts/qa/enroll', enrollBody), environment, null, {
    verifyTurnstileToken: async () => ({ ok: false })
  });
  assert.equal(response.status, 403);
  response = await handleRequest(request('/v2/accounts/qa/enroll', enrollBody), {
    ...environment, ACCOUNT_QA_ENROLL_RATE_LIMITER: undefined
  }, null, { verifyTurnstileToken: async () => ({ ok: true }) });
  assert.equal(response.status, 503);
  response = await handleRequest(request('/v2/accounts/qa/enroll', enrollBody), environment, null, {
    verifyTurnstileToken: async (_token, _env, options) => ({
      ok: options.expectedAction === 'sound_cruise_account_qa_enroll'
    })
  });
  assert.equal(response.status, 201);
  const enrollment = await response.json();
  assert.equal(enrollment.scope, 'port');
  assert.equal(JSON.stringify(enrollment).includes(qa.credential), false);

  const account = createAccountCredential();
  const startBody = {
    operationId: crypto.randomUUID(), appIds: ['chord'],
    accountCredential: account.credential, recoveryCode: createAccountRecoveryCode(),
    turnstileToken: 'token', deviceLabel: 'QA Port'
  };
  response = await handleRequest(request('/v2/accounts/start', startBody), environment, null, {
    verifyTurnstileToken: async () => ({ ok: true })
  });
  assert.equal(response.status, 403);
  response = await handleRequest(request('/v2/accounts/start', startBody, {
    'X-Sound-Cruise-QA-Authorization': `Bearer ${qa.credential}`
  }), environment, null, { verifyTurnstileToken: async () => ({ ok: true }) });
  assert.equal(response.status, 201);
  const accountId = (await response.json()).accountId;
  assert.equal(db.raw.prepare('SELECT account_id FROM sync_account_qa_sessions WHERE id=?').get(qa.sessionId).account_id, accountId);

  const preflight = await handleRequest(new Request('https://sync.example/v2/accounts/summary', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,x-sound-cruise-qa-authorization'
    }
  }), environment);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(preflight.headers.get('Access-Control-Allow-Headers').includes('*'), false);
  const wrongOrigin = await handleRequest(new Request('https://sync.example/v2/accounts/qa/enroll', {
    method: 'POST', headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
    body: JSON.stringify(enrollBody)
  }), environment);
  assert.equal(wrongOrigin.status, 403);
  db.close();
});

test('QA-only Data Plane requires an app-scoped credential while public Legacy Chord remains unchanged', async () => {
  const runtimeOpen = async () => ({
    rolloutMode: 'open', admissionEnabled: true, dataWriteEnabled: true,
    dataReadEnabled: true, recoveryEnabled: true, cloudDeleteEnabled: true, generation: 9
  });
  const baseEnv = {
    SYNC_DB: { prepare() { throw new Error('not used'); } },
    ALLOWED_ORIGINS: origin,
    SYNC_ALLOWED_APP_IDS: 'chord',
    SYNC_QA_ALLOWED_APP_IDS: 'chord,pitch,rhythm,fretboard',
    SYNC_CREDENTIAL_PEPPER: 'm10-data-plane-pepper-at-least-32',
    SYNC_RATE_LIMITER: limiter()
  };
  let expectedApp = 'pitch';
  const dependencies = {
    readRuntimeControl: runtimeOpen,
    authenticateDevice: async (_db, _header, appId) => ({
      userId: 'qa-user', deviceId: 'qa-device', appId, userState: 'active'
    }),
    authenticateQaRequest: async (_db, header, _env, constraints) =>
      header === 'Bearer valid-qa' && constraints.scope === 'app' && constraints.appId === expectedApp
        ? { scope: 'app', appId: expectedApp, appDeviceId: 'qa-device' }
        : null,
    createRepository: () => ({
      async readSnapshot() { return {
        dataset: { state: 'ready', schema_version: 1, last_change_seq: 0 },
        recordCount: 0, manifestHash: 'a'.repeat(64), records: []
      }; }
    })
  };
  for (const appId of ['pitch', 'rhythm', 'fretboard']) {
    expectedApp = appId;
    let response = await handleRequest(request(`/v1/sync/snapshot?appId=${appId}`, undefined, {
      Authorization: 'Bearer app'
    }), baseEnv, null, dependencies);
    assert.equal(response.status, 403, `${appId} missing QA`);
    response = await handleRequest(request(`/v1/sync/snapshot?appId=${appId}`, undefined, {
      Authorization: 'Bearer app', 'X-Sound-Cruise-QA-Authorization': 'Bearer valid-qa'
    }), baseEnv, null, dependencies);
    assert.equal(response.status, 200, `${appId} valid QA`);
  }

  const response = await handleRequest(request('/v1/sync/snapshot?appId=chord', undefined, {
    Authorization: 'Bearer legacy'
  }), { ...baseEnv, SYNC_QA_ALLOWED_APP_IDS: 'pitch,rhythm,fretboard' }, null, dependencies);
  assert.equal(response.status, 200);
});

test('QA operator helpers default to verifier-only dry-runs and revoke Port children', () => {
  const create = spawnSync(process.execPath, ['scripts/create-account-qa-enrollment.mjs'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: { ...process.env, SYNC_ACCOUNT_QA_ENROLLMENT_PEPPER: enrollmentPepper }
  });
  assert.equal(create.status, 0, create.stderr);
  const createOutput = JSON.parse(create.stdout);
  assert.equal(createOutput.dryRun, true);
  assert.match(createOutput.verifierOnlySql, /INSERT INTO sync_account_qa_enrollments/);
  assert.doesNotMatch(create.stdout, /SQA1(?:-[A-Z2-9]{4}){5}/);
  assert.equal(create.stdout.includes(enrollmentPepper), false);

  const sessionId = '00000000-0000-4000-8000-000000000001';
  const revoke = spawnSync(process.execPath, [
    'scripts/revoke-account-qa-session.mjs', `--session-id=${sessionId}`
  ], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(revoke.status, 0, revoke.stderr);
  const revokeOutput = JSON.parse(revoke.stdout);
  assert.equal(revokeOutput.dryRun, true);
  assert.match(revokeOutput.sql, /parent_session_id/);
});
