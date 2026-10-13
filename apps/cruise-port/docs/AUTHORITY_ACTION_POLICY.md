# IndexedDB Authority Action Authorization Policy v1 — L3a

## L3b-1 Active Pointer & Schema v2（2026-10-13・現行）

Port1.22.13 / Studio0.26.7 / Studio schema1 / Authority DB physical schema2。[Pointer契約](AUTHORITY_POINTER_SCHEMA_V2.md)が正式契約。
v1→v2はadditive（pointer/reservations追加、既存7 store不変更）。L3aのjournal予約行はversionchange内で全件検証・複写・読戻し後に
reservationsへ移し、1件でも不整合ならupgrade全体をabort。`operation-`prefixのmigrationIdは拒否しL4 journalと分離する。
partition唯一のpointer(`active`)が正本、sentinelはhint。破損/generation欠落はrecovery-required、不在はread-only。
state: staging/prepared/sealed/active/superseded/recovery-required。seal後、pointer CAS・evidence・fence検証付きの1 transactionで
旧control superseded＋新control active＋pointer＋journal＋publication予約を公開。同migrationIdはalready-active、異migrationIdはpointer-stale/conflict。
通常commitはpointer/control/headを同transactionで再確認し、切替後のold handle/旧baseはgeneration-not-active/pointer-staleで拒否。
capabilityはscope/purpose/generation束縛のbrand object、L3b-1発行はmigration-publicationのみ。publish中crashは全abortまたは完全公開でretry1回。
Port/Studio boot graphはStore/capability/IDB backendをimportせず、通常UIはDB作成・publish・control変更不可。
Node pointer33＋store88/backend46/参照35/policy57、Port/shared2065 / Worker760 / Other186 / workerd8 / Studio315（commit後clean guard込み）。
Native A–F（別renderer）、CAS54round＋7、参照63round＋failure4、L2a14、CDP製品回帰（Port 1280/393・Studio 1440/393）全PASS。console/404/unexpected write0。
Production legacy / ACCEPT_COMPAT / enforcement OFF / shared write OFF / canWrite=false。L3b-2（正式Control操作）/L3c/L3d/L4/B1-6は未着手。

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

現在のtrusted providerは**隔離test resolverだけ**。Store installerはbrowserのloopbackかつ/apps/cruise-port/tests/ routeだけで利用できる。
Nodeでは明示test harnessが供給する。通常Port/Studio boot graphはtest module/installerをimport・実行しない。
既存Store scopeとtest authorityは別brand。fixtureは敵対的な任意JavaScriptに対するsecurity sandboxではない。
製品routeのUIや任意commitGuardをtrusted providerへ格上げしない。正式Pro Device Sessionとの接続はL3c。

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
現helperのassertCommitはresultを公開していないため、L3cでこのtrusted resultへ接続する。L3aでUI badge/任意値を代用しない。
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
