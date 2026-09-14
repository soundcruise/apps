import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/app.js';
import {
  accountCredentialVerifier,
  accountRecoveryCodeVerifier,
  createAccountCredential,
  createAccountRecoveryCode
} from '../src/account-crypto.js';
import { createIdentityMaterial } from '../src/crypto.js';
import { createD1RecoveryRepository } from '../src/recovery-database.js';
import { createSqliteD1 } from './sqlite-d1.js';

const origin = 'https://soundcruise.jp';
const appPepper = 'm4-chord-app-credential-pepper-32-characters';
const accountPepper = 'm4-account-credential-pepper-32-characters';
const recoveryPepper = 'm4-account-recovery-pepper-32-characters';

function limiter(success = true) {
  return { async limit() { return { success }; } };
}

function enableAccount(db) {
  db.raw.prepare(`
    UPDATE sync_account_runtime_control
    SET rollout_mode = 'open', account_admission_enabled = 1,
        membership_admission_enabled = 1, account_read_enabled = 1,
        generation = generation + 1, updated_at = 1
    WHERE singleton_id = 1
  `).run();
}

async function fixture(options = {}) {
  const db = createSqliteD1();
  enableAccount(db);
  const app = await createIdentityMaterial(appPepper);
  const account = createAccountCredential();
  const accountRecoveryCode = createAccountRecoveryCode();
  const accountVerifier = await accountCredentialVerifier(account.credential, accountPepper);
  const accountRecoveryVerifier = await accountRecoveryCodeVerifier(accountRecoveryCode, recoveryPepper);
  const legacyRecoveryVerifier = '1'.repeat(64);
  const membershipId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const now = 1000;
  db.raw.prepare(`
    INSERT INTO sync_users (
      id, state, recovery_version, recovery_verifier, created_at, updated_at,
      recovery_created_at, recovery_rotated_at
    ) VALUES (?, ?, 1, ?, ?, ?, ?, ?)
  `).run(app.userId, options.userState || 'active', legacyRecoveryVerifier, now, now, now, now);
  db.raw.prepare(`
    INSERT INTO sync_devices (
      id, user_id, app_id, credential_version, credential_verifier, label,
      last_cursor, created_at, last_seen_at, revoked_at, pairing_pending_at, paired_at
    ) VALUES (?, ?, 'chord', 1, ?, 'Legacy Chord', 0, ?, ?, NULL, NULL, ?)
  `).run(app.deviceId, app.userId, app.credentialVerifier, now, now, now);
  db.raw.prepare(`
    INSERT INTO sync_datasets (
      user_id, app_id, state, schema_version, record_count, manifest_hash,
      min_change_seq, initialized_at, updated_at, last_change_seq
    ) VALUES (?, 'chord', ?, 1, 3, ?, 0, ?, ?, 0)
  `).run(app.userId, options.datasetState || 'ready', 'a'.repeat(64), now, now);
  const insertRecord = db.raw.prepare(`
    INSERT INTO sync_records (
      user_id, app_id, record_type, record_id, payload_json, payload_hash,
      revision, updated_at, deleted_at, updated_by_device_id, last_operation_id, schema_version
    ) VALUES (?, 'chord', ?, ?, '{}', ?, 1, ?, NULL, ?, ?, 1)
  `);
  insertRecord.run(app.userId, 'chord', crypto.randomUUID(), 'b'.repeat(64), now, app.deviceId, crypto.randomUUID());
  insertRecord.run(app.userId, 'chord', crypto.randomUUID(), 'c'.repeat(64), now, app.deviceId, crypto.randomUUID());
  insertRecord.run(app.userId, 'folder', crypto.randomUUID(), 'd'.repeat(64), now, app.deviceId, crypto.randomUUID());
  db.raw.prepare(`
    INSERT INTO sync_accounts (
      id, state, recovery_version, recovery_verifier, generation,
      created_at, updated_at, recovery_created_at, recovery_rotated_at
    ) VALUES (?, 'active', 1, ?, 1, ?, ?, ?, ?)
  `).run(accountId, accountRecoveryVerifier, now, now, now, now);
  db.raw.prepare(`
    INSERT INTO sync_account_devices (
      id, account_id, credential_version, credential_verifier, label,
      created_at, last_seen_at, revoked_at
    ) VALUES (?, ?, 1, ?, 'Account container', ?, ?, NULL)
  `).run(account.deviceId, accountId, accountVerifier, now, now);
  db.raw.prepare(`
    INSERT INTO sync_account_memberships (
      id, account_id, app_id, state, sync_user_id, recovery_mode,
      generation, created_at, activated_at, updated_at, deleted_at
    ) VALUES (?, ?, 'chord', 'pending', NULL, 'account', 1, ?, NULL, ?, NULL)
  `).run(membershipId, accountId, now, now);
  db.raw.prepare(`
    INSERT INTO sync_account_memberships (
      id, account_id, app_id, state, sync_user_id, recovery_mode,
      generation, created_at, activated_at, updated_at, deleted_at
    ) VALUES (?, ?, 'rhythm', 'pending', NULL, 'account', 1, ?, NULL, ?, NULL)
  `).run(crypto.randomUUID(), accountId, now, now);
  return {
    db,
    app,
    account,
    accountId,
    membershipId,
    accountRecoveryCode,
    accountRecoveryVerifier,
    legacyRecoveryVerifier
  };
}

function environment(db, overrides = {}) {
  return {
    SYNC_DB: db,
    ACCOUNT_ALLOWED_ORIGINS: origin,
    SYNC_ACCOUNT_CREDENTIAL_PEPPER: accountPepper,
    SYNC_ACCOUNT_RECOVERY_PEPPER: recoveryPepper,
    SYNC_CREDENTIAL_PEPPER: appPepper,
    ACCOUNT_BRIDGE_RATE_LIMITER: limiter(),
    ...overrides
  };
}

function bridgeRequest(path, body, setup, options = {}) {
  const headers = new Headers({
    Origin: options.origin || origin,
    Authorization: `Bearer ${options.accountCredential || setup.account.credential}`,
    'X-Sound-Cruise-App-Authorization': `Bearer ${options.appCredential || setup.app.credential}`
  });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return new Request(`https://sync.example${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function prepareBridge(setup, env = environment(setup.db), operationId = crypto.randomUUID()) {
  const expectedAccountGeneration = Number(setup.db.raw.prepare(`
    SELECT generation FROM sync_accounts WHERE id = ?
  `).get(setup.accountId).generation);
  const response = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord/prepare', {
    operationId,
    membershipId: setup.membershipId,
    expectedAccountGeneration
  }, setup), env);
  return { response, body: await response.json(), operationId };
}

async function commitDual(setup, bridge, env = environment(setup.db), operationId = crypto.randomUUID()) {
  const response = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord/dual', {
    operationId,
    bridgeId: bridge.bridgeId,
    expectedBridgeGeneration: bridge.generation,
    accountRecoveryVersion: 1,
    recoverySaved: true
  }, setup), env);
  return { response, body: await response.json(), operationId };
}

test('prepare proves both owners and summarizes the existing dataset without mutating legacy state', async () => {
  const setup = await fixture();
  const before = setup.db.raw.prepare(`
    SELECT u.recovery_version, u.recovery_verifier, d.credential_verifier,
           d.revoked_at, s.state, s.record_count
    FROM sync_users u JOIN sync_devices d ON d.user_id = u.id
    JOIN sync_datasets s ON s.user_id = u.id AND s.app_id = d.app_id
    WHERE u.id = ?
  `).get(setup.app.userId);
  const prepared = await prepareBridge(setup);
  assert.equal(prepared.response.status, 201, JSON.stringify(prepared.body));
  assert.equal(prepared.body.operation, 'prepared');
  assert.deepEqual(prepared.body.summary, {
    appId: 'chord', appName: 'Chord Cruise', datasetState: 'ready',
    recordCount: 3, chordCount: 2, folderCount: 1, activeDeviceCount: 1,
    manifestHash: 'a'.repeat(64), updatedAt: 1000,
    recoveryMode: 'legacy', membershipState: 'pending'
  });
  assert.deepEqual(setup.db.raw.prepare(`
    SELECT u.recovery_version, u.recovery_verifier, d.credential_verifier,
           d.revoked_at, s.state, s.record_count
    FROM sync_users u JOIN sync_devices d ON d.user_id = u.id
    JOIN sync_datasets s ON s.user_id = u.id AND s.app_id = d.app_id
    WHERE u.id = ?
  `).get(setup.app.userId), before);
  assert.equal(setup.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_datasets').get().count, 1);
  const prepareRetry = await prepareBridge(
    setup,
    environment(setup.db, { ACCOUNT_BRIDGE_RATE_LIMITER: limiter(false) }),
    prepared.operationId
  );
  assert.equal(prepareRetry.response.status, 200);
  assert.equal(prepareRetry.body.alreadyApplied, true);
  assert.equal(prepareRetry.body.bridge.bridgeId, prepared.body.bridge.bridgeId);
  const duplicatePrepare = await prepareBridge(setup);
  assert.equal(duplicatePrepare.response.status, 200);
  assert.equal(duplicatePrepare.body.bridge.bridgeId, prepared.body.bridge.bridgeId);
  assert.equal(setup.db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_chord_account_bridges
  `).get().count, 1);

  const wrongApp = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord', undefined, setup, {
    appCredential: (await createIdentityMaterial(appPepper)).credential
  }), environment(setup.db));
  assert.equal(wrongApp.status, 401);
  setup.db.close();
});

test('dual commit is acknowledged, response-loss safe and finalize disables only legacy Recovery', async () => {
  const setup = await fixture();
  const prepared = await prepareBridge(setup);
  const beforeDataset = setup.db.raw.prepare(`
    SELECT state, record_count, manifest_hash FROM sync_datasets WHERE user_id = ? AND app_id = 'chord'
  `).get(setup.app.userId);
  const dual = await commitDual(setup, prepared.body.bridge);
  assert.equal(dual.response.status, 201, JSON.stringify(dual.body));
  assert.equal(dual.body.operation, 'dual');
  let membership = setup.db.raw.prepare(`
    SELECT state, sync_user_id, recovery_mode, generation FROM sync_account_memberships WHERE id = ?
  `).get(setup.membershipId);
  assert.deepEqual({ ...membership }, {
    state: 'active', sync_user_id: setup.app.userId, recovery_mode: 'dual', generation: 2
  });
  assert.equal(setup.db.raw.prepare(`
    SELECT recovery_verifier FROM sync_users WHERE id = ?
  `).get(setup.app.userId).recovery_verifier, setup.legacyRecoveryVerifier);
  assert.deepEqual(setup.db.raw.prepare(`
    SELECT state, record_count, manifest_hash FROM sync_datasets WHERE user_id = ? AND app_id = 'chord'
  `).get(setup.app.userId), beforeDataset);

  const limitedEnv = environment(setup.db, { ACCOUNT_BRIDGE_RATE_LIMITER: limiter(false) });
  const dualRetry = await commitDual(setup, prepared.body.bridge, limitedEnv, dual.operationId);
  assert.equal(dualRetry.response.status, 200);
  assert.equal(dualRetry.body.bridge.bridgeId, prepared.body.bridge.bridgeId);

  const finalizeOperation = crypto.randomUUID();
  let response = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord/finalize', {
    operationId: finalizeOperation,
    bridgeId: dual.body.bridge.bridgeId,
    expectedBridgeGeneration: dual.body.bridge.generation
  }, setup), environment(setup.db));
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const finalized = await response.json();
  assert.equal(finalized.operation, 'finalized');
  membership = setup.db.raw.prepare(`
    SELECT state, sync_user_id, recovery_mode, legacy_recovery_disabled_at
    FROM sync_account_memberships WHERE id = ?
  `).get(setup.membershipId);
  assert.equal(membership.recovery_mode, 'account');
  assert.notEqual(membership.legacy_recovery_disabled_at, null);
  const user = setup.db.raw.prepare(`
    SELECT recovery_version, recovery_verifier, state FROM sync_users WHERE id = ?
  `).get(setup.app.userId);
  assert.equal(user.recovery_version, 2);
  assert.notEqual(user.recovery_verifier, setup.legacyRecoveryVerifier);
  assert.equal(user.state, 'active');
  assert.equal(setup.db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_account_managed_users WHERE sync_user_id = ?
  `).get(setup.app.userId).count, 1);
  assert.equal(setup.db.raw.prepare(`
    SELECT revoked_at FROM sync_devices WHERE id = ?
  `).get(setup.app.deviceId).revoked_at, null);
  assert.deepEqual(setup.db.raw.prepare(`
    SELECT state, record_count, manifest_hash FROM sync_datasets WHERE user_id = ? AND app_id = 'chord'
  `).get(setup.app.userId), beforeDataset);

  response = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord/finalize', {
    operationId: finalizeOperation,
    bridgeId: dual.body.bridge.bridgeId,
    expectedBridgeGeneration: dual.body.bridge.generation
  }, setup), limitedEnv);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).alreadyApplied, true);
  setup.db.close();
});

test('dual rollback preserves the Account and legacy Chord authority while finalized bridge is forward-only', async () => {
  const preparedOnly = await fixture();
  const preparedOnlyBridge = await prepareBridge(preparedOnly);
  let response = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord/rollback', {
    operationId: crypto.randomUUID(),
    bridgeId: preparedOnlyBridge.body.bridge.bridgeId,
    expectedBridgeGeneration: preparedOnlyBridge.body.bridge.generation
  }, preparedOnly), environment(preparedOnly.db));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).operation, 'rolled_back');
  assert.equal(preparedOnly.db.raw.prepare(`
    SELECT recovery_verifier FROM sync_users WHERE id = ?
  `).get(preparedOnly.app.userId).recovery_verifier, preparedOnly.legacyRecoveryVerifier);
  assert.equal(preparedOnly.db.raw.prepare(`
    SELECT state FROM sync_account_memberships WHERE id = ?
  `).get(preparedOnly.membershipId).state, 'pending');
  preparedOnly.db.close();

  const setup = await fixture();
  const prepared = await prepareBridge(setup);
  const dual = await commitDual(setup, prepared.body.bridge);
  response = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord/rollback', {
    operationId: crypto.randomUUID(),
    bridgeId: dual.body.bridge.bridgeId,
    expectedBridgeGeneration: dual.body.bridge.generation
  }, setup), environment(setup.db));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).operation, 'rolled_back');
  assert.deepEqual({ ...setup.db.raw.prepare(`
    SELECT state, sync_user_id, recovery_mode FROM sync_account_memberships WHERE id = ?
  `).get(setup.membershipId) }, { state: 'pending', sync_user_id: null, recovery_mode: 'account' });
  assert.equal(setup.db.raw.prepare(`
    SELECT recovery_verifier FROM sync_users WHERE id = ?
  `).get(setup.app.userId).recovery_verifier, setup.legacyRecoveryVerifier);
  assert.equal(setup.db.raw.prepare('SELECT COUNT(*) AS count FROM sync_accounts').get().count, 1);
  assert.equal(setup.db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_account_memberships WHERE account_id = ? AND app_id = 'rhythm'
  `).get(setup.accountId).count, 1);

  const fresh = await prepareBridge(setup, environment(setup.db));
  const nextDual = await commitDual(setup, fresh.body.bridge);
  response = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord/finalize', {
    operationId: crypto.randomUUID(), bridgeId: nextDual.body.bridge.bridgeId,
    expectedBridgeGeneration: nextDual.body.bridge.generation
  }, setup), environment(setup.db));
  const finalized = await response.json();
  response = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord/rollback', {
    operationId: crypto.randomUUID(), bridgeId: finalized.bridge.bridgeId,
    expectedBridgeGeneration: finalized.bridge.generation
  }, setup), environment(setup.db));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'bridge_forward_only');
  setup.db.close();
});

test('eligibility and concurrency reject initializing, deleting, active Recovery and cross-Account ownership', async () => {
  const initializing = await fixture({ datasetState: 'initializing' });
  let prepared = await prepareBridge(initializing);
  assert.equal(prepared.response.status, 409);
  assert.equal(prepared.body.code, 'bridge_ineligible');
  initializing.db.close();

  const deleting = await fixture({ userState: 'deleting' });
  prepared = await prepareBridge(deleting);
  assert.equal(prepared.response.status, 401, 'app authentication rejects deleting users before bridge');
  deleting.db.close();

  const activeClaim = await fixture();
  activeClaim.db.raw.prepare(`
    INSERT INTO recovery_claims (
      claim_id, claim_verifier, user_id, target_app_id, expected_recovery_version,
      next_recovery_verifier, next_device_id, next_credential_verifier,
      created_at, expires_at
    ) VALUES (?, ?, ?, 'chord', 1, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(), '2'.repeat(64), activeClaim.app.userId, '3'.repeat(64),
    crypto.randomUUID(), '4'.repeat(64), Date.now(), Date.now() + 60000
  );
  prepared = await prepareBridge(activeClaim);
  assert.equal(prepared.response.status, 409);
  activeClaim.db.close();

  const concurrent = await fixture();
  const first = await prepareBridge(concurrent);
  const sameAccountApp = await createIdentityMaterial(appPepper);
  const sameAccountDevice = createAccountCredential();
  concurrent.db.raw.prepare(`
    INSERT INTO sync_devices (
      id, user_id, app_id, credential_version, credential_verifier,
      last_cursor, created_at, last_seen_at, paired_at
    ) VALUES (?, ?, 'chord', 1, ?, 0, 1, 1, 1)
  `).run(sameAccountApp.deviceId, concurrent.app.userId, sameAccountApp.credentialVerifier);
  concurrent.db.raw.prepare(`
    INSERT INTO sync_account_devices (
      id, account_id, credential_version, credential_verifier, created_at, last_seen_at
    ) VALUES (?, ?, 1, ?, 1, 1)
  `).run(
    sameAccountDevice.deviceId,
    concurrent.accountId,
    await accountCredentialVerifier(sameAccountDevice.credential, accountPepper)
  );
  let response = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord/prepare', {
    operationId: crypto.randomUUID(),
    membershipId: concurrent.membershipId,
    expectedAccountGeneration: 1
  }, concurrent, {
    accountCredential: sameAccountDevice.credential,
    appCredential: sameAccountApp.credential
  }), environment(concurrent.db));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'bridge_ownership_conflict');
  assert.equal(concurrent.db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_chord_account_bridges
  `).get().count, 1);

  const secondAccount = createAccountCredential();
  const secondAccountId = crypto.randomUUID();
  concurrent.db.raw.prepare(`
    INSERT INTO sync_accounts (
      id, state, recovery_version, recovery_verifier, generation,
      created_at, updated_at, recovery_created_at, recovery_rotated_at
    ) VALUES (?, 'active', 1, ?, 1, 1, 1, 1, 1)
  `).run(secondAccountId, '5'.repeat(64));
  concurrent.db.raw.prepare(`
    INSERT INTO sync_account_devices (
      id, account_id, credential_version, credential_verifier, created_at, last_seen_at
    ) VALUES (?, ?, 1, ?, 1, 1)
  `).run(secondAccount.deviceId, secondAccountId, await accountCredentialVerifier(secondAccount.credential, accountPepper));
  const secondMembership = crypto.randomUUID();
  concurrent.db.raw.prepare(`
    INSERT INTO sync_account_memberships (
      id, account_id, app_id, state, recovery_mode, generation, created_at, updated_at
    ) VALUES (?, ?, 'chord', 'pending', 'account', 1, 1, 1)
  `).run(secondMembership, secondAccountId);
  response = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord/prepare', {
    operationId: crypto.randomUUID(), membershipId: secondMembership, expectedAccountGeneration: 1
  }, concurrent, { accountCredential: secondAccount.credential }), environment(concurrent.db));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'bridge_ownership_conflict');
  assert.equal(first.body.bridge.state, 'prepared');
  concurrent.db.close();
});

test('bridge generation CAS and a Recovery race fail without partial membership mutation', async () => {
  const staleAccount = await fixture();
  const stalePrepared = await prepareBridge(staleAccount);
  staleAccount.db.raw.prepare(`
    UPDATE sync_accounts SET generation = generation + 1, updated_at = ? WHERE id = ?
  `).run(Date.now(), staleAccount.accountId);
  let dual = await commitDual(staleAccount, stalePrepared.body.bridge);
  assert.equal(dual.response.status, 409);
  assert.equal(dual.body.code, 'bridge_precondition_failed');
  assert.deepEqual({ ...staleAccount.db.raw.prepare(`
    SELECT state, sync_user_id FROM sync_account_memberships WHERE id = ?
  `).get(staleAccount.membershipId) }, { state: 'pending', sync_user_id: null });
  staleAccount.db.close();

  const racedRecovery = await fixture();
  const racedPrepared = await prepareBridge(racedRecovery);
  const now = Date.now();
  racedRecovery.db.raw.prepare(`
    INSERT INTO recovery_claims (
      claim_id, claim_verifier, user_id, target_app_id, expected_recovery_version,
      next_recovery_verifier, next_device_id, next_credential_verifier,
      created_at, expires_at
    ) VALUES (?, ?, ?, 'chord', 1, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(), '8'.repeat(64), racedRecovery.app.userId, '9'.repeat(64),
    crypto.randomUUID(), 'a'.repeat(64), now, now + 60000
  );
  dual = await commitDual(racedRecovery, racedPrepared.body.bridge);
  assert.equal(dual.response.status, 409);
  assert.equal(dual.body.code, 'legacy_recovery_active');
  assert.equal(racedRecovery.db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_membership_device_links WHERE membership_id = ?
  `).get(racedRecovery.membershipId).count, 0);
  racedRecovery.db.close();

  const staleFinalize = await fixture();
  const prepared = await prepareBridge(staleFinalize);
  dual = await commitDual(staleFinalize, prepared.body.bridge);
  staleFinalize.db.raw.prepare(`
    UPDATE sync_account_memberships
    SET generation = generation + 1, updated_at = ? WHERE id = ?
  `).run(Date.now(), staleFinalize.membershipId);
  const response = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord/finalize', {
    operationId: crypto.randomUUID(),
    bridgeId: dual.body.bridge.bridgeId,
    expectedBridgeGeneration: dual.body.bridge.generation
  }, staleFinalize), environment(staleFinalize.db));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'bridge_precondition_failed');
  assert.equal(staleFinalize.db.raw.prepare(`
    SELECT recovery_mode FROM sync_account_memberships WHERE id = ?
  `).get(staleFinalize.membershipId).recovery_mode, 'dual');
  assert.equal(staleFinalize.db.raw.prepare(`
    SELECT recovery_verifier FROM sync_users WHERE id = ?
  `).get(staleFinalize.app.userId).recovery_verifier, staleFinalize.legacyRecoveryVerifier);
  staleFinalize.db.close();
});

test('dual legacy Recovery remains authoritative, relinks the recovered device, and Account mode blocks legacy destructive APIs', async () => {
  const setup = await fixture();
  const prepared = await prepareBridge(setup);
  const dual = await commitDual(setup, prepared.body.bridge);
  const recovery = createD1RecoveryRepository(setup.db);
  const regeneratedRecoveryVerifier = '8'.repeat(64);
  const regenerated = await recovery.regenerate(
    { userId: setup.app.userId },
    regeneratedRecoveryVerifier,
    Date.now(),
    { accountId: setup.accountId, membershipId: setup.membershipId }
  );
  assert.deepEqual(regenerated, { status: 'rotated', recoveryVersion: 2 });
  assert.deepEqual({ ...setup.db.raw.prepare(`
    SELECT state, generation, expected_legacy_recovery_version
    FROM sync_chord_account_bridges WHERE bridge_id = ?
  `).get(dual.body.bridge.bridgeId) }, {
    state: 'dual', generation: 3, expected_legacy_recovery_version: 2
  });
  const next = await createIdentityMaterial(appPepper);
  const claimId = crypto.randomUUID();
  const claimVerifier = '6'.repeat(64);
  const nextRecoveryVerifier = '7'.repeat(64);
  const recoveryNow = Date.now() + 1000;
  const result = await recovery.prepare({
    currentRecoveryVerifier: regeneratedRecoveryVerifier,
    claimId,
    claimVerifier,
    appId: 'chord',
    nextRecoveryVerifier,
    nextDeviceId: next.deviceId,
    nextCredentialVerifier: next.credentialVerifier,
    deviceLabel: 'Recovered',
    now: recoveryNow
  });
  assert.equal(result.status, 'prepared');
  const committed = await recovery.commit({
    claimId, claimVerifier, appId: 'chord', now: recoveryNow + 1,
    dualBridge: { accountId: setup.accountId, membershipId: setup.membershipId }
  });
  assert.equal(committed.status, 'recovered');
  assert.equal(setup.db.raw.prepare(`
    SELECT app_device_id FROM sync_membership_device_links WHERE membership_id = ?
  `).get(setup.membershipId).app_device_id, next.deviceId);
  const bridge = setup.db.raw.prepare(`
    SELECT state, app_device_id, expected_legacy_recovery_version
    FROM sync_chord_account_bridges WHERE bridge_id = ?
  `).get(dual.body.bridge.bridgeId);
  assert.deepEqual({ ...bridge }, {
    state: 'dual', app_device_id: next.deviceId, expected_legacy_recovery_version: 3
  });

  setup.app = next;
  const current = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord', undefined, setup), environment(setup.db));
  assert.equal(current.status, 200);
  const currentBridge = (await current.json()).bridge;
  let finalize = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord/finalize', {
    operationId: crypto.randomUUID(), bridgeId: currentBridge.bridgeId,
    expectedBridgeGeneration: currentBridge.generation
  }, setup), environment(setup.db));
  assert.equal(finalize.status, 201);

  const legacyEnv = {
    SYNC_DB: setup.db,
    ALLOWED_ORIGINS: origin,
    SYNC_ALLOWED_APP_IDS: 'chord',
    SYNC_CREDENTIAL_PEPPER: appPepper,
    SYNC_RECOVERY_PEPPER: 'legacy-recovery-pepper-at-least-32-chars',
    SYNC_PAIRING_CODE_PEPPER: 'pairing-code-pepper-at-least-32-chars',
    SYNC_RATE_LIMITER: limiter(),
    PAIRING_ISSUE_RATE_LIMITER: limiter()
  };
  const open = {
    readRuntimeControl: async () => ({
      rolloutMode: 'open', admissionEnabled: true, dataWriteEnabled: true,
      dataReadEnabled: true, recoveryEnabled: true, cloudDeleteEnabled: true
    }),
    createRecoveryCode: () => '23456789ABCDEFGHJKMN'
  };
  let response = await handleRequest(new Request('https://sync.example/v1/sync/recovery-codes', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: `Bearer ${next.credential}` },
    body: JSON.stringify({ appId: 'chord' })
  }), legacyEnv, null, open);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'account_recovery_required');
  response = await handleRequest(new Request('https://sync.example/v1/sync/account/delete-intent', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: `Bearer ${next.credential}` },
    body: JSON.stringify({ appId: 'chord' })
  }), legacyEnv, null, open);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'account_membership_delete_required');
  setup.db.close();
});

test('Chord bridge is independently gated, exact-origin CORS protected and fail-closed on its limiter', async () => {
  const setup = await fixture();
  const env = environment(setup.db);
  let response = await handleRequest(new Request(
    'https://sync.example/v2/accounts/bridges/chord/prepare',
    {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers':
          'Content-Type, Authorization, X-Sound-Cruise-App-Authorization, X-D1-Bookmark'
      }
    }
  ), env);
  assert.equal(response.status, 204);
  assert.match(
    response.headers.get('Access-Control-Allow-Headers'),
    /X-Sound-Cruise-App-Authorization/u
  );

  response = await handleRequest(new Request(
    'https://sync.example/v2/accounts/bridges/chord/prepare',
    {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization, X-Other'
      }
    }
  ), env);
  assert.equal(response.status, 403);

  response = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord', undefined, setup, {
    origin: 'https://attacker.example'
  }), env);
  assert.equal(response.status, 403);

  setup.db.raw.prepare(`
    UPDATE sync_account_runtime_control
    SET rollout_mode = 'development', membership_admission_enabled = 0, updated_at = 2
    WHERE singleton_id = 1
  `).run();
  response = await handleRequest(bridgeRequest('/v2/accounts/bridges/chord/prepare', {
    operationId: crypto.randomUUID(),
    membershipId: setup.membershipId,
    expectedAccountGeneration: 1
  }, setup), env);
  assert.equal(response.status, 423);
  assert.equal((await response.json()).code, 'membership_admission_paused');

  enableAccount(setup.db);
  delete env.ACCOUNT_BRIDGE_RATE_LIMITER;
  const prepared = await prepareBridge(setup, env);
  assert.equal(prepared.response.status, 503);
  assert.equal(prepared.body.code, 'account_rate_limiter_unavailable');
  assert.equal(setup.db.raw.prepare(`
    SELECT COUNT(*) AS count FROM sync_chord_account_bridges
  `).get().count, 0);
  setup.db.close();
});
