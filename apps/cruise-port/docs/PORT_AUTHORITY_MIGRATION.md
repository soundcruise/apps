# Port Authority Migration & Cutover Engine v1 — B1-4

## B1-5 server fence接続契約（2026-10-12・現行）

Port1.22.5 / Studio0.26.1 / Studio schema1。[Workerの正式契約](../../../workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md)を参照。
D1同一batchのabort guard、Account+Portのprepared→paused→enforced、固定migrationId/operationIdとepoch一回更新、
paused snapshot checkpoint、asset prepare epochと公開時再照合、cleanup retention/claim、rollback downgrade拒否を実装。
AppDevice/Proの資格・失効・verifierをtransaction内でも確認し、CAS/tombstone/change log/aggregateの原子性を維持する。
HTTP入口だけの判定ではない。metadataのenforced表示だけを実効fenceの証明と扱わない。

B1-4の接続は隔離fixtureだけ。実ledger/evidenceと完全cloud snapshotのhash/sequenceを照合し、
同epoch/generation/checkpointのbranded ticketでready-to-publishまで検証する。本番engine/active pointerは接続しない。
checkpointはcutover時点で固定。cloudが進んだ場合は明示reconciliationを要し、旧outboxやasset operationをretagしない。
Port asset clientはauthority拒否を同runtimeに保持し、自動再試行・release/discard再送を停止する（1.22.5 patch）。

本番Worker ACCEPT_COMPAT / authority legacy / enforcement OFF、Studio shared write OFF / PortDataHost.canWrite=false。
Worker deploy・本番D1適用・Port migration/cutover・本番epoch/minimum変更なし。B1は未解消、shared write解禁不可。
次はB1-6 Port/Studio Authority Integration。operator認可・cleanup crash claim回収・local legacy writer停止・
reconciliation UX・実partition/rollback/deployのacceptance gateを別途満たす。rollback先はfence対応版限定。
B1-5実測: Worker672 + local workerd1 / Port・shared1583 / 他app85 / Studio機能314 PASS。
Studio315全件はcommit後のGit clean guard込みで確認する。ChromeはStudio97+Host10、Port既存6 suiteと新HTTP10項目がPASS。
以下のB1-1〜4記述と検証件数は各工程時点の履歴。

2026-10-12。Port 1.22.4 / Studio 0.26.1。保存domain schema不変更、Migration Journal schemaVersion=1。
**隔離実装専用。production default legacy / Worker ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / canWrite=false / B1未解消。**
本番migration、pointer公開、cutover、Worker deploy、D1適用は行わない。

## 構成とアクセス境界

- `port-migration-contract.mjs`: ownership、証拠のsecret拒否、18 record type、order/owner graphの純粋契約。
- `port-migration-candidate.mjs`: full candidate、raw救出、Sync provenance、binary manifest、コピー先実読戻し。
- `port-migration-planner.mjs`: L/R/B reconciliation、review binding、旧outbox分類、新operation候補。I/Oを持たない。
- `port-authority-migration.mjs`: journal、再開、seal、pointer、隔離active Repository、rescue。ネットワークAPIを持たない。
- `captureLegacyCandidate({provenance,...})`で明示的にB1-4へ入り、provenanceなしの既存B1-3 APIは維持する。

production boot/Hostからengineをimport・起動しない。scope生成には明示storage/locks/identity/source/binary等が必要。
Browserでは実際の`location.hostname`がloopbackでなければ拒否する。Nodeは注入依存のみで検証する。
WeakMapで発行したscope/fence capabilityはJSON、環境変数、query、localStorage、`{state:'enforced'}`では再現できない。
loopbackのテストページにも自動開始処理はない。production起動の既存legacy利用を変更しない。

## Candidate / 出自 / 救出

14 catalog keyと`syncDeletionIntent.v1`の15 keyについて、文字列または明示nullを収集する。
欠落プロパティを含むpartial inventoryは拒否。既存の未保存keyのnullと、inventoryの欠落は区別する。
Repository metadata/revision/key revision/generation/WALは別証拠として固定し、新稼働metadataへコピーしない。
Sync outbox/shadow/conflicts/metaとGear/My Apps/Practice binaryも別inventoryとする。

identityにはlegacy source namespace、storage partition、Port owner、appId、ownership、Account、datasetIdを含む。
`unbound-local`はAccount不要、Sync不存在を明示確認。`bound-account`は固定Account+dataset+app+partition+DB名を照合する。
旧appId-only DBは明示legacy device provenanceが必要。ログイン先A→Bでdataset ownerを書き換えない。
`pending-transfer`/`unknown-owner`は救出・review専用。DBのrecord identity、key一覧（取得時）、重複、記録内Accountも検証する。
`readMigrationSyncInventory`は既存DBの4 storeを同じread-only transactionで読む。不存在DBのupgradeをabortし、DBを生成しない。
metaはmembership/migrationState/datasetState/cursor/shadowKeys/lastSyncAtだけを取得。credential/token/secretをjournalへ保存しない。
疑わしいraw内のsecretも保存を拒否するため、その場合は入力をメモリに保持し、安全な救出の判断を求める。

raw・metadata・binary・Syncを前後比較し、sourceHashへidentity/manifest/records/delete intents/issuesを束縛する。
観測した変更は`legacy-changing`。double read一致は旧writer不存在を証明せず、ABAや複数媒体の原子的snapshotも証明しない。
source acknowledgementは候補の明示受入だけであり、全writer停止の証明ではない。本番の停止/barrier証明はB1-5依存。

future schema、unknown envelope、WAL、missing binary、owner不明等でも、取得できたraw/metadata/manifest/issuesをcandidateとjournalへ残す。
unsafe candidateはstage/seal不可。理解できるsingletonのunknown fieldは保持するが、round-tripできないrecordは救出専用。
全18 typeの型集合を既存adapterと照合し、full adapter validation、order、preset順序、attachment/menu owner参照を確認する。

## Journalと状態遷移

keyは` soundCruise.portMigration.v1.<migrationId> `（両端空白なし）。JSON packetにvalueとSHA-256を持つ。
hashは偶発破損の検出であり、悪意ある同一originコードに対する署名ではない。
1 migrationId / 1 generationにsourceHash、identity、raw candidate、binary/Sync出自、completed stages、review decisions、
cloud checkpoint、fixture fence evidence、operation mapping、旧→新delete generation mapping、sealed manifest、error/resumeFromを保存する。
Blob本体はbinary DBに分離。journal quota失敗で成功扱いしない。generation別dataset lockとpartition別migration lockを使う。

| 状態 | 入場・可能操作 | 次段階・中断復旧 | write capability |
|---|---|---|---|
| legacy | 通常Port既存起動。移行開始なし | 明示capture | 既存legacyだけ |
| candidate-captured | beginで固定sourceを永続化 | stage、同ID同source再開 | なし |
| staging | full validation、固定owner/source、generation所有を確認 | 途中dataset/binary/Syncを読戻し再検証してprepared | engine内部のみ |
| prepared | 全stage実体が一致 | 候補acknowledge、reconcile | prepared Repositoryはread-only |
| awaiting-cloud-fence | Account-bound、cloud同一Account | branded fence確認後reconcile。応答不明は停止・新証拠要求 | なし |
| reconciling | cloud/hash/出自検証済みplan | reviewまたはseal。未解決planはseal不可 | engine内部のみ |
| review-required | unsafe候補、競合、source/owner変化 | 同sourceの有効判断でreconcile。source変更は別migration | なし |
| ready-to-publish | 全検証とsealed manifest永続化 | 最終検証後pointer。marker未保存の中断はrecoverで修復 | なし |
| active | 最後にpointer公開済み | 再公開せず状態回収。新legacy差分はrescueのみ | pointer対象generationのみ |
| recovery-required | 破損・中断・I/O失敗 | sealedなら再検証、未sealなら同source restage。不正pointerは停止 | なし |

同migrationIdに別sourceHash/ownerを上書きしない。完了flagだけで再開しない。
prepared実体に予期しない変更があれば上書きせず停止。sealDraftに記録した内部途中書込みだけを同sourceから再開できる。
新operation IDはsealDraftとともに保存し、同plan/checkpoint再試行で固定する。plan変更時は旧mappingを再利用せず停止する。

## Binary / staging

kind/id、bytes SHA-256、size、MIME、metadata hash、owner参照、referenced/orphan/deleted状態を固定する。
metadataのid/MIME/byteSize/schema、画像kind/寸法、添付のpracticeId/fileName/kindも確認する。
cloud published参照はassetId/hashの明示bindingと対応する検証済みlocal bytesを必要とする。
同じhashの孤立assetを勝手にownerへ割り当てない。remote-only binaryの取得やowner変更は自動処理せずreviewで止める。

新Authorityへrawをコピーし、新generation専用Repository metadataを初期化する。
同identity同内容のbinaryは再利用。異内容はconflict。同内容のsource重複は1 objectへ整理する。
コピー後は新DBの`get`から取得した実bytesを再hashし、固定source manifestのhash/size/MIME/metadataと比較する。
既存verifyの自己整合だけを成功条件にしない。全owner manifestを再計算し、missing/wrong/partial/quota/中断/legacy mutationを拒否する。
orphanは隔離保持し、削除も自動owner追加もしない。成功済みstageを失敗時に削除しない。

bound Account用新Sync DBはAccount+Port+generationで分離。作成は明示stage時だけ。
準備/checkpoint metaは`sendEnabled:false`。旧outbox/shadow/conflictを新mutable queueへコピーしない。
queue空状態も検証する。新operationはjournalにだけ保存し、本番送信へ接続しない。

## Cloud planner / review / delete

L=verified local、R=authenticated complete cloud（注入fixture）、B=trusted shadowの場合だけ使用する。
cloudのAccount/app/dataset/checkpointとrecord identity/schema/revision、live payload hashを照合する。
shadowはDB出自、cursor/完全shadowKeys、revision/hash/operationId/tombstone、明示local base anchor、旧outbox base対応が必要。
不足時は2-wayに戻し、競合をreviewへ渡す。日時のlast-write-winsを行わない。

local-only、cloud-only、both-equal、local-newer、cloud-newer、divergent、deleted-locally、deleted-remotely、unknown/conflictを区別する。
missingだけでdeleteにしない。order/preset/attachment owner graph、binaryとownerが一致しないcloud asset参照は未解決として残す。
reviewはmigrationId+candidateHash+cloud checkpointへ束縛する。入力が変われば古い判断を拒否する。
選択後のrawを実adapterでmaterializeし、full validationとrecord round-trip一致を再検証する。

旧outboxは元operationId/baseRevision/protocol/epochを含めjournalの証拠として保持。
Account/datasetとrecord key/operationId/schema/payload内容+hash/deleted状態が一致した場合だけown-echoとする。
cloud最新IDが違う場合は過去成功を否定せず、証明不能としてreviewへ残す。outboxだけに残ったrecordも見落とさない。
明示確定したsemantic diffだけ、新operation候補を確定cloud revisionをbaseとして作る。
新operationには独立UUID、Account/generation/protocol/epoch、旧operation IDとの対応を保存する。

local removal、object delete intent、boolean intent、旧delete operation、cloud tombstone、ACK、recreateを区別する。
identity不明boolean intentとrecreate/旧intent衝突はlocal/remoteの単純選択でも解除せず、追加reviewが必要。
seal時にdelete intentを新authority用generationへ対応付け、旧ACKで新intentが解除されることを防ぐ。
旧generation/旧rawはcandidate evidenceへ残す。新tombstone operationも新generationを参照し、retryで変えない。
旧namespaceのACKやcleanupが新DBを操作する経路を作らない。

## Seal / publication / recovery

sealにはdataset/binary hash、Repository revision、ownership/source、checkpoint、operation hash、protocol、recovery journalを含む。
full valid/no unsafe unknown/no WAL、全binary読戻し、delete/outbox分類、Account同一、最新revision、recoverable journalを必須とする。
fixture fenceはtransactional admission + cutover barrier + epoch + checkpoint + generation + Accountを持つbranded capability。
単なるenforced read値を採用しない。応答喪失注入時は既存ticketを失効し、新しい確認証拠まで停止する。
再起動後のbound active writeにも現時点のfixture ticketが必要。失効ticketでwriteを続けない。
これは実Workerと接続したserver fenceの証明ではない。

sealed journal→sealed marker→最終再検証→単一localStorage pointer write→active journalの順で進む。
pointer前は旧namespaceが正本。pointer後は対象generationだけを読む。pointerにはmigrationId/generation/sealHash/ownership/Accountを持つ。
不正pointer、marker/metadata欠損、binary欠損ではrecovery-requiredとなりlegacyへfallbackしない。
古いprepared handleやpointerが変わったactive handleはread/writeを拒否する。

candidate capture、dataset copy、binary copy、Sync preparation、fence前/応答喪失後、seal前/途中、pointer直前/直後の中断を検証する。
pointer直後の中断は同pointerを確認してactiveを回収し、再公開しない。active後の正当なRepository編集をseal時revisionへ戻さない。
fence前のabandonは未公開stageを保持してwrite禁止にする。fence後/active後のlegacy rollbackは禁止。
緊急停止は`suspendWrites()`でwrite OFF、read/exportを維持する。
legacyの後続差分は初期candidateとの比較を別rescue candidateへ保存し、最新target revision付きreview/export候補とする。
自動再import、production選択的importは実装・実行しない。

## 検証と残る境界

開始実測はHEAD=origin/main=remote main=`87f85503e238214ae159f2ca04b30b95246af599`、main、tracked clean、staged空、ahead/behind 0/0。
既存untracked `.claude/` と `workers/sound-cruise-sync/node_modules/` は不触。
開始時Node: Port/shared1498、Worker/Account623、Other apps85、Studio315 PASS。

新規Node82件（`tests/authority-migration.test.mjs`）、native Chrome18項目（`tests/authority-migration-browser.cjs`）。
最終Port/shared1580、Worker/Account623、Other apps85、Studio機能314 PASS。Git clean guardを含むStudio315はcommit後・push前に実行する。
Chrome既存回帰: Port Standard18 routes＋Pro保存20（desktop1280/mobile393）、安全性10、B1-3 Authority26、実Worker handler/SQLite/R2 wire fixture PASS。
Studio Chrome: M1 29＋M2 24＋Editing Session23＋Keyboard21=97、read-only Host10。
新規nativeでは通常Port/Studio起動副作用0、stage/reload/resume、binary実読戻し/wrong/missing、invalid pointer、local-only/bound publication fixture、fence拒否、双方向legacy分離を確認する。
console/page error・application404なし。実Worker宛通信・本番data mutationなし。意図的な破損注入以外のデータ破壊なし。
テストの詳細結果とcommit/push実測は作業完了報告を参照する。

B1-4の完了は隔離基盤の完了であり、B1解消・本番cutover・Studio shared write許可ではない。
次はB1-5: 実Worker/D1のmutationと同一transactionでのadmission、cutover barrier、epoch/世代確認、応答喪失確認を実装・監査する。
その後B1-6で製品入口・運用/recovery UI・Studio action gateを判断する。remote binary取得/owner変更、曖昧delete/recreate、future schemaの判断UIも本番前の課題。
Safari/PWAの別partition、実ユーザーデータ、実サーバーfence、本番公開運用はこのfixture検証の対象外。

## 限定commit対象（81 files）

新実装4 module、既存capture API拡張、Node/Browser/fixture4 files、契約文書6 files。
残りはPort1.22.4のversion/cache参照の同期であり、Studioの2 importと共有Runtime testの1 importも含む。
既存untracked2件および他アプリ/Worker productionコードを含めない。

```text
apps/cruise-port/ai-support-client.js
apps/cruise-port/ai-support-ui.js
apps/cruise-port/app-version.js
apps/cruise-port/app-version.test.mjs
apps/cruise-port/cruise-port-capabilities.js
apps/cruise-port/cruise-port-edition.test.mjs
apps/cruise-port/docs/PORT_AUTHORITY_MIGRATION.md
apps/cruise-port/docs/PORT_LOCAL_AUTHORITY.md
apps/cruise-port/gear-category-store.js
apps/cruise-port/gear-list-store.js
apps/cruise-port/gear-photo-store.js
apps/cruise-port/gear-photo-workflow.js
apps/cruise-port/home-display.js
apps/cruise-port/index.html
apps/cruise-port/metronome-app.js
apps/cruise-port/metronome-presets-store.js
apps/cruise-port/metronome-store.js
apps/cruise-port/metronome-timing.js
apps/cruise-port/module-cache-keys.test.mjs
apps/cruise-port/my-apps-capabilities.js
apps/cruise-port/my-apps-capabilities.test.mjs
apps/cruise-port/my-apps-icon-store.js
apps/cruise-port/my-apps-icon-workflow.js
apps/cruise-port/my-apps-store.js
apps/cruise-port/port-account-join.js
apps/cruise-port/port-asset-sync.js
apps/cruise-port/port-authority-migration.mjs
apps/cruise-port/port-dataset-repository.test.mjs
apps/cruise-port/port-dataset-storage.js
apps/cruise-port/port-local-authority.mjs
apps/cruise-port/port-local-authority.test.mjs
apps/cruise-port/port-migration-candidate.mjs
apps/cruise-port/port-migration-contract.mjs
apps/cruise-port/port-migration-planner.mjs
apps/cruise-port/port-sync-local-validation.js
apps/cruise-port/practice-calendar-sp610.test.mjs
apps/cruise-port/practice-calendar-sp611.test.mjs
apps/cruise-port/practice-calendar-sp612.test.mjs
apps/cruise-port/practice-calendar-sp613.test.mjs
apps/cruise-port/practice-calendar-sp614.test.mjs
apps/cruise-port/practice-capabilities.js
apps/cruise-port/practice-capabilities.test.mjs
apps/cruise-port/practice-dataset-writes.js
apps/cruise-port/practice-menu-app-resolver.js
apps/cruise-port/practice-menu-app.js
apps/cruise-port/practice-menu-attachment-store.js
apps/cruise-port/practice-menu-calendar-store.js
apps/cruise-port/practice-menu-history-store.js
apps/cruise-port/practice-menu-pending-attachments.js
apps/cruise-port/practice-menu-progress-store.js
apps/cruise-port/practice-menu-sets-store.js
apps/cruise-port/practice-menu-sp615.test.mjs
apps/cruise-port/practice-menu-store.js
apps/cruise-port/practice-unsaved-edit.test.mjs
apps/cruise-port/pro-app-boot.js
apps/cruise-port/pro-readiness.test.mjs
apps/cruise-port/pro_9a3943176561/index.html
apps/cruise-port/settings-store.js
apps/cruise-port/sync-center-navigation.js
apps/cruise-port/sync-center-orchestrator.js
apps/cruise-port/sync-center-ui.js
apps/cruise-port/sync-pro-lock.js
apps/cruise-port/tests/authority-migration-browser.cjs
apps/cruise-port/tests/authority-migration.test.mjs
apps/cruise-port/tests/feature-help-browser.cjs
apps/cruise-port/tests/feature-tutorial-browser.cjs
apps/cruise-port/tests/migration-browser-fixture.html
apps/cruise-port/tests/migration-fixture.mjs
apps/cruise-port/tests/runtime-regression-browser.cjs
apps/cruise-port/tests/standard-readiness-browser.cjs
apps/cruise-port/tests/standard-readiness-revision-browser.cjs
apps/cruise-port/tool-capabilities.js
apps/cruise-port/tuner-app.js
apps/cruise-port/tuner-store.js
apps/cruise-studio/ROADMAP.md
apps/cruise-studio/ai-handoff/PROJECT_STATE.md
apps/cruise-studio/docs/PORT_DATA_HOST.md
apps/cruise-studio/js/core/component-metadata.mjs
apps/cruise-studio/js/port-data/metronome-facade.mjs
apps/shared/sync-account/multi-app-sync-runtime.test.mjs
workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md
```
