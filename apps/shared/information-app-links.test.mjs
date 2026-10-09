import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('information-app-links.js');
const css = read('information-app-links.css');
const entries = [
    ['port', 'cruise-port', '', 'pro_9a3943176561'],
    ['pitch', 'pitch-cruise', 'standard', 'pro_x9v7q2m8'],
    ['fretboard', 'fretboard_cruise', 'standard', 'pro_a9f4k7q2m8z'],
    ['rhythm', 'rhythm-cruise', 'standard', 'pro_r4m8k7n2q9x'],
    ['chord', 'chord-cruise', 'standard', 'pro_k7m4q9v2x8']
];
const window = {};
for (const name of ['localStorage', 'sessionStorage', 'fetch', 'SoundCruiseProDeviceSession']) {
    Object.defineProperty(window, name, { get() { throw Error('Series links must not touch auth, data or network'); } });
}
vm.runInNewContext(source, { window });
const helper = window.SoundCruiseInformationLinks;

for (const [id, directory] of entries.slice(1)) {
    for (const edition of ['standard', 'pro']) {
        test(`${id} ${edition}: four native links, canonical order, correct edition and official icons`, () => {
            const links = helper.linksFor(id, edition);
            assert.equal(links.length, 4);
            assert.deepEqual(Array.from(links, link => link.id), entries.filter(e => e[0] !== id).map(e => e[0]));
            assert.equal(links[0].id, 'port');
            for (const link of links) {
                const [, appDirectory, standard, pro] = entries.find(e => e[0] === link.id);
                const segment = edition === 'pro' ? pro : standard;
                assert.equal(link.href, `/apps/${appDirectory}/${segment ? `${segment}/` : ''}`);
                assert.ok(existsSync(new URL(`../..${link.href}index.html`, import.meta.url)), link.href);
                assert.ok(existsSync(new URL(`../..${link.icon}`, import.meta.url)), link.icon);
                const manifest = JSON.parse(read(`../${appDirectory}/${segment ? `${segment}/` : ''}manifest.json`));
                assert.equal(manifest.display, 'standalone');
            }
            const html = read(`../${directory}/info.html`);
            assert.match(html, /aria-label="クルーズシリーズ" hidden/);
            assert.match(html, /information-app-links\.css\?v=1/);
            assert.match(html, /information-app-links\.js\?v=2/);
            assert.match(html, /利用規約/);
            assert.match(html, /プライバシーポリシー/);
            assert.match(html, /お問い合わせ/);
            assert.match(html, /YouTube Chトップ/);
        });
    }
}

test('unknown edition/app never produces incorrect or attacker-controlled destinations; beta uses Standard', () => {
    for (const edition of ['', 'unknown', 'Pro', 'javascript:alert(1)']) assert.equal(helper.linksFor('pitch', edition).length, 0);
    assert.equal(helper.linksFor('<img onerror=alert(1)>', 'pro').length, 0);
    assert.deepEqual(Array.from(helper.linksFor('pitch', 'beta'), x => x.href), Array.from(helper.linksFor('pitch', 'standard'), x => x.href));
});

test('renderer creates semantic same-tab links with decorative icons, preserves surrounding UI and is idempotent', () => {
    function element(tag) {
        return { tag, children: [], attrs: {}, ownerDocument: document,
            append(...children) { this.children.push(...children); },
            appendChild(child) { this.children.push(child); return child; },
            setAttribute(key, value) { this.attrs[key] = value; },
            replaceChildren() { this.children = []; } };
    }
    const document = { createElement: element };
    const container = element('nav');
    helper.render(container, 'pitch', 'pro');
    assert.equal(container.hidden, false);
    assert.equal(container.children[0].textContent, 'クルーズapps');
    assert.equal(container.attrs['aria-label'], 'クルーズapps');
    const list = container.children[1];
    assert.equal(list.tag, 'ul');
    assert.equal(list.children.length, 4);
    for (const item of list.children) {
        const link = item.children[0];
        assert.equal(item.tag, 'li');
        assert.equal(link.tag, 'a');
        assert.ok(link.href.startsWith('/apps/'));
        assert.equal(link.target, undefined);
        assert.equal(link.children[0].alt, '');
        assert.equal(link.children[0].width, 40);
        assert.ok(link.children[1].textContent.length > 0);
        assert.equal(link.children[2].attrs['aria-hidden'], 'true');
    }
    helper.render(container, 'pitch', 'standard');
    assert.equal(container.children.length, 2);
    helper.render(container, 'pitch', 'unknown');
    assert.equal(container.hidden, true);
    assert.equal(container.children.length, 0);
    assert.doesNotMatch(source, /innerHTML|window\.open|location\.|addEventListener/);
});

test('layout has a visible keyboard focus and generous targets without fixed-width clipping', () => {
    assert.match(css, /:focus-visible/);
    assert.match(css, /min-height: 60px/);
    assert.match(css, /min-width: 0/);
    assert.match(css, /overflow-wrap: anywhere/);
    assert.match(css, /data-theme="gray"/);
    assert.match(css, /data-theme="light"/);
});

test('every app hands its existing resolved edition to the shared renderer; explicit Pro precedes stale referrer', () => {
    for (const [id, directory, , pro] of entries.slice(1)) {
        const html = read(`../${directory}/info.html`);
        const routing = id === 'chord' ? read('../chord-cruise/info-routing.js') : html;
        assert.ok(routing.includes(`'${id}', resolvedEdition)`));
        const resolver = routing.slice(routing.indexOf('function resolveHomePath()'));
        assert.ok(resolver.indexOf("if (editionParam === 'pro')") < resolver.indexOf('var referrerHome'));
        assert.ok(routing.includes(`./${pro}/index.html`));
        assert.match(routing, /window\.history\.back\(\)/);
        assert.match(routing, /event\.key === 'Escape'/);
    }
});

for (const [id, directory, , pro] of entries.slice(1)) {
    test(`${id}: explicit edition wins stale state; referrer/session fallback remains edition-correct`, () => {
        const routing = id === 'chord' ? read('../chord-cruise/info-routing.js') : read(`../${directory}/info.html`);
        const functions = routing.slice(routing.indexOf('function normalizeEditionHome('), routing.indexOf('var homePath = resolveHomePath();'));
        const base = `https://soundcruise.jp/apps/${directory}/`;
        const standardHome = `${base}standard/index.html`;
        const proHome = `${base}${pro}/index.html`;
        const cases = [
            { edition: 'pro', referrer: standardHome, stored: standardHome, expected: proHome },
            { edition: 'standard', referrer: proHome, stored: proHome, expected: standardHome },
            { edition: 'pro', referrer: '', stored: '', expected: proHome },
            { edition: null, referrer: proHome, stored: standardHome, expected: proHome },
            { edition: null, referrer: '', stored: proHome, expected: proHome },
            { edition: null, referrer: 'https://example.com/pro/', stored: '', expected: standardHome }
        ];
        for (const item of cases) {
            const context = { URL, window: { location: new URL(`${base}info.html`) }, document: { referrer: item.referrer },
                defaultHome: './standard/index.html', proHome: `./${pro}/index.html`, editionHomeStorageKey: 'qa', editionParam: item.edition,
                sessionStorage: { getItem: () => item.stored, setItem() {} } };
            const home = vm.runInNewContext(`${functions}\nresolveHomePath();`, context);
            assert.equal(new URL(home, base).href, item.expected);
            const edition = home === proHome ? 'pro' : 'standard';
            assert.equal(helper.linksFor(id, edition)[0].href, edition === 'pro' ? '/apps/cruise-port/pro_9a3943176561/' : '/apps/cruise-port/');
        }
    });
}
