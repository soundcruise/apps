/* Port is the URL and icon catalog. The target app owns its Pro gate and data. */
import { resolveCruiseAppHref, CRUISE_APP_ICONS } from '../../../../cruise-port/cruise-app-links.js?v=0.69.0';

for (const link of document.querySelectorAll('[data-studio-cruise-app][data-studio-edition]')) {
    const id = link.dataset.studioCruiseApp;
    const edition = link.dataset.studioEdition;
    if (edition !== 'pro') continue;
    const href = resolveCruiseAppHref(id, edition);
    const icon = CRUISE_APP_ICONS[id]?.[edition];
    if (!href || !icon) continue;
    link.href = '#app_'+id;
    link.removeAttribute('target');
    link.addEventListener('click',event=>{event.preventDefault();window.CruiseStudio.shellHost.navigate('app_'+id);});
    link.rel = 'noopener noreferrer';
    const image = link.querySelector('img');
    if (image) image.src = icon;
}
