import test from 'node:test';
import assert from 'node:assert/strict';
import {compactChordAudition} from '../js/modules/sheet-cruise/score-presets.mjs';
import {chordVoicing, singleChordPlan} from '../js/modules/sheet-cruise/chord-audition.mjs';
import {buildBarPreviewPlan, buildSongPreviewPlan, buildSongTickPlan} from '../js/modules/sheet-cruise/score-playback.mjs';
const form = {capo: 0, tuningMidi: [64,59,55,50,45,40], strings: [0,1,0,2,3,null].map((f,i) =>
    f === null ? {string:i+1,kind:'muted'} : {string:i+1,kind:'note',relativeFret:f})};
function fixture() {
    const chord={id:'c',symbol:'C',onsetTick:0};
    return {songInfo:{bpm:120},bars:[{id:'b1',melody:[],chords:[chord]},{id:'b2',melody:[],chords:[]}],
        materials:{forms:[{id:'f',snapshot:structuredClone(form)}]},performance:{formBindings:[{chordEventId:'c',materialId:'f',playedStrings:[1,2,3,4,5]}]}};
}
const deps = slots => ({parseChord:s=>s==='C'?{root:'C',quality:'maj'}:null,notePc:()=>0,qualities:{maj:{intervals:[0,4,7]}},pitchMidi:n=>n,
    rhythm:()=>({encoding:'studio-strum-v1',slots:slots??[{tick:0,action:'down',durationTicks:240}]})});
const at = (plan,t=0) => plan.events.filter(e=>e.part==='guitar'&&e.tick===t);
const mids = events => events.map(e=>e.midi).sort((a,b)=>a-b);
test('single, one/two bars and song use exactly the registered strings, without writes',()=>{
    const p=fixture(),before=JSON.stringify(p),d=deps();
    for(const plan of [singleChordPlan(p,p.bars[0].chords[0],d),buildBarPreviewPlan(p,0,d),buildSongPreviewPlan(p,d,0,2),buildSongPreviewPlan(p,d)]) {
        assert.deepEqual(mids(at(plan).filter(e=>e.barIndex===undefined||e.barIndex===0)),[48,52,55,60,64]);
        assert.deepEqual(plan.warnings,[]);
    }
    assert.equal(JSON.stringify(p),before);
});
test('capo, alternate tuning, open strings, played subset and equal pitches retain physical order',()=>{
    const p=fixture();p.materials.forms[0].snapshot.capo=2;p.materials.forms[0].snapshot.tuningMidi=[64,59,55,50,61,40];
    p.performance.formBindings[0].playedStrings=[1,3,5];
    const plan=buildBarPreviewPlan(p,0,deps([{tick:0,action:'down'},{tick:480,action:'up'}]));
    assert.deepEqual(at(plan).map(e=>[e.string,e.midi]),[[5,66],[3,57],[1,66]]);
    assert.deepEqual(at(plan,480).map(e=>[e.string,e.midi]),[[1,66],[3,57],[5,66]]);
    assert.equal(at(plan).filter(e=>e.midi===66).length,2);
    assert.notEqual(at(plan)[1].start-at(plan)[0].start,at(plan)[2].start-at(plan)[1].start);
});
test('only an absent binding permits an explicitly labelled theoretical fallback',()=>{
    const p=fixture(),d=deps();p.materials.forms=[];
    assert.throws(()=>singleChordPlan(p,p.bars[0].chords[0],d),/登録フォーム/);
    assert.equal(buildBarPreviewPlan(p,0,d).events.length,0);
    p.performance.formBindings=[];assert(buildBarPreviewPlan(p,0,d).warnings.some(w=>w.includes('参考和音')));
    p.bars[0].chords[0].unresolved=true;assert.equal(buildBarPreviewPlan(p,0,d).events.length,0);
});
test('invalid strings and missing playedStrings cannot silently become another chord',()=>{
    for(const mutate of [p=>p.materials.forms[0].snapshot.strings.pop(),p=>p.materials.forms[0].snapshot.strings[0].string=2,
        p=>p.materials.forms[0].snapshot.strings[0].relativeFret=-1,p=>delete p.performance.formBindings[0].playedStrings,
        p=>p.performance.formBindings[0].playedStrings=[6]]) {
        const p=fixture();mutate(p);assert.throws(()=>chordVoicing(p,p.bars[0].chords[0],deps()));assert.equal(buildBarPreviewPlan(p,0,deps()).events.length,0);
    }
});
test('blank intervals ring; same string reattack, rest, mute, chord changes and explicit duration damp',()=>{
    const p=fixture(),d=deps([{tick:0,action:'down',durationTicks:120},{tick:480,action:'up'},{tick:960,action:'rest'},
        {tick:1200,action:'down'},{tick:1440,action:'mute'}]);
    const plan=buildBarPreviewPlan(p,0,d);
    for(const e of at(plan)) { const next=at(plan,480).find(n=>n.string===e.string);assert(Math.abs(e.start+e.duration-next.start)<1e-9);assert(e.duration>.45); }
    for(const e of at(plan,480)) assert(Math.abs(e.start+e.duration-1.03)<1e-9);
    for(const e of at(plan,1200)) assert(Math.abs(e.start+e.duration-1.53)<1e-9);
    p.bars[0].chords.push({id:'unresolved',symbol:'?',unresolved:true,onsetTick:600});
    const changed=buildBarPreviewPlan(p,0,deps());assert(changed.events.every(e=>e.start+e.duration<=.655+1e-9));
    p.bars[0].chords=[{...p.bars[0].chords[0],durationTicks:12}];
    const short=buildBarPreviewPlan(p,0,deps());assert(short.events.every(e=>e.start+e.duration<=.0425+1e-9));assert(short.events.length<5);
});
test('implicit harmony and ringing cross bars, explicit chord duration does not; previous onset cannot collide with local onset',()=>{
    const p=fixture(),d=deps([{tick:1680,action:'down'}]);
    const song=buildSongPreviewPlan(p,d);assert(at(song,1680).some(e=>e.barIndex===0&&e.start+e.duration>2.03));
    assert.equal(buildBarPreviewPlan(p,1,deps()).events.length,5);
    p.bars[1].chords=[{id:'later',symbol:'C',onsetTick:960}];assert.equal(at(buildBarPreviewPlan(p,1,deps())).length,5);
    p.bars[0].chords[0].durationTicks=1920;assert.equal(at(buildBarPreviewPlan(p,1,deps())).length,0);
});
test('rest at next bar start damps carry, while melody timing is untouched',()=>{
    const p=fixture();p.bars[0].melody=[{id:'m',kind:'note',pitch:72,onsetTick:240,durationTicks:120}];
    const d=deps();d.rhythm=(p,i)=>({encoding:'studio-strum-v1',slots:i?[{tick:0,action:'rest'}]:[{tick:1680,action:'down'}]});
    const plan=buildSongPreviewPlan(p,d);assert(plan.events.filter(e=>e.part==='guitar').every(e=>Math.abs(e.start+e.duration-2.03)<1e-9));
    assert.deepEqual(plan.events.find(e=>e.part==='piano'),{part:'piano',midi:72,start:.28,duration:.125,gain:.32,tick:240,sourceEventId:'m',barIndex:0});
});

test('range loop uses the selected musical duration with inherited harmony, no copied bars and no trailing attack gap',async()=>{
 const {buildRangeLoopPlan}=await import('../js/modules/sheet-cruise/score-playback.mjs'),p=fixture();p.bars.push({id:'b3',melody:[],chords:[]});const before=JSON.stringify(p),d=deps(),plan=buildRangeLoopPlan(p,d,1,2);
 assert.deepEqual(plan.spans.map(s=>s.index),[1,2]);assert(Math.abs(plan.loopPeriod-4)<1e-9);assert(Math.abs(plan.duration-4.03)<1e-9);assert(plan.events.length);assert(plan.events.every(e=>[1,2].includes(e.barIndex)));assert(plan.events.every(e=>e.start+e.duration<=plan.duration+1e-9));assert.equal(JSON.stringify(p),before);
 for(const args of [[-1,2],[0,0],[2,2],[0,2.5]])assert.throws(()=>buildRangeLoopPlan(p,d,...args));
});

test('single selected bar can repeat without changing the source or adding a second bar',async()=>{
 const {buildRangeLoopPlan}=await import('../js/modules/sheet-cruise/score-playback.mjs'),p=fixture(),before=JSON.stringify(p),d=deps(),plan=buildRangeLoopPlan(p,d,0,1);
 assert.equal(plan.spans.length,1);assert.equal(plan.spans[0].index,0);assert(Math.abs(plan.loopPeriod-240/p.songInfo.bpm)<1e-9);assert(plan.events.every(e=>e.barIndex===0));assert.equal(JSON.stringify(p),before);
});

test('progression audition caps long gaps at one beat and preserves offbeats and string attacks',()=>{
    const original=buildSongPreviewPlan(fixture(),deps([{tick:0,action:'down'},{tick:240,action:'up'}]));
    const before=structuredClone(original);
    const compact=compactChordAudition(original);
    const onsets=[...new Set(compact.events.map(event=>event.attackStart))];
    assert.deepEqual(onsets.map(time=>Math.round(time*1000)),[30,280,780,1030]);
    assert.equal(Math.round(compact.duration*1000),1530);
    for(const [i,event] of compact.events.entries()){
        const source=original.events[i];
        assert.equal(event.midi,source.midi);
        assert(Math.abs(event.start-event.attackStart-(source.start-source.attackStart))<1e-9);
        assert(event.start+event.duration<=compact.duration+1e-9);
    }
    assert.deepEqual(original,before);
});

test('chord changes do not create guitar attacks in blank slots or explicit rests',()=>{
    const project=fixture();
    project.bars[0].chords.push({id:'change',symbol:'C',onsetTick:720});
    for(const slots of [[],[{tick:0,action:'rest',durationTicks:960}]]){
        for(const plan of [buildBarPreviewPlan(project,0,deps(slots)),buildSongPreviewPlan(project,deps(slots))]){
            assert.equal(plan.events.filter(e=>e.part==='guitar').length,0);
        }
    }
});

test('strokes keep the preceding form after its stored end and a whitespace-only chord',()=>{
    const project=fixture();
    Object.assign(project.bars[0].chords[0],{symbol:'Am',durationTicks:960});
    project.bars[0].chords.push({id:'blank',symbol:'　 ',onsetTick:960});
    const ticks=[0,240,480,720,960,1200,1440,1680];
    const plan=buildBarPreviewPlan(project,0,deps(ticks.map(tick=>({tick,action:'down'}))));
    for(const tick of ticks) assert.deepEqual(mids(at(plan,tick)),[48,52,55,60,64]);
});

test('syncopated upstroke rings through the next downbeat until the end of its written hold',()=>{
    const p=fixture(),d=deps();
    p.bars[0].chords[0].durationTicks=1920;
    p.bars[1].chords=[{id:'next',symbol:'C',onsetTick:0}];
    d.rhythm=(_,index)=>index===0 ?
        {encoding:'studio-strum-v1',slots:[{tick:1680,action:'up',durationTicks:240}]} :
        {encoding:'studio-strum-v1',leadingSustainTicks:240,slots:[{tick:240,action:'down',durationTicks:240}]};
    const preview=buildSongPreviewPlan(p,d);
    const held=at(preview,1680);
    assert.equal(held.length,5);
    for(const string of held)assert(Math.abs(string.start+string.duration-2.28)<1e-8);
    const live=buildSongTickPlan(p,d);
    assert.equal(at(live,1920).length,0);
    assert(at(live,2160).length>0);
    assert.deepEqual(at(live,1680).map(e=>e.boundaryTick),Array(5).fill(2160));
});
