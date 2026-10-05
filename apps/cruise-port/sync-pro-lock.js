import { getCapabilities } from './cruise-port-capabilities.js?v=1.19.1';

export const SYNC_OPERATION_SELECTOR = [
    '#sync-center-port-connect-open', '#sync-center-port-connect-confirm',
    '#sync-center-port-conflicts-open', '#sync-center-port-legacy-retry',
    '[data-sync-app-action]', '[data-sync-app-add-environment]',
    '[data-sync-port-add-environment]', '[data-sync-app-delete]'
].join(',');

// Information, target lists, help and Account security/lifecycle remain usable.
// Capture denies activation before existing handlers; operation APIs separately
// enforce the same live capability, including non-UI calls.
export function bindSyncProLock(root, canSync = () => getCapabilities().cloudSyncOperations) {
    const doc = root.ownerDocument;
    const note = doc.createElement('p');
    note.className = 'sync-pro-note';
    note.innerHTML = '<span>複数端末でデータを同期し、同じ状態で使える機能はPro版で利用できます。</span> <a href="#pro-access">Pro版について</a>';
    root.querySelector('.sync-center-heading').after(note);
    const message = doc.createElement('p');
    message.className = 'sync-pro-feedback';
    message.setAttribute('role', 'status');
    message.hidden = true;
    note.after(message);
    const original = new WeakMap();
    function refresh() {
        const locked = !canSync();
        note.hidden = !locked;
        if (!locked) message.hidden = true;
        root.querySelectorAll(SYNC_OPERATION_SELECTOR).forEach(button => {
            if (locked) {
                if (!original.has(button)) original.set(button, {disabled:button.disabled,aria:button.getAttribute('aria-disabled')});
                button.disabled = false;
                button.setAttribute('aria-disabled', 'true');
                button.classList.add('sync-operation-locked');
                if (!button.querySelector('.sync-operation-pro')) {
                    const badge = doc.createElement('span');
                    badge.className = 'sync-operation-pro';
                    badge.textContent = 'Pro';
                    button.append(badge);
                }
            } else if (original.has(button)) {
                const saved = original.get(button);
                button.disabled = saved.disabled;
                if (saved.aria === null) button.removeAttribute('aria-disabled');
                else button.setAttribute('aria-disabled', saved.aria);
                button.classList.remove('sync-operation-locked');
                button.querySelector('.sync-operation-pro')?.remove();
                original.delete(button);
            }
        });
    }
    root.addEventListener('click', event => {
        if (canSync() || !event.target.closest?.(SYNC_OPERATION_SELECTOR)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        message.textContent = 'クラウド同期はPro版で利用できます。';
        message.hidden = false;
    }, true);
    const Observer = doc.defaultView.MutationObserver;
    const observer = new Observer(refresh);
    observer.observe(root, {childList:true,subtree:true});
    refresh();
    return Object.freeze({refresh});
}
