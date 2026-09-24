import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECOVERY_IMPACT, SYNC_DETACH_NOTE, describeLifecycleAction } from './sync-center-ui.js';

// Each confirmation states the Worker's actual revoke scope (account-lifecycle-database.js):
// current Port detach and Port revoke also end linked app sync, the app row ends every sync
// target of that app, one target ends only itself, and recovery requires everyone to reconnect.
const ui = readFileSync(new URL('./sync-center-ui.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('A: current Port detach explains that apps connected from this Port lose sync too', () => {
  const copy = describeLifecycleAction('current-environment', { lastPort: false });
  assert.equal(copy.title, 'このCruise Portの接続を解除');
  assert.match(copy.summary, /このCruise Portから接続した各Cruiseアプリの同期も解除されます/);
  assert.match(copy.summary, /ホーム画面版やブラウザ版のアプリが含まれる場合があります/);
  assert.match(copy.summary, /別のCruise Portから接続した同期先と、クラウド上・端末内のデータは残ります/);
  assert.equal(copy.syncNote, true);
  assert.equal(copy.severity, 'caution');
});

test('B: last Port detach adds the recovery-code requirement and keeps the Account', () => {
  const copy = describeLifecycleAction('current-environment', { lastPort: true });
  assert.match(copy.summary, /各Cruiseアプリの同期も解除されます/);
  assert.match(copy.summary, /保存済みの復旧コードが必要です/);
  assert.match(copy.summary, /アカウントは削除されず、クラウド上と端末内のデータは残ります/);
  assert.equal(copy.syncNote, true);
});

test('C: revoking a Port from the list covers the apps tied to that Port only', () => {
  const other = describeLifecycleAction('environment', { current: false });
  assert.equal(other.title, '選択したCruise Portの同期を解除');
  assert.match(other.summary, /そのCruise Portから接続した各Cruiseアプリの同期も解除されます/);
  assert.match(other.summary, /ほかのCruise Portとその同期先、クラウド上のデータは残ります/);
  const self = describeLifecycleAction('environment', { current: true });
  assert.match(self.summary, /このCruise Portに結び付いた各Cruiseアプリの同期も解除され、このCruise Portは未接続になります/);
  for (const copy of [other, self]) assert.equal(copy.syncNote, true);
});

test('D: a single sync target is removed alone', () => {
  const copy = describeLifecycleAction('app-environment');
  assert.equal(copy.title, '選択した同期先を解除');
  assert.match(copy.summary, /選択した同期先1件だけの同期を解除します/);
  assert.match(copy.summary, /同じアプリのほかの同期先、ほかのアプリ、Cruise Port、クラウド上と端末内のデータはそのまま残ります/);
  assert.equal(copy.severity, 'normal');
  assert.equal(copy.syncNote, true, 'its own pending changes are affected too');
});

test('E: the app row ends every sync target of that app', () => {
  const copy = describeLifecycleAction('detach', { appName: 'リズムクルーズ' });
  assert.equal(copy.title, 'リズムクルーズの同期を解除');
  assert.match(copy.summary, /リズムクルーズの同期先すべて（ホーム画面版・ブラウザ版・ほかの端末を含む）の同期を解除します/);
  assert.doesNotMatch(copy.summary, /だけを解除/);
  assert.equal(copy.syncNote, true);
});

test('F: recovery states that every Port and app must reconnect while cloud data remains', () => {
  assert.match(RECOVERY_IMPACT, /現在接続されているすべてのCruise Portと各Cruiseアプリ（ホーム画面版・ブラウザ版を含む）で再接続が必要になります/);
  assert.match(RECOVERY_IMPACT, /クラウド上の同期データは残ります/);
  assert.match(ui, /同期データ\$\{records\}件を復旧します。\$\{RECOVERY_IMPACT\}/);
  assert.match(ui, /次の操作で復旧が確定します。\$\{RECOVERY_IMPACT\}/);
  assert.match(ui, /以前接続していたCruise Portと各Cruiseアプリは、再接続が必要です/);
  assert.match(ui, /次の操作で復旧コードの更新が確定します/, 'recovery-code rotation keeps its own copy');
  assert.doesNotMatch(ui, /同期中の環境\$\{prepared\.summary\.activeDeviceCount\}件を復旧します/);
});

test('G: delete copy is unchanged and separate from sync disconnect', () => {
  assert.match(ui, /のクラウド上の同期データを削除対象にします。端末内のデータは削除されません。削除を確定すると、7日後に完全削除の対象になります。/);
  assert.match(ui, /4つのアプリすべてのクラウド同期データと、Sound Cruise Syncの接続情報を削除対象にします。/);
  assert.match(ui, /dataset\.syncSeverity = action\.severity \|\| \(action\.kind === 'delete' \? 'danger' : 'normal'\)/);
});

test('misleading scope claims are gone from every disconnect confirmation', () => {
  for (const phrase of ['ほかの環境は削除されません', '他の環境とクラウドデータは維持されます', '他の環境はそのまま利用できます',
    'クラウド同期接続だけを解除', '旧環境の同期資格情報は無効です']) {
    assert.equal(ui.includes(phrase), false, phrase);
  }
  for (const [kind, options] of [['current-environment', {}], ['current-environment', { lastPort: true }],
    ['environment', {}], ['environment', { current: true }], ['app-environment', {}], ['detach', {}]]) {
    assert.doesNotMatch(describeLifecycleAction(kind, options).summary, /削除されます|消えます/, `${kind} never claims data deletion`);
  }
});

test('the unsynced-change note is shown for disconnects, in both editions, without claiming certainty', () => {
  assert.equal(SYNC_DETACH_NOTE, 'まだ同期していない変更がある場合は、解除する前に対象のアプリを開き、「同期済み」になっていることを確認してください。');
  assert.doesNotMatch(SYNC_DETACH_NOTE, /必ず|絶対|安全です/);
  assert.match(ui, /lifecycleSyncNote\.hidden = action\.syncNote !== true;/);
  for (const path of ['./index.html', './pro_9a3943176561/index.html']) {
    const html = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(html, /id="sync-center-lifecycle-delete-note" hidden>[^<]*<\/p>\s*<p id="sync-center-lifecycle-sync-note" class="sync-center-lifecycle-sync-note" hidden><\/p>/);
  }
  assert.match(css, /\.sync-center-lifecycle-sync-note\[hidden\] \{ display: none; \}/);
});
