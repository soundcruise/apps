/* Injected, settings-only memory facade. Never a Port dataset or Sync snapshot API. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.metronomeStore = factory();
})(globalThis, function () {
    'use strict';
    var nextStore = 0;
    function createMemoryStore(options) {
        var schema = options.schema, storeId = ++nextStore, sequence = 0;
        var data = schema.copy(Object.hasOwn(options, 'data') ? options.data : schema.defaults());
        var revision = 'metronome-memory:' + storeId + ':' + sequence, failure = null;
        function snapshot() { return { ok: true, data: schema.copy(data), revision: revision }; }
        return Object.freeze({
            capabilities: Object.freeze({ memoryOnly: true, persistProjectionOnLoad: true }),
            load: async function () {
                if (options.beforeLoad) await options.beforeLoad();
                return snapshot();
            },
            getRevision: function () { return revision; },
            save: async function (next, request) {
                // Capture caller data before any await; later caller edits cannot change this write.
                var candidate;
                try { candidate = schema.copy(next); } catch (_) { return { ok: false, reason: 'invalid-data' }; }
                var baseRevision = request?.baseRevision;
                if (options.beforeSave) await options.beforeSave();
                // No await between the CAS and mutation. Two writers cannot both win this revision.
                if (revision !== baseRevision) return { ok: false, reason: 'stale', currentRevision: revision, currentData: schema.copy(data) };
                var current = schema.decode(data), incoming = schema.decode(candidate);
                if (!current.ok) return { ok: false, reason: current.forwardIncompatible ? 'forward-incompatible' : 'invalid-stored-data' };
                if (!incoming.ok || incoming.migrated || candidate.version !== schema.version)
                    return { ok: false, reason: incoming.forwardIncompatible ? 'forward-incompatible' : 'invalid-data' };
                if (failure) { var reason = failure; failure = null; return { ok: false, reason: reason }; }
                // Unknown current fields survive even a caller that submits only known settings.
                data = { ...current.data, ...incoming.data };
                revision = 'metronome-memory:' + storeId + ':' + (++sequence);
                return snapshot();
            },
            // Explicit memory-fixture hook. No global device/storage failure flags.
            failNext: function (reason) { failure = reason || 'write-failed'; }
        });
    }
    return Object.freeze({ createMemoryStore: createMemoryStore });
});
