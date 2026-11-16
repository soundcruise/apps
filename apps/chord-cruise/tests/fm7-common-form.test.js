'use strict';
const assert=require('node:assert/strict');global.window={ChordCruise:{}};
require('../js/core/music-theory.js');require('../js/core/caged-forms.js');require('../js/ui/fretboard.js');
const C=window.ChordCruise,form=C.caged.getForm('E','maj7',5,13,0),formal=C.caged.getForm('E','maj7',5,13,0,{variant:'formal'});
assert.deepEqual(form.notes.map(n=>[n.string,n.fret,n.finger]),[[4,3,3],[3,2,2],[2,1,1],[1,0,null]]);assert.deepEqual(form.mutedStrings,[5,6]);assert.equal(form.formVariant,'fm7-open');assert.equal(C.caged.getCommonForm('maj7',5,13,0).shape,'E');assert(form.formNotice.includes('頻出'));assert.equal(form.warning,'');assert.equal(formal.notes.length,6);assert(!formal.notes.some(n=>n.fret===0));assert.equal(formal.formVariant,'formal');
assert.equal(C.caged.getForm('E','maj7',6,13,0).fm7Alternative,false);assert.equal(C.caged.getForm('E','maj7',5,25,12).fm7Alternative,false);assert.notEqual(C.caged.getForm('E','maj7',5,2,0).formVariant,'fm7-open');
const model=C.ui.fretboard.createModel({monochrome:true,frets:[8,9,10],mutedStrings:[1],markers:[{string:2,fret:8}]});assert.deepEqual(model.frets,[0,8,9,10]);assert(model.muteX<model.markers[0].x);assert.equal(model.mutedStrings[0],1);
console.log('FM7 shared E exception and formal alternative; high-fret zero/mute column OK');
