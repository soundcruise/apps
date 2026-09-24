/* Pitch retains its historic entry file while using the common S2-A gate. */
(function () {
    'use strict';
    const script = document.createElement('script');
    script.src = '../../shared/pro-gate.js?v=23';
    script.onerror = function () {
        document.body.classList.add('pro-gate-active');
    };
    document.head.appendChild(script);
})();
