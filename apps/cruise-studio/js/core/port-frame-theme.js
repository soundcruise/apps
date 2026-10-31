/* Display-only theme projection for same-origin Port frames. Port owns all persisted settings. */
(function () {
    'use strict';
    var theme = window.CruiseStudio.colorTheme;
    var attached = new WeakSet();
    var portRoot = new URL('../cruise-port/', document.baseURI);
    var paths = new Set([new URL('port-tool.html', document.baseURI).pathname, portRoot.pathname, new URL('pro_9a3943176561/', portRoot).pathname]);
    var css = ':root[data-studio-theme="midnight"]{--port-bg:#10151c;--port-surface:#1d2631;--port-surface-deep:#151d26;--port-panel:#1d2631;--port-panel-alt:#252f3b;--port-panel-deep:#10151c;--port-control:#252f3b;--port-control-hover:#39434f;--port-control-active:#303c49;--port-field:#10151c;--port-menu:#252f3b;--port-menu-alt:#252f3b;--port-menu-deep:#151d26;--port-bg-top:#151d26;--port-bg-bottom:#10151c;--port-well-rgb:16,21,28;--port-well-alt-rgb:16,21,28;--port-well-deep-rgb:12,16,22;--port-well-cool-rgb:16,21,28;--port-well-warm-rgb:16,21,28;--port-chrome-rgb:29,38,49;}';
    function apply(frame) {
        try {
            var doc = frame.contentDocument;
            if (!doc || frame.contentWindow.location.origin !== portRoot.origin || !paths.has(frame.contentWindow.location.pathname)) return;
            var root = doc.documentElement, id = theme.getColorTheme(), portId = id === 'midnight' ? 'dark' : id;
            if (!doc.getElementById('studio-port-theme')) { var style = doc.createElement('style'); style.id = 'studio-port-theme'; style.textContent = css; doc.head.append(style); }
            if (root.getAttribute('data-studio-theme') !== id) root.setAttribute('data-studio-theme', id);
            if (root.getAttribute('data-theme') !== portId) root.setAttribute('data-theme', portId);
            if (!attached.has(doc)) {
                attached.add(doc);
                new MutationObserver(function () { if (frame.isConnected) apply(frame); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
            }
        } catch (_) { /* A frame navigating away never receives the projection. */ }
    }
    document.addEventListener('load', function (event) { if (event.target instanceof HTMLIFrameElement) apply(event.target); }, true);
    theme.subscribeColorTheme(function () { document.querySelectorAll('iframe').forEach(apply); });
})();
