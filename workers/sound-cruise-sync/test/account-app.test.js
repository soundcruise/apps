import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/app.js';
import {
  createAccountCredential,
  createAccountHandoff,
  createAccountRecoveryCode
} from '../src/account-crypto.js';
import { createIdentityMaterial } from '../src/crypto.js';
import { createQaCredential, qaCredentialVerifier } from '../src/account-qa-crypto.js';
import { createSqliteD1 } from './sqlite-d1.js';

const origin = 'https://soundcruise.jp';
const accountCredentialPepper = 'm3-api-account-credential-pepper-32-chars';
const accountRecoveryPepper = 'm3-api-account-recovery-pepper-32-chars';
const accountHandoffPepper = 'm3-api-account-handoff-pepper-32-chars';
const appPepper = 'm3-api-app-credential-pepper-at-least-32';
const qaPepper = 'm10-api-qa-credential-pepper-at-least-32';
const qa = createQaCredential();
const qaVerifier = await qaCredentialVerifier(qa.credential, qaPepper);

function limiter(success = true) {
  return { async limit() { return { success }; } };
}

function enableAccountControl(db) {
  db.raw.prepare(`
    UPDATE sync_account_runtime_control
    SET rollout_mode = 'open', account_admission_enabled = 1,
        membership_admission_enabled = 1, account_read_enabled = 1,
        generation = generation + 1, updated_at = 1
    WHERE singleton_id = 1
  `).run();
}

function environment(db) {
  db.raw.prepare(`
    INSERT OR IGNORE INTO sync_account_qa_enrollments
      (id, code_verifier, created_at, expires_at, consumed_at, cancelled_at, consumed_by_session_id)
    VALUES ('qa-enrollment', ?, 1, ?, 1, NULL, ?)
  `).run('a'.repeat(64), Number.MAX_SAFE_INTEGER, qa.sessionId);
  db.raw.prepare(`
    INSERT OR IGNORE INTO sync_account_qa_sessions
      (id, credential_verifier, enrollment_id, scope, account_id, app_id, app_device_id,
       parent_session_id, created_at, expires_at, last_used_at, revoked_at, generation)
    VALUES (?, ?, 'qa-enrollment', 'port', NULL, NULL, NULL, NULL, 1, ?, 1, NULL, 1)
  `).run(qa.sessionId, qaVerifier, Number.MAX_SAFE_INTEGER);
  return {
    SYNC_DB: db,
    ACCOUNT_ALLOWED_ORIGINS: origin,
    SYNC_ACCOUNT_CREDENTIAL_PEPPER: accountCredentialPepper,
    SYNC_ACCOUNT_RECOVERY_PEPPER: accountRecoveryPepper,
    SYNC_ACCOUNT_HANDOFF_PEPPER: accountHandoffPepper,
    SYNC_CREDENTIAL_PEPPER: appPepper,
    SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER: qaPepper,
    ACCOUNT_START_RATE_LIMITER: limiter(),
    ACCOUNT_HANDOFF_ISSUE_RATE_LIMITER: limiter(),
    ACCOUNT_HANDOFF_CONSUME_RATE_LIMITER: limiter(),
    TURNSTILE_PRODUCTION_SECRET_KEY: 'test-only-turnstile-secret'
  };
}

function jsonRequest(path, body, options = {}) {
  const headers = new Headers({ Origin: options.origin || origin });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.credential) headers.set('Authorization', `Bearer ${options.credential}`);
  headers.set('X-Sound-Cruise-QA-Authorization', `Bearer ${qa.credential}`);
  return new Request(`https://sync.example${path}`, {
    method: options.method || (body === undefined ? 'GET' : 'POST'),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function startCandidate(appIds = ['chord']) {
  const account = createAccountCredential();
  return {
    account,
    body: {
      operationId: crypto.randomUUID(),
      appIds,
      accountCredential: account.credential,
      recoveryCode: createAccountRecoveryCode(),
      turnstileToken: 'opaque-test-token',
      deviceLabel: 'QA Browser'
    }
  };
}

const turnstileOk = { verifyTurnstileToken: async () => ({ ok: true }) };

async function startAccount(db, env, apps = ['chord']) {
  const candidate = startCandidate(apps);
  const response = await handleRequest(
    jsonRequest('/v2/accounts/start', candidate.body),
    env,
    null,
    turnstileOk
  );
  return { candidate, response, payload: await response.json() };
}

test('Account create is gated, Turnstile/rate-limited, verifier-only and response-loss safe', async () => {
  const db = createSqliteD1();
  const env = environment(db);
  const candidate = startCandidate(['rhythm', 'chord']);

  let response = await handleRequest(
    jsonRequest('/v2/accounts/start', candidate.body), env, null, turnstileOk
  );
  assert.equal(response.status, 423);
  assert.equal((await response.json()).code, 'account_admission_paused');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_accounts').get().count, 0);

  enableAccountControl(db);
  response = await handleRequest(
    jsonRequest('/v2/accounts/start', candidate.body), env, null,
    { verifyTurnstileToken: async () => ({ ok: false }) }
  );
  assert.equal(response.status, 403);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_accounts').get().count, 0);

  let verifiedAction = null;
  response = await handleRequest(
    jsonRequest('/v2/accounts/start', candidate.body), env, null, {
      verifyTurnstileToken: async (_token, _env, options) => {
        verifiedAction = options.expectedAction;
        return { ok: true };
      }
    }
  );
  assert.equal(response.status, 201);
  assert.equal(verifiedAction, 'sound_cruise_account_start');
  const created = await response.json();
  assert.equal(created.ok, true);
  assert.deepEqual(created.memberships.map((membership) => membership.appId), ['chord', 'rhythm']);
  assert.equal(JSON.stringify(created).includes(candidate.body.recoveryCode), false);
  assert.equal(JSON.stringify(created).includes(candidate.account.credential), false);
  const stored = db.raw.prepare(`
    SELECT a.recovery_verifier, d.credential_verifier
    FROM sync_accounts a JOIN sync_account_devices d ON d.account_id = a.id
  `).get();
  assert.match(stored.recovery_verifier, /^[a-f0-9]{64}$/);
  assert.match(stored.credential_verifier, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(stored).includes(candidate.body.recoveryCode), false);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 0);

  env.ACCOUNT_START_RATE_LIMITER = limiter(false);
  const retry = await handleRequest(
    jsonRequest('/v2/accounts/start', candidate.body), env, null,
    { verifyTurnstileToken: async () => { throw new Error('must not reverify committed operation'); } }
  );
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).accountId, created.accountId);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_accounts').get().count, 1);
  db.close();
});

test('Account routes use exact independent CORS and fail closed on missing limiter', async () => {
  const db = createSqliteD1();
  enableAccountControl(db);
  const env = environment(db);
  const candidate = startCandidate();
  let response = await handleRequest(
    jsonRequest('/v2/accounts/start', candidate.body, { origin: 'https://attacker.example' }),
    env, null, turnstileOk
  );
  assert.equal(response.status, 403);
  const accountOrigin = env.ACCOUNT_ALLOWED_ORIGINS;
  delete env.ACCOUNT_ALLOWED_ORIGINS;
  env.ALLOWED_ORIGINS = origin;
  response = await handleRequest(
    jsonRequest('/v2/accounts/start', candidate.body), env, null, turnstileOk
  );
  assert.equal(response.status, 403, 'legacy CORS allowlist does not enable the Account API');
  env.ACCOUNT_ALLOWED_ORIGINS = accountOrigin;
  response = await handleRequest(new Request('https://sync.example/v2/accounts/start', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-d1-bookmark'
    }
  }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  response = await handleRequest(new Request('https://sync.example/v2/accounts/start', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization'
    }
  }), env);
  assert.equal(response.status, 403);
  delete env.ACCOUNT_START_RATE_LIMITER;
  response = await handleRequest(
    jsonRequest('/v2/accounts/start', candidate.body), env, null, turnstileOk
  );
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'account_rate_limiter_unavailable');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_accounts').get().count, 0);
  db.close();
});

test('authenticated summary and membership prepare cannot select another Account or regress active state', async () => {
  const db = createSqliteD1();
  enableAccountControl(db);
  const env = environment(db);
  const started = await startAccount(db, env, ['chord']);
  assert.equal(started.response.status, 201);

  let response = await handleRequest(
    jsonRequest('/v2/accounts/summary?accountId=another', undefined, {
      credential: started.candidate.account.credential
    }), env
  );
  assert.equal(response.status, 400);
  response = await handleRequest(
    jsonRequest('/v2/accounts/summary', undefined, { credential: 'not-a-credential' }), env
  );
  assert.equal(response.status, 401);
  response = await handleRequest(
    jsonRequest('/v2/accounts/summary', undefined, {
      credential: started.candidate.account.credential
    }), env
  );
  assert.equal(response.status, 200);
  const summary = await response.json();
  assert.equal(summary.account.id, started.payload.accountId);
  assert.equal(summary.memberships[0].state, 'pending');

  const operationId = crypto.randomUUID();
  response = await handleRequest(jsonRequest('/v2/accounts/memberships', {
    operationId,
    appId: 'pitch'
  }, { credential: started.candidate.account.credential }), env);
  assert.equal(response.status, 201);
  const prepared = await response.json();
  assert.equal(prepared.state, 'pending');
  response = await handleRequest(jsonRequest('/v2/accounts/memberships', {
    operationId,
    appId: 'pitch'
  }, { credential: started.candidate.account.credential }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).membershipId, prepared.membershipId);
  assert.equal(db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_account_memberships
    WHERE account_id = ? AND app_id = 'pitch'
  `).get(started.payload.accountId).count, 1);
  db.close();
});

test('secure handoff issue/consume activates one app reservation and exact retry returns the same device', async () => {
  const db = createSqliteD1();
  enableAccountControl(db);
  const env = environment(db);
  const started = await startAccount(db, env, ['chord']);
  const handoff = createAccountHandoff();
  const issueBody = {
    operationId: crypto.randomUUID(),
    appId: 'chord',
    handoffToken: handoff.handoffToken
  };
  let response = await handleRequest(jsonRequest('/v2/accounts/handoffs', issueBody, {
    credential: started.candidate.account.credential
  }), env);
  assert.equal(response.status, 201);
  const issued = await response.json();
  assert.equal(issued.handoffId, handoff.handoffId);
  assert.equal(JSON.stringify(issued).includes(handoff.handoffToken), false);
  env.ACCOUNT_HANDOFF_ISSUE_RATE_LIMITER = limiter(false);
  response = await handleRequest(jsonRequest('/v2/accounts/handoffs', issueBody, {
    credential: started.candidate.account.credential
  }), env);
  assert.equal(response.status, 200, 'exact issue retry resolves before the limiter');
  assert.equal((await response.json()).handoffId, handoff.handoffId);
  env.ACCOUNT_HANDOFF_ISSUE_RATE_LIMITER = limiter();

  const targetAccount = createAccountCredential();
  const targetApp = await createIdentityMaterial(appPepper);
  const targetQa = createQaCredential();
  const consumeBody = {
    operationId: crypto.randomUUID(),
    appId: 'chord',
    handoffToken: handoff.handoffToken,
    accountCredential: targetAccount.credential,
    appDeviceCredential: targetApp.credential,
    qaCredential: targetQa.credential,
    deviceLabel: 'Chord container',
    consumeMode: 'new_app'
  };
  response = await handleRequest(jsonRequest('/v2/accounts/handoffs/consume', consumeBody), env);
  assert.equal(response.status, 201);
  const consumed = await response.json();
  assert.equal(consumed.datasetState, 'not_created');
  assert.equal(consumed.appDeviceId, targetApp.deviceId);
  assert.equal(consumed.accountDeviceId, targetAccount.deviceId);

  env.ACCOUNT_HANDOFF_CONSUME_RATE_LIMITER = limiter(false);
  response = await handleRequest(jsonRequest('/v2/accounts/handoffs/consume', consumeBody), env);
  assert.equal(response.status, 200);
  const retried = await response.json();
  assert.equal(retried.syncUserId, consumed.syncUserId);
  assert.equal(retried.alreadyActivated, true);
  env.ACCOUNT_HANDOFF_CONSUME_RATE_LIMITER = limiter();
  response = await handleRequest(jsonRequest('/v2/accounts/handoffs/consume', {
    ...consumeBody,
    operationId: crypto.randomUUID()
  }), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'handoff_consumed');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 1);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_datasets').get().count, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_account_devices').get().count, 2);
  response = await handleRequest(jsonRequest('/v2/accounts/devices', undefined, {
    credential: started.candidate.account.credential
  }), env);
  assert.equal(response.status, 200);
  const devices = await response.json();
  assert.equal(devices.devices.length, 2);
  assert.equal(devices.devices.filter((device) => device.isCurrent).length, 1);
  assert.equal(JSON.stringify(devices).includes('credential_verifier'), false);
  response = await handleRequest(jsonRequest('/v2/accounts/memberships', {
    operationId: crypto.randomUUID(),
    appId: 'chord'
  }, { credential: started.candidate.account.credential }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state, 'active', 'prepare never regresses an active membership');
  assert.equal(db.raw.prepare(`
    SELECT state FROM sync_account_memberships WHERE account_id = ? AND app_id = 'chord'
  `).get(started.payload.accountId).state, 'active');
  db.close();
});

test('authenticated issuer can cancel a handoff and cancelled material cannot activate an app', async () => {
  const db = createSqliteD1();
  enableAccountControl(db);
  const env = environment(db);
  const started = await startAccount(db, env, ['pitch']);
  const handoff = createAccountHandoff();
  let response = await handleRequest(jsonRequest('/v2/accounts/handoffs', {
    operationId: crypto.randomUUID(),
    appId: 'pitch',
    handoffToken: handoff.handoffToken
  }, { credential: started.candidate.account.credential }), env);
  assert.equal(response.status, 201);
  response = await handleRequest(jsonRequest('/v2/accounts/handoffs/cancel', {
    handoffId: handoff.handoffId
  }, { credential: started.candidate.account.credential }), env);
  assert.equal(response.status, 200);
  const targetAccount = createAccountCredential();
  const targetApp = await createIdentityMaterial(appPepper);
  const targetQa = createQaCredential();
  response = await handleRequest(jsonRequest('/v2/accounts/handoffs/consume', {
    operationId: crypto.randomUUID(),
    appId: 'pitch',
    handoffToken: handoff.handoffToken,
    accountCredential: targetAccount.credential,
    appDeviceCredential: targetApp.credential,
    qaCredential: targetQa.credential,
    deviceLabel: null,
    consumeMode: 'new_app'
  }), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'handoff_cancelled');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 0);
  db.close();
});
