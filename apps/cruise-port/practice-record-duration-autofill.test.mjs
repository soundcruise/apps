import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
function functionSource(name) {
    const from = source.indexOf(`function ${name}(`);
    assert.ok(from >= 0, name);
    return source.slice(from, source.indexOf('\nfunction ', from + 1));
}
function fixture(editId = null) {
    const items = [
        { id: 'menu-a', name: 'A', durationMinutes: 10, hidden: false },
        { id: 'menu-b', name: 'B', durationMinutes: 30, hidden: false },
        { id: 'menu-c', name: 'C', durationMinutes: 45, hidden: false },
        { id: 'menu-hidden', name: 'Hidden', durationMinutes: 20, hidden: true }
    ];
    const buttons = [];
    const elements = {
        historyFormMenu: { value: 'menu-a' },
        historyFormMinutes: { value: '10' },
        historyFormPresets: { replaceChildren(...children) { buttons.splice(0, buttons.length, ...children); } }
    };
    const document = { createElement() { return { dataset: {}, setAttribute(name, value) { this[name] = value; } }; } };
    const context = vm.createContext({
        state: { historyRecordEditId: editId }, elements, document,
        findItem: id => items.find(item => item.id === id),
        PRACTICE_RECORD_DURATION_PRESETS: [5, 10, 15, 30]
    });
    vm.runInContext([
        functionSource('renderPracticeRecordPresets'),
        functionSource('syncPracticeRecordDurationFromSelectedMenu')
    ].join('\n'), context);
    const select = id => {
        elements.historyFormMenu.value = id;
        context.syncPracticeRecordDurationFromSelectedMenu();
    };
    const pressed = minutes => buttons.find(button => button.dataset.minutes === String(minutes))?.['aria-pressed'];
    return { context, elements, select, pressed };
}

test('A/C: add-mode menu changes apply 10 → 30 → 45 and refresh preset state', () => {
    const f = fixture();
    f.select('menu-a');
    assert.equal(f.elements.historyFormMinutes.value, '10');
    assert.equal(f.pressed(10), 'true');
    f.select('menu-b');
    assert.equal(f.elements.historyFormMinutes.value, '30');
    assert.equal(f.pressed(10), 'false');
    assert.equal(f.pressed(30), 'true');
    f.select('menu-c');
    assert.equal(f.elements.historyFormMinutes.value, '45');
    assert.equal(f.pressed(30), 'false', 'non-preset duration leaves all preset buttons unpressed');
});

test('B: manual override remains editable and unchanged until another menu change', () => {
    const f = fixture();
    f.select('menu-b');
    f.elements.historyFormMinutes.value = '37';
    f.context.renderPracticeRecordPresets();
    assert.equal(f.elements.historyFormMinutes.value, '37');
    assert.equal(f.pressed(30), 'false');
    assert.equal(f.elements.historyFormMinutes.value, '37', 'preset rendering does not reset the input');
    f.select('menu-c');
    assert.equal(f.elements.historyFormMinutes.value, '45');
});

test('D: a hidden menu uses the same duration lookup', () => {
    const f = fixture();
    f.select('menu-hidden');
    assert.equal(f.elements.historyFormMinutes.value, '20');
});

for (const [label, minutes] of [['manual record', 37], ['finished timer record', 65], ['running timer record', 12]]) {
    test(`E/F/G: ${label} edit never overwrites its current duration`, () => {
        const f = fixture(`record-${label}`);
        f.elements.historyFormMinutes.value = String(minutes);
        f.select('menu-b');
        assert.equal(f.elements.historyFormMinutes.value, String(minutes));
    });
}

test('the shipped form wires menu change to the scoped helper; save/history code is untouched', () => {
    assert.match(source, /elements\.historyFormMenu\.addEventListener\('change', syncPracticeRecordDurationFromSelectedMenu\)/);
    assert.match(functionSource('syncPracticeRecordDurationFromSelectedMenu'), /state\.historyRecordEditId !== null/);
    assert.match(functionSource('syncPracticeRecordDurationFromSelectedMenu'), /renderPracticeRecordPresets\(\)/);
    assert.match(functionSource('handlePracticeRecordSubmit'), /createManualPracticeRecord/);
    assert.match(functionSource('handlePracticeRecordSubmit'), /updatePracticeHistoryRecord/);
});
