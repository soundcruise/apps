import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { createChordFormAdapter } from '../js/modules/chord/form-adapter.mjs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const clone = x => JSON.parse(JSON.stringify(x));
const tuningMidi = [64, 59, 55, 50, 45, 40];
function fixture(change = {}) {
    const denied = new Proxy({}, { get() { throw Error('forbidden side effect'); } });
    const window = { ChordCruise: {}, CruiseStudio: {}, localStorage: denied, indexedDB: denied, document: denied, fetch: denied };
    const context = vm.createContext({ window, document: denied, localStorage: denied, indexedDB: denied, fetch: denied });
    for (const p of ['../../chord-cruise/js/core/music-theory.js', '../../chord-cruise/js/core/caged-forms.js', '../js/core/music-theory.js', '../js/core/song-model.js']) vm.runInContext(read(p), context);
    const options = { chordTheory: window.ChordCruise.theory, caged: window.ChordCruise.caged,
        parseChordSymbol: window.CruiseStudio.theory.parseBasicChordSymbol, ownerVersion: '1.21.0', ...change };
    return { window, options, adapter: createChordFormAdapter(options) };
}
const query = (symbol = 'C', extra = {}) => ({ symbol, capo: 0, tuningMidi: tuningMidi.slice(), maxAbsoluteFret: 24, ...extra });
function complete(f, symbol, extra = {}) {
    const first = f.adapter.resolve(query(symbol, extra));
    return f.adapter.resolve(query(symbol, { ...extra, playedStrings: first.form.notes.map(n => n.string) }));
}
for (const symbol of ['C', 'Am', 'G7', 'CM7', 'Cmaj7', 'Dm7', 'Dsus4']) test('released owner full voicing: ' + symbol, () => {
    const f = fixture(), r = complete(f, symbol);
    assert(r.display.possible); assert(r.completeness.complete); assert(r.performance.voicingUsable, JSON.stringify(r));
    assert.equal(r.performance.scope, 'voicing-only'); assert.equal(r.provenance.ownerVersion, '1.21.0');
    assert.equal(r.provenance.adoption, 'unconfirmed'); assert.equal(r.form.unknownStrings.length, 0);
});
for (const symbol of ['C6', 'Am6']) test('owner overlay base is displayable, never a complete sixth: ' + symbol, () => {
    const r = complete(fixture(), symbol); assert(r.display.possible); assert(!r.completeness.complete);
    assert(r.completeness.reasons.includes('sixth-overlay-unresolved')); assert(!r.performance.voicingUsable);
});
for (const symbol of ['C/E', 'C/D', 'Am7/G']) test('slash bass is not fabricated: ' + symbol, () => {
    const r = complete(fixture(), symbol); assert(r.display.possible); assert(!r.performance.voicingUsable);
    assert(r.completeness.reasons.includes('slash-bass-unresolved')); assert.equal(r.request.slashBass, true);
});
test('explicit root slash can already be satisfied without overlay selection', () => {
    assert(complete(fixture(), 'C/C').performance.voicingUsable);
});
test('capo converts sounding D to owner C; frets and open sounding pitches remain separate', () => {
    const f = fixture(), calls = [], caged = f.options.caged;
    const adapter = createChordFormAdapter({ ...f.options, caged: { ...caged,
        getCommonForm(...a) { calls.push(['common', ...a]); return caged.getCommonForm(...a); },
        getForm(...a) { calls.push(['form', ...a]); return caged.getForm(...a); } } });
    const r = adapter.resolve(query('D', { capo: 2, playedStrings: [1, 2, 3, 4, 5] }));
    assert(r.performance.voicingUsable); assert.equal(r.request.soundingRootPc, 2); assert.equal(r.request.formRootPc, 0);
    assert.deepEqual(calls, [['common', 'maj', 0, 13, 0], ['form', 'C', 'maj', 0, 13, 0]]);
    for (const n of r.form.notes) { assert.equal(n.absoluteFret, n.relativeFret + 2); assert.equal(n.soundingMidi, tuningMidi[n.string - 1] + n.absoluteFret); }
    const open = r.form.notes.find(n => n.relativeFret === 0); assert.equal(open.absoluteFret, 2);
});
test('generation limits are independent of any viewport; partial form never mutes omitted strings', () => {
    const r = fixture().adapter.resolve(query('C', { generation: { minRelativeFret: 0, maxRelativeFret: 1 }, viewport: { min: 0, max: 24 } }));
    assert(r.display.possible); assert(!r.completeness.complete); assert(r.completeness.reasons.includes('owner-partial-form'));
    assert(r.form.unknownStrings.includes(5)); assert(!r.form.mutedStrings.includes(5)); assert(!r.performance.voicingUsable);
});
test('complete diagram does not imply an actual played-string decision', () => {
    const r = fixture().adapter.resolve(query()); assert(r.completeness.complete); assert(r.display.possible);
    assert.deepEqual(r.performance.reasons, ['played-strings-unconfirmed']);
});
test('selected subset must retain all tones and the specified lowest pitch', () => {
    const a = fixture().adapter;
    assert(a.resolve(query('C', { playedStrings: [1, 2] })).performance.reasons.includes('played-tones-incomplete'));
    assert(a.resolve(query('C', { playedStrings: [1, 2, 3] })).performance.reasons.includes('played-bass-mismatch'));
    assert(a.resolve(query('C', { playedStrings: [1, 2, 3, 4, 5, 6] })).performance.reasons.includes('played-string-not-in-form'));
});
for (const symbol of ['Cadd9', 'Cdim7', 'Caug', 'C9', 'Cbanana', 'C7b5']) test('unimplemented quality is explicit, no alternative database: ' + symbol, () => {
    const r = fixture().adapter.resolve(query(symbol)); assert.equal(r.display.possible, false); assert.deepEqual(r.display.reasons, ['unsupported-quality']);
});
for (const symbol of ['C m7', 'C /E', 'C//E', 'H7', '', '<img>']) test('ambiguous chord remains unresolved: ' + symbol, () => {
    assert.equal(fixture().adapter.resolve(query(symbol)).display.possible, false);
});
for (const extra of [{ capo: -1 }, { capo: 12 }, { capo: 1.5 }, { tuningMidi: [64, 59, 55, 50, 45, 38] },
    { tuningMidi: null }, { maxAbsoluteFret: 40 }, { generation: { minRelativeFret: 0, maxRelativeFret: 25 } },
    { capo: 11, generation: { minRelativeFret: 0, maxRelativeFret: 14 } }, { playedStrings: [] }, { playedStrings: [1, 1] }]) test('invalid conditions cannot become ready: ' + JSON.stringify(extra), () => {
    assert(!fixture().adapter.resolve(query('C', extra)).display.possible);
});
test('physical boundary is inclusive, including capo; request never expands it', () => {
    const r = complete(fixture(), 'D', { capo: 2, maxAbsoluteFret: 5, generation: { minRelativeFret: 0, maxRelativeFret: 3 } });
    assert(r.performance.voicingUsable); assert.equal(Math.max(...r.form.notes.map(n => n.absoluteFret)), 5);
});
function altered(mutator, extra = {}) {
    const f = fixture(), api = f.options.caged;
    return createChordFormAdapter({ ...f.options, caged: { ...api, getForm(...args) { const raw = clone(api.getForm(...args)); mutator(raw); return raw; }, ...extra } });
}
for (const [name, change] of [
    ['duplicate string', r => r.notes.push({ ...r.notes[0] })], ['bad string', r => r.notes[0].string = 0],
    ['negative fret', r => r.notes[0].fret = -1], ['beyond generation', r => r.notes[0].fret = 14],
    ['pitch contradiction', r => r.notes[0].interval = 1], ['note marked muted', r => r.mutedStrings.push(r.notes[0].string)],
    ['wrong quality', r => r.qualityKey = '7'], ['wrong shape', r => r.shape = 'A'], ['bad finger', r => r.notes[0].finger = 7]
]) test('malformed owner response: ' + name, () => { const r = altered(change).resolve(query()); assert(!r.display.possible); assert(!r.performance.voicingUsable); });
test('coherent but unintended note is diagnosed musically, not accepted as complete', () => {
    const r = altered(r => { r.notes[0].fret = 4; r.notes[0].interval = 1; }).resolve(query());
    assert(r.display.possible); assert(r.completeness.reasons.includes('unintended-tones')); assert(!r.performance.voicingUsable);
});
test('missing completeness evidence preserves display, not performance readiness', () => {
    const r = altered(r => { delete r.hasOutOfRangeNotes; delete r.omittedNoteCount; delete r.outOfRangeNotes; }).resolve(query());
    assert(r.display.possible); assert(r.completeness.reasons.includes('owner-completeness-unconfirmed'));
});
test('unknown string state cannot be mistaken for muted', () => {
    const r = altered(r => { r.notes = r.notes.filter(n => n.string !== 1); }).resolve(query());
    assert(r.display.possible); assert.deepEqual(r.form.unknownStrings, [1]); assert(!r.performance.voicingUsable);
});
test('missing fingering alone is permitted; explicit warning remains unconfirmed', () => {
    const a = altered(r => { r.notes.forEach(n => n.finger = null); r.fingeringStatus = 'undefined'; });
    assert(a.resolve(query('C', { playedStrings: [1, 2, 3, 4, 5] })).performance.voicingUsable);
    const b = altered(r => r.notes[0].fingeringWarning = true).resolve(query('C', { playedStrings: [1, 2, 3, 4, 5] }));
    assert(b.display.possible); assert(b.performance.reasons.includes('playability-unconfirmed'));
});
test('owner choice is respected without reranking or retries', () => {
    const f = fixture(), api = f.options.caged, calls = [];
    const a = createChordFormAdapter({ ...f.options, caged: { ...api, getCommonForm() { return { shape: 'E', source: 'recommended' }; },
        getForm(...args) { calls.push(args); return api.getForm(...args); } } });
    assert.equal(a.resolve(query()).form.shape, 'E'); assert.equal(calls.length, 1);
});
test('unavailable, absent recommendation and API exceptions are explicit', () => {
    const f = fixture();
    for (const change of [{ getCommonForm: () => null }, { getForm: () => ({ available: false, reason: 'position' }) },
        { getCommonForm() { throw Error('owner failure'); } }, { getForm() { throw Error('owner failure'); } },
        { getCommonForm: () => ({ shape: 'X', source: 'common' }) }]) {
        const a = createChordFormAdapter({ ...f.options, caged: { ...f.options.caged, ...change } }); assert(!a.resolve(query()).display.possible);
    }
});
test('owner accessors, cycles, custom instances and non-finite data never execute as data', () => {
    let getters = 0;
    const f = fixture(), accessor = { get available() { getters++; return true; } }, cycle = {}; cycle.self = cycle;
    for (const raw of [accessor, cycle, new Date(), { available: true, notes: [NaN] }]) {
        const a = createChordFormAdapter({ ...f.options, caged: { ...f.options.caged, getForm: () => raw } }); assert(!a.resolve(query()).display.possible);
    }
    assert.equal(getters, 0);
});
test('provenance, owner data and caller data are detached, not frozen or mutated in place', () => {
    const f = fixture(), q = query(), before = JSON.stringify(q), ownerBefore = JSON.stringify(f.options.caged.FORMS);
    const r = f.adapter.resolve(q); assert.equal(JSON.stringify(q), before); assert(!Object.isFrozen(q));
    assert(Object.isFrozen(r.form.notes[0])); q.tuningMidi[0] = 0; assert.equal(r.request.tuningMidi[0], 64);
    assert.equal(JSON.stringify(f.options.caged.FORMS), ownerBefore); assert(!Object.isFrozen(f.options.caged.FORMS));
});
test('raw project, real Editing Session history/base/draft/undo/redo and schema stay unchanged', () => {
    const f = fixture(), require = createRequire(import.meta.url), E = require('../js/core/editing-session.js');
    // Same released initializer as schema2.test.mjs; no schema tag rewriting.
    const CS = f.window.CruiseStudio;
    f.window.crypto = webcrypto;
    CS.schema2 = require('../js/core/schema2.js');
    CS.model.configureSchema2();
    const project = clone(CS.model.createSampleProject()), raw = JSON.stringify(project);
    assert.equal(project.schemaVersion, 2);
    assert.equal(CS.model.validateProject(project).ok, true);
    let saves = 0;
    const repo = { read: () => ({ ok: true, exists: true, revision: raw, snapshot: project }), canWrite: () => true,
        subscribe: () => () => {}, save() { saves++; throw Error('forbidden save'); } };
    const registry = E.createRegistry({ repository: repo, validate: CS.model.validateProject });
    const s = registry.getOrCreateSession('structure', { type: 'project', projectId: project.projectId }); registry.activateSession(s);
    assert.equal(s.runOperation('test title', d => d.songInfo.title = 'draft').ok, true);
    assert.equal(s.runOperation('test artist', d => d.songInfo.artist = 'artist draft').ok, true);
    assert.equal(s.undo().ok, true);
    assert(s.dirty && s.canUndo() && s.canRedo());
    assert.equal(s.getHistory().entries.length, 2); assert.equal(s.getHistory().cursor, 1);
    assert.equal(CS.model.validateProject(s.workingSnapshot()).ok, true);
    const state = () => JSON.stringify({ draft: s.draft, working: s.workingSnapshot(), base: s.baseSnapshot, revision: s.baseRevision,
        dirty: s.dirty, history: s.getHistory(), canUndo: s.canUndo(), canRedo: s.canRedo(), sessionId: s.sessionId });
    const inputs = ['C', 'C6', 'C/E', 'Cadd9'].map(symbol => query(symbol)), inputBefore = JSON.stringify(inputs);
    const ownerBefore = JSON.stringify(f.options.caged.FORMS), before = state();
    const results = inputs.map(input => f.adapter.resolve(input));
    // These assertions prove that the real adapter/owner path ran, including unresolved cases.
    assert(results[0].display.possible && results[0].completeness.complete);
    assert(results[1].completeness.reasons.includes('sixth-overlay-unresolved'));
    assert(results[2].completeness.reasons.includes('slash-bass-unresolved'));
    assert.deepEqual(results[3].display.reasons, ['unsupported-quality']);
    assert.equal(state(), before); assert.equal(JSON.stringify(project), raw); assert.equal(saves, 0);
    assert.equal(JSON.stringify(inputs), inputBefore); assert.equal(JSON.stringify(f.options.caged.FORMS), ownerBefore);
    assert.equal(s.draft.schemaVersion, 2); assert.equal(CS.model.validateProject(s.workingSnapshot()).ok, true);
});
test('adapter is import-only and outside product module graph; no persistence or capability API', () => {
    const source = read('../js/modules/chord/form-adapter.mjs');
    assert.doesNotMatch(source, /\b(?:localStorage|indexedDB|fetch|XMLHttpRequest|navigator|document|window)\b|^import /m);
    assert.doesNotMatch(read('../index.html'), /form-adapter|caged-forms/);
});
