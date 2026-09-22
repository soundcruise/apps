import assert from 'node:assert/strict';
import test from 'node:test';
import { openSyncCenter, restoreInitialSyncCenterRoute, returnToSyncCenterSource } from './sync-center-navigation.js';

function historyFixture(state = null) {
    return {
        state, calls: [],
        replaceState(next, title, url) { this.state = next; this.calls.push(['replace', url]); },
        pushState(next, title, url) { this.state = next; this.calls.push(['push', url]); },
        back() { this.calls.push(['back']); }
    };
}

const locationObject = { pathname: '/apps/cruise-port/', search: '?qa=1' };

test('feature-on deep link survives startup normalization while feature-off stays hidden', () => {
    const enabled = historyFixture();
    assert.equal(restoreInitialSyncCenterRoute({ enabled: true, requested: true, historyObject: enabled, locationObject }), true);
    assert.deepEqual(enabled.calls, [['replace', '/apps/cruise-port/?qa=1#sync-center']]);
    const disabled = historyFixture();
    assert.equal(restoreInitialSyncCenterRoute({ enabled: false, requested: true, historyObject: disabled, locationObject }), false);
    assert.deepEqual(disabled.calls, []);
});

test('settings entry pushes once and TOP returns to home', () => {
    const history = historyFixture({ existing: true });
    openSyncCenter(history);
    assert.deepEqual(history.calls, [['push', '#sync-center']]);
    assert.equal(returnToSyncCenterSource({ historyObject: history, locationObject }), 'replace');
    assert.deepEqual(history.calls, [['push', '#sync-center'], ['replace', '/apps/cruise-port/?qa=1']]);
});

test('direct deep link TOP returns to home with replace', () => {
    const history = historyFixture({ cruisePortSyncCenterSource: 'direct' });
    assert.equal(returnToSyncCenterSource({ historyObject: history, locationObject }), 'replace');
    assert.deepEqual(history.calls, [['replace', '/apps/cruise-port/?qa=1']]);
});
