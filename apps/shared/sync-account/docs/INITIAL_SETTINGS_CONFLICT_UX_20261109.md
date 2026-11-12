# 初回設定競合の案内修正（2026-11-09）

公開基準 `73b0a820567fa0f597e46880f75e065cada86197` のPagesブランチをbaseにする独立Draft。音感2.32.5・指板2.27.7、Pro bootstrap v26。リズムの製品ファイル・参照v25は不変更で、共有bootstrapの新分岐もpitch/fretboard限定。Worker/runtime/adapter/保存契約は変更しない。公開しない。

## 本人端末の確定事項と限界

直前の正式再接続で両アプリの新資格と本人Accountの同一同期先attention・1件を確認した。各アプリはOutbox 0、Shadow 0、settings/settingsのinitial_merge競合1件。指板のreasonはsettings_field_conflict。本人採用は未実施。

今回のオフラインInspector観測ではコマンド実行とストレージ読取が安定せず、個別の設定キー・値の差分を取得できなかった。**実機で競合した具体的な項目は未確定**。themeが原因、実は同一内容、本人選択が必須、などとは断定しない。設定全文・資格・復旧コードは収集しない。本人の競合・Outbox・Shadow・接続資格に書き込まない。アプリ終了と通信復帰を本人に依頼し、復帰済みを確認した。

## コード上の原因

`multi-app-sync-runtime.js` のinitializeDatasetは、双方のsettingsをsettingsFieldPlanへ渡す。adapterのeffectiveSettingsForMergeは既定値を補い、Shadowのない初回統合では共通祖先を推測しない。同じ項目の異なる有効値が残るとinitial_mergeを保存し、attentionを報告して `{ok:false, code:'merge_conflict'}` を返す。

`multi-app-sync-bootstrap.js` のbindLandingはそれを `new Error(result.code)` として投げるため、codeがmessageに入る。旧catchはreason.codeしか見ず、「コードと通信状態を確認」という一般的な失敗文になる。接続済みなのにコード再入力を促す点も不適切。既存settingsカードはconflictController.refreshを開けるが、初回接続モーダルに明示導線がなかった。

## 最小修正

音感・指板のmerge_conflictだけをcode/messageから判定。現在runtimeに結び付いた既存controllerがあるときだけ「接続は完了しました。端末とクラウドの設定に違いがあります」と説明し、消費済みコードの再入力を止める。既存続行ボタンを「設定を確認して解決」にし、明示クリックでモーダルを閉じ、捕捉した元のcontroller.refreshを呼ぶ。

採用処理は新設しない。既存の項目別選択→resolveConflict→CAS/検証→初回同期再開を使用し、成功後だけcleanになる。authority・Account不一致・失効・通信失敗はこの導線へ流さない。

製品ロジック17行追加。新しいDB・永続フラグ・保存形式・同期phase・採用ロジック0。既存の一時的attention表示とボタンを使う。

## 自動解決の境界

A：同一内容は既存field mergeで自動収束。B：片側だけの追加、Shadowで片側変更と証明できるものは統合。C：同じ項目の異なる有効値が残る場合だけ本人が項目別に選択。D：Account/authority/schema等の拒否は停止。これは既存コードの分類であり、本人2件のA/B/C分類が確定した意味ではない。Dark投影をMidnightとのraw一致証拠にはできない。

## 検証

- 新導線8件：修正前6 PASS / 2 FAIL、修正後8 PASS。
- field merge・UI・wiringを含む重点51件：50 PASS / 1既存FAIL。元のUI/wiring37件も36 PASS / 1 FAIL。残るFAILは旧runtime v36期待と公開済みv38の不一致。今回緩和しない。
- 既存runtime関連6件PASS：項目別解決後15レコードへの初回統合、応答喪失後再開、既存Local採用、Account/authority境界。
- 既存競合UI14件PASS：項目別必須、Local/Remote、保留、部分失敗、再起動後の選択保持。
- Chromium/WebKit×音感/指板の実DOM4シナリオPASS：320px、理由表示、コード再入力非表示、明示操作で既存resolverを呼ぶ。未選択で採用/cleanしない。合成runtimeのみでネットワークなし。
- raw Dark/Midnightを本人選択なしで一致扱いしない回帰1件追加。

```sh
node --test apps/shared/sync-account/initial-settings-conflict-ux.test.mjs apps/shared/sync-account/settings-field-merge.test.mjs
NODE_PATH=/path/to/playwright/node_modules node apps/shared/sync-account/tests/initial-settings-conflict-browser.cjs
```

## 判定・次の最小操作

案内修正はローカルPASS。本人2件の設定差分と実機解決はHOLD。次は既存の設定→クラウド同期→解決方法を確認で差分を読み、Cなら本人が項目ごとの採用側を選ぶ。今回は選ばない。再接続・コード再発行・解除・強制DB修復は不要。候補の本番公開・実モデル評価も未実施。
