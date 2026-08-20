var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var accessSource = fs.readFileSync(path.join(root, 'pro-access.html'), 'utf8');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
var saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
var standardSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var proSource = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');

assert(fs.existsSync(path.join(root, 'pro-access.html')), 'Chord Cruise provides a Pro access page');
assert(accessSource.includes('<title>PRO版の入手方法 | コードクルーズ</title>'), 'access page has a Chord Cruise title');
assert(accessSource.includes('任意コードの保存'), 'access page explains custom chord saving');
assert(accessSource.includes('保存数制限の解除'), 'access page explains unlimited library access');
assert(accessSource.includes('高度quality分析'), 'access page explains advanced quality analysis');
assert(accessSource.includes('高度CAGEDフォーム'), 'access page explains advanced CAGED access');
assert(accessSource.includes('拡張Library'), 'access page explains expanded library access');
assert(!accessSource.includes('任意コード作成自体'), 'access page does not describe custom chord creation itself as Pro-only');
assert(accessSource.includes('href="./pro_k7m4q9v2x8/"'), 'access page links to the Pro entry with a relative path');
assert(accessSource.includes('href="../shared/style.css"'), 'access page resolves the shared stylesheet from the Chord Cruise root');

[exploreSource, saveEditorSource, librarySource].forEach(function (source, index) {
    assert(source.includes('href = \'pro-access.html\'') || source.includes('href="pro-access.html"'), 'Standard Pro entry ' + index + ' links to the access page');
    assert(source.includes('Pro版の入手方法'), 'Standard Pro entry ' + index + ' uses the access-page label');
    assert(!source.includes('pro_k7m4q9v2x8/'), 'Standard Pro entry ' + index + ' does not bypass the access page');
});

assert(!standardSource.includes('pro-access.html'), 'Standard HTML entry remains unchanged');
assert(proSource.includes('data-app-edition="Pro"'), 'existing Pro entry remains intact');

console.log('pro-access-link: access page content, Standard links, and Pro entry compatibility OK');
