/* Score-side controls for the existing Studio tuner runtime. No second audio or storage owner. */
const CS = globalThis.CruiseStudio;

function mount() {
    if (!CS?.tunerRuntime || !CS?.shellHost) return;
    const tuner = CS.tunerRuntime, shell = CS.shellHost;
    const panel = document.getElementById('studio-quick-tuner');
    const launch = document.getElementById('shell-tuner-quick');
    const toggle = document.getElementById('studio-quick-tuner-toggle');
    const closeButton = document.getElementById('studio-quick-tuner-close');
    const fullButton = document.getElementById('studio-quick-tuner-full');
    const note = panel.querySelector('[data-quick-tuner-note]');
    const frequency = panel.querySelector('[data-quick-tuner-frequency]');
    const cents = panel.querySelector('[data-quick-tuner-cents]');
    const status = panel.querySelector('[data-quick-tuner-status]');
    const meter = panel.querySelector('[role="meter"]');
    const marker = panel.querySelector('[data-quick-tuner-marker]');
    let disposed = false, message = '', workspace = shell.getActiveWorkspace(), closePending = null;
    const errors = {
        'permission-denied': 'マイク権限を確認してください。', 'no-device': '入力デバイスがありません。',
        'device-busy': '入力デバイスを使用できません。', 'insecure-context': '安全な接続が必要です。',
        'resource-busy': '他の音声を停止してください。', 'cleanup-failed': '停止を再試行してください。'
    };
    function render(state = tuner.snapshot()) {
        if (disposed) return;
        const pitch = state.reading;
        note.textContent = pitch ? pitch.noteName + pitch.octave : '—';
        frequency.textContent = pitch ? pitch.frequency.toFixed(2) + ' Hz' : '— Hz';
        cents.textContent = pitch ? (pitch.cents >= 0 ? '+' : '') + pitch.cents.toFixed(1) + ' cents' : '— cents';
        const value = pitch ? Math.max(-50, Math.min(50, pitch.cents)) : 0;
        meter.setAttribute('aria-valuenow', String(value));
        meter.setAttribute('aria-valuetext', pitch ? cents.textContent : '入力待ち');
        meter.setAttribute('aria-label', pitch ? '音程 ' + note.textContent : '音程、入力待ち');
        marker.style.left = (50 + value) + '%';
        const stopping = state.state === 'requesting' || state.state === 'active' || state.state === 'releasing' || state.pendingCleanup > 0;
        toggle.textContent = stopping ? state.pendingCleanup > 0 ? '停止を再試行' : 'マイク停止' : 'マイク開始';
        toggle.setAttribute('aria-pressed', String(state.state === 'active'));
        toggle.disabled = !stopping && !state.canStart;
        status.textContent = message || errors[state.error] || ({ idle: '停止中', requesting: 'マイクの許可を確認中', active: '音程を確認中', releasing: '停止中', interrupted: '中断しました。再開は手動で行います。', failed: '開始できませんでした。', disposed: '停止済み' }[state.state] || '停止中');
    }
    function open() {
        if (disposed || shell.getCommandContext().activeModal || shell.keyboard.isIMEBlocked({})) return;
        panel.hidden = false; panel.inert = false; launch.setAttribute('aria-expanded', 'true');
        message = ''; workspace = shell.getActiveWorkspace(); render(); toggle.focus({ preventScroll: true });
    }
    async function close({ restoreFocus = true } = {}) {
        if (panel.hidden) return closePending || { ok: true };
        const hadFocus = panel.contains(document.activeElement);
        panel.hidden = true; panel.inert = true; launch.setAttribute('aria-expanded', 'false');
        message = '';
        if (hadFocus && restoreFocus) launch.focus({ preventScroll: true });
        const pending = Promise.resolve().then(() => tuner.stop('quick-panel-close'));
        closePending = pending;
        try { return await pending; }
        finally { if (closePending === pending) closePending = null; }
    }
    async function operate() {
        if (disposed || panel.hidden || shell.getCommandContext().activeModal || shell.keyboard.isIMEBlocked({})) return;
        const state = tuner.snapshot();
        if (state.state === 'requesting' || state.state === 'active' || state.state === 'releasing' || state.pendingCleanup > 0) {
            message = ''; await tuner.stop('quick-panel-stop'); return;
        }
        if (!state.canStart) return;
        if (CS.audio.getConflictingLeases('microphone/session').length) {
            message = '先に使用中の音声を停止してください。'; render(); return;
        }
        message = ''; render(); await tuner.start();
    }
    function onLaunch() { if (panel.hidden) open(); else void close(); }
    function onClose() { void close(); }
    function onFull() { void close({ restoreFocus: false }).then(result => { if (result.ok) shell.navigate('tuner'); }); }
    function onKey(event) { if (event.key === 'Escape' && !shell.getCommandContext().activeModal) { event.preventDefault(); event.stopPropagation(); void close(); } }
    function onVisibility() { if (document.hidden) void close({ restoreFocus: false }); }
    function onPagehide() { void close({ restoreFocus: false }); }
    function onWorkspace() { const next = shell.getActiveWorkspace(); if (next !== workspace) { workspace = next; if (!panel.hidden) void close({ restoreFocus: false }); } }
    const observer = new MutationObserver(onWorkspace);
    observer.observe(document.getElementById('studio-shell'), { attributes: true, attributeFilter: ['data-workspace'] });
    launch.addEventListener('click', onLaunch); closeButton.addEventListener('click', onClose);
    toggle.addEventListener('click', operate); fullButton.addEventListener('click', onFull);
    panel.addEventListener('keydown', onKey); document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPagehide);
    const off = tuner.subscribe(render);
    render();
    CS.quickTuner = Object.freeze({
        async dispose() {
            if (disposed) return { ok: true };
            const result = await close({ restoreFocus: false });
            observer.disconnect(); off();
            launch.removeEventListener('click', onLaunch); closeButton.removeEventListener('click', onClose);
            toggle.removeEventListener('click', operate); fullButton.removeEventListener('click', onFull);
            panel.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', onPagehide);
            disposed = true; return result;
        }
    });
}

if (CS?.tunerRuntime && CS?.shellHost) mount();
else document.addEventListener('DOMContentLoaded', mount, { once: true });
