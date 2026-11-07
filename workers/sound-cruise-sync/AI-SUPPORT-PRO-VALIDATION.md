# 一般Pro公開候補 — 検証記録

## 2026-11-07 診断要求・実行ゲート（Worker 0.2.3、未配備）

既存head `b58751a958f03ce50022f868f45f41abbc2f10d9` への追加。最新origin/main `4cfbea2c` のWorker/Port対象ファイルに重複なし。
PR #225を維持し、main merge/rebaseは行わない。本番v157 (`ae8d9611-2f3c-45ee-b6ed-e537e8d4da0f`) @100% / AI OFFをread-only APIで確認。
今回、本番デプロイ・AI有効化・有料推論・本番D1/R2変更・Port/Studio/NEWS/他アプリの変更は行わない。

### 何が記録から分かるか

0.2.2の質問3は3モデル呼出、repair=0、fallback=0、処理outcome=okで精算済みだったが、意味内容はHOLD。
実際のtool名・引数・モデル内部の判断は保存されておらず、3呼出だけから厳密な選択順序は確定できない。
コード上は、毎回の初期要求で両ツールが利用可能で、認識された名前/引数なら相談対象の制御なしに実行し、完全なアプリ診断を渡していた。
0.2.2のscopeは結果を読んだ後の解釈用で、診断要求や結果提供を止める機能ではなかった。
修正はUI表現・秘密・内部語等の既存検査違反で起きる。この因果関係の誤推測はそこを通り、修正が発生しなかった。

### 最小の構造変更

既存2ツールの要求に`consultationScope`を必須化し、結果を見る前に現在の相談対象を宣言させる。
値は`port_local` / `apps` / `mixed_or_unclear`。別のAI・分類用呼出し・自然文正規表現・ツールは追加しない。
`getAppSyncTargets`のappIdはアプリ診断時に必須。Port専用では架空のアプリ選択を要求せず省略できる。enum外のIDやAccount指定は引き続き拒否。

| 宣言された対象 | Workerの実行と提供 |
|---|---|
| Port自身のみ | 2つの診断メソッドを呼ばず、`data=null`・アプリ情報未取得・Port状態未観測を返す。次の要求ではツールを渡さない |
| 4アプリ | 従来の全体概要と指定アプリの同期先/前回報告を維持 |
| 横断・対象不明 | 従来の情報を利用可能にし、Port未観測のscopeを保って区別 |
| 対象なし・不正引数 | アプリ取得へ暗黙にdefaultせず、既存の無効tool応答にする |

同一batch内の全要求を実行前に確認し、Port専用宣言があれば先頭のアプリ要求を含めて提供を止める。
同一turnでPort専用へ狭めた場合は、既に受け取ったそのturnのtool結果も後続completion/修正要求へ再送しない。
Port専用からの同一turn内の拡張は認めず、次のユーザーturnでは対象を初期化して選び直せる。
結果は「アプリが正常/未接続」ではなく「取得していない」。一般仕様、同じ端末の状態表示/説明、再発タイミング、メールを自然文で案内できる。

最大モデル4呼出・診断2実行・1回修正、同時予約/精算、認証/Account隔離/秘密保護を維持。追加の分類用推論は無い。
既存の秘密照合用`knownIds()`取得は維持するため、Port専用の要求全体でSQL読取りがゼロという意味ではない。
ここで抑止するのはアプリ診断メソッドの実行と、アプリ診断結果のモデルへの提供。内部IDやその照合結果は従来どおりモデルへ送らない。
履歴はuser/assistantの文章を保持し、過去のtool結果は元々引き継がない。新しい保存領域・本文ログ・固定回答・包括回答ガードは追加しない。

### ローカル試験

Node 24.14.0、**132 PASS / 0 FAIL / 0 SKIP**。保存済み評価とモックだけを使用。

```sh
node --test --test-reporter=tap workers/sound-cruise-sync/test/ai-support-port-scope.test.js workers/sound-cruise-sync/test/ai-support-ui-guidance.test.js workers/sound-cruise-sync/test/ai-support-guard.test.js workers/sound-cruise-sync/test/ai-support-egress.test.js workers/sound-cruise-sync/test/ai-support.test.js workers/sound-cruise-sync/test/ai-diagnostics.test.js
```

保留あり/全アプリ正常の両方でPort専用の診断実行0・tool dataなしを検証。現象の再発条件を尋ね、具体的操作/メールを含む自然文は変更なく通過。
アプリ専用と横断では概要/同期先各1回、前回報告/時刻/端末名がそのまま提供される。
batchの順序を逆にした場合、不正/未指定scope、途中の対象縮小、Port専用の1回修正、無断拡張、ユーザーturn間の話題変更を確認。
既存の正常な12合成実モデル回答、会話/4呼出修正の計数、Pro/Account/秘密/SELECT-only回帰も維持する。

### 判定と限界

ローカル候補としてPASS。ゲートの強制は検証したが、現在の質問の意味からscopeを選ぶ判断はモデルに委ねる。
モデルがPort専用質問を誤ってapps/mixedと宣言する可能性や、過去の自然文の説明を誤用する可能性まで解消済みとはしない。
今回の改善は、事実を見せた後の注意書きだけでなく、要求時の対象宣言とWorker側の実行/提供制御を分離した点にある。
次は承認後の質問3の実機受入で、正しい対象選択と有用な案内が成立するかを確認する。一般公開はそれまでHOLD。
以下の各節は、それぞれの変更時点の記録である。

## 2026-11-07 Port診断範囲の限定修正（Worker 0.2.2、未配備）

既存head `cd88b90a45e7b982abf1ba81e4b8c070fca00cca` へ追加する差分。最新origin/mainは`4cfbea2c`。
mainの追加更新にWorker/Portの対象ファイルの重複なし。PR #225はDraft・merge可能。main merge/rebaseは行わない。
read-only APIで本番v154 (`0022218c-505e-49f3-bb76-55e37b66bca3`) @100% / AI OFFを確認。
今回、本番デプロイ・AI有効化・有料推論・本番D1/R2変更は行っていない。

### 確認できた構造的な誘因

0.2.1の本人βは質問1/2が概ね成立したが、質問3で別アプリの前回保留報告をPort再開表示の原因とする誤りが再現した。
モデル内部の判断は直接観測できず、以下はコード上で確認できた誤適用を招く構造である。

- toolのschema/systemには範囲説明があった一方、各tool結果のenvelopeには証拠の対象/未観測範囲が無い。
  直前の会話と新しいtool結果に詳細な保留報告があり、Portローカル状態の欠測は結果内では明示されなかった。
- `connectedFromThisPort`はAccount deviceを介した登録関係で、Portの現在の実行/接続状態ではない。
  同期先の表示名もアプリのインストール情報ではない。この2つの意味がtool結果に付随していなかった。
- 一般のツール利用指示は「同期状態はまず概要」となっており、Portだけの相談にも4アプリの異常を探す方向へ誘導し得た。
- 共通の修正依頼にも4アプリの再確認案内が無条件で入っていた。ただし実βの質問3はrepair=0/fallback=0であり、
  その回答が修正依頼によって作られたという意味ではない。既存検査はUI/秘密等の検査で、今回の因果関係の誤りは通過する。

Portの`createPortSyncStatus`は、この端末のruntime・接続資格・未送信/画像状態等から表示を決め、別アプリの前回保留報告を入力にしない。
実関数でも、同じ4アプリの診断が「全て正常」「保留あり」のどちらでも、別のローカル状態ならPortの停止/稼働表示が成立することを確認した。

### 最小修正

- `toModelToolResult`のenvelopeへ固定の`scope`を追加。対象アプリenum、クラウド登録/前回報告という証拠の種類、
  Portローカル状態は未観測、Port再開原因は診断範囲外、表示名/登録関係の意味を各結果の隣へ置く。
  元の`data`・時刻・診断2ツール・trustのJSON Pointerはそのまま。contractVersion 1の加算フィールドであり、既存データの置換や削除はしない。
- systemでA=観測した4アプリの事実、B=未取得のPort状態、C=一般仕様/条件付き切り分けを区別。
  Portだけの相談は、Portの一般仕様と同じ端末の状態表示/説明の確認から回答できる。2ツールは引き続き利用可能で、強制ルーターは作らない。
- Portの停止/未開始表示は、その端末の同期処理が動作中と確認できない場合などに出るという既存仕様を説明し、
  その一般仕様と今回どの条件に該当するかの未確認を分ける。「可能性」という表現自体を一律禁止する方式ではない。
- 修正依頼もscopeを維持し、4アプリ用の案内はその相談を扱う場合に限定。Portの相談を別アプリへ戻さない。
- 質問2は非表示だけで確認不要/完了と判断できないと明確化し、既存の端末側確認→Portで報告/時刻確認という代替手順を保持。

新しいツール・包括ガード・操作ID・固定回答・応答JSON化は追加しない。validator/fallback本文、履歴/修正回数、認証、
秘密保護、利用管理、SELECT-only境界に変更なし。Port/Studio/NEWS/他アプリのファイルは変更しない。

### 関連ローカル試験

Node 24.14.0、**125 PASS / 0 FAIL / 0 SKIP**。費用管理の包括試験・有料モデル・30ケース再評価は実行しない。

```sh
node --test --test-reporter=tap workers/sound-cruise-sync/test/ai-support-port-scope.test.js workers/sound-cruise-sync/test/ai-support-ui-guidance.test.js workers/sound-cruise-sync/test/ai-support-guard.test.js workers/sound-cruise-sync/test/ai-support-egress.test.js workers/sound-cruise-sync/test/ai-support.test.js workers/sound-cruise-sync/test/ai-diagnostics.test.js
```

保留あり/4アプリ正常の両方、登録元フラグ/表示名の意味、悪意ある名前からscopeを変更できないこと、
アプリに集中した履歴/誤った以前の説明があっても新しいtool結果にscopeが随伴することを確認。
同じscopeが1回修正にも残り、一般仕様・具体的なPort確認・質問・メールを含む自然文がそのまま通る。
「原因不明」という定型句が無くても有用な案内を維持。現在と前回報告、ボタン非表示時の代替案内、保存済み12合成回答、
既存認可/egress/Account隔離/秘密/SELECT-onlyの回帰も維持する。

モックは証拠の伝達と自然文を壊さない処理の確認であり、実モデルが正しく推論することまで保証しない。
ローカル候補としてPASS、承認後に質問3だけの本人実機再受入へ進める。一般公開は、その回答で未観測の原因を断定せず、
同じ端末のPortで確認する具体的手順と問い合わせ導線が自然に成立することを確認するまでHOLD。

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
