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
assert(exploreSource.includes("var lockedShape = getSettings().cagedTabAutoChange !== true ? state.exploreShape : null;"), 'turning automatic CAGED tab changes off gives the selected shape precedence');
assert(exploreSource.includes("state.exploreShape = lockedShape || (featured ? featured.shape : null);"), 'automatic code changes keep the existing recommended-form behavior');
assert(exploreSource.includes('state.exploreAnimateFretboardScroll = !!state.exploreShape;'), 'code changes request a scroll to the final selected form');
assert(exploreSource.includes('var cagedTabAutoChange = getSettings().cagedTabAutoChange === true;'), 'tab order reads the persisted automatic CAGED tab setting');
assert(exploreSource.includes('var circularShapeOrder = !cagedTabAutoChange || featuredIndex === -1'), 'turning automatic changes off keeps the fixed CAGED order while automatic mode remains circular');
assert(exploreSource.includes("var orderedShapes = circularShapeOrder.concat(['']);"), 'automatic and fixed modes both place All after the CAGED tabs');
assert(storageSource.includes('cagedTabAutoChange: true'), 'the settings default enables automatic CAGED tab changes');
assert(storageSource.includes('normalized.cagedTabAutoChange = normalized.cagedTabAutoChange === true;'), 'stored automatic-change values are normalized safely');
assert(settingsSource.includes('function setCagedTabAutoChange(value)'), 'settings owns the automatic CAGED tab update API');
assert(settingsSource.includes('saveRightTopSettings({ cagedTabAutoChange: enabled })'), 'the setting persists through the established settings path');
assert(settingsSource.includes('function toggleCagedAutoChangeDescription()'), 'settings owns the automatic-change explanation disclosure');
assert(settingsSource.includes('notifyFretboardChange();'), 'a setting change notifies the active fretboard');
assert(settingsSource.includes('setCagedTabAutoChange: setCagedTabAutoChange'), 'the setting API is exposed consistently');
assert(standardHtml.includes('id="cc-settings-caged-auto-change-toggle"'), 'Standard settings render the persisted automatic CAGED tab toggle');
assert(proHtml.includes('id="cc-settings-caged-auto-change-toggle"'), 'Pro settings render the persisted automatic CAGED tab toggle');
assert(standardHtml.includes('ONにすると、コードを変更した時にCAGEDのタブは自動で並び変えられます。OFFではCAGEDの順番でタブが固定されます。'), 'Standard settings include the automatic-change explanation');
assert(proHtml.includes('ONにすると、コードを変更した時にCAGEDのタブは自動で並び変えられます。OFFではCAGEDの順番でタブが固定されます。'), 'Pro settings include the automatic-change explanation');
assert(standardHtml.indexOf('data-preview-display-mode="finger"') < standardHtml.indexOf('data-preview-display-mode="note"'), 'Standard settings show fingering before CDE');
assert(standardHtml.indexOf('data-preview-display-mode="note"') < standardHtml.indexOf('data-preview-display-mode="solfege"'), 'Standard settings keep CDE before solfege');
assert(standardHtml.indexOf('data-preview-display-mode="solfege"') < standardHtml.indexOf('data-preview-display-mode="degree"'), 'Standard settings keep solfege before degree');
assert(proHtml.indexOf('data-preview-display-mode="finger"') < proHtml.indexOf('data-preview-display-mode="note"'), 'Pro settings show fingering before CDE');
assert(proHtml.indexOf('data-preview-display-mode="note"') < proHtml.indexOf('data-preview-display-mode="solfege"'), 'Pro settings keep CDE before solfege');
assert(proHtml.indexOf('data-preview-display-mode="solfege"') < proHtml.indexOf('data-preview-display-mode="degree"'), 'Pro settings keep solfege before degree');
assert(themeSource.includes('.cc-settings-help-toggle'), 'the settings explanation control has Chord Cruise styling');
assert.strictEqual(themeSource.includes('.cc-caged-lock-row'), false, 'the removed Explore lock layout has no residual styling');

console.log('caged-lock: Bm♭5 E fingering, persisted automatic CAGED tab setting, and Explore wiring OK');
