import assert from 'node:assert/strict';
import test from 'node:test';
import { getMyAppHomeIconKind } from './my-apps-icon-scale-classifier.js';

test('known Cruise Port preset uses the formal Simple icon scale', () => {
    assert.equal(getMyAppHomeIconKind({ iconPresetKey: 'tuner' }), 'preset');
});

test('generic and unknown icons use the formal Simple icon scale', () => {
    assert.equal(getMyAppHomeIconKind(), 'generic');
    assert.equal(getMyAppHomeIconKind({ iconPresetKey: 'unknown' }), 'generic');
});

test('custom uploaded images remain outside the formal Simple icon scale', () => {
    assert.equal(getMyAppHomeIconKind({ iconId: 'uploaded-icon', iconPresetKey: 'tuner' }), 'custom');
});
