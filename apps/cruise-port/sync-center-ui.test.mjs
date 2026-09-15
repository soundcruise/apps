import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { bindSyncCenterActions } from './sync-center-ui.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const root = read('./index.html');
const pro = read('./pro_9a3943176561/index.html');
const app = read('./practice-menu-app.js');
const controller = read('./sync-center-controller.js');

function accountSetupFixture({ completeAccountSetup, prepareAll = async () => ({ ok: true }), tokenProvider = async () => 'verified' }) {
    const listeners = {};
    const element = (overrides = {}) => ({
        dataset: {}, hidden: false, disabled: false, textContent: '',
        addEventListener(type, listener) { this.listeners ||= {}; this.listeners[type] = listener; },
        ...overrides
    });
    const setup = element({ dataset: { syncPhase: 'recovery' }, close() {}, showModal() {} });
    const confirm = element({ textContent: '保存しました' });
    const recovery = element({ textContent: '', hidden: false });
    const summary = element({ textContent: '復旧コードを安全な場所へ保存してください。' });
    const status = element();
    const nodes = new Map([
        ['#sync-center-setup', setup],
        ['#sync-center-setup-confirm', confirm],
        ['#sync-center-recovery-code', recovery],
        ['#sync-center-setup-summary', summary],
        ['#sync-center-action-status', status]
    ]);
    const root = {
        querySelector(selector) { return nodes.get(selector) || null; },
        querySelectorAll() { return []; },
        addEventListener(type, listener) { listeners[type] = listener; }
    };
    const orchestrator = {
        enabled: true,
        qaAdmissionRequired: false,
        completeAccountSetup,
        prepareAll,
        createAccountCandidate() { throw new Error('must_not_replace_saved_candidate'); }
    };
    bindSyncCenterActions(root, { orchestrator, tokenProvider });
    return { setup, confirm, recovery, summary, status, click: () => confirm.listeners.click() };
}

test('Standard and Pro contain a feature-gated Sync Center entry and four-app shell', () => {
    for (const html of [root, pro]) {
        assert.match(html, /id="settings-sync-center-entry"[^>]*hidden/);
        assert.match(html, /id="sync-center-view"[^>]*hidden/);
        assert.match(html, /4つのCruiseアプリの同期状態を確認/);
        assert.match(html, /この操作だけで4アプリのデータがすぐにアップロードされることはありません/);
        assert.match(html, /同期中の環境/);
        assert.match(html, /復旧とセキュリティ/);
        assert.match(html, /現在有効な復旧コードは1つだけです/);
        assert.match(html, /新しい復旧コードを発行すると、以前のコードは無効になります/);
        assert.match(html, /一括設定、復旧、環境管理、クラウドデータの削除は、このSync Centerから操作できます/);
        assert.doesNotMatch(html, /操作はまだ接続されていません/);
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

test('Account setup exposes bounded retry phases instead of leaving the preparing message', () => {
    const source = read('./sync-center-ui.js');
    assert.match(source, /setPhase\('starting'\)/);
    assert.match(source, /setPhase\('start-uncertain'\)/);
    assert.match(source, /setPhase\('preparing-memberships'\)/);
    assert.match(source, /setPhase\('membership-retry'\)/);
    assert.match(source, /confirm\.textContent = 'もう一度試す'/);
    assert.match(source, /setup\.dataset\.syncError = safeErrorCode\(error\)/);
    assert.match(source, /finally \{ confirm\.disabled = false; \}/);
});

test('Account start failure returns the modal to a visible retry using the same candidate', async () => {
    let attempts = 0;
    const ui = accountSetupFixture({
        completeAccountSetup: async () => {
            attempts += 1;
            if (attempts === 1) throw Object.assign(new Error('account_request_timeout'), { code: 'account_request_timeout' });
            return { ok: true };
        }
    });
    await ui.click();
    assert.equal(ui.setup.dataset.syncPhase, 'start-uncertain');
    assert.equal(ui.setup.dataset.syncError, 'account_request_timeout');
    assert.equal(ui.confirm.disabled, false);
    assert.equal(ui.confirm.textContent, 'もう一度試す');
    assert.match(ui.summary.textContent, /もう一度お試しください/);
    await ui.click();
    assert.equal(attempts, 2);
    assert.equal(ui.setup.dataset.syncPhase, 'complete');
    assert.equal(ui.setup.dataset.syncError, undefined);
    assert.equal(ui.setup.dataset.syncFailureCategory, undefined);
});

test('Account storage failure exposes only a stable non-secret category and releases retry UI', async () => {
    let attempts = 0;
    const ui = accountSetupFixture({
        completeAccountSetup: async () => {
            attempts += 1;
            if (attempts === 1) {
                throw Object.assign(new Error('account_storage_write_failed'), {
                    code: 'account_storage_write_failed', category: 'storage'
                });
            }
            return { ok: true };
        }
    });
    await ui.click();
    assert.equal(ui.setup.dataset.syncPhase, 'start-uncertain');
    assert.equal(ui.setup.dataset.syncFailureCategory, 'storage');
    assert.equal(ui.setup.dataset.syncError, 'account_storage_write_failed');
    assert.equal(ui.confirm.disabled, false);
    assert.equal(ui.confirm.textContent, 'もう一度試す');
    assert.match(ui.summary.textContent, /このブラウザ環境/);
    assert.doesNotMatch(ui.summary.textContent, /account_storage|credential|recovery/i);
    await ui.click();
    assert.equal(attempts, 2);
    assert.equal(ui.setup.dataset.syncPhase, 'complete');
    assert.equal(ui.setup.dataset.syncFailureCategory, undefined);
});

test('Account start displays a safe, actionable verification failure without exposing request material', async () => {
    const ui = accountSetupFixture({
        completeAccountSetup: async () => {
            throw Object.assign(new Error('verification_failed'), { code: 'turnstile_failed', status: 403 });
        }
    });
    await ui.click();
    assert.equal(ui.setup.dataset.syncPhase, 'start-uncertain');
    assert.equal(ui.setup.dataset.syncFailureCategory, 'turnstile');
    assert.match(ui.summary.textContent, /人間確認の検証に失敗/);
    assert.match(ui.summary.textContent, /ページを更新/);
    assert.doesNotMatch(ui.summary.textContent, /credential|recovery|token/i);
});

test('Turnstile failure and partial membership preparation both release the busy UI', async () => {
    const verification = accountSetupFixture({
        completeAccountSetup: async () => ({ ok: true }),
        tokenProvider: async () => null
    });
    await verification.click();
    assert.equal(verification.setup.dataset.syncPhase, 'recovery');
    assert.equal(verification.confirm.disabled, false);
    assert.match(verification.summary.textContent, /人間確認/);

    let preparationAttempts = 0;
    let accountStarts = 0;
    const membership = accountSetupFixture({
        completeAccountSetup: async () => { accountStarts += 1; return { ok: true }; },
        prepareAll: async () => ({ ok: ++preparationAttempts > 1 })
    });
    await membership.click();
    assert.equal(membership.setup.dataset.syncPhase, 'membership-retry');
    assert.equal(membership.confirm.disabled, false);
    assert.match(membership.summary.textContent, /成功済みの設定は保持/);
    await membership.click();
    assert.equal(membership.setup.dataset.syncPhase, 'complete');
    assert.equal(accountStarts, 1, 'membership retry does not create another Account');
});

test('Port remains a Control Plane and never opens app stores or handles user payloads', () => {
    assert.doesNotMatch(controller, /localStorage|getItem\(['"](?:chord|pitch|rhythm|fretboard)|sync_records|payload/i);
    assert.match(controller, /storage\.getAccount/);
    assert.match(controller, /client\.summary/);
    assert.match(controller, /client\.devices/);
    assert.doesNotMatch(controller, /client\.(?:prepareMembership|issueHandoff|recover|delete|revoke)\s*\(/);
});

test('Recovery plaintext is ephemeral and Sync Center never persists credentials directly', () => {
    const ui = read('./sync-center-ui.js');
    const combined = `${root}\n${pro}\n${ui}\n${controller}`;
    assert.doesNotMatch(combined, /setAccount|setPending|accountCredential\s*[:=]/);
    assert.doesNotMatch(combined, /innerHTML|insertAdjacentHTML/);
    assert.match(ui, /recoverySecret\?\.take\(\)/);
    assert.match(ui, /recoverySecret\.resolve\(\)/);
    assert.match(ui, /recoveryCandidate\.textContent = ''[\s\S]*commitRecovery/);
});

test('Lifecycle UI separates danger actions and enforces stable two-step sensitive phases', () => {
    for (const html of [root, pro]) {
        assert.match(html, /sync-center-danger/);
        assert.match(html, /data-sync-phase="input"/);
        assert.match(html, /data-sync-action="prepare-recovery"/);
        assert.match(html, /data-sync-summary/);
        assert.match(html, /data-sensitive="account-recovery-code"/);
        assert.match(html, /id="sync-center-lifecycle-submit"/);
        assert.equal((html.match(/id="sync-center-lifecycle-confirm"/g) || []).length, 1);
        assert.match(html, /端末内のデータは削除されません/);
        assert.match(html, /7日後に完全削除されます/);
    }
    const ui = read('./sync-center-ui.js');
    assert.match(ui, /lifecycleDialog\.dataset\.syncPhase = 'review'/);
    assert.match(ui, /lifecycleDialog\.dataset\.syncPhase = 'confirm'/);
    assert.match(ui, /querySelector\?\.\('#sync-center-lifecycle-submit'\)/);
    assert.match(ui, /lifecycleConfirm\.disabled = true/);
    assert.match(ui, /data-sync-app-delete/);
});

test('official four-app routes are reused and no all-data-upload promise is made', () => {
    assert.match(read('./sync-center-ui.js'), /resolveCruiseAppHref/);
    assert.doesNotMatch(`${root}\n${pro}`, /今すぐ全データ|一括アップロード|自動アップロード/);
    assert.match(root, /Cruise Portを開いておく必要はなく/);
    assert.match(root, /アプリ単位のクラウド削除と、Sound Cruise Syncアカウント全体の削除は別/);
});

test('Join invitation renders its sensitive code and actions as separate styled blocks', () => {
    const source = read('./sync-center-ui.js');
    const styles = read('./style.css');
    assert.match(source, /panel\.className = 'sync-center-join-panel'/);
    assert.match(source, /code\.className = 'sync-center-join-code'/);
    assert.match(source, /copy\.className = 'action-button primary-action'/);
    assert.match(source, /open\.className = 'action-button secondary-action'/);
    assert.match(source, /close\.className = 'action-button secondary-action'/);
    assert.match(source, /actions\.className = 'sync-center-join-actions'/);
    assert.match(source, /data-sync-app-add-environment/);
    assert.match(source, /別の環境を追加/);
    assert.match(source, /edition === 'pro' && orchestrationEnabled && app\.canAddEnvironment/);
    assert.match(source, /接続が完了するまでこの画面を開いたまま/);
    assert.match(styles, /\.sync-center-join-code\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
    assert.match(styles, /\.sync-center-join-actions\s*\{\s*display:\s*grid;\s*gap:\s*10px/);
    assert.match(styles, /\.sync-center-app-row-actions\s*\{/);
});
