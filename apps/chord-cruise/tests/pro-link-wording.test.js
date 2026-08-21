'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var standardDirectory = path.join(root, 'standard');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
var saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
var standardHtml = fs.readFileSync(path.join(standardDirectory, 'index.html'), 'utf8');
var proHtml = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');

var proAccessPath = '../pro-access.html';
var proAccessLabel = 'Pro版の入手方法';
var proWording = [
    '作成したコードを保存するにはPro版が必要です。',
    'このコードの詳細分析はPro版で利用できます。',
    'このコードのCAGEDフォームはPro版で利用できます。',
    'Standard版ではフォルダは3個まで保存できます。',
    'Standard版では1フォルダ10個まで保存できます。'
];

assert(exploreSource.includes('href="' + proAccessPath + '"'), 'advancedCaged points to the Pro access page');
assert(exploreSource.includes(proAccessLabel), 'advancedCaged uses the shared Pro access label');
assert(librarySource.includes('href="' + proAccessPath + '"'), 'advancedQuality points to the Pro access page');
assert(saveEditorSource.includes('href="' + proAccessPath + '"'), 'customChordSave points to the Pro access page');
proWording.forEach(function (text) {
    assert(
        exploreSource.includes(text) || librarySource.includes(text) || saveEditorSource.includes(text),
        text + ' remains in the app wording set'
    );
});
assert(!standardHtml.includes('data-app-edition="Pro"'), 'Standard entry remains Standard');
assert(proHtml.includes('<html lang="ja" data-app-edition="Pro">'), 'Pro entry remains Pro');
assert(exploreSource.includes('setCagedProLink(cagedProRequired)'), 'CAGED Pro link is shown only for the gated state');
assert(!exploreSource.includes('PRO版を開く'), 'app-level wording does not introduce PRO版 spelling');

console.log('pro-link-wording: advancedCaged Pro access page, existing gates, wording, and Standard/Pro entry compatibility OK');
