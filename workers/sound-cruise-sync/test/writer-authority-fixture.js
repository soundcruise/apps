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


export { seed, environment, deps, jsonRequest, bucket, webp, assetId, operationId, credential, ORIGIN };
