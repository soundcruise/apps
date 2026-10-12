# Operation Authorization Commit Contract v1

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
