import { SHA256_PATTERN, validateOperation } from './records.js';
import { normalizePairingCode } from './crypto.js';

export const MAX_BODY_BYTES = 8 * 1024;
export const MAX_PUSH_BODY_BYTES = 256 * 1024;
export const MAX_PUSH_OPERATIONS = 50;
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;
const MAX_DEVICE_LABEL_CODE_POINTS = 80;

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

function normalizeDeviceLabel(value) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const normalized = value.trim().normalize('NFC');
  return !normalized || codePointLength(normalized) > MAX_DEVICE_LABEL_CODE_POINTS || hasControlCharacters(normalized)
    ? { ok: false }
    : { ok: true, value: normalized };
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

export function validateAppId(appId, env) {
  return typeof appId === 'string' && allowedAppIds(env).has(appId);
}

export function validateStartPayload(payload, env) {
  if (!isPlainObject(payload) || !hasOnlyKeys(payload, ['appId', 'turnstileToken', 'deviceLabel', 'initialSummary'])) {
    return { ok: false, reason: 'shape' };
  }
  if (!validateAppId(payload.appId, env)) {
    return { ok: false, reason: 'app_id' };
  }
  if (typeof payload.turnstileToken !== 'string' || payload.turnstileToken.length < 1 ||
      payload.turnstileToken.length > MAX_TURNSTILE_TOKEN_LENGTH) {
    return { ok: false, reason: 'turnstile' };
  }

  const label = normalizeDeviceLabel(payload.deviceLabel);
  if (!label.ok) return { ok: false, reason: 'device_label' };

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
      deviceLabel: label.value,
      initialSummary: {
        schemaVersion: payload.initialSummary.schemaVersion,
        recordCount: payload.initialSummary.recordCount,
        manifestHash: payload.initialSummary.manifestHash
      }
    }
  };
}

export function validatePairingIssuePayload(payload, env) {
  if (!isPlainObject(payload) || !hasOnlyKeys(payload, ['appId']) || !validateAppId(payload.appId, env)) {
    return { ok: false };
  }
  return { ok: true, value: { appId: payload.appId } };
}

export function validatePairPayload(payload, env) {
  if (!isPlainObject(payload) || !hasOnlyKeys(payload, ['appId', 'pairingCode', 'turnstileToken', 'deviceLabel']) ||
      !validateAppId(payload.appId, env)) return { ok: false, reason: 'shape' };
  const pairingCode = normalizePairingCode(payload.pairingCode);
  if (!pairingCode) return { ok: false, reason: 'pairing_code' };
  if (typeof payload.turnstileToken !== 'string' || payload.turnstileToken.length < 1 ||
      payload.turnstileToken.length > MAX_TURNSTILE_TOKEN_LENGTH) return { ok: false, reason: 'turnstile' };
  const label = normalizeDeviceLabel(payload.deviceLabel);
  if (!label.ok) return { ok: false, reason: 'device_label' };
  return { ok: true, value: { appId: payload.appId, pairingCode, turnstileToken: payload.turnstileToken, deviceLabel: label.value } };
}

export async function validatePushPayload(payload, env, cryptoImpl = crypto) {
  if (!isPlainObject(payload) || !hasOnlyKeys(payload, ['appId', 'mode', 'operations']) ||
      !validateAppId(payload.appId, env) || !['sync', 'migration'].includes(payload.mode) ||
      !Array.isArray(payload.operations) || payload.operations.length < 1 ||
      payload.operations.length > MAX_PUSH_OPERATIONS) {
    return { ok: false, reason: 'shape' };
  }
  const operations = [];
  for (let index = 0; index < payload.operations.length; index += 1) {
    const input = payload.operations[index];
    const result = await validateOperation(input, cryptoImpl);
    operations.push(result.ok
      ? { ok: true, operation: result.operation, index }
      : {
          ok: false,
          operationId: typeof input?.operationId === 'string' && input.operationId.length <= 100
            ? input.operationId
            : null,
          code: result.code,
          index
        });
  }
  return { ok: true, value: { appId: payload.appId, mode: payload.mode, operations } };
}

export function validateMigrationCompletePayload(payload, env) {
  if (!isPlainObject(payload) || !hasOnlyKeys(payload, ['appId', 'schemaVersion', 'recordCount', 'manifestHash']) ||
      !validateAppId(payload.appId, env) || payload.schemaVersion !== 1 ||
      !Number.isInteger(payload.recordCount) || payload.recordCount < 0 || payload.recordCount > 10000 ||
      typeof payload.manifestHash !== 'string' || !SHA256_PATTERN.test(payload.manifestHash)) {
    return { ok: false, reason: 'shape' };
  }
  return { ok: true, value: { ...payload } };
}

export function validateReadQuery(url, env, allowCursor) {
  const allowed = allowCursor ? ['appId', 'cursor'] : ['appId'];
  if ([...url.searchParams.keys()].some((key) => !allowed.includes(key))) return { ok: false };
  const appId = url.searchParams.get('appId');
  if (!validateAppId(appId, env)) return { ok: false };
  const cursor = url.searchParams.get('cursor');
  if (!allowCursor && cursor !== null) return { ok: false };
  return { ok: true, appId, cursor };
}
