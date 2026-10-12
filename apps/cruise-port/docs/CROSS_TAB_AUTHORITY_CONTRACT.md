# Cross-tab Authority Contract v1（L1）

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

## L2a実装追記（2026-10-12・現行）

Port1.22.9 / Studio0.26.3。[IndexedDB Authority Store v1](INDEXEDDB_AUTHORITY_STORE.md)を独立実装。
DB名major1 / physical version1 / 7 store / key構造は§4に一致。Store内部のfixture logical commit/hydrate/CAS/oplogを実装した。
Node88件とChrome/CDP14項目で原子性/abort/再送/2-renderer/別partition/versionchangeを検証する。
これはL2a primitiveの実証であり、製品Repositoryのcross-tab acceptanceではない。
§15の設計/未完は正式製品gateの状態であり、今回のfixture PASSで完了へ更新しない。
既存L1 driverのindexeddb-authority backendは未接続・acceptance不合格を維持する。
Pro marginはguard interfaceへ30秒を渡す。正式Pro判定・Account協調・製品controlはL3。
L2a oplogはcommittedのみ永続化する。guard拒否は全transaction abortのためrejected rowを別transactionで保存しない。
root pin保存まで、GC/実migration/boot sentinel切替は未実装。L2b→L3→L4→L5後にB1-6再開を判定する。
Production Authority legacy / Worker ACCEPT_COMPAT / enforcement OFF / Studio read-only/canWrite=false。
以下のL1反例・契約・未完gateは保持する。

2026-10-12。Port **1.22.8** / Studio **0.26.2 / schema1**。L1は契約と反例固定だけで、製品の保存方式は変更しない。
本番Authority legacy / Worker ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / PortDataHost.canWrite=false。
本契約は新Port-owned AuthorityのL2以降の実装境界であり、B1-6製品統合やshared write解禁を意味しない。

## 1. 前提の訂正

Web Locksは同一storage partition内のlock付与を排他にするだけで、localStorageの可視性を同期しない。
localStorageは各context（renderer）のcacheを非同期に更新し、仕様上のcross-context同期を持たない。
したがって「同じdataset lockに参加したlocalStorage書込み」は**cross-tabで線形化されない**。
既存文書の「同lock参加mutatorのcross-tab線形化」「revoke Promise完了＝cross-context失効確定」は撤回する。
単一realm内のOperation Commit Guard・Authority final guard・Worker D1 fenceの結論は変わらない。

## 2. 実Repository反例（L1 Phase A）

harness: `apps/cruise-port/tests/cross-tab/`。driverは実Chromeの別window 2タブ（別renderer）、
loopback専用の一時server、使い捨てprofileで、実`PortDatasetRepository`とdormant Authorityをnative
Web Locks / localStorage上で競合させる。fixtureは自身が作ったmarkerのないnon-empty storageに触れない。

```sh
node apps/cruise-port/tests/cross-tab/cross-tab-driver.mjs                       # characterization（既定・exit 0）
node apps/cruise-port/tests/cross-tab/cross-tab-driver.mjs --mode=acceptance --backend=indexeddb-authority
```

L1実測（Chrome 155.0.8059.39 headless、macOS、6シナリオ×payload 0/20KB/200KB×3ラウンド、1ラウンド各200試行）:

| シナリオ | 対象 | 観測 |
|---|---|---|
| save/save 同一key CAS | legacy Repository | **lost update 2件**（20KB、2ラウンド各1）。0KB/200KBは未観測 |
| save/save 別key | legacy Repository | lost update未観測 |
| delete intent更新 | legacy Repository | **delete intent消失2件**（0KB/20KB、`metronome_preset/ct-a-0`） |
| save/suspend | dormant Authority | 違反未観測（27ラウンド、境界通過済み） |
| save/fence revoke | dormant Authority | 違反未観測（同上） |
| save/Account binding変更 | dormant Authority | 違反未観測（同上） |

全シナリオで、書込み中の他tab WAL pendingが`recovery-required`として観測される一時拒否が多数発生した
（可用性の欠陥。データ破壊ではない）。control系の判定は「相手の変更完了後に付与されたlock内のcommit」だけを
違反と数える下限値であり、未観測は安全の証明ではない（機構は同じで、構造上の保証がない）。
同一scenarioの独立probe（前回監査）ではpayload増加で最大50%のlost updateが出ている。

### negative characterization と acceptance

- `cross-tab-driver.mjs`はテストglob（`*.test.*`）外。characterizationは違反があってもexit 0で記録だけ行う。
- `--mode=acceptance`は違反・未実装backend・境界未通過のいずれでもexit 1。L2以降の新backend受入試験に使う。
- `--backend=indexeddb-authority`はL2実装まで`backend-unavailable`で必ず不合格（fail-closed）。
- `cross-tab-oracle.test.mjs`は通常CIに入り、oracleが欠陥を検出できることとacceptanceのfail-closedだけを検証する。
  per-context cacheのsimulationであり、ブラウザーの証拠とは扱わない。

## 3. Legacy Port（決定: A 現状維持＋リスク明記）

本番legacyはlocalStorage + Web Locksのまま変更しない。旧データを新Authorityへ自動移行しない。
既存リスク: 同partitionの複数Port tab/windowがほぼ同時に保存すると、稀にlost update・delete intent消失が起こり得る。
消失したdelete intentはcloud削除が伝わらず項目が復活し得る（再削除で回復可能）。lost updateは検知されない。
発生には複数tabの同時保存が必要で、通常の手動操作より自動処理（Sync適用と別tab保存）が重なる場合が現実的。
選択肢評価: B（legacy限定補強）は線形化を回復できず、C（legacy先行IndexedDB化）は公開中ユーザーへの影響が最大。
独立工程として許容する補強は、他tab WAL pendingの`recovery-required`誤表示を一時状態として扱うUX修正のみ。
これはlost updateを解消しないため、本契約の安全条件には数えない。

## 4. 採用storage architecture

新Authorityの正本は1つのIndexedDBに置く。localStorageは正本を持たない（§11のsentinelのみ）。

DB名 `sound-cruise-port-authority-v<major>`（現在 major=1）。object store:

| store | key | 値（要点） |
|---|---|---|
| `records` | `[generation, logicalKey, version]` | 変更不可のraw値。version は正整数で単調増加 |
| `manifests` | `[generation, manifestId]` | 全`PORT_DATASET_KEYS`のversion表、delete intent表、親manifestId、digest |
| `head` | `generation` | `seq`、`manifestId`、`revision`、`operationId`、`controlEpoch` |
| `control` | `generation` | protocol、epoch、identity binding、fence evidence、suspended、fenceRevoked、identityInvalidated、state |
| `journal` | `migrationId` | B1-4 migration journal（version付き）、seal hash、binary manifest |
| `oplog` | `[generation, operationId]` | 結果（committed/rejected）、seq、manifestId、authorizedAt |
| `roots` | `[generation, rootId]` | GC保持root（Sync base、recovery snapshot、migration evidence） |

区別する版:
- DB名major: 互換を壊す物理変更でのみ増やす。
- IDB physical schema version（`open(name, v)`）: major内でstore/index追加だけ。
- Authority namespace generation: migrationごとのgeneration ID（key prefix）。
- repository protocol / writer protocol: head・controlに保存し、未知値はfail-closed。
- migration journal version: journal record内。

## 5. Commit（線形化点）

保存の正式成立は**1つのreadwrite transaction（scope: head, control, manifests, records, oplog）のcomplete**。

1. transaction外（async可）: hydrate済みsnapshotからprivate draft作成、writer実行、schema/forward/inventory検証、freeze。
2. transaction内（同期callbackのみ、IDB request以外をawaitしない）:
   `head`と`control`を取得 → control条件（state active、suspendedでない、fence有効、identity一致、protocol）
   → 対象keyのversion CAS（head manifestと操作baseの比較）→ operation-specific guard → delete intentを
   現在head manifestとmergeする純関数 → 変更keyだけ新record → 全key manifest → head(seq+1) → oplog
   → `transaction.commit()`。
3. `complete`で成功。`abort`/`error`は未成立、draftと操作IDを保持して拒否を返す。

complete前の状態はどの他transactionからも観測されない。IDBは範囲が重なるreadwrite transactionを作成順に直列化し、
後から作られたtransactionは完了済みtransactionの結果を観測する。cross-tabの正しさはこれだけに依存し、
Web Locksは無駄な競合を減らす補助に格下げする。

禁止: commit transaction内のlocalStorage書込み、別DB（Account / Sync / binary）への書込み、IDB以外のPromise待機、
cloud通信。WALはAuthority backendでは使わない（transactionが原子性を持つ）。

## 6. Authority control

suspend / resume / fence revoke / identity invalidation / active化 / recovery-requiredは`control`のreadwrite transactionで更新し、
epochを単調増加させる。dataset commitと同じstoreをscopeに含むため、両者はIDBで直列化される。
「変更が先ならpending saveは拒否、saveが先なら成功」はtransaction順で決まる。old prepared handleは保存した
`controlEpoch`/headがcommit時と一致しない限り拒否する。

## 7. Account coordination

区別: Account正本（`sound-cruise-sync-account` DB）、local Authority owner（controlのidentity binding）、
membership generation、Authority control epoch、cloud publish identity（Sync実行時のAccount/AppDevice）。
Account正本とAuthority DBは単一transactionにできない。全アプリが同じPort lockを取る前提も置かない。

採用（組合せ）:
1. **immutable identity binding**: bound generationのAccount ID・Account/membership generationは publish時に固定し、retagしない。
2. **invalidate-before-change**（協調mutator）: Port側のAccount切替は先にcontrol `identityInvalidated`をcommitしてから
   Account正本を変える。失敗時はAccountを変えない。
3. **after-change verification**（非協調mutator）: 他アプリがAccountを変えてもlocal保存は旧bindingのgenerationへ
   のみ入り、他Accountへ混入しない。Sync実行はSync Execution Lock内でAccount正本・AppDevice・bindingを照合し、
   不一致なら送信停止。Workerがmembership/generationを再認可する。
4. **explicit rebind**: 別Accountで使う場合は新generation（新migration）だけ。旧dataは削除・再帰属しない。

local-only（unbound）保存にAccountを要求しない。B1-6開始までに、shared Account coreへ
「切替はgeneration付きで公開し、Port Sync実行は毎回照合する」協調契約を追加する（L3）。

## 8. Pro

ProはAccount非依存のdevice資格。区別: observed local revocation、server-only revocation、expiry、
credential generation、device session、Account binding（Proには無い）。
- commit authorization point: §5手順2のtransaction内同期guard評価時刻。IDBはcommit完了時刻を公開せず、
  guardからcompleteまでの遅延に仕様上の上限はない。
- そのためguardは`deadline - now >= margin`（初期値30秒、wall・monotonicの両期限）を要求する。marginは工学的余裕であり
  原子性の保証ではない。guard後に期限が来ても、当該commitは「認可時点で有効だった」履歴として扱う。
- 観測済み失効（同realmの資格削除・epoch変化・reset・pending revoke）だけを拒否できる。別tabの失効は
  localStorage経由の観測に依存し、即時反映を保証しない。未通知server revokeはlocalで検知できない。
- cloud mutationはWorkerのD1 transaction fenceでPro/AppDevice/Account/epochを再認可する（不変更）。

## 9. Crash / Recovery

| 事象 | commit | 正本 | 再開 | export |
|---|---|---|---|---|
| transaction abort / QuotaExceededError | 未 | 旧head | 即時（容量確保・GC後retry） | 可 |
| connection loss / Safari suspension | 不明 | 再接続後head | oplogのoperationIdで判定、再接続不可ならrecovery-required | 再接続後 |
| versionchange | — | 既存head | 接続を閉じread-only、reload要求 | hydrate済み分 |
| browser crash / tab close | complete前は不明 | 再起動後head | oplogで判定、二重commitなし | 可 |
| response loss | 済/未をoplogで判定 | head | 同operationIdの再送はoplog一致で完了扱い | 可 |
| stale display cache | 影響なし | IDB | commit時CASが正本で判定 | 可 |
| missing record / corrupt manifest / invalid head | — | 不明 | recovery-required、legacy fallback禁止 | 残存record範囲 |
| interrupted migration | 未publish | journal | journal stateから再開、pointer未公開なら旧状態 | journal範囲 |
| interrupted binary copy | 未publish | journal binary manifest | 再copy/verify、参照commit前にbinary永続 | 可 |

論理的原子性（transactionの全か無か）と物理永続性を区別する。commit transactionは`durability:'strict'`を要求するが、
これは仕様上のhintで実装差があり、OS/媒体障害を含む永続性を保証しない（L5で実測）。

## 10. GC

mark-and-sweepを単独のreadwrite transactionで行う。rootは現在head、直近K個のhead（recovery）、journal参照、
`roots`（未ACK outboxのSync base、migration evidence）。参照不明・manifest破損があればGCを中止しrecovery-required。
経過時間だけでrecordを削除しない。GCはcommitと同じstoreをscopeに含み、確定済みheadの到達可能recordを削除し得ない。

## 11. Sentinel

localStorage `soundCruise.portAuthority.sentinel.v1`は「このpartitionに新Authorityが存在し得る」というfail-closed hint。
- publish前に書き、読み戻せなければpublishしない。sentinel単独でactiveを証明しない（正本はhead/control/journal）。
- boot: sentinelがある、またはAuthority DBにhead/journalがある場合はAuthority mode。IDBが開けない・不正なら
  recovery-required（legacyへsilent fallbackしない）。
- localStorageとIDBの永続化順序は保証されず、crashでsentinelだけ失われ得る。そのためAuthority対応buildは
  **IDB probeが成功し「Authority DBなし」を確認できた場合だけ**legacyへ書き込む。IDBが使えなければsentinelの有無に
  関係なくlegacyもread-only/export専用にする（fail-closed）。sentinelは早期判定の補助で、legacy書込みの許可根拠にしない。
- この規則はAuthority対応buildの出荷から適用し、L1時点の本番legacy動作は変えない。
- 旧buildはsentinelを読まずlegacyだけを使う（B1-L分離を維持、自動再importなし）。

## 12. Version upgrade

majorごとにDBを分ける。利点: 旧tabのopen接続が新majorのupgradeを妨げない。欠点: DB間移行が必要。
移行は旧DBの`control.state='superseded'`を先にcommit → 新DBへjournal経由でcopy・seal → 新DBでpublish。
途中crashはどちらもactiveでない状態になり、sentinelによりrecovery-required（legacyへ戻らない）。
major内のschema追加では`onversionchange`で接続を閉じread-onlyにする。`blocked`時はupgradeせず書込み停止。

## 13. Sync

local commit ≠ cloud queue ≠ cloud ACK。outboxはcommit transactionに含めず、Sync Execution Lock内で
headから状態ベースに導出する（operationIdは generation・head seq・record keyから決定）。
導出が失敗・中断しても次回headから再導出でき、変更は失われない。導出中のmanifestは`roots`へ登録してから使う。
full dataset / Account・AppDevice / Pro / operationId / shadow / conflict / delete intent / Worker fenceは維持。
Account不一致では旧generationのdataを送信しない。

## 14. Feature store

同期`readPortStore` / 非同期`writePortStore`を維持し、Repository backendで吸収する。feature storeごとのIDBは作らない。
Authority modeのreadはhydrate済みsnapshot cache。hydrate前は`authority-hydrating`のread-onlyで、legacy値を返さない。
cacheが古くてもcommit時CASが正本で判定し、staleは拒否→再hydrate。Port hostはfeature store初期化前にhydrateを待つ。

## 15. Proof obligations

| # | 不変条件 | 保証手段 | 状態 |
|---|---|---|---|
| 1 | committed datasetはfull snapshot | manifestが全keyのversionを持つ | 設計 |
| 2 | stale baseは成功しない | transaction内key version CAS | 設計 |
| 3 | suspend後の未確定saveは成功しない | control同transaction | 設計 |
| 4 | fence失効後の保存拒否 | 同上 | 設計 |
| 5 | Account Aの変更がBに混入しない | immutable binding＋Sync照合＋Worker | 設計（非協調mutatorはSync時のみ） |
| 6 | Pro-only保存が観測済み失効を無視しない | transaction内同期guard＋margin | 観測済みのみ。別tab即時反映は保証外 |
| 7 | delete intentが消失しない | intentをmanifestに含め現在headとmerge | 設計 |
| 8 | old prepared handleはcommitできない | head/controlEpoch一致要求 | 設計 |
| 9 | invalid pointerでlegacyにfallbackしない | IDB probe成功時のみlegacy書込み＋sentinel | 設計（旧buildはB1-L分離で対象外） |
| 10 | response lossで二重commitしない | oplog | 設計 |
| 11 | old legacy writerが新正本を変更しない | 物理分離（別DB） | 設計 |
| 12 | cloud publishは正式server認可を通る | Worker D1 fence（不変更） | 既存実証 |

「設計」はL2以降の実装とacceptanceで実証するまで未証明。

## 16. 実装工程とcommit境界

- **L2a** Authority store（schema、open/versionchange、fixture atomic commit/hydrate/CAS/oplog、fake IDB単体＋native integration）。独立Storeとして実装済、dormant。正式Repository接続/acceptanceはL2b。
- **L2b** Repository IDB backend（hydrate、CAS、manifest、head、oplog）。driverへ`indexeddb-authority`接続、
  Chrome acceptance（save/save・delete intent）PASSで commit/push。
- **L3** control・Operation Guard（margin）・Account coordination。control系acceptance PASSで commit/push。
- **L4** migration・recovery・GC・binary整合、failure injection。各段で commit/push。
- **L5** cross-process stress拡大、Safari/macOS・iPhone Safari・PWA実機、durability実測とIDB不能時fail-closedの実機確認。
  B1-6再開判定のgate。shared write解禁はL5とB1-6残工程の完了後。
