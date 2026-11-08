import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listComponents, getAppVersion } from '../js/core/component-metadata.mjs';
import { verifyComponentVersion } from '../js/core/version-reader.mjs';
import { RELEASE_FILES } from '../scripts/package-port-pc.mjs';

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

test('F3: published internal ESM dependencies resolve inside the release and share the current Studio cache identity', () => {
    const refs=[];
    for (const name of RELEASE_FILES.filter(n=>n.endsWith('.mjs'))) {
        const file=new URL(name,studio);
        for (const match of read(file).matchAll(/(?:from\s*|import\s*\()\s*['"]([.][^'"\s]+)['"]/g)) {
            const ref=new URL(match[1],file);
            if(!ref.pathname.startsWith(studio.pathname))continue;
            assert(RELEASE_FILES.includes(ref.pathname.slice(studio.pathname.length)),name+': missing release dependency '+match[1]);
            if(ref.search)assert.equal(ref.search,'?v='+getAppVersion('cruise-studio'),name+': '+match[1]);
            refs.push(ref);
        }
    }
    assert(refs.some(u=>u.pathname.endsWith('/form-adapter.mjs')));
    assert(refs.some(u=>u.pathname.endsWith('/pattern-adoption.mjs')));
});

// Fixed patch-release expectation plus traversal of the actual HTML module entries.
// Owner versions are still checked against their independent source declarations above.
test('0.87.0 release identity and recursively reachable Studio module cache paths', () => {
    assert.equal(getAppVersion('cruise-studio'), '0.87.0');
    assert.match(html, /id="studio-version">v0\.87\.0<\/span>/);
    const visited = new Set();
    function visit(url) {
        if (!url.pathname.startsWith(studio.pathname) || !url.pathname.endsWith('.mjs')) return;
        if (url.search) assert.equal(url.search, '?v=0.87.0', url.href);
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
