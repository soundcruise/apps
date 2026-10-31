# Phase 4B 候補中心承認ゲート — 次チャットへの引継ぎ

## この作業の基準と権限

- Repository: soundcruise/apps
- ローカルclone: `~/.codex/news-clones/dot-phase4a-livefix-20261031`
- 作業branch: `codex/news-dot-phase4b-conditional-20261031`
- 基準PR #105: `7b3a53e7291d04d5007dc7097d9390f165b2d4c1`
- 依存PR #104: `9c5ed8ab6657761a014396bfe2469415436da844`
- GitHubから確認したmain: `5c07c7b3d05bc99153113f214babd3a161514bf1`
- 今回はローカルコード・永続D1隔離試験・commit・通常push・Draft PRまで許可。
- 本番D1/Firestore書込み、remote migration、Worker配備、main merge、Cloud Run公開、IAM/Access変更、定期実行、Studio変更は禁止。
- 既存PRの固定headを更新していない。Studio clone・共有worktree管理情報を操作していない。

## 依存関係（GitHubで確認）

main → #86 → #88 → #89 → #91 → #92 → #94 → #97 → #98 → #99 → #100 → #101 → #104 → #105 → 今回のPR。

| PR | 固定head |
|---|---|
| 86 | 6b4a88c042f8e7526bf0e25cee0700c871f3a53a |
| 88 | c40f062fd15532ec3df4d8841ada571a41e3a3b5 |
| 89 | 129e96d2b3b9d34b193a5fabea624d15a7a32f12 |
| 91 | f35a9e603fed1e8307f3ed2c529334ff6d5d02e0 |
| 92 | 37e6e10f080ad300a098f95dee48365b0e641997 |
| 94 | 88767a08f057c95764a38e58b695706e65211836 |
| 97 | a5594422458936ffe9a2d90fdacf19d366a67d9e |
| 98 | 45e14590f5117de99aa61bb6c96abedd9e796852 |
| 99 | f2a2bdf054340faa1db95e3ff2402c3babc58913 |
| 100 | 3312228859ea4a757d198f65fdb696e2edb44a86 |
| 101 | bdd3c7045f9b550f6d28ab215e7e8b266c588032 |
| 104 | 9c5ed8ab6657761a014396bfe2469415436da844 |
| 105 | 7b3a53e7291d04d5007dc7097d9390f165b2d4c1 |

既存の積み上げを無断で個別mergeしない。承認後もmainが基準から変わっていれば、最終tree・migration・既存NEWS修正を再確認する。

## 前回までの停滞原因

`dot-publication-gate.js` が `safetySnapshot()` による全件JSONを取得し、同じSQLの再評価を最終承認INSERTへ埋め込んでいた。500行・256 KiBを超えると安全にHOLDするが、実NEWS規模では正常系を利用できなかった。

世代更新用トリガーは、D1の `meta.changes` に補助更新を加算する。既存の保存成功判定が1件を期待していたため、成功後に競合として返る問題があった。#105はassisted登録の候補・編集・receiptに `RETURNING` を導入した。ただし他の旧コードすべての変更件数依存を修正したPRではない。

## 今回の方式

**通常NEWSの表へ世代更新トリガーを追加しない。** 候補関連の安全条件を最終承認の条件付きINSERTで再評価する。変更世代と等価な状態証明として、判定に使用したSQL結果と候補・証拠行のCASを使用する。

- `src/dot-candidate-fence.js`: 候補URL/URLハッシュ、現在の製品モデル、candidate ID、retained判断をD1内で評価。
- `src/dot-publication-gate.js`: 全件 `safetySnapshot()` の必須呼出しを除去。既存の正式validation、duplicate predicate、source確認、履歴確認は継続。
- `src/operator-review.js`: 最終の人間承認INSERT内で、新しい条件SQLをパラメータ付きで再評価。登録receipt、候補状態、source/history確認も同じINSERTの条件になる。
- 対象候補自身とその確認行は小さなCAS対象として保持。無関係な全Ledger本文はWorkerへ返さない。
- 既存の `legacy-duplicate-compat.js` による正式重複境界は維持。そこには別の512件/1 MiBのlegacy互換制限が残る。今回の全件500行/256 KiB除去と混同しない。
- 本方式は通常NEWSの既存書込み全てへ世代更新を追加する必要がなく、旧SQLによる関連行追加・変更も再評価条件に反映される。

条件結果の件数比較は、PASS時にrelated=0、unresolved=0、blocked=0であることを必須とする。非ゼロ件数同士の入替えを安全証明に使わない。使用した履歴確認IDも比較し、最終Ledgerのchecks_jsonにruleVersion、scopeDigest、scopeEvidenceIdsを保存する。最終INSERTでは実行時D1時計でも証拠期限を確認する（隔離fixtureの明示clockを除く）。D1の式深度100を超えないよう、同一内容の全列CASを均等なAND木にした。比較条件とbind順序は維持している。

## 孤立履歴の扱いと確認証拠

`news_dot_history_exclusions` は候補限定の独立アーカイブ確認。名称のexclusionは「この候補との関連性の除外」であり、掲載禁止判断そのものの撤回ではない。

保存するもの:

- 認証済みhuman_operator、確認時刻、有効期限（24時間）
- candidate ID、全候補snapshot、Dot digest/revision、登録receipt
- subject_key、判定に必要な保持履歴のsubject_token
- 元のURL、メーカー、製品、出来事、独立記録の参照根拠、証拠hash

Ledgerの現在の紐付け候補だけでは過去identityを証明できないため、保守的に保持Ledgerごとに確認を要求する。discovery・takedown・identity不足行も対象。既知のarticleIdentityハッシュがある場合は、確認した元URLのハッシュ一致を要求する。

- 元URLハッシュ・イベントtopicハッシュ・IDが対象候補に一致するreject/takedownはBLOCK。確認証拠で解除できない。
- 未確認のsubject、新しいsubject、subject_tokenの変更、失効、確認撤回はHOLD。
- 関連する現在候補や正式重複は、既存predicateと関連検索で別途判定。確認証拠で打ち消さない。
- 元から存在しない/期限切れで失われた履歴は復元していない。保持範囲外・別名の不足は、従来の候補別履歴確認の範囲と根拠が必要。検索0件を非重複と断定しない。
- product名の自動補完や新しいalias推測はしない。短い対象identityはHOLD。

証拠テーブルへのUPDATEは拒否するトリガーのみ追加。既存表への補助書込みは発生せず、通常NEWSのmeta.changesへ影響しない。Ledgerへは、旧形式のDot承認だけを拒否するSELECT-onlyのBEFORE INSERT検査（candidate_itemsの直接承認/承認済みfacts変更/再INSERTも検査）を追加する。これは世代更新ではない。通常NEWSと人間reject/takedownは継続できる。DELETEによる撤回は可能で、最終条件の再評価に反映される。期限切れレコードの自動削除/課金TTLは設定していない。

## Operatorの変更

既存Dot候補の公開前確認区画に「未特定履歴の追加確認」を追加。ページ上限50件、カーソルによる次ページ。元の履歴・独立記録・元製品を確認して保存する。

- GET `/api/candidates/:id/dot-history-subjects?after=...`
- POST `/api/candidates/:id/dot-history-exclusion`

Access認証、本人許可、Origin、CSRF、Dot feature flagを維持。AI/サービス主体は保存不可。DOMはtextContentを使用。確認を保存しただけでは掲載しない。原出典と履歴全体の再確認は従来どおり5分間、最終掲載は別の認証済み人間操作。

この追加UIの実Accessブラウザ受入は未実施。既存UI回帰とAPI認証境界をローカルfixtureで検証している。

## 実規模E2E

`test/dot-scale-d1.test.js` が永続ディレクトリのworkerd D1 bindingを作る。

- 561行（候補・Ledger・discovery・takedownの合計、証拠行を追加する前）
- Ledger156件、本文paddingを含む1,114,620 bytes
- 孤立Ledger5件、孤立discovery101件、孤立takedown3件
- identity不足と短いモデル/明示alias、旧revisionを含む
- 合計262件の独立した架空archive manifestを、seed時に定義
- Ledgerの元URLハッシュはそのmanifestの元URLに一致
- 実規模データが存在する状態でヤマハfixtureを正式登録
- 根拠不足ならHOLD。架空の認証済み人間がmanifestを確認・保存した場合のみPASS
- 候補・receipt・履歴を削除してHOLD解除していない
- 失効/撤回/改変/新しい不明履歴は再確認を要求
- 人間の掲載承認成功、workerdを終了し別プロセスで再起動
- Wrangler CLIが同じ永続DBを読み取ることも確認
- ACK喪失相当の承認再送は既存結果を返し、二重判断なし
- migration再適用、旧コード相当の変更件数判定、後からのtakedownも検証

manifestと人間認証は隔離fixtureであり、実ニュース媒体の権利確認や実Access本人操作の受入証明ではない。Moon Guitar M1の本番Firestoreレコードは今回取得・変更していない。

代表測定値（ローカル単発、クラウドの性能保証ではない）:

- ゲート全体: 28 SQL呼出し、返却249行（メタデータを含む）、52,218 bytes
- SQL内部rows_read: 153,574。保守的な未知履歴と証拠の走査が残る
- SQL duration合計: 約15 ms、Node/境界を含むゲートwall time: 約298 ms
- 最終条件の値とSQLを含む内部fence: 約33 KB
- 履歴1.1 MBをWorkerへ全件転送していない

現在の実規模では通るが、さらに大きな履歴でのSQL負荷改善は残る。単に上限を増やしたものではない。一方、無制限の負荷保証もしていない。

## 互換日付別の検証

標準のinstalled workerdは2026-09-18まで対応し、初回の2026-09-28指定は起動時に拒否された。リポジトリ依存を変えず、一時ディレクトリへ `@cloudflare/workerd-darwin-arm64@1.20261031.1` を取得した。`workerd --version` は2026-10-31。

そのbinaryを `MINIFLARE_WORKERD_PATH` に指定し、`NEWS_DOT_TEST_COMPATIBILITY_DATE=2026-09-28 node --test test/dot-scale-d1.test.js` を実行しPASS。Wrangler CLIによる同じDB再読取りも含む。本番設定やpackage-lockの依存versionを変更していない。

デフォルトnpm testは従来binary/2026-09-18で全回帰を実行。本番互換日付の実規模試験は別の明示実行として区別する。2026-09-28測定は28クエリ、52,218返却bytes、rows_read 153,574、SQL約15 ms、wall約298 ms。

再現時はnpm packで同じtool versionを一時フォルダへ取得し、展開した `package/bin/workerd` の絶対パスを指定する。今回は `/tmp` の一時toolを使用した。試験はローカルであり、本番D1の実行証明ではない。

## migrationと復旧

0025人間確認 → 0026登録receipt → 0027原出典確認 → 0028履歴確認 → 0029候補限定archive確認。

0029は追加テーブル・index・新テーブルのUPDATE拒否検査、およびLedgerおよび候補行へのSELECT-onlyのDot protocol検査。既存候補・Ledger・discovery・takedownを書換えない。ローカル再適用可能。旧Worker相当の既存表更新件数は1のまま。旧WorkerのDot承認metadataと直接UPDATEは新しい検査で拒否するため、旧版へ戻した場合に新ゲートを迂回できない。新migrationがない場合、新ゲートはHOLDになる。

将来の本番受入前:

1. mainと全積み上げhead、最終統合treeを再固定。
2. D1の現行schema、migration履歴、バックアップ/復旧可能時点を読み取り確認。
3. Dot OFFでのコード配備と追加migrationの順序を確定。
4. 0029が既存表の列・データを変更せず、補助書込みも追加しないこと、Dot限定検査が既存環境固有triggerと競合しないことを確認。
5. 対象候補・書込行・本人確認方法・誤公開防止・停止/復旧を具体的に承認。

異常時はDot機能OFF、新しい人間確認/登録/承認操作停止。旧Operatorへ戻しても0029の追加テーブルは残してよく、既存データを削除して戻す必要はない。Worker rollbackをD1データrollbackと同一視しない。

## 残る受入と次にやること

- 実クラウドのAccess・Firestore・本番D1を通したPhase 4B受入は未実施。Phase 4B全体はHOLD。
- 最優先は新しいゲートSQLと履歴確認の契約を独立レビューし、実媒体のarchive証拠を確認できる範囲を固定すること。
- 実NEWSの156件等を自動的に無関係と判断してはいけない。今回の262件の架空manifestを実媒体の証拠として利用しない。
- 実データで候補限定の独立archive確認を行える範囲と、照合不能としてHOLDする範囲を固定する。
- 追加フォームはローカルの署名fixture経由でChromeの1280px/375pxを受入した。実Access本人によるフォーム受入は別途必要。
- 非ヤマハの許諾を推測してPASSさせない。既存の出典別policyを再利用する。
- Cloud Run/Firestore間・外部出典の更新はD1でロックできない。既存の直前再読取、digest/revision、短命の原出典確認が検出する範囲までの保証。
- 同時承認/却下はD1で検証済み。最終SQL直前の新履歴追加はSQLite注入試験、D1条件そのものの再評価はworkerdで検証。広い多拠点本番負荷試験とは区別する。
- 人間の掲載判断と自動運転は別。自動掲載・毎朝6時実行は無効のまま。

## クラウドの最終既知状態（今回未再照会）

Project `cruise-news-drive-isolation`、Firestore `(default)`/Native/Standard/asia-northeast1。
Cloud Run `news-dot-review-isolation` は最終報告時Invoker IAM必須、復元revision `news-dot-review-isolation-00001-4fs`。
隔離Worker中継OFF。本番OperatorのDot機能もOFFが最終既知状態。
Firestore readerは `cruise-news-review-reader@cruise-news-drive-isolation.iam.gserviceaccount.com`。
これらを今回liveで再確認したとは報告しない。次のクラウド操作前に読み取り確認する。

## 公式仕様の参照

- D1結果形式: https://developers.cloudflare.com/d1/worker-api/return-object/
- D1 prepared statements: https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- SQLite WITH / MATERIALIZED: https://www.sqlite.org/lang_with.html

SQL仕様と実際のinstalled workerd D1試験を併用した。ローカル結果を本番D1実行の証明として扱わない。

## 最終検証結果

- `npm test`: 1,582件PASS、FAIL/SKIPとも0。
- `node --test apps/cruise-port/news*.test.mjs`: 60件PASS。
- NEWSとOperatorの両Wrangler dry-run: PASS（配備していない）。
- syntax、`git diff --check`: PASS。
- 変更17ファイルの秘密鍵/アクセストークン類パターン検査: 検出0。
- 初回はD1の式深度上限で失敗したが、全列CASを均等なAND木に変え、実workerd D1の登録→承認を再試験しPASS。その後の全回帰もPASS。
- 本番互換日付2026-09-28の実規模runtime試験も別途PASS。新フォームはローカルChromeでHOLD→確認保存→PASS、ACK喪失→同一request replayを受入した。実Access上のフォーム操作は未受入。

成果の正確なcommitと新Draft PR URLは最終報告とこのbranchのGit履歴を参照。

## ローカル実ブラウザの追加受入

Chrome 156を新規headless profileで起動し、1280pxと375pxで表示を確認。375pxはscrollWidth=375で横はみ出しがないことも確認。アプリのHTTPS/Access設定は変更せず、ループバックのQAサーバーでHTTPS originとローカル署名fixtureを模擬した。JWTはQAサーバー内に保持し、ブラウザへ送っていない。

操作: 候補詳細→HOLD表示→履歴読取→独立archive根拠の入力→確認保存→PASS表示。保存ACKを一度破棄し、同一request IDで再送され、サーバーのreplayed=trueになることも確認した。掲載承認ボタンはブラウザQAでは押していない。D1承認E2Eとは別の試験。

手順スクリプトは一時QA用 `/tmp/dot-scope-browser-preview.mjs` と `/tmp/dot-scope-browser-check.mjs`。本番の認証成功を証明するものではない。

ブラウザ画像は `~/.codex/news-artifacts/phase4b-candidate-scope-20261031/dot-scope-ui-pc.png` と `dot-scope-ui-mobile.png` に保持。一時QAサーバーとheadless browserは停止済み。実Google資格情報はブラウザに渡していない。

最終実装のversionは0.47.1。旧形式のDot Ledger承認、候補行の直接承認UPDATE、承認済みsource変更は拒否する試験がPASS。通常NEWSの全回帰はその検査を適用したschemaで1,582件PASS。
