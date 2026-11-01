/* Studio-only native Port chrome; no credential, capability or storage mutation. */
(function (root) {
    'use strict';
    var CS = root.CruiseStudio;
    CS.stopNativePort = function (frame) {
        var tool = frame.contentWindow?.CruiseStudioPortTool;
        // Native pagehide intentionally leaves standalone Port's timer running.
        // A Studio tool pauses through its existing control before losing ownership.
        tool?.pause();
        return tool?.stop();
    };
    CS.presentNativePort = function (frame) {
        var child = frame.contentWindow;
        if (child.location.origin !== location.origin || !child.document.head) return;
        var doc = child.document;
        if (!doc.getElementById('studio-native-port-chrome')) {
            var style = doc.createElement('style');
            style.id = 'studio-native-port-chrome';
            style.textContent = `
                #tuner-view > .view-back[data-action=home],
                #metronome-view > .view-back[data-action=home],
                #practice-list-view > .view-back[data-action=home],
                #wishlist-view > .view-back[data-action=home] { display: none !important; }
                [data-studio-port-tool=myApps] #home-view > :not(#my-apps-section) { display: none !important; }
            `;
            doc.head.append(style);
        }
        if (frame.closest('#screen-port-my-apps')) {
            doc.documentElement.dataset.studioPortTool = 'myApps';
            doc.querySelectorAll('[data-action=my-apps-home],[data-action=my-apps-home-scroll]').forEach(function (element) {
                if (element.textContent.includes('クルーズポート')) element.textContent = '← My Apps';
            });
        }
    };
})(window);
