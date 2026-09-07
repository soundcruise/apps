const SVG_NS = 'http://www.w3.org/2000/svg';

export const MY_APPS_ICON_PRESETS = Object.freeze([
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
].map(([key, label]) => Object.freeze({ key, label })));

const PRESET_BY_KEY = new Map(MY_APPS_ICON_PRESETS.map((preset) => [preset.key, preset]));

export function getMyAppsIconPreset(key) {
    return PRESET_BY_KEY.get(key) || null;
}

export function isKnownMyAppsIconPreset(key) {
    return typeof key === 'string' && PRESET_BY_KEY.has(key);
}

function element(name, attributes = {}) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([attribute, value]) => node.setAttribute(attribute, String(value)));
    return node;
}

function append(svg, name, attributes) {
    const node = element(name, attributes);
    svg.append(node);
    return node;
}

function line(svg, x1, y1, x2, y2, attributes = {}) {
    return append(svg, 'line', { x1, y1, x2, y2, ...attributes });
}

function circle(svg, cx, cy, r, attributes = {}) {
    return append(svg, 'circle', { cx, cy, r, ...attributes });
}

function rect(svg, x, y, width, height, attributes = {}) {
    return append(svg, 'rect', { x, y, width, height, ...attributes });
}

function path(svg, d, attributes = {}) {
    return append(svg, 'path', { d, ...attributes });
}

function polyline(svg, points, attributes = {}) {
    return append(svg, 'polyline', { points, ...attributes });
}

function drawIcon(svg, key) {
    switch (key) {
    case 'guitar-acoustic':
        circle(svg, 25, 40, 11); circle(svg, 39, 25, 8); circle(svg, 25, 40, 3);
        line(svg, 31, 34, 47, 18); line(svg, 45, 16, 53, 8); line(svg, 47, 21, 54, 14);
        break;
    case 'guitar-electric':
        path(svg, 'M22 45c-5-5-5-14 2-18l8-4 5 5 8-4c5-2 10 2 10 7 0 4-3 7-7 7l-7 1-6 9c-4 6-10 4-13-3Z');
        line(svg, 35, 25, 49, 11); line(svg, 46, 10, 55, 10); line(svg, 50, 15, 57, 15); circle(svg, 30, 36, 2);
        break;
    case 'microphone':
        rect(svg, 25, 10, 14, 27, { rx: 7 }); path(svg, 'M19 29v2a13 13 0 0 0 26 0v-2'); line(svg, 32, 44, 32, 54); line(svg, 23, 54, 41, 54);
        break;
    case 'headphones':
        path(svg, 'M15 34v-4a17 17 0 0 1 34 0v4'); rect(svg, 12, 32, 10, 16, { rx: 4 }); rect(svg, 42, 32, 10, 16, { rx: 4 });
        break;
    case 'note':
        line(svg, 39, 13, 39, 43); line(svg, 39, 14, 53, 10); line(svg, 39, 25, 53, 21); circle(svg, 31, 45, 6); circle(svg, 45, 40, 6);
        break;
    case 'chord':
        circle(svg, 20, 41, 5); circle(svg, 32, 31, 5); circle(svg, 45, 41, 5); line(svg, 20, 36, 32, 26); line(svg, 32, 26, 45, 36); line(svg, 20, 46, 45, 46);
        break;
    case 'ear':
        path(svg, 'M42 46c0 6-5 9-10 9-6 0-9-4-9-9 0-8 8-9 8-17 0-4-3-6-6-6-4 0-7 3-7 7'); path(svg, 'M17 30C17 17 26 10 37 10c10 0 17 8 17 18 0 11-6 15-12 18');
        break;
    case 'waveform':
        polyline(svg, '10,32 17,32 22,18 28,47 34,12 40,43 46,25 50,32 54,32');
        break;
    case 'equalizer':
        line(svg, 18, 13, 18, 51); line(svg, 32, 13, 32, 51); line(svg, 46, 13, 46, 51); circle(svg, 18, 25, 4); circle(svg, 32, 40, 4); circle(svg, 46, 20, 4);
        break;
    case 'mixer':
        rect(svg, 12, 13, 40, 38, { rx: 5 }); line(svg, 21, 20, 21, 43); line(svg, 32, 20, 32, 43); line(svg, 43, 20, 43, 43); circle(svg, 21, 28, 3); circle(svg, 32, 38, 3); circle(svg, 43, 24, 3);
        break;
    case 'recording':
        circle(svg, 32, 32, 12, { class: 'icon-accent' }); circle(svg, 32, 32, 21); line(svg, 32, 8, 32, 13); line(svg, 32, 51, 32, 56);
        break;
    case 'speaker':
        path(svg, 'M13 27h10l13-11v32L23 37H13Z'); path(svg, 'M43 25c3 4 3 10 0 14'); path(svg, 'M49 19c7 8 7 18 0 26');
        break;
    case 'piano':
        rect(svg, 11, 15, 42, 34, { rx: 4 }); line(svg, 18, 15, 18, 49); line(svg, 25, 15, 25, 49); line(svg, 32, 15, 32, 49); line(svg, 39, 15, 39, 49); line(svg, 46, 15, 46, 49); rect(svg, 21, 15, 4, 18, { fill: 'currentColor' }); rect(svg, 35, 15, 4, 18, { fill: 'currentColor' });
        break;
    case 'drums':
        path(svg, 'M14 31h20l-4 15H18Z'); path(svg, 'M38 26h13l-3 12h-8Z'); line(svg, 11, 25, 25, 18); line(svg, 39, 19, 53, 25); line(svg, 22, 46, 22, 53); line(svg, 45, 38, 45, 53);
        break;
    case 'rhythm':
        circle(svg, 32, 32, 21); line(svg, 32, 19, 32, 32); line(svg, 32, 32, 43, 38); circle(svg, 32, 32, 2, { class: 'icon-accent' });
        break;
    case 'metronome':
        path(svg, 'M23 13h18l9 39H14l9-39Z'); line(svg, 19, 52, 45, 52); line(svg, 32, 43, 40, 17); line(svg, 36, 29, 43, 31); line(svg, 22, 43, 42, 43);
        break;
    case 'tuner':
        path(svg, 'M13 45a20 20 0 0 1 38 0'); line(svg, 17, 45, 47, 45); line(svg, 21, 35, 17, 31); line(svg, 32, 29, 32, 22); line(svg, 43, 35, 47, 31); line(svg, 32, 43, 40, 31, { class: 'icon-accent' }); circle(svg, 32, 43, 2, { class: 'icon-accent' });
        break;
    case 'sheet-music':
        rect(svg, 16, 10, 32, 44, { rx: 3 }); line(svg, 22, 23, 42, 23); line(svg, 22, 29, 42, 29); line(svg, 22, 35, 42, 35); line(svg, 22, 41, 42, 41); line(svg, 37, 16, 37, 35); circle(svg, 33, 37, 3);
        break;
    case 'vocal':
        path(svg, 'M18 39c4 7 9 10 14 10s10-3 14-10'); path(svg, 'M24 27c0-7 4-12 8-12s8 5 8 12-4 12-8 12-8-5-8-12Z'); line(svg, 32, 49, 32, 55);
        break;
    case 'daw':
        rect(svg, 11, 14, 42, 36, { rx: 5 }); line(svg, 18, 24, 18, 42); line(svg, 27, 20, 27, 42); line(svg, 36, 27, 36, 42); line(svg, 45, 22, 45, 42); circle(svg, 18, 28, 2); circle(svg, 27, 35, 2); circle(svg, 36, 31, 2); circle(svg, 45, 26, 2);
        break;
    case 'loop':
        path(svg, 'M19 24a16 16 0 0 1 27-3'); polyline(svg, '43,15 47,23 38,23'); path(svg, 'M45 40a16 16 0 0 1-27 3'); polyline(svg, '21,49 17,41 26,41');
        break;
    case 'audio-file':
        path(svg, 'M20 10h20l8 8v36H20Z'); polyline(svg, '40,10 40,18 48,18'); polyline(svg, '25,38 29,38 32,29 36,45 40,34 44,34');
        break;
    default:
        return false;
    }
    return true;
}

export function createMyAppsPresetSvg(key) {
    if (!isKnownMyAppsIconPreset(key)) return null;
    const svg = element('svg', {
        viewBox: '0 0 64 64',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2.2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
        focusable: 'false'
    });
    drawIcon(svg, key);
    return svg;
}
