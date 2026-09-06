import { isValidIconCrop } from './my-apps-crop.js?v=1.1.0';
import { getKnownApp } from './my-apps-known-apps.js?v=1.2.0';

export const MY_APPS_SCHEMA_VERSION = 5;
export const MY_APPS_STORAGE_KEY = 'cruisePort.myApps';

export const MY_APPS_LIMITS = Object.freeze({
    name: 80,
    url: 2048,
    items: 100,
    id: 128
});

const ITEM_KEYS_V1 = Object.freeze(['id', 'name', 'url', 'createdAt', 'updatedAt']);
const ITEM_KEYS_V2 = Object.freeze(['id', 'name', 'url', 'iconId', 'createdAt', 'updatedAt']);
const ITEM_KEYS_V3 = Object.freeze([
    'id',
    'name',
    'url',
    'iconId',
    'iconSourceId',
    'iconCrop',
    'createdAt',
    'updatedAt'
]);
const ITEM_KEYS_V4 = Object.freeze([
    'id',
    'name',
    'url',
    'launchMode',
    'appKey',
    'iconId',
    'iconSourceId',
    'iconCrop',
    'createdAt',
    'updatedAt'
]);
const ITEM_KEYS_V5 = Object.freeze([
    'id',
    'name',
    'url',
    'launchMode',
    'appKey',
    'customLaunch',
    'iconId',
    'iconSourceId',
    'iconCrop',
    'createdAt',
    'updatedAt'
]);

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
    const launchMode = values?.launchMode ?? 'https';
    const appKey = values?.appKey ?? null;
    const customLaunch = values?.customLaunch ?? null;
    const customResult = launchMode === 'custom'
        ? normalizeCustomLaunch(customLaunch)
        : null;
    if (
        !['https', 'known-app', 'custom'].includes(launchMode)
        || (launchMode === 'https' && (appKey !== null || customLaunch !== null))
        || (launchMode === 'known-app' && (!getKnownApp(appKey) || customLaunch !== null))
        || (launchMode === 'custom' && (appKey !== null || !customResult?.ok))
    ) {
        return { ok: false, reason: 'invalid-launch' };
    }
    return {
        ok: true,
        values: {
            name,
            url: urlResult.url,
            launchMode,
            appKey,
            customLaunch: customResult?.value || null
        }
    };
}

function hasExactKeys(item, keys) {
    return Object.keys(item).length === keys.length && keys.every((key) => Object.hasOwn(item, key));
}

function isStructurallyValidCustomLaunch(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !hasExactKeys(value, ['ios', 'android'])) {
        return false;
    }
    const validValue = (target) => target === null
        || (typeof target === 'string' && target.length > 0 && target.length <= MY_APPS_LIMITS.url);
    return validValue(value.ios) && validValue(value.android) && (value.ios !== null || value.android !== null);
}

export function normalizeCustomLaunch(value) {
    if (!isStructurallyValidCustomLaunch(value)) return { ok: false, reason: 'invalid-launch' };
    const normalizeTarget = (target) => target === null ? { ok: true, url: null } : normalizeMyAppUrl(target);
    const iosResult = normalizeTarget(value.ios);
    const androidResult = normalizeTarget(value.android);
    if (!iosResult.ok || !androidResult.ok) return { ok: false, reason: 'invalid-launch' };
    return {
        ok: true,
        value: { ios: iosResult.url, android: androidResult.url }
    };
}

function isValidItem(item, version = MY_APPS_SCHEMA_VERSION, { allowUnknownAppKey = false } = {}) {
    const expectedKeys = version === 1
        ? ITEM_KEYS_V1
        : version === 2
            ? ITEM_KEYS_V2
            : version === 3
                ? ITEM_KEYS_V3
                : version === 4
                    ? ITEM_KEYS_V4
                    : ITEM_KEYS_V5;
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
        || !hasExactKeys(item, expectedKeys)
        || (version >= 2 && !(
            item.iconId === null
            || (typeof item.iconId === 'string' && item.iconId.length > 0 && item.iconId.length <= MY_APPS_LIMITS.id)
        ))
    ) {
        return false;
    }

    if (version >= 3) {
        const validSourceId = item.iconSourceId === null || (
            typeof item.iconSourceId === 'string'
            && item.iconSourceId.length > 0
            && item.iconSourceId.length <= MY_APPS_LIMITS.id
        );
        const validImageState = item.iconId === null
            ? item.iconSourceId === null && item.iconCrop === null
            : item.iconSourceId === null
                ? item.iconCrop === null
                : isValidIconCrop(item.iconCrop);
        if (!validSourceId || !validImageState) return false;
    }

    if (version === 4) {
        const validLaunch = item.launchMode === 'https'
            ? item.appKey === null
            : item.launchMode === 'known-app'
                && typeof item.appKey === 'string'
                && item.appKey.length > 0
                && item.appKey.length <= 80
                && (allowUnknownAppKey || Boolean(getKnownApp(item.appKey)));
        if (!validLaunch) return false;
    }

    const baseValuesResult = validateMyAppValues({ name: item.name, url: item.url });
    if (!baseValuesResult.ok || baseValuesResult.values.url !== item.url) return false;

    if (version !== MY_APPS_SCHEMA_VERSION) return true;
    if (allowUnknownAppKey) {
        if (item.launchMode === 'https') return item.appKey === null && item.customLaunch === null;
        if (item.launchMode === 'known-app') {
            return typeof item.appKey === 'string'
                && item.appKey.length > 0
                && item.appKey.length <= 80
                && item.customLaunch === null;
        }
        return item.launchMode === 'custom'
            && item.appKey === null
            && isStructurallyValidCustomLaunch(item.customLaunch);
    }

    const valuesResult = validateMyAppValues(item);
    return valuesResult.ok
        && valuesResult.values.url === item.url
        && JSON.stringify(valuesResult.values.customLaunch) === JSON.stringify(item.customLaunch);
}

function hasUniqueIds(items) {
    return new Set(items.map((item) => item.id)).size === items.length;
}

function cloneItems(items) {
    return items.map((item) => ({
        ...item,
        customLaunch: item.customLaunch ? { ...item.customLaunch } : null,
        iconCrop: item.iconCrop ? { ...item.iconCrop } : null
    }));
}

export function createSecureId() {
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
        const storedVersion = parsed?.version;
        if (
            !parsed
            || typeof parsed !== 'object'
            || Array.isArray(parsed)
            || ![1, 2, 3, 4, MY_APPS_SCHEMA_VERSION].includes(storedVersion)
            || !Array.isArray(parsed.items)
            || parsed.items.length > MY_APPS_LIMITS.items
            || !parsed.items.every((item) => isValidItem(item, storedVersion, { allowUnknownAppKey: true }))
            || !hasUniqueIds(parsed.items)
        ) {
            return { ok: false, items: [], reason: 'invalid-data' };
        }
        let repairedLaunch = false;
        const items = parsed.items.map((item) => {
            const knownLaunch = storedVersion >= 4
                && item.launchMode === 'known-app'
                && getKnownApp(item.appKey);
            const customResult = storedVersion === MY_APPS_SCHEMA_VERSION && item.launchMode === 'custom'
                ? normalizeCustomLaunch(item.customLaunch)
                : null;
            const customLaunch = customResult?.ok ? customResult.value : null;
            if (
                (storedVersion >= 4 && item.launchMode === 'known-app' && !knownLaunch)
                || (storedVersion === MY_APPS_SCHEMA_VERSION && item.launchMode === 'custom' && !customLaunch)
            ) {
                repairedLaunch = true;
            }
            if (
                customLaunch
                && JSON.stringify(customLaunch) !== JSON.stringify(item.customLaunch)
            ) {
                repairedLaunch = true;
            }
            return {
                ...item,
                launchMode: knownLaunch ? 'known-app' : customLaunch ? 'custom' : 'https',
                appKey: knownLaunch ? item.appKey : null,
                customLaunch,
                iconId: storedVersion === 1 ? null : item.iconId,
                iconSourceId: storedVersion < 3 ? null : item.iconSourceId,
                iconCrop: storedVersion < 3 || item.iconCrop === null
                    ? null
                    : { ...item.iconCrop }
            };
        });
        return storedVersion < MY_APPS_SCHEMA_VERSION || repairedLaunch
            ? { ok: true, items, migrated: true }
            : { ok: true, items };
    } catch (_) {
        return { ok: false, items: [], reason: 'read-failed' };
    }
}

export function saveMyApps(items, storage = window.localStorage) {
    if (
        !Array.isArray(items)
        || items.length > MY_APPS_LIMITS.items
        || !items.every((item) => isValidItem(item))
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

export function createMyApp(values, existingItems, now = new Date(), idFactory = createSecureId) {
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
            iconId: null,
            iconSourceId: null,
            iconCrop: null,
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
