/**
 * Staging 検証のみ: ?stagingPreview=1 で Pro を開いたとき、カスタム STAGE ボタン文言を
 * 通常版と同じ「👑 PROカスタムSTAGE」1行にし、pro-stage-teaser の字まわりを適用する。
 */
(function () {
    if (new URLSearchParams(location.search).get('stagingPreview') !== '1') return;

    document.documentElement.classList.add('staging-pro-custom-stage');

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '../staging/pro-custom-stage-align.css?v=8';
    document.head.appendChild(link);

    function patch() {
        var m = document.getElementById('btn-level-pro');
        var c = document.getElementById('btn-level-pro-chord');
        var text = '👑 PROカスタムSTAGE';
        if (m) {
            m.classList.add('pro-stage-teaser');
            m.textContent = text;
        }
        if (c) {
            c.classList.add('pro-stage-teaser');
            c.textContent = text;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', patch);
    } else {
        patch();
    }
})();
