import assert from 'node:assert/strict';
import {
    createCustomLaunchTestState,
    createKnownLaunchFormState,
    isKnownLaunchEnabled,
    markCustomLaunchTested,
    recognizeKnownLaunchApp,
    setKnownLaunchDecision,
    updateCustomLaunchTestTarget
} from './my-apps-launch-form-state.js';

let state = createKnownLaunchFormState();
state = recognizeKnownLaunchApp(state, 'spotify');
assert.equal(isKnownLaunchEnabled(state), true, 'new Spotify recognition defaults ON');
state = setKnownLaunchDecision(state, false);
state = recognizeKnownLaunchApp(state, 'spotify');
assert.equal(isKnownLaunchEnabled(state), false, 'manual OFF survives same-app URL changes');
state = recognizeKnownLaunchApp(state, 'youtube');
assert.equal(isKnownLaunchEnabled(state), true, 'new YouTube recognition defaults ON');
state = setKnownLaunchDecision(state, false);
state = recognizeKnownLaunchApp(state, 'youtube');
assert.equal(isKnownLaunchEnabled(state), false, 'YouTube manual OFF is remembered');
state = recognizeKnownLaunchApp(state, null);
assert.equal(state.activeAppKey, null, 'unknown URL clears the active known app key');
assert.equal(isKnownLaunchEnabled(state), false);

const knownItem = { launchMode: 'known-app', appKey: 'spotify' };
assert.equal(isKnownLaunchEnabled(createKnownLaunchFormState(knownItem, 'spotify')), true);
const existingOffItem = { launchMode: 'https', appKey: null };
assert.equal(
    isKnownLaunchEnabled(createKnownLaunchFormState(existingOffItem, 'spotify')),
    false,
    'existing HTTPS item remains OFF even when its URL identifies a known app'
);

let tests = createCustomLaunchTestState();
tests = updateCustomLaunchTestTarget(tests, 'ios', 'https://example.com/app');
tests = markCustomLaunchTested(tests, 'ios');
assert.equal(tests.ios.testedHref, 'https://example.com/app');
tests = updateCustomLaunchTestTarget(tests, 'ios', 'https://example.com/changed');
assert.equal(tests.ios.testedHref, null, 'target changes clear the prior test-attempt state');

console.log('my-apps-launch-form-state: defaults, overrides, recognition changes, and test resets passed');
