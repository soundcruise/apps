import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    appendPracticeHistoryEvent,
    createEmptyPracticeHistory,
    createManualPracticeRecord,
    createPracticeCalendarDaySummary,
    createPracticeCompletedEvent,
    createPracticeDayHistoryView,
    createPracticeSessionEvent,
    deletePracticeHistoryEvent,
    isValidPracticeHistory,
    loadPracticeHistory,
    practiceRecordEditMode,
    recordPracticeMinutes,
    savePracticeHistory,
    updatePracticeHistoryRecord
} from './practice-menu-history-store.js';
import { buildPracticeAnalytics } from './practice-analytics.js';
import { deletePracticeMenu } from './practice-menu-store.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const menuA = { id: 'menu-a', name: 'スケール', durationMinutes: 10, appId: 'pitch' };
const hiddenMenu = { id: 'menu-h', name: '昔の課題', durationMinutes: 15, appId: null, hidden: true };
const NOW = new Date(2026, 8, 26, 9, 30);

function manual(localDate, minutes, menu = menuA) {
    return createManualPracticeRecord({ localDate, practiceId: menu.id, practiceName: menu.name, appId: menu.appId, durationMinutes: minutes }, NOW);
}
function withRecords(...records) {
    return records.reduce((history, record) => appendPracticeHistoryEvent(history, record).history, createEmptyPracticeHistory());
}
function memoryStorage() {
    const values = new Map();
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

test('manual add: an ordinary, valid practice record with the entered date, menu and time; counted once in every total', () => {
    const record = manual('2026-09-20', 30);
    assert.equal(record.type, 'practice-completed');
    assert.equal(record.localDate, '2026-09-20');
    assert.equal(new Date(record.timestamp).getHours(), 12, 'another day: noon, no exact time needed');
    assert.equal(manual('2026-09-26', 5).timestamp, NOW.toISOString(), 'today: now');
    assert.equal(record.source, 'manual');
    assert.equal(record.measuredDurationSeconds, 1800);
    assert.match(record.sessionId, /^manual:/);
    const history = withRecords(record);
    assert.equal(isValidPracticeHistory(history), true);
    const analytics = buildPracticeAnalytics(history);
    assert.equal(analytics.totalSeconds, 1800);
    assert.deepEqual(analytics.daily, [{ key: '2026-09-20', seconds: 1800 }]);
    assert.deepEqual(analytics.monthly, [{ key: '2026-09', seconds: 1800 }]);
    assert.deepEqual(analytics.menu.map(({ practiceId, seconds }) => [practiceId, seconds]), [['menu-a', 1800]]);
    assert.equal(createPracticeCalendarDaySummary('2026-09-20', history).practiced, true, 'the calendar marks the day');
    const [entry] = createPracticeDayHistoryView(history, '2026-09-20');
    assert.equal(entry.kind, 'event', 'shown as its own row, not inside a session');
    for (const bad of [{ durationMinutes: 0 }, { durationMinutes: 1000 }, { durationMinutes: 2.5 }, { localDate: '2026-02-30' }, { practiceName: ' ' }]) {
        assert.equal(createManualPracticeRecord({ localDate: '2026-09-20', practiceId: 'menu-a', practiceName: 'x', durationMinutes: 10, ...bad }), null, JSON.stringify(bad));
    }
});

test('manual edit: menu (incl. hidden), time and date change; totals move with it and nothing is counted twice', () => {
    const record = manual('2026-09-20', 30);
    let history = withRecords(record, manual('2026-09-21', 10));
    let result = updatePracticeHistoryRecord(history, record.id,
        { practiceId: hiddenMenu.id, practiceName: hiddenMenu.name, appId: null, localDate: '2026-09-20', durationMinutes: 45 });
    assert.equal(result.ok, true);
    history = result.history;
    let analytics = buildPracticeAnalytics(history);
    assert.equal(analytics.totalSeconds, (45 + 10) * 60);
    assert.deepEqual(analytics.menu.find(({ practiceId }) => practiceId === 'menu-h'), { practiceId: 'menu-h', name: '昔の課題', seconds: 2700 });
    result = updatePracticeHistoryRecord(history, record.id,
        { practiceId: hiddenMenu.id, practiceName: hiddenMenu.name, localDate: '2026-09-21', durationMinutes: 45 });
    history = result.history;
    const moved = history.events.find(({ id }) => id === record.id);
    assert.equal(moved.localDate, '2026-09-21');
    assert.equal(new Date(moved.timestamp).getDate(), 21);
    analytics = buildPracticeAnalytics(history);
    assert.deepEqual(analytics.daily, [{ key: '2026-09-21', seconds: 3300 }], 'the old day is empty, the new day has both');
    assert.equal(createPracticeDayHistoryView(history, '2026-09-20').length, 0);
    assert.equal(recordPracticeMinutes(moved), 45);
    assert.equal(updatePracticeHistoryRecord(history, record.id, { practiceId: 'x', practiceName: 'x', localDate: '2026-09-21', durationMinutes: 0 }).ok, false);
    assert.equal(updatePracticeHistoryRecord(history, 'missing', { practiceId: 'x', practiceName: 'x', localDate: '2026-09-21', durationMinutes: 5 }).reason, 'not-found');
});

test('auto-recorded checks can be corrected; checks inside a timer session change menu only; sessions are not edited', () => {
    const check = createPracticeCompletedEvent(menuA, 'cycle-1', new Date(2026, 8, 19, 8));
    const sessionId = 'session-1';
    const child = createPracticeCompletedEvent(menuA, 'cycle-1', new Date(2026, 8, 19, 9, 10), sessionId);
    const session = createPracticeSessionEvent({ sessionId, startedAt: new Date(2026, 8, 19, 9), endedAt: new Date(2026, 8, 19, 9, 20), durationSeconds: 1200 });
    let history = withRecords(check, child, session);
    assert.equal(buildPracticeAnalytics(history).totalSeconds, 1200, 'a check without the timer adds no time');
    assert.equal(practiceRecordEditMode(history, check), 'full');
    assert.equal(practiceRecordEditMode(history, child), 'menu');
    assert.equal(practiceRecordEditMode(history, session), null);
    // Correcting the standalone check: its time becomes the entered practice time.
    history = updatePracticeHistoryRecord(history, check.id, { ...menuA, practiceId: menuA.id, practiceName: menuA.name, localDate: '2026-09-19', durationMinutes: 25 }).history;
    assert.equal(buildPracticeAnalytics(history).totalSeconds, 1200 + 1500);
    // A session child: date/time requests are ignored, only the menu changes; the session total stays.
    const updated = updatePracticeHistoryRecord(history, child.id, { practiceId: 'menu-h', practiceName: '昔の課題', localDate: '2026-01-01', durationMinutes: 999 });
    assert.equal(updated.mode, 'menu');
    const edited = updated.history.events.find(({ id }) => id === child.id);
    assert.deepEqual([edited.practiceId, edited.localDate, edited.durationMinutes, edited.sessionId], ['menu-h', '2026-09-19', 10, sessionId]);
    assert.equal(buildPracticeAnalytics(updated.history).totalSeconds, 1200 + 1500);
    // A check in the session that is still running is also menu-only.
    const running = createPracticeCompletedEvent(menuA, 'cycle-2', NOW, 'session-live');
    assert.equal(practiceRecordEditMode(withRecords(running), running, { running: true, sessionId: 'session-live' }), 'menu');
});

test('delete a manual record: totals are recalculated', () => {
    const keep = manual('2026-09-20', 10);
    const remove = manual('2026-09-20', 20);
    const result = deletePracticeHistoryEvent(withRecords(keep, remove), remove.id);
    assert.equal(result.ok, true);
    assert.equal(buildPracticeAnalytics(result.history).totalSeconds, 600);
});

test('reload persistence: a saved manual record loads back unchanged', () => {
    const storage = memoryStorage();
    loadPracticeHistory(storage);
    const record = manual('2026-09-20', 30);
    assert.equal(savePracticeHistory(withRecords(record), storage).ok, true);
    const loaded = loadPracticeHistory(storage);
    assert.equal(loaded.ok, true);
    assert.deepEqual({ ...loaded.history.events[0] }, { ...record });
});

test('deleting a practice menu keeps its past records (name snapshot); editing them keeps the deleted menu, never another one', () => {
    const record = manual('2026-09-20', 30);
    const history = withRecords(record);
    const menus = deletePracticeMenu([menuA, hiddenMenu], menuA.id);
    assert.equal(menus.found, true);
    assert.equal(history.events.length, 1, 'menu deletion does not touch history');
    const [entry] = createPracticeDayHistoryView(history, '2026-09-20');
    assert.equal(entry.event.practiceName, 'スケール');
    const edited = updatePracticeHistoryRecord(history, record.id, { practiceId: 'menu-a', practiceName: 'スケール', localDate: '2026-09-20', durationMinutes: 40 });
    assert.equal(edited.history.events[0].practiceId, 'menu-a');
    assert.equal(buildPracticeAnalytics(edited.history).menu[0].name, 'スケール');
});

test('UI wiring: 練習実績を追加, 編集 beside the delete icon, deleted/hidden menus in the menu list', () => {
    const app = read('./practice-menu-app.js');
    for (const html of [read('./index.html'), read('./pro_9a3943176561/index.html')]) {
        assert.match(html, /<button id="practice-history-add" type="button" aria-label="練習実績を追加">追加<\/button>/);
        assert.match(html, /<form id="practice-history-form"[^>]*hidden>/);
        assert.match(html, /<input id="practice-history-date" type="date" required>/);
        assert.match(html, /<select id="practice-history-menu" required><\/select>/);
        assert.match(html, /<input id="practice-history-minutes" type="number" inputmode="numeric" min="1" max="999"/);
    }
    assert.match(app, /addGroup\('非表示の練習メニュー'/);
    assert.match(app, /addGroup\('削除した練習メニュー', \[\{ value: record\.practiceId, text: `\$\{record\.practiceName\}（削除済み）` \}\]\)/);
    assert.match(app, /createManualPracticeRecord\(\{ localDate, practiceId, practiceName, appId, durationMinutes \}\)/);
    assert.match(app, /updatePracticeHistoryRecord\(state\.history, editing\.id,/);
    assert.match(app, /savePracticeHistory\(result\.history\)\.ok/, 'saved through the store (records deletion intents, triggers sync)');
    assert.match(app, /`\$\{recordPracticeMinutes\(event\)\}分 ・ 手動記録`/);
    assert.match(app, /タイマーで計測した記録のため、日付と練習時間は変更できません。/);
});

test('hidden practice menu: the edit form offers the same delete as the detail view, for active and hidden menus', () => {
    const app = read('./practice-menu-app.js');
    for (const html of [read('./index.html'), read('./pro_9a3943176561/index.html')]) {
        assert.match(html, /<button id="practice-form-delete" class="practice-form-delete" type="button" hidden>この練習メニューを削除<\/button>/);
        assert.match(html, /id="practice-delete" class="action-button danger-action" type="button">削除/, 'the detail view keeps its delete');
    }
    assert.match(app, /elements\.formDeleteButton\.hidden = mode !== 'edit' \|\| !item;/, 'shown for every edited menu, hidden or not');
    assert.match(app, /elements\.formDeleteButton\.addEventListener\('click', handleDelete\);/, 'same flow and confirm dialog as the detail view');
    const handler = app.slice(app.indexOf('async function handleDelete()'), app.indexOf('function handlePracticeTotalCountReset'));
    assert.match(handler, /window\.confirm\('この練習メニューを削除しますか？'\)/);
    assert.match(handler, /deletePracticeMenu\(state\.items, item\.id\)/);
    assert.doesNotMatch(handler, /savePracticeHistory|deletePracticeHistoryEvent/, 'past practice records are never deleted with the menu');
    assert.match(handler, /if \(item\.hidden\) \{[\s\S]*#practice-menu\/hidden/, 'a hidden menu returns to the hidden list');
    // Only the deleted menu goes; other menus are untouched.
    const result = deletePracticeMenu([menuA, hiddenMenu, { ...menuA, id: 'menu-c' }], hiddenMenu.id);
    assert.deepEqual(result.items.map(({ id }) => id), ['menu-a', 'menu-c']);
});
