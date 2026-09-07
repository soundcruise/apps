import assert from 'node:assert/strict';
import test from 'node:test';
import { applyHomeIconScalePreview } from './home-icon-scale-preview.js';

for (const value of ['100', '90', '80', '70']) {
    test(`home data attribute switches to ${value} percent icon scale`, () => {
        const homeView = { dataset: {} };
        assert.equal(applyHomeIconScalePreview(homeView, value), value);
        assert.equal(homeView.dataset.iconScalePreview, value);
    });
}

test('invalid home icon scale safely falls back to 100 percent', () => {
    const homeView = { dataset: {} };
    assert.equal(applyHomeIconScalePreview(homeView, '55'), '100');
    assert.equal(homeView.dataset.iconScalePreview, '100');
});
