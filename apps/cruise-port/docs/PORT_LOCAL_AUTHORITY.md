# B1-2 + B1-3 Authority Preparation

## L2a IndexedDB Authority Store v1（2026-10-12・現行）

Port1.22.9 / Studio0.26.3。[独立Store契約](INDEXEDDB_AUTHORITY_STORE.md)を参照。
新正本の独立Storeをrecords/manifests/head/control/journal/oplog/rootsの7 store、physical version1で実装。
IDB transaction completeが成立点で、control/key CAS/guard/intent/records/manifest/head/oplogを1 transactionに含める。
fixtureでのみopen/initialize/updateControlを実行。既存Local Authority Providerや製品mutatorへは接続しない。
正式Pro/Account/migration/Sync/pointer/sentinel/GCは未接続。legacy本番のcross-tabリスクはL1記録のまま。
L2b正式Repository acceptance→L3→L4→L5の完了までB1-6再開不可、shared write OFF/canWrite=false。
以下は過去工程の記録。L1のcross-tab保証訂正を引き続き優先する。

## L1 cross-tab訂正（2026-10-12・現行）

[Cross-tab Authority Contract](CROSS_TAB_AUTHORITY_CONTRACT.md)を正式契約とする。製品コードは不変更。
本文書の「同lock参加のAuthority mutatorはcross-tab線形化される」「revoke Promise完了がcross-context失効確定」は**撤回**する。
Web LocksはlocalStorageの可視性を同期せず、localStorage上のcontrol/journal/pointer/datasetは別tabから古いcacheで読まれ得る。
実Repositoryでlost update・delete intent消失を実測し、control系は違反未観測だが構造上の保証はない。
下記の単一realm内のfinal guard・WAL・epoch設計は有効。新Authorityの正本はL2以降IndexedDBの単一transactionへ移す。

## Operation認可とAuthorityの合成（2026-10-12）

Port1.22.8 / Studio0.26.2。[共通認可契約](OPERATION_COMMIT_GUARD.md)を参照。
既存Authority final guard/control epoch/fence/Account bindingを保持し、同dataset lockへoperation guardを追加した。
Pro device資格はAccountに従属しない。Account切替はAuthority ownership条件として拒否し、Proを無条件に失効させない。
guard前のasync検証を最終認可と扱わず、WAL前・final metadata前に同期条件を確認する。
metadata成功後は旧contextのcommit事実を保持し、cloud publish=false。新Account/資格へretagしない。
同lock参加のAuthority mutatorと異なりshared Pro/localStorageの完全cross-tab線形化は保証しない。
本番legacy/ACCEPT_COMPAT/enforcement OFF、B1-6未完了。以下は元のAuthority修正履歴を保持する。

## Local Authority Final Commit Race修正（2026-10-12・現行）

Port **1.22.7**（内部安全修正のpatchとPort module graph/cache同期）、Studio **0.26.1 / schema1**。
修正はRepository、dormant Migration Engineと新`port-authority-write-control.mjs`に限定する。
既存の最終await競合は対照3 PASS / 再現3 FAIL → **6 PASS**。元テストを変更せず保持する。

### 線形化と共有control

active Authorityだけ、private draft作成・callerの非同期readiness/Account/fence検証・journal hash検証を
commit lock外で行い、最後に既存`authorityLockName(generation)`のexclusive lockを取得する。
そのcallbackにはawaitを置かない。全inventory/schema検証済みdraftはlock待機前にfreezeする。
同callbackでproviderの同期commit guard、完全Repository revision CAS、WAL、変更key、final metadataを扱う。
**saveの線形化点はpendingなしのfinal metadataのsetItem成功**。multi-key StorageをDB transactionと扱わず、
既存WAL/rollback/recoveryを維持する。commit後のsubscriber失敗・Account変更で成功事実を取り消さない。

新control keyは`<generation marker key>.writeControl`。protocol1 / migrationId / Authority generation /
monotonic epoch / 固定identity / fence evidence / suspended / fenceRevoked / identityInvalidatedを保持する。
秘密資格や万能registryは持たない。保存開始のcaptureでcontrol snapshotを固定し、最後に完全一致を要求する。
停止→再開やAccount A→B→Aでもepochを戻さず、古い保存contextを復活させない。
control欠落・未知protocol・不正値はrecovery-required。旧active namespaceへ自動補完しない。

`suspendWrites` / `resumeWrites`は既存partition migration lock→Authority dataset lockの順で更新する。
停止の線形化点はdataset lock内のcontrol publication、完了応答時にはjournal.writeDisabledも永続化済み。
非同期save準備はこのlockを保持しないため、停止が検証待ちsaveの終了を待つことはない。
pre-publicationの停止はjournalを閉じ、active control/pointerを作らない。
resumeは明示操作だけ。active pointer/current identity/fence有効時のみ、epochを増やす。
Account/fence失効をresumeで再認可せず、authorized recoveryへ残す。

`revokeIsolatedFence`は当該realmのticketを即時無効化し、同dataset lockでshared epoch/失効を永続化する。
返すPromiseの完了が**cross-contextの失効確定**。別realmのWeakMapやstorageイベントを共有と仮定しない。
`changeIsolatedIdentity`はpartition migration→datasetの順で、旧Authorityを永続失効させてから
同期owner sourceを更新する。callbackを非同期にするsourceは非対応でfail-closed。
Repositoryは上位migration/activation/Sync lockを取得せず、**activation→Sync execution→dataset**の逆順を追加しない。

### 最終commit条件とAccount source

writeDisabled/suspended=false、active journal（hash検証済みrawと最終一致）、sealed marker、
active pointer/namespace、Authority generation、control epoch、protocol、fence ticket/evidence/epoch、
固定Account/membership IDとそれぞれのgeneration、Repository revision、no pending/recovery/future schemaを検査する。
Account検証はasync結果だけでなく、**同期readIdentity snapshot**を同commit callbackで照合する。
bound-accountはAccount/membership generation不明ならread-only。fixtureのgeneration=1は隔離seedであり、
製品sourceの推測値ではない。unbound-localはAccount/membershipを要求しない。

同期source変更を同realmで観測できても、別contextの所有変更は協調APIによるshared control更新が必要。
Web LocksだけでAccount切替・server revokeを自動検知しない。remote fresh evidence→local invalidationの
製品bridgeはB1-6残工程。static isolated ticketを本番認可と扱わない。

### 失敗・応答喪失・公開境界

拒否は既存authority-write-disabled / cloud-fence-required / migration-account-changed / recovery-required等、
ABA/epoch違いはauthority-context-stale。network retryと混同せず、draft/元data/journalを保持する。
Repository callerが渡すoperationIdは成功/Authority拒否/write failure応答へ保持し、勝手に発行・retagしない。
RepositoryはCAS APIであり、同operationIdだけで新baseを採用するdedupe APIではない。
response loss時も元base/contextで再送し、stale/失効を拒否する。新しいbaseで旧操作を自動rebaseしない。
過去の保存内容/revisionは旧namespaceから確認でき、現在の認可とは別物。

active Authorityの成功結果/通知は固定authorityContext（identity / generation / controlEpoch / fenceEpoch）と
publish=falseを持つ。commit factで新AccountのSync queueへ送らない。cloud publishは依然未接続。
future ownerはoutbox生成・送信前にも正式generation/Pro/AppDevice/epochを再検証する。
legacy Repositoryの保存順は維持し、Authority専用opt-inのasync準備だけをlock外へ移す。

追加Node **51 PASS**、native Chrome **12ケースPASS**（二tab競合6・reload5・lock grant順1）。
通常旧buildのlegacy namespaceと新Authorityは分離。新Authorityへの協調writerが今回の保護対象で、
非協調コードの新namespace直接書込や本番旧writer排除全体を解消済みとは扱わない。
production **legacy / ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false**。
Worker deploy / D1適用 / 本番cutoverなし。**B1-6未完了 / B1未解消**。以下は履歴。

## Asset cleanup競合修正（2026-10-12・現行）

Port1.22.6 / Studio0.26.1。詳細は[Asset Lifecycle契約](../../../workers/sound-cruise-sync/ASSET_LIFECYCLE.md)。
Workerの参照追加と削除予約をD1 transactionで相互排他にし、固定claim/object identityでR2失敗から回復する。
Portの隔離migration candidateはmetadata.cleanupをmanifest/source hashへ保持する。
cleanup-claimed / deleting / recovery-required / deletedは救出証拠として残し、stage / sealを拒否する。
証拠欠落をcloud参照資格と扱わず、本番fresh evidence接続はB1-6の残工程。
本番Worker deploy / D1適用 / cutoverなし、legacy / ACCEPT_COMPAT / enforcement OFF、Studio canWrite=false。
以下の版番号・検証件数は前工程の履歴。

## B1-5 transaction fenceとの境界（2026-10-12・現行）

Port1.22.5 / Studio0.26.1 / Studio schema1。[Workerの正式契約](../../../workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md)を参照。
D1同一batchのabort guard、Account+Portのprepared→paused→enforced、固定migrationId/operationIdとepoch一回更新、
paused snapshot checkpoint、asset prepare epochと公開時再照合、cleanup retention/claim、rollback downgrade拒否を実装。
AppDevice/Proの資格・失効・verifierをtransaction内でも確認し、CAS/tombstone/change log/aggregateの原子性を維持する。
HTTP入口だけの判定ではない。metadataのenforced表示だけを実効fenceの証明と扱わない。

B1-4の接続は隔離fixtureだけ。実ledger/evidenceと完全cloud snapshotのhash/sequenceを照合し、
同epoch/generation/checkpointのbranded ticketでready-to-publishまで検証する。本番engine/active pointerは接続しない。
checkpointはcutover時点で固定。cloudが進んだ場合は明示reconciliationを要し、旧outboxやasset operationをretagしない。
Port asset clientはauthority拒否を同runtimeに保持し、自動再試行・release/discard再送を停止する（1.22.5 patch）。

本番Worker ACCEPT_COMPAT / authority legacy / enforcement OFF、Studio shared write OFF / PortDataHost.canWrite=false。
Worker deploy・本番D1適用・Port migration/cutover・本番epoch/minimum変更なし。B1は未解消、shared write解禁不可。
次はB1-6 Port/Studio Authority Integration。operator認可・cleanup crash claim回収・local legacy writer停止・
reconciliation UX・実partition/rollback/deployのacceptance gateを別途満たす。rollback先はfence対応版限定。
以下のB1-1〜4記述と検証件数は各工程時点の履歴。

## B1-4 Migration & Cutover Engine v1（2026-10-12・履歴）

Port1.22.4 / Studio0.26.1。詳細は[Migration契約](PORT_AUTHORITY_MIGRATION.md)。
provenance付きcandidate/raw救出、schema1 journal、再開可能stage、コピー先binary実読戻し、pure cloud planner、旧outbox証拠保持、
旧→新delete generation、隔離seal/pointer/active Repository/recovery/rescueを追加。通常起動経路は未接続。
production default legacy、Worker ACCEPT_COMPAT/enforcement OFF、Studio canWrite=false、B1未解消。
次はB1-5の実効server transaction fenceとcutover barrier。以下のB1-2/B1-3記載・件数は前工程の履歴。

2026-10-12 / Port 1.22.3 / Studio 0.26.1 / Studio schemaVersion 1。
B1-2 client protocol対応とB1-3 Port-owned staging基盤。**B1未解消、production default legacy、enforcement OFF、Studio shared write OFF / canWrite=false**。
Worker deploy / production D1 migration / 実ユーザーdata migration / cutover / active pointer公開は行わない。

## Client protocol / authority context

正本は`apps/shared/sync-account/writer-authority.mjs`。authority writerProtocol=2、syncProtocol=1。
既存Repository/local writer protocol1、商品appVersion、namespace version、domain schemaとは別。Feature Metadataへ追加しない。
通常Port ownerとStudio read-only Hostはlegacy wireを維持。protocol-capableはauthority-activeを意味しない。

明示API `createWriterAuthorityClient` / Port wrapper `createPortWriterAuthorityClient` → runtime.prepareWriterAuthority。
対応Workerの認証済みGET `/v1/sync/writer-authority?appId=port`からAccount/appごとのwriteEpochを取得する。
新read routeがB1-2に必要な最小Worker変更。既存Pro / AppDevice / membership / Origin / rate limit / rollout read gateを通す。
D1は既存0034 metadataを読むだけ。minimum/epoch/stateをserver fenceとしてenforceしない。ACCEPT_COMPAT定数は不変更。
通常起動・status/badge・focus・read-only HostはこのAPIを呼ばない。URL/storage/debug flagによるadoptionなし。

server Account/app/epoch/state/minimumの構造を検証し、generation fenceを各awaitの前後で維持する。
legacy local modeではwriter/sync protocolを明示対応環境で送れてもexpectedWriteEpochを省略する。
prepared・Port-owned・Account一致のlocal authorityの場合だけ、serverで観測したepochを固定する。
unknown epochを1に推測しない。serviceはprotocol-capable / authority-preparedを返すがactiveを生成しない。
wire contextにはAccount ID / appId / authority state / local generationだけ。資格secretは含めない。
prepared wireとSync store authorityGenerationが違えば拒否する。binary headersも同じcontextを検査する。

## Outbox / retry / blocked state

operation生成時にwriterAuthority（writerProtocol / syncProtocol / expectedWriteEpoch）とauthorityContextを固定。
response-loss retryは同じoperationId/hash/base/context。refreshで最新epochへ書き換えない。
legacy operationへfieldを後付けしない。新operationをlegacy wireへdowngradeもしない。
現在contextと異なるoutboxはlegacy_outbox_needs_migration / blocked-authorityとして残す。
自動copy/adoption/rebaseはB1-4まで禁止。asset pending operationにも同じ固定contextを適用する。

writer_protocol_required / outdated / unsupportedはneeds-upgrade、dataset_epoch_staleはstale-epoch、
dataset_authority_unavailable等はblocked-authority。通常network retry/backoffとは分離し、nextRetryAt=0。
拒否されたoutbox / payload / draft / credentialを削除しない。queueDiff、own-echo、通常conflict cleanupで自動破棄しない。
authority failure後の通常Sync applyを止める。明示authority準備が成功しても、旧blocked operationを再tag/再送しない。
cloud snapshot reconciliationと明示復帰の製品UXはB1-4以降。50 operations / 256KiB全body / dedupe等の既存境界は維持。

## Port-owned Local Authority

`port-local-authority.mjs`のproviderが論理keyを物理keyへmappingする。feature storeのkey/public APIは維持。
production factoryはlegacy Storageと既存dataset lockを使う。新領域は明示generation指定時だけ。
RepositoryへauthorityProviderを注入すると同じCAS / forward / unknown preservation / delete intent / WAL契約を使える。
feature store接続時は同じcache URLの`registerPortRepository(provider.storage, repository)`で登録する。

| 領域 | 新物理identity |
|---|---|
| dataset / delete intent | `soundCruise.portAuthority.v1.<generation>.data.<encoded logical key>` |
| Repository metadata / WAL | 同mapping内の`cruisePort.datasetRepository.v1` |
| marker | `soundCruise.portAuthority.v1.<generation>.marker` |
| Repository lock | `sound-cruise:port:authority:v1:<generation>` |
| Sync DB | `sound-cruise-port-authority-sync-v1-account-<Account>-generation-<generation>` |
| binary DB | `sound-cruise-port-authority-binary-v1-<generation>` / binary store |

namespaceVersion=1とgenerationはappVersion/Repository revision/server writeEpochとは別。
新Sync DBはlegacy prefix自体と分離し、旧Account文字列を新namespaceとして解釈しない。
Port wrapper `createPortAuthoritySyncStore`がproviderのbound Accountを検査してからDB adapterを生成する。
同Accountの別authority / 別Accountの同generationは別DB。legacy DBは残し、outbox/shadow/conflict/credentialを自動copyしない。
store constructorではDBを開かない。明示operationでopenし、終了時close。disposeはtransaction/later I/Oをfenceする。
Sync Execution LockのAccount/app identityは維持し、dataset lockは新generationへ分離。逆順network待機を追加しない。

## Staging / marker / publication

createPreparedPortAuthorityはfull Port datasetの全key inventoryを要求する。不在値も明示null。
Metronomeだけの部分移行は禁止。domain loaderはprivate projectionで検証し、raw legacy migrationを保存しない。
既存forward / collection / singleton / delete journal / local binary reference/hashを検査。未知fieldのrawは維持する。
future schemaや検証不能なasset metadataをcurrentへnormalizeして保存しない。

1. immutable candidateをcopy・validate。
2. generation専用lock内でstaging markerを記録。
3. 全dataset keyと必要binaryを新領域だけへ書く。
4. raw一致とbinary read-back/hashを再検証。
5. 最後にprepared markerを保存。

markerはowner=port、namespace/generation、ownership/account binding、migrationState=candidate-staged、
Repository/authority writer protocols、初期candidate hashes / asset inventory / refsを保持する。
初期hashはstaging証拠で、以後のRepository CAS revisionや継続的な署名ではない。
破損・未知version・不正binding・不足inventory・未完stagingはauthority-recovery-required。defaultでactiveに戻さない。
multi-key localStorageをDB transactionとは扱わない。中断したstageは読取り不可、legacyは不変更、active pointerなし。

preparedの隔離writeはRepository経由。active markerは将来のreader識別用としてread-only fixtureだけで確認。
B1-3にactivate APIはなく、`soundCruise.portAuthority.v1.active`へ書かない。production selectionは常にlegacy。
B1-4でmigration完了state・pointer publication・crash recoveryとcloud reconcileを別途設計する。
legacyへ常時dual-writeせず、新公開後の自動再import経路も作らない。

## Binary scope / legacy deletion

inventory: Gear `cruisePortGear/photos`、My Apps `cruisePortMyApps/icons`、Practice `cruisePortPractice/attachments`。
structured datasetのsyncAssetMetadata（published/binding/pending/release/discard含む）も新namespaceへ分離する。
cloud asset IDs/R2 referencesはraw candidateとして保持するが、cloud authority移行・R2 object copy/deleteは行わない。
新local binaryはgeneration専用DB、kind+idで識別し、SHA-256を確認する。元recordの未知field/filename/owner metadataも保持し、metadata hashをinventoryへ含める。旧DB削除/個別削除は新DBへ届かない。
readLegacyPortAssetInventoryは明示read-onlyで全3storeを読む。absent DBはupgradeをabortし、作成しない。
実ユーザーbinaryのbulk copyなし。preparedのbinary作成は隔離fixture/明示stagingだけ。
missing binary / digest mismatch / unknown asset versionは拒否。disposeで新storeのtransactionと後続I/Oを止める。

## Account / partition

marker ownershipはunbound-localまたはbound-account。Account bindingはgeneration作成時に固定。
Account切替だけでAのlocal dataをBへ帰属変更しない。unbound/A-boundからBのSync store準備は拒否。
transfer/reviewを自動完了するAPIなし。新AccountでのreconciliationはB1-4。
namespaceはbrowser storage partition内だけ。Safari/PWA別partitionは別local authorityとして扱う。
Chrome隔離fixtureで実証。実Safari/PWAのcutover/partition移送は未検証。

## Migration candidate（read-only）

captureLegacyCandidateは全dataset key / delete intent / Repository metadata・WAL状態 / binary inventory+hash /
注入されたread-only Sync pending/shadow/conflict inventory / source hashを返す。
Account/AppDevice credentialをcandidateへ含めない。Sync inventoryはcallerがread-onlyで取得し、未検査ならreviewRequired=true。
前後raw/metadata比較と最終hash後再比較で、観測したlegacy変更はreview-requiredにする。validation失敗/WALもreview-required。
unknown fieldを保持し、legacyへのset/remove、migration save、outbox copyを行わない。

結果は常にcandidate-onlyで、安定した読み取りをmigration/cutoverの確定証拠と扱わない。
未協調legacy writerのABAや、dataset/Sync/binaryをまたぐ完全な同時snapshotは証明できない。
B1-4では全writer停止/authority boundary、cloud reconciliation、最後の差分再検査が必須。

## Validation / remaining gates

Storage Node30件、protocol純粋契約29件＋Runtime/asset保持regressionを追加。
Port/shared1498、Worker/Account623、Other apps85。Studioは機能314、Git clean1件をcommit後に含め全315を確認する。
Chrome: Port18 routes（desktop/mobile）＋保存20＋既存安全性10、Studio97＋Host10、Authority26チェック、wire fixture PASS。
wireは実Worker handler / SQLite / memory R2でepoch read / bootstrap / complete / push retry / legacy / assetを確認。
console/page error/application404なし。通常起動のnew namespace/new authority DB作成0、Host cached DB/network/ensure/owner等0。

B1-2/B1-3準備完了をB1解消としない。B1-4でfull candidate/cloud/旧outbox/binary reconcile、
ownership review、controlled pointer publicationとrollbackを設計・独立監査し、B1-5でserver transaction fenceを実装する。
その後B1-6でStudio action gateを再判定。renderer parity / preset CRUD UIは別Phase、今回は混在させない。
