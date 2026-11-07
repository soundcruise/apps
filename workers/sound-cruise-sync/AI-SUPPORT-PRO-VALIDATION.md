# 一般Pro公開候補 — 検証記録

## 2026-11-07 本人β後の限定修正（Worker 0.2.1、未配備）

PR #225の既存head `27c0f73e6f6e38907e7fcfd159aa52ad0eb4eb92` へ追加する差分。
最新origin/mainは `63363dda56d054a949526c4a51959eda4c0d77eb`。
PR基点からのmain更新はStudio/NEWS等で、Worker/Portの対象ファイルに重複変更なし。rebaseやmain mergeは行わない。
本番v151 (`205877fd-5a1c-4d40-8f79-d37f2dd7b09f`) は100%、AI OFFのままであることをread-only APIで確認。
配備済み3モジュールのSHA-256も既存保全manifestと一致。本番は既存Worker + PR固定headのAIモジュールをwrapperで統合している。
本番独自のStudio export・ルート・既存設定を失う単純なentry配備を行わない。
今回の実装では本番デプロイ・AI有効化・有料推論・本番D1/R2変更は行っていない。Portは公開済み1.29.0のまま。

### 3課題の判定と限定差分

- A: 診断には今回の取得時刻と各端末の前回報告時刻があるが、過去の診断履歴は無い。
  履歴もuser/assistantの文章だけで、以前のtool結果は引き継がない。概要と詳細の不一致は別々の読取りの不一致であり、過去との比較ではない。
  この時間軸と会話履歴の出所を知識・tool説明・修正依頼文で明確化した。既存フィールドで足りるため診断情報は変更しない。
- B: 再確認はアプリ単位。取得失敗・概要と詳細の不一致・接続/初回同期の途中・クラウド側接続状態の確認が必要な場合に表示。
  前回報告のpending/errorだけでは出ない。非表示時は該当端末で対象アプリをネット接続中に開き、設定→クラウド同期を確認し、
  Portへ戻って同期センターを開き直し、件数ボタン内の前回報告/報告時刻を確認する案内を加えた。
- C: 既存の「確認先が分かれば原因不明と言わない」という一般指示が、Portローカル状態を取得しないという説明と競合していた。
  確認先と原因を区別し、固定の冒頭文の強制も外した。別アプリの前回報告からPortの再表示原因を結び付けず、
  同じ端末のPort上部の状態表示・操作時の表示文・再表示のタイミングを確認し、必要時は相談画面下部の「メールで報告」へつなぐ。

モデル内部の判断は直接観測できない。上記はコード上で確認できた説明不足・指示の競合を解消したもので、実モデルでの解消を実測済みとはしない。
runtimeの変更は`ai-support-policy.js`の知識/tool説明と`ai-support-guard.js`の修正依頼文だけ。
判定ルール・秘密検査・会話/診断ループ・1回修正・既存fallback・認証・利用管理・SELECT-only境界は変更しない。

### 質問2のフォールバック原因

既存β集計では3相談が各3モデル呼出で精算済み。質問2だけrepair=1/fallback=1、全体でunknown=0/処理エラー=0/未精算=0。
本文・回答全文・診断JSON・拒否カテゴリを新たに保存していないため、質問2の誤拒否/不正出力は**判定不能**。
`guardReply`は最初の回答が既存検査を通らない場合に修正分岐へ入る。
repairフラグは修正要求の安全検査より前に立つため、修正モデルを呼んだことまで保証しない。
安全な修正入力が作れない、修正出力が空/tool指定、修正呼出失敗、修正後も検査不合格のいずれでもfallbackになり得る。
既存の固定outcome=okも、回答品質合格や修正呼出エラー不在を保証しない。
保存済み合成実モデル評価v3-4ではS2のper_target_recheckが1回修正で成功しfallback=0だったが、これを本人βの原因と同一視しない。
推測によるガード追加・分類保存・本文記録は行わず、修正依頼文にも正しい代替案内と診断範囲を揃えた。

### 今回のローカル試験

Node 24.14.0。次の変更関連試験 **117 PASS / 0 FAIL / 0 SKIP**。

```sh
node --test --test-reporter=tap workers/sound-cruise-sync/test/ai-support-ui-guidance.test.js workers/sound-cruise-sync/test/ai-support-guard.test.js workers/sound-cruise-sync/test/ai-support-egress.test.js workers/sound-cruise-sync/test/ai-support.test.js workers/sound-cruise-sync/test/ai-diagnostics.test.js
```

- 合成の取得時刻/前回報告・現在の表示/登録件数・会話履歴/今回tool結果の分離を検証。
- 実UIのdetail関数でpending/error、接続中/初回同期、接続状態の注意、不一致、情報取得失敗、offlineの再確認条件を確認。
- 非表示時の具体的な代替案内、原因不明とPort側の具体策/質問/メールを併記した自然文は、そのまま通過しfallbackなし。
- 既存UI誤案内は1回だけ修正し、正常な修正回答は4呼出内でそのまま通過。
- 保存済み合成実モデル評価v3-4の12回答すべてが変更なし・追加修正なし・fallbackなしで通過。既存v143合成回答も維持。
- オフライン採点側も、固定冒頭文の一致と「確認先があれば原因不明と言わない」という旧検査/集計だけを撤去。自然な言い換えと確認先を伴う原因不明の説明が誤って失敗扱いにならないことを確認。新しい回答ガードは追加しない。
- 既存egress、認可/Account隔離、履歴、秘密情報、診断SELECT-only回帰を確認。費用管理の独立試験や30ケースの実モデル評価は反復しない。

スクリプト化providerは、修正したプロンプトを受け取る経路と回答を損なわない処理を確認するもので、モデルの推論品質を評価したものではない。
過去比較を作らないこと、ボタン非表示時の具体性、Portの誤推測防止と会話の自然さは、最終本人限定βでの実モデル確認が残る。
ローカル候補としてPASS、別途承認後の最終本人限定βへ進行可。一般Pro公開はHOLD。
残件は今回の3質問での受入と、既存の保守計上条件での公開判断/公開承認。新たな包括監査や基盤変更は追加しない。

## 初回実装時のローカル検証記録（0.2.0、以下は当時の記録）

日付: 2026-11-07 JST。作業開始基準 `20a734953b38bee6085f4ac29c236094c0d4291c`。
Worker 0.2.0、Port 1.29.0。PR #222の自然文・診断2ツール・履歴・1回修正・認証/egressを継承。
作業中のmain更新は `d053905141a0e75806a8a14fc24929632da0154c` (Studioのみ、対象ファイル重複なし)。
最終branchはこのmainへ合わせる。元の作業フォルダ・既存ブランチの未コミット変更は変更しない。

## 結果

| 確認 | 結果 |
|---|---|
| Worker `node --test workers/sound-cruise-sync/test/*.test.js` | 969 PASS / 0 FAIL / 0 SKIP |
| Port AI UI/client + cache graph | 46 PASS / 0 FAIL / 0 SKIP |
| AI関連 + production security + Port関連の重点確認 | 149 PASS / 0 FAIL / 0 SKIP（上記と重複するため加算しない） |
| 実ローカルworkerd/D1 | migration、同時16要求、精算、report SQL、retention PASS |
| SQLite別Worker thread/別DB接続 | 同時12要求に対し予約2枠だけ受付 PASS |
| 同時Promise要求 | 32要求でAccount/全体の各上限を超過しない PASS |
| Wrangler 4.131.1 deploy --dry-run | PASS、実アップロードなし、mode=off |
| git diff --check | PASS |

上限・使用量の新規試験17件に加え、既存route fixtureで認可・通常相談・Account間隔離・履歴/4呼出修正・秘密非保存を検証。
JST日/月/年/閏日の境界、両Account上限、両全体予算、usage欠落/部分値/不正値、タイムアウト、推論例外、
管理DB欠落・書込失敗・応答喪失・精算失敗、二重精算、HMAC誤変更、予約の非TTL解放、保持期間のtransaction rollbackを含む。
usage_verified=0の保守計上と、合成usageが検証済みという前提のusage_verified=1の両方を試験した。
実モデルusageの検証済みを意味しない。

## 再現

Node 24.14.0、既存lockfileのWrangler 4.131.1 / 既存Miniflareを使用。依存更新なし。

```sh
node --test workers/sound-cruise-sync/test/*.test.js
node --test apps/cruise-port/sync-ai-support.test.mjs apps/cruise-port/module-cache-keys.test.mjs
cd workers/sound-cruise-sync
npm run test:ai-support
npm run test:ai-usage:local
npx wrangler deploy --dry-run --outdir <temporary-output-directory>
```

既存の別worktreeのMiniflareを使用する場合、`AI_USAGE_MINIFLARE_MODULE`にそのmoduleの絶対pathを渡せる。
check-ai-usage-local.mjsは使い捨てのローカルDBだけを作り、AI binding・remote DB・R2は作らない。

## 保証の範囲・未確認

- SYNC_DBは既存SELECT-only/byte-identical試験を維持。新しい書込みは独立AI DBのみ。
- PR差分にStudio、NEWS、他4アプリ、shared、既存Sync DB migration、既存wrangler設定の変更は含めない。
- tuner-app.jsは版表示のimport cache keyだけ。音声・チューナー実装の変更なし。
- UI確認は既存のDOM/clientテスト。Safari/PWA/実端末でのレイアウト・実モデル回答は未確認。
- 保存済み合成回答を再利用。有料推論・全30ケース再評価・本番データアクセスなし。
- provider側の課金usageと実請求の照合は未実施。初期usage_verified=0で過少精算を避ける。
- 本番用AI D1、binding、HMAC secret、migration適用、本人限定実機β、一般公開は未実施。

## 判定

Draft PRにするローカル公開候補としてPASS。必要リソースを承認の範囲で準備した後の最小実機βへは条件付きで進める。
一般Pro公開は未承認・HOLD。残件は配備手順のリソース/設定確認、実機3〜4入力の受入、課金usageと保守計上の実用性確認。
新たな包括監査、Studio完成待ち、全件実モデル再評価を公開条件へ追加しない。
配備・停止・費用の保証範囲は [AI-SUPPORT-PRO-ROLLOUT.md](AI-SUPPORT-PRO-ROLLOUT.md) に記載。
