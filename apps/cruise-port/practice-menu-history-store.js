import { readStorageValue, assertStorageUnchanged, acceptStorageValues } from './storage-conflict.js?v=0.24.0';
export const PRACTICE_HISTORY_SCHEMA_VERSION = 4;
export const PRACTICE_HISTORY_STORAGE_KEY = 'cruisePort.practiceHistory';
export const PRACTICE_HISTORY_MAX_EVENTS = 8000;
export const PRACTICE_SESSION_MAX_SECONDS = 30 * 24 * 60 * 60;

export const PRACTICE_HISTORY_EVENT_TYPE = Object.freeze({
    practiceCompleted: 'practice-completed',
    cycleCompleted: 'cycle-completed',
    practiceSession: 'practice-session'
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

function isValidEvent(event, version = PRACTICE_HISTORY_SCHEMA_VERSION) {
    if (
        !event
        || typeof event !== 'object'
        || Array.isArray(event)
        || typeof event.id !== 'string'
        || event.id.length === 0
        || !EVENT_TYPES.has(event.type)
        || (version === 1 && event.type === PRACTICE_HISTORY_EVENT_TYPE.practiceSession)
        || !isIsoDate(event.timestamp)
        || !isValidLocalDate(event.localDate)
    ) return false;

    if (event.type === PRACTICE_HISTORY_EVENT_TYPE.practiceSession) {
        return event.cycleId === null
            && typeof event.sessionId === 'string'
            && event.sessionId.length > 0
            && event.sessionId.length <= 160
            && isIsoDate(event.startedAt)
            && isIsoDate(event.endedAt)
            && Date.parse(event.endedAt) >= Date.parse(event.startedAt)
            && Number.isSafeInteger(event.durationSeconds)
            && event.durationSeconds >= 0
            && event.durationSeconds <= PRACTICE_SESSION_MAX_SECONDS
            && event.practiceId === null
            && event.practiceName === null
            && event.durationMinutes === null
            && event.appId === null;
    }

    if (typeof event.cycleId !== 'string' || event.cycleId.length === 0) return false;

    if (event.type === PRACTICE_HISTORY_EVENT_TYPE.cycleCompleted) {
        return event.practiceId === null
            && event.practiceName === null
            && event.durationMinutes === null
            && event.appId === null;
    }
    const validSessionId = version < 3
        || event.sessionId === null
        || (
            typeof event.sessionId === 'string'
            && event.sessionId.length > 0
            && event.sessionId.length <= 160
        );
    const validMeasurement = version < 4
        || event.measuredDurationSeconds === undefined
        || (event.sessionId && Number.isSafeInteger(event.measuredDurationSeconds)
            && event.measuredDurationSeconds >= 0
            && event.measuredDurationSeconds <= PRACTICE_SESSION_MAX_SECONDS);
    return validSessionId && validMeasurement
        && typeof event.practiceId === 'string'
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

function isValidPracticeHistoryVersion(history, version) {
    return Boolean(
        history
        && typeof history === 'object'
        && !Array.isArray(history)
        && history.version === version
        && Array.isArray(history.events)
        && history.events.length <= PRACTICE_HISTORY_MAX_EVENTS
        && history.events.every((event) => isValidEvent(event, version))
        && new Set(history.events.map((event) => event.id)).size === history.events.length
        && (version < 4 || history.activeSessionTiming == null || (
            typeof history.activeSessionTiming.sessionId === 'string'
            && history.activeSessionTiming.sessionId.length > 0
            && history.activeSessionTiming.sessionId.length <= 160
            && isIsoDate(history.activeSessionTiming.startedAt)
            && isIsoDate(history.activeSessionTiming.lastCheckedAt)
            && history.activeSessionTiming.lastCheckedAt >= history.activeSessionTiming.startedAt
        ))
    );
}

export function isValidPracticeHistory(history) {
    return isValidPracticeHistoryVersion(history, PRACTICE_HISTORY_SCHEMA_VERSION);
}

function migrateHistory(history) {
    return {
        version: PRACTICE_HISTORY_SCHEMA_VERSION,
        events: history.events.map((event) => event.type === PRACTICE_HISTORY_EVENT_TYPE.practiceCompleted
            ? { ...event, sessionId: event.sessionId ?? null }
            : { ...event }),
        ...(history.activeSessionTiming ? { activeSessionTiming: { ...history.activeSessionTiming } } : {})
    };
}

function cloneHistory(history) {
    return migrateHistory(history);
}

export function loadPracticeHistory(storage) {
    const fallback = createEmptyPracticeHistory();
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        const rawValue = readStorageValue(storage, PRACTICE_HISTORY_STORAGE_KEY);
        if (rawValue === null) return { ok: true, history: fallback };
        const parsed = JSON.parse(rawValue);
        const current = isValidPracticeHistory(parsed);
        const legacy = isValidPracticeHistoryVersion(parsed, 1)
            || isValidPracticeHistoryVersion(parsed, 2)
            || isValidPracticeHistoryVersion(parsed, 3);
        if (!current && !legacy) return { ok: false, history: fallback, reason: 'invalid-data' };
        return legacy
            ? { ok: true, history: cloneHistory(parsed), migrated: true }
            : { ok: true, history: cloneHistory(parsed) };
    } catch (error) {
        return { ok: false, history: fallback, reason: 'read-failed' };
    }
}

export function savePracticeHistory(history, storage) {
    if (!isValidPracticeHistory(history)) return { ok: false, reason: 'invalid-data' };
    let previousValue;
    try {
        if (storage === undefined) storage = globalThis.localStorage;
        assertStorageUnchanged(storage, [PRACTICE_HISTORY_STORAGE_KEY]);
        previousValue = storage.getItem(PRACTICE_HISTORY_STORAGE_KEY);
        storage.setItem(PRACTICE_HISTORY_STORAGE_KEY, JSON.stringify(history));
        acceptStorageValues(storage, [PRACTICE_HISTORY_STORAGE_KEY]);
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

export function createPracticeCompletedEvent(item, cycleId, now = new Date(), sessionId = null) {
    return {
        id: createEventId(now),
        type: PRACTICE_HISTORY_EVENT_TYPE.practiceCompleted,
        timestamp: now.toISOString(),
        localDate: toLocalDateKey(now),
        cycleId,
        practiceId: item.id,
        practiceName: item.name,
        durationMinutes: item.durationMinutes,
        appId: item.appId,
        sessionId
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

export function createPracticeSessionEvent({ sessionId, startedAt, endedAt, durationSeconds }) {
    const endedDate = new Date(endedAt);
    return {
        id: createEventId(endedDate),
        type: PRACTICE_HISTORY_EVENT_TYPE.practiceSession,
        timestamp: endedDate.toISOString(),
        localDate: toLocalDateKey(endedDate),
        cycleId: null,
        sessionId,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: endedDate.toISOString(),
        durationSeconds,
        practiceId: null,
        practiceName: null,
        durationMinutes: null,
        appId: null
    };
}

// Freeze intervals before removing a boundary. Old v1-v3 data needs no eager rewrite.
function snapshotSessionDurations(events, session) {
    let previous = Date.parse(session.startedAt);
    const end = Date.parse(session.endedAt);
    events.filter((event) => event.type === PRACTICE_HISTORY_EVENT_TYPE.practiceCompleted
        && event.sessionId === session.sessionId)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .forEach((event) => {
            const checked = Math.min(end, Math.max(previous, Date.parse(event.timestamp)));
            if (event.measuredDurationSeconds === undefined) {
                event.measuredDurationSeconds = Math.min(PRACTICE_SESSION_MAX_SECONDS, Math.floor((checked - previous) / 1000));
            }
            previous = checked;
        });
}

function retainRunningSessionTiming(history, timer) {
    if (!timer?.running || !timer.sessionId || !isIsoDate(timer.startedAt)) return;
    const children = history.events.filter((event) => event.type === PRACTICE_HISTORY_EVENT_TYPE.practiceCompleted
        && event.sessionId === timer.sessionId);
    const previousAnchor = history.activeSessionTiming?.sessionId === timer.sessionId
        ? history.activeSessionTiming.lastCheckedAt : timer.startedAt;
    const lastCheckedAt = children.reduce((latest, event) => event.timestamp > latest ? event.timestamp : latest, previousAnchor);
    snapshotSessionDurations(history.events, { ...timer, endedAt: lastCheckedAt });
    // Only timing is retained when a running child is deleted: no name, count or deleted event.
    history.activeSessionTiming = { sessionId: timer.sessionId, startedAt: timer.startedAt, lastCheckedAt };
}

export function deletePracticeHistoryEvent(history, eventId, runningTimer = null) {
    if (!isValidPracticeHistory(history)) return { ok: false, history, reason: 'invalid-data' };
    const target = history.events.find((event) => event.id === eventId);
    if (!target) return { ok: false, history, reason: 'not-found' };
    const next = cloneHistory(history);
    const session = next.events.find((event) => event.type === PRACTICE_HISTORY_EVENT_TYPE.practiceSession
        && event.sessionId === target.sessionId);
    if (session) snapshotSessionDurations(next.events, session);
    else if (target.sessionId === runningTimer?.sessionId) retainRunningSessionTiming(next, runningTimer);
    const ids = new Set([eventId]);
    if (target.type === PRACTICE_HISTORY_EVENT_TYPE.practiceSession) {
        next.events.forEach((event) => {
            if (event.type === PRACTICE_HISTORY_EVENT_TYPE.practiceCompleted && event.sessionId === target.sessionId) ids.add(event.id);
        });
        if (next.activeSessionTiming?.sessionId === target.sessionId) delete next.activeSessionTiming;
    }
    next.events = next.events.filter((event) => !ids.has(event.id));
    return { ok: true, history: next, deletedIds: [...ids] };
}

export function appendPracticeHistoryEvent(history, event, runningTimer = null) {
    if (!isValidEvent(event)) return { ok: false, history: cloneHistory(history), reason: 'invalid-event' };
    const duplicate = history.events.some((current) => current.id === event.id
        || (
            event.type === PRACTICE_HISTORY_EVENT_TYPE.practiceSession
            && current.type === PRACTICE_HISTORY_EVENT_TYPE.practiceSession
            && current.sessionId === event.sessionId
        )
        || (
            event.type === PRACTICE_HISTORY_EVENT_TYPE.cycleCompleted
            && current.type === PRACTICE_HISTORY_EVENT_TYPE.cycleCompleted
            && current.cycleId === event.cycleId
        ));
    if (duplicate) return { ok: true, history: cloneHistory(history), duplicate: true };
    const next = cloneHistory(history);
    if (event.type === PRACTICE_HISTORY_EVENT_TYPE.practiceCompleted && event.sessionId && runningTimer?.running && event.sessionId === runningTimer.sessionId) {
        retainRunningSessionTiming(next, runningTimer);
        const previous = Date.parse(next.activeSessionTiming.lastCheckedAt);
        const checked = Math.max(previous, Date.parse(event.timestamp));
        event = { ...event, measuredDurationSeconds: Math.min(PRACTICE_SESSION_MAX_SECONDS, Math.floor((checked - previous) / 1000)) };
        next.activeSessionTiming.lastCheckedAt = new Date(checked).toISOString();
    }
    next.events.push({ ...event });
    if (event.type === PRACTICE_HISTORY_EVENT_TYPE.practiceSession && next.activeSessionTiming?.sessionId === event.sessionId) {
        delete next.activeSessionTiming;
    }
    if (next.events.length > PRACTICE_HISTORY_MAX_EVENTS) {
        const affectedSessions = new Set(next.events.slice(0, -PRACTICE_HISTORY_MAX_EVENTS).map((current) => current.sessionId).filter(Boolean));
        next.events.filter((current) => current.type === PRACTICE_HISTORY_EVENT_TYPE.practiceSession && affectedSessions.has(current.sessionId))
            .forEach((session) => snapshotSessionDurations(next.events, session));
        next.events = next.events.slice(-PRACTICE_HISTORY_MAX_EVENTS);
    }
    return { ok: true, history: next };
}

export function getPracticeHistoryForDate(history, localDate) {
    return history.events
        .filter((event) => event.localDate === localDate)
        .sort((first, second) => first.timestamp.localeCompare(second.timestamp));
}

export function createPracticeDayHistoryView(history, localDate) {
    const sessionEvents = history.events.filter((event) => event.type === PRACTICE_HISTORY_EVENT_TYPE.practiceSession);
    const sessionsById = new Map(sessionEvents.map((event) => [event.sessionId, event]));
    const childrenBySessionId = new Map();
    history.events.forEach((event, stableIndex) => {
        if (
            event.type !== PRACTICE_HISTORY_EVENT_TYPE.practiceCompleted
            || !event.sessionId
            || !sessionsById.has(event.sessionId)
        ) return;
        const children = childrenBySessionId.get(event.sessionId) || [];
        children.push({ event, stableIndex });
        childrenBySessionId.set(event.sessionId, children);
    });
    childrenBySessionId.forEach((children, sessionId) => {
        const session = sessionsById.get(sessionId);
        let previousTimestamp = Date.parse(session.startedAt);
        const endedTimestamp = Date.parse(session.endedAt);
        children.sort((first, second) => (
            first.event.timestamp.localeCompare(second.event.timestamp)
            || first.stableIndex - second.stableIndex
        ));
        children.forEach((child) => {
            const checkedTimestamp = Math.min(endedTimestamp, Math.max(previousTimestamp, Date.parse(child.event.timestamp)));
            child.measuredDurationSeconds = child.event.measuredDurationSeconds
                ?? Math.floor((checkedTimestamp - previousTimestamp) / 1000);
            previousTimestamp = checkedTimestamp;
        });
    });

    return getPracticeHistoryForDate(history, localDate)
        .filter((event) => event.type !== PRACTICE_HISTORY_EVENT_TYPE.cycleCompleted)
        .filter((event) => !(
            event.type === PRACTICE_HISTORY_EVENT_TYPE.practiceCompleted
            && event.sessionId
            && sessionsById.has(event.sessionId)
        ))
        .map((event) => {
            if (event.type !== PRACTICE_HISTORY_EVENT_TYPE.practiceSession) {
                return { kind: 'event', event, children: [] };
            }
            const children = (childrenBySessionId.get(event.sessionId) || []).map(({ event: child, measuredDurationSeconds }) => ({
                ...child,
                measuredDurationSeconds
            }));
            return {
                kind: 'session',
                event,
                children,
                displayDurationSeconds: children.length > 0
                    ? children.reduce((total, child) => total + child.measuredDurationSeconds, 0)
                    : event.durationSeconds
            };
        });
}

export function createPracticeCalendarDaySummary(localDate, history, calendarNotes = []) {
    const events = history.events.filter((event) => event.localDate === localDate);
    const notes = calendarNotes
        .filter((note) => note.localDate === localDate)
        .sort((first, second) => String(first.createdAt || '').localeCompare(String(second.createdAt || '')));
    return {
        localDate,
        practiced: events.some((event) => (
            event.type === PRACTICE_HISTORY_EVENT_TYPE.practiceCompleted
            || event.type === PRACTICE_HISTORY_EVENT_TYPE.practiceSession
            || event.type === PRACTICE_HISTORY_EVENT_TYPE.cycleCompleted
        )),
        count: events.length,
        completed: events.some((event) => event.type === PRACTICE_HISTORY_EVENT_TYPE.cycleCompleted),
        notes,
        memoIcons: notes.map((note) => note.icon || 'memo')
    };
}

export function createPracticeCalendarMonth(year, monthIndex, history, calendarNotes = []) {
    const firstWeekday = new Date(year, monthIndex, 1).getDay();
    const dayCount = new Date(year, monthIndex + 1, 0).getDate();

    const cells = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= dayCount; day += 1) {
        const localDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const summary = createPracticeCalendarDaySummary(localDate, history, calendarNotes);
        cells.push({ day, hasMemo: summary.notes.length > 0, ...summary });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
}
