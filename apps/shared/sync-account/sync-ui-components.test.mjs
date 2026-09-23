import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const renderer = read('./sync-ui-components.js');
const css = read('./multi-app-sync.css');
const bootstrap = read('./multi-app-sync-bootstrap.js');
const root = new URL('../../', import.meta.url);
const appHtml = [
  'chord-cruise/pro_k7m4q9v2x8/index.html',
  'pitch-cruise/pro_x9v7q2m8/index.html',
  'fretboard_cruise/pro_a9f4k7q2m8z/index.html',
  'rhythm-cruise/pro_r4m8k7n2q9x/index.html'
].map((path) => readFileSync(new URL(path, root), 'utf8'));

test('four Pro apps load one renderer and one card stylesheet contract', () => {
  for (const html of appHtml) {
    assert.match(html, /sync-ui-components\.js\?v=15/);
    assert.match(html, /multi-app-sync\.css\?v=22/);
  }
  assert.match(renderer, /sound-cruise-sync-settings-card/);
  assert.match(renderer, /sound-cruise-sync-settings-head/);
  assert.match(renderer, /sound-cruise-sync-settings-card--testing/);
  assert.match(renderer, /sound-cruise-sync-settings-testing-badge/);
  assert.doesNotMatch(renderer, /sound-cruise-sync-status/);
  assert.match(renderer, /sound-cruise-sync-card-actions/);
  for (const html of appHtml.slice(1)) assert.match(html, /multi-app-sync-bootstrap\.js\?v=22/);
  assert.match(readFileSync(new URL('pitch-cruise/pro_x9v7q2m8/service-worker.js', root), 'utf8'), /pitch-trainer-pro-scope-v24/);
  assert.match(readFileSync(new URL('fretboard_cruise/pro_a9f4k7q2m8z/service-worker.js', root), 'utf8'), /fretboard-cruise-pro-v2\.3\.9/);
  assert.match(readFileSync(new URL('rhythm-cruise/service-worker.js', root), 'utf8'), /rhythm-cruise-v11/);
});

test('shared status, description and button copy is exact', () => {
  for (const label of ['未接続', '接続中', '同期を確認中', '同期中', '同期済み', '確認が必要', 'オフライン', '一時停止中', '削除中', '再接続が必要']) {
    assert.match(renderer, new RegExp(label));
  }
  for (const copy of ['接続が戻ると自動で同期を再開します。', '安全のため同期を停止しています。', 'Cruise Portから接続し直してください。', '接続コードを入力', '接続する', 'キャンセル']) {
    assert.match(renderer, new RegExp(copy));
  }
  assert.doesNotMatch(`${renderer}\n${bootstrap}`, /Cruise Portからこのアプリを接続できます。/);
  assert.doesNotMatch(`${renderer}\n${bootstrap}`, /Cruise Portで管理/);
  assert.match(bootstrap, /この環境の同期を解除/);
  assert.match(bootstrap, /内容を確認/);
  assert.match(bootstrap, /もう一度確認/);
});

test('connected Pro cards show the shared opaque Account ID only inside the expanded body', () => {
  assert.match(renderer, /if \(options\.accountDisplayId\)[\s\S]*sound-cruise-sync-account-id/);
  assert.match(renderer, /`アカウント：\$\{options\.accountDisplayId\}`/);
  assert.match(bootstrap, /accountDisplayId: settingsPresentation\.accountDisplayId/);
  assert.match(bootstrap, /formatAccountDisplayId\?\.\(accountId\)/);
  assert.match(bootstrap, /savedAccount\?\.accountId/);
  assert.match(css, /\.sound-cruise-sync-account-id/);
  assert.doesNotMatch(renderer.slice(0, renderer.indexOf("const body = document.createElement('div')")), /accountDisplayId/,
    'the collapsed header never includes the Account ID');
});

test('connected cards offer only a current-environment detach action', () => {
  assert.match(renderer, /openCurrentEnvironmentDetachDialog/);
  assert.match(bootstrap, /detachCurrentEnvironment/);
  assert.match(bootstrap, /この環境の同期を解除/);
  assert.doesNotMatch(bootstrap, /openPortManagement/);
});

test('Help has four short product categories, a Port note and privacy link', () => {
  assert.match(renderer, /APP_HELP_SUMMARY/);
  assert.match(renderer, /このアプリの対応データをクラウドに保存し、複数の環境で同期できます。/);
  for (const title of ['クラウド同期', '接続方法', 'この環境の同期を解除', 'オフライン・競合']) {
    assert.match(renderer, new RegExp(`title: '${title}'`));
  }
  const helpDefinition = renderer.slice(
    renderer.indexOf('const HELP_SECTIONS'), renderer.indexOf('let cardSequence')
  );
  assert.equal((helpDefinition.match(/title: '/g) || []).length, 4);
  assert.doesNotMatch(renderer, /title: 'はじめに'/);
  assert.doesNotMatch(renderer, /title: '困ったとき'/);
  assert.match(renderer, /オフライン中\\n変更は端末に保存され、接続が戻ると自動で同期を再開します。/);
  assert.match(renderer, /競合した場合\\n自動で上書きせず、残す内容を確認する画面を表示します。/);
  assert.match(renderer, /復旧コード、別環境の追加、同期データの削除などの詳しい管理はCruise Portで行います。/);
  assert.match(renderer, /プライバシーポリシーを確認/);
  assert.match(renderer, /sound-cruise-sync-help-toggle/);
  assert.match(renderer, /aria-expanded/);
  assert.match(renderer, /aria-controls/);
  assert.match(renderer, /willOpen/);
  assert.match(renderer, /openToggle\.setAttribute\('aria-expanded', 'false'\)/,
    'the accordion is single-open on compact screens');
  assert.match(renderer, /content\.hidden = true/,
    'all accordion sections start closed whenever Help opens');
  assert.match(renderer, /sections = HELP_SECTIONS/);
  assert.match(renderer, /sound-cruise-sync-help-summary/);
});

test('width and interaction tokens stay identical at supported viewport widths', () => {
  assert.match(css, /\[data-sync-join-entry-host\][\s\S]*width:\s*100%[\s\S]*min-width:\s*0[\s\S]*align-self:\s*stretch[\s\S]*height:\s*auto[\s\S]*min-height:\s*0[\s\S]*flex:\s*0 0 auto/);
  assert.match(css, /\.sound-cruise-sync-settings-card[\s\S]*width:\s*100%[\s\S]*max-width:\s*27\.5rem[\s\S]*height:\s*auto[\s\S]*min-height:\s*0[\s\S]*flex:\s*none[\s\S]*margin:\s*1rem auto 0[\s\S]*border-radius:\s*\.875rem/);
  assert.match(css, /\.sound-cruise-sync-settings-card--accordion[\s\S]*padding:\s*\.55rem \.65rem/);
  assert.match(css, /\.sound-cruise-sync-settings-head[\s\S]*height:\s*auto[\s\S]*min-height:\s*0[\s\S]*margin:\s*0[\s\S]*padding:\s*0/,
    'app-global header spacing cannot inflate the shared card');
  assert.match(css, /\.sound-cruise-sync-help-button[\s\S]*width:\s*36px[\s\S]*min-height:\s*36px/);
  assert.match(css, /\.sound-cruise-sync-button,[\s\S]*min-height:\s*46px/);
  for (const viewport of [320, 375, 393, 430, 768]) assert.equal(Math.min(viewport, 440), viewport < 440 ? viewport : 440);
});

test('Help uses a safe-area bounded shell with a scrolling body and fixed footer', () => {
  assert.match(css, /\.sound-cruise-sync-help[\s\S]*100dvh[\s\S]*safe-area-inset-top[\s\S]*safe-area-inset-bottom[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.sound-cruise-sync-help-panel[\s\S]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
  assert.match(css, /\.sound-cruise-sync-help-body[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.sound-cruise-sync-help-footer[\s\S]*safe-area-inset-bottom/);
  assert.match(css, /\.sound-cruise-sync-help-open\s*\{\s*overflow:\s*hidden/);
});

test('card actions survive same-state callback replacement and Help stays isolated', () => {
  assert.match(renderer, /body\.insertBefore\(actionRow, feedback\)/,
    'the rendered CTA and Help row is attached to the card');
  assert.match(bootstrap, /settingsRevision \+= 1/);
  assert.match(bootstrap, /syncJoinUiRevision === String\(settingsRevision\)/);
  assert.match(bootstrap, /host\.dataset\.syncJoinUiRevision = String\(settingsRevision\)/);
  assert.match(renderer, /event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\);[\s\S]*controller\.busy/);
  assert.match(renderer, /help\.addEventListener\('click',[\s\S]*event\.stopPropagation\(\);[\s\S]*openHelp/);
  assert.match(renderer, /toggle\.setAttribute\('aria-expanded', expanded \? 'true' : 'false'\)/);
  assert.match(renderer, /body\.hidden = !expanded/);
  assert.match(renderer, /toggle\.addEventListener\('click',[\s\S]*body\.hidden = !willOpen[\s\S]*syncCardExpanded/);
  assert.match(css, /\.sound-cruise-sync-settings-body\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(bootstrap, /connectedPresentation[\s\S]*state === 'syncing'[\s\S]*state === 'paused'[\s\S]*state === 'attention'/,
    'connected management stays available across transient runtime states');
  assert.match(bootstrap, /offline'[\s\S]*connectedPresentation[\s\S]*online'[\s\S]*connectedPresentation/,
    'connected management stays available while offline and while checking after reconnect');
  assert.doesNotMatch(renderer, /statusRow|sound-cruise-sync-status/,
    'the compact header is the single status presentation');
});

test('accordion header owns the full row and keeps compact status separate from Help', () => {
  assert.match(renderer, /function displayStatusLabel\(state, status, suppliedLabel\)/);
  assert.match(renderer, /state === 'unconnected'\) return '未接続'/);
  assert.match(renderer, /state === 'ready'\) return '✓ 同期済み'/);
  assert.match(renderer, /sound-cruise-sync-settings-status-chip/);
  assert.match(renderer, /header\.append\(toggle\)/,
    'the accessible toggle is the only collapsed header control');
  assert.doesNotMatch(renderer, /appendText\(document, header, 'button', 'sound-cruise-sync-help-button'/,
    'Help is not rendered in the collapsed header');
  assert.match(renderer, /actionRow\.className = 'sound-cruise-sync-action-row'/);
  assert.match(renderer, /actionRow\.prepend\(actions\)/);
  assert.match(renderer, /appendText\(document, actionRow, 'button', 'sound-cruise-sync-help-button', '\?'\)/);
  assert.match(css, /\.sound-cruise-sync-settings-toggle[\s\S]*width:\s*100%/);
  assert.match(css, /\.sound-cruise-sync-action-row[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(css, /\.sound-cruise-sync-settings-status-chip[\s\S]*padding:\s*2px 8px[\s\S]*border:\s*1px solid[\s\S]*border-radius:\s*999px/);
  assert.match(css, /\.sound-cruise-sync-settings-chevron\s*\{[\s\S]*margin-left:\s*auto/);
});

test('all four Pro apps expose one compact TOP action only at the end of settings', () => {
  const fretboardScript = readFileSync(new URL('fretboard_cruise/script.js', root), 'utf8');
  for (const html of [appHtml[0], appHtml[1], appHtml[3]]) {
    assert.equal((html.match(/class="sound-cruise-settings-top">TOPに戻る<\/button>/g) || []).length, 1);
    assert.ok(html.indexOf('data-sync-join-entry-host') < html.indexOf('sound-cruise-settings-top'));
  }
  assert.equal((fretboardScript.match(/class=\"sound-cruise-settings-top\">TOPに戻る<\/button>/g) || []).length, 1);
  assert.ok(fretboardScript.indexOf('data-sync-join-entry-host') < fretboardScript.lastIndexOf('fretboard-settings-top'));
  for (const html of appHtml) assert.doesNotMatch(html, /bottom-top|sound-cruise-top-return/);
  for (const path of [
    'chord-cruise/standard/index.html', 'pitch-cruise/standard/index.html',
    'fretboard_cruise/standard/index.html', 'rhythm-cruise/standard/index.html'
  ]) {
    assert.doesNotMatch(readFileSync(new URL(path, root), 'utf8'), /sound-cruise-settings-top|TOPに戻る/);
  }
  assert.match(readFileSync(new URL('chord-cruise/js/app.js', root), 'utf8'), /cc-settings-top[\s\S]*ui\.settings\.close\(\)[\s\S]*showScreen\('home'\)/);
  assert.match(readFileSync(new URL('chord-cruise/js/ui/settings.js', root), 'utf8'), /sound-cruise-settings-top-wrap[\s\S]*insertBefore\(section, settingsEndAnchor\)/,
    'Chord dynamic settings sections remain before the final TOP action');
  assert.match(readFileSync(new URL('pitch-cruise/script.js', root), 'utf8'), /pitch-settings-top[\s\S]*hideSettingsModal\(\)[\s\S]*showHomeScreen\(\)/);
  assert.match(fretboardScript, /fretboard-settings-top[\s\S]*state\.course = null[\s\S]*renderApp\(\)/);
  const rhythmScript = readFileSync(new URL('rhythm-cruise/script.js', root), 'utf8');
  assert.match(rhythmScript, /rhythmSettingsTopBtn:\s*\$\('rhythm-settings-top'\)/);
  assert.match(rhythmScript, /micSettingsTopBtn:\s*\$\('settings-top-btn'\)/);
  assert.match(rhythmScript, /rhythmSettingsTopBtn[\s\S]*guardMicSetupInterruption\(goTop\)/);
  assert.match(rhythmScript, /micSettingsTopBtn[\s\S]*setSettingsView\('chooser'\)/);
  assert.match(css, /\.sound-cruise-settings-top[\s\S]*min-height:\s*38px[\s\S]*rgba\(255, 255, 255, \.34\)/);
});

test('Join dialog follows the visual viewport and keeps a scrollable keyboard-safe panel', () => {
  assert.match(renderer, /global\.visualViewport/);
  assert.match(renderer, /viewport\?\.addEventListener\('resize', update\)/);
  assert.match(renderer, /viewport\?\.addEventListener\('scroll', update\)/);
  assert.match(renderer, /--sync-setup-viewport-height/);
  assert.match(renderer, /scrollIntoView\?\.\(\{ block: 'nearest' \}\)/);
  assert.match(css, /\.sound-cruise-sync-setup[\s\S]*position:\s*fixed[\s\S]*safe-area-inset-top[\s\S]*max-height:\s*calc\(var\(--sync-setup-viewport-height/);
  assert.match(css, /\.sound-cruise-sync-setup-panel[\s\S]*overflow-y:\s*auto/);
  for (const viewport of [320, 375, 393, 430, 768]) assert.ok(viewport - 24 > 0);
});

test('Cruise Port onboarding is a four-step procedure without technical paragraphs', () => {
  for (const path of ['cruise-port/index.html', 'cruise-port/pro_9a3943176561/index.html']) {
    const html = readFileSync(new URL(path, root), 'utf8');
    const start = html.indexOf('<dialog id="sync-center-setup"');
    const end = html.indexOf('</dialog>', start);
    const setup = html.slice(start, end);
    assert.match(setup, /次の手順で設定します。/);
    assert.equal((setup.match(/<li>/g) || []).length, 4);
    for (const step of ['復旧コードを保存する', '各Proアプリを開く', '設定から「Cruise Portと接続」を押す', '画面の案内に沿って接続する']) {
      assert.match(setup, new RegExp(step));
    }
    for (const removed of ['すぐにアップロード', '現在有効な復旧コード', '個人を直接特定', '自動でデータを上書き']) {
      assert.doesNotMatch(setup, new RegExp(removed));
    }
  }
  const portUi = readFileSync(new URL('cruise-port/sync-center-ui.js', root), 'utf8');
  assert.match(portUi, /const introduction = phase === 'introduction'/);
  assert.match(portUi, /summary\.hidden = introduction/);
});

test('Cruise Port settings entry uses the shared card language and isolated actions', () => {
  const port = readFileSync(new URL('cruise-port/index.html', root), 'utf8');
  const portApp = readFileSync(new URL('cruise-port/practice-menu-app.js', root), 'utf8');
  assert.match(port, /id="settings-sync-center-entry" class="sound-cruise-sync-settings-card/);
  assert.doesNotMatch(port, /Cruise PortやCruiseアプリの保存データを、同じアカウントでクラウドに同期できます。/);
  assert.match(port, /id="settings-sync-center-open"[\s\S]*クラウド同期を開く/);
  assert.match(port, /id="settings-sync-center-help"/);
  assert.match(portApp, /syncCenterOpen\.addEventListener\('click',[\s\S]*openSyncCenter\(history\)/);
  assert.match(portApp, /syncCenterEntryHelp\?\.addEventListener\('click', openPortSyncHelp\)/);
  assert.match(portApp, /syncCenterHelpOpen\.addEventListener\('click', openPortSyncHelp\)/);
  assert.match(portApp, /sections: PORT_SYNC_HELP_SECTIONS/);
});

test('loading prevents duplicates and temporary feedback uses one five-second rule', () => {
  assert.match(renderer, /if \(controller\.busy \|\| button\.disabled\) return/);
  assert.match(renderer, /aria-busy/);
  assert.match(renderer, /temporaryFeedbackMs:\s*5000/);
  assert.match(renderer, /setFeedback\(message, kind = 'success', timeoutMs = 5000\)/);
});

test('Join failures, secret removal and conflict choices retain explicit contracts', () => {
  for (const code of ['app_join_expired', 'app_join_cancelled', 'app_join_consumed']) assert.match(bootstrap, new RegExp(code));
  assert.match(bootstrap, /completeJoinDialog/);
  const conflict = read('./multi-app-conflict-ui.js');
  for (const label of ['この端末の内容でクラウドを更新', 'クラウドの内容でこの端末を更新', '選んだ内容を反映', 'あとで決める']) {
    assert.match(conflict, new RegExp(label));
  }
});

test('four Standard apps expose no shared Sync UI', () => {
  for (const path of [
    'chord-cruise/standard/index.html', 'pitch-cruise/standard/index.html',
    'fretboard_cruise/standard/index.html', 'rhythm-cruise/standard/index.html'
  ]) {
    const html = readFileSync(new URL(path, root), 'utf8');
    assert.doesNotMatch(html, /sync-ui-components|multi-app-sync|data-sync-join-entry-host|production-config/);
  }
});
