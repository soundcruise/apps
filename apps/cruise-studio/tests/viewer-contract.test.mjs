import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {createUITestProject} from '../scripts/create-ui-test-project.mjs';
import {createStudioViewerContract, normalizeViewerPresentation} from '../js/modules/sheet-cruise/viewer-contract.mjs';
import {MAX_FILE_BYTES, MAX_PRESENTATION_BYTES} from '../../score-viewer/core/file-format.mjs';
import {canonicalJSON} from '../../score-viewer/core/json.mjs';
import {buildSongPreviewPlan, fillBlankStrums} from '../js/modules/sheet-cruise/score-playback.mjs';

const require = createRequire(import.meta.url), realm = {window:{CruiseStudio:{},ChordCruise:{},crypto:webcrypto},TextEncoder};
for (const f of ['music-theory.js','song-model.js']) vm.runInNewContext(readFileSync(new URL('../js/core/' + f, import.meta.url), 'utf8'), realm);
vm.runInNewContext(readFileSync(new URL('../../chord-cruise/js/core/music-theory.js',import.meta.url),'utf8'),realm);
const C = realm.window.CruiseStudio; C.rhythmSnapshots = require('../js/core/rhythm-snapshot.js'); C.schema2 = require('../js/core/schema2.js'); C.model.configureSchema2();
const schema = C.model.schema2, contract = createStudioViewerContract({schema,crypto:webcrypto});
const source = createUITestProject(), clone = value => JSON.parse(JSON.stringify(value));
const metadata = () => ({documentId:'viewer-document-1',revisionId:'revision-1',exportedAt:'2026-11-16T00:00:00.000Z',studioVersion:'0.144.0-dev.1'});
const exported = () => contract.codec.encode(source, metadata());
const mutateFile = async edit => { const x = JSON.parse((await exported()).text); edit(x); return JSON.stringify(x); };

test('dedicated file preserves every canonical field/material, non-ASCII text, timing and visual holes', async () => {
    const p = clone(source), b = p.bars[0];
    b.melody[0] = {...b.melody[0],kind:'rest'}; delete b.melody[0].pitch;
    p.extensions = {scoreLayoutV1:{version:1,holes:[{id:'hole-1',sectionId:b.sectionId,beforeBarId:null}],fills:[]}};
    const before = JSON.stringify(p), file = await contract.codec.encode(p, {...metadata(),defaultPresentation:{layout:{formScale:120,artistSize:18},rows:[{barId:'hole-1',columns:4,used:3}]}});
    const result = await contract.codec.decode(new TextEncoder().encode(file.text));
    assert.deepEqual(result.document.score, p); assert.equal(JSON.stringify(p), before);
    assert.equal(result.document.defaultPresentation.layout.formScale, 120);
    assert.deepEqual(result.document.defaultPresentation.rows,[{barId:'hole-1',columns:4,used:3}]);
    assert.equal(result.byteHash,file.byteHash); assert.match(file.byteHash,/^[0-9a-f]{64}$/);
    assert(result.document.requires.includes('layout:scoreLayoutV1'));
    assert(Object.isFrozen(result.document.score.materials.forms[0].snapshot.strings[0]));
    assert.throws(() => result.document.score.songInfo.bpm = 20, TypeError);
    assert.equal(contract.timeline(result.document.score).totalTicks, p.bars.length * 1920);
});
test('canonical musical digest ignores key order; byte hash preserves exact file representation', async () => {
    const a = await exported(), obj = JSON.parse(a.text), reordered = Object.fromEntries(Object.entries(obj.score).reverse());
    obj.score = reordered;
    const b = await contract.codec.decode(JSON.stringify(obj,null,2));
    assert.equal(b.document.source.scoreDigest,a.document.source.scoreDigest); assert.notEqual(b.byteHash,a.byteHash);
    assert.equal(canonicalJSON(reordered),canonicalJSON(source));
});
test('export snapshots synchronously before hash awaits; subsequent editor edits cannot leak in', async () => {
    const p = clone(source), title = p.songInfo.title, pending = contract.codec.encode(p,metadata());
    p.songInfo.title = 'changed during export'; p.materials.forms[0].snapshot.ownerWarning = 'later';
    const file = await pending;
    assert.equal(file.document.score.songInfo.title,title); assert.notEqual(file.document.score.materials.forms[0].snapshot.ownerWarning,'later');
});
for (const [name,edit,error] of [
    ['outer format', x => x.format = 'project', /unsupported-viewer-format/],
    ['future version', x => x.formatVersion = 2, /unsupported-viewer-format/],
    ['account envelope', x => x.account = {token:'not-allowed'}, /unknown-field/],
    ['source session', x => x.source.session = {}, /unknown-field/],
    ['required capability', x => x.requires.push('future-audio'), /unsupported-required-capability/],
    ['omitted capability', x => x.requires = [], /missing-required-capability/],
    ['duplicate capability', x => x.requires.push(x.requires[0]), /unsupported-required-capability/],
    ['source identity', x => x.source.projectId = 'different', /source-project-mismatch/],
    ['digest', x => x.score.songInfo.title = 'tampered', /score-digest-mismatch/],
    ['bad digest', x => x.source.scoreDigest = 'X', /invalid-score-digest/],
    ['bad ID', x => x.revisionId = '', /invalid-document-id/],
    ['invalid date', x => x.source.exportedAt = '2026-02-30T00:00:00.000Z', /invalid-export-time/],
    ['future schema', x => x.score.schemaVersion = 3, /invalid-score/],
    ['missing form material', x => x.score.materials.forms = [], /invalid-score/],
    ['unsupported meter', x => x.score.songInfo.timeSignature = {beats:3,beatUnit:4}, /invalid-score/],
]) test('file rejects ' + name, async () => assert.rejects(contract.codec.decode(await mutateFile(edit)),error));

test('size, malformed JSON, invalid UTF-8 and unsupported input reject before publication', async () => {
    for (const data of ['{', new Uint8Array([0xff]), new Uint8Array(MAX_FILE_BYTES + 1), ' '.repeat(MAX_FILE_BYTES + 1), {}])
        await assert.rejects(contract.codec.decode(data), /invalid-viewer-json|file-budget|unsupported-file-input/);
});
test('serialization hooks, accessors, cycles, sparse arrays and nonfinite values never serialize', async () => {
    let calls = 0;
    const getter = clone(source); Object.defineProperty(getter.songInfo,'title',{enumerable:true,get() { calls++; return 'bad'; }});
    const hook = clone(source); hook.toJSON = () => { calls++; return source; };
    const cycle = clone(source); cycle.extensions = cycle;
    const sparse = clone(source); sparse.bars = new Array(2);
    const nan = clone(source); nan.songInfo.bpm = NaN;
    for (const p of [getter,hook,cycle,sparse,nan]) await assert.rejects(contract.codec.encode(p,metadata()));
    assert.equal(calls,0);
});
test('optional appearance is allowlisted and warned; invalid anchors/required presentation versions reject', async () => {
    const p = {...metadata(),defaultPresentation:{layout:{formScale:999,appearance:{text:{title:{font:'https://bad.invalid/font',color:'url(bad)'}}}}}};
    const file = await contract.codec.encode(source,p);
    assert.equal(file.document.defaultPresentation.layout.formScale,140);
    assert.equal(file.document.defaultPresentation.layout.appearance.text.title.font,'default');
    assert.equal(file.document.defaultPresentation.layout.appearance.text.title.color,'');
    assert(file.warnings.includes('presentation-normalized'));
    for (const value of [{version:2},{rows:[{barId:'absent',columns:4,used:3}]},{rows:[{barId:source.bars[0].id,columns:9,used:3}]},{zoom:0}])
        await assert.rejects(contract.codec.encode(source,{...metadata(),defaultPresentation:value}));
    await assert.rejects(contract.codec.encode(source,{...metadata(),defaultPresentation:{layout:{padding:'x'.repeat(MAX_PRESENTATION_BYTES)}}}), /presentation-budget/);
});
test('reference acoustic projection equals the editor plan for all registered strings and exact melody timing', () => {
    const before = JSON.stringify(source), expected = buildSongPreviewPlan(source, {pitchMidi:schema.pitchMidi,fillBlankStrums,parseChord:() => null,qualities:{},
        rhythm(p,index) { const binding = p.performance.barRhythms.find(b => b.barId === p.bars[index].id), m = p.materials.rhythms.find(m => m.id === (binding?.materialId || p.performance.basicRhythmId)); return {...m.snapshot,encoding:m.encoding}; }});
    const actual = contract.playbackPlan(source); assert.deepEqual(actual,expected);
    assert(actual.events.some(e => e.part === 'guitar' && e.stroke === 'down'));
    assert(actual.events.some(e => e.part === 'guitar' && e.stroke === 'up'));
    assert(actual.events.some(e => e.part === 'piano')); assert.equal(JSON.stringify(source),before);
    const slow = contract.playbackPlan(source,{bpm:50});
    assert.equal(slow.spans.at(-1).end,actual.spans.at(-1).end * 2);
    assert.equal(slow.events.find(e => e.part === 'piano').midi,actual.events.find(e => e.part === 'piano').midi);
    assert.equal(JSON.stringify(source),before);
});
test('unbound chords never silently become reference harmony', async () => {
    const p = clone(source); p.performance.formBindings = []; p.materials.forms = [];
    const file = await contract.codec.encode(p,metadata()), plan = contract.playbackPlan(file.document.score);
    assert(file.warnings.includes('unbound-form:no-automatic-voicing')); assert(!plan.events.some(e => e.part === 'guitar'));
    assert(plan.events.some(e => e.part === 'piano'));
});
test('native rhythm snapshots roundtrip without owner/network dependencies and use canonical playback projection', async () => {
    const p = clone(source), native = JSON.parse(readFileSync(new URL('./fixtures/rhythm-snapshots-v1.json',import.meta.url))).materials[0];
    p.materials.rhythms.push(native); p.performance.basicRhythmId = native.id; p.performance.barRhythms = [];
    const before = JSON.stringify(p), file = await contract.codec.encode(p,metadata());
    assert(file.document.requires.includes('rhythm:rhythm-owner-cells-v1')); assert.deepEqual(file.document.score,p);
    const plan = contract.playbackPlan(file.document.score); assert(plan.events.some(e => e.part === 'guitar'));
    assert.equal(JSON.stringify(p),before);
});
test('reader exposes only immutable data/presentation, not session/storage writes; failed/stale imports preserve current', async () => {
    let playing = false;
    const reader = contract.createReader({playbackState:() => playing ? 'playing' : 'paused'}), file = await exported();
    const initial = await reader.open(file.text), before = JSON.stringify(initial.document);
    assert(!('commit' in reader || 'getSession' in reader || 'undo' in reader));
    reader.setPresentation({layout:{lyricsSize:22},zoom:1.2});
    assert.equal(reader.read().presentation.layout.lyricsSize,22); assert.equal(JSON.stringify(reader.read().document),before);
    await assert.rejects(reader.open('{')); assert.equal(JSON.stringify(reader.read().document),before);
    playing = true; await assert.rejects(reader.open(file.text),/stop-before-replacing-score/); playing = false;
    const older = reader.open(file.text), newer = reader.open(file.text);
    const results = await Promise.allSettled([older,newer]); assert.equal(results[0].status,'rejected'); assert.equal(results[1].status,'fulfilled');
    const pending = reader.open(file.text); playing = true;
    await assert.rejects(pending,/stop-before-replacing-score/); assert.equal(JSON.stringify(reader.read().document),before);
    reader.dispose(); assert.throws(() => reader.read(),/viewer-disposed/);
});
test('reader render forces readOnly and disables editor slot options, using a frozen score', async () => {
    const reader = contract.createReader(), file = await exported(); await reader.open(file.text);
    let received;
    reader.renderWith({render(score,container,options) { received = {score,container,options}; }},'host',{readOnly:false,editableSlots:true});
    assert.equal(received.options.readOnly,true); assert.equal(received.options.editableSlots,false);
    assert(Object.isFrozen(received.score.bars[0]));
    const invalidStateReader = contract.createReader({playbackState:() => ({status:'playing'})});
    await assert.rejects(invalidStateReader.open(file.text),/stop-before-replacing-score/);
});
test('view preferences and clocks are independent per owner and do not alter export bytes', async () => {
    const file = await exported(), a = contract.createReader(), b = contract.createReader(); await Promise.all([a.open(file.text),b.open(file.text)]);
    a.setPresentation({layout:{lyricsSize:24}}); assert.notEqual(a.read().presentation.layout.lyricsSize,b.read().presentation.layout.lyricsSize);
    let now = 0; const clock = contract.createClock(a.read().document.score,{now:() => now}); clock.play(); now = 1; clock.setTempo(60);
    assert.equal(a.read().document.score.songInfo.bpm,100); assert.equal(a.read().byteHash,file.byteHash);
    assert.equal(normalizeViewerPresentation({},source).value.layout.formScale,100);
});
test('optional future presentation fields are discarded with a diagnostic, never carried as executable styling', async () => {
    const file = await contract.codec.encode(source,{...metadata(),defaultPresentation:{futureStyle:'url(unknown)'}});
    assert(file.warnings.includes('presentation-normalized')); assert(!('futureStyle' in file.document.defaultPresentation));
});
test('2048 real bars with registered forms/text/melody fit the file contract and roundtrip without truncation', async () => {
    const p = clone(source), b = source.bars[0], binding = source.performance.formBindings.find(f => f.chordEventId === b.chords[0].id);
    p.notation.lineBreakAfter = []; p.performance.barRhythms = []; p.performance.formBindings = [];
    p.bars = Array.from({length:2048},(_,i) => {
        const id = 'long-'+i, chord = {...clone(b.chords[0]),id:id+'-chord'};
        p.performance.formBindings.push({...clone(binding),id:id+'-binding',chordEventId:chord.id});
        return {id,sectionId:b.sectionId,chords:[chord],melody:[{...clone(b.melody[0]),id:id+'-note'}],lyrics:[{...clone(b.lyrics[0]),id:id+'-lyric'}]};
    });
    const file = await contract.codec.encode(p,metadata()), decoded = await contract.codec.decode(file.text);
    assert.equal(decoded.document.score.bars.length,2048); assert.equal(decoded.document.score.performance.formBindings.length,2048);
    assert.equal(contract.timeline(decoded.document.score).totalTicks,2048 * 1920); assert(file.byteLength < MAX_FILE_BYTES);
    assert.deepEqual(decoded.document.score,p);
});
