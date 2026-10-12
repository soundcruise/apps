// Node checks for the L1 cross-tab harness itself. These prove that the oracles
// detect the defect class and that acceptance fails closed; they are never
// evidence about real browsers (that is cross-tab-driver.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PortDatasetRepository } from '../../port-dataset-repository.js';
import { createFixtureLocks } from '../../../shared/sync-account/test-fixtures/web-locks.mjs';
import { cleanValues } from '../migration-fixture.mjs';
import { KEYS, counterLoop, classifySameKey, classifyDeleteIntents, classifyControl, verdict,
    seedDeleteCollections } from './cross-tab-scenarios.mjs';

// Per-context cache over one backing store; propagation only on deliver(). This
// models the stale-read failure, it does not claim any browser behaves this way.
function partition(values) {
    const backing = new Map(Object.entries(values).filter(([, v]) => v !== null));
    const contexts = [], queue = [];
    const context = () => {
        const cache = new Map(backing);
        const storage = { getItem: key => cache.get(key) ?? null,
            setItem(key, value) { cache.set(key, String(value)); backing.set(key, String(value)); queue.push([storage, key, String(value)]); },
            removeItem(key) { cache.delete(key); backing.delete(key); queue.push([storage, key, null]); } };
        contexts.push({ storage, cache });
        return storage;
    };
    const deliver = () => { for (const [source, key, value] of queue.splice(0)) for (const c of contexts)
        if (c.storage !== source) { if (value === null) c.cache.delete(key); else c.cache.set(key, value); } };
    return { context, deliver, backing };
}

async function bump(repository, key) {
    const raw = repository.inspect().values[key];
    const next = { ...JSON.parse(raw), probeCounter: (JSON.parse(raw).probeCounter || 0) + 1 };
    return repository.runWrite({ expectedValues: { [key]: raw } }, draft => { draft.setItem(key, JSON.stringify(next)); return { ok: true }; });
}

test('coherent shared storage: same-key oracle reports no lost update', async () => {
    const values = cleanValues(), map = new Map(Object.entries(values));
    const storage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
    const locks = createFixtureLocks();
    const a = new PortDatasetRepository({ storage, locks }), b = new PortDatasetRepository({ storage, locks });
    const [commitsA, commitsB] = await Promise.all([counterLoop({ repository: a, key: KEYS.a, iterations: 20 }),
        counterLoop({ repository: b, key: KEYS.a, iterations: 20 })]);
    const result = classifySameKey({ commitsA, commitsB, finalCounter: JSON.parse(map.get(KEYS.a)).probeCounter });
    assert.equal(result.violations, 0);
    assert.equal(result.committed, result.finalCounter);
});

test('stale per-context cache: Repository CAS commits on a stale base and the oracle counts the lost update', async () => {
    const p = partition(cleanValues()), locks = createFixtureLocks();
    const a = new PortDatasetRepository({ storage: p.context(), locks }), b = new PortDatasetRepository({ storage: p.context(), locks });
    const first = await bump(a, KEYS.a);
    const second = await bump(b, KEYS.a); // b has not observed a's commit yet
    p.deliver();
    assert.equal(first.status, 'committed');
    assert.equal(second.status, 'committed', 'the current backend cannot detect an unpropagated commit');
    const result = classifySameKey({ commitsA: [{ ok: true }], commitsB: [{ ok: true }], finalCounter: JSON.parse(p.backing.get(KEYS.a)).probeCounter });
    assert.deepEqual([result.lostUpdates, result.violations], [1, 1]);
});

test('stale per-context cache: a stale journal base drops another context delete intent', async () => {
    const p = partition(seedDeleteCollections(cleanValues(), 2)), locks = createFixtureLocks();
    const a = new PortDatasetRepository({ storage: p.context(), locks }), b = new PortDatasetRepository({ storage: p.context(), locks });
    const drop = async (repository, key) => {
        const raw = repository.inspect().values[key], envelope = JSON.parse(raw);
        await repository.runWrite({ expectedValues: { [key]: raw } }, draft => {
            draft.setItem(key, JSON.stringify({ ...envelope, items: envelope.items.slice(1) })); return { ok: true };
        });
        return envelope.items[0].id;
    };
    const deletedA = [await drop(a, KEYS.deleteA)], deletedB = [await drop(b, KEYS.deleteB)];
    p.deliver();
    const ids = key => JSON.parse(p.backing.get(key)).items.map(item => item.id);
    const result = classifyDeleteIntents({ deletedA, deletedB, journal: p.backing.get(KEYS.intents) ?? null,
        itemsA: ids(KEYS.deleteA), itemsB: ids(KEYS.deleteB) });
    assert.equal(result.missingIntents, 1);
    assert.deepEqual(result.sampleMissing, ['metronome_preset/ct-a-0']);
});

test('control oracle: commits granted after a published change are violations; unspanned rounds are inconclusive', () => {
    assert.deepEqual(classifyControl({ commits: [{ ok: true, grantAt: 5, resolvedAt: 6 }, { ok: true, grantAt: 12, resolvedAt: 13 }],
        changedAt: 10 }).violations, 1);
    assert.equal(classifyControl({ commits: [{ ok: false, reason: 'authority-write-disabled', resolvedAt: 11 }], changedAt: 10 }).inconclusive, false);
    assert.equal(classifyControl({ commits: [{ ok: true, grantAt: 3, resolvedAt: 4 }], changedAt: 10 }).inconclusive, true);
    assert.equal(classifyControl({ commits: [], changedAt: undefined }).inconclusive, true);
});

test('characterization never fails CI; acceptance fails on violations, unavailable backend or unexercised boundary', () => {
    const observed = [{ scenario: 's', rounds: 1, inconclusiveRounds: 0, violations: 2 }];
    assert.equal(verdict('characterization', observed).pass, true);
    assert.equal(verdict('characterization', observed).characterization, 'defect-observed');
    assert.equal(verdict('characterization', [{ rounds: 1, inconclusiveRounds: 0, violations: 0 }]).characterization, 'not-observed-not-proven');
    assert.equal(verdict('acceptance', observed).pass, false);
    assert.equal(verdict('acceptance', [{ scenario: 's', status: 'backend-unavailable' }]).pass, false);
    assert.equal(verdict('acceptance', [{ scenario: 's', rounds: 2, inconclusiveRounds: 2, violations: 0 }]).pass, false);
    assert.equal(verdict('acceptance', []).pass, false);
    assert.equal(verdict('acceptance', [{ scenario: 's', rounds: 2, inconclusiveRounds: 1, violations: 0 }]).pass, true);
});
