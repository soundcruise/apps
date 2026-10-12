# Asset cleanup / reference publication contract

2026-10-12。Asset Cleanup vs Reference Addition Raceの限定修正。
B1-6製品統合は未完了。production deploy / D1適用 / cutoverなし。
ACCEPT_COMPAT / authority legacy / enforcement OFF / Studio shared write OFF / canWrite=falseを維持する。

## 原因と線形化点

旧実装は「candidate SELECT → Account claim INSERT → 参照SELECT → R2 delete → D1 deleted更新」。
claimはcutover prepareだけを拒否し、record publicationには見えていなかった。
参照SELECTとR2 delete完了の間にpushがrecord / change / datasetをcommitでき、参照だけが残った。

新実装はD1を調停点にする。0036のrecord INSERT / UPDATE triggerは実際のrecord変更と同じtransaction内で、
全Port recordのJSON `assetId`を検査する。Gear、My Apps、Practice attachment、その他のowner参照にも同じ条件を適用。
予約中・削除済みのasset参照、既知catalog assetの未公開状態・別user参照はabortする。
trigger失敗はrecordだけでなくchange log / dataset aggregateを含むbatch全体をrollbackする。
legacyのACCEPT_COMPAT早期許可でもtriggerを迂回できない。B1-5 epoch/auth/CAS guardは引き続き独立して必要。

cleanup reservationは一つのD1 batchで現在のasset identity / state / updated_at / 猶予期間 / 全live owner refs /
cutoverの不存在を検査してAccount claimとasset deletion ledgerを同時作成する。
参照が先にcommitした場合は予約できない。予約が先なら以後の参照追加は成功しない。
D1外のJavaScript lock、事前SELECT、R2処理中の再SELECTだけには依存しない。

## 状態とobject identity

既存sync_assetsのCHECK/stateは変更しない。別の追加table `sync_asset_deletions`を正本とする。

| ledger | 意味 | 新規参照 / 公開 | 次の処理 |
|---|---|---|---|
| なし | 既存asset lifecycle | 既知available/unreferencedだけ許可 | 参照なし・eligibleなら予約 |
| deleting | 不可逆な削除予約取得済み。crashもあり得る | 拒否 | 固定identityを再確認してR2 delete |
| recovery-required | R2 / D1結果不明、または世代不一致 | 拒否 | identity一致なら同じobjectのretry。不一致は保持 |
| deleted | R2 delete成功とD1完了記録が成立 | 永続的に拒否 | 同claimの完了応答を回収 |

固定するもの: claim UUID、asset ID、Account / membership / Sync user、Account generation、membership generation、writeEpoch、
object key、objectVersion、content hash。予約時に既にpurge済みのownerだけgeneration=NULLを明示記録する。
復旧時とfinalize transactionで現在の世代を再照合する。callerのobject keyをそのままR2へ渡さず、照合済みD1 rowを使う。

予約は期限で消さない。claimのcancel/reclaimは提供しない。R2成功後もasset ID/keyのledgerを永久tombstoneとして残す。
triggerでreserved assetのidentity変更、row削除/REPLACE、同asset ID/key再作成、deleted逆行を拒否する。
新bytesは新asset ID/keyと新operationで明示uploadする。遅い旧cleanupは新objectに到達できない。
Account claimはR2成功後のfinalize batchでだけ解除し、cutover barrierと整合する。

## D1 / R2障害と復旧

1. claim取得のD1 batchが失敗したら、予約もledgerもrollback。R2は呼ばない。
2. claim後crashはdeletingを保持。次のscheduled runが同claimを回収する。
3. R2失敗・成功後の応答喪失はrecovery-requiredへ。記録自体も失敗したらdeletingのまま、同じ拒否境界を保つ。
4. R2成功後のD1 finalize失敗も予約を保持。再起動後は同じimmutable keyのdeleteを繰り返し、finalizeを再実行する。
5. finalizeは世代/参照/identity再検査 → ledger deleted → asset deleted → Account claim解除を同一batchで行う。
6. 別Workerが同claimを同時retryしても、削除対象は同一immutable key。完了済みclaimの応答回収はidempotent。
7. Account / membership / epochが変わったclaimは自動retagしない。recovery-requiredを保持する。
8. B1-5の旧claimにはobject identity ledgerがない。そのclaimは自動推測・解除・削除せず、別の運用復旧判断を要する。

Account切替がR2処理中に起きても全reference triggerと永久identity予約が有効なので、参照復活やobject再利用はできない。
R2とD1を単一transactionとは主張しない。upload開始後に予約が入ると、遅いR2 putが同hashの未公開orphanを残す可能性はあるが、
D1 uploaded/commit/publicationを拒否する。完了tombstoneを解除せず保持し、この残存bytesを利用可能assetとは扱わない。
このような完了後orphanの追加掃除は本修正では自動化しない。

復旧candidateは一回最大100件。新規candidateも別枠最大100件。復旧できない対象もupdated_atを更新して後続対象を永久に塞がない。
read-only status/Hostから復旧やcleanupを起動しない。公開operator APIを追加しない。

## 全writer coverageと互換境界

| 経路 | 防御 |
|---|---|
| Gear / My Apps / Practice attachment / owner refs | sync_records全Port INSERT/UPDATE trigger |
| Sync push / migration push / conflict解決 / tombstone復活 | 同じapplyOperation batchとtrigger。operationId dedupe/CASを維持 |
| bootstrap / migration complete | dataset metadataのみで参照追加なし。record移入は上記経路 |
| asset prepare再送 / content upload / commit | 現在claimをpreflightで照合し、D1状態変更もtriggerで拒否。古いupload結果で公開しない |
| unreference | 参照除去の宣言だけではdelete資格にならない。予約時に実live refsを再検査 |
| removal safety | 他appのclean/retention reportであり、asset予約やreference guardを解除しない |
| rollback / recovery | 予約row不変・永久tombstone・同claim retry。削除済みassetを旧snapshotで復活させない |
| Account purge | bytes metadataは従来どおり残る。予約前にpurge済みならNULL identityを固定。予約後のpurgeは自動採用せず復旧待ち |
| enforced fixture | B1-5 fenceと共存。ledger付きAccountの新規cleanupは引き続き保留。移行前にretireしたassetも参照不可 |

既知のavailable/unreferenced assetは、claimがなければlegacyでも正当に参照復旧できる。
既存legacy recordのcatalog外参照を一律削除・拒否するデータmigrationはしない。
catalog外参照の新しい完全性検証はこの競合修正の保証対象外で、既存enforced側の厳しい参照検査は維持する。
削除対象として扱う全catalog assetにはこの予約が必要であり、予約済みID/keyをcatalogから消せない。

APIはasset_reference_unavailable / asset_cleanup_conflictを409で返す。
enforced側の既存guardが先に拒否する場合はdataset_authority_unavailable(503)等の既存taxonomyを保つ。
昔成功したoperationIdへのduplicate ACKは参照再追加を意味せず、削除済みrecordを復活させない。

## B1-4 migration inventory

Port candidateのbinary metadataに任意のread-only `cleanup`証拠を受け取れる。
state / claimId / objectVersion / epoch等をmetadataHashとbinaryManifestへ含め、sourceHash・journalへ固定する。
cleanup-claimed / deleting / recovery-required / deletedはraw救出用manifestに残すが、stage / sealで利用可能binaryとは判定しない。
状態不明は拒否。証拠の欠落は「cloudで参照可能」との証明ではない。
通常起動から証拠取得・移行・cleanupを開始せず、本番のfresh evidence接続はB1-6の残作業である。

## Migration / rollback / release

0036は追加table/index/triggerのみ。既存asset / record / bytesをrewrite・削除しない。適用は本番では未実施。
将来の公開では0036適用と対応Workerを独立したrelease gateで確認し、旧Workerへの無条件rollbackを禁止する。
D1 schemaを戻してtrigger/ledgerを削除してはならない。旧Workerのclaim解除方法も新契約には対応しない。

[D1 batchのtransaction契約](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)と
[R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)を確認し、SQLiteに加え実workerd/D1/R2 bindingで検証する。
テスト用HTTP control routeは`test/asset-lifecycle-worker-entry.js`だけにあり、production entryはimportしない。

Port 1.22.6は隔離migration inventoryの内部安全修正に伴うpatch。既存module/cache参照を同期する。
Studio0.26.1 / schema1維持。Worker code/schema revisionを商品versionと混同しない。
B1-6製品統合、production enforcement、shared writeは未完了・未有効化。
