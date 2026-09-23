(function installRhythmSyncAdapter(global) {
  'use strict';

  const root = global.SoundCruiseRhythmSync = global.SoundCruiseRhythmSync || {};
  const APP_ID = 'rhythm';
  const SCHEMA_VERSION = 1;
  const MANAGED_KEYS = Object.freeze([
    'rhythmCruiseSettings',
    'rhythmCruiseCreatePresets:v1',
    'rhythmCruiseCustomPresets:v1',
    'rhythmCruiseStagePrefs:v1',
    'rhythmCruiseClickSettings:v1',
    'rhythmProCustomStageSamplesSeeded'
  ]);
  const EXCLUDED_KEYS = Object.freeze([
    'soundcruise_rhythm_mic_presets',
    'soundcruise_rhythm_tap_presets',
    'rhythmCruiseVexZoom:v1',
    'rhythmCruiseResultHistory:v1'
  ]);
  const SYNC_SETTINGS = Object.freeze([
    'tapLayout', 'tapUnified', 'inputMode', 'judgePreset',
    'clickRange', 'clickBeats', 'clickOffbeat', 'builtinSampleEnabled'
  ]);
  const DEFAULT_SETTINGS = Object.freeze({
    tapLayout: 'lr', tapUnified: true, inputMode: 'tap', judgePreset: 'semiStrict',
    clickRange: 'always', clickBeats: 'all', clickOffbeat: false
  });
  const RECORD_TYPES = new Set([
    'settings', 'custom_stage', 'create_preset', 'custom_preset',
    'stage_order', 'preset_order', 'builtin_stage_preferences'
  ]);
  const GRID_VALUES = new Set(['quarter', 'eighth', 'sixteenth', 'thirtysecond', 'eighthTriplet', 'sixteenthTriplet']);
  const TIME_SIGNATURE_VALUES = new Set(['4/4', '3/4', '2/4', '6/8']);
  const CLICK_MODE_VALUES = new Set(['all', 'downbeat', 'none']);
  const CREATE_PATTERN_VALUES = new Set(['hit', 'rest', 'tie']);
  const STAGE_CLICK_RANGES = new Set(['always', 'firstBar', 'alternateBars', 'countOnly']);
  const STAGE_CLICK_BEATS = new Set(['all', 'beat1', 'beats13', 'beats24']);
  const BUILTIN_STAGE_DEFAULTS = Object.freeze({
    1: Object.freeze({ bpm: 80, bars: 4 }),
    2: Object.freeze({ bpm: 70, bars: 4 }),
    3: Object.freeze({ bpm: 80, bars: 4 }),
    4: Object.freeze({ bpm: 80, bars: 4 }),
    5: Object.freeze({ bpm: 80, bars: 4 }),
    6: Object.freeze({ bpm: 80, bars: 4 })
  });

  function alternating(count) {
    return Array.from({ length: count }, (_value, index) => ({
      hit: true, dir: index % 2 === 0 ? 'down' : 'up', type: 'hit'
    }));
  }

  function triplets(count) {
    return Array.from({ length: count }, (_value, index) => ({
      hit: true, dir: index % 3 === 2 ? 'up' : 'down', type: 'hit'
    }));
  }

  const BUILTIN_SAMPLE_STAGES = Object.freeze([
    Object.freeze({
      key: 'builtin:stage-sample:triplet', legacyId: 'rc_sample_triplet', title: '三連符',
      description: '', grid: 'eighthTriplet', timeSignature: '4/4', patternBars: 1,
      bars: 4, bpm: 70, clickMode: 'all', rhythmFeel: 'straight', pattern: triplets(12)
    }),
    Object.freeze({
      key: 'builtin:stage-sample:shuffle8', legacyId: 'rc_sample_shuffle8', title: '8分のシャッフル',
      description: '', grid: 'eighth', timeSignature: '4/4', patternBars: 1,
      bars: 4, bpm: 80, clickMode: 'all', rhythmFeel: 'swing', pattern: alternating(8)
    }),
    Object.freeze({
      key: 'builtin:stage-sample:shuffle16', legacyId: 'rc_sample_shuffle16', title: '16分のシャッフル',
      description: '', grid: 'sixteenth', timeSignature: '4/4', patternBars: 1,
      bars: 4, bpm: 70, clickMode: 'all', rhythmFeel: 'swing', pattern: alternating(16)
    })
  ]);

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null || prototype?.constructor?.name === 'Object';
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function canonicalValue(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : null;
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (!isPlainObject(value)) return null;
    const result = {};
    Object.keys(value).sort().forEach((key) => {
      if (!['undefined', 'function', 'symbol'].includes(typeof value[key])) result[key] = canonicalValue(value[key]);
    });
    return result;
  }

  function canonicalJson(value) { return JSON.stringify(canonicalValue(value)); }

  function stableHash(value) {
    const text = canonicalJson(value);
    let first = 2166136261;
    let second = 0x9e3779b9;
    for (let index = 0; index < text.length; index += 1) {
      const point = text.charCodeAt(index);
      first = Math.imul(first ^ point, 16777619) >>> 0;
      second = Math.imul(second ^ point, 2246822519) >>> 0;
    }
    return first.toString(16).padStart(8, '0') + second.toString(16).padStart(8, '0');
  }

  async function sha256(value, cryptoImpl) {
    const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function parseJson(raw, key, fallback) {
    if (raw === null || raw === undefined || raw === '') return clone(fallback);
    try { return JSON.parse(raw); } catch { throw new Error(`rhythm_legacy_json_invalid:${key}`); }
  }

  function text(value, maximum = 1000) {
    return typeof value === 'string' && value.length <= maximum && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
  }

  function reference(value) {
    return text(value, 200) && /^(?:builtin|legacy|derived):[a-z0-9._:-]+$/u.test(value);
  }

  function clampInteger(value, minimum, maximum, fallback) {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
  }

  function normalizeLegacyId(kind, value, semantic, ordinal) {
    const clean = String(value ?? '').trim();
    if (clean && clean.length <= 100 && !/[\u0000-\u001f\u007f-\u009f]/u.test(clean)) {
      return `legacy:${kind}:${encodeURIComponent(clean).replace(/%/g, '_').toLowerCase()}`;
    }
    return `derived:${kind}:${stableHash({ semantic, ordinal })}`;
  }

  function normalizeCell(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const type = ['hit', 'rest', 'tie'].includes(source.type) ? source.type : (source.hit ? 'hit' : 'rest');
    const hit = type === 'hit' && source.hit !== false;
    const dir = source.dir === 'up' || source.dir === 'down' ? source.dir : null;
    return { hit, dir, type, ...(source.dirManual === true ? { dirManual: true } : {}) };
  }

  function normalizeStage(raw) {
    if (!isPlainObject(raw)) return null;
    const grid = GRID_VALUES.has(raw.grid) ? raw.grid : 'eighth';
    const timeSignature = TIME_SIGNATURE_VALUES.has(raw.timeSignature) ? raw.timeSignature : '4/4';
    const pattern = Array.isArray(raw.pattern) ? raw.pattern.slice(0, 512).map(normalizeCell) : [];
    if (!pattern.length) return null;
    const title = String(raw.title ?? '').trim().slice(0, 200);
    if (!title) return null;
    return {
      title, description: String(raw.description ?? '').trim().slice(0, 1000), grid, timeSignature,
      patternBars: clampInteger(raw.patternBars, 1, 4, 1), bars: clampInteger(raw.bars, 1, 128, 4),
      bpm: clampInteger(raw.bpm, 30, 240, 80),
      clickMode: CLICK_MODE_VALUES.has(raw.clickMode) ? raw.clickMode : 'all',
      rhythmFeel: raw.rhythmFeel === 'swing' ? 'swing' : 'straight', pattern
    };
  }

  function sampleForLegacyId(id) {
    return BUILTIN_SAMPLE_STAGES.find((sample) => sample.legacyId === String(id ?? '')) || null;
  }

  function makeRecord(recordType, recordId, payload) {
    return { recordType, recordId, schemaVersion: SCHEMA_VERSION, payload: { id: recordId, ...payload } };
  }

  function normalizeCreatePreset(raw, ordinal) {
    if (!isPlainObject(raw)) return null;
    const name = String(raw.name ?? '').trim().slice(0, 40);
    const stageN = clampInteger(raw.stageN, 1, 5, 0);
    if (!name || !stageN || !Array.isArray(raw.pattern) || !raw.pattern.length) return null;
    const pattern = raw.pattern.slice(0, 320).map((value) => CREATE_PATTERN_VALUES.has(value) ? value : 'rest');
    const dirs = Array.from({ length: pattern.length }, (_value, index) =>
      raw.dirs?.[index] === 'up' || raw.dirs?.[index] === 'down' ? raw.dirs[index] : null);
    const semantic = { name, stageN, pattern, dirs };
    const legacyId = String(raw.id || `derived-${stableHash({ semantic, ordinal })}`);
    return {
      recordId: normalizeLegacyId('create-preset', raw.id, semantic, ordinal), legacyId,
      name, stageN, pattern, dirs, patternBars: clampInteger(raw.patternBars, 1, 4, 1),
      bpm: raw.bpm == null ? null : clampInteger(raw.bpm, 30, 240, 80),
      bars: raw.bars == null ? null : clampInteger(raw.bars, 1, 8, 4),
      balance: raw.balance == null ? null : clampInteger(raw.balance, 0, 100, 50),
      createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : null,
      updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : null
    };
  }

  function normalizeCustomPreset(raw, ordinal) {
    if (!isPlainObject(raw)) return null;
    const name = String(raw.name ?? '').trim().slice(0, 40);
    const settings = normalizeStage(raw.settings);
    if (!name || !settings) return null;
    const semantic = { name, settings };
    const legacyId = String(raw.id || `derived-${stableHash({ semantic, ordinal })}`);
    return {
      recordId: normalizeLegacyId('custom-preset', raw.id, semantic, ordinal), legacyId,
      name, settings, balance: clampInteger(raw.balance, 0, 100, 50),
      createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : null,
      updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : null
    };
  }

  function meaningfulSettings(values) {
    return Object.entries(values).some(([key, value]) => {
      if (key === 'builtinSampleEnabled') return Object.keys(value).length > 0;
      return canonicalJson(value) !== canonicalJson(DEFAULT_SETTINGS[key]);
    });
  }

  function normalizeRawSnapshot(rawSnapshot) {
    if (!isPlainObject(rawSnapshot)) throw new Error('rhythm_snapshot_invalid');
    if (rawSnapshot.appId !== undefined || rawSnapshot.records !== undefined) {
      if (rawSnapshot.appId !== APP_ID || rawSnapshot.schemaVersion !== SCHEMA_VERSION || !Array.isArray(rawSnapshot.records)) {
        throw new Error('rhythm_snapshot_future_or_invalid');
      }
      const snapshot = clone(rawSnapshot);
      snapshot.records.sort((left, right) => `${left.recordType}/${left.recordId}`.localeCompare(`${right.recordType}/${right.recordId}`));
      validateSnapshot(snapshot);
      return snapshot;
    }
    if (rawSnapshot.schemaVersion !== undefined && ![0, 1].includes(rawSnapshot.schemaVersion)) {
      throw new Error('rhythm_snapshot_future_version');
    }
    const values = isPlainObject(rawSnapshot.values) ? rawSnapshot.values : rawSnapshot;
    const main = parseJson(values.rhythmCruiseSettings, 'rhythmCruiseSettings', {});
    const createPresets = parseJson(values['rhythmCruiseCreatePresets:v1'], 'rhythmCruiseCreatePresets:v1', []);
    const customPresets = parseJson(values['rhythmCruiseCustomPresets:v1'], 'rhythmCruiseCustomPresets:v1', []);
    const stagePrefs = parseJson(values['rhythmCruiseStagePrefs:v1'], 'rhythmCruiseStagePrefs:v1', {});
    const clickSettings = parseJson(values['rhythmCruiseClickSettings:v1'], 'rhythmCruiseClickSettings:v1', {});
    if (!isPlainObject(main) || !Array.isArray(createPresets) || !Array.isArray(customPresets) ||
        !isPlainObject(stagePrefs) || !isPlainObject(clickSettings)) throw new Error('rhythm_legacy_shape_invalid');

    const records = [];
    const settingsValues = {};
    const copySetting = (key, value, valid) => {
      if (valid && canonicalJson(value) !== canonicalJson(DEFAULT_SETTINGS[key])) settingsValues[key] = value;
    };
    copySetting('tapLayout', main.tapLayout === 'ud' ? 'ud' : 'lr', true);
    copySetting('tapUnified', main.tapUnified !== false, true);
    copySetting('inputMode', main.inputMode === 'stroke' ? 'stroke' : 'tap', true);
    copySetting('judgePreset', ['easy', 'standard', 'semiStrict', 'strict', 'veryStrict'].includes(main.judgePreset)
      ? main.judgePreset : 'semiStrict', true);
    copySetting('clickRange', STAGE_CLICK_RANGES.has(clickSettings.range) ? clickSettings.range : 'always', true);
    copySetting('clickBeats', STAGE_CLICK_BEATS.has(clickSettings.beats) ? clickSettings.beats : 'all', true);
    copySetting('clickOffbeat', clickSettings.offbeat === true, true);

    const stages = Array.isArray(main.rhythmProCustomStages) ? main.rhythmProCustomStages : [];
    const stageRefs = [];
    const presentSamples = new Set();
    stages.forEach((raw, ordinal) => {
      const semantic = normalizeStage(raw);
      if (!semantic) throw new Error('rhythm_legacy_stage_invalid');
      const sample = sampleForLegacyId(raw.id);
      if (sample) {
        presentSamples.add(sample.key);
        stageRefs.push(sample.key);
        if (canonicalJson(semantic) === canonicalJson(normalizeStage(sample))) return;
        const recordId = `builtin:stage-override:${sample.key.split(':').at(-1)}`;
        records.push(makeRecord('custom_stage', recordId, { builtinKey: sample.key, ...semantic }));
        return;
      }
      const recordId = normalizeLegacyId('stage', raw.id, semantic, ordinal);
      stageRefs.push(recordId);
      records.push(makeRecord('custom_stage', recordId, {
        legacyId: String(raw.id || `derived-${stableHash({ semantic, ordinal })}`), ...semantic
      }));
    });
    if (values.rhythmProCustomStageSamplesSeeded) {
      const enabled = {};
      BUILTIN_SAMPLE_STAGES.forEach((sample) => { if (!presentSamples.has(sample.key)) enabled[sample.key] = false; });
      if (Object.keys(enabled).length) settingsValues.builtinSampleEnabled = enabled;
    }
    const samplesInitialized = Boolean(values.rhythmProCustomStageSamplesSeeded) || presentSamples.size > 0;
    const defaultStageOrder = samplesInitialized ? BUILTIN_SAMPLE_STAGES.map((sample) => sample.key)
      .filter((ref) => settingsValues.builtinSampleEnabled?.[ref] !== false) : [];
    if (stageRefs.some((ref) => !defaultStageOrder.includes(ref)) || canonicalJson(stageRefs) !== canonicalJson(defaultStageOrder)) {
      records.push(makeRecord('stage_order', 'stages', { stageRefs }));
    }

    const createRefs = [];
    createPresets.forEach((raw, ordinal) => {
      const preset = normalizeCreatePreset(raw, ordinal);
      if (!preset) throw new Error('rhythm_legacy_create_preset_invalid');
      createRefs.push(preset.recordId);
      const { recordId, ...payload } = preset;
      records.push(makeRecord('create_preset', recordId, payload));
    });
    if (createRefs.length) records.push(makeRecord('preset_order', 'create', { category: 'create', presetRefs: createRefs }));

    const customRefs = [];
    customPresets.forEach((raw, ordinal) => {
      const preset = normalizeCustomPreset(raw, ordinal);
      if (!preset) throw new Error('rhythm_legacy_custom_preset_invalid');
      customRefs.push(preset.recordId);
      const { recordId, ...payload } = preset;
      records.push(makeRecord('custom_preset', recordId, payload));
    });
    if (customRefs.length) records.push(makeRecord('preset_order', 'custom', { category: 'custom', presetRefs: customRefs }));

    const builtinPrefs = isPlainObject(stagePrefs.builtin) ? stagePrefs.builtin : {};
    Object.entries(BUILTIN_STAGE_DEFAULTS).forEach(([stageN, defaults]) => {
      const raw = isPlainObject(builtinPrefs[stageN]) ? builtinPrefs[stageN] : {};
      const bpm = clampInteger(raw.bpm, 40, 200, defaults.bpm);
      const bars = clampInteger(raw.bars, 1, 64, defaults.bars);
      if (bpm !== defaults.bpm || bars !== defaults.bars) {
        const ref = `builtin:stage:${stageN}`;
        records.push(makeRecord('builtin_stage_preferences', ref, { builtinStageRef: ref, bpm, bars }));
      }
    });
    if (meaningfulSettings(settingsValues)) records.push(makeRecord('settings', 'settings', { values: settingsValues }));
    records.sort((left, right) => `${left.recordType}/${left.recordId}`.localeCompare(`${right.recordType}/${right.recordId}`));
    const snapshot = { appId: APP_ID, schemaVersion: SCHEMA_VERSION, records };
    validateSnapshot(snapshot);
    return snapshot;
  }

  function validateStagePayload(payload) {
    return text(payload.title, 200) && text(payload.description, 1000) && GRID_VALUES.has(payload.grid) &&
      TIME_SIGNATURE_VALUES.has(payload.timeSignature) && Number.isSafeInteger(payload.patternBars) &&
      payload.patternBars >= 1 && payload.patternBars <= 4 && Number.isSafeInteger(payload.bars) &&
      payload.bars >= 1 && payload.bars <= 128 && Number.isSafeInteger(payload.bpm) &&
      payload.bpm >= 30 && payload.bpm <= 240 && CLICK_MODE_VALUES.has(payload.clickMode) &&
      ['straight', 'swing'].includes(payload.rhythmFeel) && Array.isArray(payload.pattern) &&
      payload.pattern.length > 0 && payload.pattern.length <= 512 && payload.pattern.every((cell) =>
        isPlainObject(cell) && typeof cell.hit === 'boolean' && ['hit', 'rest', 'tie'].includes(cell.type) &&
        [null, 'up', 'down'].includes(cell.dir) && (cell.dirManual === undefined || cell.dirManual === true));
  }

  function onlyKeys(value, keys) { return Object.keys(value).every((key) => keys.includes(key)); }

  function validateRecordShape(record) {
    const payload = record.payload;
    if (record.recordType === 'settings') {
      if (!onlyKeys(payload, ['id', 'values']) || !isPlainObject(payload.values) ||
          !onlyKeys(payload.values, SYNC_SETTINGS)) return false;
      const values = payload.values;
      if (values.tapLayout !== undefined && !['lr', 'ud'].includes(values.tapLayout)) return false;
      if (values.tapUnified !== undefined && typeof values.tapUnified !== 'boolean') return false;
      if (values.inputMode !== undefined && !['tap', 'stroke'].includes(values.inputMode)) return false;
      if (values.judgePreset !== undefined && !['easy', 'standard', 'semiStrict', 'strict', 'veryStrict'].includes(values.judgePreset)) return false;
      if (values.clickRange !== undefined && !STAGE_CLICK_RANGES.has(values.clickRange)) return false;
      if (values.clickBeats !== undefined && !STAGE_CLICK_BEATS.has(values.clickBeats)) return false;
      if (values.clickOffbeat !== undefined && typeof values.clickOffbeat !== 'boolean') return false;
      if (values.builtinSampleEnabled !== undefined && (!isPlainObject(values.builtinSampleEnabled) ||
          Object.entries(values.builtinSampleEnabled).some(([ref, enabled]) =>
            !BUILTIN_SAMPLE_STAGES.some((sample) => sample.key === ref) || typeof enabled !== 'boolean'))) return false;
      return true;
    }
    if (record.recordType === 'custom_stage') {
      return onlyKeys(payload, ['id', 'legacyId', 'builtinKey', 'title', 'description', 'grid', 'timeSignature',
        'patternBars', 'bars', 'bpm', 'clickMode', 'rhythmFeel', 'pattern']) &&
        ((text(payload.legacyId, 100) && payload.builtinKey === undefined) ||
          (payload.legacyId === undefined && BUILTIN_SAMPLE_STAGES.some((sample) => sample.key === payload.builtinKey))) &&
        validateStagePayload(payload);
    }
    if (record.recordType === 'create_preset') {
      return onlyKeys(payload, ['id', 'legacyId', 'name', 'stageN', 'pattern', 'dirs', 'patternBars', 'bpm', 'bars',
        'balance', 'createdAt', 'updatedAt']) && text(payload.legacyId, 100) && text(payload.name, 40) &&
        Number.isSafeInteger(payload.stageN) && payload.stageN >= 1 && payload.stageN <= 5 &&
        Array.isArray(payload.pattern) && payload.pattern.length > 0 && payload.pattern.length <= 320 &&
        payload.pattern.every((value) => CREATE_PATTERN_VALUES.has(value)) && Array.isArray(payload.dirs) &&
        payload.dirs.length === payload.pattern.length && payload.dirs.every((value) => [null, 'up', 'down'].includes(value)) &&
        Number.isSafeInteger(payload.patternBars) && payload.patternBars >= 1 && payload.patternBars <= 4 &&
        (payload.bpm === null || (Number.isSafeInteger(payload.bpm) && payload.bpm >= 30 && payload.bpm <= 240)) &&
        (payload.bars === null || (Number.isSafeInteger(payload.bars) && payload.bars >= 1 && payload.bars <= 8)) &&
        (payload.balance === null || (Number.isSafeInteger(payload.balance) && payload.balance >= 0 && payload.balance <= 100)) &&
        [payload.createdAt, payload.updatedAt].every((value) => value === null || Number.isFinite(value));
    }
    if (record.recordType === 'custom_preset') {
      return onlyKeys(payload, ['id', 'legacyId', 'name', 'settings', 'balance', 'createdAt', 'updatedAt']) &&
        text(payload.legacyId, 100) && text(payload.name, 40) && validateStagePayload(payload.settings) &&
        Number.isSafeInteger(payload.balance) && payload.balance >= 0 && payload.balance <= 100 &&
        [payload.createdAt, payload.updatedAt].every((value) => value === null || Number.isFinite(value));
    }
    if (record.recordType === 'stage_order') {
      return onlyKeys(payload, ['id', 'stageRefs']) && Array.isArray(payload.stageRefs) &&
        payload.stageRefs.length <= 27 && payload.stageRefs.every(reference) && new Set(payload.stageRefs).size === payload.stageRefs.length;
    }
    if (record.recordType === 'preset_order') {
      return onlyKeys(payload, ['id', 'category', 'presetRefs']) && ['create', 'custom'].includes(payload.category) &&
        Array.isArray(payload.presetRefs) && payload.presetRefs.length <= 100 && payload.presetRefs.every(reference) &&
        new Set(payload.presetRefs).size === payload.presetRefs.length;
    }
    if (record.recordType === 'builtin_stage_preferences') {
      return onlyKeys(payload, ['id', 'builtinStageRef', 'bpm', 'bars']) && payload.id === payload.builtinStageRef &&
        /^builtin:stage:[1-6]$/u.test(payload.builtinStageRef) && Number.isSafeInteger(payload.bpm) &&
        payload.bpm >= 40 && payload.bpm <= 200 && Number.isSafeInteger(payload.bars) && payload.bars >= 1 && payload.bars <= 64;
    }
    return false;
  }

  function validateSnapshot(snapshot) {
    if (!isPlainObject(snapshot) || snapshot.appId !== APP_ID || snapshot.schemaVersion !== SCHEMA_VERSION ||
        !Array.isArray(snapshot.records)) throw new Error('rhythm_snapshot_invalid');
    const seen = new Set();
    const stageRefs = new Set(BUILTIN_SAMPLE_STAGES.map((sample) => sample.key));
    const presetRefs = { create: new Set(), custom: new Set() };
    for (const record of snapshot.records) {
      if (!isPlainObject(record) || !RECORD_TYPES.has(record.recordType) || record.schemaVersion !== SCHEMA_VERSION ||
          !text(record.recordId, 200) || !isPlainObject(record.payload) || record.payload.id !== record.recordId ||
          !validateRecordShape(record)) throw new Error('rhythm_record_invalid');
      const key = `${record.recordType}/${record.recordId}`;
      if (seen.has(key)) throw new Error('rhythm_record_duplicate');
      seen.add(key);
      if (record.recordType === 'custom_stage') stageRefs.add(record.recordId);
      if (record.recordType === 'create_preset') presetRefs.create.add(record.recordId);
      if (record.recordType === 'custom_preset') presetRefs.custom.add(record.recordId);
    }
    for (const record of snapshot.records) {
      if (record.recordType === 'stage_order' && record.payload.stageRefs.some((ref) => !stageRefs.has(ref))) {
        throw new Error('rhythm_record_reference_invalid');
      }
      if (record.recordType === 'preset_order' &&
          record.payload.presetRefs.some((ref) => !presetRefs[record.payload.category].has(ref))) {
        throw new Error('rhythm_record_reference_invalid');
      }
    }
    return true;
  }

  function readLocalSnapshot(storage) {
    if (!storage || typeof storage.getItem !== 'function') throw new Error('rhythm_storage_unavailable');
    const values = {};
    MANAGED_KEYS.forEach((key) => { values[key] = storage.getItem(key); });
    return { schemaVersion: 0, values };
  }

  function isMeaningfulLocalData(snapshot) { return normalizeRawSnapshot(snapshot).records.length > 0; }

  function semanticPayload(payload) {
    const normalized = clone(payload);
    delete normalized.createdAt;
    delete normalized.updatedAt;
    return normalized;
  }

  async function serializeRecords(snapshot, cryptoImpl = global.crypto) {
    const canonical = normalizeRawSnapshot(snapshot);
    const records = [];
    for (const record of canonical.records) {
      records.push({ ...clone(record), payloadHash: await sha256(canonicalJson({
        appId: APP_ID, recordType: record.recordType, recordId: record.recordId,
        schemaVersion: record.schemaVersion, payload: semanticPayload(record.payload)
      }), cryptoImpl) });
    }
    return records;
  }

  function deserializeRecords(records) {
    const snapshot = { appId: APP_ID, schemaVersion: SCHEMA_VERSION, records: records.map((record) => ({
      recordType: record.recordType, recordId: record.recordId,
      schemaVersion: record.schemaVersion, payload: clone(record.payload)
    })) };
    validateSnapshot(snapshot);
    snapshot.records.sort((left, right) => `${left.recordType}/${left.recordId}`.localeCompare(`${right.recordType}/${right.recordId}`));
    return snapshot;
  }

  async function computeManifest(snapshot, cryptoImpl = global.crypto) {
    const records = await serializeRecords(snapshot, cryptoImpl);
    const rows = records.map((record) => ({
      recordKey: `${record.recordType}/${record.recordId}`, payloadHash: record.payloadHash
    })).sort((left, right) => left.recordKey.localeCompare(right.recordKey));
    return sha256(canonicalJson({ appId: APP_ID, schemaVersion: SCHEMA_VERSION, records: rows }), cryptoImpl);
  }

  function recordMap(snapshot) {
    const canonical = normalizeRawSnapshot(snapshot);
    return new Map(canonical.records.map((record) => [`${record.recordType}/${record.recordId}`, clone(record)]));
  }

  function mergeFieldRecord(left, right, conflicts, key, fields, reason) {
    const payload = clone(left.payload);
    fields.forEach((field) => {
      if (right.payload[field] === undefined) return;
      if (payload[field] !== undefined && canonicalJson(payload[field]) !== canonicalJson(right.payload[field])) {
        conflicts.push({ recordKey: key, field, reason });
      } else payload[field] = clone(right.payload[field]);
    });
    return { ...clone(left), payload };
  }

  function mergeTimestamped(left, right) {
    const withoutTimes = (payload) => {
      const value = clone(payload);
      delete value.createdAt;
      delete value.updatedAt;
      return value;
    };
    if (canonicalJson(withoutTimes(left.payload)) !== canonicalJson(withoutTimes(right.payload))) return null;
    const payload = clone(left.payload);
    const created = [left.payload.createdAt, right.payload.createdAt].filter(Number.isFinite);
    const updated = [left.payload.updatedAt, right.payload.updatedAt].filter(Number.isFinite);
    payload.createdAt = created.length ? Math.min(...created) : null;
    payload.updatedAt = updated.length ? Math.max(...updated) : null;
    return { ...clone(left), payload };
  }

  function mergeSnapshots(localSnapshot, remoteSnapshot) {
    const local = recordMap(localSnapshot);
    const remote = recordMap(remoteSnapshot);
    const merged = new Map();
    const conflicts = [];
    for (const key of new Set([...local.keys(), ...remote.keys()])) {
      const left = local.get(key);
      const right = remote.get(key);
      if (!left || !right) { merged.set(key, clone(left || right)); continue; }
      if (canonicalJson(left.payload) === canonicalJson(right.payload)) { merged.set(key, left); continue; }
      if (left.recordType === 'settings') {
        const values = { ...left.payload.values };
        for (const [field, value] of Object.entries(right.payload.values)) {
          if (Object.prototype.hasOwnProperty.call(values, field) && canonicalJson(values[field]) !== canonicalJson(value)) {
            conflicts.push({ recordKey: key, field, reason: 'settings_field_conflict' });
          } else values[field] = clone(value);
        }
        merged.set(key, makeRecord('settings', 'settings', { values }));
      } else if (left.recordType === 'builtin_stage_preferences') {
        merged.set(key, mergeFieldRecord(left, right, conflicts, key, ['bpm', 'bars'], 'stage_preference_conflict'));
      } else if (left.recordType === 'stage_order' || left.recordType === 'preset_order') {
        const field = left.recordType === 'stage_order' ? 'stageRefs' : 'presetRefs';
        const leftRefs = left.payload[field];
        const rightRefs = right.payload[field];
        if (leftRefs.every((ref) => !rightRefs.includes(ref))) {
          const payload = { ...clone(left.payload), [field]: [...leftRefs, ...rightRefs] };
          merged.set(key, { ...clone(left), payload });
        } else conflicts.push({ recordKey: key, reason: 'ordering_conflict' });
      } else if (left.recordType === 'create_preset' || left.recordType === 'custom_preset') {
        const combined = mergeTimestamped(left, right);
        if (combined) merged.set(key, combined);
        else conflicts.push({ recordKey: key, reason: 'semantic_conflict' });
      } else conflicts.push({ recordKey: key, reason: 'semantic_conflict' });
    }
    const snapshot = { appId: APP_ID, schemaVersion: SCHEMA_VERSION, records: [...merged.values()] };
    if (!conflicts.length) validateSnapshot(snapshot);
    return Object.freeze({ snapshot, conflicts: Object.freeze(conflicts) });
  }

  function stageFromPayload(payload, id, zoom = 1) {
    return { version: 1, id, title: payload.title, description: payload.description, grid: payload.grid,
      timeSignature: payload.timeSignature, patternBars: payload.patternBars, bars: payload.bars,
      bpm: payload.bpm, zoom, clickMode: payload.clickMode, rhythmFeel: payload.rhythmFeel,
      pattern: clone(payload.pattern) };
  }

  function orderItems(items, references, refForItem) {
    const byRef = new Map(items.map((item) => [refForItem(item), item]));
    const ordered = [];
    references.forEach((ref) => { if (byRef.has(ref)) { ordered.push(byRef.get(ref)); byRef.delete(ref); } });
    return [...ordered, ...byRef.values()];
  }

  function materialize(snapshot, currentRaw) {
    const canonical = normalizeRawSnapshot(snapshot);
    const currentMain = parseJson(currentRaw.values.rhythmCruiseSettings, 'rhythmCruiseSettings', {});
    const currentStages = Array.isArray(currentMain.rhythmProCustomStages) ? currentMain.rhythmProCustomStages : [];
    const currentStageById = new Map(currentStages.map((stage) => [String(stage?.id || ''), stage]));
    const settingsRecord = canonical.records.find((record) => record.recordType === 'settings');
    const values = settingsRecord?.payload.values || {};

    const stages = [];
    const refByStage = new Map();
    BUILTIN_SAMPLE_STAGES.forEach((sample) => {
      if (values.builtinSampleEnabled?.[sample.key] === false) return;
      const override = canonical.records.find((record) => record.recordType === 'custom_stage' && record.payload.builtinKey === sample.key);
      const payload = override?.payload || sample;
      const zoom = Number(currentStageById.get(sample.legacyId)?.zoom) || 1;
      const stage = stageFromPayload(payload, sample.legacyId, zoom);
      stages.push(stage);
      refByStage.set(stage, sample.key);
    });
    canonical.records.filter((record) => record.recordType === 'custom_stage' && !record.payload.builtinKey).forEach((record) => {
      const id = record.payload.legacyId;
      const zoom = Number(currentStageById.get(id)?.zoom) || 1;
      const stage = stageFromPayload(record.payload, id, zoom);
      stages.push(stage);
      refByStage.set(stage, record.recordId);
    });
    const stageOrder = canonical.records.find((record) => record.recordType === 'stage_order');
    const orderedStages = stageOrder ? orderItems(stages, stageOrder.payload.stageRefs, (stage) => refByStage.get(stage)) : stages;

    const nextMain = clone(currentMain);
    nextMain.tapLayout = values.tapLayout ?? DEFAULT_SETTINGS.tapLayout;
    nextMain.tapUnified = values.tapUnified ?? DEFAULT_SETTINGS.tapUnified;
    nextMain.inputMode = values.inputMode ?? DEFAULT_SETTINGS.inputMode;
    nextMain.judgePreset = values.judgePreset ?? DEFAULT_SETTINGS.judgePreset;
    nextMain.rhythmProCustomStages = orderedStages;

    const currentCreate = parseJson(currentRaw.values['rhythmCruiseCreatePresets:v1'], 'rhythmCruiseCreatePresets:v1', []);
    const createById = new Map((Array.isArray(currentCreate) ? currentCreate : []).map((item) => [String(item?.id || ''), item]));
    let create = canonical.records.filter((record) => record.recordType === 'create_preset').map((record) => ({
      id: record.payload.legacyId, stageN: record.payload.stageN, name: record.payload.name,
      pattern: clone(record.payload.pattern), dirs: clone(record.payload.dirs), patternBars: record.payload.patternBars,
      bpm: record.payload.bpm, bars: record.payload.bars,
      zoom: Number.isFinite(Number(createById.get(record.payload.legacyId)?.zoom)) ? Number(createById.get(record.payload.legacyId).zoom) : null,
      balance: record.payload.balance, createdAt: record.payload.createdAt, updatedAt: record.payload.updatedAt,
      _recordRef: record.recordId
    }));
    const createOrder = canonical.records.find((record) => record.recordType === 'preset_order' && record.payload.category === 'create');
    if (createOrder) create = orderItems(create, createOrder.payload.presetRefs, (item) => item._recordRef);
    create.forEach((item) => { delete item._recordRef; });

    const currentCustom = parseJson(currentRaw.values['rhythmCruiseCustomPresets:v1'], 'rhythmCruiseCustomPresets:v1', []);
    const customById = new Map((Array.isArray(currentCustom) ? currentCustom : []).map((item) => [String(item?.id || ''), item]));
    let custom = canonical.records.filter((record) => record.recordType === 'custom_preset').map((record) => ({
      id: record.payload.legacyId, name: record.payload.name,
      settings: stageFromPayload(record.payload.settings, record.payload.settings.id || `preset-stage-${stableHash(record.recordId)}`,
        Number(customById.get(record.payload.legacyId)?.settings?.zoom) || 1),
      balance: record.payload.balance, createdAt: record.payload.createdAt, updatedAt: record.payload.updatedAt,
      _recordRef: record.recordId
    }));
    const customOrder = canonical.records.find((record) => record.recordType === 'preset_order' && record.payload.category === 'custom');
    if (customOrder) custom = orderItems(custom, customOrder.payload.presetRefs, (item) => item._recordRef);
    custom.forEach((item) => { delete item._recordRef; });

    const currentPrefs = parseJson(currentRaw.values['rhythmCruiseStagePrefs:v1'], 'rhythmCruiseStagePrefs:v1', {});
    const nextPrefs = { builtin: {} };
    Object.entries(BUILTIN_STAGE_DEFAULTS).forEach(([stageN, defaults]) => {
      const remote = canonical.records.find((record) => record.recordType === 'builtin_stage_preferences' && record.recordId === `builtin:stage:${stageN}`);
      const localZoom = Number(currentPrefs?.builtin?.[stageN]?.zoom);
      const value = { bpm: remote?.payload.bpm ?? defaults.bpm, bars: remote?.payload.bars ?? defaults.bars,
        zoom: Number.isFinite(localZoom) ? localZoom : 1 };
      if (value.bpm !== defaults.bpm || value.bars !== defaults.bars || value.zoom !== 1) nextPrefs.builtin[stageN] = value;
    });
    const click = {
      range: values.clickRange ?? DEFAULT_SETTINGS.clickRange,
      beats: values.clickBeats ?? DEFAULT_SETTINGS.clickBeats,
      offbeat: values.clickOffbeat ?? DEFAULT_SETTINGS.clickOffbeat
    };
    return {
      rhythmCruiseSettings: JSON.stringify(nextMain),
      'rhythmCruiseCreatePresets:v1': JSON.stringify(create),
      'rhythmCruiseCustomPresets:v1': JSON.stringify(custom),
      'rhythmCruiseStagePrefs:v1': JSON.stringify(nextPrefs),
      'rhythmCruiseClickSettings:v1': JSON.stringify(click),
      rhythmProCustomStageSamplesSeeded: '1'
    };
  }

  async function createBackup(storage, backupStore) {
    const snapshot = readLocalSnapshot(storage);
    const backup = { version: 1, appId: APP_ID, createdAt: Date.now(), values: clone(snapshot.values) };
    if (backupStore) {
      if (typeof backupStore.save !== 'function') throw new Error('rhythm_backup_store_invalid');
      await backupStore.save(clone(backup));
    }
    return backup;
  }

  async function restoreBackup(storage, backup) {
    if (!backup || backup.appId !== APP_ID || backup.version !== 1 || !isPlainObject(backup.values)) {
      throw new Error('rhythm_backup_invalid');
    }
    for (const key of MANAGED_KEYS) {
      const value = backup.values[key];
      if (value === null || value === undefined) storage.removeItem(key);
      else storage.setItem(key, value);
    }
  }

  async function applyRemoteSnapshot(storage, snapshot, options = {}) {
    validateSnapshot(normalizeRawSnapshot(snapshot));
    const backup = await createBackup(storage, options.backupStore);
    const expectedManifest = await computeManifest(snapshot, options.cryptoImpl || global.crypto);
    if (options.expectedSnapshot && canonicalJson(normalizeRawSnapshot(readLocalSnapshot(storage))) !==
        canonicalJson(normalizeRawSnapshot(options.expectedSnapshot))) {
      throw Object.assign(new Error('local_changed_during_apply'), { code: 'local_changed_during_apply' });
    }
    try {
      const materialized = materialize(snapshot, { values: backup.values });
      for (const key of MANAGED_KEYS) storage.setItem(key, materialized[key]);
      if (typeof options.afterWrite === 'function') await options.afterWrite();
      const actual = normalizeRawSnapshot(readLocalSnapshot(storage));
      const actualManifest = await computeManifest(actual, options.cryptoImpl || global.crypto);
      if (actualManifest !== expectedManifest) throw new Error('rhythm_apply_manifest_mismatch');
      return Object.freeze({ ok: true, manifestHash: actualManifest, backup });
    } catch (error) {
      await restoreBackup(storage, backup);
      throw error;
    }
  }

  function getConflictPresentation({ localRecord, remoteRecord } = {}) {
    const local = localRecord?.deletedAt != null ? null : localRecord?.payload;
    const remote = remoteRecord?.deletedAt != null ? null : remoteRecord?.payload;
    const value = (payload, selector) => payload ? String(selector(payload) ?? '—') : '削除済み';
    const type = localRecord?.recordType || remoteRecord?.recordType || 'rhythm';
    const labels = {
      custom_preset: 'カスタムプリセット', create_preset: '作成プリセット',
      custom_stage: 'カスタムステージ', settings: 'リズム設定',
      preset_order: 'プリセット順', stage_order: 'ステージ順',
      builtin_stage_preferences: 'ステージ設定'
    };
    const updatedAt = (payload) => Number.isFinite(Number(payload?.updatedAt)) && Number(payload.updatedAt) > 0
      ? Number(payload.updatedAt) : null;
    const name = local?.name || local?.title || remote?.name || remote?.title || labels[type] || 'リズムデータ';
    const fields = [{ label: '状態', local: local ? '保存済み' : '削除済み', remote: remote ? '保存済み' : '削除済み' }];
    if (['custom_preset', 'create_preset', 'custom_stage'].includes(type)) {
      fields.push({ label: '名前', local: value(local, (payload) => payload.name || payload.title), remote: value(remote, (payload) => payload.name || payload.title) });
      fields.push({ label: 'BPM', local: value(local, (payload) => payload.settings?.bpm ?? payload.bpm), remote: value(remote, (payload) => payload.settings?.bpm ?? payload.bpm) });
      fields.push({ label: '小節数', local: value(local, (payload) => payload.settings?.bars ?? payload.bars), remote: value(remote, (payload) => payload.settings?.bars ?? payload.bars) });
      if (type !== 'create_preset') fields.push({
        label: '拍子',
        local: value(local, (payload) => payload.settings?.timeSignature ?? payload.timeSignature),
        remote: value(remote, (payload) => payload.settings?.timeSignature ?? payload.timeSignature)
      });
    }
    return Object.freeze({ appName: 'リズムクルーズ', title: labels[type] || 'リズムデータ', name: String(name),
      localUpdatedAt: updatedAt(local), remoteUpdatedAt: updatedAt(remote), fields: Object.freeze(fields) });
  }

  function assertDataPlaneContext(context) {
    if (!isPlainObject(context?.membership) || context.membership.appId !== APP_ID ||
        context.membership.state !== 'active') throw new Error('rhythm_membership_inactive');
    if (!isPlainObject(context.appCredential) || context.appCredential.appId !== APP_ID ||
        typeof context.appCredential.credential !== 'string' || !context.appCredential.credential.startsWith('scd1.')) {
      throw new Error('rhythm_app_credential_required');
    }
    if (context.accountCredential && !context.appCredential) throw new Error('account_credential_cannot_write_rhythm');
    return true;
  }

  async function createInitialMigrationPlan(storage, context, options = {}) {
    assertDataPlaneContext(context);
    const snapshot = normalizeRawSnapshot(readLocalSnapshot(storage));
    const records = await serializeRecords(snapshot, options.cryptoImpl || global.crypto);
    return Object.freeze({
      appId: APP_ID, schemaVersion: SCHEMA_VERSION, meaningful: records.length > 0,
      recordCount: records.length, manifestHash: await computeManifest(snapshot, options.cryptoImpl || global.crypto),
      records
    });
  }

  class RhythmSyncAdapter {
    constructor(options = {}) {
      this.storage = options.storage || global.localStorage;
      this.cryptoImpl = options.cryptoImpl || global.crypto;
      this.backupStore = options.backupStore || global.SoundCruiseSyncAccount?.appBackupStorage || null;
    }
    readLocalSnapshot() { return readLocalSnapshot(this.storage); }
    normalizeLocalSnapshot(snapshot = this.readLocalSnapshot()) { return normalizeRawSnapshot(snapshot); }
    validateSnapshot(snapshot) { return validateSnapshot(snapshot); }
    serializeRecords(snapshot) { return serializeRecords(snapshot, this.cryptoImpl); }
    deserializeRecords(records) { return deserializeRecords(records); }
    isMeaningfulLocalData(snapshot = this.readLocalSnapshot()) { return isMeaningfulLocalData(snapshot); }
    mergeSnapshots(localSnapshot, remoteSnapshot) { return mergeSnapshots(localSnapshot, remoteSnapshot); }
    applyRemoteSnapshot(snapshot, options = {}) {
      return applyRemoteSnapshot(this.storage, snapshot, {
        cryptoImpl: this.cryptoImpl, backupStore: options.backupStore || this.backupStore,
        afterWrite: options.afterWrite, expectedSnapshot: options.expectedSnapshot
      });
    }
    createBackup() { return createBackup(this.storage, this.backupStore); }
    restoreBackup(backup) { return restoreBackup(this.storage, backup); }
    getConflictPresentation(context) { return getConflictPresentation(context); }
    computeManifest(snapshot) { return computeManifest(snapshot, this.cryptoImpl); }
    createInitialMigrationPlan(context) { return createInitialMigrationPlan(this.storage, context, { cryptoImpl: this.cryptoImpl }); }
    assertDataPlaneContext(context) { return assertDataPlaneContext(context); }
  }

  Object.assign(root, {
    APP_ID, SCHEMA_VERSION, MANAGED_KEYS, EXCLUDED_KEYS, SYNC_SETTINGS, DEFAULT_SETTINGS,
    BUILTIN_SAMPLE_STAGES, BUILTIN_STAGE_DEFAULTS, RhythmSyncAdapter,
    readLocalSnapshot, normalizeLocalSnapshot: normalizeRawSnapshot, validateSnapshot,
    serializeRecords, deserializeRecords, isMeaningfulLocalData, mergeSnapshots,
    applyRemoteSnapshot, createBackup, restoreBackup, getConflictPresentation, computeManifest,
    assertDataPlaneContext, createInitialMigrationPlan
  });
})(globalThis);
