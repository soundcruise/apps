# Account再スタート：同一資格の再観測との競合修正

基準main `45a560361d154962e60759447829cbb7992ad173`。独立branch
`codex/safari-account-release-fix-20261105`。候補Port **1.27.1** / Studio **0.84.1**。
main merge・Pages公開・実Safariの解除再試行・実Account/Project操作は未実施。

## 原因と証拠の範囲

公開中のPort controller/UI/appを取得し、基準mainとSHA256一致を確認した。
UI確認→controllerのsummary再検証→binding照合→既存DB CAS→Studioホストへの引き渡し、という経路である。
Portの復帰時確認（online/focus等）は、解除用summaryが通信中でもreadOnly loadを実行できる。
410を再観測すると、同じAccount/credential/device/generationでも`deletedBinding`は新しいオブジェクトになる。
解除側の`deletedBinding !== binding`はこれを資格変更と同様に拒否し、CASより前で
`account_deletion_unconfirmed`になる。旧資格・世代・保存状態が変わらない理由とも整合する。
Studio親のAccount観測は別controllerなので、それだけではこの参照を更新しない。

- 修正前のcontrollerで、deleting/deleted/invalid × readOnly/通常loadの6ケースすべてが再現。
  [修正前ログ](race-before.log)。資格/世代は同一で、CAS呼び出し前に拒否された。
- 修正前の公開0.84.0製品を隔離WebKitで実行し、解除用summaryだけを保留し、
  native Portのonlineイベントによる別のsummary確認完了を待ってから保留を解放すると、
  同じ解除失敗UIが再現。[製品記録](baseline-product-race.json)。
- 修正後は同じ競合を12通りの製品フローに注入して通過。

**過去の実Safariの当該1回と完全に同一原因だったことまでは未確定。**
公開0.84.0は内部例外を同じUI文言へ集約し、当時の例外記録がない。
今回、実Safariの資格解除を再試行していない。推測だけの変更ではなく、実在する製品競合を
上記の単体・製品再現で立証し修正した候補である。WebKitを実Safari PASSとは扱わない。

## 最小修正と診断

- bindingは参照ではなく、Account ID・credential・device参照・generationの全一致を比較する。
  active回復や別bindingへの変更は拒否し、既存`changeAccountIfCurrent`の単一transaction CASを必ず通す。
- 通信中の世代変更は既存AccountClientでも中止される。通知の届かないraw DBのA→B変更も
  既存CASが拒否する。sharedのCAS/DB/Sync engineは変更しない。
- controllerの失敗段階、HTTP status、限定したerror name/code、世代/binding一致boolean、
  CAS試行/成功booleanだけを一時診断として残す。native viewの
  `data-account-restart-diagnostic`から読み取り可能。永続化・送信・自動ログ出力はない。
  Account ID、credential、token、追加コード、本文、任意の例外messageを含めない。
- 解除後の画面引き渡し失敗はCAS前の失敗と区別する。Studio専用Account管理は追加しない。
- Portのmodule queryと版表示を1.27.1、Studioの既存version/cache参照を0.84.1へ更新する。
  Studioの機能実装、通常source一本化、旧canary互換資源は維持する。

## 回帰・保存保護

[受入結果](acceptance.json)：Chrome/ WebKit各16件PASS、pageerror 0。
Port単独/Studio埋込 × deleting/deleted/invalid × 新規作成/既存接続の12件は、
キャンセル後の資格保持→競合中の解除→正規dialog→合成Account作成/追加コードconsumeまで確認した。
旧Account scopeの非空Outbox UNKNOWN、ローカル機材データ、Studio Projectの保存bytesを保持し、
新AccountのPort credential未発行（旧データの自動同期開始なし）を確認した。
StudioのSync iframeは再生成後も操作可能で、他のProject owner holdは緩和していない。

追加の最終診断試験はChrome/WebKit各5件PASS：Pro単独/AccountなしのHome入場、
通信切断、active回復、世代変更、通知前のraw DB変更による実CAS拒否。
いずれも旧UNKNOWN/localデータ保持・接続dialog未表示を確認する。
段階別の非秘密診断は本フォルダの`chromium-*.json` / `webkit-*.json`を参照。
最終の診断語彙調整後はこの5件を再実行し、既に通過した12通りの成功フローを全面再実行していない。

Node **243/243 PASS・skip 0**。[ログ](node.log)。同一binding競合、active回復、network/timeout、
世代/credential/Device変更、CAS拒否、診断の秘密情報除外、既存Account coordination、
Port join/送信gate、Pro/Project session、module cache、packageを確認。
Recoveryのstatic guardは`===`を保存代入と誤検出していたため、代入/オブジェクトpayloadを引き続き禁止し
比較を許可する形へ修正（代入2例を拒否するassertも維持）。
既存package試験の89ファイル期待はmainでもFAILで、実際の91+90=181へ訂正した。
Port版表示試験の古い1.26.2とStudio版期待は候補版に追従した。skip追加や機能期待の緩和はない。

配布は既存packagerから181ファイル（通常91/互換90）を生成し、全SHA256一致。
0.84.0から通常Studioの11ファイルだけが変わり、全て版/cache参照。互換90ファイルは不変。
[hash manifest](distribution.json)。Portの変更資源は通常の既存公開先に置く。
Worker/D1/R2、shared、4アプリ、NEWS、保存schema、認証契約、Owner admission、Sync engineは無変更。
既存のOwner許可/拒否・広範なSync試験は#206の合格成果を再利用する。

## 再現コマンド

Nodeは`NODE_PATH=/private/tmp/studio-project-runtime/node_modules`、
`STUDIO_TEST_RUNTIME=/private/tmp/studio-project-runtime/package.json`で実行した。
製品試験は既存`apps/cruise-studio/tests/project-cloud.browser.mjs`を使用。
既存の保存済みWorker fixture `/private/tmp/studio-unified-canonical`と
`STUDIO_SCHEMA_SEED=/private/tmp/studio070-remaining-rerun/native-score073`を読み、
各実行先の新しい/private/tmp内へ合成DB/profileを複製する。実ブラウザprofileは使用しない。

```
STUDIO_RELEASE1=1
STUDIO_PROJECT_CANARY=1
STUDIO_PROJECT_RELEASE_PROFILE=1
STUDIO_DELETED_RESTART_ONLY=1
STUDIO_RESTART_RELEASE_RACE=1
STUDIO_RESTART_RELEASE_GUARDS=1
STUDIO_EXPECTED_PORT_VERSION=1.27.1
```

`STUDIO_NATIVE_ROOT`は本worktree、`STUDIO_RELEASE_ARTIFACT`はpackager出力、
`STUDIO_TEST_RUNTIME=/private/tmp/studio073-runtime/package.json`、
`STUDIO_WORKER_ROOT=/private/tmp/studio-unified-canonical`、
`STUDIO_CLIENT_OUTPUT`は新しい/private/tmpディレクトリ。
`STUDIO_UI_BROWSER=webkit`でWebKit、未指定でMac Chrome。
最終診断の5件だけは`STUDIO_RESTART_GUARDS_ONLY=1`。全通信をfixtureへinterceptし、
未知のURLとWorkerからのProduction outboundは拒否する。
baselineだけは元の0.84.0/1.27.0配布を指定し、`STUDIO_RELEASE_RACE_BASELINE=1`で
1件に制限。timeout増量・retry増量・認証省略はしない。

## 公開判断と実Safari再受入

修正候補の合成受入はPASS。レビュー/明示承認後の限定公開候補にできる。
正式リリースの実Safari受入はHOLDのままで、公開も実資格の変更も今回行わない。

公開後、旧資格・世代・localStorage/対象IDB/UNKNOWN/Projectを非秘密hashで比較し、
キャンセル保持を再確認する。別途明示承認された実操作では、削除中/削除済みをサーバー再検証して
解除→Chromeの既存Accountの正規追加コードで接続→内部Account一致→保存保持→通常reloadを確認する。
旧データの送信/移管には同意しない。失敗時は再試行を重ねず、native viewの安全診断で
summary/binding/CAS/handoffのどこで拒否されたか確認する。OS/Safari設定や認証ガードは迂回しない。

[修正前の案内](before.png) / [修正後の接続dialog（合成・入力欄マスク）](after.png)
