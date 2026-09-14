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
import { createSqliteD1 } from './sqlite-d1.js';

const accountCredentialPepper = 'm3-account-credential-pepper-32-characters';
const accountRecoveryPepper = 'm3-account-recovery-pepper-at-least-32';
const handoffPepper = 'm3-account-handoff-pepper-at-least-32';
const appPepper = 'm3-existing-sync-app-pepper-at-least-32';

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
  return {
    db,
    repository: createD1AccountHandoffRepository(db),
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
    now
  });
  return { material, verifier, operationId, fingerprint, result };
}

async function consumeInput(issued, appId = 'chord', overrides = {}) {
  const account = createAccountCredential();
  const app = await createIdentityMaterial(appPepper);
  const operationId = crypto.randomUUID();
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
    syncUserId: crypto.randomUUID(),
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
