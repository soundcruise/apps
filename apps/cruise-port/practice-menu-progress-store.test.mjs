import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PRACTICE_PROGRESS_STORAGE_KEY,
    canCompletePracticeCycle,
    clearPracticeCurrentCheck,
    completePracticeCycle,
    createEmptyPracticeProgress,
    isValidPracticeProgress,
    loadPracticeProgress,
    removePracticeFromProgress,
    resetPracticeTotalCount,
    savePracticeProgress,
    setPracticeChecked,
    startNextPracticeCycle
} from './practice-menu-progress-store.js';

class FakeStorage {
    constructor(values = {}) {
        this.values = new Map(Object.entries(values));
        this.failWrites = false;
    }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) {
        if (this.failWrites) throw new Error('quota');
        this.values.set(key, String(value));
    }
    removeItem(key) { this.values.delete(key); }
}

const firstDate = new Date('2026-09-08T01:00:00.000Z');
const secondDate = new Date('2026-09-09T01:00:00.000Z');

test('empty progress is valid and persists independently', () => {
    const storage = new FakeStorage();
    const progress = createEmptyPracticeProgress(firstDate);
    const emptyLoad = loadPracticeProgress(storage, firstDate);
    assert.equal(emptyLoad.ok, true);
    assert.deepEqual(emptyLoad.progress.checkedPracticeIds, []);
    assert.deepEqual(emptyLoad.progress.totalCounts, {});
    assert.deepEqual(savePracticeProgress(progress, storage), { ok: true });
    assert.equal(JSON.parse(storage.getItem(PRACTICE_PROGRESS_STORAGE_KEY)).version, 2);
    assert.deepEqual(loadPracticeProgress(storage).progress, progress);
});

test('first check counts once and OFF then ON in the same cycle does not count again', () => {
    const initial = createEmptyPracticeProgress(firstDate);
    const first = setPracticeChecked(initial, 'practice-a', true);
    assert.equal(first.countAdded, true);
    assert.equal(first.progress.totalCounts['practice-a'], 1);
    assert.deepEqual(first.progress.checkedPracticeIds, ['practice-a']);
    assert.deepEqual(first.progress.countedPracticeIds, ['practice-a']);

    const off = setPracticeChecked(first.progress, 'practice-a', false);
    assert.deepEqual(off.progress.checkedPracticeIds, []);
    assert.deepEqual(off.progress.countedPracticeIds, ['practice-a']);
    assert.equal(off.progress.totalCounts['practice-a'], 1);

    const onAgain = setPracticeChecked(off.progress, 'practice-a', true);
    assert.equal(onAgain.countAdded, false);
    assert.equal(onAgain.progress.totalCounts['practice-a'], 1);
});

test('reset starts a new cycle and preserves totals without a complete count', () => {
    const checked = setPracticeChecked(createEmptyPracticeProgress(firstDate), 'practice-a', true).progress;
    const reset = startNextPracticeCycle(checked, secondDate);
    assert.notEqual(reset.cycleId, checked.cycleId);
    assert.deepEqual(reset.checkedPracticeIds, []);
    assert.deepEqual(reset.countedPracticeIds, []);
    assert.equal(reset.totalCounts['practice-a'], 1);
    assert.equal(Object.hasOwn(reset, 'completeCount'), false);
    const nextCheck = setPracticeChecked(reset, 'practice-a', true);
    assert.equal(nextCheck.countAdded, true);
    assert.equal(nextCheck.progress.totalCounts['practice-a'], 2);
});

test('completion requires every active item and starts a new cycle without cumulative completion state', () => {
    let progress = createEmptyPracticeProgress(firstDate);
    progress = setPracticeChecked(progress, 'practice-a', true).progress;
    assert.equal(canCompletePracticeCycle(progress, ['practice-a', 'practice-b']), false);
    progress = setPracticeChecked(progress, 'practice-b', true).progress;
    assert.equal(canCompletePracticeCycle(progress, ['practice-a', 'practice-b']), true);
    const result = completePracticeCycle(progress, ['practice-a', 'practice-b'], secondDate);
    assert.equal(result.completed, true);
    assert.equal(Object.hasOwn(result.progress, 'completeCount'), false);
    assert.deepEqual(result.progress.checkedPracticeIds, []);
    assert.equal(canCompletePracticeCycle(result.progress, ['practice-a', 'practice-b']), false);
    assert.equal(completePracticeCycle(result.progress, [], secondDate).completed, false);
});

test('legacy v1 complete count migrates without losing progress and is omitted from new saves', () => {
    const legacy = {
        version: 1,
        cycleId: 'legacy-cycle',
        checkedPracticeIds: ['practice-a'],
        countedPracticeIds: ['practice-a'],
        totalCounts: { 'practice-a': 7 },
        completeCount: 12
    };
    const storage = new FakeStorage({ [PRACTICE_PROGRESS_STORAGE_KEY]: JSON.stringify(legacy) });
    const loaded = loadPracticeProgress(storage);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.migrated, true);
    assert.deepEqual(loaded.progress, {
        version: 2,
        cycleId: 'legacy-cycle',
        checkedPracticeIds: ['practice-a'],
        countedPracticeIds: ['practice-a'],
        totalCounts: { 'practice-a': 7 }
    });
    assert.deepEqual(savePracticeProgress(loaded.progress, storage), { ok: true });
    assert.equal(Object.hasOwn(JSON.parse(storage.getItem(PRACTICE_PROGRESS_STORAGE_KEY)), 'completeCount'), false);
});

test('hidden cleanup clears only current visual check and preserves same-cycle counted state', () => {
    const checked = setPracticeChecked(createEmptyPracticeProgress(firstDate), 'practice-a', true).progress;
    const hidden = clearPracticeCurrentCheck(checked, 'practice-a');
    assert.deepEqual(hidden.checkedPracticeIds, []);
    assert.deepEqual(hidden.countedPracticeIds, ['practice-a']);
    assert.equal(setPracticeChecked(hidden, 'practice-a', true).countAdded, false);
});

test('item count reset preserves counted state while delete removes current references', () => {
    const checked = setPracticeChecked(createEmptyPracticeProgress(firstDate), 'practice-a', true).progress;
    const reset = resetPracticeTotalCount(checked, 'practice-a');
    assert.equal(reset.totalCounts['practice-a'], 0);
    assert.deepEqual(reset.countedPracticeIds, ['practice-a']);
    assert.equal(setPracticeChecked(reset, 'practice-a', true).progress.totalCounts['practice-a'], 0);

    const removed = removePracticeFromProgress(reset, 'practice-a');
    assert.deepEqual(removed.checkedPracticeIds, []);
    assert.deepEqual(removed.countedPracticeIds, []);
    assert.equal(Object.hasOwn(removed.totalCounts, 'practice-a'), false);
});

test('malformed progress remains untouched and failed writes restore previous data', () => {
    const malformed = '{broken';
    const storage = new FakeStorage({ [PRACTICE_PROGRESS_STORAGE_KEY]: malformed });
    assert.equal(loadPracticeProgress(storage, firstDate).ok, false);
    assert.equal(storage.getItem(PRACTICE_PROGRESS_STORAGE_KEY), malformed);

    const progress = createEmptyPracticeProgress(firstDate);
    storage.failWrites = true;
    assert.deepEqual(savePracticeProgress(progress, storage), { ok: false, reason: 'write-failed' });
    assert.equal(storage.getItem(PRACTICE_PROGRESS_STORAGE_KEY), malformed);
});

test('counted ids require a matching total count entry', () => {
    const progress = createEmptyPracticeProgress(firstDate);
    progress.countedPracticeIds = ['practice-a'];
    assert.equal(isValidPracticeProgress(progress), false);
    progress.totalCounts['practice-a'] = 0;
    assert.equal(isValidPracticeProgress(progress), true);
});
