'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var source = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');

assert(source.includes('cc-save-limit-summary'), 'save dialog contains a dedicated limit summary above actions');
assert(source.includes('保存上限'), 'summary has a user-facing heading');
assert(source.includes('フォルダ：'), 'summary reports total folder usage');
assert(source.includes('コード数：'), 'summary reports selected folder usage');
assert(source.includes('function renderSaveLimitSummary'), 'summary is recalculated from current storage state');
assert(source.includes('if (limits.unlimited)'), 'Pro hides the Standard-only summary');
assert(source.includes("href=\"../pro-access.html\""), 'summary keeps the Standard-relative Pro access route');
assert(source.includes("cc-save-folder').addEventListener('change'"), 'changing folders refreshes the summary');
assert(source.includes("select.disabled = folders.length === 0;"), 'an empty folder state disables the save destination selector');
assert(source.includes("保存するにはフォルダを作成してください。"), 'an empty folder state explains how to restore saving');
assert(source.includes("(folders[0] ? folders[0].id : '')"), 'a deleted last-save folder falls back only to an existing folder');

console.log('save-limit-summary: Standard save usage and Pro access link render above save actions, Pro remains hidden');

// Render with the real storage API so counts follow folder/code changes without writes.
var vm = require('vm');
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
var storageSource = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');
var accessSource = fs.readFileSync(path.join(root, 'js/core/feature-access.js'), 'utf8');
function summaryEnvironment(edition) {
    var values = {};
    var context = {
        window: {
            ChordCruise: {},
            document: { documentElement: { dataset: { appEdition: edition } } },
            localStorage: {
                getItem: function (key) { return values[key] || null; },
                setItem: function (key, value) { values[key] = String(value); },
                removeItem: function (key) { delete values[key]; }
            }
        },
        document: { addEventListener: function () {} },
        console: { warn: function () {} }, URL: URL
    };
    vm.createContext(context);
    vm.runInContext(accessSource, context);
    vm.runInContext(storageSource, context);
    context.window.ChordCruise.state = { settings: context.window.ChordCruise.storage.loadSettings() };
    vm.runInContext(librarySource.replace('window.ChordCruise.ui.library = {',
        'window.ChordCruise.ui.summaryForTest = function () { return folderLimitSummaryHtml(storage().loadOrderedFolders(), buildFolderCountMap()); };\n    window.ChordCruise.ui.library = {'), context);
    return { cruise: context.window.ChordCruise, values: values, context: context };
}
var env = summaryEnvironment('Standard');
var storage = env.cruise.storage;
function summaryContains(folderCount, chordCount) {
    storage.loadOrderedFolders(); // allow the existing storage initialization before the read-only check
    var before = JSON.stringify(env.values);
    var html = env.cruise.ui.summaryForTest();
    assert(html.includes('フォルダ：' + folderCount + ' / 3'));
    assert(html.includes('コード数：' + chordCount + ' / 30'));
    assert(!html.includes('title='), 'summary has no folder-name tooltip');
    assert.strictEqual((html.match(/>Pro版の入手方法<\/a>/g) || []).length, 1);
    assert(html.includes('<span class="cc-fb-hint">Pro版では保存上限がなくなります</span><a href="../pro-access.html" target="_blank" rel="noopener">Pro版の入手方法</a>'));
    assert(html.includes('class="cc-save-limit-summary"'));
    assert.strictEqual(JSON.stringify(env.values), before, 'rendering never writes saved data');
    return html;
}
summaryContains(1, 0);
var uncategorized = storage.loadFolders()[0];
var folderA = storage.createFolder('フォルダA');
summaryContains(2, 0);
var folderB = storage.createFolder('フォルダB');
summaryContains(3, 0);
function saveCodes(folder, count) {
    var saved = [];
    for (var i = 0; i < count; i += 1) {
        var chord = storage.saveChord({ folderId: folder.id, chordName: 'C', formName: 'C型',
            shape: 'C', rootPc: 0, intervals: [0, 4, 7], qualityKey: 'maj', notes: [], mutedStrings: [] }, {source: 'diatonic'});
        assert(chord);
        saved.push(chord);
    }
    return saved;
}
saveCodes(uncategorized, 4);
summaryContains(3, 4);
saveCodes(folderA, 3);
summaryContains(3, 7);
saveCodes(folderB, 2);
var totalSummary = summaryContains(3, 9);
[uncategorized.id, folderA.id, folderB.id, 'deleted-folder', ''].forEach(function (id) {
    env.cruise.state.settings.lastSaveFolderId = id;
    assert.strictEqual(summaryContains(3, 9), totalSummary, 'total does not depend on last saved folder');
});
var added = saveCodes(folderB, 1)[0];
summaryContains(3, 10);
assert(storage.deleteChord(added.id));
summaryContains(3, 9);
assert(storage.moveFolder(folderB.id, -1));
summaryContains(3, 9);

// The save dialog continues to report only the selected folder, with its per-folder limit.
var nodes = {
    'cc-save-limit-summary': {},
    'cc-save-folder': { value: folderA.id },
    'cc-save-folder-limit-count': {},
    'cc-save-chord-limit-count': {}
};
env.context.document.getElementById = function (id) { return nodes[id]; };
vm.runInContext(source.replace('window.ChordCruise.ui.saveEditor = {',
    'window.ChordCruise.ui.saveSummaryForTest = function (folderId) { draft = {folderId: folderId}; renderSaveLimitSummary(); };\n    window.ChordCruise.ui.saveEditor = {'), env.context);
var dataBeforeSaveSummary = JSON.stringify(env.values);
env.cruise.ui.saveSummaryForTest(folderA.id);
assert.strictEqual(nodes['cc-save-folder-limit-count'].textContent, 'フォルダ：3 / 3');
assert.strictEqual(nodes['cc-save-chord-limit-count'].textContent, 'コード数：3 / 10');
nodes['cc-save-folder'].value = folderB.id;
env.cruise.ui.saveSummaryForTest(folderA.id);
assert.strictEqual(nodes['cc-save-chord-limit-count'].textContent, 'コード数：2 / 10', 'selected destination takes precedence over draft');
assert.strictEqual(JSON.stringify(env.values), dataBeforeSaveSummary, 'save summary does not write saved data');
assert(storage.deleteFolder(folderB.id));
summaryContains(2, 7);
assert(storage.deleteFolder(folderA.id));
summaryContains(1, 4);
assert(storage.deleteFolder(uncategorized.id));
summaryContains(0, 0);
assert(!librarySource.includes('id="cc-folder-pro-link"'), 'no standalone purchase link remains');
assert(librarySource.includes('folderLimitSummaryHtml(folders, countMap)'), 'folder rendering integrates the summary');
assert.strictEqual(summaryEnvironment('Pro').cruise.ui.summaryForTest(), '', 'Pro generates no summary');
console.log('library-limit-summary: shared style, existing limits/counts, updates, independent total, single link, read-only rendering and Pro exclusion OK');
