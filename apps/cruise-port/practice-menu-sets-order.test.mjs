import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    createPracticeMenuSet,
    getPracticeMenuSetItems,
    reorderPracticeMenuSet,
    updatePracticeMenuSet
} from './practice-menu-sets-store.js';
import { movePracticeMenu } from './practice-menu-store.js';
import { validateRecordPayload } from '../../workers/sound-cruise-sync/src/record-schema-registry.js';

const T = '2026-09-29T00:00:00.000Z';
const LATER = new Date('2026-09-30T00:00:00.000Z');
const menu = (id, hidden = false) => ({ id, name: `menu ${id}`, durationMinutes: 10, appId: null, memo: '', hidden, createdAt: T, updatedAt: T });
const MENUS = Object.freeze(['A', 'B', 'C', 'D'].map((id) => menu(id)));
const visible = (menus) => menus.filter((item) => !item.hidden);
const ids = (items) => items.map((item) => item.id);
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('./practice-menu-app.js');

function setsWithOrders() {
    const first = createPracticeMenuSet({ name: '音感練', itemIds: ['C', 'A', 'B'] }, [], MENUS, new Date(T));
    const second = createPracticeMenuSet({ name: '朝練', itemIds: ['B', 'A', 'D'] }, first.items, MENUS, new Date(T));
    const setA = first.set;
    const setB = second.set;
    let items = second.items;
    items = reorderPracticeMenuSet(items, setA.id, ['C', 'A', 'B'], LATER).items;
    items = reorderPracticeMenuSet(items, setB.id, ['B', 'A', 'D'], LATER).items;
    return { items, idA: setA.id, idB: setB.id, find: (list, id) => list.find((set) => set.id === id) };
}

test('each preset keeps its own order while All keeps the master order', () => {
    const { items, idA, idB, find } = setsWithOrders();
    assert.deepEqual(ids(getPracticeMenuSetItems(visible(MENUS), null)), ['A', 'B', 'C', 'D']);
    assert.deepEqual(ids(getPracticeMenuSetItems(visible(MENUS), find(items, idA))), ['C', 'A', 'B']);
    assert.deepEqual(ids(getPracticeMenuSetItems(visible(MENUS), find(items, idB))), ['B', 'A', 'D']);
    assert.equal(find(items, idA).updatedAt, LATER.toISOString(), 'a set reorder updates updatedAt');
});

test('a new preset starts in master order regardless of selection order', () => {
    const created = createPracticeMenuSet({ name: 'x', itemIds: ['D', 'B'] }, [], MENUS);
    assert.deepEqual(created.set.itemIds, ['B', 'D']);
});

test('reordering preset A changes neither All, the menus nor preset B', () => {
    const { items, idA, idB, find } = setsWithOrders();
    const menusBefore = JSON.stringify(MENUS);
    const before = find(items, idB);
    const result = reorderPracticeMenuSet(items, idA, ['B', 'C', 'A'], LATER);
    assert.equal(result.changed, true);
    assert.deepEqual(find(result.items, idA).itemIds, ['B', 'C', 'A']);
    assert.deepEqual(find(result.items, idB), before, 'preset B untouched');
    assert.equal(JSON.stringify(MENUS), menusBefore, 'menus and master order untouched');
    assert.deepEqual(ids(getPracticeMenuSetItems(visible(MENUS), null)), ['A', 'B', 'C', 'D']);
});

test('an All reorder keeps every preset order', () => {
    const { items, idA, idB, find } = setsWithOrders();
    const master = movePracticeMenu(movePracticeMenu(MENUS, 'D', -1).items, 'D', -1).items;
    assert.deepEqual(ids(master), ['A', 'D', 'B', 'C']);
    assert.deepEqual(ids(getPracticeMenuSetItems(visible(master), find(items, idA))), ['C', 'A', 'B']);
    assert.deepEqual(ids(getPracticeMenuSetItems(visible(master), find(items, idB))), ['B', 'A', 'D']);
});

test('rename and membership edits keep the custom order; additions follow in master order', () => {
    const { items, idA, find } = setsWithOrders();
    const renamed = updatePracticeMenuSet(items, idA, { name: '朝の音感練', itemIds: ['A', 'B', 'C'] }, MENUS, LATER);
    assert.deepEqual(renamed.set.itemIds, ['C', 'A', 'B'], 'rename (checkbox order is master order) keeps the order');
    const removed = updatePracticeMenuSet(renamed.items, idA, { name: '朝の音感練', itemIds: ['B', 'C'] }, MENUS, LATER);
    assert.deepEqual(removed.set.itemIds, ['C', 'B'], 'removing keeps the remaining order');
    const added = updatePracticeMenuSet(removed.items, idA, { name: '朝の音感練', itemIds: ['A', 'B', 'C', 'D'] }, MENUS, LATER);
    assert.deepEqual(added.set.itemIds, ['C', 'B', 'A', 'D'], 'new menus are appended in master order');
    assert.deepEqual(find(items, idA).itemIds, ['C', 'A', 'B'], 'inputs are not mutated');
});

test('hidden and missing references keep their slots through reorder and are safe', () => {
    const menus = [menu('A'), menu('B', true), menu('C'), menu('D')];
    const set = { id: 's1', name: 's', itemIds: ['C', 'B', 'gone', 'A', 'D'], createdAt: T, updatedAt: T };
    assert.deepEqual(ids(getPracticeMenuSetItems(visible(menus), set)), ['C', 'A', 'D']);
    const result = reorderPracticeMenuSet([set], 's1', ['D', 'C', 'A'], LATER);
    assert.deepEqual(result.set.itemIds, ['D', 'B', 'gone', 'C', 'A'], 'hidden B and missing id stay in place');
    const unhidden = menus.map((item) => ({ ...item, hidden: false }));
    assert.deepEqual(ids(getPracticeMenuSetItems(visible(unhidden), result.set)), ['D', 'B', 'C', 'A'],
        'un-hiding returns B to its place in the set');
    assert.deepEqual(reorderPracticeMenuSet([set], 's1', ['A', 'C'], LATER).set.itemIds, ['A', 'B', 'gone', 'C', 'D'],
        'only the listed slots are permuted; no id is ever lost');
    assert.equal(reorderPracticeMenuSet([set], 's1', ['C', 'C', 'A'], LATER).reason, 'invalid-order');
    assert.equal(reorderPracticeMenuSet([set], 's1', ['C', 'A', 'X'], LATER).reason, 'invalid-order');
    assert.equal(reorderPracticeMenuSet([set], 'missing', ['C'], LATER).reason, 'not-found');
    const same = reorderPracticeMenuSet([set], 's1', ['C', 'A', 'D'], LATER);
    assert.equal(same.changed, false);
    assert.equal(same.set.updatedAt, T, 'an unchanged order is not a save');
    const edited = updatePracticeMenuSet([result.set], 's1', { name: 's', itemIds: ['A', 'C', 'D', 'B'] }, menus, LATER);
    assert.deepEqual(edited.set.itemIds, ['D', 'B', 'C', 'A'], 'saving an edit cleans the missing id only');
});

test('the reordered itemIds are a valid practice_menu_set payload for the unchanged Worker', () => {
    const { items, idA, find } = setsWithOrders();
    const set = JSON.parse(JSON.stringify(find(items, idA)));
    assert.equal(validateRecordPayload('port', 'practice_menu_set', set.id, { id: set.id, value: set }), true);
    assert.deepEqual(set.itemIds, ['C', 'A', 'B']);
});

function body(name) {
    const start = app.indexOf(`function ${name}(`);
    const open = app.indexOf(') {\n', start) + 2;
    let depth = 0;
    for (let index = open; index < app.length; index += 1) {
        if (app[index] === '{') depth += 1;
        if (app[index] === '}' && --depth === 0) return app.slice(open, index + 1);
    }
    throw new Error(name);
}

test('並び替え works in custom presets and targets only that set', () => {
    assert.match(app, /elements\.reorderStart\.hidden = state\.reorderMode \|\| visibleItems\.length < 2;/,
        'visible for All and custom presets alike');
    assert.match(app, /`プリセット「\$\{selectedSet\.name\}」を並び替え`[\s\S]*'全ての練習メニューを並び替え'/);
    const start = body('startReorder');
    assert.match(start, /const items = getDisplayedPracticeItems\(\);/);
    assert.match(start, /state\.reorderSetId = selectedSet\?\.id \|\| null;/);
    assert.match(body('completeReorder'), /if \(state\.reorderSetId\) \{\s*completePracticeSetReorder\(\);\s*return;/);
    const setReorder = body('completePracticeSetReorder');
    assert.match(setReorder, /reorderPracticeMenuSet\(/);
    assert.match(setReorder, /persistPracticeSets\(result\.items\)/);
    assert.doesNotMatch(setReorder, /savePracticeMenus|Progress|History|Completion|setPracticeChecked/,
        'a set reorder never touches menus, checks, counts, history or completion');
    assert.doesNotMatch(body('startReorder') + body('cancelReorder'), /Progress|History|Completion/);
});

test('非表示 and 並び替え sit under チェックをすべてリセット in both entries', () => {
    for (const path of ['./index.html', './pro_9a3943176561/index.html']) {
        const html = read(path);
        const actions = html.slice(html.indexOf('<div class="practice-cycle-actions">'), html.indexOf('id="practice-hidden-view"'));
        const reset = actions.indexOf('id="practice-cycle-reset"');
        assert.ok(reset > 0 && reset < actions.indexOf('id="practice-hidden-open"'), path);
        assert.ok(actions.indexOf('id="practice-hidden-open"') < actions.indexOf('id="practice-reorder-start"'), path);
        assert.equal((html.match(/id="practice-hidden-open"/g) || []).length, 1, 'moved, not duplicated');
        const top = html.slice(html.indexOf('id="practice-set-bar"'), html.indexOf('id="practice-menu-list"'));
        assert.doesNotMatch(top, /practice-hidden-open|practice-reorder-start/, 'no longer above the list');
    }
});

test('練習終了 reuses the 練習スタート primary gold style and the shared manual finish', () => {
    const css = read('./style.css');
    for (const path of ['./index.html', './pro_9a3943176561/index.html']) {
        assert.match(read(path), /<button id="practice-timer-stop" class="practice-timer-toggle practice-timer-stop" type="button" hidden>練習終了<\/button>/);
        assert.match(read(path), /<button id="practice-timer-toggle" class="practice-timer-toggle" type="button">/);
    }
    assert.doesNotMatch(css, /\.practice-timer-stop \{/, 'no duplicated look-alike rule');
    assert.match(css, /\.practice-timer-toggle \{[^}]*background: linear-gradient\(180deg, #dbc68f, #b89d5e\);/);
    assert.match(app, /elements\.timerToggle\.classList\.toggle\('is-running', running\);/, 'only the start/pause button dims while running');
    assert.doesNotMatch(app, /timerStop\.classList/);
    // 1.4.3: 練習終了 runs the same manual finish as ここで練習終了.
    assert.match(app, /elements\.timerStop\.addEventListener\('click', handlePracticeFinishEarly\);/);
    assert.match(app, /elements\.finishButton\.addEventListener\('click', handlePracticeFinishEarly\);/);
    assert.match(read('./index.html'), /id="practice-finish" class="practice-finish-action"/, 'ここで練習終了 keeps its own style');
});
