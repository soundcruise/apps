import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const directory = import.meta.dirname;
const coreSource = fs.readFileSync(path.join(directory, 'sync-account-core.js'), 'utf8');
const dbSource = fs.readFileSync(path.join(directory, 'sync-account-db.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(directory, 'sync-account-client.js'), 'utf8');
const bridgeSource = fs.readFileSync(path.join(directory, 'chord-account-bridge.js'), 'utf8');
const backupSource = fs.readFileSync(path.join(directory, 'sync-app-backup.js'), 'utf8');

function load(sources, overrides = {}) {
  const context = vm.createContext({
    URL,
    URLSearchParams,
    Headers,
    Response,
    crypto,
    structuredClone,
    btoa,
    TextEncoder,
    AbortController,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    ...overrides
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
  const join = account.core.createJoinMaterial();
  assert.equal(account.core.validJoinCode(join.joinCode), true);
  assert.match(account.core.formatJoinCode(join.joinCode), /^SCJ1(?:-[0-9A-Z]{4}){5}$/);

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

test('sensitive input controller clears DOM values while preserving only retryable request-memory state', () => {
  const account = load([coreSource]);
  const attributes = { value: 'must-not-survive' };
  const input = {
    value: 'SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE',
    removeAttribute(name) { delete attributes[name]; }
  };
  const secret = account.core.createSensitiveInputController(input);
  assert.equal(secret.take(), 'SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE');
  assert.equal(input.value, '');
  assert.equal(attributes.value, undefined);
  assert.equal(secret.hasRetryValue(), true);

  assert.equal(secret.reject({ code: 'network_error' }), true);
  assert.equal(secret.take(), 'SCJ1-AAAA-BBBB-CCCC-DDDD-EEEE');
  secret.resolve();
  assert.equal(secret.hasRetryValue(), false);
  assert.equal(secret.take(), null);

  input.value = 'SCJ1-FFFF-GGGG-HHHH-JJJJ-KKKK';
  assert.equal(secret.take(), 'SCJ1-FFFF-GGGG-HHHH-JJJJ-KKKK');
  assert.equal(secret.reject({ code: 'app_join_expired', status: 400 }), false);
  assert.equal(secret.hasRetryValue(), false);
  assert.equal(secret.take(), null);
});

test('sensitive retry policy distinguishes response loss from definitive code rejection', () => {
  const account = load([coreSource]);
  assert.equal(account.core.sensitiveFailureIsRetryable({ code: 'network_error' }), true);
  assert.equal(account.core.sensitiveFailureIsRetryable({ code: 'account_request_timeout' }), true);
  assert.equal(account.core.sensitiveFailureIsRetryable({ code: 'account_start_uncertain' }), true);
  assert.equal(account.core.sensitiveFailureIsRetryable({ code: 'invalid_response' }), true);
  assert.equal(account.core.sensitiveFailureIsRetryable({ code: 'server_error', status: 503 }), true);
  assert.equal(account.core.sensitiveFailureIsRetryable({ code: 'rate_limited', status: 429 }), true);
  assert.equal(account.core.sensitiveFailureIsRetryable(new TypeError('Failed to fetch')), true);
  assert.equal(account.core.sensitiveFailureIsRetryable({ code: 'pairing_expired', status: 400 }), false);
  assert.equal(account.core.sensitiveFailureIsRetryable({ code: 'recovery_invalid', status: 400 }), false);
  assert.equal(account.core.sensitiveFailureIsRetryable({ code: 'enrollment_invalid', status: 403 }), false);
});

test('cross-container Join Code is request-memory only and creates separate app and Account credentials', async () => {
  const writes = [];
  const requests = [];
  const account = load([coreSource, clientSource]);
  const storage = {
    async setPendingConsume(value) { writes.push(['pending', structuredClone(value)]); },
    async setAccount(value) { writes.push(['account', structuredClone(value)]); },
    async setQaAdmission(value) { writes.push(['qa', structuredClone(value)]); },
    async clearPendingConsume() { writes.push(['clear']); }
  };
  const client = new account.AccountClient({
    endpoint: 'https://sync.example', storage, core: account.core,
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body });
      return Response.json({
        ok: true, accountId: crypto.randomUUID(), membershipId: crypto.randomUUID(),
        accountDeviceId: body.accountCredential.split('.')[1],
        appDeviceId: body.appDeviceCredential.split('.')[1],
        qaSessionId: body.qaCredential.split('.')[1], consumeMode: 'new_app'
      }, { status: 201 });
    }
  });
  const material = account.core.createJoinMaterial();
  const result = await client.consumeJoinInvitation({ joinCode: material.joinCode, appId: 'pitch' });
  assert.match(requests[0].url, /app-join-invitations\/consume$/);
  assert.equal(JSON.stringify(writes).includes(material.joinCode), false);
  assert.notEqual(result.accountDeviceId, result.appDeviceId);
});

test('credential storage is Account-specific IndexedDB and rejects transient Recovery/handoff secrets', async () => {
  assert.equal(dbSource.includes("sound-cruise-sync-account"), true);
  assert.equal(dbSource.includes('indexedDB'), true);
  assert.equal(/\blocalStorage\b/.test(dbSource), false);
  assert.equal(/\bsessionStorage\b/.test(dbSource), false);
  assert.equal(dbSource.includes('transient_secret_persistence_blocked'), true);
  assert.match(dbSource, /app:\$\{appId\}/);
  assert.match(dbSource, /getQaAdmission\(scope = 'port'/);
  const account = load([coreSource, dbSource]);
  const handoff = account.core.createHandoffMaterial();
  const recovery = account.core.createAccountMaterial();
  const join = account.core.createJoinMaterial();
  await assert.rejects(
    account.storage.setAccount({ renamedSecret: handoff.handoffToken }),
    /transient_secret_persistence_blocked/
  );
  await assert.rejects(
    account.storage.setAccount({ renamedSecret: recovery.recoveryCode }),
    /transient_secret_persistence_blocked/
  );
  await assert.rejects(
    account.storage.setAccount({ renamedSecret: join.joinCode }),
    /transient_secret_persistence_blocked/
  );
});

test('Port and app Account transports select separate QA admission slots', async () => {
  const reads = [];
  const requests = [];
  const account = load([coreSource, clientSource]);
  const storage = {
    async getQaAdmission(scope, appId) {
      reads.push([scope, appId]);
      return { qaCredential: scope === 'port' ? 'port-qa' : `${appId}-qa` };
    }
  };
  const fetchImpl = async (_url, options) => {
    requests.push(options.headers.get('X-Sound-Cruise-QA-Authorization'));
    return Response.json({ ok: true });
  };
  const port = new account.AccountClient({ endpoint: 'https://sync.example', storage, core: account.core, fetchImpl,
    qaScope: 'port' });
  const pitch = new account.AccountClient({ endpoint: 'https://sync.example', storage, core: account.core, fetchImpl,
    qaScope: 'app', qaAppId: 'pitch' });
  await port.summary('account');
  await pitch.summary('account');
  assert.deepEqual(reads, [['port', null], ['app', 'pitch']]);
  assert.deepEqual(requests, ['Bearer port-qa', 'Bearer pitch-qa']);
});

test('Account transport omits referrers and persists response-loss candidates without handoff plaintext', async () => {
  const writes = [];
  const storage = {
    async setPendingConsume(value) { writes.push(['pendingConsume', structuredClone(value)]); },
    async setAccount(value) { writes.push(['account', structuredClone(value)]); },
    async setQaAdmission(value) { writes.push(['qaAdmission', structuredClone(value)]); },
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
        qaSessionId: JSON.parse(options.body).qaCredential.split('.')[1],
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

test('handoff consume can retain its resumable candidate until the app confirms durable persistence', async () => {
  const writes = [];
  const storage = {
    async setPendingConsume(value) { writes.push(['pendingConsume', structuredClone(value)]); },
    async setAccount(value) { writes.push(['account', structuredClone(value)]); },
    async setQaAdmission(value) { writes.push(['qaAdmission', structuredClone(value)]); },
    async clearPendingConsume() { writes.push(['clearPendingConsume']); }
  };
  const account = load([coreSource, clientSource]);
  const client = new account.AccountClient({
    endpoint: 'https://sync.example', storage, core: account.core,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      return Response.json({ ok: true, accountId: crypto.randomUUID(), membershipId: crypto.randomUUID(),
        accountDeviceId: body.accountCredential.split('.')[1], appDeviceId: body.appDeviceCredential.split('.')[1],
        qaSessionId: body.qaCredential.split('.')[1], membershipState: 'active', consumeMode: 'new_app' });
    }
  });
  const handoff = account.core.createHandoffMaterial();
  await client.consumeHandoff({ handoffToken: handoff.handoffToken, appId: 'pitch', preservePending: true });
  assert.equal(writes.some(([kind]) => kind === 'clearPendingConsume'), false);
  await client.confirmConsumePersisted();
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
    material,
    recoverySaved: true
  });
  assert.equal(result.recoveryCode, material.recoveryCode);
  assert.equal(JSON.stringify(writes).includes(material.recoveryCode), false);

  await assert.rejects(client.startAccount({
    appIds: ['chord'],
    deviceLabel: 'QA',
    turnstileToken: 'opaque',
    material
  }), /account_material_must_be_created_and_saved_first/);
});

test('Account start sends no POST on storage failure and retries the same memory candidate once storage recovers', async () => {
  const account = load([coreSource, clientSource]);
  const material = account.core.createAccountMaterial();
  let storageAvailable = false;
  let pending = null;
  let startCalls = 0;
  const writes = [];
  const storage = {
    async setPendingStart(value) {
      if (!storageAvailable) {
        const error = new Error('account_storage_write_failed');
        error.code = 'account_storage_write_failed';
        error.category = 'storage';
        throw error;
      }
      pending = structuredClone(value);
      writes.push(['pendingStart', pending]);
    },
    async getPendingStart() { return pending; },
    async getQaAdmission() { return null; },
    async setAccount(value) { writes.push(['account', structuredClone(value)]); },
    async clearPendingStart() { pending = null; writes.push(['clearPendingStart']); }
  };
  const client = new account.AccountClient({
    endpoint: 'https://sync.example', storage, core: account.core,
    fetchImpl: async (_url, options) => {
      startCalls += 1;
      const body = JSON.parse(options.body);
      return Response.json({
        ok: true, accountId: crypto.randomUUID(),
        accountDeviceId: body.accountCredential.split('.')[1],
        recoveryVersion: 1, memberships: []
      }, { status: 201 });
    }
  });
  await assert.rejects(client.startAccount({
    appIds: ['chord'], turnstileToken: 'opaque', material, recoverySaved: true
  }), (error) => error.code === 'account_storage_write_failed' && error.category === 'storage');
  assert.equal(startCalls, 0);
  assert.equal(pending, null);

  storageAvailable = true;
  const result = await client.startAccount({
    appIds: ['chord'], turnstileToken: 'opaque', material, recoverySaved: true
  });
  assert.equal(result.accountDeviceId, material.accountDeviceId);
  assert.equal(startCalls, 1);
  assert.equal(writes.filter(([kind]) => kind === 'pendingStart').length, 1);
  assert.equal(writes.filter(([kind]) => kind === 'account').length, 1);
  assert.equal(JSON.stringify(writes).includes(material.recoveryCode), false);
});

test('Account start timeout before server execution is finite and retains one retry candidate', async () => {
  const writes = [];
  let startCalls = 0;
  const account = load([coreSource, clientSource]);
  const material = account.core.createAccountMaterial();
  const storage = {
    async setPendingStart(value) { writes.push(['pendingStart', structuredClone(value)]); },
    async getPendingStart() { return writes.find(([kind]) => kind === 'pendingStart')?.[1] || null; },
    async getQaAdmission() { return null; }
  };
  const client = new account.AccountClient({
    endpoint: 'https://sync.example', storage, core: account.core, requestTimeoutMs: 10,
    fetchImpl: async (url, options) => {
      if (url.endsWith('/start')) {
        startCalls += 1;
        return new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }));
      }
      return Response.json({ ok: false, code: 'invalid_account_credential' }, { status: 401 });
    }
  });
  await assert.rejects(client.startAccount({
    appIds: ['chord'], turnstileToken: 'opaque', material, recoverySaved: true
  }), (error) => error.code === 'account_request_timeout');
  assert.equal(startCalls, 1);
  assert.equal(writes.filter(([kind]) => kind === 'pendingStart').length, 1);
  assert.equal(JSON.stringify(writes).includes(material.recoveryCode), false);
});

test('Safari-like stalled response body is bounded and remains safe to retry', async () => {
  let pending = null;
  const account = load([coreSource, clientSource]);
  const material = account.core.createAccountMaterial();
  const storage = {
    async setPendingStart(value) { pending = structuredClone(value); },
    async getPendingStart() { return pending; },
    async getQaAdmission() { return null; }
  };
  const client = new account.AccountClient({
    endpoint: 'https://sync.example', storage, core: account.core, requestTimeoutMs: 10,
    fetchImpl: async (url) => url.endsWith('/start')
      ? { ok: true, status: 201, json: () => new Promise(() => {}) }
      : Response.json({ ok: false, code: 'invalid_account_credential' }, { status: 401 })
  });
  await assert.rejects(client.startAccount({
    appIds: ['chord'], turnstileToken: 'opaque', material, recoverySaved: true
  }), (error) => error.code === 'account_request_timeout');
  assert.equal(pending.operationId, material.operationId);
  assert.equal(JSON.stringify(pending).includes(material.recoveryCode), false);
});

test('Account start response loss reconciles committed state without a duplicate start', async () => {
  const writes = [];
  let pending = null;
  let startCalls = 0;
  let accountId = null;
  const account = load([coreSource, clientSource]);
  const material = account.core.createAccountMaterial();
  const storage = {
    async setPendingStart(value) { pending = structuredClone(value); writes.push(['pendingStart', pending]); },
    async getPendingStart() { return pending; },
    async setAccount(value) { writes.push(['account', structuredClone(value)]); },
    async clearPendingStart() { pending = null; writes.push(['clearPendingStart']); },
    async getQaAdmission() { return null; }
  };
  const client = new account.AccountClient({
    endpoint: 'https://sync.example', storage, core: account.core, requestTimeoutMs: 50,
    fetchImpl: async (url) => {
      if (url.endsWith('/start')) {
        startCalls += 1;
        accountId ||= crypto.randomUUID();
        throw new TypeError('response lost');
      }
      return Response.json({
        ok: true,
        account: { id: accountId, recoveryVersion: 1 },
        memberships: [{ id: 'm-chord', appId: 'chord', state: 'pending' }]
      });
    }
  });
  const result = await client.startAccount({
    appIds: ['chord'], turnstileToken: 'opaque', material, recoverySaved: true
  });
  assert.equal(result.operation, 'reconciled');
  assert.equal(startCalls, 1);
  assert.equal(writes.filter(([kind]) => kind === 'account').length, 1);
  assert.equal(pending, null);
  assert.equal(JSON.stringify(writes).includes(material.recoveryCode), false);
});

test('CORS-like network failure and explicit rate limiting both settle without leaking secrets', async () => {
  const account = load([coreSource, clientSource]);
  const material = account.core.createAccountMaterial();
  let pending = null;
  const storage = {
    async setPendingStart(value) { pending = structuredClone(value); },
    async getPendingStart() { return pending; },
    async getQaAdmission() { return null; }
  };
  const corsClient = new account.AccountClient({
    endpoint: 'https://sync.example', storage, core: account.core, requestTimeoutMs: 20,
    fetchImpl: async () => { throw new TypeError('Failed to fetch'); }
  });
  await assert.rejects(corsClient.startAccount({
    appIds: ['chord'], turnstileToken: 'opaque', material, recoverySaved: true
  }), (error) => error.code === 'account_start_uncertain' && !error.message.includes(material.recoveryCode));

  let requests = 0;
  const limitedClient = new account.AccountClient({
    endpoint: 'https://sync.example', storage, core: account.core,
    fetchImpl: async () => {
      requests += 1;
      return Response.json({ ok: false, code: 'rate_limited' }, { status: 429 });
    }
  });
  await assert.rejects(limitedClient.startAccount({
    appIds: ['chord'], turnstileToken: 'opaque', material, recoverySaved: true
  }), (error) => error.code === 'rate_limited');
  assert.equal(requests, 1, 'a definitive rejection is not reconciled or replayed');
});

function storageFixture({ transactionOutcomes = [], rejectReopen = false } = {}) {
  const values = new Map();
  let openCount = 0;
  let closeCount = 0;
  let lastDatabase = null;
  const source = {
    open() {
      openCount += 1;
      const request = {};
      queueMicrotask(() => {
        if (rejectReopen && openCount > 1) {
          request.onerror?.();
          return;
        }
        const database = {
          objectStoreNames: { contains: () => true },
          close() { closeCount += 1; },
          transaction(_storeName, mode) {
            const outcome = mode === 'readonly' ? 'success' : (transactionOutcomes.shift() || 'success');
            const transaction = {
              error: null,
              abort() { queueMicrotask(() => transaction.onabort?.()); },
              objectStore() {
                return {
                  get(key) {
                    const getRequest = { transaction };
                    queueMicrotask(() => {
                      getRequest.result = structuredClone(values.get(key));
                      getRequest.onsuccess?.();
                    });
                    return getRequest;
                  },
                  put(value, key) {
                    if (outcome === 'put-failure') throw new Error('clone failed');
                    values.set(key, structuredClone(value));
                    if (outcome === 'abort') queueMicrotask(() => transaction.onabort?.());
                    else if (outcome === 'error') queueMicrotask(() => transaction.onerror?.());
                    else if (outcome === 'delayed') setTimeout(() => transaction.oncomplete?.(), 5);
                    else if (outcome !== 'stalled') queueMicrotask(() => transaction.oncomplete?.());
                  },
                  delete(key) {
                    values.delete(key);
                    queueMicrotask(() => transaction.oncomplete?.());
                  }
                };
              }
            };
            if (mode === 'readonly') queueMicrotask(() => transaction.oncomplete?.());
            return transaction;
          }
        };
        lastDatabase = database;
        request.result = database;
        request.onsuccess?.();
      });
      return request;
    }
  };
  return {
    source,
    values,
    openCount: () => openCount,
    closeCount: () => closeCount,
    versionchange: () => lastDatabase?.onversionchange?.()
  };
}

test('Account storage reuses one Safari-safe connection for QA admission and pendingStart', async () => {
  const account = load([dbSource]);
  const fixture = storageFixture({ rejectReopen: true });
  const qa = {
    qaSessionId: crypto.randomUUID(),
    qaCredential: `scq1.${crypto.randomUUID()}.${'A'.repeat(43)}`,
    scope: 'port',
    expiresAt: Date.now() + 60_000
  };
  await account.storage.setQaAdmission(qa, fixture.source);
  await account.storage.setPendingStart({
    operationId: crypto.randomUUID(), accountDeviceId: crypto.randomUUID(),
    accountCredential: `sca1.${crypto.randomUUID()}.${'B'.repeat(43)}`,
    appIds: ['chord', 'pitch', 'fretboard', 'rhythm'], deviceLabel: 'QA', recoveryAcknowledged: true
  }, fixture.source);
  assert.equal((await account.storage.getQaAdmission('port', null, fixture.source)).qaSessionId, qa.qaSessionId);
  assert.equal(fixture.openCount(), 1, 'back-to-back account setup storage must not reopen Safari Private IDB');
  assert.equal(fixture.closeCount(), 0);
});

test('Account storage classifies open failure, blocked open, abort, error, and put failure', async () => {
  const account = load([dbSource]);
  function openRequest(resultFactory, eventName) {
    return {
      open() {
        const request = {};
        queueMicrotask(() => {
          if (eventName === 'error') request.error = new Error('open failed');
          else request.result = resultFactory?.();
          request[`on${eventName}`]?.();
        });
        return request;
      }
    };
  }
  await assert.rejects(account.storage.getAccount(openRequest(null, 'error')),
    (error) => error.code === 'account_storage_open_failed' && error.category === 'storage');
  await assert.rejects(account.storage.getAccount(openRequest(null, 'blocked')), /account_storage_blocked/);

  const timedStorage = load([dbSource], {
    setTimeout(callback) { queueMicrotask(callback); return 1; },
    clearTimeout() {}
  }).storage;
  await assert.rejects(timedStorage.getAccount({ open: () => ({}) }), /account_storage_timeout/);

  const database = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction() {
      const transaction = {
        error: new Error('transaction aborted'),
        objectStore: () => ({ put() {} }),
        abort() {}
      };
      queueMicrotask(() => transaction.onabort?.());
      return transaction;
    }
  };
  await assert.rejects(account.storage.setAccount(
    { accountId: 'account' }, openRequest(() => database, 'success')
  ), /account_storage_transaction_failed/);

  const transactionError = storageFixture({ transactionOutcomes: ['error'] });
  await assert.rejects(account.storage.setAccount(
    { accountId: 'account' }, transactionError.source
  ), /account_storage_transaction_failed/);

  const putFailure = storageFixture({ transactionOutcomes: ['put-failure'] });
  await assert.rejects(account.storage.setAccount(
    { accountId: 'account' }, putFailure.source
  ), /account_storage_write_failed/);
});

test('Account storage handles delayed completion, timeout, versionchange, and retry without hanging', async () => {
  const account = load([dbSource]);
  const delayed = storageFixture({ transactionOutcomes: ['delayed'] });
  await account.storage.setAccount({ accountId: 'delayed' }, delayed.source);
  assert.equal((await account.storage.getAccount(delayed.source)).accountId, 'delayed');

  delayed.versionchange();
  await account.storage.setAccount({ accountId: 'after-versionchange' }, delayed.source);
  assert.equal(delayed.openCount(), 2);
  assert.equal(delayed.closeCount(), 1);

  const retry = storageFixture({ transactionOutcomes: ['abort', 'success'] });
  await assert.rejects(account.storage.setAccount({ accountId: 'first' }, retry.source),
    /account_storage_transaction_failed/);
  await account.storage.setAccount({ accountId: 'second' }, retry.source);
  assert.equal((await account.storage.getAccount(retry.source)).accountId, 'second');
  assert.equal(retry.openCount(), 2, 'failed connection is discarded before retry');

  const timedAccount = load([dbSource], {
    setTimeout(callback) { queueMicrotask(callback); return 1; },
    clearTimeout() {}
  });
  const stalled = storageFixture({ transactionOutcomes: ['stalled'] });
  await assert.rejects(timedAccount.storage.setAccount({ accountId: 'stalled' }, stalled.source),
    /account_storage_timeout/);
});

test('Account Recovery requires saved candidate, persists no Recovery plaintext, and promotes only after commit', async () => {
  const writes = [];
  const requests = [];
  const storage = {
    async setPendingRecovery(value) { writes.push(['pendingRecovery', structuredClone(value)]); },
    async setAccount(value) { writes.push(['account', structuredClone(value)]); },
    async clearPendingRecovery() { writes.push(['clearPendingRecovery']); }
  };
  const account = load([coreSource, clientSource]);
  const material = account.core.createAccountRecoveryMaterial();
  assert.equal(account.core.validAccountRecoveryClaim(material.claimToken), true);
  assert.equal(account.core.validAccountCredential(material.accountCredential), true);
  const client = new account.AccountClient({
    endpoint: 'https://sync.example', storage, core: account.core,
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body });
      if (url.endsWith('/prepare')) {
        return Response.json({ ok: true, summary: { memberships: [], activeDeviceCount: 2 } }, { status: 201 });
      }
      return Response.json({
        ok: true, accountId: crypto.randomUUID(),
        accountDeviceId: material.accountDeviceId, recoveryVersion: 2
      }, { status: 201 });
    }
  });
  const prepared = await client.prepareAccountRecovery({
    recoveryCode: 'SAR1-0000-0000-0000-0000-0000',
    deviceLabel: 'Recovered', turnstileToken: 'opaque', material
  });
  assert.equal(prepared.nextRecoveryCode, account.core.formatRecoveryCode(material.nextRecoveryCode));
  assert.equal(writes.length, 0, 'prepare keeps all candidate material in request memory');
  await assert.rejects(
    client.commitAccountRecovery({ material }),
    /account_recovery_save_confirmation_required/
  );
  await client.commitAccountRecovery({ material, recoverySaved: true });
  assert.equal(JSON.stringify(writes).includes(material.nextRecoveryCode), false);
  assert.equal(writes[0][0], 'pendingRecovery');
  assert.equal(writes.at(-1)[0], 'clearPendingRecovery');
  assert.equal(requests[1].body.claimToken, material.claimToken);
});

test('scoped delete uses a one-time intent and clears Account storage only for Account-wide delete', async () => {
  const account = load([coreSource, clientSource]);
  const material = account.core.createAccountDeleteMaterial();
  const credential = account.core.createAccountCredential().accountCredential;
  const writes = [];
  const storage = {
    async setPendingDelete(value) { writes.push(['pendingDelete', structuredClone(value)]); },
    async clearPendingDelete() { writes.push(['clearPendingDelete']); },
    async clearAccount() { writes.push(['clearAccount']); }
  };
  const client = new account.AccountClient({
    endpoint: 'https://sync.example', storage, core: account.core,
    fetchImpl: async (url, options) => Response.json({
      ok: true, operation: url.endsWith('delete-intent') ? 'issued' : 'deleting',
      expiresAt: Date.now() + 60_000, purgeAfter: Date.now() + 60_000
    }, { status: url.endsWith('delete-intent') ? 201 : 202 })
  });
  const issued = await client.issueDeleteIntent({
    accountCredential: credential, scope: 'app', appId: 'pitch', material
  });
  assert.equal(issued.material.intentToken, material.intentToken);
  await client.commitDelete({
    accountCredential: credential, scope: 'app', appId: 'pitch', material, confirmed: true
  });
  assert.equal(writes.some(([kind]) => kind === 'clearAccount'), false);
  const accountMaterial = account.core.createAccountDeleteMaterial();
  await client.issueDeleteIntent({ accountCredential: credential, scope: 'account', material: accountMaterial });
  await client.commitDelete({
    accountCredential: credential, scope: 'account', material: accountMaterial, confirmed: true
  });
  assert.equal(writes.some(([kind]) => kind === 'clearAccount'), true);
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

test('Chord bridge persists only resumable metadata before dual network commit', async () => {
  const account = load([coreSource, bridgeSource]);
  const writes = [];
  const requests = [];
  const storage = {
    async setPendingBridge(value) { writes.push(structuredClone(value)); },
    async clearPendingBridge() {},
    async getPendingBridge() { return null; }
  };
  const bridge = {
    bridgeId: crypto.randomUUID(),
    membershipId: crypto.randomUUID(),
    state: 'prepared',
    generation: 1,
    accountRecoveryVersion: 1
  };
  const accountCredential = account.core.createAccountCredential().accountCredential;
  const appCredential = account.core.createAppCredential().appDeviceCredential;
  const accountClient = {
    async request(path, options) {
      requests.push({ path, options: structuredClone(options) });
      return { ok: true, bridge: { ...bridge, state: 'dual', generation: 2 } };
    }
  };
  const client = new account.ChordAccountBridgeClient({ accountClient, storage, core: account.core });
  await client.commitDual({
    accountCredential,
    appCredential,
    bridge,
    accountRecoveryVersion: 1,
    recoverySaved: true
  });
  assert.equal(writes[0].state, 'candidate_saved');
  assert.equal(writes[0].recoveryAcknowledged, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.accountCredential, accountCredential);
  assert.equal(requests[0].options.appCredential, appCredential);
  assert.equal(JSON.stringify(writes).includes(accountCredential), false);
  assert.equal(JSON.stringify(writes).includes(appCredential), false);
  assert.equal(/recoveryCode|handoffToken/u.test(JSON.stringify(writes)), false);
});

test('Chord bridge keeps legacy authority when candidate metadata cannot be saved', async () => {
  const account = load([coreSource, bridgeSource]);
  let requested = false;
  const client = new account.ChordAccountBridgeClient({
    core: account.core,
    storage: {
      async setPendingBridge() { throw new Error('storage_failed'); }
    },
    accountClient: {
      async request() { requested = true; throw new Error('must_not_request'); }
    }
  });
  await assert.rejects(client.commitDual({
    accountCredential: 'opaque-account',
    appCredential: 'opaque-app',
    bridge: {
      bridgeId: crypto.randomUUID(), membershipId: crypto.randomUUID(),
      state: 'prepared', generation: 1, accountRecoveryVersion: 1
    },
    accountRecoveryVersion: 1,
    recoverySaved: true
  }), /storage_failed/);
  assert.equal(requested, false);
});

test('Chord bridge reload resumes prepared/dual state and clears finalized state', async () => {
  const account = load([coreSource, bridgeSource]);
  const pending = {
    bridgeId: crypto.randomUUID(), membershipId: crypto.randomUUID(),
    state: 'candidate_saved', generation: 1, accountRecoveryVersion: 1
  };
  const writes = [];
  let remoteState = 'dual';
  const client = new account.ChordAccountBridgeClient({
    core: account.core,
    storage: {
      async getPendingBridge() { return pending; },
      async setPendingBridge(value) { writes.push(['set', structuredClone(value)]); },
      async clearPendingBridge() { writes.push(['clear']); }
    },
    accountClient: {
      async request() {
        return { ok: true, bridge: { ...pending, state: remoteState, generation: 2 } };
      }
    }
  });
  let result = await client.resume({ accountCredential: 'account', appCredential: 'app' });
  assert.equal(result.status, 'dual');
  assert.equal(writes.at(-1)[0], 'set');
  remoteState = 'finalized';
  result = await client.resume({ accountCredential: 'account', appCredential: 'app' });
  assert.equal(result.status, 'finalized');
  assert.equal(writes.at(-1)[0], 'clear');
});

test('shared app backup storage is isolated and rejects auth, Recovery and credential material', () => {
  const account = load([backupSource]);
  assert.equal(account.appBackupStorage.DATABASE_NAME, 'sound-cruise-sync-app-backups');
  assert.equal(account.appBackupStorage.MAX_BACKUPS_PER_APP, 5);
  assert.equal(typeof account.appBackupStorage.prune, 'function');
  assert.equal(account.appBackupStorage.assertSafeBackup({
    version: 1, appId: 'pitch', createdAt: 1,
    values: { pitchTrainerSettings: '{"notationStyle":"letter"}' }
  }), true);
  assert.throws(() => account.appBackupStorage.assertSafeBackup({
    version: 1, appId: 'pitch', createdAt: 1,
    values: { deviceCredential: 'opaque' }
  }), /secret_forbidden/);
  assert.throws(() => account.appBackupStorage.assertSafeBackup({
    version: 1, appId: 'pitch', createdAt: 1,
    values: { pitchTrainerSettings: 'SCJ1-0123-4567-89AB-CDEF-GHJK' }
  }), /secret_forbidden/);
  assert.throws(() => account.appBackupStorage.assertSafeBackup({
    version: 1, appId: 'pitch', createdAt: 1,
    values: { pitchTrainerSettings: 'SAR1-0123-4567-89AB-CDEF-GHJK' }
  }), /secret_forbidden/);
  assert.equal(account.appBackupStorage.assertSafeBackup({
    version: 1, appId: 'rhythm', createdAt: 2,
    values: { rhythmCruiseSettings: '{"tapLayout":"ud"}' }
  }), true);
});

test('new and existing Account bridge paths both require explicit Recovery acknowledgement', async () => {
  const account = load([coreSource, bridgeSource]);
  const material = account.core.createAccountMaterial();
  const membershipId = crypto.randomUUID();
  let startRecoverySaved = null;
  const client = new account.ChordAccountBridgeClient({
    core: account.core,
    storage: { async setPendingBridge() {} },
    accountClient: {
      async startAccount(input) {
        startRecoverySaved = input.recoverySaved;
        return { memberships: [{ id: membershipId, appId: 'chord' }] };
      },
      async summary() { return { account: { generation: 1 } }; },
      async request(path) {
        assert.equal(path, '/v2/accounts/bridges/chord/prepare');
        return {
          bridge: {
            bridgeId: crypto.randomUUID(), membershipId, state: 'prepared',
            generation: 1, accountRecoveryVersion: 1
          }
        };
      }
    }
  });
  await assert.rejects(client.createAccountAndPrepare({
    appCredential: 'app', accountMaterial: material,
    recoverySaved: false, turnstileToken: 'opaque', deviceLabel: null
  }), /account_recovery_must_be_saved_first/);
  await client.createAccountAndPrepare({
    appCredential: 'app', accountMaterial: material,
    recoverySaved: true, turnstileToken: 'opaque', deviceLabel: null
  });
  assert.equal(startRecoverySaved, true);
});
