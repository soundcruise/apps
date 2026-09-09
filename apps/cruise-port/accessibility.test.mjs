import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const gate = readFileSync(new URL('../shared/pro-gate.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');

function fixture() {
    const listeners = new Map();
    const document = { activeElement: null, body: { children: [] },
        addEventListener: (key, fn) => listeners.set(key, fn),
        removeEventListener: key => listeners.delete(key) };
    function element(options = {}) {
        const attributes = new Set(options.inert ? ['inert'] : []);
        return { tabIndex: 0, ...options,
            hasAttribute: key => attributes.has(key),
            setAttribute: key => attributes.add(key),
            removeAttribute: key => attributes.delete(key),
            matches() { return !!this.disabled; },
            closest() { return this.hidden || attributes.has('inert'); },
            getClientRects() { return this.displayNone ? [] : [{}]; },
            focus() { document.activeElement = this; } };
    }
    const first = element(), last = element();
    const excluded = [element({ disabled: true }), element({ hidden: true }),
        element({ displayNone: true }), element({ visibility: 'hidden' }),
        element({ inert: true }), element({ tabIndex: -1 })];
    const overlay = element();
    overlay.querySelectorAll = () => [first, ...excluded, last];
    overlay.contains = value => [overlay, first, last, ...excluded].includes(value);
    const background = element(), alreadyInert = element({ inert: true });
    document.body.children = [overlay, background, alreadyInert];
    let observe, disconnected = false, frame;
    const context = vm.createContext({ document,
        getComputedStyle: el => ({ visibility: el.visibility || 'visible' }),
        MutationObserver: class { constructor(fn) { observe = fn; } observe() {} disconnect() { disconnected = true; } },
        requestAnimationFrame: fn => { frame = fn; return 1; }, cancelAnimationFrame() {} });
    vm.runInContext(gate.slice(gate.indexOf('    function containGateFocus'), gate.indexOf('    function dismissOverlay')), context);
    const release = context.containGateFocus(overlay);
    frame();
    function tab(shiftKey = false) {
        let prevented = false;
        listeners.get('keydown')({ key: 'Tab', shiftKey, preventDefault() { prevented = true; } });
        return prevented;
    }
    return { document, first, last, overlay, background, alreadyInert, element, tab,
        release, listeners, observe: () => observe(), disconnected: () => disconnected };
}

test('gate isolates only background, focuses input and restores original inert state', () => {
    const f = fixture();
    assert.equal(f.document.activeElement, f.first);
    assert.equal(f.overlay.hasAttribute('inert'), false);
    assert.equal(f.background.hasAttribute('inert'), true);
    const late = f.element(); f.document.body.children.push(late); f.observe();
    assert.equal(late.hasAttribute('inert'), true);
    f.release();
    assert.equal(f.background.hasAttribute('inert'), false);
    assert.equal(late.hasAttribute('inert'), false);
    assert.equal(f.alreadyInert.hasAttribute('inert'), true);
    assert.equal(f.listeners.size, 0);
    assert.equal(f.disconnected(), true);
});

test('gate wraps forward/backward, excludes unavailable controls and rejects escaped focus', () => {
    const f = fixture();
    assert.equal(f.tab(true), true);
    assert.equal(f.document.activeElement, f.last);
    assert.equal(f.tab(), true);
    assert.equal(f.document.activeElement, f.first);
    assert.equal(f.tab(), false);
    f.document.activeElement = f.background;
    f.listeners.get('focusin')({ target: f.background });
    assert.equal(f.document.activeElement, f.first);
    f.listeners.get('keydown')({ key: 'Escape', preventDefault() { assert.fail('Escape must not close gate'); } });
    assert.equal(f.background.hasAttribute('inert'), true);
});

test('gate preserves token/hash authentication and releases containment on successful unlock', () => {
    assert.match(gate, /SHARED_AUTH_KEY = 'soundCruiseProAuth'/);
    assert.match(gate, /EXPECTED_SHARED_V = 1/);
    assert.match(gate, /if \(isUnlocked\(\)\) \{\s*attachResetButton\(\);\s*return;/);
    assert.match(gate, /inputHash !== CONFIG.passwordHash/);
    assert.match(gate, /setSharedAuth\(\);\s*dismissOverlay\(overlay\)/);
    assert.match(gate, /function dismissOverlay\(overlay\) \{\s*releaseGateFocus\?\.\(\)/);
});

test('calendar uses named button groups, pressed selection and current date without an incomplete grid', () => {
    assert.match(html, /id="practice-calendar-days"[^>]*role="group"/);
    assert.match(html, /id="practice-calendar-view-tabs"[^>]*role="group"/);
    assert.doesNotMatch(html, /role="grid"/);
    for (const mode of ['month', 'week', 'day']) assert.match(html, new RegExp(`data-calendar-view="${mode}" aria-pressed=`));
    assert.match(app, /if \(today\) button.setAttribute\('aria-current', 'date'\)/);
    assert.match(app, /button.setAttribute\('aria-pressed', selected/);
    assert.match(app, /予定・メモ\$\{summary.notes.length\}件/);
    assert.match(app, /summary.practiced \? '、練習済み'/);
    assert.match(app, /button.tabIndex = 0/);
});

test('rendered date exposes practiced, memo count, selected and today independently', () => {
    const createElement = () => ({ attributes: {}, dataset: {}, children: [],
        classList: { toggle() {} }, setAttribute(key, value) { this.attributes[key] = value; },
        append(...children) { this.children.push(...children); } });
    const context = vm.createContext({ document: { createElement },
        state: { historySelectedDate: '2026-09-09' },
        toLocalDateKey: () => '2026-09-09', PRACTICE_CALENDAR_WEEKDAYS: ['日','月','火','水','木','金','土'],
        createPracticeCalendarIcon: () => createElement() });
    vm.runInContext(app.slice(app.indexOf('function createPracticeCalendarDayButton'), app.indexOf('function renderPracticeMonthCalendar')), context);
    const button = context.createPracticeCalendarDayButton({ localDate: '2026-09-09',
        practiced: true, completed: true, notes: [{}, {}], memoIcons: ['music'] }, new Date(2026, 8, 9, 12));
    assert.equal(button.attributes['aria-pressed'], 'true');
    assert.equal(button.attributes['aria-current'], 'date');
    assert.equal(button.attributes['aria-label'], '2026年9月9日、練習済み、予定・メモ2件、全メニュー完了');
    assert.equal(button.attributes['aria-selected'], undefined);
    assert.equal(button.type, 'button');
});
