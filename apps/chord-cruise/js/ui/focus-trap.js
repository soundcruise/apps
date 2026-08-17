(function () {
    'use strict';

    /* dialog / bottom sheet 専用の最小フォーカス管理。各UIの開閉責務は持たない。 */

    var FOCUSABLE_SELECTOR = [
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        'a[href]',
        '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    function hasHiddenAncestor(element) {
        var current = element;
        while (current) {
            var computed = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(current) : null;
            if (current.hidden === true || current.inert === true ||
                    (current.getAttribute && (current.getAttribute('hidden') !== null || current.getAttribute('aria-hidden') === 'true')) ||
                    (current.style && (current.style.display === 'none' || current.style.visibility === 'hidden')) ||
                    (computed && (computed.display === 'none' || computed.visibility === 'hidden'))) {
                return true;
            }
            current = current.parentElement;
        }
        return false;
    }

    function isFocusable(element) {
        if (!element || element.disabled === true || hasHiddenAncestor(element)) return false;
        return !(element.getAttribute && element.getAttribute('tabindex') === '-1');
    }

    function getFocusableElements(container) {
        if (!container || !container.querySelectorAll) return [];
        var elements = Array.prototype.filter.call(container.querySelectorAll(FOCUSABLE_SELECTOR), isFocusable);
        var radioGroups = {};
        elements.forEach(function (element) {
            if (String(element.type || '').toLowerCase() !== 'radio' || !element.name) return;
            if (!radioGroups[element.name]) radioGroups[element.name] = { first: element, checked: null };
            if (element.checked) radioGroups[element.name].checked = element;
        });
        return elements.filter(function (element) {
            if (String(element.type || '').toLowerCase() !== 'radio' || !element.name) return true;
            var group = radioGroups[element.name];
            return group.checked ? group.checked === element : group.first === element;
        });
    }

    function canRestoreFocus(element) {
        if (!isFocusable(element) || typeof element.focus !== 'function') return false;
        if (element.isConnected === false) return false;
        return true;
    }

    function focusContainer(container) {
        if (!container || typeof container.focus !== 'function') return false;
        if (container.getAttribute && container.getAttribute('tabindex') === null && container.setAttribute) {
            container.setAttribute('tabindex', '-1');
        }
        container.focus();
        return true;
    }

    function focusFirst(container) {
        var focusable = getFocusableElements(container);
        if (focusable.length && typeof focusable[0].focus === 'function') {
            focusable[0].focus();
            return true;
        }
        return focusContainer(container);
    }

    function trapFocus(container, event) {
        if (!event || event.key !== 'Tab') return false;
        var focusable = getFocusableElements(container);
        if (!focusable.length) {
            event.preventDefault();
            focusContainer(container);
            return true;
        }
        var active = document.activeElement;
        var index = focusable.indexOf(active);
        var target;
        if (event.shiftKey) {
            if (index > 0) return false;
            target = focusable[focusable.length - 1];
        } else {
            if (index !== -1 && index < focusable.length - 1) return false;
            target = focusable[0];
        }
        event.preventDefault();
        if (target && typeof target.focus === 'function') target.focus();
        return true;
    }

    function restoreFocus(opener, fallback) {
        if (canRestoreFocus(opener)) {
            opener.focus();
            return true;
        }
        if (fallback !== opener && canRestoreFocus(fallback)) {
            fallback.focus();
            return true;
        }
        return false;
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.ui = window.ChordCruise.ui || {};
    window.ChordCruise.ui.focusTrap = {
        getFocusableElements: getFocusableElements,
        trapFocus: trapFocus,
        focusFirst: focusFirst,
        focusContainer: focusContainer,
        restoreFocus: restoreFocus
    };
})();
