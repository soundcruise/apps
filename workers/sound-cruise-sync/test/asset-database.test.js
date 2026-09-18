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

function addPractice(db, id = 'practice-a') {
  db.raw.prepare(`INSERT INTO sync_records (
    user_id, app_id, record_type, record_id, payload_json, payload_hash, revision,
    updated_at, updated_by_device_id, last_operation_id, schema_version
  ) VALUES ('port-user-a', 'port', 'practice_menu', ?, '{}', ?, 1, 1,
    'port-device-a', ?, 1)`).run(id, '5'.repeat(64), `practice-${id}`);
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

test('practice attachment prepare requires a live owner and applies the separate Account quota override', async () => {
  const db = fixture();
  const repository = createD1AssetRepository(db);
  const identity = { userId: 'port-user-a', deviceId: 'port-device-a', appId: 'port' };
  const authority = { accountId: 'account-a', membershipId: 'port-membership-a' };
  const base = {
    assetId: '123e4567-e89b-42d3-a456-426614174010',
    operationId: '223e4567-e89b-42d3-a456-426614174010',
    kind: 'practice_attachment_pdf', storageCategory: 'practice_attachment',
    hash: 'a'.repeat(64), mime: 'application/pdf', byteSize: 100, width: 1, height: 1,
    fingerprint: 'b'.repeat(64), objectKey: 'assets/private/practice-1',
    ownerRecordType: 'practice_menu', ownerRecordId: 'practice-a', originalFilename: 'score.pdf', now: 10
  };
  assert.equal((await repository.prepare(identity, authority, base)).status, 'relation_missing');
  addPractice(db);
  db.raw.prepare(`INSERT INTO sync_account_asset_quotas
    (account_id, storage_category, storage_limit_bytes, asset_variant_limit, daily_new_variant_limit, created_at, updated_at)
    VALUES ('account-a', 'practice_attachment', 150, 5, 5, 1, 1)`).run();
  assert.equal((await repository.prepare(identity, authority, base)).status, 'prepared');
  const second = { ...base,
    assetId: '123e4567-e89b-42d3-a456-426614174011',
    operationId: '223e4567-e89b-42d3-a456-426614174011',
    objectKey: 'assets/private/practice-2', fingerprint: 'c'.repeat(64), now: 11
  };
  assert.equal((await repository.prepare(identity, authority, second)).status, 'quota');
  assert.equal(db.raw.prepare("SELECT COUNT(*) count FROM sync_assets WHERE storage_category='image'").get().count, 0,
    'practice usage never consumes the separate image quota');
  db.close();
});

test('practice attachment owner count fails closed at ten active assets', async () => {
  const db = fixture();
  addPractice(db);
  for (let index = 0; index < 10; index += 1) {
    const suffix = String(index).padStart(12, '0');
    db.raw.prepare(`INSERT INTO sync_assets (
      asset_id, account_id, membership_id, sync_user_id, kind, state, storage_category,
      content_hash, mime_type, byte_size, width, height, object_key, object_version,
      created_by_device_id, owner_record_type, owner_record_id, original_filename, created_at, updated_at
    ) VALUES (?, 'account-a', 'port-membership-a', 'port-user-a', 'practice_attachment_text',
      'available', 'practice_attachment', ?, 'text/plain', 1, 1, 1, ?, 1,
      'port-device-a', 'practice_menu', 'practice-a', ?, 1, 1)`)
      .run(`00000000-0000-4000-8000-${suffix}`, 'd'.repeat(64), `assets/practice/${index}`, `note-${index}.txt`);
  }
  const repository = createD1AssetRepository(db);
  const result = await repository.prepare(
    { userId: 'port-user-a', deviceId: 'port-device-a', appId: 'port' },
    { accountId: 'account-a', membershipId: 'port-membership-a' },
    {
      assetId: '123e4567-e89b-42d3-a456-426614174020',
      operationId: '223e4567-e89b-42d3-a456-426614174020',
      kind: 'practice_attachment_text', storageCategory: 'practice_attachment',
      hash: 'e'.repeat(64), mime: 'text/plain', byteSize: 1, width: 1, height: 1,
      fingerprint: 'f'.repeat(64), objectKey: 'assets/private/practice-11',
      ownerRecordType: 'practice_menu', ownerRecordId: 'practice-a', originalFilename: 'note.txt', now: 10
    }
  );
  assert.equal(result.status, 'practice_limit');
  db.close();
});
