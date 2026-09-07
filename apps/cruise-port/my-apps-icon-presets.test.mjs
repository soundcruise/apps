import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
    MY_APPS_ICON_PRESETS,
    createMyAppsPresetGraphic,
    createMyAppsPresetSvg,
    getMyAppsIconPreset,
    isKnownMyAppsIconPreset
} from './my-apps-icon-presets.js';

class FakeElement {
    constructor(name) {
        this.name = name;
        this.attributes = new Map();
        this.children = [];
    }

    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    append(...children) { this.children.push(...children); }
}

const previousDocument = globalThis.document;
globalThis.document = {
    createElement: (name) => new FakeElement(name)
};

assert.equal(MY_APPS_ICON_PRESETS.length, 22);
assert.equal(new Set(MY_APPS_ICON_PRESETS.map((preset) => preset.key)).size, 22, 'keys are unique');

for (const preset of MY_APPS_ICON_PRESETS) {
    assert.equal(isKnownMyAppsIconPreset(preset.key), true);
    assert.equal(getMyAppsIconPreset(preset.key).label, preset.label);
    assert.match(preset.src, /^\.\/assets\/my-app-icons\/[a-z-]+\.png$/);
    const file = readFileSync(new URL(preset.src, import.meta.url));
    assert.equal(file.subarray(1, 4).toString(), 'PNG', `${preset.key} is a PNG`);
    assert.equal(file.readUInt32BE(16), 512, `${preset.key} is 512px wide`);
    assert.equal(file.readUInt32BE(20), 512, `${preset.key} is 512px tall`);
    assert.equal(file[25], 6, `${preset.key} uses RGBA transparency`);
    assert.equal(existsSync(new URL(preset.src, import.meta.url)), true);

    const image = createMyAppsPresetGraphic(preset.key);
    assert.equal(image.name, 'img');
    assert.equal(image.src, preset.src);
    assert.equal(image.alt, '');
    assert.equal(image.decoding, 'async');
    assert.equal(image.attributes.get('aria-hidden'), 'true');
}

assert.equal(createMyAppsPresetGraphic('unknown'), null);
assert.equal(createMyAppsPresetSvg('rhythm'), null);
assert.equal(isKnownMyAppsIconPreset('unknown'), false);

if (previousDocument === undefined) delete globalThis.document;
else globalThis.document = previousDocument;

const source = readFileSync(new URL('./my-apps-icon-presets.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /drawIcon\(|createElementNS|<svg/i, 'all presets use the raster renderer');

console.log('my-apps-icon-presets: 22 preset keys and 22 transparent local raster assets passed');
