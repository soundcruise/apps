'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var standardHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var proDirectory = path.join(root, 'pro_k7m4q9v2x8');
var proHtml = fs.readFileSync(path.join(proDirectory, 'index.html'), 'utf8');
var standardManifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
var proManifest = JSON.parse(fs.readFileSync(path.join(proDirectory, 'manifest.json'), 'utf8'));

function assertIconSet(manifest, manifestDirectory, expectedPrefix) {
    assert.strictEqual(manifest.icons.length, 2, 'manifest uses only the required PWA icon sizes');
    assert.deepStrictEqual(manifest.icons.map(function (icon) { return icon.sizes; }), ['192x192', '512x512']);
    manifest.icons.forEach(function (icon) {
        assert.strictEqual(icon.type, 'image/png');
        assert.strictEqual(icon.purpose, 'any maskable');
        assert(icon.src.includes(expectedPrefix), 'manifest stays within its edition-specific icon set');
        assert(fs.existsSync(path.resolve(manifestDirectory, icon.src)), 'manifest icon target exists: ' + icon.src);
    });
}

assert(standardHtml.includes('<link rel="manifest" href="manifest.json?v=1">'), 'Standard loads its manifest');
assert(standardHtml.includes('href="icons/chord-cruise-180.png"'), 'Standard loads its Apple touch icon');
assert(standardHtml.includes('href="icons/chord-cruise-192.png"'), 'Standard loads its favicon');
assert(proHtml.includes('<link rel="manifest" href="manifest.json?v=1">'), 'Pro loads its local manifest');
assert(proHtml.includes('href="../icons/chord-cruise-pro-180.png"'), 'Pro loads its Apple touch icon');
assert(proHtml.includes('href="../icons/chord-cruise-pro-192.png"'), 'Pro loads its favicon');
assertIconSet(standardManifest, root, 'chord-cruise-');
assertIconSet(proManifest, proDirectory, 'chord-cruise-pro-');

console.log('icon-manifest: Standard and Pro use separate valid icon sets OK');
