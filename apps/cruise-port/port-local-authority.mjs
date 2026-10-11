// Port-owned physical boundary. No import-time storage/network/activation.
import { PortDatasetRepository, PORT_DATASET_KEYS, PORT_DATASET_META, PORT_DELETE_INTENTS,
    PORT_DATASET_PROTOCOL, assertPortForwardCompatible } from './port-dataset-repository.js';
import { AUTHORITY_WRITER_PROTOCOL, createWriterAuthorityClient } from '../shared/sync-account/writer-authority.mjs';
export const PORT_AUTHORITY_NAMESPACE_VERSION = 1;
export const PORT_AUTHORITY_PREFIX = 'soundCruise.portAuthority.v1.';
export const PORT_AUTHORITY_POINTER = PORT_AUTHORITY_PREFIX + 'active';
const fail = code => Object.assign(new Error(code), { code });
const copy = value => structuredClone(value);
const identity = generation => {
    if (typeof generation !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(generation)) throw fail('authority-generation-invalid');
    return generation;
};
export const authorityPhysicalKey = (generation, key) => `${PORT_AUTHORITY_PREFIX}${identity(generation)}.data.${encodeURIComponent(key)}`;
export const authorityMarkerKey = generation => `${PORT_AUTHORITY_PREFIX}${identity(generation)}.marker`;
export const authorityLockName = generation => `sound-cruise:port:authority:v1:${identity(generation)}`;
export async function authorityHash(value) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(await value.arrayBuffer());
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
}
function fullValues(values) {
    if (!values || Object.keys(values).length !== PORT_DATASET_KEYS.length || PORT_DATASET_KEYS.some(key => !Object.hasOwn(values, key)))
        throw fail('partial-dataset');
    if (Object.values(values).some(value => value !== null && typeof value !== 'string')) throw fail('invalid-dataset');
    assertPortForwardCompatible(values);
    // Reuse repository parsing, delete intent and forward rules without writing.
    new PortDatasetRepository({ storage: { getItem: key => values[key] ?? null }, locks: null }).inspect();
}
export function portAssetReferences(values) {
    const refs = new Map();
    const add = (kind, id) => { if (id) { if (typeof id !== 'string') throw fail('asset-ref-invalid'); refs.set(`${kind}:${id}`, { kind, id }); } };
    for (const item of JSON.parse(values['cruisePort.gearList'] || 'null')?.items || []) {
        add('gear', item.photoId); add('gear', item.photoSourceId);
    }
    for (const item of JSON.parse(values['cruisePort.myApps'] || 'null')?.items || []) {
        add('myApps', item.iconId); add('myApps', item.iconSourceId);
    }
    const metadata = JSON.parse(values['cruisePort.syncAssetMetadata'] || 'null');
    for (const kind of ['gear', 'myApps', 'attachments']) for (const entry of Object.values(metadata?.[kind] || {})) {
        if (entry.published?.version > 1) throw fail('forward-incompatible');
        const walk = value => { if (!value || typeof value !== 'object') return;
            if (value.localId) add(kind, value.localId);
            for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child);
        }; walk(entry.binding); walk(entry.pending);
    }
    return [...refs.values()];
}
export async function validatePortAuthorityCandidate({ values, assets = [] }) {
    fullValues(values);
    const [{ validatePortLocalCollections }, { loadMetronomeSettings }, { loadTunerSettings }] = await Promise.all([
        import('./port-sync-local-validation.js'), import('./metronome-store.js'), import('./tuner-store.js')]);
    const projection = new Map(Object.entries(values));
    const view = { getItem: key => projection.get(key) ?? null, setItem: (key, value) => projection.set(key, String(value)), removeItem: key => projection.delete(key) };
    // Legacy loader migration is restricted to this private projection; raw stays exact.
    try { validatePortLocalCollections(view); } catch { throw fail('candidate-invalid'); }
    if (!loadMetronomeSettings(view).ok || !loadTunerSettings(view).ok) throw fail('candidate-invalid');
    const keys = new Set();
    for (const asset of assets) {
        const key = `${asset.kind}:${asset.id}`;
        if (!['gear', 'myApps', 'attachments'].includes(asset.kind) || !asset.id || keys.has(key) || !asset.blob?.arrayBuffer)
            throw fail('asset-inventory-invalid');
        keys.add(key);
        if (asset.hash !== await authorityHash(asset.blob)) throw fail('binary-hash-mismatch');
    }
    for (const ref of portAssetReferences(values)) if (!keys.has(`${ref.kind}:${ref.id}`)) throw fail('binary-missing');
    return { hashes: Object.fromEntries(await Promise.all(Object.entries(values).map(async ([key, raw]) => [key, await authorityHash(JSON.stringify(raw))]))),
        assetInventory: await Promise.all(assets.map(async ({ kind, id, hash, blob, metadata }) => ({ kind, id, hash, byteSize: blob.size, metadataHash: await authorityHash(JSON.stringify(metadata ?? null)) }))), references: portAssetReferences(values) };
}
export function createPortAuthorityProvider({ storage, generation = null, locks = globalThis.navigator?.locks } = {}) {
    if (!generation) return Object.freeze({ storage, lockName: 'sound-cruise:port:dataset:v1',
        describe: () => ({ owner: 'port', state: 'legacy', generation: null }), assertReadable() {}, assertWritable() {} });
    identity(generation);
    const marker = () => {
        let value; try { value = JSON.parse(storage.getItem(authorityMarkerKey(generation))); } catch { throw fail('authority-recovery-required'); }
        if (!value || value.namespaceVersion !== PORT_AUTHORITY_NAMESPACE_VERSION || value.generation !== generation || value.owner !== 'port' ||
            value.repositoryProtocol !== PORT_DATASET_PROTOCOL || value.writerProtocol !== AUTHORITY_WRITER_PROTOCOL ||
            !value.hashes || PORT_DATASET_KEYS.some(key => !/^[0-9a-f]{64}$/.test(value.hashes[key] || '')) ||
            !Array.isArray(value.assetInventory) || !Array.isArray(value.references) ||
            !['prepared', 'active'].includes(value.state) || value.migrationState !== 'candidate-staged' ||
            !['unbound-local', 'bound-account'].includes(value.ownership) ||
            (value.ownership === 'bound-account' ? typeof value.accountId !== 'string' || !value.accountId : value.accountId !== null))
            throw fail('authority-recovery-required');
        return value;
    };
    const view = Object.freeze({ getItem: key => storage.getItem(authorityPhysicalKey(generation, key)),
        setItem: (key, value) => storage.setItem(authorityPhysicalKey(generation, key), value),
        removeItem: key => storage.removeItem(authorityPhysicalKey(generation, key)) });
    return Object.freeze({ storage: view, lockName: authorityLockName(generation),
        describe: () => copy(marker()), assertReadable: () => { marker(); },
        assertWritable() { if (!locks?.request) throw fail('locks-unavailable'); if (marker().state !== 'prepared') throw fail('authority-not-prepared'); },
        assertSyncAccount(accountId) { if (!accountId || marker().accountId !== accountId || marker().ownership !== 'bound-account') throw fail('authority-account-mismatch'); }
    });
}
export async function createPreparedPortAuthority({ storage, values, assets = [], binaryStore, accountId = null,
    generation = crypto.randomUUID(), locks = globalThis.navigator?.locks } = {}) {
    identity(generation);
    if (!locks?.request) throw fail('locks-unavailable');
    const fixed = copy(values), fixedAssets = copy(assets);
    const validation = await validatePortAuthorityCandidate({ values: fixed, assets: fixedAssets });
    if (fixedAssets.length && (!binaryStore || binaryStore.generation !== generation)) throw fail('binary-authority-mismatch');
    if (accountId !== null && (typeof accountId !== 'string' || !accountId)) throw fail('authority-account-mismatch');
    return locks.request(authorityLockName(generation), { mode: 'exclusive' }, async () => {
        if (storage.getItem(authorityMarkerKey(generation)) !== null) throw fail('authority-already-exists');
        const base = { owner: 'port', namespaceVersion: PORT_AUTHORITY_NAMESPACE_VERSION, generation,
            repositoryProtocol: PORT_DATASET_PROTOCOL, writerProtocol: AUTHORITY_WRITER_PROTOCOL,
            accountId, ownership: accountId ? 'bound-account' : 'unbound-local', migrationState: 'candidate-staged', ...validation };
        // Interrupted staging is never readable. Final marker is the only publication point.
        storage.setItem(authorityMarkerKey(generation), JSON.stringify({ ...base, state: 'staging' }));
        for (const [key, raw] of Object.entries(fixed)) if (raw !== null) storage.setItem(authorityPhysicalKey(generation, key), raw);
        for (const asset of fixedAssets) { await binaryStore.put(asset); await binaryStore.verify(asset.kind, asset.id); }
        const staged = Object.fromEntries(PORT_DATASET_KEYS.map(key => [key, storage.getItem(authorityPhysicalKey(generation, key))]));
        if (PORT_DATASET_KEYS.some(key => staged[key] !== fixed[key])) throw fail('authority-stage-invalid');
        await validatePortAuthorityCandidate({ values: staged, assets: fixedAssets });
        storage.setItem(authorityMarkerKey(generation), JSON.stringify({ ...base, state: 'prepared' }));
        // No active pointer, no legacy write/import loop, no production selection.
        return createPortAuthorityProvider({ storage, generation, locks });
    });
}
export async function captureLegacyCandidate({ storage, locks = globalThis.navigator?.locks,
    readAssets = async () => [], readSyncInventory = async () => ({ inspected: false }), provenance } = {}) {
    if (provenance !== undefined) {
        const { captureMigrationCandidate } = await import('./port-migration-candidate.mjs');
        return captureMigrationCandidate({ storage, locks, readAssets, readSyncInventory, provenance });
    }
    const capture = () => ({ values: Object.fromEntries(PORT_DATASET_KEYS.map(key => [key, storage.getItem(key)])), repositoryMetadata: storage.getItem(PORT_DATASET_META) });
    const read = async () => {
        const before = capture();
        try {
            const assets = await readAssets(), rawSync = await readSyncInventory();
            const inspected = rawSync?.inspected === true && ['outbox', 'shadow', 'conflicts'].every(key => Array.isArray(rawSync[key]));
            const syncInventory = { inspected, outbox: copy(rawSync?.outbox || []), shadow: copy(rawSync?.shadow || []), conflicts: copy(rawSync?.conflicts || []) };
            const validation = await validatePortAuthorityCandidate({ values: before.values, assets });
            const after = capture();
            if (JSON.stringify(before) !== JSON.stringify(after)) return { ok: false, status: 'review-required', reason: 'legacy-changing' };
            const repo = new PortDatasetRepository({ storage, locks: null }); repo.inspect();
            const sourceHash = await authorityHash(JSON.stringify({ ...before, assetInventory: validation.assetInventory, syncInventory }));
            if (JSON.stringify(before) !== JSON.stringify(capture())) return { ok: false, status: 'review-required', reason: 'legacy-changing' };
            return { ok: true, status: 'candidate-only', ...before, assets, ...validation,
                deleteIntents: JSON.parse(before.values[PORT_DELETE_INTENTS] || '{}'), syncInventory,
                reviewRequired: syncInventory.inspected !== true,
                sourceHash };
        } catch (e) { return { ok: false, status: 'review-required', reason: e.code || 'candidate-invalid' }; }
    };
    return locks?.request ? locks.request('sound-cruise:port:dataset:v1', { mode: 'shared' }, read) : read();
}

// Explicit future owner wiring; neither factory performs I/O or activation.
export function createPortAuthoritySyncStore(provider, { accountId, syncRoot = globalThis.SoundCruiseMultiAppSync, ...options } = {}) {
    provider.assertSyncAccount(accountId);
    return syncRoot.dataStorage.createStore('port', { ...options, accountId, authorityGeneration: provider.describe().generation });
}
export function createPortWriterAuthorityClient(runtime, provider = null) {
    return createWriterAuthorityClient({ runtime, readLocalAuthority: () => {
        if (!provider) return { state: 'legacy' };
        provider.assertSyncAccount(runtime.executionAccountId); return provider.describe();
    } });
}
