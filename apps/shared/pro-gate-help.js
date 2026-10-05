// Shared public post link and troubleshooting content. No authentication state is read here.
(function (root) {
    'use strict';
    const POST_URL = 'https://www.youtube.com/post/UgkxGGd0QKGyDd3-mMWvhusmK4ZvqmH8I6Er';
    const bound = new WeakSet();

    function contentMarkup() {
        return '<div class="pro-post-help-content">' +
            '<ol class="pro-number-steps"><li class="pro-number-copy-step">' +
            '<button type="button" class="pro-post-copy" data-pro-post-copy>1. ここをタップしてURLをコピー</button>' +
            '<p class="pro-post-copy-status" data-pro-post-status role="status" aria-live="polite"></p>' +
            '<label class="pro-post-manual-copy" data-pro-post-manual hidden>投稿URL' +
            '<input type="text" readonly aria-label="投稿URL" value="' + POST_URL + '" spellcheck="false"></label>' +
            '</li><li>Safari / Chromeなどのブラウザを開く</li>' +
            '<li>アドレス欄に貼り付けて投稿を見る</li></ol>' +
            '<details class="pro-gate-troubleshoot-link pro-post-help">' +
            '<summary>うまく見られない場合</summary>' +
            '<div class="pro-post-troubleshooting">' +
            '<p>YouTubeアプリでは正しい投稿が開かない場合があります。Safari / Chromeなどのブラウザで開いてください。</p>' +
            '<p>ブラウザのYouTubeで、メンバーシップに登録しているGoogleアカウントにログインしていることを確認してください。別のアカウントの場合は、メンバーアカウントへ切り替えてください。</p>' +
            '<p>投稿URLは、ブラウザのアドレス欄へ直接貼り付けてください。</p>' +
            '</div></details>' +
            '</div>';
    }

    function primaryLinkMarkup() {
        return '<button type="button" class="pro-gate-password-link" data-pro-number-toggle ' +
            'aria-expanded="false" aria-controls="pro-number-guide">番号はこちら</button>';
    }

    function helpMarkup() {
        return '<section id="pro-number-guide" class="pro-number-guide" data-pro-number-guide hidden ' +
            'aria-label="番号の案内">' +
            contentMarkup() + '</section>';
    }

    function bind(container) {
        for (const toggle of container.querySelectorAll('[data-pro-number-toggle]')) {
            if (bound.has(toggle)) continue;
            bound.add(toggle);
            const guide = container.querySelector('[data-pro-number-guide]');
            toggle.addEventListener('click', () => {
                guide.hidden = !guide.hidden;
                toggle.setAttribute('aria-expanded', String(!guide.hidden));
            });
            guide.addEventListener('keydown', event => {
                // Escape first closes expanded troubleshooting, then the basic guide.
                if (event.key !== 'Escape' || event.defaultPrevented) return;
                event.preventDefault();
                guide.hidden = true;
                toggle.setAttribute('aria-expanded', 'false');
                toggle.focus();
            });
        }
        for (const button of container.querySelectorAll('[data-pro-post-copy]')) {
            if (bound.has(button)) continue;
            bound.add(button);
            const content = button.closest('.pro-post-help-content');
            const status = content.querySelector('[data-pro-post-status]');
            const manual = content.querySelector('[data-pro-post-manual]');
            button.addEventListener('click', async () => {
                button.disabled = true;
                try {
                    if (!root.navigator?.clipboard?.writeText) throw Error('Clipboard unavailable');
                    // Copy the fixed public URL, never an input value, token or app state.
                    await root.navigator.clipboard.writeText(POST_URL);
                    manual.hidden = true;
                    status.textContent = 'コピーしました';
                } catch (_) {
                    manual.hidden = false;
                    status.textContent = '自動でコピーできませんでした。下のURLを選択してコピーしてください。';
                    const input = manual.querySelector('input');
                    input.focus();
                    input.select();
                } finally { button.disabled = false; }
            });
        }
        for (const details of container.querySelectorAll('details.pro-post-help')) {
            if (bound.has(details)) continue;
            bound.add(details);
            details.addEventListener('keydown', event => {
                if (event.key !== 'Escape' || !details.open) return;
                event.preventDefault();
                details.open = false;
                details.querySelector('summary').focus();
            });
        }
    }

    function mountStandalone() {
        const host = root.document?.querySelector('[data-pro-post-help-page]');
        if (!host) return;
        host.innerHTML = contentMarkup() +
            '<div class="pro-post-help-back"><button type="button" data-pro-post-back>← 戻る</button>' +
            '<a href="./">Pro版へ戻る</a></div>';
        bind(host);
        host.querySelector('[data-pro-post-back]').addEventListener('click', () => {
            let internal = false;
            try { internal = new URL(root.document.referrer).origin === root.location.origin; } catch (_) { /* direct entry */ }
            if (internal && root.history.length > 1) root.history.back();
            else root.location.assign('./');
        });
    }

    root.SoundCruiseProPostHelp = Object.freeze({ POST_URL, primaryLinkMarkup, helpMarkup, bind });
    if (root.document?.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', mountStandalone, { once: true });
    } else mountStandalone();
})(typeof window === 'undefined' ? globalThis : window);
