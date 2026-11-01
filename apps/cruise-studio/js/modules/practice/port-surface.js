/* Port owns practice menus, calendar, timer, history, attachments and their persistence. */
(function (root) {
    'use strict';
    var CS = root.CruiseStudio = root.CruiseStudio || {};
    var audio = null, shell = null, handle = null, frame = null;
    var active = false, disposed = false, generation = 0, phase = 'idle', stopPromise = Promise.resolve({ ok: true });
    var pendingLeave = null;
    var node = document.getElementById('screen-port-practice');
    var surface = document.getElementById('port-practice-surface');
    var status = document.getElementById('port-practice-status');
    var resume = document.getElementById('port-practice-resume');
    var overview = document.getElementById('port-practice-overview');
    var stopButton = document.getElementById('shell-audio-stop');
    var portUrl = new URL('../cruise-port/pro_9a3943176561/#practice-menu', document.baseURI);

    function isPracticeRoute(hash) { return hash === '#sync-center' || hash === '#practice-menu' || hash.startsWith('#practice-menu/'); }
    function setPhase(next, message) {
        phase = next;
        status.textContent = message || '';
        node.dataset.portPracticePhase = next;
        resume.hidden = !active || next === 'loading' || next === 'ready';
    }
    function removeFrame() {
        clearPendingLeave();
        if (!frame) return;
        var old = frame;
        frame = null;
        try { void CS.stopNativePort(old); } catch (_) {}
        old.onload = null;
        old.onerror = null;
        old.remove(); // Port owns timer persistence and pagehide cleanup.
    }
    function clearPendingLeave() {
        if (!pendingLeave) return;
        pendingLeave.observer.disconnect();
        pendingLeave.dialog.removeEventListener('click', pendingLeave.onAction, true);
        pendingLeave = null;
    }
    function requestLeave(next) {
        if (!frame || !active) return false;
        var child, form, dialog, cancel, error;
        try {
            child = frame.contentWindow;
            var preset = child.document.getElementById('practice-set-dialog');
            if (preset && !preset.hidden) { status.textContent = 'プリセットの編集を保存またはキャンセルしてから移動してください。'; return true; }
            form = child.document.getElementById('practice-form-view');
            dialog = child.document.getElementById('practice-exit-dialog');
            cancel = form?.querySelector('.view-back[data-action="cancel-form"]');
            error = child.document.getElementById('practice-form-error');
        } catch (_) { return false; }
        if (!form || form.hidden || !dialog || !cancel) return false;
        if (pendingLeave) { pendingLeave.next = next; return true; }
        var state = { next: next, dialog: dialog, action: '', sawDialog: false, observer: null, onAction: null };
        function check() {
            if (pendingLeave !== state || !active || !frame) return;
            if (!dialog.hidden) state.sawDialog = true;
            if (form.hidden && dialog.hidden) {
                var continueNavigation = state.next;
                clearPendingLeave();
                queueMicrotask(continueNavigation);
            } else if (state.sawDialog && dialog.hidden && (
                state.action === 'continue' || (!state.action) ||
                (state.action === 'save' && error && !error.hidden)
            )) clearPendingLeave();
        }
        state.onAction = function (event) {
            var button = event.target.closest('button');
            if (button?.id === 'practice-exit-save') state.action = 'save';
            if (button?.id === 'practice-exit-discard') state.action = 'discard';
            if (button?.id === 'practice-exit-continue') state.action = 'continue';
        };
        state.observer = new child.MutationObserver(check);
        state.observer.observe(form, { attributes: true, attributeFilter: ['hidden'] });
        state.observer.observe(dialog, { attributes: true, attributeFilter: ['hidden'] });
        if (error) state.observer.observe(error, { attributes: true, attributeFilter: ['hidden'] });
        dialog.addEventListener('click', state.onAction, true);
        pendingLeave = state;
        cancel.click(); // Reuse Port's own unsaved-edit confirmation and save path.
        child.setTimeout(check, 0);
        return true;
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
        setPhase('loading', 'Cruise Port 練習メニューを開いています…');
        await audio.cleanup(handle, 'before-open');
        if (CS.tuner?.whenStopped) await CS.tuner.whenStopped();
        if (CS.portMetronome?.whenStopped) await CS.portMetronome.whenStopped();
        if (!active || disposed || current !== generation) return false;
        // The Port document can navigate to its audio tools, so reserve output for its lifetime.
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
        next.title = 'Cruise Port 練習メニューと音楽カレンダー';
        next.allow = 'microphone';
        next.referrerPolicy = 'same-origin';
        next.className = 'port-tuner-frame port-practice-frame';
        next.onload = function () {
            if (!active || disposed || current !== generation || frame !== next) return;
            try {
                var child = next.contentWindow;
                CS.presentNativePort(next);
                if (child.location.origin !== portUrl.origin || child.location.pathname !== portUrl.pathname)
                    throw new Error('unexpected-port-document');
                function checkRoute() {
                    if (!active || frame !== next || child.document.body.dataset.componentState !== 'ready') return;
                    if (isPracticeRoute(child.location.hash)) setPhase('ready', '');
                    else shell.navigate('home');
                }
                child.addEventListener('studio-port-ready', checkRoute);
                child.addEventListener('hashchange', checkRoute);
                child.addEventListener('popstate', checkRoute);
                // Port's Home and Calendar controls also use history.pushState,
                // which emits neither hashchange nor popstate in the same document.
                child.document.addEventListener('click', function () { child.setTimeout(checkRoute, 0); });
                // Port boot normalizes its initial hash; select the real route afterwards.
                child.location.hash = '#practice-menu';
            } catch (_) {
                void stop('load-failed', 'Port 練習メニューを開けませんでした。別タブで開いてください。');
                setPhase('failed', status.textContent);
            }
        };
        next.onerror = function () {
            if (frame !== next) return;
            void stop('load-failed', 'Port 練習メニューを開けませんでした。別タブで開いてください。');
            setPhase('failed', status.textContent);
        };
        frame = next;
        next.src = portUrl.href;
        surface.append(next);
        return true;
    }
    function preserveEditor() {
        var form = frame?.contentDocument?.getElementById('practice-form-view');
        var preset = frame?.contentDocument?.getElementById('practice-set-dialog');
        if ((form && !form.hidden) || (preset && !preset.hidden)) { frame.contentWindow.CruiseStudioPortTool?.pause(); return true; }
        return false;
    }
    function onVisibility() {
        if (document.hidden && active && !preserveEditor()) void stop('page-hidden', 'Port画面を閉じました。再開するには練習メニューを開いてください。');
    }
    function onPagehide() { if (active) void stop('pagehide'); }
    function onGlobalStop() {
        if (shell.getCommandContext().activeModal || shell.keyboard.isIMEBlocked({})) return;
        if (active && !preserveEditor()) void stop('global-stop', 'Port画面を閉じました。再開するには練習メニューを開いてください。');
    }
    function onResume() { if (active && phase !== 'loading' && phase !== 'ready') void start(); }
    function onOverview() { shell.navigate('practice'); }
    CS.portPractice = Object.freeze({
        load: function () {},
        attach: function (options) {
            if (handle || disposed) return;
            audio = options.audio; shell = options.shell;
            handle = audio.register({ sessionId: 'studio.port.practice.surface', ownerFeatureId: 'port.practice',
                cleanup: function () {
                    if (frame) { generation++; removeFrame(); if (active) setPhase('idle', 'Port画面を閉じました。再開するには練習メニューを開いてください。'); }
                } });
            document.addEventListener('visibilitychange', onVisibility);
            window.addEventListener('pagehide', onPagehide);
            stopButton.addEventListener('click', onGlobalStop);
            resume.addEventListener('click', onResume);
            overview?.addEventListener('click', onOverview);
            if (active) void start();
        },
        activate: function () { active = true; if (handle) void start(); },
        deactivate: function () { active = false; resume.hidden = true; return stop('workspace-left'); },
        requestLeave: requestLeave,
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
            overview?.removeEventListener('click', onOverview);
            disposed = true;
            return handle ? audio.disposeSession(handle) : { ok: true };
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
