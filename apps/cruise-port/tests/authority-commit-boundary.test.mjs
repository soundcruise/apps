import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationFixture, sealed } from './migration-fixture.mjs';
import { createFixtureLocks } from '../../shared/sync-account/test-fixtures/web-locks.mjs';
import { revokeIsolatedFence, changeIsolatedIdentity } from '../port-authority-migration.mjs';
import { authorityPhysicalKey, authorityMarkerKey, PORT_AUTHORITY_POINTER } from '../port-local-authority.mjs';
import { authorityWriteControlKey } from '../port-authority-write-control.mjs';
import { PORT_DATASET_META, PORT_DATASET_KEYS } from '../port-dataset-repository.js';
const key = 'cruisePort.metronome';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function active({ bound = true, locks = createFixtureLocks() } = {}) {
    const f = await migrationFixture({ bound, locks }), { e, fence } = await sealed(f);
    await e.publish({ fence });
    const r = await e.activeRepository({ fence });
    return { f, e, fence, r, locks };
}
const patch = bpm => d => { d.setItem(key, JSON.stringify({ ...JSON.parse(d.getItem(key)), bpm })); return { ok: true }; };
async function change(x, kind) {
    if (kind === 'suspend') return x.e.suspendWrites();
    if (kind === 'fence') return revokeIsolatedFence(x.fence);
    const next = { ...x.f.state.identity };
    if (kind === 'account') next.accountId = 'B';
    if (kind === 'account-generation') next.accountGeneration++;
    if (kind === 'membership-generation') next.membershipGeneration++;
    return changeIsolatedIdentity(x.f.scope, next);
}

for (const kind of ['suspend', 'fence', 'account', 'account-generation', 'membership-generation']) {
    for (const gap of ['first-validation', 'writer', 'final-validation', 'journal-validation']) {
        test(`${kind} before commit at ${gap} preserves base and draft/operation identity`, async () => {
            const x = await active(), before = x.r.inspect(), entered = deferred(), release = deferred();
            let checks = 0, draft;
            const wait = async () => { entered.resolve(); await release.promise; };
            if (gap === 'journal-validation') {
                const validate = x.r.authorityProvider.validateCommitContext;
                x.r.authorityProvider.validateCommitContext = async context => { await validate(context); await wait(); };
            }
            const saving = x.r.runWrite({ expectedRevision: before.revision, operationId: 'retained-operation',
                assertCurrent: async () => {
                    checks++;
                    if (gap === 'first-validation' && checks === 1 || gap === 'final-validation' && checks === 2) await wait();
                } }, async d => { draft = d; patch(166)(d); if (gap === 'writer') await wait(); return { ok: true }; });
            await Promise.race([entered.promise, saving.then(() => { throw Error('intended gap not reached'); })]);
            await change(x, kind); release.resolve();
            const result = await saving;
            assert.equal(result.ok, false); assert.equal(result.operationId, 'retained-operation');
            assert.equal(x.r.inspect().revision, before.revision);
            if (draft) assert.equal(JSON.parse(draft.getItem(key)).bpm, 166);
        });
    }
}

test('suspend before save rejects; explicit resume never revives a pending pre-suspension context', async () => {
    const x = await active(), before = x.r.inspect();
    await x.e.suspendWrites();
    assert.equal((await x.r.runWrite({ expectedRevision: before.revision }, patch(145))).reason, 'authority-write-disabled');
    await x.e.resumeWrites({ fence: x.fence });
    const result = await x.r.runWrite({ expectedRevision: before.revision, assertCurrent: async () => {
        await x.e.suspendWrites(); await x.e.resumeWrites({ fence: x.fence });
    } }, patch(146));
    assert.equal(result.reason, 'authority-context-stale'); assert.equal(x.r.inspect().revision, before.revision);
    assert.equal((await x.r.runWrite({ expectedRevision: before.revision }, patch(147))).ok, true);
});

for (const kind of ['account', 'account-generation', 'membership-generation']) {
    test(`synchronous owner snapshot ${kind} change after CAS read is rejected before WAL`, async () => {
        const x = await active(), before = x.r.inspect(), inspect = x.r.inspect.bind(x.r); let reads = 0;
        x.r.inspect = () => { const result = inspect(); if (++reads === 2) {
            const next = { ...x.f.state.identity };
            if (kind === 'account') next.accountId = 'B'; else next[kind === 'account-generation' ? 'accountGeneration' : 'membershipGeneration']++;
            x.f.state.identity = next;
        } return result; };
        assert.equal((await x.r.runWrite({ expectedRevision: before.revision }, patch(166))).ok, false);
        assert.equal(inspect().revision, before.revision);
    });
}

for (const kind of ['pointer', 'authority-generation', 'recovery-required', 'forward-schema', 'control-protocol', 'journal-hash']) {
    test(`${kind} during pending validation cannot publish a partial/new snapshot`, async () => {
        const x = await active(), before = x.r.inspect(); let checks = 0;
        const result = await x.r.runWrite({ expectedRevision: before.revision, assertCurrent: async () => {
            if (++checks !== 2) return;
            const { storage, generation } = x.f;
            if (kind === 'pointer') storage.setItem(PORT_AUTHORITY_POINTER, JSON.stringify({ schemaVersion: 1, migrationId: 'other', generation: 'other', sealHash: 'other' }));
            if (kind === 'authority-generation' || kind === 'recovery-required') {
                const p = authorityPhysicalKey(generation, PORT_DATASET_META), m = JSON.parse(storage.getItem(p));
                if (kind === 'authority-generation') m.generation = 'other'; else m.pending = {};
                storage.setItem(p, JSON.stringify(m));
            }
            if (kind === 'forward-schema') storage.setItem(authorityPhysicalKey(generation, key), JSON.stringify({ version: 999, bpm: 77 }));
            if (kind === 'control-protocol') { const p = authorityWriteControlKey(generation), m = JSON.parse(storage.getItem(p)); m.protocol = 999; storage.setItem(p, JSON.stringify(m)); }
            if (kind === 'journal-hash') { const p = 'soundCruise.portMigration.v1.m1', m = JSON.parse(storage.getItem(p)); m.hash = 'invalid'; storage.setItem(p, JSON.stringify(m)); }
        } }, patch(166));
        assert.equal(result.ok, false);
        for (const k of PORT_DATASET_KEYS.filter(k => k !== key))
            assert.equal(x.f.storage.getItem(authorityPhysicalKey(x.f.generation, k)), before.values[k]);
        const bpm = JSON.parse(x.f.storage.getItem(authorityPhysicalKey(x.f.generation, key))).bpm;
        assert.equal(bpm, kind === 'forward-schema' ? 77 : JSON.parse(before.values[key]).bpm);
    });
}

test('successful bound and local-only commits preserve full unrelated data and legacy namespace', async () => {
    for (const bound of [true, false]) {
        const x = await active({ bound }), before = x.r.inspect(), legacy = Object.fromEntries(PORT_DATASET_KEYS.map(k => [k, x.f.storage.getItem(k)]));
        const result = await x.r.runWrite({ expectedRevision: before.revision }, patch(155));
        assert.equal(result.status, 'committed'); assert.equal(result.publish, false);
        assert.equal(result.authorityContext.identity.accountId, bound ? 'A' : null);
        for (const k of PORT_DATASET_KEYS.filter(k => k !== key)) assert.equal(result.state.values[k], before.values[k]);
        for (const k of PORT_DATASET_KEYS) assert.equal(x.f.storage.getItem(k), legacy[k]);
        assert.equal(x.r.inspect().revision, result.revision);
    }
});

test('prepared handle remains read-only after active publication', async () => {
    const f = await migrationFixture(), { prepared } = await import('./migration-fixture.mjs'), { e } = await prepared(f);
    const r = await e.preparedRepository(), before = r.inspect();
    assert.equal((await r.runWrite({ expectedRevision: before.revision }, patch(166))).reason, 'prepared-read-only');
});

for (const kind of ['suspend', 'fence', 'account']) test(`post-commit ${kind} preserves commit fact and fixed old context`, async () => {
    const x = await active(), before = x.r.inspect(); let invalidation;
    x.r.subscribe(() => { invalidation = change(x, kind); });
    const result = await x.r.runWrite({ expectedRevision: before.revision, operationId: 'saved-operation' }, patch(166));
    await invalidation;
    assert.equal(result.status, 'committed'); assert.equal(result.authorityContext.identity.accountId, 'A');
    assert.equal(result.publish, false); assert.equal(result.operationId, 'saved-operation');
    assert.equal(x.r.inspect().revision, result.revision);
});

test('lost commit response, Account switch, retry retain data without a second commit', async () => {
    const x = await active(), before = x.r.inspect();
    await assert.rejects(async () => { const result = await x.r.runWrite({ expectedRevision: before.revision, operationId: 'same-operation' }, patch(166)); assert(result.ok); throw Error('lost response'); });
    const committed = x.r.inspect(); await change(x, 'account');
    const retry = await x.r.runWrite({ expectedRevision: before.revision, operationId: 'same-operation' }, patch(166));
    assert.equal(retry.ok, false); assert.equal(retry.operationId, 'same-operation');
    assert.equal(x.r.inspect().revision, committed.revision); assert.equal(JSON.parse(committed.values[key]).bpm, 166);
});

for (const failure of ['rollback', 'rollback-failed']) test(`WAL ${failure} retains existing crash semantics`, async () => {
    const x = await active(), before = x.r.inspect(), set = x.f.storage.setItem; let failed = false;
    x.f.storage.setItem = (k, v) => {
        if (k === authorityPhysicalKey(x.f.generation, key) && (!failed || failure === 'rollback-failed')) { failed = true; throw Error('quota'); }
        return set(k, v);
    };
    const result = await x.r.runWrite({ expectedRevision: before.revision, operationId: 'kept-operation' }, patch(166));
    assert.equal(result.status, failure === 'rollback' ? 'rolled-back' : 'recovery-required');
    assert.equal(result.operationId, 'kept-operation');
    if (failure === 'rollback') assert.equal(x.r.inspect().revision, before.revision);
    else assert.throws(() => x.r.inspect(), /recovery-required/);
});

for (const kind of ['save', 'suspend', 'fence', 'account']) test(`two isolated contexts: save/${kind} share CAS/control epoch`, async () => {
    const x = await active(), f2 = await migrationFixture({ bound: true, storage: x.f.storage, locks: x.locks });
    const e2 = f2.engine(), fence2 = f2.fence(f2.cloud(await f2.capture())), r2 = await e2.activeRepository({ fence: fence2 });
    const before = x.r.inspect(), entered = deferred(), release = deferred(); let checks = 0;
    const saving = x.r.runWrite({ expectedRevision: before.revision, assertCurrent: async () => { if (++checks === 2) { entered.resolve(); await release.promise; } } }, patch(166));
    await entered.promise;
    if (kind === 'save') assert.equal((await r2.runWrite({ expectedRevision: before.revision }, patch(177))).ok, true);
    else await change({ f: f2, e: e2, fence: fence2 }, kind);
    release.resolve(); const result = await saving;
    assert.equal(result.ok, false); assert.equal(JSON.parse(r2.inspect().values[key]).bpm, kind === 'save' ? 177 : JSON.parse(before.values[key]).bpm);
});

test('known bound owner without generations is read-only, never an inferred write authorization', async () => {
    const f = await migrationFixture({ bound: true, locks: createFixtureLocks() }); delete f.state.identity.accountGeneration;
    const { e, fence } = await sealed(f); await e.publish({ fence }); const r = await e.activeRepository({ fence }), before = r.inspect();
    assert.equal((await r.runWrite({ expectedRevision: before.revision }, patch(166))).reason, 'authority-identity-unavailable');
    assert.equal(r.inspect().revision, before.revision);
});

test('writer validation rejection keeps its original reason', async () => {
    const x = await active(), before = x.r.inspect();
    const result = await x.r.runWrite({ expectedRevision: before.revision }, () => ({ ok: false, reason: 'domain-invalid' }));
    assert.equal(result.reason, 'domain-invalid'); assert.equal(result.status, 'rejected'); assert.equal(x.r.inspect().revision, before.revision);
});

for (const kind of ['fence', 'account']) test(`resume cannot silently reauthorize ${kind} invalidation`, async () => {
    const x = await active(), before = x.r.inspect();
    await change(x, kind);
    await assert.rejects(x.e.resumeWrites({ fence: x.fence }));
    assert.equal((await x.r.runWrite({ expectedRevision: before.revision }, patch(166))).ok, false);
    assert.equal(JSON.stringify([x.r.storage.getItem(PORT_DATASET_META), Object.fromEntries(PORT_DATASET_KEYS.map(k => [k, x.r.storage.getItem(k)]))]), before.revision);
});

test('Account A-B-A in another context cannot resurrect an old Authority operation', async () => {
    const x = await active(), before = x.r.inspect();
    const result = await x.r.runWrite({ expectedRevision: before.revision, assertCurrent: async () => {
        const original = { ...x.f.state.identity };
        await changeIsolatedIdentity(x.f.scope, { ...original, accountId: 'B' });
        await changeIsolatedIdentity(x.f.scope, original);
    } }, patch(166));
    assert.equal(result.ok, false); assert.equal(x.r.inspect().revision, before.revision);
});

test('marker loses sealed state immediately before WAL: final synchronous guard rejects', async () => {
    const x = await active(), before = x.r.inspect(), inspect = x.r.inspect.bind(x.r); let reads = 0;
    x.r.inspect = () => { const state = inspect(); if (++reads === 2) {
        const p = authorityMarkerKey(x.f.generation), m = JSON.parse(x.f.storage.getItem(p));
        x.f.storage.setItem(p, JSON.stringify({ ...m, state: 'recovery-required' }));
    } return state; };
    const result = await x.r.runWrite({ expectedRevision: before.revision }, patch(166));
    assert.equal(result.reason, 'recovery-required'); assert.equal(inspect().revision, before.revision);
});

test('pre-publication suspension retains the prepared journal and never initializes active control', async () => {
    const f = await migrationFixture({ locks: createFixtureLocks() }), { prepared } = await import('./migration-fixture.mjs'), { e } = await prepared(f);
    assert.equal((await e.suspendWrites()).writeEnabled, false);
    assert.equal((await e.inspect()).writeDisabled, true);
    assert.equal(f.storage.getItem(PORT_AUTHORITY_POINTER), null);
    assert.equal(f.storage.getItem(authorityWriteControlKey(f.generation)), null);
});

for (const kind of ['missing', 'non-string']) test(`private full dataset ${kind} value cannot become an unsafe partial commit`, async () => {
    const x = await active(), before = x.r.inspect();
    const result = await x.r.runWrite({ expectedRevision: before.revision }, draft => {
        if (kind === 'missing') delete draft.values['cruisePort.gearList']; else draft.values[key] = { bpm: 166 };
        return { ok: true };
    });
    assert.equal(result.reason, 'invalid-dataset'); assert.equal(x.r.inspect().revision, before.revision);
});
