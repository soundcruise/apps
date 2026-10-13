// L3b-1: physical schema v2, active pointer, reservations, publication and
// Port-owned capabilities. Isolated fake IndexedDB only; no product activation.
import { createTestAuthorityScope } from './authority-store/test-authority.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { openIDBAuthorityStore, createIsolatedIDBAuthorityScope, claimPortAuthorityIssuer } from '../port-indexeddb-authority-store.mjs';
import { verifyCapability, claimCapabilityIssuer } from '../port-authority-capabilities.mjs';
import { AUTHORITY_DB_NAME, AUTHORITY_DB_VERSION, STORE_KEYS, V1_STORE_KEYS, POINTER_KEY, reservationKey, digest } from '../port-idb-authority-contract.mjs';
import { PortDatasetRepository } from '../port-dataset-repository.js';
import { openIsolatedIDBRepositoryBackend } from '../port-indexeddb-repository-backend.mjs';
import { values, control, patch } from './authority-store/fixture.mjs';
const require = createRequire(new URL('./authority-store/package.json', import.meta.url));
const { IDBFactory, IDBObjectStore } = require('fake-indexeddb');
const met = 'cruisePort.metronome';

const openRaw = (factory, version, upgrade = () => {}) => new Promise((ok, no) => {
    const r = version === undefined ? factory.open(AUTHORITY_DB_NAME) : factory.open(AUTHORITY_DB_NAME, version);
    r.onupgradeneeded = () => upgrade(r.result, r.transaction); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
});
async function rawTx(factory, stores, mode, build) {
    const db = await openRaw(factory);
    try {
        return await new Promise((ok, no) => {
            const tx = db.transaction(stores, mode); let result;
            tx.oncomplete = () => ok(result); tx.onabort = () => no(tx.error || Error('aborted')); build(tx, value => { result = value; });
        });
    } finally { db.close(); }
}
const dump = (factory, stores) => rawTx(factory, stores, 'readonly', (tx, done) => {
    const out = {}; let pending = stores.length;
    for (const name of stores) { const r = tx.objectStore(name).getAll(); r.onsuccess = () => { out[name] = r.result; if (!--pending) done(out); }; }
});
async function setup(t, { seed = true, factory = new IDBFactory() } = {}) {
    const scope = createTestAuthorityScope({ indexedDB: factory, partitionId: 'fixture-partition' });
    const store = await openIDBAuthorityStore(scope); t.after(() => store.dispose());
    if (seed) assert.equal((await store.initialize({ generation: 'g1', control: control(), values: values(), operationId: 'initial' })).ok, true);
    return { factory, scope, store, issuer: claimPortAuthorityIssuer(scope) };
}
async function stage(x, generation, { migrationId = 'm-' + generation, identity } = {}) {
    const c = { ...control(generation), state: 'prepared' }; if (identity) c.identity = identity;
    assert.equal((await x.store.initialize({ generation, control: c, values: values(), operationId: 'stage-' + generation })).ok, true);
    assert.equal((await x.store.writeJournal({ schemaVersion: 1, migrationId, generation, revision: 1, state: 'prepared', identity: c.identity })).ok, true);
    return migrationId;
}
async function seal(x, generation, migrationId) {
    const capability = x.issuer.issue('migration-publication', { generation });
    const r = await x.store.seal({ generation, migrationId, capability });
    assert.equal(r.ok, true, r.reason); return { capability, ...r };
}
const evidence = (x, generation, migrationId, sealHash, fence = null) => x.issuer.attestFixtureEvidence({ generation, migrationId, sealHash,
    binary: { manifestDigest: 'a'.repeat(64), assetCount: 0 }, sync: { checkpointDigest: 'b'.repeat(64), outboxPending: 0 }, fence });
async function publish(x, generation, migrationId, { expectedPointerEpoch = null, operationId = 'publish-' + generation, fence = null, attestation, capability } = {}) {
    const sealed = await seal(x, generation, migrationId);
    const j=(await x.store.readJournal(migrationId)).journal;
    const fixedEpoch=j?.publication?.pointer.operationId===operationId?j.publication.request.expectedControlEpoch:sealed.controlEpoch;
    return x.store.publish({ generation, migrationId, operationId, capability: capability ?? sealed.capability,
        attestation: attestation ?? evidence(x, generation, migrationId, sealed.sealHash, fence), expectedPointerEpoch, expectedControlEpoch: fixedEpoch });
}
const hydrate = async (store, generation = 'g1') => store.hydrate(generation);
const save = (store, snapshot, id, fields = { bpm: 150 }) => store.commit(store.prepare({ base: snapshot, operationId: id, changes: patch(snapshot, met, fields) }));
const pointer = async store => (await store.readPointer()).pointer;

// ---- v1 database fixture: real dataset rows plus an L3a journal reservation ----
async function v1Database({ reservations = r => r, extraJournal = [] } = {}) {
    const source = new IDBFactory(), scope = createTestAuthorityScope({ indexedDB: source, partitionId: 'fixture-partition' });
    const store = await openIDBAuthorityStore(scope);
    await store.initialize({ generation: 'g1', control: control(), values: values(), operationId: 'initial' });
    await save(store, (await hydrate(store)).snapshot, 'committed');
    store.dispose();
    const rows = await dump(source, Object.keys(V1_STORE_KEYS));
    const committed = rows.oplog.find(log => log.operationId === 'committed');
    const journal = reservations([
        { migrationId: reservationKey('g1', 'committed'), kind: 'operation-identity', schemaVersion: 1, generation: 'g1', operationId: 'committed', fingerprint: committed.fingerprint },
        { migrationId: reservationKey('g1', 'pending'), kind: 'operation-identity', schemaVersion: 1, generation: 'g1', operationId: 'pending', fingerprint: 'c'.repeat(64) }
    ]);
    rows.journal = [...rows.journal, ...journal, ...extraJournal];
    const target = new IDBFactory();
    const db = await openRaw(target, 1, d => { for (const [name, keyPath] of Object.entries(V1_STORE_KEYS)) d.createObjectStore(name, { keyPath }); });
    await new Promise((ok, no) => {
        const tx = db.transaction(Object.keys(V1_STORE_KEYS), 'readwrite'); tx.oncomplete = ok; tx.onabort = () => no(tx.error);
        for (const [name, list] of Object.entries(rows)) for (const row of list) tx.objectStore(name).put(row);
    });
    db.close();
    return { factory: target, rows, journal };
}

test('1 fresh database opens directly at physical v2 with the exact nine stores', async t => {
    const x = await setup(t, { seed: false }), db = await openRaw(x.factory);
    assert.equal(db.version, 2); assert.equal(AUTHORITY_DB_VERSION, 2);
    assert.deepEqual([...db.objectStoreNames].sort(), Object.keys(STORE_KEYS).sort()); assert.equal(db.objectStoreNames.length, 9); db.close();
    assert.equal(await pointer(x.store), null);
});

test('2-9 existing v1 -> v2 keeps every row and moves reservations out of the journal', async t => {
    const v1 = await v1Database(), scope = createTestAuthorityScope({ indexedDB: v1.factory, partitionId: 'fixture-partition' });
    const store = await openIDBAuthorityStore(scope); t.after(() => store.dispose());
    const after = await dump(v1.factory, Object.keys(STORE_KEYS)), db = await openRaw(v1.factory); assert.equal(db.version, 2); db.close();
    for (const name of ['records', 'manifests', 'head', 'control', 'oplog', 'roots']) assert.deepEqual(after[name], v1.rows[name], name);
    assert.deepEqual(after.journal, v1.rows.journal.filter(row => row.kind !== 'operation-identity'));
    assert.deepEqual(after.reservations.map(r => [r.generation, r.operationId, r.fingerprint, r.kind, r.origin]).sort(),
        v1.journal.map(r => [r.generation, r.operationId, r.fingerprint, 'operation-identity', 'v1-journal']).sort());
    assert.deepEqual(after.pointer.map(p=>[p.key,p.pointerEpoch]), [['namespace',0]], 'namespace is explicitly unpublished; an old active control is never silently promoted');
    const h = await hydrate(store); assert.equal(h.activity, 'inactive'); assert.equal(h.readOnly, true);
    assert.equal((await save(store, h.snapshot, 'after-upgrade')).reason, 'generation-not-active');
});

for (const [name, mutate, code] of [
    ['oplog fingerprint conflict', rows => rows.map(r => r.operationId === 'committed' ? { ...r, fingerprint: 'd'.repeat(64) } : r), 'reservation-migration-conflict'],
    ['malformed identity key', rows => rows.map(r => r.operationId === 'pending' ? { ...r, migrationId: 'operation-' + 'e'.repeat(64) } : r), 'reservation-migration-invalid'],
    ['unknown reservation field', rows => rows.map(r => r.operationId === 'pending' ? { ...r, extra: true } : r), 'reservation-migration-invalid']
]) test('10 v1 reservation that cannot be moved safely aborts the whole upgrade: ' + name, async () => {
    const v1 = await v1Database({ reservations: mutate });
    await assert.rejects(openIDBAuthorityStore(createTestAuthorityScope({ indexedDB: v1.factory, partitionId: 'fixture-partition' })), new RegExp(code));
    const db = await openRaw(v1.factory); assert.equal(db.version, 1); assert.deepEqual([...db.objectStoreNames].sort(), Object.keys(V1_STORE_KEYS).sort()); db.close();
    assert.deepEqual((await dump(v1.factory, ['journal'])).journal.length, v1.rows.journal.length, 'nothing deleted');
});

test('10 a migration journal using the reserved operation prefix is never reinterpreted', async () => {
    const v1 = await v1Database({ extraJournal: [{ migrationId: 'operation-collision', schemaVersion: 1, generation: 'g1', revision: 1, state: 'prepared' }] });
    await assert.rejects(openIDBAuthorityStore(createTestAuthorityScope({ indexedDB: v1.factory, partitionId: 'fixture-partition' })), /journal-reserved-key/);
    const db = await openRaw(v1.factory); assert.equal(db.version, 1); db.close();
});

test('11 unknown/future physical version is preserved and fails closed', async () => {
    const f = new IDBFactory(), db = await openRaw(f, AUTHORITY_DB_VERSION + 1, d => d.createObjectStore('future')); db.close();
    await assert.rejects(openIDBAuthorityStore(createTestAuthorityScope({ indexedDB: f, partitionId: 'fixture-partition' })), /future-schema/);
    const after = await openRaw(f); assert.equal(after.version, AUTHORITY_DB_VERSION + 1); assert.deepEqual([...after.objectStoreNames], ['future']); after.close();
});

test('12-13 v1 connection: blocked without a handler (stays v1), upgraded after it closes on versionchange', async () => {
    const blockedV1 = await v1Database(), blocker = await openRaw(blockedV1.factory, 1);
    await assert.rejects(openIDBAuthorityStore(createTestAuthorityScope({ indexedDB: blockedV1.factory, partitionId: 'fixture-partition' })), /open-blocked/);
    blocker.close(); await new Promise(r => setTimeout(r, 20));
    let db = await openRaw(blockedV1.factory); assert.equal(db.version, 1); db.close();
    const v1 = await v1Database(), old = await openRaw(v1.factory, 1); let notified = false;
    old.onversionchange = () => { notified = true; old.close(); };
    const store = await openIDBAuthorityStore(createTestAuthorityScope({ indexedDB: v1.factory, partitionId: 'fixture-partition' }));
    assert.equal(notified, true); db = await openRaw(v1.factory); assert.equal(db.version, 2); db.close(); store.dispose();
});

test('14 pointer absent: prepared generation is readable but never writable', async t => {
    const x = await setup(t, { seed: false }); await stage(x, 'g2');
    assert.equal(await pointer(x.store), null);
    const h = await hydrate(x.store, 'g2'); assert.equal(h.activity, 'inactive'); assert.equal(h.readOnly, true);
    assert.equal((await save(x.store, h.snapshot, 'no-pointer')).reason, 'generation-not-active');
});

test('15/21 publish prepared -> sealed -> active writes one pointer and activates only the target', async t => {
    const x = await setup(t, { seed: false }), migrationId = await stage(x, 'g2');
    const r = await publish(x, 'g2', migrationId); assert.equal(r.status, 'published'); assert.equal(r.pointerEpoch, 1);
    const p = await pointer(x.store), rows = await dump(x.factory, ['control', 'journal', 'reservations']);
    assert.deepEqual([p.key, p.activeGeneration, p.migrationId, p.previousGeneration, p.publication.kind, p.operationId], [POINTER_KEY, 'g2', migrationId, null, 'isolated-fixture', 'publish-g2']);
    assert.equal(rows.control[0].state, 'active'); assert.equal(rows.journal[0].state, 'active'); assert.equal(rows.journal[0].publishedPointerEpoch, 1);
    assert.deepEqual(rows.reservations.map(r => [r.kind, r.operationId]), [['publication', 'publish-g2'],['operation-identity','stage-g2']]);
    const h = await hydrate(x.store, 'g2'); assert.equal(h.activity, 'active'); assert.equal(h.readOnly, false);
    assert.equal((await save(x.store, h.snapshot, 'active-save')).ok, true);
});

test('19-20 prepared and sealed generations are not active; publish requires a sealed state', async t => {
    const x = await setup(t, { seed: false }), migrationId = await stage(x, 'g2');
    const capability = x.issuer.issue('migration-publication', { generation: 'g2' });
    assert.equal((await x.store.publish({ generation: 'g2', migrationId, operationId: 'early', capability, attestation: evidence(x, 'g2', migrationId, 'f'.repeat(64)), expectedControlEpoch: 1 })).reason, 'publication-state-invalid');
    const sealed = await seal(x, 'g2', migrationId); assert.equal(sealed.status, 'sealed');
    assert.equal((await seal(x, 'g2', migrationId)).status, 'already-sealed');
    const h = await hydrate(x.store, 'g2'); assert.equal(h.snapshot.control.state, 'sealed'); assert.equal(h.readOnly, true);
    assert.equal((await save(x.store, h.snapshot, 'sealed-save')).reason, 'generation-not-active');
});

test('22 the same migration retried is already-active and never advances the pointer twice', async t => {
    const x = await setup(t, { seed: false }), migrationId = await stage(x, 'g2');
    assert.equal((await publish(x, 'g2', migrationId)).status, 'published');
    const again = await publish(x, 'g2', migrationId, { operationId: 'publish-g2' }); assert.equal(again.status, 'already-active'); assert.equal(again.pointerEpoch, 1);
    assert.equal((await pointer(x.store)).pointerEpoch, 1);
});

test('23 different migrationId: stale expected pointer and a second migration for the active generation both reject', async t => {
    const x = await setup(t, { seed: false }), m2 = await stage(x, 'g2'), m3 = await stage(x, 'g3');
    assert.equal((await publish(x, 'g2', m2)).status, 'published');
    assert.equal((await publish(x, 'g3', m3, { expectedPointerEpoch: null })).reason, 'pointer-stale');
    assert.equal((await x.store.writeJournal({ schemaVersion: 1, migrationId: 'm-other', generation: 'g2', revision: 1, state: 'ready-to-publish', identity: control('g2').identity })).ok, true);
    const capability = x.issuer.issue('migration-publication', { generation: 'g2' });
    assert.equal((await x.store.publish({ generation: 'g2', migrationId: 'm-other', operationId: 'other', capability,
        attestation: evidence(x, 'g2', 'm-other', 'a'.repeat(64)), expectedPointerEpoch: 1, expectedControlEpoch: 3 })).reason, 'publication-conflict');
    assert.equal((await pointer(x.store)).activeGeneration, 'g2');
});

test('24-25 supersession is atomic; an old handle and an old base can no longer commit', async t => {
    const x = await setup(t), oldBase = (await hydrate(x.store)).snapshot;
    const oldHandle = x.store.prepare({ base: oldBase, operationId: 'old-handle', changes: patch(oldBase, met, { bpm: 160 }) });
    const migrationId = await stage(x, 'g2');
    const r = await publish(x, 'g2', migrationId, { expectedPointerEpoch: 1 }); assert.equal(r.status, 'published'); assert.equal(r.previousGeneration, 'g1');
    const p = await pointer(x.store); assert.deepEqual([p.pointerEpoch, p.activeGeneration, p.previousGeneration], [2, 'g2', 'g1']);
    const g1 = await hydrate(x.store); assert.equal(g1.snapshot.control.state, 'superseded'); assert.equal(g1.snapshot.control.epoch, 2); assert.equal(g1.activity, 'inactive');
    assert.equal((await x.store.commit(oldHandle)).reason, 'generation-not-active');
    assert.equal((await save(x.store, g1.snapshot, 'superseded-save')).reason, 'generation-not-active');
    // A superseded generation cannot be re-published or revived.
    const capability = x.issuer.issue('migration-publication', { generation: 'g1' });
    assert.equal((await x.store.seal({ generation: 'g1', migrationId: 'm-g1', capability })).reason, 'journal-missing');
});

test('save first then publish: the committed save is kept and the next save on the old generation rejects', async t => {
    const x = await setup(t), base = (await hydrate(x.store)).snapshot;
    assert.equal((await save(x.store, base, 'first')).ok, true);
    const migrationId = await stage(x, 'g2'); assert.equal((await publish(x, 'g2', migrationId, { expectedPointerEpoch: 1 })).status, 'published');
    assert.equal((await x.store.lookupOperation('g1', 'first')).result.seq, 2);
    assert.equal((await save(x.store, (await hydrate(x.store)).snapshot, 'second')).reason, 'generation-not-active');
});

test('30 replay on a superseded generation returns only the historical fact', async t => {
    const x = await setup(t), base = (await hydrate(x.store)).snapshot;
    const handle = x.store.prepare({ base, operationId: 'historical', changes: patch(base, met, { bpm: 170 }) });
    assert.equal((await x.store.commit(handle)).ok, true);
    const migrationId = await stage(x, 'g2'); await publish(x, 'g2', migrationId, { expectedPointerEpoch: 1 });
    const replay = await x.store.commit(handle); assert.equal(replay.replayed, true); assert.equal(replay.generation, 'g1');
    assert.equal((await hydrate(x.store)).snapshot.head.seq, 2, 'replay wrote nothing');
});

for (const [name, mutate, reason] of [
    ['corrupt pointer field', p => ({ ...p, pointerEpoch: 0 }), 'pointer-invalid'],
    ['unknown pointer field', p => ({ ...p, future: true }), 'pointer-invalid'],
    ['foreign partition', p => ({ ...p, partitionId: 'other' }), 'pointer-invalid'],
    ['missing generation', p => ({ ...p, activeGeneration: 'g9', previousGeneration: null }), 'pointer-provenance-missing'],
    ['pointer/head mismatch', p => ({ ...p, publication: { ...p.publication, sealHash: 'f'.repeat(64) } }), 'pointer-provenance-mismatch'],
    ['publication ahead of head', p => ({ ...p, publication: { ...p.publication, headSeq: 99 } }), 'pointer-provenance-mismatch']
]) test('16-18/26 pointer fails closed: ' + name, async t => {
    const x = await setup(t), before = (await hydrate(x.store)).snapshot;
    await rawTx(x.factory, ['pointer'], 'readwrite', tx => { const r = tx.objectStore('pointer').get(POINTER_KEY); r.onsuccess = () => tx.objectStore('pointer').put(mutate(r.result)); });
    const generation = name === 'missing generation' ? 'g9' : 'g1', h = await hydrate(x.store, generation);
    assert.equal(h.status, 'recovery-required'); assert.equal(h.reason, reason);
    assert.equal((await save(x.store, before, 'after-corruption')).ok, false);
});

test('18 missing head of the active generation is recovery-required, never a fresh reseed', async t => {
    const x = await setup(t), before = (await hydrate(x.store)).snapshot;
    await rawTx(x.factory, ['head'], 'readwrite', tx => tx.objectStore('head').delete('g1'));
    const h = await hydrate(x.store); assert.equal(h.status, 'recovery-required'); assert.equal(h.reason, 'pointer-generation-missing');
    assert.equal((await save(x.store, before, 'no-head')).ok, false);
});

for (const target of ['pointer', 'reservations', 'journal']) test('27-28 interrupted publication leaves no partial state: ' + target, async t => {
    const x = await setup(t), migrationId = await stage(x, 'g2'), sealed = await seal(x, 'g2', migrationId);
    const before = await dump(x.factory, Object.keys(STORE_KEYS));
    const put = IDBObjectStore.prototype.put, add = IDBObjectStore.prototype.add;
    const fault = function (original) { return function (...args) { if (this.name === target) throw Object.assign(Error('injected'), { name: 'AbortError' }); return original.apply(this, args); }; };
    IDBObjectStore.prototype.put = fault(put); IDBObjectStore.prototype.add = fault(add);
    let result;
    try {
        result = await x.store.publish({ generation: 'g2', migrationId, operationId: 'interrupted', capability: sealed.capability,
            attestation: evidence(x, 'g2', migrationId, sealed.sealHash), expectedPointerEpoch: 1, expectedControlEpoch: sealed.controlEpoch });
    } finally { IDBObjectStore.prototype.put = put; IDBObjectStore.prototype.add = add; }
    assert.equal(result.ok, false);
    assert.deepEqual(await dump(x.factory, Object.keys(STORE_KEYS)), before);
    // The intact sealed generation can still be published afterwards.
    assert.equal((await x.store.publish({ generation: 'g2', migrationId, operationId: 'resumed', capability: sealed.capability,
        attestation: evidence(x, 'g2', migrationId, sealed.sealHash), expectedPointerEpoch: 1, expectedControlEpoch: sealed.controlEpoch })).status, 'published');
});

test('29 publication survives reopen; the retried migration is already-active', async t => {
    const x = await setup(t), migrationId = await stage(x, 'g2'); await publish(x, 'g2', migrationId, { expectedPointerEpoch: 1 });
    x.store.dispose();
    const reopened = await openIDBAuthorityStore(x.scope); t.after(() => reopened.dispose());
    assert.equal((await reopened.readPointer()).pointer.activeGeneration, 'g2');
    assert.equal((await reopened.hydrate('g2')).activity, 'active');
});

test('superseded publication reservation cannot re-activate an older generation', async t => {
    const x = await setup(t, { seed: false }), m2 = await stage(x, 'g2'), m3 = await stage(x, 'g3');
    const s2 = await seal(x, 'g2', m2), request = { generation: 'g2', migrationId: m2, operationId: 'p2', capability: s2.capability,
        attestation: evidence(x, 'g2', m2, s2.sealHash), expectedPointerEpoch: null, expectedControlEpoch: s2.controlEpoch };
    assert.equal((await x.store.publish(request)).status, 'published');
    assert.equal((await publish(x, 'g3', m3, { expectedPointerEpoch: 1 })).status, 'published');
    assert.equal((await x.store.publish({ ...request, expectedPointerEpoch: 2 })).reason, 'operation-id-payload-conflict');
    assert.equal((await pointer(x.store)).activeGeneration, 'g3');
});

test('bound-account publication requires matching fence evidence for the bound identity', async t => {
    const x = await setup(t, { seed: false }), identity = { ...control('g2').identity, ownership: 'bound-account', accountId: 'A', accountGeneration: 2, membershipId: 'port-a', membershipGeneration: 3 };
    const migrationId = await stage(x, 'g2', { identity });
    const fence = { accountId: 'A', membershipId: 'port-a', accountGeneration: 2, membershipGeneration: 3, writeEpoch: 4, barrierId: 'barrier-1', migrationId, checkpointDigest: 'd'.repeat(64) };
    assert.equal((await publish(x, 'g2', migrationId, { operationId: 'no-fence' })).reason, 'cloud-fence-required');
    assert.equal((await publish(x, 'g2', migrationId, { operationId: 'other-account', fence: { ...fence, accountGeneration: 1 } })).reason, 'cloud-fence-required');
    assert.equal((await publish(x, 'g2', migrationId, { operationId: 'fenced', fence })).status, 'published');
});

test('31-35 capability forgery, clone, scope, generation and purpose are rejected', async t => {
    const x = await setup(t, { seed: false }), migrationId = await stage(x, 'g2'), sealed = await seal(x, 'g2', migrationId);
    const request = capability => x.store.publish({ generation: 'g2', migrationId, operationId: 'cap', capability,
        attestation: evidence(x, 'g2', migrationId, sealed.sealHash), expectedControlEpoch: sealed.controlEpoch });
    const other = createTestAuthorityScope({ indexedDB: new IDBFactory(), partitionId: 'fixture-partition' });
    assert.equal((await request({ purpose: 'migration-publication', generation: 'g2' })).reason, 'capability-invalid');
    assert.equal((await request(structuredClone(sealed.capability))).reason, 'capability-invalid');
    assert.equal((await request(claimPortAuthorityIssuer(other).issue('migration-publication', { generation: 'g2' }))).reason, 'capability-invalid');
    assert.equal((await request(x.issuer.issue('migration-publication', { generation: 'g3' }))).reason, 'capability-invalid');
    assert.equal((await request(Object.freeze({ initialize: true, fixture: true, ack: true }))).reason, 'capability-invalid');
    assert.throws(() => x.issuer.issue('authority-control', { generation: 'g2' }), /capability-purpose-unavailable/);
    assert.throws(() => x.issuer.issue('system-ack', { generation: 'g2' }), /capability-purpose-unavailable/);
    assert.throws(() => x.issuer.issue('anything', { generation: 'g2' }), /capability-purpose-invalid/);
    assert.throws(() => verifyCapability(sealed.capability, { scope: x.scope, purpose: 'authority-control', generation: 'g2' }), /capability-invalid/);
    assert.throws(() => claimPortAuthorityIssuer(x.scope), /capability-issuer-unavailable/);
    assert.throws(() => claimPortAuthorityIssuer(Object.freeze({ name: AUTHORITY_DB_NAME, partitionId: 'fixture-partition' })), /isolated-scope-required/);
    const foreign = claimCapabilityIssuer(Object.freeze({})).issue('migration-publication', { generation: 'g2' });
    assert.equal((await request(foreign)).reason, 'capability-invalid');
    // Evidence is branded and bound to scope, generation, migration and seal.
    const bad = attestation => x.store.publish({ generation: 'g2', migrationId, operationId: 'att', capability: sealed.capability, attestation, expectedControlEpoch: sealed.controlEpoch });
    assert.equal((await bad({ kind: 'isolated-fixture', generation: 'g2', migrationId })).reason, 'publication-evidence-invalid');
    assert.equal((await bad(evidence(x, 'g2', migrationId, 'f'.repeat(64)))).reason, 'publication-evidence-invalid');
    assert.equal((await bad(evidence(x, 'g2', 'other-migration', sealed.sealHash))).reason, 'publication-evidence-invalid');
    assert.equal((await request(sealed.capability)).status, 'published');
});

test('36 a scope without the privileged test provider can neither trust a fixture pointer nor publish fixture evidence', async t => {
    const x = await setup(t);
    const plain = await openIDBAuthorityStore(createIsolatedIDBAuthorityScope({ indexedDB: x.factory, partitionId: 'fixture-partition' })); t.after(() => plain.dispose());
    assert.equal((await plain.readPointer()).reason, 'fixture-pointer-untrusted');
    assert.equal((await plain.hydrate('g1')).status, 'recovery-required');
    assert.equal((await plain.initialize({ generation: 'g5', control: { ...control('g5'), state: 'prepared' }, values: values(), operationId: 'plain' })).ok, false);
    // Fresh partition: a sealed generation staged by a fixture, then a production-like scope tries to publish it.
    const f = new IDBFactory(), y = await setup(t, { seed: false, factory: f }), migrationId = await stage(y, 'g2'), sealed = await seal(y, 'g2', migrationId);
    const productionLike = createIsolatedIDBAuthorityScope({ indexedDB: f, partitionId: 'fixture-partition' }), store = await openIDBAuthorityStore(productionLike);
    t.after(() => store.dispose());
    assert.equal((await store.initialize({ generation: 'g5', control: { ...control('g5'), state: 'prepared' }, values: values(), operationId: 'plain' })).reason, 'initialize-capability-required');
    const issuer = claimPortAuthorityIssuer(productionLike), capability = issuer.issue('migration-publication', { generation: 'g2' });
    const attestation = issuer.attestFixtureEvidence({ generation: 'g2', migrationId, sealHash: sealed.sealHash,
        binary: { manifestDigest: 'a'.repeat(64), assetCount: 0 }, sync: { checkpointDigest: 'b'.repeat(64), outboxPending: 0 } });
    assert.equal((await store.publish({ generation: 'g2', migrationId, operationId: 'prod', capability, attestation, expectedControlEpoch: sealed.controlEpoch })).reason, 'publication-evidence-unavailable');
    assert.equal((await store.readPointer()).pointer, null);
});

test('Repository backend writes only the pointer generation and sees supersession as read-only', async t => {
    const factory = new IDBFactory(), scope = createTestAuthorityScope({ indexedDB: factory, partitionId: 'fixture-partition' });
    const backend = await openIsolatedIDBRepositoryBackend({ scope, generation: 'g1', channelFactory: () => null }); t.after(() => backend.dispose());
    assert.equal((await backend.store.initialize({ generation: 'g1', control: control(), values: values(), operationId: 'seed' })).ok, true);
    await backend.hydrate(); const repo = new PortDatasetRepository({ backend, locks: null });
    const write = id => repo.runWrite({ expectedValues: { [met]: repo.inspect().values[met] }, operationId: id }, d => { d.setItem(met, JSON.stringify({ ...JSON.parse(d.getItem(met)), bpm: 140 })); });
    assert.equal(repo.sharedWriteCapable, true); assert.equal((await write('before')).ok, true);
    const x = { factory, scope, store: backend.store, issuer: claimPortAuthorityIssuer(scope) }, migrationId = await stage(x, 'g2');
    assert.equal((await publish(x, 'g2', migrationId, { expectedPointerEpoch: 1 })).status, 'published');
    await backend.hydrate(); assert.equal(repo.sharedWriteCapable, false);
    assert.equal((await write('after')).ok, false);
});

// ---- 36-38 product isolation: the transitive Port/Studio boot graph never reaches these modules ----
function graph(entries) {
    const seen = new Set(), queue = [...entries];
    while (queue.length) {
        const url = queue.pop(); const path = url.pathname;
        if (seen.has(path) || !existsSync(url)) continue; seen.add(path);
        const source = readFileSync(url, 'utf8');
        for (const [, spec] of source.matchAll(/(?:import\s[^'"]*?from\s*|import\(\s*|<script[^>]*\ssrc=)['"]([^'"]+)['"]/g)) {
            if (!spec.startsWith('.')) continue;
            queue.push(new URL(spec.split('?')[0], url));
        }
    }
    return [...seen];
}
test('36-38 Port standard/Pro and Studio boot graphs import no Authority store, capability or IDB backend', () => {
    const entries = ['../index.html', '../pro_9a3943176561/index.html', '../../cruise-studio/index.html'].map(p => new URL(p, import.meta.url));
    const reached = graph(entries);
    assert(reached.some(path => path.endsWith('/practice-menu-app.js')), 'the Port boot graph was traversed');
    for (const module of ['port-indexeddb-authority-store.mjs', 'port-authority-capabilities.mjs', 'port-indexeddb-repository-backend.mjs', 'test-authority.mjs'])
        assert(!reached.some(path => path.endsWith('/' + module)), module);
    assert.equal(digest('x').length, 64);
});
