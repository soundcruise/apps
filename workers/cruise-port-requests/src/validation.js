import { parseStoreIdentity } from './store-url.js';

export const MAX_BODY_BYTES = 2 * 1024;
export const ALLOWED_PAYLOAD_KEYS = Object.freeze([
  'platform',
  'storeUrl',
  'appName',
  'requestSourceVersion',
  'turnstileToken'
]);

const ALLOWED_PAYLOAD_KEY_SET = new Set(ALLOWED_PAYLOAD_KEYS);
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const SOURCE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function codePointLength(value) {
  return [...value].length;
}

function hasLoneSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function normalizeOptionalText(value, { maxCodePoints, pattern = null }) {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string' || hasLoneSurrogate(value) || CONTROL_CHAR_PATTERN.test(value)) {
    return { ok: false };
  }

  const normalized = value.trim().normalize('NFC');
  if (!normalized) return { ok: true, value: null };
  if (codePointLength(normalized) > maxCodePoints || CONTROL_CHAR_PATTERN.test(normalized)) {
    return { ok: false };
  }
  if (pattern && !pattern.test(normalized)) return { ok: false };
  return { ok: true, value: normalized };
}

export function validatePayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false };
  }

  const keys = Object.keys(payload);
  if (keys.some((key) => !ALLOWED_PAYLOAD_KEY_SET.has(key))) return { ok: false };
  if (payload.platform !== 'ios' && payload.platform !== 'android') return { ok: false };
  if (typeof payload.storeUrl !== 'string' || payload.storeUrl.length > 2048) return { ok: false };
  if (typeof payload.turnstileToken !== 'string' || !payload.turnstileToken || payload.turnstileToken.length > 2048) {
    return { ok: false, reason: 'turnstile' };
  }
  if (CONTROL_CHAR_PATTERN.test(payload.turnstileToken) || hasLoneSurrogate(payload.turnstileToken)) {
    return { ok: false, reason: 'turnstile' };
  }

  const appName = normalizeOptionalText(payload.appName, { maxCodePoints: 80 });
  if (!appName.ok) return { ok: false };

  const sourceVersion = normalizeOptionalText(payload.requestSourceVersion, {
    maxCodePoints: 32,
    pattern: SOURCE_VERSION_PATTERN
  });
  if (!sourceVersion.ok) return { ok: false };

  const store = parseStoreIdentity(payload.platform, payload.storeUrl);
  if (!store) return { ok: false };

  return {
    ok: true,
    value: {
      ...store,
      appName: appName.value,
      requestSourceVersion: sourceVersion.value,
      turnstileToken: payload.turnstileToken
    }
  };
}

export function isJsonContentType(value) {
  if (!value) return false;
  const [mediaType, ...parameters] = value.split(';').map((part) => part.trim());
  if (mediaType.toLowerCase() !== 'application/json') return false;
  return parameters.every((parameter) => /^charset=utf-8$/i.test(parameter));
}

export async function readBodyWithLimit(request, maxBytes = MAX_BODY_BYTES) {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0 || parsedLength > maxBytes) {
      return { ok: false, tooLarge: parsedLength > maxBytes };
    }
  }

  if (!request.body) return { ok: true, text: '' };

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, tooLarge: true };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, readFailed: true };
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(body) };
  } catch {
    return { ok: false, readFailed: true };
  }
}
