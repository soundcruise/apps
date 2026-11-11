import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {RELEASE_FILES} from '../scripts/package-port-pc.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),A=require('../js/core/audio-coordinator.js');
const source=readFileSync(new URL('../js/modules/sheet-cruise/sheet-cruise.js',import.meta.url),'utf8');
const start=source.indexOf('    function createPianoAudition('),end=source.indexOf('    // End short pitch audition.',start);
assert(start>=0&&end>start);
// Execute the production factory, with silent injected audio nodes and the real coordinator.
const create=vm.runInNewContext(source.slice(start,end)+';createPianoAudition;');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({pending=false,samplePending=false,sampleFailure=false}={}){
 const audio=A.createCoordinator(),contexts=[],timers=new Map();let nextTimer=0,resolveResume,resolveSample;
 const sampleGate=samplePending?new Promise(r=>resolveSample=r):null;
 const gate=pending?new Promise(r=>resolveResume=r):null;
 class Context {
  constructor(){this.state='suspended';this.currentTime=10;this.destination={};this.oscillators=[];this.gains=[];this.failClose=false;contexts.push(this);}
  async resume(){if(gate)await gate;if(this.state!=='closed')this.state='running';}
  async close(){if(this.failClose)throw Error('synthetic close failure');this.state='closed';}
  createBufferSource(){const n={playbackRate:{value:0,setValueAtTime(v){this.value=v;}},starts:[],stops:[],disconnected:false,connect(){},disconnect(){this.disconnected=true;},start(t){this.starts.push(t);},stop(t){this.stops.push(t);},onended:null};this.oscillators.push(n);return n;}
  createGain(){const n={gain:{values:[],setValueAtTime(v,t){this.values.push([v,t]);},linearRampToValueAtTime(v,t){this.values.push([v,t]);},exponentialRampToValueAtTime(v,t){this.values.push([v,t]);}},connect(){},disconnect(){}};this.gains.push(n);return n;}
 }
 const runtime=create({coordinator:audio,createContext:()=>new Context(),setTimer:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimer:id=>timers.delete(id),loadSample:async(ctx,midi)=>{if(sampleGate)await sampleGate;if(sampleFailure)throw Error('synthetic decode failure');return {midi:Math.round((midi-21)/3)*3+21,buffer:{duration:4}};}});
 return {audio,runtime,contexts,pulse:async()=>{const pending=[...timers.values()];timers.clear();for(const fn of pending)fn();await flush();},decode:()=>resolveSample?.(),resolve:()=>resolveResume?.(),idle:async()=>{for(const fn of [...timers.values()])fn();timers.clear();await flush();}};
}
test('audition uses the exact MIDI frequency, a recorded sample and bounded release envelope, and releases after ending',async()=>{
 const f=fixture(),r=await f.runtime.play(69,()=>true);assert(r.ok);assert.equal(r.frequency,440);const ctx=f.contexts[0],osc=ctx.oscillators[0];assert.equal(osc.playbackRate.value,1);assert.equal(osc.buffer.duration,4);assert.deepEqual(osc.starts,[10]);assert.deepEqual(osc.stops,[11.6]);assert.equal(ctx.gains[0].gain.values[1][0],.45);
 osc.onended();assert.equal(f.audio.snapshot()[0].resourceType,null);assert(!f.runtime.snapshot().playing);await f.idle();assert.equal(ctx.state,'closed');assert.equal(f.audio.snapshot()[0].contextCount,0);
});
test('rapid notes and pending resume start only the latest note and reuse the owned context',async()=>{
 const f=fixture({pending:true}),first=f.runtime.play(60,()=>true),latest=f.runtime.play(64,()=>true);f.resolve();assert(!(await first).ok);assert((await latest).ok);assert.equal(f.contexts.length,1);assert.equal(f.contexts[0].oscillators.length,1);assert(Math.abs(f.contexts[0].oscillators[0].playbackRate.value-Math.pow(2,1/12))<.001);await f.audio.stopAll();assert.equal(f.audio.snapshot()[0].contextCount,0);
});
test('global Stop cancels a pending resume and prevents delayed playback',async()=>{
 const f=fixture({pending:true}),play=f.runtime.play(60,()=>true);await f.audio.stopAll();f.resolve();assert(!(await play).ok);assert.equal(f.contexts[0].oscillators.length,0);assert.equal(f.contexts[0].state,'closed');assert.equal(f.audio.snapshot()[0].resourceType,null);
});
test('a changed document or hidden view cannot resume a stale audition',async()=>{
 const f=fixture({pending:true});let current=true;const play=f.runtime.play(72,()=>current);current=false;f.resolve();assert(!(await play).ok);assert.equal(f.contexts[0].oscillators.length,0);assert.equal(f.audio.snapshot()[0].contextCount,0);
});
test('audition never steals microphone/audio ownership or creates an unleased context',async()=>{
 const f=fixture(),mic=f.audio.register({sessionId:'synthetic-mic',ownerFeatureId:'test',cleanup:async()=>{}}),lease=f.audio.request(mic,'microphone/session');assert(f.audio.grant(mic,lease));const r=await f.runtime.play(69,()=>true);assert(!r.ok);assert.equal(f.contexts.length,0);assert(f.audio.isLeaseCurrent(mic,lease));await f.audio.stopAll();assert((await f.runtime.play(69,()=>true)).ok);await f.runtime.stop();
});
test('failed context closure retains ownership until explicit Stop retries successfully',async()=>{
 const f=fixture();await f.runtime.play(69,()=>true);f.contexts[0].failClose=true;assert((await f.audio.stopAll()).some(r=>!r.ok));assert.equal(f.audio.snapshot()[0].resourceType,'audio-output/session');assert(!(await f.runtime.play(70,()=>true)).ok);assert.equal(f.contexts.length,1);f.contexts[0].failClose=false;assert((await f.audio.stopAll()).every(r=>r.ok));assert.equal(f.audio.snapshot()[0].contextCount,0);assert((await f.runtime.play(70,()=>true)).ok);await f.runtime.stop();
});
test('invalid pitches and inactive UI allocate no resources',async()=>{
 const f=fixture();for(const midi of [20,109,NaN,'60'])assert(!(await f.runtime.play(midi,()=>true)).ok);assert(!(await f.runtime.play(60,()=>false)).ok);assert.equal(f.contexts.length,0);assert.equal(f.audio.snapshot().length,0);
});

test('an old idle context closing cannot revoke a newer audition lease',async()=>{
 const f=fixture();await f.runtime.play(60,()=>true);const old=f.contexts[0];old.oscillators[0].onended();let finishClose;old.close=()=>new Promise(resolve=>{finishClose=()=>{old.state='closed';resolve();};});await f.idle();assert((await f.runtime.play(62,()=>true)).ok);assert.equal(f.contexts.length,2);finishClose();await flush();assert.equal(f.audio.snapshot()[0].resourceType,'audio-output/session');assert.equal(f.audio.snapshot()[0].contextCount,1);await f.runtime.stop();assert.equal(f.audio.snapshot()[0].contextCount,0);
});

test('global Stop revokes a pending sample decode; rapid decodes play only the latest accepted key',async()=>{
 const f=fixture({samplePending:true}),old=f.runtime.play(60,()=>true);await flush();await f.audio.stopAll();f.decode();assert(!(await old).ok);assert.equal(f.contexts[0].oscillators.length,0);assert.equal(f.audio.snapshot()[0].contextCount,0);
 const g=fixture({samplePending:true}),first=g.runtime.play(60,()=>true),last=g.runtime.play(69,()=>true);await flush();g.decode();assert(!(await first).ok);assert((await last).ok);assert.equal(g.contexts[0].oscillators.length,1);assert.equal(g.contexts[0].oscillators[0].playbackRate.value,1);await g.runtime.stop();
});
test('failed sample decoding releases audio and reports failure without a synthetic fallback',async()=>{
 const f=fixture({sampleFailure:true}),r=await f.runtime.play(69,()=>true);assert(!r.ok);assert(r.error);assert.equal(f.contexts[0].oscillators.length,0);assert.equal(f.contexts[0].state,'closed');assert.equal(f.audio.snapshot()[0].resourceType,null);
});
test('bundled grand samples retain original MP3 checksums, attribution and coverage without public package changes',()=>{
 const bankSource=readFileSync(new URL('../vendor/piano/salamander-bank.js',import.meta.url),'utf8'),window={CruiseStudio:{}};vm.runInNewContext(bankSource,{window});const bank=window.CruiseStudio.pianoSamples;
 const manifest=JSON.parse(readFileSync(new URL('../vendor/piano/manifest.json',import.meta.url),'utf8'));assert.equal(bank.samples.length,30);assert.equal(bank.author,'Alexander Holm');assert.equal(bank.license,'CC BY 3.0');assert.deepEqual(JSON.parse(JSON.stringify(bank.samples.map(({mp3,...m})=>m))),manifest.samples);
 for(const sample of bank.samples){const bytes=Buffer.from(sample.mp3,'base64');assert.equal(bytes.length,sample.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),sample.sha256);}
 for(let midi=21;midi<=108;midi++)assert(Math.min(...bank.samples.map(s=>Math.abs(s.midi-midi)))<=1);
 const notice=readFileSync(new URL('../vendor/piano/NOTICE.md',import.meta.url),'utf8');assert(notice.includes('Alexander Holm'));assert(notice.includes('https://creativecommons.org/licenses/by/3.0/'));assert(!RELEASE_FILES.some(p=>p.startsWith('vendor/piano/')));
});

test('polyphonic bar scheduling uses both samples, onset and duration; cancel cannot revoke a subsequent audition',async()=>{
 const f=fixture(),events=[{midi:48,part:'guitar',start:.03,duration:1,gain:.075},{midi:52,part:'guitar',start:.042,duration:.988,gain:.075},{midi:72,part:'piano',start:.53,duration:.25,gain:.32}];
 assert((await f.runtime.playEvents(events,()=>true,2)).ok);assert.equal(f.runtime.snapshot().mode,'bar');const ctx=f.contexts[0];assert.equal(ctx.oscillators.length,3);assert.deepEqual(ctx.oscillators.map(n=>n.starts[0]),[10.03,10.042,10.53]);assert(Math.abs(ctx.oscillators[2].stops[0]-10.78)<.00001);
 for(const n of ctx.oscillators)n.onended();assert.equal(f.audio.snapshot()[0].resourceType,'audio-output/session');
 f.runtime.cancel();assert.equal(f.audio.snapshot()[0].resourceType,null);assert(!f.runtime.snapshot().playing);assert((await f.runtime.play(69,()=>true)).ok);assert.equal(f.contexts.length,1);assert.equal(f.audio.snapshot()[0].resourceType,'audio-output/session');await f.runtime.stop();assert.equal(f.audio.snapshot()[0].contextCount,0);
});
test('a stopped pending bar decode never starts and invalid schedules allocate no context',async()=>{
 const f=fixture({samplePending:true}),events=[{midi:60,part:'piano',start:0,duration:1,gain:.3}],pending=f.runtime.playEvents(events,()=>true,2);await flush();await f.audio.stopAll();f.decode();assert(!(await pending).ok);assert.equal(f.contexts[0].oscillators.length,0);
 const g=fixture();for(const events of [[{midi:60,part:'guitar',start:-1,duration:1,gain:.3}],[{midi:60,part:'guitar',start:0,duration:100,gain:.3}],[{midi:60,part:'unknown',start:0,duration:1,gain:.3}]])assert(!(await g.runtime.playEvents(events,()=>true,2)).ok);assert(!(await g.runtime.playEvents([{midi:60,part:'piano',start:0,duration:1,gain:.3}],()=>true,Infinity)).ok);assert.equal(g.contexts.length,0);
});
test('bar preview reads exact melody pitches and reference chord tones without changing any project or timing qualification',()=>{
 const a=source.indexOf('    function buildBarPreviewPlan('),b=source.indexOf('    function buildBarPlayButton(',a),plan=vm.runInNewContext(source.slice(a,b)+';buildBarPreviewPlan;');
 const p={songInfo:{bpm:120},instrument:{capo:2},performance:{formBindings:[]},bars:[{melody:[{id:'note',kind:'note',onsetTick:240,durationTicks:120,pitch:{midi:72},provenance:{timing:{duration:{confirmed:false}}}},{kind:'rest',onsetTick:360,durationTicks:240}],chords:[{symbol:'D',onsetTick:0},{symbol:'H?',unresolved:true,onsetTick:960}]}]};
 const before=JSON.stringify(p),r=plan(p,0,{pitchMidi:p=>p.midi,parseChord:s=>({root:s,quality:'',bass:null}),notePc:()=>2,rhythm:()=>({encoding:'studio-strum-v1',slots:[{tick:0,action:'down',durationTicks:240},{tick:960,action:'down',durationTicks:240}]}),qualities:{maj:{symbolSuffix:'',intervals:[0,4,7]}}});assert.equal(JSON.stringify(p),before);assert.equal(r.duration,2.03);assert.equal(r.events.filter(e=>e.part==='piano').length,1);const note=r.events.find(e=>e.part==='piano');assert.equal(note.midi,72);assert.equal(note.start,.28);assert.equal(note.duration,.125);assert(r.events.filter(e=>e.part==='guitar').every(e=>[42,50,54,57].includes(e.midi)));assert.equal(r.warnings.length,1);assert.equal(p.performance.formBindings.length,0);
});
test('acoustic guitar bank retains source hashes and attribution and is excluded from the public package',()=>{
 const window={CruiseStudio:{}};vm.runInNewContext(readFileSync(new URL('../vendor/guitar/acoustic-bank.js',import.meta.url),'utf8'),{window});const bank=window.CruiseStudio.guitarSamples;assert.equal(bank.samples.length,13);assert.equal(bank.license,'CC BY 3.0');
 for(const sample of bank.samples)assert.equal(createHash('sha256').update(Buffer.from(sample.mp3,'base64')).digest('hex'),sample.sha256);
 for(let midi=40;midi<=74;midi++)assert(Math.min(...bank.samples.map(s=>Math.abs(s.midi-midi)))<=1);
 assert(readFileSync(new URL('../vendor/guitar/NOTICE.md',import.meta.url),'utf8').includes('University of Iowa'));assert(!RELEASE_FILES.some(p=>p.startsWith('vendor/guitar/')));
});

test('stroke plan respects exact attacks, direction, accent, rests, mute and sustain without confirming source timing',()=>{
 const a=source.indexOf('    function buildBarPreviewPlan('),b=source.indexOf('    function buildBarPlayButton(',a),plan=vm.runInNewContext(source.slice(a,b)+';buildBarPreviewPlan;');
 const p={songInfo:{bpm:120},bars:[{melody:[{id:'m',kind:'note',onsetTick:120,durationTicks:80,pitch:72}],chords:[{id:'c',symbol:'C',onsetTick:0},{id:'g',symbol:'G',onsetTick:960}]}]},slots=[{tick:0,action:'down',durationTicks:480,accent:true},{tick:480,action:'rest',durationTicks:240},{tick:720,action:'up',durationTicks:120},{tick:960,action:'up',durationTicks:480},{tick:1440,action:'mute',durationTicks:120}];
 const deps={pitchMidi:n=>n,parseChord:s=>({root:s,quality:'',bass:null}),notePc:n=>n==='C'?0:7,qualities:{maj:{symbolSuffix:'',intervals:[0,4,7]}},rhythm:()=>({encoding:'studio-strum-v1',slots})},before=JSON.stringify({p,slots}),r=plan(p,0,deps),at=t=>r.events.filter(e=>e.tick===t&&e.part==='guitar');
 assert.deepEqual(Array.from(at(0),e=>e.midi),[48,52,55]);assert(at(0).every(e=>Math.abs(e.start+e.duration-.53)<1e-8));assert.equal(r.events.filter(e=>e.tick===240||e.tick===480).length,0);assert.deepEqual(Array.from(at(720),e=>e.midi),[55,52,48]);assert.deepEqual(Array.from(at(960),e=>e.midi),[62,59,55,43]);assert(at(0)[0].gain>at(720)[0].gain);assert.equal(r.events.find(e=>e.tick===1440).part,'mute');assert.equal(r.events.find(e=>e.part==='piano').duration,80/960);assert.equal(JSON.stringify({p,slots}),before);
 const only=plan(p,0,{...deps,melodyOnly:true,rhythm:()=>{throw Error('melody-only must not inspect guitar');}});assert(only.events.every(e=>e.part==='piano'));
 slots[0].tieToNext=true;assert.throws(()=>plan(p,0,deps),/タイ/);
});
test('native Rhythm sustain does not retrigger and implicit harmony carries to a following bar',()=>{
 const a=source.indexOf('    function buildBarPreviewPlan('),b=source.indexOf('    function buildBarPlayButton(',a),plan=vm.runInNewContext(source.slice(a,b)+';buildBarPreviewPlan;');
 const p={songInfo:{bpm:120},bars:[{melody:[],chords:[{symbol:'C',onsetTick:0}]},{melody:[],chords:[]}]},deps={pitchMidi:()=>60,parseChord:s=>({root:s,quality:'',bass:null}),notePc:()=>0,qualities:{maj:{symbolSuffix:'',intervals:[0,4,7]}},rhythm:()=>({encoding:'rhythm-owner-cells-v1',projection:{rhythmResolved:true,performanceReady:false,events:[{sound:'attack',direction:'down',onsetTick:0,notationDurationTicks:480},{sound:'sustain',onsetTick:240},{sound:'rest',onsetTick:480,notationDurationTicks:1440}]}})};
 const r=plan(p,1,deps);assert.equal(r.events.length,3);assert(r.events.every(e=>e.tick===0));assert(r.events.every(e=>Math.abs(e.start+e.duration-.53)<1e-8));p.bars[0].chords[0].durationTicks=1920;assert.equal(plan(p,1,deps).events.length,0);
});
test('silent bars keep an audio clock for their playhead and release after Stop',async()=>{
 const f=fixture();assert((await f.runtime.playEvents([],()=>true,2)).ok);assert.equal(f.runtime.snapshot().elapsedSeconds,0);f.contexts[0].currentTime=10.7;assert(Math.abs(f.runtime.snapshot().elapsedSeconds-.7)<1e-8);assert.equal(f.contexts[0].oscillators.length,0);assert.equal(f.audio.snapshot()[0].resourceType,'audio-output/session');await f.runtime.stop();assert.equal(f.audio.snapshot()[0].contextCount,0);
});

test('whole-song playback schedules a short window at an audio-clock origin, including events after 61 seconds',async()=>{
 const f=fixture(),events=[0,1.5,65].map(start=>({midi:60,part:'piano',start,duration:.2,gain:.3}));assert((await f.runtime.playEvents(events,()=>true,67,true)).ok);assert.equal(f.runtime.snapshot().mode,'song');const ctx=f.contexts[0];assert.equal(ctx.oscillators.length,1);assert.equal(ctx.oscillators[0].starts[0],10);
 ctx.currentTime=10.75;await f.pulse();assert.equal(ctx.oscillators.length,2);assert.equal(ctx.oscillators[1].starts[0],11.5);ctx.currentTime=74;await f.pulse();assert.equal(ctx.oscillators.length,3);assert.equal(ctx.oscillators[2].starts[0],75);ctx.currentTime=77;await f.pulse();assert.equal(f.audio.snapshot()[0].resourceType,null);assert(!f.runtime.snapshot().playing);await f.runtime.stop();assert.equal(f.audio.snapshot()[0].contextCount,0);
});
test('cancelled stream and stale pump callbacks never schedule later notes or revoke a new audition',async()=>{
 const f=fixture(),events=[0,8].map(start=>({midi:60,part:'piano',start,duration:.2,gain:.3}));await f.runtime.playEvents(events,()=>true,9,true);await f.runtime.stop();f.contexts[0].currentTime=18;await f.pulse();assert.equal(f.contexts[0].oscillators.length,1);assert((await f.runtime.play(69,()=>true)).ok);await f.pulse();assert.equal(f.audio.snapshot()[0].resourceType,'audio-output/session');await f.runtime.stop();
});
test('late stream scheduling fails closed, and pending stream decode is revoked by global Stop',async()=>{
 const f=fixture();await f.runtime.playEvents([{midi:60,part:'piano',start:2,duration:.2,gain:.3}],()=>true,3,true);f.contexts[0].currentTime=12.2;await f.pulse();assert.equal(f.contexts[0].oscillators.length,0);assert(!f.runtime.snapshot().playing);await f.runtime.stop();
 const g=fixture({samplePending:true}),pending=g.runtime.playEvents([{midi:60,part:'piano',start:0,duration:.2,gain:.3}],()=>true,70,true);await flush();await g.audio.stopAll();g.decode();assert(!(await pending).ok);assert.equal(g.contexts[0].oscillators.length,0);assert.equal(g.audio.snapshot()[0].contextCount,0);
});
test('whole-song projection has gapless bar boundaries and keeps the working Project unchanged',()=>{
 const a=source.indexOf('    function buildBarPreviewPlan('),b=source.indexOf('    function buildBarPlayButton(',a),build=vm.runInNewContext(source.slice(a,b)+';buildSongPreviewPlan;');const p={songInfo:{bpm:120},bars:Array.from({length:40},(_,i)=>({melody:[{id:'n'+i,kind:'note',onsetTick:0,durationTicks:240,pitch:60}],chords:[]}))};const original=JSON.stringify(p),r=build(p,{melodyOnly:true,pitchMidi:n=>n});assert.equal(r.spans.length,40);assert(Math.abs(r.duration-80.03)<1e-8);assert(Math.abs(r.events[1].start-2.03)<1e-8);assert(Math.abs(r.events[39].start-78.03)<1e-8);assert.equal(JSON.stringify(p),original);
});
test('typed-note matching preserves repeated existing notes while identifying a new inserted token',()=>{
 const a=source.indexOf('    function matchTypedNotes('),b=source.indexOf('    // Each field owns',a),match=vm.runInNewContext(source.slice(a,b)+';matchTypedNotes;');const n=step=>({step,alter:0,octave:0});assert.deepEqual(Array.from(match([n(0),n(1)],[n(0),n(2),n(1)])),[0,-1,1]);assert.deepEqual(Array.from(match([n(0),n(0)],[n(0),n(0),n(0)])),[0,1,-1]);
});
