import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/app.js';
import {
  createAccountCredential,
  createAccountDeleteIntent,
  createAccountHandoff,
  createAccountRecoveryClaim,
  createAppJoinCode,
  createAccountRecoveryCode,
  accountCredentialVerifier,
  accountRecoveryCodeVerifier
} from '../src/account-crypto.js';
import { createIdentityMaterial } from '../src/crypto.js';
import { createQaCredential, qaCredentialVerifier } from '../src/account-qa-crypto.js';
import { createSqliteD1, seedIdentity } from './sqlite-d1.js';

const origin = 'https://soundcruise.jp';
const accountCredentialPepper = 'm3-api-account-credential-pepper-32-chars';
const accountRecoveryPepper = 'm3-api-account-recovery-pepper-32-chars';
const accountHandoffPepper = 'm3-api-account-handoff-pepper-32-chars';
const accountAppJoinPepper = 'm95-api-account-app-join-pepper-32-chars';
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

function enableLifecycleControl(db) {
  enableAccountControl(db);
  db.raw.prepare(`
    UPDATE sync_account_runtime_control
    SET account_recovery_enabled = 1, account_delete_enabled = 1,
        port_orchestration_enabled = 1, generation = generation + 1, updated_at = 2
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
    SYNC_ACCOUNT_APP_JOIN_PEPPER: accountAppJoinPepper,
    SYNC_CREDENTIAL_PEPPER: appPepper,
    SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER: qaPepper,
    ACCOUNT_START_RATE_LIMITER: limiter(),
    ACCOUNT_HANDOFF_ISSUE_RATE_LIMITER: limiter(),
    ACCOUNT_HANDOFF_CONSUME_RATE_LIMITER: limiter(),
    ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER: limiter(),
    ACCOUNT_APP_JOIN_CONSUME_RATE_LIMITER: limiter(),
    ACCOUNT_RECOVERY_RATE_LIMITER: limiter(),
    TURNSTILE_PRODUCTION_SECRET_KEY: 'test-only-turnstile-secret'
  };
}

function jsonRequest(path, body, options = {}) {
  const headers = new Headers({ Origin: options.origin || origin });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.credential) headers.set('Authorization', `Bearer ${options.credential}`);
  if (options.appCredential) headers.set('X-Sound-Cruise-App-Authorization', `Bearer ${options.appCredential}`);
  if (options.noQa !== true) {
    headers.set('X-Sound-Cruise-QA-Authorization', `Bearer ${(options.qaCredential || qa.credential)}`);
  }
  return new Request(`https://sync.example${path}`, {
    method: options.method || (body === undefined ? 'GET' : 'POST'),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

test('an app credential can detach only its current environment and safely replay response loss', async () => {
  const db = createSqliteD1();
  const env = environment(db);
  enableLifecycleControl(db);
  const started = await startAccount(db, env, ['pitch']);
  assert.equal(started.response.status, 201);
  const issuer = started.candidate.account.credential;

  async function joinPitchEnvironment(label) {
    const invitationId = crypto.randomUUID();
    const joinCode = createAppJoinCode();
    let response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations', {
      operationId: crypto.randomUUID(), invitationId, appId: 'pitch', joinCode
    }, { credential: issuer }), env);
    assert.equal(response.status, 201);
    const account = createAccountCredential();
    const app = await createIdentityMaterial(appPepper);
    const appQa = createQaCredential();
    response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations/consume', {
      operationId: crypto.randomUUID(), appId: 'pitch', joinCode,
      accountCredential: account.credential, appDeviceCredential: app.credential,
      qaCredential: appQa.credential, deviceLabel: label, consumeMode: 'new_app'
    }), env);
    assert.equal(response.status, 201);
    db.raw.prepare(`
      INSERT OR IGNORE INTO sync_datasets (
        user_id, app_id, state, schema_version, record_count, manifest_hash,
        min_change_seq, initialized_at, updated_at, last_change_seq
      ) SELECT sync_user_id, 'pitch', 'ready', 1, 0, NULL, 0, 1, 1, 0
        FROM sync_account_memberships WHERE account_id = ? AND app_id = 'pitch'
    `).run(started.payload.accountId);
    db.raw.prepare(`
      UPDATE sync_datasets SET state = 'ready', initialized_at = COALESCE(initialized_at, updated_at)
      WHERE user_id = (SELECT sync_user_id FROM sync_account_memberships
        WHERE account_id = ? AND app_id = 'pitch') AND app_id = 'pitch'
    `).run(started.payload.accountId);
    return { app, appQa };
  }

  const current = await joinPitchEnvironment('Pitch current');
  const other = await joinPitchEnvironment('Pitch other');
  const membership = db.raw.prepare(`
    SELECT id, sync_user_id, state FROM sync_account_memberships
    WHERE account_id = ? AND app_id = 'pitch'
  `).get(started.payload.accountId);
  const operationId = crypto.randomUUID();
  let response = await handleRequest(jsonRequest('/v2/accounts/apps/current/detach', { operationId }, {
    appCredential: current.app.credential, qaCredential: current.appQa.credential
  }), env);
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const result = await response.json();
  assert.equal(result.scope, 'current_app_environment');
  assert.equal(result.revokedAppDeviceCount, 1);
  assert.equal(result.revokedAccountDeviceCount, 1);
  assert.equal(db.raw.prepare('SELECT state FROM sync_account_memberships WHERE id = ?').get(membership.id).state, 'active');
  assert.equal(db.raw.prepare('SELECT state FROM sync_datasets WHERE user_id = ? AND app_id = ?')
    .get(membership.sync_user_id, 'pitch').state, 'ready');
  assert.notEqual(db.raw.prepare('SELECT revoked_at FROM sync_devices WHERE id = ?').get(current.app.deviceId).revoked_at, null);
  assert.equal(db.raw.prepare('SELECT revoked_at FROM sync_devices WHERE id = ?').get(other.app.deviceId).revoked_at, null,
    'another Pitch environment stays active');
  assert.equal(db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_membership_device_links l
    JOIN sync_devices d ON d.id = l.app_device_id
    WHERE l.membership_id = ? AND d.revoked_at IS NULL
  `).get(membership.id).count, 1);
  response = await handleRequest(jsonRequest('/v2/accounts/apps/current/detach', { operationId }, {
    appCredential: current.app.credential, qaCredential: current.appQa.credential
  }), env);
  assert.equal(response.status, 200, 'only the exact operation may replay after credential revocation');
  assert.equal((await response.json()).operation, 'existing');
  db.close();
});

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

test('authenticated Port device provisioning activates the hidden membership once and links the current environment', async () => {
  const db = createSqliteD1();
  const env = environment(db);
  enableAccountControl(db);
  const started = await startAccount(db, env, ['pitch']);
  assert.equal(started.response.status, 201);
  assert.deepEqual(started.payload.memberships.map(({ appId }) => appId), ['pitch'], 'Port remains hidden publicly');
  const hidden = db.raw.prepare(`
    SELECT id, state, sync_user_id FROM sync_account_memberships
    WHERE account_id = ? AND app_id = 'port'
  `).get(started.payload.accountId);
  assert.equal(hidden.state, 'pending');

  const app = await createIdentityMaterial(appPepper);
  const body = {
    operationId: crypto.randomUUID(), appDeviceCredential: app.credential,
    deviceLabel: 'Cruise Port QA'
  };
  let response = await handleRequest(jsonRequest('/v2/accounts/port-device', body, {
    credential: started.candidate.account.credential
  }), env);
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const provisioned = await response.json();
  assert.equal(provisioned.appId, 'port');
  assert.equal(provisioned.appDeviceId, app.deviceId);
  assert.equal(provisioned.membershipState, 'active');
  assert.equal(JSON.stringify(provisioned).includes(app.credential), false);
  assert.equal(db.raw.prepare(`
    SELECT state FROM sync_account_memberships WHERE id = ?
  `).get(hidden.id).state, 'active');
  assert.equal(db.raw.prepare(`
    SELECT COUNT(*) count FROM sync_membership_device_links
    WHERE membership_id = ? AND account_device_id = ? AND app_device_id = ?
  `).get(hidden.id, started.payload.accountDeviceId, app.deviceId).count, 1);

  response = await handleRequest(jsonRequest('/v2/accounts/port-device', body, {
    credential: started.candidate.account.credential
  }), env);
  assert.equal(response.status, 200, 'response-loss retry is idempotent');
  assert.equal((await response.json()).operation, 'existing');
  assert.equal(db.raw.prepare(`SELECT COUNT(*) count FROM sync_devices WHERE app_id = 'port'`).get().count, 1);

  const second = await createIdentityMaterial(appPepper);
  response = await handleRequest(jsonRequest('/v2/accounts/port-device', {
    ...body, appDeviceCredential: second.credential
  }, { credential: started.candidate.account.credential }), env);
  assert.equal(response.status, 409, 'one operation ID cannot provision another credential');
  assert.equal(db.raw.prepare(`SELECT COUNT(*) count FROM sync_devices WHERE app_id = 'port'`).get().count, 1);

  const secondPort = createAccountCredential();
  db.raw.prepare(`INSERT INTO sync_account_devices (
    id, account_id, credential_version, credential_verifier,
    label, created_at, last_seen_at, revoked_at
  ) VALUES (?, ?, 1, ?, 'Cruise Port B', 2, 2, NULL)`).run(
    secondPort.deviceId,
    started.payload.accountId,
    await accountCredentialVerifier(secondPort.credential, accountCredentialPepper)
  );
  response = await handleRequest(jsonRequest('/v2/accounts/port-device', {
    operationId: crypto.randomUUID(), appDeviceCredential: second.credential,
    deviceLabel: 'Cruise Port B'
  }, { credential: secondPort.credential }), env);
  assert.equal(response.status, 201, 'a second Port can join before the shared dataset is bootstrapped');
  const secondProvisioned = await response.json();
  assert.equal(secondProvisioned.membershipId, provisioned.membershipId);
  assert.equal(secondProvisioned.syncUserId, provisioned.syncUserId);
  assert.equal(db.raw.prepare(`SELECT COUNT(*) count FROM sync_devices WHERE app_id = 'port' AND revoked_at IS NULL`).get().count, 2);
  db.close();
});

test('Account Recovery API prepares a secret-free summary, rotates once and resolves response loss', async () => {
  const db = createSqliteD1();
  enableLifecycleControl(db);
  const env = environment(db);
  const started = await startAccount(db, env, ['chord', 'pitch']);
  assert.equal(started.response.status, 201);
  const startedAccountId = started.payload.accountId;
  assert.equal(db.raw.prepare('SELECT account_id FROM sync_account_qa_sessions WHERE id = ?')
    .get(qa.sessionId).account_id, startedAccountId);
  // Model a fresh QA browser session that authenticated Recovery but has not
  // yet been associated with the recovered Account.
  db.raw.prepare('UPDATE sync_account_qa_sessions SET account_id = NULL WHERE id = ?')
    .run(qa.sessionId);
  const nextAccount = createAccountCredential();
  const claim = createAccountRecoveryClaim();
  const nextRecoveryCode = createAccountRecoveryCode();
  const prepareBody = {
    operationId: crypto.randomUUID(), recoveryCode: started.candidate.body.recoveryCode,
    claimToken: claim.claimToken, nextRecoveryCode,
    accountCredential: nextAccount.credential, turnstileToken: 'verified',
    deviceLabel: 'Recovered Port'
  };
  let response = await handleRequest(
    jsonRequest('/v2/accounts/recovery/prepare', prepareBody), env, null, turnstileOk
  );
  assert.equal(response.status, 201);
  const prepared = await response.json();
  assert.equal(prepared.summary.recoveryVersion, 1);
  assert.equal(prepared.summary.activeDeviceCount, 1);
  assert.deepEqual(prepared.summary.memberships.map(({ appId }) => appId), ['chord', 'pitch']);
  assert.equal(JSON.stringify(prepared).includes(prepareBody.recoveryCode), false);
  assert.equal(JSON.stringify(prepared).includes(nextRecoveryCode), false);

  const commitBody = {
    operationId: crypto.randomUUID(), claimToken: claim.claimToken,
    accountCredential: nextAccount.credential
  };
  response = await handleRequest(jsonRequest('/v2/accounts/recovery/commit', commitBody), env);
  assert.equal(response.status, 201);
  const recovered = await response.json();
  assert.equal(recovered.recoveryVersion, 2);
  assert.equal(db.raw.prepare('SELECT account_id FROM sync_account_qa_sessions WHERE id = ?')
    .get(qa.sessionId).account_id, startedAccountId);
  response = await handleRequest(jsonRequest('/v2/accounts/recovery/commit', commitBody), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).operation, 'existing');
  response = await handleRequest(jsonRequest('/v2/accounts/summary', undefined, {
    credential: started.candidate.account.credential
  }), env);
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, 'account_device_revoked');
  response = await handleRequest(jsonRequest('/v2/accounts/summary', undefined, {
    credential: nextAccount.credential
  }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).account.recoveryVersion, 2);
  db.close();
});

test('authenticated Recovery rotation requires active Account authority and preserves existing control plane', async () => {
  const db = createSqliteD1();
  enableLifecycleControl(db);
  const env = environment(db);
  const started = await startAccount(db, env, ['chord', 'pitch']);
  const credential = started.candidate.account.credential;
  const accountId = started.payload.accountId;
  const accountDeviceId = started.payload.accountDeviceId;
  const claim = createAccountRecoveryClaim();
  const nextRecoveryCode = createAccountRecoveryCode();
  const prepareBody = {
    operationId: crypto.randomUUID(),
    claimToken: claim.claimToken,
    nextRecoveryCode,
    turnstileToken: 'verified'
  };

  let response = await handleRequest(
    jsonRequest('/v2/accounts/recovery-rotation/prepare', prepareBody), env, null, turnstileOk
  );
  assert.equal(response.status, 403, 'missing Account credential is forbidden');
  const appOnly = await createIdentityMaterial(appPepper);
  response = await handleRequest(
    jsonRequest('/v2/accounts/recovery-rotation/prepare', prepareBody, {
      credential: appOnly.credential
    }), env, null, turnstileOk
  );
  assert.equal(response.status, 403, 'an app credential cannot rotate Account Recovery');

  response = await handleRequest(
    jsonRequest('/v2/accounts/recovery-rotation/prepare', prepareBody, {
      credential, origin: 'https://attacker.example'
    }), env, null, turnstileOk
  );
  assert.equal(response.status, 403, 'rotation requires the exact trusted Origin');
  response = await handleRequest(
    jsonRequest('/v2/accounts/recovery-rotation/prepare', prepareBody, { credential }),
    { ...env, ACCOUNT_RECOVERY_RATE_LIMITER: limiter(false) }, null, turnstileOk
  );
  assert.equal(response.status, 429, 'rotation uses the Account Recovery rate limiter');

  response = await handleRequest(
    jsonRequest('/v2/accounts/recovery-rotation/prepare', prepareBody, { credential }),
    env, null, {
      verifyTurnstileToken: async (_token, _env, options) => {
        assert.equal(options.expectedAction, 'sound_cruise_recovery_rotation');
        return { ok: true };
      }
    }
  );
  assert.equal(response.status, 201);
  const prepared = await response.json();
  assert.equal(prepared.recoveryVersion, 1);
  assert.equal(JSON.stringify(prepared).includes(nextRecoveryCode), false);
  const oldVerifier = await accountRecoveryCodeVerifier(
    started.candidate.body.recoveryCode, accountRecoveryPepper
  );
  assert.equal(db.raw.prepare('SELECT recovery_verifier FROM sync_accounts WHERE id = ?')
    .get(accountId).recovery_verifier, oldVerifier, 'prepare keeps the old Code valid');

  const commitBody = { operationId: crypto.randomUUID(), claimToken: claim.claimToken };
  response = await handleRequest(
    jsonRequest('/v2/accounts/recovery-rotation/commit', commitBody, { credential }), env
  );
  assert.equal(response.status, 201);
  assert.equal((await response.json()).recoveryVersion, 2);
  response = await handleRequest(
    jsonRequest('/v2/accounts/recovery-rotation/commit', commitBody, { credential }), env
  );
  assert.equal(response.status, 200, 'response-loss retry is idempotent');
  assert.equal((await response.json()).operation, 'existing');

  const account = db.raw.prepare(`
    SELECT recovery_version, recovery_verifier, generation, state
    FROM sync_accounts WHERE id = ?
  `).get(accountId);
  assert.equal(account.recovery_version, 2);
  assert.equal(account.recovery_verifier,
    await accountRecoveryCodeVerifier(nextRecoveryCode, accountRecoveryPepper));
  assert.equal(account.generation, 1);
  assert.equal(account.state, 'active');
  assert.equal(db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_account_devices
    WHERE account_id = ? AND revoked_at IS NULL
  `).get(accountId).count, 1);
  assert.equal(db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_account_memberships
    WHERE account_id = ? AND state = 'pending'
  `).get(accountId).count, 3, 'the hidden Port membership remains pending');

  const recoveryCandidate = createAccountCredential();
  const oldClaim = createAccountRecoveryClaim();
  const recoveryPrepare = (recoveryCode, nextCode, nextAccount, recoveryClaim) => ({
    operationId: crypto.randomUUID(),
    recoveryCode,
    claimToken: recoveryClaim.claimToken,
    nextRecoveryCode: nextCode,
    accountCredential: nextAccount.credential,
    turnstileToken: 'verified',
    deviceLabel: 'Recovered Port'
  });
  response = await handleRequest(jsonRequest('/v2/accounts/recovery/prepare',
    recoveryPrepare(started.candidate.body.recoveryCode, createAccountRecoveryCode(),
      recoveryCandidate, oldClaim)), env, null, turnstileOk);
  assert.equal(response.status, 400, 'the old Code is invalid after rotation');
  const newRecoveryAccount = createAccountCredential();
  const newRecoveryClaim = createAccountRecoveryClaim();
  response = await handleRequest(jsonRequest('/v2/accounts/recovery/prepare',
    recoveryPrepare(nextRecoveryCode, createAccountRecoveryCode(),
      newRecoveryAccount, newRecoveryClaim)), env, null, turnstileOk);
  assert.equal(response.status, 201, 'the new Code remains valid for Account Recovery');

  const otherCredential = createAccountCredential();
  const otherAccountId = crypto.randomUUID();
  const otherVerifier = await accountCredentialVerifier(
    otherCredential.credential, accountCredentialPepper
  );
  db.raw.prepare(`
    INSERT INTO sync_accounts (
      id, state, recovery_version, recovery_verifier, generation,
      created_at, updated_at, recovery_created_at, recovery_rotated_at,
      admission_provenance
    ) VALUES (?, 'active', 1, ?, 1, 1, 1, 1, 1, 'qa')
  `).run(otherAccountId, 'f'.repeat(64));
  db.raw.prepare(`
    INSERT INTO sync_account_devices (
      id, account_id, credential_version, credential_verifier,
      label, created_at, last_seen_at, revoked_at
    ) VALUES (?, ?, 1, ?, 'Other', 1, 1, NULL)
  `).run(otherCredential.deviceId, otherAccountId, otherVerifier);
  response = await handleRequest(
    jsonRequest('/v2/accounts/recovery-rotation/commit', commitBody, {
      credential: otherCredential.credential
    }), env
  );
  assert.equal(response.status, 403, 'another Account cannot use the rotation claim');

  const deletingClaim = createAccountRecoveryClaim();
  db.raw.prepare("UPDATE sync_accounts SET state = 'deleting' WHERE id = ?").run(accountId);
  response = await handleRequest(jsonRequest('/v2/accounts/recovery-rotation/prepare', {
    operationId: crypto.randomUUID(), claimToken: deletingClaim.claimToken,
    nextRecoveryCode: createAccountRecoveryCode(), turnstileToken: 'verified'
  }, { credential }), env, null, turnstileOk);
  assert.equal(response.status, 410, 'a deleting Account returns definitive terminal state');
  assert.equal((await response.json()).code, 'account_deleting');
  db.raw.prepare("UPDATE sync_accounts SET state = 'active' WHERE id = ?").run(accountId);

  const revokedClaim = createAccountRecoveryClaim();
  response = await handleRequest(jsonRequest('/v2/accounts/recovery-rotation/prepare', {
    operationId: crypto.randomUUID(), claimToken: revokedClaim.claimToken,
    nextRecoveryCode: createAccountRecoveryCode(), turnstileToken: 'verified'
  }, { credential }), env, null, turnstileOk);
  assert.equal(response.status, 201);
  db.raw.prepare('UPDATE sync_account_devices SET revoked_at = ? WHERE id = ?')
    .run(Date.now(), accountDeviceId);
  response = await handleRequest(jsonRequest('/v2/accounts/recovery-rotation/commit', {
    operationId: crypto.randomUUID(), claimToken: revokedClaim.claimToken
  }, { credential }), env);
  assert.equal(response.status, 410, 'a revoked Account Device returns definitive terminal state');
  assert.equal((await response.json()).code, 'account_device_revoked');
  db.close();
});

test('Account delete API requires a scoped one-time intent and retry survives credential revocation', async () => {
  const db = createSqliteD1();
  enableLifecycleControl(db);
  const env = environment(db);
  const started = await startAccount(db, env, ['chord', 'pitch', 'fretboard', 'rhythm']);
  const credential = started.candidate.account.credential;
  const intent = createAccountDeleteIntent();
  const issueBody = {
    operationId: crypto.randomUUID(), intentToken: intent.intentToken
  };
  let response = await handleRequest(jsonRequest('/v2/accounts/delete-intent', issueBody, {
    credential
  }), env);
  assert.equal(response.status, 201);
  const commitBody = {
    operationId: crypto.randomUUID(), intentToken: intent.intentToken
  };
  response = await handleRequest(jsonRequest('/v2/accounts', commitBody, {
    credential, method: 'DELETE'
  }), env);
  assert.equal(response.status, 202);
  const deleting = await response.json();
  assert.equal(deleting.scope, 'account');
  assert.ok(deleting.purgeAfter > Date.now());
  response = await handleRequest(jsonRequest('/v2/accounts', commitBody, {
    credential, method: 'DELETE'
  }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).operation, 'existing');
  assert.equal(db.raw.prepare('SELECT state FROM sync_accounts').get().state, 'deleting');
  assert.equal(db.raw.prepare(
    'SELECT COUNT(*) count FROM sync_account_devices WHERE revoked_at IS NULL'
  ).get().count, 0);
  db.close();
});

test('current environment revoke is response-loss safe after its credential is invalidated', async () => {
  const db = createSqliteD1();
  enableLifecycleControl(db);
  const env = environment(db);
  const started = await startAccount(db, env, ['chord']);
  const body = {
    operationId: crypto.randomUUID(), accountDeviceId: started.payload.accountDeviceId
  };
  const options = { credential: started.candidate.account.credential };
  let response = await handleRequest(jsonRequest('/v2/accounts/devices/revoke', body, options), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).isCurrent, true);
  response = await handleRequest(jsonRequest('/v2/accounts/devices/revoke', body, options), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).alreadyRevoked, true);
  response = await handleRequest(jsonRequest('/v2/accounts/summary', undefined, options), env);
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, 'account_device_revoked');
  db.close();
});

test('current Port environment detach is response-loss safe and leaves Account data active', async () => {
  const db = createSqliteD1();
  enableLifecycleControl(db);
  const env = environment(db);
  const started = await startAccount(db, env, ['chord', 'pitch']);
  const body = { operationId: crypto.randomUUID() };
  const options = { credential: started.candidate.account.credential };
  let response = await handleRequest(jsonRequest('/v2/accounts/environments/current/detach', body, options), env);
  assert.equal(response.status, 200);
  const first = await response.json();
  assert.equal(first.scope, 'current_environment');
  assert.equal(first.isLastPort, true);
  response = await handleRequest(jsonRequest('/v2/accounts/environments/current/detach', body, options), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).alreadyDetached, true);
  assert.equal(db.raw.prepare('SELECT state FROM sync_accounts').get().state, 'active');
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_account_memberships').get().count, 3);
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_datasets').get().count, 0);
  db.close();
});

test('cross-container app Join Code activates once without echoing or storing plaintext', async () => {
  const db = createSqliteD1();
  enableAccountControl(db);
  const env = environment(db);
  const started = await startAccount(db, env, ['pitch']);
  let preflight = await handleRequest(new Request('https://sync.example/v2/accounts/app-join-invitations', {
    method: 'OPTIONS', headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization,x-d1-bookmark,x-sound-cruise-qa-authorization'
    }
  }), env);
  assert.equal(preflight.status, 204);
  const joinCode = createAppJoinCode();
  const invitationId = crypto.randomUUID();
  let response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations', {
    operationId: crypto.randomUUID(), invitationId, appId: 'pitch', joinCode
  }, { credential: started.candidate.account.credential }), env);
  assert.equal(response.status, 201);
  const issued = await response.json();
  assert.equal(issued.invitationId, invitationId);
  assert.equal(JSON.stringify(issued).includes(joinCode), false);
  assert.equal(JSON.stringify(db.raw.prepare('SELECT * FROM sync_app_join_invitations').get()).includes(joinCode), false);

  const targetAccount = createAccountCredential();
  const targetApp = await createIdentityMaterial(appPepper);
  const targetQa = createQaCredential();
  const consumeBody = {
    operationId: crypto.randomUUID(), appId: 'pitch', joinCode,
    accountCredential: targetAccount.credential, appDeviceCredential: targetApp.credential,
    qaCredential: targetQa.credential, deviceLabel: 'Pitch container', consumeMode: 'new_app'
  };
  response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations/consume', consumeBody), env);
  assert.equal(response.status, 201);
  const consumed = await response.json();
  assert.notEqual(consumed.accountDeviceId, consumed.appDeviceId);
  env.ACCOUNT_APP_JOIN_CONSUME_RATE_LIMITER = limiter(false);
  response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations/consume', consumeBody), env);
  assert.equal(response.status, 200, 'exact retry resolves before limiter');
  response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations/consume', {
    ...consumeBody, operationId: crypto.randomUUID()
  }), env);
  assert.equal(response.status, 429);
  env.ACCOUNT_APP_JOIN_CONSUME_RATE_LIMITER = limiter();
  response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations/consume', {
    ...consumeBody, operationId: crypto.randomUUID()
  }), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'app_join_consumed');
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_users').get().count, 1);
  db.close();
});

test('App Detach requires Account authority, is rate-limited and leaves the active membership immediately rejoinable', async () => {
  const db = createSqliteD1();
  enableLifecycleControl(db);
  const env = environment(db);
  const started = await startAccount(db, env, ['pitch', 'chord']);
  const credential = started.candidate.account.credential;
  const invitationId = crypto.randomUUID();
  const joinCode = createAppJoinCode();
  let response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations', {
    operationId: crypto.randomUUID(), invitationId, appId: 'pitch', joinCode
  }, { credential }), env);
  assert.equal(response.status, 201);
  const targetAccount = createAccountCredential();
  const targetApp = await createIdentityMaterial(appPepper);
  const targetQa = createQaCredential();
  response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations/consume', {
    operationId: crypto.randomUUID(), appId: 'pitch', joinCode,
    accountCredential: targetAccount.credential, appDeviceCredential: targetApp.credential,
    qaCredential: targetQa.credential, deviceLabel: 'Pitch container', consumeMode: 'new_app'
  }), env);
  assert.equal(response.status, 201);
  db.raw.prepare(`
    INSERT OR IGNORE INTO sync_datasets (
      user_id, app_id, state, schema_version, record_count, manifest_hash,
      min_change_seq, initialized_at, updated_at, last_change_seq
    ) SELECT sync_user_id, 'pitch', 'ready', 1, 0, NULL, 0, 1, 1, 0
      FROM sync_account_memberships
      WHERE account_id = ? AND app_id = 'pitch'
  `).run(started.payload.accountId);
  db.raw.prepare(`
    UPDATE sync_datasets
    SET state = 'ready', initialized_at = COALESCE(initialized_at, updated_at)
    WHERE user_id = (
      SELECT sync_user_id FROM sync_account_memberships
      WHERE account_id = ? AND app_id = 'pitch'
    ) AND app_id = 'pitch'
  `).run(started.payload.accountId);
  const membershipBefore = db.raw.prepare(`
    SELECT id, sync_user_id, generation, state FROM sync_account_memberships
    WHERE account_id = ? AND app_id = 'pitch'
  `).get(started.payload.accountId);
  assert.equal(db.raw.prepare(`
    SELECT COUNT(*) count FROM sync_devices d
    JOIN sync_membership_device_links a ON a.app_device_id = d.id
    WHERE a.membership_id = ? AND d.revoked_at IS NULL
  `).get(membershipBefore.id).count, 1);

  const body = { operationId: crypto.randomUUID(), appId: 'pitch' };
  response = await handleRequest(jsonRequest('/v2/accounts/memberships/pitch/detach', body), env);
  assert.equal(response.status, 401, 'missing Account credential is unauthorized');
  response = await handleRequest(jsonRequest('/v2/accounts/memberships/pitch/detach', body, {
    credential: targetApp.credential
  }), env);
  assert.equal(response.status, 401, 'an app credential cannot detach every app environment');
  response = await handleRequest(jsonRequest('/v2/accounts/memberships/pitch/detach', {
    ...body, appId: 'chord'
  }, { credential }), env);
  assert.equal(response.status, 400, 'route and exact payload app must match');
  response = await handleRequest(jsonRequest('/v2/accounts/memberships/pitch/detach', body, {
    credential
  }), { ...env, ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER: limiter(false) });
  assert.equal(response.status, 429, 'detach has an Account-scoped rate limit');

  response = await handleRequest(jsonRequest('/v2/accounts/memberships/pitch/detach', body, {
    credential
  }), env);
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const detached = await response.json();
  assert.equal(detached.scope, 'app');
  assert.equal(detached.appId, 'pitch');
  assert.equal(detached.revokedAppDeviceCount, 1);
  const membershipAfter = db.raw.prepare(`
    SELECT id, sync_user_id, state FROM sync_account_memberships
    WHERE account_id = ? AND app_id = 'pitch'
  `).get(started.payload.accountId);
  assert.equal(membershipAfter.id, membershipBefore.id);
  assert.equal(membershipAfter.sync_user_id, membershipBefore.sync_user_id);
  assert.equal(db.raw.prepare(`
    SELECT state FROM sync_datasets WHERE user_id = ? AND app_id = 'pitch'
  `).get(membershipAfter.sync_user_id).state, 'ready');
  assert.equal(membershipAfter.state, 'active');
  assert.equal(db.raw.prepare(`
    SELECT COUNT(*) count FROM sync_devices d
    JOIN sync_membership_device_links a ON a.app_device_id = d.id
    WHERE a.membership_id = ? AND d.revoked_at IS NULL
  `).get(membershipBefore.id).count, 0);
  assert.equal(db.raw.prepare(`
    SELECT COUNT(*) count FROM sync_account_devices
    WHERE account_id = ? AND revoked_at IS NULL
  `).get(started.payload.accountId).count, 2, 'Port and app-container Account devices remain active');

  env.ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER = limiter(false);
  response = await handleRequest(jsonRequest('/v2/accounts/memberships/pitch/detach', body, {
    credential
  }), env);
  assert.equal(response.status, 200, 'response-loss retry resolves before the limiter');
  assert.equal((await response.json()).operation, 'existing');
  db.close();
});

test('Account authority can revoke one app environment and cancel app deletion before issuing a new Join Code', async () => {
  const db = createSqliteD1();
  enableLifecycleControl(db);
  const env = environment(db);
  const started = await startAccount(db, env, ['pitch']);
  const credential = started.candidate.account.credential;
  const invitationId = crypto.randomUUID();
  const joinCode = createAppJoinCode();
  let response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations', {
    operationId: crypto.randomUUID(), invitationId, appId: 'pitch', joinCode
  }, { credential }), env);
  assert.equal(response.status, 201);
  const targetAccount = createAccountCredential();
  const targetApp = await createIdentityMaterial(appPepper);
  const targetQa = createQaCredential();
  response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations/consume', {
    operationId: crypto.randomUUID(), appId: 'pitch', joinCode,
    accountCredential: targetAccount.credential, appDeviceCredential: targetApp.credential,
    qaCredential: targetQa.credential, deviceLabel: 'Pitch environment', consumeMode: 'new_app'
  }), env);
  assert.equal(response.status, 201);
  db.raw.prepare(`
    INSERT OR IGNORE INTO sync_datasets (
      user_id, app_id, state, schema_version, record_count, manifest_hash,
      min_change_seq, initialized_at, updated_at, last_change_seq
    ) SELECT sync_user_id, 'pitch', 'ready', 1, 0, NULL, 0, 1, 1, 0
      FROM sync_account_memberships
      WHERE account_id = ? AND app_id = 'pitch'
  `).run(started.payload.accountId);
  db.raw.prepare(`
    UPDATE sync_datasets SET state = 'ready', initialized_at = COALESCE(initialized_at, updated_at)
    WHERE user_id = (SELECT sync_user_id FROM sync_account_memberships
      WHERE account_id = ? AND app_id = 'pitch') AND app_id = 'pitch'
  `).run(started.payload.accountId);

  response = await handleRequest(jsonRequest('/v2/accounts/devices', undefined, { credential }), env);
  assert.equal(response.status, 200);
  const listed = await response.json();
  assert.equal(listed.appDevices.filter((device) =>
    device.appId === 'pitch' && device.revokedAt == null).length, 1);
  assert.equal(JSON.stringify(listed).includes('credential_verifier'), false);

  const revokeBody = {
    operationId: crypto.randomUUID(), appId: 'pitch', appDeviceId: targetApp.deviceId
  };
  response = await handleRequest(jsonRequest(
    '/v2/accounts/memberships/pitch/devices/revoke', revokeBody,
    { credential: targetApp.credential }
  ), env);
  assert.equal(response.status, 401, 'an app credential cannot use the Account control plane');
  response = await handleRequest(jsonRequest(
    '/v2/accounts/memberships/chord/devices/revoke', revokeBody, { credential }
  ), env);
  assert.equal(response.status, 400, 'route app and payload app must match');
  response = await handleRequest(jsonRequest(
    '/v2/accounts/memberships/pitch/devices/revoke', revokeBody, { credential }
  ), env);
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).operation, 'revoked');
  response = await handleRequest(jsonRequest(
    '/v2/accounts/memberships/pitch/devices/revoke', revokeBody, { credential }
  ), env);
  assert.equal(response.status, 200, 'exact environment-revoke retry is idempotent');
  assert.equal((await response.json()).operation, 'existing');
  assert.notEqual(db.raw.prepare('SELECT revoked_at FROM sync_devices WHERE id = ?')
    .get(targetApp.deviceId).revoked_at, null);
  assert.equal(db.raw.prepare('SELECT state FROM sync_datasets WHERE app_id = ?')
    .get('pitch').state, 'ready');

  const intent = createAccountDeleteIntent();
  response = await handleRequest(jsonRequest('/v2/accounts/memberships/pitch/delete-intent', {
    operationId: crypto.randomUUID(), intentToken: intent.intentToken, appId: 'pitch'
  }, { credential }), env);
  assert.equal(response.status, 201);
  response = await handleRequest(jsonRequest('/v2/accounts/memberships/pitch', {
    operationId: crypto.randomUUID(), intentToken: intent.intentToken, appId: 'pitch'
  }, { credential, method: 'DELETE' }), env);
  assert.equal(response.status, 202);
  const membership = db.raw.prepare(`SELECT id, sync_user_id, state, purge_after
    FROM sync_account_memberships WHERE account_id = ? AND app_id = 'pitch'`)
    .get(started.payload.accountId);
  assert.equal(membership.state, 'deleting');
  response = await handleRequest(jsonRequest('/v2/accounts/summary', undefined, { credential }), env);
  assert.equal(response.status, 200);
  const deletingSummary = await response.json();
  const deletingPitch = deletingSummary.memberships.find((item) => item.appId === 'pitch');
  assert.equal(deletingPitch.deleteRequestedAt != null, true);
  assert.equal(deletingPitch.purgeAfter, membership.purge_after,
    'the UI receives the authoritative grace deadline without secret material');

  const cancelBody = { operationId: crypto.randomUUID(), appId: 'pitch' };
  response = await handleRequest(jsonRequest(
    '/v2/accounts/memberships/pitch/delete/cancel', cancelBody,
    { credential: targetApp.credential }
  ), env);
  assert.equal(response.status, 401, 'an app credential alone cannot cancel app deletion');
  response = await handleRequest(jsonRequest(
    '/v2/accounts/memberships/pitch/delete/cancel', cancelBody, { credential }
  ), env);
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).operation, 'cancelled');
  response = await handleRequest(jsonRequest(
    '/v2/accounts/memberships/pitch/delete/cancel', cancelBody, { credential }
  ), env);
  assert.equal(response.status, 200, 'exact delete-cancel retry is idempotent');
  assert.equal((await response.json()).operation, 'existing');
  assert.deepEqual({ ...db.raw.prepare(`SELECT state, purge_after FROM sync_account_memberships
    WHERE id = ?`).get(membership.id) }, { state: 'active', purge_after: null });
  assert.deepEqual({ ...db.raw.prepare(`SELECT state, purge_after FROM sync_users
    WHERE id = ?`).get(membership.sync_user_id) }, { state: 'active', purge_after: null });
  assert.equal(db.raw.prepare(`SELECT COUNT(*) count FROM sync_devices
    WHERE user_id = ? AND revoked_at IS NULL`).get(membership.sync_user_id).count, 0,
  'cancelling deletion does not revive the old app environment');

  response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations', {
    operationId: crypto.randomUUID(), invitationId: crypto.randomUUID(),
    appId: 'pitch', joinCode: createAppJoinCode()
  }, { credential }), env);
  assert.equal(response.status, 201, 'a new Join Code is available only after cancellation succeeds');
  db.close();
});

test('Port-to-Port Join is exact-origin, rate-limited, one-time and secret-free', async () => {
  const db = createSqliteD1();
  enableLifecycleControl(db);
  const env = environment(db);
  const started = await startAccount(db, env, ['chord', 'pitch', 'fretboard', 'rhythm']);
  assert.equal(started.response.status, 201);
  const joinCode = createAppJoinCode();
  const invitationId = crypto.randomUUID();
  const issueBody = { operationId: crypto.randomUUID(), invitationId, joinCode };

  let response = await handleRequest(jsonRequest('/v2/accounts/port-join-invitations', issueBody, {
    credential: started.candidate.account.credential,
    origin: 'https://attacker.example'
  }), env);
  assert.equal(response.status, 403);

  env.ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER = limiter(false);
  response = await handleRequest(jsonRequest('/v2/accounts/port-join-invitations', issueBody, {
    credential: started.candidate.account.credential
  }), env);
  assert.equal(response.status, 429);
  env.ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER = limiter();

  response = await handleRequest(jsonRequest('/v2/accounts/port-join-invitations', issueBody, {
    credential: started.candidate.account.credential
  }), env);
  assert.equal(response.status, 201);
  const issued = await response.json();
  assert.equal(JSON.stringify(issued).includes(joinCode), false);
  assert.equal(JSON.stringify(
    db.raw.prepare('SELECT * FROM sync_port_join_invitations').get()
  ).includes(joinCode), false);

  const candidate = createAccountCredential();
  const candidateQa = createQaCredential();
  const consumeBody = {
    operationId: crypto.randomUUID(), joinCode,
    accountCredential: candidate.credential,
    qaCredential: candidateQa.credential,
    deviceLabel: 'Second Cruise Port'
  };
  response = await handleRequest(
    jsonRequest('/v2/accounts/port-join-invitations/consume', consumeBody), env
  );
  assert.equal(response.status, 201);
  const joined = await response.json();
  assert.equal(joined.accountId, started.payload.accountId);
  assert.equal(joined.accountDeviceId, candidate.deviceId);
  assert.equal(JSON.stringify(joined).includes(joinCode), false);
  assert.equal(JSON.stringify(joined).includes(candidate.credential), false);
  assert.equal(JSON.stringify(joined).includes(candidateQa.credential), false);
  assert.equal(db.raw.prepare(
    'SELECT COUNT(*) count FROM sync_account_devices WHERE account_id = ? AND revoked_at IS NULL'
  ).get(started.payload.accountId).count, 2);
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_users').get().count, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_datasets').get().count, 0);

  response = await handleRequest(
    jsonRequest('/v2/accounts/port-join-invitations/consume', consumeBody), env
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).operation, 'existing');

  const replayAccount = createAccountCredential();
  const replayQa = createQaCredential();
  response = await handleRequest(jsonRequest('/v2/accounts/port-join-invitations/consume', {
    ...consumeBody, operationId: crypto.randomUUID(),
    accountCredential: replayAccount.credential, qaCredential: replayQa.credential
  }), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'port_join_consumed');
  assert.equal(db.raw.prepare(
    'SELECT COUNT(*) count FROM sync_account_devices WHERE account_id = ? AND revoked_at IS NULL'
  ).get(started.payload.accountId).count, 2);
  db.close();
});

test('Chord Join distinguishes retired Legacy from unknown and preserves active Legacy for bridge', async () => {
  const db = createSqliteD1();
  enableAccountControl(db);
  const env = environment(db);
  const started = await startAccount(db, env, ['chord']);
  const joinCode = createAppJoinCode();
  const invitationId = crypto.randomUUID();
  let response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations', {
    operationId: crypto.randomUUID(), invitationId, appId: 'chord', joinCode
  }, { credential: started.candidate.account.credential }), env);
  assert.equal(response.status, 201);

  const legacy = await createIdentityMaterial(appPepper);
  seedIdentity(db, {
    userId: legacy.userId,
    deviceId: legacy.deviceId,
    appId: 'chord',
    verifier: legacy.credentialVerifier
  });
  db.raw.prepare(`
    UPDATE sync_users
    SET state = 'active', recovery_version = 1, recovery_verifier = ?, updated_at = 2
    WHERE id = ?
  `).run('legacy-recovery-verifier', legacy.userId);
  db.raw.prepare(`
    UPDATE sync_datasets
    SET state = 'ready', initialized_at = 2, updated_at = 2
    WHERE user_id = ? AND app_id = 'chord'
  `).run(legacy.userId);

  const targetAccount = createAccountCredential();
  const targetQa = createQaCredential();
  const consumeBody = {
    operationId: crypto.randomUUID(), appId: 'chord', joinCode,
    accountCredential: targetAccount.credential,
    appDeviceCredential: legacy.credential,
    qaCredential: targetQa.credential,
    deviceLabel: 'Chord container', consumeMode: 'existing_chord'
  };
  const unknown = await createIdentityMaterial(appPepper);
  response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations/consume', {
    ...consumeBody,
    operationId: crypto.randomUUID(),
    appDeviceCredential: unknown.credential
  }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'invalid_app_credential');
  assert.equal(db.raw.prepare(
    'SELECT consumed_at FROM sync_app_join_invitations WHERE invitation_id = ?'
  ).get(invitationId).consumed_at, null, 'unknown credential never consumes the invitation');

  db.raw.prepare('UPDATE sync_devices SET revoked_at = 3 WHERE id = ?').run(legacy.deviceId);
  response = await handleRequest(
    jsonRequest('/v2/accounts/app-join-invitations/consume', consumeBody), env
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'retired_legacy_device');
  assert.equal(db.raw.prepare(
    'SELECT consumed_at FROM sync_app_join_invitations WHERE invitation_id = ?'
  ).get(invitationId).consumed_at, null, 'retired detection is read-only and leaves the code retryable');

  db.raw.prepare('UPDATE sync_devices SET revoked_at = NULL WHERE id = ?').run(legacy.deviceId);
  response = await handleRequest(
    jsonRequest('/v2/accounts/app-join-invitations/consume', consumeBody), env
  );
  assert.equal(response.status, 201);
  const bridged = await response.json();
  assert.equal(bridged.operation, 'bridge_required');
  assert.equal(bridged.syncUserId, legacy.userId);
  assert.equal(bridged.membershipState, 'pending');
  assert.equal(db.raw.prepare('SELECT revoked_at FROM sync_devices WHERE id = ?')
    .get(legacy.deviceId).revoked_at, null, 'active Legacy identity is preserved');
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

test('production Auto Rejoin creates one new app environment on the existing ready dataset', async () => {
  const db = createSqliteD1();
  enableAccountControl(db);
  const env = environment(db);
  env.SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED = 'true';
  env.SYNC_ACCOUNT_PUBLIC_APP_IDS = 'chord,pitch,fretboard,rhythm,port';
  const started = await startAccount(db, env, ['pitch']);
  const invitationId = crypto.randomUUID();
  const joinCode = createAppJoinCode();
  let response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations', {
    operationId: crypto.randomUUID(), invitationId, appId: 'pitch', joinCode
  }, { credential: started.candidate.account.credential }), env);
  assert.equal(response.status, 201);
  const originalAccount = createAccountCredential();
  const originalApp = await createIdentityMaterial(appPepper);
  const originalQa = createQaCredential();
  response = await handleRequest(jsonRequest('/v2/accounts/app-join-invitations/consume', {
    operationId: crypto.randomUUID(), appId: 'pitch', joinCode,
    accountCredential: originalAccount.credential,
    appDeviceCredential: originalApp.credential,
    qaCredential: originalQa.credential,
    deviceLabel: 'Pitch original', consumeMode: 'new_app'
  }), env);
  assert.equal(response.status, 201);
  const initial = await response.json();
  db.raw.prepare(`INSERT INTO sync_datasets
    (user_id,app_id,state,schema_version,record_count,manifest_hash,min_change_seq,last_change_seq,initialized_at,updated_at)
    VALUES (?, 'pitch', 'ready', 1, 4, ?, 0, 0, 1, 1)`)
    .run(initial.syncUserId, '0'.repeat(64));
  db.raw.prepare(`UPDATE sync_accounts SET admission_provenance = 'production' WHERE id = ?`)
    .run(started.payload.accountId);

  const handoff = createAccountHandoff();
  response = await handleRequest(jsonRequest('/v2/accounts/handoffs', {
    operationId: crypto.randomUUID(), appId: 'pitch', handoffToken: handoff.handoffToken
  }, { credential: started.candidate.account.credential, noQa: true }), env);
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const replacementAccount = createAccountCredential();
  const replacementApp = await createIdentityMaterial(appPepper);
  const consumeBody = {
    operationId: crypto.randomUUID(), appId: 'pitch', handoffToken: handoff.handoffToken,
    accountCredential: replacementAccount.credential,
    appDeviceCredential: replacementApp.credential,
    deviceLabel: 'Pitch replacement', consumeMode: 'new_app'
  };
  response = await handleRequest(jsonRequest('/v2/accounts/handoffs/consume', {
    ...consumeBody, appId: 'chord'
  }, { noQa: true }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'wrong_app');
  response = await handleRequest(jsonRequest('/v2/accounts/handoffs/consume', consumeBody,
    { noQa: true }), env);
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const rejoined = await response.json();
  assert.equal(rejoined.syncUserId, initial.syncUserId);
  assert.equal(rejoined.datasetState, 'ready');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 1);
  assert.equal(db.raw.prepare(`SELECT COUNT(*) AS count FROM sync_datasets
    WHERE user_id = ? AND app_id = 'pitch'`).get(initial.syncUserId).count, 1);
  assert.equal(db.raw.prepare(`SELECT COUNT(*) AS count FROM sync_devices
    WHERE user_id = ? AND app_id = 'pitch' AND revoked_at IS NULL`).get(initial.syncUserId).count, 2);
  response = await handleRequest(jsonRequest('/v2/accounts/handoffs/consume', consumeBody,
    { noQa: true }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).alreadyActivated, true);
  assert.equal(db.raw.prepare(`SELECT COUNT(*) AS count FROM sync_devices
    WHERE user_id = ?`).get(initial.syncUserId).count, 2);
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
