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

test('auto-recorded checks can be corrected; finished timer checks change menu and time; the live session only its menu', () => {
    const check = createPracticeCompletedEvent(menuA, 'cycle-1', new Date(2026, 8, 19, 8));
    const sessionId = 'session-1';
    const child = createPracticeCompletedEvent(menuA, 'cycle-1', new Date(2026, 8, 19, 9, 10), sessionId);
    const session = createPracticeSessionEvent({ sessionId, startedAt: new Date(2026, 8, 19, 9), endedAt: new Date(2026, 8, 19, 9, 20), durationSeconds: 1200 });
    let history = withRecords(check, child, session);
    assert.equal(buildPracticeAnalytics(history).totalSeconds, 1200, 'a check without the timer adds no time');
    assert.equal(practiceRecordEditMode(history, check), 'full');
    assert.equal(practiceRecordEditMode(history, child), 'timed');
    assert.equal(practiceRecordEditMode(history, session), null, 'sessions themselves are not edited');
    history = updatePracticeHistoryRecord(history, check.id, { ...menuA, practiceId: menuA.id, practiceName: menuA.name, localDate: '2026-09-19', durationMinutes: 25 }).history;
    assert.equal(buildPracticeAnalytics(history).totalSeconds, 1200 + 1500);
    // A finished timer check: date requests are ignored (it stays with its session).
    const updated = updatePracticeHistoryRecord(history, child.id, { practiceId: 'menu-h', practiceName: '昔の課題', localDate: '2026-01-01', durationMinutes: 5 });
    assert.equal(updated.mode, 'timed');
    const edited = updated.history.events.find(({ id }) => id === child.id);
    assert.deepEqual([edited.practiceId, edited.localDate, edited.sessionId], ['menu-h', '2026-09-19', sessionId]);
    // A check in the session that is still running stays menu-only, and its time cannot be written.
    const running = createPracticeCompletedEvent(menuA, 'cycle-2', NOW, 'session-live');
    const live = withRecords(running);
    const timer = { running: true, sessionId: 'session-live' };
    assert.equal(practiceRecordEditMode(live, running, timer), 'menu');
    const liveEdit = updatePracticeHistoryRecord(live, running.id, { practiceId: 'menu-h', practiceName: '昔の課題', localDate: '2026-01-01', durationMinutes: 999 }, timer);
    const liveRecord = liveEdit.history.events[0];
    assert.deepEqual([liveRecord.practiceId, liveRecord.localDate, liveRecord.durationMinutes, liveRecord.measuredDurationSeconds],
        ['menu-h', running.localDate, running.durationMinutes, undefined]);
    assert.equal(liveEdit.history.activeSessionTiming, live.activeSessionTiming, 'the live timing is untouched');
});

// A finished 65-minute timer session with one check that took the whole session.
function timedSession({ extraChild = false } = {}) {
    const sessionId = 'session-65';
    const start = new Date(2026, 8, 18, 19, 0);
    const end = new Date(2026, 8, 18, 20, 5);
    const records = [];
    if (extraChild) records.push(createPracticeCompletedEvent({ ...menuA, id: 'menu-b', name: 'アルペジオ' }, 'cycle-9', new Date(2026, 8, 18, 19, 20), sessionId));
    const child = createPracticeCompletedEvent(menuA, 'cycle-9', end, sessionId);
    records.push(child, createPracticeSessionEvent({ sessionId, startedAt: start, endedAt: end, durationSeconds: 65 * 60 }));
    return { history: withRecords(...records), child, sessionId };
}

test('A/E: a timed record 65 → 40 minutes moves every total by exactly 25 minutes, once', () => {
    const { history, child } = timedSession();
    const before = buildPracticeAnalytics(history);
    assert.equal(before.totalSeconds, 65 * 60);
    assert.equal(recordPracticeMinutes(child, history), 65, 'the form starts from the measured time');
    const result = updatePracticeHistoryRecord(history, child.id, { ...menuA, practiceId: menuA.id, practiceName: menuA.name, durationMinutes: 40 });
    assert.equal(result.ok, true);
    const after = buildPracticeAnalytics(result.history);
    assert.equal(after.totalSeconds, 40 * 60);
    assert.deepEqual(after.daily, [{ key: '2026-09-18', seconds: 2400 }]);
    assert.deepEqual(after.weekly.map(({ seconds }) => seconds), [2400]);
    assert.deepEqual(after.monthly, [{ key: '2026-09', seconds: 2400 }]);
    assert.deepEqual(after.menu.map(({ practiceId, seconds }) => [practiceId, seconds]), [['menu-a', 2400]]);
    const [row] = createPracticeDayHistoryView(result.history, '2026-09-18');
    assert.equal(row.kind, 'session', 'still one session row, not a second record');
    assert.equal(row.displayDurationSeconds, 2400);
    assert.equal(row.children[0].measuredDurationSeconds, 2400);
    const saved = result.history.events.find(({ id }) => id === child.id);
    assert.deepEqual([saved.durationMinutes, saved.measuredDurationSeconds, saved.localDate], [40, 2400, '2026-09-18']);
    assert.equal(result.history.events.length, history.events.length, 'no record added');
});

test('E: with two checks in the session, only the edited share and the session total change', () => {
    const { history, child } = timedSession({ extraChild: true });
    const before = buildPracticeAnalytics(history);
    const other = before.menu.find(({ practiceId }) => practiceId === 'menu-b').seconds;
    const edited = updatePracticeHistoryRecord(history, child.id, { ...menuA, practiceId: menuA.id, practiceName: menuA.name, durationMinutes: 10 });
    const after = buildPracticeAnalytics(edited.history);
    assert.equal(after.menu.find(({ practiceId }) => practiceId === 'menu-b').seconds, other, 'the other check keeps its time');
    assert.equal(after.menu.find(({ practiceId }) => practiceId === 'menu-a').seconds, 600);
    assert.equal(after.totalSeconds, other + 600, 'total = sum of the shares, nothing counted twice');
});

test('B/D: the corrected time survives a save and reload, and can be corrected again (40 → 55)', () => {
    const storage = memoryStorage();
    loadPracticeHistory(storage);
    const { history, child } = timedSession();
    assert.equal(savePracticeHistory(history, storage).ok, true);
    let loaded = loadPracticeHistory(storage).history;
    const forty = updatePracticeHistoryRecord(loaded, child.id, { ...menuA, practiceId: menuA.id, practiceName: menuA.name, durationMinutes: 40 });
    assert.equal(savePracticeHistory(forty.history, storage).ok, true);
    loaded = loadPracticeHistory(storage).history;
    assert.equal(buildPracticeAnalytics(loaded).totalSeconds, 2400, 'reload: still 40 minutes, not back to the timer value');
    assert.equal(recordPracticeMinutes(loaded.events.find(({ id }) => id === child.id), loaded), 40);
    const fiftyFive = updatePracticeHistoryRecord(loaded, child.id, { ...menuA, practiceId: menuA.id, practiceName: menuA.name, durationMinutes: 55 });
    assert.equal(savePracticeHistory(fiftyFive.history, storage).ok, true);
    assert.equal(buildPracticeAnalytics(loadPracticeHistory(storage).history).totalSeconds, 55 * 60);
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
    assert.match(app, /タイマーで計測した記録です。練習時間は実際の時間に合わせて修正できます（日付は変更できません）。/);
    assert.match(app, /elements\.historyFormMinutes\.disabled = live;/, 'time is locked only for the running session');
    assert.match(app, /recordPracticeMinutes\(record, state\.history\)/, 'the form starts from the measured time');
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
