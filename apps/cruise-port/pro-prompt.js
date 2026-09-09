import { isProEdition, PRO_ENTRY_PATH } from './cruise-port-edition.js?v=0.26.0';

// Same modal interaction pattern as Port's completion/photo overlays:
// background inert, bounded keyboard focus and return focus on dismissal.
export function createProPrompt(documentObject = document, isPro = isProEdition) {
    const overlay = documentObject.createElement('div');
    overlay.className = 'port-pro-prompt';
    overlay.hidden = true;
    overlay.innerHTML = '<section class="view-panel" role="dialog" aria-modal="true" aria-labelledby="port-pro-prompt-title"><h2 id="port-pro-prompt-title">Cruise Port Pro</h2><p>Pro版では、さらに便利な機能を利用できます。</p><a class="action-button secondary-action" href="' + PRO_ENTRY_PATH + '">Pro版はこちら →</a><button class="action-button secondary-action" type="button">閉じる</button></section>';
    documentObject.body.append(overlay);
    const link = overlay.querySelector('a');
    const closeButton = overlay.querySelector('button');
    let returnFocus;
    const backgrounds = new Map();
    function close() {
        if (overlay.hidden) return;
        overlay.hidden = true;
        for (const [element, inert] of backgrounds) element.inert = inert;
        backgrounds.clear();
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }
    function open(message = 'Pro版では、さらに便利な機能を利用できます。') {
        if (isPro() || !overlay.hidden) return false;
        overlay.querySelector('p').textContent = message;
        returnFocus = documentObject.activeElement;
        for (const element of documentObject.body.children) {
            if (element === overlay) continue;
            backgrounds.set(element, element.inert);
            element.inert = true;
        }
        overlay.hidden = false;
        link.focus({ preventScroll: true });
        return true;
    }
    closeButton.addEventListener('click', close);
    overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key !== 'Tab') return;
        if (event.shiftKey && documentObject.activeElement === link) {
            event.preventDefault(); closeButton.focus();
        } else if (!event.shiftKey && documentObject.activeElement === closeButton) {
            event.preventDefault(); link.focus();
        }
    });
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    return { open, close };
}

export function applyProLinks(documentObject = document, pro = isProEdition()) {
    documentObject.querySelectorAll('[data-standard-pro-link]').forEach(section => {
        section.hidden = pro;
        section.querySelector('a').href = PRO_ENTRY_PATH;
    });
}
