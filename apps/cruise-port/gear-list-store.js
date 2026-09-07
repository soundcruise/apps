export const GEAR_LIST_STORAGE_KEY = 'cruisePort.gearList';
export const GEAR_LIST_SCHEMA_VERSION = 1;

export const GEAR_CATEGORIES = Object.freeze([
    Object.freeze({ key: 'guitar', label: 'ギター' }),
    Object.freeze({ key: 'effects', label: 'エフェクター' }),
    Object.freeze({ key: 'amp', label: 'アンプ' }),
    Object.freeze({ key: 'dtm', label: 'DTM' }),
    Object.freeze({ key: 'recording', label: '録音・配信' }),
    Object.freeze({ key: 'accessories', label: 'アクセサリー' }),
    Object.freeze({ key: 'other', label: 'その他' })
]);

export const GEAR_PRIORITIES = Object.freeze([
    Object.freeze({ key: 'low', label: '低' }),
    Object.freeze({ key: 'medium', label: '中' }),
    Object.freeze({ key: 'high', label: '高' })
]);

export const GEAR_LIMITS = Object.freeze({
    name: 100,
    manufacturer: 100,
    url: 2048,
    memo: 1000
});

const CATEGORY_KEYS = new Set(GEAR_CATEGORIES.map(({ key }) => key));
const PRIORITY_KEYS = new Set(GEAR_PRIORITIES.map(({ key }) => key));
const STATUS_KEYS = new Set(['owned', 'wishlist']);
const PRIORITY_RANK = Object.freeze({ high: 0, medium: 1, low: 2 });
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

function isIsoDate(value) {
    return typeof value === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
        && !Number.isNaN(Date.parse(value));
}

function hasUniqueIds(items) {
    return new Set(items.map(({ id }) => id)).size === items.length;
}

function restoreStorage(storage, previousValue) {
    if (previousValue === null) storage.removeItem(GEAR_LIST_STORAGE_KEY);
    else storage.setItem(GEAR_LIST_STORAGE_KEY, previousValue);
}

function createStableId(existingItems) {
    const existingIds = new Set(existingItems.map(({ id }) => id));
    let id;
    do {
        id = globalThis.crypto?.randomUUID
            ? globalThis.crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    } while (existingIds.has(id));
    return id;
}

export function normalizeGearUrl(value) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) return { ok: true, value: '' };
    if (trimmed.length > GEAR_LIMITS.url || CONTROL_CHARACTERS.test(trimmed)) {
        return { ok: false, message: 'URLを正しく入力してください。' };
    }
    try {
        const url = new URL(trimmed);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) {
            return { ok: false, message: 'URLはhttpまたはhttpsで入力してください。' };
        }
        return { ok: true, value: url.href };
    } catch (_) {
        return { ok: false, message: 'URLを正しく入力してください。' };
    }
}

export function validateGearValues(values) {
    const name = typeof values?.name === 'string' ? values.name.trim() : '';
    if (!name) return { ok: false, field: 'name', message: '名前を入力してください。' };
    if (name.length > GEAR_LIMITS.name) {
        return { ok: false, field: 'name', message: '名前は100文字以内で入力してください。' };
    }

    const category = values?.category;
    if (!CATEGORY_KEYS.has(category)) {
        return { ok: false, field: 'category', message: 'カテゴリを選択してください。' };
    }

    const manufacturer = typeof values?.manufacturer === 'string' ? values.manufacturer.trim() : '';
    if (manufacturer.length > GEAR_LIMITS.manufacturer) {
        return { ok: false, field: 'manufacturer', message: 'メーカーは100文字以内で入力してください。' };
    }

    const urlResult = normalizeGearUrl(values?.url);
    if (!urlResult.ok) return { ok: false, field: 'url', message: urlResult.message };

    let priceYen = null;
    if (values?.priceYen !== '' && values?.priceYen !== null && values?.priceYen !== undefined) {
        const priceText = String(values.priceYen).trim();
        if (!/^\d+$/.test(priceText)) {
            return { ok: false, field: 'priceYen', message: '価格は0以上の整数で入力してください。' };
        }
        priceYen = Number(priceText);
        if (!Number.isSafeInteger(priceYen) || priceYen < 0) {
            return { ok: false, field: 'priceYen', message: '価格は0以上の整数で入力してください。' };
        }
    }

    const priority = values?.priority || 'medium';
    if (!PRIORITY_KEYS.has(priority)) {
        return { ok: false, field: 'priority', message: '優先度を選択してください。' };
    }

    const status = values?.status;
    if (!STATUS_KEYS.has(status)) {
        return { ok: false, field: 'status', message: 'リストを選択してください。' };
    }

    const memo = typeof values?.memo === 'string' ? values.memo.trim() : '';
    if (memo.length > GEAR_LIMITS.memo) {
        return { ok: false, field: 'memo', message: 'メモは1000文字以内で入力してください。' };
    }

    return {
        ok: true,
        values: { name, category, manufacturer, url: urlResult.value, priceYen, priority, memo, status }
    };
}

export function isValidGearItem(item) {
    return Boolean(
        item
        && typeof item === 'object'
        && !Array.isArray(item)
        && typeof item.id === 'string'
        && item.id.length > 0
        && validateGearValues(item).ok
        && isIsoDate(item.createdAt)
        && isIsoDate(item.updatedAt)
        && (item.ownedAt === null || isIsoDate(item.ownedAt))
        && (item.status !== 'owned' || isIsoDate(item.ownedAt))
        && (item.status !== 'wishlist' || item.ownedAt === null)
    );
}

export function loadGearList(storage = globalThis.localStorage) {
    try {
        const rawValue = storage.getItem(GEAR_LIST_STORAGE_KEY);
        if (rawValue === null) return { ok: true, items: [] };
        const payload = JSON.parse(rawValue);
        if (payload?.version !== GEAR_LIST_SCHEMA_VERSION) {
            return { ok: false, items: [], reason: 'unsupported-version' };
        }
        if (!Array.isArray(payload.items) || !payload.items.every(isValidGearItem) || !hasUniqueIds(payload.items)) {
            return { ok: false, items: [], reason: 'invalid-data' };
        }
        return { ok: true, items: payload.items.map((item) => ({ ...item })) };
    } catch (_) {
        return { ok: false, items: [], reason: 'read-failed' };
    }
}

export function saveGearList(items, storage = globalThis.localStorage) {
    if (!Array.isArray(items) || !items.every(isValidGearItem) || !hasUniqueIds(items)) {
        return { ok: false, reason: 'invalid-data' };
    }
    let previousValue;
    try {
        previousValue = storage.getItem(GEAR_LIST_STORAGE_KEY);
        storage.setItem(GEAR_LIST_STORAGE_KEY, JSON.stringify({
            version: GEAR_LIST_SCHEMA_VERSION,
            items
        }));
        return { ok: true };
    } catch (_) {
        if (previousValue !== undefined) {
            try {
                restoreStorage(storage, previousValue);
            } catch (_) {
                // The controller keeps the last successfully saved in-memory state.
            }
        }
        return { ok: false, reason: 'write-failed' };
    }
}

export function createGearItem(values, existingItems, now = new Date()) {
    const timestamp = now.toISOString();
    return {
        id: createStableId(existingItems),
        ...values,
        createdAt: timestamp,
        updatedAt: timestamp,
        ownedAt: values.status === 'owned' ? timestamp : null
    };
}

export function updateGearItem(items, id, values, now = new Date()) {
    let found = false;
    const timestamp = now.toISOString();
    const nextItems = items.map((item) => {
        if (item.id !== id) return { ...item };
        found = true;
        return {
            ...item,
            ...values,
            id: item.id,
            createdAt: item.createdAt,
            updatedAt: timestamp,
            ownedAt: values.status === 'wishlist'
                ? null
                : item.status === 'wishlist' || item.ownedAt === null
                    ? timestamp
                    : item.ownedAt
        };
    });
    return { found, items: nextItems };
}

export function markGearPurchased(items, id, now = new Date()) {
    let found = false;
    const timestamp = now.toISOString();
    const nextItems = items.map((item) => {
        if (item.id !== id || item.status !== 'wishlist') return { ...item };
        found = true;
        return { ...item, status: 'owned', updatedAt: timestamp, ownedAt: timestamp };
    });
    return { found, items: nextItems };
}

export function deleteGearItem(items, id) {
    const nextItems = items.filter((item) => item.id !== id).map((item) => ({ ...item }));
    return { found: nextItems.length !== items.length, items: nextItems };
}

export function selectGearItems(items, { status, category = 'all' }) {
    if (!STATUS_KEYS.has(status) || (category !== 'all' && !CATEGORY_KEYS.has(category))) return [];
    const selected = items.filter((item) => item.status === status && (category === 'all' || item.category === category));
    return selected.sort((first, second) => {
        if (status === 'wishlist') {
            const priorityDifference = PRIORITY_RANK[first.priority] - PRIORITY_RANK[second.priority];
            if (priorityDifference !== 0) return priorityDifference;
        }
        return Date.parse(second.updatedAt) - Date.parse(first.updatedAt);
    });
}

export function getGearCategoryLabel(key) {
    return GEAR_CATEGORIES.find((category) => category.key === key)?.label || 'その他';
}

export function getGearPriorityLabel(key) {
    return GEAR_PRIORITIES.find((priority) => priority.key === key)?.label || '中';
}
