# IndexedDB Authority Control — L3b-2

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


2026-10-13。Port **1.22.15** / Studio **0.26.9** / Studio schema1 / Authority physical schema2・9 stores。
開始HEAD/origin/main/remote main=`378866071929f761e4c9ad66ce21addfe0fbb7fd`、tracked clean・staged空・ahead/behind0/0。
L3b-1 Safety Fix監査A（Blocker/Major0）を前提とし、Pointer provenance/current integrity/Action Policyを維持する。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / shared write OFF / PortDataHost.canWrite=false**。
本番boot/provider/Account/Pro/Syncへ接続しない。本番deploy/D1 migration/cutover/pointer公開なし。

## API / request / identity

Storeの正式APIは以下の6操作だけ。汎用`updateControl(generation,{patch})`は既存privileged fixture専用のまま。
`port-authority-control.mjs`はpure contractであり、metadata/catalogを認可へ使わない。

| action | capability purpose | 変更可能field | precondition |
|---|---|---|---|
| suspendWrites | control:suspend | suspended=true | 正本Pointer/generation/control identity一致 |
| revokeFence | control:revoke | fenceRevoked=true | 同上。古いfence証拠では解除不可 |
| invalidateIdentity | control:invalidate | identityInvalidated=true | 同上。identity/Account binding自体は変更不可 |
| markRecoveryRequired | control:recovery | recoveryRequired=true、state=recovery-required | 同上。authorized recoveryはL4 |
| resumeWrites | control:resume | suspended=falseだけ | active Pointer、厳密CAS、current integrity、identity/recovery正常、有効fence、boundならfresh証拠 |
| renewFence | control:renew | fenceEpoch増加、fenceEvidence更新、fenceRevoked=false | active Pointer、厳密CAS、identity/recovery正常、fresh server証拠と完全binding一致 |

通常request: `{generation,operationId,identity,expectedEpoch?,expectedPointerEpoch?,capability,evidence?}`。
identityはappId=port/datasetOwner=port/partition/ownership/Account ID・generation/membership ID・generationを保持する。
control.identityと完全一致を要求し、Account IDだけで認可しない。secret/資格文字列を予約・factへ保存しない。
未知field/未知action、clone/偽capability、plain evidenceはfail-closed。

停止4操作はexpectedEpoch/expectedPointerEpochが省略可能で、epochの古さを理由に停止を拒否しない。
ただし対象generationは現在のPointerと一致し、現在controlとidentity一致が必須。snapshotだけで停止を確定しない。
既に同じ状態ならno-op（changed=false、epoch不変）。新operationIdのfact・衝突検証は省略しない。
変更がある場合だけcontrol.epoch+1。dataset head/manifest/records/oplog/Pointerを変更しない。

resume/renewはexpectedEpochとexpectedPointerEpochが必須で、transaction内の最新値と厳密一致。
resumeはfenceRevoked/identityInvalidated/recovery-requiredを解除しない。renewもsuspended/identityInvalidated/recovery-requiredを解除しない。
renewの旧fence再利用は拒否し、evidence.fenceEpochは現在値より厳密に大きいことを要求する。
invalidate/recoveryのactiveから通常publishで別generationへ移してラッチを迂回することも拒否する。
隔離試験の明示fixture initialization/fault injectionは製品recovery APIではない。

## Prepare / durable operation identity / atomicity

6APIはraw requestから内部でprepareを行う。`prepareControlOperation(action,request)`で明示prepareも可能。
返る不変opaque tokenはprivate WeakMapへ固定request/capabilityを持ち、同じactionの6APIへだけ渡せる。
clone、別Store、異actionへの転用は拒否する。prepareはControl/write権限を返すものではない。

fingerprintはkind=control、action/generation/operationId/target=control/固定request payload/完全identity/
expectedEpoch/expectedPointerEpoch/evidence snapshotを含む。capabilityや証拠token自体は保存しない。
namespaceはdataset/publicationと共通の`[generation,operationId]`。oplog既存ID・異kind・異fingerprintは拒否。

prepareはreservations＋oplogのRW transactionで未確定Control identityを予約する。
capabilityが検証できない入力は予約しない。認可済み入力のstale epoch/証拠期限切れ等によるcommit拒否後も
元予約を保持する。新しい証拠・epoch・別actionへ元IDをretagせず、新たな明示operationを作る。
未確定予約の`control={schemaVersion:1,request,before:null,after:null,result:null}`は成功factでもwrite許可でもない。

実Control操作はPointer/head/control/manifests/records/oplog/journal/reservationsの同一8-store RW transaction。
最新Pointer/provenance/control/identity/fenceを確認する。resume/renewはcurrent head/full manifest/全records/参照/current oplogも検証。
停止はcurrent head破損を理由に安全側の停止まで妨げないが、Pointer provenanceと有効controlは必要。
transaction内でcapability lifecycleとfresh evidence期限を再確認し、control変更と予約の成功fact更新を原子的に保存する。
resultはtransaction complete後だけ返す。abortではControl/fact/headを部分公開せず、既存の未確定予約を保持する。

成功resultは`{ok:true,status:'control-committed',generation,operationId,action,controlEpoch,changed,
publish:false,operationAuthorized:false,historical:true}`。Controlの過去確定事実であり現在のwrite許可ではない。
失敗は`{ok:false,status:'rejected'|'recovery-required',reason}`。
主なreason: capability-invalid、control-provider-unavailable、control-stale、pointer-stale、control-identity-mismatch、
control-evidence-invalid/stale/identity-mismatch、control-fence-stale、fence-revoked、authority-invalidated、
operation-id-payload-conflict、control-reservation-missing。Pointer破損は既存recovery taxonomyを維持する。

## Replay / response loss

同じ固定requestの確定済みIDはfactを検証して`replayed=true`で返す。Controlを再変更しない。
resume/renew成功→後続revoke/invalidate/recovery→元request retryでも、後続状態・epochを維持する。
現在のoperator capabilityは必要だが、過去の成功証拠の期限を現在の再認可へ読み替えない。
期限切れfactや旧runtimeのtokenを新しいmutationへ使えない。

`lookupControlOperation(generation,operationId)`はread-onlyで確定factを返す（publish=false/historical=true）。
未確定予約はresult=null/pending=true。別kindや不存在はresult=null。現在Controlの健全性・書込み認可はassertしない。
response loss/reopenでは元request内容を保持し、新runtimeの正式operator authorityを取得する。
IDだけから新base・新identity・新証拠を推測してretryしない。

## Capability lifecycle / provider boundary

6purposeをそれぞれbrand＋scope＋generation＋purpose＋runtime leaseへ束縛する。
停止capabilityでresume/renew不可。system ACK/Pro/recovery汎用capabilityは未開放、migration publicationで任意Control変更不可。
scopeはStoreで登録済みの実objectだけ。同名の別scopeを同一権限と扱わず、raw issuerの未登録scopeも拒否する。

Store dispose/versionchange/unexpected closeでleaseを失効させる。同scopeを再openすると新leaseであり、古いcapability/attestationは無効。
同scopeで複数接続した場合も同leaseの失効を受け、旧runtimeは再hydrate/reopenを要する。
既存issuerは新lease用の権限を明示発行できるが、古いobjectを自動継承しない。transaction待機後にもleaseを再確認する。
これはJavaScript sandboxではなく、正式boot graphとprovider取得境界を分離する契約。

fence providerは後続工程まで製品未接続。L3b-2はprivileged isolated fixture issuerの`attestFixtureFence`だけ。
loopbackでもPort/Studio通常routeはtest providerをinstallできない。通常scopeはControl purpose発行／fixture証拠発行を拒否する。

証拠はprivate WeakMap brandを持ち、scope/runtime/generationへ束縛する。
固定snapshotはsource=isolated-server/evidenceId/generation/pointerEpoch/controlEpoch/完全identity/fenceEpoch/issuedAt/expiresAtだけ。
有効期間は最大60秒。wall/同runtime monotonicの両残期限30秒以上、不可逆失効・origin/lifecycle・共有所有を最新の寿命契約に従って検証する。future issuedAtも拒否する。
証拠のcontrolEpochも現在Controlと完全一致。revoke前の証拠をrevoke後の新requestへretagできない。
resume boundは現在fenceEpochと一致、renewはstrict monotonic increase。Account/membershipの両generationも完全一致。
raw `{fresh:true,valid:true,epoch:999}`、clone、期限切れ・旧Control epochのtoken、異scope/identity/pointerは証拠にならない。
ローカルsnapshotだけでcloud writeを許可しない。Worker D1 transaction fenceが最終admissionで、未通知server revokeの完全検知を主張しない。

## Recovery / hydration / display

正常Pointer配下のrecovery-requiredはControlラッチとread-only状態であり、Pointer破損とは別。
healthy full snapshotはhydrate/read/export可能、dataset commitは不可。currentデータが破損した場合は整合検証を緩めずrecoveryへ停止する。
recovery解除・Account付替え・GC/救出/正式authorized recoveryは今回提供しない。

hydrate.readinessはwritable/suspended/fence-revoked/identity-invalidated/recovery-required/superseded/inactiveを区別。
複数flagならrecovery→identity→fence→suspendの順に表示し、全flagはsnapshotに保持する。
backendはhydratingも区別し、sharedWriteCapable=falseとexportableを返す。古いprepared handleはresume/renew後のcontrol epoch/fence CASで拒否。
BroadcastChannelは表示更新hintのみ。正式可否は毎回native IndexedDB transaction内で決める。

## Native race oracle

正式Control APIで16順序×3round=48競合を検証する。fixture汎用updateControlを正式APIの代用にしない。
save/stop4種/pointer switchの両順序、resume/revoke・renew/revoke・suspend/resumeの両順序を含む。

まず第三RW transactionで同じ8-storeを保持し、両実transactionが提出済みかつrequest未開始であることを記録。
次に第一実transactionのrequest handlerをtest専用gateで保持し、第二requestが未開始であることをdriverから観測する。
第一を解放→第一complete/abort→第二request開始を確認→第二を解放しresultを回収する。
queued/request-started/gate-started/release/complete/abort/reject/resultを記録し、別renderer PIDもChrome traceで確認する。
Date.nowの同値を順序根拠にしない。gateで順序が証明できないroundはinconclusiveでFAIL、通常PASSへ含めない。
既存Pointer Safety15（競合9）も同じoracleへ更新し、厳密な両順序をassertする。

## Completion / remaining gates

実装範囲は6Control API、purpose/lifecycle、durable identity、CAS/atomicity、replay/recovery/readiness、隔離証拠とnative oracle。
正式Pro Device Session provider=L3c、Account協調=L3d、migration/cloud/binary evidence・authorized recovery=L4、実機stress=L5は未着手。
製品入口B1-6再開、shared write解禁、M3 write完成の根拠にはしない。通常Port/Studioは既存legacy/read-onlyのまま。
最終検証数・commit後Studio clean guardの実測は完了報告へ記録する。

## 最終検証記録（2026-10-13）

- 開始Node baseline: Worker760 / Port/shared2104 / Other186 / Studio315、全PASS。
- Control追加Node **71** / Authority関連 **369**（baseline298＋71）、全PASS。
- 全required Node: Worker760 / Port/shared2175 / Other186 / workerd8 / Studio dirty314、全PASS。
  commit後にclean guard込みStudio315を除外なしで実行し、成功した場合だけ通常pushする。実測結果は完了報告に記録。
- Chrome155.0.8059.40/native IndexedDB・別renderer（notification dropped、Web Locksなし）:

| Suite | 結果 | renderer PID |
|---|---|---|
| 正式Control | 16順序×3round=48＋追加7、PASS。全48でrequest gateによる順序証明 | 34048 / 34050 |
| Pointer Safety | 15項目＋追加7、PASS。競合9すべて同値時刻に依存せず順序証明 | 32376 / 32378 |
| Pointer A–F | A/B/C各3round・D/E/F＋追加7、PASS | 32683 / 32687 |
| CAS | 54round＋追加7、PASS（既存fixture回帰。正式Controlの証明は上記48） | 32652 / 32654 |
| Referential | 63round＋障害4＋追加7、PASS | 32719 / 32725 |
| Action Policy | 9項目＋追加7、PASS | 32732 / 32738 |
| L2a | native14項目、PASS | 2独立context |

違反0・inconclusive0・unexercised0、oplog重複0・partial manifest0。
正式Control suiteはprepareControlOperationで固定したrequestを各6APIへ渡す。汎用updateControlを使用しない。

正規Playwright **1.62.1**、既存runtime・使い捨てChrome・隔離8766:
Port6suite: runtime18 / readiness26 / runtime-safety10 / migration18 / standard-readiness全assertion / operation10、全PASS。
Studio5suite: Keyboard21 / Editing Session23 / M1 29 / M2 24（計97）/ Host10、全PASS。
CDP主要画面13項目もPASS。通常Port/StudioのAuthority DB未作成、Host canWrite=false、4Themes/Printを確認。
application console/unhandled error0・404 0・unexpected network mutation0。
standard-readinessの意図した401とoffline abortのresource error各1は既存fixtureの期待した障害として別記録する。
外部requestはinterceptし、本番Worker/D1への操作なし。package install/lockfile変更なし。既存8765 serverは操作しない。

Port1.22.15 / Studio0.26.9はdormant内部API・reader version/cache整合のpatch。製品UI/保存先は不変更、DB schema2/Studio schema1維持。
今回の必要fixture変更はcapability lifecycle（閉じたruntimeの公開tokenを拒否・新権限で元公開factをretry）と
native queue/request gate・正式Control API接続。test.skip/only、assertion削除、timeout延長によるPASS化はない。

## Account transition intent — isolated continuation

A strict typed `account-transition` reservation may now atomically record its
stopped intent with `identityInvalidated=true` in the actual eight-store commit
transaction. It is not a pending Control reservation or new authorization. The
six existing Control operations and final admission semantics remain unchanged.
The logical record contract and irreversible recovery/confirmation boundary are
specified in [PORT_ACCOUNT_TRANSITION_INTENT.md](PORT_ACCOUNT_TRANSITION_INTENT.md).
Authority physical schema remains 2; normal writer activation is still closed.
