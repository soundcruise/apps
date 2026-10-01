// Client sync capabilities gate record types that older clients cannot round-trip.
// A client that does not understand a gated record type never receives it and can
// never write or delete it, so its "absent locally" diff cannot become a deletion.
//
// Capabilities are advisory feature flags, not credentials: they only widen the
// view of the authenticated device's own dataset. Unknown or malformed values are
// ignored so they can never break ordinary sync.

import { hashRecord } from './records.js';

const MAX_CAPABILITIES = 16;
const CAPABILITY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;

const SETTINGS_THEME = 'settings_theme_v1';

const APP_CAPABILITIES = Object.freeze({
  port: Object.freeze(['practice_menu_sets_v1']),
  pitch: Object.freeze([SETTINGS_THEME]),
  fretboard: Object.freeze([SETTINGS_THEME]),
  rhythm: Object.freeze([SETTINGS_THEME])
});

const GATED_RECORD_TYPES = Object.freeze({
  port: Object.freeze({ practice_menu_set: 'practice_menu_sets_v1' })
});

// Settings fields that older clients cannot validate. A client without the capability
// sees its settings record without these fields (payload hash and manifest recomputed
// for exactly what it receives), and its settings writes keep the stored values, so it
// can never error on them or erase them.
const GATED_SETTINGS_FIELDS = Object.freeze({
  pitch: Object.freeze({ theme: SETTINGS_THEME }),
  fretboard: Object.freeze({ theme: SETTINGS_THEME }),
  rhythm: Object.freeze({ theme: SETTINGS_THEME })
});

const EMPTY = Object.freeze(new Set());

function fromList(values, appId) {
  const known = APP_CAPABILITIES[appId];
  if (!known || !Array.isArray(values) || values.length > MAX_CAPABILITIES) return EMPTY;
  const accepted = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || !CAPABILITY_PATTERN.test(value)) return EMPTY;
    if (known.includes(value)) accepted.add(value);
  }
  return accepted.size ? Object.freeze(accepted) : EMPTY;
}

// Push / migration bodies carry `capabilities: ["..."]`.
export function parseBodyCapabilities(value, appId) {
  return value === undefined ? EMPTY : fromList(value, appId);
}

// Read queries carry `capabilities=a,b` (a single parameter).
export function parseQueryCapabilities(url, appId) {
  const values = url.searchParams.getAll('capabilities');
  if (values.length !== 1 || values[0].length > 512) return EMPTY;
  return fromList(values[0].split(','), appId);
}

export function requiredCapability(appId, recordType) {
  return GATED_RECORD_TYPES[appId]?.[recordType] || null;
}

export function isRecordTypeAllowed(appId, recordType, capabilities = EMPTY) {
  const required = requiredCapability(appId, recordType);
  return !required || capabilities.has(required);
}

export function hasGatedRecordTypes(appId) {
  return Boolean(GATED_RECORD_TYPES[appId]);
}

export function visibleRecords(appId, records, capabilities = EMPTY) {
  if (!hasGatedRecordTypes(appId)) return records;
  return records.filter((record) => isRecordTypeAllowed(appId, record.recordType, capabilities));
}

function hiddenSettingsFields(appId, recordType, capabilities = EMPTY) {
  const fields = recordType === 'settings' ? GATED_SETTINGS_FIELDS[appId] : null;
  if (!fields) return [];
  return Object.keys(fields).filter((field) => !capabilities.has(fields[field]));
}

function settingsValues(record) {
  const values = record?.deletedAt == null ? record?.payload?.values : null;
  return values && typeof values === 'object' && !Array.isArray(values) ? values : null;
}

export function hasGatedViews(appId) {
  return hasGatedRecordTypes(appId) || Boolean(GATED_SETTINGS_FIELDS[appId]);
}

// The record exactly as this client may see it. A settings record that only carries
// hidden fields is shown as removed, because older clients reject an empty settings record.
export async function visibleRecordView(appId, record, capabilities = EMPTY) {
  if (!record) return record;
  const hidden = hiddenSettingsFields(appId, record.recordType, capabilities);
  const values = settingsValues(record);
  if (!hidden.length || !values || !hidden.some((field) => Object.prototype.hasOwnProperty.call(values, field))) return record;
  const visibleValues = Object.fromEntries(Object.entries(values).filter(([key]) => !hidden.includes(key)));
  const view = Object.keys(visibleValues).length
    ? { ...record, payload: { ...record.payload, values: visibleValues } }
    : { ...record, payload: null, deletedAt: 1 };
  view.payloadHash = await hashRecord(view, crypto, appId);
  return view;
}

export async function visibleRecordViews(appId, records, capabilities = EMPTY) {
  const typed = visibleRecords(appId, records, capabilities);
  return Promise.all(typed.map((record) => visibleRecordView(appId, record, capabilities)));
}

// A settings write from a client that cannot see hidden fields keeps the values stored at
// the exact revision it was based on. The write still applies only at that revision.
export async function preserveHiddenSettings(appId, operation, current, capabilities = EMPTY) {
  const hidden = hiddenSettingsFields(appId, operation.recordType, capabilities);
  const stored = settingsValues(current);
  if (!hidden.length || !stored || Number(current.revision) !== Number(operation.baseRevision)) return operation;
  const kept = Object.fromEntries(hidden.filter((field) => Object.prototype.hasOwnProperty.call(stored, field))
    .map((field) => [field, stored[field]]));
  if (!Object.keys(kept).length) return operation;
  const incoming = operation.deleted ? {} : (operation.payload?.values || {});
  const payload = operation.deleted
    ? { id: operation.recordId, values: kept }
    : { ...operation.payload, values: { ...incoming, ...kept } };
  const next = { ...operation, deleted: false, payload };
  next.payloadHash = await hashRecord(next, crypto, appId);
  return next;
}
