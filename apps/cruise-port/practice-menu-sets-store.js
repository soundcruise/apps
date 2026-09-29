import { readStorageValue, assertStorageUnchanged, acceptStorageValues } from './storage-conflict.js?v=0.59.3';

// Practice menu sets are the user-facing "プリセット" of the Practice Menu. They are
// unrelated to practice-menu-presets.js (name suggestions for new menus).
// A set only references practice menu ids; menu names, order and visibility always
// come from cruisePort.practiceMenus, and check state stays in practiceProgress.
export const PRACTICE_MENU_SETS_SCHEMA_VERSION = 1;
export const PRACTICE_MENU_SETS_STORAGE_KEY = 'cruisePort.practiceMenuSets';
// Device-local UI preference; deliberately not a Cloud Sync managed key.
export const PRACTICE_MENU_SET_SELECTION_STORAGE_KEY = 'cruisePort.practiceMenuSetSelection';
export const ALL_PRACTICE_MENUS_SET_ID = 'all';
export const PRACTICE_MENU_SET_LIMITS = Object.freeze({ name: 100, itemIds: 2000 });

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
// Same durable journal storage-conflict.js keeps for other Port collections: Cloud
// Sync deletes a set only when this device recorded an explicit user deletion.
const DELETION_INTENT_KEY = 'cruisePort.syncDeletionIntent.v1';
const DELETION_INTENT_TYPE = 'practice_menu_set';
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

function isIsoDate(value) {
    return typeof value === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
        && !Number.isNaN(Date.parse(value));
}

export function isValidPracticeMenuSetName(name) {
    return typeof name === 'string'
        && name.trim().length > 0
        && name.length <= PRACTICE_MENU_SET_LIMITS.name
        && !CONTROL_CHARACTERS.test(name);
}

export function isValidPracticeMenuSet(set) {
    return Boolean(
        set
        && typeof set === 'object'
        && !Array.isArray(set)
        && Object.keys(set).every((key) => ['id', 'name', 'itemIds', 'createdAt', 'updatedAt'].includes(key))
        && typeof set.id === 'string'
        && SAFE_ID.test(set.id)
        && set.id !== ALL_PRACTICE_MENUS_SET_ID
        && isValidPracticeMenuSetName(set.name)
        && Array.isArray(set.itemIds)
        && set.itemIds.length <= PRACTICE_MENU_SET_LIMITS.itemIds
        && set.itemIds.every((id) => typeof id === 'string' && SAFE_ID.test(id))
        && new Set(set.itemIds).size === set.itemIds.length
        && isIsoDate(set.createdAt)
        && isIsoDate(set.updatedAt)
    );
}

function hasUniqueIds(sets) {
    return new Set(sets.map((set) => set.id)).size === sets.length;
}

function cloneSet(set) {
    return { ...set, itemIds: [...set.itemIds] };
}

export function loadPracticeMenuSets(storage) {
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        const rawValue = readStorageValue(storage, PRACTICE_MENU_SETS_STORAGE_KEY);
        // Existing users start with no sets: only 「全ての練習メニュー」 is shown.
        if (rawValue === null) return { ok: true, items: [] };
        const parsed = JSON.parse(rawValue);
        if (
            !parsed
            || typeof parsed !== 'object'
            || parsed.version !== PRACTICE_MENU_SETS_SCHEMA_VERSION
            || !Array.isArray(parsed.items)
            || !parsed.items.every(isValidPracticeMenuSet)
            || !hasUniqueIds(parsed.items)
        ) {
            return { ok: false, items: [], reason: 'invalid-data' };
        }
        return { ok: true, items: parsed.items.map(cloneSet) };
    } catch (error) {
        return { ok: false, items: [], reason: 'read-failed' };
    }
}

export function savePracticeMenuSets(items, storage) {
    if (!Array.isArray(items) || !items.every(isValidPracticeMenuSet) || !hasUniqueIds(items)) {
        return { ok: false, reason: 'invalid-data' };
    }
    let previousValue;
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        assertStorageUnchanged(storage, [PRACTICE_MENU_SETS_STORAGE_KEY]);
        previousValue = storage.getItem(PRACTICE_MENU_SETS_STORAGE_KEY);
        storage.setItem(PRACTICE_MENU_SETS_STORAGE_KEY, JSON.stringify({
            version: PRACTICE_MENU_SETS_SCHEMA_VERSION,
            items
        }));
        updateDeletionIntents(storage, previousValue, items);
        acceptStorageValues(storage, [PRACTICE_MENU_SETS_STORAGE_KEY]);
        return { ok: true };
    } catch (error) {
        try {
            if (previousValue === null) storage.removeItem(PRACTICE_MENU_SETS_STORAGE_KEY);
            else if (previousValue !== undefined) storage.setItem(PRACTICE_MENU_SETS_STORAGE_KEY, previousValue);
        } catch (restoreError) {
            // The UI keeps its last successfully loaded in-memory state.
        }
        return { ok: false, reason: 'write-failed' };
    }
}

function storedSetIds(raw) {
    if (raw === null) return new Set();
    try {
        const items = JSON.parse(raw)?.items;
        return Array.isArray(items) ? new Set(items.map((item) => item?.id).filter((id) => typeof id === 'string')) : null;
    } catch (error) {
        return null;
    }
}

function updateDeletionIntents(storage, previousRaw, items) {
    const before = storedSetIds(previousRaw);
    if (!before) return;
    try {
        const oldRaw = storage.getItem(DELETION_INTENT_KEY);
        const parsed = JSON.parse(oldRaw || '{}');
        const intents = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        const after = new Set(items.map((set) => set.id));
        for (const id of after) delete intents[`${DELETION_INTENT_TYPE}/${id}`];
        for (const id of before) if (!after.has(id)) intents[`${DELETION_INTENT_TYPE}/${id}`] = true;
        const nextRaw = JSON.stringify(intents);
        if (Object.keys(intents).length) {
            if (nextRaw !== oldRaw) storage.setItem(DELETION_INTENT_KEY, nextRaw);
        } else if (oldRaw !== null) storage.removeItem(DELETION_INTENT_KEY);
    } catch (error) {
        // A missing intent blocks the cloud deletion without blocking the local save.
    }
}

function uniqueIds(itemIds) {
    return [...new Set(itemIds)];
}

function createSetId(existingIds) {
    let id;
    do {
        id = globalThis.crypto?.randomUUID
            ? globalThis.crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    } while (existingIds.has(id) || id === ALL_PRACTICE_MENUS_SET_ID);
    return id;
}

// A new set must include at least one existing practice menu.
export function createPracticeMenuSet({ name, itemIds }, existingSets, practiceMenus, now = new Date()) {
    const menuIds = new Set(practiceMenus.map((item) => item.id));
    const selected = uniqueIds(Array.isArray(itemIds) ? itemIds : []).filter((id) => menuIds.has(id));
    if (!isValidPracticeMenuSetName(name)) return { ok: false, reason: 'name-required' };
    if (selected.length === 0) return { ok: false, reason: 'items-required' };
    const timestamp = now.toISOString();
    const set = {
        id: createSetId(new Set(existingSets.map((item) => item.id))),
        name: name.trim(),
        itemIds: selected,
        createdAt: timestamp,
        updatedAt: timestamp
    };
    return { ok: true, set, items: [...existingSets.map(cloneSet), set] };
}

// Saving an edit also drops references to menus that no longer exist.
export function updatePracticeMenuSet(existingSets, id, { name, itemIds }, practiceMenus, now = new Date()) {
    const current = existingSets.find((set) => set.id === id);
    if (!current) return { ok: false, reason: 'not-found' };
    const menuIds = new Set(practiceMenus.map((item) => item.id));
    const selected = uniqueIds(Array.isArray(itemIds) ? itemIds : []).filter((itemId) => menuIds.has(itemId));
    if (!isValidPracticeMenuSetName(name)) return { ok: false, reason: 'name-required' };
    if (selected.length === 0) return { ok: false, reason: 'items-required' };
    const set = { ...cloneSet(current), name: name.trim(), itemIds: selected, updatedAt: now.toISOString() };
    return { ok: true, set, items: existingSets.map((item) => item.id === id ? set : cloneSet(item)) };
}

export function deletePracticeMenuSet(existingSets, id) {
    const items = existingSets.filter((set) => set.id !== id).map(cloneSet);
    return { found: items.length !== existingSets.length, items };
}

export function findPracticeMenuSet(sets, id) {
    return id && id !== ALL_PRACTICE_MENUS_SET_ID ? sets.find((set) => set.id === id) || null : null;
}

// Menus shown for a selection, always in the master Practice Menu order.
// `visibleMenus` is the existing 「全ての練習メニュー」 list (hidden menus excluded).
// Missing ids are ignored and never crash; the set itself is kept.
export function getPracticeMenuSetItems(visibleMenus, set) {
    if (!set) return visibleMenus;
    const included = new Set(set.itemIds);
    return visibleMenus.filter((item) => included.has(item.id));
}

// Stale selections (deleted locally, removed by sync, never existed) fall back to All.
export function resolvePracticeMenuSetSelection(sets, selectedId) {
    return findPracticeMenuSet(sets, selectedId) ? selectedId : ALL_PRACTICE_MENUS_SET_ID;
}

export function loadPracticeMenuSetSelection(storage) {
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        const value = storage.getItem(PRACTICE_MENU_SET_SELECTION_STORAGE_KEY);
        return typeof value === 'string' && (value === ALL_PRACTICE_MENUS_SET_ID || SAFE_ID.test(value))
            ? value
            : ALL_PRACTICE_MENUS_SET_ID;
    } catch (error) {
        return ALL_PRACTICE_MENUS_SET_ID;
    }
}

export function savePracticeMenuSetSelection(selectedId, storage) {
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        if (selectedId === ALL_PRACTICE_MENUS_SET_ID) storage.removeItem(PRACTICE_MENU_SET_SELECTION_STORAGE_KEY);
        else storage.setItem(PRACTICE_MENU_SET_SELECTION_STORAGE_KEY, selectedId);
        return true;
    } catch (error) {
        return false;
    }
}
