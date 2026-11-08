import { calculateCropDrawRect } from './my-apps-crop.js?v=1.1.0';
import { prepareMyAppIcon } from './my-apps-image-processor.js?v=1.2.0';

export const GEAR_PHOTO_MAX_SOURCE_BYTES = 15 * 1024 * 1024;
export const GEAR_PHOTO_SOURCE_MAX_SIZE = 1024;
export const GEAR_PHOTO_FINAL_SIZE = 512;
export const GEAR_PHOTO_WEBP_QUALITY = 0.88;

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
        try {
            canvas.toBlob((blob) => resolve(blob || null), type, quality);
        } catch (_) {
            resolve(null);
        }
    });
}

async function encodeCanvas(canvas) {
    const webp = await canvasToBlob(canvas, 'image/webp', GEAR_PHOTO_WEBP_QUALITY);
    if (webp instanceof Blob && webp.size > 0 && webp.type === 'image/webp') return { ok: true, blob: webp };
    const png = await canvasToBlob(canvas, 'image/png');
    return png instanceof Blob && png.size > 0 && png.type === 'image/png'
        ? { ok: true, blob: png }
        : { ok: false, reason: 'encode-failed' };
}

export function validateGearPhotoFile(file) {
    if (!file || typeof file.size !== 'number' || file.size < 1) return { ok: false, reason: 'invalid-file' };
    if (file.size > GEAR_PHOTO_MAX_SOURCE_BYTES) return { ok: false, reason: 'file-too-large' };
    const type = String(file.type || '').toLowerCase();
    const name = String(file.name || '').toLowerCase();
    if (type === 'image/svg+xml' || /\.svgz?$/.test(name)) return { ok: false, reason: 'svg-not-supported' };
    if (type && !type.startsWith('image/')) return { ok: false, reason: 'invalid-file' };
    return { ok: true };
}

export async function prepareGearPhotoSource(file, options = {}) {
    const validation = validateGearPhotoFile(file);
    if (!validation.ok) return validation;
    const prepared = await prepareMyAppIcon(file, options);
    if (!prepared.ok) return prepared;
    try {
        const scale = Math.min(1, GEAR_PHOTO_SOURCE_MAX_SIZE / Math.max(prepared.width, prepared.height));
        const width = Math.max(1, Math.round(prepared.width * scale));
        const height = Math.max(1, Math.round(prepared.height * scale));
        const canvas = (options.createCanvas || (() => globalThis.document?.createElement('canvas')))();
        const context = canvas?.getContext?.('2d');
        if (!canvas || !context) return { ok: false, reason: 'canvas-unavailable' };
        canvas.width = width;
        canvas.height = height;
        context.drawImage(prepared.source, 0, 0, width, height);
        const encoded = await encodeCanvas(canvas);
        if (!encoded.ok) return encoded;
        const decodedSource = await prepareMyAppIcon(encoded.blob, options);
        if (!decodedSource.ok) return decodedSource;
        return { ...decodedSource, blob: encoded.blob, width, height };
    } catch (_) {
        return { ok: false, reason: 'encode-failed' };
    } finally {
        prepared.cleanup();
    }
}

export async function encodePreparedGearPhoto(prepared, cropState, {
    createCanvas = () => globalThis.document?.createElement('canvas')
} = {}) {
    if (!prepared?.source || !(prepared.width > 0) || !(prepared.height > 0)) {
        return { ok: false, reason: 'decode-failed' };
    }
    try {
        const canvas = createCanvas();
        const context = canvas?.getContext?.('2d');
        if (!canvas || !context) return { ok: false, reason: 'canvas-unavailable' };
        canvas.width = GEAR_PHOTO_FINAL_SIZE;
        canvas.height = GEAR_PHOTO_FINAL_SIZE;
        const rect = calculateCropDrawRect(cropState, GEAR_PHOTO_FINAL_SIZE);
        context.drawImage(prepared.source, rect.x, rect.y, rect.width, rect.height);
        const encoded = await encodeCanvas(canvas);
        return encoded.ok ? { ...encoded, width: GEAR_PHOTO_FINAL_SIZE, height: GEAR_PHOTO_FINAL_SIZE } : encoded;
    } catch (_) {
        return { ok: false, reason: 'encode-failed' };
    }
}
