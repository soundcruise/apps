import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { CRUISE_APP_ICONS, applyHomeCruiseLinks } from './cruise-app-links.js';
import { applyProLinks } from './pro-prompt.js';
import { PRO_ENTRY_PATH } from './cruise-port-edition.js';
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
test('both editions use existing formal icons without changing the assets', () => {
    for (const edition of ['standard', 'pro']) {
        const links = Object.keys(CRUISE_APP_ICONS).map(key => ({ dataset: { cruiseApp: key }, image: {}, querySelector() { return this.image; }, setAttribute() {} }));
        applyHomeCruiseLinks({ querySelectorAll: () => links }, edition);
        for (const link of links) {
            assert.equal(link.image.src, CRUISE_APP_ICONS[link.dataset.cruiseApp][edition]);
            assert.ok(existsSync(new URL('../..' + link.image.src, import.meta.url)));
        }
    }
});
test('two quiet Standard links target the Pro entry and disappear in Pro', () => {
    const sections = [0, 1].map(() => ({ anchor: {}, querySelector() { return this.anchor; } }));
    const doc = { querySelectorAll: () => sections };
    applyProLinks(doc, false);
    sections.forEach(s => { assert.equal(s.hidden, false); assert.equal(s.anchor.href, PRO_ENTRY_PATH); });
    applyProLinks(doc, true); sections.forEach(s => assert.equal(s.hidden, true));
    for (const html of [read('index.html'), read('pro_9a3943176561/index.html')]) {
        assert.equal((html.match(/data-standard-pro-link/g) || []).length, 2);
        assert.match(html, /port-pro-badge" aria-hidden="true"/);
    }
});
test('prompt is a reusable foundation with no hidden QA entry or storage side effects', () => {
    const source = read('pro-prompt.js');
    assert.match(source, /role="dialog" aria-modal="true" aria-labelledby=/);
    assert.match(source, /Escape/); assert.match(source, /returnFocus.*focus/);
    assert.doesNotMatch(source, /localStorage|indexedDB|target="_blank"|passwordHash/);
    assert.doesNotMatch(read('practice-menu-app.js'), /createProPrompt|\.openProPrompt/);
    assert.doesNotMatch(read('cruise-port-edition.js'), /ROOT_COMPATIBILITY_EDITION/);
});
