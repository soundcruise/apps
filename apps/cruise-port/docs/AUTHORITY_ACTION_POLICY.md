# IndexedDB Authority Action Authorization Policy v1 — L3a

## L3c Trusted Pro Device Session Integration（2026-10-13・現行）

Port **1.22.17** / Studio **0.26.11** / Studio schema1 / Authority physical schema2・9 stores。
開始HEAD/origin/main/remote main=`cb1ce792675d0d67ed095ccbacfe2ad1c77db54b`、tracked/staged空、ahead/behind0/0。
[正式Pro Adapter契約](AUTHORITY_PRO_DEVICE_ADAPTER.md)を参照。正式SoundCruiseProOperationSource、Device Session receipt、既存操作resolverを使う。
任意source/client/boolean/guardを受け付けず、正式read-only receipt検証を通したprivate contextだけをStoreへ接続。
scope/Authority generation/operationId/action/payload/targetとPro generation/sessionVersion/operation revision/credential指紋を固定。
raw credential/key/receiptはAuthority・通知・reportへ保存しない。Control capability/evidenceとPro proofは別brand・別契約。

最終transaction内で同期assertCommitと両clockの30秒marginを確認。Proの5分補正許容を維持する。
観測済みsource失効・期限不足・clock origin変更は旧proofへstickyに保持。新しい非同期検証を要する。
未確定retryは元identityへ再認可、資格変更retag禁止。replayは過去factだけで現在のPro/cloud許可ではない。
Standard BPM/delete/applyはPro/Account不要、raw advanced値を保持。local ProにもAccount/AppDeviceを追加要求しない。

隔離fixtureのみ接続。既存legacy保存/製品Pro判定の挙動、Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**を維持。
通常Port/Studio bootによる新Authority DB/Adapter writeなし。本番deploy/D1 migration/cutoverなし。
L3d以降未着手、B1-6再開/shared write解禁不可。最終回帰はAdapter契約の検証記録と完了報告を参照。
以下は各工程時点の履歴。


## L3b-2 Evidence Lifetime Safety Fix（2026-10-13・履歴）

Port **1.22.16** / Studio **0.26.10** / Studio schema1 / Authority physical schema2・9 stores。
開始HEAD/origin/main/remote main=`3007e79dba2d98fa97a841433bf43d633f6b9d03`、tracked/staged空、ahead/behind0/0。
[証拠寿命契約](AUTHORITY_EVIDENCE_LIFETIME.md)をControl契約と合わせて参照する。
修正前はresume/renewの期限切れ→wall rollback→同じprepared handle成功をNode2件・native2件で再現した。

証拠私有contextはwall expiry・monotonic deadline・clock origin・観測高水位・expired/invalidatedを保持する。
いずれか残予算30000ms未満または時計逆行/不正/origin変更で不可逆失効。30秒ちょうどは既存契約どおり許可。
同じevidenceIdの再attestでcontext/deadlineを再初期化せず、異payload再発行を拒否する。

reservationsのevidence-lifetime rowはprovider＋evidenceId/generation、digest/issuer/runtime/clock所有を固定。
別renderer/reload/reopenは既存証拠を再所有できず、新しいprovider証拠identityと新operationを要する。
monotonic値を異runtime間で比較しない。BroadcastChannelは正本ではない。
最終admissionと失効row更新・Control/fact更新は同じ8-store RW transaction。
拒否時は失効rowだけをcompleteして返す。abortでも私有ラッチと既存durable所有が残り、時計rollbackで復活しない。
旧未確定予約に寿命証拠が無ければ現在clockから補完しない。確定replay/lookupは過去factだけで制限を解除しない。

cross-tab JSONはstdout flush callbackを待って終了し、>64KiBのpipe出力をparseして検証する。
round/assertion/transaction gateは減らさない。通常scope/bootへprovider/Control/Authority DBを接続しない。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**。
L3c以降は未着手、B1-6再開/shared write解禁不可。本番deploy/D1/cutoverなし。
最新回帰結果は証拠寿命契約の検証記録と完了報告を参照。以下は各工程時点の履歴。


## L3b-2 IndexedDB Authority Control（2026-10-13・履歴）

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


## L3b-1 Safety Fix Completion（2026-10-13・履歴）

Port **1.22.14** / Studio **0.26.8** / Studio schema **1** / Authority DB physical schema **2**・9 stores。
開始HEAD/origin/main/remote main=`58b21a4263b3d689afde712e59f86d5c8068b174`。前回の91ファイル差分を保持。
[Pointer正式契約](AUTHORITY_POINTER_SCHEMA_V2.md)にprovenance/current integrity/collision/retry/historyの詳細を定義する。

Pointer識別情報全体をreservations内の独立publication factと照合し、公開manifest/recordsとjournal/oplogの整合も検証。
`pointer` storeの`namespace`行はpartition/protocol/schema/最後のpointerEpochを保持し、公開後のpointer欠損を未公開と誤認しない。
現在のactive head/control/full manifest/全records/参照/current head oplogを同じnative transactionで検証する。
破損activeからのduplicate publish・別generation publish・通常saveを拒否し、hydrateはrecovery-required/read-only。

同migrationIdのretryは元operationId・元precondition・元evidenceとfingerprintが一致する場合だけalready-active。
operation identityはgeneration＋operationIdでdataset/publicationを横断し、oplogとreservationsの混用・異payloadを拒否する。
`lookupPublication`の過去確定事実は`historical=true/publish=false/currentAuthorityVerified=false`で、現在のwrite/publish認可ではない。
v1→v2は既存7 storeを再作成せず、予約移行とnamespace epoch0追加を同じversionchange transactionで実行する。
旧v2のnamespace/publication factを自動補完しない。旧未公開candidateはread-only表示、証拠のないactiveはfail-closed。

Production Authority **legacy** / Worker **ACCEPT_COMPAT** / enforcement **OFF** /
Studio shared write **OFF** / PortDataHost.canWrite=**false**を維持。
通常bootへ新Authority/providerを接続せず、本番deploy/D1 migration/cutover/active pointer公開は行わない。
L3b-2/L3c/L3d/L4/B1-6製品入口は未着手。shared write解禁不可。
検証: Pointer Safety15（native待機証明9）＋7、Pointer A–F＋7、CAS54＋7、参照63＋障害4＋7、native policy9＋7、L2a14、全PASS。
Node: Worker760 / Port/shared2104 / Other186 / workerd8 / Studio dirty314、全PASS。commit後Studio315を除外なしで実行する。
正規Playwright1.62.1: Port6suite（18/26/10/18/standard-readiness/10）、Studio5suite（21/23/29/24/Host10）、全PASS。
CDP製品隔離13もPASS。application error/404/unexpected network mutation0、期待した認証401/offline errorだけ別記録。
standard-readinessのVer1.18.0期待を正式定数由来の可視・完全一致assertionへ修正し、現行Device Session応答/初期fixture保存/reset navigation同期を合わせた。
package/lockfileと利用者8765 serverは不変更。詳細・PID・fixture修正理由はPointer契約のCompletion検証記録を参照。
以下の各工程の本文・検証数は履歴であり、この現行契約に従う。

## L3a本文（2026-10-13・action policyは現行、予約保存先はL3b-1で変更）

2026-10-13。Port **1.22.12** / Studio **0.26.6** / Studio schemaVersion **1**。
開始HEAD/origin/main/remote mainは`a8104706ddd6c7c926a7676862b4f1d25c6bcf16`で一致。
本契約がL2a/L2b当時の「caller contextがあればguard必須」「generic local書込み」の新Authority契約を置き換える。
Production Authority **legacy** / Worker **ACCEPT_COMPAT** / enforcement **OFF** / Studio shared write **OFF** / PortDataHost.canWrite=**false**。
製品起動への新Authority接続、Worker deploy、D1適用、cutover、L3b以降の実装は行わない。

## 再現と強制位置

変更前、saveAdvancedのprivate writerを準備し、guardなしcommitはoperation-commit-guard-requiredで拒否された。
同じserialized requestのrequiresAuthorizationだけfalseにすると、guard/contextなしretryでvolume=99、seq=2がcommitできた。
修正後の同じ再送はPro policyからguardを要求し、head/oplogを変更しない。
requiresAuthorizationは旧request互換の表示情報で、認可要否の根拠ではない。

StoreのRW commit transaction内で、現在headのcontrol/CASに続き、正式action policy、対象key、mutation内容、内部capability、同期Pro guardを照合する。
intent merge、参照validation、record/full manifest/head/oplog publicationは従来の単一transaction内。
async private writerとidentity予約はtransaction外。成功はtransaction.completeだけ。

## 正式action inventory

| action | policy | 対象 / semantics |
|---|---|---|
| saveBpm | Standard | metronomeのみ。bpmだけ変更。raw advanced/unknown/version保持。settings削除不可 |
| saveAdvanced | Pro | metronomeのみ。既存schema3のbpm/meter/rhythm/sound/volume/accents。unknown/version保持 |
| listPresets | read-only | Repositoryの読取り。mutationとしてcommitすると拒否 |
| applyPresetStandard | Standard | metronomeのbpmのみ。operationData.presetIdと現在preset一致。presets keyの依存CAS必須 |
| applyPresetAdvanced | Pro | 同じpreset identity/依存CAS、正式settings全値一致。raw unknown保持 |
| createPreset | Pro | presetsへ一件追加。既存全row/順序/unknown保持。既存row更新や削除の混入不可 |
| deletePreset | Standard | presetsから一件削除。survivor全row/順序/unknown保持。新規row/更新混入不可 |
| ackDelete | system | dataset changesは空。固定generation/operationId/intent key・generationの内部capabilityが必要 |

local StandardはAccount/AppDevice/membership/Proを要求しない。bound controlの既存identity/CASは別条件として維持。
Standard-effective applyを表示上のprojectionへ保存し直さず、raw Pro値は以前の値を保持する。
旧schemaのmigration/normalizationをこの操作で暗黙実行しない。未知actionはunknown-action。

| mutation inventory | 新AuthorityのL3a正式対応 |
|---|---|
| Metronome settings / preset list / create / delete / apply | 上記actionに限る。製品feature adapterの正式接続は未実施 |
| Settings / Tuner | saveSettings / saveTunerはaction-unimplemented |
| Practice menus / progress / history / Calendar / sets | savePracticeMenus / savePracticeProgress / savePracticeHistory / savePracticeCalendar / savePracticeMenuSetsはblocked |
| Gear items / categories / My Apps | saveGearList / saveGearCategories / saveMyAppsはblocked |
| Sync asset metadata / schema / attachment・photo・iconのlogical refs | saveAssetMetadata / saveSchemaVersionはblocked。binary DB自体はL4別契約 |
| Sync apply / queue / publish / import / coordinated multi-key writer | generic localでは許可しない。正式operation policy未整備。queueSync / pushCloudもblocked |
| initialize / fixture control / migration journal / roots | 明示的にtrustedな隔離test setupのみ。通常scopeのmutatorでは拒否 |
| legacy/WALの全feature writer、既存binary writer | 製品保存先・認可方針を変えない。既存回帰を維持 |

L2a/L2b/L2b-fixの物理/CAS/参照試験には、tests/authority-store/test-authority.mjsが明示的なfixture authorityを供給する。
そのprivileged scopeでだけlocal/fixture-saveをisolated-fixture policyとして固定payloadへ許可する。
これはStandardのfallbackではない。正式action試験はfixtureMutations=falseで行い、同じgeneric操作を拒否する。
他featureのPro policyを推測せず、legacy fixtureのPASSを正式product policyのPASSへ読み替えない。

## Guard shape、provenance、result

Proではguardが必須。未指定、非関数、false/ok:false/allowed:false、例外、Promise/thenableは拒否する。
true/undefinedだけでは正式proof resultにならない。任意callerの()=>true、clone/別scopeのcontext/別guardも拒否する。
固定operation contextはprivate WeakMap brandでscope・operationId・action・credential identity・prepared payload fingerprintへ結び付ける。
raw資格/proofはrequest・journal・oplog・datasetへ保存しない。

L3a時点のtrusted providerは**隔離test resolverだけ**だった。L3cでは正式Device Session Adapterのprivate brandを追加した。Store installerはbrowserのloopbackかつ/apps/cruise-port/tests/ routeだけで利用できる。
Nodeでは明示test harnessが供給する。通常Port/Studio boot graphはtest module/installerをimport・実行しない。
既存Store scopeとtest authorityは別brand。fixtureは敵対的な任意JavaScriptに対するsecurity sandboxではない。
製品routeのUIや任意commitGuardをtrusted providerへ格上げしない。正式Pro Device Sessionとの隔離接続はL3c Adapterに従う。

L3c向け同期結果契約:

```js
{ ok: true, policy: 'pro',
  generation: positiveInteger,             // Pro credential generation。Authorityのg1とは別
  credentialFingerprint: sha256Hex,        // 資格/epoch/session identityの非秘密なdigest
  wallMarginMs: finiteMilliseconds,
  monoMarginMs: finiteMilliseconds }
```

両marginが**30000ms以上**でなければ拒否。29秒は拒否、30/31秒は許可。
既存createProOperationResolverはcredential/generation/operationRevision/sessionVersionをprivate fingerprintに固定し、
Device Session validate(force:false)のofflineRemainingMs（最大7日）からvalidation前wall/mono anchorの期限を固定する。
sticky rollback/reset/revoke検査とrealm固有proofを維持して、残marginを正式sourceから同期で計算する必要がある。
assertCommitの既存return契約は維持し、L3cはcommitMarginsでprivate budgetを取得してこのtrusted resultへ接続する。L3aでUI badge/任意値を代用しない。
30秒は工学的余裕であり、IDB completeまでの数学的な期限保証ではない。未通知server revokeの検知保証も増やさない。

## Identity reservation、retry、replay

formal fingerprintはaction、partial payload/target keys、full base/control/key versions、dependency、ACK、policy version/区分、
operationData、credential identityを含む。caller policy mirrorが異なる場合は拒否する。
backend.prepareWriteは返却前にStore.reserveOperationでimmutable operation identityを予約する。
直接Store.prepareは同期のprivate captureなので、durable予約が必要なcallerはreserveOperationを待つ。
直接Store.commit/retry相当もpublication前に予約を強制する。異なるpayloadの先行予約を上書きしない。

L3b-1以降、予約はschema v2の`reservations` store（`[generation, operationId]`）へ保存し、L3a期のjournal行はv2 upgradeで移行済み。
L3a当時: 予約は既存journal storeの`operation-<sha256(generation,operationId)>`に、kind=operation-identity / schemaVersion1 /
generation / operationId / fingerprintだけを追加する。migration journalと区別し、rootへのmigration証拠として参照不可。
同じキーが既に別内容なら拒否。writeJournalも既存rowのmigration validationが失敗するため予約を上書きできない。
IDB physical version1・7 storesを維持する。reservation transactionはdataset/control/head/oplogを書かず、commit事実でも認可grantでもない。
認可拒否・abort後も予約を保持するため、別tab/reopenの未確定retryもaction/payload/target/identityを差し替えられない。
reservation retention/GC・正式migrationでのnamespace扱いはL4。既存migration readerが予約をmigration journalとして扱わないことが接続前gate。

未確定retryは元request/baseを再送し、現在のtrusted guardで元credential identityを再認可する。新資格へretagしない。
base revisionを自動で進めない。staleなら新しい明示operationを作る。
確定済み同fingerprintはoplog/immutable manifestの過去の事実を返し、現在guardが失効・欠落していてもreplayed=true。
publish=false、二重notificationなし、Sync wakeなし、別Account送信なし。replayは現在のwrite/cloud認可ではない。
L2b generic fixtureの既存fingerprint/dependency順序は履歴replayのため維持する。正式policyとして新規書込みを許可する根拠にはしない。

## Direct API audit

initializeはtrusted fixture seed capability、prepareはimmutable capture、reserveOperationはidentityのみ、commitはStore内正式policyを必須化。
backend retryはbooleanによるcontext必須化を撤去し、Storeのpolicyとidentity予約へ渡す。
ackDeleteは内部capabilityが固定するACKだけ。action文字列だけでは任意dataset write/intent解除不可。
旧physical回帰scopeのACKは明示fixture authorityの権限で、通常scopeでは拒否する。
fixture updateControl/writeJournal/writeRootもtest providerなしでは拒否する。hydrate/readCommittedDataset/lookup/readJournal/readRootはread-only。
正式Control/Account協調はL3b、正式Pro/system providerはL3c、migration/recovery/binary/GCはL4、実機stressはL5。

## Acceptance

baseline Worker760 / Port/shared1975 / Other186 / Studio315 / workerd8、全PASS。
L3a policy Node57件。原flag迂回、action/payload/target/policy/credential差替え、guard shape/provenance/margin、
Standard成功/advanced変更・削除拒否、Pro成功、preset apply/create/delete、system偽装、直接Store、retry/replay、
unknown/未対応inventory拒否、legacy他store継続、通常routeのtest provider拒否を含む。
既存L2a88 / L2b46 / L2b-fix35も維持。Port/shared2032、Worker760、Other186、workerd8、全PASS。
Studioはcommit前314、Git clean guardをcommit後に含めて全315を再確認する。
Native Chrome155の異なるrenderer PIDをtraceで確認。policy9項目、既存L2a14、L2b54round＋7、参照63round＋failure4、全PASS。
Port desktop/mobile18＋Readiness26＋Runtime Safety10＋Migration18、Studio97＋read-only Host10、全PASS。console/error/404/unexpected network mutation0。
最終Gateの実測結果は完了報告を参照。B1-6/shared write再開不可。本番認可完成と扱わない。
