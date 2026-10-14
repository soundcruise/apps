(function (root) {
    'use strict';
    var CS = root.CruiseStudio = root.CruiseStudio || {}, views = null;
    var usable = function (state) { return ['ready', 'legacy', 'empty', 'absent'].includes(state); };
    function createViewState(kind) {
        var source = null, last = null, selectedId = null, loading = false, filters = { query: '', status: 'all', category: 'all' };
        return Object.freeze({
            reset: function () { source = last = null; selectedId = null; loading = false; filters = { query: '', status: 'all', category: 'all' }; },
            ingest: function (state) {
                source = state;
                if (state.dataset?.library) {
                    last = state.dataset.library;
                    if (usable(last[kind].state) && !last[kind].items.some(function (x) { return x.id === selectedId; })) selectedId = null;
                }
            },
            setLoading: function (value) { loading = value; },
            setFilter: function (key, value) { if (Object.hasOwn(filters, key)) filters[key] = value; },
            select: function (id) { if (last?.[kind].items.some(function (x) { return x.id === id; })) selectedId = id; },
            snapshot: function () {
                var stale = Boolean(last && (!source?.dataset || loading));
                return Object.freeze({ model: last, selectedId: selectedId, filters: Object.freeze({ ...filters }), stale: stale,
                    state: loading ? 'loading' : source?.account === 'unavailable' ? 'error' : stale ? 'stale' : last ? last[kind].state : 'unknown' });
            }
        });
    }
    function mount(options) {
        var doc = options.document, shell = options.shell, kind = options.kind, filterItems = options.filterItems;
        var node = doc.getElementById(kind === 'gear' ? 'screen-gear' : 'screen-my-apps'), state = createViewState(kind), host = null, off = null, disposed = false, epoch = 0, limit = 50;
        var query = node.querySelector('[data-library-search]'), status = node.querySelector('[data-library-filter="status"]'), category = node.querySelector('[data-library-filter="category"]'), button = node.querySelector('[data-library-read]');
        var labels = { unknown: '未確認。ローカル保存値を確認してください。', loading: '読み込み中', ready: 'ローカル保存値を閲覧中', legacy: '旧形式を閲覧（補正・保存なし）', empty: 'データなし', absent: '保存値なし', stale: '更新を確認中。前回の値を表示しています。', error: '読込失敗。保存データは変更していません。', future: '非対応の新しいschema。閲覧できません。', unsupported: '非対応の旧形式。Portでの正式な移行は別工程です。', invalid: '形式を確認できません。' };
        function q(selector) { return node.querySelector(selector); }
        function el(tag, text) { var e = doc.createElement(tag); if (text !== undefined) e.textContent = text; return e; }
        function line(target, text) { target.append(el('p', text)); }
        function imageDetail(target, image) {
            line(target, '画像metadataのみ / 本体未確認・未接続');
            line(target, '表示参照: ' + (image.referenceId || '未確認') + ' / 元画像参照: ' + (image.sourceReferenceId || '未確認'));
            if (image.crop) line(target, 'crop: x=' + image.crop.x + ' y=' + image.crop.y + ' size=' + image.crop.size);
            if (image.unsupported) line(target, '非対応の画像参照 / crop field（補正なし）');
            var metadataLabels = { ready: '読取済み', legacy: '旧形式を閲覧', absent: '保存metadataなし', invalid: '形式を確認できません', future: '非対応の新しい形式', unsupported: '非対応の形式' };
            line(target, '共有画像metadata: ' + (metadataLabels[image.state] || '未確認') + (image.publishedClaim ? ' / 公開参照あり（本体の存在は未確認）' : ' / 公開参照未確認'));
            if (image.byteSize !== null || image.mimeType) line(target, (image.byteSize === null ? 'サイズ未確認' : image.byteSize + ' bytes') + ' / ' + (image.mimeType || '形式未確認'));
        }
        function render() {
            if (disposed) return;
            var s = state.snapshot(), section = s.model?.[kind], list = q('[data-library-list]'), detail = q('[data-library-detail]');
            var focusedId = node.contains(doc.activeElement) ? doc.activeElement?.dataset.libraryId : null;
            node.dataset.status = s.state; node.dataset.stale = String(s.stale);
            q('[data-library-status]').textContent = labels[s.state] + (s.stale && s.state !== 'stale' ? ' 前回の値（stale）です。' : '');
            button.disabled = s.state === 'loading' || !host;
            if (query.value !== s.filters.query) query.value = s.filters.query;
            if (status) status.value = s.filters.status;
            if (category) {
                category.replaceChildren(); var all = el('option', '全カテゴリ'); all.value = 'all'; category.append(all);
                var entries = (s.model?.gear.categories || []).slice();
                if (s.filters.category !== 'all' && !entries.some(x => x.id === s.filters.category)) entries.push({ id: s.filters.category, name: s.filters.category + '（参照先未確認）' });
                entries.forEach(function (x) { var option = el('option', x.name); option.value = x.id; category.append(option); }); category.value = s.filters.category;
            }
            var filtered = filterItems(s.model, kind, s.filters); q('[data-library-count]').textContent = section && usable(section.state) ? filtered.length + ' / ' + section.items.length + '件' : '件数未確認';
            list.replaceChildren();
            filtered.slice(0, limit).forEach(function (x) { var li = el('li'), select = el('button', kind === 'gear' ? [x.manufacturer, x.name].filter(Boolean).join(' / ') + ' · ' + x.statusLabel : x.name + ' · ' + x.typeLabel + ' / icon: ' + x.iconKind); select.type = 'button'; select.dataset.libraryId = x.id; select.setAttribute('aria-pressed', String(s.selectedId === x.id)); li.append(select); list.append(li); });
            q('[data-library-more]').hidden = filtered.length <= limit;
            q('[data-library-no-matches]').hidden = !section || !usable(section.state) || filtered.length > 0;
            detail.replaceChildren(); var selected = section?.items.find(function (x) { return x.id === s.selectedId; });
            if (!selected) line(detail, '一覧から選択してください。');
            else {
                detail.append(el('h3', selected.name));
                if (!filtered.some(x => x.id === selected.id)) line(detail, '選択項目は現在の検索・filterに含まれていません。');
                if (kind === 'gear') {
                    line(detail, 'メーカー: ' + (selected.manufacturer || '未記録 / 未確認')); line(detail, selected.statusLabel + ' / category: ' + selected.categoryLabel + (selected.categoryMissing ? '（参照先未確認）' : ''));
                    line(detail, '価格: ' + (selected.priceText || '未記録') + ' / 優先度: ' + ({ low: '低', medium: '中', high: '高' }[selected.priority] || '未確認') + ' / 保存された並び順: ' + (selected.order ?? '未確認'));
                    line(detail, selected.memo || 'メモなし'); line(detail, '所有開始: ' + (selected.ownedAt || '未記録') + ' / 手放した日: ' + (selected.soldAt || '未記録'));
                } else {
                    line(detail, selected.typeLabel + (selected.appLabel ? ' / ' + selected.appLabel : '') + (selected.appKey ? ' / appKey: ' + selected.appKey : ''));
                    line(detail, '登録済みURL（表示のみ・起動しません）。端末別URLと以前の設定を分けて表示しています。');
                    var platforms = { ios: 'iOS', android: 'Android', macos: 'macOS', windows: 'Windows', web: 'Web', 'legacy fallback': '以前の共通URL', '旧customLaunch ios': '以前のカスタムURL (iOS)', '旧customLaunch android': '以前のカスタムURL (Android)' };
                    selected.urls.forEach(function (u) { line(detail, (platforms[u.platform] || '未対応の端末') + ': ' + u.value + (u.state === 'unsupported' ? '（非対応・補正なし）' : '')); });
                    if (!selected.urls.length) line(detail, 'URL未確認');
                    line(detail, 'icon: ' + selected.iconKind + (selected.iconPresetKey ? ' / ' + (selected.iconPresetLabel || '非対応プリセット') + ' [' + selected.iconPresetKey + ']' : ''));
                    line(detail, 'Practice参照（練習メニュー / 過去履歴）');
                    selected.refs.forEach(function (r) { line(detail, (r.type === 'menu' ? 'メニュー' : '履歴 ' + r.localDate) + ': ' + r.name + ' [' + r.id + ']' + (r.hidden ? '（非表示設定）' : '')); });
                    if (!selected.refs.length) line(detail, '確認できたPractice参照なし');
                    if (!usable(selected.menuRefsState) || !usable(selected.historyRefsState)) line(detail, 'Practice参照を確認できない形式があります。履歴・保存値は変更していません。');
                }
                line(detail, '作成: ' + (selected.createdAt || '未確認') + ' / 更新: ' + (selected.updatedAt || '未確認')); imageDetail(detail, selected.image);
                selected.warnings.forEach(function (warning) { line(detail, '未対応の保存項目: ' + warning); });
            }
            if (focusedId) {
                var replacement = Array.from(list.querySelectorAll('button')).find(function (x) { return x.dataset.libraryId === focusedId; });
                (replacement || button).focus({ preventScroll: true });
            }
        }
        function allowed() { return !node.closest('[hidden], [inert]') && !shell.getCommandContext().activeModal; }
        async function read() {
            if (!host || !allowed() || state.snapshot().state === 'loading' || shell.keyboard.isIMEBlocked({})) return;
            var currentHost = host, sequence = epoch; state.setLoading(true); render();
            try { await currentHost.readLocalStatus(); } finally { if (!disposed && host === currentHost && epoch === sequence) { state.setLoading(false); render(); } }
        }
        function click(event) { if (!allowed()) return; var target = event.target.closest('button'); if (!target || !node.contains(target)) return; if (target === button) { void read(); return; } if (target.dataset.libraryId) state.select(target.dataset.libraryId); else if (target.hasAttribute('data-library-more')) limit += 50; render(); }
        function filter(event) {
            if (!allowed()) return;
            var target = event.target, key, value;
            if (target === query) { key = 'query'; value = query.value; }
            else if (target === status) { key = 'status'; value = status.value; }
            else if (target === category) { key = 'category'; value = category.value; }
            else return;
            // Native change on blur follows input. Do not remove the button being clicked/focused.
            if (state.snapshot().filters[key] === value) return;
            state.setFilter(key, value); limit = 50; render();
        }
        node.addEventListener('click', click); node.addEventListener('input', filter); node.addEventListener('change', filter);
        function attachHost(value) { if (disposed) return; epoch++; off?.(); off = null; host = value; state.reset(); limit = 50; if (host) { state.ingest(host.getCachedStatus()); off = host.subscribe(function (next) { state.ingest(next); render(); }); } render(); }
        render();
        return Object.freeze({ attachHost: attachHost, snapshot: state.snapshot, load: function () {}, activate: render, deactivate: function () {}, dispose: function () { if (disposed) return; epoch++; off?.(); off = null; host = null; state.reset(); node.removeEventListener('click', click); node.removeEventListener('input', filter); node.removeEventListener('change', filter); disposed = true; } });
    }
    CS.libraryPresentation = { mount: mount, createViewState: createViewState };
    CS.library = { init: function (options) { if (views) Object.values(views).forEach(v => v.dispose()); views = { gear: mount({ ...options, kind: 'gear' }), myApps: mount({ ...options, kind: 'myApps' }) }; return views; }, attachHost: function (host) { if (views) Object.values(views).forEach(v => v.attachHost(host)); } };
    ['gear', 'myApps'].forEach(function (kind) { CS[kind] = { load: function () {}, activate: function () { views?.[kind].activate(); }, deactivate: function () {} }; });
    if (typeof module !== 'undefined' && module.exports) module.exports = CS.libraryPresentation;
})(typeof window !== 'undefined' ? window : globalThis);
