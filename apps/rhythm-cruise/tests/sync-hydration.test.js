'use strict';

// Rhythm Cloud Sync: after a remote apply, a later local save must never write old in-memory copies of
// synced settings back (tap layout, input mode, judgement, custom stages, click settings, stage prefs).
// The real functions are cut out of script.js and run against an in-memory localStorage.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
function cut(startMarker, endMarker) {
    var start = script.indexOf(startMarker);
    assert(start >= 0, 'missing ' + startMarker);
    var end = script.indexOf(endMarker, start + startMarker.length);
    assert(end > start, 'missing end of ' + startMarker);
    return script.slice(start, end);
}
function fn(name) { return cut('function ' + name + '(', '\n}\n') + '\n}\n'; }

var helpers = cut('// ── Cloud Sync: synced settings stay current in memory', 'function saveSettings() {');
var sideEffects = [];
function makeContext() {
    var store = new Map();
    var ctx = {
        JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
        SETTINGS_KEY: 'rhythmCruiseSettings', CLICK_SETTINGS_KEY: 'rhythmCruiseClickSettings:v1',
        RHYTHM_STAGE_PREFS_KEY: 'rhythmCruiseStagePrefs:v1',
        RHYTHM_BUILTIN_STAGE_DEFAULT_PREFS: { 1: {}, 2: {}, 3: {} },
        localStorage: { getItem: function (k) { return store.has(k) ? store.get(k) : null; }, setItem: function (k, v) { store.set(k, String(v)); } },
        state: { running: false, theme: undefined, tapLayout: 'lr', tapUnified: false, inputMode: 'tap', judgePreset: 'semiStrict',
            rhythmProCustomStages: [{ id: 's1', title: 'Local stage' }], rcClickMode: 'always', rcClickBeats: 'all', rcClickOffbeat: false,
            threshold: 0.05 },
        currentScreen: 'home',
        normalizeJudgePreset: function (v) { return ['easy', 'standard', 'semiStrict', 'strict', 'veryStrict'].indexOf(v) >= 0 ? v : 'semiStrict'; },
        normalizeRhythmCustomStageSettings: function (x) { return x && typeof x === 'object' ? JSON.parse(JSON.stringify(x)) : null; },
        normalizeRhythmStagePref: function (_n, v) { return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : null; },
        loadStageClickSettings: function () {
            var raw = JSON.parse(store.get('rhythmCruiseClickSettings:v1') || '{}');
            return { range: raw.range || 'always', beats: raw.beats || 'all', offbeat: !!raw.offbeat };
        },
        loadRhythmStagePrefs: function () { var raw = JSON.parse(store.get('rhythmCruiseStagePrefs:v1') || '{}'); return { builtin: (raw && raw.builtin) || {} }; },
        rhythmThemeOf: function (s) { return s.theme; },
        applyRhythmTheme: function (t) { sideEffects.push('theme:' + t); },
        updateInputModeUI: function () { sideEffects.push('ui'); }, applyTapLayout: function () { sideEffects.push('ui'); },
        updateJudgePresetUI: function () { sideEffects.push('ui'); }, updateStageSettingsUI: function () { sideEffects.push('ui'); },
        notifyRhythmSyncSave: function () {}
    };
    vm.createContext(ctx);
    vm.runInContext(helpers + fn('saveStageClickSettings') +
        'let rhythmStagePrefs = loadRhythmStagePrefs();\nlet rhythmStagePrefsBase = rhythmSyncClone(rhythmStagePrefs.builtin);\n' +
        fn('saveRhythmStagePrefs') +
        'this.api = { rememberRhythmSyncedMainBase, rhythmSyncedMainForSave, hydrateRhythmSyncedSettings, saveStageClickSettings, saveRhythmStagePrefs,' +
        ' setClickBase: function (v) { rhythmClickBase = v; }, prefs: function () { return rhythmStagePrefs; }, pending: function () { return rhythmSyncHydrationPending; } };', ctx);
    return { ctx: ctx, store: store, api: ctx.api };
}

// ── Main settings: three-way save ───────────────────────────────────────────────────────────────
(function () {
    var t = makeContext();
    t.store.set('rhythmCruiseSettings', JSON.stringify({ tapLayout: 'lr', tapUnified: false, inputMode: 'tap', judgePreset: 'semiStrict',
        rhythmProCustomStages: [{ id: 's1', title: 'Local stage' }], threshold: 0.05 }));
    t.api.rememberRhythmSyncedMainBase();
    // A Cloud Sync apply rewrites the stored synced settings (another device changed them).
    t.store.set('rhythmCruiseSettings', JSON.stringify({ tapLayout: 'ud', tapUnified: true, inputMode: 'stroke', judgePreset: 'strict',
        rhythmProCustomStages: [{ id: 's1', title: 'Remote renamed' }, { id: 's2', title: 'Remote added' }], threshold: 0.05 }));
    var out = t.api.rhythmSyncedMainForSave();
    assert.strictEqual(out.tapLayout, 'ud', 'untouched here → the synced value is kept');
    assert.strictEqual(out.tapUnified, true);
    assert.strictEqual(out.inputMode, 'stroke');
    assert.strictEqual(out.judgePreset, 'strict');
    assert.deepStrictEqual(out.rhythmProCustomStages.map(function (s) { return s.title; }), ['Remote renamed', 'Remote added']);
    // A setting changed on this device wins (and stays the device's value on the next save too).
    t.ctx.state.judgePreset = 'easy';
    out = t.api.rhythmSyncedMainForSave();
    assert.strictEqual(out.judgePreset, 'easy', 'changed here → this device value');
    assert.strictEqual(out.tapLayout, 'ud');
    var saved = JSON.parse(t.store.get('rhythmCruiseSettings'));                    // what saveSettings writes
    Object.keys(out).forEach(function (k) { saved[k] = out[k]; });
    t.store.set('rhythmCruiseSettings', JSON.stringify(saved));
    assert.strictEqual(t.api.rhythmSyncedMainForSave().judgePreset, 'easy', 'the next save keeps this device value');
    console.log('sync-hydration: three-way save keeps synced settings and this device\'s own changes OK');
}());

// ── Hydration: idle re-reads into memory; a running practice waits (no side effects) ───────────────
(function () {
    var t = makeContext();
    t.store.set('rhythmCruiseSettings', JSON.stringify({ theme: 'gray', tapLayout: 'ud', tapUnified: false, inputMode: 'stroke', judgePreset: 'strict',
        rhythmProCustomStages: [{ id: 's2', title: 'Remote added' }], threshold: 0.99 }));
    t.store.set('rhythmCruiseClickSettings:v1', JSON.stringify({ range: 'firstBar', beats: 'beat1', offbeat: true }));
    t.store.set('rhythmCruiseStagePrefs:v1', JSON.stringify({ builtin: { 1: { bpm: 111 } } }));
    t.ctx.state.running = true;
    sideEffects.length = 0;
    t.api.hydrateRhythmSyncedSettings();
    assert.strictEqual(t.ctx.state.theme, 'gray', 'theme is display only: applied right away');
    assert.deepStrictEqual(sideEffects, ['theme:gray'], 'nothing else is touched while a practice runs');
    assert.strictEqual(t.ctx.state.tapLayout, 'lr');
    assert.strictEqual(t.ctx.state.inputMode, 'tap');
    assert.strictEqual(t.ctx.state.rcClickMode, 'always');
    assert.strictEqual(t.api.pending(), true);
    t.ctx.state.running = false;
    t.ctx.currentScreen = 'practice';
    t.api.hydrateRhythmSyncedSettings();
    assert.strictEqual(t.api.pending(), true, 'still waiting while the practice screen is shown');
    t.ctx.currentScreen = 'home';
    sideEffects.length = 0;
    t.api.hydrateRhythmSyncedSettings();
    assert.strictEqual(t.api.pending(), false);
    assert.strictEqual(t.ctx.state.tapLayout, 'ud');
    assert.strictEqual(t.ctx.state.inputMode, 'stroke');
    assert.strictEqual(t.ctx.state.judgePreset, 'strict');
    assert.deepStrictEqual(t.ctx.state.rhythmProCustomStages.map(function (s) { return s.title; }), ['Remote added']);
    assert.strictEqual(t.ctx.state.rcClickMode, 'firstBar');
    assert.strictEqual(t.ctx.state.rcClickBeats, 'beat1');
    assert.strictEqual(t.ctx.state.rcClickOffbeat, true);
    assert.strictEqual(t.api.prefs().builtin[1].bpm, 111);
    assert.strictEqual(t.ctx.state.threshold, 0.05, 'device-only values are never read from the synced copy');
    assert(sideEffects.every(function (e) { return e === 'ui' || /^theme:/.test(e); }), 'display refresh only: ' + sideEffects.join(','));
    console.log('sync-hydration: idle re-read, deferred while a practice runs / is shown, no side effects OK');
}());

// ── Click settings and built-in stage preferences: per-field / per-stage three-way save ─────────────
(function () {
    var t = makeContext();
    t.store.set('rhythmCruiseClickSettings:v1', JSON.stringify({ range: 'always', beats: 'all', offbeat: false }));
    t.api.setClickBase({ range: 'always', beats: 'all', offbeat: false });
    t.store.set('rhythmCruiseClickSettings:v1', JSON.stringify({ range: 'firstBar', beats: 'all', offbeat: true })); // synced
    t.ctx.state.rcClickBeats = 'beat1';                                                                       // changed here
    t.api.saveStageClickSettings();
    assert.deepStrictEqual(JSON.parse(t.store.get('rhythmCruiseClickSettings:v1')), { range: 'firstBar', beats: 'beat1', offbeat: true });

    t.store.set('rhythmCruiseStagePrefs:v1', JSON.stringify({ builtin: { 1: { bpm: 111 } } }));                // synced stage 1
    t.api.prefs().builtin[2] = { bpm: 90 };                                                                    // changed here: stage 2
    t.api.saveRhythmStagePrefs();
    var prefs = JSON.parse(t.store.get('rhythmCruiseStagePrefs:v1')).builtin;
    assert.strictEqual(prefs[1].bpm, 111, 'a synced stage preference survives a save of another stage');
    assert.strictEqual(prefs[2].bpm, 90);
    console.log('sync-hydration: click settings and stage preferences keep synced values OK');
}());

// ── Wiring in script.js ───────────────────────────────────────────────────────────────────────────
(function () {
    assert(/JSON\.stringify\(Object\.assign\(\{\n            theme: state\.theme,/.test(script), 'saveSettings merges the three-way synced values');
    assert(/\}, rhythmSyncedMainForSave\(\)\)\)\);/.test(script));
    assert(/rememberRhythmSyncedMainBase\(\);\n\}/.test(fn('loadSettings')), 'loadSettings records what it read');
    assert(/rhythmClickBase = \{ \.\.\.savedClick \};/.test(script), 'initial click settings are recorded');
    assert(/if \(rhythmSyncHydrationPending && screen !== 'practice'\) hydrateRhythmSyncedSettings\(\);/.test(fn('show')), 'leaving the practice screen re-reads');
    assert(script.indexOf("window.addEventListener('sound-cruise-rhythm-sync-applied', hydrateRhythmSyncedSettings);") > 0);
    // State hydration only: no microphone, audio, playback or navigation calls.
    assert(!/stopMic|startMic|getUserMedia|AudioContext|audioCtx|play\(|stop\(\)|show\(|openStage|finish\(/.test(helpers), 'no runtime side effects');
    console.log('sync-hydration: wiring OK');
}());
