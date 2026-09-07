import assert from 'node:assert/strict';
import test from 'node:test';
import { applyHomeIconScalePreviews } from './home-icon-scale-preview.js';

test('home data attributes switch the two icon groups independently', () => {
    const homeView = { dataset: {} };
    assert.deepEqual(
        applyHomeIconScalePreviews(homeView, { cruise: '80', simple: '60' }),
        { cruise: '80', simple: '60' }
    );
    assert.deepEqual(homeView.dataset, { cruiseIconScalePreview: '80', simpleIconScalePreview: '60' });
});

test('invalid group values safely fall back to 100 percent', () => {
    const homeView = { dataset: {} };
    assert.deepEqual(
        applyHomeIconScalePreviews(homeView, { cruise: '55', simple: 'invalid' }),
        { cruise: '100', simple: '100' }
    );
});
