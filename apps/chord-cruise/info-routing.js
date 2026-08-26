(function () {
    'use strict';

    var defaultHome = './standard/index.html';
    var proHome = './pro_k7m4q9v2x8/index.html';
    var editionHomeStorageKey = 'chordCruiseEditionHome';
    var currentUrl = new URL(window.location.href);
    var editionParam = currentUrl.searchParams.get('edition');

    function normalizeEditionHome(urlLike) {
        if (!urlLike) return '';
        try {
            var url = new URL(urlLike, window.location.href);
            var basePath = new URL('./', window.location.href).pathname;
            if (url.origin !== window.location.origin || url.pathname.indexOf(basePath) !== 0) return '';
            var relativePath = url.pathname.slice(basePath.length);
            if (relativePath === '' || /^index\.html$/i.test(relativePath) || /^standard\/(?:index\.html)?$/i.test(relativePath)) {
                return new URL(defaultHome, window.location.href).href;
            }
            if (/^pro_k7m4q9v2x8\/(?:index\.html)?$/i.test(relativePath)) {
                return new URL(proHome, window.location.href).href;
            }
            return '';
        } catch (error) {
            return '';
        }
    }

    function rememberEditionHome(homePath) {
        var normalizedHome = normalizeEditionHome(homePath);
        if (!normalizedHome) return '';
        try { sessionStorage.setItem(editionHomeStorageKey, normalizedHome); } catch (error) {}
        return normalizedHome;
    }

    function getStoredEditionHome() {
        try { return normalizeEditionHome(sessionStorage.getItem(editionHomeStorageKey)); } catch (error) { return ''; }
    }

    function isProHomePath(homePath) {
        var normalizedHome = normalizeEditionHome(homePath);
        return normalizedHome ? /\/pro_k7m4q9v2x8\/index\.html$/i.test(new URL(normalizedHome).pathname) : false;
    }

    function resolveHomePath() {
        if (editionParam === 'standard') return rememberEditionHome(defaultHome) || defaultHome;
        if (editionParam === 'pro') return rememberEditionHome(proHome) || proHome;
        var referrerHome = normalizeEditionHome(document.referrer);
        if (referrerHome) return rememberEditionHome(referrerHome);
        return getStoredEditionHome() || defaultHome;
    }

    function resolveProAccessDisplayEdition() {
        if (editionParam !== null) {
            if (editionParam === 'standard' || editionParam === 'pro') return editionParam;
            return '';
        }
        var referrerHome = normalizeEditionHome(document.referrer);
        if (referrerHome) return isProHomePath(referrerHome) ? 'pro' : 'standard';
        var storedHome = getStoredEditionHome();
        if (storedHome) return isProHomePath(storedHome) ? 'pro' : 'standard';
        return '';
    }

    var homePath = resolveHomePath();
    var resolvedEdition = isProHomePath(homePath) ? 'pro' : 'standard';

    document.querySelectorAll('[data-cc-edition-home]').forEach(function (link) {
        link.href = homePath;
    });
    document.querySelectorAll('[data-cc-edition-info]').forEach(function (link) {
        link.href = './info.html?from=home&edition=' + encodeURIComponent(resolvedEdition);
    });
    document.querySelectorAll('[data-cc-edition-page]').forEach(function (link) {
        link.href = './' + link.getAttribute('data-cc-edition-page') + '?edition=' + encodeURIComponent(resolvedEdition);
    });

    var backLink = document.querySelector('[data-cc-info-back]');
    if (backLink) {
        backLink.href = homePath;
        backLink.addEventListener('click', function (event) {
            if (currentUrl.searchParams.get('from') === 'home') {
                event.preventDefault();
                window.location.href = homePath;
                return;
            }
            if (window.history.length > 1 && document.referrer) {
                event.preventDefault();
                window.history.back();
            }
        });
    }

    var proAccessLink = document.getElementById('cc-info-pro-access-link');
    var proAccessNewBadge = document.getElementById('cc-info-pro-access-new-badge');
    if (proAccessLink && resolveProAccessDisplayEdition() === 'standard') {
        proAccessLink.hidden = false;
        if (proAccessNewBadge) {
            try {
                var proAccessNewKey = 'chordCruiseProAccessNewSeen';
                if (localStorage.getItem(proAccessNewKey) !== '1') {
                    proAccessNewBadge.hidden = false;
                    localStorage.setItem(proAccessNewKey, '1');
                }
            } catch (error) {
                proAccessNewBadge.hidden = false;
            }
        }
    }

    var youtubeConfirm = document.getElementById('cc-youtube-confirm');
    var youtubeCancel = document.getElementById('cc-youtube-confirm-cancel');
    var youtubeOpen = document.getElementById('cc-youtube-confirm-open');
    var pendingYoutubeUrl = '';

    function closeYoutubeConfirm() {
        pendingYoutubeUrl = '';
        if (youtubeConfirm) youtubeConfirm.hidden = true;
    }

    if (youtubeConfirm && youtubeCancel && youtubeOpen) {
        document.querySelectorAll('[data-cc-youtube-confirm]').forEach(function (link) {
            link.addEventListener('click', function (event) {
                event.preventDefault();
                pendingYoutubeUrl = this.href;
                youtubeConfirm.hidden = false;
                youtubeOpen.focus();
            });
        });
        youtubeCancel.addEventListener('click', closeYoutubeConfirm);
        youtubeConfirm.addEventListener('click', function (event) {
            if (event.target === youtubeConfirm) closeYoutubeConfirm();
        });
        youtubeOpen.addEventListener('click', function () {
            if (pendingYoutubeUrl) window.location.href = pendingYoutubeUrl;
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && !youtubeConfirm.hidden) closeYoutubeConfirm();
        });
    }
}());
