import assert from 'node:assert/strict';
import test from 'node:test';
import {
    navigatePreparedPracticeFileWindow,
    preparePracticeFileWindow
} from './practice-menu-file-open.js';

test('Safari-safe preparation opens a blank tab synchronously before asynchronous file retrieval', () => {
    const prepared = { opener: {}, location: { replace() {} } };
    const calls = [];
    const result = preparePracticeFileWindow({
        open(url, target) {
            calls.push([url, target]);
            return prepared;
        }
    });
    assert.equal(result, prepared);
    assert.deepEqual(calls, [['about:blank', '_blank']]);
});

test('retrieved PDF Blob URL replaces the already prepared tab and severs its opener', () => {
    let destination = '';
    const prepared = {
        opener: {},
        location: { replace(url) { destination = url; } }
    };
    assert.equal(navigatePreparedPracticeFileWindow(prepared, 'blob:https://soundcruise.jp/pdf'), true);
    assert.equal(destination, 'blob:https://soundcruise.jp/pdf');
    assert.equal(prepared.opener, null);
});

test('popup blocking and invalid or failed navigation return false for visible UI handling', () => {
    assert.equal(preparePracticeFileWindow({ open: () => null }), null);
    assert.equal(preparePracticeFileWindow({ open: () => { throw new Error('blocked'); } }), null);
    assert.equal(navigatePreparedPracticeFileWindow(null, 'blob:https://soundcruise.jp/pdf'), false);
    assert.equal(navigatePreparedPracticeFileWindow({ location: { replace() { throw new Error('failed'); } } }, 'blob:https://soundcruise.jp/pdf'), false);
    assert.equal(navigatePreparedPracticeFileWindow({ location: { replace() {} } }, 'https://example.com/file.pdf'), false);
});
