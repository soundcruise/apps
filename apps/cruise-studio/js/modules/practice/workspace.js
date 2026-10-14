(function (root) {
    'use strict';
    var CS = root.CruiseStudio = root.CruiseStudio || {};
    var usable = function (state) { return ['ready', 'legacy', 'empty', 'absent'].includes(state); };
    function createViewState() {
        var last = null, current = null, loading = false, selected = { menus: null, sets: null };
        return Object.freeze({
            reset: function () { last = current = null; loading = false; selected = { menus: null, sets: null }; },
            ingest: function (state) {
                current = state;
                if (state.dataset?.practice) {
                    last = state.dataset;
                    ['menus', 'sets'].forEach(function (kind) {
                        var section = last.practice[kind];
                        if (usable(section.state) && !section.items.some(function (x) { return x.id === selected[kind]; })) selected[kind] = null;
                    });
                }
            },
            setLoading: function (value) { loading = value; },
            select: function (kind, id) { if (last?.practice[kind]?.items.some(function (x) { return x.id === id; })) selected[kind] = id; },
            snapshot: function () {
                var stale = Boolean(last && (!current?.dataset || loading));
                var state = loading ? 'loading' : current?.account === 'unavailable' ? 'error' : stale ? 'stale' : last ? (last.state === 'forward-incompatible' || Object.values(last.practice).some(function (x) { return x?.state === 'future'; }) ? 'future' : 'ready') : 'unknown';
                return Object.freeze({ state: state, stale: stale, model: last?.practice || null, revision: last?.revision || null, selected: Object.freeze({ ...selected }) });
            }
        });
    }
    function mount(options) {
        var doc = options.document, shell = options.shell, node = doc.getElementById('screen-practice');
        var view = createViewState(), host = null, off = null, disposed = false, epoch = 0, limit = { menus: 50, sets: 50, history: 50, calendar: 50, progress: 50, attachments: 50 };
        var labels = { unknown: '未確認。ローカル保存値を確認するとPortの練習データを閲覧できます。', loading: '読み込み中', error: '読込失敗。保存データは変更していません。', stale: '更新を確認中。前回の値を表示しています。', future: '一部に非対応の新しい形式があります。対応する項目だけを表示します。', ready: 'ローカル保存値を閲覧中' };
        var formats = { absent: '保存値なし', empty: 'データなし', ready: '保存値を閲覧', legacy: '旧形式を閲覧（変換保存なし）', invalid: '形式を確認できません', future: '非対応の新しい形式', unsupported: '非対応の形式' };
        var q = function (selector) { return node.querySelector(selector); };
        var focus = (options.focus || CS.focusRouting).createWorkspaceFocus({ document: doc, node: node, workspaceId: 'practice', shell: shell, getFallback: function () { return q('#practice-read'); } });
        focus.mark(q('#practice-read'), 'controls', 'read', 'control');
        Object.keys(limit).forEach(function (kind) { focus.mark(q('[data-practice-more="' + kind + '"]'), kind, 'more', 'control'); });
        function el(tag, text) { var element = doc.createElement(tag); if (text !== undefined) element.textContent = text; return element; }
        function line(target, text) { target.append(el('p', text)); }
        function itemText(item) { return item.name + (item.hidden ? '（非表示設定）' : '') + (item.missing ? ' [' + item.id + ']' : ''); }
        function list(kind, section, row) {
            var box = q('[data-practice-list="' + kind + '"]'); box.replaceChildren();
            q('[data-practice-state="' + kind + '"]').textContent = section ? formats[section.state] + ' · ' + (usable(section.state) ? section.items.length + '件' : '件数未確認') : '未確認';
            var entries = section?.items || [];
            if (kind === 'history') entries = entries.slice().sort(function (a, b) { return b.timestamp.localeCompare(a.timestamp); });
            if (kind === 'calendar') entries = entries.slice().sort(function (a, b) { return b.localDate.localeCompare(a.localDate); });
            entries.slice(0, limit[kind]).forEach(function (x) { var li = el('li'); row(li, x); if (kind === 'history') { li.tabIndex = 0; focus.mark(li, kind, x.id, 'item'); } box.append(li); });
            q('[data-practice-more="' + kind + '"]').hidden = entries.length <= limit[kind];
        }
        function render() {
            if (disposed) return;
            var record = focus.beforeRender();
            var s = view.snapshot(), model = s.model;
            node.dataset.status = s.state; node.dataset.stale = String(s.stale);
            q('[data-practice-status]').textContent = labels[s.state] + (s.stale && s.state !== 'stale' ? ' 前回の値（stale）です。' : '');
            q('#practice-read').disabled = s.state === 'loading' || !host;
            ['menus', 'sets'].forEach(function (kind) {
                list(kind, model?.[kind], function (li, x) {
                    var button = el('button', itemText(x)); button.type = 'button'; button.dataset.practiceSelect = kind; button.dataset.practiceId = x.id; button.dataset.practiceKey = kind + ':' + x.id; button.setAttribute('aria-pressed', String(s.selected[kind] === x.id)); focus.mark(button, kind, x.id, 'item'); li.append(button);
                });
                var detail = q('[data-practice-detail="' + kind + '"]'); detail.replaceChildren();
                var selected = model?.[kind].items.find(function (x) { return x.id === s.selected[kind]; });
                if (!selected) { line(detail, '一覧から選択してください。'); return; }
                detail.append(el('h3', selected.name));
                if (kind === 'menus') {
                    line(detail, selected.durationMinutes + '分 · ' + selected.appLabel + (selected.hidden ? ' · 非表示設定' : ''));
                    line(detail, selected.memo || 'メモなし');
                    line(detail, '作成: ' + selected.createdAt + ' / 更新: ' + selected.updatedAt);
                    line(detail, '添付metadata（内容の閲覧は未接続）');
                    var attachments = model.attachments.items.filter(function (x) { return x.practiceId === selected.id; });
                    attachments.forEach(function (x) { line(detail, x.fileName + ' · ' + (x.byteSize === null ? 'サイズ未確認' : x.byteSize + ' bytes') + ' · ' + (x.mimeType || '種別未確認') + (x.state === 'invalid' ? ' · metadata不備' : '')); });
                    if (!attachments.length) line(detail, '共有datasetに添付metadataなし。ローカル添付の有無は未確認です。');
                } else {
                    var members = el('ol'); selected.members.forEach(function (x) { members.append(el('li', itemText(x))); }); detail.append(members);
                    if (!selected.members.length) line(detail, 'セット内メニューなし');
                }
            });
            list('progress', model?.progress, function (li, x) { li.textContent = itemText(x) + ' · 累積' + x.count + '回 · ' + (x.checked ? '今回チェック済み' : '今回未チェック') + (x.counted ? ' · 今回集計済み' : ''); });
            q('[data-practice-cycle]').textContent = model?.progress.cycleId ? 'サイクル: ' + model.progress.cycleId + (model.progress.pending ? ' · 完了確認待ち（' + model.progress.pending + '）' : '') : '';
            list('history', model?.history, function (li, x) { li.textContent = x.localDate + ' · ' + x.name + (x.reference?.missing ? '（削除済み / 参照先なし）' : '') + ' · ' + (x.durationMinutes !== null ? x.durationMinutes + '分' : x.durationSeconds !== null ? x.durationSeconds + '秒' : '完了記録') + (x.activeDurationSeconds !== null ? ' / 実働' + x.activeDurationSeconds + '秒' : '') + (x.durationSeconds !== null && x.durationMinutes !== null ? ' / 実測' + x.durationSeconds + '秒' : '') + (x.appLabel ? ' · ' + x.appLabel : ''); });
            // Calendar combines the stored localDate of training events with independent notes.
            var calendar = model ? { state: model.calendar.state, items: model.calendar.items.map(function (x) { return { ...x, name: x.icon + ' · ' + (x.time || '') + (x.endTime ? '–' + x.endTime : '') + ' ' + x.text }; }).concat(model.history.items.map(function (x) { return { id: 'history:' + x.id, localDate: x.localDate, name: x.name + (x.reference?.missing ? '（参照先なし）' : '') }; })) } : null;
            list('calendar', calendar, function (li, x) { li.textContent = x.localDate + ' · ' + x.name; });
            if (model && !usable(model.history.state)) q('[data-practice-state="calendar"]').textContent += ' / 練習記録: ' + formats[model.history.state];
            list('attachments', model?.attachments, function (li, x) { li.textContent = x.fileName + ' · ' + (x.byteSize == null ? 'サイズ未確認' : x.byteSize + ' bytes') + ' · ' + (x.reference ? itemText(x.reference) : 'メニュー参照未確認') + (x.state === 'invalid' ? ' · metadata不備' : ''); });
            q('[data-practice-attachments]').textContent = model ? '添付metadata: ' + formats[model.attachments.state] + ' · ' + model.attachments.items.length + '件（全体） / binary未接続。ローカル専用添付は未確認。' : '添付metadata未確認 / binary未接続';
            focus.afterRender(record);
        }
        async function read() {
            if (!host || disposed || view.snapshot().state === 'loading' || node.hidden || shell.getCommandContext().activeModal) return;
            var currentHost = host, sequence = epoch;
            view.setLoading(true); render();
            try { await currentHost.readLocalStatus(); }
            finally { if (!disposed && currentHost === host && sequence === epoch) { view.setLoading(false); render(); } }
        }
        function click(event) {
            if (node.hidden || shell.getCommandContext().activeModal) return;
            var button = event.target.closest('button'); if (!button || !node.contains(button)) return;
            if (button.id === 'practice-read') { void read(); return; }
            if (button.dataset.practiceSelect) view.select(button.dataset.practiceSelect, button.dataset.practiceId);
            else if (button.dataset.practiceMore) limit[button.dataset.practiceMore] += 50;
            render();
        }
        node.addEventListener('click', click);
        function attachHost(value) {
            if (disposed) return;
            epoch++; off?.(); off = null; host = value; view.reset();
            if (host) { view.ingest(host.getCachedStatus()); off = host.subscribe(function (state) { view.ingest(state); render(); }); }
            render();
        }
        render();
        return Object.freeze({ attachHost: attachHost, snapshot: view.snapshot, captureFocus: focus.capture, resolveFocus: focus.resolve, getFocusFallback: focus.fallback,
            load: function () {}, activate: render, deactivate: function () {}, dispose: function () { if (disposed) return; epoch++; off?.(); off = null; host = null; view.reset(); node.removeEventListener('click', click); focus.dispose(); disposed = true; } });
    }
    var instance = null;
    CS.practice = { init: function (options) { instance?.dispose(); instance = mount(options); return instance; }, attachHost: function (host) { instance?.attachHost(host); }, load: function () {}, activate: function () { instance?.activate(); }, deactivate: function () {} };
    ['captureFocus', 'resolveFocus', 'getFocusFallback'].forEach(function (name) { CS.practice[name] = function (value) { return instance?.[name](value); }; });
    CS.practicePresentation = { mount: mount, createViewState: createViewState };
    if (typeof module !== 'undefined' && module.exports) module.exports = CS.practicePresentation;
})(typeof window !== 'undefined' ? window : globalThis);
