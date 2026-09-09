import test from 'node:test';
import assert from 'node:assert/strict';
import { createPracticeCalendarKeyboard } from './practice-calendar-keyboard.js';

function harness({ viewportAvailable = true, height = 480 } = {}) {
    const viewport = Object.assign(new EventTarget(), { height, offsetTop: 0, scale: 1 });
    const tasks = new Map();
    let nextId = 0;
    let now = 0;
    const focus = {};
    const scrolls = [];
    const windowObject = Object.assign(new EventTarget(), {
        visualViewport: viewportAvailable ? viewport : null,
        innerHeight: 844,
        document: { activeElement: focus },
        performance: { now: () => now },
        setTimeout(callback, delay) { const id = ++nextId; tasks.set(id, { callback, at: now + delay }); return id; },
        clearTimeout(id) { tasks.delete(id); },
        requestAnimationFrame(callback) { return this.setTimeout(callback, 16); },
        cancelAnimationFrame(id) { tasks.delete(id); },
        scrollBy(value) {
            scrolls.push(value);
            viewport.dispatchEvent(new Event('scroll'));
            viewport.height -= 10;
            viewport.dispatchEvent(new Event('resize'));
        }
    });
    const form = { hidden: false, contains: candidate => candidate === windowObject.document.activeElement };
    const bounds = { top: 460, bottom: 760 };
    const controller = createPracticeCalendarKeyboard({ windowObject, form, getInputBounds: () => bounds });
    function advance(ms) {
        const end = now + ms;
        let guard = 0;
        while (tasks.size && ++guard < 100) {
            const [id, task] = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
            if (task.at > end) break;
            now = task.at;
            tasks.delete(id);
            task.callback();
        }
        assert.ok(guard < 100, 'bounded scheduling');
        now = end;
    }
    return { controller, windowObject, viewport, focus, bounds, form, tasks, scrolls, advance };
}

test('keyboard settles then corrects once, ignoring own viewport feedback and subsequent manual scroll', () => {
    const h = harness();
    h.controller.start(h.focus);
    h.advance(80);
    h.viewport.height = 430;
    h.viewport.dispatchEvent(new Event('resize'));
    h.advance(210);
    assert.equal(h.scrolls.length, 1);
    assert.equal(h.scrolls[0].top, 436);
    for (let i = 0; i < 10; i++) {
        h.viewport.height -= 9;
        h.viewport.dispatchEvent(new Event('resize'));
        h.viewport.dispatchEvent(new Event('scroll'));
    }
    h.controller.start(h.focus);
    h.advance(2000);
    assert.equal(h.scrolls.length, 1);
    assert.equal(h.tasks.size, 0);
});

test('manual touch/wheel/pointer interaction before correction cancels it', () => {
    for (const type of ['touchmove', 'wheel', 'pointerdown']) {
        const h = harness();
        h.controller.start(h.focus);
        h.windowObject.dispatchEvent(new Event(type));
        h.advance(2000);
        assert.equal(h.scrolls.length, 0);
    }
});

test('add/edit refocus starts a fresh bounded session; route cleanup cancels pending work', () => {
    const h = harness();
    h.controller.start(h.focus);
    h.advance(250);
    h.controller.stop();
    h.controller.start(h.focus);
    h.advance(250);
    assert.equal(h.scrolls.length, 2);
    h.controller.stop();
    h.controller.start({});
    h.controller.stop();
    h.advance(2000);
    assert.equal(h.scrolls.length, 2);
    assert.equal(h.tasks.size, 0);
});

test('visible input, closed keyboard, zoom, hidden form, desktop, and absent API do not jump', () => {
    for (const mode of ['visible', 'closed', 'zoom', 'hidden', 'absent']) {
        const h = harness({ viewportAvailable: mode !== 'absent' });
        if (mode === 'visible') Object.assign(h.bounds, { top: 30, bottom: 330 });
        if (mode === 'closed') h.viewport.height = 844;
        if (mode === 'zoom') h.viewport.scale = 2;
        if (mode === 'hidden') h.form.hidden = true;
        h.controller.start(h.focus);
        h.advance(1500);
        assert.equal(h.scrolls.length, 0, mode);
    }
});

test('continuous keyboard resize has a finite deadline and at most one correction', () => {
    const h = harness();
    h.controller.start(h.focus);
    for (let i = 0; i < 25; i++) {
        h.viewport.height += i % 2 ? 10 : -10;
        h.viewport.dispatchEvent(new Event('resize'));
        h.advance(80);
    }
    assert.equal(h.scrolls.length, 0);
    assert.equal(h.tasks.size, 0);
});

test('measured iPhone coordinates do not double count offsetTop', () => {
    const h = harness({ height: 376 });
    h.windowObject.innerHeight = 754;
    h.windowObject.scrollY = 831;
    Object.assign(h.viewport, { pageTop: 831, offsetTop: 378 });
    Object.assign(h.bounds, { top: -50.890625, bottom: 253.671875 });
    h.controller.start(h.focus);
    h.advance(250);
    assert.equal(h.scrolls.length, 1);
    assert.equal(h.scrolls[0].top, -74.890625);
});

test('layout-relative viewport coordinates retain their offset', () => {
    const h = harness();
    h.windowObject.scrollY = 100;
    Object.assign(h.viewport, { pageTop: 200, offsetTop: 100 });
    h.controller.start(h.focus);
    h.advance(250);
    assert.equal(h.scrolls[0].top, 336);
});

test('offset-only and native scroll changes postpone settlement without event loops', () => {
    const h = harness();
    h.controller.start(h.focus);
    h.advance(160);
    h.viewport.offsetTop = 80;
    h.advance(160);
    assert.equal(h.scrolls.length, 0);
    h.windowObject.scrollY = 50;
    h.advance(160);
    assert.equal(h.scrolls.length, 0);
    h.advance(60);
    assert.equal(h.scrolls.length, 1);
    assert.equal(h.tasks.size, 0);
});
