/* Test-only dependency injection. Excluded from both release packaging paths. */
if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1' || location.port !== '18874' ||
    !document.querySelector('meta[name="local-ui-fixture"]') || !document.querySelector('[data-local-ui-banner]')) {
    throw Error('Local UI fixture refused outside its dedicated origin');
}
const C = window.CruiseStudio;
C.entryAuth = Object.freeze({isAuthorized: () => true, check: async () => true,
    read: () => ({phase: 'ready', accountId: null})});
// Keep native Account, Sync and embedded application surfaces out of this fixture.
for (const button of document.querySelectorAll('button[data-workspace],button[data-home-workspace],[data-open-tool],#home-cruise-sync,[data-open-calendar]')) {
    const id = button.dataset.workspace || button.dataset.homeWorkspace;
    if (!['home', 'sheetCruise', 'preDtm'].includes(id)) button.disabled = true;
}
document.getElementById('studio-shell').inert = false;
document.documentElement.dataset.studioEntry = 'ready';

// Local integration of B's requestLeave contract. Production Shell remains A-owned.
let replayingNavigation = false;
document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (replayingNavigation || !button || button.disabled || !C.sheetCruise.requestLeave) return;
    if (!button.matches('[data-workspace],[data-home-workspace],.workspace-back,.workspace-home')) return;
    if (button.dataset.workspace === C.shellHost.getActiveWorkspace()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    C.sheetCruise.requestLeave(() => {
        replayingNavigation = true;
        try { button.click(); } finally { replayingNavigation = false; }
    });
}, true);
