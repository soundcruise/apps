'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
var themeSource = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');

assert(librarySource.includes('cc-chord-card-wrap'), 'normal code cards use a wrapper so the menu button is not nested in the card button');
assert(librarySource.includes('data-chord-manage-id'), 'normal code cards expose a dedicated management-menu trigger');
assert(librarySource.includes("sorting\n                ? cardHtml"), 'sorting cards omit the normal-card menu wrapper');
assert(librarySource.includes("event.target.closest('[data-chord-manage-id]')"), 'the grid delegates menu clicks separately from card clicks');
assert(librarySource.includes('event.stopPropagation();'), 'menu clicks cannot open the card detail view');

assert(librarySource.includes('data-chord-manage-action="view">コードを見る'), 'the menu starts with a view-code action');
assert(librarySource.includes("if (action === 'view')"), 'the view-code action has a dedicated handler');
assert(librarySource.includes('openDetailFromList(chordId);'), 'the view-code action reuses the same list-to-detail navigation as a card click');
assert(librarySource.includes('function chordCopyRecord(chord, folderId)'), 'code copies use a dedicated record-copy helper');
['id', 'createdAt', 'updatedAt', 'schemaVersion'].forEach(function (key) {
    assert(librarySource.includes('delete copy.' + key + ';'), key + ' is regenerated for code copies');
});
assert(librarySource.includes('return storage().saveChord(chordCopyRecord(chord, folderId));'), 'copies use the existing saveChord transaction and its edition limits');
assert(librarySource.includes('return folder.id !== chord.folderId;'), 'the destination picker excludes the current folder');

assert(librarySource.includes('window.ChordCruise.ui.saveEditor.openExisting({'), 'menu edit opens the existing save editor directly');
assert(librarySource.includes("data-chord-manage-action=\"delete\""), 'the menu includes a delete action');
assert(librarySource.includes("confirmDanger('「' + displayChordName(chord.chordName)"), 'deletion requires the existing danger confirmation');
assert(librarySource.includes('storage().deleteChord(chord.id)'), 'confirmed deletion uses the existing storage delete transaction');

assert(themeSource.includes('.cc-chord-card-menu'), 'the code-card menu has dedicated styling');
assert(themeSource.includes('.cc-chord-card-wrap .cc-chordthumb-card'), 'the card reserves bottom space for the separate menu button');

console.log('chord-card-menu: card actions are separated from navigation and reuse existing save/delete transactions OK');
