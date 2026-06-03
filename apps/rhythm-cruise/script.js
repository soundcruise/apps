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

const RHYTHM_CRUISE_VERSION = '0.9.17';

/* クリック音テストで鳴らす回数（4拍 × 2周） */
const CLICK_TEST_COUNT = 8;
/* ストロークテストの回数 */
const STROKE_TEST_COUNT = 4;

/* キャリブレーション中だけ使う測定専用値（通常設定とは独立。終了後に復元する） */
const CAL_CLICK_VOLUME = 100;  // 測定用クリック音量（最大・iPhoneでも拾いやすく）
const CAL_THRESHOLD = 0.06;    // 測定用しきい値（自然なクリック音でも拾えるよう低め）
const CAL_COOLDOWN_MS = 150;   // 測定用クールダウン
/* マイク入力がこの値未満なら「入力がほとんど無い」とみなす（失敗理由の判定用） */
const CAL_SILENCE_PEAK = 0.02;

/* クリック音ガード中でも、これ以上の大きさなら本物のストロークとみなして通す（しきい値の倍率） */
const STRONG_STROKE_FACTOR = 1.5;

/* 立ち上がり検出：threshold交差に加え、フレーム間でこの量以上の急増もストロークとみなす
   （クリック音の余韻で prevPeak が高いままでも、ストロークの急増を拾えるように） */
const RISE_DELTA = 0.12;

/* マイク波形（背景表示）用の保持時間。古いサンプルはこれを超えたら破棄 */
const MIC_WAVE_WINDOW_MS = 4000;

/* 設定の保存キーと初期値 */
const SETTINGS_KEY = 'rhythmCruiseSettings';
const SETTINGS_DEFAULTS = { threshold: 0.16, cooldownMs: 200, clickGuardMs: 60, timingOffsetMs: 0, clickVolume: 70 };

/* マイク補正キャリブレーション設定 */
const CAL_CLICKS = 8;       // 測定で鳴らすクリック数
const CAL_INTERVAL_MS = 650; // クリック間隔

/* 判定の画面表示テキスト（内部判定名は just/early/late/miss のまま維持） */
const FX_TEXT = { just: 'GOOD!', early: 'EARLY', late: 'LATE', miss: 'MISS' };

/* ── 判定の仮ルール ─────────────────────────────────────── */
const TOTAL_BEATS = 32;          // 8小節 × 4拍
const BEATS_PER_BAR = 4;
const COUNT_IN_BEATS = 4;        // 1小節ぶんのカウントイン
const JUST_MS = 40;              // ±40ms以内 = JUST
const NEAR_MS = 120;            // 40〜120ms = EARLY/LATE、超 = MISS
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
    currentStage: 1,
    inputMode: 'tap',   // 'tap' | 'stroke'
    running: false,
    raf: 0,
    audioCtx: null,
    startTime: 0,
    currentTime: 0,
    beatInterval: 750,
    T0: 0,
    endTime: 0,
    clickTimes: [],
    nextClick: 0,
    results: new Array(TOTAL_BEATS).fill(null),
    markers: [],
    micWaveHistory: [],   // {perf, level} マイク音量の時系列（背景波形用）
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
    cooldownMs: 200,   // 検出後のクールダウン
    clickGuardMs: 60,  // クリック音直後は検出を無視（クリック音ON時のみ・出力レイテンシ分を加算）
    timingOffsetMs: 0, // マイク判定補正（ms）。マイク由来の検出時刻に加算（負＝早める）
    prevPeak: 0,
    env: 0,
    lastDetect: 0,
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
    // 測定モニター・失敗理由判定用
    maxPeak: 0,      // 測定中に観測した最大入力レベル
    rawOnsets: 0,    // 範囲内外を問わず検出した立ち上がり数
    outOfRange: 0,   // 検出はしたが妥当範囲(5..400ms)外だった数
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
    // クリックテスト
    clickI: 0,
    clickPlayedAt: -9999,
    clickPeaks: [],     // 各クリック窓のピーク
    clickResults: [],   // {beat, peak, reacted}
    clickWinFrom: 0, clickWinTo: 0,
    maxClickPeak: 0,
    clickDone: false,
    // ストロークテスト
    strokeRound: 0,
    strokeFrom: 0, strokeUntil: 0,
    strokePeaks: [],
    strokeDetected: 0,
    strokeDoubleCount: 0,
    minStrokePeak: null, maxStrokePeak: null,
    strokeDone: false,
    // 推奨
    recommended: null,
    recoCooldown: null,
    recoClickVolume: null,
    flow: false,   // 自動フロー実行中
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
    startBtn: $('start-btn'),
    backBtn: $('back-btn'),
    appVersionDisplay: $('app-version-display'),
    refreshBar: $('in-game-refresh-bar'),
    practiceNum: $('practice-num'),
    practiceTitle: $('practice-title'),
    practiceDesc: $('practice-desc'),
    tempoVal: $('tempo-val'),
    tempoUp: $('tempo-up'),
    tempoDown: $('tempo-down'),
    barCounter: $('bar-counter'),
    latestVerdict: $('latest-verdict'),
    progressFill: $('progress-fill'),
    laneCanvas: $('lane-canvas'),
    graphCanvas: $('graph-canvas'),
    tapPad: $('tap-pad'),
    playBtn: $('play-btn'),
    modeTapBtn: $('mode-tap-btn'),
    modeStrokeBtn: $('mode-stroke-btn'),
    tapArea: $('tap-area'),
    micSetupPrompt: $('mic-setup-prompt'),
    micSetupYesBtn: $('mic-setup-yes'),
    micSetupLaterBtn: $('mic-setup-later'),
    resultsOverlay: $('results-overlay'),
    rCloseBtn: $('r-close-btn'),
    resultsCard: $('results-card'),
    resultsDetail: $('results-detail'),
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
    setThreshold: $('set-threshold'),
    setThresholdVal: $('set-threshold-val'),
    setCooldown: $('set-cooldown'),
    setCooldownVal: $('set-cooldown-val'),
    setOffset: $('set-offset'),
    setOffsetVal: $('set-offset-val'),
    setClickVol: $('set-clickvol'),
    setClickVolVal: $('set-clickvol-val'),
    micPreviewCanvas: $('mic-preview-canvas'),
    settingsResetBtn: $('settings-reset-btn'),
    settingsBackBtn: $('settings-back-btn'),
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
    testPhase: $('test-phase'),
    testResult: $('test-result'),
    testReco: $('test-reco'),
    recoThr: $('reco-thr'),
    recoClickVol: $('reco-clickvol'),
    recoCooldown: $('reco-cooldown'),
    recoMsg: $('reco-msg'),
    recoApplyBtn: $('reco-apply-btn'),
    manualDetail: $('manual-detail'),
    testDetail: $('test-detail'),
    testDetailStats: $('test-detail-stats'),
    barZone: $('bar-zone'),
    barClick: $('bar-click'),
    barLine: $('bar-line'),
    barStroke: $('bar-stroke'),
    calCurrentOffset: $('cal-current-offset'),
};

let settingsReturn = 'home';

let lane = { ctx: null, w: 0, h: 0 };
let preview = { ctx: null, w: 0, h: 0 };
let graph = { ctx: null, w: 0, h: 0 };
let review = { ctx: null, w: 0, h: 0, beatPx: 70, leftPad: 38 };

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

/* ── 画面遷移 ───────────────────────────────────────────── */
function show(screen) {
    els.home.classList.toggle('hidden', screen !== 'home');
    els.practice.classList.toggle('hidden', screen !== 'practice');
    els.settings.classList.toggle('hidden', screen !== 'settings');
    // 戻る/TOPナビはホーム以外で表示（ホームは最上位なので不要）
    if (els.appNav) els.appNav.classList.toggle('hidden', screen === 'home');
    // 右上の設定ボタンは設定画面以外で表示
    if (els.settingsBtn) els.settingsBtn.classList.toggle('hidden', screen === 'settings');
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
    stop();
    stopMic();          // マイク・キャリブレーション・実音テストも停止
    show('home');
}

function navBack() {
    if (!els.settings.classList.contains('hidden')) { closeSettings(); return; }
    // 練習画面（結果画面含む）→ ホーム
    goTop();
}

function openStage(n) {
    const s = STAGES.find((x) => x.n === n) || STAGES[0];
    state.currentStage = s.n;
    els.practiceNum.innerHTML = `<small>STAGE</small><b>${s.n}</b>`;
    els.practiceTitle.textContent = s.title;
    els.practiceDesc.textContent = s.desc;
    setInputMode('tap');   // 入場時はタップ練習（マイクOFF）
    show('practice');
    requestAnimationFrame(() => { fitLane(); resetGame(); });
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

/* マイクの遅れ補正テスト専用クリック。
   耳に自然なクリック音（三角波・歪み無し）でありつつ、
   音量を大きめ＋やや長めにして、低めの測定用しきい値でマイク検出できるようにする。
   ノイズバーストや矩形波の歪みは使わない。通常STAGEのクリック音(click)は一切変更しない。 */
function calClick() {
    const ctx = state.audioCtx;
    if (!ctx) { console.warn('[cal] AudioContext 未生成'); return; }
    if (ctx.state === 'suspended') ctx.resume();
    state.lastClickPerf = performance.now();
    const t0 = ctx.currentTime;

    // 三角波（角が丸く自然な音）＋ なめらかなエンベロープ。約120ms・大きめだが歪まない音量。
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 1100;
    const peak = 0.75;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.006); // やわらかいアタック
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14); // 自然な減衰
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.16);
}

/* クリック音がスピーカーから実際に出るまでの推定遅延(ms)。
   マイク誤検出ガードに加算し、出力レイテンシ分まで無視できるようにする。 */
function clickLatencyMs() {
    const c = state.audioCtx;
    if (!c) return 0;
    const l = (c.outputLatency != null ? c.outputLatency : (c.baseLatency || 0)) || 0;
    return Math.min(150, l * 1000); // 過剰に伸ばして本物のストロークを捨てないよう上限150ms
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
    const corrX = tX(strokeT + mic.timingOffsetMs);
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
function drawMicWaveform(ctx, w, h, yc) {
    const hist = state.micWaveHistory;
    if (hist.length < 2) return;
    const now = performance.now();
    const ppm = state.pxPerMs, jx = state.judgeX;
    const maxAmp = h * 0.34;
    // マイク判定補正を波形にも反映し、判定マーカーと時間軸を揃える
    // （判定は perf+offset で評価するため、波形も同じ offset で前後させる）
    const off = mic.timingOffsetMs;

    // 画面内に入るサンプルだけを時系列順（古い→新しい＝左→右）に集める
    const pts = [];
    for (let k = 0; k < hist.length; k++) {
        const s = hist[k];
        const x = jx + (s.perf + off - now) * ppm; // 今＝判定ライン、過去＝左へ流れる（補正込み）
        if (x < -24 || x > w + 24) continue;
        const lv = Math.min(1, s.level * 1.4);
        pts.push([x, lv]);
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
function drawLane(t) {
    const { ctx, w, h } = lane;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const yc = h * 0.56;
    const bi = state.beatInterval, T0 = state.T0, ppm = state.pxPerMs, jx = state.judgeX;

    // ① マイク入力波形（最背面・グレーの補助表示）
    drawMicWaveform(ctx, w, h, yc);

    // ② 中央の水平ガイド（五線の地）
    ctx.strokeStyle = 'rgba(253,246,238,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke();

    // 拍・小節・音符
    for (let i = -COUNT_IN_BEATS; i <= TOTAL_BEATS - 1; i++) {
        const bt = T0 + i * bi;
        const x = jx + (bt - t) * ppm;
        if (x < -30 || x > w + 30) continue;
        const barStart = (((i % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR) === 0;
        if (barStart) {
            ctx.strokeStyle = 'rgba(253,246,238,0.12)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, h * 0.18); ctx.lineTo(x, h * 0.9); ctx.stroke();
            if (i >= 0) {
                ctx.fillStyle = 'rgba(253,246,238,0.5)';
                ctx.font = '600 11px Outfit, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText((Math.floor(i / BEATS_PER_BAR) + 1) + '小節', x, h * 0.13);
            }
        }
        if (i >= 0) {
            const r = state.results[i];
            if (r && r.cls === 'just') {
                // GOOD：その音符が緑に光る
                ctx.save();
                ctx.shadowColor = 'rgba(46,204,113,0.9)';
                ctx.shadowBlur = 13;
                drawQuarterNote(ctx, x, yc, COLORS.just);
                ctx.restore();
            } else {
                drawQuarterNote(ctx, x, yc, NOTE_COLOR); // 採点対象 = 4分音符
            }
            // ストローク方向の矢印（音符の下・控えめなアンバー）
            drawStrokeArrow(ctx, x, yc + 28, beatDirection(i), 'rgba(255,180,90,0.8)', 0.8);
        } else {
            // カウントインは控えめな点
            ctx.beginPath(); ctx.arc(x, yc, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(253,246,238,0.3)'; ctx.fill();
        }
    }

    // 判定マーカー：実際に叩いた位置に、ズレた音符型マークをプロット
    //（GOODは音符自体が緑になるので省略。早い=青/遅い=赤の音符、MISSは薄い×）
    for (let k = state.markers.length - 1; k >= 0; k--) {
        const m = state.markers[k];
        const x = jx + (m.t - t) * ppm;
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

    // 判定ライン（光る縦線）
    ctx.save();
    ctx.shadowColor = 'rgba(255,159,28,0.9)';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = 'rgba(255,159,28,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(jx, h * 0.1); ctx.lineTo(jx, h * 0.94); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,159,28,0.95)';
    ctx.font = '700 10px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JUST', jx, h * 0.99);
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
    for (let b = 0; b <= 8; b++) {
        const x = x0 + (b * BEATS_PER_BAR / TOTAL_BEATS) * (x1 - x0);
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

function drawReview() {
    if (!review || !review.ctx) return;
    const { ctx, w, h, beatPx, leftPad } = review;
    ctx.clearRect(0, 0, w, h);
    const yc = h * 0.46;
    const offScale = beatPx / 250;        // 250ms ＝ 1拍ぶんの見かけズレ（視認性のため拡大）
    const maxOff = beatPx * 0.46;         // 隣の拍に被らないよう制限
    const beatX = (i) => leftPad + i * beatPx;

    // 中央の水平ガイド
    ctx.strokeStyle = 'rgba(253,246,238,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w, yc); ctx.stroke();

    // 小節線＋小節番号
    for (let i = 0; i < TOTAL_BEATS; i++) {
        if (i % BEATS_PER_BAR === 0) {
            const x = beatX(i) - beatPx * 0.5;
            ctx.strokeStyle = 'rgba(253,246,238,0.12)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, h * 0.13); ctx.lineTo(x, h * 0.9); ctx.stroke();
            ctx.fillStyle = 'rgba(253,246,238,0.5)';
            ctx.font = '600 11px Outfit, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText((i / BEATS_PER_BAR + 1) + '小節', x + 5, h * 0.1);
        }
    }

    // 各拍：本来の音符＋方向矢印＋自分の入力マーク＋ズレms
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < TOTAL_BEATS; i++) {
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
        drawStrokeArrow(ctx, x, yc + 28, beatDirection(i), 'rgba(255,180,90,0.7)', 0.7);

        // 自分の入力マーク＋ズレms
        ctx.textAlign = 'center';
        ctx.font = '700 11px Outfit, sans-serif';
        const msY = yc + 52;
        if (!r || !r.tapped) {
            // MISS：薄いグレーの×（未入力）
            ctx.save(); ctx.globalAlpha = 0.55;
            ctx.strokeStyle = COLORS.miss; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - 5, yc - 5); ctx.lineTo(x + 5, yc + 5);
            ctx.moveTo(x + 5, yc - 5); ctx.lineTo(x - 5, yc + 5);
            ctx.stroke();
            ctx.restore();
            ctx.fillStyle = COLORS.miss;
            ctx.fillText('MISS', x, msY);
        } else if (cls === 'miss') {
            // タップはしたが MISS（方向ちがい等）：グレーの×＋ラベル
            ctx.save(); ctx.globalAlpha = 0.7;
            ctx.strokeStyle = COLORS.miss; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - 5, yc - 5); ctx.lineTo(x + 5, yc + 5);
            ctx.moveTo(x + 5, yc - 5); ctx.lineTo(x - 5, yc + 5);
            ctx.stroke();
            ctx.restore();
            ctx.fillStyle = COLORS.miss;
            ctx.fillText(r.dirMiss ? '方向MISS' : 'MISS', x, msY);
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
        if (els.resultsDetail && els.resultsDetail.open) fitGraph();
    });
}

/* ── ステータス更新 ─────────────────────────────────────── */
function updateStatus(t) {
    if (t < state.T0) {
        els.barCounter.textContent = 'カウントイン';
    } else {
        const sb = Math.floor((t - state.T0) / state.beatInterval);
        const bar = Math.max(1, Math.min(8, Math.floor(sb / BEATS_PER_BAR) + 1));
        els.barCounter.textContent = `${bar} / 8 小節`;
    }
    const p = Math.max(0, Math.min(1, t / state.endTime));
    els.progressFill.style.width = (p * 100) + '%';
}

/* ── 判定 ───────────────────────────────────────────────── */
function classify(diff) {
    const a = Math.abs(diff);
    if (a <= JUST_MS) return 'just';
    if (a <= NEAR_MS) return diff < 0 ? 'early' : 'late';
    return 'miss';
}

/* タップ／マイク 共通の判定入口。source: 'tap' | 'mic'
   direction: 'down' | 'up'（タップエリアの左右。将来「表＝ダウン／裏＝アップ」判定に拡張可能）。
   マイク由来のみ timingOffsetMs を適用（タップには適用しない）。
   登録できたら true、範囲外/停止中で登録しなかったら false を返す。 */
function registerHit(perfNow, source, direction) {
    if (!state.running) return false;
    const dir = direction || (source === 'mic' ? 'stroke' : 'down');
    // マイク補正：検出時刻に補正値を加算（負＝早める）
    const effPerf = (source === 'mic') ? perfNow + mic.timingOffsetMs : perfNow;
    const hitTime = effPerf - state.startTime;
    const i = Math.round((hitTime - state.T0) / state.beatInterval);
    if (i < 0 || i > TOTAL_BEATS - 1) return false; // カウントイン中・範囲外
    const diff = hitTime - (state.T0 + i * state.beatInterval);
    const timingCls = classify(diff);

    // 方向判定：拍の期待方向（現状STAGE1は全て down）と入力方向を照合。
    // マイク入力(stroke)は方向の概念が無いため常に一致扱い。
    // タップで方向が違う場合は、タイミングが合っていても MISS（方向MISS）にする。
    const expectedDirection = beatDirection(i);
    const inputDirection = dir;
    const directionMatched = (source === 'mic') ? true : (inputDirection === expectedDirection);
    const dirMiss = !directionMatched;
    const cls = dirMiss ? 'miss' : timingCls;

    // 診断：マイクは raw（補正前）/ corrected（補正後）/ offset をログ
    if (source === 'mic') {
        const rawDiff = (perfNow - state.startTime) - (state.T0 + i * state.beatInterval);
        console.debug('[mic] 判定登録 raw=' + (rawDiff >= 0 ? '+' : '') + Math.round(rawDiff)
            + 'ms corrected=' + (diff >= 0 ? '+' : '') + Math.round(diff)
            + 'ms offset=' + mic.timingOffsetMs + 'ms → ' + cls);
    }

    // 同じ拍に複数検出 → 最もジャストに近いものを採用
    const prev = state.results[i];
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

/* ── 再生制御 ───────────────────────────────────────────── */
function buildSchedule() {
    state.beatInterval = 60000 / state.bpm;
    state.pxPerMs = state.pxPerBeat / state.beatInterval;
    state.T0 = COUNT_IN_BEATS * state.beatInterval;
    state.endTime = state.T0 + (TOTAL_BEATS - 1 + TAIL_BEATS) * state.beatInterval;
    state.clickTimes = [];
    for (let i = -COUNT_IN_BEATS; i <= TOTAL_BEATS - 1; i++) {
        const accent = (((i % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR) === 0;
        state.clickTimes.push({ time: state.T0 + i * state.beatInterval, accent, countIn: i < 0 });
    }
    state.nextClick = 0;
}

function loop() {
    if (!state.running) return;
    const t = performance.now() - state.startTime;
    state.currentTime = t;

    while (state.nextClick < state.clickTimes.length && state.clickTimes[state.nextClick].time <= t) {
        const ct = state.clickTimes[state.nextClick];
        click(ct.accent, ct.countIn); // カウントインは clickEnabled に関わらず必ず鳴らす
        state.nextClick++;
    }

    updateStatus(t);
    drawLane(t);

    if (t >= state.endTime) { finish(); return; }
    state.raf = requestAnimationFrame(loop);
}

/* 開始/停止 兼用ボタン：再生中なら停止＋自動リセット、停止中なら開始 */
function onPlayBtn() {
    if (state.running) { stop(); resetGame(); }
    else { play(); }
}

function play() {
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
    state.startTime = performance.now();
    state.raf = requestAnimationFrame(loop);
}

function stop() {
    if (!state.running) return;
    state.running = false;
    cancelAnimationFrame(state.raf);
    setTempoEnabled(true);
    els.playBtn.textContent = '▶ 開始';
    els.playBtn.disabled = false;
    els.latestVerdict.textContent = 'スタンバイ';
    els.latestVerdict.dataset.state = 'idle';
    if (els.tapHint) els.tapHint.classList.remove('dim');
}

function resetData() {
    state.results = new Array(TOTAL_BEATS).fill(null);
    state.markers = [];
    state.micWaveHistory = [];
    state.currentTime = 0;
    state.combo = 0;
    // この走行のマイク診断カウンタをリセット
    mic.inputCount = 0;
    mic.registerCount = 0;
    mic.excludeCount = 0;
    mic.lastExcludeReason = '';
    updateMicDiag();
    updateCombo();
    if (els.judgeFxLayer) els.judgeFxLayer.innerHTML = '';
}

function resetGame() {
    stop();
    resetData();
    if (els.resultsOverlay) els.resultsOverlay.classList.add('hidden');
    if (els.refreshBar) els.refreshBar.classList.remove('hidden'); // モーダルを閉じたら更新バーを戻す
    els.barCounter.textContent = '– / 8 小節';
    els.latestVerdict.dataset.state = 'idle';
    els.latestVerdict.textContent = 'スタンバイ';
    els.progressFill.style.width = '0%';
    state.beatInterval = 60000 / state.bpm;
    state.T0 = COUNT_IN_BEATS * state.beatInterval;
    state.pxPerMs = state.pxPerBeat / state.beatInterval;
    drawLane(0);
}

/* ── 集計・結果 ─────────────────────────────────────────── */
function finish() {
    state.running = false;
    cancelAnimationFrame(state.raf);
    setTempoEnabled(true);
    els.playBtn.textContent = '▶ 開始';
    els.playBtn.disabled = false;
    if (els.tapHint) els.tapHint.classList.remove('dim');
    els.barCounter.textContent = '8 / 8 小節';
    els.latestVerdict.textContent = '終了';
    els.latestVerdict.dataset.state = 'idle';
    els.progressFill.style.width = '100%';

    let just = 0, early = 0, late = 0, miss = 0, scoreSum = 0;
    const diffs = [];
    const firstHalf = [], secondHalf = [];
    for (let i = 0; i < TOTAL_BEATS; i++) {
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
    const score = Math.round(scoreSum / TOTAL_BEATS);
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
    els.rComment.textContent = buildComment({ just, miss, tapped: diffs.length, avg, fAvg, sAvg });

    // 結果をモーダルで表示（ズレ確認レーンがメイン）
    if (els.resultsOverlay) els.resultsOverlay.classList.remove('hidden');
    if (els.refreshBar) els.refreshBar.classList.add('hidden'); // モーダル背後に透けないよう一時的に隠す
    drawResults();
}

function buildComment({ just, miss, tapped, avg, fAvg, sAvg }) {
    if (tapped < 8) return 'タップが少なめでした。もう一度チャレンジしてみましょう。';
    const justRate = just / TOTAL_BEATS;
    if (justRate >= 0.6) return 'かなり安定しています！この感覚をキープしましょう。';
    if (sAvg - fAvg > 30) return '後半でテンポが遅れ気味です（もたり）。クリックを意識して。';
    if (fAvg - sAvg > 30) return '後半で走り気味です。力まず一定をキープしましょう。';
    if (avg <= -25) return '少し前に突っ込み気味です（走り）。ほんの少し待つ意識を。';
    if (avg >= 25) return '少し後ろにモタつき気味です（もたり）。前ノリを意識して。';
    if (miss >= 8) return 'タイミングのばらつきが大きめ。まずはBPMを下げて練習を。';
    return 'おおむね安定しています。少しずつJUSTを増やしていきましょう。';
}

/* ── 入力方法（タップ / ストローク）──────────────────────── */
function setInputMode(mode) {
    state.inputMode = mode;
    if (els.modeTapBtn) els.modeTapBtn.classList.toggle('is-active', mode === 'tap');
    if (els.modeStrokeBtn) els.modeStrokeBtn.classList.toggle('is-active', mode === 'stroke');
    if (mode === 'tap') {
        if (mic.on) stopMic();          // タップ練習はマイクOFF
        if (els.tapArea) els.tapArea.classList.remove('hidden');  // タップエリア表示（左ダウン/右アップ）
        hideMicSetupPrompt();
        if (els.tapHint) els.tapHint.textContent = '左：ダウン ／ 右：アップ で練習';
    } else {
        if (els.tapArea) els.tapArea.classList.add('hidden');     // ストローク時はタップエリアを畳む
        if (els.tapHint) els.tapHint.textContent = '実際にストロークしてください';
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
}

/* マイク許可成功直後の設定誘導（初回のみ。テスト済み or 表示済みなら出さない） */
function maybeShowMicSetupPrompt() {
    if (state.micTestDone || state.micSetupPrompted) return;
    if (!els.micSetupPrompt) return;
    if (els.practice.classList.contains('hidden')) return; // STAGE画面表示中のみ
    els.micSetupPrompt.classList.remove('hidden');
    state.micSetupPrompted = true; // 一度出したら毎回は出さない
    saveSettings();
}

function hideMicSetupPrompt() {
    if (els.micSetupPrompt) els.micSetupPrompt.classList.add('hidden');
}

/* ── テンポ操作 ─────────────────────────────────────────── */
function setTempoEnabled(on) {
    els.tempoUp.disabled = !on;
    els.tempoDown.disabled = !on;
    els.tempoUp.classList.toggle('is-disabled', !on);
    els.tempoDown.classList.toggle('is-disabled', !on);
}

function setBpm(v) {
    if (state.running) return; // 再生中は変更ロック
    state.bpm = Math.max(40, Math.min(200, v));
    els.tempoVal.textContent = state.bpm;
    state.beatInterval = 60000 / state.bpm;
    state.pxPerMs = state.pxPerBeat / state.beatInterval;
    state.T0 = COUNT_IN_BEATS * state.beatInterval;
    drawLane(0);
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
   感度0% = threshold 0.40（大きい音だけ）、感度100% = threshold 0.05（小さい音にも）。 */
const THR_MIN = 0.05, THR_MAX = 0.40;
function sensFromThreshold(thr) {
    return Math.round((THR_MAX - thr) / (THR_MAX - THR_MIN) * 100);
}
function thresholdFromSens(sens) {
    return THR_MAX - (sens / 100) * (THR_MAX - THR_MIN);
}

function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (_) { s = {}; }
    mic.threshold = clampNum(s.threshold, 0.05, 0.40, SETTINGS_DEFAULTS.threshold);
    mic.cooldownMs = clampNum(s.cooldownMs, 100, 400, SETTINGS_DEFAULTS.cooldownMs);
    mic.clickGuardMs = clampNum(s.clickGuardMs, 0, 250, SETTINGS_DEFAULTS.clickGuardMs);
    mic.timingOffsetMs = clampNum(s.timingOffsetMs, -150, 150, SETTINGS_DEFAULTS.timingOffsetMs);
    state.clickVolume = clampNum(s.clickVolume, 0, 100, SETTINGS_DEFAULTS.clickVolume);
    if (typeof s.lastCalibrationDelayMs === 'number') cal.measuredDelay = s.lastCalibrationDelayMs;
    if (typeof s.lastCalibrationAt === 'number') cal.lastAt = s.lastCalibrationAt;
    state.micTestDone = !!s.micTestDone;
    state.micDelayDone = !!s.micDelayDone;
    state.micSetupPrompted = !!s.micSetupPrompted;
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            threshold: mic.threshold,
            cooldownMs: mic.cooldownMs,
            clickGuardMs: mic.clickGuardMs,
            timingOffsetMs: mic.timingOffsetMs,
            clickVolume: state.clickVolume,
            lastCalibrationDelayMs: cal.measuredDelay,
            lastCalibrationAt: cal.lastAt,
            micTestDone: state.micTestDone,
            micDelayDone: state.micDelayDone,
            micSetupPrompted: state.micSetupPrompted,
        }));
    } catch (_) { /* プライベートモード等では無視 */ }
}

/* 現在値をスライダー・数値表示・しきい値ラインへ反映 */
function applySettingsToUI() {
    const sens = sensFromThreshold(mic.threshold);
    els.setThreshold.value = sens;
    els.setThresholdVal.textContent = sens + '％';
    els.setCooldown.value = mic.cooldownMs;
    els.setCooldownVal.textContent = mic.cooldownMs + 'ms';
    if (els.micThreshold) els.micThreshold.style.left = (mic.threshold * 100) + '%';
    if (els.testThreshold) els.testThreshold.style.left = (mic.threshold * 100) + '%';
    if (els.setOffset) {
        els.setOffset.value = mic.timingOffsetMs;
        els.setOffsetVal.textContent = (mic.timingOffsetMs > 0 ? '+' : '') + mic.timingOffsetMs + 'ms';
    }
    if (els.calCurrentOffset) els.calCurrentOffset.textContent = (mic.timingOffsetMs > 0 ? '+' : '') + mic.timingOffsetMs + 'ms';
    if (els.setClickVol) {
        els.setClickVol.value = state.clickVolume;
        els.setClickVolVal.textContent = state.clickVolume + '％';
    }
}

function openSettings(from) {
    settingsReturn = from || 'home';
    if (state.running) stop();
    applySettingsToUI();
    updateMicTestDoneUI();
    updateMicDelayDoneUI();
    updateTestMicState();
    setTestResult('', '');         // 開始前は説明文を出さない
    setTestPhase('');
    if (els.testReco) els.testReco.classList.add('hidden');
    updateTestMicState();          // マイクOFFならメーター等を隠す
    if (mic.on) enterTestMode();   // マイクON中なら実音モニターを有効化
    show('settings');
    requestAnimationFrame(fitPreview); // 表示後にサイズ確定→プレビュー描画
}

function closeSettings() {
    if (cal.active) cancelCalibration();
    exitTestMode();
    show(settingsReturn);
    if (settingsReturn === 'practice') { fitLane(); }
}

function resetSettings() {
    mic.threshold = SETTINGS_DEFAULTS.threshold;
    mic.cooldownMs = SETTINGS_DEFAULTS.cooldownMs;
    mic.clickGuardMs = SETTINGS_DEFAULTS.clickGuardMs;
    mic.timingOffsetMs = SETTINGS_DEFAULTS.timingOffsetMs;
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
        return;
    }
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
    if (els.testThreshold) els.testThreshold.style.left = (mic.threshold * 100) + '%';
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
    test.active = false;
    test.mode = null;
    test.flow = false;
    if (els.micTestBtn) els.micTestBtn.textContent = micTestBtnIdleLabel();
    setTestPhase('');
    if (els.testLevel) { els.testLevel.style.width = '0%'; els.testLevel.classList.remove('over'); }
}

function setTestResult(text, kind) {
    if (!els.testResult) return;
    els.testResult.textContent = text;
    els.testResult.className = 'test-result' + (kind ? ' ' + kind : '');
}

function setTestPhase(t) { if (els.testPhase) els.testPhase.textContent = t; }

/* マイク反応テスト：未実施/実施済みのボタン文言 */
function micTestBtnIdleLabel() {
    return state.micTestDone ? 'もう一度テストする' : 'マイク反応テストを開始';
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
    if (els.micTestBtn && !test.flow) els.micTestBtn.textContent = micTestBtnIdleLabel();
}

/* マイク反応テストの完了を記録（チェック表示・保存） */
function markMicTestDone() {
    if (!state.micTestDone) {
        state.micTestDone = true;
        saveSettings();
    }
    updateMicTestDoneUI();
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
    if (els.calBtn && !cal.active && !mic.calibrating) els.calBtn.textContent = calBtnIdleLabel();
}

/* マイクの遅れ補正の適用を記録（チェック表示・保存） */
function markMicDelayDone() {
    if (!state.micDelayDone) {
        state.micDelayDone = true;
        saveSettings();
    }
    updateMicDelayDoneUI();
}

/* ═══════════════════════════════════════════════════════════
   マイク反応テスト：1ボタンで クリック音テスト → ストロークテスト → 推奨 を自動進行
═══════════════════════════════════════════════════════════ */
function toggleMicTest() {
    if (test.flow) { abortMicTest(); return; }
    startMicTestFlow();
}

async function startMicTestFlow() {
    if (!(await ensureTestMic())) { setTestResult('マイクを許可してください。', 'ng'); return; }
    test.flow = true;
    test.clickDone = false; test.strokeDone = false;
    test.recommended = null; test.recoCooldown = null;
    if (els.testReco) els.testReco.classList.add('hidden');
    els.micTestBtn.textContent = 'テストを中止';
    setTestResult('', '');
    beginClickPhase();
}

function abortMicTest() {
    clearTestTimers();
    test.flow = false; test.mode = null;
    els.micTestBtn.textContent = micTestBtnIdleLabel();
    setTestPhase('');
    setTestResult('マイク反応テストを中止しました', '');
}

/* クリック音テスト（本番と同じクリック：1拍目アクセント/2-4拍目通常／4拍×2周＝8回） */
function beginClickPhase() {
    test.mode = 'click';
    test.clickI = 0; test.clickPeaks = []; test.clickResults = []; test.curPeak = 0;
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
    test.maxClickPeak = test.clickPeaks.length ? Math.max(...test.clickPeaks) : 0;
    setTestPhase('ストロークテストへ…');
    test.timers.push(setTimeout(beginStrokePhase, 800));
}

/* ストロークテスト（4回・カウントダウン誘導） */
function beginStrokePhase() {
    if (test.mode === null && !test.flow) return;
    test.mode = 'stroke';
    test.strokeRound = 0; test.strokePeaks = []; test.strokeDetected = 0; test.strokeDoubleCount = 0;
    runStrokeRound();
}

function runStrokeRound() {
    if (test.mode !== 'stroke') return;
    if (test.strokeRound >= STROKE_TEST_COUNT) { endStrokePhase(); return; }
    test.strokeRound++;
    const r = test.strokeRound;
    const cd = [['準備…', 0], ['3', 400], ['2', 800], ['1', 1200]];
    cd.forEach(([txt, ms]) => tSet(() => { if (test.mode === 'stroke') setTestPhase(r + ' / ' + STROKE_TEST_COUNT + ' 回目　' + txt); }, ms));
    tSet(() => {
        if (test.mode !== 'stroke') return;
        test.curPeak = 0; test.curOnsets = 0;
        test.strokeFrom = performance.now();
        test.strokeUntil = test.strokeFrom + 1400;
        setTestPhase('今、1回だけストローク！（' + r + ' / ' + STROKE_TEST_COUNT + '）');
    }, 1700);
    tSet(() => {
        if (test.mode !== 'stroke') return;
        test.strokeUntil = 0;
        test.strokePeaks.push(test.curPeak);
        if (test.curPeak >= mic.threshold) test.strokeDetected++;
        if (test.curOnsets >= 2) test.strokeDoubleCount++;
        runStrokeRound();
    }, 3300);
}

function endStrokePhase() {
    test.mode = null; test.flow = false;
    els.micTestBtn.textContent = micTestBtnIdleLabel();
    setTestPhase('');
    const valid = test.strokePeaks.filter((p) => p >= mic.threshold);
    test.minStrokePeak = valid.length ? Math.min(...valid) : null;
    test.maxStrokePeak = valid.length ? Math.max(...valid) : null;
    test.strokeDone = true;
    // メイン表示には概要を出さない（おすすめ設定中心）。詳細は折りたたみへ。
    setTestResult('', '');
    updateReco();
}

/* ── おすすめ設定（反応ライン＝%／クリック音量／二重反応防止）＋詳細結果 ── */
function updateReco() {
    if (!els.testReco) return;
    if (!(test.clickDone && test.strokeDone)) { els.testReco.classList.add('hidden'); return; }
    markMicTestDone(); // クリック＋ストロークの両テストが完了 → 実施済みにする
    const maxClick = test.clickPeaks.length ? Math.max(...test.clickPeaks) : 0;
    const minStroke = test.minStrokePeak;
    const clickReacted = test.clickResults.filter((r) => r.reacted).length;
    els.testReco.classList.remove('hidden');

    // ① 反応ライン（マイク感度）：クリック最大とストローク最小の間 → 表示は手動設定と同じ%
    let canApply = false;
    if (minStroke != null && maxClick < minStroke) {
        let rec = (maxClick + minStroke) / 2;
        rec = Math.max(0.05, Math.min(0.40, rec));
        test.recommended = rec;
        els.recoThr.textContent = sensFromThreshold(rec) + '％';
        canApply = true;
    } else {
        test.recommended = null;
        els.recoThr.textContent = '—';
    }

    // ② クリック音量：クリックが反応していれば少し下げる、なければ現在値
    let recoVol = state.clickVolume;
    if (clickReacted > 0) recoVol = Math.max(10, state.clickVolume - 20);
    test.recoClickVolume = recoVol;
    els.recoClickVol.textContent = recoVol + '％';

    // ③ 二重反応防止：二重反応があれば長めに、なければ現在値
    let recoCool = mic.cooldownMs;
    if (test.strokeDoubleCount > 0 && mic.cooldownMs < 250) recoCool = Math.min(400, mic.cooldownMs + 80);
    test.recoCooldown = recoCool;
    els.recoCooldown.textContent = recoCool + 'ms';

    // メッセージ＋適用ボタン（重なり時のみメイン表示。分離OK時は適用ボタンのみ）
    if (canApply) {
        els.recoMsg.classList.add('hidden');
        els.recoApplyBtn.classList.remove('hidden');
    } else {
        els.recoMsg.textContent = '自動設定が難しい状態です。クリック音量を下げるか、イヤホンを使ってからもう一度テストしてください。';
        els.recoMsg.className = 'test-reco-msg ng';
        els.recoApplyBtn.classList.add('hidden');
    }

    updateTestDetail(maxClick, minStroke, clickReacted, canApply);
}

/* 詳細なテスト結果（折りたたみ）：数値＋レベルバー視覚化 */
function updateTestDetail(maxClick, minStroke, clickReacted, canApply) {
    // レベルバー：0〜0.7 を 0〜100% にマップ
    const SCALE = 0.7;
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
    // 数値（小さく）＋ 手動設定にどうつながるかの説明
    const clickLabel = clickReacted === 0 ? '反応なし' : (clickReacted + ' / ' + CLICK_TEST_COUNT + ' 回反応');
    const rows = [
        ['クリック音', clickLabel],
        ['ストローク', test.strokeDetected + ' / ' + STROKE_TEST_COUNT + ' 回検出'],
        ['クリック音 最大', maxClick.toFixed(2)],
        ['ストローク 最小', minStroke != null ? minStroke.toFixed(2) : '–'],
        ['二重反応', test.strokeDoubleCount + ' 回'],
    ];
    const numbers = rows.map((r) => '<div class="tds-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');

    // 説明文（パターン別）
    const exps = [];
    exps.push('<p class="tds-note">クリック音の最大値より上、ストローク音の最小値より下に反応ラインを置くと、クリック音には反応せず、ストローク音には反応しやすくなります。</p>');
    if (canApply) {
        // パターンA
        const sens = sensFromThreshold(test.recommended);
        exps.push('<p class="tds-note">クリック音（最大 ' + maxClick.toFixed(2) + '）より大きく、ストローク音（最小 ' + minStroke.toFixed(2) + '）より小さい位置に置けます。そのため <b>反応ライン（マイク感度）は ' + sens + '% がおすすめ</b>です。</p>');
        if (clickReacted === 0) {
            exps.push('<p class="tds-note">クリック音が反応ラインより下に収まっているため、<b>クリック音量は現在の ' + state.clickVolume + '% のままでOK</b>です。</p>');
        } else {
            exps.push('<p class="tds-note">クリック音が少し入っているため、<b>クリック音量を ' + test.recoClickVolume + '% に下げる</b>と安定します。</p>');
        }
        if (test.strokeDoubleCount === 0) {
            exps.push('<p class="tds-note">二重反応が出ていないため、<b>二重反応防止は現在の ' + mic.cooldownMs + 'ms のままでOK</b>です。</p>');
        } else {
            exps.push('<p class="tds-note tds-warn">1回のストロークで複数回反応しています。<b>二重反応防止を ' + test.recoCooldown + 'ms くらいに上げる</b>と安定しやすくなります。</p>');
        }
    } else {
        // パターンB：クリックがストローク音に近い
        exps.push('<p class="tds-note tds-warn">クリック音がストローク音に近い大きさで入っています。<b>クリック音量を下げるか、イヤホンを使う</b>と安定しやすくなります。</p>');
    }
    // パターンC：ストロークが弱い／検出が少ない
    if (test.strokeDetected < STROKE_TEST_COUNT) {
        exps.push('<p class="tds-note tds-warn">ストローク音が反応ラインに近いため、弱く弾くと反応しないことがあります。<b>反応ライン（マイク感度）を上げる</b>か、少し大きめに弾いてください。</p>');
    }

    if (els.testDetailStats) {
        els.testDetailStats.innerHTML = exps.join('') + '<div class="tds-numbers">' + numbers + '</div>';
    }
}

function applyReco() {
    if (test.recommended == null) return; // 反応ラインが出せない場合は適用しない
    mic.threshold = Math.max(0.05, Math.min(0.40, test.recommended));
    if (test.recoClickVolume != null) state.clickVolume = test.recoClickVolume;
    if (test.recoCooldown != null) mic.cooldownMs = test.recoCooldown;
    // 内部値→スライダー・数値・マーカー・プレビューを同期
    applySettingsToUI();
    drawMicPreview();
    saveSettings();
    test.clickDone = false; test.strokeDone = false;
    els.testReco.classList.add('hidden');
    setTestResult('おすすめ設定を適用しました。', 'ok');
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
        els.micLevel.style.width = (Math.min(1, mic.env) * 100).toFixed(1) + '%';
        els.micLevel.classList.toggle('over', peak >= mic.threshold);
    }

    const now = performance.now();

    // 背景波形用にエンベロープを時系列バッファへ保存（古いものは破棄）
    const hist = state.micWaveHistory;
    hist.push({ perf: now, level: mic.env });
    while (hist.length && (now - hist[0].perf) > MIC_WAVE_WINDOW_MS) hist.shift();

    // 立ち上がり検出：threshold交差 または 音量の急増（rise）。
    // クリック音ON/OFFで基本ロジックは共通。余韻中でも急増を拾えるようにする。
    const rise = peak - mic.prevPeak;
    const crossed = peak >= mic.threshold && mic.prevPeak < mic.threshold;
    const bigRise = peak >= mic.threshold && rise >= RISE_DELTA;
    const onset = crossed || bigRise;
    const trigger = crossed ? 'threshold交差' : 'large-rise';

    // ── キャリブレーション中：クリック音→検出の遅延だけを測る（通常判定には流さない）──
    if (mic.calibrating) {
        // モニター（レベル＋反応ライン＋統計）
        cal.lastLevel = peak;
        if (peak > cal.maxPeak) cal.maxPeak = peak;
        if (els.calLevel) {
            els.calLevel.style.width = (Math.min(1, peak) * 100).toFixed(1) + '%';
            els.calLevel.classList.toggle('over', peak >= mic.threshold);
        }
        if (onset && (now - cal.lastDetect) > 150) {
            cal.lastDetect = now;
            cal.rawOnsets++;
            const d = now - cal.lastClickPerf;
            if (d >= 5 && d <= 400) {
                cal.samples.push(d);
            } else {
                cal.outOfRange++;
            }
        }
        updateCalMonitor();
        mic.prevPeak = peak;
        mic.raf = requestAnimationFrame(micLoop);
        return;
    }

    // ── 実音テスト（設定画面）：registerHit/スコアには一切流さない ──
    if (test.active) {
        if (els.testLevel) {
            els.testLevel.style.width = (Math.min(1, peak) * 100).toFixed(1) + '%';
            els.testLevel.classList.toggle('over', peak >= mic.threshold);
        }
        // 計測窓内のピークを追跡（しきい値に関係なく生ピークを記録）
        const inClickWin = test.mode === 'click' && now >= test.clickWinFrom && now <= test.clickWinTo;
        const inStrokeWin = test.mode === 'stroke' && now >= test.strokeFrom && now <= test.strokeUntil;
        if (inClickWin || inStrokeWin) test.curPeak = Math.max(test.curPeak, peak);
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
    const inGuard = guardActive && (now - state.lastClickPerf) <= guardMs;
    // ガード中でも、しきい値の STRONG_STROKE_FACTOR 倍以上に大きい音はストロークとして通す
    const strongEnough = peak >= mic.threshold * STRONG_STROKE_FACTOR;
    // カウントイン中（本編開始 T0 前）はマイク検出を無視する
    const inCountIn = state.running && state.currentTime < state.T0;

    if (onset) {
        mic.inputCount++;                 // ① 入力検出（反応ライン超え／急増）
        flashDetect(peak);                // 入力検出の視覚フィードバック（診断は常時）
        console.debug('[mic] 入力 peak=' + peak.toFixed(2) + ' thr=' + mic.threshold.toFixed(2)
            + ' (×' + (peak / mic.threshold).toFixed(1) + ') prev=' + mic.prevPeak.toFixed(2)
            + ' rise=' + rise.toFixed(2) + ' trigger=' + trigger
            + ' click=' + (state.clickEnabled ? 'ON' : 'OFF') + ' vol=' + state.clickVolume);
        if (!state.running) {
            micExclude('停止中');
        } else if (inCountIn) {
            micExclude('カウントイン中');
        } else if (!cooled) {
            micExclude('二重反応防止');     // クールダウン
        } else if (inGuard && !strongEnough) {
            micExclude('クリック直後の無視');  // 詳細ガード
        } else {
            const ok = registerHit(now, 'mic'); // ② 判定登録（micオフセット適用）
            if (ok) { mic.lastDetect = now; mic.registerCount++; updateMicDiag(); }
            else { micExclude('範囲外'); }
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
    if (els.calThreshold) els.calThreshold.style.left = (mic.threshold * 100) + '%';
    if (els.calCount) els.calCount.textContent = cal.samples.length + '回';
    if (els.calLast) els.calLast.textContent = cal.lastLevel.toFixed(2);
    if (els.calMax) els.calMax.textContent = cal.maxPeak.toFixed(2);
}

function setCalUI(mode, arg) {
    if (!els.calStatus) return;
    const showMonitor = (on) => { if (els.calMonitor) els.calMonitor.classList.toggle('hidden', !on); };
    if (mode === 'measuring') {
        els.calStatus.classList.remove('hidden');
        els.calStatus.textContent = '測定中 ' + cal.i + ' / ' + CAL_CLICKS
            + '　検出 ' + cal.samples.length + '回（測定用の音量・感度で実行中・通常設定には影響しません）';
        els.calResult.classList.add('hidden');
        els.calBtn.disabled = true;
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
        showMonitor(false);
    } else if (mode === 'failed') {
        els.calStatus.classList.remove('hidden');
        els.calStatus.textContent = arg || '測定できませんでした。スピーカー音量、マイク許可、周囲の音を確認してください。';
        els.calResult.classList.add('hidden');
        els.calBtn.disabled = false;
        els.calBtn.textContent = calBtnIdleLabel();
        showMonitor(false);
    } else if (mode === 'idle') {
        els.calStatus.classList.add('hidden');
        els.calResult.classList.add('hidden');
        els.calBtn.disabled = false;
        els.calBtn.textContent = calBtnIdleLabel();
        showMonitor(false);
    }
}

/* キャリブレーション中だけ測定専用値を使う。開始時に退避し、終了/失敗/キャンセルで復元 */
function applyCalSettings() {
    cal.saved = {
        threshold: mic.threshold,
        cooldownMs: mic.cooldownMs,
        clickGuardMs: mic.clickGuardMs,
        clickVolume: state.clickVolume,
    };
    mic.threshold = CAL_THRESHOLD;
    mic.cooldownMs = CAL_COOLDOWN_MS;
    state.clickVolume = CAL_CLICK_VOLUME;
    // クリック音ガードはキャリブレーション中は使わない（クリック音そのものを拾うため）
    mic.clickGuardMs = 0;
    if (els.calThreshold) els.calThreshold.style.left = (mic.threshold * 100) + '%';
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
    mic.calibrating = true;
    mic.prevPeak = 0;
    setCalUI('measuring');
    cal.timer = setInterval(() => {
        if (cal.i >= CAL_CLICKS) { clearInterval(cal.timer); cal.timer = 0; finishCalibration(); return; }
        cal.i++;
        cal.lastClickPerf = performance.now();
        calClick(); // 測定専用クリック（広帯域・最大音量・iPhoneでも拾いやすい）
        setCalUI('measuring');
    }, CAL_INTERVAL_MS);
}

/* 測定失敗時に、原因を推定して具体的な案内文を返す（C案：失敗理由の表示） */
function buildCalFailReason() {
    if (cal.maxPeak < CAL_SILENCE_PEAK) {
        return '測定できませんでした：マイク入力がほとんどありません。マイクの許可と、端末の音量を確認してください。';
    }
    if (cal.maxPeak < mic.threshold) {
        return '測定できませんでした：マイク入力が小さすぎます。端末の音量を上げるか、スピーカーに近づけてください。';
    }
    if (cal.rawOnsets > 0) {
        return '測定できませんでした：音は検出していますが、タイミングが安定しません。静かな場所で、もう一度お試しください。';
    }
    return '測定できませんでした：クリック音をマイクで検出できませんでした。音量を上げるか、スピーカーに近づけてください。';
}

function finishCalibration() {
    mic.calibrating = false;
    cal.active = false;
    restoreCalSettings();     // ユーザー設定へ復元
    const s = cal.samples.slice().sort((a, b) => a - b);
    cal.successCount = s.length;
    if (s.length < 3) { setCalUI('failed', buildCalFailReason()); return; }
    // 外れ値に強い中央値＋ばらつき（中央絶対偏差ベース）
    const median = s[Math.floor(s.length / 2)];
    const devs = s.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
    const spread = Math.round(devs[Math.floor(devs.length / 2)] || 0);
    cal.measuredDelay = Math.round(median);
    cal.spread = spread;
    cal.proposedOffset = Math.max(-150, Math.min(150, -cal.measuredDelay));
    setCalUI('result');
    console.info('[cal] samples=' + JSON.stringify(s) + ' median=' + cal.measuredDelay + 'ms ±' + spread + ' → offset=' + cal.proposedOffset + 'ms');
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
}

/* ── イベント結線 ───────────────────────────────────────── */
function bind() {
    els.startBtn.addEventListener('click', () => openStage(1));
    // 全画面共通ナビ（戻る / TOP / 設定）
    if (els.navBackBtn) els.navBackBtn.addEventListener('click', navBack);
    if (els.navTopBtn) els.navTopBtn.addEventListener('click', goTop);
    if (els.settingsBtn) els.settingsBtn.addEventListener('click', openSettingsFromCurrent);
    // 入力方法（タップ / ストローク）
    if (els.modeTapBtn) els.modeTapBtn.addEventListener('click', () => setInputMode('tap'));
    if (els.modeStrokeBtn) els.modeStrokeBtn.addEventListener('click', () => setInputMode('stroke'));

    // 設定画面（旧導線は撤去済み。あれば結線）
    if (els.homeSettingsBtn) els.homeSettingsBtn.addEventListener('click', () => openSettings('home'));
    if (els.micSettingsBtn) els.micSettingsBtn.addEventListener('click', () => openSettings('practice'));
    els.settingsBackBtn.addEventListener('click', closeSettings);
    els.settingsResetBtn.addEventListener('click', resetSettings);

    els.setThreshold.addEventListener('input', () => {
        const sens = parseInt(els.setThreshold.value, 10);
        mic.threshold = thresholdFromSens(sens);
        els.setThresholdVal.textContent = sens + '％';
        if (els.micThreshold) els.micThreshold.style.left = (mic.threshold * 100) + '%';
        if (els.testThreshold) els.testThreshold.style.left = (mic.threshold * 100) + '%';
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

    // 手動設定（折りたたみ）を開いたら、中のプレビューをサイズ確定して描画
    if (els.manualDetail) els.manualDetail.addEventListener('toggle', () => { if (els.manualDetail.open) fitPreview(); });

    // キャリブレーション
    els.calBtn.addEventListener('click', startCalibration);
    els.calApplyBtn.addEventListener('click', applyCalibration);

    // 実音テスト（1ボタン自動フロー）
    els.micTestBtn.addEventListener('click', toggleMicTest);
    els.recoApplyBtn.addEventListener('click', applyReco);
    els.tempoUp.addEventListener('click', () => setBpm(state.bpm + 5));
    els.tempoDown.addEventListener('click', () => setBpm(state.bpm - 5));
    els.playBtn.addEventListener('click', onPlayBtn);          // 開始/停止 兼用
    // 結果モーダル：閉じる＝結果を閉じて開始前へ／もう一度＝閉じてリトライ
    if (els.rCloseBtn) els.rCloseBtn.addEventListener('click', () => { if (els.resultsOverlay) els.resultsOverlay.classList.add('hidden'); resetGame(); });
    els.retryBtn.addEventListener('click', () => { if (els.resultsOverlay) els.resultsOverlay.classList.add('hidden'); resetGame(); play(); });
    // 結果モーダルの詳細（折りたたみ）を開いたら、中のズレ履歴グラフをサイズ確定して描画
    if (els.resultsDetail) els.resultsDetail.addEventListener('toggle', () => { if (els.resultsDetail.open) fitGraph(); });

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
        if (!els.settings.classList.contains('hidden')) { fitPreview(); return; }
        if (els.practice.classList.contains('hidden')) return;
        fitLane();
        if (els.resultsOverlay && !els.resultsOverlay.classList.contains('hidden')) {
            fitReview();
            if (els.resultsDetail && els.resultsDetail.open) fitGraph();
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
    updateMicDiag();             // マイク診断カウンタ・補正値の初期表示
    setClickEnabled(true);
    show('home');
}

document.addEventListener('DOMContentLoaded', init);
