/* Studio projects only. Exact payload revisions; one lock protects project + collection index. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.projectRepository = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';
    var PROJECT = 'cruiseStudio.project.', INDEX = 'cruiseStudio.projects.index', LOCK = 'cruiseStudio.projects.write';
    function createRepository(options) {
        var listeners = new Set(), attached = false;
        function targetValid(target) { return target && target.type === 'project' && typeof target.projectId === 'string' && !!target.projectId; }
        function read(target) {
            if (!targetValid(target)) return { ok: false, error: '不正なproject参照です' };
            try {
                var raw = options.storage.getItem(PROJECT + target.projectId);
                if (raw === null) return { ok: true, exists: false, revision: null, snapshot: null };
                var result = options.model.migrateProject(JSON.parse(raw));
                if (!result.ok || result.project.projectId !== target.projectId) return { ok: false, error: result.error || 'projectIdが一致しません' };
                var check = options.model.validateProject(result.project);
                if (!check.ok) return { ok: false, error: check.errors.join(' / ') };
                return { ok: true, exists: true, revision: raw, snapshot: options.snapshot(result.project) };
            } catch (error) { return { ok: false, error: '読込に失敗しました: ' + error.message }; }
        }
        function notify(target, source, token) {
            var latest = read(target); if (!latest.ok) return;
            var update = Object.assign({}, latest, token || {}, { target: target, source: source, deleted: !latest.exists });
            listeners.forEach(function (fn) { try { fn(update); } catch (_) { /* preserve committed writes */ } });
        }
        function underLock(action) {
            if (!options.storage) return Promise.resolve({ ok: false, code: 'storage-unavailable', error: '保存領域へアクセスできません。draftを保持しています。' });
            if (!options.locks || typeof options.locks.request !== 'function') return Promise.resolve({ ok: false, code: 'locks-unavailable', error: 'この環境では安全な保存に必要なWeb Locksが利用できません。対応ブラウザで開いてください。' });
            return Promise.resolve().then(function () { return options.locks.request(LOCK, { mode: 'exclusive' }, action); })
                .catch(function (error) { return { ok: false, error: error.message }; });
        }
        function writeTransaction(entries) {
            var before = entries.map(function (entry) { return [entry[0], options.storage.getItem(entry[0])]; });
            try {
                entries.forEach(function (entry) { if (entry[1] === null) options.storage.removeItem(entry[0]); else options.storage.setItem(entry[0], entry[1]); });
                return { ok: true };
            } catch (error) {
                var restored = true;
                // Revert only keys this transaction touched; no automatic successful-write cancellation.
                before.forEach(function (entry) { try { if (entry[1] === null) options.storage.removeItem(entry[0]); else options.storage.setItem(entry[0], entry[1]); } catch (_) { restored = false; } });
                return { ok: false, code: restored ? 'storage-failure' : 'result-unknown', error: '保存に失敗しました' + (restored ? ': ' : '（復旧結果の確認が必要です）: ') + error.message };
            }
        }
        function index() {
            var raw = options.storage.getItem(INDEX);
            if (raw === null) return [];
            var value = JSON.parse(raw);
            if (!Array.isArray(value)) throw new Error('保存一覧が破損しています');
            return value;
        }
        function save(request) {
            var token = request.token || {};
            return underLock(function () {
                var current = read(request.target);
                if (!current.ok) return current;
                if (current.revision !== request.baseRevision) return { ok: false, code: current.exists ? 'conflict' : 'deleted', error: '保存済みprojectが更新または削除されています。draftを保持しました。', current: current };
                var project = JSON.parse(JSON.stringify(request.snapshot));
                if (project.projectId !== request.target.projectId) return { ok: false, error: '保存対象のprojectIdが一致しません' };
                var check = options.model.validateProject(project);
                if (!check.ok) return { ok: false, code: 'validation', error: check.errors.join(' / ') };
                project.updatedAt = options.now(); project.appVersion = options.model.APP_VERSION;
                try {
                    var list = index().filter(function (entry) { return entry && entry.projectId !== project.projectId; });
                    list.unshift({ projectId: project.projectId, title: project.songInfo.title || '無題', artist: project.songInfo.artist || '', updatedAt: project.updatedAt });
                    var raw = JSON.stringify(project), result = writeTransaction([[PROJECT + project.projectId, raw], [INDEX, JSON.stringify(list)]]);
                    if (!result.ok) { result.current = read(request.target); return result; }
                    notify(request.target, 'same-studio', token);
                    return Object.assign({ ok: true, snapshot: options.snapshot(project), revision: raw }, token);
                } catch (error) { return { ok: false, error: '保存に失敗しました: ' + error.message }; }
            });
        }
        function remove(target, baseRevision) {
            return underLock(function () {
                var current = read(target);
                if (!current.ok) return current;
                if (current.revision !== baseRevision) return { ok: false, code: 'conflict', error: '削除対象が更新されています。もう一度確認してください。' };
                try {
                    var list = index().filter(function (entry) { return entry && entry.projectId !== target.projectId; });
                    var result = writeTransaction([[PROJECT + target.projectId, null], [INDEX, JSON.stringify(list)]]);
                    if (result.ok) notify(target, 'same-studio'); return result;
                } catch (error) { return { ok: false, error: error.message }; }
            });
        }
        function onStorage(event) {
            // Read current state, never trust a possibly delayed event.newValue as the latest revision.
            if (event.storageArea !== options.storage) return;
            if (event.key && event.key.startsWith(PROJECT)) notify({ type: 'project', projectId: event.key.slice(PROJECT.length) }, 'other-tab');
            else if (event.key === null && options.knownTargets) options.knownTargets().forEach(function (target) { notify(target, 'other-tab'); });
        }
        return Object.freeze({
            read: read, save: save, remove: remove,
            canWrite: function () { return !!(options.storage && options.locks && typeof options.locks.request === 'function'); },
            subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
            attach: function () { if (!attached && options.events) { options.events.addEventListener('storage', onStorage); attached = true; } },
            dispose: function () { if (attached) options.events.removeEventListener('storage', onStorage); attached = false; listeners.clear(); }
        });
    }
    return Object.freeze({ createRepository: createRepository, LOCK: LOCK });
});
