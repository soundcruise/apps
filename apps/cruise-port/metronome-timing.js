import {
    METRONOME_DEFAULTS,
    METRONOME_LIMITS,
    clampInteger
} from './metronome-store.js?v=3.1.0';

export const METRONOME_METER_INFO = Object.freeze({
    '2/4': Object.freeze({ beats: 2, compound: false, label: '4分の2拍子' }),
    '3/4': Object.freeze({ beats: 3, compound: false, label: '4分の3拍子' }),
    '4/4': Object.freeze({ beats: 4, compound: false, label: '4分の4拍子' }),
    '5/4': Object.freeze({ beats: 5, compound: false, label: '4分の5拍子' }),
    '6/8': Object.freeze({ beats: 2, compound: true, label: '8分の6拍子' }),
    '9/8': Object.freeze({ beats: 3, compound: true, label: '8分の9拍子' }),
    '12/8': Object.freeze({ beats: 4, compound: true, label: '8分の12拍子' })
});

export const METRONOME_RHYTHM_INFO = Object.freeze({
    quarter: Object.freeze({ label: '4分', simpleOffsets: Object.freeze([0]), compoundOffsets: Object.freeze([0]) }),
    eighth: Object.freeze({ label: '8分', simpleOffsets: Object.freeze([0, 1 / 2]), compoundOffsets: Object.freeze([0, 1 / 3, 2 / 3]) }),
    sixteenth: Object.freeze({ label: '16分', simpleOffsets: Object.freeze([0, 1 / 4, 1 / 2, 3 / 4]), compoundOffsets: Object.freeze([0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6]) }),
    triplet: Object.freeze({ label: '3連符', simpleOffsets: Object.freeze([0, 1 / 3, 2 / 3]), compoundOffsets: null }),
    'eighth-shuffle': Object.freeze({ label: '8分シャッフル', simpleOffsets: Object.freeze([0, 2 / 3]), compoundOffsets: null }),
    'sixteenth-shuffle': Object.freeze({ label: '16分シャッフル', simpleOffsets: Object.freeze([0, 1 / 3, 1 / 2, 5 / 6]), compoundOffsets: null })
});

export function meterInfo(meter) {
    return METRONOME_METER_INFO[meter] || METRONOME_METER_INFO[METRONOME_DEFAULTS.meter];
}

export function beatsForMeter(meter) {
    return meterInfo(meter).beats;
}

export function isCompoundMeter(meter) {
    return meterInfo(meter).compound;
}

export function meterLabel(meter) {
    return meterInfo(meter).label;
}

export function isRhythmSupported(meter, rhythm) {
    const info = METRONOME_RHYTHM_INFO[rhythm];
    if (!info) return false;
    return isCompoundMeter(meter) ? Array.isArray(info.compoundOffsets) : Array.isArray(info.simpleOffsets);
}

export function compatibleRhythm(meter, rhythm) {
    if (isRhythmSupported(meter, rhythm)) return rhythm;
    return isCompoundMeter(meter) ? 'eighth' : METRONOME_DEFAULTS.rhythm;
}

export function subdivisionOffsets(meter, rhythm) {
    const normalizedRhythm = compatibleRhythm(meter, rhythm);
    const rhythmInfo = METRONOME_RHYTHM_INFO[normalizedRhythm];
    const offsets = isCompoundMeter(meter) ? rhythmInfo.compoundOffsets : rhythmInfo.simpleOffsets;
    return [...offsets];
}

export function secondsPerBeat(bpm) {
    const normalizedBpm = clampInteger(
        bpm,
        METRONOME_LIMITS.bpmMin,
        METRONOME_LIMITS.bpmMax,
        METRONOME_DEFAULTS.bpm
    );
    return 60 / normalizedBpm;
}

export function secondsPerQuarterNote(bpm, meter) {
    const beatSeconds = secondsPerBeat(bpm);
    return isCompoundMeter(meter) ? beatSeconds / 1.5 : beatSeconds;
}

export function createScheduleCursor(when = 0, beatIndex = 0, subdivisionIndex = 0) {
    return { when, beatIndex, subdivisionIndex };
}

export function describeScheduleEvent(cursor, settings) {
    const offsets = subdivisionOffsets(settings.meter, settings.rhythm);
    const subdivisionIndex = Math.max(0, Math.min(offsets.length - 1, cursor.subdivisionIndex));
    return {
        when: cursor.when,
        beatIndex: cursor.beatIndex % beatsForMeter(settings.meter),
        subdivisionIndex,
        subdivisionCount: offsets.length,
        phase: offsets[subdivisionIndex],
        isMainBeat: subdivisionIndex === 0
    };
}

export function advanceScheduleCursor(cursor, settings) {
    const offsets = subdivisionOffsets(settings.meter, settings.rhythm);
    const event = describeScheduleEvent(cursor, settings);
    const nextSubdivisionIndex = event.subdivisionIndex + 1;
    if (nextSubdivisionIndex < offsets.length) {
        return {
            when: event.when + secondsPerBeat(settings.bpm) * (offsets[nextSubdivisionIndex] - offsets[event.subdivisionIndex]),
            beatIndex: event.beatIndex,
            subdivisionIndex: nextSubdivisionIndex
        };
    }
    return {
        when: event.when + secondsPerBeat(settings.bpm) * (1 - offsets[event.subdivisionIndex]),
        beatIndex: (event.beatIndex + 1) % beatsForMeter(settings.meter),
        subdivisionIndex: 0
    };
}

export function scheduleEventsUntil(cursor, settings, horizon, maxEvents = 2048) {
    const events = [];
    let nextCursor = { ...cursor };
    while (nextCursor.when < horizon && events.length < maxEvents) {
        events.push(describeScheduleEvent(nextCursor, settings));
        nextCursor = advanceScheduleCursor(nextCursor, settings);
    }
    return { events, cursor: nextCursor };
}
