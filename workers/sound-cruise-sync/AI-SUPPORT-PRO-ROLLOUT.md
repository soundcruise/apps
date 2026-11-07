# AI相談 一般Pro公開候補 — Worker 0.2.2 / Port 1.29.0

基準: `20a734953b38bee6085f4ac29c236094c0d4291c` (PR #222統合済み)。
この文書は配備手順であり、本番操作の承認ではない。今回の実装では本番変更・有料推論なし。

2026-11-07 本人限定β後の追記: 現行本番はv154 (`0022218c-505e-49f3-bb76-55e37b66bca3`)、Worker 0.2.1、AI OFF。
Port 1.29.0と独立AI用D1・binding・HMAC secretは配備済み。今回のWorker 0.2.2は、モデル向け診断のscopeと知識/修正依頼文だけの未配備候補。
繰り返されたPortの誤推測、診断の適用範囲、ローカル試験の限界は [検証記録](AI-SUPPORT-PRO-VALIDATION.md) の冒頭を参照。

次回の承認済み配備では、既存AI D1・HMACをそのまま使う。DB再作成・鍵の再生成・既存migrationの再適用は不要。
本番v154はPR #225固定head `cd88b90a` のAIモジュールを、既存本番コードを保持するwrapperで配備したもの。
リポジトリのentryをそのまま配備しても本番固有構成を再現するとは限らない。
現行本番と保全パッケージを再照合し、旧候補bundleを使い回さず、新しい承認headからAIモジュールを作り直す。
`STUDIO_CANARY_POLICY` export・既存ルート・全binding/secret・変数・cron・公開制御を保ち、AI OFFで配備してから本人βへ進む。
この追記による本番操作の承認は無い。一般Pro公開は引き続きHOLD。

## 保持する機能と限定差分

自然文、診断2ツール、会話履歴20ターン、診断最大2回、モデル最大4呼出（修正最大1回）を維持する。
再確認の表示条件、前回報告と現在状態、Port自身の開始・再開と4アプリの自動同期の違いを知識説明へ補足。
操作ID・追加の回答正規表現・構造化回答・新しい診断ツールは導入しない。
今回変更する`tuner-app.js`は版表示モジュールへのcache参照だけ。チューナー機能・NEWS・Studio・他4アプリ・sharedは不変更。

## 上限の保証範囲

独立D1の`ai_usage_policy`が全Workerに共通の正本。初期値はAccount 10/日・100/月、全体1米ドル/日・10米ドル/月、警告80%。
後日の変更は承認済みの管理SQLでこの1行を更新する。Worker変数への重複設定や毎回の上書きをしない。
受付時刻をJSTへ変換した日・月に、その相談の全診断・修正呼出の費用を帰属させる。
日付をまたぐ呼出や遅れて到着する請求も受付日へ帰属する。Cloudflare請求書の日別/UTC期間とは一致しない。

予約額: 1呼出あたり入力131,072・出力131,072トークンを上限として、入力100万あたり0.40米ドル・出力0.85米ドルで計算する。
公開モデルの128,000コンテキストに対して2進数側にも余裕を取る。可視出力900トークンだけで推論トークンを見積もらない。
各provider入力全体には98,304 UTF-8 bytesの上限も設ける。文字数を課金トークン数と同一視しない。
入出力を別々に切り上げるため、1呼出163,841 micro-USD、最大4呼出の相談予約655,364 micro-USD (0.655364米ドル)。
この保守的な予約のため初期1米ドル/日では同時に1相談だけとなり、精算後に次を受け付けられる。
残額が予約額未満になると、実費1米ドル到達前でも受付を止める。これは保証を優先する意図した制限。

1回の条件付きINSERTでAccount日次/月次件数、全体日次/月次の予約込み残額を同時に確認・予約する。
確認と書込みを別要求にしない。D1 primaryの直列化とbatchのtransactionで複数拠点・同時要求にも適用する。
各`AI.run`の直前に同じ予約の呼出枠を永続化し、失敗したら推論しない。4呼出以上には進まない。
精算は1回のみ。完全な数値usageは保守単価・micro-USD切上げで計算し、推計額は表示単価0.35/0.75で別に記録する。
`usage_verified=0`が初期値で、usageが数値であっても実際に呼び出した分は1呼出上限額を計上し、未使用呼出枠だけ返す。
課金全体（推論を含む）を表すusageと確認できた後、別途承認の管理操作で`usage_verified=1`にすると数値使用量による精算を有効にする。
既存の受け付け済み相談は受付時の設定を保持する。usageの信頼性に問題が判明した際はAIをoffにして進行中の処理終了を待つ。
欠落・不正・不整合usage、例外、タイムアウトは1呼出上限額を残す。Worker中断、計数応答喪失、精算失敗は相談全予約を残す。
期限やleaseのTTLで未確定予約を解放しない。日付や月が替わっても以前の費用を0にしない。

保証は「この経路で受け付けた相談」に対する、確認したモデル容量・料金に基づく受付日別の上限である。
全Cloudflare請求額（税・為替・Worker/D1・他機能・他のAI呼出）を1/10米ドルに制限するものではない。
プロバイダの容量・課金仕様・usageの意味・単価変更はアプリが制御できない。配備時に以下の公式仕様と整合を再確認し、
数値usageで精算する設定において、報告されたusageが課金全体（推論を含む）を表すことを確認できない間は一般公開PASSとしない。
初期の保守計上設定でも上限は守るが利用可能件数が少なくなるため、一般公開時はその実用性も判断する。
有料評価で確認する場合も別途承認が必要。未知のモデルは上限管理が拒否し、qwenへの切替では回避できない。

- モデル/上限/表示単価: https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/
- neuron換算を含む料金: https://developers.cloudflare.com/workers-ai/platform/pricing/
- D1 batch transaction: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
- D1直列化: https://developers.cloudflare.com/d1/reference/faq/

## 保存と日次確認

`SYNC_DB`では従来のPro/Account認証と診断SELECTのみ。AI用migrationをSync DBへ適用しない。
新DBは月別Account HMAC（仮名識別子）、ランダム予約ID、受付日、モデル/方針版、件数、トークン、金額、固定分類だけ。
相談文・回答・診断JSON・同期先名・完全なAccount/端末ID・資格・raw IP・例外本文を保存しない。
HMAC secretをモデル・レスポンス・ログ・レポートへ出さない。DBに照合用tagを固定し、鍵の誤変更で回数がリセットされるのを防ぐ。
鍵変更は同月中に安易に行わない。必要時はAI停止・処理終了を確認し、月境界で管理下の移行を行う。勝手なtagの消去は禁止。

詳細は受付日終了から35日を過ぎた最初の日次処理でAccount識別子を除いた日別集計へ移し、400日を過ぎた集計を削除。
archiveとdeleteは同じtransactionで、再実行しても二重計上しない。未確定分は保守予約のまま集計。
日次処理は既存03:15 UTC (12:15 JST)のcronで、通常Sync cleanupと独立して実行。失敗は固定例外コードだけをプラットフォームへ返し、アプリ側ログは追加しない。
日次処理停止時は削除が遅れるため、report末尾の最古日も確認し、復旧後に追いつかせる。
D1 Time Travel等の提供者バックアップはアクティブ表の削除とは別で、提供者の保持期間が適用される。

`scripts/ai-usage-report.sql`は読取り専用。直近7日の件数・attempt呼出数・トークン・推計額・保守計上額・使用量不明・
未精算件数・遅延区分・エラー分類・修正/代替案内、日次/月次使用率、80%警告、匿名の最大Account使用数を出す。
呼出数は送信直前の永続化済みattempt。プロセスがその直後に終了すると実送信数との差が生じ得る。
usageは取得できた分だけで、未精算と使用量不明を併記する。0トークンを全体実費0とは解釈しない。
認可前拒否・上限拒否・管理DB障害は相談受付件数へ含めず、既存HTTP statusメトリクスで別に確認する。
任意フィードバック・本文の改善利用・専用ダッシュボードは後続。本文を保存する同意UIは今回追加しない。

## 初回配備で追加したもの（現在は作成・設定済み、再作成しない）

1. 本番Sync DBとは別のD1（推奨名 `sound-cruise-ai-usage`）。実際に発行されたdatabase_idを記録する。
2. WorkerのD1 binding `AI_SUPPORT_USAGE_DB`。そのbindingだけ `migrations_dir: "ai-usage-migrations"` を使う。
3. 十分な乱数から作る32文字以上のWorker secret `AI_SUPPORT_USAGE_HMAC_KEY`。値を引数・Git・報告へ書かない。

default `wrangler.jsonc`は既存本番binding・mode=offを維持し、新DBのIDを推測して追加していない。
binding/secret/schemaが無い候補をbeta/proで起動しても、AIだけ503で閉じ、通常Syncは動作する。
配備用configは最新本番のコード・全変数・binding・secretを確認して用意し、上記bindingを追加する。
Wranglerのbinding省略による自動provisioningへ依存しない。AI用migrationとSync用migrationを混ぜない。

承認後のコマンド形式（この実装作業では実行しない。プロジェクトのWrangler 4.131.1を使用）:

```sh
npx wrangler d1 migrations apply AI_SUPPORT_USAGE_DB --remote --config <approved-config>
npx wrangler d1 execute AI_SUPPORT_USAGE_DB --remote --config <approved-config> --file scripts/ai-usage-report.sql
```

上限変更の例（配備時の承認済み操作。値を確認してから実施）:

```sql
UPDATE ai_usage_policy SET account_daily=10, account_monthly=100,
  daily_micros=1000000, monthly_micros=10000000, warning_percent=80 WHERE id=1;
```

## 順序と公開判定

初回OFF配備・リソース作成・本人3相談・OFF復帰は実施済み。以下は共通の手順。
0.2.2の次工程は、別途承認されたOFF配備と質問3だけの本人限定β再受入。既存計数を保持して受付枠を確認し、既存リソースの作成工程は繰り返さない。

1. Draftをレビュー。上記課金条件を確認。migration・secret・bindingを別途承認の範囲で準備。
2. 最新コード/全既存設定を保ち、AI=offの候補を配信100%で配備。旧Workerの重み付き混在をしない。
3. 公開文書/Portの配布を確認。AI disabled、通常Syncの認証済み読取りを確認。
4. 本人1 Accountと明示UTC期限のbetaを別途承認後に実施。既知のUI案内・前回報告・メール・会話継続を3〜4入力確認。
5. beta中も管理SQLで予約/精算/unknown/費用を確認。欠落usageなら保守課金の動作と上限を実測記録する。
6. beta終了後は最新コード/他設定を保ったmode=offへ復帰。既存のβ期限も維持。古いWorker全体へrollbackしない。
7. 課金条件と実機受入が満たされたら一般Pro公開を判断。別途承認後に既存proモードを有効化。

AIだけの停止は `AI_SUPPORT_MODE=off`。またはAI用policyの`enabled=0`で新規受付を閉じられる（既に開始した相談は完了し得る）。
通常Syncのrollout/認可を変更しない。停止後も保持・集約・削除は継続する。
ローカル試験だけで実モデルの回答改善や本番課金仕様まで受入済みとは判定しない。
