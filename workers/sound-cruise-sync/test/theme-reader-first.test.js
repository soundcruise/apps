import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRecordPayload, recordSchemaVersion } from '../src/record-schema-registry.js';

const settings = (values) => ({ id: 'settings', values });
const base = {
  pitch: { notationStyle: 'doremi' },
  rhythm: { tapLayout: 'ud' },
  fretboard: { tempo: 90 }
};

test('settings records accept an optional color theme for Pitch, Rhythm and Fretboard (reader-first)', () => {
  for (const appId of ['pitch', 'rhythm', 'fretboard']) {
    assert.equal(validateRecordPayload(appId, 'settings', 'settings', settings(base[appId])), true, `${appId}: old payload without theme`);
    for (const theme of ['dark', 'charcoal', 'gray', 'light']) {
      assert.equal(validateRecordPayload(appId, 'settings', 'settings', settings({ ...base[appId], theme })), true, `${appId}: ${theme}`);
    }
    for (const theme of ['sepia', 'Dark', '', null, 1, true, ['light'], { light: true }]) {
      assert.equal(validateRecordPayload(appId, 'settings', 'settings', settings({ ...base[appId], theme })), false, `${appId}: rejects ${JSON.stringify(theme)}`);
    }
    assert.equal(validateRecordPayload(appId, 'settings', 'settings', settings({ ...base[appId], themeColor: 'light' })), false, `${appId}: other unknown keys stay rejected`);
  }
});

test('Fretboard settings still require at least one value; theme alone is a valid value', () => {
  assert.equal(validateRecordPayload('fretboard', 'settings', 'settings', settings({})), false);
  assert.equal(validateRecordPayload('fretboard', 'settings', 'settings', settings({ theme: 'gray' })), true);
});

test('schema versions and record types are unchanged by the theme field', () => {
  for (const appId of ['pitch', 'rhythm', 'fretboard', 'chord', 'port']) assert.equal(recordSchemaVersion(appId), 1, appId);
});
