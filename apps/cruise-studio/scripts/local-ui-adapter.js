import {bindScoreEditor} from '../js/score-editor-integration.mjs';
/* Test-only dependency injection. Excluded from both release packaging paths. */
import {createOwnerUI,ownerCSS,exportBookmarklet,createFormRenderer} from './.local-chord-owner.mjs';
import {createMockAccountBookshelf} from './mock-account-bookshelf.mjs';
import {createPaperLayout} from '../js/modules/sheet-cruise/paper-layout.mjs';
import {createPaperForms} from '../js/modules/sheet-cruise/paper-forms.mjs';
import {createFormAuthoring} from '../js/modules/chord/form-authoring.mjs';
if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1' || location.port !== '18874' ||
    !document.querySelector('meta[name="local-ui-fixture"]') || !document.querySelector('[data-local-ui-banner]')) {
    throw Error('Local UI fixture refused outside its dedicated origin');
}
const C = window.CruiseStudio;
C.localBookSource = createMockAccountBookshelf(location,!!document.querySelector('meta[name="local-ui-fixture"]'));
C.localChordOwner = Object.freeze({bookEdition:"standard",createOwnerUI,ownerCSS,exportBookmarklet,createFormRenderer});
C.localPaperForms = createPaperForms(createFormRenderer({ChordCruise:{ui:{},state:{settings:{}}}},document));
C.localChordForms = createFormAuthoring(C,window.ChordCruise);
C.localPaperLayout = createPaperLayout(C);
C.sheetCruise?.connectPaperLayout();
C.entryAuth = Object.freeze({isAuthorized: () => true, check: async () => true,
    read: () => ({phase: 'ready', accountId: null})});
// Keep native Account, Sync and embedded application surfaces out of this fixture.
for (const button of document.querySelectorAll('button[data-workspace],button[data-home-workspace],[data-open-tool],#home-cruise-sync,[data-open-calendar]')) {
    const id = button.dataset.workspace || button.dataset.homeWorkspace || button.dataset.openTool;
    if (!['home', 'sheetCruise', 'preDtm', 'scoreViewer'].includes(id)) button.disabled = true;
}
document.getElementById('studio-shell').inert = false;
document.documentElement.dataset.studioEntry = 'ready';

bindScoreEditor(C);
