'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
var fretboardSource = fs.readFileSync(path.join(root, 'js/ui/fretboard.js'), 'utf8');
var themeSource = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
var theorySource = fs.readFileSync(path.join(root, 'js/core/music-theory.js'), 'utf8');
var chordModelSource = fs.readFileSync(path.join(root, 'js/core/chord-model.js'), 'utf8');

function native(value) {
    return JSON.parse(JSON.stringify(value));
}

function loadDisplayApis() {
    var context = {
        window: {
            ChordCruise: {
                state: { settings: { fretboardDisplayMode: 'note' } },
                caged: { detectBarres: function () { return []; } }
            }
        },
        document: { addEventListener: function () {} },
        console: { warn: function () {} },
        JSON: JSON,
        Math: Math
    };
    vm.createContext(context);
    vm.runInContext(theorySource, context, { filename: 'music-theory.js' });
    vm.runInContext(chordModelSource, context, { filename: 'chord-model.js' });
    vm.runInContext(fretboardSource, context, { filename: 'fretboard.js' });
    vm.runInContext(librarySource, context, { filename: 'library.js' });
    return context.window.ChordCruise;
}

var chord = {
    chordName: 'C',
    formName: 'C型',
    rootPc: 0,
    intervals: [0, 4, 7],
    fretRange: { min: 0, max: 3, includesOpen: true },
    notes: [
        { string: 5, fret: 3, interval: 0, finger: 3, fingeringWarning: false },
        { string: 4, fret: 2, interval: 4, finger: 2, fingeringWarning: false },
        { string: 3, fret: 0, interval: 7, finger: 0, fingeringWarning: false },
        { string: 2, fret: 3, interval: 2, finger: 4, fingeringWarning: false }
    ],
    mutedStrings: []
};
var before = JSON.stringify(chord);
var cruise = loadDisplayApis();
var options = cruise.ui.library.savedDiagramOptions;
var colorDiagram = options(chord, { mode: 'note', monochrome: false });
var monochromeDiagram = options(chord, { mode: 'note', monochrome: true });

assert.deepStrictEqual(
    native(colorDiagram.markers.map(function (marker) { return marker.role; })),
    ['root', 'third', 'fifth', 'non-chord'],
    'the saved diagram derives non-chord color role from notes versus the original intervals'
);
assert.deepStrictEqual(
    native(colorDiagram.markers.map(function (marker) { return marker.label; })),
    ['C', 'E', 'G', 'D'],
    'the added D remains visible with its normal note label'
);
assert.strictEqual(JSON.stringify(chord), before, 'display-role derivation does not add a record field or mutate the saved chord');

var staticSvg = cruise.ui.fretboard.buildStaticSvg(colorDiagram);
var exportSvg = cruise.ui.fretboard.buildExportSvg('C', colorDiagram).svg;
assert.ok(staticSvg.indexOf('cx="227.5" cy="67" r="15" fill="#ffffff"') !== -1, 'library SVG renders the non-chord D as a white marker');
assert.ok(exportSvg.indexOf('cx="227.5" cy="67" r="15" fill="#ffffff"') !== -1, 'PNG source SVG renders the same non-chord D as white');
assert.strictEqual(monochromeDiagram.markers[3].role, 'non-chord', 'the shared semantic role survives monochrome rendering');
assert.ok(fretboardSource.indexOf("if (monochrome) {") < fretboardSource.indexOf("role === 'non-chord'"), 'monochrome palette resolves before the non-chord color and remains unchanged');

var roleSource = saveEditorSource.slice(
    saveEditorSource.indexOf('function roleForInterval'),
    saveEditorSource.indexOf('function validBassPc')
);
var draftRoleFor = new Function('draft', 'theory', roleSource + '\nreturn roleForDraftInterval;')(
    { intervals: [0, 4, 7] },
    function () { return { identifyQuality: function () { return 'maj'; } }; }
);
assert.strictEqual(draftRoleFor(2), 'non-chord', 'the save editor uses the same non-chord interval comparison before saving');
assert.strictEqual(draftRoleFor(4), 'third', 'existing chord-tone roles remain unchanged in the save editor');
assert.ok(themeSource.indexOf('.cc-fb-marker--non-chord { background: #ffffff; color: #141311; }') !== -1, 'interactive fretboard marker uses a white background and dark text');
assert.ok(librarySource.indexOf("return 'non-chord';") !== -1, 'library detail, thumbnails, SVG, and PNG share the non-chord role calculation');

console.log('non-chord-display: editor, library, SVG, PNG, and monochrome role handling OK');
