import {startCountInSupport,COUNT_IN_PULSE_SECONDS,COUNT_IN_OUTPUT_SETTLE_SECONDS,GUITAR_LEAD_SECONDS,CONNECTED_STRUM_RELEASE,stringDampTime,metronomeSample,normalizeMetronomeSound} from '../../cruise-studio/js/modules/score-audio.mjs';
import {createOutputPosition,outputContextTime} from './output-position.mjs';
import {insist} from './json.mjs';

export function normalizePlayback(value={},originalBpm=100){
    const bpm=Number.isFinite(value.bpm)&&value.bpm>=20&&value.bpm<=400?value.bpm:originalBpm;
    return {bpm,visualDelayMs:Number.isFinite(value.visualDelayMs)?Math.max(-1000,Math.min(1000,value.visualDelayMs)):0,metronomeSound:normalizeMetronomeSound(value.metronomeSound),countIn:value.countIn===true,metronome:value.metronome!==false,
        mix:Object.fromEntries(['chords','melody','metronome'].map(k=>[k,Number.isFinite(value.mix?.[k])?Math.max(0,Math.min(100,value.mix[k])):100]))};
}
// The scheduler shifts the complete guitar envelope relative to the musical grid.
const guitarLead = event => event.part==='guitar'||event.part==='mute' ? GUITAR_LEAD_SECONDS : 0;
export function pickOffset(event,bpm){
    return event.part==='guitar'&&event.travelSpan>0?event.offsetSeconds*Math.min(1,(event.attackWindowTicks*60/bpm/480)*.28/event.travelSpan):event.offsetSeconds||0;
}
export function tickTime(sample,tick){return Math.max(sample.time,sample.anchorTime??sample.time)+(tick-sample.tick)*60/sample.bpm/480;}
function guitarDampTime(event, plan, sample, nextPick) {
    const beat = tickTime(sample,event.boundaryTick);
    if (event.pickHandoffEndTick === undefined) return beat;
    const samePitch = event.midi === plan.events[event.nextIndex].midi;
    return stringDampTime(beat, nextPick, samePitch, tickTime(sample,event.pickHandoffEndTick));
}
export function musicalEnd(event,plan,sample,attackTime){
    if(event.part==='piano')return tickTime(sample,event.tick+event.durationTicks);
    if(event.part==='guitar'){
        const next=event.nextIndex===null?null:plan.events[event.nextIndex];
        const nextPick=next?tickTime(sample,next.tick)+pickOffset(next,sample.bpm):Infinity;
        return Math.min(attackTime+4,guitarDampTime(event,plan,sample,nextPick),nextPick);
    }
    return attackTime+Math.min(event.naturalSeconds,event.attackWindowTicks?event.attackWindowTicks*60/sample.bpm/480:Infinity);
}

// Audio ownership is injected. No DOM, editor, storage, network or independent
// musical timer here. A short timer only feeds reservations from the beat clock.
export function createViewerPlayer({plan,createClock,createContext,loadSample,coordinator,
    countInSupportEnabled=()=>false,settings={},originalBpm=100,performanceTime=()=>globalThis.performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,onState=()=>{},sessionId}){
    insist(plan.events.length<=524288,'too-many-playback-events');
    let options=normalizePlayback(settings,originalBpm),phase='paused',reason=null,clock=null,context=null,handle=null,lease=null;
    let token=0,timer=null,tick=0,scan=0,countEnd=0,countBeat=0,hasStarted=false,disposed=false,closing=null;
    let range={start:0,end:plan.totalTicks,loop:false},scanIteration=0;
    let countSupport=null;
    const lookahead=.30;
    const ticksPerBar=plan.ticksPerBar??1920, countBeats=ticksPerBar/480;
    const outputPosition=createOutputPosition();
    const eventKey=(event,iteration=clock?.snapshot().iteration||0)=>iteration+':'+event.index;
    let buffers=new Map(),buses={},issued=new Set(),carry=[],nodes=new Set();
    const ordered=plan.events.slice().sort((a,b)=>a.tick-b.tick||a.offsetSeconds-b.offsetSeconds||a.index-b.index);
    const guitarAttacks = new Set(ordered.filter(event => event.part === 'guitar').map(event => event.tick));
    const tiedEntries=new Map();
    for(const event of ordered){
        for(const tick of event.tieStarts||[]){
            tiedEntries.set(tick,{...event,tick,durationTicks:event.tick+event.durationTicks-tick});
        }
    }
    function scheduleTiedEntry(start,state){
        const event=tiedEntries.get(start), key=event&&eventKey(event,state.iteration);
        if(event&&!issued.has(key)){
            issued.add(key);
            schedule(event,state);
        }
    }
    const stats={created:0,cancelledFuture:0,peakNodes:0,parts:{guitar:0,piano:0,click:0,mute:0,count:0}};
    function sample(){return clock?clock.snapshot():{status:phase,tick,time:0,bpm:options.bpm,totalTicks:plan.totalTicks,ticksPerBar,barIndex:Math.max(0,Math.min(Math.ceil(plan.totalTicks/ticksPerBar)-1,Math.floor(tick/ticksPerBar))),tickInBar:tick%ticksPerBar};}
    function snapshot(){const s=sample();outputPosition.observe({...s,phase,range});return {...s,phase,reason,settings:{...options,mix:{...options.mix}},nodes:nodes.size,contextState:context?.state||'closed',
        stats:{...stats,parts:{...stats.parts}},warnings:plan.warnings||[],countBeat:phase==='counting'?countBeat:0,range:{...range}};}
    function notify(){onState(snapshot());}
    function cancelTimer(){if(timer!==null)clearTimer(timer);timer=null;}
    function forget(voice){voice.source.onended=null;try{voice.source.disconnect();voice.gain.disconnect();}catch{}nodes.delete(voice);}
    function cancel(voice){try{voice.source.stop(context.currentTime);}catch{}forget(voice);}
    function silence(){countSupport?.cancel();countSupport=null;for(const voice of [...nodes])cancel(voice);}
    function setMix(mix){options={...options,mix:normalizePlayback({mix},options.bpm).mix};if(context)for(const [key,bus]of Object.entries(buses))bus.gain.setTargetAtTime(options.mix[key]/100,context.currentTime,.015);}
    function releaseLease(){if(lease){coordinator.release(handle,lease);lease=null;}}
    function resetScan(position){scan=0;while(scan<ordered.length&&ordered[scan].tick<position-1e-7)scan++;}
    function pause(cause='user'){
        if(disposed)return;
        token++;cancelTimer();if(phase!=='paused')carry=[];
        if(clock){const s=clock.pause(cause);tick=s.tick;
            for(const voice of nodes)if(voice.start>context.currentTime){
                issued.delete(voice.key);
                if(phase==='playing'&&voice.iteration===s.iteration&&(voice.offset>0||voice.event.tick<tick))
                    carry.push({index:voice.event.index,offset:voice.offset,delay:voice.offset>0?0:voice.start-context.currentTime,age:context.currentTime-voice.attack});
            }
            if(phase==='playing')for(const voice of nodes)if(voice.iteration===s.iteration&&voice.start<=context.currentTime&&voice.end>context.currentTime&&['guitar','piano'].includes(voice.event.part))
                carry.push({index:voice.event.index,offset:voice.offset+(context.currentTime-voice.start)*voice.rate,age:context.currentTime-voice.attack});
        }
        silence();releaseLease();phase=tick>=range.end?'ended':'paused';reason=cause;notify();
    }
    async function closeContext(){
        if(closing)return closing;
        if(!context)return;
        const old=context;outputPosition.reset();context=null;clock?.dispose();clock=null;buffers=new Map();buses={};
        closing=Promise.resolve(old.state==='closed'?undefined:old.close()).then(()=>{insist(old.state==='closed','audio-close-incomplete');coordinator.forgetContext(handle,old);}).finally(()=>{closing=null;});
        return closing;
    }
    async function cleanup(cause){pause(cause);await closeContext();}
    function register(){if(!handle)handle=coordinator.register({sessionId,ownerFeatureId:'scoreViewer',cleanup,
        notify:()=>{void cleanup('interruption').catch(()=>{});}});}
    function output(part){return buses[part==='piano'?'melody':['click','count'].includes(part)?'metronome':'chords'];}
    function envelope(voice,end,s,retime=false){
        const now=context.currentTime,start=retime?now:voice.start,duration=end-start;
        if(duration<=.0001){cancel(voice);return;}
        const event=voice.event;
        let fade = .35;
        if (event.part === 'guitar') {
            const next = plan.events[event.nextIndex];
            const rangeEnd = Math.abs(end + guitarLead(event) - tickTime(s,range.end)) < 1e-9;
            const nextPick = next ? tickTime(s,next.tick) + pickOffset(next,s.bpm) : Infinity;
            const damp = guitarDampTime(event,plan,s,nextPick);
            const samePitch = event.pickHandoffEndTick !== undefined && next.midi === event.midi;
            const shortRelease = rangeEnd ? range.loop && guitarAttacks.has(range.start)
                : !samePitch && guitarAttacks.has(event.boundaryTick) && Math.abs(end + guitarLead(event) - damp) < 1e-9;
            fade = shortRelease ? CONNECTED_STRUM_RELEASE : event.release ?? .045;
        }
        const gain=voice.gain.gain,release=Math.min(fade,duration*.35);
        if(retime){
            const level=now>voice.end-voice.release?voice.event.gain*Math.exp(Math.log(.0001/voice.event.gain)*Math.max(0,(now-(voice.end-voice.release))/Math.max(.001,voice.release))):voice.event.gain;
            gain.cancelScheduledValues(now);gain.setValueAtTime(Math.max(.0001,level),now);
            gain.setValueAtTime(Math.max(.0001,level),Math.max(now,end-release));gain.exponentialRampToValueAtTime(.0001,end);
        }else{
            gain.setValueAtTime(voice.offset?voice.event.gain:0,start);
            gain.linearRampToValueAtTime(voice.event.gain,start+Math.min(.005,duration/4));gain.setValueAtTime(voice.event.gain,Math.max(start,end-release));gain.exponentialRampToValueAtTime(.0001,end);
        }
        voice.end=end;voice.release=release;voice.source.stop(end);
    }
    function schedule(event,s,held,pendingAttack){
        if(event.part==='click'&&!options.metronome)return;
        const sourceSample=event.part==='click'?metronomeSample(context,event.midi,options.metronomeSound):buffers.get(event.part+':'+event.midi);insist(sourceSample,'missing-decoded-sample');
        const lead=guitarLead(event);
        const attack=held?Math.max(context.currentTime+.003,s.anchorTime??context.currentTime)-held.age:pendingAttack??tickTime(s,event.tick);
        let start=held?Math.max(context.currentTime+.003,s.anchorTime??context.currentTime)+(held.delay||0):attack+pickOffset(event,s.bpm)-lead;
        if(event.part==='guitar' && context.sampleRate)start=Math.round(start*context.sampleRate)/context.sampleRate;
        if(start<context.currentTime-.08)throw Error('playback-interrupted');
        const rate=Math.pow(2,(event.midi-sourceSample.midi)/12),offset=held?.offset||0;
        const end=Math.min(musicalEnd(event,plan,s,attack)-lead,event.part==='count'?Infinity:tickTime(s,range.end)-lead,start+(sourceSample.buffer.duration-offset)/rate);
        if(end<=start+.0001)return;
        insist(nodes.size<2048,'too-many-audio-nodes');
        const source=context.createBufferSource(),gain=context.createGain();source.buffer=sourceSample.buffer;source.playbackRate.setValueAtTime(rate,start);
        source.connect(gain);gain.connect(output(event.part));
        const voice={source,gain,event,start,attack,rate,offset,end,release:0,iteration:s.iteration||0,key:eventKey(event,s.iteration||0)};nodes.add(voice);
        source.onended=()=>forget(voice);source.start(Math.max(context.currentTime,start),offset);envelope(voice,end,s);
        stats.created++;stats.parts[event.part]++;stats.peakNodes=Math.max(stats.peakNodes,nodes.size);
    }
    function pump(){
        timer=null;if(disposed||!['playing','counting'].includes(phase))return;
        if(context?.state!=='running'||!coordinator.isLeaseCurrent(handle,lease)){pause('interruption');return;}
        try{
            if(phase==='counting'){
                const step=60/options.bpm;countBeat=Math.max(countSupport?0:1,Math.min(countBeats,Math.floor((context.currentTime-(countEnd-countBeats*step))/step)+1));
                // Arm the musical clock while the last count is still playing. A late
                // timer must not set the downbeat or postpone its first guitar attack.
                if(clock.snapshot().status!=='playing' && context.currentTime>=countEnd-.18){
                    clock.play({delay:Math.max(0,countEnd-context.currentTime)});
                    scheduleTiedEntry(tick,clock.snapshot());
                }
                if(context.currentTime>=countEnd){phase='playing';notify();}
            }
            if(phase==='playing'||clock.snapshot().status==='playing'){
                const s=clock.snapshot();tick=s.tick;
                if(scanIteration!==s.iteration){scanIteration=s.iteration;resetScan(s.tick);for(const key of issued)if(Number(key.split(':')[0])<s.iteration)issued.delete(key);}
                if(s.status==='ended'){pause('end');return;}
                while(scan<ordered.length){const e=ordered[scan];if(e.tick>=range.end)break;if(tickTime(s,e.tick)>context.currentTime+lookahead)break;scan++;
                    const key=eventKey(e,s.iteration);if(issued.has(key))continue;issued.add(key);schedule(e,s);
                }
                if(range.loop){const boundary=tickTime(s,range.end);if(boundary<=context.currentTime+lookahead){const next={...s,tick:range.start,time:boundary,anchorTime:boundary,iteration:s.iteration+1};scheduleTiedEntry(range.start,next);for(const e of ordered){if(e.tick<range.start)continue;if(e.tick>=range.end||tickTime(next,e.tick)>context.currentTime+lookahead)break;const key=eventKey(e,next.iteration);if(!issued.has(key)){issued.add(key);schedule(e,next);}}}}

            }
        }catch{pause('interruption');return;}
        timer=setTimer(pump,25);
    }
    async function play(){
        if(disposed||['playing','counting','loading'].includes(phase)||tick>=range.end)return false;
        if(closing){reason='audio-closing';notify();return false;}
        register();const next=coordinator.request(handle,'audio-output/session');if(!next){reason='audio-busy';notify();return false;}
        lease=next;const attempt=++token;reason=null;phase='loading';notify();
        try{
            if(!context||context.state==='closed'){
                context=createContext();coordinator.ownContext(handle,next,context);
                clock=createClock({now:()=>context.currentTime,bpm:options.bpm});if(plan.totalTicks)clock.setRange(range.start,range.end,range.loop);clock.seek(tick);
                for(const key of ['chords','melody','metronome']){const bus=context.createGain();bus.gain.setValueAtTime(options.mix[key]/100,context.currentTime);bus.connect(context.destination);buses[key]=bus;}
            }
            const ctx=context,resume=ctx.state==='running'?Promise.resolve():ctx.resume(); // user gesture, before any await
            await resume;
            if(attempt!==token||disposed||context!==ctx)return false;
            insist(ctx.state==='running'&&coordinator.isLeaseCurrent(handle,next),'audio-interrupted');
            const needed=new Map();for(const e of plan.events){const key=e.part+':'+e.midi;if(!needed.has(key))needed.set(key,loadSample(ctx,e.midi,e.part));}
            const entries=await Promise.all([...needed].map(async([key,value])=>[key,await value]));
            if(attempt!==token||disposed||context!==ctx)return false;
            insist(coordinator.grant(handle,next),'audio-interrupted');buffers=new Map(entries);resetScan(tick);scanIteration=clock.snapshot().iteration;
            if(!hasStarted&&options.countIn){
                for(const midi of [84,72])buffers.set('count:'+midi,metronomeSample(ctx,midi,options.metronomeSound,'count'));
                phase='counting';const step=60/options.bpm;
                if(countInSupportEnabled())countSupport=startCountInSupport(ctx,buses.metronome,step*countBeats);
                const start=countSupport?.firstBeat??(ctx.currentTime+COUNT_IN_OUTPUT_SETTLE_SECONDS+.03);
                countEnd=start+step*countBeats;countBeat=countSupport?0:1;
                for(let i=0;i<countBeats;i++){const e={part:'count',midi:i===0?84:72,gain:i===0?.16:.12,tick:i*480,naturalSeconds:COUNT_IN_PULSE_SECONDS};
                    schedule(e,{time:start,tick:0,bpm:options.bpm});}
            }else{
                phase='playing';clock.play({delay:.03});const s=clock.snapshot();
                for(const held of carry){const e=plan.events[held.index];schedule(e,s,held);issued.add(eventKey(e));}scheduleTiedEntry(tick,s);carry=[];
            }
            hasStarted=true;notify();pump();return true;
        }catch(error){if(attempt===token){pause('audio-error');reason='audio-error';notify();}return false;}
    }
    function setTempo(value){
        insist(Number.isFinite(value)&&value>=20&&value<=400,'invalid-practice-bpm');
        insist(!['loading','counting'].includes(phase),'wait-for-count-in');
        if(clock)clock.setTempo(value);options={...options,bpm:value};
        const now=context?.currentTime||0;
        if(phase==='playing'){
            const s=clock.snapshot(),pending=[];
            for(const voice of [...nodes])if(voice.start>now){
                if(voice.iteration===s.iteration){
                    // Held notes keep their sample position. A continuation at
                    // the range start cannot be recovered by scanning the main list.
                    if(voice.offset>0)pending.push({event:voice.event,held:{offset:voice.offset,age:now-voice.attack}});
                    else if(tiedEntries.get(voice.event.tick)===voice.event)pending.push({event:voice.event});
                    else if(voice.event.tick<s.tick)pending.push({event:voice.event,attack:voice.attack});
                }
                issued.delete(voice.key);stats.cancelledFuture++;cancel(voice);
            }
            resetScan(s.tick);
            for(const voice of [...nodes])envelope(voice,Math.min(musicalEnd(voice.event,plan,s,voice.attack)-guitarLead(voice.event),tickTime(s,range.end)-guitarLead(voice.event),voice.start+(voice.source.buffer.duration-voice.offset)/voice.rate),s,true);
            for(const reservation of pending){
                schedule(reservation.event,s,reservation.held,reservation.attack);
                issued.add(eventKey(reservation.event,s.iteration));
            }
            cancelTimer();pump();
        }
        notify();
    }
    function configure(value){
        const next=normalizePlayback({...options,...value,mix:value.mix||options.mix},options.bpm),oldMetronome=options.metronome,oldSound=options.metronomeSound;
        setMix(next.mix);options={...next,bpm:options.bpm};
        if(oldMetronome!==options.metronome){const tick=sample().tick;for(const e of ordered)if(e.part==='click'&&e.tick>tick)issued.delete(eventKey(e));}
        if((oldMetronome!==options.metronome||oldSound!==options.metronomeSound)&&phase==='playing'){
            for(const voice of [...nodes])if(voice.event.part==='click'&&voice.start>context.currentTime){issued.delete(voice.key);cancel(voice);}
            const s=clock.snapshot();for(const e of ordered)if(e.part==='click'&&e.tick>=s.tick)issued.delete(eventKey(e));resetScan(s.tick);cancelTimer();pump();
        }
        notify();
    }
    function seek(value){
        insist(Number.isFinite(value)&&value>=range.start&&value<=range.end,'invalid-seek');
        pause('seek');outputPosition.reset();tick=value;clock?.seek(value);carry=[];issued.clear();resetScan(value);hasStarted=false;phase=value===range.end?'ended':'paused';notify();
    }
    function setRange(start=0,end=plan.totalTicks,loop=false){insist(Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end>start&&end<=plan.totalTicks&&start%ticksPerBar===0&&end%ticksPerBar===0,'invalid-playback-range');const resume=['playing','counting','loading'].includes(phase);const preserve=range.start===start&&range.end===end;pause('range');const held=preserve?carry:[];outputPosition.reset();range={start,end,loop:loop===true};if(tick<start||tick>=end)tick=start;clock?.setRange(start,end,range.loop);clock?.seek(tick);carry=held;issued.clear();scanIteration=0;resetScan(tick);phase='paused';notify();return resume;}
    return Object.freeze({play,pause,setTempo,configure,seek,setRange,snapshot,visualSnapshot(){const s=snapshot();return context?outputPosition.at(s,Math.max(0,outputContextTime(context,performanceTime())-options.visualDelayMs/1000)):s;},
        async suspend(reason='visibility'){await cleanup(reason);},
        async dispose(){if(disposed)return;await cleanup('dispose');disposed=true;if(handle)await coordinator.disposeSession(handle);}
    });
}
