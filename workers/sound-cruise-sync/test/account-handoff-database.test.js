import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountCredentialVerifier,
  accountHandoffVerifier,
  accountOperationFingerprint,
  createAccountCredential,
  createAccountHandoff
} from '../src/account-crypto.js';
import { createD1AccountRepository } from '../src/account-database.js';
import {
  ACCOUNT_HANDOFF_TTL_MS,
  createD1AccountHandoffRepository
} from '../src/account-handoff-database.js';
import { createIdentityMaterial } from '../src/crypto.js';
import { createQaCredential, qaCredentialVerifier } from '../src/account-qa-crypto.js';
import { createSqliteD1 } from './sqlite-d1.js';

const accountCredentialPepper = 'm3-account-credential-pepper-32-characters';
const accountRecoveryPepper = 'm3-account-recovery-pepper-at-least-32';
const handoffPepper = 'm3-account-handoff-pepper-at-least-32';
const appPepper = 'm3-existing-sync-app-pepper-at-least-32';
const qaPepper = 'm10-handoff-qa-credential-pepper-32-chars';

async function setup(appIds = ['chord']) {
  const db = createSqliteD1();
  const issuer = createAccountCredential();
  const memberships = appIds.map((appId) => ({ id: `membership-${appId}`, appId }));
  await createD1AccountRepository(db).createAccountBackbone({
    accountId: 'handoff-account',
    accountDeviceId: issuer.deviceId,
    recoveryVerifier: 'a'.repeat(64),
    accountCredentialVerifier: await accountCredentialVerifier(
      issuer.credential,
      accountCredentialPepper
    ),
    accountDeviceLabel: 'Issuer',
    memberships,
    now: 1
  });
  const portQa = createQaCredential();
  db.raw.prepare(`INSERT INTO sync_account_qa_enrollments
    (id, code_verifier, created_at, expires_at, consumed_at, cancelled_at, consumed_by_session_id)
    VALUES ('handoff-qa-enrollment', ?, 1, ?, 1, NULL, ?)`)
    .run('8'.repeat(64), Number.MAX_SAFE_INTEGER, portQa.sessionId);
  db.raw.prepare(`INSERT INTO sync_account_qa_sessions
    (id, credential_verifier, enrollment_id, scope, account_id, app_id, app_device_id,
     parent_session_id, created_at, expires_at, last_used_at, revoked_at, generation)
    VALUES (?, ?, 'handoff-qa-enrollment', 'port', 'handoff-account', NULL, NULL, NULL, 1, ?, 1, NULL, 1)`)
    .run(portQa.sessionId, await qaCredentialVerifier(portQa.credential, qaPepper), Number.MAX_SAFE_INTEGER);
  return {
    db,
    repository: createD1AccountHandoffRepository(db),
    qaSessionId: portQa.sessionId,
    identity: {
      accountId: 'handoff-account',
      accountDeviceId: issuer.deviceId,
      accountState: 'active',
      recoveryVersion: 1,
      generation: 1
    }
  };
}

async function issue(fixture, appId = 'chord', now = 100) {
  const material = createAccountHandoff();
  const verifier = await accountHandoffVerifier(material.handoffToken, handoffPepper);
  const operationId = crypto.randomUUID();
  const fingerprint = await accountOperationFingerprint([
    'issue', fixture.identity.accountId, fixture.identity.accountDeviceId,
    appId, material.handoffId, verifier
  ]);
  const result = await fixture.repository.issue(fixture.identity, {
    operationId,
    appId,
    handoffId: material.handoffId,
    handoffVerifier: verifier,
    requestFingerprint: fingerprint,
    qaIssuerSessionId: fixture.qaSessionId,
    now
  });
  return { material, verifier, operationId, fingerprint, result };
}

async function activateMembership(fixture, appId = 'pitch', provenance = 'qa') {
  const userId = `active-user-${appId}`;
  const appDeviceId = `active-device-${appId}`;
  const accountDeviceId = `active-account-device-${appId}`;
  fixture.db.raw.prepare(`UPDATE sync_accounts SET admission_provenance = ? WHERE id = ?`)
    .run(provenance, fixture.identity.accountId);
  fixture.db.raw.prepare(`INSERT INTO sync_users
    (id,state,recovery_version,recovery_verifier,created_at,updated_at,recovery_created_at,recovery_rotated_at)
    VALUES (?, 'active', 1, ?, 1, 1, 1, 1)`).run(userId, '5'.repeat(64));
  fixture.db.raw.prepare(`INSERT INTO sync_devices
    (id,user_id,app_id,credential_version,credential_verifier,label,last_cursor,created_at,last_seen_at,paired_at)
    VALUES (?, ?, ?, 1, ?, 'Existing', 0, 1, 1, 1)`)
    .run(appDeviceId, userId, appId, '6'.repeat(64));
  fixture.db.raw.prepare(`INSERT INTO sync_account_devices
    (id,account_id,credential_version,credential_verifier,label,created_at,last_seen_at)
    VALUES (?, ?, 1, ?, 'Existing app', 1, 1)`)
    .run(accountDeviceId, fixture.identity.accountId, '7'.repeat(64));
  fixture.db.raw.prepare(`UPDATE sync_account_memberships
    SET state = 'active', sync_user_id = ?, activated_at = 2, updated_at = 2
    WHERE id = ?`).run(userId, `membership-${appId}`);
  fixture.db.raw.prepare(`INSERT INTO sync_datasets
    (user_id,app_id,state,schema_version,record_count,manifest_hash,min_change_seq,last_change_seq,initialized_at,updated_at)
    VALUES (?, ?, 'ready', 1, 3, ?, 0, 0, 2, 2)`)
    .run(userId, appId, '0'.repeat(64));
  fixture.db.raw.prepare(`INSERT INTO sync_account_managed_users
    (sync_user_id,account_id,membership_id,app_id,created_at)
    VALUES (?, ?, ?, ?, 2)`)
    .run(userId, fixture.identity.accountId, `membership-${appId}`, appId);
  fixture.db.raw.prepare(`INSERT INTO sync_membership_device_links
    (account_id,membership_id,app_device_id,account_device_id,linked_at)
    VALUES (?, ?, ?, ?, 2)`)
    .run(fixture.identity.accountId, `membership-${appId}`, appDeviceId, accountDeviceId);
  return { userId, appDeviceId, accountDeviceId };
}

async function issueRejoin(fixture, appId = 'pitch', provenance = 'qa', now = 100) {
  const material = createAccountHandoff();
  const verifier = await accountHandoffVerifier(material.handoffToken, handoffPepper);
  const operationId = crypto.randomUUID();
  const fingerprint = await accountOperationFingerprint([
    'issue-rejoin', fixture.identity.accountId, fixture.identity.accountDeviceId,
    appId, material.handoffId, verifier, provenance
  ]);
  const result = await fixture.repository.issue(fixture.identity, {
    operationId, appId, handoffId: material.handoffId, handoffVerifier: verifier,
    requestFingerprint: fingerprint, admissionProvenance: provenance,
    qaIssuerSessionId: provenance === 'qa' ? fixture.qaSessionId : null, now
  });
  return { material, verifier, operationId, fingerprint, result };
}

async function consumeInput(issued, appId = 'chord', overrides = {}) {
  const account = createAccountCredential();
  const app = await createIdentityMaterial(appPepper);
  const operationId = crypto.randomUUID();
  const qa = createQaCredential();
  const accountVerifier = await accountCredentialVerifier(account.credential, accountCredentialPepper);
  const fingerprint = await accountOperationFingerprint([
    'consume', appId, issued.material.handoffId, account.deviceId,
    app.deviceId, accountVerifier, app.credentialVerifier
  ]);
  return {
    operationId,
    appId,
    handoffId: issued.material.handoffId,
    handoffVerifier: issued.verifier,
    requestFingerprint: fingerprint,
    accountDeviceId: account.deviceId,
    accountCredentialVerifier: accountVerifier,
    appDeviceId: app.deviceId,
    appCredentialVerifier: app.credentialVerifier,
    qaSessionId: qa.sessionId,
    qaCredentialVerifier: await qaCredentialVerifier(qa.credential, qaPepper),
    syncUserId: crypto.randomUUID(),
    consumeMode: 'new_app',
    deviceLabel: 'Target',
    accountRecoveryPepper,
    now: 200,
    ...overrides
  };
}

test('handoff issue persists a short verifier-only, Account/app/issuer-bound grant', async () => {
  const fixture = await setup();
  const issued = await issue(fixture);
  assert.equal(issued.result.status, 'issued');
  assert.equal(issued.result.expiresAt, 100 + ACCOUNT_HANDOFF_TTL_MS);
  const row = fixture.db.raw.prepare(`
    SELECT handoff_verifier, account_id, membership_id,
           created_by_account_device_id, issue_operation_id
    FROM sync_membership_handoffs WHERE handoff_id = ?
  `).get(issued.material.handoffId);
  assert.equal(row.handoff_verifier, issued.verifier);
  assert.equal(row.handoff_verifier.includes(issued.material.handoffToken), false);
  assert.equal(JSON.stringify(row).includes(issued.material.handoffToken), false);
  assert.equal(row.account_id, fixture.identity.accountId);
  assert.equal(row.membership_id, 'membership-chord');
  assert.equal(row.created_by_account_device_id, fixture.identity.accountDeviceId);

  const retried = await fixture.repository.issue(fixture.identity, {
    operationId: issued.operationId,
    appId: 'chord',
    handoffId: issued.material.handoffId,
    handoffVerifier: issued.verifier,
    requestFingerprint: issued.fingerprint,
    now: 101
  });
  assert.equal(retried.status, 'issued');
  assert.equal(retried.alreadyIssued, true);
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_membership_handoffs').get().count, 1);
  fixture.db.close();
});

test('consume atomically reserves separate app and Account credentials without creating a dataset', async () => {
  const fixture = await setup();
  const issued = await issue(fixture);
  const input = await consumeInput(issued);
  const result = await fixture.repository.consume(input);
  assert.equal(result.status, 'activated');
  assert.equal(result.alreadyActivated, false);
  assert.deepEqual({ ...fixture.db.raw.prepare(`
    SELECT state, sync_user_id, recovery_mode, generation
    FROM sync_account_memberships WHERE id = 'membership-chord'
  `).get() }, {
    state: 'active', sync_user_id: input.syncUserId, recovery_mode: 'account', generation: 2
  });
  assert.deepEqual({ ...fixture.db.raw.prepare(`
    SELECT app_device_id, account_device_id
    FROM sync_membership_device_links WHERE membership_id = 'membership-chord'
  `).get() }, {
    app_device_id: input.appDeviceId, account_device_id: input.accountDeviceId
  });
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_account_managed_users').get().count, 1);
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_datasets').get().count, 0,
    'M3 activation never starts app migration or creates a dataset');
  assert.equal(fixture.db.raw.prepare('SELECT credential_verifier FROM sync_devices WHERE id = ?')
    .get(input.appDeviceId).credential_verifier, input.appCredentialVerifier);
  const qaSession = fixture.db.raw.prepare(`
    SELECT scope, account_id, app_id, app_device_id, parent_session_id, credential_verifier
    FROM sync_account_qa_sessions WHERE id = ?
  `).get(input.qaSessionId);
  assert.deepEqual({ ...qaSession }, {
    scope: 'app', account_id: fixture.identity.accountId, app_id: 'chord',
    app_device_id: input.appDeviceId, parent_session_id: fixture.qaSessionId,
    credential_verifier: input.qaCredentialVerifier
  });
  assert.equal(fixture.db.raw.prepare('SELECT credential_verifier FROM sync_account_devices WHERE id = ?')
    .get(input.accountDeviceId).credential_verifier, input.accountCredentialVerifier);

  const retry = await fixture.repository.consume({ ...input, syncUserId: crypto.randomUUID(), now: 300 });
  assert.equal(retry.status, 'activated');
  assert.equal(retry.alreadyActivated, true);
  assert.equal(retry.syncUserId, input.syncUserId);
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 1);
  assert.equal((await fixture.repository.consume({
    ...input,
    operationId: crypto.randomUUID(),
    requestFingerprint: 'f'.repeat(64),
    now: 301
  })).status, 'used');
  fixture.db.close();
});

test('existing Chord consume claims only an Account device and leaves M4 bridge authority pending', async () => {
  const fixture = await setup();
  const issued = await issue(fixture);
  const legacy = await createIdentityMaterial(appPepper);
  fixture.db.raw.prepare(`
    INSERT INTO sync_users (id, state, recovery_version, recovery_verifier, created_at, updated_at,
      deleted_at, recovery_created_at, recovery_rotated_at, delete_requested_at, purge_after)
    VALUES (?, 'active', 1, ?, 1, 1, NULL, 1, 1, NULL, NULL)
  `).run(legacy.userId, 'd'.repeat(64));
  fixture.db.raw.prepare(`
    INSERT INTO sync_devices (id, user_id, app_id, credential_version, credential_verifier, label,
      last_cursor, created_at, last_seen_at, revoked_at, pairing_pending_at, paired_at)
    VALUES (?, ?, 'chord', 1, ?, 'Legacy Chord', 0, 1, 1, NULL, NULL, 1)
  `).run(legacy.deviceId, legacy.userId, legacy.credentialVerifier);
  fixture.db.raw.prepare(`
    INSERT INTO sync_datasets (user_id, app_id, state, schema_version, record_count, manifest_hash,
      min_change_seq, last_change_seq, initialized_at, updated_at)
    VALUES (?, 'chord', 'ready', 1, 0, ?, 0, 0, 1, 1)
  `).run(legacy.userId, '0'.repeat(64));

  const input = await consumeInput(issued, 'chord', {
    consumeMode: 'existing_chord',
    appDeviceId: legacy.deviceId,
    appCredentialVerifier: legacy.credentialVerifier,
    syncUserId: legacy.userId
  });
  const result = await fixture.repository.consume(input);
  assert.equal(result.status, 'bridge_required');
  assert.deepEqual({ ...fixture.db.raw.prepare(`
    SELECT state, sync_user_id, recovery_mode FROM sync_account_memberships
    WHERE id = 'membership-chord'
  `).get() }, { state: 'pending', sync_user_id: null, recovery_mode: 'account' });
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 1);
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_devices').get().count, 1);
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_account_managed_users').get().count, 0);
  assert.equal(fixture.db.raw.prepare('SELECT consume_mode FROM sync_membership_handoffs').get().consume_mode,
    'existing_chord');
  const retry = await fixture.repository.resolveConsumeRetry(input);
  assert.equal(retry.status, 'bridge_required');
  assert.equal(retry.syncUserId, legacy.userId);
  fixture.db.close();
});

test('wrong app, expiry, cancellation and wrong issuer are fail-closed without partial identities', async () => {
  const wrongAppFixture = await setup();
  const wrongAppIssue = await issue(wrongAppFixture);
  const wrongAppInput = await consumeInput(wrongAppIssue, 'pitch');
  assert.equal((await wrongAppFixture.repository.consume(wrongAppInput)).status, 'wrong_app');
  const wrongVerifierInput = await consumeInput(wrongAppIssue, 'chord', {
    handoffVerifier: '0'.repeat(64)
  });
  assert.equal((await wrongAppFixture.repository.consume(wrongVerifierInput)).status, 'invalid');
  assert.equal(wrongAppFixture.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 0);
  wrongAppFixture.db.close();

  const expiredFixture = await setup();
  const expiredIssue = await issue(expiredFixture, 'chord', 1);
  const expiredInput = await consumeInput(expiredIssue, 'chord', {
    now: 1 + ACCOUNT_HANDOFF_TTL_MS
  });
  assert.equal((await expiredFixture.repository.consume(expiredInput)).status, 'expired');
  expiredFixture.db.close();

  const cancelledFixture = await setup();
  const cancelledIssue = await issue(cancelledFixture);
  const wrongIdentity = { ...cancelledFixture.identity, accountDeviceId: crypto.randomUUID() };
  assert.equal((await cancelledFixture.repository.cancel(
    wrongIdentity,
    cancelledIssue.material.handoffId,
    150
  )).status, 'not_found');
  assert.equal((await cancelledFixture.repository.cancel(
    cancelledFixture.identity,
    cancelledIssue.material.handoffId,
    151
  )).status, 'cancelled');
  assert.equal((await cancelledFixture.repository.consume(
    await consumeInput(cancelledIssue)
  )).status, 'cancelled');
  assert.equal(cancelledFixture.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 0);
  cancelledFixture.db.close();

  const revokedFixture = await setup();
  const revokedIssue = await issue(revokedFixture);
  revokedFixture.db.raw.prepare(`
    UPDATE sync_account_devices SET revoked_at = 150 WHERE id = ?
  `).run(revokedFixture.identity.accountDeviceId);
  assert.equal((await revokedFixture.repository.consume(
    await consumeInput(revokedIssue)
  )).status, 'membership_unavailable');
  assert.equal(revokedFixture.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 0);
  revokedFixture.db.close();

  const revokedQaFixture = await setup();
  const revokedQaIssue = await issue(revokedQaFixture);
  revokedQaFixture.db.raw.prepare(`
    UPDATE sync_account_qa_sessions SET revoked_at = 150 WHERE id = ?
  `).run(revokedQaFixture.qaSessionId);
  assert.equal((await revokedQaFixture.repository.consume(
    await consumeInput(revokedQaIssue)
  )).status, 'qa_admission_unavailable');
  assert.equal(revokedQaFixture.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 0);
  assert.equal(revokedQaFixture.db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_account_qa_sessions WHERE scope = 'app'
  `).get().count, 0);
  revokedQaFixture.db.close();
});

test('same-handoff consume race activates exactly one candidate', async () => {
  const fixture = await setup();
  const issued = await issue(fixture);
  const first = await consumeInput(issued);
  const second = await consumeInput(issued);
  const results = await Promise.all([
    fixture.repository.consume(first),
    fixture.repository.consume(second)
  ]);
  assert.equal(results.filter((result) => result.status === 'activated').length, 1);
  assert.equal(results.filter((result) => result.status === 'used').length, 1);
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 1);
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_account_devices').get().count, 2);
  fixture.db.close();
});

test('active membership handoff provisions a new environment on the same ready dataset', async () => {
  const fixture = await setup(['pitch']);
  const active = await activateMembership(fixture, 'pitch');
  const issued = await issueRejoin(fixture);
  assert.equal(issued.result.status, 'issued');
  const grant = fixture.db.raw.prepare(`SELECT handoff_kind, expected_sync_user_id,
    admission_provenance FROM sync_membership_handoffs WHERE handoff_id = ?`)
    .get(issued.material.handoffId);
  assert.deepEqual({ ...grant }, {
    handoff_kind: 'rejoin', expected_sync_user_id: active.userId, admission_provenance: 'qa'
  });
  const input = await consumeInput(issued, 'pitch');
  const result = await fixture.repository.consume(input);
  assert.equal(result.status, 'activated');
  assert.equal(result.syncUserId, active.userId);
  assert.equal(result.handoffKind, 'rejoin');
  assert.equal(fixture.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 1);
  assert.equal(fixture.db.raw.prepare(`SELECT COUNT(*) AS count FROM sync_datasets
    WHERE user_id = ? AND app_id = 'pitch'`).get(active.userId).count, 1);
  assert.equal(fixture.db.raw.prepare(`SELECT COUNT(*) AS count FROM sync_devices
    WHERE user_id = ? AND app_id = 'pitch' AND revoked_at IS NULL`).get(active.userId).count, 2);
  const retry = await fixture.repository.consume({ ...input, now: 201 });
  assert.equal(retry.alreadyActivated, true);
  assert.equal(fixture.db.raw.prepare(`SELECT COUNT(*) AS count FROM sync_devices
    WHERE user_id = ?`).get(active.userId).count, 2);
  fixture.db.close();
});

test('production rejoin uses no QA session and rejects provenance, lifecycle and dataset drift', async () => {
  const fixture = await setup(['rhythm']);
  const active = await activateMembership(fixture, 'rhythm', 'production');
  const issued = await issueRejoin(fixture, 'rhythm', 'production');
  assert.equal(issued.result.status, 'issued');
  const input = await consumeInput(issued, 'rhythm', {
    admissionProvenance: 'production', qaSessionId: null, qaCredentialVerifier: null
  });
  assert.equal((await fixture.repository.consume({ ...input, admissionProvenance: 'qa' })).status, 'invalid');
  fixture.db.raw.prepare(`UPDATE sync_datasets SET state = 'initializing'
    WHERE user_id = ? AND app_id = 'rhythm'`).run(active.userId);
  assert.equal((await fixture.repository.consume(input)).status, 'membership_unavailable');
  fixture.db.raw.prepare(`UPDATE sync_datasets SET state = 'ready'
    WHERE user_id = ? AND app_id = 'rhythm'`).run(active.userId);
  fixture.db.raw.prepare(`UPDATE sync_accounts SET state = 'deleting', delete_requested_at = 150,
    purge_after = 999 WHERE id = ?`).run(fixture.identity.accountId);
  assert.equal((await fixture.repository.consume(input)).status, 'membership_unavailable');
  assert.equal(fixture.db.raw.prepare(`SELECT COUNT(*) AS count FROM sync_devices
    WHERE user_id = ?`).get(active.userId).count, 1);
  fixture.db.close();
});

test('Auto Rejoin refuses an eleventh active environment without revoking an older device', async () => {
  const fixture = await setup(['fretboard']);
  const active = await activateMembership(fixture, 'fretboard');
  for (let index = 2; index <= 10; index += 1) {
    const appDeviceId = `fretboard-device-${index}`;
    const accountDeviceId = `fretboard-account-device-${index}`;
    fixture.db.raw.prepare(`INSERT INTO sync_devices
      (id,user_id,app_id,credential_version,credential_verifier,label,last_cursor,created_at,last_seen_at,paired_at)
      VALUES (?, ?, 'fretboard', 1, ?, 'Extra', 0, 1, 1, 1)`)
      .run(appDeviceId, active.userId, index.toString(16).padStart(64, '0'));
    fixture.db.raw.prepare(`INSERT INTO sync_account_devices
      (id,account_id,credential_version,credential_verifier,label,created_at,last_seen_at)
      VALUES (?, ?, 1, ?, 'Extra', 1, 1)`)
      .run(accountDeviceId, fixture.identity.accountId, (index + 20).toString(16).padStart(64, '0'));
    fixture.db.raw.prepare(`INSERT INTO sync_membership_device_links
      (account_id,membership_id,app_device_id,account_device_id,linked_at)
      VALUES (?, 'membership-fretboard', ?, ?, 2)`)
      .run(fixture.identity.accountId, appDeviceId, accountDeviceId);
  }
  const issued = await issueRejoin(fixture, 'fretboard');
  const result = await fixture.repository.consume(await consumeInput(issued, 'fretboard'));
  assert.equal(result.status, 'device_limit');
  assert.equal(fixture.db.raw.prepare(`SELECT COUNT(*) AS count FROM sync_devices
    WHERE user_id = ? AND revoked_at IS NULL`).get(active.userId).count, 10);
  assert.equal(fixture.db.raw.prepare(`SELECT COUNT(*) AS count FROM sync_devices
    WHERE user_id = ? AND revoked_at IS NOT NULL`).get(active.userId).count, 0);
  fixture.db.close();
});
