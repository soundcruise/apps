export const PRACTICE_TIMER_SCHEMA_VERSION = 1;
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
    return { version: PRACTICE_TIMER_SCHEMA_VERSION, running: false, sessionId: null, startedAt: null };
}

export function isValidPracticeTimer(timer) {
    if (!timer || typeof timer !== 'object' || Array.isArray(timer) || timer.version !== PRACTICE_TIMER_SCHEMA_VERSION) {
        return false;
    }
    if (!timer.running) return timer.sessionId === null && timer.startedAt === null;
    return typeof timer.sessionId === 'string'
        && timer.sessionId.length > 0
        && timer.sessionId.length <= 160
        && isIsoDate(timer.startedAt);
}

export function loadPracticeTimer(storage = window.localStorage) {
    const fallback = createStoppedPracticeTimer();
    try {
        const rawValue = storage.getItem(PRACTICE_TIMER_STORAGE_KEY);
        if (rawValue === null) return { ok: true, timer: fallback };
        const parsed = JSON.parse(rawValue);
        return isValidPracticeTimer(parsed)
            ? { ok: true, timer: { ...parsed } }
            : { ok: false, timer: fallback, reason: 'invalid-data' };
    } catch (_) {
        return { ok: false, timer: fallback, reason: 'read-failed' };
    }
}

export function savePracticeTimer(timer, storage = window.localStorage) {
    if (!isValidPracticeTimer(timer)) return { ok: false, reason: 'invalid-data' };
    let previousValue;
    try {
        previousValue = storage.getItem(PRACTICE_TIMER_STORAGE_KEY);
        storage.setItem(PRACTICE_TIMER_STORAGE_KEY, JSON.stringify(timer));
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
            sessionId: createSessionId(now),
            startedAt: now.toISOString()
        }
    };
}

export function getPracticeTimerElapsedSeconds(timer, now = new Date()) {
    if (!timer.running || !isIsoDate(timer.startedAt)) return 0;
    const elapsed = Math.floor((now.getTime() - Date.parse(timer.startedAt)) / 1000);
    if (!Number.isFinite(elapsed)) return 0;
    return Math.min(PRACTICE_TIMER_MAX_SECONDS, Math.max(0, elapsed));
}

export function stopPracticeTimer(timer, now = new Date()) {
    if (!timer.running) return { stopped: false, timer: { ...timer }, session: null };
    const startedAtMs = Date.parse(timer.startedAt);
    const safeEndedAt = new Date(Math.max(now.getTime(), startedAtMs));
    return {
        stopped: true,
        timer: createStoppedPracticeTimer(),
        session: {
            sessionId: timer.sessionId,
            startedAt: timer.startedAt,
            endedAt: safeEndedAt.toISOString(),
            durationSeconds: getPracticeTimerElapsedSeconds(timer, now)
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
    if (hours === 0) return `${minutes}分`;
    return minutes ? `${hours}時間${minutes}分` : `${hours}時間`;
}
