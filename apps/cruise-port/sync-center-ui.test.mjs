import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { bindSyncCenterActions } from './sync-center-ui.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const root = read('./index.html');
const pro = read('./pro_9a3943176561/index.html');
const app = read('./practice-menu-app.js');
const ui = read('./sync-center-ui.js');
const controller = read('./sync-center-controller.js');

function accountSetupFixture({
    completeAccountSetup,
    prepareAll = async () => ({ ok: true }),
    tokenProvider = async () => 'verified',
    refresh = async () => {}
}) {
    const listeners = {};
    const element = (overrides = {}) => ({
        dataset: {}, hidden: false, disabled: false, textContent: '',
        addEventListener(type, listener) { this.listeners ||= {}; this.listeners[type] = listener; },
        ...overrides
    });
    const setup = element({
        dataset: { syncPhase: 'recovery' },
        close() { this.closeCount = (this.closeCount || 0) + 1; },
        showModal() {}
    });
    const confirm = element({ textContent: '保存しました' });
    const setupClose = element();
    const recovery = element({ textContent: '', hidden: false });
    const summary = element({ textContent: '復旧コードを安全な場所へ保存してください。' });
    const status = element();
    const nodes = new Map([
        ['#sync-center-setup', setup],
        ['#sync-center-setup-confirm', confirm],
        ['#sync-center-setup-close', setupClose],
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
    bindSyncCenterActions(root, { orchestrator, tokenProvider, refresh });
    return { setup, confirm, setupClose, recovery, summary, status, click: () => confirm.listeners.click() };
}

test('Standard and Pro contain a feature-gated Sync Center entry and four-app shell', () => {
    for (const html of [root, pro]) {
        assert.match(html, /id="settings-sync-center-entry"[^>]*hidden/);
        assert.match(html, /id="sync-center-view"[^>]*hidden/);
        assert.match(html, /4つのProアプリのクラウド同期を管理します。/);
        assert.match(html, /クラウド同期を開く/);
        assert.match(html, /次の手順で設定します。/);
        assert.match(html, /設定から「Cruise Portと接続」を押す/);
        assert.match(html, /3\. 環境を管理/);
        assert.match(html, /復旧とセキュリティ/);
        assert.match(html, /data-sync-section-help-toggle="sync-center-add-environments-help"/);
        assert.match(html, /data-sync-section-help-toggle="sync-center-recovery-help"/);
        assert.match(html, /data-sync-section-help-toggle="sync-center-danger-help"/);
        assert.match(html, /id="sync-center-recovery-help"[^>]*hidden/);
        assert.doesNotMatch(html, /id="sync-center-account-description"/);
        assert.doesNotMatch(html, /id="sync-center-environments-title"/);
        assert.doesNotMatch(html, /id="sync-center-help"/,
            'Port Help is rendered by the shared accordion rather than an always-expanded static dialog');
        assert.match(html, /クラウド同期をはじめる/);
        assert.doesNotMatch(html, /操作はまだ接続されていません/);
        assert.doesNotMatch(html, /<iframe/i);
        assert.doesNotMatch(html, /__SOUND_CRUISE_SYNC_CENTER__/);
        assert.match(html, /sync-account-turnstile\.js/);
        assert.match(html, /id="sync-center-setup-turnstile"[^>]*hidden/);
        assert.match(html, /id="sync-center-turnstile"/);
    }
    assert.match(app, /elements\.syncCenterEntry\.hidden = !syncCenterController\.enabled/);
    assert.match(app, /PORT_SYNC_HELP_SUMMARY/);
    assert.match(app, /PORT_SYNC_HELP_SECTIONS/);
    assert.match(app, /openPortSyncHelp/);
    assert.equal((app.match(/flowSteps: true/g) || []).length, 1);
    for (const category of ['最初の接続', '環境を管理', '復旧コード', 'オフライン・競合', '解除・削除', 'データとプライバシー']) {
        assert.match(app, new RegExp(`title: '${category}'`));
    }
});

test('Account section presents step title, status chip and state-specific CTA', () => {
    for (const html of [root, pro]) {
        const start = html.indexOf('<section class="sync-center-account"');
        const end = html.indexOf('</section>', start);
        const account = html.slice(start, end);
        assert.match(account, /1\. アカウント/);
        assert.match(account, /sync-center-account-status/);
        assert.match(account, /アカウントの作成/);
        assert.match(account, /既存のアカウントに接続/);
        assert.doesNotMatch(account, /復旧コードを更新/);
        assert.doesNotMatch(account, /この環境の接続を解除/);
        assert.match(account, /sync-center-account-actions/);
        assert.match(account, /sync-center-account-action-row/);
        assert.match(account, /sync-center-section-heading[\s\S]*1\. アカウント[\s\S]*id="sync-center-account-help-toggle"/);
        assert.match(account, /id="sync-center-account-help"[^>]*hidden/);
        assert.match(account, /<h3>アカウント<\/h3>/);
        assert.match(account, /アカウントを作成/);
        assert.match(account, /既存アカウントに接続/);
        assert.doesNotMatch(account, /account-recovery-help/);
        assert.doesNotMatch(account, /復旧コード/);
        assert.doesNotMatch(account, /復旧コードの確認/);
        assert.doesNotMatch(account, /Sound Cruise Sync 接続済み/);
        assert.doesNotMatch(account, /アプリの同期設定が完了/);
        assert.doesNotMatch(account, /クラウド同期をはじめる/);
    }
    assert.match(ui, /accountState === 'unset' \? '未作成'/);
    assert.match(ui, /accountState === 'active' \? '作成済み'/);
    assert.match(ui, /setupOpen\.hidden = accountState !== 'unset'/);
    assert.match(ui, /accountRecoveryOpen\.hidden = accountState !== 'active'/);
    assert.match(ui, /recoveryOpen\.hidden = accountState !== 'unset'/);
    assert.match(ui, /setupOpen\.textContent = 'アカウントの作成'/);
    assert.match(ui, /accountRecoveryOpen\.textContent = '復旧コードを更新'/);
    assert.doesNotMatch(ui, /querySelector\('#sync-center-current-environment-detach'\)/);
    assert.doesNotMatch(ui, /#sync-center-recovery-open, #sync-center-account-recovery-open/);
});

test('App rows separate ordinary status chips from record counts without changing special states', () => {
    const styles = read('./style.css');
    assert.match(ui, /sync-center-app-status-line/);
    assert.match(ui, /sync-center-app-status-chip--\$\{app\.status\}/);
    assert.match(ui, /sync-center-app-record-count/);
    assert.doesNotMatch(ui, /\$\{app\.statusLabel\}・\$\{app\.recordCount\}件/);
    assert.match(ui, /\['synced', 'detached'\]\.includes\(app\.status\)/);
    assert.match(styles, /\.sync-center-account-status-chip,\s*\.sync-center-app-status-chip/);
    assert.match(styles, /\.sync-center-app-status-chip--synced/);
    assert.match(styles, /\.sync-center-app-status-chip--detached/);
    assert.match(styles, /\.sync-status-attention \.sync-center-app-status-line/);
    assert.match(styles, /\.sync-center-app-record-count/);
});

test('Cloud Sync shows a compact independent status for Cruise Port data', () => {
    const styles = read('./style.css');
    for (const html of [root, pro]) {
        assert.match(html, /id="sync-center-port-data-title">Cruise Portのデータ/);
        assert.match(html, /id="sync-center-port-status-chip"/);
        assert.match(html, /機材リスト、練習メニュー、My AppsなどCruise Port内の保存データのクラウド同期状態です。/);
    }
    assert.match(ui, /function renderPortStatus/);
    assert.match(ui, /dataset\.syncPortStatus = status\.state/);
    assert.match(styles, /sync-center-port-status-chip\[data-sync-port-status="complete"\]/);
    assert.doesNotMatch(root, /Cruise PortをHome画面から削除/);
});

test('Cruise Port installs the existing conflict resolution UI before startup sync', () => {
    for (const html of [root, pro]) {
        assert.match(html, /multi-app-conflict-ui\.js\?v=2/);
        assert.ok(html.indexOf('multi-app-conflict-ui.js?v=2') < html.indexOf('practice-menu-app.js'));
    }
    assert.match(app, /installConflictResolutionUi\?\.\(portSyncController\?\.runtime, document\)/);
});

test('current Port detach is distinct from generic environment revoke and leaves Section 2 informational when Account is unset', () => {
    assert.match(ui, /dataset\.syncEnvironmentRevoke = environment\.id/);
    assert.match(ui, /kind: 'current-environment'/);
    assert.match(ui, /await orchestrator\.detachCurrentEnvironment\(\)/);
    assert.equal((ui.match(/await orchestrator\.detachCurrentEnvironment\(\)/g) || []).length, 1);
    assert.equal((ui.match(/await orchestrator\.revokeEnvironment\(lifecycleAction\.accountDeviceId\)/g) || []).length, 1);
    assert.match(ui, /先にアカウントを作成または接続してください/);
    assert.match(ui, /needsInitialConnection && !accountReady[\s\S]*action\.disabled = true/);
    assert.match(ui, /この環境が最後のCruise Portです。/);
    assert.match(ui, /syncCurrentEnvironmentDetach = 'true'/);
    assert.match(ui, /await orchestrator\.revokeEnvironment\(lifecycleAction\.accountDeviceId\)/);
    assert.doesNotMatch(ui, /orchestrator\.commitDelete\(.*current-environment/);
});

test('Sync Code rows bind the existing launch callback after every render', () => {
    const source = read('./sync-center-ui.js');
    const styles = read('./style.css');
    assert.match(source, /function renderAppRows\(root, presentation, edition, orchestrationEnabled, onAppAction = null\)/);
    assert.match(source, /action\.addEventListener\('click', \(event\) => \{[\s\S]*event\.stopPropagation\(\);[\s\S]*void onAppAction\(action\)/);
    assert.match(source, /return Object\.freeze\(\{ ensureQaAdmission, onAppAction: issueAppJoin \}\)/);
    assert.match(app, /onAppAction: syncCenterActions\?\.onAppAction/);
    assert.match(source, /await orchestrator\.launch\(button\.dataset\.syncAppAction\)/);
    assert.match(source, /await orchestrator\.cancelAppDeleteAndLaunch\(button\.dataset\.syncAppAction\)/);
    assert.match(source, /if \(result\?\.kind === 'join'\) \{[\s\S]*showJoinCode\(root, result/);
    for (const html of [root, pro]) {
        assert.match(html, /2\. アプリを接続[\s\S]*data-sync-section-help-toggle="sync-center-apps-help"/);
        assert.match(html, /id="sync-center-apps-help"[\s\S]*最初に使うアプリを接続します。[\s\S]*そのアプリの全環境を解除します。/);
    }
    assert.match(styles, /\.sync-center-account-action-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1\.35fr\)\s+minmax\(0, 1fr\)/);
    assert.match(styles, /\.sync-center-account-action-row\[data-sync-account-state="unset"\][\s\S]*grid-template-columns:\s*minmax\(0, 360px\)/);
    assert.match(styles, /\.sync-center-account-action\s*\{[\s\S]*min-height:\s*48px[\s\S]*padding:\s*7px 14px/);
});

test('Recovery-code update uses authenticated rotation without opening Recovery execution', () => {
    for (const html of [root, pro]) {
        assert.match(html, /id="sync-center-recovery-rotate-confirm-dialog"/);
        assert.match(html, /<h2[^>]*>復旧コードを更新<\/h2>/);
        assert.match(html, /新しい復旧コードを発行します。発行すると、現在の復旧コードは使えなくなります。/);
        assert.match(html, /id="sync-center-recovery-rotate-confirm"[^>]*>新しい復旧コードを発行<\/button>/);
        assert.match(html, /id="sync-center-recovery-rotate-cancel"[^>]*>キャンセル<\/button>/);
        const recoveryStart = html.indexOf('aria-labelledby="sync-center-recovery-title"');
        const dangerStart = html.indexOf('aria-labelledby="sync-center-danger-title"');
        const recoverySection = html.slice(recoveryStart, dangerStart);
        assert.match(recoverySection, /id="sync-center-account-recovery-open"[^>]*hidden>復旧コードを更新/);
        assert.match(recoverySection, /id="sync-center-recovery-open"[^>]*hidden>復旧コードで復旧/);
    }
    assert.match(ui, /復旧コードは、アカウントを失ったときに元のクラウドデータへ戻るために使います。/);
    assert.match(ui, /安全のため現在のコードは再表示できません。/);
    assert.match(ui, /保存してある復旧コードを使って、既存のSound Cruise Syncアカウントを復旧できます。/);
    assert.match(ui, /accountRecoveryOpen\.hidden = accountState !== 'active'/);
    assert.match(ui, /recoveryOpen\.hidden = accountState !== 'unset'/);
    assert.match(ui, /#sync-center-account-recovery-open'\)\?\.addEventListener\('click', \(\) => \{[\s\S]*recoveryRotateConfirmDialog\?\.showModal\(\)/);
    assert.match(ui, /tokenProvider\('sound_cruise_recovery_rotation'\)/);
    assert.match(ui, /await orchestrator\.prepareRecoveryRotation\(\{ turnstileToken \}\)/);
    assert.match(ui, /recoveryDialog\.dataset\.syncMode = 'rotation'/);
    assert.match(ui, /recoveryInput\) recoveryInput\.hidden = true/);
    assert.match(ui, /recoveryTitle\.textContent = '新しい復旧コードを保存'/);
    assert.match(ui, /recoverySummary\.textContent = 'この復旧コードを安全な場所に保存してください。'/);
    assert.match(ui, /await orchestrator\.commitRecoveryRotation\(\{ recoverySaved: true \}\)/);
    assert.match(ui, /await orchestrator\.prepareRecovery\(\{ recoveryCode, turnstileToken \}\)/);
    assert.match(ui, /復旧コードを更新しました。以前の復旧コードは使えません。/);
});

test('Account creation opens the existing recovery screen directly and keeps completion copy clear', () => {
    const openHandlerStart = ui.indexOf("root?.querySelector?.('#sync-center-setup-open')?.addEventListener");
    const openHandler = ui.slice(openHandlerStart, ui.indexOf("root?.querySelector?.('#sync-center-setup-close')", openHandlerStart));
    assert.match(openHandler, /showRecoveryCandidate\(\)/);
    assert.doesNotMatch(openHandler, /setPhase\('introduction'\)/);
    assert.match(ui, /setupTitle\.textContent = phase === 'recovery'[\s\S]*復旧コードを保存/);
    assert.match(ui, /phase === 'complete' \? 'アカウント作成が完了しました'/);
    assert.match(ui, /続いて、各アプリの初回同期を完了してください。/);
    assert.match(ui, /この復旧コードを安全な場所に保存してください。/);
});

test('Account completion keeps only its existing close action', async () => {
    const ui = accountSetupFixture({ completeAccountSetup: async () => ({ ok: true }) });
    await ui.click();
    assert.equal(ui.setup.dataset.syncPhase, 'complete');
    assert.equal(ui.setupClose.hidden, true);
    await ui.click();
    assert.equal(ui.setup.closeCount, 1);
});

test('Account processing hides the saved confirmation and prevents a second submit', async () => {
    let release;
    const inFlight = new Promise((resolve) => { release = resolve; });
    const ui = accountSetupFixture({ completeAccountSetup: () => inFlight });
    const click = ui.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(ui.setup.dataset.syncPhase, 'starting');
    assert.equal(ui.confirm.hidden, true);
    assert.equal(ui.confirm.disabled, true);
    release({ ok: true });
    await click;
    assert.equal(ui.setup.dataset.syncPhase, 'complete');
    assert.equal(ui.confirm.hidden, false);
    assert.equal(ui.confirm.disabled, false);
    assert.equal(ui.confirm.textContent, '閉じる');
});

test('post-commit screen refresh failure does not replace Account success with a failure phase', async () => {
    const ui = accountSetupFixture({
        completeAccountSetup: async () => ({ ok: true }),
        refresh: async () => { throw new Error('summary_temporarily_unavailable'); }
    });
    await ui.click();
    assert.equal(ui.setup.dataset.syncPhase, 'complete');
    assert.equal(ui.confirm.textContent, '閉じる');
    assert.equal(ui.setup.dataset.syncError, undefined);
});

test('Recovery execution copy is concise and its dialog prevents iOS input zoom', () => {
    for (const html of [root, pro]) {
        assert.match(html, /保存してある復旧コードを入力してください。/);
        assert.doesNotMatch(html, /保存済みのAccount Recovery Codeを入力してください。/);
        assert.doesNotMatch(html, /現在有効な復旧コードは1つだけです。新しい復旧コードを発行すると/);
    }
    const css = read('./style.css');
    assert.match(css, /#sync-center-recovery-input,[\s\S]*#sync-center-port-connect-input\s*\{[\s\S]*box-sizing:\s*border-box[\s\S]*font-size:\s*max\(16px, calc\(1rem \* var\(--font-scale\)\)\)/);
    assert.match(css, /\.sync-center-help-dialog[\s\S]*box-sizing:\s*border-box[\s\S]*width:\s*min\(560px, calc\(100vw - 24px - env\(safe-area-inset-left\) - env\(safe-area-inset-right\)\)\)[\s\S]*max-width:\s*calc\(100vw - 24px - env\(safe-area-inset-left\) - env\(safe-area-inset-right\)\)[\s\S]*max-height:\s*min\(calc\(100dvh - 24px\), 720px\)[\s\S]*overflow-x:\s*hidden[\s\S]*overflow-y:\s*auto/);
});

test('Sync Help separates initial connection from environment management', () => {
    const firstStart = app.indexOf("title: '最初の接続'");
    const additionalStart = app.indexOf("title: '環境を管理'");
    const nextSection = app.indexOf("title: '復旧コード'", additionalStart);
    const first = app.slice(firstStart, additionalStart);
    const additional = app.slice(additionalStart, nextSection);
    assert.match(first, /'1\. Cruise Portで対象アプリの「同期コード」を押す'/);
    assert.match(first, /'6\. コードを入力して「接続する」を押す'/);
    assert.match(additional, /Cruise Portや各アプリで使う端末・ブラウザを追加・確認・解除できます。/);
    assert.match(additional, /Cruise Portでは、このアカウントを使う環境を管理します。/);
    assert.match(additional, /環境を追加/);
    assert.match(additional, /環境を確認・解除/);
});

test('Section 2 is initial-only and Section 3 owns Port plus four app additions', () => {
    for (const html of [root, pro]) {
        const section2Start = html.indexOf('aria-labelledby="sync-center-apps-title"');
        const section3Start = html.indexOf('aria-labelledby="sync-center-add-environments-title"');
        const environmentsStart = html.indexOf('aria-labelledby="sync-center-recovery-title"');
        const section2 = html.slice(section2Start, section3Start);
        const section3 = html.slice(section3Start, environmentsStart);
        assert.match(section2, /2\. アプリを接続/);
        assert.doesNotMatch(section2, /別の環境を追加/);
        assert.match(section3, /3\. 環境を管理/);
        assert.match(section3, /sync-center-add-environments/);
        assert.match(section3, /Cruise Portや各アプリで使う端末・ブラウザを追加・確認・解除できます。/);
        assert.match(html, /id="sync-center-port-connect"/);
        assert.match(html, /data-sensitive="port-addition-code"/);
    }
    assert.match(ui, /function renderEnvironmentManagementRows/);
    assert.match(ui, /id: 'port', name: 'Cruise Port'/);
    assert.match(ui, /subtitle: 'アカウント管理'/);
    assert.match(ui, /dataset\.syncPortAddEnvironment = 'true'/);
    assert.match(ui, /dataset\.syncAppAddEnvironment = entry\.id/);
    assert.match(ui, /orchestrator\.issuePortAddition\(\)/);
    assert.match(ui, /orchestrator\.connectExistingAccount\(joinCode\)/);
});

test('Existing-account join dialog presents only the success acknowledgement after connecting', () => {
    for (const html of [root, pro]) {
        assert.match(html, /id="sync-center-port-connect-description">別のCruise Portに表示された追加コードを入力してください。/);
        assert.match(html, /id="sync-center-port-connect-label" for="sync-center-port-connect-input">追加コード/);
        assert.match(html, /id="sync-center-port-connect-close"[^>]*hidden>閉じる/);
    }
    assert.match(ui, /const setPortConnectPhase = \(phase\) => \{/);
    assert.match(ui, /portConnectDescription\.hidden = !inputPhase/);
    assert.match(ui, /portConnectLabel\.hidden = !inputPhase/);
    assert.match(ui, /portConnectInput\.hidden = !inputPhase/);
    assert.match(ui, /portConnectConfirm\.hidden = !inputPhase/);
    assert.match(ui, /portConnectCancel\.hidden = !inputPhase/);
    assert.match(ui, /portConnectClose\.hidden = !successPhase/);
    assert.match(ui, /setPortConnectPhase\('working'\)/);
    assert.match(ui, /setPortConnectPhase\('complete'\)[\s\S]*portConnectStatus\.textContent = '接続しました。'/);
    assert.match(ui, /try \{ await refresh\(\); \} catch \(_\) \{ \/\* committed Join remains successful \*\//);
    assert.match(ui, /portConnectClose\?\.addEventListener\('click', \(\) => \{[\s\S]*portConnectDialog\?\.close\(\)/);
    assert.match(ui, /catch \(error\) \{[\s\S]*setPortConnectPhase\('input'\)/);
});

test('QA Enrollment and Account start request distinct Turnstile actions', () => {
    const source = read('./sync-center-ui.js');
    assert.match(source, /tokenProvider\('sound_cruise_account_qa_enroll'\)/);
    assert.match(source, /requestSetupTurnstileToken\('sound_cruise_account_start'\)/);
    assert.match(app, /await syncCenterActions\?\.ensureQaAdmission\?\.\(\)/);
    assert.match(app, /if \(await syncCenterOrchestrator\.hasConfiguredAccount\?\.\(\)\)/);
    assert.ok(app.indexOf('syncCenterOrchestrator.resume()') < app.indexOf('await syncCenterActions?.ensureQaAdmission?.()'));
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
    assert.match(source, /requestSetupTurnstileToken\('sound_cruise_account_start'\)/);
    assert.match(source, /tokenProvider\(action, \{ mount: setupTurnstileMount, visible: true \}\)/);
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
    assert.match(ui, /prepareRecovery\([\s\S]*recoveryInput\) recoveryInput\.hidden = true/);
    assert.match(ui, /commitRecovery\([\s\S]*try \{ await refresh\(\); \} catch \(_\) \{\}/);
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
        assert.match(html, /id="sync-center-danger-help"[^>]*hidden/);
        assert.match(html, /端末内のデータは削除されません/);
        assert.match(html, /7日後に完全削除の対象になります/);
    }
    const ui = read('./sync-center-ui.js');
    assert.match(ui, /lifecycleDialog\.dataset\.syncPhase = 'review'/);
    assert.match(ui, /lifecycleDialog\.dataset\.syncPhase = 'confirm'/);
    assert.match(ui, /querySelector\?\.\('#sync-center-lifecycle-submit'\)/);
    assert.match(ui, /lifecycleConfirm\.disabled = true/);
    assert.match(ui, /data-sync-app-delete/);
});

test('App detach stays in its row while app cloud deletion moves into a closed Danger accordion', () => {
    const source = read('./sync-center-ui.js');
    const styles = read('./style.css');
    assert.match(source, /const canRemoveAppSync = Number\(app\.activeAppDeviceCount \|\| 0\) > 0 &&[\s\S]*app\.status !== 'deleting' && orchestrationEnabled/);
    assert.match(source, /action\.dataset\.syncAppDetach = app\.id/);
    assert.match(source, /action\.dataset\.syncAppName = app\.name/);
    assert.match(source, /canRemoveAppSync \? '同期を解除' : app\.statusLabel/);
    assert.match(source, /const appName = appDetach\.dataset\.syncAppName \|\| 'このアプリ'/);
    assert.match(source, /title: `\$\{appName\}の同期を解除`/);
    assert.match(source, /await orchestrator\.detachApp\(lifecycleAction\.appId\)/);
    assert.match(source, /await orchestrator\.issueDelete\(lifecycleAction\.scope, lifecycleAction\.appId\)/);
    assert.match(source, /await orchestrator\.commitDelete\(lifecycleAction\.scope, lifecycleAction\.appId\)/);
    assert.match(source, /environment\.dataset\.syncEnvironmentRevoke/);
    assert.match(styles, /\.sync-center-app-remove \{[\s\S]*border-color: rgba\(232, 111, 120, 0\.72\)/);
    for (const html of [root, pro]) {
        assert.match(html, /data-sync-app-delete-toggle[^>]*aria-expanded="false"/);
        assert.match(html, /id="sync-center-app-delete-actions"[^>]*hidden/);
        for (const appId of ['pitch', 'fretboard', 'rhythm', 'chord']) {
            assert.match(html, new RegExp(`data-sync-app-delete="${appId}"`));
        }
        assert.match(html, /「同期を解除」ではクラウドデータを残したまま、そのアプリの全環境を解除します。/);
        assert.match(html, /id="sync-center-account-delete"[^>]*>アカウントを削除<\/button>/);
        assert.match(html, /Sound Cruise Syncアカウントと4つのアプリすべてのクラウド同期データを削除対象にします。/);
        assert.doesNotMatch(html, /すべてのクラウドデータを削除/);
    }
    assert.match(source, /title: 'Sound Cruise Syncアカウントを削除'/);
    assert.match(source, /削除を確定すると同期中の環境は解除され/);
});

test('delete grace reconnect is explicit and Section 3 owns counts, lists and scoped revoke', () => {
    const source = read('./sync-center-ui.js');
    const styles = read('./style.css');
    assert.match(source, /dataset\.syncAppDeleteGrace = 'true'/);
    assert.match(source, /削除を取り消して再接続/);
    assert.match(source, /削除を取り消して同期コードを表示/);
    assert.match(source, /cancelAppDeleteAndLaunch/);
    assert.match(source, /if \(deleting\) await refresh\(\)/);
    assert.match(source, /!app \|\| app\.deleteGrace \|\| \['unset', 'prepared', 'deleting'\]\.includes\(app\.status\)/);
    assert.match(source, /count\.textContent = `\$\{entry\.environments\.length\}環境/);
    assert.match(source, /count\.disabled = entry\.environments\.length === 0/);
    assert.match(source, /dataset\.syncAppEnvironmentRevoke = environment\.id/);
    assert.match(source, /revoke\.dataset\.syncCurrentEnvironmentDetach = 'true'/);
    assert.match(source, /await orchestrator\.revokeAppEnvironment/);
    assert.match(styles, /\.sync-center-environment-count/);
    assert.match(styles, /\.sync-center-environment-list\[hidden\]/);
    for (const html of [root, pro]) {
        assert.match(html, /3\. 環境を管理/);
        assert.doesNotMatch(html, /<h2 id="sync-center-environments-title">同期中の環境<\/h2>/);
        assert.match(html, /アプリの最初の接続は「2\. アプリを接続」から行います。/);
    }
});

test('official four-app routes are reused and no all-data-upload promise is made', () => {
    assert.match(read('./sync-center-ui.js'), /resolveCruiseAppHref/);
    assert.doesNotMatch(`${root}\n${pro}\n${app}`, /今すぐ全データ|一括アップロード|自動アップロード/);
    assert.match(app, /普段使っているProアプリをCruise Portに接続する手順です。/);
    assert.match(app, /環境の同期解除、アプリ単位のクラウド削除、Account全体の削除は別/);
});

test('Join invitation keeps existing callbacks while rendering a concise non-secret flow', () => {
    const source = read('./sync-center-ui.js');
    const styles = read('./style.css');
    assert.match(source, /panel\.className = 'sync-center-join-panel'/);
    assert.match(source, /code\.className = 'sync-center-join-code'/);
    assert.match(source, /copy\.className = 'action-button primary-action'/);
    assert.match(source, /close\.className = 'action-button secondary-action'/);
    assert.match(source, /actions\.className = 'sync-center-join-actions'/);
    assert.match(source, /data-sync-app-add-environment/);
    assert.match(source, /function renderEnvironmentManagementRows/);
    assert.match(source, /available: activeAccount && app\.canAddEnvironment && !app\.deleteGrace/);
    assert.match(source, /add\.textContent = '追加コード'/);
    assert.match(source, /const needsInitialConnection = \['unset', 'prepared', 'detached'\]\.includes\(app\.status\)/);
    assert.match(source, /function bindSectionHelp\(root\)/);
    assert.match(source, /button\.setAttribute\('aria-expanded', String\(!help\.hidden\)\)/);
    assert.match(source, /const environmentToggle = event\.target\.closest\?\.\('\[data-sync-environment-toggle\]'\)/);
    assert.match(source, /environmentToggle\.textContent = `\$\{count\}環境\$\{details\.hidden \? '⌄' : '⌃'\}`/);
    assert.match(source, /このアプリを接続/);
    assert.match(source, /以下の手順で接続します。/);
    assert.match(source, /sync-center-join-steps/);
    assert.equal((source.match(/コードをコピー/g) || []).length >= 2, true);
    assert.match(source, /close\.textContent = '閉じる'/);
    assert.doesNotMatch(source, /接続をやめる/);
    assert.match(source, /このコードは5分間有効です。/);
    assert.match(source, /sync-center-join-warning/);
    assert.match(source, /接続が完了するまで、この画面を開いたままにしてください。閉じると、このコードは使えなくなります。/);
    assert.match(source, /steps\.children\[0\]\?\.after\(keepOpen\)/);
    assert.doesNotMatch(source, /追加したいブラウザやPWAで対象のProアプリを開く/);
    assert.doesNotMatch(source, /保存する必要はありません/);
    assert.match(source, /orchestrator\.addEnvironment\(addEnvironment\.dataset\.syncAppAddEnvironment\)/);
    assert.match(source, /orchestrator\.launch\(button\.dataset\.syncAppAction\)/);
    assert.match(styles, /\.sync-center-join-code\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
    assert.match(styles, /\.sync-center-join-actions\s*\{\s*display:\s*grid;\s*gap:\s*10px/);
    assert.match(styles, /\.sync-center-join-steps\s*\{[\s\S]*padding-left:/);
    assert.match(styles, /\.sync-center-app-row-actions\s*\{/);
});

test('Join dialog identifies the target app from appId using the official icon catalog', () => {
    const styles = read('./style.css');
    assert.match(ui, /: SYNC_CENTER_APPS\.find\(\(app\) => app\.id === result\.appId\)/);
    assert.match(ui, /CRUISE_APP_ICONS\[target\.id\]\[edition === 'pro' \? 'pro' : 'standard'\]/);
    assert.match(ui, /badge\.className = 'sync-center-join-target'/);
    assert.match(ui, /name\.textContent = target\.name/);
    assert.match(styles, /\.sync-center-join-header\s*\{[\s\S]*display:\s*flex/);
    assert.match(styles, /\.sync-center-join-target\s*\{[\s\S]*min-width:\s*0/);
});
