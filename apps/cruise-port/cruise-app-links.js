import { getEdition } from './cruise-port-edition.js?v=0.26.0';

// Single URL catalog for Home and Practice. Stored builtin appIds stay stable.
const CRUISE_APPS = Object.freeze({
    pitch: Object.freeze({ name: '音感クルーズ', directory: 'pitch-cruise', pro: 'pro_x9v7q2m8' }),
    fretboard: Object.freeze({ name: '指板クルーズ', directory: 'fretboard_cruise', pro: 'pro_a9f4k7q2m8z' }),
    rhythm: Object.freeze({ name: 'リズムクルーズ', directory: 'rhythm-cruise', pro: 'pro_r4m8k7n2q9x' }),
    chord: Object.freeze({ name: 'コードクルーズ', directory: 'chord-cruise', pro: 'pro_k7m4q9v2x8' })
});

export function resolveCruiseAppHref(appId, edition = getEdition()) {
    if (!Object.hasOwn(CRUISE_APPS, appId)) return null;
    const app = CRUISE_APPS[appId];
    return `/apps/${app.directory}/${edition === 'pro' ? app.pro : 'standard'}/`;
}

export const APP_DEFINITIONS = Object.freeze({
    ...Object.fromEntries(Object.entries(CRUISE_APPS).map(([id, app]) => [id,
        Object.freeze({ name: app.name, href: resolveCruiseAppHref(id, 'pro') })])),
    metronome: Object.freeze({ name: 'メトロノーム', href: '#metronome' }),
    tuner: Object.freeze({ name: 'チューナー', href: '#tuner' })
});

export function applyHomeCruiseLinks(documentObject = document, edition = getEdition()) {
    documentObject.querySelectorAll('[data-cruise-app]').forEach((link) => {
        const href = resolveCruiseAppHref(link.dataset.cruiseApp, edition);
        if (href) link.setAttribute('href', href);
    });
}
