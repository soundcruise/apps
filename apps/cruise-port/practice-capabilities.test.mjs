import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canCreatePractice, checkPracticeCreation } from './practice-capabilities.js';
import { getCapabilities } from './cruise-port-capabilities.js?v=0.26.0';
import { createPracticeMenu, loadPracticeMenus, savePracticeMenus } from './practice-menu-store.js?v=0.24.0';

const standard = getCapabilities('standard');
const pro = getCapabilities('pro');
const items = Array.from({ length: 7 }, (_, i) => ({ ...createPracticeMenu({ name: `QA ${i}`, durationMinutes: 1, appId: null, memo: '' }, []), id: `qa-${i}`, hidden: i === 6 }));
function storageFor(values) {
    const data = new Map([['cruisePort.schemaVersion', '3'], ['cruisePort.practiceMenus', JSON.stringify({ version: 3, items: values })]]);
    return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
test('creation policy counts hidden without restricting existing validation', () => {
    for (let n = 0; n <= 7; n++) {
        assert.equal(canCreatePractice(items.slice(0, n), standard), n < 5);
        assert.equal(canCreatePractice(items.slice(0, n), pro), true);
    }
    const storage = storageFor(items);
    assert.deepEqual(loadPracticeMenus(storage).items, items);
    assert.equal(savePracticeMenus(items, storage).ok, true);
    assert.equal(canCreatePractice(items.slice(0, 4), standard), true);
    assert.equal(canCreatePractice([...items.slice(0, 4), items[6]], standard), false);
});
test('latest count rejects sixth create while preserving stale-write detection', () => {
    const storage = storageFor(items.slice(0, 4));
    const loaded = loadPracticeMenus(storage);
    assert.equal(checkPracticeCreation(storage, standard).allowed, true);
    storage.setItem('cruisePort.practiceMenus', JSON.stringify({ version: 3, items: items.slice(0, 5) }));
    assert.equal(checkPracticeCreation(storage, standard).allowed, false);
    assert.equal(savePracticeMenus([...loaded.items, items[6]], storage).ok, false);
    assert.equal(loadPracticeMenus(storage).items.length, 5);
});
test('fresh count reading neither writes nor accepts changed same-count data', () => {
    const storage = storageFor(items.slice(0, 4));
    const old = loadPracticeMenus(storage);
    const changed = old.items.map(item => ({ ...item, memo: 'another tab' }));
    const payload = JSON.stringify({ version: 3, items: changed });
    storage.setItem('cruisePort.practiceMenus', payload);
    assert.equal(checkPracticeCreation(storage, standard).allowed, true);
    assert.equal(storage.getItem('cruisePort.practiceMenus'), payload);
    assert.equal(savePracticeMenus([...old.items, items[6]], storage).ok, false);
});
test('invalid or unavailable latest storage fails closed', () => {
    assert.equal(checkPracticeCreation({ getItem() { throw Error('unavailable'); } }, standard).allowed, false);
    assert.equal(checkPracticeCreation({ getItem() { return 'invalid'; } }, standard).allowed, false);
});

test('product guards stay outside existing edit, completion and file-open paths', () => {
    const app = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
    assert.match(app, /if \(!guardPracticeCreation\(\)\) return;\s+const item = createPracticeMenu/);
    const edit = app.slice(app.indexOf("if (state.formMode === 'edit') {", app.indexOf('function handleSubmit')), app.indexOf('const item = createPracticeMenu', app.indexOf('function handleSubmit')));
    assert(edit.indexOf('updatePracticeMenu') < edit.indexOf('guardPracticeCreation'));
    for (const name of ['handlePracticeFilesAction', 'handlePracticeAttachmentAction', 'persistPracticeCheck']) {
        const block = app.slice(app.indexOf(`function ${name}`)).split('\nfunction ')[0];
        assert.doesNotMatch(block, /getCapabilities|canCreatePractice|practiceFileWrite/);
    }
    for (const html of ['index.html', 'pro_9a3943176561/index.html']) {
        const source = readFileSync(new URL(html, import.meta.url), 'utf8');
        assert.equal((source.match(/<button type="button" class="practice-attachment-add"/g) || []).length, 2);
    }
});
