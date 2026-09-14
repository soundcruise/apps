import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const directory = import.meta.dirname;
const coreSource = fs.readFileSync(path.join(directory, 'sync-account-core.js'), 'utf8');
const dbSource = fs.readFileSync(path.join(directory, 'sync-account-db.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(directory, 'sync-account-client.js'), 'utf8');

function load(sources) {
  const context = vm.createContext({
    URL,
    URLSearchParams,
    Headers,
    Response,
    crypto,
    structuredClone,
    btoa,
    TextEncoder
  });
  sources.forEach((source) => vm.runInContext(source, context));
  return context.SoundCruiseSyncAccount;
}

test('client-generated credentials are distinct and handoff secret uses a cleared URL fragment', () => {
  const account = load([coreSource]);
  const material = account.core.createAccountMaterial();
  const app = account.core.createAppCredential();
  const handoff = account.core.createHandoffMaterial();
  assert.equal(account.core.validAccountCredential(material.accountCredential), true);
  assert.equal(account.core.validAppCredential(app.appDeviceCredential), true);
  assert.equal(account.core.validHandoffToken(handoff.handoffToken), true);
  assert.match(account.core.formatRecoveryCode(material.recoveryCode), /^SAR1(?:-[0-9A-Z]{4}){5}$/);

  const url = new URL(account.core.createHandoffUrl(
    'https://soundcruise.jp/apps/chord-cruise/pro/',
    handoff.handoffToken
  ));
  assert.equal(url.search, '');
  assert.equal(url.hash.includes(encodeURIComponent(handoff.handoffToken)), true);
  let replaced = null;
  const taken = account.core.takeHandoffFromLocation({
    hash: url.hash,
    pathname: url.pathname,
    search: '?edition=pro'
  }, {
    replaceState(_state, _title, next) { replaced = next; }
  });
  assert.equal(taken, handoff.handoffToken);
  assert.equal(replaced, `${url.pathname}?edition=pro`);

  const fallbackCrypto = {
    getRandomValues(bytes) {
      for (let index = 0; index < bytes.length; index += 1) bytes[index] = index + 1;
      return bytes;
    }
  };
  assert.match(account.core.createOperationId(fallbackCrypto),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('credential storage is Account-specific IndexedDB and rejects transient Recovery/handoff secrets', async () => {
  assert.equal(dbSource.includes("sound-cruise-sync-account"), true);
  assert.equal(dbSource.includes('indexedDB'), true);
  assert.equal(/\blocalStorage\b/.test(dbSource), false);
  assert.equal(/\bsessionStorage\b/.test(dbSource), false);
  assert.equal(dbSource.includes('transient_secret_persistence_blocked'), true);
  const account = load([coreSource, dbSource]);
  const handoff = account.core.createHandoffMaterial();
  const recovery = account.core.createAccountMaterial();
  await assert.rejects(
    account.storage.setAccount({ renamedSecret: handoff.handoffToken }),
    /transient_secret_persistence_blocked/
  );
  await assert.rejects(
    account.storage.setAccount({ renamedSecret: recovery.recoveryCode }),
    /transient_secret_persistence_blocked/
  );
});

test('Account transport omits referrers and persists response-loss candidates without handoff plaintext', async () => {
  const writes = [];
  const storage = {
    async setPendingConsume(value) { writes.push(['pendingConsume', structuredClone(value)]); },
    async setAccount(value) { writes.push(['account', structuredClone(value)]); },
    async clearPendingConsume() { writes.push(['clearPendingConsume']); }
  };
  const requests = [];
  const account = load([coreSource, clientSource]);
  const client = new account.AccountClient({
    endpoint: 'https://sync.example',
    storage,
    core: account.core,
    fetchImpl: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({
        ok: true,
        accountId: crypto.randomUUID(),
        membershipId: crypto.randomUUID(),
        accountDeviceId: JSON.parse(options.body).accountCredential.split('.')[1],
        appDeviceId: JSON.parse(options.body).appDeviceCredential.split('.')[1],
        syncUserId: crypto.randomUUID()
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
  });
  const handoff = account.core.createHandoffMaterial();
  await client.consumeHandoff({
    handoffToken: handoff.handoffToken,
    appId: 'chord',
    deviceLabel: 'QA'
  });
  assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.referrerPolicy, 'no-referrer');
  assert.equal(requests[0].body.handoffToken, handoff.handoffToken);
  assert.equal(JSON.stringify(writes).includes(handoff.handoffToken), false,
    'handoff remains request-memory only and is not persisted');
  assert.equal(writes[0][0], 'pendingConsume');
  assert.equal(writes.at(-1)[0], 'clearPendingConsume');
});

test('Account start exposes Recovery once to the caller but never writes it to pending/account storage', async () => {
  const writes = [];
  const storage = {
    async setPendingStart(value) { writes.push(['pendingStart', structuredClone(value)]); },
    async setAccount(value) { writes.push(['account', structuredClone(value)]); },
    async clearPendingStart() { writes.push(['clearPendingStart']); }
  };
  const account = load([coreSource, clientSource]);
  const material = account.core.createAccountMaterial();
  const client = new account.AccountClient({
    endpoint: 'https://sync.example',
    storage,
    core: account.core,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      return new Response(JSON.stringify({
        ok: true,
        accountId: crypto.randomUUID(),
        accountDeviceId: body.accountCredential.split('.')[1],
        recoveryVersion: 1,
        memberships: []
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
  });
  const result = await client.startAccount({
    appIds: ['chord'],
    deviceLabel: 'QA',
    turnstileToken: 'opaque',
    material
  });
  assert.equal(result.recoveryCode, material.recoveryCode);
  assert.equal(JSON.stringify(writes).includes(material.recoveryCode), false);
});

test('consume response-loss recovery proves committed state with candidate Account auth, not handoff persistence', async () => {
  const writes = [];
  const account = load([coreSource, clientSource]);
  const accountCredential = account.core.createAccountCredential();
  const appCredential = account.core.createAppCredential();
  const pending = {
    operationId: account.core.createOperationId(),
    appId: 'chord',
    accountDeviceId: accountCredential.accountDeviceId,
    accountCredential: accountCredential.accountCredential,
    appDeviceId: appCredential.appDeviceId,
    appDeviceCredential: appCredential.appDeviceCredential,
    deviceLabel: null
  };
  const storage = {
    async getPendingConsume() { return pending; },
    async setAccount(value) { writes.push(['account', structuredClone(value)]); },
    async clearPendingConsume() { writes.push(['clearPendingConsume']); }
  };
  const membershipId = crypto.randomUUID();
  const client = new account.AccountClient({
    endpoint: 'https://sync.example',
    storage,
    core: account.core,
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.get('Authorization'), `Bearer ${accountCredential.accountCredential}`);
      return new Response(JSON.stringify({
        ok: true,
        account: { id: crypto.randomUUID(), recoveryVersion: 1 },
        memberships: [{ id: membershipId, appId: 'chord', state: 'active' }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  const result = await client.resumePendingConsume();
  assert.equal(result.status, 'committed');
  assert.equal(result.membership.id, membershipId);
  assert.equal(writes.at(-1)[0], 'clearPendingConsume');
  assert.equal(JSON.stringify(writes).includes('sch1.'), false);
});
