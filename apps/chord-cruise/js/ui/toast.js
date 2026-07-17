(function () {
    'use strict';

    var host = null;
    var timer = null;

    function ensureHost() {
        if (host && host.isConnected) return host;
        host = document.createElement('div');
        host.className = 'cc-toast-host';
        host.setAttribute('role', 'status');
        host.setAttribute('aria-live', 'polite');
        host.setAttribute('aria-atomic', 'true');
        document.body.appendChild(host);
        return host;
    }

    function show(message, options) {
        var opts = options || {};
        var duration = typeof opts.duration === 'number' ? opts.duration : 2600;
        var target = ensureHost();
        if (timer) window.clearTimeout(timer);
        target.className = 'cc-toast-host cc-toast-host--' + (opts.type || 'success');
        target.textContent = message || '';
        // 先に初期状態を確定させてから表示classを付けることで、モーダルを閉じた直後も
        // opacity 0 の初期状態に取り残されず、連続通知も確実に再表示される。
        void target.offsetWidth;
        target.classList.add('cc-toast-host--visible');
        timer = window.setTimeout(function () {
            target.classList.remove('cc-toast-host--visible');
            timer = null;
        }, Math.max(1000, duration));
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.ui = window.ChordCruise.ui || {};
    window.ChordCruise.ui.toast = { show: show };
})();
