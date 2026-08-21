'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var standardDirectory = path.join(root, 'standard');
var proDirectory = path.join(root, 'pro_r4m8k7n2q9x');
var publicBase = 'https://soundcruise.jp';

function read(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function assertManifest(manifestPath, expectedId) {
    var manifest = JSON.parse(read(manifestPath));
    var manifestUrl = new URL(manifestPath === path.join(standardDirectory, 'manifest.json')
        ? '/apps/rhythm-cruise/standard/manifest.json'
        : '/apps/rhythm-cruise/pro_r4m8k7n2q9x/manifest.json', publicBase);
    var effectiveScope = new URL(manifest.scope, manifestUrl).pathname;
    var effectiveStartUrl = new URL(manifest.start_url, manifestUrl).pathname;

    assert.strictEqual(manifest.id, expectedId, 'manifest uses its explicit edition identity');
    assert.strictEqual(manifest.name, 'リズムクルーズ', 'both editions keep the app display name');
    assert.strictEqual(manifest.short_name, 'リズムクルーズ', 'both editions keep the app short name');
    assert.strictEqual(manifest.start_url, './', 'edition starts from its own directory');
    assert.strictEqual(manifest.scope, './', 'edition scope is limited to its own directory');
    assert(effectiveStartUrl.indexOf(effectiveScope) === 0, 'start URL is inside its manifest scope');
    manifest.icons.forEach(function (icon) {
        assert(fs.existsSync(path.resolve(path.dirname(manifestPath), icon.src)), 'manifest icon exists: ' + icon.src);
    });
    return effectiveScope;
}

var standardHtml = read(path.join(standardDirectory, 'index.html'));
var proHtml = read(path.join(proDirectory, 'index.html'));
var legacyHtml = read(path.join(root, 'index.html'));
var standardScope = assertManifest(path.join(standardDirectory, 'manifest.json'), '/apps/rhythm-cruise/standard/');
var proScope = assertManifest(path.join(proDirectory, 'manifest.json'), '/apps/rhythm-cruise/pro_r4m8k7n2q9x/');

assert.strictEqual(proScope.indexOf(standardScope), -1, 'Standard scope does not contain the Pro path');
assert(standardHtml.includes('<link rel="manifest" href="manifest.json?v=2">'), 'Standard links its sibling manifest');
assert(standardHtml.includes('href="../theme.css?v=1.3.0"'), 'Standard resolves the shared theme from its parent');
assert(standardHtml.includes('src="../script.js?v=1.3.0"'), 'Standard resolves the shared script from its parent');
assert(standardHtml.includes("navigator.serviceWorker.register('../service-worker.js', { scope: './' })"), 'Standard registers the root worker with Standard-only scope');
assert(!legacyHtml.includes('manifest.json'), 'legacy root does not expose a PWA manifest');
assert(legacyHtml.includes("navigator.serviceWorker.getRegistration('./')"), 'legacy root only inspects its own worker registration');
assert(legacyHtml.includes('registration.unregister()'), 'legacy root retires its old worker registration');
assert(legacyHtml.includes("window.location.replace('standard/'"), 'legacy root redirects to Standard after migration cleanup');
assert(proHtml.includes('<link rel="manifest" href="manifest.json?v=4">'), 'Pro retains its own manifest');
assert(proHtml.includes('../../shared/pro-gate.js?v=19'), 'Pro gate reference remains unchanged');

['info.html', 'usage.html', 'terms.html', 'privacy.html', 'mic-correction-help.html'].forEach(function (fileName) {
    var source = read(path.join(root, fileName));
    assert(source.includes("var defaultHome = './standard/index.html';"), fileName + ' returns Standard users to the new entry');
    assert(source.includes('^standard\\/(?:index\\.html)?$'), fileName + ' recognizes the new Standard referrer and stored return path');
});

var clickHelpSource = read(path.join(root, 'click-input-help.html'));
assert(clickHelpSource.includes("'standard/index.html?resume=click-input'"), 'click-input help returns Standard users to the new entry');
assert(clickHelpSource.includes('(?:standard\\/|pro_r4m8k7n2q9x\\/)?index\\.html$'), 'click-input help recognizes both edition referrers');

var legacyInlineScript = legacyHtml.match(/<script>([\s\S]*?)<\/script>/);
assert(legacyInlineScript, 'legacy root contains a migration script');
new Function(legacyInlineScript[1]);

console.log('pwa-structure: sibling Standard/Pro manifests, narrow Standard SW scope, root compatibility cleanup, and icon references OK');
