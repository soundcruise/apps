import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {buildCountIn,withMetronome} from '../js/modules/sheet-cruise/score-playback.mjs';
const require=createRequire(import.meta.url),{createCoordinator}=require('../js/core/audio-coordinator.js');
const source=readFileSync(new URL('../js/modules/sheet-cruise/sheet-cruise.js',import.meta.url),'utf8');
// Exercise the real scheduler, using explicit clock/sample/timer dependencies.
const create=vm.runInNewContext('('+source.slice(source.indexOf('function createPianoAudition('),source.indexOf('    // End short pitch audition.')).trim()+')');
const project=bpm=>({songInfo:{bpm,timeSignature:{beats:4,beatUnit:4}}});
const score=[{midi:60,part:'guitar',start:.03,duration:.1,gain:.1}];
function fixture(load){
 const audio=createCoordinator(),timers=new Map(),starts=[],states=[];let serial=0,created=0;
 const ctx={state:'suspended',currentTime:0,destination:{},resume:async()=>{ctx.state='running';},close:async()=>{ctx.state='closed';},
  createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}),
  createBufferSource:()=>({playbackRate:{setValueAtTime(){}},connect(){},disconnect(){},start(t){starts.push({t,part:this.buffer.part});},stop(){},onended:null})};
 const runtime=create({coordinator:audio,createContext:()=>{created++;return ctx;},loadSample:load||((c,midi,part)=>Promise.resolve({midi,buffer:{duration:4,part}})),setTimer:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:ctx.currentTime+ms/1000});return id;},clearTimer:id=>timers.delete(id),onState:(phase,mode)=>states.push({phase,mode})});
 async function advance(to){while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>to)break;ctx.currentTime=next[1].at;timers.delete(next[0]);next[1].fn();await Promise.resolve();}ctx.currentTime=to;}
 return {runtime,audio,ctx,starts,timers,states,advance,get created(){return created;}};
}
for(const bpm of [20,100,400])test('one bar pre-roll at '+bpm+' BPM leaves Project untouched and accents only the first beat',()=>{
 const p=project(bpm),before=JSON.stringify(p),r=buildCountIn(p);
 assert.equal(r.duration,240/bpm);assert.equal(r.beatSeconds,60/bpm);assert.equal(r.beats,4);
 r.events.forEach((e,i)=>assert(Math.abs(e.start-(.03+i*60/bpm))<1e-9));
 assert.deepEqual(r.events.map(e=>e.midi),[84,72,72,72]);assert(r.events[0].gain>r.events[1].gain);assert.equal(JSON.stringify(p),before);
});
test('unsupported or invalid pre-roll inputs fail without inventing a meter',()=>{
 for(const bpm of [NaN,Infinity,0,19,401,'100'])assert.throws(()=>buildCountIn(project(bpm)));
 for(const meter of [{beats:5,beatUnit:4},{beats:6,beatUnit:8},null])assert.throws(()=>buildCountIn({songInfo:{bpm:100,timeSignature:meter}}));
});
test('3/4 uses three count-in and metronome beats',()=>{
 const p=project(120);
 p.songInfo.timeSignature.beats=3;
 const count=buildCountIn(p);
 assert.equal(count.duration,1.5);
 assert.deepEqual(count.events.map(event=>event.midi),[84,72,72]);
 const plan=withMetronome(p,{events:[],spans:[{index:0,start:0,end:1.5},{index:1,start:1.5,end:3}],duration:3});
 assert.deepEqual(plan.events.map(event=>[event.barIndex,event.tick]),[[0,0],[0,480],[0,960],[1,0],[1,480],[1,960]]);
});
test('count-in and score share one context with a 10 ms guitar lead',async()=>{
 const f=fixture(),count=buildCountIn(project(400));assert((await f.runtime.playEvents(score,()=>true,.63,true,undefined,count)).ok);
 assert.equal(f.created,1);assert.equal(f.starts.filter(e=>e.part==='count').length,4);
 await f.advance(.65);assert(Math.abs(f.starts.find(e=>e.part==='guitar').t-.62)<1e-9);
 assert(f.runtime.snapshot().playing);await f.advance(1.3);assert.equal(f.runtime.snapshot().playing,false);await f.runtime.stop();assert.equal(f.audio.snapshot()[0].contextCount,0);
});
test('guitar and muted strokes advance together in song and audition while click and melody stay on the beat',async()=>{
 for(const streaming of [true,false]){
  const f=fixture();
  f.ctx.sampleRate=48000;
  const events=['click','piano','guitar','guitar','mute'].map((part,i)=>({
   part,midi:60,start:i===3?.344:i===4?.63:.33,duration:.10,gain:.1
  }));
  assert((await f.runtime.playEvents(events,()=>true,.8,streaming)).ok);
  assert.deepEqual(f.starts.map(e=>[e.part,Math.round(e.t*48000)]),
   [['click',15840],['piano',15840],['guitar',15360],['guitar',16032],['mute',29760]]);
  await f.runtime.stop();
 }
});
test('range repeats use only score duration; count clicks never repeat',async()=>{
 const f=fixture(),count=buildCountIn(project(400));assert((await f.runtime.playEvents(score,()=>true,.63,true,.6,count)).ok);await f.advance(2.5);
 assert.equal(f.created,1);assert.equal(f.starts.filter(e=>e.part==='count').length,4);
 const times=f.starts.filter(e=>e.part==='guitar').map(e=>e.t);assert(times.length>=4);times.forEach((t,i)=>assert(Math.abs(t-(.62+i*.6))<1e-8));
 await f.runtime.stop();const n=f.starts.length;await f.advance(6);assert.equal(f.starts.length,n);assert.equal(f.timers.size,0);assert.equal(f.audio.snapshot()[0].contextCount,0);
});
test('stop during asynchronous sample loading cannot revive the count or score',async()=>{
 let release;const gate=new Promise(r=>release=r),f=fixture(async(c,midi,part)=>{await gate;return {midi,buffer:{duration:4,part}};});
 const pending=f.runtime.playEvents(score,()=>true,.63,true,undefined,buildCountIn(project(400)));await Promise.resolve();await Promise.resolve();await f.runtime.stop();release();assert.equal((await pending).ok,false);assert.equal(f.starts.length,0);assert.equal(f.created,1);assert.equal(f.audio.snapshot()[0].contextCount,0);
});
test('stop and source invalidation during count release all queued voices and timers',async()=>{
 for(const stop of ['explicit','invalidated','global']){const f=fixture();let current=true;assert((await f.runtime.playEvents(score,()=>current,.63,true,undefined,buildCountIn(project(100)))).ok);if(stop==='explicit')await f.runtime.stop();else if(stop==='global')await f.audio.stopAll();else {current=false;await f.advance(.1);await new Promise(r=>setImmediate(r));}const n=f.starts.length;await f.advance(4);assert.equal(f.starts.length,n);assert.equal(f.timers.size,0);assert.equal(f.audio.snapshot()[0].contextCount,0);}
});
test('malformed pre-roll refuses before obtaining an audio resource',async()=>{
 for(const patch of [{duration:NaN},{duration:0},{duration:13},{events:[]},{events:score}]){const f=fixture(),r=await f.runtime.playEvents(score,()=>true,.63,true,undefined,{...buildCountIn(project(100)),...patch});assert.equal(r.ok,false);assert.equal(f.created,0);assert.equal(f.audio.snapshot().length,0);}
});

test('metronome preserves score timing, range period and Project while adding four clicks per real bar',()=>{
 const p=project(100),plan={events:score,spans:[{index:2,start:0,end:2.4},{index:3,start:2.4,end:4.8}],duration:4.83,loopPeriod:4.8},before=JSON.stringify([p,plan]),next=withMetronome(p,plan);
 assert.equal(JSON.stringify([p,plan]),before);assert.equal(next.duration,plan.duration);assert.equal(next.loopPeriod,4.8);assert.deepEqual(next.events.filter(e=>e.part==='guitar'),score);const clicks=next.events.filter(e=>e.part==='click');assert.equal(clicks.length,8);assert.deepEqual(clicks.map(e=>e.barIndex),[2,2,2,2,3,3,3,3]);assert.deepEqual(clicks.map(e=>e.tick),[0,480,960,1440,0,480,960,1440]);assert(clicks.every(e=>e.start+e.duration<=next.duration));
});
test('count-in runs once before repeating metronome and score on the same context',async()=>{
 const f=fixture(),p=project(400),plan=withMetronome(p,{events:score,spans:[{index:0,start:0,end:.6}],duration:.63,loopPeriod:.6});assert((await f.runtime.playEvents(plan.events,()=>true,plan.duration,true,plan.loopPeriod,buildCountIn(p))).ok);await f.advance(2.5);assert.equal(f.starts.filter(e=>e.part==='count').length,4);assert(f.starts.filter(e=>e.part==='click').length>=12);assert.equal(f.created,1);await f.runtime.stop();assert.equal(f.audio.snapshot()[0].contextCount,0);
});
