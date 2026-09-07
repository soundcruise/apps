import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const presetSource = readFileSync(new URL('./my-apps-icon-presets.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

function readPngHeader(name) {
    const bytes = readFileSync(new URL(`./assets/my-app-icons/${name}`, import.meta.url));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${name} PNG signature`);
    assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', `${name} IHDR`);
    return {
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
        colorType: bytes[25]
    };
}

for (const name of ['practice-menu.png', 'gear-list.png', 'tool-tuner.png', 'tool-metronome.png']) {
    const header = readPngHeader(name);
    assert.deepEqual([header.width, header.height], [512, 512], `${name} is 512x512`);
    assert.equal(header.colorType, 6, `${name} is RGBA with alpha`);
}

for (const name of ['tool-tuner.png', 'tool-metronome.png']) {
    const bytes = readFileSync(new URL(`./assets/my-app-icons/${name}`, import.meta.url));
    assert.equal(bytes[25], 6, `${name} has alpha channel`);
}

assert.match(markup, /id="tuner-card"[\s\S]*?assets\/my-app-icons\/tool-tuner\.png\?v=0\.13\.1/);
assert.match(markup, /id="metronome-card"[\s\S]*?assets\/my-app-icons\/tool-metronome\.png\?v=0\.13\.1/);
assert.doesNotMatch(markup, /id="tuner-card"[\s\S]*?assets\/my-app-icons\/tuner\.png/);
assert.doesNotMatch(markup, /id="metronome-card"[\s\S]*?assets\/my-app-icons\/metronome\.png/);
assert.match(presetSource, /`\.\/assets\/my-app-icons\/\$\{key\}\.png`/);
assert.doesNotMatch(presetSource, /tool-tuner\.png|tool-metronome\.png/);
assert.match(markup, /id="practice-menu-card"[\s\S]*?assets\/my-app-icons\/practice-menu\.png\?v=0\.12\.8/);
assert.match(markup, /id="wishlist-card"[\s\S]*?assets\/my-app-icons\/gear-list\.png\?v=0\.12\.8/);
assert.doesNotMatch(markup, /id="practice-menu-card"[\s\S]*?assets\/my-app-icons\/rhythm\.png/);
assert.match(markup, /id="practice-menu-card" href="#practice-menu"/);
assert.match(markup, /id="wishlist-card" href="#wishlist"/);
for (const baseline of [86, 90, 60, 39]) {
    assert.match(styles, new RegExp(`calc\\(${baseline}px \\* 0\\.7\\)`));
}
for (const baseline of [80, 84, 56, 36]) {
    assert.match(styles, new RegExp(`calc\\(${baseline}px \\* 0\\.9\\)`));
}
assert.match(presetSource, /assets\/my-app-icons\/rhythm\.png|my-app-icons\/rhythm\.png/);

console.log('tool-icons: dedicated Practice Menu and Gear List assets, routes, and formal scales passed');
