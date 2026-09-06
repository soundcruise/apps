export const MY_APPS_SCHEMA_VERSION = 1;
export const MY_APPS_STORAGE_KEY = 'cruisePort.myApps';

export const MY_APPS_LIMITS = Object.freeze({
    name: 80,
    url: 2048,
    items: 100,
    id: 128
});

const ITEM_KEYS = Object.freeze(['id', 'name', 'url', 'createdAt', 'updatedAt']);

function isIsoDate(value) {
    return typeof value === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
        && !Number.isNaN(Date.parse(value));
}

function hasExplicitScheme(value) {
    return /^[a-z][a-z\d+.-]*:/i.test(value);
}

export function normalizeMyAppUrl(value) {
    if (typeof value !== 'string') {
        return { ok: false, reason: 'invalid-url' };
    }

    const input = value.trim();
    if (!input || input.length > MY_APPS_LIMITS.url) {
        return { ok: false, reason: 'invalid-url' };
    }

    const candidate = hasExplicitScheme(input) ? input : `https://${input}`;
    try {
        const parsed = new URL(candidate);
        if (
            parsed.protocol !== 'https:'
            || !parsed.hostname
            || parsed.username
            || parsed.password
            || parsed.href.length > MY_APPS_LIMITS.url
        ) {
            return { ok: false, reason: 'invalid-url' };
        }
        return { ok: true, url: parsed.href };
    } catch (_) {
        return { ok: false, reason: 'invalid-url' };
    }
}

export function validateMyAppValues(values) {
    const name = typeof values?.name === 'string' ? values.name.trim() : '';
    if (!name) return { ok: false, reason: 'invalid-name' };
    if (name.length > MY_APPS_LIMITS.name) return { ok: false, reason: 'invalid-name' };

    const urlResult = normalizeMyAppUrl(values?.url);
    if (!urlResult.ok) return urlResult;
    return { ok: true, values: { name, url: urlResult.url } };
}

function isValidItem(item) {
    if (
        !item
        || typeof item !== 'object'
        || Array.isArray(item)
        || typeof item.id !== 'string'
        || !item.id
        || item.id.length > MY_APPS_LIMITS.id
        || typeof item.name !== 'string'
        || item.name !== item.name.trim()
        || !isIsoDate(item.createdAt)
        || !isIsoDate(item.updatedAt)
        || Object.keys(item).length !== ITEM_KEYS.length
        || !ITEM_KEYS.every((key) => Object.hasOwn(item, key))
    ) {
        return false;
    }

    const valuesResult = validateMyAppValues({ name: item.name, url: item.url });
    return valuesResult.ok && valuesResult.values.url === item.url;
}

function hasUniqueIds(items) {
    return new Set(items.map((item) => item.id)).size === items.length;
}

function cloneItems(items) {
    return items.map((item) => ({ ...item }));
}

function createUuid() {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    throw new Error('secure-id-unavailable');
}

export function loadMyApps(storage = window.localStorage) {
    try {
        const rawValue = storage.getItem(MY_APPS_STORAGE_KEY);
        if (rawValue === null) return { ok: true, items: [] };

        const parsed = JSON.parse(rawValue);
        if (
            !parsed
            || typeof parsed !== 'object'
            || Array.isArray(parsed)
            || parsed.version !== MY_APPS_SCHEMA_VERSION
            || !Array.isArray(parsed.items)
            || parsed.items.length > MY_APPS_LIMITS.items
            || !parsed.items.every(isValidItem)
            || !hasUniqueIds(parsed.items)
        ) {
            return { ok: false, items: [], reason: 'invalid-data' };
        }
        return { ok: true, items: cloneItems(parsed.items) };
    } catch (_) {
        return { ok: false, items: [], reason: 'read-failed' };
    }
}

export function saveMyApps(items, storage = window.localStorage) {
    if (
        !Array.isArray(items)
        || items.length > MY_APPS_LIMITS.items
        || !items.every(isValidItem)
        || !hasUniqueIds(items)
    ) {
        return { ok: false, reason: 'invalid-data' };
    }

    try {
        storage.setItem(MY_APPS_STORAGE_KEY, JSON.stringify({
            version: MY_APPS_SCHEMA_VERSION,
            items: cloneItems(items)
        }));
        return { ok: true };
    } catch (_) {
        return { ok: false, reason: 'write-failed' };
    }
}

export function createMyApp(values, existingItems, now = new Date(), idFactory = createUuid) {
    const valuesResult = validateMyAppValues(values);
    if (!valuesResult.ok) return { ok: false, reason: valuesResult.reason };
    if (!Array.isArray(existingItems) || existingItems.length >= MY_APPS_LIMITS.items) {
        return { ok: false, reason: 'limit-reached' };
    }

    const existingIds = new Set(existingItems.map((item) => item.id));
    let id;
    try {
        do {
            id = idFactory();
        } while (existingIds.has(id));
    } catch (_) {
        return { ok: false, reason: 'id-unavailable' };
    }

    const timestamp = now.toISOString();
    return {
        ok: true,
        item: {
            id,
            ...valuesResult.values,
            createdAt: timestamp,
            updatedAt: timestamp
        }
    };
}

export function updateMyApp(items, id, values, now = new Date()) {
    const valuesResult = validateMyAppValues(values);
    if (!valuesResult.ok) return { found: false, items: cloneItems(items), reason: valuesResult.reason };

    let found = false;
    const nextItems = items.map((item) => {
        if (item.id !== id) return { ...item };
        found = true;
        return {
            ...item,
            ...valuesResult.values,
            id: item.id,
            createdAt: item.createdAt,
            updatedAt: now.toISOString()
        };
    });
    return { found, items: nextItems };
}

export function deleteMyApp(items, id) {
    const nextItems = items.filter((item) => item.id !== id).map((item) => ({ ...item }));
    return { found: nextItems.length !== items.length, items: nextItems };
}

export function moveMyApp(items, id, direction) {
    const currentIndex = items.findIndex((item) => item.id === id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) {
        return { moved: false, items: cloneItems(items) };
    }
    const nextItems = cloneItems(items);
    [nextItems[currentIndex], nextItems[nextIndex]] = [nextItems[nextIndex], nextItems[currentIndex]];
    return { moved: true, items: nextItems };
}
