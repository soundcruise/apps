# Port 1.29.2 — 保存時の帰属記録で自動同期を継続する

## 判定と基準

**根本解決候補A/BはローカルPASS。本番反映は、既存配備成果との統合確認と最小iPhone受入までHOLD。**

- A：帰属照合済みの通常のAccount/datasetで、練習保存成功時に、その変更の帰属記録がネットワーク・runtimeと独立に永続化される。
- B：同じAccountでの再読み込み・復帰時、その記録を既存の照合に使い、手動開始なしに通常Syncへ収束する。
- 保存前から帰属不明のデータ、初回接続未完了、Account操作中などはAの対象外。従来どおりローカル保存可能だが、後から自動的に証明を付けない。

PR #235固定head `569dae80edbee9c1dd38d0f69f19f64741a32f6d` へ追加する。Shadow先行ACK修正を保持する。
最新origin/main `a037421ae749fbff928f41e641b7db64f82fae26` のPort/shared対象ファイルに重複変更なし。ブランチの基準mainは9efc189dのまま。main merge/rebaseなし。
本番Worker/Port/AI設定、PR #225、Studio・NEWS・他4アプリは変更していない。現在のiPhoneの12件も操作していない。

## 確定した根本の構造

ローカル保存はPortDatasetRepositoryのjournal/CAS/Account contextで成功するが、Outbox登録は後のnotify→runtime→最初のsnapshot取得→queueDiffに依存していた。
通信失敗・通知前の離脱・runtime不在でこの後半が実行されないと、ローカルだけが更新される。次回の帰属照合はShadow/Outbox/競合と一致せず、安全停止する。
この窓は履歴とcycleの両方に共通する。履歴のtimer終了/手動記録、cycleのチェック/完了/リセット、複合commitのdomain経路は変更しない。
過去の実機11履歴＋1cycleがどの窓で生じたか、既にクラウドにあるかは未確定。今回の修正はそれを推測しない。

## 最小実装

実装の変更は3ファイルだけ：

- port-dataset-repository.js：既存journalの最終metadataに帰属記録を含める任意hook。既存commit/rollback/CASを再利用。
- port-dataset-storage.js：通常のrepositoryへ、既存Port controllerのhookを接続。
- port-sync-controller.js：既存帰属照合を関数化し、保存前の確認と再開時で共用。保存時に練習変更のアンカーだけを作る。

独立DB・新しい保存管理層・サーバープロトコル・保存データmigration・domain schema変更・恒久Owner・lease・期限フラグは追加しない。
非同期の保存直後通知を保証の前提にしない。通知は通常Syncの開始にだけ使う。

### 記録する内容

既存 `cruisePort.datasetRepository.v1` metadataの任意項目 `pendingSync` 一つ：

```text
{version:1, binding:<SHA-256>, records:[
  {recordType, recordId, schemaVersion, payloadHash},
  // 明示削除の場合のみ：{recordType, recordId, schemaVersion, deleted:true, deleteIntentGeneration}
]}
```

対象typeはpractice_history_eventとpractice_cycleのみ。本文の二重保存、Account IDの単純stamp、資格情報の保存は行わない。
bindingは既存のAccount context（Account/device/Account credential）とPortのAppDevice credential/membership identityを合わせたfingerprint。
生の資格は関数内に留め、metadata・ログ・Sync payloadに出さない。新しいsecret設定や鍵配備は不要。
これは認証資格ではない。ProとサーバーのAccount/Device確認を代替しない。
UIの一時的なgetGeneration値を永続Account世代に見立てず、既存generation fenceを非同期準備と同期commit中の変更拒否に使う。

### 保存の順序

1. 既存のAccount context/generation、repository base/CASを確認し、私有draftを作る。
2. 初回Sync完了、active membership、ready dataset、成功履歴、legacy inspected、保留Account操作なしを、既存のAccount別storeで確認する。ネットワーク要求・runtime生成・provisionはしない。
3. 保存前の全データが、そのAccountのShadow/Outbox/競合/既存journalアンカーで説明できるか、従来と同じ照合を行う。Gearの正規化・削除意図の規則も同じ。
4. 説明できた場合だけ、今回変わる練習レコードの変更後hash（削除は既存意図generation）を作る。既に不明なデータには付けない。
5. 既存pending journal→データ→最終metadataの同期commitへ、アンカーを一緒に含める。最終setItem成功後にだけ保存成功を返す。
6. 既存通知から通常Syncを開始。runtimeが無くてもアンカーはすでに存在する。

localStorageとIndexedDBを一つのtransactionにしたという主張ではない。成功応答前のローカルjournal commitに、データとその帰属記録を結び付けた。
途中失敗は既存rollbackで両方を戻す。rollback不能でpendingが残ればinspectはrecovery-requiredを返し、未完了のアンカーを再開根拠として読まない。
WebStorage自身の消去・ブラウザ/OSによる領域喪失まで防ぐものではない。多重書込の衝突も既存CAS/lockの範囲で扱う。

### 再開と整理

- 同じnative Account/device/credential・Port AppDevice/membershipとのbindingが一致したアンカーだけを、既存のhash/削除照合に加える。
- Pro、画像未完了、Account保留操作、サーバーDevice確認等の既存条件は維持する。アンカーがあるだけでは認証も起動も許可しない。
- 通常のqueueDiff/Outbox/operationId/own echo/Shadow先行ACKへ戻る。新しい送信方式や再送ID方式は追加しない。
- アンカーはOutbox作成直後に捨てない。Shadowで確認済みのものを、次の実際の練習変更保存時に取り除く。現行キーごとに最新1件で、全履歴の永久的なコピーにはしない。
- 新しいcleanupタイマー・保存期限は不要。通常保存で整理する。
- 保存完了の既存local-data-changedイベントからも自動再開を試す。pagehideの停止は、activation完了前にも届くよう既存stopへ結ぶ。
- Pro再認証中でも、同じAccountのローカル帰属記録は保存できる。ネットワーク再開はPro回復まで従来どおり拒否する。ローカル保存に新しいPro制限は加えない。

## 境界・互換性

- Account Aの記録をBへ流用しない。資格やAppDeviceを入れ替えた場合もbindingが一致しない。保存中のAccount変更は既存generation/context guardでcommitを拒否する。
- サーバーでの削除・失効をローカルfingerprintだけで推測しない。従来どおり再開時の認証されたDevice確認が拒否すれば送信しない。
- 記録のhashと現在値が違えば、その内容へ権限を拡張しない。旧データを一括で現在Accountへ署名し直さない。
- 現在の12件は未証明のまま保持する。本候補を入れても、そのまま自動送信や自動削除はしない。復旧は本人確認と別の許可された既存手順として分離する。
- 旧metadataは新項目なしで読める。既存protocol=1、history schema=5、progress schema=3を維持。旧クライアントがmetadataを書き直して記録を落とした場合は、安全停止側へ戻り、データを消去/推定帰属しない。新版へ更新して使うことが受入の前提。
- dormantなIndexedDB Authority backendを有効化しない。今回の保証は現在稼働しているlocalStorage repositoryとowner controllerの経路。

## コード量とcache更新

実装は上記3ファイル、既存照合約40行は移動・共用。追加はおよそ100行規模で、状態はmetadata任意項目一つ。別サービスや運用リソースは不要。
Port版を1.29.2へ更新。依存するES moduleが同じWeakMap/repositoryを共有するよう、42の製品ファイルはcache queryだけを更新した。queryを除いた本文が完全一致することを機械確認。
ここにはAI-support等の依存importも含まれるが、AI機能・プロンプト・公開モードは変更しない。PR #225のbranch/headにも触れない。
Studio・NEWS・Worker・他4アプリのsource/config/asset/test差分はゼロ。
共有runtimeの製品コードに今回の追記は無い（PR #235のACK修正は維持）。追加shared差分は試験だけ。
Studio内Portへの反映は、Studioラインが新しいPort controller/store/module graphをまとめて採用する際に確認する。今回はStudioのimportやcache設定を編集しない。

## 試験

- 固定head569dae80の隔離worktreeへ新試験を載せると、保存アンカー/再起動の6ケースすべてFAIL。修正前の欠落を再現。
- 最終Node関連回帰：**432 PASS / 0 FAIL**。
- 本物のdomain save・repository・adapter・controller・runtimeを連結。runtime不在、通信失敗、オフライン保存、即離脱、cold restart、自動送信、ACK/Shadow失敗、重複防止、証明の整理を確認。
- 新しいAccount／AppDevice、保存中Account変更、Pro再認証、未知の既存データ、保存後の未証明改変、最終metadata失敗rollback、rollback不能pendingを確認。
- 既存のAccount削除/再作成、帰属不明停止、Account間隔離、他Port対象、isolated backend、保存互換性の関連回帰も維持。
- ブラウザ：**Chromium 5 / WebKit 5、合計10 PASS**。native Web Locks・IndexedDB・localStorage、完全なページ再読み込み、保存時offline、snapshot 503→再起動、pagehide/pageshow、別Account拒否。
- native保存領域を使うが、Account/Pro admissionとネットワークは合成。実アカウント、D1/R2、本番endpointは使わない。fixtureはlocalhost以外では保存処理を開始しない。
- WebKit build2370は端末のSafari/PWAそのものではない。実PWAのOS中断・再起動は未受入。

Nodeコマンド：

```sh
node --test --test-reporter=tap apps/shared/sync-account/multi-app-sync-runtime.test.mjs apps/cruise-port/port-sync-controller.test.mjs apps/cruise-port/port-dataset-repository.test.mjs apps/cruise-port/practice-menu-history-store.test.mjs apps/cruise-port/practice-menu-progress-store.test.mjs apps/cruise-port/port-account-save-guard.test.mjs apps/cruise-port/port-sync-status.test.mjs apps/cruise-port/deleted-account-restart.test.mjs apps/cruise-port/module-cache-keys.test.mjs apps/cruise-port/app-version.test.mjs apps/cruise-port/tests/idb-repository-backend.test.mjs
```

最後の既存isolated backend試験はtests/authority-storeのpinned fake-indexeddb依存を使う。必要ならそこでnpm ci --ignore-scriptsを実行。
ブラウザは隔離worktreeのローカルstatic serverを起動し、インストール済みplaywrightで `tests/local-save-journal-browser.cjs http://127.0.0.1:8766` を実行する。WebKitの既存実行パスはPORT_JOURNAL_WEBKIT_EXECUTABLEで指定できる。実施時はPlaywright1.65、既存Chrome、WebKit2370を使用。

## 配備前に残る最小受入

設計追加や包括監査は不要。次は承認された候補配備と、既存12件を使わないテストAccount/隔離プロフィールによるiPhone受入に限定する。

1. 公開済みPort1.29.0、配備済みWorker/AI OFF、PR #225の成果を欠落させない統合パッケージを作る。mainの1.28.0をそのまま上書き公開しない。
2. その後、確認済みAccountで練習保存→即背景/アプリ終了→PWA再起動を行い、手動再開なしに同期・Outbox空・Shadow一致へ戻ることを確認。
3. オフライン保存→オンライン復帰を一度確認。Account切替で古い記録を送信しないことも確認する。
4. 既存12件への遡及的な処理、Worker再配備、AI有効化は含めない。

ローカルA/B達成と実機受入は区別する。今回、本番操作・merge・実機保存変更は行っていない。
