import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_KINDS, ASSET_QUOTA, detectImageMime, inspectImageMetadata, validateAssetPrepare } from '../src/asset-validation.js';

const assetId = '123e4567-e89b-42d3-a456-426614174000';
const operationId = '223e4567-e89b-42d3-a456-426614174000';

test('asset contract accepts only normalized bounded image variants', () => {
  const base = { appId: 'port', assetId, operationId, hash: 'a'.repeat(64), mime: 'image/webp', byteSize: 100 };
  assert(validateAssetPrepare({ ...base, kind: 'gear_photo_final', width: 512, height: 512 }));
  assert(validateAssetPrepare({ ...base, kind: 'gear_photo_source', width: 1024, height: 700 }));
  assert(validateAssetPrepare({ ...base, kind: 'my_app_icon_final', width: 256, height: 256 }));
  assert(validateAssetPrepare({ ...base, kind: 'my_app_icon_source', width: 700, height: 1024 }));
  assert.equal(validateAssetPrepare({ ...base, kind: 'gear_photo_final', width: 511, height: 512 }), null);
  assert.equal(validateAssetPrepare({ ...base, kind: 'gear_photo_source', width: 1025, height: 700 }), null);
  assert.equal(validateAssetPrepare({ ...base, kind: 'gear_photo_final', width: 512, height: 512,
    byteSize: ASSET_KINDS.gear_photo_final.maxBytes + 1 }), null);
  assert.equal(validateAssetPrepare({ ...base, kind: 'practice_attachment', width: 1, height: 1 }), null);
  assert.equal(validateAssetPrepare({ ...base, kind: 'gear_photo_final', width: 512, height: 512, mime: 'image/svg+xml' }), null);
  assert.equal(ASSET_QUOTA.maxBytes, 100 * 1024 * 1024);
  assert.equal(ASSET_QUOTA.maxCount, 500);
});

test('magic byte detection does not trust the declared MIME', () => {
  assert.equal(detectImageMime(Uint8Array.from([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50])), 'image/webp');
  assert.equal(detectImageMime(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])), 'image/png');
  assert.equal(detectImageMime(Uint8Array.from([0xff,0xd8,0xff,0xe0])), 'image/jpeg');
  assert.equal(detectImageMime(new TextEncoder().encode('<svg/>')), null);
  const webp = Uint8Array.from([0x52,0x49,0x46,0x46,22,0,0,0,0x57,0x45,0x42,0x50,
    0x56,0x50,0x38,0x58,10,0,0,0,0,0,0,0,0xff,1,0,0xff,0,0]);
  assert.deepEqual(inspectImageMetadata(webp), { mime: 'image/webp', width: 512, height: 256 });
  assert.equal(inspectImageMetadata(Uint8Array.from([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50])), null);
});
