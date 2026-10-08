# NEWS Pending Zero Cleanup Report

## Overall Verdict

本番整理完了。2026-10-09 JSTの実測pending全16件を再評価し、最終的に **掲載可6件・掲載不可8件・例外保留2件** に分類した。DBのpendingは8件（掲載可6件も最終人間判断まではpendingに含む）。ゼロ件を作るための自動承認・証拠の捏造は行っていない。

## 1. Starting State

main = origin/main `f48a2089`、ahead/behind 0/0、tracked/staged clean。既知untracked `.claude/` と `workers/sound-cruise-sync/node_modules/` を保持。
NEWS 0.24.0 / Operator 0.23.0 / Port 1.19.6。候補148件＝公開109・保留16・非掲載23。Ledger62、Shadow160、human feedback84。validation.validは0件、重複ブロック2件、停止済みIK4件、facts_incomplete14件（IK4件を含む）。過去レポートの件数は使用していない。

## 2. Pending Inventory

年齢は開始時点の公開日からの日数。すべてのpendingを対象とした。IKは明示停止済みsource policyを確認し、復活・原記事再fetchはしない。残るactive source候補は現在日の一次記事または同日確認済み一次証拠を照合した。

| Candidate / ID | Source | Age | Current Blocker | validation | Recovery status |
|---|---|---:|---|---|---|
| [IK ReSing / 19790](https://www.ikmultimedia.com/news/?item_id=19790) / `b5c0c40743312c4f6c874924662b353ee970947208e4e070d12bd3ce0c129c23` | ik | 21 | operator_source_gate, facts_incomplete | false | source除外維持 |
| [IK / 19650](https://www.ikmultimedia.com/news/?item_id=19650) / `a740971f365a8fdcce2e32ddd03c6c4f0f7d301db127e50a71a10075b1cc3cdb` | ik | 63 | operator_source_gate, facts_incomplete | false | source除外維持 |
| [西山隆行ギターワークショップ](https://www.ikebe-gakki.com/blog/20261021-aco-workshop/) / `3a6dd027f7b38e59be5d4f7914d47d278c1794f806409b62d38a81a949571f08` | ikebe-event | 21 | facts_incomplete | false | 回復済み |
| [LAVA STUDIO](https://www.shimamura.co.jp/update/amp-effector/2026/10/84665/) / `4632d340b4ef7ea60e45df539514f767fdbc103aa6c68921d0353235a949b949` | shimamura | 8 | duplicate | false | 一次証拠／既存掲載を確認 |
| [LAVA SmartAmp / Stand / Effects Pedal](https://www.ikebe-gakki-pb.com/new_product/172658/) / `b7cb377c374722cf20bc5b9da2aed032dae4e03984573ac1193eca98fc92d286` | ikebe | 8 | facts_incomplete | false | 一次証拠／既存掲載を確認 |
| [IK ReSing / 19799](https://www.ikmultimedia.com/news/?item_id=19799) / `d85da4caddbcc68b4b9cab37d5527ee778675146f721c90116eca60c72254c7c` | ik | 21 | operator_source_gate, facts_incomplete | false | source除外維持 |
| [IK / 19595](https://www.ikmultimedia.com/news/?item_id=19595) / `c19282ac70cf8692ec98ca9eb974b74c6d87ec5082d0d6c09216387f22edae18` | ik | 84 | operator_source_gate, facts_incomplete | false | source除外維持 |
| [Gretsch G6136TGQM-59](https://www.ikebe-gakki-pb.com/new_product/172774/) / `c18e2712f28825ab500c0eedef34016a2f81ab490969594e1a2d766ad89b6cc0` | ikebe | 4 | duplicate | false | 一次証拠／既存掲載を確認 |
| [YAMAHA TDM-600GY / BE](https://www.ikebe-gakki-pb.com/new_product/172830/) / `495d1c7721f42a2fdd5545cbd687d471eff27bcded8cc71d26b8d3977cd8a3b6` | ikebe | 2 | facts_incomplete | false | 一次証拠／既存掲載を確認 |
| [Antares AutoTune Advanced](https://www.shimamura.co.jp/update/dtm-recording/2026/10/93756/) / `b408cefe764089b98e7e4f46954361cf8217e175c40d993001510d9bf97cc4eb` | shimamura | 1 | facts_incomplete | false | 回復済み |
| [Fender John 5 Ghost / Phantom](https://www.shimamura.co.jp/update/guitar-bass/2026/10/91558/) / `3c54f657fbb68038446694b4dc747b24234a32952b21e41c08a5bc5853c4f126` | shimamura | 2 | facts_incomplete | false | 回復済み |
| [Bacchus GS-HOLLOW / CTM](https://www.shimamura.co.jp/update/guitar-bass/2026/10/93654/) / `34ea31a97509133dd88239303148ab2b0d8b33045f4c059da5ef7fadd82edd56` | shimamura | 3 | facts_incomplete | false | 回復済み |
| [Kikuchi MF15L / 2HB](https://www.shimamura.co.jp/update/guitar-bass/2026/10/93576/) / `4f4a15d3ed948dac62cbb52344b69a220158b7e5a178676fef8910b4dbfc0814` | shimamura | 6 | facts_incomplete | false | 回復済み |
| [L.R. Baggs HiFi DNA](https://www.shimamura.co.jp/update/guitar-bass/2026/10/91568/) / `82daec4a3d5c5a7470c7e50415e0f9b2b9c279985cf0b80e05ef2b36fa5dc295` | shimamura | 7 | facts_incomplete | false | 回復済み |
| [Limetone Audio buddy](https://www.shimamura.co.jp/update/amp-effector/2026/10/93646/) / `befbe38d5030a24838ec0df71174a89583c0a77f9f2864ea9eb9a6585c24c1aa` | shimamura | 8 | facts_incomplete | false | 回復済み |
| [Fulltone Silver OCD V2 / GE](https://www.shimamura.co.jp/update/amp-effector/2026/10/92722/) / `201b18cd4884c8eaa55a574c91934ec21a3011677b1e09a7f4c15e29c0c71515` | shimamura | 8 | facts_incomplete | false | 回復済み |

## 3. Facts Recovery Results

8件を回復：島村7製品＋池部Eventsの講師名・会場・開催日が明示されたギターワークショップ1件。回復後に重複と判定されたFulltoneとFenderを含む。

島村は通常のlisting抽出を維持し、その抽出が不足した既存pendingだけを一次記事へ進める。canonical・元公開日・明示されたメーカーと型番・主要本文の出来事・見出し／表の型番照合・product typeの一次記述を検証する。本文やカテゴリだけからの推測、関連商品／隠し要素、再入荷・セール・古い紹介からの誤回復は拒否。限定色、日本限定、シグネチャー等の明示factsから独自見出しを作る。

Eventsは既存記事の講師・会場・開催日・ギターワークショップという構造化一次証拠を検証し、講師名の固定リストが原因の未対応を解消した。新source・collection scope・認証は変更しない。HTMLは検証時のRAMのみ。本文全文・原文見出し・画像は保存しない。

## 4. Duplicate Resolution

4件をsystem_policy / duplicateで終了：

- LAVA STUDIO：既存Sleepfreaks掲載と同じ製品・発売出来事。
- Gretsch G6136TGQM-59：既存島村掲載と同じ限定モデル。
- Fulltone Silver OCD V2 / GE：回復した日本限定2モデルが既存池部掲載と一致。
- Fender John 5 Ghost / Phantom：既存池部記事と同じ2モデルの発表。最終Port照合で発見した。既存brandのStandard Series付記と明示色名が完全一致検索をすり抜けていたため、複数シグネチャーモデル集合・brand系列付記・version・category・出来事が一致する限定照合を追加した。新色追加・限定仕様・改訂型番・別メーカー・不完全なモデル集合は区別する。

## 5. Editorial Value Decisions

掲載基準に合う6件は掲載可としてユーザー判断に渡す。微妙な掲載価値をfacts不足に読み替えていない。今回、source policy4件と客観的重複4件以外を低価値として強制却下していない。停止済みIK sourceの4件はsource_policy / source_disabled。IK製品全体の排除ではない。

## 6. Final Candidate Classification

| Candidate | Source | Before | After | Reason |
|---|---|---|---|---|
| IK ReSing / 19790 | ik | pending | REJECTED | source_policy / source_disabled。既存の意図的停止に従う。 |
| IK / 19650 | ik | pending | REJECTED | source_policy / source_disabled。既存の意図的停止に従う。 |
| 西山隆行ギターワークショップ | ikebe-event | pending | READY | 一次記事の明示facts・独自見出し・出来事・source・重複検証が合格。最終掲載はユーザー判断。 |
| LAVA STUDIO | shimamura | pending | REJECTED | system_policy / duplicate。既存公開済みの同じ出来事。 |
| LAVA SmartAmp / Stand / Effects Pedal | ikebe | pending | EXCEPTIONAL_HOLD | 原記事にも出来事が明示されていない。対象範囲の不確実性を含め推測しない。 |
| IK ReSing / 19799 | ik | pending | REJECTED | source_policy / source_disabled。既存の意図的停止に従う。 |
| IK / 19595 | ik | pending | REJECTED | source_policy / source_disabled。既存の意図的停止に従う。 |
| Gretsch G6136TGQM-59 | ikebe | pending | REJECTED | system_policy / duplicate。既存公開済みの同じ出来事。 |
| YAMAHA TDM-600GY / BE | ikebe | pending | EXCEPTIONAL_HOLD | 原記事にも出来事が明示されていない。対象範囲の不確実性を含め推測しない。 |
| Antares AutoTune Advanced | shimamura | pending | READY | 一次記事の明示facts・独自見出し・出来事・source・重複検証が合格。最終掲載はユーザー判断。 |
| Fender John 5 Ghost / Phantom | shimamura | pending | REJECTED | system_policy / duplicate。既存公開済みの同じ出来事。 |
| Bacchus GS-HOLLOW / CTM | shimamura | pending | READY | 一次記事の明示facts・独自見出し・出来事・source・重複検証が合格。最終掲載はユーザー判断。 |
| Kikuchi MF15L / 2HB | shimamura | pending | READY | 一次記事の明示facts・独自見出し・出来事・source・重複検証が合格。最終掲載はユーザー判断。 |
| L.R. Baggs HiFi DNA | shimamura | pending | READY | 一次記事の明示facts・独自見出し・出来事・source・重複検証が合格。最終掲載はユーザー判断。 |
| Limetone Audio buddy | shimamura | pending | READY | 一次記事の明示facts・独自見出し・出来事・source・重複検証が合格。最終掲載はユーザー判断。 |
| Fulltone Silver OCD V2 / GE | shimamura | pending | REJECTED | system_policy / duplicate。既存公開済みの同じ出来事。 |

## 7. Remaining Exceptional Holds

- [YAMAHA TDM-600GY / BE](https://www.ikebe-gakki-pb.com/new_product/172830/)：型番とチューナー・メトロノームは確認済み。新製品発表／発売の明示がないためeventを創作しない。同日07:23の一次確認証拠を再利用。通常の次回確認は10/12。
- [LAVA SmartAmp / STUDIO Stand / Effects Pedal](https://www.ikebe-gakki-pb.com/new_product/172658/)：複数本体・周辺機器の紹介で、対象範囲と発売出来事が確定できない。同日07:23の一次確認証拠を再利用。通常の次回確認は10/16。

両候補の保存行・facts・日付・既存の掲載希望を変更していない。metadata/parser未対応だけを理由に残した保留ではない。

## 8. Before / After Metrics

| State | Before | After |
|---|---:|---:|
| Candidate total | 148 | 148 |
| Public / approved | 109 | 109 |
| pending total（READYを含む） | 16 | 8 |
| 掲載可 | 0 | 6 |
| metadata/parser不足だけの保留 | 8 | 0 |
| 真の証拠不足 | 2 | 2 |
| pending内の重複 | 2（回復後に追加2件判明） | 0 |
| rejected total | 23 | 31 |
| Ledger | 62 | 62 |
| Human feedback | 84 | 84 |
| Shadow | 160 | 168 |

Shadow追加8件はfacts回復のcandidate revisionに対応。既存160件は不変。system拒否でhuman Ledger／feedback／Shadowを作らない。

| Source pending | Before | After |
|---|---:|---:|
| shimamura | 8 | 5 |
| ikebe | 3 | 2 |
| ikebe-event | 1 | 1 |
| ik | 4 | 0 |

## 9. Source Health

島村・池部PB・池部Events・AGM・ZOOM・キクタニ・amassはhealthy、failures0。IK・AT Distribution・Sleepfreaks・Natalieは既存のpaused/source_disabledを保持。source_state・各sourceのhealth・collection_runs・alertを開始時と照合し、不変を確認。hourly cronによりretentionの正常実行時刻だけが08:17へ更新された。

ただしcollection集約には開始前からのwarning（network_or_internal_error、10/8 06:00台の記録）が残る。これは最新の各active sourceのhealthy状態とは別であり、今回消去・健康状態の上書き・追加収集は行っていない。全体healthを全面正常化したとは報告しない。

## 10. Tests

- NEWS / Operator full suite：**782/782 PASS**（追加のsignature重複10件を含む）。
- Port NEWS：**46/46 PASS**。
- syntax、git diff --check、stage済み差分、正規秘密値＋credential pattern scan：PASS。
- NEWS / Operator Wrangler dry-run build：PASS。
- 実workerd/D1 batch：stale候補・source再開・ライフサイクル変更・重複元変更時のtransaction rollbackを検証。
- 本番開始snapshotを隔離SQLiteへコピーし、production schema/triggerと同じガードSQL・revision・Shadow・receipt・idempotency・no-teacherを確認。
- 新色／限定版／別モデルを保持、本文・画像・原見出し保存なし、許可sourceとrequest上限を維持。

## 11. Production Verification

本番APIの公開109件とticker5件は開始時の全JSON内容と一致。公開109行と既存rejected23行、Ledger62、feedback84、既存Shadow160行を照合。候補ID・URL・公開日を維持。削除・migration・自動approve・human approve/rejectはなし。

8件のfacts回復は候補全列・元cache・lifecycleの一致をguard。system終了8件はcandidate・human履歴・source停止証拠・重複元全列・lifecycleが変わればtransactionを中止する。停止・重複のterminal lifecycleはnext_recheck_at=NULL、lease解除。controls revisionのみ必要回数増加。

Operator：掲載可6件、要確認2件、重複0件、全保留8件を実表示確認。掲載可の掲載ボタンは有効、例外2件は無効。決定操作はしていない。Port1.19.6のNEWS表示・カテゴリフィルター・既存記事を確認。初回の一時的読み込み失敗は再読込で解消した。既存の外部記事と自社記事は不変。

## 12. Versions

NEWS：0.24.0 → 0.25.0（一次facts回復の追加）→ **0.25.1**（signature重複照合の修正）。
Operator：0.23.0 → 0.24.0 → **0.24.1**。Port **1.19.6維持**。

最終deployment IDs：
- news: `1d6e1010-cc17-430f-9fe9-f4d5a1825be6`
- operator: `fd083c6f-bc3b-4615-94d7-1a86d8f753c0`

## 13. Git

- Starting main/origin：`f48a2089`。
- `88867b2c`：facts recovery、ガード付きsystem resolution、運用資料、回帰tests。
- `84dc58e4`：最終Port照合で見つかった同一Fender signature発表の重複照合、10回帰tests、patch versions。
- 本レポートのみ追加commit後にnormal push。最終Git確認はcommit後のユーザー報告を正本とする。
- 明示stageのみ。git add . / reset --hard / clean / stash / force pushは未実行。既知untracked2箇所は保持。

## 14. Recommended Next Step

Operatorの「掲載可」6件（Antares、Bacchus、Kikuchi、L.R. Baggs、Limetone、西山ワークショップ）の最終掲載判断をユーザーが行う。証拠不足2件は一次記事に新しい根拠が出るまで保留。READYをpendingから消す目的で自動承認しない。

| Check | YES / NO |
|---|---|
| all pending candidates reviewed | YES |
| recoverable facts were recovered | YES |
| editorial ambiguity is surfaced as publishable | YES |
| clear non-news candidates were rejected | YES（source除外・重複の客観判定） |
| duplicates were resolved | YES |
| metadata shortage alone remains as pending | NO |
| true evidence shortages remain only when unavoidable | YES |
| system decisions contaminated human teacher data | NO |
| pending count reached zero | NO |
| if not zero, every remaining hold has documented reason | YES（READY6件は人間判断待ち、例外保留2件は上記根拠） |
| all tests pass | YES |
| production verification passes | YES |
| Git safety followed | YES |
