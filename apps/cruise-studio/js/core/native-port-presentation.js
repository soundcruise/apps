/* Studio-only native Port chrome; no credential, capability or storage mutation. */
(function (root) {
    'use strict';
    var CS = root.CruiseStudio;
    CS.stopNativePort = function (frame) {
        frame.contentWindow?.studioEntryStopMedia?.();
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
        CS.attachAccountFrame?.(frame);
        // A permission prompt may finish after the entrance has locked. Retain
        // the form/document, but never let that old microphone request revive.
        if (!child.studioEntryStopMedia && child.navigator.mediaDevices?.getUserMedia) {
            var streams = new Set(), getMedia = child.navigator.mediaDevices.getUserMedia.bind(child.navigator.mediaDevices);
            child.studioEntryStopMedia = function () { streams.forEach(function (s) { s.getTracks().forEach(function (t) { t.stop(); }); }); streams.clear(); };
            child.navigator.mediaDevices.getUserMedia = async function (options) {
                var entry = CS.entryAuth, revision = entry?.read().revision;
                if (!entry?.isAuthorized() || frame.inert || !frame.isConnected) throw new DOMException('Studio is locked', 'AbortError');
                var stream = await getMedia(options);
                if (!entry.isAuthorized() || entry.read().revision !== revision || frame.inert || !frame.isConnected) {
                    stream.getTracks().forEach(function (t) { t.stop(); });
                    throw new DOMException('Studio qualification changed', 'AbortError');
                }
                streams.add(stream); return stream;
            };
        }
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
            // Remote Sync application reloads the native document; recover this surface's
            // return route from its existing owner, without a second saved setting.
            var syncReturn=frame.closest('#screen-port-practice')?'#practice-menu':frame.closest('#screen-port-gear')?'#wishlist':frame.closest('#screen-port-my-apps')?'':null;
            doc.getElementById('settings-sync-center-open')?.addEventListener('click',function(){if(child.location.hash!=='#sync-center')syncReturn=child.location.hash;},true);
            doc.getElementById('sync-center-back')?.addEventListener('click',function(event){
                if(child.location.hash!=='#sync-center'||syncReturn===null)return;
                event.preventDefault();event.stopImmediatePropagation();child.location.hash=syncReturn;syncReturn=null;
            },true);
        }
        if (frame.closest('#screen-port-my-apps')) {
            doc.documentElement.dataset.studioPortTool = 'myApps';
            doc.querySelectorAll('[data-action=my-apps-home],[data-action=my-apps-home-scroll]').forEach(function (element) {
                if (element.textContent.includes('クルーズポート')) element.textContent = '← My Apps';
            });
        }
    };
})(window);
