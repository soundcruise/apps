import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountCredentialVerifier,
  accountOperationFingerprint,
  createAccountCredential,
  createAppJoinCode,
  portJoinCodeVerifier
} from '../src/account-crypto.js';
import { createD1AccountRepository } from '../src/account-database.js';
import {
  ACCOUNT_PORT_JOIN_TTL_MS,
  createD1PortJoinRepository
} from '../src/account-port-join-database.js';
import { createQaCredential, qaCredentialVerifier } from '../src/account-qa-crypto.js';
import { createSqliteD1 } from './sqlite-d1.js';

const accountPepper = 'm15-account-credential-pepper-32-characters';
const joinPepper = 'm15-account-port-join-pepper-32-characters';
const qaPepper = 'm15-account-qa-pepper-32-characters';

async function setup() {
  const db = createSqliteD1();
  const issuer = createAccountCredential();
  await createD1AccountRepository(db).createAccountBackbone({
    accountId: 'port-join-account', accountDeviceId: issuer.deviceId,
    recoveryVerifier: 'a'.repeat(64),
    accountCredentialVerifier: await accountCredentialVerifier(issuer.credential, accountPepper),
    accountDeviceLabel: 'Cruise Port',
    memberships: [
      { id: 'port-join-chord', appId: 'chord' },
      { id: 'port-join-pitch', appId: 'pitch' },
      { id: 'port-join-fretboard', appId: 'fretboard' },
      { id: 'port-join-rhythm', appId: 'rhythm' }
    ],
    admissionProvenance: 'qa', now: 1
  });
  const portQa = createQaCredential();
  db.raw.prepare(`INSERT INTO sync_account_qa_enrollments
    (id, code_verifier, created_at, expires_at, consumed_at, cancelled_at, consumed_by_session_id)
    VALUES ('port-join-enrollment', ?, 1, ?, 1, NULL, ?)`)
    .run('8'.repeat(64), Number.MAX_SAFE_INTEGER, portQa.sessionId);
  db.raw.prepare(`INSERT INTO sync_account_qa_sessions
    (id, credential_verifier, enrollment_id, scope, account_id, app_id, app_device_id,
     parent_session_id, created_at, expires_at, last_used_at, revoked_at, generation)
    VALUES (?, ?, 'port-join-enrollment', 'port', 'port-join-account', NULL, NULL,
      NULL, 1, ?, 1, NULL, 1)`)
    .run(portQa.sessionId, await qaCredentialVerifier(portQa.credential, qaPepper),
      Number.MAX_SAFE_INTEGER);
  return {
    db,
    repository: createD1PortJoinRepository(db),
    identity: {
      accountId: 'port-join-account', accountDeviceId: issuer.deviceId,
      accountState: 'active', recoveryVersion: 1, generation: 1
    },
    qaSessionId: portQa.sessionId
  };
}

async function issue(fixture, now = 100) {
  const joinCode = createAppJoinCode();
  const codeVerifier = await portJoinCodeVerifier(joinCode, joinPepper);
  const input = {
    operationId: crypto.randomUUID(), invitationId: crypto.randomUUID(), codeVerifier,
    admissionProvenance: 'qa', qaIssuerSessionId: fixture.qaSessionId, now
  };
  input.requestFingerprint = await accountOperationFingerprint([
    'port-join-issue', fixture.identity.accountId, fixture.identity.accountDeviceId,
    input.invitationId, input.codeVerifier, input.admissionProvenance
  ]);
  return { joinCode, input, result: await fixture.repository.issue(fixture.identity, input) };
}

async function consumeInput(issued, overrides = {}) {
  const account = createAccountCredential();
  const qa = createQaCredential();
  const input = {
    operationId: crypto.randomUUID(), codeVerifier: issued.input.codeVerifier,
    accountDeviceId: account.deviceId,
    accountCredentialVerifier: await accountCredentialVerifier(account.credential, accountPepper),
    admissionProvenance: 'qa', qaSessionId: qa.sessionId,
    qaCredentialVerifier: await qaCredentialVerifier(qa.credential, qaPepper),
    deviceLabel: 'Cruise Port', now: 200, ...overrides
  };
  input.requestFingerprint = await accountOperationFingerprint([
    'port-join-consume', input.codeVerifier, input.accountDeviceId,
    input.accountCredentialVerifier, input.qaCredentialVerifier || '',
    input.deviceLabel, input.admissionProvenance
  ]);
  return input;
}

test('Port join is five-minute, verifier-only and bound to its Account issuer', async () => {
  const fixture = await setup();
  const issued = await issue(fixture);
  assert.equal(issued.result.status, 'issued');
  assert.equal(issued.result.expiresAt, 100 + ACCOUNT_PORT_JOIN_TTL_MS);
  const row = fixture.db.raw.prepare('SELECT * FROM sync_port_join_invitations').get();
  assert.equal(row.code_verifier, issued.input.codeVerifier);
  assert.equal(JSON.stringify(row).includes(issued.joinCode), false);
  assert.equal(row.account_id, fixture.identity.accountId);
  assert.equal(row.created_by_account_device_id, fixture.identity.accountDeviceId);
  assert.equal(row.expected_recovery_version, 1);
  fixture.db.close();
});

test('Port join consumes once, survives response loss and changes no app control plane', async () => {
  const fixture = await setup();
  const issued = await issue(fixture);
  const input = await consumeInput(issued);
  const before = {
    memberships: fixture.db.raw.prepare('SELECT COUNT(*) count FROM sync_account_memberships').get().count,
    users: fixture.db.raw.prepare('SELECT COUNT(*) count FROM sync_users').get().count,
    datasets: fixture.db.raw.prepare('SELECT COUNT(*) count FROM sync_datasets').get().count,
    appDevices: fixture.db.raw.prepare('SELECT COUNT(*) count FROM sync_devices').get().count,
    recoveryVersion: fixture.db.raw.prepare('SELECT recovery_version FROM sync_accounts').get().recovery_version,
    generation: fixture.db.raw.prepare('SELECT generation FROM sync_accounts').get().generation
  };
  const first = await fixture.repository.consume(input);
  assert.equal(first.status, 'joined');
  assert.equal(first.alreadyJoined, false);
  assert.equal(fixture.db.raw.prepare(
    'SELECT COUNT(*) count FROM sync_account_devices WHERE revoked_at IS NULL'
  ).get().count, 2);
  const retry = await fixture.repository.consume({ ...input, now: 201 });
  assert.equal(retry.status, 'joined');
  assert.equal(retry.alreadyJoined, true);
  const replay = await consumeInput(issued);
  assert.equal((await fixture.repository.consume(replay)).status, 'used');
  assert.deepEqual({
    memberships: fixture.db.raw.prepare('SELECT COUNT(*) count FROM sync_account_memberships').get().count,
    users: fixture.db.raw.prepare('SELECT COUNT(*) count FROM sync_users').get().count,
    datasets: fixture.db.raw.prepare('SELECT COUNT(*) count FROM sync_datasets').get().count,
    appDevices: fixture.db.raw.prepare('SELECT COUNT(*) count FROM sync_devices').get().count,
    recoveryVersion: fixture.db.raw.prepare('SELECT recovery_version FROM sync_accounts').get().recovery_version,
    generation: fixture.db.raw.prepare('SELECT generation FROM sync_accounts').get().generation
  }, before);
  fixture.db.close();
});

test('expired, cancelled and revoked-issuer Port joins create no Account Device', async () => {
  const expired = await setup();
  const expiredIssue = await issue(expired, 1);
  assert.equal((await expired.repository.consume(await consumeInput(expiredIssue, {
    now: 1 + ACCOUNT_PORT_JOIN_TTL_MS
  }))).status, 'expired');
  assert.equal(expired.db.raw.prepare('SELECT COUNT(*) count FROM sync_account_devices').get().count, 1);
  expired.db.close();

  const cancelled = await setup();
  const cancelledIssue = await issue(cancelled);
  assert.equal((await cancelled.repository.cancel(
    cancelled.identity, cancelledIssue.input.invitationId, 150
  )).status, 'cancelled');
  assert.equal((await cancelled.repository.consume(await consumeInput(cancelledIssue))).status, 'cancelled');
  assert.equal(cancelled.db.raw.prepare('SELECT COUNT(*) count FROM sync_account_devices').get().count, 1);
  cancelled.db.close();

  const revoked = await setup();
  const revokedIssue = await issue(revoked);
  revoked.db.raw.prepare('UPDATE sync_account_devices SET revoked_at = 150 WHERE id = ?')
    .run(revoked.identity.accountDeviceId);
  assert.equal((await revoked.repository.consume(await consumeInput(revokedIssue))).status, 'issuer_unavailable');
  assert.equal(revoked.db.raw.prepare('SELECT COUNT(*) count FROM sync_account_devices').get().count, 1);
  revoked.db.close();
});

test('wrong Account authority, deleting Account and reused candidate identity fail closed', async () => {
  const fixture = await setup();
  const issued = await issue(fixture);
  const wrongIdentity = { ...fixture.identity, accountId: 'another-account' };
  assert.equal((await fixture.repository.status(wrongIdentity, issued.input.invitationId)).status, 'not_found');
  assert.equal((await fixture.repository.cancel(wrongIdentity, issued.input.invitationId, 150)).status, 'not_found');

  fixture.db.raw.prepare("UPDATE sync_accounts SET state = 'deleting' WHERE id = ?")
    .run(fixture.identity.accountId);
  assert.equal((await fixture.repository.consume(await consumeInput(issued))).status, 'issuer_unavailable');
  fixture.db.raw.prepare("UPDATE sync_accounts SET state = 'active' WHERE id = ?")
    .run(fixture.identity.accountId);

  const existing = createAccountCredential();
  fixture.db.raw.prepare(`INSERT INTO sync_account_devices
    (id, account_id, credential_version, credential_verifier, label, created_at, last_seen_at, revoked_at)
    VALUES (?, ?, 1, ?, 'Existing', 1, 1, NULL)`)
    .run(existing.deviceId, fixture.identity.accountId, 'f'.repeat(64));
  const reuse = await consumeInput(issued, { accountDeviceId: existing.deviceId });
  reuse.requestFingerprint = await accountOperationFingerprint([
    'port-join-consume', reuse.codeVerifier, reuse.accountDeviceId,
    reuse.accountCredentialVerifier, reuse.qaCredentialVerifier,
    reuse.deviceLabel, reuse.admissionProvenance
  ]);
  assert.equal((await fixture.repository.consume(reuse)).status, 'invalid');
  assert.equal(fixture.db.raw.prepare('SELECT consumed_at FROM sync_port_join_invitations').get().consumed_at, null);
  fixture.db.close();
});

test('issuer QA binding and Account generation changes invalidate Port join', async () => {
  const unbound = await setup();
  unbound.db.raw.prepare('UPDATE sync_account_qa_sessions SET account_id = NULL WHERE id = ?')
    .run(unbound.qaSessionId);
  assert.equal((await issue(unbound)).result.status, 'issuer_unavailable');
  unbound.db.close();

  const changed = await setup();
  const changedIssue = await issue(changed);
  changed.db.raw.prepare('UPDATE sync_accounts SET generation = generation + 1 WHERE id = ?')
    .run(changed.identity.accountId);
  assert.equal((await changed.repository.consume(await consumeInput(changedIssue))).status,
    'issuer_unavailable');
  assert.equal(changed.db.raw.prepare('SELECT COUNT(*) count FROM sync_account_devices').get().count, 1);
  changed.db.close();
});
