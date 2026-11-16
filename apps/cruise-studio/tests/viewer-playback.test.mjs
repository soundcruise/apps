import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {viewerFixture} from './helpers/viewer-fixture.mjs';
import {createViewerPlayer,pickOffset,tickTime,musicalEnd} from '../../score-viewer/core/audio-player.mjs';
import {createScrollMap,smoothFollow} from '../../score-viewer/core/scroll-follow.mjs';
import {createPresetCodec} from '../../score-viewer/core/preset.mjs';
const require=createRequire(import.meta.url),{createCoordinator}=require('../js/core/audio-coordinator.js');
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);

for(const bpm of [20,50,100,120,400])test('tick plan matches existing acoustic projection at BPM '+bpm,()=>{
    const {score,contract}=viewerFixture(),before=JSON.stringify(score),plan=contract.tickPlan(score),sample={time:.03,anchorTime:.03,tick:0,bpm};
    const actual=plan.events.filter(e=>e.part!=='click').map(e=>{const attack=tickTime(sample,e.tick),start=attack+pickOffset(e,bpm);return {part:e.part,midi:e.midi,string:e.string,start,end:musicalEnd(e,plan,sample,attack),gain:e.gain};}).filter(e=>e.end-e.start>.0001).sort((a,b)=>a.start-b.start);
    const expected=contract.playbackPlan(score,{bpm}).events;
    assert.equal(actual.length,expected.length);
    actual.forEach((e,i)=>{const old=expected[i];assert.equal(e.part,old.part);assert.equal(e.midi,old.midi);assert.equal(e.string,old.string);near(e.start,old.start);near(e.end,old.start+old.duration);near(e.gain,old.gain);});
    assert.equal(JSON.stringify(score),before);
});
function fake(){
    const {score,contract}=viewerFixture(),coordinator=createCoordinator(),sources=[],contexts=[],timers=new Map();let id=0,current=null,delay=null;
    const param=()=>({value:1,setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},cancelScheduledValues(){}});
    const createContext=()=>{current={state:'running',currentTime:0,destination:{},sampleRate:48000,
        resume:async()=>{current.state='running';},close:async()=>{current.state='closed';},
        createGain:()=>({gain:param(),connect(){},disconnect(){}}),
        createBufferSource(){const s={playbackRate:param(),buffer:null,started:false,stoppedAt:Infinity,connect(){},disconnect(){},
            start(time,offset=0){this.started=true;this.startTime=time;this.offset=offset;},stop(time){assert(this.started);this.stoppedAt=time;}};sources.push(s);return s;}};contexts.push(current);return current;};
    const player=createViewerPlayer({plan:contract.tickPlan(score),createClock:opts=>contract.createClock(score,opts),createContext,
        coordinator,sessionId:'viewer-test',loadSample:async(ctx,midi)=>{if(delay)await delay;return {midi,buffer:{duration:8,midi}};},
        setTimer(fn,ms){const key=++id;timers.set(key,{fn,time:current.currentTime+ms/1000});return key;},clearTimer:key=>timers.delete(key),originalBpm:score.songInfo.bpm});
    function advance(seconds){const end=current.currentTime+seconds;while(true){const next=[...timers].sort((a,b)=>a[1].time-b[1].time)[0];if(!next||next[1].time>end)break;current.currentTime=next[1].time;for(const s of sources)if(!s.ended&&s.stoppedAt<=current.currentTime){s.ended=true;s.onended?.();}timers.delete(next[0]);next[1].fn();}current.currentTime=end;}
    return {player,sources,contexts,coordinator,advance,timers,get ctx(){return current;},delay:p=>delay=p};
}
test('streaming nodes stay bounded; tempo change preserves tick/pitch and cancels pending reservations',async()=>{
    const f=fake();assert(await f.player.play());f.advance(.04);const before=f.player.snapshot(),started=f.sources.filter(s=>s.startTime<=f.ctx.currentTime&&!s.ended),pending=f.sources.filter(s=>s.startTime>f.ctx.currentTime&&!s.ended);
    f.player.setTempo(200);near(f.player.snapshot().tick,before.tick);assert(started.every(s=>s.playbackRate.value===1));assert(pending.every(s=>s.stoppedAt<=f.ctx.currentTime));
    assert(f.player.snapshot().stats.cancelledFuture>0);f.advance(3);assert.equal(f.player.snapshot().phase,'playing');assert(f.player.snapshot().nodes<100);assert(f.player.snapshot().stats.parts.guitar>0&&f.player.snapshot().stats.parts.piano>0);
    await f.player.dispose();assert.equal(f.player.snapshot().nodes,0);assert.equal(f.timers.size,0);assert.equal(f.ctx.state,'closed');assert.deepEqual(f.coordinator.snapshot(),[]);
});
test('pause/resume holds the beat and resumes ringing notes from sample tails, not their attack',async()=>{
    const f=fake();await f.player.play();f.advance(.3);f.player.pause();const tick=f.player.snapshot().tick,created=f.sources.length;
    f.advance(10);near(f.player.snapshot().tick,tick);await f.player.play();near(f.player.snapshot().tick,tick);
    assert(f.sources.slice(created).some(s=>s.offset>0));f.advance(.2);assert(f.player.snapshot().tick>tick);await f.player.dispose();
});
test('tempo changes and pauses midway through a pick sweep never lose its pending strings',async()=>{
    for(const action of ['tempo','pause']){
        const f=fake();await f.player.play();f.advance(.034);
        const pending=f.sources.filter(s=>s.startTime>f.ctx.currentTime&&s.buffer.midi<60);
        assert(pending.length>0);const expected=pending.map(s=>s.buffer.midi).sort(),created=f.sources.length;
        if(action==='tempo')f.player.setTempo(200);else{f.player.pause();f.advance(1);await f.player.play();}
        const replaced=f.sources.slice(created).filter(s=>s.buffer.midi<60&&!s.offset).map(s=>s.buffer.midi).sort();
        assert.deepEqual(replaced,expected,action);f.advance(.2);assert.equal(f.player.snapshot().phase,'playing');await f.player.dispose();
    }
});
test('count-in runs once before an explicit start; pausing cancels all future counts',async()=>{
    const f=fake();f.player.configure({countIn:true});await f.player.play();assert.equal(f.player.snapshot().phase,'counting');assert.equal(f.player.snapshot().stats.parts.count,4);near(f.player.snapshot().tick,0);
    f.advance(2.6);assert.equal(f.player.snapshot().phase,'playing');f.player.pause();const count=f.player.snapshot().stats.parts.count;await f.player.play();assert.equal(f.player.snapshot().stats.parts.count,count);
    f.player.seek(0);await f.player.play();assert.equal(f.player.snapshot().phase,'counting');f.player.pause();assert.equal(f.player.snapshot().nodes,0);await f.player.dispose();
});
test('global stop and visibility interruption cancel delayed starts and retain position',async()=>{
    const f=fake();let resolve;f.delay(new Promise(r=>resolve=r));const pending=f.player.play();await Promise.resolve();await f.coordinator.stopAll();resolve();assert.equal(await pending,false);assert.equal(f.player.snapshot().nodes,0);
    f.delay(null);await f.player.play();f.advance(.2);const tick=f.player.snapshot().tick;await f.player.suspend('visibility');near(f.player.snapshot().tick,tick);assert.equal(f.ctx.state,'closed');await f.player.play();near(f.player.snapshot().tick,tick);await f.player.dispose();
});
test('all-muted audio still advances; end stops without looping and seek is explicit',async()=>{
    const f=fake();f.player.configure({mix:{chords:0,melody:0,metronome:0},metronome:true});await f.player.play();f.advance(30);
    assert.equal(f.player.snapshot().phase,'ended');assert.equal(f.player.snapshot().nodes,0);assert.equal(await f.player.play(),false);f.player.seek(0);assert(await f.player.play());await f.player.dispose();
});
test('scroll map continuously interpolates musical rows, including silent bars, without stepping at bars',()=>{
    const map=createScrollMap([{startTick:0,top:100,bottom:300},{startTick:3840,top:400,bottom:650},{startTick:5760,top:700,bottom:900}],7680);
    near(map.target(1920,300,1000),150);near(map.target(3840,300,1000),300);assert(map.target(3839,300,1000)<map.target(3841,300,1000));
    assert.equal(map.target(7680,300,500),500);assert(smoothFollow(0,100,.016)>0&&smoothFollow(0,100,.016)<100);
});
test('portable presets carry display only, no document IDs, row anchors, tempo, mix or position',()=>{
    const {score,contract}=viewerFixture(),codec=createPresetCodec(contract.normalizePresentation),presentation=contract.normalizePresentation({layout:{lyricsSize:20,appearance:{visibility:{chords:false}}},rows:[{barId:score.bars[0].id,columns:4,used:3}],zoom:1.2,flow:'source'},score).value;
    const result=codec.encode('ライブ用',presentation,score),decoded=codec.decode(result.text,score);assert.equal(decoded.presentation.layout.lyricsSize,20);assert.equal(decoded.presentation.zoom,1.2);assert.equal(decoded.presentation.rows,undefined);assert(!result.text.includes(score.projectId));
    for(const change of [p=>p.bpm=50,p=>p.presentation.mix={},p=>p.formatVersion=2]){const p=JSON.parse(result.text);change(p);assert.throws(()=>codec.decode(JSON.stringify(p),score));}
    assert.throws(()=>codec.decode(new Uint8Array([255]),score));assert.throws(()=>codec.decode(' '.repeat(65537),score));
});
