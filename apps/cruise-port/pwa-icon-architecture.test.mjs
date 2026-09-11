import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const directory = path.dirname(fileURLToPath(import.meta.url));
const standardHtml = readFileSync(path.join(directory, 'index.html'), 'utf8');
const proDirectory = path.join(directory, 'pro_9a3943176561');
const proHtml = readFileSync(path.join(proDirectory, 'index.html'), 'utf8');

function readPngSize(filePath) {
    const bytes = readFileSync(filePath);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${filePath} is a PNG`);
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function assertManifest({ manifestDirectory, expectedId, expectedName, expectedPrefix }) {
    const manifest = JSON.parse(readFileSync(path.join(manifestDirectory, 'manifest.json'), 'utf8'));
    assert.equal(manifest.id, expectedId);
    assert.equal(manifest.name, expectedName);
    assert.equal(manifest.start_url, './');
    assert.equal(manifest.scope, './');
    assert.equal(manifest.display, 'standalone');
    assert.deepEqual(manifest.icons.map(({ sizes, purpose }) => [sizes, purpose]), [
        ['192x192', 'any'],
        ['512x512', 'any'],
        ['192x192', 'maskable'],
        ['512x512', 'maskable']
    ]);
    for (const icon of manifest.icons) {
        assert.match(icon.src, new RegExp(`${expectedPrefix}/icon(?:-maskable)?-(?:192|512)\\.png\\?v=0\\.27\\.1$`));
        const relativePath = icon.src.split('?')[0];
        const target = path.resolve(manifestDirectory, relativePath);
        assert.equal(existsSync(target), true, `manifest icon exists: ${icon.src}`);
        const size = readPngSize(target);
        assert.equal(`${size.width}x${size.height}`, icon.sizes, `manifest icon size matches: ${icon.src}`);
    }
}

test('Standard and Pro manifests use distinct edition identities and icon sets', () => {
    assertManifest({
        manifestDirectory: directory,
        expectedId: '/apps/cruise-port/',
        expectedName: 'クルーズポート',
        expectedPrefix: '\\./assets/app-icons/standard'
    });
    assertManifest({
        manifestDirectory: proDirectory,
        expectedId: '/apps/cruise-port/pro_9a3943176561/',
        expectedName: 'クルーズポート Pro',
        expectedPrefix: '\\.\\./assets/app-icons/pro'
    });
});

test('each edition references only its formal favicon, Apple icon, and cache-busted manifest', () => {
    assert.match(standardHtml, /<link rel="manifest" href="\.\/manifest\.json\?v=0\.27\.1">/);
    assert.match(standardHtml, /apple-touch-icon[^>]+assets\/app-icons\/standard\/apple-touch-icon-180\.png\?v=0\.27\.1/);
    assert.match(standardHtml, /rel="icon"[^>]+assets\/app-icons\/standard\/favicon-32\.png\?v=0\.27\.1/);
    assert.match(proHtml, /<link rel="manifest" href="\.\/manifest\.json\?v=0\.27\.1">/);
    assert.match(proHtml, /apple-touch-icon[^>]+assets\/app-icons\/pro\/apple-touch-icon-180\.png\?v=0\.27\.1/);
    assert.match(proHtml, /rel="icon"[^>]+assets\/app-icons\/pro\/favicon-32\.png\?v=0\.27\.1/);
    assert.doesNotMatch(standardHtml, /data:,/);
    assert.doesNotMatch(proHtml, /data:,/);
});

test('the normal and Android maskable icon asset dimensions are complete for both editions', () => {
    for (const edition of ['standard', 'pro']) {
        const assetDirectory = path.join(directory, 'assets', 'app-icons', edition);
        for (const [name, expected] of [
            ['icon-192.png', 192],
            ['icon-512.png', 512],
            ['icon-maskable-192.png', 192],
            ['icon-maskable-512.png', 512],
            ['apple-touch-icon-180.png', 180],
            ['favicon-32.png', 32]
        ]) {
            const size = readPngSize(path.join(assetDirectory, name));
            assert.deepEqual(size, { width: expected, height: expected }, `${edition}/${name} is square`);
        }
    }
});
