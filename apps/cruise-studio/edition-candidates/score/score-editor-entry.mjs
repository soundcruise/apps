import {createOwnerUI, ownerCSS, exportBookmarklet, createFormRenderer} from './chord-owner.mjs';
import {createPaperLayout} from './modules/sheet-cruise/paper-layout.mjs';
import {createPaperForms} from './modules/sheet-cruise/paper-forms.mjs';
import {createFormAuthoring} from './modules/chord/form-authoring.mjs';
import {bindScoreEditor} from './score-editor-integration.mjs';

const studio = window.CruiseStudio;
studio.localChordOwner = Object.freeze({createOwnerUI, ownerCSS, exportBookmarklet, createFormRenderer});
studio.localPaperForms = createPaperForms(createFormRenderer({ChordCruise:{ui:{},state:{settings:{}}}}, document));
studio.localChordForms = createFormAuthoring(studio, window.ChordCruise);
studio.localPaperLayout = createPaperLayout(studio);
studio.sheetCruise.connectPaperLayout();
bindScoreEditor(studio);
