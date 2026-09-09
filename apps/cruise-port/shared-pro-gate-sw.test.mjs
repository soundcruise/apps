import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const shared = readFileSync(new URL('../shared/pro-gate.js', import.meta.url), 'utf8');
const pitch = readFileSync(new URL('../pitch-cruise/pro_x9v7q2m8/pro-gate-hash.js', import.meta.url), 'utf8');
const AUTH = 'soundCruiseProAuth';
const SW = 'soundcruise_pro_sw_gate_v';
const token = JSON.stringify({ v: 1, at: 1, src: 'QA SP1.2' });

function fixture({ known, config = 8, source = shared, values = new Map([[AUTH, token], ['qa-unrelated', 'keep']]), search = '', failWrite = false } = {}) {
    if (known !== undefined) values.set(SW, known);
    const operations = [], navigations = [], replacements = [], docEvents = new Map(), swEvents = new Map();
    let href = 'https://example.test/pro/?qa=1';
    const location = { hostname: 'localhost', protocol: 'http:', pathname: '/pro/', search, hash: '', reload() { navigations.push('reload'); } };
    Object.defineProperty(location, 'href', { get: () => href, set(value) { href = value; navigations.push(value); } });
    const localStorage = {
        getItem: key => values.get(key) ?? null,
        setItem(key, value) { if (failWrite) throw Error('write unavailable'); operations.push(['set', key]); values.set(key, String(value)); },
        removeItem(key) { operations.push(['remove', key]); values.delete(key); }
    };
    const document = {
        readyState: 'loading', cookie: '',
        addEventListener(type, listener) { docEvents.set(type, listener); },
        getElementById() { return null; },
        createElement() { throw Error('GATE_REQUIRED'); }
    };
    const window = { __SOUNDCRUISE_PRO_GATE__: { passwordHash: '0'.repeat(64), gateVersion: config }, location, TextEncoder, crypto: { subtle: {} } };
    const context = vm.createContext({ window, location, document, localStorage, navigator: { serviceWorker: { addEventListener(type, listener) { swEvents.set(type, listener); } } },
        history: { replaceState(...args) { replacements.push(args[2]); } }, TextEncoder, URLSearchParams, Uint8Array, ArrayBuffer });
    vm.runInContext(source, context, { filename: source === shared ? 'shared-pro-gate.js' : 'pitch-pro-gate.js' });
    return { values, operations, navigations, replacements, window, boot: () => docEvents.get('DOMContentLoaded')(),
        notify: (version, resetGate = false) => swEvents.get('message')({ data: { type: 'PRO_GATE_INVALIDATE', version, resetGate } }) };
}

function preserved(f) {
    assert.equal(f.values.get(AUTH), token);
    assert.equal(f.operations.filter(([operation, key]) => operation === 'remove' && key === AUTH).length, 0);
    assert.equal(f.navigations.length, 0);
    assert.equal(f.values.get('qa-unrelated'), 'keep');
}

test('missing SW record + current generation preserves auth without reload', () => {
    const f = fixture(); f.notify(8, true); preserved(f); assert.equal(f.values.get(SW), '8');
});
test('missing SW record + old Standard generation records page baseline, not old notice', () => {
    const f = fixture(); f.notify(4); f.notify(8, true); preserved(f); assert.equal(f.values.get(SW), '8');
});
test('missing SW record + genuinely newer generation invalidates auth', () => {
    const f = fixture(); f.notify(9, true);
    assert.equal(f.values.has(AUTH), false); assert.equal(f.values.get(SW), '9');
    assert.deepEqual(f.navigations, ['https://example.test/pro/?qa=1&resetGate=1']);
});
test('known same or older notice preserves auth and known generation', () => {
    const f = fixture({ known: '8' }); f.notify(8, true); f.notify(4, true); preserved(f); assert.equal(f.values.get(SW), '8');
});
test('known N -> N+1 still invalidates even when the page config is already N+1', () => {
    const f = fixture({ known: '8', config: 9 }); f.notify(9);
    assert.equal(f.values.has(AUTH), false); assert.equal(f.values.get(SW), '9'); assert.equal(f.navigations.length, 1);
});
test('malformed notification generations cannot write, clear, or reload', () => {
    const f = fixture();
    for (const value of [undefined, null, '', ' ', '8junk', '8.5', '1e2', -1, 8.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, {}, [], true]) f.notify(value, true);
    preserved(f); assert.deepEqual(f.operations, []);
});
test('malformed saved generations use the page baseline without deleting valid auth', () => {
    for (const known of ['', ' ', 'bad', '8junk', '-1', '8.5', '9007199254740992']) {
        const f = fixture({ known }); f.notify(8, true); preserved(f); assert.equal(f.values.get(SW), '8');
    }
});
test('malformed saved generation does not suppress a real newer notification', () => {
    const f = fixture({ known: 'invalid' }); f.notify(9); assert.equal(f.values.has(AUTH), false); assert.equal(f.navigations.length, 1);
});
test('invalid page baseline cannot turn an unrecorded notice into auth deletion', () => {
    const f = fixture({ config: 'invalid' }); f.notify(8); preserved(f); assert.deepEqual(f.operations, []);
});
test('explicit reset API still clears shared and legacy auth but not app data', () => {
    const f = fixture(); f.window.__soundCruiseClearGate();
    assert.deepEqual(f.operations, [['remove', AUTH], ['remove', 'soundcruise_pro_gate_rotation'], ['remove', 'pitchTrainerProGateOk']]);
    assert.equal(f.values.get('qa-unrelated'), 'keep');
});
test('resetGate=1 still clears auth and removes only that query parameter', () => {
    const f = fixture({ search: '?resetGate=1&keep=1' });
    assert.throws(f.boot, /GATE_REQUIRED/); assert.equal(f.values.has(AUTH), false); assert.deepEqual(f.replacements, ['/pro/?keep=1']);
});
test('shared token validation is unchanged and malformed reads do not delete records', () => {
    const f = fixture(); assert.doesNotThrow(f.boot); assert.equal(f.values.get(AUTH), token);
    for (const value of ['bad-json', JSON.stringify({ v: 2 }), JSON.stringify({ v: '1' }), 'null']) {
        const g = fixture({ values: new Map([[AUTH, value]]) }); assert.throws(g.boot, /GATE_REQUIRED/); assert.equal(g.values.get(AUTH), value);
    }
});
test('Pitch legacy auth still recreates the existing shared token shape', () => {
    const values = new Map([['soundcruise_pro_gate_rotation', 'pitch-cruise-pro-gate-v8']]);
    const f = fixture({ source: pitch, values }); f.boot();
    assert.equal(JSON.parse(values.get(AUTH)).v, 1); assert.deepEqual(Object.keys(JSON.parse(values.get(AUTH))).sort(), ['at', 'src', 'v']);
    assert.equal(values.get('soundcruise_pro_gate_rotation'), 'pitch-cruise-pro-gate-v8');
});
test('Pitch shared-token startup and unknown-version behavior remain compatible', () => {
    const f = fixture({ source: pitch }); f.boot(); f.notify(8, true); preserved(f);
});
test('repeated notifications do not repeatedly invalidate the same generation', () => {
    const f = fixture(); f.notify(8); f.notify('8'); f.notify(4); preserved(f);
    f.notify(9); f.notify(9, true); f.notify(8);
    assert.equal(f.navigations.length, 1); assert.equal(f.operations.filter(([operation, key]) => operation === 'remove' && key === AUTH).length, 1);
});
test('two tabs sharing storage preserve auth on simultaneous-generation notices', () => {
    const values = new Map([[AUTH, token], ['qa-unrelated', 'keep']]);
    const a = fixture({ values }), b = fixture({ values });
    a.notify(4); b.notify(8, true); a.notify(8, true); preserved(a); preserved(b);
    a.notify(9); b.notify(9); assert.equal(values.has(AUTH), false); assert.equal(a.navigations.length + b.navigations.length, 1);
});
test('baseline write failure remains non-destructive; newer notices still invalidate', () => {
    const f = fixture({ failWrite: true }); f.notify(8, true); preserved(f);
    f.notify(9); assert.equal(f.values.has(AUTH), false); assert.equal(f.navigations.length, 1);
});
