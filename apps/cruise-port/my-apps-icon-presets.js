const PRESET_DEFINITIONS = [
    ['guitar-acoustic', 'アコースティックギター'],
    ['guitar-electric', 'エレキギター'],
    ['microphone', 'マイク'],
    ['headphones', 'ヘッドホン'],
    ['note', '音符'],
    ['chord', 'コード／和音'],
    ['ear', '耳'],
    ['waveform', '波形'],
    ['equalizer', 'EQ'],
    ['mixer', 'ミキサー'],
    ['recording', '録音'],
    ['speaker', 'スピーカー'],
    ['piano', 'ピアノ／鍵盤'],
    ['drums', 'ドラム'],
    ['rhythm', 'リズム'],
    ['metronome', 'メトロノーム'],
    ['tuner', 'チューナー'],
    ['sheet-music', '楽譜'],
    ['vocal', 'ボーカル／歌'],
    ['daw', '音楽制作／DAW'],
    ['loop', 'ループ'],
    ['audio-file', 'ファイル／音源']
];

export const MY_APPS_ICON_PRESETS = Object.freeze(PRESET_DEFINITIONS.map(([key, label, source]) => Object.freeze({
    key,
    label,
    src: key === 'rhythm'
        ? './assets/my-app-icons/rhythm.png?v=0.11.3'
        : `./assets/my-app-icons/${key}.png`
})));

const PRESET_BY_KEY = new Map(MY_APPS_ICON_PRESETS.map((preset) => [preset.key, preset]));

export function getMyAppsIconPreset(key) {
    return PRESET_BY_KEY.get(key) || null;
}

export function isKnownMyAppsIconPreset(key) {
    return typeof key === 'string' && PRESET_BY_KEY.has(key);
}

/**
 * Returns an approved local raster asset. Unknown keys
 * intentionally return null so callers can keep their generic fallback.
 */
export function createMyAppsPresetGraphic(key, { onAssetError } = {}) {
    const preset = getMyAppsIconPreset(key);
    if (!preset) return null;
    const image = document.createElement('img');
    image.src = preset.src;
    image.alt = '';
    image.decoding = 'async';
    image.setAttribute('aria-hidden', 'true');
    if (typeof onAssetError === 'function') image.onerror = onAssetError;
    return image;
}

// Kept for compatibility with older callers. Presets are now all raster;
// this legacy factory intentionally returns null.
export function createMyAppsPresetSvg(key) {
    void key;
    return null;
}
