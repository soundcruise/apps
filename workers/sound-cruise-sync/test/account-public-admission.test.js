import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/app.js';
import {
  createAccountCredential,
  createAccountDeleteIntent,
  createAccountRecoveryClaim,
  createAccountRecoveryCode,
  createAppJoinCode
} from '../src/account-crypto.js';
import { createQaCredential } from '../src/account-qa-crypto.js';
import { createIdentityMaterial } from '../src/crypto.js';
import { hashRecord, manifestHash } from '../src/records.js';
import { createSqliteD1 } from './sqlite-d1.js';

const origin = 'https://soundcruise.jp';
const apps = ['chord', 'pitch', 'fretboard', 'rhythm'];
const peppers = Object.freeze({
  account: 'public-account-credential-pepper-at-least-32',
  recovery: 'public-account-recovery-pepper-at-least-32',
  join: 'public-account-join-pepper-at-least-32',
  app: 'public-app-credential-pepper-at-least-32',
  qa: 'public-qa-credential-pepper-at-least-32'
});

function limiter(success = true) {
  return { async limit() { return { success }; } };
}

function enableRuntime(db) {
  db.raw.prepare(`UPDATE sync_account_runtime_control SET rollout_mode='open',
    account_admission_enabled=1, membership_admission_enabled=1,
    account_read_enabled=1, account_recovery_enabled=1, account_delete_enabled=1,
    port_orchestration_enabled=1, generation=generation+1, updated_at=10
    WHERE singleton_id=1`).run();
  db.raw.prepare(`UPDATE sync_runtime_control SET rollout_mode='open',
    admission_enabled=1, data_write_enabled=1, data_read_enabled=1,
    recovery_enabled=1, cloud_delete_enabled=1, generation=generation+1, updated_at=10
    WHERE singleton_id=1`).run();
}

function environment(db, overrides = {}) {
  return {
    SYNC_DB: db,
    ACCOUNT_ALLOWED_ORIGINS: origin,
    ALLOWED_ORIGINS: origin,
    SYNC_ALLOWED_APP_IDS: 'chord',
    SYNC_QA_ALLOWED_APP_IDS: apps.join(','),
    SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED: 'true',
    SYNC_ACCOUNT_PUBLIC_APP_IDS: apps.join(','),
    SYNC_ACCOUNT_CREDENTIAL_PEPPER: peppers.account,
    SYNC_ACCOUNT_RECOVERY_PEPPER: peppers.recovery,
    SYNC_ACCOUNT_APP_JOIN_PEPPER: peppers.join,
    SYNC_ACCOUNT_QA_CREDENTIAL_PEPPER: peppers.qa,
    SYNC_CREDENTIAL_PEPPER: peppers.app,
    ACCOUNT_START_RATE_LIMITER: limiter(),
    ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER: limiter(),
    ACCOUNT_APP_JOIN_CONSUME_RATE_LIMITER: limiter(),
    ACCOUNT_RECOVERY_RATE_LIMITER: limiter(),
    SYNC_RATE_LIMITER: limiter(),
    TURNSTILE_PRODUCTION_SECRET_KEY: 'test-only-turnstile-secret',
    ...overrides
  };
}

function request(path, body, { authorization = null, requestOrigin = origin, method = null } = {}) {
  const headers = new Headers({ Origin: requestOrigin });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (authorization) headers.set('Authorization', `Bearer ${authorization}`);
  return new Request(`https://sync.example${path}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

const turnstileOk = { verifyTurnstileToken: async () => ({ ok: true }) };

async function createPublicAccount(db, env) {
  const account = createAccountCredential();
  const recoveryCode = createAccountRecoveryCode();
  const response = await handleRequest(request('/v2/accounts/start', {
    operationId: crypto.randomUUID(),
    appIds: apps,
    accountCredential: account.credential,
    recoveryCode,
    turnstileToken: 'valid-turnstile',
    deviceLabel: 'Public Port'
  }), env, null, turnstileOk);
  return { account, recoveryCode, response, body: await response.json() };
}

async function joinPublicApp(env, started, appId) {
  const joinCode = createAppJoinCode();
  const invitationId = crypto.randomUUID();
  let response = await handleRequest(request('/v2/accounts/app-join-invitations', {
    operationId: crypto.randomUUID(), invitationId, appId, joinCode
  }, { authorization: started.account.credential }), env);
  assert.equal(response.status, 201, `${appId} issue`);
  const account = createAccountCredential();
  const app = await createIdentityMaterial(peppers.app);
  response = await handleRequest(request('/v2/accounts/app-join-invitations/consume', {
    operationId: crypto.randomUUID(), appId, joinCode,
    accountCredential: account.credential,
    appDeviceCredential: app.credential,
    deviceLabel: `${appId} Pro`, consumeMode: 'new_app'
  }), env);
  assert.equal(response.status, 201, `${appId} consume`);
  return { account, app, body: await response.json(), invitationId };
}

test('public admission is double-gated, exact-origin, Turnstile and rate-limit protected', async () => {
  const db = createSqliteD1();
  enableRuntime(db);
  const candidate = createAccountCredential();
  const body = {
    operationId: crypto.randomUUID(), appIds: apps,
    accountCredential: candidate.credential, recoveryCode: createAccountRecoveryCode(),
    turnstileToken: 'valid-turnstile', deviceLabel: 'Public Port'
  };
  for (const publicFlag of [undefined, 'false', 'TRUE', '1']) {
    const env = environment(db, { SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED: publicFlag });
    const response = await handleRequest(request('/v2/accounts/start', body), env, null, turnstileOk);
    assert.equal(response.status, 403, String(publicFlag));
  }
  for (const publicApps of [undefined, '', 'chord,chord', 'chord,unknown']) {
    const env = environment(db, { SYNC_ACCOUNT_PUBLIC_APP_IDS: publicApps });
    const response = await handleRequest(request('/v2/accounts/start', body), env, null, turnstileOk);
    assert.equal(response.status, 403, String(publicApps));
  }
  let response = await handleRequest(request('/v2/accounts/start', body, {
    requestOrigin: 'https://attacker.example'
  }), environment(db), null, turnstileOk);
  assert.equal(response.status, 403);
  response = await handleRequest(request('/v2/accounts/start', body), environment(db), null, {
    verifyTurnstileToken: async () => ({ ok: false })
  });
  assert.equal(response.status, 403);
  response = await handleRequest(request('/v2/accounts/start', body), environment(db, {
    ACCOUNT_START_RATE_LIMITER: limiter(false)
  }), null, turnstileOk);
  assert.equal(response.status, 429);
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_accounts').get().count, 0);
  db.close();
});

test('public admission OFF blocks new enrollment but preserves existing production authority', async () => {
  const db = createSqliteD1();
  enableRuntime(db);
  const env = environment(db);
  const started = await createPublicAccount(db, env);
  assert.equal(started.response.status, 201);
  const joined = await joinPublicApp(env, started, 'chord');
  const emptyManifest = await manifestHash([], 1, crypto, 'chord');
  let response = await handleRequest(request('/v1/sync/bootstrap', {
    appId: 'chord', schemaVersion: 1, recordCount: 0, manifestHash: emptyManifest
  }, { authorization: joined.app.credential }), env);
  assert.equal(response.status, 201);
  response = await handleRequest(request('/v1/sync/migration/complete', {
    appId: 'chord', schemaVersion: 1, recordCount: 0, manifestHash: emptyManifest
  }, { authorization: joined.app.credential }), env);
  assert.equal(response.status, 200);

  env.SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED = 'false';
  response = await createPublicAccount(db, env).then((result) => result.response);
  assert.equal(response.status, 403, 'new Account start is closed');
  response = await handleRequest(request('/v2/accounts/app-join-invitations', {
    operationId: crypto.randomUUID(), invitationId: crypto.randomUUID(),
    appId: 'pitch', joinCode: createAppJoinCode()
  }, { authorization: started.account.credential }), env);
  assert.equal(response.status, 403, 'new app admission is closed');
  response = await handleRequest(request('/v2/accounts/summary', undefined, {
    authorization: started.account.credential
  }), env);
  assert.equal(response.status, 200, 'authenticated Account read remains available');
  response = await handleRequest(request('/v2/accounts/summary', undefined), env);
  assert.equal(response.status, 401, 'Account read remains credential protected');
  response = await handleRequest(request('/v1/sync/snapshot?appId=chord', undefined, {
    authorization: joined.app.credential
  }), env);
  assert.equal(response.status, 200, 'existing app credential remains data authority');
  db.close();
});

test('production Join rejects invalid app, cross-Account issuer, QA provenance, expiry and rate limits', async () => {
  const db = createSqliteD1();
  enableRuntime(db);
  const env = environment(db);
  const owner = await createPublicAccount(db, env);
  const other = await createPublicAccount(db, env);
  assert.equal(owner.response.status, 201);
  assert.equal(other.response.status, 201);

  let response = await handleRequest(request('/v2/accounts/app-join-invitations', {
    operationId: crypto.randomUUID(), invitationId: crypto.randomUUID(),
    appId: 'invalid', joinCode: createAppJoinCode()
  }, { authorization: owner.account.credential }), env);
  assert.equal(response.status, 400);

  env.ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER = limiter(false);
  response = await handleRequest(request('/v2/accounts/app-join-invitations', {
    operationId: crypto.randomUUID(), invitationId: crypto.randomUUID(),
    appId: 'pitch', joinCode: createAppJoinCode()
  }, { authorization: owner.account.credential }), env);
  assert.equal(response.status, 429);
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_app_join_invitations').get().count, 0);
  env.ACCOUNT_APP_JOIN_ISSUE_RATE_LIMITER = limiter();

  const joinCode = createAppJoinCode();
  const invitationId = crypto.randomUUID();
  response = await handleRequest(request('/v2/accounts/app-join-invitations', {
    operationId: crypto.randomUUID(), invitationId, appId: 'pitch', joinCode
  }, { authorization: owner.account.credential }), env);
  assert.equal(response.status, 201);
  response = await handleRequest(request('/v2/accounts/app-join-invitations/cancel', {
    invitationId
  }, { authorization: other.account.credential }), env);
  assert.equal(response.status, 404, 'another Account cannot manage the invitation');

  const candidateAccount = createAccountCredential();
  const candidateApp = await createIdentityMaterial(peppers.app);
  const consume = {
    operationId: crypto.randomUUID(), appId: 'pitch', joinCode,
    accountCredential: candidateAccount.credential,
    appDeviceCredential: candidateApp.credential,
    deviceLabel: 'Pitch Pro', consumeMode: 'new_app'
  };
  response = await handleRequest(request('/v2/accounts/app-join-invitations/consume', {
    ...consume, appId: 'rhythm'
  }), env);
  assert.equal(response.status, 400, 'target app binding');
  response = await handleRequest(request('/v2/accounts/app-join-invitations/consume', {
    ...consume, qaCredential: createQaCredential().credential
  }), env);
  assert.equal(response.status, 400, 'QA provenance cannot consume production invitation');

  env.ACCOUNT_APP_JOIN_CONSUME_RATE_LIMITER = limiter(false);
  response = await handleRequest(request('/v2/accounts/app-join-invitations/consume', consume), env);
  assert.equal(response.status, 429);
  env.ACCOUNT_APP_JOIN_CONSUME_RATE_LIMITER = limiter();
  db.raw.prepare(`UPDATE sync_app_join_invitations SET created_at=1, expires_at=2
    WHERE invitation_id=?`).run(invitationId);
  response = await handleRequest(request('/v2/accounts/app-join-invitations/consume', consume), env);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'app_join_expired');
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_users').get().count, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_account_qa_sessions').get().count, 0);
  db.close();
});

test('production Account Recovery works without QA authority while public admission is OFF', async () => {
  const db = createSqliteD1();
  enableRuntime(db);
  const env = environment(db);
  const started = await createPublicAccount(db, env);
  assert.equal(started.response.status, 201);
  env.SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED = 'false';

  const nextAccount = createAccountCredential();
  const claim = createAccountRecoveryClaim();
  const nextRecoveryCode = createAccountRecoveryCode();
  const prepare = {
    operationId: crypto.randomUUID(),
    recoveryCode: started.recoveryCode,
    claimToken: claim.claimToken,
    nextRecoveryCode,
    accountCredential: nextAccount.credential,
    deviceLabel: 'Recovered Production Port',
    turnstileToken: 'valid-turnstile'
  };
  let response = await handleRequest(
    request('/v2/accounts/recovery/prepare', prepare), env, null, turnstileOk
  );
  assert.equal(response.status, 201);
  response = await handleRequest(request('/v2/accounts/recovery/commit', {
    operationId: crypto.randomUUID(),
    claimToken: claim.claimToken,
    accountCredential: nextAccount.credential
  }), env);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).recoveryVersion, 2);
  response = await handleRequest(request('/v2/accounts/summary', undefined, {
    authorization: started.account.credential
  }), env);
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, 'account_device_revoked');
  response = await handleRequest(request('/v2/accounts/summary', undefined, {
    authorization: nextAccount.credential
  }), env);
  assert.equal(response.status, 200);
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_account_qa_sessions').get().count, 0);
  db.close();
});

test('production app and Account deletion remain Account-credential authenticated with public admission OFF', async () => {
  const db = createSqliteD1();
  enableRuntime(db);
  const env = environment(db);
  const appAccount = await createPublicAccount(db, env);
  const joined = await joinPublicApp(env, appAccount, 'rhythm');
  const emptyManifest = await manifestHash([], 1, crypto, 'rhythm');
  let response = await handleRequest(request('/v1/sync/bootstrap', {
    appId: 'rhythm', schemaVersion: 1, recordCount: 0, manifestHash: emptyManifest
  }, { authorization: joined.app.credential }), env);
  assert.equal(response.status, 201);
  response = await handleRequest(request('/v1/sync/migration/complete', {
    appId: 'rhythm', schemaVersion: 1, recordCount: 0, manifestHash: emptyManifest
  }, { authorization: joined.app.credential }), env);
  assert.equal(response.status, 200);
  env.SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED = 'false';

  const appIntent = createAccountDeleteIntent();
  response = await handleRequest(request('/v2/accounts/memberships/rhythm/delete-intent', {
    operationId: crypto.randomUUID(), intentToken: appIntent.intentToken, appId: 'rhythm'
  }, { authorization: appAccount.account.credential }), env);
  assert.equal(response.status, 201);
  response = await handleRequest(request('/v2/accounts/memberships/rhythm', {
    operationId: crypto.randomUUID(), intentToken: appIntent.intentToken, appId: 'rhythm'
  }, { authorization: appAccount.account.credential, method: 'DELETE' }), env);
  assert.equal(response.status, 202);
  assert.equal(db.raw.prepare("SELECT state FROM sync_account_memberships WHERE app_id='rhythm'").get().state, 'deleting');
  assert.equal(db.raw.prepare('SELECT state FROM sync_accounts WHERE id=?').get(appAccount.body.accountId).state, 'active');
  assert.equal(db.raw.prepare("SELECT COUNT(*) count FROM sync_datasets WHERE app_id='rhythm'").get().count, 1);
  response = await handleRequest(request('/v1/sync/snapshot?appId=rhythm', undefined, {
    authorization: joined.app.credential
  }), env);
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, 'membership_deleting');

  env.SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED = 'true';
  const deletingAccount = await createPublicAccount(db, env);
  assert.equal(deletingAccount.response.status, 201);
  env.SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED = 'false';
  const accountIntent = createAccountDeleteIntent();
  response = await handleRequest(request('/v2/accounts/delete-intent', {
    operationId: crypto.randomUUID(), intentToken: accountIntent.intentToken
  }, { authorization: deletingAccount.account.credential }), env);
  assert.equal(response.status, 201);
  response = await handleRequest(request('/v2/accounts', {
    operationId: crypto.randomUUID(), intentToken: accountIntent.intentToken
  }, { authorization: deletingAccount.account.credential, method: 'DELETE' }), env);
  assert.equal(response.status, 202);
  assert.equal(db.raw.prepare('SELECT state FROM sync_accounts WHERE id=?')
    .get(deletingAccount.body.accountId).state, 'deleting');
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_account_devices WHERE account_id=? AND revoked_at IS NULL')
    .get(deletingAccount.body.accountId).count, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_account_qa_sessions').get().count, 0);
  db.close();
});

test('public Port creates one Account and four verifier-only app joins without QA material', async () => {
  const db = createSqliteD1();
  enableRuntime(db);
  const env = environment(db);
  const started = await createPublicAccount(db, env);
  assert.equal(started.response.status, 201);
  assert.equal(started.body.memberships.length, 4);
  assert.equal(db.raw.prepare('SELECT admission_provenance FROM sync_accounts').get().admission_provenance,
    'production');
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_account_qa_sessions').get().count, 0);

  const joined = [];
  for (const appId of apps) {
    const joinCode = createAppJoinCode();
    const invitationId = crypto.randomUUID();
    const issueBody = { operationId: crypto.randomUUID(), invitationId, appId, joinCode };
    let response = await handleRequest(request('/v2/accounts/app-join-invitations', issueBody, {
      authorization: started.account.credential
    }), env);
    assert.equal(response.status, 201, `${appId} issue`);
    const invitation = db.raw.prepare(`SELECT code_verifier, admission_provenance,
      qa_issuer_session_id FROM sync_app_join_invitations WHERE invitation_id=?`).get(invitationId);
    assert.equal(invitation.admission_provenance, 'production');
    assert.equal(invitation.qa_issuer_session_id, null);
    assert.notEqual(invitation.code_verifier, joinCode);

    const account = createAccountCredential();
    const app = await createIdentityMaterial(peppers.app);
    const consumeBody = {
      operationId: crypto.randomUUID(), appId, joinCode,
      accountCredential: account.credential,
      appDeviceCredential: app.credential,
      deviceLabel: `${appId} Pro`, consumeMode: 'new_app'
    };
    response = await handleRequest(request('/v2/accounts/app-join-invitations/consume', consumeBody), env);
    assert.equal(response.status, 201, `${appId} consume`);
    const consumed = await response.json();
    assert.equal(Object.hasOwn(consumed, 'qaSessionId'), true);
    assert.equal(consumed.qaSessionId, null);

    const emptyManifest = await manifestHash([], 1, crypto, appId);
    response = await handleRequest(request('/v1/sync/bootstrap', {
      appId, schemaVersion: 1, recordCount: 0, manifestHash: emptyManifest
    }, { authorization: app.credential }), env);
    assert.equal(response.status, 201, `${appId} bootstrap`);
    response = await handleRequest(request('/v1/sync/migration/complete', {
      appId, schemaVersion: 1, recordCount: 0, manifestHash: emptyManifest
    }, { authorization: app.credential }), env);
    assert.equal(response.status, 200, `${appId} migration`);

    const payloads = {
      chord: { id: 'settings', values: {} },
      pitch: { id: 'settings', values: { notationStyle: 'letter' } },
      fretboard: { id: 'settings', values: { tempo: 96 } },
      rhythm: { id: 'settings', values: { judgePreset: 'strict' } }
    };
    const operation = {
      operationId: crypto.randomUUID(), recordType: 'settings', recordId: 'settings',
      schemaVersion: 1, baseRevision: 0, payload: payloads[appId],
      payloadHash: '', deleted: false
    };
    operation.payloadHash = await hashRecord(operation, crypto, appId);
    response = await handleRequest(request('/v1/sync/push', {
      appId, mode: 'sync', operations: [operation]
    }, { authorization: app.credential }), env);
    assert.equal(response.status, 200, `${appId} push`);
    assert.deepEqual((await response.json()).results.map((result) => result.status), ['applied']);

    response = await handleRequest(request(`/v1/sync/snapshot?appId=${appId}`, undefined, {
      authorization: app.credential
    }), env);
    assert.equal(response.status, 200, `${appId} snapshot`);
    const snapshot = await response.json();
    assert.equal(snapshot.recordCount, 1, `${appId} record count`);
    assert.equal(snapshot.records[0]?.recordId, 'settings', `${appId} saved record`);
    joined.push({ appId, accountDeviceId: consumed.accountDeviceId, appCredential: app.credential });

    const replay = await handleRequest(request('/v2/accounts/app-join-invitations/consume', consumeBody), env);
    assert.equal(replay.status, 200, `${appId} response-loss retry`);
    const rejectedReplay = await handleRequest(request('/v2/accounts/app-join-invitations/consume', {
      ...consumeBody, operationId: crypto.randomUUID()
    }), env);
    assert.equal(rejectedReplay.status, 409, `${appId} replay`);
  }

  const counts = db.raw.prepare(`SELECT
    (SELECT COUNT(*) FROM sync_accounts) accounts,
    (SELECT COUNT(*) FROM sync_account_devices WHERE revoked_at IS NULL) account_devices,
    (SELECT COUNT(*) FROM sync_account_memberships WHERE state='active') memberships,
    (SELECT COUNT(*) FROM sync_users) app_users,
    (SELECT COUNT(*) FROM sync_account_qa_sessions) qa_sessions,
    (SELECT COUNT(*) FROM sync_datasets WHERE state='ready') ready_datasets`).get();
  assert.deepEqual({ ...counts }, {
    accounts: 1, account_devices: 5, memberships: 4,
    app_users: 4, qa_sessions: 0, ready_datasets: 4
  });

  const revoked = joined.find((item) => item.appId === 'pitch');
  const revokeResponse = await handleRequest(request('/v2/accounts/devices/revoke', {
    operationId: crypto.randomUUID(), accountDeviceId: revoked.accountDeviceId
  }, { authorization: started.account.credential }), env);
  assert.equal(revokeResponse.status, 200);
  const denied = await handleRequest(request('/v1/sync/snapshot?appId=pitch', undefined, {
    authorization: revoked.appCredential
  }), env);
  assert.equal(denied.status, 410);
  assert.equal((await denied.json()).code, 'app_device_revoked');
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_account_qa_sessions').get().count, 0);
  db.close();
});
