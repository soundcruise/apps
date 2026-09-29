import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    PRACTICE_MENU_SETS_STORAGE_KEY,
    addPracticeMenuToSets,
    createPracticeMenuSet,
    loadPracticeMenuSets,
    savePracticeMenuSets
} from './practice-menu-sets-store.js';

const T = '2026-09-29T00:00:00.000Z';
const NOW = new Date('2026-10-01T00:00:00.000Z');
const set = (id, itemIds) => ({ id, name: id, itemIds, createdAt: T, updatedAt: T });
const menu = (id) => ({ id, name: id, durationMinutes: 10, appId: null, memo: '', hidden: false, createdAt: T, updatedAt: T });
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('./practice-menu-app.js');

function body(name) {
    const start = app.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    const open = app.indexOf(') {\n', start) + 2;
    let depth = 0;
    for (let index = open; index < app.length; index += 1) {
        if (app[index] === '{') depth += 1;
        if (app[index] === '}' && --depth === 0) return app.slice(open, index + 1);
    }
    throw new Error(name);
}

test('a new menu is appended to the end of each chosen set, keeping each custom order', () => {
    const sets = [set('A', ['C', 'A', 'B']), set('B', ['B', 'A']), set('C', ['A'])];
    const result = addPracticeMenuToSets(sets, ['A', 'B'], 'D', NOW);
    assert.equal(result.changed, true);
    assert.deepEqual(result.updatedIds, ['A', 'B']);
    assert.deepEqual(result.items.map((item) => item.itemIds), [['C', 'A', 'B', 'D'], ['B', 'A', 'D'], ['A']]);
    assert.deepEqual(result.items.map((item) => item.updatedAt), [NOW.toISOString(), NOW.toISOString(), T], 'C untouched');
    assert.deepEqual(sets[0].itemIds, ['C', 'A', 'B'], 'inputs are not mutated');
});

test('missing chosen sets are skipped safely and nothing is duplicated', () => {
    const sets = [set('A', ['X'])];
    assert.deepEqual(addPracticeMenuToSets(sets, ['deleted-by-sync'], 'D', NOW),
        { changed: false, updatedIds: [], items: sets });
    assert.equal(addPracticeMenuToSets(sets, ['A'], 'X', NOW).changed, false);
    assert.equal(addPracticeMenuToSets(sets, [], 'D', NOW).changed, false);
    assert.equal(addPracticeMenuToSets([], ['A'], 'D', NOW).changed, false);
});

test('a set created from 練習メニューを追加 may start empty; the regular ＋ still needs a menu', () => {
    const menus = [menu('A')];
    assert.equal(createPracticeMenuSet({ name: 'ボイトレ', itemIds: [] }, [], menus).reason, 'items-required');
    const fromForm = createPracticeMenuSet({ name: 'ボイトレ', itemIds: [] }, [], menus, NOW, { allowEmpty: true });
    assert.equal(fromForm.ok, true);
    assert.deepEqual(fromForm.set.itemIds, []);
    assert.equal(createPracticeMenuSet({ name: ' ', itemIds: [] }, [], menus, NOW, { allowEmpty: true }).reason, 'name-required');
    const withMenu = addPracticeMenuToSets(fromForm.items, [fromForm.set.id], 'NEW', NOW);
    assert.deepEqual(withMenu.items[0].itemIds, ['NEW'], 'the new menu joins on save');
});

test('a failed set write leaves stored sets unchanged', () => {
    const data = new Map([[PRACTICE_MENU_SETS_STORAGE_KEY, JSON.stringify({ version: 1, items: [set('A', ['C'])] })]]);
    let fail = false;
    const storage = {
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => { if (fail) throw new Error('quota'); data.set(key, String(value)); },
        removeItem: (key) => data.delete(key)
    };
    const loaded = loadPracticeMenuSets(storage).items;
    fail = true;
    const next = addPracticeMenuToSets(loaded, ['A'], 'D', NOW).items;
    assert.deepEqual(savePracticeMenuSets(next, storage), { ok: false, reason: 'write-failed' });
    fail = false;
    assert.deepEqual(loadPracticeMenuSets(storage).items[0].itemIds, ['C']);
});

test('練習メニューを追加 is shown for All and for every custom preset', () => {
    assert.match(body('renderPracticeList'), /elements\.addButton\.hidden = state\.reorderMode;/);
    assert.doesNotMatch(body('renderPracticeList'), /addButton\.hidden = [^;]*selectedSet/);
});

test('both entries add 追加するプリセット as a labelled checkbox fieldset inside the form', () => {
    for (const path of ['./index.html', './pro_9a3943176561/index.html']) {
        const html = read(path);
        const form = html.slice(html.indexOf('id="practice-form-view"'), html.indexOf('</form>', html.indexOf('id="practice-form-view"')));
        const fieldset = form.slice(form.indexOf('<fieldset id="practice-form-sets"'), form.indexOf('</fieldset>', form.indexOf('<fieldset id="practice-form-sets"')));
        assert.match(fieldset, /class="form-field practice-form-sets" hidden/, path);
        assert.match(fieldset, /<legend>追加するプリセット/);
        assert.match(fieldset, /id="practice-form-set-list" class="practice-set-item-list practice-form-set-list" hidden/, 'reuses the preset checkbox list, collapsed');
        assert.match(fieldset, /<button id="practice-form-set-create" class="practice-form-set-create" type="button"><span aria-hidden="true">＋<\/span> プリセットを作成<\/button>/);
        assert.ok(form.indexOf('id="practice-memo"') < form.indexOf('id="practice-form-sets"'));
        assert.ok(form.indexOf('id="practice-form-sets"') < form.indexOf('type="submit"'));
    }
});

test('custom sets only, in the existing order, with the selected set as the only default', () => {
    const render = body('renderPracticeFormSets');
    assert.match(render, /elements\.formSets\.hidden = state\.formMode !== 'create' \|\| !state\.practiceSetsReady;/, 'new menus only');
    assert.match(render, /state\.practiceSets\.map\(\(set\) =>/, 'existing set order, no All option');
    assert.doesNotMatch(render, /ALL_PRACTICE_MENUS_SET_ID|全ての練習メニュー/);
    assert.match(body('renderForm'), /renderPracticeFormSets\(mode === 'create' && getSelectedPracticeSet\(\) \? \[getSelectedPracticeSet\(\)\.id\] : \[\],\s*\{ expanded: false \}\);/,
        'All (or a missing selection) checks nothing; a custom selection checks only itself');
});

test('＋ プリセットを作成 reuses the preset dialog and returns to the add form with input kept', () => {
    assert.match(body('openPracticeSetDialog'), /elements\.setItemsRequirement\.textContent = host === 'form' \? '任意' : '1つ以上';/);
    assert.match(app, /elements\.formSetCreate\.addEventListener\('click', \(\) => openPracticeSetDialog\('create', \{ host: 'form' \}\)\);/);
    assert.match(body('getPracticeSetDialogHostView'), /state\.setDialogHost === 'form' \? elements\.formView : elements\.practiceListView/);
    const submit = body('handlePracticeSetSubmit');
    assert.match(submit, /createPracticeMenuSet\([\s\S]*\{ allowEmpty: state\.setDialogHost === 'form' \}\)/, 'same create logic');
    const formBranch = submit.slice(submit.indexOf("if (state.setDialogHost === 'form')"), submit.indexOf('// Selecting a set never changes'));
    assert.match(formBranch, /const checked = \[\.\.\.readPracticeFormSetIds\(\), result\.set\.id\];/, 'the new set is auto-checked');
    assert.match(formBranch, /renderPracticeFormSets\(checked\);/);
    assert.match(formBranch, /\.focus\(\{ preventScroll: true \}\)/);
    assert.doesNotMatch(formBranch, /selectPracticeSet|renderPracticeList|fillForm|renderForm|setHashRoute/,
        'the list selection and the form fields are untouched');
    // Cancel only closes the overlay and restores focus to the button inside the form.
    assert.doesNotMatch(body('closePracticeSetDialog'), /fillForm|renderForm/);
});

test('the menu is saved before any set changes; failures never mutate sets', () => {
    const create = app.slice(app.indexOf('if (!guardPracticeCreation()) return;'), app.indexOf('\nfunction cancelForm'));
    assert.match(create, /const chosenSetIds = readPracticeFormSetIds\(\);\s*if \(persist\(\[\.\.\.state\.items, item\]\)\) \{\s*\/\/[^\n]*\n\s*const setNotice = addNewPracticeMenuToSets\(item, chosenSetIds\);/);
    const add = body('addNewPracticeMenuToSets');
    assert.match(add, /addPracticeMenuToSets\(state\.practiceSets, setIds, item\.id\)/);
    assert.match(add, /result\.changed && !persistPracticeSets\(result\.items\)/, 'one batch write, failure detected');
    assert.match(add, /練習メニューは保存しましたが、プリセットに追加できませんでした。/);
});
