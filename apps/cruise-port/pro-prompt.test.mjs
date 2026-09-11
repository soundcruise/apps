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
test('acquisition uses the established Forte membership and post links without presenting Pro as a standalone product', () => {
    const source = read('pro-prompt.js');
    const chord = read('../chord-cruise/pro-access.html');
    const links = source.match(/https:\/\/www.youtube.com\/[^" ]+/g);
    assert.equal(links.length, 2);
    links.forEach(link => assert.ok(chord.includes(link)));
    assert.match(source, /フォルテ」の特典/);
    assert.match(source, /1\. フォルテに登録/);
    assert.match(source, /2\. メンバー限定投稿を確認/);
    assert.match(source, /3\. Pro版を利用/);
    assert.match(source, /すでに利用資格と案内情報をお持ち/);
    assert.doesNotMatch(source, /URLとパスワード|Pro版を購入|Pro版を買う|Pro版の価格|Pro単体販売/);
    const releaseChecks = read('RELEASE-CHECKS.md');
    assert.match(releaseChecks, /フォルテ」会員向け特典/);
    assert.match(releaseChecks, /Pro単体販売は行わない/);
    assert.match(releaseChecks, /限定投稿内で案内/);
    assert.doesNotMatch(releaseChecks, /未解決|暫定採用/);
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
