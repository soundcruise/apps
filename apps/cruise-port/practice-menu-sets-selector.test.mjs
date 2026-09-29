import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('./practice-menu-app.js');
function functionSource(name) {
    const from = source.indexOf(`function ${name}(`);
    assert.ok(from >= 0, name);
    return source.slice(from, source.indexOf('\nfunction ', from + 1));
}

// A minimal DOM for the functions under test.
class FakeElement {
    constructor(tagName = 'div') {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.attributes = {};
        this.hidden = false;
        this.disabled = false;
        this.checked = false;
        this.textContent = '';
        this.className = '';
        this.classes = new Set();
        this.classList = { toggle: (name, on) => (on ? this.classes.add(name) : this.classes.delete(name)) };
    }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    all() { return this.children.flatMap((child) => [child, ...child.all()]); }
    querySelectorAll() { return this.all().filter((node) => node.tagName === 'INPUT'); }
    get text() { return this.children.length ? this.children.map((child) => child.text).join('') : this.textContent; }
}

function harness(sets) {
    const elements = {
        formSets: new FakeElement('fieldset'),
        formSetList: new FakeElement(),
        formSetToggle: new FakeElement('button'),
        formSetSummary: new FakeElement('span')
    };
    const state = { formMode: 'create', practiceSetsReady: true, practiceSets: sets, formSetsExpanded: true };
    const context = vm.createContext({ elements, state, document: { createElement: (tag) => new FakeElement(tag) } });
    vm.runInContext(['readPracticeFormSetIds', 'renderPracticeFormSetSummary', 'setPracticeFormSetsExpanded',
        'renderPracticeFormSets'].map(functionSource).join('\n'), context);
    const chips = () => elements.formSetSummary.children
        .filter((node) => node.className === 'practice-form-set-chip').map((node) => node.textContent);
    const placeholder = () => elements.formSetSummary.children
        .find((node) => node.className === 'practice-form-set-placeholder')?.textContent ?? null;
    const box = (id) => elements.formSetList.querySelectorAll().find((input) => input.value === id);
    return { elements, state, context, chips, placeholder, box };
}

const SETS = [{ id: 's1', name: '音感練' }, { id: 's2', name: '朝練' }, { id: 's3', name: 'ギター練' }];

test('the selector opens collapsed; All shows a placeholder and no chips', () => {
    const h = harness(SETS);
    h.context.renderPracticeFormSets([], { expanded: false });
    assert.equal(h.elements.formSetList.hidden, true, 'candidate list hidden');
    assert.equal(h.elements.formSetToggle.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(h.chips(), []);
    assert.equal(h.placeholder(), 'プリセットを選択');
    assert.equal(h.elements.formSetToggle.getAttribute('aria-label'), '追加するプリセットを選択');
});

test('the current custom preset is visible as a chip while collapsed', () => {
    const h = harness(SETS);
    h.context.renderPracticeFormSets(['s1'], { expanded: false });
    assert.equal(h.elements.formSetList.hidden, true);
    assert.deepEqual(h.chips(), ['音感練']);
    assert.equal(h.elements.formSetToggle.getAttribute('aria-label'), '追加するプリセット：音感練。選択を変更');
});

test('expanding shows every checkbox; changes update chips; collapsing keeps the selection', () => {
    const h = harness(SETS);
    h.context.renderPracticeFormSets(['s1'], { expanded: false });
    h.context.setPracticeFormSetsExpanded(true);
    assert.equal(h.elements.formSetList.hidden, false);
    assert.equal(h.elements.formSetToggle.getAttribute('aria-expanded'), 'true');
    assert.equal(h.elements.formSetList.querySelectorAll().length, 3);
    h.box('s3').checked = true;
    h.context.renderPracticeFormSetSummary(); // the list's change listener
    assert.deepEqual(h.chips(), ['音感練', 'ギター練'], 'multiple chips, in preset order');
    h.context.setPracticeFormSetsExpanded(false);
    assert.equal(h.elements.formSetList.hidden, true);
    assert.deepEqual([...h.context.readPracticeFormSetIds()], ['s1', 's3'], 'selection kept');
    assert.deepEqual(h.chips(), ['音感練', 'ギター練']);
});

test('a preset created from the add form is added as a chip without changing the collapsed state', () => {
    const h = harness(SETS);
    h.context.renderPracticeFormSets(['s2'], { expanded: false });
    h.state.practiceSets = [...SETS, { id: 's4', name: 'ボイトレ' }];
    h.context.renderPracticeFormSets([...h.context.readPracticeFormSetIds(), 's4']);
    assert.equal(h.elements.formSetList.hidden, true, 'stays collapsed');
    assert.deepEqual(h.chips(), ['朝練', 'ボイトレ']);
});

test('with no presets the selector is safe, disabled and says so', () => {
    const h = harness([]);
    h.context.renderPracticeFormSets([], { expanded: false });
    assert.equal(h.placeholder(), '追加先のプリセットはありません');
    assert.equal(h.elements.formSetToggle.disabled, true);
    h.context.setPracticeFormSetsExpanded(true);
    assert.equal(h.elements.formSetList.hidden, true, 'nothing to expand');
    assert.equal(h.elements.formSetToggle.getAttribute('aria-expanded'), 'false');
});

test('markup: a disclosure button controls the list; ＋ プリセットを作成 stays available', () => {
    for (const path of ['./index.html', './pro_9a3943176561/index.html']) {
        const html = read(path);
        const fieldset = html.slice(html.indexOf('<fieldset id="practice-form-sets"'), html.indexOf('</fieldset>', html.indexOf('<fieldset id="practice-form-sets"')));
        assert.match(fieldset, /<button id="practice-form-set-toggle" class="practice-form-set-toggle" type="button" aria-expanded="false" aria-controls="practice-form-set-list">/, path);
        assert.match(fieldset, /<div id="practice-form-set-list" class="practice-set-item-list practice-form-set-list" hidden><\/div>/);
        assert.ok(fieldset.indexOf('id="practice-form-set-toggle"') < fieldset.indexOf('id="practice-form-set-list"'));
        assert.ok(fieldset.indexOf('id="practice-form-set-list"') < fieldset.indexOf('id="practice-form-set-create"'));
        assert.doesNotMatch(fieldset, /practice-form-sets-empty/);
    }
    assert.match(source, /elements\.formSetToggle\.addEventListener\('click', \(\) => setPracticeFormSetsExpanded\(!state\.formSetsExpanded\)\);/);
    assert.match(source, /elements\.formSetList\.addEventListener\('change', renderPracticeFormSetSummary\);/);
    assert.match(source, /elements\.formSetList\.addEventListener\('keydown'[\s\S]*?Escape[\s\S]*?setPracticeFormSetsExpanded\(false\);\s*elements\.formSetToggle\.focus/);
    const css = read('./style.css');
    assert.match(css, /\.practice-form-set-summary \{[^}]*flex-wrap: wrap;/, 'chips wrap at 375px');
    assert.match(css, /\.practice-form-set-chip \{[^}]*overflow-wrap: anywhere;/);
});
