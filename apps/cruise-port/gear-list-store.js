import { readStorageValue, assertStorageUnchanged, acceptStorageValues } from './storage-conflict.js?v=0.24.0';
export const GEAR_LIST_STORAGE_KEY = 'cruisePort.gearList';
export const GEAR_LIST_SCHEMA_VERSION = 4;

const PREVIOUS_GEAR_LIST_SCHEMA_VERSION = 3;
const VERSION_WITHOUT_ORDER = 2;
const LEGACY_GEAR_LIST_SCHEMA_VERSION = 1;

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
    priceText: 100,
    memo: 1000
});

const LEGACY_LIMITS = Object.freeze({ manufacturer: 100, url: 2048 });
const CATEGORY_KEYS = new Set(GEAR_CATEGORIES.map(({ key }) => key));
const PRIORITY_KEYS = new Set(GEAR_PRIORITIES.map(({ key }) => key));
const STATUS_KEYS = new Set(['owned', 'wishlist', 'sold']);
const PREVIOUS_STATUS_KEYS = new Set(['owned', 'wishlist']);
const PRIORITY_RANK = Object.freeze({ high: 0, medium: 1, low: 2 });
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function isIsoDate(value) {
    return typeof value === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
        && !Number.isNaN(Date.parse(value));
}

function hasUniqueIds(items) {
    return new Set(items.map(({ id }) => id)).size === items.length;
}

function hasUniqueStatusOrders(items) {
    return new Set(items.map(({ status, order }) => `${status}:${order}`)).size === items.length;
}

function restoreStorage(storage, previousValue) {
    if (previousValue === null) storage.removeItem(GEAR_LIST_STORAGE_KEY);
    else storage.setItem(GEAR_LIST_STORAGE_KEY, previousValue);
}

function cloneGearItem(item) {
    const cloned = item.legacy ? { ...item, legacy: { ...item.legacy } } : { ...item };
    if (item.photoCrop) cloned.photoCrop = { ...item.photoCrop };
    return cloned;
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

function normalizeLegacyGearUrl(value) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) return { ok: true };
    if (trimmed.length > LEGACY_LIMITS.url || CONTROL_CHARACTERS.test(trimmed)) return { ok: false };
    try {
        const url = new URL(trimmed);
        return {
            ok: ['http:', 'https:'].includes(url.protocol)
                && !url.username
                && !url.password
                && Boolean(url.hostname)
        };
    } catch (_) {
        return { ok: false };
    }
}

function validateCommonGearValues(values) {
    const name = typeof values?.name === 'string' ? values.name.trim() : '';
    if (!name) return { ok: false, field: 'name', message: '名前を入力してください。' };
    if (name.length > GEAR_LIMITS.name) {
        return { ok: false, field: 'name', message: '名前は100文字以内で入力してください。' };
    }

    const category = values?.category;
    if (!CATEGORY_KEYS.has(category)) {
        return { ok: false, field: 'category', message: 'カテゴリを選択してください。' };
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

    return { ok: true, values: { name, category, priority, memo, status } };
}

export function validateGearValues(values) {
    const common = validateCommonGearValues(values);
    if (!common.ok) return common;

    const priceText = typeof values?.priceText === 'string' ? values.priceText.trim() : '';
    if (priceText.length > GEAR_LIMITS.priceText) {
        return { ok: false, field: 'priceText', message: '価格は100文字以内で入力してください。' };
    }

    return {
        ok: true,
        values: {
            name: common.values.name,
            category: common.values.category,
            priceText,
            priority: common.values.priority,
            memo: common.values.memo,
            status: common.values.status
        }
    };
}

function validateLegacyGearValues(values) {
    const common = validateCommonGearValues(values);
    if (!common.ok) return common;

    const manufacturer = typeof values?.manufacturer === 'string' ? values.manufacturer.trim() : '';
    if (manufacturer.length > LEGACY_LIMITS.manufacturer) return { ok: false };
    if (!normalizeLegacyGearUrl(values?.url).ok) return { ok: false };

    if (values?.priceYen !== '' && values?.priceYen !== null && values?.priceYen !== undefined) {
        const price = String(values.priceYen).trim();
        if (!/^\d+$/.test(price)) return { ok: false };
        const priceYen = Number(price);
        if (!Number.isSafeInteger(priceYen) || priceYen < 0) return { ok: false };
    }
    return { ok: true };
}

function hasValidV2Timestamps(item) {
    return isIsoDate(item.createdAt)
        && isIsoDate(item.updatedAt)
        && (item.ownedAt === null || isIsoDate(item.ownedAt))
        && (item.status !== 'owned' || isIsoDate(item.ownedAt))
        && (item.status !== 'wishlist' || item.ownedAt === null);
}

function hasValidTimestamps(item) {
    if (!isIsoDate(item.createdAt)
        || !isIsoDate(item.updatedAt)
        || (item.ownedAt !== null && !isIsoDate(item.ownedAt))
        || (item.soldAt !== null && !isIsoDate(item.soldAt))) {
        return false;
    }
    if (item.status === 'owned') return isIsoDate(item.ownedAt) && item.soldAt === null;
    if (item.status === 'wishlist') return item.ownedAt === null && item.soldAt === null;
    return isIsoDate(item.ownedAt) && isIsoDate(item.soldAt);
}

function isValidLegacyMetadata(legacy) {
    if (legacy === undefined) return true;
    if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return false;
    if (Object.keys(legacy).some((key) => !['manufacturer', 'url'].includes(key))) return false;
    if ('manufacturer' in legacy
        && (typeof legacy.manufacturer !== 'string'
            || legacy.manufacturer.trim().length > LEGACY_LIMITS.manufacturer)) {
        return false;
    }
    return !('url' in legacy)
        || (typeof legacy.url === 'string' && normalizeLegacyGearUrl(legacy.url).ok);
}

function isValidLegacyGearItem(item) {
    return Boolean(
        item
        && typeof item === 'object'
        && !Array.isArray(item)
        && typeof item.id === 'string'
        && item.id.length > 0
        && validateLegacyGearValues(item).ok
        && PREVIOUS_STATUS_KEYS.has(item.status)
        && hasValidV2Timestamps(item)
    );
}

function isValidV2GearItem(item) {
    return Boolean(
        item
        && typeof item === 'object'
        && !Array.isArray(item)
        && typeof item.id === 'string'
        && item.id.length > 0
        && hasOwn(item, 'priceText')
        && !hasOwn(item, 'priceYen')
        && !hasOwn(item, 'manufacturer')
        && !hasOwn(item, 'url')
        && PREVIOUS_STATUS_KEYS.has(item.status)
        && validateGearValues(item).ok
        && isValidLegacyMetadata(item.legacy)
        && hasValidV2Timestamps(item)
    );
}

function isValidV3GearItem(item) {
    return Boolean(
        item
        && typeof item === 'object'
        && !Array.isArray(item)
        && typeof item.id === 'string'
        && item.id.length > 0
        && hasOwn(item, 'priceText')
        && hasOwn(item, 'order')
        && hasOwn(item, 'soldAt')
        && Number.isSafeInteger(item.order)
        && !hasOwn(item, 'priceYen')
        && !hasOwn(item, 'manufacturer')
        && !hasOwn(item, 'url')
        && validateGearValues(item).ok
        && isValidLegacyMetadata(item.legacy)
        && hasValidTimestamps(item)
    );
}

function isValidPhotoCrop(crop) {
    return Boolean(
        crop
        && typeof crop === 'object'
        && !Array.isArray(crop)
        && Object.keys(crop).length === 3
        && Number.isFinite(crop.x)
        && crop.x >= 0
        && crop.x <= 1
        && Number.isFinite(crop.y)
        && crop.y >= 0
        && crop.y <= 1
        && Number.isFinite(crop.size)
        && crop.size > 0
        && crop.size <= 1
    );
}

export function isValidGearItem(item) {
    if (!isValidV3GearItem(item)
        || !hasOwn(item, 'photoId')
        || !hasOwn(item, 'photoSourceId')
        || !hasOwn(item, 'photoCrop')) {
        return false;
    }
    if (item.photoId === null && item.photoSourceId === null && item.photoCrop === null) return true;
    return typeof item.photoId === 'string'
        && item.photoId.length > 0
        && typeof item.photoSourceId === 'string'
        && item.photoSourceId.length > 0
        && isValidPhotoCrop(item.photoCrop);
}

function isValidGearCollection(items) {
    return Array.isArray(items)
        && items.every(isValidGearItem)
        && hasUniqueIds(items)
        && hasUniqueStatusOrders(items);
}

function migrateLegacyGearItem(item) {
    const legacy = {};
    if (typeof item.manufacturer === 'string' && item.manufacturer.length > 0) {
        legacy.manufacturer = item.manufacturer;
    }
    if (typeof item.url === 'string' && item.url.length > 0) legacy.url = item.url;

    const migrated = {
        id: item.id,
        name: item.name,
        category: item.category,
        priceText: item.priceYen === null || item.priceYen === undefined || item.priceYen === ''
            ? ''
            : `¥${Number(item.priceYen).toLocaleString('ja-JP')}`,
        priority: item.priority,
        memo: item.memo,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        ownedAt: item.ownedAt
    };
    return Object.keys(legacy).length > 0 ? { ...migrated, legacy } : migrated;
}

function compareV2Items(first, second) {
    if (first.status === 'wishlist') {
        const priorityDifference = PRIORITY_RANK[first.priority] - PRIORITY_RANK[second.priority];
        if (priorityDifference !== 0) return priorityDifference;
    }
    return Date.parse(second.updatedAt) - Date.parse(first.updatedAt);
}

function migrateV2Items(items) {
    const orderById = new Map();
    [...PREVIOUS_STATUS_KEYS].forEach((status) => {
        items
            .filter((item) => item.status === status)
            .sort(compareV2Items)
            .forEach((item, index) => orderById.set(item.id, index));
    });
    return items.map((item) => ({
        ...cloneGearItem(item),
        order: orderById.get(item.id),
        soldAt: null
    }));
}

function migrateV3Items(items) {
    return items.map((item) => ({
        ...cloneGearItem(item),
        photoId: null,
        photoSourceId: null,
        photoCrop: null
    }));
}

export function loadGearList(storage) {
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        const rawValue = readStorageValue(storage, GEAR_LIST_STORAGE_KEY);
        if (rawValue === null) return { ok: true, items: [] };
        const payload = JSON.parse(rawValue);

        if (payload?.version === LEGACY_GEAR_LIST_SCHEMA_VERSION) {
            if (!Array.isArray(payload.items)
                || !payload.items.every(isValidLegacyGearItem)
                || !hasUniqueIds(payload.items)) {
                return { ok: false, items: [], reason: 'invalid-data' };
            }
            const items = migrateV3Items(migrateV2Items(payload.items.map(migrateLegacyGearItem)));
            const migrationSave = saveGearList(items, storage);
            if (!migrationSave.ok) return { ok: false, items: [], reason: 'migration-write-failed' };
            return { ok: true, items: items.map(cloneGearItem), migrated: true };
        }

        if (payload?.version === VERSION_WITHOUT_ORDER) {
            if (!Array.isArray(payload.items)
                || !payload.items.every(isValidV2GearItem)
                || !hasUniqueIds(payload.items)) {
                return { ok: false, items: [], reason: 'invalid-data' };
            }
            const items = migrateV3Items(migrateV2Items(payload.items));
            const migrationSave = saveGearList(items, storage);
            if (!migrationSave.ok) return { ok: false, items: [], reason: 'migration-write-failed' };
            return { ok: true, items: items.map(cloneGearItem), migrated: true };
        }

        if (payload?.version === PREVIOUS_GEAR_LIST_SCHEMA_VERSION) {
            if (!Array.isArray(payload.items)
                || !payload.items.every(isValidV3GearItem)
                || !hasUniqueIds(payload.items)
                || !hasUniqueStatusOrders(payload.items)) {
                return { ok: false, items: [], reason: 'invalid-data' };
            }
            const items = migrateV3Items(payload.items);
            const migrationSave = saveGearList(items, storage);
            if (!migrationSave.ok) return { ok: false, items: [], reason: 'migration-write-failed' };
            return { ok: true, items: items.map(cloneGearItem), migrated: true };
        }

        if (payload?.version !== GEAR_LIST_SCHEMA_VERSION) {
            return { ok: false, items: [], reason: 'unsupported-version' };
        }
        if (!isValidGearCollection(payload.items)) {
            return { ok: false, items: [], reason: 'invalid-data' };
        }
        return { ok: true, items: payload.items.map(cloneGearItem) };
    } catch (_) {
        return { ok: false, items: [], reason: 'read-failed' };
    }
}

export function saveGearList(items, storage) {
    if (!isValidGearCollection(items)) {
        return { ok: false, reason: 'invalid-data' };
    }
    let previousValue;
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        assertStorageUnchanged(storage, [GEAR_LIST_STORAGE_KEY]);
        previousValue = storage.getItem(GEAR_LIST_STORAGE_KEY);
        storage.setItem(GEAR_LIST_STORAGE_KEY, JSON.stringify({
            version: GEAR_LIST_SCHEMA_VERSION,
            items
        }));
        acceptStorageValues(storage, [GEAR_LIST_STORAGE_KEY]);
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

export function getInitialGearCategory(activeCategory) {
    return CATEGORY_KEYS.has(activeCategory) ? activeCategory : '';
}

export function createGearItem(values, existingItems, now = new Date(), photoReferences = null) {
    const timestamp = now.toISOString();
    const order = getNewGearOrder(existingItems, values.status);
    return {
        id: createStableId(existingItems),
        name: values.name,
        category: values.category,
        priceText: values.priceText,
        priority: values.priority,
        memo: values.memo,
        status: values.status,
        order,
        createdAt: timestamp,
        updatedAt: timestamp,
        ownedAt: values.status === 'wishlist' ? null : timestamp,
        soldAt: values.status === 'sold' ? timestamp : null,
        photoId: photoReferences?.photoId || null,
        photoSourceId: photoReferences?.photoSourceId || null,
        photoCrop: photoReferences?.photoCrop ? { ...photoReferences.photoCrop } : null
    };
}

function getNewGearOrder(items, status) {
    const orders = items.filter((item) => item.status === status).map((item) => item.order);
    return orders.length === 0 ? 0 : Math.min(...orders) - 1;
}

function cloneItems(items) {
    return items.map(cloneGearItem);
}

function transitionStatus(items, id, fromStatus, toStatus, now = new Date()) {
    const source = items.find((item) => item.id === id && item.status === fromStatus);
    if (!source) return { found: false, items: cloneItems(items) };
    const timestamp = now.toISOString();
    const transitioned = {
        ...cloneGearItem(source),
        status: toStatus,
        order: 0,
        updatedAt: timestamp,
        ownedAt: toStatus === 'wishlist' ? null : toStatus === 'owned' ? timestamp : source.ownedAt || timestamp,
        soldAt: toStatus === 'sold' ? timestamp : null
    };
    const targetIds = selectGearItems(items, { status: toStatus }).map(({ id: targetId }) => targetId);
    const targetOrder = new Map(targetIds.map((targetId, index) => [targetId, index + 1]));
    return {
        found: true,
        items: items.map((item) => {
            if (item.id === id) return transitioned;
            if (item.status === toStatus) return { ...cloneGearItem(item), order: targetOrder.get(item.id) };
            return cloneGearItem(item);
        })
    };
}

export function updateGearItem(items, id, values, now = new Date()) {
    let found = false;
    const timestamp = now.toISOString();
    const nextItems = items.map((item) => {
        if (item.id !== id) return cloneGearItem(item);
        found = true;
        return {
            ...item,
            name: values.name,
            category: values.category,
            priceText: values.priceText,
            priority: values.priority,
            memo: values.memo,
            status: item.status,
            id: item.id,
            createdAt: item.createdAt,
            updatedAt: timestamp,
            ownedAt: item.ownedAt,
            soldAt: item.soldAt
        };
    });
    if (!found) return { found, items: nextItems };
    const previous = items.find((item) => item.id === id);
    return values.status === previous.status
        ? { found, items: nextItems }
        : transitionStatus(nextItems, id, previous.status, values.status, now);
}

export function markGearPurchased(items, id, now = new Date()) {
    return transitionStatus(items, id, 'wishlist', 'owned', now);
}

export function markGearSold(items, id, now = new Date()) {
    return transitionStatus(items, id, 'owned', 'sold', now);
}

export function restoreGearOwned(items, id, now = new Date()) {
    return transitionStatus(items, id, 'sold', 'owned', now);
}

export function deleteGearItem(items, id) {
    const nextItems = items.filter((item) => item.id !== id).map(cloneGearItem);
    return { found: nextItems.length !== items.length, items: nextItems };
}

export function getGearPhotoReferences(item) {
    return {
        photoId: item?.photoId || null,
        photoSourceId: item?.photoSourceId || null,
        photoCrop: item?.photoCrop ? { ...item.photoCrop } : null
    };
}

export function setGearPhotoReferences(items, id, references, now = new Date()) {
    let found = false;
    const timestamp = now.toISOString();
    const nextItems = items.map((item) => {
        if (item.id !== id) return cloneGearItem(item);
        found = true;
        return {
            ...cloneGearItem(item),
            photoId: references.photoId,
            photoSourceId: references.photoSourceId,
            photoCrop: { ...references.photoCrop },
            updatedAt: timestamp
        };
    });
    return { found, items: nextItems };
}

export function clearGearPhotoReferences(items, id, now = new Date()) {
    let found = false;
    const timestamp = now.toISOString();
    const nextItems = items.map((item) => {
        if (item.id !== id) return cloneGearItem(item);
        found = true;
        return {
            ...cloneGearItem(item),
            photoId: null,
            photoSourceId: null,
            photoCrop: null,
            updatedAt: timestamp
        };
    });
    return { found, items: nextItems };
}

export function selectGearItems(items, { status, category = 'all' }) {
    if (!STATUS_KEYS.has(status) || (category !== 'all' && !CATEGORY_KEYS.has(category))) return [];
    return items
        .filter((item) => item.status === status && (category === 'all' || item.category === category))
        .sort((first, second) => first.order - second.order);
}

export function moveGearItem(items, id, direction) {
    const source = items.find((item) => item.id === id);
    if (!source || !Number.isInteger(direction) || direction === 0) return { moved: false, items: cloneItems(items) };
    const ordered = selectGearItems(items, { status: source.status });
    const index = ordered.findIndex((item) => item.id === id);
    const destination = index + Math.sign(direction);
    if (index < 0 || destination < 0 || destination >= ordered.length) return { moved: false, items: cloneItems(items) };
    [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
    const orderById = new Map(ordered.map((item, order) => [item.id, order]));
    return {
        moved: true,
        items: items.map((item) => item.status === source.status
            ? { ...cloneGearItem(item), order: orderById.get(item.id) }
            : cloneGearItem(item))
    };
}

export function getGearCategoryLabel(key) {
    return GEAR_CATEGORIES.find((category) => category.key === key)?.label || 'その他';
}

export function getGearPriorityLabel(key) {
    return GEAR_PRIORITIES.find((priority) => priority.key === key)?.label || '中';
}
