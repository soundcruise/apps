import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('./practice-menu-app.js');
const css = read('./style.css');
const entries = [['standard', read('./index.html')], ['pro', read('./pro_9a3943176561/index.html')]];

function functionBody(name) {
    const start = app.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    const open = app.indexOf(') {\n', start) + 2; // skip destructured parameters
    let depth = 0;
    for (let index = open; index < app.length; index += 1) {
        if (app[index] === '{') depth += 1;
        if (app[index] === '}' && --depth === 0) return app.slice(open, index + 1);
    }
    throw new Error(name);
}

test('both entries show [プリセット ▼][＋] with the virtual All option first', () => {
    for (const [label, html] of entries) {
        const bar = html.match(/<div id="practice-set-bar"[\s\S]*?<\/div>\s*<button id="practice-set-edit"[^>]*>[^<]*<\/button>\s*<\/div>/)?.[0];
        assert.ok(bar, label);
        assert.match(bar, /<label class="practice-set-label" for="practice-set-select">プリセット<\/label>/);
        assert.match(bar, /<div class="practice-set-controls">\s*<select id="practice-set-select">\s*<option value="all">全ての練習メニュー<\/option>\s*<\/select>\s*<button id="practice-set-create"[^>]*aria-label="プリセットを作成"/,
            'the ＋ button sits directly to the right of the dropdown');
        assert.match(bar, /<button id="practice-set-edit" class="practice-set-edit" type="button" hidden>プリセットを編集<\/button>/,
            'the edit link is its own row and hidden for All');
        assert.ok(html.indexOf('id="practice-set-bar"') < html.indexOf('id="practice-menu-list"'), 'the selector is above the list');
        assert.match(html, /id="practice-set-empty" class="practice-empty" hidden/);
    }
    assert.match(css, /\.practice-set-controls \{[^}]*grid-template-columns: minmax\(0, 1fr\) 48px;/, 'one row at 375px');
    assert.doesNotMatch(css.slice(css.indexOf('/* Practice menu sets'), css.indexOf('.practice-overview {')), /glow|text-shadow|animation/,
        'no flashy effects');
});

test('the editor is an accessible modal with name, menu checkboxes, save, cancel and delete', () => {
    for (const [label, html] of entries) {
        const dialog = html.match(/<div id="practice-set-dialog"[\s\S]*?<\/section>\s*<\/div>/)?.[0];
        assert.ok(dialog, label);
        assert.match(dialog, /role="dialog" aria-modal="true" aria-labelledby="practice-set-dialog-title"/);
        assert.match(dialog, /<label for="practice-set-name">プリセット名/);
        assert.match(dialog, /<fieldset class="practice-set-items">\s*<legend>含める練習メニュー/);
        assert.match(dialog, /type="submit">保存<\/button>/);
        assert.match(dialog, /id="practice-set-cancel"[^>]*>キャンセル<\/button>/);
        assert.match(dialog, /id="practice-set-delete"[^>]*hidden>このプリセットを削除<\/button>/);
    }
    const keydown = app.slice(app.indexOf("elements.setDialog.addEventListener('keydown'"), app.indexOf("elements.setDialog.addEventListener('keydown'") + 900);
    assert.match(keydown, /event\.key === 'Escape'[\s\S]*requestClosePracticeSetDialog\(\)/, 'Escape closes (with unsaved confirmation)');
    assert.match(keydown, /event\.key !== 'Tab'[\s\S]*focusable\.at\(-1\)\?\.focus\(\)[\s\S]*focusable\[0\]\?\.focus\(\)/, 'focus stays inside');
    assert.match(functionBody('openPracticeSetDialog'), /elements\.practiceListView\.inert = true[\s\S]*elements\.setName\.focus\(\)/);
    assert.match(functionBody('closePracticeSetDialog'), /elements\.practiceListView\.inert = false[\s\S]*\.focus\(\{ preventScroll: true \}\)/, 'focus is restored');
    assert.match(functionBody('requestClosePracticeSetDialog'), /isPracticeSetDialogDirty\(\) && !window\.confirm\('変更を保存せずに閉じますか？'\)/);
    assert.match(functionBody('handlePracticeSetDelete'), /window\.confirm\('このプリセットを削除しますか？\\n練習メニュー自体は削除されません。'\)[\s\S]*selectPracticeSet\(ALL_PRACTICE_MENUS_SET_ID\)/);
    for (const selector of ['.practice-set-add:focus-visible', '.practice-set-edit:focus-visible', '.practice-set-item input:focus-visible']) {
        assert.ok(css.includes(selector), selector);
    }
});

test('selecting a set is a pure view change: no progress, count, history or completion code runs', () => {
    const listener = app.slice(app.indexOf("elements.setSelect.addEventListener('change'"), app.indexOf("elements.setCreate.addEventListener"));
    assert.match(listener, /selectPracticeSet\(elements\.setSelect\.value\);\s*renderPracticeList\(\{ focus: false \}\);/);
    const select = functionBody('selectPracticeSet');
    for (const body of [listener, select, functionBody('renderPracticeSetBar'), functionBody('getDisplayedPracticeItems')]) {
        assert.doesNotMatch(body, /Progress|History|Completion|syncPracticeCompletionDialog|setPracticeChecked/);
    }
    assert.match(select, /savePracticeMenuSetSelection\(nextId\)/, 'selection is a device-local preference');
});

test('completion covers only the displayed menus and requires the check to complete that scope', () => {
    const check = functionBody('persistPracticeCheck');
    assert.match(check, /const activeIds = getDisplayedPracticeItems\(\)\.map\(\(activeItem\) => activeItem\.id\);/);
    assert.match(check, /if \(checked && activeIds\.includes\(item\.id\) && canCompletePracticeCycle\(nextProgress, activeIds\)\)/);
    assert.match(functionBody('getDisplayedPracticeItems'), /getPracticeMenuSetItems\(getActivePracticeItems\(\), getSelectedPracticeSet\(\)\)/,
        'All keeps the existing active-menu rule; sets reuse the same visibility');
    const finish = functionBody('handlePracticeFinishEarly');
    assert.match(finish, /PRACTICE_COMPLETION_TYPE\.partial/);
    assert.match(finish, /clearAllPracticeCurrentChecks\(transition\.progress\)/, 'manual finish semantics unchanged');
});

test('both completion cards offer 練習画面に戻る through the existing completion commit', () => {
    for (const [label, html] of entries) {
        const actions = html.match(/<div class="practice-completion-actions">[\s\S]*?<\/div>/)?.[0];
        assert.ok(actions, label);
        assert.deepEqual([...actions.matchAll(/>([^<]+)<\/button>/g)].map((match) => match[1]),
            ['練習を終了する', '練習画面に戻る', '音楽カレンダーを見る']);
    }
    // One dialog serves both the automatic (complete) and manual (partial) card.
    assert.match(functionBody('syncPracticeCompletionDialog'), /const complete = pending\.type === PRACTICE_COMPLETION_TYPE\.complete/);
    assert.match(app, /elements\.completionPractice\.addEventListener\('click', \(\) => handlePracticeCompletionAction\('practice'\)\);/);
    const action = functionBody('handlePracticeCompletionAction');
    const commit = action.indexOf('finishPracticeCompletion(state.progress)');
    const practice = action.indexOf("destination === 'practice'");
    assert.ok(commit > 0 && practice > commit, 'the return button commits exactly like the other buttons, then navigates');
    assert.match(action, /if \(state\.completionActionInProgress \|\| !state\.progress\?\.completionPending\) return;/, 'no double commit');
    assert.doesNotMatch(action, /startPracticeTimer|resumePracticeTimer|checkedPracticeIds|totalCounts/, 'no restart, restore or count change');
    assert.match(app, /const focusable = \[elements\.completionEnd, elements\.completionPractice, elements\.completionCalendar\]/);
});

test('a missing or deleted selection falls back to All and loading never migrates menus', () => {
    assert.match(app, /state\.selectedSetId = resolvePracticeMenuSetSelection\(state\.practiceSets, loadPracticeMenuSetSelection\(\)\);/);
    assert.match(functionBody('renderPracticeSetBar'), /selectPracticeSet\(ALL_PRACTICE_MENUS_SET_ID\)/);
    assert.match(app, /'プリセットの保存データを読み込めないため、「全ての練習メニュー」を表示しています。/);
    const render = functionBody('renderPracticeList');
    assert.match(render, /elements\.setEmpty\.hidden = !selectedSet \|\| activeItems\.length === 0 \|\| visibleItems\.length > 0;/);
});
