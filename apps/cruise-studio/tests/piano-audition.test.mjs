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
 return {audio,runtime,contexts,decode:()=>resolveSample?.(),resolve:()=>resolveResume?.(),idle:async()=>{for(const fn of [...timers.values()])fn();timers.clear();await flush();}};
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
