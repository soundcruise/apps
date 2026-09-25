# AI相談（Cloud Sync UX 2.0 AI1）— プライバシーポリシー・利用規約

状態：AI1-C Security / Privacy Blocker Fix で `apps/cruise-port/privacy.html#ai-support` と
`apps/cruise-port/terms.html#ai-support` に反映済み（ローカルのみ・未公開）。本文の正はこの2ページで、
このファイルは根拠と公開前チェックの記録。

## 実装との対応（本文の各項目が何に基づくか）

| 本文 | 実装 |
|---|---|
| 任意機能・β期間中は Pro 版の対象アカウントのみ | Worker: `AI_SUPPORT_MODE === 'beta'` → Pro 認証 → Account 認証 → `AI_SUPPORT_BETA_ACCOUNT_IDS`（Worker secret）。Port の `?sound-cruise-ai-beta=1` は表示のみで権限ではない |
| 相談内容・直近の会話・同期状態の要約・同期先の表示名（または短い識別子） | `runSupportTurn` の messages（system / history / message）と `getSyncOverview` / `getAppSyncTargets` のツール結果。ID は最大8文字の shortId か会話内の T 参照 |
| 同期データの中身・完全な ID は送らない | `ai-diagnostics.js` の射影（テスト：provider request に ID・credential・payload が無い） |
| 認証情報の自動検出・遮断 | `secret-detector.js` + `ai-support-egress.js`（全 provider 呼び出しの直前に検査、該当時は送信しない）。番号らしい同期先名は使わず次の名前にフォールバック |
| Cruise は D1・ブラウザ保存領域に保存しない | ルートは SELECT のみ（D1 byte-identical テスト）。Port は会話をクロージャ内のメモリにのみ保持 |
| Cloudflare の条件 | 「Cloudflareのサービス条件・データ利用方針に従います」とだけ記載。Cloudflare 側の保存・学習について独自の断定はしない |
| 送信回数の一時的な計数 | `AI_SUPPORT_RATE_LIMITER`（Account 単位）/ `AI_SUPPORT_IP_RATE_LIMITER`（IP 単位）。相談内容は含まない |
| 回答は誤り得る・画面表示が優先・メール窓口 | パネルの注記、ガード＋修正1回＋固定フォールバック、フッターのメールリンク |

参照した Cloudflare 公式情報（2026-09-25 確認）：
https://developers.cloudflare.com/workers-ai/platform/data-usage/
本文では上記の内容を要約・断定せず、「Cloudflareのサービス条件・データ利用方針に従います」とする。

## パネル内の表示

- 開示文：送信すると、相談内容・直近の会話・同期状態の要約・同期先の表示名などを Cloudflare Workers AI で処理する旨と、番号やコードは自動検出して送らない旨。
- 「プライバシーポリシー」リンク（`privacy.html#ai-support`、Standard / Pro 共通）。
- 入力欄の直前：「4桁の番号・復旧コード・接続コードなどは入力しないでください。」
- 初回同意モーダルは無し。「送信」を押すことが能動的な同意。

## β公開前の確認事項（未完了）

- 公開日に合わせて privacy.html / terms.html の最終更新日を確認する。
- `AI_SUPPORT_BETA_ACCOUNT_IDS` を Worker secret として設定する（リポジトリ・wrangler.jsonc・ログには書かない）。
- AI Gateway を使う場合は、プロンプト／レスポンスのログ保存をオフにしてから使う（現在は使っていない）。
