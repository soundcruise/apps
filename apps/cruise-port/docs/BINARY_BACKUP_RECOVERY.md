# Binary / Backup Recovery v1 — 隔離契約

Studio 0.47.8 / Port 1.24.11の未公開候補。Project schema2、Account physical3、Authority physical2を維持する。PR #10 → #11 → #12 → #13に依存する。

## 所有と起動境界

`port-binary-recovery.mjs`はPort ownerが管理するfixture専用coordinator。既存のPort binary owner、Account cutover source、Authority Control/journal、Shared backup ownerのDBを再利用する。製品boot graphには接続しない。実Account・認可・通常writer・Cloud/R2・Shared write・Port active pointer切替を行わない。既存のAccount資格やmutation receiptのpayloadをbackupへ複製しない。Accountのfull-source manifest/digestとAuthority停止factを照合する。

Shared `app-backup-recovery.mjs`は既存sound-cruise-sync-app-backups/backups v1に固定IDの追加専用pinを格納する。通常backupのappId/createdAtを持たせず、既存byAppCreated indexと5世代pruneの対象にしない。通常backup API・保存正本は変更しない。Port binaryは既存ownerの専用inert generationへ複製する。これらは復旧用の固定archiveであり、通常読書きする第二正本ではない。

## 入出力と状態

`createIsolatedPortBinaryRecovery({scope,indexedDB,storage,checkpoint})`。同一fixture scope/IDB factoryを必須とする。`prepare({archiveId,generation})`、`stage({archiveId})`、`recover({archiveId})`、`dispose()`を提供する。archiveIdは英数字/_/-の1〜80字。

1. prepare: 全既知cruisePort.* raw文字列とrepository metadata、binary bytes/hash/metadata/参照を読む。未知key・schema・値は拒否する。Account protocol3、active Authorityを照合し、既存Control transactionのrecoveryRequired停止factを先に永続化する。同じ停止の応答喪失後はpersisted factを照合し、異なるCASで停止を再発行しない。
2. 固定manifestとchecksumをShared ownerにaddし独立readbackする。既存pinと内容が異なれば拒否し、上書きしない。prepare成功はarchiveVerifiedではない。
3. stage: 原本rawと全binary manifestを再照合し、各assetをPort ownerのputImmutableで追加する。同ID・同bytes/metadataのみ再利用可能。部分失敗を完了としない。明示stageによる再開は現在原本とbindingが一致する場合に限る。
4. recover: 修復・自動retry・live restoreを行わない。pinと全destination keysを読み、bytes SHA256・size・MIME・metadata hash・所有参照を既存binaryManifest/verifyDestinationで再検証する。Account full source・Control/pointer・停止factを前後照合する。

manifestにはraw payload、rawDigest、binary descriptorとmetadataHash/owners/deletionState、Account manifest、Authority Control/pointer digest、binary generation、falseのcanWrite/cloudConnected/liveRestore/rawWriterExcluded/atomicを保持する。512 assets / 128 MiB、Port raw JSON4 MiB、packet JSON8 MiBが上限。異常値は削除せず停止する。

成功はhistoricalなas-of-read検証に限定する。常にcanWrite=false / operationAuthorized=false / continuityProven=false / recoveryRequired=true。archiveVerified=trueは実DBから読めた完全な固定archiveを意味する。restorePreviewReadyは孤立binary参照がないmemory-only preview条件であり、正式復元・writer資格ではない。孤立assetは保持しpreview readyをfalseにする。Port原本が失われた場合もarchiveの検証・閲覧は可能だが、portSourceMatches=false / requiresSourceReview=trueを返し、原本へ書き戻さない。previewにlive setterはない。

## 不確定状態と制約

Account DB・Authority DB・backup DB・binary DBを跨ぐ原子的transactionは仮定しない。停止が証明できない、pin欠落/破損、binary欠落/重複/余剰/破損、容量不足/abort、source・generation・receiptの変化はfail-closed。部分archiveは保持する。正常Bが成立した後の旧AはBのAuthority/receipt/preparedを変更しない。

既存mutable binary APIと同一origin raw IndexedDB writerの完全拒否は未保証。putImmutableはACLではなく協調APIの不変性。読み取り直後のraw改変・ABAを永続的に排除するものではないため、各利用時に再読取し、本結果を最終admissionに流用しない。checksumは整合照合であり第三者署名ではない。readback/reopenはbrowser commitの証明であり、物理電源断・OS flush・storage evictionに対する保証ではない。未知データを修復/削除せず、hardware durability・export先・retention・本番容量とrestore承認は後続gate。

## 受入と次工程

Node: immutable duplicate、bytes/metadata/key/ref照合、孤立・未知・future schema、quota/abort、6 crash境界、prune6、別factory、競合stage、旧A/正常Bを実owner fixtureで検証する。Chrome native IndexedDB: 2 renderer、通知欠落、renderer close/reopen、停止/pin/binary/readback応答喪失、quota、破損、prune、正常Bを検証する。外部通信/Console/404と通常bootのreadonly境界も確認する。実行数・commit/tree・hashはrepo外証跡で確定する。

Metronome BPM保存の隔離縦断試験は、Port repository ownerを唯一の正本とし、fixture限定の明示操作・revision/CAS・Account/Authority最終barrier・receipt・reopen/readbackを接続する範囲で進められる。今回のarchive成功を保存許可として使わない。製品writer接続は別工程。正式owner route/credential expiry/backend再認可、全consumer cutover/旧writer制限、migrationとbinaryの本番復旧方針、最終admissionの受入と明示公開承認が必要。Shared Write OFF / PortDataHost.canWrite=falseを維持する。
