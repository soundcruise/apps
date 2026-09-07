export const HOME_HISTORY_MODE = Object.freeze({
    push: 'push',
    replace: 'replace'
});

export function safeDecodeRouteSegment(value) {
    try {
        return decodeURIComponent(value);
    } catch (_) {
        return null;
    }
}

export function updateHomeHistory({
    historyObject = window.history,
    locationObject = window.location,
    mode = HOME_HISTORY_MODE.push
} = {}) {
    const method = mode === HOME_HISTORY_MODE.replace ? 'replaceState' : 'pushState';
    historyObject[method](null, '', `${locationObject.pathname}${locationObject.search}`);
}
