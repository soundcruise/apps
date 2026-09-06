import assert from 'node:assert/strict';
import {
    MY_APPS_ICON_MAX_SOURCE_BYTES,
    MY_APPS_ICON_SIZE,
    MY_APPS_ICON_WEBP_QUALITY,
    calculateContainRect,
    processMyAppIcon,
    validateIconFile
} from './my-apps-image-processor.js';

function namedBlob(contents, type, name) {
    const blob = new Blob([contents], { type });
    Object.defineProperty(blob, 'name', { value: name });
    return blob;
}

assert.equal(validateIconFile(namedBlob('svg', 'image/svg+xml', 'icon.svg')).reason, 'svg-not-supported');
assert.equal(validateIconFile(namedBlob('svg', '', 'ICON.SVG')).reason, 'svg-not-supported');
assert.equal(validateIconFile({ size: MY_APPS_ICON_MAX_SOURCE_BYTES + 1, type: 'image/png', name: 'large.png' }).reason, 'file-too-large');
assert.equal(validateIconFile(namedBlob('png', 'image/png', 'icon.png')).ok, true);
assert.equal(validateIconFile(namedBlob('heic', 'image/heic', 'photo.heic')).ok, true, 'HEIC is accepted when the browser can decode it');

assert.deepEqual(
    await processMyAppIcon(namedBlob('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'image/png', 'renamed.png')),
    { ok: false, reason: 'svg-not-supported' },
    'renamed SVG content is rejected before decode'
);

assert.deepEqual(calculateContainRect(400, 200), { x: 0, y: 64, width: 256, height: 128 });
assert.deepEqual(calculateContainRect(200, 400), { x: 64, y: 0, width: 128, height: 256 });
assert.throws(() => calculateContainRect(0, 100), /invalid-image-dimensions/);

function createCanvasHarness({ webp = true, png = true } = {}) {
    const calls = [];
    const context = {
        clearRect(...args) { calls.push(['clearRect', ...args]); },
        drawImage(...args) { calls.push(['drawImage', ...args.slice(1)]); }
    };
    const canvas = {
        width: 0,
        height: 0,
        getContext(type) {
            assert.equal(type, '2d');
            return context;
        },
        toBlob(callback, type, quality) {
            calls.push(['toBlob', type, quality]);
            if ((type === 'image/webp' && !webp) || (type === 'image/png' && !png)) {
                callback(null);
            } else {
                callback(new Blob(['encoded'], { type }));
            }
        }
    };
    return { canvas, calls };
}

{
    const harness = createCanvasHarness();
    let closed = 0;
    const result = await processMyAppIcon(namedBlob('image', 'image/png', 'icon.png'), {
        createImageBitmapFunction: async () => ({ width: 400, height: 200, close() { closed += 1; } }),
        createCanvas: () => harness.canvas
    });
    assert.equal(result.ok, true);
    assert.equal(result.blob.type, 'image/webp');
    assert.equal(result.width, MY_APPS_ICON_SIZE);
    assert.equal(result.height, MY_APPS_ICON_SIZE);
    assert.equal(harness.canvas.width, 256);
    assert.equal(harness.canvas.height, 256);
    assert.deepEqual(harness.calls[0], ['clearRect', 0, 0, 256, 256], 'transparent canvas is not filled');
    assert.deepEqual(harness.calls[1].slice(1), [0, 64, 256, 128], 'image uses centered contain geometry');
    assert.deepEqual(harness.calls[2], ['toBlob', 'image/webp', MY_APPS_ICON_WEBP_QUALITY]);
    assert.equal(closed, 1);
}

{
    const harness = createCanvasHarness({ webp: false });
    const result = await processMyAppIcon(namedBlob('image', 'image/jpeg', 'icon.jpg'), {
        createImageBitmapFunction: async () => ({ width: 100, height: 100, close() {} }),
        createCanvas: () => harness.canvas
    });
    assert.equal(result.ok, true);
    assert.equal(result.blob.type, 'image/png', 'PNG is used when WebP encoding is unavailable');
    assert.deepEqual(harness.calls.slice(-2).map((call) => call[1]), ['image/webp', 'image/png']);
}

{
    const revoked = [];
    class FailingImage {
        set src(value) {
            this.value = value;
            queueMicrotask(() => this.onerror());
        }
    }
    const result = await processMyAppIcon(namedBlob('bad', 'image/heic', 'bad.heic'), {
        createImageBitmapFunction: async () => { throw new Error('decode failed'); },
        ImageConstructor: FailingImage,
        urlObject: {
            createObjectURL: () => 'blob:preview',
            revokeObjectURL: (url) => revoked.push(url)
        }
    });
    assert.deepEqual(result, { ok: false, reason: 'decode-failed' });
    assert.deepEqual(revoked, ['blob:preview'], 'fallback preview URL is revoked after decode failure');
}

console.log('my-apps-image-processor: validation, contain resize, WebP/PNG, alpha, and cleanup tests passed');
