import assert from 'node:assert/strict';
import {
    MY_APPS_ICON_MAX_SOURCE_BYTES,
    MY_APPS_ICON_SIZE,
    MY_APPS_ICON_WEBP_QUALITY,
    MY_APPS_EDITOR_SOURCE_MAX_SIZE,
    prepareMyAppEditorSource,
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

{
    const harness = createCanvasHarness();
    const result = await processMyAppIcon(namedBlob('\u0089PNG binary metadata <svg preview>', 'image/png', 'valid.png'), {
        createImageBitmapFunction: async () => ({ width: 100, height: 100, close() {} }),
        createCanvas: () => harness.canvas
    });
    assert.equal(result.ok, true, 'SVG-like metadata inside a raster file is not treated as an SVG document');
}

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
    let decodeCount = 0;
    let closed = 0;
    const result = await prepareMyAppEditorSource(namedBlob('large photo', 'image/jpeg', 'photo.jpg'), {
        createImageBitmapFunction: async () => {
            decodeCount += 1;
            return decodeCount === 1
                ? { width: 4032, height: 3024, close() { closed += 1; } }
                : { width: 1024, height: 768, close() { closed += 1; } };
        },
        createCanvas: () => harness.canvas
    });
    assert.equal(result.ok, true);
    assert.equal(result.width, MY_APPS_EDITOR_SOURCE_MAX_SIZE);
    assert.equal(result.height, 768);
    assert.equal(result.blob.type, 'image/webp');
    assert.deepEqual(harness.calls[1], ['drawImage', 0, 0, 1024, 768]);
    assert.equal(closed, 1, 'full-resolution decode is released after the reduced source is encoded');
    result.cleanup();
    assert.equal(closed, 2, 'reduced editor decode remains available until the crop editor closes');
}

{
    const harness = createCanvasHarness();
    const result = await prepareMyAppEditorSource(namedBlob('small image', 'image/png', 'small.png'), {
        createImageBitmapFunction: async () => ({ width: 200, height: 100, close() {} }),
        createCanvas: () => harness.canvas
    });
    assert.equal(result.ok, true);
    assert.equal(harness.canvas.width, 200);
    assert.equal(harness.canvas.height, 100);
    assert.deepEqual(harness.calls[1], ['drawImage', 0, 0, 200, 100], 'small sources are not enlarged');
    result.cleanup();
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
    assert.deepEqual(harness.calls[1].slice(1), [-128, 0, 512, 256], 'default processing uses centered square cover geometry');
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

console.log('my-apps-image-processor: validation, square crop, WebP/PNG, alpha, and cleanup tests passed');
