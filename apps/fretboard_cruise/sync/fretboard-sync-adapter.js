(function installFretboardSyncAdapter(global) {
  'use strict';

  const root = global.SoundCruiseFretboardSync = global.SoundCruiseFretboardSync || {};
  const APP_ID = 'fretboard';
  const SCHEMA_VERSION = 1;
  const STATE_KEY = 'fretboard_cruise_state';
  const MANAGED_KEYS = Object.freeze([STATE_KEY]);
  const RECORD_TYPES = new Set([
    'settings', 'custom_route', 'custom_quiz', 'builtin_route_override',
    'builtin_quiz_override', 'stage_order', 'progress'
  ]);
  const SYNC_SETTINGS = Object.freeze([
    'tempo', 'quizTimeLimit', 'quizQuestionLimit', 'quizCountdownSound',
    'noteLabelMode', 'cruiseLoopCount', 'cruiseShowNoteNames',
    'cruiseProgression', 'cruiseTapBeats', 'cruiseRhythmSoundType'
  ]);
  const DEFAULT_SETTINGS = Object.freeze({
    tempo: 75, quizTimeLimit: 4, quizQuestionLimit: 10,
    quizCountdownSound: 'beep', noteLabelMode: 'solfege', cruiseLoopCount: 1,
    cruiseShowNoteNames: true, cruiseProgression: 'auto', cruiseTapBeats: 'half',
    cruiseRhythmSoundType: 'default'
  });
  const FIELD_CLASSIFICATION = Object.freeze({
    required: Object.freeze([
      'settings.cruiseProCustomStage (legacy)', 'settings.cruiseProCustomStages', 'settings.quizProCustomStages',
      'settings.cruiseStageRoutes', 'settings.cruiseStageRouteGroups',
      'settings.quizStageEditorSettings'
    ]),
    recommended: Object.freeze([
      'settings.cruiseStageClearCounts', 'settings.quizStageAttemptCounts',
      'settings.quizStagePerfectCounts', 'rules.completedSteps',
      ...SYNC_SETTINGS.map((key) => `settings.${key}`)
    ]),
    deviceSpecific: Object.freeze([
      'settings.stringSpacing', 'settings.viewMode', 'settings.rotation',
      'settings.perspective', 'settings.perspOriginX', 'settings.fretboardView',
      'settings.fretboardViewAutoOrientation', 'settings.bluetoothRhythmAssistLevel',
      'settings.cruiseConfirmSoundTiming', 'settings.cruiseRhythmVolume',
      'settings.cruiseRhythmKickVolume', 'settings.cruiseRhythmSnareVolume',
      'settings.cruiseRhythmHatVolume', 'settings.cruiseStageGroupScrollLefts',
      'custom route/quiz scroll positions'
    ]),
    ephemeral: Object.freeze([
      'course', 'memorize', 'visualize', 'rules except completedSteps',
      'settings.lastSettingsTab', 'sessionStorage.fretboard_cruise_reload_to_home',
      'current screen/tab/question/answer/score/session/filter/modal/selection'
    ]),
    editorDraft: Object.freeze([
      'routeEditor', 'quizEditor', 'proCustomRouteEditor',
      'proCustomQuizEditor', 'quizEditorPreview', 'editor history'
    ]),
    builtIn: Object.freeze([
      'shipped route/quiz payloads', 'routeNumberingVersion', 'neckModelVersion',
      'cruiseShippedDefaultsAppliedVersion', 'quizShippedDefaultsAppliedVersion',
      'routeEditorScaleGuideVariant'
    ]),
    authSecurity: Object.freeze([
      'Pro gate state', 'Account/app credentials', 'Recovery', 'Pairing',
      'handoff and token material'
    ])
  });
  const ROUTE_DEFAULT_HASHES = Object.freeze({
    1: 'ca2399f8221865fc', 2: '15d576bbcbedab23', 3: '670b630130c98319',
    4: '491f7bb4dcbb6d40', 5: '81df3bae839bf076', 6: '8781f5db04d6a6eb'
  });

  const BUILTIN_QUIZ_GROUPS_BASE = {
    1: JSON.parse('[{"notes":[{"stringName":6,"fret":0},{"stringName":6,"fret":1},{"stringName":6,"fret":3},{"stringName":5,"fret":0},{"stringName":5,"fret":2},{"stringName":5,"fret":3},{"stringName":4,"fret":0},{"stringName":4,"fret":2},{"stringName":4,"fret":3},{"stringName":3,"fret":0},{"stringName":3,"fret":2},{"stringName":2,"fret":0},{"stringName":2,"fret":1},{"stringName":2,"fret":3},{"stringName":1,"fret":0},{"stringName":1,"fret":1},{"stringName":1,"fret":3}]}]'),
    2: JSON.parse('[{"notes":[{"stringName":6,"fret":3},{"stringName":6,"fret":5},{"stringName":5,"fret":2},{"stringName":5,"fret":3},{"stringName":5,"fret":5},{"stringName":4,"fret":2},{"stringName":4,"fret":3},{"stringName":4,"fret":5},{"stringName":3,"fret":2},{"stringName":3,"fret":4},{"stringName":3,"fret":5},{"stringName":2,"fret":3},{"stringName":2,"fret":5},{"stringName":1,"fret":3},{"stringName":1,"fret":5},{"stringName":2,"fret":6}]}]'),
    3: JSON.parse('[{"notes":[{"stringName":6,"fret":5},{"stringName":6,"fret":7},{"stringName":6,"fret":8},{"stringName":5,"fret":5},{"stringName":5,"fret":7},{"stringName":5,"fret":8},{"stringName":4,"fret":5},{"stringName":4,"fret":7},{"stringName":4,"fret":9},{"stringName":3,"fret":5},{"stringName":3,"fret":7},{"stringName":3,"fret":9},{"stringName":2,"fret":5},{"stringName":2,"fret":6},{"stringName":2,"fret":8},{"stringName":1,"fret":5},{"stringName":1,"fret":7},{"stringName":1,"fret":8}]}]'),
    4: JSON.parse('[{"notes":[{"stringName":6,"fret":7},{"stringName":6,"fret":8},{"stringName":6,"fret":10},{"stringName":5,"fret":7},{"stringName":5,"fret":8},{"stringName":5,"fret":10},{"stringName":4,"fret":7},{"stringName":4,"fret":9},{"stringName":4,"fret":10},{"stringName":3,"fret":7},{"stringName":3,"fret":9},{"stringName":3,"fret":10},{"stringName":2,"fret":6},{"stringName":2,"fret":8},{"stringName":2,"fret":10},{"stringName":1,"fret":7},{"stringName":1,"fret":8},{"stringName":1,"fret":10}]}]'),
    5: JSON.parse('[{"notes":[{"stringName":1,"fret":8},{"stringName":1,"fret":10},{"stringName":1,"fret":12},{"stringName":1,"fret":13},{"stringName":2,"fret":13},{"stringName":2,"fret":12},{"stringName":2,"fret":10},{"stringName":2,"fret":8},{"stringName":3,"fret":9},{"stringName":3,"fret":10},{"stringName":3,"fret":12},{"stringName":4,"fret":9},{"stringName":4,"fret":10},{"stringName":4,"fret":12},{"stringName":5,"fret":10},{"stringName":5,"fret":12},{"stringName":6,"fret":13},{"stringName":6,"fret":12},{"stringName":6,"fret":10},{"stringName":6,"fret":8},{"stringName":5,"fret":8}]}]')
  };
  function freezeQuizGroups(groups) {
    return Object.freeze(groups.map((group) => Object.freeze({
      notes: Object.freeze(group.notes.map((entry) => Object.freeze({ ...entry })))
    })));
  }
  const BUILTIN_QUIZ_GROUPS = Object.freeze({
    1: freezeQuizGroups(BUILTIN_QUIZ_GROUPS_BASE[1]),
    2: freezeQuizGroups(BUILTIN_QUIZ_GROUPS_BASE[2]),
    3: freezeQuizGroups(BUILTIN_QUIZ_GROUPS_BASE[3]),
    4: freezeQuizGroups(BUILTIN_QUIZ_GROUPS_BASE[4]),
    5: freezeQuizGroups(BUILTIN_QUIZ_GROUPS_BASE[5]),
    6: freezeQuizGroups([1, 2, 3, 4, 5].map((stage) => ({
      notes: BUILTIN_QUIZ_GROUPS_BASE[stage][0].notes
    })))
  });
  const QUIZ_DEFAULT_HASHES = Object.freeze({
    1: 'c0ea3a756d80e2a5', 2: '55db19a748fd28f7', 3: '0f442cbac2421bea',
    4: '3da1fb1e2b2b5356', 5: '38acc91715c13c73', 6: '0e4ecf1580fe99d9'
  });
  const SCALE_VALUES = new Set([
    'major', 'minor', 'harmonicMinor', 'melodicMinor', 'dorian', 'phrygian',
    'lydian', 'mixolydian', 'locrian', 'pentaMajor', 'pentaMinor', 'blues'
  ]);

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null || prototype?.constructor?.name === 'Object';
  }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
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
    const source = canonicalJson(value);
    let first = 2166136261;
    let second = 0x9e3779b9;
    for (let index = 0; index < source.length; index += 1) {
      const point = source.charCodeAt(index);
      first = Math.imul(first ^ point, 16777619) >>> 0;
      second = Math.imul(second ^ point, 2246822519) >>> 0;
    }
    return first.toString(16).padStart(8, '0') + second.toString(16).padStart(8, '0');
  }
  async function sha256(value, cryptoImpl) {
    const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  function text(value, maximum = 1000) {
    return typeof value === 'string' && value.length <= maximum && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
  }
  function reference(value) { return text(value, 200) && /^(?:builtin|legacy|derived):[a-z0-9._:-]+$/u.test(value); }
  function integer(value, minimum, maximum, fallback) {
    const parsed = Math.round(Number(value));
    return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
  }
  function normalizeLegacyIdentity(kind, value, semantic, ordinal) {
    const clean = String(value ?? '').trim();
    if (clean && clean.length <= 120 && !/[\u0000-\u001f\u007f-\u009f]/u.test(clean)) {
      return {
        recordId: `legacy:${kind}:${encodeURIComponent(clean).replace(/%/g, '_').toLowerCase()}`,
        legacyId: clean
      };
    }
    const legacyId = `sync_${stableHash({ semantic, ordinal })}`;
    return { recordId: `legacy:${kind}:${legacyId}`, legacyId };
  }
  function parseState(raw) {
    if (raw === null || raw === undefined || raw === '') return {};
    try {
      const value = JSON.parse(raw);
      if (!isPlainObject(value)) throw new Error('shape');
      return value;
    } catch {
      throw new Error('fretboard_legacy_json_invalid');
    }
  }
  function note(raw) {
    if (!isPlainObject(raw)) return null;
    const stringName = integer(raw.stringName, 1, 6, 0);
    const fret = integer(raw.fret, 0, 24, -1);
    return stringName && fret >= 0 ? { stringName, fret } : null;
  }
  function notes(raw, maximum = 4096) {
    if (!Array.isArray(raw) || raw.length > maximum) return null;
    const result = raw.map(note);
    return result.every(Boolean) ? result : null;
  }
  function breaks(raw, routeLength) {
    if (!Array.isArray(raw) || raw.length > 60) return null;
    const result = raw.map((value) => integer(value, 0, routeLength + 59, -1));
    if (result.some((value) => value < 0) || result.some((value, index) => index && value < result[index - 1])) return null;
    if (!result.length || result[0] !== 0) result.unshift(0);
    return result;
  }
  function quizGroups(raw) {
    if (!Array.isArray(raw) || !raw.length || raw.length > 60) return null;
    const result = raw.map((group) => ({
      ...(typeof group?.name === 'string' && text(group.name, 100) && group.name.trim()
        ? { name: group.name.trim() } : {}),
      notes: notes(group?.notes, 512)
    }));
    return result.every((group) => group.notes) ? result : null;
  }
  function makeRecord(recordType, recordId, payload) {
    return { recordType, recordId, schemaVersion: SCHEMA_VERSION, payload: { id: recordId, ...payload } };
  }
  function customCommon(raw) {
    if (!isPlainObject(raw)) return null;
    const name = String(raw.name || 'PROカスタムSTAGE').trim().slice(0, 200);
    if (!name) return null;
    return {
      name, key: integer(raw.key, 0, 11, 0), capo: integer(raw.capo, 0, 7, 0),
      scale: SCALE_VALUES.has(raw.scale) ? raw.scale : 'major',
      displayMode: ['solfege', 'note', 'degree'].includes(raw.displayMode) ? raw.displayMode : 'solfege',
      doMode: raw.doMode === 'fixed' ? 'fixed' : 'movable', maxFret: integer(raw.maxFret, 12, 24, 12)
    };
  }
  function normalizeCustomRoute(raw, ordinal) {
    const common = customCommon(raw);
    const route = notes(raw?.route || raw?.draft);
    const groupBreaks = route && breaks(raw?.groupBreaks, route.length);
    if (!common || !route || !groupBreaks) return null;
    const names = Array.isArray(raw.groupNames) ? raw.groupNames.slice(0, groupBreaks.length).map((name, index) =>
      String(name || '').trim().slice(0, 100) || `Gr.${index + 1}`) : [];
    while (names.length < groupBreaks.length) names.push(`Gr.${names.length + 1}`);
    const semantic = { ...common, route, groupBreaks, groupNames: names };
    const identity = normalizeLegacyIdentity('route-stage', raw.id, semantic, ordinal);
    return { ...identity, ...semantic };
  }
  function normalizeCustomQuiz(raw, ordinal) {
    const common = customCommon(raw);
    const groups = quizGroups(raw?.groups);
    if (!common || !groups) return null;
    const semantic = { ...common, groups };
    const identity = normalizeLegacyIdentity('quiz-stage', raw.id, semantic, ordinal);
    return { ...identity, ...semantic };
  }
  function legacyCustomRouteValues(settings) {
    const routeRaw = settings.cruiseProCustomStages;
    if (routeRaw !== undefined && !Array.isArray(routeRaw)) throw new Error('fretboard_legacy_custom_route_invalid');
    const values = [...(routeRaw || [])];
    if (settings.cruiseProCustomStage !== undefined && settings.cruiseProCustomStage !== null) {
      if (!isPlainObject(settings.cruiseProCustomStage)) throw new Error('fretboard_legacy_custom_route_invalid');
      const legacyId = typeof settings.cruiseProCustomStage.id === 'string'
        ? settings.cruiseProCustomStage.id.trim() : '';
      const alreadyMigrated = legacyId && values.some((stage) =>
        isPlainObject(stage) && typeof stage.id === 'string' && stage.id.trim() === legacyId);
      if (!alreadyMigrated) values.unshift(settings.cruiseProCustomStage);
    }
    return values;
  }
  function legacyCustomRouteStages(settings) {
    const values = legacyCustomRouteValues(settings);
    const seen = new Set();
    return values.map((value, ordinal) => {
      let stage = normalizeCustomRoute(value, ordinal);
      if (!stage) throw new Error('fretboard_legacy_custom_route_invalid');
      if (seen.has(stage.recordId)) stage = normalizeCustomRoute({ ...value, id: null }, ordinal);
      if (!stage || seen.has(stage.recordId)) throw new Error('fretboard_legacy_custom_route_invalid');
      seen.add(stage.recordId);
      return stage;
    });
  }
  function legacyCustomQuizStages(settings) {
    const quizRaw = settings.quizProCustomStages;
    if (quizRaw !== undefined && !Array.isArray(quizRaw)) throw new Error('fretboard_legacy_custom_quiz_invalid');
    const seen = new Set();
    return (quizRaw || []).map((value, ordinal) => {
      let stage = normalizeCustomQuiz(value, ordinal);
      if (!stage) throw new Error('fretboard_legacy_custom_quiz_invalid');
      if (seen.has(stage.recordId)) stage = normalizeCustomQuiz({ ...value, id: null }, ordinal);
      if (!stage || seen.has(stage.recordId)) throw new Error('fretboard_legacy_custom_quiz_invalid');
      seen.add(stage.recordId);
      return stage;
    });
  }
  function normalizedSettings(raw) {
    const source = isPlainObject(raw) ? raw : {};
    return {
      tempo: integer(source.tempo, 40, 200, 75),
      quizTimeLimit: integer(source.quizTimeLimit, 1, 10, 4),
      quizQuestionLimit: [0, 5, 10, 15].includes(Number(source.quizQuestionLimit)) ? Number(source.quizQuestionLimit) : 10,
      quizCountdownSound: ['none', 'beep', 'gradual', 'hat'].includes(source.quizCountdownSound) ? source.quizCountdownSound : 'beep',
      noteLabelMode: ['solfege', 'note', 'degree'].includes(source.noteLabelMode) ? source.noteLabelMode : 'solfege',
      cruiseLoopCount: [0, 1, 2, 3].includes(Number(source.cruiseLoopCount)) ? Number(source.cruiseLoopCount) : 1,
      cruiseShowNoteNames: source.cruiseShowNoteNames !== false,
      cruiseProgression: source.cruiseProgression === 'tap' ? 'tap' : 'auto',
      cruiseTapBeats: source.cruiseTapBeats === 'full' ? 'full' : 'half',
      cruiseRhythmSoundType: ['default', 'kick_only', 'hihat_only', 'soft', 'silent'].includes(source.cruiseRhythmSoundType)
        ? source.cruiseRhythmSoundType : 'default'
    };
  }
  function nonDefaultSettings(settings) {
    const result = {};
    SYNC_SETTINGS.forEach((key) => {
      if (canonicalJson(settings[key]) !== canonicalJson(DEFAULT_SETTINGS[key])) result[key] = settings[key];
    });
    return result;
  }
  function normalizeRawSnapshot(rawSnapshot) {
    if (!isPlainObject(rawSnapshot)) throw new Error('fretboard_snapshot_invalid');
    if (rawSnapshot.appId !== undefined || rawSnapshot.records !== undefined) {
      if (rawSnapshot.appId !== APP_ID || rawSnapshot.schemaVersion !== SCHEMA_VERSION || !Array.isArray(rawSnapshot.records)) {
        throw new Error('fretboard_snapshot_future_or_invalid');
      }
      const snapshot = clone(rawSnapshot);
      snapshot.records.sort((left, right) => `${left.recordType}/${left.recordId}`.localeCompare(`${right.recordType}/${right.recordId}`));
      validateSnapshot(snapshot);
      return snapshot;
    }
    if (rawSnapshot.schemaVersion !== undefined && ![0, 1].includes(rawSnapshot.schemaVersion)) {
      throw new Error('fretboard_snapshot_future_version');
    }
    const values = isPlainObject(rawSnapshot.values) ? rawSnapshot.values : rawSnapshot;
    const state = parseState(values[STATE_KEY]);
    const settings = isPlainObject(state.settings) ? state.settings : {};
    const records = [];
    const shared = nonDefaultSettings(normalizedSettings(settings));
    if (Object.keys(shared).length) records.push(makeRecord('settings', 'settings', { values: shared }));

    for (let stage = 1; stage <= 6; stage += 1) {
      const routeRaw = settings.cruiseStageRoutes?.[String(stage)];
      if (routeRaw !== undefined) {
        const route = notes(routeRaw);
        const groupBreaks = route && breaks(settings.cruiseStageRouteGroups?.[String(stage)] || [0], route.length);
        if (!route || !groupBreaks) throw new Error('fretboard_legacy_route_invalid');
        if (stableHash({ route, groupBreaks }) !== ROUTE_DEFAULT_HASHES[stage]) {
          const ref = `builtin:route-stage:${stage}`;
          records.push(makeRecord('builtin_route_override', ref, { builtinStageRef: ref, route, groupBreaks }));
        }
      }
      const quizRaw = settings.quizStageEditorSettings?.[String(stage)];
      if (quizRaw !== undefined) {
        const groups = quizGroups(quizRaw?.groups);
        if (!groups) throw new Error('fretboard_legacy_quiz_invalid');
        if (stableHash({ groups }) !== QUIZ_DEFAULT_HASHES[stage]) {
          const ref = `builtin:quiz-stage:${stage}`;
          records.push(makeRecord('builtin_quiz_override', ref, { builtinStageRef: ref, groups }));
        }
      }
    }

    const routeRefs = [];
    legacyCustomRouteStages(settings).forEach((stage) => {
      routeRefs.push(stage.recordId);
      const { recordId, ...payload } = stage;
      records.push(makeRecord('custom_route', recordId, payload));
    });
    if (routeRefs.length) records.push(makeRecord('stage_order', 'route', { category: 'route', stageRefs: routeRefs }));

    const quizRefs = [];
    legacyCustomQuizStages(settings).forEach((stage) => {
      quizRefs.push(stage.recordId);
      const { recordId, ...payload } = stage;
      records.push(makeRecord('custom_quiz', recordId, payload));
    });
    if (quizRefs.length) records.push(makeRecord('stage_order', 'quiz', { category: 'quiz', stageRefs: quizRefs }));

    const progressMaps = [
      ['route', settings.cruiseStageClearCounts, 'clearCount'],
      ['quiz', settings.quizStageAttemptCounts, 'attemptCount'],
      ['quiz-perfect', settings.quizStagePerfectCounts, 'perfectCount']
    ];
    const progress = new Map();
    progressMaps.forEach(([category, map, field]) => {
      if (map !== undefined && !isPlainObject(map)) throw new Error('fretboard_legacy_progress_invalid');
      for (let stage = 1; stage <= 6; stage += 1) {
        const count = integer(map?.[String(stage)], 0, Number.MAX_SAFE_INTEGER, 0);
        if (!count) continue;
        const normalizedCategory = category === 'quiz-perfect' ? 'quiz' : category;
        const ref = `builtin:${normalizedCategory}-stage:${stage}`;
        const id = `${normalizedCategory}:${ref}`;
        const current = progress.get(id) || { category: normalizedCategory, stageRef: ref };
        current[field] = count;
        progress.set(id, current);
      }
    });
    progress.forEach((payload, id) => records.push(makeRecord('progress', id, payload)));
    const completed = isPlainObject(state.rules?.completedSteps)
      ? Object.keys(state.rules.completedSteps).filter((key) => state.rules.completedSteps[key] === true)
        .map(Number).filter((value) => Number.isSafeInteger(value) && value >= 1 && value <= 5).sort((a, b) => a - b)
      : [];
    if (completed.length) records.push(makeRecord('progress', 'rules', { category: 'rules', completedSteps: completed }));

    records.sort((left, right) => `${left.recordType}/${left.recordId}`.localeCompare(`${right.recordType}/${right.recordId}`));
    const snapshot = { appId: APP_ID, schemaVersion: SCHEMA_VERSION, records };
    validateSnapshot(snapshot);
    return snapshot;
  }

  function onlyKeys(value, keys) { return Object.keys(value).every((key) => keys.includes(key)); }
  function validNotes(value) {
    return Array.isArray(value) && value.length <= 4096 && value.every((entry) =>
      isPlainObject(entry) && onlyKeys(entry, ['stringName', 'fret']) &&
      Number.isSafeInteger(entry.stringName) && entry.stringName >= 1 && entry.stringName <= 6 &&
      Number.isSafeInteger(entry.fret) && entry.fret >= 0 && entry.fret <= 24);
  }
  function validGroups(value) {
    return Array.isArray(value) && value.length >= 1 && value.length <= 60 && value.every((group) =>
      isPlainObject(group) && onlyKeys(group, ['name', 'notes']) &&
      (group.name === undefined || text(group.name, 100)) && validNotes(group.notes) && group.notes.length <= 512);
  }
  function validCommon(payload, extra) {
    return onlyKeys(payload, ['id', 'legacyId', 'name', 'key', 'capo', 'scale', 'displayMode', 'doMode', 'maxFret', ...extra]) &&
      text(payload.legacyId, 200) && text(payload.name, 200) && Number.isSafeInteger(payload.key) && payload.key >= 0 && payload.key <= 11 &&
      Number.isSafeInteger(payload.capo) && payload.capo >= 0 && payload.capo <= 7 && SCALE_VALUES.has(payload.scale) &&
      ['solfege', 'note', 'degree'].includes(payload.displayMode) && ['movable', 'fixed'].includes(payload.doMode) &&
      Number.isSafeInteger(payload.maxFret) && payload.maxFret >= 12 && payload.maxFret <= 24;
  }
  function validateSettings(payload) {
    if (!onlyKeys(payload, ['id', 'values']) || payload.id !== 'settings' || !isPlainObject(payload.values) ||
        !Object.keys(payload.values).length || !onlyKeys(payload.values, SYNC_SETTINGS)) return false;
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
  function validateRecordShape(record) {
    const payload = record.payload;
    if (record.recordType === 'settings') return validateSettings(payload);
    if (record.recordType === 'custom_route') {
      return validCommon(payload, ['route', 'groupBreaks', 'groupNames']) && validNotes(payload.route) &&
        Array.isArray(payload.groupBreaks) && payload.groupBreaks.length >= 1 && payload.groupBreaks.length <= 60 &&
        payload.groupBreaks[0] === 0 && payload.groupBreaks.every((value, index) => Number.isSafeInteger(value) && value >= 0 &&
          value <= payload.route.length + 59 && (!index || value >= payload.groupBreaks[index - 1])) &&
        Array.isArray(payload.groupNames) && payload.groupNames.length === payload.groupBreaks.length && payload.groupNames.every((value) => text(value, 100));
    }
    if (record.recordType === 'custom_quiz') return validCommon(payload, ['groups']) && validGroups(payload.groups);
    if (record.recordType === 'builtin_route_override') {
      return onlyKeys(payload, ['id', 'builtinStageRef', 'route', 'groupBreaks']) && payload.id === payload.builtinStageRef &&
        /^builtin:route-stage:[1-6]$/u.test(payload.builtinStageRef) && validNotes(payload.route) &&
        Array.isArray(payload.groupBreaks) && payload.groupBreaks.length >= 1 && payload.groupBreaks.length <= 60 &&
        payload.groupBreaks[0] === 0 && payload.groupBreaks.every((value, index) => Number.isSafeInteger(value) &&
          value >= 0 && value <= payload.route.length + 59 && (!index || value >= payload.groupBreaks[index - 1]));
    }
    if (record.recordType === 'builtin_quiz_override') {
      return onlyKeys(payload, ['id', 'builtinStageRef', 'groups']) && payload.id === payload.builtinStageRef &&
        /^builtin:quiz-stage:[1-6]$/u.test(payload.builtinStageRef) && validGroups(payload.groups);
    }
    if (record.recordType === 'stage_order') {
      return onlyKeys(payload, ['id', 'category', 'stageRefs']) && payload.id === payload.category && ['route', 'quiz'].includes(payload.category) &&
        Array.isArray(payload.stageRefs) && payload.stageRefs.length >= 1 && payload.stageRefs.length <= 12 && payload.stageRefs.every(reference) &&
        new Set(payload.stageRefs).size === payload.stageRefs.length;
    }
    if (record.recordType === 'progress') {
      if (payload.category === 'rules') return onlyKeys(payload, ['id', 'category', 'completedSteps']) && payload.id === 'rules' &&
        Array.isArray(payload.completedSteps) && payload.completedSteps.length >= 1 &&
        payload.completedSteps.every((value) => Number.isSafeInteger(value) && value >= 1 && value <= 5) &&
        new Set(payload.completedSteps).size === payload.completedSteps.length;
      const allowed = payload.category === 'route'
        ? ['id', 'category', 'stageRef', 'clearCount']
        : ['id', 'category', 'stageRef', 'attemptCount', 'perfectCount'];
      const counts = payload.category === 'route' ? ['clearCount'] : ['attemptCount', 'perfectCount'];
      return ['route', 'quiz'].includes(payload.category) && onlyKeys(payload, allowed) &&
        payload.id === `${payload.category}:${payload.stageRef}` &&
        new RegExp(`^builtin:${payload.category}-stage:[1-6]$`, 'u').test(payload.stageRef) &&
        counts.some((key) => payload[key] !== undefined) && counts.filter((key) => payload[key] !== undefined)
          .every((key) => Number.isSafeInteger(payload[key]) && payload[key] >= 1);
    }
    return false;
  }
  function validateSnapshot(snapshot) {
    if (!isPlainObject(snapshot) || snapshot.appId !== APP_ID || snapshot.schemaVersion !== SCHEMA_VERSION || !Array.isArray(snapshot.records)) {
      throw new Error('fretboard_snapshot_invalid');
    }
    const seen = new Set();
    const refs = { route: new Set(), quiz: new Set() };
    for (const record of snapshot.records) {
      if (!isPlainObject(record) || !RECORD_TYPES.has(record.recordType) || record.schemaVersion !== SCHEMA_VERSION ||
          !text(record.recordId, 200) || !isPlainObject(record.payload) || record.payload.id !== record.recordId ||
          !validateRecordShape(record)) throw new Error('fretboard_record_invalid');
      const key = `${record.recordType}/${record.recordId}`;
      if (seen.has(key)) throw new Error('fretboard_record_duplicate');
      seen.add(key);
      if (record.recordType === 'custom_route') refs.route.add(record.recordId);
      if (record.recordType === 'custom_quiz') refs.quiz.add(record.recordId);
    }
    snapshot.records.filter((record) => record.recordType === 'stage_order').forEach((record) => {
      if (record.payload.stageRefs.some((ref) => !refs[record.payload.category].has(ref))) {
        throw new Error('fretboard_record_reference_invalid');
      }
    });
    return true;
  }
  function readLocalSnapshot(storage) {
    if (!storage || typeof storage.getItem !== 'function') throw new Error('fretboard_storage_unavailable');
    return { schemaVersion: 0, values: { [STATE_KEY]: storage.getItem(STATE_KEY) } };
  }
  function isMeaningfulLocalData(snapshot) { return normalizeRawSnapshot(snapshot).records.length > 0; }
  async function serializeRecords(snapshot, cryptoImpl = global.crypto) {
    const canonical = normalizeRawSnapshot(snapshot);
    const result = [];
    for (const record of canonical.records) {
      result.push({ ...clone(record), payloadHash: await sha256(canonicalJson({
        appId: APP_ID, recordType: record.recordType, recordId: record.recordId,
        schemaVersion: record.schemaVersion, payload: record.payload
      }), cryptoImpl) });
    }
    return result;
  }
  function deserializeRecords(records) {
    const snapshot = { appId: APP_ID, schemaVersion: SCHEMA_VERSION, records: records.map((record) => ({
      recordType: record.recordType, recordId: record.recordId, schemaVersion: record.schemaVersion, payload: clone(record.payload)
    })) };
    validateSnapshot(snapshot);
    snapshot.records.sort((left, right) => `${left.recordType}/${left.recordId}`.localeCompare(`${right.recordType}/${right.recordId}`));
    return snapshot;
  }
  async function computeManifest(snapshot, cryptoImpl = global.crypto) {
    const records = await serializeRecords(snapshot, cryptoImpl);
    const rows = records.map((record) => ({ recordKey: `${record.recordType}/${record.recordId}`, payloadHash: record.payloadHash }))
      .sort((left, right) => left.recordKey.localeCompare(right.recordKey));
    return sha256(canonicalJson({ appId: APP_ID, schemaVersion: SCHEMA_VERSION, records: rows }), cryptoImpl);
  }
  function recordMap(snapshot) {
    const canonical = normalizeRawSnapshot(snapshot);
    return new Map(canonical.records.map((record) => [`${record.recordType}/${record.recordId}`, clone(record)]));
  }
  function mergeOrder(left, right) {
    const common = left.filter((ref) => right.includes(ref));
    if (canonicalJson(common) !== canonicalJson(right.filter((ref) => left.includes(ref)))) return null;
    return [...left, ...right.filter((ref) => !left.includes(ref))];
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
        Object.entries(right.payload.values).forEach(([field, value]) => {
          if (Object.prototype.hasOwnProperty.call(values, field) && canonicalJson(values[field]) !== canonicalJson(value)) {
            conflicts.push({ recordKey: key, field, reason: 'settings_field_conflict' });
          } else values[field] = clone(value);
        });
        merged.set(key, makeRecord('settings', 'settings', { values }));
      } else if (left.recordType === 'progress') {
        if (left.payload.category !== right.payload.category || left.payload.stageRef !== right.payload.stageRef) {
          conflicts.push({ recordKey: key, reason: 'semantic_conflict' });
          continue;
        }
        if (left.payload.category === 'rules') {
          merged.set(key, makeRecord('progress', 'rules', { category: 'rules', completedSteps:
            [...new Set([...left.payload.completedSteps, ...right.payload.completedSteps])].sort((a, b) => a - b) }));
        } else {
          const payload = clone(left.payload);
          ['clearCount', 'attemptCount', 'perfectCount'].forEach((field) => {
            if (right.payload[field] !== undefined) payload[field] = Math.max(payload[field] || 0, right.payload[field]);
          });
          merged.set(key, { ...clone(left), payload });
        }
      } else if (left.recordType === 'stage_order') {
        const refs = mergeOrder(left.payload.stageRefs, right.payload.stageRefs);
        if (!refs) conflicts.push({ recordKey: key, reason: 'ordering_conflict' });
        else merged.set(key, makeRecord('stage_order', left.recordId, { category: left.payload.category, stageRefs: refs }));
      } else conflicts.push({ recordKey: key, reason: 'semantic_conflict' });
    }
    const snapshot = { appId: APP_ID, schemaVersion: SCHEMA_VERSION, records: [...merged.values()] };
    if (!conflicts.length) validateSnapshot(snapshot);
    return Object.freeze({ snapshot, conflicts: Object.freeze(conflicts) });
  }
  function ordered(records, orderRecord) {
    const byId = new Map(records.map((record) => [record.recordId, record]));
    const result = [];
    (orderRecord?.payload.stageRefs || []).forEach((ref) => {
      if (byId.has(ref)) { result.push(byId.get(ref)); byId.delete(ref); }
    });
    return [...result, ...[...byId.values()].sort((left, right) => left.recordId.localeCompare(right.recordId))];
  }
  function scrollsForGroups(currentGroups, remoteGroups) {
    return remoteGroups.map((group, index) => ({
      ...(group.name ? { name: group.name } : {}), notes: clone(group.notes),
      scrollLeft: Number.isFinite(currentGroups?.[index]?.scrollLeft) ? Math.max(0, Math.round(currentGroups[index].scrollLeft)) : null
    }));
  }
  function materialize(snapshot, currentRaw) {
    const canonical = normalizeRawSnapshot(snapshot);
    const current = parseState(currentRaw.values[STATE_KEY]);
    const next = clone(current);
    next.settings = isPlainObject(next.settings) ? next.settings : {};
    const settingsRecord = canonical.records.find((record) => record.recordType === 'settings');
    const values = settingsRecord?.payload.values || {};
    SYNC_SETTINGS.forEach((key) => { next.settings[key] = clone(values[key] ?? DEFAULT_SETTINGS[key]); });

    next.settings.cruiseStageRoutes = {};
    next.settings.cruiseStageRouteGroups = {};
    canonical.records.filter((record) => record.recordType === 'builtin_route_override').forEach((record) => {
      const stage = record.payload.builtinStageRef.split(':').at(-1);
      next.settings.cruiseStageRoutes[stage] = clone(record.payload.route);
      next.settings.cruiseStageRouteGroups[stage] = clone(record.payload.groupBreaks);
    });
    const currentQuizSettings = isPlainObject(current.settings?.quizStageEditorSettings) ? current.settings.quizStageEditorSettings : {};
    next.settings.quizStageEditorSettings = {};
    for (let stage = 1; stage <= 6; stage += 1) {
      const ref = `builtin:quiz-stage:${stage}`;
      const override = canonical.records.find((record) => record.recordType === 'builtin_quiz_override' && record.recordId === ref);
      const remoteGroups = override?.payload.groups || BUILTIN_QUIZ_GROUPS[stage];
      next.settings.quizStageEditorSettings[String(stage)] = {
        groups: scrollsForGroups(currentQuizSettings[String(stage)]?.groups, remoteGroups)
      };
    }

    const routeRecords = canonical.records.filter((record) => record.recordType === 'custom_route');
    const routeOrder = canonical.records.find((record) => record.recordType === 'stage_order' && record.recordId === 'route');
    const currentRouteValues = legacyCustomRouteValues(current.settings || {});
    const currentRoutes = new Map(legacyCustomRouteStages(current.settings || {})
      .map((stage, index) => [stage.recordId, currentRouteValues[index]]));
    next.settings.cruiseProCustomStages = ordered(routeRecords, routeOrder).map((record) => ({
      id: record.payload.legacyId, name: record.payload.name, key: record.payload.key, capo: record.payload.capo,
      scale: record.payload.scale, displayMode: record.payload.displayMode, doMode: record.payload.doMode,
      maxFret: record.payload.maxFret, route: clone(record.payload.route), groupBreaks: clone(record.payload.groupBreaks),
      groupNames: clone(record.payload.groupNames),
      groupScrollLefts: clone(currentRoutes.get(record.recordId)?.groupScrollLefts || {})
    }));
    next.settings.cruiseProCustomStage = null;

    const quizRecords = canonical.records.filter((record) => record.recordType === 'custom_quiz');
    const quizOrder = canonical.records.find((record) => record.recordType === 'stage_order' && record.recordId === 'quiz');
    const currentQuizValues = Array.isArray(current.settings?.quizProCustomStages)
      ? current.settings.quizProCustomStages : [];
    const currentQuizzes = new Map(legacyCustomQuizStages(current.settings || {})
      .map((stage, index) => [stage.recordId, currentQuizValues[index]]));
    next.settings.quizProCustomStages = ordered(quizRecords, quizOrder).map((record) => ({
      id: record.payload.legacyId, name: record.payload.name, key: record.payload.key, capo: record.payload.capo,
      scale: record.payload.scale, displayMode: record.payload.displayMode, doMode: record.payload.doMode,
      maxFret: record.payload.maxFret,
      groups: scrollsForGroups(currentQuizzes.get(record.recordId)?.groups, record.payload.groups)
    }));

    next.settings.cruiseStageClearCounts = {};
    next.settings.quizStageAttemptCounts = {};
    next.settings.quizStagePerfectCounts = {};
    next.rules = isPlainObject(next.rules) ? next.rules : {};
    next.rules.completedSteps = {};
    canonical.records.filter((record) => record.recordType === 'progress').forEach((record) => {
      if (record.payload.category === 'rules') {
        record.payload.completedSteps.forEach((step) => { next.rules.completedSteps[String(step)] = true; });
        return;
      }
      const stage = record.payload.stageRef.split(':').at(-1);
      if (record.payload.category === 'route') next.settings.cruiseStageClearCounts[stage] = record.payload.clearCount || 0;
      else {
        if (record.payload.attemptCount) next.settings.quizStageAttemptCounts[stage] = record.payload.attemptCount;
        if (record.payload.perfectCount) next.settings.quizStagePerfectCounts[stage] = record.payload.perfectCount;
      }
    });
    return JSON.stringify(next);
  }
  async function createBackup(storage, backupStore) {
    const snapshot = readLocalSnapshot(storage);
    const backup = { version: 1, appId: APP_ID, createdAt: Date.now(), values: clone(snapshot.values) };
    if (backupStore) {
      if (typeof backupStore.save !== 'function') throw new Error('fretboard_backup_store_invalid');
      await backupStore.save(clone(backup));
    }
    return backup;
  }
  async function restoreBackup(storage, backup) {
    if (!backup || backup.appId !== APP_ID || backup.version !== 1 || !isPlainObject(backup.values)) {
      throw new Error('fretboard_backup_invalid');
    }
    const value = backup.values[STATE_KEY];
    if (value === null || value === undefined) storage.removeItem(STATE_KEY);
    else storage.setItem(STATE_KEY, value);
  }
  async function applyRemoteSnapshot(storage, snapshot, options = {}) {
    validateSnapshot(normalizeRawSnapshot(snapshot));
    const backup = await createBackup(storage, options.backupStore);
    const expectedManifest = await computeManifest(snapshot, options.cryptoImpl || global.crypto);
    try {
      storage.setItem(STATE_KEY, materialize(snapshot, { values: backup.values }));
      if (typeof options.afterWrite === 'function') await options.afterWrite();
      const actualManifest = await computeManifest(readLocalSnapshot(storage), options.cryptoImpl || global.crypto);
      if (actualManifest !== expectedManifest) throw new Error('fretboard_apply_manifest_mismatch');
      return Object.freeze({ ok: true, manifestHash: actualManifest, backup });
    } catch (error) {
      await restoreBackup(storage, backup);
      throw error;
    }
  }
  function assertDataPlaneContext(context) {
    if (!isPlainObject(context?.membership) || context.membership.appId !== APP_ID || context.membership.state !== 'active') {
      throw new Error('fretboard_membership_inactive');
    }
    if (!isPlainObject(context.appCredential) || context.appCredential.appId !== APP_ID ||
        typeof context.appCredential.credential !== 'string' || !context.appCredential.credential.startsWith('scd1.')) {
      throw new Error('fretboard_app_credential_required');
    }
    return true;
  }
  async function createInitialMigrationPlan(storage, context, options = {}) {
    assertDataPlaneContext(context);
    const snapshot = normalizeRawSnapshot(readLocalSnapshot(storage));
    const records = await serializeRecords(snapshot, options.cryptoImpl || global.crypto);
    return Object.freeze({
      appId: APP_ID, schemaVersion: SCHEMA_VERSION, meaningful: records.length > 0,
      recordCount: records.length, manifestHash: await computeManifest(snapshot, options.cryptoImpl || global.crypto), records
    });
  }
  class FretboardSyncAdapter {
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
        cryptoImpl: this.cryptoImpl, backupStore: options.backupStore || this.backupStore, afterWrite: options.afterWrite
      });
    }
    createBackup() { return createBackup(this.storage, this.backupStore); }
    restoreBackup(backup) { return restoreBackup(this.storage, backup); }
    computeManifest(snapshot) { return computeManifest(snapshot, this.cryptoImpl); }
    createInitialMigrationPlan(context) { return createInitialMigrationPlan(this.storage, context, { cryptoImpl: this.cryptoImpl }); }
    assertDataPlaneContext(context) { return assertDataPlaneContext(context); }
  }
  Object.assign(root, {
    APP_ID, SCHEMA_VERSION, STATE_KEY, MANAGED_KEYS, RECORD_TYPES, SYNC_SETTINGS,
    DEFAULT_SETTINGS, FIELD_CLASSIFICATION, ROUTE_DEFAULT_HASHES, BUILTIN_QUIZ_GROUPS,
    FretboardSyncAdapter, readLocalSnapshot, normalizeLocalSnapshot: normalizeRawSnapshot,
    validateSnapshot, serializeRecords, deserializeRecords, isMeaningfulLocalData,
    mergeSnapshots, applyRemoteSnapshot, createBackup, restoreBackup, computeManifest,
    assertDataPlaneContext, createInitialMigrationPlan
  });
})(globalThis);
