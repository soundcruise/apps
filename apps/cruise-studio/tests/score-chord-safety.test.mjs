import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../js/core/editing-session.js');
const R = require('../js/core/project-repository.js');
const T = require('../js/modules/sheet-cruise/text-adapter.js');
const O = require('../js/modules/sheet-cruise/operation-adapter.js');
const realm = {window: {CruiseStudio: {}, ChordCruise: {}, crypto: webcrypto}, TextEncoder};
for (const file of ['core/music-theory.js', 'core/song-model.js', 'core/storage.js'])
    vm.runInNewContext(readFileSync(new URL('../js/' + file, import.meta.url), 'utf8'), realm);
vm.runInNewContext(readFileSync(new URL('../../chord-cruise/js/core/music-theory.js', import.meta.url), 'utf8'), realm);
const C = realm.window.CruiseStudio;
C.schema2 = require('../js/core/schema2.js');
C.model.configureSchema2();
const clone = x => JSON.parse(JSON.stringify(x));

function fixture({multiple = false, multipleAt = 0, duration = 480, legacy = false} = {}) {
    const p = C.model.createEmptyProject();
    const chord = {id: webcrypto.randomUUID(), onsetTick: 480, symbol: 'C', unresolved: false,
        provenance: {origin: 'user-set'}};
    if (duration !== null) chord.durationTicks = duration;
    p.bars[0].chords = [chord];
    if (multiple) {
        if (multipleAt) p.bars[multipleAt].chords = [{...clone(chord), id: webcrypto.randomUUID()}];
        p.bars[multipleAt].chords.push({...clone(chord), id: webcrypto.randomUUID(), onsetTick: 1440, symbol: 'G'});
    }
    const project = legacy ? clone(C.model.toLegacyView(p)) : clone(p);
    const raw = JSON.stringify(project), values = new Map([['cruiseStudio.project.' + p.projectId, raw]]);
    let writes = 0;
    const storage = {getItem: k => values.get(k) ?? null,
        setItem(k, v) { writes++; values.set(k, v); }, removeItem(k) { writes++; values.delete(k); }};
    const repo = R.createRepository({storage, model: C.model, snapshot: E.snapshot,
        locks: {request: (_name, _options, fn) => fn()}, now: () => p.updatedAt});
    const registry = E.createRegistry({repository: repo, validate: C.model.validateProject});
    const s = registry.getOrCreateSession('structure', {type: 'project', projectId: p.projectId});
    const text = T.create({model: C.model, getSession: () => s});
    const operations = O.create({model: C.model, getSession: () => s});
    return {s, repo, values, raw, text, operations, writes: () => writes,
        edit: value => text.apply({kind: 'chord', barNumber: 1}, value)};
}

test('changing a chord symbol preserves its exact onset, duration and ID', () => {
    const f = fixture(), before = clone(f.s.draft.bars[0].chords[0]);
    assert(f.edit('Dm7').ok);
    const after = f.s.draft.bars[0].chords[0];
    assert.equal(after.symbol, 'Dm7');
    for (const field of ['id', 'onsetTick', 'durationTicks']) assert.equal(after[field], before[field]);
    assert.equal(f.writes(), 0);
    assert.equal(f.s.baseRevision, f.raw);
});

test('an unknown chord duration stays unknown after a symbol edit', () => {
    const f = fixture({duration: null});
    assert(f.edit('Dm7').ok);
    assert.equal(f.s.draft.bars[0].chords[0].onsetTick, 480);
    assert(!Object.hasOwn(f.s.draft.bars[0].chords[0], 'durationTicks'));
});

test('unchanged chord text is a no-op even with partial-bar timing', () => {
    const f = fixture(), before = f.s.workingSnapshot(), version = f.s.snapshotVersion;
    assert(f.edit(' C ').ok);
    assert.deepEqual(f.s.workingSnapshot(), before);
    assert.equal(f.s.snapshotVersion, version);
    assert.equal(f.s.getHistory().entries.length, 0);
});

test('single-value input never collapses a multi-chord bar', () => {
    for (const value of ['Dm7', '']) {
        const f = fixture({multiple: true}), before = f.s.workingSnapshot();
        const result = f.edit(value);
        assert.equal(result.ok, false);
        assert.match(result.error, /複数コード/);
        assert.deepEqual(f.s.workingSnapshot(), before);
        assert.equal(f.s.getHistory().entries.length, 0);
        assert.equal(f.writes(), 0);
    }
});

test('re-entering the first displayed chord retains every chord and Redo', () => {
    const f = fixture({multiple: true});
    assert(f.text.apply({kind: 'song', field: 'title'}, 'Original short song').ok);
    assert(f.s.undo().ok);
    const before = f.s.workingSnapshot(), history = f.s.getHistory();
    assert(f.edit('C').ok);
    assert.deepEqual(f.s.workingSnapshot(), before);
    assert.deepEqual(f.s.getHistory().entries, history.entries);
    assert.equal(f.s.getHistory().cursor, history.cursor);
    assert(f.s.canRedo());
});

test('bulk chord edits reject atomically when any target has multiple chords', () => {
    const f = fixture({multiple: true, multipleAt: 1});
    const before = f.s.workingSnapshot();
    const result = f.operations.execute('bulkChord', {barNumber: 1, values: ['F', 'G']});
    assert.equal(result.ok, false);
    assert.deepEqual(f.s.workingSnapshot(), before);
    assert.equal(f.writes(), 0);
});

test('schema1 editing preserves partial timing without requiring a migration', () => {
    const p = C.model.createLegacyProject();
    p.bars[0].chords = [{tick: 960, symbol: 'C'}];
    C.model.setBarChord(p, 1, 'Dm7', {symbolOnly: true});
    assert.deepEqual(clone(p.bars[0].chords), [{tick: 960, symbol: 'Dm7'}]);
    assert.equal(p.schemaVersion, 1);
});

test('creating and clearing an ordinary one-chord bar retain the existing basic workflow', () => {
    const f = fixture();
    assert(f.edit('').ok);
    assert.equal(f.s.draft.bars[0].chords.length, 0);
    assert(f.edit('F').ok);
    const chord = f.s.draft.bars[0].chords[0];
    assert.equal(chord.onsetTick, 0);
    assert.equal(chord.durationTicks, 1920);
});

test('a CAS conflict never overwrites the new external revision or loses the timed draft', async () => {
    const f = fixture();
    assert(f.edit('Dm7').ok);
    const before = f.s.workingSnapshot(), history = f.s.getHistory();
    const external = clone(f.repo.read(f.s.target).snapshot);
    external.songInfo.title = 'External short original';
    const raw = JSON.stringify(external), key = 'cruiseStudio.project.' + f.s.target.projectId;
    f.values.set(key, raw);
    assert.equal((await f.s.commit()).code, 'conflict');
    assert.deepEqual(f.s.workingSnapshot(), before);
    assert.deepEqual(f.s.getHistory().entries, history.entries);
    assert.equal(f.values.get(key), raw);
    assert.equal(f.s.baseRevision, f.raw);
    assert.equal(f.writes(), 0);
});

test('Undo, explicit save, Redo and reload preserve the chord timing contract', async () => {
    const f = fixture(), before = f.s.workingSnapshot();
    assert(f.edit('Dm7').ok);
    const edited = f.s.workingSnapshot();
    assert((await f.s.commit()).ok);
    assert(!f.s.dirty);
    assert(f.s.undo().ok);
    assert.deepEqual(f.s.draft.bars, before.bars);
    assert(f.s.dirty);
    assert(f.s.redo().ok);
    assert(!f.s.dirty);
    assert.deepEqual(f.repo.read(f.s.target).snapshot.bars, edited.bars);
    const exported = C.storage.exportProjectJson(edited);
    const imported = C.storage.importProjectJson(exported);
    assert(imported.ok);
    assert.deepEqual(clone(imported.project.bars), edited.bars);
});

test('legacy source bytes survive the edit and explicit schema2 save', async () => {
    const f = fixture({legacy: true});
    assert(f.edit('Dm7').ok);
    assert.equal(f.s.draft.bars[0].chords[0].onsetTick, 480);
    assert.equal(f.s.draft.provenance.legacySource.raw, f.raw);
    assert.equal(f.values.get('cruiseStudio.project.' + f.s.target.projectId), f.raw);
    assert((await f.s.commit()).ok);
    assert.equal(f.repo.read(f.s.target).snapshot.provenance.legacySource.raw, f.raw);
});
