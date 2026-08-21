'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var standardDirectory = path.join(root, 'standard');
var standardHtml = fs.readFileSync(path.join(standardDirectory, 'index.html'), 'utf8');
var proDirectory = path.join(root, 'pro_k7m4q9v2x8');
var proHtml = fs.readFileSync(path.join(proDirectory, 'index.html'), 'utf8');
var standardManifest = JSON.parse(fs.readFileSync(path.join(standardDirectory, 'manifest.json'), 'utf8'));
var proManifest = JSON.parse(fs.readFileSync(path.join(proDirectory, 'manifest.json'), 'utf8'));

function assertIconSet(manifest, manifestDirectory, expectedPrefix) {
    assert.strictEqual(manifest.icons.length, 4, 'manifest contains any and maskable icons at each required size');
    assert.deepStrictEqual(manifest.icons.map(function (icon) { return icon.sizes; }), ['192x192', '512x512', '192x192', '512x512']);
    assert.deepStrictEqual(manifest.icons.map(function (icon) { return icon.purpose; }), ['any', 'any', 'maskable', 'maskable']);
    manifest.icons.forEach(function (icon) {
        assert.strictEqual(icon.type, 'image/png');
        assert(icon.src.includes(expectedPrefix), 'manifest stays within its edition-specific icon set');
        assert(fs.existsSync(path.resolve(manifestDirectory, icon.src)), 'manifest icon target exists: ' + icon.src);
    });
}

assert.strictEqual(standardManifest.id, '/apps/chord-cruise/standard/', 'Standard has its own installed-app identity');
assert.strictEqual(proManifest.id, '/apps/chord-cruise/pro_k7m4q9v2x8/', 'Pro has a separate installed-app identity');
assert.notStrictEqual(standardManifest.id, proManifest.id, 'Standard and Pro do not replace each other on Android');
assert.strictEqual(standardManifest.name, 'コードクルーズ');
assert.strictEqual(standardManifest.short_name, 'コードクルーズ');
assert.strictEqual(proManifest.name, 'コードクルーズ');
assert.strictEqual(proManifest.short_name, 'コードクルーズ');
assert(standardHtml.includes('<link rel="manifest" href="manifest.json?v=1">'), 'Standard loads its manifest');
assert(standardHtml.includes('href="../icons/chord-cruise-180.png"'), 'Standard loads its Apple touch icon');
assert(standardHtml.includes('href="../icons/chord-cruise-192.png"'), 'Standard loads its favicon');
assert(standardHtml.includes('<meta name="apple-mobile-web-app-title" content="コードクルーズ">'), 'Standard keeps its home-screen title');
assert(proHtml.includes('<link rel="manifest" href="manifest.json?v=2">'), 'Pro loads its local manifest');
assert(proHtml.includes('href="../icons/chord-cruise-pro-180.png"'), 'Pro loads its Apple touch icon');
assert(proHtml.includes('href="../icons/chord-cruise-pro-192.png"'), 'Pro loads its favicon');
assert(proHtml.includes('<meta name="apple-mobile-web-app-title" content="コードクルーズ">'), 'Pro keeps the same home-screen title');
assertIconSet(standardManifest, standardDirectory, 'chord-cruise-');
assertIconSet(proManifest, proDirectory, 'chord-cruise-pro-');

console.log('icon-manifest: Standard and Pro use separate names, IDs, and any/maskable icon sets OK');
