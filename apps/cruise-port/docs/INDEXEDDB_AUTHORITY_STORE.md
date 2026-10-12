# IndexedDB Authority Store v1 — L2a

## L2b Repository接続（2026-10-13・現行）

Port **1.22.10** / Studio **0.26.4 / schema1**。内部adapter/cache readerのpatch。通常UI・保存先は変更しない。
Production Authority **legacy** / Worker **ACCEPT_COMPAT** / enforcement **OFF** / Studio shared write **OFF** / PortDataHost.canWrite=**false**。
正式Pro・Account・製品controlはL3未接続。fixture controlのPASSを製品controlのPASSへ読み替えない。
B1-6再開不可（L3→L4→L5のgateが残る）、shared write解禁不可。本番Worker/D1 deployなし。

`port-indexeddb-repository-backend.mjs`の`openIsolatedIDBRepositoryBackend({scope,generation})`を明示openし、
`new PortDatasetRepository({backend,locks:null})`へ注入する。scopeはL2aのloopback専用brand。
constructorのbackend省略時は既存legacy/WAL経路。両commit engineを一本化せず、IDBは既存Storeのtransactionだけを使う。
production起動にはStore/adapter import/open/probe、migration、pointer切替hookを追加しない。
`port-repository-backend.mjs`は登録brandのみでDB副作用を持たない。fixture scopeはsecurity sandboxではない。

`hydrate()`完了前の`inspect()`はauthority-hydrating。不在/破損/connection失効は読取・保存を拒否し、legacy値を代用しない。
同期inspectはhydrated-display cache。別tabの未通知更新を知ったとは称さない。BroadcastChannelはhead再確認のhintだけ。
明示readDatasetStateはStoreを再hydrate。保存はcacheの判定ではなく、Storeの最新head/control/key-version/dependency CASで決まる。
private baseはwriter await前に固定し、cache更新で進めない。読取キー・明示dependency・expected key revisionはdependencyへ固定する。
expectedRevision指定は全15キーCAS。無関係キーは現在headへmerge。full manifestと明示absentを維持する。

feature fixtureは`registerPortRepository(storage,repository)`で既存readPortStore/writePortStoreへ接続する。
12実store（settings/metronome/presets/tuner/Practice menus/progress/history/sets/Calendar/Gear/categories/My Apps）の同期read・非同期writeを実証。
既存domain loaderをprivate validationに使用し、forward schema/unknown raw保持を維持。binary永続化・migration/GCの正式整合はL4。
返す`result.state`はそのoperationのimmutable manifestを`readCommittedDataset`で読み、後続headをAdapterのread baseに代入しない。
読戻し不能でもtransaction.completeの保存事実はokを保持しstate=null/recoveryRequiredを返す。Adapterはbaseを更新しない。

control/guard/intent/record/full manifest/head/oplogはL2aの1 RW transaction内。成功はcompleteだけ。
対象/依存key staleは拒否。intentは現在headから世代付きmerge、明示ACKはgeneration一致時だけ解除する。
async writer/validationはtransaction外。opaque frozen contextとguard関数をdispatch時に固定し、Promise/thenable/例外/欠落はfail-closed。
30秒marginの正式Pro guard、suspend/resume/revoke/Account switch/pointerの製品接続はL3。
commitはpublish=falseでfixture通知からproduction Syncをwakeしない。

隔離backendの`prepareWrite`/`commitPreparedWrite`と`retryWrite(originalRequest,guardOptions)`は、元base/control/changes/dependency/ACK/IDを固定する。
response loss後はlookupOperation→元request再送。新baseへ自動移し替えない。同ID/同payloadはoplogの確定事実、異payloadは拒否。
opaque Pro proofをrequest/oplogへserializeしない。正式資格の再取得/retag接続はL3の責務。

## L2b検証（2026-10-13）

開始HEAD=origin/main=remote main=`6e667f0e72907da4979b26ef64f1b86de7f082ff`、tracked clean/staged空/ahead・behind0/0。
baseline: Worker760 / Port/shared1894 / Other186 / Studio315 / workerd8、全PASS。
新Repository Node46件＋L2a88件、Port/shared合計1940。Worker760 / Other186 / workerd8、全PASS。
Studio commit前314（Git clean guardのみ除外）、commit後全315を再実行してからpushする。

正式L1 driver:
```sh
node apps/cruise-port/tests/cross-tab/cross-tab-driver.mjs --mode=acceptance --backend=indexeddb-authority --rounds=3 --iterations=200
```
同origin/同partition/別window 2tab。Chrome traceの各tab固有performance markのPIDで異なるrendererを確認。
実PortDatasetRepository＋L2a Store＋native IDB。WebLocksなし、通知を全欠落させる。
6シナリオ×payload 0/20000/200000 bytes×3round（54round）、通常save/delete loopは各tab200試行、control loopは変更前後720ms。
**54round＋追加7項目PASS**（Chrome155.0.8059.40、対象renderer PID 5363/5365）。

| シナリオ | 0KB | 20KB | 200KB | 境界 |
|---|---|---|---|---|
| same-key save/save | 違反0 | 違反0 | 違反0 | 最新key-version CAS、期待staleあり |
| different-key save/save | 違反0 | 違反0 | 違反0 | 各payloadで1200成功更新を保持（2tab×200×3） |
| delete intent race | 消失0 | 消失0 | 消失0 | 各payloadで1200削除とintentを保持 |
| save/suspend | 誤成功0 | 誤成功0 | 誤成功0 | fixture controlのみ |
| save/fence revoke | 誤成功0 | 誤成功0 | 誤成功0 | fixture controlのみ |
| save/Account binding invalidation | 誤成功0 | 誤成功0 | 誤成功0 | fixture invalidation、製品Account変更は未接続 |

各roundのduplicate operationId=0 / partial manifest=0。Nodeの同一key/ABA/依存stale false-commit=0。

同一keyで期待stale拒否を成功消失と混同しない。別keyの必要な成功更新も最終counterで照合する。
各roundでoplog ID重複/seq/full manifestと両tabの収束を確認する。固定回数PASSは数学的証明ではない。
追加native Repository7項目: transaction abort、応答を観測せずrenderer終了→reopen/hydrate/lookup/同IDretry、
異payload拒否、record callback内renderer終了、interrupted別keymerge/再送、重複/partialなし、versionchange/future拒否。
Nodeでblocked/unexpected close/corrupt head/missing record、guard/ABA/dependency/old ACKも検証。L2a native14項目もPASS。

Port browser: desktop/mobile18 routes＋4Themes/Pro、Readiness26、Runtime Safety10、Migration18、全PASS。
通常Portの新Authority DB creation/migration/pointer publication0。Studio read-only Host10（ensure/provision/bootstrap/mutation0）、
Shell/Structure/Editing Session/Pre-DTM/M1/M2/4Themes/Printのbrowser97、全PASS。application console/404/unexpected network write0。
初回browser並行実行の選択保持1件は単独suite23件と順次全97件で再現せず、選択実装は変更していない。
L5のSafari/macOS/iPhone/PWA/物理durability/OS電源断の実証とは扱わない。

以下は各工程当時の履歴。旧「L2b未接続」の記述は当時の状態を示す。

2026-10-12。Port **1.22.9**（独立内部基盤のpatch、通常UIはversion表示以外不変更）、Studio **0.26.3 / schema1**（Port version reader/cache参照更新のpatch）。
開始HEAD/origin/main/remote main=`2c11f02c7e597955d7efd79eadce0f6d5a4b1ff2`、tracked clean/staged空/ahead・behind0/0。
[Cross-tab Authority Contract v1](CROSS_TAB_AUTHORITY_CONTRACT.md)のL2a実装。
**dormant / isolated fixture専用**。Repository adapter、製品boot、Feature Store、Pro/Account runtime、Syncへ接続しない。
Production Authority legacy / Worker ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false。

## Modules and explicit open

- `port-idb-authority-contract.mjs`: physical schema、inventory、型検証、純粋delete intent merge、同期SHA-256。
- `port-indexeddb-authority-store.mjs`: open/lifecycle、prepare、atomic commit、hydrate、oplog、control/journal/root保存。
- `tests/authority-store/`:実domain constructorsを使うfixture、Node専用dependency manifest、loopback Browser fixture。
- `tests/idb-authority-store.test.mjs`: fake-indexeddbによるfailure injection。
- `tests/idb-authority-store-browser.mjs`: private server/throwaway Chrome profile/CDP integration。

module import / `createIsolatedIDBAuthorityScope`だけではDBを作らない。
明示`indexedDB` factory/partitionIdを渡してscopeを生成し、`openIDBAuthorityStore(scope)`で初めてopenする。
scopeはWeakMap brandを持ち、JSON/query/env値だけでは生成できない。Browserでは実hostnameがloopbackでないとscopeを拒否する。
これは同一originの悪意あるscriptを隔離するsecurity sandboxではなく、dormant実装の誤起動防止である。
通常Port/Studio起動にはimport/open hookも新Authority probeも追加しない。
L1のsentinel・boot fail-closed切替はL2b/L4以降。通常起動で新DBが生成されないことをnative Chromeで確認する。

## Database schema

DB名major1: **`sound-cruise-port-authority-v1`**、IDB physical version **1**、packet schemaVersion **1**。
repository protocol **1** / Authority writer protocol **2**、Migration journal envelope schemaVersion **1**。
これらをappVersionやnamespace generationと混同しない。fixture用明示suffix名も同schemaに限定する。

| Store | keyPath | Stored value |
|---|---|---|
| records | `[generation, logicalKey, version]` | schemaVersion、raw(string/null)、SHA-256 digest。addのみ |
| manifests | `[generation, manifestId]` | 全15 keyのversions/recordDigests、deleteIntents、parentManifestId、seq/revision、digest。addのみ |
| head | generation | schemaVersion、repository/writer protocol、seq、manifestId、revision、operationId、controlEpoch |
| control | generation | protocol、epoch/fenceEpoch、immutable identity、suspension/revoke/invalidated、state/recoveryRequired |
| journal | migrationId | schemaVersion、generation、revision、B1-4 stateとJSON evidence/seal/binary metadata |
| oplog | `[generation, operationId]` | payload fingerprint、確定result(seq/manifest/revision/authorizedAt/publish=false) |
| roots | `[generation, rootId]` | kind、manifestIds、recordRefs、journalIds。pinのみ、rootIdはimmutable |

index/autoIncrementなし。store inventory/keyPath/index/versionを厳密に検証する。
future physical versionはopen(name,1)のVersionErrorで拒否。不正schemaをupgrade/recreate/deleteで修復しない。
未理解のhead/manifest/record fieldsは読取り拒否してdiskに保持する。dataset内のunknown fieldとは区別する。
control/journal/rootのJSON evidenceは保持するが、credentials/secretやBlob等のbinaryをpacketへ保存しない。

## Immutable records / complete manifests

全`PORT_DATASET_KEYS`を明示する。未作成keyはversion=null/digest=null/raw=null。
値を削除した場合はraw=nullの新recordを作る。versionをnullへ戻さず、create→delete→recreateのABAをCASで検出する。
変更keyだけversion+1でaddする。未変更keyは既存version/digestを共有し、full raw datasetを毎回複製しない。
同identity/versionの衝突はConstraintErrorでtransaction全体をabortし、既存recordを上書きしない。
manifestは全15 keyとgeneration付きdelete intentを含む。headは一致するseq/revisionのmanifestのみ指す。

SHA-256はraw/version evidence、manifest、operation payloadの整合検査用で、認可や署名ではない。
transaction callbackでWebCryptoをawaitできないため同期FIPS 180-4実装を使い、Node cryptoとnative SubtleCryptoで照合する。
prepareとhydrate/commitでinventory、既存forward envelope、digest、required referenceを照合する。
変更rawはsurviving object fieldsを保持したfull replacementを必要とする。欠落fieldを勝手に補完/normalizeせずfield-lossで拒否する。
新Authorityのrawをlegacy loaderでmigrationしない。詳細feature-domain/binary/graphのvalidation統合はL2b/L4の責務。

## Prepare / atomic transaction

`prepare({base,operationId,action,changes,dependencyKeys,acknowledgements,authorizationContext})`はtransaction外の同期prepare。
callerの長いasync validation/writerは先に終える。clone/freeze、complete base/digest、forward guard、fields保持を検証する。
private WeakMapのprepared handleを返す。callerがdispatch後にdraft/base/dependencyを変えても影響しない。
`initialize`は明示fixture初期化専用で、同じatomic commitにcontrolと最初のheadを含める。既存generationを再seedしない。

`commit`はscope **head/control/manifests/records/oplog** の1 readwrite transaction、`durability:'strict'`を要求する。

1. oplogで同operationIdの確定事実を確認する。
2. head/control、full current manifest/recordをIDB request success callbackで取得・検証する。
3. retained base manifest、対象/依存key version、control epoch/fence/bindingを比較する。
4. 同期operation guardを評価する。その時刻をauthorizedAtとする。
5. 現在headのdelete intentをmergeし、changed records、full manifest、head、oplogを同transactionへ追加する。
6. 最終oplog request成功callbackで`transaction.commit()`を呼び、**completeだけでcommittedを返す**。

requestを組み立てる処理はactiveなrequest callback内にある。transaction中に外部Promise await、network、
localStorage/別IDBへのwrite、cloud mutation、binary copy、migrationを行わない。legacy WALを併設しない。
request成功は保存完了ではない。request error/abort/quota/例外は全か無かで、headだけのpublicationを許さない。
abortしたguard拒否を記録するため別transactionを勝手に作らない。L2a oplogは**committed事実のみ**を永続化する。
L1表のrejected resultの永続化は未実装で、将来の明示的な契約拡張が必要。abort時はoplogも残らない。

IDB transactionのactive/request callback/completeとoverlapping scopeの直列化は
[IndexedDB仕様](https://w3c.github.io/IndexedDB/#transaction-lifecycle)に従う。
strict durabilityはhintであり、OS/媒体障害や電源断まで保証しない（L5実機gate）。

## Guard / Pro boundary

`commit(handle,{commitGuard})`のguardは同期・pure。false/ok:false/allowed:false、例外、Promise/thenableを拒否する。
opaque authorizationContextがあるのにguardがない場合も拒否。credentials/proofはoplog/manifestへ保存しない。
guard detailsはfrozenのhead/control/target/dependency/operationId/action/authorizedAt、**authorizationMarginMs=30000**。
wall/monotonicの双方でmarginを満たすfixture guardと、guard後に期限を越えても完了事実を保持する対照を確認する。
**Storeは正式Pro検証本体やmargin判定を重複実装しない**。30秒の要求を守る正式guardの接続はL3。
guard評価時刻が認可時点であり、guard→completeの遅延上限を仮定しない。marginで完了時刻の厳密保証を主張しない。
観測済みlocal revokeのみ拒否可能、別tabのlocalStorage資格反映や未通知server revokeは保証外。
cloudは既存WorkerでPro/AppDevice/Accountを再認可する。今回cloud executorを作らずpublish=falseを固定する。

## CAS / dependencies / delete intent

head全体が進んでも、対象/依存keyのversionが同じなら現在headを基にmergeする。無関係なkeyの保存でfalse conflictを出さない。
対象key versionが違えばstale。元base manifestとcontrol epochの整合も必要で、偽造/破損baseを採用しない。
caller dependencyKeysに加え、Practice Menu/Set、asset metadata/ownerの既知依存を推論する。
詳細operation固有依存（preset apply等）とfeature graphの正式契約はL2bで追加する。

current headのintentを基にmergeする。old snapshotと同じintentは更新と扱わず、欠落だけでintentを削除しない。
削除はoperationIdを新intent generationとして記録。recreateはそのkeyのCAS成立後に関連intentを解除する。
ACKは明示`{key,generation}`だけを受け、current generation一致時だけ解除する。旧ACKは新intentを消さない。
同intentへの異なる新要求が競合した場合はdelete-intent-conflict。曖昧なlegacy boolean intentは移行判断を要するため拒否する。

## Oplog / retry / recovery

fingerprintは固定action/base/control/changes/dependencies/ACKを含むSHA-256。
同operationId・同payloadはimmutable manifest参照と一致する過去のresultを返す。guardの再認可や新head publicationは行わない。
同ID・異payloadはoperation-id-payload-conflict。別generationなら別key。新資格/Accountへ自動retagしない。
応答喪失後はlookupOperationで確定resultを照会し、serialized original requestを再prepareして同結果へ戻れる。
commit後にcontrolがsuspendになっても過去の事実は保持する。

hydrateは単一readonly transactionでhead/control/manifest/records/oplogを読み、全datasetとimmutable baseを返す。
未hydrate値を正式readに使わず、legacy fallbackもしない。不存在generationはsnapshot=null/absentで、正式snapshotではない。
missing head/control/manifest/record、corrupt/future packetはrecovery-required。head/control両欠落でも残るrecord/manifest/oplogを
検出し、新規generationと誤認して再seedしない。lookupOperationのfact確認と現datasetのhydrate可否は別判定。
abort/quotaでは旧headを保つ。connection lossはreadを拒否し、再open後にoplog/hydrateで結果を調べる。
versionchangeは接続をcloseし新operationを拒否する。blocked openは即rejectし、遅れて成功しても接続をclose/upgrade abortする。
disposeはidempotent。future schemaは保持しreload/対応readerを必要とする。自動削除・自動修復・legacyへの復帰は行わない。

## Control / journal / roots

control更新は同DBのcontrol readwrite transaction。expectedEpoch CAS、epoch+1、binding immutable、fenceEpoch逆行拒否。
commit scopeと重なりIDBで直列化される。fixture suspension/revoke/invalidation/active/superseded/recovery状態を表現する。
正式suspendWrites/resumeWrites/fence/Account source/pointer publicationはL3以降。

journalはB1-4 state/schema1/JSON evidenceを保持し、revision CASを行う。migrationIdを別generationへ再帰属しない。
journalと必要rootの保存は同transactionで原子的。sealHash/binary manifestはmetadataだけで、実legacy migration/copy/reconcileは行わない。
rootsは存在するmanifest/record/journalをpinする。rootId衝突の異内容を拒否する。
GC/delete APIはない。不明record、未ACK outbox base、recovery/evidenceを自動削除しない。mark-and-sweepはL4。

## Tests / reproducible commands

Node用依存は`tests/authority-store/package.json`/lockfileにfake-indexeddb **6.2.5**を固定する。製品依存ではない。
同folderのnode_modulesのみignore。既存worker node_modulesは変更しない。たとえば:

```sh
npm ci --prefix apps/cruise-port/tests/authority-store --ignore-scripts
node --test apps/cruise-port/tests/idb-authority-store.test.mjs
node apps/cruise-port/tests/idb-authority-store-browser.mjs
```

今回の実行では依存を`/private/tmp/cruise-l2a-deps`へ入れ、NODE_PATHを指定して既存untrackedへ干渉しなかった。
Node88件: schema/open/lifecycle、full/immutable/reuse、atomic abort/quota/error/partial、CAS/dependency/intent/ACK、
idempotency/reopen、control/binding/generation、journal/root、missing/corrupt/future、field保持/clock margin。
fake IDBだけでbrowser安全性を証明したとは扱わない。
Chrome155/CDP14項目: native open/readback、same-key CAS/別keymerge、intent merge、guard abort、retry/reopen、
record callback中のtab close、commit後のtab close/response loss、versionchange、future reject、通常起動DB未作成。
同partitionの別window/rendererで実transaction競合を確認する。別BrowserContext2つはstorage partitionが独立することを確認し、
別partition間にCAS共有があるとは主張しない。tab終了試験はOS crash/電源断試験ではない。
console/page error/404/意図しないexternal mutationは0。

L1 driverの`indexeddb-authority` acceptanceは**backend-unavailableのまま**。今回の14項目は独立Store integrationで、
L2b正式Repository acceptance、L3 control/Pro/Account acceptance、L5 stress/Safari/iPhone/PWAの代わりではない。
baselineはWorker760 / Port/shared1806 / Other186 / Studio315 / workerd8 PASS。
最終実測: Worker/Account760、Port/shared1894（baseline1806＋新Node88）、Other186、workerd/D1/R2 8 PASS。
Studioはcommit前314 PASS（Git clean guardだけ除外）、commit後は全315件を除外なしで実行してからpushする。
既存Port desktop/mobile18 routes＋4Themes、Studio read-only Host10項目もPASS、console/page error/404/意図しないSync writeなし。
commit/pushのhashとremote一致は完了報告の実測を参照。

## Completion / next gates

L2aの完了範囲は独立Store、physical schema/lifecycle、fixture logical transaction/hydrate/CAS/oplog、control/journal/root保存。
L2b: Repository backend、Feature Store hydrate/cache、正式dependency/validation、L1 driverへ接続しsave/save・delete intent acceptance。
L3: 正式control mutator、Pro margin/runtime source、immutable Account coordination、control系acceptance。
L4: 実migration/seal/pointer/sentinel/recovery、GC、binary整合、outbox rootsとfailure injection。
L5: cross-process stress、Safari/macOS/iPhone/PWA、durability・IDB不能時fail-closedの実機gate。
**B1-6再開不可（L5前）/ B1未解消 / shared write解禁不可**。Worker/D1本番deploy/cutover/enforcementを行わない。
