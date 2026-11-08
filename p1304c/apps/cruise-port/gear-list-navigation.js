export const GEAR_ROUTE_KIND = Object.freeze({
    list: 'list',
    create: 'create',
    edit: 'edit',
    invalid: 'invalid'
});

export function safeDecodeGearRouteSegment(value) {
    try {
        return decodeURIComponent(value);
    } catch (_) {
        return null;
    }
}

export function parseGearRoute(hash) {
    if (hash === '#wishlist') return { kind: GEAR_ROUTE_KIND.list };
    if (hash === '#wishlist/new') return { kind: GEAR_ROUTE_KIND.create };
    if (!hash.startsWith('#wishlist/')) return null;
    const match = hash.match(/^#wishlist\/([^/]+)\/edit$/);
    if (!match) return { kind: GEAR_ROUTE_KIND.invalid };
    const id = safeDecodeGearRouteSegment(match[1]);
    return id ? { kind: GEAR_ROUTE_KIND.edit, id } : { kind: GEAR_ROUTE_KIND.invalid };
}

export function replaceGearListRoute({
    historyObject = window.history,
    locationObject = window.location
} = {}) {
    historyObject.replaceState(null, '', `${locationObject.pathname}${locationObject.search}#wishlist`);
}
