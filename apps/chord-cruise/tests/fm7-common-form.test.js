'use strict';
const assert=require('node:assert/strict');global.window={ChordCruise:{}};
require('../js/core/music-theory.js');require('../js/core/caged-forms.js');
const C=window.ChordCruise,form=C.caged.getForm('E','maj7',5,13,0),formal=C.caged.getForm('E','maj7',5,13,0,{variant:'formal'});
assert.deepEqual(form.notes.map(n=>[n.string,n.fret,n.finger]),[[4,3,3],[3,2,2],[2,1,1],[1,0,null]]);assert.deepEqual(form.mutedStrings,[5,6]);assert.equal(form.formVariant,'fm7-open');assert.equal(C.caged.getCommonForm('maj7',5,13,0).shape,'E');assert(form.formNotice.includes('頻出'));assert.equal(form.warning,'');assert.equal(formal.notes.length,6);assert(!formal.notes.some(n=>n.fret===0));assert.equal(formal.formVariant,'formal');
assert.equal(C.caged.getForm('E','maj7',6,13,0).fm7Alternative,false);assert.equal(C.caged.getForm('E','maj7',5,25,12).fm7Alternative,false);assert.notEqual(C.caged.getForm('E','maj7',5,2,0).formVariant,'fm7-open');
console.log('FM7 shared E exception and formal alternative OK');

// Saved diagrams retain their own notes; the new default must not rewrite a stored formal form.
const stored={};window.localStorage={getItem:k=>Object.hasOwn(stored,k)?stored[k]:null,setItem:(k,v)=>stored[k]=String(v),removeItem:k=>delete stored[k]};
require('../js/core/storage.js');require('../js/ui/fretboard.js');
const save=form=>C.storage.saveChord({chordName:'FM7',formName:'E型',shape:'E',qualityKey:'maj7',rootPc:5,intervals:[0,4,7,11],fretRange:form.fretRange,notes:form.notes,mutedStrings:form.mutedStrings,folderId:'folder_uncategorized'});
const savedFormal=save(formal),before=JSON.stringify(stored);C.caged.getForm('E','maj7',5,13,0);assert.equal(JSON.stringify(stored),before);assert.equal(C.storage.loadChord(savedFormal.id).notes.length,6);
const savedCommon=save(form),reloaded=C.storage.loadChord(savedCommon.id);assert.equal(reloaded.schemaVersion,1);assert.deepEqual(reloaded.notes.map(n=>[n.string,n.fret,n.finger]),form.notes.map(n=>[n.string,n.fret,n.finger]));assert.deepEqual(reloaded.mutedStrings,[5,6]);assert.equal(C.storage.loadChord(savedFormal.id).notes.length,6);
const json=JSON.parse(JSON.stringify(reloaded));assert.deepEqual(json.notes,reloaded.notes);
const labels={0:'F',4:'A',7:'C',11:'E'},diagram={frets:[0,1,2,3],markers:form.notes.map(n=>({string:n.string,fret:n.fret,label:labels[n.interval],role:n.interval===0?'root':'chord'})),barres:[],mutedStrings:form.mutedStrings};
for(const svg of [C.ui.fretboard.buildStaticSvg(diagram),C.ui.fretboard.buildExportSvg('FM7',diagram).svg])for(const label of Object.values(labels))assert(svg.includes('>'+label+'</text>'));
console.log('FM7 common/formal storage, JSON and SVG/PNG source preserve notes without rewriting existing entries');
