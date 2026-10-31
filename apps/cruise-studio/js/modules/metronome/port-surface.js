/* Port owns the metronome document, controls, settings, presets and Pro gate. */
(function (root) {
    'use strict';
    var CS = root.CruiseStudio = root.CruiseStudio || {};
    var audio = null, shell = null, handle = null, frame = null;
    var active = false, disposed = false, generation = 0, phase = 'idle', stopPromise = Promise.resolve({ ok: true });
    var node = document.getElementById('screen-metronome');
    var surface = document.getElementById('port-metronome-surface');
    var status = document.getElementById('port-metronome-status');
    var resume = document.getElementById('port-metronome-resume');
    var stopButton = document.getElementById('shell-audio-stop');
    var portUrl = new URL('port-tool.html', document.baseURI);

    function setPhase(next, message) {
        phase = next;
        status.textContent = message || '';
        node.dataset.portMetronomePhase = next;
        resume.hidden = !active || next === 'loading' || next === 'ready';
    }
    function removeFrame() {
        if (!frame) return;
        var old = frame;
        frame = null;
        try { void old.contentWindow?.CruiseStudioPortTool?.stop(); } catch (_) { /* Navigated documents own their cleanup. */ }
        old.onload = null;
        old.onerror = null;
        old.remove(); // Port pagehide stops the scheduler and AudioContext.
    }
    function stop(reason, message) {
        generation++;
        removeFrame();
        if (!disposed) setPhase('idle', message || '');
        stopPromise = handle ? audio.cleanup(handle, reason) : Promise.resolve({ ok: true });
        return stopPromise;
    }
    async function start() {
        if (!active || disposed || !audio || !shell) return false;
        var current = ++generation;
        setPhase('loading', 'Cruise Port メトロノームを開いています…');
        await audio.cleanup(handle, 'before-open');
        if (CS.tuner?.whenStopped) await CS.tuner.whenStopped();
        if (CS.portPractice?.whenStopped) await CS.portPractice.whenStopped();
        if (!active || disposed || current !== generation) return false;
        if (audio.getConflictingLeases('audio-output/session').length) {
            setPhase('failed', 'Studio の音声を停止してから再試行してください。');
            return false;
        }
        var lease;
        try { lease = audio.request(handle, 'audio-output/session'); }
        catch (_) { lease = null; }
        if (!lease || !audio.grant(handle, lease)) {
            setPhase('failed', '音声を使用できません。Global Stop 後に再試行してください。');
            return false;
        }
        var next = document.createElement('iframe');
        next.title = 'Cruise Port メトロノーム';
        next.referrerPolicy = 'same-origin';
        next.className = 'port-tuner-frame';
        next.onload = function () {
            if (!active || disposed || current !== generation || frame !== next) return;
            try {
                var child = next.contentWindow;
                if (child.location.origin !== portUrl.origin || child.location.pathname !== portUrl.pathname)
                    throw new Error('unexpected-port-document');
                child.addEventListener('hashchange', function () {
                    if (!active || frame !== next) return;
                    if (child.location.hash === '#metronome') setPhase('ready', '');
                    else shell.navigate('home');
                });
                // Port normalizes the initial deep link during boot.
                child.location.hash = '#metronome';
            } catch (_) {
                void stop('load-failed', 'Port メトロノームを開けませんでした。別タブで開いてください。');
                setPhase('failed', status.textContent);
            }
        };
        next.onerror = function () {
            if (frame !== next) return;
            void stop('load-failed', 'Port メトロノームを開けませんでした。別タブで開いてください。');
            setPhase('failed', status.textContent);
        };
        frame = next;
        next.src = portUrl.href;
        surface.append(next);
        return true;
    }
    function onVisibility() {
        if (document.hidden && active) void stop('page-hidden', '再生を停止しました。再開するにはメトロノームを開いてください。');
    }
    function onPagehide() { if (active) void stop('pagehide'); }
    function onGlobalStop() {
        if (shell.getCommandContext().activeModal || shell.keyboard.isIMEBlocked({})) return;
        if (active) void stop('global-stop', '再生を停止しました。再開するにはメトロノームを開いてください。');
    }
    function onResume() { if (active && phase !== 'loading' && phase !== 'ready') start(); }
    CS.portMetronome = Object.freeze({
        load: function () {},
        attach: function (options) {
            if (handle || disposed) return;
            audio = options.audio; shell = options.shell;
            handle = audio.register({ sessionId: 'studio.port.metronome.surface', ownerFeatureId: 'port.metronome',
                cleanup: function () {
                    if (frame) { generation++; removeFrame(); if (active) setPhase('idle', '再生を停止しました。再開するにはメトロノームを開いてください。'); }
                } });
            document.addEventListener('visibilitychange', onVisibility);
            window.addEventListener('pagehide', onPagehide);
            stopButton.addEventListener('click', onGlobalStop);
            resume.addEventListener('click', onResume);
            if (active) start();
        },
        activate: function () { active = true; if (handle) start(); },
        deactivate: function () { active = false; resume.hidden = true; return stop('workspace-left'); },
        getState: function () { return Object.freeze({ active: active, phase: phase, hasFrame: !!frame }); },
        whenStopped: function () { return stopPromise; },
        dispose: async function () {
            if (disposed) return { ok: true };
            active = false;
            await stop('dispose');
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', onPagehide);
            stopButton.removeEventListener('click', onGlobalStop);
            resume.removeEventListener('click', onResume);
            disposed = true;
            return handle ? audio.disposeSession(handle) : { ok: true };
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
