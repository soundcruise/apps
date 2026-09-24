import { getEdition } from './cruise-port-edition.js?v=0.27.0';

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

export const CRUISE_APP_ICONS = Object.freeze({
    pitch: Object.freeze({ standard: '/apps/pitch-cruise/icon_pwa_192.png', pro: '/apps/pitch-cruise/pro_icon_192.png' }),
    fretboard: Object.freeze({ standard: '/apps/fretboard_cruise/generated-home-icons/standard-selected-icon/fretboard-cruise-standard-selection-192.png', pro: '/apps/fretboard_cruise/generated-home-icons/final-selected-icon/fretboard-cruise-final-selection-192.png' }),
    rhythm: Object.freeze({ standard: '/apps/rhythm-cruise/icon-192.png', pro: '/apps/rhythm-cruise/pro_r4m8k7n2q9x/icon-192.png' }),
    chord: Object.freeze({ standard: '/apps/chord-cruise/icons/chord-cruise-192.png', pro: '/apps/chord-cruise/icons/chord-cruise-pro-192.png' })
});

export function applyHomeCruiseLinks(documentObject = document, edition = getEdition()) {
    documentObject.querySelectorAll('[data-cruise-app]').forEach((link) => {
        const href = resolveCruiseAppHref(link.dataset.cruiseApp, edition);
        if (href) link.setAttribute('href', href);
        const image = link.querySelector?.('img');
        if (image && CRUISE_APP_ICONS[link.dataset.cruiseApp]) image.src = CRUISE_APP_ICONS[link.dataset.cruiseApp][edition === 'pro' ? 'pro' : 'standard'];
    });
}

const PORT_ICONS = Object.freeze({
    standard: '/apps/cruise-port/assets/app-icons/standard/icon-192.png',
    pro: '/apps/cruise-port/assets/app-icons/pro/icon-192.png'
});
const LAUNCH_FAILSAFE_MS = 8000;

// Feedback shown in the same tap that starts navigation. It never waits for its own animation.
export function createCruiseLaunchTransition(documentObject = document, windowObject = globalThis, edition = getEdition()) {
    const iconEdition = edition === 'pro' ? 'pro' : 'standard';
    let root = null;
    let active = false;
    let timer = null;
    let hiddenSinceShow = false;

    function clear() {
        active = false;
        hiddenSinceShow = false;
        if (timer !== null) windowObject.clearTimeout(timer);
        timer = null;
        if (root) root.hidden = true;
    }
    function build() {
        root = documentObject.createElement('div');
        root.className = 'port-launch';
        root.setAttribute('role', 'status');
        root.setAttribute('aria-live', 'polite');
        root.hidden = true;
        const icons = documentObject.createElement('div');
        icons.className = 'port-launch-icons';
        icons.setAttribute('aria-hidden', 'true');
        const from = documentObject.createElement('img');
        from.className = 'port-launch-icon';
        from.alt = '';
        from.src = PORT_ICONS[iconEdition];
        const track = documentObject.createElement('span');
        track.className = 'port-launch-track';
        track.appendChild(documentObject.createElement('span')).className = 'port-launch-dot';
        const to = documentObject.createElement('img');
        to.className = 'port-launch-icon port-launch-icon--to';
        to.alt = '';
        icons.append(from, track, to);
        const text = documentObject.createElement('p');
        text.className = 'port-launch-text';
        root.append(icons, text);
        documentObject.body.appendChild(root);
    }
    // Built hidden up front so the Port icon is already loaded by the first tap.
    if (documentObject.body) build();

    windowObject.addEventListener?.('pageshow', clear);
    windowObject.addEventListener?.('pagehide', clear);
    // Returning to Port (back, closing the in-app browser view, app switch) always removes the feedback.
    documentObject.addEventListener?.('visibilitychange', () => {
        if (!active) return;
        if (documentObject.visibilityState === 'hidden') hiddenSinceShow = true;
        else if (hiddenSinceShow) clear();
    });
    windowObject.addEventListener?.('blur', () => { if (active) hiddenSinceShow = true; });
    windowObject.addEventListener?.('focus', () => { if (active && hiddenSinceShow) clear(); });

    return Object.freeze({
        get active() { return active; },
        show(appId) {
            if (!Object.hasOwn(CRUISE_APPS, appId)) return false;
            if (!root) build();
            root.querySelector('.port-launch-icon--to').src = CRUISE_APP_ICONS[appId][iconEdition];
            root.querySelector('.port-launch-text').textContent = `${CRUISE_APPS[appId].name}に移動しています`;
            root.hidden = false;
            // A stale stylesheet would render the overlay inline; skip the feedback rather than the launch.
            if (windowObject.getComputedStyle?.(root).position !== 'fixed') {
                root.hidden = true;
                return false;
            }
            active = true;
            if (timer !== null) windowObject.clearTimeout(timer);
            timer = windowObject.setTimeout(clear, LAUNCH_FAILSAFE_MS);
            return true;
        },
        clear
    });
}

export function bindHomeCruiseLaunch(orchestrator, documentObject = document, windowObject = globalThis) {
    const routed = Boolean(orchestrator?.enabled && typeof orchestrator.launchFromHome === 'function');
    const transition = createCruiseLaunchTransition(documentObject, windowObject);
    let routedLaunch = null;
    documentObject.querySelectorAll('[data-cruise-app]').forEach((link) => {
        if (link.dataset.portLaunchBound === '1') return;
        link.dataset.portLaunchBound = '1';
        link.addEventListener('click', (event) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
                event.shiftKey || event.altKey) return;
            // One launch at a time: a second tap must not start another navigation or Account handoff.
            if (routedLaunch || transition.active) {
                event.preventDefault();
                return;
            }
            transition.show(link.dataset.cruiseApp);
            if (!routed) return;
            event.preventDefault();
            routedLaunch = orchestrator.launchFromHome(link.dataset.cruiseApp).catch(() => {
                const href = link.getAttribute('href');
                if (href) windowObject.location.assign(href);
            }).finally(() => { routedLaunch = null; });
        });
    });
}
