# Studio Tuner Standard PC v1

2026-10-14 / Studio **0.30.0** / Port **1.22.18** / Chord **1.20.1**。
開始HEAD / origin/main / remote main: `6e6bb399cea7c054f408da3397a5befd1983bfdc`。
Studio schemaVersion **1**、Authority physical schema **2**。Port/Shared/Worker製品コードは不変更。

## 正本と再利用

`js/modules/tuner/runtime.mjs`はPortの`apps/cruise-port/tuner-engine.js?v=1.1.4`から
`createDetailedPitchDetector`を直接importする。YIN、octave誤差低減、Hz→Note/Octave/cents、confidence/RMS判定を複製・再実装しない。
Engineはimportなしのpure ESMで、DOM/storage/Pro/Account/Sync/permission/audioの起動副作用がない。
PortのUI/store/preview/capture controllerは製品のまま使用せず、Studio adapterが正式Coordinatorへ登録してcapture lifecycleを所有する。
Port capture controllerはdocument-wide `navigator.audioSession.type`変更と独自context cleanupを持つため、そのcontrollerは接続しない。
今回Studioは実験的audioSession APIを変更せず、ブラウザ既定の入力routeを使用する。

| 契約 | 正本 / v1 |
|---|---|
| A4 / 音名 / octave / cents | Engineの440Hz、半音丸め、12音名、MIDI octave、nearest noteからのcentsをそのまま使用 |
| 有効範囲 | Engine default 70–1400Hz、yinThreshold .12、minConfidence .82 |
| 入力閾値 | Port UIは`TUNER_DEFAULT_THRESHOLD_DB=-80`をRMSへ変換してEngineへ渡す。Studioも−80dBFS→.0001を使用。Engine fallback .003と混同しない |
| capture constraints | Port `tuner-audio.js`と一致: echoCancellation/noiseSuppression/autoGainControl=false、channelCount ideal1、video=false |
| analyser | Portと一致: 初期4096、sampleRateに対し80ms以上となる2冪へ拡大、最大32768 |
| 解析 | Portと同じ50ms cadence。実sampleRateのFloat32Arrayを既存detectorへ渡す。別のpitch clock/algorithmはない |

閾値・constraintsはsource parity testを持ち、Port変更時は再監査する。PortをStudioへ合わせない。
表示は実際に検出したnearest音名。指定調弦名、カポ補正、preview基準音とは分ける。
Hz/cents/confidenceの表示丸めだけを行い、EMA、note locking、独自in-tune判定、音程補正は追加しない。
無音/低レベル/noise/範囲外でEngineがnullを返した解析回から音名・Hz・cents・meterを消去する。

## Standard / 未接続

Port `cruise-port-capabilities.js`のStandard `tunerCapo=false`、Pro `true`、`tool-capabilities.js`のeffectiveCapoと
`tuner-app.js`の実利用を確認した。通常のマイク入力・chromatic検出・音名/Hz/cents/meterをv1対象とする。
今回のStandardは最小PC surfaceで、Port Tuner全設定の統合完了ではない。
Capo、調弦preset/target cards、reference preview、threshold設定UI、meter保存、diagnostic履歴は未接続。
Studio独自Pro判定を追加せず、Tuner保存値/PortDataHostを読み取らず、設定は固定値と一時状態だけ。
device selector/enumerateDevicesは追加しない。ブラウザ既定の入力を使用し、device IDを取得・永続保存しない。
permission-denied / no-device / device-busy / constraints / insecure / unsupportedを別表示する。

## Coordinator / 所有 / race

既存Studio singleton Coordinatorに`studio.tuner.standard` / `ownerFeatureId=port.tuner`を登録。
resource `microphone/session`をrequesting開始時に取得し、専用contextを`ownContext`で登録、active確定時にgrantする。
raw stream/context/nodeは公開snapshotへ渡さない。borrowerなし。context破壊操作は登録ownerだけが行う。
context専用化はShell Contract §15の許容境界であり、別Coordinatorや独自Global Stopを作らない。
source→analyserだけ接続し、destinationへ接続しない。マイクmonitor/録音/出力/送信なし。

Coordinatorにmic/outputの対称排他を追加。同種leaseと`microphone/session`↔`audio-output/session`はrequesting/active/解放待ち/失敗保持中すべて競合する。
readonly `getConflictingLeases()`は既存凍結tokenを返し、raw graphは返さない。
Metronome→Tunerは既存Modalで「停止してマイクを開始 / 中止」を確認。承認時にtoken identityを再確認し、同じMetronomeだけを停止する。
停止完了後も再検証してからatomic request。変更された競合を無断停止しない。
Tuner→Metronomeは既存M1 requestが拒否され、マイクを奪わない。停止したMetronomeを自動再開しない。
M1 renderのaudioOwner解除は自分が対象だった場合だけ行い、停止中M1の通知がTuner targetを消さない。

Global Stop buttonは既存`Coordinator.stopAll()`だけを呼ぶ。新しいstop機構/音楽Transportは追加しない。
`getStopGeneration()`で確認Modal/Metronome停止待ちの古い開始意図を無効化し、Global Stop後の遅延開始を防ぐ。workspace離脱generationも検証し、離脱後に戻っても旧停止待ちの開始意図を復活させない。
Coordinatorにtempo、pitch判定、保存、Pro policyを追加しない。

## Lifecycle

idle → requesting → active → releasing → idle。終了理由cancelled/failed/interrupted等と公開errorを分離。
明示Startだけでcontext/resume/getUserMediaを開始する。同時Startは同じattempt、active Startは再取得しない。
Stopはgenerationを同期更新し、解析timerとresource listenerを解除、全track.stop、source/analyser.disconnectを同期実施する。
context.close完了と実ended/closedを確認してownershipとleaseを解放する。
close/track cleanup失敗はfailed保持・Start禁止・lease保持。明示Stop/Global Stop/disposeで再試行し、成功後だけ解除する。

getUserMediaの未解決permissionは論理取消。Stop/disposeをそのPromiseで無期限に待たせない。
旧tokenで返ったstreamはその旧要求の全trackだけ即stopし、新しいstream/context/reading/errorへ触れない。
旧context.close待ち中に返ったstreamも、closeRunの各呼出しでstopする。古いreject/finallyも新ownerを変更しない。
Start前のresume遅延も同じgenerationで拒否する。

workspace離脱、hidden、pagehide/unload、active contextのrunning以外へのstatechange、track-endedで停止。
visible/persisted page/元workspaceへ戻っても自動再開しない。Dock開閉だけでは停止しない。
devicechangeのtopology通知だけで正常なtrackを奪わず、実track-endedを切断判定に使う。
disposeはpage/document/mediaDevices/UI/subscriberを解除し、cleanup成功後だけsessionを削除する。

permission Promiseはユーザーが選択せず未解決のままになる場合がある。ブラウザのpermission dialog自体を閉じるとは約束しない。
API根拠: [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)、
[track ended](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/ended_event)、
[AudioContext.close](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/close)。
track.stopはended eventを発火しないため、cleanupはreadyStateも直接検証する。

## Shell / Keyboard / Theme

正式workspace `tuner` / `screen-tuner`。Feature RegistryのimplementedPresentationは`separate-workspace`。
permission/audioRole/Port owner/capability requirementsは既存metadataを維持し、authorizationに使わない。
load/activateはcaptureを開始しない。ESMがDOMContentLoadedより先/後でも既存Audio初期化後に一度だけmountする。
通常Tab/Enter/Spaceはnative control。IME/just-composed/repeat/Modal/hidden/inertは既存gateを通す。
text inputや他workspaceへ開始/停止shortcutを追加しない。Escapeは既存Modal/pane/workspace ownershipを維持。
開始時は有効Stop、停止完了時はStartへfocusを戻す。active audioOwnerはTuner、Save/Transport対象とは別。
4 Theme semantic token、1920/1440/1024/680/390幅、既存A4譜面専用Print（Tuner除外）を使用する。

## 検証結果と制限

- baseline Studio Node **420 PASS**。変更後 **457 PASS**（追加37）。全既存suite/clean guard含む。commit後も全Nodeを実行する。
- 新規Tuner native Chrome **23 PASS**（独立22+親1）。既存正規7 browser suite **174 PASS**。合計197 runner tests。
- Port既存Engine test **1ファイルPASS**（合成note/noise/range/44100・48000Hz等の内部assertionsを含む）。製品コード不変更。
- 正式repoの独立loopback8766、使い捨てChrome、ローカル合成443Hz WAVのfake microphone。実マイク未使用、既存8765不触。
- 安定入力でA4 / 約443.00Hz / 約+11.8cents、confidence≈1。起動直後の未充填windowを精度assertionに使わず、同じ許容精度で安定後を確認。
- native全track停止、50回Start/Stopのcontext/timer/track残存0・listener増加0。旧permission後の新capture保護、Global Stop、Modal確認generation、切断、中断、hidden/pagehide、dispose、reload。
- Port LS/IDB/Tuner設定/Authority/Account/Pro Device/Sync-outbox/Worker/Cloud禁止write **0**、DB open/create **0**、予期しないnetwork mutation **0**。
- app console error / 404 / unhandled rejection **0**。Studio所有Theme等の既存保存は区別する。
- M1/M2試験は新Tuner sessionを別ownerとして扱い、M1 disposal後の他ownerを破壊しないこととpage全体cleanupを検証する。

実マイクの音質/精度、物理multi-device切替、OS permission UI、Safari/iOSのroute/interruption、聴感はユーザー実機確認が必要。
通常PC機能gateをAuthority安全性承認・M3 write解禁・L3c解決と扱わない。
Production **legacy / ACCEPT_COMPAT / enforcement OFF / Studio shared write OFF / PortDataHost.canWrite=false**を維持。
Daybreak待機・L3c未解決境界を維持し、認証/認可の動的security probe・本番deployは行わない。
