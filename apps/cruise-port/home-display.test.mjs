import assert from 'node:assert/strict';
import test from 'node:test';
import { applyHomeDisplaySize } from './home-display.js';

for (const displaySize of ['large', 'standard', 'small', 'xsmall']) {
    test(`home data attribute switches to ${displaySize}`, () => {
        const homeView = { dataset: {} };
        assert.equal(applyHomeDisplaySize(homeView, displaySize), displaySize);
        assert.equal(homeView.dataset.displaySize, displaySize);
    });
}

test('home data attribute safely falls back to large', () => {
    const homeView = { dataset: {} };
    assert.equal(applyHomeDisplaySize(homeView, 'unknown'), 'large');
    assert.equal(homeView.dataset.displaySize, 'large');
});
