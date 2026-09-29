import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as progress from './practice-menu-progress-store.js';
import * as history from './practice-menu-history-store.js';
import * as timer from './practice-menu-timer-store.js';
import { getPracticeNamePreset } from './practice-menu-presets.js';

const source = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
const start = new Date('2026-09-27T01:00:00.000Z');
const end = new Date('2026-09-27T01:01:00.000Z');
function functionSource(name) {
    const from = source.indexOf(`function ${name}(`);
    assert.ok(from >= 0);
    return source.slice(from, source.indexOf('\nfunction ', from + 1));
}
function fixture(failKey = null) {
    const values = new Map();
    const writes = [];
    const storage = { getItem: key => values.get(key) ?? null,
        setItem(key, value) { writes.push(key); if (key === failKey) throw new Error('quota'); values.set(key, value); },
        removeItem(key) { values.delete(key); } };
    let p = progress.createEmptyPracticeProgress(start);
    let h = history.createEmptyPracticeHistory();
    const t = timer.startPracticeTimer(timer.createStoppedPracticeTimer(), start).timer;
    const items = ['a', 'b', 'c'].map(id => ({ id, name: id, appId: 'pitch', durationMinutes: 10, hidden: false }));
    for (const item of items.slice(0, 2)) {
        const checked = progress.setPracticeChecked(p, item.id, true);
        p = checked.progress;
        h = history.appendPracticeHistoryEvent(h,
            history.createPracticeCompletedEvent(item, p.cycleId, start, t.sessionId)).history;
    }
    for (const [key, value] of [[progress.PRACTICE_PROGRESS_STORAGE_KEY, p],
        [history.PRACTICE_HISTORY_STORAGE_KEY, h], [timer.PRACTICE_TIMER_STORAGE_KEY, t]]) values.set(key, JSON.stringify(value));
    const state = { progress: p, history: h, timer: t, items,
        progressReady: true, historyReady: true, timerReady: true, completionActionInProgress: false };
    const messages = [], destinations = [];
    const context = vm.createContext({ ...progress, ...history, ...timer, state,
        beginPracticeCompletion: (p, type, ids) => progress.beginPracticeCompletion(p, type, ids, end),
        finishPracticeCompletion: p => progress.finishPracticeCompletion(p, end),
        Date: class extends Date { constructor(value = end) { super(value); } },
        elements: { timerStatus: {}, completionError: {} },
        savePracticeProgress: value => progress.savePracticeProgress(value, storage),
        savePracticeHistory: (value, _, options) => history.savePracticeHistory(value, storage, options),
        savePracticeTimer: value => timer.savePracticeTimer(value, storage),
        showNotice: (_, text) => messages.push(text), ensurePracticeTimerTicking() {},
        renderPracticeList() {}, refreshAppliedPortCloudDataWhenSafe() {},
        syncPracticeCompletionDialog() {}, closePracticeCompletionDialog() {},
        setPracticeCalendarSelectedDate() {}, openPracticeCalendar: () => destinations.push('calendar'),
        setHomeRoute: () => destinations.push('home'), PRACTICE_CALENDAR_ENTRY_SOURCE: { practice: 'practice' },
        formatPracticeSessionDuration: value => String(value)
    });
    vm.runInContext(['persistPracticeProgress', 'getActivePracticeItems', 'stopPracticeTimerWithHistory',
        'handlePracticeFinishEarly', 'handlePracticeCompletionAction']
        .map(functionSource).join('\n'), context);
    return { state, before: structuredClone(state), context, values, writes, messages, destinations };
}

const sessionsOf = (h) => h.events.filter(e => e.type === 'practice-session').length;
const completedOf = (h) => h.events.filter(e => e.type === 'practice-completed').length;

// 1.4.3: the gold 練習終了 and ここで練習終了 both call handlePracticeFinishEarly.
for (const destination of ['home', 'calendar']) test(`manual finish stops the timer once, opens the card and keeps the ${destination} flow`, () => {
    const f = fixture();
    const expected = progress.beginPracticeCompletion(f.before.progress,
        progress.PRACTICE_COMPLETION_TYPE.partial, ['a', 'b', 'c'], end);
    f.context.handlePracticeFinishEarly();
    assert.deepEqual(f.state.progress, { ...expected.progress, checkedPracticeIds: [] }, 'pending partial, checks cleared');
    assert.equal(f.state.timer.running, false, 'the timer stops at finish, not later');
    assert.equal(JSON.parse(f.values.get(timer.PRACTICE_TIMER_STORAGE_KEY)).running, false);
    assert.equal(sessionsOf(f.state.history), 1, 'exactly one session');
    const sessions = history.createPracticeDayHistoryView(f.state.history, history.toLocalDateKey(end));
    assert.equal(sessions.find(e => e.kind === 'session').event.durationSeconds, 60);
    const oldResult = progress.finishPracticeCompletion(expected.progress, end);
    f.context.handlePracticeCompletionAction(destination);
    assert.deepEqual(f.state.progress.checkedPracticeIds, oldResult.progress.checkedPracticeIds);
    assert.deepEqual(f.state.progress.countedPracticeIds, oldResult.progress.countedPracticeIds);
    assert.deepEqual(f.state.progress.totalCounts, f.before.progress.totalCounts, 'no double count');
    assert.equal(f.state.progress.completionPending, null);
    assert.notEqual(f.state.progress.cycleId, f.before.progress.cycleId);
    assert.deepEqual(f.destinations, [destination]);
    assert.equal(completedOf(f.state.history), 2);
    assert.equal(sessionsOf(f.state.history), 1, 'the card action does not record a second session');
    assert.equal(f.writes.filter(key => key === history.PRACTICE_HISTORY_STORAGE_KEY).length, 1);
});

test('a second finish while the card is open does nothing', () => {
    const f = fixture();
    f.context.handlePracticeFinishEarly();
    const afterFirst = structuredClone(f.state);
    const writes = f.writes.length;
    f.context.handlePracticeFinishEarly();
    assert.deepEqual(f.state.progress, afterFirst.progress);
    assert.deepEqual(f.state.history, afterFirst.history);
    assert.equal(f.writes.length, writes);
});

test('manual finish without a running timer records no session', () => {
    const f = fixture();
    f.state.timer = timer.createStoppedPracticeTimer();
    f.context.handlePracticeFinishEarly();
    assert.equal(f.state.progress.completionPending.type, progress.PRACTICE_COMPLETION_TYPE.partial);
    f.context.handlePracticeCompletionAction('home');
    assert.equal(sessionsOf(f.state.history), 0);
});

test('a running timer can be finished even when no menu is active', () => {
    const f = fixture();
    f.state.items = f.state.items.map(item => ({ ...item, hidden: true }));
    f.context.handlePracticeFinishEarly();
    assert.equal(f.state.progress.completionPending.type, progress.PRACTICE_COMPLETION_TYPE.partial);
    assert.equal(f.state.timer.running, false);
    assert.equal(sessionsOf(f.state.history), 1);
});

test('history save failure keeps the card pending and the timer running for a retry', () => {
    const f = fixture(history.PRACTICE_HISTORY_STORAGE_KEY);
    f.context.handlePracticeFinishEarly();
    assert.equal(f.state.progress.completionPending.type, progress.PRACTICE_COMPLETION_TYPE.partial);
    assert.deepEqual(f.state.history, f.before.history);
    assert.deepEqual(f.state.timer, f.before.timer, 'the timer keeps running');
    assert.ok(f.messages.includes('練習記録を保存できませんでした。タイマーは継続しています。'));
    f.context.handlePracticeCompletionAction('home');
    assert.notEqual(f.state.progress.completionPending, null, 'the card stays until the session is recorded');
    assert.deepEqual(f.destinations, []);
});

test('progress-save failure preserves checks and never stops the timer', () => {
    const f = fixture(progress.PRACTICE_PROGRESS_STORAGE_KEY);
    f.context.handlePracticeFinishEarly();
    assert.deepEqual(f.state.progress, f.before.progress);
    assert.deepEqual(f.state.timer, f.before.timer);
    assert.deepEqual(f.state.history, f.before.history);
});

test('all Cruise presets use the existing app suggestion handler; saved edit text is untouched', () => {
    const elements = { namePresetInput: { value: '' }, appInput: { value: '' }, nameInput: { value: '音感練' } };
    const state = { formMode: 'create' };
    const context = vm.createContext({ elements, state, getPracticeNamePreset, syncPracticeNameControls() {} });
    vm.runInContext(functionSource('handlePracticeNamePresetChange'), context);
    for (const appId of ['pitch', 'rhythm', 'fretboard', 'chord']) {
        elements.namePresetInput.value = appId;
        context.handlePracticeNamePresetChange();
        assert.equal(elements.appInput.value, appId);
    }
    state.formMode = 'edit'; elements.appInput.value = 'pitch';
    context.handlePracticeNamePresetChange();
    assert.equal(elements.appInput.value, 'pitch');
    assert.equal(elements.nameInput.value, '音感練');
});
