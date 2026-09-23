import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const context = { SoundCruiseMultiAppSync: {} };
vm.runInNewContext(readFileSync(new URL('./settings-field-merge.js', import.meta.url), 'utf8'), context);
const merge = context.SoundCruiseMultiAppSync.mergeSettingsFields;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('settings use the shadow to accept one-sided and matching edits', () => {
  const result = merge(
    { localOnly: 2, remoteOnly: 1, shared: 2 },
    { localOnly: 1, remoteOnly: 3, shared: 2 },
    { localOnly: 1, remoteOnly: 1, shared: 1 }
  );
  assert.equal(result.unresolved, 0);
  assert.deepEqual(plain(result.values), { localOnly: 2, remoteOnly: 3, shared: 2 });
});

test('only genuinely different overlapping fields need a user selection', () => {
  const result = merge({ speed: 3, mode: true }, { speed: 2, mode: true }, null);
  assert.equal(result.unresolved, 1);
  assert.equal(result.conflicts[0].path, '/speed');
  assert.equal(result.values, null);
  assert.deepEqual(plain(merge({ speed: 3, mode: true }, { speed: 2, mode: true }, null,
    { '/speed': 'remote' }).values), { speed: 2, mode: true });
});

test('one-sided nested additions and unknown future fields are retained', () => {
  const result = merge(
    { enabled: { em: false, f: false }, futureLocal: { nested: true } },
    { enabled: { em: false, dm: false }, futureRemote: ['new'] },
    null
  );
  assert.equal(result.unresolved, 0);
  assert.deepEqual(plain(result.values), {
    enabled: { dm: false, em: false, f: false },
    futureLocal: { nested: true }, futureRemote: ['new']
  });
});

test('absence is not mistaken for a delete without an explicit deletion marker', () => {
  const result = merge({ known: 1 }, { added: 2 }, { oldFuture: 3 });
  assert.equal(result.unresolved, 0);
  assert.deepEqual(plain(result.values), { added: 2, known: 1, oldFuture: 3 });
});

test('the present side wins missing fields while simultaneous different changes remain unresolved', () => {
  const result = merge({ removedLocally: 2, same: 1 }, { removedRemotely: 3, same: 1 },
    { removedLocally: 2, removedRemotely: 3, same: 0 });
  assert.equal(result.unresolved, 0);
  assert.deepEqual(plain(result.values), { removedLocally: 2, removedRemotely: 3, same: 1 });
  const conflict = merge({ x: 2 }, { x: 3 }, { x: 1 });
  assert.equal(conflict.unresolved, 1);
});
