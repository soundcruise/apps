/**
 * 検証ハブ（staging/index.html）から遷移したときだけ、各版の画面に
 * 「検証トップへ」ボタンを出す。本番直URLでは表示しない。
 */
(function () {
    var PARAM = 'fromStagingHub';
    var STORAGE_KEY = 'pitchTrainerFromStagingHub';
    var STAGING_TOKEN = 'x9v7q2m8';
    var params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    if (params.get(PARAM) === '1') {
        try {
            sessionStorage.setItem(STORAGE_KEY, '1');
        } catch (e) { /* ignore */ }
        params.delete(PARAM);
        var q = params.toString();
        var newUrl = location.pathname + (q ? '?' + q : '') + location.hash;
        try {
            history.replaceState(null, '', newUrl);
        } catch (e) { /* ignore */ }
    }
    var show = false;
    try {
        show = sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) { /* ignore */ }
    if (!show) return;

    function inject() {
        if (document.getElementById('staging-hub-back-link')) return;
        var link = document.createElement('a');
        link.id = 'staging-hub-back-link';
        link.href = '../staging/index.html?k=' + encodeURIComponent(STAGING_TOKEN);
        link.className = 'staging-hub-back-link';
        link.textContent = '検証トップへ';
        link.setAttribute('title', '検証用ハブ（staging）のトップに戻る');
        link.setAttribute('aria-label', '検証用ハブのトップに戻る');
        document.body.appendChild(link);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
})();
