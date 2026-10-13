# IndexedDB Authority Active Pointer & Schema v2 — L3b-1

2026-10-13。Port **1.22.13** / Studio **0.26.7** / Studio schemaVersion **1** / Authority DB physical schema **2**。
開始HEAD/origin/main/remote mainは`57cdd150`で一致。本書がL2a/L3aの「physical version1・7 stores」
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
| pointer | `key`（唯一の正式key=`active`） | partition単位の唯一のactive pointer |
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
pointer不在は「新Authority未公開」でありread-only（書込みは`generation-not-active`）。
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
reservations を1つのreadwrite transactionで扱う。pointerが既に同generation＋同migrationIdなら`already-active`
（epoch不変）、別migrationIdなら`publication-conflict`。それ以外はpointerEpoch CAS（`pointer-stale`）、
publication予約の再利用拒否（`publication-superseded`/`operation-id-payload-conflict`）、sealed・epoch・無効化flag・
journal ready-to-publish・seal一致・evidence attestation（`publication-evidence-unavailable`/`-invalid`）・
bound Accountのfence identity一致（`cloud-fence-required`）を検証する。成功時に同transactionで
旧control→superseded、新control→active、pointer(epoch+1)、journal→active(publishedPointerEpoch)、publication予約を書く。
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
完全公開のどちらかで、retryは同migrationIdで1回だけpublished/already-activeになる。公開後のreopenは同じpointerを読み、
pointer破損・欠損・generation欠落はrecovery-required/read-onlyで自動修復・自動削除・legacy復帰をしない。

## Production isolation

通常Port UI（standard/Pro）・Studio read-only Hostはcapability取得、Authority DB open/create、pointer publish、
control mutationを行えない。Store/capability/IDB backendはboot graphに無く、isolated scope以外は`isolated-scope-required`。
隔離CDP回帰でPort desktop/mobile・Pro gate・Studio起動後もAuthority DB/pointerが作成されないことを確認した。

## Acceptance

Node pointer33件（要求1–38＋bound fence/publication予約/boot graph）、既存store88/backend46/referential35/policy57。
Native cross-process（別renderer PID）: A同migrationId並行publish / B異migrationId CAS / C切替vs old handle両順序×3round、
D publish中crash、E v1接続中upgrade（handler有=移行、無=blocked維持）、F pointer破損/欠損、全PASS。
既存CAS54round＋7・参照63round＋failure4・policy native・L2a native14を回帰。Port/shared2065 / Worker760 /
Other186 / workerd8 / Studioはcommit後clean guard込み315。Playwrightが環境に無いため既存`*-browser.cjs`は実行できず、
同等範囲を使い捨てCDP scriptで確認（Port 1280/393: Home/Metronome/Presets/Tuner/Practice/Calendar/Gear/My Apps/
Settings/Account・Sync/Pro/4 themes、Studio 1440/393: read-only Host/M1・M2/Structure/Editing Session/Pre-DTM/4 themes/Print）。
console/404/unexpected network write 0。

## L3b-1完了範囲と残件

完了: schema v2、予約移行、pointer、sealed/supersededを含むstate machine、atomic publish/supersession、
commit guard、capability基盤、production isolation。
残件: L3b-2正式Control操作（suspend/resume/fence/recovery capability開放）、L3c正式Pro Device Session provider、
L3d Account協調、L4 migration evidence（binary/sync/cloud fence）と`migration` publication・GC・reservation retention、
L5実機stress、B1-6製品入口。shared write解禁・product boot接続・cutoverはいずれも未実施。
