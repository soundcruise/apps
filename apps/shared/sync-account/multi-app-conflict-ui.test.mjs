import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./multi-app-conflict-ui.js', import.meta.url), 'utf8');

function load() {
  const context = { SoundCruiseMultiAppSync: {} };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.SoundCruiseMultiAppSync;
}

function presentation(id, name = id) {
  return {
    id, state: 'attention',
    presentation: { title: 'カスタムプリセット', name, fields: [{ label: 'BPM', local: '79', remote: '81' }] }
  };
}

function viewFixture() {
  const events = [];
  return {
    events,
    view: {
      show(item, count) { events.push(['show', item.id, count]); },
      setBusy(value, choice) { events.push(['busy', value, choice || null]); },
      showError(message) { events.push(['error', message]); },
      close() { events.push(['close']); }
    }
  };
}

test('Local and Remote choices expose loading and close only after verified resolution', async () => {
  for (const choice of ['local', 'remote']) {
    const api = load();
    const fixture = viewFixture();
    let items = [presentation('c1')];
    const calls = [];
    const runtime = {
      listConflictPresentations: async () => items,
      resolveConflict: async (id, selected) => { calls.push([id, selected]); items = []; return { ok: true, remaining: 0 }; }
    };
    const controller = api.createConflictResolutionController(runtime, fixture.view);
    assert.deepEqual({ ...await controller.refresh() }, { ok: true, count: 1 });
    assert.deepEqual({ ...await controller.choose(choice) }, { ok: true, count: 0 });
    assert.deepEqual(calls, [['c1', choice]]);
    assert(fixture.events.some((event) => event[0] === 'busy' && event[1] === true && event[2] === choice));
    assert.deepEqual(fixture.events.at(-2), ['close']);
    assert.deepEqual(fixture.events.at(-1), ['busy', false, null]);
  }
});

test('Later closes the UI while leaving the unresolved choice to the runtime', async () => {
  const api = load();
  const fixture = viewFixture();
  const calls = [];
  const runtime = {
    listConflictPresentations: async () => [presentation('c1')],
    resolveConflict: async (id, choice) => { calls.push([id, choice]); return { ok: true, deferred: true, remaining: 1 }; }
  };
  const controller = api.createConflictResolutionController(runtime, fixture.view);
  await controller.refresh();
  const result = await controller.choose('later');
  assert.equal(result.deferred, true);
  assert.deepEqual(calls, [['c1', 'later']]);
  assert(fixture.events.some((event) => event[0] === 'close'));
});

test('failure keeps the UI open, shows a non-secret message and permits retry', async () => {
  const api = load();
  const fixture = viewFixture();
  let attempts = 0;
  let items = [presentation('c1')];
  const runtime = {
    listConflictPresentations: async () => items,
    resolveConflict: async () => {
      attempts += 1;
      if (attempts === 1) return { ok: false, code: 'stale_resolution' };
      items = [];
      return { ok: true, remaining: 0 };
    }
  };
  const controller = api.createConflictResolutionController(runtime, fixture.view);
  await controller.refresh();
  assert.equal((await controller.choose('local')).ok, false);
  const error = fixture.events.find((event) => event[0] === 'error');
  assert.match(error[1], /クラウド側の内容が変わりました/);
  assert.doesNotMatch(error[1], /hash|operation|credential|token|JSON/i);
  assert.equal((await controller.choose('local')).ok, true);
  assert.equal(attempts, 2);
});

test('multiple conflicts are presented and resolved one at a time', async () => {
  const api = load();
  const fixture = viewFixture();
  let items = [presentation('c1'), presentation('c2')];
  const runtime = {
    listConflictPresentations: async () => items,
    resolveConflict: async (id) => { items = items.filter((item) => item.id !== id); return { ok: true, remaining: items.length }; }
  };
  const controller = api.createConflictResolutionController(runtime, fixture.view);
  await controller.refresh();
  await controller.choose('remote');
  assert.deepEqual(fixture.events.filter((event) => event[0] === 'show'), [
    ['show', 'c1', 2], ['show', 'c2', 1]
  ]);
  assert.equal(controller.activeId, 'c2');
});

test('DOM UI uses safe text nodes and the three explicit product choices', () => {
  assert.match(source, /同期内容の確認が必要です/);
  assert.match(source, /この環境のデータを使う/);
  assert.match(source, /クラウドのデータを使う/);
  assert.match(source, /あとで確認/);
  assert.match(source, /textContent/);
  assert.doesNotMatch(source, /innerHTML|JSON\.stringify|payloadHash|operationId|credential|recovery|token/i);
});
