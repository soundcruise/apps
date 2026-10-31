import { resolveLibraryLaunch, launchLibraryApp } from './launch.mjs?v=0.55.0';
import { filterLibraryItems } from '../../port-data/library-projection.mjs?v=0.55.0';
const CS = globalThis.CruiseStudio;
function initialize() {
    CS.libraryViews = CS.library.init({ document, shell: CS.shellHost, filterItems: filterLibraryItems, resolveLaunch: resolveLibraryLaunch, launchApp: launchLibraryApp });
    CS.library.attachHost(CS.portDataHost || null);
}
if (CS.shellHost) initialize();
else document.addEventListener('DOMContentLoaded', initialize, { once: true });
