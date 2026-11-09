# 自動収束・解除UX — 独立監査資料

## 候補と依存関係

Port 1.32.0候補。本番未配備。PR #253のhead aae680f8を親とする依存Draft。
PR #253の503/429/通信例外pending報告・版/cacheを保持し、その上の差分はPort内だけ。
公開tree68112995、main4865c68fを確認。mainや他ラインの全treeは取り込まない。
Worker v162・AI OFF、Studio/NEWS/4アプリの機能は変更しない。

## 確定原因と解除の意味

- Workerの報告集計は有効AppDeviceだけが対象。解除は対象AppDevice資格を失効させる。
- 解除すると古いattentionが集計対象外になるが、それはデータ送信・検証成功ではない。
- Portの旧「✓ 同期済み」はreadyなクラウドと残る同期先の集計に基づく表示だった。
  解除されたiPhoneアプリが未接続でも表示でき、解除を修復と誤認しやすかった。
- 問題詳細にも解除ボタンと未使用同期先の解除案内があり、修復と接続管理が混在していた。
- 資格失効後の既存runtimeはclearCloudStateで同期metadataを消す経路を持つ。
  通常のローカル保存内容は別領域に残るが、Outbox/Shadow=0だけで保存内容がクラウドと一致とは判断できない。

根拠: Worker account-database.js/getAccountSummary、account-lifecycle-database.js/revoke系、
共有runtime detachTerminalIdentity、Port appSyncStatusPresentation/describeLifecycleAction。
既存のサーバー失効・削除契約は変更しない。

## 最小修正

1. 問題行と報告詳細から解除操作を削除。既存の閉じた「Cruiseアプリの同期先を管理」に集約。
   同期先ごとの解除は同じappDeviceIdで既存確認へ進む。アプリ全体の解除も同じ管理内に保持。
2. 解除前に「対象アプリは未接続になる」「再接続するまで同期しない」「同期の修復・完了ではない」と明記。
   成功応答後も同じ意味を表示。失敗時に成功表示しない。
3. 4アプリのready表示を「クラウド利用可」に変更。Port自身の実runtimeに基づく「✓ 同期済み」は維持。
   全体の0件表示は「接続中の同期先に確認報告なし」。未接続端末の完了を主張しない。
4. 未接続と表示される場合は、既存管理の「同期先を追加」→同期コード→対象アプリの
   「Cruise Portと接続」へ条件付きで案内。勝手にコード発行・接続・アプリ遷移しない。
5. 新しいDB/状態enum/永続フラグ/競合形式なし。既存のHTML折り畳みとcallbackを再利用。
   通常の修復導線から解除ボタン・重複状態表示を減らした。新しい共有runtime変更はない。

## 自動解決と一度の選択

| 状態 | 既存処理 / 今回の扱い |
| --- | --- |
| 一時通信失敗 | PR #253の既存timerで再試行、実同期成功後だけclean |
| ACK喪失・同じoperationの再送 | operation IDとrecord key/hashが一致するown echo、Shadow先行ACK |
| Midnight旧v1保留 | v2更新後に既存operation IDで再送。投影Darkを生の一致証拠にしない |
| Portの既に一致した残存競合 | 既存の一致確認付き解消のみ |
| 内容一致terminal / 別operation | 本人操作の証拠不足のため新しい自動確定を追加しない |
| 通常の真の競合 | 既存アプリUIのapplyAll(local/remote)は一度の選択から送信・検証まで進む |
| 設定field-level競合・壊れたデータ | 安全な個別選択を維持。全項目一括採用で上書きしない |
| revision進行・保存失敗・部分失敗 | 成功した分だけ反映し、残りを未解決として保持 |
| ローカル空、クラウドありの初回接続 | initializeDatasetの既存クラウドhydrate。ローカル非空を推測で空としない |
| Account/Owner不一致・資格失効・削除意図不明 | 既存停止と証拠保護を維持 |

根拠: multi-app-sync-runtime.js initializeDataset/acknowledgeOwnEchoes/performSync、
multi-app-conflict-ui.js apply/applyAllとbulkボタン。共有engineを再実装しない。

## 本人3アプリ — 現在の読み取りと再接続計画

今回のAccount限定SELECTでは、以前の問題報告元3件はすべてrevoked。
有効同期先は音感6、指板6、リズム7、いずれも有効attention/error報告0件。
これは本人による解除の結果であり、問題報告元から新しいcleanが届いた証拠ではない。

今回はSafariのiPhone検査一覧に検査可能なページがなく、アプリを新規起動していない。
前回観測の既存PWAは資格/membershipなし、credential_invalid、Outbox/競合/Shadow各0。
現在のローカル保存値とクラウドの一致は**未確認**。この状態で復旧・採用・送信は未実行。

正式な再接続はAccount全体の復旧ではなく、本人Accountで対象アプリの同期コードを発行し、
各PWAの「Cruise Portと接続」へ入力する手順。新AppDevice資格登録と初期同期が発生する。
consumeInvitationのpreservePending、initializeDatasetのバックアップ/merge/競合確認を使う。

実行前に必要な最小条件:
1. 既存PWAを変更せず保存内容をバックアップし、正規adapterのID/schema/hashとクラウドをAccount限定照合。
2. 本人Accountを確認し、同期コード発行/入力・資格登録・初期同期（取得/送信/Shadow更新）の承認を得る。
3. 一致・片側だけの記録は既存処理で収束させ、異なる変更は既存UIで本人が選ぶ。
   この承認に競合の代理採用・Account切替・データ削除は含めない。

ローカルが保持される契約はあるが、現物比較前に無変更・無重複・クラウド優先を保証しない。
復旧コードでAccount全体を回復させたり、旧同期資格を再利用したりしない。

## 検証・独立監査で確認してほしい点

- Port表示/操作/解除影響/版/cacheのNode138件PASS。
- 既存runtimeの自動回復・own echo・一致解消・真の競合・Account/authority保護等21件PASS。
- 既存競合UIの一度のLocal/Cloud選択・部分失敗・field-level保護等5件PASS。
- Chromium/WebKit各112チェックPASS。通常/Pro・実DOM/IndexedDB、320/393px。
  修復面の解除0、管理面の明示確認、キャンセルは呼出0、確定時のみ合成解除1回と成功文言を検証。
  実ユーザーの解除・再接続ではない。合成保存領域は変化せず、外部通信は遮断。
- Midnight全52件等は再実行しない。新差分ではadapter/runtime/Worker/テーマ実装がbyte不変。

監査論点: 警告を隠す変更ではないか、解除のscope/確認が変わっていないか、
残った同期先の集計を未接続端末の成功と誤認しないか、既存applyAllを再発明していないか、
新しい状態を増やさず操作を減らせているか、本人データの復旧計画が未承認の送信を含まないか。

候補はローカル検証PASS。本人の再接続・実データ一致受入はHOLD（未承認・未実施）。
公開はPR #253との依存差分レビューと別途承認後。今回、本番配備・Worker設定変更・AI有効化なし。


## 最終監査の限定反映（Port 1.32.0）

通常版・Pro版のヘルプで、Port自身の「同期済み」、4アプリの「クラウド利用可」、解除後の未接続を区別した。解除成功の同一通知を定数で共有し、既存の確認/API/保存処理は変更していない。候補版とcacheは1.32.0を維持。新しい状態・保存形式は0。

`sync-center-copy.test.mjs` と `sync-target-naming.test.mjs` は、修復面に解除がないこと、管理面の対象ID・確認文、Accountの現在端末判定を検証する。簡易DOMの子要素検索を現行描画に合わせた。関連する `sync-center-ui.test.mjs` のヘルプ期待値も更新した。skip/todoは追加していない。

`sync-*.test.mjs` 比較：変更前244件（232 PASS / 12 FAIL）、変更後245件（241 PASS / 4 FAIL）。新規失敗0。残る既存失敗は `sync-attention-ui.test.mjs` の旧count期待1件と、`sync-center-orchestrator.test.mjs` の構造化同期利用不可時の期待コード3件。今回の対象外として保持した。

対象2ファイルは19/19 PASS。版/cacheを含む重点試験21/21 PASS。一時エラー報告関連runtime11/11 PASS。実DOM/IndexedDBのChromium112項目・WebKit112項目PASS。本人データや再接続は未操作。本番公開は未実施。後続の本人受入は最新版アプリ→Portの同期コード→アプリの「Cruise Portと接続」→既存初期同期を用い、真の競合のみ本人が採用側を選択する。
