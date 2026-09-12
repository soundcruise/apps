const APP_ID = 'chord';
const SCHEMA_VERSION = 1;
const RECORD_TYPES = new Set(['settings', 'folder', 'chord', 'library_order']);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const OPERATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_RECORD_ID_LENGTH = 200;
const OMIT = Symbol('omit');

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalValue(value, inArray = false, stack = []) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return inArray ? null : OMIT;
  }
  if (typeof value === 'bigint') throw new TypeError('BigInt is not valid JSON');
  if (typeof value !== 'object') return inArray ? null : OMIT;
  if (stack.includes(value)) throw new TypeError('Cyclic data is not valid JSON');
  stack.push(value);
  let normalized;
  if (Array.isArray(value)) {
    normalized = value.map((item) => {
      const next = canonicalValue(item, true, stack);
      return next === OMIT ? null : next;
    });
  } else {
    normalized = {};
    for (const key of Object.keys(value).sort()) {
      const next = canonicalValue(value[key], false, stack);
      if (next !== OMIT) normalized[key] = next;
    }
  }
  stack.pop();
  return normalized;
}

export function canonicalJson(value) {
  const normalized = canonicalValue(value);
  return JSON.stringify(normalized === OMIT ? null : normalized);
}

function semanticPayload(payload) {
  if (payload === null) return null;
  const normalized = canonicalValue(payload);
  if (!isPlainObject(normalized)) throw new TypeError('Record payload must be an object');
  delete normalized.createdAt;
  delete normalized.updatedAt;
  return normalized;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Text(value, cryptoImpl = crypto) {
  const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function hashRecord(record, cryptoImpl = crypto) {
  return sha256Text(canonicalJson({
    appId: APP_ID,
    recordType: record.recordType,
    recordId: record.recordId,
    schemaVersion: record.schemaVersion,
    payload: semanticPayload(record.payload)
  }), cryptoImpl);
}

export async function hashOperation(operation, cryptoImpl = crypto) {
  return sha256Text(canonicalJson({
    appId: APP_ID,
    recordType: operation.recordType,
    recordId: operation.recordId,
    schemaVersion: operation.schemaVersion,
    baseRevision: operation.baseRevision,
    payloadHash: operation.payloadHash,
    deleted: operation.deleted
  }), cryptoImpl);
}

function validRecordId(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 &&
    value.length <= MAX_RECORD_ID_LENGTH && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

export async function validateOperation(input, cryptoImpl = crypto) {
  const keys = ['operationId', 'recordType', 'recordId', 'schemaVersion', 'baseRevision', 'payload', 'payloadHash', 'deleted'];
  if (!isPlainObject(input) || !Object.keys(input).every((key) => keys.includes(key)) ||
      !keys.every((key) => Object.prototype.hasOwnProperty.call(input, key))) {
    return { ok: false, code: 'invalid_shape' };
  }
  if (!OPERATION_ID_PATTERN.test(input.operationId) || !RECORD_TYPES.has(input.recordType) ||
      !validRecordId(input.recordId) || input.schemaVersion !== SCHEMA_VERSION ||
      !Number.isSafeInteger(input.baseRevision) || input.baseRevision < 0 ||
      typeof input.deleted !== 'boolean' || !SHA256_PATTERN.test(input.payloadHash)) {
    return { ok: false, code: 'invalid_operation' };
  }
  let payload = null;
  if (input.deleted) {
    if (input.payload !== null) return { ok: false, code: 'invalid_tombstone' };
  } else {
    try { payload = canonicalValue(input.payload); } catch { return { ok: false, code: 'invalid_payload' }; }
    if (!isPlainObject(payload)) return { ok: false, code: 'invalid_payload' };
    if ((input.recordType === 'folder' || input.recordType === 'chord') && payload.id !== input.recordId) {
      return { ok: false, code: 'record_id_mismatch' };
    }
  }
  const operation = {
    operationId: input.operationId,
    recordType: input.recordType,
    recordId: input.recordId,
    schemaVersion: input.schemaVersion,
    baseRevision: input.baseRevision,
    payload,
    payloadHash: input.payloadHash,
    deleted: input.deleted
  };
  const calculatedHash = await hashRecord(operation, cryptoImpl);
  if (calculatedHash !== input.payloadHash) return { ok: false, code: 'hash_mismatch' };
  operation.operationHash = await hashOperation(operation, cryptoImpl);
  return { ok: true, operation };
}

export async function manifestHash(records, schemaVersion = SCHEMA_VERSION, cryptoImpl = crypto) {
  const rows = records.filter((record) => record.deletedAt == null).map((record) => ({
    recordKey: `${record.recordType}/${record.recordId}`,
    payloadHash: record.payloadHash
  })).sort((left, right) => left.recordKey.localeCompare(right.recordKey));
  return sha256Text(canonicalJson({ appId: APP_ID, schemaVersion, records: rows }), cryptoImpl);
}

function toBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function encodeCursor(sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new TypeError('Invalid cursor sequence');
  return `scc1.${toBase64Url(String(sequence))}`;
}

export function decodeCursor(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value !== 'string' || !/^scc1\.[A-Za-z0-9_-]{1,32}$/.test(value)) return null;
  try {
    const decoded = fromBase64Url(value.slice(5));
    if (!/^(0|[1-9][0-9]*)$/.test(decoded)) return null;
    const sequence = Number(decoded);
    return Number.isSafeInteger(sequence) ? sequence : null;
  } catch {
    return null;
  }
}

export { APP_ID, RECORD_TYPES, SCHEMA_VERSION, SHA256_PATTERN };
