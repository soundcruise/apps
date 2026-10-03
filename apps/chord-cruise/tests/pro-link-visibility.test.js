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
assert(!saveEditorSource.includes('id="cc-save-folder-pro-link"'), 'save editor has no purchase link below new-folder creation');
assert(!saveEditorSource.includes('id="cc-save-limit-pro-link"'), 'save editor has no purchase link below the memo');
assert(saveEditorSource.includes("(isProEdition() ? '' :\n                        '<span class=\"cc-fb-hint\">Pro版では保存上限がなくなります</span>' +\n                        '<a href=\"../pro-access.html\" target=\"_blank\" rel=\"noopener\">Pro版の入手方法</a>')"), 'only Standard generates the summary explanation followed by the existing access link');
assert.strictEqual((saveEditorSource.match(/>Pro版の入手方法<\/a>/g) || []).length, 1, 'save editor generates exactly one Pro access link, including rejection states');
assert(librarySource.includes('link.hidden = isProEdition() || (code !== \'standard-folder-limit\' && code !== \'standard-folder-chord-limit\');'), 'Pro hides library folder-limit access links');
assert(!librarySource.includes('id="cc-folder-pro-link"'), 'library removes the standalone folder-limit purchase link');
assert(librarySource.includes("if (isProEdition()) return '';"), 'Pro does not generate the library save-limit summary');
assert(librarySource.includes('if (!isProEdition() && (!featureAccess() || !featureAccess().canAccessQuality(qualityKey)))'), 'Pro never renders library advanced-quality purchase prompts');
assert(settingsSource.includes("? '<h4 id=\"cc-settings-pro-title\">Pro版</h4><p class=\"cc-settings-note\">Pro版を利用中</p>"), 'Pro settings retain only the active-Pro status and authentication reset');

console.log('pro-link-visibility: Standard keeps access links while Pro suppresses purchase routes OK');
