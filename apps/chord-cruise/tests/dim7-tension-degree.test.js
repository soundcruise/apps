'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = { ChordCruise: { state: { settings: { fretboardDisplayMode: 'degree', degreeNotationFormal: false } } } };
global.document = { addEventListener() {} };
require('../js/core/music-theory.js');
require('../js/core/chord-model.js');
require('../js/core/caged-forms.js');
require('../js/ui/fretboard.js');
require('../js/ui/library.js');

const root = path.resolve(__dirname, '..');
const theory = window.ChordCruise.theory;
const model = window.ChordCruise.chordModel;
const fretboard = window.ChordCruise.ui.fretboard;
const savedDiagramOptions = window.ChordCruise.ui.library.savedDiagramOptions;
const tensions = [13, 14, 15, 17, 18, 20, 21];

function dim7(tensionIntervals) {
    return model.buildCustomChord({
        rootPc: 0, third: 3, fifth: 6, seventh: 9,
        tensions: tensionIntervals, bassPc: null
    }, '');
}

function savedRecord(chord) {
    return {
        chordName: chord.symbol,
        rootPc: 0,
        intervals: chord.intervals.slice(),
        tensionPcs: model.tensionPcsForIntervals(0, chord.tensionIntervals),
        fretRange: { min: 0, max: 13, includesOpen: true },
        notes: [
            { string: 5, fret: 3, interval: 0, finger: 3 },
            { string: 2, fret: 4, interval: 3, finger: 1 },
            { string: 1, fret: 2, interval: 6, finger: 2 },
            { string: 2, fret: 10, interval: 9, finger: 4 }
        ],
        mutedStrings: [6]
    };
}

assert.deepStrictEqual(
    model.semanticDegreeLabels({ qualityKey: 'dim7', intervals: [0, 3, 6, 9], tensionIntervals: [] }),
    ['1', '♭3', '♭5', '♭♭7'],
    'canonical dim7 retains its diminished-seventh spelling'
);

let subsetCount = 0;
for (let mask = 0; mask < 128; mask += 1) {
    const selectedTensions = tensions.filter((_tension, index) => (mask & (1 << index)) !== 0);
    const chord = dim7(selectedTensions);
    const liveLabels = model.semanticDegreeLabels({
        qualityKey: chord.qualityKey,
        intervals: chord.intervals,
        tensionIntervals: chord.tensionIntervals,
        degreeLabels: chord.degreeLabelsList
    });
    const restoredLabels = model.semanticDegreeLabels({
        intervals: chord.intervals,
        tensionIntervals: model.tensionIntervalsForPcs(0, model.tensionPcsForIntervals(0, selectedTensions))
    });
    assert.strictEqual(liveLabels[chord.intervals.indexOf(9)], '♭♭7', 'live subset ' + mask + ' keeps ♭♭7');
    assert.strictEqual(restoredLabels[chord.intervals.indexOf(9)], '♭♭7', 'saved subset ' + mask + ' restores ♭♭7 without qualityKey');
    assert.strictEqual(theory.formatDegreeLabel(restoredLabels[chord.intervals.indexOf(9)], true), 'd7', 'formal subset ' + mask + ' becomes d7');
    const record = savedRecord(chord);
    window.ChordCruise.state.settings.degreeNotationFormal = false;
    let diagram = savedDiagramOptions(record, { mode: 'degree' });
    assert.strictEqual(diagram.markers.find((marker) => marker.string === 2 && marker.fret === 10).label, '♭♭7', 'rendered OFF subset ' + mask + ' keeps ♭♭7');
    window.ChordCruise.state.settings.degreeNotationFormal = true;
    diagram = savedDiagramOptions(record, { mode: 'degree' });
    assert.strictEqual(diagram.markers.find((marker) => marker.string === 2 && marker.fret === 10).label, 'd7', 'rendered ON subset ' + mask + ' keeps d7');
    subsetCount += 1;
}
assert.strictEqual(subsetCount, 128, 'all seven-tension subsets are checked');

[
    [[13], '♭9', 'm9'],
    [[14], '9', 'M9'],
    [[17], '11', 'P11'],
    [[20], '♭13', 'm13']
].forEach(([selectedTensions, legacyTension, formalTension]) => {
    const chord = dim7(selectedTensions);
    const record = savedRecord(chord);
    window.ChordCruise.state.settings.degreeNotationFormal = false;
    let diagram = savedDiagramOptions(record, { mode: 'degree' });
    assert.strictEqual(diagram.markers.find((marker) => marker.string === 2 && marker.fret === 10).label, '♭♭7');
    assert(diagram.markers.some((marker) => marker.isTensionCandidate && marker.label === legacyTension), chord.symbol + ' keeps its tension label');
    window.ChordCruise.state.settings.degreeNotationFormal = true;
    diagram = savedDiagramOptions(record, { mode: 'degree' });
    assert.strictEqual(diagram.markers.find((marker) => marker.string === 2 && marker.fret === 10).label, 'd7');
    assert(diagram.markers.some((marker) => marker.isTensionCandidate && marker.label === formalTension), chord.symbol + ' formats its tension label');
});

const duplicateChord = dim7([15, 18, 21]);
const duplicateRecord = savedRecord(duplicateChord);
const beforeRender = JSON.parse(JSON.stringify(duplicateRecord));
window.ChordCruise.state.settings.degreeNotationFormal = false;
const duplicateDiagram = savedDiagramOptions(duplicateRecord, { mode: 'degree' });
[
    [2, 4, '♭3'],
    [1, 2, '♭5'],
    [2, 10, '♭♭7']
].forEach(([string, fret, expectedLabel]) => {
    const marker = duplicateDiagram.markers.find((candidate) => candidate.string === string && candidate.fret === fret);
    assert(marker, 'duplicate-pitch FORM marker remains visible at ' + string + ':' + fret);
    assert.strictEqual(marker.label, expectedLabel, 'FORM semantic wins at ' + string + ':' + fret);
    assert.strictEqual(marker.isOverlay, undefined, 'FORM marker is not replaced by a tension overlay at ' + string + ':' + fret);
});
['♯9', '♯11', '13'].forEach((label) => {
    assert(duplicateDiagram.markers.some((marker) => marker.isTensionCandidate && marker.label === label), 'independent overlay retains ' + label);
});
assert.deepStrictEqual(duplicateRecord, beforeRender, 'semantic restoration never mutates a saved record');
const staticSvg = fretboard.buildStaticSvg(duplicateDiagram);
assert(staticSvg.includes('♭♭7'), 'static SVG and its PNG source retain the core ♭♭7 label');
assert(staticSvg.includes('♯9') && staticSvg.includes('♯11') && staticSvg.includes('13'), 'static SVG retains duplicate-pitch overlay semantics');
window.ChordCruise.state.settings.degreeNotationFormal = true;
const formalDuplicateDiagram = savedDiagramOptions(duplicateRecord, { mode: 'degree' });
assert.strictEqual(formalDuplicateDiagram.markers.find((marker) => marker.string === 2 && marker.fret === 10).label, 'd7', 'duplicate-pitch core uses d7 in formal mode');
['A9', 'A11', 'M13'].forEach((label) => {
    assert(formalDuplicateDiagram.markers.some((marker) => marker.isTensionCandidate && marker.label === label), 'formal overlay retains ' + label);
});
assert(fretboard.buildStaticSvg(formalDuplicateDiagram).includes('d7'), 'formal static SVG and PNG source retain d7');

Object.keys(theory.QUALITIES).forEach((qualityKey) => {
    const quality = theory.QUALITIES[qualityKey];
    assert.deepStrictEqual(
        model.semanticDegreeLabels({ qualityKey, intervals: quality.intervals, tensionIntervals: [] }),
        quality.degreeLabels,
        qualityKey + ' canonical labels remain unchanged'
    );
});

const exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
const saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
const librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
assert(exploreSource.includes('function chordDegreeLabels(chord)') && exploreSource.includes('var semanticLabels = chordDegreeLabels(chord)'), 'Explore whole/CAGED markers share semantic labels');
assert(saveEditorSource.includes('function draftSemanticDegreeLabels()') && saveEditorSource.includes('var labels = draftSemanticDegreeLabels();'), 'Save Editor preview uses semantic labels');
assert(librarySource.includes('function savedDegreeLabels(chord)') && librarySource.includes('var labels = savedDegreeLabels(chord);'), 'Library list/detail/export use restored semantic labels');
assert(!fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8').includes('semanticDegreeLabels'), 'storage and schema remain unaware of display restoration');

console.log('dim7-tension-degree: canonical, 128 subsets, formal OFF/ON, duplicate pitches, Save/Library/SVG/PNG semantics OK');
