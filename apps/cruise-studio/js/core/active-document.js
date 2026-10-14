/* Studio identity is the registry's active Structure session; content remains session-owned. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.activeDocument = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';
    function createOwner(options) {
        var registry = options.registry, generation = 0, bound = null, listeners = new Set();
        function session() {
            var value = registry.getActiveSession();
            return value && value.domain === 'structure' && !value.destroyed ? value : null;
        }
        function ticket() {
            var s = session(), id = s ? s.sessionId : null;
            if (bound !== id) { bound = id; generation++; }
            return Object.freeze({ generation: generation, sessionId: id, projectId: s ? s.target.projectId : null });
        }
        function isSelected(token) {
            var now = ticket();
            return !!token && token.generation === now.generation && token.sessionId === now.sessionId && token.projectId === now.projectId;
        }
        function publish() { ticket(); listeners.forEach(function (fn) { try { fn(); } catch (_) { /* consumer isolation */ } }); }
        function bind(value) {
            if (session() !== value) throw Error('Active document must be registry-owned');
            publish();
        }
        function capture() {
            var s = session(), token = ticket();
            if (!s) return { ok: false, code: 'no-document', error: '対象の曲がありません。' };
            if (s.inputPending) return { ok: false, code: 'input-pending', error: '入力の確定を待ってください。' };
            if (s.commitInFlight) return { ok: false, code: 'saving', error: '保存の完了を待ってください。' };
            var current = options.repository.read(s.target);
            if (!current.ok) return { ok: false, code: 'unavailable', error: current.error };
            // Even an unobserved future/invalid/deleted record must not permit cached output.
            if (current.revision !== s.baseRevision) s.applyExternalSnapshot(Object.assign({}, current, {
                target: s.target, deleted: !current.exists, source: 'repository'
            }));
            if (s.externalUpdatePending || s.conflict) return { ok: false, code: 'conflict', error: '保存済みの曲が更新または削除されています。Structureで確認してください。' };
            if (!current.exists && s.baseRevision !== null) return { ok: false, code: 'deleted', error: '対象の曲が削除されています。' };
            var project = s.workingSnapshot(), check;
            try { check = options.validate(project); } catch (_) { check = { ok: false }; }
            if (!check.ok || project.projectId !== token.projectId) return { ok: false, code: 'invalid', error: '対象の曲の形式を確認できません。' };
            return Object.freeze({ ok: true, project: project, source: 'working', dirty: s.dirty,
                isNew: s.baseRevision === null, version: s.snapshotVersion, baseRevision: s.baseRevision,
                sessionId: s.sessionId, token: token });
        }
        var off = registry.subscribe(function (s) { if (s === session() || s.sessionId === bound) publish(); });
        return Object.freeze({
            getSession: session, getIdentity: function () { var s = session(); return s ? s.target : null; },
            ticket: ticket, isSelected: isSelected, bind: bind, capture: capture,
            captureOutput: function (settings, generate) {
                var frame = capture();
                if (!frame.ok) return frame;
                // Output is synchronous today. Future async consumers must keep this frame,
                // then use isCurrent before applying a completion to the current UI.
                var fixedSettings = options.snapshot(settings);
                return Object.freeze({ ok: true, source: frame, arrangement: options.snapshot(generate(frame.project, fixedSettings)) });
            },
            isCurrent: function (frame) {
                var s = session();
                if (!s || !isSelected(frame && frame.token) || s.snapshotVersion !== frame.version || s.inputPending || s.externalUpdatePending || s.conflict) return false;
                var current = options.repository.read(s.target);
                return current.ok && current.revision === frame.baseRevision;
            },
            select: function (id) {
                var s = session();
                if (typeof id !== 'string' || !id || (s && s.inputPending) || (options.canSelect && !options.canSelect())) return false;
                if (s && s.target.projectId === id) return true;
                return options.openProject(id) === true;
            },
            subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
            dispose: function () { off(); listeners.clear(); }
        });
    }
    return Object.freeze({ createOwner: createOwner });
});
