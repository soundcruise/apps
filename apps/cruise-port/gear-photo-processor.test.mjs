import assert from 'node:assert/strict';
import {
    GEAR_PHOTO_FINAL_SIZE,
    GEAR_PHOTO_MAX_SOURCE_BYTES,
    GEAR_PHOTO_SOURCE_MAX_SIZE,
    encodePreparedGearPhoto,
    prepareGearPhotoSource,
    validateGearPhotoFile
} from './gear-photo-processor.js';

function namedBlob(contents, type, name) {
    const blob = new Blob([contents], { type });
    Object.defineProperty(blob, 'name', { value: name });
    return blob;
}

function canvasHarness({ webp = true } = {}) {
    const calls = [];
    const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage(...args) { calls.push(['drawImage', ...args.slice(1)]); } }),
        toBlob(callback, type) {
            calls.push(['toBlob', type]);
            callback(type === 'image/webp' && !webp ? null : new Blob(['encoded'], { type }));
        }
    };
    return { canvas, calls };
}

assert.equal(validateGearPhotoFile(namedBlob('svg', 'image/svg+xml', 'photo.svg')).reason, 'svg-not-supported');
assert.equal(validateGearPhotoFile({ size: GEAR_PHOTO_MAX_SOURCE_BYTES + 1, type: 'image/png', name: 'large.png' }).reason, 'file-too-large');
assert.equal(validateGearPhotoFile(namedBlob('jpeg', 'image/jpeg', 'photo.jpg')).ok, true);
assert.equal(validateGearPhotoFile(namedBlob('png', 'image/png', 'photo.png')).ok, true);
assert.equal(validateGearPhotoFile(namedBlob('webp', 'image/webp', 'photo.webp')).ok, true);
assert.equal(GEAR_PHOTO_SOURCE_MAX_SIZE, 1024);
assert.equal(GEAR_PHOTO_FINAL_SIZE, 512);

{
    const harness = canvasHarness();
    let decodeCount = 0;
    let closed = 0;
    const result = await prepareGearPhotoSource(namedBlob('photo', 'image/jpeg', 'photo.jpg'), {
        createImageBitmapFunction: async () => {
            decodeCount += 1;
            return decodeCount === 1
                ? { width: 4032, height: 3024, close() { closed += 1; } }
                : { width: 1024, height: 768, close() { closed += 1; } };
        },
        createCanvas: () => harness.canvas
    });
    assert.equal(result.ok, true);
    assert.equal(result.width, 1024);
    assert.equal(result.height, 768);
    assert.equal(result.blob.type, 'image/webp');
    assert.deepEqual(harness.calls[0], ['drawImage', 0, 0, 1024, 768]);
    assert.equal(closed, 1);
    result.cleanup();
    assert.equal(closed, 2);
}

{
    const harness = canvasHarness({ webp: false });
    let decodeCount = 0;
    const result = await prepareGearPhotoSource(namedBlob('photo', 'image/png', 'photo.png'), {
        createImageBitmapFunction: async () => {
            decodeCount += 1;
            return { width: 400, height: 300, close() {} };
        },
        createCanvas: () => harness.canvas
    });
    assert.equal(result.ok, true);
    assert.equal(result.blob.type, 'image/png');
    assert.equal(decodeCount, 2);
    result.cleanup();
}

assert.deepEqual(
    await prepareGearPhotoSource(namedBlob('bad', 'image/heic', 'bad.heic'), {
        createImageBitmapFunction: async () => { throw new Error('decode'); },
        ImageConstructor: null
    }),
    { ok: false, reason: 'decode-failed' }
);

{
    const harness = canvasHarness();
    const prepared = { source: {}, width: 1024, height: 768 };
    const cropState = {
        sourceWidth: 1024, sourceHeight: 768, cropSize: 320,
        scale: 0.5, minScale: 0.5, maxScale: 3, offsetX: -96, offsetY: 0
    };
    const result = await encodePreparedGearPhoto(prepared, cropState, { createCanvas: () => harness.canvas });
    assert.equal(result.ok, true);
    assert.equal(result.width, 512);
    assert.equal(result.height, 512);
    assert.equal(harness.canvas.width, 512);
    assert.equal(harness.canvas.height, 512);
    assert.equal(harness.calls[0][0], 'drawImage');
    assert(Math.abs(harness.calls[0][1] - (-153.6)) < 1e-9);
    assert.equal(harness.calls[0][2], 0);
    assert(Math.abs(harness.calls[0][3] - 819.2) < 1e-9);
    assert(Math.abs(harness.calls[0][4] - 614.4) < 1e-9);
}

console.log('gear-photo-processor: limits, SVG rejection, 1024 source, 512 crop, WebP, and cleanup checks passed');
