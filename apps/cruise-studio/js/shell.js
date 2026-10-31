/* Studio Shell v1: workspace host and UI-only layout. No document/audio/service ownership. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.shell = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';
    var WORKSPACES = Object.freeze({ home: 'screen-home', sheetCruise: 'screen-sheet-cruise', preDtm: 'screen-pre-dtm', series: 'screen-series', portPractice: 'screen-port-practice', practice: 'screen-practice', tuner: 'screen-tuner', metronome: 'screen-metronome', portGear: 'screen-port-gear', gear: 'screen-gear', portMyApps: 'screen-port-my-apps', myApps: 'screen-my-apps', portNews: 'screen-port-news', news: 'screen-news' });
    var PERSISTENT_MIN = 1280;

    function createWorkspaceHost(workspaces, view) {
        var active = null, generation = 0;
        var loaded = new Set();
        return Object.freeze({
            activate: function (id) {
                if (!Object.hasOwn(workspaces, id) || active === id) return false;
                var previous = active;
                if (previous && workspaces[previous].deactivate) workspaces[previous].deactivate();
                view.show(id, previous);
                if (!loaded.has(id)) {
                    if (workspaces[id].load) workspaces[id].load();
                    loaded.add(id);
                }
                active = id;
                generation++;
                if (workspaces[id].activate) workspaces[id].activate();
                view.restore(id);
                return true;
            },
            getActive: function () { return active; },
            getGeneration: function () { return generation; }
        });
    }

    function createLayoutState(width) {
        var value = { rightOpen: false, rightType: 'inspector', inspector: { selection: null }, tool: { toolId: null }, dockCollapsed: true, persistent: width >= PERSISTENT_MIN };
        return {
            get: function () { return { rightOpen: value.rightOpen, rightType: value.rightType, inspector: Object.assign({}, value.inspector), tool: Object.assign({}, value.tool), dockCollapsed: value.dockCollapsed, persistent: value.persistent }; },
            openRight: function (type) { if (type !== 'inspector' && type !== 'tool') throw new TypeError('unknown pane type'); value.rightType = type; value.rightOpen = true; },
            closeRight: function () { value.rightOpen = false; },
            toggleDock: function () { value.dockCollapsed = !value.dockCollapsed; },
            resize: function (width) {
                var persistent = width >= PERSISTENT_MIN;
                if (persistent !== value.persistent) value.rightOpen = false;
                value.persistent = persistent;
            }
        };
    }

    function init(CS) {
        var doc = document;
        var shell = doc.getElementById('studio-shell');
        var main = doc.getElementById('studio-main');
        var right = doc.getElementById('studio-right-pane');
        var dock = doc.getElementById('studio-dock');
        var layout = createLayoutState(shell.clientWidth);
        var positions = Object.create(null), focus = Object.create(null);
        var visitHistory = [];
        var adapters = { home: {}, sheetCruise: CS.sheetCruise, preDtm: CS.preDtm, series: {}, portPractice: CS.portPractice, practice: CS.practice, tuner: CS.tuner, metronome: CS.portMetronome, portGear: CS.portGear, gear: CS.gear, portMyApps: CS.portMyApps, myApps: CS.myApps, portNews: CS.portNews, news: CS.news };
        var nodes = {};
        var focusRouting = CS.focusRouting.createFocusRouting(doc, function () { return nodes[host.getActive()]; }, function () {
            return doc.querySelector('.studio-nav [aria-current="page"]');
        }, function (element) {
            var id = host.getActive(), saved = focus[id], adapter = adapters[id];
            if (saved && saved.element === element && saved.identity && adapter.resolveFocus) {
                return adapter.resolveFocus(saved.identity) || adapter.getFocusFallback();
            }
            return element;
        });
        Object.keys(WORKSPACES).forEach(function (id) {
            nodes[id] = doc.getElementById(WORKSPACES[id]);
            CS.scroll.setRoot(id, main);
            nodes[id].addEventListener('focusin', function (event) {
                if (doc.activeElement !== event.target) return;
                focus[id] = { element: event.target, identity: adapters[id].captureFocus ? adapters[id].captureFocus(event.target) : null };
            });
        });
        var host = createWorkspaceHost(adapters, {
            show: function (id, previous) {
                if (previous) positions[previous] = { x: main.scrollLeft, y: main.scrollTop };
                Object.keys(nodes).forEach(function (key) {
                    var inactive = key !== id;
                    nodes[key].hidden = inactive;
                    nodes[key].inert = inactive;
                    nodes[key].classList.toggle('hidden', inactive);
                });
                shell.dataset.workspace = id;
                doc.querySelectorAll('.studio-nav [data-workspace]').forEach(function (button) {
                    if (button.dataset.workspace === id) button.setAttribute('aria-current', 'page');
                    else button.removeAttribute('aria-current');
                });
                main.scrollTo(0, 0);
            },
            restore: function (id) {
                var pos = positions[id];
                if (pos) main.scrollTo(pos.x, pos.y);
                var saved = focus[id], adapter = adapters[id];
                var target = saved && saved.identity && adapter.resolveFocus ? adapter.resolveFocus(saved.identity) : saved && saved.element;
                if (!focusRouting.valid(target) && saved && saved.identity && adapter.getFocusFallback) target = adapter.getFocusFallback();
                if (focusRouting.valid(target)) target.focus({ preventScroll: true });
                else nodes[id].focus({ preventScroll: true });
                refreshGeometry();
            }
        });
        function safeArea() {
            var box = main.getBoundingClientRect();
            var toolbar = nodes.sheetCruise.querySelector('.sheet-toolbar');
            var rect = toolbar.getBoundingClientRect();
            var top = box.top + 8;
            if (!nodes.sheetCruise.hidden && rect.height) top = Math.max(top, rect.bottom + 8);
            top = Math.min(top, Math.max(box.top + 8, box.bottom - 168));
            return { width: main.clientWidth, height: main.clientHeight, left: box.left, right: box.left + main.clientWidth,
                top: top, bottom: box.bottom, bottomMargin: 8, contain: true };
        }
        function refreshGeometry() { CS.sheetCruise.setLoupeSafeAreaProvider(safeArea); }
        function restoreHiddenFocus(region, button) {
            if (region.contains(doc.activeElement)) focusRouting.restore(button);
        }
        function renderLayout() {
            var s = layout.get();
            if (!s.rightOpen) restoreHiddenFocus(right, doc.getElementById('shell-'+s.rightType));
            if (s.dockCollapsed) restoreHiddenFocus(dock, doc.getElementById('shell-dock-toggle'));
            right.hidden = !s.rightOpen; right.inert = !s.rightOpen;
            dock.hidden = s.dockCollapsed; dock.inert = s.dockCollapsed;
            shell.dataset.rightOpen = String(s.rightOpen);
            shell.dataset.paneMode = s.persistent ? 'persistent' : 'overlay';
            ['inspector', 'tool'].forEach(function (type) {
                var panel = doc.getElementById('shell-'+type+'-content');
                panel.hidden = type !== s.rightType; panel.inert = type !== s.rightType;
                doc.getElementById('shell-'+type).setAttribute('aria-expanded', String(s.rightOpen && s.rightType === type));
            });
            doc.getElementById('shell-pane-title').textContent = s.rightType === 'inspector' ? 'Inspector' : 'Tools';
            doc.getElementById('shell-dock-toggle').setAttribute('aria-expanded', String(!s.dockCollapsed));
            refreshGeometry();
        }
        function navigate(id) {
            if (modal.getActive() || !Object.hasOwn(WORKSPACES, id) || host.getActive() === id) return false;
            if (host.getActive() === 'portPractice' && CS.portPractice.requestLeave(function () { navigate(id); })) return false;
            if (host.getActive() === 'portGear' && CS.portGear.requestLeave(function () { navigate(id); })) return false;
            if (host.getActive() === 'portMyApps' && CS.portMyApps.requestLeave(function () { navigate(id); })) return false;
            var current = host.getActive();
            if (current) {
                visitHistory.push(current);
                if (visitHistory.length > 40) visitHistory.shift();
            }
            return host.activate(id);
        }
        function goBack() {
            if (modal.getActive()) return false;
            if (host.getActive() === 'portPractice' && CS.portPractice.requestLeave(goBack)) return false;
            if (host.getActive() === 'portGear' && CS.portGear.requestLeave(goBack)) return false;
            if (host.getActive() === 'portMyApps' && CS.portMyApps.requestLeave(goBack)) return false;
            var previous;
            do { previous = visitHistory.pop(); } while (previous === host.getActive());
            return host.activate(previous || 'home');
        }
        doc.querySelectorAll('.studio-nav [data-workspace]').forEach(function (button) {
            button.addEventListener('click', function () { navigate(button.dataset.workspace); });
        });
        doc.querySelectorAll('.screen:not(#screen-home) > .screen-header').forEach(function (header) {
            var nav = doc.createElement('div');
            nav.className = 'workspace-local-nav';
            var back = doc.createElement('button');
            back.type = 'button'; back.className = 'workspace-back'; back.textContent = '← 戻る';
            back.setAttribute('aria-label', '前の画面に戻る');
            back.addEventListener('click', goBack);
            var home = doc.createElement('button');
            home.type = 'button'; home.className = 'workspace-home'; home.textContent = '⌂ ホーム';
            home.setAttribute('aria-label', 'ホームに戻る');
            home.addEventListener('click', function () { navigate('home'); });
            nav.appendChild(back); nav.appendChild(home);
            header.insertBefore(nav, header.firstChild);
        });
        ['inspector', 'tool'].forEach(function (type) {
            doc.getElementById('shell-'+type).addEventListener('click', function () {
                var s = layout.get();
                if (s.rightOpen && s.rightType === type) layout.closeRight(); else layout.openRight(type);
                renderLayout();
            });
        });
        doc.getElementById('shell-pane-close').addEventListener('click', function () { layout.closeRight(); renderLayout(); });
        doc.getElementById('shell-dock-toggle').addEventListener('click', function () { layout.toggleDock(); renderLayout(); });
        var ime = CS.keyboard.createIMEGuard(window.setTimeout.bind(window), window.clearTimeout.bind(window));
        var modal = CS.modals.createModalManager({ document: doc, background: shell, focus: focusRouting, canFocus: CS.focusRouting.canFocus, ime: ime });
        // Explicit slots stay null until their owner connects them; DOM focus never assigns these targets.
        var targets = { activeDocument: null, selectedObject: null, musicalInputSession: null, editingSession: null, transport: null, audioOwner: null };
        function getCommandContext() {
            return Object.freeze(Object.assign({}, targets, { activeWorkspaceId: host.getActive(), focusedElement: doc.activeElement,
                activeModal: modal.getActive(), rightPaneState: layout.get() }));
        }
        var commands = CS.commands.createRouter(getCommandContext);
        var keyboard = CS.keyboard.createKeyboardRouter({ document: doc, getContext: getCommandContext, commands: commands, ime: ime, modal: modal });
        keyboard.registerEscape({ scope: 'transient', workspaceId: 'sheetCruise', handle: CS.sheetCruise.closeTransient });
        keyboard.registerEscape({ scope: 'pane', handle: function () {
            var s = layout.get();
            if (!s.rightOpen || (s.persistent && !right.contains(doc.activeElement))) return false;
            layout.closeRight(); renderLayout(); return true;
        } });
        keyboard.registerEscape({ scope: 'workspace', workspaceId: 'sheetCruise', handle: CS.sheetCruise.handleEscape });
        CS.sheetCruise.setEscapeRouter(keyboard.localEscape);
        keyboard.attach();
        // Overlay is nonmodal: background clicks still reach their original controls.
        main.addEventListener('click', function () {
            var s = layout.get();
            if (s.rightOpen && !s.persistent) { layout.closeRight(); renderLayout(); }
        });
        var themeControl = doc.getElementById('shell-theme');
        CS.colorTheme.listColorThemes().forEach(function (theme) {
            var label = doc.createElement('label'); label.className = 'studio-theme-option';
            var input = doc.createElement('input'); input.type = 'radio'; input.name = 'studio-theme'; input.value = theme.id;
            input.checked = CS.colorTheme.getColorTheme() === theme.id;
            var caption = doc.createElement('span'); caption.textContent = theme.displayName;
            input.addEventListener('change', function () {
                if (!input.checked) return;
                var result = CS.colorTheme.setColorTheme(input.value);
                doc.getElementById('shell-theme-status').textContent = result.ok ? '' : 'テーマを保存できませんでした。この画面にのみ適用しています。';
            });
            label.appendChild(input); label.appendChild(caption); themeControl.appendChild(label);
        });
        CS.colorTheme.subscribeColorTheme(function (id) {
            themeControl.querySelectorAll('input').forEach(function (input) { input.checked = input.value === id; });
        });
        main.addEventListener('scroll', refreshGeometry, { passive: true });
        function onResize() { layout.resize(shell.clientWidth); renderLayout(); }
        window.addEventListener('resize', onResize);
        // Observe the scroll viewport, not paper height written by its own ResizeObserver.
        if (window.ResizeObserver) {
            var lastWidth = -1, lastHeight = -1;
            new ResizeObserver(function () {
                if (window.matchMedia('print').matches || !main.clientWidth || !main.clientHeight) return;
                if (main.clientWidth === lastWidth && main.clientHeight === lastHeight) return;
                lastWidth = main.clientWidth; lastHeight = main.clientHeight; refreshGeometry();
            }).observe(main);
        }
        renderLayout();
        host.activate('home');
        return Object.freeze({
            navigate: navigate, goBack: goBack,
            getActiveWorkspace: host.getActive, getWorkspaceGeneration: host.getGeneration, getLayoutState: layout.get,
            getCommandContext: getCommandContext, commands: commands, keyboard: keyboard, modal: modal,
            setCommandTarget: function (name, value) {
                if (!Object.hasOwn(targets, name)) throw new TypeError('Unknown command target');
                targets[name] = value == null ? null : value;
            }
        });
    }
    return Object.freeze({ WORKSPACES: WORKSPACES, PERSISTENT_MIN: PERSISTENT_MIN, createWorkspaceHost: createWorkspaceHost, createLayoutState: createLayoutState, init: init });
});
