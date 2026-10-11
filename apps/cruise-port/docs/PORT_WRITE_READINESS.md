# Port/shared Write Gate Prerequisites v1

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
