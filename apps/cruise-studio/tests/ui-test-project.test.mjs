import test from 'node:test';
import assert from 'node:assert/strict';
import {createUITestProject} from '../scripts/create-ui-test-project.mjs';
import {fixture} from './helpers/chord-form-fixture.mjs';
test('synthetic UI score is independently importable with confirmed note timing and playable registered forms',async()=>{
 const p=createUITestProject(),next=createUITestProject(),f=fixture({project:{...p,projectId:'A'}});
 assert.notEqual(p.projectId,next.projectId);assert.equal(p.bars.length,12);assert.equal(p.sections.length,4);
 assert.equal(p.provenance.legacySource,undefined);assert.deepEqual(p.instrument.tuning,[64,59,55,50,45,40]);assert.equal(p.instrument.maxAbsoluteFret,22);
 assert(p.bars.every(b=>b.chords.length&&b.lyrics.length&&b.melody.length));
 assert(p.bars[0].melody.some(n=>n.onsetTick===120));assert(p.bars.some(b=>b.melody.some(n=>n.pitch.octave===5)));
 for(const bar of p.bars){for(const n of bar.melody)assert(n.provenance.timing.onset.confirmed&&n.provenance.timing.duration.confirmed);for(const e of bar.chords)assert(p.performance.formBindings.some(b=>b.chordEventId===e.id));}
 const {createFormAuthoring}=await import('../js/modules/chord/form-authoring.mjs'),forms=createFormAuthoring(f.C,f.realm.window.ChordCruise);
 for(const binding of p.performance.formBindings)assert(forms.evaluate(p,binding).ready,JSON.stringify(forms.evaluate(p,binding)));
 const empty=p.performance.barRhythms.find(r=>r.barId===p.bars[2].id);assert.deepEqual(p.materials.rhythms.find(m=>m.id===empty.materialId).snapshot.slots,[]);
 assert.equal(f.s().workingSnapshot().songInfo.title,p.songInfo.title);assert(f.api.validate(f.s().workingSnapshot()).ok);
 assert((await f.s().commit()).ok);assert.deepEqual(f.repository.read(f.s().target).snapshot,f.s().workingSnapshot());
});
