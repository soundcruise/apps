'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var featureSource = fs.readFileSync(path.join(root, 'js/core/feature-access.js'), 'utf8');
var theorySource = fs.readFileSync(path.join(root, 'js/core/music-theory.js'), 'utf8');
var cagedSource = fs.readFileSync(path.join(root, 'js/core/caged-forms.js'), 'utf8');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');

function loadEdition(appEdition) {
    var context = {
        window: {
            ChordCruise: {},
            document: { documentElement: { dataset: appEdition ? { appEdition: appEdition } : {} } }
        },
        console: console
    };
    vm.createContext(context);
    vm.runInContext(featureSource, context, { filename: 'feature-access.js' });
    vm.runInContext(theorySource, context, { filename: 'music-theory.js' });
    vm.runInContext(cagedSource, context, { filename: 'caged-forms.js' });
    return context.window.ChordCruise;
}

var standard = loadEdition(null);
assert.strictEqual(standard.featureAccess.hasFeature('advancedCaged'), false, 'Standard disables advancedCaged');
assert.strictEqual(standard.featureAccess.canAccessCaged('maj'), true, 'Standard keeps basic CAGED');
assert.strictEqual(standard.featureAccess.canAccessCaged('m7b5'), true, 'Standard keeps intermediate CAGED');
assert.strictEqual(standard.featureAccess.canAccessCaged('7b5'), false, 'Standard gates supported advanced CAGED');
standard.theory.QUALITIES['7b5'].caged.supported = false;
assert.strictEqual(standard.featureAccess.canAccessCaged('7b5'), true, 'unsupported advanced quality remains on the existing CAGED fallback path');
standard.theory.QUALITIES['7b5'].caged.supported = true;
assert.strictEqual(standard.featureAccess.canAccessCaged('unknown'), true, 'unknown quality remains on the existing fallback path');
assert.strictEqual(standard.caged.getForm('E', '7b5', 0, 13, 0).available, true, 'the CAGED core remains unchanged beneath the UI gate');

var pro = loadEdition('Pro');
assert.strictEqual(pro.featureAccess.hasFeature('advancedCaged'), true, 'Pro enables advancedCaged');
assert.strictEqual(pro.featureAccess.canAccessCaged('7b5'), true, 'Pro can display advanced CAGED');
assert.strictEqual(pro.caged.getForm('E', '7b5', 0, 13, 0).available, true, 'Pro uses the existing form definition');

assert(exploreSource.includes('canAccessCaged(chord.qualityKey)'), 'Explore checks advancedCaged at the UI boundary');
assert(exploreSource.includes('このコードのCAGEDフォームはPro版で利用できます。'), 'Explore has a dedicated Pro CAGED message');
assert(exploreSource.includes('このコードはCAGEDフォーム未対応のため、型フォームを表示していません。'), 'unsupported CAGED wording remains separate');
assert(exploreSource.includes('運指は未定義です。保存で編集できます。'), 'undefined fingering wording remains separate');

console.log('advanced-caged-gate: Standard keeps basic/intermediate and whole-fretboard paths, Pro unlocks advanced forms, and CAGED core is unchanged OK');
