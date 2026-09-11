'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var webcrypto = require('crypto').webcrypto;

var root = path.join(__dirname, '..');
var coreSource = fs.readFileSync(path.join(root, 'js/sync/sync-core.js'), 'utf8');
var databaseSource = fs.readFileSync(path.join(root, 'js/sync/sync-db.js'), 'utf8');

function fakeIndexedDb() {
    var stores = new Map();
    var definitions = new Map();
    var database = {
        objectStoreNames: { contains: function (name) { return stores.has(name); } },
        createObjectStore: function (name, options) {
            stores.set(name, new Map());
            definitions.set(name, { keyPath: options.keyPath, indexes: [] });
            return { createIndex: function (indexName) { definitions.get(name).indexes.push(indexName); } };
        },
        transaction: function (name) {
            var transaction = {
                error: null,
                abort: function () { if (transaction.onabort) transaction.onabort(); },
                objectStore: function () {
                    var map = stores.get(name);
                    var keyPath = definitions.get(name).keyPath;
                    function request(action) {
                        var req = { result: undefined, error: null };
                        setTimeout(function () {
                            try {
                                req.result = action();
                                if (req.onsuccess) req.onsuccess();
                                setTimeout(function () { if (transaction.oncomplete) transaction.oncomplete(); }, 0);
                            } catch (error) {
                                req.error = error;
                                transaction.error = error;
                                if (req.onerror) req.onerror();
                                if (transaction.onerror) transaction.onerror();
                            }
                        }, 0);
                        return req;
                    }
                    return {
                        get: function (key) { return request(function () { return map.get(key); }); },
                        getAll: function () { return request(function () { return Array.from(map.values()); }); },
                        put: function (value) { return request(function () { map.set(value[keyPath], JSON.parse(JSON.stringify(value))); return value[keyPath]; }); },
                        delete: function (key) { return request(function () { map.delete(key); }); }
                    };
                }
            };
            return transaction;
        },
        close: function () {}
    };
    return {
        open: function (name, version) {
            var request = { result: database, error: null };
            setTimeout(function () {
                assert.strictEqual(name, 'soundCruiseSync');
                assert.strictEqual(version, 1);
                if (request.onupgradeneeded) request.onupgradeneeded();
                if (request.onsuccess) request.onsuccess();
            }, 0);
            return request;
        },
        definitions: definitions
    };
}

(async function () {
    var window = { crypto: webcrypto };
    var context = { window: window, crypto: webcrypto, TextEncoder: TextEncoder, JSON: JSON, Object: Object, Number: Number, Uint8Array: Uint8Array, Date: Date, Promise: Promise };
    vm.createContext(context);
    vm.runInContext(coreSource, context, { filename: 'sync-core.js' });
    vm.runInContext(databaseSource, context, { filename: 'sync-db.js' });

    var factory = fakeIndexedDb();
    var store = await window.ChordCruiseSync.database.open(factory);
    assert.deepStrictEqual(Array.from(factory.definitions.keys()), ['meta', 'outbox', 'shadow', 'conflicts']);
    assert.deepStrictEqual(factory.definitions.get('outbox').indexes, ['recordKey', 'localCommitted', 'nextRetryAt']);
    assert.deepStrictEqual(factory.definitions.get('conflicts').indexes, ['recordKey']);

    await store.setMeta('cursor', 'cursor-1', 1);
    assert.strictEqual(await store.getMeta('cursor'), 'cursor-1');
    var operation = { operationId: 'op-1', recordKey: 'chord/c1', localCommitted: false, nextRetryAt: 0 };
    await store.putOutbox(operation);
    operation.localCommitted = true;
    assert.strictEqual((await store.getOutbox('op-1')).localCommitted, false, 'stored values are detached from caller mutations');
    assert.strictEqual((await store.listOutbox()).length, 1);
    await store.deleteOutbox('op-1');
    assert.strictEqual((await store.listOutbox()).length, 0);

    await store.putShadow({ recordKey: 'chord/c1', revision: 1 });
    assert.strictEqual((await store.getShadow('chord/c1')).revision, 1);
    assert.strictEqual((await store.listShadow()).length, 1);
    await store.putConflict({ conflictId: 'conflict-1', recordKey: 'chord/c1' });
    assert.strictEqual((await store.listConflicts()).length, 1);
    await store.deleteConflict('conflict-1');
    assert.strictEqual((await store.listConflicts()).length, 0);

    await assert.rejects(window.ChordCruiseSync.database.open(null), /IndexedDB is unavailable/);
    console.log('sync-pilot-indexeddb: isolated schema and meta/outbox/shadow/conflict CRUD passed');
}()).catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
