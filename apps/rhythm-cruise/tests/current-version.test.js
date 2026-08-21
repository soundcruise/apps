'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var expectedVersion = '1.3.0';
var script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
var standardHtml = fs.readFileSync(path.join(root, 'standard', 'index.html'), 'utf8');
var proHtml = fs.readFileSync(path.join(root, 'pro_r4m8k7n2q9x', 'index.html'), 'utf8');

assert(script.includes("const RHYTHM_CRUISE_VERSION = '" + expectedVersion + "';"), 'application version is current');
assert(standardHtml.includes('../theme.css?v=' + expectedVersion), 'Standard theme cache-buster is current');
assert(standardHtml.includes('../script.js?v=' + expectedVersion), 'Standard script cache-buster is current');
assert(proHtml.includes('../theme.css?v=' + expectedVersion), 'Pro theme cache-buster is current');
assert(proHtml.includes('../script.js?v=' + expectedVersion), 'Pro script cache-buster is current');

console.log('current-version: ' + expectedVersion + ' is synchronized across Rhythm Cruise editions');
