const SVG_NS = 'http://www.w3.org/2000/svg';

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
    ['rhythm', 'リズム', null],
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
    src: source === null ? null : `./assets/my-app-icons/${key}.png`
})));

const PRESET_BY_KEY = new Map(MY_APPS_ICON_PRESETS.map((preset) => [preset.key, preset]));

export function getMyAppsIconPreset(key) {
    return PRESET_BY_KEY.get(key) || null;
}

export function isKnownMyAppsIconPreset(key) {
    return typeof key === 'string' && PRESET_BY_KEY.has(key);
}

function createRhythmSvg() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '32');
    circle.setAttribute('cy', '32');
    circle.setAttribute('r', '21');

    const hand = document.createElementNS(SVG_NS, 'path');
    hand.setAttribute('d', 'M32 19v13l11 6');

    const pivot = document.createElementNS(SVG_NS, 'circle');
    pivot.setAttribute('cx', '32');
    pivot.setAttribute('cy', '32');
    pivot.setAttribute('r', '2');
    pivot.setAttribute('class', 'icon-accent');

    svg.append(circle, hand, pivot);
    return svg;
}

/**
 * Returns the approved local raster asset, or the sole SVG exception for
 * `rhythm`, which is absent from every approved image sheet. Unknown keys
 * intentionally return null so callers can keep their generic fallback.
 */
export function createMyAppsPresetGraphic(key, { onAssetError } = {}) {
    const preset = getMyAppsIconPreset(key);
    if (!preset) return null;
    if (!preset.src) return createRhythmSvg();

    const image = document.createElement('img');
    image.src = preset.src;
    image.alt = '';
    image.decoding = 'async';
    image.setAttribute('aria-hidden', 'true');
    if (typeof onAssetError === 'function') image.onerror = onAssetError;
    return image;
}

// Kept for internal compatibility with the former SVG factory. Only the
// source-sheet-missing rhythm preset needs this vector fallback now.
export function createMyAppsPresetSvg(key) {
    return key === 'rhythm' ? createRhythmSvg() : null;
}
