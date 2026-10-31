/* Revalidate the deployed document without discarding any active Project draft. */
(function () {
    'use strict';
    var button = document.getElementById('studio-refresh'), status = document.getElementById('studio-refresh-status');
    function blocked() {
        var sessions = window.CruiseStudio?.sessions;
        return window.CruiseStudio?.toolWindow?.hasUnsaved() || !sessions || sessions.listSessions().some(function (s) { return s.dirty || s.commitInFlight || s.inputPending || s.externalUpdatePending || s.conflict; });
    }
    button.addEventListener('click', async function () {
        if (blocked()) { status.textContent = '編集中の内容を保存し、入力を確定してから更新してください。'; return; }
        if (navigator.serviceWorker?.controller) { status.textContent = 'Service Workerが配信中です。ブラウザの更新設定を確認してください。'; return; }
        button.disabled = true; status.textContent = '配信を確認中…';
        try {
            var result = await fetch(location.pathname, { cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
            if (!result.ok) throw Error('unavailable');
            if (blocked()) { status.textContent = '編集状態が変わりました。保存してから更新してください。'; return; }
            if (navigator.serviceWorker?.controller) { status.textContent = '配信状態が変わりました。ブラウザの更新設定を確認してください。'; return; }
            location.reload();
        } catch (_) { status.textContent = '配信を確認できません。接続を確認して再試行してください。'; }
        finally { button.disabled = false; }
    });
})();
