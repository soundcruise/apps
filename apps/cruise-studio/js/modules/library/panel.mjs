import { filterLibraryItems } from '../../port-data/library-projection.mjs?v=0.37.1';
const CS = globalThis.CruiseStudio;
function initialize() {
    CS.libraryViews = CS.library.init({ document, shell: CS.shellHost, filterItems: filterLibraryItems });
    CS.library.attachHost(CS.portDataHost || null);
}
if (CS.shellHost) initialize();
else document.addEventListener('DOMContentLoaded', initialize, { once: true });
