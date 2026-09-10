import { readStorageValue, assertStorageUnchanged, acceptStorageValues } from './storage-conflict.js?v=0.24.0';
import { APP_DEFINITIONS } from './cruise-app-links.js?v=0.26.0';
const SCHEMA_VERSION = 3;
const LEGACY_SCHEMA_VERSIONS = Object.freeze([1, 2]);
const STORAGE_KEYS = Object.freeze({
    schemaVersion: 'cruisePort.schemaVersion',
    practiceMenus: 'cruisePort.practiceMenus'
});

const LIMITS = Object.freeze({
    name: 100,
    durationMinutes: 999,
    memo: 1000,
    appId: 134,
    myAppId: 128
});

const MY_APP_PREFIX = 'myapp:';
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
export const INITIAL_PRACTICE_MENU_VALUES = Object.freeze({
    name: '曲練',
    durationMinutes: 10,
    appId: null,
    memo: '',
    hidden: false
});

function isIsoDate(value) {
    return typeof value === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
        && !Number.isNaN(Date.parse(value));
}

export function isValidPracticeAppId(value) {
    if (value === null) return true;
    if (
        typeof value !== 'string'
        || value.length === 0
        || value.trim().length === 0
        || value.length > LIMITS.appId
        || CONTROL_CHARACTERS.test(value)
    ) {
        return false;
    }
    if (!value.startsWith(MY_APP_PREFIX)) return true;
    const myAppId = value.slice(MY_APP_PREFIX.length);
    return myAppId.length > 0 && myAppId.trim().length > 0 && myAppId.length <= LIMITS.myAppId;
}

function isValidItem(item, version = SCHEMA_VERSION) {
    return Boolean(
        item
        && typeof item === 'object'
        && !Array.isArray(item)
        && typeof item.id === 'string'
        && item.id.length > 0
        && typeof item.name === 'string'
        && item.name.trim().length > 0
        && item.name.length <= LIMITS.name
        && Number.isInteger(item.durationMinutes)
        && item.durationMinutes >= 1
        && item.durationMinutes <= LIMITS.durationMinutes
        && isValidPracticeAppId(item.appId)
        && (version !== 1 || (typeof item.appId === 'string' && Object.hasOwn(APP_DEFINITIONS, item.appId)))
        && typeof item.memo === 'string'
        && item.memo.length <= LIMITS.memo
        && (version < 3 || typeof item.hidden === 'boolean')
        && isIsoDate(item.createdAt)
        && isIsoDate(item.updatedAt)
    );
}

function hasUniqueIds(items) {
    return new Set(items.map((item) => item.id)).size === items.length;
}

function restoreStorage(storage, key, previousValue) {
    if (previousValue === null) {
        storage.removeItem(key);
    } else {
        storage.setItem(key, previousValue);
    }
}

export function loadPracticeMenus(storage) {
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        const schemaValue = readStorageValue(storage, STORAGE_KEYS.schemaVersion);
        const rawValue = readStorageValue(storage, STORAGE_KEYS.practiceMenus);

        const supportedVersions = [...LEGACY_SCHEMA_VERSIONS, SCHEMA_VERSION];
        const supportedSchemaValues = supportedVersions.map(String);
        const storedSchemaVersion = schemaValue === null ? null : Number(schemaValue);

        if (rawValue === null) {
            if (schemaValue !== null && !supportedSchemaValues.includes(schemaValue)) {
                return { ok: false, items: [], reason: 'unsupported-version' };
            }
            return { ok: true, items: [], uninitialized: true };
        }

        if (schemaValue !== null && !supportedSchemaValues.includes(schemaValue)) {
            return { ok: false, items: [], reason: 'unsupported-version' };
        }

        const parsed = JSON.parse(rawValue);
        if (schemaValue !== null && storedSchemaVersion !== parsed?.version) {
            return { ok: false, items: [], reason: 'invalid-data' };
        }
        if (
            !parsed
            || typeof parsed !== 'object'
            || !supportedVersions.includes(parsed.version)
            || !Array.isArray(parsed.items)
            || !parsed.items.every((item) => isValidItem(item, parsed.version))
            || !hasUniqueIds(parsed.items)
        ) {
            return { ok: false, items: [], reason: 'invalid-data' };
        }

        const items = parsed.items.map((item) => ({
            ...item,
            hidden: parsed.version < 3 ? false : item.hidden
        }));
        return parsed.version < SCHEMA_VERSION
            ? { ok: true, items, migrated: true }
            : { ok: true, items };
    } catch (error) {
        return { ok: false, items: [], reason: 'read-failed' };
    }
}

export function savePracticeMenus(items, storage) {
    if (!Array.isArray(items) || !items.every((item) => isValidItem(item)) || !hasUniqueIds(items)) {
        return { ok: false, reason: 'invalid-data' };
    }

    let previousSchema;
    let previousMenus;
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        assertStorageUnchanged(storage, [STORAGE_KEYS.schemaVersion, STORAGE_KEYS.practiceMenus]);
        previousSchema = storage.getItem(STORAGE_KEYS.schemaVersion);
        previousMenus = storage.getItem(STORAGE_KEYS.practiceMenus);
        const payload = JSON.stringify({ version: SCHEMA_VERSION, items });
        storage.setItem(STORAGE_KEYS.schemaVersion, String(SCHEMA_VERSION));
        storage.setItem(STORAGE_KEYS.practiceMenus, payload);
        acceptStorageValues(storage, [STORAGE_KEYS.schemaVersion, STORAGE_KEYS.practiceMenus]);
        return { ok: true };
    } catch (error) {
        try {
            if (previousSchema !== undefined) {
                restoreStorage(storage, STORAGE_KEYS.schemaVersion, previousSchema);
            }
        } catch (restoreError) {
            // The UI still keeps its last successfully loaded in-memory state.
        }
        try {
            if (previousMenus !== undefined) {
                restoreStorage(storage, STORAGE_KEYS.practiceMenus, previousMenus);
            }
        } catch (restoreError) {
            // The UI still keeps its last successfully loaded in-memory state.
        }
        return { ok: false, reason: 'write-failed' };
    }
}

export function createPracticeMenu(values, existingItems, now = new Date()) {
    const existingIds = new Set(existingItems.map((item) => item.id));
    const timestamp = now.toISOString();
    let id;

    do {
        id = globalThis.crypto?.randomUUID
            ? globalThis.crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    } while (existingIds.has(id));

    return {
        id,
        ...values,
        hidden: values.hidden ?? false,
        createdAt: timestamp,
        updatedAt: timestamp
    };
}

export function initializePracticeMenus(loadResult, storage, now = new Date()) {
    if (!loadResult?.ok || loadResult.uninitialized !== true) return loadResult;

    const item = createPracticeMenu({ ...INITIAL_PRACTICE_MENU_VALUES }, [], now);
    const saveResult = savePracticeMenus([item], storage);
    return saveResult.ok
        ? { ok: true, items: [item] }
        : { ok: false, items: [], reason: saveResult.reason };
}

export function updatePracticeMenu(items, id, values, now = new Date()) {
    let found = false;
    const nextItems = items.map((item) => {
        if (item.id !== id) return { ...item };
        found = true;
        return {
            ...item,
            ...values,
            id: item.id,
            createdAt: item.createdAt,
            updatedAt: now.toISOString()
        };
    });
    return { found, items: nextItems };
}

export function deletePracticeMenu(items, id) {
    const nextItems = items.filter((item) => item.id !== id).map((item) => ({ ...item }));
    return { found: nextItems.length !== items.length, items: nextItems };
}

export function movePracticeMenu(items, id, direction) {
    const currentIndex = items.findIndex((item) => item.id === id);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) {
        return { moved: false, items };
    }

    const nextItems = [...items];
    [nextItems[currentIndex], nextItems[nextIndex]] = [nextItems[nextIndex], nextItems[currentIndex]];
    return { moved: true, items: nextItems };
}

export { APP_DEFINITIONS, LIMITS, MY_APP_PREFIX, SCHEMA_VERSION, STORAGE_KEYS };
