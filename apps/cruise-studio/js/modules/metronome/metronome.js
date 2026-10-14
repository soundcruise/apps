/* Free tool audio lifecycle. M2 settings are explicitly injected, never implicitly loaded. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.metronome = factory();
})(globalThis, function () {
    'use strict';
    function createRuntime(options) {
        var core = options.core, coordinator = options.coordinator, env = options.environment || {};
        var bpm = core.defaults.bpm, status = 'idle', error = null, generation = 0, run = null, disposed = false, destroyed = false, beat = null;
        var listeners = new Set(), pendingCloses = new Set(), failedCloses = new Set(), bindings = [];
        var settingsSource = options.settingsSource || null;
        var offSettings = null;
        function snapshot() { return Object.freeze({ bpm: bpm, status: status, running: status === 'running', error: error, beat: beat,
            sessionId: handle.sessionId, pendingCloseCount: pendingCloses.size + failedCloses.size, engine: run ? run.engine.snapshot() : null,
            settings: settingsSource ? settingsSource.snapshot() : null }); }
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
            var old = run; run = null; beat = null;
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
            if (settingsSource) return settingsSource.setBpm(value);
            return applyBpm(value);
        }
        function applyBpm(value) {
            bpm = core.clampInteger(value, core.limits.bpmMin, core.limits.bpmMax, bpm);
            if (run && status === 'running') {
                try { run.engine.reschedule(settings); } catch (e) { error = String(e.message || e); stop('failed'); }
            }
            publish(); return bpm;
        }
        function start() {
            if (disposed || (settingsSource && (!settingsSource.snapshot().loaded || settingsSource.snapshot().saveStatus === 'loading'))) return Promise.resolve(false);
            if (run) return run.promise || Promise.resolve(status === 'running');
            if (pendingCloses.size || failedCloses.size) return Promise.resolve(false);
            error = null; beat = null;
            var lease;
            try { lease = coordinator.request(handle, 'audio-output/session'); }
            catch (e) { error = String(e.message || e); }
            if (!lease) { status = 'failed'; error = error || '音声リソースを使用できません'; publish(); return Promise.resolve(false); }
            var token = ++generation;
            var owned = { lease: lease, context: null, engine: null, promise: null, closing: null };
            run = owned; status = 'starting';
            // The engine's visual queue follows AudioContext time; no second beat clock.
            owned.engine = core.createMetronomeAudioEngine(function (event) {
                if (disposed || run !== owned || generation !== token || !coordinator.isLeaseCurrent(handle, lease) || !event.isMainBeat) return;
                beat = Object.freeze({ index: event.beatIndex, when: event.when });
                publish(); // Observer failures are isolated; the audio scheduler never awaits UI.
            }, Object.assign({}, env, {
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
                if (run === owned) { run = null; beat = null; status = 'failed'; error = '音声を開始できませんでした'; publish(); }
                await closeRun(owned); return false;
            }, async function (e) {
                if (run === owned) { run = null; beat = null; status = 'failed'; error = String(e.message || e); publish(); }
                await closeRun(owned); return false;
            });
            return owned.promise;
        }
        function bind(target, name, fn) {
            if (!target?.addEventListener) return;
            target.addEventListener(name, fn); bindings.push(function () { target.removeEventListener(name, fn); });
        }
        if (settingsSource) {
            bpm = settingsSource.snapshot().effectiveSettings.bpm;
            offSettings = settingsSource.subscribe(function (state) {
                if (disposed) return;
                if (state.effectiveSettings.bpm !== bpm) applyBpm(state.effectiveSettings.bpm);
                else publish(); // Save status alone does not reschedule the audio clock.
            });
        }
        bind(env.windowObject, 'pagehide', function () { stop('pagehide'); });
        bind(env.windowObject, 'unload', function () { stop('unload'); });
        bind(env.document, 'visibilitychange', function () { coordinator.notify(handle, 'visibility', { hidden: env.document.hidden }); });
        bind(env.mediaDevices, 'devicechange', function () { coordinator.notify(handle, 'devicechange', {}); });
        return Object.freeze({ start: start, stop: stop, setBpm: setBpm, snapshot: snapshot,
            subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
            dispose: async function () {
                if (destroyed) return { ok: true };
                disposed = true; if (offSettings) { offSettings(); offSettings = null; } bindings.splice(0).forEach(function (off) { off(); });
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
        var off = [], renderedBpm = null;
        var saveIndicator = doc.getElementById('studio-metronome-save-status');
        var toggle = doc.getElementById('studio-metronome-toggle'), bpmDisplay = doc.getElementById('studio-metronome-current-bpm');
        var beats = Array.from(root.querySelectorAll('[data-metronome-beat]'));
        function listen(target, type, handler) { target.addEventListener(type, handler); off.push(function () { target.removeEventListener(type, handler); }); }
        function render(state) {
            // Async save notifications must not replace an uncommitted number input.
            if (renderedBpm !== state.bpm) { input.value = String(state.bpm); renderedBpm = state.bpm; }
            var settingsState = state.settings;
            var loading = settingsState && (!settingsState.loaded || settingsState.saveStatus === 'loading');
            input.disabled = !!loading;
            if (saveIndicator && settingsState) {
                var labels = { unloaded: '準備中', loading: '読込中', saving: 'メモリ保存中', stale: '競合：変更を保持中', error: '保存失敗：変更を保持中', 'forward-incompatible': '新しい設定形式：保存不可' };
                saveIndicator.textContent = settingsState.readOnly ? (settingsState.forwardIncompatible ? labels['forward-incompatible'] : '設定を読めません：保存不可') : (labels[settingsState.saveStatus] || (settingsState.dirty ? '未保存' : 'メモリ内・再読込で初期化'));
                saveIndicator.dataset.status = settingsState.saveStatus;
            }
            root.dataset.status = state.status;
            bpmDisplay.textContent = String(state.bpm);
            beats.forEach(function (element, index) {
                var active = state.beat !== null && state.beat.index === index && (state.running || state.status === 'starting');
                element.dataset.active = String(active);
                element.setAttribute('aria-current', active ? 'step' : 'false');
            });
            toggle.textContent = state.running || state.status === 'starting' ? 'Stop' : 'Start';
            toggle.setAttribute('aria-pressed', String(state.running || state.status === 'starting'));
            toggle.disabled = !!loading || (!(state.running || state.status === 'starting') && state.pendingCloseCount > 0);
            start.disabled = !!loading || state.status === 'starting' || state.running || state.pendingCloseCount > 0;
            stop.disabled = !(state.running || state.status === 'starting' || state.pendingCloseCount > 0);
            if (start.disabled && doc.activeElement === start) stop.focus({ preventScroll: true });
            if (stop.disabled && doc.activeElement === stop) input.focus({ preventScroll: true });
            start.setAttribute('aria-pressed', String(state.running));
            indicator.textContent = state.error || (state.running ? '再生中' : state.status === 'starting' ? '開始中' : state.status === 'interrupted' ? '音声が中断されました。Startで再開できます。' : '停止中');
            if (!(state.running || state.status === 'starting') && summary.contains(doc.activeElement))
                doc.getElementById('shell-dock-toggle').focus({ preventScroll: true });
            summary.hidden = !(state.running || state.status === 'starting');
            if (state.running) options.shell.setCommandTarget('audioOwner', runtime);
            else if (options.shell.getCommandContext().audioOwner === runtime) options.shell.setCommandTarget('audioOwner', null);
        }
        listen(input, 'change', function () { runtime.setBpm(input.value); input.value = String(runtime.snapshot().bpm); });
        listen(input, 'keydown', function (event) {
            if (event.defaultPrevented || input.closest('[hidden], [inert]') || options.shell.getCommandContext().activeModal || options.shell.keyboard.isIMEBlocked(event)) return;
            if (event.key === 'Enter') {
                event.preventDefault(); runtime.setBpm(input.value);
                input.value = String(runtime.snapshot().bpm); return;
            }
            if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's')
                options.shell.keyboard.localCommand(event, 'studio.save', 'sheetCruise');
        });
        listen(start, 'click', function () { if (options.shell.getCommandContext().activeModal || start.closest('[hidden], [inert]') || options.shell.keyboard.isIMEBlocked({})) return; runtime.setBpm(input.value); runtime.start(); });
        listen(stop, 'click', function () { if (options.shell.getCommandContext().activeModal || stop.closest('[hidden], [inert]') || options.shell.keyboard.isIMEBlocked({})) return; runtime.stop(); });
        listen(summaryStop, 'click', function () { runtime.stop(); });
        // Native button Space/Enter activation, scoped to this explicit control only.
        [toggle, start, stop].forEach(function (control) { listen(control, 'keydown', function (event) {
            if ((event.key === ' ' || event.key === 'Enter') && (event.repeat || options.shell.keyboard.isIMEBlocked(event) ||
                options.shell.getCommandContext().activeModal || control.closest('[hidden], [inert]'))) event.preventDefault();
        }); });
        listen(toggle, 'click', function () {
            if (toggle.closest('[hidden], [inert]') || options.shell.getCommandContext().activeModal || options.shell.keyboard.isIMEBlocked({})) return;
            if (runtime.snapshot().running || runtime.snapshot().status === 'starting') runtime.stop();
            else { runtime.setBpm(input.value); runtime.start(); }
        });
        off.push(runtime.subscribe(render)); render(runtime.snapshot());
        return Object.freeze({ dispose: function () { off.splice(0).forEach(function (dispose) { dispose(); }); } });
    }
    return Object.freeze({ createRuntime: createRuntime, mount: mount });
});
