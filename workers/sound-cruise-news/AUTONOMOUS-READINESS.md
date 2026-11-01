# 従来NEWSの自動準備・保留回復（0.43.0）

基準main: `bc08aa8d645f75078ec2448c992c34be0fbdfaab`。開発・隔離試験のみ。本番データ、Worker、Web探索パイロット、cron、予約は変更していない。新migrationはない。

## Claude監査と現行mainの照合

| 指摘 | 採否・現行コードの事実 | 対応 |
| --- | --- | --- |
| A1 定期収集は一律PUBLISH_REVIEW | 部分採用。これは公開の制約で、READYの禁止ではない。mainにもinitial-factsとpublicationValidationがある | 人間の最終掲載判断を維持。収集後に既存再確認・Shadow・客観的整理を接続し、READYとREVIEWを分離 |
| A2 島村1記事/日 | 採用。registryの自主予算が不足 | 島村・池部とも最大6予約/JST日。失敗・更新再取得も同じ原子的な予約枠に算入 |
| A3 parser失敗固定 | 採用。無期限の失敗再利用とnext_recheck_at=NULLが回復を阻害 | 7日後に再試行。反復失敗は人間確認へ。既知の旧pipeline/source-parserの失敗は更新後に再キュー |
| A4 provenanceの版番号密結合 | 採用。ただしallowlist全廃は不採用 | 新primary/Shimamura証拠は共通field契約・facts digest。既存証拠は狭い互換検証を保持 |
| A5 一時障害で永久停止 | 採用 | timeout/5xx/network/形式変更はbackoff。既知の一時障害による旧停止だけを条件付き回復 |
| A5補足 healthとREADY | 採用 | 以前の正常取得と正式factsがあれば、一時警告だけでREADYを奪わない。権利・robots・明示停止等は別途ブロック |
| A6 客観的除外が保留に滞留 | 採用 | 既存resolutionを定期処理に接続。正式duplicate、期限切れ、証拠付き対象外だけをsystem判断として整理 |
| A7 関連性とREADYの混同 | 採用。ShadowだけでREADY/公開にする案は不採用 | 正式検証と関連性を分離。firmware、分類未確定等は人間確認。Shadowは同じsnapshotの補助評価 |
| Kikutani 候補生成前の欠落 | 部分採用。mainにURLの耐久追跡はあるが、未解析URLの表示がない | 新製品タグの未対応文法もnull-facts候補へ。メタデータ不足URLも表示。未知製品を展示会parserで自動取得しない |

監査の過去の件数・Shadow精度は本番の現在値として再利用しない。未確認redirect/robots変更の自動許可、Shadowだけの自動公開は採用しない。

## 通常フローと4分類

1. 既存6時収集でregistry、権利条件、robots、opt-out、パス、crawl-delay、日次リースを検査し、URLを既存discoveryへ保存。
2. 一覧からfactsを抽出。島村・池部の不足分は既存の許可済み原記事確認で補う。Operator・初回・定期回復ともrecheckFacts/verifiedSurface、URL・source・日付・identity・CAS検査を共用。
3. publicationValidationがfacts/provenance、正式duplicate、期限、takedown、出典条件を検査。新primary証拠は候補ID、URL、公開日、title fingerprint、facts、eventをdigestへ結ぶ。
4. 正式条件と関連性を満たせば「掲載可」。候補はpendingのまま。承認Ledgerや公開データは自動作成しない。
5. 既存毎時17分と収集後に回復・整理。収集後の補完例外は捕捉し、Web探索の起動を止めない。cron式は不変。

再確認は既定4件/起動。正式検証を始める前に16件の処理窓へ絞り、期限・掲載希望を優先する（設定最大20件なら窓80件）。未処理は次回へ進む。ログに総due、実走査scanned、scanLimitedを分けて残し、大きな保留キュー全体のprovenanceを毎回検証しない。

| Operator表示 | 処理 |
| --- | --- |
| 掲載可 | 正式検証・関連性PASS。最終掲載は既存の人間操作 |
| 人間の確認が必要 | 矛盾、未対応の安全な取得面、関連性判断、反復解析失敗など |
| 対象外・自動整理 | system_policy/source_policyとしてrejected。客観的理由・監査・lifecycle履歴を保持。人間の非掲載教師にはしない |
| 自動再試行待ち | 予算待ち、取得障害、初期parser失敗。次回時刻を表示 |

「自動整理済み・候補化前の確認」で最新100件ずつを閲覧できる。復旧は実Accessの人間認証・Origin・CSRF、snapshot、request IDを要求。現在も重複/期限切れ/出典停止/取り下げなら不可。人間判断Ledgerがある候補も不可。復旧は公開ではなくreopenedで、確認者・元理由を履歴へ保存する。

## 保存・取得・再試行契約

- 6枠はNEWSの自主予算であり出典の許可を拡張しない。robots/crawl-delay/Retry-After/opt-out/利用条件を優先。本文を新たに保存しない。
- 既存news_facts_sourcesに各primary試行を独立予約し、INSERT条件内で日次件数とリースを照合。競合で7枠目を使わない。失敗した予約も消費するため実GET数より保守的な場合がある。
- 有効な構造化証拠は短期cache消去後も既存recheck/discoveryから再検査・再利用。再利用で原取得時刻を更新せず、破棄済みHTMLを再構成しない。
- 同日URL再取得は抑止。記録された旧pipeline/同methodのparser更新時のみ、通常予算内で1回の更新再試行が可能。リース・backoff・権利条件は省略しない。
- 同じparser失敗は7日後まで再HTTPしない。定期再試行を3回重ねたものは人間確認へ。既知のparser更新・候補revision変更で再評価。取得障害は既存6時間→1日→3日→7日backoff、Retry-After優先。
- 共通契約は新primary/Shimamura分から導入。他出典の専用検証は維持。旧成功証拠は狭い従来規則で互換維持。新契約の欠落field、改変digest、source/候補不一致、基準より古い版、混在hash/timeは拒否。新版番号だけでは証拠にならない。
- 旧停止は、最新collection_runが既知の一時障害で、health・run・停止監査・backoffを条件付きUPDATE内で再照合できる場合のみ回復。証拠のない停止、Sleepfreaks維持停止、redirect/robots/権利停止は推測で再開しない。
- 自動整理は物理削除ではない。原因が解消されたsystem判断だけを保持期限内に再審査へ戻せる。90日期限延長、物理削除後の復活、reject/takedown解除はしない。既存purge/item-delete/source-deleteは不変。

## 廃止・統合

固定候補ID/URL/日付のpending-six-retryと特例専用試験を廃止し、通常予算・版更新・証拠再利用へ統合。永久parser失敗分岐を有効期限付き失敗cacheと既存lifecycleへ統合。publicationValidationと最終承認SQLのhealth条件を共通化する。

候補全行CAS、duplicate最終再照合、source/takedown/controlsの原子的な承認条件は維持。新しい承認系・trigger・外部キー・migration・AI呼び出しはない。別用途の許諾付き既存補修経路まで一律削除していない。掲載policyはoperator-publication-2、再確認policyはpending-recheck-2。

## 検証と本番観測

`node --test test/autonomous-readiness.test.js` は実migrationの永続workerd D1で、初回6件READY、翌日7件READY、再起動、公開判断0件を検査する。構造化架空記事であり実媒体の受入・許諾証明ではない。

関連試験で並行予算、parser失敗回復、旧parser再キュー、source回復と停止保護、JS/SQL health一致、改変拒否、客観的整理・認証付き復旧、監査失敗の全体rollback/再送/再起動、Kikutani候補化前確認を検査する。D1 batchの失敗時rollbackは[公式仕様](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)と実workerdで確認。最終検証: NEWS/Operator 1,582 PASS、Port NEWS 60 PASS、新規専用14件（全回帰に含む）、両Worker production-config dry-run、変更JSのsyntax、diff/秘密情報パターン検査PASS。有料API呼び出し・本番書込みは0。

配備後は既存preparation/discovery/lifecycle/collectionデータを使い、出典・JST日別に以下を測る。

- 新規URL→候補作成率、readyNew/candidateCreated、24時間内READY率。validationNotMeasured/truncatedは成功扱いに混ぜない。
- facts/provenance/権利/関連性/予算/取得解析ごとの件数と滞留時間。最終人間判断待ちとシステム回復待ちを分ける。
- 原記事GET成功/失敗、6枠消費、同一URLの実GET、429/5xx/robots/opt-out。news_primary_acquisitionログはrobots/surface別の実取得試行を記録し、methodで原記事と一覧を区別する。予約枠と実HTTP数、cache再利用と再取得を混同しない。
- 自然回復率、人間によるfacts再確認回数、system整理理由、復旧件数・誤整理。
- Shadowの対象範囲と人間判断一致率は標本不足を明記。公開済み内容、Ledger、takedown、通常collector、Webパイロット設定・上限に意図しない変化がないこと。

## 別途承認と限界

レビュー済みhead/tree、最新main、現行両Worker version・設定・D1 schemaと復旧先を照合した後、main統合・両Worker配備を別途承認する。migration不要。6時cron、Web探索ON/manual OFFと上限、7:30記録、11月8日09:10停止予約は維持する。

配備後の通常枠でREADY率・回復・手動作業を比較。出典条件違反、誤整理、既存公開への影響で停止/rollback判断。Worker rollbackは既に記録した整理や証拠を取り消さない。D1全体復元は別判断。今回、本番保存データの再処理・公開は行わない。

未知文法、権利/日付/identity不足は人間確認に残る。Kikutani不足URLの表示は追加取得許可を意味しない。既存legacy重複互換の保守的上限は維持。実本番の改善率・全出典回復率は配備後の観測事項で、fixture PASSから推測しない。
