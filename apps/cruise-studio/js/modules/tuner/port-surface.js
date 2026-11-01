/* Port owns the tuner document, controls, settings and Pro gate. Studio owns only its frame lifetime. */
(function (root) {
    'use strict';
    var CS = root.CruiseStudio = root.CruiseStudio || {};
    var audio = null, shell = null, handle = null, frame = null;
    var active = false, disposed = false, generation = 0, phase = 'idle', stopPromise = Promise.resolve({ ok: true });
    var node = document.getElementById('screen-tuner');
    var surface = document.getElementById('port-tuner-surface');
    var status = document.getElementById('port-tuner-status');
    var resume = document.getElementById('port-tuner-resume');
    var stopButton = document.getElementById('shell-audio-stop');
    var portUrl = new URL('../cruise-port/pro_9a3943176561/#tuner', document.baseURI);

    function setPhase(next, message) {
        phase = next;
        status.textContent = message || '';
        node.dataset.portTunerPhase = next;
        resume.hidden = !active || next === 'loading' || next === 'running';
    }
    function removeFrame() {
        if (!frame) return;
        var old = frame;
        frame = null;
        try { void CS.stopNativePort(old); } catch (_) { /* Navigated documents own their cleanup. */ }
        old.onload = null;
        old.onerror = null;
        old.remove(); // A Port pagehide stops its microphone and preview audio.
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
        setPhase('loading', 'Cruise Port チューナーを開いています…');
        // The score-side quick tuner is another view of this tool; close it first.
        if (CS.tunerRuntime) await CS.tunerRuntime.stop('port-tuner-open');
        if (CS.portMetronome?.whenStopped) await CS.portMetronome.whenStopped();
        if (CS.portPractice?.whenStopped) await CS.portPractice.whenStopped();
        if (!active || disposed || current !== generation) return false;
        if (audio.getConflictingLeases('microphone/session').length) {
            setPhase('failed', 'Studio の音声を停止してから再試行してください。');
            return false;
        }
        var lease;
        try { lease = audio.request(handle, 'microphone/session'); }
        catch (_) { lease = null; }
        if (!lease || !audio.grant(handle, lease)) {
            setPhase('failed', '音声を使用できません。Global Stop 後に再試行してください。');
            return false;
        }
        var next = document.createElement('iframe');
        next.title = 'Cruise Port チューナー';
        next.allow = 'microphone';
        next.referrerPolicy = 'same-origin';
        next.className = 'port-tuner-frame';
        next.onload = function () {
            if (!active || disposed || current !== generation || frame !== next) return;
            try {
                var child = next.contentWindow;
                CS.presentNativePort(next);
                if (child.location.origin !== portUrl.origin || child.location.pathname !== portUrl.pathname)
                    throw new Error('unexpected-port-document');
                child.addEventListener('hashchange', function () {
                    if (!active || frame !== next || child.document.body.dataset.componentState !== 'ready') return;
                    if (child.location.hash === '#tuner') setPhase('running', '');
                    else shell.navigate('home');
                });
                // Port intentionally normalizes initial deep links; route only after its module boot.
                function ready() {
                    if (!active || frame !== next || child.document.body.dataset.componentState !== 'ready') return;
                    CS.presentNativePort(next);
                    child.location.hash = '#tuner';
                    setPhase('running', '');
                }
                child.addEventListener('studio-port-ready', ready);
                ready();
            } catch (_) {
                void stop('load-failed', 'Port チューナーを開けませんでした。別タブで開いてください。');
                setPhase('failed', status.textContent);
            }
        };
        next.onerror = function () {
            if (frame !== next) return;
            void stop('load-failed', 'Port チューナーを開けませんでした。別タブで開いてください。');
            setPhase('failed', status.textContent);
        };
        frame = next;
        next.src = portUrl.href;
        surface.append(next);
        return true;
    }
    function onVisibility() {
        if (document.hidden && active) void stop('page-hidden', 'マイクを停止しました。再開するにはチューナーを開いてください。');
    }
    function onPagehide() { if (active) void stop('pagehide'); }
    function onGlobalStop() {
        if (shell.getCommandContext().activeModal || shell.keyboard.isIMEBlocked({})) return;
        void audio.stopAll();
        if (active) void stop('global-stop', 'マイクを停止しました。再開するにはチューナーを開いてください。');
    }
    function onResume() { if (active && phase !== 'loading' && phase !== 'running') void start(); }
    CS.tuner = Object.freeze({
        load: function () {},
        attach: function (options) {
            if (handle || disposed) return;
            audio = options.audio; shell = options.shell;
            handle = audio.register({ sessionId: 'studio.port.tuner.surface', ownerFeatureId: 'port.tuner',
                cleanup: function () {
                    if (frame) { generation++; removeFrame(); if (active) setPhase('idle', 'マイクを停止しました。再開するにはチューナーを開いてください。'); }
                } });
            document.addEventListener('visibilitychange', onVisibility);
            window.addEventListener('pagehide', onPagehide);
            stopButton.addEventListener('click', onGlobalStop);
            resume.addEventListener('click', onResume);
            if (active) void start();
        },
        activate: function () { active = true; if (handle) void start(); },
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
