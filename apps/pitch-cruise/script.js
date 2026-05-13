/** アプリの版表示（リリースのたびにここを更新。運用ルールは README_VERSIONS.md 参照） */
const PITCH_TRAINER_APP_VERSION = '2.7.0';

/** 検証ハブ（Staging）の Ver 表記の括弧内。小さな更新は原則ここだけ増やす（版番号の変更は別指示時のみ） */
const PITCH_TRAINER_APP_BUILD = '43';

/** インフォメーション「New」バッジ管理 */
(function initInfoNewBadge() {
    const INFO_NEW_VERSION_KEY = 'pitchCruiseInfoNewSeen';
    const currentVersion = PITCH_TRAINER_APP_VERSION;
    const lastSeenVersion = localStorage.getItem(INFO_NEW_VERSION_KEY);

    // 初回起動 or バージョンアップ時のみ表示
    window.shouldShowInfoNewBadge = !lastSeenVersion || lastSeenVersion !== currentVersion;

    // Service Worker からのメッセージを受け取り
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', function(event) {
            if (event.data && event.data.type === 'INFO_VERSION_UPDATED') {
                localStorage.removeItem(INFO_NEW_VERSION_KEY);
                window.shouldShowInfoNewBadge = true;
            }
        });
    }

    // インフォメーションページで確認時に localStorage を更新
    window.markInfoAsViewed = function() {
        localStorage.setItem(INFO_NEW_VERSION_KEY, currentVersion);
        window.shouldShowInfoNewBadge = false;
    };

    // トップページで「New」バッジの表示制御
    function updateInfoNewBadgeDisplay() {
        var badge = document.getElementById('home-info-new-badge');
        if (badge) {
            if (window.shouldShowInfoNewBadge) {
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateInfoNewBadgeDisplay);
    } else {
        updateInfoNewBadgeDisplay();
    }
}());

/** Staging 検証（?stagingPreview=1）: メロディ Pro に「STAGEに追加」で保存したスロット ID 範囲 */
const STAGING_PRO_MELODY_SLOT_MIN = 5001;
const STAGING_PRO_MELODY_SLOT_MAX = 5099;
const STAGING_PRO_MELODY_SLOTS_KEY = 'pitchTrainerStagingProMelodySlots';

/** Staging 検証: コード Pro に「STAGEに追加」で保存したスロット ID 範囲 */
const STAGING_PRO_CHORD_SLOT_MIN = 5101;
const STAGING_PRO_CHORD_SLOT_MAX = 5199;
const STAGING_PRO_CHORD_SLOTS_KEY = 'pitchTrainerStagingProChordSlots';

// ===================== テストモード定数・状態 =====================

const TEST_MODE_ENABLED_KEY = 'pitchTrainerTestModeEnabled';
const TEST_MODE_RESULTS_KEY = 'pitchTrainerTestModeResults';
const TEST_MODE_REQUIRED_CORRECT = 20;
const TEST_MODE_TIME_LIMIT_MS = 4000;

const testModeState = {
    enabled: false,
    active: false,
    currentCategory: null,
    currentStageKey: null,
    currentStageId: null,
    isRecordableStage: false,
    correctCount: 0,
    requiredCorrect: TEST_MODE_REQUIRED_CORRECT,
    timeLimitMs: TEST_MODE_TIME_LIMIT_MS,
    timerId: null,
    countdownRafId: null,
    questionStartedAt: null,
    answerDeadlineAt: null,
    failureReason: null
};

function isTestModeEnabled() {
    return testModeState.enabled;
}

function getTestStageKey(category, stageId) {
    if (category === 'melody' && stageId >= 1 && stageId <= 6) return 'stage-' + stageId;
    if (category === 'chord' && stageId >= 101 && stageId <= 106) return 'stage-' + stageId;
    if (category === 'melody' && stageId >= STAGING_PRO_MELODY_SLOT_MIN && stageId <= STAGING_PRO_MELODY_SLOT_MAX) return 'custom-' + stageId;
    if (category === 'chord' && stageId >= STAGING_PRO_CHORD_SLOT_MIN && stageId <= STAGING_PRO_CHORD_SLOT_MAX) return 'custom-' + stageId;
    return null; // 未保存カスタム (99/199) は記録しない
}

function loadTestModeResults() {
    try {
        const raw = localStorage.getItem(TEST_MODE_RESULTS_KEY);
        if (!raw) return { melody: {}, chord: {} };
        const parsed = JSON.parse(raw);
        return { melody: parsed.melody || {}, chord: parsed.chord || {} };
    } catch (e) {
        return { melody: {}, chord: {} };
    }
}

function saveTestModeResult(category, stageKey) {
    if (!stageKey) return;
    try {
        const results = loadTestModeResults();
        if (!results[category]) results[category] = {};
        const prev = results[category][stageKey] || { clearCount: 0 };
        results[category][stageKey] = {
            clearCount: prev.clearCount + 1,
            lastClearedAt: new Date().toISOString()
        };
        localStorage.setItem(TEST_MODE_RESULTS_KEY, JSON.stringify(results));
    } catch (e) {
        console.warn('PitchTrainer: Failed to save test mode result', e);
    }
}

function startTestModeRun(game, stageId) {
    const cfg = game.stageConfig[stageId];
    const category = (cfg && cfg.isChord) ? 'chord' : 'melody';
    const stageKey = getTestStageKey(category, stageId);
    testModeState.active = true;
    testModeState.currentCategory = category;
    testModeState.currentStageKey = stageKey;
    testModeState.currentStageId = stageId;
    testModeState.isRecordableStage = stageKey !== null;
    testModeState.correctCount = 0;
    testModeState.failureReason = null;
    clearTestModeAnswerTimer();
    document.body.classList.add('test-mode-active');
    updateTestModeInGameUI(game);
}

function stopTestModeRun(game) {
    clearTestModeAnswerTimer();
    testModeState.active = false;
    testModeState.failureReason = null;
    testModeState.answerDeadlineAt = null;
    document.body.classList.remove('test-mode-active');
    if (game) updateTestModeInGameUI(game);
}

function getPlaySequenceEndMs(game) {
    const noteDuration = 0.8 / game.noteSpeed;
    const gap = 0.2 / game.noteSpeed;
    const seqLen = game.currentSequence.length;
    return ((seqLen - 1) * (noteDuration + gap) + noteDuration + game.audio.sustainTime) * 1000;
}

function startTestModeAnswerTimer(game) {
    clearTestModeAnswerTimer();
    const playEndMs = getPlaySequenceEndMs(game);

    testModeState.timerId = setTimeout(() => {
        testModeState.timerId = null;
        if (!testModeState.active) return;
        const deadline = Date.now() + testModeState.timeLimitMs;
        testModeState.answerDeadlineAt = deadline;

        function tick() {
            if (!testModeState.active || testModeState.answerDeadlineAt === null) return;
            const remaining = testModeState.answerDeadlineAt - Date.now();
            if (remaining <= 0) {
                testModeState.answerDeadlineAt = null;
                if (testModeState.active && !game.isRoundOver) {
                    game.isRoundOver = true;
                    clearTestModeAnswerTimer();
                    handleTestModeFailure('timeout', game);
                }
                return;
            }
            _updateTestModeTimerDisplay(remaining);
            testModeState.countdownRafId = requestAnimationFrame(tick);
        }
        testModeState.countdownRafId = requestAnimationFrame(tick);
    }, playEndMs);
}

function clearTestModeAnswerTimer() {
    if (testModeState.timerId !== null) {
        clearTimeout(testModeState.timerId);
        testModeState.timerId = null;
    }
    if (testModeState.countdownRafId !== null) {
        cancelAnimationFrame(testModeState.countdownRafId);
        testModeState.countdownRafId = null;
    }
    testModeState.answerDeadlineAt = null;
}

function _updateTestModeTimerDisplay(remainingMs) {
    const timerEl = document.getElementById('test-mode-timer');
    if (!timerEl) return;
    timerEl.textContent = '残り ' + (remainingMs / 1000).toFixed(1) + '秒';
    timerEl.classList.toggle('urgent', remainingMs < 1000);
}

function updateTestModeInGameUI(game) {
    const bar = document.getElementById('test-mode-status-bar');
    if (!bar) return;

    if (!testModeState.active) {
        bar.classList.add('hidden');
        _setTestModeButtonRestrictions(false, game);
        return;
    }

    bar.classList.remove('hidden');

    const progressEl = document.getElementById('test-mode-progress');
    const timerEl = document.getElementById('test-mode-timer');
    if (progressEl) progressEl.textContent = testModeState.correctCount + ' / ' + testModeState.requiredCorrect;
    if (timerEl && testModeState.answerDeadlineAt === null) {
        timerEl.textContent = '--';
        timerEl.classList.remove('urgent');
    }

    _setTestModeButtonRestrictions(true, game);

    const answerToggle = document.getElementById('answer-mode-toggle');
    const answerLabel = document.getElementById('answer-mode-status');
    if (answerToggle) { answerToggle.disabled = true; answerToggle.checked = true; }
    if (answerLabel) {
        answerLabel.innerHTML = '回答ON固定<br><small style="font-size:0.7em;color:rgba(255,255,255,0.5)">テスト中は変更できません</small>';
    }
}

function _setTestModeButtonRestrictions(restrict, game) {
    ['replay-btn', 'tonic-btn', 'scale-btn', 'settings-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = restrict;
        if (restrict) btn.setAttribute('aria-disabled', 'true');
        else btn.removeAttribute('aria-disabled');
    });

    if (!restrict) {
        const answerToggle = document.getElementById('answer-mode-toggle');
        const answerLabel = document.getElementById('answer-mode-status');
        if (answerToggle) {
            answerToggle.disabled = false;
            if (game) answerToggle.checked = game.isAnswerMode;
        }
        if (answerLabel && game) {
            if (game.isAnswerMode) {
                answerLabel.textContent = '回答ON';
                answerLabel.style.color = '#fff';
            } else {
                answerLabel.textContent = '回答OFF (音確認のみ)';
                answerLabel.style.color = 'rgba(255, 255, 255, 0.6)';
            }
        }
    }
}

function handleTestModeCorrectAnswer(game) {
    testModeState.correctCount++;
    const progressEl = document.getElementById('test-mode-progress');
    if (progressEl) progressEl.textContent = testModeState.correctCount + ' / ' + testModeState.requiredCorrect;

    game.showFeedback('正解！ (' + testModeState.correctCount + '/' + testModeState.requiredCorrect + ')', 'correct');

    const timerEl = document.getElementById('test-mode-timer');
    if (timerEl) { timerEl.textContent = '--'; timerEl.classList.remove('urgent'); }

    if (testModeState.correctCount >= testModeState.requiredCorrect) {
        setTimeout(() => handleTestModeClear(game), 600 / game.noteSpeed);
    } else {
        setTimeout(() => void game.nextRound(), 750 / game.noteSpeed);
    }
}

function handleTestModeFailure(reason, game) {
    testModeState.failureReason = reason;
    const failedAt = testModeState.correctCount;

    const timerEl = document.getElementById('test-mode-timer');
    if (timerEl) { timerEl.textContent = '--'; timerEl.classList.remove('urgent'); }

    const stageId = testModeState.currentStageId;
    stopTestModeRun(game);
    game.isPlaying = false;
    game.audio.stopAllScheduledSounds();
    showTestModeFailureScreen(game, stageId, failedAt, reason);
}

function handleTestModeClear(game) {
    if (testModeState.isRecordableStage) {
        saveTestModeResult(testModeState.currentCategory, testModeState.currentStageKey);
    }
    const stageId = testModeState.currentStageId;
    const stageKey = testModeState.currentStageKey;
    const category = testModeState.currentCategory;
    const isRecordable = testModeState.isRecordableStage;

    let clearCount = 0;
    if (isRecordable) {
        const results = loadTestModeResults();
        clearCount = (results[category] && results[category][stageKey]) ? results[category][stageKey].clearCount : 0;
    }

    stopTestModeRun(game);
    game.isPlaying = false;
    game.audio.stopAllScheduledSounds();
    showTestModeClearScreen(game, stageId, clearCount);
    updateTestModeStageButtons(game);
}

function showTestModeClearScreen(game, stageId, clearCount) {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    document.getElementById('screen-test-mode-clear')?.remove();
    ['screen-home', 'screen-melody', 'screen-chord'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
    });

    const nextId = _getNextStageId(game, stageId);
    const nextBtnHTML = nextId ? '<button class="btn-primary tm-clear-next">次のSTAGEへ</button>' : '';
    const countText = clearCount > 0 ? '<p class="test-mode-clear-count">クリア回数：' + clearCount + '回目</p>' : '';

    // STAGE名・説明文を stageConfig から取得
    const cfg = game.stageConfig[stageId] || {};
    const stageLabel = cfg.label || ('STAGE ' + stageId);
    const stageDesc  = cfg.description || '';
    const stageHeaderHTML = '<p class="tm-clear-stage-name">' + stageLabel + '</p>' +
        (stageDesc ? '<p class="tm-clear-stage-desc">' + stageDesc + '</p>' : '');

    const screen = document.createElement('div');
    screen.id = 'screen-test-mode-clear';
    screen.className = 'modal';
    screen.innerHTML = '<div class="test-mode-result-screen test-mode-clear-screen">' +
        '<div class="test-mode-result-icon tm-clear-icon-animate">🎉</div>' +
        stageHeaderHTML +
        '<h2 class="test-mode-result-title tm-clear-title-animate">CLEAR!</h2>' +
        '<p class="test-mode-result-msg">' + TEST_MODE_REQUIRED_CORRECT + '問連続正解達成！<br>' +
        'このSTAGEの音の動きが、<br>かなり耳に入ってきています。</p>' +
        countText +
        '<div class="test-mode-result-actions">' +
        '<button class="btn-primary tm-clear-retry">もう1回挑戦する</button>' +
        nextBtnHTML +
        '<button class="btn-secondary tm-clear-back">STAGE選択に戻る</button>' +
        '</div></div>';

    overlay.classList.remove('hidden');
    overlay.appendChild(screen);

    // 紙吹雪 & ファンファーレ（一度だけ）
    _launchConfetti(screen);
    _playFanfare();

    screen.querySelector('.tm-clear-retry')?.addEventListener('click', () => {
        screen.remove(); overlay.classList.add('hidden'); game.startGame(stageId);
    });
    screen.querySelector('.tm-clear-next')?.addEventListener('click', () => {
        const nid = _getNextStageId(game, stageId);
        if (nid) { screen.remove(); overlay.classList.add('hidden'); game.startGame(nid); }
    });
    screen.querySelector('.tm-clear-back')?.addEventListener('click', () => {
        screen.remove(); game.showStageSelector();
    });
}

/** テストモードクリア時のファンファーレ音（C→E→G→高C アルペジオ, Web Audio API） */
function _playFanfare() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        // アルペジオ：C4→E4→G4→C5（各 0.18s）
        const notes = [
            { freq: 261.63, start: 0.00, dur: 0.22 },
            { freq: 329.63, start: 0.18, dur: 0.22 },
            { freq: 392.00, start: 0.36, dur: 0.22 },
            { freq: 523.25, start: 0.54, dur: 0.40 },
        ];
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.28, ctx.currentTime);
        masterGain.connect(ctx.destination);
        notes.forEach(({ freq, start, dur }) => {
            const osc = ctx.createOscillator();
            const env = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            env.gain.setValueAtTime(0, ctx.currentTime + start);
            env.gain.linearRampToValueAtTime(1, ctx.currentTime + start + 0.02);
            env.gain.setValueAtTime(1, ctx.currentTime + start + dur - 0.06);
            env.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
            osc.connect(env);
            env.connect(masterGain);
            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime + start + dur + 0.01);
        });
        // 再生終了後にコンテキストを閉じてメモリ解放
        setTimeout(() => { try { ctx.close(); } catch (_) {} }, 1200);
    } catch (_) { /* AudioContext 非対応環境では無視 */ }
}

/** 軽量 confetti：CSS アニメーションのみで紙吹雪を 2.5 秒再生して自動削除 */
function _launchConfetti(container) {
    const COUNT = 38;
    const COLORS = ['#00ff88', '#00d2ff', '#ff3366', '#ffd700', '#ff69b4', '#a78bfa', '#ffffff'];
    const wrapper = document.createElement('div');
    wrapper.className = 'tm-confetti-wrap';
    wrapper.setAttribute('aria-hidden', 'true');

    for (let i = 0; i < COUNT; i++) {
        const p = document.createElement('span');
        p.className = 'tm-confetti-piece';
        const color = COLORS[i % COLORS.length];
        const left  = (Math.random() * 100).toFixed(1);
        const delay = (Math.random() * 0.8).toFixed(2);
        const dur   = (1.8 + Math.random() * 0.8).toFixed(2);
        const size  = (6 + Math.random() * 6).toFixed(1);
        const rot   = Math.floor(Math.random() * 360);
        p.style.cssText = [
            'left:' + left + '%',
            'background:' + color,
            'animation-delay:' + delay + 's',
            'animation-duration:' + dur + 's',
            'width:' + size + 'px',
            'height:' + (size * (0.4 + Math.random() * 0.4)).toFixed(1) + 'px',
            'transform:rotate(' + rot + 'deg)'
        ].join(';');
        wrapper.appendChild(p);
    }

    container.insertBefore(wrapper, container.firstChild);
    // 2.8秒後に DOM から削除（アニメーション完了後）
    setTimeout(() => { wrapper.remove(); }, 2800);
}

function showTestModeFailureScreen(game, stageId, failedAt, reason) {
    const overlay = document.getElementById('overlay');
    if (!overlay) return;
    document.getElementById('screen-test-mode-failure')?.remove();
    ['screen-home', 'screen-melody', 'screen-chord'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
    });

    const reasonText = reason === 'timeout' ? '時間切れ' : '回答ミス';
    const problemNum = failedAt + 1;

    // failedAt（連続正解数）でフェーズを分岐
    let phaseClass, failTitle, failMsg;
    if (failedAt <= 5) {
        phaseClass = 'tm-fail-phase-0';
        failTitle  = 'まずはここから！';
        failMsg    = '最初の数問で止まるのは、<br>耳がまだこのSTAGEの音に慣れている途中です。<br><br>' +
                     '練習モードで音の動きを確認してから、<br>もう一度挑戦してみましょう。';
    } else if (failedAt <= 10) {
        phaseClass = 'tm-fail-phase-1';
        failTitle  = 'いい感じです！';
        failMsg    = '半分近くまで聴き分けられています。<br><br>' +
                     'あと少し安定すれば、<br>クリアが見えてきます。';
    } else if (failedAt <= 15) {
        phaseClass = 'tm-fail-phase-2';
        failTitle  = 'かなり惜しい！';
        failMsg    = 'ここまで連続で聴き分けられているので、<br>耳はしっかり育っています。<br><br>' +
                     '次は後半の集中力を意識してみましょう。';
    } else {
        phaseClass = 'tm-fail-phase-3';
        failTitle  = '本当にあと少し！';
        failMsg    = 'クリア目前まで来ています。<br><br>' +
                     'ここまで来られたなら、<br>もう突破できる力はあります。';
    }

    const screen = document.createElement('div');
    screen.id = 'screen-test-mode-failure';
    screen.className = 'modal';
    screen.innerHTML = '<div class="test-mode-result-screen test-mode-failure-screen ' + phaseClass + '">' +
        '<p class="test-mode-failure-heading">' + failTitle + '</p>' +
        '<p class="test-mode-result-msg">今回は <strong>' + problemNum + '問目</strong> でストップしました。<br>' +
        failMsg + '</p>' +
        '<div class="test-mode-fail-stats">' +
        '<span>連続正解：' + failedAt + '問</span>' +
        '<span>失敗理由：' + reasonText + '</span>' +
        '</div>' +
        '<div class="test-mode-result-actions">' +
        '<button class="btn-primary tm-fail-retry">もう1回挑戦する</button>' +
        '<button class="btn-secondary tm-fail-practice">練習モードで確認する</button>' +
        '<button class="btn-secondary tm-fail-back">STAGE選択に戻る</button>' +
        '</div></div>';

    overlay.classList.remove('hidden');
    overlay.appendChild(screen);

    screen.querySelector('.tm-fail-retry')?.addEventListener('click', () => {
        screen.remove(); overlay.classList.add('hidden'); game.startGame(stageId);
    });
    screen.querySelector('.tm-fail-practice')?.addEventListener('click', () => {
        screen.remove(); overlay.classList.add('hidden');
        game.startGame(stageId, { _forceNormal: true });
    });
    screen.querySelector('.tm-fail-back')?.addEventListener('click', () => {
        screen.remove(); game.showStageSelector();
    });
}

function showTestModeAbortConfirm(game, onAbort) {
    document.getElementById('test-mode-abort-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'test-mode-abort-modal';
    modal.className = 'test-mode-abort-modal';
    modal.innerHTML = '<div class="test-mode-abort-content">' +
        '<p class="test-mode-abort-title">テストを中断しますか？</p>' +
        '<p class="test-mode-abort-desc">現在のチャレンジは終了します。</p>' +
        '<div class="test-mode-abort-actions">' +
        '<button class="btn-secondary tm-abort-ok">中断する</button>' +
        '<button class="btn-primary tm-abort-cancel">続ける</button>' +
        '</div></div>';
    document.body.appendChild(modal);
    modal.querySelector('.tm-abort-ok').addEventListener('click', () => { modal.remove(); onAbort(); });
    modal.querySelector('.tm-abort-cancel').addEventListener('click', () => { modal.remove(); });
}

function _getNextStageId(game, currentStageId) {
    if (currentStageId >= 1 && currentStageId <= 5) return currentStageId + 1;
    if (currentStageId >= 101 && currentStageId <= 105) return currentStageId + 1;
    if (currentStageId >= STAGING_PRO_MELODY_SLOT_MIN && currentStageId <= STAGING_PRO_MELODY_SLOT_MAX) {
        const ordered = game.getStagingMelodySlotIdsOrdered();
        const idx = ordered.indexOf(currentStageId);
        return idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
    }
    if (currentStageId >= STAGING_PRO_CHORD_SLOT_MIN && currentStageId <= STAGING_PRO_CHORD_SLOT_MAX) {
        const ordered = game.getStagingChordSlotIdsOrdered();
        const idx = ordered.indexOf(currentStageId);
        return idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
    }
    return null;
}

function updateTestModeStageButtons(game) {
    const results = loadTestModeResults();
    const isEnabled = testModeState.enabled;
    for (let i = 1; i <= 6; i++) {
        const btn = document.querySelector('[data-stage="' + i + '"]:not(.custom-stage-btn)');
        if (btn) _applyTestModeButtonStyle(btn, 'melody', 'stage-' + i, results, isEnabled);
    }
    for (let i = 101; i <= 106; i++) {
        const btn = document.querySelector('[data-stage="' + i + '"]:not(.custom-stage-btn)');
        if (btn) _applyTestModeButtonStyle(btn, 'chord', 'stage-' + i, results, isEnabled);
    }
}

function _applyTestModeButtonStyle(btn, category, stageKey, results, isEnabled) {
    // ボタン内の旧バッジは常に除去（後方互換）
    btn.querySelectorAll('.test-mode-clear-badge').forEach(el => el.remove());
    btn.classList.toggle('test-mode-stage', isEnabled);

    const catResults = results[category] || {};
    const stageResult = catResults[stageKey];
    const count = (stageResult && stageResult.clearCount > 0) ? stageResult.clearCount : 0;

    // .stage-row 構造がある場合 → 外側マーク方式
    const row = btn.closest('.stage-row');
    if (row) {
        const mark = row.querySelector('.stage-clear-mark');
        if (count > 0) {
            row.classList.add('cleared');
            if (mark) mark.textContent = '✓' + count;
        } else {
            row.classList.remove('cleared');
            if (mark) mark.textContent = '';
        }
        return;
    }

    // フォールバック：Pro カスタムSTAGEなど .stage-row がない場合
    if (count > 0) {
        const badge = document.createElement('span');
        badge.className = 'test-mode-clear-badge';
        badge.textContent = '✓' + count;
        btn.appendChild(badge);
    }
}

// ===================== テストモード定数・状態 ここまで =====================

function isPitchTrainerPro() {
    return document.documentElement.dataset.appEdition === 'Pro';
}

function isPitchTrainerBeta() {
    return document.documentElement.dataset.appEdition === 'Beta';
}

/** キーランダムの出題・保存は Pro のみ（設定 UI は通常版・ベータとレイアウト共用） */
function isKeyRandomGameplayActive(game) {
    return isPitchTrainerPro() && !!game.keyRandomMode;
}

/** Pro 版: 追加 STAGE スロット機能（保存・複製・名前変更・削除）。
 *  以前は ?stagingPreview=1 時のみ有効だったが、正式に Pro 全体で有効化。 */
function isStagingProSlotsFeature() {
    return typeof location !== 'undefined' && isPitchTrainerPro();
}

/** メロディ Pro（本体 99 または Staging 保存スロット 5001〜） */
function isProMelodyStageId(stage) {
    return stage === 99 || (stage >= STAGING_PRO_MELODY_SLOT_MIN && stage <= STAGING_PRO_MELODY_SLOT_MAX);
}

/** コード Pro（本体 199 または Staging 保存スロット 5101〜） */
function isProChordStageId(stage) {
    return stage === 199 || (stage >= STAGING_PRO_CHORD_SLOT_MIN && stage <= STAGING_PRO_CHORD_SLOT_MAX);
}

/** Pro メロディ 2Oct: 旧データは pool が音名文字列のみ（オクターブは出題時にランダム） */
function isProMelody2OctavePoolLegacy(pool) {
    return Array.isArray(pool) && pool.length > 0 && typeof pool[0] === 'string';
}

/** 2Oct 時の出題プールを { note, octaveOffset } の配列にそろえる */
function expandProMelody2OctavePoolEntries(pool) {
    if (!pool || pool.length === 0) return [];
    if (typeof pool[0] === 'string') {
        return pool.flatMap((note) => [{ note, octaveOffset: 0 }, { note, octaveOffset: 1 }]);
    }
    return pool.map((p) => ({
        note: p.note,
        octaveOffset: p.octaveOffset != null ? p.octaveOffset : 0
    }));
}

/** 鍵盤の1鍵がプールに含まれるか（2Oct・レガシー対応） */
function proMelodyPoolAllowsNoteAtOctave(cfg, note, octaveOffset) {
    const pool = cfg.pool;
    if (!pool || !pool.length) return false;
    if (!cfg.is2Octave) return pool.includes(note);
    if (isProMelody2OctavePoolLegacy(pool)) return pool.includes(note);
    return pool.some((p) => p.note === note && (p.octaveOffset || 0) === octaveOffset);
}

/** stageConfig.pool のコピー（2Oct オブジェクト配列は中身も複製） */
function cloneProMelodyPool(pool) {
    if (!pool || !pool.length) return [];
    if (typeof pool[0] === 'string') return [...pool];
    return pool.map((p) => (typeof p === 'object' && p !== null
        ? { note: p.note, octaveOffset: p.octaveOffset != null ? p.octaveOffset : 0 }
        : p));
}

/** Staging: ブラウザの prompt 代替（127.0.0.1 表示なし）。キャンセル時 null */
function showStagingStageNameModal(options) {
    const opts = options || {};
    return new Promise((resolve) => {
        const modal = document.getElementById('staging-stage-name-modal');
        const input = document.getElementById('staging-stage-name-input');
        const titleEl = document.getElementById('staging-stage-name-title');
        const hintEl = document.getElementById('staging-stage-name-hint');
        if (!modal || !input || !titleEl) {
            const fallback = window.prompt(opts.title || 'STAGEの名前', opts.defaultValue || '');
            resolve(fallback === null ? null : String(fallback));
            return;
        }
        const okBtn = document.getElementById('staging-stage-name-ok');
        const cancelBtn = document.getElementById('staging-stage-name-cancel');
        const backdrop = modal.querySelector('.staging-native-replace-modal__backdrop');
        const finish = (value) => {
            if (okBtn) okBtn.removeEventListener('click', onOk);
            if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
            if (backdrop) backdrop.removeEventListener('click', onCancel);
            input.removeEventListener('keydown', onInputKey);
            document.removeEventListener('keydown', onDocKey);
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
            input.value = '';
            resolve(value);
        };
        const onOk = () => finish(input.value);
        const onCancel = () => finish(null);
        const onInputKey = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onOk();
            }
        };
        const onDocKey = (e) => {
            if (e.key === 'Escape') onCancel();
        };
        titleEl.textContent = opts.title || 'STAGEの名前';
        if (opts.hint) {
            hintEl.textContent = opts.hint;
            hintEl.classList.remove('hidden');
        } else {
            hintEl.textContent = '';
            hintEl.classList.add('hidden');
        }
        input.value = opts.defaultValue || '';
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        if (okBtn) okBtn.addEventListener('click', onOk);
        if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
        if (backdrop) backdrop.addEventListener('click', onCancel);
        input.addEventListener('keydown', onInputKey);
        document.addEventListener('keydown', onDocKey);
        setTimeout(() => {
            input.focus();
            try {
                input.select();
            } catch (e) { /* ignore */ }
        }, 50);
    });
}

/** Staging: ブラウザの confirm 代替（127.0.0.1 表示なし） */
function showStagingDeleteConfirmModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('staging-stage-delete-modal');
        if (!modal) {
            resolve(window.confirm('このSTAGEを削除しますか？'));
            return;
        }
        const okBtn = document.getElementById('staging-stage-delete-ok');
        const cancelBtn = document.getElementById('staging-stage-delete-cancel');
        const backdrop = modal.querySelector('.staging-native-replace-modal__backdrop');
        const finish = (value) => {
            if (okBtn) okBtn.removeEventListener('click', onOk);
            if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
            if (backdrop) backdrop.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onDocKey);
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
            resolve(value);
        };
        const onOk = () => finish(true);
        const onCancel = () => finish(false);
        const onDocKey = (e) => {
            if (e.key === 'Escape') onCancel();
        };
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        if (okBtn) okBtn.addEventListener('click', onOk);
        if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
        if (backdrop) backdrop.addEventListener('click', onCancel);
        document.addEventListener('keydown', onDocKey);
        setTimeout(() => {
            if (cancelBtn) cancelBtn.focus();
        }, 50);
    });
}

/** ルート直下の旧SW（scope が / 全体）が残ると standard/ と Pro 用フォルダが混ざるため解除する */
function unregisterLegacyRootServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => {
            const sw = reg.active || reg.waiting || reg.installing;
            if (!sw) return;
            try {
                const u = new URL(sw.scriptURL);
                const p = u.pathname;
                const pl = p.toLowerCase();
                /* github.io プロジェクトサイト: /Pitch-trainer/pitch-trainer/… = pitch-trainer 配下へ移行後 */
                if (
                    pl.includes('/pitch-trainer/pitch-trainer/') &&
                    (pl.endsWith('/standard/service-worker.js') ||
                        pl.endsWith('/pro_x9v7q2m8/service-worker.js') ||
                        pl.endsWith('/staging/service-worker.js'))
                ) {
                    return;
                }
                /* カスタムドメイン等: /pitch-trainer/standard/…（リポジトリ名がパスに出ない場合） */
                if (
                    (pl.endsWith('/pitch-trainer/standard/service-worker.js') ||
                        pl.endsWith('/pitch-trainer/pro_x9v7q2m8/service-worker.js') ||
                        pl.endsWith('/pitch-trainer/staging/service-worker.js') ||
                        pl.endsWith('/pitch-trainer/beta/service-worker.js')) &&
                    !pl.includes('/pitch-trainer/pitch-trainer/')
                ) {
                    return;
                }
                /* soundcruise.jp 旧構成: /apps/pitch-cruise/… */
                if (
                    pl.endsWith('/apps/pitch-cruise/standard/service-worker.js') ||
                    pl.endsWith('/apps/pitch-cruise/pro_x9v7q2m8/service-worker.js') ||
                    pl.endsWith('/apps/pitch-cruise/staging/service-worker.js') ||
                    pl.endsWith('/apps/pitch-cruise/beta/service-worker.js')
                ) {
                    return;
                }
                /* 旧: ルート /beta/（移行前） */
                if (pl.endsWith('/beta/service-worker.js')) {
                    return;
                }
                if (p.endsWith('/pro_k3m9/service-worker.js')) {
                    void reg.unregister();
                    return;
                }
                if (p.endsWith('/prok3m9/service-worker.js')) {
                    void reg.unregister();
                    return;
                }
                if (p.endsWith('/pro/service-worker.js')) {
                    void reg.unregister();
                    return;
                }
                if (p.endsWith('/service-worker.js')) {
                    void reg.unregister();
                }
            } catch (_) {
                /* ignore */
            }
        });
    });
}

// AudioEngine Class
class AudioEngine {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.baseHz = 440.0;
        this.notes = {};
        this._buildNotes();
        this.currentInstrument = 'acoustic_guitar';
        this.sustainTime = 0.5; // 余韻の長さ（秒）。設定から変更可能。
        this._lastKnownTime = 0;
        this._frozenSince = 0;
        /** @type {AudioScheduledSourceNode[]} 再生中の音をまとめて止めるため */
        this._scheduledSources = [];

        // モバイルブラウザ対策: ユーザー操作でAudioContextを起こすリスナー
        this._setupResumeHandlers();
        this.requestPlaybackAudioSession();
    }

    /**
     * iPhone のマナーモード（サイレントスイッチ）:
     * 対応ブラウザ（iOS 17 以降の Safari 等）では Audio Session を playback にすると、
     * Web Audio が「メディア再生」扱いになり、マナー中でもスピーカーから鳴ることがある。
     * 未対応の Safari / 古い iOS では OS の仕様のまま（マナーで無音になり得る）。
     */
    requestPlaybackAudioSession() {
        try {
            const as = typeof navigator !== 'undefined' && navigator.audioSession;
            if (as) as.type = 'playback';
        } catch (_) { /* ignore */ }
        // Suppress the iOS Now Playing lock-screen widget: signal "not playing" so iOS
        // never surfaces this app's audio session in the lock screen controls.
        // Without this, audioSession.type='playback' causes iOS to show a Now Playing
        // entry (potentially showing metadata from YouTube opened via an in-app browser).
        try {
            if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
                navigator.mediaSession.metadata = null;
                navigator.mediaSession.playbackState = 'none';
            }
        } catch (_) { /* ignore */ }
    }

    _trackScheduledSource(node) {
        if (node && this._scheduledSources) this._scheduledSources.push(node);
    }

    /** 登録済みの発音を即座に止める（画面遷移・別ステージ・次の問題など） */
    stopAllScheduledSounds() {
        if (!this.ctx || this.ctx.state === 'closed') {
            this._scheduledSources = [];
            return;
        }
        const t = this.ctx.currentTime;
        const list = this._scheduledSources;
        this._scheduledSources = [];
        for (let i = 0; i < list.length; i++) {
            const node = list[i];
            try {
                node.stop(t);
            } catch (_) { /* 既に stop 済みなど */ }
            try {
                node.disconnect();
            } catch (_) { /* ignore */ }
        }
    }

    _buildNotes() {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        this.notes = {};
        for (let oct = 2; oct <= 6; oct++) {
            for (let i = 0; i < 12; i++) {
                if (oct === 6 && i > 0) break; // only up to C6
                const noteName = noteNames[i] + oct;
                const midiNote = (oct + 1) * 12 + i;
                this.notes[noteName] = this.baseHz * Math.pow(2, (midiNote - 69) / 12);
            }
        }
    }

    setBaseHz(hz) {
        this.baseHz = parseFloat(hz);
        this._buildNotes();
    }

    _isContextFrozen() {
        if (!this.ctx) return true;
        const t = this.ctx.currentTime;
        if (t !== this._lastKnownTime) {
            this._lastKnownTime = t;
            this._frozenSince = 0;
            return false;
        }
        if (this._frozenSince === 0) {
            this._frozenSince = Date.now();
            return false;
        }
        return Date.now() - this._frozenSince > 300;
    }

    _forceNewContext() {
        try { if (this.ctx) this.ctx.close(); } catch (_) { /* ignore */ }
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this._scheduledSources = [];
        this._lastKnownTime = 0;
        this._frozenSince = 0;
    }

    /** Safari 等の interrupted 状態も suspended と同様に扱う */
    _needsResume(state) {
        return state === 'suspended' || state === 'interrupted';
    }

    async _resumeIfNeeded() {
        if (!this.ctx || this.ctx.state === 'closed') return;
        if (this._needsResume(this.ctx.state)) {
            await this.ctx.resume();
        }
    }

    /** ページ遷移・リロード直前に呼ぶと、固まったコンテキストの残骸を減らせる */
    closeContextForNavigation() {
        try {
            if (this.ctx && this.ctx.state !== 'closed') this.ctx.close();
        } catch (_) { /* ignore */ }
        this._scheduledSources = [];
    }

    ensureContext() {
        this.requestPlaybackAudioSession();
        if (!this.ctx || this.ctx.state === 'closed') {
            this._forceNewContext();
        } else if (this._needsResume(this.ctx.state)) {
            void this.ctx.resume();
        } else if (this._isContextFrozen()) {
            this._forceNewContext();
        }
    }

    async resumeContext() {
        this.requestPlaybackAudioSession();
        try {
            if (!this.ctx || this.ctx.state === 'closed') {
                this._forceNewContext();
            }
            await this._resumeIfNeeded();
            if (this.ctx.state === 'running' && this._isContextFrozen()) {
                this._forceNewContext();
                await this._resumeIfNeeded();
            }
            const t0 = this.ctx.currentTime;
            await new Promise(r => setTimeout(r, 50));
            if (this.ctx.state === 'running' && this.ctx.currentTime === t0) {
                this._forceNewContext();
                await this._resumeIfNeeded();
            }
            await this._resumeIfNeeded();
        } catch (e) {
            console.warn('PitchTrainer: AudioContext resume failed, forcing new context', e);
            this._forceNewContext();
        }
    }

    _setupResumeHandlers() {
        const tryResume = () => {
            void this.resumeContext();
        };

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this._frozenSince = 0;
                tryResume();
                this.requestPlaybackAudioSession();
            } else {
                // Release iOS Now Playing session to prevent lock screen widget from persisting
                // when navigating away (e.g. opening a YouTube link from the info page).
                try {
                    const as = typeof navigator !== 'undefined' && navigator.audioSession;
                    if (as) as.type = 'auto';
                } catch (_) { /* ignore */ }
                try {
                    if ('mediaSession' in navigator) {
                        navigator.mediaSession.metadata = null;
                        navigator.mediaSession.playbackState = 'none';
                    }
                } catch (_) { /* ignore */ }
            }
        });
        window.addEventListener('pagehide', () => {
            // Also release on full page navigation (PWA page transitions).
            try {
                const as = typeof navigator !== 'undefined' && navigator.audioSession;
                if (as) as.type = 'auto';
            } catch (_) { /* ignore */ }
            try {
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.metadata = null;
                    navigator.mediaSession.playbackState = 'none';
                }
            } catch (_) { /* ignore */ }
        });
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) {
                this._lastKnownTime = 0;
                this._frozenSince = 0;
            }
            void this.resumeContext();
        });
        window.addEventListener('focus', tryResume);

        const onPageLifecycleResume = () => {
            this._lastKnownTime = 0;
            this._frozenSince = 0;
            void this.resumeContext();
        };
        document.addEventListener('resume', onPageLifecycleResume);
        window.addEventListener('resume', onPageLifecycleResume);

        const resumeOnInteraction = () => {
            void this.resumeContext();
        };
        document.addEventListener('touchstart', resumeOnInteraction, { passive: true });
        document.addEventListener('touchend', resumeOnInteraction, { passive: true });
        document.addEventListener('pointerdown', resumeOnInteraction, { passive: true });
        document.addEventListener('click', resumeOnInteraction);
    }

    playNote(noteName, duration = 1.0, time = 0, keyOffset = 0) {
        // Delegate to instrument-specific method
        switch (this.currentInstrument) {
            case 'piano': return this.playPiano(noteName, duration, time, keyOffset);
            case 'violin': return this.playViolin(noteName, duration, time, keyOffset);
            case 'electric_guitar': return this.playElectricGuitar(noteName, duration, time, keyOffset);
            case 'acoustic_guitar':
            default: return this.playAcousticGuitar(noteName, duration, time, keyOffset);
        }
    }

    /**
     * Karplus-Strong アコースティックギター音源
     *
     * アルゴリズム概要:
     *   1. ホワイトノイズバーストを励起信号として使用（ピックのひっかかりを再現）
     *   2. ディレイライン + ローパスフィルタのフィードバックループで弦の振動を合成
     *   3. JavaScriptで直接バッファを生成 → AudioBufferSourceNodeで再生（低レイテンシ）
     *
     * @param {string} noteName  - 音名 (例: "A4")
     * @param {number} duration  - 発音時間（秒）
     * @param {number} time      - 再生開始時刻（AudioContext時間）
     * @param {number} keyOffset - 半音単位のキートランスポーズ
     * @param {number} velocity  - 弾く強さ 0.0〜1.0 (省略時 0.7)
     */
    playAcousticGuitar(noteName, duration = 1.0, time = 0, keyOffset = 0, velocity = 0.7) {
        this.ensureContext();

        const frequency = this.notes[noteName];
        if (!frequency) return;

        // ── 1. 周波数の決定 ──────────────────────────────────────────
        // キートランスポーズ + わずかなデチューン（±0.15%）で機械的な正確さを排除
        const detuneRatio = 1 + (Math.random() - 0.5) * 0.003;
        const freq = frequency * Math.pow(2, keyOffset / 12) * detuneRatio;

        // ── 2. Karplus-Strong バッファ生成 ───────────────────────────
        const sampleRate = this.ctx.sampleRate;

        // バッファ長 = duration（発音期間）+ sustainTime（余韻）
        // duration はシーケンス再生のタイミング制御に必要なので含める
        const sustainSamples = Math.ceil(sampleRate * this.sustainTime);
        const totalSamples = Math.ceil(sampleRate * (duration + this.sustainTime));

        // ディレイライン長 = サンプルレート / 周波数（1周期分）
        const delayLength = Math.max(2, Math.round(sampleRate / freq));

        // 出力バッファ（モノラル）
        const output = new Float32Array(totalSamples);

        // ── 2a. 励起信号: ホワイトノイズバースト ──────────────────────
        const excitationAmplitude = 0.5 + velocity * 0.5;
        const delayLine = new Float32Array(delayLength);
        for (let i = 0; i < delayLength; i++) {
            delayLine[i] = (Math.random() * 2 - 1) * excitationAmplitude;
        }

        // ── 2b. ローパスフィルタ係数 ──────────────────────────────────
        const filterCoeff = 0.40 + velocity * 0.20;

        // ── 2c. 弦の減衰係数（sustainSamples で正確に逆算） ─────────────
        // 目標: sustainTime 秒分のサンプル後に振幅が -60dB（1/1000）になる
        //   decayFactor ^ sustainSamples = 0.001
        //   → decayFactor = 0.001 ^ (1 / sustainSamples)
        // ※ バッファ全体（duration+sustainTime）ではなく sustainTime 分で計算
        //   することで、スライダーの値が実際の余韻の長さと一致する
        // 周波数補正: 高音ほど最大5%速く減衰（自然な弦の特性）
        const freqDecayCorrection = 1.0 - (freq / 8000) * 0.05;
        const decayFactor = Math.pow(0.001, 1 / sustainSamples) * freqDecayCorrection;

        // ── 2d. フィードバックループ ──────────────────────────────────
        let writePos = 0;
        let prevSample = 0;

        for (let n = 0; n < totalSamples; n++) {
            const currentSample = delayLine[writePos];
            const filtered = filterCoeff * currentSample + (1 - filterCoeff) * prevSample;
            prevSample = currentSample;
            delayLine[writePos] = filtered * decayFactor;
            output[n] = currentSample;
            writePos = (writePos + 1) % delayLength;
        }

        // ピックアタック（ごく短いノイズ）で弾き始めを自然に
        const pickSamples = Math.min(Math.ceil(sampleRate * 0.006), totalSamples);
        for (let n = 0; n < pickSamples; n++) {
            const env = Math.exp(-n / Math.max(1, sampleRate * 0.0018));
            output[n] += (Math.random() * 2 - 1) * (0.055 + velocity * 0.06) * env;
        }

        // ── 2e. 末尾フェードアウト（ブツ切れ防止） ───────────────────
        const fadeStartSample = Math.floor(totalSamples * 0.80);
        for (let n = fadeStartSample; n < totalSamples; n++) {
            const t = (n - fadeStartSample) / (totalSamples - fadeStartSample);
            output[n] *= 0.5 * (1 + Math.cos(Math.PI * t));
        }

        // ── 3. AudioBuffer に変換 ────────────────────────────────────
        const audioBuffer = this.ctx.createBuffer(1, totalSamples, sampleRate);
        audioBuffer.copyToChannel(output, 0);

        const source = this.ctx.createBufferSource();
        source.buffer = audioBuffer;
        this._trackScheduledSource(source);

        // ── 4. ボディ共鳴フィルタ（箱鳴りのシミュレーション） ─────────
        // ギターボディの低域共鳴（80〜200Hz付近）を再現

        // 低域共鳴 1: ~100Hz（ボディの主共鳴）
        const bodyRes1 = this.ctx.createBiquadFilter();
        bodyRes1.type = 'peaking';
        bodyRes1.frequency.value = 100;
        bodyRes1.Q.value = 1.5;
        bodyRes1.gain.value = 4; // +4dB

        // 低域共鳴 2: ~180Hz（ヘルムホルツ共鳴 / サウンドホール）
        const bodyRes2 = this.ctx.createBiquadFilter();
        bodyRes2.type = 'peaking';
        bodyRes2.frequency.value = 180;
        bodyRes2.Q.value = 2.0;
        bodyRes2.gain.value = 3; // +3dB

        // 低域 3: ~240Hz（胴の厚み）
        const bodyRes3 = this.ctx.createBiquadFilter();
        bodyRes3.type = 'peaking';
        bodyRes3.frequency.value = 240;
        bodyRes3.Q.value = 1.2;
        bodyRes3.gain.value = 1.8;

        // 中域プレゼンス（弦の倍音を引き立てる ~2kHz）
        const presence = this.ctx.createBiquadFilter();
        presence.type = 'peaking';
        presence.frequency.value = 2000;
        presence.Q.value = 1.0;
        presence.gain.value = 2; // +2dB

        // 高域ロールオフ（ギターらしい丸みを出す）
        const highCut = this.ctx.createBiquadFilter();
        highCut.type = 'lowpass';
        highCut.frequency.value = 6000;
        highCut.Q.value = 0.7;

        // ── 5. 出力ゲイン ─────────────────────────────────────────────
        const outputGain = this.ctx.createGain();
        outputGain.gain.value = 0.25 + velocity * 0.35; // velocity: 0→0.25, 1→0.60

        // ── 6. ノード接続 ─────────────────────────────────────────────
        // source → bodyRes1 → bodyRes2 → bodyRes3 → presence → highCut → outputGain → destination
        source.connect(bodyRes1);
        bodyRes1.connect(bodyRes2);
        bodyRes2.connect(bodyRes3);
        bodyRes3.connect(presence);
        presence.connect(highCut);
        highCut.connect(outputGain);
        outputGain.connect(this.ctx.destination);

        // ── 7. 再生 ───────────────────────────────────────────────────
        const startTime = time || this.ctx.currentTime;
        source.start(startTime);
        source.stop(startTime + duration + this.sustainTime);
    }

    playChord(chordName, octave = 3, duration = 1.0, time = 0, keyOffset = 0, voicing = null) {
        this.ensureContext();

        const chordIntervals = {
            'C': ['C', 'E', 'G'],
            'F': ['F', 'A', 'C'],
            'G': ['G', 'B', 'D'],
            'Am': ['A', 'C', 'E'],
            'Dm': ['D', 'F', 'A'],
            'Em': ['E', 'G', 'B']
        };

        const intervals = chordIntervals[chordName];
        if (!intervals) return;

        // voicing: array of indices to play (e.g. [0, 1] for Root+3rd)
        // if null/undefined, play all notes
        const notesToPlay = voicing
            ? voicing.map(i => intervals[i]).filter(n => n !== undefined)
            : intervals;

        notesToPlay.forEach(note => {
            let noteOctave = octave;
            // Handle notes that wrap to next octave
            // Logic: if note is lower than root in sequence (C-B), bump octave? 
            // Simplified logic based on previous implementation:
            if (chordName === 'F' && note === 'C') noteOctave++;
            if (chordName === 'G' && note === 'D') noteOctave++;
            if (chordName === 'Am' && note === 'C') noteOctave++;
            if (chordName === 'Am' && note === 'E') noteOctave++;
            if (chordName === 'Dm' && note === 'D') { /* No octave bump needed for root pos */ }
            if (chordName === 'Em' && note === 'E') { /* No octave bump needed for root pos */ }
            this.playNote(note + noteOctave, duration, time, keyOffset);
        });
    }

    playCustomChord(chordObj, octave = 3, duration = 1.0, time = 0, keyOffset = 0) {
        if (!chordObj) return;
        this.ensureContext();

        const rootNoteIndex = parseInt(chordObj.root);
        const intervals = [0]; // Root is always 0 relative to itself

        if (chordObj.third !== 'null') intervals.push(parseInt(chordObj.third));
        if (chordObj.fifth !== 'null') intervals.push(parseInt(chordObj.fifth));
        if (chordObj.seventh !== 'null') intervals.push(parseInt(chordObj.seventh));

        if (chordObj.tensions) {
            chordObj.tensions.forEach(t => intervals.push(parseInt(t)));
        }

        // Sort intervals by pitch
        intervals.sort((a, b) => a - b);

        // Apply inversions by shifting the lowest note up an octave (12 semitones)
        const inversion = parseInt(chordObj.inversion || 0);
        for (let i = 0; i < inversion; i++) {
            if (intervals.length > 0) {
                const lowest = intervals.shift();
                intervals.push(lowest + 12);
            }
        }
        intervals.sort((a, b) => a - b); // Re-sort after inversion

        const notesScale = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        // Play each note
        intervals.forEach(interval => {
            const totalSemitones = rootNoteIndex + interval;
            const extraOctaves = Math.floor(totalSemitones / 12);

            let noteIndex = totalSemitones % 12;
            if (noteIndex < 0) noteIndex += 12; // Handle negative if necessary

            const noteName = notesScale[noteIndex];
            const noteOctave = octave + extraOctaves;

            this.playNote(noteName + noteOctave, duration, time, keyOffset);
        });
    }

    playPiano(noteName, duration = 1.0, time = 0, keyOffset = 0) {
        this.ensureContext();

        const frequency = this.notes[noteName];
        if (!frequency) return;

        const f0 = frequency * Math.pow(2, keyOffset / 12);
        const now = time || this.ctx.currentTime;
        const end = now + duration + this.sustainTime;

        const master = this.ctx.createGain();
        master.gain.value = 0.64;
        const tone = this.ctx.createBiquadFilter();
        tone.type = 'lowpass';
        tone.Q.value = 0.65;
        master.connect(tone);
        tone.connect(this.ctx.destination);

        const envPartial = (freqHz, peak, quickLevel, sustainLevel) => {
            const osc = this.ctx.createOscillator();
            this._trackScheduledSource(osc);
            osc.type = 'sine';
            osc.frequency.value = freqHz;
            const g = this.ctx.createGain();
            osc.connect(g);
            g.connect(master);
            g.gain.setValueAtTime(0, now);
            g.gain.linearRampToValueAtTime(peak, now + 0.0025);
            g.gain.exponentialRampToValueAtTime(Math.max(quickLevel, 0.0001), now + 0.042);
            g.gain.exponentialRampToValueAtTime(Math.max(sustainLevel, 0.0001), now + duration * 0.52);
            g.gain.exponentialRampToValueAtTime(0.0001, end);
            osc.start(now);
            osc.stop(end);
        };

        // 基音をわずかにずらした2本（複弦のうねり）
        const det = Math.pow(2, 0.85 / 1200);
        envPartial(f0, 0.24, 0.33, 0.085);
        envPartial(f0 * det, 0.24, 0.33, 0.085);

        // 高次倍音ほどアタックで強く、すぐ減る
        const highs = [
            { n: 2, peak: 0.25, quick: 0.12, tail: 0.052 },
            { n: 3, peak: 0.14, quick: 0.053, tail: 0.026 },
            { n: 4, peak: 0.066, quick: 0.023, tail: 0.013 },
            { n: 5, peak: 0.033, quick: 0.009, tail: 0.0065 },
            { n: 6, peak: 0.017, quick: 0.004, tail: 0.0032 }
        ];
        highs.forEach(p => envPartial(f0 * p.n, p.peak, p.quick, p.tail));

        tone.frequency.setValueAtTime(Math.min(11000, f0 * 13), now);
        tone.frequency.exponentialRampToValueAtTime(Math.min(7200, f0 * 8.5), now + 0.038);
        tone.frequency.exponentialRampToValueAtTime(Math.max(2000, f0 * 3.6), now + duration * 0.42);
    }

    playViolin(noteName, duration = 1.0, time = 0, keyOffset = 0) {
        this.ensureContext();

        const frequency = this.notes[noteName];
        if (!frequency) return;

        const f0 = frequency * Math.pow(2, keyOffset / 12);
        const now = time || this.ctx.currentTime;
        const end = now + duration + this.sustainTime;

        const master = this.ctx.createGain();
        master.gain.value = 0.62;
        master.connect(this.ctx.destination);

        const osc = this.ctx.createOscillator();
        this._trackScheduledSource(osc);
        const oscLo = this.ctx.createOscillator();
        this._trackScheduledSource(oscLo);
        const filter = this.ctx.createBiquadFilter();
        const body = this.ctx.createBiquadFilter();
        const gainNode = this.ctx.createGain();
        const vibrato = this.ctx.createOscillator();
        this._trackScheduledSource(vibrato);
        const vibratoGain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.value = f0;
        oscLo.type = 'triangle';
        oscLo.frequency.value = f0 * 0.5;
        const loG = this.ctx.createGain();
        loG.gain.value = 0.32;
        oscLo.connect(loG);
        loG.connect(filter);

        vibrato.frequency.value = 5.2;
        vibratoGain.gain.setValueAtTime(0, now);
        vibratoGain.gain.linearRampToValueAtTime(f0 * 0.0055, now + 0.09);
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);

        filter.type = 'bandpass';
        filter.Q.value = 2.4;
        filter.frequency.setValueAtTime(Math.max(550, f0 * 1.1), now);
        filter.frequency.exponentialRampToValueAtTime(Math.min(3200, f0 * 5.5), now + 0.11);
        filter.frequency.exponentialRampToValueAtTime(Math.min(2400, f0 * 4.2), now + duration * 0.65);

        body.type = 'peaking';
        body.frequency.value = 280;
        body.Q.value = 0.9;
        body.gain.value = 2.5;

        osc.connect(filter);
        filter.connect(body);
        body.connect(gainNode);
        gainNode.connect(master);

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.4, now + 0.055);
        gainNode.gain.setValueAtTime(0.37, now + duration);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, end);

        vibrato.start(now);
        oscLo.start(now);
        osc.start(now);
        vibrato.stop(end);
        oscLo.stop(end);
        osc.stop(end);
    }

    playElectricGuitar(noteName, duration = 1.0, time = 0, keyOffset = 0) {
        this.ensureContext();

        const frequency = this.notes[noteName];
        if (!frequency) return;

        const f0 = frequency * Math.pow(2, keyOffset / 12);
        const now = time || this.ctx.currentTime;
        const end = now + duration + this.sustainTime;

        const mix = this.ctx.createGain();
        mix.gain.value = 0.34;

        const oscSaw = this.ctx.createOscillator();
        this._trackScheduledSource(oscSaw);
        const oscSq = this.ctx.createOscillator();
        this._trackScheduledSource(oscSq);
        oscSaw.type = 'sawtooth';
        oscSq.type = 'square';
        oscSaw.frequency.value = f0;
        oscSq.frequency.value = f0;
        const gSaw = this.ctx.createGain();
        const gSq = this.ctx.createGain();
        gSaw.gain.value = 0.62;
        gSq.gain.value = 0.28;
        oscSaw.connect(gSaw);
        oscSq.connect(gSq);
        gSaw.connect(mix);
        gSq.connect(mix);

        const distortion = this.ctx.createWaveShaper();
        const curve = new Float32Array(512);
        for (let i = 0; i < 512; i++) {
            const x = (i - 256) / 256;
            curve[i] = Math.tanh(x * 2.35) * 0.92 + Math.sign(x) * 0.04 * (1 - Math.exp(-Math.abs(x) * 4));
        }
        distortion.curve = curve;
        distortion.oversample = '2x';

        const pre = this.ctx.createBiquadFilter();
        pre.type = 'peaking';
        pre.frequency.value = 420;
        pre.Q.value = 0.85;
        pre.gain.value = -5;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 0.85;
        filter.frequency.setValueAtTime(7200, now);
        filter.frequency.exponentialRampToValueAtTime(2400, now + 0.08);
        filter.frequency.exponentialRampToValueAtTime(1500, now + duration * 0.5);

        const air = this.ctx.createBiquadFilter();
        air.type = 'highshelf';
        air.frequency.value = 2800;
        air.gain.value = -2.5;

        const gainNode = this.ctx.createGain();

        mix.connect(distortion);
        distortion.connect(pre);
        pre.connect(filter);
        filter.connect(air);
        air.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.26, now + 0.004);
        gainNode.gain.setValueAtTime(0.24, now + duration);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, end);

        oscSaw.start(now);
        oscSq.start(now);
        oscSaw.stop(end);
        oscSq.stop(end);
    }
}


// Game Class
class Game {
    constructor() {
        this.audio = new AudioEngine();
        this.currentSequence = [];
        this.previousSequenceKeys = []; // Track last 2 questions to prevent 3 consecutive duplicates
        this.inputIndex = 0;
        this.stage = 1;
        this.baseHz = 440; // Default reference frequency
        this.baseOctave = 3; // Default to octave 3
        this.keyOffset = 0; // Semitones from C (0=C, 1=C#, 2=D, etc.)
        this.instrument = 'acoustic_guitar'; // Default instrument
        this.score = 0;
        this.streak = 0;
        this.isPlaying = false;
        this.isBlockingInput = false;
        this.isRoundOver = false;
        this.scaleEnabled = true; // 問題前の音階再生フラグ
        /** 各ラウンドでキーをランダム（0〜11）。音階ONならド〜、OFFなら主音のみ */
        this.keyRandomMode = false;
        /** キーランダムONにする直前の「問題前の音階」（OFFに戻したときに復元） */
        this._scaleEnabledBeforeKeyRandom = undefined;
        /** 現在のラウンドで再生・正解判定に使うキー（キーランダム時は毎ラウンド更新） */
        this.roundKeyOffset = 0;
        this.noteSpeed = 1.0;    // 問題の再生スピード（0.5～2.0）
        this.lastCategory = 'screen-melody'; // 最後に選んだカテゴリ画面
        /** Staging: STAGE選択から保存スロットの Pro 設定を開いたときの「決定」先（null = 従来どおり） */
        this._proMelodyModalTargetStageId = null;
        /** Staging: コード Pro モーダルの「決定」先（null = 199） */
        this._proChordModalTargetStageId = null;
        /** Staging: コード Pro モーダルを開く前の customChords の isActive スナップショット（キャンセルで復元） */
        this._proChordUiSnapshot = null;
        /** Staging: カスタムSTAGEの表示順（スロット ID の配列・上から下） */
        this._stagingMelodySlotOrder = [];
        /** Staging: コードカスタムSTAGEの表示順 */
        this._stagingChordSlotOrder = [];
        /** Pro: メロディ STAGE 選択で「順番並び替え」モード中 */
        this._stagingMelodyReorderMode = false;
        /** Pro: コード STAGE 選択で「順番並び替え」モード中 */
        this._stagingChordReorderMode = false;
        this.infoIntroStorageKey = 'pitchCruiseInfoIntroSeen:1.15.8-r1';
        this.infoNewBadgeStorageKey = 'pitchCruiseInfoNewSeen';
        if (typeof document !== 'undefined') {
            document.documentElement.classList.remove('staging-slot-drag-scroll-lock');
        }
        this.isAnswerMode = true; // 回答モード (true: 回答する, false: 音確認のみ)
        /** 通常版で Pro STAGE の「決定」後、出題せず案内だけ出すモード */
        this.standardProPreviewMode = false;
        this.notationStyle = 'doremi'; // Added notation preference
        // Dictionary for Note naming
        this.doremiMap = {
            'C': 'ド', 'C#': 'ド#', 'D': 'レ', 'D#': 'レ#',
            'E': 'ミ', 'F': 'ファ', 'F#': 'ファ#', 'G': 'ソ',
            'G#': 'ソ#', 'A': 'ラ', 'A#': 'ラ#', 'B': 'シ'
        };
        this.chordDegreeMap = {
            'C': 'Ⅰ', 'Dm': 'Ⅱm', 'Em': 'Ⅲm', 'F': 'Ⅳ', 'G': 'Ⅴ', 'Am': 'Ⅵm'
        };
        this.chordPatternMode = 'progression'; // 'random' または 'progression'
        this.proQuestionMode = 'chords'; // 'chords' or 'progressions'
        /** Proメロディ: 変化音を ♯ / ♭ どちらで見せるか（内部キーは常に C# 形式） */
        this.proAccidentalDisplay = 'sharp';
        this.proSharpToFlatLetter = { 'C#': 'D♭', 'D#': 'E♭', 'F#': 'G♭', 'G#': 'A♭', 'A#': 'B♭' };
        this.proSolfegeFlatBySharpNote = { 'C#': 'レ♭', 'D#': 'ミ♭', 'F#': 'ソ♭', 'G#': 'ラ♭', 'A#': 'シ♭' };
        this.loadProMelodyAccidentalPref();
        this.customChords = []; // User-defined Pro chords
        /** コードを作る: コード名を手で触ったら、ルートなど変更時に自動名で上書きしない */
        this.chordEditorNameUserEdited = false;
        this.customProgressions = []; // User-defined Pro progressions
        this.naturalNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

        this.naturalNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        this.noteToSolfege = {
            'C': 'ド', 'C#': 'ド#', 'D': 'レ', 'D#': 'レ#', 'E': 'ミ', 'F': 'ファ',
            'F#': 'ファ#', 'G': 'ソ', 'G#': 'ソ#', 'A': 'ラ', 'A#': 'ラ#', 'B': 'シ'
        };

        // ステージ設定テーブル
        this.stageConfig = {
            1: { pool: ['C', 'E', 'G'], count: 1, label: 'Stage 1', description: 'ドミソ' },
            2: { pool: ['C', 'E', 'G', 'B'], count: 1, label: 'Stage 2', description: 'ドミソシ' },
            3: { pool: ['C', 'E', 'F', 'G', 'B'], count: 1, label: 'Stage 3', description: 'ドミファソシ' },
            4: { pool: this.naturalNotes, count: 1, label: 'Stage 4', description: '1音 (全７音)' },
            5: { pool: this.naturalNotes, count: 2, label: 'Stage 5', description: '2音 (全７音)' },
            6: { pool: this.naturalNotes, count: 4, label: 'Stage 6', description: '4音 (全７音)' },
            // Chord Stages
            101: { pool: ['C', 'F', 'G'], count: 4, isChord: true, chordVoicing: [0, 2], label: 'Stage 1', description: 'C, F, G (2和音)' },
            102: { pool: ['C', 'F', 'G'], count: 4, isChord: true, chordVoicing: [0, 1, 2], label: 'Stage 2', description: 'C, F, G (3和音)' },
            103: { pool: ['C', 'F', 'G', 'Am'], count: 4, isChord: true, chordVoicing: [0, 2], label: 'Stage 3', description: 'C, F, G, Am (2和音)' },
            104: { pool: ['C', 'F', 'G', 'Am'], count: 4, isChord: true, chordVoicing: [0, 1, 2], label: 'Stage 4', description: 'C, F, G, Am (3和音)' },
            105: { pool: ['C', 'F', 'G', 'Am', 'Dm', 'Em'], count: 4, isChord: true, chordVoicing: [0, 2], label: 'Stage 5', description: 'C, F, G, Am, Dm, Em (2和音)' },
            106: { pool: ['C', 'F', 'G', 'Am', 'Dm', 'Em'], count: 4, isChord: true, chordVoicing: [0, 1, 2], label: 'Stage 6', description: 'C, F, G, Am, Dm, Em (3和音)' },
            // Pro Stage (ID 99) - Default settings, overwritten by UI
            99: { pool: this.naturalNotes, count: 4, label: 'Pro Stage', description: 'カスタム設定' },
            // Chord Pro Stage (ID 199)
            199: { pool: ['C', 'F', 'G', 'Am', 'Dm', 'Em'], count: 4, isChord: true, chordVoicing: [0, 1, 2], label: 'Pro Stage', description: 'カスタム設定' }
        };

        // DOM Elements
        this.overlay = document.getElementById('overlay');
        this.settingsModal = document.getElementById('settings-modal');
        this.overlay = document.getElementById('overlay');
        this.settingsModal = document.getElementById('settings-modal');
        this.comboEl = document.getElementById('combo');
        // this.scoreEl = document.getElementById('score'); // Deprecated
        // this.streakEl = document.getElementById('streak'); // Deprecated
        this.feedbackEl = document.getElementById('feedback');
        this.noteButtonsContainer = document.querySelector('.note-buttons');
        this.chordButtonsContainer = document.querySelector('.chord-buttons');
        this.noteBtns = document.querySelectorAll('.note-btn');
        this.chordBtns = document.querySelectorAll('.chord-btn');

        // Settings elements
        this.currentOctaveEl = document.getElementById('current-octave');
        this.keySelector = document.getElementById('key-selector');
        this.instrumentSelector = document.getElementById('instrument-selector');
        this.notationSelector = document.getElementById('notation-selector');
        this.proChordSettingsModal = document.getElementById('pro-settings-modal-chord');

        this.loadCustomData(); // Initialize with localStorage or defaults
        this.loadSettings();   // Initialize general settings from localStorage
        this.loadStagingProMelodySlots();
        this.loadStagingProChordSlots();

        // Event Listeners
        document.querySelectorAll('[data-stage]:not(.custom-stage-btn)').forEach(btn => {
            btn.addEventListener('click', (e) => this.startGame(parseInt(e.currentTarget.dataset.stage)));
        });

        if (document.getElementById('stage-select-btn')) document.getElementById('stage-select-btn').addEventListener('click', () => this.showStageSelector());
        if (document.getElementById('top-btn')) document.getElementById('top-btn').addEventListener('click', () => this.showHomeScreen());
        if (document.getElementById('replay-btn')) document.getElementById('replay-btn').addEventListener('click', () => this.replaySequence());
        if (document.getElementById('tonic-btn')) document.getElementById('tonic-btn').addEventListener('click', () => this.playTonic());
        if (document.getElementById('scale-btn')) document.getElementById('scale-btn').addEventListener('click', () => this.playScaleManual());

        // Settings button（ゲーム中ヘッダー）
        if (document.getElementById('settings-btn')) document.getElementById('settings-btn').addEventListener('click', () => this.openSettingsModal());

        // Settings button（トップページ）
        if (document.getElementById('home-settings-btn')) document.getElementById('home-settings-btn').addEventListener('click', () => this.openSettingsModal());

        // Settings button（メロディ選択画面）
        if (document.getElementById('melody-settings-btn')) document.getElementById('melody-settings-btn').addEventListener('click', () => this.openSettingsModal());

        // Settings button（コード選択画面）
        if (document.getElementById('chord-settings-btn')) document.getElementById('chord-settings-btn').addEventListener('click', () => this.openSettingsModal());

        // カテゴリカード → ステージ選択画面
        const showScreen = (screenId) => {
            ['screen-home', 'screen-melody', 'screen-chord'].forEach(id => {
                if (document.getElementById(id)) document.getElementById(id).classList.add('hidden');
            });
            if (document.getElementById(screenId)) document.getElementById(screenId).classList.remove('hidden');
        };

        if (document.getElementById('btn-category-melody')) document.getElementById('btn-category-melody').addEventListener('click', () => {
            this.lastCategory = 'screen-melody';
            showScreen('screen-melody');
            if (isStagingProSlotsFeature()) this.renderStagingMelodySlotButtons();
        });
        if (document.getElementById('btn-category-chord')) document.getElementById('btn-category-chord').addEventListener('click', () => {
            this.lastCategory = 'screen-chord';
            showScreen('screen-chord');
        });
        // 戻るボタン → ホーム画面
        if (document.getElementById('btn-back-melody')) document.getElementById('btn-back-melody').addEventListener('click', () => showScreen('screen-home'));
        if (document.getElementById('btn-back-chord')) document.getElementById('btn-back-chord').addEventListener('click', () => showScreen('screen-home'));

        this.homeInfoIntroEl = document.getElementById('home-info-intro');
        this.homeInfoLinkEl = document.querySelector('#screen-home .home-info-link--final');
        this.homeInfoNewBadgeEl = document.getElementById('home-info-new-badge');
        if (this.homeInfoLinkEl) {
            this.homeInfoLinkEl.addEventListener('click', () => {
                this.dismissInfoIntro();
                this.dismissInfoNewBadge();
            });
        }
        if (this.homeInfoIntroEl) {
            this.homeInfoIntroEl.addEventListener('click', () => this.dismissInfoIntro());
        }

        if (document.getElementById('confirm-settings')) {
            document.getElementById('confirm-settings').addEventListener('click', () => this.hideSettingsModal());
        }
        if (document.getElementById('cancel-settings')) {
            document.getElementById('cancel-settings').addEventListener('click', () => {
                if (this._settingsModalSnapshot) {
                    this.applySettingsModalData(this._settingsModalSnapshot);
                }
                this.hideSettingsModal();
            });
        }

        // テストモード ON/OFF トグル
        const testModeToggle = document.getElementById('test-mode-toggle');
        if (testModeToggle) {
            testModeToggle.addEventListener('change', (e) => {
                testModeState.enabled = e.target.checked;
                document.body.classList.toggle('test-mode-enabled', testModeState.enabled);
                try { localStorage.setItem(TEST_MODE_ENABLED_KEY, String(testModeState.enabled)); } catch (_) {}
                updateTestModeStageButtons(this);
            });
        }

        // Octave controls
        if (isPitchTrainerPro()) {
            if (document.getElementById('octave-down')) {
                document.getElementById('octave-down').addEventListener('click', () => this.updateOctave(-1));
            }
            if (document.getElementById('octave-up')) {
                document.getElementById('octave-up').addEventListener('click', () => this.updateOctave(1));
            }
            if (this.keySelector) {
                this.keySelector.addEventListener('change', (e) => this.updateKey(parseInt(e.target.value, 10)));
            }
        }

        // Instrument selector
        if (this.instrumentSelector) {
            this.instrumentSelector.addEventListener('change', (e) => this.updateInstrument(e.target.value));
        }

        // Language selector

        // Reset button
        if (document.getElementById('reset-settings')) document.getElementById('reset-settings').addEventListener('click', () => this.resetToDefaults());

        // 基準周波数・余韻・問題スピードは Pro 版のみ操作可能
        const hzSlider = document.getElementById('hz-slider');
        const hzDisplay = document.getElementById('current-hz') || document.getElementById('hz-value');
        if (hzSlider && isPitchTrainerPro()) {
            hzSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.audio.setBaseHz(val);
                if (hzDisplay) hzDisplay.textContent = val;
                this.saveSettings();
            });
        }

        const sustainSlider = document.getElementById('sustain-slider');
        const sustainValue = document.getElementById('sustain-value');
        if (sustainSlider && isPitchTrainerPro()) {
            sustainSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.audio.sustainTime = val;
                if (sustainValue) sustainValue.textContent = val.toFixed(1);
                this.saveSettings();
            });
        }

        // 音を確認ボタン
        if (document.getElementById('preview-sound')) document.getElementById('preview-sound').addEventListener('click', () => this.previewSound());

        // 音名表記変更リスナー
        if (this.notationSelector) {
            this.notationSelector.addEventListener('change', (e) => {
                this.updateNotation(e.target.value);
            });
        }

        // 音階ON/OFFトグル
        if (document.getElementById('scale-toggle')) document.getElementById('scale-toggle').addEventListener('change', (e) => {
            this.scaleEnabled = e.target.checked;
            this.saveSettings();
        });

        const keyRandomToggle = document.getElementById('key-random-toggle');
        if (keyRandomToggle) {
            keyRandomToggle.addEventListener('change', (e) => {
                if (!isPitchTrainerPro()) {
                    e.target.checked = false;
                    return;
                }
                const on = e.target.checked;
                const scaleToggle = document.getElementById('scale-toggle');
                if (on) {
                    this._scaleEnabledBeforeKeyRandom = this.scaleEnabled;
                    this.scaleEnabled = true;
                    if (scaleToggle) scaleToggle.checked = true;
                } else if (this._scaleEnabledBeforeKeyRandom !== undefined) {
                    this.scaleEnabled = this._scaleEnabledBeforeKeyRandom;
                    if (scaleToggle) scaleToggle.checked = this.scaleEnabled;
                    this._scaleEnabledBeforeKeyRandom = undefined;
                }
                this.keyRandomMode = on;
                this.updateKeyRandomDependentUi();
                this.saveSettings();
            });
        }

        const speedSlider = document.getElementById('speed-slider');
        const speedValue = document.getElementById('speed-value');
        if (speedSlider && isPitchTrainerPro()) {
            speedSlider.addEventListener('input', (e) => {
                const val = this.getNoteSpeedFromSliderValue(e.target.value);
                this.noteSpeed = val;
                e.target.value = this.getSliderValueFromNoteSpeed(val).toFixed(1);
                if (speedValue) speedValue.textContent = val.toFixed(1);
                this.saveSettings();
            });
        }

        // 回答モード切替（トグルスイッチ）
        const answerToggle = document.getElementById('answer-mode-toggle');
        if (answerToggle) answerToggle.addEventListener('change', (e) => {
            this.toggleAnswerMode(e.target.checked);
            this.saveSettings();
        });

        this.chordBtns.forEach(btn => {
            btn.addEventListener('mousedown', (e) => this.handleInput(e.target.dataset.chord));
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handleInput(e.target.dataset.chord);
            });
        });

        // --- Pro Stage Logic ---
        this.proSettingsModal = document.getElementById('screen-pro-settings');

        if (this.proSettingsModal) {
            this.proSettingsModal.addEventListener('change', (ev) => {
                const t = ev.target;
                if (t && t.id === 'pro-keyboard-layout-toggle') {
                    this.updateProNoteTogglesKeyboardLayoutClass();
                    return;
                }
                if (!t || t.id !== 'pro-2octave-toggle') return;
                if (t.checked) {
                    this.proSettingsModal.querySelectorAll('.note-toggle[data-octave-offset="0"]').forEach((t0) => {
                        const t1 = this.proSettingsModal.querySelector(
                            '.note-toggle[data-note="' + t0.dataset.note + '"][data-octave-offset="1"]'
                        );
                        if (t1) t1.checked = t0.checked;
                    });
                }
                this.updateProMelody2OctaveToggleLayers();
            });
        }

        if (document.getElementById('btn-level-pro')) document.getElementById('btn-level-pro').addEventListener('click', () => {
            if (this.proSettingsModal) {
                this._proMelodyModalTargetStageId = null;
                this.syncProAccidentalToggleUi();
                this.updateProMelody2OctaveToggleLayers();
                this.updateProNoteTogglesKeyboardLayoutClass();
                this.refreshProNoteToggleLabels();
                this.proSettingsModal.classList.remove('hidden');
            }
        });

        // Cancel Pro Settings
        if (document.getElementById('btn-cancel-pro')) document.getElementById('btn-cancel-pro').addEventListener('click', () => {
            this._proMelodyModalTargetStageId = null;
            if (this.proSettingsModal) this.proSettingsModal.classList.add('hidden');
        });
        if (document.getElementById('btn-back-pro-melody')) document.getElementById('btn-back-pro-melody').addEventListener('click', () => {
            this._proMelodyModalTargetStageId = null;
            if (this.proSettingsModal) this.proSettingsModal.classList.add('hidden');
        });

        if (document.getElementById('btn-start-pro')) {
            document.getElementById('btn-start-pro').addEventListener('click', () => this.confirmProMelodySettings());
        }
        if (document.getElementById('btn-reset-pro-melody')) {
            document.getElementById('btn-reset-pro-melody').addEventListener('click', () => this.resetProMelodySettingsToDefaults());
        }

        const inGameProBtn = document.getElementById('in-game-pro-settings-btn');
        if (inGameProBtn) {
            inGameProBtn.addEventListener('click', () => this.openInGameProSettings());
        }

        // Pro Count Slider Logic
        const proCountSlider = document.getElementById('pro-count-slider');
        const proCountValue = document.getElementById('pro-count-value');
        if (proCountSlider) {
            proCountSlider.addEventListener('input', (e) => {
                const val = e.target.value;
                if (proCountValue) proCountValue.textContent = val;
            });
        }

        // Scale Preset Logic
        const presetSelect = document.getElementById('scale-preset-select');
        if (presetSelect) {
            presetSelect.addEventListener('change', (e) => {
                this.applyScalePreset(e.target.value);
            });
            this.applyScalePreset(presetSelect.value); // App load initializer
        }

        const answerMethodSelect = document.getElementById('pro-answer-method');
        if (answerMethodSelect) {
            answerMethodSelect.addEventListener('change', () => this.refreshProNoteToggleLabels());
        }

        const proAccToggle = document.getElementById('pro-accidental-toggle');
        if (proAccToggle) {
            proAccToggle.addEventListener('change', () => {
                this.proAccidentalDisplay = proAccToggle.checked ? 'flat' : 'sharp';
                this.saveProMelodyAccidentalPref();
                this.refreshProNoteToggleLabels();
            });
        }
        this.syncProAccidentalToggleUi();
        if (answerMethodSelect) {
            answerMethodSelect.dispatchEvent(new Event('change'));
        }

        this.updateProMelody2OctaveToggleLayers();
        this.updateProNoteTogglesKeyboardLayoutClass();
        this.maybeShowInfoIntro();
        this.maybeShowInfoNewBadge();

        // Chord Pattern Mode Toggle (Random vs Progression)
        document.querySelectorAll('input[name="chord-pattern-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.chordPatternMode = e.target.value;
            });
        });

        // --- Chord Pro Stage Logic (Advanced Builder) ---
        this.chordEditorModal = document.getElementById('chord-editor-modal');

        if (document.getElementById('btn-level-pro-chord')) document.getElementById('btn-level-pro-chord').addEventListener('click', () => {
            this._proChordModalTargetStageId = null;
            this._proChordUiSnapshot = null;
            this.renderCustomChordList();
            if (this.renderCustomProgressionList) this.renderCustomProgressionList();
            if (this.proChordSettingsModal) this.proChordSettingsModal.classList.remove('hidden');
        });

        if (document.getElementById('btn-cancel-pro-chord')) document.getElementById('btn-cancel-pro-chord').addEventListener('click', () => {
            this.cancelProChordSettingsModal();
        });
        if (document.getElementById('btn-back-pro-chord')) document.getElementById('btn-back-pro-chord').addEventListener('click', () => {
            this.cancelProChordSettingsModal();
        });

        const btnStartProChord = document.getElementById('btn-start-pro-chord');
        const handleConfirmProChord = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            this.confirmProChordSettings();
        };
        if (btnStartProChord) {
            btnStartProChord.addEventListener('click', handleConfirmProChord);
            btnStartProChord.addEventListener('touchstart', handleConfirmProChord, { passive: false });
        }
        if (document.getElementById('btn-reset-pro-chord')) {
            document.getElementById('btn-reset-pro-chord').addEventListener('click', () => this.resetProChordSettingsToDefaults());
        }

        // Expand/Collapse Chord List
        const btnExpandList = document.getElementById('btn-expand-chord-list');
        const listDiv = document.getElementById('pro-custom-chord-list');
        const handleExpandList = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            if (listDiv) {
                listDiv.classList.toggle('expanded');
                if (listDiv.classList.contains('expanded')) {
                    btnExpandList.textContent = '一部表示 ▲';
                } else {
                    btnExpandList.textContent = '全件表示 ▼';
                }
            }
        };
        if (btnExpandList) {
            btnExpandList.addEventListener('click', handleExpandList);
            btnExpandList.addEventListener('touchstart', handleExpandList, { passive: false });
        }

        // Editor UI
        const btnAddChord = document.getElementById('btn-add-custom-chord');
        const handleAddChord = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            if (this.customChords.length >= 50) {
                alert("登録できるコードは最大50個までです。");
                return;
            }
            this.openChordEditor();
        };
        if (btnAddChord) {
            btnAddChord.addEventListener('click', handleAddChord);
            btnAddChord.addEventListener('touchstart', handleAddChord, { passive: false });
        }

        const btnCancelEditor = document.getElementById('btn-cancel-editor');
        const handleCancelEditor = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            if (this.chordEditorModal) this.chordEditorModal.classList.add('hidden');
        };
        if (btnCancelEditor) {
            btnCancelEditor.addEventListener('click', handleCancelEditor);
            btnCancelEditor.addEventListener('touchstart', handleCancelEditor, { passive: false });
        }
        const btnBackChordEditor = document.getElementById('btn-back-chord-editor');
        if (btnBackChordEditor) {
            btnBackChordEditor.addEventListener('click', handleCancelEditor);
            btnBackChordEditor.addEventListener('touchstart', handleCancelEditor, { passive: false });
        }

        const btnSaveChord = document.getElementById('btn-save-chord');
        const handleSaveChord = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            this.saveChordFromEditor();
        };
        if (btnSaveChord) {
            btnSaveChord.addEventListener('click', handleSaveChord);
            btnSaveChord.addEventListener('touchstart', handleSaveChord, { passive: false });
        }

        const btnPreviewChord = document.getElementById('btn-preview-chord');
        const handlePreviewChord = async (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            const chordData = this.readChordEditorState();
            await this.audio.resumeContext();
            this.audio.playCustomChord(chordData, this.baseOctave, 1.5, 0, this.keyOffset);

            // Add playing class for visual feedback
            if (btnPreviewChord) {
                btnPreviewChord.classList.add('playing');
                setTimeout(() => btnPreviewChord.classList.remove('playing'), 600);
            }
        };
        if (btnPreviewChord) {
            btnPreviewChord.addEventListener('click', handlePreviewChord);
            btnPreviewChord.addEventListener('touchstart', handlePreviewChord, { passive: false });
        }

        // コード名プレビュー: ルート等を変えたら自動名に同期（手でコード名を編集した後は上書きしない）
        const chordPreviewNameEl = document.getElementById('chord-preview-name');
        if (chordPreviewNameEl) {
            chordPreviewNameEl.addEventListener('input', () => {
                this.chordEditorNameUserEdited = true;
            });
            chordPreviewNameEl.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                this.chordEditorNameUserEdited = false;
                chordPreviewNameEl.blur();
            });
        }
        const applyGeneratedChordNameToPreview = () => {
            if (this.chordEditorNameUserEdited) return;
            const previewName = document.getElementById('chord-preview-name');
            if (previewName) {
                const chordData = this.readChordEditorState();
                previewName.value = this.generateChordName(chordData);
            }
        };
        if (this.chordEditorModal) {
            this.chordEditorModal.querySelectorAll('select').forEach(el => {
                el.addEventListener('change', applyGeneratedChordNameToPreview);
            });
            this.chordEditorModal.querySelectorAll('.tension-checkbox').forEach(el => {
                el.addEventListener('change', applyGeneratedChordNameToPreview);
            });
        }

        // Default Presets Button
        if (document.getElementById('btn-preset-custom-chord')) {
            document.getElementById('btn-preset-custom-chord').addEventListener('click', () => {
                if (confirm('カスタムコードの設定をデフォルトに戻しますか？')) {
                    this.loadDefaultCustomChords();
                    this.saveCustomData();
                    this.renderCustomChordList();
                    this.renderCustomProgressionList(); // Call this when implemented
                }
            });
        }

        const bulkChordsOn = document.getElementById('btn-bulk-chords-on');
        const bulkChordsOff = document.getElementById('btn-bulk-chords-off');
        if (bulkChordsOn) bulkChordsOn.addEventListener('click', () => this.setAllCustomChordsActive(true));
        if (bulkChordsOff) bulkChordsOff.addEventListener('click', () => this.setAllCustomChordsActive(false));
        const bulkProgsOn = document.getElementById('btn-bulk-progressions-on');
        const bulkProgsOff = document.getElementById('btn-bulk-progressions-off');
        if (bulkProgsOn) bulkProgsOn.addEventListener('click', () => this.setAllCustomProgressionsActive(true));
        if (bulkProgsOff) bulkProgsOff.addEventListener('click', () => this.setAllCustomProgressionsActive(false));

        if (document.getElementById('btn-preset-custom-progression')) {
            console.log("Attached btn-preset-custom-progression click handler");
            document.getElementById('btn-preset-custom-progression').addEventListener('click', () => {
                console.log("btn-preset-custom-progression clicked");
                if (confirm('カスタム進行の設定をデフォルトに戻しますか？')) {
                    console.log("Confirmed resetting progressions");
                    try {
                        const c = this.customChords.find(ch => ch.name === 'C');
                        const dm = this.customChords.find(ch => ch.name === 'Dm');
                        const em = this.customChords.find(ch => ch.name === 'Em');
                        const f = this.customChords.find(ch => ch.name === 'F');
                        const g = this.customChords.find(ch => ch.name === 'G');
                        const am = this.customChords.find(ch => ch.name === 'Am');

                        console.log("Found Chords:", { c, dm, em, f, g, am });

                        if (c && dm && em && f && g && am) {
                            console.log("All required chords found, writing to this.customProgressions");
                            const baseId = Date.now();
                            this.customProgressions = [
                                { id: baseId + 100, name: '基本進行', chords: [c.id, f.id, g.id, c.id], isActive: true },
                                { id: baseId + 101, name: 'Pop Standard', chords: [c.id, f.id, c.id, g.id], isActive: true },
                                { id: baseId + 102, name: 'Pop Standard 2', chords: [c.id, g.id, f.id, g.id], isActive: true },
                                { id: baseId + 103, name: '1950s', chords: [c.id, am.id, f.id, g.id], isActive: true },
                                { id: baseId + 104, name: '王道進行', chords: [f.id, g.id, em.id, am.id], isActive: true },
                                { id: baseId + 105, name: '小室進行', chords: [am.id, f.id, g.id, c.id], isActive: true },
                                { id: baseId + 106, name: '前ツーファイブワン', chords: [dm.id, g.id, c.id, am.id], isActive: true },
                                { id: baseId + 107, name: '後ツーファイブワン', chords: [am.id, dm.id, g.id, c.id], isActive: true },
                                { id: baseId + 108, name: 'カノン進行前半', chords: [c.id, g.id, am.id, em.id], isActive: true },
                                { id: baseId + 109, name: 'カノン進行後半', chords: [f.id, c.id, f.id, g.id], isActive: true },
                                { id: baseId + 110, name: 'ポップパンク', chords: [f.id, c.id, g.id, am.id], isActive: true },
                                { id: baseId + 111, name: 'Let it be進行', chords: [c.id, g.id, am.id, f.id], isActive: true },
                                { id: baseId + 112, name: '洋楽定番 (6415)', chords: [am.id, f.id, c.id, g.id], isActive: true },
                                { id: baseId + 113, name: '王道アレンジ (4561)', chords: [f.id, g.id, am.id, c.id], isActive: true },
                                { id: baseId + 114, name: 'マイナー下降', chords: [am.id, g.id, f.id, g.id], isActive: true },
                                { id: baseId + 115, name: '強進行 (3625)', chords: [em.id, am.id, dm.id, g.id], isActive: true },
                                { id: baseId + 116, name: '625強進行 (1625)', chords: [c.id, am.id, dm.id, g.id], isActive: true },
                                { id: baseId + 117, name: '上昇順次進行 (3456)', chords: [em.id, f.id, g.id, am.id], isActive: true },
                                { id: baseId + 119, name: 'トニック進行 (1361)', chords: [c.id, em.id, am.id, c.id], isActive: true },
                                { id: baseId + 120, name: '上昇順次進行2 (2345)', chords: [dm.id, em.id, f.id, g.id], isActive: true }
                            ];
                            this.saveCustomData();
                            this.renderCustomProgressionList();
                            console.log("Rendered custom progression list, count:", this.customProgressions.length);
                        } else {
                            console.log("Missing chords, alerting");
                            alert('基本のコードが見つかりません。');
                        }
                    } catch (e) {
                        console.error("Error generating progressions", e);
                    }
                }
            });
        }

        // Pro Question Mode Toggle
        document.querySelectorAll('input[name="pro-question-mode"]').forEach(radio => {
            // Wait for DOM to be fully ready before setting initial state
            setTimeout(() => {
                if (radio.checked) {
                    this.proQuestionMode = radio.value;
                    this.updateProChordModeDependentUi(radio.value);
                }
            }, 0);

            radio.addEventListener('change', (e) => {
                this.proQuestionMode = e.target.value;
                this.updateProChordModeDependentUi(e.target.value);
            });
        });

        // Expand/Collapse Progression List
        const btnExpandProgList = document.getElementById('btn-expand-progression-list');
        const progListDiv = document.getElementById('pro-custom-progression-list');
        const handleExpandProgList = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            if (progListDiv) {
                progListDiv.classList.toggle('expanded');
                if (progListDiv.classList.contains('expanded')) {
                    btnExpandProgList.textContent = '一部表示 ▲';
                } else {
                    btnExpandProgList.textContent = '全件表示 ▼';
                }
            }
        };
        if (btnExpandProgList) {
            btnExpandProgList.addEventListener('click', handleExpandProgList);
            btnExpandProgList.addEventListener('touchstart', handleExpandProgList, { passive: false });
        }

        // Progression Editor UI
        const btnAddProgression = document.getElementById('btn-add-custom-progression');
        const handleAddProg = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            if (this.customProgressions.length >= 50) {
                alert('進行は最大50個まで登録可能です。');
                return;
            }
            this.openProgressionEditor();
        };
        if (btnAddProgression) {
            btnAddProgression.addEventListener('click', handleAddProg);
            btnAddProgression.addEventListener('touchstart', handleAddProg, { passive: false });
        }

        const btnCancelProgression = document.getElementById('btn-cancel-progression');
        const handleCancelProg = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            document.getElementById('progression-editor-modal').classList.add('hidden');
        };
        if (btnCancelProgression) {
            btnCancelProgression.addEventListener('click', handleCancelProg);
            btnCancelProgression.addEventListener('touchstart', handleCancelProg, { passive: false });
        }
        const btnBackProgressionEditor = document.getElementById('btn-back-progression-editor');
        if (btnBackProgressionEditor) {
            btnBackProgressionEditor.addEventListener('click', handleCancelProg);
            btnBackProgressionEditor.addEventListener('touchstart', handleCancelProg, { passive: false });
        }

        const btnSaveProgression = document.getElementById('btn-save-progression');
        const handleSaveProg = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            this.saveProgressionFromEditor();
        };
        if (btnSaveProgression) {
            btnSaveProgression.addEventListener('click', handleSaveProg);
            btnSaveProgression.addEventListener('touchstart', handleSaveProg, { passive: false });
        }

        const btnAddProgChord = document.getElementById('btn-add-progression-chord');
        const handleAddProgChord = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            this.addProgressionChordSlot();
        };
        if (btnAddProgChord) {
            btnAddProgChord.addEventListener('click', handleAddProgChord);
            btnAddProgChord.addEventListener('touchstart', handleAddProgChord, { passive: false });
        }

        const btnRemoveProgChord = document.getElementById('btn-remove-progression-chord');
        const handleRemoveProgChord = (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            const container = document.getElementById('progression-sequence-container');
            if (container.children.length > 2) {
                container.removeChild(container.lastChild);
                this.updateProgressionChordsDisplay();
            } else {
                alert('進行には少なくとも2つのコードが必要です。');
            }
        };
        if (btnRemoveProgChord) {
            btnRemoveProgChord.addEventListener('click', handleRemoveProgChord);
            btnRemoveProgChord.addEventListener('touchstart', handleRemoveProgChord, { passive: false });
        }

        const btnPreviewProgression = document.getElementById('btn-preview-progression');
        const handlePreviewProg = async (e) => {
            if (e.type === 'touchstart') e.preventDefault();
            await this.audio.resumeContext();
            const slots = document.querySelectorAll('.progression-chord-slot');
            const chords = Array.from(slots).map(select => parseInt(select.value));
            const now = this.audio.ctx.currentTime;
            chords.forEach((chordId, index) => {
                const chord = this.customChords.find(c => c.id === chordId);
                if (chord) {
                    this.audio.playCustomChord(chord, this.baseOctave, 1.0, now + index * 1.2, this.keyOffset);
                }
            });
        };
        if (btnPreviewProgression) {
            btnPreviewProgression.addEventListener('click', handlePreviewProg);
            btnPreviewProgression.addEventListener('touchstart', handlePreviewProg, { passive: false });
        }

        const proChordCountSlider = document.getElementById('pro-chord-count-slider');
        const proChordCountValue = document.getElementById('pro-chord-count-value');
        if (proChordCountSlider) {
            proChordCountSlider.addEventListener('input', (e) => {
                if (proChordCountValue) proChordCountValue.textContent = e.target.value;
            });
        }

        this.updateKeyRandomDependentUi();

        const stagingAddBtn = document.getElementById('btn-staging-add-pro-slot');
        if (stagingAddBtn) {
            stagingAddBtn.addEventListener('click', () => {
                if (isProChordStageId(this.stage)) {
                    this.addStagingChordSlotFromCurrentConfig();
                } else {
                    this.addStagingMelodySlotFromCurrentConfig();
                }
            });
        }
        if (isStagingProSlotsFeature()) {
            this.renderStagingMelodySlotButtons();
            this.renderStagingChordSlotButtons();
        }
    }

    loadDefaultCustomChords() {
        const baseId = Date.now();
        const cId = baseId + 1;
        const dmId = baseId + 2;
        const emId = baseId + 3;
        const fId = baseId + 4;
        const gId = baseId + 5;
        const amId = baseId + 6;

        this.customChords = [
            { id: cId, name: 'C', root: "0", third: "4", fifth: "7", seventh: "null", tensions: [], inversion: "0", isActive: true },
            { id: dmId, name: 'Dm', root: "2", third: "3", fifth: "7", seventh: "null", tensions: [], inversion: "0", isActive: true },
            { id: emId, name: 'Em', root: "4", third: "3", fifth: "7", seventh: "null", tensions: [], inversion: "0", isActive: true },
            { id: fId, name: 'F', root: "5", third: "4", fifth: "7", seventh: "null", tensions: [], inversion: "0", isActive: true },
            { id: gId, name: 'G', root: "7", third: "4", fifth: "7", seventh: "null", tensions: [], inversion: "0", isActive: true },
            { id: amId, name: 'Am', root: "9", third: "3", fifth: "7", seventh: "null", tensions: [], inversion: "0", isActive: true }
        ];

        this.customProgressions = [
            { id: baseId + 100, name: '基本進行', chords: [cId, fId, gId, cId], isActive: true },
            { id: baseId + 101, name: 'Pop Standard', chords: [cId, fId, cId, gId], isActive: true },
            { id: baseId + 102, name: 'Pop Standard 2', chords: [cId, gId, fId, gId], isActive: true },
            { id: baseId + 103, name: '1950s', chords: [cId, amId, fId, gId], isActive: true },
            { id: baseId + 104, name: '王道進行', chords: [fId, gId, emId, amId], isActive: true },
            { id: baseId + 105, name: '小室進行', chords: [amId, fId, gId, cId], isActive: true },
            { id: baseId + 106, name: '前ツーファイブワン', chords: [dmId, gId, cId, amId], isActive: true },
            { id: baseId + 107, name: '後ツーファイブワン', chords: [amId, dmId, gId, cId], isActive: true },
            { id: baseId + 108, name: 'カノン進行前半', chords: [cId, gId, amId, emId], isActive: true },
            { id: baseId + 109, name: 'カノン進行後半', chords: [fId, cId, fId, gId], isActive: true },
            { id: baseId + 110, name: 'ポップパンク', chords: [fId, cId, gId, amId], isActive: true },
            { id: baseId + 111, name: 'Let it be進行', chords: [cId, gId, amId, fId], isActive: true },
            { id: baseId + 112, name: '洋楽定番 (6415)', chords: [amId, fId, cId, gId], isActive: true },
            { id: baseId + 113, name: '王道アレンジ (4561)', chords: [fId, gId, amId, cId], isActive: true },
            { id: baseId + 114, name: 'マイナー下降', chords: [amId, gId, fId, gId], isActive: true },
            { id: baseId + 115, name: '強進行 (3625)', chords: [emId, amId, dmId, gId], isActive: true },
            { id: baseId + 116, name: '625強進行 (1625)', chords: [cId, amId, dmId, gId], isActive: true },
            { id: baseId + 117, name: '上昇順次進行 (3456)', chords: [emId, fId, gId, amId], isActive: true },
            { id: baseId + 119, name: 'トニック進行 (1361)', chords: [cId, emId, amId, cId], isActive: true },
            { id: baseId + 120, name: '上昇順次進行2 (2345)', chords: [dmId, emId, fId, gId], isActive: true }
        ];
    }

    loadCustomData() {
        try {
            const data = localStorage.getItem('pitchTrainerProData');
            if (data) {
                const parsed = JSON.parse(data);
                this.customChords = parsed.customChords || [];
                this.customProgressions = parsed.customProgressions || [];
                if (this.customChords.length === 0) {
                    this.loadDefaultCustomChords();
                } else if (this.customProgressions.length === 0) {
                    // Try to initialize default progression using existing chords if possible
                    const c = this.customChords.find(ch => ch.name === 'C');
                    const dm = this.customChords.find(ch => ch.name === 'Dm');
                    const em = this.customChords.find(ch => ch.name === 'Em');
                    const f = this.customChords.find(ch => ch.name === 'F');
                    const g = this.customChords.find(ch => ch.name === 'G');
                    const am = this.customChords.find(ch => ch.name === 'Am');
                    if (c && dm && em && f && g && am) {
                        const baseId = Date.now();
                        this.customProgressions = [
                            { id: baseId + 100, name: '基本進行', chords: [c.id, f.id, g.id, c.id], isActive: true },
                            { id: baseId + 101, name: 'Pop Standard', chords: [c.id, f.id, c.id, g.id], isActive: true },
                            { id: baseId + 102, name: 'Pop Standard 2', chords: [c.id, g.id, f.id, g.id], isActive: true },
                            { id: baseId + 103, name: '1950s', chords: [c.id, am.id, f.id, g.id], isActive: true },
                            { id: baseId + 104, name: '王道進行', chords: [f.id, g.id, em.id, am.id], isActive: true },
                            { id: baseId + 105, name: '小室進行', chords: [am.id, f.id, g.id, c.id], isActive: true },
                            { id: baseId + 106, name: '前ツーファイブワン', chords: [dm.id, g.id, c.id, am.id], isActive: true },
                            { id: baseId + 107, name: '後ツーファイブワン', chords: [am.id, dm.id, g.id, c.id], isActive: true },
                            { id: baseId + 108, name: 'カノン進行前半', chords: [c.id, g.id, am.id, em.id], isActive: true },
                            { id: baseId + 109, name: 'カノン進行後半', chords: [f.id, c.id, f.id, g.id], isActive: true },
                            { id: baseId + 110, name: 'ポップパンク', chords: [f.id, c.id, g.id, am.id], isActive: true },
                            { id: baseId + 111, name: 'Let it be進行', chords: [c.id, g.id, am.id, f.id], isActive: true },
                            { id: baseId + 112, name: '洋楽定番 (6415)', chords: [am.id, f.id, c.id, g.id], isActive: true },
                            { id: baseId + 113, name: '王道アレンジ (4561)', chords: [f.id, g.id, am.id, c.id], isActive: true },
                            { id: baseId + 114, name: 'マイナー下降', chords: [am.id, g.id, f.id, g.id], isActive: true },
                            { id: baseId + 115, name: '強進行 (3625)', chords: [em.id, am.id, dm.id, g.id], isActive: true },
                            { id: baseId + 116, name: '625強進行 (1625)', chords: [c.id, am.id, dm.id, g.id], isActive: true },
                            { id: baseId + 117, name: '上昇順次進行 (3456)', chords: [em.id, f.id, g.id, am.id], isActive: true },
                            { id: baseId + 119, name: 'トニック進行 (1361)', chords: [c.id, em.id, am.id, c.id], isActive: true },
                            { id: baseId + 120, name: '上昇順次進行2 (2345)', chords: [dm.id, em.id, f.id, g.id], isActive: true }
                        ];
                        this.saveCustomData(); // Save the newly generated default progression to localStorage
                    } else if (this.customChords.length >= 2) {
                        // Fallback: just use the first few available chords
                        this.customProgressions = [{
                            id: Date.now(),
                            name: '初期進行',
                            chords: this.customChords.slice(0, Math.min(6, this.customChords.length)).map(ch => ch.id),
                            isActive: true
                        }];
                        this.saveCustomData();
                    }
                }
            } else {
                this.loadDefaultCustomChords();
                this.saveCustomData(); // Save defaults if completely fresh
            }
        } catch (e) {
            console.error("Failed to load custom data from localStorage", e);
            this.loadDefaultCustomChords();
        }
    }

    saveCustomData() {
        try {
            const data = {
                customChords: this.customChords,
                customProgressions: this.customProgressions
            };
            localStorage.setItem('pitchTrainerProData', JSON.stringify(data));
        } catch (e) {
            console.error("Failed to save custom data to localStorage", e);
        }
    }

    /** 通常版では A4=440Hz・余韻0.5秒・スピード1.0x に固定（表示も合わせる） */
    clampStandardEditionSoundSettings() {
        if (isPitchTrainerPro()) return;
        this.audio.setBaseHz(440);
        this.audio.sustainTime = 0.5;
        this.noteSpeed = 1.0;
        const hzSlider = document.getElementById('hz-slider');
        const hzSpan = document.getElementById('current-hz') || document.getElementById('hz-value');
        if (hzSlider) hzSlider.value = '440';
        if (hzSpan) hzSpan.textContent = '440';
        const sustainSlider = document.getElementById('sustain-slider');
        const sustainValue = document.getElementById('sustain-value');
        if (sustainSlider) sustainSlider.value = '0.5';
        if (sustainValue) sustainValue.textContent = '0.5';
        const speedSlider = document.getElementById('speed-slider');
        const speedValue = document.getElementById('speed-value');
        if (speedSlider) speedSlider.value = '1.0';
        if (speedValue) speedValue.textContent = '1.0';
    }

    /** 通常版ではキー=C（0）・基準オクターブ=3 に固定 */
    clampStandardEditionKeyOctave() {
        if (isPitchTrainerPro()) return;
        this.baseOctave = 3;
        this.keyOffset = 0;
        if (this.currentOctaveEl) this.currentOctaveEl.textContent = '3';
        if (this.keySelector) this.keySelector.value = '0';
    }

    normalizeNoteSpeed(value) {
        const raw = parseFloat(value);
        if (!Number.isFinite(raw)) return 1.0;
        const clamped = Math.min(5.0, Math.max(0.5, raw));
        if (clamped <= 2.0) return Math.round(clamped * 10) / 10;
        return Math.min(5.0, Math.max(3.0, Math.round(clamped)));
    }

    getNoteSpeedFromSliderValue(value) {
        const sliderValue = Math.round(parseFloat(value) * 10) / 10;
        if (!Number.isFinite(sliderValue)) return 1.0;
        if (sliderValue <= 2.0) return this.normalizeNoteSpeed(sliderValue);
        return Math.min(5.0, Math.max(3.0, Math.round((sliderValue - 2.0) * 10) + 2));
    }

    getSliderValueFromNoteSpeed(value) {
        const speed = this.normalizeNoteSpeed(value);
        if (speed <= 2.0) return speed;
        return 2.0 + ((speed - 2.0) / 10);
    }

    loadSettings() {
        try {
            const data = localStorage.getItem('pitchTrainerSettings');
            if (data) {
                const s = JSON.parse(data);
                this.isInitializing = true; // Add flag to prevent saveSettings during loading

                if (isPitchTrainerPro()) {
                    if (s.baseOctave !== undefined) this.updateOctave(s.baseOctave - this.baseOctave);
                    if (s.keyOffset !== undefined) this.updateKey(s.keyOffset);
                }
                if (s.instrument !== undefined) this.updateInstrument(s.instrument);
                if (s.notationStyle !== undefined) {
                    console.log("Game: updating notation to", s.notationStyle);
                    this.updateNotation(s.notationStyle);
                }
                if (s.scaleEnabled !== undefined) {
                    this.scaleEnabled = s.scaleEnabled;
                    const scaleToggle = document.getElementById('scale-toggle');
                    if (scaleToggle) scaleToggle.checked = this.scaleEnabled;
                }
                if (isPitchTrainerPro() && s.keyRandomMode !== undefined) {
                    this.keyRandomMode = !!s.keyRandomMode;
                    const krt = document.getElementById('key-random-toggle');
                    if (krt) krt.checked = this.keyRandomMode;
                }
                if (!isPitchTrainerPro()) {
                    this.keyRandomMode = false;
                    const krt = document.getElementById('key-random-toggle');
                    if (krt) krt.checked = false;
                }
                if (isPitchTrainerPro()) {
                    if (s.noteSpeed !== undefined) {
                        this.noteSpeed = this.normalizeNoteSpeed(s.noteSpeed);
                        const speedSlider = document.getElementById('speed-slider');
                        const speedValue = document.getElementById('speed-value');
                        if (speedSlider) {
                            speedSlider.value = this.getSliderValueFromNoteSpeed(this.noteSpeed).toFixed(1);
                            if (speedValue) speedValue.textContent = this.noteSpeed.toFixed(1);
                        }
                    }
                    if (s.baseHz !== undefined) {
                        this.audio.setBaseHz(s.baseHz);
                        const hzSlider = document.getElementById('hz-slider');
                        const hzSpan = document.getElementById('current-hz') || document.getElementById('hz-value');
                        if (hzSlider) {
                            hzSlider.value = this.audio.baseHz;
                            if (hzSpan) hzSpan.textContent = this.audio.baseHz;
                        }
                    }
                    if (s.sustainTime !== undefined) {
                        this.audio.sustainTime = s.sustainTime;
                        const sustainSlider = document.getElementById('sustain-slider');
                        const sustainValue = document.getElementById('sustain-value');
                        if (sustainSlider) {
                            sustainSlider.value = this.audio.sustainTime;
                            if (sustainValue) sustainValue.textContent = this.audio.sustainTime.toFixed(1);
                        }
                    }
                }
                if (s.isAnswerMode !== undefined) {
                    this.isAnswerMode = s.isAnswerMode;
                    const answerToggle = document.getElementById('answer-mode-toggle');
                    if (answerToggle) answerToggle.checked = this.isAnswerMode;
                    console.log("Game: toggling answer mode to", this.isAnswerMode);
                    this.toggleAnswerMode(this.isAnswerMode);
                }

                this.isInitializing = false;
            } else {
                this.updateNotation('doremi');
            }
        } catch (e) {
            console.error("Failed to load settings from localStorage", e);
            this.isInitializing = false;
        }
        this.clampStandardEditionSoundSettings();
        this.clampStandardEditionKeyOctave();
        this.updateKeyRandomDependentUi();

        // テストモード ON/OFF を別キーから読み込む
        try {
            const tmVal = localStorage.getItem(TEST_MODE_ENABLED_KEY);
            if (tmVal !== null) {
                testModeState.enabled = tmVal === 'true';
                const tmToggle = document.getElementById('test-mode-toggle');
                if (tmToggle) tmToggle.checked = testModeState.enabled;
            }
        } catch (_) {}
        document.body.classList.toggle('test-mode-enabled', testModeState.enabled);
        updateTestModeStageButtons(this);
    }

    saveSettings() {
        if (this.isInitializing) return; // Don't save while loading
        try {
            const data = {
                instrument: this.instrument,
                notationStyle: this.notationStyle,
                scaleEnabled: this.scaleEnabled,
                isAnswerMode: this.isAnswerMode
            };
            if (isPitchTrainerPro()) {
                data.keyRandomMode = this.keyRandomMode;
                data.baseOctave = this.baseOctave;
                data.keyOffset = this.keyOffset;
                this.noteSpeed = this.normalizeNoteSpeed(this.noteSpeed);
                data.noteSpeed = this.noteSpeed;
                data.sustainTime = this.audio.sustainTime;
                data.baseHz = this.audio.baseHz;
            } else {
                // 通常版・ベータは Pro 用の値を書き換えない（同じ端末で Pro を使うときのため）
                try {
                    const prevRaw = localStorage.getItem('pitchTrainerSettings');
                    if (prevRaw) {
                        const prev = JSON.parse(prevRaw);
                        ['baseOctave', 'keyOffset', 'noteSpeed', 'sustainTime', 'baseHz', 'keyRandomMode'].forEach((k) => {
                            if (prev[k] !== undefined) data[k] = prev[k];
                        });
                    }
                } catch (e) { /* ignore */ }
            }
            localStorage.setItem('pitchTrainerSettings', JSON.stringify(data));
        } catch (e) {
            console.error("Failed to save settings to localStorage", e);
        }
    }

    captureSettingsModalSnapshot() {
        this._settingsModalSnapshot = {
            instrument: this.instrument,
            notationStyle: this.notationStyle,
            scaleEnabled: this.scaleEnabled,
            isAnswerMode: this.isAnswerMode
        };
        if (document.getElementById('key-random-toggle') && isPitchTrainerPro()) {
            this._settingsModalSnapshot.keyRandomMode = this.keyRandomMode;
        }
        if (isPitchTrainerPro()) {
            this._settingsModalSnapshot.baseOctave = this.baseOctave;
            this._settingsModalSnapshot.keyOffset = this.keyOffset;
            this._settingsModalSnapshot.noteSpeed = this.noteSpeed;
            this._settingsModalSnapshot.sustainTime = this.audio.sustainTime;
            this._settingsModalSnapshot.baseHz = this.audio.baseHz;
        }
    }

    applySettingsModalData(s) {
        if (!s) return;
        this.isInitializing = true;
        try {
            if (isPitchTrainerPro()) {
                if (s.baseOctave !== undefined) this.updateOctave(s.baseOctave - this.baseOctave);
                if (s.keyOffset !== undefined) this.updateKey(s.keyOffset);
                if (s.noteSpeed !== undefined) {
                    this.noteSpeed = this.normalizeNoteSpeed(s.noteSpeed);
                    const speedSlider = document.getElementById('speed-slider');
                    const speedValue = document.getElementById('speed-value');
                    if (speedSlider) speedSlider.value = this.getSliderValueFromNoteSpeed(this.noteSpeed).toFixed(1);
                    if (speedValue) speedValue.textContent = this.noteSpeed.toFixed(1);
                }
                if (s.baseHz !== undefined) {
                    this.audio.setBaseHz(s.baseHz);
                    const hzSlider = document.getElementById('hz-slider');
                    const hzSpan = document.getElementById('current-hz') || document.getElementById('hz-value');
                    if (hzSlider) hzSlider.value = this.audio.baseHz;
                    if (hzSpan) hzSpan.textContent = this.audio.baseHz;
                }
                if (s.sustainTime !== undefined) {
                    this.audio.sustainTime = s.sustainTime;
                    const sustainSlider = document.getElementById('sustain-slider');
                    const sustainValue = document.getElementById('sustain-value');
                    if (sustainSlider) sustainSlider.value = this.audio.sustainTime;
                    if (sustainValue) sustainValue.textContent = this.audio.sustainTime.toFixed(1);
                }
                if (s.keyRandomMode !== undefined) {
                    this.keyRandomMode = !!s.keyRandomMode;
                    const krt = document.getElementById('key-random-toggle');
                    if (krt) krt.checked = this.keyRandomMode;
                }
            } else {
                this.clampStandardEditionKeyOctave();
                this.clampStandardEditionSoundSettings();
            }
            if (s.instrument !== undefined) this.updateInstrument(s.instrument);
            if (s.notationStyle !== undefined) this.updateNotation(s.notationStyle);
            if (s.scaleEnabled !== undefined) {
                this.scaleEnabled = s.scaleEnabled;
                const scaleToggle = document.getElementById('scale-toggle');
                if (scaleToggle) scaleToggle.checked = this.scaleEnabled;
            }
            if (s.isAnswerMode !== undefined) {
                this.isAnswerMode = s.isAnswerMode;
                const answerToggle = document.getElementById('answer-mode-toggle');
                if (answerToggle) answerToggle.checked = this.isAnswerMode;
                this.toggleAnswerMode(this.isAnswerMode);
            }
        } finally {
            this.isInitializing = false;
        }
        this.updateKeyRandomDependentUi();
        this.saveSettings();
    }

    openSettingsModal() {
        if (testModeState.active) return; // テスト中は設定変更不可
        this.clampStandardEditionSoundSettings();
        this.clampStandardEditionKeyOctave();
        this.captureSettingsModalSnapshot();
        if (this.settingsModal) {
            this.settingsModal.classList.remove('hidden');
            // 前回のスクロール位置が残ると上に「余白スワイプ」が出るため、開くたびに先頭へ
            this.settingsModal.scrollTop = 0;
            requestAnimationFrame(() => {
                this.settingsModal.scrollTop = 0;
            });
        }
        this.updateKeyRandomDependentUi();
    }

    hideSettingsModal() {
        this._settingsModalSnapshot = null;
        if (this.settingsModal) {
            this.settingsModal.classList.add('hidden');
        }
    }

    renderCustomChordList() {
        const listDiv = document.getElementById('pro-custom-chord-list');
        const countSpan = document.getElementById('pro-custom-chord-count');
        if (!listDiv || !countSpan) return;

        countSpan.textContent = this.customChords.length;
        listDiv.innerHTML = '';

        if (this.customChords.length === 0) {
            listDiv.innerHTML = '<div class="custom-chord-placeholder">まだコードが登録されていません。<br>「+ 新規コード追加」から作成してください。</div>';
            return;
        }

        this.customChords.forEach(chord => {
            const item = document.createElement('div');
            item.className = 'custom-chord-item';
            if (!chord.isActive) item.classList.add('inactive'); // Add class for styling

            const nameWrap = document.createElement('div');
            nameWrap.style.display = 'flex';
            nameWrap.style.alignItems = 'center';
            nameWrap.style.gap = '10px';
            nameWrap.style.flex = '1';
            nameWrap.style.minWidth = '0'; // Allows children to truncate

            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'switch';
            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = chord.isActive !== false; // Default true if undefined

            const toggleHandler = (e) => {
                chord.isActive = e.target.checked;
                item.classList.toggle('inactive', !chord.isActive);
                this.saveCustomData();
            };
            toggleInput.addEventListener('change', toggleHandler);

            const toggleSlider = document.createElement('span');
            toggleSlider.className = 'slider round';

            toggleLabel.appendChild(toggleInput);
            toggleLabel.appendChild(toggleSlider);

            const nameDiv = document.createElement('div');
            nameDiv.className = 'custom-chord-name';
            nameDiv.textContent = chord.name;

            nameWrap.appendChild(toggleLabel);
            nameWrap.appendChild(nameDiv);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'custom-chord-actions';

            const playBtn = document.createElement('button');
            playBtn.className = 'btn-icon';
            playBtn.innerHTML = '▶';
            playBtn.title = '再生';
            playBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.audio.resumeContext();
                this.audio.playCustomChord(chord, this.baseOctave, 1.5, 0, this.keyOffset);
            };

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-icon';
            editBtn.innerHTML = '✎';
            editBtn.title = '編集';
            editBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openChordEditor(chord);
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-icon delete';
            delBtn.innerHTML = '×';
            delBtn.title = '削除';
            delBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm('コード「' + chord.name + '」を削除しますか？')) {
                    this.customChords = this.customChords.filter(c => c.id !== chord.id);
                    // Also remove it from progressions if it's there
                    this.customProgressions.forEach(prog => {
                        prog.chords = prog.chords.filter(id => id !== chord.id);
                    });
                    this.saveCustomData();
                    this.renderCustomChordList();
                    if (this.renderCustomProgressionList) this.renderCustomProgressionList();
                }
            };

            actionsDiv.appendChild(playBtn);
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(delBtn);

            item.appendChild(nameWrap);
            item.appendChild(actionsDiv);
            listDiv.appendChild(item);
        });
    }

    setAllCustomChordsActive(active) {
        if (!this.customChords.length) return;
        this.customChords.forEach(c => { c.isActive = active; });
        this.saveCustomData();
        this.renderCustomChordList();
    }

    setAllCustomProgressionsActive(active) {
        if (!this.customProgressions.length) return;
        this.customProgressions.forEach(p => { p.isActive = active; });
        this.saveCustomData();
        this.renderCustomProgressionList();
    }

    openChordEditor(chordToEdit = null) {
        if (!this.chordEditorModal) return;

        // Reset form
        document.getElementById('editor-root').value = "0";
        document.getElementById('editor-third').value = "4";
        document.getElementById('editor-fifth').value = "7";
        document.getElementById('editor-seventh').value = "null";
        document.getElementById('editor-inversion').value = "0";
        document.querySelectorAll('.tension-checkbox').forEach(cb => cb.checked = false);

        this.editingChordId = null; // Reset editing state
        const previewEl = document.getElementById('chord-preview-name');

        if (chordToEdit) {
            this.editingChordId = chordToEdit.id;
            document.getElementById('editor-root').value = chordToEdit.root;
            document.getElementById('editor-third').value = chordToEdit.third;
            document.getElementById('editor-fifth').value = chordToEdit.fifth;
            document.getElementById('editor-seventh').value = chordToEdit.seventh;
            document.getElementById('editor-inversion').value = chordToEdit.inversion;
            chordToEdit.tensions.forEach(tension => {
                const cb = document.querySelector('.tension-checkbox[value="' + tension + '"]');
                if (cb) cb.checked = true;
            });
            this.chordEditorNameUserEdited = true;
            if (previewEl) previewEl.value = chordToEdit.name || '';
        } else {
            this.chordEditorNameUserEdited = false;
            if (previewEl) previewEl.value = this.generateChordName(this.readChordEditorState());
        }

        this.chordEditorModal.classList.remove('hidden');
    }

    readChordEditorState() {
        const tensions = Array.from(document.querySelectorAll('.tension-checkbox:checked')).map(cb => cb.value);
        return {
            root: document.getElementById('editor-root').value,
            third: document.getElementById('editor-third').value,
            fifth: document.getElementById('editor-fifth').value,
            seventh: document.getElementById('editor-seventh').value,
            tensions: tensions,
            inversion: document.getElementById('editor-inversion').value
        };
    }

    saveChordFromEditor() {
        const chordData = this.readChordEditorState();
        const previewEl = document.getElementById('chord-preview-name');
        let customName = previewEl && typeof previewEl.value === 'string' ? previewEl.value.trim() : '';
        chordData.name = customName || this.generateChordName(chordData);

        if (this.editingChordId) {
            // Edit existing
            const index = this.customChords.findIndex(c => c.id === this.editingChordId);
            if (index !== -1) {
                this.customChords[index] = { ...chordData, id: this.editingChordId, isActive: this.customChords[index].isActive };
            }
        } else {
            // Add new
            chordData.id = Date.now();
            chordData.isActive = true; // explicitly activate upon saving
            this.customChords.push(chordData);
        }

        this.saveCustomData();
        this.renderCustomChordList();
        this.chordEditorModal.classList.add('hidden');
    }

    generateChordName(chordData) {
        const rootNames = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        let name = rootNames[parseInt(chordData.root)] || 'C';

        let third = chordData.third;
        let fifth = chordData.fifth;
        let seventh = chordData.seventh;
        let tensions = chordData.tensions || [];

        // Determine base quality
        if (third === "3") {
            // minor
            if (fifth === "6" && seventh === "9") name += "dim7";
            else if (fifth === "6" && seventh === "10") name += "m7(b5)";
            else if (fifth === "6") name += "dim";
            else if (seventh === "10") name += "m7";
            else if (seventh === "11") name += "mM7";
            else name += "m";
        } else if (third === "5") {
            // sus4
            name += "sus4";
            if (seventh === "10") name += "7";
        } else if (third === "4") {
            // major
            if (fifth === "8") {
                if (seventh === "10") name += "aug7";
                else if (seventh === "11") name += "augM7";
                else name += "aug";
            } else {
                if (seventh === "10") name += "7";
                else if (seventh === "11") name += "M7";
                else if (seventh === "null" && fifth === "null") name += "(power)";
            }
        } else {
            // no 3rd
            name += "(omit3)";
        }

        // Add tensions
        if (tensions.length > 0) {
            const tNames = tensions.map(t => {
                if (t === "13") return "b9";
                if (t === "14") return "9";
                if (t === "15") return "#9";
                if (t === "17") return "11";
                if (t === "18") return "#11";
                if (t === "20") return "b13";
                if (t === "21") return "13";
                return "";
            });
            name += "(" + tNames.join(",") + ")";
        }

        // Add inversion
        if (chordData.inversion !== "0") {
            if (chordData.inversion === "1") name += " / 1st";
            else if (chordData.inversion === "2") name += " / 2nd";
            else if (chordData.inversion === "3") name += " / 3rd";
        }

        return name;
    }

    // --- Custom Progression Logic ---

    renderCustomProgressionList() {
        const listDiv = document.getElementById('pro-custom-progression-list');
        const countSpan = document.getElementById('pro-custom-progression-count');
        if (!listDiv || !countSpan) return;

        countSpan.textContent = this.customProgressions.length;
        listDiv.innerHTML = '';

        if (this.customProgressions.length === 0) {
            listDiv.innerHTML = '<div class="custom-chord-placeholder">まだ進行が登録されていません。<br>「+ 新規進行追加」から作成してください。</div>';
            return;
        }

        this.customProgressions.forEach(prog => {
            const item = document.createElement('div');
            item.className = 'custom-chord-item';
            if (!prog.isActive) item.classList.add('inactive');

            const nameWrap = document.createElement('div');
            nameWrap.style.display = 'flex';
            nameWrap.style.alignItems = 'center';
            nameWrap.style.gap = '10px';
            nameWrap.style.flex = '1';
            nameWrap.style.minWidth = '0'; // Allows children to truncate

            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'switch';
            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = prog.isActive !== false;

            const toggleHandler = (e) => {
                prog.isActive = e.target.checked;
                item.classList.toggle('inactive', !prog.isActive);
                this.saveCustomData();
            };
            toggleInput.addEventListener('change', toggleHandler);

            const toggleSlider = document.createElement('span');
            toggleSlider.className = 'slider round';
            toggleLabel.appendChild(toggleInput);
            toggleLabel.appendChild(toggleSlider);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'chord-name';
            // Clean up existing names that might have "(C, F, G, C)" from older app versions
            nameSpan.textContent = (prog.name || '名称未設定').replace(/\s*\(.*?\)$/, '');

            // Subtext for chord count
            const countLabel = document.createElement('span');
            countLabel.style.fontSize = '0.75rem';
            countLabel.style.color = 'rgba(255,255,255,0.5)';
            countLabel.textContent = prog.chords.length + 'コード';

            // Generate chords string like "C - F - G - C"
            const chordsStr = prog.chords.map(chordId => {
                const c = this.customChords.find(ch => ch.id === chordId);
                return c ? c.name : '?';
            }).join(' - ');

            const chordsSpan = document.createElement('div');
            chordsSpan.style.fontSize = '1.1rem';
            chordsSpan.style.fontWeight = 'bold';
            chordsSpan.style.color = 'var(--primary-color)';
            chordsSpan.style.marginTop = '4px';
            chordsSpan.style.whiteSpace = 'nowrap';
            chordsSpan.style.overflow = 'hidden';
            chordsSpan.style.textOverflow = 'ellipsis';
            chordsSpan.textContent = chordsStr;

            const textWrap = document.createElement('div');
            textWrap.style.display = 'flex';
            textWrap.style.flexDirection = 'column';
            textWrap.style.flex = '1';
            textWrap.style.minWidth = '0';

            const nameRow = document.createElement('div');
            nameRow.style.display = 'flex';
            nameRow.style.alignItems = 'baseline';
            nameRow.style.gap = '8px';
            nameRow.appendChild(nameSpan);
            nameRow.appendChild(countLabel);

            textWrap.appendChild(nameRow);
            textWrap.appendChild(chordsSpan);

            nameWrap.appendChild(toggleLabel);
            nameWrap.appendChild(textWrap);

            const actionsDiv = document.createElement('div');
            actionsDiv.style.display = 'flex';
            actionsDiv.style.gap = '10px';

            const playBtn = document.createElement('button');
            playBtn.className = 'btn-icon';
            playBtn.innerHTML = '▶';
            playBtn.title = '試聴';
            playBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.audio.resumeContext();
                const now = this.audio.ctx.currentTime;
                prog.chords.forEach((chordId, index) => {
                    const chord = this.customChords.find(c => c.id === chordId);
                    if (chord) {
                        this.audio.playCustomChord(chord, this.baseOctave, 1.0, now + index * 1.2, this.keyOffset);
                    }
                });
            };

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-icon';
            editBtn.innerHTML = '✎';
            editBtn.title = '編集';
            editBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openProgressionEditor(prog);
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-icon delete';
            delBtn.innerHTML = '×';
            delBtn.title = '削除';
            delBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm('進行「' + prog.name + '」を削除しますか？')) {
                    this.customProgressions = this.customProgressions.filter(p => p.id !== prog.id);
                    this.saveCustomData();
                    this.renderCustomProgressionList();
                }
            };

            actionsDiv.appendChild(playBtn);
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(delBtn);

            item.appendChild(nameWrap);
            item.appendChild(actionsDiv);
            listDiv.appendChild(item);
        });
    }

    openProgressionEditor(progToEdit = null) {
        const modal = document.getElementById('progression-editor-modal');
        if (!modal) return;

        document.getElementById('progression-name').value = '';
        const container = document.getElementById('progression-sequence-container');
        container.innerHTML = '';

        this.editingProgressionId = null;

        if (progToEdit) {
            this.editingProgressionId = progToEdit.id;
            document.getElementById('progression-name').value = (progToEdit.name || '').replace(/\s*\(.*?\)$/, '');
            progToEdit.chords.forEach(chordId => {
                this.addProgressionChordSlot(chordId);
            });
        } else {
            // Default 4 slots
            this.addProgressionChordSlot();
            this.addProgressionChordSlot();
            this.addProgressionChordSlot();
            this.addProgressionChordSlot();
        }

        modal.classList.remove('hidden');
    }

    addProgressionChordSlot(selectedChordId = null) {
        if (this.customChords.length === 0) {
            alert('まずはコードを登録してください。');
            return;
        }

        const container = document.getElementById('progression-sequence-container');
        const select = document.createElement('select');
        select.className = 'preset-select progression-chord-slot';
        select.style.padding = '8px';
        select.style.fontSize = '1rem';

        this.customChords.forEach(chord => {
            const option = document.createElement('option');
            option.value = chord.id;
            option.textContent = chord.name;
            if (selectedChordId && chord.id === selectedChordId) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        select.addEventListener('change', () => this.updateProgressionChordsDisplay());

        container.appendChild(select);
        this.updateProgressionChordsDisplay();
    }

    updateProgressionChordsDisplay() {
        const display = document.getElementById('progression-chords-display');
        const slots = document.querySelectorAll('.progression-chord-slot');
        if (!display) return;

        const chordsStr = Array.from(slots).map(select => {
            const chordId = parseInt(select.value);
            const chord = this.customChords.find(c => c.id === chordId);
            return chord ? chord.name : '?';
        }).join(' - ');

        display.textContent = chordsStr;
    }

    saveProgressionFromEditor() {
        const name = document.getElementById('progression-name').value.trim() || '名称未設定';
        const slots = document.querySelectorAll('.progression-chord-slot');
        const chords = Array.from(slots).map(select => parseInt(select.value));

        if (chords.length < 2) {
            alert('進行には少なくとも2つのコードが必要です。');
            return;
        }

        const progData = {
            name: name,
            chords: chords
        };

        if (this.editingProgressionId) {
            const index = this.customProgressions.findIndex(p => p.id === this.editingProgressionId);
            if (index !== -1) {
                this.customProgressions[index] = { ...progData, id: this.editingProgressionId, isActive: this.customProgressions[index].isActive };
            }
        } else {
            if (this.customProgressions.length >= 50) {
                alert('進行は最大50個まで登録可能です。');
                return;
            }
            progData.id = Date.now();
            progData.isActive = true;
            this.customProgressions.push(progData);
        }

        this.saveCustomData();
        this.renderCustomProgressionList();
        document.getElementById('progression-editor-modal').classList.add('hidden');
    }

    // Replace the end of `init()` bracket with standard form

    applyScalePreset(preset) {
        const modal = document.getElementById('screen-pro-settings');
        if (!modal) return;
        const allToggles = () => modal.querySelectorAll('.note-toggle');
        const is2 = document.getElementById('pro-2octave-toggle') ? document.getElementById('pro-2octave-toggle').checked : false;
        const check = (note) => {
            const offsets = is2 ? [0, 1] : [0];
            offsets.forEach((o) => {
                const el = modal.querySelector(
                    '.note-toggle[data-note="' + note + '"][data-octave-offset="' + o + '"]'
                );
                if (el) el.checked = true;
            });
        };
        const uncheckAll = () => allToggles().forEach((t) => { t.checked = false; });

        uncheckAll();

        switch (preset) {
            case 'chromatic':
                allToggles().forEach((t) => { t.checked = true; });
                break;
            case 'major': // Ionian: C D E F G A B
                ['C', 'D', 'E', 'F', 'G', 'A', 'B'].forEach(check);
                break;
            case 'minor': // Aeolian: C D Eb F G Ab Bb
                ['C', 'D', 'D#', 'F', 'G', 'G#', 'A#'].forEach(check);
                break;
            case 'harmonic-minor': // Harmonic Minor: C D Eb F G Ab B
                ['C', 'D', 'D#', 'F', 'G', 'G#', 'B'].forEach(check);
                break;
            case 'melodic-minor': // Melodic Minor: C D Eb F G A B
                ['C', 'D', 'D#', 'F', 'G', 'A', 'B'].forEach(check);
                break;
            case 'dorian': // Dorian: C D Eb F G A Bb
                ['C', 'D', 'D#', 'F', 'G', 'A', 'A#'].forEach(check);
                break;
            case 'phrygian': // Phrygian: C Db Eb F G Ab Bb
                ['C', 'C#', 'D#', 'F', 'G', 'G#', 'A#'].forEach(check);
                break;
            case 'lydian': // Lydian: C D E F# G A B
                ['C', 'D', 'E', 'F#', 'G', 'A', 'B'].forEach(check);
                break;
            case 'mixolydian': // Mixolydian: C D E F G A Bb
                ['C', 'D', 'E', 'F', 'G', 'A', 'A#'].forEach(check);
                break;
            case 'locrian': // Locrian: C Db Eb F Gb Ab Bb
                ['C', 'C#', 'D#', 'F', 'F#', 'G#', 'A#'].forEach(check);
                break;
            case 'penta-maj': // C Major Pentatonic -> C D E G A
                ['C', 'D', 'E', 'G', 'A'].forEach(check);
                break;
            case 'penta-min': // C Minor Pentatonic -> C Eb F G Bb
                ['C', 'D#', 'F', 'G', 'A#'].forEach(check);
                break;
            case 'blues': // Blues: C Eb F F# G Bb
                ['C', 'D#', 'F', 'F#', 'G', 'A#'].forEach(check);
                break;
            case 'altered': // Altered: C Db Eb Fb(E) Gb(F#) Ab(G#) Bb(A#)
                ['C', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'].forEach(check);
                break;
            case 'whole-tone': // Whole Tone: C D E F# G# A#
                ['C', 'D', 'E', 'F#', 'G#', 'A#'].forEach(check);
                break;
            case 'diminished-wh': // Diminished (W-H): C D Eb F F# G# A B
                ['C', 'D', 'D#', 'F', 'F#', 'G#', 'A', 'B'].forEach(check);
                break;
            case 'diminished-hw': // Combination of Diminished (H-W): C Db Eb E F# G A Bb
                ['C', 'C#', 'D#', 'E', 'F#', 'G', 'A', 'A#'].forEach(check);
                break;
            case 'lydian-b7': // Lydian b7 / Acoustic: C D E F# G A Bb
                ['C', 'D', 'E', 'F#', 'G', 'A', 'A#'].forEach(check);
                break;
        }
    }

    applyChordPreset(preset) {
        const toggles = document.querySelectorAll('.chord-toggle');
        const check = (chord) => {
            const el = document.querySelector('.chord-toggle[data-chord="' + chord + '"]');
            if (el) el.checked = true;
        };
        const uncheckAll = () => toggles.forEach(t => t.checked = false);

        uncheckAll();

        switch (preset) {
            case 'diatonic-c':
                ['C', 'Dm', 'Em', 'F', 'G', 'Am'].forEach(check); // Bdim is usually omitted or mapped differently, keeping it simple
                break;
            case 'all-major':
                ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].forEach(check);
                break;
            case 'all-minor':
                ['Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm'].forEach(check);
                break;
            case 'all-chords':
                toggles.forEach(t => t.checked = true);
                break;
        }
    }

    /** コード Pro: 出題モードに応じたエリアのグレーアウト */
    updateProChordModeDependentUi(mode) {
        const chordsArea = document.getElementById('custom-chords-area');
        const progsArea = document.getElementById('custom-progressions-area');
        if (!chordsArea || !progsArea) return;

        if (mode === 'chords') {
            chordsArea.style.opacity = '1';
            chordsArea.style.pointerEvents = 'auto';
            progsArea.style.opacity = '0.4';
            progsArea.style.pointerEvents = 'none';
        } else {
            progsArea.style.opacity = '1';
            progsArea.style.pointerEvents = 'auto';
            chordsArea.style.opacity = '0.4';
            chordsArea.style.pointerEvents = 'none';
        }
    }

    /** Proコード設定を stageConfig に反映。失敗時 false。targetStageId 省略時は 199 */
    applyProChordSettingsFromUI(targetStageId) {
        const tid = targetStageId !== undefined ? targetStageId : 199;
        const activeChords = this.customChords.filter(c => c.isActive !== false);
        const countVal = parseInt(document.getElementById('pro-chord-count-slider').value) || 4;
        const qm = document.querySelector('input[name="pro-question-mode"]:checked')?.value || 'chords';
        this.proQuestionMode = qm;

        let pool;
        if (qm === 'progressions') {
            const activeProgs = this.customProgressions.filter(p => p.isActive !== false);
            if (activeProgs.length === 0) {
                alert('少なくとも1つの進行を有効にしてください。');
                return false;
            }
            const progChordIds = [...new Set(activeProgs.flatMap(p => p.chords))];
            pool = progChordIds.map(id => this.customChords.find(c => c.id === id)).filter(Boolean);
            // Sort buttons C → B chromatically, then alphabetically within the same root
            const rootOrder = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 };
            const getRoot = n => (n.length >= 2 && (n[1] === '#' || n[1] === 'b')) ? n.slice(0, 2) : n.slice(0, 1);
            pool.sort((a, b) => {
                const ra = rootOrder[getRoot(a.name)] ?? 99;
                const rb = rootOrder[getRoot(b.name)] ?? 99;
                return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
            });
            if (pool.length === 0) {
                alert('進行に登録されたコードが見つかりません。コードを再登録してください。');
                return false;
            }
        } else {
            if (activeChords.length === 0) {
                alert('少なくとも1つのコードを選択してください。');
                return false;
            }
            pool = activeChords;
        }

        const activeNames = pool.map(c => c.name).join(', ');
        const desc = (activeNames ? activeNames + ' / ' : '') + countVal + 'コード';

        const prev = this.stageConfig[tid] || {};
        this.stageConfig[tid] = {
            ...prev,
            pool,
            count: countVal,
            isChord: true,
            isCustomChord: true,
            chordVoicing: prev.chordVoicing || [0, 1, 2],
            proQuestionMode: qm,
            label: 'Pro Stage',
            description: desc
        };
        if (prev.customName) {
            this.stageConfig[tid].customName = prev.customName;
        }
        return true;
    }

    /**
     * stageConfig のコード Pro 用 pool（カスタムは {id} オブジェクト、既定199はコード名文字列）を
     * 現在の customChords から辿れるオブジェクト配列にそろえる。
     */
    resolveChordProPoolToObjects(cfg) {
        if (!cfg || !cfg.pool || !cfg.pool.length) return [];
        const first = cfg.pool[0];
        if (typeof first === 'object' && first !== null && first.id != null) {
            return cfg.pool.map((c) => this.customChords.find((cc) => cc.id === c.id)).filter(Boolean);
        }
        return cfg.pool.map((name) => this.customChords.find((cc) => cc.name === name)).filter(Boolean);
    }

    /** 保存済み設定をコード Pro モーダルに反映（pool はコードオブジェクトの配列） */
    fillProChordUIFromConfig(cfg) {
        if (!cfg || !cfg.pool) return;
        const resolved = this.resolveChordProPoolToObjects(cfg);
        const poolIds = new Set(resolved.map((c) => c.id));
        this.customChords.forEach((ch) => {
            ch.isActive = poolIds.has(ch.id);
        });
        const cs = document.getElementById('pro-chord-count-slider');
        const cv = document.getElementById('pro-chord-count-value');
        const cnt = cfg.count != null ? cfg.count : 4;
        if (cs) cs.value = String(cnt);
        if (cv) cv.textContent = String(cnt);
        const qm = cfg.proQuestionMode || 'chords';
        this.proQuestionMode = qm;
        document.querySelectorAll('input[name="pro-question-mode"]').forEach((r) => {
            r.checked = r.value === qm;
        });
        this.updateProChordModeDependentUi(qm);
    }

    cancelProChordSettingsModal() {
        if (this._proChordUiSnapshot) {
            this._proChordUiSnapshot.forEach(({ id, isActive }) => {
                const ch = this.customChords.find(c => c.id === id);
                if (ch) ch.isActive = isActive;
            });
            this._proChordUiSnapshot = null;
            this.renderCustomChordList();
        }
        this._proChordModalTargetStageId = null;
        if (this.proChordSettingsModal) this.proChordSettingsModal.classList.add('hidden');
    }

    startProChordGame() {
        if (!this.applyProChordSettingsFromUI()) return;
        if (this.proChordSettingsModal) {
            this.proChordSettingsModal.classList.add('hidden');
        }
        if (!isPitchTrainerPro()) {
            this.startGame(199, { standardProPreview: true });
            return;
        }
        this.startGame(199);
    }

    confirmProChordSettings() {
        let targetStage = 199;
        if (this._proChordModalTargetStageId != null && isProChordStageId(this._proChordModalTargetStageId)) {
            targetStage = this._proChordModalTargetStageId;
        } else if (this.isPlaying && isProChordStageId(this.stage) && this.stage !== 199) {
            targetStage = this.stage;
        }
        this._proChordModalTargetStageId = null;
        if (!this.applyProChordSettingsFromUI(targetStage)) return;
        this._proChordUiSnapshot = null;
        if (isStagingProSlotsFeature() && targetStage !== 199) {
            this.saveStagingChordSlotsToStorage();
        }
        if (this.proChordSettingsModal) {
            this.proChordSettingsModal.classList.add('hidden');
        }
        if (!isPitchTrainerPro()) {
            this.startGame(199, { standardProPreview: true });
            return;
        }
        const inGame = this.isPlaying && isProChordStageId(this.stage);
        const fromSlotEditorOnly =
            !inGame &&
            targetStage >= STAGING_PRO_CHORD_SLOT_MIN &&
            targetStage <= STAGING_PRO_CHORD_SLOT_MAX;
        if (fromSlotEditorOnly) {
            this.renderStagingChordSlotButtons();
            return;
        }
        const level = isProChordStageId(this.stage) ? this.stage : 199;
        this.startGame(level, { preserveProgress: inGame });
    }

    resetProChordSettingsToDefaults() {
        document.querySelectorAll('input[name="pro-question-mode"]').forEach(r => {
            r.checked = r.value === 'chords';
        });
        this.proQuestionMode = 'chords';
        this.updateProChordModeDependentUi('chords');
        const cs = document.getElementById('pro-chord-count-slider');
        const cv = document.getElementById('pro-chord-count-value');
        if (cs) cs.value = '4';
        if (cv) cv.textContent = '4';
        if (confirm('カスタムコード・進行のリストも、公式の初期セットに戻しますか？\n（いいえ＝出題モードとコード数だけ戻します）')) {
            this.loadDefaultCustomChords();
            this.saveCustomData();
            this.renderCustomChordList();
            if (this.renderCustomProgressionList) this.renderCustomProgressionList();
        }
    }

    getDegreeName(note) {
        const degreeMap = {
            'C': '1', 'C#': '♭2', 'D': '2', 'D#': '♭3', 'E': '3', 'F': '4',
            'F#': '♭5', 'G': '5', 'G#': '♭6', 'A': '6', 'A#': '♭7', 'B': '7'
        };
        return degreeMap[note] || note;
    }

    getSolfegeName(note) {
        return this.noteToSolfege[note] || note;
    }

    loadProMelodyAccidentalPref() {
        try {
            const v = localStorage.getItem('pitchTrainerProAccidentalDisplay');
            if (v === 'flat' || v === 'sharp') this.proAccidentalDisplay = v;
        } catch (e) { /* ignore */ }
    }

    saveProMelodyAccidentalPref() {
        try {
            localStorage.setItem('pitchTrainerProAccidentalDisplay', this.proAccidentalDisplay);
        } catch (e) { /* ignore */ }
    }

    /** Pro用: 音名表示（C# または D♭） */
    getProNoteLetterDisplay(note) {
        if (!note || !note.includes('#')) return note;
        if (this.proAccidentalDisplay === 'flat') {
            return this.proSharpToFlatLetter[note] || note;
        }
        return note;
    }

    /** Pro用: 階名表示（シャープ系 or フラット系） */
    getProSolfegeDisplay(note) {
        if (this.proAccidentalDisplay === 'flat' && this.proSolfegeFlatBySharpNote[note]) {
            return this.proSolfegeFlatBySharpNote[note];
        }
        return this.getSolfegeName(note);
    }

    /**
     * メロディ1音分を不正解メッセージ用の文字列にする。
     * 2オクターブ時は item が { note, octaveOffset } になるため、note 名を取り出してから表記変換する。
     */
    formatMelodySequenceItemForFeedback(item, cfg) {
        let noteName;
        let octaveOffset = 0;
        if (typeof item === 'object' && item !== null && item.note) {
            noteName = item.note;
            octaveOffset = item.octaveOffset || 0;
        } else if (typeof item === 'string') {
            noteName = item;
        } else {
            return String(item);
        }
        let label;
        if (isProMelodyStageId(this.stage) && cfg.answerMethod === 'degree') {
            label = this.getDegreeName(noteName);
        } else if (isProMelodyStageId(this.stage) && cfg.answerMethod === 'solfege') {
            label = this.getProSolfegeDisplay(noteName);
        } else if (isProMelodyStageId(this.stage) && cfg.answerMethod === 'note') {
            label = this.getProNoteLetterDisplay(noteName);
        } else if (this.notationStyle === 'degree') {
            label = this.getDegreeName(noteName);
        } else {
            label = this.noteToSolfege[noteName] || noteName;
        }
        if (cfg.is2Octave && typeof item === 'object' && item !== null && item.note !== undefined) {
            label += octaveOffset === 0 ? '（下）' : '（上）';
        }
        return label;
    }

    syncProAccidentalToggleUi() {
        const acc = document.getElementById('pro-accidental-toggle');
        if (acc) acc.checked = this.proAccidentalDisplay === 'flat';
    }

    refreshProNoteToggleLabels() {
        const methodEl = document.getElementById('pro-answer-method');
        if (!methodEl) return;
        const method = methodEl.value || 'solfege';
        const modal = document.getElementById('screen-pro-settings');
        const scope = modal || document;
        scope.querySelectorAll('.note-toggle-wrapper').forEach((wrapper) => {
            const checkbox = wrapper.querySelector('.note-toggle');
            const noteNameLabel = wrapper.querySelector('.note-name');
            const degreeLabel = wrapper.querySelector('.degree-label');
            if (checkbox && noteNameLabel) {
                const note = checkbox.getAttribute('data-note');
                if (!note) return;
                if (method === 'degree') {
                    noteNameLabel.textContent = this.getDegreeName(note);
                } else if (method === 'solfege') {
                    noteNameLabel.textContent = this.getProSolfegeDisplay(note);
                } else {
                    noteNameLabel.textContent = this.getProNoteLetterDisplay(note);
                }
            }
            if (degreeLabel) degreeLabel.style.display = 'none';
        });
    }

    /** Proメロディ設定を stageConfig に反映。失敗時 false。targetStageId 省略時は 99 */
    applyProMelodySettingsFromUI(targetStageId) {
        const tid = targetStageId !== undefined ? targetStageId : 99;
        const modal = document.getElementById('screen-pro-settings');
        const is2Octave = document.getElementById('pro-2octave-toggle') ? document.getElementById('pro-2octave-toggle').checked : false;
        let selectedNotes;
        if (is2Octave) {
            selectedNotes = [];
            if (modal) {
                modal.querySelectorAll('.note-toggle:checked').forEach((t) => {
                    const o = parseInt(t.dataset.octaveOffset || '0', 10);
                    selectedNotes.push({ note: t.dataset.note, octaveOffset: o });
                });
            }
        } else {
            selectedNotes = [];
            if (modal) {
                modal.querySelectorAll('.pro-melody-octave-block[data-octave-index="0"] .note-toggle:checked').forEach((t) => {
                    selectedNotes.push(t.dataset.note);
                });
            }
        }

        if (selectedNotes.length === 0) {
            alert('少なくとも1つの音を選択してください。');
            return false;
        }

        const count = parseInt(document.getElementById('pro-count-slider').value) || 4;
        const isPianoLayout = document.getElementById('pro-keyboard-layout-toggle') ? document.getElementById('pro-keyboard-layout-toggle').checked : false;
        const answerMethod = document.getElementById('pro-answer-method').value || 'note';
        const accEl = document.getElementById('pro-accidental-toggle');
        if (accEl) {
            this.proAccidentalDisplay = accEl.checked ? 'flat' : 'sharp';
        }
        this.saveProMelodyAccidentalPref();

        const unitLabel = is2Octave ? '鍵' : '音';
        const desc = selectedNotes.length + unitLabel + ' / ' + count + '問' + (is2Octave ? ' (2Oct)' : '');
        const prev = this.stageConfig[tid] || {};
        this.stageConfig[tid] = {
            ...prev,
            pool: selectedNotes,
            count,
            is2Octave,
            isPianoLayout,
            answerMethod,
            description: desc,
            label: 'Pro Stage'
        };
        if (prev.customName) {
            this.stageConfig[tid].customName = prev.customName;
        }
        return true;
    }

    startProGame() {
        if (!this.applyProMelodySettingsFromUI()) return;
        if (this.proSettingsModal) this.proSettingsModal.classList.add('hidden');
        if (!isPitchTrainerPro()) {
            this.startGame(99, { standardProPreview: true });
            return;
        }
        this.startGame(99);
    }

    confirmProMelodySettings() {
        let targetStage = 99;
        if (this._proMelodyModalTargetStageId != null && isProMelodyStageId(this._proMelodyModalTargetStageId)) {
            targetStage = this._proMelodyModalTargetStageId;
        } else if (this.isPlaying && isProMelodyStageId(this.stage) && this.stage !== 99) {
            targetStage = this.stage;
        }
        this._proMelodyModalTargetStageId = null;
        if (!this.applyProMelodySettingsFromUI(targetStage)) return;
        if (isStagingProSlotsFeature() && targetStage !== 99) {
            this.saveStagingMelodySlotsToStorage();
        }
        if (this.proSettingsModal) this.proSettingsModal.classList.add('hidden');
        if (!isPitchTrainerPro()) {
            this.startGame(99, { standardProPreview: true });
            return;
        }
        const inGame = this.isPlaying && isProMelodyStageId(this.stage);
        const fromSlotEditorOnly =
            !inGame &&
            targetStage >= STAGING_PRO_MELODY_SLOT_MIN &&
            targetStage <= STAGING_PRO_MELODY_SLOT_MAX;
        if (fromSlotEditorOnly) {
            this.renderStagingMelodySlotButtons();
            return;
        }
        const level = isProMelodyStageId(this.stage) ? this.stage : 99;
        this.startGame(level, { preserveProgress: inGame });
    }

    /** Staging: 保存済みメロディスロットの Pro 設定を開く（STAGE選択から） */
    openStagingSlotProMelodyEditor(slotId) {
        if (!isStagingProSlotsFeature()) return;
        if (!this.proSettingsModal || !this.stageConfig[slotId]) return;
        this._proMelodyModalTargetStageId = slotId;
        this.syncProAccidentalToggleUi();
        this.fillProMelodyUIFromConfig(this.stageConfig[slotId]);
        this.refreshProNoteToggleLabels();
        this.proSettingsModal.classList.remove('hidden');
    }

    /** Staging: 保存済みメロディスロットを削除 */
    deleteStagingMelodySlot(slotId) {
        if (!isStagingProSlotsFeature()) return;
        if (slotId < STAGING_PRO_MELODY_SLOT_MIN || slotId > STAGING_PRO_MELODY_SLOT_MAX) return;
        if (!this.stageConfig[slotId]) return;
        showStagingDeleteConfirmModal().then((ok) => {
            if (!ok) return;
            delete this.stageConfig[slotId];
            this._stagingMelodySlotOrder = (this._stagingMelodySlotOrder || []).filter((x) => x !== slotId);
            this.saveStagingMelodySlotsToStorage();
            this.renderStagingMelodySlotButtons();
        });
    }

    /** Staging: 保存済みメロディスロットを別IDに複製 */
    duplicateStagingMelodySlot(slotId) {
        if (!isStagingProSlotsFeature()) return;
        if (slotId < STAGING_PRO_MELODY_SLOT_MIN || slotId > STAGING_PRO_MELODY_SLOT_MAX) return;
        const src = this.stageConfig[slotId];
        if (!src || !src.pool) return;
        const nextId = this.findNextFreeStagingMelodySlotId();
        if (nextId === null) {
            alert('これ以上追加できません（上限' + (STAGING_PRO_MELODY_SLOT_MAX - STAGING_PRO_MELODY_SLOT_MIN + 1) + '件）。');
            return;
        }
        const baseLabel = src.customName || ('PROカスタム' + (slotId - STAGING_PRO_MELODY_SLOT_MIN + 1));
        const defaultName = baseLabel + ' のコピー';
        showStagingStageNameModal({
            title: '複製したSTAGEの名前',
            defaultValue: defaultName,
            hint: '空欄なら「' + defaultName + '」になります'
        }).then((input) => {
            if (input === null) return;
            const name = String(input).trim() !== '' ? String(input).trim() : defaultName;
            this.stageConfig[nextId] = {
                pool: cloneProMelodyPool(src.pool),
                count: src.count,
                is2Octave: !!src.is2Octave,
                isPianoLayout: src.isPianoLayout !== false,
                answerMethod: src.answerMethod || 'note',
                description: src.description || '',
                label: 'Pro Stage',
                customName: name
            };
            this._stagingMelodySlotOrder = (this._stagingMelodySlotOrder || []).filter((x) => x !== nextId);
            this._stagingMelodySlotOrder.push(nextId);
            this.saveStagingMelodySlotsToStorage();
            this.renderStagingMelodySlotButtons();
        });
    }

    fillProMelodyUIFromConfig(cfg) {
        if (!cfg || !cfg.pool) return;
        const modal = document.getElementById('screen-pro-settings');
        if (modal) {
            modal.querySelectorAll('.note-toggle').forEach((t) => { t.checked = false; });
        }
        const t2 = document.getElementById('pro-2octave-toggle');
        if (t2) t2.checked = !!cfg.is2Octave;
        this.updateProMelody2OctaveToggleLayers();
        if (modal) {
            if (cfg.is2Octave) {
                if (isProMelody2OctavePoolLegacy(cfg.pool)) {
                    cfg.pool.forEach((note) => {
                        [0, 1].forEach((o) => {
                            const el = modal.querySelector(
                                '.note-toggle[data-note="' + note + '"][data-octave-offset="' + o + '"]'
                            );
                            if (el) el.checked = true;
                        });
                    });
                } else {
                    cfg.pool.forEach((p) => {
                        const note = typeof p === 'string' ? p : p.note;
                        const o = typeof p === 'object' && p !== null && p.octaveOffset != null ? p.octaveOffset : 0;
                        const el = modal.querySelector(
                            '.note-toggle[data-note="' + note + '"][data-octave-offset="' + o + '"]'
                        );
                        if (el) el.checked = true;
                    });
                }
            } else {
                cfg.pool.forEach((entry) => {
                    const note = typeof entry === 'string' ? entry : entry.note;
                    const el = modal.querySelector(
                        '.note-toggle[data-note="' + note + '"][data-octave-offset="0"]'
                    );
                    if (el) el.checked = true;
                });
            }
        }
        const slider = document.getElementById('pro-count-slider');
        const valSpan = document.getElementById('pro-count-value');
        if (slider) slider.value = String(cfg.count != null ? cfg.count : 4);
        if (valSpan) valSpan.textContent = String(cfg.count != null ? cfg.count : 4);
        const t3 = document.getElementById('pro-keyboard-layout-toggle');
        if (t3) t3.checked = cfg.isPianoLayout !== false;
        this.updateProNoteTogglesKeyboardLayoutClass();
        const am = document.getElementById('pro-answer-method');
        if (am) {
            am.value = cfg.answerMethod || 'note';
            am.dispatchEvent(new Event('change'));
        }
    }

    /** 鍵盤レイアウトOFF時は「使用する音」をゲーム画面と同様の一覧（丸ボタン・音階順）に切り替える */
    updateProNoteTogglesKeyboardLayoutClass() {
        const kb = document.getElementById('pro-keyboard-layout-toggle');
        const pianoOn = !!(kb && kb.checked);
        const modal = document.getElementById('screen-pro-settings');
        const root = modal
            ? modal.querySelector('#pro-note-toggles-container')
            : document.getElementById('pro-note-toggles-container');
        if (!root) return;
        root.classList.toggle('pro-note-toggles--list', !pianoOn);
    }

    updateProMelody2OctaveToggleLayers() {
        const cb = document.getElementById('pro-2octave-toggle');
        const on = !!(cb && cb.checked);
        const modal = document.getElementById('screen-pro-settings');
        const root = modal
            ? modal.querySelector('#pro-note-toggles-container')
            : document.getElementById('pro-note-toggles-container');
        if (!root) return;
        const cap = root.querySelector('.pro-octave-layer-caption--first');
        const block1 = root.querySelector('.pro-melody-octave-block--second');
        if (cap) {
            cap.removeAttribute('hidden');
            cap.style.display = on ? 'block' : 'none';
        }
        if (block1) {
            block1.removeAttribute('hidden');
            block1.style.display = on ? 'block' : 'none';
        }
    }

    moveStagingMelodySlotByDelta(slotId, delta) {
        if (!isStagingProSlotsFeature() || !this._stagingMelodyReorderMode || delta === 0) return;
        const order = this.getStagingMelodySlotIdsOrdered();
        const i = order.indexOf(slotId);
        if (i < 0) return;
        const j = i + delta;
        if (j < 0 || j >= order.length) return;
        const next = [...order];
        const [item] = next.splice(i, 1);
        next.splice(j, 0, item);
        this._stagingMelodySlotOrder = next;
        this.saveStagingMelodySlotsToStorage();
        this.renderStagingMelodySlotButtons();
    }

    moveStagingChordSlotByDelta(slotId, delta) {
        if (!isStagingProSlotsFeature() || !this._stagingChordReorderMode || delta === 0) return;
        const order = this.getStagingChordSlotIdsOrdered();
        const i = order.indexOf(slotId);
        if (i < 0) return;
        const j = i + delta;
        if (j < 0 || j >= order.length) return;
        const next = [...order];
        const [item] = next.splice(i, 1);
        next.splice(j, 0, item);
        this._stagingChordSlotOrder = next;
        this.saveStagingChordSlotsToStorage();
        this.renderStagingChordSlotButtons();
    }

    /** Staging: 存在するスロット ID を表示順で返す（無いIDは末尾に補完） */
    getStagingMelodySlotIdsOrdered() {
        const present = [];
        for (let id = STAGING_PRO_MELODY_SLOT_MIN; id <= STAGING_PRO_MELODY_SLOT_MAX; id++) {
            if (this.stageConfig[id] && this.stageConfig[id].pool) present.push(id);
        }
        let order = Array.isArray(this._stagingMelodySlotOrder) ? [...this._stagingMelodySlotOrder] : [];
        order = order.filter((id) => present.includes(id));
        const seen = new Set(order);
        present.forEach((id) => {
            if (!seen.has(id)) {
                seen.add(id);
                order.push(id);
            }
        });
        return order;
    }

    /** Staging: 空いているスロット ID（5001〜）を1つ返す */
    findNextFreeStagingMelodySlotId() {
        for (let id = STAGING_PRO_MELODY_SLOT_MIN; id <= STAGING_PRO_MELODY_SLOT_MAX; id++) {
            if (!this.stageConfig[id] || !this.stageConfig[id].pool) return id;
        }
        return null;
    }

    loadStagingProMelodySlots() {
        if (!isStagingProSlotsFeature()) return;
        this._stagingMelodySlotOrder = [];
        try {
            const raw = localStorage.getItem(STAGING_PRO_MELODY_SLOTS_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            let slotsArr;
            let orderIn = null;
            if (Array.isArray(parsed)) {
                slotsArr = parsed;
            } else if (parsed && Array.isArray(parsed.slots)) {
                slotsArr = parsed.slots;
                orderIn = Array.isArray(parsed.order) ? parsed.order : null;
            } else {
                return;
            }
            slotsArr.forEach((slot) => {
                if (!slot || !slot.config || !slot.id) return;
                const c = slot.config;
                this.stageConfig[slot.id] = {
                    pool: cloneProMelodyPool(c.pool),
                    count: c.count,
                    is2Octave: !!c.is2Octave,
                    isPianoLayout: c.isPianoLayout !== false,
                    answerMethod: c.answerMethod || 'note',
                    description: c.description || '',
                    label: 'Pro Stage',
                    customName: slot.name
                };
            });
            const present = [];
            for (let id = STAGING_PRO_MELODY_SLOT_MIN; id <= STAGING_PRO_MELODY_SLOT_MAX; id++) {
                if (this.stageConfig[id] && this.stageConfig[id].pool) present.push(id);
            }
            if (orderIn && orderIn.length) {
                const seen = new Set();
                const next = [];
                orderIn.forEach((id) => {
                    if (present.includes(id) && !seen.has(id)) {
                        seen.add(id);
                        next.push(id);
                    }
                });
                present.forEach((id) => {
                    if (!seen.has(id)) next.push(id);
                });
                this._stagingMelodySlotOrder = next;
            } else {
                this._stagingMelodySlotOrder = present.sort((a, b) => a - b);
            }
        } catch (e) {
            this._stagingMelodySlotOrder = [];
        }
    }

    saveStagingMelodySlotsToStorage() {
        if (!isStagingProSlotsFeature()) return;
        const slots = [];
        for (let id = STAGING_PRO_MELODY_SLOT_MIN; id <= STAGING_PRO_MELODY_SLOT_MAX; id++) {
            const c = this.stageConfig[id];
            if (!c || !c.pool) continue;
            slots.push({
                id,
                name: c.customName || ('PROカスタム' + (slots.length + 1)),
                config: {
                    pool: cloneProMelodyPool(c.pool),
                    count: c.count,
                    is2Octave: !!c.is2Octave,
                    isPianoLayout: c.isPianoLayout !== false,
                    answerMethod: c.answerMethod || 'note',
                    description: c.description || ''
                }
            });
        }
        const order = this.getStagingMelodySlotIdsOrdered();
        this._stagingMelodySlotOrder = order;
        try {
            localStorage.setItem(STAGING_PRO_MELODY_SLOTS_KEY, JSON.stringify({ slots, order }));
        } catch (e) { /* ignore */ }
    }

    addStagingMelodySlotFromCurrentConfig() {
        if (!isStagingProSlotsFeature()) return;
        const sourceId =
            this.isPlaying && isProMelodyStageId(this.stage) ? this.stage : 99;
        const base = this.stageConfig[sourceId];
        if (!base || !base.pool || base.pool.length === 0) {
            alert('Pro設定が読み取れません。');
            return;
        }
        const nextId = this.findNextFreeStagingMelodySlotId();
        if (nextId === null) {
            alert('これ以上追加できません（上限' + (STAGING_PRO_MELODY_SLOT_MAX - STAGING_PRO_MELODY_SLOT_MIN + 1) + '件）。');
            return;
        }
        let existing = 0;
        for (let id = STAGING_PRO_MELODY_SLOT_MIN; id <= STAGING_PRO_MELODY_SLOT_MAX; id++) {
            if (this.stageConfig[id] && this.stageConfig[id].pool) existing += 1;
        }
        const defaultName = 'PROカスタム' + (existing + 1);
        showStagingStageNameModal({
            title: 'STAGEの名前',
            defaultValue: defaultName,
            hint: '空欄なら「' + defaultName + '」になります'
        }).then((input) => {
            if (input === null) return;
            const name = String(input).trim() !== '' ? String(input).trim() : defaultName;
            this.stageConfig[nextId] = {
                pool: cloneProMelodyPool(base.pool),
                count: base.count,
                is2Octave: !!base.is2Octave,
                isPianoLayout: base.isPianoLayout !== false,
                answerMethod: base.answerMethod || 'note',
                description: base.description || '',
                label: 'Pro Stage',
                customName: name
            };
            this._stagingMelodySlotOrder = (this._stagingMelodySlotOrder || []).filter((x) => x !== nextId);
            this._stagingMelodySlotOrder.push(nextId);
            this.saveStagingMelodySlotsToStorage();
            this.renderStagingMelodySlotButtons();
        });
    }

    renderStagingMelodySlotButtons() {
        if (!isStagingProSlotsFeature()) return;
        const levelButtons = document.querySelector('#screen-melody .level-buttons');
        const anchor = document.getElementById('btn-level-pro');
        if (!levelButtons || !anchor) return;
        levelButtons.querySelectorAll('.staging-pro-slot-dynamic').forEach((el) => el.remove());
        document.getElementById('staging-melody-reorder-footer')?.remove();
        const wrap = document.createElement('div');
        wrap.className = 'staging-pro-slot-dynamic';
        const orderedIds = this.getStagingMelodySlotIdsOrdered();
        const orderLen = orderedIds.length;
        if (orderLen === 0) this._stagingMelodyReorderMode = false;
        orderedIds.forEach((id, orderIndex) => {
            const c = this.stageConfig[id];
            if (!c || !c.pool) return;
            const row = document.createElement('div');
            row.className = 'staging-pro-slot-row';
            row.dataset.stagingSlotId = String(id);
            const mainRow = document.createElement('div');
            mainRow.className = 'staging-slot-main-row';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-primary custom-stage-btn pro-stage-teaser staging-slot-main-btn';
            btn.dataset.stage = String(id);
            const label = c.customName || ('PROカスタム' + (id - STAGING_PRO_MELODY_SLOT_MIN + 1));
            btn.innerHTML = '<span class="staging-slot-main-label"></span>';
            btn.querySelector('.staging-slot-main-label').textContent = label;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.startGame(id);
            });
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'staging-slot-dropdown-toggle';
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-haspopup', 'true');
            toggle.setAttribute('aria-label', 'その他の操作を表示');
            toggle.title = 'その他の操作';
            toggle.innerHTML = '<span class="staging-slot-chevron" aria-hidden="true">▼</span>';
            const actions = document.createElement('div');
            actions.className = 'staging-slot-actions';
            actions.hidden = true;
            actions.setAttribute('role', 'group');
            actions.setAttribute('aria-label', 'カスタムSTAGEの操作');
            const mkAction = (emoji, title, handler, opts) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'icon-btn staging-slot-action-btn';
                b.textContent = emoji;
                b.title = title;
                b.setAttribute('aria-label', title);
                if (opts && opts.disabled) b.disabled = true;
                b.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (b.disabled) return;
                    handler();
                });
                return b;
            };
            actions.appendChild(mkAction('✏️', '名前を変更', () => {
                const cur = this.stageConfig[id].customName || label;
                showStagingStageNameModal({
                    title: 'STAGEの名前',
                    defaultValue: cur
                }).then((nv) => {
                    if (nv === null) return;
                    const nn = String(nv).trim() || cur;
                    this.stageConfig[id].customName = nn;
                    this.saveStagingMelodySlotsToStorage();
                    this.renderStagingMelodySlotButtons();
                });
            }));
            actions.appendChild(mkAction('⚙️', 'Pro設定を編集', () => {
                this.openStagingSlotProMelodyEditor(id);
            }));
            const dupBtn = document.createElement('button');
            dupBtn.type = 'button';
            dupBtn.className = 'icon-btn staging-slot-action-btn staging-slot-action-btn--duplicate';
            dupBtn.title = '複製';
            dupBtn.setAttribute('aria-label', '複製');
            const dupImg = document.createElement('img');
            dupImg.src = 'assets/icon-duplicate.png?v=1';
            dupImg.alt = '';
            dupImg.className = 'staging-slot-duplicate-icon';
            dupImg.decoding = 'async';
            dupImg.width = 20;
            dupImg.height = 20;
            dupBtn.appendChild(dupImg);
            dupBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.duplicateStagingMelodySlot(id);
            });
            actions.appendChild(dupBtn);
            actions.appendChild(mkAction('🗑️', 'このSTAGEを削除', () => {
                this.deleteStagingMelodySlot(id);
            }));
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const open = !row.classList.contains('is-open');
                row.classList.toggle('is-open', open);
                actions.hidden = !open;
                toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
                toggle.setAttribute('aria-label', open ? 'その他の操作を閉じる' : 'その他の操作を表示');
            });
            mainRow.appendChild(btn);
            mainRow.appendChild(toggle);
            row.appendChild(mainRow);
            if (isStagingProSlotsFeature() && this._stagingMelodyReorderMode) {
                const bar = document.createElement('div');
                bar.className = 'staging-slot-reorder-bar';
                const mkStep = (emoji, title, delta, disabled) => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'staging-slot-reorder-step-btn';
                    b.textContent = emoji;
                    b.title = title;
                    b.setAttribute('aria-label', title);
                    if (disabled) b.disabled = true;
                    b.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (b.disabled) return;
                        this.moveStagingMelodySlotByDelta(id, delta);
                    });
                    return b;
                };
                bar.appendChild(mkStep('▲', '上に移動', -1, orderIndex <= 0 || orderLen < 2));
                bar.appendChild(mkStep('▼', '下に移動', 1, orderIndex >= orderLen - 1 || orderLen < 2));
                row.appendChild(bar);
            }
            row.appendChild(actions);
            wrap.appendChild(row);
        });
        anchor.insertAdjacentElement('afterend', wrap);
        // テストモードのスタイル・バッジをカスタムSTAGEボタンに適用
        if (isStagingProSlotsFeature()) {
            const results = loadTestModeResults();
            wrap.querySelectorAll('.staging-slot-main-btn[data-stage]').forEach(btn => {
                const id = parseInt(btn.dataset.stage);
                if (!isNaN(id)) _applyTestModeButtonStyle(btn, 'melody', 'custom-' + id, results, testModeState.enabled);
            });
        }
        if (isStagingProSlotsFeature() && orderLen >= 1) {
            const footer = document.createElement('div');
            footer.id = 'staging-melody-reorder-footer';
            footer.className = 'staging-slot-reorder-footer';
            const modeBtn = document.createElement('button');
            modeBtn.type = 'button';
            modeBtn.className = 'btn-secondary staging-slot-reorder-mode-toggle';
            modeBtn.textContent = this._stagingMelodyReorderMode ? '完了' : '順番並び替え';
            modeBtn.setAttribute('aria-pressed', this._stagingMelodyReorderMode ? 'true' : 'false');
            modeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this._stagingMelodyReorderMode = !this._stagingMelodyReorderMode;
                this.renderStagingMelodySlotButtons();
            });
            footer.appendChild(modeBtn);
            wrap.insertAdjacentElement('afterend', footer);
        }
    }

    /** Staging: 保存済みコードスロットの Pro 設定を開く（STAGE選択から） */
    openStagingSlotProChordEditor(slotId) {
        if (!isStagingProSlotsFeature()) return;
        if (!this.proChordSettingsModal || !this.stageConfig[slotId]) return;
        this._proChordModalTargetStageId = slotId;
        this._proChordUiSnapshot = this.customChords.map(c => ({ id: c.id, isActive: c.isActive }));
        this.fillProChordUIFromConfig(this.stageConfig[slotId]);
        this.renderCustomChordList();
        if (this.renderCustomProgressionList) this.renderCustomProgressionList();
        this.proChordSettingsModal.classList.remove('hidden');
    }

    deleteStagingChordSlot(slotId) {
        if (!isStagingProSlotsFeature()) return;
        if (slotId < STAGING_PRO_CHORD_SLOT_MIN || slotId > STAGING_PRO_CHORD_SLOT_MAX) return;
        if (!this.stageConfig[slotId]) return;
        showStagingDeleteConfirmModal().then((ok) => {
            if (!ok) return;
            delete this.stageConfig[slotId];
            this._stagingChordSlotOrder = (this._stagingChordSlotOrder || []).filter((x) => x !== slotId);
            this.saveStagingChordSlotsToStorage();
            this.renderStagingChordSlotButtons();
        });
    }

    duplicateStagingChordSlot(slotId) {
        if (!isStagingProSlotsFeature()) return;
        if (slotId < STAGING_PRO_CHORD_SLOT_MIN || slotId > STAGING_PRO_CHORD_SLOT_MAX) return;
        const src = this.stageConfig[slotId];
        if (!src || !src.pool) return;
        const nextId = this.findNextFreeStagingChordSlotId();
        if (nextId === null) {
            alert('これ以上追加できません（上限' + (STAGING_PRO_CHORD_SLOT_MAX - STAGING_PRO_CHORD_SLOT_MIN + 1) + '件）。');
            return;
        }
        const baseLabel = src.customName || ('PROカスタム' + (slotId - STAGING_PRO_CHORD_SLOT_MIN + 1));
        const defaultName = baseLabel + ' のコピー';
        showStagingStageNameModal({
            title: '複製したSTAGEの名前',
            defaultValue: defaultName,
            hint: '空欄なら「' + defaultName + '」になります'
        }).then((input) => {
            if (input === null) return;
            const name = String(input).trim() !== '' ? String(input).trim() : defaultName;
            const pool = src.pool.map((c) => this.customChords.find((cc) => cc.id === c.id)).filter(Boolean);
            if (pool.length === 0) {
                alert('コード一覧から復元できません。');
                return;
            }
            this.stageConfig[nextId] = {
                pool,
                count: src.count,
                isChord: true,
                isCustomChord: true,
                chordVoicing: src.chordVoicing || [0, 1, 2],
                proQuestionMode: src.proQuestionMode || 'chords',
                description: src.description || '',
                label: 'Pro Stage',
                customName: name
            };
            this._stagingChordSlotOrder = (this._stagingChordSlotOrder || []).filter((x) => x !== nextId);
            this._stagingChordSlotOrder.push(nextId);
            this.saveStagingChordSlotsToStorage();
            this.renderStagingChordSlotButtons();
        });
    }

    getStagingChordSlotIdsOrdered() {
        const present = [];
        for (let id = STAGING_PRO_CHORD_SLOT_MIN; id <= STAGING_PRO_CHORD_SLOT_MAX; id++) {
            if (this.stageConfig[id] && this.stageConfig[id].pool && this.stageConfig[id].pool.length) present.push(id);
        }
        let order = Array.isArray(this._stagingChordSlotOrder) ? [...this._stagingChordSlotOrder] : [];
        order = order.filter((id) => present.includes(id));
        const seen = new Set(order);
        present.forEach((id) => {
            if (!seen.has(id)) {
                seen.add(id);
                order.push(id);
            }
        });
        return order;
    }

    findNextFreeStagingChordSlotId() {
        for (let id = STAGING_PRO_CHORD_SLOT_MIN; id <= STAGING_PRO_CHORD_SLOT_MAX; id++) {
            if (!this.stageConfig[id] || !this.stageConfig[id].pool || !this.stageConfig[id].pool.length) return id;
        }
        return null;
    }

    loadStagingProChordSlots() {
        if (!isStagingProSlotsFeature()) return;
        this._stagingChordSlotOrder = [];
        try {
            const raw = localStorage.getItem(STAGING_PRO_CHORD_SLOTS_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            let slotsArr;
            let orderIn = null;
            if (Array.isArray(parsed)) {
                slotsArr = parsed;
            } else if (parsed && Array.isArray(parsed.slots)) {
                slotsArr = parsed.slots;
                orderIn = Array.isArray(parsed.order) ? parsed.order : null;
            } else {
                return;
            }
            slotsArr.forEach((slot) => {
                if (!slot || !slot.config || !slot.id) return;
                const c = slot.config;
                const ids = c.poolChordIds || [];
                const pool = ids.map((id) => this.customChords.find((ch) => ch.id === id)).filter(Boolean);
                if (pool.length === 0) return;
                this.stageConfig[slot.id] = {
                    pool,
                    count: c.count != null ? c.count : 4,
                    isChord: true,
                    isCustomChord: true,
                    chordVoicing: [0, 1, 2],
                    proQuestionMode: c.proQuestionMode || 'chords',
                    description: c.description || '',
                    label: 'Pro Stage',
                    customName: slot.name
                };
            });
            const present = [];
            for (let id = STAGING_PRO_CHORD_SLOT_MIN; id <= STAGING_PRO_CHORD_SLOT_MAX; id++) {
                if (this.stageConfig[id] && this.stageConfig[id].pool && this.stageConfig[id].pool.length) present.push(id);
            }
            if (orderIn && orderIn.length) {
                const seen = new Set();
                const next = [];
                orderIn.forEach((id) => {
                    if (present.includes(id) && !seen.has(id)) {
                        seen.add(id);
                        next.push(id);
                    }
                });
                present.forEach((id) => {
                    if (!seen.has(id)) next.push(id);
                });
                this._stagingChordSlotOrder = next;
            } else {
                this._stagingChordSlotOrder = present.sort((a, b) => a - b);
            }
        } catch (e) {
            this._stagingChordSlotOrder = [];
        }
    }

    saveStagingChordSlotsToStorage() {
        if (!isStagingProSlotsFeature()) return;
        const slots = [];
        for (let id = STAGING_PRO_CHORD_SLOT_MIN; id <= STAGING_PRO_CHORD_SLOT_MAX; id++) {
            const c = this.stageConfig[id];
            if (!c || !c.pool || !c.pool.length) continue;
            slots.push({
                id,
                name: c.customName || ('PROカスタム' + (slots.length + 1)),
                config: {
                    poolChordIds: c.pool.map((ch) => ch.id),
                    count: c.count,
                    proQuestionMode: c.proQuestionMode || 'chords',
                    description: c.description || ''
                }
            });
        }
        const order = this.getStagingChordSlotIdsOrdered();
        this._stagingChordSlotOrder = order;
        try {
            localStorage.setItem(STAGING_PRO_CHORD_SLOTS_KEY, JSON.stringify({ slots, order }));
        } catch (e) { /* ignore */ }
    }

    addStagingChordSlotFromCurrentConfig() {
        if (!isStagingProSlotsFeature()) return;
        const sourceId =
            this.isPlaying && isProChordStageId(this.stage) ? this.stage : 199;
        const base = this.stageConfig[sourceId];
        if (!base || !base.pool || base.pool.length === 0) {
            alert('Pro設定が読み取れません。');
            return;
        }
        const nextId = this.findNextFreeStagingChordSlotId();
        if (nextId === null) {
            alert('これ以上追加できません（上限' + (STAGING_PRO_CHORD_SLOT_MAX - STAGING_PRO_CHORD_SLOT_MIN + 1) + '件）。');
            return;
        }
        let existing = 0;
        for (let id = STAGING_PRO_CHORD_SLOT_MIN; id <= STAGING_PRO_CHORD_SLOT_MAX; id++) {
            if (this.stageConfig[id] && this.stageConfig[id].pool && this.stageConfig[id].pool.length) existing += 1;
        }
        const defaultName = 'PROカスタム' + (existing + 1);
        showStagingStageNameModal({
            title: 'STAGEの名前',
            defaultValue: defaultName,
            hint: '空欄なら「' + defaultName + '」になります'
        }).then((input) => {
            if (input === null) return;
            const name = String(input).trim() !== '' ? String(input).trim() : defaultName;
            const pool = this.resolveChordProPoolToObjects(base);
            if (pool.length === 0) {
                alert('コード一覧から復元できません。');
                return;
            }
            this.stageConfig[nextId] = {
                pool,
                count: base.count,
                isChord: true,
                isCustomChord: true,
                chordVoicing: base.chordVoicing || [0, 1, 2],
                proQuestionMode: base.proQuestionMode || this.proQuestionMode || 'chords',
                description: base.description || '',
                label: 'Pro Stage',
                customName: name
            };
            this._stagingChordSlotOrder = (this._stagingChordSlotOrder || []).filter((x) => x !== nextId);
            this._stagingChordSlotOrder.push(nextId);
            this.saveStagingChordSlotsToStorage();
            this.renderStagingChordSlotButtons();
        });
    }

    renderStagingChordSlotButtons() {
        if (!isStagingProSlotsFeature()) return;
        const levelButtons = document.querySelector('#screen-chord .level-buttons');
        const anchor = document.getElementById('btn-level-pro-chord');
        if (!levelButtons || !anchor) return;
        levelButtons.querySelectorAll('.staging-pro-chord-slot-dynamic').forEach((el) => el.remove());
        document.getElementById('staging-chord-reorder-footer')?.remove();
        const wrap = document.createElement('div');
        wrap.className = 'staging-pro-chord-slot-dynamic';
        const orderedIds = this.getStagingChordSlotIdsOrdered();
        const orderLen = orderedIds.length;
        if (orderLen === 0) this._stagingChordReorderMode = false;
        orderedIds.forEach((id, orderIndex) => {
            const c = this.stageConfig[id];
            if (!c || !c.pool) return;
            const row = document.createElement('div');
            row.className = 'staging-pro-slot-row';
            row.dataset.stagingSlotId = String(id);
            const mainRow = document.createElement('div');
            mainRow.className = 'staging-slot-main-row';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-primary custom-stage-btn pro-stage-teaser staging-slot-main-btn';
            btn.dataset.stage = String(id);
            const label = c.customName || ('PROカスタム' + (id - STAGING_PRO_CHORD_SLOT_MIN + 1));
            btn.innerHTML = '<span class="staging-slot-main-label"></span>';
            btn.querySelector('.staging-slot-main-label').textContent = label;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.startGame(id);
            });
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'staging-slot-dropdown-toggle';
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-haspopup', 'true');
            toggle.setAttribute('aria-label', 'その他の操作を表示');
            toggle.title = 'その他の操作';
            toggle.innerHTML = '<span class="staging-slot-chevron" aria-hidden="true">▼</span>';
            const actions = document.createElement('div');
            actions.className = 'staging-slot-actions';
            actions.hidden = true;
            actions.setAttribute('role', 'group');
            actions.setAttribute('aria-label', 'カスタムSTAGEの操作');
            const mkAction = (emoji, title, handler, opts) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'icon-btn staging-slot-action-btn';
                b.textContent = emoji;
                b.title = title;
                b.setAttribute('aria-label', title);
                if (opts && opts.disabled) b.disabled = true;
                b.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (b.disabled) return;
                    handler();
                });
                return b;
            };
            actions.appendChild(mkAction('✏️', '名前を変更', () => {
                const cur = this.stageConfig[id].customName || label;
                showStagingStageNameModal({
                    title: 'STAGEの名前',
                    defaultValue: cur
                }).then((nv) => {
                    if (nv === null) return;
                    const nn = String(nv).trim() || cur;
                    this.stageConfig[id].customName = nn;
                    this.saveStagingChordSlotsToStorage();
                    this.renderStagingChordSlotButtons();
                });
            }));
            actions.appendChild(mkAction('⚙️', 'Pro設定を編集', () => {
                this.openStagingSlotProChordEditor(id);
            }));
            const dupBtn = document.createElement('button');
            dupBtn.type = 'button';
            dupBtn.className = 'icon-btn staging-slot-action-btn staging-slot-action-btn--duplicate';
            dupBtn.title = '複製';
            dupBtn.setAttribute('aria-label', '複製');
            const dupImg = document.createElement('img');
            dupImg.src = 'assets/icon-duplicate.png?v=1';
            dupImg.alt = '';
            dupImg.className = 'staging-slot-duplicate-icon';
            dupImg.decoding = 'async';
            dupImg.width = 20;
            dupImg.height = 20;
            dupBtn.appendChild(dupImg);
            dupBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.duplicateStagingChordSlot(id);
            });
            actions.appendChild(dupBtn);
            actions.appendChild(mkAction('🗑️', 'このSTAGEを削除', () => {
                this.deleteStagingChordSlot(id);
            }));
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const open = !row.classList.contains('is-open');
                row.classList.toggle('is-open', open);
                actions.hidden = !open;
                toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
                toggle.setAttribute('aria-label', open ? 'その他の操作を閉じる' : 'その他の操作を表示');
            });
            mainRow.appendChild(btn);
            mainRow.appendChild(toggle);
            row.appendChild(mainRow);
            if (isStagingProSlotsFeature() && this._stagingChordReorderMode) {
                const bar = document.createElement('div');
                bar.className = 'staging-slot-reorder-bar';
                const mkStep = (emoji, title, delta, disabled) => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'staging-slot-reorder-step-btn';
                    b.textContent = emoji;
                    b.title = title;
                    b.setAttribute('aria-label', title);
                    if (disabled) b.disabled = true;
                    b.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (b.disabled) return;
                        this.moveStagingChordSlotByDelta(id, delta);
                    });
                    return b;
                };
                bar.appendChild(mkStep('▲', '上に移動', -1, orderIndex <= 0 || orderLen < 2));
                bar.appendChild(mkStep('▼', '下に移動', 1, orderIndex >= orderLen - 1 || orderLen < 2));
                row.appendChild(bar);
            }
            row.appendChild(actions);
            wrap.appendChild(row);
        });
        anchor.insertAdjacentElement('afterend', wrap);
        // テストモードのスタイル・バッジをカスタムSTAGEボタンに適用
        if (isStagingProSlotsFeature()) {
            const results = loadTestModeResults();
            wrap.querySelectorAll('.staging-slot-main-btn[data-stage]').forEach(btn => {
                const id = parseInt(btn.dataset.stage);
                if (!isNaN(id)) _applyTestModeButtonStyle(btn, 'chord', 'custom-' + id, results, testModeState.enabled);
            });
        }
        if (isStagingProSlotsFeature() && orderLen >= 1) {
            const footer = document.createElement('div');
            footer.id = 'staging-chord-reorder-footer';
            footer.className = 'staging-slot-reorder-footer';
            const modeBtn = document.createElement('button');
            modeBtn.type = 'button';
            modeBtn.className = 'btn-secondary staging-slot-reorder-mode-toggle';
            modeBtn.textContent = this._stagingChordReorderMode ? '完了' : '順番並び替え';
            modeBtn.setAttribute('aria-pressed', this._stagingChordReorderMode ? 'true' : 'false');
            modeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this._stagingChordReorderMode = !this._stagingChordReorderMode;
                this.renderStagingChordSlotButtons();
            });
            footer.appendChild(modeBtn);
            wrap.insertAdjacentElement('afterend', footer);
        }
    }

    resetProMelodySettingsToDefaults() {
        const modal = document.getElementById('screen-pro-settings');
        const t2 = document.getElementById('pro-2octave-toggle');
        if (t2) t2.checked = false;
        this.updateProMelody2OctaveToggleLayers();
        if (modal) {
            modal.querySelectorAll('.note-toggle').forEach((t) => { t.checked = false; });
        }
        const presetSelect = document.getElementById('scale-preset-select');
        if (presetSelect) {
            presetSelect.value = 'major';
            this.applyScalePreset('major');
        }
        const slider = document.getElementById('pro-count-slider');
        const valSpan = document.getElementById('pro-count-value');
        if (slider) slider.value = '4';
        if (valSpan) valSpan.textContent = '4';
        const t3 = document.getElementById('pro-keyboard-layout-toggle');
        if (t3) t3.checked = true;
        this.updateProNoteTogglesKeyboardLayoutClass();
        const am = document.getElementById('pro-answer-method');
        if (am) {
            am.value = 'solfege';
            am.dispatchEvent(new Event('change'));
        }
        const acc = document.getElementById('pro-accidental-toggle');
        if (acc) acc.checked = false;
        this.proAccidentalDisplay = 'sharp';
        this.saveProMelodyAccidentalPref();
        this.refreshProNoteToggleLabels();
    }

    openInGameProSettings() {
        if (isProMelodyStageId(this.stage) && this.proSettingsModal) {
            this._proMelodyModalTargetStageId = null;
            this.syncProAccidentalToggleUi();
            if (this.stage !== 99 && this.stageConfig[this.stage]) {
                this.fillProMelodyUIFromConfig(this.stageConfig[this.stage]);
            } else {
                this.updateProMelody2OctaveToggleLayers();
                this.updateProNoteTogglesKeyboardLayoutClass();
            }
            this.refreshProNoteToggleLabels();
            this.proSettingsModal.classList.remove('hidden');
        } else if (isProChordStageId(this.stage) && this.proChordSettingsModal) {
            this._proChordModalTargetStageId = null;
            this._proChordUiSnapshot = this.customChords.map(c => ({ id: c.id, isActive: c.isActive }));
            if (this.stageConfig[this.stage]) {
                this.fillProChordUIFromConfig(this.stageConfig[this.stage]);
            }
            this.renderCustomChordList();
            if (this.renderCustomProgressionList) this.renderCustomProgressionList();
            this.proChordSettingsModal.classList.remove('hidden');
        }
    }

    updateInGameProSettingsButton() {
        const btn = document.getElementById('in-game-pro-settings-btn');
        if (!btn) return;
        const show = this.isPlaying && (isProMelodyStageId(this.stage) || isProChordStageId(this.stage));
        btn.style.display = show ? 'flex' : 'none';
        this.updateStagingAddSlotUi();
    }

    updateStagingAddSlotUi() {
        const wrap = document.getElementById('staging-add-slot-wrap');
        if (!wrap) return;
        const show = isStagingProSlotsFeature() && this.isPlaying &&
            (isProMelodyStageId(this.stage) || isProChordStageId(this.stage));
        wrap.style.display = show ? 'flex' : 'none';
        wrap.hidden = !show;
        const headerWrap = wrap.closest('.header-game-settings-wrap');
        if (headerWrap) headerWrap.classList.toggle('pro-custom-active', show);
    }

    updateOctave(delta) {
        const newOctave = this.baseOctave + delta;
        if (newOctave >= 2 && newOctave <= 5) {
            this.baseOctave = newOctave;
            if (this.currentOctaveEl) {
                this.currentOctaveEl.textContent = this.baseOctave;
            }
            this.saveSettings();
        }
    }

    updateKey(offset) {
        this.keyOffset = offset;
        if (this.keySelector) {
            this.keySelector.value = offset;
        }
        this.saveSettings();
    }

    /** キーランダムON時: キー欄は「ランダム」表示。「問題前の音階」はONなら音階・OFFなら主音のみ（有効は Pro のみ） */
    updateKeyRandomDependentUi() {
        const display = document.getElementById('key-random-display');
        const sel = this.keySelector;
        const scaleToggle = document.getElementById('scale-toggle');
        const keyRandomToggle = document.getElementById('key-random-toggle');
        const keyRandomRow = keyRandomToggle?.closest('.setting-item');
        const scaleRow = scaleToggle?.closest('.setting-item');
        const keyRow = sel?.closest('.setting-item');
        const pro = isPitchTrainerPro();

        if (!pro) {
            this.keyRandomMode = false;
        }
        if (keyRandomRow) {
            keyRandomRow.classList.toggle('setting-item--key-random-pro-locked', !pro);
        }
        if (keyRandomToggle && !pro) {
            keyRandomToggle.checked = false;
        }

        if (isKeyRandomGameplayActive(this)) {
            if (display) display.classList.remove('hidden');
            if (sel) {
                sel.classList.add('hidden');
                sel.disabled = true;
                sel.setAttribute('aria-disabled', 'true');
            }
            if (scaleToggle) {
                scaleToggle.checked = this.scaleEnabled;
                scaleToggle.disabled = false;
                scaleToggle.removeAttribute('aria-disabled');
            }
            scaleRow?.classList.remove('setting-item--key-random-locked');
            keyRow?.classList.add('setting-item--key-random-locked');
        } else {
            if (display) display.classList.add('hidden');
            if (sel) {
                sel.classList.remove('hidden');
                sel.disabled = !pro;
                sel.setAttribute('aria-disabled', pro ? 'false' : 'true');
            }
            if (scaleToggle) {
                scaleToggle.checked = this.scaleEnabled;
                scaleToggle.disabled = false;
                scaleToggle.removeAttribute('aria-disabled');
            }
            scaleRow?.classList.remove('setting-item--key-random-locked');
            keyRow?.classList.remove('setting-item--key-random-locked');
        }
    }

    /** 問題再生・音階・回答プレビュー用のキー（キーランダム時はラウンドごとの値） */
    getPlaybackKeyOffset() {
        if (isKeyRandomGameplayActive(this) && this.isPlaying) {
            return this.roundKeyOffset;
        }
        return this.keyOffset;
    }

    updateInstrument(instrument) {
        this.instrument = instrument;
        this.audio.currentInstrument = instrument;
        if (this.instrumentSelector) {
            this.instrumentSelector.value = instrument;
        }
        this.saveSettings();
    }

    updateNotation(style) {
        this.notationStyle = style;
        if (this.noteBtns && this.noteBtns.length > 0) {
            this.noteBtns.forEach(btn => {
                const noteData = btn.dataset.note;
                if (!noteData) return;
                // Never touch buttons when playing Pro メロディ with custom answer methods (Solfege, Degree)
                const proMelCfg = isProMelodyStageId(this.stage) ? this.stageConfig[this.stage] : null;
                if (proMelCfg && ['solfege', 'degree'].includes(proMelCfg.answerMethod)) {
                    return;
                }
                if (style === 'doremi') {
                    btn.textContent = this.doremiMap[noteData] || noteData;
                } else if (style === 'degree') {
                    btn.textContent = this.getDegreeName(noteData);
                } else {
                    btn.textContent = noteData;
                }
            });
        }
        // Update chord buttons too
        if (this.chordBtns && this.chordBtns.length > 0) {
            this.chordBtns.forEach(btn => {
                const chordData = btn.dataset.chord;
                if (!chordData) return; // skip custom chord buttons
                if (style === 'degree') {
                    btn.textContent = this.chordDegreeMap[chordData] || chordData;
                } else {
                    btn.textContent = chordData;
                }
            });
        }
        if (this.notationSelector) {
            this.notationSelector.value = style;
        }
        this.saveSettings();
    }

    /**
     * 設定の「音を確認」ボタン
     * 現在の楽器・キー・オクターブ・余韻・問題スピードを反映してC音を再生する
     */
    async previewSound() {
        const btn = document.getElementById('preview-sound');

        // 再生中は連打防止
        if ((btn && btn.classList.contains('playing'))) return;

        await this.audio.resumeContext();

        // 問題再生・回答プレビューと同じ 0.8/noteSpeed（Pro のスピード設定と一致）
        const noteName = 'C' + this.baseOctave;
        const previewDuration = 0.8 / this.noteSpeed;

        this.audio.playNote(noteName, previewDuration, 0, this.keyOffset);

        // ボタンをアニメーション状態に
        if (btn) {
            btn.classList.add('playing');
            btn.textContent = '🎵 再生中...';
            // 余韻が終わったらボタンを戻す
            const totalMs = (previewDuration + this.audio.sustainTime) * 1000 + 100;
            setTimeout(() => {
                btn.classList.remove('playing');
                btn.textContent = '🎵 音を確認';
            }, totalMs);
        }
    }

    resetToDefaults() {
        this.updateOctave(3 - this.baseOctave); // Reset to 3
        this.updateKey(0); // Reset to C
        this.updateInstrument('acoustic_guitar'); // Reset to acoustic guitar
        this.updateNotation('doremi'); // Reset to DoReMi
        // 基準周波数をデフォルト(440Hz)にリセット
        this.audio.setBaseHz(440);
        const hzSlider = document.getElementById('hz-slider');
        const hzSpan = document.getElementById('current-hz') || document.getElementById('hz-value');
        if (hzSlider) hzSlider.value = '440';
        if (hzSpan) hzSpan.textContent = '440';
        // 余韻をデフォルト(0.5秒)にリセット
        this.audio.sustainTime = 0.5;
        const sustainSlider = document.getElementById('sustain-slider');
        const sustainValue = document.getElementById('sustain-value');
        if (sustainSlider) sustainSlider.value = '0.5';
        if (sustainValue) sustainValue.textContent = '0.5';
        // 音階をデフォルト(ON)にリセット
        this.scaleEnabled = true;
        const scaleToggle = document.getElementById('scale-toggle');
        if (scaleToggle) scaleToggle.checked = true;
        // スピードをデフォルト(1.0x)にリセット
        this.noteSpeed = 1.0;
        const speedSlider = document.getElementById('speed-slider');
        const speedValue = document.getElementById('speed-value');
        if (speedSlider) speedSlider.value = '1.0';
        if (speedValue) speedValue.textContent = '1.0';
        this.keyRandomMode = false;
        const keyRandomToggle = document.getElementById('key-random-toggle');
        if (keyRandomToggle) keyRandomToggle.checked = false;
        this._scaleEnabledBeforeKeyRandom = undefined;
        this.updateKeyRandomDependentUi();
        this.saveSettings();
    }


    updateStats() {
        if (this.comboEl) this.comboEl.textContent = this.streak;
    }

    startGame(level, options = {}) {
        if (isPitchTrainerBeta()) {
            const okMelody = level >= 1 && level <= 4;
            const okChord = level >= 101 && level <= 104;
            const okStaging =
                isStagingProSlotsFeature() &&
                (isProMelodyStageId(level) || isProChordStageId(level));
            if (!okMelody && !okChord && !okStaging) return;
        }
        // テストモードが有効で、かつ強制通常モードでない場合はテストランを開始
        if (testModeState.enabled && !options._forceNormal) {
            startTestModeRun(this, level);
        } else {
            // 通常モード（またはテストモード off / 練習モードで確認）
            if (testModeState.active) stopTestModeRun(this);
        }
        this.audio.stopAllScheduledSounds();
        const preserveProgress = options.preserveProgress === true;
        this.stage = level;
        this.overlay.classList.add('hidden');
        this.hideSettingsModal();
        if (!preserveProgress) {
            this.score = 0;
            this.streak = 0;
            this.previousSequenceKeys = []; // Reset for new game session
            this.updateStats();
        }
        this.isPlaying = true;
        this.isRoundOver = false;
        this.standardProPreviewMode = options.standardProPreview === true;

        const noticeEl = document.getElementById('standard-pro-preview-notice');
        if (noticeEl) {
            noticeEl.style.display = this.standardProPreviewMode ? 'block' : 'none';
        }

        const cfg = this.stageConfig[this.stage] || this.stageConfig[3];
        const pool = cfg.pool;

        if (isProChordStageId(this.stage) && cfg.proQuestionMode) {
            this.proQuestionMode = cfg.proQuestionMode;
        }

        // Update Stage Info Display
        const stageInfo = this.stageConfig[this.stage];
        const stageNameEl = document.getElementById('current-stage-name');
        const stageDescEl = document.getElementById('current-stage-desc');
        const stageDisplay = document.getElementById('stage-info-display');
        const appTitle = document.querySelector('h1');

        if (stageInfo && stageDisplay && stageNameEl && stageDescEl) {
            let stageTitle;
            if (this.stage === 199) {
                stageTitle = 'Pro Stage';
            } else if (this.stage === 99) {
                stageTitle = 'Pro Stage';
            } else if (isProMelodyStageId(this.stage)) {
                stageTitle = stageInfo.customName || 'Pro Stage';
            } else if (isProChordStageId(this.stage)) {
                stageTitle = stageInfo.customName || 'Pro Stage';
            } else {
                stageTitle = 'STAGE ' + (this.stage > 100 ? this.stage - 100 : this.stage);
            }
            stageNameEl.textContent = stageTitle;
            stageDescEl.textContent = stageInfo.description;
            stageDisplay.style.display = 'block';
            if (appTitle) appTitle.style.display = 'none';
        } else {
            if (stageDisplay) stageDisplay.style.display = 'none';
            if (appTitle) appTitle.style.display = 'block';
        }

        // UI Toggle
        if (cfg.isChord) {
            this.noteButtonsContainer.style.display = 'none';
            this.chordButtonsContainer.style.display = 'flex';
        } else {
            this.noteButtonsContainer.style.display = 'flex';
            this.chordButtonsContainer.style.display = 'none';
        }

        // Filter buttons or generate custom ones
        if (cfg.isChord) {
            if (cfg.isCustomChord) {
                // Generate dynamic buttons for Custom Chords
                this.chordButtonsContainer.innerHTML = '';
                cfg.pool.forEach(chordObj => {
                    const btn = document.createElement('button');
                    btn.className = 'chord-btn';
                    btn.dataset.chordid = chordObj.id; // use ID to identify
                    btn.textContent = chordObj.name;

                    // Add listeners for custom chord buttons
                    btn.addEventListener('touchstart', (e) => { e.preventDefault(); this.handleInput(chordObj); });
                    btn.addEventListener('mousedown', (e) => { if (e.button === 0) this.handleInput(chordObj); });

                    this.chordButtonsContainer.appendChild(btn);
                });
                this.chordBtns = document.querySelectorAll('.chord-btn');
            } else {
                // For normal Diatonic predefined chords
                this.chordBtns.forEach(btn => {
                    const chord = btn.dataset.chord;
                    const shouldShow = pool.includes(chord);
                    if (shouldShow) {
                        btn.style.display = 'flex';
                        // Apply degree notation if selected
                        if (this.notationStyle === 'degree') {
                            btn.textContent = this.chordDegreeMap[chord] || chord;
                        } else {
                            btn.textContent = chord;
                        }
                    } else {
                        btn.style.setProperty('display', 'none', 'important');
                    }
                });
            }
        } else {
            this.noteButtonsContainer.innerHTML = '';

            const getNoteText = (note) => {
                if (isProMelodyStageId(this.stage)) {
                    if (cfg.answerMethod === 'degree') return this.getDegreeName(note);
                    if (cfg.answerMethod === 'solfege') return this.getProSolfegeDisplay(note);
                    if (cfg.answerMethod === 'note') return this.getProNoteLetterDisplay(note);
                    return this.notationStyle === 'doremi' ? this.getProSolfegeDisplay(note) : (this.notationStyle === 'degree' ? this.getDegreeName(note) : this.getProNoteLetterDisplay(note));
                }
                return this.notationStyle === 'doremi' ? (this.doremiMap[note] || note) : (this.notationStyle === 'degree' ? this.getDegreeName(note) : note);
            };

            const makeBtn = (note, isBlack, octaveOffset, shouldShow) => {
                const btn = document.createElement('button');
                btn.className = 'note-btn ' + (isBlack ? 'black-key accidental' : 'white-key');
                if (!shouldShow) {
                    btn.style.visibility = 'hidden';
                    return btn;
                }
                btn.dataset.note = note;
                btn.dataset.octaveOffset = octaveOffset;
                btn.textContent = getNoteText(note);
                btn.addEventListener('mousedown', () => this.handleInput(note, octaveOffset));
                btn.addEventListener('touchstart', (e) => { e.preventDefault(); this.handleInput(note, octaveOffset); });
                return btn;
            };

            const renderOctaveKeys = (octaveOffset) => {
                const allNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                const whiteNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
                const blackSlots = ['C#', 'D#', null, 'F#', 'G#', 'A#'];

                if (cfg.isPianoLayout) {
                    const grid = document.createElement('div');
                    grid.className = 'piano-keys-grid';
                    if (octaveOffset > 0) grid.style.marginTop = '16px';

                    const whiteRow = document.createElement('div');
                    whiteRow.className = 'keyboard-row white-keys';
                    whiteNotes.forEach(note => {
                        whiteRow.appendChild(makeBtn(note, false, octaveOffset, proMelodyPoolAllowsNoteAtOctave(cfg, note, octaveOffset)));
                    });
                    grid.appendChild(whiteRow);

                    var whiteW = 44, whiteGap = 6, blackW = 32;
                    var blackKeyMap = [
                        { note: 'C#', slot: 0 },
                        { note: 'D#', slot: 1 },
                        { note: 'F#', slot: 3 },
                        { note: 'G#', slot: 4 },
                        { note: 'A#', slot: 5 }
                    ];
                    blackKeyMap.forEach(function(k) {
                        var btn = makeBtn(k.note, true, octaveOffset, proMelodyPoolAllowsNoteAtOctave(cfg, k.note, octaveOffset));
                        btn.style.left = (k.slot * (whiteW + whiteGap) + whiteW + whiteGap / 2 - blackW / 2) + 'px';
                        grid.appendChild(btn);
                    });

                    this.noteButtonsContainer.appendChild(grid);
                } else {
                    const octaveDiv = document.createElement('div');
                    octaveDiv.className = 'octave-group';
                    octaveDiv.style.display = 'flex';
                    octaveDiv.style.justifyContent = 'center';
                    octaveDiv.style.gap = '15px';
                    octaveDiv.style.flexWrap = 'wrap';
                    octaveDiv.style.width = '100%';
                    if (octaveOffset > 0) octaveDiv.style.marginTop = '15px';

                    allNotes.forEach(note => {
                        const isBlack = note.includes('#');
                        if (!proMelodyPoolAllowsNoteAtOctave(cfg, note, octaveOffset)) return;
                        const btn = document.createElement('button');
                        btn.className = 'note-btn';
                        if (isBlack) btn.classList.add('accidental');
                        btn.dataset.note = note;
                        btn.dataset.octaveOffset = octaveOffset;
                        btn.textContent = getNoteText(note);
                        btn.addEventListener('mousedown', () => this.handleInput(note, octaveOffset));
                        btn.addEventListener('touchstart', (e) => { e.preventDefault(); this.handleInput(note, octaveOffset); });
                        octaveDiv.appendChild(btn);
                    });
                    this.noteButtonsContainer.appendChild(octaveDiv);
                }
            };

            renderOctaveKeys(0);
            if (isProMelodyStageId(this.stage) && cfg.is2Octave) {
                renderOctaveKeys(1);
            }

            if (cfg.isPianoLayout) {
                this.noteButtonsContainer.classList.add('piano-layout');
            } else {
                this.noteButtonsContainer.classList.remove('piano-layout');
            }

            this.noteBtns = document.querySelectorAll('.note-btn');
            this.noteButtonsContainer.style.display = 'flex';
            this.chordButtonsContainer.style.display = 'none';
        }

        this.updateInGameProSettingsButton();

        if (this.standardProPreviewMode) {
            this.currentSequence = [];
            this.isRoundOver = true;
            this.inputIndex = 0;
            this.isBlockingInput = false;
            void this.audio.resumeContext().catch(() => {});
            this.showFeedback(
                'このSTAGEはPro版専用の機能です。遊ぶにはPro版をご利用ください',
                'pro-preview'
            );
            return;
        }

        // 初回問題の前に AudioContext を確実に running にしてから nextRound（無音の競合を減らす）
        setTimeout(async () => {
            try {
                await this.audio.resumeContext();
            } catch (_) { /* ignore */ }
            void this.nextRound();
        }, 500 / this.noteSpeed);
    }


    async playScale(callback) {
        await this.audio.resumeContext();
        this.audio.stopAllScheduledSounds();
        const scale = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
        const noteDuration = 0.13 / this.noteSpeed; // スピードに連動
        const now = this.audio.ctx.currentTime;

        scale.forEach((note, index) => {
            const octave = (index === 7) ? this.baseOctave + 1 : this.baseOctave;
            this.audio.playNote(note + octave, noteDuration, now + (index * noteDuration), this.getPlaybackKeyOffset());
        });

        // Callback after scale finishes (speed-adjusted)
        if (callback) {
            const delay = (scale.length * noteDuration * 1000) + 250 / this.noteSpeed;
            setTimeout(() => {
                Promise.resolve(callback()).catch(() => {});
            }, delay);
        }
    }

    /** キーランダムで「問題前の音階」OFF時: そのキーの主音（ド）だけを短く再生 */
    async playTonicPreview(callback) {
        await this.audio.resumeContext();
        this.audio.stopAllScheduledSounds();
        const noteDuration = 0.45 / this.noteSpeed;
        const now = this.audio.ctx.currentTime;
        this.audio.playNote('C' + this.baseOctave, noteDuration, now, this.getPlaybackKeyOffset());
        if (callback) {
            const delay = noteDuration * 1000 + 200 / this.noteSpeed;
            setTimeout(() => {
                Promise.resolve(callback()).catch(() => {});
            }, delay);
        }
    }

    // Helper: serialize a sequence into a comparable string key
    serializeSequence(seq) {
        return seq.map(item => {
            if (typeof item === 'string') return item;
            if (item && item.id) return item.id;           // custom chord object
            if (item && item.name) return item.name;       // named chord object
            if (item && item.note) return item.note + ':' + (item.octaveOffset || 0); // 2-octave note
            return JSON.stringify(item);
        }).join(',');
    }

    async nextRound() {
        if (!this.isPlaying) return;
        if (this.standardProPreviewMode) return;

        try {
            await this.audio.resumeContext();
        } catch (_) { /* ignore */ }

        this.audio.stopAllScheduledSounds();

        this.isBlockingInput = true;
        this.isRoundOver = false;
        this.inputIndex = 0;

        if (isKeyRandomGameplayActive(this)) {
            this.roundKeyOffset = Math.floor(Math.random() * 12);
        } else {
            this.roundKeyOffset = this.keyOffset;
        }

        const cfg = this.stageConfig[this.stage] || this.stageConfig[3];

        // Retry loop to avoid consecutive duplicate questions
        const maxRetries = 10;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            this.currentSequence = [];

            const proChordQm = isProChordStageId(this.stage)
                ? (cfg.proQuestionMode != null ? cfg.proQuestionMode : this.proQuestionMode)
                : null;
            if (isProChordStageId(this.stage) && proChordQm === 'progressions') {
                const activeProgs = this.customProgressions.filter(p => p.isActive !== false);
                if (activeProgs.length > 0) {
                    const selectedProg = activeProgs[Math.floor(Math.random() * activeProgs.length)];
                    // Play the progression EXACTLY as defined, ignoring cfg.count.
                    // Look up chords from customChords directly to avoid stale pool issues.
                    for (let i = 0; i < selectedProg.chords.length; i++) {
                        const chordId = selectedProg.chords[i];
                        const chordObj = this.customChords.find(c => c.id === chordId)
                            || cfg.pool.find(c => c.id === chordId);
                        if (chordObj) {
                            this.currentSequence.push(chordObj);
                        }
                    }
                }
            } else if (cfg.isChord && this.chordPatternMode === 'progression' && !isProChordStageId(this.stage)) {
                const baseProgressions = [
                    ['C', 'F', 'G', 'C'],        // 基本進行
                    ['C', 'F', 'C', 'G'],        // Pop Standard
                    ['C', 'G', 'F', 'G'],        // Pop Standard 2
                    ['C', 'Am', 'F', 'G'],       // 1950s
                    ['F', 'G', 'Em', 'Am'],      // 王道進行
                    ['Am', 'F', 'G', 'C'],       // 小室進行
                    ['Dm', 'G', 'C', 'Am'],      // 前ツーファイブワン
                    ['Am', 'Dm', 'G', 'C'],      // 後ツーファイブワン
                    ['C', 'G', 'Am', 'Em'],      // カノン進行前半
                    ['F', 'C', 'F', 'G'],        // カノン進行後半
                    ['F', 'C', 'G', 'Am'],       // ポップパンク
                    ['C', 'G', 'Am', 'F'],       // Let it be進行
                    ['Am', 'F', 'C', 'G'],       // 洋楽定番 (6415)
                    ['F', 'G', 'Am', 'C'],       // 王道アレンジ (4561)
                    ['Am', 'G', 'F', 'G'],       // マイナー下降
                    ['Em', 'Am', 'Dm', 'G'],     // 強進行 (3625)
                    ['C', 'Am', 'Dm', 'G'],      // 625強進行 (1625)
                    ['Em', 'F', 'G', 'Am'],      // 上昇順次進行 (3456)
                    ['C', 'Em', 'Am', 'C'],      // トニック進行 (1361)
                    ['Dm', 'Em', 'F', 'G']       // 上昇順次進行2 (2345)
                ];

                const isCustom = cfg.isCustomChord;
                // Get available chord names from the pool
                const poolNames = isCustom ? cfg.pool.map(c => c.name) : cfg.pool;

                // Filter progressions to those where ALL chords are present in the current pool
                const validProgressions = baseProgressions.filter(prog =>
                    prog.every(chord => poolNames.includes(chord))
                );

                if (validProgressions.length > 0) {
                    // Select a random valid progression
                    const selectedProg = validProgressions[Math.floor(Math.random() * validProgressions.length)];

                    // Build sequence up to cfg.count by looping the selected progression if needed
                    for (let i = 0; i < cfg.count; i++) {
                        const chordName = selectedProg[i % selectedProg.length];
                        if (isCustom) {
                            this.currentSequence.push(cfg.pool.find(c => c.name === chordName));
                        } else {
                            this.currentSequence.push(chordName);
                        }
                    }
                }
            }

            // Fallback to random if progression mode failed to find a match, or if in random mode
            if (this.currentSequence.length === 0) {
                for (let i = 0; i < cfg.count; i++) {
                    if (isProMelodyStageId(this.stage) && cfg.is2Octave) {
                        const entries = expandProMelody2OctavePoolEntries(cfg.pool);
                        if (entries.length === 0) break;
                        const pick = entries[Math.floor(Math.random() * entries.length)];
                        this.currentSequence.push({ note: pick.note, octaveOffset: pick.octaveOffset });
                    } else {
                        let pool = cfg.pool;
                        if (cfg.isChord && pool.length > 1 && this.currentSequence.length >= 2) {
                            const ck = (c) => (typeof c === 'object' && c !== null) ? (c.id || c.name) : c;
                            const last = ck(this.currentSequence[this.currentSequence.length - 1]);
                            if (last === ck(this.currentSequence[this.currentSequence.length - 2])) {
                                pool = pool.filter(c => ck(c) !== last);
                            }
                        }
                        const randomNote = pool[Math.floor(Math.random() * pool.length)];
                        this.currentSequence.push(randomNote);
                    }
                }
            }

            // Check for 3 consecutive duplicates (allow 2, block 3)
            const currentKey = this.serializeSequence(this.currentSequence);
            const isTripleDuplicate = this.previousSequenceKeys.length >= 2 &&
                this.previousSequenceKeys[this.previousSequenceKeys.length - 1] === currentKey &&
                this.previousSequenceKeys[this.previousSequenceKeys.length - 2] === currentKey;
            if (!isTripleDuplicate || attempt === maxRetries - 1) {
                // Keep only the last 2 keys
                this.previousSequenceKeys.push(currentKey);
                if (this.previousSequenceKeys.length > 2) {
                    this.previousSequenceKeys.shift();
                }
                break; // Accept this sequence
            }
            // else: 3rd consecutive duplicate detected, retry
        }

        const keyRand = isKeyRandomGameplayActive(this);
        if (this.scaleEnabled) {
            this.showFeedback('音階を聴いてください...');
            void this.playScale(async () => {
                this.showFeedback('問題を聴いてください...');
                await this.playSequence();
                this.isBlockingInput = false;
                if (testModeState.active) startTestModeAnswerTimer(this);
            });
        } else if (keyRand) {
            this.showFeedback('主音を聴いてください...');
            void this.playTonicPreview(async () => {
                this.showFeedback('問題を聴いてください...');
                await this.playSequence();
                this.isBlockingInput = false;
                if (testModeState.active) startTestModeAnswerTimer(this);
            });
        } else {
            this.showFeedback('問題を聴いてください...');
            await this.playSequence();
            this.isBlockingInput = false;
            if (testModeState.active) startTestModeAnswerTimer(this);
        }
    }

    showStageSelector() {
        if (testModeState.active) {
            showTestModeAbortConfirm(this, () => {
                stopTestModeRun(this);
                this.showStageSelector();
            });
            return;
        }
        this.audio.stopAllScheduledSounds();
        this.isPlaying = false;
        this.standardProPreviewMode = false;
        const noticeEl = document.getElementById('standard-pro-preview-notice');
        if (noticeEl) noticeEl.style.display = 'none';
        this.updateInGameProSettingsButton();
        this.overlay.classList.remove('hidden');
        // 最後に選んだカテゴリ画面に戻る
        ['screen-home', 'screen-melody', 'screen-chord'].forEach(id => {
            if (document.getElementById(id)) document.getElementById(id).classList.add('hidden');
        });
        if (document.getElementById(this.lastCategory)) document.getElementById(this.lastCategory).classList.remove('hidden');
        if (isStagingProSlotsFeature()) this.renderStagingMelodySlotButtons();
        updateTestModeStageButtons(this);
    }

    showHomeScreen() {
        if (testModeState.active) {
            showTestModeAbortConfirm(this, () => {
                stopTestModeRun(this);
                this.showHomeScreen();
            });
            return;
        }
        this.audio.stopAllScheduledSounds();
        this.isPlaying = false;
        this.standardProPreviewMode = false;
        const noticeEl = document.getElementById('standard-pro-preview-notice');
        if (noticeEl) noticeEl.style.display = 'none';
        this.updateInGameProSettingsButton();
        this.overlay.classList.remove('hidden');
        ['screen-home', 'screen-melody', 'screen-chord'].forEach(id => {
            if (document.getElementById(id)) document.getElementById(id).classList.add('hidden');
        });
        if (document.getElementById('screen-home')) document.getElementById('screen-home').classList.remove('hidden');
        if (isStagingProSlotsFeature()) this.renderStagingMelodySlotButtons();

        // Restore title and hide stage info
        const stageDisplay = document.getElementById('stage-info-display');
        const appTitle = document.querySelector('h1');
        if (stageDisplay) stageDisplay.style.display = 'none';
        if (appTitle) appTitle.style.display = 'block';

        this.applyTranslations();
        this.maybeShowInfoIntro();
        this.maybeShowInfoNewBadge();
    }

    maybeShowInfoIntro() {
        if (!this.homeInfoIntroEl) return;
        const homeScreen = document.getElementById('screen-home');
        if (!homeScreen || homeScreen.classList.contains('hidden')) return;
        let seen = false;
        try {
            seen = localStorage.getItem(this.infoIntroStorageKey) === '1';
        } catch (error) {
            seen = false;
        }
        if (seen) {
            this.homeInfoIntroEl.classList.add('hidden');
            return;
        }
        // First-time user: record version so NEW badge shows on next version update
        try { localStorage.setItem(this.infoNewBadgeStorageKey, PITCH_TRAINER_APP_VERSION); } catch (_) {}
        this.homeInfoIntroEl.classList.remove('hidden');
        try {
            localStorage.setItem(this.infoIntroStorageKey, '1');
        } catch (error) {
            // ignore localStorage failures and still show once for this session
        }
        clearTimeout(this._infoIntroTimer);
        this._infoIntroTimer = setTimeout(() => this.dismissInfoIntro(), 7000);
    }

    dismissInfoIntro() {
        if (!this.homeInfoIntroEl) return;
        this.homeInfoIntroEl.classList.add('hidden');
        if (this._infoIntroTimer) {
            clearTimeout(this._infoIntroTimer);
            this._infoIntroTimer = null;
        }
    }

    maybeShowInfoNewBadge() {
        if (!this.homeInfoNewBadgeEl) return;
        this.homeInfoNewBadgeEl.classList.add('hidden');
    }

    dismissInfoNewBadge() {
        if (!this.homeInfoNewBadgeEl) return;
        this.homeInfoNewBadgeEl.classList.add('hidden');
        if (this._infoNewBadgeTimer) {
            clearTimeout(this._infoNewBadgeTimer);
            this._infoNewBadgeTimer = null;
        }
    }

    /** 将来の多言語切り替え用。未定義のままだと例外になるため空実装 */
    applyTranslations() {
        /* no-op */
    }

    async playSequence() {
        if (!this.currentSequence.length) return;

        await this.audio.resumeContext();
        this.audio.stopAllScheduledSounds();
        const now = this.audio.ctx.currentTime;
        const noteDuration = 0.8 / this.noteSpeed;
        const gap = 0.2 / this.noteSpeed;

        this.currentSequence.forEach((item, index) => {
            const cfg = this.stageConfig[this.stage];
            if (cfg.isChord) {
                if (cfg.isCustomChord) {
                    // item is a chord object
                    this.audio.playCustomChord(item, this.baseOctave, noteDuration, now + (index * (noteDuration + gap)), this.getPlaybackKeyOffset());
                } else {
                    // Pass voicing if defined
                    this.audio.playChord(item, this.baseOctave, noteDuration, now + (index * (noteDuration + gap)), this.getPlaybackKeyOffset(), cfg.chordVoicing);
                }
            } else {
                if (typeof item === 'object' && item !== null && item.note) {
                    // 2-Octave mode logic
                    const targetOctave = this.baseOctave + (item.octaveOffset || 0);
                    this.audio.playNote(item.note + targetOctave, noteDuration, now + (index * (noteDuration + gap)), this.getPlaybackKeyOffset());
                } else {
                    this.audio.playNote(item + this.baseOctave, noteDuration, now + (index * (noteDuration + gap)), this.getPlaybackKeyOffset());
                }
            }
        });
    }

    replaySequence() {
        if (this.standardProPreviewMode) return;
        // Allow replay even if playing, but reset blocking if we want to handle overlap visually
        // For now, just play. User asked to allow input during play, so we shouldn't block input.
        // We can just play the sequence.
        if (this.currentSequence.length) {
            this.showFeedback('問題を聴いてください...');
            void this.playSequence();
            // No blocking input
        }
    }

    async playTonic() {
        if (this.isPlaying) {
            await this.audio.resumeContext();
            this.audio.playNote('C' + this.baseOctave, 1.0, 0, this.getPlaybackKeyOffset());
        }
    }

    playScaleManual() {
        // Play the scale (ドレミファソラシド) anytime the button is pressed
        void this.playScale();
    }

    async handleInput(note, inputOctaveOffset = 0) {
        if (!this.isPlaying || !this.currentSequence.length) return;
        if (this.standardProPreviewMode) return;

        await this.audio.resumeContext();

        const cfg = this.stageConfig[this.stage];

        // 問題再生（playSequence）と同じ発音長＋余韻のかかり方にそろえる（ピアノ等でタップ音だけ短く聞こえないように）
        const answerPreviewDuration = 0.8 / this.noteSpeed;

        if (cfg.isChord) {
            if (cfg.isCustomChord) {
                this.audio.playCustomChord(note, this.baseOctave, answerPreviewDuration, 0, this.getPlaybackKeyOffset());
            } else {
                this.audio.playChord(note, this.baseOctave, answerPreviewDuration, 0, this.getPlaybackKeyOffset(), cfg.chordVoicing);
            }
        } else {
            this.audio.playNote(note + (this.baseOctave + inputOctaveOffset), answerPreviewDuration, 0, this.getPlaybackKeyOffset());
        }

        // Check if answer mode is disabled (preview only)
        if (!this.isAnswerMode) return;

        // Prevent double submission after answering, but allow sound check above
        if (this.isRoundOver) return;

        const expectedItem = this.currentSequence[this.inputIndex];

        // Equality check depending on whether it's an object (CustomChord) or string
        let isCorrect = processEquality(note, inputOctaveOffset, expectedItem, cfg);

        function processEquality(input, inputOctave, expected, config) {
            if (config.isCustomChord) {
                return input.id === expected.id;
            }
            if (typeof expected === 'object' && expected !== null && expected.note) {
                if (config.is2Octave) {
                    return input === expected.note && inputOctave === (expected.octaveOffset || 0);
                } else {
                    return input === expected.note;
                }
            }
            return input === expected;
        }

        // Check if correct note in sequence
        if (isCorrect) {
            // Correct so far
            this.inputIndex++;
            const maxCount = this.currentSequence.length;
            this.showFeedback('正解! (' + this.inputIndex + '/' + maxCount + ')', 'correct');

            // Highlight button briefly
            let key;
            if (cfg.isChord) {
                if (cfg.isCustomChord) {
                    key = document.querySelector('.chord-btn[data-chordid="' + note.id + '"]');
                } else {
                    key = document.querySelector('.chord-btn[data-chord="' + note + '"]');
                }
            } else {
                if (cfg.is2Octave) {
                    key = document.querySelector(`.note-btn[data-note="${note}"][data-octave-offset="${inputOctaveOffset}"]`);
                } else {
                    key = document.querySelector(`.note-btn[data-note="${note}"]`);
                }
            }
            if (key) {
                key.classList.add('correct');
                setTimeout(() => key.classList.remove('correct'), 200);
            }

            if (this.inputIndex >= this.currentSequence.length) {
                this.handleCorrect();
            }
        } else {
            this.handleWrong(note, inputOctaveOffset);
        }
    }

    toggleAnswerMode(isChecked) {
        if (testModeState.active) return; // テスト中は変更不可
        this.isAnswerMode = isChecked;
        const statusLabel = document.getElementById('answer-mode-status');

        if (this.isAnswerMode) {
            if (statusLabel) {
                statusLabel.textContent = '回答ON';
                statusLabel.style.color = '#fff';
            }
            if (this.feedbackEl) this.feedbackEl.textContent = '';
        } else {
            if (statusLabel) {
                statusLabel.textContent = '回答OFF (音確認のみ)';
                statusLabel.style.color = 'rgba(255, 255, 255, 0.6)';
            }
            if (this.feedbackEl) this.feedbackEl.textContent = '🎶 音確認モード (回答されません)';
        }
    }

    handleCorrect(note) {
        this.isRoundOver = true;
        this.streak++;
        this.updateStats();

        if (testModeState.active) {
            clearTestModeAnswerTimer();
            handleTestModeCorrectAnswer(this);
            return;
        }

        this.showFeedback('正解！ 素晴らしい！', 'correct');
        setTimeout(() => {
            void this.nextRound();
        }, 750 / this.noteSpeed);
    }

    handleWrong(note, inputOctaveOffset = 0) {
        this.isRoundOver = true;
        this.streak = 0;
        this.updateStats();

        if (testModeState.active) {
            clearTestModeAnswerTimer();
            handleTestModeFailure('wrong', this);
            return;
        }

        let expectedNotes;
        const cfg = this.stageConfig[this.stage] || this.stageConfig[3];
        if (cfg.isChord) {
            const chordLabel = (c) => (typeof c === 'object' && c !== null && c.name ? c.name : c);
            if (cfg.isCustomChord) {
                expectedNotes = this.currentSequence.map((c) => chordLabel(c)).join(', ');
            } else {
                if (this.notationStyle === 'degree') {
                    expectedNotes = this.currentSequence.map((c) => {
                        const name = chordLabel(c);
                        return this.chordDegreeMap[name] || name;
                    }).join(', ');
                } else {
                    expectedNotes = this.currentSequence.map((c) => chordLabel(c)).join(', ');
                }
            }
        } else {
            expectedNotes = this.currentSequence.map((item) => this.formatMelodySequenceItemForFeedback(item, cfg)).join(', ');
        }
        this.showFeedback('不正解... 正解は: ' + expectedNotes, 'wrong');

        let key;
        if (cfg.isChord) {
            if (cfg.isCustomChord) {
                key = document.querySelector('.chord-btn[data-chordid="' + note.id + '"]');
            } else {
                key = document.querySelector('.chord-btn[data-chord="' + note + '"]');
            }
        } else {
            if (cfg.is2Octave && typeof note === 'string') {
                key = document.querySelector(
                    `.note-btn[data-note="${note}"][data-octave-offset="${inputOctaveOffset}"]`
                );
            }
            if (!key) {
                key = document.querySelector('.note-btn[data-note="' + note + '"]');
            }
        }
        if (key) key.classList.add('wrong');

        setTimeout(() => {
            if (key) key.classList.remove('wrong');

            // Replay correct sequence with highlights
            setTimeout(() => {
                void this.playSequence();

                // playSequence と同じ間隔でハイライト
                const noteDuration = 0.8 / this.noteSpeed;
                const gap = 0.2 / this.noteSpeed;
                const intervalMs = (noteDuration + gap) * 1000;

                this.currentSequence.forEach((item, index) => {
                    setTimeout(() => {
                        let correctKey;
                        // Use isChord property from config instead of stage number hack
                        const isChordStage = this.stageConfig[this.stage] && this.stageConfig[this.stage].isChord;

                        if (isChordStage) {
                            if (cfg.isCustomChord) {
                                correctKey = document.querySelector('.chord-btn[data-chordid="' + item.id + '"]');
                            } else {
                                const chordName = typeof item === 'object' && item !== null && item.name ? item.name : item;
                                correctKey = document.querySelector('.chord-btn[data-chord="' + chordName + '"]');
                            }
                        } else {
                            if (typeof item === 'object' && item !== null && item.note !== undefined && cfg.is2Octave) {
                                correctKey = document.querySelector(
                                    `.note-btn[data-note="${item.note}"][data-octave-offset="${item.octaveOffset || 0}"]`
                                );
                            } else {
                                const noteStr = typeof item === 'object' && item !== null && item.note ? item.note : item;
                                correctKey = document.querySelector('.note-btn[data-note="' + noteStr + '"]');
                            }
                        }

                        if (correctKey) {
                            correctKey.classList.add('correct');
                            setTimeout(() => correctKey.classList.remove('correct'), intervalMs * 0.8);
                        }
                    }, index * intervalMs);
                });

                // Delay based on sequence length × interval
                const stageLen = this.currentSequence.length;
                setTimeout(() => void this.nextRound(), (stageLen * intervalMs) + 750 / this.noteSpeed);
            }, 500 / this.noteSpeed);
        }, 250 / this.noteSpeed);
    }

    showFeedback(text, type = '') {
        this.feedbackEl.textContent = text;
        this.feedbackEl.className = 'feedback-display';
        if (type) {
            this.feedbackEl.classList.add('feedback-' + type);
        }
    }
}

/**
 * ページを読み直す（キャッシュを避けやすいようクエリを付与）
 */
function reloadAppWithCacheBust() {
    try {
        if (window.game && window.game.audio && typeof window.game.audio.closeContextForNavigation === 'function') {
            window.game.audio.closeContextForNavigation();
        }
    } catch (_) { /* ignore */ }
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('_r', String(Date.now()));
        window.location.replace(url.toString());
    } catch (e) {
        window.location.reload();
    }
}

function getPitchTrainerVersionLabel() {
    const edition = document.documentElement.dataset.appEdition || '';
    const isStaging = edition === 'Staging';
    const buildPart = isStaging ? ` (${PITCH_TRAINER_APP_BUILD})` : '';
    let edPart = '';
    if (isStaging) {
        edPart = ' · Staging';
    } else if (edition) {
        edPart = ` · ${edition}`;
    }
    return `Ver ${PITCH_TRAINER_APP_VERSION}${buildPart}${edPart}`;
}

function applyAppVersionDisplay() {
    const el = document.getElementById('app-version-display');
    if (el) el.textContent = getPitchTrainerVersionLabel();
}

/**
 * 右下「ページを更新」＋サービスワーカーで新しい版を検知したときのバナー
 */
function setupAppRefreshAndSwUpdates() {
    applyAppVersionDisplay();
    document.querySelectorAll('.js-reload-app').forEach((btn) => {
        btn.addEventListener('click', () => reloadAppWithCacheBust());
    });

    const banner = document.getElementById('app-update-banner');
    const updateReload = document.getElementById('app-update-reload-btn');
    const updateDismiss = document.getElementById('app-update-dismiss-btn');

    function showUpdateBanner() {
        if (banner) banner.classList.remove('hidden');
    }

    function hideUpdateBanner() {
        if (banner) banner.classList.add('hidden');
    }

    if (updateReload) {
        updateReload.addEventListener('click', () => reloadAppWithCacheBust());
    }
    if (updateDismiss) {
        updateDismiss.addEventListener('click', hideUpdateBanner);
    }

    if (!('serviceWorker' in navigator)) return;

    function attachUpdateListener(reg) {
        if (!reg || reg.__pitchTrainerUpdateHook) return;
        reg.__pitchTrainerUpdateHook = true;

        if (reg.waiting && navigator.serviceWorker.controller) {
            showUpdateBanner();
        }

        reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', () => {
                if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                    showUpdateBanner();
                }
            });
        });
    }

    navigator.serviceWorker.ready.then((reg) => attachUpdateListener(reg));

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            navigator.serviceWorker.getRegistration().then((r) => {
                if (r) void r.update();
            });
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    unregisterLegacyRootServiceWorker();
    if (document.documentElement.dataset.appEdition === 'Staging') {
        setupAppRefreshAndSwUpdates();
        return;
    }
    window.game = new Game();
    setupAppRefreshAndSwUpdates();
});
