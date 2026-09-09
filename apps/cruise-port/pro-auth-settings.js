import { isProEdition } from './cruise-port-edition.js?v=0.26.0';

export function initializeProAuthSettings(documentObject = document, windowObject = window, isPro = isProEdition) {
    const section = documentObject.querySelector('#settings-pro-auth');
    const button = documentObject.querySelector('#settings-pro-auth-reset');
    const error = documentObject.querySelector('#settings-pro-auth-error');
    section.hidden = !isPro();
    button.addEventListener('click', () => {
        if (!isPro()) return;
        error.hidden = true;
        if (!windowObject.confirm('Pro版の認証をリセットしますか？\n練習メニューやMy Appsなどのデータは削除されません。')) return;
        if (typeof windowObject.__soundCruiseClearGate !== 'function') {
            error.textContent = '認証をリセットできませんでした。ページを再読み込みしてお試しください。';
            error.hidden = false;
            return;
        }
        windowObject.__soundCruiseClearGate();
        windowObject.location.reload();
    });
}
