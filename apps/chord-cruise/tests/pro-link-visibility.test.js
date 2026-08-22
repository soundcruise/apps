'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
var saveEditorSource = fs.readFileSync(path.join(root, 'js/ui/save-editor.js'), 'utf8');
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
var settingsSource = fs.readFileSync(path.join(root, 'js/ui/settings.js'), 'utf8');

assert(exploreSource.includes('link.hidden = !visible || isProEdition();'), 'Pro hides the advanced-CAGED access link even if a stale visible request is made');
assert(exploreSource.includes("(isProEdition() ? '' :\n                    '<div id=\"cc-caged-pro-link\" hidden>'"), 'Pro does not generate the static CAGED purchase link');
assert(exploreSource.includes('if (!isProEdition() && (!featureAccess || !featureAccess.canAccessQuality(chord.qualityKey)))'), 'Pro never renders an advanced-quality purchase prompt');
assert(saveEditorSource.includes('if (isProEdition())') && saveEditorSource.includes('if (limits.unlimited)'), 'Pro hides the Standard save-limit summary and its access link');
assert(saveEditorSource.includes('proLink.hidden = isProEdition() || !text || code !== \'standard-folder-limit\';'), 'Pro hides folder-limit access links');
assert(saveEditorSource.includes('proLink.hidden = isProEdition() || !text || code !== \'standard-folder-chord-limit\';'), 'Pro hides chord-limit access links');
assert(saveEditorSource.includes('element.hidden = !visible || isProEdition();'), 'Pro hides the custom-save purchase prompt');
assert(saveEditorSource.includes("(isProEdition() ? '' :\n                            '<a class=\"cc-save-folder-pro-link\" id=\"cc-save-folder-pro-link\""), 'Pro does not generate the new-folder purchase link');
assert(saveEditorSource.includes("(isProEdition() ? '' :\n                    '<a class=\"cc-save-folder-pro-link\" id=\"cc-save-limit-pro-link\""), 'Pro does not generate the save-limit purchase link or custom-save prompt');
assert(saveEditorSource.includes("(isProEdition() ? '' : '<a href=\"../pro-access.html\""), 'Pro does not generate the save-summary purchase link');
assert(librarySource.includes('link.hidden = isProEdition() || (code !== \'standard-folder-limit\' && code !== \'standard-folder-chord-limit\');'), 'Pro hides library folder-limit access links');
assert(librarySource.includes("(isProEdition() ? '' :\n                    '<a class=\"cc-save-folder-pro-link\" id=\"cc-folder-pro-link\""), 'Pro does not generate the library folder-limit purchase link');
assert(librarySource.includes('if (!isProEdition() && (!featureAccess() || !featureAccess().canAccessQuality(qualityKey)))'), 'Pro never renders library advanced-quality purchase prompts');
assert(settingsSource.includes("? '<h4 id=\"cc-settings-pro-title\">Pro版</h4><p class=\"cc-settings-note\">Pro版を利用中</p>"), 'Pro settings retain only the active-Pro status and authentication reset');

console.log('pro-link-visibility: Standard keeps access links while Pro suppresses purchase routes OK');
