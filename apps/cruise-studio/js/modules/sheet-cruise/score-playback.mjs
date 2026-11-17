import {chordVoicing, strumVoices, fillBlankStrums} from './chord-audition.mjs';
import {createHarmonyTimeline} from './score-harmony.mjs';

// Pure, read-only score -> audio projection. Times are seconds from one audio clock.
// A blank cell is not a rest: recorded strings ring until a physical interruption.
function barPlan(project, index, deps, harmony) {
    const bar = project.bars[index], seconds = 60 / project.songInfo.bpm / 480, total = 1920 * seconds;
    if (!bar || !Number.isFinite(total) || total <= 0 || total > 60) throw Error('BPMや小節を確認してください');
    const events = [], warnings = [], cuts = [];
    if (!deps.chordsOnly) bar.melody.forEach(e => {
        if (e.kind !== 'note') return;
        const midi = deps.pitchMidi(e.pitch);
        if (!Number.isInteger(midi) || midi < 21 || midi > 108) { warnings.push('音域外のメロディは鳴らせません'); return; }
        events.push({part: 'piano', midi, start: .03 + e.onsetTick * seconds, duration: e.durationTicks * seconds,
            gain: .32, tick: e.onsetTick, sourceEventId: e.id});
    });
    if (!deps.melodyOnly) {
        const rhythm = deps.rhythm(project, index);
        let slots;
        if (rhythm?.encoding === 'studio-strum-v1') slots = rhythm.slots.slice().sort((a, b) => a.tick - b.tick);
        else if (rhythm?.encoding === 'rhythm-owner-cells-v1' && rhythm.projection?.rhythmResolved)
            slots = rhythm.projection.events.filter(e => e.sound !== 'sustain').map(e => ({tick: e.onsetTick,
                action: e.sound === 'rest' ? 'rest' : e.direction, durationTicks: e.notationDurationTicks, accent: e.accent === true}));
        else throw Error('このストローク形式は試聴未対応です。元のデータを保持しています');
        if (slots.some(s => s.tieToNext === true || !['down', 'up', 'mute', 'rest'].includes(s.action)))
            throw Error('このストロークの方向・タイは試聴未対応です');
        if (deps.fillBlankStrums) slots = deps.fillBlankStrums(slots, bar.chords.map(c => c.onsetTick));
        const fallback = slots.some(s => s.tick % 240 || s.durationTicks !== undefined && s.durationTicks % 240) ? 120 : 240;
        const chords = bar.chords.slice().sort((a, b) => a.onsetTick - b.onsetTick);
        for (const chord of chords) {
            cuts.push(.03 + chord.onsetTick * seconds);
            if (chord.durationTicks !== undefined) cuts.push(.03 + (chord.onsetTick + chord.durationTicks) * seconds);
        }
        if (!slots.length && chords.length) warnings.push('ストローク未入力のためコードは鳴りません');
        slots.forEach((slot, i) => {
            const end = Math.min(1920, slot.tick + (slot.durationTicks ?? fallback), slots[i + 1]?.tick ?? 1920);
            const duration = (end - slot.tick) * seconds, start = .03 + slot.tick * seconds;
            if (duration <= 0) return;
            if (slot.action === 'rest' || slot.action === 'mute') cuts.push(start);
            if (slot.action === 'rest') return;
            if (slot.action === 'mute') {
                events.push({part: 'mute', midi: 60, start, duration: Math.min(.085, duration), gain: slot.accent ? .18 : .14,
                    tick: slot.tick, stroke: 'mute',...(deps.tickPlan?{attackWindowTicks:end-slot.tick}:{})}); return;
            }
            try {
                const chord = harmony.at(index,slot.tick);
                if (!chord && slot.fallback) return;
                if (!chord) throw Error('コード未入力のストロークは鳴らせません');
                if (chords.includes(chord) && chords.filter(c => c.onsetTick === chord.onsetTick).length > 1)
                    throw Error('同じ位置の複数コードは試聴未対応です');
                const voicing = chordVoicing(project, chord, deps);
                if (voicing.fallback) warnings.push('登録フォームなし：コード名からの参考和音です');
                const voices=strumVoices(voicing, {start, duration: 4, attackWindow: duration, tick: slot.tick,
                    id: chord.id, direction: slot.action, accent: slot.accent});
                events.push(...(deps.tickPlan?voices.map(e=>({...e,attackWindowTicks:end-slot.tick})):voices));
            } catch (e) { warnings.push(e.message); cuts.push(start); }
        });
    }
    if (events.length > 256) throw Error('試聴する音が多すぎます');
    return {events, cuts, duration: total + .03, secondsPerTick: seconds, warnings: [...new Set(warnings)]};
}
function finishPlan(plan) {
    const cuts = [...new Set([...plan.cuts, plan.duration])].sort((a, b) => a - b);
    const ordered = plan.events.slice().sort((a, b) => a.start - b.start), nextString = new Map();
    // Reverse sweep is linear after sorting, even for 2,048 bars. Same pitch on
    // different strings remains two voices; a restruck string releases before its new attack.
    for (let i = ordered.length - 1; i >= 0; i--) {
        const e = ordered[i];
        if (e.part !== 'guitar') continue;
        let lo = 0, hi = cuts.length;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (cuts[mid] <= e.attackStart + 1e-9) lo = mid + 1; else hi = mid; }
        const key = e.string === null ? 'fallback:' + e.midi : 'string:' + e.string;
        const end = Math.min(e.start + e.duration, cuts[lo] ?? plan.duration, nextString.get(key) ?? Infinity);
        e.duration = end - e.start;
        nextString.set(key, e.start);
    }
    delete plan.cuts;
    plan.events = ordered.filter(e => e.duration > .0001 && e.start < plan.duration);
    return plan;
}
export function buildBarPreviewPlan(project, index, deps) { return finishPlan(barPlan(project, index, deps,createHarmonyTimeline(project))); }
export function buildSongPreviewPlan(project, deps, startIndex = 0, count) {
    const events = [], cuts = [], spans = [], warnings = [], harmony=createHarmonyTimeline(project); let offset = 0;
    project.bars.slice(startIndex, count === undefined ? undefined : startIndex + count).forEach((bar, n) => {
        const index = startIndex + n;
        let plan; try { plan = barPlan(project, index, deps,harmony); } catch (e) { throw Error((index + 1) + '小節目：' + e.message); }
        plan.events.forEach(e => events.push({...e, start: e.start + offset, ...(e.attackStart === undefined ? {} : {attackStart: e.attackStart + offset}), barIndex: index}));
        plan.cuts.forEach(t => cuts.push(t + offset));
        spans.push({index, start: offset, end: offset + plan.duration - .03}); offset += plan.duration - .03;
        plan.warnings.forEach(w => { if (warnings.length < 8 && !warnings.includes(w)) warnings.push(w); });
    });
    return finishPlan({events, cuts, spans, duration: offset + .03, secondsPerTick: 60 / project.songInfo.bpm / 480, warnings});
}

// Repeat the musical duration, excluding the initial Web Audio attack offset.
// The source Project and its inherited harmony remain unchanged.
export function buildRangeLoopPlan(project, deps, startIndex, count) {
    if (!Number.isInteger(startIndex) || startIndex < 0 || !Number.isInteger(count) || count < 1 || startIndex + count > project.bars.length)
        throw Error('1小節以上の連続する小節を選択してください');
    const plan = buildSongPreviewPlan(project, deps, startIndex, count);
    return {...plan, loopPeriod: plan.spans.at(-1).end};
}

// A pre-roll on the same audio clock, separate from score ticks and loop events.
export function buildCountIn(project) {
    const {bpm,timeSignature}=project.songInfo;
    if(!Number.isFinite(bpm)||bpm<20||bpm>400||timeSignature?.beats!==4||timeSignature?.beatUnit!==4)
        throw Error('カウントインのBPM・拍子を確認してください');
    const beatSeconds=60/bpm,beats=4;
    return {duration:beats*beatSeconds,beatSeconds,beats,events:Array.from({length:beats},(_,i)=>({
        part:'count',midi:i===0?84:72,start:.03+i*beatSeconds,duration:.055,gain:i===0?.16:.12
    }))};
}

export {fillBlankStrums};
// Clicks are a playback projection. They never enter chord/form/MIDI data.
export function withMetronome(project,plan){
    const {beatSeconds}=buildCountIn(project),clicks=[];
    for(const span of plan.spans||[]){
        for(let beat=0;beat<4;beat++)clicks.push({part:'click',midi:beat===0?84:72,
            start:span.start+.03+beat*beatSeconds,duration:.055,gain:beat===0?.1:.075,
            barIndex:span.index,tick:beat*480});
    }
    if(plan.events.length+clicks.length>524288)throw Error('メトロノームを含めた再生音が多すぎます');
    return {...plan,events:[...plan.events,...clicks].sort((a,b)=>a.start-b.start)};
}

// Musical boundaries remain ticks; physical pick travel and natural decay stay
// seconds. No schema mutation and no AudioNodes. The existing seconds projection
// above remains the independent oracle for fixed-tempo rendering/audition.
export function buildSongTickPlan(project,deps){
    const reference={...project,songInfo:{...project.songInfo,bpm:20}},spt=60/20/480;
    const harmony=createHarmonyTimeline(reference),events=[],cuts=[project.bars.length*1920],warnings=[];
    reference.bars.forEach((bar,index)=>{
        const p=barPlan(reference,index,{...deps,tickPlan:true},harmony),base=index*1920;
        p.cuts.forEach(t=>cuts.push(base+Math.round((t-.03)/spt)));
        p.events.forEach(e=>{
            const {start,duration,attackStart,tick,...rest}=e;
            events.push({...rest,tick:base+tick,barIndex:index,offsetSeconds:Math.max(0,start-(.03+tick*spt)),
                ...(e.part==='piano'?{durationTicks:Math.round(duration/spt)}:{naturalSeconds:e.part==='guitar'?4:.085})});
        });
        p.warnings.forEach(w=>{if(!warnings.includes(w)&&warnings.length<8)warnings.push(w);});
    });
    const orderedCuts=[...new Set(cuts)].sort((a,b)=>a-b),groups=new Map();
    for(const e of events)if(e.part==='guitar'){
        const key=[e.barIndex,e.tick,e.sourceEventId,e.stroke].join(':');
        groups.set(key,Math.max(groups.get(key)||0,e.offsetSeconds));e.group=key;
    }
    events.sort((a,b)=>a.tick-b.tick||a.offsetSeconds-b.offsetSeconds);
    const next=new Map();
    for(let i=events.length-1;i>=0;i--){const e=events[i];e.index=i;
        if(e.part!=='guitar')continue;
        e.travelSpan=groups.get(e.group)||0;delete e.group;
        let lo=0,hi=orderedCuts.length;while(lo<hi){const mid=(lo+hi)>>>1;if(orderedCuts[mid]<=e.tick)lo=mid+1;else hi=mid;}
        e.boundaryTick=orderedCuts[lo]??project.bars.length*1920;
        const key=e.string===null?'fallback:'+e.midi:'string:'+e.string;
        e.nextIndex=next.get(key)??null;next.set(key,i);
    }
    // Clicks are always available; enabling them never changes the music plan.
    for(let tick=0;tick<project.bars.length*1920;tick+=480)events.push({part:'click',midi:tick%1920===0?84:72,tick,
        offsetSeconds:0,naturalSeconds:.055,gain:tick%1920===0?.1:.075,index:events.length});
    return {events,totalTicks:project.bars.length*1920,warnings};
}
