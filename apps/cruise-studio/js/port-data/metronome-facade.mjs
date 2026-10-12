// Dormant Port-backed boundary. Production calls only the existing read host.
// A repository executor is injected solely by isolated integration fixtures.
import { createOperationBoundary } from '../../../cruise-port/port-write-readiness.mjs?v=1.22.9';
import { saveMetronomeSettings, METRONOME_DEFAULTS, METRONOME_STORAGE_KEY } from '../../../cruise-port/metronome-store.js?v=1.22.4';
import { createMetronomePreset, deleteMetronomePreset, loadMetronomePresets,
    METRONOME_PRESETS_STORAGE_KEY, settingsFromMetronomePreset } from '../../../cruise-port/metronome-presets-store.js?v=1.22.4';
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
export function createPortMetronomeFacade({ host, fixtureExecutor = null }) {
    let disposed = false;
    const bases = new WeakMap(), subscriptions = new Set();
    const executor = fixtureExecutor;
    const boundary = executor && createOperationBoundary(executor);
    const fail = reason => ({ ok: false, reason });
    async function read() {
        if (disposed) throw Error('disposed');
        if (!executor) {
            const state = await host.readLocalStatus();
            if (disposed) throw Error('disposed');
            return { state, data: copy(state.dataset?.settings), presets: copy(state.dataset?.presets || []) };
        }
        const base = await executor.repository.readDatasetState();
        if (disposed) throw Error('disposed');
        const token = Object.freeze({});
        const context = copy(await executor.readContext());
        if (disposed) throw Error('disposed');
        bases.set(token, { base, context });
        return { token, data: JSON.parse(base.values[METRONOME_STORAGE_KEY] || 'null'),
            presets: JSON.parse(base.values[METRONOME_PRESETS_STORAGE_KEY] || '{"items":[]}').items };
    }
    async function write(action, token, keys, writer) {
        if (disposed) return fail('disposed');
        if (!executor) { const readiness = await host.checkWriteReadiness({ action }); return fail(readiness.reason || 'write-disabled'); }
        const bound = bases.get(token);
        if (!bound) return fail('invalid-base-token');
        try {
            const current = await executor.readContext();
            if (['generation', 'accountGeneration', 'accountId', 'repositoryEpoch'].some(key => current[key] !== bound.context[key])) return fail('account-generation-changed');
            const operation = await boundary.begin(action, bound.base, { targetKeys: keys });
            await boundary.assertCurrent(operation);
            const result = await executor.repository.runWrite({
                expectedValues: Object.fromEntries(keys.map(key => [key, bound.base.values[key]])),
                expectedKeyRevisions: Object.fromEntries(keys.map(key => [key, bound.base.keyRevisions[key] ?? null])),
                operationId: operation.operationId, authorizationContext: operation,
                commitGuard: (context, details) => boundary.commitGuard(context, details),
                assertCurrent: () => boundary.assertCurrent(operation)
            }, writer);
            if (!result.ok) return fail(result.reason);
            try { await boundary.assertCurrent(operation, { committed: true }); }
            catch (_) { return { ok: true, localStatus: 'local-saved', syncStatus: 'sync-unconfirmed', publish: false, operationId: operation.operationId }; }
            // No direct outbox API and no partial Sync snapshot. A future owner
            // receives only the fact that this full repository changed.
            return { ok: true, localStatus: result.status === 'unchanged' ? 'unchanged' : 'local-saved', syncStatus: 'sync-unconfirmed', publish: false, operationId: operation.operationId };
        } catch (error) { return fail(error.code || error.message); }
    }
    return Object.freeze({
        capabilities: Object.freeze({ memoryOnly: false, persistProjectionOnLoad: false }),
        async load() { try { const value = await read(); return { ok: true, data: copy(value.data), baseToken: value.token || null, readOnly: !executor }; } catch (error) { return fail(error.code || error.message); } },
        async listPresets() { try { const value = await read(); return { ok: true, presets: copy(value.presets), baseToken: value.token || null }; } catch (error) { return fail(error.code || error.message); } },
        saveSettings(patch, { baseToken } = {}) {
            const bound = bases.get(baseToken);
            const base = bound && (JSON.parse(bound.base.values[METRONOME_STORAGE_KEY] || 'null') || copy(METRONOME_DEFAULTS));
            const candidate = copy(patch);
            const action = Object.keys(patch || {}).some(key => key !== 'bpm') ? 'saveAdvanced' : 'saveBpm';
            return write(action, baseToken, [METRONOME_STORAGE_KEY], tx => saveMetronomeSettings({ ...base, ...candidate }, tx));
        },
        createPreset({ name, settings }, { baseToken } = {}) {
            const candidate = copy(settings);
            return write('createPreset', baseToken, [METRONOME_PRESETS_STORAGE_KEY], tx => {
                const result = loadMetronomePresets(tx);
                return result.ok ? createMetronomePreset({ presets: result.presets, name, settings: candidate, storage: tx }) : result;
            });
        },
        deletePreset(id, { baseToken } = {}) {
            return write('deletePreset', baseToken, [METRONOME_PRESETS_STORAGE_KEY], tx => {
                const result = loadMetronomePresets(tx);
                return result.ok ? deleteMetronomePreset({ presets: result.presets, id, storage: tx }) : result;
            });
        },
        applyPreset(id, { presetBaseToken, settingsBaseToken, advanced = false } = {}) {
            if (!executor) return write('applyPreset', null, [], () => {});
            const presets = bases.get(presetBaseToken), settings = bases.get(settingsBaseToken);
            if (!presets || !settings) return Promise.resolve(fail('invalid-base-token'));
            if (['generation', 'accountGeneration', 'accountId', 'repositoryEpoch', 'writerProtocol'].some(key => presets.context[key] !== settings.context[key])) return Promise.resolve(fail('account-generation-changed'));
            const combined = Object.freeze({});
            bases.set(combined, { ...settings, base: { ...settings.base,
                values: { ...settings.base.values, [METRONOME_PRESETS_STORAGE_KEY]: presets.base.values[METRONOME_PRESETS_STORAGE_KEY] },
                keyRevisions: { ...settings.base.keyRevisions, [METRONOME_PRESETS_STORAGE_KEY]: presets.base.keyRevisions[METRONOME_PRESETS_STORAGE_KEY] } } });
            // Full application is an explicit advanced operation with a fresh Pro proof.
            return write(advanced ? 'saveAdvanced' : 'applyPreset', combined, [METRONOME_STORAGE_KEY, METRONOME_PRESETS_STORAGE_KEY], async tx => {
                const loaded = loadMetronomePresets(tx), preset = loaded.presets?.find(item => item.id === id);
                if (!loaded.ok || !preset) return fail('preset-unavailable');
                const next = settingsFromMetronomePreset(preset), previous = JSON.parse(tx.getItem(METRONOME_STORAGE_KEY) || 'null') || copy(METRONOME_DEFAULTS);
                return saveMetronomeSettings(advanced ? next : { ...previous, bpm: next.bpm }, tx);
            });
        },
        subscribe(fn) { if (disposed) return () => {}; const off = host.subscribe(fn); subscriptions.add(off); return () => { off(); subscriptions.delete(off); }; },
        dispose() { if (disposed) return; disposed = true; boundary?.dispose(); for (const off of subscriptions) off(); subscriptions.clear(); }
    });
}
