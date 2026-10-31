/* Port owns Gear, My Apps and NEWS UI, state and data transport. */
(function (root) {
    'use strict';
    var CS = root.CruiseStudio = root.CruiseStudio || {};
    var portUrl = new URL('../cruise-port/', document.baseURI);
    var routeWorkspaces = Object.freeze({ '#tuner': 'tuner', '#metronome': 'metronome', '#practice-menu': 'portPractice', '#wishlist': 'portGear', '#my-apps/manage': 'portMyApps', '#news': 'portNews' });

    function createSurface(config) {
        var node = document.getElementById(config.screen);
        var surface = document.getElementById(config.surface);
        var status = document.getElementById(config.status);
        var resume = document.getElementById(config.resume);
        var overview = document.getElementById(config.overview);
        var settings = document.getElementById(config.settings);
        var stopButton = document.getElementById('shell-audio-stop');
        var shell = null, frame = null, active = false, disposed = false, generation = 0, phase = 'idle', pendingLeave = null;

        function setPhase(next, message) {
            phase = next;
            status.textContent = message || '';
            node.dataset.portLibraryPhase = next;
            resume.hidden = !active || next === 'loading' || next === 'ready';
        }
        function clearPendingLeave() {
            if (!pendingLeave) return;
            pendingLeave.observer.disconnect();
            pendingLeave.dialog.removeEventListener('click', pendingLeave.onAction, true);
            pendingLeave = null;
        }
        function removeFrame() {
            clearPendingLeave();
            if (!frame) return;
            var old = frame;
            frame = null;
            old.onload = null;
            old.onerror = null;
            old.remove();
        }
        function stop(message) {
            generation++;
            removeFrame();
            if (!disposed) setPhase('idle', message || '');
        }
        function isAllowed(hash) {
            if (hash === '#settings' || hash === '#pro-access' || hash === '#sync-center') return true;
            if (config.kind === 'gear') return hash === '#wishlist' || hash.startsWith('#wishlist/');
            if (config.kind === 'news') return hash === '#news' || hash.startsWith('#news/');
            return hash === '' || hash === '#my-apps/manage' || hash === '#my-apps/new' || /^#my-apps\/[^/]+\/edit$/.test(hash);
        }
        function scrollMyApps(child) {
            if (config.kind !== 'myApps' || child.location.hash) return;
            child.requestAnimationFrame(function () {
                if (frame?.contentWindow === child) child.document.getElementById('my-apps-section')?.scrollIntoView({ block: 'start' });
            });
        }
        function destination(hash) {
            if (hash.startsWith('#practice-menu')) return 'portPractice';
            if (hash.startsWith('#wishlist')) return 'portGear';
            if (hash.startsWith('#my-apps')) return 'portMyApps';
            if (hash.startsWith('#news')) return 'portNews';
            return routeWorkspaces[hash] || 'home';
        }
        function checkRoute(child, currentFrame) {
            if (!active || frame !== currentFrame) return;
            var hash = child.location.hash;
            if (isAllowed(hash)) { setPhase('ready', ''); scrollMyApps(child); }
            else shell.navigate(destination(hash));
        }
        function openExternal(child, href) {
            try {
                var url = new URL(href, child.location.href);
                if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('unsafe-link');
                child.open(url.href, '_blank', 'noopener,noreferrer');
            } catch (_) { status.textContent = 'リンクを開けませんでした。Portから確認してください。'; }
        }
        function onChildClick(child, currentFrame, event) {
            if (!active || frame !== currentFrame) return;
            var link = event.target.closest('a[href]');
            if (link && !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                var href = link.getAttribute('href');
                if (href && href[0] === '#' && config.kind === 'myApps' && routeWorkspaces[href] && !isAllowed(href)) {
                    event.preventDefault(); event.stopImmediatePropagation(); shell.navigate(routeWorkspaces[href]); return;
                }
                if (config.kind === 'myApps' && href && href[0] !== '#' && !link.hasAttribute('download') && !link.target) {
                    event.preventDefault(); event.stopImmediatePropagation(); openExternal(child, href); return;
                }
            }
            child.setTimeout(function () { checkRoute(child, currentFrame); }, 0);
        }
        function start() {
            if (!active || disposed || !shell) return;
            var current = ++generation;
            removeFrame();
            setPhase('loading', 'Cruise Port を開いています…');
            var next = document.createElement('iframe');
            next.title = config.title;
            next.className = 'port-tuner-frame port-library-frame';
            next.referrerPolicy = 'same-origin';
            if (config.kind !== 'news') next.allow = 'microphone'; // NEWS needs no audio permission.
            next.onload = function () {
                if (!active || disposed || current !== generation || frame !== next) return;
                try {
                    var child = next.contentWindow;
                    if (child.location.origin !== portUrl.origin || child.location.pathname !== portUrl.pathname) throw new Error('unexpected-port-document');
                    child.addEventListener('hashchange', function () { checkRoute(child, next); });
                    child.addEventListener('popstate', function () { checkRoute(child, next); });
                    child.document.addEventListener('click', function (event) { onChildClick(child, next, event); }, true);
                    var home = child.document.getElementById('home-view');
                    if (home) new child.MutationObserver(function () { checkRoute(child, next); }).observe(home, { attributes: true, attributeFilter: ['hidden'] });
                    if (config.hash) child.location.hash = config.hash;
                    else checkRoute(child, next);
                } catch (_) {
                    stop('Port画面を開けませんでした。別タブで開いてください。');
                    setPhase('failed', status.textContent);
                }
            };
            next.onerror = function () { if (frame === next) { stop('Port画面を開けませんでした。別タブで開いてください。'); setPhase('failed', status.textContent); } };
            frame = next;
            next.src = portUrl.href;
            surface.append(next);
        }
        function requestLeave(next) {
            if (!frame || !active) return false;
            var child, form, dialog, cancel, error, crop;
            try {
                child = frame.contentWindow;
                crop = child.document.getElementById(config.kind === 'gear' ? 'gear-photo-crop-dialog' : 'my-apps-crop-dialog');
                if (crop && !crop.hidden) { status.textContent = '画像の調整を終えてから画面を移動してください。'; return true; }
                if (config.kind !== 'gear') return false;
                form = child.document.getElementById('gear-form-view');
                dialog = child.document.getElementById('gear-exit-dialog');
                cancel = form?.querySelector('.view-back[data-action="gear-list"]');
                error = child.document.getElementById('gear-form-error');
            } catch (_) { return false; }
            if (!form || form.hidden || !dialog || !cancel) return false;
            if (pendingLeave) { pendingLeave.next = next; return true; }
            var state = { next: next, dialog: dialog, action: '', sawDialog: false, observer: null, onAction: null };
            function check() {
                if (pendingLeave !== state || !active || !frame) return;
                if (!dialog.hidden) state.sawDialog = true;
                if (form.hidden && dialog.hidden) {
                    var continueNavigation = state.next;
                    clearPendingLeave();
                    queueMicrotask(continueNavigation);
                } else if (state.sawDialog && dialog.hidden && (
                    state.action === 'continue' || !state.action ||
                    (state.action === 'save' && error && !error.hidden)
                )) clearPendingLeave();
            }
            state.onAction = function (event) {
                var button = event.target.closest('button');
                if (button?.id === 'gear-exit-save') state.action = 'save';
                if (button?.id === 'gear-exit-discard') state.action = 'discard';
                if (button?.id === 'gear-exit-continue') state.action = 'continue';
            };
            state.observer = new child.MutationObserver(check);
            state.observer.observe(form, { attributes: true, attributeFilter: ['hidden'] });
            state.observer.observe(dialog, { attributes: true, attributeFilter: ['hidden'] });
            if (error) state.observer.observe(error, { attributes: true, attributeFilter: ['hidden'] });
            dialog.addEventListener('click', state.onAction, true);
            pendingLeave = state;
            cancel.click(); // Port's existing dirty-form guard owns save/discard.
            child.setTimeout(check, 0);
            return true;
        }
        function onVisibility() { if (document.hidden && active) stop('Port画面を閉じました。再開してください。'); }
        function onPagehide() { if (active) stop(); }
        function onGlobalStop() {
            if (shell.getCommandContext().activeModal || shell.keyboard.isIMEBlocked({})) return;
            if (active) stop('Port画面を閉じました。再開してください。');
        }
        function onResume() { if (active && phase !== 'loading' && phase !== 'ready') start(); }
        function onOverview() { shell.navigate(config.overviewWorkspace); }
        function onSettings() {
            if (frame) frame.contentWindow.location.hash = '#settings';
        }
        return Object.freeze({
            load: function () {},
            attach: function (options) {
                if (shell || disposed) return;
                shell = options.shell;
                document.addEventListener('visibilitychange', onVisibility);
                window.addEventListener('pagehide', onPagehide);
                stopButton.addEventListener('click', onGlobalStop);
                resume.addEventListener('click', onResume);
                overview.addEventListener('click', onOverview);
                settings.addEventListener('click', onSettings);
                if (active) start();
            },
            activate: function () { active = true; if (shell) start(); },
            deactivate: function () { active = false; resume.hidden = true; stop(); },
            requestLeave: requestLeave,
            getState: function () { return Object.freeze({ active: active, phase: phase, hasFrame: !!frame }); },
            dispose: function () {
                if (disposed) return;
                active = false; stop();
                document.removeEventListener('visibilitychange', onVisibility);
                window.removeEventListener('pagehide', onPagehide);
                stopButton.removeEventListener('click', onGlobalStop);
                resume.removeEventListener('click', onResume);
                overview.removeEventListener('click', onOverview);
                settings.removeEventListener('click', onSettings);
                disposed = true;
            }
        });
    }
    CS.portGear = createSurface({ kind: 'gear', screen: 'screen-port-gear', surface: 'port-gear-surface', status: 'port-gear-status', resume: 'port-gear-resume', overview: 'port-gear-overview', settings: 'port-gear-settings', overviewWorkspace: 'gear', title: 'Cruise Port 機材リスト', hash: '#wishlist' });
    CS.portMyApps = createSurface({ kind: 'myApps', screen: 'screen-port-my-apps', surface: 'port-my-apps-surface', status: 'port-my-apps-status', resume: 'port-my-apps-resume', overview: 'port-my-apps-overview', settings: 'port-my-apps-settings', overviewWorkspace: 'myApps', title: 'Cruise Port My Apps', hash: '' });
    CS.portNews = createSurface({ kind: 'news', screen: 'screen-port-news', surface: 'port-news-surface', status: 'port-news-status', resume: 'port-news-resume', overview: 'port-news-overview', settings: 'port-news-settings', overviewWorkspace: 'news', title: 'Cruise Port NEWS', hash: '#news' });
})(typeof window !== 'undefined' ? window : globalThis);
