/* ═══════════════════════════════════════════════════════════
   リズムクルーズ
   STAGE 1「4分ジャスト」スクロール譜面型ズレ判定UI。

   ・8小節 / 4分音符 / 4-4拍子 = 合計32拍
   ・4分音符が右から左へ流れ、中央の判定ラインに重なった瞬間にタップ
   ・タップ位置を判定ライン基準でマーカー表示（緑=JUST/青=EARLY/赤=LATE/灰=MISS）
   ・練習中はシンプルに（譜面・判定ライン・小節/状態・TAP・操作のみ）
   ・ズレ履歴グラフは練習中には出さず、8小節終了後の結果画面にまとめて表示
   ※ マイク入力・本格的なストローク音検出は未実装（タップで体験確認）
═══════════════════════════════════════════════════════════ */

const RHYTHM_CRUISE_VERSION = '0.9.130';

/* ── DEBUG フラグ（本番は必ず false）──────────────────────────
   STAGE_WAVE_DEBUG：STAGE再生中の波形描画ソース/時間軸/補正値を画面右下に小さく出す。
   MIC_SCROLL_DEBUG：マイク反応テストへの初回スクロールの座標/前後Y/viewport状態を画面左上に小さく出す。
   いずれも実機（iPhone）で事実確認するための一時表示。リリース時は false のまま。

   ★初回スクロール不具合の実機調査手順（v0.9.112）：
     1. このすぐ下の MIC_SCROLL_DEBUG を true にして保存・本番反映する。
     2. 実機で「設定→マイク設定→補正テスト→イヤホン接続→Bluetooth→ストローク選択→マイク反応テスト」と進む。
     3. 画面左上に出る値（scrollY before/after、rect top/bottom、target absY、isTargetVisible、
        visualViewport height/offsetTop/scale、activeEl、step、time since load 等）を確認する。
     4. scroll が実際に動いたか／別処理で戻されていないか／viewport が原因か を切り分ける。
     5. 原因特定後、必ず MIC_SCROLL_DEBUG を false に戻す。
   ※今回はスクロール処理自体は変更しない（1回直接スクロールのまま）。値を取るための整備のみ。 */
const STAGE_WAVE_DEBUG = false;
const MIC_SCROLL_DEBUG = false;

/* クリック音テストで鳴らす回数（4拍 × 2周） */
const CLICK_TEST_COUNT = 8;
/* ストロークテストの回数 */
const STROKE_TEST_COUNT = 4;

/* キャリブレーション中だけ使う測定専用値（通常設定とは独立。終了後に復元する）。
   ★STAGE用反応ラインとは目的が逆：STAGE＝クリックを避けてストロークを拾う／補正＝クリック音を拾って遅延を測る。
   そのため補正用は「クリック音を確実に拾うが、ノイズ・余韻は拾いすぎない」ラインを別に算出する。 */
// 補正テストの安定化方針：
//  ・補正テスト中だけクリック音量を十分上げ（CAL_MIN_VOLUME）、クリックを安定して拾う（STAGE本番は変えない）。
//  ・補正用反応ラインは「マイク反応テストのクリック音量・環境ノイズ」から決める：
//      環境ノイズより十分上 ＜ 補正用反応ライン ＜ クリック最大見込みより十分下（かつ低すぎない）。
//  ・最初の1クリックの実測ピークが取れたら、必要に応じて一度だけ微調整する。
//  ・採用は 7/8 以上＋ばらつき小＋補正値が上限非到達 のときだけ（不安定なら補正値を出さない）。
const CAL_THR_DEFAULT = 0.02;       // マイク反応テスト未実施などで推定できない場合の既定
const CAL_THR_CLICK_FACTOR = 0.45;  // 補正用反応ライン = クリック最大見込み × この係数（立ち上がり本体を拾う）
const CAL_THR_CAP_FACTOR = 0.75;    // 補正用反応ラインは「クリック最大見込み × この係数」を超えない
const CAL_THR_FLOOR = 0.012;        // 補正用反応ラインの絶対下限
const CAL_THR_CEIL = 0.08;          // 補正用反応ラインの絶対上限
const CAL_MIN_VOLUME = 30;     // 補正テスト中の最低クリック音量(%)。10%等で不安定なため引き上げる（STAGEは据え置き）
const CAL_MIN_DETECT_PEAK = 0.05; // 想定クリックピークがこれ未満なら、さらに音量を上げて安定検出を狙う
const CAL_MIN_SUCCESS = 7;     // 補正値を採用する最低検出数（8拍中）。これ未満は不安定扱い
const CAL_COOLDOWN_MS = 150;   // 測定用クールダウン
/* マイク入力がこの値未満なら「入力がほとんど無い」とみなす（失敗理由の判定用。測定しきい値より下に） */
const CAL_SILENCE_PEAK = 0.004;
/* 1クリックの検出ウィンドウ（クリック発音→検出までの妥当なms範囲）。次クリック(=CAL_INTERVAL_MS)より十分前に閉じる。
   このウィンドウ内の「最初の有効オンセット1つだけ」を採用し、余韻・二重ピークは無視する（過剰検出対策）。 */
const CAL_DETECT_WIN_FROM = 5;
const CAL_DETECT_WIN_TO = 520;
/* ばらつき（中央絶対偏差）がこの値を超えたら「測定不安定」とみなし、補正値を採用しない */
const CAL_MAX_SPREAD_MS = 45;
/* 補正値の絶対上限（ms）。この値に張り付く（=測定遅延が大きすぎる）場合は不安定扱いにする */
const CAL_OFFSET_LIMIT_MS = 150;

/* クリック音ガード中でも、これ以上の大きさなら本物のストロークとみなして通す（しきい値の倍率）。
   反応ラインはおすすめ適用後クリック音より上にあるため、ライン超え＝ストローク。
   ★1.0：ライン（=反応ライン）を超えた入力は全てストロークとして通す。クリックはラインより下なので
   オンセットしない＝ガードで弾く必要がない。これより上にすると、クリックと同時(4分ジャスト)に弾いた
   「ライン超えだが少し小さめ」のストロークがガードで除外されてMISSになる（今回の原因）。 */
const STRONG_STROKE_FACTOR = 1.0;

/* 実践テストのクリックガードで使う「ストロークとして通す」倍率（v0.9.68、v0.9.78で isClickGuardedOnset に統一済み・参照用に残す）。 */
const PT_CLICK_STRONG_FACTOR = 1.1;

/* 実践テストの開発確認用ログ（v0.9.77）。本番は false（出力なし）。
   原因追跡したいときだけ true にすると、検出/割り当て/除外理由の集計を console.debug に出す。 */
const PT_DEBUG = false;

/* 二重反応の判定（クールダウン中の入力）。1回のストロークの余韻・複数ピークを二重反応と数えないため、
   「明確に別の強い立ち上がり」のときだけ・1クールダウンにつき1回だけ数える。 */
const DOUBLE_MIN_GAP_MS = 100;        // 直前の登録からこのms以内は同一ストロークの余韻とみなし数えない
const DOUBLE_MIN_PEAK_FACTOR = 1.4;   // 反応ライン×この倍率以上の強い入力だけ二重反応候補（減衰中の余韻を除外）
/* 各拍の音量(beatMicPeak)は「立ち上がり(オンセット)直後のこの時間だけ」記録する。
   減衰中の余韻が次拍の窓に染み出して、弾いていない拍が音量ありに見える（→「判定済み/余韻」に化ける）のを防ぐ。 */
const STRIKE_ACTIVE_MS = 140;

/* 立ち上がり検出：threshold交差に加え、フレーム間でこの量以上の急増もストロークとみなす
   （クリック音の余韻で prevPeak が高いままでも、ストロークの急増を拾えるように） */
const RISE_DELTA = 0.12;

/* 本番STAGEのマイク判定で、穏やかな立ち上がり（窓内で threshold 超え）も拾うヒステリシス検出を有効にする。
   true: 再アーム後、しきい値超えで1回検出。後で調整・無効化しやすいようフラグ化。 */
const MIC_SUSTAINED_ONSET = true;
/* 本番STAGEのマイク判定の検出しきい値係数。
   おすすめ反応ライン自体を「実際に拾える実ライン」に置くようにしたので、本番でも表示の反応ラインと
   同じ値で検出する（=1.0）。穏やかな立ち上がりは下のヒステリシスで拾う。
   ※以前は表示%調整のために 0.5 にしていたが、反応ライン超え＝検出 の整合を最優先するため 1.0 に戻す。 */
const MIC_STAGE_DETECT_FACTOR = 1.0;
/* 再アーム条件：検出しきい値×この値を下回ったら次の入力を拾える状態に戻す */
const MIC_REARM_FACTOR = 0.6;

/* 波形・レベル表示のスケール。反応ライン(threshold)を表示上 1/SCALE の高さに見せる＝
   threshold は常に約 40% の位置。thresholdが低いほど同じ入力でも波形が大きく見える（表示のみ・判定は不変）。 */
const MIC_DISPLAY_SCALE = 2.5;
function micDisplayFrac(peak) {
    const thr = mic.threshold > 0 ? mic.threshold : 0.16;
    return Math.max(0, Math.min(1, peak / (thr * MIC_DISPLAY_SCALE)));
}
function micThresholdMarkerPct() {
    return (1 / MIC_DISPLAY_SCALE) * 100; // 反応ラインの表示位置（約40%固定）
}

/* マイク波形（背景表示）用の保持時間。古いサンプルはこれを超えたら破棄 */
const MIC_WAVE_WINDOW_MS = 4000;

/* 設定の保存キーと初期値 */
const SETTINGS_KEY = 'rhythmCruiseSettings';
/* マイク設定プリセット（名前をつけて保存／呼び出し）。v0.9.61 */
const MIC_PRESETS_KEY = 'soundcruise_rhythm_mic_presets';
const SETTINGS_DEFAULTS = { threshold: 0.025, cooldownMs: 200, clickGuardMs: 60, timingOffsetMs: 0, clickVolume: 70 };

/* イヤホン（有線/Bluetooth）選択時のクリック音量初期値（v0.9.88）。
   イヤホンではクリック音がマイクに回り込みにくいので、聞き取りやすい50%を既定にする。
   通常マイクはこの値を使わず、既存のクリック音量設定を維持する。 */
const EARPHONE_CLICK_VOLUME = 50;

/* 組み込みプリセット（v0.9.63）：削除不可。ユーザーが消しても常に一覧の先頭に出る「開始点」。 */
const BUILTIN_MIC_PRESETS = [
    {
        id: 'builtin_mic', name: '通常マイク', builtin: true,
        settings: {
            inputType: 'normal', headphoneType: 'wired', strokeDetectMode: 'brush',
            threshold: 0.025, cooldownMs: 200, clickVolume: 15, timingOffsetMs: 0,
            lowInputProfile: false,
            headphoneOffsetWiredMs: 0, headphoneOffsetBluetoothMs: 0, headphoneOutputOffsetMs: 0,
            clickGuardMs: 60,
        },
    },
    {
        id: 'builtin_wired', name: '有線イヤホン', builtin: true,
        settings: {
            inputType: 'headphone', headphoneType: 'wired', strokeDetectMode: 'brush',
            threshold: 0.008, cooldownMs: 100, clickVolume: 50, timingOffsetMs: 0,
            lowInputProfile: true,
            headphoneOffsetWiredMs: 0, headphoneOffsetBluetoothMs: 0, headphoneOutputOffsetMs: 0,
            clickGuardMs: 60,
        },
    },
    {
        id: 'builtin_bt', name: 'Bluetoothイヤホン', builtin: true,
        settings: {
            inputType: 'headphone', headphoneType: 'bluetooth', strokeDetectMode: 'brush',
            threshold: 0.008, cooldownMs: 100, clickVolume: 50, timingOffsetMs: 0,
            lowInputProfile: true,
            // マイク設定側のBluetoothイヤホン標準の表示補正100msをスタートラインにする（v0.9.99で200ms→v0.9.100で100msへ）。
            // マイク設定側はマイク遅れ補正画面の表示/クリック合わせ用。判定（STAGE/最終確認テスト）には反映しない。
            headphoneOffsetWiredMs: 0, headphoneOffsetBluetoothMs: 100, headphoneOutputOffsetMs: 100,
            clickGuardMs: 60,
        },
    },
];

/* 画面タップ設定用プリセット（v0.9.97）。マイク設定プリセットとは完全に分けて管理する。
   保存するのはタップ補正値（= headphoneOutputOffsetMs / tapOutputOffsetMs）だけ。 */
const TAP_PRESETS_KEY = 'soundcruise_rhythm_tap_presets';
const BUILTIN_TAP_PRESETS = [
    { id: 'builtin_tap_none', name: '補正なし', builtin: true, tapOffsetMs: 0 },
    // 画面タップ設定側のBluetoothイヤホン標準は200ms（タップ判定/表示用・マイク設定側の100msとは別基準）。
    { id: 'builtin_tap_bt', name: 'Bluetoothイヤホン標準', builtin: true, tapOffsetMs: 200 },
];

/* マイク補正キャリブレーション設定 */
const CAL_CLICKS = 8;       // 測定で鳴らすクリック数
const CAL_INTERVAL_MS = 650; // クリック間隔

/* 判定の画面表示テキスト（内部判定名は just/early/late/miss のまま維持） */
const FX_TEXT = { just: 'GOOD!', early: 'EARLY', late: 'LATE', miss: 'MISS' };

/* ── 判定の仮ルール ─────────────────────────────────────── */
const BEATS_PER_BAR = 4;
const BAR_OPTIONS = [1, 2, 4, 8];   // STAGEで選べる小節数（v0.9.118）
const DEFAULT_BARS = 8;             // 既存仕様（8小節×4拍＝32拍）に合わせた初期値
// TOTAL_BEATS は「小節数 × 4拍」。小節数は state.bars で可変（v0.9.118）。
// applyStageBars() で state.bars から再計算する。配列やレーンは resetGame/resetData で作り直す。
let TOTAL_BEATS = DEFAULT_BARS * BEATS_PER_BAR; // = 32（既定）
const COUNT_IN_BEATS = 4;        // 1小節ぶんのカウントイン
const JUST_MS = 40;              // ±40ms以内 = JUST（GOOD幅はそのまま）
const NEAR_MS = 120;            // EARLY/LATE の最低幅（ms）。実際は拍間隔に応じて下の割合まで広げる
/* EARLY/LATE 窓を拍間隔の割合まで広げる。最寄り拍への割り当て後の |diff| は最大でも拍間隔の50%なので、
   0.5＝登録できた入力は必ず GOOD/EARLY/LATE のどれかになる（タイミング外MISSにはしない）。
   タイミング外は「二重反応／ノイズ／拍に入力なし」など明確な異常に限定する（STAGE1の学習方針）。 */
const NEAR_FRAC = 0.5;
const TAIL_BEATS = 1;            // 最終拍の後に少し余韻

const COLORS = { just: '#2ecc71', early: '#4d96ff', late: '#ff6b6b', miss: '#8a8a8a' };
const LABELS = { just: '🎯 GOOD', early: '⏪ EARLY', late: '⏩ LATE', miss: '× MISS' };
const SCORE_PTS = { just: 100, early: 60, late: 60, miss: 0 };
const NOTE_COLOR = 'rgba(255,209,102,0.95)';

/* ── STAGE 定義 ─────────────────────────────────────────── */
const STAGES = [
    { n: 1, title: '4分ジャスト', desc: '流れる4分音符に合わせてタップ', ready: true },
    { n: 2, title: 'テンポキープ', desc: '数小節を通してテンポを保つ／クリックを減らす', ready: false },
    { n: 3, title: '8分ストローク', desc: 'ダウン／アップのタイミングを確認する', ready: false },
    { n: 4, title: '裏拍集中', desc: '「1と2と…」の「と」の位置を練習する', ready: false },
    { n: 5, title: '休符と空振り', desc: '音を出さない部分でも手を止めない', ready: false },
    { n: 6, title: 'シンコペーション', desc: 'タイ／食うリズムでも手の流れを保つ', ready: false },
];

/* ── 状態 ───────────────────────────────────────────────── */
const state = {
    bpm: 80,
    bars: DEFAULT_BARS, // テストする小節数（1/2/4/8）。全STAGE共通（v0.9.118）
    currentStage: 1,
    rhythmProCustomStages: [], // PROカスタムSTAGE（v0.9.119）。SETTINGS_KEY内に統合保存する。

    inputMode: 'tap',   // 'tap' | 'stroke'
    strokeDetectMode: 'brush', // ストローク検出モード：'brush'（ブラッシング・既存ロジック）| 'chord'（コードストローク専用ロジック）
    // コードストローク専用ロジックのゲート（マイク反応テストから自動算出・既定値あり）
    chordMinCooldown: 180,     // 直前入力後この時間は新規入力を無視(ms)
    chordRiseGate: 0.012,      // 直前入力後の谷からの上昇量がこれ以上で新規入力
    chordInstantRiseGate: 0.008, // 直前フレームからの増加量がこれ以上で新規入力
    // コードPLAY中の観察カウンタ
    chordPicked: 0,            // コードロジックで拾った入力数
    chordIgnoredRePeaks: 0,    // 余韻中などで無視した再ピーク数
    tapLayout: 'lr',    // タップエリア配置：'lr'（左右：左ダウン/右アップ）| 'ud'（上下：上アップ/下ダウン）
    tapHeight: 106,     // タップボタンの高さ(px)。ユーザーがスライダーで調整（80〜160）
    running: false,
    raf: 0,
    audioCtx: null,
    startTime: 0,           // perf時計の開始基準（マイクガード等の相対計測用）
    audioStartTime: 0,      // オーディオ時計(ctx.currentTime)の開始基準（譜面・判定・クリックの絶対基準）
    currentTime: 0,
    beatInterval: 750,
    T0: 0,
    endTime: 0,
    clickTimes: [],
    nextClick: 0,
    scheduledClicks: [],    // 先読みスケジュール済みのクリック音オシレータ（停止時に止める）
    results: new Array(TOTAL_BEATS).fill(null),
    beatMicPeak: new Array(TOTAL_BEATS).fill(0), // 各拍の判定窓内で観測した最大マイク入力（MISS原因の切り分け用）
    beatDoubled: new Array(TOTAL_BEATS).fill(false), // 各拍で二重反応（重複入力）が起きたか
    beatExcluded: new Array(TOTAL_BEATS).fill(false), // 各拍で入力がクールダウン/ガード等で除外されたか
    micEventLog: [],  // 各オンセットの記録（MISS原因デバッグ用）{t,peak,nearBeat,outcome,assignedBeat,cls}
    chordBeatProbe: [], // コードストローク：拍ごとの候補フレーム情報（立ち上がり未検出MISSの原因分析用）
    doubleReactionCount: 0, // 二重反応の総数
    markers: [],
    micWaveHistory: [],   // {perf, level} マイク音量の時系列（STAGE中の背景波形用・直近のみ）
    micRunWave: [],       // {t, level} 演奏全区間の音量履歴（補正後ゲーム時刻基準）。結果レーンでSTAGE同等の波形を再描画
    combo: 0,             // 連続GOOD数
    pxPerBeat: 90,
    pxPerMs: 0.12,
    judgeX: 100,
    // クリック音（マイク誤検出対策）
    clickEnabled: true,
    clickVolume: 70,   // クリック音量 0..100%
    lastClickPerf: -9999,
    // マイク設定の進捗フラグ（localStorageに保存）
    micTestDone: false,       // マイク反応テストを完了したか
    micDelayDone: false,      // マイクの遅れ補正を適用したか
    micSetupPrompted: false,  // マイク許可後の設定誘導を表示済みか
};

/* ── マイク判定PoC 状態 ─────────────────────────────────── */
const mic = {
    on: false,
    stream: null,
    src: null,
    analyser: null,
    buf: null,
    raf: 0,
    threshold: 0.16,   // 立ち上がりしきい値（0..1）
    inputType: 'normal', // 入力タイプ：'normal'（通常マイク）| 'headphone'（イヤホン接続）。'auto'は廃止（UI非表示・互換でnormal扱い）
    headphoneType: 'wired', // イヤホンの種類：'wired'（有線）| 'bluetooth'（Bluetooth）。headphone選択時の目安/導線切替に使う
    headphoneOffsetWiredMs: 0,        // 有線イヤホンの音ズレ補正(ms)。v0.9.79で目安を0ms（補正なし）に変更
    headphoneOffsetBluetoothMs: 0,    // Bluetoothイヤホンの音ズレ補正(ms)。v0.9.84で目安を0ms（補正なし）に変更（判定ズレはbluetoothMicOffsetMsで扱う）
    headphoneOutputOffsetMs: 0, // 選択中の種類の音ズレ補正(ms)。互換用。v0.9.51でもUI/保存のみ・STAGE判定/マイク判定には未反映
    bluetoothMicOffsetMs: 0, // Bluetoothイヤホン時のマイク遅れ補正(ms)。v0.9.80で新設。Bluetooth時のみ判定時刻に加算（負＝早める）。未保存は0=補正なし
    lowInputProfile: false, // 低入力(イヤホン)テスト由来の設定か。手動設定の表示%スケール切替に使う（実値は不変）
    cooldownMs: 200,   // 検出後のクールダウン
    clickGuardMs: 60,  // クリック音直後は検出を無視（クリック音ON時のみ・出力レイテンシ分を加算）
    timingOffsetMs: 0, // マイク判定補正（ms）。マイク由来の検出時刻に加算（負＝早める）
    prevPeak: 0,
    armed: true,       // ヒステリシス検出のアーム状態（threshold*0.5 を下回ると再アーム）
    env: 0,
    lastDetect: 0,
    lastOnsetAt: -100000, // 直近の立ち上がり(オンセット)時刻。beatMicPeakを実打直後だけ記録するために使う
    doubleCounted: false, // 現在のクールダウン窓で二重反応を既に1回数えたか（余韻の多重カウント防止）
    valley: 1,            // 直前入力後の最小音量（コードストローク：谷からの上昇量の基準）
    // 診断カウンタ
    inputCount: 0,     // 入力検出（しきい値超え）
    registerCount: 0,  // 判定登録（registerHitでマーカー）
    excludeCount: 0,   // ガード等で除外
    lastExcludeReason: '',
    flashTimer: 0,
    calibrating: false, // キャリブレーション測定中
};

/* マイク補正キャリブレーションの測定状態 */
const cal = {
    active: false,
    samples: [],
    i: 0,
    lastClickPerf: -9999,
    lastDetect: 0,
    timer: 0,
    measuredDelay: null,
    proposedOffset: null,
    lastAt: null,
    saved: null,     // 開始時に退避したユーザー設定
    successCount: 0, // 検出できたクリック数
    clickArmed: false, // 現在のクリックがまだ未検出か（1クリック1検出のため）
    rebaselined: false, // 1クリック目の実測で補正用反応ラインを微調整済みか（一度だけ）
    noiseBump: 1,    // 直前がばらつき大（ノイズ拾い）だった場合、次回の補正用反応ラインを上げる係数
    lastResultThreshold: null, // 直前に「採用可」となった測定の補正用反応ライン（前回比較用）
    lastResultOffset: null,    // 直前に「採用可」となった測定の補正値（前回比較用）
    spread: null,    // 直近測定のばらつき（中央絶対偏差ms）
    unstable: false, // ばらつき過大で測定不安定と判定したか
    threshold: CAL_THR_DEFAULT, // 補正テストで実際に使った反応ライン（STAGE用とは別物・表示用）
    clickVol: 70,    // 補正テストで実際に使ったクリック音量（一時的に上げた場合を含む・表示用）
    // 測定モニター・失敗理由判定用
    maxPeak: 0,      // 測定中に観測した最大入力レベル
    rawOnsets: 0,    // 範囲内外を問わず検出した立ち上がり数
    outOfRange: 0,   // 検出はしたが妥当範囲(5..520ms)外だった数
    lastLevel: 0,    // 直近の入力レベル（表示用）
};

/* 実音テスト（設定画面）の状態。registerHit/スコアには一切流さない */
const test = {
    active: false,      // 設定画面でマイクモニター中
    mode: null,         // 'click' | 'stroke' | null
    lastInputAt: 0,     // 最後に入力検出した時刻（表示用）
    seqTimer: 0,        // クリックテストの連続タイマー
    timers: [],         // ストロークテスト等の予約タイマー
    curPeak: 0,         // 現在の計測窓のピーク
    curOnsets: 0,       // 現在の計測窓のオンセット数（二重反応判定）
    // 環境ノイズ測定（補正用反応ラインの下限に使う）
    noiseSamples: [],   // 無音区間のマイク入力レベル
    noiseAvg: 0, noiseMax: 0, noiseP95: 0,
    // 反応ライン超過時間の計測（二重反応防止の推奨に使う）
    curAbove: false,    // 現在、反応ラインを超えているか
    curAboveStart: 0,   // 現在の連続超過の開始時刻
    curAboveMax: 0,     // 現在の音符窓での最長連続超過時間(ms)
    strokeAboveMs: [],  // 各ストロークの反応ライン超過時間(ms)
    strokeAboveMedian: null, // 反応ライン超過時間の代表値(中央値, ms)
    // コードストローク観察用（chordモードのマイク反応テストで記録）
    curRiseMax: 0,      // 現在の音符窓での最大立ち上がり速度（フレーム間のpeak増分）
    curFirstAboveT: 0,  // 反応ラインを最初に超えていたフレームの時刻
    curLastAboveT: 0,   // 反応ラインを最後に超えていたフレームの時刻（余韻の終わり）
    curPeakT: 0,        // ピーク到達時刻
    strokeChordDiag: [], // 各ストロークの観察値 {peak,aboveMs,fullSpanMs,riseMax,timeToPeakMs,onsets,rePeaks}
    chordWave: [],       // ストロークテスト全体の波形 {t,env,peak}（chord時のみ・間引き・consoleダンプ用）
    // クリックテスト
    clickI: 0,
    clickPlayedAt: -9999,
    clickPeaks: [],     // 各クリック窓のピーク
    clickResults: [],   // {beat, peak, reacted}
    clickWinFrom: 0, clickWinTo: 0,
    maxClickPeak: 0,
    clickMeasureVol: 70,  // クリックテストを鳴らした時のクリック音量（10%適用後の目安計算用）
    clickDone: false,
    // ストロークテスト（流れる譜面型・8分ダウンアップ）
    strokeRound: 0,
    strokeFrom: 0, strokeUntil: 0,
    strokePeaks: [],          // 全ノートの受付窓ピーク（検出有無に無関係）
    strokeDownPeaks: [],      // ダウン音符の受付窓ピーク
    strokeUpPeaks: [],        // アップ音符の受付窓ピーク
    strokeDetected: 0,
    strokeDoubleCount: 0,
    minStrokePeak: null, maxStrokePeak: null,
    strokeDone: false,
    // 流れる譜面
    notes: [],                // {t, dir, opened, closed, peak}
    noteIdx: 0,
    flowStart: 0,
    flowRaf: 0,
    // 推奨
    recommended: null,
    recoCooldown: null,
    recoClickVolume: null,
    projClickMax: null, // おすすめ音量適用後のクリック音最大の目安（線形近似）
    flow: false,   // 自動フロー実行中
    rescueHighSens: false, // 再テスト時に、最初から高感度寄りで拾い直す救済モード
    autoRetestCount: 0,    // このテスト一連での自動再テスト回数（最大1回）
};

/* ── 要素参照 ───────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const els = {
    home: $('screen-home'),
    practice: $('screen-practice'),
    settings: $('screen-settings'),
    appNav: $('app-nav'),
    navBackBtn: $('nav-back-btn'),
    navTopBtn: $('nav-top-btn'),
    settingsBtn: $('settings-btn'),
    tapHint: $('tap-hint'),
    stageList: $('stage-list'),
    // v0.9.117：ホームを「リズム練をする → 基礎練/ストロークパターン/コード進行」の階層に再構成
    homeTop: $('home-top'),
    homeRhythm: $('home-rhythm'),
    homeKiso: $('home-kiso'),
    homeSoon: $('home-soon'),
    soonTitle: $('soon-title'),
    rhythmTrainBtn: $('rhythm-train-btn'),
    catKiso: $('cat-kiso'),
    catStroke: $('cat-stroke'),
    catChord: $('cat-chord'),
    // PROカスタムSTAGE（v0.9.119）
    catProCustom: $('cat-pro-custom'),
    homeProCustom: $('home-pro-custom'),
    proCustomNew: $('pro-custom-new'),
    proCustomList: $('pro-custom-list'),
    proCustomEmpty: $('pro-custom-empty'),
    rcToast: $('rc-toast'),
    // JSON手動コピー用モーダル（v0.9.120）
    rcJsonModal: $('rc-json-modal'),
    rcJsonText: $('rc-json-text'),
    rcJsonCopy: $('rc-json-copy'),
    rcJsonClose: $('rc-json-close'),
    // PROカスタムSTAGE 編集画面（v0.9.120）
    homeProCustomEdit: $('home-pro-custom-edit'),
    pceTitle: $('pce-title'),
    pceTimeSig: $('pce-timesig'),
    pceGrid: $('pce-grid'),
    pcePbars: $('pce-pbars'),
    pceBpm: $('pce-bpm'),
    pceBpmDown: $('pce-bpm-down'),
    pceBpmUp: $('pce-bpm-up'),
    pceBarsDown: $('pce-bars-down'),
    pceBarsUp: $('pce-bars-up'),
    pceBarsVal: $('pce-bars-val'),
    pcePattern: $('pce-pattern'),
    pceSave: $('pce-save'),
    pceTest: $('pce-test'),
    pceCopy: $('pce-copy'),
    pceBack: $('pce-back'),
    pceDelete: $('pce-delete'),
    appVersionDisplay: $('app-version-display'),
    refreshBar: $('in-game-refresh-bar'),
    practiceNum: $('practice-num'),
    practiceTitle: $('practice-title'),
    practiceEditBack: $('practice-edit-back'),
    customTestActions: $('custom-test-actions'),
    customTestEditBack: $('custom-test-edit-back'),
    customTestSave: $('custom-test-save'),
    customTestPreview: $('custom-test-preview'),
    customTestPreviewScore: $('custom-test-preview-score'),
    customFlowScoreLayer: $('custom-flow-score-layer'),
    tempoVal: $('tempo-val'),
    tempoUp: $('tempo-up'),
    tempoDown: $('tempo-down'),
    barsVal: $('bars-val'),
    barsUp: $('bars-up'),
    barsDown: $('bars-down'),
    barCounter: $('bar-counter'),
    latestVerdict: $('latest-verdict'),
    progressFill: $('progress-fill'),
    laneCanvas: $('lane-canvas'),
    graphCanvas: $('graph-canvas'),
    tapPad: $('tap-pad'),
    playBtn: $('play-btn'),
    // v0.9.118：入力方式の切替は「リズム練をする」画面へ移動。STAGE側は現在方式の表示のみ。
    rhythmModeTap: $('rhythm-mode-tap'),
    rhythmModeStroke: $('rhythm-mode-stroke'),
    practiceModeLabel: $('practice-mode-label'),
    strokeModeBrush: $('stroke-mode-brush'),
    strokeModeChord: $('stroke-mode-chord'),
    strokeModeNote: $('stroke-mode-note'),
    inputTypeNormal: $('input-type-normal'),
    inputTypeHeadphone: $('input-type-headphone'),
    inputTypeNote: $('input-type-note'),
    // イヤホンの音ズレ補正（v0.9.50）
    hpCalCard: $('hp-cal-card'),
    hpCalStaged: $('hp-cal-staged'), // v0.9.117：補正テスト開始まで隠す段階表示のまとまり
    hpCalBtn: $('hp-cal-btn'),
    hpCalLaneWrap: $('hp-cal-lane-wrap'),
    hpCalAutoMsg: $('hp-cal-auto-msg'),
    hpCalLaneCanvas: $('hp-cal-lane-canvas'),
    hpBpmVal: $('hp-bpm-val'),
    hpBpmMinus: $('hp-bpm-minus'),
    hpBpmPlus: $('hp-bpm-plus'),
    hpOffset: $('hp-offset'),
    hpOffsetVal: $('hp-offset-val'),
    hpTypeCard: $('hp-type-card'),
    hpTypeWired: $('hp-type-wired'),
    hpTypeBluetooth: $('hp-type-bluetooth'),
    hpTypeNote: $('hp-type-note'),
    hpResetBtn: $('hp-reset'),
    hpZeroBtn: $('hp-zero'),
    hpStdBtn: $('hp-std'),
    // 手動設定内のイヤホン音ズレ補正（v0.9.52）
    setHpOffsetRow: $('set-hp-offset-row'),
    setHpOffset: $('set-hp-offset'),
    setHpOffsetVal: $('set-hp-offset-val'),
    setHpOffsetNote: $('set-hp-offset-note'),
    setHpResetBtn: $('set-hp-reset'),
    setHpZeroBtn: $('set-hp-zero'),
    // 実践テスト（v0.9.56。旧「判定ズレ確認」を置き換え）
    ptCard: $('pt-card'),
    ptNote: $('pt-note'),
    ptLaneWrap: $('pt-lane-wrap'),
    ptLaneCanvas: $('pt-lane-canvas'),
    ptReview: $('pt-review'),
    ptReviewScroll: $('pt-review-scroll'),
    ptReviewCanvas: $('pt-review-canvas'),
    ptReviewFirst: $('pt-review-first'),
    ptReviewLast: $('pt-review-last'),
    ptBtn: $('pt-btn'),
    ptStatus: $('pt-status'),
    ptResult: $('pt-result'),
    // マイク遅れ補正（Bluetoothイヤホン用・v0.9.80）
    btCalCard: $('bt-cal-card'),
    btCalBadge: $('bt-cal-badge'),
    btCalGuide: $('bt-cal-guide'),
    btCalLaneWrap: $('bt-cal-lane-wrap'),
    btCalLaneCanvas: $('bt-cal-lane-canvas'),
    btCalLive: $('bt-cal-live'),
    btCalLevel: $('bt-cal-level'),
    btCalPhase: $('bt-cal-phase'),
    btCalBtn: $('bt-cal-btn'),
    btCalStatus: $('bt-cal-status'),
    btCalResult: $('bt-cal-result'),
    btCalSkip: $('bt-cal-skip'),
    autoEarphoneHint: $('auto-earphone-hint'),
    testInputNote: $('test-input-note'),
    testCardNote: $('test-card-note'),
    testDoNow: $('test-do-now'),
    tapArea: $('tap-area'),
    tapTools: $('tap-tools'),                 // v0.9.118：タップボタン調整の折りたたみ全体（タップモード時のみ表示）
    tapToolsToggle: $('tap-tools-toggle'),    // 開閉ボタン
    tapToolsPanel: $('tap-tools-panel'),      // 開いたときに見える中身
    tapToolsReset: $('tap-tools-reset'),      // デフォルトに戻す
    layoutLrBtn: $('layout-lr-btn'),
    layoutUdBtn: $('layout-ud-btn'),
    tapHeightSlider: $('tap-height'),
    micSetupPrompt: $('mic-setup-prompt'),
    micSetupPromptText: $('mic-setup-text'),
    micSetupYesBtn: $('mic-setup-yes'),
    micSetupLaterBtn: $('mic-setup-later'),
    resultsOverlay: $('results-overlay'),
    rCloseBtn: $('r-close-btn'),
    rEditBackBtn: $('r-edit-back-btn'),
    resultsCard: $('results-card'),
    resultsDetail: $('results-detail'),
    resultsWarn: $('results-warn'),
    resultsMissInfo: $('results-miss-info'),
    resultsMissDebug: $('results-miss-debug'),
    resultsChordDev: $('results-chord-dev'),
    resultsChordDetail: $('results-chord-detail'),
    resultsChordMiss: $('results-chord-miss'),
    resultsDoubleNotice: $('results-double-notice'),
    resultsDoubleMsg: $('results-double-msg'),
    resultsDoubleDetail: $('results-double-detail'),
    resultsRetestBtn: $('results-retest-btn'),
    resultsMicTune: $('results-mic-tune'),
    resultsMicWrap: $('results-mic-wrap'),
    resultsMicCanvas: $('results-mic-canvas'),
    reviewWrap: $('review-wrap'),
    reviewCanvas: $('review-canvas'),
    rScore: $('r-score'),
    rJust: $('r-just'),
    rEarly: $('r-early'),
    rLate: $('r-late'),
    rMiss: $('r-miss'),
    rAvg: $('r-avg'),
    rComment: $('r-comment'),
    retryBtn: $('retry-btn'),
    rBackBtn: $('r-back-btn'),
    // マイク診断
    micCard: $('mic-card'),
    micState: $('mic-state'),
    micToggleBtn: $('mic-toggle-btn'),
    clickToggleBtn: $('click-toggle-btn'),
    micLevel: $('mic-level'),
    micThreshold: $('mic-threshold'),
    micFlash: $('mic-flash'),
    micLastLevel: $('mic-last-level'),
    micIn: $('mic-in'),
    micReg: $('mic-reg'),
    micExc: $('mic-exc'),
    micLastDetect: $('mic-last-detect'),
    micExcReason: $('mic-exc-reason'),
    micOffset: $('mic-offset'),
    micSettingsBtn: $('mic-settings-btn'),
    micClickHint: $('mic-clickhint'),
    // 判定演出・コンボ
    judgeFxLayer: $('judge-fx-layer'),
    comboBadge: $('combo-badge'),
    // 設定画面
    homeSettingsBtn: $('home-settings-btn'),
    // 設定タブ（v0.9.95）：マイク設定 / 画面タップ設定
    settingsTabs: $('settings-tabs'),
    settingsTabMic: $('settings-tab-mic'),
    settingsTabTap: $('settings-tab-tap'),
    tapSettingsCard: $('tap-settings-card'),
    tapCurrentOffset: $('tap-current-offset'),
    tapOpenCal: $('tap-open-cal'),
    tapOpenPreset: $('tap-open-preset'),
    tapOpenManual: $('tap-open-manual'),
    tapPresetCard: $('tap-preset-card'),
    tapPresetList: $('tap-preset-list'),
    tapPresetBack: $('tap-preset-back'),
    tapManualCard: $('tap-manual-card'),
    tapManualCurrent: $('tap-manual-current'),
    tapManualOffset: $('tap-manual-offset'),
    tapManualVal: $('tap-manual-val'),
    tapManualUse: $('tap-manual-use'),
    tapManualSave: $('tap-manual-save'),
    tapManualBack: $('tap-manual-back'),
    hpTapUseBtn: $('hp-tap-use-btn'),
    hpTapSaveBtn: $('hp-tap-save-btn'),
    // 画面タップ設定：音ズレ補正テスト（タップ実測型・v0.9.98）
    tapCalCard: $('tap-cal-card'),
    tapCalLaneWrap: $('tap-cal-lane-wrap'),
    tapCalLaneCanvas: $('tap-cal-lane-canvas'),
    tapCalPad: $('tap-cal-pad'),
    tapCalPhase: $('tap-cal-phase'),
    tapCalBtn: $('tap-cal-btn'),
    tapCalStatus: $('tap-cal-status'),
    tapCalResult: $('tap-cal-result'),
    tapCalBack: $('tap-cal-back'),
    tapCalBpmMinus: $('tap-cal-bpm-minus'),
    tapCalBpmVal: $('tap-cal-bpm-val'),
    tapCalBpmPlus: $('tap-cal-bpm-plus'),
    settingsActions: $('settings-actions'),
    // ステップ式UI（v0.9.59）：初期2択・設定一覧・ステップ制御
    settingsChooser: $('settings-chooser'),
    settingsViewCurrent: $('settings-view-current'),
    // 簡易設定／詳細テスト（v0.9.71）
    settingsSimpleBtn: $('settings-simple-btn'),
    settingsDetailBtn: $('settings-detail-btn'),
    settingsSimpleCard: $('settings-simple-card'),
    simpleChoices: $('simple-choices'),
    simplePresetChoices: $('simple-preset-choices'),
    simpleResult: $('simple-result'),
    simpleResultMsg: $('simple-result-msg'),
    simplePracticeBtn: $('simple-practice-btn'),
    simpleDoneBtn: $('simple-done-btn'),
    simpleBackBtn: $('simple-back-btn'),
    settingsSummaryCard: $('settings-summary-card'),
    settingsSummaryList: $('settings-summary-list'),
    settingsSummarySave: $('settings-summary-save'),
    settingsSummaryManual: $('settings-summary-manual'),
    settingsSummaryBack: $('settings-summary-back'),
    presetToggleBtn: $('preset-toggle-btn'),
    micPresetCard: $('mic-preset-card'),
    micPresetBack: $('mic-preset-back'),
    inputTypeCard: $('input-type-card'),
    strokeModeCard: $('stroke-mode-card'),
    manualCard: $('manual-card'),
    correctionWiredNote: $('correction-wired-note'),
    // ウィザード化（v0.9.62）：要約・補正系の進む/スキップ
    settingsStepsSummary: $('settings-steps-summary'),
    settingsStepsProgress: $('settings-steps-progress'),
    settingsDoneHint: $('settings-done-hint'),
    calSkipBtn: $('cal-skip-btn'),
    hpProceedBtn: $('hp-proceed-btn'),
    hpRetestBtn: $('hp-retest-btn'),
    wiredProceedBtn: $('wired-proceed-btn'),
    // プリセット保存／呼び出し（v0.9.61）
    presetListWrap: $('preset-list-wrap'),
    presetList: $('preset-list'),
    // 手動設定カード内のプリセット保存トリガー（v0.9.80：モーダルを開く）
    manualPresetTrigger: $('manual-preset-trigger'),
    // プリセット保存モーダル（v0.9.80）
    presetModal: $('preset-modal'),
    presetModalInput: $('preset-modal-input'),
    presetModalMsg: $('preset-modal-msg'),
    presetModalSave: $('preset-modal-save'),
    presetModalCancel: $('preset-modal-cancel'),
    ptOpenManual: $('pt-open-manual'),
    setThreshold: $('set-threshold'),
    setThresholdVal: $('set-threshold-val'),
    setCooldown: $('set-cooldown'),
    setCooldownRow: $('set-cooldown-row'),
    setCooldownVal: $('set-cooldown-val'),
    setOffset: $('set-offset'),
    setOffsetVal: $('set-offset-val'),
    setClickVol: $('set-clickvol'),
    setClickVolVal: $('set-clickvol-val'),
    micPreviewCanvas: $('mic-preview-canvas'),
    settingsResetBtn: $('settings-reset-btn'),
    settingsBackBtn: $('settings-back-btn'),
    settingsTopBtn: $('settings-top-btn'),
    manualTopBtn: $('manual-top-btn'),
    manualPracticeBtn: $('manual-practice-btn'),
    manualUseBtn: $('manual-use-btn'),
    micResetBtn: $('mic-reset-btn'),
    micResetMsg: $('mic-reset-msg'),
    chooserAppliedMsg: $('chooser-applied-msg'),
    // キャリブレーション
    calCard: $('cal-card'),
    calHead: $('cal-head'),
    calDoneBadge: $('cal-done-badge'),
    calBtn: $('cal-btn'),
    calStatus: $('cal-status'),
    calResult: $('cal-result'),
    calDelay: $('cal-delay'),
    calOffset: $('cal-offset'),
    calApplyBtn: $('cal-apply-btn'),
    calMonitor: $('cal-monitor'),
    calLevel: $('cal-level'),
    calThreshold: $('cal-threshold'),
    calCount: $('cal-count'),
    calLast: $('cal-last'),
    calMax: $('cal-max'),
    calSuccess: $('cal-success'),
    calSpread: $('cal-spread'),
    // 遅れ補正「結果を見る」
    calResultDetail: $('cal-result-detail'),
    calRdDelay: $('cal-rd-delay'),
    calRdOffset: $('cal-rd-offset'),
    calRdSuccess: $('cal-rd-success'),
    calRdSpread: $('cal-rd-spread'),
    calRdMax: $('cal-rd-max'),
    calRdLine: $('cal-rd-line'),
    calRdVol: $('cal-rd-vol'),
    calRdAt: $('cal-rd-at'),
    // 実音テスト
    testCard: $('test-card'),
    testCardHead: $('test-card-head'),
    testDoneBadge: $('test-done-badge'),
    testMicState: $('test-mic-state'),
    testLevel: $('test-level'),
    testThreshold: $('test-threshold'),
    testLevelVal: $('test-level-val'),
    micTestBtn: $('mic-test-btn'),
    testLive: $('test-live'),
    testLaneWrap: $('test-lane-wrap'),
    testLaneCanvas: $('test-lane-canvas'),
    testPhase: $('test-phase'),
    testResult: $('test-result'),
    testReco: $('test-reco'),
    recoThr: $('reco-thr'),
    recoClickVol: $('reco-clickvol'),
    recoCooldown: $('reco-cooldown'),
    recoMsg: $('reco-msg'),
    recoRetest: $('reco-retest'),
    recoRetestBtn: $('reco-retest-btn'),
    recoApplyBtn: $('reco-apply-btn'),
    manualDetail: $('manual-detail'),
    testResultDetail: $('test-result-detail'),
    testDetail: $('test-detail'),
    testDetailStats: $('test-detail-stats'),
    barZone: $('bar-zone'),
    barClick: $('bar-click'),
    barLine: $('bar-line'),
    barStroke: $('bar-stroke'),
    calCurrentOffset: $('cal-current-offset'),
};

let settingsReturn = 'home';
/* セッション内フラグ（リロードで消える＝1セッションに付き1回の制御に使う） */
let micSetupPromptShownThisSession = false; // 設定誘導を今セッションで出したか

let lane = { ctx: null, w: 0, h: 0 };
let preview = { ctx: null, w: 0, h: 0 };
let graph = { ctx: null, w: 0, h: 0 };
let review = { ctx: null, w: 0, h: 0, beatPx: 70, leftPad: 38 };
let testLane = { ctx: null, w: 0, h: 0 }; // マイク反応テストの流れる譜面
let ptLane = { ctx: null, w: 0, h: 0 };   // 実践テストの流れる譜面（STAGE1風）
let ptReviewLane = { ctx: null, w: 0, h: 0 }; // 実践テスト終了後の見返し用（横長・静的）レーン（v0.9.74）

/* ── STAGE一覧を描画 ────────────────────────────────────── */
function renderStages() {
    els.stageList.innerHTML = '';
    STAGES.forEach((s) => {
        const card = document.createElement('button');
        card.className = 'stage-card' + (s.ready ? '' : ' is-locked');
        if (!s.ready) card.setAttribute('aria-disabled', 'true');
        card.innerHTML = `
            <span class="stage-num"><small>STAGE</small><b>${s.n}</b></span>
            <span class="stage-body">
                <span class="stage-title">${s.title}${s.ready ? '' : '<span class="badge-soon">準備中</span>'}</span>
                <span class="stage-desc">${s.desc}</span>
            </span>
            <span class="stage-chevron">›</span>`;
        if (s.ready) card.addEventListener('click', () => openStage(s.n));
        els.stageList.appendChild(card);
    });
}

/* ═══════════════════════════════════════════════════════════
   PROカスタムSTAGE（v0.9.119：土台）
   ・入口・一覧・保存・JSONコピーのみ。練習エンジン接続は次工程。
   ・保存は新規キーを作らず、既存 SETTINGS_KEY のJSON内に
     rhythmProCustomStages: [] として統合する。
   ・表示/操作は必ず isRhythmProCustomStageAvailable() を経由し、
     将来 PRO版/通常版で制御を差し替えられる構造にしておく。
═══════════════════════════════════════════════════════════ */
const RHYTHM_CUSTOM_STAGE_MAX_SAVED = 24;
// 最小音符（grid）。v0.9.122 で 32分・8分三連・16分三連 を追加。
const RHYTHM_CUSTOM_GRID_OPTIONS = ['quarter', 'eighth', 'sixteenth', 'thirtysecond', 'eighthTriplet', 'sixteenthTriplet'];
const RHYTHM_CUSTOM_BAR_OPTIONS = [1, 2, 4, 8, 16, 32, 64, 128];       // 初期小節数（STAGE開始時の練習小節数・v0.9.121 で最大128へ）
const RHYTHM_CUSTOM_PATTERN_BARS_OPTIONS = [1, 2, 3, 4];               // 小節単位（パターン1周の小節数・v0.9.121）
const RHYTHM_CUSTOM_TIME_SIGNATURES = ['4/4', '3/4', '2/4', '6/8'];    // 拍子（v0.9.122）
const RHYTHM_CUSTOM_DEFAULT_TIME_SIG = '4/4';
const RHYTHM_CUSTOM_CLICK_MODES = ['all', 'downbeat', 'none'];         // 互換のため残す（編集UIからは v0.9.121 で削除）
const RHYTHM_CUSTOM_DIRS = ['down', 'up']; // null も許容（補正で別扱い）
const RHYTHM_CUSTOM_BPM_MIN = 30;
const RHYTHM_CUSTOM_BPM_MAX = 240;
const RHYTHM_CUSTOM_BEATS_PER_BAR = 4; // 4/4 既定（拍子別は rhythmTimeSigInfo で扱う）

// 音価の共通基準：1拍(4分)=24ティック。32分(=3)・8分三連(=8)・16分三連(=4)も割り切れる最小公倍数。
const RHYTHM_TPQ = 24;
// 各 grid の「1セルが占めるティック数」。
const RHYTHM_GRID_TICKS = {
    quarter: 24, eighth: 12, sixteenth: 6, thirtysecond: 3,
    eighthTriplet: 8, sixteenthTriplet: 4,
};
// 三連符系の grid（VexFlow Tuplet で連符表示する）。
const RHYTHM_GRID_IS_TRIPLET = { eighthTriplet: true, sixteenthTriplet: true };

/* 拍子の情報。
   beats/beatValue：VexFlow Voice 用。barTicks：1小節のティック長。
   beamGroupTicks：連桁・拍頭判定のまとまり（単純拍子=4分、複合6/8=付点4分）。 */
function rhythmTimeSigInfo(ts) {
    switch (ts) {
        case '3/4': return { ts: '3/4', beats: 3, beatValue: 4, barTicks: 3 * RHYTHM_TPQ, beamGroupTicks: RHYTHM_TPQ, compound: false };
        case '2/4': return { ts: '2/4', beats: 2, beatValue: 4, barTicks: 2 * RHYTHM_TPQ, beamGroupTicks: RHYTHM_TPQ, compound: false };
        case '6/8': return { ts: '6/8', beats: 6, beatValue: 8, barTicks: 6 * (RHYTHM_TPQ / 2), beamGroupTicks: RHYTHM_TPQ + RHYTHM_TPQ / 2, compound: true };
        case '4/4':
        default: return { ts: '4/4', beats: 4, beatValue: 4, barTicks: 4 * RHYTHM_TPQ, beamGroupTicks: RHYTHM_TPQ, compound: false };
    }
}

/* 拍子で使える grid。6/8 は quarter と三連符系を無効化（複合拍子では扱いが複雑なため次工程）。 */
function rhythmGridAllowed(grid, ts) {
    if (ts === '6/8') return (grid === 'eighth' || grid === 'sixteenth' || grid === 'thirtysecond');
    return RHYTHM_CUSTOM_GRID_OPTIONS.includes(grid);
}

/* grid が不正/拍子非対応なら安全な grid（eighth）へ寄せる（既定の最小音符は8分）。 */
function rhythmCoerceGrid(grid, ts) {
    const g = RHYTHM_CUSTOM_GRID_OPTIONS.includes(grid) ? grid : 'eighth';
    return rhythmGridAllowed(g, ts) ? g : 'eighth';
}

/* timeSignature を検証（未指定/不正は 4/4）。 */
function rhythmCustomTimeSig(ts) {
    return RHYTHM_CUSTOM_TIME_SIGNATURES.includes(ts) ? ts : RHYTHM_CUSTOM_DEFAULT_TIME_SIG;
}

/* パターン1マスの状態（v0.9.120）。
   内部表現は { hit, dir, type } の3点。type は v0.9.119（hit/dirのみ）からの拡張で、
   normalize で type が無い古いデータも安全に補完できるようにする。
   編集UI（v0.9.120 改善版）は「音符レーン」型：上段=音符（音符/休符/タイ）、下段=矢印（↓/↑/空振り）。 */
const RHYTHM_CUSTOM_CELL_TYPES = ['rest', 'hit', 'ghost', 'tie'];

/* 将来のPRO判定用フック（v0.9.119）。
   いまは true 固定。将来は data-app-edition や認証状態に差し替える。
   例： return document.documentElement.dataset.appEdition === 'Pro'; */
function isRhythmProEdition() {
    return document.documentElement && document.documentElement.dataset
        ? document.documentElement.dataset.appEdition === 'Pro'
        : false;
}
function isRhythmProCustomStageAvailable() {
    return true;
}

/* ユニークID：rcs_<base36時刻>_<乱数> */
function generateRhythmCustomStageId() {
    const ts = Date.now().toString(36);
    const rand = Math.floor(Math.random() * 0xffffff).toString(36).padStart(4, '0');
    return `rcs_${ts}_${rand}`;
}

/* 1小節あたりのセル数（拍子×grid・v0.9.122）。
   1小節のティック長 ÷ 1セルのティック長 で算出（4/4・3/4・2/4・6/8 すべて共通式）。
   例) 4/4: q4 e8 s16 t32 / 8分三連12 / 16分三連24、3/4: q3…、2/4: q2…、6/8: e6 s12 t24。 */
function rhythmCustomStepsPerBar(grid, timeSignature) {
    const info = rhythmTimeSigInfo(rhythmCustomTimeSig(timeSignature));
    const cellTicks = RHYTHM_GRID_TICKS[grid] || RHYTHM_TPQ;
    return Math.max(1, Math.round(info.barTicks / cellTicks));
}

/* patternBars を 1..4 に丸める（無効なら 1）。 */
function rhythmCustomPatternBars(v) {
    return RHYTHM_CUSTOM_PATTERN_BARS_OPTIONS.includes(v) ? v : 1;
}

/* 1小節分のラベル（テキスト＋強調レベル）を拍子×grid から生成（v0.9.122）。
   返り値：[{ t:表示文字, s:'strong'|'mid'|'faint' }, …]（長さ = 1小節のセル数）。
   s は描画側で文字の濃さ/大きさに使う（拍頭=strong、中間=mid、細かい位置=faint）。 */
function rhythmBarLabelCells(grid, timeSignature) {
    const ts = rhythmCustomTimeSig(timeSignature);
    const info = rhythmTimeSigInfo(ts);
    const steps = rhythmCustomStepsPerBar(grid, ts);
    const cellTicks = RHYTHM_GRID_TICKS[grid] || RHYTHM_TPQ;
    const cells = [];

    // 三連符系：1拍を3(8分三連)/6(16分三連)分割。拍頭のみ強調、中間は丸数字で薄く。
    if (RHYTHM_GRID_IS_TRIPLET[grid]) {
        const per = grid === 'eighthTriplet' ? 3 : 6;
        const circ = ['①', '②', '③', '④', '⑤', '⑥'];
        for (let i = 0; i < steps; i++) {
            const beat = Math.floor(i / per) + 1, sub = i % per;
            cells.push(sub === 0 ? { t: beat + circ[0], s: 'strong' } : { t: circ[sub] || '', s: 'faint' });
        }
        return cells;
    }
    // 32分：拍頭=strong。単純拍子は 8分/16分位置に表/e/裏/a を薄く、その間は空欄。
    if (grid === 'thirtysecond') {
        const per = Math.round(info.beamGroupTicks / cellTicks); // 単純拍子8 / 6/8は12
        const nm = ['表', 'e', '裏', 'a'];
        for (let i = 0; i < steps; i++) {
            const head = Math.floor(i / per) + 1, sub = i % per;
            if (sub === 0) cells.push({ t: head + '表', s: 'strong' });
            else if (!info.compound && sub % 2 === 0) cells.push({ t: nm[sub / 2] || '', s: sub === 4 ? 'mid' : 'faint' });
            else cells.push({ t: '', s: 'faint' });
        }
        return cells;
    }
    // 6/8（eighth / sixteenth）：付点4分のまとまり頭を強調、それ以外は空欄で薄く。
    if (info.compound) {
        const per = Math.round(info.beamGroupTicks / cellTicks); // eighth:3 / sixteenth:6
        for (let i = 0; i < steps; i++) {
            const head = Math.floor(i / per) + 1, sub = i % per;
            cells.push(sub === 0 ? { t: String(head), s: 'strong' } : { t: '', s: 'faint' });
        }
        return cells;
    }
    // 単純拍子（4/4・3/4・2/4）の quarter / eighth / sixteenth。
    const cpb = Math.round(RHYTHM_TPQ / cellTicks); // 1拍あたりセル数 q1 e2 s4
    const nm = ['表', 'e', '裏', 'a'];
    for (let i = 0; i < steps; i++) {
        const beat = Math.floor(i / cpb) + 1, sub = i % cpb;
        if (grid === 'quarter') cells.push({ t: String(beat), s: 'strong' });
        else if (grid === 'eighth') cells.push(sub === 0 ? { t: beat + '表', s: 'strong' } : { t: beat + '裏', s: 'mid' });
        else cells.push(sub === 0 ? { t: beat + '表', s: 'strong' } : (sub === 2 ? { t: beat + '裏', s: 'mid' } : { t: beat + nm[sub], s: 'faint' }));
    }
    return cells;
}

/* grid・小節単位・拍子に応じた拍ラベル（テキストのみ・JSON/STAGE用・v0.9.122）。
   1小節分を rhythmBarLabelCells から作り patternBars 回くり返す（区切りは小節線で示す）。 */
function defaultRhythmDisplayLabels(grid, patternBars, timeSignature) {
    const bars = rhythmCustomPatternBars(patternBars);
    const one = rhythmBarLabelCells(grid, timeSignature).map((c) => c.t);
    const out = [];
    for (let k = 0; k < bars; k++) out.push(...one);
    return out;
}

/* 1マスを正規化（type が無い v0.9.119 データも安全に補完）。
   v0.9.120 改訂：空振り（ghost）は廃止し、読み込んだら rest 扱いにする（方向は保持）。
   休符・タイは「音は出さないが手は動く」を括弧つき矢印で示すため dir(down/up/null) を保持する。 */
function normalizeRhythmCustomCell(cell) {
    const c = cell && typeof cell === 'object' && !Array.isArray(cell) ? cell : {};
    let type = RHYTHM_CUSTOM_CELL_TYPES.includes(c.type) ? c.type : null;
    if (!type) {
        // 旧データ（hit/dir のみ）からの推定：hit:true → 打点、それ以外 → 休み。
        type = c.hit ? 'hit' : 'rest';
    }
    // 空振り（ghost）は廃止。既存データは rest として安全に読み込む（方向は保持）。
    if (type === 'ghost') type = 'rest';
    const dir = RHYTHM_CUSTOM_DIRS.includes(c.dir) ? c.dir : null;
    if (type === 'hit') {
        return { hit: true, dir: dir || 'down', type: 'hit' };
    }
    // rest / tie：打点はしないが方向は保持（括弧つき矢印に使う。null も許容）。
    return { hit: false, dir, type };
}

/* 空マス（休み） */
function makeRhythmRestCell() {
    return { hit: false, dir: null, type: 'rest' };
}

/* grid・位置に応じた初期マス（v0.9.121）。
   quarter：すべて 音符＋↓。eighth／sixteenth：down/up の自然な交互（偶数=↓、奇数=↑）。 */
function defaultRhythmCellForIndex(grid, i) {
    if (grid === 'quarter') return { hit: true, dir: 'down', type: 'hit' };
    return { hit: true, dir: (i % 2 === 0 ? 'down' : 'up'), type: 'hit' };
}

/* デフォルトのカスタムSTAGE（新規作成時に1件保存する雛形・v0.9.123）。
   既定は 4/4 × 8分 × 1小節（最小音符の既定を8分へ変更）。pattern は1小節分を自動生成。 */
function getDefaultRhythmCustomStage() {
    const grid = 'eighth';
    const timeSignature = '4/4';
    const patternBars = 1;
    const steps = rhythmCustomStepsPerBar(grid, timeSignature) * patternBars;
    const pattern = [];
    for (let i = 0; i < steps; i++) pattern.push(defaultRhythmCellForIndex(grid, i));
    const judgeTargets = pattern.map((c, i) => (c.hit ? i : -1)).filter((i) => i >= 0);
    return {
        version: 1,
        id: generateRhythmCustomStageId(),
        title: 'カスタムSTAGE',
        description: '', // v0.9.121：編集UIからは削除（互換のためキーは残す）
        grid: grid,
        timeSignature: timeSignature, // 拍子（v0.9.122）
        patternBars: patternBars,  // 小節単位（パターン1周の小節数）
        bars: 4,         // 初期小節数（STAGE開始時の練習小節数）
        bpm: 80,
        clickMode: 'all', // 互換のため残す（編集UIからは削除。クリックはSTAGE側で切替予定）
        pattern: pattern,
        motion: 'all-down',
        judgeTargets: judgeTargets,
        displayLabels: defaultRhythmDisplayLabels(grid, patternBars, timeSignature),
    };
}

/* 正規化：不正値を安全なデフォルトへ戻す（指板クルーズの考え方を参考に）。
   v0.9.120：pattern は「1小節分（grid に応じて4 or 8マス）」へ補正する。
   judgeTargets は hit:true のマスから自動生成、displayLabels は grid から自動生成。 */
function normalizeRhythmCustomStageSettings(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const def = getDefaultRhythmCustomStage();

    // timeSignature（拍子・v0.9.122）：未指定の旧データは 4/4。
    const timeSignature = rhythmCustomTimeSig(raw.timeSignature);
    // grid：拍子で使えない組み合わせ（6/8の quarter・三連符など）は安全な grid へ寄せる。
    const grid = rhythmCoerceGrid(raw.grid, timeSignature);
    // patternBars（小節単位）：未指定の旧データ（v0.9.119/120）は 1 として扱う。
    const patternBars = rhythmCustomPatternBars(raw.patternBars);
    const bars = RHYTHM_CUSTOM_BAR_OPTIONS.includes(raw.bars) ? raw.bars : 4;
    const bpm = clampNum(Math.round(Number(raw.bpm)), RHYTHM_CUSTOM_BPM_MIN, RHYTHM_CUSTOM_BPM_MAX, def.bpm);
    const clickMode = RHYTHM_CUSTOM_CLICK_MODES.includes(raw.clickMode) ? raw.clickMode : 'all';

    const title = String(raw.title == null ? '' : raw.title).trim() || def.title;
    // description は編集UIから削除（v0.9.121）。互換のため既存値があれば保持、無ければ空文字。
    const description = String(raw.description == null ? '' : raw.description).trim();

    // pattern は 拍子 × grid × patternBars 分へ補正。各マスを normalize し、足りない分は休みで補う。
    const steps = rhythmCustomStepsPerBar(grid, timeSignature) * patternBars;
    const srcPattern = Array.isArray(raw.pattern) ? raw.pattern : [];
    const pattern = [];
    for (let i = 0; i < steps; i++) {
        pattern.push(i < srcPattern.length ? normalizeRhythmCustomCell(srcPattern[i]) : makeRhythmRestCell());
    }

    // judgeTargets：hit:true のマスから自動生成（休み/空振り/タイは含めない）。
    const judgeTargets = pattern.map((c, i) => (c.hit ? i : -1)).filter(i => i >= 0);

    // displayLabels：拍子 × grid × patternBars から自動生成。
    const displayLabels = defaultRhythmDisplayLabels(grid, patternBars, timeSignature);

    const motion = typeof raw.motion === 'string' && raw.motion ? raw.motion : def.motion;
    const version = Number.isInteger(raw.version) ? raw.version : 1;
    const id = typeof raw.id === 'string' && raw.id ? raw.id : generateRhythmCustomStageId();

    return { version, id, title, description, grid, timeSignature, patternBars, bars, bpm, clickMode, pattern, motion, judgeTargets, displayLabels };
}

/* 1セルが占めるティック数（1拍=24・v0.9.122）。quarter:24 / eighth:12 / sixteenth:6 / thirtysecond:3 / 8分三連:8 / 16分三連:4。 */
function rhythmGridCellTicks(grid) {
    return RHYTHM_GRID_TICKS[grid] || RHYTHM_TPQ;
}

/* 拍子／grid／小節単位の変更時に、pattern を新しい長さへ「時間位置を保ったまま」安全に組み替える（v0.9.122）。
   既存マスは、同じ時間位置（ティック基準）に新セルが来るときだけ引き継ぎ、無ければ初期値で補う。
   from / to は { grid, patternBars, timeSignature } を渡す。
   2/4↔4分、4分↔8分↔16分↔32分、1小節↔複数小節、拍子変更 をすべて同じ規則で安全に変換できる
   （三連符↔2分割系は時間位置がほぼ一致しないため、その場合は多くが初期値で補われる）。 */
function rhythmResizePattern(pattern, from, to) {
    const src = Array.isArray(pattern) ? pattern.map(normalizeRhythmCustomCell) : [];
    const fromCell = rhythmGridCellTicks(from.grid);
    const toCell = rhythmGridCellTicks(to.grid);
    const toTs = rhythmCustomTimeSig(to.timeSignature);
    const toSteps = rhythmCustomStepsPerBar(to.grid, toTs) * rhythmCustomPatternBars(to.patternBars);
    const out = [];
    for (let j = 0; j < toSteps; j++) {
        const pos = j * toCell;                 // 新セルの時間位置（ティック基準）
        if (pos % fromCell === 0) {
            const oi = pos / fromCell;          // 同じ位置の旧セル番号
            if (oi < src.length) { out.push(src[oi]); continue; }
        }
        out.push(defaultRhythmCellForIndex(to.grid, j));
    }
    return out;
}

/* 保存済み一覧を取得（normalize済み・id必須・重複id補正） */
function getSavedRhythmCustomStages() {
    const arr = Array.isArray(state.rhythmProCustomStages) ? state.rhythmProCustomStages : [];
    const seen = new Set();
    return arr
        .map(s => normalizeRhythmCustomStageSettings(s))
        .filter(Boolean)
        .map(s => {
            let id = s.id;
            if (!id || seen.has(id)) id = generateRhythmCustomStageId();
            seen.add(id);
            return { ...s, id };
        });
}

/* 1件追加（新規）。上限超過なら null。 */
function addRhythmCustomStage(stage) {
    const incoming = normalizeRhythmCustomStageSettings(stage);
    if (!incoming) return null;
    const stages = getSavedRhythmCustomStages();
    if (stages.length >= RHYTHM_CUSTOM_STAGE_MAX_SAVED) return null;
    if (!incoming.id) incoming.id = generateRhythmCustomStageId();
    stages.push(incoming);
    state.rhythmProCustomStages = stages;
    saveSettings();
    return incoming;
}

/* id指定で上書き保存（編集画面の保存用・v0.9.120）。成功したら正規化済みstageを返す。 */
function updateRhythmCustomStage(stage) {
    const incoming = normalizeRhythmCustomStageSettings(stage);
    if (!incoming || !incoming.id) return null;
    const stages = getSavedRhythmCustomStages();
    const idx = stages.findIndex(s => s.id === incoming.id);
    if (idx < 0) return null;
    stages[idx] = incoming;
    state.rhythmProCustomStages = stages;
    saveSettings();
    return incoming;
}

/* id指定で削除。削除できたら true。 */
function deleteRhythmCustomStageById(id) {
    if (!id) return false;
    const stages = getSavedRhythmCustomStages();
    const filtered = stages.filter(s => s.id !== id);
    if (filtered.length === stages.length) return false;
    state.rhythmProCustomStages = filtered;
    saveSettings();
    return true;
}

/* クリップボードへコピー（navigator.clipboard 不可時は textarea フォールバック） */
async function copyTextToClipboard(text) {
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (_) { /* フォールバックへ */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch (_) {
        return false;
    }
}

/* 軽いトースト表示（コピー結果など） */
let rcToastTimer = 0;
function showRcToast(msg) {
    const el = els.rcToast;
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.add('is-show'));
    if (rcToastTimer) clearTimeout(rcToastTimer);
    rcToastTimer = setTimeout(() => {
        el.classList.remove('is-show');
        setTimeout(() => el.classList.add('hidden'), 220);
    }, 1400);
}

/* 整形済みJSONを自動コピー。成功＝トースト、失敗＝手動コピー用モーダルでJSONを表示。
   （PROカスタムSTAGEはJSONをAIへ渡すのが目的なので、失敗時も必ず取得できるようにする。） */
async function presentRhythmJson(text) {
    const ok = await copyTextToClipboard(text);
    if (ok) { showRcToast('コピーしました'); return; }
    showRhythmJsonModal(text);
}

/* 手動コピー用モーダルを開く（textareaに整形JSONを入れて全選択）。 */
function showRhythmJsonModal(text) {
    const ov = els.rcJsonModal, ta = els.rcJsonText;
    if (!ov || !ta) { showRcToast('コピーできませんでした'); return; }
    ta.value = text;
    ov.classList.remove('hidden');
    requestAnimationFrame(() => { try { ta.focus(); ta.select(); } catch (e) { /* noop */ } });
}

function hideRhythmJsonModal() {
    if (els.rcJsonModal) els.rcJsonModal.classList.add('hidden');
}

/* JSONコピー：指定STAGEを整形済みJSONでコピー（失敗時は手動コピー導線）。 */
async function copyRhythmCustomStageJson(id) {
    const stage = getSavedRhythmCustomStages().find(s => s.id === id);
    if (!stage) return;
    presentRhythmJson(JSON.stringify(stage, null, 2));
}

/* 新規作成：デフォルトSTAGEを1件保存して一覧を更新 */
function createNewRhythmCustomStage() {
    if (!isRhythmProCustomStageAvailable()) return;
    const added = addRhythmCustomStage(getDefaultRhythmCustomStage());
    if (!added) {
        showRcToast(`保存できる上限（${RHYTHM_CUSTOM_STAGE_MAX_SAVED}件）に達しています`);
        return;
    }
    renderRhythmCustomStages();
    showRcToast('カスタムSTAGEを追加しました');
}

/* 一覧描画 */
function renderRhythmCustomStages() {
    if (!els.proCustomList) return;
    const stages = getSavedRhythmCustomStages();
    els.proCustomList.innerHTML = '';
    if (els.proCustomEmpty) els.proCustomEmpty.classList.toggle('hidden', stages.length > 0);

    const clickModeLabel = { all: 'クリック：全部', downbeat: 'クリック：1拍目', none: 'クリック：なし' };
    const gridLabel = { quarter: '4分', eighth: '8分', sixteenth: '16分', thirtysecond: '32分', eighthTriplet: '8分三連', sixteenthTriplet: '16分三連' };

    stages.forEach((s) => {
        const card = document.createElement('div');
        card.className = 'pro-custom-card';
        card.dataset.id = s.id;
        const meta = [
            `<span class="pro-custom-chip">${gridLabel[s.grid] || s.grid}</span>`,
            `<span class="pro-custom-chip">${s.bars}小節</span>`,
            `<span class="pro-custom-chip">${s.bpm} BPM</span>`,
            `<span class="pro-custom-chip">${clickModeLabel[s.clickMode] || s.clickMode}</span>`,
        ].join('');
        card.innerHTML = `
            <div class="pro-custom-card-title">${escapeHtml(s.title)}</div>
            <div class="pro-custom-card-desc">${escapeHtml(s.description)}</div>
            <div class="pro-custom-card-meta">${meta}</div>
            <div class="pro-custom-card-actions">
                <button type="button" class="pro-custom-act is-test" data-act="test">テスト再生</button>
                <button type="button" class="pro-custom-act is-edit" data-act="edit">編集</button>
                <button type="button" class="pro-custom-act is-copy" data-act="copy">JSONコピー</button>
                <button type="button" class="pro-custom-act is-delete" data-act="delete">削除</button>
            </div>`;
        els.proCustomList.appendChild(card);
    });
}

/* ═══════════════════════════════════════════════════════════
   PROカスタムSTAGE 編集画面（v0.9.120）
   ・保存済みSTAGEを編集して上書き保存／JSONコピーする。
   ・編集中は proCustomEditDraft（正規化済みオブジェクト）を真実とし、
     入力のたびに更新する。保存で配列へ上書きする。
   ・練習開始・再生・判定エンジン接続は今回は行わない。
═══════════════════════════════════════════════════════════ */
let proCustomEditDraft = null; // 編集中のドラフト（normalize済み）

/* 編集画面を開く：保存済みSTAGEを読み込みドラフト化して表示。 */
function openRhythmProCustomEditor(id) {
    if (!isRhythmProCustomStageAvailable()) return;
    const saved = getSavedRhythmCustomStages().find(s => s.id === id);
    if (!saved) { showRcToast('STAGEが見つかりません'); return; }
    proCustomEditDraft = normalizeRhythmCustomStageSettings(saved);
    ensureRhythmVexFlow(); // 譜面ライブラリを先読み（編集画面を開いた時だけ・CDN不使用）
    renderRhythmCustomEditor();
    setHomeView('proCustomEdit');
}

/* ドラフトの各UIを現在値に同期。 */
function renderRhythmCustomEditor() {
    const d = proCustomEditDraft;
    if (!d) return;
    if (els.pceTitle) els.pceTitle.value = d.title;
    if (els.pceBpm) els.pceBpm.value = String(d.bpm);
    // プルダウン（拍子 / 最小音符 / 小節単位）の選択値と、初期小節数ステッパー表示を同期（v0.9.123）。
    if (els.pceTimeSig) els.pceTimeSig.value = d.timeSignature;
    if (els.pceGrid) {
        // 拍子で使えない最小音符（6/8の 4分・三連符など）は option を disabled にする。
        els.pceGrid.querySelectorAll('option').forEach((o) => {
            o.disabled = !rhythmGridAllowed(o.value, d.timeSignature);
        });
        els.pceGrid.value = d.grid;
    }
    if (els.pcePbars) els.pcePbars.value = String(d.patternBars);
    if (els.pceBarsVal) els.pceBarsVal.textContent = String(d.bars);
    renderRhythmEditorPattern();
}

/* data-属性つきセグメントの is-active を付け替える共通処理。 */
function setSegActive(container, attr, value) {
    if (!container) return;
    container.querySelectorAll('[data-' + attr + ']').forEach((b) => {
        b.classList.toggle('is-active', b.dataset[attr] === value);
    });
}

/* ───── VexFlow 譜面描画（v0.9.120：PROカスタムSTAGE編集UIを VexFlow 方式へ統合） ─────
   ローカル配置の vendor/vexflow.js を、編集画面を開いた時にだけ遅延読み込みする（CDN不使用）。
   PoC（_poc/vexflow-lane.html）で検証した「ピン留めON＝符頭中心をセル中心へ」を本仕様とする。 */
const RHYTHM_VEX_CELL_W = 64;   // 1セルの横幅(px)。タップ格子・ピン留めで共有。
const RHYTHM_VEX_LANE_H = 104;  // 譜面レーンの高さ(px)
const RHYTHM_SVGNS = 'http://www.w3.org/2000/svg';
let rhythmVexState = 'idle';    // idle | loading | ready | error
const rhythmVexWaiters = [];

/* 読み込み済みなら VexFlow 名前空間を返す。未ロードなら null。 */
function getRhythmVexFlow() {
    const V = window.Vex && (window.Vex.Flow || window.Vex);
    return (V && V.Stave) ? V : null;
}

/* VexFlow をローカルから一度だけ遅延読み込み。準備できたら cb(ok) を呼ぶ。 */
function ensureRhythmVexFlow(cb) {
    if (getRhythmVexFlow()) { rhythmVexState = 'ready'; if (cb) cb(true); return; }
    if (cb) rhythmVexWaiters.push(cb);
    if (rhythmVexState === 'loading') return;
    rhythmVexState = 'loading';
    const s = document.createElement('script');
    s.src = 'vendor/vexflow.js?v=0.9.130';
    s.async = true;
    s.onload = () => {
        rhythmVexState = getRhythmVexFlow() ? 'ready' : 'error';
        const ok = rhythmVexState === 'ready';
        rhythmVexWaiters.splice(0).forEach((f) => f(ok));
    };
    s.onerror = () => { rhythmVexState = 'error'; rhythmVexWaiters.splice(0).forEach((f) => f(false)); };
    document.head.appendChild(s);
}

/* ティック長 → VexFlow duration（1拍=24ティック・v0.9.122）。24=q / 12=8 / 6=16 / 3=32。rest は 'r'。 */
function rhythmTicksToDuration(ticks, isRest) {
    const base = ticks >= 24 ? 'q' : (ticks >= 12 ? '8' : (ticks >= 6 ? '16' : '32'));
    return base + (isRest ? 'r' : '');
}

/* まとまり(連桁グループ)内のひとかたまりを、記譜できる単位 {24,12,6,3ティック} に分解。
   各単位は「その単位の長さで割り切れる位置」から始める（自然な記譜・タイになる）。 */
function rhythmDecomposeBinary(start, len) {
    const sizes = [24, 12, 6, 3];
    const out = [];
    let s = start, rem = len;
    while (rem > 0) {
        let placed = false;
        for (const size of sizes) {
            if (size <= rem && s % size === 0) { out.push({ start: s, len: size }); s += size; rem -= size; placed = true; break; }
        }
        if (!placed) { out.push({ start: s, len: 3 }); s += 3; rem -= 3; }
    }
    return out;
}

/* 連桁の拍まとまり（VexFlow Fraction）。単純拍子=1/4、複合6/8=3/8（付点4分）。 */
function rhythmBeamGroupFraction(VF, info) {
    return info.compound ? new VF.Fraction(3, 8) : new VF.Fraction(1, 4);
}

/* 2分割系（quarter/eighth/sixteenth/thirtysecond）の VexFlow 変換（v0.9.122）。
   hit＋連続tie を1つの長い音符にまとめ、連桁まとまり境界で区切り、記譜単位へ分解してタイで繋ぐ。
   返り値 items：{ note, cellIndex(ピン留め用), isRest, tieToPrev }。tuplets/beamLists は使わない。 */
function rhythmBuildBinaryItems(d, VF) {
    const { StaveNote, Stem } = VF;
    const grid = d.grid;
    const ts = rhythmCustomTimeSig(d.timeSignature);
    const info = rhythmTimeSigInfo(ts);
    const cellTicks = rhythmGridCellTicks(grid);

    // セル列 → イベント（音符/休符）列（ティック長）
    const events = [];
    d.pattern.forEach((cell) => {
        if (cell.type === 'hit') events.push({ kind: 'note', durT: cellTicks });
        else if (cell.type === 'tie') {
            const prev = events[events.length - 1];
            if (prev && prev.kind === 'note') prev.durT += cellTicks;
            else events.push({ kind: 'rest', durT: cellTicks }); // 先頭tieは休符扱い
        } else {
            const prev = events[events.length - 1];
            if (prev && prev.kind === 'rest') prev.durT += cellTicks;
            else events.push({ kind: 'rest', durT: cellTicks });
        }
    });
    let pos = 0;
    events.forEach((ev) => { ev.startT = pos; pos += ev.durT; });

    const items = [];
    const group = info.beamGroupTicks;
    events.forEach((ev) => {
        const isRest = (ev.kind === 'rest');
        let s = ev.startT, rem = ev.durT, first = true;
        while (rem > 0) {
            const nextBoundary = Math.floor(s / group) * group + group;
            const take = Math.min(rem, nextBoundary - s);
            rhythmDecomposeBinary(s, take).forEach((pc) => {
                const note = new StaveNote({ keys: ['b/4'], duration: rhythmTicksToDuration(pc.len, isRest), stem_direction: Stem.UP });
                items.push({ note, cellIndex: pc.start / cellTicks, isRest, tieToPrev: (!isRest && !first) });
                first = false;
            });
            s += take; rem -= take;
        }
    });
    return { items, tuplets: [], beamLists: null };
}

/* 三連符系（8分三連/16分三連）の VexFlow 変換（v0.9.122）。
   1セル=1つの連符音符。8分三連は3つで1拍、16分三連は3つで半拍（1拍に2グループ）。
   各グループを Tuplet(3:2) で囲み、連続する非休符を連桁する。
   hit=音符、tie=直前へタイ（同じ長さの音符を弧で繋ぐ）、rest=休符。 */
function rhythmBuildTripletItems(d, VF) {
    const { StaveNote, Stem, Tuplet } = VF;
    const grid = d.grid;
    const baseDur = grid === 'eighthTriplet' ? '8' : '16';
    const items = [];
    const tuplets = [];
    const beamLists = [];
    const cells = d.pattern;
    let lastWasNote = false;

    for (let g = 0; g < cells.length; g += 3) {
        const groupNotes = [];
        let run = [];
        const flushRun = () => { if (run.length >= 2) beamLists.push(run.slice()); run = []; };
        for (let k = 0; k < 3; k++) {
            const i = g + k;
            const cell = cells[i];
            if (!cell) break;
            let isRest, tieToPrev = false;
            if (cell.type === 'hit') { isRest = false; tieToPrev = false; lastWasNote = true; }
            else if (cell.type === 'tie') {
                if (lastWasNote) { isRest = false; tieToPrev = true; lastWasNote = true; }
                else { isRest = true; lastWasNote = false; }
            } else { isRest = true; lastWasNote = false; }
            const note = new StaveNote({ keys: ['b/4'], duration: baseDur + (isRest ? 'r' : ''), stem_direction: Stem.UP });
            items.push({ note, cellIndex: i, isRest, tieToPrev });
            groupNotes.push(note);
            if (!isRest) run.push(note); else flushRun();
        }
        flushRun();
        if (groupNotes.length && Tuplet) {
            tuplets.push(new Tuplet(groupNotes, { num_notes: 3, notes_occupied: 2, bracketed: true, ratioed: false }));
        }
    }
    return { items, tuplets, beamLists };
}

/* grid に応じて VexFlow 用アイテムを生成（2分割系 or 三連符系）。 */
function rhythmBuildVexItems(d, VF) {
    return RHYTHM_GRID_IS_TRIPLET[d.grid] ? rhythmBuildTripletItems(d, VF) : rhythmBuildBinaryItems(d, VF);
}

/* 矢印（下段）の表示。hit は通常の ↓/↑。休符/タイは「音は出さないが手は動く」を括弧つきで示し、
   方向が無い（null）ときは非表示。矢印記号は縦に伸ばして棒を長く見せる（pce-arrow-mark）。 */
function rhythmArrowGlyph(cell) {
    const dir = cell.dir === 'up' ? 'up' : (cell.dir === 'down' ? 'down' : null);
    if (cell.type === 'hit') {
        const a = (cell.dir === 'up') ? '↑' : '↓';
        return '<span class="pce-arrow-mark">' + a + '</span>';
    }
    // rest / tie（ghost は rest 扱い）：方向があれば括弧つき、無ければ表示しない。
    if (!dir) return '';
    const a = (dir === 'up') ? '↑' : '↓';
    return '<span class="pce-arrow-paren">(</span><span class="pce-arrow-mark">' + a + '</span><span class="pce-arrow-paren">)</span>';
}

/* 現在の音符レーン横スクロール位置を取得。タップ後の再描画で同じ位置に戻すために使う。 */
function getRhythmPatternScrollLeft() {
    const scroller = els.pcePattern ? els.pcePattern.querySelector('.pce-vex-scroll') : null;
    return scroller ? scroller.scrollLeft : 0;
}

/* 再描画後の音符レーン横スクロール位置を復元。
   DOM再生成直後と次フレームの両方で入れることで、ブラウザ描画タイミング差を吸収する。 */
function restoreRhythmPatternScrollLeft(scrollLeft) {
    if (!Number.isFinite(scrollLeft)) return;
    const restore = () => {
        const scroller = els.pcePattern ? els.pcePattern.querySelector('.pce-vex-scroll') : null;
        if (!scroller) return;
        const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        scroller.scrollLeft = Math.max(0, Math.min(scrollLeft, max));
    };
    restore();
    requestAnimationFrame(restore);
}

/* 1小節パターンを VexFlow 譜面＋透明タップ格子＋下段ストローク方向UIで描画（v0.9.120 VexFlow統合）。
   VexFlow 未ロード時は読み込みを促し、準備後に再描画する。描画のみで保存形式は変更しない。
   opts.preserveScrollLeft を渡した場合だけ、再描画後に横スクロール位置を復元する。 */
function renderRhythmEditorPattern(opts) {
    const d = proCustomEditDraft;
    if (!d || !els.pcePattern) return;
    const preserveScrollLeft = opts && Number.isFinite(opts.preserveScrollLeft) ? opts.preserveScrollLeft : null;
    const VF = getRhythmVexFlow();
    if (!VF) {
        els.pcePattern.innerHTML = '<p class="pce-vex-loading">譜面を準備中です…</p>';
        ensureRhythmVexFlow((ok) => {
            if (proCustomEditDraft !== d) return; // 別STAGEに切替済みなら破棄
            if (ok) renderRhythmEditorPattern(opts);
            else els.pcePattern.innerHTML = '<p class="pce-vex-loading">譜面の読み込みに失敗しました。ページを更新してください。</p>';
        });
        return;
    }
    drawRhythmVexLane(VF, d);
    if (preserveScrollLeft != null) restoreRhythmPatternScrollLeft(preserveScrollLeft);
}

/* VexFlow で grid × patternBars 分を描画し、その上に透明タップ格子・下段ストローク方向UI・拍ラベルを重ねる（v0.9.121）。
   ピン留めON固定：各音符の符頭中心を開始セル中心へ合わせ、横基準線は符頭中心Yに1本だけ引く。
   複数小節時は小節線を引き、タップ格子・矢印もセル数ぶん増やす（横スクロール前提）。 */
function drawRhythmVexLane(VF, d) {
    const { Renderer, Stave, StaveTie, Beam, Voice, Formatter } = VF;
    const ts = rhythmCustomTimeSig(d.timeSignature);
    const info = rhythmTimeSigInfo(ts);
    const N = d.pattern.length;
    const cellW = RHYTHM_VEX_CELL_W;
    const laneW = N * cellW;
    const H = RHYTHM_VEX_LANE_H;
    const cellTicks = rhythmGridCellTicks(d.grid);
    const stepsPerBar = rhythmCustomStepsPerBar(d.grid, ts);   // 1小節のセル数（拍子×grid）
    const patternBars = rhythmCustomPatternBars(d.patternBars) || Math.max(1, Math.round(N / stepsPerBar));
    const beatCells = Math.max(1, Math.round(info.beamGroupTicks / cellTicks)); // 拍頭(まとまり頭)の間隔セル数
    const barLabels = rhythmBarLabelCells(d.grid, ts);          // 1小節分のラベル＋強調レベル

    els.pcePattern.innerHTML = '';
    const scroll = document.createElement('div');
    scroll.className = 'pce-vex-scroll';
    const lane = document.createElement('div');
    lane.className = 'pce-vex-lane';
    lane.style.width = laneW + 'px';
    lane.style.setProperty('--pce-cell', cellW + 'px');
    const scoreEl = document.createElement('div');
    scoreEl.className = 'pce-vex-score';
    lane.appendChild(scoreEl);
    scroll.appendChild(lane);
    els.pcePattern.appendChild(scroll);

    // --- VexFlow 譜面 ---
    const built = rhythmBuildVexItems(d, VF);
    const items = built.items;
    const notes = items.map((it) => it.note);

    const renderer = new Renderer(scoreEl, Renderer.Backends.SVG);
    renderer.resize(laneW, H);
    const ctx = renderer.getContext();
    ctx.setFillStyle('#ffd166');
    ctx.setStrokeStyle('#ffd166');

    const stave = new Stave(0, 24, laneW);
    stave.setNumLines(1);
    stave.setContext(ctx); // 標準の単線は符頭中心と一致しないため線は描かない

    const voice = new Voice({ num_beats: info.beats * patternBars, beat_value: info.beatValue });
    voice.setStrict(false);
    voice.addTickables(notes);
    // 連桁：三連符系はグループごとに手動、2分割系はまとまり(1/4 or 3/8)ごとに自動生成。
    let beams;
    if (built.beamLists) {
        beams = built.beamLists.map((list) => new Beam(list));
    } else {
        beams = Beam.generateBeams(notes, { groups: [rhythmBeamGroupFraction(VF, info)], beam_rests: false, maintain_stem_directions: true });
    }
    new Formatter().joinVoices([voice]).format([voice], Math.max(1, laneW - 24));
    notes.forEach((n) => n.setStave(stave)); // 絶対X計算に stave 左オフセットを含める

    // ピン留めON（本仕様）：符頭中心を開始セル中心へ寄せる（結合した長い音符も開始セル側に置く）。
    items.forEach((it) => {
        const desiredCenter = (it.cellIndex + 0.5) * cellW;
        const center = it.note.getNoteHeadBeginX() + it.note.getGlyphWidth() / 2;
        it.note.setXShift(desiredCenter - center);
    });

    voice.draw(ctx, stave);
    beams.forEach((b) => b.setContext(ctx).draw());
    built.tuplets.forEach((t) => { try { t.setContext(ctx).draw(); } catch (e) { /* noop */ } });
    for (let i = 1; i < items.length; i++) {
        if (items[i].tieToPrev) {
            new StaveTie({ first_note: items[i - 1].note, last_note: items[i].note, first_indices: [0], last_indices: [0] })
                .setContext(ctx).draw();
        }
    }

    // 横基準線：実際に描かれた符頭中心Yに1本だけ（符頭の背面）。
    let baselineY = null;
    for (const it of items) {
        if (it.isRest) continue;
        try { const ys = it.note.getYs(); if (ys && ys.length) { baselineY = ys[0]; break; } } catch (e) { /* noop */ }
    }
    if (baselineY == null) baselineY = stave.getYForLine(0);
    const svg = scoreEl.querySelector('svg');
    if (svg) {
        const line = document.createElementNS(RHYTHM_SVGNS, 'line');
        line.setAttribute('x1', '0'); line.setAttribute('y1', String(baselineY));
        line.setAttribute('x2', String(laneW)); line.setAttribute('y2', String(baselineY));
        line.setAttribute('stroke', 'rgba(253,246,238,0.22)');
        line.setAttribute('stroke-width', '1.4');
        svg.insertBefore(line, svg.firstChild);
        // ※小節線は譜面(SVG)側には描かない。音符・矢印・ラベルを上から下まで貫く1本の
        //   オーバーレイ(下の pce-vex-barlines)でまとめて描き、線が分断/重複しないようにする。
    }

    // --- 透明タップ格子（音符ゾーン） ---
    const tap = document.createElement('div');
    tap.className = 'pce-vex-tapgrid';
    tap.style.height = H + 'px';
    d.pattern.forEach((cell, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        const isBeat = ((i % stepsPerBar) % beatCells === 0);
        const isBarStart = (i % stepsPerBar === 0);
        b.className = 'pce-tap-cell' + (isBeat ? ' beat' : '') + (isBarStart ? ' bar-start' : '');
        b.dataset.index = String(i);
        b.dataset.zone = 'note';
        b.setAttribute('aria-label', '音符を切り替え');
        tap.appendChild(b);
    });
    lane.appendChild(tap);

    // --- 下段ストローク方向UI＋拍ラベル ---
    const arrowrow = document.createElement('div');
    arrowrow.className = 'pce-vex-arrowrow';
    const beatrow = document.createElement('div');
    beatrow.className = 'pce-vex-beatrow';
    d.pattern.forEach((cell, i) => {
        const isBarStart = (i % stepsPerBar === 0);
        const a = document.createElement('button');
        a.type = 'button';
        a.className = 'pce-arrow pce-arrow-' + cell.type + (isBarStart ? ' bar-start' : '');
        a.dataset.index = String(i);
        a.dataset.zone = 'arrow';
        a.setAttribute('aria-label', 'ストローク方向を切り替え');
        a.innerHTML = rhythmArrowGlyph(cell);
        arrowrow.appendChild(a);

        const lab = barLabels[i % stepsPerBar] || { t: '', s: 'faint' };
        const bc = document.createElement('div');
        bc.className = 'pce-beat-cell'
            + (lab.s === 'mid' ? ' is-mid' : '')
            + (lab.s === 'faint' ? ' is-faint' : '')
            + (isBarStart ? ' bar-start' : '');
        bc.textContent = lab.t;
        beatrow.appendChild(bc);
    });
    lane.appendChild(arrowrow);
    lane.appendChild(beatrow);

    // --- 小節線オーバーレイ ---
    // 小節境界は、譜面・タップ格子・矢印・ラベルに別々の線を出さず、レーン全体（上端〜下端）を
    // 同じX座標で貫く1本の縦線として描く。太さ・色はレーン両端の小節枠と揃える。
    // pointer-events:none なので、線の真下のタップ判定はそのまま機能する（タップ仕様は不変）。
    if (patternBars > 1) {
        const overlay = document.createElement('div');
        overlay.className = 'pce-vex-barlines';
        for (let bIdx = 1; bIdx < patternBars; bIdx++) {
            const x = bIdx * stepsPerBar * cellW;
            const bar = document.createElement('div');
            bar.className = 'pce-vex-barline';
            bar.style.left = (x - 1) + 'px'; // 2px幅を境界Xの中央に乗せる
            overlay.appendChild(bar);
        }
        lane.appendChild(overlay);
    }
}

/* ── カスタムSTAGEテスト再生：読み取り専用のVexFlow譜面プレビュー（v0.9.125）──────────
   編集画面の VexFlow 描画ロジック（rhythmBuildVexItems / rhythmTimeSigInfo /
   rhythmBeamGroupFraction など）をそのまま再利用し、テスト再生画面に静的な譜面だけを表示する。
   編集画面と違い、タップ格子・下段矢印・拍ラベルなどの編集UIは描かない（読み取り専用）。
   既存の流れるCanvas判定レーン（drawLane / drawQuarterNote）には一切触れない。 */
function drawRhythmVexPreview(VF, d, mount) {
    const { Renderer, Stave, StaveTie, Beam, Voice, Formatter } = VF;
    const ts = rhythmCustomTimeSig(d.timeSignature);
    const info = rhythmTimeSigInfo(ts);
    const N = d.pattern.length;
    const cellW = RHYTHM_VEX_CELL_W;
    const laneW = N * cellW;
    const H = RHYTHM_VEX_LANE_H;
    const cellTicks = rhythmGridCellTicks(d.grid);
    const stepsPerBar = rhythmCustomStepsPerBar(d.grid, ts);
    const patternBars = rhythmCustomPatternBars(d.patternBars) || Math.max(1, Math.round(N / stepsPerBar));

    mount.innerHTML = '';
    const scroll = document.createElement('div');
    scroll.className = 'pce-vex-scroll';
    const lane = document.createElement('div');
    lane.className = 'pce-vex-lane';
    lane.style.width = laneW + 'px';
    lane.style.height = H + 'px';                 // 読み取り専用：高さは譜面1段ぶんに固定
    lane.style.setProperty('--pce-cell', cellW + 'px');
    const scoreEl = document.createElement('div');
    scoreEl.className = 'pce-vex-score';
    lane.appendChild(scoreEl);
    scroll.appendChild(lane);
    mount.appendChild(scroll);

    const built = rhythmBuildVexItems(d, VF);
    const items = built.items;
    const notes = items.map((it) => it.note);

    const renderer = new Renderer(scoreEl, Renderer.Backends.SVG);
    renderer.resize(laneW, H);
    const ctx = renderer.getContext();
    ctx.setFillStyle('#ffd166');
    ctx.setStrokeStyle('#ffd166');

    const stave = new Stave(0, 24, laneW);
    stave.setNumLines(1);
    stave.setContext(ctx);

    const voice = new Voice({ num_beats: info.beats * patternBars, beat_value: info.beatValue });
    voice.setStrict(false);
    voice.addTickables(notes);
    let beams;
    if (built.beamLists) {
        beams = built.beamLists.map((list) => new Beam(list));
    } else {
        beams = Beam.generateBeams(notes, { groups: [rhythmBeamGroupFraction(VF, info)], beam_rests: false, maintain_stem_directions: true });
    }
    new Formatter().joinVoices([voice]).format([voice], Math.max(1, laneW - 24));
    notes.forEach((n) => n.setStave(stave));
    items.forEach((it) => {
        const desiredCenter = (it.cellIndex + 0.5) * cellW;
        const center = it.note.getNoteHeadBeginX() + it.note.getGlyphWidth() / 2;
        it.note.setXShift(desiredCenter - center);
    });

    voice.draw(ctx, stave);
    beams.forEach((b) => b.setContext(ctx).draw());
    built.tuplets.forEach((t) => { try { t.setContext(ctx).draw(); } catch (e) { /* noop */ } });
    for (let i = 1; i < items.length; i++) {
        if (items[i].tieToPrev) {
            new StaveTie({ first_note: items[i - 1].note, last_note: items[i].note, first_indices: [0], last_indices: [0] })
                .setContext(ctx).draw();
        }
    }

    let baselineY = null;
    for (const it of items) {
        if (it.isRest) continue;
        try { const ys = it.note.getYs(); if (ys && ys.length) { baselineY = ys[0]; break; } } catch (e) { /* noop */ }
    }
    if (baselineY == null) baselineY = stave.getYForLine(0);
    const svg = scoreEl.querySelector('svg');
    if (svg) {
        const line = document.createElementNS(RHYTHM_SVGNS, 'line');
        line.setAttribute('x1', '0'); line.setAttribute('y1', String(baselineY));
        line.setAttribute('x2', String(laneW)); line.setAttribute('y2', String(baselineY));
        line.setAttribute('stroke', 'rgba(253,246,238,0.22)');
        line.setAttribute('stroke-width', '1.4');
        svg.insertBefore(line, svg.firstChild);
    }

    if (patternBars > 1) {
        const overlay = document.createElement('div');
        overlay.className = 'pce-vex-barlines';
        for (let bIdx = 1; bIdx < patternBars; bIdx++) {
            const x = bIdx * stepsPerBar * cellW;
            const bar = document.createElement('div');
            bar.className = 'pce-vex-barline';
            bar.style.left = (x - 1) + 'px';
            overlay.appendChild(bar);
        }
        lane.appendChild(overlay);
    }
}

/* テスト再生画面の譜面プレビューを描画（VexFlow 未ロード時は読み込み→再描画、失敗時はメッセージ）。
   stage は eng.custom（正規化済みカスタムSTAGE）。VexFlow が無くてもテスト再生本体は壊さない。 */
function renderRhythmCustomTestPreview(stage) {
    if (!els.customTestPreview || !els.customTestPreviewScore) return;
    if (!stage || !stage.pattern || !stage.pattern.length) { hideRhythmCustomTestPreview(); return; }
    els.customTestPreview.classList.remove('hidden');
    const VF = getRhythmVexFlow();
    if (!VF) {
        els.customTestPreviewScore.innerHTML = '<p class="pce-vex-loading">譜面プレビューを準備中です…</p>';
        ensureRhythmVexFlow((ok) => {
            if (eng.custom !== stage) return; // 既に別STAGE/退出済みなら破棄
            if (ok) renderRhythmCustomTestPreview(stage);
            else els.customTestPreviewScore.innerHTML = '<p class="pce-vex-loading">譜面プレビューを表示できませんでした。</p>';
        });
        return;
    }
    try {
        drawRhythmVexPreview(VF, stage, els.customTestPreviewScore);
    } catch (e) {
        els.customTestPreviewScore.innerHTML = '<p class="pce-vex-loading">譜面プレビューを表示できませんでした。</p>';
    }
}

/* 譜面プレビューを隠して中身を空にする（STAGE1や編集に戻る・TOP等で確実に消す）。 */
function hideRhythmCustomTestPreview() {
    if (els.customTestPreview) els.customTestPreview.classList.add('hidden');
    if (els.customTestPreviewScore) els.customTestPreviewScore.innerHTML = '';
}

/* ── 流れるVexFlow譜面レイヤー（v0.9.126・Step1）─────────────────────────
   lane-wrap 内に置いた、カスタムSTAGEテスト再生専用のレイヤー枠の表示/非表示。
   今回はまだ譜面を流し込まない（枠だけ）。STAGE1/基礎練では必ず隠す。 */
function showCustomFlowScoreLayer() {
    if (els.customFlowScoreLayer) els.customFlowScoreLayer.classList.remove('hidden');
}
function hideCustomFlowScoreLayer() {
    rhythmFlowScoreReady = false; // 譜面が無い＝Canvas音符本体を従来どおり表示（防御・v0.9.130）
    if (!els.customFlowScoreLayer) return;
    els.customFlowScoreLayer.classList.add('hidden');
    els.customFlowScoreLayer.innerHTML = ''; // 流し込み内容を確実にクリア
}

/* ── 流れるVexFlow譜面の静止描画（v0.9.127・Step2）─────────────────────────
   lane-wrap 内の流し込みレイヤーに、カスタムSTAGEの譜面を VexFlow で静止描画する。
   座標は既存Canvas判定レーンに合わせる：
     ・セル間隔 cellW = state.pxPerBeat * (eng.cellTicks / 24)  ← Canvasのセル間隔と一致
     ・セル i の符頭中心を x = state.judgeX + i*cellW に置く（セル0＝JUSTライン＝再生時刻 t=T0 のスナップショット）
     ・符頭の縦位置を Canvasの音符中心 yc=高さ*0.56 に合わせる
   今回はまだ横移動しない（静止）。Canvas音符・drawLane・drawQuarterNote には一切触れない。
   VexFlow未ロード/失敗でもテスト再生本体は壊さない（レイヤーは空のまま）。 */
function renderRhythmFlowScore() {
    const layer = els.customFlowScoreLayer;
    if (!layer || !eng.custom || !eng.pattern || !eng.pattern.length) { rhythmFlowScoreReady = false; return; }
    const VF = getRhythmVexFlow();
    if (!VF) {
        // VexFlow未ロード：この時点では譜面を出せないので Canvas音符本体は従来どおり表示（防御）。
        rhythmFlowScoreReady = false;
        if (!state.running) drawLane(state.currentTime || 0);
        ensureRhythmVexFlow((ok) => {
            if (ok && eng.custom) renderRhythmFlowScore(); // ロード完了後に再描画
        });
        return;
    }
    try { drawRhythmFlowScore(VF); rhythmFlowScoreReady = true; }
    catch (e) { layer.innerHTML = ''; rhythmFlowScoreReady = false; } // 失敗時はCanvas音符を残す
    // 音符本体の表示/非表示（カスタム×描画OKで非表示）を即時反映。再生中は loop の drawLane が反映する。
    if (!state.running) drawLane(state.currentTime || 0);
}

/* 流れるVexFlow譜面用の表示データを作る（v0.9.130）。
   判定エンジン側の eng.pattern は1ループ分のまま触らず、表示用だけ state.bars 小節ぶんへ展開する。
   patternBars=1/state.bars=4 なら1小節パターンを4回、patternBars=2/state.bars=4 なら2回、という形。 */
function buildRhythmFlowDisplayStage() {
    const d = eng.custom;
    if (!d || !eng.pattern || !eng.pattern.length) return null;
    const ts = rhythmCustomTimeSig(d.timeSignature);
    const stepsPerBar = rhythmCustomStepsPerBar(d.grid, ts);
    const targetBars = Math.max(1, Math.round(state.bars || d.bars || 1));
    const targetCells = stepsPerBar * targetBars;
    const pattern = [];
    for (let i = 0; i < targetCells; i++) {
        pattern.push(normalizeRhythmCustomCell(eng.pattern[i % eng.pattern.length]));
    }
    return Object.assign({}, d, { pattern, patternBars: targetBars });
}

function drawRhythmFlowScore(VF) {
    const { Renderer, Stave, StaveTie, Beam, Voice, Formatter } = VF;
    const layer = els.customFlowScoreLayer;
    const d = buildRhythmFlowDisplayStage();
    if (!d) throw new Error('flow score data is empty');
    const ts = rhythmCustomTimeSig(d.timeSignature);
    const info = rhythmTimeSigInfo(ts);
    const N = d.pattern.length;
    const H = (lane && lane.h) ? lane.h : 168;
    const yc = H * 0.56;                                            // Canvasの音符中心(drawLane)と同じ
    const judgeX = state.judgeX;
    const cellW = state.pxPerBeat * (eng.cellTicks / RHYTHM_TPQ);   // Canvasのセル間隔と一致
    const stepsPerBar = rhythmCustomStepsPerBar(d.grid, ts);
    const patternBars = rhythmCustomPatternBars(d.patternBars) || Math.max(1, Math.round(N / stepsPerBar));
    const laneW = Math.ceil(judgeX + N * cellW + cellW);           // 右に1セルぶん余白

    layer.innerHTML = '';
    const scoreEl = document.createElement('div');
    scoreEl.className = 'custom-flow-score';
    layer.appendChild(scoreEl);

    const built = rhythmBuildVexItems(d, VF);
    const items = built.items;
    const notes = items.map((it) => it.note);

    const renderer = new Renderer(scoreEl, Renderer.Backends.SVG);
    renderer.resize(laneW, H);
    const ctx = renderer.getContext();
    ctx.setFillStyle('#ffd166');
    ctx.setStrokeStyle('#ffd166');

    const stave = new Stave(0, 24, laneW);
    stave.setNumLines(1);
    stave.setContext(ctx);

    const voice = new Voice({ num_beats: info.beats * patternBars, beat_value: info.beatValue });
    voice.setStrict(false);
    voice.addTickables(notes);
    let beams;
    if (built.beamLists) {
        beams = built.beamLists.map((list) => new Beam(list));
    } else {
        beams = Beam.generateBeams(notes, { groups: [rhythmBeamGroupFraction(VF, info)], beam_rests: false, maintain_stem_directions: true });
    }
    new Formatter().joinVoices([voice]).format([voice], Math.max(1, laneW - 24));
    notes.forEach((n) => n.setStave(stave));
    // ピン留め：セル i の符頭中心を judgeX + i*cellW（=Canvasのセル中心。セル0=JUSTライン）へ
    items.forEach((it) => {
        const desiredCenter = judgeX + it.cellIndex * cellW;
        const center = it.note.getNoteHeadBeginX() + it.note.getGlyphWidth() / 2;
        it.note.setXShift(desiredCenter - center);
    });

    voice.draw(ctx, stave);
    beams.forEach((b) => b.setContext(ctx).draw());
    built.tuplets.forEach((t) => { try { t.setContext(ctx).draw(); } catch (e) { /* noop */ } });
    for (let i = 1; i < items.length; i++) {
        if (items[i].tieToPrev) {
            new StaveTie({ first_note: items[i - 1].note, last_note: items[i].note, first_indices: [0], last_indices: [0] })
                .setContext(ctx).draw();
        }
    }

    // 縦位置合わせ：実際の符頭YをCanvasの音符中心(yc)に合わせる量を記憶（横移動と合成してtransformへ）
    let headY = null;
    for (const it of items) {
        if (it.isRest) continue;
        try { const ys = it.note.getYs(); if (ys && ys.length) { headY = ys[0]; break; } } catch (e) { /* noop */ }
    }
    rhythmFlowVY = (headY != null) ? (yc - headY) : 0;
    // 初期位置（スタンバイ=t0 / 再生中=現在時刻）に合わせて横移動量を反映
    updateCustomFlowScorePosition(state.running ? state.currentTime : 0);
}

/* 流れる譜面の横移動（v0.9.128・Step3）。毎フレーム transform だけ更新する（VexFlowは再描画しない）。
   既存Canvas判定レーン drawLane(rawT) と同じ t / gridDispOff（表示補正）を使い、ズレないようにする。
   静止描画でセル i の符頭中心は judgeX + i*cellW に置いてあるので、横移動量は
     tx = (state.T0 + gridDispOff - t) * state.pxPerMs   ← judgeX はセル位置側に内包済み
   セル0の符頭中心が JUSTライン(judgeX) を通過する時刻が t=T0（=判定基準）に一致する。
   流し込みレイヤー(custom-flow-score)が無い＝STAGE1/通常STAGEのときは何もしない。 */
let rhythmFlowVY = 0; // 流れる譜面の縦位置オフセット（符頭をCanvas音符中心へ合わせる量）
let rhythmFlowScoreReady = false; // VexFlow流し込み譜面が正常描画できているか（true時だけCanvas音符本体を隠す・v0.9.130）
function updateCustomFlowScorePosition(rawT) {
    const layer = els.customFlowScoreLayer;
    if (!layer) return;
    const scoreEl = layer.firstElementChild;
    if (!scoreEl || !scoreEl.classList.contains('custom-flow-score')) return;
    // drawLane と同じ表示時刻 t / 表示補正 gridDispOff（タップ＝出力遅延を戻す・ストローク＝イヤホン音ズレ補正）
    const t = (state.inputMode === 'tap') ? (rawT - tapOutputOffsetMs()) : rawT;
    const gridDispOff = (state.inputMode === 'tap') ? 0 : (mic.headphoneOutputOffsetMs || 0);
    const tx = (state.T0 + gridDispOff - t) * state.pxPerMs;
    scoreEl.style.transform = 'translate(' + tx + 'px,' + rhythmFlowVY + 'px)';
}

/* 音符（上段）タップ：音符 → 休符 → タイ → 音符（空振りは廃止）。
   休符/タイでも括弧つき矢印を出すため dir は引き継ぐ（無ければ down）。 */
function tapRhythmEditorNote(index) {
    const d = proCustomEditDraft;
    if (!d || !d.pattern[index]) return;
    const scrollLeft = getRhythmPatternScrollLeft();
    const cur = d.pattern[index];
    const dir = RHYTHM_CUSTOM_DIRS.includes(cur.dir) ? cur.dir : 'down';
    let next;
    if (cur.type === 'hit') next = { hit: false, dir: dir, type: 'rest' };
    else if (cur.type === 'rest') next = { hit: false, dir: dir, type: 'tie' };
    else next = { hit: true, dir: dir, type: 'hit' }; // tie（旧 ghost）→ 音符
    d.pattern[index] = next;
    renderRhythmEditorPattern({ preserveScrollLeft: scrollLeft });
}

/* 矢印（下段）タップ。
   hit：↓ ↔ ↑ のトグル。
   rest / tie：(↓) → (↑) → なし(null) → (↓) の巡回（手の動きだけを切り替える）。 */
function tapRhythmEditorArrow(index) {
    const d = proCustomEditDraft;
    if (!d || !d.pattern[index]) return;
    const scrollLeft = getRhythmPatternScrollLeft();
    const cur = d.pattern[index];
    if (cur.type === 'hit') {
        const dir = cur.dir === 'up' ? 'down' : 'up';
        d.pattern[index] = { hit: true, dir: dir, type: 'hit' };
    } else if (cur.type === 'rest' || cur.type === 'tie') {
        let dir;
        if (cur.dir === 'down') dir = 'up';
        else if (cur.dir === 'up') dir = null;
        else dir = 'down'; // null → down
        d.pattern[index] = { hit: false, dir: dir, type: cur.type };
    }
    renderRhythmEditorPattern({ preserveScrollLeft: scrollLeft });
}

/* grid（最小音符）切替：pattern を時間位置を保ったまま組み替え、ラベルを再生成して再描画（v0.9.122）。
   拍子で使えない grid（6/8の quarter・三連符など）は無視する。 */
function setRhythmEditorGrid(grid) {
    const d = proCustomEditDraft;
    if (!d || !RHYTHM_CUSTOM_GRID_OPTIONS.includes(grid) || grid === d.grid) return;
    if (!rhythmGridAllowed(grid, d.timeSignature)) return;
    const from = { grid: d.grid, patternBars: d.patternBars, timeSignature: d.timeSignature };
    const to = { grid: grid, patternBars: d.patternBars, timeSignature: d.timeSignature };
    d.pattern = rhythmResizePattern(d.pattern, from, to);
    d.grid = grid;
    d.displayLabels = defaultRhythmDisplayLabels(grid, d.patternBars, d.timeSignature);
    renderRhythmCustomEditor();
}

/* 拍子（timeSignature）切替：必要なら grid を寄せ、pattern を組み替え、ラベルを再生成して再描画（v0.9.122）。 */
function setRhythmEditorTimeSignature(ts) {
    const d = proCustomEditDraft;
    if (!d || !RHYTHM_CUSTOM_TIME_SIGNATURES.includes(ts) || ts === d.timeSignature) return;
    const newGrid = rhythmCoerceGrid(d.grid, ts);
    const from = { grid: d.grid, patternBars: d.patternBars, timeSignature: d.timeSignature };
    const to = { grid: newGrid, patternBars: d.patternBars, timeSignature: ts };
    d.pattern = rhythmResizePattern(d.pattern, from, to);
    d.timeSignature = ts;
    d.grid = newGrid;
    d.displayLabels = defaultRhythmDisplayLabels(newGrid, d.patternBars, ts);
    renderRhythmCustomEditor();
}

/* 小節単位（patternBars）切替：pattern を新しい小節数へ組み替え、ラベルを再生成して再描画（v0.9.122）。 */
function setRhythmEditorPatternBars(n) {
    const d = proCustomEditDraft;
    if (!d || !RHYTHM_CUSTOM_PATTERN_BARS_OPTIONS.includes(n) || n === d.patternBars) return;
    const from = { grid: d.grid, patternBars: d.patternBars, timeSignature: d.timeSignature };
    const to = { grid: d.grid, patternBars: n, timeSignature: d.timeSignature };
    d.pattern = rhythmResizePattern(d.pattern, from, to);
    d.patternBars = n;
    d.displayLabels = defaultRhythmDisplayLabels(d.grid, n, d.timeSignature);
    renderRhythmCustomEditor();
}

/* 初期小節数（bars）を候補配列 [1,2,4,8] 内で1段ずらす（+1=次, -1=前）。 */
function stepRhythmEditorBars(dir) {
    const d = proCustomEditDraft;
    if (!d) return;
    const opts = RHYTHM_CUSTOM_BAR_OPTIONS;
    let idx = opts.indexOf(d.bars);
    if (idx < 0) idx = opts.indexOf(4);
    idx = clampNum(idx + dir, 0, opts.length - 1, idx);
    d.bars = opts[idx];
    if (els.pceBarsVal) els.pceBarsVal.textContent = String(d.bars);
}

/* BPM をクランプして反映。 */
function setRhythmEditorBpm(v) {
    const d = proCustomEditDraft;
    if (!d) return;
    d.bpm = clampNum(Math.round(Number(v)), RHYTHM_CUSTOM_BPM_MIN, RHYTHM_CUSTOM_BPM_MAX, d.bpm);
    if (els.pceBpm) els.pceBpm.value = String(d.bpm);
}

/* 保存/JSONコピー直前に、画面上の最新入力値をドラフトへ取り込む。
   BPMは change/blur 前でも反映されるよう、input の現在値をここで必ず読む。 */
function collectRhythmCustomEditorInputs() {
    const d = proCustomEditDraft;
    if (!d) return null;
    if (els.pceTitle) d.title = els.pceTitle.value;
    if (els.pceBpm) {
        d.bpm = clampNum(Math.round(Number(els.pceBpm.value)), RHYTHM_CUSTOM_BPM_MIN, RHYTHM_CUSTOM_BPM_MAX, d.bpm);
        els.pceBpm.value = String(d.bpm);
    }
    return d;
}

/* 現在ドラフトを正規化して上書き保存。成功なら保存済み(normalize後)オブジェクト、失敗なら null を返す。
   editorStay=true（既定）のときだけ編集画面に留まり「保存しました」を表示する。 */
function saveRhythmCustomEditor(editorStay) {
    const d = collectRhythmCustomEditorInputs();
    if (!d) return null;
    const saved = updateRhythmCustomStage(d);
    if (!saved) { showRcToast('保存できませんでした'); return null; }
    proCustomEditDraft = saved; // 正規化後の値で同期
    renderRhythmCustomEditor();
    if (editorStay !== false) showRcToast('保存しました');
    return saved;
}

/* 編集画面の「テスト再生」（v0.9.124）。
   安全優先：まず既存の保存処理で現在の編集内容を保存し、成功した保存済みデータでテスト再生する。
   保存に失敗したらトーストで知らせて再生しない（保存ロジックは二重実装しない）。 */
function testPlayFromEditor() {
    const saved = saveRhythmCustomEditor(true);
    if (!saved) return; // 失敗時は saveRhythmCustomEditor 側でトースト表示済み
    openRhythmProCustomTest(saved.id);
}

/* カスタムSTAGEのテスト再生／結果画面から、元の編集画面へ戻る（v0.9.124）。
   再生・マイクを止め、一時設定(bpm/小節数)を復元してエンジンを通常STAGEへ戻してから編集画面を開く。
   このとき、テスト再生画面で変更した BPM/小節数 を編集ドラフトへ反映する（そのまま「保存する」で確定できる状態にする）。
   pattern/grid/timeSignature/patternBars/title は変更しない。 */
function backToEditorFromTest() {
    const id = eng.editId;
    const tempBpm = state.bpm;    // テスト再生画面での一時BPM（leaveCustomTestStateで元STAGE値へ戻る前に退避）
    const tempBars = state.bars;  // テスト再生画面での一時小節数
    stop();
    stopMic();
    if (els.resultsOverlay) els.resultsOverlay.classList.add('hidden');
    document.body.classList.remove('results-open');
    if (els.refreshBar) els.refreshBar.classList.remove('hidden');
    leaveCustomTestState();
    show('home');
    if (id && getSavedRhythmCustomStages().some((s) => s.id === id)) {
        openRhythmProCustomEditor(id);
        // テスト再生画面で変えた BPM/小節数 を編集ドラフトへ反映（pattern等は触らない）
        if (proCustomEditDraft) {
            proCustomEditDraft.bpm = clampNum(Math.round(tempBpm), RHYTHM_CUSTOM_BPM_MIN, RHYTHM_CUSTOM_BPM_MAX, proCustomEditDraft.bpm);
            if (RHYTHM_CUSTOM_BAR_OPTIONS.includes(tempBars)) proCustomEditDraft.bars = tempBars;
            renderRhythmCustomEditor();
        }
    } else {
        renderRhythmCustomStages();
        setHomeView('proCustom');
    }
}

/* テスト再生画面の「このSTAGEを保存」（v0.9.124）。
   テスト再生中に一時変更した BPM/小節数 だけを、現在のカスタムSTAGEへ保存する。
   pattern/grid/timeSignature/patternBars/title などは保存済みデータをそのまま使い、誤って変更しない。
   localStorage形式は変えず、既存の updateRhythmCustomStage（normalize＋保存）を再利用する。 */
function saveRhythmCustomTestSettings() {
    const id = eng.editId || (eng.custom && eng.custom.id);
    const saved = id ? getSavedRhythmCustomStages().find((s) => s.id === id) : null;
    if (!saved) { showRcToast('保存できませんでした'); return; }
    saved.bpm = state.bpm;   // テスト再生中の一時BPMを反映
    saved.bars = state.bars; // テスト再生中の一時小節数を反映
    const result = updateRhythmCustomStage(saved);
    if (!result) { showRcToast('保存できませんでした'); return; }
    eng.custom = result;     // テスト再生中の参照も最新へ（再生状態は維持）
    showRcToast('このSTAGEを保存しました');
}

/* 編集中の内容を normalize した上でJSONコピー。 */
async function copyRhythmCustomEditorJson() {
    const d = collectRhythmCustomEditorInputs();
    if (!d) return;
    const normalized = normalizeRhythmCustomStageSettings(d);
    presentRhythmJson(JSON.stringify(normalized, null, 2));
}

/* 編集画面からの削除（確認ダイアログ必須）。削除後は一覧へ戻る。 */
function deleteRhythmCustomFromEditor() {
    const d = proCustomEditDraft;
    if (!d) return;
    if (!window.confirm('このカスタムSTAGEを削除しますか？')) return;
    deleteRhythmCustomStageById(d.id);
    proCustomEditDraft = null;
    renderRhythmCustomStages();
    setHomeView('proCustom');
    showRcToast('削除しました');
}

/* ── ホーム内の階層表示（v0.9.117）────────────────────────────
   ホームは「TOP → リズム練をする → 基礎練(STAGE一覧)/ストロークパターン/コード進行」の
   サブビューを #screen-home の中で切り替える。画面そのもの（home/practice/settings）の
   遷移ロジックは変更しない。 */
let homeView = 'top'; // 'top' | 'rhythm' | 'kiso' | 'soon' | 'proCustom' | 'proCustomEdit'
let currentScreen = 'home'; // 'home' | 'practice' | 'settings'（v0.9.118：共通ナビ表示判定に使う）

/* 共通ナビ（左上 戻る/TOP・右上 設定）の表示制御（v0.9.118）。
   TOPページ（ホームのリズム練導線）でだけ #app-nav を隠す。それ以外の全ページ・全サブビューで表示する。 */
function updateChrome() {
    const onHomeTop = (currentScreen === 'home' && homeView === 'top');
    if (els.appNav) els.appNav.classList.toggle('hidden', onHomeTop);
    if (els.settingsBtn) els.settingsBtn.classList.toggle('hidden', currentScreen === 'settings');
}

function renderHome() {
    if (els.homeTop) els.homeTop.classList.toggle('hidden', homeView !== 'top');
    if (els.homeRhythm) els.homeRhythm.classList.toggle('hidden', homeView !== 'rhythm');
    if (els.homeKiso) els.homeKiso.classList.toggle('hidden', homeView !== 'kiso');
    if (els.homeSoon) els.homeSoon.classList.toggle('hidden', homeView !== 'soon');
    if (els.homeProCustom) els.homeProCustom.classList.toggle('hidden', homeView !== 'proCustom');
    if (els.homeProCustomEdit) els.homeProCustomEdit.classList.toggle('hidden', homeView !== 'proCustomEdit');
    updateChrome();
}
function setHomeView(v) {
    homeView = v;
    renderHome();
    window.scrollTo(0, 0);
}
function openSoonCategory(title) {
    if (els.soonTitle) els.soonTitle.textContent = title;
    setHomeView('soon');
}
/* PROカスタムSTAGE一覧を開く（判定フック経由・v0.9.119）。 */
function openRhythmProCustom() {
    if (!isRhythmProCustomStageAvailable()) return;
    renderRhythmCustomStages();
    setHomeView('proCustom');
}
/* ホームの特定サブビューへ移動（STAGE→基礎練など）。再生・マイクは止めてから移る。 */
function goHomeView(v) {
    stop();
    stopMic();
    show('home');     // いったんTOPへ
    setHomeView(v);    // 目的のサブビューへ
}

/* ── 画面遷移 ───────────────────────────────────────────── */
function show(screen) {
    currentScreen = screen;
    els.home.classList.toggle('hidden', screen !== 'home');
    els.practice.classList.toggle('hidden', screen !== 'practice');
    els.settings.classList.toggle('hidden', screen !== 'settings');
    // ホームに入るときは必ずTOP（リズム練導線）から表示する（v0.9.117）
    if (screen === 'home') { homeView = 'top'; renderHome(); }
    else updateChrome();
    // バージョン＋更新バーは全画面で表示（右下固定・控えめ）
    window.scrollTo(0, 0);
}

/* 右上「設定」：現在の画面を記録して設定へ */
function openSettingsFromCurrent() {
    const from = !els.practice.classList.contains('hidden') ? 'practice' : 'home';
    openSettings(from);
}

/* 全画面共通ナビ：TOP＝常にホーム、戻る＝自然な前画面 */
function goTop() {
    // カスタムテスト再生中は、未保存のBPM/小節数が破棄される可能性があるため確認する（v0.9.124）
    if (eng.custom) {
        if (!window.confirm('テスト再生中に変更したBPM/小節数が保存されていない場合は破棄されます。\nTOPへ戻りますか？')) return;
    }
    stop();
    stopMic();          // マイク・キャリブレーション・実音テストも停止
    leaveCustomTestState(); // カスタムテスト中ならエンジン/一時設定を元に戻す
    show('home');
}

function navBack() {
    // 設定画面（マイク/画面タップ設定など）→ 直前の自然な画面（呼び出し元）へ
    if (!els.settings.classList.contains('hidden')) { closeSettings(); return; }
    // STAGE画面（結果・見返し含む）→ カスタムテスト中はPROカスタム一覧へ、通常は基礎練画面へ（v0.9.118/124）
    if (currentScreen === 'practice') {
        if (eng.custom) {
            backToEditorFromTest(); // カスタムテスト中の「戻る」も該当STAGEの編集画面へ
            return;
        }
        goHomeView('kiso');
        return;
    }
    // ホーム内サブビュー → 1つ上の階層へ（v0.9.118）
    if (currentScreen === 'home') {
        if (homeView === 'rhythm') { setHomeView('top'); return; }
        if (homeView === 'kiso') { setHomeView('rhythm'); return; }
        if (homeView === 'soon') { setHomeView('rhythm'); return; }
        if (homeView === 'proCustom') { setHomeView('rhythm'); return; }
        if (homeView === 'proCustomEdit') { renderRhythmCustomStages(); setHomeView('proCustom'); return; }
        return; // TOPでは戻る不要（共通ナビ自体を隠している）
    }
    goTop();
}

/* ── テスト中断ガード（v0.9.91 → v0.9.92で拡張）─────────────────────────────
   いずれかのテスト（マイク反応 / 通常マイク遅れ補正 / イヤホン音ズレ補正 /
   Bluetoothマイク遅れ補正 / 最終確認テスト）が実行中、または詳細テスト（ウィザード）が
   途中で未完了のまま、画面遷移や設定を閉じる操作が行われた場合に、中断するか確認する。 */
function anyTestRunning() {
    return !!(test.flow || cal.active || hpCal.active || bt.active || pt.active || tapCal.active);
}
/* 詳細テスト（ステップ式ウィザード）が途中で未完了か（v0.9.92）。
   ・設定画面を開いていて、ステップ表示中で、入力タイプを選び済み、かつ最終確認テスト未完了。
   ・マイク設定TOP/簡易設定TOPで何も始めていない状態は対象外（settingsView !== 'steps'）。 */
function isMicSetupInProgress() {
    if (!els.settings || els.settings.classList.contains('hidden')) return false;
    return settingsView === 'steps' && setupProgress.inputChosen && !setupProgress.practiceDone;
}
/* 実行中のテストをすべて停止（それぞれの既存停止処理を使う・新規停止ロジックは作らない） */
function stopAllRunningTests() {
    if (test.flow) abortMicTest();
    if (cal.active) cancelCalibration();
    if (hpCal.active) stopHeadphoneCal();
    if (bt.active) stopBtCal();
    if (pt.active) stopPracticeTest();
    if (tapCal.active) stopTapCal();
}
/* テスト実行中 or 詳細テスト未完了なら確認。OKなら停止して true、キャンセルなら false。 */
function confirmMicInterruptIfNeeded() {
    if (anyTestRunning() || isMicSetupInProgress()) {
        if (!window.confirm('マイク設定がまだ完了していません。\n中断して移動しますか？')) return false;
        stopAllRunningTests();
    }
    return true;
}
/* 確認OK（または不要）なら action を実行。 */
function guardMicSetupInterruption(action) {
    if (confirmMicInterruptIfNeeded()) action();
}

function openStage(n) {
    leaveCustomTestState();          // カスタムテスト → 通常STAGEへ戻るときはエンジン/一時設定を元に戻す
    if (els.practiceEditBack) els.practiceEditBack.classList.add('hidden'); // STAGE1では「編集に戻る」を出さない
    if (els.customTestActions) els.customTestActions.classList.add('hidden'); // STAGE1では開始ボタン下の2ボタンを出さない
    const s = STAGES.find((x) => x.n === n) || STAGES[0];
    state.currentStage = s.n;
    els.practiceNum.innerHTML = `<small>STAGE</small><b>${s.n}</b>`;
    els.practiceTitle.textContent = s.title;
    setInputMode(state.inputMode);   // v0.9.118：リズム練画面で選んだ入力方式（タップ/ストローク）で開始
    show('practice');
    requestAnimationFrame(() => { fitLane(); resetGame(); });
}

/* カスタムテスト再生を抜けるときの後始末（v0.9.124）。
   テスト前に退避した STAGE の bpm/小節数を復元し、エンジン設定を通常STAGE(STAGE1)へ戻す。
   STAGE側に居た（restoreなし）場合は configureEngineForStage1 のみで何も壊さない。 */
function leaveCustomTestState() {
    if (eng.restore) {
        state.bpm = eng.restore.bpm;
        state.bars = eng.restore.bars;
        eng.restore = null;
        if (els.tempoVal) els.tempoVal.textContent = state.bpm;
        updateBarsUI();
    }
    configureEngineForStage1();
    applyStageBars();
    hideRhythmCustomTestPreview();    // カスタムテストを抜けたら譜面プレビューを必ず消す（v0.9.125）
    hideCustomFlowScoreLayer();       // 流れるVexFlow譜面レイヤー枠も必ず隠してクリア（v0.9.126）
}

/* PROカスタムSTAGEのテスト再生（v0.9.124）。
   保存済み設定（拍子/最小音符/パターンの長さ/pattern/bpm/小節数）を使って、既存STAGE画面で練習する。
   カスタムSTAGE自体の保存データは書き換えない（bpm/小節数はテスト中の一時設定）。 */
function openRhythmProCustomTest(id) {
    if (!isRhythmProCustomStageAvailable()) return;
    const stage = getSavedRhythmCustomStages().find((s) => s.id === id);
    if (!stage) { showRcToast('STAGEが見つかりません'); return; }
    ensureRhythmVexFlow();                        // 譜面ライブラリ先読み（編集画面と共通・CDN不使用）
    if (!eng.restore) eng.restore = { bpm: state.bpm, bars: state.bars }; // 退出時に戻すSTAGE設定を退避
    configureEngineForCustom(stage);
    eng.editId = stage.id;                        // 「編集に戻る」用に元STAGEを記憶
    if (els.practiceEditBack) els.practiceEditBack.classList.remove('hidden');
    if (els.customTestActions) els.customTestActions.classList.remove('hidden'); // 開始ボタン下の2ボタンを表示
    renderRhythmCustomTestPreview(eng.custom);    // 読み取り専用のVexFlow譜面プレビューを表示（v0.9.125）
    showCustomFlowScoreLayer();                   // 流れるVexFlow譜面レイヤー枠を表示（中身は次工程・v0.9.126）
    state.bpm = clampNum(stage.bpm, 40, 200, state.bpm); // 再生エンジンのBPM範囲に合わせてclamp
    state.bars = stage.bars;
    if (els.tempoVal) els.tempoVal.textContent = state.bpm;
    updateBarsUI();
    applyStageBars();                             // TOTAL_BEATS = 小節数 × 1小節のセル数
    state.currentStage = 0;                       // 通常STAGE番号ではない（カスタム）
    els.practiceNum.innerHTML = '<small>カスタム</small><b>★</b>';
    els.practiceTitle.textContent = stage.title;
    setInputMode(state.inputMode);
    show('practice');
    // fitLane で pxPerBeat/judgeX が確定した後に、流れる譜面レイヤーへ静止描画する（v0.9.127・Step2）
    requestAnimationFrame(() => { fitLane(); resetGame(); renderRhythmFlowScore(); });
}

/* ── Web Audio クリック ─────────────────────────────────── */
function ensureAudio() {
    if (!state.audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        state.audioCtx = new AC();
    }
    if (state.audioCtx.state === 'suspended') {
        state.audioCtx.resume().then(
            () => console.info('[audio] resumed →', state.audioCtx.state),
            (err) => console.warn('[audio] resume失敗', err)
        );
    }
    return state.audioCtx;
}

/* force=true のときは clickEnabled に関わらず鳴らす（カウントイン合図用） */
function click(accent, force) {
    if (!state.clickEnabled && !force) return; // OFF時は鳴らさない（ただし強制時を除く）
    const ctx = state.audioCtx;
    if (!ctx) { console.warn('[click] AudioContext 未生成'); return; }
    if (ctx.state === 'suspended') ctx.resume(); // 念のため復帰を試みる
    state.lastClickPerf = performance.now(); // B案：直後のマイク検出を無視するため記録
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    // 立ち上がりがはっきり聞こえるよう矩形波＋やや高めの音量・長さに
    osc.type = 'square';
    // 1拍目アクセントは通常拍との差を控えめに（マイクに入りにくく・拍頭は残す）
    osc.frequency.value = accent ? 1500 : 1200;
    // クリック音量設定（0..100%）を反映。0なら無音
    const vol = Math.max(0, Math.min(1, state.clickVolume / 100));
    const peak = (accent ? 0.55 : 0.45) * vol;
    if (peak < 0.001) return; // 実質無音
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.09);
}

/* オーディオ時計(ctx.currentTime)を基準にしたゲーム時間(ms)。
   譜面スクロール・判定・クリック音をすべてこの同じ時計で揃え、perf時計との累積ドリフトを防ぐ。 */
function gameAudioMs() {
    if (!state.audioCtx || state.audioStartTime < 0) return 0; // クロック未初期化（音声が走る前）
    return (state.audioCtx.currentTime - state.audioStartTime) * 1000;
}

/* ── DEBUG オーバーレイ（本番OFF・v0.9.110）──────────────────────
   実機（iPhone）で値を見るための極小固定オーバーレイ。DEBUGフラグが false の間は
   この関数自体が呼ばれず要素も作らないので、通常ユーザーには一切表示されない。 */
function ensureDebugBox(id, corner) {
    let box = document.getElementById(id);
    if (box) return box;
    box = document.createElement('div');
    box.id = id;
    const pos = (corner === 'top')
        ? 'top:calc(var(--safe-top, 0px) + 4px);left:4px;'
        : 'bottom:calc(var(--safe-bottom, 0px) + 4px);right:4px;';
    box.style.cssText = 'position:fixed;' + pos + 'z-index:99999;max-width:62vw;'
        + 'padding:6px 8px;border-radius:8px;background:rgba(0,0,0,0.74);color:#7CFC00;'
        + 'font:600 10px/1.35 ui-monospace, Menlo, monospace;white-space:pre;pointer-events:none;';
    if (document.body) document.body.appendChild(box);
    return box;
}

const _dbgRound = (v) => (typeof v === 'number' && isFinite(v)) ? Math.round(v) : '-';

/* STAGE再生中の波形の「描画ソース・時間軸モード・時刻基準・補正値」を画面右下に出す（STAGE_WAVE_DEBUG時のみ）。
   waveMode：judged＝判定時間軸のまま / heard＝音符と同じ heard-time へ寄せている（dispOffを足している）。 */
function updateStageWaveDebug(source, waveMode, rawT, drawT, dispOff, latestWaveT, count) {
    const box = ensureDebugBox('stage-wave-debug', 'bottom');
    if (!box) return;
    const age = (typeof rawT === 'number' && isFinite(latestWaveT)) ? (rawT - latestWaveT) : NaN;
    box.textContent =
        'source: ' + source + '\n'
        + 'waveMode: ' + waveMode + '\n'
        + 'rawT: ' + _dbgRound(rawT) + '\n'
        + 'drawT: ' + _dbgRound(drawT) + '\n'
        + 'dispOff: ' + _dbgRound(dispOff) + '\n'
        + 'micJudgeOffsetMs: ' + _dbgRound(micJudgeOffsetMs()) + '\n'
        + 'headphoneOutputOffsetMs: ' + _dbgRound(mic.headphoneOutputOffsetMs || 0) + '\n'
        + 'latestWaveT: ' + _dbgRound(latestWaveT) + '\n'
        + 'latestWaveAge: ' + _dbgRound(age) + '\n'
        + 'waveCount: ' + count;
}

/* マイク反応テストへのスクロールの座標・前後Y・viewport状態を画面左上に出す（MIC_SCROLL_DEBUG時のみ）。
   v0.9.113-debug：before / after / after300 の3フェーズを1画面に蓄積表示する（実機スクショ用）。
   フェーズ別の1行（前後Y・実top・期待top・delta・可視）＋共通情報（target状態/viewport/doc）をまとめて出す。 */
const _micScrollDbgStore = { phases: {}, common: {} };
function updateMicScrollDebug(info) {
    const box = ensureDebugBox('mic-scroll-debug', 'top');
    if (!box) return;
    const sub = info.phaseSub || 'scroll';
    _micScrollDbgStore.phases[sub] =
        '[' + sub + '] bY=' + _dbgRound(info.beforeY) + ' aY=' + _dbgRound(info.afterY)
        + ' top=' + _dbgRound(info.actualTopAfter) + ' exp=' + _dbgRound(info.expectedTop)
        + ' d=' + _dbgRound(info.delta) + ' btm=' + _dbgRound(info.rectBottom)
        + ' vis=' + (info.isTargetVisible ? 'y' : 'n');
    _micScrollDbgStore.common = info;
    const c = _micScrollDbgStore.common;
    const order = ['before', 'after', 'after300'];
    const extra = Object.keys(_micScrollDbgStore.phases).filter((k) => order.indexOf(k) < 0);
    const keys = order.filter((k) => _micScrollDbgStore.phases[k]).concat(extra);
    let txt = 'MIC_SCROLL_DEBUG ' + (c.context || '') + '\n';
    for (const k of keys) txt += _micScrollDbgStore.phases[k] + '\n';
    txt += 'view:' + (c.view || '-') + ' step:' + (c.step || '-') + '\n'
        + 'target:' + (c.targetId || '-') + ' hidden:' + c.targetHidden + ' disp:' + (c.targetDisplay || '-') + '\n'
        + 'tH:' + _dbgRound(c.targetHeight) + ' smTop:' + (c.scrollMarginTop || '-') + ' absY:' + _dbgRound(c.targetAbsY) + '\n'
        + 'vvH:' + _dbgRound(c.vvHeight) + ' vvTop:' + _dbgRound(c.vvOffsetTop) + ' scale:' + (typeof c.vvScale === 'number' ? c.vvScale.toFixed(2) : '-') + ' innerH:' + _dbgRound(c.innerH) + '\n'
        + 'docH:' + _dbgRound(c.docH) + ' bodyH:' + _dbgRound(c.bodyH) + '\n'
        + 'active:' + (c.activeEl || '-') + ' load:' + _dbgRound(c.sinceLoad) + 'ms method:' + (c.method || '-');
    box.textContent = txt;
}

/* STAGE本番のクリックを「絶対オーディオ時刻」に正確にスケジュールする（rAFのジッタ／累積ズレを排除）。
   音色は click() と同一。停止時に止められるよう state.scheduledClicks に積む。 */
function scheduleStageClick(audioTime, accent, force) {
    if (!state.clickEnabled && !force) return;
    const ctx = state.audioCtx;
    if (!ctx) return;
    const vol = Math.max(0, Math.min(1, state.clickVolume / 100));
    const peak = (accent ? 0.55 : 0.45) * vol;
    if (peak < 0.001) return;
    const t0 = Math.max(audioTime, ctx.currentTime); // 過去時刻なら即時
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1500 : 1200;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.09);
    state.scheduledClicks.push(osc);
    if (state.scheduledClicks.length > 8) state.scheduledClicks.shift(); // 直近のみ保持
}

/* マイクの遅れ補正テスト専用クリック。
   自然なクリック音（三角波・歪み無し）を保ちつつ、iPhoneマイクで拾いやすいよう
   ・やや長め（約180ms）
   ・iPhoneマイクが拾いやすい中域（約700Hz＋1050Hz の2トーンを薄く重ねる）
   ・大きめだが clipping しない音量
   通常STAGEのクリック音(click)は一切変更しない。ノイズ成分は使わない。 */
function calClick() {
    const ctx = state.audioCtx;
    if (!ctx) { console.warn('[cal] AudioContext 未生成'); return; }
    if (ctx.state === 'suspended') ctx.resume();
    state.lastClickPerf = performance.now();
    const t0 = ctx.currentTime;
    const dur = 0.18;

    // 出力をまとめるマスターゲイン（合計でも歪まないよう調整）
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.85, t0 + 0.008); // やわらかいアタック
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); // 自然な減衰
    master.connect(ctx.destination);

    // 2トーンを薄く重ねる（中域中心。三角波で角が丸く自然な音）
    [[700, 0.6], [1050, 0.5]].forEach(([freq, lvl]) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        g.gain.value = lvl;
        osc.connect(g).connect(master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    });
}

/* クリック音がスピーカーから実際に出るまでの推定遅延(ms)。
   マイク誤検出ガードに加算し、出力レイテンシ分まで無視できるようにする。 */
function clickLatencyMs() {
    const c = state.audioCtx;
    if (!c) return 0;
    const l = (c.outputLatency != null ? c.outputLatency : (c.baseLatency || 0)) || 0;
    return Math.min(150, l * 1000); // 過剰に伸ばして本物のストロークを捨てないよう上限150ms
}

/* クリック音直後の「弱い」立ち上がりだけを除外するか（STAGE本体と同条件）。
   STAGE本番(micLoop)で使っている inGuard && !strongEnough をそのまま関数化したもの。
   ・guardMs ＝ mic.clickGuardMs ＋ 出力レイテンシ（clickLatencyMs）
   ・反応ライン(threshold)の STRONG_STROKE_FACTOR 倍以上の入力は「ストロークとして通す」
   ＝ 反応ライン超えの普通のストロークは（クリック直後でも）除外しない。
   clickActive：クリックが鳴っている前提か（STAGE＝state.clickEnabled／実践テスト＝常にtrue）。 */
function isClickGuardedOnset(now, peak, lastClickPerf, clickActive) {
    if (!clickActive) return false;
    const guardMs = mic.clickGuardMs + clickLatencyMs();
    const sinceClick = now - lastClickPerf;
    const inGuard = sinceClick >= -10 && sinceClick <= guardMs;
    const strongEnough = peak >= mic.threshold * STRONG_STROKE_FACTOR;
    return inGuard && !strongEnough;
}

/* ── キャンバス初期化（DPR対応） ───────────────────────── */
function fitOne(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return { ctx: null, w: 0, h: 0 };
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
}

function fitLane() {
    lane = fitOne(els.laneCanvas);
    state.pxPerBeat = Math.max(64, Math.min(120, lane.w * 0.24));
    state.judgeX = lane.w * 0.3;
    state.pxPerMs = state.pxPerBeat / state.beatInterval;
    drawLane(state.running ? state.currentTime : 0);
}

function fitGraph() {
    graph = fitOne(els.graphCanvas);
    drawGraph();
}

let resultsMic = { ctx: null, w: 0, h: 0 };
function fitResultsMic() {
    if (!els.resultsMicCanvas) return;
    resultsMic = fitOne(els.resultsMicCanvas);
    drawResultsMic();
}

/* 結果画面：各拍のストローク音量（state.beatMicPeak）を縦バーで表示し、反応ライン横線を引く。
   入力あり（反応ライン超え）＝緑、未満＝グレー、二重反応＝上に⚠。 */
function drawResultsMic() {
    const { ctx, w, h } = resultsMic;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const padX = 10, padTop = 12, padBot = 14;
    const x0 = padX, x1 = w - padX, baseY = h - padBot, topY = padTop;
    const usableH = baseY - topY;
    // 表示スケール：反応ラインを高さ 1/MIC_DISPLAY_SCALE（≒40%）の位置に。thresholdが低いほどバーが大きく見える。
    const valToY = (v) => baseY - Math.max(0, Math.min(1, micDisplayFrac(v))) * usableH;
    // 反応ライン（薄い横線＋ラベル）
    const lineY = valToY(mic.threshold);
    ctx.strokeStyle = 'rgba(255,159,28,0.45)';
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, lineY); ctx.lineTo(x1, lineY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,159,28,0.6)';
    ctx.font = '600 9px Outfit, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('反応ライン', x0 + 2, lineY - 3);
    // 各拍のバー
    const n = TOTAL_BEATS;
    const slot = (x1 - x0) / n;
    const bw = Math.max(2, slot * 0.6);
    for (let i = 0; i < n; i++) {
        const v = state.beatMicPeak[i] || 0;
        const cx = x0 + slot * (i + 0.5);
        const y = valToY(v);
        const over = v >= mic.threshold;
        ctx.fillStyle = over ? 'rgba(46,204,113,0.85)' : 'rgba(253,246,238,0.28)';
        ctx.fillRect(cx - bw / 2, y, bw, baseY - y);
        if (state.beatDoubled[i]) { // 二重反応マーク
            ctx.fillStyle = '#ffd166';
            ctx.font = '700 9px Outfit, sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('⚠', cx, Math.max(topY + 8, y - 3));
        }
    }
    // 小節区切り
    ctx.strokeStyle = 'rgba(253,246,238,0.07)'; ctx.lineWidth = 1;
    for (let b = 0; b <= n / eng.cellsPerBar; b++) {
        const x = x0 + (b * eng.cellsPerBar) * slot;
        ctx.beginPath(); ctx.moveTo(x, topY); ctx.lineTo(x, baseY); ctx.stroke();
    }
}

function fitPreview() {
    if (!els.micPreviewCanvas) return;
    preview = fitOne(els.micPreviewCanvas);
    drawMicPreview();
}

/* ── 設定画面：マイク判定の見え方プレビュー（疑似波形・各設定と連動） ── */
function drawMicPreview() {
    const { ctx, w, h } = preview;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const padL = 8, padR = 8, padT = 14, padB = 22;
    const x0 = padL, x1 = w - padR;
    const baseY = h - padB;         // 振幅0（時間軸）
    const ampH = baseY - padT;      // 振幅最大ピクセル（振幅0..1）
    const spanMs = 600;             // プレビュー全体で表す時間
    const msToX = (x1 - x0) / spanMs;
    const tX = (ms) => x0 + ms * msToX;
    const clickT = 70;              // クリック音の疑似時刻
    const strokeT = 330;            // ストロークの疑似時刻
    const font = '600 9px Outfit, sans-serif';

    // 二重反応防止の帯（検出後・ブルー）
    ctx.fillStyle = 'rgba(77,150,255,0.13)';
    ctx.fillRect(tX(strokeT), padT, mic.cooldownMs * msToX, baseY - padT);

    // 疑似波形（グレーのエンベロープ）
    const bump = (centerMs, widthMs, amp) => {
        ctx.beginPath();
        ctx.moveTo(tX(centerMs - widthMs), baseY);
        for (let ms = centerMs - widthMs; ms <= centerMs + widthMs; ms += 4) {
            const dx = (ms - centerMs) / widthMs;
            const a = amp * Math.max(0, 1 - dx * dx);
            ctx.lineTo(tX(ms), baseY - a * ampH);
        }
        ctx.lineTo(tX(centerMs + widthMs), baseY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fill();
    };
    // クリック音の山＝クリック音量に連動（音量を下げると山が下がる＝反応ラインを下回る）
    const clickAmp = (state.clickVolume / 100) * 0.42;
    bump(clickT, 24, clickAmp);   // クリック音（音量連動・鋭い）
    bump(strokeT, 52, 0.82);      // ストローク音（大きめ・固定）

    // 時間軸
    ctx.strokeStyle = 'rgba(253,246,238,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, baseY); ctx.lineTo(x1, baseY); ctx.stroke();

    // しきい値ライン（水平・振幅）。感度を上げると上へ
    const thrY = baseY - Math.min(1, mic.threshold / 0.5) * ampH;
    ctx.strokeStyle = 'rgba(255,159,28,0.9)';
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0, thrY); ctx.lineTo(x1, thrY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,159,28,0.95)'; ctx.font = font; ctx.textAlign = 'left';
    ctx.fillText('反応ライン', x0 + 2, thrY - 3);
    ctx.textAlign = 'left';

    // 波形ラベル：クリック音 / ストローク音
    ctx.fillStyle = 'rgba(253,246,238,0.6)';
    ctx.fillText('クリック音', tX(clickT) - 14, baseY + 13);
    ctx.fillText('ストローク音', tX(strokeT) - 22, baseY + 13);

    // 二重反応防止ラベル（ブルー帯）
    ctx.fillStyle = 'rgba(120,170,255,0.95)';
    ctx.fillText('二重反応防止', tX(strokeT) + 3, padT + 9);

    // 判定点（補正前＝グレー / 補正後＝緑）＋矢印。時間軸より少し上の「判定列」に描く
    const dotY = baseY - 16;
    const rawX = tX(strokeT);
    const corrX = tX(strokeT + micJudgeOffsetMs());
    if (Math.abs(corrX - rawX) > 1) {
        ctx.strokeStyle = 'rgba(253,246,238,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(rawX, dotY); ctx.lineTo(corrX, dotY); ctx.stroke();
        const dir = corrX < rawX ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(corrX, dotY);
        ctx.lineTo(corrX - dir * 5, dotY - 3);
        ctx.lineTo(corrX - dir * 5, dotY + 3);
        ctx.closePath();
        ctx.fillStyle = 'rgba(253,246,238,0.5)'; ctx.fill();
    }
    // 補正前（グレー・ラベルなし。矢印の起点として薄く表示）
    ctx.beginPath(); ctx.arc(rawX, dotY, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(180,180,180,0.7)'; ctx.fill();
    // 補正後（緑）
    ctx.beginPath(); ctx.arc(corrX, dotY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#2ecc71'; ctx.fill();
    ctx.font = font;
    ctx.fillStyle = 'rgba(46,204,113,0.98)'; ctx.textAlign = 'left';
    ctx.fillText('補正後', corrX + 8, dotY + 3);
    ctx.textAlign = 'left';
}

/* ── 4分音符を描く ──────────────────────────────────────── */
function drawQuarterNote(ctx, x, yc, color) {
    // 符頭（やや傾けた塗りつぶし楕円・少し大きめ）
    ctx.save();
    ctx.translate(x, yc);
    ctx.rotate(-0.32);
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    // 符尾（符頭の右端から上へ）
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 10, yc - 2);
    ctx.lineTo(x + 10, yc - 36);
    ctx.stroke();
}

/* ストローク方向：表拍＝down / 裏拍＝up。
   将来の8分ストローク等に備え、拍インデックスから方向を返す拡張ポイント。
   現状 STAGE1 は4分音符のみ＝各拍が表拍＝ダウン。
   8分を追加する際は subdivision に応じて 'down' / 'up' を交互に返すよう拡張する。 */
function beatDirection(i) {
    return 'down';
}

/* ストローク方向の矢印（音符の下に小さく表示）。dir: 'down' | 'up' */
function drawStrokeArrow(ctx, x, y, dir, color, alpha) {
    ctx.save();
    ctx.globalAlpha = (alpha == null) ? 0.8 : alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const len = 11, hw = 4, hh = 5;
    const s = (dir === 'up') ? -1 : 1;       // down=下向き(+), up=上向き(-)
    const y0 = y - s * len / 2;              // 軸の根元
    const y1 = y + s * len / 2;              // 矢じり側
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x - hw, y1 - s * hh);
    ctx.lineTo(x + hw, y1 - s * hh);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

/* ── マイク入力波形（譜面レーン背景・グレー） ──────────── */
/* データは結果カードと同じ state.micRunWave（t = gameAudioMs() + micJudgeOffsetMs() ＝判定時間軸）。
   v0.9.111（案B）：STAGE再生中の「見た目」は音符と揃える方が自然なので、dispOff（＝音符と同じ
   イヤホン音ズレ補正 headphoneOutputOffsetMs）を表示位置に足して heard-time へ寄せる。
   これは表示位置だけの調整で、micRunWave のデータ・判定(registerHit)・結果カード(drawReviewMicOverlay)には一切影響しない。
   rawT＝オーディオ時計（gameAudioMs）、dispOff＝表示用の前寄せ（stroke時 headphoneOutputOffsetMs／それ以外0）。 */
function drawMicWaveform(ctx, w, h, yc, rawT, dispOff) {
    const ppm = state.pxPerMs, jx = state.judgeX;
    const maxAmp = h * 0.34;
    const dOff = dispOff || 0;

    // 反応ライン（ストロークモード時）：波形の上下に薄い横線＋小ラベル。
    // 表示は相対スケールなので、反応ラインは常に振幅 micDisplayFrac(threshold)（≒0.4）の高さに来る。
    if (state.inputMode === 'stroke' || mic.on) {
        const lineAmp = micDisplayFrac(mic.threshold) * maxAmp;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,159,28,0.30)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, yc - lineAmp); ctx.lineTo(w, yc - lineAmp); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, yc + lineAmp); ctx.lineTo(w, yc + lineAmp); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,159,28,0.5)';
        ctx.font = '600 9px Outfit, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('反応ライン', 4, yc - lineAmp - 3);
        ctx.restore();
    }

    // 画面内に入るサンプルだけを時系列順（古い→新しい＝左→右）に集める。
    const pts = [];
    let waveSource = 'none';   // 'micRunWave' / 'liveFallback' / 'none'（DEBUG用：今どのデータで描いているか）
    let latestWaveT = NaN;     // 最新サンプルの時刻[ms]（micRunWave=補正後ゲーム時刻 / live=perf+off）。DEBUG用
    const rw = state.micRunWave;
    if (state.running && rw && rw.length >= 2 && typeof rawT === 'number') {
        // STAGE再生中は結果レーン(drawReviewMicOverlay)と同じ micRunWave を使う。
        //   micRunWave の t は「補正後ゲーム時刻 = gameAudioMs() + micJudgeOffsetMs()」（判定時間軸）。
        //   v0.9.111（案B）：表示は音符と揃えるため dOff（heard-time）を足す。x = jx + (t + dOff - rawT) * ppm。
        waveSource = 'micRunWave';
        latestWaveT = rw[rw.length - 1].t;
        for (let k = 0; k < rw.length; k++) {
            const x = jx + (rw[k].t + dOff - rawT) * ppm;
            if (x < -24 || x > w + 24) continue;
            pts.push([x, micDisplayFrac(rw[k].level)]);
        }
    } else {
        // STAGE停止中など micRunWave が無い場面は、従来どおりライブ履歴(perf基準＋判定補正)で描く。
        const hist = state.micWaveHistory;
        if (hist.length >= 2) {
            waveSource = 'liveFallback';
            const now = performance.now();
            const off = micJudgeOffsetMs();
            latestWaveT = hist[hist.length - 1].perf + off;
            for (let k = 0; k < hist.length; k++) {
                const s = hist[k];
                const x = jx + (s.perf + off + dOff - now) * ppm; // 今＝判定ライン、過去＝左へ流れる（補正＋表示寄せ込み）
                if (x < -24 || x > w + 24) continue;
                pts.push([x, micDisplayFrac(s.level)]);
            }
        }
    }
    // DEBUG：実機で「どのデータ・どの時間軸で描いているか」を可視化する（本番OFF）
    if (STAGE_WAVE_DEBUG) {
        const waveMode = (dOff !== 0) ? 'heard' : 'judged';
        updateStageWaveDebug(waveSource, waveMode, rawT, (typeof rawT === 'number' ? rawT - dOff : NaN), dOff, latestWaveT, pts.length);
    }
    if (pts.length < 2) return;

    // 上下対称の塗りエンベロープ（薄いグレー）
    ctx.beginPath();
    ctx.moveTo(pts[0][0], yc - pts[0][1] * maxAmp);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], yc - pts[i][1] * maxAmp);
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], yc + pts[i][1] * maxAmp);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fill();

    // 立ち上がりの輪郭をほんのり（上端のみ・低opacity）
    ctx.beginPath();
    ctx.moveTo(pts[0][0], yc - pts[0][1] * maxAmp);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], yc - pts[i][1] * maxAmp);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
}

/* ── レーン描画 ─────────────────────────────────────────── */
function drawLane(rawT) {
    const { ctx, w, h } = lane;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const yc = h * 0.56;
    const bi = state.beatInterval, T0 = state.T0, ppm = state.pxPerMs, jx = state.judgeX;

    // タップモードは「聞こえるクリック音」に合わせ、表示時刻 t 自体を出力遅延ぶん戻す（v0.9.97）。
    //   タップは判定 hitTime からも tapOutputOffsetMs を引いているので、t も同じだけ戻すと
    //   音符（heard-time）＝目標、判定マーカー（生タップ時刻）＝入力 が正しく揃う。
    // ストローク(mic)モードは t を動かさない（= rawT ＝ オーディオ/判定時間軸）。v0.9.108で v0.9.107 の全体ずらしを撤回。
    const t = (state.inputMode === 'tap') ? (rawT - tapOutputOffsetMs()) : rawT;
    // 表示の役割分離（v0.9.108）→ v0.9.111（案B）でPLAY中の見た目を更新：
    //   音符 / 拍グリッド / 小節線 / 視覚クリック / 音符中心線 → イヤホン音ズレ補正(headphoneOutputOffsetMs)で heard-time へ寄せる。
    //   v0.9.111：マイク波形 / 判定マーカー も「PLAY中の視覚フィードバック」として同じ heard-time(gridDispOff)へ寄せ、
    //             音符・波形・自分の入力マークが画面上で自然に揃うようにする（表示位置だけ）。
    //   判定(registerHit)・スコア・結果カード(drawReview/drawReviewMicOverlay)には一切入れない（そちらは判定時間軸のまま）。
    // gridDispOff は表示補正。タップモードは t で既に寄せているので二重ずらし防止に0。
    const gridDispOff = (state.inputMode === 'tap') ? 0 : (mic.headphoneOutputOffsetMs || 0);

    // カスタムSTAGEテスト再生で、VexFlow流し込み譜面が正常描画できているときだけ、
    // 「本来のヒット音符本体（drawQuarterNote）」を描かず VexFlow譜面を主表示にする（v0.9.130）。
    // VexFlow未ロード/失敗時(rhythmFlowScoreReady=false)や STAGE1 では、従来どおり Canvas音符を描く（防御）。
    // 判定演出（GOODの緑音符・入力ありMISSのオレンジ音符・判定マーカー）や中心線・矢印・波形は維持する。
    const hideCanvasNoteBody = !!(eng.custom && rhythmFlowScoreReady);

    // ① マイク入力波形（最背面・グレーの補助表示）。v0.9.111：音符と同じ heard-time(gridDispOff)へ寄せる（案B）。
    //   rawT（オーディオ時計）と表示寄せ gridDispOff を渡す。データ自体は結果カードと同じ micRunWave。
    drawMicWaveform(ctx, w, h, yc, rawT, gridDispOff);

    // ② 中央の水平ガイド（五線の地）
    ctx.strokeStyle = 'rgba(253,246,238,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke();

    // 拍・小節・音符
    for (let i = -eng.countInCells; i <= TOTAL_BEATS - 1; i++) {
        const bt = T0 + i * bi;
        // 音符/拍/小節線/中心線は gridDispOff（イヤホン音ズレ補正）ぶん heard-time へ寄せて描く（表示のみ）。
        const x = jx + (bt + gridDispOff - t) * ppm;
        if (x < -30 || x > w + 30) continue;
        const barStart = engBarStart(i);
        // カスタム：判定対象（hit:true）のセルだけ音符・中心線・矢印を描く。休符/タイ/カウントイン以外は何も描かない。
        const isHitCell = (i >= 0) && engIsHit(i);
        if (barStart) {
            // 小節区切り（v0.9.107：音符中心線より目立たせる＝少し明るく太く）
            ctx.strokeStyle = 'rgba(253,246,238,0.24)';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(x, h * 0.18); ctx.lineTo(x, h * 0.9); ctx.stroke();
            if (i >= 0) {
                ctx.fillStyle = 'rgba(253,246,238,0.5)';
                ctx.font = '600 11px Outfit, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(engBarNumber(i) + '小節', x, h * 0.13);
            }
        }
        if (isHitCell) {
            // v0.9.107：音符の中心に薄い縦線（中心線がJUST棒に重なる瞬間がジャスト）。
            // 小節区切り（上の0.24/1.5px）より目立たないように、薄く細く・短めにして見分けられるようにする。
            // 小節頭(barStart)は上の小節区切り線が中心も兼ねるので、二重描画しない。
            if (!barStart) {
                ctx.save();
                ctx.strokeStyle = 'rgba(253,246,238,0.09)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(x, h * 0.30); ctx.lineTo(x, h * 0.82); ctx.stroke();
                ctx.restore();
            }
            const r = state.results[i];
            // 入力ありMISS：判定窓を過ぎてMISS確定だが、マイク入力は反応ラインを超えていた拍
            // 表示上の音符位置に合わせて gridDispOff ぶん寄せた時刻で「通過済み」を判定する（表示のみ）。
            const past = (bt + gridDispOff) < t - NEAR_MS;
            const isMiss = !r || r.cls === 'miss';
            const inputMiss = past && isMiss && (state.beatMicPeak[i] || 0) >= mic.threshold;
            if (r && r.cls === 'just') {
                // GOOD：その音符が緑に光る
                ctx.save();
                ctx.shadowColor = 'rgba(46,204,113,0.9)';
                ctx.shadowBlur = 13;
                drawQuarterNote(ctx, x, yc, COLORS.just);
                ctx.restore();
            } else if (inputMiss) {
                // 入力ありMISS：薄いオレンジの音符（通常MISS=グレー×とは区別）
                ctx.save();
                ctx.globalAlpha = 0.7;
                ctx.shadowColor = 'rgba(255,140,60,0.7)'; ctx.shadowBlur = 8;
                drawQuarterNote(ctx, x, yc, '#ff8c3c');
                ctx.restore();
                // 短い理由ラベル（タイミング外/方向ちがい）
                const mr = missReason(i);
                if (mr && mr.code !== 'low') {
                    ctx.save(); ctx.fillStyle = 'rgba(255,140,60,0.95)';
                    ctx.font = '700 9px Outfit, sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText(mr.short, x, yc + 46);
                    ctx.restore();
                }
            } else if (!hideCanvasNoteBody) {
                drawQuarterNote(ctx, x, yc, NOTE_COLOR); // 採点対象 = ヒット音符（カスタム×VexFlow描画OK時はVexFlowを主表示にするため本体は描かない）
            }
            // ストローク方向の矢印（音符の下・控えめなアンバー）
            drawStrokeArrow(ctx, x, yc + 28, engDirAt(i), 'rgba(255,180,90,0.8)', 0.8);
        } else if (i < 0 && engIsPulse(i)) {
            // カウントインは控えめな点（拍＝パルス位置のみ）
            ctx.beginPath(); ctx.arc(x, yc, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(253,246,238,0.3)'; ctx.fill();
        }
    }

    // 判定マーカー：実際に叩いた位置に、ズレた音符型マークをプロット
    //（GOODは音符自体が緑になるので省略。早い=青/遅い=赤の音符、MISSは薄い×）
    // v0.9.111（案B）：波形・音符と同じ heard-time(gridDispOff)へ寄せて表示する（表示位置だけ。m.t＝判定時刻は不変）。
    for (let k = state.markers.length - 1; k >= 0; k--) {
        const m = state.markers[k];
        const x = jx + (m.t + gridDispOff - t) * ppm;
        if (x < -24) { state.markers.splice(k, 1); continue; }
        if (x > w + 24) continue;
        if (m.cls === 'just') continue;
        const col = COLORS[m.cls];
        if (m.cls === 'miss') {
            ctx.save();
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = col; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - 5, yc - 5); ctx.lineTo(x + 5, yc + 5);
            ctx.moveTo(x + 5, yc - 5); ctx.lineTo(x - 5, yc + 5);
            ctx.stroke();
            ctx.restore();
        } else {
            // 早い/遅いのズレ音符（半透明で「自分の入力」と分かるように）
            ctx.save();
            ctx.globalAlpha = 0.92;
            drawQuarterNote(ctx, x, yc, col);
            ctx.restore();
        }
    }

    // 判定ライン（光る縦線）。再生中は拍頭付近で光る＝視覚クリック（クリック音を下げた代替）。
    // 視覚クリックは音符と同じ heard-time に合わせるため gridDispOff ぶん位相をずらす（表示のみ・v0.9.108）。
    const glow = state.running ? beatGlow(t - T0 - gridDispOff, engPulseMs()) : 0;
    ctx.save();
    ctx.shadowColor = 'rgba(255,159,28,0.95)';
    ctx.shadowBlur = 14 + glow * 24;
    ctx.strokeStyle = 'rgba(255,159,28,' + (0.85 + glow * 0.15).toFixed(2) + ')';
    ctx.lineWidth = 3 + glow * 2;
    ctx.beginPath(); ctx.moveTo(jx, h * 0.1); ctx.lineTo(jx, h * 0.94); ctx.stroke();
    ctx.restore();
    drawBeatDot(ctx, jx, h * 0.9, glow);  // 拍インジケーター（判定ライン下で拍にパルス）
    ctx.fillStyle = 'rgba(255,159,28,0.95)';
    ctx.font = '700 10px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JUST', jx, h * 0.99);
}

/* 拍インジケーター：判定ライン下の丸。拍頭(glow=1)で大きく光り、外側にリングが一瞬広がる。
   音符の邪魔をしないよう、拍間は小さく控えめ。 */
function drawBeatDot(ctx, x, y, glow) {
    ctx.save();
    // 拍頭で外側に広がるリング
    if (glow > 0.15) {
        ctx.globalAlpha = (glow - 0.15) * 0.5;
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 6 + (1 - glow) * 14, 0, Math.PI * 2); // glow=1で小→消える頃に大きく
        ctx.stroke();
    }
    // 本体の丸
    const r = 3 + glow * 6;
    if (glow > 0.05) { ctx.shadowColor = 'rgba(255,159,28,0.95)'; ctx.shadowBlur = 8 + glow * 18; }
    ctx.globalAlpha = 0.4 + glow * 0.6;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffb347';
    ctx.fill();
    ctx.restore();
}

/* ── ズレ履歴グラフ描画（結果画面） ─────────────────────── */
function drawGraph() {
    const { ctx, w, h } = graph;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const padY = 10;
    const gutter = 42;            // 左側の軸ラベル用の余白
    const x0 = gutter, x1 = w - 8, yc = h / 2;
    const half = (h / 2) - padY;
    const maxMs = 150;

    // JUST 帯（±40ms）
    const band = (JUST_MS / maxMs) * half;
    ctx.fillStyle = 'rgba(46,204,113,0.12)';
    ctx.fillRect(x0, yc - band, x1 - x0, band * 2);

    // 小節セパレータ
    ctx.strokeStyle = 'rgba(253,246,238,0.07)';
    ctx.lineWidth = 1;
    for (let b = 0; b <= state.bars; b++) {
        const x = x0 + (b * eng.cellsPerBar / TOTAL_BEATS) * (x1 - x0);
        ctx.beginPath(); ctx.moveTo(x, padY * 0.4); ctx.lineTo(x, h - padY * 0.4); ctx.stroke();
    }

    // 中央線（ジャスト）
    ctx.strokeStyle = 'rgba(46,204,113,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(x1, yc); ctx.stroke();

    // 縦軸ラベル（上＝早い / 中央＝ジャスト / 下＝遅い）
    ctx.textAlign = 'left';
    ctx.font = '600 10px Outfit, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLORS.early;
    ctx.fillText('早い', 6, padY * 0.6);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.just;
    ctx.fillText('ジャスト', 6, yc);
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = COLORS.late;
    ctx.fillText('遅い', 6, h - padY * 0.6);
    ctx.textBaseline = 'alphabetic';

    // 各拍のズレ点
    for (let i = 0; i < TOTAL_BEATS; i++) {
        const r = state.results[i];
        if (!r || !r.tapped) continue;
        const x = x0 + (i / (TOTAL_BEATS - 1)) * (x1 - x0);
        const d = Math.max(-maxMs, Math.min(maxMs, r.diff));
        const y = yc + (d / maxMs) * half; // 早い(−)=上 / 遅い(+)=下
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[r.cls]; ctx.fill();
    }
}

/* ── ズレ確認（全32拍を流れる譜面で振り返り・横スクロール） ─────── */
function fitReview() {
    if (!els.reviewCanvas) return;
    const cssH = 168;
    const beatPx = 70;
    const leftPad = 40, rightPad = 36;
    const cssW = leftPad + rightPad + (TOTAL_BEATS - 1) * beatPx;
    const dpr = window.devicePixelRatio || 1;
    els.reviewCanvas.style.width = cssW + 'px';
    els.reviewCanvas.style.height = cssH + 'px';
    els.reviewCanvas.width = Math.round(cssW * dpr);
    els.reviewCanvas.height = Math.round(cssH * dpr);
    const ctx = els.reviewCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    review = { ctx, w: cssW, h: cssH, beatPx, leftPad };
    drawReview();
}

/* 結果レーンに、STAGE中に見えていたのと同じ時間軸のストローク音量波形（state.micRunWave）と
   反応ラインを薄く重ねる。音符・判定文字より先に（背面に）描く。ストロークモードのみ。
   時間→x は音符と同じ「拍位置」マッピング（t→拍番号→beatX）なので、各ストロークのピークが
   対応する音符の位置に立つ。micRunWave が無い場合のみ beatMicPeak のエンベロープにフォールバック。 */
function drawReviewMicOverlay(ctx, w, h, yc, beatX, beatPx) {
    if (state.inputMode !== 'stroke') return;
    const maxAmp = h * 0.26;            // 音符(yc)やズレ文字(yc+52)の邪魔をしない控えめな振幅
    const frac = (v) => Math.max(0, Math.min(1, micDisplayFrac(v)));
    const lineAmp = frac(mic.threshold) * maxAmp; // 反応ラインの表示高さ（≒0.4×maxAmp）
    const leftPad = beatX(0);
    // t(補正後ゲームms) → x（音符と同じ拍位置）
    const tToX = (t) => leftPad + ((t - state.T0) / state.beatInterval) * beatPx;
    ctx.save();

    const rw = state.micRunWave;
    if (rw && rw.length >= 2) {
        // STAGE中と同じ時間軸の連続波形（上下対称の薄い塗り＋上端の輪郭）
        const pts = [];
        for (let k = 0; k < rw.length; k++) {
            const x = tToX(rw[k].t);
            if (x < leftPad - 8 || x > w + 8) continue;
            pts.push([x, frac(rw[k].level) * maxAmp]);
        }
        if (pts.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(pts[0][0], yc - pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], yc - pts[i][1]);
            for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], yc + pts[i][1]);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(pts[0][0], yc - pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], yc - pts[i][1]);
            ctx.strokeStyle = 'rgba(255,255,255,0.20)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    } else {
        // フォールバック：拍ごとの最大値エンベロープ
        const amp = (i) => frac(state.beatMicPeak[i] || 0) * maxAmp;
        ctx.beginPath();
        ctx.moveTo(beatX(0), yc - amp(0));
        for (let i = 1; i < TOTAL_BEATS; i++) ctx.lineTo(beatX(i), yc - amp(i));
        for (let i = TOTAL_BEATS - 1; i >= 0; i--) ctx.lineTo(beatX(i), yc + amp(i));
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.fill();
    }

    // 反応ライン（薄いオレンジ破線・上下）＋小ラベル
    ctx.strokeStyle = 'rgba(255,159,28,0.22)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, yc - lineAmp); ctx.lineTo(w, yc - lineAmp); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, yc + lineAmp); ctx.lineTo(w, yc + lineAmp); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,159,28,0.45)';
    ctx.font = '600 9px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('反応ライン', 4, yc - lineAmp - 3);
    ctx.restore();
}

function drawReview() {
    if (!review || !review.ctx) return;
    const { ctx, w, h, beatPx, leftPad } = review;
    ctx.clearRect(0, 0, w, h);
    const yc = h * 0.46;
    // 色付き音符のズレ→px は、波形と同じ「実時間スケール」で描く（v0.9.76）。
    //  波形の x は tToX(t)=leftPad+((t-T0)/beatInterval)*beatPx ＝ px/ms が beatPx/beatInterval。
    //  以前は offScale=beatPx/250 と拡大していたため、音符だけ波形より外側にプロットされ、
    //  「波形が反応ラインを越えた位置」と「音符位置」がズレて見えていた。
    //  判定の diff（＝補正後オンセット時刻 − 理想拍）を同じスケールで使い、波形と一致させる。
    const offScale = beatPx / state.beatInterval;
    const maxOff = beatPx * 0.46;         // 隣の拍に被らないよう制限
    const beatX = (i) => leftPad + i * beatPx;

    // 中央の水平ガイド
    ctx.strokeStyle = 'rgba(253,246,238,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke();

    // ストローク音量波形＋反応ライン（STAGE本番と同じ時間軸で薄く重ねる。なぜタイミング外かを見やすく）
    drawReviewMicOverlay(ctx, w, h, yc, beatX, beatPx);

    // 各音符の中心にオレンジの垂直ライン（実践テスト見返しレーンと同じ見た目・v0.9.75）。
    // 波形の上・音符/判定ラベルの下に薄く重ね、理想の拍位置と波形/実打位置のズレを見やすくする。
    // 表示だけの追加で、判定・スコア・集計には一切影響しない。
    ctx.save();
    ctx.strokeStyle = 'rgba(255,159,28,0.5)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < TOTAL_BEATS; i++) {
        if (!engIsHit(i)) continue;          // カスタム：判定対象セルの中心線だけ
        const lx = beatX(i);
        ctx.beginPath(); ctx.moveTo(lx, h * 0.13); ctx.lineTo(lx, h * 0.7); ctx.stroke();
    }
    ctx.restore();

    // 小節線＋小節番号
    for (let i = 0; i < TOTAL_BEATS; i++) {
        if (engBarStart(i)) {
            const x = beatX(i) - beatPx * 0.5;
            ctx.strokeStyle = 'rgba(253,246,238,0.12)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, h * 0.13); ctx.lineTo(x, h * 0.9); ctx.stroke();
            ctx.fillStyle = 'rgba(253,246,238,0.5)';
            ctx.font = '600 11px Outfit, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(engBarNumber(i) + '小節', x + 5, h * 0.1);
        }
    }

    // 各拍：本来の音符＋方向矢印＋自分の入力マーク＋ズレms
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < TOTAL_BEATS; i++) {
        if (!engIsHit(i)) continue;          // カスタム：休符/タイは見返しに出さない（採点対象のみ）
        const x = beatX(i);
        const r = state.results[i];
        const cls = r ? r.cls : 'miss';

        // 本来の音符（GOODは緑＋発光、それ以外は薄い黄色）
        if (cls === 'just') {
            ctx.save();
            ctx.shadowColor = 'rgba(46,204,113,0.9)';
            ctx.shadowBlur = 11;
            drawQuarterNote(ctx, x, yc, COLORS.just);
            ctx.restore();
        } else {
            ctx.save(); ctx.globalAlpha = 0.45;
            drawQuarterNote(ctx, x, yc, NOTE_COLOR);
            ctx.restore();
        }
        // ストローク方向矢印（音符の下）
        drawStrokeArrow(ctx, x, yc + 28, engDirAt(i), 'rgba(255,180,90,0.7)', 0.7);

        // 自分の入力マーク＋ズレms
        ctx.textAlign = 'center';
        ctx.font = '700 11px Outfit, sans-serif';
        const msY = yc + 52;
        if (!r || !r.tapped) {
            const mr = missReason(i) || { code: 'low', short: 'MISS' };
            // 明確な異常（二重反応/方向違い/タイミング外）＝薄いオレンジで理由ラベル。
            const orange = (mr.code === 'double' || mr.code === 'timing' || mr.code === 'dir');
            if (orange) {
                ctx.save(); ctx.globalAlpha = 0.7;
                ctx.shadowColor = 'rgba(255,140,60,0.6)'; ctx.shadowBlur = 6;
                drawQuarterNote(ctx, x, yc, '#ff8c3c');
                ctx.restore();
                ctx.fillStyle = '#ff8c3c';
                ctx.fillText(mr.short, x, msY);
            } else {
                // MISS：薄いグレーの×（未入力）。余韻・判定済み・重複は出さず、ここに集約。
                ctx.save(); ctx.globalAlpha = 0.55;
                ctx.strokeStyle = COLORS.miss; ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x - 5, yc - 5); ctx.lineTo(x + 5, yc + 5);
                ctx.moveTo(x + 5, yc - 5); ctx.lineTo(x - 5, yc + 5);
                ctx.stroke();
                ctx.restore();
                ctx.fillStyle = COLORS.miss;
                ctx.fillText('MISS', x, msY);
            }
        } else if (cls === 'miss') {
            // 入力はあったがMISS（方向違い／タイミング外）：薄いオレンジ＋理由ラベル
            const mr = missReason(i) || { short: 'MISS' };
            ctx.save(); ctx.globalAlpha = 0.7;
            ctx.shadowColor = 'rgba(255,140,60,0.6)'; ctx.shadowBlur = 6;
            drawQuarterNote(ctx, x, yc, '#ff8c3c');
            ctx.restore();
            ctx.fillStyle = '#ff8c3c';
            ctx.fillText(mr.short, x, msY);
        } else if (cls === 'just') {
            // GOOD：音符自体が緑。ズレms（緑）
            const d = Math.round(r.diff);
            ctx.fillStyle = COLORS.just;
            ctx.fillText((d > 0 ? '+' : (d < 0 ? '−' : '±')) + Math.abs(d) + 'ms', x, msY);
        } else {
            // EARLY/LATE（やや外れたtapも含む）：実際に叩いた位置に色付き音符
            const col = COLORS[cls];
            const off = Math.max(-maxOff, Math.min(maxOff, r.diff * offScale));
            ctx.save(); ctx.globalAlpha = 0.95;
            drawQuarterNote(ctx, x + off, yc, col);
            ctx.restore();
            const d = Math.round(r.diff);
            ctx.fillStyle = col;
            ctx.fillText((d > 0 ? '+' : '−') + Math.abs(d) + 'ms', x, msY);
        }
    }
}

/* 結果モーダルの描画。ズレ確認レーンは常にメイン表示。
   ズレ履歴グラフは詳細（折りたたみ）が開いているときだけ描画する。 */
function drawResults() {
    requestAnimationFrame(() => {
        fitReview();
        if (els.resultsDetail && els.resultsDetail.open) { fitGraph(); fitResultsMic(); }
    });
}

/* ── ステータス更新 ─────────────────────────────────────── */
function updateStatus(t) {
    if (t < state.T0) {
        els.barCounter.textContent = 'カウントイン';
    } else {
        const sb = Math.floor((t - state.T0) / state.beatInterval);
        const bar = Math.max(1, Math.min(state.bars, Math.floor(sb / eng.cellsPerBar) + 1));
        els.barCounter.textContent = `${bar} / ${state.bars} 小節`;
    }
    const p = Math.max(0, Math.min(1, t / state.endTime));
    els.progressFill.style.width = (p * 100) + '%';
}

/* ── 判定 ───────────────────────────────────────────────── */
function classify(diff) {
    const a = Math.abs(diff);
    if (a <= JUST_MS) return 'just';
    // EARLY/LATE 窓は拍間隔に応じて広げる（最低 NEAR_MS、最大 拍間隔×NEAR_FRAC）。
    // 反応ラインを超えた入力は、拍の中間付近に来ない限り なるべく EARLY/LATE にする。
    const nearWin = Math.max(NEAR_MS, state.beatInterval * NEAR_FRAC);
    if (a <= nearWin) return diff < 0 ? 'early' : 'late';
    return 'miss';
}

/* タップ／マイク 共通の判定入口。source: 'tap' | 'mic'
   direction: 'down' | 'up'（タップエリアの左右。将来「表＝ダウン／裏＝アップ」判定に拡張可能）。
   マイク由来のみ timingOffsetMs を適用（タップには適用しない）。
   登録できたら true、範囲外/停止中で登録しなかったら false を返す。 */
function registerHit(perfNow, source, direction) {
    if (!state.running) return false;
    const dir = direction || (source === 'mic' ? 'stroke' : 'down');
    // 譜面・クリックと同じオーディオ時計で判定（perf時計との累積ドリフトを避ける）。
    // マイク補正(timingOffsetMs)は検出時刻に加算（負＝早める）。
    // タップは「聞こえたクリック音」基準なので、イヤホン出力遅延ぶん(tapOutputOffsetMs)を差し引く（v0.9.95）。
    const audioMs = gameAudioMs();
    const hitTime = audioMs + ((source === 'mic') ? micJudgeOffsetMs() : -tapOutputOffsetMs());
    const bi = state.beatInterval;
    const diffTo = (b) => hitTime - (state.T0 + b * bi); // 符号付きズレ（負＝早い）
    let i = Math.round((hitTime - state.T0) / bi);
    if (i < 0 || i > TOTAL_BEATS - 1) { mic.lastAssign = { beat: i, outcome: '範囲外' }; return false; } // カウントイン中・範囲外
    // カスタム：最も近い「判定対象(hit:true)」セルへ寄せる（休符/タイは判定対象外）。STAGE1 は i のまま。
    i = engNearestHitIndex(i);
    if (i < 0) { mic.lastAssign = { beat: i, outcome: '判定対象なし' }; return false; }
    const origBeat = i;
    // 最寄り拍が「より近い入力」で既に埋まっている場合、入力が属する隣の空き拍へ寄せて穴(=MISS)を減らす。
    // これにより、近い拍に二重で重ねるのではなく、隣の拍を EARLY/LATE で埋められる。
    const occupiedCloser = state.results[i] && Math.abs(state.results[i].diff) <= Math.abs(diffTo(i));
    if (occupiedCloser) {
        const cand = i + (diffTo(i) >= 0 ? 1 : -1); // 入力が拍より後ろ→次拍、前→前拍
        const nearWin = Math.max(NEAR_MS, bi * NEAR_FRAC);
        if (cand >= 0 && cand <= TOTAL_BEATS - 1 && engIsHit(cand) && !state.results[cand] && Math.abs(diffTo(cand)) <= nearWin) {
            i = cand;
        }
    }
    const diff = diffTo(i);
    const timingCls = classify(diff);

    // 方向判定：拍の期待方向（現状STAGE1は全て down）と入力方向を照合。
    // マイク入力(stroke)は方向の概念が無いため常に一致扱い。
    // タップで方向が違う場合は、タイミングが合っていても MISS（方向MISS）にする。
    const expectedDirection = engDirAt(i);
    const inputDirection = dir;
    const directionMatched = (source === 'mic') ? true : (inputDirection === expectedDirection);
    const dirMiss = !directionMatched;
    const cls = dirMiss ? 'miss' : timingCls;

    // 診断：マイクは raw（補正前）/ corrected（補正後）/ offset をログ
    if (source === 'mic') {
        const rawDiff = audioMs - (state.T0 + i * state.beatInterval);
        console.debug('[mic] 判定登録 raw=' + (rawDiff >= 0 ? '+' : '') + Math.round(rawDiff)
            + 'ms corrected=' + (diff >= 0 ? '+' : '') + Math.round(diff)
            + 'ms offset=' + micJudgeOffsetMs() + 'ms → ' + cls);
    }

    // 同じ拍に複数検出 → 最もジャストに近いものを採用。2回目以降は二重反応として記録。
    const prev = state.results[i];
    // デバッグ：この入力がどの拍に・どう割り当てられたか
    mic.lastAssign = {
        beat: i, origBeat, diff: Math.round(diff), cls,
        reassigned: (i !== origBeat),
        doubled: !!(prev && source === 'mic'),
        kept: !(!prev || Math.abs(diff) < Math.abs(prev.diff)),
        outcome: 'register',
    };
    if (prev && source === 'mic') {
        state.beatDoubled[i] = true;
        state.doubleReactionCount++;
        spawnDoubleFx(); // PLAY中に二重反応を即座に視認できるように
    }
    if (!prev || Math.abs(diff) < Math.abs(prev.diff)) {
        state.results[i] = {
            tapped: true, diff, cls, source,
            direction: inputDirection, inputDirection, expectedDirection, directionMatched, dirMiss,
        };
    }

    state.markers.push({ t: hitTime, cls, source, direction: inputDirection, dirMiss });
    const sign = diff > 0 ? '+' : (diff < 0 ? '−' : '±');
    const icon = source === 'mic' ? '🎤 ' : '';
    els.latestVerdict.dataset.state = cls;
    if (dirMiss) {
        els.latestVerdict.textContent = `${LABELS.miss} 方向ちがい`;
    } else {
        els.latestVerdict.textContent = `${icon}${LABELS[cls]} ${sign}${Math.abs(Math.round(diff))}ms`;
    }

    // 判定演出＋コンボ
    spawnJudgeFx(cls);
    if (cls === 'just') state.combo++; else state.combo = 0;
    updateCombo();
    return true;
}

/* ── 判定演出（GOOD/EARLY/LATE/MISS） ──────────────────── */
function spawnJudgeFx(cls) {
    if (!els.judgeFxLayer) return;
    const el = document.createElement('div');
    el.className = 'judge-fx fx-' + cls;
    el.textContent = FX_TEXT[cls];
    el.style.left = state.judgeX + 'px';
    els.judgeFxLayer.appendChild(el);
    setTimeout(() => { el.remove(); }, 750);
}

/* PLAY中：二重反応が起きた瞬間に、判定ライン付近へ「⚠ 二重反応」を一瞬だけ表示（該当拍のみ・短時間）。
   GOOD/EARLY/LATE と同時に出てもよい。原因をその場で視認できるようにする。 */
function spawnDoubleFx() {
    if (!els.judgeFxLayer) return;
    const el = document.createElement('div');
    el.className = 'judge-fx fx-double';
    el.textContent = '⚠ 二重反応';
    el.style.left = state.judgeX + 'px';
    els.judgeFxLayer.appendChild(el);
    setTimeout(() => { el.remove(); }, 650);
}

function updateCombo() {
    if (!els.comboBadge) return;
    if (state.combo >= 2) {
        els.comboBadge.textContent = state.combo + ' COMBO';
        els.comboBadge.classList.remove('hidden');
        els.comboBadge.classList.remove('pop');
        void els.comboBadge.offsetWidth; // reflowでアニメ再生
        els.comboBadge.classList.add('pop');
    } else {
        els.comboBadge.classList.add('hidden');
    }
}

/* direction: 'down' | 'up'（タップエリアの左右。レーン直タップは既定でダウン） */
function onTap(direction) {
    registerHit(performance.now(), 'tap', direction || 'down');
}

/* ── テスト再生エンジン設定（v0.9.124）──────────────────────────────
   STAGE1 と PROカスタムSTAGEテスト再生で共通の「1セル＝エンジンの1拍」設計。
   ・STAGE1：1セル=4分(24tick)・全セル判定・方向ダウン・拍ごとにクリック。
   ・カスタム：1セル=最小音符・hit:true のセルだけ判定・dir を方向に使う・拍(パルス)ごとにクリック。
   パターンは patternBars 分の1ループを、練習小節数(state.bars)ぶん繰り返す（インデックスを長さで折り返す）。 */
const STAGE1_CELL = { hit: true, dir: 'down', type: 'hit' };
const eng = {
    custom: null,                 // テスト再生中の正規化済みカスタムSTAGE（通常STAGEは null）
    cellTicks: RHYTHM_TPQ,        // 1セルのティック数（STAGE1=24=4分）
    cellsPerBar: BEATS_PER_BAR,   // 1小節のセル数（STAGE1=4）
    pulseTicks: RHYTHM_TPQ,       // クリック/視覚拍の間隔（STAGE1=24=4分ごと＝全拍）
    countInCells: COUNT_IN_BEATS, // カウントインのセル数（=1小節ぶん）
    pattern: null,                // カスタムの1ループ分パターン（null=STAGE1＝全セルが4分のヒット）
    restore: null,                // テスト再生前の bpm/bars スナップショット（退出時に復元）
    editId: null,                 // テスト再生元のカスタムSTAGE id（「編集に戻る」用・v0.9.124）
};

function configureEngineForStage1() {
    eng.custom = null;
    eng.cellTicks = RHYTHM_TPQ;
    eng.cellsPerBar = BEATS_PER_BAR;
    eng.pulseTicks = RHYTHM_TPQ;
    eng.countInCells = BEATS_PER_BAR;
    eng.pattern = null;
    eng.editId = null;
}
function configureEngineForCustom(stage) {
    const info = rhythmTimeSigInfo(stage.timeSignature);
    eng.custom = stage;
    eng.cellTicks = rhythmGridCellTicks(stage.grid);
    eng.cellsPerBar = rhythmCustomStepsPerBar(stage.grid, stage.timeSignature);
    eng.pulseTicks = info.beamGroupTicks;     // 単純拍子=4分、複合6/8=付点4分ごとにクリック
    eng.countInCells = eng.cellsPerBar;       // カウントインは1小節ぶん
    eng.pattern = stage.pattern.map(normalizeRhythmCustomCell);
}

/* セル i（負＝カウントイン）に対応するパターンセル。カスタムはループ折り返し。 */
function engCellAt(i) {
    if (!eng.pattern || !eng.pattern.length) return STAGE1_CELL;
    const L = eng.pattern.length;
    const idx = ((i % L) + L) % L;
    return eng.pattern[idx] || STAGE1_CELL;
}
function engIsHit(i) { const c = engCellAt(i); return !!(c && c.hit); }
function engDirAt(i) { const c = engCellAt(i); return (c && c.dir === 'up') ? 'up' : 'down'; }
function engInBarPos(i) { const n = eng.cellsPerBar; return (((i % n) + n) % n); }
function engBarStart(i) { return engInBarPos(i) === 0; }
function engIsPulse(i) { return (engInBarPos(i) * eng.cellTicks) % eng.pulseTicks === 0; }
function engBarNumber(i) { return Math.floor(i / eng.cellsPerBar) + 1; }
function engQuarterMs() { return 60000 / state.bpm; }                       // 4分=スクロール速度の基準
function engCellMs() { return engQuarterMs() * (eng.cellTicks / RHYTHM_TPQ); } // 1セルの実時間(ms)
function engPulseMs() { return engCellMs() * (eng.pulseTicks / eng.cellTicks); } // クリック/拍の間隔(ms)
/* セル i に最も近い「判定対象（hit:true）」のセル番号。範囲内に無ければ -1。STAGE1 は i のまま。 */
function engNearestHitIndex(i) {
    if (!eng.pattern) return i;
    const lastI = TOTAL_BEATS - 1;
    if (i >= 0 && i <= lastI && engIsHit(i)) return i;
    for (let d = 1; d <= TOTAL_BEATS; d++) {
        const lo = i - d, hi = i + d;
        if (lo >= 0 && lo <= lastI && engIsHit(lo)) return lo;
        if (hi >= 0 && hi <= lastI && engIsHit(hi)) return hi;
    }
    return -1;
}
/* 判定対象セル数（採点の母数）。STAGE1 は全セル。 */
function engJudgeCount() {
    if (!eng.pattern) return TOTAL_BEATS;
    let n = 0;
    for (let i = 0; i < TOTAL_BEATS; i++) if (engIsHit(i)) n++;
    return n;
}

/* ── 再生制御 ───────────────────────────────────────────── */
function buildSchedule() {
    state.beatInterval = engCellMs();                                  // エンジンの1拍＝1セル
    state.pxPerMs = state.pxPerBeat / engQuarterMs();                  // スクロール速度は4分基準（grid非依存で一定）
    state.T0 = eng.countInCells * state.beatInterval;
    state.endTime = state.T0 + (TOTAL_BEATS - 1 + TAIL_BEATS) * state.beatInterval;
    state.clickTimes = [];
    for (let i = -eng.countInCells; i <= TOTAL_BEATS - 1; i++) {
        if (!engIsPulse(i)) continue;                                  // クリックは拍(パルス)位置だけ＝全拍クリック
        const accent = engBarStart(i);
        state.clickTimes.push({ time: state.T0 + i * state.beatInterval, accent, countIn: i < 0 });
    }
    state.nextClick = 0;
}

const CLICK_LOOKAHEAD_MS = 130; // クリックを実際の発音より少し前に正確スケジュール

function loop() {
    if (!state.running) return;
    // オーディオ時計の開始基準を、ctxが実際にrunningになった最初のフレームで確定（suspended中の0を避ける）
    if (state.audioStartTime < 0) {
        if (state.audioCtx && state.audioCtx.state === 'running') {
            state.audioStartTime = state.audioCtx.currentTime;
        } else {
            if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume();
            state.raf = requestAnimationFrame(loop);
            return; // 音声が走るまで待つ
        }
    }
    const t = gameAudioMs();      // オーディオ時計基準（クリックと同一基準＝累積ズレなし）
    state.currentTime = t;

    // 先読みスケジューラ：次のクリックの絶対オーディオ時刻に正確に発音を予約する
    while (state.nextClick < state.clickTimes.length && state.clickTimes[state.nextClick].time <= t + CLICK_LOOKAHEAD_MS) {
        const ct = state.clickTimes[state.nextClick];
        const audioTime = state.audioStartTime + ct.time / 1000;
        scheduleStageClick(audioTime, ct.accent, ct.countIn); // カウントインは強制発音
        state.lastClickPerf = state.startTime + ct.time;       // マイクガード用（perf換算の目安）
        state.nextClick++;
    }

    updateStatus(t);
    drawLane(t);
    updateCustomFlowScorePosition(t); // 流れるVexFlow譜面を同じ時間軸で横移動（カスタムのみ・v0.9.128）

    if (t >= state.endTime) { finish(); return; }
    state.raf = requestAnimationFrame(loop);
}

/* 開始/停止 兼用ボタン：再生中なら停止＋自動リセット、停止中なら開始 */
function onPlayBtn() {
    if (state.running) { stop(); resetGame(); }
    else { play(); }
}

function play() {
    stopPracticeTest(); // STAGE開始時は最終確認テストを停止（安全処理）
    stopBtCal();
    stopTapCal();
    ensureAudio();
    resetData();
    buildSchedule();
    if (els.resultsOverlay) els.resultsOverlay.classList.add('hidden');
    els.latestVerdict.dataset.state = 'idle';
    els.latestVerdict.textContent = '再生中';
    setTempoEnabled(false);
    els.playBtn.textContent = '■ 停止';     // 兼用ボタン
    els.playBtn.disabled = false;
    if (els.tapHint) els.tapHint.classList.add('dim'); // 再生中はタップ案内を薄く
    state.running = true;
    // 譜面・判定・クリックを同一のオーディオ時計で揃える（累積ドリフト対策）。
    // 基準はctxがrunningになった最初のフレームでloop内で確定する（-1＝未確定）。
    state.startTime = performance.now();
    state.audioStartTime = -1;
    state.scheduledClicks = [];
    state.raf = requestAnimationFrame(loop);
}

function stop() {
    if (!state.running) return;
    state.running = false;
    cancelAnimationFrame(state.raf);
    // 先読みでスケジュール済みの未発音クリックを止める（停止後に鳴り続けないように）
    state.scheduledClicks.forEach((osc) => { try { osc.stop(); } catch (_) { } });
    state.scheduledClicks = [];
    setTempoEnabled(true);
    els.playBtn.textContent = '▶ 開始';
    els.playBtn.disabled = false;
    els.latestVerdict.textContent = 'スタンバイ';
    els.latestVerdict.dataset.state = 'idle';
    if (els.tapHint) els.tapHint.classList.remove('dim');
}

function resetData() {
    state.results = new Array(TOTAL_BEATS).fill(null);
    state.beatMicPeak = new Array(TOTAL_BEATS).fill(0);
    state.beatDoubled = new Array(TOTAL_BEATS).fill(false);
    state.beatExcluded = new Array(TOTAL_BEATS).fill(false);
    state.micEventLog = [];
    state.chordBeatProbe = new Array(TOTAL_BEATS).fill(null);
    state.doubleReactionCount = 0;
    state.markers = [];
    state.micWaveHistory = [];
    state.micRunWave = [];
    state.currentTime = 0;
    state.combo = 0;
    // この走行のマイク診断カウンタ・クールダウン基点をリセット
    mic.inputCount = 0;
    mic.registerCount = 0;
    mic.excludeCount = 0;
    mic.lastExcludeReason = '';
    mic.lastDetect = -100000;   // 1拍目をクールダウンで誤除外しないよう十分過去に
    mic.lastOnsetAt = -100000;
    mic.doubleCounted = false;
    mic.valley = 1;             // 谷（コードストローク用）をリセット
    state.chordPicked = 0;
    state.chordIgnoredRePeaks = 0;
    updateMicDiag();
    updateCombo();
    if (els.judgeFxLayer) els.judgeFxLayer.innerHTML = '';
}

function resetGame() {
    stop();
    resetData();
    if (els.resultsOverlay) els.resultsOverlay.classList.add('hidden');
    if (els.refreshBar) els.refreshBar.classList.remove('hidden'); // モーダルを閉じたら更新バーを戻す
    document.body.classList.remove('results-open');               // 戻る/TOP/設定を元に戻す（修正8）
    els.barCounter.textContent = `– / ${state.bars} 小節`;
    els.latestVerdict.dataset.state = 'idle';
    els.latestVerdict.textContent = 'スタンバイ';
    els.progressFill.style.width = '0%';
    state.beatInterval = engCellMs();
    state.T0 = eng.countInCells * state.beatInterval;
    state.pxPerMs = state.pxPerBeat / engQuarterMs();
    drawLane(0);
    updateCustomFlowScorePosition(0); // スタンバイ位置に合わせて流れる譜面も再配置（カスタムのみ・v0.9.128）
}

/* マイク入力のGOODが「ほぼ同じズレ」に集中している場合、クリック音を拾っている可能性を軽く警告。
   断定はしない（誤検出しても害がない程度の注意表示）。 */
function maybeShowClickPickupWarning() {
    if (!els.resultsWarn) return;
    let show = false;
    if (state.inputMode === 'stroke') {
        const micDiffs = [];
        for (let i = 0; i < TOTAL_BEATS; i++) {
            const r = state.results[i];
            if (r && r.tapped && r.source === 'mic') micDiffs.push(r.diff);
        }
        if (micDiffs.length >= 6) {
            const mean = micDiffs.reduce((a, b) => a + b, 0) / micDiffs.length;
            const variance = micDiffs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / micDiffs.length;
            const std = Math.sqrt(variance);
            // ズレがほぼ一点に集中（標準偏差<5ms）し、平均が +5〜+35ms 付近 → クリック拾いの疑い
            if (std < 5 && mean >= 5 && mean <= 35) show = true;
        }
    }
    els.resultsWarn.classList.toggle('hidden', !show);
}

/* MISSの原因を切り分けて軽く表示（ストローク＝マイク入力時のみ）。
   判定窓内の最大マイク入力が反応ライン未満＝入力レベル不足／反応ライン超え＝判定候補にならず。 */
/* 拍 i がMISSの場合、その原因を返す。
   code: 'low'（入力ライン未満）/ 'timing'（タイミング外）/ 'dir'（方向違い）/ 'other'（その他）/ null（MISSでない）
   short: 本番中の短い表示、long: 結果詳細での表示 */
function missReason(i) {
    const r = state.results[i];
    const isMiss = !r || r.cls === 'miss';
    if (!isMiss) return null;
    // 登録できたのにミス＝タップの方向違い／（理論上のみ）拍から大きく外れた登録。
    if (r && r.dirMiss) return { code: 'dir', short: '方向ちがい', long: '方向違い' };
    if (r && r.cls === 'miss') return { code: 'timing', short: 'タイミング外', long: 'タイミング外（拍から大きく外れ）' };
    // 未登録の拍：マイクは NEAR_FRAC=0.5 のため、登録できた入力は必ず GOOD/EARLY/LATE。
    //   よって未登録＝「明確な二重反応として除外」「近い拍で判定済み/余韻」「入力ライン未満」のいずれか。
    //   ★クールダウン除外(beatExcluded)は“同一ストロークの余韻/揺れ”が大半なので「二重反応」にはせず、
    //     「明確に別の強い立ち上がり」と判定できたとき(beatDoubled)だけ二重反応にする。残りは判定済み/余韻。
    if (state.beatDoubled[i]) return { code: 'double', short: '二重反応', long: '二重反応' };
    // ★余韻・二重反応防止中に無視した入力・判定済み成分は、ユーザーには出さない（内部的に無視）。
    //   未登録の拍は一律 MISS として扱う（GOOD/EARLY/LATE/MISS/二重反応 だけを表示する方針）。
    return { code: 'low', short: 'MISS', long: '未入力' };
}

function updateMissInfo() {
    if (!els.resultsMissInfo) return;
    if (state.inputMode !== 'stroke') { els.resultsMissInfo.classList.add('hidden'); return; }
    let missTotal = 0, low = 0, dbl = 0, dir = 0, timing = 0;
    for (let i = 0; i < TOTAL_BEATS; i++) {
        const m = missReason(i);
        if (!m) continue;
        missTotal++;
        if (m.code === 'double') dbl++;
        else if (m.code === 'dir') dir++;
        else if (m.code === 'timing') timing++;
        else low++; // 'low'（未入力）。余韻・判定済み・入力重複は出さない
    }
    if (missTotal === 0) { els.resultsMissInfo.classList.add('hidden'); return; }
    const parts = [];
    if (low > 0) parts.push('未入力 ' + low);
    if (dbl > 0) parts.push('二重反応 ' + dbl);
    if (dir > 0) parts.push('方向違い ' + dir);
    if (timing > 0) parts.push('タイミング外 ' + timing);
    els.resultsMissInfo.textContent = 'MISS ' + missTotal + ' 拍：' + parts.join(' ／ ');
    els.resultsMissInfo.classList.remove('hidden');
}

/* MISS原因デバッグ：各MISS拍について「オンセットがあったか／結末（クリックガード・クールダウン・未検出 等）」を
   コンソールと結果詳細に出す。なぜライン超えに見える入力がMISSになったのかを説明できるようにする。 */
function logBeatDebug() {
    if (state.inputMode !== 'stroke') return;
    const rows = [];
    for (let i = 0; i < TOTAL_BEATS; i++) {
        const r = state.results[i];
        const ev = (state.micEventLog || []).filter((e) => e.nearBeat === i || e.assignedBeat === i);
        const mr = missReason(i);
        rows.push({
            拍: i, 音符ms: Math.round(state.T0 + i * state.beatInterval),
            beatMicPeak: +(state.beatMicPeak[i] || 0).toFixed(3),
            反応ライン: +mic.threshold.toFixed(3),
            オンセット: ev.length ? ev.map((e) => e.outcome + '@' + e.t + '(p' + e.peak + ',near' + e.nearBeat + (e.assignedBeat != null ? '→' + e.assignedBeat : '') + ')').join(' | ') : 'なし',
            結果: r ? r.cls : (mr ? mr.short : 'MISS'),
            ズレms: r ? Math.round(r.diff) : '',
        });
    }
    try { console.table(rows); } catch (_) { console.log('[beatDebug]', JSON.stringify(rows)); }
    console.log('[beatDebug] eventLog=' + JSON.stringify(state.micEventLog) + ' offset=' + micJudgeOffsetMs() + 'ms thr=' + mic.threshold.toFixed(3));
}

/* 結果詳細にMISS拍の理由を1行で（iPhoneでもconsoleなしで原因を確認できるように） */
function updateMissDebug() {
    if (!els.resultsMissDebug) return;
    if (state.inputMode !== 'stroke') { els.resultsMissDebug.classList.add('hidden'); return; }
    const lines = [];
    for (let i = 0; i < TOTAL_BEATS; i++) {
        const r = state.results[i];
        const isMiss = !r || r.cls === 'miss';
        if (!isMiss) continue;
        const ev = (state.micEventLog || []).filter((e) => e.nearBeat === i);
        let reason;
        if (!ev.length) reason = 'オンセット無し（立ち上がり未検出）';
        else {
            const e = ev[ev.length - 1];
            reason = 'p' + e.peak + '→' + (e.outcome || '?') + (e.assignedBeat != null && e.assignedBeat !== i ? '（拍' + (e.assignedBeat + 1) + 'へ）' : '');
        }
        lines.push('拍' + (i + 1) + '：' + reason);
    }
    if (!lines.length) { els.resultsMissDebug.classList.add('hidden'); return; }
    const shown = lines.slice(0, 10);
    const extra = lines.length - shown.length;
    els.resultsMissDebug.textContent = '🔍 MISS拍デバッグ｜' + shown.join(' / ') + (extra > 0 ? ' ／ ほか' + extra + '拍' : '');
    els.resultsMissDebug.classList.remove('hidden');
}

/* コードストローク：立ち上がり未検出MISSの原因を拍ごとに短く分類する。
   救済はしない（観察用）。次にどのゲートを調整すべきかが分かるラベルを返す。 */
function chordMissReason(i) {
    const pb = state.chordBeatProbe ? state.chordBeatProbe[i] : null;
    const thr = mic.threshold;
    if (!pb || pb.maxPeak < thr * 0.5) return '拍近くにピークなし';
    if (pb.maxPeak < thr) return '反応ライン未満';
    if (pb.cooldownBlocked) return 'クールダウン中';
    if (pb.bestInstantRise < state.chordInstantRiseGate) return '瞬間上昇不足';
    if (pb.bestRiseFromValley < state.chordRiseGate) return '谷上昇不足';
    return '条件は満たすが未登録（近い拍へ吸収など）';
}

/* コードストローク：立ち上がり未検出MISSの集計（{count, reasons, lines}）＋console詳細ダンプ。 */
function chordMissAnalyze() {
    const reasons = {}; const lines = []; const rows = [];
    for (let i = 0; i < TOTAL_BEATS; i++) {
        const r = state.results[i];
        if (r && r.cls !== 'miss') continue; // 登録済みGOOD/EARLY/LATEは対象外
        const reason = chordMissReason(i);
        reasons[reason] = (reasons[reason] || 0) + 1;
        lines.push('拍' + (i + 1) + '：立ち上がり未検出（' + reason + '）');
        const pb = state.chordBeatProbe[i] || {};
        rows.push({
            拍: i + 1, beatMicPeak: +(state.beatMicPeak[i] || 0).toFixed(3), 反応ライン: +mic.threshold.toFixed(3),
            最大peak: +(pb.maxPeak || 0).toFixed(3), 最大env: +(pb.maxEnv || 0).toFixed(3),
            谷上昇: +(pb.bestRiseFromValley || 0).toFixed(3), 瞬間上昇: +(pb.bestInstantRise || 0).toFixed(3),
            ピークズレms: (pb.offsetMs != null ? pb.offsetMs : ''), クールダウン中: !!pb.cooldownBlocked, 理由: reason,
        });
    }
    if (rows.length) {
        console.log('[chord] 立ち上がり未検出MISS', { count: rows.length, reasons, gates: { cooldown: state.chordMinCooldown, riseGate: +state.chordRiseGate.toFixed(3), instGate: +state.chordInstantRiseGate.toFixed(3), threshold: +mic.threshold.toFixed(3) } });
        try { console.table(rows); } catch (_) { console.log('[chord] missTable', JSON.stringify(rows)); }
    }
    return { count: rows.length, reasons, lines };
}

/* コードストロークモードのPLAY観察（開発用）：拾った入力数・無視した再ピーク・二重反応・ゲート値＋立ち上がり未検出MISS要約 */
function updateChordDev() {
    if (!els.resultsChordDev) return;
    const hideAll = () => {
        [els.resultsChordDev, els.resultsChordDetail, els.resultsChordMiss].forEach((e) => { if (e) e.classList.add('hidden'); });
    };
    if (state.strokeDetectMode !== 'chord' || state.inputMode !== 'stroke') { hideAll(); return; }
    const miss = chordMissAnalyze();
    const picked = state.chordPicked || 0;
    const doubles = state.doubleReactionCount || 0;
    // ユーザー向けの良否：拾った入力が32前後・二重反応が少ない・未検出MISSが少ない → 良好
    const good = (doubles <= 1) && (picked >= 28 && picked <= 36) && (miss.count <= 2);
    // ① ユーザー向け（シンプル）
    els.resultsChordDev.textContent = '🎸 コードストローク判定：' + (good ? '良好' : '注意')
        + '｜拾った入力 ' + picked + ' ／ 二重反応 ' + doubles;
    els.resultsChordDev.classList.remove('hidden');
    // ② 詳細診断（開発用寄り）：再ピーク・クールダウン・ゲート
    if (els.resultsChordDetail) {
        els.resultsChordDetail.textContent = '（詳細診断）無視した再ピーク ' + (state.chordIgnoredRePeaks || 0)
            + ' ／ クールダウン ' + state.chordMinCooldown + 'ms ／ 谷上昇ゲート ' + state.chordRiseGate.toFixed(3)
            + ' ／ 瞬間上昇ゲート ' + state.chordInstantRiseGate.toFixed(3);
        els.resultsChordDetail.classList.remove('hidden');
    }
    // ③ 立ち上がり未検出MISSの診断（MISSが出たときだけ・開発用）
    if (els.resultsChordMiss) {
        if (!miss.lines.length) { els.resultsChordMiss.classList.add('hidden'); }
        else {
            const mainReason = Object.keys(miss.reasons).sort((a, b) => miss.reasons[b] - miss.reasons[a])[0];
            const shown = miss.lines.slice(0, 8);
            const extra = miss.lines.length - shown.length;
            els.resultsChordMiss.textContent = '🔎（開発用）立ち上がり未検出MISS ' + miss.count + '（主因：' + mainReason + '）｜'
                + shown.join(' / ') + (extra > 0 ? ' ／ ほか' + extra + '拍' : '');
            els.resultsChordMiss.classList.remove('hidden');
        }
    }
}

/* 二重反応（1拍に複数入力）の表示。
   通常表示はシンプルにマイク反応テストやり直しへ誘導し、詳しい説明・改善方法は詳細タブ内に出す。 */
function updateDoubleInfo() {
    const n = state.doubleReactionCount || 0;
    const show = (state.inputMode === 'stroke' && n > 0);
    if (els.resultsDoubleNotice) els.resultsDoubleNotice.classList.toggle('hidden', !show);
    if (els.resultsDoubleDetail) els.resultsDoubleDetail.classList.toggle('hidden', !show);
    if (!show) return;
    if (els.resultsDoubleMsg) {
        // 具体的な対処を案内（v0.9.79）。文言のみでSTAGE判定ロジックは変更しない。
        const cur = mic.cooldownMs || 0;
        const next = Math.min(400, cur + 50);
        els.resultsDoubleMsg.textContent = '⚠ 二重反応が ' + n + ' 回出ています。まずはマイク設定の「詳細テスト」でマイク反応テストをやり直してください。'
            + '改善しない場合は、手動設定で「二重反応防止」を少し長めにしてください（例：' + cur + 'ms → ' + next + 'ms）。';
    }
}

/* ── 集計・結果 ─────────────────────────────────────────── */
function finish() {
    state.running = false;
    // 停止後に未発音クリックを止める（途中停止と同様）
    state.scheduledClicks.forEach((osc) => { try { osc.stop(); } catch (_) { } });
    state.scheduledClicks = [];
    cancelAnimationFrame(state.raf);
    setTempoEnabled(true);
    els.playBtn.textContent = '▶ 開始';
    els.playBtn.disabled = false;
    if (els.tapHint) els.tapHint.classList.remove('dim');
    els.barCounter.textContent = `${state.bars} / ${state.bars} 小節`;
    els.latestVerdict.textContent = '終了';
    els.latestVerdict.dataset.state = 'idle';
    els.progressFill.style.width = '100%';

    let just = 0, early = 0, late = 0, miss = 0, scoreSum = 0;
    const diffs = [];
    const firstHalf = [], secondHalf = [];
    let judgeCount = 0;
    for (let i = 0; i < TOTAL_BEATS; i++) {
        if (!engIsHit(i)) continue;        // カスタム：休符/タイは採点対象外（未入力でもMISSにしない）
        judgeCount++;
        const r = state.results[i];
        const cls = r ? r.cls : 'miss';
        if (cls === 'just') just++;
        else if (cls === 'early') early++;
        else if (cls === 'late') late++;
        else miss++;
        scoreSum += SCORE_PTS[cls];
        if (r && r.tapped) {
            diffs.push(r.diff);
            (i < TOTAL_BEATS / 2 ? firstHalf : secondHalf).push(r.diff);
        }
    }
    const denom = judgeCount || 1;
    const score = Math.round(scoreSum / denom);
    const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const avg = mean(diffs);
    const fAvg = mean(firstHalf), sAvg = mean(secondHalf);

    els.rScore.textContent = score;
    els.rJust.textContent = just;
    els.rEarly.textContent = early;
    els.rLate.textContent = late;
    els.rMiss.textContent = miss;
    if (diffs.length) {
        const sign = avg > 0 ? '+' : (avg < 0 ? '−' : '±');
        els.rAvg.textContent = sign + Math.abs(Math.round(avg));
    } else {
        els.rAvg.textContent = '—';
    }
    els.rComment.textContent = buildComment({ just, miss, tapped: diffs.length, avg, fAvg, sAvg, total: denom })
        + chordCommentSuffix();

    // クリック音拾いの可能性を判定（ストローク＝マイク入力で、GOODのズレがほぼ一点に集中している）
    maybeShowClickPickupWarning();
    // MISSの原因切り分け（入力レベル不足 / 入力はあるが判定候補にならず）を集計
    updateMissInfo();
    // MISS原因の拍ごとデバッグ（console.table＋結果詳細に1行）
    logBeatDebug();
    updateMissDebug();
    updateChordDev();
    // 二重反応の集計＋案内
    updateDoubleInfo();
    // ストローク音量バー＋反応ライン（ストローク＝マイク時のみ表示）
    if (els.resultsMicWrap) els.resultsMicWrap.classList.toggle('hidden', state.inputMode !== 'stroke');

    // カスタムテスト時だけ結果画面に「編集に戻る」を表示（STAGE1では出さない・v0.9.124）
    if (els.rEditBackBtn) els.rEditBackBtn.classList.toggle('hidden', !eng.custom);
    // 結果をモーダルで表示（ズレ確認レーンがメイン）
    if (els.resultsOverlay) els.resultsOverlay.classList.remove('hidden');
    if (els.refreshBar) els.refreshBar.classList.add('hidden'); // モーダル背後に透けないよう一時的に隠す
    document.body.classList.add('results-open');               // モーダル中は戻る/TOP/設定を隠す（修正8）
    drawResults();
}

function buildComment({ just, miss, tapped, avg, fAvg, sAvg, total }) {
    if (tapped < 8) return 'タップが少なめでした。もう一度チャレンジしてみましょう。';
    const justRate = just / (total || TOTAL_BEATS);
    if (justRate >= 0.6) return 'かなり安定しています！この感覚をキープしましょう。';
    if (sAvg - fAvg > 30) return '後半でテンポが遅れ気味です（もたり）。クリックを意識して。';
    if (fAvg - sAvg > 30) return '後半で走り気味です。力まず一定をキープしましょう。';
    if (avg <= -25) return '少し前に突っ込み気味です（走り）。ほんの少し待つ意識を。';
    if (avg >= 25) return '少し後ろにモタつき気味です（もたり）。前ノリを意識して。';
    if (miss >= 8) return 'タイミングのばらつきが大きめ。まずはBPMを下げて練習を。';
    return 'おおむね安定しています。少しずつJUSTを増やしていきましょう。';
}

/* コードストロークモード時だけ、結果コメントに1文だけ補足する（既存コメントは壊さない）。 */
function chordCommentSuffix() {
    if (state.strokeDetectMode !== 'chord' || state.inputMode !== 'stroke') return '';
    const picked = state.chordPicked || 0;
    const doubles = state.doubleReactionCount || 0;
    if (doubles >= 3) return '\nコードの余韻を拾っている可能性があります。マイク反応テストをやり直すと改善する場合があります。';
    if (picked < 24) return '\n弾き始めが小さい可能性があります。少しはっきりストロークしてみましょう。';
    if (doubles <= 1 && picked >= 28 && picked <= 36) return '\nコードストロークも安定しています！';
    return '';
}

/* ── ストローク検出モード（ブラッシング / コードストローク）──────
   brush＝既存ロジック（弦ミュート・ブラッシング前提・変更しない）。
   chord＝コードストローク（余韻が長い）。現状は観察用（マイク反応テストで波形/オンセットを記録）。
   判定の本筋は今後 chord 専用ロジックを足す予定で、ここでは分岐点とログだけを用意する。 */
function setStrokeDetectMode(mode) {
    state.strokeDetectMode = (mode === 'chord') ? 'chord' : 'brush';
    updateStrokeDetectModeUI();
    saveSettings();
}
function updateStrokeDetectModeUI() {
    const chord = (state.strokeDetectMode === 'chord');
    if (els.strokeModeBrush) els.strokeModeBrush.classList.toggle('is-active', !chord);
    if (els.strokeModeChord) els.strokeModeChord.classList.toggle('is-active', chord);
    if (els.strokeModeNote) els.strokeModeNote.classList.toggle('hidden', !chord);
    // マイク反応テストの案内文をモードに合わせる（ブラッシングは従来文を維持）
    if (els.testCardNote) {
        els.testCardNote.textContent = chord
            ? '実際にコードを鳴らして、表示に合わせてストロークしてください。コードの余韻は無視し、弾き始めを拾う設定を作ります。'
            : 'クリック音が反応せず、ストローク音だけ反応するかを自動でチェックします。';
    }
}

/* ── 入力タイプ（通常マイク / イヤホン接続）──────────
   v0.9.60：'auto'（自動おすすめ）はUIから廃止。保存値がautoの既存ユーザーはnormal扱い。
   ※「自動」はユーザーが選ぶ入力タイプではなく、マイク反応テスト内部の自動調整
     （自動再テスト・低入力救済・おすすめ算出）として残す（それらのロジックは不変）。 */
const MIC_INPUT_TYPES = ['normal', 'headphone'];
function getMicInputType() {
    return mic.inputType === 'headphone' ? 'headphone' : 'normal'; // auto/未知はnormal扱い
}
function isAutoMicInput() { return false; } // UI上のautoは廃止（内部の自動調整はテスト側に存続）
function isNormalMicInput() { return getMicInputType() === 'normal'; }
function isHeadphoneInput() { return getMicInputType() === 'headphone'; }
const MIC_INPUT_TYPE_NOTE = {
    normal: 'スマホやパソコン、外部マイクで音を拾う場合に選びます。',
    headphone: 'イヤホンやヘッドホンを使う場合に選びます。ギター音は小さめに入ることがあります。',
};
/* マイク反応テストカードに出す、入力タイプ別の「テスト時の感度」説明。 */
const MIC_TEST_NOTE_BY_TYPE = {
    normal: '通常の感度で確認します。',
    headphone: '小さめの入力でも拾いやすい設定で確認します。',
};
function setMicInputType(type) {
    mic.inputType = (type === 'headphone') ? 'headphone' : 'normal';
    updateMicInputTypeUI();
    saveSettings();
}
function updateMicInputTypeUI() {
    const t = getMicInputType();
    if (els.inputTypeNormal) els.inputTypeNormal.classList.toggle('is-active', t === 'normal');
    if (els.inputTypeHeadphone) els.inputTypeHeadphone.classList.toggle('is-active', t === 'headphone');
    if (els.inputTypeNote) els.inputTypeNote.textContent = MIC_INPUT_TYPE_NOTE[t] || MIC_INPUT_TYPE_NOTE.normal;
    if (els.testInputNote) els.testInputNote.textContent = MIC_TEST_NOTE_BY_TYPE[t] || MIC_TEST_NOTE_BY_TYPE.normal;
    // 入力タイプに応じてカードを出し分ける。
    // headphone：イヤホン種類カードを表示／マイク遅れ補正カードは隠す。
    // 「イヤホンの音ズレ補正」カードの表示可否は種類（Bluetoothのみ）次第なので updateHeadphoneTypeUI() に委ねる。
    const headphone = (t === 'headphone');
    if (els.hpTypeCard) els.hpTypeCard.classList.toggle('hidden', !headphone);
    if (els.calCard) els.calCard.classList.toggle('hidden', headphone);
    // 実践テストカードは入力タイプに関係なく常に表示（補足文だけ入力タイプで変える）。
    updatePracticeTestNote();
    stopPracticeTest(); // 入力タイプを変更したら実践テストは停止
    if (els.setHpOffsetRow) els.setHpOffsetRow.classList.toggle('hidden', !headphone); // 手動設定の補正行は headphone のときだけ
    updateHeadphoneTypeUI();
}

/* ── イヤホンの音ズレ補正（v0.9.50〜）─────────────────────────────
   クリック音と4つの丸の点灯を、スライダー(offset)分だけ前後させて
   「音と光が同時に感じられる」位置をユーザーが探すための補助。
   v0.9.51：イヤホンの種類（有線/Bluetooth）を持ち、種類別に補正値を保存。
   重要：今回もUI・再生・保存のみ。STAGE判定/マイク判定/timingOffsetMs には一切反映しない。 */
const HP_OFFSET_MIN = -200;       // スライダー下限(ms)：音が丸より早い側（v0.9.84で-200ms）
const HP_OFFSET_MAX = 400;        // スライダー上限(ms)：音が丸より遅い側（v0.9.92で+300ms、v0.9.97で+400msへ拡張）
const HP_OFFSET_DEFAULT = 0;      // 互換用の既定（補正なし）
const HP_CAL_BEAT_MS = 600;       // 補正テストの既定テンポ（100BPM相当）。実テンポは hpCalBeatMs() を使う（v0.9.92）
/* イヤホン音ズレ補正テスト専用BPM（v0.9.92→v0.9.93で範囲変更）。STAGE/最終確認テストのテンポには影響しない一時設定。 */
const HP_CAL_BPM_MIN = 20, HP_CAL_BPM_MAX = 160, HP_CAL_BPM_STEP = 20;
let hpCalBpm = 80;                 // イヤホン音ズレ補正テストのデフォルトBPM（v0.9.100で100→80へ）
function hpCalBeatMs() { return 60000 / hpCalBpm; }
/* Bluetoothイヤホンの「標準」スタートライン(ms)。判定ズレ補正ではなく、イヤホン音と画面表示を
   合わせるための表示補正の基準値。
   v0.9.100：測っているものが違うため、マイク設定側と画面タップ設定側で標準値を分離する。
   ・マイク設定側(MIC=100ms)：マイク遅れ補正画面の表示/クリック合わせ用。
   ・画面タップ設定側(TAP=200ms)：タップ判定/表示用（BUILTIN_TAP_PRESETS の builtin_tap_bt と一致）。
   いずれも判定（STAGEストローク/最終確認テストのマイク判定）には反映しない。 */
const HP_BLUETOOTH_STANDARD_OFFSET_MIC = 100;
const HP_BLUETOOTH_STANDARD_OFFSET_TAP = 200;
const HP_CAL_LEAD_MS = 80;        // クリックを少し先に鳴らし、負offsetでも丸を先に光らせられるようにする土台
const HP_CAL_AUTO_BEATS = 16;     // 4小節（4拍×4）で自動停止する（v0.9.110。v0.9.109の8小節から短縮）。BPM可変でも拍数で数える
const hpCal = { active: false, timer: 0, beat: 0, lightTimers: [], raf: 0, flowStartPerf: 0, autoStopCanceled: false };
let hpLane = { ctx: null, w: 0, h: 0 }; // イヤホン音ズレ補正の流れるレーン（v0.9.91）

/* イヤホン種類の定義・種類別の目安値・説明文 */
const HP_TYPES = ['wired', 'bluetooth'];
const HP_TYPE_DEFAULT_OFFSET = { wired: 0, bluetooth: 0 }; // v0.9.84：有線/Bluetoothとも目安0ms（補正なし）
const HP_TYPE_NOTE = {
    wired: '有線イヤホンは音ズレ補正なし（0ms）が基本です。違和感がある場合だけ手動設定で調整してください。',
    bluetooth: 'Bluetoothイヤホンも音ズレ補正は0ms（補正なし）が基本です。画面と音がズレて感じるときだけ、補正テストで音と丸を合わせてください。（マイク判定のズレは「マイク遅れ補正」で合わせます）',
};
/* 手動設定（イヤホン音ズレ補正行）に出す種類別の説明文 */
const HP_MANUAL_NOTE = {
    wired: '有線イヤホンは通常、補正なし（0ms）で問題ありません。違和感がある場合だけ調整してください。',
    bluetooth: 'Bluetoothは機種によってズレが大きいため、必要に応じて微調整してください。音が丸より遅れて聞こえるなら「丸を遅らせる（右）」、早く聞こえるなら「丸を早める（左）」へ。',
};
function getHeadphoneType() { return mic.headphoneType === 'bluetooth' ? 'bluetooth' : 'wired'; }
/* Bluetoothイヤホン接続中か（マイク遅れ補正の表示/判定反映の条件・v0.9.80） */
function isBluetoothHeadphone() { return isHeadphoneInput() && getHeadphoneType() === 'bluetooth'; }
/* 判定時刻に使うマイク補正（ms）。通常/有線は timingOffsetMs のみ。
   Bluetoothイヤホン時だけ bluetoothMicOffsetMs を加算する（v0.9.80）。
   イヤホン音ズレ補正 headphoneOutputOffsetMs はここに含めない（判定には反映しない）。 */
function micJudgeOffsetMs() {
    return mic.timingOffsetMs + (isBluetoothHeadphone() ? (mic.bluetoothMicOffsetMs || 0) : 0);
}
/* タップモード専用の出力ズレ補正（ms・v0.9.95）。
   タップは「イヤホンから聞こえるクリック音」に合わせて押すモード。Bluetooth等でイヤホン音が遅れて
   出る分（イヤホン音ズレ補正 headphoneOutputOffsetMs ≒ 出力遅延）を、タップ判定時刻から差し引くことで、
   「音に合わせたタップ」がJUSTになるようにする。
   ・「画面タップ設定」タブで設定した値（headphoneOutputOffsetMs）をそのまま使う。タップ専用なので
     マイク入力タイプ（通常/イヤホン）に依存させない。未設定なら0msで実質無効。
   ・マイク判定(micJudgeOffsetMs / bluetoothMicOffsetMs)やストロークモード(source==='mic')には一切影響しない。 */
function tapOutputOffsetMs() {
    return mic.headphoneOutputOffsetMs || 0;
}
/* offset候補が有効範囲内ならその数値、無効なら fallback を返す */
function validHpOffset(x, fallback) {
    const n = Number(x);
    return (isFinite(n) && n >= HP_OFFSET_MIN && n <= HP_OFFSET_MAX) ? n : fallback;
}
/* 選択中の種類が保持している補正値 */
function currentHpTypeOffset() {
    return getHeadphoneType() === 'bluetooth' ? mic.headphoneOffsetBluetoothMs : mic.headphoneOffsetWiredMs;
}

/* 補正テスト専用クリック。クリック音量が0でも聞き取れるよう下限を設ける（既存click()/STAGEには影響なし） */
function hpClick(accent) {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const vol = Math.max(0.4, Math.min(1, (state.clickVolume || 0) / 100));
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1500 : 1200;
    const peak = (accent ? 0.55 : 0.45) * vol;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.09);
}

/* イヤホン音ズレ補正レーン（v0.9.91）：STAGE/最終確認テスト風に、右→左へ4拍の丸が流れる。
   丸の中心線がJUSTラインに重なる瞬間にクリック音が鳴る設計。ユーザーは「丸がJUSTに重なる瞬間」と
   「イヤホンから聞こえるクリック音」が合っているかを見て、スライダーで丸の表示タイミングを調整する。
   STAGE本体の描画・判定には一切触れない専用関数。 */
function fitHpLane() {
    if (!els.hpCalLaneCanvas) return;
    els.hpCalLaneCanvas.style.width = '100%';
    els.hpCalLaneCanvas.style.height = PT_LANE_HEIGHT + 'px';
    hpLane = fitOne(els.hpCalLaneCanvas);
}

/* 丸＋中心の縦線を描く（1拍目だけ色違い） */
function drawHpDotLane(ctx, x, yc, accent) {
    const r = accent ? 15 : 13;
    const fill = accent ? 'rgba(46,204,113,0.92)' : 'rgba(255,159,28,0.92)';
    const stroke = accent ? 'rgba(46,204,113,0.55)' : 'rgba(255,159,28,0.5)';
    // 丸の中心を通る縦線（この線がJUSTラインに重なる瞬間に合わせる）
    ctx.save();
    ctx.strokeStyle = accent ? 'rgba(46,204,113,0.6)' : 'rgba(253,246,238,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, yc - r - 22);
    ctx.lineTo(x, yc + r + 22);
    ctx.stroke();
    ctx.restore();
    // 丸本体
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, yc, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
}

function drawHpLane(tNow) {
    if (!hpLane || !hpLane.ctx) return;
    const { ctx, w, h } = hpLane;
    ctx.clearRect(0, 0, w, h);
    const yc = h * 0.5;
    const beatMs = hpCalBeatMs();
    const beatPx = Math.max(64, Math.min(120, w * 0.22));
    const justX = w * 0.3;
    const ppm = beatPx / beatMs;
    const offset = mic.headphoneOutputOffsetMs || 0; // 丸の表示タイミング補正（音と合わせる用）
    // 中央ガイド（横線）
    ctx.strokeStyle = 'rgba(253,246,238,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke();
    // 流れる丸：丸 k は flowStartPerf + k*beat + offset に中心線がJUSTへ重なる
    const rel = tNow - hpCal.flowStartPerf;
    const kCenter = Math.round((rel - offset) / beatMs);
    for (let k = kCenter - 2; k <= kCenter + 6; k++) {
        if (k < 0) continue;
        const crossPerf = k * beatMs + offset; // flowStartPerf基準（rel と同じ軸）
        const x = justX + (crossPerf - rel) * ppm;
        if (x < -40 || x > w + 40) continue;
        drawHpDotLane(ctx, x, yc, (k % 4 === 0));
    }
    // JUSTライン（縦・静的）
    ctx.save();
    ctx.strokeStyle = 'rgba(255,159,28,0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(justX, h * 0.08); ctx.lineTo(justX, h * 0.92); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,159,28,0.75)';
    ctx.font = '700 11px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JUST', justX, h * 0.99);
}

function hpLoop() {
    if (!hpCal.active) return;
    drawHpLane(performance.now());
    hpCal.raf = requestAnimationFrame(hpLoop);
}

function hpBeatTick() {
    // v0.9.110：4小節（HP_CAL_AUTO_BEATS=16拍）流したら自動停止する。
    // 17拍目のクリックを鳴らさず、ここで止める（＝1〜4小節ぶんのクリックが鳴る）。
    // v0.9.112：テスト中にスライダーを動かした回は autoStopCanceled=true になり、自動停止しない
    //   （調整中に止まると操作しづらいため）。その回は手動停止するまで続く。次の開始/再テストで再び有効。
    if (!hpCal.autoStopCanceled && hpCal.beat >= HP_CAL_AUTO_BEATS) {
        finishHeadphoneCalAuto();
        return;
    }
    const i = hpCal.beat % 4;
    hpClick(i === 0); // クリックは即時。丸の表示タイミング(offset)はレーン側で反映する
    hpCal.beat++;
}

/* 4小節ぶん流れたあとの自動停止（v0.9.109→v0.9.110で4小節に短縮）。
   手動停止と同じく「レーンは閉じず、丸を初期位置へ戻して静止」させ、
   「この音ズレ設定で進む」ボタンが押しやすい位置までスクロールし、案内文を表示する。 */
function finishHeadphoneCalAuto() {
    stopHeadphoneCal({ keepLane: true });
    if (els.hpCalAutoMsg) els.hpCalAutoMsg.classList.remove('hidden');
    scrollHpProceedIntoView();
}

/* 「この音ズレ設定で進む（or この音ズレ設定で使う）」ボタンを、画面下端ギリギリではなく
   画面の中央〜やや下（下に余白が残る位置）へ1回だけスクロールする（v0.9.111）。
   ガクつかないよう、レイアウト確定（2フレーム）後に window.scrollTo を1回だけ呼ぶ。 */
function scrollHpProceedIntoView() {
    const el = (els.hpProceedBtn && !els.hpProceedBtn.classList.contains('hidden'))
        ? els.hpProceedBtn
        : (els.hpTapUseBtn && !els.hpTapUseBtn.classList.contains('hidden') ? els.hpTapUseBtn : els.hpProceedBtn);
    if (!el || !el.getBoundingClientRect) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const beforeY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const absY = el.getBoundingClientRect().top + beforeY;
        // ボタンを画面の約65%の高さに置く＝ボタンの下に余白が残り、押しやすい。
        const top = Math.max(0, absY - window.innerHeight * 0.65);
        try { window.scrollTo({ top, behavior: 'smooth' }); }
        catch (_) { window.scrollTo(0, top); }
    }));
}

function startHeadphoneCal() {
    if (pt.active) stopPracticeTest(); // 最終確認テストと排他
    stopBtCal(); // マイク遅れ補正と排他
    ensureAudio();
    try { if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume(); } catch (_) { /* ignore */ }
    hpCal.active = true;
    hpCal.beat = 0;
    hpCal.autoStopCanceled = false; // v0.9.112：開始/再テストごとに自動停止を有効へ戻す
    if (els.hpCalAutoMsg) els.hpCalAutoMsg.classList.add('hidden'); // 前回の自動停止案内を消す（v0.9.109）
    if (els.hpCalStaged) els.hpCalStaged.classList.remove('hidden'); // v0.9.117：開始でレーン/スライダー/進む/再テストを表示
    if (els.hpCalLaneWrap) els.hpCalLaneWrap.classList.remove('hidden');
    fitHpLane();
    if (els.hpCalBtn) els.hpCalBtn.textContent = '停止';
    hpCal.flowStartPerf = performance.now(); // 1拍目(k=0)のクリックと表示軸の原点を合わせる
    hpBeatTick(); // 押した直後に1拍目
    hpCal.timer = setInterval(hpBeatTick, hpCalBeatMs());
    cancelAnimationFrame(hpCal.raf);
    hpCal.raf = requestAnimationFrame(hpLoop);
    scrollToSettingsEl(els.hpCalCard); // カード上部（説明）が隠れないように（v0.9.92）
}

/* イヤホン音ズレ補正テスト専用BPMの変更（v0.9.93→v0.9.94）。
   テスト中に変更したら自動リスタートせず一旦停止する。ただしレーンは閉じず、丸を初期位置へ戻して静止。
   新しいBPMでの確認はユーザーが「補正テスト開始」を押してから。STAGE/最終確認テストのテンポには影響しない。 */
function setHpCalBpm(bpm) {
    let v = Math.round(Number(bpm) / HP_CAL_BPM_STEP) * HP_CAL_BPM_STEP;
    if (!isFinite(v)) v = 80;
    v = Math.max(HP_CAL_BPM_MIN, Math.min(HP_CAL_BPM_MAX, v));
    hpCalBpm = v;
    if (els.hpBpmVal) els.hpBpmVal.textContent = String(v);
    // 変更時はクリック音/アニメを停止し、レーンは表示したまま初期位置へ戻す（v0.9.94）
    if (hpCal.active) stopHeadphoneCal({ keepLane: true });
}

/* 補正テストの停止。既定はレーンも閉じる（完了/別ステップ移動/設定を閉じる/明示的な中止など）。
   opts.keepLane=true のときだけ、レーンは表示したまま丸を初期位置へ戻して静止させる（v0.9.94：BPM変更時用）。 */
function stopHeadphoneCal(opts) {
    const keepLane = !!(opts && opts.keepLane);
    hpCal.active = false;
    // 自動停止の案内は既定で消す（自動停止時は finishHeadphoneCalAuto が停止後に再表示する・v0.9.109）
    if (els.hpCalAutoMsg) els.hpCalAutoMsg.classList.add('hidden');
    if (hpCal.timer) { clearInterval(hpCal.timer); hpCal.timer = 0; }
    hpCal.lightTimers.forEach((t) => clearTimeout(t));
    hpCal.lightTimers = [];
    cancelAnimationFrame(hpCal.raf); hpCal.raf = 0;
    if (els.hpCalBtn) els.hpCalBtn.textContent = '補正テスト開始';
    if (keepLane) {
        // クリック音・アニメは停止しつつ、レーンは閉じず丸を初期位置へ戻して1フレームだけ描く
        if (els.hpCalLaneWrap) els.hpCalLaneWrap.classList.remove('hidden');
        hpCal.beat = 0;
        hpCal.flowStartPerf = performance.now();
        fitHpLane();
        drawHpLane(hpCal.flowStartPerf); // rel=0＝初期位置（現在のBPMの間隔で静止描画）
    } else {
        if (els.hpCalLaneWrap) els.hpCalLaneWrap.classList.add('hidden');
        // v0.9.117：完了/別ステップ移動/設定を閉じる等の本停止では、段階表示を初期（説明＋開始＋BPMのみ）に戻す
        if (els.hpCalStaged) els.hpCalStaged.classList.add('hidden');
    }
}

function toggleHeadphoneCal() {
    // v0.9.100：ユーザーが明示的に「停止」した場合もレーンは閉じず、丸を初期位置へ戻して静止表示する。
    // （「この音ズレ設定で進む」「設定を閉じる」「別ステップ移動」「マイク設定TOP」「タブ切替」では従来どおり閉じる）
    if (hpCal.active) {
        stopHeadphoneCal({ keepLane: true });
        // v0.9.104→v0.9.111：停止したら「この音ズレ設定で進む」ボタンを押しやすい位置（中央〜やや下）へスクロール。
        scrollHpProceedIntoView();
    } else {
        startHeadphoneCal();
    }
}

/* 「再テスト」ボタン（v0.9.111）：現在のスライダー値はそのまま、補正テストをもう一度開始する。
   停止中に押したら必ず開始。動作中に押したら一旦止めてから開始（＝確実に頭から流し直す）。 */
function retestHeadphoneCal() {
    if (hpCal.active) stopHeadphoneCal({ keepLane: true });
    startHeadphoneCal();
}

/* スライダー/「目安に戻す」からの補正値更新。範囲外・不正値は選択中の種類の目安に丸める。
   値は「選択中の種類」の保存先と、互換用 headphoneOutputOffsetMs の両方へ反映する。 */
function setHeadphoneOffset(ms, opts) {
    let v = Number(ms);
    if (!isFinite(v) || v < HP_OFFSET_MIN || v > HP_OFFSET_MAX) v = HP_TYPE_DEFAULT_OFFSET[getHeadphoneType()];
    if (getHeadphoneType() === 'bluetooth') mic.headphoneOffsetBluetoothMs = v;
    else mic.headphoneOffsetWiredMs = v;
    mic.headphoneOutputOffsetMs = v;
    // 補正カード側スライダーと手動設定側スライダーの両方を同期
    if (els.hpOffset) els.hpOffset.value = v;
    if (els.hpOffsetVal) els.hpOffsetVal.textContent = v + 'ms';
    if (els.setHpOffset) els.setHpOffset.value = v;
    if (els.setHpOffsetVal) els.setHpOffsetVal.textContent = v + 'ms';
    // 画面タップ設定の手動スライダー／ホームの現在値表示も同期（v0.9.97）
    if (els.tapManualOffset) els.tapManualOffset.value = v;
    if (els.tapManualVal) els.tapManualVal.textContent = v + 'ms';
    if (els.tapCurrentOffset) els.tapCurrentOffset.textContent = '現在のタップ補正：' + v + 'ms';
    if (!opts || !opts.skipSave) saveSettings();
}

/* イヤホン種類の切替。選択中の種類が保持している補正値へ同期する（過去に調整済みならその値を維持）。 */
function setHeadphoneType(type, opts) {
    mic.headphoneType = (type === 'bluetooth') ? 'bluetooth' : 'wired';
    if (opts && opts.resetDefault) {
        // 詳細テストでBluetoothを選び直したときは、マイク設定側の「Bluetoothイヤホン標準(100ms)」を
        // スタートラインにする（表示補正の基準・v0.9.94→v0.9.99→v0.9.100）。有線は従来どおり0ms（補正なし）。
        if (mic.headphoneType === 'bluetooth') mic.headphoneOffsetBluetoothMs = HP_BLUETOOTH_STANDARD_OFFSET_MIC;
        else mic.headphoneOffsetWiredMs = HP_TYPE_DEFAULT_OFFSET.wired;
    }
    mic.headphoneOutputOffsetMs = currentHpTypeOffset();
    updateHeadphoneTypeUI();
    saveSettings();
}

/* 「補正なしに戻す」（旧・目安に戻す）：選択中の種類の目安値（v0.9.84：有線/Bluetoothとも0ms）へ戻す */
function resetHeadphoneOffsetToGuide() {
    setHeadphoneOffset(HP_TYPE_DEFAULT_OFFSET[getHeadphoneType()]);
}

/* 「補正なしに戻す」：選択中の種類の補正値を0ms（補正なし）へ戻す（v0.9.79）。
   v0.9.93：テスト中に押した場合は一旦停止（BPM変更と同様）。値はレーン/クリックへ即反映され、
   ユーザーが「補正テスト開始」で確認し直せる。 */
function resetHeadphoneOffsetToZero() {
    // v0.9.97：テスト中でもレーンは閉じず、丸を初期位置へ戻して表示したまま一時停止する
    if (hpCal.active) stopHeadphoneCal({ keepLane: true });
    setHeadphoneOffset(0);
    redrawHpLaneIfOpen();
}

/* 「Bluetoothイヤホン標準」（マイク設定タブ）：Bluetoothの表示補正をスタートライン(100ms)へ戻す（v0.9.94→v0.9.100）。
   判定ズレ補正(bluetoothMicOffsetMs)ではなく、イヤホン音と画面表示を合わせるための表示補正。 */
function resetHeadphoneOffsetToBluetoothStandard() {
    // v0.9.97：テスト中でもレーンは閉じず、丸を初期位置へ戻して表示したまま一時停止する
    if (hpCal.active) stopHeadphoneCal({ keepLane: true });
    setHeadphoneOffset(HP_BLUETOOTH_STANDARD_OFFSET_MIC);
    redrawHpLaneIfOpen();
}

/* 補正テスト停止中でもレーンが開いていれば、現在の補正値で静止レーンを描き直す（v0.9.97）。 */
function redrawHpLaneIfOpen() {
    if (hpCal.active) return; // 動作中は hpLoop が描画している
    if (els.hpCalLaneWrap && !els.hpCalLaneWrap.classList.contains('hidden')) {
        hpCal.beat = 0;
        hpCal.flowStartPerf = performance.now();
        fitHpLane();
        drawHpLane(hpCal.flowStartPerf); // rel=0＝初期位置を現在の補正値で静止描画
    }
}

/* 種類選択UI・説明文・カード表示・スライダー表示を、選択中の種類に合わせて更新。
   v0.9.52：有線は「イヤホンの音ズレ補正」カードを隠し（手動設定で調整）、Bluetoothのみカード表示。 */
function updateHeadphoneTypeUI() {
    const t = getHeadphoneType();
    if (els.hpTypeWired) els.hpTypeWired.classList.toggle('is-active', t === 'wired');
    if (els.hpTypeBluetooth) els.hpTypeBluetooth.classList.toggle('is-active', t === 'bluetooth');
    if (els.hpTypeNote) els.hpTypeNote.textContent = HP_TYPE_NOTE[t] || HP_TYPE_NOTE.wired;
    // 「イヤホンの音ズレ補正」カードは headphone かつ Bluetooth のときだけ表示
    const showCal = isHeadphoneInput() && t === 'bluetooth';
    if (els.hpCalCard) els.hpCalCard.classList.toggle('hidden', !showCal);
    // 「Bluetoothイヤホン標準」ボタンは Bluetooth のときだけ表示（v0.9.93）
    if (els.hpStdBtn) els.hpStdBtn.style.display = (t === 'bluetooth') ? '' : 'none';
    if (!showCal && hpCal.active) stopHeadphoneCal(); // カードが隠れたら補正テストを停止
    // スライダー/表示（補正カード側・手動設定側）を選択中の種類の値へ同期
    const v = mic.headphoneOutputOffsetMs;
    if (els.hpOffset) els.hpOffset.value = v;
    if (els.hpOffsetVal) els.hpOffsetVal.textContent = v + 'ms';
    if (els.setHpOffset) els.setHpOffset.value = v;
    if (els.setHpOffsetVal) els.setHpOffsetVal.textContent = v + 'ms';
    // 手動設定の説明文・リセットボタン文言
    if (els.setHpOffsetNote) els.setHpOffsetNote.textContent = HP_MANUAL_NOTE[t] || HP_MANUAL_NOTE.wired;
    // v0.9.84：有線/Bluetoothとも目安＝補正なし（0ms）なので「補正なしに戻す」1本に集約。
    if (els.setHpResetBtn) { els.setHpResetBtn.textContent = '補正なしに戻す'; els.setHpResetBtn.style.display = ''; }
    if (els.setHpZeroBtn) els.setHpZeroBtn.style.display = 'none';
}

/* ── 実践テスト（v0.9.56。旧「判定ズレ確認」を再設計）─────────────────
   通常マイク・イヤホン共通の「実践テスト」。STAGE1「4分ジャスト」に近い内容で、
   STAGE1風の流れる音符＋判定ライン＋音量波形を表示し、8回ストロークの
   GOOD/EARLY/LATE/MISS・平均ズレ・検出音量・二重反応を「総合的に」確認するだけ。
   重要：補正値の自動適用・timingOffsetMs変更・STAGE判定への反映は一切しない（確認と表示のみ）。
   判定の基準時刻・拍割り当て・分類は STAGE と同じ「オーディオ時計＋mic.timingOffsetMs」で行う（読むだけ）。
   描画は STAGE本体ではなく、マイク反応テストと同じテストレーン描画の流儀を流用した専用キャンバスで行い、
   STAGE本体の state.results / スコア / 進行には一切触れない（専用モード practiceTest）。 */
const PT_BPM = 80;                      // STAGE1と同じテンポ
const PT_BEAT_MS = 60000 / PT_BPM;      // 750ms（4分）
const PT_COUNTIN = 4;                   // カウントイン4拍
const PT_PLAY_BEATS = 8;                // 本番8回ストローク
const PT_LEAD_MS = 400;                 // 開始から最初のカウントインまでの小休止
const PT_NEAR_WIN = Math.max(NEAR_MS, PT_BEAT_MS * NEAR_FRAC); // 拍への割り当て窓（これを超えたらMISS）
const PT_CAP_WIN_MS = PT_BEAT_MS * 0.5; // 取り込み開始/終了のゆとり
const PT_WAVE_WINDOW_MS = 4000;         // 波形バッファの保持時間
const PT_LANE_HEIGHT = 168;             // STAGE1本体の #lane-canvas と同じCSS高さ
const pt = {
    active: false, capturing: false, timers: [], scheduled: [], raf: 0,
    audioStart: 0, flowStartPerf: 0, playT0Ms: 0,
    notes: [], onsets: [], wave: [], clickPerfTimes: [], lastOnsetAt: 0, lastDetectAt: -100000, maxPeak: 0, doubleCount: 0,
    armed: true,
    valley: 1, // コードストローク用の谷（直前検出後の最小音量）。実践テスト専用（STAGEの mic.valley とは別）。
    fullWave: [], // 見返し用（v0.9.74）：全区間の音量波形（flowStart基準ms）。間引きせず保持。
    debug: null, // 開発確認用（v0.9.77）：検出/割り当て/除外理由の集計。ユーザー表示には使わない。
};

/* ── Bluetooth用マイク遅れ補正（v0.9.80）─────────────────────────────
   クリックに合わせた手拍子/ストロークの「判定タイミングの偏り」を測り、
   Bluetoothイヤホン時だけ判定時刻へ加算する補正値 bluetoothMicOffsetMs を提案する。
   検出は最終確認テストと同じテンポ・同じクリックガードを使うが、拍割り当て等の
   複雑なロジックは持たず「各拍に最も近いオンセット時刻」を集めて平均ズレを出すだけ。 */
const BT_MIC_OFFSET_MIN = -400;     // 補正値の下限(ms)。v0.9.105：BTの大きな出力+入力遅延（実測で約-280msが必要なケース）に届かず
                                    //   下限-200で頭打ち→平均ズレが残ったまま「小さめ」誤判定になっていたため -400 まで拡張。
const BT_MIC_OFFSET_MAX = 200;      // 補正値の上限(ms)
const BT_MIC_STEP_CLAMP = 80;       // 1回の補正で動かす量の上限(ms)
/* デバッグ用（v0.9.105）：マイク遅れ補正の判定値を確認したいときだけ true。本番は false。 */
const BT_DEBUG = false;
/* 微調整（v0.9.92→v0.9.94）：大きな補正提案が出ないケースで、最新の平均ズレを使って必ず少し寄せる。
   既存の「大きな補正」とは別枠。符号ルールは大きな補正と同じ（new = cur - avg）。 */
const BT_FINE_STEP_CLAMP = 30;      // 1回の微調整で動かす量の上限(ms)
const BT_PLAY_BEATS = PT_PLAY_BEATS; // 8回入力（最終確認テストと同じ）
const bt = {
    active: false, capturing: false, timers: [], scheduled: [], raf: 0,
    audioStart: 0, flowStartPerf: 0, playT0Ms: 0,
    onsets: [], clickPerfTimes: [], armed: true, lastOnsetAt: 0, lastDetectAt: -100000,
    maxPeak: 0, valley: 1, hasRun: false,
    notes: [], // 流れる👏（v0.9.81・表示専用）：{ t, num, cls, closed, peak }
    wave: [],  // 流れる波形バッファ（v0.9.81・表示専用）：{ t, level }
    result: null, // { valid, avg, early, late, just, miss, propose, proposed, cur }
};
let btLane = { ctx: null, w: 0, h: 0 }; // マイク遅れ補正の流れるレーン（v0.9.81）

/* 入力タイプ別の補足文（表示は常に出す。文言だけ少し変える） */
const PT_NOTE_BY_TYPE = {
    auto: 'いまの設定で、音量と判定タイミングを確認します。',
    normal: '音量と判定が安定しているかを確認します。',
    headphone: 'イヤホンでの音量と、判定の偏りを確認します。',
};
function updatePracticeTestNote() {
    if (els.ptNote) els.ptNote.textContent = PT_NOTE_BY_TYPE[getMicInputType()] || PT_NOTE_BY_TYPE.auto;
}

/* このマイク設定セッションで実践テストを一度でも実施したか（v0.9.79）。
   一度実施したら、待機中ボタンは「もう1度テストする」にする。詳細テストのやり直しでリセット。 */
let ptHasRun = false;
function ptIdleBtnLabel() { return ptHasRun ? 'もう1度テストする' : '最終確認テストを開始'; }

function setPtStatus(t) { if (els.ptStatus) els.ptStatus.textContent = t || ''; }
function ptTimer(fn, ms) { const id = setTimeout(fn, ms); pt.timers.push(id); return id; }
function fitPtLane() {
    if (!els.ptLaneCanvas) return;
    // CSS高さを固定し、fitOne() はその値をDPR変換するだけにする。
    // clientHeightを親要素から再帰的に拾わないので、スクロールしても高さが増え続けない。
    els.ptLaneCanvas.style.width = '100%';
    els.ptLaneCanvas.style.height = PT_LANE_HEIGHT + 'px';
    ptLane = fitOne(els.ptLaneCanvas);
}

function ptDetectionThreshold() {
    // 実践テストはSTAGE1の実判定確認なので、STAGE再生中と同じ検出しきい値を使う。
    return mic.threshold * MIC_STAGE_DETECT_FACTOR;
}

/* 実践テストのクリックガード（v0.9.78）：STAGE本体 isClickGuardedOnset をそのまま流用。 */
function isPtClickGuardedOnset(now, peak, lastClickPerf) {
    return isClickGuardedOnset(now, peak, lastClickPerf, true);
}

/* 実践テスト専用クリック。STAGE本番と同じ clickVolume / 音量カーブで鳴らす。 */
function ptScheduleClick(atSec, accent) {
    const ctx = state.audioCtx;
    if (!ctx) return;
    const vol = Math.max(0, Math.min(1, state.clickVolume / 100));
    const t0 = Math.max(atSec, ctx.currentTime);
    const peak = (accent ? 0.55 : 0.45) * vol;
    if (peak < 0.001) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1500 : 1200;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.09);
    pt.scheduled.push(osc);
    // クリックの「鳴った時刻」をperf換算で記録（STAGE本体の state.lastClickPerf と同じ役割）。
    pt.clickPerfTimes.push(pt.flowStartPerf + (t0 - pt.audioStart) * 1000);
}

/* 直近に鳴った（または鳴る予定の）クリックのperf時刻を返す（STAGEの state.lastClickPerf 相当）。 */
function ptLatestClickPerf(now) {
    let last = -100000;
    for (let i = 0; i < pt.clickPerfTimes.length; i++) {
        const c = pt.clickPerfTimes[i];
        if (c <= now + 10 && c > last) last = c;
    }
    return last;
}

function ptClassify(diff) {
    const a = Math.abs(diff);
    if (a <= JUST_MS) return 'just';
    if (a <= PT_NEAR_WIN) return diff < 0 ? 'early' : 'late';
    return 'miss';
}

function freshPtDebug() {
    return {
        totalPeaksOverThreshold: 0,
        detected: 0,
        assigned: 0,
        acceptedOnsets: 0,
        unassignedOnsets: 0,
        shifted: 0,
        replaced: 0,
        keptExisting: 0,
        outOfRange: 0,
        outOfWindow: 0,
        clickGuardRejected: 0,
        cooldownRejected: 0,
        codeGateRejected: 0,
        missNotes: 0,
        rejects: [], // { timeMs, peak, nearestBeat, diffMs, reason }
    };
}

function ptDebugCount(key) {
    if (!PT_DEBUG) return;
    if (!pt.debug) pt.debug = freshPtDebug();
    pt.debug[key] = (pt.debug[key] || 0) + 1;
}

/* PT_DEBUG=true のときだけ、除外入力を記録（最大20件）。 */
function ptLogReject(tMs, peak, reason, extra) {
    if (!PT_DEBUG) return;
    if (!pt.debug) pt.debug = freshPtDebug();
    const bi = PT_BEAT_MS;
    const nb = Math.round((tMs - pt.playT0Ms) / bi);
    const diffMs = Math.round(tMs - (pt.playT0Ms + nb * bi));
    const row = Object.assign({
        timeMs: Math.round(tMs),
        peak: +peak.toFixed(3),
        nearestBeat: nb,
        diffMs,
        reason,
    }, extra || {});
    if (pt.debug.rejects.length < 20) pt.debug.rejects.push(row);
    if (reason === 'clickGuard') ptDebugCount('clickGuardRejected');
    else if (reason === 'cooldown') ptDebugCount('cooldownRejected');
    else if (reason === 'codeGate') ptDebugCount('codeGateRejected');
    else if (reason === 'outOfWindow') ptDebugCount('outOfWindow');
    else if (reason === 'outOfRange') ptDebugCount('outOfRange');
    else if (reason === 'keptExisting') ptDebugCount('keptExisting');
}

/* 実践テスト終了時の詳細ログ（PT_DEBUG=true のみ）。 */
function ptFinalizeDebug() {
    if (!PT_DEBUG || !pt.debug) return;
    const d = pt.debug;
    d.acceptedOnsets = pt.onsets.filter((o) => o.assigned).length;
    d.unassignedOnsets = pt.onsets.filter((o) => !o.assigned).length;
    d.missNotes = 0;
    const beatRows = [];
    for (let i = 0; i < PT_PLAY_BEATS; i++) {
        const n = pt.notes[i];
        const assigned = !!(n && n.cls && n.cls !== 'miss');
        if (!assigned) d.missNotes++;
        let nearest = null;
        for (let k = 0; k < pt.onsets.length; k++) {
            const o = pt.onsets[k];
            const nb = Math.round((o.t - pt.playT0Ms) / PT_BEAT_MS);
            const od = Math.abs(o.t - (pt.playT0Ms + i * PT_BEAT_MS));
            if (!nearest || od < nearest.od) nearest = { o, nb, od };
        }
        let rejectReason = '';
        if (!assigned && nearest) {
            const hit = pt.debug.rejects.find((r) => Math.abs(r.timeMs - nearest.o.t) < 20);
            if (hit) rejectReason = hit.reason;
            else if (!nearest.o.assigned) rejectReason = 'unassigned-onset';
        } else if (!assigned && (n.peak || 0) >= ptDetectionThreshold()) {
            rejectReason = 'waveform-without-onset';
        } else if (!assigned && (n.peak || 0) > 0) {
            rejectReason = 'weak-waveform';
        } else if (!assigned) {
            rejectReason = 'no-input';
        }
        beatRows.push({
            beatIndex: i + 1,
            noteResult: assigned ? (n.cls === 'just' ? 'GOOD' : n.cls.toUpperCase()) : 'MISS',
            assigned,
            diffMs: assigned ? Math.round(n.diff) : null,
            nearestInputTime: nearest ? Math.round(nearest.o.t) : null,
            nearestInputPeak: nearest ? nearest.o.peak : null,
            nearestInputLevel: n.peak ? +n.peak.toFixed(3) : 0,
            rejectReason: rejectReason || null,
        });
    }
    console.debug('[practice-test] summary', {
        totalPeaksOverThreshold: d.totalPeaksOverThreshold,
        acceptedOnsets: d.acceptedOnsets,
        assignedOnsets: d.assigned,
        unassignedOnsets: d.unassignedOnsets,
        clickGuardRejected: d.clickGuardRejected,
        cooldownRejected: d.cooldownRejected,
        codeGateRejected: d.codeGateRejected,
        outOfWindowRejected: d.outOfWindow,
        replacedCount: d.replaced,
        shiftedToNeighborCount: d.shifted,
        missNotes: d.missNotes,
    });
    console.debug('[practice-test] beats', beatRows);
    if (d.rejects.length) console.debug('[practice-test] rejects', d.rejects);
}

/* 実践テスト専用の拍割り当て（v0.9.77）。
   STAGE本体の registerHit は変更せず、実践テスト側だけを同じ考え方に寄せる。
   - 補正後入力時刻 tMs を、最寄り拍へ割り当てる
   - 既にその拍が埋まっていて既存入力の方が近い場合、隣の空き拍に逃がす
   - 同じ拍へより近い入力が来た場合は置き換える
   これにより「入力は見えているのにMISSが穴として残る」ケースを減らす。 */
function ptAssignOnset(tMs, peak) {
    const bi = PT_BEAT_MS;
    const diffTo = (b) => tMs - (pt.playT0Ms + b * bi);
    let i = Math.round((tMs - pt.playT0Ms) / bi);
    if (i < 0 || i > PT_PLAY_BEATS - 1) {
        ptLogReject(tMs, peak, 'outOfRange', { nearestBeat: i });
        return false;
    }
    const origBeat = i;
    let diff = diffTo(i);
    const current = pt.notes[i];

    // STAGE本体 registerHit と同じ考え方：近い入力で既に埋まっている拍へ重ねず、隣の空き拍へ寄せて穴を減らす。
    const occupiedCloser = current && current.cls != null && Math.abs(current.diff) <= Math.abs(diff);
    if (occupiedCloser) {
        const cand = i + (diff >= 0 ? 1 : -1);
        if (cand >= 0 && cand <= PT_PLAY_BEATS - 1 && pt.notes[cand].cls == null && Math.abs(diffTo(cand)) <= PT_NEAR_WIN) {
            i = cand;
            diff = diffTo(i);
            ptDebugCount('shifted');
        }
    }

    if (Math.abs(diff) > PT_NEAR_WIN) {
        ptLogReject(tMs, peak, 'outOfWindow', { nearestBeat: i, diffMs: Math.round(diff) });
        return false;
    }

    const note = pt.notes[i];
    const cls = ptClassify(diff);
    const prev = note.cls != null;
    if (!prev || Math.abs(diff) < Math.abs(note.diff)) {
        if (prev) ptDebugCount('replaced');
        note.diff = diff;
        note.cls = cls;
        note.peak = Math.max(note.peak || 0, peak);
        note.detected = true;
        if (origBeat !== i) note.reassigned = true;
        setPtStatus(LABELS[note.cls] || '');
        ptDebugCount('assigned');
        return true;
    }

    ptDebugCount('keptExisting');
    ptLogReject(tMs, peak, 'keptExisting', { nearestBeat: i, diffMs: Math.round(diff) });
    return false;
}

/* STAGE1風の流れる音符＋判定ライン＋音量波形を描く（テストレーン描画の流儀を流用）。
   t＝flowStartPerf からの経過ms。STAGE本体の drawLane には一切触れない。 */
function drawPracticeLane(t) {
    if (!ptLane || !ptLane.ctx) return;
    const { ctx, w, h } = ptLane;
    ctx.clearRect(0, 0, w, h);
    const yc = h * 0.56;
    const beatPx = Math.max(64, Math.min(120, w * 0.24)); // STAGE1 fitLane() と同じ基準
    const judgeX = w * 0.3;                               // STAGE1と同じ判定ライン位置
    const ppm = beatPx / PT_BEAT_MS;
    // v0.9.106：イヤホン音ズレ補正（headphoneOutputOffsetMs＝Bluetooth時はheadphoneOffsetBluetoothMs）を
    // 「表示タイミング」だけに反映する（drawBtLane と同じ考え方）。クリック音(scheduled)は動かさず、
    // 音符/拍/JUST光を、イヤホンで実際に聞こえる音に寄せる。これでBluetoothイヤホン時に音と音符の通過が合う。
    // 判定(micJudgeOffsetMs)・スコア・GOOD/EARLY/LATE/MISSには一切混ぜない（役割分離を維持）。
    // 通常マイク/有線は補正値が0msなのでズレない。
    const hpDispOff = mic.headphoneOutputOffsetMs || 0;
    // 中央ガイド
    ctx.strokeStyle = 'rgba(253,246,238,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke();
    // 音量波形（反応ライン基準でスケール）：判定ラインを超えているかが見えるように描く
    const ampPx = h * 0.34; // STAGE1の drawMicWaveform() と同じ比率
    const lineAmp = micDisplayFrac(ptDetectionThreshold()) * ampPx;
    ctx.strokeStyle = 'rgba(255,159,28,0.30)';
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, yc - lineAmp); ctx.lineTo(w, yc - lineAmp); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, yc + lineAmp); ctx.lineTo(w, yc + lineAmp); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,159,28,0.5)';
    ctx.font = '600 9px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('実判定ライン', 4, yc - lineAmp - 3);
    if (pt.wave.length) {
        // v0.9.112（案B＝STAGE本体PLAY中と同じ思想）：PLAY中のリアルタイム波形は「演奏中の視覚フィードバック」として
        //   音符と同じ heard-time（off＝micJudgeOffsetMs に加え hpDispOff＝headphoneOutputOffsetMs）へ寄せ、
        //   音符・波形が画面上で自然に揃うようにする。表示位置だけの調整で、判定・平均ズレ・見返しレーンには影響しない。
        const off = micJudgeOffsetMs();
        const pts = [];
        for (let i = 0; i < pt.wave.length; i++) {
            const p = pt.wave[i];
            const x = judgeX + (p.t + off + hpDispOff - t) * ppm;
            if (x < -24 || x > w + 24) continue;
            pts.push([x, micDisplayFrac(p.level) * ampPx]);
        }
        if (pts.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(pts[0][0], yc - pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], yc - pts[i][1]);
            for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], yc + pts[i][1]);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255,255,255,0.16)';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(pts[0][0], yc - pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], yc - pts[i][1]);
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
    // 音符（右→左へ流れる4分音符＋ストローク方向の矢印 ↑/↓）
    for (let i = 0; i < pt.notes.length; i++) {
        const n = pt.notes[i];
        const x = judgeX + (n.t + hpDispOff - t) * ppm;
        if (x < -24 || x > w + 24) continue;
        // v0.9.106：音符の中心に薄い縦線。中心線がJUST棒に重なる瞬間がジャストだと分かるようにする。
        ctx.save();
        ctx.strokeStyle = 'rgba(253,246,238,0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, h * 0.18); ctx.lineTo(x, h * 0.84); ctx.stroke();
        ctx.restore();
        const inWin = (n.cls == null) && Math.abs(t - n.t) <= PT_NEAR_WIN;
        let col;
        if (n.cls === 'just') col = COLORS.just;
        else if (n.cls === 'early') col = COLORS.early;
        else if (n.cls === 'late') col = COLORS.late;
        else if (n.closed) col = 'rgba(253,246,238,0.3)';
        else col = inWin ? 'rgba(255,209,102,0.98)' : NOTE_COLOR;
        ctx.save();
        if (inWin || (n.cls && n.cls !== 'miss')) {
            ctx.shadowColor = n.cls === 'just' ? 'rgba(46,204,113,0.9)' : (n.cls ? 'rgba(77,150,255,0.8)' : 'rgba(255,159,28,0.8)');
            ctx.shadowBlur = 11;
        }
        drawQuarterNote(ctx, x, yc, col);
        ctx.restore();
        // ストローク方向：↓→↑→↓…。位置は音符の下で統一、色はオレンジで統一し向きだけ変える。
        const arrowAlpha = n.closed ? 0.5 : 0.9;
        drawStrokeArrow(ctx, x, yc + 28, n.dir, 'rgba(255,180,90,0.9)', arrowAlpha);
    }
    // 判定ライン（縦・拍頭で軽く光る）。v0.9.106：表示補正分だけ光るタイミングもずらし、音符の通過と揃える。
    const glow = beatGlow(t - PT_LEAD_MS - hpDispOff, PT_BEAT_MS);
    ctx.save();
    ctx.shadowColor = 'rgba(255,159,28,0.95)'; ctx.shadowBlur = 10 + glow * 24;
    ctx.strokeStyle = 'rgba(255,159,28,' + (0.85 + glow * 0.15).toFixed(2) + ')';
    ctx.lineWidth = 3 + glow * 2;
    ctx.beginPath(); ctx.moveTo(judgeX, h * 0.1); ctx.lineTo(judgeX, h * 0.94); ctx.stroke();
    ctx.restore();
    drawBeatDot(ctx, judgeX, h * 0.9, glow);
    ctx.fillStyle = 'rgba(255,159,28,0.95)';
    ctx.font = '700 10px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JUST', judgeX, h * 0.99);
}

function ptLoop() {
    if (!pt.active) return;
    const t = performance.now() - pt.flowStartPerf;
    // 通過した音符を閉じる（判定窓を過ぎたら closed）
    for (let i = 0; i < pt.notes.length; i++) {
        const n = pt.notes[i];
        if (!n.closed && t > n.t + PT_NEAR_WIN) n.closed = true;
    }
    drawPracticeLane(t);
    pt.raf = requestAnimationFrame(ptLoop);
}

/* ── 実践テスト終了後の「見返し用レーン」（v0.9.74）─────────────────────
   横長の静的キャンバスに 1〜8拍を左から右へ並べ、横スクロールで見返せるようにする。
   STAGE本体の描画（drawLane）やリアルタイムの drawPracticeLane には一切触れない。
   表示だけの機能で、判定ロジック・補正・ゲートには影響しない。 */
const PT_REVIEW_PXPB = 132;   // 見返しレーンの1拍あたりの横幅(px)
const PT_REVIEW_LEAD = 1;     // 1拍目の前に見せる拍数
const PT_REVIEW_TAIL = 1;     // 8拍目の後に見せる拍数

function ptReviewTimeRange() {
    const from = pt.playT0Ms - PT_REVIEW_LEAD * PT_BEAT_MS;
    const to = pt.playT0Ms + (PT_PLAY_BEATS - 1) * PT_BEAT_MS + PT_REVIEW_TAIL * PT_BEAT_MS;
    return { from, to };
}

function fitPtReview(contentW, contentH) {
    const cv = els.ptReviewCanvas;
    if (!cv) { ptReviewLane = { ctx: null, w: 0, h: 0 }; return; }
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = contentW + 'px';
    cv.style.height = contentH + 'px';
    cv.width = Math.round(contentW * dpr);
    cv.height = Math.round(contentH * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ptReviewLane = { ctx, w: contentW, h: contentH };
}

function drawPracticeReview() {
    const H = PT_LANE_HEIGHT;
    const padL = 30, padR = 30;
    const { from, to } = ptReviewTimeRange();
    const ppm = PT_REVIEW_PXPB / PT_BEAT_MS;
    const contentW = Math.round(padL + padR + (to - from) * ppm);
    fitPtReview(contentW, H);
    const lane = ptReviewLane;
    if (!lane.ctx) return;
    const { ctx, w, h } = lane;
    const yc = h * 0.5;
    const xOf = (tt) => padL + (tt - from) * ppm;
    ctx.clearRect(0, 0, w, h);

    // 中央ガイド
    ctx.strokeStyle = 'rgba(253,246,238,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke();

    // 反応ライン（実判定ライン）：上下の破線
    const ampPx = h * 0.34;
    const lineAmp = micDisplayFrac(ptDetectionThreshold()) * ampPx;
    ctx.strokeStyle = 'rgba(255,159,28,0.30)';
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, yc - lineAmp); ctx.lineTo(w, yc - lineAmp); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, yc + lineAmp); ctx.lineTo(w, yc + lineAmp); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,159,28,0.55)';
    ctx.font = '600 9px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('実判定ライン', 4, yc - lineAmp - 3);

    // 波形（全区間）：マイク遅れ補正分を足して、判定された位置と重なるように描く（表示のみ）
    if (pt.fullWave.length >= 2) {
        const off = micJudgeOffsetMs();
        const pts = [];
        for (let i = 0; i < pt.fullWave.length; i++) {
            const p = pt.fullWave[i];
            pts.push([xOf(p.t + off), micDisplayFrac(p.level) * ampPx]);
        }
        ctx.beginPath();
        ctx.moveTo(pts[0][0], yc - pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], yc - pts[i][1]);
        for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], yc + pts[i][1]);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(pts[0][0], yc - pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], yc - pts[i][1]);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // 各拍：縦の拍ライン（理想位置）＋音符＋ストローク方向＋拍番号＋判定マーカー
    for (let i = 0; i < pt.notes.length; i++) {
        const n = pt.notes[i];
        const bx = xOf(n.t);
        // 拍ライン（理想タイミング）
        ctx.strokeStyle = 'rgba(255,159,28,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(bx, h * 0.12); ctx.lineTo(bx, h * 0.78); ctx.stroke();
        // 音符（拍の理想位置に置く）
        const isMiss = (!n.cls || n.cls === 'miss');
        let col;
        if (n.cls === 'just') col = COLORS.just;
        else if (n.cls === 'early') col = COLORS.early;
        else if (n.cls === 'late') col = COLORS.late;
        else col = 'rgba(253,246,238,0.35)';
        ctx.save();
        if (!isMiss) { ctx.shadowColor = n.cls === 'just' ? 'rgba(46,204,113,0.9)' : 'rgba(77,150,255,0.8)'; ctx.shadowBlur = 10; }
        drawQuarterNote(ctx, bx, yc, col);
        ctx.restore();
        // ストローク方向 ↓↑↓↑…
        drawStrokeArrow(ctx, bx, yc + 28, n.dir, 'rgba(255,180,90,0.9)', isMiss ? 0.5 : 0.95);
        // 拍番号
        ctx.fillStyle = 'rgba(253,246,238,0.55)';
        ctx.font = '700 11px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), bx, h - 6);
        // 判定マーカー：実際に判定された位置（拍 + ズレms）に印を打ち、拍とのズレを見せる
        if (!isMiss && n.diff != null) {
            const mx = xOf(n.t + n.diff);
            ctx.strokeStyle = col;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(bx, yc); ctx.lineTo(mx, yc); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = col;
            ctx.beginPath(); ctx.arc(mx, yc, 4, 0, Math.PI * 2); ctx.fill();
            const sign = n.diff > 0 ? '+' : (n.diff < 0 ? '−' : '±');
            ctx.font = '700 10px Outfit, sans-serif';
            ctx.fillText(sign + Math.abs(Math.round(n.diff)) + 'ms', mx, h * 0.1);
        }
        // 判定ラベル（GOOD/EARLY/LATE/MISS）
        const lab = isMiss ? 'MISS' : (n.cls === 'just' ? 'GOOD' : (n.cls === 'early' ? 'EARLY' : 'LATE'));
        ctx.fillStyle = isMiss ? 'rgba(180,180,180,0.85)' : col;
        ctx.font = '800 10px Outfit, sans-serif';
        ctx.fillText(lab, bx, h * 0.92);
        // MISS拍のヒント（v0.9.78）：波形はあるのに判定されなかったかを見分けやすくする
        if (isMiss) {
            const detThr = ptDetectionThreshold();
            let hint = '';
            if ((n.peak || 0) >= detThr) hint = '波形あり';
            else if ((n.peak || 0) > 0) hint = '反応弱';
            if (hint) {
                ctx.fillStyle = 'rgba(255,160,80,0.8)';
                ctx.font = '600 9px Outfit, sans-serif';
                ctx.fillText(hint, bx, yc + 46);
            }
        }
    }
}

/* 見返しレーンを表示する（終了直後に呼ぶ） */
function showPracticeReview() {
    if (!els.ptReview || !els.ptReviewCanvas) return;
    if (els.ptLaneWrap) els.ptLaneWrap.classList.add('hidden'); // 終了後はリアルタイムレーンを隠す
    els.ptReview.classList.remove('hidden');
    drawPracticeReview();
    if (els.ptReviewScroll) els.ptReviewScroll.scrollLeft = 0; // まず1拍目から見えるように先頭へ
}

/* 見返しレーンを隠して消す */
function hidePracticeReview() {
    if (els.ptReview) els.ptReview.classList.add('hidden');
    if (ptReviewLane && ptReviewLane.ctx) ptReviewLane.ctx.clearRect(0, 0, ptReviewLane.w, ptReviewLane.h);
}

/* 実践テスト画面を初期状態へ戻す（v0.9.73）。
   STAGE本体の描画・判定には触れず、実践テスト専用の状態・描画・結果だけをリセットする。
   ・開始前は常に初期画面／前回の音符・波形・結果を引きずらない、を保証するために使う。 */
function resetPracticeView() {
    pt.notes = [];
    pt.onsets = [];
    pt.wave = [];
    pt.fullWave = [];
    pt.clickPerfTimes = [];
    pt.lastOnsetAt = 0;
    pt.lastDetectAt = -100000;
    pt.maxPeak = 0;
    pt.doubleCount = 0;
    pt.armed = true;
    pt.valley = 1;
    pt.debug = null;
    if (ptLane && ptLane.ctx) ptLane.ctx.clearRect(0, 0, ptLane.w, ptLane.h);
    if (els.ptLaneWrap) els.ptLaneWrap.classList.add('hidden');
    hidePracticeReview();
    if (els.ptResult) { els.ptResult.classList.add('hidden'); els.ptResult.innerHTML = ''; }
    if (els.ptBtn) els.ptBtn.textContent = ptIdleBtnLabel();
    setPtStatus('');
}

async function startPracticeTest() {
    // 排他：他テスト（イヤホン音ズレ補正／マイク反応テスト／マイク遅れ補正）が動いていたら止める
    if (hpCal.active) stopHeadphoneCal();
    if (test.flow) abortMicTest();
    stopBtCal();
    if (!(await ensureTestMic())) { setPtStatus('マイクを許可してください。'); return; }
    ensureAudio();
    try { if (state.audioCtx && state.audioCtx.state === 'suspended') await state.audioCtx.resume(); } catch (_) { /* ignore */ }
    const ctx = state.audioCtx;
    if (!ctx) { setPtStatus('音声を初期化できませんでした。'); return; }
    // 前回の音符・波形・結果・内部状態を必ず初期化してから開始する（v0.9.73）
    resetPracticeView();
    pt.active = true;
    pt.capturing = false;
    pt.onsets = [];
    pt.wave = [];
    pt.fullWave = [];
    pt.clickPerfTimes = [];
    pt.lastOnsetAt = 0;
    pt.lastDetectAt = -100000;
    pt.maxPeak = 0;
    pt.doubleCount = 0;
    pt.armed = true;
    pt.valley = 1; // コードストローク用の谷をリセット
    pt.debug = freshPtDebug();
    // 立ち上がり検出の基準を毎回そろえる（前回テストの prevPeak 残りで1回目だけ挙動が変わるのを防ぐ・v0.9.68）
    mic.prevPeak = 0;
    mic.env = 0;
    pt.timers.forEach(clearTimeout); pt.timers = [];
    pt.scheduled = [];
    if (els.ptResult) els.ptResult.classList.add('hidden');
    ptHasRun = true; // 以降の待機中ボタンは「もう1度テストする」に
    if (els.ptBtn) els.ptBtn.textContent = '最終確認テストを停止';
    if (els.ptLaneWrap) els.ptLaneWrap.classList.remove('hidden');
    fitPtLane();
    // テスト開始時、カード上部（タイトル/「今やること」/説明/レーン）が隠れないようカード先頭へ（v0.9.92）
    scrollToSettingsEl(els.ptCard);

    pt.audioStart = ctx.currentTime;
    pt.flowStartPerf = performance.now();
    pt.playT0Ms = PT_LEAD_MS + PT_COUNTIN * PT_BEAT_MS; // audioStart/flowStart からの相対ms
    // 本番8音符（4分）。ストローク方向は ↑↓↑↓↑↓↑↓（1回目=アップ）。t＝flowStart からの相対ms。
    pt.notes = [];
    for (let j = 0; j < PT_PLAY_BEATS; j++) {
        pt.notes.push({ t: pt.playT0Ms + j * PT_BEAT_MS, dir: (j % 2 === 0) ? 'down' : 'up', closed: false, cls: null, diff: null, peak: 0, detected: false, doubled: false });
    }

    const beatSec = PT_BEAT_MS / 1000;
    const startSec = pt.audioStart + PT_LEAD_MS / 1000;
    // クリック：カウントイン4拍＋本番8拍（1拍目＝小節頭をアクセント）
    for (let i = 0; i < PT_COUNTIN; i++) ptScheduleClick(startSec + i * beatSec, i === 0);
    const playStartSec = startSec + PT_COUNTIN * beatSec;
    for (let j = 0; j < PT_PLAY_BEATS; j++) ptScheduleClick(playStartSec + j * beatSec, j % 4 === 0);

    setPtStatus('カウントイン…');
    for (let j = 0; j < PT_PLAY_BEATS; j++) {
        ptTimer(() => setPtStatus('ストローク中　' + (j + 1) + ' / ' + PT_PLAY_BEATS), pt.playT0Ms + j * PT_BEAT_MS);
    }
    // 取り込み窓：最初の本番拍の半拍前〜最終拍の半拍後
    const capStartMs = pt.playT0Ms - PT_CAP_WIN_MS;
    const capEndMs = pt.playT0Ms + (PT_PLAY_BEATS - 1) * PT_BEAT_MS + PT_CAP_WIN_MS;
    ptTimer(() => { pt.capturing = true; }, capStartMs);
    ptTimer(() => { pt.capturing = false; finishPracticeTest(); }, capEndMs + 250);

    pt.raf = requestAnimationFrame(ptLoop);
}

function finishPracticeTest() {
    let good = 0, early = 0, late = 0, miss = 0, sum = 0, validN = 0;
    for (let i = 0; i < PT_PLAY_BEATS; i++) {
        const n = pt.notes[i];
        if (!n.cls || n.cls === 'miss') { miss++; continue; }
        if (n.cls === 'just') good++;
        else if (n.cls === 'early') early++;
        else if (n.cls === 'late') late++;
        sum += n.diff; validN++;
    }
    const valid = good + early + late;
    const avg = validN ? Math.round(sum / validN) : 0;
    const r = { good, early, late, miss, valid, avg, maxPeak: pt.maxPeak, doubleCount: pt.doubleCount, threshold: mic.threshold, detectThreshold: ptDetectionThreshold(), cooldownMs: mic.cooldownMs };
    ptFinalizeDebug();
    renderPracticeResult(r);
    setPtStatus('完了');
    endPracticeTest(true);
    showPracticeReview(); // 終了後は横スクロールで見返せる静的レーンを表示（v0.9.74）
    // v0.9.63：実践テスト後は結果画面を主役にする。
    // ・practiceDone=true で手動設定/プリセット保存も到達可能にする
    // ・wizardEditing='practice' で結果カードを表示したまま留める（次の行動は結果画面のボタンで選ぶ）
    setupProgress.practiceDone = true;
    wizardEditing = 'practice';
    if (settingsView === 'steps') {
        renderSettingsView();
        scrollToSettingsEl(els.ptResult || els.ptCard);
    }
}

/* 音量も含めた総合判定（v0.9.56）。補正提案はせず、案内のみ。
   line＝実践テストの実判定ライン。volRatio＝検出最大音量 ÷ 実判定ライン。 */
function practiceComment(r) {
    const line = r.detectThreshold || r.threshold || mic.threshold || 0.0001;
    const volRatio = r.maxPeak / line;
    const lowVol = volRatio < 0.9;        // 波形はあっても判定ラインに届いていない
    // 判定A：入力が拾えていない（有効入力が少ない/MISS多い かつ 音量が反応ラインに届いていない）
    if ((r.valid < 5 || r.miss >= 4) && lowVol) {
        return { kind: 'warn', issue: 'input', text: '入力が十分に拾えていません。入力タイプ・ストローク検出モード・マイク反応テストの設定が合っているか確認してから、もう一度最終確認テストを行ってください。' };
    }
    // 判定B：音量は拾えているがMISSが多い（反応ライン付近まで来ているのに判定に入りきっていない）
    if (r.valid < 6 || r.miss >= 3) {
        return { kind: 'warn', issue: 'miss', text: 'MISSが多めです。反応ラインが少し高いか、ストローク検出モードが合っていないかもしれません。マイク反応テストで反応ラインを見直してから、もう一度最終確認テストを行ってください。' };
    }
    // 判定C：タイミングが大きく偏っている（有効入力6以上・平均±40ms以上 or 片寄り70%以上）
    const lateRatio = r.valid ? r.late / r.valid : 0;
    const earlyRatio = r.valid ? r.early / r.valid : 0;
    const biased = Math.abs(r.avg) >= 40 || lateRatio >= 0.7 || earlyRatio >= 0.7;
    const isBT = isBluetoothHeadphone();
    if (biased && (r.avg >= 40 || (lateRatio >= 0.7 && lateRatio >= earlyRatio))) {
        // Bluetoothイヤホン時はマイク遅れ補正へ誘導（v0.9.80）
        if (isBT) return { kind: 'warn', issue: 'btdelay', text: 'Bluetoothイヤホンではマイク判定がずれている可能性があります（LATE＝遅め）。「マイク遅れ補正」で補正してから、もう一度最終確認テストを行ってください。' };
        return { kind: 'warn', issue: 'timing', text: '判定がLATE（遅め）に片寄っています。マイクの遅れ補正やイヤホン音ズレ補正が合っているか確認してから、もう一度最終確認テストを行ってください。' };
    }
    if (biased && (r.avg <= -40 || (earlyRatio >= 0.7 && earlyRatio > lateRatio))) {
        if (isBT) return { kind: 'warn', issue: 'btdelay', text: 'Bluetoothイヤホンではマイク判定がずれている可能性があります（EARLY＝早め）。「マイク遅れ補正」で補正してから、もう一度最終確認テストを行ってください。' };
        return { kind: 'warn', issue: 'timing', text: '判定がEARLY（早め）に片寄っています。マイクの遅れ補正やイヤホン音ズレ補正が合っているか確認してから、もう一度最終確認テストを行ってください。' };
    }
    // 二重反応が出ているときは「問題なし」にせず、軽く注意
    if (r.doubleCount > 0) {
        return { kind: 'warn', issue: 'double', text: '二重反応が出ています。手動設定の二重反応防止やストローク検出モードを確認してから、もう一度最終確認テストを行ってください。' };
    }
    // 判定D：問題なさそう
    return { kind: 'ok', issue: null, text: 'この設定で練習を始められます。必要に応じて、あとから手動設定で微調整できます。' };
}

function renderPracticeResult(r) {
    if (!els.ptResult) return;
    const c = practiceComment(r);
    practiceResultOk = (c.kind === 'ok'); // 完了ボタンの有効判定に使う
    const sign = r.avg > 0 ? '+' : (r.avg < 0 ? '−' : '±');
    const avgTxt = sign + Math.abs(r.avg) + 'ms';

    // 目立つ結果バナー（問題あり/なし）
    const okBanner = '<div style="text-align:center;padding:16px 14px;margin-bottom:14px;border-radius:12px;'
        + 'border:1px solid rgba(120,220,150,0.5);background:rgba(120,220,150,0.12);">'
        + '<div style="font-size:1.25rem;font-weight:800;">✅ 良い状態で判定できています</div>'
        + '<div style="font-size:0.9rem;opacity:0.85;margin-top:6px;line-height:1.6;">' + escapeHtml(c.text) + '</div></div>';
    const warnBanner = '<div style="text-align:center;padding:14px 12px;margin-bottom:12px;border-radius:12px;'
        + 'border:1px solid rgba(255,170,70,0.55);background:rgba(255,170,70,0.12);">'
        + '<div style="font-size:1.25rem;font-weight:800;">⚠️ 調整が必要です</div>'
        + '<div style="font-size:0.9rem;opacity:0.9;margin-top:4px;">' + escapeHtml(c.text) + '</div></div>';

    // 表に出す主要情報（GOOD/EARLY/LATE/MISS と平均ズレ）
    const mainRows =
        '<div class="cal-result-row"><span>GOOD</span><b>' + r.good + '</b></div>' +
        '<div class="cal-result-row"><span>EARLY</span><b>' + r.early + '</b></div>' +
        '<div class="cal-result-row"><span>LATE</span><b>' + r.late + '</b></div>' +
        '<div class="cal-result-row"><span>MISS</span><b>' + r.miss + '</b></div>' +
        '<div class="cal-result-row"><span>平均ズレ</span><b>' + avgTxt + '</b></div>';
    // 次の行動ボタン
    const primary = 'width:100%;padding:14px;margin-top:12px;border-radius:10px;border:none;'
        + 'background:linear-gradient(180deg,#ff9f1c,#ff8c00);color:#1a130a;font-weight:800;font-size:1rem;cursor:pointer;';
    const sub = 'width:100%;padding:12px;margin-top:8px;border-radius:10px;border:1px solid rgba(255,255,255,0.28);'
        + 'background:rgba(255,255,255,0.05);color:inherit;font-weight:700;cursor:pointer;';
    const subQuiet = 'width:100%;padding:10px;margin-top:8px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);'
        + 'background:transparent;color:inherit;font-size:0.85rem;opacity:0.85;cursor:pointer;';
    let actions = '';
    if (c.kind === 'ok') {
        // 「この設定を保存」は共通の保存モーダルを開く（v0.9.80）。
        actions =
            '<button type="button" id="pt-result-done" style="' + primary + '">完了する</button>' +
            '<button type="button" id="pt-result-save" style="' + subQuiet + '">この設定を保存</button>';
    } else {
        let fixLabel = '最終確認テストをやり直す', fixId = 'pt-result-fix-rerun';
        if (c.issue === 'input') { fixLabel = 'マイク反応テストをやり直す'; fixId = 'pt-result-fix-test'; }
        else if (c.issue === 'miss') { fixLabel = '反応ラインを確認する'; fixId = 'pt-result-fix-test'; }
        else if (c.issue === 'timing') { fixLabel = '補正を確認する'; fixId = 'pt-result-fix-correction'; }
        else if (c.issue === 'btdelay') { fixLabel = 'マイク遅れ補正を行う'; fixId = 'pt-result-fix-btdelay'; }
        else if (c.issue === 'double') { fixLabel = '二重反応防止を調整する'; fixId = 'pt-result-fix-manual'; }
        actions =
            '<button type="button" id="' + fixId + '" style="' + primary + '">' + fixLabel + '</button>' +
            '<button type="button" id="pt-result-rerun" style="' + sub + '">もう1度テストする</button>';
    }

    // 「詳しい数値・手動設定を見る」：押すと手動設定ページへ移動する（v0.9.89）。
    // 主導線（この設定を使う／完了）ほどは目立たせない、少し目立つサブ導線。
    const manualBtn = '<button type="button" id="pt-result-manual" style="' + sub + '">詳しい数値・手動設定を見る</button>';

    els.ptResult.innerHTML =
        (c.kind === 'ok' ? okBanner : warnBanner) + mainRows +
        '<div style="margin-top:6px;">' + actions + '</div>' +
        '<div style="margin-top:6px;">' + manualBtn + '</div>';
    els.ptResult.classList.remove('hidden');
    bindPracticeResultActions();
}

/* 実践テスト結果カード内ボタンの結線（innerHTML差し替え後に呼ぶ） */
function bindPracticeResultActions() {
    const done = document.getElementById('pt-result-done');
    if (done) done.addEventListener('click', () => {
        if (isDoneLocked()) { showDoneHint(); return; }
        closeSettings();
    });
    // 「この設定を保存」：共通の保存モーダルを開く（v0.9.80）。
    const save = document.getElementById('pt-result-save');
    if (save) save.addEventListener('click', () => openPresetModal());
    // 「詳しい数値・手動設定を見る」：手動設定ページへ移動（v0.9.89）。
    const manual = document.getElementById('pt-result-manual');
    if (manual) manual.addEventListener('click', () => {
        if (els.manualDetail && !els.manualDetail.open) els.manualDetail.open = true;
        openManualView(els.manualCard);
    });
    const rerun = document.getElementById('pt-result-rerun');
    if (rerun) rerun.addEventListener('click', () => startPracticeTest());
    const fixRerun = document.getElementById('pt-result-fix-rerun');
    if (fixRerun) fixRerun.addEventListener('click', () => startPracticeTest());
    // 原因別の戻り先（v0.9.67）：移動前に必ず古い最終確認テスト結果を消す
    const fixTest = document.getElementById('pt-result-fix-test');
    if (fixTest) fixTest.addEventListener('click', () => practiceFixGoTo('test'));
    const fixCorrection = document.getElementById('pt-result-fix-correction');
    if (fixCorrection) fixCorrection.addEventListener('click', () => practiceFixGoTo('correction'));
    const fixBtDelay = document.getElementById('pt-result-fix-btdelay');
    if (fixBtDelay) fixBtDelay.addEventListener('click', () => practiceFixGoTo('btdelay'));
    const fixManual = document.getElementById('pt-result-fix-manual');
    if (fixManual) fixManual.addEventListener('click', () => practiceFixGoTo('double'));
}

/* 最終確認テスト「調整が必要」からの原因別の戻り先（v0.9.67）。
   どのルートでも古い結果は消し、戻り先のステップを開く。 */
function practiceFixGoTo(route) {
    invalidatePracticeResult(); // 古い結果を消し、完了ボタンも無効へ
    if (route === 'test') {
        // 反応ラインからやり直す：補正系以降は未完了に戻す
        setupProgress.recoApplied = false;
        setupProgress.correctionDone = false;
        wizardEditing = 'test';
        if (settingsView !== 'steps') settingsView = 'steps';
        renderSettingsView();
        scrollToSettingsEl(els.testCard);
    } else if (route === 'correction') {
        // 有線イヤホンは補正ステップが無い（v0.9.89）→ 手動設定で調整してもらう
        if (isHeadphoneInput() && !isBluetoothHeadphone()) {
            setupProgress.manualForced = true;
            wizardEditing = null;
            if (els.manualDetail && !els.manualDetail.open) els.manualDetail.open = true;
            openManualView(els.manualCard);
            return;
        }
        // 補正を見直す：補正系を未完了に戻して開く
        setupProgress.correctionDone = false;
        wizardEditing = 'correction';
        if (settingsView !== 'steps') settingsView = 'steps';
        renderSettingsView();
        scrollToSettingsEl(wizardStepCards('correction')[0]);
    } else if (route === 'btdelay') {
        // Bluetooth用マイク遅れ補正へ：そのステップを開く（v0.9.80）
        setupProgress.btDelayDone = false;
        wizardEditing = 'btdelay';
        if (settingsView !== 'steps') settingsView = 'steps';
        renderSettingsView();
        scrollToSettingsEl(els.btCalCard);
    } else {
        // 二重反応防止：手動設定を開き、二重反応防止付近へスクロール
        setupProgress.manualForced = true;
        wizardEditing = null;
        if (els.manualDetail && !els.manualDetail.open) els.manualDetail.open = true;
        openManualView(els.setCooldownRow || els.manualCard);
    }
}

/* 後始末。showResult=true のときは結果表示と「完了」状態を残す（finishから呼ぶ） */
function endPracticeTest(showResult) {
    pt.active = false;
    pt.capturing = false;
    cancelAnimationFrame(pt.raf); pt.raf = 0;
    pt.timers.forEach(clearTimeout); pt.timers = [];
    pt.scheduled.forEach((o) => { try { o.stop(); } catch (_) { /* already stopped */ } });
    pt.scheduled = [];
    if (els.ptBtn) els.ptBtn.textContent = ptIdleBtnLabel();
    if (showResult) {
        // 結果表示時は、最終拍を判定ライン上に止めた状態で、判定色のついた音符を残す
        drawPracticeLane(pt.notes.length ? pt.notes[pt.notes.length - 1].t : 0);
    } else {
        if (els.ptLaneWrap) els.ptLaneWrap.classList.add('hidden');
        setPtStatus('');
    }
}

/* 外部からの停止（設定を閉じる／入力タイプ切替／STAGE開始／他テスト開始時など） */
function stopPracticeTest() {
    if (!pt.active && !pt.timers.length) return;
    endPracticeTest(false);
    hidePracticeReview();
    if (els.ptResult) els.ptResult.classList.add('hidden');
}

function togglePracticeTest() {
    if (pt.active) stopPracticeTest(); else startPracticeTest();
}

/* ══════════════════════════════════════════════════════════
   マイク遅れ補正（Bluetoothイヤホン用・v0.9.80）
   クリックに合わせた手拍子/ストロークの「判定タイミングの偏り」を測り、
   bluetoothMicOffsetMs を提案する。検出は最終確認テストと同じテンポ・同じクリックガードを使い、
   各拍に最も近いオンセット時刻を集めて平均ズレを出すだけ（拍割り当て等の複雑なロジックは持たない）。
   STAGE本体・最終確認テストの判定ロジックには手を加えない。
══════════════════════════════════════════════════════════ */
function btTimer(fn, ms) { const id = setTimeout(fn, ms); bt.timers.push(id); return id; }
function setBtCalStatus(t) { if (els.btCalStatus) els.btCalStatus.textContent = t || ''; }

/* ── マイク遅れ補正の流れるレーン（v0.9.81・表示専用）──────────────
   最終確認テスト（drawPracticeLane）と同じ考え方で、👏を右→左へ流し、波形・反応ライン・
   判定ラインを描く。判定ロジック・測定ロジックには一切影響しない（見た目だけ）。 */
function fitBtLane() {
    if (!els.btCalLaneCanvas) return;
    els.btCalLaneCanvas.style.width = '100%';
    els.btCalLaneCanvas.style.height = PT_LANE_HEIGHT + 'px';
    btLane = fitOne(els.btCalLaneCanvas);
}

/* 手拍子アイコン（👏）を控えめに描く（v0.9.82）。
   このテストは「画面ではなくクリック音に合わせて手拍子する」ため、
   👏は回数の目安に留め、光らせたり判定色で点灯させたりしない（タイミングを視覚誘導しない）。 */
function drawClapIcon(ctx, x, yc, num) {
    ctx.save();
    // 通常表示にする（グレーアウトさせない・v0.9.84）：
    //  ・globalAlphaは1（薄くしない）
    //  ・モノクロ絵文字でフォールバックされた端末でも暗くならないよう、塗り色を明るいテキスト色に
    //  ・影/合成は使わない（派手な点灯・グローは出さない）
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fdf6ee';
    ctx.font = '20px "Outfit", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👏', x, yc);
    ctx.restore();
    // 拍番号（👏の下・見える程度）
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(253,246,238,0.85)';
    ctx.font = '600 11px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(num), x, yc + 30);
    ctx.restore();
}

function drawBtLane(t) {
    if (!btLane || !btLane.ctx) return;
    const { ctx, w, h } = btLane;
    ctx.clearRect(0, 0, w, h);
    const yc = h * 0.56;
    const beatPx = Math.max(64, Math.min(120, w * 0.24));
    const judgeX = w * 0.3;
    const ppm = beatPx / PT_BEAT_MS;
    // 中央ガイド
    ctx.strokeStyle = 'rgba(253,246,238,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke();
    // 反応ライン（最終確認テストと同じ検出しきい値）
    const ampPx = h * 0.34;
    const lineAmp = micDisplayFrac(ptDetectionThreshold()) * ampPx;
    ctx.strokeStyle = 'rgba(255,159,28,0.30)';
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, yc - lineAmp); ctx.lineTo(w, yc - lineAmp); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, yc + lineAmp); ctx.lineTo(w, yc + lineAmp); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,159,28,0.5)';
    ctx.font = '600 9px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('反応ライン', 4, yc - lineAmp - 3);
    // イヤホン音ズレ補正（headphoneOutputOffsetMs）。👏と波形を「聞こえる音」に寄せる表示用オフセット。
    const hpDispOff = mic.headphoneOutputOffsetMs || 0;
    // 入力波形（右→左へ流れる）。off は micJudgeOffsetMs()＝Bluetooth時は timingOffsetMs＋bluetoothMicOffsetMs。
    // v0.9.112（案B＝STAGE本体PLAY中と同じ思想）：PLAY中のリアルタイム波形は「演奏中の視覚フィードバック」として
    //   👏（heard-time）と同じく hpDispOff も足して画面上で自然に揃える（表示位置のみ・測定/判定ロジックは不変）。
    if (bt.wave.length) {
        const off = micJudgeOffsetMs();
        const pts = [];
        for (let i = 0; i < bt.wave.length; i++) {
            const p = bt.wave[i];
            const x = judgeX + (p.t + off + hpDispOff - t) * ppm;
            if (x < -24 || x > w + 24) continue;
            pts.push([x, micDisplayFrac(p.level) * ampPx]);
        }
        if (pts.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(pts[0][0], yc - pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], yc - pts[i][1]);
            for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], yc + pts[i][1]);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255,255,255,0.16)';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(pts[0][0], yc - pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], yc - pts[i][1]);
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }
    // 👏（右→左へ流れる）＋拍番号。控えめ表示で、タイミングは音で合わせてもらう。
    // v0.9.91：イヤホン音ズレ補正（hpDispOff＝上で宣言）を「表示タイミング」にだけ反映する。
    // クリック音(scheduled)は動かさず、👏をイヤホンで聞こえる音に寄せて手拍子しやすくする。判定(micJudgeOffsetMs)とは混ぜない。
    for (let i = 0; i < bt.notes.length; i++) {
        const n = bt.notes[i];
        const x = judgeX + (n.t + hpDispOff - t) * ppm;
        if (x < -28 || x > w + 28) continue;
        drawClapIcon(ctx, x, yc, n.num);
    }
    // 判定ライン（縦・静的。拍頭で強く光る演出はしない＝視覚でタイミング誘導しない・v0.9.82）
    ctx.save();
    ctx.strokeStyle = 'rgba(255,159,28,0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(judgeX, h * 0.1); ctx.lineTo(judgeX, h * 0.94); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,159,28,0.6)';
    ctx.font = '700 10px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JUST', judgeX, h * 0.99);
}

function btLoop() {
    if (!bt.active) return;
    const t = performance.now() - bt.flowStartPerf;
    for (let i = 0; i < bt.notes.length; i++) {
        const n = bt.notes[i];
        if (!n.closed && t > n.t + PT_NEAR_WIN) n.closed = true;
    }
    drawBtLane(t);
    bt.raf = requestAnimationFrame(btLoop);
}

function btScheduleClick(atSec, accent) {
    const ctx = state.audioCtx;
    if (!ctx) return;
    const vol = Math.max(0, Math.min(1, state.clickVolume / 100));
    const t0 = Math.max(atSec, ctx.currentTime);
    const peak = (accent ? 0.55 : 0.45) * vol;
    // クリックの「鳴る時刻」は音量に関係なくガード基準として記録する。
    bt.clickPerfTimes.push(bt.flowStartPerf + (t0 - bt.audioStart) * 1000);
    if (peak < 0.001) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1500 : 1200;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.09);
    bt.scheduled.push(osc);
}
function btLatestClickPerf(now) {
    let last = -100000;
    for (let i = 0; i < bt.clickPerfTimes.length; i++) {
        const c = bt.clickPerfTimes[i];
        if (c <= now + 10 && c > last) last = c;
    }
    return last;
}

/* 待機中のカード表示（ボタン文言・ステータス）。 */
function renderBtCalIdle() {
    if (els.btCalBtn) els.btCalBtn.textContent = bt.hasRun ? 'もう1度テストする' : 'マイク遅れ補正テストを開始';
    if (els.btCalLive) els.btCalLive.classList.add('hidden');
    if (els.btCalLaneWrap) els.btCalLaneWrap.classList.add('hidden');
    if (els.btCalPhase) els.btCalPhase.textContent = '';
    if (els.btCalBadge) {
        const done = !!setupProgress.btDelayDone;
        els.btCalBadge.textContent = done ? '実施済み' : '未実施';
        els.btCalBadge.classList.toggle('done', done);
    }
}

async function startBtCal() {
    // 排他：他テストを止める
    if (hpCal.active) stopHeadphoneCal();
    if (cal.active) cancelCalibration();
    if (test.flow) abortMicTest();
    stopPracticeTest();
    if (!(await ensureTestMic())) { setBtCalStatus('マイクを許可してください。'); return; }
    ensureAudio();
    try { if (state.audioCtx && state.audioCtx.state === 'suspended') await state.audioCtx.resume(); } catch (_) { /* ignore */ }
    const ctx = state.audioCtx;
    if (!ctx) { setBtCalStatus('音声を初期化できませんでした。'); return; }

    bt.active = true;
    bt.capturing = false;
    bt.onsets = [];
    bt.clickPerfTimes = [];
    bt.armed = true;
    bt.lastOnsetAt = 0;
    bt.lastDetectAt = -100000;
    bt.maxPeak = 0;
    bt.result = null;
    mic.prevPeak = 0;
    mic.env = 0;
    bt.timers.forEach(clearTimeout); bt.timers = [];
    bt.scheduled = [];
    bt.hasRun = true;
    bt.wave = [];
    if (els.btCalResult) { els.btCalResult.classList.add('hidden'); els.btCalResult.innerHTML = ''; }
    if (els.btCalLive) els.btCalLive.classList.remove('hidden');
    if (els.btCalBtn) els.btCalBtn.textContent = 'マイク遅れ補正テストを停止';

    bt.audioStart = ctx.currentTime;
    bt.flowStartPerf = performance.now();
    bt.playT0Ms = PT_LEAD_MS + PT_COUNTIN * PT_BEAT_MS;

    // 流れる👏（表示専用・8拍）。判定/測定は別系統（bt.onsets）で行う。
    bt.notes = [];
    for (let j = 0; j < BT_PLAY_BEATS; j++) {
        bt.notes.push({ t: bt.playT0Ms + j * PT_BEAT_MS, num: j + 1, cls: null, closed: false, peak: 0 });
    }
    if (els.btCalLaneWrap) els.btCalLaneWrap.classList.remove('hidden');
    fitBtLane();
    cancelAnimationFrame(bt.raf);
    bt.raf = requestAnimationFrame(btLoop);
    // カード上部（タイトル/「今やること」/説明）が固定ナビに隠れないよう、カード先頭へスクロール（v0.9.92）
    scrollToSettingsEl(els.btCalCard);

    const beatSec = PT_BEAT_MS / 1000;
    const startSec = bt.audioStart + PT_LEAD_MS / 1000;
    for (let i = 0; i < PT_COUNTIN; i++) btScheduleClick(startSec + i * beatSec, i === 0);
    const playStartSec = startSec + PT_COUNTIN * beatSec;
    for (let j = 0; j < BT_PLAY_BEATS; j++) btScheduleClick(playStartSec + j * beatSec, j % 4 === 0);

    setBtCalStatus('カウントイン…');
    for (let j = 0; j < BT_PLAY_BEATS; j++) {
        btTimer(() => setBtCalStatus('クリックに合わせて入力　' + (j + 1) + ' / ' + BT_PLAY_BEATS), bt.playT0Ms + j * PT_BEAT_MS);
    }
    const capStartMs = bt.playT0Ms - PT_CAP_WIN_MS;
    const capEndMs = bt.playT0Ms + (BT_PLAY_BEATS - 1) * PT_BEAT_MS + PT_CAP_WIN_MS;
    btTimer(() => { bt.capturing = true; }, capStartMs);
    btTimer(() => { bt.capturing = false; finishBtCal(); }, capEndMs + 250);
}

/* 進行中のテストを止める（カードを離れる/排他時）。結果カードは触らない。 */
function stopBtCal() {
    if (!bt.active && !bt.timers.length) return;
    bt.active = false;
    bt.capturing = false;
    cancelAnimationFrame(bt.raf); bt.raf = 0;
    bt.timers.forEach(clearTimeout); bt.timers = [];
    bt.scheduled.forEach((o) => { try { o.stop(); } catch (_) { /* already stopped */ } });
    bt.scheduled = [];
    if (els.btCalLive) els.btCalLive.classList.add('hidden');
    if (els.btCalLaneWrap) els.btCalLaneWrap.classList.add('hidden');
    if (els.btCalBtn) els.btCalBtn.textContent = bt.hasRun ? 'もう1度テストする' : 'マイク遅れ補正テストを開始';
    setBtCalStatus('');
}

function toggleBtCal() {
    if (bt.active) { stopBtCal(); } else { startBtCal(); }
}

/* 8拍それぞれに最も近いオンセットを割り当て、平均ズレ・分類を集計する。 */
function finishBtCal() {
    bt.active = false;
    bt.capturing = false;
    cancelAnimationFrame(bt.raf); bt.raf = 0;
    if (els.btCalLive) els.btCalLive.classList.add('hidden');
    // v0.9.100：結果後もレーン（👏）は閉じず、各拍のズレを見られるようにする。
    if (els.btCalBtn) els.btCalBtn.textContent = bt.hasRun ? 'もう1度テストする' : 'マイク遅れ補正テストを開始';

    let just = 0, early = 0, late = 0, miss = 0, sum = 0, validN = 0;
    const used = new Array(bt.onsets.length).fill(false);
    const perBeat = []; // v0.9.100：拍ごとのズレ（レーン凍結表示＆リスト用）
    for (let i = 0; i < BT_PLAY_BEATS; i++) {
        const beatT = bt.playT0Ms + i * PT_BEAT_MS;
        let bestIdx = -1, bestAbs = Infinity, bestDiff = 0;
        for (let k = 0; k < bt.onsets.length; k++) {
            if (used[k]) continue;
            const d = bt.onsets[k].t - beatT; // 正＝遅い(LATE) / 負＝早い(EARLY)
            const a = Math.abs(d);
            if (a < bestAbs) { bestAbs = a; bestIdx = k; bestDiff = d; }
        }
        if (bestIdx >= 0 && bestAbs <= PT_NEAR_WIN) {
            used[bestIdx] = true;
            sum += bestDiff; validN++;
            const cls = Math.abs(bestDiff) <= JUST_MS ? 'just' : (bestDiff < 0 ? 'early' : 'late');
            if (cls === 'just') just++; else if (cls === 'early') early++; else late++;
            perBeat.push({ beat: i + 1, diff: Math.round(bestDiff), matched: true, cls });
        } else {
            miss++;
            perBeat.push({ beat: i + 1, diff: null, matched: false, cls: 'miss' });
        }
    }
    const valid = just + early + late;
    const avg = validN ? Math.round(sum / validN) : 0;
    // 補正提案条件（v0.9.104→v0.9.105）：有効入力6以上・|平均ズレ|>=35ms。
    // ・v0.9.104：「方向が60%以上偏っている(biased)」条件を撤廃。
    // ・v0.9.105：「proposed !== cur」条件も撤廃。現在補正が下限(-200ms)に張り付いている状態だと
    //   proposed が下限でクランプされて cur と同じ値になり、|avg|=83ms でも「小さめ」へ誤分類されていた。
    //   大ズレ判定は純粋に enoughInput と |avg|>=35ms だけで決める（spec準拠）。
    //   併せて下限を -400ms へ拡張したので、提案値が実際に動いて補正が前へ進む。
    const enoughInput = valid >= 6;
    const bigZure = Math.abs(avg) >= 35;
    const cur = mic.bluetoothMicOffsetMs || 0;
    // 符号：判定時刻 = audio + offset。LATE(avg>0)なら offset を小さく（負方向）して早める。
    // → new = cur - avg。1回の補正量は ±BT_MIC_STEP_CLAMP に制限し、全体は [MIN,MAX] にクランプ。
    const step = Math.max(-BT_MIC_STEP_CLAMP, Math.min(BT_MIC_STEP_CLAMP, -avg));
    const proposed = Math.max(BT_MIC_OFFSET_MIN, Math.min(BT_MIC_OFFSET_MAX, cur + step));
    const propose = enoughInput && bigZure;
    // 微調整（v0.9.94）：大きな補正提案が出ないケースでは、複雑な条件分岐をやめ、
    // 有効入力が十分で平均ズレが算出できれば（|avg|>=1ms）、最新結果で必ず微調整する。
    // 平均ズレが0msになることはほぼ無いので、小さなズレでも最新値へ自然に詰める。
    // 符号ルールは大きな補正と同じ（new = cur - avg）。1回の補正量は ±BT_FINE_STEP_CLAMP に制限。
    const fineStep = Math.max(-BT_FINE_STEP_CLAMP, Math.min(BT_FINE_STEP_CLAMP, -avg));
    const fineProposed = Math.max(BT_MIC_OFFSET_MIN, Math.min(BT_MIC_OFFSET_MAX, cur + fineStep));
    const fine = !propose && enoughInput
        && Math.abs(avg) >= 1
        && (fineProposed !== cur);
    // ボタンを押させず最新結果で自動微調整する。OK判定は維持し、再テストは強制しない。
    // 判定時刻へ即反映されるので保存して結果も古くする。
    let autoFineApplied = false;
    let appliedOffset = cur;
    if (fine) {
        mic.bluetoothMicOffsetMs = fineProposed;
        appliedOffset = fineProposed;
        saveSettings();
        invalidatePracticeResult();
        autoFineApplied = true;
    }
    bt.result = { just, early, late, miss, valid, avg, cur, proposed, propose, fine, fineProposed, autoFineApplied, appliedOffset, enoughInput, perBeat };
    if (BT_DEBUG) {
        console.debug('[bt-cal-result]', {
            avg, valid, enoughInput, cur, proposed,
            proposedEqualsCur: proposed === cur,
            bigZure, propose, autoFineApplied,
        });
    }
    renderBtCalResult(bt.result);
    // v0.9.100：レーン（👏）は開いたまま、各拍のズレ付きで凍結表示する。
    if (els.btCalLaneWrap) els.btCalLaneWrap.classList.remove('hidden');
    fitBtLane();
    drawBtReview();
    setBtCalStatus(autoFineApplied ? '最新の平均ズレに合わせて微調整しました。' : '完了');
    // 測っただけでは btDelayDone にしない（適用 or スキップで完了にする）。
    if (settingsView === 'steps') scrollToSettingsEl(els.btCalResult || els.btCalCard);
}

/* v0.9.100：テスト後の凍結レーン。8拍の👏を横に並べ、各拍に対する入力のズレ(±ms)を表示する。 */
function drawBtReview() {
    if (!btLane || !btLane.ctx) return;
    const r = bt.result;
    if (!r || !r.perBeat) return;
    const { ctx, w, h } = btLane;
    ctx.clearRect(0, 0, w, h);
    const yc = h * 0.5;
    const N = BT_PLAY_BEATS;
    const padX = 24;
    const usable = Math.max(1, w - padX * 2);
    ctx.strokeStyle = 'rgba(253,246,238,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke();
    ctx.fillStyle = 'rgba(253,246,238,0.5)';
    ctx.font = '600 10px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('各拍のズレ（ms）', 6, h * 0.12);
    for (let i = 0; i < N; i++) {
        const x = padX + (N === 1 ? 0 : usable * i / (N - 1));
        const pb = r.perBeat[i];
        drawClapIcon(ctx, x, yc - 6, i + 1);
        if (pb && pb.matched) {
            const col = COLORS[pb.cls] || '#6ed28c';
            ctx.fillStyle = col;
            ctx.font = '700 12px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText((pb.diff > 0 ? '+' : '') + pb.diff, x, h * 0.96);
        } else {
            ctx.fillStyle = 'rgba(180,180,180,0.8)';
            ctx.font = '700 11px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('—', x, h * 0.96);
        }
    }
}

function renderBtCalResult(r) {
    if (!els.btCalResult) return;
    const sign = (v) => (v > 0 ? '+' : '') + v + 'ms';
    const dirTxt = r.avg > 0 ? '（遅め/LATE）' : (r.avg < 0 ? '（早め/EARLY）' : '');
    const avgTxt = sign(r.avg) + dirTxt;
    const primary = 'width:100%;padding:14px;margin-top:12px;border-radius:10px;border:none;'
        + 'background:linear-gradient(180deg,#ff9f1c,#ff8c00);color:#1a130a;font-weight:800;font-size:1rem;cursor:pointer;';
    const sub = 'width:100%;padding:12px;margin-top:8px;border-radius:10px;border:1px solid rgba(255,255,255,0.28);'
        + 'background:rgba(255,255,255,0.05);color:inherit;font-weight:700;cursor:pointer;';
    // 自動微調整を適用した場合は、最新値（appliedOffset）を「現在のマイク遅れ補正」に表示する（v0.9.95）
    const curShown = r.autoFineApplied ? r.appliedOffset : r.cur;
    const rows =
        '<div class="cal-result-row"><span>有効入力</span><b>' + r.valid + ' / ' + BT_PLAY_BEATS + '</b></div>' +
        '<div class="cal-result-row"><span>平均ズレ</span><b>' + avgTxt + '</b></div>' +
        '<div class="cal-result-row"><span>現在のマイク遅れ補正</span><b id="bt-cal-cur">' + sign(curShown) + '</b></div>';
    // v0.9.100：拍ごとのズレリスト＋手動スライダー（bluetoothMicOffsetMs用）。
    const extra = perBeatListHtml(r.perBeat) + btManualBlockHtml(curShown, sub);
    let head, actions;
    if (!r.enoughInput) {
        head = '<p class="cal-status" style="color:#ffd479;font-weight:700;margin-top:0;">入力が少なくて測れませんでした。クリックに合わせて、もう一度はっきり手拍子してください。</p>';
        actions = '<button type="button" id="bt-cal-rerun" style="' + primary + '">もう1度テストする</button>';
    } else if (r.propose) {
        head = '<p class="cal-status" style="color:#ffd479;font-weight:700;margin-top:0;">判定が' + (r.avg > 0 ? '遅め（LATE）' : '早め（EARLY）') + 'に大きくズレています。マイク遅れ補正で合わせましょう。</p>';
        const proposeRow = '<div class="cal-result-row"><span>補正後の目安</span><b>' + sign(r.proposed) + '</b></div>';
        actions =
            '<button type="button" id="bt-cal-apply" style="' + primary + '">この補正を適用してもう1度テストする</button>' +
            '<button type="button" id="bt-cal-rerun" style="' + sub + '">補正せずにもう1度テストする</button>';
        els.btCalResult.innerHTML = head + rows + proposeRow + extra + '<div style="margin-top:6px;">' + actions + '</div>';
        els.btCalResult.classList.remove('hidden');
        bindBtCalResultActions();
        return;
    } else {
        head = '<p class="cal-status" style="color:#6ed28c;font-weight:700;margin-top:0;">判定タイミングのズレは小さめです。このまま最終確認テストへ進めます。</p>';
        // v0.9.94：OK判定でも、有効な平均ズレがあれば最新結果で自動微調整済み。控えめに案内する（ボタンは出さない）。
        const autoNote = r.autoFineApplied
            ? '<p class="cal-status" style="color:#6ed28c;font-weight:600;margin-top:6px;">最新の平均ズレ（' + avgTxt + '）に合わせて、マイク遅れ補正を ' + sign(r.appliedOffset) + ' に微調整しました。</p>'
            : '';
        actions =
            '<button type="button" id="bt-cal-proceed" style="' + primary + '">最終確認テストへ進む</button>' +
            '<button type="button" id="bt-cal-rerun" style="' + sub + '">もう1度テストする</button>';
        els.btCalResult.innerHTML = head + autoNote + rows + extra + '<div style="margin-top:6px;">' + actions + '</div>';
        els.btCalResult.classList.remove('hidden');
        bindBtCalResultActions();
        return;
    }
    els.btCalResult.innerHTML = head + rows + perBeatListHtml(r.perBeat) + '<div style="margin-top:6px;">' + actions + '</div>';
    els.btCalResult.classList.remove('hidden');
    bindBtCalResultActions();
}

/* v0.9.100：マイク遅れ補正(bluetoothMicOffsetMs)を結果画面から手動微調整するスライダーブロック。
   役割：bluetoothMicOffsetMs はBluetooth時のマイク入力判定タイミング補正。headphoneOutputOffsetMs（表示補正）とは別物。
   符号：値を大きく(右)＝判定を遅らせる＝最終確認テストのEARLY（早め）を減らす。 */
function btManualBlockHtml(start, sub) {
    const sign = (v) => (v > 0 ? '+' : '') + v + 'ms';
    return '<details class="card-help" style="margin-top:10px;"><summary>手動で微調整</summary>'
        + '<div class="setting-row" style="margin-top:10px;">'
        + '<div class="setting-label">マイク遅れ補正 <b id="bt-cal-manual-val">' + sign(start) + '</b></div>'
        + '<input type="range" id="bt-cal-manual-slider" min="' + BT_MIC_OFFSET_MIN + '" max="' + BT_MIC_OFFSET_MAX + '" step="5" value="' + start + '">'
        + '<div class="hp-offset-labels" style="display:flex;justify-content:space-between;font-size:0.72rem;opacity:0.6;margin-top:2px;"><span>← 判定を早める</span><span>判定を遅らせる →</span></div>'
        + '<p class="setting-note">最終確認テストで EARLY（早め）が残るなら右（遅らせる）へ、LATE（遅め）が残るなら左（早める）へ少し動かします。0ms＝補正なし。</p>'
        + '<button type="button" id="bt-cal-manual-use" style="' + sub + '">この補正を使う</button>'
        + '</div></details>';
}

function bindBtCalResultActions() {
    const rerun = document.getElementById('bt-cal-rerun');
    if (rerun) rerun.addEventListener('click', () => startBtCal());
    const apply = document.getElementById('bt-cal-apply');
    if (apply) apply.addEventListener('click', () => { applyBtCal(); startBtCal(); });
    const proceed = document.getElementById('bt-cal-proceed');
    if (proceed) proceed.addEventListener('click', completeBtCalStep);
    // v0.9.100：手動スライダー（候補値の表示更新のみ。保存は「この補正を使う」で行う）
    const slider = document.getElementById('bt-cal-manual-slider');
    const valEl = document.getElementById('bt-cal-manual-val');
    if (slider && valEl) {
        slider.addEventListener('input', () => {
            const v = parseInt(slider.value, 10) || 0;
            valEl.textContent = (v > 0 ? '+' : '') + v + 'ms';
        });
    }
    const manualUse = document.getElementById('bt-cal-manual-use');
    if (manualUse) manualUse.addEventListener('click', () => {
        if (!slider) return;
        let v = parseInt(slider.value, 10) || 0;
        v = Math.max(BT_MIC_OFFSET_MIN, Math.min(BT_MIC_OFFSET_MAX, v));
        mic.bluetoothMicOffsetMs = v;
        saveSettings();
        invalidatePracticeResult();    // 最終確認テストの古い結果を無効化
        if (bt.result) bt.result.cur = v; // 再テスト時の基準にも反映
        const curEl = document.getElementById('bt-cal-cur');
        if (curEl) curEl.textContent = (v > 0 ? '+' : '') + v + 'ms';
        setBtCalStatus('マイク遅れ補正を ' + (v > 0 ? '+' : '') + v + 'ms に設定しました。そのまま再テスト、または最終確認テストへ進めます。');
    });
}

/* 提案値を bluetoothMicOffsetMs に反映して保存（判定時刻へ即反映される）。 */
function applyBtCal() {
    if (!bt.result) return;
    mic.bluetoothMicOffsetMs = bt.result.proposed;
    saveSettings();
    // 補正したので、前回の最終確認テスト結果は古くなる
    invalidatePracticeResult();
    setBtCalStatus('マイク遅れ補正を ' + (mic.bluetoothMicOffsetMs > 0 ? '+' : '') + mic.bluetoothMicOffsetMs + 'ms に設定しました。');
}

/* マイク遅れ補正ステップ完了 → 最終確認テストへ。 */
function completeBtCalStep() {
    stopBtCal();
    setupProgress.btDelayDone = true;
    wizardEditing = null;
    if (settingsView === 'steps') {
        renderSettingsView();
        scrollToSettingsEl(els.ptCard);
    }
}

/* ── 画面タップ設定：音ズレ補正テスト（タップ実測型・v0.9.98）─────────────────────
   STAGE1風の流れる音符に合わせ、イヤホンのクリック音と同じタイミングで画面をタップしてもらい、
   タップ時刻と理想拍（＝現在のタップ補正を加味した表示拍）との平均ズレを測る。
   そのズレで tapOutputOffsetMs()（= mic.headphoneOutputOffsetMs）を提案・微調整する。
   マイク不要。STAGE本体・最終確認テスト・マイク判定系には一切触れない専用モジュール。
   符号：STAGEタップ判定は hitTime = audioMs - tapOutputOffsetMs()。表示拍 displayBeat = beat + offset。
   diff = tap - displayBeat（正=LATE）。LATEなら offset を増やすほどJUSTへ寄るので new = offset + diff。 */
const TAP_CAL_PLAY_BEATS = 8;       // 8回タップで測定
const TAP_CAL_BIG_DIFF = 35;        // |平均ズレ| がこれ以上なら「大きくズレ」＝補正して再テストを促す
const TAP_CAL_LANE_HEIGHT = 120;    // タップ実測テストのレーン高さ（下部ボタンを見せるため低め・v0.9.100）
let tapCalBpm = 80;                 // テスト専用BPM（20〜160／20刻み・初期80・v0.9.99）
function tapCalBeatMs() { return 60000 / tapCalBpm; }
const tapCal = {
    active: false, capturing: false, timers: [], scheduled: [], raf: 0,
    audioStart: 0, flowStartPerf: 0, playT0Ms: 0, beatMs: 600, dispOff: 0,
    taps: [], hasRun: false, result: null, manualTouched: false,
};
let tapCalLane = { ctx: null, w: 0, h: 0 };

function setTapCalStatus(t) { if (els.tapCalStatus) els.tapCalStatus.textContent = t || ''; }
function tapCalTimer(fn, ms) { const id = setTimeout(fn, ms); tapCal.timers.push(id); return id; }
function fitTapCalLane() {
    if (!els.tapCalLaneCanvas) return;
    els.tapCalLaneCanvas.style.width = '100%';
    // v0.9.100：テスト中に「ここをタップ」「停止」ボタンまで画面に収まるよう、レーンは少し低め(120px)にする。
    els.tapCalLaneCanvas.style.height = TAP_CAL_LANE_HEIGHT + 'px';
    tapCalLane = fitOne(els.tapCalLaneCanvas);
}

/* テスト専用クリック（STAGEと同じ音量カーブ）。perf換算の記録は不要（測定は表示拍基準で行う）。 */
function tapCalScheduleClick(atSec, accent) {
    const ctx = state.audioCtx;
    if (!ctx) return;
    const vol = Math.max(0, Math.min(1, state.clickVolume / 100));
    const t0 = Math.max(atSec, ctx.currentTime);
    const peak = (accent ? 0.55 : 0.45) * vol;
    if (peak < 0.001) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1500 : 1200;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.09);
    tapCal.scheduled.push(osc);
}

/* STAGE1風レーン描画（専用）。音符は表示拍 displayBeat（= 拍 + 現在のタップ補正）でJUSTへ重なる。
   ユーザーが叩いたタップはマーカーで表示する。 */
function drawTapCalLane(t) {
    if (!tapCalLane || !tapCalLane.ctx) return;
    const { ctx, w, h } = tapCalLane;
    ctx.clearRect(0, 0, w, h);
    const yc = h * 0.56;
    const beatMs = tapCal.beatMs;
    const beatPx = Math.max(64, Math.min(120, w * 0.24));
    const judgeX = w * 0.3;
    const ppm = beatPx / beatMs;
    const dispOff = tapCal.dispOff;
    // 中央ガイド
    ctx.strokeStyle = 'rgba(253,246,238,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke();
    // カウントインの点（控えめ）
    for (let i = -PT_COUNTIN; i < 0; i++) {
        const bt = tapCal.playT0Ms + i * beatMs + dispOff;
        const x = judgeX + (bt - t) * ppm;
        if (x < -30 || x > w + 30) continue;
        ctx.beginPath(); ctx.arc(x, yc, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(253,246,238,0.3)'; ctx.fill();
    }
    // 本番8拍の音符（右→左へ流れる）
    for (let i = 0; i < TAP_CAL_PLAY_BEATS; i++) {
        const bt = tapCal.playT0Ms + i * beatMs + dispOff;
        const x = judgeX + (bt - t) * ppm;
        if (x < -30 || x > w + 30) continue;
        drawQuarterNote(ctx, x, yc, NOTE_COLOR);
    }
    // タップマーカー（叩いた位置）。GOOD=緑/EARLY=青/LATE=赤/それ以外=×
    for (let k = 0; k < tapCal.taps.length; k++) {
        const tp = tapCal.taps[k];
        const x = judgeX + (tp.t - t) * ppm;
        if (x < -24 || x > w + 24) continue;
        if (tp.cls === 'miss' || !tp.cls) {
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.strokeStyle = 'rgba(180,180,180,0.85)'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - 5, yc - 5); ctx.lineTo(x + 5, yc + 5);
            ctx.moveTo(x + 5, yc - 5); ctx.lineTo(x - 5, yc + 5);
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.save();
            ctx.globalAlpha = 0.95;
            ctx.beginPath(); ctx.arc(x, yc, 6, 0, Math.PI * 2);
            ctx.fillStyle = COLORS[tp.cls] || '#6ed28c'; ctx.fill();
            ctx.restore();
        }
    }
    // JUSTライン
    ctx.save();
    ctx.strokeStyle = 'rgba(255,159,28,0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(judgeX, h * 0.1); ctx.lineTo(judgeX, h * 0.94); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,159,28,0.75)';
    ctx.font = '700 11px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JUST', judgeX, h * 0.99);
}

function tapCalLoop() {
    if (!tapCal.active) return;
    drawTapCalLane(performance.now() - tapCal.flowStartPerf);
    tapCal.raf = requestAnimationFrame(tapCalLoop);
}

/* タップを記録（取り込み窓の間だけ）。表示拍に対するズレで簡易分類してマーカー色に使う。 */
function registerTapCalTap() {
    if (!tapCal.active || !tapCal.capturing) return;
    const tp = performance.now() - tapCal.flowStartPerf;
    const beatMs = tapCal.beatMs;
    const win = Math.max(NEAR_MS, beatMs * NEAR_FRAC);
    let bestAbs = Infinity, bestDiff = 0;
    for (let i = 0; i < TAP_CAL_PLAY_BEATS; i++) {
        const db = tapCal.playT0Ms + i * beatMs + tapCal.dispOff;
        const d = tp - db; const a = Math.abs(d);
        if (a < bestAbs) { bestAbs = a; bestDiff = d; }
    }
    let cls = 'miss';
    if (bestAbs <= JUST_MS) cls = 'just';
    else if (bestAbs <= win) cls = (bestDiff < 0 ? 'early' : 'late');
    tapCal.taps.push({ t: tp, cls });
}

function renderTapCalIdle() {
    if (els.tapCalBtn) els.tapCalBtn.textContent = tapCal.hasRun ? 'もう1度テストする' : '音ズレ補正テストを開始';
    if (els.tapCalLaneWrap) els.tapCalLaneWrap.classList.add('hidden');
    if (els.tapCalPad) els.tapCalPad.classList.add('hidden');
    if (els.tapCalPhase) els.tapCalPhase.textContent = '';
    if (els.tapCalResult) { els.tapCalResult.classList.add('hidden'); els.tapCalResult.innerHTML = ''; }
    if (els.tapCalBpmVal) els.tapCalBpmVal.textContent = String(tapCalBpm);
    setTapCalStatus('');
}

function startTapCal() {
    // 排他：タップ設定内・マイク設定内の他テストを止める
    if (hpCal.active) stopHeadphoneCal();
    stopBtCal();
    stopPracticeTest();
    ensureAudio();
    try { if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume(); } catch (_) { /* ignore */ }
    const ctx = state.audioCtx;
    if (!ctx) { setTapCalStatus('音声を初期化できませんでした。'); return; }

    tapCal.active = true;
    tapCal.capturing = false;
    tapCal.taps = [];
    tapCal.result = null;
    tapCal.timers.forEach(clearTimeout); tapCal.timers = [];
    tapCal.scheduled = [];
    tapCal.hasRun = true;
    tapCal.beatMs = tapCalBeatMs();
    tapCal.dispOff = tapOutputOffsetMs(); // このテストで使う「現在のタップ補正」を固定
    if (els.tapCalResult) { els.tapCalResult.classList.add('hidden'); els.tapCalResult.innerHTML = ''; }
    if (els.tapCalBtn) els.tapCalBtn.textContent = '音ズレ補正テストを停止';
    if (els.tapCalPad) els.tapCalPad.classList.remove('hidden');

    tapCal.audioStart = ctx.currentTime;
    tapCal.flowStartPerf = performance.now();
    tapCal.playT0Ms = PT_LEAD_MS + PT_COUNTIN * tapCal.beatMs;

    if (els.tapCalLaneWrap) els.tapCalLaneWrap.classList.remove('hidden');
    fitTapCalLane();
    cancelAnimationFrame(tapCal.raf);
    tapCal.raf = requestAnimationFrame(tapCalLoop);
    // v0.9.100：レーン／「ここをタップ」／「停止」ボタンが下で切れないよう、停止ボタンを画面下端に合わせて表示する。
    scrollToSettingsEl(els.tapCalBtn, 'end');

    const beatSec = tapCal.beatMs / 1000;
    const startSec = tapCal.audioStart + PT_LEAD_MS / 1000;
    for (let i = 0; i < PT_COUNTIN; i++) tapCalScheduleClick(startSec + i * beatSec, i === 0);
    const playStartSec = startSec + PT_COUNTIN * beatSec;
    for (let j = 0; j < TAP_CAL_PLAY_BEATS; j++) tapCalScheduleClick(playStartSec + j * beatSec, j % 4 === 0);

    setTapCalStatus('カウントイン…');
    for (let j = 0; j < TAP_CAL_PLAY_BEATS; j++) {
        tapCalTimer(() => setTapCalStatus('クリック音に合わせてタップ　' + (j + 1) + ' / ' + TAP_CAL_PLAY_BEATS), tapCal.playT0Ms + j * tapCal.beatMs);
    }
    const capStartMs = tapCal.playT0Ms - tapCal.beatMs * 0.5;
    const capEndMs = tapCal.playT0Ms + (TAP_CAL_PLAY_BEATS - 1) * tapCal.beatMs + tapCal.beatMs + 300;
    tapCalTimer(() => { tapCal.capturing = true; }, capStartMs);
    tapCalTimer(() => { tapCal.capturing = false; finishTapCal(); }, capEndMs);
}

/* 進行中のテストを止める（カードを離れる/排他時）。結果カードは触らない。 */
function stopTapCal() {
    if (!tapCal.active && !tapCal.timers.length) return;
    tapCal.active = false;
    tapCal.capturing = false;
    cancelAnimationFrame(tapCal.raf); tapCal.raf = 0;
    tapCal.timers.forEach(clearTimeout); tapCal.timers = [];
    tapCal.scheduled.forEach((o) => { try { o.stop(); } catch (_) { /* already stopped */ } });
    tapCal.scheduled = [];
    if (els.tapCalLaneWrap) els.tapCalLaneWrap.classList.add('hidden');
    if (els.tapCalPad) els.tapCalPad.classList.add('hidden');
    if (els.tapCalBtn) els.tapCalBtn.textContent = tapCal.hasRun ? 'もう1度テストする' : '音ズレ補正テストを開始';
    setTapCalStatus('');
}

function toggleTapCal() {
    if (tapCal.active) { stopTapCal(); } else { startTapCal(); }
}

/* BPM変更：テスト中なら停止して待機へ戻す（イヤホン音ズレ補正と同様にBPMはテスト外で決める）。 */
function setTapCalBpm(bpm) {
    const v = Math.max(HP_CAL_BPM_MIN, Math.min(HP_CAL_BPM_MAX, bpm));
    tapCalBpm = v;
    if (els.tapCalBpmVal) els.tapCalBpmVal.textContent = String(v);
    if (tapCal.active) { stopTapCal(); renderTapCalIdle(); }
}

/* 各拍に最も近いタップを割り当て、平均ズレ・有効数・傾向を集計し、補正値を提案/微調整する。 */
function finishTapCal() {
    tapCal.active = false;
    tapCal.capturing = false;
    cancelAnimationFrame(tapCal.raf); tapCal.raf = 0;
    // v0.9.100：結果後もレーンは閉じず、各タップのズレを見られるようにする。タップパッドだけ畳む。
    if (els.tapCalPad) els.tapCalPad.classList.add('hidden');
    if (els.tapCalBtn) els.tapCalBtn.textContent = 'もう1度テストする';

    const beatMs = tapCal.beatMs;
    const win = Math.max(NEAR_MS, beatMs * NEAR_FRAC);
    let sum = 0, valid = 0, early = 0, late = 0, just = 0;
    const used = new Array(tapCal.taps.length).fill(false);
    const perBeat = []; // v0.9.100：拍ごとのズレ（レーン凍結表示＆リスト用）
    for (let i = 0; i < TAP_CAL_PLAY_BEATS; i++) {
        const db = tapCal.playT0Ms + i * beatMs + tapCal.dispOff;
        let bestIdx = -1, bestAbs = Infinity, bestDiff = 0;
        for (let k = 0; k < tapCal.taps.length; k++) {
            if (used[k]) continue;
            const d = tapCal.taps[k].t - db; const a = Math.abs(d);
            if (a < bestAbs) { bestAbs = a; bestIdx = k; bestDiff = d; }
        }
        if (bestIdx >= 0 && bestAbs <= win) {
            used[bestIdx] = true;
            sum += bestDiff; valid++;
            const cls = Math.abs(bestDiff) <= JUST_MS ? 'just' : (bestDiff < 0 ? 'early' : 'late');
            if (cls === 'just') just++; else if (cls === 'early') early++; else late++;
            perBeat.push({ beat: i + 1, diff: Math.round(bestDiff), matched: true, cls });
        } else {
            perBeat.push({ beat: i + 1, diff: null, matched: false, cls: 'miss' });
        }
    }
    const avg = valid ? Math.round(sum / valid) : 0;
    const offsetUsed = tapCal.dispOff;
    // 符号：new = offset + avg（LATEなら増やしてJUSTへ寄せる）。範囲は -200〜+400ms にクランプ。
    const newOffset = clampNum(offsetUsed + avg, HP_OFFSET_MIN, HP_OFFSET_MAX, offsetUsed);
    const enoughInput = valid >= 6;
    const big = enoughInput && Math.abs(avg) >= TAP_CAL_BIG_DIFF && newOffset !== offsetUsed;
    // ズレが小さければ（OK）、最新の平均ズレで自動微調整して完了にする。
    let autoApplied = false, appliedOffset = offsetUsed;
    if (enoughInput && !big && Math.abs(avg) >= 1 && newOffset !== offsetUsed) {
        setHeadphoneOffset(newOffset); // 値反映＋各スライダー同期＋saveSettings
        appliedOffset = newOffset;
        autoApplied = true;
    }
    tapCal.result = { valid, avg, early, late, just, offsetUsed, newOffset, enoughInput, big, autoApplied, appliedOffset, perBeat };
    renderTapCalResult(tapCal.result);
    // v0.9.100：レーンは開いたまま、各拍のズレ付きで凍結表示する。
    if (els.tapCalLaneWrap) els.tapCalLaneWrap.classList.remove('hidden');
    fitTapCalLane();
    drawTapCalReview();
    setTapCalStatus(autoApplied ? '最新の平均ズレに合わせて微調整しました。' : '完了');
    scrollToSettingsEl(els.tapCalResult || els.tapCalCard);
}

/* v0.9.100：テスト後の凍結レーン。8拍を横に並べ、各拍に対するタップのズレ(±ms)を表示する。 */
function drawTapCalReview() {
    if (!tapCalLane || !tapCalLane.ctx) return;
    const r = tapCal.result;
    if (!r || !r.perBeat) return;
    const { ctx, w, h } = tapCalLane;
    ctx.clearRect(0, 0, w, h);
    const yc = h * 0.52;
    const N = TAP_CAL_PLAY_BEATS;
    const padX = 24;
    const usable = Math.max(1, w - padX * 2);
    // 中央ガイド
    ctx.strokeStyle = 'rgba(253,246,238,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke();
    // 凡例（数字＝ズレms）
    ctx.fillStyle = 'rgba(253,246,238,0.5)';
    ctx.font = '600 10px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('各拍のズレ（ms）', 6, h * 0.12);
    for (let i = 0; i < N; i++) {
        const x = padX + (N === 1 ? 0 : usable * i / (N - 1));
        const pb = r.perBeat[i];
        // 拍番号
        ctx.fillStyle = 'rgba(253,246,238,0.6)';
        ctx.font = '600 10px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), x, h * 0.26);
        // 音符
        drawQuarterNote(ctx, x, yc, NOTE_COLOR);
        // ズレ表示
        if (pb && pb.matched) {
            const col = COLORS[pb.cls] || '#6ed28c';
            ctx.save();
            ctx.globalAlpha = 0.95;
            ctx.beginPath(); ctx.arc(x, yc, 5, 0, Math.PI * 2);
            ctx.fillStyle = col; ctx.fill();
            ctx.restore();
            ctx.fillStyle = col;
            ctx.font = '700 12px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText((pb.diff > 0 ? '+' : '') + pb.diff, x, h * 0.9);
        } else {
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.strokeStyle = 'rgba(180,180,180,0.85)'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - 5, yc - 5); ctx.lineTo(x + 5, yc + 5);
            ctx.moveTo(x + 5, yc - 5); ctx.lineTo(x - 5, yc + 5);
            ctx.stroke();
            ctx.restore();
            ctx.fillStyle = 'rgba(180,180,180,0.8)';
            ctx.font = '700 11px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('—', x, h * 0.9);
        }
    }
}

/* v0.9.100：拍ごとのズレを結果カードに折りたたみリストで出す共通フォーマッタ。 */
function perBeatListHtml(perBeat) {
    if (!perBeat || !perBeat.length) return '';
    const sign = (v) => (v > 0 ? '+' : '') + v + 'ms';
    let items = '';
    for (let i = 0; i < perBeat.length; i++) {
        const pb = perBeat[i];
        const val = pb.matched ? sign(pb.diff) : '—';
        items += '<div class="cal-result-row"><span>' + pb.beat + '拍目</span><b>' + val + '</b></div>';
    }
    return '<details class="card-help" style="margin-top:8px;"><summary>拍ごとのズレを見る</summary>'
        + '<div style="margin-top:6px;">' + items + '</div></details>';
}

function renderTapCalResult(r) {
    if (!els.tapCalResult) return;
    const sign = (v) => (v > 0 ? '+' : '') + v + 'ms';
    const dirTxt = r.avg > 0 ? '（遅め/LATE）' : (r.avg < 0 ? '（早め/EARLY）' : '');
    const avgTxt = sign(r.avg) + dirTxt;
    const primary = 'width:100%;padding:14px;margin-top:12px;border-radius:10px;border:none;'
        + 'background:linear-gradient(180deg,#ff9f1c,#ff8c00);color:#1a130a;font-weight:800;font-size:1rem;cursor:pointer;';
    const sub = 'width:100%;padding:12px;margin-top:8px;border-radius:10px;border:1px solid rgba(255,255,255,0.28);'
        + 'background:rgba(255,255,255,0.05);color:inherit;font-weight:700;cursor:pointer;';
    const curShown = r.autoApplied ? r.appliedOffset : r.offsetUsed;
    let rows =
        '<div class="cal-result-row"><span>有効タップ</span><b>' + r.valid + ' / ' + TAP_CAL_PLAY_BEATS + '</b></div>' +
        '<div class="cal-result-row"><span>平均ズレ</span><b>' + avgTxt + '</b></div>' +
        '<div class="cal-result-row"><span>現在のタップ補正</span><b>' + sign(curShown) + '</b></div>';
    // v0.9.101：手動微調整スライダーの操作状態をリセット（操作したら true）。
    tapCal.manualTouched = false;
    let head;
    if (!r.enoughInput) {
        head = '<p class="cal-status" style="color:#ffd479;font-weight:700;margin-top:0;">タップが少ないため測れませんでした。クリック音に合わせて、もう一度8回タップしてください。</p>';
        const action = '<button type="button" id="tap-cal-apply" style="' + primary + '">もう1度テスト</button>';
        els.tapCalResult.innerHTML = head + '<div class="cal-result-row"><span>有効タップ</span><b>' + r.valid + ' / ' + TAP_CAL_PLAY_BEATS + '</b></div>'
            + '<div style="margin-top:6px;">' + action + '</div>';
        els.tapCalResult.classList.remove('hidden');
        bindTapCalResultActions();
        return;
    }
    if (r.big) {
        head = '<p class="cal-status" style="color:#ffd479;font-weight:700;margin-top:0;">タップが' + (r.avg > 0 ? '遅め（LATE）' : '早め（EARLY）') + 'に片寄っています。補正して合わせましょう。</p>';
        rows += '<div class="cal-result-row"><span>補正後の目安</span><b>' + sign(r.newOffset) + '</b></div>';
    } else {
        head = '<p class="cal-status" style="color:#6ed28c;font-weight:700;margin-top:0;">ズレは小さいため、この設定で使えます。</p>';
        const autoNote = r.autoApplied
            ? '<p class="cal-status" style="color:#6ed28c;font-weight:600;margin-top:6px;">最新の平均ズレ（' + avgTxt + '）に合わせて、タップ補正を ' + sign(r.appliedOffset) + ' に微調整しました。</p>'
            : '';
        head += autoNote;
    }
    // v0.9.101：主導線は「この補正を適用してもう1度テスト」に一本化。「もう1度テストする」「手動で微調整する」ボタンは廃止。
    const actions =
        '<button type="button" id="tap-cal-apply" style="' + primary + '">この補正を適用してもう1度テスト</button>' +
        '<button type="button" id="tap-cal-use" style="' + sub + '">この設定で使う</button>' +
        '<button type="button" id="tap-cal-save" style="' + sub + '">この設定を保存</button>';
    // v0.9.101：折りたたみ（＋タブ）を「拍ごとのズレを見る」→「手動で微調整する」の順で、ボタン群の下に置く。
    // 手動スライダーの初期値＝補正後の目安（大きくズレた場合は newOffset、小ズレ時は現在値）。
    const manualInit = r.big ? r.newOffset : curShown;
    const folds = perBeatListHtml(r.perBeat) + tapCalManualBlockHtml(manualInit, curShown);
    els.tapCalResult.innerHTML = head + rows + '<div style="margin-top:6px;">' + actions + '</div>' + folds;
    els.tapCalResult.classList.remove('hidden');
    bindTapCalResultActions();
}

/* v0.9.101：タップ補正の手動微調整スライダー（折りたたみ）。
   範囲は画面タップ設定と同じ -200〜+400ms（5ms刻み）。値は「この補正を適用してもう1度テスト」/「この設定で使う」で適用する。 */
function tapCalManualBlockHtml(initialVal, curVal) {
    const sign = (v) => (v > 0 ? '+' : '') + v + 'ms';
    const v = clampNum(initialVal, HP_OFFSET_MIN, HP_OFFSET_MAX, curVal || 0);
    return '<details class="card-help" style="margin-top:8px;"><summary>手動で微調整する</summary>'
        + '<div class="setting-row" style="margin-top:10px;">'
        + '<div class="setting-label">現在のタップ補正 <b>' + sign(curVal) + '</b></div>'
        + '<input type="range" id="tap-cal-manual-slider" min="' + HP_OFFSET_MIN + '" max="' + HP_OFFSET_MAX + '" step="5" value="' + v + '">'
        + '<div class="hp-offset-labels" style="display:flex;justify-content:space-between;font-size:0.72rem;opacity:0.6;margin-top:2px;"><span>← 音が早く聞こえる</span><span>音が遅く聞こえる →</span></div>'
        + '<div class="setting-label" style="margin-top:6px;">調整後 <b id="tap-cal-manual-after">' + sign(v) + '</b></div>'
        + '<p class="setting-note">スライダーを動かすと、「この補正を適用してもう1度テスト」でこの値が使われます。</p>'
        + '</div></details>';
}

/* v0.9.101：手動スライダーを操作していればその値、未操作なら結果から計算した補正値を返す。 */
function tapCalTargetOffset() {
    const slider = document.getElementById('tap-cal-manual-slider');
    if (tapCal.manualTouched && slider) {
        return clampNum(parseInt(slider.value, 10), HP_OFFSET_MIN, HP_OFFSET_MAX, mic.headphoneOutputOffsetMs || 0);
    }
    if (tapCal.result && typeof tapCal.result.newOffset === 'number') return tapCal.result.newOffset;
    return mic.headphoneOutputOffsetMs || 0;
}

function bindTapCalResultActions() {
    // 手動微調整スライダー：操作したら manualTouched を立て、「調整後」表示を更新する。
    const slider = document.getElementById('tap-cal-manual-slider');
    const after = document.getElementById('tap-cal-manual-after');
    if (slider) {
        slider.addEventListener('input', () => {
            tapCal.manualTouched = true;
            const v = parseInt(slider.value, 10) || 0;
            if (after) after.textContent = (v > 0 ? '+' : '') + v + 'ms';
        });
    }
    // 主導線：補正値（手動優先）を適用してもう1度テスト。
    const apply = document.getElementById('tap-cal-apply');
    if (apply) apply.addEventListener('click', () => {
        setHeadphoneOffset(tapCalTargetOffset()); // 値反映＋各スライダー同期＋saveSettings
        startTapCal();
    });
    // この設定で使う：手動で変更済みならその値を適用してから、現在のタップ補正で保存しTOPへ。
    const use = document.getElementById('tap-cal-use');
    if (use) use.addEventListener('click', () => {
        if (tapCal.manualTouched) setHeadphoneOffset(tapCalTargetOffset());
        applyTapOutputOffsetAndClose(mic.headphoneOutputOffsetMs || 0);
    });
    // この設定を保存：手動で変更済みならその値を反映してから、画面タップ設定用プリセットとして保存。
    const save = document.getElementById('tap-cal-save');
    if (save) save.addEventListener('click', () => {
        if (tapCal.manualTouched) setHeadphoneOffset(tapCalTargetOffset());
        openTapPresetModal();
    });
}

/* ── 入力タイプ別の感度・表示プロファイル判定（v0.9.49）──────────
   headphone：初回から高感度寄りで拾いにいく＆低入力スケール表示。
   auto/normal：従来どおり「明確に低入力っぽいときだけ」高感度救済を使う。 */
function shouldStartMicTestInHighSensitivity() {
    return isHeadphoneInput(); // イヤホン接続は初回テストから高感度寄り
}
function shouldUseLowInputDisplayProfile() {
    return isHeadphoneInput() || !!test.rescueHighSens; // 低入力スケール表示を使うか
}
function shouldAllowRescueHighSens() {
    if (isHeadphoneInput()) return true;       // イヤホンは常に救済（高感度）を許可
    return shouldUseRescueHighSens();          // auto/normal は低入力っぽいときだけ
}

/* ── 入力方法（タップ / ストローク）──────────────────────── */
/* 入力方式の切替UI（リズム練の［タップ｜ストローク］）とSTAGEの「現在：」表示を同期する（v0.9.118） */
function updateInputModeUI() {
    const m = state.inputMode;
    if (els.rhythmModeTap) els.rhythmModeTap.classList.toggle('is-active', m === 'tap');
    if (els.rhythmModeStroke) els.rhythmModeStroke.classList.toggle('is-active', m === 'stroke');
    if (els.practiceModeLabel) els.practiceModeLabel.textContent = (m === 'tap') ? 'タップモード' : 'ストロークモード';
}

/* 「リズム練をする」画面での入力方式の選択（v0.9.118）。
   ここではホーム画面にいるため、マイク開始やタップエリア操作は行わず、選択の記録・UI反映・保存だけを行う。
   実際のSTAGEへの反映（マイク開始/タップエリア表示）は openStage → setInputMode で行う。 */
function selectInputMode(mode) {
    state.inputMode = (mode === 'stroke') ? 'stroke' : 'tap';
    updateInputModeUI();
    saveSettings();
}

function setInputMode(mode) {
    state.inputMode = mode;
    updateInputModeUI();
    if (mode === 'tap') {
        if (mic.on) stopMic();          // タップ練習はマイクOFF
        if (els.tapArea) els.tapArea.classList.remove('hidden');  // タップエリア表示
        if (els.tapTools) els.tapTools.classList.remove('hidden'); // 調整タブ（折りたたみ）を表示
        setTapToolsOpen(false);          // 初期は閉じた状態
        applyTapLayout();
        hideMicSetupPrompt();
    } else {
        if (els.tapTools) els.tapTools.classList.add('hidden');   // ストローク時は調整タブを隠す
        if (els.tapArea) els.tapArea.classList.add('hidden');     // ストローク時はタップエリアを畳む
        if (els.tapHint) els.tapHint.textContent = '流れる譜面に合わせてストローク。クリック音は小さめ推奨です。';
        if (!mic.on) {
            startMic().then(() => {
                if (mic.on) {
                    maybeShowMicSetupPrompt();   // 許可成功 → 初回のみマイク設定へ誘導
                } else if (els.tapHint) {
                    els.tapHint.textContent = 'マイクを許可してください。右上の設定から確認できます。';
                }
            });
        }
    }
    saveSettings(); // v0.9.118：入力方式を保存（STAGEトグル/リズム練スイッチ/再読込で同期）
}

/* STAGE画面のタイトル横「現在：タップ/ストローク」をタップして入力方式を切り替える（v0.9.118）。
   既存の setInputMode を使うため、判定・マイク起動・UI同期（リズム練スイッチ／保存）はそのまま反映される。 */
function toggleStageInputMode() {
    setInputMode(state.inputMode === 'tap' ? 'stroke' : 'tap');
}

/* マイク許可成功直後の設定誘導。
   ・許可ダイアログが実際に出た後（mic.dialogShown）は、済み状態でも出す。
   ・ダイアログが出ていない（既にgranted）場合は、未設定のときだけ出す。
   ・同一セッションでは1回だけ（micSetupPromptShownThisSession）。 */
function maybeShowMicSetupPrompt() {
    if (!els.micSetupPrompt) return;
    if (els.practice.classList.contains('hidden')) return; // STAGE画面表示中のみ
    if (micSetupPromptShownThisSession) return;             // セッション内は1回だけ
    const afterDialog = !!mic.dialogShown;
    if (!afterDialog && (state.micTestDone || state.micSetupPrompted)) return; // ダイアログ無し＆済みなら出さない
    // 文言：済みなら「確認できます」、未設定なら「しておくと安定します」
    const done = state.micTestDone || state.micDelayDone;
    if (els.micSetupPromptText) {
        els.micSetupPromptText.textContent = done
            ? '🎤 マイクの準備ができました。必要に応じて、マイク設定を確認できます。'
            : '🎤 マイクの準備ができました。最初にマイク設定をしておくと、ストローク判定が安定します。';
    }
    els.micSetupPrompt.classList.remove('hidden');
    micSetupPromptShownThisSession = true;
    state.micSetupPrompted = true;
    saveSettings();
}

function hideMicSetupPrompt() {
    if (els.micSetupPrompt) els.micSetupPrompt.classList.add('hidden');
}

/* タップエリアの配置（左右 / 上下）をDOM・案内・トグルへ反映 */
function applyTapLayout() {
    const ud = state.tapLayout === 'ud';
    if (els.tapArea) {
        els.tapArea.classList.toggle('layout-ud', ud);
        els.tapArea.classList.toggle('layout-lr', !ud);
    }
    if (els.layoutLrBtn) els.layoutLrBtn.classList.toggle('is-active', !ud);
    if (els.layoutUdBtn) els.layoutUdBtn.classList.toggle('is-active', ud);
    if (els.tapHint) {
        els.tapHint.textContent = ud ? '上：アップ ／ 下：ダウン で練習' : '左：ダウン ／ 右：アップ で練習';
    }
    applyTapHeight();
}

/* 配置を切り替えて保存（左右 / 上下）。判定の方向ロジックは配置に依らず同じ。 */
function setTapLayout(layout) {
    state.tapLayout = (layout === 'ud') ? 'ud' : 'lr';
    saveSettings();
    applyTapLayout();
}

/* タップボタン高さの範囲（v0.9.118）。上下配置のときだけ最大値を拡張し、押しやすい大きさにできるようにする。
   保存値は最大(TAP_H_MAX_UD)まで保持し、表示時に現在の配置の上限へクランプする（配置を戻しても値が消えない）。 */
const TAP_H_MIN = 80;
const TAP_H_MAX_LR = 160;
const TAP_H_MAX_UD = 280;
const TAP_H_DEFAULT = 106;
function tapHeightMax() { return state.tapLayout === 'ud' ? TAP_H_MAX_UD : TAP_H_MAX_LR; }

/* タップボタンの高さ(px)をCSS変数に反映（判定には影響しない・見た目のみ）。
   配置に応じてスライダーの最大値も切り替え、適用値は上限でクランプする。 */
function applyTapHeight() {
    const max = tapHeightMax();
    const applied = clampNum(state.tapHeight, TAP_H_MIN, max, TAP_H_DEFAULT);
    if (els.tapArea) els.tapArea.style.setProperty('--tap-h', applied + 'px');
    if (els.tapHeightSlider) {
        if (parseInt(els.tapHeightSlider.max, 10) !== max) els.tapHeightSlider.max = String(max);
        if (parseInt(els.tapHeightSlider.value, 10) !== applied) els.tapHeightSlider.value = String(applied);
    }
}

/* 高さを変更して保存 */
function setTapHeight(px) {
    state.tapHeight = clampNum(px, TAP_H_MIN, tapHeightMax(), TAP_H_DEFAULT);
    applyTapHeight();
    saveSettings();
}

/* タップボタン調整タブの開閉（v0.9.118）。初期は閉じる。 */
function setTapToolsOpen(open) {
    if (els.tapToolsPanel) els.tapToolsPanel.classList.toggle('hidden', !open);
    if (els.tapToolsToggle) {
        els.tapToolsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        els.tapToolsToggle.textContent = open ? 'タップボタン調整 ▴' : 'タップボタン調整 ▾';
    }
}
function toggleTapTools() {
    const closed = !els.tapToolsPanel || els.tapToolsPanel.classList.contains('hidden');
    setTapToolsOpen(closed);
}

/* タップボタンの配置・高さを既定へ戻す（v0.9.118）。 */
function resetTapButtons() {
    state.tapLayout = 'lr';
    state.tapHeight = TAP_H_DEFAULT;
    applyTapLayout(); // 配置クラス・ボタン活性・案内・高さ(applyTapHeight)を反映
    saveSettings();
}

/* ── テンポ操作 ─────────────────────────────────────────── */
function setTempoEnabled(on) {
    els.tempoUp.disabled = !on;
    els.tempoDown.disabled = !on;
    els.tempoUp.classList.toggle('is-disabled', !on);
    els.tempoDown.classList.toggle('is-disabled', !on);
    // 小節数の−/＋もBPMと同じく再生中はロック（v0.9.118）
    if (els.barsUp) { els.barsUp.disabled = !on; els.barsUp.classList.toggle('is-disabled', !on); }
    if (els.barsDown) { els.barsDown.disabled = !on; els.barsDown.classList.toggle('is-disabled', !on); }
}

/* 小節数（テスト長さ）の反映と表示（v0.9.118）。
   TOTAL_BEATS を小節数×4拍へ更新する。配列/レーンは resetGame→resetData で作り直す。 */
function applyStageBars() {
    TOTAL_BEATS = state.bars * eng.cellsPerBar;
}
function updateBarsUI() {
    if (els.barsVal) els.barsVal.textContent = String(state.bars);
}
function setStageBars(bars) {
    if (state.running) return;          // 再生中は変更ロック（BPMと同じ）
    if (BAR_OPTIONS.indexOf(bars) === -1) return;
    state.bars = bars;
    applyStageBars();
    updateBarsUI();
    if (!eng.custom) saveSettings();    // カスタムテスト中は一時設定（STAGE設定を書き換えない）
    resetGame();                        // 新しい小節数で配列・カウンタ・レーンを作り直す
}
function stepStageBars(dir) {
    const i = BAR_OPTIONS.indexOf(state.bars);
    const base = (i === -1) ? BAR_OPTIONS.indexOf(DEFAULT_BARS) : i;
    const ni = Math.max(0, Math.min(BAR_OPTIONS.length - 1, base + dir));
    setStageBars(BAR_OPTIONS[ni]);
}

function setBpm(v) {
    if (state.running) return; // 再生中は変更ロック
    state.bpm = Math.max(40, Math.min(200, v));
    els.tempoVal.textContent = state.bpm;
    state.beatInterval = engCellMs();
    state.pxPerMs = state.pxPerBeat / engQuarterMs();
    state.T0 = eng.countInCells * state.beatInterval;
    drawLane(0);
    updateCustomFlowScorePosition(0); // BPM変更後のスタンバイ位置に流れる譜面も合わせる（カスタムのみ・v0.9.128）
}

/* ═══════════════════════════════════════════════════════════
   設定（マイク感度 / クールダウン / クリック音ガード）
   localStorage に保存し、マイク判定へ即時反映する
═══════════════════════════════════════════════════════════ */
function clampNum(v, lo, hi, fallback) {
    const n = Number(v);
    if (!isFinite(n)) return fallback;
    return Math.max(lo, Math.min(hi, n));
}

/* マイク感度の表示は「低い←→高い」。内部 threshold は高感度ほど小さい（逆変換）。
   右＝敏感（低threshold・小さい音も拾う）／左＝鈍感（高threshold・大きい音だけ拾う）。
   ★表示スケールを「対数（log）」にする。従来の線形だと低threshold側（高感度）が上端に
     一気に詰まり、有線イヤホンの 0.011 でも 96〜97% に張り付いて「ほぼ最大」に見えていた。
     log にすると高感度側に表示の余裕ができ、0.011≒69%・0.009≒74%・0.006≒84%・0.003=100% になる。
   ※threshold の実値（=判定に使う値）は変えていない。スライダーの「見え方」と刻み方だけが変わる。
   下限を 0.003（100%側で 0.003 まで高感度に振れる）、上限は 0.20（Mac等の大入力でクリックを避ける）。 */
const THR_MIN = 0.003, THR_MAX = 0.20;
const THR_LN_MIN = Math.log(THR_MIN), THR_LN_MAX = Math.log(THR_MAX);
function sensFromThreshold(thr) {
    const t = Math.max(THR_MIN, Math.min(THR_MAX, thr));
    return Math.round((THR_LN_MAX - Math.log(t)) / (THR_LN_MAX - THR_LN_MIN) * 100);
}
function thresholdFromSens(sens) {
    const s = Math.max(0, Math.min(100, sens)) / 100;
    return Math.exp(THR_LN_MAX - s * (THR_LN_MAX - THR_LN_MIN));
}
/* 低入力(イヤホン)用の「表示専用」スケール（双方向ペア）。
   検出に使う実値(threshold)は変えない。低入力時はおすすめが 0.0035〜0.005 付近まで下がるため、
   通常スケールだと 96% 付近に張り付いて見える。表示だけ下限を 0.001 まで広げ、70〜80%台に見せる。
   例：0.0035≒76%・0.004≒74%・0.008≒61%。逆変換は threshold を [THR_MIN, THR_MAX] にクランプするので、
   スライダーを高感度側へ振り切っても実値は THR_MIN(0.003) より下がらない（＝検出ロジックは不変）。 */
const THR_DISPLAY_MIN_LOW = 0.001;
const THR_LN_DISPLAY_MIN_LOW = Math.log(THR_DISPLAY_MIN_LOW);
function sensFromThresholdLow(thr) {
    const t = Math.max(THR_DISPLAY_MIN_LOW, Math.min(THR_MAX, thr));
    return Math.round((THR_LN_MAX - Math.log(t)) / (THR_LN_MAX - THR_LN_DISPLAY_MIN_LOW) * 100);
}
function thresholdFromSensLow(sens) {
    const s = Math.max(0, Math.min(100, sens)) / 100;
    const t = Math.exp(THR_LN_MAX - s * (THR_LN_MAX - THR_LN_DISPLAY_MIN_LOW));
    return Math.max(THR_MIN, Math.min(THR_MAX, t));
}
function recoSensDisplay(thr, lowInput) {
    if (!lowInput || thr == null) return sensFromThreshold(thr);
    return sensFromThresholdLow(thr);
}
/* 手動設定の表示・スライダーで使う変換。低入力テスト由来の設定(mic.lowInputProfile)のときだけ
   低入力スケールを使い、マイク反応テストのおすすめ表示%と手動設定の表示%を一致させる。
   通常環境ではこれまでどおり sensFromThreshold / thresholdFromSens を使う（見え方は不変）。 */
function sensFromThresholdUI(thr) {
    return mic.lowInputProfile ? sensFromThresholdLow(thr) : sensFromThreshold(thr);
}
function thresholdFromSensUI(sens) {
    return mic.lowInputProfile ? thresholdFromSensLow(sens) : thresholdFromSens(sens);
}

function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (_) { s = {}; }
    mic.threshold = clampNum(s.threshold, THR_MIN, THR_MAX, SETTINGS_DEFAULTS.threshold);
    // v0.9.60：'auto'は廃止。保存値がauto/未知ならnormalへ正規化（以後はnormal/headphoneのみ保存）。
    mic.inputType = (s.inputType === 'headphone') ? 'headphone' : 'normal';
    {
        // イヤホンの音ズレ補正（v0.9.51）：種類別に保存。無い/範囲外/不正値は各種類の目安に戻す。
        // v0.9.87：旧単一値 headphoneOutputOffsetMs を有線へ自動引き継ぎしない。
        // 旧Bluetooth目安180msが有線側へ混ざる原因になるため、明示的な wired 値が無い場合は0msへ戻す。
        mic.headphoneType = (s.headphoneType === 'bluetooth') ? 'bluetooth' : 'wired';
        mic.headphoneOffsetWiredMs = validHpOffset(s.headphoneOffsetWiredMs, HP_TYPE_DEFAULT_OFFSET.wired);
        mic.headphoneOffsetBluetoothMs = validHpOffset(s.headphoneOffsetBluetoothMs, HP_TYPE_DEFAULT_OFFSET.bluetooth);
        mic.headphoneOutputOffsetMs = currentHpTypeOffset();
    }
    mic.lowInputProfile = !!s.lowInputProfile;
    mic.cooldownMs = clampNum(s.cooldownMs, 100, 400, SETTINGS_DEFAULTS.cooldownMs);
    mic.clickGuardMs = clampNum(s.clickGuardMs, 0, 250, SETTINGS_DEFAULTS.clickGuardMs);
    mic.timingOffsetMs = clampNum(s.timingOffsetMs, -150, 150, SETTINGS_DEFAULTS.timingOffsetMs);
    mic.bluetoothMicOffsetMs = clampNum(s.bluetoothMicOffsetMs, BT_MIC_OFFSET_MIN, BT_MIC_OFFSET_MAX, 0);
    state.clickVolume = clampNum(s.clickVolume, 0, 100, SETTINGS_DEFAULTS.clickVolume);
    if (typeof s.lastCalibrationDelayMs === 'number') cal.measuredDelay = s.lastCalibrationDelayMs;
    if (typeof s.lastCalibrationAt === 'number') cal.lastAt = s.lastCalibrationAt;
    if (typeof s.lastCalSpread === 'number') cal.spread = s.lastCalSpread;
    if (typeof s.lastCalSuccess === 'number') cal.successCount = s.lastCalSuccess;
    if (typeof s.lastCalMaxPeak === 'number') cal.maxPeak = s.lastCalMaxPeak;
    state.micTestDone = !!s.micTestDone;
    state.micDelayDone = !!s.micDelayDone;
    state.micSetupPrompted = !!s.micSetupPrompted;
    state.tapLayout = (s.tapLayout === 'ud') ? 'ud' : 'lr';
    state.tapHeight = clampNum(s.tapHeight, TAP_H_MIN, TAP_H_MAX_UD, TAP_H_DEFAULT); // v0.9.118：上下配置の拡張値も保持（表示時に配置上限へクランプ）
    state.inputMode = (s.inputMode === 'stroke') ? 'stroke' : 'tap'; // v0.9.118：入力方式（タップ/ストローク）の保存値を優先
    state.bars = (BAR_OPTIONS.indexOf(s.bars) !== -1) ? s.bars : DEFAULT_BARS; // v0.9.118：小節数の保存値を優先（不正値は既定8）
    applyStageBars();
    state.strokeDetectMode = (s.strokeDetectMode === 'chord') ? 'chord' : 'brush';
    // PROカスタムSTAGE（v0.9.119）：既存設定JSON内の配列を読み出して正規化する。
    state.rhythmProCustomStages = Array.isArray(s.rhythmProCustomStages)
        ? s.rhythmProCustomStages.map(x => normalizeRhythmCustomStageSettings(x)).filter(Boolean)
        : [];
    if (typeof s.chordMinCooldown === 'number') state.chordMinCooldown = clampNum(s.chordMinCooldown, 100, 400, 180);
    if (typeof s.chordRiseGate === 'number') state.chordRiseGate = s.chordRiseGate;
    if (typeof s.chordInstantRiseGate === 'number') state.chordInstantRiseGate = s.chordInstantRiseGate;
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            threshold: mic.threshold,
            inputType: mic.inputType,
            headphoneType: mic.headphoneType,
            headphoneOffsetWiredMs: mic.headphoneOffsetWiredMs,
            headphoneOffsetBluetoothMs: mic.headphoneOffsetBluetoothMs,
            headphoneOutputOffsetMs: mic.headphoneOutputOffsetMs,
            lowInputProfile: mic.lowInputProfile,
            cooldownMs: mic.cooldownMs,
            clickGuardMs: mic.clickGuardMs,
            timingOffsetMs: mic.timingOffsetMs,
            bluetoothMicOffsetMs: mic.bluetoothMicOffsetMs,
            clickVolume: state.clickVolume,
            lastCalibrationDelayMs: cal.measuredDelay,
            lastCalibrationAt: cal.lastAt,
            lastCalSpread: cal.spread,
            lastCalSuccess: cal.successCount,
            lastCalMaxPeak: cal.maxPeak,
            micTestDone: state.micTestDone,
            micDelayDone: state.micDelayDone,
            micSetupPrompted: state.micSetupPrompted,
            tapLayout: state.tapLayout,
            tapHeight: state.tapHeight,
            inputMode: state.inputMode,
            bars: state.bars,
            strokeDetectMode: state.strokeDetectMode,
            rhythmProCustomStages: Array.isArray(state.rhythmProCustomStages) ? state.rhythmProCustomStages : [],
            chordMinCooldown: state.chordMinCooldown,
            chordRiseGate: state.chordRiseGate,
            chordInstantRiseGate: state.chordInstantRiseGate,
        }));
    } catch (_) { /* プライベートモード等では無視 */ }
}

/* 現在値をスライダー・数値表示・しきい値ラインへ反映 */
function applySettingsToUI() {
    const sens = sensFromThresholdUI(mic.threshold);
    els.setThreshold.value = sens;
    els.setThresholdVal.textContent = sens + '％';
    els.setCooldown.value = mic.cooldownMs;
    els.setCooldownVal.textContent = mic.cooldownMs + 'ms';
    if (els.micThreshold) els.micThreshold.style.left = micThresholdMarkerPct() + '%';
    if (els.testThreshold) els.testThreshold.style.left = micThresholdMarkerPct() + '%';
    if (els.setOffset) {
        els.setOffset.value = mic.timingOffsetMs;
        els.setOffsetVal.textContent = (mic.timingOffsetMs > 0 ? '+' : '') + mic.timingOffsetMs + 'ms';
    }
    if (els.calCurrentOffset) els.calCurrentOffset.textContent = (mic.timingOffsetMs > 0 ? '+' : '') + mic.timingOffsetMs + 'ms';
    if (els.setClickVol) {
        els.setClickVol.value = state.clickVolume;
        els.setClickVolVal.textContent = state.clickVolume + '％';
    }
    updateStrokeDetectModeUI();
    updateMicInputTypeUI(); // 内部で updateHeadphoneTypeUI() を呼び、スライダー/表示/導線も同期
}

/* ── ステップ式マイク設定UI（v0.9.61）────────────────────────────
   表示制御だけで実装：既存カードはそのまま流用し、表示順・表示条件を切り替える。
   settingsView：'chooser'（初期：メイン導線＋保存プリセット）/ 'summary'（現在の設定一覧）/ 'steps'（順番に出す）。
   「次へ」は廃止：選択・適用・完了するたびに次の項目を自動で出す（setupProgress で制御）。
   重要：判定ロジック・補正値・STAGE側には一切手を入れない（見せ方の制御のみ）。 */
let settingsView = 'chooser';
/* 設定タブ（v0.9.95）：'mic'（既存マイク設定フロー）/ 'tap'（画面タップ設定）。
   tapView は画面タップ設定タブ内のサブ表示（v0.9.97）：
   'home'（補正値＋3ボタン）/ 'cal'（イヤホン音ズレ補正カードを再利用）/ 'preset'（タップ用プリセット）/ 'manual'（手動設定）。 */
let settingsTab = 'mic';
let tapView = 'home';
/* 「現在の設定を見る」を開いた時点のタップ補正値（v0.9.103）。キャンセルでこの値へ戻す。 */
let tapManualSnapshot = 0;
/* 保存モーダルの保存先（v0.9.97）：'mic'＝マイク設定プリセット／'tap'＝画面タップ設定プリセット。 */
let presetModalMode = 'mic';
/* 今回の「もう一度テストする」フローでユーザーが選択済み/完了したかの進捗（保存値とは別物）
   v0.9.62：1ステップずつ進むウィザード。各ステップの完了フラグで「いま出すカード」を1つだけ決める。
   correctionDone（補正系完了：適用 or スキップ or 進む）を追加。 */
function freshSetupProgress() {
    return {
        inputChosen: false, hpChosen: false, strokeChosen: false,
        recoApplied: false, correctionDone: false, btDelayDone: false, practiceDone: false, manualForced: false,
    };
}
let setupProgress = freshSetupProgress();
let wizardEditing = null; // 要約をタップして選び直し中のステップid（null=通常進行）
let practiceResultOk = false; // 直近の実践テストが「問題なさそう」だったか（完了ボタンの有効判定に使う）

/* HTMLエスケープ（プリセット名・要約テキスト用） */
function escapeHtml(t) {
    return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ── ウィザードのステップ定義 ───────────────────────────────
   input(=入力タイプ＋イヤホン種類) → stroke → test → correction → [btdelay] → practice → final(手動＋プリセット)
   btdelay（マイク遅れ補正）は Bluetoothイヤホン時だけ補正(correction)の後に差し込む（v0.9.80）。 */
function wizardSteps() {
    // 入力タイプ別にステップを動的に組み立てる（v0.9.89）。
    // 通常マイク：input → stroke → test → correction(マイクの遅れ補正) → practice → final
    // 有線イヤホン：input → hptype → stroke → test → practice → final（音ズレ補正は出さない）
    // Bluetooth：input → hptype → stroke → test → correction(イヤホン音ズレ補正) → btdelay → practice → final
    const steps = ['input'];
    if (isHeadphoneInput()) steps.push('hptype');
    steps.push('stroke', 'test');
    if (!isHeadphoneInput()) {
        steps.push('correction');            // 通常マイク：マイクの遅れ補正
    } else if (isBluetoothHeadphone()) {
        steps.push('correction', 'btdelay'); // Bluetooth：イヤホン音ズレ補正＋マイク遅れ補正
    }
    // 有線イヤホンは補正カードを出さない（0ms＝補正なしが基本）
    steps.push('practice', 'final');
    return steps;
}
function wizardStepComplete(id) {
    switch (id) {
        case 'input': return setupProgress.inputChosen;
        case 'hptype': return setupProgress.hpChosen;
        case 'stroke': return setupProgress.strokeChosen;
        case 'test': return setupProgress.recoApplied;
        case 'correction': return setupProgress.correctionDone;
        case 'btdelay': return !isBluetoothHeadphone() || setupProgress.btDelayDone;
        case 'practice': return setupProgress.practiceDone;
        default: return false; // 'final' は終端
    }
}
function firstIncompleteWizardStep() {
    for (const id of wizardSteps()) { if (!wizardStepComplete(id)) return id; }
    return 'final';
}
function activeWizardStep() {
    if (wizardEditing) return wizardEditing;
    return firstIncompleteWizardStep();
}
/* そのステップで表示するカード（補正系は入力タイプ/イヤホン種類で出し分け） */
function wizardStepCards(id) {
    switch (id) {
        case 'input': return [els.inputTypeCard];
        case 'hptype': return [els.hpTypeCard];
        case 'stroke': return [els.strokeModeCard];
        case 'test': return [els.testCard];
        case 'correction':
            // 通常マイク＝マイクの遅れ補正／Bluetooth＝イヤホン音ズレ補正（有線はこのステップ自体が無い）
            return isHeadphoneInput() ? [els.hpCalCard] : [els.calCard];
        case 'btdelay': return [els.btCalCard];
        case 'practice': return [els.ptCard];
        case 'final': return [els.manualCard];
        default: return [];
    }
}
function allStepCards() {
    return [els.inputTypeCard, els.hpTypeCard, els.strokeModeCard, els.testCard, els.calCard, els.hpCalCard,
    els.correctionWiredNote, els.btCalCard, els.ptCard, els.manualCard];
}

/* 完了済みステップの要約テキスト */
function wizardStepSummary(id) {
    switch (id) {
        case 'input': {
            if (!isHeadphoneInput()) return '入力タイプ：通常マイク';
            return '入力タイプ：イヤホン接続';
        }
        case 'hptype':
            return 'イヤホン種類：' + (getHeadphoneType() === 'bluetooth' ? 'Bluetooth' : '有線');
        case 'stroke':
            return 'ストローク検出モード：' + (state.strokeDetectMode === 'chord' ? 'コードストローク' : 'ブラッシング');
        case 'test':
            return 'マイク反応テスト：適用済み（反応ライン ' + sensFromThresholdUI(mic.threshold) + '%、二重反応防止 ' + mic.cooldownMs + 'ms）';
        case 'correction': {
            // 通常マイク＝マイクの遅れ補正／Bluetooth＝イヤホン音ズレ補正（有線はこのステップが無い）
            if (!isHeadphoneInput()) return 'マイクの遅れ補正：' + (mic.timingOffsetMs > 0 ? '+' : '') + mic.timingOffsetMs + 'ms';
            return 'イヤホン音ズレ補正：' + mic.headphoneOutputOffsetMs + 'ms';
        }
        case 'btdelay':
            return 'マイク遅れ補正：' + (mic.bluetoothMicOffsetMs > 0 ? '+' : '') + mic.bluetoothMicOffsetMs + 'ms';
        case 'practice':
            return '最終確認テスト：完了';
        default: return '';
    }
}

/* セグメントボタンの点灯：ステップ開始直後（未選択）は両方とも消灯にする */
function refreshSegmentSelections() {
    const steps = (settingsView === 'steps');
    const t = getMicInputType();
    const showInput = !(steps && !setupProgress.inputChosen);
    if (els.inputTypeNormal) els.inputTypeNormal.classList.toggle('is-active', showInput && t === 'normal');
    if (els.inputTypeHeadphone) els.inputTypeHeadphone.classList.toggle('is-active', showInput && t === 'headphone');
    const ht = getHeadphoneType();
    const showHp = !(steps && !setupProgress.hpChosen);
    if (els.hpTypeWired) els.hpTypeWired.classList.toggle('is-active', showHp && ht === 'wired');
    if (els.hpTypeBluetooth) els.hpTypeBluetooth.classList.toggle('is-active', showHp && ht === 'bluetooth');
    const chord = (state.strokeDetectMode === 'chord');
    const showStroke = !(steps && !setupProgress.strokeChosen);
    if (els.strokeModeBrush) els.strokeModeBrush.classList.toggle('is-active', showStroke && !chord);
    if (els.strokeModeChord) els.strokeModeChord.classList.toggle('is-active', showStroke && chord);
}

/* 「完了」ボタン：もう一度テスト中は、実践テストが「問題なさそう」になるまで無効（グレー）。
   確認モード/手動ビューでは通常使用可。 */
function isDoneLocked() {
    return (settingsView === 'steps') && !practiceResultOk;
}
function updateDoneButtonState() {
    const btn = els.settingsBackBtn;
    if (!btn) return;
    const steps = (settingsView === 'steps');
    const lock = isDoneLocked();
    // いったん見た目をリセット（btn-primary のオレンジに戻す）
    btn.style.opacity = '';
    btn.style.filter = '';
    btn.style.background = '';
    btn.style.color = '';
    btn.style.border = '';
    btn.style.boxShadow = '';
    if (steps && lock) {
        // ウィザード進行中・実践テスト未完了/問題あり：グレーアウト（主役に見せない）
        btn.style.opacity = '0.4';
        btn.style.filter = 'grayscale(1)';
    } else if (!steps) {
        // 確認モード/手動ビュー/初期画面：使えるが控えめ（主役ボタンと競合させない）
        btn.style.background = 'rgba(255,255,255,0.06)';
        btn.style.color = 'inherit';
        btn.style.border = '1px solid rgba(255,255,255,0.3)';
        btn.style.boxShadow = 'none';
    }
    // steps かつ 問題なし → そのまま btn-primary のオレンジで点灯（主役）
    if (!lock && els.settingsDoneHint) els.settingsDoneHint.classList.add('hidden');
}

/* ロック中に「完了」やタップで出す案内文（状況で出し分け）。 */
function showDoneHint() {
    if (!els.settingsDoneHint) return;
    els.settingsDoneHint.textContent = setupProgress.practiceDone
        ? '最終確認テストで調整してから完了してください。'
        : '最終確認テストまで完了してください。';
    els.settingsDoneHint.classList.remove('hidden');
}

function renderSettingsView() {
    // タブの点灯（v0.9.95）
    if (els.settingsTabMic) els.settingsTabMic.classList.toggle('is-active', settingsTab === 'mic');
    if (els.settingsTabTap) els.settingsTabTap.classList.toggle('is-active', settingsTab === 'tap');
    // v0.9.116：マイク設定の手順（steps）表示中だけ、最後のカードも見やすい位置まで持ち上げられるよう
    //   下にスクロール余地（下余白）を確保する。マイク設定TOP/プリセット/画面タップ設定には付けない。
    //   スクロール命令は変更せず、スクロール可能なページ高さだけを足す方針（B案）。
    if (els.settings) els.settings.classList.toggle('is-steps-scrollable', settingsTab === 'mic' && settingsView === 'steps');
    if (settingsTab === 'tap') { renderTapSettingsView(); return; }
    // マイク設定タブ：画面タップ設定カードは隠し（.hidden で確実に）。
    // フッター（マイク設定TOPへ戻る）は、TOP（chooser）と保存済みプリセットページでは出さない（v0.9.104）。
    if (els.tapSettingsCard) els.tapSettingsCard.classList.add('hidden');
    if (els.settingsActions) {
        const hideFooter = (settingsView === 'chooser' || settingsView === 'preset');
        els.settingsActions.style.display = hideFooter ? 'none' : '';
    }
    // 画面タップ設定専用カードは隠す（.hidden で確実に）
    if (els.tapPresetCard) els.tapPresetCard.classList.add('hidden');
    if (els.tapManualCard) els.tapManualCard.classList.add('hidden');
    if (els.tapCalCard) els.tapCalCard.classList.add('hidden');
    // hp-cal-card のタップ用ボタン表示を通常（マイクフロー）へ戻す
    if (els.hpProceedBtn) els.hpProceedBtn.style.display = '';
    if (els.hpTapUseBtn) els.hpTapUseBtn.classList.add('hidden');
    if (els.hpTapSaveBtn) els.hpTapSaveBtn.classList.add('hidden');
    const steps = (settingsView === 'steps');
    if (els.settingsChooser) els.settingsChooser.classList.toggle('hidden', settingsView !== 'chooser');
    if (els.settingsSimpleCard) els.settingsSimpleCard.classList.toggle('hidden', settingsView !== 'simple');
    if (els.settingsSummaryCard) els.settingsSummaryCard.classList.toggle('hidden', settingsView !== 'summary');
    // マイク設定：保存済みプリセットページ（v0.9.104）
    if (els.micPresetCard) els.micPresetCard.classList.toggle('hidden', settingsView !== 'preset');
    if (settingsView === 'preset') renderPresetList();
    if (steps) {
        renderWizardSteps();
    } else if (settingsView === 'manual') {
        // 「手動設定だけ開く」軽量ビュー：手動設定カードのみ表示（プリセット保存はカード内）
        allStepCards().forEach((el) => { if (el) el.style.display = 'none'; });
        if (els.manualCard) els.manualCard.style.display = '';
        if (els.settingsStepsSummary) els.settingsStepsSummary.style.display = 'none';
        if (els.settingsStepsProgress) els.settingsStepsProgress.style.display = 'none';
        if (els.ptOpenManual) els.ptOpenManual.style.display = 'none';
    } else {
        allStepCards().forEach((el) => { if (el) el.style.display = 'none'; });
        if (els.settingsStepsSummary) els.settingsStepsSummary.style.display = 'none';
        if (els.settingsStepsProgress) els.settingsStepsProgress.style.display = 'none';
        if (els.ptOpenManual) els.ptOpenManual.style.display = 'none';
    }
    refreshSegmentSelections();
    updateDoneButtonState();
}

/* 画面タップ設定タブの表示（v0.9.95→v0.9.97）。マイク設定系のカード/フッターは全部隠す。
   tapView: 'home'（補正値＋3ボタン）/ 'cal'（音ズレ補正テスト）/ 'preset'（プリセット）/ 'manual'（手動設定）。 */
function renderTapSettingsView() {
    if (els.settingsChooser) els.settingsChooser.classList.add('hidden');
    if (els.settingsSimpleCard) els.settingsSimpleCard.classList.add('hidden');
    if (els.settingsSummaryCard) els.settingsSummaryCard.classList.add('hidden');
    // v0.9.105：マイク設定の保存済みプリセットページ（mic-preset-card）も必ず隠す。
    // 開いたまま画面タップ設定タブへ移ると、下部にマイク側プリセットが残って見えていた不具合を防ぐ。
    if (els.micPresetCard) els.micPresetCard.classList.add('hidden');
    allStepCards().forEach((el) => { if (el) el.style.display = 'none'; });
    if (els.settingsStepsSummary) els.settingsStepsSummary.style.display = 'none';
    if (els.settingsStepsProgress) els.settingsStepsProgress.style.display = 'none';
    if (els.ptOpenManual) els.ptOpenManual.style.display = 'none';
    if (els.settingsDoneHint) els.settingsDoneHint.classList.add('hidden');
    if (els.settingsActions) els.settingsActions.style.display = 'none'; // 既存フッター（マイク設定TOP/完了）は使わない
    // まず各ビューのカードをすべて隠す（.hidden は display:none !important なので classList で）
    if (els.tapSettingsCard) els.tapSettingsCard.classList.add('hidden');
    if (els.tapPresetCard) els.tapPresetCard.classList.add('hidden');
    if (els.tapManualCard) els.tapManualCard.classList.add('hidden');
    if (els.tapCalCard) els.tapCalCard.classList.add('hidden');
    // 旧・丸レーンの hp-cal-card はタップ設定では使わない（マイク設定タブ専用）
    if (els.hpCalCard) els.hpCalCard.style.display = 'none';
    if (els.hpProceedBtn) els.hpProceedBtn.style.display = '';
    if (els.hpTapUseBtn) els.hpTapUseBtn.classList.add('hidden');
    if (els.hpTapSaveBtn) els.hpTapSaveBtn.classList.add('hidden');

    if (tapView === 'cal') {
        // タップ実測型テスト（v0.9.98）：STAGE1風レーンに合わせてタップし平均ズレを測る専用カード
        if (els.tapCalCard) els.tapCalCard.classList.remove('hidden');
        if (!tapCal.active && !tapCal.result) renderTapCalIdle();
    } else if (tapView === 'preset') {
        if (els.tapPresetCard) els.tapPresetCard.classList.remove('hidden');
        renderTapPresetList();
    } else if (tapView === 'manual') {
        if (els.tapManualCard) els.tapManualCard.classList.remove('hidden');
        const v = mic.headphoneOutputOffsetMs || 0;
        if (els.tapManualOffset) els.tapManualOffset.value = v;
        if (els.tapManualVal) els.tapManualVal.textContent = v + 'ms';
        if (els.tapManualCurrent) els.tapManualCurrent.textContent = 'タップ補正：' + v + 'ms';
    } else {
        // HOME：補正値＋3ボタン
        if (els.tapSettingsCard) els.tapSettingsCard.classList.remove('hidden');
        updateTapCurrentOffsetDisplay();
    }
}

/* 画面タップ設定ホームの「現在のタップ補正」表示を更新（v0.9.95）。 */
function updateTapCurrentOffsetDisplay() {
    if (els.tapCurrentOffset) els.tapCurrentOffset.textContent = '現在のタップ補正：' + (mic.headphoneOutputOffsetMs || 0) + 'ms';
}

/* タブ切替（v0.9.95→v0.9.96）。中断確認は呼び出し側（guardMicSetupInterruption）で行う。
   マイク設定タブを押したら、詳細テスト途中のカードに残さず、必ずマイク設定TOP（chooser）へ戻す。 */
function setSettingsTab(tab) {
    const next = (tab === 'tap') ? 'tap' : 'mic';
    settingsTab = next;
    tapView = 'home'; // タブを切り替えたら必ずホームから
    if (next === 'mic') {
        // マイク設定タブを押したら、保存済みプリセット・現在の設定を見るは閉じた状態のTOPに戻す（v0.9.103）
        if (els.presetListWrap) els.presetListWrap.style.display = 'none';
        if (els.presetToggleBtn) els.presetToggleBtn.textContent = '保存済みプリセット';
        setSettingsView('chooser'); // マイク設定TOPへ戻す（renderSettingsView を内包）
    } else {
        renderSettingsView();
    }
}

/* 画面タップ設定：補正値を適用して保存し、アプリ全体TOPへ戻る（v0.9.95）。
   タップ判定で使うのは headphoneOutputOffsetMs。setHeadphoneOffset で選択中の種類の保存先と
   互換用 headphoneOutputOffsetMs の両方へ書き、再読込でも保持されるようにする。 */
function applyTapOutputOffsetAndClose(v) {
    if (hpCal.active) stopHeadphoneCal(); // 念のためテスト中なら停止
    stopTapCal();          // タップ実測型テスト中なら停止（v0.9.98）
    setHeadphoneOffset(v); // 値反映＋スライダー同期＋saveSettings
    closeSettings();       // アプリ全体のTOPページへ戻る（プリセット/手動設定と同じ導線）
}

/* 画面タップ設定「音ズレ補正テスト」：タップ実測型テストのカードを表示する（v0.9.95→v0.9.98）。 */
function openTapCorrection() {
    if (hpCal.active) stopHeadphoneCal();
    stopTapCal();
    tapCal.result = null; // 入り直したら新しいテストの待機状態に
    tapView = 'cal';
    renderSettingsView();
    renderTapCalIdle();
    scrollToSettingsEl(els.tapCalCard);
}

/* 画面タップ設定「プリセット」：タップ専用プリセット一覧を表示する（v0.9.97）。 */
function openTapPreset() {
    if (hpCal.active) stopHeadphoneCal();
    stopTapCal();
    tapView = 'preset';
    renderSettingsView();
    scrollToSettingsEl(els.tapPresetCard);
}

/* 画面タップ設定「現在の設定を見る」：現在のタップ補正値を確認・調整する画面（v0.9.97→v0.9.103）。
   開いた時点の値を snapshot に控え、キャンセルで元へ戻せるようにする。 */
function openTapManual() {
    if (hpCal.active) stopHeadphoneCal();
    stopTapCal();
    tapManualSnapshot = mic.headphoneOutputOffsetMs || 0; // キャンセル用に開いた時点の値を控える（v0.9.103）
    tapView = 'manual';
    renderSettingsView();
    scrollToSettingsEl(els.tapManualCard);
}

/* 「現在の設定を見る」のキャンセル（v0.9.103）：スライダー変更を保存せず、開いた時点の値へ戻して
   画面タップ設定TOPへ戻る。 */
function cancelTapManual() {
    if (hpCal.active) stopHeadphoneCal();
    stopTapCal();
    setHeadphoneOffset(tapManualSnapshot); // 開いた時点の値へ戻す（保存も元値で上書き＝変更破棄）
    backToTapHome();
}

/* 画面タップ設定の各サブ画面から、画面タップ設定ホームへ戻る（v0.9.97）。 */
function backToTapHome() {
    if (hpCal.active) stopHeadphoneCal();
    stopTapCal();
    tapView = 'home';
    renderSettingsView();
    scrollToSettingsEl(els.tapSettingsCard);
}

/* ── 画面タップ設定用プリセット（v0.9.97）。マイク設定プリセットとは完全に別管理。
   保存するのはタップ補正値（headphoneOutputOffsetMs）だけ。 ── */
function loadTapPresets() {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(TAP_PRESETS_KEY)) || []; } catch (_) { arr = []; }
    return Array.isArray(arr) ? arr : [];
}
function saveTapPresets(arr) {
    try { localStorage.setItem(TAP_PRESETS_KEY, JSON.stringify(arr)); } catch (_) { /* プライベートモード等は無視 */ }
}
function allTapPresets() {
    return BUILTIN_TAP_PRESETS.concat(loadTapPresets());
}
/* 組み込みタップ用プリセットの横並びボタン用・短い表示ラベル（v0.9.103）。内部の name は変えない。 */
function tapPresetShortLabel(p) {
    if (!p) return '';
    if (p.id === 'builtin_tap_none') return '補正なし';
    if (p.id === 'builtin_tap_bt') return 'Bluetooth標準';
    return p.name;
}
function isBuiltinTapPresetName(name) {
    const n = (name || '').trim();
    return BUILTIN_TAP_PRESETS.some((p) => p.name === n);
}

/* タップ補正値を適用して保存し、アプリ全体TOPへ戻る（呼び出し＝適用＋TOP）。 */
function applyTapPreset(id) {
    const p = allTapPresets().find((x) => x && x.id === id);
    if (!p) return;
    if (hpCal.active) stopHeadphoneCal();
    stopTapCal();
    setHeadphoneOffset(clampNum(p.tapOffsetMs, HP_OFFSET_MIN, HP_OFFSET_MAX, 0)); // 値反映＋同期＋保存
    closeSettings(); // アプリ全体のTOPページへ戻る
}

/* 現在のタップ補正値（headphoneOutputOffsetMs）をプリセットとして保存。 */
function saveTapPresetWithName(name, setMsg, clearInput) {
    name = (name || '').trim();
    if (!name) { if (setMsg) setMsg('プリセット名を入力してください。'); return false; }
    if (isBuiltinTapPresetName(name)) {
        if (setMsg) setMsg('標準プリセットと同じ名前は使えません。別の名前を入力してください。');
        return false;
    }
    const now = Date.now();
    const val = clampNum(mic.headphoneOutputOffsetMs || 0, HP_OFFSET_MIN, HP_OFFSET_MAX, 0);
    const arr = loadTapPresets();
    const existing = arr.find((p) => p && p.name === name);
    if (existing) {
        const ok = window.confirm('「' + name + '」は既にあります。上書き保存しますか？\n（キャンセルすると保存しません）');
        if (!ok) { if (setMsg) setMsg('上書きをキャンセルしました。別の名前でも保存できます。'); return false; }
        existing.tapOffsetMs = val;
        existing.updatedAt = now;
        saveTapPresets(arr);
        if (clearInput) clearInput();
        if (setMsg) setMsg('上書き保存しました');
        return true;
    }
    arr.push({ id: 'tap_' + now + '_' + Math.random().toString(36).slice(2, 7), name: name, tapOffsetMs: val, createdAt: now, updatedAt: now });
    saveTapPresets(arr);
    if (clearInput) clearInput();
    if (setMsg) setMsg('保存しました');
    return true;
}

function deleteTapPreset(id) {
    const arr = loadTapPresets().filter((p) => p && p.id !== id);
    saveTapPresets(arr);
    renderTapPresetList();
}

/* タップ補正プリセット一覧（組み込み＋ユーザー保存）を描画。 */
function renderTapPresetList() {
    if (!els.tapPresetList) return;
    const users = loadTapPresets();
    const rowStyle = 'display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:9px 10px;margin-bottom:8px;'
        + 'border:1px solid rgba(255,255,255,0.14);border-radius:10px;background:rgba(255,255,255,0.05);';
    const nameStyle = 'flex:1 1 100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;';
    const applyStyle = 'flex:none;padding:8px 14px;border-radius:8px;border:1px solid rgba(255,160,60,0.85);'
        + 'background:rgba(255,160,60,0.2);color:inherit;font-size:0.85rem;font-weight:700;cursor:pointer;';
    const miniStyle = 'flex:none;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.3);'
        + 'background:rgba(255,255,255,0.04);color:inherit;font-size:0.8rem;cursor:pointer;';
    const miniDisabled = miniStyle + 'opacity:0.3;cursor:default;';
    const delStyle = 'flex:none;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,120,120,0.45);'
        + 'background:rgba(255,120,120,0.08);color:inherit;font-size:0.8rem;cursor:pointer;';

    // 組み込み2種（補正なし/Bluetooth標準）は横並びボタン（v0.9.103）。横並びで見やすいよう短い表記にする。
    let html = '<div class="preset-builtin-row">' + BUILTIN_TAP_PRESETS.map((p) =>
        '<button type="button" class="preset-builtin-btn tap-preset-apply" data-id="' + p.id + '">' + escapeHtml(tapPresetShortLabel(p)) + '</button>'
    ).join('') + '</div>';
    // タップ用プリセットの説明（折りたたみ・v0.9.103）
    html += '<details class="card-help preset-help"><summary>詳しい説明</summary>'
        + '<p class="setting-note" style="margin-top:8px;">これは一般的な数値を元にした簡易的なプリセットです。合わない場合は、補正テストで実際にタップして調整してください。</p></details>';

    // ユーザー保存プリセットは、マイク設定側と同じく 適用／名前変更／↑↓並べ替え／削除に対応（v0.9.104）。
    html += users.map((p, k) => {
        const upDis = (k === 0);
        const downDis = (k === users.length - 1);
        return '<div style="' + rowStyle + '">' +
            '<span style="' + nameStyle + '">' + escapeHtml(p.name) + '（' + (p.tapOffsetMs || 0) + 'ms）</span>' +
            '<button type="button" class="tap-preset-up" data-id="' + p.id + '" aria-label="上へ"' + (upDis ? ' disabled' : '') + ' style="' + (upDis ? miniDisabled : miniStyle) + '">↑</button>' +
            '<button type="button" class="tap-preset-down" data-id="' + p.id + '" aria-label="下へ"' + (downDis ? ' disabled' : '') + ' style="' + (downDis ? miniDisabled : miniStyle) + '">↓</button>' +
            '<button type="button" class="tap-preset-apply" data-id="' + p.id + '" style="' + applyStyle + '">適用</button>' +
            '<button type="button" class="tap-preset-rename" data-id="' + p.id + '" style="' + miniStyle + '">名前変更</button>' +
            '<button type="button" class="tap-preset-del" data-id="' + p.id + '" aria-label="削除" style="' + delStyle + '">削除</button>' +
            '</div>';
    }).join('');

    els.tapPresetList.innerHTML = html;
    els.tapPresetList.querySelectorAll('.tap-preset-apply').forEach((b) => {
        b.addEventListener('click', () => applyTapPreset(b.getAttribute('data-id')));
    });
    els.tapPresetList.querySelectorAll('.tap-preset-del').forEach((b) => {
        b.addEventListener('click', () => deleteTapPreset(b.getAttribute('data-id')));
    });
    els.tapPresetList.querySelectorAll('.tap-preset-rename').forEach((b) => {
        b.addEventListener('click', () => renameTapPreset(b.getAttribute('data-id')));
    });
    els.tapPresetList.querySelectorAll('.tap-preset-up').forEach((b) => {
        b.addEventListener('click', () => { if (!b.disabled) moveTapPreset(b.getAttribute('data-id'), -1); });
    });
    els.tapPresetList.querySelectorAll('.tap-preset-down').forEach((b) => {
        b.addEventListener('click', () => { if (!b.disabled) moveTapPreset(b.getAttribute('data-id'), 1); });
    });
}

/* タップ用プリセットの名前変更（v0.9.104。マイク設定側 renamePreset と同じ考え方。組み込みは対象外）。 */
function renameTapPreset(id) {
    const arr = loadTapPresets();
    const p = arr.find((x) => x && x.id === id);
    if (!p) return;
    const input = window.prompt('新しいプリセット名を入力してください。', p.name);
    if (input === null) return;
    const name = input.trim();
    if (!name) return;
    if (isBuiltinTapPresetName(name)) { window.alert('標準プリセットと同じ名前は使えません。別の名前にしてください。'); return; }
    if (arr.some((x) => x && x.id !== id && x.name === name)) { window.alert('同じ名前のプリセットがあります。別の名前にしてください。'); return; }
    p.name = name;
    p.updatedAt = Date.now();
    saveTapPresets(arr);
    renderTapPresetList();
}

/* タップ用プリセットの並べ替え（v0.9.104）。dir<0で上へ、dir>0で下へ。組み込みは対象外。 */
function moveTapPreset(id, dir) {
    const arr = loadTapPresets();
    const i = arr.findIndex((x) => x && x.id === id);
    if (i < 0) return;
    const j = i + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= arr.length) return;
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    saveTapPresets(arr);
    renderTapPresetList();
}

/* 画面タップ設定の音ズレ補正カードから「この設定を保存」：保存モーダルをタップ用で開く（v0.9.97）。 */
function openTapPresetModal() {
    openPresetModal('tap');
}

/* 画面タップ設定の音ズレ補正カードで「この音ズレ設定で使う」：保存してアプリ全体TOPへ（v0.9.95）。
   マイクフローの completeCorrectionStep（BT補正/最終確認テストへ進む）には入らない。 */
function useTapCorrection() {
    if (hpCal.active || hpCal.timer || hpCal.lightTimers.length) stopHeadphoneCal();
    saveSettings();
    closeSettings();
}

/* ステップ表示：いまのアクティブステップのカードだけ出し、前の完了ステップは要約に畳む */
function renderWizardSteps() {
    const active = activeWizardStep();
    allStepCards().forEach((el) => { if (el) el.style.display = 'none'; });
    wizardStepCards(active).forEach((el) => { if (el) el.style.display = ''; });
    // イヤホン種類カードは独立ステップ（hptype）として表示する。入力タイプが
    // イヤホン接続のときだけ hidden を外す（display はステップ表示側で制御・v0.9.89）。
    if (els.hpTypeCard) els.hpTypeCard.classList.toggle('hidden', !isHeadphoneInput());
    // 最終ステップ（手動設定・保存）に入ったら、キャンセル用スナップショットを控える（v0.9.89）。
    if (active === 'final') captureManualSnapshot();
    renderStepProgress(active);
    renderStepSummaries(active);
    if (els.ptOpenManual) els.ptOpenManual.style.display = (active === 'practice') ? '' : 'none';
    // マイク遅れ補正（btdelay）：他ステップへ移ったら停止。表示時はアイドルUIへ（v0.9.80）
    if (active !== 'btdelay' && (bt.active || bt.timers.length)) stopBtCal();
    if (active === 'btdelay' && !bt.active && els.btCalResult && els.btCalResult.classList.contains('hidden')) {
        renderBtCalIdle();
    }
    // 実践テストステップを「これから実施」状態で開いたときは、前回の音符レーンを残さない（v0.9.73）。
    // 実施直後（結果表示中）は触らない。結果が隠れている＝初期画面なので、レーンの残骸を消す。
    if (active === 'practice' && !pt.active && els.ptResult && els.ptResult.classList.contains('hidden')) {
        if (ptLane && ptLane.ctx) ptLane.ctx.clearRect(0, 0, ptLane.w, ptLane.h);
        if (els.ptLaneWrap) els.ptLaneWrap.classList.add('hidden');
        hidePracticeReview();
        setPtStatus('');
        // 待機表示のときはボタン文言を実施履歴(ptHasRun)に合わせて毎回そろえる（v0.9.85）
        if (els.ptBtn) els.ptBtn.textContent = ptIdleBtnLabel();
    }
}

/* ステップ現在地：「ステップ X / N」＋ドット。WIZARD_STEPS の並びから算出。 */
const WIZARD_STEP_LABELS = {
    input: '入力タイプ', hptype: 'イヤホン種類', stroke: 'ストローク', test: 'マイク反応テスト',
    correction: '補正', btdelay: 'マイク遅れ補正', practice: '最終確認テスト', final: '手動設定・保存',
};
/* ステップ見出し（correction は入力タイプで意味が変わるので動的に出す・v0.9.89） */
function wizardStepLabel(id) {
    if (id === 'correction') return isHeadphoneInput() ? 'イヤホン音ズレ補正' : 'マイクの遅れ補正';
    return WIZARD_STEP_LABELS[id] || '';
}
function renderStepProgress(active) {
    const wrap = els.settingsStepsProgress;
    if (!wrap) return;
    // 「手動設定・保存（final）」はテスト手順ではなく後から開ける調整ページなので、
    // ステップ数・ドットには含めない。最終確認テストが各フローの最終ステップ（v0.9.90）。
    const steps = wizardSteps().filter((id) => id !== 'final');
    const total = steps.length;
    let idx = steps.indexOf(active);
    let label;
    if (idx < 0) {
        // final（手動設定・保存）を開いている：テストは全て完了として全ドット点灯。
        idx = total;
        label = '';
    } else {
        label = wizardStepLabel(active);
    }
    let dots = '';
    for (let i = 0; i < total; i++) {
        const color = i < idx ? '#ff9f1c' : (i === idx ? '#ff9f1c' : 'rgba(255,255,255,0.25)');
        const ring = i === idx ? 'box-shadow:0 0 0 2px rgba(255,159,28,0.35);' : '';
        const fill = i <= idx ? color : 'transparent';
        dots += '<span style="width:9px;height:9px;border-radius:50%;border:1px solid ' + color + ';background:' + fill + ';' + ring + '"></span>';
    }
    const shownIdx = Math.min(idx + 1, total); // final（idx=total）でも「N / N」に収める
    wrap.style.display = '';
    wrap.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">'
        + '<span style="font-size:0.82rem;opacity:0.8;">ステップ ' + shownIdx + ' / ' + total + (label ? '：' + escapeHtml(label) : '') + '</span>'
        + '<span style="display:flex;gap:6px;align-items:center;">' + dots + '</span>'
        + '</div>';
}

/* 完了ステップの要約チップ（タップで選び直し）。アクティブより前の完了分だけ並べる。 */
function renderStepSummaries(active) {
    const wrap = els.settingsStepsSummary;
    if (!wrap) return;
    const rows = [];
    for (const id of wizardSteps()) {
        if (id === active) break;
        if (!wizardStepComplete(id)) continue;
        rows.push({ id, text: wizardStepSummary(id) });
    }
    if (!rows.length) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
    wrap.style.display = '';
    const rowStyle = 'display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;'
        + 'padding:12px 14px;margin-bottom:10px;border:1px solid rgba(110,210,140,0.28);border-radius:12px;'
        + 'background:rgba(110,210,140,0.07);color:inherit;font-size:0.9rem;cursor:pointer;';
    const checkChip = 'flex:none;color:#6ed28c;font-weight:700;font-size:0.95rem;line-height:1;';
    const editChip = 'flex:none;white-space:nowrap;font-size:0.78rem;padding:6px 14px;border-radius:8px;'
        + 'border:1px solid rgba(255,255,255,0.35);background:rgba(255,255,255,0.06);';
    wrap.innerHTML = rows.map((r) =>
        '<button type="button" class="step-summary-row" data-step="' + r.id + '" style="' + rowStyle + '">'
        + '<span style="' + checkChip + '" aria-hidden="true">✓</span>'
        + '<span style="flex:1;min-width:0;">' + escapeHtml(r.text) + '</span>'
        + '<span style="' + editChip + '">変更</span>'
        + '</button>'
    ).join('');
    wrap.querySelectorAll('.step-summary-row').forEach((b) => {
        b.addEventListener('click', () => editWizardStep(b.getAttribute('data-step')));
    });
}

/* 要約タップ：そのステップをもう一度開く（下流は選び直し時にリセットされる） */
function editWizardStep(id) {
    wizardEditing = id;
    renderSettingsView();
    const card = wizardStepCards(id)[0];
    scrollToSettingsEl(card);
}

/* 実践テスト結果を初期状態へ戻す（v0.9.67）。
   補正の適用・実践テストに影響する設定変更のたびに呼び、古い結果を残さない。
   ・進行中の実践テストを停止
   ・前回の結果カードを消す
   ・「実践テストを開始」できる状態・完了ボタン無効へ戻す
   note を渡すと、前回結果があったときだけ案内文を表示する。 */
function invalidatePracticeResult(note) {
    if (pt.active || pt.timers.length) stopPracticeTest();
    if (els.ptResult) { els.ptResult.classList.add('hidden'); els.ptResult.innerHTML = ''; }
    setupProgress.practiceDone = false;
    setupProgress.manualForced = false;
    practiceResultOk = false;
    if (els.ptStatus) els.ptStatus.textContent = note || '';
    updateDoneButtonState();
}

/* 補正系を完了として次のステップへ（適用 / スキップ / 進む 共通）。
   Bluetoothイヤホン時は「マイク遅れ補正」ステップへ、それ以外は最終確認テストへ。 */
function completeCorrectionStep() {
    // イヤホン音ズレ補正テスト中に「この音ズレ設定で進む」を押したら、
    // クリック音・丸点灯ループ・残りタイマーを必ず止める（v0.9.87）。
    if (hpCal.active || hpCal.timer || hpCal.lightTimers.length) stopHeadphoneCal();
    // v0.9.117：進んだら段階表示を初期（説明＋開始＋BPMのみ）へ戻す（停止済みで stop を呼ばない場合も確実に畳む）
    if (els.hpCalStaged) els.hpCalStaged.classList.add('hidden');
    if (els.hpCalLaneWrap) els.hpCalLaneWrap.classList.add('hidden');
    setupProgress.correctionDone = true;
    // 補正を変更した時点で前回の最終確認テスト結果は古くなる → 初期化して再確認を促す
    invalidatePracticeResult('補正を反映しました。もう一度最終確認テストで確認してください。');
    wizardEditing = null;
    if (settingsView === 'steps') {
        renderSettingsView();
        scrollToSettingsEl(isBluetoothHeadphone() ? els.btCalCard : els.ptCard);
    }
}

function setSettingsView(v) {
    settingsView = v;
    if (v === 'summary') renderSettingsSummary();
    if (v === 'chooser') renderPresetList();
    if (v === 'simple') resetSimpleView();
    // 「現在の設定を適用しました」メッセージは、別ビューへ移ったら消す（v0.9.80）
    if (v !== 'chooser' && els.chooserAppliedMsg) els.chooserAppliedMsg.classList.add('hidden');
    renderSettingsView();
}

/* マイク設定の「今回テスト」用の表示状態だけを未実施へ戻す（保存値は変えない）。
   ・済み表示（マイク反応テスト/遅れ補正）
   ・前回のおすすめ/結果カード・実践テスト結果
   ・進行中のテスト（反応テスト/補正/イヤホン補正/実践テスト）を停止 */
/* テスト実施履歴（UIの「もう1度／もう一度テストする」表示）だけをリセットして、
   各テストボタンを未実施文言に戻す（v0.9.82）。設定値そのものは変更しない。
   新しい設定フローを始めるタイミング（詳細テスト開始/簡易設定の選び直し/プリセット呼び出し/設定を開き直し 等）で使う。
   ・最終確認テスト：最終確認テストを開始
   ・Bluetooth用マイク遅れ補正：マイク遅れ補正テストを開始
   ・マイク反応テスト：テストを開始
   ・マイクの遅れ補正：テストを開始
   ※イヤホン音ズレ補正の待機文言は常に「補正テスト開始」で履歴を持たない。 */
function resetTestRunHistory() {
    ptHasRun = false;
    bt.hasRun = false;
    state.micTestDone = false;
    state.micDelayDone = false;
    updateMicTestDoneUI();
    updateMicDelayDoneUI();
    renderBtCalIdle();
    // 最終確認テストのボタン文言も未実施へ戻す（v0.9.85）。
    // ptHasRun を false にしても、ボタン文言は stop/end 時にしか更新されないため、ここで明示的に揃える。
    if (els.ptBtn && !pt.active) els.ptBtn.textContent = ptIdleBtnLabel();
}

function resetSetupFlowDisplay() {
    if (test.flow) abortMicTest();
    if (cal.active) cancelCalibration();
    if (hpCal.active) stopHeadphoneCal();
    stopPracticeTest();
    // 前回のおすすめ値を破棄（古い適用・表示を防ぐ）
    test.recommended = null;
    test.recoClickVolume = null;
    // 済みフラグを未実施へ（保存値threshold等はそのまま）
    state.micTestDone = false;
    state.micDelayDone = false;
    state.micSetupPrompted = false;
    // 今回フローの下流進捗もリセット（上流変更時に補正系/実践/手動を隠す）
    setupProgress.recoApplied = false;
    setupProgress.correctionDone = false;
    setupProgress.practiceDone = false;
    setupProgress.btDelayDone = false;
    setupProgress.manualForced = false;
    practiceResultOk = false;
    ptHasRun = false; // 今回フローのやり直し：最終確認テストの実施履歴もリセット（v0.9.80）
    bt.hasRun = false; // マイク遅れ補正の実施履歴もリセット
    stopBtCal();
    saveSettings();
    // 表示クリア
    if (els.testReco) els.testReco.classList.add('hidden');
    setTestResult('', ''); setTestPhase('');
    if (els.ptResult) els.ptResult.classList.add('hidden');
    if (els.ptStatus) els.ptStatus.textContent = '';
    if (els.calResult) els.calResult.classList.add('hidden');
    updateMicTestDoneUI();
    updateMicDelayDoneUI();
}

/* 「もう一度テストする」/「設定をやり直す」：表示状態をリセットして入力タイプから開始。
   jumpToTest=true（結果画面からの再テスト導線）なら、入力/種類/モードは選択済み扱いにして
   マイク反応テストまで一気に表示する（結果だけリセット）。 */
function startRetestFlow(jumpToTest) {
    resetSetupFlowDisplay();
    setupProgress = freshSetupProgress();
    wizardEditing = null;
    if (jumpToTest) {
        setupProgress.inputChosen = true;
        setupProgress.hpChosen = true;
        setupProgress.strokeChosen = true;
    }
    settingsView = 'steps';
    renderSettingsView();
    const target = jumpToTest ? els.testCard : els.inputTypeCard;
    scrollToSettingsEl(target);
}

function scrollToSettingsEl(el, block, delayMs) {
    if (!el || !el.scrollIntoView) return;
    // v0.9.106：カードを表示に切り替えた直後（特にBluetoothは手順が増えてレイアウトが大きく変わる）は、
    // 1フレームだとレイアウト確定前にスクロール位置が計算され、初回だけ目的のカードまで届かないことがある。
    // 2フレーム待ってから（＝表示後の確定レイアウトに対して）スクロールする。
    // v0.9.107：delayMs を渡すと、その分待ってから 2フレーム→スクロールする。
    //   ステップを連続で切り替えた直後（前のスムーススクロールが進行中／表示直後でレイアウト未確定）に、
    //   iPhone Safari等で初回スクロールが無視される対策。delayMs 未指定なら従来どおり（他カードの挙動は不変）。
    const go = () => requestAnimationFrame(() => requestAnimationFrame(() => {
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: block || 'start' });
    }));
    if (delayMs && delayMs > 0) setTimeout(go, delayMs); else go();
}

/* 設定画面の実スクロール親はウィンドウ（document）。.app-container 等に overflow は無く、
   body が 100dvh で document 全体がスクロールする。固定ナビ(app-nav)があるぶん上に余白を空ける。
   v0.9.109：scrollIntoView({behavior:'smooth'}) は、初回ロード直後（レイアウト未確定・Webフォント
   読込中・iPhoneのアドレスバー収納でビューポート高が変わる）と相性が悪く、初回だけ無視されることがある。
   そこで対象の絶対Y座標をその都度計算し、window.scrollTo で直接動かす（方針B）。 */
function hardScrollWindowToEl(el, marginTop, phase) {
    if (!el || !el.getBoundingClientRect) return;
    const mTop = (marginTop == null ? 96 : marginTop);       // 固定ナビ分の上余白＝スクロール後に期待する rect.top
    const beforeY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const targetTop = el.getBoundingClientRect().top;        // 現在のビューポート上端からの相対位置
    const targetAbsY = targetTop + beforeY;                  // ドキュメント上端からの絶対位置
    const top = Math.max(0, targetAbsY - mTop);
    // DEBUG：スクロール処理自体は v0.9.112 と同じ（1回直接スクロール）。値の取得だけ before/after/after300 で行う。
    const snapshot = (sub) => {
        if (!MIC_SCROLL_DEBUG) return;
        const y = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const r = el.getBoundingClientRect();
        const vv = window.visualViewport;
        const ae = document.activeElement;
        let cs = null; try { cs = window.getComputedStyle(el); } catch (_) { /* ignore */ }
        updateMicScrollDebug({
            phaseSub: sub, context: phase || 'scroll',
            beforeY, afterY: y,
            rectTop: r.top, rectBottom: r.bottom, targetAbsY,
            expectedTop: mTop, actualTopAfter: r.top, delta: r.top - mTop,
            docH: document.documentElement.scrollHeight,
            bodyH: document.body ? document.body.scrollHeight : NaN,
            innerH: window.innerHeight,
            vvHeight: vv ? vv.height : window.innerHeight,
            vvOffsetTop: vv ? vv.offsetTop : 0,
            vvScale: vv ? vv.scale : 1,
            isTargetVisible: (r.top < (vv ? vv.height : window.innerHeight)) && (r.bottom > 0),
            targetId: el.id ? '#' + el.id : '(el)',
            targetHidden: (el.classList ? el.classList.contains('hidden') : '-'),
            targetDisplay: cs ? cs.display : '-',
            targetHeight: el.offsetHeight,
            scrollMarginTop: cs ? cs.scrollMarginTop : '-',
            activeEl: ae ? (ae.tagName + (ae.id ? '#' + ae.id : '')) : '-',
            view: (typeof settingsView !== 'undefined') ? settingsView : '-',
            step: (typeof activeWizardStep === 'function') ? activeWizardStep() : '-',
            sinceLoad: performance.now(),
            method: 'window.scrollTo',
        });
    };
    snapshot('before');                                      // スクロール命令の直前
    try { window.scrollTo({ top, behavior: 'smooth' }); }
    catch (_) { window.scrollTo(0, top); }
    snapshot('after');                                       // 命令の直後（smoothは動き始め）
    if (MIC_SCROLL_DEBUG) setTimeout(() => snapshot('after300'), 300); // 300ms後の実値（smooth/viewport確定後）
}

/* マイク反応テストカードへの「初回スクロール」専用（v0.9.108→v0.9.110）。
   v0.9.109の複数回スクロール（160ms/480ms/fonts.ready）は、実機でガタつく原因になっていた可能性が
   高いので撤回。発想を「1回だけ直接スクロール」に戻す（案1）。レイアウト確定のため2フレーム待ってから、
   window.scrollTo で絶対Y座標へ1回だけスクロールする。原因の事実確認は MIC_SCROLL_DEBUG で行う。 */
function scrollToMicTestCard() {
    if (!els.testCard) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        hardScrollWindowToEl(els.testCard, 96, 'mic-test-initial');
    }));
}

/* ── 選択ハンドラ（選んだら自動で次の項目を出す。上流変更時は下流結果をリセット）── */
/* イヤホン（有線/Bluetooth）を選んだら、以降のテストのクリック音量を50%に初期化する（v0.9.88）。
   通常マイクは対象外（既存のクリック音量設定を維持）。 */
function applyEarphoneClickVolumeDefault() {
    state.clickVolume = EARPHONE_CLICK_VOLUME;
    if (els.setClickVol) els.setClickVol.value = state.clickVolume;
    if (els.setClickVolVal) els.setClickVolVal.textContent = state.clickVolume + '％';
    saveSettings();
}

function onPickInputType(type) {
    const next = (type === 'headphone') ? 'headphone' : 'normal';
    const changed = (getMicInputType() !== next);
    setMicInputType(next);
    setupProgress.inputChosen = true;
    // イヤホン接続を選んだら、以降のテストのクリック音量を50%にする（v0.9.88）。
    if (next === 'headphone') applyEarphoneClickVolumeDefault();
    wizardEditing = null;
    if (changed) {
        // 入力タイプを選び直したら、イヤホン種類・ストローク以降を未完了へ（下流結果も消す）
        setupProgress.hpChosen = false;
        setupProgress.strokeChosen = false;
        if (settingsView === 'steps') resetSetupFlowDisplay();
    }
    if (settingsView === 'steps') {
        renderSettingsView();
        scrollToSettingsEl(next === 'headphone' ? els.hpTypeCard : els.strokeModeCard);
    }
}

function onPickHeadphoneType(type) {
    const next = (type === 'bluetooth') ? 'bluetooth' : 'wired';
    const changed = (getHeadphoneType() !== next);
    // v0.9.87：詳細テストで種類を新しく選び直すときは、その種類の基本値(0ms)から始める。
    // 過去のBluetooth 180msや互換用 headphoneOutputOffsetMs が有線側へ混ざるのを防ぐ。
    setHeadphoneType(next, { resetDefault: true });
    setupProgress.hpChosen = true;
    // イヤホン種類（有線/Bluetooth）を選んだら、クリック音量を50%に初期化する（v0.9.88）。
    applyEarphoneClickVolumeDefault();
    wizardEditing = null;
    if (settingsView === 'steps') {
        if (changed) resetSetupFlowDisplay();
        renderSettingsView();
        scrollToSettingsEl(els.strokeModeCard);
    }
}

function onPickStrokeMode(mode) {
    const next = (mode === 'chord') ? 'chord' : 'brush';
    const changed = (state.strokeDetectMode !== next);
    setStrokeDetectMode(next);
    setupProgress.strokeChosen = true;
    wizardEditing = null;
    if (settingsView === 'steps') {
        if (changed) resetSetupFlowDisplay();
        renderSettingsView();
        // v0.9.107→v0.9.108：マイク反応テストカードへ入る初回スクロール対策。ページ更新直後の初回フローでも
        // 確実に届くよう、複数回（遅延＋フォント確定後）スクロールを試みる専用関数を使う。
        scrollToMicTestCard();
    }
}

function renderSettingsSummary() {
    if (!els.settingsSummaryList) return;
    const t = getMicInputType();
    const row = (k, v) => '<div class="cal-result-row"><span>' + k + '</span><b>' + v + '</b></div>';
    const typeLabel = { normal: '通常マイク', headphone: 'イヤホン接続' }[t] || '通常マイク';
    const rows = [];
    rows.push(row('入力タイプ', typeLabel));
    if (t === 'headphone') {
        rows.push(row('イヤホン種類', getHeadphoneType() === 'bluetooth' ? 'Bluetoothイヤホン' : '有線イヤホン'));
    }
    rows.push(row('ストローク検出モード', state.strokeDetectMode === 'chord' ? 'コードストローク' : 'ブラッシング'));
    rows.push(row('反応ライン（感度）', sensFromThresholdUI(mic.threshold) + '％'));
    rows.push(row('二重反応防止', mic.cooldownMs + 'ms'));
    rows.push(row('クリック音量', state.clickVolume + '％'));
    if (t === 'headphone') {
        rows.push(row('イヤホン音ズレ補正', mic.headphoneOutputOffsetMs + 'ms'));
        if (getHeadphoneType() === 'bluetooth') {
            const bo = mic.bluetoothMicOffsetMs || 0;
            rows.push(row('マイク遅れ補正', (bo > 0 ? '+' : '') + bo + 'ms'));
        }
    } else {
        const off = mic.timingOffsetMs;
        rows.push(row('マイクの遅れ補正', (off > 0 ? '+' : '') + off + 'ms'));
    }
    rows.push(row('低入力プロファイル', mic.lowInputProfile ? 'あり' : 'なし'));
    rows.push(row('マイク反応テスト', state.micTestDone ? '実施済み' : '未実施'));
    if (t !== 'headphone') rows.push(row('マイクの遅れ補正テスト', state.micDelayDone ? '実施済み' : '未実施'));
    els.settingsSummaryList.innerHTML = rows.join('');
}

/* ── マイク設定プリセット（名前をつけて保存／呼び出し）v0.9.61 ────────
   localStorage(MIC_PRESETS_KEY) に「マイク設定に関係する値だけ」を保存する。
   STAGEスコアやテスト履歴は保存しない。STAGE判定・マイク判定への新たな反映もしない。 */
function loadPresets() {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(MIC_PRESETS_KEY)) || []; } catch (_) { arr = []; }
    return Array.isArray(arr) ? arr : [];
}
function savePresets(arr) {
    try { localStorage.setItem(MIC_PRESETS_KEY, JSON.stringify(arr)); } catch (_) { /* プライベートモード等は無視 */ }
}

/* 現在のマイク設定値をプリセット用に取り出す */
function currentMicPresetSettings() {
    return {
        inputType: mic.inputType,
        headphoneType: mic.headphoneType,
        strokeDetectMode: state.strokeDetectMode,
        threshold: mic.threshold,
        cooldownMs: mic.cooldownMs,
        clickVolume: state.clickVolume,
        timingOffsetMs: mic.timingOffsetMs,
        bluetoothMicOffsetMs: mic.bluetoothMicOffsetMs,
        lowInputProfile: !!mic.lowInputProfile,
        headphoneOffsetWiredMs: mic.headphoneOffsetWiredMs,
        headphoneOffsetBluetoothMs: mic.headphoneOffsetBluetoothMs,
        headphoneOutputOffsetMs: mic.headphoneOutputOffsetMs,
        clickGuardMs: mic.clickGuardMs,
    };
}

function setPresetSaveMsg(t) { if (els.presetModalMsg) els.presetModalMsg.textContent = t || ''; }

/* 組み込み＋ユーザー保存を結合した一覧（組み込みが先頭）。 */
function allPresets() {
    return BUILTIN_MIC_PRESETS.concat(loadPresets());
}

/* 組み込みプリセットと同じ名前か（組み込みは上書き・リネーム不可）。 */
function isBuiltinPresetName(name) {
    const n = (name || '').trim();
    return BUILTIN_MIC_PRESETS.some((p) => p.name === n);
}

/* 共通の保存処理。name と完了メッセージの出し先を受け取り、ユーザープリセットとして保存。
   ・組み込みと同名は不可
   ・同名のユーザープリセットがある場合は confirm で上書き確認（OKで更新／キャンセルで保存しない） */
function savePresetWithName(name, setMsg, clearInput) {
    name = (name || '').trim();
    if (!name) { if (setMsg) setMsg('プリセット名を入力してください。'); return false; }
    if (isBuiltinPresetName(name)) {
        if (setMsg) setMsg('標準プリセットと同じ名前は使えません。別の名前を入力してください。');
        return false;
    }
    const now = Date.now();
    const arr = loadPresets();
    const existing = arr.find((p) => p && p.name === name);
    if (existing) {
        const ok = window.confirm('「' + name + '」は既にあります。上書き保存しますか？\n（キャンセルすると保存しません。残したい場合は別の名前にしてください）');
        if (!ok) { if (setMsg) setMsg('上書きをキャンセルしました。別の名前でも保存できます。'); return false; }
        existing.settings = currentMicPresetSettings();
        existing.updatedAt = now;
        savePresets(arr);
        if (clearInput) clearInput();
        if (setMsg) setMsg('上書き保存しました');
        renderPresetList();
        return true;
    }
    arr.push({
        id: 'preset_' + now + '_' + Math.random().toString(36).slice(2, 7),
        name: name,
        createdAt: now,
        updatedAt: now,
        settings: currentMicPresetSettings(),
    });
    savePresets(arr);
    if (clearInput) clearInput();
    if (setMsg) setMsg('保存しました');
    renderPresetList();
    return true;
}

/* ユーザープリセットの名前変更（v0.9.67）。prompt 実装。組み込みは対象外。 */
function renamePreset(id) {
    const arr = loadPresets();
    const p = arr.find((x) => x && x.id === id);
    if (!p) return;
    const input = window.prompt('新しいプリセット名を入力してください。', p.name);
    if (input === null) return; // キャンセル
    const name = input.trim();
    if (!name) { setPresetSaveMsg('プリセット名を入力してください。'); return; }
    if (isBuiltinPresetName(name)) { setPresetSaveMsg('標準プリセットと同じ名前は使えません。別の名前にしてください。'); return; }
    if (arr.some((x) => x && x.id !== id && x.name === name)) {
        setPresetSaveMsg('同じ名前のプリセットがあります。別の名前にしてください。');
        return;
    }
    p.name = name;
    p.updatedAt = Date.now();
    savePresets(arr);
    setPresetSaveMsg('名前を変更しました');
    renderPresetList();
}

/* ユーザープリセットの並び替え（v0.9.67）。dir<0で上へ、dir>0で下へ。組み込みは常に上部固定。 */
function movePreset(id, dir) {
    const arr = loadPresets();
    const i = arr.findIndex((x) => x && x.id === id);
    if (i < 0) return;
    const j = i + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= arr.length) return;
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    savePresets(arr);
    renderPresetList();
}

/* 「現在の設定を見る」/「手動設定」から手動設定＋保存カードへ移動する補助ビュー */
function openManualView(scrollTarget) {
    settingsView = 'manual';
    // 「キャンセル」で戻せるよう、開いた時点の設定値を控える（v0.9.89）。
    captureManualSnapshot();
    // 「手動設定を開く」ので、折りたたみは開いた状態で全項目を見せる（v0.9.69）。
    if (els.manualDetail && !els.manualDetail.open) { els.manualDetail.open = true; fitPreview(); }
    renderSettingsView();
    scrollToSettingsEl(scrollTarget || els.manualCard);
}

/* 手動設定の「この設定を使う」（v0.9.89更新）：いまの設定値を現在の設定として確定保存し、
   マイク設定画面を閉じてアプリ全体のTOPページへ戻る。プリセットには保存しない。 */
function useManualSettings() {
    saveSettings(); // いまの mic.* / state.* を現在設定として保存（プリセット化はしない）
    clearManualSnapshot(); // 変更を確定したのでスナップショットは破棄
    closeSettings();        // アプリ全体のTOPページへ戻る
}

/* ── 手動設定のキャンセル用スナップショット（v0.9.89）──────────────────
   手動設定ページを開いた時点の設定値を控えておき、「キャンセル」で元に戻す。 */
let manualSettingsSnapshot = null;
function captureManualSnapshot() {
    // 手動編集を始める前の状態を保持（すでに保持済みなら上書きしない）。
    if (!manualSettingsSnapshot) manualSettingsSnapshot = currentMicPresetSettings();
}
function clearManualSnapshot() { manualSettingsSnapshot = null; }

/* スナップショットの設定値を現在の mic.* / state.* へ書き戻す。 */
function restoreMicSettingsFrom(s) {
    if (!s) return;
    mic.inputType = (s.inputType === 'headphone') ? 'headphone' : 'normal';
    mic.headphoneType = (s.headphoneType === 'bluetooth') ? 'bluetooth' : 'wired';
    state.strokeDetectMode = (s.strokeDetectMode === 'chord') ? 'chord' : 'brush';
    mic.threshold = s.threshold;
    mic.cooldownMs = s.cooldownMs;
    state.clickVolume = s.clickVolume;
    mic.timingOffsetMs = s.timingOffsetMs;
    mic.bluetoothMicOffsetMs = s.bluetoothMicOffsetMs;
    mic.lowInputProfile = !!s.lowInputProfile;
    mic.headphoneOffsetWiredMs = s.headphoneOffsetWiredMs;
    mic.headphoneOffsetBluetoothMs = s.headphoneOffsetBluetoothMs;
    mic.headphoneOutputOffsetMs = s.headphoneOutputOffsetMs;
    if (typeof s.clickGuardMs === 'number') mic.clickGuardMs = s.clickGuardMs;
}

/* 手動設定の「キャンセル」（v0.9.89）：手動設定ページで変更した内容を破棄して、
   マイク設定TOP（chooser）へ戻る。 */
function cancelManualSettings() {
    if (manualSettingsSnapshot) {
        restoreMicSettingsFrom(manualSettingsSnapshot);
        applySettingsToUI();
        drawMicPreview();
        saveSettings();
    }
    clearManualSnapshot();
    setSettingsView('chooser');
}

/* ── プリセット保存モーダル（v0.9.80）──────────────────────────────
   手動設定／最終確認テスト結果／現在の設定を見る、すべての「この設定を保存」を
   この共通モーダルから行う。保存処理は既存の savePresetWithName を流用。 */
function openPresetModal(mode) {
    if (!els.presetModal) return;
    presetModalMode = (mode === 'tap') ? 'tap' : 'mic'; // 保存先を明示（v0.9.97）
    setPresetSaveMsg('');
    if (els.presetModalInput) els.presetModalInput.value = '';
    els.presetModal.classList.remove('hidden');
    requestAnimationFrame(() => { if (els.presetModalInput) { try { els.presetModalInput.focus(); } catch (_) { /* focus不可は無視 */ } } });
}
function closePresetModal() {
    if (els.presetModal) els.presetModal.classList.add('hidden');
}
function savePresetFromModal() {
    const name = els.presetModalInput ? els.presetModalInput.value : '';
    const clearInput = () => { if (els.presetModalInput) els.presetModalInput.value = ''; };
    // 画面タップ設定からの保存は、マイク設定プリセットとは別のタップ用プリセットへ（v0.9.97）
    const ok = (presetModalMode === 'tap')
        ? saveTapPresetWithName(name, setPresetSaveMsg, clearInput)
        : savePresetWithName(name, setPresetSaveMsg, clearInput);
    if (ok) {
        // 成功：少し成功メッセージを見せてから閉じる
        if (presetModalMode === 'tap') setTimeout(() => { closePresetModal(); if (settingsTab === 'tap' && tapView === 'preset') renderTapPresetList(); }, 700);
        else setTimeout(closePresetModal, 700);
    }
}

/* プリセット適用：保存値を現在の設定へ反映。テスト済み扱いにはしない（実践テストで確認を促す）。 */
/* プリセットの「値の反映＋進捗フラグ」だけを行う共通処理（画面遷移はしない）。
   適用できたら preset を返し、できなければ null。簡易設定／プリセット呼び出しの両方から使う。 */
function applyPresetCore(id) {
    const p = allPresets().find((x) => x && x.id === id);
    if (!p || !p.settings) return null;
    const s = p.settings;
    // 進行中のテスト類は止める（値だけ反映する）
    if (test.flow) abortMicTest();
    if (cal.active) cancelCalibration();
    if (hpCal.active) stopHeadphoneCal();
    stopPracticeTest();
    stopBtCal();
    // 値の反映（不正値は現在値/目安にフォールバック）
    mic.inputType = (s.inputType === 'headphone') ? 'headphone' : 'normal';
    mic.headphoneType = (s.headphoneType === 'bluetooth') ? 'bluetooth' : 'wired';
    state.strokeDetectMode = (s.strokeDetectMode === 'chord') ? 'chord' : 'brush';
    mic.threshold = clampNum(s.threshold, THR_MIN, THR_MAX, mic.threshold);
    mic.cooldownMs = clampNum(s.cooldownMs, 100, 400, mic.cooldownMs);
    state.clickVolume = clampNum(s.clickVolume, 0, 100, state.clickVolume);
    mic.timingOffsetMs = clampNum(s.timingOffsetMs, -150, 150, mic.timingOffsetMs);
    // Bluetooth用マイク遅れ補正：未保存（古いプリセット）は0=補正なし（v0.9.80）
    mic.bluetoothMicOffsetMs = clampNum(s.bluetoothMicOffsetMs, BT_MIC_OFFSET_MIN, BT_MIC_OFFSET_MAX, 0);
    mic.lowInputProfile = !!s.lowInputProfile;
    mic.headphoneOffsetWiredMs = validHpOffset(s.headphoneOffsetWiredMs, HP_TYPE_DEFAULT_OFFSET.wired);
    mic.headphoneOffsetBluetoothMs = validHpOffset(s.headphoneOffsetBluetoothMs, HP_TYPE_DEFAULT_OFFSET.bluetooth);
    // v0.9.87：互換用の単一値 headphoneOutputOffsetMs は種類別の現在値へ同期するだけ。
    // 古いBluetooth由来の180msなどが有線プリセットへ混ざらないよう、保存された単一値は使わない。
    mic.headphoneOutputOffsetMs = currentHpTypeOffset();
    if (typeof s.clickGuardMs === 'number') mic.clickGuardMs = s.clickGuardMs;
    // UI・保存へ反映（※マイク反応テスト済みフラグは立てない）
    applySettingsToUI();
    drawMicPreview();
    saveSettings();
    // プリセットは「設定値の呼び出し」。現環境での確認は実践テストに委ねる。
    setupProgress = freshSetupProgress();
    setupProgress.inputChosen = true;
    setupProgress.hpChosen = true;
    setupProgress.strokeChosen = true;
    setupProgress.recoApplied = true;   // 反応ライン等は呼び出し済み扱い
    setupProgress.correctionDone = true; // 補正値も呼び出し済み → 次へ進む
    setupProgress.btDelayDone = true;    // マイク遅れ補正値も呼び出し済み扱い（v0.9.80）
    practiceResultOk = false;            // 呼び出し直後は未確認（最終確認テストで確認）
    resetTestRunHistory();               // 新しい設定の呼び出し＝各テストは未実施文言に戻す（v0.9.82）
    wizardEditing = null;
    return p;
}

function applyPreset(id) {
    // テスト実行中/詳細テスト未完了でプリセット呼び出しに離脱する場合は中断確認（v0.9.91→v0.9.92）
    if (!confirmMicInterruptIfNeeded()) return;
    if (!applyPresetCore(id)) return;
    // プリセットは「保存済み設定の呼び出し」。呼び出したら現在設定として保存し、
    // マイク設定画面を閉じてアプリ全体のTOPページへ戻す（v0.9.89）。
    // 詳細テストや最終確認テストへは飛ばさない。
    saveSettings();
    clearManualSnapshot();
    closeSettings();
}

/* ── 簡易設定（v0.9.71）：環境を選ぶだけで標準プリセットを適用 ───────────── */
/* 簡易設定ビューを「環境選択」状態に戻す（結果は隠す）。 */
function resetSimpleView() {
    if (els.simpleChoices) els.simpleChoices.classList.remove('hidden');
    if (els.simpleResult) els.simpleResult.classList.add('hidden');
    if (els.simpleResultMsg) els.simpleResultMsg.textContent = '';
    renderSimplePresetChoices(); // 保存済みプリセットを選択肢として描画（v0.9.89）
    // 簡易設定をやり直す＝新しい設定フロー → 各テストの実施履歴をリセット（v0.9.82）
    resetTestRunHistory();
}

/* 簡易設定の選択肢として、ユーザー保存プリセットを表示する（v0.9.89）。
   組み込み3種（通常マイク/有線/Bluetooth）は静的に表示済みなので、ここではユーザー保存分だけ。
   選ぶと、そのプリセットを適用してアプリ全体のTOPページへ戻る（applyPreset と同じ動き）。 */
function renderSimplePresetChoices() {
    const wrap = els.simplePresetChoices;
    if (!wrap) return;
    const users = loadPresets();
    if (!users.length) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    let html = '<p class="setting-note simple-preset-head" style="margin:14px 0 0;font-weight:700;opacity:0.85;">保存済みプリセット</p>';
    html += users.map((p) =>
        '<button type="button" class="simple-choice simple-preset-choice" data-id="' + p.id + '">'
        + '<span class="simple-choice-title">' + escapeHtml(p.name) + '</span></button>'
    ).join('');
    wrap.innerHTML = html;
    wrap.querySelectorAll('.simple-preset-choice').forEach((b) => {
        b.addEventListener('click', () => applyPreset(b.getAttribute('data-id')));
    });
}

/* 環境を選択 → 対応する標準プリセットを適用し、結果（実践テスト/完了の導線）を出す。 */
function applySimpleSetup(presetId, label) {
    // テスト実行中/詳細テスト未完了で簡易設定の環境選択に切り替える場合は中断確認（v0.9.91→v0.9.92）
    if (!confirmMicInterruptIfNeeded()) return;
    if (!applyPresetCore(presetId)) return;
    // applyPresetCore 内で各テストの実施履歴はリセット済み（v0.9.82）
    // 適用しただけでは settingsView は 'simple' のまま（結果カードを同じ画面に出す）
    if (els.simpleChoices) els.simpleChoices.classList.add('hidden');
    if (els.simpleResult) els.simpleResult.classList.remove('hidden');
    if (els.simpleResultMsg) els.simpleResultMsg.textContent = (label || '選んだ環境') + '用の設定を適用しました。';
    updateDoneButtonState(); // 'simple' は完了ロックなし → 「完了」も使える
    scrollToSettingsEl(els.simpleResult || els.settingsSimpleCard);
}

/* 簡易設定の「実践テストで確認する」：実践テストステップを開いてテスト開始。 */
function simpleGoPractice() {
    wizardEditing = null;
    settingsView = 'steps';
    renderSettingsView();
    scrollToSettingsEl(els.ptCard);
    startPracticeTest();
}

/* プリセット削除（個別）。組み込みは消せない。リセット系でも消さない。 */
function deletePreset(id) {
    const arr = loadPresets().filter((x) => x && x.id !== id);
    savePresets(arr);
    renderPresetList();
}

/* 保存済みプリセット一覧を描画（v0.9.67）。
   ・組み込み3種：常に上部固定。呼び出しのみ（削除・リネーム・並び替え不可）
   ・ユーザー保存：呼び出し／名前変更／↑↓並び替え／削除。先頭は↑無効・末尾は↓無効 */
function renderPresetList() {
    if (!els.presetList) return;
    const users = loadPresets();
    const rowStyle = 'display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:9px 10px;margin-bottom:8px;'
        + 'border:1px solid rgba(255,255,255,0.14);border-radius:10px;background:rgba(255,255,255,0.05);';
    const nameStyle = 'flex:1 1 100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;';
    const applyStyle = 'flex:none;padding:8px 14px;border-radius:8px;border:1px solid rgba(255,160,60,0.85);'
        + 'background:rgba(255,160,60,0.2);color:inherit;font-size:0.85rem;font-weight:700;cursor:pointer;';
    const miniStyle = 'flex:none;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.3);'
        + 'background:rgba(255,255,255,0.04);color:inherit;font-size:0.8rem;cursor:pointer;';
    const miniDisabled = miniStyle + 'opacity:0.3;cursor:default;';
    const delStyle = 'flex:none;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,120,120,0.45);'
        + 'background:rgba(255,120,120,0.08);color:inherit;font-size:0.8rem;cursor:pointer;';

    // 組み込み3種（通常マイク/有線イヤホン/Bluetoothイヤホン）は横並びボタン（v0.9.103）。押すだけで呼び出し。
    // v0.9.105：「Bluetoothイヤホン」は横幅に収まりにくいので Bluetooth / イヤホン の2行表示にする（表示のみ）。
    let html = '<div class="preset-builtin-row">' + BUILTIN_MIC_PRESETS.map((p) =>
        '<button type="button" class="preset-builtin-btn preset-apply-btn" data-id="' + p.id + '">' + micPresetBtnLabel(p) + '</button>'
    ).join('') + '</div>';
    // 組み込みプリセットの説明（折りたたみ・v0.9.103）
    html += '<details class="card-help preset-help"><summary>詳しい説明</summary>'
        + '<p class="setting-note" style="margin-top:8px;">これは一般的な数値を元にした簡易的なプリセットです。環境によって合わない場合は、補正テストで調整してください。</p></details>';

    html += users.map((p, k) => {
        const upDis = (k === 0);
        const downDis = (k === users.length - 1);
        return '<div style="' + rowStyle + '">' +
            '<span style="' + nameStyle + '">' + escapeHtml(p.name) + '</span>' +
            '<button type="button" class="preset-up-btn" data-id="' + p.id + '" aria-label="上へ"' + (upDis ? ' disabled' : '') + ' style="' + (upDis ? miniDisabled : miniStyle) + '">↑</button>' +
            '<button type="button" class="preset-down-btn" data-id="' + p.id + '" aria-label="下へ"' + (downDis ? ' disabled' : '') + ' style="' + (downDis ? miniDisabled : miniStyle) + '">↓</button>' +
            '<button type="button" class="preset-apply-btn" data-id="' + p.id + '" style="' + applyStyle + '">適用</button>' +
            '<button type="button" class="preset-rename-btn" data-id="' + p.id + '" style="' + miniStyle + '">名前変更</button>' +
            '<button type="button" class="preset-del-btn" data-id="' + p.id + '" aria-label="削除" style="' + delStyle + '">削除</button>' +
            '</div>';
    }).join('');

    els.presetList.innerHTML = html;
    els.presetList.querySelectorAll('.preset-apply-btn').forEach((b) => {
        b.addEventListener('click', () => applyPreset(b.getAttribute('data-id')));
    });
    els.presetList.querySelectorAll('.preset-del-btn').forEach((b) => {
        b.addEventListener('click', () => deletePreset(b.getAttribute('data-id')));
    });
    els.presetList.querySelectorAll('.preset-rename-btn').forEach((b) => {
        b.addEventListener('click', () => renamePreset(b.getAttribute('data-id')));
    });
    els.presetList.querySelectorAll('.preset-up-btn').forEach((b) => {
        b.addEventListener('click', () => { if (!b.disabled) movePreset(b.getAttribute('data-id'), -1); });
    });
    els.presetList.querySelectorAll('.preset-down-btn').forEach((b) => {
        b.addEventListener('click', () => { if (!b.disabled) movePreset(b.getAttribute('data-id'), 1); });
    });
}

/* 「保存済みプリセット」ボタンで一覧を開閉 */
/* 組み込みマイクプリセットの横並びボタン表示ラベル（v0.9.105）。内部名は変えず表示のみ。
   「Bluetoothイヤホン」は Bluetooth / イヤホン の2行で表示する。 */
function micPresetBtnLabel(p) {
    if (!p) return '';
    if (p.id === 'builtin_bt') return 'Bluetooth<br>イヤホン';
    return escapeHtml(p.name);
}

/* マイク設定「保存済みプリセット」：専用ページへ移動して一覧を表示する（v0.9.104。画面タップ設定と同じ構造）。 */
function openMicPreset() {
    settingsView = 'preset';
    renderSettingsView();
    renderPresetList();
    scrollToSettingsEl(els.micPresetCard);
}

function openSettings(from) {
    settingsReturn = from || 'home';
    if (state.running) stop();
    applySettingsToUI();
    updateMicTestDoneUI();
    updateMicDelayDoneUI();
    if (els.micResetMsg) els.micResetMsg.classList.add('hidden');
    if (els.chooserAppliedMsg) els.chooserAppliedMsg.classList.add('hidden');
    resetTestRunHistory();         // 設定を開き直したら各テストの実施履歴を未実施文言へ戻す（v0.9.82）
    updateTestMicState();
    setTestResult('', '');         // 開始前は説明文を出さない
    setTestPhase('');
    if (els.testReco) els.testReco.classList.add('hidden');
    updateTestMicState();          // マイクOFFならメーター等を隠す
    if (mic.on) enterTestMode();   // マイクON中なら実音モニターを有効化
    setPresetSaveMsg('');          // 前回の「保存しました」を残さない
    setupProgress = freshSetupProgress(); // 開くたびに初期化
    settingsTab = 'mic';                   // 開くたびにマイク設定タブから（v0.9.95）
    tapView = 'home';
    wizardEditing = null;
    practiceResultOk = false;
    clearManualSnapshot(); // 設定を開き直したらキャンセル用スナップショットも初期化（v0.9.89）
    // プリセット一覧は初期は閉じておく（「保存済みプリセット」ボタンで展開）
    if (els.presetListWrap) els.presetListWrap.style.display = 'none';
    if (els.presetToggleBtn) els.presetToggleBtn.textContent = '保存済みプリセット';
    setSettingsView('chooser');    // 最初はメイン導線＋プリセットだけ見せる
    show('settings');
    requestAnimationFrame(fitPreview); // 表示後にサイズ確定→プレビュー描画
}

function closeSettings() {
    if (cal.active) cancelCalibration();
    if (hpCal.active) stopHeadphoneCal();
    stopPracticeTest();
    stopBtCal();
    stopTapCal();
    exitTestMode();
    show(settingsReturn);
    if (settingsReturn === 'practice') { fitLane(); }
}

function resetSettings() {
    mic.inputType = 'normal';
    mic.headphoneType = 'wired';
    mic.threshold = SETTINGS_DEFAULTS.threshold;
    mic.lowInputProfile = false; // 既定に戻すときは通常スケール表示へ
    mic.cooldownMs = SETTINGS_DEFAULTS.cooldownMs;
    mic.clickGuardMs = SETTINGS_DEFAULTS.clickGuardMs;
    mic.timingOffsetMs = SETTINGS_DEFAULTS.timingOffsetMs;
    mic.bluetoothMicOffsetMs = 0;
    mic.headphoneOffsetWiredMs = HP_TYPE_DEFAULT_OFFSET.wired;
    mic.headphoneOffsetBluetoothMs = HP_TYPE_DEFAULT_OFFSET.bluetooth;
    mic.headphoneOutputOffsetMs = HP_TYPE_DEFAULT_OFFSET.wired;
    state.strokeDetectMode = 'brush';
    state.clickVolume = SETTINGS_DEFAULTS.clickVolume;
    // マイク設定の進捗フラグもリセット（開発中の動作確認をしやすくするため）
    state.micTestDone = false;
    state.micDelayDone = false;
    state.micSetupPrompted = false;
    applySettingsToUI();
    updateMicTestDoneUI();
    updateMicDelayDoneUI();
    drawMicPreview();
    updateMicDiag();
    saveSettings();
}

/* ═══════════════════════════════════════════════════════════
   マイク判定 PoC
   ・getUserMedia → AnalyserNode で時間領域のピークを監視
   ・しきい値を下から上へ超えた瞬間（立ち上がり）を1ストロークとみなす
   ・クールダウン＋クリック音直後ガードで誤検出を抑制
   ・検出は registerHit(now, 'mic') で既存のタップ判定と同じ処理に流す
═══════════════════════════════════════════════════════════ */
function setClickEnabled(on) {
    state.clickEnabled = on;
    if (els.clickToggleBtn) {
        els.clickToggleBtn.textContent = 'クリック音：' + (on ? 'ON' : 'OFF');
        els.clickToggleBtn.classList.toggle('is-off', !on);
    }
}

function updateMicUI() {
    if (els.micState) {
        els.micState.textContent = mic.on ? '🎤 マイク ON' : '🎤 マイク OFF';
        els.micState.classList.toggle('on', mic.on);
    }
    if (els.micToggleBtn) {
        els.micToggleBtn.textContent = mic.on ? 'OFFにする' : 'ONにする';
        els.micToggleBtn.classList.toggle('is-on', mic.on);
    }
    if (els.micCard) els.micCard.classList.toggle('mic-active', mic.on);
}

function flashDetect(peak) {
    // STAGE画面のマイク診断UIは撤去済み。要素があるときだけ更新（設定の実音テストは別UI）
    const ratio = mic.threshold > 0 ? (peak / mic.threshold) : 0;
    if (els.micLastLevel) els.micLastLevel.textContent = peak.toFixed(2) + ' (×' + ratio.toFixed(1) + ')';
    if (els.micLastDetect) els.micLastDetect.textContent = '入力検出';
    if (els.micFlash) {
        els.micFlash.classList.add('on');
        clearTimeout(mic.flashTimer);
        mic.flashTimer = setTimeout(() => {
            if (els.micFlash) els.micFlash.classList.remove('on');
            if (els.micLastDetect) els.micLastDetect.textContent = '待機中';
        }, 220);
    }
}

/* 診断カウンタ（入力/登録/除外/理由/補正）を画面へ反映 */
function updateMicDiag() {
    if (els.micIn) els.micIn.textContent = mic.inputCount;
    if (els.micReg) els.micReg.textContent = mic.registerCount;
    if (els.micExc) els.micExc.textContent = mic.excludeCount;
    if (els.micExcReason) els.micExcReason.textContent = '除外: ' + (mic.lastExcludeReason || '—');
    if (els.micOffset) els.micOffset.textContent = '補正 ' + (mic.timingOffsetMs > 0 ? '+' : '') + mic.timingOffsetMs + 'ms';
}

function micExclude(reason) {
    mic.excludeCount++;
    mic.lastExcludeReason = reason;
    console.debug('[mic] 除外（' + reason + '）');
    updateMicDiag();
}

async function startMic() {
    if (mic.on) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (els.micState) els.micState.textContent = '非対応';
        if (els.micCard) els.micCard.classList.add('mic-error');
        resetMicSetupState(); // マイクが使えない → 設定状態を未実施へ戻す
        return;
    }
    // 許可ダイアログが実際に出るか事前に推定（granted以外なら出る見込み）。
    // 出た後の許可成功時は、済み状態でも設定誘導を出すために使う。
    mic.dialogShown = true;
    try {
        if (navigator.permissions && navigator.permissions.query) {
            const st = await navigator.permissions.query({ name: 'microphone' });
            mic.dialogShown = (st.state !== 'granted'); // 既にgrantedならダイアログは出ない
        }
    } catch (_) { /* 未対応ブラウザは「出る」とみなす */ }
    try {
        ensureAudio();
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        mic.stream = stream;
        mic.src = state.audioCtx.createMediaStreamSource(stream);
        mic.analyser = state.audioCtx.createAnalyser();
        mic.analyser.fftSize = 1024;
        mic.buf = new Float32Array(mic.analyser.fftSize);
        mic.src.connect(mic.analyser); // destination には繋がない（ハウリング防止）
        mic.on = true;
        mic.prevPeak = 0;
        mic.env = 0;
        if (els.micCard) els.micCard.classList.remove('mic-error');
        if (els.micLastDetect) els.micLastDetect.textContent = '待機中';
        // クリック音の自動OFFはしない（クリック音ON/OFF状態は維持）。
        // 代わりにイヤホン推奨の案内を表示する。
        if (els.micClickHint) els.micClickHint.classList.remove('hidden');
        updateMicUI();
        updateTestMicState();
        micLoop();
    } catch (e) {
        mic.on = false;
        updateMicUI();
        if (els.micState) els.micState.textContent = '許可なし'; // updateMicUI後に上書き（OFFに戻されないように）
        if (els.micCard) els.micCard.classList.add('mic-error');
        resetMicSetupState(); // 許可が拒否/喪失 → 設定状態を未実施へ戻す（次回成功時に再度誘導）
        console.warn('[mic] getUserMedia failed:', e && e.name);
    }
}

function cancelCalibration() {
    if (cal.timer) { clearInterval(cal.timer); cal.timer = 0; }
    if (cal.active || mic.calibrating) restoreCalSettings(); // 中断時も必ず復元
    cal.active = false;
    mic.calibrating = false;
    setCalUI('idle');
}

/* ═══════════════════════════════════════════════════════════
   実音テスト（設定画面）：実際のクリック音・ストローク音で反応を確認。
   registerHit / スコア / 譜面マーカーには一切流さない。
═══════════════════════════════════════════════════════════ */
function updateTestMicState() {
    // テスト開始前（マイクOFF）はマイク状態・レベルメーターを出さない
    if (els.testMicState) {
        els.testMicState.textContent = mic.on ? 'マイク ON' : 'マイク OFF';
        els.testMicState.classList.toggle('on', mic.on);
        els.testMicState.classList.toggle('hidden', !mic.on);
    }
    if (els.testLive) els.testLive.classList.toggle('hidden', !mic.on);
    if (els.testThreshold) els.testThreshold.style.left = micThresholdMarkerPct() + '%';
}

async function ensureTestMic() {
    if (!mic.on) { await startMic(); }
    if (mic.on) enterTestMode();
    updateTestMicState();
    return mic.on;
}

function enterTestMode() {
    if (mic.calibrating) return;
    test.active = true;
}

function clearTestTimers() {
    clearInterval(test.seqTimer); test.seqTimer = 0;
    test.timers.forEach((id) => clearTimeout(id));
    test.timers = [];
}
function tSet(fn, ms) { const id = setTimeout(fn, ms); test.timers.push(id); return id; }

function exitTestMode() {
    clearTestTimers();
    cancelAnimationFrame(test.flowRaf); test.flowRaf = 0;
    cancelAnimationFrame(test.clickRaf); test.clickRaf = 0;
    test.active = false;
    test.mode = null;
    test.flow = false;
    if (els.testLaneWrap) els.testLaneWrap.classList.add('hidden');
    if (els.micTestBtn) {
        els.micTestBtn.textContent = micTestBtnIdleLabel();
        els.micTestBtn.classList.toggle('is-todo', !state.micTestDone);
    }
    setTestPhase('');
    if (els.testLevel) { els.testLevel.style.width = '0%'; els.testLevel.classList.remove('over'); }
}

function setTestResult(text, kind) {
    if (!els.testResult) return;
    els.testResult.textContent = text;
    els.testResult.className = 'test-result' + (kind ? ' ' + kind : '');
}

function setTestPhase(t) { if (els.testPhase) els.testPhase.textContent = t; }

/* マイク反応テストの「今やること」をフェーズで出し分ける（v0.9.91。検出ロジックは変更しない・表示のみ）。
   ・環境音/クリック音テスト中：弾かずに待つ
   ・ストロークテスト中：いつもの強さで8回ストローク
   ・待機中：これから何をするかの予告（ストローク） */
const MIC_TEST_DONOW_WAIT = 'クリック音を測っています。弾かずに待ってください';
const MIC_TEST_DONOW_STROKE = 'クリックに続けて、いつもの強さで8回ストローク';
function updateMicTestDoNow() {
    if (!els.testDoNow) return;
    let txt;
    if (test.mode === 'noise' || test.mode === 'click') txt = MIC_TEST_DONOW_WAIT;
    else if (test.mode === 'stroke') txt = MIC_TEST_DONOW_STROKE;
    else txt = MIC_TEST_DONOW_STROKE; // 待機中はこれからの動作（ストローク）を予告
    els.testDoNow.textContent = txt;
}

/* マイク反応テスト：未実施/実施済みのボタン文言 */
function micTestBtnIdleLabel() {
    return state.micTestDone ? 'もう一度テストする' : 'テストを開始';
}

/* マイク反応テスト「未/実施済み」表示（見出し・緑の縁取り・ボタン文言）。
   実施済みは見出しの ✅ で示し、右側バッジは未実施のときだけ控えめに「未実施」を出す（二重表示を避ける）。 */
function updateMicTestDoneUI() {
    const done = state.micTestDone;
    if (els.testCard) els.testCard.classList.toggle('is-done', done);
    if (els.testCardHead) els.testCardHead.textContent = done ? '✅ マイク反応テスト済み' : 'マイク反応テスト';
    if (els.testDoneBadge) {
        els.testDoneBadge.textContent = '未実施';
        els.testDoneBadge.classList.toggle('hidden', done); // 済みのときは出さない（見出しの✅と二重になるため）
    }
    // テスト進行中でなければアイドル文言（実施済みなら「もう一度テストする」）に揃える
    if (els.micTestBtn && !test.flow) {
        els.micTestBtn.textContent = micTestBtnIdleLabel();
        els.micTestBtn.classList.toggle('is-todo', !done); // 未実施は赤系で目立たせる
    }
    // 「詳細を見る」は実施済みのときだけ表示
    if (els.testResultDetail) els.testResultDetail.classList.toggle('hidden', !done);
    // 実施済みは、まず「おすすめ設定・適用」を見てほしいので、説明文は表に出さず詳細(詳細を見る)へ寄せる（v0.9.68）
    if (els.testCardNote) els.testCardNote.classList.toggle('hidden', done);
    if (els.testInputNote) els.testInputNote.classList.toggle('hidden', done);
}

/* マイク反応テストの完了を記録（チェック表示・保存） */
function markMicTestDone() {
    if (!state.micTestDone) {
        state.micTestDone = true;
        saveSettings();
    }
    updateMicTestDoneUI();
    // v0.9.61：テスト完了だけでは下流を出さない。「おすすめ設定を適用」を見てもらう。
    if (typeof renderSettingsView === 'function' && settingsView === 'steps') {
        renderSettingsView();
        scrollToSettingsEl(els.testReco || els.testCard);
    }
}

/* マイクの遅れ補正：未/実施済みのボタン文言 */
function calBtnIdleLabel() {
    return state.micDelayDone ? 'もう一度テストする' : 'テストを開始';
}

/* マイクの遅れ補正「未/実施済み」表示（マイク反応テストとデザインを揃える） */
function updateMicDelayDoneUI() {
    const done = state.micDelayDone;
    if (els.calCard) els.calCard.classList.toggle('is-done', done);
    if (els.calHead) els.calHead.textContent = done ? '✅ マイクの遅れ補正済み' : 'マイクの遅れ補正';
    if (els.calDoneBadge) {
        els.calDoneBadge.textContent = '未実施';
        els.calDoneBadge.classList.toggle('hidden', done);
    }
    // 測定中でなければアイドル文言に揃える
    if (els.calBtn && !cal.active && !mic.calibrating) {
        els.calBtn.textContent = calBtnIdleLabel();
        els.calBtn.classList.toggle('is-todo', !done); // 未実施は赤系で目立たせる
    }
    // 「結果を見る」は実施済みのときだけ表示
    if (els.calResultDetail) {
        els.calResultDetail.classList.toggle('hidden', !done);
        if (done) renderCalResultDetail();
    }
}

/* 遅れ補正「結果を見る」の内容を反映（測定遅延・補正値・成功数・ばらつき・最大入力・反応ライン・日時） */
function renderCalResultDetail() {
    if (els.calRdDelay) els.calRdDelay.textContent = (cal.measuredDelay != null ? cal.measuredDelay + 'ms' : '–');
    if (els.calRdOffset) els.calRdOffset.textContent = (mic.timingOffsetMs > 0 ? '+' : '') + mic.timingOffsetMs + 'ms';
    if (els.calRdSuccess) els.calRdSuccess.textContent = (cal.successCount || 0) + ' / ' + CAL_CLICKS;
    if (els.calRdSpread) els.calRdSpread.textContent = (cal.spread != null ? '±' + cal.spread + 'ms' : '–');
    if (els.calRdMax) els.calRdMax.textContent = (cal.maxPeak != null ? cal.maxPeak.toFixed(3) : '–');
    if (els.calRdLine) els.calRdLine.textContent = (cal.threshold != null ? cal.threshold.toFixed(3) : '–');
    if (els.calRdVol) els.calRdVol.textContent = (cal.clickVol != null ? cal.clickVol + '%' : '–');
    if (els.calRdAt) {
        if (cal.lastAt) {
            const d = new Date(cal.lastAt);
            const pad = (n) => (n < 10 ? '0' + n : '' + n);
            els.calRdAt.textContent = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        } else {
            els.calRdAt.textContent = '–';
        }
    }
}

/* マイクの遅れ補正の適用を記録（チェック表示・保存） */
function markMicDelayDone() {
    if (!state.micDelayDone) {
        state.micDelayDone = true;
        saveSettings();
    }
    updateMicDelayDoneUI();
}

/* マイク設定の「済み/誘導」状態だけを未実施へ戻す（実設定値は変えない）。
   ・マイク許可が拒否/喪失したとき（自動）
   ・設定画面上部のリセットボタン（手動） から呼ぶ。 */
function resetMicSetupState() {
    state.micTestDone = false;
    state.micDelayDone = false;
    state.micSetupPrompted = false;
    saveSettings();
    updateMicTestDoneUI();
    updateMicDelayDoneUI();
}

/* 設定画面上部の「設定状態をリセット」ボタン。
   設定値を初期化し、ウィザード進行・各テスト結果も消して、マイク設定トップ（chooser）へ戻す。
   保存済みプリセットは別管理なので削除しない。 */
/* 「設定手順をリセット」（上部ボタン・v0.9.67）。
   今回のテスト進行・表示状態だけをリセットしてトップ画面へ戻す。
   保存済み設定値（threshold等）は維持し、保存済みプリセットも消さない。 */
function onMicResetClick() {
    // 進行中のテスト等を止めて、おすすめ/実践/補正の結果表示をクリア（保存値は変えない）
    resetSetupFlowDisplay();
    // ウィザード進行状態を初期化
    setupProgress = freshSetupProgress();
    wizardEditing = null;
    practiceResultOk = false;
    setPresetSaveMsg('');
    // プリセット一覧は閉じた状態へ
    if (els.presetListWrap) els.presetListWrap.style.display = 'none';
    if (els.presetToggleBtn) els.presetToggleBtn.textContent = '保存済みプリセット';
    // マイク設定トップ（簡易設定／詳細テスト／保存済みプリセット／現在の設定を見る）へ戻す
    setSettingsView('chooser');
    if (els.micResetMsg) {
        els.micResetMsg.textContent = 'テスト手順をリセットしました。最初からやり直せます。';
        els.micResetMsg.classList.remove('hidden');
    }
    scrollToSettingsEl(els.settingsChooser);
}

/* ═══════════════════════════════════════════════════════════
   マイク反応テスト：1ボタンで クリック音テスト → ストロークテスト → 推奨 を自動進行
═══════════════════════════════════════════════════════════ */
function toggleMicTest() {
    if (test.flow) { abortMicTest(); return; }
    test.rescueHighSens = false;  // 通常テスト開始時は救済モードを解除（従来どおりの検出しきい値）
    test.autoRetestCount = 0;     // 一連の自動再テスト回数もリセット
    scrollToSettingsEl(els.testCard); // カード上部（タイトル/「今やること」/説明）が隠れないように（v0.9.92）
    startMicTestFlow();
}

async function startMicTestFlow() {
    if (pt.active) stopPracticeTest(); // 最終確認テストと排他
    stopBtCal(); // マイク遅れ補正と排他
    if (!(await ensureTestMic())) { setTestResult('マイクを許可してください。', 'ng'); return; }
    test.flow = true;
    // イヤホン接続は初回テストから高感度寄り（救済しきい値）で拾いにいく。auto/normalは従来どおり。
    if (shouldStartMicTestInHighSensitivity()) test.rescueHighSens = true;
    test.clickDone = false; test.strokeDone = false;
    test.recommended = null; test.recoCooldown = null;
    if (els.testReco) els.testReco.classList.add('hidden');
    els.micTestBtn.textContent = 'テストを中止';
    els.micTestBtn.classList.remove('is-todo');
    els.micTestBtn.classList.add('is-on'); // 進行中は「停止」系（赤）で分かるように
    // 初回テストの安定性向上：直前テストやマイク開始直後の残り値をクリアしてから測定する（v0.9.69）。
    mic.prevPeak = 0; mic.env = 0; mic.armed = true;
    setTestResult('', '');
    beginNoisePhase();
}

/* 環境音（バックグラウンドノイズ）測定。クリックテストの前に短く無音区間を取り、
   環境ノイズの平均/最大/p95 を測る（補正用反応ラインの下限に使う）。 */
const TEST_NOISE_MS = 800;
function beginNoisePhase() {
    test.mode = 'noise';
    test.noiseSamples = [];
    if (els.testLaneWrap) els.testLaneWrap.classList.add('hidden');
    setTestPhase('周囲の音を確認中…（少し静かにお待ちください）');
    updateMicTestDoNow();
    test.timers.push(setTimeout(() => {
        if (test.mode !== 'noise') return;
        computeNoiseStats();
        beginClickPhase();
    }, TEST_NOISE_MS));
}

function computeNoiseStats() {
    const s = (test.noiseSamples || []).slice().sort((a, b) => a - b);
    if (!s.length) { test.noiseAvg = 0; test.noiseMax = 0; test.noiseP95 = 0; return; }
    test.noiseAvg = s.reduce((a, b) => a + b, 0) / s.length;
    test.noiseMax = s[s.length - 1];
    test.noiseP95 = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
}

function abortMicTest() {
    clearTestTimers();
    cancelAnimationFrame(test.flowRaf); test.flowRaf = 0;
    cancelAnimationFrame(test.clickRaf); test.clickRaf = 0;
    test.flow = false; test.mode = null;
    if (els.testLaneWrap) els.testLaneWrap.classList.add('hidden');
    els.micTestBtn.classList.remove('is-on');
    els.micTestBtn.textContent = micTestBtnIdleLabel();
    els.micTestBtn.classList.toggle('is-todo', !state.micTestDone);
    setTestPhase('');
    updateMicTestDoNow();
    setTestResult('マイク反応テストを中止しました', '');
}

/* クリック音テスト中の視覚クリック：レーンを出し、クリックのたびに判定ライン/拍ドットを光らせる */
function clickLaneLoop() {
    if (test.mode !== 'click') return;
    const since = performance.now() - (test.clickPlayedAt || -9999);
    const glow = (since >= 0 && since < 220) ? (1 - since / 220) : 0;
    drawTestEmptyLane(glow);
    test.clickRaf = requestAnimationFrame(clickLaneLoop);
}

/* 音符なしのテストレーン（クリックテスト用）：中央線＋判定ライン＋拍ドット（glowで点滅） */
function drawTestEmptyLane(glow) {
    const { ctx, w, h } = testLane;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const yc = h * 0.44;
    const judgeX = w * 0.28;
    ctx.strokeStyle = 'rgba(253,246,238,0.08)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke();
    ctx.save();
    ctx.shadowColor = 'rgba(255,159,28,0.95)'; ctx.shadowBlur = 10 + glow * 24;
    ctx.strokeStyle = 'rgba(255,159,28,' + (0.85 + glow * 0.15).toFixed(2) + ')';
    ctx.lineWidth = 3 + glow * 2;
    ctx.beginPath(); ctx.moveTo(judgeX, h * 0.12); ctx.lineTo(judgeX, h * 0.86); ctx.stroke();
    ctx.restore();
    drawBeatDot(ctx, judgeX, h * 0.92, glow);
    ctx.fillStyle = 'rgba(253,246,238,0.5)';
    ctx.font = '600 12px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('クリック音を確認中…', w / 2, h * 0.96);
}

/* クリック音テスト（本番と同じクリック：1拍目アクセント/2-4拍目通常／4拍×2周＝8回） */
function beginClickPhase() {
    test.mode = 'click';
    updateMicTestDoNow();
    test.clickI = 0; test.clickPeaks = []; test.clickResults = []; test.curPeak = 0;
    test.clickMeasureVol = state.clickVolume; // この音量で鳴らした前提で「○%適用後の目安」を後で計算
    // 視覚クリック：レーンを表示してクリックに合わせて点滅
    if (els.testLaneWrap) els.testLaneWrap.classList.remove('hidden');
    fitTestLane();
    cancelAnimationFrame(test.clickRaf);
    test.clickRaf = requestAnimationFrame(clickLaneLoop);
    clearInterval(test.seqTimer);
    test.seqTimer = setInterval(() => {
        if (test.clickI > 0) {
            const beat = (test.clickI - 1) % 4;
            test.clickResults.push({ beat, peak: test.curPeak, reacted: test.curPeak >= mic.threshold });
            test.clickPeaks.push(test.curPeak);
        }
        if (test.clickI >= CLICK_TEST_COUNT) { clearInterval(test.seqTimer); test.seqTimer = 0; endClickPhase(); return; }
        const beat = test.clickI % 4;          // 0=1拍目（アクセント）= 本番と同一
        test.curPeak = 0;
        test.clickPlayedAt = performance.now();
        test.clickWinFrom = test.clickPlayedAt;
        test.clickWinTo = test.clickPlayedAt + 520;
        click(beat === 0, true);                // 本番と同一の click()／クリック音量反映
        test.clickI++;
        setTestPhase('クリック音を確認中 ' + test.clickI + ' / ' + CLICK_TEST_COUNT);
    }, 600);
}

function endClickPhase() {
    test.clickDone = true;
    cancelAnimationFrame(test.clickRaf); test.clickRaf = 0; // クリック用の視覚ループを停止（ストローク側が引き継ぐ）
    test.maxClickPeak = test.clickPeaks.length ? Math.max(...test.clickPeaks) : 0;
    setTestPhase('ストロークテストへ…');
    test.timers.push(setTimeout(beginStrokePhase, 800));
}

/* ── ストロークテスト（流れる譜面型・8分ダウンアップ）──────────
   STAGEに近い見た目で、右から左へ流れる8分音符（↓↑）が判定ラインに来たら弾く。
   タイミング精度は評価せず、各音符の判定窓内の最大入力を down/up 別に記録するだけ。 */
/* マイク反応テスト専用テンポ。STAGE本体のBPMには影響しない。
   ストロークは1拍ごと（4分テンポ）。クリック音テスト(間隔600ms＝四分100BPM相当)と同じBPM感。 */
const TEST_CLICK_INTERVAL_MS = 600;               // クリック音テストの間隔（四分・100BPM相当）
const TEST_NOTE_MS = TEST_CLICK_INTERVAL_MS;      // ストローク間隔＝600ms（1拍ごと＝4分）
const TEST_NOTE_WIN = 200;    // 判定窓 ±ms（最大入力を記録する範囲・4分なので広め）
/* カウントイン：4分で4回（1 2 3 4）。最後の4の1拍後に最初の音符が判定ラインに来る。 */
const TEST_COUNTIN_BEEPS = 4;
const TEST_COUNTIN_START = 500; // 最初のビープまでの小休止(ms)
const TEST_LEAD_MS = TEST_COUNTIN_START + TEST_COUNTIN_BEEPS * TEST_NOTE_MS; // 最初の音符が来る時刻
/* マイク反応テスト専用の通常検出しきい値。
   通常環境は従来どおり 0.02。クリック音がほぼ入らない低入力環境だけ、下の関数で一時的に下げる。 */
const TEST_STROKE_THRESHOLD = 0.02;
const TEST_LOW_CLICK_MAX = 0.003;
const TEST_LOW_NOISE_P95 = 0.003;
const TEST_LOW_NOISE_MAX = 0.006;
const TEST_LOW_STROKE_FLOOR = 0.0035;
/* 救済再テストの検出しきい値の上限。直前テストで検出が少なかったとき、通常0.02ではなくここまで
   下げて拾い直す。ノイズが低ければ TEST_LOW_STROKE_FLOOR(0.0035) 付近まで下がる。 */
const TEST_RESCUE_STROKE_CEIL = 0.010;
/* Bluetoothイヤホン用：おすすめ反応ラインの下限割合（v0.9.85）。
   一部端末（特に iPhone + Bluetooth）はマイクのAGCが強く、ストローク間の余韻まで持ち上げる。
   反応ラインが低すぎると結果波形がMAX張り付き＋二重反応になりやすいので、実測ストローク量に対して
   「最低でもこの割合の高さ」にラインを引き上げる。検出は実測ピークの半分なので、普通のストロークは拾える。
   有線/通常マイク/MacのBluetoothには影響が小さい（元々ライン位置が妥当なら据え置き）。 */
const BT_RECO_MIN_FRAC = 0.5;
const BT_STRONG_RAW_MAX = 0.03;      // この程度以上なら「入力は十分ある」とみなし低入力扱いを避ける
const BT_STRONG_RAW_P95 = 0.025;
const BT_STRONG_RAW_AVG = 0.02;
const BT_STRONG_DISPLAY_FRAC = 0.85; // 既存反応ライン基準のメーターが大きく振れている状態
/* マイク反応テストの開発用デバッグログ（本番は false）。true のときだけ finalize 時に診断を出す。 */
const MIC_DEBUG = false;
/* 自動再テストは最大1回。短い案内のあと自動でテストを再開する。 */
const MAX_AUTO_RETEST = 1;
const AUTO_RETEST_DELAY_MS = 1300;
function isLowInputTestEnv() {
    return (test.maxClickPeak || 0) < TEST_LOW_CLICK_MAX
        && (test.noiseP95 || 0) < TEST_LOW_NOISE_P95
        && (test.noiseMax || 0) < TEST_LOW_NOISE_MAX;
}
/* 再テスト時に高感度救済(rescueHighSens)を使うべきか。
   ノイズが高くて isLowInputTestEnv() が false でも、「入力はあるが通常しきい値0.020では拾えていない」
   ＝低入力の可能性が高いケースを救済する。逆に、入力自体が十分大きい（0.020以上）のに検出数が
   少ないだけのときは救済しない（反応ライン・しきい値を勝手に変えない）。 */
function shouldUseRescueHighSens() {
    const raw = test.maxStrokeRaw || 0;
    const inputButQuiet = raw > THR_MIN && raw < TEST_STROKE_THRESHOLD; // 0.003〜0.020：入力はあるが通常では拾えない
    const lowClick = (test.maxClickPeak || 0) < TEST_LOW_CLICK_MAX;     // クリック音も小さい＝イヤホン等の低入力寄り
    return isLowInputTestEnv() || (inputButQuiet && lowClick);
}
function testStrokeThreshold() {
    // 救済（イヤホン接続 or 救済再テスト）：低入力判定に依存せず、ノイズだけ尊重して高感度寄りで拾う（上限0.010）。
    if (test.rescueHighSens || isHeadphoneInput()) {
        const noiseLine = Math.max((test.noiseP95 || 0) * 2, (test.noiseMax || 0) * 1.2);
        const thr = Math.max(THR_MIN, TEST_LOW_STROKE_FLOOR, noiseLine);
        return Math.min(TEST_RESCUE_STROKE_CEIL, thr);
    }
    if (!isLowInputTestEnv()) {
        // 通常環境でも、環境ノイズより十分上を必ず確保する（ノイズだけでストローク検出される事故を防ぐ・v0.9.69）。
        // 普通のストローク(0.05以上が多い)は通すが、ノイズ(noiseMax/p95)はストローク扱いしない。
        const noiseLine = Math.max((test.noiseP95 || 0) * 4, (test.noiseMax || 0) * 1.5);
        return Math.max(TEST_STROKE_THRESHOLD, noiseLine);
    }
    // 有線イヤホン等はクリック音がほぼ競合しないため、現在の反応ライン(mic.threshold)には引っ張られない。
    // ノイズより十分上だけを守り、普通より少し弱いストロークも拾えるラインまで下げる。
    const noiseLine = Math.max((test.noiseP95 || 0) * 4, (test.noiseMax || 0) * 1.5);
    const thr = Math.max(THR_MIN, TEST_LOW_STROKE_FLOOR, noiseLine);
    return Math.min(TEST_STROKE_THRESHOLD, thr);
}
function adaptLowInputTestThreshold(doneNotes) {
    if (!isLowInputTestEnv() || !test.strokeDetectThreshold) return;
    // 低入力で前半の検出が少ないときだけ、ノイズ基準を少し緩めてもう一段高感度へ。
    const expectedMin = Math.max(1, Math.ceil(doneNotes * 0.5));
    if ((test.strokeDetected || 0) >= expectedMin) return;
    const relaxedNoiseLine = Math.max((test.noiseP95 || 0) * 3.5, (test.noiseMax || 0) * 1.25);
    const relaxed = Math.max(THR_MIN, TEST_LOW_STROKE_FLOOR, relaxedNoiseLine);
    if (relaxed < test.strokeDetectThreshold) test.strokeDetectThreshold = relaxed;
}
/* 受付窓内の最大値が、この値以上なら検出ありとみなす共通判定（後で本番STAGEへ移植しやすいよう関数化） */
function isTestStrokeDetected(peak) {
    return peak >= (test.strokeDetectThreshold || testStrokeThreshold());
}

/* カウントイン用ビープ（clickVolumeに依存しない固定音量。タイミングを掴むための合図）。
   本編クリック(click)とは別物。譜面が流れ始めたら鳴らさない。 */
function testCountBeep(accent) {
    const ctx = state.audioCtx;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1500 : 1100;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.09);
}

function beginStrokePhase() {
    if (test.mode === null && !test.flow) return;
    test.mode = 'stroke';
    updateMicTestDoNow();
    test.strokePeaks = []; test.strokeDownPeaks = []; test.strokeUpPeaks = [];
    test.strokeAboveMs = [];
    test.strokeChordDiag = []; test.chordWave = [];
    test.strokeDetected = 0; test.strokeDoubleCount = 0;
    test.strokeDetectThreshold = testStrokeThreshold(); // 低入力/通常環境ごとに、このテスト中の検出ラインを固定
    // 8音符＝1小節（ダウン4・アップ4）。t は flowStart からの相対ms
    test.notes = [];
    const COUNT = 8;
    for (let i = 0; i < COUNT; i++) {
        test.notes.push({ t: TEST_LEAD_MS + i * TEST_NOTE_MS, dir: (i % 2 === 0) ? 'down' : 'up', opened: false, closed: false, peak: 0, onsets: 0 });
    }
    test.noteIdx = 0;
    test.curPeak = 0; test.curOnsets = 0;
    test.strokeFrom = 0; test.strokeUntil = 0;
    if (els.testLaneWrap) els.testLaneWrap.classList.remove('hidden');
    fitTestLane();
    test.flowStart = performance.now();
    // 視覚クリック用の拍グリッド（カウントイン＋本編の4分）。TEST_COUNTIN_STARTから等間隔。
    test.beatGridFrom = TEST_COUNTIN_START;
    // カウントイン（クリック音あり・4分4回「1 2 3 4」）。本編（譜面が流れる間）は鳴らさない。
    const labels = ['1', '2', '3', '4'];
    for (let i = 0; i < TEST_COUNTIN_BEEPS; i++) {
        const ms = TEST_COUNTIN_START + i * TEST_NOTE_MS;
        tSet(() => {
            if (test.mode !== 'stroke') return;
            setTestPhase('カウントイン　' + labels.slice(0, i + 1).join(' '));
            click(i === 0, true); // STAGE/クリック音テストと同じ click() を使用（音を統一）。1拍目だけアクセント
        }, ms);
    }
    // 最後の 4 の1拍後に最初の音符（TEST_LEAD_MS）。本編表示へ切替。
    tSet(() => { if (test.mode === 'stroke') setTestPhase('1拍ごとに ↓ダウン ↑アップ で弾いてください'); }, TEST_LEAD_MS - 250);
    cancelAnimationFrame(test.flowRaf);
    test.flowRaf = requestAnimationFrame(testFlowLoop);
}

function testFlowLoop() {
    if (test.mode !== 'stroke') return;
    const now = performance.now();
    const t = now - test.flowStart;

    // 現在の音符の判定窓を開閉。開いている間は micLoop が test.curPeak を更新する
    const note = test.notes[test.noteIdx];
    if (note) {
        if (!note.opened && t >= note.t - TEST_NOTE_WIN) {
            note.opened = true;
            test.curPeak = 0; test.curOnsets = 0;
            test.curAbove = false; test.curAboveMax = 0; test.curAboveStart = 0;
            test.curRiseMax = 0; test.curFirstAboveT = 0; test.curLastAboveT = 0; test.curPeakT = 0;
            test.strokeFrom = now;
            test.strokeUntil = now + TEST_NOTE_WIN * 2;
        }
        if (note.opened && !note.closed && t >= note.t + TEST_NOTE_WIN) {
            note.closed = true;
            note.peak = test.curPeak;
            note.onsets = test.curOnsets;
            note.aboveMs = test.curAboveMax; // この音符の反応ライン超過時間（最長連続）
            test.strokeUntil = 0;
            test.strokePeaks.push(note.peak);
            (note.dir === 'down' ? test.strokeDownPeaks : test.strokeUpPeaks).push(note.peak);
            note.detected = isTestStrokeDetected(note.peak); // 受付窓内最大が緩めしきい値超え＝検出あり
            if (note.detected) { test.strokeDetected++; if (test.curAboveMax > 0) test.strokeAboveMs.push(test.curAboveMax); }
            if (note.onsets >= 2) test.strokeDoubleCount++;
            adaptLowInputTestThreshold(test.noteIdx + 1);
            // コードストローク観察値（検出できたストロークのみ）
            if (note.detected) {
                // 余韻含む全幅＝最初に反応ラインを超えてから最後に超えていたフレームまで（必ず 超過時間 以上になる）
                const fullSpan = (test.curFirstAboveT > 0 && test.curLastAboveT >= test.curFirstAboveT)
                    ? Math.max(test.curLastAboveT - test.curFirstAboveT, test.curAboveMax)
                    : test.curAboveMax;
                const t2p = (test.curFirstAboveT > 0 && test.curPeakT >= test.curFirstAboveT) ? (test.curPeakT - test.curFirstAboveT) : 0;
                test.strokeChordDiag.push({
                    peak: +test.curPeak.toFixed(3),
                    aboveMs: Math.round(test.curAboveMax),
                    fullSpanMs: Math.round(fullSpan),
                    riseMax: +test.curRiseMax.toFixed(3),
                    timeToPeakMs: Math.round(t2p),
                    onsets: test.curOnsets,
                    rePeaks: Math.max(0, test.curOnsets - 1), // 1回のストローク中の追加オンセット＝現状ロジックで二重反応になりうる回数
                });
            }
            test.noteIdx++;
        }
    }

    drawTestLane(t);

    const lastT = test.notes.length ? test.notes[test.notes.length - 1].t : 0;
    if (test.noteIdx >= test.notes.length && t > lastT + TEST_NOTE_WIN + 250) {
        endStrokePhase();
        return;
    }
    test.flowRaf = requestAnimationFrame(testFlowLoop);
}

/* テスト譜面レーンのサイズ確定 */
function fitTestLane() {
    if (!els.testLaneCanvas) return;
    testLane = fitOne(els.testLaneCanvas);
}

/* テスト譜面レーン描画（右→左に流れる8分音符＋↓↑） */
function drawTestLane(t) {
    const { ctx, w, h } = testLane;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const yc = h * 0.44;
    const judgeX = w * 0.28;
    const ppm = (w * 0.18) / TEST_NOTE_MS;  // 1音符ぶんを画面幅の約18%に
    // 中央ガイド
    ctx.strokeStyle = 'rgba(253,246,238,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke();
    // 音符
    for (let i = 0; i < test.notes.length; i++) {
        const n = test.notes[i];
        const x = judgeX + (n.t - t) * ppm;
        if (x < -24 || x > w + 24) continue;
        const inWin = (!n.closed) && Math.abs(t - n.t) <= TEST_NOTE_WIN;
        // STAGEと同じ4分音符の見た目。検出＝緑／未検出＝薄い／判定窓中＝光る黄色
        const col = n.closed
            ? (n.detected ? COLORS.just : 'rgba(253,246,238,0.3)')
            : (inWin ? 'rgba(255,209,102,0.98)' : NOTE_COLOR);
        ctx.save();
        if (inWin || (n.closed && n.detected)) {
            ctx.shadowColor = (n.closed && n.detected) ? 'rgba(46,204,113,0.9)' : 'rgba(255,159,28,0.8)';
            ctx.shadowBlur = 11;
        }
        drawQuarterNote(ctx, x, yc, col);
        ctx.restore();
        // ストローク方向 ↓ / ↑
        ctx.fillStyle = n.closed ? 'rgba(255,180,90,0.55)' : 'rgba(255,180,90,0.95)';
        ctx.font = '700 15px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(n.dir === 'down' ? '↓' : '↑', x, yc + 30);
    }
    // 判定ライン（拍の視覚クリック：拍頭付近で軽く光る）
    const gridFrom = (test.beatGridFrom != null) ? test.beatGridFrom : TEST_COUNTIN_START;
    const glow = beatGlow(t - gridFrom, TEST_NOTE_MS);
    ctx.save();
    ctx.shadowColor = 'rgba(255,159,28,0.95)'; ctx.shadowBlur = 10 + glow * 24;
    ctx.strokeStyle = 'rgba(255,159,28,' + (0.85 + glow * 0.15).toFixed(2) + ')';
    ctx.lineWidth = 3 + glow * 2;
    ctx.beginPath(); ctx.moveTo(judgeX, h * 0.12); ctx.lineTo(judgeX, h * 0.86); ctx.stroke();
    ctx.restore();
    drawBeatDot(ctx, judgeX, h * 0.92, glow);
}

/* 拍頭付近の発光量(0..1)を返す。rel: 拍グリッド起点からの経過ms / interval: 拍間隔ms */
function beatGlow(rel, interval) {
    if (interval <= 0 || rel < -10) return 0;
    const phase = ((rel % interval) + interval) % interval;
    const near = Math.min(phase, interval - phase);
    const WIN = 130;
    return near < WIN ? (1 - near / WIN) : 0;
}

/* テスト終了後：全ノートを横一列に並べ、検出結果（緑＝検出/薄い＝未検出）を残して表示 */
function drawTestLaneSummary() {
    fitTestLane();
    const { ctx, w, h } = testLane;
    if (!ctx || !test.notes.length) return;
    ctx.clearRect(0, 0, w, h);
    const yc = h * 0.42;
    const n = test.notes.length;
    const padX = 22;
    const step = (w - padX * 2) / (n - 1);
    // 中央ガイド
    ctx.strokeStyle = 'rgba(253,246,238,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke();
    for (let i = 0; i < n; i++) {
        const note = test.notes[i];
        const x = padX + i * step;
        const col = note.detected ? COLORS.just : 'rgba(253,246,238,0.28)';
        ctx.save();
        if (note.detected) { ctx.shadowColor = 'rgba(46,204,113,0.85)'; ctx.shadowBlur = 9; }
        drawQuarterNote(ctx, x, yc, col);
        ctx.restore();
        ctx.fillStyle = note.detected ? 'rgba(255,180,90,0.9)' : 'rgba(255,180,90,0.4)';
        ctx.font = '700 13px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(note.dir === 'down' ? '↓' : '↑', x, yc + 26);
    }
    // 凡例
    ctx.font = '600 10px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2ecc71';
    ctx.fillText('● 検出', padX, h - 8);
    ctx.fillStyle = 'rgba(253,246,238,0.4)';
    ctx.fillText('● 未検出', padX + 56, h - 8);
}

function endStrokePhase() {
    test.mode = null; test.flow = false;
    cancelAnimationFrame(test.flowRaf); test.flowRaf = 0;
    // レーンは隠さず、検出結果のプロット（緑＝検出 / 薄い＝未検出）をそのまま残す
    drawTestLaneSummary();
    els.micTestBtn.classList.remove('is-on');
    els.micTestBtn.textContent = micTestBtnIdleLabel();
    els.micTestBtn.classList.toggle('is-todo', !state.micTestDone);
    setTestPhase('');
    updateMicTestDoNow();
    // 検出判定は通常0.02、クリック音がほぼ入らない低入力環境では一時的に下げる
    const thr = test.strokeDetectThreshold || testStrokeThreshold();
    const validMin = (arr) => { const v = arr.filter((p) => p >= thr); return v.length ? Math.min(...v) : null; };
    const validMax = (arr) => { const v = arr.filter((p) => p >= thr); return v.length ? Math.max(...v) : null; };
    // ダウン/アップ別（検出分）
    test.downMin = validMin(test.strokeDownPeaks); test.downMax = validMax(test.strokeDownPeaks);
    test.upMin = validMin(test.strokeUpPeaks); test.upMax = validMax(test.strokeUpPeaks);
    // 全ストローク（検出分）
    const valid = test.strokePeaks.filter((p) => p >= thr).sort((a, b) => a - b);
    test.minStrokePeak = valid.length ? valid[0] : null;             // 全ストローク最小（検出分）
    test.maxStrokePeak = valid.length ? valid[valid.length - 1] : null; // 全ストローク最大（検出分）
    // ロバストな「小さめストローク」基準＝下位25パーセンタイル（1回だけ弱いストロークに引っ張られない）
    test.strokeP25 = valid.length ? valid[Math.floor((valid.length - 1) * 0.25)] : null;
    // 検出有無に関わらず、受付ウィンドウ内の生の最大入力を記録（検出0回でも推奨に使う）
    test.maxStrokeRaw = test.strokePeaks.length ? Math.max(...test.strokePeaks) : null;
    test.strokeDone = true;
    setTestResult('', '');
    updateReco();
    // コードストローク観察：波形・各ストローク観察値をコンソールへダンプ（開発用）
    if (state.strokeDetectMode === 'chord') logChordStrokeDiag();
}

/* コードストローク観察ログ（開発用）。各ストロークの余韻・立ち上がり・再ピーク（=現状ロジックで
   二重反応になりうる回数）と、テスト全体のenv/peak波形をコンソールに出す。 */
function logChordStrokeDiag() {
    const d = test.strokeChordDiag || [];
    const med = (arr) => { const v = arr.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
    const summary = {
        反応ライン: +mic.threshold.toFixed(3),
        ストローク数: d.length,
        超過時間中央値ms: med(d.map((x) => x.aboveMs)),
        余韻含む全幅中央値ms: med(d.map((x) => x.fullSpanMs)),
        立ち上がり速度中央値: med(d.map((x) => x.riseMax)),
        ピーク到達中央値ms: med(d.map((x) => x.timeToPeakMs)),
        再ピーク合計: d.reduce((a, x) => a + (x.rePeaks || 0), 0),
        二重反応になりうるストローク数: d.filter((x) => x.onsets >= 2).length,
    };
    console.log('[chord] コードストローク観察サマリ', summary);
    try { console.table(d); } catch (_) { console.log('[chord] diag', JSON.stringify(d)); }
    console.log('[chord] 波形(env/peak)', JSON.stringify(test.chordWave));
}

/* 二重反応防止の上限 = 最短音符間隔 × 0.45。
   STAGE1は4分（最短音符＝1拍）。将来 8分/16分 を追加するときは notesPerBeat を増やせば、
   速い譜面で二重反応防止が長すぎて次の音符を潰すのを自動で防げる。 */
function recoCooldownCapMs() {
    const beat = 60000 / (state.bpm || 80);
    const notesPerBeat = 1; // STAGE1=4分。将来: 8分→2、16分→4
    const minNoteInterval = beat / notesPerBeat;
    return minNoteInterval * 0.45;
}

/* 昇順配列のパーセンタイル値（p=0..1）。空なら null。 */
function percentile(sortedAsc, p) {
    if (!sortedAsc || !sortedAsc.length) return null;
    const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor((sortedAsc.length - 1) * p)));
    return sortedAsc[idx];
}
/* コード用クールダウンの基準に使う「ストローク反応ライン超過時間」のパーセンタイル。
   現状は中央値(0.5)。将来コード進行テスト（C→G→Am→Em）を入れたら 0.75 など安全側に差し替え可能。 */
const CHORD_ABOVE_PERCENTILE = 0.5;
/* コード用最小クールダウンを算出（コード進行対応を見据えた共通関数）。
   基準＝超過時間のパーセンタイル×1.2。余韻/再ピークが出るコード(G/Em等)でも安定するよう安全側の下限を入れる。
   ブラッシングモードには一切影響しない（呼ぶのはchordモードの算出時のみ）。 */
function computeChordCooldown(aboveMsArr, hasRing) {
    const sorted = (aboveMsArr || []).filter((v) => v > 0).sort((a, b) => a - b);
    const base = percentile(sorted, CHORD_ABOVE_PERCENTILE);
    const cap = recoCooldownCapMs();                 // 最短音符間隔×0.45（速い譜面で潰さない上限）
    let cd = (base != null) ? base * 1.2 : 0;
    cd = Math.max(cd, hasRing ? 200 : 170);          // 余韻多→200ms / 通常でも170ms（コード進行でも安定）
    return Math.round(Math.max(140, Math.min(cd, cap)));
}

/* ── おすすめ設定（反応ライン＝%／クリック音量／二重反応防止）＋詳細結果 ── */
function updateReco() {
    if (!els.testReco) return;
    if (!(test.clickDone && test.strokeDone)) { els.testReco.classList.add('hidden'); return; }

    // ── 自動再テスト判定（結果カードを出す前に決める）──
    // 検出数が少ないときは結果で止めず、短い案内のあと自動で1回だけ再テストする。
    //  - 0〜4/8：必ず自動再テスト　- 5〜7/8：低入力 or 仮おすすめなら自動再テスト　- 8/8：再テストしない
    {
        const totalN = test.notes.length || 8;
        const det = test.strokeDetected || 0;
        const prov = (test.minStrokePeak == null);
        const strong = det <= 4 && det < totalN;
        const soft = det > 4 && det < totalN && (isLowInputTestEnv() || prov);
        if ((strong || soft) && (test.autoRetestCount || 0) < MAX_AUTO_RETEST && !test.flow) {
            test.autoRetestCount = (test.autoRetestCount || 0) + 1;
            // イヤホンは常に救済。auto/normalは低入力っぽいときだけ救済。それ以外は同じ設定で再テスト。
            test.rescueHighSens = shouldAllowRescueHighSens();
            if (els.testReco) els.testReco.classList.add('hidden');
            if (els.recoRetest) els.recoRetest.classList.add('hidden');
            if (els.recoRetestBtn) els.recoRetestBtn.classList.add('hidden');
            setTestResult(test.rescueHighSens
                ? '入力が小さめなので、もう一度高感度で確認します。'
                : 'ストロークをもう一度確認します。', '');
            test.timers.push(setTimeout(() => { if (!test.flow) startMicTestFlow(); }, AUTO_RETEST_DELAY_MS));
            return;
        }
    }

    markMicTestDone(); // クリック＋ストロークの両テストが完了 → 実施済みにする
    const maxClick = test.clickPeaks.length ? Math.max(...test.clickPeaks) : 0;
    const minStroke = test.minStrokePeak;                 // 全ストローク最小（検出分）
    const maxStrokeRaw = (test.maxStrokeRaw != null) ? test.maxStrokeRaw : null;
    const clickReacted = test.clickResults.filter((r) => r.reacted).length;
    // 推奨の基準＝全ストローク最小（検出分）。検出0回のときは受付中最大を「仮の基準」にする。
    const strokeBasis = (minStroke != null) ? minStroke : maxStrokeRaw;
    const provisional = (minStroke == null);              // 検出0回＝仮のおすすめ
    els.testReco.classList.remove('hidden');

    const maxStroke = test.maxStrokePeak; // 全ストローク最大（検出分）
    const strokeSamples = (test.strokePeaks || []).filter((v) => typeof v === 'number' && isFinite(v)).sort((a, b) => a - b);
    const strokeAvg = strokeSamples.length ? strokeSamples.reduce((a, b) => a + b, 0) / strokeSamples.length : null;
    const strokeP95 = strokeSamples.length ? strokeSamples[Math.min(strokeSamples.length - 1, Math.floor(strokeSamples.length * 0.95))] : null;
    const displaySamples = strokeSamples.map((v) => micDisplayFrac(v));
    const strokeDisplayMax = displaySamples.length ? displaySamples[displaySamples.length - 1] : null;
    const strokeDisplayAvg = displaySamples.length ? displaySamples.reduce((a, b) => a + b, 0) / displaySamples.length : null;
    const lowInputMax = (maxStroke != null) ? maxStroke : maxStrokeRaw;
    const hasAnyInput = (maxStrokeRaw != null && maxStrokeRaw > 0);
    let lowInput = hasAnyInput && (
        (lowInputMax != null && lowInputMax < 0.035) ||
        (minStroke != null && minStroke < 0.025)
    );
    const lowInputBeforeBtOverride = lowInput;
    // iPhone + Bluetoothでは、現在の反応ライン基準のメーターが大きく振れていても、
    // 「イヤホン接続」だけで低入力プロファイルへ寄ることがあった（v0.9.86）。
    // 実測ピーク/平均、または表示メーター上の反応量が十分なら「小さい入力」ではなく
    // 「AGCで持ち上がった入力」とみなし、低入力向けの高感度計算を使わない。
    const btInputLooksStrong = isBluetoothHeadphone() && hasAnyInput && (
        (maxStrokeRaw != null && maxStrokeRaw >= BT_STRONG_RAW_MAX) ||
        (strokeP95 != null && strokeP95 >= BT_STRONG_RAW_P95) ||
        (strokeAvg != null && strokeAvg >= BT_STRONG_RAW_AVG) ||
        (strokeDisplayMax != null && strokeDisplayMax >= BT_STRONG_DISPLAY_FRAC)
    );
    if (btInputLooksStrong) lowInput = false;
    // 救済(rescueHighSens)やイヤホン接続で拾った結果も低入力として扱い、おすすめ表示・手動プロファイルをそろえる。
    const lowInputTuned = (isLowInputTestEnv() || shouldUseLowInputDisplayProfile()) && lowInput;
    test.lowInputTuned = lowInputTuned; // 詳細表示(updateTestDetail)で表示スケールを合わせるため保持
    const lowInputNoiseLine = Math.max(THR_MIN, TEST_LOW_STROKE_FLOOR, (test.noiseP95 || 0) * 4, (test.noiseMax || 0) * 1.5);

    // ② クリック音量を先に決める：クリックをストローク最小より十分下げ、間に反応ラインを置ける状態にする。
    //    目標＝クリック音最大がストローク最小の半分以下。
    const measureVol = Math.max(1, test.clickMeasureVol || state.clickVolume || 1);
    const peakPerPct = (maxClick > 0) ? maxClick / measureVol : 0; // 1%あたりの想定クリックピーク
    let recoVol = state.clickVolume;
    if (minStroke != null && peakPerPct > 0) {
        const targetClickMax = minStroke * 0.5;            // クリックはストローク最小の半分以下を目標
        if (maxClick > targetClickMax) {
            recoVol = Math.round(targetClickMax / peakPerPct);
            recoVol = Math.max(10, Math.min(state.clickVolume, recoVol)); // 下げる方向のみ・0にはしない
        } else if (clickReacted > 0) {
            recoVol = Math.max(10, state.clickVolume - 20);
        }
    } else if (clickReacted > 0) {
        recoVol = Math.max(10, state.clickVolume - 20);
    }
    test.recoClickVolume = recoVol;
    els.recoClickVol.textContent = recoVol + '％';
    // おすすめ音量を適用したときのクリック音最大の「目安」（線形近似）。
    test.projClickMax = (peakPerPct > 0) ? (peakPerPct * recoVol) : (maxClick > 0 ? maxClick : null);
    const postClick = (test.projClickMax != null) ? test.projClickMax : maxClick; // 適用後に想定されるクリック最大

    // ① STAGE用反応ライン：適用後クリック最大(postClick)とストローク最小の「間」に置く。
    //    STAGEの目的＝クリックを拾わずストロークを拾う。クリックより上・ストローク最小より下。
    let canApply = false;
    let highSens = false;
    let cannotSeparate = false; // クリック音量を下げてもクリックとストロークを分離できない
    if (minStroke != null) {
        const separable = postClick < minStroke * 0.8;     // 間に十分な隙間があるか
        if (lowInputTuned) {
            // 有線イヤホン等：クリック音がほぼ競合しないため、ストローク最小の4割弱まで高感度に寄せる。
            // ノイズより十分上には置くが、クリック回避のために不必要に上げない。
            let rec = Math.max(lowInputNoiseLine, minStroke * 0.38);
            rec = Math.min(rec, minStroke * 0.55);
            rec = Math.max(THR_MIN, Math.min(THR_MAX, rec));
            test.recommended = rec;
            canApply = true;
        } else if (separable) {
            const mid = (postClick + minStroke) / 2;
            let rec = Math.max(postClick * 1.3, mid);      // クリックより確実に上＋中間寄り
            rec = Math.min(rec, minStroke * 0.9);          // ストローク最小の少し下（最小も拾える）
            rec = Math.max(THR_MIN, Math.min(THR_MAX, rec));
            test.recommended = rec;
            canApply = true;
        } else {
            // 分離不可：とりあえずストローク最小の少し下を提案しつつ、警告で音量ダウン/イヤホンへ誘導
            cannotSeparate = true;
            let rec = Math.max(THR_MIN, Math.min(THR_MAX, minStroke * 0.85));
            test.recommended = rec;
            canApply = true;
        }
        const sens = sensFromThreshold(test.recommended);
        highSens = sens >= 85; // 85%以上はかなり高感度寄り（メッセージ分岐用・実スケール基準）
        els.recoThr.textContent = recoSensDisplay(test.recommended, lowInputTuned) + '％';
    } else if (maxStrokeRaw != null && maxStrokeRaw > THR_MIN * 2) {
        // 検出0回でも、受付中最大の少し下を仮提案（拾う方向に低めへ）。クリックよりは上に。
        let rec = lowInputTuned ? Math.max(lowInputNoiseLine, maxStrokeRaw * 0.4) : Math.max(THR_MIN, maxStrokeRaw * 0.7);
        if (!lowInputTuned) rec = Math.max(rec, postClick * 1.2);
        rec = Math.max(THR_MIN, Math.min(THR_MAX, rec));
        test.recommended = rec;
        els.recoThr.textContent = (provisional ? '仮 ' : '') + recoSensDisplay(rec, lowInputTuned) + '％';
        canApply = true;
    } else {
        test.recommended = null;
        els.recoThr.textContent = '—';
    }

    // ②-B Bluetoothイヤホン専用：反応ラインが実測ストロークに対して低すぎる場合だけ引き上げる（v0.9.85）。
    //     iPhone+Bluetooth等はAGCでストローク間の余韻が持ち上がり、ラインが低いと
    //     ・結果波形がMAX張り付き ・二重反応 が起きやすい。実測ピークの一定割合を下限にして自然な高さへ。
    //     UA分岐はせず、入力タイプ（Bluetoothイヤホン）と実測値だけで判断する。判定スケール/表示は変えない。
    if (isBluetoothHeadphone() && test.recommended != null) {
        // v0.9.85では minStroke 基準だったため、1拍だけ小さい入力があると下限が低くなりやすかった。
        // v0.9.86では p95/平均/最大も見て、実際に大きく反応している環境ではラインを自然な高さへ寄せる。
        const btFloorCandidates = [
            minStroke != null ? minStroke * 0.5 : null,
            strokeP95 != null ? strokeP95 * BT_RECO_MIN_FRAC : null,
            strokeAvg != null ? strokeAvg * 0.55 : null,
            maxStrokeRaw != null ? maxStrokeRaw * 0.4 : null,
            lowInputNoiseLine,
        ].filter((v) => typeof v === 'number' && isFinite(v) && v > 0);
        if (btFloorCandidates.length) {
            const btFloor = Math.max(THR_MIN, Math.min(THR_MAX, Math.max(...btFloorCandidates)));
            if (btFloor > test.recommended) {
                test.recommended = btFloor;
                els.recoThr.textContent = (provisional ? '仮 ' : '') + recoSensDisplay(test.recommended, lowInputTuned) + '％';
            }
        }
    }

    // ③ 二重反応防止：ストローク波形が反応ラインを超えている時間幅をベースに算出する。
    //    おすすめ = min( 超過時間 × 1.2, 最短音符間隔 × 0.45 )。
    //    最短音符間隔の上限で、将来のBPUP・16分でも次の音符を潰さないようにする。
    const aboveArr = (test.strokeAboveMs || []).filter((v) => v > 0).sort((a, b) => a - b);
    test.strokeAboveMedian = aboveArr.length ? aboveArr[Math.floor(aboveArr.length / 2)] : null;
    let recoCool;
    if (test.strokeAboveMedian != null) {
        const cap = recoCooldownCapMs();                         // 最短音符間隔 × 0.45
        recoCool = Math.round(Math.min(test.strokeAboveMedian * 1.2, cap));
        recoCool = Math.max(100, Math.min(400, recoCool));       // 安全範囲
    } else {
        // 計測できない場合は従来どおり（二重反応があれば少し長め）
        recoCool = mic.cooldownMs;
        if (test.strokeDoubleCount > 0 && mic.cooldownMs < 250) recoCool = Math.min(400, mic.cooldownMs + 80);
    }
    // Bluetoothイヤホンで二重反応が出ていたら、二重反応防止をやや長めの下限へ（v0.9.85）。安全範囲(≤400)内。
    if (isBluetoothHeadphone() && (test.strokeDoubleCount || 0) > 0) {
        recoCool = Math.max(recoCool, Math.min(400, 220));
    }
    test.recoCooldown = recoCool;
    els.recoCooldown.textContent = recoCool + 'ms';

    // コードストローク専用ゲートをマイク反応テストの観察値から自動算出（chordモード時のみ更新・保存）。
    if (state.strokeDetectMode === 'chord') {
        const d = test.strokeChordDiag || [];
        const med = (arr) => { const v = arr.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
        const aboveMed = test.strokeAboveMedian;
        const riseMed = med(d.map((x) => x.riseMax));
        if (aboveMed != null) {
            // コード進行対応を見据えた共通算出。余韻/再ピークが出るコード(G/Em等)は安全側の下限(200ms)、
            //   通常でも170ms、上限は最短音符間隔×0.45。1コード(C)でテストしてもG/Am/Emで安定しやすくする。
            //   実ストローク間隔(750ms)を潰す長さではないので、C/Amの拾い漏れ(MISS)は増やさない。
            const rePeakTotal = d.reduce((a, x) => a + (x.rePeaks || 0), 0);
            const hasRing = (rePeakTotal > 0 || (test.strokeDoubleCount || 0) > 0);
            state.chordMinCooldown = computeChordCooldown(test.strokeAboveMs, hasRing);
        }
        if (riseMed != null) {
            // 谷からの上昇ゲート：立ち上がり速度中央値とストローク最小から（余韻の小さな揺れを無視）
            state.chordRiseGate = Math.max(riseMed * 0.6, (minStroke || 0) * 0.4, 0.008);
            state.chordInstantRiseGate = Math.max(riseMed * 0.4, 0.006);
        }
        saveSettings();
    }

    // メッセージ＋適用ボタン
    const volChanged = recoVol !== state.clickVolume;
    const projTxt = (test.projClickMax != null) ? '（クリック音量' + recoVol + '%適用後の目安：約' + test.projClickMax.toFixed(3) + '）' : '';
    const lineTxt = (test.recommended != null) ? '反応ライン約' + test.recommended.toFixed(3) : '';
    if (!canApply) {
        els.recoMsg.className = 'test-reco-msg ng';
        els.recoMsg.classList.remove('hidden');
        els.recoMsg.textContent = 'ストローク音がほとんど入っていません。もう少し大きめに弾くか、マイクに近づけてください。';
    } else if (btInputLooksStrong) {
        els.recoMsg.className = 'test-reco-msg';
        els.recoMsg.classList.remove('hidden');
        els.recoMsg.textContent = '入力は十分あります。Bluetoothイヤホン向けに、反応ラインを少し高めに設定します（' + lineTxt + '）。';
    } else if (lowInputTuned) {
        els.recoMsg.className = 'test-reco-msg';
        els.recoMsg.classList.remove('hidden');
        els.recoMsg.textContent = 'イヤホンなどの小さめ入力に合わせて、高感度寄りの設定を作りました（' + lineTxt + '）。';
    } else if (cannotSeparate) {
        // クリック音量を下げてもクリックがストローク最小に近い/超える＝反応ラインだけでは分離不可
        els.recoMsg.className = 'test-reco-msg warn';
        els.recoMsg.classList.remove('hidden');
        els.recoMsg.textContent = 'この環境ではクリック音とストローク音の大きさが近く、反応ラインだけでは分けにくいです。'
            + 'クリック音量を ' + recoVol + '% 以下に下げるか、イヤホンのご利用をおすすめします。' + projTxt;
    } else if (highSens) {
        // 高感度寄り：手動で下げられることを案内（UIの「左＝反応しにくい」と整合）
        els.recoMsg.className = 'test-reco-msg';
        els.recoMsg.classList.remove('hidden');
        els.recoMsg.textContent = '小さいストロークも拾えるよう高感度寄りにしています（' + lineTxt + '）。周囲の音に反応する場合は手動で少し下げてください。';
    } else {
        // クリックとストロークの間に反応ラインを置けたとき
        els.recoMsg.className = 'test-reco-msg';
        els.recoMsg.classList.remove('hidden');
        els.recoMsg.textContent = 'クリック音とストローク音の間に反応ラインを置きました（' + lineTxt + '）。'
            + (volChanged ? 'クリック音量を ' + recoVol + '% に下げると安定します。' : '') + projTxt;
    }
    // 反応ラインが提案できる or クリック音量を下げられる → 適用ボタンを出す
    if (canApply || volChanged) els.recoApplyBtn.classList.remove('hidden');
    else els.recoApplyBtn.classList.add('hidden');

    // ここに来る時点で自動再テストは行わない（8/8で成功、または自動再テストを使い切った後）。
    // 自動再テストを使い切ってもまだ検出不足のときだけ、注意文＋手動「もう1度テスト」ボタンを出す。
    const totalNotes = test.notes.length || 8;
    const detected = test.strokeDetected || 0;
    const stillShort = detected < totalNotes && (detected <= 4 || isLowInputTestEnv() || provisional);
    const retestExhausted = stillShort && (test.autoRetestCount || 0) >= MAX_AUTO_RETEST;
    if (els.recoRetest) {
        if (retestExhausted) {
            els.recoRetest.className = 'test-reco-msg warn';
            els.recoRetest.textContent = 'ストロークがまだ十分に拾えていません。イヤホンマイクがギターから離れている可能性があります。'
                + 'マイク位置を近づけるか、手動設定で反応ラインを調整してください。';
            els.recoRetest.classList.remove('hidden');
        } else {
            els.recoRetest.classList.add('hidden');
        }
    }
    if (els.recoRetestBtn) els.recoRetestBtn.classList.toggle('hidden', !retestExhausted);

    // ── 自動おすすめ時のイヤホン案内（v0.9.56）──
    // auto のまま低入力/イヤホンっぽい入力が拾われたら、入力タイプ変更を「案内」する（自動切替はしない）。
    if (els.autoEarphoneHint) {
        const earphoneLike = lowInputTuned || isLowInputTestEnv() || lowInput || !!test.rescueHighSens;
        const showHint = isAutoMicInput() && hasAnyInput && earphoneLike;
        if (showHint) {
            els.autoEarphoneHint.textContent = 'イヤホン接続の可能性があります。うまく判定されない場合は、入力タイプを「イヤホン接続」に変更してください。';
        }
        els.autoEarphoneHint.classList.toggle('hidden', !showHint);
    }

    if (MIC_DEBUG) {
        const sp = test.strokePeaks || [];
        const avg = sp.length ? sp.reduce((a, b) => a + b, 0) / sp.length : null;
        console.debug('[mic-test] finalize', {
            inputType: getMicInputType(),
            headphoneType: getHeadphoneType(),
            isBluetooth: isBluetoothHeadphone(),
            currentThreshold: +mic.threshold.toFixed(4),
            lowInputBeforeBtOverride, lowInput, lowInputTuned,
            btInputLooksStrong,
            strokeMin: minStroke != null ? +minStroke.toFixed(4) : null,
            strokeMax: maxStroke != null ? +maxStroke.toFixed(4) : null,
            strokeMaxRaw: maxStrokeRaw != null ? +maxStrokeRaw.toFixed(4) : null,
            strokeAvg: avg != null ? +avg.toFixed(4) : null,
            strokeP95: strokeP95 != null ? +strokeP95.toFixed(4) : null,
            displayedMeterMax: strokeDisplayMax != null ? +strokeDisplayMax.toFixed(3) : null,
            displayedMeterAvg: strokeDisplayAvg != null ? +strokeDisplayAvg.toFixed(3) : null,
            strokeRawPeaks: sp.map((v) => +v.toFixed(4)),
            noiseP95: +(test.noiseP95 || 0).toFixed(4),
            noiseMax: +(test.noiseMax || 0).toFixed(4),
            maxClick: +maxClick.toFixed(4),
            recommendedThreshold: test.recommended != null ? +test.recommended.toFixed(4) : null,
            recoCooldownMs: test.recoCooldown,
            doubleCount: test.strokeDoubleCount || 0,
        });
    }

    updateTestDetail(maxClick, minStroke, maxStroke, clickReacted, canApply, maxStrokeRaw, provisional);
}

/* 詳細なテスト結果（折りたたみ）：数値＋レベルバー視覚化 */
function updateTestDetail(maxClick, minStroke, maxStroke, clickReacted, canApply, maxStrokeRaw, provisional) {
    const fx = (v) => (v != null ? v.toFixed(3) : '–');
    // レベルバー：小さい入力（iPhone等）でも見えるよう 0〜0.1 を 0〜100% にマップ
    const SCALE = 0.1;
    const pos = (v) => Math.max(0, Math.min(100, (v / SCALE) * 100));
    if (els.barClick) els.barClick.style.left = pos(maxClick) + '%';
    if (els.barStroke) els.barStroke.style.left = (minStroke != null ? pos(minStroke) : 0) + '%';
    if (els.barLine) {
        els.barLine.style.display = (test.recommended != null) ? 'block' : 'none';
        if (test.recommended != null) els.barLine.style.left = pos(test.recommended) + '%';
    }
    if (els.barZone) {
        if (minStroke != null && maxClick < minStroke) {
            els.barZone.style.display = 'block';
            els.barZone.style.left = pos(maxClick) + '%';
            els.barZone.style.width = Math.max(0, pos(minStroke) - pos(maxClick)) + '%';
        } else {
            els.barZone.style.display = 'none';
        }
    }
    // 数値（小さく）。受付中最大はユーザー向けには出さない（内部デバッグのみ）。min/max は「最小 / 最大」順で統一。
    const clickLabel = clickReacted === 0 ? '反応なし' : (clickReacted + ' / ' + CLICK_TEST_COUNT + ' 回反応');
    const recoSensLabel = (test.recommended != null) ? (recoSensDisplay(test.recommended, test.lowInputTuned) + '%') : '—';
    const rawMax = (maxStrokeRaw != null) ? maxStrokeRaw : test.maxStrokeRaw; // 内部用
    const rows = [
        ['クリック音', clickLabel],
        ['ストローク', test.strokeDetected + ' / ' + (test.notes.length || STROKE_TEST_COUNT) + ' 回検出'],
        ['クリック音 最大', fx(maxClick)],
        ['クリック音量' + (test.recoClickVolume != null ? test.recoClickVolume : state.clickVolume) + '%適用後の目安', (test.projClickMax != null ? '約' + fx(test.projClickMax) : '–')],
        ['ダウン 最小 / 最大', fx(test.downMin) + ' / ' + fx(test.downMax)],
        ['アップ 最小 / 最大', fx(test.upMin) + ' / ' + fx(test.upMax)],
        ['全ストローク 最小 / 最大', fx(minStroke) + ' / ' + fx(maxStroke)],
        ['環境ノイズ 最大 / p95', fx(test.noiseMax) + ' / ' + fx(test.noiseP95)],
        ['ストローク反応ライン超過時間', (test.strokeAboveMedian != null ? Math.round(test.strokeAboveMedian) + 'ms' : '–')],
        ['現在の反応ライン', fx(mic.threshold)],
        ['テスト検出しきい値', fx(test.strokeDetectThreshold || testStrokeThreshold())],
        ['おすすめ反応ライン', recoSensLabel + (test.recommended != null ? '（' + test.recommended.toFixed(3) + (provisional ? '・仮' : '') + '）' : '')],
        ['おすすめクリック音量', (test.recoClickVolume != null ? test.recoClickVolume + '%' : '–')],
        ['おすすめ二重反応防止', (test.recoCooldown != null ? test.recoCooldown + 'ms' : '–')],
        ['二重反応', test.strokeDoubleCount + ' 回'],
    ];
    // コードストロークモード：観察値（開発用）を追加表示
    if (state.strokeDetectMode === 'chord') {
        const d = test.strokeChordDiag || [];
        const med = (arr) => { const v = arr.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
        const fxm = (v) => (v != null ? Math.round(v) + 'ms' : '–');
        rows.push(['― コードストローク観察 ―', '']);
        rows.push(['　超過時間 中央値', fxm(med(d.map((x) => x.aboveMs)))]);
        rows.push(['　余韻含む全幅 中央値', fxm(med(d.map((x) => x.fullSpanMs)))]);
        rows.push(['　立ち上がり速度 中央値', (med(d.map((x) => x.riseMax)) != null ? med(d.map((x) => x.riseMax)).toFixed(3) : '–')]);
        rows.push(['　ピーク到達 中央値', fxm(med(d.map((x) => x.timeToPeakMs)))]);
        rows.push(['　余韻中の再ピーク 合計', d.reduce((a, x) => a + (x.rePeaks || 0), 0) + ' 回']);
        rows.push(['　現状ロジックで二重反応', d.filter((x) => x.onsets >= 2).length + ' / ' + d.length + ' ストローク']);
        rows.push(['　コード用最小クールダウン', state.chordMinCooldown + 'ms']);
        rows.push(['　谷からの上昇ゲート', state.chordRiseGate.toFixed(3)]);
        rows.push(['　瞬間上昇ゲート', state.chordInstantRiseGate.toFixed(3)]);
    }
    const numbers = rows.map((r) => '<div class="tds-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');

    // 説明文（要点を短く・3点まで）
    const exps = [];
    exps.push('<p class="tds-note">反応ラインは<b>ストロークを拾うため低め</b>。クリック音はラインを上げず<b>音量で下げます</b>（補助なので小さくてOK）。</p>');
    if (test.recoClickVolume != null && test.recoClickVolume < state.clickVolume) {
        exps.push('<p class="tds-note"><b>クリック音量を ' + test.recoClickVolume + '%</b> に下げると安定します。</p>');
    }
    if (test.strokeDoubleCount > 0) {
        exps.push('<p class="tds-note tds-warn">二重反応あり。<b>二重反応防止を ' + test.recoCooldown + 'ms</b> に。</p>');
    }

    if (els.testDetailStats) {
        els.testDetailStats.innerHTML = exps.join('') + '<div class="tds-numbers">' + numbers + '</div>';
    }
}

function applyReco() {
    // 反応ライン・クリック音量・二重反応防止を、計算できたものはまとめて適用する。
    const lineChanged = (test.recommended != null);
    const volChanged = (test.recoClickVolume != null && test.recoClickVolume !== state.clickVolume);
    if (!lineChanged && !volChanged && test.recoCooldown === mic.cooldownMs) return; // 変更なし
    if (lineChanged) {
        mic.threshold = Math.max(THR_MIN, Math.min(THR_MAX, test.recommended));
        // 低入力テスト由来かを記録。手動設定の表示%もテスト結果と同じ低入力スケールにそろえる。
        mic.lowInputProfile = !!test.lowInputTuned;
        if (MIC_DEBUG) {
            console.debug('[mic-test] applyReco', {
                savedThreshold: +mic.threshold.toFixed(4),
                lowInputProfile: mic.lowInputProfile,
                inputType: getMicInputType(),
                headphoneType: getHeadphoneType(),
                isBluetooth: isBluetoothHeadphone(),
            });
        }
    }
    if (test.recoClickVolume != null) state.clickVolume = test.recoClickVolume;
    if (test.recoCooldown != null) mic.cooldownMs = test.recoCooldown;
    // 内部値→スライダー・数値・マーカー・プレビューを同期
    applySettingsToUI();
    drawMicPreview();
    saveSettings();
    test.clickDone = false; test.strokeDone = false;
    els.testReco.classList.add('hidden');
    // 反応ライン未適用（クリック音量だけ下げた）場合は、再テストを促す
    setTestResult(lineChanged ? 'おすすめ設定を適用しました。' : 'クリック音量を下げました。もう一度テストしてください。', 'ok');
    // v0.9.61〜：反応ラインを適用できたら、次のステップ（補正系だけ）を表示
    if (lineChanged) {
        setupProgress.recoApplied = true;
        // テストをやり直して適用したら、補正系以降は未完了へ戻す
        setupProgress.correctionDone = false;
        // 反応ラインが変わったので前回の実践テスト結果は無効化する
        invalidatePracticeResult();
        wizardEditing = null;
        if (settingsView === 'steps') {
            renderSettingsView();
            // 次に進むステップのカードへスクロール（有線イヤホンは補正を飛ばして最終確認テストへ・v0.9.89）
            const nextCard = wizardStepCards(activeWizardStep())[0];
            scrollToSettingsEl(nextCard || els.ptCard);
        }
    }
}

function stopMic() {
    mic.on = false;
    cancelAnimationFrame(mic.raf);
    cancelCalibration();
    if (mic.src) { try { mic.src.disconnect(); } catch (_) { } }
    if (mic.stream) mic.stream.getTracks().forEach((t) => t.stop());
    mic.stream = null; mic.src = null; mic.analyser = null; mic.buf = null;
    if (els.micLevel) { els.micLevel.style.width = '0%'; els.micLevel.classList.remove('over'); }
    if (els.micClickHint) els.micClickHint.classList.add('hidden');
    exitTestMode();
    updateMicUI();
    updateTestMicState();
}

function toggleMic() {
    mic.on ? stopMic() : startMic();
}

function micLoop() {
    if (!mic.on || !mic.analyser) return;
    mic.analyser.getFloatTimeDomainData(mic.buf);
    let peak = 0;
    for (let i = 0; i < mic.buf.length; i++) {
        const a = Math.abs(mic.buf[i]);
        if (a > peak) peak = a;
    }
    // 表示用エンベロープ（速いアタック／遅いリリース）
    mic.env = Math.max(peak, mic.env * 0.86);
    if (els.micLevel) {
        els.micLevel.style.width = (micDisplayFrac(mic.env) * 100).toFixed(1) + '%';
        els.micLevel.classList.toggle('over', peak >= mic.threshold);
    }

    const now = performance.now();

    // 背景波形用にエンベロープを時系列バッファへ保存（古いものは破棄）
    const hist = state.micWaveHistory;
    hist.push({ perf: now, level: mic.env });
    while (hist.length && (now - hist[0].perf) > MIC_WAVE_WINDOW_MS) hist.shift();

    // 結果レーン再描画用：演奏全区間の音量履歴を「補正後ゲーム時刻」で保存（判定・音符と同一時間軸）。
    // STAGE中と同じ mic.env を使うので、結果レーンでもストロークごとにピークが立つ同等の波形になる。
    if (state.running) {
        const rw = state.micRunWave;
        const gtw = gameAudioMs() + micJudgeOffsetMs();
        if (!rw.length || gtw - rw[rw.length - 1].t >= 12) rw.push({ t: gtw, level: mic.env }); // ~12ms間引き
    }

    // 立ち上がり検出：threshold交差 または 音量の急増（rise）。
    // クリック音ON/OFFで基本ロジックは共通。余韻中でも急増を拾えるようにする。
    const rise = peak - mic.prevPeak;
    // 本番STAGE（再生中）だけ、表示の反応ラインより少し低い検出しきい値で拾いやすくする（表示は不変）。
    const detThr = state.running ? (mic.threshold * MIC_STAGE_DETECT_FACTOR) : mic.threshold;
    const crossed = peak >= detThr && mic.prevPeak < detThr;
    const bigRise = peak >= detThr && rise >= RISE_DELTA;
    // 穏やかな立ち上がりも拾うヒステリシス。detThr×再アーム係数 を下回ったら再アーム、
    // アーム中に detThr を超えたら1回だけ候補にする。
    if (peak < detThr * MIC_REARM_FACTOR) mic.armed = true;
    const sustainedOnset = MIC_SUSTAINED_ONSET && mic.armed && peak >= detThr;
    // ★ストローク検出モードの分岐点。現状は brush / chord ともに同じ立ち上がり検出（chordはまだ仮ロジック）。
    //   今後 chord 専用に「急増(rise)条件を必須化／再アーム条件を余韻向けに調整」などをここで足す予定。
    //   ＝ chord モードでもPLAY挙動は現状ブラッシングと同じ（観察はマイク反応テストのログで行う）。
    const onset = crossed || bigRise || sustainedOnset;
    if (onset) mic.armed = false;
    if (onset) mic.lastOnsetAt = now; // 実打直後だけ beatMicPeak を記録するための基点
    const trigger = crossed ? 'threshold交差' : (bigRise ? 'large-rise' : 'sustained');

    // ── キャリブレーション中：クリック音→検出の遅延だけを測る（通常判定には流さない）──
    if (mic.calibrating) {
        // モニター（レベル＋反応ライン＋統計）
        cal.lastLevel = peak;
        if (peak > cal.maxPeak) cal.maxPeak = peak;
        if (els.calLevel) {
            els.calLevel.style.width = (micDisplayFrac(peak) * 100).toFixed(1) + '%';
            els.calLevel.classList.toggle('over', peak >= mic.threshold);
        }
        // 1クリック1検出：各クリックの検出ウィンドウ内で「最初の有効オンセット1つだけ」を採用する。
        // 余韻・反響・二重ピークは同じクリックの追加検出として数えない（Macでクリック音が大きく拾われる環境の過剰検出対策）。
        if (onset) {
            cal.rawOnsets++;
            cal.lastDetect = now;
            const d = now - cal.lastClickPerf;
            if (cal.clickArmed && d >= CAL_DETECT_WIN_FROM && d <= CAL_DETECT_WIN_TO) {
                cal.samples.push(d);
                cal.clickArmed = false; // このクリックは検出済み → 以降のピークは無視
            } else if (cal.clickArmed && d > CAL_DETECT_WIN_TO) {
                cal.outOfRange++;       // ウィンドウ外（遅すぎ）：このクリックは未検出のまま
            }
        }
        updateCalMonitor();
        mic.prevPeak = peak;
        mic.raf = requestAnimationFrame(micLoop);
        return;
    }

    // ── マイク遅れ補正（v0.9.80・Bluetooth用）：クリックに対する入力時刻だけを集める（registerHit/スコアには流さない）──
    if (bt.active) {
        if (els.btCalLevel) {
            els.btCalLevel.style.width = (micDisplayFrac(peak) * 100).toFixed(1) + '%';
            els.btCalLevel.classList.toggle('over', peak >= mic.threshold);
        }
        // 流れるレーン用の波形バッファ（flowStart基準・表示専用。v0.9.81）
        const waveT = now - bt.flowStartPerf;
        bt.wave.push({ t: waveT, level: mic.env });
        while (bt.wave.length && (waveT - bt.wave[0].t) > PT_WAVE_WINDOW_MS) bt.wave.shift();
        if (bt.capturing) {
            // 判定と同じ「オーディオ時計＋判定オフセット（現在のBT補正込み）」で時刻化する。
            const tMs = (state.audioCtx.currentTime - bt.audioStart) * 1000 + micJudgeOffsetMs();
            if (peak > bt.maxPeak) bt.maxPeak = peak;
            // 立ち上がり検出（STAGEと同じ検出しきい値・ブラッシング型）。手拍子/軽いストロークの鋭いアタックを拾う。
            const btDetThr = ptDetectionThreshold();
            const btCrossed = peak >= btDetThr && mic.prevPeak < btDetThr;
            const btBigRise = peak >= btDetThr && rise >= RISE_DELTA;
            if (peak < btDetThr * MIC_REARM_FACTOR) bt.armed = true;
            const btSustained = MIC_SUSTAINED_ONSET && bt.armed && peak >= btDetThr;
            const btOnset = btCrossed || btBigRise || btSustained;
            if (btOnset) {
                bt.armed = false;
                bt.lastOnsetAt = now;
                const guarded = isClickGuardedOnset(now, peak, btLatestClickPerf(now), true);
                const cooled = (now - bt.lastDetectAt) > mic.cooldownMs;
                if (!guarded && cooled) {
                    bt.lastDetectAt = now;
                    bt.onsets.push({ t: tMs, peak });
                }
            }
        }
        mic.prevPeak = peak;
        mic.raf = requestAnimationFrame(micLoop);
        return;
    }

    // ── 最終確認テスト（v0.9.58）：音量波形・オンセット・拍ごとの判定を記録（registerHit/スコアには流さない）──
    if (pt.active) {
        // 音量波形バッファ（flowStart基準の時刻でenv履歴を保存）
        const waveT = now - pt.flowStartPerf;
        pt.wave.push({ t: waveT, level: mic.env });
        while (pt.wave.length && (waveT - pt.wave[0].t) > PT_WAVE_WINDOW_MS) pt.wave.shift();
        // 見返し用：全区間を間引きせず保持（~12ms間引き・上限ありで暴走防止）。v0.9.74
        if (pt.fullWave.length < 4000) {
            const fw = pt.fullWave;
            if (!fw.length || waveT - fw[fw.length - 1].t >= 12) fw.push({ t: waveT, level: mic.env });
        }
        if (pt.capturing) {
            // STAGEと同じ「オーディオ時計＋判定オフセット」で時刻化（補正値は読むだけ・変更しない）
            const tMs = (state.audioCtx.currentTime - pt.audioStart) * 1000 + micJudgeOffsetMs();
            const ni = Math.round((tMs - pt.playT0Ms) / PT_BEAT_MS);
            // 各拍のpeakは許容窓内なら更新（v0.9.78）。最寄り拍だけだとMISS拍の波形ヒントが欠ける。
            for (let bi = 0; bi < PT_PLAY_BEATS; bi++) {
                const bd = tMs - (pt.playT0Ms + bi * PT_BEAT_MS);
                if (Math.abs(bd) <= PT_NEAR_WIN && peak > pt.notes[bi].peak) pt.notes[bi].peak = peak;
            }
            if (peak > pt.maxPeak) pt.maxPeak = peak;
            const ptDetThr = ptDetectionThreshold();
            if (peak >= ptDetThr) ptDebugCount('totalPeaksOverThreshold');
            // 直前検出後の谷（コードストローク：谷からの上昇量の基準）。STAGEの mic.valley とは別に追跡。
            if (peak < pt.valley) pt.valley = peak;
            const chordMode = (state.strokeDetectMode === 'chord');
            // ── オンセット判定（v0.9.73/0.9.77）────────────────────────────
            //  コードストローク：コード用ゲートで弾き始めだけを拾う。
            //  ブラッシング    ：従来どおりの立ち上がり検出。ただし割り当ては ptAssignOnset に任せる。
            let ptOnset;
            if (chordMode) {
                const sinceHit = now - pt.lastDetectAt;
                const riseFromValley = peak - pt.valley;
                const instantRise = peak - mic.prevPeak;
                ptOnset = (peak >= mic.threshold)
                    && (sinceHit >= state.chordMinCooldown)
                    && (riseFromValley >= state.chordRiseGate)
                    && (instantRise >= state.chordInstantRiseGate);
                if (!ptOnset && peak >= mic.threshold && instantRise >= state.chordInstantRiseGate * 0.5) {
                    ptLogReject(tMs, peak, 'codeGate', {
                        sinceHit: Math.round(sinceHit),
                        riseFromValley: +riseFromValley.toFixed(3),
                        instantRise: +instantRise.toFixed(3),
                    });
                }
            } else {
                const ptCrossed = peak >= ptDetThr && mic.prevPeak < ptDetThr;
                const ptBigRise = peak >= ptDetThr && rise >= RISE_DELTA;
                if (peak < ptDetThr * MIC_REARM_FACTOR) pt.armed = true;
                const ptSustainedOnset = MIC_SUSTAINED_ONSET && pt.armed && peak >= ptDetThr;
                ptOnset = ptCrossed || ptBigRise || ptSustainedOnset;
                if (ptOnset) pt.armed = false;
            }
            if (ptOnset) {
                pt.lastOnsetAt = now;
                ptDebugCount('detected');
                const guarded = isPtClickGuardedOnset(now, peak, ptLatestClickPerf(now));
                if (guarded) {
                    ptLogReject(tMs, peak, 'clickGuard', {
                        sinceClick: Math.round(now - ptLatestClickPerf(now)),
                    });
                } else if (chordMode) {
                    // コード：ゲート通過＝新規アタック。割り当てはSTAGE本体に近い ptAssignOnset で行う。
                    const assigned = ptAssignOnset(tMs, peak);
                    if (assigned) {
                        pt.lastDetectAt = now;
                        pt.valley = peak; // 谷リセット（STAGE chord と同じ）
                    }
                    pt.onsets.push({ t: tMs, peak, assigned });
                } else {
                    // ブラッシング：直前採用からクールダウン以内は登録せず、強い別アタックだけ二重反応として数える。
                    const cooled = (now - pt.lastDetectAt) > mic.cooldownMs;
                    if (cooled) {
                        const assigned = ptAssignOnset(tMs, peak);
                        if (assigned) pt.lastDetectAt = now;
                        pt.onsets.push({ t: tMs, peak, assigned });
                    } else {
                        ptLogReject(tMs, peak, 'cooldown', {
                            sinceDetect: Math.round(now - pt.lastDetectAt),
                        });
                        const strongInput = peak >= mic.threshold * DOUBLE_MIN_PEAK_FACTOR;
                        const enoughGap = (now - pt.lastDetectAt) >= DOUBLE_MIN_GAP_MS;
                        if (strongInput && enoughGap && ni >= 0 && ni < PT_PLAY_BEATS) {
                            pt.notes[ni].doubled = true;
                            pt.doubleCount++;
                        }
                    }
                }
            }
        }
        mic.prevPeak = peak;
        mic.raf = requestAnimationFrame(micLoop);
        return;
    }

    // ── 実音テスト（設定画面）：registerHit/スコアには一切流さない ──
    if (test.active) {
        if (els.testLevel) {
            els.testLevel.style.width = (micDisplayFrac(peak) * 100).toFixed(1) + '%';
            els.testLevel.classList.toggle('over', peak >= mic.threshold);
        }
        // 環境音測定中：レベルを蓄積（補正用反応ラインの下限に使う）
        if (test.mode === 'noise') {
            test.noiseSamples.push(peak);
            mic.prevPeak = peak;
            mic.raf = requestAnimationFrame(micLoop);
            return;
        }
        // 計測窓内のピークを追跡（しきい値に関係なく生ピークを記録）
        const inClickWin = test.mode === 'click' && now >= test.clickWinFrom && now <= test.clickWinTo;
        const inStrokeWin = test.mode === 'stroke' && now >= test.strokeFrom && now <= test.strokeUntil;
        if (inClickWin || inStrokeWin) test.curPeak = Math.max(test.curPeak, peak);
        // ストローク窓内：反応ラインを超えている連続時間(最長)を計測（二重反応防止の推奨に使う）
        if (inStrokeWin) {
            if (peak >= mic.threshold) {
                if (!test.curAbove) { test.curAbove = true; test.curAboveStart = now; }
                const dur = now - test.curAboveStart;
                if (dur > test.curAboveMax) test.curAboveMax = dur;
                // 余韻含む全幅用：最初に超えたフレーム・最後に超えていたフレーム（フレームベースで必ず整合）
                if (test.curFirstAboveT === 0) test.curFirstAboveT = now;
                test.curLastAboveT = now;
            } else {
                test.curAbove = false;
            }
            // コードストローク観察：立ち上がり速度・ピーク到達時刻
            const r = peak - mic.prevPeak;
            if (r > test.curRiseMax) test.curRiseMax = r;             // 立ち上がり速度
            if (peak >= test.curPeak && peak >= mic.threshold) test.curPeakT = now; // ピーク到達時刻
        }
        // コードストローク時：テスト全体の波形を間引き記録（consoleダンプ用・最大~1200点）
        if (state.strokeDetectMode === 'chord' && test.mode === 'stroke' && test.chordWave.length < 1200) {
            const cw = test.chordWave;
            if (!cw.length || now - cw[cw.length - 1].pt >= 12) {
                cw.push({ pt: now, t: Math.round(now - test.flowStart), env: +mic.env.toFixed(3), peak: +peak.toFixed(3) });
            }
        }
        // オンセット：表示更新＋ストローク窓内の二重反応カウント
        if (onset && (now - test.lastInputAt) > 90) {
            test.lastInputAt = now;
            const ratio = mic.threshold > 0 ? (peak / mic.threshold) : 0;
            if (els.testLevelVal) els.testLevelVal.textContent = peak.toFixed(2) + ' (×' + ratio.toFixed(1) + ')';
            if (inStrokeWin) test.curOnsets++;
        }
        mic.prevPeak = peak;
        mic.raf = requestAnimationFrame(micLoop);
        return;
    }

    // 二重反応防止（クールダウン）の基点は「登録できた検出」のみ。
    // クリック音拾い等の除外検出では基点を更新しない（本物のストロークを巻き込まないため）。
    const cooled = (now - mic.lastDetect) > mic.cooldownMs;
    // クリック音直後の最小ガード（詳細設定）。クリック音ON時のみ・既定は短い。
    const guardActive = state.clickEnabled;
    const guardMs = guardActive ? (mic.clickGuardMs + clickLatencyMs()) : 0;
    // ★lastClickPerf は先読みスケジューラで「未来のクリック時刻」になり得る。
    //   ガードは実際にクリックが鳴った直後だけに限定する（クリック発音前〜直前は除外しない）。
    //   これをしないと、4分ジャストでクリックと同時に弾いたストロークが大量に弾かれてしまう。
    const sinceClick = now - state.lastClickPerf;
    const inGuard = guardActive && sinceClick >= -10 && sinceClick <= guardMs;
    // ガード中でも、しきい値の STRONG_STROKE_FACTOR 倍以上に大きい音はストロークとして通す。
    // 反応ラインはおすすめ適用後クリック音より上に置かれるため、ライン超え＝ストロークとみなし、低めの係数で通す。
    const strongEnough = peak >= mic.threshold * STRONG_STROKE_FACTOR;
    // カウントイン中はマイク検出を無視。ただし本編開始T0の直前（半拍以内）は1拍目の早め入力として通す
    // （ここを T0 ちょうどにすると、少し早く弾いた1拍目が除外され、余韻だけ残って「タイミング外」に化ける）。
    const inCountIn = state.running && state.currentTime < (state.T0 - state.beatInterval * 0.5);

    // 各拍の判定窓内で観測した最大マイク入力を記録（MISS原因の切り分け・波形表示用。判定には不使用）。
    // ★判定(registerHit)と完全に同じ「補正後オーディオ時刻」で拍を割り当てる。
    //   ここを補正前にすると、境界付近で音量の記録拍と判定拍がズレ、音量十分なのに別拍が
    //   「入力ありMISS/タイミング外」に見える原因になる（今回の不具合）。
    let nearestBeat = -1;
    if (state.running && !inCountIn) {
        const gt = gameAudioMs() + micJudgeOffsetMs(); // 判定と同一基準（マイク補正込み）
        const bi2 = state.beatInterval;
        const bIdx = Math.round((gt - state.T0) / bi2);
        if (bIdx >= 0 && bIdx < TOTAL_BEATS) {
            nearestBeat = bIdx;
            // ★「実打(オンセット)直後 STRIKE_ACTIVE_MS の間」かつ「拍中心の近く(±0.32拍)」のときだけ記録する。
            //   こうすると、減衰中の余韻が次拍の窓に染み出して、弾いていない拍が音量ありに見えるのを防げる
            //   （= 弾いていない拍が「判定済み/余韻」に化けるのを抑制）。
            const win = bi2 * 0.32;
            const beatT = state.T0 + bIdx * bi2;
            const activeStrike = (now - mic.lastOnsetAt) <= STRIKE_ACTIVE_MS;
            if (activeStrike && Math.abs(gt - beatT) <= win && peak > state.beatMicPeak[bIdx]) {
                state.beatMicPeak[bIdx] = peak;
            }
        }
    }

    // 直前入力後の谷（最小音量）を追跡（コードストローク：谷からの上昇量の基準）
    if (state.running && !inCountIn && peak < mic.valley) mic.valley = peak;

    // ── コードストローク専用検出（chordモード・STAGE再生中のみ）──────────────────
    //   反応ライン超過だけでなく「新しいアタックか」を見る：直前入力からの時間・谷からの上昇量・瞬間上昇量。
    //   余韻中の小さな再ピーク（ゲート未満／クールダウン中）は無視する。ブラッシングロジックは使わない。
    if (state.strokeDetectMode === 'chord' && state.running) {
        const sinceHit = now - mic.lastDetect;
        const riseFromValley = peak - mic.valley;
        const instantRise = peak - mic.prevPeak;
        // 立ち上がり未検出MISSの原因分析用：拍ごとに候補フレームの情報を記録（判定には不使用）。
        if (!inCountIn && nearestBeat >= 0) {
            let pb = state.chordBeatProbe[nearestBeat];
            if (!pb) pb = state.chordBeatProbe[nearestBeat] = { maxPeak: 0, maxEnv: 0, bestInstantRise: 0, bestRiseFromValley: 0, cooldownBlocked: false, offsetMs: 0 };
            if (peak > pb.maxPeak) {
                pb.maxPeak = peak;
                pb.offsetMs = Math.round((gameAudioMs() + micJudgeOffsetMs()) - (state.T0 + nearestBeat * state.beatInterval));
            }
            if (mic.env > pb.maxEnv) pb.maxEnv = mic.env;
            if (peak >= mic.threshold) {
                if (instantRise > pb.bestInstantRise) pb.bestInstantRise = instantRise;
                if (riseFromValley > pb.bestRiseFromValley) pb.bestRiseFromValley = riseFromValley;
                // 谷上昇・瞬間上昇は満たすがクールダウン中で弾かれた（＝本当は新アタックだった可能性）
                if (riseFromValley >= state.chordRiseGate && instantRise >= state.chordInstantRiseGate && sinceHit < state.chordMinCooldown) pb.cooldownBlocked = true;
            }
        }
        const chordOnset = (peak >= mic.threshold)
            && (sinceHit >= state.chordMinCooldown)
            && (riseFromValley >= state.chordRiseGate)
            && (instantRise >= state.chordInstantRiseGate);
        // 余韻中などで「立ち上がりらしいが条件未達」を無視としてカウント（観察用）
        if (!chordOnset && !inCountIn && peak >= mic.threshold && instantRise >= state.chordInstantRiseGate * 0.5
            && (sinceHit < state.chordMinCooldown || riseFromValley < state.chordRiseGate || instantRise < state.chordInstantRiseGate)) {
            state.chordIgnoredRePeaks++;
        }
        if (chordOnset) {
            mic.inputCount++; flashDetect(peak); mic.lastOnsetAt = now;
            let outcome = 'chord-register', aBeat = null, aCls = null;
            if (inCountIn) {
                micExclude('カウントイン中'); outcome = 'カウントイン中';
            } else {
                const ok = registerHit(now, 'mic');
                const la = mic.lastAssign || {};
                outcome = ok ? 'chord-register' : (la.outcome || '範囲外');
                aBeat = (la.beat != null) ? la.beat : null; aCls = la.cls || null;
                if (ok) {
                    mic.lastDetect = now; mic.valley = peak; mic.doubleCounted = false;
                    mic.registerCount++; state.chordPicked++; updateMicDiag();
                } else micExclude('範囲外');
            }
            if (state.micEventLog && state.micEventLog.length < 200) {
                state.micEventLog.push({ t: Math.round(gameAudioMs() + micJudgeOffsetMs()), peak: +peak.toFixed(3), nearBeat: nearestBeat, trigger: 'chord', outcome, assignedBeat: aBeat, cls: aCls });
            }
            updateMicDiag();
        }
        mic.prevPeak = peak;
        if (!state.running) drawLane(state.currentTime);
        mic.raf = requestAnimationFrame(micLoop);
        return; // コードストロークはここで完了（ブラッシングの分岐へは進まない）
    }

    if (onset) {
        mic.inputCount++;                 // ① 入力検出（反応ライン超え／急増）
        flashDetect(peak);                // 入力検出の視覚フィードバック（診断は常時）
        console.debug('[mic] 入力 peak=' + peak.toFixed(2) + ' thr=' + mic.threshold.toFixed(2)
            + ' (×' + (peak / mic.threshold).toFixed(1) + ') prev=' + mic.prevPeak.toFixed(2)
            + ' rise=' + rise.toFixed(2) + ' trigger=' + trigger
            + ' click=' + (state.clickEnabled ? 'ON' : 'OFF') + ' vol=' + state.clickVolume);
        let dbgOutcome = null, dbgAssign = null, dbgCls = null;
        if (!state.running) {
            micExclude('停止中'); dbgOutcome = '停止中';
        } else if (inCountIn) {
            micExclude('カウントイン中'); dbgOutcome = 'カウントイン中';
        } else if (!cooled) {
            // クールダウン中＝直前ストロークの余韻/複数ピークの可能性が高い。まず除外（再登録しない）。
            micExclude('二重反応防止'); dbgOutcome = '二重反応防止(クールダウン)';
            if (nearestBeat >= 0) state.beatExcluded[nearestBeat] = true;
            // 二重反応として数えるのは「明確に別の強い立ち上がり」だけ・1クールダウンにつき1回（余韻の多重カウント防止）。
            const freshAttack = (crossed || bigRise);
            const strongInput = peak >= mic.threshold * DOUBLE_MIN_PEAK_FACTOR;
            const enoughGap = (now - mic.lastDetect) >= DOUBLE_MIN_GAP_MS;
            if (state.running && !inCountIn && !mic.doubleCounted && freshAttack && strongInput && enoughGap) {
                mic.doubleCounted = true;          // この窓ではもう数えない
                state.doubleReactionCount++;
                if (nearestBeat >= 0) state.beatDoubled[nearestBeat] = true;
                els.latestVerdict.dataset.state = 'miss';
                els.latestVerdict.textContent = '⚠ 二重反応';
                spawnDoubleFx(); // PLAY中に二重反応を即座に視認できるように
                dbgOutcome = '二重反応';
            }
        } else if (inGuard && !strongEnough) {
            micExclude('クリック直後の無視');  // 詳細ガード
            if (nearestBeat >= 0) state.beatExcluded[nearestBeat] = true;
            dbgOutcome = 'クリックガード除外';
        } else {
            const ok = registerHit(now, 'mic'); // ② 判定登録（micオフセット適用）
            const la = mic.lastAssign || {};
            dbgOutcome = ok ? 'register' : (la.outcome || '範囲外');
            dbgAssign = (la.beat != null) ? la.beat : null;
            dbgCls = la.cls || null;
            if (ok) { mic.lastDetect = now; mic.doubleCounted = false; mic.registerCount++; updateMicDiag(); }
            else { micExclude('範囲外'); }
        }
        // MISS原因デバッグ：オンセットごとに「補正後時刻・ピーク・最寄り拍・結末・割り当て拍・分類」を記録
        if (state.running && state.micEventLog && state.micEventLog.length < 200) {
            state.micEventLog.push({
                t: Math.round(gameAudioMs() + micJudgeOffsetMs()),
                peak: +peak.toFixed(3),
                nearBeat: nearestBeat,
                trigger,
                outcome: dbgOutcome,
                assignedBeat: dbgAssign,
                cls: dbgCls,
            });
        }
        updateMicDiag();
    }
    mic.prevPeak = peak;

    // 再生中はゲームループが描画。停止中はここでレーンを再描画して波形を流す
    if (!state.running) drawLane(state.currentTime);

    mic.raf = requestAnimationFrame(micLoop);
}

/* ═══════════════════════════════════════════════════════════
   マイク補正キャリブレーション
   既知タイミングでクリックを鳴らし、マイク検出までの遅延を実測。
   中央値を遅延量とし、補正値 = -遅延 を提案する。
═══════════════════════════════════════════════════════════ */
/* 測定モニター（入力レベル・反応ライン・検出回数・直近/最大レベル）を更新 */
function updateCalMonitor() {
    if (els.calThreshold) els.calThreshold.style.left = micThresholdMarkerPct() + '%';
    if (els.calCount) els.calCount.textContent = cal.samples.length + '回';
    if (els.calLast) els.calLast.textContent = cal.lastLevel.toFixed(2);
    if (els.calMax) els.calMax.textContent = cal.maxPeak.toFixed(2);
    // 測定中は検出が来るたびに状況テキストも更新（クリック発音→検出の遅れで「検出」数が1つ遅れて
    // 見える問題への対策。micLoop から毎フレーム呼ばれるので検出反映が即座に表示へ届く）。
    if (mic.calibrating) renderCalMeasuringStatus();
}

/* 補正テスト中の状況テキスト。warm-up（準備）中と本番測定中で出し分け、
   本番は「測定中 X / 8　検出 Y / 8」で鳴らした数と検出数を一致表示する。 */
function renderCalMeasuringStatus() {
    if (!els.calStatus) return;
    const tail = '（補正用の音量' + cal.clickVol + '%・補正用反応ライン'
        + (cal.threshold != null ? cal.threshold.toFixed(3) : '–') + 'で実行中・STAGE設定には影響しません）';
    if (!cal.warmupDone) {
        // warm-up：実測ピークから補正用反応ラインを決めている最中（本番8回には数えない）。
        // 「本番測定ではない」ことが伝わるよう、アンバーのバッジで強調する（v0.9.67）。
        els.calStatus.innerHTML =
            '<span class="cal-warmup-badge">準備中</span>'
            + '<span class="cal-warmup-text">クリック音の大きさを確認しています。このあと 1 / ' + CAL_CLICKS + ' から本番測定を始めます。</span>'
            + '<span class="cal-status-tail">' + escapeHtml(tail) + '</span>';
        return;
    }
    els.calStatus.textContent = '測定中 ' + cal.i + ' / ' + CAL_CLICKS
        + '　検出 ' + cal.samples.length + ' / ' + CAL_CLICKS + tail;
}

function setCalUI(mode, arg) {
    if (!els.calStatus) return;
    const showMonitor = (on) => { if (els.calMonitor) els.calMonitor.classList.toggle('hidden', !on); };
    if (mode === 'measuring') {
        els.calStatus.classList.remove('hidden');
        renderCalMeasuringStatus();
        els.calResult.classList.add('hidden');
        els.calBtn.disabled = true;
        els.calBtn.classList.remove('is-todo'); // 測定中は赤系を外す
        showMonitor(true);
        updateCalMonitor();
    } else if (mode === 'result') {
        els.calStatus.classList.add('hidden');
        els.calResult.classList.remove('hidden');
        els.calDelay.textContent = cal.measuredDelay + 'ms';
        els.calOffset.textContent = (cal.proposedOffset > 0 ? '+' : '') + cal.proposedOffset + 'ms';
        if (els.calSuccess) els.calSuccess.textContent = cal.successCount + ' / ' + CAL_CLICKS;
        if (els.calSpread) els.calSpread.textContent = '±' + cal.spread + 'ms';
        els.calBtn.disabled = false;
        els.calBtn.textContent = calBtnIdleLabel();
        els.calBtn.classList.toggle('is-todo', !state.micDelayDone);
        showMonitor(false);
    } else if (mode === 'failed') {
        els.calStatus.classList.remove('hidden');
        els.calStatus.textContent = arg || '測定できませんでした。スピーカー音量、マイク許可、周囲の音を確認してください。';
        els.calResult.classList.add('hidden');
        els.calBtn.disabled = false;
        els.calBtn.textContent = calBtnIdleLabel();
        els.calBtn.classList.toggle('is-todo', !state.micDelayDone);
        showMonitor(false);
    } else if (mode === 'idle') {
        els.calStatus.classList.add('hidden');
        els.calResult.classList.add('hidden');
        els.calBtn.disabled = false;
        els.calBtn.textContent = calBtnIdleLabel();
        els.calBtn.classList.toggle('is-todo', !state.micDelayDone);
        showMonitor(false);
    }
}

/* マイク反応テストの結果から、補正テスト時に想定されるクリックのマイク入力ピークを見積もる。
   クリック音量に比例（clickAmp ∝ clickVolume/100）するので、測定時の音量から目的音量へ線形換算する。
   未測定なら null。 */
function expectedCalClickPeak(atVolume) {
    const measureVol = Math.max(1, test.clickMeasureVol || 0);
    if (!(test.maxClickPeak > 0) || measureVol < 1) return null;
    return test.maxClickPeak * (atVolume / measureVol);
}

/* 環境ノイズの下限。マイク反応テストの環境音測定（noiseP95/noiseMax）より十分上に置く。 */
function calNoiseFloor() {
    return Math.max((test.noiseP95 || 0) * 1.5, (test.noiseMax || 0) * 1.1, CAL_THR_FLOOR);
}

/* クリックピーク見込み(peak)と環境ノイズから補正用反応ラインを決める。
   環境ノイズより十分上・クリック最大より十分下・クリックに対して低すぎない位置。 */
function calThresholdFromPeak(peak, noiseFloor) {
    if (!(peak > 0)) return Math.max(CAL_THR_FLOOR, Math.min(CAL_THR_CEIL, noiseFloor));
    const bump = cal.noiseBump || 1;                                 // 直前がノイズ拾いなら上げる
    const clickBased = peak * CAL_THR_CLICK_FACTOR * bump;          // 立ち上がり本体を拾う
    const upper = Math.min(peak * CAL_THR_CAP_FACTOR, CAL_THR_CEIL); // クリック最大より十分下
    let thr = Math.max(noiseFloor, Math.min(upper, clickBased));
    return Math.max(CAL_THR_FLOOR, Math.min(CAL_THR_CEIL, thr));
}

/* 補正開始時の補正用反応ライン（マイク反応テストのクリック音量・環境ノイズから算出）。
   テスト未実施などで推定できないときは既定値。 */
function calibrationInitialThreshold(calVol) {
    const noiseFloor = calNoiseFloor();
    const est = expectedCalClickPeak(calVol);            // 補正テスト音量でのクリック最大見込み
    if (est == null || est <= noiseFloor) {
        // 推定不可 or クリックがノイズに埋もれる → ノイズフロア寄りの既定
        return Math.max(CAL_THR_FLOOR, Math.min(CAL_THR_CEIL, Math.max(noiseFloor, CAL_THR_DEFAULT)));
    }
    return calThresholdFromPeak(est, noiseFloor);
}

/* 補正テスト用クリック音量（STAGE用とは別）。STAGE本番では小さくても、補正テスト中だけは
   クリックを安定して拾うため十分上げる：最低 CAL_MIN_VOLUME、想定ピークが小さければさらに上げる。 */
function calibrationClickVolume() {
    let vol = Math.max(state.clickVolume, CAL_MIN_VOLUME); // まず最低音量を確保
    const measureVol = Math.max(1, test.clickMeasureVol || 0);
    if (test.maxClickPeak > 0 && measureVol >= 1) {
        const peakPerPct = test.maxClickPeak / measureVol;      // 1%あたりの想定ピーク
        if (peakPerPct > 0 && peakPerPct * vol < CAL_MIN_DETECT_PEAK) {
            // 安定検出に必要なピークに届くまで、さらに音量を引き上げる（補正テスト中のみ）
            vol = Math.max(vol, Math.ceil(CAL_MIN_DETECT_PEAK / peakPerPct));
        }
    }
    return Math.max(5, Math.min(100, Math.round(vol)));
}

/* キャリブレーション中だけ測定専用値を使う。開始時に退避し、終了/失敗/キャンセルで復元 */
function applyCalSettings() {
    cal.saved = {
        threshold: mic.threshold,
        cooldownMs: mic.cooldownMs,
        clickGuardMs: mic.clickGuardMs,
        clickVolume: state.clickVolume,
    };
    // ★補正テスト専用：クリックを拾う目的。STAGE用反応ライン(mic.threshold)とは別。
    //   反応ラインは「マイク反応テストのクリック音量・環境ノイズ」から算出する（環境音/余韻を拾わない位置）。
    //   1クリック目の実測ピークが取れたら、startCalibrationのタイマー内で一度だけ微調整する。
    const calVol = calibrationClickVolume();
    const calThr = calibrationInitialThreshold(calVol);
    cal.clickVol = calVol;
    cal.threshold = calThr;
    cal.rebaselined = false;      // 1クリック後の微調整は一度だけ
    state.clickVolume = calVol;   // 補正テスト中だけの音量（restoreで復元）
    mic.threshold = calThr;       // 補正テスト中だけの補正用反応ライン（restoreで復元）
    mic.cooldownMs = CAL_COOLDOWN_MS;
    // クリック音ガードはキャリブレーション中は使わない（クリック音そのものを拾うため）
    mic.clickGuardMs = 0;
    if (els.calThreshold) els.calThreshold.style.left = micThresholdMarkerPct() + '%';
}

function restoreCalSettings() {
    if (!cal.saved) return;
    mic.threshold = cal.saved.threshold;
    mic.cooldownMs = cal.saved.cooldownMs;
    mic.clickGuardMs = cal.saved.clickGuardMs;
    state.clickVolume = cal.saved.clickVolume;
    cal.saved = null;
}

async function startCalibration() {
    if (state.running) stop();
    if (test.active) exitTestMode();
    stopBtCal();
    if (!mic.on) {
        await startMic();
        if (!mic.on) { setCalUI('failed'); return; }
    }
    ensureAudio();
    // iOS Safari / PWA 対策：AudioContext が suspended のままだとクリックが鳴らないため明示的に復帰
    try { if (state.audioCtx.state === 'suspended') await state.audioCtx.resume(); } catch (_) { /* ignore */ }
    applyCalSettings();        // 測定専用値に切替（退避済み）
    cal.active = true;
    cal.samples = [];
    cal.i = 0;
    cal.successCount = 0;
    cal.lastClickPerf = -9999;
    cal.lastDetect = 0;
    cal.maxPeak = 0;
    cal.rawOnsets = 0;
    cal.outOfRange = 0;
    cal.lastLevel = 0;
    cal.clickArmed = false;
    cal.unstable = false;
    cal.warmupFired = false;   // 1回目較正用クリック（カウントしない）を鳴らしたか
    cal.warmupDone = false;    // 較正用クリックの実測ピークで反応ラインを確定したか
    mic.calibrating = true;
    mic.prevPeak = 0;
    mic.armed = true;          // 開始直後から立ち上がりを拾えるようにアーム
    scrollToSettingsEl(els.calCard); // カード上部（タイトル/「今やること」/説明）が隠れないように（v0.9.92）
    setCalUI('measuring');
    cal.timer = setInterval(() => {
        // ── ステップ0：較正用クリック（warm-up）──
        //   1回目だけ反応ラインが過大見積りで外れる問題への対策。最初の1回は「実測ピークで
        //   反応ラインを確定するためだけ」に鳴らし、検出枠を開かない（= 8回の計測には含めない）。
        if (!cal.warmupFired) {
            cal.warmupFired = true;
            cal.lastClickPerf = performance.now();
            cal.clickArmed = false; // 計測対象にしない
            mic.prevPeak = 0;
            click(true, true);
            return;
        }
        // ── ステップ0.5：較正用クリックの実測ピークから補正用反応ラインを確定 ──
        if (!cal.warmupDone) {
            cal.warmupDone = true;
            if (cal.maxPeak > 0) {
                const thr = calThresholdFromPeak(cal.maxPeak, calNoiseFloor());
                mic.threshold = thr;
                cal.threshold = thr;
                if (els.calThreshold) els.calThreshold.style.left = micThresholdMarkerPct() + '%';
            }
            // この tick から本計測（1拍目）を開始する
        }
        if (cal.i >= CAL_CLICKS) { clearInterval(cal.timer); cal.timer = 0; finishCalibration(); return; }
        cal.i++;
        cal.lastClickPerf = performance.now();
        cal.clickArmed = true; // このクリックの検出枠を1つ開く（1クリック1検出）
        mic.prevPeak = 0;      // 各クリック直前にリセットし、立ち上がり交差を確実に拾う
        mic.armed = true;
        click(true, true); // STAGE等と同じ click() を使用（音・クリック音量をSTAGE/適用後設定と統一）
        setCalUI('measuring');
    }, CAL_INTERVAL_MS);
}

/* 測定失敗時に、原因を推定して具体的な案内文を返す（C案：失敗理由の表示）。
   どれくらい足りないか分かるよう、最大入力レベルと反応ラインも併記する。 */
function buildCalFailReason() {
    // 補正テスト中に使っていた「補正用反応ライン」で併記する（STAGE用とは別物）
    const calThr = (cal.threshold != null) ? cal.threshold : CAL_THR_DEFAULT;
    const levels = '（最大入力 ' + cal.maxPeak.toFixed(3) + ' / 補正用反応ライン ' + calThr.toFixed(3) + '）';
    let head;
    if (cal.maxPeak < CAL_SILENCE_PEAK) {
        head = '測定できませんでした：マイク入力がほとんどありません。マイクの許可と、端末の音量を確認してください。';
    } else if (cal.maxPeak < calThr) {
        head = '測定できませんでした：クリック音が小さすぎて補正用ラインに届きません。クリック音量を上げるか、スピーカーに近づけてください。';
    } else if (cal.rawOnsets > 0) {
        head = '測定できませんでした：音は検出していますが、タイミングが安定しません。静かな場所で、もう一度お試しください。';
    } else {
        head = '測定できませんでした：クリック音をマイクで検出できませんでした。音量を上げるか、スピーカーに近づけてください。';
    }
    return head + levels;
}

function finishCalibration() {
    mic.calibrating = false;
    cal.active = false;
    restoreCalSettings();     // ユーザー設定へ復元
    const s = cal.samples.slice().sort((a, b) => a - b);
    cal.successCount = s.length;             // 1クリック1検出なので最大 CAL_CLICKS（=8）
    // 中央値＋ばらつき（中央絶対偏差）を先に算出（不安定時の案内にも使う）
    const median = s.length ? s[Math.floor(s.length / 2)] : 0;
    const devs = s.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
    const spread = s.length ? Math.round(devs[Math.floor(devs.length / 2)] || 0) : 0;
    cal.measuredDelay = Math.round(median);
    cal.spread = spread;
    cal.proposedOffset = Math.max(-CAL_OFFSET_LIMIT_MS, Math.min(CAL_OFFSET_LIMIT_MS, -cal.measuredDelay));

    // ほとんど検出できない（<3）→ 失敗理由を表示
    if (s.length < 3) { cal.unstable = true; setCalUI('failed', buildCalFailReason()); return; }

    // 採用条件を満たさない場合は「測定不安定」として補正値を採用しない（適用ボタンを出さない）。
    const fewDetect = s.length < CAL_MIN_SUCCESS;                 // 7/8 未満
    const tooNoisy = spread > CAL_MAX_SPREAD_MS;                  // ばらつき大
    const clamped = Math.abs(cal.measuredDelay) >= CAL_OFFSET_LIMIT_MS; // 補正値が上限に張り付く
    cal.unstable = fewDetect || tooNoisy || clamped;
    if (cal.unstable) {
        cal.proposedOffset = null;   // 採用しない
        let msg;
        if (fewDetect) {
            // 検出が少ない＝クリックが小さい/反応ラインが高すぎる可能性
            msg = '検出が少ないため補正できませんでした（' + s.length + '/' + CAL_CLICKS + '）。スピーカーに近づけるか、補正テスト時のクリック音量を少し上げてください。';
        } else if (clamped) {
            msg = '測定遅延が大きすぎて不安定です（' + cal.measuredDelay + 'ms）。イヤホンを使う・静かな場所で、もう一度お試しください。';
        } else {
            // ばらつき大＝補正用反応ラインが低めで環境音や余韻を拾っている可能性 → 次回は自動で上げる
            cal.noiseBump = Math.min((cal.noiseBump || 1) * 1.4, 2.5);
            msg = '測定が不安定です（ばらつき ±' + spread + 'ms）。環境音や余韻を拾っている可能性があります。静かな場所で試すか、もう一度お試しください（補正用反応ラインは自動で少し上げて再測定されます）。';
        }
        setCalUI('failed', msg);
        console.info('[cal] unstable success=' + s.length + '/' + CAL_CLICKS + ' spread=±' + spread + ' delay=' + cal.measuredDelay + 'ms → 採用しません');
        return;
    }
    cal.noiseBump = 1; // 安定して採用できたのでリセット
    // 前回の採用可測定と比べ、補正値や補正用反応ラインが大きく変わる場合は「もう一度テスト」を促す（案A）。
    let bigChange = false;
    if (cal.lastResultOffset != null && cal.lastResultThreshold != null) {
        const offChange = Math.abs(cal.proposedOffset - cal.lastResultOffset);
        const thrChange = Math.abs(cal.threshold - cal.lastResultThreshold);
        bigChange = (offChange > 25) || (thrChange > cal.lastResultThreshold * 0.4 + 0.004);
    }
    cal.lastResultOffset = cal.proposedOffset;
    cal.lastResultThreshold = cal.threshold;
    setCalUI('result');
    if (bigChange && els.calStatus) {
        els.calStatus.classList.remove('hidden');
        els.calStatus.textContent = '補正値・補正用反応ラインが前回と変わりました。もう一度テストして安定性を確認してください。';
    }
    console.info('[cal] samples=' + JSON.stringify(s) + ' success=' + s.length + '/' + CAL_CLICKS + ' median=' + cal.measuredDelay + 'ms ±' + spread + ' → offset=' + cal.proposedOffset + 'ms bigChange=' + bigChange);
}

function applyCalibration() {
    if (cal.proposedOffset == null) return;
    mic.timingOffsetMs = cal.proposedOffset;
    cal.lastAt = Date.now();
    applySettingsToUI();
    updateMicDiag();
    state.micDelayDone = true;   // 適用したので「済み」にする
    saveSettings();
    markMicDelayDone();          // 見出し・バッジ・ボタン文言を更新
    // 結果を閉じて短い完了メッセージ
    if (els.calResult) els.calResult.classList.add('hidden');
    if (els.calStatus) {
        els.calStatus.classList.remove('hidden');
        els.calStatus.textContent = '補正を適用しました。';
    }
    if (els.calBtn) els.calBtn.disabled = false;
    console.info('[cal] 適用 offset=' + mic.timingOffsetMs + 'ms');
    // v0.9.62：補正を適用したら補正系完了 → 実践テストへ
    completeCorrectionStep();
}

/* ── イベント結線 ───────────────────────────────────────── */
function bind() {
    // ホーム階層ナビ（v0.9.117）：TOP → リズム練 → 基礎練(STAGE一覧)/準備中。
    // 各サブビューからの「戻る/TOP」は共通ナビ #app-nav に統一（v0.9.118）。
    if (els.rhythmTrainBtn) els.rhythmTrainBtn.addEventListener('click', () => setHomeView('rhythm'));
    if (els.catKiso) els.catKiso.addEventListener('click', () => setHomeView('kiso'));
    if (els.catStroke) els.catStroke.addEventListener('click', () => openSoonCategory('ストロークパターン'));
    if (els.catChord) els.catChord.addEventListener('click', () => openSoonCategory('コード進行'));
    // PROカスタムSTAGE（v0.9.119）：入口→一覧、新規作成、一覧内のコピー/削除（委譲）
    if (els.catProCustom) els.catProCustom.addEventListener('click', openRhythmProCustom);
    if (els.proCustomNew) els.proCustomNew.addEventListener('click', createNewRhythmCustomStage);
    if (els.proCustomList) els.proCustomList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const card = btn.closest('.pro-custom-card');
        const id = card && card.dataset ? card.dataset.id : '';
        if (!id) return;
        const act = btn.dataset.act;
        if (act === 'test') {
            openRhythmProCustomTest(id);
        } else if (act === 'edit') {
            openRhythmProCustomEditor(id);
        } else if (act === 'copy') {
            copyRhythmCustomStageJson(id);
        } else if (act === 'delete') {
            if (window.confirm('このカスタムSTAGEを削除しますか？')) {
                deleteRhythmCustomStageById(id);
                renderRhythmCustomStages();
                showRcToast('削除しました');
            }
        }
    });
    // PROカスタムSTAGE 編集画面（v0.9.121）
    if (els.pceTitle) els.pceTitle.addEventListener('input', () => { if (proCustomEditDraft) proCustomEditDraft.title = els.pceTitle.value; });
    if (els.pceTimeSig) els.pceTimeSig.addEventListener('change', () => setRhythmEditorTimeSignature(els.pceTimeSig.value));
    if (els.pceGrid) els.pceGrid.addEventListener('change', () => setRhythmEditorGrid(els.pceGrid.value));
    if (els.pcePbars) els.pcePbars.addEventListener('change', () => setRhythmEditorPatternBars(parseInt(els.pcePbars.value, 10)));
    if (els.pceBarsDown) els.pceBarsDown.addEventListener('click', () => stepRhythmEditorBars(-1));
    if (els.pceBarsUp) els.pceBarsUp.addEventListener('click', () => stepRhythmEditorBars(1));
    if (els.pceBpm) els.pceBpm.addEventListener('change', () => setRhythmEditorBpm(els.pceBpm.value));
    if (els.pceBpmDown) els.pceBpmDown.addEventListener('click', () => { if (proCustomEditDraft) setRhythmEditorBpm(proCustomEditDraft.bpm - 1); });
    if (els.pceBpmUp) els.pceBpmUp.addEventListener('click', () => { if (proCustomEditDraft) setRhythmEditorBpm(proCustomEditDraft.bpm + 1); });
    if (els.pcePattern) els.pcePattern.addEventListener('click', (e) => {
        const zone = e.target.closest('[data-zone]');
        if (!zone) return;
        const i = parseInt(zone.dataset.index, 10);
        if (zone.dataset.zone === 'note') tapRhythmEditorNote(i);
        else if (zone.dataset.zone === 'arrow') tapRhythmEditorArrow(i);
    });
    if (els.pceSave) els.pceSave.addEventListener('click', () => saveRhythmCustomEditor(true));
    if (els.pceTest) els.pceTest.addEventListener('click', testPlayFromEditor);
    if (els.pceCopy) els.pceCopy.addEventListener('click', copyRhythmCustomEditorJson);
    if (els.pceBack) els.pceBack.addEventListener('click', () => { renderRhythmCustomStages(); setHomeView('proCustom'); });
    if (els.pceDelete) els.pceDelete.addEventListener('click', deleteRhythmCustomFromEditor);
    // JSON手動コピーモーダル（v0.9.120）
    if (els.rcJsonClose) els.rcJsonClose.addEventListener('click', hideRhythmJsonModal);
    if (els.rcJsonModal) els.rcJsonModal.addEventListener('click', (e) => { if (e.target === els.rcJsonModal) hideRhythmJsonModal(); });
    if (els.rcJsonCopy) els.rcJsonCopy.addEventListener('click', async () => {
        const ok = await copyTextToClipboard(els.rcJsonText ? els.rcJsonText.value : '');
        if (ok) { showRcToast('コピーしました'); hideRhythmJsonModal(); }
        else if (els.rcJsonText) { try { els.rcJsonText.focus(); els.rcJsonText.select(); } catch (e) { /* noop */ } }
    });
    // 全画面共通ナビ（戻る / TOP / 設定）
    if (els.navBackBtn) els.navBackBtn.addEventListener('click', () => guardMicSetupInterruption(navBack));
    if (els.navTopBtn) els.navTopBtn.addEventListener('click', () => guardMicSetupInterruption(goTop));
    if (els.settingsBtn) els.settingsBtn.addEventListener('click', openSettingsFromCurrent);
    // 入力方法（タップ / ストローク）
    // 入力方式の切替（v0.9.118：リズム練をする画面）。ここでは選択の記録のみ。STAGE開始時に反映。
    if (els.rhythmModeTap) els.rhythmModeTap.addEventListener('click', () => selectInputMode('tap'));
    if (els.rhythmModeStroke) els.rhythmModeStroke.addEventListener('click', () => selectInputMode('stroke'));
    // ストローク検出モード：選んだら自動で次（マイク反応テスト）へ
    if (els.strokeModeBrush) els.strokeModeBrush.addEventListener('click', () => onPickStrokeMode('brush'));
    if (els.strokeModeChord) els.strokeModeChord.addEventListener('click', () => onPickStrokeMode('chord'));
    // 入力タイプ（通常マイク / イヤホン接続）：選んだら自動で次へ
    if (els.inputTypeNormal) els.inputTypeNormal.addEventListener('click', () => onPickInputType('normal'));
    if (els.inputTypeHeadphone) els.inputTypeHeadphone.addEventListener('click', () => onPickInputType('headphone'));
    // イヤホンの音ズレ補正（v0.9.50〜）
    if (els.hpCalBtn) els.hpCalBtn.addEventListener('click', toggleHeadphoneCal);
    if (els.hpRetestBtn) els.hpRetestBtn.addEventListener('click', retestHeadphoneCal); // v0.9.111：再テスト
    if (els.hpBpmMinus) els.hpBpmMinus.addEventListener('click', () => setHpCalBpm(hpCalBpm - HP_CAL_BPM_STEP));
    if (els.hpBpmPlus) els.hpBpmPlus.addEventListener('click', () => setHpCalBpm(hpCalBpm + HP_CAL_BPM_STEP));
    if (els.hpOffset) els.hpOffset.addEventListener('input', () => {
        // v0.9.112：テスト中にスライダーを動かしたら、その回の自動停止をキャンセル（手動停止まで続ける）。
        if (hpCal.active) hpCal.autoStopCanceled = true;
        setHeadphoneOffset(parseInt(els.hpOffset.value, 10));
    });
    // イヤホンの種類（v0.9.51）：選択で目安の主導線を切替え、保存済みの種類別値へ同期
    if (els.hpTypeWired) els.hpTypeWired.addEventListener('click', () => onPickHeadphoneType('wired'));
    if (els.hpTypeBluetooth) els.hpTypeBluetooth.addEventListener('click', () => onPickHeadphoneType('bluetooth'));
    if (els.hpResetBtn) els.hpResetBtn.addEventListener('click', resetHeadphoneOffsetToGuide);
    if (els.hpZeroBtn) els.hpZeroBtn.addEventListener('click', resetHeadphoneOffsetToZero);
    if (els.hpStdBtn) els.hpStdBtn.addEventListener('click', resetHeadphoneOffsetToBluetoothStandard);
    // 手動設定のイヤホン音ズレ補正（v0.9.52）：選択中の種類の値を調整。補正カード側スライダーとも同期
    if (els.setHpOffset) els.setHpOffset.addEventListener('input', () => setHeadphoneOffset(parseInt(els.setHpOffset.value, 10)));
    if (els.setHpResetBtn) els.setHpResetBtn.addEventListener('click', resetHeadphoneOffsetToGuide);
    if (els.setHpZeroBtn) els.setHpZeroBtn.addEventListener('click', resetHeadphoneOffsetToZero);
    // 実践テスト（v0.9.56）
    if (els.ptBtn) els.ptBtn.addEventListener('click', togglePracticeTest);
    // マイク遅れ補正（Bluetooth用・v0.9.80）
    if (els.btCalBtn) els.btCalBtn.addEventListener('click', toggleBtCal);
    if (els.btCalSkip) els.btCalSkip.addEventListener('click', completeBtCalStep);
    // 見返しレーンの「最初へ / 最後へ」（v0.9.74）
    if (els.ptReviewFirst) els.ptReviewFirst.addEventListener('click', () => { if (els.ptReviewScroll) els.ptReviewScroll.scrollTo({ left: 0, behavior: 'smooth' }); });
    if (els.ptReviewLast) els.ptReviewLast.addEventListener('click', () => { if (els.ptReviewScroll) els.ptReviewScroll.scrollTo({ left: els.ptReviewScroll.scrollWidth, behavior: 'smooth' }); });
    // タップエリア配置（左右 / 上下）
    if (els.tapToolsToggle) els.tapToolsToggle.addEventListener('click', toggleTapTools);
    if (els.tapToolsReset) els.tapToolsReset.addEventListener('click', resetTapButtons);
    if (els.layoutLrBtn) els.layoutLrBtn.addEventListener('click', () => setTapLayout('lr'));
    if (els.layoutUdBtn) els.layoutUdBtn.addEventListener('click', () => setTapLayout('ud'));
    // タップボタンの高さ調整スライダー
    if (els.tapHeightSlider) els.tapHeightSlider.addEventListener('input', () => setTapHeight(parseInt(els.tapHeightSlider.value, 10)));

    // 設定画面（旧導線は撤去済み。あれば結線）
    if (els.homeSettingsBtn) els.homeSettingsBtn.addEventListener('click', () => openSettings('home'));
    if (els.micSettingsBtn) els.micSettingsBtn.addEventListener('click', () => openSettings('practice'));
    // v0.9.104：下部「完了」ボタンは廃止（ヘッダーの「← 戻る」で設定を閉じられる）。要素があれば従来動作を残す。
    if (els.settingsBackBtn) els.settingsBackBtn.addEventListener('click', () => guardMicSetupInterruption(() => {
        // もう一度テスト中は、実践テスト完了まで「完了」を効かせない（案内のみ）
        if (isDoneLocked()) {
            showDoneHint();
            scrollToSettingsEl(els.ptCard);
            return;
        }
        closeSettings();
    }));
    if (els.settingsResetBtn) els.settingsResetBtn.addEventListener('click', resetSettings);
    if (els.micResetBtn) els.micResetBtn.addEventListener('click', onMicResetClick);
    // マイク設定TOP（下部・手動設定内）：いつでもマイク設定トップ画面へ戻る（v0.9.70）
    if (els.settingsTopBtn) els.settingsTopBtn.addEventListener('click', () => guardMicSetupInterruption(() => setSettingsView('chooser')));
    // 手動設定内の「キャンセル」：変更を破棄してマイク設定TOPへ戻る（v0.9.89）
    if (els.manualTopBtn) els.manualTopBtn.addEventListener('click', () => guardMicSetupInterruption(cancelManualSettings));
    if (els.manualUseBtn) els.manualUseBtn.addEventListener('click', () => guardMicSetupInterruption(useManualSettings));
    // トップ導線（v0.9.71）：簡易設定／詳細テスト／現在の設定を見る
    if (els.settingsSimpleBtn) els.settingsSimpleBtn.addEventListener('click', () => guardMicSetupInterruption(() => setSettingsView('simple')));
    if (els.settingsDetailBtn) els.settingsDetailBtn.addEventListener('click', () => guardMicSetupInterruption(() => startRetestFlow(false)));
    if (els.settingsViewCurrent) els.settingsViewCurrent.addEventListener('click', () => guardMicSetupInterruption(() => setSettingsView('summary')));
    if (els.settingsSummaryBack) els.settingsSummaryBack.addEventListener('click', () => guardMicSetupInterruption(() => setSettingsView('chooser')));
    // 簡易設定：環境選択／適用後の導線（v0.9.71）
    if (els.simpleChoices) els.simpleChoices.querySelectorAll('.simple-choice').forEach((b) => {
        b.addEventListener('click', () => applySimpleSetup(b.getAttribute('data-preset'), b.getAttribute('data-label')));
    });
    if (els.simplePracticeBtn) els.simplePracticeBtn.addEventListener('click', simpleGoPractice);
    if (els.simpleDoneBtn) els.simpleDoneBtn.addEventListener('click', () => guardMicSetupInterruption(closeSettings));
    if (els.simpleBackBtn) els.simpleBackBtn.addEventListener('click', () => guardMicSetupInterruption(resetSimpleView));
    // 「保存済みプリセット」ボタンで一覧を開閉（v0.9.63）
    if (els.presetToggleBtn) els.presetToggleBtn.addEventListener('click', () => guardMicSetupInterruption(openMicPreset));
    if (els.micPresetBack) els.micPresetBack.addEventListener('click', () => guardMicSetupInterruption(() => setSettingsView('chooser')));
    // 「現在の設定を見る」から：この設定を保存（モーダル）／手動設定を開く
    if (els.settingsSummarySave) els.settingsSummarySave.addEventListener('click', () => openPresetModal());
    if (els.settingsSummaryManual) els.settingsSummaryManual.addEventListener('click', () => openManualView(els.manualCard));
    // 手動設定カード内「この設定を保存」：共通の保存モーダルを開く（v0.9.80）
    if (els.manualPresetTrigger) els.manualPresetTrigger.addEventListener('click', () => openPresetModal());
    // 補正系の「進む/スキップ」（v0.9.62）：押したら補正系完了として最終確認テストへ
    if (els.calSkipBtn) els.calSkipBtn.addEventListener('click', completeCorrectionStep);
    if (els.hpProceedBtn) els.hpProceedBtn.addEventListener('click', completeCorrectionStep);
    if (els.wiredProceedBtn) els.wiredProceedBtn.addEventListener('click', completeCorrectionStep);
    // 設定タブ（v0.9.95）：切替時はマイク設定の未完了/テスト中なら確認ポップ
    if (els.settingsTabMic) els.settingsTabMic.addEventListener('click', () => guardMicSetupInterruption(() => setSettingsTab('mic')));
    if (els.settingsTabTap) els.settingsTabTap.addEventListener('click', () => guardMicSetupInterruption(() => setSettingsTab('tap')));
    // 画面タップ設定タブの各ボタン（v0.9.95→v0.9.97）
    if (els.tapOpenCal) els.tapOpenCal.addEventListener('click', openTapCorrection);
    if (els.tapOpenPreset) els.tapOpenPreset.addEventListener('click', openTapPreset);
    if (els.tapOpenManual) els.tapOpenManual.addEventListener('click', openTapManual);
    if (els.tapPresetBack) els.tapPresetBack.addEventListener('click', backToTapHome);
    if (els.tapManualBack) els.tapManualBack.addEventListener('click', cancelTapManual);
    if (els.tapManualOffset) els.tapManualOffset.addEventListener('input', () => {
        setHeadphoneOffset(parseInt(els.tapManualOffset.value, 10));
        if (els.tapManualCurrent) els.tapManualCurrent.textContent = 'タップ補正：' + (mic.headphoneOutputOffsetMs || 0) + 'ms';
    });
    if (els.tapManualUse) els.tapManualUse.addEventListener('click', () => applyTapOutputOffsetAndClose(mic.headphoneOutputOffsetMs || 0));
    if (els.tapManualSave) els.tapManualSave.addEventListener('click', openTapPresetModal);
    if (els.hpTapUseBtn) els.hpTapUseBtn.addEventListener('click', useTapCorrection);
    if (els.hpTapSaveBtn) els.hpTapSaveBtn.addEventListener('click', openTapPresetModal);
    // 画面タップ設定：音ズレ補正テスト（タップ実測型・v0.9.98）
    if (els.tapCalBtn) els.tapCalBtn.addEventListener('click', toggleTapCal);
    if (els.tapCalBack) els.tapCalBack.addEventListener('click', backToTapHome);
    if (els.tapCalBpmMinus) els.tapCalBpmMinus.addEventListener('click', () => setTapCalBpm(tapCalBpm - HP_CAL_BPM_STEP));
    if (els.tapCalBpmPlus) els.tapCalBpmPlus.addEventListener('click', () => setTapCalBpm(tapCalBpm + HP_CAL_BPM_STEP));
    if (els.tapCalPad) els.tapCalPad.addEventListener('pointerdown', (e) => { e.preventDefault(); registerTapCalTap(); });
    // プリセット保存モーダル（v0.9.80）
    if (els.presetModalSave) els.presetModalSave.addEventListener('click', savePresetFromModal);
    if (els.presetModalCancel) els.presetModalCancel.addEventListener('click', closePresetModal);
    if (els.presetModalInput) {
        els.presetModalInput.addEventListener('input', () => setPresetSaveMsg(''));
        els.presetModalInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); savePresetFromModal(); } });
    }
    // モーダルの背景をクリックしたら閉じる
    if (els.presetModal) els.presetModal.addEventListener('click', (e) => { if (e.target === els.presetModal) closePresetModal(); });
    // 手動設定カードの「最終確認テストを実施する」：最終確認テスト画面へ移動するだけ（v0.9.90）。
    // 自動ではテストを始めない。ユーザーが開始ボタンを押してからテストを始める。
    if (els.manualPracticeBtn) els.manualPracticeBtn.addEventListener('click', () => guardMicSetupInterruption(() => {
        if (settingsView !== 'steps') settingsView = 'steps';
        wizardEditing = 'practice';
        renderSettingsView();
        scrollToSettingsEl(els.ptCard);
    }));

    els.setThreshold.addEventListener('input', () => {
        const sens = parseInt(els.setThreshold.value, 10);
        mic.threshold = thresholdFromSensUI(sens);
        els.setThresholdVal.textContent = sens + '％';
        if (els.micThreshold) els.micThreshold.style.left = micThresholdMarkerPct() + '%';
        if (els.testThreshold) els.testThreshold.style.left = micThresholdMarkerPct() + '%';
        drawMicPreview();
    });
    els.setCooldown.addEventListener('input', () => {
        mic.cooldownMs = parseInt(els.setCooldown.value, 10);
        els.setCooldownVal.textContent = mic.cooldownMs + 'ms';
        drawMicPreview();
    });
    els.setOffset.addEventListener('input', () => {
        mic.timingOffsetMs = parseInt(els.setOffset.value, 10);
        els.setOffsetVal.textContent = (mic.timingOffsetMs > 0 ? '+' : '') + mic.timingOffsetMs + 'ms';
        if (els.calCurrentOffset) els.calCurrentOffset.textContent = (mic.timingOffsetMs > 0 ? '+' : '') + mic.timingOffsetMs + 'ms';
        updateMicDiag();
        drawMicPreview();
    });
    els.setClickVol.addEventListener('input', () => {
        state.clickVolume = parseInt(els.setClickVol.value, 10);
        els.setClickVolVal.textContent = state.clickVolume + '％';
        drawMicPreview();
    });
    // 値が確定したら保存
    [els.setThreshold, els.setCooldown, els.setOffset, els.setClickVol].forEach((sl) =>
        sl.addEventListener('change', saveSettings));
    // 反応ライン・二重反応防止・マイク遅れ補正は実践テストの判定に効くので、
    // 変更したら前回の実践テスト結果を無効化して再確認を促す（v0.9.67）
    [els.setThreshold, els.setCooldown, els.setOffset].forEach((sl) => {
        if (sl) sl.addEventListener('change', () =>
            invalidatePracticeResult('設定を変更しました。もう一度最終確認テストで確認してください。'));
    });

    // 手動設定（折りたたみ）を開いたら、中のプレビューをサイズ確定して描画
    if (els.manualDetail) els.manualDetail.addEventListener('toggle', () => { if (els.manualDetail.open) fitPreview(); });

    // キャリブレーション
    els.calBtn.addEventListener('click', startCalibration);
    els.calApplyBtn.addEventListener('click', applyCalibration);

    // 実音テスト（1ボタン自動フロー）
    els.micTestBtn.addEventListener('click', toggleMicTest);
    if (els.recoRetestBtn) els.recoRetestBtn.addEventListener('click', () => { if (!test.flow) { test.rescueHighSens = true; startMicTestFlow(); } });
    els.recoApplyBtn.addEventListener('click', applyReco);
    els.tempoUp.addEventListener('click', () => setBpm(state.bpm + 5));
    els.tempoDown.addEventListener('click', () => setBpm(state.bpm - 5));
    // 小節数の−/＋（v0.9.118）：候補 1/2/4/8 を行き来する
    if (els.barsUp) els.barsUp.addEventListener('click', () => stepStageBars(+1));
    if (els.barsDown) els.barsDown.addEventListener('click', () => stepStageBars(-1));
    // STAGEタイトル横の「現在：タップ/ストローク」タップで入力方式を切替（v0.9.118）
    if (els.practiceModeLabel) els.practiceModeLabel.addEventListener('click', toggleStageInputMode);
    els.playBtn.addEventListener('click', onPlayBtn);          // 開始/停止 兼用
    // 結果モーダル：閉じる＝結果を閉じて開始前へ／もう一度＝閉じてリトライ
    if (els.rCloseBtn) els.rCloseBtn.addEventListener('click', () => { if (els.resultsOverlay) els.resultsOverlay.classList.add('hidden'); resetGame(); });
    // カスタムテスト：再生画面ヘッダー／結果画面から元の編集画面へ戻る（v0.9.124）
    if (els.practiceEditBack) els.practiceEditBack.addEventListener('click', backToEditorFromTest);
    if (els.rEditBackBtn) els.rEditBackBtn.addEventListener('click', backToEditorFromTest);
    // カスタムテスト：開始ボタン下の「編集に戻る」「このSTAGEを保存」（v0.9.124）
    if (els.customTestEditBack) els.customTestEditBack.addEventListener('click', backToEditorFromTest);
    if (els.customTestSave) els.customTestSave.addEventListener('click', saveRhythmCustomTestSettings);
    els.retryBtn.addEventListener('click', () => { if (els.resultsOverlay) els.resultsOverlay.classList.add('hidden'); resetGame(); play(); });
    // 二重反応時：結果を閉じてマイク設定（反応テスト）へ誘導
    if (els.resultsRetestBtn) els.resultsRetestBtn.addEventListener('click', () => {
        if (els.resultsOverlay) els.resultsOverlay.classList.add('hidden');
        resetGame();
        openSettings('practice');
        // ステップ式UIでマイク反応テストまで一気に開く（結果はリセット）
        startRetestFlow(true);
    });
    // 結果詳細：ズレ傾向を見たあと、マイクの手動設定（現在の設定を見る）へ直接行く（v0.9.107）
    if (els.resultsMicTune) els.resultsMicTune.addEventListener('click', () => {
        if (els.resultsOverlay) els.resultsOverlay.classList.add('hidden');
        resetGame();
        openSettings('practice');   // マイク設定タブで設定画面を開く
        openManualView(els.manualCard); // 「現在の設定を見る／手動設定」を開く
    });
    // 結果モーダルの詳細（折りたたみ）を開いたら、中のズレ履歴グラフをサイズ確定して描画
    if (els.resultsDetail) els.resultsDetail.addEventListener('toggle', () => { if (els.resultsDetail.open) { fitGraph(); fitResultsMic(); } });

    // タップ判定は「左右2分割タップエリア」だけが対象。
    // レーン/画面タップでは判定しない（方向を明確にするため・修正7）。

    // タップエリア（左：ダウン / 右：アップ）。direction を記録して判定
    if (els.tapArea) {
        els.tapArea.querySelectorAll('[data-dir]').forEach((half) => {
            half.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                onTap(half.getAttribute('data-dir'));
                half.classList.remove('flash'); void half.offsetWidth; half.classList.add('flash');
            });
        });
    }

    // マイク許可後の設定誘導バナー
    if (els.micSetupYesBtn) els.micSetupYesBtn.addEventListener('click', () => { hideMicSetupPrompt(); openSettings('practice'); });
    if (els.micSetupLaterBtn) els.micSetupLaterBtn.addEventListener('click', hideMicSetupPrompt);

    // 「ページを更新」ボタン（クルーズアプリシリーズ共通）
    document.querySelectorAll('.js-reload-app').forEach((btn) =>
        btn.addEventListener('click', reloadAppWithCacheBust));

    window.addEventListener('resize', () => {
        if (!els.settings.classList.contains('hidden')) {
            fitPreview();
            if (pt.active) { fitPtLane(); }
            if (bt.active) { fitBtLane(); }
            if (hpCal.active) { fitHpLane(); }
            if (tapCal.active) { fitTapCalLane(); }
            // v0.9.100：テスト後の凍結レーン（結果表示中）も追従して描き直す
            if (!tapCal.active && tapCal.result && els.tapCalLaneWrap && !els.tapCalLaneWrap.classList.contains('hidden')) { fitTapCalLane(); drawTapCalReview(); }
            if (!bt.active && bt.result && els.btCalLaneWrap && !els.btCalLaneWrap.classList.contains('hidden')) { fitBtLane(); drawBtReview(); }
            return;
        }
        if (els.practice.classList.contains('hidden')) return;
        fitLane();
        if (els.resultsOverlay && !els.resultsOverlay.classList.contains('hidden')) {
            fitReview();
            if (els.resultsDetail && els.resultsDetail.open) { fitGraph(); fitResultsMic(); }
        }
    });
}

/* ── ページ更新（キャッシュバスター付き・シリーズ共通の挙動） ── */
function reloadAppWithCacheBust() {
    try {
        if (mic.on) stopMic();
        if (state.audioCtx && typeof state.audioCtx.close === 'function') state.audioCtx.close();
    } catch (_) { /* ignore */ }
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('_r', String(Date.now()));
        window.location.replace(url.toString());
    } catch (e) {
        window.location.reload();
    }
}

function applyAppVersionDisplay() {
    if (els.appVersionDisplay) els.appVersionDisplay.textContent = 'Ver ' + RHYTHM_CRUISE_VERSION;
}

/* ── 初期化 ─────────────────────────────────────────────── */
function init() {
    applyAppVersionDisplay();    // バージョン表示（Ver X.Y.Z）
    loadSettings();              // 保存済みのマイク設定を反映
    renderStages();
    bind();
    applySettingsToUI();         // スライダー・数値・しきい値ラインを現在値に
    updateInputModeUI();         // v0.9.118：入力方式（タップ/ストローク）の切替UI・表示を保存値に同期
    updateBarsUI();              // v0.9.118：小節数の表示を保存値に同期
    updateMicDiag();             // マイク診断カウンタ・補正値の初期表示
    setClickEnabled(true);
    show('home');
}

document.addEventListener('DOMContentLoaded', init);
