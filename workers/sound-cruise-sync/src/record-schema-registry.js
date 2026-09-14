const SCHEMA_VERSION = 1;

const CHORD_RECORD_TYPES = Object.freeze([
  'settings', 'folder', 'chord', 'library_order'
]);

const PITCH_RECORD_TYPES = Object.freeze([
  'settings', 'custom_chord', 'custom_progression', 'melody_stage',
  'chord_stage', 'stage_order', 'progress'
]);
const PITCH_BUILTIN_CHORD_KEYS = new Set([
  'builtin:chord:c', 'builtin:chord:dm', 'builtin:chord:em',
  'builtin:chord:f', 'builtin:chord:g', 'builtin:chord:am'
]);

const APP_RECORD_TYPES = Object.freeze({
  chord: CHORD_RECORD_TYPES,
  pitch: PITCH_RECORD_TYPES
});

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function onlyKeys(value, keys) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function string(value, max = 200) {
  return typeof value === 'string' && value.length <= max &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

function reference(value) {
  return string(value) && /^(?:builtin|legacy|derived):[a-z0-9._:-]+$/u.test(value);
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validatePitchSettings(payload) {
  const allowedValues = [
    'instrument', 'notationStyle', 'scaleEnabled', 'isAnswerMode', 'keyRandomMode',
    'baseOctave', 'keyOffset', 'noteSpeed', 'accidentalDisplay', 'testModeEnabled',
    'builtinChordEnabled', 'builtinProgressionEnabled'
  ];
  if (!onlyKeys(payload, ['id', 'values']) || payload.id !== 'settings' || !isPlainObject(payload.values) ||
      !onlyKeys(payload.values, allowedValues)) return false;
  const values = payload.values;
  if (values.instrument !== undefined && !string(values.instrument, 80)) return false;
  if (values.notationStyle !== undefined && !string(values.notationStyle, 40)) return false;
  if (values.scaleEnabled !== undefined && typeof values.scaleEnabled !== 'boolean') return false;
  if (values.isAnswerMode !== undefined && typeof values.isAnswerMode !== 'boolean') return false;
  if (values.keyRandomMode !== undefined && typeof values.keyRandomMode !== 'boolean') return false;
  if (values.baseOctave !== undefined && !Number.isSafeInteger(values.baseOctave)) return false;
  if (values.keyOffset !== undefined && !Number.isSafeInteger(values.keyOffset)) return false;
  if (values.noteSpeed !== undefined && !finiteNumber(values.noteSpeed)) return false;
  if (values.accidentalDisplay !== undefined && !['sharp', 'flat'].includes(values.accidentalDisplay)) return false;
  if (values.testModeEnabled !== undefined && typeof values.testModeEnabled !== 'boolean') return false;
  for (const key of ['builtinChordEnabled', 'builtinProgressionEnabled']) {
    if (values[key] !== undefined && (!isPlainObject(values[key]) ||
        Object.entries(values[key]).some(([id, enabled]) => !reference(id) || typeof enabled !== 'boolean'))) return false;
  }
  return true;
}

function validatePitchPayload(recordType, recordId, payload) {
  if (!isPlainObject(payload) || payload.id !== recordId) return false;
  if (recordType === 'settings') return validatePitchSettings(payload);
  if (recordType === 'custom_chord') {
    return onlyKeys(payload, ['id', 'legacyId', 'builtinKey', 'name', 'root', 'third', 'fifth', 'seventh', 'tensions', 'inversion', 'isActive']) &&
      ((payload.builtinKey !== undefined && payload.legacyId === undefined) ||
        (payload.builtinKey === undefined && (string(payload.legacyId, 80) || Number.isSafeInteger(payload.legacyId)))) &&
      string(payload.name, 200) &&
      (payload.builtinKey === undefined || PITCH_BUILTIN_CHORD_KEYS.has(payload.builtinKey)) &&
      ['root', 'third', 'fifth', 'seventh', 'inversion'].every((key) => string(payload[key], 20)) &&
      Array.isArray(payload.tensions) && payload.tensions.length <= 16 && payload.tensions.every((value) => string(value, 20)) &&
      typeof payload.isActive === 'boolean';
  }
  if (recordType === 'custom_progression') {
    return onlyKeys(payload, ['id', 'legacyId', 'name', 'chordRefs', 'isActive']) &&
      (string(payload.legacyId, 80) || Number.isSafeInteger(payload.legacyId)) && string(payload.name, 200) &&
      Array.isArray(payload.chordRefs) && payload.chordRefs.length >= 2 && payload.chordRefs.length <= 64 &&
      payload.chordRefs.every(reference) && typeof payload.isActive === 'boolean';
  }
  if (recordType === 'melody_stage') {
    return onlyKeys(payload, ['id', 'legacyId', 'name', 'pool', 'count', 'is2Octave', 'isPianoLayout', 'answerMethod', 'description']) &&
      Number.isSafeInteger(payload.legacyId) && string(payload.name, 200) &&
      Array.isArray(payload.pool) && payload.pool.length > 0 && payload.pool.length <= 128 && payload.pool.every((value) => string(value, 20)) &&
      Number.isSafeInteger(payload.count) && payload.count > 0 && payload.count <= 128 &&
      typeof payload.is2Octave === 'boolean' && typeof payload.isPianoLayout === 'boolean' &&
      string(payload.answerMethod, 40) && string(payload.description, 1000);
  }
  if (recordType === 'chord_stage') {
    return onlyKeys(payload, ['id', 'legacyId', 'name', 'chordRefs', 'count', 'proQuestionMode', 'description']) &&
      Number.isSafeInteger(payload.legacyId) && string(payload.name, 200) &&
      Array.isArray(payload.chordRefs) && payload.chordRefs.length > 0 && payload.chordRefs.length <= 128 &&
      payload.chordRefs.every(reference) && Number.isSafeInteger(payload.count) && payload.count > 0 && payload.count <= 128 &&
      string(payload.proQuestionMode, 40) && string(payload.description, 1000);
  }
  if (recordType === 'stage_order') {
    return onlyKeys(payload, ['id', 'category', 'stageRefs']) &&
      ['melody', 'chord'].includes(payload.category) && Array.isArray(payload.stageRefs) &&
      payload.stageRefs.length <= 99 && payload.stageRefs.every(reference) && new Set(payload.stageRefs).size === payload.stageRefs.length;
  }
  if (recordType === 'progress') {
    return onlyKeys(payload, ['id', 'category', 'stageRef', 'clearCount', 'lastClearedAt']) &&
      ['melody', 'chord'].includes(payload.category) && reference(payload.stageRef) &&
      Number.isSafeInteger(payload.clearCount) && payload.clearCount >= 0 &&
      (payload.lastClearedAt === null || (string(payload.lastClearedAt, 40) && Number.isFinite(Date.parse(payload.lastClearedAt))));
  }
  return false;
}

export function recordTypesForApp(appId) {
  return APP_RECORD_TYPES[appId] || null;
}

export function recordSchemaVersion(appId) {
  return APP_RECORD_TYPES[appId] ? SCHEMA_VERSION : null;
}

export function validateRecordPayload(appId, recordType, recordId, payload) {
  const types = recordTypesForApp(appId);
  if (!types?.includes(recordType)) return false;
  if (appId === 'chord') {
    return isPlainObject(payload) &&
      (!['folder', 'chord'].includes(recordType) || payload.id === recordId);
  }
  return validatePitchPayload(recordType, recordId, payload);
}

export { APP_RECORD_TYPES, CHORD_RECORD_TYPES, PITCH_RECORD_TYPES, SCHEMA_VERSION };
