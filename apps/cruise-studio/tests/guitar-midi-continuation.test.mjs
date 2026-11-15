import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, state} from './helpers/chord-form-fixture.mjs';
import {enrichGuitarVoicing} from '../js/modules/pre-dtm-cruise/guitar-voicing.mjs';

function setup(){
    const f=fixture();
    assert(f.s().runOperation('continuing C',p=>{p.bars[0].chords=p.bars[0].chords.slice(0,1);p.bars[0].chords[0].symbol='C';delete p.bars[0].chords[0].durationTicks;for(let i=1;i<4;i++)p.bars[i].chords=[];}).ok);
    assert(f.adopt().ok);
    const project=structuredClone(f.s().workingSnapshot()),deps={schema:f.api,...f.deps};
    return {f,project,generate(p=project){return enrichGuitarVoicing(p,f.C.arrangement.generateArrangement(p),deps);}};
}
test('confirmed harmony continues through empty bars and survives actual MIDI encoding without writes',()=>{
    const {f,project,generate}=setup(),before=state(f),raw=JSON.stringify(project),out=generate();
    for(const b of out.bars.slice(0,4)){
        assert(b.guitar.length>0);assert.equal(b.guitarNotes.length,b.guitar.length*5);
        assert.deepEqual([...new Set(b.guitarNotes.map(n=>n.midi))].sort((a,b)=>a-b),[48,52,55,60,64]);
        assert(b.guitarNotes.every(n=>n.absoluteTick>=b.guitar[0].absoluteTick&&n.durationTicks>0));
    }
    const midi=f.C.midi.buildMidiFile(out);assert(midi.ok);const parsed=f.C.midi.inspectSmf(midi.bytes);assert(parsed.ok);
    assert.equal(midi.stats.guitarNotes,out.bars.reduce((n,b)=>n+b.guitarNotes.length,0));
    assert.equal(parsed.trackNoteOns.at(-1),midi.stats.guitarNotes);
    assert.equal(JSON.stringify(project),raw);assert.equal(state(f),before);
});
test('a later local chord ends inherited harmony; missing or unconfirmed local form is not replaced by the old C',()=>{
    const {project,generate}=setup();project.bars[1].chords=[{...structuredClone(project.bars[0].chords[0]),id:'local-G',symbol:'G',onsetTick:960}];
    const out=generate(),start=out.bars[1].guitar[0].absoluteTick;
    assert(out.bars[1].guitarNotes.length>0);assert(out.bars[1].guitarNotes.every(n=>n.absoluteTick+n.durationTicks<=start+960));
    assert.equal(out.bars[2].guitarNotes.length,0);
    project.performance.formBindings[0].confirmation.status='unconfirmed';assert.equal(generate().bars[1].guitarNotes.length,0);
});
test('explicit chord duration stops at its end and never resumes in later empty bars',()=>{
    const {project,generate}=setup();project.bars[0].chords[0].durationTicks=720;
    const out=generate();assert(out.bars[0].guitarNotes.length>0);assert(out.bars[0].guitarNotes.every(n=>n.absoluteTick+n.durationTicks<=720));
    for(const b of out.bars.slice(1,4))assert.equal(b.guitarNotes.length,0);
});
test('newer unresolved harmony blocks older confirmed harmony; an empty opening has no inherited notes',()=>{
    const {project,generate}=setup();project.bars[1].chords=[{...structuredClone(project.bars[0].chords[0]),id:'unknown',symbol:'?',unresolved:true,onsetTick:0}];
    const out=generate();assert.equal(out.bars[1].guitarNotes.length,0);assert.equal(out.bars[2].guitarNotes.length,0);
    const empty=structuredClone(project);empty.performance.formBindings=[];empty.bars[0].chords=[];assert.equal(generate(empty).bars[0].guitarNotes.length,0);
});
