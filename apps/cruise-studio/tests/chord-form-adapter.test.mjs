import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { createChordFormAdapter, CHORD_FORM_ADAPTER_VERSION } from '../js/modules/chord/form-adapter.mjs';
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
    const inputs = [query('C'), query('C6'), query('C/E', { playedStrings: [1, 2, 3, 4] }), query('Cadd9'),
        query('C/G', { playedStrings: [1, 2, 3] }), query('D/F#', { capo: 2, playedStrings: [1, 2, 3, 4] })];
    const inputBefore = JSON.stringify(inputs);
    const ownerBefore = JSON.stringify(f.options.caged.FORMS), before = state();
    const results = inputs.map(input => f.adapter.resolve(input));
    // These assertions prove that the real adapter/owner path ran, including unresolved cases.
    assert(results[0].display.possible && results[0].completeness.complete);
    assert(results[1].completeness.reasons.includes('sixth-overlay-unresolved'));
    assert(results[2].completeness.reasons.includes('slash-bass-unresolved'));
    assert(results[2].performance.voicingUsable && results[4].performance.voicingUsable && results[5].performance.voicingUsable);
    assert.deepEqual(results[3].display.reasons, ['unsupported-quality']);
    assert.equal(state(), before); assert.equal(JSON.stringify(project), raw); assert.equal(saves, 0);
    assert.equal(JSON.stringify(inputs), inputBefore); assert.equal(JSON.stringify(f.options.caged.FORMS), ownerBefore);
    assert.equal(s.draft.schemaVersion, 2); assert.equal(CS.model.validateProject(s.workingSnapshot()).ok, true);
});
test('adapter stays pure and the product explicitly connects only owner CAGED plus form UI', () => {
    const source = read('../js/modules/chord/form-adapter.mjs');
    assert.doesNotMatch(source, /\b(?:localStorage|indexedDB|fetch|XMLHttpRequest|navigator|document|window)\b|^import /m);
    assert.match(read('../index.html'), /caged-forms.js\?v=1.21.0/);
    assert.match(read('../index.html'), /form-panel.mjs\?v=0.63.0/);
    assert.doesNotMatch(read('../js/modules/chord/form-panel.mjs'), /\b(?:localStorage|indexedDB|fetch|saveChord|featureAccess)\b/);
});

// P2-2: use released owner notes and recommendation shape in every fixture.
// Only the response under test is replaced; no alternative detection algorithm.
function barreFixture({ shape = 'C', barres, changeNotes } = {}) {
    const f = fixture(), owner = f.options.caged;
    const caged = { ...owner, getCommonForm: () => ({ shape, source: 'recommended' }),
        getForm(...args) { const raw = clone(owner.getForm(...args)); if (changeNotes) changeNotes(raw); return raw; } };
    if (barres !== undefined) caged.detectBarres = notes => typeof barres === 'function' ? barres(notes) : clone(barres);
    return { ...f, adapter: createChordFormAdapter({ ...f.options, caged }) };
}
for (const [name, barres, changeNotes] of [
    ['reverse range', [{ finger: 1, fret: 1, fromString: 6, toString: 1 }]],
    ['unrelated position', [{ finger: 1, fret: 12, fromString: 1, toString: 6 }]],
    ['endpoint finger mismatch', [{ finger: 2, fret: 1, fromString: 1, toString: 3 }]],
    ['endpoint fret mismatch', [{ finger: 1, fret: 2, fromString: 1, toString: 3 }]],
    ['lower intermediate sounding string', [{ finger: 1, fret: 1, fromString: 1, toString: 3 }], r => {
        const n = r.notes.find(n => n.string === 2); n.fret = 0; n.interval = 10; n.finger = null;
    }],
    ['in-range claim inconsistent with notes', [{ finger: 2, fret: 3, fromString: 4, toString: 5 }]],
    ['single-string claim', [{ finger: 1, fret: 1, fromString: 1, toString: 1 }]],
    ['missing muted endpoint', [{ finger: 1, fret: 1, fromString: 1, toString: 6 }]],
    ['same finger at higher intermediate fret', [{ finger: 1, fret: 1, fromString: 1, toString: 3 }], r => r.notes.find(n => n.string === 2).finger = 1],
    ['thumb is not an owner barre', [{ finger: 'T', fret: 1, fromString: 1, toString: 3 }]],
    ['null claim', [null]]
]) test('P2-2 rejects ' + name, () => {
    const r = barreFixture({ barres, changeNotes }).adapter.resolve(query('C#'));
    assert.equal(r.display.possible, false); assert.equal(r.form, null);
    assert.deepEqual(r.display.reasons, ['invalid-owner-barres']); assert(!r.performance.voicingUsable);
});
for (const [name, symbol, shape, extra] of [
    ['normal barre with higher intermediate finger', 'C#', 'C', {}],
    ['owner mini barre', 'CM7', 'E', {}],
    ['capo relative barre', 'D#', 'C', { capo: 2 }],
    ['open string outside mini barre', 'Dm7', 'D', {}],
    ['no barre', 'C', 'C', {}]
]) test('P2-2 preserves ' + name, () => {
    const f = barreFixture({ shape }), r = complete(f, symbol, extra);
    assert(r.display.possible && r.performance.voicingUsable, JSON.stringify(r));
    const raw = f.options.caged.getForm(shape, r.request.quality, r.request.formRootPc, 13, 0);
    const expected = clone(f.options.caged.detectBarres(raw.notes)).map(b => ({ ...b, relativeFret: b.fret, absoluteFret: (extra.capo || 0) + b.fret }));
    assert.deepEqual(r.form.barres, expected);
    if (name === 'no barre') assert.equal(r.form.barres.length, 0); else assert(r.form.barres.length > 0);
    if (name.includes('higher intermediate')) assert(r.form.notes.some(n => n.string === 2 && n.relativeFret === 2 && n.finger === 2));
    if (name.includes('open string')) assert(r.form.notes.some(n => n.string === 4 && n.relativeFret === 0));
});
test('P2-2 compares owner numeric finger representations without changing the response', () => {
    const f = barreFixture({ barres: [{ finger: '1', fret: 1, fromString: 1, toString: 3 }] });
    const r = complete(f, 'C#'); assert(r.performance.voicingUsable); assert.equal(r.form.barres[0].finger, '1');
});
test('P2-2 keeps muted and omitted intermediate strings distinct', () => {
    const muted = barreFixture({ changeNotes(r) { r.notes = r.notes.filter(n => n.string !== 2); r.mutedStrings.push(2); } }).adapter.resolve(query('C#'));
    assert(muted.display.possible); assert(muted.form.mutedStrings.includes(2)); assert(!muted.form.unknownStrings.includes(2));
    const omitted = barreFixture({ changeNotes(r) { r.notes = r.notes.filter(n => n.string !== 2); r.hasOutOfRangeNotes = true; r.omittedNoteCount = 1; } }).adapter.resolve(query('C#'));
    assert(omitted.display.possible); assert(omitted.form.unknownStrings.includes(2)); assert(!omitted.form.mutedStrings.includes(2));
    assert(!omitted.completeness.complete && !omitted.performance.voicingUsable);
});
test('P2-2 released owner catalogue retains every available full-range diagram', () => {
    const f = fixture(), names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    let checked = 0, barreCount = 0;
    for (const quality of ['maj', 'm', '7', 'maj7', 'm7', '6', 'm6', 'sus4']) for (const shape of f.options.caged.SHAPE_ORDER) {
        const a = createChordFormAdapter({ ...f.options, caged: { ...f.options.caged, getCommonForm: () => ({ shape, source: 'recommended' }) } });
        for (const name of names) {
            const symbol = name + f.options.chordTheory.QUALITIES[quality].symbolSuffix;
            const r = a.resolve(query(symbol, { generation: { minRelativeFret: 0, maxRelativeFret: 24 } }));
            assert(r.display.possible, symbol + '/' + shape + ': ' + JSON.stringify(r.display));
            checked++; barreCount += r.form.barres.length;
        }
    }
    assert.equal(checked, 480); assert.equal(barreCount, 259);
});

// Independent concert-pitch expectations, not computed from adapter output.
const slashCases = [
    { symbol: 'C/E', capo: 0, playedStrings: [1, 2, 3, 4], midi: [52, 55, 60, 64], pcs: [0, 4, 7], bass: 52 },
    { symbol: 'C/G', capo: 0, playedStrings: [1, 2, 3], midi: [55, 60, 64], pcs: [0, 4, 7], bass: 55 },
    { symbol: 'D/F#', capo: 2, playedStrings: [1, 2, 3, 4], midi: [54, 57, 62, 66], pcs: [2, 6, 9], bass: 54 }
];
for (const c of slashCases) test('P2-1 explicit voicing resolves ' + c.symbol + ' capo ' + c.capo, () => {
    const r = fixture().adapter.resolve(query(c.symbol, c));
    assert(r.display.possible); assert.equal(r.completeness.complete, false);
    assert.deepEqual(r.completeness.reasons, ['slash-bass-unresolved']);
    const played = r.form.notes.filter(n => c.playedStrings.includes(n.string));
    assert.deepEqual(played.map(n => n.soundingMidi).sort((a, b) => a - b), c.midi);
    assert.deepEqual([...new Set(played.map(n => n.pitchClass))].sort((a, b) => a - b), c.pcs);
    assert.equal(Math.min(...played.map(n => n.soundingMidi)), c.bass);
    assert(r.performance.voicingUsable); assert.deepEqual(r.performance.reasons, []);
    assert.equal(r.performance.scope, 'voicing-only'); assert.equal(r.provenance.adoption, 'unconfirmed');
    assert.equal(CHORD_FORM_ADAPTER_VERSION, '2'); assert.equal(r.provenance.adapterVersion, '2');
});
for (const [symbol, playedStrings, reason] of [
    ['C/E', null, 'played-strings-unconfirmed'], ['C/E', [1, 2, 3, 4, 6], 'played-string-not-in-form'],
    ['C/E', [1, 2, 3, 4, 5], 'played-bass-mismatch'], ['C/G', [1, 2], 'played-tones-incomplete'],
    ['Am7/G', [1, 2, 3], 'played-tones-incomplete']
]) test('P2-1 explicit voicing rejects ' + symbol + ' ' + JSON.stringify(playedStrings), () => {
    const r = fixture().adapter.resolve(query(symbol, { playedStrings }));
    assert(r.display.possible); assert(!r.performance.voicingUsable); assert(r.performance.reasons.includes(reason));
});
test('P2-1 root bass is also rechecked from explicit strings, never changes full-form completeness', () => {
    // A structurally valid owner C form with an additional low open E: the explicit
    // 1–5 string voicing is C/E/G, with low C48. No recommendation is generated here.
    const a = altered(r => { r.notes.push({ string: 6, fret: 0, interval: 4, finger: null, fingeringWarning: false }); r.mutedStrings = []; });
    const r = a.resolve(query('C', { playedStrings: [1, 2, 3, 4, 5] }));
    assert(r.display.possible); assert.deepEqual(r.completeness.reasons, ['root-bass-unresolved']);
    assert.equal(r.completeness.complete, false); assert(r.performance.voicingUsable);
    assert.deepEqual(r.form.notes.filter(n => r.request.playedStrings.includes(n.string)).map(n => n.soundingMidi).sort((a, b) => a - b), [48, 52, 55, 60, 64]);
});
test('P2-1 a valid played subset cannot rescue an owner partial form', () => {
    const r = fixture().adapter.resolve(query('C/E', { playedStrings: [1, 2, 3, 4], generation: { minRelativeFret: 0, maxRelativeFret: 2 } }));
    assert(r.display.possible); assert.deepEqual(r.form.notes.map(n => n.soundingMidi).sort((a, b) => a - b), [52, 55, 60, 64]);
    assert(!r.performance.voicingUsable); assert(r.performance.reasons.includes('owner-partial-form'));
});
for (const [name, mutate, reason] of [
    ['unconfirmed omission', r => { delete r.hasOutOfRangeNotes; delete r.omittedNoteCount; delete r.outOfRangeNotes; }, 'owner-completeness-unconfirmed'],
    ['unknown unused string', r => { r.notes = r.notes.filter(n => n.string !== 5); }, 'string-states-unconfirmed'],
    ['required tone missing', r => { r.notes = r.notes.filter(n => n.string !== 3); r.mutedStrings.push(3); }, 'missing-required-tones'],
    ['unintended unused tone', r => { const n = r.notes.find(n => n.string === 5); n.fret = 4; n.interval = 1; }, 'unintended-tones']
]) test('P2-1 shared rejection remains: ' + name, () => {
    const r = altered(mutate).resolve(query('C/E', { playedStrings: [1, 2, 3, 4] }));
    assert(r.display.possible); assert(r.completeness.reasons.includes(reason)); assert(!r.performance.voicingUsable); assert(r.performance.reasons.includes(reason));
});
for (const symbol of ['C6', 'Am6']) test('P2-1 sixth overlay absence is still a shared rejection: ' + symbol, () => {
    const r = fixture().adapter.resolve(query(symbol, { playedStrings: [1, 2, 3, 4] }));
    assert(r.display.possible); assert(!r.performance.voicingUsable); assert(r.performance.reasons.includes('sixth-overlay-unresolved'));
});
for (const used of [true, false]) test('P2-1 fingering warning applies only to played notes: ' + used, () => {
    const r = altered(r => r.notes.find(n => n.string === (used ? 4 : 5)).fingeringWarning = true)
        .resolve(query('C/E', { playedStrings: [1, 2, 3, 4] }));
    assert(r.display.possible); assert.equal(r.performance.voicingUsable, !used);
    assert.equal(r.form.notes.find(n => n.string === (used ? 4 : 5)).fingeringWarning, true);
    assert.equal(r.performance.reasons.includes('playability-unconfirmed'), used);
});
for (const [name, mutate] of [
    ['global warning', r => { r.warning = 'Unused string warning: applicability is not inferred'; }],
    ['limited', r => { r.playability = 'limited'; }], ['unknown', r => { delete r.playability; }]
]) test('P2-1 global warning/playability cannot be waived: ' + name, () => {
    const r = altered(r => { r.notes.find(n => n.string === 5).fingeringWarning = true; mutate(r); })
        .resolve(query('C/E', { playedStrings: [1, 2, 3, 4] }));
    assert(r.display.possible); assert(!r.performance.voicingUsable); assert(r.performance.reasons.includes('playability-unconfirmed'));
});
test('P2-1 unknown finger alone retains usable voicing and unconfirmed fingering information', () => {
    const r = altered(r => { r.notes.forEach(n => n.finger = null); r.fingeringStatus = 'undefined'; })
        .resolve(query('C/E', { playedStrings: [1, 2, 3, 4] }));
    assert(r.performance.voicingUsable); assert.equal(r.form.fingeringStatus, 'undefined'); assert(r.form.notes.every(n => n.finger === null));
});
test('P2-1 valid result cannot leak into the next invalid request or mutate prior frozen data', () => {
    const a = fixture().adapter, good = a.resolve(query('C/E', { playedStrings: [1, 2, 3, 4] })), before = JSON.stringify(good);
    assert(good.performance.voicingUsable);
    for (const [extra, display] of [[{ capo: -1 }, false], [{ generation: { minRelativeFret: 0, maxRelativeFret: 25 } }, false], [{ playedStrings: [6] }, true]]) {
        const bad = a.resolve(query('C/E', extra)); assert(!bad.performance.voicingUsable); assert.equal(bad.display.possible, display); assert.notEqual(bad, good);
    }
    assert.equal(JSON.stringify(good), before); assert(Object.isFrozen(good.form.notes[0]));
});
test('P2-1 new voicing path still rejects pitch contradiction and invalid owner barre', () => {
    const mismatch = altered(r => r.notes.find(n => n.string === 5).interval = 1)
        .resolve(query('C/E', { playedStrings: [1, 2, 3, 4] }));
    assert(!mismatch.display.possible); assert.deepEqual(mismatch.display.reasons, ['owner-pitch-mismatch']);
    const bad = altered(() => {}, { detectBarres: () => [{ finger: 1, fret: 1, fromString: 6, toString: 1 }] })
        .resolve(query('C/E', { playedStrings: [1, 2, 3, 4] }));
    assert(!bad.display.possible); assert.deepEqual(bad.display.reasons, ['invalid-owner-barres']);
});
test('P2-1 data guards reject getters/toJSON/invalid numbers without invoking ordinary data hooks', () => {
    let invoked = 0;
    const a = fixture().adapter;
    const getter = query('C/E', { playedStrings: [1, 2, 3, 4] });
    Object.defineProperty(getter, 'capo', { enumerable: true, get() { invoked++; return 0; } });
    const json = query('C/E', { playedStrings: [1, 2, 3, 4], toJSON() { invoked++; return {}; } });
    for (const input of [getter, json, query('C/E', { capo: NaN }), query('C/E', { maxAbsoluteFret: Infinity })]) {
        const r = a.resolve(input); assert(!r.display.possible && !r.performance.voicingUsable);
    }
    const ownerGetter = altered(r => Object.defineProperty(r, 'notes', { enumerable: true, get() { invoked++; return []; } }));
    const ownerJson = altered(r => r.toJSON = () => { invoked++; return {}; });
    for (const adapter of [ownerGetter, ownerJson]) assert(!adapter.resolve(query('C/E', { playedStrings: [1, 2, 3, 4] })).display.possible);
    assert.equal(invoked, 0);
});
