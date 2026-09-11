export const MAX_BODY_BYTES = 8 * 1024;
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;
const MAX_DEVICE_LABEL_CODE_POINTS = 80;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function codePointLength(value) {
  return Array.from(value).length;
}

function hasControlCharacters(value) {
  return /[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

export function isJsonContentType(value) {
  return typeof value === 'string' && /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(value.trim());
}

export async function readBodyWithLimit(request, limit = MAX_BODY_BYTES) {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > limit) return { ok: false, tooLarge: true };
  let buffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    return { ok: false, tooLarge: false };
  }
  if (buffer.byteLength > limit) return { ok: false, tooLarge: true };
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(buffer) };
  } catch {
    return { ok: false, tooLarge: false };
  }
}

function allowedAppIds(env) {
  return new Set(String(env.SYNC_ALLOWED_APP_IDS || '').split(',').map((value) => value.trim()).filter(Boolean));
}

export function validateStartPayload(payload, env) {
  if (!isPlainObject(payload) || !hasOnlyKeys(payload, ['appId', 'turnstileToken', 'deviceLabel', 'initialSummary'])) {
    return { ok: false, reason: 'shape' };
  }
  if (typeof payload.appId !== 'string' || !allowedAppIds(env).has(payload.appId)) {
    return { ok: false, reason: 'app_id' };
  }
  if (typeof payload.turnstileToken !== 'string' || payload.turnstileToken.length < 1 ||
      payload.turnstileToken.length > MAX_TURNSTILE_TOKEN_LENGTH) {
    return { ok: false, reason: 'turnstile' };
  }

  let deviceLabel = null;
  if (payload.deviceLabel !== undefined && payload.deviceLabel !== null) {
    if (typeof payload.deviceLabel !== 'string') return { ok: false, reason: 'device_label' };
    deviceLabel = payload.deviceLabel.trim().normalize('NFC');
    if (!deviceLabel || codePointLength(deviceLabel) > MAX_DEVICE_LABEL_CODE_POINTS || hasControlCharacters(deviceLabel)) {
      return { ok: false, reason: 'device_label' };
    }
  }

  if (!isPlainObject(payload.initialSummary) ||
      !hasOnlyKeys(payload.initialSummary, ['schemaVersion', 'recordCount', 'manifestHash']) ||
      payload.initialSummary.schemaVersion !== 1 ||
      !Number.isInteger(payload.initialSummary.recordCount) || payload.initialSummary.recordCount < 0 ||
      payload.initialSummary.recordCount > 10000 ||
      typeof payload.initialSummary.manifestHash !== 'string' || !SHA256_PATTERN.test(payload.initialSummary.manifestHash)) {
    return { ok: false, reason: 'initial_summary' };
  }

  return {
    ok: true,
    value: {
      appId: payload.appId,
      turnstileToken: payload.turnstileToken,
      deviceLabel,
      initialSummary: {
        schemaVersion: payload.initialSummary.schemaVersion,
        recordCount: payload.initialSummary.recordCount,
        manifestHash: payload.initialSummary.manifestHash
      }
    }
  };
}
