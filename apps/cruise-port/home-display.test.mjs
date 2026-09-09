import assert from 'node:assert/strict';
import test from 'node:test';
import { applyHomeDisplaySize, applyHomeSectionOrder } from './home-display.js';

for (const displaySize of ['large', 'standard', 'small', 'xsmall']) {
    test(`home data attribute switches to ${displaySize}`, () => {
        const homeView = { dataset: {} };
        assert.equal(applyHomeDisplaySize(homeView, displaySize), displaySize);
        assert.equal(homeView.dataset.displaySize, displaySize);
    });
}

test('home data attribute safely falls back to standard', () => {
    const homeView = { dataset: {} };
    assert.equal(applyHomeDisplaySize(homeView, 'unknown'), 'standard');
    assert.equal(homeView.dataset.displaySize, 'standard');
});

test('section order moves existing DOM nodes rather than CSS order or cloned cards', () => {
    const nodes = Object.fromEntries(['cruiseApps','tools','myApps'].map(k=>[k,{key:k}]));
    const moved=[];
    applyHomeSectionOrder({querySelector:s=>nodes[s.match(/"(.*?)"/)[1]],append:n=>moved.push(n)},['myApps','tools','cruiseApps']);
    assert.deepEqual(moved,[nodes.myApps,nodes.tools,nodes.cruiseApps]);
});
