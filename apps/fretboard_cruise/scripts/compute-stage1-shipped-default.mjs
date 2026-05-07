/**
 * One-off: replicate buildDefaultCruiseStageSequence(1) slot output for embedding in script.js
 */
const OPEN_STRINGS = [4, 9, 2, 7, 11, 4];
const STRING_BASE_PITCHES = [40, 45, 50, 55, 59, 64];
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PRACTICE_MAX_FRET = 17;

function getStageTargets(stage) {
    const targets = [];
    for (let s = 0; s < 6; s++) {
        for (let f = 0; f <= PRACTICE_MAX_FRET; f++) {
            const noteIdx = (OPEN_STRINGS[s] + f) % 12;
            const isNat = [0, 2, 4, 5, 7, 9, 11].includes(noteIdx);
            let add = false;
            switch (stage) {
                case 1: if (f >= 0 && f <= 3 && isNat) add = true; break;
                default: break;
            }
            if (add) {
                targets.push({
                    stringIdx: s,
                    stringName: 6 - s,
                    fret: f,
                    noteIdx,
                    noteName: NOTES[noteIdx]
                });
            }
        }
    }
    return targets;
}

function getCruiseUniqueTargetsForStage(stage) {
    const targets = getStageTargets(stage).map(t => ({
        ...t,
        midiNote: STRING_BASE_PITCHES[t.stringIdx] + t.fret
    }));
    const grouped = {};
    targets.forEach(t => {
        if (!grouped[t.midiNote] || t.stringIdx < grouped[t.midiNote].stringIdx) {
            grouped[t.midiNote] = t;
        }
    });
    return Object.values(grouped).sort((a, b) => a.midiNote - b.midiNote);
}

function buildCruiseWalkSequence(uniqueTargets) {
    let startIdx = uniqueTargets.findIndex(t => t.stringName === 5 && t.fret === 3);
    if (startIdx === -1) startIdx = uniqueTargets.findIndex(t => t.stringName === 6 && t.fret === 8);
    if (startIdx === -1) startIdx = uniqueTargets.findIndex(t => t.noteIdx === 0);
    if (startIdx === -1) startIdx = 0;

    const sequence = [];
    for (let i = startIdx; i >= 0; i--) sequence.push(uniqueTargets[i]);
    for (let i = 1; i < uniqueTargets.length; i++) sequence.push(uniqueTargets[i]);
    for (let i = uniqueTargets.length - 2; i >= startIdx; i--) sequence.push(uniqueTargets[i]);
    return sequence;
}

function cruiseRouteSlotFromTarget(target) {
    return { stringName: target.stringName, fret: target.fret };
}

const uniqueTargets = getCruiseUniqueTargetsForStage(1);
const sequence = buildCruiseWalkSequence(uniqueTargets);
const slots = sequence.map(cruiseRouteSlotFromTarget);

console.log(JSON.stringify({ slotCount: slots.length, slots }, null, 2));
