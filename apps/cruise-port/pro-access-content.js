import { PRO_ENTRY_PATH, CRUISE_PORT_ROOT } from './cruise-port-edition.js?v=0.27.0';

// Official links already used by Port and Chord; no password or credential is published here.
export const MEMBERSHIP_URL = 'https://www.youtube.com/channel/UC4ncQuk56I8SK6lJGZcGwJQ/join';
export const MEMBER_POST_URL = 'https://www.youtube.com/post/UgkxGGd0QKGyDd3-mMWvhusmK4ZvqmH8I6Er';
export const PRO_VALUES = Object.freeze([
    '練習メニューを5件を超えて登録し、画像・PDFなどの資料を添付できます。',
    'My Appsを最大100件まで登録し、好きな画像をアイコンにできます。',
    '機材の写真を追加・調整し、自分の機材を見やすく整理できます。',
    'チューナーのカポ設定と、メトロノームの詳細設定・プリセット保存を使えます。',
    '複数端末でデータを同期し、同じ状態で使えます。同期で困ったときはAIへ相談できます。'
]);
export function proAccessMarkup() {
    return `<section class="pro-access-panel" aria-labelledby="pro-access-title">
        <h1 id="pro-access-title" tabindex="-1">Pro版の入手方法</h1>
        <p class="pro-access-intro">Cruise Port Proは、YouTubeメンバーシップ「フォルテ」の特典としてご利用いただけます。</p>
        <section class="pro-access-features" aria-labelledby="pro-access-value-title">
            <h2 id="pro-access-value-title">Proでできること</h2>
            <ul>${PRO_VALUES.map(text => `<li>${text}</li>`).join('')}</ul>
            <p>基本ツール・NEWS・音楽カレンダーは通常版でも利用できます。クラウド同期の案内とアカウント管理も確認できます。</p>
        </section>
        <ol class="pro-access-steps">
            <li class="pro-access-step"><span class="pro-access-step-number" aria-hidden="true">1</span><div class="pro-access-step-content">
                <h2 class="pro-access-step-title">メンバーシップ「フォルテ」への登録</h2>
                <p class="pro-access-step-note">登録条件と料金はYouTubeの画面でご確認ください。</p>
                <a class="pro-access-step-link" href="${MEMBERSHIP_URL}" target="_blank" rel="noopener noreferrer">登録ページへ<span class="pro-access-sr">（新しいタブ）</span></a>
            </div></li>
            <li class="pro-access-step"><span class="pro-access-step-number" aria-hidden="true">2</span><div class="pro-access-step-content">
                <h2 class="pro-access-step-title">メンバー限定投稿を確認</h2>
                <p class="pro-access-step-note">Pro版の案内と、ログイン用の4桁のパスワードをご確認ください。</p>
                <a class="pro-access-step-link" href="${MEMBER_POST_URL}" target="_blank" rel="noopener noreferrer">限定投稿へ<span class="pro-access-sr">（新しいタブ）</span></a>
            </div></li>
            <li class="pro-access-step"><span class="pro-access-step-number" aria-hidden="true">3</span><div class="pro-access-step-content">
                <h2 class="pro-access-step-title">Cruise Port Proを開く</h2>
                <p class="pro-access-step-note">確認したパスワードを入力すると、利用を開始できます。すでに利用資格と案内情報をお持ちの方も、こちらから開けます。</p>
                <a class="pro-access-step-link" href="${PRO_ENTRY_PATH}">Pro版を開く</a>
            </div></li>
        </ol>
        <p class="pro-access-storage-note">同じ端末・同じブラウザでは、通常版の保存データをそのまま利用できます。別のブラウザやホーム画面版では、データが別になる場合があります。</p>
        <footer class="pro-access-back"><button type="button" data-pro-access-back>← 戻る</button><a href="${CRUISE_PORT_ROOT}">通常版へ</a></footer>
    </section>`;
}
