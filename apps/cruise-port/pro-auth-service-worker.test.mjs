import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const pitch = readFileSync(new URL('../pitch-cruise/pro_x9v7q2m8/service-worker.js', import.meta.url), 'utf8');
const fretboard = readFileSync(new URL('../fretboard_cruise/pro_a9f4k7q2m8z/service-worker.js', import.meta.url), 'utf8');
const rhythm = readFileSync(new URL('../rhythm-cruise/service-worker.js', import.meta.url), 'utf8');
const gate = readFileSync(new URL('../shared/pro-gate.js', import.meta.url), 'utf8');

async function activate(source, names) {
  const handlers = new Map(), deleted = [], messages = [];
  const context = { self: { addEventListener(type, fn) { handlers.set(type, fn); }, skipWaiting() {},
    clients: { claim() {}, async matchAll() { return [{ postMessage(value) { messages.push(value); } }]; } } },
  caches: { async keys() { return names; }, async delete(name) { deleted.push(name); return true; } },
  fetch: async () => ({}), Promise };
  vm.runInNewContext(source, context);
  let job;
  handlers.get('activate')({ waitUntil(promise) { job = promise; } });
  await job;
  return { deleted, messages, handlers, context };
}

test('new Pitch and Fretboard workers purge only own old caches without version invalidation', async () => {
  const names = ['pitch-trainer-pro-scope-v24-apps-pitch-cruise', 'fretboard-cruise-pro-v2.3.9',
    'rhythm-cruise-v11', 'unrelated-cache'];
  const p = await activate(pitch, names);
  const f = await activate(fretboard, names);
  assert.deepEqual(p.deleted, [names[0]]);
  assert.deepEqual(f.deleted, [names[1]]);
  assert.deepEqual(p.messages, []);
  assert.deepEqual(f.messages, []);
  assert.doesNotMatch(gate, /PRO_GATE_INVALIDATE/);
});

test('new Rhythm worker does not serve old cached Pro HTML or gate JS during outage', async () => {
  const handlers = new Map();
  let cacheReads = 0;
  vm.runInNewContext(rhythm, { self: { addEventListener(type, fn) { handlers.set(type, fn); }, skipWaiting() {}, clients: { claim() {} } },
    caches: { match() { cacheReads += 1; return Promise.resolve('old-cache'); } },
    fetch() { return Promise.reject(Error('offline')); }, URL, Promise });
  for (const url of ['https://soundcruise.jp/apps/rhythm-cruise/pro_r4m8k7n2q9x/index.html',
    'https://soundcruise.jp/apps/shared/pro-gate.js?v=23']) {
    let response;
    handlers.get('fetch')({ request: { url }, respondWith(promise) { response = promise; } });
    await assert.rejects(response, /offline/);
  }
  assert.equal(cacheReads, 0);
  let response;
  handlers.get('fetch')({ request: { url: 'https://soundcruise.jp/apps/rhythm-cruise/standard/index.html' },
    respondWith(promise) { response = promise; } });
  assert.equal(await response, 'old-cache');
  assert.equal(cacheReads, 1);
});
