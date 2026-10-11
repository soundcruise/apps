/* Single active native dialog. Nonmodal panes and Loupe never enter this manager. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.modals = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';
    function createModalManager(options) {
        var doc = options.document, active = null;
        function consume(event) { event.preventDefault(); event.stopImmediatePropagation(); }
        function close(reason) {
            if (!active) return false;
            var old = active; active = null;
            old.element.removeEventListener('cancel', old.cancel);
            old.element.removeEventListener('close', old.closed);
            old.element.close(); old.element.remove();
            options.background.inert = old.backgroundInert;
            if (old.backgroundAria === null) options.background.removeAttribute('aria-hidden');
            else options.background.setAttribute('aria-hidden', old.backgroundAria);
            options.focus.restore(old.trigger);
            if (old.onClose) old.onClose(reason || 'close');
            return true;
        }
        function focusables() {
            return Array.from(active.element.querySelectorAll('button, input, select, textarea, a[href], [tabindex], [contenteditable]'))
                .filter(function (element) { return element.tabIndex >= 0 && options.canFocus(element); });
        }
        return Object.freeze({
            getActive: function () { return active ? active.element : null; },
            open: function (config) {
                if (active) throw new Error('A modal is already active');
                if (!config.title || !config.content || config.content.isConnected) throw new TypeError('Modal requires a name and detached content');
                var dialog = doc.createElement('dialog');
                dialog.className = 'studio-modal'; dialog.setAttribute('role', 'dialog');
                dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', config.title); dialog.tabIndex = -1;
                dialog.appendChild(config.content);
                var record = { element: dialog, trigger: doc.activeElement, onClose: config.onClose,
                    backgroundInert: options.background.inert, backgroundAria: options.background.getAttribute('aria-hidden') };
                record.cancel = function (event) { event.preventDefault(); if (!options.ime.blocked(event)) close('escape'); };
                record.closed = function () { if (active === record) close('native-close'); };
                dialog.addEventListener('cancel', record.cancel); dialog.addEventListener('close', record.closed);
                doc.body.appendChild(dialog); active = record;
                try { dialog.showModal(); } catch (error) { active = null; dialog.remove(); throw error; }
                var initial = config.initialFocus;
                if (!initial || !dialog.contains(initial) || !options.canFocus(initial)) initial = focusables()[0] || dialog;
                initial.focus({ preventScroll: true });
                options.background.inert = true; options.background.setAttribute('aria-hidden', 'true');
                return dialog;
            },
            close: close,
            capture: function (event) {
                if (!active || event.defaultPrevented) return;
                // Browser-owned chords (including Ctrl+Tab and developer tools) stay native.
                if (event.metaKey || event.ctrlKey || event.altKey || /^F\d+$/.test(event.key)) {
                    if (!active.element.contains(event.target)) event.stopImmediatePropagation();
                    return;
                }
                if (!active.element.contains(event.target)) {
                    consume(event);
                    if (event.key === 'Escape' && !options.ime.blocked(event)) close('escape');
                    else active.element.focus();
                    return;
                }
                if (options.ime.blocked(event)) {
                    if (event.key === 'Escape' || event.key === 'Enter') consume(event);
                    return;
                }
                if (event.key === 'Escape') { consume(event); close('escape'); return; }
                if (event.key !== 'Tab') return;
                var items = focusables(), current = doc.activeElement, index = items.indexOf(current);
                if (!items.length) { consume(event); active.element.focus(); }
                else if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === items.length - 1)) {
                    consume(event); items[event.shiftKey ? items.length - 1 : 0].focus();
                }
            },
            dispose: function () { close('dispose'); }
        });
    }
    return Object.freeze({ createModalManager: createModalManager });
});
