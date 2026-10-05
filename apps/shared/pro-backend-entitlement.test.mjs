import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { PortAssetSync } from '../cruise-port/port-asset-sync.js';

const token = `scp1.123e4567-e89b-42d3-a456-426614174000.${'A'.repeat(43)}`;
const nextToken = token.replace(/A$/, 'B');
const device = `scd1.123e4567-e89b-42d3-a456-426614174001.${'C'.repeat(43)}`;
const auth = credential => JSON.stringify({ v: 2, credential, generation: 1, validatedAt: 100 });
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
function context(initial = {}) {
  const values = new Map(Object.entries(initial));
  const localStorage = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key),
    key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
  class CustomEventPolyfill extends Event { constructor(type, options) { super(type); this.detail = options?.detail; } }
  const ctx = vm.createContext({ localStorage, crypto: webcrypto, Headers, Response, URL,
    TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout, EventTarget,
    CustomEvent: CustomEventPolyfill, structuredClone });
  ctx.window = ctx;
  vm.runInContext(read('./pro-backend-entitlement.js'), ctx);
  return { ctx, values, localStorage, api: ctx.SoundCruiseProBackendEntitlement };
}

test('only existing v2 credentials are forwarded, never edition flags or legacy markers', async () => {
  for (const value of [null, '{bad', JSON.stringify({ v: 1, edition: 'pro' }),
    auth('invalid'), JSON.stringify({ v: 2, credential: token, generation: 0 })]) {
    const f = context({ soundCruiseProAuth: value, soundcruise_pro_gate_rotation: 'legacy', edition: 'pro' });
    assert.deepEqual(Object.keys(await f.api.proAuthorizationHeaders()), []);
  }
  const f = context({ soundCruiseProAuth: auth(token) });
  assert.equal((await f.api.proAuthorizationHeaders())['X-Sound-Cruise-Pro-Authorization'], `Bearer ${token}`);
  f.values.set('soundCruiseProAuth', auth(nextToken));
  assert.equal((await f.api.proAuthorizationHeaders())['X-Sound-Cruise-Pro-Authorization'], `Bearer ${nextToken}`);
});

test('legacy backend access waits for the existing Pro gate to issue a real credential', async () => {
  const f = context({ soundCruiseProAuth: JSON.stringify({ v: 1 }), savedUserData: 'kept' });
  let prompts = 0;
  f.ctx.__soundCruiseRequireProBackendAuth = async () => {
    prompts++; f.values.set('soundCruiseProAuth', auth(token));
  };
  assert.equal((await f.api.proAuthorizationHeaders())['X-Sound-Cruise-Pro-Authorization'], `Bearer ${token}`);
  assert.equal(prompts, 1);
  assert.equal(f.values.get('savedUserData'), 'kept');
});

test('paid requests first silently validate the browser session; expired offline grants stop before data transfer', async () => {
  const f = context({ soundCruiseProAuth: auth(token), userData: 'kept' });
  let checked = 0;
  f.ctx.__soundCruiseEnsureProSession = async () => { checked++; return true; };
  assert.equal((await f.api.proAuthorizationHeaders())['X-Sound-Cruise-Pro-Authorization'], `Bearer ${token}`);
  assert.equal(checked, 1);
  f.ctx.__soundCruiseEnsureProSession = async () => false;
  await assert.rejects(f.api.proAuthorizationHeaders(), { code: 'pro_revalidation_required' });
  assert.equal(f.values.get('userData'), 'kept');
  assert.equal(JSON.parse(f.values.get('soundCruiseProAuth')).credential, token);
});

test('only authoritative Pro denials request reauthentication; outages and Account errors do not', () => {
  const f = context(); const invalidated = [];
  f.ctx.__soundCruiseRejectProBackendAuth = credential => invalidated.push(credential);
  const headers = new Headers({ 'X-Sound-Cruise-Pro-Authorization': `Bearer ${token}` });
  for (const code of ['network_error', 'pro_auth_unavailable', 'invalid_credential']) f.api.rejectProAuthorization(code, headers);
  assert.equal(invalidated.length, 0);
  f.api.rejectProAuthorization('pro_required', headers);
  f.api.rejectProAuthorization('pro_reauth_required', Object.fromEntries(headers));
  // Browser Headers is case-insensitive; the normal object API uses its emitted key.
  f.api.rejectProAuthorization('pro_reauth_required', { 'X-Sound-Cruise-Pro-Authorization': `Bearer ${token}` });
  assert.equal(invalidated[0], token);
  assert.equal(invalidated.at(-1), token);
});

for (const appId of ['pitch', 'fretboard', 'rhythm', 'port']) {
  test(`${appId}: runtime forwards both credentials and preserves outbox/conflicts on Pro denial`, async () => {
    const f = context({ soundCruiseProAuth: auth(token) });
    vm.runInContext(read('./sync-account/multi-app-sync-runtime.js'), f.ctx);
    const meta = new Map([['credential', device], ['pending', 'kept']]);
    const outbox = [{ operationId: 'pending' }], conflicts = [{ id: 'unresolved' }];
    let resets = 0; const requests = []; const denials = [];
    f.ctx.__soundCruiseRejectProBackendAuth = credential => denials.push(credential);
    const runtime = new f.ctx.SoundCruiseMultiAppSync.MultiAppSyncRuntime({
      appId, endpoint: 'https://sync.example', admissionMode: 'production', adapter: {},
      store: { readMeta: async key => meta.get(key), clearCloudState: async () => { resets++; } },
      accountClient: {}, accountCore: { validAppCredential: value => value === device },
      fetchImpl: async (_url, options) => {
        requests.push(options.headers);
        return Response.json({ ok: false, code: 'pro_reauth_required' }, { status: 403 });
      }
    });
    await assert.rejects(runtime.request('GET', `/v1/sync/snapshot?appId=${appId}`), { code: 'pro_reauth_required' });
    assert.equal(requests[0].get('Authorization'), `Bearer ${device}`);
    assert.equal(requests[0].get('X-Sound-Cruise-Pro-Authorization'), `Bearer ${token}`);
    assert.deepEqual(denials, [token]); assert.equal(resets, 0);
    assert.equal(meta.get('credential'), device);
    assert.equal(outbox.length, 1); assert.equal(conflicts.length, 1);
  });
}

test('Chord custom runtime forwards Pro on initial sync and snapshot without dropping its identity', async () => {
  const f = context({ soundCruiseProAuth: auth(token) });
  vm.runInContext(read('../chord-cruise/js/sync/sync-core.js'), f.ctx);
  vm.runInContext(read('../chord-cruise/js/sync/sync-merge.js'), f.ctx);
  const meta = new Map([['deviceCredential', { credential: device }]]);
  f.ctx.ChordCruiseSync.database = { open: async () => ({ getMeta: async key => meta.get(key) }) };
  vm.runInContext(read('../chord-cruise/js/sync/sync-client.js'), f.ctx);
  const requests = []; const denials = [];
  f.ctx.__soundCruiseRejectProBackendAuth = credential => denials.push(credential);
  const client = f.ctx.ChordCruiseSync.client.createClient({ enabled: true, localStorage: f.localStorage,
    endpoint: 'https://sync.example', fetch: async (url, options) => {
      requests.push({ url, headers: new Headers(options.headers) });
      return Response.json({ ok: false, code: 'pro_required' }, { status: 403 });
    } });
  const started = await client.startIdentity({ turnstileToken: 'isolated' });
  assert.equal(started.code, 'pro_required');
  const snapshot = await client.getServerSnapshot();
  assert.equal(snapshot.code, 'pro_required');
  assert.equal(requests.length, 2);
  for (const request of requests) assert.equal(request.headers.get('X-Sound-Cruise-Pro-Authorization'), `Bearer ${token}`);
  assert.equal(requests[1].headers.get('Authorization'), `Bearer ${device}`);
  assert.equal(meta.get('deviceCredential').credential, device);
  assert.deepEqual(denials, [token, token]);
});

test('Port binary transfer forwards live Pro and device credentials and keeps data on denial', async () => {
  const f = context({ soundCruiseProAuth: auth(token), savedUserData: 'kept' });
  const previous = globalThis.SoundCruiseProBackendEntitlement;
  globalThis.SoundCruiseProBackendEntitlement = f.api;
  try {
    const sync = new PortAssetSync({ storage: f.localStorage,
      controller: { enabled: true, runtime: { endpoint: 'https://sync.example', admissionMode: 'production',
        credential: async () => device } }, isEnabled: () => true,
      fetchImpl: async () => Response.json({ ok: false, code: 'pro_required' }, { status: 403 }) });
    // Capability context is deliberately Pro in this isolated transfer test.
    sync.canSync = () => true;
    const headers = await sync.headers();
    assert.equal(headers.get('Authorization'), `Bearer ${device}`);
    assert.equal(headers.get('X-Sound-Cruise-Pro-Authorization'), `Bearer ${token}`);
    await assert.rejects(sync.json('/v1/sync/assets/prepare', {}), /pro_required/);
    assert.equal(f.values.get('savedUserData'), 'kept');
  } finally { globalThis.SoundCruiseProBackendEntitlement = previous; }
});

test('all five Pro entry points load credential forwarding before their sync clients', () => {
  for (const path of ['pitch-cruise/pro_x9v7q2m8', 'fretboard_cruise/pro_a9f4k7q2m8z',
    'rhythm-cruise/pro_r4m8k7n2q9x', 'chord-cruise/pro_k7m4q9v2x8', 'cruise-port/pro_9a3943176561']) {
    const html = read(`../${path}/index.html`);
    assert.ok(html.indexOf('pro-backend-entitlement.js?v=3') >= 0, path);
    assert.ok(html.indexOf('pro-backend-entitlement.js?v=3') < html.indexOf('sync-account-client.js'), path);
    assert.match(html, /pro-gate\.js\?v=30/);
    assert.ok(html.indexOf('pro-device-session.js?v=2') < html.indexOf('pro-gate.js?v=30'), path);
  }
});
