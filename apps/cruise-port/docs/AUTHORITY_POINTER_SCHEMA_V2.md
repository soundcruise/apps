# IndexedDB Authority Active Pointer & Schema v2 — L3b-1 Safety Fix Completion

## L3b-2 IndexedDB Authority Control（2026-10-13・現行）

Port **1.22.15** / Studio **0.26.9** / Studio schema1 / Authority physical schema2・9 stores。
開始HEAD/origin/main/remote main=`378866071929f761e4c9ad66ce21addfe0fbb7fd`、tracked/staged空、ahead/behind0/0。
[正式Control契約](AUTHORITY_CONTROL.md)をPointer/Action Policy/Repository契約と合わせて参照する。

6API: suspendWrites/revokeFence/invalidateIdentity/markRecoveryRequired/resumeWrites/renewFence。
停止側は厳密なidentity/generation bindingと冪等factを持ち、不要なexpectedEpochで拒否しない。
resume/renewは専用purpose・active Pointer・control/pointer CAS・current integrity・fresh branded evidenceが必須。
identity/recoveryラッチは通常resume/renew/publishで解除しない。healthy recoveryはread/export可能、dataset commit不可。

Control identity予約はdataset/publicationと同じgeneration＋operationId領域。拒否後の予約も保持し、異内容retag不可。
Control変更と成功factは8-storeの同一RW transactionで原子的。headを不要に変更せず、complete後だけ成功を返す。
replay/lookupは過去事実（historical=true/publish=false/operationAuthorized=false）で、現在の失効状態を解除しない。
capability/証拠はscope/generation/purpose/runtime leaseへ束縛し、dispose/versionchange/reopen後に旧objectを継承しない。

証拠は隔離test provider限定、製品provider未接続ならfail-closed。Account IDだけでなく両generation/membershipも照合する。
Worker D1 transaction fenceは最終cloud admission。既存Pro/Account/Sync guardを変更しない。
競合はrequest gateで両transactionの待機と実開始順を証明し、Date.now同値をPASS根拠にしない。

Production **legacy / Worker ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false**。
Port/Studio通常bootへControl issuer/Authority DB/mutation/Pointer公開を接続しない。本番deploy/D1/cutoverなし。
L3c/L3d/L4/L5/B1-6製品入口は未着手。shared write解禁不可。
最終回帰: Control追加Node71 / Authority369 / Port/shared2175 / Worker760 / Other186 / workerd8 / Studio dirty314、全PASS。
正式Control48競合（16順序×3）、Pointer Safety15＋7、Pointer A–F＋7、CAS54＋7、参照63＋障害4＋7、native policy9＋7、L2a14、全PASS。
Playwright1.62.1 Port6suite・Studio5suite（97＋Host10）、CDP製品隔離13、全PASS。application error/404/unexpected mutation0。
commit後Studio315（clean guard込み）を除外なしで実行する。PID・oracle・fixture変更理由は正式Control契約の最終検証記録を参照。
以下は各工程時点の履歴。L3b-2の最新API/Control状態は本節と正式Control契約に従う。


2026-10-13。Port **1.22.14** / Studio **0.26.8** / Studio schemaVersion **1** / Authority DB physical schema **2**。
開始HEAD/origin/main/remote mainは`58b21a4263b3d689afde712e59f86d5c8068b174`で一致。本書がL2a/L3aの「physical version1・7 stores」
「予約はjournal store」「active controlのgenerationは書込み可」を置き換える正式契約。
Production Authority **legacy** / Worker **ACCEPT_COMPAT** / enforcement **OFF** / Studio shared write **OFF** /
PortDataHost.canWrite=**false**。product boot接続、Worker/D1 deploy、D1 migration、cutoverは行わない。

## Phase A 事前確認

1. 開発用origin/partition: 利用者Chromeの開発origin`127.0.0.1:4173`のIndexedDB levelDBをread-onlyで照合し、
   `sound-cruise-port-authority`名のDBは存在しなかった（削除・初期化・open無し）。本番origin/利用者データには触れない。
   検証はすべてloopback serverと使い捨てprofileの隔離Chromeで行う。
2. capability発行: `port-authority-capabilities.mjs`へ独立配置。importするのはAuthority Storeだけで、
   発行者取得`claimPortAuthorityIssuer(scope)`は`createTestAuthorityScope`等の明示isolated scopeに限る。
   Port standard/Pro・Studioのboot graphから推移的にimportされないことをNodeで固定する。
3. 予約移行: v1→v2のversionchange transaction内でjournalの`kind=operation-identity`行を全件検証・複写・読戻し後に
   削除する。1件でも不整合ならupgrade全体をabortし、v1のまま保持する（一部だけ消えた状態は作らない）。

## Schema v2 / upgrade

DB名major1`sound-cruise-port-authority-v1`を維持し、physical version **1→2**。追加storeは2つだけ。

| Store | keyPath | 内容 |
|---|---|---|
| pointer | `key`（`active` / `namespace`） | 唯一のactive pointerと同transactionのnamespace marker |
| reservations | `[generation, operationId]` | operation identity / publication予約 |

既存7 store（records/manifests/head/control/journal/oplog/roots）はkeyPath・内容とも不変更で再作成しない。
upgradeはwhitelist方式: oldVersion0は9 store新規作成、oldVersion1は既存inventoryを厳密照合してadditive追加、
それ以外は`schema-upgrade-unsupported`でabort。future versionは上書きせず`future-schema`。
`onversionchange`で既存接続は閉じ新規operationを停止。blockedは`open-blocked`で、DB削除による回避はしない。

### Reservations移行

L3aがjournalへ置いた`operation-<sha256(generation,operationId)>`行を、generation/operationId/fingerprint付きで
reservationsへ`origin=v1-journal`として複写する。oplogに同operationの確定事実がある場合はfingerprint一致を要求。
複写後に読戻し一致を確認し、全件成功してからjournal行を削除する。reserved prefixを持つ非予約journal行は
`journal-reserved-key`でabort。v2以降のjournal writeは`operation-`prefixのmigrationIdを拒否し、L4 migration journalと
operation予約の名前空間を完全分離する。v2予約は`origin=v2`でaction/policy/targetKeys(sorted)/fingerprintを保持し、
同一operationIdの異payload・異action/policy/targetは`operation-id-payload-conflict`。v1由来行はfingerprint一致で継承する。

## Active Pointer

fields: key/schemaVersion/partitionId/pointerEpoch/activeGeneration/namespaceVersion/repositoryProtocol/writerProtocol/
migrationId/publication{kind,manifestId,headSeq,sealHash,controlEpoch}/previousGeneration/operationId。
pointerがPort-owned Authorityの正本。localStorage sentinelは補助hint、legacy keyは正本ではない。
読取り時に厳密検証し、破損・partition不一致は`pointer-invalid`→recovery-required。pointerが指すgenerationの
head/control欠落は`pointer-generation-missing`、control非active/epoch逆行は`pointer-control-mismatch`、
published manifestのseq/digestとheadSeq/sealHash不一致は`pointer-head-mismatch`。いずれもlegacyへsilent fallbackしない。
pointer不在を未公開と扱うのはnamespace epoch0かつpublication履歴なしの場合だけ。公開済みmarkerまたはreservations/journalに公開事実が残れば`pointer-missing`→recovery-required。未公開はread-only（書込みは`generation-not-active`）。
`publication.kind`は`migration`/`isolated-fixture`。fixture pointerはprivileged test provider付きscopeでだけ信頼し、
それ以外では`fixture-pointer-untrusted`でrecovery-required。`migration`発行はL4 evidence未接続のため現時点で不可。

## State machine

control.state: `staging → prepared → sealed → active → superseded`、異常は`recovery-required`。
prepared/sealedはread-only表示（hydrate `activity=inactive` / `readOnly=true`）。writableはpointerが当該generationを指し、
control.state=active、suspend/revoke/invalidated/recoveryRequired無しの場合だけ。

## Seal / publication gate / atomic publish

`seal({generation,migrationId,capability})`: migration-publication capability、journal identity一致、control/journal=prepared。
control→sealed(epoch+1)、journal→ready-to-publish（sealHash=head manifest digest、sealManifestId、sealHeadSeq）。
再実行は`already-sealed`、公開後は`already-published`。
`publish({...,expectedPointerEpoch,expectedControlEpoch})`は pointer/head/control/manifests/records/oplog/journal/
reservations を1つのreadwrite transactionで扱う。すべての成功経路でまず現在のactive integrityを検証する。
同generation＋同migrationIdのretryは元operationId・元request/precondition・元evidenceのfingerprint一致に限り`already-active`（epoch不変）。
新operationIdなら`publication-operation-conflict`、別migrationIdなら`publication-conflict`。それ以外はpointerEpoch CAS（`pointer-stale`）、
publication予約の再利用拒否（`publication-superseded`/`operation-id-payload-conflict`）、sealed・epoch・無効化flag・
journal ready-to-publish・seal一致・evidence attestation（`publication-evidence-unavailable`/`-invalid`）・
bound Accountのfence identity一致（`cloud-fence-required`）を検証する。成功時に同transactionで
旧control→superseded、新control→active、pointer(epoch+1)＋namespace、journal→active(publishedPointerEpoch＋publication fact)、publication予約＋factを書く。
線形化点はtransaction `complete`。途中失敗・crashはIDB abortで全storeが旧状態のまま（partial publicationなし）。

## Supersession / old handle / repository guard

通常commitはpointer・control・headを同じcommit transactionで再読込みし、pointerが当該generationを指さなければ
`generation-not-active`、hydrate時pointerEpochと現在値が異なれば`pointer-stale`。切替前に準備したhandle・旧base・
別tabの旧snapshotは切替後に必ず拒否され、切替前にcompleteしたsaveは確定事実として保持される。
Repository backendの`sharedWriteCapable`は`snapshot.active===true`を必須にする。
oplog replayは過去commit事実の照会だけで、現在のpublish/write認可には使わない（superseded generationでも事実のみ返す）。

## Capability

`port-authority-capabilities.mjs`。capabilityはfrozen objectで非公開WeakMapにscope/purpose/generationを登録する。
boolean・string・clone・spread・別scope・別generation・別purposeは`capability-invalid`。issuerはscopeごとに1回だけ取得可。
用途: migration-publication / authority-control / system-ack / pro-provider / recovery。L3b-1で発行可能なのは
migration-publicationのみで、他用途は`capability-purpose-unavailable`。fixture evidence attestationも同様に
scope/generation/migrationId/sealHashへ束縛されたbrand objectで、L4の正式binary/sync evidenceとは別物。

## Crash / recovery

publish transaction途中のrenderer crash（Page.crash、別renderer）は旧pointer/旧controlのまま（aborted）または
完全公開のどちらかで、retryは元migrationId/operationId/precondition/evidenceを保持して1回だけpublished/already-activeになる。公開後のreopenは同じpointerを読み、
pointer破損・欠損・generation欠落はrecovery-required/read-onlyで自動修復・自動削除・legacy復帰をしない。

## Production isolation

通常Port UI（standard/Pro）・Studio read-only Hostはcapability取得、Authority DB open/create、pointer publish、
control mutationを行えない。Store/capability/IDB backendはboot graphに無く、isolated scope以外は`isolated-scope-required`。
隔離CDP回帰でPort desktop/mobile・Pro gate・Studio起動後もAuthority DB/pointerが作成されないことを確認した。

## Safety Fix: provenance / current integrity / operation identity

`readPointer`はPointerの全fields（migrationId/operationId/previousGeneration/pointerEpochを含む）を
reservationsの`publication={schemaVersion:1,pointer,identity,request,evidence}`と完全一致で照合する。
formal publishはjournalのidentity/state/seal/公開epoch/factとも照合し、同IDのdataset oplogがあれば拒否。
isolated initializerは`fixture-initialize` operation予約・oplogと結び付けた初期公開factを同じtransactionで保存する。
これは初期fixture専用であり、そのIDを後のformal publicationへ流用できない。
保存evidenceはbinary/sync/fence等の安全なsnapshotだけで、capability/attestation tokenを永続化しない。

`namespace={key:'namespace',schemaVersion:1,partitionId,pointerEpoch,namespaceVersion:1,repositoryProtocol:1,writerProtocol:2}`。
新規作成/v1 upgrade時にepoch0を追加し、publish/fixture initialization時にpointerと一緒に更新する。
markerの未来schema・protocol/partition/shape不一致は上書きせず拒否。marker削除・pointer欠損を自動修復しない。
epoch0へ戻されてもreservations/journalの公開事実が残っていれば未公開とは扱わない。
旧v2 preparedはnamespaceなしでもcandidate表示だけ可（inactive/read-only）、publishは証拠不足で拒否。
旧v2 activeのprovenanceを自動生成して正当化しない。全証拠の同時消去を検出する外部tamper-proof保証ではない。

current active integrityはhead/control存在、generation/identity/epoch整合、full manifest/digest、
全record/checksum/参照、headが指すoplogのseq/manifest/revisionを検証する。
publish（already-activeを含む）と新generation公開は同じ8-store readwrite transaction内でこの検証を先行する。
成功結果の`currentAuthorityVerified=true`は構造上の健全性だけで、正式Pro/Accountやwrite認可を表さない（`publish=false`）。

oplogとreservationsはgeneration＋operationIdの共通衝突領域。初期dataset operationにも予約を作り、
dataset→publication、publication→dataset、未commit Pro予約→publicationの流用を拒否する。
正常retryは同一ID＋固定request/evidence fingerprintのみ。superseded公開のretryは`publication-superseded`。

`lookupPublication(generation,operationId)`はimmutable公開manifest/records/参照・独立factを検証する過去照会。
現在headが破損しても過去公開が健全なら返せるが、`historical=true/publish=false/currentAuthorityVerified=false`。
dataset operationのIDならresult=null。過去lookup/replay成功を現在hydrate/publish/write readinessへ流用しない。

## Acceptance

最終回帰結果は下記Completion検証記録に記す。旧L3b-1時点の2065件とCDP代替結果ではなく、
正規Playwright 1.62.1とnative Chromeを使用する。package/lockfileは変更せず8765の利用者serverも維持する。

## L3b-1完了範囲と残件

完了: schema v2、予約移行、pointer、sealed/supersededを含むstate machine、atomic publish/supersession、
commit guard、capability基盤、production isolation、Pointer provenance/current active integrity/operationId collisionのSafety Fix。
残件: L3b-2正式Control操作（suspend/resume/fence/recovery capability開放）、L3c正式Pro Device Session provider、
L3d Account協調、L4 migration evidence（binary/sync/cloud fence）と`migration` publication・GC・reservation retention、
L5実機stress、B1-6製品入口。shared write解禁・product boot接続・cutoverはいずれも未実施。

## Completion検証記録（2026-10-13）

開始時は58b21a4263b3d689afde712e59f86d5c8068b174、staged空、ahead/behind=0/0。
変更前に4危険シナリオを再現済み。保持した安全修正のNode追加39件、関連Authority Node合計298件がPASS。
全Node requiredはWorker/Account760、Port/shared2104（baseline2065＋39）、Other186、workerd/D1/R2 8、全PASS。
Studioはdirty状態でclean guardを含まない314件PASS。commit後にclean guard込み315件を除外なしで実行し、
PASS後だけ通常pushする（commit後の実測結果とcommit hashは完了報告に記録）。

Chrome155.0.8059.40/native IndexedDB（別renderer・notification dropped・Web Locksなし）:

| Suite | 結果 | 対象renderer PID |
|---|---|---|
| Pointer Safety | 15項目＋追加7、PASS。旧save先/公開先/同一公開の3順序×3回すべてnative RW待機を証明 | 28632 / 28634 |
| Pointer A–F | A/B/C各3round＋D/E/F、追加7、PASS | 28654 / 28656 |
| CAS | 54round＋追加7、PASS | 28928 / 28938 |
| Referential | 63round＋障害4＋追加7、PASS | 28864 / 28866 |
| Action Policy | 9項目＋追加7、PASS | 28905 / 28911 |
| L2a | native14項目、PASS | 2独立context |

新Safety試験は既存transactionでpointer readを保持し、両rendererのRW transaction提出と
barrier解放前のrequest未開始、解放後の開始/complete/abort/resultを記録する。
待機が成立しないroundはinconclusiveでFAIL。今回違反0・判定不能0・unexercised0、oplog重複/partial manifest0。

正規Playwright **1.62.1**（既存runtime、package install/lockfile編集なし、使い捨てChrome、隔離8766）:

| Port required suite | 結果 |
|---|---|
| runtime-regression | 18 routes PASS |
| readiness-core | 26項目 PASS |
| runtime-safety | 10項目 PASS |
| authority-migration | 18項目 PASS |
| standard-readiness | subset＋全6suite最終runでPASS。4幅・認証4mode・保存/データ保持assertionを維持 |
| operation-authorization | 10項目 PASS |

Studio5suite: Keyboard21 / Editing Session23 / M1 29 / M2 24（計97）、Host10、全PASS。
CDP製品隔離13項目もPASS（Port1280/393・Studio1440/393）、通常起動によるAuthority DB未作成・canWrite=falseを確認。
application console/unhandled error0、application404 0、unexpected network mutation0。
standard-readinessの意図した401とoffline abortによるresource error各1は期待した障害として別記録し、
予期しないconsole errorを除外しない。すべて外部requestをinterceptし、本番Workerへのrequest0。

### standard-readiness fixture原因と修正

正式app-version.js/Standard・Pro HTML/cache keyは1.22.14で一致、既存version/cache Node11件PASS。
fixtureだけが4箇所でVer1.18.0を待っていた。正式CRUISE_PORT_APP_VERSIONから期待値を導出し、
visible待機に加えて実textContent完全一致をassertする。locked gate中の空version assertionも維持する。

さらにfixtureの古い認証応答にはDevice Session v3/challenge/renewがなく、実Pro gateが正当に解除を拒否していた。
実requestのpublic keyへ束縛したsessionを返し、実鍵生成・署名・AES-GCM保存を通す。
各negative/offline modeの前に正式mockで検証済みreceiptを作り、revalidateAfter=nowでnetwork検証が実行されたこともassert。
invalid/generationは拒否、offlineは直前に検証した有効receiptだけを許可する。製品gateの変更・bypassは行わない。

bootstrap前の代表データは明示localStorage fixtureへ既存storeのschema validatorを通して保存し、成功をassertする。
暗黙repositoryを呼びPromiseを同期結果と誤認していたfixtureを修正したもので、製品保存は実UI経由で検証する。
認証resetは次のmain-frame navigation開始を待ってからnetworkidleとgateを確認し、旧documentとのraceを解消する。
version/assertion削除・偽表示・skip/only・timeout延長・catch PASSはなく、無関係suiteの動作は変更しない。

L3b-1 Safety Fixの実装・検証範囲は完了。L3b-2正式Control、L3c正式Pro provider、L3d Account協調、
L4 migration evidence、B1-6製品入口、shared write解禁は未実施で、このfixture PASSを解禁根拠にしない。
