(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.focusRouting = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';
    function canFocus(element) {
        if (!element || !element.isConnected || typeof element.focus !== 'function' || element.matches(':disabled, [aria-disabled="true"]') || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
        var style = element.ownerDocument.defaultView.getComputedStyle(element);
        return style.visibility !== 'hidden' && style.visibility !== 'collapse' && element.getClientRects().length > 0;
    }
    function createFocusRouting(doc, getWorkspace, getFallback, resolveElement) {
        function valid(element) {
            if (!canFocus(element)) return false;
            var workspace = element.closest('.screen');
            return !workspace || workspace === getWorkspace();
        }
        function restore(element) {
            if (resolveElement) element = resolveElement(element);
            var target = valid(element) ? element : getFallback();
            if (!valid(target)) target = getWorkspace();
            if (valid(target)) target.focus({ preventScroll: true });
            return doc.activeElement === target;
        }
        return Object.freeze({ valid: valid, restore: restore });
    }
    // Opt-in adapter for views which replace list DOM. Identity never includes selection.
    function createWorkspaceFocus(options) {
        var doc = options.document, node = options.node, id = options.workspaceId, disposed = false;
        function mark(element, list, item, role) {
            element.dataset.focusList = list; element.dataset.focusItem = item; element.dataset.focusRole = role;
            return element;
        }
        function capture(element) {
            if (disposed || !element || !node.contains(element) || !element.dataset.focusRole) return null;
            return Object.freeze({ workspaceId: id, listId: element.dataset.focusList,
                itemId: element.dataset.focusItem, role: element.dataset.focusRole });
        }
        function owned() {
            var context = options.shell.getCommandContext();
            return !disposed && context.activeWorkspaceId === id && !context.activeModal && !node.closest('[hidden], [inert]');
        }
        function resolve(token) {
            if (!owned() || !token || token.workspaceId !== id) return null;
            var matches = Array.from(node.querySelectorAll('[data-focus-role]')).filter(function (e) {
                return e.dataset.focusList === token.listId && e.dataset.focusItem === token.itemId && e.dataset.focusRole === token.role && canFocus(e);
            });
            return matches.length === 1 ? matches[0] : null;
        }
        function fallback() { if (disposed) return null; var control = options.getFallback(); return canFocus(control) ? control : node; }
        function beforeRender() { var element = doc.activeElement; return { element: element, identity: owned() ? capture(element) : null }; }
        function afterRender(record) {
            if (!record.identity || !owned() || options.shell.keyboard?.isIMEBlocked({})) return false;
            // Restore only a focus this synchronous render removed. A newer owner wins.
            if (doc.activeElement !== record.element && (record.element.isConnected || doc.activeElement !== doc.body)) return false;
            var target = resolve(record.identity) || fallback();
            if (canFocus(target)) target.focus({ preventScroll: true });
            return doc.activeElement === target;
        }
        return Object.freeze({ mark: mark, capture: capture, resolve: resolve, fallback: fallback,
            beforeRender: beforeRender, afterRender: afterRender, dispose: function () { disposed = true; } });
    }
    return Object.freeze({ canFocus: canFocus, createFocusRouting: createFocusRouting, createWorkspaceFocus: createWorkspaceFocus });
});
