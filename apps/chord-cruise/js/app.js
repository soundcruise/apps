(function () {
    'use strict';

    var CHORD_CRUISE_APP_VERSION = '0.21.0';
    window.CHORD_CRUISE_APP_VERSION = CHORD_CRUISE_APP_VERSION;

    var SCREENS = ['home', 'explore', 'library'];

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.state = {
        settings: null,
        screen: 'home'
    };

    var navEl = document.getElementById('cc-nav');
    var appEl = document.getElementById('cc-app');

    function showScreen(name) {
        SCREENS.forEach(function (screenName) {
            var el = document.getElementById('cc-screen-' + screenName);
            if (!el) {
                return;
            }
            if (screenName === name) {
                el.classList.remove('cc-screen--hidden');
            } else {
                el.classList.add('cc-screen--hidden');
            }
        });

        window.ChordCruise.state.screen = name;

        if (appEl) {
            appEl.classList.toggle('cc-app--library', name === 'library');
        }

        if (name === 'explore' && window.ChordCruise.ui && window.ChordCruise.ui.explore) {
            window.ChordCruise.ui.explore.render();
        }

        if (name === 'library' && window.ChordCruise.ui && window.ChordCruise.ui.library) {
            window.ChordCruise.ui.library.render();
        }

        if (name === 'home' && window.ChordCruise.ui && window.ChordCruise.ui.library) {
            window.ChordCruise.ui.library.resetView();
        }

        if (navEl) {
            if (name === 'home') {
                navEl.classList.add('cc-nav--hidden');
                navEl.setAttribute('aria-hidden', 'true');
            } else {
                navEl.classList.remove('cc-nav--hidden');
                navEl.setAttribute('aria-hidden', 'false');
            }
        }
    }

    function bindEvents() {
        var goExploreBtn = document.getElementById('cc-go-explore');
        var goLibraryBtn = document.getElementById('cc-go-library');
        var navBackBtn = document.getElementById('cc-nav-back');
        var navTopBtn = document.getElementById('cc-nav-top');

        if (goExploreBtn) {
            goExploreBtn.addEventListener('click', function () {
                showScreen('explore');
            });
        }

        if (goLibraryBtn) {
            goLibraryBtn.addEventListener('click', function () {
                showScreen('library');
            });
        }

        if (navTopBtn) {
            navTopBtn.addEventListener('click', function () {
                showScreen('home');
            });
        }

        if (navBackBtn) {
            navBackBtn.addEventListener('click', function () {
                if (window.ChordCruise.state.screen === 'library' &&
                    window.ChordCruise.ui.library &&
                    window.ChordCruise.ui.library.back()) {
                    return;
                }
                showScreen('home');
            });
        }
    }

    function init() {
        window.ChordCruise.storage.ensureSchemaVersion();
        window.ChordCruise.state.settings = window.ChordCruise.storage.loadSettings();
        if (window.ChordCruise.ui && window.ChordCruise.ui.settings) {
            window.ChordCruise.ui.settings.init();
        }
        bindEvents();
        showScreen('home');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
