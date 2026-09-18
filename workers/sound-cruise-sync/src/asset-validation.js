export const ASSET_KINDS = Object.freeze({
  gear_photo_final: Object.freeze({ maxBytes: 1024 * 1024, width: 512, height: 512 }),
  gear_photo_source: Object.freeze({ maxBytes: 8 * 1024 * 1024, maxDimension: 1024 }),
  my_app_icon_final: Object.freeze({ maxBytes: 512 * 1024, width: 256, height: 256 }),
  my_app_icon_source: Object.freeze({ maxBytes: 8 * 1024 * 1024, maxDimension: 1024 })
});

export const ASSET_STORAGE_CATEGORY = 'image';
export const ASSET_QUOTA = Object.freeze({
  maxBytes: 1024 * 1024 * 1024,
  maxCount: 1000,
  dailyNewVariants: 200
});
export const GLOBAL_ASSET_QUOTA = Object.freeze({ dailyNewVariants: 50000, hardStopBytes: 1024 ** 4 });
export const GLOBAL_STORAGE_GUARDS = Object.freeze([
  Object.freeze({ name: 'notice', bytes: 100 * 1024 ** 3 }),
  Object.freeze({ name: 'warning', bytes: 250 * 1024 ** 3 }),
  Object.freeze({ name: 'strong_warning', bytes: 500 * 1024 ** 3 })
]);
export const ASSET_MIME_TYPES = Object.freeze(['image/webp', 'image/png', 'image/jpeg']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[0-9a-f]{64}$/u;

export function validateAssetPrepare(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.appId !== 'port' ||
      !UUID.test(value.assetId || '') || !UUID.test(value.operationId || '') ||
      !HASH.test(value.hash || '') || !Object.hasOwn(ASSET_KINDS, value.kind) ||
      !ASSET_MIME_TYPES.includes(value.mime) || !Number.isInteger(value.byteSize) ||
      !Number.isInteger(value.width) || !Number.isInteger(value.height)) return null;
  const rule = ASSET_KINDS[value.kind];
  if (value.byteSize < 1 || value.byteSize > rule.maxBytes || value.width < 1 || value.height < 1) return null;
  if (rule.width && (value.width !== rule.width || value.height !== rule.height)) return null;
  if (rule.maxDimension && Math.max(value.width, value.height) > rule.maxDimension) return null;
  return Object.freeze({
    appId: 'port', assetId: value.assetId, operationId: value.operationId,
    kind: value.kind, hash: value.hash, mime: value.mime,
    byteSize: value.byteSize, width: value.width, height: value.height
  });
}

export function validateAssetCommit(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.appId !== 'port' ||
      !UUID.test(value.assetId || '') || !UUID.test(value.operationId || '') || !HASH.test(value.hash || '')) return null;
  return Object.freeze({ appId: 'port', assetId: value.assetId, operationId: value.operationId, hash: value.hash });
}

export function validateAssetUnreference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.appId !== 'port' ||
      !Array.isArray(value.assetIds) || value.assetIds.length < 1 || value.assetIds.length > 20 ||
      value.assetIds.some((id) => !UUID.test(id))) return null;
  return Object.freeze({ appId: 'port', assetIds: [...new Set(value.assetIds)] });
}

export function detectImageMime(bytes) {
  if (!(bytes instanceof Uint8Array)) return null;
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

function uint24le(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function pngDimensions(bytes) {
  if (bytes.length < 24 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function webpDimensions(bytes) {
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === 'VP8X') {
    return { width: uint24le(bytes, 24) + 1, height: uint24le(bytes, 27) + 1 };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f && bytes.length >= 25) {
    const bits = (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
  }
  return null;
}

function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    const isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      if (length < 7) return null;
      return { height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6] };
    }
    offset += length;
  }
  return null;
}

export function inspectImageMetadata(bytes) {
  const mime = detectImageMime(bytes);
  const dimensions = mime === 'image/png' ? pngDimensions(bytes)
    : mime === 'image/webp' ? webpDimensions(bytes)
      : mime === 'image/jpeg' ? jpegDimensions(bytes) : null;
  if (!dimensions || !Number.isInteger(dimensions.width) || !Number.isInteger(dimensions.height) ||
      dimensions.width < 1 || dimensions.height < 1) return null;
  return Object.freeze({ mime, ...dimensions });
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
