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
    deletePracticeHistoryEvent,
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
    const appended = appendPracticeHistoryEvent(createEmptyPracticeHistory(), independent, { running: false, sessionId: null, startedAt: null });
    assert.equal(appended.ok, true);
    assert.equal(appended.history.activeSessionTiming, undefined);
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
    assert.equal(loaded.history.version, 4);
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
    assert.equal(loaded.history.version, 4);
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

function deletionFixture() {
    const children = [12, 27, 35].map((minute, index) => createPracticeCompletedEvent(
        { ...item, id: `child-${index}` }, 'cycle-delete', new Date(`2026-09-08T01:${minute}:03.000Z`), 'session-delete'
    ));
    const session = createPracticeSessionEvent({ sessionId: 'session-delete', startedAt: '2026-09-08T01:00:00.000Z', endedAt: '2026-09-08T01:42:18.000Z', durationSeconds: 2538 });
    const standalone = createPracticeCompletedEvent(item, 'standalone', new Date('2026-09-08T02:00:00.000Z'));
    const cycle = createCycleCompletedEvent('cycle-delete', new Date('2026-09-08T01:35:03.000Z'));
    return { history: { version: 4, events: [...children, session, standalone, cycle] }, children, session, standalone, cycle };
}

test('delete standalone and cycle affects only selected event ID, never the input object', () => {
    const { history, standalone, cycle } = deletionFixture();
    const before = structuredClone(history);
    for (const target of [standalone, cycle]) {
        const result = deletePracticeHistoryEvent(history, target.id);
        assert.equal(result.ok, true);
        assert.deepEqual(result.deletedIds, [target.id]);
        assert.deepEqual(result.history.events.map(e => e.id), history.events.filter(e => e.id !== target.id).map(e => e.id));
    }
    assert.deepEqual(history, before);
    assert.equal(deletePracticeHistoryEvent(history, 'missing').reason, 'not-found');
});

test('delete middle/first children freezes original intervals through repeated deletion and reload', () => {
    const { history, children, session } = deletionFixture();
    const storage = new FakeStorage();
    const removedMiddle = deletePracticeHistoryEvent(history, children[1].id).history;
    const view = createPracticeDayHistoryView(removedMiddle, '2026-09-08').find(entry => entry.kind === 'session');
    assert.deepEqual(view.children.map(e => e.measuredDurationSeconds), [723, 480]);
    assert.deepEqual(view.event, session);
    savePracticeHistory(removedMiddle, storage);
    const reloaded = loadPracticeHistory(storage).history;
    const removedFirst = deletePracticeHistoryEvent(reloaded, children[0].id).history;
    assert.deepEqual(createPracticeDayHistoryView(removedFirst, '2026-09-08').find(e => e.kind === 'session').children.map(e => e.measuredDurationSeconds), [480]);
    assert.equal(history.events.length, 6);
});

test('session deletion removes only its group, including cross-date children; count/progress keys stay unchanged', () => {
    const { history, session, children, standalone, cycle } = deletionFixture();
    history.events[0].localDate = '2026-09-07';
    const result = deletePracticeHistoryEvent(history, session.id);
    assert.deepEqual(new Set(result.deletedIds), new Set([session.id, ...children.map(e => e.id)]));
    assert.deepEqual(result.history.events, [standalone, cycle]);
    const storage = new FakeStorage({ 'cruisePort.practiceProgress': '{"totalCounts":{"practice-a":10}}', 'cruisePort.practiceMenus': 'sentinel' });
    savePracticeHistory(result.history, storage);
    assert.equal(storage.getItem('cruisePort.practiceProgress'), '{"totalCounts":{"practice-a":10}}');
    assert.equal(storage.getItem('cruisePort.practiceMenus'), 'sentinel');
});

test('last history deletion clears practiced mark but retains calendar memo icon', () => {
    const { history, standalone } = deletionFixture();
    history.events = [standalone];
    const notes = [{ localDate: standalone.localDate, icon: 'live' }];
    assert.equal(createPracticeCalendarDaySummary(standalone.localDate, history, notes).practiced, true);
    const result = deletePracticeHistoryEvent(history, standalone.id);
    const summary = createPracticeCalendarDaySummary(standalone.localDate, result.history, notes);
    assert.equal(summary.practiced, false);
    assert.deepEqual(summary.memoIcons, ['live']);
});

test('failed delete save retains stored history and may safely retry', () => {
    const { history, standalone } = deletionFixture();
    const raw = JSON.stringify(history);
    const storage = new FakeStorage({ [PRACTICE_HISTORY_STORAGE_KEY]: raw });
    storage.setItem = () => { throw new Error('quota'); };
    const result = deletePracticeHistoryEvent(history, standalone.id);
    assert.equal(savePracticeHistory(result.history, storage).ok, false);
    assert.equal(storage.getItem(PRACTICE_HISTORY_STORAGE_KEY), raw);
    assert.equal(history.events.some(e => e.id === standalone.id), true);
});

test('v3 migration remains read-only and supports stable deletion without rewriting unrelated events', () => {
    const { history, children } = deletionFixture();
    const raw = JSON.stringify({ ...history, version: 3 });
    const storage = new FakeStorage({ [PRACTICE_HISTORY_STORAGE_KEY]: raw });
    const loaded = loadPracticeHistory(storage);
    assert.equal(loaded.migrated, true);
    assert.equal(storage.getItem(PRACTICE_HISTORY_STORAGE_KEY), raw);
    assert.equal(loaded.history.version, 4);
    const result = deletePracticeHistoryEvent(loaded.history, children[1].id);
    assert.equal(createPracticeDayHistoryView(result.history, '2026-09-08').find(e => e.kind === 'session').children[1].measuredDurationSeconds, 480);
});

test('deleting latest running child preserves timing boundary for next check, including reload', () => {
    const timer = { running: true, sessionId: 'running-delete', startedAt: '2026-09-08T01:00:00.000Z' };
    const first = createPracticeCompletedEvent(item, 'running-cycle', new Date('2026-09-08T01:05:00.000Z'), timer.sessionId);
    let history = appendPracticeHistoryEvent(createEmptyPracticeHistory(), first, timer).history;
    assert.equal(history.events[0].measuredDurationSeconds, 300);
    history = deletePracticeHistoryEvent(history, first.id, timer).history;
    assert.equal(history.events.length, 0);
    const storage = new FakeStorage();
    savePracticeHistory(history, storage);
    history = loadPracticeHistory(storage).history;
    const next = createPracticeCompletedEvent({ ...item, id: 'next' }, 'running-cycle', new Date('2026-09-08T01:07:00.000Z'), timer.sessionId);
    history = appendPracticeHistoryEvent(history, next, timer).history;
    assert.equal(history.events[0].measuredDurationSeconds, 120);
    history = appendPracticeHistoryEvent(history, createPracticeSessionEvent({ ...timer, endedAt: '2026-09-08T01:10:00.000Z', durationSeconds: 600 })).history;
    assert.equal(history.activeSessionTiming, undefined);
    assert.equal(createPracticeDayHistoryView(history, '2026-09-08')[0].children[0].measuredDurationSeconds, 120);
});

test('cap pruning freezes only affected sessions before removing a child timing boundary', () => {
    const { history, children, session, standalone } = deletionFixture();
    history.events = [children[0], ...Array.from({ length: PRACTICE_HISTORY_MAX_EVENTS - 4 }, (_, i) => ({ ...standalone, id: `unrelated-${i}` })), children[1], children[2], session];
    const result = appendPracticeHistoryEvent(history, createCycleCompletedEvent('qa-prune')).history;
    assert.equal(result.events.length, PRACTICE_HISTORY_MAX_EVENTS);
    const entry = createPracticeDayHistoryView(result, '2026-09-08').find(e => e.kind === 'session');
    assert.deepEqual(entry.children.map(e => e.measuredDurationSeconds), [900, 480]);
});
