// Client sync capabilities gate record types that older clients cannot round-trip.
// A client that does not understand a gated record type never receives it and can
// never write or delete it, so its "absent locally" diff cannot become a deletion.
//
// Capabilities are advisory feature flags, not credentials: they only widen the
// view of the authenticated device's own dataset. Unknown or malformed values are
// ignored so they can never break ordinary sync.

const MAX_CAPABILITIES = 16;
const CAPABILITY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;

const APP_CAPABILITIES = Object.freeze({
  port: Object.freeze(['practice_menu_sets_v1'])
});

const GATED_RECORD_TYPES = Object.freeze({
  port: Object.freeze({ practice_menu_set: 'practice_menu_sets_v1' })
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
