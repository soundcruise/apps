/* クルーズスタジオ — app.js（Phase 2A）
   起動と既存Homeパネル。Shellのhost / layoutは js/shell.js が所有する。
   譜面クルーズのUIロジックは js/modules/sheet-cruise/sheet-cruise.js。 */
(function () {
    'use strict';

    var CS = window.CruiseStudio || {};
    var model = CS.model;
    var storage = CS.storage;
    var sheetCruise = CS.sheetCruise;
    var preDtm = CS.preDtm;

    // Project sessions survive workspace and project selection changes.
    var shellHost;
    var projectStorage = null;
    try { projectStorage = window.localStorage; } catch (_) { /* repository reports unavailable storage */ }
    CS.repository = CS.projectRepository.createRepository({ storage: projectStorage, model: model,
        snapshot: CS.editing.snapshot, locks: navigator.locks, events: window,
        now: function () { return new Date().toISOString(); },
        knownTargets: function () { return CS.sessions ? CS.sessions.listSessions().map(function (session) { return session.target; }) : []; }
    });
    CS.sessions = CS.editing.createRegistry({ repository: CS.repository, validate: model.validateProject });
    CS.repository.attach();
    function workingSource(projectId) {
        var session = CS.sessions.getActiveSession();
        if (!session || session.domain !== 'structure' || session.target.projectId !== projectId) return null;
        return { ok: true, project: session.workingSnapshot(), source: 'working', dirty: session.dirty,
            version: session.snapshotVersion, sessionId: session.sessionId };
    }
    function projectSource(projectId) {
        var working = workingSource(projectId);
        if (working) return working;
        var saved = CS.repository.read({ type: 'project', projectId: projectId });
        return saved.ok && saved.exists ? { ok: true, project: saved.snapshot, source: 'saved', dirty: false, version: saved.revision } :
            { ok: false, error: saved.error || 'プロジェクトが見つかりません' };
    }

    // 既存hostはwindow。ShellはworkspaceごとにMain要素を注入できる。
    // wheel/listenerの所有は変えず、明示scrollだけをこの入口へ集約する。
    var scrollRoots = Object.create(null);
    function getScrollRoot(workspace) {
        return scrollRoots[workspace] || window;
    }
    CS.scroll = {
        getRoot: getScrollRoot,
        setRoot: function (workspace, root) {
            if (root && (typeof root.scrollTo !== 'function' || typeof root.scrollBy !== 'function')) {
                throw new TypeError('scroll rootにはscrollTo / scrollByが必要です');
            }
            if (root) scrollRoots[workspace] = root;
            else delete scrollRoots[workspace];
        },
        scrollToTop: function (workspace) { getScrollRoot(workspace).scrollTo(0, 0); },
        scrollBy: function (workspace, options) { getScrollRoot(workspace).scrollBy(options); },
        getPosition: function (workspace) {
            var root = getScrollRoot(workspace);
            return root === window ? { x: window.scrollX, y: window.scrollY } :
                { x: root.scrollLeft, y: root.scrollTop };
        },
        restorePosition: function (workspace, position) {
            getScrollRoot(workspace).scrollTo(position.x, position.y);
        },
        getViewportTop: function (workspace) {
            var root = getScrollRoot(workspace);
            return root === window ? 0 : root.getBoundingClientRect().top + root.clientTop;
        }
    };

    // Shell navigation retains workspace drafts. Explicit project changes remain module-owned.
    function enterSheetCruise() { shellHost.navigate('sheetCruise'); }
    function enterPreDtm() { shellHost.navigate('preDtm'); }
    function enterSeries() { shellHost.navigate('series'); }
    function goHome() { shellHost.navigate('home'); }

    /* ══════════ 開発用: 保存基盤の動作確認パネル ══════════ */

    var statusEl = document.getElementById('dev-status');
    var listEl = document.getElementById('dev-project-list');

    function setStatus(message, isError) {
        if (!statusEl) return;
        statusEl.textContent = message || '';
        statusEl.classList.toggle('is-error', !!isError);
    }

    function formatDate(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        function pad(n) { return String(n).padStart(2, '0'); }
        return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) +
            ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function downloadProjectJson(project) {
        var json = storage.exportProjectJson(project);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var title = (project.songInfo && project.songInfo.title) || 'project';
        a.href = url;
        a.download = 'cruise-studio_' + title.replace(/[\\/:*?"<>|\s]+/g, '_') + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function renderProjectList() {
        if (!listEl) return;
        var projects = storage.listProjects();
        listEl.innerHTML = '';
        if (projects.length === 0) {
            var empty = document.createElement('li');
            empty.innerHTML = '<span class="dev-project-meta">保存済みプロジェクトはありません</span>';
            listEl.appendChild(empty);
            return;
        }
        projects.forEach(function (meta) {
            var li = document.createElement('li');

            var title = document.createElement('span');
            title.className = 'dev-project-title';
            title.textContent = meta.title + (meta.artist ? ' / ' + meta.artist : '');

            var info = document.createElement('span');
            info.className = 'dev-project-meta';
            info.textContent = formatDate(meta.updatedAt) + '  (' + meta.projectId + ')';

            var actions = document.createElement('span');
            actions.className = 'dev-project-actions';

            var exportBtn = document.createElement('button');
            exportBtn.type = 'button';
            exportBtn.className = 'btn-mini';
            exportBtn.textContent = 'JSON書き出し';
            exportBtn.addEventListener('click', function () {
                var res = storage.loadProject(meta.projectId);
                if (!res.ok) { setStatus(res.error, true); return; }
                downloadProjectJson(res.project);
                setStatus('「' + meta.title + '」をJSONファイルに書き出しました');
            });

            var deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn-mini btn-danger';
            deleteBtn.textContent = '削除';
            deleteBtn.addEventListener('click', async function () {
                if (!window.confirm('「' + meta.title + '」を削除しますか？')) return;
                var target = { type: 'project', projectId: meta.projectId };
                var before = CS.repository.read(target);
                if (!before.ok) { setStatus(before.error, true); return; }
                var res = await CS.repository.remove(target, before.revision);
                if (!res.ok) { setStatus(res.error, true); return; }
                if (storage.getCurrentProjectId() === meta.projectId) storage.setCurrentProjectId(null);
                setStatus('「' + meta.title + '」を削除しました');
                renderProjectList();
            });

            actions.appendChild(exportBtn);
            actions.appendChild(deleteBtn);
            li.appendChild(title);
            li.appendChild(info);
            li.appendChild(actions);
            listEl.appendChild(li);
        });
    }

    async function onCreateSample() {
        var project = model.createSampleProject();
        var check = model.validateProject(project);
        if (!check.ok) {
            setStatus('サンプル生成の検証エラー: ' + check.errors.join(' / '), true);
            return;
        }
        var res = await CS.repository.save({ target: { type: 'project', projectId: project.projectId }, snapshot: project, baseRevision: null });
        if (res.ok) storage.setCurrentProjectId(project.projectId);
        if (!res.ok) {
            setStatus(res.error, true);
            return;
        }
        var warnText = check.warnings.length ? '（警告: ' + check.warnings.join(' / ') + '）' : '';
        setStatus('サンプル曲「' + project.songInfo.title + '」を保存しました ' + warnText);
        renderProjectList();
    }

    function onImportFile(event) {
        var file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        var reader = new FileReader();
        reader.onload = async function () {
            var res = storage.importProjectJson(String(reader.result));
            if (!res.ok) {
                setStatus(res.error, true);
                return;
            }
            var target = { type: 'project', projectId: res.project.projectId };
            var before = CS.repository.read(target);
            if (!before.ok) { setStatus(before.error, true); return; }
            var saved = await CS.repository.save({ target: target, snapshot: res.project, baseRevision: before.revision });
            if (saved.ok) storage.setCurrentProjectId(res.project.projectId);
            if (!saved.ok) {
                setStatus(saved.error, true);
                return;
            }
            var warnText = res.warnings.length ? '（警告: ' + res.warnings.join(' / ') + '）' : '';
            setStatus('「' + res.project.songInfo.title + '」を読み込んで保存しました ' + warnText);
            renderProjectList();
        };
        reader.onerror = function () {
            setStatus('ファイルの読み取りに失敗しました', true);
        };
        reader.readAsText(file);
    }

    // 起動時セルフチェック（保存はしない。コンソールで基盤の健全性を確認する）
    function selfCheck() {
        try {
            var sample = model.createSampleProject();
            var result = model.validateProject(sample);
            var theoryOk = CS.theory &&
                CS.theory.capoToOriginalKey('C', 2) === 'D' &&
                CS.theory.parseBasicChordSymbol('Am7/G') !== null;
            if (result.ok && theoryOk) {
                console.log('[Cruise Studio] v' + model.APP_VERSION + ' self-check OK' +
                    (result.warnings.length ? ' (warnings: ' + result.warnings.join(' / ') + ')' : ''));
            } else {
                console.warn('[Cruise Studio] self-check NG', result.errors, 'theoryOk=' + theoryOk);
            }
        } catch (e) {
            console.warn('[Cruise Studio] self-check failed', e);
        }
    }

    /* ══════════ 初期化 ══════════ */

    function init() {
        if (!model || !storage || !sheetCruise || !preDtm || !CS.arrangement || !CS.sheetRenderer) {
            setStatus('コアモジュールの読み込みに失敗しました（読み込み順を確認してください）', true);
            return;
        }
        var versionEl = document.getElementById('studio-version');
        if (versionEl) versionEl.textContent = 'v' + model.APP_VERSION;

        // モジュール間遷移用の公開API（モジュール同士の直接参照を避ける）
        CS.app = {
            openSheetCruise: enterSheetCruise,
            openPreDtm: enterPreDtm,
            goHome: goHome
        };

        // 画面遷移
        sheetCruise.init();
        preDtm.setProjectSourceProvider(projectSource);
        preDtm.init();
        shellHost = CS.shell.init(CS);
        CS.shellHost = shellHost;
        CS.audio = CS.audioCoordinator.createCoordinator();
        CS.metronomeMemoryStore = CS.metronomeStore.createMemoryStore({ schema: CS.metronomeSchema });
        CS.metronomeSettingsController = CS.metronomeSettings.createController({ schema: CS.metronomeSchema, store: CS.metronomeMemoryStore });
        CS.metronomeM1 = CS.metronome.createRuntime({ core: CS.metronomeCore, coordinator: CS.audio,
            feature: CS.metronomeMetadata, settingsSource: CS.metronomeSettingsController, environment: { windowObject: window, document: document, mediaDevices: navigator.mediaDevices } });
        CS.metronomeView = CS.metronome.mount({ runtime: CS.metronomeM1, shell: shellHost, document: document });
        CS.metronomeSettingsController.load();
        CS.chordInspector = CS.chordPresentation.mount({ document: document, window: window, selection: sheetCruise,
            adapter: CS.chordReadModel.createAdapter({ chordTheory: window.ChordCruise.theory, chordModel: window.ChordCruise.chordModel, studioTheory: CS.theory }) });
        CS.sessions.subscribe(function (session) {
            if (CS.sessions.getActiveSession() !== session) return;
            shellHost.setCommandTarget('editingSession', session);
            shellHost.setCommandTarget('activeDocument', session.target);
        });
        shellHost.commands.register({ id: 'studio.save', target: function (context) { return context.editingSession; },
            canExecute: function (context) { return context.activeWorkspaceId === 'sheetCruise' && !context.activeModal && context.target.canCommit(); },
            execute: function (context) { sheetCruise.commitSession(context.target); return { consumed: true }; }
        });
        shellHost.keyboard.bind({ scope: 'shell', commandId: 'studio.save', matches: function (key) {
            return key.primary && !key.alt && !key.shift && key.key.toLowerCase() === 's';
        } });
        var openSheetBtn = document.getElementById('open-sheet-cruise');
        if (openSheetBtn) openSheetBtn.addEventListener('click', enterSheetCruise);
        var openPreDtmBtn = document.getElementById('open-pre-dtm');
        if (openPreDtmBtn) openPreDtmBtn.addEventListener('click', enterPreDtm);
        Array.prototype.forEach.call(document.querySelectorAll('.js-open-series'), function (btn) {
            btn.addEventListener('click', enterSeries);
        });

        // 開発用パネル
        var createBtn = document.getElementById('dev-create-sample');
        if (createBtn) createBtn.addEventListener('click', onCreateSample);

        var refreshBtn = document.getElementById('dev-refresh-list');
        if (refreshBtn) refreshBtn.addEventListener('click', function () {
            renderProjectList();
            setStatus('一覧を更新しました');
        });

        var importInput = document.getElementById('dev-import-file');
        if (importInput) importInput.addEventListener('change', onImportFile);

        renderProjectList();
        selfCheck();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
