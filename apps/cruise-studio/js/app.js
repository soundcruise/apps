/* クルーズスタジオ — app.js（Phase 2A）
   母艦シェル: 画面遷移（home ⇄ 譜面クルーズ）・共通ナビ・開発用パネル。
   譜面クルーズのUIロジックは js/modules/sheet-cruise/sheet-cruise.js。 */
(function () {
    'use strict';

    var CS = window.CruiseStudio || {};
    var model = CS.model;
    var storage = CS.storage;
    var sheetCruise = CS.sheetCruise;
    var preDtm = CS.preDtm;

    /* ══════════ 画面遷移 ══════════
       「TOPは絶対復帰」「戻るは一階層戻る」「作業中は中断確認」
       （リズムクルーズ DESIGN_SYSTEM.md 5章の鉄則を継承）
       現状は全画面がTOP直下の深さ1のため、「戻る」もTOP復帰になる。 */

    var SCREENS = {
        home: 'screen-home',
        sheetCruise: 'screen-sheet-cruise',
        preDtm: 'screen-pre-dtm',
        series: 'screen-series'
    };
    var currentScreen = 'home';

    function showScreen(name) {
        if (!SCREENS[name]) return;
        Object.keys(SCREENS).forEach(function (key) {
            var el = document.getElementById(SCREENS[key]);
            if (el) el.classList.toggle('hidden', key !== name);
        });
        var nav = document.getElementById('app-nav');
        if (nav) nav.classList.toggle('hidden', name === 'home');
        currentScreen = name;
        window.scrollTo(0, 0);
    }

    /**
     * 現在の画面を離れてよいか。譜面クルーズだけは未保存の中断確認を持つ。
     */
    function canLeaveCurrentScreen() {
        if (currentScreen === 'sheetCruise' && sheetCruise && !sheetCruise.canLeave()) {
            return false;
        }
        return true;
    }

    function enterSheetCruise() {
        if (currentScreen !== 'sheetCruise' && !canLeaveCurrentScreen()) return;
        sheetCruise.enter();
        showScreen('sheetCruise');
    }

    function enterPreDtm() {
        if (!canLeaveCurrentScreen()) return;
        preDtm.enter();
        showScreen('preDtm');
    }

    function enterSeries() {
        if (!canLeaveCurrentScreen()) return;
        showScreen('series');
    }

    function goHome() {
        if (!canLeaveCurrentScreen()) return;
        showScreen('home');
    }

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
            deleteBtn.addEventListener('click', function () {
                if (!window.confirm('「' + meta.title + '」を削除しますか？')) return;
                var res = storage.deleteProject(meta.projectId);
                if (!res.ok) { setStatus(res.error, true); return; }
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

    function onCreateSample() {
        var project = model.createSampleProject();
        var check = model.validateProject(project);
        if (!check.ok) {
            setStatus('サンプル生成の検証エラー: ' + check.errors.join(' / '), true);
            return;
        }
        var res = storage.saveProject(project);
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
        reader.onload = function () {
            var res = storage.importProjectJson(String(reader.result));
            if (!res.ok) {
                setStatus(res.error, true);
                return;
            }
            var saved = storage.saveProject(res.project);
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
        if (!model || !storage || !sheetCruise || !preDtm || !CS.arrangement) {
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
        preDtm.init();
        var openSheetBtn = document.getElementById('open-sheet-cruise');
        if (openSheetBtn) openSheetBtn.addEventListener('click', enterSheetCruise);
        var openPreDtmBtn = document.getElementById('open-pre-dtm');
        if (openPreDtmBtn) openPreDtmBtn.addEventListener('click', enterPreDtm);
        Array.prototype.forEach.call(document.querySelectorAll('.js-open-series'), function (btn) {
            btn.addEventListener('click', enterSeries);
        });

        var backBtn = document.getElementById('nav-back-btn');
        if (backBtn) backBtn.addEventListener('click', goHome); // 全画面が深さ1のため戻る=TOP
        var topBtn = document.getElementById('nav-top-btn');
        if (topBtn) topBtn.addEventListener('click', goHome);

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
        showScreen('home');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
