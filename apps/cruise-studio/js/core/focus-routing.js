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
    function createFocusRouting(doc, getWorkspace, getFallback) {
        function valid(element) {
            if (!canFocus(element)) return false;
            var workspace = element.closest('.screen');
            return !workspace || workspace === getWorkspace();
        }
        function restore(element) {
            var target = valid(element) ? element : getFallback();
            if (!valid(target)) target = getWorkspace();
            if (valid(target)) target.focus({ preventScroll: true });
            return doc.activeElement === target;
        }
        return Object.freeze({ valid: valid, restore: restore });
    }
    return Object.freeze({ canFocus: canFocus, createFocusRouting: createFocusRouting });
});
