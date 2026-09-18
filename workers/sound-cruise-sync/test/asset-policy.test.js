import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1AssetRepository, dayKey, globalStorageGuard } from '../src/asset-database.js';
import { ASSET_QUOTA, GLOBAL_ASSET_QUOTA } from '../src/asset-validation.js';
import { createD1AccountRepository } from '../src/account-database.js';
import { createD1CleanupRepository } from '../src/cleanup-database.js';
import { touchAccountActivity } from '../src/account-activity.js';
import { createSqliteD1 } from './sqlite-d1.js';

const DAY = Date.UTC(2026, 8, 18, 12);
const identity = { userId: 'port-user', deviceId: 'port-device', appId: 'port' };
const authority = { accountId: 'account-a', membershipId: 'port-membership' };

async function seeded() {
  const db = createSqliteD1();
  await createD1AccountRepository(db).createAccountBackbone({
    accountId: 'account-a', accountDeviceId: 'account-device', recoveryVerifier: 'a'.repeat(64),
    accountCredentialVerifier: 'b'.repeat(64), accountDeviceLabel: null,
    memberships: [{ id: 'port-membership', appId: 'port' }], now: 1
  });
  db.raw.prepare(`INSERT INTO sync_users
    (id,state,recovery_version,recovery_verifier,created_at,updated_at,recovery_created_at,recovery_rotated_at)
    VALUES ('port-user','active',1,?,1,1,1,1)`).run('c'.repeat(64));
  db.raw.prepare(`INSERT INTO sync_devices
    (id,user_id,app_id,credential_version,credential_verifier,last_cursor,created_at,last_seen_at,paired_at)
    VALUES ('port-device','port-user','port',1,?,0,1,1,1)`).run('d'.repeat(64));
  db.raw.prepare(`UPDATE sync_account_memberships SET state='active',sync_user_id='port-user',activated_at=1
    WHERE id='port-membership'`).run();
  db.raw.prepare(`INSERT INTO sync_account_managed_users
    (sync_user_id,account_id,membership_id,app_id,created_at)
    VALUES ('port-user','account-a','port-membership','port',1)`).run();
  return db;
}

function input(index = 0, now = DAY) {
  const suffix = String(index).padStart(12, '0');
  return {
    assetId: `123e4567-e89b-42d3-a456-${suffix}`,
    operationId: `223e4567-e89b-42d3-a456-${suffix}`,
    kind: 'gear_photo_final', hash: `${String(index % 10).repeat(64)}`, mime: 'image/webp',
    byteSize: 12, width: 512, height: 512, fingerprint: 'f'.repeat(64),
    objectKey: `assets/private/${index}`, now
  };
}

test('asset policy applies the 1 GiB/1000 default and an Account-only override', async () => {
  const db = await seeded();
  const repository = createD1AssetRepository(db);
  assert.deepEqual({ bytes: ASSET_QUOTA.maxBytes, count: ASSET_QUOTA.maxCount }, { bytes: 1024 ** 3, count: 1000 });
  db.raw.prepare(`INSERT INTO sync_account_asset_quotas
    (account_id,storage_category,storage_limit_bytes,asset_variant_limit,daily_new_variant_limit,created_at,updated_at)
    VALUES ('account-a','image',16,1,200,1,1)`).run();
  assert.equal((await repository.prepare(identity, authority, input(1))).status, 'prepared');
  assert.equal((await repository.prepare(identity, authority, input(2))).status, 'quota');
  db.raw.prepare(`INSERT INTO sync_accounts
    (id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,recovery_created_at,recovery_rotated_at,admission_provenance)
    VALUES ('account-b','active',1,?,1,1,1,1,1,'production')`).run('e'.repeat(64));
  assert.equal((await repository.prepare(identity, { ...authority, accountId: 'account-b' }, input(3))).status, 'prepared',
    'one Account override cannot consume another Account category allowance');
  db.close();
});

test('asset policy enforces Account and global daily variant caps without affecting reads', async () => {
  const db = await seeded();
  const repository = createD1AssetRepository(db);
  const day = dayKey(DAY);
  db.raw.prepare(`INSERT INTO sync_asset_daily_variant_counts
    (scope,scope_id,storage_category,day_key,variant_count,updated_at)
    VALUES ('account','account-a','image',?,200,?)`).run(day, DAY);
  assert.equal((await repository.prepare(identity, authority, input(4))).status, 'account_rate_limited');
  db.raw.prepare(`UPDATE sync_asset_daily_variant_counts SET variant_count=0
    WHERE scope='account' AND scope_id='account-a'`).run();
  db.raw.prepare(`INSERT INTO sync_asset_daily_variant_counts
    (scope,scope_id,storage_category,day_key,variant_count,updated_at)
    VALUES ('global','global','image',?,50000,?)`).run(day, DAY);
  assert.equal((await repository.prepare(identity, authority, input(5))).status, 'global_rate_limited');
  db.close();
});

test('global guard states are visible before the 1 TiB hard upload stop', async () => {
  assert.equal(globalStorageGuard(100 * 1024 ** 3), 'notice');
  assert.equal(globalStorageGuard(250 * 1024 ** 3), 'warning');
  assert.equal(globalStorageGuard(500 * 1024 ** 3), 'strong_warning');
  assert.equal(globalStorageGuard(GLOBAL_ASSET_QUOTA.hardStopBytes), 'upload_stopped');
  const db = await seeded();
  db.raw.prepare(`INSERT INTO sync_assets
    (asset_id,account_id,membership_id,sync_user_id,kind,state,storage_category,content_hash,mime_type,byte_size,width,height,object_key,object_version,created_by_device_id,created_at,updated_at)
    VALUES ('33333333-3333-4333-8333-333333333333','other-account','other-membership','other-user','gear_photo_final','available','image',?,'image/webp',?,512,512,'assets/guard',1,'other-device',1,1)`)
    .run('a'.repeat(64), GLOBAL_ASSET_QUOTA.hardStopBytes);
  assert.equal((await createD1AssetRepository(db).prepare(identity, authority, input(6))).status, 'global_guard');
  db.close();
});

test('inactivity makes an Account dormant, a valid authenticated touch reactivates it, and final purge stays distinct from manual delete', async () => {
  const db = await seeded();
  const repository = createD1CleanupRepository(db);
  const dormantAt = 365 * 24 * 60 * 60 * 1000 + 1;
  db.raw.prepare(`INSERT INTO sync_assets
    (asset_id,account_id,membership_id,sync_user_id,kind,state,storage_category,content_hash,mime_type,byte_size,width,height,object_key,object_version,created_by_device_id,created_at,updated_at)
    VALUES ('63333333-3333-4333-8333-333333333333','account-a','port-membership','port-user','gear_photo_final','available','image',?,'image/webp',12,512,512,'assets/dormant',1,'port-device',1,1)`)
    .run('a'.repeat(64));
  db.raw.prepare(`UPDATE sync_account_activity SET last_activity_at=0,updated_at=0 WHERE account_id='account-a'`).run();
  const dormant = await repository.cleanup(dormantAt);
  assert.equal(dormant.accountsDormant, 1);
  assert.equal(db.raw.prepare("SELECT state FROM sync_account_activity WHERE account_id='account-a'").get().state, 'dormant');
  assert.equal(db.raw.prepare("SELECT state FROM sync_assets WHERE asset_id='63333333-3333-4333-8333-333333333333'").get().state, 'available',
    'dormant is retention, not an asset cleanup trigger');
  await touchAccountActivity(db, 'account-a', dormantAt + 1);
  assert.equal(db.raw.prepare("SELECT state FROM sync_account_activity WHERE account_id='account-a'").get().state, 'active');
  db.raw.prepare(`UPDATE sync_account_activity SET state='dormant',last_activity_at=0,dormant_at=?,inactive_purge_after=?,updated_at=?
    WHERE account_id='account-a'`).run(dormantAt, 455 * 24 * 60 * 60 * 1000, dormantAt);
  const final = await repository.cleanup(455 * 24 * 60 * 60 * 1000 + 1);
  assert.equal(final.inactiveAccountPurgesStarted, 1);
  assert.equal(db.raw.prepare("SELECT COUNT(*) count FROM sync_accounts WHERE id='account-a'").get().count, 0,
    'final inactivity purge uses the established eventual Account removal path');
  assert.equal((await createD1AssetRepository(db).cleanupCandidates(455 * 24 * 60 * 60 * 1000 + 2, 0, 0, 10)).length, 1,
    'only after final Account purge does the private object become eventual cleanup work');
  db.raw.prepare(`INSERT INTO sync_accounts
    (id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,recovery_created_at,recovery_rotated_at,deleted_at,delete_requested_at,purge_after,admission_provenance)
    VALUES ('manual-delete','deleting',1,?,1,1,1,1,1,1,1,999999999999,'production')`).run('b'.repeat(64));
  db.raw.prepare(`INSERT INTO sync_account_activity
    (account_id,state,last_activity_at,dormant_at,inactive_purge_after,updated_at)
    VALUES ('manual-delete','dormant',0,1,2,1)`).run();
  const manual = await repository.cleanup(3);
  assert.equal(manual.inactiveAccountPurgesStarted, 0);
  assert.equal(db.raw.prepare("SELECT state FROM sync_accounts WHERE id='manual-delete'").get().state, 'deleting',
    'a manual seven-day grace is never converted or accelerated by inactivity cleanup');
  db.close();
});
