export function createKnownLaunchFormState(item = null, recognizedAppKey = null) {
    const decisions = {};
    if (recognizedAppKey) {
        decisions[recognizedAppKey] = item
            ? item.launchMode === 'known-app' && item.appKey === recognizedAppKey
            : true;
    }
    return { activeAppKey: recognizedAppKey, decisions };
}

export function recognizeKnownLaunchApp(state, appKey) {
    if (!appKey) return { activeAppKey: null, decisions: { ...state.decisions } };
    const decisions = { ...state.decisions };
    if (!Object.hasOwn(decisions, appKey)) decisions[appKey] = true;
    return { activeAppKey: appKey, decisions };
}

export function setKnownLaunchDecision(state, enabled) {
    if (!state.activeAppKey) return state;
    return {
        activeAppKey: state.activeAppKey,
        decisions: { ...state.decisions, [state.activeAppKey]: Boolean(enabled) }
    };
}

export function isKnownLaunchEnabled(state) {
    return Boolean(state.activeAppKey && state.decisions[state.activeAppKey]);
}

export function shouldShowCustomLaunchSettings({ knownAppKey = null, customEditAvailable = false } = {}) {
    return !knownAppKey && Boolean(customEditAvailable);
}

export function createCustomLaunchTestState() {
    return {
        ios: { href: null, testedHref: null },
        android: { href: null, testedHref: null }
    };
}

export function updateCustomLaunchTestTarget(state, platform, href) {
    if (!Object.hasOwn(state, platform)) return state;
    const nextHref = href || null;
    const current = state[platform];
    return {
        ...state,
        [platform]: {
            href: nextHref,
            testedHref: current.href === nextHref ? current.testedHref : null
        }
    };
}

export function markCustomLaunchTested(state, platform) {
    if (!Object.hasOwn(state, platform) || !state[platform].href) return state;
    return {
        ...state,
        [platform]: {
            ...state[platform],
            testedHref: state[platform].href
        }
    };
}
