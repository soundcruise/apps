import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountCredentialVerifier, appJoinCodeVerifier, accountOperationFingerprint,
  createAccountCredential, createAppJoinCode
} from '../src/account-crypto.js';
import { createD1AccountRepository } from '../src/account-database.js';
import { ACCOUNT_APP_JOIN_TTL_MS, createD1AppJoinRepository } from '../src/account-join-database.js';
import { createD1AccountLifecycleRepository } from '../src/account-lifecycle-database.js';
import { createIdentityMaterial } from '../src/crypto.js';
import { createQaCredential, qaCredentialVerifier } from '../src/account-qa-crypto.js';
import { createSqliteD1 } from './sqlite-d1.js';

const accountPepper = 'm95-account-credential-pepper-32-chars';
const recoveryPepper = 'm95-account-recovery-pepper-32-characters';
const joinPepper = 'm95-account-app-join-pepper-32-characters';
const appPepper = 'm95-app-credential-pepper-32-characters';
const qaPepper = 'm95-account-qa-pepper-32-characters';

async function setup(appId = 'pitch') {
  const db = createSqliteD1();
  const issuer = createAccountCredential();
  await createD1AccountRepository(db).createAccountBackbone({
    accountId: 'join-account', accountDeviceId: issuer.deviceId,
    recoveryVerifier: 'a'.repeat(64),
    accountCredentialVerifier: await accountCredentialVerifier(issuer.credential, accountPepper),
    accountDeviceLabel: 'Port', memberships: [{ id: `membership-${appId}`, appId }], now: 1
  });
  const portQa = createQaCredential();
  db.raw.prepare(`INSERT INTO sync_account_qa_enrollments
    (id, code_verifier, created_at, expires_at, consumed_at, cancelled_at, consumed_by_session_id)
    VALUES ('join-enrollment', ?, 1, ?, 1, NULL, ?)`).run('8'.repeat(64), Number.MAX_SAFE_INTEGER, portQa.sessionId);
  db.raw.prepare(`INSERT INTO sync_account_qa_sessions
    (id, credential_verifier, enrollment_id, scope, account_id, app_id, app_device_id,
     parent_session_id, created_at, expires_at, last_used_at, revoked_at, generation)
    VALUES (?, ?, 'join-enrollment', 'port', 'join-account', NULL, NULL, NULL, 1, ?, 1, NULL, 1)`)
    .run(portQa.sessionId, await qaCredentialVerifier(portQa.credential, qaPepper), Number.MAX_SAFE_INTEGER);
  return {
    db, repository: createD1AppJoinRepository(db), qaSessionId: portQa.sessionId,
    identity: { accountId: 'join-account', accountDeviceId: issuer.deviceId, accountState: 'active', recoveryVersion: 1, generation: 1 }
  };
}

async function issue(fixture, appId = 'pitch', now = 100) {
  const joinCode = createAppJoinCode();
  const codeVerifier = await appJoinCodeVerifier(joinCode, joinPepper);
  const input = {
    operationId: crypto.randomUUID(), invitationId: crypto.randomUUID(), appId, codeVerifier,
    qaIssuerSessionId: fixture.qaSessionId, now
  };
  input.requestFingerprint = await accountOperationFingerprint([
    'app-join-issue', fixture.identity.accountId, fixture.identity.accountDeviceId,
    appId, input.invitationId, codeVerifier
  ]);
  return { joinCode, input, result: await fixture.repository.issue(fixture.identity, input) };
}

async function consumeInput(issued, appId = 'pitch', overrides = {}) {
  const account = createAccountCredential();
  const app = await createIdentityMaterial(appPepper);
  const qa = createQaCredential();
  const input = {
    operationId: crypto.randomUUID(), appId, codeVerifier: issued.input.codeVerifier,
    accountDeviceId: account.deviceId,
    accountCredentialVerifier: await accountCredentialVerifier(account.credential, accountPepper),
    appDeviceId: app.deviceId, appCredentialVerifier: app.credentialVerifier,
    qaSessionId: qa.sessionId, qaCredentialVerifier: await qaCredentialVerifier(qa.credential, qaPepper),
    syncUserId: crypto.randomUUID(), consumeMode: 'new_app', deviceLabel: 'App',
    accountRecoveryPepper: recoveryPepper, now: 200, ...overrides
  };
  input.requestFingerprint = await accountOperationFingerprint([
    'app-join-consume', input.appId, input.codeVerifier, input.accountDeviceId,
    input.appDeviceId, input.accountCredentialVerifier, input.appCredentialVerifier,
    input.consumeMode
  ]);
  return input;
}

async function deleteAccount(fixture, now = 300) {
  const lifecycle = createD1AccountLifecycleRepository(fixture.db);
  const issueInput = {
    operationId: crypto.randomUUID(), requestFingerprint: '1'.repeat(64),
    intentId: crypto.randomUUID(), intentVerifier: '2'.repeat(64),
    scope: 'account', appId: null, now
  };
  const intent = await lifecycle.issueDeleteIntent(fixture.identity, issueInput);
  assert.equal(intent.status, 'issued');
  return lifecycle.commitDelete(fixture.identity, {
    operationId: crypto.randomUUID(), requestFingerprint: '3'.repeat(64),
    intentId: issueInput.intentId, intentVerifier: issueInput.intentVerifier,
    scope: 'account', appId: null, now: now + 1
  });
}

test('app join is a five-minute verifier-only Account/app/issuer-bound invitation', async () => {
  const fixture = await setup();
  const issued = await issue(fixture);
  assert.equal(issued.result.status, 'issued');
  assert.equal(issued.result.expiresAt, 100 + ACCOUNT_APP_JOIN_TTL_MS);
  const row = fixture.db.raw.prepare(`SELECT * FROM sync_app_join_invitations`).get();
  assert.equal(row.code_verifier, issued.input.codeVerifier);
  assert.equal(JSON.stringify(row).includes(issued.joinCode), false);
  assert.equal(row.account_id, fixture.identity.accountId);
  assert.equal(row.target_app_id, 'pitch');
  assert.equal(row.created_by_account_device_id, fixture.identity.accountDeviceId);
  fixture.db.close();
});

test('app join issuer remains fail-closed for unbound and wrong-Account QA sessions', async () => {
  const fixture = await setup();
  fixture.db.raw.prepare('UPDATE sync_account_qa_sessions SET account_id = NULL WHERE id = ?')
    .run(fixture.qaSessionId);
  assert.equal((await issue(fixture)).result.status, 'membership_unavailable');

  fixture.db.raw.prepare(`
    INSERT INTO sync_accounts (
      id, state, recovery_version, recovery_verifier, generation,
      created_at, updated_at, recovery_created_at, recovery_rotated_at
    ) VALUES ('other-account', 'active', 1, ?, 1, 1, 1, 1, 1)
  `).run('f'.repeat(64));
  fixture.db.raw.prepare('UPDATE sync_account_qa_sessions SET account_id = ? WHERE id = ?')
    .run('other-account', fixture.qaSessionId);
  assert.equal((await issue(fixture)).result.status, 'membership_unavailable');
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) count FROM sync_app_join_invitations')
    .get().count, 0);
  fixture.db.close();
});

test('app join consume is one-time, response-loss safe and creates distinct Account/app credentials', async () => {
  const fixture = await setup();
  const issued = await issue(fixture);
  const input = await consumeInput(issued);
  const first = await fixture.repository.consume(input);
  assert.equal(first.status, 'activated');
  assert.notEqual(first.accountDeviceId, first.appDeviceId);
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) count FROM sync_users').get().count, 1);
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) count FROM sync_datasets').get().count, 0);
  assert.equal(fixture.db.raw.prepare('SELECT state FROM sync_account_memberships').get().state, 'active');
  const retry = await fixture.repository.consume({ ...input, now: 201 });
  assert.equal(retry.status, 'activated');
  assert.equal(retry.alreadyActivated, true);
  const replay = await consumeInput(issued);
  assert.equal((await fixture.repository.consume(replay)).status, 'used');
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) count FROM sync_users').get().count, 1);
  fixture.db.close();
});

test('wrong app, expiry and cancellation fail before any app identity is created', async () => {
  const wrong = await setup();
  const wrongIssued = await issue(wrong);
  assert.equal((await wrong.repository.consume(await consumeInput(wrongIssued, 'rhythm'))).status, 'wrong_app');
  assert.equal(wrong.db.raw.prepare('SELECT COUNT(*) count FROM sync_users').get().count, 0);
  wrong.db.close();

  const expired = await setup();
  const expiredIssued = await issue(expired, 'pitch', 1);
  assert.equal((await expired.repository.consume(await consumeInput(expiredIssued, 'pitch', {
    now: 1 + ACCOUNT_APP_JOIN_TTL_MS
  }))).status, 'expired');
  expired.db.close();

  const cancelled = await setup();
  const cancelledIssued = await issue(cancelled);
  assert.equal((await cancelled.repository.cancel(cancelled.identity, cancelledIssued.input.invitationId, 150)).status, 'cancelled');
  assert.equal((await cancelled.repository.consume(await consumeInput(cancelledIssued))).status, 'cancelled');
  cancelled.db.close();
});

test('a recovered Account can reconnect to an existing ready dataset without recreating it', async () => {
  const fixture = await setup('pitch');
  const firstInvitation = await issue(fixture, 'pitch', 100);
  const firstInput = await consumeInput(firstInvitation, 'pitch');
  const first = await fixture.repository.consume(firstInput);
  assert.equal(first.status, 'activated');
  fixture.db.raw.prepare(`
    INSERT INTO sync_datasets (
      user_id, app_id, state, schema_version, record_count, manifest_hash,
      min_change_seq, initialized_at, updated_at, last_change_seq
    ) VALUES (?, 'pitch', 'ready', 1, 0, ?, 0, 250, 250, 0)
  `).run(first.syncUserId, '1'.repeat(64));

  const reconnectInvitation = await issue(fixture, 'pitch', 300);
  const reconnectInput = await consumeInput(reconnectInvitation, 'pitch', { now: 350 });
  const reconnected = await fixture.repository.consume(reconnectInput);
  assert.equal(reconnected.status, 'activated');
  assert.equal(reconnected.syncUserId, first.syncUserId);
  assert.notEqual(reconnected.appDeviceId, first.appDeviceId);
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) count FROM sync_users').get().count, 1);
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) count FROM sync_datasets').get().count, 1);
  assert.equal(fixture.db.raw.prepare(
    'SELECT COUNT(*) count FROM sync_devices WHERE user_id = ? AND revoked_at IS NULL'
  ).get(first.syncUserId).count, 2);
  const retry = await fixture.repository.consume({ ...reconnectInput, now: 351 });
  assert.equal(retry.alreadyActivated, true);
  fixture.db.close();
});

test('Account Delete versus Join has one ordered result and never leaves a live joined credential', async () => {
  const deleteFirst = await setup();
  const cancelledInvitation = await issue(deleteFirst);
  assert.equal((await deleteAccount(deleteFirst)).status, 'deleting');
  assert.equal((await deleteFirst.repository.consume(
    await consumeInput(cancelledInvitation, 'pitch', { now: 400 })
  )).status, 'cancelled');
  assert.equal(deleteFirst.db.raw.prepare('SELECT COUNT(*) count FROM sync_users').get().count, 0);
  deleteFirst.db.close();

  const joinFirst = await setup();
  const consumedInvitation = await issue(joinFirst);
  assert.equal((await joinFirst.repository.consume(await consumeInput(consumedInvitation))).status, 'activated');
  assert.equal((await deleteAccount(joinFirst)).status, 'deleting');
  assert.equal(joinFirst.db.raw.prepare(
    'SELECT COUNT(*) count FROM sync_account_devices WHERE revoked_at IS NULL'
  ).get().count, 0);
  assert.equal(joinFirst.db.raw.prepare(
    'SELECT COUNT(*) count FROM sync_devices WHERE revoked_at IS NULL'
  ).get().count, 0);
  assert.equal(joinFirst.db.raw.prepare('SELECT state FROM sync_users').get().state, 'deleting');
  joinFirst.db.close();
});
