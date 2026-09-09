export const PRACTICE_PROGRESS_SCHEMA_VERSION = 3;
export const PRACTICE_PROGRESS_STORAGE_KEY = 'cruisePort.practiceProgress';

export const PRACTICE_COMPLETION_TYPE = Object.freeze({
    complete: 'complete',
    partial: 'partial'
});

const MAX_COUNT = Number.MAX_SAFE_INTEGER;

function createCycleId(now = new Date()) {
    const randomPart = globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : Math.random().toString(36).slice(2, 12);
    return `${now.toISOString()}-${randomPart}`;
}

export function createEmptyPracticeProgress(now = new Date()) {
    return {
        version: PRACTICE_PROGRESS_SCHEMA_VERSION,
        cycleId: createCycleId(now),
        checkedPracticeIds: [],
        countedPracticeIds: [],
        totalCounts: {},
        completionPending: null
    };
}

function hasUniqueStrings(values) {
    return Array.isArray(values)
        && values.every((value) => typeof value === 'string' && value.length > 0)
        && new Set(values).size === values.length;
}

function isValidCount(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT;
}

function isIsoDate(value) {
    return typeof value === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
        && !Number.isNaN(Date.parse(value));
}

function isValidCompletionPending(value, cycleId) {
    return value === null || Boolean(
        value
        && typeof value === 'object'
        && !Array.isArray(value)
        && Object.values(PRACTICE_COMPLETION_TYPE).includes(value.type)
        && value.cycleId === cycleId
        && isIsoDate(value.createdAt)
    );
}

function isValidPracticeProgressVersion(progress, version) {
    return Boolean(
        progress
        && typeof progress === 'object'
        && !Array.isArray(progress)
        && progress.version === version
        && typeof progress.cycleId === 'string'
        && progress.cycleId.length > 0
        && progress.cycleId.length <= 160
        && hasUniqueStrings(progress.checkedPracticeIds)
        && hasUniqueStrings(progress.countedPracticeIds)
        && progress.checkedPracticeIds.every((id) => progress.countedPracticeIds.includes(id))
        && progress.totalCounts
        && typeof progress.totalCounts === 'object'
        && !Array.isArray(progress.totalCounts)
        && Object.entries(progress.totalCounts).every(([id, count]) => id.length > 0 && isValidCount(count))
        && progress.countedPracticeIds.every((id) => Object.hasOwn(progress.totalCounts, id))
        && (version < 3 || isValidCompletionPending(progress.completionPending, progress.cycleId))
        && (version !== 1 || isValidCount(progress.completeCount))
    );
}

export function isValidPracticeProgress(progress) {
    return isValidPracticeProgressVersion(progress, PRACTICE_PROGRESS_SCHEMA_VERSION);
}

function cloneProgress(progress) {
    return {
        version: PRACTICE_PROGRESS_SCHEMA_VERSION,
        cycleId: progress.cycleId,
        checkedPracticeIds: [...progress.checkedPracticeIds],
        countedPracticeIds: [...progress.countedPracticeIds],
        totalCounts: { ...progress.totalCounts },
        completionPending: progress.version >= 3
            && isValidCompletionPending(progress.completionPending, progress.cycleId)
            && progress.completionPending
            ? { ...progress.completionPending }
            : null
    };
}

export function loadPracticeProgress(storage = window.localStorage, now = new Date()) {
    const fallback = createEmptyPracticeProgress(now);
    try {
        const rawValue = storage.getItem(PRACTICE_PROGRESS_STORAGE_KEY);
        if (rawValue === null) return { ok: true, progress: fallback };
        const parsed = JSON.parse(rawValue);
        const current = isValidPracticeProgress(parsed);
        const legacy = isValidPracticeProgressVersion(parsed, 1)
            || isValidPracticeProgressVersion(parsed, 2);
        if (!current && !legacy) {
            return { ok: false, progress: fallback, reason: 'invalid-data' };
        }
        return legacy
            ? { ok: true, progress: cloneProgress(parsed), migrated: true }
            : { ok: true, progress: cloneProgress(parsed) };
    } catch (error) {
        return { ok: false, progress: fallback, reason: 'read-failed' };
    }
}

export function savePracticeProgress(progress, storage = window.localStorage) {
    if (!isValidPracticeProgress(progress)) return { ok: false, reason: 'invalid-data' };
    let previousValue;
    try {
        previousValue = storage.getItem(PRACTICE_PROGRESS_STORAGE_KEY);
        storage.setItem(PRACTICE_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
        return { ok: true };
    } catch (error) {
        try {
            if (previousValue === null) storage.removeItem(PRACTICE_PROGRESS_STORAGE_KEY);
            else if (previousValue !== undefined) storage.setItem(PRACTICE_PROGRESS_STORAGE_KEY, previousValue);
        } catch (restoreError) {
            // The caller keeps the last successfully loaded in-memory state.
        }
        return { ok: false, reason: 'write-failed' };
    }
}

export function setPracticeChecked(progress, practiceId, checked) {
    const next = cloneProgress(progress);
    if (next.completionPending) return { progress: next, countAdded: false, changed: false };
    const wasChecked = next.checkedPracticeIds.includes(practiceId);
    const wasCounted = next.countedPracticeIds.includes(practiceId);

    if (!checked) {
        next.checkedPracticeIds = next.checkedPracticeIds.filter((id) => id !== practiceId);
        return { progress: next, countAdded: false, changed: wasChecked };
    }

    if (!wasChecked) next.checkedPracticeIds.push(practiceId);
    if (!wasCounted) {
        next.countedPracticeIds.push(practiceId);
        next.totalCounts[practiceId] = Math.min(MAX_COUNT, (next.totalCounts[practiceId] || 0) + 1);
    }
    return { progress: next, countAdded: !wasCounted, changed: !wasChecked || !wasCounted };
}

export function startNextPracticeCycle(progress, now = new Date()) {
    return {
        ...cloneProgress(progress),
        cycleId: createCycleId(now),
        checkedPracticeIds: [],
        countedPracticeIds: [],
        completionPending: null
    };
}

export function canCompletePracticeCycle(progress, activePracticeIds) {
    return Array.isArray(activePracticeIds)
        && activePracticeIds.length > 0
        && activePracticeIds.every((id) => progress.checkedPracticeIds.includes(id));
}

export function beginPracticeCompletion(progress, type, activePracticeIds = [], now = new Date()) {
    const next = cloneProgress(progress);
    if (next.completionPending) {
        return { started: false, duplicate: true, progress: next };
    }
    if (
        !Object.values(PRACTICE_COMPLETION_TYPE).includes(type)
        || (type === PRACTICE_COMPLETION_TYPE.complete && !canCompletePracticeCycle(next, activePracticeIds))
    ) {
        return { started: false, duplicate: false, progress: next };
    }
    next.completionPending = {
        type,
        cycleId: next.cycleId,
        createdAt: now.toISOString()
    };
    return { started: true, duplicate: false, progress: next };
}

export function finishPracticeCompletion(progress, now = new Date()) {
    const current = cloneProgress(progress);
    if (!current.completionPending) {
        return { finished: false, completionType: null, completedCycleId: null, progress: current };
    }
    return {
        finished: true,
        completionType: current.completionPending.type,
        completedCycleId: current.cycleId,
        progress: startNextPracticeCycle(current, now)
    };
}

export function clearPracticeCurrentCheck(progress, practiceId) {
    const next = cloneProgress(progress);
    next.checkedPracticeIds = next.checkedPracticeIds.filter((id) => id !== practiceId);
    return next;
}

export function removePracticeFromProgress(progress, practiceId) {
    const next = cloneProgress(progress);
    next.checkedPracticeIds = next.checkedPracticeIds.filter((id) => id !== practiceId);
    next.countedPracticeIds = next.countedPracticeIds.filter((id) => id !== practiceId);
    delete next.totalCounts[practiceId];
    return next;
}

export function resetPracticeTotalCount(progress, practiceId) {
    const next = cloneProgress(progress);
    next.totalCounts[practiceId] = 0;
    return next;
}
