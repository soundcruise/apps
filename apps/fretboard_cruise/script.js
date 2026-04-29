const FRETBOARD_CRUISE_APP_VERSION = '1.0.0';
window.FRETBOARD_CRUISE_APP_VERSION = FRETBOARD_CRUISE_APP_VERSION;

// Constants
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OPEN_STRINGS = [4, 9, 2, 7, 11, 4]; // E A D G B E (6弦 -> 1弦)
const STRINGS_REV = [6, 5, 4, 3, 2, 1];
const MAX_FRET = 12;

// Default States
let state = {
    course: null, // 'modeSelect' | 'stageSelect' | 'memorize' | 'visualize'
    memorize: {
        playMode: 'quiz', // 'cruise' | 'quiz'
        stage: 1,
        correct: 0,
        combo: 0,
        currentQuestion: null,
        cruiseTargets: [],
        cruiseScope: [], // Unique targets for rendering grey notes
        cruiseIndex: 0,
        isCleared: false,
        hasTappedCurrentNote: false,
        isFirstNote: true,
        tempFeedback: null
    },
    visualize: {
        key: 0, // C
        chordType: 'M',
        degreeMode: false
    },
    settings: {
        tempo: 75,
        quizTimeLimit: 3,
        viewMode: 'front', // 'front' (1st top) or 'player' (6th top)
        rotation: { x: 12, y: 0, z: 0 }, // Degrees for player view
        perspective: 50, // 遠近感 (0-100)
        perspOriginX: 50 // 横の遠近感 (0-100, 100=12F大きく)
    }
};

let currentScrollLeft = 0;
let autoScrollRequested = false;
let nextTargetTime = 0;

// Load state
const savedState = localStorage.getItem('fretboard_cruise_state');
if (savedState) {
    try {
        let loaded = JSON.parse(savedState);
        // Deep merge for settings
        state = { ...state, ...loaded };
        if (!state.settings) state.settings = { tempo: 75, quizTimeLimit: 3, viewMode: 'front', rotation: { x: 12, y: 0, z: 0 }, perspective: 50, perspOriginX: 50 };
        if (typeof state.settings.quizTimeLimit === 'undefined') state.settings.quizTimeLimit = 3;
        if (typeof state.settings.viewMode === 'undefined') state.settings.viewMode = 'front';
        if (typeof state.settings.rotation === 'undefined') state.settings.rotation = { x: 12, y: 0, z: 0 };
        if (typeof state.settings.perspective === 'undefined') state.settings.perspective = 50;
        if (typeof state.settings.perspOriginX === 'undefined') state.settings.perspOriginX = 50;
    } catch (e) {}
}

function saveState() {
    localStorage.setItem('fretboard_cruise_state', JSON.stringify(state));
}

// ----------------------------------------------------
// Audio Synthesis
// ----------------------------------------------------
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

const STRING_BASE_PITCHES = [40, 45, 50, 55, 59, 64]; // E2, A2, D3, G3, B3, E4

function playTone(stringIdx, fret) {
    initAudio();
    if (!audioCtx) return;
    
    let midiNote = STRING_BASE_PITCHES[stringIdx] + fret;
    let freq = 440 * Math.pow(2, (midiNote - 69) / 12);
    
    let t = audioCtx.currentTime;
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();
    
    osc.type = 'triangle'; // Plucked string-like base
    osc.frequency.setValueAtTime(freq, t);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.8, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(t);
    osc.stop(t + 2.0);
}

// --- Rhythm Machine & Timers ---
let rhythmInterval = null;
let nextNoteTime = 0;
let current16thNote = 0;

let quizTimerInterval = null;
let quizTimeLeft = 3.0;

function startQuizTimer() {
    clearInterval(quizTimerInterval);
    quizTimeLeft = state.settings.quizTimeLimit;
    
    quizTimerInterval = setInterval(() => {
        quizTimeLeft -= 0.1;
        if (quizTimeLeft <= 0) {
            quizTimeLeft = 0;
            clearInterval(quizTimerInterval);
            handleQuizTimeout();
        }
        
        const timerDisplay = document.getElementById('quiz-timer');
        if (timerDisplay) {
            timerDisplay.textContent = quizTimeLeft.toFixed(1) + 's';
            if (quizTimeLeft <= 1.0) {
                timerDisplay.parentElement.style.color = 'var(--error-color)';
            }
        }
    }, 100);
}

function handleQuizTimeout() {
    state.memorize.combo = 0;
    state.memorize.tempFeedback = { text: 'Miss... (時間切れ)', className: 'feedback-display feedback-wrong' };
    
    // Show answer briefly and move to next
    let app = document.getElementById('app');
    renderFretboardHTML('fretboard-container', {
        mode: 'memorize',
        question: state.memorize.currentQuestion,
        showAnswer: true,
        clicked: null,
        onFretClick: null
    });
    
    const fb = document.getElementById('feedback');
    if (fb) {
        fb.textContent = 'Miss... (時間切れ)';
        fb.className = 'feedback-display feedback-wrong';
    }
    
    setTimeout(() => {
        generateQuestion();
        renderApp();
    }, 1000);
}

function stopQuizTimer() {
    if (quizTimerInterval) {
        clearInterval(quizTimerInterval);
        quizTimerInterval = null;
    }
}

function scheduleRhythm() {
    if (!audioCtx) return;
    while (nextNoteTime < audioCtx.currentTime + 0.1) {
        playRhythmNote(current16thNote, nextNoteTime);
        
        if (state.course === 'memorize' && state.memorize.playMode === 'cruise' && !state.memorize.isCleared) {
            if (current16thNote === 0 || current16thNote === 8) {
                let delayMs = (nextNoteTime - audioCtx.currentTime) * 1000;
                setTimeout(autoAdvanceCruise, delayMs);
                
                // Target time is the next snare beat (4 16th notes later)
                let secondsPerBeat = 60.0 / state.settings.tempo;
                nextTargetTime = nextNoteTime + secondsPerBeat;
            }
        }
        
        nextRhythmNote();
    }
    rhythmInterval = setTimeout(scheduleRhythm, 25);
}

function autoAdvanceCruise() {
    if (state.course !== 'memorize' || state.memorize.playMode !== 'cruise' || state.memorize.isCleared) return;

    if (state.memorize.isFirstNote) {
        state.memorize.isFirstNote = false;
        state.memorize.hasTappedCurrentNote = false;
        let q = state.memorize.currentQuestion;
        playTone(q.stringIdx, q.fret);
        renderApp();
        return;
    }
    
    // Evaluate previous window (timeout miss)
    if (!state.memorize.hasTappedCurrentNote) {
        state.memorize.combo = 0;
        state.memorize.tempFeedback = { text: 'Miss... (時間切れ)', className: 'feedback-display feedback-wrong' };
    } else {
        state.memorize.tempFeedback = null;
    }
    
    // Move to next note
    let nextIdx = state.memorize.cruiseIndex + 1;
    if (nextIdx >= state.memorize.cruiseTargets.length) {
        state.memorize.isCleared = true;
        stopRhythm();
        saveState();
        renderApp();
        return;
    }
    
    state.memorize.cruiseIndex = nextIdx;
    state.memorize.currentQuestion = state.memorize.cruiseTargets[nextIdx];
    state.memorize.hasTappedCurrentNote = false;
    
    let q = state.memorize.currentQuestion;
    playTone(q.stringIdx, q.fret);
    
    autoScrollRequested = true;
    saveState();
    renderApp();
}

function nextRhythmNote() {
    let secondsPerBeat = 60.0 / state.settings.tempo;
    nextNoteTime += 0.25 * secondsPerBeat;
    current16thNote++;
    if (current16thNote === 16) {
        current16thNote = 0;
    }
}

function playRhythmNote(note, time) {
    if (note === 0 || note === 8) playDrumKick(time);
    if (note === 4 || note === 12) playDrumSnare(time);
    if (note % 2 === 0) playDrumHat(time);
}

function playDrumKick(time) {
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.001, time + 0.5);
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    osc.start(time);
    osc.stop(time + 0.5);
}

function playDrumSnare(time) {
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();
    osc.type = 'square';
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(250, time);
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    osc.start(time);
    osc.stop(time + 0.1);
}

function playDrumHat(time) {
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();
    osc.type = 'square';
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(8000, time);
    gain.gain.setValueAtTime(0.05, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
    osc.start(time);
    osc.stop(time + 0.05);
}

function startRhythm() {
    initAudio();
    if (rhythmInterval) return;
    nextNoteTime = audioCtx.currentTime + 0.1;
    current16thNote = 0;
    scheduleRhythm();
}

function stopRhythm() {
    if (rhythmInterval) {
        clearTimeout(rhythmInterval);
        rhythmInterval = null;
    }
}

// ----------------------------------------------------
// Core Logic
// ----------------------------------------------------

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getStageTargets(stage) {
    let targets = [];
    for (let s = 0; s < 6; s++) {
        for (let f = 0; f <= 12; f++) {
            let noteIdx = (OPEN_STRINGS[s] + f) % 12;
            let isNat = [0, 2, 4, 5, 7, 9, 11].includes(noteIdx); // Keep natural notes only for beginners
            
            let add = false;
            switch(stage) {
                case 1: if (f >= 0 && f <= 3 && isNat) add = true; break;
                case 2: if (f >= 0 && f <= 5 && isNat) add = true; break;
                case 3: if (f >= 5 && f <= 9 && isNat) add = true; break;
                case 4: if (f >= 5 && f <= 12 && isNat) add = true; break;
                case 5: if (f >= 0 && f <= 12 && isNat) add = true; break;
                case 6: if (f >= 0 && f <= 12 && isNat) add = true; break;
            }
            if (add) {
                targets.push({ stringIdx: s, stringName: 6 - s, fret: f, noteIdx: noteIdx, noteName: NOTES[noteIdx] });
            }
        }
    }
    return targets;
}

function generateQuestion() {
    let targets = getStageTargets(state.memorize.stage);
    if (targets.length === 0) return;
    
    let target = targets[getRandomInt(0, targets.length - 1)];
    
    // Prevent the exact same question string+note from appearing twice in a row if possible
    if (state.memorize.currentQuestion && targets.length > 1) {
        while (target.stringIdx === state.memorize.currentQuestion.stringIdx && target.noteIdx === state.memorize.currentQuestion.noteIdx) {
            target = targets[getRandomInt(0, targets.length - 1)];
        }
    }

    state.memorize.currentQuestion = target;
    state.memorize.hasTappedCurrentNote = false;
    saveState();
    
    if (state.memorize.playMode === 'quiz') {
        startQuizTimer();
    }
}

// ----------------------------------------------------
// UI Rendering
// ----------------------------------------------------

function renderApp() {
    const app = document.getElementById('app');
    
    // Save scroll position
    const oldWrapper = document.querySelector('.fretboard-scroll-wrapper');
    if (oldWrapper) currentScrollLeft = oldWrapper.scrollLeft;

    if (state.course === null) {
        renderHome(app);
    } else if (state.course === 'modeSelect') {
        renderModeSelect(app);
    } else if (state.course === 'stageSelect') {
        renderStageSelect(app);
    } else if (state.course === 'memorize') {
        renderMemorize(app);
    } else if (state.course === 'visualize') {
        renderVisualize(app);
    } else if (state.course === 'settings') {
        renderSettings(app);
    }
    
    // Restore or auto-adjust scroll position
    const newWrapper = document.querySelector('.fretboard-scroll-wrapper');
    if (newWrapper) {
        if (autoScrollRequested) {
            autoScrollRequested = false;
            
            if (state.course === 'memorize' && state.memorize.playMode === 'cruise') {
                const q = state.memorize.currentQuestion;
                if (q) {
                    const fretCol = newWrapper.querySelector(`.fret-column[data-fret="${q.fret}"]`);
                    if (fretCol) {
                        const fretLeft = fretCol.offsetLeft;
                        const fretRight = fretLeft + fretCol.clientWidth;
                        const visibleLeft = currentScrollLeft;
                        const visibleRight = currentScrollLeft + newWrapper.clientWidth;
                        
                        // If the target is out of bounds (with 20px margin), then auto-scroll to center it
                        if (fretLeft < visibleLeft + 20 || fretRight > visibleRight - 20) {
                            const wrapperCenter = newWrapper.clientWidth / 2;
                            const fretCenter = fretLeft + (fretCol.clientWidth / 2);
                            setTimeout(() => {
                                newWrapper.scrollTo({ left: fretCenter - wrapperCenter, behavior: 'smooth' });
                            }, 10);
                        } else {
                            // Otherwise just restore the current scroll state
                            newWrapper.scrollLeft = currentScrollLeft;
                        }
                    }
                }
            } else if (state.course === 'memorize' && state.memorize.playMode === 'quiz') {
                let minFret = 0;
                if (state.memorize.stage === 3 || state.memorize.stage === 4) minFret = 5;
                if (minFret > 0) {
                    const fretCol = newWrapper.querySelector(`.fret-column[data-fret="${minFret}"]`);
                    if (fretCol) {
                        newWrapper.scrollLeft = fretCol.offsetLeft - 20;
                    }
                }
            }
        } else {
            newWrapper.scrollLeft = currentScrollLeft;
        }
    }

    // Refresh state bar
    const vDisplay = document.getElementById('app-version-display');
    if (vDisplay) vDisplay.textContent = `Ver. ${FRETBOARD_CRUISE_APP_VERSION}`;
    const rb = document.getElementById('in-game-refresh-bar');
    if (rb) {
        rb.classList.remove('hidden');
        const reloadBtn = rb.querySelector('.js-reload-app');
        if (reloadBtn) {
            reloadBtn.onclick = () => {
                stopRhythm();
                window.location.reload();
            };
        }
    }
}

function renderHome(app) {
    app.innerHTML = `
        <header>
            <h1 class="home-title">指板クルーズ</h1>
        </header>
        <div class="action-btns" style="flex-direction: column; gap: 20px; align-items: center; width: 100%;">
            <button class="btn-primary" id="btn-memorize" style="width: 80%; padding: 20px; font-size: 1.2rem;">覚えるコース</button>
            <button class="btn-secondary" id="btn-visualize" style="width: 80%; padding: 20px; font-size: 1.2rem;">自由探索モード</button>
        </div>
    `;

    document.getElementById('btn-memorize').onclick = () => {
        state.course = 'modeSelect';
        saveState();
        renderApp();
    };

    document.getElementById('btn-visualize').onclick = () => {
        state.course = 'visualize';
        saveState();
        renderApp();
    };
}

function renderModeSelect(app) {
    app.innerHTML = `
        <header style="padding-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 20px;">
                <button class="icon-btn" id="btn-back">◀ ホーム</button>
                <h2 style="font-size: 1.5rem; margin:0;">モード選択</h2>
                <button class="icon-btn" id="btn-settings" style="font-size: 1.5rem; background: none; border: none; padding: 0; cursor: pointer;" title="設定">⚙️</button>
            </div>
        </header>
        <div class="stage-list">
            <button class="stage-btn" data-mode="cruise">
                🛳️ クルージングモード
                <span class="stage-desc">光る場所をなぞって指板を覚えよう！</span>
            </button>
            <button class="stage-btn" data-mode="quiz">
                🎯 問題モード
                <span class="stage-desc">自力で音を探すテスト形式！</span>
            </button>
        </div>
    `;

    document.getElementById('btn-back').onclick = () => {
        state.course = null;
        saveState();
        renderApp();
    };

    document.querySelectorAll('.stage-btn').forEach(btn => {
        btn.onclick = () => {
            state.memorize.playMode = btn.getAttribute('data-mode');
            state.course = 'stageSelect';
            saveState();
            renderApp();
        };
    });
}

function renderStageSelect(app) {
    app.innerHTML = `
        <header style="padding-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 20px;">
                <button class="icon-btn" id="btn-back">◀ モード選択</button>
                <h2 style="font-size: 1.5rem; margin:0;">ステージ選択</h2>
                <button class="icon-btn" id="btn-settings-stage" style="font-size: 1.5rem; background: none; border: none; padding: 0; cursor: pointer;" title="設定">⚙️</button>
            </div>
        </header>
        <div class="stage-list">
            <button class="stage-btn" data-stage="1">STAGE 1<span class="stage-desc">開放弦〜3フレット (#なし)</span></button>
            <button class="stage-btn" data-stage="2">STAGE 2<span class="stage-desc">開放弦〜5フレット (#なし)</span></button>
            <button class="stage-btn" data-stage="3">STAGE 3<span class="stage-desc">5〜9フレット (#なし)</span></button>
            <button class="stage-btn" data-stage="4">STAGE 4<span class="stage-desc">5〜12フレット (#なし)</span></button>
            <button class="stage-btn" data-stage="5">STAGE 5<span class="stage-desc">総復習メドレー (STAGE 1〜4)</span></button>
            <button class="stage-btn" data-stage="6">STAGE 6<span class="stage-desc">全指板マスター (0〜12フレット)</span></button>
        </div>
    `;

    document.getElementById('btn-back').onclick = () => {
        state.course = 'modeSelect';
        saveState();
        renderApp();
    };

    document.getElementById('btn-settings-stage').onclick = () => {
        state.course = 'settings';
        saveState();
        renderApp();
    };

    document.querySelectorAll('.stage-btn').forEach(btn => {
        btn.onclick = () => {
            initAudio(); // Initialize audio on first user gesture
            state.memorize.stage = parseInt(btn.getAttribute('data-stage'));
            state.memorize.combo = 0;
            state.memorize.isCleared = false;
            state.course = 'memorize';
            
            if (state.memorize.playMode === 'cruise') {
                let sequence = [];
                let cruiseScope = [];

                if (state.memorize.stage === 5) {
                    // Medley Mode: combine stage 1, 2, 3, 4 sequences
                    for (let s = 1; s <= 4; s++) {
                        let targets = getStageTargets(s);
                        targets.forEach(t => t.midiNote = STRING_BASE_PITCHES[t.stringIdx] + t.fret);
                        
                        let grouped = {};
                        targets.forEach(t => {
                            if (!grouped[t.midiNote] || t.stringIdx < grouped[t.midiNote].stringIdx) {
                                grouped[t.midiNote] = t;
                            }
                        });
                        let uniqueTargets = Object.values(grouped);
                        uniqueTargets.sort((a, b) => a.midiNote - b.midiNote);
                        
                        cruiseScope.push(...uniqueTargets);
                        
                        let startIdx = uniqueTargets.findIndex(t => t.stringName === 5 && t.fret === 3);
                        if (startIdx === -1) startIdx = uniqueTargets.findIndex(t => t.stringName === 6 && t.fret === 8);
                        if (startIdx === -1) startIdx = uniqueTargets.findIndex(t => t.noteIdx === 0);
                        if (startIdx === -1) startIdx = 0;

                        let subSeq = [];
                        for (let i = startIdx; i >= 0; i--) subSeq.push(uniqueTargets[i]);
                        for (let i = 1; i < uniqueTargets.length; i++) subSeq.push(uniqueTargets[i]);
                        for (let i = uniqueTargets.length - 2; i >= startIdx; i--) subSeq.push(uniqueTargets[i]);
                        
                        // Connect seamlessly by skipping the return-to-start note for stages 1-3
                        if (s < 4) {
                            subSeq.pop();
                        }
                        sequence.push(...subSeq);
                    }
                } else {
                    let targets = getStageTargets(state.memorize.stage);
                    targets.forEach(t => t.midiNote = STRING_BASE_PITCHES[t.stringIdx] + t.fret);
                    
                    // Deduplicate by pitch, preferring lower fret / higher string (Skip for Stage 6)
                    let uniqueTargets;
                    if (state.memorize.stage === 6) {
                        uniqueTargets = [...targets];
                    } else {
                        let grouped = {};
                        targets.forEach(t => {
                            if (!grouped[t.midiNote] || t.stringIdx < grouped[t.midiNote].stringIdx) {
                                grouped[t.midiNote] = t;
                            }
                        });
                        uniqueTargets = Object.values(grouped);
                    }
                    uniqueTargets.sort((a, b) => a.midiNote - b.midiNote);
                    
                    cruiseScope = uniqueTargets;
                    
                    // Find starting C (5th string 3rd fret, or 6th string 8th fret, or any C)
                    let startIdx = uniqueTargets.findIndex(t => t.stringName === 5 && t.fret === 3);
                    if (startIdx === -1) startIdx = uniqueTargets.findIndex(t => t.stringName === 6 && t.fret === 8);
                    if (startIdx === -1) startIdx = uniqueTargets.findIndex(t => t.noteIdx === 0);
                    if (startIdx === -1) startIdx = 0;

                    for (let i = startIdx; i >= 0; i--) sequence.push(uniqueTargets[i]);
                    for (let i = 1; i < uniqueTargets.length; i++) sequence.push(uniqueTargets[i]);
                    for (let i = uniqueTargets.length - 2; i >= startIdx; i--) sequence.push(uniqueTargets[i]);
                }
                
                state.memorize.cruiseScope = cruiseScope;
                state.memorize.cruiseTargets = sequence;
                state.memorize.cruiseIndex = 0;
                state.memorize.currentQuestion = sequence[0];
                state.memorize.isFirstNote = true;
                state.memorize.hasTappedCurrentNote = false;
                state.memorize.tempFeedback = null;
                
                autoScrollRequested = true;
                startRhythm(); // Start the drum loop. It will trigger autoAdvanceCruise.
            } else {
                generateQuestion();
                autoScrollRequested = true;
            }
            
            saveState();
            renderApp();
        };
    });
}

function renderMemorize(app) {
    const q = state.memorize.currentQuestion;
    if (!q) {
        generateQuestion();
        renderApp();
        return;
    }

    const isCruise = state.memorize.playMode === 'cruise';

    if (state.memorize.isCleared) {
        app.innerHTML = `
            <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; text-align:center;">
                <h1 style="color:var(--primary-color); font-size:3rem; margin-bottom:20px;">CLEAR!</h1>
                <p style="font-size:1.2rem; margin-bottom:30px;">ルート制覇おめでとうございます！</p>
                <button class="btn-primary" id="btn-back-clear" style="padding:15px 30px; font-size:1.2rem;">ステージ選択へ戻る</button>
            </div>
        `;
        document.getElementById('btn-back-clear').onclick = () => {
            state.course = 'stageSelect';
            saveState();
            renderApp();
        };
        return;
    }

    let fbText = isCruise ? 'リズムに合わせてタップ！' : '指板をタップして回答してください';
    let fbClass = 'feedback-display';
    if (state.memorize.tempFeedback) {
        fbText = state.memorize.tempFeedback.text;
        fbClass = state.memorize.tempFeedback.className;
        state.memorize.tempFeedback = null; // consume
    }

    app.innerHTML = `
        <header style="padding-top: 10px;">
            <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: 20px;">
                <button class="icon-btn" id="btn-back">◀ ステージ</button>
                <div class="stats" style="gap: 15px;">
                    ${!isCruise ? `<div class="stat-item" style="color: ${quizTimeLeft <= 1.0 ? 'var(--error-color)' : 'inherit'}; min-width: 50px;"><span class="label">残り時間</span><span class="value" id="quiz-timer">${quizTimeLeft.toFixed(1)}s</span></div>` : ''}
                    <div class="stat-item"><span class="label">STAGE</span><span class="value">${state.memorize.stage}</span></div>
                    <div class="stat-item"><span class="label">正解</span><span class="value" id="score-correct">${state.memorize.correct}</span></div>
                    <div class="stat-item"><span class="label">連続</span><span class="value" id="score-combo">${state.memorize.combo}</span></div>
                </div>
            </div>
            <div class="question-text">${q.stringName}弦 の <span style="color: var(--primary-color); font-size: 2rem;">${q.noteName}</span> ${isCruise ? 'をタップ！' : 'を探せ！'}</div>
            <div id="feedback" class="${fbClass}" style="margin-bottom: 15px;">${fbText}</div>
        </header>

        <div id="fretboard-container" style="width: 100%;"></div>
    `;

    document.getElementById('btn-back').onclick = () => {
        stopRhythm();
        stopQuizTimer();
        state.course = 'stageSelect';
        saveState();
        renderApp();
    };

    renderFretboardHTML('fretboard-container', {
        mode: 'memorize',
        question: q,
        showAnswer: isCruise, // Cruise mode shows answer immediately
        clicked: null,
        onFretClick: handleFretClick
    });
}

function handleFretClick(stringNum, fret) {
    const q = state.memorize.currentQuestion;
    const fb = document.getElementById('feedback');
    const isCruise = state.memorize.playMode === 'cruise';
    
    let stringIdx = 6 - stringNum;
    let clickedNoteIdx = (OPEN_STRINGS[stringIdx] + fret) % 12;

    // Check if correct
    let isCorrect = false;
    if (isCruise) {
        // Cruise mode: exact fret match required because same note can be at fret 0 and 12
        isCorrect = (stringNum === q.stringName) && (fret === q.fret);
    } else {
        // Quiz mode: any fret with the correct note name on that string is fine
        isCorrect = (stringNum === q.stringName) && (clickedNoteIdx === q.noteIdx);
    }

    if (isCruise) {
        if (state.memorize.hasTappedCurrentNote || state.memorize.isCleared) return;
        
        let timeDiff = audioCtx.currentTime - nextTargetTime;
        
        // Check timing window (±150ms)
        if (Math.abs(timeDiff) > 0.15) {
            state.memorize.combo = 0;
            state.memorize.hasTappedCurrentNote = true;
            let fbText = timeDiff < 0 ? 'Early!' : 'Late!';
            showLiveFeedback(fbText, 'miss');
        } else {
            if (isCorrect) {
                playTone(stringIdx, fret);
                state.memorize.correct++;
                state.memorize.combo++;
                state.memorize.hasTappedCurrentNote = true;
                showLiveFeedback('Perfect!', 'good');
            } else {
                state.memorize.combo = 0;
                state.memorize.hasTappedCurrentNote = true;
                showLiveFeedback('Miss!', 'miss');
            }
        }
        saveState();
        return; // Don't call renderApp here, wait for autoAdvanceCruise
    }

    // --- Quiz Mode Logic Below ---
    if (state.memorize.hasTappedCurrentNote) return;
    stopQuizTimer();
    state.memorize.hasTappedCurrentNote = true;

    playTone(stringIdx, fret); // Play sound on any click

    if (isCorrect) {
        state.memorize.correct++;
        state.memorize.combo++;
        fb.textContent = '正解！';
        fb.className = 'feedback-display feedback-correct';
        
        renderFretboardHTML('fretboard-container', {
            mode: 'memorize',
            question: q,
            showAnswer: true,
            clicked: { stringNum, fret, isCorrect: true },
            onFretClick: null // disable clicking
        });

    } else {
        state.memorize.combo = 0;
        fb.textContent = `不正解... 正解はここ！`;
        fb.className = 'feedback-display feedback-wrong';
        
        renderFretboardHTML('fretboard-container', {
            mode: 'memorize',
            question: q,
            showAnswer: true,
            clicked: { stringNum, fret, isCorrect: false },
            onFretClick: null // disable clicking
        });
    }

    saveState();

    setTimeout(() => {
        generateQuestion();
        renderApp();
        // Play the next question note
        setTimeout(() => {
            if (state.memorize.currentQuestion) {
                playTone(state.memorize.currentQuestion.stringIdx, state.memorize.currentQuestion.fret);
            }
        }, 100);
    }, 1000); // 1 second delay to see the result
}

function showLiveFeedback(text, type) {
    const fb = document.getElementById('feedback');
    if (fb) {
        fb.textContent = text;
        if (type === 'good') fb.className = 'feedback-display feedback-correct';
        else if (type === 'miss') fb.className = 'feedback-display feedback-wrong';
        else fb.className = 'feedback-display';
        
        const sc = document.getElementById('score-correct');
        const scombo = document.getElementById('score-combo');
        if (sc) sc.textContent = state.memorize.correct;
        if (scombo) scombo.textContent = state.memorize.combo;
    }
}

function renderVisualize(app) {
    app.innerHTML = `
        <header style="padding-top: 10px; margin-bottom: 5px;">
            <div style="display: flex; justify-content: space-between; width: 100%;">
                <button class="icon-btn" id="btn-back">◀ ホーム</button>
                <h2 style="font-size: 1.5rem; margin:0;">自由探索モード</h2>
            </div>
        </header>

        <div class="setup-panel">
            <div class="setup-item">
                <label>Key</label>
                <select id="vis-key">
                    ${NOTES.map((note, idx) => `<option value="${idx}" ${state.visualize.key===idx?'selected':''}>${note}</option>`).join('')}
                </select>
            </div>
            <div class="setup-item">
                <label>Capo</label>
                <select id="vis-capo">
                    ${[0,1,2,3,4,5,6,7].map(c => `<option value="${c}" ${state.visualize.capo===c?'selected':''}>${c}</option>`).join('')}
                </select>
            </div>
            <div class="setup-item">
                <label>Display</label>
                <div class="mode-buttons">
                    <button class="mode-btn ${state.visualize.displayMode==='note'?'active':''}" data-mode="note">音名</button>
                    <button class="mode-btn ${state.visualize.displayMode==='degree'?'active':''}" data-mode="degree">度数</button>
                </div>
            </div>
        </div>

        <div id="fretboard-container" style="width: 100%;"></div>

        <div style="margin-top: 20px; width: 100%;">
            <h3 style="font-size: 1rem; color: rgba(255,255,255,0.7); margin-bottom: 10px;">Diatonic Chords (UI Only)</h3>
            <div class="chord-list">
                <button class="chord-btn active">I</button>
                <button class="chord-btn">IIm</button>
                <button class="chord-btn">IIIm</button>
                <button class="chord-btn">IV</button>
                <button class="chord-btn">V</button>
                <button class="chord-btn">VIm</button>
                <button class="chord-btn">VIIm7b5</button>
            </div>
        </div>
    `;

    document.getElementById('btn-back').onclick = () => {
        state.course = null;
        saveState();
        renderApp();
    };

    document.getElementById('vis-key').onchange = (e) => {
        state.visualize.key = parseInt(e.target.value);
        saveState();
        renderApp();
    };

    document.getElementById('vis-capo').onchange = (e) => {
        state.visualize.capo = parseInt(e.target.value);
        saveState();
        renderApp();
    };

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.onclick = () => {
            state.visualize.displayMode = btn.getAttribute('data-mode');
            saveState();
            renderApp();
        };
    });

    renderFretboardHTML('fretboard-container', {
        mode: 'visualize',
        keyIndex: state.visualize.key,
        capo: state.visualize.capo,
        displayMode: state.visualize.displayMode
    });
}

function renderSettings(app) {
    app.innerHTML = `
        <header style="padding-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 20px;">
                <button class="icon-btn" id="btn-back-settings">◀ 戻る</button>
                <h2 style="font-size: 1.5rem; margin:0;">設定</h2>
            </div>
        </header>
        
        <div style="padding: 20px; background: rgba(255,255,255,0.05); border-radius: 12px; margin-bottom: 20px;">
            <h3 style="color: var(--primary-color); margin-bottom: 15px;">クルージングモードのテンポ</h3>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span>遅い</span>
                <span style="font-size: 1.2rem; font-weight: bold;" id="tempo-display">BPM: ${state.settings.tempo}</span>
                <span>速い</span>
            </div>
            <input type="range" id="tempo-slider" min="40" max="120" value="${state.settings.tempo}" style="width: 100%;">
            <p style="font-size: 0.8rem; color: #aaa; margin-top: 15px;">
                ※BPM 75 が初心者向けの推奨スピードです。<br>
                「ドン・タン・ドン・タン」の「タン」の瞬間に合わせてタップしてください。
            </p>
        </div>

        <div style="padding: 20px; background: rgba(255,255,255,0.05); border-radius: 12px; margin-bottom: 20px;">
            <h3 style="color: var(--primary-color); margin-bottom: 15px;">問題モードの制限時間</h3>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span>短い</span>
                <span style="font-size: 1.2rem; font-weight: bold;" id="timer-display">${state.settings.quizTimeLimit} 秒</span>
                <span>長い</span>
            </div>
            <input type="range" id="timer-slider" min="1" max="10" step="1" value="${state.settings.quizTimeLimit}" style="width: 100%;">
            <p style="font-size: 0.8rem; color: #aaa; margin-top: 15px;">
                ※設定した秒数以内に答えないとMissになります。（推奨: 3秒）
            </p>
        </div>

        <div style="padding: 20px; background: rgba(255,255,255,0.05); border-radius: 12px; margin-bottom: 20px;">
            <h3 style="color: var(--primary-color); margin-bottom: 15px;">指板の視点</h3>
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <button class="view-mode-btn ${state.settings.viewMode === 'front' ? 'active' : ''}" id="btn-view-front" style="flex:1; padding: 10px; border-radius: 8px; border: 1px solid #444; background: #222; color: #fff; cursor: pointer;">正面（図面）</button>
                <button class="view-mode-btn ${state.settings.viewMode === 'player' ? 'active' : ''}" id="btn-view-player" style="flex:1; padding: 10px; border-radius: 8px; border: 1px solid #444; background: #222; color: #fff; cursor: pointer;">演奏者（リアル）</button>
            </div>

            <div style="display: flex; flex-direction: column; align-items: center; margin: 20px 0;">
                <div style="position: relative; width: 100%; display: flex; justify-content: center; align-items: center; overflow: visible;">
                    <div id="tilt-preview-container" style="width: 100%; pointer-events: none;"></div>
                    
                    <!-- Trackball UI (only visible in player mode) -->
                    <div id="trackball-area" style="position: absolute; width: 160px; height: 160px; background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), rgba(0,0,0,0.4)); border-radius: 50%; border: 2px solid rgba(255,255,255,0.4); box-shadow: 0 10px 20px rgba(0,0,0,0.5), inset 0 0 20px rgba(255,255,255,0.5); cursor: grab; display: flex; justify-content: center; align-items: center; z-index: 10; display: ${state.settings.viewMode === 'player' ? 'flex' : 'none'};">
                        <div id="trackball-pointer" style="width: 12px; height: 12px; background: #4f9cf9; border-radius: 50%; box-shadow: 0 0 10px #4f9cf9; transition: transform 0.1s ease;"></div>
                    </div>
                </div>
            </div>
            
            <div id="tilt-setting-group" style="display: ${state.settings.viewMode === 'player' ? 'block' : 'none'}; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px; margin-top: 5px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-size: 0.9rem;">指板の傾き（3Dぐりぐり操作）</span>
                    <button id="btn-reset-tilt" style="background:none; border:1px solid #666; color:#ccc; border-radius:4px; padding:2px 8px; font-size:0.8rem; cursor:pointer;">リセット</button>
                </div>
                <p style="font-size: 0.8rem; color: #888; margin-bottom: 15px;">
                    ※中央をドラッグで「上下左右」、端をドラッグで「回転」します。<br>
                    ※プレビューは本番と同じ実寸大です。はみ出ている場合は横スクロールできます。
                </p>

                <div style="display: flex; gap: 8px; margin-bottom: 20px;">
                    <button class="preset-btn" data-preset="front" style="flex:1; padding: 8px; border-radius: 6px; border: 1px solid #444; background: #222; color: #fff; cursor: pointer; font-size: 0.85rem;">正面</button>
                    <button class="preset-btn" data-preset="diagonal" style="flex:1; padding: 8px; border-radius: 6px; border: 1px solid #444; background: #222; color: #fff; cursor: pointer; font-size: 0.85rem;">斜め</button>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
                    <div>
                        <div style="display:flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--primary-color); margin-bottom: 4px;">
                            <span>X軸（前後）</span>
                            <div style="display:flex; align-items:center; gap: 6px;">
                                <span id="rot-x-disp">${Math.round(state.settings.rotation.x)}°</span>
                                <button class="axis-reset-btn" data-axis="x" style="background:none; border:1px solid #555; color:#aaa; border-radius:3px; padding:1px 5px; font-size:0.7rem; cursor:pointer;">0°</button>
                            </div>
                        </div>
                        <input type="range" id="rot-x-slider" min="-90" max="90" step="1" value="${state.settings.rotation.x}" style="width: 100%;">
                    </div>

                    <div>
                        <div style="display:flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--primary-color); margin-bottom: 4px;">
                            <span>Y軸（左右）</span>
                            <div style="display:flex; align-items:center; gap: 6px;">
                                <span id="rot-y-disp">${Math.round(state.settings.rotation.y)}°</span>
                                <button class="axis-reset-btn" data-axis="y" style="background:none; border:1px solid #555; color:#aaa; border-radius:3px; padding:1px 5px; font-size:0.7rem; cursor:pointer;">0°</button>
                            </div>
                        </div>
                        <input type="range" id="rot-y-slider" min="-90" max="90" step="1" value="${state.settings.rotation.y}" style="width: 100%;">
                    </div>

                    <div>
                        <div style="display:flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--primary-color); margin-bottom: 4px;">
                            <span>Z軸（回転）</span>
                            <div style="display:flex; align-items:center; gap: 6px;">
                                <span id="rot-z-disp">${Math.round(state.settings.rotation.z)}°</span>
                                <button class="axis-reset-btn" data-axis="z" style="background:none; border:1px solid #555; color:#aaa; border-radius:3px; padding:1px 5px; font-size:0.7rem; cursor:pointer;">0°</button>
                            </div>
                        </div>
                        <input type="range" id="rot-z-slider" min="-180" max="180" step="1" value="${state.settings.rotation.z}" style="width: 100%;">
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-size: 0.9rem;">遠近感（弱 ← → 強）</span>
                    <span style="font-weight: bold; color: var(--primary-color);" id="persp-display">${state.settings.perspective}</span>
                </div>
                <input type="range" id="persp-slider" min="0" max="100" step="1" value="${state.settings.perspective}" style="width: 100%;">
                <p style="font-size: 0.75rem; color: #888; margin-top: 5px; margin-bottom: 15px;">
                    ※上下方向の遠近感を調整します。
                </p>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-size: 0.9rem;">横の遠近感（ヘッド ← → 12F）</span>
                    <span style="font-weight: bold; color: var(--primary-color);" id="persp-origin-display">${state.settings.perspOriginX}</span>
                </div>
                <input type="range" id="persp-origin-slider" min="0" max="100" step="1" value="${state.settings.perspOriginX}" style="width: 100%;">
                <p style="font-size: 0.75rem; color: #888; margin-top: 5px;">
                    ※数値を上げると12フレット側が大きく、ヘッド側が小さくなります。
                </p>
            </div>
            
            <p style="font-size: 0.8rem; color: #aaa; margin-top: 10px;">
                ※「演奏者」を選ぶと、ギターを抱えた時のように6弦が一番上に表示されます。
            </p>
        </div>
    `;

    document.getElementById('btn-back-settings').onclick = () => {
        state.course = 'modeSelect';
        saveState();
        renderApp();
    };

    const tempoSlider = document.getElementById('tempo-slider');
    const tempoDisplay = document.getElementById('tempo-display');
    tempoSlider.oninput = (e) => {
        state.settings.tempo = parseInt(e.target.value);
        tempoDisplay.textContent = `BPM: ${state.settings.tempo}`;
        saveState();
    };

    const timerSlider = document.getElementById('timer-slider');
    const timerDisplay = document.getElementById('timer-display');
    timerSlider.oninput = (e) => {
        state.settings.quizTimeLimit = parseInt(e.target.value);
        timerDisplay.textContent = `${state.settings.quizTimeLimit} 秒`;
        saveState();
    };

    const btnFront = document.getElementById('btn-view-front');
    const btnPlayer = document.getElementById('btn-view-player');
    const tiltGroup = document.getElementById('tilt-setting-group');
    const trackballArea = document.getElementById('trackball-area');

    const updatePreview = () => {
        renderFretboardHTML('tilt-preview-container', {
            mode: 'visualize',
            question: null,
            showAnswer: true,
            displayMode: 'note',
            keyIndex: 0,
            capo: 0,
            onFretClick: null
        });
    };

    btnFront.onclick = () => {
        state.settings.viewMode = 'front';
        tiltGroup.style.display = 'none';
        trackballArea.style.display = 'none';
        btnFront.classList.add('active');
        btnPlayer.classList.remove('active');
        saveState();
        updatePreview();
    };
    btnPlayer.onclick = () => {
        state.settings.viewMode = 'player';
        tiltGroup.style.display = 'block';
        trackballArea.style.display = 'flex';
        btnPlayer.classList.add('active');
        btnFront.classList.remove('active');
        saveState();
        updatePreview();
    };

    // Render real-size preview
    renderFretboardHTML('tilt-preview-container', {
        mode: 'visualize',
        question: null,
        showAnswer: true,
        displayMode: 'note',
        keyIndex: 0,
        capo: 0,
        onFretClick: null
    });

    // Drag logic for Trackball
    const dragArea = document.getElementById('trackball-area');
    const dispX = document.getElementById('rot-x-disp');
    const dispY = document.getElementById('rot-y-disp');
    const dispZ = document.getElementById('rot-z-disp');
    const perspSlider = document.getElementById('persp-slider');
    const perspDisp = document.getElementById('persp-display');
    const perspOriginSlider = document.getElementById('persp-origin-slider');
    const perspOriginDisp = document.getElementById('persp-origin-display');
    
    let isDragging = false;
    let startX = 0, startY = 0;
    let initRotX = 0, initRotY = 0, initRotZ = 0;
    let dragMode = 'xy'; // 'xy' or 'z'

    function updatePreviewTransform() {
        const r = state.settings.rotation;
        const p_intensity = state.settings.perspective; // 0 to 100
        const p_px = 2000 - (p_intensity * 17); // 0 -> 2000px, 100 -> 300px
        
        // Horizontal perspective: perspOriginX 0->0%, 50->50%, 100->100%
        const originX = state.settings.perspOriginX || 50;
        
        // Update fretboard
        const previewContainer = document.querySelector('#tilt-preview-container .fretboard-container');
        const perspectiveWrapper = document.querySelector('#tilt-preview-container .fretboard-perspective-wrapper');
        
        if (perspectiveWrapper && previewContainer) {
            perspectiveWrapper.style.perspectiveOrigin = `${100 - originX}% 50%`;
            perspectiveWrapper.style.perspective = `${p_px}px`;
            previewContainer.style.transform = `rotateX(${r.x}deg) rotateY(${r.y}deg) rotateZ(${r.z}deg)`;
        }
        
        // Update trackball pointer
        const pointer = document.getElementById('trackball-pointer');
        if (pointer) {
            const ptX = (r.y / 80) * 60;
            const ptY = (-r.x / 80) * 60;
            pointer.style.transform = `translate(${ptX}px, ${ptY}px) rotate(${r.z}deg)`;
            pointer.style.background = dragMode === 'z' ? '#c77dff' : '#4f9cf9';
            pointer.style.boxShadow = `0 0 10px ${dragMode === 'z' ? '#c77dff' : '#4f9cf9'}`;
        }
        dispX.textContent = `${Math.round(r.x)}°`;
        dispY.textContent = `${Math.round(r.y)}°`;
        dispZ.textContent = `${Math.round(r.z)}°`;
        
        document.getElementById('rot-x-slider').value = r.x;
        document.getElementById('rot-y-slider').value = r.y;
        document.getElementById('rot-z-slider').value = r.z;

        perspDisp.textContent = `${p_intensity}`;
        perspOriginDisp.textContent = `${originX}`;
        perspOriginSlider.value = originX;
    }

    perspSlider.oninput = (e) => {
        state.settings.perspective = parseInt(e.target.value);
        updatePreviewTransform();
        saveState();
    };

    perspOriginSlider.oninput = (e) => {
        state.settings.perspOriginX = parseInt(e.target.value);
        updatePreviewTransform();
        saveState();
    };

    document.getElementById('rot-x-slider').oninput = (e) => {
        state.settings.rotation.x = parseInt(e.target.value);
        updatePreviewTransform();
        saveState();
    };
    document.getElementById('rot-y-slider').oninput = (e) => {
        state.settings.rotation.y = parseInt(e.target.value);
        updatePreviewTransform();
        saveState();
    };
    document.getElementById('rot-z-slider').oninput = (e) => {
        state.settings.rotation.z = parseInt(e.target.value);
        updatePreviewTransform();
        saveState();
    };

    // Axis reset buttons
    document.querySelectorAll('.axis-reset-btn').forEach(btn => {
        btn.onclick = () => {
            const axis = btn.getAttribute('data-axis');
            state.settings.rotation[axis] = 0;
            updatePreviewTransform();
            saveState();
        };
    });

    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
        btn.onclick = () => {
            const preset = btn.getAttribute('data-preset');
            if (preset === 'front') {
                state.settings.rotation = {x: 0, y: 0, z: 0};
                state.settings.perspective = 0;
                state.settings.perspOriginX = 50;
            } else if (preset === 'diagonal') {
                state.settings.rotation = {x: 45, y: 0, z: 0};
                state.settings.perspective = 30;
                state.settings.perspOriginX = 50;
            }
            perspSlider.value = state.settings.perspective;
            perspOriginSlider.value = state.settings.perspOriginX;
            updatePreviewTransform();
            saveState();
        };
    });

    function handleDragStart(e) {
        isDragging = true;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        startX = clientX;
        startY = clientY;
        
        initRotX = state.settings.rotation.x;
        initRotY = state.settings.rotation.y;
        initRotZ = state.settings.rotation.z;

        // Determine if dragging near edges of the trackball
        if (dragArea) {
            const rect = dragArea.getBoundingClientRect();
            const relX = clientX - rect.left;
            const relY = clientY - rect.top;
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            
            // Distance from center
            const dist = Math.sqrt(Math.pow(relX - cx, 2) + Math.pow(relY - cy, 2));
            const radius = rect.width / 2;
            
            // If dragging in the outer 30% of the trackball, it's Z rotation
            if (dist > radius * 0.7) {
                dragMode = 'z';
            } else {
                dragMode = 'xy';
            }
        }
        
        updatePreviewTransform(); // update color immediately
        dragArea.style.cursor = 'grabbing';
        // Only prevent default if it's touch to avoid scrolling while rotating, but we might want scroll?
        // Let's not prevent default on mouse down so they can still scroll the container horizontally.
    }

    function handleDragMove(e) {
        if (!isDragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        const deltaX = clientX - startX;
        const deltaY = clientY - startY;

        if (dragMode === 'xy') {
            state.settings.rotation.y = initRotY + deltaX * 0.5;
            state.settings.rotation.x = initRotX - deltaY * 0.5;
        } else {
            // Simple Z rotation based on vertical + horizontal drag combined
            state.settings.rotation.z = initRotZ + (deltaX + deltaY) * 0.5;
        }

        // Clamp
        state.settings.rotation.x = Math.max(-80, Math.min(80, state.settings.rotation.x));
        state.settings.rotation.y = Math.max(-80, Math.min(80, state.settings.rotation.y));
        state.settings.rotation.z = Math.max(-180, Math.min(180, state.settings.rotation.z));

        updatePreviewTransform();
    }

    function handleDragEnd() {
        if (isDragging) {
            isDragging = false;
            dragArea.style.cursor = 'grab';
            saveState();
        }
    }

    dragArea.addEventListener('mousedown', handleDragStart);
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);

    dragArea.addEventListener('touchstart', handleDragStart, {passive: false});
    document.addEventListener('touchmove', handleDragMove, {passive: false});
    document.addEventListener('touchend', handleDragEnd);

    document.getElementById('btn-reset-tilt').onclick = () => {
        state.settings.rotation = { x: 12, y: 0, z: 0 };
        state.settings.perspective = 50;
        state.settings.perspOriginX = 50;
        perspSlider.value = 50;
        perspOriginSlider.value = 50;
        updatePreviewTransform();
        saveState();
    };

    // Cleanup listeners when unmounting would be good, but innerHTML replace clears DOM
}

function renderFretboardHTML(containerId, options) {
    const { 
        mode, question, showAnswer, clicked, onFretClick,
        keyIndex, capo, displayMode 
    } = options;

    const isPlayerView = state.settings.viewMode === 'player';
    const r = isPlayerView ? state.settings.rotation : {x:0, y:0, z:0};
    
    // Default perspective intensity is 50. If old value (>100), migrate it.
    if (state.settings.perspective > 100) {
        state.settings.perspective = Math.round((2000 - state.settings.perspective) / 17);
        if (state.settings.perspective < 0) state.settings.perspective = 0;
        if (state.settings.perspective > 100) state.settings.perspective = 100;
        saveState();
    }
    const p_intensity = state.settings.perspective !== undefined ? state.settings.perspective : 50;
    const p_px = 2000 - (p_intensity * 17);
    const originX = isPlayerView ? (state.settings.perspOriginX || 50) : 50;
    
    let hasHighlight = mode === 'memorize' && !showAnswer;
    let containerClass = isPlayerView ? 'fretboard-container view-player' : 'fretboard-container';
    
    // We use a perspective wrapper to apply the origin, and rotate the child container.
    let html = `<div class="fretboard-scroll-wrapper">`;
    html += `<div class="fretboard-perspective-wrapper" style="perspective: ${p_px}px; perspective-origin: ${100 - originX}% 50%; transform-style: preserve-3d;">`;
    html += `<div class="${containerClass}" style="transform: rotateX(${r.x}deg) rotateY(${r.y}deg) rotateZ(${r.z}deg);">`;
    
    // 3D Neck faces
    if (isPlayerView) {
        html += `<div class="neck-face neck-back"></div>`;
        html += `<div class="neck-face neck-top"></div>`;
        html += `<div class="neck-face neck-bottom"></div>`;
        html += `<div class="neck-face neck-left"></div>`;
        html += `<div class="neck-face neck-right"></div>`;
    }

    // Front face
    html += `<div class="neck-face neck-front">`;
    html += `<div class="strings-container ${hasHighlight ? 'has-highlight' : ''}">`;

    const stringOrder = isPlayerView ? [6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6];

    for (let s of stringOrder) { // Order based on view mode
        let stringNum = s;
        let stringIdx = 6 - stringNum;
        
        let isStringHighlighted = hasHighlight && (stringNum === question.stringName);
        let rowClass = isStringHighlighted ? 'string-row highlighted-string' : 'string-row';
        
        html += `<div class="${rowClass}" data-string="${stringNum}">`;
        html += `<div class="string-line"></div>`;

        for (let f = 0; f <= MAX_FRET; f++) {
            let noteIdx = (OPEN_STRINGS[stringIdx] + f) % 12;
            let markerHtml = '';
            
            // Interaction logic: in memorize mode, everything is interactive unless it's showing the answer in quiz mode
            let isInteractive = (mode === 'memorize'); 
            if (mode === 'memorize' && showAnswer && state.memorize.playMode === 'quiz') {
                isInteractive = false; // Disable clicking after answering in quiz mode
            }
            
            let fretClass = isInteractive ? 'fret-column interactive' : 'fret-column';
            
            if (mode === 'memorize') {
                let isTargetQuiz = (question && stringNum === question.stringName && noteIdx === question.noteIdx);
                let isTargetCruise = (question && stringNum === question.stringName && f === question.fret);
                let isClicked = clicked && (clicked.stringNum === stringNum && clicked.fret === f);

                if (state.memorize.playMode === 'cruise') {
                    // Cruise mode: always show answer, user must click it
                    let isScope = state.memorize.cruiseScope.some(t => t.stringName === stringNum && t.fret === f);
                    if (isTargetCruise) {
                        markerHtml = `<div class="note-marker target-note correct-note">${NOTES[noteIdx]}</div>`;
                    } else if (isScope) {
                        markerHtml = `<div class="note-marker target-note grey-note">${NOTES[noteIdx]}</div>`;
                    } else {
                        markerHtml = `<div class="note-marker hidden-note"></div>`;
                    }
                } else {
                    // Quiz mode
                    if (showAnswer) {
                        if (isTargetQuiz && isClicked) {
                            markerHtml = `<div class="note-marker target-note correct-note">${NOTES[noteIdx]}</div>`;
                        } else if (isTargetQuiz) {
                            markerHtml = `<div class="note-marker target-note correct-note">${NOTES[noteIdx]}</div>`;
                        } else if (isClicked && !clicked.isCorrect) {
                            markerHtml = `<div class="note-marker target-note wrong-note">${NOTES[noteIdx]}</div>`;
                        } else {
                            markerHtml = `<div class="note-marker hidden-note"></div>`;
                        }
                    } else {
                        markerHtml = `<div class="note-marker hidden-note"></div>`;
                    }
                }
            } else if (mode === 'visualize') {
                let isBelowCapo = f < capo;
                if (isBelowCapo) {
                    markerHtml = `<div class="note-marker hidden-note"></div>`;
                } else {
                    let degreeRaw = (noteIdx - keyIndex + 12) % 12;
                    const scaleDegrees = {0: '1', 2: '2', 4: '3', 5: '4', 7: '5', 9: '6', 11: '7'};
                    let isScale = scaleDegrees.hasOwnProperty(degreeRaw);
                    
                    let label = displayMode === 'degree' ? (isScale ? scaleDegrees[degreeRaw] : '') : NOTES[noteIdx];
                    
                    let roleClass = 'role-non-target';
                    if (isScale) {
                        if (degreeRaw === 0) roleClass = 'role-root';
                        else if (degreeRaw === 4) roleClass = 'role-third';
                        else if (degreeRaw === 7) roleClass = 'role-fifth';
                        else if (degreeRaw === 11) roleClass = 'role-seventh';
                        else roleClass = 'role-other'; 
                    }

                    if (label === '') roleClass = 'role-non-target';

                    markerHtml = `<div class="note-marker ${roleClass}">${label}</div>`;
                }
            }

            let markerClass = isInteractive ? 'note-marker-wrapper interactive' : 'note-marker-wrapper';
            html += `<div class="${fretClass}" data-string="${stringNum}" data-fret="${f}"><div class="${markerClass}">${markerHtml}</div></div>`;
        }
        html += `</div>`;
    }
    html += `</div>`;

    // Labels
    html += `<div class="fretboard-labels">`;
    for (let f = 0; f <= MAX_FRET; f++) {
        html += `<div class="fret-label" data-fret="${f}">${f}</div>`;
    }
    html += `</div>`;
    
    html += `</div>`; // neck-front
    html += `</div></div></div>`; // container & perspective-wrapper & scroll-wrapper
    
    const containerEl = document.getElementById(containerId);
    containerEl.innerHTML = html;

    addFretboardDots(containerId);

    // Attach events
    if (onFretClick) {
        const interactiveFrets = containerEl.querySelectorAll('.fret-column.interactive');
        interactiveFrets.forEach(el => {
            el.onclick = () => {
                let s = parseInt(el.getAttribute('data-string'));
                let f = parseInt(el.getAttribute('data-fret'));
                onFretClick(s, f);
            };
        });
    } else if (mode === 'visualize') {
        const frets = containerEl.querySelectorAll('.fret-column');
        frets.forEach(el => {
            el.onclick = () => {
                let s = parseInt(el.getAttribute('data-string'));
                let f = parseInt(el.getAttribute('data-fret'));
                let stringIdx = 6 - s;
                playTone(stringIdx, f);
            };
        });
    }
}

function addFretboardDots(containerId) {
    const container = document.getElementById(containerId).querySelector('.fretboard-container');
    if (!container) return;

    const singleDotFrets = [3, 5, 7, 9];
    singleDotFrets.forEach(f => {
        const col = container.querySelector(`.string-row[data-string="3"] .fret-column[data-fret="${f}"]`);
        if (col) {
            let dot = document.createElement('div');
            dot.className = 'fret-dot';
            dot.style.top = '100%';
            dot.style.left = '50%';
            dot.style.transform = 'translate(-50%, -50%)';
            col.appendChild(dot);
        }
    });

    const fret12RowA = container.querySelector(`.string-row[data-string="5"] .fret-column[data-fret="12"]`);
    if (fret12RowA) {
        let dot = document.createElement('div');
        dot.className = 'fret-dot';
        dot.style.top = '100%';
        dot.style.left = '50%';
        dot.style.transform = 'translate(-50%, -50%)';
        fret12RowA.appendChild(dot);
    }
    
    const fret12RowB = container.querySelector(`.string-row[data-string="3"] .fret-column[data-fret="12"]`);
    if (fret12RowB) {
        let dot = document.createElement('div');
        dot.className = 'fret-dot';
        dot.style.top = '100%';
        dot.style.left = '50%';
        dot.style.transform = 'translate(-50%, -50%)';
        fret12RowB.appendChild(dot);
    }
}

// Initial render
document.addEventListener('DOMContentLoaded', () => {
    renderApp();
});
