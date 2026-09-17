import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1AccountLifecycleRepository, ACCOUNT_LIFECYCLE } from '../src/account-lifecycle-database.js';
import { createD1AccountRepository } from '../src/account-database.js';
import { createD1AppJoinRepository } from '../src/account-join-database.js';
import { accountOperationFingerprint } from '../src/account-crypto.js';
import { createD1CleanupRepository } from '../src/cleanup-database.js';
import { createSqliteD1 } from './sqlite-d1.js';

const IDS = Object.freeze({
  account: '10000000-0000-4000-8000-000000000001',
  accountA: '10000000-0000-4000-8000-000000000002',
  accountB: '10000000-0000-4000-8000-000000000003',
  accountR: '10000000-0000-4000-8000-000000000004',
  chordMembership: '20000000-0000-4000-8000-000000000001',
  pitchMembership: '20000000-0000-4000-8000-000000000002',
  fretboardMembership: '20000000-0000-4000-8000-000000000003',
  rhythmMembership: '20000000-0000-4000-8000-000000000004',
  chordUser: '30000000-0000-4000-8000-000000000001',
  pitchUser: '30000000-0000-4000-8000-000000000002',
  fretboardUser: '30000000-0000-4000-8000-000000000003',
  rhythmUser: '30000000-0000-4000-8000-000000000004',
  chordDevice: '40000000-0000-4000-8000-000000000001',
  pitchDevice: '40000000-0000-4000-8000-000000000002',
  fretboardDevice: '40000000-0000-4000-8000-000000000003',
  rhythmDevice: '40000000-0000-4000-8000-000000000004',
  claim1: '50000000-0000-4000-8000-000000000001',
  claim2: '50000000-0000-4000-8000-000000000002',
  prepare1: '60000000-0000-4000-8000-000000000001',
  prepare2: '60000000-0000-4000-8000-000000000002',
  commit1: '70000000-0000-4000-8000-000000000001',
  commit2: '70000000-0000-4000-8000-000000000002',
  intent: '80000000-0000-4000-8000-000000000001',
  intentIssue: '90000000-0000-4000-8000-000000000001',
  intentCommit: '90000000-0000-4000-8000-000000000002',
  revoke: '90000000-0000-4000-8000-000000000003'
});

const hex = (character) => character.repeat(64);

function seedAccount(db, now = 1_000) {
  db.raw.prepare(`
    INSERT INTO sync_accounts (
      id, state, recovery_version, recovery_verifier, generation,
      created_at, updated_at, recovery_created_at, recovery_rotated_at
    ) VALUES (?, 'active', 1, ?, 1, ?, ?, ?, ?)
  `).run(IDS.account, hex('a'), now, now, now, now);
  for (const [id, verifier, label] of [
    [IDS.accountA, hex('b'), 'A'], [IDS.accountB, hex('c'), 'B']
  ]) {
    db.raw.prepare(`
      INSERT INTO sync_account_devices (
        id, account_id, credential_version, credential_verifier,
        label, created_at, last_seen_at, revoked_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?, NULL)
    `).run(id, IDS.account, verifier, label, now, now);
  }
  for (const [membershipId, userId, appId, appDevice, verifier, accountDevice] of [
    [IDS.chordMembership, IDS.chordUser, 'chord', IDS.chordDevice, hex('d'), IDS.accountA],
    [IDS.pitchMembership, IDS.pitchUser, 'pitch', IDS.pitchDevice, hex('e'), IDS.accountB],
    [IDS.fretboardMembership, IDS.fretboardUser, 'fretboard', IDS.fretboardDevice, hex('f'), IDS.accountA],
    [IDS.rhythmMembership, IDS.rhythmUser, 'rhythm', IDS.rhythmDevice, hex('0'), IDS.accountB]
  ]) {
    db.raw.prepare(`
      INSERT INTO sync_users (id, state, recovery_version, recovery_verifier, created_at, updated_at)
      VALUES (?, 'active', 1, ?, ?, ?)
    `).run(userId, hex({ chord: '1', pitch: '2', fretboard: '3', rhythm: '4' }[appId]), now, now);
    db.raw.prepare(`
      INSERT INTO sync_devices (
        id, user_id, app_id, credential_version, credential_verifier,
        label, last_cursor, created_at, last_seen_at, revoked_at,
        pairing_pending_at, paired_at
      ) VALUES (?, ?, ?, 1, ?, ?, 0, ?, ?, NULL, NULL, ?)
    `).run(appDevice, userId, appId, verifier, appId, now, now, now);
    db.raw.prepare(`
      INSERT INTO sync_datasets (
        user_id, app_id, state, schema_version, record_count, manifest_hash,
        min_change_seq, initialized_at, updated_at, last_change_seq
      ) VALUES (?, ?, 'ready', 1, 1, ?, 0, ?, ?, 1)
    `).run(userId, appId, hex({ chord: '5', pitch: '6', fretboard: '7', rhythm: '8' }[appId]), now, now);
    db.raw.prepare(`
      INSERT INTO sync_records (
        user_id, app_id, record_type, record_id, payload_json, payload_hash,
        revision, updated_at, deleted_at, updated_by_device_id, last_operation_id, schema_version
      ) VALUES (?, ?, 'settings', 'settings', '{}', ?, 1, ?, NULL, ?, ?, 1)
    `).run(userId, appId, hex('9'), now, appDevice, `seed-${appId}`);
    db.raw.prepare(`
      INSERT INTO sync_changes (
        user_id, app_id, record_type, record_id, revision, operation_id,
        operation_hash, payload_json, payload_hash, deleted_at, changed_at, schema_version
      ) VALUES (?, ?, 'settings', 'settings', 1, ?, ?, '{}', ?, NULL, ?, 1)
    `).run(userId, appId, `seed-${appId}`, hex('a'), hex('9'), now);
    db.raw.prepare(`
      INSERT INTO sync_account_memberships (
        id, account_id, app_id, state, sync_user_id, recovery_mode,
        generation, created_at, activated_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, 'active', ?, 'account', 1, ?, ?, ?, NULL)
    `).run(membershipId, IDS.account, appId, userId, now, now, now);
    db.raw.prepare(`
      INSERT INTO sync_membership_device_links (
        account_id, membership_id, app_device_id, account_device_id, linked_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(IDS.account, membershipId, appDevice, accountDevice, now);
  }
}

function seedUnrelatedAccount(db, now = 1_000) {
  const accountId = 'a0000000-0000-4000-8000-000000000001';
  const deviceId = 'a0000000-0000-4000-8000-000000000002';
  db.raw.prepare(`
    INSERT INTO sync_accounts (
      id, state, recovery_version, recovery_verifier, generation,
      created_at, updated_at, recovery_created_at, recovery_rotated_at
    ) VALUES (?, 'active', 1, ?, 1, ?, ?, ?, ?)
  `).run(accountId, hex('e'), now, now, now, now);
  db.raw.prepare(`
    INSERT INTO sync_account_devices (
      id, account_id, credential_version, credential_verifier,
      label, created_at, last_seen_at, revoked_at
    ) VALUES (?, ?, 1, ?, 'Other', ?, ?, NULL)
  `).run(deviceId, accountId, hex('1'), now, now);
  return { accountId, deviceId };
}

function seedQaSession(db, {
  sessionId = 'qa-recovery-session',
  accountId = null,
  expiresAt = 10_000,
  revokedAt = null
} = {}) {
  const enrollmentId = `enrollment-${sessionId}`;
  db.raw.prepare(`
    INSERT INTO sync_account_qa_enrollments (
      id, code_verifier, created_at, expires_at, consumed_at, cancelled_at,
      consumed_by_session_id
    ) VALUES (?, ?, 1, ?, 1, NULL, ?)
  `).run(enrollmentId, hex(sessionId === 'qa-recovery-session' ? 'b' : 'c'),
    Math.max(expiresAt, 2), sessionId);
  db.raw.prepare(`
    INSERT INTO sync_account_qa_sessions (
      id, credential_verifier, enrollment_id, scope, account_id, app_id,
      app_device_id, parent_session_id, created_at, expires_at, last_used_at,
      revoked_at, generation
    ) VALUES (?, ?, ?, 'port', ?, NULL, NULL, NULL, 1, ?, 1, ?, 1)
  `).run(sessionId, hex(sessionId === 'qa-recovery-session' ? 'd' : 'e'),
    enrollmentId, accountId, expiresAt, revokedAt);
  return sessionId;
}

function recoveryInput(overrides = {}) {
  return {
    operationId: IDS.prepare1,
    requestFingerprint: hex('5'),
    claimId: IDS.claim1,
    claimVerifier: hex('6'),
    currentRecoveryVerifier: hex('a'),
    nextRecoveryVerifier: hex('7'),
    nextAccountDeviceId: IDS.accountR,
    nextAccountCredentialVerifier: hex('8'),
    deviceLabel: 'Recovered',
    now: 2_000,
    ...overrides
  };
}

function rotationInput(overrides = {}) {
  return {
    operationId: IDS.prepare1,
    requestFingerprint: hex('1'),
    claimId: IDS.claim1,
    claimVerifier: hex('2'),
    nextRecoveryVerifier: hex('7'),
    now: 2_000,
    ...overrides
  };
}

async function qaRecoveryInput(qaSessionId, overrides = {}) {
  const input = recoveryInput({ qaSessionId, ...overrides });
  input.requestFingerprint = await accountOperationFingerprint([
    'account-recovery-prepare', input.claimVerifier, input.currentRecoveryVerifier,
    input.nextRecoveryVerifier, input.nextAccountDeviceId,
    input.nextAccountCredentialVerifier, input.deviceLabel || '', qaSessionId, 'qa'
  ]);
  return input;
}

test('Account Recovery rotates once, revokes every old container and preserves every dataset', async () => {
  const db = createSqliteD1();
  seedAccount(db);
  const repository = createD1AccountLifecycleRepository(db);
  const prepared = await repository.prepareRecovery(recoveryInput());
  assert.equal(prepared.status, 'prepared');
  assert.equal(prepared.summary.activeDeviceCount, 2);
  assert.deepEqual(prepared.summary.memberships.map((item) => item.appId),
    ['chord', 'pitch', 'fretboard', 'rhythm']);

  const committed = await repository.commitRecovery({
    operationId: IDS.commit1,
    requestFingerprint: hex('9'),
    claimId: IDS.claim1,
    claimVerifier: hex('6'),
    nextAccountCredentialVerifier: hex('8'),
    now: 3_000
  });
  assert.equal(committed.status, 'recovered');
  assert.equal(committed.recoveryVersion, 2);
  const account = db.raw.prepare('SELECT state, recovery_version, recovery_verifier FROM sync_accounts WHERE id = ?')
    .get(IDS.account);
  assert.deepEqual({ ...account }, { state: 'active', recovery_version: 2, recovery_verifier: hex('7') });
  const activeAccountDevices = db.raw.prepare(
    'SELECT id FROM sync_account_devices WHERE account_id = ? AND revoked_at IS NULL'
  ).all(IDS.account);
  assert.deepEqual(activeAccountDevices.map((row) => ({ ...row })), [{ id: IDS.accountR }]);
  assert.equal(db.raw.prepare(
    'SELECT COUNT(*) AS count FROM sync_devices WHERE revoked_at IS NULL'
  ).get().count, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_datasets').get().count, 4);

  const responseLossRetry = await repository.commitRecovery({
    operationId: IDS.commit1,
    requestFingerprint: hex('9'),
    claimId: IDS.claim1,
    claimVerifier: hex('6'),
    nextAccountCredentialVerifier: hex('8'),
    now: 3_100
  });
  assert.equal(responseLossRetry.alreadyRecovered, true);
  assert.equal(db.raw.prepare('SELECT recovery_version FROM sync_accounts WHERE id = ?').get(IDS.account).recovery_version, 2);
  db.close();
});

test('authenticated Recovery rotation preserves devices/data and one concurrent CAS wins', async () => {
  const db = createSqliteD1();
  seedAccount(db);
  const repository = createD1AccountLifecycleRepository(db);
  const identityA = {
    accountId: IDS.account, accountDeviceId: IDS.accountA, accountState: 'active',
    recoveryVersion: 1, generation: 1, admissionProvenance: 'qa'
  };
  const identityB = { ...identityA, accountDeviceId: IDS.accountB };
  const first = rotationInput();
  const second = rotationInput({
    operationId: IDS.prepare2,
    requestFingerprint: hex('3'),
    claimId: IDS.claim2,
    claimVerifier: hex('4'),
    nextRecoveryVerifier: hex('8')
  });
  assert.equal((await repository.prepareRecoveryRotation(identityA, first)).status, 'prepared');
  assert.equal((await repository.prepareRecoveryRotation(identityB, second)).status, 'prepared');

  const committed = await repository.commitRecoveryRotation(identityA, {
    operationId: IDS.commit1,
    requestFingerprint: hex('5'),
    claimId: first.claimId,
    claimVerifier: first.claimVerifier,
    now: 2_100
  });
  assert.deepEqual(committed, {
    status: 'rotated', recoveryVersion: 2, alreadyRotated: false
  });
  const retried = await repository.commitRecoveryRotation(
    { ...identityA, recoveryVersion: 2 },
    {
      operationId: IDS.commit1,
      requestFingerprint: hex('5'),
      claimId: first.claimId,
      claimVerifier: first.claimVerifier,
      now: 2_200
    }
  );
  assert.deepEqual(retried, {
    status: 'rotated', recoveryVersion: 2, alreadyRotated: true
  });
  const stale = await repository.commitRecoveryRotation(identityB, {
    operationId: IDS.commit2,
    requestFingerprint: hex('6'),
    claimId: second.claimId,
    claimVerifier: second.claimVerifier,
    now: 2_200
  });
  assert.equal(stale.status, 'invalid');

  assert.deepEqual({ ...db.raw.prepare(`
    SELECT state, recovery_version, recovery_verifier, generation
    FROM sync_accounts WHERE id = ?
  `).get(IDS.account) }, {
    state: 'active', recovery_version: 2, recovery_verifier: hex('7'), generation: 1
  });
  assert.equal(db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_account_devices
    WHERE account_id = ? AND revoked_at IS NULL
  `).get(IDS.account).count, 2);
  assert.equal(db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_devices
    WHERE id IN (SELECT app_device_id FROM sync_membership_device_links WHERE account_id = ?)
      AND revoked_at IS NULL
  `).get(IDS.account).count, 4);
  assert.equal(db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_account_memberships
    WHERE account_id = ? AND state = 'active'
  `).get(IDS.account).count, 4);
  assert.equal(db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_datasets
    WHERE user_id IN (SELECT sync_user_id FROM sync_account_memberships WHERE account_id = ?)
      AND state = 'ready'
  `).get(IDS.account).count, 4);
  assert.equal(db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_records
    WHERE user_id IN (SELECT sync_user_id FROM sync_account_memberships WHERE account_id = ?)
  `).get(IDS.account).count, 4);
  assert.equal(db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_changes
    WHERE user_id IN (SELECT sync_user_id FROM sync_account_memberships WHERE account_id = ?)
  `).get(IDS.account).count, 4);

  const unrelated = seedUnrelatedAccount(db);
  const wrong = await repository.commitRecoveryRotation({
    accountId: unrelated.accountId,
    accountDeviceId: unrelated.deviceId,
    accountState: 'active', recoveryVersion: 1, generation: 1,
    admissionProvenance: 'qa'
  }, {
    operationId: IDS.commit1,
    requestFingerprint: hex('5'),
    claimId: first.claimId,
    claimVerifier: first.claimVerifier,
    now: 2_300
  });
  assert.equal(wrong.status, 'invalid');
  db.close();
});

test('QA Account Recovery atomically binds its session and immediately enables strict Join issue', async () => {
  const db = createSqliteD1();
  seedAccount(db);
  const qaSessionId = seedQaSession(db);
  const otherQaSessionId = seedQaSession(db, { sessionId: 'qa-other-session' });
  const repository = createD1AccountLifecycleRepository(db);
  assert.equal((await repository.prepareRecovery(await qaRecoveryInput(qaSessionId))).status, 'prepared');
  const commitInput = {
    operationId: IDS.commit1, requestFingerprint: hex('9'), claimId: IDS.claim1,
    claimVerifier: hex('6'), nextAccountCredentialVerifier: hex('8'), qaSessionId, now: 3_000
  };
  assert.equal((await repository.commitRecovery({
    ...commitInput, qaSessionId: otherQaSessionId
  })).status, 'invalid');
  assert.equal(db.raw.prepare('SELECT recovery_version FROM sync_accounts WHERE id = ?')
    .get(IDS.account).recovery_version, 1);
  const committed = await repository.commitRecovery(commitInput);
  assert.equal(committed.status, 'recovered');
  assert.equal(db.raw.prepare('SELECT account_id FROM sync_account_qa_sessions WHERE id = ?')
    .get(qaSessionId).account_id, IDS.account);

  const issued = await createD1AppJoinRepository(db).issue({
    accountId: IDS.account, accountDeviceId: IDS.accountR
  }, {
    operationId: crypto.randomUUID(), requestFingerprint: hex('1'),
    invitationId: crypto.randomUUID(), appId: 'rhythm', codeVerifier: hex('2'),
    qaIssuerSessionId: qaSessionId, now: 3_100
  });
  assert.equal(issued.status, 'issued');

  const retry = await repository.commitRecovery({ ...commitInput, now: 3_200 });
  assert.equal(retry.status, 'recovered');
  assert.equal(retry.alreadyRecovered, true);
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_account_devices WHERE account_id = ?')
    .get(IDS.account).count, 3);
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_account_devices WHERE account_id = ? AND revoked_at IS NULL')
    .get(IDS.account).count, 1);
  db.close();
});

test('QA Recovery rejects a session bound to another Account without rewriting either binding', async () => {
  const db = createSqliteD1();
  seedAccount(db);
  const unrelated = seedUnrelatedAccount(db);
  const qaSessionId = seedQaSession(db, { accountId: unrelated.accountId });
  const repository = createD1AccountLifecycleRepository(db);
  assert.equal((await repository.prepareRecovery(await qaRecoveryInput(qaSessionId))).status, 'invalid');
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_account_recovery_claims').get().count, 0);

  assert.equal((await repository.prepareRecovery(recoveryInput())).status, 'prepared');
  assert.equal((await repository.commitRecovery({
    operationId: IDS.commit1, requestFingerprint: hex('9'), claimId: IDS.claim1,
    claimVerifier: hex('6'), nextAccountCredentialVerifier: hex('8'), qaSessionId, now: 3_000
  })).status, 'invalid');
  assert.equal(db.raw.prepare('SELECT recovery_version FROM sync_accounts WHERE id = ?')
    .get(IDS.account).recovery_version, 1);
  assert.equal(db.raw.prepare('SELECT account_id FROM sync_account_qa_sessions WHERE id = ?')
    .get(qaSessionId).account_id, unrelated.accountId);
  db.close();
});

test('QA session bind failure rolls back the complete Recovery transaction', async () => {
  const db = createSqliteD1();
  seedAccount(db);
  const qaSessionId = seedQaSession(db);
  const repository = createD1AccountLifecycleRepository(db);
  await repository.prepareRecovery(await qaRecoveryInput(qaSessionId));
  db.raw.exec(`CREATE TRIGGER fail_recovery_qa_bind
    BEFORE UPDATE OF account_id ON sync_account_qa_sessions
    WHEN NEW.id = '${qaSessionId}'
    BEGIN SELECT RAISE(ABORT, 'forced QA bind failure'); END;`);
  await assert.rejects(repository.commitRecovery({
    operationId: IDS.commit1, requestFingerprint: hex('9'), claimId: IDS.claim1,
    claimVerifier: hex('6'), nextAccountCredentialVerifier: hex('8'), qaSessionId, now: 3_000
  }), /forced QA bind failure/);
  assert.equal(db.raw.prepare('SELECT recovery_version FROM sync_accounts WHERE id = ?')
    .get(IDS.account).recovery_version, 1);
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_account_devices WHERE account_id = ? AND revoked_at IS NULL')
    .get(IDS.account).count, 2);
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_account_devices WHERE id = ?')
    .get(IDS.accountR).count, 0);
  assert.equal(db.raw.prepare('SELECT account_id FROM sync_account_qa_sessions WHERE id = ?')
    .get(qaSessionId).account_id, null);
  assert.equal(db.raw.prepare('SELECT committed_at FROM sync_account_recovery_claims WHERE claim_id = ?')
    .get(IDS.claim1).committed_at, null);
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_account_lifecycle_operations').get().count, 0);
  db.close();
});

test('QA Recovery rejects missing, expired and revoked sessions while preserving Account state', async () => {
  for (const state of ['missing', 'expired', 'revoked']) {
    const db = createSqliteD1();
    seedAccount(db);
    const qaSessionId = `qa-${state}`;
    if (state !== 'missing') seedQaSession(db, {
      sessionId: qaSessionId,
      expiresAt: state === 'expired' ? 1_500 : 10_000,
      revokedAt: state === 'revoked' ? 1_500 : null
    });
    const repository = createD1AccountLifecycleRepository(db);
    assert.equal((await repository.prepareRecovery(await qaRecoveryInput(qaSessionId))).status,
      'invalid', state);
    assert.equal(db.raw.prepare('SELECT recovery_version FROM sync_accounts WHERE id = ?')
      .get(IDS.account).recovery_version, 1, state);
    assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_account_recovery_claims').get().count,
      0, state);
    db.close();
  }
});

test('QA Recovery accepts an already-correct binding and non-QA Recovery remains independent', async () => {
  const qaDb = createSqliteD1();
  seedAccount(qaDb);
  const qaSessionId = seedQaSession(qaDb, { accountId: IDS.account });
  const qaRepository = createD1AccountLifecycleRepository(qaDb);
  assert.equal((await qaRepository.prepareRecovery(await qaRecoveryInput(qaSessionId))).status, 'prepared');
  assert.equal((await qaRepository.commitRecovery({
    operationId: IDS.commit1, requestFingerprint: hex('9'), claimId: IDS.claim1,
    claimVerifier: hex('6'), nextAccountCredentialVerifier: hex('8'), qaSessionId, now: 3_000
  })).status, 'recovered');
  assert.equal(qaDb.raw.prepare('SELECT account_id FROM sync_account_qa_sessions WHERE id = ?')
    .get(qaSessionId).account_id, IDS.account);
  qaDb.close();

  const regularDb = createSqliteD1();
  seedAccount(regularDb);
  const regularRepository = createD1AccountLifecycleRepository(regularDb);
  assert.equal((await regularRepository.prepareRecovery(recoveryInput())).status, 'prepared');
  assert.equal((await regularRepository.commitRecovery({
    operationId: IDS.commit1, requestFingerprint: hex('9'), claimId: IDS.claim1,
    claimVerifier: hex('6'), nextAccountCredentialVerifier: hex('8'), now: 3_000
  })).status, 'recovered');
  assert.equal(regularDb.raw.prepare('SELECT COUNT(*) count FROM sync_account_qa_sessions').get().count, 0);
  regularDb.close();
});

test('parallel Account Recovery claims are CAS protected and the old Recovery verifier is invalid', async () => {
  const db = createSqliteD1();
  seedAccount(db);
  const repository = createD1AccountLifecycleRepository(db);
  await repository.prepareRecovery(recoveryInput());
  await repository.prepareRecovery(recoveryInput({
    operationId: IDS.prepare2, requestFingerprint: hex('f'), claimId: IDS.claim2,
    claimVerifier: hex('0'), nextRecoveryVerifier: hex('9'),
    nextAccountDeviceId: '10000000-0000-4000-8000-000000000005',
    nextAccountCredentialVerifier: hex('5')
  }));
  assert.equal((await repository.commitRecovery({
    operationId: IDS.commit1, requestFingerprint: hex('9'), claimId: IDS.claim1,
    claimVerifier: hex('6'), nextAccountCredentialVerifier: hex('8'), now: 3_000
  })).status, 'recovered');
  assert.equal((await repository.commitRecovery({
    operationId: IDS.commit2, requestFingerprint: hex('4'), claimId: IDS.claim2,
    claimVerifier: hex('0'), nextAccountCredentialVerifier: hex('5'), now: 3_001
  })).status, 'invalid');
  assert.equal((await repository.prepareRecovery(recoveryInput({
    operationId: '60000000-0000-4000-8000-000000000003',
    claimId: '50000000-0000-4000-8000-000000000003',
    claimVerifier: hex('3'), nextRecoveryVerifier: hex('2'),
    nextAccountDeviceId: '10000000-0000-4000-8000-000000000006',
    nextAccountCredentialVerifier: hex('1'), now: 4_000
  }))).status, 'invalid');
  db.close();
});

test('environment revoke invalidates linked app credentials without deleting local cloud records', async () => {
  const db = createSqliteD1();
  seedAccount(db);
  const unrelated = seedUnrelatedAccount(db);
  const repository = createD1AccountLifecycleRepository(db);
  const identity = { accountId: IDS.account, accountDeviceId: IDS.accountA };
  const environments = await repository.listEnvironments(identity);
  assert.deepEqual(environments.find((item) => item.id === IDS.accountA).relatedApps, ['chord', 'fretboard']);
  const result = await repository.revokeEnvironment(identity, {
    operationId: IDS.revoke, requestFingerprint: hex('3'),
    targetDeviceId: IDS.accountA, now: 2_000
  });
  assert.equal(result.isCurrent, true);
  assert.equal(db.raw.prepare('SELECT revoked_at FROM sync_account_devices WHERE id = ?').get(IDS.accountA).revoked_at, 2_000);
  assert.equal(db.raw.prepare('SELECT revoked_at FROM sync_devices WHERE id = ?').get(IDS.chordDevice).revoked_at, 2_000);
  assert.equal(db.raw.prepare('SELECT revoked_at FROM sync_devices WHERE id = ?').get(IDS.pitchDevice).revoked_at, null);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_datasets').get().count, 4);
  const retry = await repository.revokeEnvironment(identity, {
    operationId: IDS.revoke, requestFingerprint: hex('3'),
    targetDeviceId: IDS.accountA, now: 2_001
  });
  assert.equal(retry.alreadyRevoked, true);
  assert.equal((await repository.revokeEnvironment(identity, {
    operationId: crypto.randomUUID(), requestFingerprint: hex('4'),
    targetDeviceId: unrelated.deviceId, now: 2_002
  })).status, 'not_found');
  assert.equal(db.raw.prepare('SELECT revoked_at FROM sync_account_devices WHERE id = ?')
    .get(unrelated.deviceId).revoked_at, null);
  db.close();
});

test('app detach revokes every target app environment while preserving membership, dataset and durable data', async () => {
  const db = createSqliteD1();
  seedAccount(db);
  const secondAccountDevice = '10000000-0000-4000-8000-000000000007';
  const secondChordDevice = '40000000-0000-4000-8000-000000000007';
  db.raw.prepare(`
    INSERT INTO sync_account_devices (
      id, account_id, credential_version, credential_verifier,
      label, created_at, last_seen_at, revoked_at
    ) VALUES (?, ?, 1, ?, 'Chord B', 1000, 1000, NULL)
  `).run(secondAccountDevice, IDS.account, hex('2'));
  db.raw.prepare(`
    INSERT INTO sync_devices (
      id, user_id, app_id, credential_version, credential_verifier,
      label, last_cursor, created_at, last_seen_at, revoked_at,
      pairing_pending_at, paired_at
    ) VALUES (?, ?, 'chord', 1, ?, 'Chord B', 0, 1000, 1000, NULL, NULL, 1000)
  `).run(secondChordDevice, IDS.chordUser, hex('3'));
  db.raw.prepare(`
    INSERT INTO sync_membership_device_links (
      account_id, membership_id, app_device_id, account_device_id, linked_at
    ) VALUES (?, ?, ?, ?, 1000)
  `).run(IDS.account, IDS.chordMembership, secondChordDevice, secondAccountDevice);

  const repository = createD1AccountLifecycleRepository(db);
  const identity = { accountId: IDS.account, accountDeviceId: IDS.accountA };
  const before = {
    records: db.raw.prepare('SELECT COUNT(*) count FROM sync_records').get().count,
    changes: db.raw.prepare('SELECT COUNT(*) count FROM sync_changes').get().count,
    datasets: db.raw.prepare('SELECT COUNT(*) count FROM sync_datasets').get().count
  };
  const input = {
    operationId: '90000000-0000-4000-8000-000000000009',
    requestFingerprint: hex('5'), appId: 'chord', now: 2_100
  };
  const result = await repository.detachApp(identity, input);
  assert.equal(result.status, 'detached');
  assert.equal(result.revokedAppDeviceCount, 2);
  assert.equal(db.raw.prepare('SELECT state FROM sync_account_memberships WHERE id = ?')
    .get(IDS.chordMembership).state, 'active');
  assert.equal(db.raw.prepare('SELECT state FROM sync_datasets WHERE user_id = ? AND app_id = ?')
    .get(IDS.chordUser, 'chord').state, 'ready');
  assert.equal(db.raw.prepare(`SELECT COUNT(*) count FROM sync_devices
    WHERE user_id = ? AND app_id = 'chord' AND revoked_at IS NULL`).get(IDS.chordUser).count, 0);
  assert.equal(db.raw.prepare('SELECT revoked_at FROM sync_account_devices WHERE id = ?')
    .get(secondAccountDevice).revoked_at, null, 'Account environments remain active');
  assert.deepEqual({
    records: db.raw.prepare('SELECT COUNT(*) count FROM sync_records').get().count,
    changes: db.raw.prepare('SELECT COUNT(*) count FROM sync_changes').get().count,
    datasets: db.raw.prepare('SELECT COUNT(*) count FROM sync_datasets').get().count
  }, before);
  assert.equal(db.raw.prepare('SELECT revoked_at FROM sync_devices WHERE id = ?')
    .get(IDS.pitchDevice).revoked_at, null, 'other app devices remain active');
  const retry = await repository.detachApp(identity, { ...input, now: 2_101 });
  assert.equal(retry.alreadyDetached, true);
  assert.equal(retry.revokedAppDeviceCount, 2);
  const generationsAfterDetach = db.raw.prepare(`
    SELECT a.generation AS account_generation, m.generation AS membership_generation
    FROM sync_accounts a JOIN sync_account_memberships m ON m.account_id = a.id
    WHERE a.id = ? AND m.id = ?
  `).get(IDS.account, IDS.chordMembership);
  const duplicateWithNewOperation = await repository.detachApp(identity, {
    ...input, operationId: crypto.randomUUID(), requestFingerprint: hex('7'), now: 2_102
  });
  assert.equal(duplicateWithNewOperation.alreadyDetached, true);
  assert.equal(duplicateWithNewOperation.revokedAppDeviceCount, 0);
  assert.deepEqual(db.raw.prepare(`
    SELECT a.generation AS account_generation, m.generation AS membership_generation
    FROM sync_accounts a JOIN sync_account_memberships m ON m.account_id = a.id
    WHERE a.id = ? AND m.id = ?
  `).get(IDS.account, IDS.chordMembership), generationsAfterDetach,
  'a second detach operation has no duplicate lifecycle side effect');
  assert.equal((await repository.detachApp(identity, {
    ...input, operationId: crypto.randomUUID(), requestFingerprint: hex('6'), appId: 'unknown'
  })).status, 'invalid');
  db.close();
});

test('app detach fails closed for wrong Account and non-active lifecycle states', async () => {
  const cases = [
    {
      name: 'wrong Account',
      prepare(db) {
        const other = seedUnrelatedAccount(db);
        return { accountId: other.accountId, accountDeviceId: other.deviceId };
      }
    },
    {
      name: 'pending membership',
      prepare(db) {
        db.raw.prepare(`UPDATE sync_account_memberships
          SET state = 'pending', sync_user_id = NULL, activated_at = NULL
          WHERE id = ?`).run(IDS.chordMembership);
      }
    },
    {
      name: 'deleting membership',
      prepare(db) {
        db.raw.prepare(`UPDATE sync_account_memberships SET state = 'deleting'
          WHERE id = ?`).run(IDS.chordMembership);
      }
    },
    {
      name: 'deleting Account',
      prepare(db) {
        db.raw.prepare(`UPDATE sync_accounts SET state = 'deleting'
          WHERE id = ?`).run(IDS.account);
      }
    }
  ];
  for (const scenario of cases) {
    const db = createSqliteD1();
    seedAccount(db);
    const identity = scenario.prepare(db) || {
      accountId: IDS.account, accountDeviceId: IDS.accountA
    };
    const before = {
      records: db.raw.prepare('SELECT COUNT(*) count FROM sync_records').get().count,
      activeChordDevices: db.raw.prepare(`SELECT COUNT(*) count FROM sync_devices
        WHERE user_id = ? AND app_id = 'chord' AND revoked_at IS NULL`).get(IDS.chordUser).count
    };
    const result = await createD1AccountLifecycleRepository(db).detachApp(identity, {
      operationId: crypto.randomUUID(), requestFingerprint: hex('8'),
      appId: 'chord', now: 2_200
    });
    assert.equal(result.status, 'invalid', scenario.name);
    assert.deepEqual({
      records: db.raw.prepare('SELECT COUNT(*) count FROM sync_records').get().count,
      activeChordDevices: db.raw.prepare(`SELECT COUNT(*) count FROM sync_devices
        WHERE user_id = ? AND app_id = 'chord' AND revoked_at IS NULL`).get(IDS.chordUser).count
    }, before, `${scenario.name} has no partial detach`);
    db.close();
  }
});

async function issueIntent(repository, identity, scope, appId = null) {
  return repository.issueDeleteIntent(identity, {
    operationId: IDS.intentIssue,
    requestFingerprint: hex('6'),
    intentId: IDS.intent,
    intentVerifier: hex('7'),
    scope,
    appId,
    now: 2_000
  });
}

test('App-scoped delete retains its dataset for grace and leaves Account and other app active', async () => {
  const db = createSqliteD1();
  seedAccount(db);
  const repository = createD1AccountLifecycleRepository(db);
  const identity = { accountId: IDS.account, accountDeviceId: IDS.accountA };
  assert.equal((await issueIntent(repository, identity, 'app', 'chord')).status, 'issued');
  const result = await repository.commitDelete(identity, {
    operationId: IDS.intentCommit,
    requestFingerprint: hex('8'),
    intentId: IDS.intent,
    intentVerifier: hex('7'),
    scope: 'app', appId: 'chord', now: 3_000
  });
  assert.equal(result.status, 'deleting');
  assert.equal(db.raw.prepare('SELECT state FROM sync_accounts WHERE id = ?').get(IDS.account).state, 'active');
  assert.equal(db.raw.prepare('SELECT state FROM sync_account_memberships WHERE id = ?').get(IDS.chordMembership).state, 'deleting');
  assert.equal(db.raw.prepare('SELECT state FROM sync_account_memberships WHERE id = ?').get(IDS.pitchMembership).state, 'active');
  assert.equal(db.raw.prepare('SELECT state FROM sync_users WHERE id = ?').get(IDS.chordUser).state, 'deleting');
  assert.equal(db.raw.prepare('SELECT state FROM sync_users WHERE id = ?').get(IDS.pitchUser).state, 'active');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_datasets').get().count, 4);
  const retry = await repository.commitDelete(identity, {
    operationId: IDS.intentCommit, requestFingerprint: hex('8'),
    intentId: IDS.intent, intentVerifier: hex('7'),
    scope: 'app', appId: 'chord', now: 3_001
  });
  assert.equal(retry.alreadyDeleting, true);
  db.close();
});

test('Account-wide delete revokes every credential and scheduled cleanup purges only after grace', async () => {
  const db = createSqliteD1();
  seedAccount(db);
  const unrelated = seedUnrelatedAccount(db);
  db.raw.prepare(`
    INSERT INTO sync_account_qa_enrollments (
      id, code_verifier, created_at, expires_at, consumed_at, consumed_by_session_id
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run('qa-enrollment', hex('b'), 1_000, 10_000, 1_001, 'qa-port');
  db.raw.prepare(`
    INSERT INTO sync_account_qa_sessions (
      id, credential_verifier, enrollment_id, scope, account_id, app_id,
      app_device_id, parent_session_id, created_at, expires_at, last_used_at
    ) VALUES (?, ?, ?, 'port', ?, NULL, NULL, NULL, ?, ?, ?)
  `).run('qa-port', hex('c'), 'qa-enrollment', IDS.account, 1_000, 10_000, 1_000);
  db.raw.prepare(`
    INSERT INTO sync_account_qa_sessions (
      id, credential_verifier, enrollment_id, scope, account_id, app_id,
      app_device_id, parent_session_id, created_at, expires_at, last_used_at
    ) VALUES (?, ?, ?, 'app', ?, 'chord', ?, ?, ?, ?, ?)
  `).run('qa-app', hex('d'), 'qa-enrollment', IDS.account, IDS.chordDevice,
    'qa-port', 1_000, 10_000, 1_000);
  const repository = createD1AccountLifecycleRepository(db);
  const identity = { accountId: IDS.account, accountDeviceId: IDS.accountA };
  await issueIntent(repository, identity, 'account');
  const result = await repository.commitDelete(identity, {
    operationId: IDS.intentCommit,
    requestFingerprint: hex('8'),
    intentId: IDS.intent,
    intentVerifier: hex('7'),
    scope: 'account', appId: null, now: 3_000
  });
  assert.equal(result.status, 'deleting');
  assert.equal(db.raw.prepare(
    'SELECT COUNT(*) AS count FROM sync_account_devices WHERE account_id = ? AND revoked_at IS NULL'
  ).get(IDS.account).count, 0);
  assert.equal(db.raw.prepare(
    `SELECT COUNT(*) AS count FROM sync_devices WHERE revoked_at IS NULL
      AND user_id IN (SELECT sync_user_id FROM sync_account_memberships WHERE account_id = ?)`
  ).get(IDS.account).count, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_datasets').get().count, 4);

  const before = await createD1CleanupRepository(db, () => result.purgeAfter - 1).cleanup();
  assert.equal(before.accountMembershipsPurged, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_datasets').get().count, 4);
  const after = await createD1CleanupRepository(db, () => result.purgeAfter).cleanup();
  assert.equal(after.accountMembershipsPurged, 4);
  assert.equal(after.accountsDeleted, 1);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_datasets').get().count, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_records').get().count, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_changes').get().count, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_account_qa_sessions').get().count, 0);
  assert.equal(db.raw.prepare('SELECT state FROM sync_accounts WHERE id = ?').get(IDS.account), undefined);
  assert.equal(db.raw.prepare('SELECT state FROM sync_accounts WHERE id = ?')
    .get(unrelated.accountId).state, 'active');
  const rerun = await createD1CleanupRepository(db, () => result.purgeAfter).cleanup();
  assert.equal(rerun.accountMembershipsPurged, 0);
  assert.equal(rerun.accountsDeleted, 0);
  db.close();
});

test('Recovery and delete use Account generation CAS so only one lifecycle transition wins', async () => {
  const db = createSqliteD1();
  seedAccount(db);
  const repository = createD1AccountLifecycleRepository(db);
  const identity = { accountId: IDS.account, accountDeviceId: IDS.accountA };
  await repository.prepareRecovery(recoveryInput());
  await issueIntent(repository, identity, 'account');
  assert.equal((await repository.commitDelete(identity, {
    operationId: IDS.intentCommit, requestFingerprint: hex('8'),
    intentId: IDS.intent, intentVerifier: hex('7'), scope: 'account', appId: null, now: 3_000
  })).status, 'deleting');
  assert.equal((await repository.commitRecovery({
    operationId: IDS.commit1, requestFingerprint: hex('9'), claimId: IDS.claim1,
    claimVerifier: hex('6'), nextAccountCredentialVerifier: hex('8'), now: 3_001
  })).status, 'invalid');
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_account_devices WHERE revoked_at IS NULL')
    .get().count, 0);
  db.close();
});

test('parallel app delete intents are scope-bound and only one generation transition wins', async () => {
  const db = createSqliteD1();
  seedAccount(db);
  const repository = createD1AccountLifecycleRepository(db);
  const identity = { accountId: IDS.account, accountDeviceId: IDS.accountA };
  const first = await issueIntent(repository, identity, 'app', 'chord');
  const second = await repository.issueDeleteIntent(identity, {
    operationId: crypto.randomUUID(), requestFingerprint: hex('2'),
    intentId: crypto.randomUUID(), intentVerifier: hex('3'),
    scope: 'app', appId: 'pitch', now: 2_001
  });
  assert.equal((await repository.commitDelete(identity, {
    operationId: crypto.randomUUID(), requestFingerprint: hex('4'),
    intentId: first.intentId, intentVerifier: hex('7'), scope: 'app', appId: 'pitch', now: 3_000
  })).status, 'invalid');
  assert.equal((await repository.commitDelete(identity, {
    operationId: crypto.randomUUID(), requestFingerprint: hex('5'),
    intentId: first.intentId, intentVerifier: hex('7'), scope: 'app', appId: 'chord', now: 3_001
  })).status, 'deleting');
  assert.equal((await repository.commitDelete(identity, {
    operationId: crypto.randomUUID(), requestFingerprint: hex('6'),
    intentId: second.intentId, intentVerifier: hex('3'), scope: 'app', appId: 'pitch', now: 3_002
  })).status, 'invalid');
  assert.equal(db.raw.prepare('SELECT state FROM sync_account_memberships WHERE id = ?')
    .get(IDS.pitchMembership).state, 'active');
  db.close();
});

test('cleanup batch failure rolls back membership state and dataset purge', async () => {
  const db = createSqliteD1();
  seedAccount(db);
  const repository = createD1AccountLifecycleRepository(db);
  const identity = { accountId: IDS.account, accountDeviceId: IDS.accountA };
  await issueIntent(repository, identity, 'app', 'chord');
  const deleted = await repository.commitDelete(identity, {
    operationId: IDS.intentCommit, requestFingerprint: hex('8'),
    intentId: IDS.intent, intentVerifier: hex('7'), scope: 'app', appId: 'chord', now: 3_000
  });
  db.raw.exec(`CREATE TRIGGER fail_account_cleanup BEFORE DELETE ON sync_users
    WHEN OLD.id = '${IDS.chordUser}' BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
  const result = await createD1CleanupRepository(db, () => deleted.purgeAfter).cleanup();
  assert.equal(result.accountMembershipsPurged, 0);
  assert.equal(db.raw.prepare('SELECT state, sync_user_id FROM sync_account_memberships WHERE id = ?')
    .get(IDS.chordMembership).state, 'deleting');
  assert.equal(db.raw.prepare('SELECT COUNT(*) count FROM sync_datasets WHERE user_id = ?')
    .get(IDS.chordUser).count, 1);
  db.close();
});

test('each app delete contract is scoped and permits a fresh membership only after grace purge', async () => {
  for (const appId of ['chord', 'pitch', 'fretboard', 'rhythm']) {
    const db = createSqliteD1();
    seedAccount(db);
    const lifecycle = createD1AccountLifecycleRepository(db);
    const identity = { accountId: IDS.account, accountDeviceId: IDS.accountA };
    const membership = db.raw.prepare(
      'SELECT id FROM sync_account_memberships WHERE account_id = ? AND app_id = ?'
    ).get(IDS.account, appId);
    const issued = await lifecycle.issueDeleteIntent(identity, {
      operationId: crypto.randomUUID(), requestFingerprint: hex('b'),
      intentId: crypto.randomUUID(), intentVerifier: hex('c'), scope: 'app', appId, now: 2_000
    });
    const deleted = await lifecycle.commitDelete(identity, {
      operationId: crypto.randomUUID(), requestFingerprint: hex('d'),
      intentId: issued.intentId, intentVerifier: hex('c'), scope: 'app', appId, now: 3_000
    });
    assert.equal(deleted.status, 'deleting', appId);
    assert.equal(db.raw.prepare(
      `SELECT COUNT(*) AS count FROM sync_account_memberships
       WHERE account_id = ? AND app_id <> ? AND state = 'active'`
    ).get(IDS.account, appId).count, 3, appId);
    const accountRepo = createD1AccountRepository(db);
    assert.equal((await accountRepo.prepareMembership(identity, {
      operationId: crypto.randomUUID(), membershipId: crypto.randomUUID(), appId, now: 3_001
    })).status, 'invalid', appId);
    await createD1CleanupRepository(db, () => deleted.purgeAfter).cleanup();
    const rejoin = await accountRepo.prepareMembership(identity, {
      operationId: crypto.randomUUID(), membershipId: crypto.randomUUID(), appId,
      now: deleted.purgeAfter
    });
    assert.equal(rejoin.status, 'pending', appId);
    assert.equal(rejoin.membershipId, membership.id, appId);
    assert.equal(rejoin.rejoined, true, appId);
    db.close();
  }
});

test('expired delete intent cannot mutate Account state', async () => {
  const db = createSqliteD1();
  seedAccount(db);
  const repository = createD1AccountLifecycleRepository(db);
  const identity = { accountId: IDS.account, accountDeviceId: IDS.accountA };
  await issueIntent(repository, identity, 'account');
  const result = await repository.commitDelete(identity, {
    operationId: IDS.intentCommit, requestFingerprint: hex('8'),
    intentId: IDS.intent, intentVerifier: hex('7'), scope: 'account', appId: null,
    now: 2_000 + ACCOUNT_LIFECYCLE.deleteIntentTtlMs
  });
  assert.equal(result.status, 'expired');
  assert.equal(db.raw.prepare('SELECT state FROM sync_accounts WHERE id = ?').get(IDS.account).state, 'active');
  db.close();
});

test('Account Recovery candidate attempts are bounded and reset after the fixed window', async () => {
  const db = createSqliteD1();
  const repository = createD1AccountLifecycleRepository(db);
  for (let attempt = 0; attempt < ACCOUNT_LIFECYCLE.recoveryMaxAttempts; attempt += 1) {
    assert.equal((await repository.reserveRecoveryAttempt(hex('f'), 1_000 + attempt)).status, 'allowed');
  }
  assert.equal((await repository.reserveRecoveryAttempt(hex('f'), 2_000)).status, 'exhausted');
  assert.equal((await repository.reserveRecoveryAttempt(
    hex('f'), 1_000 + ACCOUNT_LIFECYCLE.recoveryAttemptWindowMs
  )).status, 'allowed');
  assert.equal(db.raw.prepare('SELECT attempts FROM sync_account_recovery_attempts').get().attempts, 1);
  db.close();
});
