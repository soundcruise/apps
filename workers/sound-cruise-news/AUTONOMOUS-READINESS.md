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

## 2026-11-02 の実績からの限定修正（0.43.1）

Kikutani末尾7f14b490/6f7a6a06は新製品タグのみで候補生成され、正式factsとprovenanceがNULL。
参照した公式検索結果では前者はバリトンスネアBA-1470、後者はMPXスネアドラム。
既存一覧facts parserはギターと特定メンテナンス工具のみを対象とし、ドラムfactsを生成しない。
タグだけで全ジャンルをHUMAN_REVIEWへ流すfallbackにギター等への明示的関連条件を追加した。
未分類の記事は発見追跡に残す。未知ブランドのギターは従来通り候補化し、facts不足では保留する。
製品名やURLを固定した例外、検索結果からの正式facts生成、既存2候補の判断変更はない。

Morris対象は/information/2026/0803_01.html。11月2日で91日経過し期限判定自体は正常。
verified_listingには期限guardがあったが、既存verified記事証拠の経路にはなかった。
証拠種別を問わず候補生成・詳細取得より前に90日条件を適用し、discoveryへ期限外を記録する。
ローカルでは古いverified証拠を残し、候補が再生成されず追加詳細HTTPもないことを確認する。
掲載期限を延長したり、過去の判断やtakedownを変更したりしない。

本番新規3件中READY0という観測は改善の実証にならない。修正後は出典別candidateCreated、
readyNew、期限切れ再生成、facts不足の理由、手動再確認数を通常の保存指標で継続確認する。
現在の保存済み候補の整理・正式な人間判断・公開は今回のローカル修正に含まれない。

## 0.43.2：11月4日確認の出典parser対応

- 池部：NFKCと限定したアポストロフィ正規化を製品欄・タグ・見出しに共通適用。
  記事に印字されたPJB（Phil Jones Bass）のような括弧付き表記を維持し、外部aliasを推測しない。
  amplifierカテゴリと本文に明記されたベースアンプをbass_ampとして扱う。
  parser14への変更は旧失敗キャッシュの再確認対象となる。13の有効な既存provenanceは維持する。
  同構造の架空ブランドfixtureで旧13失敗→14抽出→正式provenance→READYを確認。
  本番PJBは未変更。配備後、既存Operatorのfacts再確認で重複・期限・takedownも再評価する。
- D'Addario PW-BLEBC-01はメーカー公式でElectric Bass Case、対象はベース。
  本文のguitarはシリーズ総称と解釈でき、製品欄との不一致だけで永久保留にする必要はない。
  6月11日発表のメーカーpress releaseと6月12日記事があり、10月31日の池部記事に
  独立した新仕様・限定版・国内発売日などの新しい出来事は確認できなかった。
  判断案は非掲載（既存Operatorのoperator_review理由）。本番判断は別途承認待ち。
  10月31日を初発表とするfactsは生成しない。この記事専用parserや自動却下規則は追加しない。
  メーカー: https://www.daddario.com/en-nl/collections/backline-musician-gear-bags/products/backline-electric-bass-case
  press release: https://www.premierguitar.com/news/daddario-new-backline-cases
- Morris：11月3日の一覧には表示日2026.11.02に対して/2026/0012_01.htmlという不整合カードがある。
  存在しそうなURLへの置換や日付の推測は禁止。不整合カードをparser_failedとして追跡し、
  正常カードは収集できるようカード単位で隔離する。全件不整合、構造・canonical異常は従来どおり停止。
  隔離カードの個別本文は取得しない。robotsと日次2リクエストの一覧予算は変更しない。

本番反映はmain統合・両Worker配備の別途承認後。保存済みヒント、公開行、Ledger、takedown、
既存候補は今回未変更。PJBの正式再確認とD'Addarioの非掲載も実行前の承認対象とする。

## 0.43.3：PJB失敗の実比較と修正（本番未反映）

11月4日のSELECT結果は旧product_facts=NULL、facts_provenance=NULL、revision=0。
parser14の失敗証拠は_extraction_failure、parserFailures=[ikebe-product-fields-14:
 facts_identity_changed, product-family-fields-1: facts_scope_uncertain]、patch_json=NULLだった。
したがって新factsは生成されておらず、facts-recheck.jsのchangedIdentityはold=NULLにより偽。
旧製品と新製品の差を無視する変更は不要で、誤った修正になる。

実記事の見出しはPJB（Phil Jones Bass）/NANOBASS X4C、タグの文字列も同じブランド。
ブランドの正規化結果はPJB(Phil Jones Bass)。しかし実タグURLは
https://www.ikebe-gakki-pb.com/new_product/tag/pjb%EF%BC%88phil-jones-bass%EF%BC%89/
であり、既存[a-z0-9-]+判定はfalse。ブランド照合に使えるタグが0件となる。
根拠: https://www.ikebe-gakki-pb.com/new_product/173894/
https://www.ikebe-gakki-pb.com/new_product/tag/pjb%EF%BC%88phil-jones-bass%EF%BC%89/

共通ikebeTagUrlで同一HTTPS originの単一tagセグメントを認識し、一度だけdecodeする。
不正encoding、slash/backslash、制御文字、別origin、credentials、query/hashは拒否。
このURLは取得せず、記事header内の既存ブランド文字列照合だけに利用する。
5つの関連抽出処理の同じ制約を統合した。記事ID・日付・特定ブランド辞書による例外はない。
parser15は旧失敗cacheを正規の予算内で再評価可能。既存14/13の有効なprovenanceを保持する。
CAS・同一記事/公開日・型番更新guard・重複・takedownの条件は維持。

記事構造相当fixtureはPJB/Phil Jones Bass、NANOBASS X4C、ベースアンプ、限定カラーを使用。
日付は既存試験時計に合わせた架空値で、本番の11月2日付を変更する根拠ではない。
NULL旧factsと14失敗cacheから15抽出、正式provenance、READYまで成功。pendingのままで公開なし。
異なる旧型番MICROBASS X5をX5Cへ変える試験はfacts_identity_changedで拒否・旧値維持。
本番候補は未変更であり、実parser15の本番再確認は配備承認後に1回実施する必要がある。

NEWS/Operator1593 PASS、Port NEWS50 PASS、両Worker dry-run PASS。
本番反映の承認対象は修正PR統合・両Worker配備・PJBの正式facts再確認のみ。migration不要。
Web探索・Exa・Qwen・予約・公開操作への変更なし。

## Parser更新と承認済みの限定復旧（0.43.4）

旧parserの失敗は新parserの結果ではない。parser別・共通pipeline別の同日upgrade予約を
原子的に確保し、別parserのupgrade履歴で新parserを止めない。fallbackの最終parserだけでなく
最初に失敗したparserも照合する。旧失敗の7日backoffがある場合も、通常予算が残れば次の
定期再確認へ戻す。予算済みなら翌JST日次枠へ送る。成功済みの検証可能なfactsは従来どおり再利用する。

追加取得に運営者の明示承認がある場合のみ、運用CLI `scripts/recover-facts-server.mjs` を使用できる。
WorkerのHTTP入力には予算overrideを追加しない。既存Wrangler OAuthと既存の秘密情報ファイルを使う
正式なrecheckFacts経路であり、DBの手修正・公開判断・新しい配備やmigrationは行わない。
`NEWS_RECOVERY_SECRETS_FILE` は既存秘密情報ファイルのパスのみ。値を表示・Git保存しない。

承認ファイルはid（16〜64文字）、candidateId、sourceId、sourceUrl、snapshot、revision、
parserVersion、pipelineVersion、issuedAt、expiresAt（最大1時間）、maxArticleRequests:1、reasonを保持する。
CLIは承認を自動生成せず、操作直前のsnapshot・parser等と照合する。
`node scripts/recover-facts-server.mjs APPROVAL_FILE --check` は読取りのみ。
明示承認後の `--execute` は既存の出典・robots・backoff・lease・CAS・identity検証を通す。
通常予算と復旧枠は別集計（recoveryBudget.recoveryUsed）。source内の同時取得は共通leaseで排他し、
復旧予約は決定的キーで一度だけ消費する。失敗・ACK喪失・再起動で追加取得を許さない。
本文最大1回、必要ならrobots確認1回。二次的な公式identityページ取得は復旧経路では行わない。
本文は保存せず既存のfacts/proof/receiptに承認範囲・操作主体を記録する。成功でもreview_statusはpendingのまま。

### 2026-11-04のPJB実行

利用者が承認した1候補のみ、運用CLIから1回復旧を実行した。本文1回、robots1回。
parser15が同一responseHashの本文を正常解析し、formal recheck trigger/CASでrevision 0→1、
publicationValidation.valid=true、preparationState=READY。実AccessのOperatorで掲載可1・追加確認0を確認。
NEWS公開181、人間判断履歴170、takedown3を維持。公開・Worker配備・migration・Web探索変更はなし。
この個別実行は共通改修の本番定期処理への反映を意味しない。共通改修の統合・配備は別途承認が必要。

共通修正の最終検証：NEWS/Operator1615 PASS（追加の復旧・parser更新22件を含む）、
Port NEWS60 PASS、両Worker dry-run、syntax、diff check、秘密情報パターン検査PASS。
永続workerd D1で予算超過時の復旧→READY、並行実行、ACK replay、再起動を確認。

## 0.43.5: 抽出待ち・identity矛盾・Morris記事失敗の分離

島村製品parser13 / primary-announcement6は、未抽出フィールドと未確認の照合を
`facts_extraction_incomplete` / `facts_identity_unconfirmed`、明示された同一主題の矛盾を
`facts_identity_conflict` と区別する。既存factsとの差分保護 `facts_identity_changed` は維持する。
公式情報を使う既存の補完経路は維持し、未確認値を正式factsへ昇格させない。
診断はstage、フィールド名、存在/一致の真偽・件数・正規化日付のみ。原文・タイトルは保存しない。

同じparserの同じ抽出失敗は、7日おきにGETする代わりにPARSER_RETRY（解析更新待ち、次回日時なし）にする。
parser/pipeline更新では既存の通常予算内で自動再評価する。成功証拠・旧版の有効なprovenanceは再利用する。
明確な矛盾・公式根拠不足は人間確認、HTTP一時障害は既存backoff/予算内の再試行、出典禁止は停止を維持する。
公開HTTP入力へoverrideや新しい権限は追加しない。通常の取得上限は変更しない。

Morris parser5は明示された公開日だけを一覧/URL公開日と比較し、更新日・開催日・発売日は別の役割として扱う。
ラベルが不明な異なる日付や形式不正は `facts_date_unconfirmed`、明示公開日の矛盾は `facts_date_changed` で止める。
datetimeと表示日の矛盾、実在しない日付は通さない。日付役割だけでイベント/製品factsを生成しない。
記事単位のparser失敗はその候補を保留し、同じ一覧の他の記事を継続する。記事失敗の安全な診断と応答hashを
既存receiptに残す。出典停止・robots変更・opt-out・401/403/451・redirectは引き続き停止する。
通信/5xx/429はRetry-After/backoffを尊重し恒久停止と区別するが、Morrisの詳細URL一生1回は失敗時も消費済みのまま。
過去の失敗receiptや候補を改変・再取得して修復したことにはしない。新migrationなし。

### 11月5日の実記事に関する保証の限界

本番証拠は読取り済みだが、島村の失敗時比較値とMorrisの問題のtime文字列・元HTMLは残っていない。
従って具体的な実記事の表記を断定せず、実データのブランド/製品/日時や掲載価値を推測で補わない。
本PRは構造同等の架空入力で分類・再評価・継続・安全境界を検証し、本番候補2件のREADYを主張しない。
島村は新parserによる許可済み再検証でfactsが成立した場合だけREADY。Morrisは保存済み一覧に十分なfactsがなく、
使用済み詳細を再取得できないため、許可済みの新しい証拠または人間による独立した確認が必要。
本番配備・保存済み候補変更・公開は別途承認。Web探索、課金API、cron、予約は変更しない。

最終検証：NEWS/Operator1635 PASS、Port NEWS60 PASS、両Worker dry-run、syntax、diff check PASS。
新しい境界試験は20件。永続workerd D1で失敗記事と正常記事の混在・再起動・詳細一回性を確認。
既存のCAS・人間判断・robots・許諾・重複・takedown・公式identity補完の回帰を含む。
