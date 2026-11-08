export const PRACTICE_NAME_PRESET_CUSTOM = 'custom';

export const PRACTICE_NAME_PRESETS = Object.freeze([
    Object.freeze({ value: PRACTICE_NAME_PRESET_CUSTOM, label: '自由記入' }),
    Object.freeze({ value: 'pitch', label: '音感クルーズ', appId: 'pitch' }),
    Object.freeze({ value: 'rhythm', label: 'リズムクルーズ', appId: 'rhythm' }),
    Object.freeze({ value: 'fretboard', label: '指板クルーズ', appId: 'fretboard' }),
    Object.freeze({ value: 'chord', label: 'コードクルーズ', appId: 'chord' }),
    Object.freeze({ value: 'basic', label: '基礎練習' }),
    Object.freeze({ value: 'scale', label: 'スケール練' }),
    Object.freeze({ value: 'song', label: '曲練' }),
    Object.freeze({ value: 'composition', label: '作曲' }),
    Object.freeze({ value: 'score', label: '譜面作り' })
]);

export function getPracticeNamePreset(value) {
    return PRACTICE_NAME_PRESETS.find((preset) => preset.value === value) || PRACTICE_NAME_PRESETS[0];
}
