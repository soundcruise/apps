'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var standardDirectory = path.join(root, 'standard');
var settingsSource = fs.readFileSync(path.join(root, 'js/ui/settings.js'), 'utf8');
var standardHtml = fs.readFileSync(path.join(standardDirectory, 'index.html'), 'utf8');
var proHtml = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');

assert(settingsSource.includes('renderProSection'), 'settings owns the small Pro section rendering');
assert(settingsSource.includes('featureAccess.isProEdition'), 'settings uses the existing edition API');
assert(settingsSource.includes('Pro版はこちら'), 'Standard has a Pro feature link label');
assert(settingsSource.includes('href="../pro-access.html"'), 'Standard settings link uses the root access page');
assert(settingsSource.includes('Pro版を利用中'), 'Pro settings show the active edition');
assert(settingsSource.includes('cc-settings-refresh-bar'), 'Pro section is placed before the version refresh bar');
assert(settingsSource.includes('cc-settings-reset'), 'Pro section reuses the existing settings visual treatment');
assert(standardHtml.includes('id="cc-settings-overlay"'), 'Standard settings dialog remains available');
assert(proHtml.includes('id="cc-settings-overlay"'), 'Pro settings dialog remains available');
assert(!settingsSource.includes('soundCruiseProAuth'), 'settings does not manage gate authentication');
assert(settingsSource.includes('window.__soundCruiseClearGate'), 'Pro settings use the shared gate reset API');
assert(settingsSource.includes('cc-settings-pro-gate-reset'), 'authentication reset is only rendered in the Pro branch');
assert(settingsSource.includes('cc-settings-data-delete'), 'settings include the Chord Cruise data delete action');

console.log('settings-pro-section: Standard/Pro status, access link, Pro auth reset, and data management boundaries OK');
