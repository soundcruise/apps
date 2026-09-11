import { readStorageValue, assertStorageUnchanged, acceptStorageValues } from './storage-conflict.js?v=0.24.0';
import { isValidGearCategoryId } from './gear-list-store.js?v=0.24.0';

export const GEAR_CATEGORY_STORAGE_KEY = 'cruisePort.gearCategories';
export const GEAR_CATEGORY_SCHEMA_VERSION = 1;
export const GEAR_CATEGORY_NAME_LIMIT = 40;

export const DEFAULT_GEAR_CATEGORIES = Object.freeze([
    Object.freeze({ id: 'guitar', name: 'ギター' }),
    Object.freeze({ id: 'sound', name: 'エフェクター' }),
    Object.freeze({ id: 'accessories', name: 'アクセサリー' })
]);

const RETIRED_DEFAULT_CATEGORY_NAMES = Object.freeze({
    sound: Object.freeze({ from: '音作り', to: 'エフェクター' })
});

const LEGACY_CATEGORY_NAMES = Object.freeze({
    guitar: 'ギター',
    effects: 'エフェクター',
    amp: 'アンプ',
    dtm: 'DTM',
    recording: '録音・配信',
    accessories: 'アクセサリー',
    other: 'その他'
});
const LEGACY_CATEGORY_ORDER = Object.freeze(['guitar', 'effects', 'amp', 'dtm', 'recording', 'accessories', 'other']);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

function cloneCategories(categories) {
    return categories.map((category) => ({ ...category }));
}

function normalizeCategoryName(value) {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name || [...name].length > GEAR_CATEGORY_NAME_LIMIT || CONTROL_CHARACTERS.test(name)) return null;
    return name;
}

function isValidCategory(category) {
    return Boolean(
        category
        && typeof category === 'object'
        && !Array.isArray(category)
        && Object.keys(category).length === 2
        && isValidGearCategoryId(category.id)
        && normalizeCategoryName(category.name) === category.name
    );
}

function isValidCategoryCollection(categories) {
    return Array.isArray(categories)
        && categories.every(isValidCategory)
        && new Set(categories.map(({ id }) => id)).size === categories.length
        && new Set(categories.map(({ name }) => name.toLocaleLowerCase('ja-JP'))).size === categories.length;
}

function legacyNameForId(id) {
    return LEGACY_CATEGORY_NAMES[id] || id;
}

function uniqueLegacyName(categories, id) {
    const base = normalizeCategoryName(legacyNameForId(id));
    if (!base) return null;
    const names = new Set(categories.map(({ name }) => name.toLocaleLowerCase('ja-JP')));
    if (!names.has(base.toLocaleLowerCase('ja-JP'))) return base;
    const suffix = '（旧カテゴリ）';
    const shortened = [...base].slice(0, GEAR_CATEGORY_NAME_LIMIT - [...suffix].length).join('');
    let candidate = `${shortened}${suffix}`;
    let number = 2;
    while (names.has(candidate.toLocaleLowerCase('ja-JP'))) {
        const numberedSuffix = `（旧カテゴリ${number}）`;
        candidate = `${[...base].slice(0, GEAR_CATEGORY_NAME_LIMIT - [...numberedSuffix].length).join('')}${numberedSuffix}`;
        number += 1;
    }
    return candidate;
}

function upgradeRetiredDefaultCategoryNames(categories) {
    const names = new Set(categories.map(({ name }) => name.toLocaleLowerCase('ja-JP')));
    let changed = false;
    const upgraded = categories.map((category) => {
        const update = RETIRED_DEFAULT_CATEGORY_NAMES[category.id];
        if (!update || category.name !== update.from || names.has(update.to.toLocaleLowerCase('ja-JP'))) {
            return { ...category };
        }
        names.delete(update.from.toLocaleLowerCase('ja-JP'));
        names.add(update.to.toLocaleLowerCase('ja-JP'));
        changed = true;
        return { id: category.id, name: update.to };
    });
    return { categories: upgraded, changed };
}

export function buildInitialGearCategories(items = []) {
    const categories = cloneCategories(DEFAULT_GEAR_CATEGORIES);
    const ids = new Set(categories.map(({ id }) => id));
    const usedIds = new Set(items.map((item) => item?.category).filter(isValidGearCategoryId));
    const orderedIds = [
        ...LEGACY_CATEGORY_ORDER.filter((id) => usedIds.has(id)),
        ...usedIds
    ];
    orderedIds.forEach((id) => {
        if (!isValidGearCategoryId(id) || ids.has(id)) return;
        const name = uniqueLegacyName(categories, id);
        if (!name) return;
        categories.push({ id, name });
        ids.add(id);
    });
    return categories;
}

function restoreStorage(storage, previousValue) {
    if (previousValue === null) storage.removeItem(GEAR_CATEGORY_STORAGE_KEY);
    else storage.setItem(GEAR_CATEGORY_STORAGE_KEY, previousValue);
}

export function saveGearCategories(categories, storage = globalThis.localStorage) {
    if (!isValidCategoryCollection(categories)) return { ok: false, reason: 'invalid-data' };
    let previousValue;
    try {
        assertStorageUnchanged(storage, [GEAR_CATEGORY_STORAGE_KEY]);
        previousValue = storage.getItem(GEAR_CATEGORY_STORAGE_KEY);
        storage.setItem(GEAR_CATEGORY_STORAGE_KEY, JSON.stringify({
            version: GEAR_CATEGORY_SCHEMA_VERSION,
            categories
        }));
        acceptStorageValues(storage, [GEAR_CATEGORY_STORAGE_KEY]);
        return { ok: true };
    } catch (_) {
        if (previousValue !== undefined) {
            try { restoreStorage(storage, previousValue); } catch (_) { /* Keep the last in-memory state. */ }
        }
        return { ok: false, reason: 'write-failed' };
    }
}

export function loadGearCategories(items = [], storage = globalThis.localStorage) {
    try {
        const rawValue = readStorageValue(storage, GEAR_CATEGORY_STORAGE_KEY);
        if (rawValue === null) {
            const categories = buildInitialGearCategories(items);
            const saved = saveGearCategories(categories, storage);
            return saved.ok
                ? { ok: true, categories: cloneCategories(categories), initialized: true }
                : { ok: false, categories: cloneCategories(categories), reason: saved.reason };
        }
        const payload = JSON.parse(rawValue);
        if (payload?.version !== GEAR_CATEGORY_SCHEMA_VERSION || !isValidCategoryCollection(payload.categories)) {
            return { ok: false, categories: buildInitialGearCategories(items), reason: 'invalid-data' };
        }
        const renamed = upgradeRetiredDefaultCategoryNames(payload.categories);
        const categories = renamed.categories;
        const knownIds = new Set(categories.map(({ id }) => id));
        // A present category store represents explicit user choices, including
        // deletion of an empty initial category. Only restore definitions that
        // are currently required by a persisted Gear item.
        const usedIds = new Set(items.map((item) => item?.category).filter(isValidGearCategoryId));
        const missing = buildInitialGearCategories(items)
            .filter(({ id }) => usedIds.has(id) && !knownIds.has(id));
        if (missing.length === 0 && !renamed.changed) return { ok: true, categories };
        const repaired = [...categories, ...missing];
        const saved = saveGearCategories(repaired, storage);
        return saved.ok
            ? { ok: true, categories: cloneCategories(repaired), repaired: true }
            : { ok: false, categories: cloneCategories(repaired), reason: saved.reason };
    } catch (_) {
        return { ok: false, categories: buildInitialGearCategories(items), reason: 'read-failed' };
    }
}

function createStableCategoryId(categories) {
    const ids = new Set(categories.map(({ id }) => id));
    let id;
    do {
        const suffix = globalThis.crypto?.randomUUID
            ? globalThis.crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
        id = `category-${suffix}`;
    } while (ids.has(id));
    return id;
}

function validateUniqueName(categories, name, currentId = null) {
    const normalized = normalizeCategoryName(name);
    if (!normalized || normalized === '全て') return { ok: false, reason: 'invalid-name' };
    const duplicate = categories.some((category) => (
        category.id !== currentId
        && category.name.toLocaleLowerCase('ja-JP') === normalized.toLocaleLowerCase('ja-JP')
    ));
    return duplicate ? { ok: false, reason: 'duplicate-name' } : { ok: true, name: normalized };
}

export function addGearCategory(categories, name) {
    if (!isValidCategoryCollection(categories)) return { ok: false, reason: 'invalid-data', categories: cloneCategories(DEFAULT_GEAR_CATEGORIES) };
    const validation = validateUniqueName(categories, name);
    if (!validation.ok) return { ...validation, categories: cloneCategories(categories) };
    const category = { id: createStableCategoryId(categories), name: validation.name };
    return { ok: true, category, categories: [...cloneCategories(categories), category] };
}

export function renameGearCategory(categories, id, name) {
    if (!isValidCategoryCollection(categories) || !categories.some((category) => category.id === id)) {
        return { ok: false, reason: 'not-found', categories: cloneCategories(categories) };
    }
    const validation = validateUniqueName(categories, name, id);
    if (!validation.ok) return { ...validation, categories: cloneCategories(categories) };
    return {
        ok: true,
        categories: categories.map((category) => category.id === id
            ? { id: category.id, name: validation.name }
            : { ...category })
    };
}

// Category definitions deliberately have no link to a destination category.
// The UI verifies that the latest Gear list has no matching item before calling
// this function, so deleting an empty category never rewrites Gear data.
export function deleteGearCategory(categories, id) {
    if (!isValidCategoryCollection(categories) || !categories.some((category) => category.id === id)) {
        return { ok: false, reason: 'not-found', categories: cloneCategories(categories) };
    }
    return {
        ok: true,
        categories: categories
            .filter((category) => category.id !== id)
            .map((category) => ({ ...category }))
    };
}

export function getGearCategoryName(categories, id) {
    return categories.find((category) => category.id === id)?.name || legacyNameForId(id);
}
