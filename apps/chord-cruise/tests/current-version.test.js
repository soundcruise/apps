'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var expectedVersion = '0.36.0';
var appSource = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
var standardHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var proHtml = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');

function appAssetVersions(html) {
    return Array.from(html.matchAll(/(?:theme\.css|js\/[^\"]+\.js)\?v=([^\"]+)/g)).map(function (match) {
        return match[1];
    });
}

assert(appSource.includes("CHORD_CRUISE_APP_VERSION = '" + expectedVersion + "'"), 'APP_VERSION matches the formal version');
assert(standardHtml.includes('theme.css?v=' + expectedVersion), 'Standard theme cache version matches');
assert(standardHtml.includes('js/app.js?v=' + expectedVersion), 'Standard app cache version matches');
assert(proHtml.includes('../theme.css?v=' + expectedVersion), 'Pro theme cache version matches');
assert(proHtml.includes('../js/app.js?v=' + expectedVersion), 'Pro app cache version matches');
assert(appAssetVersions(standardHtml).every(function (version) { return version === expectedVersion; }), 'all Standard app assets use the formal version');
assert(appAssetVersions(proHtml).every(function (version) { return version === expectedVersion; }), 'all Pro app assets use the formal version');

console.log('current-version: APP_VERSION and Standard/Pro asset versions are 0.36.0 OK');
