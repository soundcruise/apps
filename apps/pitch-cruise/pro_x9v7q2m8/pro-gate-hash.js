/* Pitch retains its historic entry while loading the current shared session helpers. */
(function () {
    'use strict';
    const fail = () => { document.body.classList.add('pro-gate-active'); };
    function loadGate() {
        const script = document.createElement('script');
        script.src = '../../shared/pro-gate.js?v=27';
        script.onerror = fail;
        document.head.appendChild(script);
    }
    if (window.SoundCruiseProDeviceSession) { loadGate(); return; }
    const helper = document.createElement('script');
    helper.src = '../../shared/pro-device-session.js?v=2';
    helper.onload = loadGate;
    helper.onerror = fail;
    document.head.appendChild(helper);
})();
