import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ALL_PRACTICE_MENUS_SET_ID,
    PRACTICE_MENU_SETS_STORAGE_KEY,
    PRACTICE_MENU_SET_SELECTION_STORAGE_KEY,
    createPracticeMenuSet,
    deletePracticeMenuSet,
    findPracticeMenuSet,
    getPracticeMenuSetItems,
    loadPracticeMenuSetSelection,
    loadPracticeMenuSets,
    resolvePracticeMenuSetSelection,
    savePracticeMenuSetSelection,
    savePracticeMenuSets,
    updatePracticeMenuSet
} from './practice-menu-sets-store.js';
import {
    PRACTICE_COMPLETION_TYPE,
    beginPracticeCompletion,
    canCompletePracticeCycle,
    clearAllPracticeCurrentChecks,
    createEmptyPracticeProgress,
    finishPracticeCompletion,
    setPracticeChecked
} from './practice-menu-progress-store.js';
import { movePracticeMenu, updatePracticeMenu, deletePracticeMenu } from './practice-menu-store.js';

const T = '2026-09-29T00:00:00.000Z';
const NOW = new Date('2026-09-29T01:00:00.000Z');

function storage(values = {}) {
    const data = new Map(Object.entries(values));
    return {
        getItem: (key) => data.has(key) ? data.get(key) : null,
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: (key) => data.delete(key),
        value: (key) => data.get(key)
    };
}

function menu(id, name, hidden = false) {
    return { id, name, durationMinutes: 10, appId: null, memo: '', hidden, createdAt: T, updatedAt: T };
}

const MENUS = Object.freeze([
    menu('melody', 'メロディ音感'), menu('chord-ear', 'コード音感'),
    menu('chord', 'コード練習'), menu('stroke', 'ストローク練習'), menu('secret', '非表示練習', true)
]);
const visible = (menus = MENUS) => menus.filter((item) => !item.hidden);
const ids = (items) => items.map((item) => item.id);

function created(name, itemIds, sets = []) {
    const result = createPracticeMenuSet({ name, itemIds }, sets, MENUS, NOW);
    assert.equal(result.ok, true, name);
    return result;
}

// The app's completion rule: the scope is the displayed menus of the selection
// and a completion card starts only when the user's check completes that scope.
function checkInScope(progress, scopeIds, itemId) {
    const transition = setPracticeChecked(progress, itemId, true);
    const completes = scopeIds.includes(itemId) && canCompletePracticeCycle(transition.progress, scopeIds);
    return { ...transition, completes };
}

test('default is the virtual 「全ての練習メニュー」 and existing users start with no stored sets', () => {
    const target = storage();
    assert.deepEqual(loadPracticeMenuSets(target), { ok: true, items: [] });
    assert.equal(loadPracticeMenuSetSelection(target), ALL_PRACTICE_MENUS_SET_ID);
    assert.equal(findPracticeMenuSet([], ALL_PRACTICE_MENUS_SET_ID), null);
    assert.deepEqual(ids(getPracticeMenuSetItems(visible(), null)), ['melody', 'chord-ear', 'chord', 'stroke']);
    assert.equal(target.value(PRACTICE_MENU_SETS_STORAGE_KEY), undefined, 'loading never writes');
});

test('create stores only name and menu references, trimmed, with at least one menu', () => {
    const { set, items } = created('  音感練  ', ['melody', 'chord-ear', 'melody']);
    assert.deepEqual(Object.keys(set).sort(), ['createdAt', 'id', 'itemIds', 'name', 'updatedAt']);
    assert.equal(set.name, '音感練');
    assert.deepEqual(set.itemIds, ['melody', 'chord-ear'], 'duplicates are normalized');
    assert.equal(items.length, 1);
    assert.notEqual(set.id, ALL_PRACTICE_MENUS_SET_ID);
    assert.equal(createPracticeMenuSet({ name: '', itemIds: ['melody'] }, [], MENUS).reason, 'name-required');
    assert.equal(createPracticeMenuSet({ name: '   ', itemIds: ['melody'] }, [], MENUS).reason, 'name-required');
    assert.equal(createPracticeMenuSet({ name: '朝練', itemIds: [] }, [], MENUS).reason, 'items-required');
    assert.equal(createPracticeMenuSet({ name: '朝練', itemIds: ['gone'] }, [], MENUS).reason, 'items-required');
    const first = created('朝練', ['chord']);
    const same = created('朝練', ['stroke'], first.items);
    assert.notEqual(same.set.id, first.set.id, 'identity is the id; duplicate names are allowed');
});

test('save/load roundtrip, strict validation and device-local selection', () => {
    const target = storage();
    const { items, set } = created('音感練', ['melody', 'chord-ear']);
    assert.deepEqual(savePracticeMenuSets(items, target), { ok: true });
    assert.deepEqual(loadPracticeMenuSets(target), { ok: true, items });
    assert.deepEqual(savePracticeMenuSets([{ ...set, name: ' ' }], target), { ok: false, reason: 'invalid-data' });
    assert.deepEqual(savePracticeMenuSets([{ ...set, itemIds: ['melody', 'melody'] }], target), { ok: false, reason: 'invalid-data' });
    assert.deepEqual(savePracticeMenuSets([{ ...set, items: MENUS }], target), { ok: false, reason: 'invalid-data' }, 'menus are never copied');
    assert.deepEqual(savePracticeMenuSets([set, set], target), { ok: false, reason: 'invalid-data' });
    assert.equal(loadPracticeMenuSets(storage({ [PRACTICE_MENU_SETS_STORAGE_KEY]: '{bad' })).ok, false);
    assert.equal(loadPracticeMenuSets(storage({ [PRACTICE_MENU_SETS_STORAGE_KEY]: '{"version":2,"items":[]}' })).ok, false);

    assert.equal(savePracticeMenuSetSelection(set.id, target), true);
    assert.equal(loadPracticeMenuSetSelection(target), set.id);
    assert.equal(savePracticeMenuSetSelection(ALL_PRACTICE_MENUS_SET_ID, target), true);
    assert.equal(target.value(PRACTICE_MENU_SET_SELECTION_STORAGE_KEY), undefined);
});

test('rename and membership edits keep the id; saving drops deleted menu references', () => {
    const { items, set } = created('音感練', ['melody', 'chord-ear']);
    const renamed = updatePracticeMenuSet(items, set.id, { name: '朝の音感練', itemIds: ['melody', 'chord-ear'] }, MENUS, NOW);
    assert.equal(renamed.set.id, set.id);
    assert.equal(renamed.set.name, '朝の音感練');
    const remaining = MENUS.filter((item) => item.id !== 'chord-ear');
    const edited = updatePracticeMenuSet(renamed.items, set.id, { name: '朝の音感練', itemIds: ['melody', 'chord-ear', 'stroke'] }, remaining, NOW);
    assert.deepEqual(edited.set.itemIds, ['melody', 'stroke'], 'missing ids are cleaned up on save');
    assert.equal(updatePracticeMenuSet(items, set.id, { name: '', itemIds: ['melody'] }, MENUS).reason, 'name-required');
    assert.equal(updatePracticeMenuSet(items, set.id, { name: 'x', itemIds: [] }, MENUS).reason, 'items-required');
    assert.equal(updatePracticeMenuSet(items, 'missing', { name: 'x', itemIds: ['melody'] }, MENUS).reason, 'not-found');
});

test('delete removes only the set, records the cloud deletion intent, and the selection falls back to All', () => {
    const target = storage();
    const a = created('音感練', ['melody']);
    const b = created('ギター練', ['chord', 'stroke'], a.items);
    savePracticeMenuSets(b.items, target);
    loadPracticeMenuSets(target);
    const result = deletePracticeMenuSet(b.items, a.set.id);
    assert.equal(result.found, true);
    assert.deepEqual(ids(result.items), [b.set.id]);
    assert.deepEqual(savePracticeMenuSets(result.items, target), { ok: true });
    assert.deepEqual(JSON.parse(target.value('cruisePort.syncDeletionIntent.v1')), { [`practice_menu_set/${a.set.id}`]: true });
    assert.equal(resolvePracticeMenuSetSelection(result.items, a.set.id), ALL_PRACTICE_MENUS_SET_ID);
    assert.equal(resolvePracticeMenuSetSelection(result.items, 'never-existed'), ALL_PRACTICE_MENUS_SET_ID);
    assert.equal(resolvePracticeMenuSetSelection(result.items, b.set.id), b.set.id);
    assert.equal(MENUS.length, 5, 'practice menus are untouched');
});

test('filtering follows master order, visibility, renames and ignores missing ids', () => {
    const { set } = created('混在', ['stroke', 'melody', 'secret', 'chord']);
    const withMissing = { ...set, itemIds: [...set.itemIds, 'deleted-menu'] };
    assert.deepEqual(ids(getPracticeMenuSetItems(visible(), withMissing)), ['melody', 'chord', 'stroke'],
        'master order, hidden menus stay hidden, missing ids are skipped');
    let reordered = MENUS;
    for (let step = 0; step < 3; step += 1) reordered = movePracticeMenu(reordered, 'stroke', -1).items;
    assert.deepEqual(ids(getPracticeMenuSetItems(visible(reordered), set)), ['stroke', 'melody', 'chord'], 'master reorder is reflected');
    const renamed = updatePracticeMenu(MENUS, 'chord', { name: 'コード練習（改）' }, NOW).items;
    assert.equal(getPracticeMenuSetItems(visible(renamed), set).find((item) => item.id === 'chord').name, 'コード練習（改）');
    const allGone = deletePracticeMenu(deletePracticeMenu(deletePracticeMenu(MENUS, 'stroke').items, 'melody').items, 'chord').items;
    assert.deepEqual(getPracticeMenuSetItems(visible(allGone), set), [], 'an effectively empty set does not crash');
});

test('the same menu belongs to several sets by reference, without duplication', () => {
    const morning = created('朝練', ['chord', 'melody']);
    const basic = created('基礎練', ['chord', 'stroke'], morning.items);
    const guitar = created('ギター練', ['chord'], basic.items);
    assert.equal(guitar.items.filter((set) => set.itemIds.includes('chord')).length, 3);
    assert.equal(MENUS.filter((item) => item.id === 'chord').length, 1);
    for (const set of guitar.items) {
        assert.equal(getPracticeMenuSetItems(visible(), set).find((item) => item.id === 'chord'), MENUS[2], 'same object, no copy');
    }
});

test('checks are shared across sets and switching sets never changes checks or counts', () => {
    const morning = created('朝練', ['chord', 'melody']).set;
    const basic = created('基礎練', ['chord', 'stroke']).set;
    let progress = createEmptyPracticeProgress(NOW);
    progress = checkInScope(progress, ids(getPracticeMenuSetItems(visible(), morning)), 'chord').progress;
    const before = JSON.stringify(progress);
    // Switching selection is a pure view change: no progress function is involved.
    const basicView = getPracticeMenuSetItems(visible(), basic);
    assert.ok(progress.checkedPracticeIds.includes(basicView[0].id), 'コード練習 is checked in 基礎練 too');
    assert.equal(JSON.stringify(progress), before);
    assert.equal(progress.totalCounts.chord, 1);
    // Seeing and re-checking the same menu through another set never counts twice.
    const again = setPracticeChecked(progress, 'chord', true);
    assert.equal(again.countAdded, false);
    assert.equal(again.progress.totalCounts.chord, 1);
    const toggled = setPracticeChecked(setPracticeChecked(progress, 'chord', false).progress, 'chord', true);
    assert.equal(toggled.progress.totalCounts.chord, 1, 'uncheck/recheck in the same cycle keeps one count');
});

test('custom set completion ignores menus outside the set; All keeps its rule; empty never completes', () => {
    const sound = created('音感練', ['melody', 'chord-ear']).set;
    const scope = ids(getPracticeMenuSetItems(visible(), sound));
    let progress = createEmptyPracticeProgress(NOW);
    let step = checkInScope(progress, scope, 'melody');
    assert.equal(step.completes, false);
    step = checkInScope(step.progress, scope, 'chord-ear');
    assert.equal(step.completes, true, 'checking the final menu completes the set while chord/stroke stay unchecked');
    assert.equal(canCompletePracticeCycle(step.progress, ids(visible())), false, 'All would still be incomplete');
    const all = ids(visible());
    let allProgress = createEmptyPracticeProgress(NOW);
    for (const [index, id] of all.entries()) {
        const next = checkInScope(allProgress, all, id);
        assert.equal(next.completes, index === all.length - 1);
        allProgress = next.progress;
    }
    const empty = { ...sound, itemIds: ['deleted-menu'] };
    const emptyScope = ids(getPracticeMenuSetItems(visible(), empty));
    assert.deepEqual(emptyScope, []);
    assert.equal(canCompletePracticeCycle(allProgress, emptyScope), false, 'an empty set is never complete');
    assert.equal(beginPracticeCompletion(allProgress, PRACTICE_COMPLETION_TYPE.complete, emptyScope).started, false);
});

test('selecting an already-complete set does not retrigger; only a check transition does', () => {
    const a = created('朝練', ['melody', 'chord']).set;
    const b = created('復習', ['melody', 'chord']).set;
    const scopeA = ids(getPracticeMenuSetItems(visible(), a));
    let progress = createEmptyPracticeProgress(NOW);
    progress = checkInScope(progress, ids(visible()), 'melody').progress; // checked while viewing All
    const viaAll = checkInScope(progress, ids(visible()), 'chord');
    assert.equal(viaAll.completes, false, 'All is not complete');
    const scopeB = ids(getPracticeMenuSetItems(visible(), b));
    assert.equal(canCompletePracticeCycle(viaAll.progress, scopeB), true, 'B is already complete when selected');
    // The app starts completion only from a check of an in-scope menu, never from selection.
    const outside = checkInScope(viaAll.progress, scopeA, 'stroke');
    assert.equal(outside.completes, false, 'checking a menu outside the set does not fire the card');
});

test('manual finish while a set is selected keeps the existing semantics', () => {
    let progress = createEmptyPracticeProgress(NOW);
    progress = setPracticeChecked(progress, 'melody', true).progress;
    const partial = beginPracticeCompletion(progress, PRACTICE_COMPLETION_TYPE.partial, ids(visible()), NOW);
    assert.equal(partial.started, true, 'an unfinished set can still be ended manually');
    const cleared = clearAllPracticeCurrentChecks(partial.progress);
    assert.deepEqual(cleared.checkedPracticeIds, []);
    assert.deepEqual(cleared.countedPracticeIds, ['melody'], 'counts are kept until the card is confirmed');
    const finished = finishPracticeCompletion(cleared, NOW);
    assert.equal(finished.finished, true);
    assert.deepEqual(finished.progress.countedPracticeIds, []);
    assert.equal(finished.progress.totalCounts.melody, 1, 'totals survive; nothing is rolled back');
    const again = finishPracticeCompletion(finished.progress, NOW);
    assert.equal(again.finished, false, 'a second confirmation cannot commit twice');
});
