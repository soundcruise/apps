/* Audio resources only. No musical clock, policy, storage or project ownership. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.audioCoordinator = factory();
})(globalThis, function () {
    'use strict';
    function createCoordinator() {
        var sessions = new Map(), resources = new Map(), contextOwners = new WeakMap();
        var nextGeneration = 0, stopping = 0, stopGeneration = 0;
        function conflicts(resourceType) {
            return Array.from(resources.values()).filter(function (lease) {
                return lease.resourceType === resourceType ||
                    (resourceType === 'microphone/session' && lease.resourceType === 'audio-output/session') ||
                    (resourceType === 'audio-output/session' && lease.resourceType === 'microphone/session');
            });
        }
        function current(handle) { return !!handle && sessions.get(handle.sessionId)?.handle === handle; }
        function record(handle) { if (!current(handle)) throw new Error('Stale or disposed audio session'); return sessions.get(handle.sessionId); }
        function release(handle, lease) {
            if (!current(handle)) return false;
            var s = record(handle);
            if (!lease || s.lease !== lease || resources.get(lease.resourceType) !== lease) return false;
            resources.delete(lease.resourceType); s.lease = null; s.status = 'idle'; return true;
        }
        function invalidate(s) {
            s.generation = ++nextGeneration; s.status = 'stopping';
        }
        async function cleanup(handle, reason) {
            if (!current(handle)) return { ok: true };
            var s = record(handle);
            if (s.cleanupPromise) return s.cleanupPromise;
            var oldLease = s.lease;
            invalidate(s); // Revokes pending starts, retaining exclusivity until cleanup finishes.
            s.cleanupPromise = Promise.resolve().then(function () { return s.cleanup(reason); }).then(function () {
                return { ok: true };
            }, function (error) { return { ok: false, error: String(error.message || error) }; }).then(function (result) {
                if (current(handle)) { if (result.ok) release(handle, oldLease); s.status = result.ok ? 'idle' : 'failed'; s.cleanupPromise = null; }
                return result;
            });
            return s.cleanupPromise;
        }
        return Object.freeze({
            register: function (options) {
                if (!options.sessionId || !options.ownerFeatureId || typeof options.cleanup !== 'function') throw new TypeError('Invalid audio session');
                if (sessions.has(options.sessionId)) throw new Error('Duplicate audio session');
                var handle = Object.freeze({ sessionId: options.sessionId });
                sessions.set(options.sessionId, { handle: handle, ownerFeatureId: options.ownerFeatureId,
                    generation: ++nextGeneration, status: 'idle', lease: null, contexts: new Set(),
                    cleanup: options.cleanup, notify: options.notify || function () {}, cleanupPromise: null });
                return handle;
            },
            request: function (handle, resourceType) {
                var s = record(handle);
                if (!resourceType) throw new TypeError('Missing resource type');
                if (stopping || s.cleanupPromise) return null;
                if (s.lease) return s.lease.resourceType === resourceType ? s.lease : null;
                if (conflicts(resourceType).length) return null;
                var lease = Object.freeze({ sessionId: handle.sessionId, ownerFeatureId: s.ownerFeatureId,
                    resourceType: resourceType, generation: ++nextGeneration });
                s.generation = lease.generation; s.status = 'requesting'; s.lease = lease;
                resources.set(resourceType, lease); return lease;
            },
            grant: function (handle, lease) {
                if (!current(handle)) return false;
                var s = record(handle);
                if (s.lease !== lease || s.generation !== lease?.generation || resources.get(lease.resourceType) !== lease) return false;
                s.status = 'active'; return true;
            },
            isLeaseCurrent: function (handle, lease) { return current(handle) && !!lease && record(handle).lease === lease && record(handle).generation === lease.generation; },
            getConflictingLeases: function (resourceType) { return Object.freeze(conflicts(resourceType)); },
            getStopGeneration: function () { return stopGeneration; },
            release: release,
            ownContext: function (handle, lease, context) {
                var s = record(handle);
                if (s.lease !== lease || !lease || s.generation !== lease.generation || contextOwners.has(context)) throw new Error('Invalid context ownership');
                contextOwners.set(context, handle); s.contexts.add(context);
            },
            forgetContext: function (handle, context) {
                if (!current(handle) || contextOwners.get(context) !== handle) return false;
                record(handle).contexts.delete(context); contextOwners.delete(context); return true;
            },
            // A read-only timebase descriptor is the only borrower capability in v1.
            // Raw context/nodes are never exposed; graph borrowing requires a future scoped facade.
            borrowTimebase: function (owner, borrower, context) {
                record(borrower); record(owner);
                if (contextOwners.get(context) !== owner) throw new Error('Unknown context owner');
                return Object.freeze({ ownerSessionId: owner.sessionId, borrowerSessionId: borrower.sessionId,
                    get currentTime() { return current(owner) && current(borrower) && contextOwners.get(context) === owner ? context.currentTime : null; },
                    get state() { return current(owner) && current(borrower) && contextOwners.get(context) === owner ? context.state : 'unavailable'; }
                });
            },
            notify: function (handle, kind, detail) {
                if (!current(handle)) return false;
                if (!['interruption', 'devicechange', 'visibility'].includes(kind)) throw new TypeError('Unknown resource notification');
                try { record(handle).notify(Object.freeze({ kind: kind, detail: detail })); } catch (_) { /* isolate owners */ }
                return true;
            },
            cleanup: cleanup,
            stopAll: async function () {
                stopGeneration++;
                stopping++;
                try { return await Promise.all(Array.from(sessions.values(), function (s) { return cleanup(s.handle, 'global-stop'); })); }
                finally { stopping--; }
            },
            disposeSession: async function (handle) {
                var result = await cleanup(handle, 'dispose');
                if (result.ok && current(handle)) {
                    var s = record(handle); s.contexts.forEach(function (c) { contextOwners.delete(c); }); sessions.delete(handle.sessionId);
                }
                return result;
            },
            snapshot: function () {
                return Array.from(sessions.values(), function (s) { return Object.freeze({ sessionId: s.handle.sessionId,
                    ownerFeatureId: s.ownerFeatureId, status: s.status, generation: s.generation,
                    resourceType: s.lease?.resourceType || null, contextOwnership: 'owner', contextCount: s.contexts.size }); });
            }
        });
    }
    return Object.freeze({ createCoordinator: createCoordinator });
});
