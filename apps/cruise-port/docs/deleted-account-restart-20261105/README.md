# 削除済みAccountからの即時再スタート

基準main `aba0a6b25`。候補Port1.27.0 / Studio0.84.0。Worker・D1・R2・shared engine・4アプリ・認証契約・Owner admissionは変更しない。main merge/公開/実Account変更は未実施。

## 受入条件と実装

**削除処理の完了を待たず、同じnative Sync画面から新規作成または既存Account接続を開始・完了できる。**

- controllerは410 account_deleting/account_deletedを明示し、観測だけでは資格を消さない。native Port rendererに2つの正規操作を表示。選択すると説明と確認を出し、summaryで終端状態を再確認した後、既存Account DBのchangeAccountIfCurrent(expected,null)で資格だけを解除する。通信失敗・資格の回復・A→Bの変更は解除しない。従来の比較なしclearAccountと同じaccountキーのみの削除だが、別Accountを消すraceを既存CASで防ぐ。
- DBのchangeAccountIfCurrentは1 transaction内で期待するaccountId/credential/device参照を比較し、meta.accountだけをdeleteする。PortのAccount別DB、Outbox/conflict/shadow、ローカルrawデータ、Studio Projectを削除しない。世代通知で既存runtimeは停止する。
- 物理purge後の古い資格は401 invalid_account_credentialになり得る。この場合も手動で再スタート可能にするが、画面では「以前の資格が無効」と説明し、削除済みとは断定しない。通信障害ではこの操作を出さない。
- 終端エラー受信時、Port runtimeの従来設定ではclearCloudStateがOutbox等も消していた。既存エンジンoption retainTerminalIdentity=trueをPort側で有効化し、terminal状態で停止・保持する。エンジン実装は変更なし。Port HTMLのDB cache queryは既存CAS APIの版10へ揃える。
- 新規作成完了時にも既存のcanInitializeJoined/empty-local gateを使う。旧データがある場合、Account作成は成功してもPortの自動ensureを行わず、既存の明示的な送信・統合確認を必要とする。空データ・Standard・通常Account動作は既存テストで確認。既存Accountへのjoinは従来の同じgateを使用する。
- StudioではAccount切替時に旧iframeをinertにする保護が、再スタートの新規作成dialogも止めていた。entryAuthや全iframeの所有者判定は緩めず、明示解除後と接続完了後にSync専用iframeだけを退役・再生成する。既存Pro検証と期待Accountへの更新を待ち、正規native dialogを開く。他の編集iframe・Project・未保存フォームの所有者holdは維持する。

## サーバー削除ライフサイクルの読取り調査

account-lifecycle-database.js の deleteGraceMs は7日。削除確定時に delete_requested_at と purge_after=now+7日を設定する。wrangler.jsoncのScheduledは毎日03:15 UTC（12:15 JST）。app.js handleScheduled→cleanup-database.jsで期限到達済みmembershipを処理し、全membershipがdeletedになったAccountのみ最終purgeする。したがって数日間のaccount_deletingは仕様と整合し、単に数日残っただけでは停滞と判定できない。

本番の対象削除日時・purge_after・当日のScheduled実行結果は取得していない。7日超過やScheduled停滞の有無は**未確定**。本番DB/Workerの操作を行わず、既存のローカル削除ライフサイクルテスト29件を再実行して仕様を確認した。クライアントの再スタートはこの遅延に依存しない。

## 検証結果と限界

- 最終製品コードでChrome12/12、WebKit12/12 PASS。Port単独/Studio埋込 × deleting/deleted/server-invalid資格 × 新規作成/既存Account接続。初回解除確認のキャンセル、実作成/追加コードconsume、旧Account scope Outbox（UNKNOWNマーカーと終端エラー）保持、raw機材データ保持、新AccountのPort資格なし=自動開始なし、Studio Projectの保存bytes不変、Sync iframe操作可能/holdなしを確認。
- Studioのdeleting fixtureは削除から3日・猶予残4日、Port側は削除直後・猶予7日を再現。deletedはサーバー行のdeleted状態、物理purge後と同じ401応答は資格verifier不一致fixtureで再現する。実Accountや本番DBは使用しない。
- 通常接続・503/410/offline復帰・Pro単独入場・Owner OFF拒否/限定許可の既存3群は両engine PASS。Node200/200、skip0。別途worker既存削除テスト29/29。配布181ファイルとJekyll hash一致。
- **未確定事項**：同じ最終製品コードの先行WebKit実行でstudio deleted connectの案内表示待ちが1回timeout（9ケース通過後）。その後の全12ケースはPASSしたが、原因未確定なので再試行で解決済みとはしない。失敗記録も同梱。公開はHOLD、追加の限定切り分けが必要。

再現: 既存project-cloud.browser.mjsの隔離環境に STUDIO_DELETED_RESTART_ONLY=1、STUDIO_EXPECTED_PORT_VERSION=1.27.0 を指定。STUDIO_WORKER_ROOTは既存隔離fixture、STUDIO_NATIVE_ROOTはこのworktree、STUDIO_RELEASE_ARTIFACTは生成済み通常パッケージ。全通信をローカルfixtureへinterceptし実資格を使わない。

## Safari実機とPR #204

既存SafariタブをAppleScriptで読み取り、公開0.83.0 / attention / account_deletingを再確認。資格解除・追加コード発行/使用・新規作成・同期開始は一切していない。Safari実機で新フローのPASSとは報告しない。個別承認後の実操作が残る。

#204のhead `263005061a2ecea4b1a145359f7865858b17fbe3` は変更せずDraft維持。Homeコピー/右余白/診断追加は今回再適用していない。共通version/cache行は競合し得るため、将来統合時は#204の意味的なUI変更だけを新候補版へ適用する。本branchは通常mainから独立したPort正本の修正であり、Studio専用Account管理は追加しない。

[Port案内](port-deleting-create.png) / [Studio案内](studio-deleting-create.png) / [無効資格の案内](studio-invalid-create.png)。画像は合成Accountのみ。
