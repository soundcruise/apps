# Phase 4B 削除修正 — 実装済み・ローカル受入PASS

基準はPR #111 `71dd2415003e3b7905978ec1aa50dd5768bd57ce`。作業branchは `codex/news-dot-phase4b-deletion-fix-20261031`。元の未commitテストを保全して正常系試験へ発展させた。mainは読み取り照合時点で `5c07c7b3d05bc99153113f214babd3a161514bf1`、#108/#109/#111は変更していない。

## 成立した保存契約

追加migration `0030_dot_deletion_receipts.sql` を使用する。0025〜0029を含む従来migrationは変更しない。登録中のreceiptのFKは維持する。

candidateのBEFORE DELETEトリガーが、同じSQLトランザクション内で次を行う。

1. 独立した `news_dot_deleted_receipts` に冪等・拒否照合用の最小記録を確定する。
2. publication/history確認、確認証拠、assisted編集、facts再検証、shadow/category/lifecycle、対応するdiscovery情報を除去する。
3. 判断Ledgerの見出しをNULLにし、人間のverdict・監査識別情報を従来の保持契約で残す。
4. live receiptとDot確認情報を除去する。元のDELETEが候補本体を消去する。

子の削除や後続batch文が失敗すると、削除記録の追加も含めてロールバックする。`item-delete` のtakedown、`source-delete` のdisabled/takedown/publication_blocked更新は、従来どおり同じadmin batchにあるため、候補削除と共に確定する。`purge` の前段cleanupは従来どおり別commitであり、purge関数全体の原子性は主張しない。

削除記録はrequest/Dot候補/配送/NEWS候補/確認の識別子、digest・revision・証拠/入力hash、作成/削除時刻、source、削除時の審査/停止状態を保持する。候補ラベル・facts・原文・確認者ID・自由記述は保存しない。通常Ledgerの既存の監査主体や粗い判断特徴はこの修正で別物へ書き換えない。Ledgerの従来の保持処理は維持する。

**正確なsource_url/normalized_urlは、別IDによる同じ記事の再投入を旧SQLでも拒否するために保持する。URLを完全消去したとは報告しない。** workerd D1の利用可能なSQLにsha256/sha3を前提とせず、記事URLを拒否照合の必要な識別子として使う。新規の秘密値・認証情報は保持しない。記事単位の削除で、無関係な候補やsource共有キャッシュを一括消去しない。

削除記録に自動TTL・解除APIは設けない。期限切れpurgeも同じ候補の復活防止対象とする。通常の90日takedownが失効しても拒否照合は残る。再利用が正当化される場合の解除・匿名化は別の明示的な設計・承認が必要であり、今回のAPIに解除経路はない。

## 再送と旧Worker

- 元のrequest ID・候補・確認・入力hash・認証主体が一致する再送は `deleted` を返す。確認本文やFirestoreの再取得を必要とせず、ACK喪失・再起動後にも復活しない。
- 同じrequestの異内容、同じDot候補への別requestはconflict。別Dot候補でも同じ記事URLはexcluded。配送キーの再利用はDBで拒否する。
- candidate IDまたは両URLの一致をDBのINSERT/UPDATEガードで拒否する。INSERTはIGNOREにして、旧collectorの他記事処理を止めず、対象行のchanges=0を返す。
- 削除済みcandidateへの旧形式の承認、receiptの再投入、削除記録のUPDATE/DELETE、削除記録なしのlive receipt削除をDB側で拒否する。live receipt更新も拒否する。旧Workerが新しいテーブルを知らなくても直接DELETEには同じ削除契約が適用される。
- Dot未削除行の旧形式承認は0029のガードを維持。通常NEWSのINSERT・承認・却下には新たな書き込み副作用を加えない。
- Dot DELETEのmeta.changesには子の削除等が含まれる。旧adminはその件数で成功判定しない。旧purgeの統計件数は多くなるが削除処理は成立する。新purgeは `DELETE ... RETURNING id` の対象行数を使い、通常候補との混在でも正確に数える。
- 異なるDot/配送ID、異なる正規URLを持つ情報の意味的同一性まで、この削除記録だけで証明したとは扱わない。その場合も既存のfacts/policy/重複/履歴/人間審査が必要。自動登録・自動公開の許可にはならない。

Operatorは既存Access/Origin/CSRF/機能Gateを維持する。削除済み状態のGETは状態のみ返し、消した確認本文やactorを返さない。UIに「削除済み・再登録できません」と表示する。バージョンはbug fixとして0.47.2。

単純CASCADEやreceiptの無条件削除は再送・旧承認の保護を失うため不採用。候補削除スキップは削除要請を満たさないため不採用。新Workerだけの前処理では旧DELETEと競合を覆えないため、DB内の移送を選んだ。

## 修正後の新しい試験証跡

`test/dot-deletion-audit-d1.test.js` は失敗期待の再現テストから、実際のmigration・サービスを使う成功試験へ変更した。

- 実workerd D1: expiry purge / item-delete / source-deleteが成功。Dotと通常候補の混在、未期限候補保持、source disabled=0→1、takedown、確認内容の消去を確認。
- 同一requestの再送・異内容/別actorのconflict・別ID同URLの拒否・旧直接DELETE/INSERT/UPDATE/承認の保護。
- 再起動後の永続読取、ACK喪失、並行削除、承認との競合。
- 承認済み/却下済み候補の消去と人間判断保持。
- 子削除失敗時のsource停止を含む全batch rollback、混在batchで後続1件失敗時のrollback。
- 登録済み0029 DBからの追加migration、同じmigrationの再適用。新migrationの適用自体は既存候補を変更しない。
- NEWS互換日付2026-09-28 / Operator互換日付2026-10-02で各11件PASS。workerd 2026-10-31.1を一時ディレクトリから指定し、repo依存関係は更新していない。
- NEWS/Operator全回帰 **1,594 PASS**。Port NEWS全回帰 **60 PASS**。syntax/diff確認、両Worker dry-runも実施。
- Port全体も実行し、**2,442 PASS / 4 FAIL（計2,446）**。当初不足していたfake-indexeddbは既存lockfileからテスト用node_modulesへ導入し、追跡中のPortファイルは変更していない。残る4件はtheme.test.mjsのCSS構造・旧Dark byte一致・theme配置・NEWS badge styleの期待値不一致。PR #111のcommitをgit archiveで別ディレクトリへ展開し、同じ4件の失敗（22 PASS / 4 FAIL）を確認した。削除修正による新規回帰とは区別する。範囲外のCSSへ変更を広げず、Port全体を全PASSとは報告しない。
- 既存の561行・1,114,620 bytesの永続D1正常系も修正後にPASS。262件の架空archive確認は実媒体の証拠ではない。今回新しい大規模性能監査は実施していない。

再実行例（すべて隔離ローカル）:

```sh
npm test
node --test test/dot-deletion-audit-d1.test.js
# 対応workerdを用意し、MINIFLARE_WORKERD_PATHを指定する場合:
NEWS_DOT_TEST_COMPATIBILITY_DATE=2026-09-28 node --test test/dot-deletion-audit-d1.test.js
NEWS_DOT_TEST_COMPATIBILITY_DATE=2026-10-02 node --test test/dot-deletion-audit-d1.test.js
```

実クラウドでの削除試験・実Access本人操作ではない。既存旧コードと同一のadmin処理および旧Worker相当SQLを実行した結果であり、旧本番Workerを配備して検証した結果ではない。仕様参照: [D1外部キー](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)、[D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)。

## 移行・復旧と次工程

本番には何も適用していない。実際の本番schema・backup/復旧時点・現在のクラウド設定は今回新しく照会していない。

本番適用には、全依存PRの統合審査、実schema/履歴/backup確認、Dot OFF、0025→0026→0027→0028→0029→0030の必要分のみ順序適用、通常NEWS回帰と対象行を固定した限定受入への別承認が必要。新Workerは0030前のDBでも読み取りを互換に保つが、0030適用前にこの削除修正が有効とは扱わない。

**Worker rollback時は0030を保持する。** 旧SQLの削除/再投入/承認ガードを残したまま旧Workerへ戻せる。0030や削除記録をdropして戻す方式は未承認・不適切。DB復元は別操作であり、削除前backupへの単純復元は候補を復活させ、削除記録を失い得る。復元時には削除意図・最新のtakedown/source停止・拒否記録を保全して前方修復する計画が必要。Worker rollbackをデータ復元と同一視しない。

次は、削除の同じ原因再現を繰り返さず、既存の候補中心承認ゲートの残る独立SQL・性能監査へ進める。既存監査の全領域をこの修正だけでPASSへ変更しない。Phase 4B全体は実クラウド限定受入が未完のためHOLD。Phase 4Cの常時鍵なし接続は別工程。本番migration/配備/main merge、D1/Firestore書込み、IAM/Access、定期実行は今回一切行っていない。
