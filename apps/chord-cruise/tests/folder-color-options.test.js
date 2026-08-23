'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

function createLocalStorage() {
    var values = {};
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) { values[key] = String(value); },
        removeItem: function (key) { delete values[key]; }
    };
}

global.window = {
    ChordCruise: {},
    localStorage: createLocalStorage(),
    document: { documentElement: { dataset: {} } }
};
require('../js/core/storage.js');

var root = path.join(__dirname, '..');
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
var themeSource = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
var storage = window.ChordCruise.storage;
var keys = ['pastel-pink', 'pastel-blue', 'pastel-purple', 'pastel-green', 'pastel-yellow', 'pastel-orange'];
var folder = storage.createFolder('パステルカラー');

keys.forEach(function (key) {
    assert(storage.FOLDER_COLOR_KEYS.indexOf(key) !== -1, key + ' is an allowed stored folder color');
    assert.strictEqual(storage.setFolderColor(folder.id, key), true, key + ' saves as a folder color');
    var reloaded = storage.loadOrderedFolders().filter(function (item) { return item.id === folder.id; })[0];
    assert.strictEqual(reloaded.colorKey, key, key + ' survives folder reload');
    assert(librarySource.includes("['" + key + "', '"), key + ' is present in the folder color picker');
    assert(themeSource.includes('.cc-folder-color-' + key), key + ' has a shelf and picker CSS color rule');
});

['クラシック', 'パステル'].forEach(function (label) {
    assert(librarySource.includes("label: '" + label + "'"), label + ' category is present in the picker');
});
assert(librarySource.includes('cc-folder-color-categories'), 'picker groups color choices by category');
assert(themeSource.includes('.cc-folder-color-category-title'), 'category titles have dedicated picker styling');

console.log('folder-color-options: pastel book colors validate, persist, and render in classic/pastel picker categories OK');
