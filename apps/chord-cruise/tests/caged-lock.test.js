'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
var settingsSource = fs.readFileSync(path.join(root, 'js/ui/settings.js'), 'utf8');
var storageSource = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');
var themeSource = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
var standardHtml = fs.readFileSync(path.join(root, 'standard/index.html'), 'utf8');
var proHtml = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/caged-forms.js');

var bDiminishedE = window.ChordCruise.caged.getForm('E', 'dim', 11, 13, 0);
assert.strictEqual(bDiminishedE.available, true, 'Bm♭5 E-form is available in the standard fret range');
assert.deepStrictEqual(
    bDiminishedE.notes.map(function (note) {
        return [note.string, note.finger, note.fingeringWarning];
    }),
    [[6, 'T', false], [5, null, true], [4, null, true], [3, 2, false], [2, 1, false], [1, 3, false]],
    'Bm♭5 E-form uses 親・⚠・⚠・中・人・薬 from sixth through first string'
);

assert.strictEqual(exploreSource.includes('cc-caged-lock-toggle'), false, 'Explore no longer renders the CAGED lock switch');
assert.strictEqual(exploreSource.includes('exploreCagedLocked'), false, 'Explore no longer owns a transient lock state');
assert(exploreSource.includes("var lockedShape = getSettings().cagedFormLocked === true ? state.exploreShape : null;"), 'the persisted lock setting gives the selected shape precedence');
assert(exploreSource.includes("state.exploreShape = lockedShape || (featured ? featured.shape : null);"), 'unlocked code changes keep the existing recommended-form behavior');
assert(exploreSource.includes('state.exploreAnimateFretboardScroll = !!state.exploreShape;'), 'code changes request a scroll to the final selected form');
assert(exploreSource.includes('var cagedLocked = getSettings().cagedFormLocked === true;'), 'tab order reads the persisted CAGED lock setting');
assert(exploreSource.includes('var circularShapeOrder = cagedLocked || featuredIndex === -1'), 'locked mode keeps the fixed CAGED order while unlocked mode remains circular');
assert(storageSource.includes('cagedFormLocked: false'), 'the settings default keeps CAGED lock off');
assert(storageSource.includes('normalized.cagedFormLocked = normalized.cagedFormLocked === true;'), 'stored lock values are normalized safely');
assert(settingsSource.includes('function setCagedFormLocked(value)'), 'settings owns the CAGED lock update API');
assert(settingsSource.includes('saveRightTopSettings({ cagedFormLocked: locked })'), 'the setting persists through the established settings path');
assert(settingsSource.includes('function toggleCagedLockDescription()'), 'settings owns the lock explanation disclosure');
assert(settingsSource.includes('notifyFretboardChange();'), 'a setting change notifies the active fretboard');
assert(settingsSource.includes('setCagedFormLocked: setCagedFormLocked'), 'the setting API is exposed consistently');
assert(standardHtml.includes('id="cc-settings-caged-lock-toggle"'), 'Standard settings render the persisted CAGED lock toggle');
assert(proHtml.includes('id="cc-settings-caged-lock-toggle"'), 'Pro settings render the persisted CAGED lock toggle');
assert(standardHtml.includes('コードを変更しても選択したCAGEDフォームを維持します。OFFではおすすめフォームへ自動変更します。'), 'Standard settings include the lock explanation');
assert(proHtml.includes('コードを変更しても選択したCAGEDフォームを維持します。OFFではおすすめフォームへ自動変更します。'), 'Pro settings include the lock explanation');
assert(standardHtml.indexOf('data-preview-display-mode="finger"') < standardHtml.indexOf('data-preview-display-mode="note"'), 'Standard settings show fingering before CDE');
assert(standardHtml.indexOf('data-preview-display-mode="note"') < standardHtml.indexOf('data-preview-display-mode="solfege"'), 'Standard settings keep CDE before solfege');
assert(standardHtml.indexOf('data-preview-display-mode="solfege"') < standardHtml.indexOf('data-preview-display-mode="degree"'), 'Standard settings keep solfege before degree');
assert(proHtml.indexOf('data-preview-display-mode="finger"') < proHtml.indexOf('data-preview-display-mode="note"'), 'Pro settings show fingering before CDE');
assert(proHtml.indexOf('data-preview-display-mode="note"') < proHtml.indexOf('data-preview-display-mode="solfege"'), 'Pro settings keep CDE before solfege');
assert(proHtml.indexOf('data-preview-display-mode="solfege"') < proHtml.indexOf('data-preview-display-mode="degree"'), 'Pro settings keep solfege before degree');
assert(themeSource.includes('.cc-settings-help-toggle'), 'the settings explanation control has Chord Cruise styling');
assert.strictEqual(themeSource.includes('.cc-caged-lock-row'), false, 'the removed Explore lock layout has no residual styling');

console.log('caged-lock: Bm♭5 E fingering, persisted settings lock, and Explore wiring OK');
