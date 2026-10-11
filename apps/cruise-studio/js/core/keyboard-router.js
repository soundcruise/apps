/* Capture is reserved for the modal. Ordinary commands run after local controls. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.keyboard = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';
    var TEXT = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
    function isTextControl(element) { return !!(element && element.closest && element.closest(TEXT)); }
    function normalize(event) {
        return Object.freeze({ key: event.key === 'Esc' ? 'Escape' : event.key, code: event.code || '',
            primary: !!(event.metaKey || event.ctrlKey), meta: !!event.metaKey, ctrl: !!event.ctrlKey, alt: !!event.altKey, shift: !!event.shiftKey });
    }
    function createIMEGuard(schedule, cancel) {
        var composing = false, justComposed = false, timer = null;
        return {
            start: function () { composing = true; justComposed = false; if (timer !== null) cancel(timer); timer = null; },
            end: function () { composing = false; justComposed = true; if (timer !== null) cancel(timer); timer = schedule(function () { justComposed = false; timer = null; }, 0); },
            blocked: function (event) { return !!(event.isComposing || event.keyCode === 229 || composing || justComposed); },
            dispose: function () { if (timer !== null) cancel(timer); timer = null; composing = justComposed = false; }
        };
    }
    function consume(event) { event.preventDefault(); event.stopPropagation(); }
    function createKeyboardRouter(options) {
        var doc = options.document, attached = false, bindings = [], escapes = [], handled = new WeakSet();
        var ime = options.ime;
        function context() { return options.getContext(); }
        function eligible(entry, ctx) { return !entry.workspaceId || entry.workspaceId === ctx.activeWorkspaceId; }
        function runEscape(event, localOwner) {
            if (event.defaultPrevented || handled.has(event) || normalize(event).key !== 'Escape') return false;
            var ctx = context();
            if (ctx.activeModal) return false;
            // Only an explicit local editor adapter may delegate its own Escape from text.
            if (!localOwner && (isTextControl(event.target) || isTextControl(ctx.focusedElement))) return false;
            if (ime.blocked(event)) return false;
            for (var entry of escapes) {
                if (eligible(entry, ctx) && entry.handle(event, ctx)) {
                    handled.add(event); consume(event); return true;
                }
            }
            return false;
        }
        function bubble(event) {
            if (event.defaultPrevented || handled.has(event)) return;
            var ctx = context();
            if (ctx.activeModal || (event.target.closest && event.target.closest('[hidden], [inert]'))) return;
            var path = event.composedPath ? event.composedPath() : [event.target];
            if (path.some(isTextControl) || isTextControl(ctx.focusedElement)) return;
            if (ime.blocked(event)) return;
            if (normalize(event).key === 'Escape') { runEscape(event, false); return; }
            var shortcut = normalize(event);
            for (var entry of bindings) {
                if (eligible(entry, ctx) && entry.matches(shortcut) && options.commands.execute(entry.commandId, event).consumed) {
                    handled.add(event); consume(event); return;
                }
            }
        }
        function capture(event) { if (options.modal) options.modal.capture(event); }
        function start() { ime.start(); }
        function end() { ime.end(); }
        function add(list, entry, order) {
            var copy = Object.assign({}, entry); list.push(copy); list.sort(function (a, b) { return order.indexOf(a.scope) - order.indexOf(b.scope); });
            return function () { var i = list.indexOf(copy); if (i >= 0) list.splice(i, 1); };
        }
        return Object.freeze({
            bind: function (entry) {
                if (!['musical', 'workspace', 'shell'].includes(entry.scope) || (entry.scope === 'workspace' && !entry.workspaceId)) throw new TypeError('Invalid shortcut scope');
                return add(bindings, entry, ['musical', 'workspace', 'shell']);
            },
            registerEscape: function (entry) {
                if (!['transient', 'pane', 'workspace', 'shell'].includes(entry.scope)) throw new TypeError('Invalid Escape scope');
                return add(escapes, entry, ['transient', 'pane', 'workspace', 'shell']);
            },
            // An adapter must verify that event.target belongs to its local UI before delegation.
            localEscape: function (event) { return runEscape(event, true); },
            localCommand: function (event, commandId, workspaceId) {
                if (event.defaultPrevented || handled.has(event)) return false;
                var ctx = context();
                if (ctx.activeModal || ctx.activeWorkspaceId !== workspaceId ||
                    (event.target.closest && event.target.closest('[hidden], [inert]')) || ime.blocked(event)) return false;
                if (!options.commands.execute(commandId, event).consumed) return false;
                handled.add(event); consume(event); return true;
            },
            bubble: bubble,
            attach: function () {
                if (attached) return; attached = true;
                doc.addEventListener('compositionstart', start, true); doc.addEventListener('compositionend', end, true);
                doc.addEventListener('keydown', capture, true); doc.addEventListener('keydown', bubble);
            },
            dispose: function () {
                doc.removeEventListener('compositionstart', start, true); doc.removeEventListener('compositionend', end, true);
                doc.removeEventListener('keydown', capture, true); doc.removeEventListener('keydown', bubble);
                attached = false; bindings.length = escapes.length = 0; ime.dispose();
            }
        });
    }
    return Object.freeze({ isTextControl: isTextControl, normalize: normalize, createIMEGuard: createIMEGuard, createKeyboardRouter: createKeyboardRouter });
});
