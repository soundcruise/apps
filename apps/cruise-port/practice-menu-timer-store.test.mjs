import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PRACTICE_TIMER_MAX_SECONDS,
    PRACTICE_TIMER_STORAGE_KEY,
    createStoppedPracticeTimer,
    formatPracticeSessionDuration,
    formatPracticeTimerDuration,
    getPracticeTimerElapsedSeconds,
    loadPracticeTimer,
    pausePracticeTimer,
    resumePracticeTimer,
    savePracticeTimer,
    startPracticeTimer,
    stopPracticeTimer
} from './practice-menu-timer-store.js';

class FakeStorage {
    constructor(values = {}) { this.values = new Map(Object.entries(values)); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}

const start = new Date('2026-09-08T01:00:00.000Z');

test('start persists one timestamp and duplicate start is ignored', () => {
    const started = startPracticeTimer(createStoppedPracticeTimer(), start);
    assert.equal(started.started, true);
    assert.equal(started.timer.startedAt, start.toISOString());
    assert.equal(startPracticeTimer(started.timer, new Date(start.getTime() + 1000)).started, false);
    const storage = new FakeStorage();
    assert.deepEqual(savePracticeTimer(started.timer, storage), { ok: true });
    assert.deepEqual(loadPracticeTimer(storage).timer, started.timer);
});

test('elapsed uses timestamps across background/reload and formats long sessions', () => {
    const timer = startPracticeTimer(createStoppedPracticeTimer(), start).timer;
    assert.equal(getPracticeTimerElapsedSeconds(timer, new Date(start.getTime() + 3723000)), 3723);
    assert.equal(formatPracticeTimerDuration(3723), '1:02:03');
    assert.equal(formatPracticeSessionDuration(42), '42秒');
    assert.equal(formatPracticeSessionDuration(728), '12分08秒');
    assert.equal(formatPracticeSessionDuration(3723), '1時間02分03秒');
});

test('future clock, malformed values, and extreme elapsed clamp safely', () => {
    const timer = startPracticeTimer(createStoppedPracticeTimer(), start).timer;
    assert.equal(getPracticeTimerElapsedSeconds(timer, new Date(start.getTime() - 5000)), 0);
    assert.equal(getPracticeTimerElapsedSeconds(timer, new Date(start.getTime() + (PRACTICE_TIMER_MAX_SECONDS + 100) * 1000)), PRACTICE_TIMER_MAX_SECONDS);
    const malformed = '{broken';
    const storage = new FakeStorage({ [PRACTICE_TIMER_STORAGE_KEY]: malformed });
    assert.equal(loadPracticeTimer(storage).ok, false);
    assert.equal(storage.getItem(PRACTICE_TIMER_STORAGE_KEY), malformed);
});

test('stop creates one bounded session and resets active timer', () => {
    const timer = startPracticeTimer(createStoppedPracticeTimer(), start).timer;
    const stopped = stopPracticeTimer(timer, new Date(start.getTime() + 20500));
    assert.equal(stopped.stopped, true);
    assert.equal(stopped.session.durationSeconds, 20);
    assert.equal(stopped.timer.running, false);
    assert.equal(stopPracticeTimer(stopped.timer, new Date()).stopped, false);
});

test('pause freezes active time through reload, resume, and multiple pauses', () => {
    const storage = new FakeStorage();
    let timer = startPracticeTimer(createStoppedPracticeTimer(), start).timer;
    timer = pausePracticeTimer(timer, new Date(start.getTime() + 10000)).timer;
    assert.equal(timer.paused, true);
    assert.equal(getPracticeTimerElapsedSeconds(timer, new Date(start.getTime() + 100000)), 10);
    assert.equal(savePracticeTimer(timer, storage).ok, true);
    timer = loadPracticeTimer(storage).timer;
    assert.equal(timer.paused, true);
    assert.equal(getPracticeTimerElapsedSeconds(timer, new Date(start.getTime() + 200000)), 10);
    timer = resumePracticeTimer(timer, new Date(start.getTime() + 200000)).timer;
    assert.equal(getPracticeTimerElapsedSeconds(timer, new Date(start.getTime() + 205000)), 15);
    timer = pausePracticeTimer(timer, new Date(start.getTime() + 210000)).timer;
    const finished = stopPracticeTimer(timer, new Date(start.getTime() + 240000));
    assert.equal(finished.session.durationSeconds, 20);
    assert.equal(finished.session.pauseIntervals.length, 2);
    assert.equal(finished.session.pauseIntervals[1].endedAt, new Date(start.getTime() + 240000).toISOString());
    assert.equal(finished.timer.running, false);
});

test('v1 running timer is read without losing its elapsed time', () => {
    const storage = new FakeStorage({ [PRACTICE_TIMER_STORAGE_KEY]: JSON.stringify({ version: 1, running: true, sessionId: 'old', startedAt: start.toISOString() }) });
    const loaded = loadPracticeTimer(storage);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.migrated, true);
    assert.equal(loaded.timer.paused, false);
    assert.equal(getPracticeTimerElapsedSeconds(loaded.timer, new Date(start.getTime() + 1000)), 1);
});
