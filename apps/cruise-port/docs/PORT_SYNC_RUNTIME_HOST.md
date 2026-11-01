# Port Runtime & Integration Safety v1

2026-11-02追記（Port 1.24.25候補）：Account表示用の読取り確認だけを自動復元し、データSyncの明示開始は維持する。後段の「表示用summary network除去」は1.22.0導入時の履歴である。変更根拠と受入範囲は [自動確認の回帰調査](SYNC_CENTER_AUTO_CHECK_REGRESSION.md) を参照。

## B1-2 / B1-3（2026-10-12・現行）

Port1.22.3 / Studio0.26.1。[PORT_LOCAL_AUTHORITY](PORT_LOCAL_AUTHORITY.md)を参照。
通常owner activationはlegacy DB/wire。新client serviceのprepareは明示対応環境だけで、badge/read-onlyから呼ばない。
認証済みserver epochをprivate固定contextへ採用し、outbox retryで変えない。旧operationはB1-4まで保持。
Port authority Sync store factoryはbound Accountを確認し、generation別DBを明示生成する。legacy outbox copyなし。
新local provider/binary stagingと通常runtimeを自動接続しない。Account switchはownership transferではない。
reader→owner binding、Account generation、native Sync lock、operationId、dispose、limitsは維持。
production default legacy / enforcement OFF / Studio shared write OFF。以下は前工程の履歴。

## B1-1 Authority Contract（2026-10-11）

Port 1.22.2 / Studio 0.26.1 / Studio schemaVersion 1。
[Sync Writer Authority](../../../workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md)を新authority wire契約とする。
WorkerはACCEPT_COMPAT固定、legacy request許可。authority writerProtocol=2 / syncProtocol=1を受理できるが、
既存local Repository / writer protocolは1のまま。新wire送信は明示注入だけで、production clientはlegacy envelopeを維持。
D1はadditive metadataのみ。minimum fence OFF、local authority migration未実施、B1未解消。
Studio shared write OFF / PortDataHost.canWrite=false / old-build-unknownを維持する。
Worker deploy・production D1適用は未実施。次はB1-2のprotocol adoption / authority取得 / blocked UX。
以下の既存version・検証件数は前工程の履歴。

2026-10-11 / Port 1.22.1 / Studio 0.26.1。初期v1（Port 1.22.0）の実証履歴は下部に保持。

## Write Gate Prerequisites v1（現行）

[PORT_WRITE_READINESS](PORT_WRITE_READINESS.md)を現在のowner binding / Sync execution / operation gate契約とする。
B2はreader-first後のowner設定固定を解消。B3は新build同士のcross-context mutable Sync排他を解消。
B1は未解消。旧writerを強制排除できないため、Studio production shared writeはOFF、canWrite=false。

reader acquisitionはendpoint / canSync / Account・Sync resolver / lifecycleを確定しない。
最初のownerが正式設定をbindし、同じ正規化configと依存referenceだけreuseする。不一致はowner_config_mismatch。
最後のowner releaseでruntime/poll終了、readerだけではactivationを保持しない。

Port mutable SyncはAccount ID + appIdのnative Web Lockが必須。identityなしはsync_identity_required。
queueDiff / outbox / push selection / ACK / shadow / conflict / bootstrap / detach / runtimeState / provisionを同scopeで調停する。
lock順序はactivation → Sync execution → dataset。Repository lock中にnetworkを待たない。
無関係な呼出しをnested扱いせず、同Account/appだけ直列化。別Account/appは独立する。

Worker productionは不変更。test/theme-compat-harness.jsだけにsame-world Account IDと共有test lock managerを注入した。
Account・AppDevice・membership・Pro認可、CAS / operationId / tombstone / limitsのassertionを維持。
Port/shared1417、Worker592、Other apps85 PASS。native 2-tab Sync4ケース、Port browser18 routes + 20 + 10ケースPASS。
reader→ownerのbrowser実証は実Host + Runtime fixture、排他実証は実Runtime + native Web Locks/IDB。

Portの同期は画面表示から分離し、明示操作で開始する。Accountの切替・dispose後に古い処理を適用しない。
ローカル保存は引き続き[Port Dataset Repository](PORT_DATASET_REPOSITORY.md)を使う。

## Owner / consumer / singleton

`SoundCruisePortSync.createPortSyncController()`はPort hostのowner consumerを取得する。
同じJavaScript contextのPort hostは一つ。featureはruntimeを生成しない。
`runtime.identity = { accountId, appId: 'port', generation }`。Accountが変われば旧runtimeを終了してから新世代へ進む。
別appのruntime / DBをPort ownerが終了・使用することはない。

複数consumerは同じruntimeとensure Promiseを参照する。`release()` / `dispose()`はconsumer単位でidempotent。
最後のownerを解放するとruntime/pollを終了する。最後のconsumerを解放するとhostとAccount subscriptionを削除する。
read-only consumerだけではnetwork ownerを維持しない。

`createPortSyncReader()`はcached status / readLocalStatus / subscribe / identity / releaseのみを公開する。
ensure・mutable runtime・credential store・write APIを公開しない。Studio read-only Hostから利用する。
正式Pro statusは既存Pro gate / device-session serviceを独立に読む設計とし、Sync membershipやFeature Metadataから資格を推測しない。

## Account generation / AppDevice

Account DBは書込み開始前と成功後にgenerationを進め、subscriberへ無効化を通知する。
BroadcastChannelで他tabにも通知する。channelへ資格・Account payloadは送らない。

Account変更時はgeneration更新、旧runtime停止、AbortController中断、consumer runtime参照解除、cached statusをunknownへ変更する。
新Accountの初回provisionを自動実行しない。失敗したAccount書込みでも旧処理は無効のままとし、明示再開始で再読込する。

Port Sync DBは`appId + accountId`で分ける。Aのcredential / membership / shadow / outboxをBのDBとして使用しない。
AccountDevice資格はAccount DB、Port AppDevice資格はPort Sync DB。Studio AppDeviceは作らない。

旧appId-only DBは残す。明示ensureの時に、認証されたAccountのdevices応答の有効な`portAppDeviceIds`が
旧credentialのdevice IDと一致した場合だけ、credential / membership / pending provision / migration / cursor / outbox / shadow / conflictを引き継ぐ。
`legacyInspected`は引継ぎ終了後に記録する。失敗したensureはruntimeを終了し、再試行時に未完の検査をやり直す。
legacy sourceを削除せず、資格の存在だけで別Accountへ採用しない。
Accountごとのactivation Web Lockで新build間のprovisionと引継ぎを直列化する。

## Async fence / dispose

runtimeは各awaitの前後でlifetime / owner generationを検査する。dispose時に待機Promiseをrejectし、fetchをabortする。
bootstrap / pull / push / retry / conflict / credential lookup / lifecycle / poll / reconnectの古い結果は適用しない。
network結果とrepository publicationでは現在の保存済みAccount資格も読み直す。
repository apply / reference reconciliation / delete ackにはpublication guardを渡し、dataset lockを待つ間の世代変更も拒否する。

AccountClientは処理開始時のgenerationをcredential/pending lookupからnetwork・保存まで保持する。
自身が成功したAccount commitだけ、DBが返すgenerationを採用して後処理できる。
Account変更時にrequestをcancelし、timeoutとsubscriptionを解除する。
Account DBの古いwrite transaction、Port DBのguarded write transactionをabortする。
asset処理もruntime ownerを検査し、古い結果で新ownerのmetadata / statusを変更しない。

解除対象はfocus / visibility / online / offline / pagehide listener、retry timeout、poll interval、state / Account subscription、
fetch AbortController、待機Promise。UI conflict dialogとreturn-refresh binderにもdisposeを持たせる。

## Status / ensure / credential evidence

| API | 読取り | 起動・書込み |
|---|---|---|
| `getCachedStatus()` | memory cache（時刻・online状態によるstale投影） | DB open/create・network・ensure・provision・bootstrapなし |
| `subscribe()` | memoryの変更通知 | 初回ensure・DB/networkなし |
| `readLocalStatus()` / `status()` | Accountとaccount-scoped Sync DB | network / migration / ensure / poll開始なし |
| `ensure()` | Account資格、Port資格、migration等 | 明示activation。必要時にprovision / bootstrap / Sync / lifecycle開始 |
| `resume()` | active runtime | 初回ensure・provisionをしない |

unknownは未確認を表す。Standard、Accountなし、未接続と同一視しない。
`credentialExists` / `membershipKnown`は保存済み情報の存在。`connected`はその保存済み結び付けであり、認可ではない。
`credentialState`はunknown / stale / usable / revokedを分ける。
usableは現在のownerが成功したSync応答を得た場合だけ。60秒は表示のfreshness境界であり資格の有効期限ではない。
offlineまたは古いcacheはstaleへ投影し、tokenがあるだけで「同期済み」にしない。

Port AppDevice tokenに独自のexpiry / offline-valid期限を作らない。
正式Proのexpired / revoked / offline-valid（既存7日境界等）は別のdevice-session契約を維持する。
Pro / Account / AppDevice / backend authorizationを混同せず、backendが各requestで認可する。

起動時の自動ensure、Sync画面表示時のorchestrator.resumeとQA enrollment、表示用summary networkを除去。
「同期を開始・最新状態を確認」または既存の明示Account操作だけが必要処理を開始する。
表示時・focus復帰時のstatusはlocal/cacheのみ。Accountの回復・Join resumerは表示処理に接続しない。

## Port host lifecycle / offline

runtimeはSync機構、Port hostは起動時期のpolicyを持つ。Port runtimeの内部lifecycle bindingは無効にする。
visible/focus/online/60秒pollは、既にactiveなownerだけをresumeする。
hiddenでは新しいpoll/resume/retry wakeを抑制し、既に開始した処理は世代fence付きで終了できる。
offlineでは新しいSync/Account fetchを開始せず、local writeとoutboxを保持する。reconnectはactive ownerだけ再開する。
pagehideはowner runtimeを終了する。復帰後に未接続Accountを勝手にprovisionしない。

local repository commit、outboxへのqueue、cloud ACKは別の成功である。
offline中のlocal commitをcloud ACKとは扱わず、active ownerの再接続時にfull local snapshotから差分を計算する。

## Push chunk

全push経路（outbox / migration / conflict / bulk）は同じwire body境界を使う。
送信JSON全体（appId・mode・capabilitiesを含む）をTextEncoderで計測する。
各chunkは最大50 operations、serialized UTF-8 body最大262,144 bytes。
operationIdとwire operationは再送時に作り直さない。ACKのID・件数・重複を検証し、不完全応答で無限loopしない。

単独でも上限を超えるoperationは`operation_too_large`。outboxへterminalとして残して他の送信可能なoperationを送る。
無限retryやsilent dropをしない。conflict側も同じエラーを表示し、自動resumeを止める。
修正したpayloadの新しい操作は既存queueDiff契約で明示的に置換可能。asset本体はstructured opへ詰めない。

## 実証と保証境界

隔離Chromeの新build 2-tabで以下を実施。

- 同一baseのMetronome保存：A成功、B stale、unrelated data保持。
- native Web Lockを意図的に保持して同時保存をqueue：一つ成功、一つstale。
- Metronome/Gear並行保存：両方保持。
- migration-loaded draft対normal save、future schema guard。
- preset delete/edit：stale、silent resurrectionなし。
- Sync apply対local writer：同じlock、古いsnapshotを拒否。
- 故障注入したapply/rollback対queued writer：rollback完了後の新writeを保持。
- strict badgeのDB/network 0。
- native IndexedDBのAccount/app分離、transaction abort、遅延Account応答拒否、50-cycle lifecycle cleanup。

Nodeテストでもlate provision/bootstrap/pull/push/credential/conflict/pending lookup、recreate、consumer detach、
50-cycle、count49/50/51、262,143/262,144/262,145 bytes、多byte UTF-8、oversized、response-loss dedupeを検証する。
formal Pro（scp1/device session/revoke/expiry/offline）、Worker、Chord/Pitch/Fretboard/Rhythmも回帰対象。

**旧build tabは新Web LockやAccount hostへ参加しない。旧build coexistenceを解消済みとは扱わない。**
別JavaScript contextには独立runtimeがある。context間のdataset writeはrepository lock、activationは別lockで協調する。
今回のbrowser実証はChrome。Safari/PWAの実機確認や、Port/Studio同時起動のdirty draft維持はStudio接続工程で必要。
以下の初期v1検証時はStudio Metronome M2 memory facade、Version/Feature Metadata、domain schema、Workerを変更していない。
現行PrerequisitesではM2のnon-persistent load/external update境界を準備し、Worker test fixtureだけを更新した。

## 検証コマンド

```sh
node --test apps/cruise-port/*.test.mjs apps/shared/*.test.mjs apps/shared/sync-account/*.test.mjs apps/shared/sync-account/*.test.js
node --test workers/sound-cruise-sync/test/*.test.js
node --test apps/chord-cruise/tests/sync-*.test.js apps/pitch-cruise/sync/*.test.mjs apps/fretboard_cruise/sync/*.test.mjs apps/rhythm-cruise/sync/*.test.mjs
NODE_PATH=<bundled Playwright> node apps/cruise-port/tests/runtime-safety-browser.cjs
NODE_PATH=<bundled Playwright> node apps/cruise-port/tests/runtime-regression-browser.cjs
NODE_PATH=<bundled Playwright> node apps/cruise-port/tests/readiness-core-browser.cjs
```

browser serverはrepository rootのlocalhost:8766（検証後停止）。Studioの8765は不触。
Port 1.21.3→1.22.0は明示的な同期開始へのUI/動作変更によるminor bump。
Portのmodule importer graphとsharedの変更scriptを読む全HTMLのcache keyを更新する。
他4アプリの変更はshared scriptのHTML cache referenceのみ。domain code/versionは変更しない。
