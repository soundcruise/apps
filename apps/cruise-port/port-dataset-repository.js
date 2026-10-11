// Port owns this dataset. This module has no Account, Pro, audio or network side effects.
export const PORT_DATASET_PROTOCOL = 1;
export const PORT_DATASET_LOCK = 'sound-cruise:port:dataset:v1';
export const PORT_DATASET_META = 'cruisePort.datasetRepository.v1';
export const PORT_DELETE_INTENTS = 'cruisePort.syncDeletionIntent.v1';
export const PORT_DATASET_CATALOG = Object.freeze({
    'cruisePort.settings': { version: 3, singleton: 'settings/global' },
    'cruisePort.metronome': { version: 3, singleton: 'metronome_settings/default' },
    'cruisePort.metronomePresets': { version: 1, field: 'items', type: 'metronome_preset' },
    'cruisePort.tuner': { version: 3, singleton: 'tuner_settings/default' },
    'cruisePort.practiceMenus': { version: 3, field: 'items', type: 'practice_menu', order: 'practice_menu_order/default' },
    'cruisePort.practiceProgress': { version: 3, singleton: 'practice_cycle/current' },
    'cruisePort.practiceHistory': { version: 5, field: 'events', type: 'practice_history_event' },
    'cruisePort.practiceCalendar': { version: 2, field: 'notes', type: 'calendar_event' },
    'cruisePort.practiceMenuSets': { version: 1, field: 'items', type: 'practice_menu_set' },
    'cruisePort.gearList': { version: 5, field: 'items', type: 'gear_item' },
    'cruisePort.gearCategories': { version: 1, field: 'categories', type: 'gear_category', order: 'gear_category_order/default' },
    'cruisePort.myApps': { version: 7, field: 'items', type: 'my_app', order: 'my_app_order/default' },
    'cruisePort.syncAssetMetadata': { version: 4 },
    'cruisePort.schemaVersion': { version: 3, scalar: true }
});
export const PORT_DATASET_KEYS = Object.freeze([...Object.keys(PORT_DATASET_CATALOG), PORT_DELETE_INTENTS]);
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));
const error = code => Object.assign(new Error(code), { code });
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
function safeObject(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        if (forbidden.has(key)) throw error('forward-incompatible');
        safeObject(child);
    }
}
export function assertPortForwardCompatible(values) {
    for (const [key, spec] of Object.entries(PORT_DATASET_CATALOG)) {
        const raw = values[key];
        if (raw == null) continue;
        let value;
        try { value = JSON.parse(raw); } catch { throw error('forward-incompatible'); }
        safeObject(value);
        const version = spec.scalar ? value : value?.version;
        // Unversioned settings are a supported historical format; no other unknown envelope is writable.
        if (!(key === 'cruisePort.settings' && plain(value) && version === undefined)
            && (!Number.isInteger(version) || version < 1 || version > spec.version)) throw error('forward-incompatible');
        if (!spec.scalar && !plain(value)) throw error('forward-incompatible');
        if (key === 'cruisePort.syncAssetMetadata' && (![2, 3, 4].includes(version)
            || ['gear', 'myApps', 'attachments'].some(bucket => value[bucket] !== undefined &&
                (!plain(value[bucket]) || Object.values(value[bucket]).some(entry => !plain(entry))))
            || ['releaseQueue', 'discardQueue'].some(queue => value[queue] !== undefined && !Array.isArray(value[queue])))) {
            throw error('forward-incompatible');
        }
        if (spec.field && (!Array.isArray(value[spec.field]) || value[spec.field].some(v => !plain(v) || typeof v.id !== 'string')
            || new Set(value[spec.field].map(v => v.id)).size !== value[spec.field].length)) {
            throw error('forward-incompatible');
        }
    }
}
// Preserve unrecognized fields in known envelopes and surviving records. Array removal
// is explicit; records are matched by stable id, never by their old array position.
export function preservePortFields(before, after, field = null) {
    if (Array.isArray(after)) {
        return after.map(item => plain(item) && typeof item.id === 'string'
            ? preservePortFields(Array.isArray(before) ? before.find(old => old?.id === item.id) : undefined, item)
            : clone(item));
    }
    if (!plain(after)) return after;
    const next = plain(before) && !['gear', 'myApps', 'attachments', 'totalCounts'].includes(field) ? clone(before) : {};
    for (const [key, value] of Object.entries(after)) {
        if (forbidden.has(key)) throw error('forward-incompatible');
        next[key] = preservePortFields(plain(before) ? before[key] : undefined, value, key);
    }
    return next;
}
function memory(values) {
    const data = { ...values };
    return { getItem: key => data[key] ?? null,
        setItem(key, value) { if (!PORT_DATASET_KEYS.includes(key)) throw error('unmanaged-key'); data[key] = String(value); },
        removeItem(key) { if (!PORT_DATASET_KEYS.includes(key)) throw error('unmanaged-key'); data[key] = null; },
        values: data };
}
function parseJournal(raw) {
    const value = JSON.parse(raw || '{}');
    if (!plain(value)) throw error('delete-intent-invalid');
    safeObject(value);
    for (const entry of Object.values(value)) {
        if (entry !== true && !(plain(entry) && typeof entry.generation === 'string')) throw error('delete-intent-invalid');
    }
    return value;
}
export class PortDatasetRepository {
    constructor({ storage, locks = globalThis.navigator?.locks, token = () => globalThis.crypto.randomUUID(), notify = () => {} } = {}) {
        this.storage = storage;
        this.locks = locks;
        this.token = token;
        this.notify = notify;
        this.listeners = new Set();
        this.degraded = false;
    }
    get sharedWriteCapable() { return typeof this.locks?.request === 'function' && !this.degraded; }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    inspect() {
        const metaRaw = this.storage.getItem(PORT_DATASET_META);
        const values = Object.fromEntries(PORT_DATASET_KEYS.map(key => [key, this.storage.getItem(key)]));
        if (metaRaw !== this.storage.getItem(PORT_DATASET_META)) throw error('dataset-changing');
        const meta = metaRaw === null ? null : JSON.parse(metaRaw);
        if (meta && meta.protocol !== PORT_DATASET_PROTOCOL) throw error('protocol-mismatch');
        if (this.degraded || meta?.pending) throw error('recovery-required');
        assertPortForwardCompatible(values);
        parseJournal(values[PORT_DELETE_INTENTS]);
        return Object.freeze({ protocol: PORT_DATASET_PROTOCOL, generation: meta?.generation ?? null,
            // Include raw values: an old build cannot silently invalidate a new-build base by omitting our metadata.
            revision: JSON.stringify([metaRaw, values]), values: Object.freeze(values), keyRevisions: Object.freeze({ ...(meta?.keyRevisions || {}) }), sharedWriteCapable: this.sharedWriteCapable });
    }
    async readDatasetState() {
        if (!this.sharedWriteCapable) return this.inspect();
        return this.locks.request(PORT_DATASET_LOCK, { mode: 'shared' }, () => this.inspect());
    }
    async runWrite({ expectedRevision, expectedValues, expectedKeyRevisions, source = 'local', preserveUnknown = true, assertCurrent = () => {} } = {}, writer) {
        if (!this.sharedWriteCapable) return { ok: false, status: 'rejected', reason: 'locks-unavailable' };
        try {
            return await this.locks.request(PORT_DATASET_LOCK, { mode: 'exclusive' }, async () => {
                await assertCurrent();
                const before = this.inspect();
                if (expectedRevision === undefined && expectedValues === undefined) throw error('base-required');
                if (expectedRevision !== undefined && expectedRevision !== before.revision) throw error('stale');
                for (const [key, raw] of Object.entries(expectedValues || {})) {
                    if (before.values[key] !== raw) throw error('stale');
                }
                for (const [key, revision] of Object.entries(expectedKeyRevisions || {})) {
                    if ((before.keyRevisions[key] ?? null) !== revision) throw error('stale');
                }
                const draft = memory(before.values);
                const result = await writer(draft);
                await assertCurrent();
                if (result?.ok === false) return { ...result, status: 'rejected' };
                assertPortForwardCompatible(draft.values);
                for (const key of Object.keys(PORT_DATASET_CATALOG)) {
                    if (preserveUnknown && draft.values[key] !== null && before.values[key] !== null && draft.values[key] !== before.values[key]) {
                        draft.values[key] = JSON.stringify(preservePortFields(JSON.parse(before.values[key]), JSON.parse(draft.values[key])));
                    }
                }
                const generation = this.token();
                if (source === 'local') this.coordinateDeletes(before.values, draft.values, generation);
                const changed = PORT_DATASET_KEYS.filter(key => draft.values[key] !== before.values[key]);
                if (!changed.length) return { ...result, ok: true, status: 'unchanged', revision: before.revision, state: before };
                // No await between final base check, WAL, data writes and metadata publication.
                if (this.inspect().revision !== before.revision) throw error('stale');
                const metaBefore = this.storage.getItem(PORT_DATASET_META);
                const meta = { protocol: PORT_DATASET_PROTOCOL, generation: before.generation || this.token(), revision: this.token(), keyRevisions: { ...before.keyRevisions, ...Object.fromEntries(changed.map(key => [key, this.token()])) } };
                let rollback = 'succeeded';
                try {
                    this.storage.setItem(PORT_DATASET_META, JSON.stringify({ ...meta, pending: { before: before.values, metaBefore } }));
                    for (const key of changed) this.writeRaw(key, draft.values[key]);
                    this.storage.setItem(PORT_DATASET_META, JSON.stringify(meta));
                } catch {
                    for (const key of changed) { try { this.writeRaw(key, before.values[key]); } catch { rollback = 'failed'; } }
                    if (rollback === 'succeeded') { try { this.writeRaw(PORT_DATASET_META, metaBefore); } catch { rollback = 'failed'; } }
                    if (rollback === 'failed') this.degraded = true;
                    return { ok: false, status: rollback === 'failed' ? 'recovery-required' : 'rolled-back', reason: 'write-failed', rollback };
                }
                const state = this.inspect();
                const event = Object.freeze({ revision: state.revision, generation: state.generation, keys: Object.freeze(changed), source });
                for (const fn of [this.notify, ...this.listeners]) { try { fn(event); } catch { /* A subscriber cannot undo a committed write. */ } }
                return { ...result, ok: true, status: 'committed', revision: state.revision, state };
            });
        } catch (e) { return { ok: false, status: e.code === 'recovery-required' ? 'recovery-required' : 'rejected', reason: e.code || 'read-failed' }; }
    }
    writeRaw(key, value) { if (value === null) this.storage.removeItem(key); else this.storage.setItem(key, value); }
    coordinateDeletes(before, after, generation) {
        const intents = parseJournal(before[PORT_DELETE_INTENTS]);
        const requested = parseJournal(after[PORT_DELETE_INTENTS]);
        for (const [key, intent] of Object.entries(requested)) {
            if (JSON.stringify(intent) !== JSON.stringify(intents[key])) intents[key] = { generation };
        }
        for (const [key, spec] of Object.entries(PORT_DATASET_CATALOG)) {
            if (before[key] === after[key]) continue;
            const old = JSON.parse(before[key] || 'null'), next = JSON.parse(after[key] || 'null');
            if (spec.singleton) {
                if (next !== null) delete intents[spec.singleton];
                else if (old !== null) intents[spec.singleton] = { generation };
            }
            if (!spec.field) continue;
            const oldItems = old?.[spec.field] || [], nextItems = next?.[spec.field] || [];
            const ids = new Set(nextItems.map(v => v.id));
            for (const id of ids) delete intents[`${spec.type}/${id}`];
            for (const item of oldItems) if (!ids.has(item.id)) intents[`${spec.type}/${item.id}`] = { generation };
            if (spec.order) {
                if (ids.size) delete intents[spec.order];
                else if (oldItems.length) intents[spec.order] = { generation };
            }
            if (spec.type === 'gear_item') for (const status of ['owned', 'wishlist', 'sold']) {
                if (nextItems.some(v => v.status === status)) delete intents[`gear_order/${status}`];
                else if (oldItems.some(v => v.status === status)) intents[`gear_order/${status}`] = { generation };
            }
        }
        const assetKey = 'cruisePort.syncAssetMetadata';
        if (before[assetKey] !== after[assetKey]) {
            const old = JSON.parse(before[assetKey] || 'null')?.attachments || {};
            const next = JSON.parse(after[assetKey] || 'null')?.attachments || {};
            for (const id of Object.keys(next)) delete intents[`practice_attachment/${id}`];
            for (const id of Object.keys(old)) if (!Object.hasOwn(next, id)) intents[`practice_attachment/${id}`] = { generation };
            const oldOwners = new Set(Object.values(old).map(entry => entry.practiceId));
            const nextOwners = new Set(Object.values(next).map(entry => entry.practiceId));
            for (const id of nextOwners) delete intents[`practice_attachment_set/${id}`];
            for (const id of oldOwners) if (!nextOwners.has(id)) intents[`practice_attachment_set/${id}`] = { generation };
        }
        after[PORT_DELETE_INTENTS] = Object.keys(intents).length ? JSON.stringify(intents) : null;
    }
    async acknowledgeDelete(key, generation, expectedRevision, assertCurrent = () => {}) {
        return this.runWrite({ expectedRevision, source: 'ack', assertCurrent }, draft => {
            const intents = parseJournal(draft.getItem(PORT_DELETE_INTENTS));
            // Legacy booleans have no identity: keep them until a new coordinated delete replaces them.
            if (typeof generation !== 'string' || intents[key]?.generation !== generation) return { matched: false };
            delete intents[key];
            draft.setItem(PORT_DELETE_INTENTS, JSON.stringify(intents));
            return { matched: true };
        });
    }
}
