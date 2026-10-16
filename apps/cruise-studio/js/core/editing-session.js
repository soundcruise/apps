/* Domain-neutral editing ownership. JSON snapshots, observable draft, no DOM/storage/audio. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.editing = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';
    function jsonInsist(ok,code) { if(!ok) throw new TypeError(code); }
    // Schema 2 drafts must not be normalized by JSON before domain validation.
    function assertJson(value) { jsonValue(value,0,new Set(),new Set()); }
    function jsonValue(value,depth,seen,prototypes) {
        prototypes = prototypes || new Set();
        if (value && typeof value === 'object') {
            // JSON reads toJSON through the complete prototype chain. Never read that property.
            for (var proto = value; proto && !prototypes.has(proto); proto = Object.getPrototypeOf(proto)) {
                jsonInsist(!Object.getOwnPropertyDescriptor(proto,'toJSON'), 'json-serialization-hook');
                jsonInsist(!Object.getOwnPropertyDescriptor(proto,Symbol.toStringTag), 'non-json-symbol');
                if (proto !== value) Reflect.ownKeys(proto).forEach(function(key){
                    var descriptor=Object.getOwnPropertyDescriptor(proto,key);
                    // Object.prototype's historical __proto__ accessor is never read here.
                    jsonInsist(Object.hasOwn(descriptor,'value') || (key==='__proto__' && Object.getPrototypeOf(proto)===null),'non-json-descriptor');
                });
                // Only prototypes can be reused; each value still receives its full own-data check.
                if (proto !== value) prototypes.add(proto);
            }
        }
        jsonInsist(depth<40,'json-depth');
        if(value===null||typeof value==='string'||typeof value==='boolean')return;
        if(typeof value==='number'){jsonInsist(Number.isFinite(value),'non-json-number');return;}
        jsonInsist(typeof value==='object'&&!seen.has(value),'non-json-value');seen.add(value);
        jsonInsist(Array.isArray(value)||Object.prototype.toString.call(value)==='[object Object]','non-json-object');
        var array = Array.isArray(value), count = 0, own = Reflect.ownKeys(value);
        for (var key of own) {
            jsonInsist(typeof key === 'string', 'non-json-symbol');
            if (array && key === 'length') continue;
            var d = Object.getOwnPropertyDescriptor(value, key);
            jsonInsist(Object.hasOwn(d, 'value') && d.enumerable, 'non-json-descriptor');
            if (array) jsonInsist(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length, 'non-json-array-property');
            jsonValue(d.value, depth + 1, seen, prototypes); count++;
        }
        // Unique, in-range own array indices cover the array iff their count equals length.
        if (array) jsonInsist(count === value.length, 'sparse-json-array');
        seen.delete(value);
    }
    var legacySources = new WeakSet();
    function clone(value, validated) {
        var descriptor = value && typeof value === 'object' && Object.getOwnPropertyDescriptor(value,'schemaVersion');
        if (descriptor && !Object.hasOwn(descriptor,'value')) throw new TypeError('non-json-descriptor');
        var checked=!validated && value && typeof value==='object' && Object.hasOwn(value,'projectId');
        if(checked)assertJson(value);
        if (descriptor && descriptor.value === 2) {
            if (!validated && !checked) assertJson(value);
            var provenance = { ...value.provenance }, source = provenance.legacySource;
            delete provenance.legacySource;
            var copy = JSON.parse(JSON.stringify({ ...value, provenance: provenance }));
            if (source !== undefined) {
                // Only our own deeply frozen restoration objects may be shared.
                if (!source || typeof source !== 'object' || !legacySources.has(source)) {
                    source = freeze(JSON.parse(JSON.stringify(source)));
                    if (source && typeof source === 'object') legacySources.add(source);
                }
                copy.provenance.legacySource = source;
            }
            return copy;
        }
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }
    function freeze(value) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.keys(value).forEach(function (key) { freeze(value[key]); }); Object.freeze(value);
        }
        return value;
    }
    function snapshot(value) { return freeze(clone(value)); }
    function equal(a, b) {
        if (a === b) return true;
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
        var ak = Object.keys(a), bk = Object.keys(b);
        return ak.length === bk.length && ak.every(function (key) { return Object.hasOwn(b, key) && equal(a[key], b[key]); });
    }
    function at(value, path) { return path.reduce(function (v, key) { return v == null ? undefined : v[key]; }, value); }
    var METADATA = new Set(['appVersion', 'updatedAt']);
    var HISTORY_FIXED = new Set(['projectId', 'schemaVersion', 'createdAt', 'appVersion', 'updatedAt']);
    var HISTORY_LIMITS = Object.freeze({ maxEntries: 100, maxBytes: 8 * 1024 * 1024 });
    function contentSnapshot(value, validated) {
        var copy = clone(value, validated);
        HISTORY_FIXED.forEach(function (key) { delete copy[key]; });
        if(value.schemaVersion === 2 && copy.provenance) delete copy.provenance.legacySource;
        return freeze(copy);
    }
    function restoreContent(content, current) {
        var copy = clone(content);
        if(current.schemaVersion === 2 && current.provenance && current.provenance.legacySource) { copy.provenance = copy.provenance || {}; copy.provenance.legacySource = current.provenance.legacySource; }
        HISTORY_FIXED.forEach(function (key) { if (Object.hasOwn(current, key)) copy[key] = clone(current[key]); });
        return copy;
    }
    function byteSize(value) {
        var text = JSON.stringify(value), bytes = 0;
        for (var i = 0; i < text.length; i++) {
            var code = text.codePointAt(i);
            bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
            if (code > 65535) i++;
        }
        return bytes;
    }
    function createDraft(value, getBase, changed, validated) {
        var raw = clone(value, validated), touched = new Map(), proxies = new WeakMap(), originals = new WeakMap(), version = 0;
        function note(path, semantic) {
            if (!METADATA.has(path[0])) touched.set(JSON.stringify(path), path);
            version++; changed(path, semantic);
        }
        function wrap(object, path) {
            if (!object || typeof object !== 'object') return object;
            var byPath = proxies.get(object); if (!byPath) { byPath = new Map(); proxies.set(object, byPath); }
            var key = JSON.stringify(path); if (byPath.has(key)) return byPath.get(key);
            var proxy = new Proxy(object, {
                get: function (o, property) { return typeof property === 'symbol' ? o[property] : wrap(o[property], path.concat(property)); },
                set: function (o, property, incoming) {
                    var unwrapped = originals.get(incoming) || incoming;
                    if(raw.schemaVersion===2)assertJson(unwrapped);
                    var full=path.concat(String(property));
                    if(raw.schemaVersion===2 && full[0]==='provenance' && (full.length===1 ? !equal(unwrapped && unwrapped.legacySource, raw.provenance && raw.provenance.legacySource) : full[1]==='legacySource' && !equal(o[property],unwrapped))) throw Error('Immutable legacy source');
                    if (o[property] === unwrapped) return true;
                    // Own assigned values: callers cannot mutate an untracked external alias later.
                    var semantic = !equal(o[property], unwrapped);
                    o[property] = unwrapped && typeof unwrapped === 'object' ? clone(unwrapped) : unwrapped;
                    note(path.concat(String(property)), semantic); return true;
                },
                deleteProperty: function (o, property) { var full=path.concat(String(property));if(raw.schemaVersion===2 && full[0]==='provenance' && (full.length===1 || full[1]==='legacySource') && Object.hasOwn(o,property))throw Error('Immutable legacy source');if (Object.hasOwn(o, property)) { delete o[property]; note(path.concat(String(property)), true); } return true; }
            });
            byPath.set(key, proxy); originals.set(proxy, object); return proxy;
        }
        function diffPaths(a, b, path) {
            if (METADATA.has(path[0]) || equal(a, b)) return;
            if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b) ||
                (Array.isArray(a) && a.length !== b.length)) { touched.set(JSON.stringify(path), path); return; }
            new Set(Object.keys(a).concat(Object.keys(b))).forEach(function (key) { diffPaths(a[key], b[key], path.concat(key)); });
        }
        return {
            draft: wrap(raw, []), raw: raw,
            version: function () { return version; },
            dirty: function () {
                var base = getBase();
                return Array.from(touched.values()).some(function (path) { return !equal(at(raw, path), at(base, path)); });
            },
            rebase: function () { touched.clear(); diffPaths(raw, getBase(), []); },
            detach: function () { changed = function () {}; }
        };
    }
    function createRegistry(options) {
        var repository = options.repository, sessions = new Map(), byTarget = new Map(), listeners = new Set(), active = null, sequence = 0;
        var limits = Object.freeze(Object.assign({}, HISTORY_LIMITS, options.historyLimits || {}));
        if (!Number.isSafeInteger(limits.maxEntries) || limits.maxEntries < 1 || !Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 1) throw new TypeError('Invalid history limits');
        var id = options.idFactory || function () { sequence++; return 'session-' + sequence; };
        function key(domain, target) { return JSON.stringify([domain, target.type, target.projectId]); }
        function emit(session, kind) { listeners.forEach(function (fn) { try { fn(session, kind); } catch (_) { /* subscribers cannot corrupt ownership */ } }); }
        function make(domain, target, record, initial) {
            function validCanonical(value) {
                if(!value)return;
                // Do not dispatch on a caller-controlled property until descriptors are safe.
                assertJson(value);
                if(value.schemaVersion!==1){var check=options.validate(value);if(!check.ok)throw Error(check.errors.join(' / '));}
            }
            validCanonical(record.snapshot);validCanonical(initial);
            target = snapshot(target);
            var sessionId = id(), generation = 0, base = snapshot(record.snapshot || initial), revision = record.revision;
            var exists = record.exists, deleted = false, destroyed = false, closing = false, pending = null, conflict = null, inputPending = false;
            var validation = freeze({ ok: true, errors: [], warnings: [] }), commitError = record.error || null, flight = null, commitSequence = 0;
            var tracker, changeSerial = 0;
            var history = { epoch: 0, entries: [], cursor: 0, bytes: 0, status: 'empty', reason: null, evicted: 0 };
            var openGroup = null, operationSequence = 0, entrySequence = 0;
            var textGroup = null, textInvocation = false, compositionText = false;
            function finishTextGroup() { textGroup = null; return { ok: true }; }
            function abandonGroup() { if (openGroup) openGroup.tracker.detach(); openGroup = null; }
            function resetHistory(reason, status) {
                abandonGroup(); finishTextGroup(); history.epoch++; history.entries = []; history.cursor = history.bytes = 0;
                history.status = status || 'empty'; history.reason = reason; history.evicted = 0;
            }
            function changed(path, semantic) {
                changeSerial++;
                // Existing editors remain usable. Their real direct edits are a history barrier, not an operation.
                if (semantic && !METADATA.has(path[0]) && (history.entries.length || openGroup)) resetHistory('out-of-band', 'invalidated');
                emit(session, 'draft');
            }
            function resetDraft(value) {
                var next = createDraft(value, function () { return base; }, changed);
                if (tracker) tracker.detach(); tracker = next;
            }
            function dirty() { return !exists || tracker.dirty(); }
            function historyBlocked() { return destroyed ? 'destroyed' : closing ? 'closing' : inputPending ? 'input-pending' : deleted ? 'deleted' : null; }
            function reject(code) { return { ok: false, code: code }; }
            function prepareContent(content, validatedValue, validatedCheck) {
                try {
                    var value = validatedValue || restoreContent(content, tracker.raw), check = snapshot(validatedCheck || options.validate(value));
                    if (!check.ok) return { ok: false, code: 'validation', error: (check.errors || []).join(' / ') };
                    var next = createDraft(value, function () { return base; }, changed, true); next.rebase();
                    return { ok: true, tracker: next, validation: check };
                } catch (error) { return { ok: false, code: 'validation', error: error.message || String(error) }; }
            }
            function publishContent(prepared, kind) {
                tracker.detach(); tracker = prepared.tracker; changeSerial++;
                // Saved/base/conflict and metadata are deliberately not touched here.
                validation = prepared.validation; textInvocation = compositionText = false; emit(session, kind);
            }
            function expected(entry, side) {
                return tracker.raw.projectId === target.projectId && tracker.raw.schemaVersion === base.schemaVersion &&
                    entry.epoch === history.epoch && entry.sessionId === sessionId && equal(contentSnapshot(tracker.raw), entry[side]);
            }
            function moveHistory(direction) {
                var blocked = historyBlocked();
                if (blocked || flight || openGroup) return reject(blocked || 'busy');
                finishTextGroup();
                var index = direction < 0 ? history.cursor - 1 : history.cursor, entry = history.entries[index];
                if (!entry) return reject('empty-history');
                if (!expected(entry, direction < 0 ? 'after' : 'before')) {
                    tracker.rebase(); changeSerial++;
                    resetHistory('stale-history', 'invalidated'); emit(session, 'history-invalidated'); return reject('stale-history');
                }
                var prepared = prepareContent(direction < 0 ? entry.before : entry.after);
                if (!prepared.ok) return prepared;
                history.cursor += direction;
                publishContent(prepared, direction < 0 ? 'undo' : 'redo');
                return { ok: true, entryId: entry.entryId };
            }
            function validIncoming(update) {
                return update.target && key(domain, update.target) === key(domain, target) &&
                    (update.deleted || (update.snapshot && update.snapshot.projectId === target.projectId && typeof update.revision === 'string'));
            }
            function adopt(update, kind) {
                validCanonical(update.snapshot);
                resetHistory(kind || 'adopt');
                generation++; changeSerial++; base = snapshot(update.snapshot); revision = update.revision; exists = true; deleted = false;
                resetDraft(base); pending = conflict = commitError = null;
                validation = freeze({ ok: true, errors: [], warnings: [] }); emit(session, kind || 'adopt');
            }
            function applyExternal(update, holdBase) {
                if (destroyed || !validIncoming(update)) return false;
                if (flight && update.sessionId === sessionId && update.commitId === flight.token.commitId) return true;
                if (!update.deleted && update.revision === revision) return true;
                try { validCanonical(update.snapshot); } catch (_) { return false; }
                var incoming = snapshot(update);
                if (holdBase || update.deleted || dirty() || flight || inputPending || openGroup) {
                    pending = incoming; deleted = !!update.deleted;
                    if (deleted) finishTextGroup();
                    conflict = freeze({ incomingRevision: update.revision, incomingSnapshot: incoming.snapshot || null, source: update.source, deleted: deleted });
                    emit(session, 'external-pending');
                } else adopt(incoming, 'external-adopt');
                return true;
            }
            function cancelNow() {
                if (destroyed) return { ok: false, error: 'Session destroyed' };
                if (inputPending) return { ok: false, code: 'input-pending', error: '入力の確定を待ってください' };
                if (pending) {
                    // Re-read confirmed repository state rather than accepting a delayed notification.
                    var latest = repository.read(target);
                    if (!latest.ok) return { ok: false, error: latest.error };
                    if (!latest.exists) return { ok: false, error: '削除された対象のdraftを保持しています', code: 'deleted' };
                    adopt(Object.assign({}, latest, { target: target }), 'cancel');
                } else { resetHistory('cancel'); generation++; changeSerial++; resetDraft(base); commitError = null; emit(session, 'cancel'); }
                return { ok: true };
            }
            var session = {};
            Object.defineProperties(session, {
                sessionId: { value: sessionId, enumerable: true }, domain: { value: domain, enumerable: true }, target: { value: snapshot(target), enumerable: true },
                baseRevision: { get: function () { return revision; }, enumerable: true }, baseSnapshot: { get: function () { return base; }, enumerable: true },
                draft: { get: function () { return tracker.draft; }, enumerable: true }, dirty: { get: dirty, enumerable: true },
                validation: { get: function () { return validation; }, enumerable: true }, externalUpdatePending: { get: function () { return !!pending; }, enumerable: true },
                conflict: { get: function () { return conflict; }, enumerable: true }, generation: { get: function () { return generation; }, enumerable: true },
                commitId: { get: function () { return flight ? flight.token.commitId : null; }, enumerable: true },
                commitInFlight: { get: function () { return !!flight; }, enumerable: true }, commitError: { get: function () { return commitError; }, enumerable: true },
                snapshotVersion: { get: function () { return sessionId + ':' + generation + ':' + changeSerial; }, enumerable: true },
                destroyed: { get: function () { return destroyed; }, enumerable: true },
                inputPending: { get: function () { return inputPending; }, enumerable: true }
            });
            Object.assign(session, {
                canCommit: function () { return !destroyed && !closing && !flight && !deleted && !pending && !inputPending && !openGroup && repository.canWrite(); },
                getHistory: function () {
                    return Object.freeze({ epoch: history.epoch, entries: Object.freeze(history.entries.slice()), cursor: history.cursor,
                        openGroup: openGroup ? openGroup.handle.operationId : null,
                        textGroup: textGroup ? Object.freeze({ key: textGroup.key, entryId: textGroup.entryId }) : null, bytes: history.bytes, limits: limits,
                        status: history.status, reason: history.reason, evictedCount: history.evicted });
                },
                beginOperation: function (label, policy) {
                    var previousTextGroup=textGroup;
                    if (!textInvocation) finishTextGroup();
                    var blocked = historyBlocked();
                    if (compositionText && blocked === 'input-pending') blocked = deleted ? 'deleted' : null;
                    if (blocked || openGroup) return reject(blocked || 'busy');
                    try {
                        var check = options.validate(tracker.raw); if (!check.ok) return {ok:false,code:'validation',error:check.errors.join(' / ')};
                        if (tracker.raw.projectId !== target.projectId || tracker.raw.schemaVersion !== base.schemaVersion) return reject('invalid-target');
                        var staged = createDraft(tracker.raw, function () { return base; }, function () {}, true);
                        var fixed = {}; HISTORY_FIXED.forEach(function(key){ fixed[key] = tracker.raw[key]; });
                        if (tracker.raw.schemaVersion === 2) fixed.provenance = {legacySource:tracker.raw.provenance.legacySource};
                        var handle = Object.freeze({ operationId: sessionId + ':operation-' + (++operationSequence), sessionId: sessionId,
                            historyEpoch: history.epoch, contentVersion: session.snapshotVersion, draft: staged.draft });
                        openGroup = { handle: handle, tracker: staged, before: contentSnapshot(tracker.raw, true), fixed: fixed, label: String(label || '編集').slice(0, 120), requireUndo: !!(policy && policy.requireUndo) || tracker.raw.schemaVersion === 2, previousTextGroup:previousTextGroup };
                        return { ok: true, operation: handle };
                    } catch (error) { return { ok: false, code: 'operation-failed', error: error.message || String(error) }; }
                },
                commitOperation: function (handle) {
                    if (!openGroup || openGroup.handle !== handle) return reject('invalid-operation');
                    var group = openGroup, blocked = historyBlocked();
                    if (compositionText && blocked === 'input-pending') blocked = deleted ? 'deleted' : null;
                    if (blocked) return reject(blocked);
                    if (handle.contentVersion !== session.snapshotVersion || handle.historyEpoch !== history.epoch) return reject('stale-operation');
                    // Final content check also catches drift that bypassed a Proxy notification.
                    if (tracker.raw.projectId !== target.projectId || tracker.raw.schemaVersion !== base.schemaVersion || !equal(contentSnapshot(tracker.raw), group.before)) {
                        tracker.rebase(); changeSerial++;
                        resetHistory('stale-operation', 'invalidated'); emit(session, 'history-invalidated'); return reject('stale-operation');
                    }
                    // Safety first; then protected identity/source; domain validation last.
                    // Descriptor-only JSON preflight never reads getters or calls toJSON.
                    try { assertJson(group.tracker.raw); }
                    catch(error){return {ok:false,code:'validation',error:error.message};}
                    var originalCheck;
                    if (Array.from(HISTORY_FIXED).some(function (key) { return !equal(group.tracker.raw[key], group.fixed[key]); })) return reject('protected-field');
                    if(tracker.raw.schemaVersion === 2 && !equal(group.tracker.raw.provenance && group.tracker.raw.provenance.legacySource, group.fixed.provenance && group.fixed.provenance.legacySource)) return reject('protected-legacy-source');
                    var after;
                    try {
                        originalCheck=options.validate(group.tracker.raw);
                        if(!originalCheck.ok)return {ok:false,code:'validation',error:originalCheck.errors.join(' / ')};
                        after=contentSnapshot(group.tracker.raw, true);
                    } catch(error){return {ok:false,code:'validation',error:error.message};}
                    if (equal(group.before, after)) { abandonGroup(); return { ok: true, recorded: false }; }
                    var prepared = prepareContent(after, group.tracker.raw, originalCheck); if (!prepared.ok) return prepared;
                    var merging = textInvocation && textGroup && textGroup.entryId && history.cursor === history.entries.length &&
                        history.entries.length && history.entries[history.cursor - 1].entryId === textGroup.entryId;
                    var before = merging ? history.entries[history.cursor - 1].before : group.before;
                    var bytes = byteSize(before) + byteSize(after);
                    if(group.requireUndo && bytes > limits.maxBytes) return reject('undo-budget');
                    abandonGroup();
                    if (bytes > limits.maxBytes) {
                        resetHistory('operation-too-large', 'overflow');
                        publishContent(prepared, 'operation'); return { ok: true, recorded: false, code: 'history-overflow' };
                    }
                    history.entries = history.entries.slice(0, history.cursor);
                    var entryId = merging ? history.entries.pop().entryId : sessionId + ':history-' + (++entrySequence);
                    var netChange = !equal(before, after);
                    if (netChange) history.entries.push(Object.freeze({ entryId: entryId, sessionId: sessionId,
                        epoch: history.epoch, label: group.label, before: before, after: after, bytes: bytes }));
                    if (textInvocation && textGroup) textGroup.entryId = netChange ? entryId : null;
                    history.bytes = history.entries.reduce(function (sum, entry) { return sum + entry.bytes; }, 0);
                    history.cursor = history.entries.length;
                    while (history.entries.length > limits.maxEntries || history.bytes > limits.maxBytes) {
                        history.bytes -= history.entries.shift().bytes; history.cursor--; history.evicted++;
                    }
                    history.status = history.entries.length ? 'ready' : 'empty'; history.reason = null;
                    publishContent(prepared, 'operation'); return { ok: true, recorded: netChange };
                },
                cancelOperation: function (handle) {
                    if (!openGroup || openGroup.handle !== handle) return reject('invalid-operation');
                    var group=openGroup;abandonGroup();if(group.requireUndo)textGroup=group.previousTextGroup;return { ok: true };
                },
                runOperation: function (label, edit, policy) {
                    var begun = session.beginOperation(label, policy); if (!begun.ok) return begun;
                    try {
                        var result = edit(begun.operation.draft);
                        if (result && typeof result.then === 'function') {
                            session.cancelOperation(begun.operation);
                            Promise.resolve(result).catch(function () {}); // reject unsupported async, contain its detached late failure
                            return reject('async-operation');
                        }
                        var committed = session.commitOperation(begun.operation);
                        if (!committed.ok) session.cancelOperation(begun.operation);
                        return committed;
                    } catch (error) {
                        session.cancelOperation(begun.operation); return { ok: false, code: 'operation-failed', error: error.message || String(error) };
                    }
                },
                // Each text update is a validated synchronous publication; only the Core coalesces entries.
                runTextOperation: function (key, label, edit) {
                    var blocked = historyBlocked();
                    if (compositionText && blocked === 'input-pending') blocked = deleted ? 'deleted' : null;
                    if (blocked || openGroup || textInvocation) return reject(blocked || 'busy');
                    if (typeof key !== 'string' || !key || key.length > 1024) return reject('invalid-text-target');
                    if (textGroup && textGroup.entryId) {
                        var last = history.entries[history.cursor - 1];
                        if (!last || last.entryId !== textGroup.entryId || !expected(last, 'after')) {
                            tracker.rebase(); changeSerial++; resetHistory('stale-text', 'invalidated');
                            emit(session, 'history-invalidated'); return reject('stale-history');
                        }
                    }
                    if (!textGroup || textGroup.key !== key) textGroup = { key: key, entryId: null };
                    textInvocation = true;
                    try { return session.runOperation(label, edit); }
                    finally { textInvocation = false; }
                },
                runCompositionTextOperation: function (key, label, edit) {
                    if (!inputPending || compositionText) return reject('invalid-composition');
                    compositionText = true;
                    try { return session.runTextOperation(key, label, edit); }
                    finally { compositionText = false; finishTextGroup(); }
                },
                finishTextGroup: finishTextGroup,
                undo: function () { return moveHistory(-1); }, redo: function () { return moveHistory(1); },
                canUndo: function () { return !historyBlocked() && !flight && !openGroup && history.cursor > 0; },
                canRedo: function () { return !historyBlocked() && !flight && !openGroup && history.cursor < history.entries.length; },
                clearHistory: function () {
                    if (destroyed) return reject('destroyed');
                    if (openGroup) return reject('busy');
                    resetHistory('explicit-clear'); emit(session, 'history-cleared'); return { ok: true };
                },
                setInputPending: function (value) { if (!destroyed && inputPending !== !!value) { if (value) finishTextGroup(); inputPending = !!value; emit(session, 'input'); } },
                workingSnapshot: function () { return snapshot(tracker.raw); },
                playbackSnapshot: function () { return snapshot(tracker.raw); },
                applyExternalSnapshot: applyExternal,
                keepDraft: function () { return conflict; }, // no base advancement or stale overwrite permission
                adoptExternal: function () { return flight ? Promise.resolve({ ok: false, code: 'busy' }) : Promise.resolve(cancelNow()); },
                replaceDraft: function (value) {
                    if (destroyed || flight || inputPending) throw new Error('Cannot replace this draft');
                    validCanonical(value);
                    if (!value || value.projectId !== target.projectId) throw new Error('Cannot replace this draft');
                    resetHistory('replace'); generation++; changeSerial++; resetDraft(value); tracker.rebase(); emit(session, 'replace');
                },
                commit: function () {
                    if (!inputPending) finishTextGroup();
                    if (!session.canCommit()) return Promise.resolve({ ok: false, code: deleted ? 'deleted' : pending ? 'conflict' : 'unavailable', error: '現在は保存できません' });
                    var fixed;
                    try {
                        assertJson(tracker.raw);
                        if(tracker.raw.schemaVersion===2 && !equal(tracker.raw.provenance && tracker.raw.provenance.legacySource,base.provenance && base.provenance.legacySource)) return Promise.resolve({ok:false,code:'protected-legacy-source'});
                        validation = snapshot(options.validate(tracker.raw));if(validation.ok)fixed=snapshot(tracker.raw);
                    }
                    catch (error) { validation = freeze({ ok: false, errors: [error.message || String(error)], warnings: [] }); }
                    if (!validation.ok) { commitError = '検証エラー: ' + validation.errors.join(' / '); emit(session, 'validation'); return Promise.resolve({ ok: false, code: 'validation', error: commitError }); }
                    var token = freeze({ sessionId: sessionId, commitId: sessionId + ':commit-' + (++commitSequence), generation: generation });
                    var current = { token: token, fixed: fixed, baseRevision: revision, promise: null };
                    flight = current; commitError = null; emit(session, 'commit-start');
                    current.promise = Promise.resolve().then(function () {
                        return repository.save({ target: target, snapshot: fixed, baseRevision: current.baseRevision, token: token });
                    }).then(function (result) {
                        if (destroyed || flight !== current || generation !== token.generation) return { ok: false, code: 'stale-result' };
                        if (result.ok && (result.sessionId !== token.sessionId || result.commitId !== token.commitId || result.generation !== token.generation)) result = { ok: false, code: 'stale-result', error: '保存結果のsessionが一致しません' };
                        if (result.ok && (!result.snapshot || result.snapshot.projectId !== target.projectId || typeof result.revision !== 'string')) result = { ok: false, code: 'invalid-result', error: '保存結果の対象が一致しません' };
                        flight = null; finishTextGroup();
                        if (result.ok) {
                            base = snapshot(result.snapshot); revision = result.revision; exists = true;
                            tracker.raw.updatedAt = base.updatedAt; tracker.raw.appVersion = base.appVersion;
                            tracker.rebase(); changeSerial++; commitError = null;
                            var incoming = pending;
                            if (incoming && incoming.revision === revision && !incoming.deleted) pending = conflict = null;
                            else if (incoming) { pending = null; applyExternal(incoming); }
                            emit(session, 'commit-success');
                        } else {
                            commitError = result.error || '保存に失敗しました';
                            // A failed/unknown write is not formal base adoption, even if draft was clean.
                            if (result.current && result.current.ok) applyExternal(Object.assign({}, result.current, { target: target, deleted: !result.current.exists, source: 'repository' }), true);
                            emit(session, 'commit-failure');
                        }
                        return result;
                    }).catch(function (error) {
                        if (flight === current) { flight = null; finishTextGroup(); commitError = error.message || String(error); emit(session, 'commit-failure'); }
                        return { ok: false, error: error.message || String(error) };
                    });
                    return current.promise;
                },
                cancel: function () {
                    if (!flight) return Promise.resolve(cancelNow());
                    closing = true;
                    return flight.promise.then(function (result) { return result.ok ? cancelNow() : { ok: false, error: '保存結果が失敗または不明のためdraftを保持しています' }; }).finally(function () { closing = false; });
                },
                destroy: function (config) {
                    if (destroyed) return Promise.resolve({ ok: true });
                    var wait = flight ? flight.promise : Promise.resolve({ ok: true }); closing = true;
                    return wait.then(function (result) {
                        if (inputPending || !result.ok || ((dirty() || openGroup) && !(config && config.discard))) return { ok: false, error: '未保存draftまたは保存結果を解決してください' };
                        resetHistory('destroy'); destroyed = true; generation++; tracker.detach(); sessions.delete(sessionId); byTarget.delete(key(domain, target));
                        if (active === sessionId) active = null; emit(session, 'destroy'); return { ok: true };
                    }).finally(function () { closing = false; });
                }
            });
            resetDraft(record.snapshot || initial); if (initial && record.snapshot) { resetDraft(initial); tracker.rebase(); }
            return Object.freeze(session);
        }
        var unsubscribe = repository.subscribe(function (update) { sessions.forEach(function (session) { session.applyExternalSnapshot(update); }); });
        return Object.freeze({
            getOrCreateSession: function (domain, target, initialDraft) {
                var k = key(domain, target), found = byTarget.get(k); if (found) return sessions.get(found);
                var record = repository.read(target);
                // A new/imported draft can remain in memory when storage is unavailable.
                // Saving still re-reads under the repository lock and never assumes the target is absent.
                if (!record.ok && initialDraft) record = { ok: true, exists: false, revision: null, snapshot: null, error: record.error };
                if (!record.ok || (!record.exists && !initialDraft)) throw new Error(record.error || 'Project not found');
                var session = make(domain, target, record, initialDraft);
                sessions.set(session.sessionId, session); byTarget.set(k, session.sessionId); return session;
            },
            getSession: function (domain, target) { return sessions.get(byTarget.get(key(domain, target))) || null; },
            listSessions: function () { return Array.from(sessions.values()); },
            getActiveSession: function () { return sessions.get(active) || null; },
            activateSession: function (session) { if (session && sessions.get(session.sessionId) !== session) throw new Error('Unknown session'); var previous = sessions.get(active); if (previous && previous !== session) previous.finishTextGroup(); active = session ? session.sessionId : null; },
            deactivateSession: function () { var previous = sessions.get(active); if (previous) previous.finishTextGroup(); /* retains active document */ },
            destroySession: function (session, config) { return session.destroy(config); },
            applyExternalSnapshot: function (update) { sessions.forEach(function (session) { session.applyExternalSnapshot(update); }); },
            subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
            dispose: function () { unsubscribe(); listeners.clear(); } // does not pretend dirty documents were cancelled
        });
    }
    return Object.freeze({ createRegistry: createRegistry, snapshot: snapshot, equal: equal, HISTORY_LIMITS: HISTORY_LIMITS });
});
