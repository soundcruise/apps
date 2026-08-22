'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
var saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
var standardHtml = fs.readFileSync(path.join(root, 'standard/index.html'), 'utf8');
var proHtml = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');

function assertOrder(source, ids, label) {
    var previous = -1;
    ids.forEach(function (id) {
        var position = source.indexOf(id);
        assert(position !== -1, label + ' includes ' + id);
        assert(position > previous, label + ' orders ' + ids.join(' → '));
        previous = position;
    });
}

assertOrder(exploreSource, ['id="cc-fbmode-finger"', 'id="cc-fbmode-note"', 'id="cc-fbmode-solfege"', 'id="cc-fbmode-degree"'], 'Explore');
assertOrder(saveEditorSource, ['id="cc-savemode-finger"', 'id="cc-savemode-note"', 'id="cc-savemode-solfege"', 'id="cc-savemode-degree"'], 'save editor');
assertOrder(librarySource, ['id="cc-libmode-finger"', 'id="cc-libmode-note"', 'id="cc-libmode-solfege"', 'id="cc-libmode-degree"'], 'library detail');
assert(librarySource.includes("['finger', 'note', 'solfege', 'degree'].forEach(function (value)"), 'library display settings generate the unified mode order');
assertOrder(standardHtml, ['data-preview-display-mode="finger"', 'data-preview-display-mode="note"', 'data-preview-display-mode="solfege"', 'data-preview-display-mode="degree"'], 'Standard settings preview');
assertOrder(proHtml, ['data-preview-display-mode="finger"', 'data-preview-display-mode="note"', 'data-preview-display-mode="solfege"', 'data-preview-display-mode="degree"'], 'Pro settings preview');

console.log('display-mode-order: Explore, save editor, library, and Standard/Pro settings use 運指 → CDE → ドレミ → 度数 OK');
