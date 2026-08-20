'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
global.window = { ChordCruise: {} };
require(path.join(root, 'js/core/music-theory.js'));
require(path.join(root, 'js/core/caged-forms.js'));

var caged = window.ChordCruise.caged;
var partial = caged.getForm('G', 'm', 7, 13, 0);
assert.strictEqual(partial.available, true, 'partial CAGED form remains available');
assert.strictEqual(partial.hasOutOfRangeNotes, true, 'partial CAGED form reports omitted notes');
assert(Array.isArray(partial.outOfRangeNotes) && partial.outOfRangeNotes.length > 0, 'omitted slot details are retained');
assert.strictEqual(partial.omittedNoteCount, partial.outOfRangeNotes.length, 'omitted count matches slot details');
partial.outOfRangeNotes.forEach(function (note) {
    assert(Number.isInteger(note.string) && note.string >= 1 && note.string <= 6, 'omitted note retains its string');
    assert(Number.isInteger(note.fret), 'omitted note retains its fret');
    assert(Number.isInteger(note.note) && note.note >= 0 && note.note <= 11, 'omitted note retains its pitch class');
    assert(Number.isInteger(note.interval), 'omitted note retains its interval');
    assert(note.fret < 0 || note.fret > 13, 'omitted note is outside the requested viewport');
});

var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
assert(exploreSource.includes('function outOfRangeNoticeText'), 'Explore formats concrete range warnings');
assert(exploreSource.includes('chordSpelledNoteNames(chord)'), 'range warnings use the existing spelling engine');
assert(exploreSource.includes('form.outOfRangeNotes'), 'Explore receives omitted slot details from CAGED');
assert(!exploreSource.includes('このフォームには表示範囲外の音があるため、表示できる音だけを表示しています。'), 'generic range wording is replaced');

console.log('caged-out-of-range-notes: omitted slots retain string/fret/pitch/interval and Explore uses spelled details OK');
