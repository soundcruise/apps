import test from 'node:test';
import assert from 'node:assert/strict';
import { createPortProBoundary } from '../js/core/port-pro-boundary.mjs';

test('component boundary remains closed without a shared gate and source', async () => {
    const boundary = createPortProBoundary();
    assert.deepEqual(await boundary.authorize(), { ok: false, reason: 'pro-source-unavailable' });
    boundary.dispose();
    assert.deepEqual(await boundary.authorize(), { ok: false, reason: 'disposed' });
});

test('even a validated source cannot bypass missing writer admission', async t => {
    const original = Object.getOwnPropertyDescriptors(globalThis);
    t.after(() => { for (const key of ['document','__SOUNDCRUISE_PRO_GATE__','__soundCruiseClearGate','SoundCruiseProOperationSource']) {
        if (original[key]) Object.defineProperty(globalThis, key, original[key]); else delete globalThis[key];
    }});
    globalThis.document = { body: { classList: { contains: () => false } }, getElementById: () => null };
    globalThis.__SOUNDCRUISE_PRO_GATE__ = {};
    globalThis.__soundCruiseClearGate = () => {};
    let revision = 'r1', revoked = false, release;
    const auth = { credential: 'fixture', generation: 1, sessionVersion: 1 };
    globalThis.SoundCruiseProOperationSource = { read: () => ({ auth, revision, revoked }), validate: async () => ({ ok: true }) };
    const boundary = createPortProBoundary();
    assert.deepEqual(await boundary.authorize(), { ok: false, reason: 'writer-admission-unavailable' });
    revoked = true;
    assert.deepEqual(await boundary.authorize(), { ok: false, reason: 'pro-source-revoked' });
    revoked = false;
    globalThis.SoundCruiseProOperationSource.validate = () => new Promise(resolve => { release = resolve; });
    const pending = boundary.authorize();
    revision = 'r2'; release({ ok: true });
    assert.deepEqual(await pending, { ok: false, reason: 'pro-source-stale' });
    const pending2 = boundary.authorize();
    boundary.invalidate(); release({ ok: true });
    assert.deepEqual(await pending2, { ok: false, reason: 'pro-source-stale' });
});
