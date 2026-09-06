export const MY_APPS_ICON_MAX_SOURCE_BYTES = 15 * 1024 * 1024;
export const MY_APPS_ICON_SIZE = 256;
export const MY_APPS_ICON_WEBP_QUALITY = 0.88;

function isSvgFile(file) {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    return type === 'image/svg+xml' || /\.svgz?$/.test(name);
}

export function validateIconFile(file) {
    if (!file || typeof file.size !== 'number' || file.size < 1) {
        return { ok: false, reason: 'invalid-file' };
    }
    if (file.size > MY_APPS_ICON_MAX_SOURCE_BYTES) {
        return { ok: false, reason: 'file-too-large' };
    }
    if (isSvgFile(file)) {
        return { ok: false, reason: 'svg-not-supported' };
    }
    if (file.type && !String(file.type).toLowerCase().startsWith('image/')) {
        return { ok: false, reason: 'invalid-file' };
    }
    return { ok: true };
}

async function hasSvgContent(file) {
    if (typeof file?.slice !== 'function') return false;
    try {
        const header = await file.slice(0, 4096).text();
        return /<svg(?:\s|>)/i.test(header);
    } catch (_) {
        return false;
    }
}

export function calculateContainRect(sourceWidth, sourceHeight, targetSize = MY_APPS_ICON_SIZE) {
    if (!(sourceWidth > 0) || !(sourceHeight > 0) || !(targetSize > 0)) {
        throw new TypeError('invalid-image-dimensions');
    }
    const scale = Math.min(targetSize / sourceWidth, targetSize / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return Object.freeze({
        x: (targetSize - width) / 2,
        y: (targetSize - height) / 2,
        width,
        height
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
        try {
            canvas.toBlob((blob) => resolve(blob || null), type, quality);
        } catch (_) {
            resolve(null);
        }
    });
}

async function decodeWithImageBitmap(file, createImageBitmapFunction) {
    if (typeof createImageBitmapFunction !== 'function') return null;
    try {
        const bitmap = await createImageBitmapFunction(file);
        if (!(bitmap?.width > 0) || !(bitmap?.height > 0)) {
            bitmap?.close?.();
            return null;
        }
        return {
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            cleanup: () => bitmap.close?.()
        };
    } catch (_) {
        return null;
    }
}

function decodeWithImageElement(file, ImageConstructor, urlObject) {
    return new Promise((resolve, reject) => {
        if (typeof ImageConstructor !== 'function' || !urlObject?.createObjectURL || !urlObject?.revokeObjectURL) {
            reject(new Error('image-decoder-unavailable'));
            return;
        }
        const objectUrl = urlObject.createObjectURL(file);
        const image = new ImageConstructor();
        const cleanupUrl = () => urlObject.revokeObjectURL(objectUrl);
        image.onload = () => {
            const width = image.naturalWidth || image.width;
            const height = image.naturalHeight || image.height;
            if (!(width > 0) || !(height > 0)) {
                cleanupUrl();
                reject(new Error('invalid-image-dimensions'));
                return;
            }
            resolve({
                source: image,
                width,
                height,
                cleanup: () => {
                    cleanupUrl();
                    image.src = '';
                }
            });
        };
        image.onerror = () => {
            cleanupUrl();
            reject(new Error('image-decode-failed'));
        };
        image.src = objectUrl;
    });
}

export async function processMyAppIcon(file, {
    createImageBitmapFunction = globalThis.createImageBitmap,
    ImageConstructor = globalThis.Image,
    urlObject = globalThis.URL,
    createCanvas = () => globalThis.document?.createElement('canvas')
} = {}) {
    const validation = validateIconFile(file);
    if (!validation.ok) return validation;
    if (await hasSvgContent(file)) return { ok: false, reason: 'svg-not-supported' };

    let decoded = await decodeWithImageBitmap(file, createImageBitmapFunction);
    if (!decoded) {
        try {
            decoded = await decodeWithImageElement(file, ImageConstructor, urlObject);
        } catch (_) {
            return { ok: false, reason: 'decode-failed' };
        }
    }

    try {
        const canvas = createCanvas();
        const context = canvas?.getContext?.('2d');
        if (!canvas || !context) return { ok: false, reason: 'canvas-unavailable' };
        canvas.width = MY_APPS_ICON_SIZE;
        canvas.height = MY_APPS_ICON_SIZE;
        context.clearRect(0, 0, MY_APPS_ICON_SIZE, MY_APPS_ICON_SIZE);
        const rect = calculateContainRect(decoded.width, decoded.height);
        context.drawImage(decoded.source, rect.x, rect.y, rect.width, rect.height);

        const webpBlob = await canvasToBlob(canvas, 'image/webp', MY_APPS_ICON_WEBP_QUALITY);
        if (webpBlob instanceof Blob && webpBlob.size > 0 && webpBlob.type === 'image/webp') {
            return { ok: true, blob: webpBlob, width: MY_APPS_ICON_SIZE, height: MY_APPS_ICON_SIZE };
        }

        const pngBlob = await canvasToBlob(canvas, 'image/png');
        if (pngBlob instanceof Blob && pngBlob.size > 0 && pngBlob.type === 'image/png') {
            return { ok: true, blob: pngBlob, width: MY_APPS_ICON_SIZE, height: MY_APPS_ICON_SIZE };
        }
        return { ok: false, reason: 'encode-failed' };
    } catch (_) {
        return { ok: false, reason: 'encode-failed' };
    } finally {
        decoded.cleanup();
    }
}
