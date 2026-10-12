# Port IndexedDB Authority Referential Integrity — L2b-fix

2026-10-13。Port **1.22.11** / Studio **0.26.5 / schema1**。
正式開始baselineはユーザー承認の`6a057e6055d252a459a4fcb60c07a53ee6557ccb`（NEWS commit保持）。
HEAD/origin/main/remote一致、tracked clean/stage空、ahead/behind0/0。
Production Authority legacy / Worker ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false。
**隔離Authorityの論理参照だけを修正する。L3/L4/L5/B1-6には進まない。**

## 再現と修正方式

修正前Node2件は期待される安全条件にFAIL。native Chrome155.0.8059.40、同origin/partitionの別renderer
PID11123/11125でも、添付削除intent欠落2件、attachment add確定後のmenu delete誤成功でdangling1件を再現した。
旧L2bのfull manifest/key-CAS PASSは、このcross-key不変条件の保証ではなかった。

A（双方向key dependencyだけ）は所有関係に関係しないmenu編集までasset metadataと衝突させる。
C（A+B）は同じ過剰CASを残す。採用は**B: 最新headへmergeしたcandidate full datasetの同期validation**。
`port-referential-integrity.mjs`はstorage/async/network/normalizationを持たない純粋関数。
Storeの同一RW transaction内でcurrent head/control/records→target・明示dependency CAS→guard→intent merge
→full dataset/reference validation→records/manifest/head/oplogを書き、completeでのみ成功する。
Repositoryの事前domain validationだけに依存せず、直接Store.prepare/commitを使っても同じ条件を通る。

添付↔menuの検査はtransaction scopeが両方向を保護する。attachment addが先なら、古いmenu deleteのcandidateは拒否。
menu deleteが先なら、古いattachment addのcandidateは拒否。どちらの順でもdangling headを公開しない。
`syncAssetMetadata→practiceMenus`の一律key依存はこの検査に置換する。
writerが実際に読んだキー、明示dependency、expected key-version、全revision指定のCASは維持する。
既存operation fingerprintのinferred dependency順序は別関数で保持し、L2b応答喪失requestの同ID再送互換を維持する。
Practice sets↔menusとasset owner↔metadataの既存preimage依存は維持するが、新しい推測的な依存は加えない。
異なるmenuのmemo更新と他ownerのattachment add（別保存key）は両方成功可能。
同じcollection keyの異なるrecord編集は、既存のkey単位CASに従いstaleになることがある。record単位CASを導入したとは称さない。

## Reference graph / 所有・削除の意味

以下はPort-owned logical dataset内の関係。別app/Account/Proをdata ownerへ昇格しない。

| 参照元 / 保存key | 参照先 / 保存key | 意味・削除時 | 欠落を許すか | 必要な保護 / intent |
|---|---|---|---|---|
| attachments[id].practiceId / syncAssetMetadata | menu.id / practiceMenus | 添付のowner。公開/準備中ともowner必須 | **不可** | transactionの双方向candidate検査。個別attachmentと最後のowner-set intent |
| attachment.published.asset.ownerRecordId（存在時） / syncAssetMetadata | entry.practiceId | 宣言されたasset ownerとlogical ownerを一致 | **不一致不可** | 同期検査。stable attachment IDのowner変更は拒否、新IDを使用 |
| available attachment.published.asset.assetId / syncAssetMetadata | structured asset reference | availableとしてのsource IDを必須化 | **欠落不可** | transaction検査。physical Blob/remote assetの存在確認はL4で、今回証明しない |
| attachment.binding/pending.localId / syncAssetMetadata | Practice binary DB | local cache/pending source | 未cache/cloud-only/pendingを許す | 別DB原子性/copy/recoveryはL4。今回は外部DBをtransaction内で開かない |
| practice_attachment_set（Syncへの導出） | attachment IDs / syncAssetMetadata | ownerごとの集合。独立した保存tableはない | owner空なら集合削除 | 同じmetadata transactionでlast-member→owner-set intent |
| menu.appId=myapp:<id> / practiceMenus | myApps.id / myApps | 利用先リンク。削除後はresolverが「削除済みのMy App」表示 | **許す** | appを自動再作成/retagしない。app deletion intentを保持 |
| set.itemIds / practiceMenuSets | menu.id / practiceMenus | 保存済み集合と表示順。missing IDsは表示から除外し保持 | **許す** | 既存双方向key dependency、必要時explicit read CAS。set削除はpractice_menu_set intent |
| checked/counted IDs / practiceProgress | menu.id / practiceMenus | cycle/cumulative data。UI削除はremovePracticeFromProgressで整理 | 既存Sync状態/累積値を保持 | owner存在を新たなhard条件にしない。cycle削除はsingleton intent |
| history.practiceId/appId/cycleId / practiceHistory | menu/My App/過去cycle | 名称・時間等を含む履歴snapshot | **許す** | 削除済みの対象で履歴を消さない。history event削除intent |
| Calendar notes / practiceCalendar | local date/time | menu FKなし | 対象なし | note ID/key CASとcalendar_event intent |
| Gear.category / gearList | category / gearCategories | custom/category表示情報 | 既存unknown/fallbackを保持 | 既存domain validation。category/order/gear/order削除intent |
| metadata.gear/myApps rows / syncAssetMetadata | gearList/myApps owners | retained binding/cache/release情報。live owner recordからのみassetを採用 | retained cleanup/cacheを許す | 既存owner↔metadata key dependency。binary整合はL4 |
| Gear photo IDs / My Apps icon IDs | それぞれbinary DB | device cache/asset reference | cloud-only/cache欠落を保持 | L4。通常製品の保存APIは切り替えない |
| metronomePresets.settings | preset内の値copy | metronome設定へのlive FKなし | 対象なし | apply時の明示preset dependency。preset削除intent |
| settings/tuner/metronome/schemaVersion | singleton/scalar | dataset上限・設定 | 対象なし | forward guard/key CAS。schemaVersionは削除可能recordではない |
| release/discard queue / syncAssetMetadata | 過去asset IDs | cleanup/recovery evidence | live owner欠落を許す | queueを勝手に削除/normalizeしない。L4で回収 |

owner付き添付があるmenuを単独削除するとattachment-owner-missingで拒否する。
**menu削除と対応attachment metadata削除は同じlogical writerで明示する**。自動cascade/未知fieldの正規化は行わない。
通常legacy UIの段階的cleanupは不変更。新Authorityの製品UI接続時は、このcoordinated deleteを利用する必要がある。
古い不正headをnew readerが見つけた場合はhydrateをrecovery-requiredにする。diskの自動修復/削除/legacy fallbackなし。

## Delete intent parity / generation / tombstone

catalogのsingleton、各collection record、order、Gear status orderは既存契約を維持する。
添付metadataから削除されたlogical IDに`practice_attachment/<id>`、最後のmemberが消えたownerに
`practice_attachment_set/<owner>`を追加する。削除recordとintentは同じtransaction・同じoperationId generationで確定する。
logical addition/recreate時だけ対応intentを解除し、surviving recordの存在だけで古いintentを無条件解除しない。
legacyの「全surviving IDでintentを解除」はコピーしない。unknown intent fieldsも現在headを元に保持する。

明示ACKはcurrent generation一致時だけ解除する。delete→recreate→delete後のold ACKは新generationを保持。
intentをmanifestの正式構成にし、既存Sync tombstoneのidentity/derivation/schemaは変更しない。cloud/正式Sync接続は今回行わない。
Recordが欠落しただけのsnapshotを新しいdelete intent要求とは扱わず、現在headのintentをmergeする。
同一intentへの競合する新要求はtransaction全体をabortする。oplog replayは確定事実を返し、再認可/二重deleteを行わない。

## 検証・再現コマンド

```sh
node --test apps/cruise-port/tests/idb-referential-integrity.test.mjs
node apps/cruise-port/tests/cross-tab/cross-tab-driver.mjs --suite=referential --backend=indexeddb-authority --mode=acceptance --rounds=3
node apps/cruise-port/tests/cross-tab/cross-tab-driver.mjs --backend=indexeddb-authority --mode=acceptance --rounds=3 --iterations=200
```

Node35件: 修正前2件の固定再現、12種類catalog delete parity、複数添付/owner-set、両commit順、coordinated delete、
recreate/old ACK、soft link/history/set保持、独立menu/key、missing owner/source、owner変更、intent conflict、abort/quota/replay。
Native: A〜F＋attachment intent parity、3payload（0/20KB/200KB）×3round=**63round PASS**。
各scenarioでdangling attachment/delete intent loss/stale false-commit/duplicate ID/partial manifest/lost updateは0。
My Apps→Practiceのmissingリンクは許容状態であり、不整合0へ読み替えて削除しない。
WebLocksなし/通知全欠落、同origin/partition、Chrome trace固有markのPIDで別rendererを確認する。
添付専用native failure4項目: abort/quota、response loss→reopen→同IDretry、Page.crashをrecord callback境界で発生させる。
既存L2bの54round＋7項目、L2a native14項目も回帰PASS。

終了/crash時はJS complete通知が届く前でもnative transactionが確定済みの場合がある。
そのためoplogを照会して、**exact old snapshotまたはexact committed snapshot**と一致することを検証する。
「callback中の終了なら必ずabort」を安全oracleにしない。明示abort/quota試験では旧head/intent/oplog不変更を要求する。
OS/電源断・物理durabilityの実証とは区別する（L5）。

baseline Worker760 / Port/shared1940 / Other186 / Studio315 / workerd8、全PASS。
最終Node Worker760 / Port/shared1975 / Other186 / Studio314（commit後315をclean guard込みで確認）/ workerd8。
Port browser18+26+10+18、Studio97+Host10（4Themes/Print含む）、application console/404/unexpected write0。
Studioの同期adoptionの選択/focus/新値/dirtyは、同じrenderer turnで一括観測し既存assertionを維持する。
別CDP読取を挟むと未変更Loupeの次frame再描画と競合する。後続frameのfocus保持は既存別課題として残し、今回製品UIを修正しない。

## 次工程のgate

L2b-fixは論理delete intent parity・hard reference・Store transaction・Repository CAS・feature/native互換の範囲。
L3正式control/Pro/Account未着手、L4 binary/migration/recovery未着手、L5実機未着手、B1-6再開不可、shared write解禁不可。
独立レビューでこのfixを再確認してからL3の着手判断へ進める。今回L3のcode/control接続は行わない。
