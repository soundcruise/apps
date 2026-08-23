const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const storageSource = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8');
const themeSource = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
const standardSource = fs.readFileSync(path.join(root, 'standard/index.html'), 'utf8');
const proSource = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');
const settingsSource = fs.readFileSync(path.join(root, 'js/ui/settings.js'), 'utf8');
const fretboardSource = fs.readFileSync(path.join(root, 'js/ui/fretboard.js'), 'utf8');
const chordExportSource = fs.readFileSync(path.join(root, 'js/ui/chord-export.js'), 'utf8');

function createStorage(seed) {
    const values = Object.assign({}, seed || {});
    const context = {
        window: {
            localStorage: {
                getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
                setItem(key, value) { values[key] = String(value); },
                removeItem(key) { delete values[key]; }
            },
            ChordCruise: { featureAccess: { hasFeature() { return false; } } }
        },
        console: { warn() {} },
        JSON,
        Math,
        Date
    };
    vm.createContext(context);
    vm.runInContext(storageSource, context, { filename: 'storage.js' });
    return context.window.ChordCruise.storage;
}

const fiveSizes = ['xsmall', 'small', 'medium', 'large', 'xlarge'];
const settings = createStorage({
    'chordCruise.settings': JSON.stringify({
        chordNameSize: 'xsmall',
        fretNumberSize: 'xsmall',
        fretboardMarkerLabelSize: 'xsmall'
    })
}).loadSettings();

assert.strictEqual(settings.chordNameSize, 'xsmall');
assert.strictEqual(settings.fretNumberSize, 'xsmall');
assert.strictEqual(settings.fretboardMarkerLabelSize, 'xsmall');
assert.strictEqual(settings.libraryCardChordNameSize, undefined, 'library no longer keeps an independent title-size setting');
assert.strictEqual(settings.libraryCardMarkerLabelSize, undefined, 'library no longer keeps an independent marker-size setting');

const legacy = createStorage({
    'chordCruise.settings': JSON.stringify({
        chordNameSize: 'small', fretNumberSize: 'medium', fretboardMarkerLabelSize: 'xlarge'
    })
}).loadSettings();
assert.strictEqual(legacy.chordNameSize, 'small', 'existing chord-name values remain valid');
assert.strictEqual(legacy.fretNumberSize, 'medium', 'existing fret-number values remain valid');
assert.strictEqual(legacy.fretboardMarkerLabelSize, 'xlarge', 'existing marker-label values remain valid');

fiveSizes.forEach((size) => {
    assert(themeSource.includes('data-cc-chord-name-size="' + size + '"'), 'theme has chord-name ' + size);
    assert(themeSource.includes('data-cc-fret-number-size="' + size + '"'), 'theme has fret-number ' + size);
    assert(themeSource.includes('data-cc-marker-label-size="' + size + '"'), 'theme has marker-label ' + size);
    assert(standardSource.includes('data-chord-name-size="' + size + '"'), 'Standard exposes chord-name ' + size);
    assert(proSource.includes('data-chord-name-size="' + size + '"'), 'Pro exposes chord-name ' + size);
    assert(standardSource.includes('data-fret-number-size="' + size + '"'), 'Standard exposes fret-number ' + size);
    assert(proSource.includes('data-fret-number-size="' + size + '"'), 'Pro exposes fret-number ' + size);
    assert(standardSource.includes('data-fretboard-marker-label-size="' + size + '"'), 'Standard exposes marker-label ' + size);
    assert(proSource.includes('data-fretboard-marker-label-size="' + size + '"'), 'Pro exposes marker-label ' + size);
});

assert(themeSource.includes('--cc-chord-name-size: 26px') && themeSource.includes('--cc-chord-name-size: 42px'));
assert(themeSource.includes('--cc-fret-number-size: 12px') && themeSource.includes('--cc-fret-number-size: 20px'));
assert(themeSource.includes('--cc-fb-marker-label-size: 10.4px') && themeSource.includes('--cc-fb-marker-label-size: 16.8px'));
assert(standardSource.includes('cc-settings-choices--five') && proSource.includes('cc-settings-choices--five'));
assert(settingsSource.includes("['xsmall', 'small', 'medium', 'large', 'xlarge']"));
assert(fretboardSource.includes('fretNumberScaleForSize'));
assert(chordExportSource.includes('diagramOptions.fretNumberScale = fretboard.fretNumberScaleForSize'));
assert(chordExportSource.includes('diagramOptions.markerLabelFontSize = fretboard.markerLabelFontSizeForSize'));

console.log('display-size-settings: five global display-size settings and legacy values OK');
