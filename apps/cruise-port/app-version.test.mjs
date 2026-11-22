import assert from 'node:assert/strict';
import {
    CRUISE_PORT_APP_VERSION,
    applyVersionDisplay,
    buildReloadUrl,
    reloadAppWithCacheBust
} from './app-version.js';

assert.equal(CRUISE_PORT_APP_VERSION, '1.38.0');
assert.equal(
    buildReloadUrl('https://soundcruise.jp/apps/cruise-port/?tunerDebug=1', 123),
    'https://soundcruise.jp/apps/cruise-port/?tunerDebug=1&_r=123'
);

const display = { textContent: '' };
const button = {
    textContent: 'ページを更新',
    disabled: false,
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); }
};
const iconButton = { ...button, firstElementChild: {}, textContent: '↻', attributes: new Map() };
const documentObject = {
    querySelectorAll(selector) {
        return selector === '.port-app-version-display' ? [display] : [button, iconButton];
    }
};
applyVersionDisplay(documentObject);
assert.equal(display.textContent, 'Ver 1.38.0');

let replacement = '';
assert.equal(reloadAppWithCacheBust({
    documentObject,
    locationObject: {
        href: 'https://soundcruise.jp/apps/cruise-port/',
        replace(url) { replacement = url; }
    },
    timestamp: 456
}), true);
assert.equal(replacement, 'https://soundcruise.jp/apps/cruise-port/?_r=456');
assert.equal(button.disabled, true);
assert.equal(button.textContent, '更新中…');
assert.equal(button.attributes.get('aria-busy'), 'true');

assert.equal(iconButton.disabled, true);
assert.equal(iconButton.attributes.get('aria-label'), '更新中…');
assert.equal(iconButton.textContent, '↻');
assert.equal(reloadAppWithCacheBust({documentObject, locationObject:{replace(){assert.fail('duplicate reload');}}}), false);

console.log('app-version: version display and cache-busting reload tests passed');
