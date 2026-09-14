import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const root = read('./index.html');
const pro = read('./pro_9a3943176561/index.html');
const app = read('./practice-menu-app.js');
const controller = read('./sync-center-controller.js');

test('Standard and Pro contain a feature-gated Sync Center entry and four-app shell', () => {
    for (const html of [root, pro]) {
        assert.match(html, /id="settings-sync-center-entry"[^>]*hidden/);
        assert.match(html, /id="sync-center-view"[^>]*hidden/);
        assert.match(html, /4つのCruiseアプリの同期状態を確認/);
        assert.match(html, /この操作だけで4アプリのデータがすぐにアップロードされることはありません/);
        assert.match(html, /同期中の環境/);
        assert.match(html, /復旧とセキュリティ/);
        assert.match(html, /一括設定、復旧、環境管理の操作はまだ接続されていません/);
        assert.doesNotMatch(html, /<iframe/i);
        assert.doesNotMatch(html, /__SOUND_CRUISE_SYNC_CENTER__/);
        assert.match(html, /sync-account-turnstile\.js/);
    }
    assert.match(app, /elements\.syncCenterEntry\.hidden = !syncCenterController\.enabled/);
});

test('QA Enrollment and Account start request distinct Turnstile actions', () => {
    const source = read('./sync-center-ui.js');
    assert.match(source, /tokenProvider\('sound_cruise_account_qa_enroll'\)/);
    assert.match(source, /tokenProvider\('sound_cruise_account_start'\)/);
    assert.match(app, /await syncCenterActions\?\.ensureQaAdmission\?\.\(\)/);
    assert.ok(app.indexOf('await syncCenterActions?.ensureQaAdmission?.()') < app.indexOf('syncCenterController.load()'));
});

test('Port remains a Control Plane and never opens app stores or handles user payloads', () => {
    assert.doesNotMatch(controller, /localStorage|getItem\(['"](?:chord|pitch|rhythm|fretboard)|sync_records|payload/i);
    assert.match(controller, /storage\.getAccount/);
    assert.match(controller, /client\.summary/);
    assert.match(controller, /client\.devices/);
    assert.doesNotMatch(controller, /client\.(?:prepareMembership|issueHandoff|recover|delete|revoke)\s*\(/);
});

test('recovery plaintext and credentials are never rendered or persisted by Sync Center', () => {
    const combined = `${root}\n${pro}\n${read('./sync-center-ui.js')}\n${controller}`;
    assert.doesNotMatch(combined, /setAccount|setPending|recoveryCode\s*[:=]|accountCredential\s*[:=]/);
    assert.doesNotMatch(combined, /innerHTML|insertAdjacentHTML/);
});

test('official four-app routes are reused and no all-data-upload promise is made', () => {
    assert.match(read('./sync-center-ui.js'), /resolveCruiseAppHref/);
    assert.doesNotMatch(`${root}\n${pro}`, /今すぐ全データ|一括アップロード|自動アップロード/);
    assert.match(root, /Cruise Portを開いておく必要はなく/);
    assert.match(root, /アプリ単位のクラウド削除と、Sound Cruise Syncアカウント全体の削除は別/);
});
