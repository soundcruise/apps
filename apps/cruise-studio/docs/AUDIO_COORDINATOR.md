# Audio Coordinator v1 / Metronome M1

2026-10-11、Studio 0.25.0、project schemaVersion 1。
M1はPort機能をPCへ接続する最初の実証であり、製品統合完了ではない。

## Port読み取り調査と共有判断

| 対象 | Port source（全て読み取りのみ） |
|---|---|
| UI / BPM input / lifecycle | `metronome-app.js`: initMetronome、setActive、stopForPageHidden |
| 時刻・拍子・event cursor | `metronome-timing.js` |
| context / scheduler / renderer / gain | `metronome-app.js`: createMetronomeAudioEngine |
| defaults / clamp / schema / 保存 | `metronome-store.js` |
| presets | `metronome-presets-store.js` |
| Standard effective設定 / Pro | `tool-capabilities.js` / `cruise-port-capabilities.js` |
| 保存競合 / Sync副作用 | `storage-conflict.js` |
| audioSession route | `tuner-audio.js` / `tuner-preview-audio.js` |

方式C: pure timingも`metronome-store.js`を経由して`storage-conflict.js`をimportし、
そのmodule末尾が`SoundCruisePortSync.acceptRemoteStorageValues`をglobal登録する。
したがってgraph全体はM1に対してimport-safeではない。released Portへ抽出変更を行わず、
Studioの`js/modules/metronome/port-core.js`へpure timing、clamp、Standard既定値、
電子クリック・gain・scheduler・rescheduleだけを投影した。Port UI / policy / store関数は実行しない。
他soundのrendererやpresetsは含めない。pure timingの拍子等の関数は出典との一致のため保持するが、
M1 runtimeは4/4 / quarter / electronic / volume70 / 先頭accentのStandard既定値に固定する。

`tests/metronome.test.mjs`はdefaults / limits、clamp、pure timing全文、scheduler定数、
選択したaudio関数をPort sourceと照合する。source変更で不一致なら再監査し、PortをStudioへ合わせない。
独自アルゴリズムへ置換しない。Studio追加はowner context通知、close、lease、非同期generationとUI adapter。

## Parityと意図したhost差

| 項目 | Port / M1共通 |
|---|---|
| BPM | 初期120、30〜240、有限数を整数丸め・clamp。不正 / 空入力は直前値へfallback |
| clock | AudioContext.currentTime、独立free-tool clock |
| scheduler | 25ms timer、100ms horizon、55ms start lead |
| stall | cursorがcurrentTime−100msより古ければcurrentTime+55msへ再配置。backlogを連発しない |
| BPM変更 | Port rescheduleで未来main beatを保持、なければlast main + 新interval。近すぎるbeatは新intervalずつ進める |
| 音 | square: accent1500Hz / peak.82 / release.072、normal1200Hz / .70 / .064、attack.0012 |
| output | volume70のPort gain関数、同じcompressor（−3 / knee4 / ratio10 / attack.002 / release.06） |

PortはUI非activeでstop、hiddenでstop+suspend、通常Stop後はcontextを再利用する。
Studio M1は今回の指示に従いworkspace非active / Dock collapse / visibility hiddenだけでは継続する。
Stop / interruption / pagehide / unloadではcontextをcloseし、再Startは新専用contextを作る。
これは音楽timing差ではなくhostの資源lifecycle差。background timer throttlingによる無音区間を
DAW精度保証へ読み替えない。hiddenのOS音声制約まで回避できるとは主張しない。

## Coordinatorの境界

`js/core/audio-coordinator.js`はDOM-free factory。Studio内一instance。別tab / Port / OS音声の所有者ではない。
registryはstable session handleのidentityを検証する。同じIDの再登録でも古いhandleは無効。

- `register({sessionId,ownerFeatureId,cleanup,notify})` / `snapshot()`。
- `request(handle,resourceType)`は予約token、`grant`はactive確定、`release`はowner/token一致時だけ解放。
  M1 resourceは`audio-output/session`。同じresourceの予約は排他、同じownerの重複requestは同じtoken。
  resource名の拡張余地はあるが、mic / outputの横断競合policyやmic leaseは未実装。
- `ownContext` / `forgetContext`でcontextごとにowner一つ。raw contextは公開snapshotへ含めない。
- `borrowTimebase`はread-only currentTime / stateだけのdescriptor。close / suspend / resume / recreate /
  node生成 / destination / raw contextを渡さない。owner忘却・session破棄で無効化する。
  M1はborrowerなし。将来のgraph共有は別のscoped facadeが必要で、現APIをgraph共有完了とは扱わない。
- `notify(handle,'interruption'|'devicechange'|'visibility',detail)`はowner通知のみ。
- `cleanup`はgenerationを同期無効化し、owner cleanupの完了まで予約を保持する。
- `stopAll()`はpending startも無効化し、全ownerを並列cleanup。一ownerの失敗で他ownerを止めない。
  Global Stop中のrequestは禁止。close失敗は未解放資源として保持し、成功に偽装しない。
- `disposeSession`はcleanup成功後のみregistryを除去する。

BPM、musical position、tempo map、event生成、click音、判定・出題、settings、storage、
Sync、Pro、project stateはCoordinatorへ置かない。認可の実装でも万能registryでもない。

## Runtime・Start・Stop・非同期

`metronome.js`の`createRuntime({core,coordinator,feature,environment,settingsSource?})`。
M1はmemory-only BPMだけを変更する。`settingsSource`はM2の明示注入用予約引数で、M1では読取・get/save呼出しを行わない。
`setBpm` / `snapshot` / `subscribe`がsettings hostとの境界。M2でschema / validation / revisionを
検証するadapterを追加する必要があり、予約引数だけでpersistence実装済みとは扱わない。

1. Startのuser gestureでBPMを正規化、lease予約、専用context生成・owner登録、resumeを開始する。
2. runtime generation / owner / leaseが有効か再確認しschedulerを開始、grant後にrunningを公開する。
3. 同時Startは同じPromise、running Startは同じengine。close待ち / 失敗未解放中は再Startを拒否。
4. Stopはgenerationを進め、scheduler timer / visual frame / active source / 未来nodeを同期取消。
5. context state listenerを除去、graphをdisconnect、close完了後に所有登録とleaseを解放する。
6. close失敗はerrorと未解放leaseを保持。明示Stop / Coordinator cleanupで再試行可能。
7. 遅いresume / reject / finallyは元runだけをcleanupし、新runの状態・context・leaseに触らない。

`start` / `stop` / `setBpm` / `snapshot` / `subscribe` / `dispose`。Start失敗はfalseとerrorを返す。
Stopは冪等。disposeは自分のpage / visibility / devicechange listenersとsubscriberを除去し、
cleanup成功後にsessionを除去。失敗なら再disposeでretryできる。

## UI・command・page境界

Dock Auxiliary ToolにBPM number input、Start、Stop、statusのみ。Transport placeholderは独立。
既存`port.metronome`descriptorを選択projection `metadata.js`へ同梱し、catalog完全一致testを行う。
Studio単独HTTP rootを維持するため、runtimeでPort ESM graphを取りに行かない。
ownerApp=cruise-port / dataOwner=port / syncOwner=portは保持するが、M1では接続を意味しない。
metadataにはrunning / lease / context / access stateを保存しない。implementedPresentations=dockはM1 surfaceだけ。

--studio-* tokenだけで4テーマ。Dockは従来96px（compact既定76px）の領域内でcontrolを折返す。
Navigationへ再生状態とStopを提供し、collapsed時にも停止可能。状態変化で無効・hiddenになるfocusは
有効なStop / BPM / Dock toggleへ復帰する。label、accessible name、live status、focus-visibleを保持する。
通常数字 / Arrowはnumber controlの所有。BPM inputのCmd/Ctrl+Sだけ既存`studio.save`へ局所委譲する。
active Structure / no modal / canCommit / IME / hidden・inertの既存gateを通り、BPMを保存targetにしない。
EscapeはMetronomeをStopせずDockを閉じない。modal / pane / Structureの既存owner順を維持する。

Home / Structure / Pre-DTM / Apps、右pane、Dock、Theme変更はaudio lifecycleを起動しない。
BPM変更はStructure dirty / draft / project JSONへ入れず、project BPMとも同期しない。
active audioOwnerは明示runtime、transport targetはnull。印刷はDockを除外し、音声稼働中も紙面・PDFを変えない。

visibilitychangeは通知のみ。running contextのstatechangeがrunning以外ならinterruptionとしてStop+close、
復帰時に自動再開しない。pagehide / unloadは停止・cleanupする。BFCacheからの復帰も明示Startだけ。
OS interruptionはbrowser差があるため実機pending。現在の根拠:
[AudioContext state](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state)、
[currentTime](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/currentTime)、
[close](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/close)。

navigator.audioSessionは[実験的・限定対応API](https://developer.mozilla.org/en-US/docs/Web/API/AudioSession/type)。
Port Tunerはplay-and-record、previewはplayback、cleanupはplayback→autoへ戻す経路を持つ。
document-wide route変更は別ownerを妨げうる。M1は参照・変更せず、隔離Chromeではunsupportedを確認。
Tuner / Rhythm / Pitch接続前にsession route owner・復帰generation・実Safari競合を検証する。

## 検証と段階境界

- Node: Coordinator21 + Metronome36 + 既存161 = 218 PASS。
- Chrome: Metronome28 + Keyboard/Modal20 + Editing Session22 = 70独立ケース。
  test runner表示73は親container3を含む。全独立検証288件。
- 実AudioContext: 120 BPMは0.055 / 0.555 / 1.055 / 1.555秒の4 beat、240 BPM変更後0.25秒間隔。
  AudioParam予定値とAudioContext schedule timestampsをinstrumentし、順序・重複・restart・Stop後eventなしを確認。
  複数theme / 1440・1024・800・680幅、focus、Save、IME、modal、working source、pagehide / context suspendを検証。
- 50回の実Start / Stop: live contexts0、scheduler timers0、owned contexts0、listener数増加0。
  dispose後は自分のUI / page / context / device listeners0。console error / app404 / unhandled rejection0。
- 0.24.0固定baseline: Project JSON8,077 bytes / Arrangement JSON26,991 bytesはappVersionのみ0.25.0。
  MIDI813 bytes SHA-256 `5c0dcbe39eaada6775119aa8b39e6e6ce56712b8fe7ac04ea992c11ed260d023`一致。
  audio稼働中A4 PDF1200pxラスタSHA-256 `8cc02f7356af60a0bbccf9349148c57d0c0784f13b2588b2b3cdb107f75a406e`一致。
- Safari / OS日本語IME / 音質の聴感 / 実プリンター / 実OS interruptionは今回未確認。
  currentTimeのschedule一致を、あらゆるbackground・出力deviceでの聴感精度保証とは扱わない。

M2は隔離memory Storage facade、既存schema3 / validation / migration、storedとeffective設定、Pro境界、
保存失敗 / revision / stale / conflictを検証する。M1の予約引数から暗黙に保存を開始しない。
M3で初めてPort-owned dataset / presets / 正式資格 / Account / Sync / delete intent /
別tab・Port同時起動・mobile回帰へ接続する。mic full lease、Transport、project BPM link、
count-in / seek / loop / playhead / record、Undo、他featureは未実装。全writer協調はM3 prerequisite。
