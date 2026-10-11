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
        var listeners = new Set();
        function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
        function effective() { return schema.effective(draft, capabilities); }
        function dirty() { return loaded && !equal(draft, saved); }
        function snapshot() {
            return Object.freeze({ loaded: loaded, rawEnvelope: schema.copy(rawEnvelope), rawSettings: schema.copy(draft),
                effectiveSettings: effective(), dirty: dirty(), baseRevision: baseRevision, saveStatus: saveStatus,
                error: error, forwardIncompatible: forwardIncompatible, readOnly: readOnly,
                conflict: conflict && schema.copy(conflict), disposed: disposed });
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
                saveStatus = 'ready'; error = null; conflict = null; publish();
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
            operation.then(function (result) { if (!disposed && result.ok && dirty()) autoSave(); });
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
                readOnly = !decoded.ok; forwardIncompatible = !!decoded.forwardIncompatible; conflict = null;
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
            // Port writes a successful migration on load. M2 does so through the same CAS facade.
            return pendingLoad.then(async function (result) {
                if (result.ok && result.migrated && !disposed) {
                    var migrated = await save();
                    return Object.assign({}, result, { migrationSave: migrated });
                }
                return result;
            });
        }
        return Object.freeze({ load: load, save: save, snapshot: snapshot,
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
