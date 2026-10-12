# Sync Writer Authority — B1-5

## Migration / Cutover Generation Race修正（2026-10-12・現行）

B1-6停止時の再現4件を保持し、変更前4 FAIL → 修正後4 PASSを確認した。
旧ledgerはAccount/membershipのIDとlocal Authority generationを保存していたが、
**server Account generation / membership generationを保存・比較していなかった**。
paused後に同じIDのgenerationが変わってもenforced / epoch2 / fresh evidenceへ進む原因だった。

### 固定するidentityとtransaction guard

0037はledgerへnullableな`account_generation` / `membership_generation`だけをadditiveに追加する。
開始preparedで、isolated Account capabilityに対応するactiveなserver Account/membership rowから
両generationを別々に取得し、既存Account/app/membership/user/migrationId/local generationへ固定する。
clientのgeneration、login時刻、同じmigrationIdだけをidentityの根拠にしない。
prepared→pausedでも固定値を保持し、paused→enforcedで再取得した値へ置換しない。

preflight SELECTに加え、ledger INSERT/UPDATE trigger、membershipのauthority/epoch/minimum更新trigger、
同batch終端のassertionで現在のAccount/membership identity・state・generationを照合する。
不一致なら`RAISE(ABORT,'b15_migration_generation_stale')`で**transition全体をrollback**する。
pausedが先に確定済みならpaused / base epoch / minimum protocolを保持する。record/asset変更は行わない。
通常Port mutationも既存の共通fence evaluatorでpreflightと実mutation batch内に世代比較を持つ。
read成功を将来のmutation許可と扱わず、AppDevice/Pro/verifier/revocation/CASの既存guardも維持する。

D1はbatchを一transactionとして直列化する。外部Account更新がcommit前なら拒否、commit後なら
過去のcommitは成立済みだが次のretry/read/mutationを拒否する。
SQLiteでbatch内へgeneration更新を挿入した故障注入も、membership公開triggerにより全体rollbackする。
これは別HTTP transactionがD1 batch途中へinterleaveするという主張ではない。

### Error / retry / recovery / evidence

既存client taxonomyとの互換性を保ち、`code=dataset_authority_unavailable`（503）、
internal `reason=migration_generation_stale`へ変換する。SQL trigger名も同reasonに変換する。
credential terminal / CAS conflict / dataset_epoch_stale / 通常network errorとは区別する。
既存HTTP authority readはcodeを返し、internal reasonは公開しない。503というstatusだけで自動retryせず、
既存のauthority拒否処理で停止・review/recovery-requiredにする。

同migrationId / phase operationIdの通常retry、concurrent retry、response-loss回収、正常returnにも
現在世代のtransaction assertionを実行する。世代変更後に旧成功rowをfresh成功として返さない。
世代変更前にcommit済みのphase / operationId / checkpoint / epoch事実は破棄しない。
scoped `recover`はその履歴へ`authorizationFresh:false` / `recoveryRequired:true` / reasonを付けて返す。
これは再認可ではなく、retag・二重epoch更新・legacyへの降格・barrier解除はしない。
旧generationのjournal / pending data / evidenceを保持し、authorized recoveryはB1-6の別gateとする。

`readAuthorityEvidence`は一SQLでcurrent Account/membershipとledgerをjoinし、両generationと
membership/user identityを照合する。返すfenceはAccount ID/generation、membership ID/generation、appId、
migrationId、local generation、epoch、state、pause operationのbarrierId、checkpoint、実効guardを含む。
再作成membershipに同じgenerationを付けても旧ledgerを継承できない。
0037前のledgerは両columnがNULLのまま。現在値からbackfillしない。履歴を保持しread/updateをfail-closedにする。
migrationの再実行はWranglerの`d1_migrations`を使う。生ALTER SQLの二重実行は対象外。

B1-4との接続は隔離fixtureで、server evidence/checkpoint拒否をengineへ渡し、
recovery-required / journal・source保持 / pointer未公開を検証した。
**静的なisolated ticket自体がremote revokeを検知するものではない**。製品のfresh evidence再取得、
operator認可、Account切替、Port/Studio同時ブラウザー接続はB1-6未完了の残工程。
Asset Cleanupの固定claim identity/generation/epoch・R2予約・永久tombstone契約は変更しない。

### 検証と公開境界

- 元のgeneration再現4 PASS、追加generation/mutation/engine 26 PASS、additive migration 3 PASS。
- Worker/Account 760 PASS、Port/shared 1588 PASS、Other apps Sync85 / 全範囲186 PASS。
- Studio作業差分中314 PASS（tracked clean guardはcommit後に別途含めて315件確認）。
- native workerd/D1/R2 8 PASS（既存4＋世代競合4）、元のAsset Cleanup race 2 PASS。
- ローカルWrangler全37 migration適用成功、再実行`No migrations to apply`。
- Chrome: Port18経路＋26ケース、Studio Host10ケース、Metronome M1/M2 53 PASS。console/404/unhandled errorなし。

Port **1.22.6** / Studio **0.26.1 / schema1**据え置き。両アプリの実コード変更なし。
production **ACCEPT_COMPAT / legacy / enforcement OFF / shared write OFF / canWrite=false**。
Worker deploy、本番D1適用、production cutover、active pointer公開なし。
本修正は限定generation raceの解消。**B1-6未完了 / B1未解消 / shared write解禁不可**。
以下の各工程の記述・件数は履歴として保持する。

## Asset cleanup / reference race修正（2026-10-12・現行）

詳細は[Asset Lifecycle契約](ASSET_LIFECYCLE.md)。B1-6停止時の再現2件を保持して修正した。
0036のD1 triggerにより、全Port record INSERT/UPDATEのassetId参照とcleanup予約が相互排他となる。
legacy ACCEPT_COMPATでも有効なasset safetyであり、writerProtocol/epoch enforcementを有効化するものではない。
参照が先ならclaim不可、claimが先なら後続参照は409（既存enforced guardの先行拒否は従来code）。

追加ledgerへclaim UUID、Account/membership/userと各generation/epoch、object key/version/hashを固定する。
deleting / recovery-required / deletedを保持し、R2結果不明でも期限解除しない。
固定identity・現在世代・live refsを再照合した同claimだけretryする。R2成功後のfinalize batchで
asset deletedとAccount claim解除を確定する。永久tombstoneによりID/key再利用と古いcleanupによる新object削除を防ぐ。
B1-5のidentity不明な旧claim、世代不一致は自動回復せず保持する。遅いuploadは未公開orphanとして封じ込める。

B1-5 Account/AppDevice/Pro/epoch/CAS/dedupe/50 operations/256KiBの契約は維持。
ledger付きAccountのcleanup保留、cutoverと未完了claimの排他も維持。
通常Port/Studio Hostへのmigration/fence統合は進めていない。

Port **1.22.6**（隔離migration inventoryのcleanup証拠保持・stage拒否とcache同期）、Studio **0.26.1 / schema1**。
production **ACCEPT_COMPAT / legacy / enforcement OFF / shared write OFF / canWrite=false**。
Worker deploy、本番0036適用、本番cutoverなし。B1-6未完了、B1未解消。
以下のB1-5節は当時の履歴。cleanup claim解除・復旧については本節とAsset Lifecycle契約を優先する。

## B1-5 Worker Transaction Fence + Cutover Barrier（2026-10-12・現行）

Port **1.22.5**（asset authority拒否後の再試行停止・cache整合のpatch）、Studio **0.26.1 / schema1**。
本番は **ACCEPT_COMPAT / authority legacy / enforcement OFF**。Studio shared write OFF / PortDataHost.canWrite=false。
本番Worker deploy、D1適用、epoch/minimum変更、Port migration、cutover、active pointer公開は実施しない。
以下のB1-1〜4節は履歴。現在のtransaction/evidence契約は本節を優先する。

### Transaction / identity / admission

`writer-admission.js`がwireを検証し、`writer-fence.js`の同じSQL evaluatorをHTTP preflightと
`writerMutationDatabase`のbatch先頭で実行する。後者はassertion tableへのINSERTであり、拒否codeを
0035のtriggerが`RAISE(ABORT, 'b15_<code>')`する。単なるSELECT結果の無視ではない。
既存record CAS / operationId・operationHash dedupeを変更せず、guard → record/tombstone → change log →
dataset count/manifest/sequence → assertion削除を一つのD1 batchに置く。単独runもbatch化する。
rejectまたは後続SQL失敗で**そのoperationのtransaction全体**がrollbackする。

pushは従来どおり最大50 operationの各operation transaction。HTTP push全体を新しい一括transactionとはしない。
barrier前に成立したoperationはcheckpointへ含まれ、barrier後は旧requestの残りのoperationを拒否する。
HTTP応答を失った既成立operationは同じoperationIdで回収する。旧epochの一括再送は自動実行しない。

Account・Port membership・managed mapping・AppDevice/userの現在stateをtransaction内で照合する。
AppDeviceの認証済みverifierと、既存Pro検証後のid/verifierをrequest内だけに固定し、transactionで再照合する。
Pro scope、revocation、generation、90日idle、bound lease/unbound期限もDB実行時刻で確認する。
資格自体をwire versionで代替しない。proof/verifierをresponse、journal、diagnosticsへ出さない。
認証時last-seen/Account activityは既存の認証metadataであり、dataset transactionとは別。

production入口`src/index.js`はpolicy/cutover controllerを注入しない。`createIsolatedWriterPolicy(accountId)`は
WeakMap brandedのコードcapability。query/env/localStorage/JSON/QA資格では生成できない。
controllerに公開HTTP routeはない。通常clientはminimum/state/epochを変更できない。
他AccountやChord/Pitch/Fretboard/Rhythmのadmissionは変更しない。単一device leaseにはしない。

### State / barrier / recovery

| state | mutation | read/export | migration / assets |
|---|---|---|---|
| legacy | compat。隔離policyはidentityを再検証 | 既存認証で許可 | 新authorityの許可ではない |
| prepared | 旧authorityのmutationを継続、ledgerへ対象を固定 | 同上 | Port local prepared journalとは別。新authority write未許可 |
| paused | 全対象data mutation拒否 | 同上 | 安定snapshotを取得。R2公開・unreference・removal報告も停止 |
| enforced | writer2 / sync1 / exact epoch / min2、現在資格とCAS必須 | writer version不一致だけでは拒否しない | prepare時epoch一致が必要 |

`authority-cutover.js`の隔離controllerはAccount+appId=port、membership、sync user、migrationId、
local generation、phase別operationIdを0035 ledgerへ固定する。legacy→prepared→paused→enforcedだけ。
prepare時点のbase_epochからtarget_epoch=base+1を一度だけ決め、enforcedでmin2/target epochを同じbatchへ反映する。
login/device追加/通常Syncでは増やさない。同epochで複数deviceを許可する。
同migrationId・同phase operationIdの再送は既存結果を返す。異なるID/generation/操作の再利用は拒否する。
後続phaseへ進んだ後の古いphase再送も現在ledgerを返し、過去stateへ戻さない。

paused後にprocessが落ちてもpausedのまま。`recover(accountId,migrationId)`で回収し、同じcapabilityで明示resumeする。
DB途中失敗はledgerとmembershipをともにrollback。enforced後のresponse lossでもepochを重ねて増やさない。
ledger作成後はdefault ACCEPT_COMPATに戻した**本版のコード**でもledgerが実効guardを有効に保つ。
ledger削除、phase逆行、membershipのepoch/minimum/state downgradeはtriggerで拒否する。
これはB1-4以前のWorkerへ戻してよいという意味ではない。rollbackは**B1-5 guard対応版限定**。
裸の`authority_state=enforced`だけでは実効fence evidenceにならず、隔離ENFORCEでは拒否する。

### Asset / R2 / cleanup inventory

prepareはAccount/user/device/operation/fingerprintにwriterProtocol/syncProtocol/expected epoch/admitted epochを固定。
content uploadはR2前に元operationを照合し、R2完了後のuploaded更新にも同じepoch条件をtransaction内で適用する。
commitはR2 headとD1 available更新の両側で検証し、元prepareを新epochにretagできない。
owner practiceの存在もavailable更新のSQL条件で再確認する。旧prepareのR2 objectは未公開のまま保持する。
record payload内のassetId参照は同Account/membershipのavailable/unreferenced assetに限定する（guard有効時）。
既に公開済みの旧assetは新epochでも継続利用できる。未公開objectをrecord参照だけで接続することはできない。

unreference（clientのrelease/discard queueの送信先）、tombstone、removal-safetyはすべて同一guardを通る。
local release/discardは既存metadataを維持し、authorityエラー後は同runtimeのasset mutationを再送しない。
新contextへの復帰にはB1-6で明示reconciliationが必要。pending operationId/protocol/epochを書き換えない。

R2とD1の原子transactionは主張しない。scheduled R2 cleanupはD1にAccount claimを取ってから削除し、
cutover prepareはclaimがあれば拒否する。ledger作成後はpreparedを含め、そのAccountのasset自動回収を保留する。
R2結果不明・crash時はclaimを残し、期限切れで勝手に解除しない。B1-6前にoperator確認・回収手順を整える。
対象Portのchange/tombstone retention削除もSQL時点でledgerを再確認して保留する。
独立したAccount削除/recovery/device管理の認可は維持し、fenceから管理権を付与しない。

### Read evidence / B1-4 connection

認証済み`GET /v1/sync/writer-authority?appId=port`はprimary sessionで同じmembership/ledgerを結合する。
既存のaccountId/appId/writeEpoch/minimumWriterProtocol/stateは維持し、ledgerが整合するときだけ`fence`を追加:

- version:1 / guard:d1-transaction-v1 / transactionalAdmission:true
- cutoverBarrier:false（prepared）またはtrue（paused/enforced）、barrierState
- migrationId / generation / epoch
- checkpoint（enforcedで確定）: cursor（decimal change sequence、Sync APIの署名cursorとは別）、lastChangeSeq、
  manifestHash、recordCount（live record）、schemaVersion
- recovery: authorized-resume-required（paused）またはnull

checkpointはpaused中の全record type snapshotから算出し、enforce batchに永続化する。checkpointはcutover時点で不変。
以後の新writerでcloudが進めば、snapshot再確認の不一致を無視せずreconciliationを再評価する。
capabilityで絞ったsnapshotのmanifestを全type checkpointと比較しない。完全なPort inventoryが必要。
B1-4 bridgeテストは実ledger evidence + 再取得snapshotのhash/sequenceを照合し、隔離branded ticketへ束縛して
ready-to-publishまで進める。本番engine/Hostへticket発行を接続せず、pointer公開もしない。
readされたenforcedという文字列、clientの自己申告、単なるprotocol2はmutation証拠ではない。

### Error / retry / limits

writer_protocol_required/outdated/unsupportedは409、epoch欠落/不一致はdataset_epoch_stale(409)、
paused/不整合はdataset_authority_unavailable(503)。すべて通常retry対象外。
資格失効はinvalid_credential/account_membership_required/pro_*、CASは既存conflict、DB/network障害は既存server_error等に分離。
既存outbox/shadow/conflicts/own-echo保護を維持。epoch更新は無条件retryではなく最新authorityと明示reconciliation後。
bootstrapの既存datasetは無変更readとして許可し、新規INSERTはguard必須。migration completeもguard必須。
pushのserialized body **256KiB**、最大**50 operations**を維持。protocol/epochもbody sizeに含む。

### Additive schema / validation / B1-6 gate

0034は変更なし。0035はassertion table/abort triggers、cutover ledger/monotonic triggers、cleanup claimsの追加だけ。
既存table再作成・record削除なし。新ledgerは空で、本番authorityを有効化しない。本番には未適用。
将来deployでは0035を先に適用できることを別gateで確認する。古いWorkerへの無条件rollbackは禁止。

D1 batchの失敗時rollbackは[Cloudflare公式契約](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)を確認し、
SQLite fixtureに加え、project-local Miniflare/workerdの実D1 bindingでもabort trigger/partial rollback/競合/同時再送を検証。
ローカル実ランタイムの検証であり、本番環境の実測やactivationを意味しない。
検証コマンドは`node --test test/*.test.js`、追加実runtimeは`node --test test/transaction-fence-workerd.mjs`。
ChromeはPort既存6 suite + transaction-fence-browser.cjs、Studio既存5 suiteを使用。

2026-10-12実測: 開始HEAD/origin/main/remote main=50039f1dd8278f39fb745b66ac9672ac3282b709、tracked clean、staged空、0/0。
baselineはWorker623 / Port・shared1580 / 他app85 / Studio315 PASS。
変更後Worker **672 PASS**（B1-5追加49）、別実行workerd/D1 **1 PASS**、Port・shared **1583 PASS**（asset retry追加3）、他app **85 PASS**。
Studio機能 **314 PASS**。Git clean guard込み全315件はcommit後/push前に確認する。
Chrome: Port desktop/mobile **18 routes**、Pro保存 **20**、runtime safety **10**、local authority **26**、
writer HTTP **12 requests**、migration **18**、B1-5 HTTP **10 checks**。Studio **97 + Host10 PASS**。
console/page error・予期しない404は0。実プリンター、実Safari/PWA partitionの本番acceptanceは別工程。
Worker production entryのESM bundle生成も成功（deployなし）。`git diff --check`は正常。

B1-5は実装と隔離実証の完了を判定する。**B1全体は未解消、shared write解禁不可**。
次はB1-6 Port/Studio Authority Integration。production operator認可/cleanup crash回収、full snapshotの製品接続、
local legacy writer停止とrescue、reconciliation UX、実partitionのacceptance、対応Worker限定rollback/deploy手順を確認してから
別途production enforcement/cutover/shared writeを判断する。

## B1-4隔離Migration Engine（2026-10-12・履歴）

Port1.22.4 / Studio0.26.1。[Migration契約](../../apps/cruise-port/docs/PORT_AUTHORITY_MIGRATION.md)。
Port側にjournal/reconciliation/seal/publication fixtureを追加。新operationはjournalのみ、production送信なし。
fixtureのtransactional admission/barrier/epoch/checkpoint/generation証拠を実Workerの安全性証明と扱わない。
Worker productionコード/D1 schemaは変更なし、ACCEPT_COMPAT/enforcement OFF。本番deploy・D1適用・cutoverなし。
B1未解消。次はB1-5のmutationと同一transactionのadmissionとcutover barrier。以下は前工程の履歴。

## B1-2 + B1-3 Authority Preparation（2026-10-12・履歴）

Port1.22.3 / Studio0.26.1 / schema1。[Local Authority契約](../../apps/cruise-port/docs/PORT_LOCAL_AUTHORITY.md)を参照。
数値正本はshared writer-authority.mjs。新clientは明示actionで認証済みGET /v1/sync/writer-authorityからserver epochを取得可能。
通常production clientはlegacy wire、protocol-capableとauthority-activeを分離。preparedの固定epoch/contextはoperationへ保存する。
legacy outboxへ後付けせず、retryでprotocol/epoch/operationIdを変更しない。authority rejectはblockedとして保持し、通常retry/cleanupから分離。
Worker追加変更はread-only authority routeとrollout read分類のみ。Pro/AppDevice/membership/Origin認可を維持。
D1追加schemaなし、ACCEPT_COMPAT不変更、minimum/state/epoch enforcement OFF。Worker deploy / production D1適用なし。
新Port dataset/marker/WAL/delete intent/Sync DB/binaryをstaging領域へ分離し、production defaultはlegacy。
B1未解消、Studio shared write OFF / canWrite=false。次はB1-4 reconcile/controlled publicationの設計・独立監査。
以下はB1-1の契約・検証履歴。B1-2/B1-3の現在地は上記リンクを優先。

2026-10-11。Port 1.22.2 / Studio 0.26.1 / Studio schemaVersion 1。
B1-1は互換基盤だけ。B1-L/B1-C未解消、Studio shared write OFF / canWrite=false。
Worker deploy・production D1 migrationはこの工程に含めない。

## 独立したversion

| 契約 | 値 / 意味 |
|---|---|
| appVersion | 商品表示・診断だけ。admissionに使わない |
| repositoryProtocol | 1。既存local Repository / WAL / CAS |
| local writerProtocol | 1。既存Write Readinessの協調契約。変更しない |
| authority writerProtocol | 2。新authority対応wire契約。1も旧対応値として受理 |
| syncProtocol | 1。任意authority fieldを含むwire契約。API path /v1とは独立 |
| dataset schema | 全既存domain / Sync / Studio schemaを維持 |
| writeEpoch | membershipのauthority世代。appVersionでもlogin回数でもない |

数値の正本は `apps/shared/sync-account/writer-authority.mjs`。
Port / Studioでauthority protocol数値を別定義せず、Feature Metadataにも格納しない。
writerProtocol=2は認証資格でもlocal移行完了証拠でもない。Repository協調、identity固定、operationId保持、
期待epochを扱えること、stale epochでpublishを停止すること、旧outboxを無条件送信しないことを要求する。
ENFORCE参加には、さらにB1-3/4の新local authorityとmigration完了が必須。
B1-1対応clientがlegacy storageを使っているだけでreadyとは判定しない。

## Wire / deploy互換

mutation JSONの任意top-level field: writerProtocol / syncProtocol / expectedWriteEpoch。
field欠落はlegacy。存在時は正のsafe integerのみ。null・文字列・小数・0は禁止。
writerProtocolは1/2、syncProtocolは1を理解する。それより大きい値はunsupported。
個々のfieldはACCEPT_COMPATでは任意。missing epochを現在epochに置換しない。
read requestのqueryを変更しない。snapshot / changes / asset downloadは従来の認証・Pro・capability規則。
binary PUTでは X-Sound-Cruise-Writer-Protocol / X-Sound-Cruise-Sync-Protocol /
X-Sound-Cruise-Write-Epochを使い、CORS allowlistをcontent uploadだけに追加。

B1-1 production clientは従来のenvelopeのまま。Worker未deployなので自動送信すると旧Workerに拒否される。
新wireは `createWriterWireContext({expectedWriteEpoch?})` を明示生成し、MultiAppSyncRuntimeの
`writerWireContext`へ注入する対応環境でのみ使用。PortAssetSyncは同じowner contextを利用する。
localStorage / URL / debug flagから有効化しない。B1-2で認証済みauthority取得とadoptionを正式接続する。
operation epochを自動更新するAPIはない。unknown epochは省略し、推測値を送らない。

## D1 additive metadata

0034_add_writer_authority.sqlはALTER TABLE ADD COLUMNのみ。既存table再作成・recordコピー・削除なし。
sync_account_memberships（Account + app一意）に追加:

- minimum_writer_protocol INTEGER NOT NULL DEFAULT 0
- write_epoch INTEGER NOT NULL DEFAULT 1
- authority_state TEXT NOT NULL DEFAULT 'legacy'（legacy / prepared / enforced / paused）
- authority_updated_at INTEGER NOT NULL DEFAULT 0

既存行・新規行とも同じdefault。Account/membership generationやdataset initializing/readyは流用しない。
ログイン・device追加・Account切替でepochを増やさない。明示cutoverだけで変更する将来契約。
asset operationにはnullable writer_protocol / sync_protocol / expected_write_epoch / admitted_write_epochを追加。
prepare時にrequest値と観測server epochを別々に固定する。旧requestの欠落を新protocolへ偽装しない。
同じprepareの再送で保存済みmetadataを書き換えない。B1-5のpublish判定にこの元epochを使用する。

migrationはD1 migration ledgerによる一回適用。再度migrations applyを行っても適用済みをskipする。
SQLiteのALTER ADD COLUMNをSQLだけで繰り返してよいとは扱わない。raw SQL再実行は禁止。
local testは旧schema/既存dataからの適用、default、ledger再実行、data非損失を確認する。

## Admissionとmutation inventory

writer-admission.jsのmodeはコード定数ACCEPT_COMPAT。env・request・metadataでENFORCEへ切替不可。
minimum / epoch / authority_stateによる拒否はB1-5まで実装・有効化しない。
厳密field validation、認証済みidentityからのmembership照合、metadata構造検査を追加する。
既存standalone appの契約は維持。新Port fieldでmembership欠落を正当化することはできない。
protocolはAccount / AppDevice / membership / Pro / CAS / hash / operationIdを代替しない。

| 入口 | hook / data mutation |
|---|---|
| push sync / migration | 全operation、upsert / tombstone / changes / dataset metadata |
| bootstrap | dataset作成。既存dataset分岐も同じfield契約を検証 |
| migration/complete | ready状態 / manifest更新 |
| asset prepare | quota / asset / operation metadataの既存batch |
| asset content PUT | R2前のadmission、D1 uploaded更新 |
| asset commit | available遷移 |
| asset unreference | 参照解除batch |
| removal-safety | 既存4 appの報告。Port runtimeは従来どおり送らない |

管理者のAccount削除/recovery/device管理とscheduled asset cleanupは独立した認可・lifecycle。
新writer admissionで管理機能の利用権を付与しない。

## Transaction内fenceの準備

admission済みrepositoryはwriterMutationDatabaseを通す。既存の複数statement batchを分割せず、
同一D1 batch先頭で現在のmembership authorityをSELECTする。単独runも同じbatchに包む。
B1-1のSELECTは観測点であってfenceではない。結果不一致を拒否したと主張しない。
B1-5ではこのtransaction内の位置を、現在epoch/minimum/stateを検査して不成立時に全体をabortする
SQL guardへ変更し、TOCTOU・全mutation・dedupe前後を検証する。HTTPチェックだけでENFORCEしない。
既存record/change/dataset batchのatomicityは維持。SQL失敗時は全batch rollback。
D1とR2は一transactionではない。B1-5ではprepare epochを使用し、遅い旧uploadをpublishしない。
B1-1はR2/D1 cutover fenceの完成ではない。

## Error / retry

| code | HTTP | 復帰 |
|---|---|---|
| writer_protocol_invalid / sync_protocol_invalid / dataset_epoch_invalid | 400 | request修正 |
| writer_protocol_unsupported / sync_protocol_unsupported | 409 | 対応clientへ更新 |
| writer_protocol_required / writer_protocol_outdated | 409、B1-5用予約 | 更新・adoption |
| dataset_epoch_stale | 409、B1-5用予約 | authority再確認後、明示rebase/migration |
| dataset_authority_unavailable | 503 | authorityの確認・復旧 |

これらは通常network retryにもcredential terminalにも入れない。outboxをterminalError付きで保持し、
自動backoffを起動しない。local保存・draft・credentialを削除しない。変更payloadでもauthority blockedの
旧operationをqueueDiffで自動破棄しない。旧context/epochのoutboxはlegacy_outbox_needs_migrationで保持する。
operationId/hashにprotocolを混ぜない。同じmutationのresponse-loss retryは同じID・wire contextを維持。
B1-2でblocked表示・明示復帰・認証済みauthority readを接続する。旧clientへ新UIを強制できるとは扱わない。
256KiB計測はprotocol field込みのJSON全体。50 operations上限も維持する。

## Rollout / rollback

1. B1-1: Worker understands protocol, old allowed。D1 additive準備。新wireは注入のみ。
2. B1-2: 対応Worker公開後にnew client protocol adoption。authority read / UX。
3. B1-3: Port-owned新local authority（Sync DB / binaryも検討）。
4. B1-4: migration / cutover / legacy救出。dual-writeや自動再importなし。
5. B1-5: server minimum/epoch enforcement。transaction fence・asset publish境界を検証して明示有効化。
6. B1-6: Port / Studio製品統合とaction別解禁。

将来deploy順はproduction D1 additive migration → Worker互換版 → client adoption。
今回はいずれのproduction操作もしない。pushによる静的配信でもclientはlegacy wireを維持する。
B1-1は旧Workerへ戻しても新fieldを送るclientを先に停止すれば互換を維持できる。columnは削除しない。
B1-5後はfence対応版へだけrollbackし、minimum/epochを下げない。必要時write停止＋read/exportを維持する。
B1-L未解消なので本工程をB1解消・shared write解禁と扱わない。

## 今回の実測検証

開始時 HEAD / origin/main / remote main = `928fe0b9d5edf85e3816ed94dc744c59d3e5640c`、
ahead/behind 0/0、tracked clean、staged空。既存untracked 2ディレクトリは対象外。

| suite | baseline | B1-1 |
|---|---:|---:|
| Port/shared | 1417 | 1432 PASS |
| Worker/Account（test/*.test.js） | 592 | 618 PASS |
| Other apps | 85 | 85 PASS |
| Studio | 315 | 機能314 PASS、残るGit clean guard 1件はcommit直後・push前に実行 |

Studioの既存clean guardは `git diff HEAD` が空であることを要求するため、承認済み変更の未commit中は成立しない。
テストを改変せず、precommitではその1件だけ除外し、commit後に無除外の315件を実行する。

Port browser: Standard 18 route checks、Pro 20 cases、通信fixture PASS。
通信fixtureは実Worker handler + SQLite + memory R2を使用し、snapshot/bootstrap/complete/push再送/
asset prepare/PUT/commit/download/unreference/legacy pushを確認（外部APIなし）。
Studio browser: M1/M2/settings/Structure/Pre-DTM/keyboard計97 tests、read-only Host 10 cases PASS。
Worker dry-run bundle PASS（deployなし）。Wranglerの `/tmp` ローカルD1へ0034まで適用成功、
同じDBへの再適用は `No migrations to apply`。本番D1へ接続していない。
SQL rollback、旧schemaからのデータ保持、旧/new membership defaultはSQLite回帰でも確認。

再現コマンド（repository root、Workerは同ディレクトリで実行）:

```sh
node --test apps/cruise-port/*.test.mjs apps/shared/*.test.mjs apps/shared/sync-account/*.test.mjs apps/shared/sync-account/*.test.js
node --test apps/cruise-studio/tests/*.test.mjs
# workers/sound-cruise-sync 内
node --test test/*.test.js
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir /tmp/b11-worker-bundle
node node_modules/wrangler/bin/wrangler.js d1 migrations apply SYNC_DB --local --persist-to /tmp/b11-d1-migration-check
```

変更file一覧（個別stage対象）。Portの多数fileは1.22.2へのimport/cache参照更新。
他3アプリのHTMLはshared runtime cache v31のみ。Studio codeはPort参照のみ。

- `apps/cruise-port/ai-support-client.js`
- `apps/cruise-port/ai-support-ui.js`
- `apps/cruise-port/app-version.js`
- `apps/cruise-port/app-version.test.mjs`
- `apps/cruise-port/cruise-port-capabilities.js`
- `apps/cruise-port/cruise-port-edition.test.mjs`
- `apps/cruise-port/docs/PORT_SYNC_RUNTIME_HOST.md`
- `apps/cruise-port/docs/PORT_WRITE_READINESS.md`
- `apps/cruise-port/gear-category-store.js`
- `apps/cruise-port/gear-list-store.js`
- `apps/cruise-port/gear-photo-store.js`
- `apps/cruise-port/gear-photo-workflow.js`
- `apps/cruise-port/home-display.js`
- `apps/cruise-port/index.html`
- `apps/cruise-port/metronome-app.js`
- `apps/cruise-port/metronome-presets-store.js`
- `apps/cruise-port/metronome-store.js`
- `apps/cruise-port/metronome-timing.js`
- `apps/cruise-port/module-cache-keys.test.mjs`
- `apps/cruise-port/my-apps-capabilities.js`
- `apps/cruise-port/my-apps-capabilities.test.mjs`
- `apps/cruise-port/my-apps-icon-store.js`
- `apps/cruise-port/my-apps-icon-workflow.js`
- `apps/cruise-port/my-apps-store.js`
- `apps/cruise-port/port-account-join.js`
- `apps/cruise-port/port-asset-sync.js`
- `apps/cruise-port/port-asset-sync.test.mjs`
- `apps/cruise-port/port-dataset-repository.test.mjs`
- `apps/cruise-port/port-dataset-storage.js`
- `apps/cruise-port/port-sync-local-validation.js`
- `apps/cruise-port/practice-calendar-sp610.test.mjs`
- `apps/cruise-port/practice-calendar-sp611.test.mjs`
- `apps/cruise-port/practice-calendar-sp612.test.mjs`
- `apps/cruise-port/practice-calendar-sp613.test.mjs`
- `apps/cruise-port/practice-calendar-sp614.test.mjs`
- `apps/cruise-port/practice-capabilities.js`
- `apps/cruise-port/practice-capabilities.test.mjs`
- `apps/cruise-port/practice-dataset-writes.js`
- `apps/cruise-port/practice-menu-app-resolver.js`
- `apps/cruise-port/practice-menu-app.js`
- `apps/cruise-port/practice-menu-attachment-store.js`
- `apps/cruise-port/practice-menu-calendar-store.js`
- `apps/cruise-port/practice-menu-history-store.js`
- `apps/cruise-port/practice-menu-pending-attachments.js`
- `apps/cruise-port/practice-menu-progress-store.js`
- `apps/cruise-port/practice-menu-sets-store.js`
- `apps/cruise-port/practice-menu-sp615.test.mjs`
- `apps/cruise-port/practice-menu-store.js`
- `apps/cruise-port/practice-unsaved-edit.test.mjs`
- `apps/cruise-port/pro-app-boot.js`
- `apps/cruise-port/pro-readiness.test.mjs`
- `apps/cruise-port/pro_9a3943176561/index.html`
- `apps/cruise-port/settings-store.js`
- `apps/cruise-port/sync-center-navigation.js`
- `apps/cruise-port/sync-center-orchestrator.js`
- `apps/cruise-port/sync-center-ui.js`
- `apps/cruise-port/sync-pro-lock.js`
- `apps/cruise-port/tests/feature-help-browser.cjs`
- `apps/cruise-port/tests/feature-tutorial-browser.cjs`
- `apps/cruise-port/tests/runtime-regression-browser.cjs`
- `apps/cruise-port/tests/standard-readiness-browser.cjs`
- `apps/cruise-port/tests/standard-readiness-revision-browser.cjs`
- `apps/cruise-port/tests/writer-authority-browser.cjs`
- `apps/cruise-port/tool-capabilities.js`
- `apps/cruise-port/tuner-app.js`
- `apps/cruise-port/tuner-store.js`
- `apps/cruise-studio/ROADMAP.md`
- `apps/cruise-studio/ai-handoff/PROJECT_STATE.md`
- `apps/cruise-studio/docs/PORT_DATA_HOST.md`
- `apps/cruise-studio/js/core/component-metadata.mjs`
- `apps/cruise-studio/js/port-data/metronome-facade.mjs`
- `apps/fretboard_cruise/pro_a9f4k7q2m8z/index.html`
- `apps/pitch-cruise/pro_x9v7q2m8/index.html`
- `apps/rhythm-cruise/pro_r4m8k7n2q9x/index.html`
- `apps/shared/sync-account/multi-app-sync-runtime.js`
- `apps/shared/sync-account/multi-app-sync-runtime.test.mjs`
- `apps/shared/sync-account/multi-app-sync-wiring.test.mjs`
- `apps/shared/sync-account/writer-authority.mjs`
- `workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md`
- `workers/sound-cruise-sync/migrations/0034_add_writer_authority.sql`
- `workers/sound-cruise-sync/src/app.js`
- `workers/sound-cruise-sync/src/asset-database.js`
- `workers/sound-cruise-sync/src/validation.js`
- `workers/sound-cruise-sync/src/writer-admission.js`
- `workers/sound-cruise-sync/test/ai-diagnostics.test.js`
- `workers/sound-cruise-sync/test/sqlite-d1.js`
- `workers/sound-cruise-sync/test/sync-target-naming.test.js`
- `workers/sound-cruise-sync/test/writer-authority-fixture.js`
- `workers/sound-cruise-sync/test/writer-authority.test.js`
