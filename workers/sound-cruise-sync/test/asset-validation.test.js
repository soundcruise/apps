import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSET_KINDS, ASSET_QUOTA, PRACTICE_ATTACHMENT_QUOTA,
  detectImageMime, inspectAssetContent, inspectImageMetadata, validateAssetPrepare
} from '../src/asset-validation.js';

const assetId = '123e4567-e89b-42d3-a456-426614174000';
const operationId = '223e4567-e89b-42d3-a456-426614174000';

function orientedJpeg(orientation, width = 4032, height = 3024) {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
    0x00, 0x01,
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,
    0x00, orientation, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x07, 0x08,
    (height >>> 8) & 0xff, height & 0xff,
    (width >>> 8) & 0xff, width & 0xff,
    0xff, 0xd9
  ]);
}

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
  assert.equal(ASSET_KINDS.gear_photo_source.maxBytes, 8 * 1024 * 1024);
  assert.equal(ASSET_KINDS.my_app_icon_source.maxBytes, 8 * 1024 * 1024);
  assert.equal(ASSET_QUOTA.maxBytes, 1024 * 1024 * 1024);
  assert.equal(ASSET_QUOTA.maxCount, 1000);
  assert.equal(ASSET_QUOTA.dailyNewVariants, 200);
});

test('practice attachments are separately bounded and require safe ownership metadata', () => {
  const base = {
    appId: 'port', assetId, operationId, hash: 'a'.repeat(64), byteSize: 100,
    ownerRecordId: 'practice-1', originalFilename: 'score.pdf'
  };
  assert.equal(validateAssetPrepare({ ...base, kind: 'practice_attachment_pdf', mime: 'application/pdf', width: 1, height: 1 })?.storageCategory,
    'practice_attachment');
  assert.equal(validateAssetPrepare({ ...base, kind: 'practice_attachment_text', mime: 'text/plain', width: 1, height: 1,
    originalFilename: 'notes.txt' })?.ownerRecordType, 'practice_menu');
  assert.equal(validateAssetPrepare({ ...base, kind: 'practice_attachment_image', mime: 'image/png', width: 1200, height: 900,
    originalFilename: 'photo.png' })?.storageCategory, 'practice_attachment');
  assert.equal(validateAssetPrepare({ ...base, kind: 'practice_attachment_pdf', mime: 'text/html', width: 1, height: 1 }), null);
  assert.equal(validateAssetPrepare({ ...base, kind: 'practice_attachment_pdf', mime: 'application/pdf', width: 1, height: 1,
    originalFilename: '../score.pdf' }), null);
  assert.equal(validateAssetPrepare({ ...base, kind: 'practice_attachment_pdf', mime: 'application/pdf', width: 1, height: 1,
    ownerRecordId: '' }), null);
  assert.equal(validateAssetPrepare({ ...base, kind: 'practice_attachment_image', mime: 'image/png', width: 1, height: 1,
    byteSize: ASSET_KINDS.practice_attachment_image.maxBytes + 1, originalFilename: 'photo.png' }), null);
  assert.equal(PRACTICE_ATTACHMENT_QUOTA.maxBytes, 2 * 1024 * 1024 * 1024);
  assert.equal(PRACTICE_ATTACHMENT_QUOTA.maxCount, 10000);
  assert.equal(PRACTICE_ATTACHMENT_QUOTA.countPerPractice, 10);
});

test('practice content inspection rejects MIME spoofing and unsafe bytes', () => {
  assert.deepEqual(inspectAssetContent(new TextEncoder().encode('%PDF-1.7\n'), 'practice_attachment_pdf'),
    { mime: 'application/pdf', width: 1, height: 1 });
  assert.equal(inspectAssetContent(new TextEncoder().encode('<html>'), 'practice_attachment_pdf'), null);
  assert.deepEqual(inspectAssetContent(new TextEncoder().encode('安全なノート'), 'practice_attachment_text'),
    { mime: 'text/plain', width: 1, height: 1 });
  assert.equal(inspectAssetContent(Uint8Array.from([0x61, 0x00, 0x62]), 'practice_attachment_text'), null);
  assert.equal(inspectAssetContent(Uint8Array.from([0xc3, 0x28]), 'practice_attachment_text'), null);
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

test('JPEG inspection reports display dimensions after EXIF orientation', () => {
  assert.deepEqual(inspectImageMetadata(orientedJpeg(1)),
    { mime: 'image/jpeg', width: 4032, height: 3024 });
  assert.deepEqual(inspectImageMetadata(orientedJpeg(6)),
    { mime: 'image/jpeg', width: 3024, height: 4032 });
  assert.deepEqual(inspectImageMetadata(orientedJpeg(8, 1200, 900)),
    { mime: 'image/jpeg', width: 900, height: 1200 });
});
