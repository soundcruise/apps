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

function presentation(id, name = id, options = {}) {
  return {
    id, state: 'attention', selection: options.selection || null,
    presentation: {
      title: options.title || 'カスタムプリセット', name,
      fields: options.fields || [{ label: 'BPM', local: '79', remote: '81' }]
    }
  };
}

function viewFixture() {
  const events = [];
  return {
    events,
    view: {
      show(items, selections) { events.push(['show', items.map((item) => item.id), Object.fromEntries(selections)]); },
      setBusy(value, choice) { events.push(['busy', value, choice || null]); },
      showProgress(applied, total) { events.push(['progress', applied, total]); },
      showError(message) { events.push(['error', message]); },
      close() { events.push(['close']); }
    }
  };
}

test('one or many conflicts are shown together before any resolution starts', async () => {
  for (const ids of [['c1'], ['c1', 'c2', 'c3', 'c4']]) {
    const api = load();
    const fixture = viewFixture();
    const runtime = {
      listConflictPresentations: async () => ids.map((id) => presentation(id)),
      resolveConflict: async () => { throw new Error('must_not_resolve_during_refresh'); }
    };
    const controller = api.createConflictResolutionController(runtime, fixture.view);
    assert.deepEqual({ ...await controller.refresh() }, { ok: true, count: ids.length });
    assert.deepEqual(fixture.events.find((event) => event[0] === 'show')[1], ids);
    assert.equal(controller.count, ids.length);
  }
});

test('bulk Local selection supports one Remote override and applies the final plan in order', async () => {
  const api = load();
  const fixture = viewFixture();
  let items = ['c1', 'c2', 'c3', 'c4'].map((id) => presentation(id));
  const calls = [];
  const runtime = {
    listConflictPresentations: async () => items,
    resolveConflict: async (id, choice) => {
      calls.push([id, choice]);
      items = items.filter((item) => item.id !== id);
      return { ok: true, remaining: items.length };
    }
  };
  const controller = api.createConflictResolutionController(runtime, fixture.view);
  await controller.refresh();
  assert.deepEqual({ ...controller.selectAll('local') }, { ok: true, selected: 4, total: 4 });
  assert.deepEqual({ ...controller.select('c3', 'remote') }, { ok: true, selected: 4, total: 4 });
  assert.deepEqual({ ...await controller.apply() }, { ok: true, applied: 4, remaining: 0 });
  assert.deepEqual(calls, [['c1', 'local'], ['c2', 'local'], ['c3', 'remote'], ['c4', 'local']]);
  assert(fixture.events.some((event) => event[0] === 'close'));
});

test('bulk Cloud selection applies Remote for every conflict only after final apply', async () => {
  const api = load();
  const fixture = viewFixture();
  let items = [presentation('c1'), presentation('c2')];
  const calls = [];
  const runtime = {
    listConflictPresentations: async () => items,
    resolveConflict: async (id, choice) => {
      calls.push([id, choice]);
      items = items.filter((item) => item.id !== id);
      return { ok: true, remaining: items.length };
    }
  };
  const controller = api.createConflictResolutionController(runtime, fixture.view);
  await controller.refresh();
  controller.selectAll('remote');
  assert.deepEqual(calls, [], 'selection alone never mutates data');
  await controller.apply();
  assert.deepEqual(calls, [['c1', 'remote'], ['c2', 'remote']]);
});

test('final apply fails closed while any item is unresolved', async () => {
  const api = load();
  const fixture = viewFixture();
  const calls = [];
  const runtime = {
    listConflictPresentations: async () => [presentation('c1'), presentation('c2')],
    resolveConflict: async (...args) => { calls.push(args); return { ok: true }; }
  };
  const controller = api.createConflictResolutionController(runtime, fixture.view);
  await controller.refresh();
  controller.select('c1', 'local');
  const result = await controller.apply();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'resolution_selection_incomplete');
  assert.equal(result.unresolved, 1);
  assert.deepEqual(calls, []);
  assert.match(fixture.events.findLast((event) => event[0] === 'error')[1], /未選択の項目が1件/);
});

test('partial failure stops safely and keeps selections for every unapplied item', async () => {
  const api = load();
  const fixture = viewFixture();
  let items = [presentation('c1'), presentation('c2'), presentation('c3')];
  const calls = [];
  const runtime = {
    listConflictPresentations: async () => items,
    resolveConflict: async (id, choice) => {
      calls.push([id, choice]);
      if (id === 'c2') return { ok: false, code: 'stale_resolution' };
      items = items.filter((item) => item.id !== id);
      return { ok: true, remaining: items.length };
    }
  };
  const controller = api.createConflictResolutionController(runtime, fixture.view);
  await controller.refresh();
  controller.selectAll('local');
  const result = await controller.apply();
  assert.equal(result.ok, false);
  assert.equal(result.applied, 1);
  assert.equal(result.pending, 2);
  assert.deepEqual(calls, [['c1', 'local'], ['c2', 'local']]);
  const lastShow = fixture.events.filter((event) => event[0] === 'show').at(-1);
  assert.deepEqual(lastShow[1], ['c2', 'c3']);
  assert.deepEqual(lastShow[2], { c2: 'local', c3: 'local' });
  assert.match(fixture.events.findLast((event) => event[0] === 'error')[1], /1件を反映しました。残りは反映せず停止/);
});

test('persisted runtime choice is restored into the selection list after reload', async () => {
  const api = load();
  const fixture = viewFixture();
  const runtime = {
    listConflictPresentations: async () => [presentation('c1', 'saved', { selection: 'remote' })],
    resolveConflict: async () => ({ ok: true })
  };
  const controller = api.createConflictResolutionController(runtime, fixture.view);
  await controller.refresh();
  assert.equal(controller.selectedCount, 1);
  assert.deepEqual(fixture.events.find((event) => event[0] === 'show')[2], { c1: 'remote' });
});

test('Later defers every listed conflict without changing either data choice', async () => {
  const api = load();
  const fixture = viewFixture();
  const calls = [];
  const runtime = {
    listConflictPresentations: async () => [presentation('c1'), presentation('c2')],
    resolveConflict: async (id, choice) => { calls.push([id, choice]); return { ok: true, deferred: true }; }
  };
  const controller = api.createConflictResolutionController(runtime, fixture.view);
  await controller.refresh();
  const result = await controller.later();
  assert.equal(result.deferred, true);
  assert.deepEqual(calls, [['c1', 'later'], ['c2', 'later']]);
  assert(fixture.events.some((event) => event[0] === 'close'));
});

test('tombstone presentation stays visible as a plain-language saved/deleted comparison', async () => {
  const api = load();
  const fixture = viewFixture();
  const tombstone = presentation('deleted', 'ウォーミングアップ', {
    title: '練習メニュー',
    fields: [{ label: '状態', local: '削除済み', remote: '保存済み' }]
  });
  const runtime = {
    listConflictPresentations: async () => [tombstone],
    resolveConflict: async () => ({ ok: true })
  };
  const controller = api.createConflictResolutionController(runtime, fixture.view);
  await controller.refresh();
  const shown = fixture.events.find((event) => event[0] === 'show');
  assert.equal(shown[1][0], 'deleted');
  assert.deepEqual(tombstone.presentation.fields[0], { label: '状態', local: '削除済み', remote: '保存済み' });
});

test('DOM copy uses one list, bulk choices, individual overrides, final apply and quiet Later', () => {
  for (const label of [
    '変更内容を確認してください', 'この端末とクラウドの両方に新しい変更があります。',
    'この端末の内容をすべて選ぶ', 'クラウドの内容をすべて選ぶ',
    '残す内容', 'この内容で反映', 'あとで決める'
  ]) assert.match(source, new RegExp(label));
  assert.match(source, /sound-cruise-sync-conflict-list/);
  assert.match(source, /type = 'radio'/);
  assert.match(source, /textContent/);
  assert.doesNotMatch(source, /1件ずつ確認|この環境のデータを使う|あとで確認/);
  assert.doesNotMatch(source, /innerHTML|JSON\.stringify|payloadHash|operationId|credential|recovery|token/i);
});
