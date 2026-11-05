/* Studio-only native Port chrome; no credential, capability or storage mutation. */
(function (root) {
    'use strict';
    var CS = root.CruiseStudio;
    root.addEventListener?.('soundcruise:sync-report',function(event){
        if(!event.detail?.ok)return;
        root.document.querySelectorAll('iframe').forEach(function(frame){try{
            var child=frame.contentWindow;
            if(frame.getClientRects().length&&child?.CruisePortSyncAttentionHost?.owner===root)
                child.dispatchEvent(new child.CustomEvent('cruise-port-app-report-updated'));
        }catch(_){} });
    });
    // Same-origin center surfaces use the workspace scroller; pane and modal scrollers retain ownership.
    const heightOwners = new WeakMap();
    function attachHeight(frame) {
        if (!frame.closest('#studio-shell') || heightOwners.has(frame)) return;
        let doc, resize, changes, queued = false, disposed = false;
        const originalHeight = frame.style.height;
        function update() {
            queued = false;
            if (!frame.isConnected) { disposed = true; resize?.disconnect(); changes?.disconnect(); placement.disconnect(); document.getElementById('studio-main')?.removeEventListener('scroll',schedule); return; }
            if (!doc?.body || !frame.getClientRects().length) return;
            const center = !frame.closest('#tool-window-slot');
            const style = doc.getElementById('studio-center-height');
            if (!center) { style?.remove(); if (frame.style.height !== originalHeight) frame.style.height = originalHeight; return; }
            if (!style) {
                const css = doc.createElement('style'); css.id = 'studio-center-height';
                css.textContent = 'html,body{height:auto!important;min-height:0!important} body{overflow-y:visible!important} body>.app-container,body>.cc-app,body>.port-shell{height:auto!important;min-height:0!important;max-height:none!important;overflow-y:visible!important} .app-container:has(>#overlay:not(.hidden))>header,.app-container:has(>#overlay:not(.hidden))>main{display:none!important} .app-container>#overlay{position:relative!important;inset:auto!important;height:auto!important;min-height:0!important;overflow:visible!important} .app-container>#overlay>.modal{max-height:none!important;overflow-y:visible!important}';
                doc.head.append(css);
            }
            const viewport=document.getElementById('studio-main'),bounds=viewport.getBoundingClientRect(),frameBounds=frame.getBoundingClientRect();
            for(const dialog of doc.querySelectorAll('.sync-center-help-dialog[open]')){
                const top=Math.max(12,bounds.top-frameBounds.top+12)+'px',limit=Math.max(120,bounds.height-32)+'px';
                for(const [key,value] of Object.entries({top, maxHeight:limit, margin:'0px auto', bottom:'auto'}))if(dialog.style[key]!==value)dialog.style[key]=value;
            }
            let bottom = doc.body.getBoundingClientRect().bottom + frame.contentWindow.scrollY;
            for (const child of doc.body.children) {
                const style = frame.contentWindow.getComputedStyle(child);
                if (style.position !== 'fixed' && style.display !== 'none') bottom = Math.max(bottom, child.getBoundingClientRect().top + frame.contentWindow.scrollY + Math.max(child.getBoundingClientRect().height, child.scrollHeight) + (parseFloat(style.marginBottom) || 0));
            }
            const height = Math.max(120, Math.ceil(bottom) + 2);
            if (Math.abs(frame.getBoundingClientRect().height - height) > 1) frame.style.height = height + 'px';
        }
        function schedule() { if (!queued && !disposed) { queued = true; requestAnimationFrame(update); } }
        function bind() {
            try { doc = frame.contentDocument; if (!doc?.body || frame.contentWindow.location.origin !== location.origin) return;
                resize?.disconnect(); changes?.disconnect();
                resize = new ResizeObserver(schedule); resize.observe(doc.body); for (const child of doc.body.children) resize.observe(child);
                changes = new MutationObserver(schedule); changes.observe(doc.body, {subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','open','style']});
                schedule();
            } catch (_) { /* Cross-origin documents keep their native scrolling. */ }
        }
        const placement = new MutationObserver(schedule); placement.observe(document.getElementById('studio-shell'), {subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class']});
        document.getElementById('studio-main')?.addEventListener('scroll',schedule,{passive:true});
        frame.addEventListener('load', bind); heightOwners.set(frame, {schedule}); bind();
    }
    document.addEventListener('load', event => { if (event.target instanceof HTMLIFrameElement) attachHeight(event.target); }, true);
    CS.stopNativePort = function (frame) {
        var tool = frame.contentWindow?.CruiseStudioPortTool;
        // Native pagehide intentionally leaves standalone Port's timer running.
        // A Studio tool pauses through its existing control before losing ownership.
        tool?.pause();
        tool?.stop();
        return frame.contentWindow?.studioEntryStopMedia?.();
    };
    CS.presentNativePort = function (frame) {
        var child = frame.contentWindow;
        if (child.location.origin !== location.origin || !child.document.head) return;
        var doc = child.document;
        CS.attachAccountFrame?.(frame);
        child.CruisePortSyncAttentionHost={owner:root,open:async function(id){
            if(!['pitch','fretboard','rhythm','chord'].includes(id)||!CS.entryAuth?.isAuthorized())return false;
            const visible=CS.seriesApps[id]?.nativeWindow;if(visible?.frameElement?.getClientRects().length&&visible.SoundCruiseSyncAttention)return visible.SoundCruiseSyncAttention.open();
            if(CS.shellHost.getActiveWorkspace()!=='app_'+id&&CS.shellHost.navigate('app_'+id)===false)return false;
            const app=CS.seriesApps[id];app.reviewRequested=true;
            if(app.nativeWindow?.SoundCruiseSyncAttention){app.reviewRequested=false;return app.nativeWindow.SoundCruiseSyncAttention.open();}
            return true;
        }};
        // A permission prompt may finish after the entrance has locked. Retain
        // the form/document, but never let that old microphone request revive.
        if (!child.studioEntryStopMedia && child.navigator.mediaDevices?.getUserMedia) {
            var streams = new Set(), contexts = new Set(), getMedia = child.navigator.mediaDevices.getUserMedia.bind(child.navigator.mediaDevices);
            child.studioEntryStopMedia = function () {
                streams.forEach(function (s) { s.getTracks().forEach(function (t) { t.stop(); }); }); streams.clear();
                return Promise.all([...contexts].map(async context => { if (context.state !== 'closed') await context.close(); contexts.delete(context); }));
            };
            for (const prototype of new Set([child.AudioContext?.prototype, child.webkitAudioContext?.prototype].filter(Boolean))) {
                const resume = prototype.resume;
                prototype.resume = function (...args) { contexts.add(this); return resume.apply(this, args); };
            }
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
                .view-kicker { display: none !important; }
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
