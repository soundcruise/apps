import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { getPracticeCrossDayNotice } from './practice-cross-day-display.js';
import { createPracticeSessionEvent, createPracticeCompletedEvent, createPracticeDayHistoryView,
    createPracticeCalendarDaySummary, savePracticeHistory, loadPracticeHistory,
    PRACTICE_HISTORY_STORAGE_KEY } from './practice-menu-history-store.js';
import { buildPracticeAnalytics } from './practice-analytics.js';

function memory() {
    const data = new Map();
    return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function history({ crossDay = true, sessionId = 'audit-session', endDay = 28 } = {}) {
    const start = new Date(2026, 8, 27, 23, crossDay ? 50 : 0);
    const check = new Date(2026, 8, 27, 23, crossDay ? 55 : 10);
    const end = crossDay ? new Date(2026, 8, endDay, 0, 10) : new Date(2026, 8, 27, 23, 30);
    const session = createPracticeSessionEvent({ sessionId, startedAt: start.toISOString(), endedAt: end.toISOString(), durationSeconds: (end - start) / 1000 });
    const child = createPracticeCompletedEvent({ id: 'menu', name: '監査', appId: null, durationMinutes: 10 }, 'cycle', check, sessionId);
    return { version: 5, events: [child, session] };
}
function verifyCrossDay(h) {
    const before = JSON.stringify(h);
    assert.equal(createPracticeCalendarDaySummary('2026-09-27', h).practiced, true);
    assert.equal(createPracticeDayHistoryView(h, '2026-09-27').length, 0);
    assert.equal(getPracticeCrossDayNotice(h, '2026-09-27'), '日付をまたいだ練習は、9月28日の練習記録にまとめて表示されています。');
    const next = createPracticeDayHistoryView(h, '2026-09-28');
    assert.equal(next.length, 1); assert.equal(next[0].kind, 'session');
    assert.equal(next[0].children.length, 1); assert.equal(next[0].displayDurationSeconds, 1200);
    assert.equal(getPracticeCrossDayNotice(h, '2026-09-28'), '');
    assert.equal(buildPracticeAnalytics(h).totalSeconds, 1200);
    assert.equal(JSON.stringify(h), before, 'presentation must not mutate any history fields');
}

test('A: same-day 23:00–23:30 session keeps its child, duration and original display', () => {
    const h = history({ crossDay: false }); const before = JSON.stringify(h);
    const view = createPracticeDayHistoryView(h, '2026-09-27');
    assert.equal(getPracticeCrossDayNotice(h, '2026-09-27'), '');
    assert.equal(view[0].kind, 'session'); assert.equal(view[0].children.length, 1);
    assert.equal(view[0].displayDurationSeconds, 1800); assert.equal(JSON.stringify(h), before);
});
test('B: cross-day child gives a previous-day notice while next-day details and 1200 seconds are unchanged', () => verifyCrossDay(history()));
test('C: an independent previous-day record stays visible alongside the cross-day notice', () => {
    const h = history();
    const independent = createPracticeCompletedEvent({ id: 'other', name: '独立記録', appId: null, durationMinutes: 5 }, 'other-cycle', new Date(2026, 8, 27, 12));
    h.events.push(independent);
    const view = createPracticeDayHistoryView(h, '2026-09-27');
    assert.equal(view.length, 1); assert.equal(view[0].event.id, independent.id);
    assert.match(getPracticeCrossDayNotice(h, '2026-09-27'), /9月28日/);
});
test('D: multiple destination dates never assert one end date', () => {
    const h = history(); h.events.push(...history({ sessionId: 'second', endDay: 29 }).events);
    assert.equal(getPracticeCrossDayNotice(h, '2026-09-27'), '日付をまたいだ練習は、終了日の練習記録にまとめて表示されています。');
});
test('E: persisted/reloaded history follows the same rule without rewriting dates or duration', () => {
    const h = history(), storage = memory();
    assert.equal(savePracticeHistory(h, storage).ok, true);
    const raw = storage.getItem(PRACTICE_HISTORY_STORAGE_KEY);
    const reloaded = loadPracticeHistory(storage); assert.equal(reloaded.ok, true);
    verifyCrossDay(reloaded.history); assert.equal(storage.getItem(PRACTICE_HISTORY_STORAGE_KEY), raw);
});
test('F: real Port adapter transfer preserves history and the same presentation rule', async () => {
    const sourceStorage = memory(), targetStorage = memory();
    const h = history(); assert.equal(savePracticeHistory(h, sourceStorage).ok, true);
    const context = { crypto: webcrypto, TextEncoder, structuredClone, URL, localStorage: sourceStorage };
    context.globalThis = context;
    vm.runInNewContext(readFileSync(new URL('./port-sync-adapter.js', import.meta.url), 'utf8'), context);
    const api = context.SoundCruisePortSync;
    const snapshot = await api.readLocalSnapshot(sourceStorage);
    await api.applyRemoteSnapshot(targetStorage, snapshot);
    const received = loadPracticeHistory(targetStorage); assert.equal(received.ok, true);
    verifyCrossDay(received.history);
    const byId = events => [...events].sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(byId(received.history.events), byId(h.events));
});
test('empty days, unfinished/orphan children and same-day sessions do not create notices', () => {
    assert.equal(getPracticeCrossDayNotice({ events: [] }, '2026-09-27'), '');
    const h = history(); h.events = h.events.filter(e => e.type !== 'practice-session');
    assert.equal(getPracticeCrossDayNotice(h, '2026-09-27'), '');
    assert.equal(createPracticeDayHistoryView(h, '2026-09-27').length, 1);
});
test('the actual empty-day renderer replaces no-record text with the cross-day notice', () => {
    const app = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
    const start = app.indexOf('function renderPracticeDayHistory(');
    const fn = app.slice(start, app.indexOf('\nfunction ', start + 1));
    for (const h of [history(), { events: [] }]) {
        const nodes = [];
        const context = { state: { history: h, historySelectedDate: '2026-09-27' },
            elements: { dayHistoryTitle: {}, dayHistoryList: { replaceChildren() { nodes.length = 0; }, append(node) { nodes.push(node); } } },
            document: { createElement: () => ({}) }, createPracticeDayHistoryView, getPracticeCrossDayNotice };
        vm.runInNewContext(fn + '\nrenderPracticeDayHistory();', context);
        assert.equal(nodes.length, 1);
        assert.equal(nodes[0].textContent, h.events.length ? getPracticeCrossDayNotice(h, '2026-09-27') : 'この日の練習記録はありません。');
    }
});
