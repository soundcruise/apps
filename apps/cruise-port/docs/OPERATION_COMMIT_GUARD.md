# Operation Authorization Commit Contract v1

## L3c Observed Revocation Safety Fix（2026-10-13・現行）

開始HEAD/origin/main/remote main=`a6b5bcd988995585f2ed80e40175f3924e1b0d6f`、tracked/staged空、ahead/behind0/0。
Port **1.22.18** / Studio **0.26.12** / Studio schema1 / Authority physical schema2・9 stores。
[観測済み失効の正式契約](PRO_TERMINAL_DENIAL_CONTRACT.md)を参照。限定対象はterminal伝播・不正clockのsticky拒否・fresh native oracle。

正式challenge/renew/sessionの401＋ok=false＋invalid_credential/reauth_requiredだけを対象資格terminalとする。
device/proof mismatch、未知401/403・不正bodyは新規認可を拒否し、503/429/network/timeoutは既存bounded grantだけを維持。
検証request identity、credential/receipt指紋、Pro generation/sessionVersion、開始operation revisionを固定。
既存shared sourceへ同期ラッチ→pending revoke→同一資格auth除去/revision更新→対象receipt forgetを反映し、完了をawaitする。
同資格の途中revision更新はterminalを解除しない。別資格Bのauth/epoch/receiptを旧Aの応答で変更しない。
更新失敗はpropagationFailed、旧handle・offline・別Adapter/renderer・reopenを拒否。別DBの原子性は主張しない。
未確定retryは現資格で元identityへ再認可。確定replayは履歴のみ、publish=false。
非有限wall/mono・provider例外・origin異常は旧proofへstickyに保持し、正常な5分wall補正は維持する。
後続request開始を観測した後に先行snapshotを再取得し、completion欠落はinconclusive。round/assertionを減らさない。

修正前反例Node3/native3を保持。新規Node39＋oracle4、native Observed Revocation13＋7を正式追加。
required回帰の実測・故障回復条件・fixture修正理由は上記契約の検証記録へ集約する。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false**。
通常bootへ新Authority/Adapterを接続しない。本番deploy/D1/cutoverなし。
L3d以降未着手。次は限定独立安全監査、B1-6再開/shared write解禁不可。
以下は各工程時点の履歴。

## L3c Trusted Pro Device Session Integration（2026-10-13・履歴）

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


## L3a Action Authorization Policy（2026-10-13・現行）

Port1.22.12 / Studio0.26.6 / schema1。[Action Policy](AUTHORITY_ACTION_POLICY.md)が新Authorityの正式操作契約。
requiresAuthorization自己申告の迂回を再現し、Store RW transaction内のaction/targets/raw mutation/guard検証で拒否する。
Standard BPM・preset delete/Standard applyはPro/Account不要。advanced save/create/advanced applyはtrusted同期guardと両30秒marginが必要。
identity予約はbackend.prepare返却前・直接Store.commit前に既存journalへ固定し、未確定retryのaction/payload/policy/target差替えを拒否。
確定replayは過去の事実だけ、publish=false/Sync wakeなし。system ACKは固定intent generationと内部capabilityのみ。
未知/未対応featureの新Authority mutationはblocked。物理安全回帰のgeneric writerは明示privileged test scopeに限定する。
正式Device Session/providerはL3c、Control/Account協調はL3b未接続。通常product routeからtest providerを生成/使用しない。
Production legacy / Worker ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=falseを維持。
Node policy57＋既存169、Port/shared2032 / Worker760 / Other186 / workerd8。Studioはcommit後clean guard込み315で確認。
Native policy9 / L2a14 / L2b54round＋7 / 参照63round＋failure4、Port72 / Studio97＋Host10、全PASS。console/404/unexpected network mutation0。
次はL3a独立確認、その後L3b。L3b以降/B1-6/shared write/deploy/cutoverは実施しない。以下は各工程時点の履歴。

**L1追記（2026-10-12）**: 本契約の保証は単一realm内。cross-tabの線形化は[Cross-tab Authority Contract](CROSS_TAB_AUTHORITY_CONTRACT.md)
に従い、新Authorityでは同期guardをIndexedDB commit transaction内で評価する。その評価時刻を
commit authorization pointとし、Pro期限は`deadline - now >= margin`（初期30秒）を要求する。marginは原子性の保証ではない。

2026-10-12。Port **1.22.8** / Studio **0.26.2**、domain schema不変更。
既存Repositoryへの限定拡張であり、Authority・Migration・Sync・Workerのrewriteではない。

## Operation Authorization Context

`createOperationBoundary.begin(action, base, {targetKeys})`はoperationId/actionだけを公開する凍結tokenを返す。
private WeakMapにfull Repository base、target keys、Account ID/generation、membership ID/generation、
Authority generation、repository epoch、writer/repository protocol、正式Pro proofを固定する。
Authorityのfence ticket/control epoch/固定identityは既存providerのcaptureCommitContextで別途固定・照合する。
資格文字列をdataset/WAL/metadata/notificationへ保存しない。外部通知のauthorizationContextはopaque tokenのみ。
全操作に全条件を強制しない。Standard BPM/list/Standard-effective apply/deleteはPro不要。
unbound-localはAccount不要。ProはAccount非依存のdevice資格で、Account A→BだけをPro失効と扱わない。
Account-bound Repositoryでは別条件のAuthority owner/Account bindingを必ず照合する。

## Synchronous commit guard

Repository `runWrite`はoptional operationId/authorizationContext/commitGuardを受ける。
`commitGuard(token, details)`は同期・冪等なsource読取りを行い、Promise/thenable、例外、false、
`{ok:false}`/`{allowed:false}`を拒否する。context指定時のguard欠落も拒否する。
readContextSync/readAuthSyncは正式な同期source必須で、async getterやUI badgeを代用しない。

既存prepare段階でprivate writer/schema/full inventory/unknown fields/delete intentsを検証・freezeする。
exclusive dataset lock内でfull revision CAS→Authority final guard→operation guard→WAL→changed keys→
operation guard再確認→pendingなしのfinal metadata publicationを行う。最終guardからpublicationにawaitを置かない。
既存Authority guard、fence/control epoch、write suspension、Account binding、key CASを維持する。
線形化点はfinal metadata setItem成功。途中失効は既存WALでrollbackし、失敗時recovery-required。
operation guardは認可を組み込む口であり、durable operation-ID dedupeや万能registryではない。

## Formal Pro source / deadlines

`createProOperationResolver`は既存Pro Device Session `validate(auth,{force:false})`から
sealed operational grantのofflineRemainingMsを取得する。表示用cached statusは認可ではない。
shared gateの`SoundCruiseProOperationSource.read()`はsync/pureで、credential、generation、sessionVersion、
shared operation epoch、realm authEpoch、reset/pending revokeを観測する。readだけでkey/DB/client/networkを作らない。
validateは従来のdevice-bound session/renewal方針を使う。status subscribeをensureへ変えない。
資格identityの変更/削除およびDevice Session forgetはUUID epochを先に変更する。
validatedAtのような表示用更新はepochを変えず、同じ資格の通常再検証でpending operationを不要に拒否しない。

validation前のwallAnchor=W、monotonicAnchor=M、残予算Rを固定し、期限はW+RとM+R。
Rは有限で0より大きく、既存offline policyの7日以下。処理時間は予算を短縮する。
commit時は両期限を照合し、どちらか到達で拒否。private high-waterは
max(previousHigh, currentWall, W+max(0,currentMono-M))で、既存helperと同じ5分超のwall rollbackを拒否する。
monotonic reset/不正時計/失効済みproofはsticky blocked。少量wall rollbackでもmono期限を延長しない。
proofはresolver/realm固有のWeakMap brandを持ち、clone、別resolver、別realm、再起動に期限を移植しない。
sleep中monoが進まない環境でもwall期限が上限となる。fresh operationには新しい正式validationが必要。
資格削除、credential/generation/epoch変更、既知revoke、同partitionのshared epoch変化を同期照合する。

## Product paths and commit facts

Dormant Studio Facadeはadvanced save/create/advanced applyへ同じguardを渡す。
製品Hostはwrite executorを渡さず、canWrite=false/shared write OFFのまま。
本番Portのadvanced設定保存、preset作成、Pro advanced applyにもPort-owned legacy adapterを接続する。
Standard BPM保存はstored advanced fieldsを保持し、Pro失効後も保存可能。list/Standard apply/deleteも対照として維持。
prepareで固定したoperationを新資格へ自動retagしない。拒否時のdraft/名前を保持する。

publication前の認可拒否は失敗であり、Facade catchでlocal-savedへ変換しない。
publication後の失効/通知例外は過去のcommit事実を保持する。旧operationId/context、publish=false、
local-saved/sync-unconfirmedを返す。subscriber後にもguardを確認し、既知失効したcontextからSyncをwakeしない。
通常のauthorized local saveの既存Sync wakeは維持するが、これはcloud mutation許可ではない。
queueSync/pushCloudはAccount/member/AppDevice/activation条件が別途必要で、backend再認可を必ず維持する。
既存WorkerのAccount/Pro/CAS/epoch/operationId/Asset LifecycleとSync Execution Lockは不変更。

## Verification and limits

元の再現は変更前対照2 PASS/再現6 FAIL、修正後8 PASS。元assertion/checkpointと停止報告を保持する。
追加matrixは148件: 4 mutation×9 transition×3準備/待機checkpoint=108、generic拒否7、clock/source8、
queue/push pre-publish10、post-commit3、WAL中失効rollback3、予算不正4、表示status非依存1、realm/sticky/sync-source3、mutable資格source retag拒否1。
advanced applyはFacade既存回帰で正式proof取得とStandard-effective対照を確認する。
queue/publishに架空の製品executorを作らず、operation境界の検証に限定する。実cloud再認可はWorker回帰で検証する。
lock待機後に同lockへ並んだAccount/suspend/CAS変更はsave-firstを許す対照であり、開始時刻を失効確定と扱わない。
first/final validationで失効が先に確定したケースは拒否する。
Chrome native2-tabでPro revoke/generation、Account/suspend、save/save CAS、same Accountを確認し、
実Port UI＋native encrypted device sessionでは有効proofの保存成功とlock待機中reset後の拒否を確認する。
隔離server/資格だけを使い、本番network writeは行わない。

**未保証**: Web Locks取得とlocalStorageのcross-tab可視化順序に仕様上の一体保証はない。
shared Pro mutatorはPort dataset lockを取得しないため、最後のsource読取り直後の別tab revokeとの完全な同一lock線形化は保証しない。
native PASSだけでこの問題を解消済みとはしない。非協調old buildのABAも完全保証外。
未通知server revokeをlocalで完全検知できない。既存7日offline proof policyの範囲であり、cloudではserverが再認可する。

本番Authority legacy / Worker ACCEPT_COMPAT / enforcement OFF / Studio read-onlyを維持。
B1-6は未完了、shared write解禁不可。fresh server fence、正式Account/control製品接続、operator/cleanup crash回収、
old writer排除、reconciliation/partition/rollback acceptanceは残工程。今回deploy/D1適用/cutoverは行わない。
