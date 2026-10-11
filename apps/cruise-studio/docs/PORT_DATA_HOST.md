# Studio Read-only Port Data Host v1

## B1-4隔離Migration Engine（2026-10-12・現行）

Port1.22.4 / Studio0.26.1 / Studio schema1。[Migration契約](../../cruise-port/docs/PORT_AUTHORITY_MIGRATION.md)。
Portのjournal/stage/reconcile/seal/recoveryを隔離検証。Hostはproduction legacy read-only、canWrite=false、cached副作用0を維持する。
Studio本体変更はPort import cache参照だけ。M1/M2/Structure/Editing Session/Pre-DTMを移行engineへ接続しない。
B1未解消、shared write OFF。B1-5の実効server fence後に製品gateを再判定する。以下は前工程の履歴。

## B1-2 / B1-3 Authority Preparation（2026-10-12）

Port1.22.3 / Studio0.26.1 / project schema1。[Local Authority契約](../../cruise-port/docs/PORT_LOCAL_AUTHORITY.md)を参照。
Port-owned prepared dataset/Sync DB/binaryは隔離fixtureで実証したが、production readerはlegacy read modelを維持。
HostのcanWrite=false、old-build-unknown、cached side-effect 0は不変。preparedだけでStudio writeを解禁しない。
metadataにprotocol/authority stateを追加しない。M2/Structure/audio/renderer/preset UIへ今回の変更を接続しない。
B1未解消、enforcement OFF、production migration/cutoverなし。以下は前工程の履歴。

## B1-1 Authority Contract（2026-10-11）

Port 1.22.2 / Studio 0.26.1 / Studio schemaVersion 1。
[Sync Writer Authority](../../../workers/sound-cruise-sync/SYNC_WRITER_AUTHORITY.md)を新authority wire契約とする。
WorkerはACCEPT_COMPAT固定、legacy request許可。authority writerProtocol=2 / syncProtocol=1を受理できるが、
既存local Repository / writer protocolは1のまま。新wire送信は明示注入だけで、production clientはlegacy envelopeを維持。
D1はadditive metadataのみ。minimum fence OFF、local authority migration未実施、B1未解消。
Studio shared write OFF / PortDataHost.canWrite=false / old-build-unknownを維持する。
Worker deploy・production D1適用は未実施。次はB1-2のprotocol adoption / authority取得 / blocked UX。
以下の既存version・検証件数は前工程の履歴。

2026-10-11 / Studio 0.26.1 / project schemaVersion 1 / Port 1.22.1。

## Write Gate Prerequisites v1（現行）

[Port Write Readiness](../../cruise-port/docs/PORT_WRITE_READINESS.md)を正式gate契約とする。
B2 reader-first→owner bindingとB3新buildの別context Sync排他は修正済み。
B1は未解消。unknown old writerを排除できないため、production shared write OFF、canWrite=falseを固定する。
writerProtocol / repositoryProtocolは1。metadata capabilityはauthorizationではない。

getCapabilities / getWriteReadinessはcacheのみ。checkWriteReadinessは明示local inspectionでowner取得やensureをしない。
enableLocalWrites / activateSyncは明示userIntentを要求するが、production old-build-unknownで拒否する。
URL / storage / debug flagで解禁しない。cached readinessからformal Pro resolverを呼ばない。

dormant PortMetronomeFacadeのload/listはHost read model。M2 storeへそのまま差し替えられるadapterではない。
production write拒否、隔離fixtureだけprivate opaque baseToken / Repository CAS / operation guardを実証。
outbox APIやpartial Sync snapshotを作らず、UI / M2 / audioへwrite接続しない。

最終回帰はStudio Node314 PASS（Git clean検査1件はcommit後確認）、Port/shared1417、Worker592、Other apps85 PASS。
Studio Chrome97とHost10ケースPASS。cached DB/network/ensure/owner/provision/bootstrap/push/pullはすべて0。
Project/ArrangementはappVersion0.26.1だけ変更、MIDI813 bytesのSHAは下記と一致。紙面DOM/print条件も維持。
初期v1のPDF raster hashは履歴であり、今回の新PDF pixel比較結果として扱わない。

## 所有と境界

UI hostはCruise Studio、ownerAppはcruise-port、dataOwner / syncOwnerはport。
`js/port-data/host.mjs`がread modelとgeneration、`connection.mjs`がPort repository / runtime consumer / local DB / Pro receiptへ接続する。
`panel.mjs`が既存Tool paneへ表示する。Audio・Structure・M2 Controllerへの参照やsave接続は持たない。

Hostは`canRead=true`、`canWrite=false`、`getCachedStatus()`、`readLocalStatus()`、`subscribe()`、`dispose()`と上記readiness / explicit intent APIを公開する。
commit / save / ensure / provision / bootstrap / push / pull / conflict resolution / preset CRUDは公開しない。
M2のMemoryStore → Settings Controller → Audio runtimeは従来どおり独立。Port設定・presetのapplyも今回は実装しない。

## 起動とstatus

初期Host・Tool表示・cached status・subscriptionはDBを開かず、保存データも資格も読まず、runtimeを作らない。
最初は未確認。「ローカル保存値を確認」の明示操作で初めて定義moduleをloadし、Port hostのread-only consumerへ登録する。
既存globalの定義を上書きしない。`new MultiAppSyncRuntime`は呼ばない。
Port ownerが同contextに存在すれば、そのcached status / identityを参照する。別tabのruntime instanceは別物。

local inspectionはAccount DB・account-scoped Port Sync DBをreadonly transactionで読む。
DBが存在しなければupgradeをabortしてschemaを作らない。DBロック等の利用不能はunavailableへ。
Port ownerのstatusイベントを発火しないため、同contextのasset handler等を読取りから起動しない。
資格・outbox・conflictのraw値は接続境界の内部だけで使用し、featureへはstatusと件数から導出した表示状態だけを渡す。

Account: unknown / no-account-known / account-known / membership-known / unavailable。
Sync: unknown / synced / pending / conflict / error。資格があるだけではsyncedにしない。
active ownerが持つfreshなusableの証拠がないlocal cacheはunknown。未確認は未接続やStandardと同義ではない。
Account設定・Sync開始・競合解決はPortへの小さなリンクのみ。Studioに操作画面を移植しない。

## Formal Proの読取り

shared `pro-device-session.js`へ既存検証を使う`createReadOnlyClient()`を追加した。
正式scp1の形式・generationと、保存済み非extractable device key / AES-GCM receipt / session metadata /
7日offline境界 / clock rollbackを既存allowanceと同じ規則で検査する。
readonly modeは鍵やsessionを作らず、receiptのhigh-waterや期限切れflagsを永続化せず、refresh / network関数も公開しない。
同じreader内のhigh-water / expired観測はmemoryに保持し、時刻を戻しただけで有効表示へ復帰させない。
有効期限に達した表示は所有するtimeoutで再評価し、disposeでtimeoutを解除する。
これは表示証拠であり、backend authorizationや書込資格を発行するAPIではない。

状態: unknown / standard / cached-valid / expired / stale / unavailable。
未検証のtokenだけではProを表示しない。network検証しないのでonline-validとは表示しない。
現行Portは失効時にauthを除去し、永続cacheに「失効」と「未取得」の原因を常に残す契約ではない。
したがってStudioが未観測のrevokeを断定しない。authなしはローカルStandard、判定不能はunknown/unavailable。
保存済みreceiptの期限切れ・clock rollbackは区別する。ProとAccount資格は別の契約であり、Account membershipでProを推測しない。

## Dataset / Metronome / presets

PortDatasetRepositoryのshared read lockからfull raw snapshotを取得し、Host接続境界内だけに保持する。
Port側のforward guardが拒否する場合、同じ読取りで取得済みのrawから表示可能な既知fieldだけを投影する。
pending WAL / protocol mismatch等の安全に読めない状態はunavailable。migration saveや独自migrationはしない。
M2に既存のPort source parity付きschemaを使い、non-persisted legacy viewを作る。

公開read modelはSHA-256化したopaque repository revision、repository generation、runtime generation、account identity、
settings schema state、saved BPM、known effective settings、preset stable ID / name / order / known settingsだけ。
raw revisionに全datasetが含まれるPort契約をそのままUIへ漏らさない。未知fieldはrawに保持し、再serializeして保存しない。
Standard effective設定でもraw Pro値やpresetを削除しない。formal cached Proが検証できた場合のみPro effective投影を行う。
未対応preset envelopeではID/name/BPMの閲覧に留め、current形式への降格はしない。

## 通知 / generation / dispose

Account generation / storage event / Port local-data / remote-apply / runtime statusを購読する。
変更時はgenerationを進め、古いconsumerをdetach、stateをunknownへ戻し、既に明示読取りを開始したHostだけ再読取りする。
request sequence・Account generation・保存済みAccount資格の前後一致で遅い結果を拒否する。
旧snapshot / Pro / Sync結果を新Accountの結果として再利用しない。

Port datasetの物理保存先はorigin共通で、Account別のdatasetではない。
Account切替後にも同じlocal rawが存在することはあり得る。それを新Accountのcloudデータと認定しない。
新generationで現在のorigin-local値を読み直すだけであり、Account切替によるdataset移行・消去はPort側の責務。

外部更新はToolのread modelだけへ反映し、Studio全体reload、Structure session変更、M2 draft/BPM変更、audio Stopを行わない。
Host disposeはconsumer・repository / Account / status subscription・storage / lifecycle listener・expiry timerを解除。
read-only consumerはPort runtime ownerをstopしない。pagehideで解放し、BFCache復帰では未確認のHostを作り直す。

## Origin / deployment

2026-10-11に`gh api repos/soundcruise/apps/pages`をread-only確認。
`status=built`、`cname=soundcruise.jp`、`html_url=https://soundcruise.jp/`、`source={branch:main,path:/}`、`build_type=legacy`。
root CNAMEもsoundcruise.jp。現在の配信設定ではStudio / Portを同じoriginの
`/apps/cruise-studio/` / `/apps/cruise-port/`で配信する構成（A）。Studioの公開製品化完了を意味しない。
公開URLのweb取得はこの実行環境では利用不可だったため、公開画面の動作確認とは分ける。

localStorage / IndexedDBはscheme + host + portに閉じる。
127.0.0.1:8765、127.0.0.1:8766、soundcruise.jpの保存領域はそれぞれ別。
localhost配信から本番Portデータは読めない。検証ではrepository rootを8766に配信し、隔離した同一origin fixtureを使用。
Studioディレクトリだけのstatic serverではsibling Port/shared moduleの読取りが404になり得る。
別originへStudioを移す場合はAPI/connector設計が必要であり、localStorage共有の代替として暗黙network fallbackは行わない。

## UIと残る条件

Tool paneの小さなread-only詳細にsaved BPM / effective設定 / 形式 / Sync / Pro / Account / presetsを配置。
Dockは現在のM2 memory BPM / Start / Stopを維持。semantic tokenのみ。native button・link・見出し・リスト、aria-liveのstatus表示。
4 Theme / keyboard / print非表示を検証。Port CSSはimportしない。

旧build tabは新Web Lockへ参加しない。M3 shared write前のBlockerとして残す。
次はM3 shared write解禁条件の設計・独立監査。old-build policy、dirty/base/playback保護、正式資格失効、mobile/Safariを検証してから判断する。
Prerequisitesではdormant PortMetronomeFacadeを準備したが、production shared writeは未解禁。

## 初期Read-only Host v1（0.26.0）の検証履歴

- Studio Node: baseline276。追加Host25件。commit前の機能300件PASS、既存の「Studio外tracked差分なし」Git状態検査1件は今回の共有変更を検出するため別扱い。commit後に全301件を確認する。
- 既存Studio Chrome: 97 tests（親container4を含み93独立ケース）PASS。
- Host Chrome: 10ケースPASS。起動/strict cache DB open0、Account/Sync/Pro readで永続書込0、data API network0、runtime未生成。
- native DB / storage前後比較、forward / Standard / cached Pro / offline / conflict / Account A→B、Port writer別tab通知、50 mount/unmount、Structure dirty/M2再生非干渉。
- Port/shared1371 PASS（既存1370 + readonly Pro1）、Worker/Account592 PASS、他4 apps85 PASS。
- Proは本番資格を使わず、隔離されたdevice keyと暗号化receipt fixtureで検証。本番API操作なし。
- 既存IME browser fixtureは前の合成compositionの遅延DOM再描画を待ってからCDPを開始するよう修正。旧HTMLでも同じ2件の失敗を再現して切り分け、native compositionend/文字保持/Modalを維持。Keyboard/Modal製品コードは不変。
- 固定fixture: Project JSON8077 bytes / Arrangement JSON26991 bytesはappVersionだけ0.26.0。
- MIDI813 bytes SHA-256 `5c0dcbe39eaada6775119aa8b39e6e6ce56712b8fe7ac04ea992c11ed260d023`一致。
- A4 PDF1200px raster SHA-256 `8cc02f7356af60a0bbccf9349148c57d0c0784f13b2588b2b3cdb107f75a406e`一致。
- console / app404 / unhandled rejection0。検証用8766serverは検証後停止。既存8765は操作しない。

再現: `node --test apps/cruise-studio/tests/*.test.mjs`、既存4本の`*.browser.cjs`を`STUDIO_URL=http://127.0.0.1:8766/apps/cruise-studio/`で直列実行。
Host browserは`node apps/cruise-studio/tests/port-data-host.browser.cjs`（bundled PlaywrightとChromeが必要）。
共有変更はPro read-only modeと回帰testだけ。全consumer HTMLのcache queryをrootルールに従って更新した。
Portのdomain code/version、他4 appsのdomain code/version、Worker、Studio project schema、Feature Metadataのruntime非保持を維持する。

## 初期Read-only Host v1のCommit対象（26 files・履歴）

- `apps/chord-cruise/pro_k7m4q9v2x8/index.html`
- `apps/chord-cruise/pro_k7m4q9v2x8/sync-cohort.html`
- `apps/cruise-port/pro_9a3943176561/index.html`
- `apps/cruise-studio/ROADMAP.md`
- `apps/cruise-studio/ai-handoff/PROJECT_STATE.md`
- `apps/cruise-studio/docs/FEATURE_METADATA.md`
- `apps/cruise-studio/docs/METRONOME_INTEGRATION.md`
- `apps/cruise-studio/docs/PORT_DATA_HOST.md`
- `apps/cruise-studio/index.html`
- `apps/cruise-studio/js/core/component-metadata.mjs`
- `apps/cruise-studio/js/core/feature-registry.mjs`
- `apps/cruise-studio/js/core/song-model.js`
- `apps/cruise-studio/js/port-data/connection.mjs`
- `apps/cruise-studio/js/port-data/host.mjs`
- `apps/cruise-studio/js/port-data/panel.mjs`
- `apps/cruise-studio/shell.css`
- `apps/cruise-studio/tests/color-theme.test.mjs`
- `apps/cruise-studio/tests/feature-metadata.test.mjs`
- `apps/cruise-studio/tests/keyboard-modal.browser.cjs`
- `apps/cruise-studio/tests/port-data-host.browser.cjs`
- `apps/cruise-studio/tests/port-data-host.test.mjs`
- `apps/fretboard_cruise/pro_a9f4k7q2m8z/index.html`
- `apps/pitch-cruise/pro_x9v7q2m8/index.html`
- `apps/rhythm-cruise/pro_r4m8k7n2q9x/index.html`
- `apps/shared/pro-device-session.js`
- `apps/shared/pro-device-session.test.mjs`
