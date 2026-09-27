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
        'handlePracticeTimerStop', 'handlePracticeFinishEarly', 'handlePracticeCompletionAction']
        .map(functionSource).join('\n'), context);
    return { state, before: structuredClone(state), context, values, writes, messages, destinations };
}

test('timer finish clears only checks; history/calendar retain completions plus the existing session', () => {
    const f = fixture();
    f.context.handlePracticeTimerStop();
    assert.deepEqual(f.state.progress, { ...f.before.progress, checkedPracticeIds: [] });
    assert.deepEqual(f.state.history.events.filter(e => e.type === 'practice-completed'), f.before.history.events);
    assert.equal(f.state.history.events.length, f.before.history.events.length + 1);
    assert.equal(f.state.timer.running, false);
    const sessions = history.createPracticeDayHistoryView(f.state.history, history.toLocalDateKey(end));
    assert.equal(sessions.filter(e => e.kind === 'session').length, 1);
    assert.equal(sessions.find(e => e.kind === 'session').event.durationSeconds, 60);
    for (const id of ['a', 'b']) {
        const again = progress.setPracticeChecked(f.state.progress, id, true);
        assert.equal(again.countAdded, false);
        f.state.progress = again.progress;
    }
    assert.deepEqual(f.state.progress.totalCounts, f.before.progress.totalCounts);
    assert.equal(f.state.history.events.filter(e => e.type === 'practice-completed').length, 2);
});

test('timer history save failure leaves checks and running timer unchanged', () => {
    const f = fixture(history.PRACTICE_HISTORY_STORAGE_KEY);
    f.context.handlePracticeTimerStop();
    assert.deepEqual(f.state.progress, f.before.progress);
    assert.deepEqual(f.state.history, f.before.history);
    assert.deepEqual(f.state.timer, f.before.timer);
    assert.equal(f.writes.includes(progress.PRACTICE_PROGRESS_STORAGE_KEY), false);
});

test('timer save success followed by check-save failure never rolls back timer history', () => {
    const f = fixture(progress.PRACTICE_PROGRESS_STORAGE_KEY);
    f.context.handlePracticeTimerStop();
    assert.deepEqual(f.state.progress, f.before.progress);
    assert.equal(f.state.timer.running, false);
    assert.equal(JSON.parse(f.values.get(timer.PRACTICE_TIMER_STORAGE_KEY)).running, false);
    assert.equal(JSON.parse(f.values.get(history.PRACTICE_HISTORY_STORAGE_KEY)).events.length, 3);
    assert.equal(f.writes.filter(key => key === history.PRACTICE_HISTORY_STORAGE_KEY).length, 1);
    assert.ok(f.messages.includes('練習時間は記録しましたが、チェックをリセットできませんでした。'));
});

for (const destination of ['home', 'calendar']) test(`bottom finish retains pending completion and existing ${destination} flow`, () => {
    const f = fixture();
    const expected = progress.beginPracticeCompletion(f.before.progress,
        progress.PRACTICE_COMPLETION_TYPE.partial, ['a', 'b', 'c'], end);
    f.context.handlePracticeFinishEarly();
    assert.deepEqual(f.state.progress, { ...expected.progress, checkedPracticeIds: [] });
    assert.deepEqual(f.state.history, f.before.history);
    assert.deepEqual(f.state.timer, f.before.timer);
    const oldResult = progress.finishPracticeCompletion(expected.progress, end);
    f.context.handlePracticeCompletionAction(destination);
    assert.deepEqual(f.state.progress.checkedPracticeIds, oldResult.progress.checkedPracticeIds);
    assert.deepEqual(f.state.progress.countedPracticeIds, oldResult.progress.countedPracticeIds);
    assert.deepEqual(f.state.progress.totalCounts, oldResult.progress.totalCounts);
    assert.equal(f.state.progress.completionPending, null);
    assert.notEqual(f.state.progress.cycleId, f.before.progress.cycleId);
    assert.deepEqual(f.destinations, [destination]);
    assert.equal(f.state.history.events.filter(e => e.type === 'practice-completed').length, 2);
    assert.equal(f.state.history.events.filter(e => e.type === 'practice-session').length, 1);
});

test('bottom progress-save failure preserves checks and never stops timer', () => {
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
