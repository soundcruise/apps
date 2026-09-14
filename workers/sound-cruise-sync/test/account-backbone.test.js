import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1AccountRepository } from '../src/account-database.js';
import { createAccountService } from '../src/account-service.js';
import { readAccountRuntimeControl } from '../src/account-rollout-control.js';
import { createSqliteD1, seedIdentity } from './sqlite-d1.js';

const accountId = 'account-0001';
const accountDeviceId = 'account-device-0001';
const memberships = [
  { id: 'membership-chord', appId: 'chord' },
  { id: 'membership-pitch', appId: 'pitch' },
  { id: 'membership-fretboard', appId: 'fretboard' },
  { id: 'membership-rhythm', appId: 'rhythm' }
];

function input(overrides = {}) {
  return {
    accountId,
    accountDeviceId,
    recoveryVerifier: 'a'.repeat(64),
    accountCredentialVerifier: 'b'.repeat(64),
    accountDeviceLabel: 'QA Browser',
    memberships,
    now: 1000,
    ...overrides
  };
}

function enableAccountControl(db) {
  db.raw.prepare(`
    UPDATE sync_account_runtime_control
    SET rollout_mode = 'open', account_admission_enabled = 1,
        membership_admission_enabled = 1, account_read_enabled = 1,
        account_recovery_enabled = 1, account_delete_enabled = 1,
        port_orchestration_enabled = 1, generation = 2, updated_at = 999
    WHERE singleton_id = 1
  `).run();
}

function serviceFor(db) {
  return createAccountService({
    repository: createD1AccountRepository(db),
    readControl: () => readAccountRuntimeControl(db)
  });
}

function seedActiveAppIdentity(db, overrides = {}) {
  const identity = seedIdentity(db, {
    userId: 'app-user-0001',
    deviceId: 'app-device-0001',
    appId: 'chord',
    verifier: 'e'.repeat(64),
    ...overrides
  });
  db.raw.prepare(`
    UPDATE sync_users
    SET state = 'active', recovery_version = 1, recovery_verifier = ?, updated_at = 2
    WHERE id = ?
  `).run('f'.repeat(64), identity.userId);
  db.raw.prepare(`
    UPDATE sync_datasets
    SET state = 'ready', manifest_hash = ?, initialized_at = 2, updated_at = 2
    WHERE user_id = ? AND app_id = ?
  `).run('c'.repeat(64), identity.userId, identity.appId);
  return identity;
}

test('independent gate prevents Account writes by default', async () => {
  const db = createSqliteD1();
  const result = await serviceFor(db).provisionAccount(input());
  assert.deepEqual(result, {
    status: 'paused',
    httpStatus: 423,
    code: 'account_admission_paused',
    gate: 'account_admission'
  });
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_accounts').get().count, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 0);
  db.close();
});

test('Account backbone creates one Account, one credential container and four pending memberships', async () => {
  const db = createSqliteD1();
  enableAccountControl(db);
  const service = serviceFor(db);
  const result = await service.provisionAccount(input());
  assert.equal(result.status, 'created');
  assert.equal(result.accountId, accountId);
  assert.equal(result.accountDeviceId, accountDeviceId);
  assert.deepEqual(result.memberships.map((membership) => membership.appId), [
    'chord', 'pitch', 'fretboard', 'rhythm'
  ]);

  const persistedAccount = db.raw.prepare(`
    SELECT state, recovery_version, recovery_verifier, generation
    FROM sync_accounts WHERE id = ?
  `).get(accountId);
  assert.deepEqual({ ...persistedAccount }, {
    state: 'active', recovery_version: 1,
    recovery_verifier: 'a'.repeat(64), generation: 1
  });
  assert.equal(
    db.raw.prepare('SELECT credential_verifier FROM sync_account_devices WHERE id = ?')
      .get(accountDeviceId).credential_verifier,
    'b'.repeat(64)
  );
  assert.deepEqual(
    db.raw.prepare(`
      SELECT app_id, state, sync_user_id, recovery_mode
      FROM sync_account_memberships WHERE account_id = ? ORDER BY app_id
    `).all(accountId).map((row) => ({ ...row })),
    [
      { app_id: 'chord', state: 'pending', sync_user_id: null, recovery_mode: 'account' },
      { app_id: 'fretboard', state: 'pending', sync_user_id: null, recovery_mode: 'account' },
      { app_id: 'pitch', state: 'pending', sync_user_id: null, recovery_mode: 'account' },
      { app_id: 'rhythm', state: 'pending', sync_user_id: null, recovery_mode: 'account' }
    ]
  );
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 0,
    'Account provisioning does not create or rekey any app identity');

  const summary = await service.getAccountSummary(accountId);
  assert.equal(summary.status, 'ok');
  assert.equal(summary.account.recoveryVersion, 1);
  assert.equal(summary.memberships.length, 4);
  assert.equal(summary.memberships.every((membership) => membership.dataset === null), true);
  assert.equal(JSON.stringify(summary).includes('a'.repeat(64)), false,
    'Recovery verifier never appears in the read model');
  assert.equal(JSON.stringify(summary).includes('b'.repeat(64)), false,
    'Account credential verifier never appears in the read model');
  db.close();
});

test('standalone app can prepare one membership without Cruise Port', async () => {
  const db = createSqliteD1();
  enableAccountControl(db);
  const result = await serviceFor(db).provisionAccount(input({
    accountId: 'standalone-account',
    accountDeviceId: 'standalone-device',
    memberships: [{ id: 'standalone-pitch', appId: 'pitch' }]
  }));
  assert.equal(result.status, 'created');
  assert.deepEqual(result.memberships, [
    { id: 'standalone-pitch', appId: 'pitch', state: 'pending' }
  ]);
  db.close();
});

test('membership activation atomically links a matching existing app identity and is idempotent', async () => {
  const db = createSqliteD1();
  enableAccountControl(db);
  const service = serviceFor(db);
  await service.provisionAccount(input());
  const identity = seedActiveAppIdentity(db);
  const activation = {
    accountId,
    membershipId: 'membership-chord',
    appId: 'chord',
    syncUserId: identity.userId,
    appDeviceId: identity.deviceId,
    accountDeviceId,
    recoveryMode: 'dual',
    now: 2000
  };

  assert.deepEqual(await service.activateMembership(activation), {
    status: 'active', membershipId: 'membership-chord', alreadyActive: false
  });
  assert.deepEqual({ ...db.raw.prepare(`
    SELECT state, sync_user_id, recovery_mode, generation, activated_at
    FROM sync_account_memberships WHERE id = 'membership-chord'
  `).get() }, {
    state: 'active', sync_user_id: identity.userId, recovery_mode: 'dual',
    generation: 2, activated_at: 2000
  });
  assert.deepEqual({ ...db.raw.prepare(`
    SELECT app_device_id, account_device_id, linked_at
    FROM sync_membership_device_links WHERE membership_id = 'membership-chord'
  `).get() }, {
    app_device_id: identity.deviceId, account_device_id: accountDeviceId, linked_at: 2000
  });
  assert.deepEqual(await service.activateMembership(activation), {
    status: 'active', membershipId: 'membership-chord', alreadyActive: true
  });
  const summary = await service.getAccountSummary(accountId);
  const chord = summary.memberships.find((membership) => membership.appId === 'chord');
  assert.equal(chord.state, 'active');
  assert.equal(chord.dataset.state, 'ready');
  assert.equal(chord.dataset.manifestHash, 'c'.repeat(64));
  db.close();
});

test('membership activation rejects a cross-app or unknown device without a partial link', async () => {
  const db = createSqliteD1();
  enableAccountControl(db);
  const service = serviceFor(db);
  await service.provisionAccount(input());
  const identity = seedActiveAppIdentity(db);
  const result = await service.activateMembership({
    accountId,
    membershipId: 'membership-pitch',
    appId: 'pitch',
    syncUserId: identity.userId,
    appDeviceId: identity.deviceId,
    accountDeviceId,
    recoveryMode: 'account',
    now: 2000
  });
  assert.deepEqual(result, { status: 'invalid' });
  assert.deepEqual({ ...db.raw.prepare(`
    SELECT state, sync_user_id, generation FROM sync_account_memberships
    WHERE id = 'membership-pitch'
  `).get() }, { state: 'pending', sync_user_id: null, generation: 1 });
  assert.equal(db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_membership_device_links
    WHERE membership_id = 'membership-pitch'
  `).get().count, 0);
  db.close();
});

test('invalid or duplicate membership input is rejected before D1 mutation', async () => {
  const db = createSqliteD1();
  enableAccountControl(db);
  const service = serviceFor(db);
  assert.deepEqual(await service.provisionAccount(input({
    memberships: [
      { id: 'membership-one', appId: 'chord' },
      { id: 'membership-two', appId: 'chord' }
    ]
  })), { status: 'invalid' });
  assert.deepEqual(await service.provisionAccount(input({
    memberships: [{ id: 'membership-unknown', appId: 'unknown' }]
  })), { status: 'invalid' });
  assert.deepEqual(await service.provisionAccount(input({
    accountCredentialVerifier: 'a'.repeat(64)
  })), { status: 'invalid' });
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_accounts').get().count, 0);
  db.close();
});
