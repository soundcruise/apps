import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PRACTICE_HISTORY_EVENT_TYPE,
    PRACTICE_HISTORY_MAX_EVENTS,
    PRACTICE_HISTORY_STORAGE_KEY,
    appendPracticeHistoryEvent,
    createCycleCompletedEvent,
    createEmptyPracticeHistory,
    createPracticeCalendarMonth,
    createPracticeCalendarDaySummary,
    createPracticeCompletedEvent,
    createPracticeDayHistoryView,
    createPracticeSessionEvent,
    getPracticeHistoryForDate,
    loadPracticeHistory,
    savePracticeHistory,
    toLocalDateKey
} from './practice-menu-history-store.js';

class FakeStorage {
    constructor(values = {}) { this.values = new Map(Object.entries(values)); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}

const item = {
    id: 'practice-a',
    name: 'コードフォーム練習',
    durationMinutes: 15,
    appId: 'chord'
};

test('individual history stores local date and stable display snapshots', () => {
    const now = new Date(2026, 8, 8, 23, 30, 0, 0);
    const event = createPracticeCompletedEvent(item, 'cycle-a', now);
    assert.equal(event.type, PRACTICE_HISTORY_EVENT_TYPE.practiceCompleted);
    assert.equal(event.localDate, '2026-09-08');
    assert.equal(event.practiceName, item.name);
    assert.equal(event.durationMinutes, 15);
    assert.equal(event.appId, 'chord');
    assert.equal(event.sessionId, null);
    const renamed = { ...item, name: '変更後' };
    assert.equal(event.practiceName, 'コードフォーム練習');
    assert.notEqual(event.practiceName, renamed.name);
});

test('timer-running completion records a session id while timer-free completion stays independent', () => {
    const now = new Date(2026, 8, 8, 10, 0);
    const linked = createPracticeCompletedEvent(item, 'cycle-a', now, 'session-a');
    const independent = createPracticeCompletedEvent(item, 'cycle-b', now);
    assert.equal(linked.sessionId, 'session-a');
    assert.equal(independent.sessionId, null);
});
test('cycle completion event is distinct and date grouping keeps both event types', () => {
    const now = new Date(2026, 8, 8, 10, 0, 0, 0);
    let history = createEmptyPracticeHistory();
    history = appendPracticeHistoryEvent(history, createPracticeCompletedEvent(item, 'cycle-a', now)).history;
    history = appendPracticeHistoryEvent(history, createCycleCompletedEvent('cycle-a', now)).history;
    const events = getPracticeHistoryForDate(history, '2026-09-08');
    assert.deepEqual(events.map((event) => event.type), ['practice-completed', 'cycle-completed']);
    const duplicate = appendPracticeHistoryEvent(
        history,
        { ...createCycleCompletedEvent('cycle-a', new Date(2026, 8, 8, 10, 1)), id: 'different-event-id' }
    );
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.history.events.length, 2);
});

test('timer session history stores bounded timestamps and appears with existing events', () => {
    const startedAt = '2026-09-08T01:00:00.000Z';
    const endedAt = '2026-09-08T01:42:11.000Z';
    const session = createPracticeSessionEvent({
        sessionId: 'session-a',
        startedAt,
        endedAt,
        durationSeconds: 2531
    });
    let history = createEmptyPracticeHistory();
    history = appendPracticeHistoryEvent(history, session).history;
    const events = getPracticeHistoryForDate(history, toLocalDateKey(new Date(endedAt)));
    assert.equal(events[0].type, PRACTICE_HISTORY_EVENT_TYPE.practiceSession);
    assert.equal(events[0].sessionId, 'session-a');
    assert.equal(events[0].durationSeconds, 2531);
    const duplicate = appendPracticeHistoryEvent(history, { ...session, id: 'different-event-id' });
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.history.events.length, 1);
});

test('calendar month marks practice days and complete days without UTC conversion', () => {
    const practiceDate = new Date(2026, 8, 8, 23, 59, 0, 0);
    const completeDate = new Date(2026, 8, 9, 0, 1, 0, 0);
    let history = createEmptyPracticeHistory();
    history = appendPracticeHistoryEvent(history, createPracticeCompletedEvent(item, 'cycle-a', practiceDate)).history;
    history = appendPracticeHistoryEvent(history, createCycleCompletedEvent('cycle-a', completeDate)).history;
    const cells = createPracticeCalendarMonth(2026, 8, history, [{ localDate: '2026-09-20' }]);
    assert.equal(cells.find((cell) => cell?.day === 8).count, 1);
    assert.equal(cells.find((cell) => cell?.day === 8).practiced, true);
    assert.equal(cells.find((cell) => cell?.day === 8).completed, false);
    assert.equal(cells.find((cell) => cell?.day === 9).completed, true);
    assert.equal(cells.find((cell) => cell?.day === 20).hasMemo, true);
    assert.equal(toLocalDateKey(practiceDate), '2026-09-08');
});

test('session view groups matching practices in timestamp order without duplicating flat source events', () => {
    const first = createPracticeCompletedEvent(item, 'cycle-a', new Date('2026-09-08T01:05:00.000Z'), 'session-a');
    const second = createPracticeCompletedEvent(
        { ...item, id: 'practice-b', name: 'リズム練習', durationMinutes: 20 },
        'cycle-a',
        new Date('2026-09-08T01:10:00.000Z'),
        'session-a'
    );
    const independent = createPracticeCompletedEvent(
        { ...item, id: 'practice-c', name: 'タイマー外', durationMinutes: 5 },
        'cycle-b',
        new Date('2026-09-08T02:00:00.000Z')
    );
    const session = createPracticeSessionEvent({
        sessionId: 'session-a',
        startedAt: '2026-09-08T01:00:00.000Z',
        endedAt: '2026-09-08T01:20:00.000Z',
        durationSeconds: 1200
    });
    let history = createEmptyPracticeHistory();
    [second, first, session, independent].forEach((event) => {
        history = appendPracticeHistoryEvent(history, event).history;
    });
    const view = createPracticeDayHistoryView(history, '2026-09-08');
    assert.equal(history.events.length, 4);
    assert.deepEqual(view.map(({ kind }) => kind), ['session', 'event']);
    assert.deepEqual(view[0].children.map(({ practiceName }) => practiceName), ['コードフォーム練習', 'リズム練習']);
    assert.deepEqual(view[0].children.map(({ measuredDurationSeconds }) => measuredDurationSeconds), [300, 300]);
    assert.equal(view[1].event.practiceName, 'タイマー外');
    assert.equal(Object.hasOwn(view[1].event, 'measuredDurationSeconds'), false);
    assert.equal(Object.hasOwn(first, 'measuredDurationSeconds'), false);
    assert.equal(Object.hasOwn(history.events.find(({ id }) => id === first.id), 'measuredDurationSeconds'), false);
});

test('measured child durations retain seconds, timestamp order, and may differ from session total', () => {
    const sessionId = 'session-duration-boundaries';
    const first = createPracticeCompletedEvent(
        { ...item, id: 'practice-short', name: '短い練習' },
        'cycle-duration',
        new Date('2026-09-08T01:00:42.000Z'),
        sessionId
    );
    const second = createPracticeCompletedEvent(
        { ...item, id: 'practice-long', name: '長い練習' },
        'cycle-duration',
        new Date('2026-09-08T02:04:06.000Z'),
        sessionId
    );
    const session = createPracticeSessionEvent({
        sessionId,
        startedAt: '2026-09-08T01:00:00.000Z',
        endedAt: '2026-09-08T02:10:00.000Z',
        durationSeconds: 4200
    });
    let history = createEmptyPracticeHistory();
    [second, session, first].forEach((event) => {
        history = appendPracticeHistoryEvent(history, event).history;
    });
    const [entry] = createPracticeDayHistoryView(history, '2026-09-08');
    assert.deepEqual(entry.children.map(({ practiceName }) => practiceName), ['短い練習', '長い練習']);
    assert.deepEqual(entry.children.map(({ measuredDurationSeconds }) => measuredDurationSeconds), [42, 3804]);
    assert.equal(entry.children.reduce((sum, child) => sum + child.measuredDurationSeconds, 0), 3846);
    assert.equal(entry.event.durationSeconds, 4200);
});

test('unmatched running-session completion remains visible until its session event exists', () => {
    let history = createEmptyPracticeHistory();
    history = appendPracticeHistoryEvent(
        history,
        createPracticeCompletedEvent(item, 'cycle-a', new Date('2026-09-08T01:05:00.000Z'), 'running-session')
    ).history;
    const view = createPracticeDayHistoryView(history, '2026-09-08');
    assert.equal(view.length, 1);
    assert.equal(view[0].kind, 'event');
});

test('multiple sessions on one day keep their own children and calendar uses one practiced marker', () => {
    let history = createEmptyPracticeHistory();
    for (const [sessionId, hour] of [['session-a', 1], ['session-b', 2]]) {
        history = appendPracticeHistoryEvent(history, createPracticeCompletedEvent(
            { ...item, id: `practice-${sessionId}`, name: sessionId },
            'cycle-a',
            new Date(`2026-09-08T0${hour}:05:00.000Z`),
            sessionId
        )).history;
        history = appendPracticeHistoryEvent(history, createPracticeSessionEvent({
            sessionId,
            startedAt: `2026-09-08T0${hour}:00:00.000Z`,
            endedAt: `2026-09-08T0${hour}:10:00.000Z`,
            durationSeconds: 600
        })).history;
    }
    const view = createPracticeDayHistoryView(history, '2026-09-08');
    assert.equal(view.length, 2);
    assert.deepEqual(view.map(({ children }) => children.length), [1, 1]);
    assert.equal(createPracticeCalendarDaySummary('2026-09-08', history).practiced, true);
});

test('history persists separately and malformed data is never overwritten', () => {
    const storage = new FakeStorage();
    let history = createEmptyPracticeHistory();
    history = appendPracticeHistoryEvent(
        history,
        createPracticeCompletedEvent(item, 'cycle-a', new Date(2026, 8, 8, 12, 0))
    ).history;
    assert.deepEqual(savePracticeHistory(history, storage), { ok: true });
    assert.deepEqual(loadPracticeHistory(storage), { ok: true, history });

    const malformed = '{broken';
    storage.setItem(PRACTICE_HISTORY_STORAGE_KEY, malformed);
    assert.equal(loadPracticeHistory(storage).ok, false);
    assert.equal(storage.getItem(PRACTICE_HISTORY_STORAGE_KEY), malformed);
});

test('legacy v1 history migrates without dropping cycle-completed events', () => {
    const complete = createCycleCompletedEvent('legacy-cycle', new Date(2026, 8, 8, 12, 0));
    const legacy = { version: 1, events: [complete] };
    const storage = new FakeStorage({ [PRACTICE_HISTORY_STORAGE_KEY]: JSON.stringify(legacy) });
    const loaded = loadPracticeHistory(storage);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.migrated, true);
    assert.equal(loaded.history.version, 3);
    assert.equal(loaded.history.events[0].type, PRACTICE_HISTORY_EVENT_TYPE.cycleCompleted);
});

test('legacy v2 practice events migrate with null session ids', () => {
    const event = createPracticeCompletedEvent(item, 'legacy-cycle', new Date(2026, 8, 8, 12, 0));
    delete event.sessionId;
    const legacy = { version: 2, events: [event] };
    const storage = new FakeStorage({ [PRACTICE_HISTORY_STORAGE_KEY]: JSON.stringify(legacy) });
    const loaded = loadPracticeHistory(storage);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.migrated, true);
    assert.equal(loaded.history.version, 3);
    assert.equal(loaded.history.events[0].sessionId, null);
});

test('history retains deleted-item snapshots and caps storage by dropping oldest events', () => {
    let history = createEmptyPracticeHistory();
    const base = createPracticeCompletedEvent(item, 'cycle-a', new Date(2026, 8, 8, 12, 0));
    history.events = Array.from({ length: PRACTICE_HISTORY_MAX_EVENTS }, (_, index) => ({
        ...base,
        id: `event-${index}`,
        timestamp: new Date(Date.UTC(2020, 0, 1, 0, 0, index)).toISOString()
    }));
    const newest = { ...base, id: 'event-newest' };
    const capped = appendPracticeHistoryEvent(history, newest).history;
    assert.equal(capped.events.length, PRACTICE_HISTORY_MAX_EVENTS);
    assert.equal(capped.events[0].id, 'event-1');
    assert.equal(capped.events.at(-1).id, 'event-newest');
    assert.equal(capped.events.at(-1).practiceName, item.name);
});
