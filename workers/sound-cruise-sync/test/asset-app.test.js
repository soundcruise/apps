import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest, handleScheduled } from '../src/app.js';
import { sha256Hex } from '../src/asset-validation.js';
import { createSqliteD1 } from './sqlite-d1.js';

const ORIGIN = 'https://soundcruise.jp';
const assetId = '123e4567-e89b-42d3-a456-426614174000';
const operationId = '223e4567-e89b-42d3-a456-426614174000';
const credential = `scd1.323e4567-e89b-42d3-a456-426614174000.${'A'.repeat(43)}`;

function seed() {
  const db = createSqliteD1();
  db.raw.prepare(`INSERT INTO sync_accounts
    (id,state,recovery_version,recovery_verifier,generation,created_at,updated_at,recovery_created_at,recovery_rotated_at,admission_provenance)
    VALUES ('account-a','active',1,?,1,1,1,1,1,'production')`).run('1'.repeat(64));
  db.raw.prepare(`INSERT INTO sync_users
    (id,state,recovery_version,recovery_verifier,created_at,updated_at,recovery_created_at,recovery_rotated_at)
    VALUES ('port-user-a','active',1,?,1,1,1,1)`).run('2'.repeat(64));
  db.raw.prepare(`INSERT INTO sync_devices
    (id,user_id,app_id,credential_version,credential_verifier,last_cursor,created_at,last_seen_at,paired_at)
    VALUES ('323e4567-e89b-42d3-a456-426614174000','port-user-a','port',1,?,0,1,1,1)`).run('3'.repeat(64));
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
    '323e4567-e89b-42d3-a456-426614174000', ?, 1)`)
    .run(id, '4'.repeat(64), `practice-${id}`);
}

function bucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, body, options) {
      const bytes = new Uint8Array(body);
      objects.set(key, { bytes, size: bytes.byteLength, customMetadata: options.customMetadata });
    },
    async head(key) { return objects.get(key) || null; },
    async get(key) { const item = objects.get(key); return item ? { ...item, body: item.bytes } : null; },
    async delete(key) { objects.delete(key); }
  };
}

function webp(width, height) {
  const bytes = new Uint8Array(30);
  bytes.set([0x52,0x49,0x46,0x46,22,0,0,0,0x57,0x45,0x42,0x50,0x56,0x50,0x38,0x58,10,0,0,0], 0);
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  bytes.set([encodedWidth & 255, (encodedWidth >>> 8) & 255, (encodedWidth >>> 16) & 255], 24);
  bytes.set([encodedHeight & 255, (encodedHeight >>> 8) & 255, (encodedHeight >>> 16) & 255], 27);
  return bytes;
}

function environment(db, r2) {
  return {
    ALLOWED_ORIGINS: ORIGIN, SYNC_ALLOWED_APP_IDS: 'chord', SYNC_QA_ALLOWED_APP_IDS: 'port',
    SYNC_ACCOUNT_PUBLIC_ADMISSION_ENABLED: 'true', SYNC_ACCOUNT_PUBLIC_APP_IDS: 'port',
    SYNC_CREDENTIAL_PEPPER: 'p'.repeat(64), SYNC_DB: db, SYNC_ASSETS: r2,
    SYNC_RATE_LIMITER: { limit: async () => ({ success: true }) }
  };
}
const control = { rolloutMode: 'open', admissionEnabled: true, dataWriteEnabled: true,
  dataReadEnabled: true, recoveryEnabled: true, cloudDeleteEnabled: true, generation: 1, updatedAt: 1 };
function deps(auth = true) {
  return {
    readRuntimeControl: async () => control,
    authenticateDevice: async () => auth ? ({ userId: 'port-user-a', deviceId: '323e4567-e89b-42d3-a456-426614174000', appId: 'port' }) : null
  };
}
function jsonRequest(path, body) {
  return new Request(`https://sync.example${path}`, { method: 'POST', headers: {
    Origin: ORIGIN, Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json'
  }, body: JSON.stringify(body) });
}

test('private asset API performs prepare/upload/commit/download without exposing an object key', async () => {
  const db = seed();
  const r2 = bucket();
  const bytes = webp(512, 512);
  const hash = await sha256Hex(bytes);
  const common = { appId: 'port', assetId, operationId, hash };
  let response = await handleRequest(jsonRequest('/v1/sync/assets/prepare', {
    ...common, kind: 'gear_photo_final', mime: 'image/webp', byteSize: bytes.length, width: 512, height: 512
  }), environment(db, r2), null, deps());
  assert.equal(response.status, 201);
  let payload = await response.json();
  assert.equal(Object.hasOwn(payload.asset, 'objectKey'), false);

  response = await handleRequest(new Request(`https://sync.example/v1/sync/assets/${assetId}/content`, {
    method: 'PUT', headers: { Origin: ORIGIN, Authorization: `Bearer ${credential}`,
      'Content-Type': 'image/webp', 'X-Sound-Cruise-Operation-Id': operationId, 'X-Content-SHA256': hash }, body: bytes
  }), environment(db, r2), null, deps());
  assert.equal(response.status, 200);
  response = await handleRequest(jsonRequest('/v1/sync/assets/commit', common), environment(db, r2), null, deps());
  assert.equal(response.status, 200);

  response = await handleRequest(new Request(`https://sync.example/v1/sync/assets/${assetId}`, {
    headers: { Origin: ORIGIN, Authorization: `Bearer ${credential}` }
  }), environment(db, r2), null, deps());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Asset-SHA256'), hash);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);

  const retry = await handleRequest(jsonRequest('/v1/sync/assets/prepare', {
    ...common, kind: 'gear_photo_final', mime: 'image/webp', byteSize: bytes.length, width: 512, height: 512
  }), environment(db, r2), null, deps());
  assert.equal((await retry.json()).phase, 'available');
  assert.equal(r2.objects.size, 1, 'response-loss retry does not create duplicate objects');
  db.close();
});

test('practice PDF is private, owner-scoped, downloadable by filename, and rejects spoofed bytes', async () => {
  const db = seed();
  addPractice(db);
  const r2 = bucket();
  const bytes = new TextEncoder().encode('%PDF-1.7\npractice score');
  const hash = await sha256Hex(bytes);
  const common = {
    appId: 'port', assetId: '123e4567-e89b-42d3-a456-426614174030',
    operationId: '223e4567-e89b-42d3-a456-426614174030', hash
  };
  let response = await handleRequest(jsonRequest('/v1/sync/assets/prepare', {
    ...common, kind: 'practice_attachment_pdf', mime: 'application/pdf',
    byteSize: bytes.length, width: 1, height: 1,
    ownerRecordId: 'practice-a', originalFilename: "譜面's.pdf"
  }), environment(db, r2), null, deps());
  assert.equal(response.status, 201);
  response = await handleRequest(new Request(`https://sync.example/v1/sync/assets/${common.assetId}/content`, {
    method: 'PUT', headers: { Origin: ORIGIN, Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/pdf', 'X-Sound-Cruise-Operation-Id': common.operationId,
      'X-Content-SHA256': hash }, body: bytes
  }), environment(db, r2), null, deps());
  assert.equal(response.status, 200);
  response = await handleRequest(jsonRequest('/v1/sync/assets/commit', common), environment(db, r2), null, deps());
  assert.equal(response.status, 200);
  response = await handleRequest(new Request(`https://sync.example/v1/sync/assets/${common.assetId}`, {
    headers: { Origin: ORIGIN, Authorization: `Bearer ${credential}` }
  }), environment(db, r2), null, deps());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(response.headers.get('Content-Disposition'), /^attachment; filename\*=UTF-8''/u);
  assert.match(response.headers.get('Content-Disposition'), /%27/u, 'special filename characters stay header-safe');

  const unsafeBytes = new TextEncoder().encode('<html><script>alert(1)</script>');
  const unsafeHash = await sha256Hex(unsafeBytes);
  const unsafe = {
    appId: 'port', assetId: '123e4567-e89b-42d3-a456-426614174031',
    operationId: '223e4567-e89b-42d3-a456-426614174031', hash: unsafeHash
  };
  response = await handleRequest(jsonRequest('/v1/sync/assets/prepare', {
    ...unsafe, kind: 'practice_attachment_pdf', mime: 'application/pdf',
    byteSize: unsafeBytes.length, width: 1, height: 1,
    ownerRecordId: 'practice-a', originalFilename: 'unsafe.pdf'
  }), environment(db, r2), null, deps());
  assert.equal(response.status, 201);
  response = await handleRequest(new Request(`https://sync.example/v1/sync/assets/${unsafe.assetId}/content`, {
    method: 'PUT', headers: { Origin: ORIGIN, Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/pdf', 'X-Sound-Cruise-Operation-Id': unsafe.operationId,
      'X-Content-SHA256': unsafeHash }, body: unsafeBytes
  }), environment(db, r2), null, deps());
  assert.equal(response.status, 415);
  assert.equal(r2.objects.size, 1, 'spoofed content is never written to R2');

  response = await handleRequest(jsonRequest('/v1/sync/assets/prepare', {
    appId: 'port', assetId: '123e4567-e89b-42d3-a456-426614174032',
    operationId: '223e4567-e89b-42d3-a456-426614174032', hash: 'a'.repeat(64),
    kind: 'practice_attachment_text', mime: 'text/plain', byteSize: 4, width: 1, height: 1,
    ownerRecordId: 'missing-practice', originalFilename: 'note.txt'
  }), environment(db, r2), null, deps());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'practice_relation_missing');
  db.close();
});

test('practice image and UTF-8 text complete the same private upload contract', async () => {
  const db = seed();
  addPractice(db);
  const r2 = bucket();
  const variants = [
    {
      assetId: '123e4567-e89b-42d3-a456-426614174040',
      operationId: '223e4567-e89b-42d3-a456-426614174040',
      kind: 'practice_attachment_image', mime: 'image/webp', filename: 'photo.webp',
      bytes: webp(32, 24), width: 32, height: 24
    },
    {
      assetId: '123e4567-e89b-42d3-a456-426614174041',
      operationId: '223e4567-e89b-42d3-a456-426614174041',
      kind: 'practice_attachment_text', mime: 'text/plain', filename: 'notes.txt',
      bytes: new TextEncoder().encode('練習メモ'), width: 1, height: 1
    }
  ];
  for (const variant of variants) {
    const hash = await sha256Hex(variant.bytes);
    const common = { appId: 'port', assetId: variant.assetId, operationId: variant.operationId, hash };
    let response = await handleRequest(jsonRequest('/v1/sync/assets/prepare', {
      ...common, kind: variant.kind, mime: variant.mime, byteSize: variant.bytes.length,
      width: variant.width, height: variant.height,
      ownerRecordId: 'practice-a', originalFilename: variant.filename
    }), environment(db, r2), null, deps());
    assert.equal(response.status, 201, variant.kind);
    response = await handleRequest(new Request(`https://sync.example/v1/sync/assets/${variant.assetId}/content`, {
      method: 'PUT', headers: { Origin: ORIGIN, Authorization: `Bearer ${credential}`,
        'Content-Type': variant.mime, 'X-Sound-Cruise-Operation-Id': variant.operationId,
        'X-Content-SHA256': hash }, body: variant.bytes
    }), environment(db, r2), null, deps());
    assert.equal(response.status, 200, variant.kind);
    response = await handleRequest(jsonRequest('/v1/sync/assets/commit', common), environment(db, r2), null, deps());
    assert.equal(response.status, 200, variant.kind);
  }
  assert.equal(r2.objects.size, 2);
  db.close();
});

test('asset endpoints fail closed for invalid bytes, unknown IDs, and revoked credentials', async () => {
  const db = seed();
  const r2 = bucket();
  let response = await handleRequest(new Request(`https://sync.example/v1/sync/assets/${assetId}`, {
    headers: { Origin: ORIGIN, Authorization: `Bearer ${credential}` }
  }), environment(db, r2), null, deps());
  assert.equal(response.status, 404);
  response = await handleRequest(jsonRequest('/v1/sync/assets/prepare', {
    appId: 'port', assetId, operationId, hash: 'a'.repeat(64), kind: 'gear_photo_final',
    mime: 'image/svg+xml', byteSize: 10, width: 512, height: 512
  }), environment(db, r2), null, deps());
  assert.equal(response.status, 400);
  response = await handleRequest(jsonRequest('/v1/sync/assets/prepare', {
    appId: 'port', assetId, operationId, hash: 'a'.repeat(64), kind: 'gear_photo_final',
    mime: 'image/webp', byteSize: 10, width: 512, height: 512
  }), environment(db, r2), null, deps(false));
  assert.equal(response.status, 401);

  db.raw.prepare("UPDATE sync_datasets SET state = 'initializing' WHERE user_id = 'port-user-a'").run();
  response = await handleRequest(jsonRequest('/v1/sync/assets/prepare', {
    appId: 'port', assetId, operationId, hash: 'a'.repeat(64), kind: 'gear_photo_final',
    mime: 'image/webp', byteSize: 10, width: 512, height: 512
  }), environment(db, r2), null, deps());
  assert.equal(response.status, 409, 'a non-ready dataset cannot prepare assets');
  db.raw.prepare("UPDATE sync_datasets SET state = 'ready' WHERE user_id = 'port-user-a'").run();
  db.raw.prepare("UPDATE sync_account_memberships SET state = 'deleting' WHERE id = 'port-membership-a'").run();
  response = await handleRequest(jsonRequest('/v1/sync/assets/prepare', {
    appId: 'port', assetId, operationId, hash: 'a'.repeat(64), kind: 'gear_photo_final',
    mime: 'image/webp', byteSize: 10, width: 512, height: 512
  }), environment(db, r2), null, deps());
  assert.equal(response.status, 409, 'an inactive membership cannot prepare assets');
  db.close();
});

test('binary feature switches are independent: write stop preserves downloads and cleanup stop preserves objects', async () => {
  const db = seed();
  const r2 = bucket();
  const bytes = webp(512, 512);
  const hash = await sha256Hex(bytes);
  const common = { appId: 'port', assetId, operationId, hash };
  let response = await handleRequest(jsonRequest('/v1/sync/assets/prepare', {
    ...common, kind: 'gear_photo_final', mime: 'image/webp', byteSize: bytes.length, width: 512, height: 512
  }), environment(db, r2), null, deps());
  assert.equal(response.status, 201);
  response = await handleRequest(new Request(`https://sync.example/v1/sync/assets/${assetId}/content`, {
    method: 'PUT', headers: { Origin: ORIGIN, Authorization: `Bearer ${credential}`,
      'Content-Type': 'image/webp', 'X-Sound-Cruise-Operation-Id': operationId, 'X-Content-SHA256': hash }, body: bytes
  }), environment(db, r2), null, deps());
  assert.equal(response.status, 200);
  response = await handleRequest(jsonRequest('/v1/sync/assets/commit', common), environment(db, r2), null, deps());
  assert.equal(response.status, 200);

  const writesOff = { ...environment(db, r2), SYNC_ASSET_WRITE_ENABLED: 'false' };
  response = await handleRequest(jsonRequest('/v1/sync/assets/prepare', {
    ...common, assetId: '423e4567-e89b-42d3-a456-426614174000', operationId: '523e4567-e89b-42d3-a456-426614174000',
    kind: 'gear_photo_final', mime: 'image/webp', byteSize: bytes.length, width: 512, height: 512
  }), writesOff, null, deps());
  assert.equal(response.status, 503);
  response = await handleRequest(new Request(`https://sync.example/v1/sync/assets/${assetId}`, {
    headers: { Origin: ORIGIN, Authorization: `Bearer ${credential}` }
  }), writesOff, null, deps());
  assert.equal(response.status, 200, 'write stop does not interrupt an existing private download');

  response = await handleRequest(new Request(`https://sync.example/v1/sync/assets/${assetId}`, {
    headers: { Origin: ORIGIN, Authorization: `Bearer ${credential}` }
  }), { ...environment(db, r2), SYNC_ASSET_DOWNLOAD_ENABLED: 'false' }, null, deps());
  assert.equal(response.status, 503);
  db.raw.prepare(`UPDATE sync_assets SET state='unreferenced',unreferenced_at=created_at WHERE asset_id=?`).run(assetId);
  await handleScheduled({}, { ...environment(db, r2), SYNC_ASSET_CLEANUP_ENABLED: 'false' },
    { createCleanupRepository: () => ({ cleanup: async () => ({ ok: true }) }) });
  assert.equal(r2.objects.size, 1, 'cleanup switch is independent of write and download switches');
  db.close();
});

test('scheduled cleanup respects grace, preserves deleting Accounts, and removes assets after Account purge', async () => {
  const db = seed();
  const r2 = bucket();
  const objectKey = 'assets/account-a/port-user-a/asset/gear_photo_final';
  const now = Date.now();
  db.raw.prepare(`INSERT INTO sync_assets (
    asset_id, account_id, membership_id, sync_user_id, kind, state, content_hash,
    mime_type, byte_size, width, height, object_key, object_version,
    created_by_device_id, created_at, updated_at, uploaded_at, committed_at, unreferenced_at
  ) VALUES (?, 'account-a', 'port-membership-a', 'port-user-a', 'gear_photo_final',
    'unreferenced', ?, 'image/webp', 12, 512, 512, ?, 1, ?, ?, ?, ?, ?, ?)`)
    .run(assetId, 'a'.repeat(64), objectKey, '323e4567-e89b-42d3-a456-426614174000',
      now - 1000, now - 1000, now - 1000, now - 1000, now - 1000);
  r2.objects.set(objectKey, { bytes: new Uint8Array(12), size: 12, customMetadata: { hash: 'a'.repeat(64) } });
  const cleanupDependencies = { createCleanupRepository: () => ({ cleanup: async () => ({ ok: true }) }) };
  await handleScheduled({}, environment(db, r2), cleanupDependencies);
  assert.equal(r2.objects.has(objectKey), true, 'the unreference grace period preserves the object');

  db.raw.prepare("UPDATE sync_assets SET state = 'available', unreferenced_at = NULL WHERE asset_id = ?").run(assetId);
  db.raw.prepare("UPDATE sync_accounts SET state = 'deleting' WHERE id = 'account-a'").run();
  await handleScheduled({}, environment(db, r2), cleanupDependencies);
  assert.equal(r2.objects.has(objectKey), true, 'Account delete grace preserves available assets');

  db.raw.prepare("UPDATE sync_assets SET account_id = 'purged-account' WHERE asset_id = ?").run(assetId);
  await handleScheduled({}, environment(db, r2), cleanupDependencies);
  assert.equal(r2.objects.has(objectKey), false, 'an asset whose Account was purged is eventually removed');
  assert.equal(db.raw.prepare('SELECT state FROM sync_assets WHERE asset_id = ?').get(assetId).state, 'deleted');
  db.close();
});
