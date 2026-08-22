'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var source = fs.readFileSync(path.join(__dirname, '..', 'js/ui/save-editor.js'), 'utf8');
var stepRangeSource = source.slice(source.indexOf('function stepRange'), source.indexOf('function noteIncluded'));
var minimumOpenSaveRangeSource = source.slice(source.indexOf('function minimumOpenSaveRange'), source.indexOf('function notesWithSixthCandidates'));

function createStepper(draft) {
    return new Function('context',
        'var draft = context.draft;\n' +
        'var renderPreview = function () {};\n' +
        'var renderRange = function () {};\n' +
        stepRangeSource + '\nreturn stepRange;'
    )({ draft: draft });
}

var standardDraft = {
    startFret: 0,
    endFret: 13,
    formRange: { min: 0, max: 3 },
    range: { min: 0, max: 3, includesOpen: true }
};
var standardStepRange = createStepper(standardDraft);
standardStepRange('max', 1);
assert.strictEqual(standardDraft.range.max, 4, 'a 0–3F open form can expand to 4F even without another chord tone');
for (var fret = 5; fret <= 13; fret++) standardStepRange('max', 1);
assert.strictEqual(standardDraft.range.max, 13, 'normal-fret save range can expand through the full 0–13F display domain');

var lowerDraft = {
    startFret: 0,
    endFret: 13,
    formRange: { min: 3, max: 5 },
    range: { min: 3, max: 5, includesOpen: false }
};
var lowerStepRange = createStepper(lowerDraft);
lowerStepRange('min', -1);
assert.strictEqual(lowerDraft.range.min, 2, 'a fretted form can expand its lower bound below its original note range');

var highDraft = {
    startFret: 12,
    endFret: 25,
    formRange: { min: 12, max: 15 },
    range: { min: 12, max: 15, includesOpen: false }
};
var highStepRange = createStepper(highDraft);
for (var highFret = 16; highFret <= 25; highFret++) highStepRange('max', 1);
assert.strictEqual(highDraft.range.max, 25, 'high-fret save range can expand through the full 12–25F display domain');

var minimumOpenSaveRange = new Function(minimumOpenSaveRangeSource + '\nreturn minimumOpenSaveRange;')();
assert.deepStrictEqual(minimumOpenSaveRange({ min: 0, max: 2, includesOpen: true }), { min: 0, max: 3, includesOpen: true }, 'automatic open-string ranges reserve 0–3F for readable diagrams');
assert.deepStrictEqual(minimumOpenSaveRange({ min: 0, max: 5, includesOpen: true }), { min: 0, max: 5, includesOpen: true }, 'automatic open-string ranges above 3F remain unchanged');
assert.deepStrictEqual(minimumOpenSaveRange({ min: 3, max: 5, includesOpen: false }), { min: 3, max: 5, includesOpen: false }, 'fretted automatic ranges remain unchanged');

console.log('save-range-expansion: initial FORM range stays intact while manual bounds expand within the current display domain OK');
