# 一般Pro公開候補 — ローカル検証記録

日付: 2026-11-07 JST。作業開始基準 `20a734953b38bee6085f4ac29c236094c0d4291c`。
Worker 0.2.0、Port 1.29.0。PR #222の自然文・診断2ツール・履歴・1回修正・認証/egressを継承。
作業中のmain更新は `d053905141a0e75806a8a14fc24929632da0154c` (Studioのみ、対象ファイル重複なし)。
最終branchはこのmainへ合わせる。元の作業フォルダ・既存ブランチの未コミット変更は変更しない。

## 結果

| 確認 | 結果 |
|---|---|
| Worker `node --test workers/sound-cruise-sync/test/*.test.js` | 969 PASS / 0 FAIL / 0 SKIP |
| Port AI UI/client + cache graph | 46 PASS / 0 FAIL / 0 SKIP |
| AI関連 + production security + Port関連の重点確認 | 149 PASS / 0 FAIL / 0 SKIP（上記と重複するため加算しない） |
| 実ローカルworkerd/D1 | migration、同時16要求、精算、report SQL、retention PASS |
| SQLite別Worker thread/別DB接続 | 同時12要求に対し予約2枠だけ受付 PASS |
| 同時Promise要求 | 32要求でAccount/全体の各上限を超過しない PASS |
| Wrangler 4.131.1 deploy --dry-run | PASS、実アップロードなし、mode=off |
| git diff --check | PASS |

上限・使用量の新規試験17件に加え、既存route fixtureで認可・通常相談・Account間隔離・履歴/4呼出修正・秘密非保存を検証。
JST日/月/年/閏日の境界、両Account上限、両全体予算、usage欠落/部分値/不正値、タイムアウト、推論例外、
管理DB欠落・書込失敗・応答喪失・精算失敗、二重精算、HMAC誤変更、予約の非TTL解放、保持期間のtransaction rollbackを含む。
usage_verified=0の保守計上と、合成usageが検証済みという前提のusage_verified=1の両方を試験した。
実モデルusageの検証済みを意味しない。

## 再現

Node 24.14.0、既存lockfileのWrangler 4.131.1 / 既存Miniflareを使用。依存更新なし。

```sh
node --test workers/sound-cruise-sync/test/*.test.js
node --test apps/cruise-port/sync-ai-support.test.mjs apps/cruise-port/module-cache-keys.test.mjs
cd workers/sound-cruise-sync
npm run test:ai-support
npm run test:ai-usage:local
npx wrangler deploy --dry-run --outdir <temporary-output-directory>
```

既存の別worktreeのMiniflareを使用する場合、`AI_USAGE_MINIFLARE_MODULE`にそのmoduleの絶対pathを渡せる。
check-ai-usage-local.mjsは使い捨てのローカルDBだけを作り、AI binding・remote DB・R2は作らない。

## 保証の範囲・未確認

- SYNC_DBは既存SELECT-only/byte-identical試験を維持。新しい書込みは独立AI DBのみ。
- PR差分にStudio、NEWS、他4アプリ、shared、既存Sync DB migration、既存wrangler設定の変更は含めない。
- tuner-app.jsは版表示のimport cache keyだけ。音声・チューナー実装の変更なし。
- UI確認は既存のDOM/clientテスト。Safari/PWA/実端末でのレイアウト・実モデル回答は未確認。
- 保存済み合成回答を再利用。有料推論・全30ケース再評価・本番データアクセスなし。
- provider側の課金usageと実請求の照合は未実施。初期usage_verified=0で過少精算を避ける。
- 本番用AI D1、binding、HMAC secret、migration適用、本人限定実機β、一般公開は未実施。

## 判定

Draft PRにするローカル公開候補としてPASS。必要リソースを承認の範囲で準備した後の最小実機βへは条件付きで進める。
一般Pro公開は未承認・HOLD。残件は配備手順のリソース/設定確認、実機3〜4入力の受入、課金usageと保守計上の実用性確認。
新たな包括監査、Studio完成待ち、全件実モデル再評価を公開条件へ追加しない。
配備・停止・費用の保証範囲は [AI-SUPPORT-PRO-ROLLOUT.md](AI-SUPPORT-PRO-ROLLOUT.md) に記載。
