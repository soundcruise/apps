import {insist, freeze, assertJSON, clone} from './json.mjs';

// now() is seconds from ONE injected monotonic clock: AudioContext.currentTime
// when audio is enabled, performance.now()/1000 for silent viewing. No RAF/timer,
// Date.now, DOM, audio node, editor, storage or network ownership in this module.
export function createBeatClock({now, bpm, barIds, ticksPerBeat = 480, beatsPerBar = 4}) {
    insist(typeof now === 'function', 'missing-monotonic-clock');
    insist(ticksPerBeat === 480 && [3,4].includes(beatsPerBar), 'unsupported-meter');
    insist(Array.isArray(barIds) && barIds.length <= 2048 && new Set(barIds).size === barIds.length &&
        barIds.every(id => typeof id === 'string' && id.length > 0), 'invalid-clock-bars');
    barIds = barIds.slice();
    const ticksPerBar = ticksPerBeat * beatsPerBar, totalTicks = barIds.length * ticksPerBar;
    let status = 'paused', tick = 0, anchorTime, lastTime = -Infinity, generation = 0, positionVersion = 0, reason = null;
    let rangeStart=0,rangeEnd=totalTicks,loop=false,iteration=0;
    function tempo(value) { insist(Number.isFinite(value) && value >= 20 && value <= 400, 'invalid-practice-bpm'); return value; }
    bpm = tempo(bpm);
    function time() {
        const value = now();
        insist(Number.isFinite(value) && value >= lastTime, 'non-monotonic-clock');
        lastTime = value; return value;
    }
    function live() { insist(status !== 'disposed', 'clock-disposed'); }
    function sample(t) {
        if (status === 'playing') {
            const position = tick + Math.max(0,t - anchorTime) * bpm / 60 * ticksPerBeat;
            if(position>=rangeEnd){
                if(loop&&rangeEnd>rangeStart){iteration+=1+Math.floor((position-rangeEnd)/(rangeEnd-rangeStart));tick=rangeStart+(position-rangeEnd)%(rangeEnd-rangeStart);anchorTime=t;generation++;return tick;}
                tick=rangeEnd;anchorTime=t;status='ended';generation++;reason='end';
            }
            return Math.min(rangeEnd,position);
        }
        return tick;
    }
    function snapshot() {
        live(); const atTime = time(), atTick = sample(atTime);
        const index = barIds.length ? Math.min(barIds.length - 1, Math.floor(atTick / ticksPerBar)) : -1;
        return Object.freeze({status, reason, generation, positionVersion, anchorTick:tick,anchorTime, bpm, tick:atTick, time:atTime,
            barId:barIds[index] ?? null, barIndex:index, tickInBar:index < 0 ? 0 : atTick - index * ticksPerBar,
            totalTicks, ticksPerBeat, ticksPerBar,rangeStart,rangeEnd,loop,iteration});
    }
    function play({delay=0}={}) {
        insist(Number.isFinite(delay)&&delay>=0&&delay<=.2,'invalid-clock-delay');
        live(); const t = time(); sample(t);
        if (status !== 'playing' && tick < rangeEnd) { anchorTime = t+delay; status = 'playing'; reason = null; generation++; }
        return snapshot();
    }
    function pause(cause = 'user') {
        live(); const t = time(), at = sample(t);
        if (status === 'playing') { tick = at; anchorTime = t; status = 'paused'; reason = cause; generation++; }
        return snapshot();
    }
    function setTempo(value) {
        live(); value = tempo(value); const t = time(), at = sample(t);
        if (value !== bpm) { tick = at; anchorTime = t; bpm = value; generation++; }
        return snapshot();
    }
    function seek(value) {
        live(); insist(Number.isFinite(value) && value >= rangeStart && value <= rangeEnd, 'invalid-seek-tick');
        const t = time(); sample(t); insist(status !== 'playing', 'pause-before-seek');
        tick = value; iteration=0; anchorTime = t; status = value === rangeEnd ? 'ended' : 'paused'; reason = null; generation++; positionVersion++;
        return snapshot();
    }
    function setRange(start=0,end=totalTicks,repeat=false){live();insist(status!=='playing','pause-before-range');insist(Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end>start&&end<=totalTicks,'invalid-playback-range');rangeStart=start;rangeEnd=end;loop=repeat===true;iteration=0;if(tick<start||tick>=end)tick=start;status='paused';generation++;positionVersion++;return snapshot();}
    // Time mapping is tied to a generation. Consumers must cancel not-yet-started
    // reservations from an earlier generation after tempo/pause/seek/end/dispose.
    function timeAtTick(value, expectedGeneration) {
        const s = snapshot();
        insist(s.status === 'playing' && s.generation === expectedGeneration, 'stale-clock-generation');
        insist(Number.isFinite(value) && value >= s.tick && value <= rangeEnd, 'tick-outside-future');
        return Math.max(s.time,anchorTime) + (value - s.tick) * 60 / bpm / ticksPerBeat;
    }
    function valid(reservation) { return status !== 'disposed' && snapshot().status === 'playing' && reservation?.generation === generation; }
    return Object.freeze({snapshot, play, pause, setTempo, seek, setRange, timeAtTick, valid,
        dispose() { if (status !== 'disposed') { status = 'disposed'; generation++; } }});
}

// A score position index excludes visual holes/padding completely. Both the
// audio scheduler and scroll interpolation consume these same tick boundaries.
export function createScoreTimeline(score) {
    insist(score.schemaVersion === 2 && score.songInfo.ticksPerBeat === 480 &&
        [3,4].includes(score.songInfo.timeSignature.beats) && score.songInfo.timeSignature.beatUnit === 4, 'unsupported-meter');
    const ticksPerBar=score.songInfo.timeSignature.beats*480;
    return freeze({ticksPerBeat:480, ticksPerBar, totalTicks:score.bars.length*ticksPerBar,
        bars:score.bars.map((b, index) => ({barId:b.id, index, startTick:index*ticksPerBar, endTick:(index+1)*ticksPerBar}))});
}

// Deterministic reservation cursor, not an AudioNode scheduler. Consumers
// attach cancellation handles to these tickets; stale tickets are never valid.
export function createEventCursor(clock, input) {
    assertJSON(input);
    insist(Array.isArray(input) && input.every(e => Number.isFinite(e.tick) && e.tick >= 0), 'invalid-tick-events');
    const events = freeze(clone(input).map((e, index) => ({...e, index})).sort((a, b) => a.tick - b.tick || a.index - b.index));
    let generation = -1, positionVersion = -1, iteration=-1, next = 0, reserved = [], consumed = new Set();
    return Object.freeze({collect(lookaheadSeconds = .1) {
        insist(Number.isFinite(lookaheadSeconds) && lookaheadSeconds > 0 && lookaheadSeconds <= .5, 'invalid-lookahead');
        const s = clock.snapshot();
        if (s.status !== 'playing') return [];
        if (s.generation !== generation) {
            if (positionVersion !== s.positionVersion || iteration!==s.iteration) consumed.clear();
            else for (const e of reserved) if (e.tick <= s.anchorTick) consumed.add(e.index);
            positionVersion = s.positionVersion; iteration=s.iteration; reserved = [];
            generation = s.generation; next = 0;
            // Events at the current tick are included once in this generation;
            // past events are never replayed after a tempo change or resumption.
            while (next < events.length && events[next].tick < s.anchorTick) next++;
        }
        const end = Math.min(s.rangeEnd??s.totalTicks, s.tick + lookaheadSeconds * s.bpm / 60 * s.ticksPerBeat), result = [];
        while (next < events.length && events[next].tick <= end && events[next].tick < (s.rangeEnd??s.totalTicks)) {
            const event = events[next++];
            if (consumed.has(event.index)) continue;
            // Derive from this ONE sample, avoiding another clock read per note.
            reserved.push(event);
            result.push(Object.freeze({event, generation, time:Math.max(s.time, Math.max(s.time, s.anchorTime??s.time) + (event.tick - s.tick) * 60 / s.bpm / s.ticksPerBeat)}));
        }
        return result;
    }});
}
