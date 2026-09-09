import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeProAuthSettings } from './pro-auth-settings.js';

function fixture(pro = true, confirmed = true, available = true) {
    const nodes = new Map(['settings-pro-auth', 'settings-pro-auth-reset', 'settings-pro-auth-error'].map(id => [id, { hidden: true, addEventListener(type, fn) { this.click = fn; } }]));
    const calls = [];
    const win = {
        confirm(message) { calls.push(['confirm', message]); return confirmed; },
        location: { reload() { calls.push(['reload']); } }
    };
    if (available) win.__soundCruiseClearGate = () => calls.push(['api']);
    initializeProAuthSettings({ querySelector: selector => nodes.get(selector.slice(1)) }, win, () => pro);
    return { nodes, calls, click: () => nodes.get('settings-pro-auth-reset').click() };
}
test('Pro displays the auth section; Standard hides it and cannot invoke reset', () => {
    assert.equal(fixture().nodes.get('settings-pro-auth').hidden, false);
    const f = fixture(false); assert.equal(f.nodes.get('settings-pro-auth').hidden, true);
    f.click(); assert.deepEqual(f.calls, []);
});
test('cancel preserves auth and does not reload', () => {
    const f = fixture(true, false); f.click();
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], 'confirm');
    assert.match(f.calls[0][1], /データは削除されません/);
});
test('confirmation invokes the official API before reloading', () => {
    const f = fixture(); f.click();
    assert.deepEqual(f.calls.map(c => c[0]), ['confirm', 'api', 'reload']);
});
test('missing shared API reports failure without a fallback deletion or reload', () => {
    const f = fixture(true, true, false); f.click();
    assert.equal(f.nodes.get('settings-pro-auth-error').hidden, false);
    assert.deepEqual(f.calls.map(c => c[0]), ['confirm']);
});
test('reset adapter uses central Edition and never accesses application storage', () => {
    const source = readFileSync(new URL('./pro-auth-settings.js', import.meta.url), 'utf8');
    assert.match(source, /import \{ isProEdition \} from/);
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|caches|serviceWorker|removeItem|pathname/);
    for (const file of ['index.html', 'pro_9a3943176561/index.html']) {
        const html = readFileSync(new URL(file, import.meta.url), 'utf8');
        assert.match(html, /id="settings-pro-auth"[^>]*hidden/);
        assert.match(html, /id="settings-pro-auth-reset"/);
    }
});
