const SCHEMA_VERSION = 1;

const CHORD_RECORD_TYPES = Object.freeze([
  'settings', 'folder', 'chord', 'library_order'
]);

const PITCH_RECORD_TYPES = Object.freeze([
  'settings', 'custom_chord', 'custom_progression', 'melody_stage',
  'chord_stage', 'stage_order', 'progress'
]);
const RHYTHM_RECORD_TYPES = Object.freeze([
  'settings', 'custom_stage', 'create_preset', 'custom_preset',
  'stage_order', 'preset_order', 'builtin_stage_preferences'
]);
const FRETBOARD_RECORD_TYPES = Object.freeze([
  'settings', 'custom_route', 'custom_quiz', 'builtin_route_override',
  'builtin_quiz_override', 'stage_order', 'progress'
]);
const PORT_RECORD_TYPES = Object.freeze([
  'settings', 'metronome_settings', 'metronome_preset', 'tuner_settings',
  'gear_category', 'gear_category_order', 'gear_item', 'gear_order',
  'calendar_event', 'practice_menu', 'practice_menu_order',
  'practice_attachment', 'practice_attachment_set',
  'practice_history_event', 'practice_cycle', 'my_app', 'my_app_order'
]);
const PITCH_BUILTIN_CHORD_KEYS = new Set([
  'builtin:chord:c', 'builtin:chord:dm', 'builtin:chord:em',
  'builtin:chord:f', 'builtin:chord:g', 'builtin:chord:am'
]);

const APP_RECORD_TYPES = Object.freeze({
  chord: CHORD_RECORD_TYPES,
  pitch: PITCH_RECORD_TYPES,
  rhythm: RHYTHM_RECORD_TYPES,
  fretboard: FRETBOARD_RECORD_TYPES,
  port: PORT_RECORD_TYPES
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

const PORT_SINGLETON_IDS = Object.freeze({
  settings: 'global',
  metronome_settings: 'default',
  tuner_settings: 'default',
  gear_category_order: 'default',
  practice_menu_order: 'default',
  practice_cycle: 'current',
  my_app_order: 'default'
});
const PORT_FORBIDDEN_KEYS = /(?:credential|verifier|password|secret|token|recovery.?code|join.?code|blob|base64|binary)/iu;
const PORT_DATA_URL = /^data:/iu;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

function validatePortJson(value, depth = 0, budget = { nodes: 0 }) {
  budget.nodes += 1;
  if (budget.nodes > 4096 || depth > 12) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 20_000 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value) &&
    !PORT_DATA_URL.test(value);
  if (Array.isArray(value)) {
    return value.length <= 2000 && value.every((item) => validatePortJson(item, depth + 1, budget));
  }
  if (!isPlainObject(value) || Object.keys(value).length > 200) return false;
  return Object.entries(value).every(([key, item]) =>
    string(key, 120) && !PORT_FORBIDDEN_KEYS.test(key) &&
    validatePortJson(item, depth + 1, budget));
}

function validatePortPayload(recordType, recordId, payload) {
  if (!isPlainObject(payload) || !onlyKeys(payload, ['id', 'value']) ||
      payload.id !== recordId || !string(recordId, 200) || !validatePortJson(payload.value)) {
    return false;
  }
  const singletonId = PORT_SINGLETON_IDS[recordType];
  if (singletonId) return recordId === singletonId;
  if (recordType === 'gear_order') return /^(?:owned|wishlist|sold)$/u.test(recordId);
  if (recordType === 'practice_attachment_set') {
    return Array.isArray(payload.value) && payload.value.length <= 10 &&
      payload.value.every((id) => typeof id === 'string' && UUID.test(id)) &&
      new Set(payload.value).size === payload.value.length;
  }
  if (recordType === 'practice_attachment') {
    const value = payload.value;
    const asset = value?.asset;
    const expectedAssetKind = value?.kind === 'image' ? 'practice_attachment_image'
      : value?.mimeType === 'application/pdf' ? 'practice_attachment_pdf'
        : value?.mimeType === 'text/plain' ? 'practice_attachment_text' : null;
    const maxBytes = value?.kind === 'image' ? 15 * 1024 * 1024 : 20 * 1024 * 1024;
    return UUID.test(recordId) && isPlainObject(value) && onlyKeys(value, [
      'practiceId', 'fileName', 'kind', 'mimeType', 'byteSize', 'createdAt', 'updatedAt', 'asset'
    ]) && string(value.practiceId, 200) && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(value.practiceId) &&
      string(value.fileName, 255) && !/[\\/]/u.test(value.fileName) &&
      ['image', 'file'].includes(value.kind) &&
      ['image/webp', 'image/png', 'image/jpeg', 'application/pdf', 'text/plain'].includes(value.mimeType) &&
      (value.kind === 'image' ? value.mimeType.startsWith('image/') : ['application/pdf', 'text/plain'].includes(value.mimeType)) &&
      Number.isSafeInteger(value.byteSize) && value.byteSize > 0 && value.byteSize <= maxBytes &&
      string(value.createdAt, 40) && Number.isFinite(Date.parse(value.createdAt)) &&
      string(value.updatedAt, 40) && Number.isFinite(Date.parse(value.updatedAt)) &&
      isPlainObject(asset) && onlyKeys(asset, [
        'assetId', 'kind', 'hash', 'mime', 'byteSize', 'width', 'height', 'objectVersion',
        'availability', 'ownerRecordId', 'originalFilename'
      ]) && UUID.test(asset.assetId || '') && asset.kind === expectedAssetKind &&
      SHA256.test(asset.hash || '') && asset.mime === value.mimeType &&
      Number.isSafeInteger(asset.byteSize) && asset.byteSize === value.byteSize &&
      Number.isSafeInteger(asset.width) && asset.width > 0 && Number.isSafeInteger(asset.height) && asset.height > 0 &&
      Number.isSafeInteger(asset.objectVersion) && asset.objectVersion >= 1 &&
      asset.availability === 'available' && asset.ownerRecordId === value.practiceId &&
      asset.originalFilename === value.fileName;
  }
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(recordId);
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

const RHYTHM_SAMPLE_KEYS = new Set([
  'builtin:stage-sample:triplet', 'builtin:stage-sample:shuffle8',
  'builtin:stage-sample:shuffle16'
]);
const RHYTHM_GRIDS = new Set([
  'quarter', 'eighth', 'sixteenth', 'thirtysecond',
  'eighthTriplet', 'sixteenthTriplet'
]);

function validateRhythmStage(value) {
  return isPlainObject(value) &&
    onlyKeys(value, ['title', 'description', 'grid', 'timeSignature', 'patternBars', 'bars', 'bpm',
      'clickMode', 'rhythmFeel', 'pattern']) && string(value.title, 200) && string(value.description, 1000) &&
    RHYTHM_GRIDS.has(value.grid) && ['4/4', '3/4', '2/4', '6/8'].includes(value.timeSignature) &&
    Number.isSafeInteger(value.patternBars) && value.patternBars >= 1 && value.patternBars <= 4 &&
    Number.isSafeInteger(value.bars) && value.bars >= 1 && value.bars <= 128 &&
    Number.isSafeInteger(value.bpm) && value.bpm >= 30 && value.bpm <= 240 &&
    ['all', 'downbeat', 'none'].includes(value.clickMode) && ['straight', 'swing'].includes(value.rhythmFeel) &&
    Array.isArray(value.pattern) && value.pattern.length > 0 && value.pattern.length <= 512 &&
    value.pattern.every((cell) => isPlainObject(cell) && onlyKeys(cell, ['hit', 'dir', 'type', 'dirManual']) &&
      typeof cell.hit === 'boolean' && [null, 'up', 'down'].includes(cell.dir) &&
      ['hit', 'rest', 'tie'].includes(cell.type) && (cell.dirManual === undefined || cell.dirManual === true));
}

function validateRhythmSettings(payload) {
  const allowedValues = [
    'tapLayout', 'tapUnified', 'inputMode', 'judgePreset',
    'clickRange', 'clickBeats', 'clickOffbeat', 'builtinSampleEnabled'
  ];
  if (!onlyKeys(payload, ['id', 'values']) || payload.id !== 'settings' || !isPlainObject(payload.values) ||
      !onlyKeys(payload.values, allowedValues)) return false;
  const values = payload.values;
  if (values.tapLayout !== undefined && !['lr', 'ud'].includes(values.tapLayout)) return false;
  if (values.tapUnified !== undefined && typeof values.tapUnified !== 'boolean') return false;
  if (values.inputMode !== undefined && !['tap', 'stroke'].includes(values.inputMode)) return false;
  if (values.judgePreset !== undefined && !['easy', 'standard', 'semiStrict', 'strict', 'veryStrict'].includes(values.judgePreset)) return false;
  if (values.clickRange !== undefined && !['always', 'firstBar', 'alternateBars', 'countOnly'].includes(values.clickRange)) return false;
  if (values.clickBeats !== undefined && !['all', 'beat1', 'beats13', 'beats24'].includes(values.clickBeats)) return false;
  if (values.clickOffbeat !== undefined && typeof values.clickOffbeat !== 'boolean') return false;
  if (values.builtinSampleEnabled !== undefined && (!isPlainObject(values.builtinSampleEnabled) ||
      Object.entries(values.builtinSampleEnabled).some(([key, enabled]) =>
        !RHYTHM_SAMPLE_KEYS.has(key) || typeof enabled !== 'boolean'))) return false;
  return true;
}

function nullableInteger(value, minimum, maximum) {
  return value === null || (Number.isSafeInteger(value) && value >= minimum && value <= maximum);
}

function nullableTimestamp(value) {
  return value === null || finiteNumber(value);
}

function validateRhythmPayload(recordType, recordId, payload) {
  if (!isPlainObject(payload) || payload.id !== recordId) return false;
  if (recordType === 'settings') return validateRhythmSettings(payload);
  if (recordType === 'custom_stage') {
    const stage = { ...payload };
    delete stage.id;
    delete stage.legacyId;
    delete stage.builtinKey;
    return onlyKeys(payload, ['id', 'legacyId', 'builtinKey', 'title', 'description', 'grid', 'timeSignature',
      'patternBars', 'bars', 'bpm', 'clickMode', 'rhythmFeel', 'pattern']) &&
      ((string(payload.legacyId, 100) && payload.builtinKey === undefined) ||
        (payload.legacyId === undefined && RHYTHM_SAMPLE_KEYS.has(payload.builtinKey))) &&
      validateRhythmStage(stage);
  }
  if (recordType === 'create_preset') {
    return onlyKeys(payload, ['id', 'legacyId', 'name', 'stageN', 'pattern', 'dirs', 'patternBars', 'bpm',
      'bars', 'balance', 'createdAt', 'updatedAt']) && string(payload.legacyId, 100) && string(payload.name, 40) &&
      Number.isSafeInteger(payload.stageN) && payload.stageN >= 1 && payload.stageN <= 5 &&
      Array.isArray(payload.pattern) && payload.pattern.length > 0 && payload.pattern.length <= 320 &&
      payload.pattern.every((value) => ['hit', 'rest', 'tie'].includes(value)) && Array.isArray(payload.dirs) &&
      payload.dirs.length === payload.pattern.length && payload.dirs.every((value) => [null, 'up', 'down'].includes(value)) &&
      Number.isSafeInteger(payload.patternBars) && payload.patternBars >= 1 && payload.patternBars <= 4 &&
      nullableInteger(payload.bpm, 30, 240) && nullableInteger(payload.bars, 1, 8) &&
      nullableInteger(payload.balance, 0, 100) && nullableTimestamp(payload.createdAt) && nullableTimestamp(payload.updatedAt);
  }
  if (recordType === 'custom_preset') {
    return onlyKeys(payload, ['id', 'legacyId', 'name', 'settings', 'balance', 'createdAt', 'updatedAt']) &&
      string(payload.legacyId, 100) && string(payload.name, 40) && validateRhythmStage(payload.settings) &&
      Number.isSafeInteger(payload.balance) && payload.balance >= 0 && payload.balance <= 100 &&
      nullableTimestamp(payload.createdAt) && nullableTimestamp(payload.updatedAt);
  }
  if (recordType === 'stage_order') {
    return onlyKeys(payload, ['id', 'stageRefs']) && Array.isArray(payload.stageRefs) && payload.stageRefs.length <= 27 &&
      payload.stageRefs.every(reference) && new Set(payload.stageRefs).size === payload.stageRefs.length;
  }
  if (recordType === 'preset_order') {
    return onlyKeys(payload, ['id', 'category', 'presetRefs']) && ['create', 'custom'].includes(payload.category) &&
      Array.isArray(payload.presetRefs) && payload.presetRefs.length <= 100 && payload.presetRefs.every(reference) &&
      new Set(payload.presetRefs).size === payload.presetRefs.length;
  }
  if (recordType === 'builtin_stage_preferences') {
    return onlyKeys(payload, ['id', 'builtinStageRef', 'bpm', 'bars']) && payload.id === payload.builtinStageRef &&
      /^builtin:stage:[1-6]$/u.test(payload.builtinStageRef) && Number.isSafeInteger(payload.bpm) &&
      payload.bpm >= 40 && payload.bpm <= 200 && Number.isSafeInteger(payload.bars) && payload.bars >= 1 && payload.bars <= 64;
  }
  return false;
}

const FRETBOARD_SCALES = new Set([
  'major', 'minor', 'harmonicMinor', 'melodicMinor', 'dorian', 'phrygian',
  'lydian', 'mixolydian', 'locrian', 'pentaMajor', 'pentaMinor', 'blues'
]);
const FRETBOARD_SETTINGS = [
  'tempo', 'quizTimeLimit', 'quizQuestionLimit', 'quizCountdownSound',
  'noteLabelMode', 'cruiseLoopCount', 'cruiseShowNoteNames',
  'cruiseProgression', 'cruiseTapBeats', 'cruiseRhythmSoundType'
];

function validateFretboardNotes(value, maximum = 4096) {
  return Array.isArray(value) && value.length <= maximum && value.every((note) =>
    isPlainObject(note) && onlyKeys(note, ['stringName', 'fret']) &&
    Number.isSafeInteger(note.stringName) && note.stringName >= 1 && note.stringName <= 6 &&
    Number.isSafeInteger(note.fret) && note.fret >= 0 && note.fret <= 24);
}

function validateFretboardGroups(value) {
  return Array.isArray(value) && value.length >= 1 && value.length <= 60 && value.every((group) =>
    isPlainObject(group) && onlyKeys(group, ['name', 'notes']) &&
    (group.name === undefined || string(group.name, 100)) && validateFretboardNotes(group.notes, 512));
}

function validateFretboardCommon(payload, extra) {
  return onlyKeys(payload, [
    'id', 'legacyId', 'name', 'key', 'capo', 'scale', 'displayMode',
    'doMode', 'maxFret', ...extra
  ]) && string(payload.legacyId, 200) && string(payload.name, 200) &&
    Number.isSafeInteger(payload.key) && payload.key >= 0 && payload.key <= 11 &&
    Number.isSafeInteger(payload.capo) && payload.capo >= 0 && payload.capo <= 7 &&
    FRETBOARD_SCALES.has(payload.scale) && ['solfege', 'note', 'degree'].includes(payload.displayMode) &&
    ['movable', 'fixed'].includes(payload.doMode) && Number.isSafeInteger(payload.maxFret) &&
    payload.maxFret >= 12 && payload.maxFret <= 24;
}

function validateFretboardSettings(payload) {
  if (!onlyKeys(payload, ['id', 'values']) || payload.id !== 'settings' ||
      !isPlainObject(payload.values) || !Object.keys(payload.values).length ||
      !onlyKeys(payload.values, FRETBOARD_SETTINGS)) return false;
  const values = payload.values;
  if (values.tempo !== undefined && (!Number.isSafeInteger(values.tempo) || values.tempo < 40 || values.tempo > 200)) return false;
  if (values.quizTimeLimit !== undefined && (!Number.isSafeInteger(values.quizTimeLimit) || values.quizTimeLimit < 1 || values.quizTimeLimit > 10)) return false;
  if (values.quizQuestionLimit !== undefined && ![0, 5, 10, 15].includes(values.quizQuestionLimit)) return false;
  if (values.quizCountdownSound !== undefined && !['none', 'beep', 'gradual', 'hat'].includes(values.quizCountdownSound)) return false;
  if (values.noteLabelMode !== undefined && !['solfege', 'note', 'degree'].includes(values.noteLabelMode)) return false;
  if (values.cruiseLoopCount !== undefined && ![0, 1, 2, 3].includes(values.cruiseLoopCount)) return false;
  if (values.cruiseShowNoteNames !== undefined && typeof values.cruiseShowNoteNames !== 'boolean') return false;
  if (values.cruiseProgression !== undefined && !['auto', 'tap'].includes(values.cruiseProgression)) return false;
  if (values.cruiseTapBeats !== undefined && !['half', 'full'].includes(values.cruiseTapBeats)) return false;
  if (values.cruiseRhythmSoundType !== undefined && !['default', 'kick_only', 'hihat_only', 'soft', 'silent'].includes(values.cruiseRhythmSoundType)) return false;
  return true;
}

function validateFretboardPayload(recordType, recordId, payload) {
  if (!isPlainObject(payload) || payload.id !== recordId) return false;
  if (recordType === 'settings') return validateFretboardSettings(payload);
  if (recordType === 'custom_route') {
    return validateFretboardCommon(payload, ['route', 'groupBreaks', 'groupNames']) &&
      validateFretboardNotes(payload.route) && Array.isArray(payload.groupBreaks) &&
      payload.groupBreaks.length >= 1 && payload.groupBreaks.length <= 60 && payload.groupBreaks[0] === 0 &&
      payload.groupBreaks.every((value, index) => Number.isSafeInteger(value) && value >= 0 &&
        value <= payload.route.length + 59 && (!index || value >= payload.groupBreaks[index - 1])) &&
      Array.isArray(payload.groupNames) && payload.groupNames.length === payload.groupBreaks.length &&
      payload.groupNames.every((value) => string(value, 100));
  }
  if (recordType === 'custom_quiz') return validateFretboardCommon(payload, ['groups']) && validateFretboardGroups(payload.groups);
  if (recordType === 'builtin_route_override') {
    return onlyKeys(payload, ['id', 'builtinStageRef', 'route', 'groupBreaks']) &&
      payload.id === payload.builtinStageRef && /^builtin:route-stage:[1-6]$/u.test(payload.builtinStageRef) &&
      validateFretboardNotes(payload.route) && Array.isArray(payload.groupBreaks) &&
      payload.groupBreaks.length >= 1 && payload.groupBreaks.length <= 60 && payload.groupBreaks[0] === 0 &&
      payload.groupBreaks.every((value, index) => Number.isSafeInteger(value) && value >= 0 &&
        value <= payload.route.length + 59 && (!index || value >= payload.groupBreaks[index - 1]));
  }
  if (recordType === 'builtin_quiz_override') {
    return onlyKeys(payload, ['id', 'builtinStageRef', 'groups']) &&
      payload.id === payload.builtinStageRef && /^builtin:quiz-stage:[1-6]$/u.test(payload.builtinStageRef) &&
      validateFretboardGroups(payload.groups);
  }
  if (recordType === 'stage_order') {
    return onlyKeys(payload, ['id', 'category', 'stageRefs']) && payload.id === payload.category &&
      ['route', 'quiz'].includes(payload.category) && Array.isArray(payload.stageRefs) &&
      payload.stageRefs.length >= 1 && payload.stageRefs.length <= 12 && payload.stageRefs.every(reference) &&
      new Set(payload.stageRefs).size === payload.stageRefs.length;
  }
  if (recordType === 'progress') {
    if (payload.category === 'rules') {
      return onlyKeys(payload, ['id', 'category', 'completedSteps']) && payload.id === 'rules' &&
        Array.isArray(payload.completedSteps) && payload.completedSteps.length >= 1 && payload.completedSteps.every((value) =>
          Number.isSafeInteger(value) && value >= 1 && value <= 5) &&
        new Set(payload.completedSteps).size === payload.completedSteps.length;
    }
    const fields = payload.category === 'route'
      ? ['id', 'category', 'stageRef', 'clearCount']
      : ['id', 'category', 'stageRef', 'attemptCount', 'perfectCount'];
    const counts = payload.category === 'route' ? ['clearCount'] : ['attemptCount', 'perfectCount'];
    return ['route', 'quiz'].includes(payload.category) && onlyKeys(payload, fields) &&
      payload.id === `${payload.category}:${payload.stageRef}` &&
      new RegExp(`^builtin:${payload.category}-stage:[1-6]$`, 'u').test(payload.stageRef) &&
      counts.some((key) => payload[key] !== undefined) && counts.filter((key) => payload[key] !== undefined)
        .every((key) => Number.isSafeInteger(payload[key]) && payload[key] >= 1);
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
  if (appId === 'pitch') return validatePitchPayload(recordType, recordId, payload);
  if (appId === 'rhythm') return validateRhythmPayload(recordType, recordId, payload);
  if (appId === 'port') return validatePortPayload(recordType, recordId, payload);
  return validateFretboardPayload(recordType, recordId, payload);
}

export {
  APP_RECORD_TYPES, CHORD_RECORD_TYPES, PITCH_RECORD_TYPES, RHYTHM_RECORD_TYPES,
  FRETBOARD_RECORD_TYPES, PORT_RECORD_TYPES, SCHEMA_VERSION
};
