/* Product commands delegate to the session Core; no history or document owner here. */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else (root.CruiseStudio = root.CruiseStudio || {}).domainHistoryCommands = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    function create(options) {
        function allowed(direction, session, context) {
            if (!['undo', 'redo'].includes(direction) || !session || session !== options.getSession() ||
                context.activeWorkspaceId !== 'sheetCruise' || context.activeModal || context.editingSession !== session ||
                !context.activeDocument || context.activeDocument.projectId !== session.target.projectId ||
                session.domain !== 'structure' || session.destroyed || session.commitInFlight || session.inputPending ||
                (session.conflict && session.conflict.deleted) || options.isIMEBlocked() ||
                session.draft.projectId !== session.target.projectId || session.draft.schemaVersion !== session.baseSnapshot.schemaVersion ||
                (session.validation && !session.validation.ok) || session.getHistory().openGroup) return false;
            return direction === 'undo' ? session.canUndo() : session.canRedo();
        }
        function can(direction) { return allowed(direction, options.getSession(), options.getContext()); }
        function execute(direction, expected, event) {
            var session = options.getSession();
            if ((expected && expected !== session) || !allowed(direction, session, options.getContext())) return { consumed: false, code: 'unavailable' };
            if (options.settleInput) options.settleInput(session);
            session.finishTextGroup();
            if (!allowed(direction, session, options.getContext())) return { consumed: false, code: 'unavailable' };
            var result = session[direction]();
            if (options.onResult) options.onResult(direction, result, session, event);
            return Object.assign({}, result, { consumed: !!result.ok });
        }
        function attach(commands, keyboard) {
            var off = [];
            ['undo', 'redo'].forEach(function (direction) {
                off.push(commands.register({ id: 'studio.' + direction,
                    target: function (context) { return context.editingSession; },
                    canExecute: function (context) { return allowed(direction, context.target, context); },
                    execute: function (context, event) { return execute(direction, context.target, event); } }));
                off.push(keyboard.bind({ scope: 'workspace', workspaceId: 'sheetCruise', commandId: 'studio.' + direction,
                    matches: function (key) { return key.primary && !key.alt && key.shift === (direction === 'redo') && key.key.toLowerCase() === 'z'; } }));
            });
            return function () { off.forEach(function (dispose) { dispose(); }); };
        }
        return Object.freeze({ can: can, execute: execute, attach: attach });
    }
    return Object.freeze({ create: create });
}));
