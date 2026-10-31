# Phase 4B 削除経路の追加調査 — HOLD

## 固定基準

開始clone `~/.codex/news-clones/dot-phase4a-livefix-20261031` はclean。開始branch `codex/news-dot-phase4b-independent-audit-20261031`、HEAD `56c5753059c9824511cef8add105c5c7fef5fb77`、tree `28e4db8a530cb220ced4e9fc48254ef3a6745185`。GitHub PR #109 head一致、PR #108 head `4c41ac3b265c0885ed5f054847c0b37f49e3e725` 一致、main `5c07c7b3d05bc99153113f214babd3a161514bf1`。PR #105および全積み上げの今回の再照合は未完。

## 再現結果

`test/dot-deletion-audit-d1.test.js` は、実migrationをすべて適用したworkerd D1で、架空ヤマハ候補の確認と正式登録を行い、それぞれ実際の`NewsStore.purge`/`administer`を実行する。現在は失敗を期待する再現試験であり、製品のPASSではない。

- expiry purge: `FOREIGN KEY` エラー。candidateとreceiptが残る。purgeには削除batchより前にcommitされる処理があるため、全purgeが原子的にrollbackされるわけではない。
- item-delete: `FOREIGN KEY` エラー。candidateとreceiptが残り、同じbatch中に追加しようとしたtakedownは存在しない。
- source-delete: `FOREIGN KEY` エラー。candidateとreceiptが残り、同じbatch中のsource_stateのtakedown/publication_blockedは操作前のまま。fixtureではもともとdisabled=1であり、停止が0から1に変わる例は未検証。

対象はpendingの架空候補1件。承認済・却下済・複数候補・並行・ACK喪失・再起動・実際の旧Worker binaryでは未検証。actual workerd D1を使用するが、互換日付は既存localDatabase標準の2026-09-18。2026-09-28は今回未実施。

## 仕組みと対応条件

0026 `news_dot_admission_receipts.candidate_id` のFKは `candidate_items(id)` を参照し、ON DELETE CASCADEを指定しない。既存のitem-deleteはtakedown INSERTとcandidate DELETE、source-deleteはsource_state UPDATEとcandidate DELETEを同じD1 batchで行う。したがって、失敗時にそのbatch内の保護操作もrollbackされる。前段階で別々にcommitされたpurgeの操作はrollbackされない。D1のFK仕様: https://developers.cloudflare.com/d1/sql-api/foreign-keys/ 。

本番では、単純cascadeでreceiptを失うと再送防止・監査や旧Workerのガードを失い得る。候補の削除を単純にスキップすると削除要請を満たせない。安易なreceipt削除も同じ理由で採用不可。候補本文を消しながら独立した最小限のtombstoneにrequest ID、候補ID、配送ID、digest、判断と削除根拠を原子的に残す方式は検討候補だが、保持期間・個人情報・既存の0029ガードと旧Worker再登録経路・takedown期限を含む実装検証は未完了。現時点で採用済みの保存契約や修正migrationはない。

DBに旧Workerが直接書く経路もあるため、新Workerの事前処理だけでは原子性と混在互換を証明できない。SELECT-onlyの承認ガードはreceiptの有無に依存する。receiptを消す設計の場合、旧Workerからの承認・再登録や同一URL別IDを含む無断復活を防ぐDB側契約が別途必要。

## 次工程

1. 既存admin・purgeに加え旧Worker相当の直接DELETEを含め、削除意図・永続tombstone・takedown/停止・最小監査を1つのD1原子境界で成立させる方式を実装し、外部キー依存を非破壊migrationで移行する。
2. item/source/expiryと無関係候補の混在、承認・却下・期限切れ、ACK喪失・再送・競合、再起動、既存データを含むmigration/rollbackの試験を行う。正常化した後にこの再現試験を正の回帰試験へ書き換える。
3. その後、候補中心SQLの独立監査、EXPLAIN・規模拡大、全NEWS/Operator・Port回帰、本番互換日付のworkerd試験、両Worker dry-runと秘密情報検査を実施する。
4. 実データを使う限定受入は、候補・権利根拠・全書込行・backup・復元方法を特定後に別承認。本番D1/Firestore、Worker、main、IAM/Access、cronは今回変更していない。

Phase 4BはHOLD。Phase 4Cの常時鍵なしCloud Run接続と切り分ける。PR #108の561行E2E、1,582件等は前回の結果であり、今回の修正後のPASSではない。
