import test from 'node:test';
import assert from 'node:assert/strict';
import {diagramFrets,rangeForForm} from '../js/modules/sheet-cruise/form-range.mjs';
import {basisKey,contentKey} from '../js/modules/chord/form-snapshot.mjs';
import {createUITestProject} from '../scripts/create-ui-test-project.mjs';

function form(notes,capo=0) {
    return {strings:notes.map(relativeFret=>relativeFret===null?{kind:'muted'}:{kind:'note',relativeFret}),barres:[],capo,maxAbsoluteFret:22};
}

test('open and muted strings occupy the gutter, and fret windows stay on the available neck',()=>{
    assert.deepEqual(diagramFrets(form([0,8,9,10,null])),[0,8,9,10]);
    assert.deepEqual(diagramFrets(form([5,5,5])),[4,5,6]);
    assert.deepEqual(diagramFrets(form([0,null])),[0,1,2,3]);
    assert.deepEqual(diagramFrets(form([1])),[1,2,3]);
    assert.deepEqual(diagramFrets(form([19],3)),[17,18,19]);
    assert.deepEqual(diagramFrets(form([0],22)),[0]);
    assert.deepEqual(diagramFrets(form([0,2],20)),[0,1,2]);
    const wide=form([9,13]);wide.barres=[{relativeFret:8}];wide.displayRange={min:10,max:11};
    assert.deepEqual(rangeForForm(wide),{min:8,max:13,includesOpen:false});
});

test('manual windows distinguish stored diagrams and preserve the musical confirmation key',()=>{
    const song=createUITestProject(), event=song.bars[0].chords[0],binding=song.performance.formBindings.find(b=>b.chordEventId===event.id);
    const original=song.materials.forms.find(m=>m.id===binding.materialId);
    const manual=structuredClone(original);manual.snapshot.displayRange={min:1,max:8};
    assert.notEqual(contentKey(original),contentKey(manual));
    assert.equal(basisKey(song,event,original,binding.playedStrings),basisKey(song,event,manual,binding.playedStrings));
});
