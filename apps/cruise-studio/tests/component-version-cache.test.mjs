import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listComponents, getAppVersion } from '../js/core/component-metadata.mjs';
import { verifyComponentVersion } from '../js/core/version-reader.mjs';

const studio = new URL('../', import.meta.url), root = new URL('../../../', import.meta.url);
const read = url => readFileSync(url, 'utf8');
const html = read(new URL('index.html', studio));
const assetRefs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => new URL(m[1], new URL('index.html', studio)));
const scriptRefs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => new URL(m[1], new URL('index.html', studio)));

test('F3: all six metadata values agree with independent owner source declarations', () => {
    assert.equal(listComponents().length, 6);
    for (const component of listComponents()) {
        assert.equal(verifyComponentVersion(component, read(new URL(component.versionSource.path, root))), component.appVersion);
    }
});

test('F3: actual Port ESM import query follows its source, not a duplicated mirror', () => {
    const source = read(new URL('js/core/component-metadata.mjs', studio));
    const refs = [...source.matchAll(/from\s+['"]([^'"]*cruise-port[^'"]*)['"]/g)].map(m => new URL(m[1], new URL('js/core/component-metadata.mjs', studio)));
    assert.equal(refs.length, 1);
    assert.equal(refs[0].pathname, new URL('apps/cruise-port/app-version.js', root).pathname);
    assert.equal(refs[0].search, '?v=' + getAppVersion('cruise-port'));
});

test('F3: Chord pure module HTML paths and queries match owner release HTML', () => {
    const owner = read(new URL('apps/chord-cruise/standard/index.html', root));
    const refs = scriptRefs.filter(u => u.pathname.includes('/chord-cruise/'));
    assert.equal(refs.length, 3);
    for (const name of ['music-theory', 'chord-model', 'caged-forms']) {
        const path = 'js/core/' + name + '.js?v=' + getAppVersion('chord-cruise');
        assert.ok(owner.includes(path), 'owner reference: ' + path);
        assert.ok(refs.some(u => u.href === new URL('apps/chord-cruise/' + path, root).href), 'Studio reference: ' + path);
    }
});

test('F3: every Studio HTML product asset has the current Studio cache key', () => {
    const refs = assetRefs.filter(u => u.pathname.startsWith(studio.pathname) && /\.(js|mjs|css)$/.test(u.pathname) && !u.pathname.includes('/vendor/'));
    assert.ok(refs.length > 30);
    for (const ref of refs) assert.equal(ref.search, '?v=' + getAppVersion('cruise-studio'), ref.href);
});

test('F3: versioned internal ESM dependencies use the same Studio cache identity', () => {
    function visit(url) {
        return readdirSync(url, { withFileTypes: true }).flatMap(e => e.isDirectory() ? visit(new URL(e.name + '/', url)) : e.name.endsWith('.mjs') ? [new URL(e.name, url)] : []);
    }
    let count = 0;
    for (const file of visit(new URL('js/', studio))) {
        for (const match of read(file).matchAll(/['"]([.][^'"\s]*\?v=[^'"\s]+)['"]/g)) {
            const ref = new URL(match[1], file);
            if (!ref.pathname.startsWith(studio.pathname)) continue;
            assert.equal(ref.search, '?v=' + getAppVersion('cruise-studio'), fileURLToPath(file) + ': ' + match[1]);
            count++;
        }
    }
    assert.ok(count >= 10);
});

// Fixed patch-release expectation plus traversal of the actual HTML module entries.
// Owner versions are still checked against their independent source declarations above.
test('0.49.0 release identity and recursively reachable Studio module cache paths', () => {
    assert.equal(getAppVersion('cruise-studio'), '0.49.0');
    assert.match(html, /id="studio-version">v0\.49\.0<\/span>/);
    const visited = new Set();
    function visit(url) {
        if (!url.pathname.startsWith(studio.pathname) || !url.pathname.endsWith('.mjs')) return;
        if (url.search) assert.equal(url.search, '?v=0.49.0', url.href);
        if (visited.has(url.pathname)) return;
        visited.add(url.pathname);
        const content = read(new URL(url.pathname, 'file://'));
        for (const match of content.matchAll(/(?:from\s*|import\s*\(\s*)['"]([.][^'"]+)['"]/g)) {
            visit(new URL(match[1], url));
        }
    }
    for (const ref of scriptRefs) visit(ref);
    assert.ok(visited.size >= 10);
    assert.ok([...visited].some(path => path.endsWith('/chord/form-panel.mjs')));
    assert.ok([...visited].some(path => path.endsWith('/chord/form-adoption.mjs')));
    assert.ok([...visited].some(path => path.endsWith('/core/component-metadata.mjs')));
});
