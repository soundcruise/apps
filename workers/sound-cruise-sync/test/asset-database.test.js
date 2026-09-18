import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1AssetRepository } from '../src/asset-database.js';
import { createSqliteD1 } from './sqlite-d1.js';

function fixture() {
  const db = createSqliteD1();
  db.raw.prepare(`INSERT INTO sync_accounts
    (id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,recovery_created_at,recovery_rotated_at,admission_provenance)
    VALUES ('account-a','active',1,?,1,1,1,1,1,'production')`).run('1'.repeat(64));
  db.raw.prepare(`INSERT INTO sync_account_devices
    (id,account_id,credential_version,credential_verifier,created_at,last_seen_at)
    VALUES ('account-device-a','account-a',1,?,1,1)`).run('2'.repeat(64));
  db.raw.prepare(`INSERT INTO sync_users
    (id,state,recovery_version,recovery_verifier,created_at,updated_at,recovery_created_at,recovery_rotated_at)
    VALUES ('port-user-a','active',1,?,1,1,1,1)`).run('3'.repeat(64));
  db.raw.prepare(`INSERT INTO sync_devices
    (id,user_id,app_id,credential_version,credential_verifier,last_cursor,created_at,last_seen_at,paired_at)
    VALUES ('port-device-a','port-user-a','port',1,?,0,1,1,1)`).run('4'.repeat(64));
  db.raw.prepare(`INSERT INTO sync_account_memberships
    (id,account_id,app_id,state,sync_user_id,recovery_mode,generation,created_at,activated_at,updated_at)
    VALUES ('port-membership-a','account-a','port','active','port-user-a','account',1,1,1,1)`).run();
  db.raw.prepare(`INSERT INTO sync_account_managed_users
    (sync_user_id,account_id,membership_id,app_id,created_at)
    VALUES ('port-user-a','account-a','port-membership-a','port',1)`).run();
  db.raw.prepare(`INSERT INTO sync_datasets
    (user_id,app_id,state,schema_version,record_count,min_change_seq,updated_at,last_change_seq)
    VALUES ('port-user-a','port','ready',1,0,0,1,0)`).run();
  return db;
}

test('prepare/upload/commit is idempotent and ownership scoped', async () => {
  const db = fixture();
  const repository = createD1AssetRepository(db);
  const identity = { userId: 'port-user-a', deviceId: 'port-device-a', appId: 'port' };
  const authority = { accountId: 'account-a', membershipId: 'port-membership-a' };
  const input = {
    assetId: '123e4567-e89b-42d3-a456-426614174000',
    operationId: '223e4567-e89b-42d3-a456-426614174000',
    kind: 'gear_photo_final', hash: 'a'.repeat(64), mime: 'image/webp',
    byteSize: 12, width: 512, height: 512, fingerprint: 'b'.repeat(64),
    objectKey: 'assets/private/key', now: 10
  };
  assert.equal((await repository.prepare(identity, authority, input)).status, 'prepared');
  assert.equal((await repository.prepare(identity, authority, input)).status, 'prepared');
  const target = await repository.uploadTarget(identity, authority, input.assetId, input.operationId);
  assert.equal(target.object_key, 'assets/private/key');
  assert.equal(await repository.uploadTarget({ ...identity, deviceId: 'wrong-device' }, authority,
    input.assetId, input.operationId), null);
  await repository.markUploaded(target, 11);
  assert.equal((await repository.commit(identity, authority, { ...input, now: 12 })).status, 'available');
  assert.equal((await repository.commit(identity, authority, { ...input, now: 13 })).status, 'available');
  assert.equal(await repository.available(identity, { ...authority, accountId: 'account-b' }, input.assetId), null);
  assert.equal(await repository.available(identity, { ...authority, membershipId: 'wrong-membership' }, input.assetId), null);
  assert.equal(await repository.available({ ...identity, userId: 'wrong-user' }, authority, input.assetId), null);
  assert.equal(await repository.unreference(identity, authority, [input.assetId], 14), 1);
  assert.equal((await repository.cleanupCandidates(50, 1, 1, 100)).length, 1);
  db.close();
});
