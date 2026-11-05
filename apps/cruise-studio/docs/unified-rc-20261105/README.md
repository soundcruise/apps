# Studio 0.80.0 — 通常版への統合候補

正規の開発・配布sourceは `apps/cruise-studio/`。canary専用のsource patchを更新する運用を終了し、通常版の同じpackagerを使用する。これは正式リリース宣言やProduction公開の記録ではない。

## 入力と再現

- main: `b9a26bba559ce41ed8d2d00a1449c60307e82807`。#197は既にmerge済み。main・他worktree・既存PRのheadは変更していない。
- #194: `cf58b47f50f92c8e4521a35c104f335da4d59a0c` の既存Projectクライアントを#195経由で再利用。Workerを本PRへコピー・変更していない。
- #195: `d14a3145b4261a0c16eb5ef2abd8bd36fee93ec5` を一時checkoutし、#198固定head `803337e76ca4dc7eba0352ef5bc2a2ab4f114e28` の累積 `docs/ui-release-finish-20261105/source.patch` を `git apply --unidiff-zero` で適用。既存packagerから0.79.0を生成し、固定#198のcanary成果と **90/90 SHA-256一致**。
- そのsourceを通常Studioへ統合。0.80.0は通常入口のProjectクライアント接続、Cruise Syncからの既存Project操作への接続を含むminor候補。
- Pitch 2.32.0 / Fretboard 2.27.0 / Rhythm 1.23.0 / Chord 1.23.0の全変更は#198とbyte一致。Studio側の版mirrorとChord純粋モジュール参照だけを実際の版へ更新した。

再現用の一時checkoutは過去sourceの検証・合成backend fixtureにのみ使用。今後のStudio生成にそのcheckoutやsource patchは不要。

## 通常版と認可

- Midnight Session、Pro単独入場、未設定Midnight・明示選択保持、ヘッダー、11画面の高さ管理、右ペイン、Port・4アプリ、音声離脱停止、譜面・PreDTMをそのまま再利用。
- Homeの「Project Cloud（運営者限定）」暫定カードを常設しない。既存保存説明からCruise Syncへ進み、既存Port-owned Sync Centerと同じworkspaceにProject接続状態・再確認・既存Project画面への入口を表示する。新Account画面・第二Sync Centerはない。
- 実際のProject一覧・保存・取得・競合・復旧UIは既存の譜面側Hostを維持。未許可状態も表示するが保存操作はinert。表示やURLは認可根拠にしない。
- Proのみでローカル制作可能。AccountなしではOwner Session不成立、Project通信・書き込み不可。Account未接続の表示をPro資格と混同しないよう、CloudパネルのAccount文言だけを修正した。
- transport、Session adapter、durable client、codec、Project host、schema2、storage、raw revision repository、editing session、active documentの **10モジュールが再現sourceとbyte一致**。Web Locks・raw CAS・Outbox・Account帰属を維持。
- 既存Production transportの `production-canary` はサーバー運営者限定認可の契約名として残す。Owner activation、対象Account/Device/Project、Worker、D1/R2には差分なし。認可をgeneralへ変更していない。
- Homeから撤去したAccountカードの非表示常設mount・既存監視Controllerは#197から継承。Port-owned Account接続・再確認・復帰処理を保持。

## 旧canary URLと保存データ

`apps/cruise-studio-canary/index.html` と `project-canary.html` は同一originの通常Studioへ `location.replace` する互換入口。hashを保持する。localStorage/IndexedDBを読み書きせず、Project・Account・Outboxの自動移管・reset・削除を行わない。

既存の保存先はoriginに属し、通常版も同じ既存key・DBを利用する。別AccountのProjectを新たに採用する処理は追加していない。合成E2Eでは旧2入口への移動前後でProjectのraw文字列・Account ID・Outbox operation IDが一致することを確認する。

既に開いている0.79.0タブの遅延importを壊さないよう、残り88資産を#198固定byteで保持する。独立したcanary生成・更新は行わない。開いているタブを強制reloadしない。互換資産の削除は今回行わず、利用終了・バックアップ確認後の別判断とする。別originやSafari/PWAの保存領域間を移管できるという意味ではない。

## 配布・試験の再実行

```sh
node apps/cruise-studio/scripts/package-port-pc.mjs --out /private/tmp/studio-release-NEW
```

通常89ファイル＋旧URL互換90ファイル＝179。旧 `package-project-canary.mjs` は同じ関数への互換alias。通常81ファイルに既存Projectの7モジュールとCSSを追加した構成。実Jekyll safe buildとの全179 hash一致を確認する。開発入口、identity host、tests、docs、Workerは公開対象外。Port・sharedに差分なし。4アプリは通常の既存配布を利用する。

製品試験は通常 `index.html` と生成済み資産を使用。全requestをfixture内へinterceptし、隔離D1/R2と合成資格のみを使用する。`STUDIO_PROJECT_CANARY=1` は限定認可backendの試験指定で、別Studio入口の指定ではない。

```sh
STUDIO_TEST_RUNTIME=<既存Playwright/Miniflare/esbuild runtimeのpackage.json> \
STUDIO_WORKER_ROOT=<上記固定sourceの一時checkout> \
STUDIO_RELEASE1=1 STUDIO_NATIVE_ROOT="$PWD" STUDIO_EXPECTED_PORT_VERSION=1.26.2 \
STUDIO_RELEASE_ARTIFACT=/private/tmp/studio-release-NEW \
STUDIO_SCHEMA_SEED=<既存の使い捨てProduction構造fixture> \
STUDIO_PROJECT_RELEASE_PROFILE=1 STUDIO_PROJECT_CANARY=1 \
STUDIO_UI_ACCEPTANCE=1 STUDIO_ASSERT_PRODUCTION_SCHEMA=1 \
STUDIO_UI_BROWSER=chromium STUDIO_CLIENT_OUTPUT=/private/tmp/studio-product-NEW \
node apps/cruise-studio/tests/project-cloud.browser.mjs
```

`STUDIO_UI_BROWSER=webkit` でWebKit。既存4アプリの初回接続・双方向Sync・reload・実際の更新による受信・資格再利用試験は `STUDIO_NATIVE_APPS_ACCEPTANCE=1` で元の製品試験caseを再利用する。最終候補はChrome/WebKitの製品UI各35/35 PASS（捕捉エラー・合成Pro応答エラー0）、4アプリSync各29/29 PASS、Node 288/288（skip 0）、独立した復旧48/48 PASS。WebKitはユーザークリックに直した同一条件で2回連続PASS。全詳細・全一覧・全幅の組合せ網羅や実機PASSとはしない。詳細結果は `results.json`、配布hashは `integrity.json`。

## 実機受入の順序

以下は合成PASSと区別し、まだ実機PASSとしない。

1. 新規の検証用ブラウザprofileでProのみ認証。MidnightのHomeへ入り、Account未接続のまま譜面・PreDTMのローカル保存・再読込・JSON/MIDI/PDFを確認する。
2. クラウドアイコン／左メニュー→Cruise Sync。未接続表示とProject操作不可、既存Account接続UIを確認。実Accountの変更はこの作業では実施していない。
3. 承認済みの検証AccountでPort・4アプリのSyncを確認。Owner対象外ではProject保存不可、既存の運営者対象だけで保存・一覧・別端末取得を確認する。
4. 390pxの実iPhone Safari/PWAで11画面の末尾、長い一覧、詳細設定、モーダル、ソフトキーボード、ブラウザバー伸縮、safe-areaを確認する。
5. 実マイクの許可・再開・音程、タブ非表示／離脱／OS音声割込み後の停止、メトロノーム、右ペインを確認する。
6. 旧canaryの既存保存内容を事前バックアップした上で旧URL→通常版の可視確認。既存の開いたタブを安全に閉じられることを確認する。

追加連続実行でNEWSへの入口がPro待ちへ戻る例が1回あり、原因未確定として残す。WebKitの合成マイク待ちはユーザー操作なしのAPI遷移で発生したため、実際のメニュークリックへ修正し、同じstream開始・ended/closed条件で35項目PASS。autoplay条件のfixture仮説を支持するが、実マイクの受入とはしない。単回の合格と連続安定性は区別し、timeout増加・例外無視・期待値緩和では対処していない。正式公開判断にはこのfixture／実機での切り分けも必要。

最短の次工程は本Draftの差分・認可不変・試験残件のレビュー→明示承認後のフロント配布→上の実機受入。Worker変更やOwner一般開放は必要ない。main merge・Pages公開・正式リリース宣言は本作業に含めない。
