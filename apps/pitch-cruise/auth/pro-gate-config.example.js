/**
 * 全会員向け Pro の入室パスワード（共通・1か所で管理）
 *
 * 運用:
 * 1. このファイルを `pro-gate-config.js` にコピーして値を入れる
 * 2. パスワードを変えるときは `password` を変え、必ず `rotationId` を 1 増やす
 *    （増やすと、全アプリで「もう一度4桁入力」が必要になります）
 *
 * 他アプリの Pro でも、同じファイルを読み込めば同じパスワード・同じ入室状態（Cookie）が使えます。
 */
window.__SOUNDCRUISE_PRO_GATE__ = {
    rotationId: 1,
    password: '0000',
};
