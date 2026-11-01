/* Studio Shell v1: workspace host and UI-only layout. No document/audio/service ownership. */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.shell = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';
    var WORKSPACES = Object.freeze({ app_pitch:'screen-app-pitch',app_fretboard:'screen-app-fretboard',app_rhythm:'screen-app-rhythm',app_chord:'screen-app-chord', home: 'screen-home', portSync:'screen-port-sync', sheetCruise: 'screen-sheet-cruise', preDtm: 'screen-pre-dtm', series: 'screen-series', portPractice: 'screen-port-practice', practice: 'screen-practice', tuner: 'screen-tuner', metronome: 'screen-metronome', portGear: 'screen-port-gear', gear: 'screen-gear', portMyApps: 'screen-port-my-apps', myApps: 'screen-my-apps', portNews: 'screen-port-news', news: 'screen-news' });
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
        var rail=doc.createElement('div');rail.id='studio-sidebar-resize';rail.tabIndex=0;rail.setAttribute('role','separator');rail.setAttribute('aria-label','左メニュー幅');rail.setAttribute('aria-orientation','vertical');doc.querySelector('.studio-nav').append(rail);
        var sidebarWidth=176;
        try{var savedWidth=Number(localStorage.getItem('cruiseStudio.sidebarWidth'));if(savedWidth>=128&&savedWidth<=300)sidebarWidth=savedWidth;}catch(_){}
        function sizeSidebar(value,save){sidebarWidth=Math.min(300,Math.max(128,value));var effective=Math.min(sidebarWidth,Math.max(128,shell.clientWidth*.22));shell.style.setProperty('--studio-sidebar-width',effective+'px');rail.setAttribute('aria-valuemin','128');rail.setAttribute('aria-valuemax','300');rail.setAttribute('aria-valuenow',String(Math.round(effective)));if(save)try{localStorage.setItem('cruiseStudio.sidebarWidth',String(sidebarWidth));}catch(_){} }
        rail.addEventListener('pointerdown',function(e){if(e.button!==0)return;e.preventDefault();rail.setPointerCapture(e.pointerId);});
        rail.addEventListener('pointermove',function(e){if(rail.hasPointerCapture(e.pointerId))sizeSidebar(e.clientX-shell.getBoundingClientRect().left,true);});
        rail.addEventListener('pointerup',function(e){if(rail.hasPointerCapture(e.pointerId))rail.releasePointerCapture(e.pointerId);});
        rail.addEventListener('keydown',function(e){if(e.isComposing)return;if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();sizeSidebar(e.key==='Home'?128:e.key==='End'?300:sidebarWidth+(e.key==='ArrowRight'?16:-16),true);}});
        sizeSidebar(sidebarWidth,false);window.addEventListener('resize',function(){sizeSidebar(sidebarWidth,false);});
        var positions = Object.create(null), focus = Object.create(null);
        var visitHistory = [];
        var workspaceIds = Object.keys(WORKSPACES).filter(function(id){return !!doc.getElementById(WORKSPACES[id]);});
        var adapters = { home: {}, portSync:CS.portSync, sheetCruise: CS.sheetCruise, preDtm: CS.preDtm, series: {}, portPractice: CS.portPractice, practice: CS.practice, tuner: CS.tuner, metronome: CS.portMetronome, portGear: CS.portGear, gear: CS.gear, portMyApps: CS.portMyApps, myApps: CS.myApps, portNews: CS.portNews, news: CS.news };
        ['pitch','fretboard','rhythm','chord'].forEach(function(id){adapters['app_'+id]=CS.seriesApps[id];});
        Object.keys(adapters).forEach(function(id){if(!workspaceIds.includes(id))delete adapters[id];});
        var nodes = {}, dockedTool = null;
        var toolIds = ['app_pitch','app_fretboard','app_rhythm','app_chord','tuner','metronome','portPractice','portGear','portMyApps'];
        var realTools = {};
        toolIds.forEach(function(id){realTools[id]=adapters[id];adapters[id]={load:function(){realTools[id].load?.();},activate:function(){if(dockedTool!==id)realTools[id].activate();},deactivate:function(){if(dockedTool!==id)return realTools[id].deactivate();}};});
        var toolWindow=doc.createElement('aside');toolWindow.id='studio-tool-window';toolWindow.hidden=true;toolWindow.setAttribute('aria-label','独立ツール');
        toolWindow.innerHTML='<div class="tool-window-bar"><select id="tool-window-select" aria-label="ツールを切り替え"></select><button type="button" id="tool-window-center" title="中央へ移動" aria-label="中央へ移動">▣</button></div><p id="tool-window-status" role="status"></p><div id="tool-window-slot"></div><div id="tool-window-resize" role="separator" aria-label="ツール幅" aria-orientation="vertical" tabindex="0"></div>';
        shell.append(toolWindow);
        var toolSlot=toolWindow.querySelector('#tool-window-slot'),toolSelect=toolWindow.querySelector('select'),toolTrigger=null;
        var toolNames={app_pitch:'音感クルーズ',app_fretboard:'指板クルーズ',app_rhythm:'リズムクルーズ',app_chord:'コードクルーズ',tuner:'チューナー',metronome:'メトロノーム',portPractice:'練習・カレンダー',portGear:'機材',portMyApps:'My Apps'};
        var placeholder=doc.createElement('option');placeholder.value='';placeholder.textContent='ツールを選択';toolSelect.append(placeholder);
        toolIds.forEach(function(id){var o=doc.createElement('option');o.value=id;o.textContent=toolNames[id];toolSelect.append(o);});
        function moveNode(parent,node){if(parent.moveBefore&&node.isConnected)parent.moveBefore(node,null);else parent.append(node);if(node.id.startsWith('screen-app-'))CS.seriesApps[node.id.slice(11)]?.refreshLayout();}
        function toolHasInput(id){if(!id||!nodes[id])return false;if(id.startsWith('app_'))return !!nodes[id].querySelector('iframe')?.contentWindow?.studioAppDirty;var d=nodes[id].querySelector('iframe')?.contentDocument;return !!d&&Array.from(d.querySelectorAll('form,[role=dialog]')).some(function(e){return !e.closest('[hidden]')&&d.defaultView.getComputedStyle(e).display!=='none';});}
        function hasToolInput(){return toolHasInput(dockedTool);}
        function guardTool(next){if(!dockedTool)return false;if(realTools[dockedTool].requestLeave?.(next))return true;if(hasToolInput()&&!dockedTool.startsWith('app_')){doc.getElementById('tool-window-status').textContent='編集中のフォームを保存またはキャンセルしてから移動してください。';return true;}return false;}
        function closeToolUnchecked(){if(!dockedTool){toolWindow.hidden=true;shell.removeAttribute('data-tool-window');toolToggle.setAttribute('aria-expanded','false');return;}var id=dockedTool;dockedTool=null;realTools[id].deactivate();moveNode(main.querySelector('.studio-container'),nodes[id]);nodes[id].hidden=true;nodes[id].inert=true;nodes[id].classList.add('hidden');toolWindow.hidden=true;shell.removeAttribute('data-tool-window');toolToggle.setAttribute('aria-expanded','false');if(toolTrigger?.isConnected)toolTrigger.focus({preventScroll:true});refreshGeometry();}
        function closeTool(){if(modal.getActive())return false;if(guardTool(closeTool))return false;closeToolUnchecked();return true;}
        function openTool(id, preserveCenter){
            if(!CS.entryAuth?.isAuthorized())return false;
            if(!toolIds.includes(id)||modal.getActive())return false;
            doc.getElementById('tool-window-status').textContent='';
            if(dockedTool===id){toolSelect.focus();return true;}
            if(guardTool(function(){openTool(id,preserveCenter);}))return false;
            var central=host.getActive()===id;
            if(central&&preserveCenter){doc.getElementById('tool-window-status').textContent='このツールは中央で使用中です。別の画面へ移動してから選択してください。';return false;}
            if(central&&realTools[id].requestLeave?.(function(){openTool(id,preserveCenter);}))return false;
            if(central&&nodes[id].querySelector('iframe')&&!toolSlot.moveBefore){window.alert('このブラウザでは使用中画面の状態を維持して移動できません。保存してホームへ戻ってから開いてください。');return false;}
            closeToolUnchecked();layout.closeRight();renderLayout();toolTrigger=doc.activeElement;dockedTool=id;
            moveNode(toolSlot,nodes[id]);nodes[id].hidden=false;nodes[id].inert=false;nodes[id].classList.remove('hidden');toolSelect.value=id;toolWindow.hidden=false;shell.dataset.toolWindow='open';toolToggle.setAttribute('aria-expanded','true');
            if(central)host.activate('home');else realTools[id].activate();
            refreshGeometry();return true;
        }
        doc.querySelectorAll('[data-open-tool]').forEach(function(button){button.addEventListener('click',function(){openTool(button.dataset.openTool);});});
        var toolToggle=doc.createElement('button');toolToggle.type='button';toolToggle.id='studio-tool-toggle';toolToggle.textContent='◧';toolToggle.title='右側ツールを開閉';toolToggle.setAttribute('aria-label','右側ツールを開閉');toolToggle.setAttribute('aria-controls','studio-tool-window');toolToggle.setAttribute('aria-expanded','false');shell.append(toolToggle);
        toolToggle.addEventListener('click',function(){if(modal.getActive())return;if(!toolWindow.hidden){closeTool();return;}layout.closeRight();renderLayout();toolTrigger=toolToggle;toolSelect.value='';toolWindow.hidden=false;shell.dataset.toolWindow='open';toolToggle.setAttribute('aria-expanded','true');toolSelect.focus();refreshGeometry();});
        toolWindow.addEventListener('keydown',function(e){if(e.key==='Escape'&&!e.isComposing&&!modal.getActive()){e.preventDefault();e.stopPropagation();closeTool();}});
        toolSelect.addEventListener('change',function(){var id=toolSelect.value;toolSelect.value=dockedTool||'';if(id)openTool(id,true);});
        function centerTool(){
            if(!dockedTool?.startsWith('app_')||modal.getActive())return;
            var id=dockedTool,active=host.getActive();
            if(realTools[active]?.requestLeave?.(centerTool))return;
            if(!toolSlot.moveBefore){doc.getElementById('tool-window-status').textContent='このブラウザでは画面を維持した移動ができません。';return;}
            dockedTool=null;moveNode(main.querySelector('.studio-container'),nodes[id]);toolWindow.hidden=true;shell.removeAttribute('data-tool-window');toolToggle.setAttribute('aria-expanded','false');host.activate(id);refreshGeometry();
        }
        toolWindow.querySelector('#tool-window-center').addEventListener('click',centerTool);
        var resizeHandle=toolWindow.querySelector('#tool-window-resize');
        function setToolWidth(width){shell.style.setProperty('--studio-tool-width',Math.min(600,Math.max(300,width))+'px');refreshGeometry();}
        resizeHandle.addEventListener('pointerdown',function(e){if(e.button!==0)return;e.preventDefault();resizeHandle.setPointerCapture(e.pointerId);});
        resizeHandle.addEventListener('pointermove',function(e){if(resizeHandle.hasPointerCapture(e.pointerId))setToolWidth(shell.getBoundingClientRect().right-e.clientX);});
        resizeHandle.addEventListener('pointerup',function(e){if(resizeHandle.hasPointerCapture(e.pointerId))resizeHandle.releasePointerCapture(e.pointerId);});
        resizeHandle.addEventListener('keydown',function(e){if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setToolWidth(toolWindow.getBoundingClientRect().width+(e.key==='ArrowLeft'?20:-20));}});
        window.addEventListener('beforeunload',function(e){if(hasToolInput()){e.preventDefault();e.returnValue='';}});
        CS.toolWindow=Object.freeze({open:openTool,close:closeTool,discardLockedFrame:function(frame){
            var id=toolIds.find(function(key){return nodes[key].contains(frame);});
            if(!id||!frame.inert||!confirm('この画面の未保存内容を破棄して閉じますか？'))return false;
            if(dockedTool===id)closeToolUnchecked();
            else if(host.getActive()===id)host.activate('home');
            return true;
        },hasUnsaved:function(){return toolIds.concat(['portSync']).some(toolHasInput);},getTool:function(){return dockedTool;}});
        var focusRouting = CS.focusRouting.createFocusRouting(doc, function () { return nodes[host.getActive()]; }, function () {
            return doc.querySelector('.studio-nav [aria-current="page"]');
        }, function (element) {
            var id = host.getActive(), saved = focus[id], adapter = adapters[id];
            if (saved && saved.element === element && saved.identity && adapter.resolveFocus) {
                return adapter.resolveFocus(saved.identity) || adapter.getFocusFallback();
            }
            return element;
        });
        workspaceIds.forEach(function (id) {
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
                    if(key===dockedTool)return;
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
            var toolbar = nodes.sheetCruise?.querySelector('.sheet-toolbar');
            var rect = toolbar?.getBoundingClientRect();
            var top = box.top + 8;
            if (nodes.sheetCruise && !nodes.sheetCruise.hidden && rect?.height) top = Math.max(top, rect.bottom + 8);
            top = Math.min(top, Math.max(box.top + 8, box.bottom - 168));
            return { width: main.clientWidth, height: main.clientHeight, left: box.left, right: box.left + main.clientWidth,
                top: top, bottom: box.bottom, bottomMargin: 8, contain: true };
        }
        function refreshGeometry() { CS.sheetCruise?.setLoupeSafeAreaProvider(safeArea); }
        function restoreHiddenFocus(region, button) {
            if (region.contains(doc.activeElement)) focusRouting.restore(button);
        }
        function renderLayout() {
            if(!right||!dock){refreshGeometry();return;}
            var s = layout.get();
            if (!s.rightOpen) restoreHiddenFocus(right, doc.getElementById(s.rightType==='inspector'&&host.getActive()==='sheetCruise'?'sc-chord-forms':'shell-'+s.rightType));
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
            doc.getElementById('sc-chord-forms').setAttribute('aria-expanded',String(s.rightOpen&&s.rightType==='inspector'));
            doc.getElementById('shell-pane-title').textContent = s.rightType === 'inspector' ? '押さえ方' : 'Tools';
            doc.getElementById('shell-dock-toggle').setAttribute('aria-expanded', String(!s.dockCollapsed));
            refreshGeometry();
        }
        function navigate(id) {
            if(!CS.entryAuth?.isAuthorized())return false;
            if(host.getActive()?.startsWith('app_')&&host.getActive()!==id&&realTools[host.getActive()].requestLeave())return false;
            if(modal.getActive())return false;
            if(dockedTool===id){toolSelect.focus();return true;}
            if (modal.getActive() || !Object.hasOwn(nodes, id) || host.getActive() === id) return false;
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
            if(!CS.entryAuth?.isAuthorized())return false;
            if(host.getActive()?.startsWith('app_')&&realTools[host.getActive()].requestLeave())return false;
            if(modal.getActive())return false;
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
            header.parentNode.insertBefore(nav, header);
        });
        ['inspector', 'tool'].forEach(function (type) {
            doc.getElementById('shell-'+type)?.addEventListener('click', function () {
                if(modal.getActive())return;
                if(dockedTool){if(guardTool(function(){doc.getElementById('shell-'+type).click();}))return;closeToolUnchecked();}
                var s = layout.get();
                if (s.rightOpen && s.rightType === type) layout.closeRight(); else layout.openRight(type);
                renderLayout();
            });
        });
        doc.getElementById('sc-chord-forms')?.addEventListener('click',function(){doc.getElementById('shell-inspector').click();});
        doc.getElementById('shell-pane-close')?.addEventListener('click', function () { layout.closeRight(); renderLayout(); });
        doc.getElementById('shell-dock-toggle')?.addEventListener('click', function () { layout.toggleDock(); renderLayout(); });
        var ime = CS.keyboard.createIMEGuard(window.setTimeout.bind(window), window.clearTimeout.bind(window));
        var modal = CS.modals.createModalManager({ document: doc, background: shell, canOpen: function () { return !!CS.entryAuth?.isAuthorized(); }, focus: focusRouting, canFocus: CS.focusRouting.canFocus, ime: ime });
        // Explicit slots stay null until their owner connects them; DOM focus never assigns these targets.
        var targets = { activeDocument: null, selectedObject: null, musicalInputSession: null, editingSession: null, transport: null, audioOwner: null };
        function getCommandContext() {
            return Object.freeze(Object.assign({}, targets, { authorized: !!CS.entryAuth?.isAuthorized(), activeWorkspaceId: host.getActive(), focusedElement: doc.activeElement,
                activeModal: modal.getActive(), rightPaneState: layout.get() }));
        }
        var commands = CS.commands.createRouter(getCommandContext);
        var keyboard = CS.keyboard.createKeyboardRouter({ document: doc, getContext: getCommandContext, commands: commands, ime: ime, modal: modal });
        if(CS.sheetCruise)keyboard.registerEscape({ scope: 'transient', workspaceId: 'sheetCruise', handle: CS.sheetCruise.closeTransient });
        keyboard.registerEscape({ scope: 'pane', handle: function () {
            var s = layout.get();
            if (!s.rightOpen || (s.persistent && !right.contains(doc.activeElement))) return false;
            layout.closeRight(); renderLayout(); return true;
        } });
        if(CS.sheetCruise)keyboard.registerEscape({ scope: 'workspace', workspaceId: 'sheetCruise', handle: CS.sheetCruise.handleEscape });
        CS.sheetCruise?.setEscapeRouter(keyboard.localEscape);
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
