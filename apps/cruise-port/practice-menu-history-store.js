export const PRACTICE_HISTORY_SCHEMA_VERSION = 1;
export const PRACTICE_HISTORY_STORAGE_KEY = 'cruisePort.practiceHistory';
export const PRACTICE_HISTORY_MAX_EVENTS = 8000;

export const PRACTICE_HISTORY_EVENT_TYPE = Object.freeze({
    practiceCompleted: 'practice-completed',
    cycleCompleted: 'cycle-completed'
});

const EVENT_TYPES = new Set(Object.values(PRACTICE_HISTORY_EVENT_TYPE));

function isIsoDate(value) {
    return typeof value === 'string'
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
        && !Number.isNaN(Date.parse(value));
}

export function toLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isValidLocalDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isValidEvent(event) {
    if (
        !event
        || typeof event !== 'object'
        || Array.isArray(event)
        || typeof event.id !== 'string'
        || event.id.length === 0
        || !EVENT_TYPES.has(event.type)
        || !isIsoDate(event.timestamp)
        || !isValidLocalDate(event.localDate)
        || typeof event.cycleId !== 'string'
        || event.cycleId.length === 0
    ) return false;

    if (event.type === PRACTICE_HISTORY_EVENT_TYPE.cycleCompleted) {
        return event.practiceId === null
            && event.practiceName === null
            && event.durationMinutes === null
            && event.appId === null;
    }
    return typeof event.practiceId === 'string'
        && event.practiceId.length > 0
        && typeof event.practiceName === 'string'
        && event.practiceName.trim().length > 0
        && event.practiceName.length <= 100
        && Number.isInteger(event.durationMinutes)
        && event.durationMinutes >= 1
        && event.durationMinutes <= 999
        && (event.appId === null || (typeof event.appId === 'string' && event.appId.length > 0 && event.appId.length <= 134));
}

function createEventId(now) {
    return globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createEmptyPracticeHistory() {
    return { version: PRACTICE_HISTORY_SCHEMA_VERSION, events: [] };
}

export function isValidPracticeHistory(history) {
    return Boolean(
        history
        && typeof history === 'object'
        && !Array.isArray(history)
        && history.version === PRACTICE_HISTORY_SCHEMA_VERSION
        && Array.isArray(history.events)
        && history.events.length <= PRACTICE_HISTORY_MAX_EVENTS
        && history.events.every(isValidEvent)
        && new Set(history.events.map((event) => event.id)).size === history.events.length
    );
}

function cloneHistory(history) {
    return { version: history.version, events: history.events.map((event) => ({ ...event })) };
}

export function loadPracticeHistory(storage = window.localStorage) {
    const fallback = createEmptyPracticeHistory();
    try {
        const rawValue = storage.getItem(PRACTICE_HISTORY_STORAGE_KEY);
        if (rawValue === null) return { ok: true, history: fallback };
        const parsed = JSON.parse(rawValue);
        if (!isValidPracticeHistory(parsed)) return { ok: false, history: fallback, reason: 'invalid-data' };
        return { ok: true, history: cloneHistory(parsed) };
    } catch (error) {
        return { ok: false, history: fallback, reason: 'read-failed' };
    }
}

export function savePracticeHistory(history, storage = window.localStorage) {
    if (!isValidPracticeHistory(history)) return { ok: false, reason: 'invalid-data' };
    let previousValue;
    try {
        previousValue = storage.getItem(PRACTICE_HISTORY_STORAGE_KEY);
        storage.setItem(PRACTICE_HISTORY_STORAGE_KEY, JSON.stringify(history));
        return { ok: true };
    } catch (error) {
        try {
            if (previousValue === null) storage.removeItem(PRACTICE_HISTORY_STORAGE_KEY);
            else if (previousValue !== undefined) storage.setItem(PRACTICE_HISTORY_STORAGE_KEY, previousValue);
        } catch (restoreError) {
            // The caller keeps the last successfully loaded in-memory state.
        }
        return { ok: false, reason: 'write-failed' };
    }
}

export function createPracticeCompletedEvent(item, cycleId, now = new Date()) {
    return {
        id: createEventId(now),
        type: PRACTICE_HISTORY_EVENT_TYPE.practiceCompleted,
        timestamp: now.toISOString(),
        localDate: toLocalDateKey(now),
        cycleId,
        practiceId: item.id,
        practiceName: item.name,
        durationMinutes: item.durationMinutes,
        appId: item.appId
    };
}

export function createCycleCompletedEvent(cycleId, now = new Date()) {
    return {
        id: createEventId(now),
        type: PRACTICE_HISTORY_EVENT_TYPE.cycleCompleted,
        timestamp: now.toISOString(),
        localDate: toLocalDateKey(now),
        cycleId,
        practiceId: null,
        practiceName: null,
        durationMinutes: null,
        appId: null
    };
}

export function appendPracticeHistoryEvent(history, event) {
    if (!isValidEvent(event)) return { ok: false, history: cloneHistory(history), reason: 'invalid-event' };
    const events = [...history.events, { ...event }].slice(-PRACTICE_HISTORY_MAX_EVENTS);
    return { ok: true, history: { version: PRACTICE_HISTORY_SCHEMA_VERSION, events } };
}

export function getPracticeHistoryForDate(history, localDate) {
    return history.events
        .filter((event) => event.localDate === localDate)
        .sort((first, second) => first.timestamp.localeCompare(second.timestamp));
}

export function createPracticeCalendarMonth(year, monthIndex, history) {
    const firstWeekday = new Date(year, monthIndex, 1).getDay();
    const dayCount = new Date(year, monthIndex + 1, 0).getDate();
    const activity = new Map();
    history.events.forEach((event) => {
        const [eventYear, eventMonth] = event.localDate.split('-').map(Number);
        if (eventYear !== year || eventMonth !== monthIndex + 1) return;
        const current = activity.get(event.localDate) || { count: 0, completed: false };
        current.count += 1;
        current.completed ||= event.type === PRACTICE_HISTORY_EVENT_TYPE.cycleCompleted;
        activity.set(event.localDate, current);
    });

    const cells = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= dayCount; day += 1) {
        const localDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        cells.push({ day, localDate, ...(activity.get(localDate) || { count: 0, completed: false }) });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
}
