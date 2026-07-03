/* クルーズスタジオ — storage.js
   localStorage 保存基盤 + JSONファイル入出力（Phase 1）。
   キーはすべて `cruiseStudio.` プレフィックス。既存アプリのキー
   （soundCruiseProAuth 等）とは絶対に衝突させない。
   グローバル名前空間 CruiseStudio.storage に登録する。 */
(function () {
    'use strict';

    var PREFIX = 'cruiseStudio.';
    var INDEX_KEY = PREFIX + 'projects.index';
    var PROJECT_KEY_PREFIX = PREFIX + 'project.';
    var CURRENT_PROJECT_KEY = PREFIX + 'currentProjectId';
    var APP_SETTINGS_KEY = PREFIX + 'appSettings';

    function model() {
        return window.CruiseStudio && window.CruiseStudio.model;
    }

    function projectKey(projectId) {
        return PROJECT_KEY_PREFIX + projectId;
    }

    function readIndex() {
        try {
            var raw = localStorage.getItem(INDEX_KEY);
            if (!raw) return [];
            var idx = JSON.parse(raw);
            return Array.isArray(idx) ? idx : [];
        } catch (_) {
            return [];
        }
    }

    function writeIndex(index) {
        localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    }

    /**
     * プロジェクトを保存する。updatedAt を更新し、一覧インデックスも同期する。
     * @returns {{ok: boolean, error: string|null}}
     */
    function saveProject(project) {
        if (!project || typeof project.projectId !== 'string' || !project.projectId) {
            return { ok: false, error: 'projectId がないため保存できません' };
        }
        var m = model();
        if (m) {
            var result = m.validateProject(project);
            if (!result.ok) {
                return { ok: false, error: '検証エラー: ' + result.errors.join(' / ') };
            }
        }
        try {
            project.updatedAt = new Date().toISOString();
            localStorage.setItem(projectKey(project.projectId), JSON.stringify(project));

            var index = readIndex().filter(function (e) {
                return e && e.projectId !== project.projectId;
            });
            index.unshift({
                projectId: project.projectId,
                title: (project.songInfo && project.songInfo.title) || '無題',
                artist: (project.songInfo && project.songInfo.artist) || '',
                updatedAt: project.updatedAt
            });
            writeIndex(index);
            return { ok: true, error: null };
        } catch (e) {
            return { ok: false, error: '保存に失敗しました: ' + (e && e.message) };
        }
    }

    /**
     * プロジェクトを読み込む。migrateProject を通してから返す。
     * @returns {{ok: boolean, project: object|null, error: string|null}}
     */
    function loadProject(projectId) {
        try {
            var raw = localStorage.getItem(projectKey(projectId));
            if (!raw) {
                return { ok: false, project: null, error: 'プロジェクトが見つかりません: ' + projectId };
            }
            var data = JSON.parse(raw);
            var m = model();
            if (m) {
                var mig = m.migrateProject(data);
                if (!mig.ok) return { ok: false, project: null, error: mig.error };
                return { ok: true, project: mig.project, error: null };
            }
            return { ok: true, project: data, error: null };
        } catch (e) {
            return { ok: false, project: null, error: '読み込みに失敗しました: ' + (e && e.message) };
        }
    }

    /**
     * 保存済みプロジェクトの一覧メタ情報を返す（新しい順）。
     */
    function listProjects() {
        return readIndex();
    }

    /**
     * プロジェクトを削除し、一覧インデックスからも外す。
     */
    function deleteProject(projectId) {
        try {
            localStorage.removeItem(projectKey(projectId));
            writeIndex(readIndex().filter(function (e) {
                return e && e.projectId !== projectId;
            }));
            if (getCurrentProjectId() === projectId) {
                setCurrentProjectId(null);
            }
            return { ok: true, error: null };
        } catch (e) {
            return { ok: false, error: '削除に失敗しました: ' + (e && e.message) };
        }
    }

    /**
     * 最後に開いていたプロジェクトのIDを記録する（画面再読み込み時の復元用）。
     */
    function setCurrentProjectId(projectId) {
        try {
            if (projectId) {
                localStorage.setItem(CURRENT_PROJECT_KEY, projectId);
            } else {
                localStorage.removeItem(CURRENT_PROJECT_KEY);
            }
        } catch (_) { /* ignore */ }
    }

    /**
     * 最後に開いていたプロジェクトのIDを返す。未記録なら null。
     */
    function getCurrentProjectId() {
        try {
            return localStorage.getItem(CURRENT_PROJECT_KEY) || null;
        } catch (_) {
            return null;
        }
    }

    /**
     * アプリ側設定（曲データではない設定。プレDTMの伴奏設定など）を読む。
     * DATA_MODEL.md 7章の `cruiseStudio.appSettings`。proSettings相当も将来ここ。
     */
    function getAppSetting(key) {
        try {
            var raw = localStorage.getItem(APP_SETTINGS_KEY);
            if (!raw) return null;
            var obj = JSON.parse(raw);
            return (obj && typeof obj === 'object' && key in obj) ? obj[key] : null;
        } catch (_) {
            return null;
        }
    }

    /**
     * アプリ側設定を書く。value に null を渡すとそのキーを削除する。
     */
    function setAppSetting(key, value) {
        try {
            var raw = localStorage.getItem(APP_SETTINGS_KEY);
            var obj = raw ? JSON.parse(raw) : {};
            if (!obj || typeof obj !== 'object') obj = {};
            if (value === null || value === undefined) {
                delete obj[key];
            } else {
                obj[key] = value;
            }
            localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(obj));
            return { ok: true, error: null };
        } catch (e) {
            return { ok: false, error: '設定の保存に失敗しました: ' + (e && e.message) };
        }
    }

    /**
     * プロジェクトをJSONテキストへ書き出す（ファイル保存用・整形あり）。
     */
    function exportProjectJson(project) {
        return JSON.stringify(project, null, 2);
    }

    /**
     * JSONテキストからプロジェクトを復元する。
     * migrateProject → validateProject の順に通す（DATA_MODEL.md 7章）。
     * @returns {{ok: boolean, project: object|null, error: string|null, warnings: string[]}}
     */
    function importProjectJson(jsonText) {
        var data;
        try {
            data = JSON.parse(jsonText);
        } catch (_) {
            return { ok: false, project: null, error: 'JSONとして読み取れません', warnings: [] };
        }
        var m = model();
        if (!m) {
            return { ok: false, project: null, error: 'song-model が読み込まれていません', warnings: [] };
        }
        var mig = m.migrateProject(data);
        if (!mig.ok) {
            return { ok: false, project: null, error: mig.error, warnings: [] };
        }
        var result = m.validateProject(mig.project);
        if (!result.ok) {
            return {
                ok: false, project: null,
                error: '検証エラー: ' + result.errors.join(' / '),
                warnings: result.warnings
            };
        }
        return { ok: true, project: mig.project, error: null, warnings: result.warnings };
    }

    window.CruiseStudio = window.CruiseStudio || {};
    window.CruiseStudio.storage = {
        PREFIX: PREFIX,
        saveProject: saveProject,
        loadProject: loadProject,
        listProjects: listProjects,
        deleteProject: deleteProject,
        setCurrentProjectId: setCurrentProjectId,
        getCurrentProjectId: getCurrentProjectId,
        getAppSetting: getAppSetting,
        setAppSetting: setAppSetting,
        exportProjectJson: exportProjectJson,
        importProjectJson: importProjectJson
    };
})();
