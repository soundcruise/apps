import { PortDatasetRepository, PORT_DATASET_KEYS } from './port-dataset-repository.js?v=1.22.7';
const repositories = new WeakMap();
const bases = new WeakMap();
export function registerPortRepository(storage, repository) { repositories.set(storage, repository); bases.set(storage, new Map()); }
export function usesPortRepository(storage) {
    try { if (storage === undefined) storage = globalThis.localStorage; } catch { return false; }
    return !!storage && (repositories.has(storage) || (typeof globalThis.Storage === 'function' && storage instanceof globalThis.Storage));
}
export function portRepository(storage = globalThis.localStorage) {
    if (!repositories.has(storage)) registerPortRepository(storage, new PortDatasetRepository({ storage, notify(detail) {
        globalThis.dispatchEvent?.(new CustomEvent('cruise-port-local-data-changed', { detail }));
        if (detail.source === 'local') globalThis.SoundCruiseMultiAppSync?.notifyLocalSave?.('port');
    } }));
    return repositories.get(storage);
}
export function readPortStore(storage = globalThis.localStorage, reader) {
    const repo = portRepository(storage);
    let values, issue, state;
    try { state = repo.inspect(); values = state.values; } catch (e) { values = {}; issue = e.code || 'read-failed'; }
    const reads = new Set(), draft = { ...values };
    const view = { getItem(key) { reads.add(key); return draft[key] ?? null; },
        setItem(key, value) { draft[key] = String(value); }, removeItem(key) { draft[key] = null; } };
    const result = reader(view);
    if (issue) return { ...result, ok: false, readOnly: true, reason: issue };
    for (const key of reads) bases.get(storage).set(key, { raw: values[key] ?? null, revision: state.keyRevisions[key] ?? null, blocked: result?.ok === false && values[key] != null });
    return result;
}
export async function writePortStore(storage = globalThis.localStorage, keys, writer) {
    const repo = portRepository(storage);
    let state;
    try { state = repo.inspect(); } catch (e) { return { ok: false, reason: e.code || 'read-failed' }; }
    const base = bases.get(storage);
    if (keys.some(key => base.get(key)?.blocked)) return { ok: false, readOnly: true, reason: 'forward-incompatible' };
    const expectedValues = Object.fromEntries(keys.map(key => [key, base.has(key) ? base.get(key).raw : state.values[key]]));
    const expectedKeyRevisions = Object.fromEntries(keys.map(key => [key, base.has(key) ? base.get(key).revision : state.keyRevisions[key] ?? null]));
    const result = await repo.runWrite({ expectedValues, expectedKeyRevisions }, writer);
    if (result.ok) {
        // Use the state we committed, never a newer queued writer's state.
        const next = result.state;
        for (const key of keys) base.set(key, { raw: next.values[key], revision: next.keyRevisions[key] ?? null });
    }
    return result;
}
Object.assign(globalThis.SoundCruisePortSync ||= {}, { portRepository, usesPortRepository, PORT_DATASET_KEYS });
