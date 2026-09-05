const SCHEMA_VERSION = 1;
const STORAGE_KEYS = Object.freeze({
    schemaVersion: 'cruisePort.schemaVersion',
    practiceMenus: 'cruisePort.practiceMenus'
});

const APP_DEFINITIONS = Object.freeze({
    pitch: Object.freeze({ name: '音感クルーズ', href: '../pitch-cruise/pro_x9v7q2m8/' }),
    fretboard: Object.freeze({ name: '指板クルーズ', href: '../fretboard_cruise/pro_a9f4k7q2m8z/' }),
    rhythm: Object.freeze({ name: 'リズムクルーズ', href: '../rhythm-cruise/pro_r4m8k7n2q9x/' }),
    chord: Object.freeze({ name: 'コードクルーズ', href: '../chord-cruise/pro_k7m4q9v2x8/' })
});

const LIMITS = Object.freeze({
    name: 100,
    durationMinutes: 999,
    memo: 1000
});

function isIsoDate(value) {
    return typeof value === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
        && !Number.isNaN(Date.parse(value));
}

function isValidItem(item) {
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
        && Object.hasOwn(APP_DEFINITIONS, item.appId)
        && typeof item.memo === 'string'
        && item.memo.length <= LIMITS.memo
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

export function loadPracticeMenus(storage = window.localStorage) {
    try {
        const schemaValue = storage.getItem(STORAGE_KEYS.schemaVersion);
        const rawValue = storage.getItem(STORAGE_KEYS.practiceMenus);

        if (rawValue === null) {
            if (schemaValue !== null && schemaValue !== String(SCHEMA_VERSION)) {
                return { ok: false, items: [], reason: 'unsupported-version' };
            }
            return { ok: true, items: [] };
        }

        if (schemaValue !== null && schemaValue !== String(SCHEMA_VERSION)) {
            return { ok: false, items: [], reason: 'unsupported-version' };
        }

        const parsed = JSON.parse(rawValue);
        if (
            !parsed
            || typeof parsed !== 'object'
            || parsed.version !== SCHEMA_VERSION
            || !Array.isArray(parsed.items)
            || !parsed.items.every(isValidItem)
            || !hasUniqueIds(parsed.items)
        ) {
            return { ok: false, items: [], reason: 'invalid-data' };
        }

        return { ok: true, items: parsed.items.map((item) => ({ ...item })) };
    } catch (error) {
        return { ok: false, items: [], reason: 'read-failed' };
    }
}

export function savePracticeMenus(items, storage = window.localStorage) {
    if (!Array.isArray(items) || !items.every(isValidItem) || !hasUniqueIds(items)) {
        return { ok: false, reason: 'invalid-data' };
    }

    let previousSchema;
    let previousMenus;
    try {
        previousSchema = storage.getItem(STORAGE_KEYS.schemaVersion);
        previousMenus = storage.getItem(STORAGE_KEYS.practiceMenus);
        const payload = JSON.stringify({ version: SCHEMA_VERSION, items });
        storage.setItem(STORAGE_KEYS.schemaVersion, String(SCHEMA_VERSION));
        storage.setItem(STORAGE_KEYS.practiceMenus, payload);
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
        createdAt: timestamp,
        updatedAt: timestamp
    };
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

export { APP_DEFINITIONS, LIMITS, SCHEMA_VERSION, STORAGE_KEYS };
