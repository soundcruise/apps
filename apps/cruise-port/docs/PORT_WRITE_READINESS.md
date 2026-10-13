# Port/shared Write Gate Prerequisites v1

## L3b-2 IndexedDB Authority Control（2026-10-13・現行）

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

## Operation Authorization Context v1（2026-10-12・現行）

Port1.22.8 / Studio0.26.2。[共通認可契約](OPERATION_COMMIT_GUARD.md)を参照。
async readinessだけで保存確定せず、同期readContextSync/readAuthSyncと正式Device Session proofを最終guardに渡す。
wall/monotonic期限、5分rollback、高水位、credential/generation/epoch/既知revoke、固定target/baseを照合する。
Standard BPM/list/apply/deleteはPro不要、unbound-localはAccount不要。Account-bound ownershipは独立条件。
UI badgeは認可に使わず、status-onlyはsource読取りだけ。cloudは既存server再認可を必要とする。
本番Port Pro Metronome保存へ接続。Studio Facadeはdormant、Host canWrite=false/shared write OFF。
以下の既存工程記述は履歴。B1-6未完了、cross-tab可視化・未通知server revokeの限界は共通契約に明記する。

## Local Authority final commit接続境界（2026-10-12・現行）

Port1.22.7 / Studio0.26.1。[Local Authority契約](PORT_LOCAL_AUTHORITY.md)を参照。
async readinessは準備段階の検証であり、そのbooleanだけでWALを確定しない。
active Authority Repositoryは同dataset lock内の同期source/epoch/fence/Account/CAS guardを最後に実行する。
停止/resume/revoke/identity changeも同じ共有controlに参加し、確定済み失効をpending writerへ強制する。

dormant FacadeのAccount/Pro/action/publication guardとproduction old-build-unknownを維持する。
本修正でFacadeやHostを製品writeへ接続せず、Studio canWrite=false/shared write OFF。
commit結果は旧contextのlocal save事実であり、新Accountのqueue/publish許可ではない。
remote fresh evidenceと正式Account sourceをlocal controlへ接続する作業はB1-6残工程。

## B1-5実装後のreadiness境界（2026-10-12・現行）

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
以下のB1-1〜4記述と検証件数は各工程時点の履歴。

## B1-2 / B1-3の現在地（2026-10-12）

Port1.22.3 / Studio0.26.1。[PORT_LOCAL_AUTHORITY](PORT_LOCAL_AUTHORITY.md)を新protocol / staging契約とする。
shared authority writerProtocol=2 / syncProtocol=1を参照。既存local writer/repository protocol1は維持。
new clientはprotocol-capable、明示準備で認証済みserver epochとAccount/app/generationを固定する。未確認epochを推測しない。
legacy outboxへfield後付けなし。protocol/epoch拒否は保持・非network retry、asset pendingも同契約。
新Authorityの準備はallWritersCompatibleのproduction解禁証拠ではない。B1未解消、production canWrite=false / old-build-unknownを維持。
prepared != active、enforcement OFF、default legacy。次はB1-4のauthority publication/reconciliation監査。
以下はPrerequisites v1の履歴。

## B1-1 Authority Contract（2026-10-11）

Port 1.22.2 / Studio 0.26.1 / Studio schemaVersion 1。
[Sync Writer Authority](../../../workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md)を新authority wire契約とする。
WorkerはACCEPT_COMPAT固定、legacy request許可。authority writerProtocol=2 / syncProtocol=1を受理できるが、
既存local Repository / writer protocolは1のまま。新wire送信は明示注入だけで、production clientはlegacy envelopeを維持。
D1はadditive metadataのみ。minimum fence OFF、local authority migration未実施、B1未解消。
Studio shared write OFF / PortDataHost.canWrite=false / old-build-unknownを維持する。
Worker deploy・production D1適用は未実施。次はB1-2のprotocol adoption / authority取得 / blocked UX。
以下の既存version・検証件数は前工程の履歴。

2026-10-11 / Port 1.22.1 / Studio 0.26.1 / Studio schemaVersion 1。

この工程はM3 writeの前提基盤。**Studio production shared writeはOFF、PortDataHost.canWrite=false**。
B2（reader-first設定固定）とB3（新buildの別context Sync排他）を修正した。
B1（旧writerの不存在を証明できない問題）は解消していない。unknown old writerを正式gateで封じ込める。
既存Port UIの保存は従来のPort Repository経由を維持し、Studioへwrite権限を開かない。

## Reader / owner

`createPortSyncReader()`はread-only acquisition。endpoint、canSync、credentials、activation/lifecycle設定を確定せず、ensure APIを持たない。
`createPortSyncController()`はowner acquisition。reader consumerの昇格APIは作らない。
最初のownerがendpoint・admission mode・canSync・Account/Sync resolver・fetch・device label・固定host lifecycle policyをbindする。
readerが先に取得していてもowner側の全依存を採用する。bindingは同context内で一度。

同じ正規化configと同じ依存referenceならreuse。不一致は`owner_config_mismatch`をthrowし、silent ignoreしない。
endpointは末尾slashを正規化して比較する。関数の意味的等価は推測せず、同じ関数referenceの再利用を要求する。
reader detachはowner runtimeを止めない。最後のowner releaseでruntime/pollを終了、最後のconsumer releaseでhostを破棄する。
readerだけ残ってもSync activationは維持しない。Account変更後は明示再開始が必要。

## Cross-context Sync Execution Lock

Portのmutable runtimeはnative Web Locks必須。identityはAccount ID + appIdで、資格/tokenをlock名に含めない。
安定keyは`sound-cruise:sync-execution:v1:<encoded accountId>:<appId>`。
Account IDなしは`sync_identity_required`、native lockなしは`sync_locks_unavailable`。status/data読取りにlockやidentityを強制しない。
その他の既存アプリruntimeは既存挙動を維持し、明示`executionCoordination`時だけこの排他へ参加する。

対象はqueueDiffのpending read→operation作成→put、outbox選択・更新・retry、push request/ACK/delete ACK、
shadow、conflict/解決、response-loss own-echo、bootstrap/complete、detach、runtimeState保存とownerのprovision/legacy adoption。
同じAccount/appの新contextは同pending baseから重複logical operationを作らない。同じmutationのoperationIdを保持する。
別Account/appは別lock、別DBで独立。AのoutboxをBへ移送しない。

順序は **activation → Sync execution → Port dataset**。逆順に待たない。
Repository lockはlocal publication/rollbackだけ。network await中は保持しない。
Sync execution lockは、古いremote/pending baseのまま別contextが進まないよう、対象pipelineのnetwork/ACKまで保持する。
既存network制限（request20秒、large body idle20秒・total15分・32MiB上限）を維持する。
lockの強制stealやtimeout成功扱いはしない。将来lock期間を短縮する場合は、phase間のbase再検査とoperationId契約を先に設計する。

nested helperはprivate WeakMapのlexical receiver scopeを共有する。同runtimeの無関係な外部呼出しは別waiterとして直列化する。
共有の「lock held」booleanによるreentrant bypassは使わない。owner wrapperもreceiverを保つ。
frozen IDB storeには別viewを使い、EventTarget native methodsは元receiverへbindする。
legacy fire-and-forget runtimeState transactionも完了を待ってからscopeを終了する。
待機後にAccount generation/lifetimeを再確認し、disposeで待機・networkを中断する。

## Protocol / old-build policy

appVersion、repositoryProtocol、writerProtocol、domain schemaは別。
repositoryProtocol=1、writerProtocol=1。未知protocol/recovery/future schemaはwrite不可。
旧buildはこのlock/protocolを無視できるため、heartbeat成功・無応答・timeout・一定時間不在を安全証明にしない。
今回はwriter advertisement/heartbeatを新規導入しない。既存Account/repository invalidationは資格やdatasetをchannelへ送らない。

Studioのproduction Hostは`allWritersCompatible=false`を固定し、intent・query・storage/debug flagでは変更できない。
fixtureExecutorとcompatible writer evidenceは隔離testへの明示dependency injectionのみ。UIへ接続しない。
将来の解禁にはauthoritative namespace migration、backend writer protocol admission、強制可能なversion fence等のauthority boundaryが必要。
今回Worker productionは変更しない。PWA/Safariの別storage partitionはsame-originだけで共有と判断せず、
`storage-partition-mismatch`またはseparate-device相当を扱う。実Safari shared writeは次工程。

## Action policy / readiness

状態はread-only、blocked、recovery-required、isolated-compatible内のready-local。
Hostのget系はcacheのみ。checkは明示local検査で、ensure/provision/bootstrap/network/owner取得なし。
checking専用表示は追加しない。ready-localはcloud成功や製品統合完了を意味しない。

| action / capability | 隔離compatible環境での操作条件 | Studio production |
|---|---|---|
| saveBpm / canSaveBpm | Standard可、Account不要 | false |
| saveAdvanced / canSaveAdvanced | Pro操作時検証 | false |
| listPresets / canListPresets | read-only、Standard可 | true |
| applyPreset / canApplyPreset | Standard effective（BPMのみ） | false |
| createPreset / canCreatePreset | Pro操作時検証 | false |
| deletePreset / canDeletePreset | Standard可、delete intent | false |
| queueSync / canQueueSync | Pro + Account/AppDevice/membership/activation | false |
| pushCloud / canPushCloud | 上記 + online | false |

理由はold-build-unknown、locks-unavailable、protocol-mismatch、forward-schema、conflict、
repository-recovery-required、storage-partition-mismatch、account-required、membership-required、activation-required、offline等。
capability表示はauthorizationではない。

## Operation / publish guard

operationId、action、Host/Account generation、Account ID、repository epoch/base、writer protocol、Pro proofをprivateに固定。
操作開始・lock取得後・commit直前・commit後のpublish準備で再検査する。
今工程はoutbox/pushへFacadeを接続しない。将来の登録前・push前も同じ固定contextを再検査すること。
commit前のAccount/世代変更は拒否。commit後に条件が変われば保存事実を残し、local-saved / sync-unconfirmed、publish=false。

`createProOperationResolver()`は表示用cached badgeとは別。既存operational device-session clientのvalidateを使い、
既存offline receiptの期限・credential identity・generation・known revocationを確認する。
固定proofがlock待機中に期限切れ/世代変更となれば拒否。未観測server revokeを検知できるとは扱わない。
cached readinessはresolverを呼ばず、production old-build拒否時も呼ばない。資格をmetadataから推測しない。

## Dormant PortMetronomeFacade / M2

Studioの`js/port-data/metronome-facade.mjs`はUI未接続。
production load/listはHostのread modelを返し、write APIはgateで拒否する。M2 Controllerのstoreへそのまま差し替えるadapterではない。
fixtureではprivate WeakMapのopaque baseTokenをraw values/key revisions/epoch/generationへ束縛する。
UIのrevision hashはRepository CASに使わない。settings/presets tokenの世代を一致させ、対象keyのCASで保存する。
通常applyはBPMのみ。`advanced:true`のfull applyはsaveAdvancedとしてfresh Pro proofを要求する。
Facadeはpartial settings snapshotをSyncへ送らず、outbox APIも持たない。将来はRepository commit後のdataset変更通知だけをownerへ渡す。

M2 loadはread/schema detection/migration projection/validation/effectiveまで。永続writeをしない。
従来memory storeだけ`memoryOnly=true`かつ`persistProjectionOnLoad=true`でmemory migration結果を保持できる。
明示saveがmigrationの永続化境界。実Port接続はreadiness/CAS/forward/operation guardを通す次工程。
receiveExternalUpdateはcleanならadopt、dirty/saving/IMEならincoming pendingとしてdraft/baseを保持する。
自身のsave ACKだけは自身のbaseを進め、無関係なincomingを捨てない。
inspectIncoming / keepLocal / adoptLatest / reapplyOnLatestを準備。reapplyはold base→draft差分をlatestへ適用し、
同field・meter/rhythm/accents依存衝突を自動解決しない。明示saveなしに永続化しない。
Port通知とM2/audioの接続はまだ行わず、再生snapshotの外部更新方針はM3で別途実装する。

## Test fixture / validation

Worker production/認証・AppDevice・membership・Pro・CAS・operationId・tombstone・limitsは不変更。
Worker testだけ`test/theme-compat-harness.js`を更新し、same-world Account IDと共有test lock managerを注入。
helperは`apps/shared/sync-account/test-fixtures/web-locks.mjs`。productionからimportしない。
Port setsとPro denialのmutable fixtureにもidentity/lockを注入。read-only fixtureには不要なidentityを追加しない。

前回Worker30 FAILはidentity不足29件＋未開始Syncでconflict不生成1件（A）。
Port/shared14 FAILはmutable fixture不足6件（A）、version/cache期待値8件（B）。C/Dなし。
subsetはWorker40、Port/shared68 PASS。追加missing identity/identified mutable/read-only regressionは正式production条件を検証する。
共有runtimeの全HTML参照をcache v30へ更新し、wiring testも整合。他アプリの本体・versionは不変更。

| 検証 | 最終結果 |
|---|---:|
| Studio Node（dirty中のGit検査1件を除く） | 314 PASS |
| Studio Node（commit後Git検査を含む予定） | 315件、commit後に最終確認 |
| Port/shared | 1417 PASS |
| Worker/Account | 592 PASS |
| Other apps | 85 PASS |
| Studio Chrome既存 | 97 PASS |
| Studio read-only Host | 10 cases PASS、cached DB/network/owner/ensure/provision/bootstrap/push/pull 0 |
| native Write Gate 2-tab | 4 cases PASS、別Account独立・reader→owner（Runtime fixture）を含む |
| Port Standard desktop/mobile | 18 routes PASS、4 Theme/Pro gate |
| Port Pro保存desktop/mobile | 20 cases PASS、Metronome/preset CRUD/Settings/Account status等 |
| Port native Repository/IDB | 10 cases PASS |

Studio focus fixtureは初期小節選択のanimation frameを待ってからfocusし、元のfocus保持assertionを維持した。
Project JSON8077 bytes / Arrangement JSON26991 bytesはappVersionだけ0.26.1。
MIDI813 bytes SHA-256 `5c0dcbe39eaada6775119aa8b39e6e6ce56712b8fe7ac04ea992c11ed260d023`一致。
紙面DOM、Pre-DTM preview、4 Theme紙面不変、print chrome除外、保存中/audio中printを確認。
console/application404/unhandled failureなし。実Safari/OS IME/聴感/実プリンターは未検証。

次工程は強制可能なB1 authority boundaryの設計・独立監査。その後M3 Phase Dでmeter/rhythm/4 sounds/volume/accentsのrenderer parity、
正式Pro/Account接続、preset CRUD UI、mobile/Safari回帰を実施する。Prerequisites完了をshared write解禁やM3完成と扱わない。
