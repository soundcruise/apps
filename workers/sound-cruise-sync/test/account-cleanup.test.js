import test from 'node:test';
import assert from 'node:assert/strict';
import { CLEANUP_RETENTION, createD1CleanupRepository } from '../src/cleanup-database.js';
import { createD1AccountRepository } from '../src/account-database.js';
import { createSqliteD1 } from './sqlite-d1.js';

test('expired Account handoff cleanup is bounded and idempotent', async () => {
  const db = createSqliteD1();
  await createD1AccountRepository(db).createAccountBackbone({
    accountId: 'cleanup-account',
    accountDeviceId: 'cleanup-device',
    recoveryVerifier: 'a'.repeat(64),
    accountCredentialVerifier: 'b'.repeat(64),
    accountDeviceLabel: null,
    memberships: [{ id: 'cleanup-membership', appId: 'chord' }],
    now: 1
  });
  const insert = db.raw.prepare(`
    INSERT INTO sync_membership_handoffs (
      handoff_id, handoff_verifier, account_id, membership_id,
      created_by_account_device_id, claimed_by_app_device_id,
      created_at, expires_at, consumed_at, cancelled_at,
      issue_operation_id, issue_fingerprint
    ) VALUES (?, ?, 'cleanup-account', 'cleanup-membership', 'cleanup-device',
              NULL, 1, 2, NULL, NULL, ?, ?)
  `);
  for (let index = 0; index < CLEANUP_RETENTION.batchSize + 1; index += 1) {
    const suffix = String(index).padStart(3, '0');
    insert.run(`handoff-${suffix}`, `verifier-${suffix}`, `operation-${suffix}`, 'c'.repeat(64));
  }
  const now = CLEANUP_RETENTION.accountHandoffMs + 3;
  const repository = createD1CleanupRepository(db, () => now);
  assert.equal((await repository.cleanup()).accountHandoffs, CLEANUP_RETENTION.batchSize);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_membership_handoffs').get().count, 1);
  assert.equal((await repository.cleanup()).accountHandoffs, 1);
  assert.equal((await repository.cleanup()).accountHandoffs, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM sync_membership_handoffs').get().count, 0);
  db.close();
});
