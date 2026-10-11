# Port Dataset Readiness Core v1

2026-10-11。Port 1.21.3 / Studio 0.25.1。Port所有の同期datasetを扱う保存基盤。
Studio M3、Studio shared write、Account / runtime lifecycle統合はまだ無効・未実装。

## 所有とAPI

`port-dataset-repository.js` に純粋なrepositoryを置く。他アプリへPort依存を持ち込まない。
`port-dataset-storage.js` はPortの既存storeとnative Storageをつなぐbridge。
Account / Pro / network / Audioはrepositoryの責務ではない。

- `PORT_DATASET_CATALOG` / `PORT_DATASET_KEYS`: 管理対象とschema上限、record/order種別の機械可読inventory。
- `readDatasetState()`: shared lock内で全raw値、opaque revision、key revision、generation、protocol、sharedWriteCapableを返す。永続化しない。
- `inspect()`: 同期reader用。WALがpendingなら読取拒否。metadata前後一致を確認する。
- `runWrite({expectedRevision, expectedValues, expectedKeyRevisions, source}, writer)`: exclusive lock、base比較、forward guard、private draft、保存、通知。
- `acknowledgeDelete(key, generation, expectedRevision)`: matching generationのみ解除。
- `subscribe(listener)`: 成功した変更を通知。購読者例外でcommitを失敗扱いしない。
- `registerPortRepository(storage, repository)`: 隔離test / 将来hostの注入点。Studioからはまだ利用しない。

管理外: Account credential DB、Sync IndexedDB/outbox内部状態、UI-only設定（Gear列数、Tuner meter、menu set選択）、Practice timer、Audio runtime、asset binary。

## Writer inventory

下表のstorage keyはすべて`cruisePort.`接頭辞。store内に残るsetItem/removeItemは、native Storageの場合は入口でprivate transactionへ振り分ける。直接localStorageへ保存するproduction経路はrepositoryだけ。
非登録の注入memory storageは従来の同期coreとして使用可能だが、shared write保証は持たない。

| key / collection | reader | 通常writer | migration | rollback / 削除 / 参加方法 |
|---|---|---|---|---|
| settings | loadSettings | saveSettings | legacy読取をprivate copyで解釈 | bridge、singleton intent |
| metronome | loadMetronomeSettings | saveMetronomeSettings | v1/v2読取はprivate copy | bridge、future拒否、singleton intent |
| metronomePresets | loadMetronomePresets | save/create/deleteMetronomePreset | private normalization | bridge、stable id削除とintentを同時commit |
| tuner | loadTunerSettings | saveTunerSettings | private normalization | bridge、singleton intent |
| practiceMenus / schemaVersion | load/initializePracticeMenus | savePracticeMenus | 初期曲練は表示用memoryのみ。明示保存で永続化 | bridge、二key同時、item/order intent |
| practiceProgress | loadPracticeProgress | savePracticeProgress | private copy | bridge、cycle singleton |
| practiceHistory | loadPracticeHistory | savePracticeHistory | private copy | bridge、event intent |
| practiceCalendar | loadPracticeCalendar | savePracticeCalendar | private copy | bridge、note intent |
| practiceMenuSets | loadPracticeMenuSets | savePracticeMenuSets | private copy | bridge、set intent。選択設定は対象外 |
| gearList | loadGearList | saveGearList / photo workflow | private copy | bridge、item/status order intent |
| gearCategories | loadGearCategories | saveGearCategories | 初期化/補完もprivate copy | bridge、category/order intent |
| myApps | loadMyApps | saveMyApps / icon workflow | private copy | bridge、item/order intent |
| syncAssetMetadata | PortAssetSync.readMetadata | writeMetadata / patchMetadataEntry / queueOrphanAssets / markLocalRemovals / attachment removal | private normalization、永続化はlock内 | coordinated cloneでmetadataとintent同時、preimage CAS |
| asset owner refs（gearList / myApps） | reconcile時にraw取得 | hydrate結果のowner ref更新 | 該当なし | repository、owner raw + revision比較、binary path維持 |
| syncDeletionIntent.v1 | repository / adapter | coordinateDeletes / asset removal | booleanを受理、新規操作はgeneration付与 | local removalと同じcommit、ackもrepository |
| 全Sync dataset | adapter.readLocalSnapshot | applyRemoteSnapshot / reconcileRemoteReferences | full snapshotの既存hydrate | 同じrepository、source=sync、独自rollback |
| rollback | repository WAL | repositoryのみ | 該当なし | lock内で元rawへ復元。共有runtimeの二重rollbackを抑止 |

`practice-dataset-writes.js` はprogress/history、menu/progressの複数保存を一回のcommitにまとめる。
全UI呼出元とphoto/icon workflowは非同期保存結果を待ち、成功前に保存済み扱いしない。
既存`storage-conflict.js`等の旧intent処理はprivate copy上に限られ、永続intentはrepositoryが再計算する。

## Revision / CAS / Lock

lock名は` sound-cruise:port:dataset:v1 `（前後空白なし）。protocolは1。
metadataは`cruisePort.datasetRepository.v1`。appVersionやschemaVersionとは独立。
generationは初回保存で発行し維持、revisionと変更keyのrevisionはUUID。
外部へ渡すopaque revisionはmetadata + 全raw値を含み、未参加writerのraw変更も比較対象。
変更のないread / no-opはrevisionを進めない。成功した変更で進む。

既存storeのbaseは最後の読取または自分のcommit結果。後続writerの最新値を勝手にbaseへ採用しない。
key revisionも比較し、A→B→Aでも古い編集を拒否する。関係ないkeyの変更では同じstoreの保存を不必要に拒否しない。
Sync full applyはdataset全体のrevisionとexpected snapshotをlock内で確認する。

Web Locks非対応では`sharedWriteCapable=false`。同等の安全性を偽装するfallbackは置かない。
閲覧・memory操作は可能だが永続dataset writeは`locks-unavailable`で失敗する。
Portの対応Chromeでは通常利用を維持。非対応ブラウザー向けの安全な単独writer modeは未導入。

## Forward compatibility

future / unknown schema、壊れたJSON、危険なproperty、未理解collection構造はwrite拒否。
loadに失敗したrecordをdefault保存で置換しない。
known envelope / surviving stable-id recordのunknown fieldは再帰的に保持する。
削除されたrecordは復活させない。asset bucketやtotalCounts等の辞書では明示除去を尊重する。

read-time migrationはprivate copyだけ。明示write時にguard / CAS / lockを通る。
Sync serializerがlosslessに扱えないcollection envelope metadataはcapture/applyを拒否する。
特にpreset未知envelopeはSync対象から黙って落とさない。singletonのunknown fieldはpayloadとして保持する。
検証できないdatasetはSync push準備も中止する。futureをcurrentへdown-convertしない。

## Full snapshot

`fullSnapshot(records)` はprotocol、対応type全一覧、capability、record key inventoryを付ける。
全typeについて空・不存在も表すfull datasetだけをこのfactoryへ渡す。
`assertFullSnapshot`は宣言一致、schema/type/ID/重複/内容を検証する。
既存singleton IDは固定。未知typeやfuture singleton versionは拒否。
生objectやfull wrapperからrecordだけ間引いたpartial snapshotはapply前に拒否する。

このmarkerはtrusted adapter APIの取り違え防止であり、悪意あるcallerが再生成できない署名ではない。
capture、完全なremote deserialize、full merge、正式conflict resolutionだけがfactoryを使う。
Metronome-only / 未表示collectionを未取得のままfactoryへ渡してはならない。

全collectionのfixtureでcapture→apply→captureのsnapshotを比較する。順序、他singleton/collection、gear asset参照、settingsのunknown fieldを含む。
ローカルbinary ID、activeSessionTiming、asset binding/release queue等の端末内情報は従来どおりcloud payload外で保持。

## Delete intent

段階を区別する: UI要求 → local削除+intent commit → outbox → cloud tombstone → ack → intent clear。
保存失敗時はUI要求をcommit済みと扱わない。item削除とintent保存の片方だけの成功を返さない。

新intentは`{generation: UUID}`。record / order / attachment owner-setを管理。
recreate時はそのintentを解除、再削除は新generation。旧ack/重複ackは新deleteを解除しない。
legacy booleanは読めるがidentityがないためgenerationなしackでは安全側に保持する。
recreateまたは次の新規deleteで解消される。無期限保持があり得ることを互換境界として明示する。

共有runtimeはgenerationをoutboxに保持してack時に渡す。Worker requestには追加せず、Worker schemaは不変。
cloud応答喪失→retry→matching ackを実runtime/adapter/repository結合testで確認。

## Partial failure / rollback

全writerはprivate draftへ書く。検証後、awaitを挟まずWAL → 全変更key → metadata公開を行う。
WALには元rawと元metadataを保存する。multi-key localStorageを本物のDB transactionとは呼ばない。
協調readerはpending WALを拒否する。

- committed: 全keyとmetadata公開に成功。
- unchanged: 変更なし。
- rejected: stale / forward / lock非対応 / writer不正等、未commit。
- rolled-back: 書込失敗、元rawと元revisionを復元済み。
- recovery-required: rollbackも失敗。pending WALを残し、以降read/writeを拒否。

自動復旧・破棄・再試行でWALを消さない。recovery-requiredは保存を中断し、別途明示的な復旧が必要。
Sync adapterの`ownsRollback`をruntimeが尊重し、古いbackupの再applyで新変更を上書きしない。
asset binaryの保存/cleanup自体は既存経路。今回atomicに扱う範囲はdataset metadata / refs / intents。

## 旧build・次工程の境界

保証は同じorigin・protocol・lockに参加する新build同士。
旧tabは検出不能な場合がある。raw比較は一部変更を検知するが、旧buildとの同時writeを排除できない。
未知protocol、pending recovery、future schemaではfail closed。旧build共存を完全解決したとは扱わない。

Runtime & Integration Safetyで残すもの:

- runtime singleton host、Account generation、dispose、status/ensure分離、cached badge。
- push byte chunk、実browser 2-tab、Port/Studio同時起動・旧build併存policy。
- Studio read-only hostの正式接続、Pro/Account認可、Editing Session external update。
- Studio shared write解禁は上記に加えmobile/Safari回帰と全writer参加の再検証が必須。

Core完了はM3製品統合完了ではない。次工程の設計・実装へ進めるが、Studio shared writeは引き続き禁止。

## リリースと検証

Port 1.21.2→1.21.3（内部storage safety patch）。既存domain schema変更なし。repository metadata protocol1とintent generationを追加。
Studioコード・version・Worker・他アプリコードは変更しない。
Portの変更moduleと推移的importerを1.21.3へ更新。Port HTMLのshared runtimeのみ?v=28。
今回は変更可能範囲の明示を優先し、他アプリHTMLの?v=27は維持する。
shared変更はoptional adapter hookに限定し、それを持たない既存adapterの動作を回帰確認する。

- repository: 38件。4事故はincident A〜Dとして明示。
- Port/shared: 1,346件（既存1,305 + repository38 + runtime3）。legal 10件を含む。
- Worker/Account: 592件。他4アプリSync: 85件。
- Chrome隔離browser: 1280px / 393px。Home、Metronome save、preset create/apply/delete、Tuner、Practice create/edit、Calendar、Gear、My Apps、4themes。
- console/page error、app 404、意図しないSync/Account requestは0。Proは隔離mock資格のみ。
- 保存後reloadで全cruisePort.*rawをbyte-equivalent比較。read-time書換なし。

実行コマンド:

```sh
node --test apps/cruise-port/*.test.mjs apps/shared/*.test.mjs apps/shared/sync-account/*.test.mjs apps/shared/sync-account/*.test.js
node --test workers/sound-cruise-sync/test/*.test.js
node --test apps/chord-cruise/tests/sync-*.test.js apps/pitch-cruise/sync/*.test.mjs apps/fretboard_cruise/sync/*.test.mjs apps/rhythm-cruise/sync/*.test.mjs
NODE_PATH=<Playwright dependencies> node apps/cruise-port/tests/readiness-core-browser.cjs http://127.0.0.1:8766
```

browser検証serverはrepository rootを配信する。既存のStudio確認用8765とは別の隔離serverを利用。
