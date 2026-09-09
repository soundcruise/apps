import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { CRUISE_APP_ICONS, applyHomeCruiseLinks } from './cruise-app-links.js';
import { applyProLinks } from './pro-prompt.js';
import { PRO_INFO_ROUTE } from './pro-prompt.js';
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
test('acquisition CTA is centralized and closes the modal before navigation', () => {
    const source = read('pro-prompt.js');
    assert.equal(PRO_INFO_ROUTE, '#pro-access');
    assert.match(source, /PRO_INFO_ROUTE.*Pro版の入手方法/);
    assert.match(source, /link.addEventListener\('click', close\)/);
    for (const file of ['index.html', 'pro_9a3943176561/index.html']) {
        assert.doesNotMatch(read(file), /Pro版はこちら/);
        assert.equal((read(file).match(/href="#pro-access"/g) || []).length, 2);
    }
});
test('acquisition uses only the established Chord membership and post links', () => {
    const source = read('pro-prompt.js');
    const chord = read('../chord-cruise/pro-access.html');
    const links = source.match(/https:\/\/www.youtube.com\/[^" ]+/g);
    assert.equal(links.length, 2);
    links.forEach(link => assert.ok(chord.includes(link)));
    assert.match(source, /すでに利用権をお持ち/);
    assert.match(read('RELEASE-CHECKS.md'), /未解決/);
});
test('capo number grows without changing the control sizing rules', () => {
    const css = read('style.css');
    assert.match(css, /\.tuner-capo-control output\s*\{[^}]*font-size: calc\(1rem \* var\(--font-scale\)\)/);
    assert.match(css, /grid-template-columns: 44px minmax\(48px, auto\) 44px/);
});
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
test('two quiet Standard links target the information route and disappear in Pro', () => {
    const sections = [0, 1].map(() => ({ anchor: {}, querySelector() { return this.anchor; } }));
    const doc = { querySelectorAll: () => sections };
    applyProLinks(doc, false);
    sections.forEach(s => { assert.equal(s.hidden, false); assert.equal(s.anchor.href, PRO_INFO_ROUTE); });
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
    assert.doesNotMatch(source, /localStorage|indexedDB|passwordHash/);
    assert.doesNotMatch(read('practice-menu-app.js'), /createProPrompt|\.openProPrompt/);
    assert.doesNotMatch(read('cruise-port-edition.js'), /ROOT_COMPATIBILITY_EDITION/);
});
