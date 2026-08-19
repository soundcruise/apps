'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var featureSource = fs.readFileSync(path.join(root, 'js/core/feature-access.js'), 'utf8');
var theorySource = fs.readFileSync(path.join(root, 'js/core/music-theory.js'), 'utf8');
var modelSource = fs.readFileSync(path.join(root, 'js/core/chord-model.js'), 'utf8');
var cagedSource = fs.readFileSync(path.join(root, 'js/core/caged-forms.js'), 'utf8');
var exploreSource = fs.readFileSync(path.join(root, 'js/ui/explore.js'), 'utf8');
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');

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
    vm.runInContext(modelSource, context, { filename: 'chord-model.js' });
    vm.runInContext(cagedSource, context, { filename: 'caged-forms.js' });
    return context.window.ChordCruise;
}

var standard = loadEdition(null);
var advancedChord = standard.chordModel.buildCustomChord({
    rootPc: 0, third: 4, fifth: 6, seventh: 10, tensions: [], bassPc: null
}, '');
assert.strictEqual(advancedChord.qualityKey, '7b5', 'Standard can still create an advanced quality');
assert.deepStrictEqual(Array.from(advancedChord.intervals), [0, 4, 6, 10], 'Standard keeps advanced chord tones');
assert.deepStrictEqual(Array.from(standard.theory.spellChordNotes({
    rootPc: advancedChord.rootPc,
    rootName: 'C',
    qualityKey: advancedChord.qualityKey,
    intervals: advancedChord.intervals,
    degreeLabels: advancedChord.degreeLabelsList,
    keyContext: null
})), ['C', 'E', 'G♭', 'B♭'], 'Standard keeps advanced CDE spelling');
assert.strictEqual(standard.featureAccess.canAccessQuality(advancedChord.qualityKey), false, 'only advanced detail access is denied in Standard');
assert.strictEqual(standard.caged.getForm('E', '7b5', 0, 13, 0).available, true, 'advanced CAGED core remains available beneath its independent UI gate');

assert.strictEqual(standard.featureAccess.canAccessQuality('maj'), true, 'basic quality detail remains accessible');
assert.strictEqual(standard.featureAccess.canAccessQuality('m7b5'), true, 'intermediate quality detail remains accessible');

var pro = loadEdition('Pro');
assert.strictEqual(pro.featureAccess.canAccessQuality('7b5'), true, 'Pro can access advanced quality detail');

assert(exploreSource.includes('renderQualityAnalysis(chord)'), 'Explore updates the independent quality analysis region');
assert(exploreSource.includes('このコードの詳細分析はPro版で利用できます。'), 'Explore has the dedicated Pro message');
assert(librarySource.includes('qualityAnalysisHtml(chord)'), 'library detail includes independent quality analysis');
assert(librarySource.includes('このコードの詳細分析はPro版で利用できます。'), 'library has the dedicated Pro message');
assert(!librarySource.includes("hasFeature('advancedCaged')"), 'library does not introduce an advancedCaged gate');

console.log('advanced-quality-gate: Standard keeps creation, tones, and spelling while advanced detail is independently Pro-only OK');
