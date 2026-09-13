import test from 'node:test';
import assert from 'node:assert/strict';
import { createProvisioningIdentity } from '../src/database.js';
import { createSqliteD1 } from './sqlite-d1.js';

const VERIFIER = 'e'.repeat(64);

function input(overrides = {}) {
  return {
    userId: crypto.randomUUID(), deviceId: crypto.randomUUID(), appId: 'chord',
    credentialVerifier: crypto.randomUUID().replaceAll('-', '').padEnd(64, '0'),
    recoveryVerifier: crypto.randomUUID().replaceAll('-', '').padEnd(64, '1'),
    deviceLabel: 'Cohort QA', enrollmentVerifier: VERIFIER, now: 1000,
    initialSummary: { schemaVersion: 1, recordCount: 0, manifestHash: '0'.repeat(64) },
    ...overrides
  };
}

function issue(db, overrides = {}) {
  const value = { verifier: VERIFIER, appId: 'chord', createdAt: 1, expiresAt: 2000, ...overrides };
  db.raw.prepare(`
    INSERT INTO sync_enrollment_codes (
      code_verifier, app_id, created_at, expires_at, consumed_at, consumed_by_user_id, cancelled_at
    ) VALUES (?, ?, ?, ?, NULL, NULL, NULL)
  `).run(value.verifier, value.appId, value.createdAt, value.expiresAt);
}

test('valid Enrollment Code is consumed atomically with one verifier-only identity', async () => {
  const db = createSqliteD1();
  issue(db);
  const value = input();
  assert.equal((await createProvisioningIdentity(db, value)).status, 'created');
  const code = db.raw.prepare('SELECT * FROM sync_enrollment_codes WHERE code_verifier = ?').get(VERIFIER);
  assert.equal(code.consumed_at, 1000);
  assert.equal(code.consumed_by_user_id, value.userId);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 1);
  assert.equal(JSON.stringify(db.raw.prepare('SELECT * FROM sync_devices').get()).includes('scd1.'), false);
  db.close();
});

test('invalid, expired, consumed, cancelled, wrong-app and wrong-verifier codes create no identity', async () => {
  for (const variant of ['expired', 'consumed', 'cancelled', 'wrong_app', 'wrong_verifier']) {
    const db = createSqliteD1();
    issue(db);
    if (variant === 'expired') db.raw.prepare('UPDATE sync_enrollment_codes SET expires_at = 999').run();
    if (variant === 'consumed') {
      const owner = input({ enrollmentVerifier: null });
      await createProvisioningIdentity(db, owner);
      db.raw.prepare('UPDATE sync_enrollment_codes SET consumed_at = 500, consumed_by_user_id = ?').run(owner.userId);
    }
    if (variant === 'cancelled') db.raw.prepare('UPDATE sync_enrollment_codes SET cancelled_at = 500').run();
    const value = input(variant === 'wrong_verifier'
      ? { enrollmentVerifier: 'f'.repeat(64) }
      : variant === 'wrong_app' ? { appId: 'pitch' } : {});
    assert.equal((await createProvisioningIdentity(db, value)).status, 'enrollment_invalid', variant);
    const count = db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users WHERE id = ?').get(value.userId).count;
    assert.equal(count, 0, variant);
    db.close();
  }
});

test('same-code race and response-loss retry never create or consume a second identity', async () => {
  const db = createSqliteD1();
  issue(db);
  const first = input();
  const second = input();
  const results = [await createProvisioningIdentity(db, first), await createProvisioningIdentity(db, second)];
  assert.deepEqual(results.map((result) => result.status).sort(), ['created', 'enrollment_invalid']);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 1);
  assert.equal((await createProvisioningIdentity(db, input())).status, 'enrollment_invalid', 'lost response cannot reuse the code');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_users').get().count, 1);
  db.close();
});

test('failed identity transaction rolls Enrollment consumption back', async () => {
  const db = createSqliteD1();
  issue(db);
  const existing = input({ enrollmentVerifier: null });
  await createProvisioningIdentity(db, existing);
  await assert.rejects(createProvisioningIdentity(db, input({ deviceId: existing.deviceId })), /UNIQUE|constraint|transaction/i);
  const code = db.raw.prepare('SELECT consumed_at, consumed_by_user_id FROM sync_enrollment_codes').get();
  assert.equal(code.consumed_at, null);
  assert.equal(code.consumed_by_user_id, null);
  db.close();
});
