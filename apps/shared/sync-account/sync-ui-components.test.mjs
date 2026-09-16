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
    assert.match(html, /sync-ui-components\.js\?v=2/);
    assert.match(html, /multi-app-sync\.css\?v=11/);
  }
  assert.match(renderer, /sound-cruise-sync-settings-card/);
  assert.match(renderer, /sound-cruise-sync-settings-head/);
  assert.match(renderer, /sound-cruise-sync-status/);
  assert.match(renderer, /sound-cruise-sync-card-actions/);
  for (const html of appHtml.slice(1)) assert.match(html, /multi-app-sync-bootstrap\.js\?v=13/);
  assert.match(readFileSync(new URL('pitch-cruise/pro_x9v7q2m8/service-worker.js', root), 'utf8'), /pitch-trainer-pro-scope-v19/);
  assert.match(readFileSync(new URL('fretboard_cruise/pro_a9f4k7q2m8z/service-worker.js', root), 'utf8'), /fretboard-cruise-pro-v2\.3\.4/);
  assert.match(readFileSync(new URL('rhythm-cruise/service-worker.js', root), 'utf8'), /rhythm-cruise-v6/);
});

test('shared status, description and button copy is exact', () => {
  for (const label of ['未接続', '接続中', '同期を確認中', '同期中', '同期済み', '確認が必要', 'オフライン', '一時停止中', '削除中', '再接続が必要']) {
    assert.match(renderer, new RegExp(label));
  }
  for (const copy of ['Cruise Portからこのアプリを接続できます。', '接続が戻ると自動で同期を再開します。', '安全のため同期を停止しています。', 'Cruise Portから接続し直してください。', '接続コードを入力', '接続する', 'キャンセル']) {
    assert.match(renderer, new RegExp(copy));
  }
  assert.match(bootstrap, /Cruise Portで管理/);
  assert.match(bootstrap, /内容を確認/);
  assert.match(bootstrap, /もう一度確認/);
});

test('help has the six product categories, procedures and privacy link', () => {
  for (const title of ['はじめに', '接続方法', '復旧と環境管理', 'オフライン・競合・エラー', '解除・削除', 'データとプライバシー']) {
    assert.match(renderer, new RegExp(`title: '${title}'`));
  }
  assert.equal((renderer.match(/title: '/g) || []).length, 6);
  for (const step of ['クラウド同期をはじめる', '復旧コードを安全な場所へ保存する', '別の環境を追加', 'Cruise Portと接続', 'コードを入力して「接続する」を押す']) {
    assert.match(renderer, new RegExp(step));
  }
  assert.match(renderer, /プライバシーポリシーを確認/);
  assert.match(renderer, /sound-cruise-sync-help-toggle/);
  assert.match(renderer, /aria-expanded/);
  assert.match(renderer, /aria-controls/);
  assert.match(renderer, /willOpen/);
  assert.match(renderer, /openToggle\.setAttribute\('aria-expanded', 'false'\)/,
    'the accordion is single-open on compact screens');
  assert.match(renderer, /content\.hidden = true/,
    'all accordion sections start closed whenever Help opens');
});

test('width and interaction tokens stay identical at supported viewport widths', () => {
  assert.match(css, /\[data-sync-join-entry-host\][\s\S]*width:\s*100%[\s\S]*min-width:\s*0[\s\S]*align-self:\s*stretch[\s\S]*height:\s*auto[\s\S]*min-height:\s*0[\s\S]*flex:\s*0 0 auto/);
  assert.match(css, /\.sound-cruise-sync-settings-card[\s\S]*width:\s*100%[\s\S]*max-width:\s*27\.5rem[\s\S]*height:\s*auto[\s\S]*min-height:\s*0[\s\S]*flex:\s*none[\s\S]*margin:\s*1rem auto 0[\s\S]*padding:\s*1rem[\s\S]*border-radius:\s*\.875rem/);
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
  assert.match(renderer, /card\.insertBefore\(actions, feedback\)/,
    'the rendered CTA container is attached to the card');
  assert.match(bootstrap, /settingsRevision \+= 1/);
  assert.match(bootstrap, /syncJoinUiRevision === String\(settingsRevision\)/);
  assert.match(bootstrap, /host\.dataset\.syncJoinUiRevision = String\(settingsRevision\)/);
  assert.match(renderer, /event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\);[\s\S]*controller\.busy/);
  assert.match(renderer, /help\.addEventListener\('click',[\s\S]*event\.stopPropagation\(\);[\s\S]*openHelp/);
  assert.match(bootstrap, /connectedPresentation[\s\S]*state === 'syncing'[\s\S]*state === 'paused'[\s\S]*state === 'attention'/,
    'connected management stays available across transient runtime states');
  assert.match(bootstrap, /offline'[\s\S]*connectedPresentation[\s\S]*online'[\s\S]*connectedPresentation/,
    'connected management stays available while offline and while checking after reconnect');
});

test('all four Pro apps expose one shared bottom TOP action and Standard remains unchanged', () => {
  for (const html of appHtml) {
    assert.match(html, /class="sound-cruise-top-return">TOPに戻る<\/button>/);
  }
  for (const path of [
    'chord-cruise/standard/index.html', 'pitch-cruise/standard/index.html',
    'fretboard_cruise/standard/index.html', 'rhythm-cruise/standard/index.html'
  ]) {
    assert.doesNotMatch(readFileSync(new URL(path, root), 'utf8'), /sound-cruise-top-return|TOPに戻る/);
  }
  assert.match(readFileSync(new URL('chord-cruise/js/app.js', root), 'utf8'), /bottomTopBtn[\s\S]*showScreen\('home'\)/);
  assert.match(readFileSync(new URL('pitch-cruise/script.js', root), 'utf8'), /pitch-bottom-top[\s\S]*showHomeScreen\(\)/);
  assert.match(readFileSync(new URL('fretboard_cruise/script.js', root), 'utf8'), /fretboard-bottom-top[\s\S]*state\.course = null[\s\S]*renderApp\(\)/);
  assert.match(appHtml[2], /sound-cruise-app-bottom-shell[\s\S]*id="app"[\s\S]*fretboard-bottom-top[\s\S]*in-game-refresh-bar/,
    'Fretboard keeps the dynamic app, TOP action and refresh bar in one vertical flex item');
  assert.match(css, /\.sound-cruise-app-bottom-shell[\s\S]*flex-direction:\s*column[\s\S]*width:\s*100%[\s\S]*min-width:\s*0/);
  assert.match(readFileSync(new URL('rhythm-cruise/script.js', root), 'utf8'), /bottomTopBtn[\s\S]*guardMicSetupInterruption\(goTop\)/);
});

test('Cruise Port settings entry uses the shared card language and isolated actions', () => {
  const port = readFileSync(new URL('cruise-port/index.html', root), 'utf8');
  const portApp = readFileSync(new URL('cruise-port/practice-menu-app.js', root), 'utf8');
  assert.match(port, /id="settings-sync-center-entry" class="sound-cruise-sync-settings-card/);
  assert.match(port, /4つのProアプリのクラウド同期を管理します。/);
  assert.match(port, /id="settings-sync-center-open"[\s\S]*クラウド同期を開く/);
  assert.match(port, /id="settings-sync-center-help"/);
  assert.match(portApp, /syncCenterOpen\.addEventListener\('click',[\s\S]*openSyncCenter\(history\)/);
  assert.match(portApp, /syncCenterEntryHelp\?\.addEventListener\('click',[\s\S]*SoundCruiseSyncUI\?\.openHelp/);
});

test('loading prevents duplicates and temporary feedback uses one five-second rule', () => {
  assert.match(renderer, /if \(controller\.busy \|\| button\.disabled\) return/);
  assert.match(renderer, /aria-busy/);
  assert.match(renderer, /temporaryFeedbackMs:\s*5000/);
  assert.match(renderer, /setFeedback\(message, kind = 'success', timeoutMs = 5000\)/);
});

test('Join failures, secret removal and conflict choices retain explicit contracts', () => {
  for (const code of ['app_join_expired', 'app_join_cancelled', 'app_join_consumed']) assert.match(bootstrap, new RegExp(code));
  assert.match(bootstrap, /joinField\.remove\(\)/);
  const conflict = read('./multi-app-conflict-ui.js');
  for (const label of ['この環境のデータを使う', 'クラウドのデータを使う', 'あとで確認']) assert.match(conflict, new RegExp(label));
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
