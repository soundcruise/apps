# Port Account復旧時の混入修正（2026-11-08）

ローカル根本修正PASS、iPhone試験C再受入へ進行可。本番公開は再受入前のためHOLD。
PR #235 input head: `74bac129061d882233f3261a2ef3af9f2fddd282`。
最新main調査基準: `35d93de27710e80640518947e449c321fb157dcf`。
本番読取: Port1.30.3、Worker v161 / d278abbd-6989-44ab-a9bf-f7539dc0c8d9 (100%)、AI OFF。

## 確定した経路

1. AのPortデータは通常の共通localStorage、帰属証拠は既存repository metadataのpendingSync。同期のShadow/OutboxはAccount別DB。
2. 正式な現在環境解除のAccountClient.detachCurrentEnvironmentはサーバー成功後clearAccountする。世代通知でcontroller.stopが実行され、runtimeは消える。後続clearCloudStateはruntime不在なら何もしない。通常データ・AのAccount別Shadow/Outbox・journalは保持される（破棄が混入原因ではない）。
3. BのAccountClient.commitAccountRecoveryは復旧コードの所有Account Bと新資格を保存する。Aのデータの所有権をBへ移す操作ではない。
4. 旧orchestrator.commitRecoveryはsettlePortSync()をjoined=falseで呼び、Port Controllerの明示的なensure()へ進む。resumePendingRecovery後も直接ensure()、通常のorchestrator.resume末尾もensure()。
5. controllerは正しくB別DBを開くが、migrationState未完了ならBのPort DeviceをprovisionしinitializeDatasetする。その入力localRecordsは共通localStorageに残るAのデータ。
6. 既存initializeDatasetは初回の明示統合用。Bクラウドが空ならローカルをそのまま採用し、非空ならmergeSnapshots。queueDiff(...,{migration:true})でB側Outboxを作りflushOutbox→B資格でpushする。
7. 送信前のAccount/generation検証は「現在の接続がBのまま」を正しく確認するが、「このローカルデータはBに属するか」の代用にはならない。Bへの初回統合前の検証を呼出側が省略したことが原因。

Aのjournal/ShadowをBへコピーしたり、journalをB証明として誤照合したことが主原因ではない。B初回移行経路はそれらを必要とせずローカルデータを取り込める。

## PR固有か

旧main（PR基点9efc189d）、固定head74bac129、公開配信branchのsync-center-orchestrator.jsはcache queryを除き同一。正規化SHA256は `5fa99057d9af00fb01351dee41de717370086446c243bc0a56a89698cdf18276`。
よって無断初期統合の呼出経路はPR #235以前から存在する。今回の新journalを原因として削除・再設計する必要はない。歴史上の最初の混入発生版まで遡る包括監査は行っていない。

## 切替・復旧・明示統合の契約

- Account切替: 独立したデータ移行命令ではなく、現在環境解除後にJoinまたは復旧で接続先を変更。端末データは保持。
- Account復旧: 保存済みコードのAccountの接続権を復旧し、旧資格を失効させる。UIはクラウドデータの維持と再接続を説明し、端末データの別Accountへの移管には同意を求めない。
- 明示的な端末データ統合: 既存「同期を開始・再開」のrenderSyncCenterView({activate:true})は非空データにwindow.confirmで「旧Accountのデータが残っている場合も送信対象」「送信・統合を許可しますか？」を確認し、その後だけensure()する。この仕様は維持。

## 最小修正

- Port ControllerにresumeAutomaticallyという所有者向け入口を1つ公開。既存ensure({resumeOnly:true})を呼ぶだけで、新しい同期モード・保存状態を作らない。従来のensure()は明示開始の契約のまま。
- automatic入口にも既存の画像・添付readiness確認を適用。Account世代guardで非同期確認中の切替を拒否。
- orchestratorのAccount作成・Join・復旧・通常状態更新を上記入口へ統一。従来のempty-Port確認、完了metadata、Account別Shadow/Outbox/競合とjournal fingerprint、Device所有検証を再利用する。
- 直接復旧と中断後復旧のclearCloudState呼出しを削除。復旧で既存の帰属証拠を消さない。
- 自動拒否はAccount復旧成功を取り消さず、Port側のcodeを返す。古いcontrollerと新しい呼出側が混在してもensure()へフォールバックせず停止。
- 機能ロジックはPortのcontroller/orchestratorの2ファイルのみ。新規API入口1、永続フラグ0、保存形式0、DB0、migration0。共通runtime製品コードは変更しない。
- 未公開候補の版1.29.3。変更module・boot・版表示のcache辺だけ更新し、その他の1.29.2辺は維持。公開Port1.30.3をこの古い候補ツリーで置換しない。

## 修正前後の再現と試験

本物のPort adapter・repository・controller・orchestrator・runtimeと既存合成serverを接続。Account別のDB/クラウドmapを分離し、Control-plane応答のみmock。実Account・本番書込なし。
固定head74bac129のcontroller/orchestratorへ一時的に差し替えた4試験で、Bへの不正pushが各1回発生してFAIL。最新版では同じ4試験がBへのpush0でPASS。未送信ケースは切替前にローカルcycle hashとAクラウドhashが異なり、journalが存在することも確認。

関連試験122 PASS / 0 FAIL:

- controller/orchestrator/版cache: 96 PASS。未帰属停止、再作成Account/新AppDeviceの旧証拠不使用、世代race、画像readiness、旧controller混在、Pro拒否を含む。
- runtimeのPort限定試験: 26 PASS。今回9ケースに加え、既存journalの5故障窓と履歴/cycleのShadow先行ACK12ケース。
- 今回9ケース: 未送信/同期済みA→B×即時復旧/応答断後復旧の4、証明あり同一Account再接続、空の新コンテナへのクラウド復旧、明示同意後の既存統合、資格変更で旧journal照合拒否、B既存ready baselineからの誤帰属拒否。
- B復旧後の再起動でも不正送信0。Aローカルデータ・journal・Shadow/Outboxは変化しない。
- 保存直後pagehide、snapshot失敗、offline復帰、Shadow失敗再送、同一Account自動再開、重複防止は既存の製品縦断試験でPASS。
- git diff --check PASS。最新mainと競合なし（製品ファイルをmergeする操作は未実施）。

試験コマンド:

```sh
node --test apps/cruise-port/port-sync-controller.test.mjs apps/cruise-port/sync-center-orchestrator.test.mjs apps/cruise-port/module-cache-keys.test.mjs apps/cruise-port/app-version.test.mjs
node --test --test-name-pattern='Port Account recovery:|Port journal product:|Port practice_history_event:|Port practice_cycle:' apps/shared/sync-account/multi-app-sync-runtime.test.mjs
```

## 保証範囲と残る最小受入

同じAccount・有効な同じ接続資格と照合可能な証拠では、未送信変更の自動再開を維持する。空の新コンテナでは、復旧AccountとDevice確認後に既存クラウドデータを受信できる。
同じAccountでも復旧で資格が更新され、未送信journalのfingerprintが照合できない場合は旧証拠を流用しない。Account復旧は成功し、端末データは残るが、自動送信には進まず既存の送信・統合確認に残す。資格更新をAccount ID一致だけで自動承認する修正はしていない。
実iPhoneで新候補のC再受入は未実施。削除済みA/Bは再利用せず、新しい隔離環境と別途承認されたテストAccountで、解除→別Account復旧→再起動までBへの送信0/A内容保持を確認する。明示統合ボタンは押さず、拒否状態を評価する。
一般向け公開にはこのC再受入と現行Port1.30.3成果を保全したcache/版統合が必要。新たな同期設計や包括試験は不要。
本人Account・帰属不明12件に変更なし。AI PR225、Worker、Studio、NEWS、他4アプリの製品ファイルに今回差分なし。Studio独自Project Syncは変更しないが、将来Port資産を更新すれば埋込みPortのAccount復旧にも同じ安全な自動経路が適用される。
本番操作、Account作成削除、D1/R2書込、iPhoneデータ操作は一切実施していない。
