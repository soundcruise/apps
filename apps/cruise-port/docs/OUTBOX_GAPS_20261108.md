# Port未記録変更・Outbox欠落の調査と限定修正

2026-11-08追記：以下は569dae80時点の調査記録。続く保存時journal対応と最新判定は [LOCAL_SAVE_JOURNAL_20261108.md](LOCAL_SAVE_JOURNAL_20261108.md) を参照。

## 判定

**限定修正のローカル試験PASS。毎日の手動再開問題全体／本番反映はHOLD。**
基準main `9efc189d`（前回 `614b381ad` からの追加は別ラインのreport機能）。
候補Port 1.29.1。mainの版は1.28.0、公開版は前回確認時1.29.0であり、このブランチのPort一式をそのまま公開してよいという意味ではない。
PR #225は変更しない。AI、Worker、実機データ、本番設定を変更していない。今回、実機への再問い合わせも行っていない。

## 事実と限界

前回の実機読取では、Account資格形状・active membership・migration complete・dataset ready・legacy inspected・過去の成功時刻があり、世代0、runtime停止、Outbox/競合各0だった。
Account別Shadowにない履歴11件と、内容が違うcycle1件があり、既存normalizerでの再シリアライズでは一致しなかった。Account帰属照合を満たさないため停止する。
未照合の削除意図0、画像metadata pending/release/discard/referencePending0だった。
ただし実機のlive Asset Syncオブジェクトの全状態や、今回12件のクラウド保存状態まで確認済みとはしない。
**実機の12件が以下のどの窓で生じたかを示す過去の記録はない。全件を同じ原因と断定しない。**

## 保存経路

| 経路 | UI／domain処理 | ローカル保存 |
|---|---|---|
| タイマー終了の履歴 | practice-menu-app.js の stopPracticeTimerWithHistory → createPracticeSessionEvent/appendPracticeHistoryEvent | savePracticeHistory。成功後にローカル専用timerを別途保存する |
| 手動履歴追加／編集 | 同ファイルの履歴フォーム／編集処理 → append/updateのdomain関数 | savePracticeHistory |
| チェック・リセット・次cycle | persistPracticeCheck / handlePracticeCycleReset / handlePracticeCompletionAction → persistPracticeProgress | savePracticeProgress |
| 履歴とcycleの複合更新 | persistPracticeActivity → commitPracticeActivity | 同じPort repository draft内でprogress/historyを更新 |

両storeは writePortStore → PortDatasetRepository.runWrite を利用する。
既存Account context/generation・CAS・Web Locksを確認し、localStorageのrepository pending journal → データ → final metaとして公開する。失敗時は既存rollback、回復不能ならrecovery-required。
これが保護するのは**Portのローカルdataset transaction**であり、Account別IndexedDB Outboxとの同一transactionではない。
metaのprotocol/generation/revision/keyRevisionsはdatasetの整合性情報で、新しい内容すべてのAccount帰属証明ではない。

commit後にnotify → SoundCruiseMultiAppSync.notifyLocalSave('port') → runtime.notifyLocalSave → microtask → sync('save')。
notify先runtimeが無い／破棄済みなら送信もOutbox記録も起こらない。ローカル保存は引き続き成功する。

## Outboxと送信確定

1. performSyncはオンライン時、最初にserverSnapshotを読む。
2. Shadow・local・remoteの照合／競合処理後、queueDiffが差分をAccount別Outboxへ登録する。
3. flushOutboxが既存operationIdで送信。失敗時は既存retry情報を保持する。
4. 成功応答はoperationのkey/hashと照合し、Shadowへサーバー確認済みのrecordを保存する。
5. Outboxを削除する。
6. 後続の全体snapshot／replaceShadowとlastSyncAt更新で通常同期を完了する。

**修正前の4・5は逆順だった。** deleteOutbox transaction完了からputShadow transaction完了の間に例外や破棄が入ると、クラウドは適用済みでもローカルには古いShadowと空のOutboxだけが残る。
既存own-echo経路は元々「Shadow→Outbox削除」だが、通常のpush成功経路だけ順序が逆だった。

## 確認できた欠落経路（別々の問題）

| 故障点 | ローカル | Outbox | Shadow | クラウド | 本PR |
|---|---|---|---|---|---|
| 最初のsnapshotでネットワーク失敗 | 新値あり | 未作成 | 旧値 | 未送信 | 未修正、再現済み |
| local commit後、通知実行前に破棄 | 新値あり | 未作成 | 旧値 | 未送信 | 未修正、再現済み |
| 停止中のローカル保存 | 新値あり | 未作成 | 旧値 | 未送信 | runtimeの不在により同じ窓。保存成功≠同期成功 |
| 送信成功後、Shadow commit失敗 | 新値あり | 修正前は消失／修正後は保持 | 旧値 | 適用済み | 修正・再現済み |
| Shadow commit後、Outbox削除前に中断 | 新値あり | 保持 | 新値 | 適用済み | 安全な再送を確認 |

履歴とcycleはdomain保存処理が別で、常に同じlocal transactionでもない。しかしnotify以降の共有経路と上記の欠落窓は両方に存在する。
Outbox0件は「最初から無かった」と「成功処理で先に消された」のどちらでも生じる。12件の送信状態や過去の分岐を推測で埋めない。

## 今回の限定修正

shared multi-app-sync-runtime.jsの**appId=portかつ非削除operationのpush成功／duplicate応答だけ**、既存acknowledgeOwnRecordでShadow永続化を完了してからOutboxを削除する。
応答recordがkey/hash不一致ならinvalid_responseとし、Outboxは残す。既存の照合関数を使い、新しい帰属許可を作らない。
他4アプリの分岐、削除・削除意図ACK、Account/Pro/Owner、帰属照合、schema、DB構成は変更しない。

同一transaction化はしない。順序で「成功応答処理中に少なくともOutboxまたは同じ内容のShadowが永続化済み」を保つ。
実IndexedDB storeのputShadowはrequest成功だけでなくfinish(transaction)までawaitする既存実装である。
Shadow commitに失敗すればOutboxを残す。成功後に削除が失敗しても両方が残る。次回は同じoperationIdとown echo照合で確定し、同じレコードを増殖させない。
Account変更／disposeにより次のwaitが拒否されても、証拠を先に削除しない。
この保証は**既にOutboxへ入った非削除operation**の成功確定に限定する。

Port版・Standard/Proのruntime取得keyを更新。tuner-app.jsはapp-version importのcache keyのみ、音声実装は不変更。
Studioのsource/test/config/asset差分はゼロ。ただし共有runtimeのPort分岐を変更しているため、Studio内Portも同じ新版runtimeを読み込んだ場合はこのACK順序になる。
Studio自身のcache更新と公開判断はStudioラインへ引き継ぎ、今回は編集しない。

## ローカル検証

変更前のfault injection：新規8ケース中4 FAIL / 4 PASS。履歴・cycleの各2ケースで、Shadow失敗時にOutboxが既に無いこと／削除前にShadowがまだ無いことを検出。
修正後の新規12ケース：12 PASS。実runtime、合成record、ローカルSQLiteのOutbox/Shadow各commitを使い、runtimeを再生成して検証。
SQLite fixtureはnative Safari IndexedDBの強制終了試験の代替ではなく、commit間の制御順序を検証する。
wire容量・authority文脈の既存mockは、成功recordを省略していたため、サーバー契約どおりのrecordを返すよう修正。試験対象の容量・上限・operationIdの期待値は維持。

最終関連試験：**310 PASS / 0 FAIL**。

```sh
node --test --test-reporter=tap \
 apps/shared/sync-account/multi-app-sync-runtime.test.mjs \
 apps/cruise-port/port-sync-controller.test.mjs \
 apps/cruise-port/practice-menu-history-store.test.mjs \
 apps/cruise-port/practice-menu-progress-store.test.mjs \
 apps/cruise-port/app-version.test.mjs \
 apps/cruise-port/module-cache-keys.test.mjs \
 apps/cruise-port/port-sync-status.test.mjs \
 apps/cruise-port/deleted-account-restart.test.mjs
```

既存の正常同期、ACK喪失、Account切替・遅延応答拒否、削除・再作成、帰属不明停止、Outbox/競合、他app runtime独立の回帰を含む。
新規SQLite試験は履歴／cycleの各々で、Shadow commit失敗、Outbox削除失敗、dispose、誤応答、初回network失敗、通知前破棄を確認。
実機の再起動・iOSのDB強制終了・同一Account再認証を含む最終製品受入は未実施。

## 残る本質的な作業

毎回の手動再開解消には、**ローカルcommitとAccount帰属付きの変更記録を、ネットワークより前に耐障害的に確定する保存契約**がなお必要。
単にcaptureOfflineSavesをtrueにしたり、queueDiffを前へ移すだけではlocal commit直後の強制終了／runtime不在の窓が残るため、完全解決としない。
localStorageとAccount別IDBは同一transactionに入らない。既存repository journalにAccount contextとexact mutationを原子的に結び付ける案、または既存IDB authority保存契約を使う案を、最小対象の練習保存で比較する必要がある。
既存の全datasetを一括で現在Accountへ署名し直したり、後からlocal_data_unconfirmedを許可したりしてはいけない。
原子的なjournal／Outbox連携は今回の限定ACK修正に推測で混ぜず、別の具体的保存契約として検証する。

既存12件は変更・削除せず、帰属不明のまま保持する。本PRは遡及的な証明を付けない。
その復旧は、本人による内容・接続先確認と別途許可された既存手動手順の問題であり、今後の欠落防止とは分離する。
必要な追加観測は合成環境のlocal commit／notify／queueDiff commit／push ACK／Shadow commitの固定phaseと、各段階の件数・Account世代・中断位置に限定。本文・認証情報や端末の実データをログ保存する必要はない。

## 適用前の条件

- 本PRは部分的な欠落修正のDraft。全体解決／本番反映はHOLD。
- 公開済みPort 1.29.0とmain 1.28.0、AI PR #225の配備済み成果を保全して統合差分を確認する。今回PR #225へ追記しない。
- 今後のローカル保存のdurable ownership/Outbox連携を完成させ、保存直後の通信失敗・即pagehide・停止中保存・Account再認証・切替・削除再作成・PWA再起動を通す。
- その後、合成プロフィールのSafari/PWA受入で中断後に証拠が残ることを確認する。実機12件をテスト材料として送信しない。
