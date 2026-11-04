/* Active Document reader. Unlike capture(), never adopts external snapshots or changes readiness. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.structureConversion = factory();
})(globalThis, function () {
    'use strict';
    function createService(options) {
        var owner = options.owner, issued = new WeakMap();
        function read(includeProject, retaining) {
            var s = owner.getSession(), context = options.getContext();
            if (!s || s.destroyed || s.domain !== 'structure') return options.model.failure('no-document');
            if (!retaining && (context.blocked || s.inputPending)) return options.model.failure('input-or-modal-pending');
            if (s.commitInFlight) return options.model.failure('commit-pending');
            if (s.externalUpdatePending || s.conflict) return options.model.failure('external-conflict');
            if (!(options.converter.supportedSchemas || [1]).includes(s.draft.schemaVersion)) return options.model.failure('unsupported-schema');
            // Schema 2 validates the complete Project (including backup) in prepare(),
            // then bounds its musical DTO in convert(). isCurrent only checks identity/revision.
            if (s.draft.schemaVersion === 1 && !options.model.budget(s.draft)) return options.model.failure('memory-budget');
            var saved = options.repository.readRevision(s.target);
            if (!saved.ok) return options.model.failure('source-unavailable');
            if (!saved.exists && s.baseRevision !== null) return options.model.failure('deleted-project');
            if (saved.revision !== s.baseRevision) return options.model.failure('external-revision');
            var token = owner.ticket();
            if (token.sessionId !== s.sessionId || token.projectId !== s.draft.projectId) return options.model.failure('invalid-source');
            return { ok: true, source: 'working', ...(includeProject ? { project: s.workingSnapshot() } : {}),
                sessionId: s.sessionId, version: s.snapshotVersion, baseRevision: s.baseRevision, token: token,
                workspaceId: context.workspaceId, workspaceGeneration: context.generation };
        }
        function matches(result, retaining) {
            if (!result?.ok || !issued.has(result)) return false;
            var now = read(false, retaining); if (!now.ok) return false;
            var src = result.model.source;
            return src.sessionId === now.sessionId && src.projectId === now.token.projectId &&
                (retaining || src.snapshotVersion === now.version) && issued.get(result) === now.baseRevision &&
                src.generation === now.token.generation && src.workspaceId === now.workspaceId &&
                src.workspaceGeneration === now.workspaceGeneration;
        }
        return Object.freeze({
            convert: function () {
                var frame;try { frame = read(true); } catch (_) { return options.model.failure('invalid-project'); }
                if (!frame.ok) return frame;
                var revision = frame.baseRevision;
                if (options.converter.prepare) {
                    try { frame.project = options.converter.prepare(frame.project); }
                    catch (error) { return options.model.failure('invalid-project', error.message); }
                }
                var result = options.converter.convert(frame);
                if (result.ok) issued.set(result, revision);
                return result;
            },
            isCurrent: function (result) { return matches(result, false); },
            // Pending-input display only: never authorizes adoption of a stale result.
            canRetain: function (result) { return matches(result, true); }
        });
    }
    return Object.freeze({ createService: createService });
});
