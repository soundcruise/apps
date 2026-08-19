'use strict';

var assert = require('assert');

global.window = {
    ChordCruise: {},
    document: {
        documentElement: {
            dataset: {}
        }
    }
};

require('../js/core/feature-access.js');

var featureAccess = window.ChordCruise.featureAccess;
var expectedFeatures = [
    'customChordCreate',
    'customChordFretboardView',
    'customChordSave',
    'unlimitedLibrary',
    'advancedQuality',
    'advancedCaged',
    'advancedExport'
];

assert.strictEqual(featureAccess.isProEdition(), false, 'an edition attribute is absent in Standard');

var standardAccess = featureAccess.getFeatureAccess();
assert.deepStrictEqual(Object.keys(standardAccess), expectedFeatures, 'feature access exposes the agreed candidate features');
expectedFeatures.forEach(function (featureName) {
    var expected = featureName !== 'unlimitedLibrary' && featureName !== 'customChordSave' && featureName !== 'advancedQuality' && featureName !== 'advancedCaged';
    assert.strictEqual(standardAccess[featureName], expected, featureName + ' has the Standard P4-2 access value');
    assert.strictEqual(featureAccess.hasFeature(featureName), expected, featureName + ' uses the Standard P4-2 access value');
});
assert.strictEqual(featureAccess.hasFeature('unknownFeature'), false, 'unknown features are never implicitly enabled');

window.document.documentElement.dataset.appEdition = 'Pro';
assert.strictEqual(featureAccess.isProEdition(), true, 'Pro is identified from data-app-edition');

var proAccess = featureAccess.getFeatureAccess();
expectedFeatures.forEach(function (featureName) {
    assert.strictEqual(proAccess[featureName], true, featureName + ' is available in Pro');
});
assert.notStrictEqual(proAccess, standardAccess, 'callers cannot mutate the next feature access result');

console.log('feature-access: Standard library/custom-save/advanced-quality/advanced-CAGED limits and Pro all-enabled feature access OK');
