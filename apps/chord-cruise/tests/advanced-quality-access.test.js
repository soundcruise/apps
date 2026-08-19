'use strict';

var assert = require('assert');

global.window = {
    ChordCruise: {},
    document: { documentElement: { dataset: {} } }
};

require('../js/core/feature-access.js');
require('../js/core/music-theory.js');

var theory = window.ChordCruise.theory;
var featureAccess = window.ChordCruise.featureAccess;

assert.strictEqual(theory.getQualityComplexity('maj'), 'basic', 'basic quality complexity is available through theory');
assert.strictEqual(theory.getQualityComplexity('m7b5'), 'intermediate', 'intermediate quality complexity is available through theory');
assert.strictEqual(theory.getQualityComplexity('7b5'), 'advanced', 'advanced quality complexity is available through theory');
assert.strictEqual(theory.getQualityComplexity('unknown'), null, 'unknown quality has no complexity');

assert.strictEqual(theory.isAdvancedQuality('maj'), false, 'basic quality is not advanced');
assert.strictEqual(theory.isAdvancedQuality('m7b5'), false, 'intermediate quality is not advanced');
assert.strictEqual(theory.isAdvancedQuality('7b5'), true, '7b5 is advanced');
assert.strictEqual(theory.isAdvancedQuality('unknown'), false, 'unknown quality is not treated as advanced');

assert.strictEqual(featureAccess.hasFeature('advancedQuality'), false, 'Standard advancedQuality access is disabled');
assert.strictEqual(featureAccess.canAccessQuality('maj'), true, 'basic quality does not require advancedQuality access');
assert.strictEqual(featureAccess.canAccessQuality('m7b5'), true, 'intermediate quality does not require advancedQuality access');
assert.strictEqual(featureAccess.canAccessQuality('7b5'), false, 'Standard advanced quality uses the advancedQuality feature access');
assert.strictEqual(featureAccess.canAccessQuality('unknown'), true, 'unknown quality is not blocked by the future access foundation');

window.document.documentElement.dataset.appEdition = 'Pro';
assert.strictEqual(featureAccess.hasFeature('advancedQuality'), true, 'Pro retains advancedQuality access');
assert.strictEqual(featureAccess.canAccessQuality('maj7b5'), true, 'Pro can access an advanced quality');

console.log('advanced-quality-access: theory complexity and Feature Access are connected for future UI gates OK');
