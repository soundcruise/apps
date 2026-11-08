export const HOME_HISTORY_MODE = Object.freeze({
    push: 'push',
    replace: 'replace'
});

export const PRACTICE_ROUTE_KIND = Object.freeze({
    list: 'list',
    create: 'create',
    detail: 'detail',
    edit: 'edit',
    calendar: 'calendar',
    hidden: 'hidden',
    invalid: 'invalid'
});

export function safeDecodeRouteSegment(value) {
    try {
        return decodeURIComponent(value);
    } catch (_) {
        return null;
    }
}

export function parsePracticeRoute(hash) {
    if (hash === '#practice-menu') return { kind: PRACTICE_ROUTE_KIND.list };
    if (hash === '#practice-menu/new') return { kind: PRACTICE_ROUTE_KIND.create };
    if (hash === '#practice-menu/calendar' || hash === '#practice-menu/history') {
        return { kind: PRACTICE_ROUTE_KIND.calendar };
    }
    if (hash === '#practice-menu/hidden') return { kind: PRACTICE_ROUTE_KIND.hidden };

    const editMatch = hash.match(/^#practice-menu\/([^/]+)\/edit$/);
    const detailMatch = hash.match(/^#practice-menu\/([^/]+)$/);
    const encodedId = editMatch?.[1] || detailMatch?.[1];
    if (!encodedId) return null;
    const id = safeDecodeRouteSegment(encodedId);
    if (id === null || id.length === 0) return { kind: PRACTICE_ROUTE_KIND.invalid };
    return { kind: editMatch ? PRACTICE_ROUTE_KIND.edit : PRACTICE_ROUTE_KIND.detail, id };
}

export function updateHomeHistory({
    historyObject = window.history,
    locationObject = window.location,
    mode = HOME_HISTORY_MODE.push
} = {}) {
    const method = mode === HOME_HISTORY_MODE.replace ? 'replaceState' : 'pushState';
    historyObject[method](null, '', `${locationObject.pathname}${locationObject.search}`);
}
