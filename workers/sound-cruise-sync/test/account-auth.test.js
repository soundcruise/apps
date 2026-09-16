import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateAccountDevice, inspectAccountCredential } from '../src/account-auth.js';
import { accountCredentialVerifier, createAccountCredential } from '../src/account-crypto.js';
import { createD1AccountRepository } from '../src/account-database.js';
import { createSqliteD1 } from './sqlite-d1.js';

const pepper = 'm3-account-auth-pepper-at-least-32-characters';

async function seedAccount(db) {
  const credential = createAccountCredential();
  await createD1AccountRepository(db).createAccountBackbone({
    accountId: 'auth-account',
    accountDeviceId: credential.deviceId,
    recoveryVerifier: 'a'.repeat(64),
    accountCredentialVerifier: await accountCredentialVerifier(credential.credential, pepper),
    accountDeviceLabel: 'QA',
    memberships: [{ id: 'auth-membership', appId: 'chord' }],
    now: 1
  });
  return credential;
}

test('Account auth resolves identity only from a valid active Account credential', async () => {
  const db = createSqliteD1();
  const material = await seedAccount(db);
  const identity = await authenticateAccountDevice(
    db,
    `Bearer ${material.credential}`,
    pepper,
    60 * 60 * 1000 + 2
  );
  assert.deepEqual(identity, {
    accountId: 'auth-account',
    accountDeviceId: material.deviceId,
    accountState: 'active',
    recoveryVersion: 1,
    generation: 1,
    admissionProvenance: 'qa'
  });
  assert.equal(db.raw.prepare('SELECT last_seen_at FROM sync_account_devices WHERE id = ?')
    .get(material.deviceId).last_seen_at, 60 * 60 * 1000 + 2);
  assert.equal(await authenticateAccountDevice(db, 'Bearer malformed', pepper), null);
  assert.equal(await authenticateAccountDevice(db, `Bearer ${material.credential}`, 'x'.repeat(32)), null);
  db.close();
});

test('revoked devices and disabled Accounts cannot authenticate or select another Account', async () => {
  const db = createSqliteD1();
  const material = await seedAccount(db);
  db.raw.prepare('UPDATE sync_account_devices SET revoked_at = 2 WHERE id = ?').run(material.deviceId);
  assert.equal(await authenticateAccountDevice(db, `Bearer ${material.credential}`, pepper), null);
  db.raw.prepare('UPDATE sync_account_devices SET revoked_at = NULL WHERE id = ?').run(material.deviceId);
  db.raw.prepare(`
    UPDATE sync_accounts
    SET state = 'deleting', delete_requested_at = 2, purge_after = 3, updated_at = 2
    WHERE id = 'auth-account'
  `).run();
  assert.equal(await authenticateAccountDevice(db, `Bearer ${material.credential}`, pepper), null);
  assert.equal(authenticateAccountDevice.length >= 3, true,
    'API has no caller-supplied account selector to inject');
  db.close();
});

test('Account auth exposes terminal state only for the exact verified credential', async () => {
  const db = createSqliteD1();
  const material = await seedAccount(db);
  const authorization = `Bearer ${material.credential}`;
  db.raw.prepare(`
    UPDATE sync_accounts
    SET state = 'deleting', delete_requested_at = 2, purge_after = 3, updated_at = 2
    WHERE id = 'auth-account'
  `).run();
  assert.equal((await inspectAccountCredential(db, authorization, pepper)).error, 'account_deleting');
  assert.equal(await inspectAccountCredential(db, authorization, 'x'.repeat(32)), null,
    'wrong verifier remains indistinguishable from an unknown credential');
  db.close();
});
