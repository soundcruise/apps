import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    MY_APPS_ICON_PRESETS,
    createMyAppsPresetSvg,
    getMyAppsIconPreset,
    isKnownMyAppsIconPreset
} from './my-apps-icon-presets.js';

class FakeSvgElement {
    constructor(name) {
        this.name = name;
        this.attributes = new Map();
        this.children = [];
    }

    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    append(...children) { this.children.push(...children); }
}

const previousDocument = globalThis.document;
globalThis.document = { createElementNS: (_namespace, name) => new FakeSvgElement(name) };

assert.equal(MY_APPS_ICON_PRESETS.length, 22);
assert.equal(new Set(MY_APPS_ICON_PRESETS.map((preset) => preset.key)).size, 22, 'keys are unique');
for (const preset of MY_APPS_ICON_PRESETS) {
    assert.equal(isKnownMyAppsIconPreset(preset.key), true);
    assert.equal(getMyAppsIconPreset(preset.key).label, preset.label);
    const svg = createMyAppsPresetSvg(preset.key);
    assert.equal(svg.name, 'svg');
    assert.equal(svg.attributes.get('viewBox'), '0 0 64 64');
    assert.equal(svg.attributes.get('stroke-width'), '2.2');
    assert.equal(svg.attributes.get('stroke-linecap'), 'round');
    assert.equal(svg.attributes.get('stroke-linejoin'), 'round');
    assert.equal(svg.attributes.get('aria-hidden'), 'true');
    assert(svg.children.length > 0, `${preset.key} has visible geometry`);
}
assert.equal(createMyAppsPresetSvg('unknown'), null);
assert.equal(isKnownMyAppsIconPreset('unknown'), false);

if (previousDocument === undefined) delete globalThis.document;
else globalThis.document = previousDocument;

const source = readFileSync(new URL('./my-apps-icon-presets.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /innerHTML|outerHTML|<svg/i, 'preset SVG is created only with trusted DOM factories');

console.log('my-apps-icon-presets: 22 trusted SVG presets and allowlist integrity tests passed');
