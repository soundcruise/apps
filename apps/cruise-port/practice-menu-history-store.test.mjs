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
    createPracticeCompletedEvent,
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
    const renamed = { ...item, name: '変更後' };
    assert.equal(event.practiceName, 'コードフォーム練習');
    assert.notEqual(event.practiceName, renamed.name);
});
test('cycle completion event is distinct and date grouping keeps both event types', () => {
    const now = new Date(2026, 8, 8, 10, 0, 0, 0);
    let history = createEmptyPracticeHistory();
    history = appendPracticeHistoryEvent(history, createPracticeCompletedEvent(item, 'cycle-a', now)).history;
    history = appendPracticeHistoryEvent(history, createCycleCompletedEvent('cycle-a', now)).history;
    const events = getPracticeHistoryForDate(history, '2026-09-08');
    assert.deepEqual(events.map((event) => event.type), ['practice-completed', 'cycle-completed']);
});

test('calendar month marks practice days and complete days without UTC conversion', () => {
    const practiceDate = new Date(2026, 8, 8, 23, 59, 0, 0);
    const completeDate = new Date(2026, 8, 9, 0, 1, 0, 0);
    let history = createEmptyPracticeHistory();
    history = appendPracticeHistoryEvent(history, createPracticeCompletedEvent(item, 'cycle-a', practiceDate)).history;
    history = appendPracticeHistoryEvent(history, createCycleCompletedEvent('cycle-a', completeDate)).history;
    const cells = createPracticeCalendarMonth(2026, 8, history);
    assert.equal(cells.find((cell) => cell?.day === 8).count, 1);
    assert.equal(cells.find((cell) => cell?.day === 8).completed, false);
    assert.equal(cells.find((cell) => cell?.day === 9).completed, true);
    assert.equal(toLocalDateKey(practiceDate), '2026-09-08');
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
