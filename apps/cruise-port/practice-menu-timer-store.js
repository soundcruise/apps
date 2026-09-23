import { readStorageValue, assertStorageUnchanged, acceptStorageValues } from './storage-conflict.js?v=0.52.4';
export const PRACTICE_TIMER_SCHEMA_VERSION = 2;
export const PRACTICE_TIMER_STORAGE_KEY = 'cruisePort.practiceTimer';
export const PRACTICE_TIMER_MAX_SECONDS = 30 * 24 * 60 * 60;

function createSessionId(now = new Date()) {
    return globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isIsoDate(value) {
    return typeof value === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
        && !Number.isNaN(Date.parse(value));
}

export function createStoppedPracticeTimer() {
    return { version: PRACTICE_TIMER_SCHEMA_VERSION, running: false, paused: false, sessionId: null, startedAt: null, pausedAt: null, pauseIntervals: [] };
}

export function isValidPracticeTimer(timer) {
    if (!timer || typeof timer !== 'object' || Array.isArray(timer) || timer.version !== PRACTICE_TIMER_SCHEMA_VERSION) {
        return false;
    }
    if (!Array.isArray(timer.pauseIntervals) || typeof timer.paused !== 'boolean') return false;
    if (!timer.running) return !timer.paused && timer.sessionId === null && timer.startedAt === null
        && timer.pausedAt === null && timer.pauseIntervals.length === 0;
    if (!(typeof timer.sessionId === 'string'
        && timer.sessionId.length > 0
        && timer.sessionId.length <= 160
        && isIsoDate(timer.startedAt))) return false;
    if (timer.paused !== isIsoDate(timer.pausedAt)) return false;
    const start = Date.parse(timer.startedAt);
    let previous = start;
    for (const interval of timer.pauseIntervals) {
        if (!isIsoDate(interval?.startedAt) || !isIsoDate(interval?.endedAt)) return false;
        const from = Date.parse(interval.startedAt);
        const to = Date.parse(interval.endedAt);
        if (from < previous || to < from) return false;
        previous = to;
    }
    return !timer.paused || Date.parse(timer.pausedAt) >= previous;
}

export function loadPracticeTimer(storage) {
    const fallback = createStoppedPracticeTimer();
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        const rawValue = readStorageValue(storage, PRACTICE_TIMER_STORAGE_KEY);
        if (rawValue === null) return { ok: true, timer: fallback };
        const parsed = JSON.parse(rawValue);
        const migrated = parsed?.version === 1 && typeof parsed.running === 'boolean'
            && (parsed.running ? typeof parsed.sessionId === 'string' && isIsoDate(parsed.startedAt)
                : parsed.sessionId === null && parsed.startedAt === null)
            ? { ...parsed, version: 2, paused: false, pausedAt: null, pauseIntervals: [] }
            : parsed;
        return isValidPracticeTimer(migrated)
            ? { ok: true, timer: { ...migrated, pauseIntervals: migrated.pauseIntervals.map((interval) => ({ ...interval })) }, ...(migrated !== parsed ? { migrated: true } : {}) }
            : { ok: false, timer: fallback, reason: 'invalid-data' };
    } catch (_) {
        return { ok: false, timer: fallback, reason: 'read-failed' };
    }
}

export function savePracticeTimer(timer, storage) {
    if (!isValidPracticeTimer(timer)) return { ok: false, reason: 'invalid-data' };
    let previousValue;
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        assertStorageUnchanged(storage, [PRACTICE_TIMER_STORAGE_KEY]);
        previousValue = storage.getItem(PRACTICE_TIMER_STORAGE_KEY);
        storage.setItem(PRACTICE_TIMER_STORAGE_KEY, JSON.stringify(timer));
        acceptStorageValues(storage, [PRACTICE_TIMER_STORAGE_KEY]);
        return { ok: true };
    } catch (_) {
        try {
            if (previousValue === null) storage.removeItem(PRACTICE_TIMER_STORAGE_KEY);
            else if (previousValue !== undefined) storage.setItem(PRACTICE_TIMER_STORAGE_KEY, previousValue);
        } catch (_) {
            // The caller retains the last known-good in-memory value.
        }
        return { ok: false, reason: 'write-failed' };
    }
}

export function startPracticeTimer(timer, now = new Date()) {
    if (timer.running) return { started: false, timer: { ...timer } };
    return {
        started: true,
        timer: {
            version: PRACTICE_TIMER_SCHEMA_VERSION,
            running: true,
            paused: false,
            sessionId: createSessionId(now),
            startedAt: now.toISOString(),
            pausedAt: null,
            pauseIntervals: []
        }
    };
}

export function getPracticeTimerElapsedSeconds(timer, now = new Date()) {
    if (!timer.running || !isIsoDate(timer.startedAt)) return 0;
    return getActiveDurationSeconds(timer.startedAt, now.toISOString(), timer.pauseIntervals, timer.pausedAt);
}

export function getActiveDurationSeconds(startedAt, endedAt, pauseIntervals = [], pausedAt = null) {
    const start = Date.parse(startedAt);
    const end = Math.max(start, Date.parse(endedAt));
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    const pauses = [...pauseIntervals, ...(pausedAt ? [{ startedAt: pausedAt, endedAt: endedAt }] : [])]
        .reduce((sum, interval) => {
            const from = Math.max(start, Date.parse(interval.startedAt));
            const to = Math.min(end, Date.parse(interval.endedAt));
            return sum + (Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, to - from) : 0);
        }, 0);
    const elapsed = Math.floor((end - start - pauses) / 1000);
    if (!Number.isFinite(elapsed)) return 0;
    return Math.min(PRACTICE_TIMER_MAX_SECONDS, Math.max(0, elapsed));
}

export function pausePracticeTimer(timer, now = new Date()) {
    if (!timer.running || timer.paused) return { paused: false, timer: { ...timer } };
    const last = timer.pauseIntervals.at(-1)?.endedAt || timer.startedAt;
    const pausedAt = new Date(Math.max(now.getTime(), Date.parse(last))).toISOString();
    return { paused: true, timer: { ...timer, paused: true, pausedAt } };
}

export function resumePracticeTimer(timer, now = new Date()) {
    if (!timer.running || !timer.paused) return { resumed: false, timer: { ...timer } };
    const endedAt = new Date(Math.max(now.getTime(), Date.parse(timer.pausedAt))).toISOString();
    return { resumed: true, timer: { ...timer, paused: false, pausedAt: null,
        pauseIntervals: [...timer.pauseIntervals, { startedAt: timer.pausedAt, endedAt }] } };
}

export function stopPracticeTimer(timer, now = new Date()) {
    if (!timer.running) return { stopped: false, timer: { ...timer }, session: null };
    const startedAtMs = Date.parse(timer.startedAt);
    const lastPauseEnd = timer.pauseIntervals.at(-1)?.endedAt || timer.startedAt;
    const safeEndedAt = new Date(Math.max(now.getTime(), startedAtMs, Date.parse(lastPauseEnd), timer.paused ? Date.parse(timer.pausedAt) : startedAtMs));
    const pauseIntervals = timer.paused
        ? [...timer.pauseIntervals, { startedAt: timer.pausedAt, endedAt: safeEndedAt.toISOString() }]
        : timer.pauseIntervals.map((interval) => ({ ...interval }));
    return {
        stopped: true,
        timer: createStoppedPracticeTimer(),
        session: {
            sessionId: timer.sessionId,
            startedAt: timer.startedAt,
            endedAt: safeEndedAt.toISOString(),
            durationSeconds: getActiveDurationSeconds(timer.startedAt, safeEndedAt.toISOString(), pauseIntervals),
            pauseIntervals
        }
    };
}

export function formatPracticeTimerDuration(totalSeconds) {
    const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatPracticeSessionDuration(totalSeconds) {
    const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
    if (safeSeconds < 60) return `${safeSeconds}秒`;
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    if (hours === 0) return `${minutes}分${String(seconds).padStart(2, '0')}秒`;
    return `${hours}時間${String(minutes).padStart(2, '0')}分${String(seconds).padStart(2, '0')}秒`;
}
