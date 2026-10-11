/* Domain-neutral editing ownership. JSON snapshots, observable draft, no DOM/storage/audio. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.editing = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';
    function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
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
    function createDraft(value, getBase, changed) {
        var raw = clone(value), touched = new Map(), proxies = new WeakMap(), originals = new WeakMap(), version = 0;
        function note(path) {
            if (!METADATA.has(path[0])) touched.set(JSON.stringify(path), path);
            version++; changed();
        }
        function wrap(object, path) {
            if (!object || typeof object !== 'object') return object;
            var byPath = proxies.get(object); if (!byPath) { byPath = new Map(); proxies.set(object, byPath); }
            var key = JSON.stringify(path); if (byPath.has(key)) return byPath.get(key);
            var proxy = new Proxy(object, {
                get: function (o, property) { return typeof property === 'symbol' ? o[property] : wrap(o[property], path.concat(property)); },
                set: function (o, property, incoming) {
                    var unwrapped = originals.get(incoming) || incoming;
                    if (o[property] === unwrapped) return true;
                    // Own assigned values: callers cannot mutate an untracked external alias later.
                    o[property] = unwrapped && typeof unwrapped === 'object' ? clone(unwrapped) : unwrapped;
                    note(path.concat(String(property))); return true;
                },
                deleteProperty: function (o, property) { if (Object.hasOwn(o, property)) { delete o[property]; note(path.concat(String(property))); } return true; }
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
        var id = options.idFactory || function () { sequence++; return 'session-' + sequence; };
        function key(domain, target) { return JSON.stringify([domain, target.type, target.projectId]); }
        function emit(session, kind) { listeners.forEach(function (fn) { try { fn(session, kind); } catch (_) { /* subscribers cannot corrupt ownership */ } }); }
        function make(domain, target, record, initial) {
            target = snapshot(target);
            var sessionId = id(), generation = 0, base = snapshot(record.snapshot || initial), revision = record.revision;
            var exists = record.exists, deleted = false, destroyed = false, closing = false, pending = null, conflict = null, inputPending = false;
            var validation = freeze({ ok: true, errors: [], warnings: [] }), commitError = record.error || null, flight = null, commitSequence = 0;
            var tracker, changeSerial = 0;
            function changed() { changeSerial++; emit(session, 'draft'); }
            function resetDraft(value) { if (tracker) tracker.detach(); tracker = createDraft(value, function () { return base; }, changed); }
            function dirty() { return !exists || tracker.dirty(); }
            function validIncoming(update) {
                return update.target && key(domain, update.target) === key(domain, target) &&
                    (update.deleted || (update.snapshot && update.snapshot.projectId === target.projectId && typeof update.revision === 'string'));
            }
            function adopt(update, kind) {
                generation++; changeSerial++; base = snapshot(update.snapshot); revision = update.revision; exists = true; deleted = false;
                resetDraft(base); pending = conflict = commitError = null;
                validation = freeze({ ok: true, errors: [], warnings: [] }); emit(session, kind || 'adopt');
            }
            function applyExternal(update) {
                if (destroyed || !validIncoming(update)) return false;
                if (flight && update.sessionId === sessionId && update.commitId === flight.token.commitId) return true;
                if (!update.deleted && update.revision === revision) return true;
                var incoming = snapshot(update);
                if (update.deleted || dirty() || flight || inputPending) {
                    pending = incoming; deleted = !!update.deleted;
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
                } else { generation++; resetDraft(base); commitError = null; emit(session, 'cancel'); }
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
                canCommit: function () { return !destroyed && !closing && !flight && !deleted && !pending && !inputPending && repository.canWrite(); },
                setInputPending: function (value) { if (!destroyed && inputPending !== !!value) { inputPending = !!value; emit(session, 'input'); } },
                workingSnapshot: function () { return snapshot(tracker.raw); },
                playbackSnapshot: function () { return snapshot(tracker.raw); },
                applyExternalSnapshot: applyExternal,
                keepDraft: function () { return conflict; }, // no base advancement or stale overwrite permission
                adoptExternal: function () { return flight ? Promise.resolve({ ok: false, code: 'busy' }) : Promise.resolve(cancelNow()); },
                replaceDraft: function (value) {
                    if (destroyed || flight || inputPending || value.projectId !== target.projectId) throw new Error('Cannot replace this draft');
                    generation++; resetDraft(value); tracker.rebase(); emit(session, 'replace');
                },
                commit: function () {
                    if (!session.canCommit()) return Promise.resolve({ ok: false, code: deleted ? 'deleted' : pending ? 'conflict' : 'unavailable', error: '現在は保存できません' });
                    var fixed = snapshot(tracker.raw);
                    try { validation = snapshot(options.validate(fixed)); }
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
                        flight = null;
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
                            if (result.current && result.current.ok) applyExternal(Object.assign({}, result.current, { target: target, deleted: !result.current.exists, source: 'repository' }));
                            emit(session, 'commit-failure');
                        }
                        return result;
                    }).catch(function (error) {
                        if (flight === current) { flight = null; commitError = error.message || String(error); emit(session, 'commit-failure'); }
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
                        if (inputPending || !result.ok || (dirty() && !(config && config.discard))) return { ok: false, error: '未保存draftまたは保存結果を解決してください' };
                        destroyed = true; generation++; tracker.detach(); sessions.delete(sessionId); byTarget.delete(key(domain, target));
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
            activateSession: function (session) { if (session && sessions.get(session.sessionId) !== session) throw new Error('Unknown session'); active = session ? session.sessionId : null; },
            deactivateSession: function () { /* workspace deactivation retains the active document/session reference */ },
            destroySession: function (session, config) { return session.destroy(config); },
            applyExternalSnapshot: function (update) { sessions.forEach(function (session) { session.applyExternalSnapshot(update); }); },
            subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
            dispose: function () { unsubscribe(); listeners.clear(); } // does not pretend dirty documents were cancelled
        });
    }
    return Object.freeze({ createRegistry: createRegistry, snapshot: snapshot, equal: equal });
});
