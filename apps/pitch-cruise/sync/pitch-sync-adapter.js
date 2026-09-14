(function installPitchSyncAdapter(global) {
  'use strict';

  const root = global.SoundCruisePitchSync = global.SoundCruisePitchSync || {};
  const APP_ID = 'pitch';
  const SCHEMA_VERSION = 1;
  const MANAGED_KEYS = Object.freeze([
    'pitchTrainerProData',
    'pitchTrainerSettings',
    'pitchTrainerProAccidentalDisplay',
    'pitchTrainerStagingProMelodySlots',
    'pitchTrainerStagingProChordSlots',
    'pitchTrainerTestModeEnabled',
    'pitchTrainerTestModeResults'
  ]);
  const LOCAL_ONLY_SETTINGS = Object.freeze(['baseHz', 'sustainTime']);
  const SYNC_SETTINGS = Object.freeze([
    'instrument', 'notationStyle', 'scaleEnabled', 'isAnswerMode', 'keyRandomMode',
    'baseOctave', 'keyOffset', 'noteSpeed'
  ]);
  const RECORD_TYPES = new Set([
    'settings', 'custom_chord', 'custom_progression', 'melody_stage',
    'chord_stage', 'stage_order', 'progress'
  ]);
  const DEFAULT_SETTINGS = Object.freeze({
    instrument: 'acoustic_guitar', notationStyle: 'doremi', scaleEnabled: true,
    isAnswerMode: true, keyRandomMode: false, baseOctave: 3, keyOffset: 0,
    noteSpeed: 1
  });

  const BUILTIN_CHORDS = Object.freeze([
    ['c', 'C', '0', '4', '7'], ['dm', 'Dm', '2', '3', '7'],
    ['em', 'Em', '4', '3', '7'], ['f', 'F', '5', '4', '7'],
    ['g', 'G', '7', '4', '7'], ['am', 'Am', '9', '3', '7']
  ].map(([key, name, rootValue, third, fifth]) => Object.freeze({
    key: `builtin:chord:${key}`, name, root: rootValue, third, fifth,
    seventh: 'null', tensions: Object.freeze([]), inversion: '0'
  })));

  const BUILTIN_PROGRESSIONS = Object.freeze([
    ['basic', '基本進行', ['c', 'f', 'g', 'c']],
    ['pop-standard', 'Pop Standard', ['c', 'f', 'c', 'g']],
    ['pop-standard-2', 'Pop Standard 2', ['c', 'g', 'f', 'g']],
    ['1950s', '1950s', ['c', 'am', 'f', 'g']],
    ['royal-road', '王道進行', ['f', 'g', 'em', 'am']],
    ['komuro', '小室進行', ['am', 'f', 'g', 'c']],
    ['front-251', '前ツーファイブワン', ['dm', 'g', 'c', 'am']],
    ['back-251', '後ツーファイブワン', ['am', 'dm', 'g', 'c']],
    ['canon-first', 'カノン進行前半', ['c', 'g', 'am', 'em']],
    ['canon-second', 'カノン進行後半', ['f', 'c', 'f', 'g']],
    ['pop-punk', 'ポップパンク', ['f', 'c', 'g', 'am']],
    ['let-it-be', 'Let it be進行', ['c', 'g', 'am', 'f']],
    ['western-6415', '洋楽定番 (6415)', ['am', 'f', 'c', 'g']],
    ['royal-4561', '王道アレンジ (4561)', ['f', 'g', 'am', 'c']],
    ['minor-descending', 'マイナー下降', ['am', 'g', 'f', 'g']],
    ['strong-3625', '強進行 (3625)', ['em', 'am', 'dm', 'g']],
    ['strong-1625', '625強進行 (1625)', ['c', 'am', 'dm', 'g']],
    ['ascending-3456', '上昇順次進行 (3456)', ['em', 'f', 'g', 'am']],
    ['tonic-1361', 'トニック進行 (1361)', ['c', 'em', 'am', 'c']],
    ['ascending-2345', '上昇順次進行2 (2345)', ['dm', 'em', 'f', 'g']]
  ].map(([key, name, chordKeys]) => Object.freeze({
    key: `builtin:progression:${key}`, name,
    chordRefs: Object.freeze(chordKeys.map((value) => `builtin:chord:${value}`))
  })));

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

  function canonicalJson(value) {
    return JSON.stringify(canonicalValue(value));
  }

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
    try { return JSON.parse(raw); } catch { throw new Error(`pitch_legacy_json_invalid:${key}`); }
  }

  function normalizeLegacyId(kind, value, semantic, ordinal) {
    const clean = String(value ?? '').trim();
    if (clean && clean.length <= 80 && !/[\u0000-\u001f\u007f-\u009f]/u.test(clean)) {
      return `legacy:${kind}:${encodeURIComponent(clean).replace(/%/g, '_').toLowerCase()}`;
    }
    return `derived:${kind}:${stableHash({ semantic, ordinal })}`;
  }

  function chordShape(chord) {
    return {
      name: String(chord?.name ?? ''), root: String(chord?.root ?? ''),
      third: String(chord?.third ?? ''), fifth: String(chord?.fifth ?? ''),
      seventh: String(chord?.seventh ?? 'null'),
      tensions: Array.isArray(chord?.tensions) ? chord.tensions.map(String) : [],
      inversion: String(chord?.inversion ?? '0')
    };
  }

  function builtinChordRef(chord) {
    const shape = chordShape(chord);
    const match = BUILTIN_CHORDS.find((builtin) =>
      builtin.name === shape.name && builtin.root === shape.root && builtin.third === shape.third &&
      builtin.fifth === shape.fifth && builtin.seventh === shape.seventh &&
      builtin.inversion === shape.inversion && shape.tensions.length === 0);
    return match?.key || null;
  }

  function progressionBlockMatches(progressions, expectedIds) {
    for (let start = 0; start <= progressions.length - BUILTIN_PROGRESSIONS.length; start += 1) {
      const matches = BUILTIN_PROGRESSIONS.every((builtin, offset) => {
        const progression = progressions[start + offset];
        return progression?.name === builtin.name && canonicalJson(progression?.chords) ===
          canonicalJson(builtin.chordRefs.map((ref) => expectedIds.get(ref)));
      });
      if (matches) return true;
    }
    return false;
  }

  function identifyBuiltinChords(chords, progressions = []) {
    const result = new Map();
    for (let start = 0; start <= chords.length - BUILTIN_CHORDS.length; start += 1) {
      const baseId = Number(chords[start]?.id);
      if (!Number.isSafeInteger(baseId) || !BUILTIN_CHORDS.every((_builtin, offset) =>
        Number(chords[start + offset]?.id) === baseId + offset)) continue;
      const exactShapes = BUILTIN_CHORDS.every((builtin, offset) => builtinChordRef(chords[start + offset]) === builtin.key);
      const expectedIds = new Map(BUILTIN_CHORDS.map((builtin, offset) => [builtin.key, baseId + offset]));
      if (!exactShapes && !progressionBlockMatches(progressions, expectedIds)) continue;
      BUILTIN_CHORDS.forEach((builtin, offset) => result.set(chords[start + offset], builtin.key));
      break;
    }
    return result;
  }

  function identifyBuiltinProgressions(progressions, refsByChordId) {
    const result = new Set();
    for (let start = 0; start <= progressions.length - BUILTIN_PROGRESSIONS.length; start += 1) {
      const matches = BUILTIN_PROGRESSIONS.every((builtin, offset) => {
        const progression = progressions[start + offset];
        const refs = Array.isArray(progression?.chords) ? progression.chords.map((id) => refsByChordId.get(id)) : [];
        return progression?.name === builtin.name && canonicalJson(refs) === canonicalJson(builtin.chordRefs);
      });
      if (!matches) continue;
      BUILTIN_PROGRESSIONS.forEach((_builtin, offset) => result.add(progressions[start + offset]));
      break;
    }
    return result;
  }

  function makeRecord(recordType, recordId, payload) {
    return { recordType, recordId, schemaVersion: SCHEMA_VERSION, payload: { id: recordId, ...payload } };
  }

  function normalizeSlotContainer(value) {
    if (Array.isArray(value)) return { slots: value, order: value.map((slot) => slot?.id).filter(Boolean) };
    if (isPlainObject(value) && Array.isArray(value.slots)) {
      return { slots: value.slots, order: Array.isArray(value.order) ? value.order : value.slots.map((slot) => slot?.id).filter(Boolean) };
    }
    return { slots: [], order: [] };
  }

  function meaningfulSettings(values) {
    return Object.entries(values).some(([key, value]) => {
      if (key === 'builtinChordEnabled' || key === 'builtinProgressionEnabled') return Object.keys(value).length > 0;
      if (key === 'accidentalDisplay') return value !== 'sharp';
      if (key === 'testModeEnabled') return value !== false;
      return canonicalJson(value) !== canonicalJson(DEFAULT_SETTINGS[key]);
    });
  }

  function normalizeRawSnapshot(rawSnapshot) {
    if (!isPlainObject(rawSnapshot)) throw new Error('pitch_snapshot_invalid');
    if (rawSnapshot.appId !== undefined || rawSnapshot.records !== undefined) {
      if (rawSnapshot.appId !== APP_ID || rawSnapshot.schemaVersion !== SCHEMA_VERSION || !Array.isArray(rawSnapshot.records)) {
        throw new Error('pitch_snapshot_future_or_invalid');
      }
      return clone(rawSnapshot);
    }
    if (rawSnapshot.schemaVersion !== undefined && ![0, 1].includes(rawSnapshot.schemaVersion)) {
      throw new Error('pitch_snapshot_future_version');
    }
    const values = isPlainObject(rawSnapshot.values) ? rawSnapshot.values : rawSnapshot;
    const proData = parseJson(values.pitchTrainerProData, 'pitchTrainerProData', { customChords: [], customProgressions: [] });
    const settings = parseJson(values.pitchTrainerSettings, 'pitchTrainerSettings', {});
    const melody = normalizeSlotContainer(parseJson(values.pitchTrainerStagingProMelodySlots, 'pitchTrainerStagingProMelodySlots', {}));
    const chordStages = normalizeSlotContainer(parseJson(values.pitchTrainerStagingProChordSlots, 'pitchTrainerStagingProChordSlots', {}));
    const results = parseJson(values.pitchTrainerTestModeResults, 'pitchTrainerTestModeResults', { melody: {}, chord: {} });
    const records = [];
    const chordRefs = new Map();
    const builtinChordEnabled = {};
    const builtinProgressionEnabled = {};

    const legacyChords = Array.isArray(proData.customChords) ? proData.customChords : [];
    const legacyProgressions = Array.isArray(proData.customProgressions) ? proData.customProgressions : [];
    const identifiedBuiltinChords = identifyBuiltinChords(legacyChords, legacyProgressions);
    legacyChords.forEach((chord, ordinal) => {
      if (!isPlainObject(chord)) throw new Error('pitch_legacy_chord_invalid');
      const builtinRef = identifiedBuiltinChords.get(chord) || null;
      if (builtinRef) {
        chordRefs.set(chord.id, builtinRef);
        if (builtinChordRef(chord) === builtinRef) {
          if (chord.isActive === false) builtinChordEnabled[builtinRef] = false;
          return;
        }
      }
      const shape = chordShape(chord);
      const recordId = builtinRef
        ? `builtin:chord-override:${builtinRef.split(':').at(-1)}`
        : normalizeLegacyId('chord', chord.id, shape, ordinal);
      if (!builtinRef) chordRefs.set(chord.id, recordId);
      records.push(makeRecord('custom_chord', recordId, {
        ...(builtinRef
          ? { builtinKey: builtinRef }
          : { legacyId: chord.id ?? `derived-${stableHash(shape)}` }),
        ...shape,
        isActive: chord.isActive !== false
      }));
    });

    const identifiedBuiltinProgressions = identifyBuiltinProgressions(legacyProgressions, chordRefs);
    legacyProgressions.forEach((progression, ordinal) => {
      if (!isPlainObject(progression) || !Array.isArray(progression.chords)) throw new Error('pitch_legacy_progression_invalid');
      const refs = progression.chords.map((id) => chordRefs.get(id)).filter(Boolean);
      if (refs.length !== progression.chords.length) throw new Error('pitch_legacy_progression_reference_invalid');
      const builtin = identifiedBuiltinProgressions.has(progression)
        ? BUILTIN_PROGRESSIONS.find((entry) => entry.name === String(progression.name ?? '') &&
          canonicalJson(entry.chordRefs) === canonicalJson(refs))
        : null;
      if (builtin) {
        if (progression.isActive === false) builtinProgressionEnabled[builtin.key] = false;
        return;
      }
      const semantic = { name: String(progression.name ?? ''), chordRefs: refs };
      const recordId = normalizeLegacyId('progression', progression.id, semantic, ordinal);
      records.push(makeRecord('custom_progression', recordId, {
        legacyId: progression.id ?? `derived-${stableHash(semantic)}`,
        name: semantic.name, chordRefs: refs, isActive: progression.isActive !== false
      }));
    });

    const syncValues = {};
    SYNC_SETTINGS.forEach((key) => { if (settings[key] !== undefined) syncValues[key] = settings[key]; });
    const accidental = values.pitchTrainerProAccidentalDisplay;
    if (accidental === 'flat' || accidental === 'sharp') syncValues.accidentalDisplay = accidental;
    if (values.pitchTrainerTestModeEnabled === 'true' || values.pitchTrainerTestModeEnabled === true) syncValues.testModeEnabled = true;
    if (Object.keys(builtinChordEnabled).length) syncValues.builtinChordEnabled = builtinChordEnabled;
    if (Object.keys(builtinProgressionEnabled).length) syncValues.builtinProgressionEnabled = builtinProgressionEnabled;
    if (meaningfulSettings(syncValues)) records.push(makeRecord('settings', 'settings', { values: syncValues }));

    const stageRefs = { melody: new Map(), chord: new Map() };
    melody.slots.forEach((slot, ordinal) => {
      if (!isPlainObject(slot) || !isPlainObject(slot.config)) throw new Error('pitch_legacy_melody_stage_invalid');
      const recordId = normalizeLegacyId('melody-stage', slot.id, slot, ordinal);
      stageRefs.melody.set(String(slot.id), recordId);
      records.push(makeRecord('melody_stage', recordId, {
        legacyId: Number(slot.id), name: String(slot.name ?? ''),
        pool: Array.isArray(slot.config.pool) ? slot.config.pool.map(String) : [],
        count: Number(slot.config.count), is2Octave: !!slot.config.is2Octave,
        isPianoLayout: slot.config.isPianoLayout !== false,
        answerMethod: String(slot.config.answerMethod || 'note'),
        description: String(slot.config.description || '')
      }));
    });
    chordStages.slots.forEach((slot, ordinal) => {
      if (!isPlainObject(slot) || !isPlainObject(slot.config) || !Array.isArray(slot.config.poolChordIds)) {
        throw new Error('pitch_legacy_chord_stage_invalid');
      }
      const refs = slot.config.poolChordIds.map((id) => chordRefs.get(id)).filter(Boolean);
      if (refs.length !== slot.config.poolChordIds.length) throw new Error('pitch_legacy_chord_stage_reference_invalid');
      const recordId = normalizeLegacyId('chord-stage', slot.id, slot, ordinal);
      stageRefs.chord.set(String(slot.id), recordId);
      records.push(makeRecord('chord_stage', recordId, {
        legacyId: Number(slot.id), name: String(slot.name ?? ''), chordRefs: refs,
        count: Number(slot.config.count ?? 4), proQuestionMode: String(slot.config.proQuestionMode || 'chords'),
        description: String(slot.config.description || '')
      }));
    });
    for (const [category, container] of [['melody', melody], ['chord', chordStages]]) {
      if (container.slots.length) {
        const ordered = container.order.map((id) => stageRefs[category].get(String(id))).filter(Boolean);
        for (const ref of stageRefs[category].values()) if (!ordered.includes(ref)) ordered.push(ref);
        records.push(makeRecord('stage_order', category, { category, stageRefs: ordered }));
      }
    }

    for (const category of ['melody', 'chord']) {
      const categoryResults = isPlainObject(results[category]) ? results[category] : {};
      for (const [stageKey, progress] of Object.entries(categoryResults)) {
        if (!isPlainObject(progress)) throw new Error('pitch_legacy_progress_invalid');
        let stageRef;
        if (/^stage-[0-9]+$/u.test(stageKey)) stageRef = `builtin:${category}:${stageKey}`;
        else if (/^custom-[0-9]+$/u.test(stageKey)) stageRef = stageRefs[category].get(stageKey.slice(7));
        if (!stageRef) throw new Error('pitch_legacy_progress_reference_invalid');
        const recordId = `${category}:${stageRef}`;
        records.push(makeRecord('progress', recordId, {
          category, stageRef, clearCount: Number(progress.clearCount || 0),
          lastClearedAt: progress.lastClearedAt ? String(progress.lastClearedAt) : null
        }));
      }
    }

    records.sort((left, right) => `${left.recordType}/${left.recordId}`.localeCompare(`${right.recordType}/${right.recordId}`));
    const snapshot = { appId: APP_ID, schemaVersion: SCHEMA_VERSION, records };
    validateSnapshot(snapshot);
    return snapshot;
  }

  function validText(value, maximum = 1000) {
    return typeof value === 'string' && value.length <= maximum &&
      !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
  }

  function validateRecordShape(record) {
    const payload = record.payload;
    if (record.recordType === 'settings') {
      const allowed = new Set([...SYNC_SETTINGS, 'accidentalDisplay', 'testModeEnabled',
        'builtinChordEnabled', 'builtinProgressionEnabled']);
      if (!isPlainObject(payload.values) || !Object.keys(payload.values).every((key) => allowed.has(key)) ||
          payload.values.baseHz !== undefined || payload.values.sustainTime !== undefined) return false;
      const values = payload.values;
      if (values.instrument !== undefined && !validText(values.instrument, 80)) return false;
      if (values.notationStyle !== undefined && !validText(values.notationStyle, 40)) return false;
      if (values.accidentalDisplay !== undefined && !['sharp', 'flat'].includes(values.accidentalDisplay)) return false;
      for (const key of ['scaleEnabled', 'isAnswerMode', 'keyRandomMode', 'testModeEnabled']) {
        if (values[key] !== undefined && typeof values[key] !== 'boolean') return false;
      }
      for (const key of ['baseOctave', 'keyOffset']) {
        if (values[key] !== undefined && !Number.isSafeInteger(values[key])) return false;
      }
      if (values.noteSpeed !== undefined && (typeof values.noteSpeed !== 'number' || !Number.isFinite(values.noteSpeed))) return false;
      for (const key of ['builtinChordEnabled', 'builtinProgressionEnabled']) {
        if (values[key] !== undefined && (!isPlainObject(values[key]) ||
            Object.values(values[key]).some((enabled) => typeof enabled !== 'boolean'))) return false;
      }
      return true;
    }
    if (record.recordType === 'custom_chord') {
      return ((payload.builtinKey !== undefined && payload.legacyId === undefined &&
          BUILTIN_CHORDS.some((entry) => entry.key === payload.builtinKey)) ||
        (payload.builtinKey === undefined && (Number.isSafeInteger(payload.legacyId) || validText(payload.legacyId, 80)))) &&
        validText(payload.name, 200) && ['root', 'third', 'fifth', 'seventh', 'inversion'].every((key) => validText(payload[key], 20)) &&
        Array.isArray(payload.tensions) && payload.tensions.length <= 16 && payload.tensions.every((item) => validText(item, 20)) &&
        typeof payload.isActive === 'boolean';
    }
    if (record.recordType === 'custom_progression') {
      return validText(payload.name, 200) && Array.isArray(payload.chordRefs) && payload.chordRefs.length >= 2 &&
        payload.chordRefs.length <= 64 && typeof payload.isActive === 'boolean';
    }
    if (record.recordType === 'melody_stage') {
      return Number.isSafeInteger(payload.legacyId) && validText(payload.name, 200) &&
        Array.isArray(payload.pool) && payload.pool.length > 0 && payload.pool.every((item) => validText(item, 20)) &&
        Number.isSafeInteger(payload.count) && payload.count > 0 && typeof payload.is2Octave === 'boolean' &&
        typeof payload.isPianoLayout === 'boolean' && validText(payload.answerMethod, 40) && validText(payload.description);
    }
    if (record.recordType === 'chord_stage') {
      return Number.isSafeInteger(payload.legacyId) && validText(payload.name, 200) &&
        Array.isArray(payload.chordRefs) && payload.chordRefs.length > 0 && Number.isSafeInteger(payload.count) &&
        payload.count > 0 && validText(payload.proQuestionMode, 40) && validText(payload.description);
    }
    if (record.recordType === 'stage_order') {
      return ['melody', 'chord'].includes(payload.category) && Array.isArray(payload.stageRefs) &&
        new Set(payload.stageRefs).size === payload.stageRefs.length;
    }
    if (record.recordType === 'progress') {
      return ['melody', 'chord'].includes(payload.category) && validText(payload.stageRef, 200) &&
        Number.isSafeInteger(payload.clearCount) && payload.clearCount >= 0 &&
        (payload.lastClearedAt === null || (validText(payload.lastClearedAt, 40) && Number.isFinite(Date.parse(payload.lastClearedAt))));
    }
    return false;
  }

  function validateSnapshot(snapshot) {
    if (!isPlainObject(snapshot) || snapshot.appId !== APP_ID || snapshot.schemaVersion !== SCHEMA_VERSION ||
        !Array.isArray(snapshot.records)) throw new Error('pitch_snapshot_invalid');
    const seen = new Set();
    const availableRefs = new Set(BUILTIN_CHORDS.map((entry) => entry.key));
    const stageRecordRefs = new Set();
    for (const record of snapshot.records) {
      if (!isPlainObject(record) || !RECORD_TYPES.has(record.recordType) || record.schemaVersion !== SCHEMA_VERSION ||
          typeof record.recordId !== 'string' || !isPlainObject(record.payload) || record.payload.id !== record.recordId ||
          !validateRecordShape(record)) {
        throw new Error('pitch_record_invalid');
      }
      const key = `${record.recordType}/${record.recordId}`;
      if (seen.has(key)) throw new Error('pitch_record_duplicate');
      seen.add(key);
      if (record.recordType === 'custom_chord') availableRefs.add(record.recordId);
      if (record.recordType === 'melody_stage' || record.recordType === 'chord_stage') stageRecordRefs.add(record.recordId);
    }
    for (const record of snapshot.records) {
      if (record.recordType === 'custom_progression' || record.recordType === 'chord_stage') {
        if (!Array.isArray(record.payload.chordRefs) || record.payload.chordRefs.some((ref) => !availableRefs.has(ref))) {
          throw new Error('pitch_record_reference_invalid');
        }
      }
      if (record.recordType === 'stage_order' &&
          (!Array.isArray(record.payload.stageRefs) || record.payload.stageRefs.some((ref) => !stageRecordRefs.has(ref)))) {
        throw new Error('pitch_record_reference_invalid');
      }
      if (record.recordType === 'progress' && !record.payload.stageRef.startsWith('builtin:') &&
          !stageRecordRefs.has(record.payload.stageRef)) throw new Error('pitch_record_reference_invalid');
    }
    return true;
  }

  function readLocalSnapshot(storage) {
    if (!storage || typeof storage.getItem !== 'function') throw new Error('pitch_storage_unavailable');
    const values = {};
    MANAGED_KEYS.forEach((key) => { values[key] = storage.getItem(key); });
    return { schemaVersion: 0, values };
  }

  function isMeaningfulLocalData(snapshot) {
    const canonical = normalizeRawSnapshot(snapshot);
    return canonical.records.length > 0;
  }

  async function serializeRecords(snapshot, cryptoImpl = global.crypto) {
    const canonical = normalizeRawSnapshot(snapshot);
    const records = [];
    for (const record of canonical.records) {
      records.push({ ...clone(record), payloadHash: await sha256(canonicalJson({
        appId: APP_ID, recordType: record.recordType, recordId: record.recordId,
        schemaVersion: record.schemaVersion, payload: record.payload
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

  function mergeSettings(left, right, conflicts, key) {
    const values = { ...left.payload.values };
    for (const [field, value] of Object.entries(right.payload.values)) {
      if (Object.prototype.hasOwnProperty.call(values, field) && canonicalJson(values[field]) !== canonicalJson(value)) {
        conflicts.push({ recordKey: key, field, reason: 'settings_field_conflict' });
      } else values[field] = clone(value);
    }
    return makeRecord('settings', 'settings', { values });
  }

  function mergeProgress(left, right) {
    const clearCount = Math.max(left.payload.clearCount, right.payload.clearCount);
    const dates = [left.payload.lastClearedAt, right.payload.lastClearedAt].filter(Boolean).sort();
    return makeRecord('progress', left.recordId, {
      category: left.payload.category, stageRef: left.payload.stageRef,
      clearCount, lastClearedAt: dates.at(-1) || null
    });
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
      if (left.recordType === 'progress' && left.payload.category === right.payload.category &&
          left.payload.stageRef === right.payload.stageRef) {
        merged.set(key, mergeProgress(left, right));
      } else if (left.recordType === 'settings') {
        merged.set(key, mergeSettings(left, right, conflicts, key));
      } else if (left.recordType === 'stage_order') {
        const leftRefs = left.payload.stageRefs;
        const rightRefs = right.payload.stageRefs;
        if (leftRefs.every((ref) => !rightRefs.includes(ref))) {
          merged.set(key, makeRecord('stage_order', left.recordId, {
            category: left.payload.category, stageRefs: [...leftRefs, ...rightRefs]
          }));
        } else conflicts.push({ recordKey: key, reason: 'ordering_conflict' });
      } else conflicts.push({ recordKey: key, reason: 'semantic_conflict' });
    }
    const snapshot = { appId: APP_ID, schemaVersion: SCHEMA_VERSION, records: [...merged.values()] };
    if (!conflicts.length) validateSnapshot(snapshot);
    return Object.freeze({ snapshot, conflicts: Object.freeze(conflicts) });
  }

  function defaultLegacyData() {
    const ids = new Map(BUILTIN_CHORDS.map((entry, index) => [entry.key, 10001 + index]));
    const customChords = BUILTIN_CHORDS.map((entry) => ({
      id: ids.get(entry.key), name: entry.name, root: entry.root, third: entry.third,
      fifth: entry.fifth, seventh: entry.seventh, tensions: [], inversion: entry.inversion, isActive: true
    }));
    const customProgressions = BUILTIN_PROGRESSIONS.map((entry, index) => ({
      id: 10100 + index, name: entry.name, chords: entry.chordRefs.map((ref) => ids.get(ref)), isActive: true
    }));
    return { customChords, customProgressions };
  }

  function safeLegacyNumber(value, fallbackSeed, used) {
    let candidate = Number(value);
    if (!Number.isSafeInteger(candidate) || candidate <= 0 || used.has(candidate)) {
      candidate = 2000000000 + (parseInt(stableHash(fallbackSeed).slice(0, 7), 16) % 100000000);
      while (used.has(candidate)) candidate += 1;
    }
    used.add(candidate);
    return candidate;
  }

  function materialize(snapshot, currentRaw) {
    const canonical = normalizeRawSnapshot(snapshot);
    const currentData = parseJson(currentRaw.values.pitchTrainerProData, 'pitchTrainerProData', defaultLegacyData());
    const currentChords = Array.isArray(currentData.customChords) ? currentData.customChords : [];
    const currentProgressions = Array.isArray(currentData.customProgressions) ? currentData.customProgressions : [];
    const currentBuiltinChordMap = identifyBuiltinChords(currentChords, currentProgressions);
    let builtins = currentChords.filter((chord) => currentBuiltinChordMap.has(chord));
    if (builtins.length < BUILTIN_CHORDS.length) builtins = defaultLegacyData().customChords;
    const builtinIds = new Map(builtins.map((chord) => [builtinChordRef(chord), chord.id]));
    const usedIds = new Set(builtins.map((chord) => chord.id));
    const settingsRecord = canonical.records.find((record) => record.recordType === 'settings');
    const values = settingsRecord?.payload.values || {};
    builtins.forEach((chord) => { chord.isActive = values.builtinChordEnabled?.[builtinChordRef(chord)] !== false; });
    const customRecords = canonical.records.filter((record) => record.recordType === 'custom_chord');
    const chordIds = new Map(builtinIds);
    const customChords = customRecords.filter((record) => !record.payload.builtinKey).map((record) => {
      const id = safeLegacyNumber(record.payload.legacyId, record.recordId, usedIds);
      chordIds.set(record.recordId, id);
      return {
        id, name: record.payload.name, root: record.payload.root, third: record.payload.third,
        fifth: record.payload.fifth, seventh: record.payload.seventh,
        tensions: clone(record.payload.tensions), inversion: record.payload.inversion,
        isActive: record.payload.isActive
      };
    });
    customRecords.filter((record) => record.payload.builtinKey).forEach((record) => {
      const target = builtins.find((chord) => builtinChordRef(chord) === record.payload.builtinKey);
      if (!target) throw new Error('pitch_builtin_override_target_missing');
      Object.assign(target, {
        name: record.payload.name, root: record.payload.root, third: record.payload.third,
        fifth: record.payload.fifth, seventh: record.payload.seventh,
        tensions: clone(record.payload.tensions), inversion: record.payload.inversion,
        isActive: record.payload.isActive
      });
      chordIds.set(record.recordId, target.id);
      chordIds.set(record.payload.builtinKey, target.id);
    });
    const defaultProgressions = defaultLegacyData().customProgressions;
    const currentRefsByChordId = new Map([...builtinIds.entries()].map(([ref, id]) => [id, ref]));
    const currentBuiltinProgressions = identifyBuiltinProgressions(currentProgressions, currentRefsByChordId);
    const existingBuiltinProgressions = currentProgressions.filter((progression) => currentBuiltinProgressions.has(progression));
    const builtinProgressions = existingBuiltinProgressions.length === BUILTIN_PROGRESSIONS.length
      ? existingBuiltinProgressions : defaultProgressions.map((progression) => ({
        ...progression,
        chords: progression.chords.map((id) => {
          const ref = [...new Map(defaultLegacyData().customChords.map((chord) => [chord.id, builtinChordRef(chord)])).entries()]
            .find((entry) => entry[0] === id)?.[1];
          return builtinIds.get(ref);
        })
      }));
    builtinProgressions.forEach((progression) => {
      const refs = progression.chords.map((id) => [...builtinIds.entries()].find((entry) => entry[1] === id)?.[0]);
      const builtin = BUILTIN_PROGRESSIONS.find((entry) => entry.name === progression.name && canonicalJson(entry.chordRefs) === canonicalJson(refs));
      progression.isActive = values.builtinProgressionEnabled?.[builtin?.key] !== false;
    });
    const customProgressions = canonical.records.filter((record) => record.recordType === 'custom_progression').map((record) => ({
      id: safeLegacyNumber(record.payload.legacyId, record.recordId, usedIds),
      name: record.payload.name, chords: record.payload.chordRefs.map((ref) => chordIds.get(ref)),
      isActive: record.payload.isActive
    }));

    const currentSettings = parseJson(currentRaw.values.pitchTrainerSettings, 'pitchTrainerSettings', {});
    const nextSettings = {};
    LOCAL_ONLY_SETTINGS.forEach((key) => { if (currentSettings[key] !== undefined) nextSettings[key] = currentSettings[key]; });
    Object.assign(nextSettings, DEFAULT_SETTINGS);
    SYNC_SETTINGS.forEach((key) => { if (values[key] !== undefined) nextSettings[key] = values[key]; });

    const makeStages = (type, category) => {
      const stageRecords = canonical.records.filter((record) => record.recordType === type);
      const idByRef = new Map();
      const slots = stageRecords.map((record) => {
        const id = safeLegacyNumber(record.payload.legacyId, record.recordId, usedIds);
        idByRef.set(record.recordId, id);
        const config = type === 'melody_stage' ? {
          pool: clone(record.payload.pool), count: record.payload.count,
          is2Octave: record.payload.is2Octave, isPianoLayout: record.payload.isPianoLayout,
          answerMethod: record.payload.answerMethod, description: record.payload.description
        } : {
          poolChordIds: record.payload.chordRefs.map((ref) => chordIds.get(ref)),
          count: record.payload.count, proQuestionMode: record.payload.proQuestionMode,
          description: record.payload.description
        };
        return { id, name: record.payload.name, config };
      });
      const orderRecord = canonical.records.find((record) => record.recordType === 'stage_order' && record.payload.category === category);
      return { slots, order: (orderRecord?.payload.stageRefs || stageRecords.map((record) => record.recordId)).map((ref) => idByRef.get(ref)) };
    };
    const melody = makeStages('melody_stage', 'melody');
    const chordStageData = makeStages('chord_stage', 'chord');
    const stageIds = {
      melody: new Map(melody.slots.map((slot, index) => [canonical.records.filter((record) => record.recordType === 'melody_stage')[index].recordId, slot.id])),
      chord: new Map(chordStageData.slots.map((slot, index) => [canonical.records.filter((record) => record.recordType === 'chord_stage')[index].recordId, slot.id]))
    };
    const resultData = { melody: {}, chord: {} };
    canonical.records.filter((record) => record.recordType === 'progress').forEach((record) => {
      const payload = record.payload;
      const stageKey = payload.stageRef.startsWith('builtin:')
        ? payload.stageRef.split(':').at(-1)
        : `custom-${stageIds[payload.category].get(payload.stageRef)}`;
      resultData[payload.category][stageKey] = {
        clearCount: payload.clearCount, ...(payload.lastClearedAt ? { lastClearedAt: payload.lastClearedAt } : {})
      };
    });
    return {
      pitchTrainerProData: JSON.stringify({ customChords: [...builtins, ...customChords], customProgressions: [...builtinProgressions, ...customProgressions] }),
      pitchTrainerSettings: JSON.stringify(nextSettings),
      pitchTrainerProAccidentalDisplay: values.accidentalDisplay || 'sharp',
      pitchTrainerStagingProMelodySlots: JSON.stringify(melody),
      pitchTrainerStagingProChordSlots: JSON.stringify(chordStageData),
      pitchTrainerTestModeEnabled: String(values.testModeEnabled === true),
      pitchTrainerTestModeResults: JSON.stringify(resultData)
    };
  }

  async function createBackup(storage, backupStore) {
    const snapshot = readLocalSnapshot(storage);
    const backup = { version: 1, appId: APP_ID, createdAt: Date.now(), values: clone(snapshot.values) };
    if (backupStore) {
      if (typeof backupStore.save !== 'function') throw new Error('pitch_backup_store_invalid');
      await backupStore.save(clone(backup));
    }
    return backup;
  }

  async function restoreBackup(storage, backup) {
    if (!backup || backup.appId !== APP_ID || backup.version !== 1 || !isPlainObject(backup.values)) {
      throw new Error('pitch_backup_invalid');
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
    try {
      const materialized = materialize(snapshot, { values: backup.values });
      for (const key of MANAGED_KEYS) storage.setItem(key, materialized[key]);
      if (typeof options.afterWrite === 'function') await options.afterWrite();
      const actual = normalizeRawSnapshot(readLocalSnapshot(storage));
      const actualManifest = await computeManifest(actual, options.cryptoImpl || global.crypto);
      if (actualManifest !== expectedManifest) throw new Error('pitch_apply_manifest_mismatch');
      return Object.freeze({ ok: true, manifestHash: actualManifest, backup });
    } catch (error) {
      await restoreBackup(storage, backup);
      throw error;
    }
  }

  function assertDataPlaneContext(context) {
    if (!isPlainObject(context?.membership) || context.membership.appId !== APP_ID ||
        context.membership.state !== 'active') throw new Error('pitch_membership_inactive');
    if (!isPlainObject(context.appCredential) || context.appCredential.appId !== APP_ID ||
        typeof context.appCredential.credential !== 'string' || !context.appCredential.credential.startsWith('scd1.')) {
      throw new Error('pitch_app_credential_required');
    }
    if (context.accountCredential && !context.appCredential) throw new Error('account_credential_cannot_write_pitch');
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

  class PitchSyncAdapter {
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
        afterWrite: options.afterWrite
      });
    }
    createBackup() { return createBackup(this.storage, this.backupStore); }
    restoreBackup(backup) { return restoreBackup(this.storage, backup); }
    computeManifest(snapshot) { return computeManifest(snapshot, this.cryptoImpl); }
    createInitialMigrationPlan(context) { return createInitialMigrationPlan(this.storage, context, { cryptoImpl: this.cryptoImpl }); }
    assertDataPlaneContext(context) { return assertDataPlaneContext(context); }
  }

  Object.assign(root, {
    APP_ID, SCHEMA_VERSION, MANAGED_KEYS, SYNC_SETTINGS, LOCAL_ONLY_SETTINGS,
    BUILTIN_CHORDS, BUILTIN_PROGRESSIONS, PitchSyncAdapter,
    readLocalSnapshot, normalizeLocalSnapshot: normalizeRawSnapshot, validateSnapshot,
    serializeRecords, deserializeRecords, isMeaningfulLocalData, mergeSnapshots,
    applyRemoteSnapshot, createBackup, restoreBackup, computeManifest,
    assertDataPlaneContext, createInitialMigrationPlan
  });
})(globalThis);
