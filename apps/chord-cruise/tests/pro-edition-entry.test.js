'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var standardPath = path.join(root, 'index.html');
var proDirectory = path.join(root, 'pro_k7m4q9v2x8');
var proPath = path.join(proDirectory, 'index.html');
var standardHtml = fs.readFileSync(standardPath, 'utf8');
var proHtml = fs.readFileSync(proPath, 'utf8');
var standardScripts = Array.from(standardHtml.matchAll(/<script src="([^"]+)"/g)).map(function (match) { return match[1]; });
var proScripts = Array.from(proHtml.matchAll(/<script src="([^"]+)"/g)).map(function (match) { return match[1]; });

assert(fs.existsSync(proDirectory), 'Pro entry directory exists');
assert(/^pro_[a-z0-9]+$/.test(path.basename(proDirectory)), 'Pro directory uses the existing pro_ lowercase-alphanumeric convention');
assert(standardHtml.includes('<html lang="ja">'), 'Standard entry remains edition-neutral');
assert(!standardHtml.includes('data-app-edition="Pro"'), 'Standard entry is unchanged by the Pro entry');
assert(proHtml.includes('<html lang="ja" data-app-edition="Pro">'), 'Pro entry declares the Pro edition');
assert(proHtml.includes('<link rel="stylesheet" href="../theme.css?v=0.36.2">'), 'Pro entry resolves the shared Chord Cruise theme from its parent directory');
assert(proHtml.includes('<script src="../js/core/feature-access.js?v=0.36.2"></script>'), 'Pro entry loads feature access before application code');

standardScripts.forEach(function (standardSrc) {
    var proSrc = '../' + standardSrc;
    assert(proScripts.indexOf(proSrc) !== -1, 'Pro entry keeps the Standard script through its parent-relative path: ' + standardSrc);
    assert(fs.existsSync(path.resolve(proDirectory, proSrc.split('?')[0])), 'Pro script target exists: ' + proSrc);
});

assert(fs.existsSync(path.resolve(proDirectory, '../theme.css')), 'Pro theme target exists');

var featureAccessSource = fs.readFileSync(path.join(root, 'js/core/feature-access.js'), 'utf8');
var proWindow = { document: { documentElement: { dataset: { appEdition: 'Pro' } } } };
vm.runInNewContext(featureAccessSource, { window: proWindow }, { filename: 'feature-access.js' });
assert(proWindow.ChordCruise.featureAccess, 'Pro entry can expose feature access on the Chord Cruise namespace');
assert.strictEqual(proWindow.ChordCruise.featureAccess.isProEdition(), true, 'Pro entry data attribute resolves to the Pro edition');

console.log('pro-edition-entry: Pro entry declares edition, preserves Standard DOM assets, and resolves parent paths OK');
