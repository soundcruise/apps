import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as menus from './practice-menu-store.js';
import * as progress from './practice-menu-progress-store.js';

const source = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
function extract(name) {
    const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
    assert.ok(start >= 0, name);
    const rest = source.slice(start);
    const end = rest.slice(1).search(/\n(?:async )?function /);
    return end < 0 ? rest : rest.slice(0, end + 1);
}
function fixture({ hidden = false, failure = null } = {}) {
    const item = { ...menus.createPracticeMenu({ name: '監査', durationMinutes: 10, appId: null, memo: '保存済み' }, []), hidden };
    const values = new Map([[menus.STORAGE_KEYS.schemaVersion, '3'], [menus.STORAGE_KEYS.practiceMenus, JSON.stringify({ version: 3, items: [item] })]]);
    const writes = [];
    const storage = { getItem: key => values.get(key) ?? null,
        setItem(key, value) { writes.push(key); if (failure === 'quota') throw Error('quota'); values.set(key, value); },
        removeItem(key) { values.delete(key); } };
    const state = { items: menus.loadPracticeMenus(storage).items, formMode: 'edit', activeId: item.id,
        formSaving: false, progressReady: true, progress: progress.createEmptyPracticeProgress() };
    const document = { activeElement: null };
    const control = (value = '') => ({ value, hidden: false, focus() { document.activeElement = this; } });
    const back = control();
    const elements = { nameInput: control(item.name), durationInput: control('10'), appInput: control(''),
        memoInput: control(item.memo), hiddenInput: { checked: hidden }, formView: { hidden: false, inert: false, querySelector: () => back },
        practiceExitDialog: { hidden: true }, practiceExitSave: control(), practiceExitDiscard: control(), practiceExitContinue: control(),
        formError: { ...control(), hidden: true } };
    const routes = [];
    const route = value => { routes.push(value); elements.formView.hidden = true; };
    const context = vm.createContext({ ...menus, ...progress, elements, state, document,
        myAppsState: { items: [], storageReady: true }, isSelectablePracticeAppId: () => true,
        findItem: id => state.items.find(item => item.id === id),
        savePracticeMenus: items => menus.savePracticeMenus(items, storage),
        savePracticeProgress: () => ({ ok: true }),
        showNotice(el, message = '') { el.hidden = !message; el.textContent = message; },
        setHashRoute: route, setPracticeListRoute: () => route('list'),
        replacePracticeDetailRoute: id => route(id), renderRoute: () => route('render'),
        window: { history: { replaceState: (...args) => routes.push(args.at(-1)) } },
        location: { pathname: '/port/', search: '' }
    });
    vm.runInContext(['practiceFormSnapshot', 'closePracticeExitDialog', 'cancelForm', 'leavePracticeForm',
        'savePracticeFormAndReturn', 'discardPracticeFormAndReturn', 'handlePracticeExitKeydown',
        'readFormValues', 'persistPracticeItemsAndProgress', 'handleSubmit'].map(extract).join('\n'), context);
    state.initialFormSnapshot = context.practiceFormSnapshot();
    return { context, elements, state, values, writes, routes, item, document, back };
}

test('unchanged edit exits immediately; reverting an edit also exits; new create stays unguarded', () => {
    for (const mode of ['unchanged', 'reverted', 'create']) {
        const f = fixture();
        if (mode === 'reverted') { f.elements.memoInput.value = '変更'; f.elements.memoInput.value = '保存済み'; }
        if (mode === 'create') { f.state.formMode = 'create'; f.elements.memoInput.value = '新規'; }
        f.context.cancelForm();
        assert.equal(f.elements.practiceExitDialog.hidden, true);
        assert.equal(f.routes.length, 1);
        assert.equal(f.writes.length, 0);
    }
});
for (const field of ['nameInput', 'durationInput', 'appInput', 'memoInput', 'hiddenInput']) {
    test(`dirty ${field} opens confirmation without writing data`, () => {
        const f = fixture();
        if (field === 'hiddenInput') f.elements[field].checked = true;
        else f.elements[field].value += '変更';
        f.context.cancelForm();
        assert.equal(f.elements.practiceExitDialog.hidden, false);
        assert.equal(f.elements.formView.inert, true);
        assert.equal(f.document.activeElement, f.elements.practiceExitSave);
        assert.equal(f.routes.length, 0);
        assert.equal(f.writes.length, 0);
    });
}
test('continue/Escape preserve inputs, restore focus, and Tab wraps in both directions', () => {
    const f = fixture(); f.elements.memoInput.value = '未保存';
    f.context.cancelForm();
    const key = (key, shiftKey = false) => f.context.handlePracticeExitKeydown({ key, shiftKey, preventDefault() {} });
    key('Tab', true); assert.equal(f.document.activeElement, f.elements.practiceExitContinue);
    key('Tab'); assert.equal(f.document.activeElement, f.elements.practiceExitSave);
    key('Escape'); assert.equal(f.document.activeElement, f.back);
    assert.equal(f.elements.formView.inert, false);
    assert.equal(f.elements.memoInput.value, '未保存');
    f.context.cancelForm(); f.context.closePracticeExitDialog();
    assert.equal(f.elements.memoInput.value, '未保存');
    assert.equal(f.routes.length, 0); assert.equal(f.writes.length, 0);
});
test('discard preserves saved bytes and returns hidden/visible menus to their existing destinations', () => {
    for (const hidden of [false, true]) {
        const f = fixture({ hidden }); const before = [...f.values];
        f.elements.memoInput.value = '未保存'; f.context.cancelForm(); f.context.discardPracticeFormAndReturn();
        assert.deepEqual([...f.values], before);
        assert.deepEqual(f.routes, [hidden ? '#practice-menu/hidden' : `#practice-menu/${f.item.id}`]);
    }
});
test('save-and-return uses the real edit/persistence handler for visible and hidden menus', async () => {
    for (const hidden of [false, true]) {
        const f = fixture({ hidden }); const beforeProgress = JSON.stringify(f.state.progress);
        f.elements.memoInput.value = '変更保存'; f.context.cancelForm(); await f.context.savePracticeFormAndReturn();
        assert.equal(JSON.parse(f.values.get(menus.STORAGE_KEYS.practiceMenus)).items[0].memo, '変更保存');
        assert.equal(f.elements.formView.hidden, true);
        assert.equal(JSON.stringify(f.state.progress), beforeProgress);
        assert.equal(f.writes.every(key => Object.values(menus.STORAGE_KEYS).includes(key)), true);
        if (hidden) assert.ok(f.routes.some(route => route.endsWith('#practice-menu/hidden')));
    }
});
for (const failure of ['validation', 'quota', 'stale']) test(`${failure} keeps input and form, shows error, and preserves saved data`, async () => {
    const f = fixture({ failure }); f.elements.memoInput.value = '未保存';
    if (failure === 'validation') f.elements.durationInput.value = '0';
    if (failure === 'stale') f.values.set(menus.STORAGE_KEYS.practiceMenus, JSON.stringify({ version: 3, items: [{ ...f.item, memo: '別タブ' }] }));
    const before = [...f.values];
    f.context.cancelForm(); await f.context.savePracticeFormAndReturn();
    assert.deepEqual([...f.values], before);
    assert.equal(f.elements.formView.hidden, false); assert.equal(f.elements.formView.inert, false);
    assert.equal(f.elements.formError.hidden, false); assert.equal(f.document.activeElement, f.elements.formError);
    assert.equal(f.elements.memoInput.value, '未保存'); assert.equal(f.routes.length, 0);
});
test('both entries wire a labelled/described dialog; edit snapshots and immediate attachments stay separate', () => {
    for (const entry of ['index.html', 'pro_9a3943176561/index.html']) {
        const html = readFileSync(new URL(entry, import.meta.url), 'utf8');
        assert.match(html, /id="practice-exit-dialog"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="practice-exit-title"[^>]*aria-describedby="practice-exit-description"/);
    }
    assert.match(extract('renderForm'), /fillForm\(item\);\s*state.initialFormSnapshot = practiceFormSnapshot\(\)/);
    assert.match(extract('handlePracticeAttachmentSelection'), /scope === 'form' && state.formMode === 'create'/);
    assert.match(extract('handlePracticeAttachmentSelection'), /await practiceAttachmentStore.addAttachment/);
});
