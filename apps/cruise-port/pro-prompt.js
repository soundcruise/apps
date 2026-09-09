import { isProEdition, PRO_ENTRY_PATH } from './cruise-port-edition.js?v=0.26.0';

export const PRO_INFO_ROUTE = '#pro-access';

// Same modal interaction pattern as Port's completion/photo overlays:
// background inert, bounded keyboard focus and return focus on dismissal.
export function createProPrompt(documentObject = document, isPro = isProEdition) {
    const overlay = documentObject.createElement('div');
    overlay.className = 'port-pro-prompt';
    overlay.hidden = true;
    overlay.innerHTML = '<section class="view-panel" role="dialog" aria-modal="true" aria-labelledby="port-pro-prompt-title"><h2 id="port-pro-prompt-title">Cruise Port Pro</h2><p>Pro版では、さらに便利な機能を利用できます。</p><a class="action-button secondary-action" href="' + PRO_INFO_ROUTE + '">Pro版の入手方法</a><button class="action-button secondary-action" type="button">閉じる</button></section>';
    documentObject.body.append(overlay);
    const link = overlay.querySelector('a');
    const closeButton = overlay.querySelector('button');
    let returnFocus;
    const backgrounds = new Map();
    function close() {
        if (overlay.hidden) return;
        overlay.hidden = true;
        for (const [element, inert] of backgrounds) element.inert = inert;
        backgrounds.clear();
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }
    function open(message = 'Pro版では、さらに便利な機能を利用できます。') {
        if (isPro() || !overlay.hidden) return false;
        overlay.querySelector('p').textContent = message;
        returnFocus = documentObject.activeElement;
        for (const element of documentObject.body.children) {
            if (element === overlay) continue;
            backgrounds.set(element, element.inert);
            element.inert = true;
        }
        overlay.hidden = false;
        link.focus({ preventScroll: true });
        return true;
    }
    closeButton.addEventListener('click', close);
    link.addEventListener('click', close);
    overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key !== 'Tab') return;
        if (event.shiftKey && documentObject.activeElement === link) {
            event.preventDefault(); closeButton.focus();
        } else if (!event.shiftKey && documentObject.activeElement === closeButton) {
            event.preventDefault(); link.focus();
        }
    });
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    return { open, close };
}

export function applyProLinks(documentObject = document, pro = isProEdition()) {
    documentObject.querySelectorAll('[data-standard-pro-link]').forEach(section => {
        section.hidden = pro;
        section.querySelector('a').href = PRO_INFO_ROUTE;
        section.querySelector('a').textContent = 'Pro版の入手方法 →';
    });
}

export function createProAccessView(documentObject = document) {
    const view = documentObject.createElement('main');
    view.id = 'pro-access-view';
    view.className = 'port-view pro-access-view';
    view.hidden = true;
    view.innerHTML = `<button class="view-back" type="button">← 戻る</button>
        <section class="view-panel" aria-labelledby="pro-access-title">
            <h1 id="pro-access-title" class="view-title" tabindex="-1">Pro版の入手方法</h1>
            <p>クルーズポートPro版のご利用までの手順をご案内します。</p>
            <ol>
                <li><h2>メンバーシップ「フォルテ」への登録</h2><p>YouTube Chメンバーシップに下記ページから登録できます。</p><a class="action-button primary-action" href="https://www.youtube.com/channel/UC4ncQuk56I8SK6lJGZcGwJQ/join" target="_blank" rel="noopener noreferrer">登録ページへ（新しいタブ）</a></li>
                <li><h2>Pro版のURLとパスワードを確認</h2><p>YouTubeメンバー限定投稿で、Pro版に入るための情報を確認してください。</p><a class="action-button primary-action" href="https://www.youtube.com/post/UgkxGGd0QKGyDd3-mMWvhusmK4ZvqmH8I6Er" target="_blank" rel="noopener noreferrer">限定投稿へ（新しいタブ）</a></li>
                <li><h2>クルーズポートPro版を開く</h2><p>すでに利用権をお持ちの方は、確認したパスワードを入力してご利用ください。</p><a class="action-button secondary-action" href="${PRO_ENTRY_PATH}">Pro版を開く</a></li>
            </ol>
        </section>`;
    return view;
}
