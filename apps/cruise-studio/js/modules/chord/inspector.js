/* Noninteractive Inspector: no shortcuts, focus changes, storage or mutation API. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.chordPresentation = factory();
})(globalThis, function () {
    'use strict';
    function mount(options) {
        var panel = options.document.getElementById('studio-chord-inspector'), off = null, disposed = false;
        var messages = { inactive: 'Structureでコードのある小節を選択してください。', unselected: '小節を選択するとコード情報を表示します。',
            invalid: '曲の入力値を確認してください。譜面に詳細診断を表示しています。',
            deleted: '選択した対象は削除されました。', multiple: '複数のコードがあります。単一コードの小節を選択してください。',
            editing: '入力中のdraftです。確定後にコード情報を表示します。',
            empty: 'この小節にはコードがありません。', unsupported: 'このコード表記はv1では未対応です。元の入力を保持しています。' };
        function render() {
            var state = options.adapter.read(options.selection.getSelectionSnapshot());
            panel.dataset.status = state.status;
            panel.querySelector('[data-chord-name]').textContent = state.symbol || 'コード情報';
            panel.querySelector('[data-chord-status]').textContent = messages[state.status] ||
                state.barNumber + '小節 · ' + (state.editing ? '入力中（確定済みdraft）' : state.dirty ? '編集中のdraft' : '現在の曲') + (state.externalUpdatePending ? ' · 外部更新待ち' : '');
            panel.querySelector('[data-chord-detail]').hidden = state.status !== 'ready';
            panel.querySelector('[data-chord-notes]').textContent = state.notes?.join(' · ') || '';
            panel.querySelector('[data-chord-degrees]').textContent = state.degrees?.join(' · ') || '';
            panel.querySelector('[data-chord-root]').textContent = state.rootName || '';
            panel.querySelector('[data-chord-bass]').textContent = state.bass?.name || 'ルート';
        }
        function connect() { if (disposed || off) return; off = options.selection.subscribeSelection(render); render(); }
        function disconnect() { if (off) { off(); off = null; } }
        function pagehide() { options.window.removeEventListener('pagehide', pagehide); disconnect(); }
        function pageshow(event) { if (event.persisted && !disposed) { options.window.addEventListener('pagehide', pagehide, { once: true }); connect(); } }
        options.window.addEventListener('pagehide', pagehide, { once: true });
        options.window.addEventListener('pageshow', pageshow);
        connect();
        return Object.freeze({ dispose: function () { if (disposed) return; disposed = true; disconnect();
            options.window.removeEventListener('pagehide', pagehide); options.window.removeEventListener('pageshow', pageshow); } });
    }
    return Object.freeze({ mount: mount });
});
