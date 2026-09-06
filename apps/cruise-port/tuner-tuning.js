const NOTE_NAMES = Object.freeze(['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']);

function preset(id, label, baseMidis) {
    return Object.freeze({ id, label, baseMidis: Object.freeze(baseMidis) });
}

export const TUNING_PRESET_LIST = Object.freeze([
    preset('standard', '標準', [40, 45, 50, 55, 59, 64]),
    preset('half-step-down', '半音下げ', [39, 44, 49, 54, 58, 63]),
    preset('whole-step-down', '1音下げ', [38, 43, 48, 53, 57, 62]),
    preset('drop-d', 'Drop D', [38, 45, 50, 55, 59, 64]),
    preset('double-drop-d', 'Double Drop D', [38, 45, 50, 55, 59, 62]),
    preset('dadgad', 'DADGAD', [38, 45, 50, 55, 57, 62]),
    preset('open-g', 'Open G', [38, 43, 50, 55, 59, 62]),
    preset('open-d', 'Open D', [38, 45, 50, 54, 57, 62]),
    preset('open-e', 'Open E', [40, 47, 52, 56, 59, 64]),
    preset('open-c', 'Open C', [36, 43, 48, 55, 60, 64])
]);

export const TUNING_PRESETS = Object.freeze(Object.fromEntries(
    TUNING_PRESET_LIST.map((entry) => [entry.id, entry])
));

export const TUNER_CAPO_MIN = 0;
export const TUNER_CAPO_MAX = 12;

export function isValidTuningId(tuningId) {
    return Object.prototype.hasOwnProperty.call(TUNING_PRESETS, tuningId);
}

export function isValidCapo(capo) {
    return Number.isInteger(capo) && capo >= TUNER_CAPO_MIN && capo <= TUNER_CAPO_MAX;
}

export function midiToNoteInfo(midi) {
    if (!Number.isInteger(midi) || midi < 0 || midi > 127) return null;
    const noteName = NOTE_NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return {
        midi,
        noteName,
        octave,
        note: `${noteName}${octave}`,
        targetFrequency: 440 * (2 ** ((midi - 69) / 12))
    };
}

export function getTuningTargets(tuningId, capo) {
    if (!isValidTuningId(tuningId) || !isValidCapo(capo)) return null;
    // Capo mode is for tuning while the capo remains attached, so every open-string target rises numerically.
    return TUNING_PRESETS[tuningId].baseMidis.map((baseMidi, index) => Object.freeze({
        string: 6 - index,
        baseMidi,
        ...midiToNoteInfo(baseMidi + capo)
    }));
}

export function findTargetString(targets, noteName, octave) {
    if (!Array.isArray(targets)) return null;
    return targets.find((target) => target.noteName === noteName && target.octave === octave) || null;
}
