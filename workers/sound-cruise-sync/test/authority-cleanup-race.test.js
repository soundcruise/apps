import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, environment, deps, jsonRequest, bucket, webp, assetId, credential } from './writer-authority-fixture.js';
import { handleProAuthorizedRequest } from './pro-entitlement-fixture.js';
import { handleScheduled } from '../src/app.js';
import { createIsolatedWriterPolicy } from '../src/writer-fence.js';
import { hashRecord } from '../src/records.js';
import { sha256Hex } from '../src/asset-validation.js';

// B1-6 stop-condition reproducer. Everything is isolated SQLite / memory R2.
// The R2 await permits a real HTTP push after the cleanup reference read.
for (const guarded of [false, true]) {
  test(`cleanup preserves an asset referenced during R2 deletion (isolated policy=${guarded})`, async t => {
    const db = seed(), r2 = bucket(), env = environment(db, r2);
    t.after(() => db.close());
    const bytes = webp(512, 512), hash = await sha256Hex(bytes);
    const objectKey = `assets/account-a/port-user-a/${assetId}/gear_photo_final`;
    db.raw.prepare(`INSERT INTO sync_assets (
      asset_id, account_id, membership_id, sync_user_id, kind, state, content_hash,
      mime_type, byte_size, width, height, object_key, object_version,
      created_by_device_id, created_at, updated_at, uploaded_at, committed_at, unreferenced_at
    ) VALUES (?, 'account-a', 'port-membership-a', 'port-user-a', 'gear_photo_final',
      'unreferenced', ?, 'image/webp', 30, 512, 512, ?, 1, ?, 1, 1, 1, 1, 1)`)
      .run(assetId, hash, objectKey, credential.split('.')[1]);
    await r2.put(objectKey, bytes, { customMetadata: { hash } });
    const operation = {
      operationId: crypto.randomUUID(), recordType: 'gear_item', recordId: 'gear-1',
      schemaVersion: 1, baseRevision: 0, deleted: false,
      payload: { id: 'gear-1', value: { item: { id: 'gear-1', name: 'Race fixture', status: 'owned', order: 0 },
        asset: { version: 1, availability: 'available', source: null, final: { assetId, kind: 'gear_photo_final',
          hash, mime: 'image/webp', byteSize: 30, width: 512, height: 512, objectVersion: 1 } } } }
    };
    operation.payloadHash = await hashRecord(operation, crypto, 'port');
    const dependencies = { ...deps(), ...(guarded ? { writerPolicy: createIsolatedWriterPolicy('account-a') } : {}) };
    let responseStatus, result, claimAtPush, referencedBeforeDeletion;
    const remove = r2.delete.bind(r2);
    r2.delete = async key => {
      claimAtPush = db.raw.prepare('SELECT COUNT(*) n FROM sync_authority_cleanup_claims').get().n;
      const response = await handleProAuthorizedRequest(jsonRequest('/v1/sync/push', {
        appId: 'port', mode: 'sync', operations: [operation],
        ...(guarded ? { writerProtocol: 2, syncProtocol: 1, expectedWriteEpoch: 1 } : {})
      }), env, null, dependencies);
      responseStatus = response.status;
      result = await response.json();
      referencedBeforeDeletion = db.raw.prepare(`SELECT payload_json FROM sync_records
        WHERE record_type='gear_item' AND record_id='gear-1' AND deleted_at IS NULL`).get()?.payload_json.includes(assetId);
      await remove(key);
    };
    await handleScheduled(null, env, {
      createCleanupRepository: () => ({ cleanup: async () => ({}) })
    });
    assert.equal(claimAtPush, 1, 'the cleanup claim was active while the push executed');
    assert.equal(responseStatus,409, 'a reserved binary cannot accept a new owner reference');
    assert.equal(result.code,'asset_reference_unavailable');
    const accepted = responseStatus === 200 && result.results?.[0]?.status === 'applied';
    t.diagnostic(JSON.stringify({ responseStatus, status: result?.results?.[0]?.status,
      referencedBeforeDeletion, objectPresent: r2.objects.has(objectKey),
      assetState: db.raw.prepare('SELECT state FROM sync_assets WHERE asset_id=?').get(assetId).state }));
    assert.ok(!accepted || (referencedBeforeDeletion && r2.objects.has(objectKey)),
      'an accepted live owner reference must not point to an object deleted by cleanup');
  });
}
