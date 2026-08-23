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
var keys = ['red', 'orange', 'yellow', 'green', 'blue', 'pink'];
var folder = storage.createFolder('ポップカラー');

keys.forEach(function (key) {
    assert(storage.FOLDER_COLOR_KEYS.indexOf(key) !== -1, key + ' is an allowed stored folder color');
    assert.strictEqual(storage.setFolderColor(folder.id, key), true, key + ' saves as a folder color');
    var reloaded = storage.loadOrderedFolders().filter(function (item) { return item.id === folder.id; })[0];
    assert.strictEqual(reloaded.colorKey, key, key + ' survives folder reload');
    assert(librarySource.includes("['" + key + "', '"), key + ' is present in the folder color picker');
    assert(themeSource.includes('.cc-folder-color-' + key), key + ' has a shelf and picker CSS color rule');
});

console.log('folder-color-options: six pop book colors validate, persist, and have picker/shelf styling OK');
