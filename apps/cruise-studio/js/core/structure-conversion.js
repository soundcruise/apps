/* Active Document reader. Unlike capture(), never adopts external snapshots or changes readiness. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.structureConversion = factory();
})(globalThis, function () {
    'use strict';
    function createService(options) {
        var owner = options.owner, issued = new WeakSet();
        function read(includeProject) {
            var s = owner.getSession(), context = options.getContext();
            if (!s || s.destroyed || s.domain !== 'structure') return options.model.failure('no-document');
            if (context.blocked || s.inputPending) return options.model.failure('input-or-modal-pending');
            if (s.commitInFlight) return options.model.failure('commit-pending');
            if (s.externalUpdatePending || s.conflict) return options.model.failure('external-conflict');
            if (s.draft.schemaVersion !== 1) return options.model.failure('unsupported-schema');
            if (!options.model.budget(s.draft)) return options.model.failure('memory-budget');
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
        return Object.freeze({
            convert: function () {
                var frame = read(true); if (!frame.ok) return frame;
                var result = options.converter.convert(frame); if (result.ok) issued.add(result);
                return result;
            },
            isCurrent: function (result) {
                if (!result?.ok || !issued.has(result)) return false;
                var now = read(false); if (!now.ok) return false;
                var src = result.model.source;
                return src.sessionId === now.sessionId && src.projectId === now.token.projectId && src.snapshotVersion === now.version &&
                    src.baseRevision === now.baseRevision && src.generation === now.token.generation &&
                    src.workspaceId === now.workspaceId && src.workspaceGeneration === now.workspaceGeneration;
            }
        });
    }
    return Object.freeze({ createService: createService });
});
