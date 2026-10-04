import { proAccessMarkup } from './pro-access-content.js?v=1.18.3';
import { CRUISE_PORT_ROOT } from './cruise-port-edition.js?v=0.27.0';
const view = document.querySelector('main');
view.innerHTML = proAccessMarkup();
view.querySelector('[data-pro-access-back]').addEventListener('click', () => {
    let internalReferrer = false;
    try { internalReferrer = new URL(document.referrer).origin === location.origin; } catch (_) { /* direct entry */ }
    if (internalReferrer && history.length > 1) history.back();
    else location.assign(CRUISE_PORT_ROOT);
});
