# B1-2 + B1-3 Authority Preparation

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
