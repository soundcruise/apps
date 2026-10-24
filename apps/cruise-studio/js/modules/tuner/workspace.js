(function (root) {
    'use strict';
    var CS = root.CruiseStudio = root.CruiseStudio || {};
    var view = null, runtime = null;
    function mount(options) {
        var doc = options.document, shell = options.shell, audio = options.coordinator, tuner = options.runtime, metronome = options.metronome;
        var node = doc.getElementById('screen-tuner'), start = doc.getElementById('tuner-start'), stop = doc.getElementById('tuner-stop'), globalStop = doc.getElementById('shell-audio-stop');
        var off = [], disposed = false, active = false, activationGeneration = 0, confirmation = null, message = '';
        var reference = options.reference, tuning = options.tuning, appliedTuning = 'standard';
        var errors = { 'permission-denied': 'マイクへのアクセスが許可されていません。ブラウザの権限を確認してください。', 'no-device': '使用できる入力デバイスがありません。', 'device-busy': '入力デバイスを使用できません。他のアプリや接続を確認してください。', constraints: '入力条件を満たすデバイスがありません。', 'insecure-context': 'マイクには安全な接続が必要です。', unsupported: 'このブラウザではマイクを開始できません。', 'resource-busy': '他のStudio音声が使用中です。停止後に開始してください。', 'device-disconnected': '入力デバイスが切断されました。', 'audio-failed': '音声入力を開始できませんでした。', 'analysis-failed': '音程解析を停止しました。', 'cleanup-failed': '音声資源の解放を完了できません。停止を再実行してください。', aborted: 'マイク開始が中断されました。' };
        var statuses = { idle: '停止中', requesting: 'マイクの許可 / 音声開始を待っています。停止で取り消せます。', active: 'マイク入力中', releasing: '音声資源を解放中', failed: '停止・エラー', interrupted: '音声入力が中断されました。明示開始で再開できます。', disposed: '停止済み' };
        function q(selector) { return node.querySelector(selector); }
        function listen(target, name, fn) { target.addEventListener(name, fn); off.push(function () { target.removeEventListener(name, fn); }); }
        function render(state) {
            if (disposed) return;
            node.dataset.status = state.state;
            q('[data-tuner-status]').textContent = message || errors[state.error] || statuses[state.state];
            if (q('[data-tuner-permission]')) q('[data-tuner-permission]').textContent = state.error === 'permission-denied' ? '許可が拒否されました' : state.state === 'requesting' ? '許可を確認中' : state.state === 'active' ? 'マイク入力を取得済み' : '未使用（開始操作で権限を確認）';
            start.disabled = !state.canStart || Boolean(confirmation);
            stop.disabled = !['requesting', 'active', 'releasing'].includes(state.state) && state.pendingCleanup === 0;
            if (start.disabled && doc.activeElement === start && !stop.disabled) stop.focus({ preventScroll: true });
            if (stop.disabled && doc.activeElement === stop && !start.disabled) start.focus({ preventScroll: true });
            var pitch = state.reading;
            q('[data-tuner-note]').textContent = pitch ? pitch.noteName : '—';
            q('[data-tuner-octave]').textContent = pitch ? String(pitch.octave) : '—';
            q('[data-tuner-frequency]').textContent = pitch ? pitch.frequency.toFixed(2) + ' Hz' : '— Hz';
            q('[data-tuner-cents]').textContent = pitch ? (pitch.cents >= 0 ? '+' : '') + pitch.cents.toFixed(1) + ' cents' : '— cents';
            q('[data-tuner-confidence]').textContent = pitch ? '有効 · 信頼度 ' + (pitch.confidence * 100).toFixed(1) + '%' : state.state === 'active' ? '音程未検出（無音 / 低レベル / noise / 範囲外）' : '入力停止';
            var meter = q('[data-tuner-meter]'); meter.hidden = !pitch; meter.value = pitch ? pitch.cents : 0;
            meter.setAttribute('aria-valuetext', pitch ? pitch.cents.toFixed(1) + ' cents' : '音程未検出');
            if (state.state === 'active') shell.setCommandTarget('audioOwner', tuner);
            else if (shell.getCommandContext().audioOwner === tuner) shell.setCommandTarget('audioOwner', null);
        }
        function permitted(control, event) { return active && !node.closest('[hidden], [inert]') && !control.disabled && !shell.getCommandContext().activeModal && !shell.keyboard.isIMEBlocked(event || {}); }
        if (reference && tuning) {
            var tuningSelect = q('#tuner-tuning'), threshold = q('#tuner-threshold'), apply = q('#tuner-apply'), cancel = q('#tuner-cancel'), targets = q('#tuner-targets'), refStop = q('#tuner-reference-stop');
            tuning.presets.forEach(function (preset) { var option = doc.createElement('option'); option.value = preset.id; option.textContent = preset.label; tuningSelect.append(option); });
            function renderTargets() {
                targets.replaceChildren();
                var items = tuning.targets(appliedTuning, 0).concat([Object.assign({ string: 'A4' }, tuning.a4)]);
                items.forEach(function (target) { var button = doc.createElement('button'); button.type = 'button'; button.textContent = (target.string === 'A4' ? 'A4' : target.string + '弦 ' + target.note) + ' · ' + target.targetFrequency.toFixed(2) + ' Hz';
                    button.dataset.referenceString = String(target.string); button.addEventListener('click', function () { if (permitted(button)) void reference.play(target); }); targets.append(button); });
                q('[data-tuner-applied]').textContent = '適用中: ' + tuning.presets.find(function (x) { return x.id === appliedTuning; }).label + ' · ' + tuner.snapshot().thresholdDb + ' dBFS · A4=440 Hz';
            }
            function resetDraft() { tuningSelect.value = appliedTuning; threshold.value = String(tuner.snapshot().thresholdDb); q('[data-tuner-draft-status]').textContent = '一時設定（保存しません）'; }
            [tuningSelect, threshold].forEach(function (control) { listen(control, 'input', function () { q('[data-tuner-draft-status]').textContent = '未適用の変更'; }); });
            listen(apply, 'click', function () { if (!permitted(apply)) return; var value = Number(threshold.value); if (!threshold.value.trim() || !tuning.presets.some(function (x) { return x.id === tuningSelect.value; }) || !tuner.setThreshold(value)) { q('[data-tuner-draft-status]').textContent = '閾値は−100〜−40 dBFSの整数を指定してください。'; return; } appliedTuning = tuningSelect.value; void reference.stop(); resetDraft(); renderTargets(); });
            listen(cancel, 'click', function () { if (permitted(cancel)) resetDraft(); });
            listen(refStop, 'click', function () { if (permitted(refStop)) void reference.stop(); });
            off.push(reference.subscribe(function (state) { q('[data-tuner-reference-status]').textContent = state.error || (state.state === 'playing' ? '基準音を再生中' : state.state === 'releasing' ? '基準音を停止中' : '基準音は停止中'); if (state.state === 'playing') shell.setCommandTarget('audioOwner', reference); else if (shell.getCommandContext().audioOwner === reference) shell.setCommandTarget('audioOwner', null); }));
            listen(doc, 'visibilitychange', function () { if (doc.hidden) void reference.stop(); });
            listen(doc.defaultView, 'pagehide', function () { void reference.stop(); });
            resetDraft(); renderTargets();
        }
        function sameLeases(expected) { var now = audio.getConflictingLeases('microphone/session'); return now.length === expected.length && now.every(function (x, i) { return x === expected[i]; }); }
        function begin() {
            if (!permitted(start)) return;
            message = ''; var conflicts = audio.getConflictingLeases('microphone/session');
            if (!conflicts.length) { void tuner.start(); return; }
            var metro = metronome.snapshot();
            if (conflicts.length !== 1 || conflicts[0].sessionId !== metro.sessionId || conflicts[0].resourceType !== 'audio-output/session') { message = '他のStudio音声が使用中です。先に停止してください。'; render(tuner.snapshot()); return; }
            var content = doc.createElement('div'), text = doc.createElement('p'), confirm = doc.createElement('button'), cancel = doc.createElement('button');
            text.textContent = 'Metronomeを停止してマイクを開始します。終了後の自動再開はしません。'; confirm.type = cancel.type = 'button'; confirm.textContent = '停止してマイクを開始'; cancel.textContent = '中止'; confirm.id = 'tuner-confirm-start'; cancel.id = 'tuner-confirm-cancel'; content.append(text, confirm, cancel);
            // Record identity survives Modal close; newer conflicts require new explicit intent.
            var token = {}, stopGeneration = audio.getStopGeneration(), activation = activationGeneration; confirmation = token;
            confirm.addEventListener('click', async function () {
                if (confirmation !== token || shell.keyboard.isIMEBlocked({})) return;
                if (!sameLeases(conflicts) || audio.getStopGeneration() !== stopGeneration || activation !== activationGeneration) { shell.modal.close('conflict-changed'); message = '音声状態が変わりました。開始を再確認してください。'; render(tuner.snapshot()); return; }
                shell.modal.close('confirmed');
                var result = await metronome.stop('microphone-confirmed');
                if (!disposed && active && activation === activationGeneration && result.ok && audio.getStopGeneration() === stopGeneration && !audio.getConflictingLeases('microphone/session').length) void tuner.start();
                else if (!disposed) { message = '開始を中止しました。停止完了と音声状態を再確認してください。'; render(tuner.snapshot()); }
            });
            cancel.addEventListener('click', function () { if (!shell.keyboard.isIMEBlocked({})) shell.modal.close('cancelled'); });
            shell.modal.open({ title: 'マイク開始の確認', content: content, initialFocus: cancel, onClose: function () { if (confirmation === token) confirmation = null; render(tuner.snapshot()); } });
            render(tuner.snapshot());
        }
        listen(start, 'click', begin);
        listen(stop, 'click', function () { if (permitted(stop)) { message = ''; void tuner.stop(); } });
        [start, stop].forEach(function (control) { listen(control, 'keydown', function (event) { if ((event.key === ' ' || event.key === 'Enter') && (event.repeat || !permitted(control, event))) event.preventDefault(); }); });
        listen(globalStop, 'click', function () { if (shell.getCommandContext().activeModal || shell.keyboard.isIMEBlocked({})) return; message = ''; void audio.stopAll(); });
        off.push(tuner.subscribe(render)); render(tuner.snapshot());
        return Object.freeze({ load: function () {}, activate: function () { active = true; render(tuner.snapshot()); }, deactivate: function () { activationGeneration++; active = false; if (confirmation) shell.modal.close('workspace-left'); message = ''; return Promise.all([tuner.stop('workspace-left'), reference?.stop()]); }, dispose: function () { if (disposed) return; activationGeneration++; active = false; if (confirmation) shell.modal.close('dispose'); off.splice(0).forEach(function (fn) { fn(); }); disposed = true; return Promise.all([tuner.dispose(), reference?.dispose()]); } });
    }
    CS.tuner = { attach: function (nextView, nextRuntime) { view = nextView; runtime = nextRuntime; if (CS.shellHost.getActiveWorkspace() === 'tuner') view.activate(); }, load: function () {}, activate: function () { view?.activate(); }, deactivate: function () { if (view) return view.deactivate(); return runtime?.stop('workspace-left'); } };
    CS.tunerPresentation = { mount: mount };
    if (typeof module !== 'undefined' && module.exports) module.exports = CS.tunerPresentation;
})(typeof window !== 'undefined' ? window : globalThis);
