'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.resolve(__dirname, '..');
var standardHtml = fs.readFileSync(path.join(root, 'standard/index.html'), 'utf8');
var proHtml = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');
var infoHtml = fs.readFileSync(path.join(root, 'info.html'), 'utf8');
var usageHtml = fs.readFileSync(path.join(root, 'usage.html'), 'utf8');
var termsHtml = fs.readFileSync(path.join(root, 'terms.html'), 'utf8');
var privacyHtml = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
var routingSource = fs.readFileSync(path.join(root, 'info-routing.js'), 'utf8');
var themeSource = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
var infoFiles = [infoHtml, usageHtml, termsHtml, privacyHtml, routingSource];

function occurrences(source, text) {
    return source.split(text).length - 1;
}

function createStorage() {
    var values = {};
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
        setItem: function (key, value) { values[key] = String(value); }
    };
}

function runRouting(url) {
    var homeLink = {};
    var infoLink = {};
    var pageLink = {
        getAttribute: function () { return 'usage.html'; }
    };
    var backLink = { addEventListener: function () {} };
    var proAccessLink = { hidden: true };
    var proAccessBadge = { hidden: true };
    var sessionStorage = createStorage();
    var localStorage = createStorage();
    var document = {
        referrer: '',
        querySelectorAll: function (selector) {
            if (selector === '[data-cc-edition-home]') return [homeLink];
            if (selector === '[data-cc-edition-info]') return [infoLink];
            if (selector === '[data-cc-edition-page]') return [pageLink];
            return [];
        },
        querySelector: function (selector) {
            return selector === '[data-cc-info-back]' ? backLink : null;
        },
        getElementById: function (id) {
            if (id === 'cc-info-pro-access-link') return proAccessLink;
            if (id === 'cc-info-pro-access-new-badge') return proAccessBadge;
            return null;
        },
        addEventListener: function () {}
    };
    var window = {
        location: new URL(url),
        history: { length: 1 },
        sessionStorage: sessionStorage,
        localStorage: localStorage,
        document: document
    };
    vm.runInNewContext(routingSource, {
        window: window,
        document: document,
        sessionStorage: sessionStorage,
        localStorage: localStorage,
        URL: URL
    }, { filename: 'info-routing.js' });
    return {
        homeLink: homeLink,
        infoLink: infoLink,
        pageLink: pageLink,
        backLink: backLink,
        proAccessLink: proAccessLink
    };
}

assert.strictEqual(occurrences(standardHtml, 'class="cc-info-home-slot"'), 1, 'Standard home has one information slot');
assert.strictEqual(occurrences(proHtml, 'class="cc-info-home-slot"'), 1, 'Pro home has one information slot');
assert(standardHtml.includes('../info.html?from=home&amp;edition=standard'), 'Standard information link carries its edition');
assert(proHtml.includes('../info.html?from=home&amp;edition=pro'), 'Pro information link carries its edition');
assert(standardHtml.indexOf('cc-info-home-slot') < standardHtml.indexOf('id="cc-screen-explore"'), 'Standard information link remains inside the home section');
assert(proHtml.indexOf('cc-info-home-slot') < proHtml.indexOf('id="cc-screen-explore"'), 'Pro information link remains inside the home section');

['info.html', 'usage.html', 'terms.html', 'privacy.html'].forEach(function (fileName) {
    assert(fs.existsSync(path.join(root, fileName)), fileName + ' exists');
});
infoFiles.forEach(function (source) {
    assert(!source.includes('リズムクルーズ'), 'Chord information files contain no Rhythm Cruise name');
    assert(!source.includes('pro_r4m8k7n2q9x'), 'Chord information files contain no Rhythm Pro path');
    assert(!source.includes('rhythmCruiseEditionHome'), 'Chord information files contain no Rhythm storage key');
    assert(!/\brc-[a-z0-9_-]+/i.test(source), 'Chord information files contain no rc-* class or ID');
});

assert(infoHtml.includes('コードクルーズ | インフォメーション'), 'information page has the Chord Cruise title');
assert(infoHtml.includes('https://www.youtube.com/channel/UC4ncQuk56I8SK6lJGZcGwJQ'), 'information page uses the verified YouTube channel URL');
assert(!infoHtml.includes('【動画】正しい使い方と初期設定'), 'Standard usage video item is not generated');
assert(!infoHtml.includes('【動画】Pro版の機能とおすすめの使い方'), 'Pro usage video item is not generated');
assert(infoHtml.includes('cc-youtube-confirm-cancel') && infoHtml.includes('cc-youtube-confirm-open'), 'YouTube confirmation exposes cancel and open actions');
assert(routingSource.includes("event.key === 'Escape'") && routingSource.includes('event.target === youtubeConfirm'), 'YouTube confirmation supports Escape and backdrop close');
assert(routingSource.includes("editionHomeStorageKey = 'chordCruiseEditionHome'"), 'routing uses the Chord-specific session key');

var standardRoute = runRouting('https://soundcruise.jp/apps/chord-cruise/info.html?from=home&edition=standard');
assert(/\/standard\/index\.html$/.test(standardRoute.homeLink.href), 'Standard information returns to Standard home');
assert.strictEqual(standardRoute.proAccessLink.hidden, false, 'Standard information shows the Pro access route');
assert(standardRoute.pageLink.href.endsWith('usage.html?edition=standard'), 'Standard edition propagates to related pages');

var proRoute = runRouting('https://soundcruise.jp/apps/chord-cruise/info.html?from=home&edition=pro');
assert(/\/pro_k7m4q9v2x8\/index\.html$/.test(proRoute.homeLink.href), 'Pro information returns to Pro home');
assert.strictEqual(proRoute.proAccessLink.hidden, true, 'Pro information keeps the purchase route hidden');
assert(proRoute.pageLink.href.endsWith('usage.html?edition=pro'), 'Pro edition propagates to related pages');

var unknownRoute = runRouting('https://soundcruise.jp/apps/chord-cruise/info.html?edition=unknown');
assert.strictEqual(unknownRoute.proAccessLink.hidden, true, 'unknown edition fails closed for the purchase route');

assert(usageHtml.includes('コードを調べる') && usageHtml.includes('CAGEDフォーム') && usageHtml.includes('コード本棚'), 'usage page documents current Chord Cruise flows');
assert(!/マイク|ストローク|リズム判定/.test(termsHtml + privacyHtml), 'legal pages contain no Rhythm-specific input or judgement descriptions');
assert(privacyHtml.includes('localStorage') && privacyHtml.includes('保存したコードフォーム'), 'privacy page describes actual local browser storage');
assert(themeSource.includes('@media (max-width: 480px)') && themeSource.includes('.cc-info-shell'), 'information layout includes a mobile breakpoint');
assert(themeSource.includes('.cc-info-link-card[hidden]'), 'information card CSS preserves hidden Pro-only routes');

console.log('info-pages: Standard/Pro routes, Chord-only content, legal pages, and YouTube confirmation OK');
