/* Pitch retains its historic entry while loading the current shared session helpers. */
(function () {
    'use strict';
    const fail = () => { document.body.classList.add('pro-gate-active'); };
    function startGate() {
        const script = document.createElement('script');
        script.src = '../../shared/pro-gate.js?v=29';
        script.onerror = fail;
        document.head.appendChild(script);
    }
    function loadGate() {
        if (window.SoundCruiseProPostHelp) { startGate(); return; }
        const help = document.createElement('script');
        help.src = '../../shared/pro-gate-help.js?v=2';
        help.onload = startGate;
        help.onerror = startGate; // Help availability must not change authentication behavior.
        document.head.appendChild(help);
    }
    if (window.SoundCruiseProDeviceSession) { loadGate(); return; }
    const helper = document.createElement('script');
    helper.src = '../../shared/pro-device-session.js?v=2';
    helper.onload = loadGate;
    helper.onerror = fail;
    document.head.appendChild(helper);
})();
