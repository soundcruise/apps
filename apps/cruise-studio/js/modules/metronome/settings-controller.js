/* Settings domain, separate from Editing Session and audio lifecycle. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.metronomeSettings = factory();
})(globalThis, function () {
    'use strict';
    function createController(options) {
        var schema = options.schema, store = options.store;
        var draft = schema.defaults(), saved = null, rawEnvelope = null, baseRevision = null;
        var loaded = false, saveStatus = 'unloaded', error = null, readOnly = false, forwardIncompatible = false;
        var generation = 0, disposed = false, pendingSave = null, pendingLoad = null, conflict = null;
        var capabilities = { metronomeAdvanced: options.accessState?.metronomeAdvanced === true };
        var listeners = new Set(), incoming = null, inputPending = false;
        function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
        function effective() { return schema.effective(draft, capabilities); }
        function dirty() { return loaded && !equal(draft, saved); }
        function snapshot() {
            return Object.freeze({ loaded: loaded, rawEnvelope: schema.copy(rawEnvelope), rawSettings: schema.copy(draft),
                effectiveSettings: effective(), dirty: dirty(), baseRevision: baseRevision, saveStatus: saveStatus,
                error: error, forwardIncompatible: forwardIncompatible, readOnly: readOnly,
                conflict: conflict && schema.copy(conflict), externalUpdatePending: incoming && schema.copy(incoming), inputPending: inputPending, disposed: disposed });
        }
        function publish() { listeners.forEach(function (fn) { try { fn(snapshot()); } catch (_) { /* isolate consumers */ } }); }
        function failure(result) {
            error = result.error || result.reason || 'write-failed';
            if (result.reason === 'stale') {
                saveStatus = 'stale'; conflict = schema.copy({ currentRevision: result.currentRevision, currentData: result.currentData });
                // A newer schema discovered through CAS must not be overwritten on retry either.
                var incoming = schema.decode(result.currentData);
                if (incoming.forwardIncompatible) { forwardIncompatible = true; readOnly = true; }
            } else if (result.reason === 'forward-incompatible') {
                saveStatus = 'forward-incompatible'; forwardIncompatible = readOnly = true;
            } else saveStatus = 'error';
            publish(); return result;
        }
        function save() {
            if (disposed) return Promise.resolve({ ok: false, reason: 'disposed' });
            if (!loaded) return Promise.resolve({ ok: false, reason: 'not-loaded' });
            if (pendingSave) return pendingSave;
            if (pendingLoad) return Promise.resolve({ ok: false, reason: 'loading' });
            if (incoming) return Promise.resolve({ ok: false, reason: 'external-pending' });
            if (readOnly) return Promise.resolve(failure({ ok: false, reason: forwardIncompatible ? 'forward-incompatible' : 'read-only' }));
            if (!schema.normalize(draft)) return Promise.resolve(failure({ ok: false, reason: 'invalid-data' }));
            if (!dirty()) return Promise.resolve({ ok: true, data: schema.copy(saved), revision: baseRevision, unchanged: true });
            var fixed = schema.copy(draft), revision = baseRevision, token = generation;
            saveStatus = 'saving'; error = null;
            pendingSave = Promise.resolve().then(function () { return disposed || token !== generation ? { ok: false, reason: 'disposed' } : store.save(fixed, { baseRevision: revision }); }).then(function (result) {
                if (disposed || token !== generation) return { ok: false, reason: 'disposed', writeResult: result };
                if (!result || !result.ok) return failure(result || { ok: false, reason: 'write-failed' });
                var decoded = schema.decode(result.data);
                if (!decoded.ok || decoded.migrated || typeof result.revision !== 'string' || !result.revision || result.revision === revision ||
                    !equal(schema.normalize(result.data), schema.normalize(fixed)) ||
                    Object.keys(fixed).some(function (key) { return !Object.hasOwn(result.data, key) || !equal(result.data[key], fixed[key]); }))
                    return failure({ ok: false, reason: 'invalid-save-result' });
                // Saved=A while latest draft=B: advance only the saved base, retaining B as dirty.
                var changedDuringSave = !equal(draft, fixed);
                saved = schema.copy(decoded.data); rawEnvelope = schema.copy(result.data); baseRevision = result.revision;
                if (!changedDuringSave) draft = schema.copy(decoded.data);
                if (incoming?.revision === result.revision) incoming = null;
                saveStatus = incoming ? 'external-pending' : 'ready'; error = null; conflict = incoming && schema.copy(incoming); publish();
                return result;
            }).catch(function (e) {
                return disposed || token !== generation ? { ok: false, reason: 'disposed' } : failure({ ok: false, reason: 'write-failed', error: String(e.message || e) });
            }).finally(function () { pendingSave = null; });
            publish(); return pendingSave;
        }
        function autoSave() {
            var operation = save();
            // Serialize subsequent BPM changes. Retry only a successful write with a newer draft;
            // errors/stale wait for a new explicit user change or save(), never a retry loop.
            operation.then(function (result) { if (!disposed && !incoming && result.ok && dirty()) autoSave(); });
        }
        function load(request) {
            if (disposed) return Promise.resolve({ ok: false, reason: 'disposed' });
            if (pendingLoad) return pendingLoad;
            if (pendingSave || (dirty() && !request?.discard)) return Promise.resolve({ ok: false, reason: 'dirty' });
            var token = ++generation;
            saveStatus = 'loading'; error = null; publish();
            pendingLoad = Promise.resolve().then(function () { return store.load(); }).then(function (result) {
                if (disposed || token !== generation) return { ok: false, reason: 'disposed' };
                if (!result || !result.ok || (typeof result.revision !== 'string' || !result.revision)) throw new Error(result?.reason || 'read-failed');
                var decoded = schema.decode(result.data);
                loaded = true; baseRevision = result.revision; rawEnvelope = schema.copy(result.data);
                readOnly = !decoded.ok; forwardIncompatible = !!decoded.forwardIncompatible; conflict = null; incoming = null;
                draft = decoded.ok ? schema.copy(decoded.data) : schema.defaults();
                // Keep the pre-migration envelope as saved base until its CAS migration succeeds.
                saved = decoded.ok ? schema.copy(result.data) : schema.defaults();
                saveStatus = decoded.ok ? 'ready' : forwardIncompatible ? 'forward-incompatible' : 'error';
                error = decoded.ok ? null : decoded.reason;
                publish(); return Object.assign({}, result, { migrated: !!decoded.migrated, ok: decoded.ok, reason: decoded.reason });
            }).catch(function (e) {
                if (disposed || token !== generation) return { ok: false, reason: 'disposed' };
                if (!loaded) saved = schema.copy(draft);
                loaded = true; readOnly = true; saveStatus = 'error'; error = String(e.message || e); publish();
                return { ok: false, reason: 'read-failed' };
            }).finally(function () { pendingLoad = null; });
            // Only the explicitly memory-only M2 fixture may persist its projection on load.
            // Port-backed and unknown facades never write during load.
            return pendingLoad.then(async function (result) {
                if (result.ok && result.migrated && !disposed && store.capabilities?.memoryOnly === true && store.capabilities?.persistProjectionOnLoad === true) {
                    var migrated = await save();
                    return Object.assign({}, result, { migrationSave: migrated });
                }
                return result;
            });
        }
        function receiveExternalUpdate(value) {
            if (disposed || !value || typeof value.revision !== 'string') return { ok: false, reason: 'invalid-update' };
            if (value.revision === baseRevision) return { ok: true, unchanged: true };
            const decoded = schema.decode(value.data);
            incoming = schema.copy(value); conflict = schema.copy(value);
            if (decoded.forwardIncompatible) { readOnly = forwardIncompatible = true; saveStatus = 'forward-incompatible'; publish(); return { ok: false, reason: 'forward-incompatible' }; }
            if (!decoded.ok) { saveStatus = 'conflict'; publish(); return { ok: false, reason: 'invalid-update' }; }
            if (dirty() || pendingSave || pendingLoad || inputPending) {
                saveStatus = 'external-pending'; publish(); return { ok: true, pending: true };
            }
            saved = schema.copy(value.data); rawEnvelope = schema.copy(value.data); draft = schema.copy(decoded.data);
            baseRevision = value.revision; incoming = conflict = null; saveStatus = 'ready'; error = null; publish();
            return { ok: true, adopted: true };
        }
        async function reapplyOnLatest() {
            if (disposed || pendingSave || pendingLoad || inputPending) return { ok: false, reason: 'busy' };
            const token = generation, oldBase = schema.copy(saved), local = schema.copy(draft);
            const latest = await store.load();
            if (disposed || token !== generation || !equal(local, draft)) return { ok: false, reason: 'stale-operation' };
            const decoded = latest?.ok && schema.decode(latest.data);
            if (!decoded?.ok) { if (latest?.ok) receiveExternalUpdate(latest); return { ok: false, reason: 'invalid-latest' }; }
            const base = schema.decode(oldBase).data || oldBase;
            const changed = Object.keys(local).filter(key => !equal(local[key], base?.[key]));
            const remote = Object.keys(decoded.data).filter(key => !equal(decoded.data[key], base?.[key]));
            const dependent = ['meter', 'rhythm', 'accents'];
            if (changed.some(key => remote.includes(key) && !equal(local[key], decoded.data[key])) ||
                (changed.some(key => dependent.includes(key)) && remote.some(key => dependent.includes(key)))) {
                incoming = schema.copy(latest); conflict = schema.copy(latest); saveStatus = 'conflict'; publish();
                return { ok: false, reason: 'field-conflict' };
            }
            const merged = schema.copy(decoded.data);
            for (const key of changed) Object.defineProperty(merged, key, { value: schema.copy(local[key]), enumerable: true, writable: true, configurable: true });
            if (!schema.normalize(merged)) return { ok: false, reason: 'invalid-reapply' };
            saved = schema.copy(latest.data); rawEnvelope = schema.copy(latest.data); baseRevision = latest.revision;
            draft = merged; incoming = conflict = null; readOnly = forwardIncompatible = false; saveStatus = 'ready'; error = null; publish();
            return { ok: true, needsSave: dirty() };
        }
        return Object.freeze({ load: load, save: save, snapshot: snapshot,
            receiveExternalUpdate,
            setInputPending(value) { inputPending = value === true; },
            inspectIncoming() { return incoming && schema.copy(incoming); },
            keepLocal() { return { ok: true, pending: !!incoming }; },
            adoptLatest() { return inputPending ? Promise.resolve({ ok: false, reason: 'input-pending' }) : load({ discard: true }); },
            reapplyOnLatest,
            setBpm: function (value) {
                if (disposed || !loaded || pendingLoad) return false;
                var bpm = schema.clampInteger(value, schema.limits.bpmMin, schema.limits.bpmMax, draft.bpm);
                draft = { ...draft, bpm: bpm }; publish();
                if (loaded && !pendingLoad && dirty()) autoSave();
                return bpm;
            },
            // Injected product-policy fixture only; never a credential/authorization decision.
            setAccessState: function (state) {
                if (disposed) return;
                capabilities = { metronomeAdvanced: state?.metronomeAdvanced === true }; publish();
            },
            subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
            dispose: function () { if (!disposed) { disposed = true; generation++; listeners.clear(); } }
        });
    }
    return Object.freeze({ createController: createController });
});
