'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
var fretboardSource = fs.readFileSync(path.join(root, 'js/ui/fretboard.js'), 'utf8');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/caged-forms.js');

var caged = window.ChordCruise.caged;
var cMajorFeatured = caged.getCommonForm('maj', 0, 13, 0);
var dMajorFeatured = caged.getCommonForm('maj', 2, 13, 0);
var bHalfDiminishedFeatured = caged.getCommonForm('dim', 11, 13, 0);
assert.strictEqual(cMajorFeatured.shape, 'C', 'C major keeps its existing C-shape featured form');
assert.strictEqual(dMajorFeatured.shape, 'D', 'D major uses its existing D-shape featured form');
assert.strictEqual(bHalfDiminishedFeatured.shape, 'A', 'Bm♭5 uses its existing recommended A-shape form');
assert.strictEqual(caged.getCommonForm(null, 0, 13, 0), null, 'CAGED-unsupported qualities have no featured form');

assert(exploreSource.includes('function selectRecommendedFretboardPresentation()'), 'Explore has one selection-entry helper');
assert(exploreSource.includes('window.ChordCruise.caged.getCommonForm(chord.qualityKey, chord.rootPc, range.end, range.start)'), 'helper reuses the existing featured-form resolver');
assert(exploreSource.includes("var lockedShape = getSettings().cagedFormLocked === true ? state.exploreShape : null;"), 'the persisted CAGED lock keeps the selected shape');
assert(exploreSource.includes("state.exploreShape = lockedShape || (featured ? featured.shape : null);"), 'featured forms become active unless the persisted CAGED lock keeps the selected shape');
assert(exploreSource.includes("var displayMode = state.exploreFretboardPresentationInitialized === true"), 'only the initial code selection chooses the temporary finger display');
assert(exploreSource.includes("state.exploreFretboardDisplayMode = featured ? displayMode : 'note';"), 'later selections preserve the current display mode while unavailable forms fall back to CDE');
assert(exploreSource.includes('state.exploreFretboardPresentationInitialized = true;'), 'Explore records that an initial presentation has been chosen without using storage');
var helperSource = exploreSource.slice(
    exploreSource.indexOf('function selectRecommendedFretboardPresentation()'),
    exploreSource.indexOf('function updateHighFretToggle()')
);
assert.strictEqual(helperSource.includes('saveSetting('), false, 'automatic presentation does not persist a user display-mode setting');
assert(helperSource.includes('updateFbSegments();'), 'automatic presentation synchronizes the active display-mode tab');
assert.strictEqual((exploreSource.match(/selectRecommendedFretboardPresentation\(\);/g) || []).length, 3, 'all three code-selection routes use the common helper');
assert(exploreSource.includes('var cagedLocked = getSettings().cagedFormLocked === true;'), 'CAGED tab order reads the persisted lock setting');
assert(exploreSource.includes('var circularShapeOrder = cagedLocked || featuredIndex === -1'), 'locked mode keeps the normal CAGED order while unlocked mode remains circular');
assert(exploreSource.includes("var orderedShapes = [''].concat(circularShapeOrder);"), 'All remains before the circular CAGED order');
assert(exploreSource.includes('getState().exploreFretboardDisplayMode = null;\n                getState().exploreFretboardPresentationInitialized = true;\n                saveSetting({ fretboardDisplayMode: mode });'), 'manual mode selection clears only the temporary Explore override before saving the user setting');
assert(exploreSource.includes("getState().exploreFretboardDisplayMode = 'note';"), 'unavailable forms fall back without mutating stored settings');
assert(exploreSource.includes('getState().exploreAnimateFretboardScroll = !!shape;'), 'a selected CAGED form requests a fretboard scroll animation');
assert(exploreSource.includes('state.exploreAnimateFretboardScroll = !!state.exploreShape;'), 'a code selection requests a fretboard scroll to its final form');
assert(exploreSource.includes('animateScroll: animateFretboardScroll && !!form && scrollToFret !== null'), 'only available CAGED forms animate to their fret position');
assert(fretboardSource.includes('initialScroll: opts.initialScroll'), 'the fretboard renderer accepts the animation start position');
assert(fretboardSource.includes("scroll.scrollTo({ left: next, behavior: 'smooth' });"), 'the fretboard uses native smooth horizontal scrolling when available');

function circularOrder(featuredShape) {
    var order = caged.SHAPE_ORDER;
    var index = order.indexOf(featuredShape);
    return order.slice(index).concat(order.slice(0, index));
}

assert.deepStrictEqual(circularOrder('D'), ['D', 'C', 'A', 'G', 'E'], 'D featured order wraps through CAGED');
assert.deepStrictEqual(circularOrder('E'), ['E', 'D', 'C', 'A', 'G'], 'E featured order wraps through CAGED');
assert.deepStrictEqual(circularOrder('A'), ['A', 'G', 'E', 'D', 'C'], 'A featured order wraps through CAGED');
assert(exploreSource.indexOf('id="cc-fbmode-finger"') < exploreSource.indexOf('id="cc-fbmode-note"'), 'finger mode is the first display tab');

console.log('explore-recommended-form-default: featured selection, temporary display mode, tab order, smooth scroll, and fallback OK');
