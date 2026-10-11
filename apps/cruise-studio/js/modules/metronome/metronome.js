/* M1 free tool: memory-only settings, dedicated context, explicit resource lease. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.metronome = factory();
})(globalThis, function () {
    'use strict';
    function createRuntime(options) {
        var core = options.core, coordinator = options.coordinator, env = options.environment || {};
        var bpm = core.defaults.bpm, status = 'idle', error = null, generation = 0, run = null, disposed = false, destroyed = false;
        var listeners = new Set(), pendingCloses = new Set(), failedCloses = new Set(), bindings = [];
        // M2 can supply an explicit settings facade through options.settingsSource.
        // M1 deliberately never reads/calls it and has no implicit storage fallback.
        function snapshot() { return Object.freeze({ bpm: bpm, status: status, running: status === 'running', error: error,
            sessionId: handle.sessionId, pendingCloseCount: pendingCloses.size + failedCloses.size, engine: run ? run.engine.snapshot() : null }); }
        function publish() { listeners.forEach(function (fn) { try { fn(snapshot()); } catch (_) { /* isolate UI */ } }); }
        function closeRun(old) {
            if (!old) return Promise.resolve({ ok: true });
            if (failedCloses.delete(old)) old.closing = null; // explicit Stop/cleanup retry
            if (old.closing) return old.closing;
            if (old.context && old.stateListener) old.context.removeEventListener('statechange', old.stateListener);
            var closing;
            try { closing = old.engine.close(); } catch (e) { closing = Promise.reject(e); }
            old.closing = Promise.resolve(closing).then(function () {
                if (old.context) coordinator.forgetContext(handle, old.context);
                coordinator.release(handle, old.lease);
                return { ok: true };
            }, function (e) {
                // A failed close cannot be called a released resource. Keep its lease visible.
                failedCloses.add(old);
                if (!disposed) { error = String(e.message || e); status = 'failed'; publish(); }
                return { ok: false, error: String(e.message || e) };
            }).finally(function () { pendingCloses.delete(old.closing); publish(); });
            pendingCloses.add(old.closing); publish(); return old.closing;
        }
        function stop(reason) {
            generation++;
            var old = run; run = null;
            if (old) old.engine.stop(); // synchronous cancellation, including pending start
            status = disposed ? 'disposed' : (reason === 'interrupted' ? 'interrupted' : 'idle');
            publish();
            var toClose = Array.from(failedCloses);
            if (old && !toClose.includes(old)) toClose.push(old);
            toClose.forEach(closeRun);
            return Promise.all(Array.from(pendingCloses)).then(function (results) {
                return results.find(function (result) { return !result.ok; }) || { ok: true };
            });
        }
        var handle = coordinator.register({ sessionId: options.sessionId || 'studio.metronome.m1', ownerFeatureId: options.feature.featureId,
            cleanup: async function (reason) {
                var result = await stop(reason);
                var closed = await Promise.all(Array.from(pendingCloses));
                var failed = closed.find(function (r) { return !r.ok; });
                if (!result.ok || failed || failedCloses.size) throw new Error(result.error || failed?.error || 'Audio context cleanup failed');
            }, notify: function (event) {
                if (event.kind === 'interruption') stop('interrupted');
                // Visibility and devicechange are notifications, not automatic Start/Stop.
            } });
        function settings() { return Object.assign({}, core.defaults, { bpm: bpm }); }
        function setBpm(value) {
            if (disposed) return false;
            bpm = core.clampInteger(value, core.limits.bpmMin, core.limits.bpmMax, bpm);
            if (run && status === 'running') {
                try { run.engine.reschedule(settings); } catch (e) { error = String(e.message || e); stop('failed'); }
            }
            publish(); return bpm;
        }
        function start() {
            if (disposed) return Promise.resolve(false);
            if (run) return run.promise || Promise.resolve(status === 'running');
            if (pendingCloses.size || failedCloses.size) return Promise.resolve(false);
            error = null;
            var lease;
            try { lease = coordinator.request(handle, 'audio-output/session'); }
            catch (e) { error = String(e.message || e); }
            if (!lease) { status = 'failed'; error = error || '音声リソースを使用できません'; publish(); return Promise.resolve(false); }
            var token = ++generation;
            var owned = { lease: lease, context: null, engine: null, promise: null, closing: null };
            run = owned; status = 'starting';
            owned.engine = core.createMetronomeAudioEngine(function () {}, Object.assign({}, env, {
                onContext: function (context) {
                    owned.context = context; coordinator.ownContext(handle, lease, context);
                    owned.stateListener = function () {
                        if (run === owned && status === 'running' && context.state !== 'running')
                            coordinator.notify(handle, 'interruption', { state: context.state });
                    };
                    context.addEventListener('statechange', owned.stateListener);
                }
            }));
            publish();
            if (run !== owned || disposed) return closeRun(owned).then(function () { return false; });
            // Engine creates/resumes the context synchronously inside the user gesture.
            owned.promise = owned.engine.start(settings, function () {
                return !disposed && run === owned && generation === token && coordinator.isLeaseCurrent(handle, lease);
            }).then(async function (started) {
                if (started && run === owned && generation === token && coordinator.grant(handle, lease)) {
                    status = 'running'; publish(); return true;
                }
                if (run === owned) { run = null; status = 'failed'; error = '音声を開始できませんでした'; publish(); }
                await closeRun(owned); return false;
            }, async function (e) {
                if (run === owned) { run = null; status = 'failed'; error = String(e.message || e); publish(); }
                await closeRun(owned); return false;
            });
            return owned.promise;
        }
        function bind(target, name, fn) {
            if (!target?.addEventListener) return;
            target.addEventListener(name, fn); bindings.push(function () { target.removeEventListener(name, fn); });
        }
        bind(env.windowObject, 'pagehide', function () { stop('pagehide'); });
        bind(env.windowObject, 'unload', function () { stop('unload'); });
        bind(env.document, 'visibilitychange', function () { coordinator.notify(handle, 'visibility', { hidden: env.document.hidden }); });
        bind(env.mediaDevices, 'devicechange', function () { coordinator.notify(handle, 'devicechange', {}); });
        return Object.freeze({ start: start, stop: stop, setBpm: setBpm, snapshot: snapshot,
            subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
            dispose: async function () {
                if (destroyed) return { ok: true };
                disposed = true; bindings.splice(0).forEach(function (off) { off(); });
                var result = await coordinator.disposeSession(handle);
                if (result.ok) { destroyed = true; listeners.clear(); }
                return result;
            }
        });
    }
    function mount(options) {
        var doc = options.document, runtime = options.runtime, root = doc.getElementById('studio-metronome');
        var input = doc.getElementById('studio-metronome-bpm'), start = doc.getElementById('studio-metronome-start');
        var stop = doc.getElementById('studio-metronome-stop'), indicator = doc.getElementById('studio-metronome-status');
        var summary = doc.getElementById('shell-metronome-running'), summaryStop = doc.getElementById('shell-metronome-stop');
        var off = [];
        function listen(target, type, handler) { target.addEventListener(type, handler); off.push(function () { target.removeEventListener(type, handler); }); }
        function render(state) {
            input.value = String(state.bpm);
            root.dataset.status = state.status;
            start.disabled = state.status === 'starting' || state.running || state.pendingCloseCount > 0;
            stop.disabled = !(state.running || state.status === 'starting' || state.pendingCloseCount > 0);
            if (start.disabled && doc.activeElement === start) stop.focus({ preventScroll: true });
            if (stop.disabled && doc.activeElement === stop) input.focus({ preventScroll: true });
            start.setAttribute('aria-pressed', String(state.running));
            indicator.textContent = state.error || (state.running ? '再生中' : state.status === 'starting' ? '開始中' : state.status === 'interrupted' ? '音声が中断されました。Startで再開できます。' : '停止中');
            if (!(state.running || state.status === 'starting') && summary.contains(doc.activeElement))
                doc.getElementById('shell-dock-toggle').focus({ preventScroll: true });
            summary.hidden = !(state.running || state.status === 'starting');
            options.shell.setCommandTarget('audioOwner', state.running ? runtime : null);
        }
        listen(input, 'change', function () { runtime.setBpm(input.value); });
        listen(input, 'keydown', function (event) {
            if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's')
                options.shell.keyboard.localCommand(event, 'studio.save', 'sheetCruise');
        });
        listen(start, 'click', function () { runtime.setBpm(input.value); runtime.start(); });
        listen(stop, 'click', function () { runtime.stop(); });
        listen(summaryStop, 'click', function () { runtime.stop(); });
        off.push(runtime.subscribe(render)); render(runtime.snapshot());
        return Object.freeze({ dispose: function () { off.splice(0).forEach(function (dispose) { dispose(); }); } });
    }
    return Object.freeze({ createRuntime: createRuntime, mount: mount });
});
