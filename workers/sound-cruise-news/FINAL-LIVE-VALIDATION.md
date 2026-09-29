# Shimamura Final Live Validation Report

## Overall Verdict

**READY FOR PRODUCTION NEWS INFRA**

現行パーサーが1回の実ページ取得で成功。追加GET・パーサー修正は不要。
本判定はNEWS本番基盤へ進める技術的な受入判定であり、本番化の実行ではない。

## 1. Git Baseline

- branch: main
- HEAD / origin/main: `be28371fbb40a689c6208c0920e25cb4e0f6567e`
- ahead / behind: 0 / 0、staged: 0
- 開始時: tracked変更38ファイル、untracked 24エントリ。
- 正式baseline: Port 1.4.3、NEWS WIP: Port 1.5.0 / News Worker 0.2.0。
- 開始diff・stat・状態・対象ハッシュを確認し、既存NEWS WIPを保持。
- `.claude/`、Sync Workerの未追跡node_modulesには変更なし。

## 2. Validation Time

2026-09-30 **08:39:30.960 JST**。
前回2026-09-29 08:16:26.176 JSTから24時間23分4.784秒経過。
08:17 JST以降の実行条件を満たす。
次回listingアクセス可能時刻: **2026-10-01 08:39:30.960 JST**。
これは取得の予約・自動実行指示ではない。

## 3. Request Count

| Request | Count |
|---|---:|
| listing GET | 1 |
| robots GET | 0 |
| article GET | 0 |
| image GET | 0 |
| feed GET | 0 |
| HEAD | 0 |
| other publisher | 0 |
| second live GET | 0 |

HTTP送信イベントを実測: wireRequests=1、blockedRequests=0。
事前DNS解決後、接続先IPv4を固定。OSの送信ポート制限、Node接続先制限、
GET先・回数制限を併用。初回sandbox設定は起動前に拒否され、HTTP送信0。
設定修正後の検証プロセスだけが1回送信した。
実行済みmarkerで同じスクリプトの再実行を拒否する。

## 4. HTTP Result

- URL: https://www.shimamura.co.jp/update/common/new-item/
- status: 200
- Content-Type: `text/html; charset=UTF-8`
- decoded body bytes: 127022
- redirect: なし

## 5. Parser Version / Pre-Request State

`src/shimamura-listing.js` SHA-256（実行前後一致）:
`d46d8e00b80e92dbdd65a873d23c80981a63d5fbb9fa76b1e46ca8feb0a8bf4a`

事前listing/Source Healthテスト22 PASS。現行parserを変更せず実行。
registryとcollectorも開始時ハッシュと一致。SALE closureの挙動を変更していない。

## 6. Listing Identification

可視の製品ニュース一覧識別見出しを1件確認。
同一section内に見出しとカードが存在するという旧仮定を使わず、
現行の一覧識別・可視性・同一origin・数値記事IDによる抽出が成功した。

## 7. Candidate Discovery

| Metric | Count |
|---|---:|
| discovered links | 117 |
| same-origin numeric article links | 11 |
| structurally valid article candidates | 11 |
| rejected structural links | 106 |
| metadata-complete candidates | 11 |
| metadata-uncertain candidates | 0 |

## 8. Structural Filtering

ナビゲーション領域の86リンクを含む106リンクが記事候補から除外された。
候補11件はいずれも可視カードで、各カードに見出し・日付・カテゴリが1件ずつ。
非対象リンク、外部リンク、ナビゲーション、ページ送り等を候補として扱っていない。
これらの除外規則はsynthetic回帰テストでも確認した。

## 9. Metadata Validation

11件すべてでvisible title / date / category / article URLを取得。
URLは同一origin・許可パス・数値IDで、query/hashなし。
一覧カテゴリはguitar-bass 6、amp-effector 3、dtm-recording 2。
元見出しは処理中のメモリだけに保持した。

## 10. Candidate Pipeline

実際のcollector保存境界・NewsStore・自動公開判定をメモリSQLiteで実行。

- 候補保存: 11
- 重複: 0、内容によるreject: 0
- AUTO_PUBLISHABLE: 3
- PUBLISH_REVIEW: 8（label_required）
- ローカル公開判定の成功: 3。本番公開は0。

分類後カテゴリ: recording_audio 2、acoustic_guitar 1、electric_guitar_bass 4、
dtm_software 1、amps_effects 3。
必要な派生データのみ、git管理外のprivateなlocal bootstrap（mode 0600）へ保存。
このsnapshotの読み込み・本番投入は今回行っていない。

## 11. Recall-First

8件をPUBLISH_REVIEWとして残した。listing metadataだけでは独自labelを
確定できないものを無理に自動公開せず、記事本文の取得も行っていない。
原見出しは保存していないため、後続の人による確認は公式URLから行う。

## 12. Raw Data Retention

- raw HTML保存: NO
- original headline長期保存: NO
- article body取得: NO
- raw HTMLのfile/log/fixture/D1/archive保存: NO

HTMLは単一プロセスのメモリ内のみ。処理完了時に参照を破棄し、プロセス終了。
保存境界では一時titleを消去。保存対象は独自label・事実・URL・秘密鍵由来の
fingerprint・状態・件数に限定。秘密鍵はprivateなgit管理外ファイルのみ。
報告書に元見出しは転載していない。

## 13. Legal / Evidence Gate

既存evidenceGate PASS。robots hash一致、listingの許可判定を確認。
robots/policyを再取得していない。
DOCUMENTED SILENCE・explicitAutomationPermission=falseを維持。
内部policy approvalをpublisherの明示許可や法的保証とみなしていない。
Shimamura SALE collectionの承認は追加していない。

## 14. Source Health

ローカル検証結果: healthy / ok、failure_count=0。
last_successful_run_at=実行時刻、next_eligible_run_at=24時間後。
401/403/451/429・redirect・layout break・parser failureなし。
Production notificationなし。

## 15. Shimamura Readiness

- discoveryValid: true
- parserLiveValidated: true
- PHASE-1 READY: YES
- enabled / productionEnabled / localPilotEnabled: すべてfalse
- contentTypes: productのみ、saleCollection: none

本番インフラphaseへ進める。今すぐproduction collectionをONにはしていない。

## 16. Changes Applied

Live応答を受けたparser/collector/分類ロジック修正: **NONE**。

今回更新したもの:

- `scripts/final-validation.mjs`: 1 GET計測、同一応答のメモリ内再解析、実行済みmarker、メモリDB検証。
- `src/shimamura-evidence.js`: 成功証跡、件数、時刻、ハッシュ、discoveryValid。
- `test/news.test.js`: 未検証時の旧期待値を受入後へ更新。本番OFF、pilot OFF、SALE未承認を検証。
- LISTING-READINESS / README / PRODUCTION-OPERATIONS / Port NEWS-LEGAL-COMPLIANCE: 現在の判定を記録。
- 本報告書。旧phase記録は履歴として保持。

初回NEWS回帰は119 PASS / 1 FAIL。旧テストがdiscoveryValid=falseと
実行前の固定時刻を期待していたため。受入完了後の正しい期待値に更新し、
以下の全suiteで再確認した。製品ロジックの不具合ではない。

## 17. Tests

| Suite | PASS |
|---|---:|
| NEWS（listing含む） | 120 |
| Port | 885 |
| Shared | 226 |
| Sync | 394 |
| Pitch | 30 |
| Fretboard | 25 |
| Rhythm | 19 |
| Chord | 95 |
| **Total** | **1794** |

FAIL / skipped / cancelled: 0。全suiteは外部送信をOSで遮断して実行。
Node監視の外部通信試行logも0 bytes。syntax / git diff --check PASS。

## 18. Production Mutations

commit / push / News Worker deploy / Sync Worker deploy / Pages deploy /
Production D1 mutation / Cron作成 / Production notification: **すべてNO**。
Production接続も実行していない。既存の本番化用WIP設定を変更せず保持。
本番化用templateには将来用production mode・Cron定義があるが、今回適用していない。
正式version更新なし（Port 1.4.3 baseline / 1.5.0 WIP継続）。

最終Git: main = origin/main = `be28371f`、ahead/behind 0/0、staged 0。
既存WIP保持。tracked変更38ファイル、untracked 25エントリ
（新規の本報告書により開始時から1増加）。

## 19. Next Step

次phaseで本番化の実行指示を受けた後:

Production News D1 → News Worker → Cron → initial collection /
検証済みmetadata bootstrap → automatic publication → API → Port 1.5.0。

追加のfinal live GETは不要。通常collectionを開始する場合は
2026-10-01 08:39:30.960 JST以降の次回アクセス制限を維持する。
以前の自動継続はPAUSEDのまま。本報告により再開していない。

## YES / NO

| Check | Result |
|---|---|
| validation started after 2026-09-30 08:16:26 JST | YES |
| listing GET exactly once | YES |
| robots requested | NO |
| article pages requested | NO |
| images requested | NO |
| other publisher requests made | NO |
| HTTP success | YES |
| parser found valid candidates | YES |
| structural noise excluded | YES |
| required metadata available | YES |
| raw HTML persisted | NO |
| original headlines persisted | NO |
| evidence gate passed | YES |
| Source Health healthy | YES |
| Shimamura SALE approved by this validation | NO |
| second live GET performed | NO |
| Production D1 changed | NO |
| News Worker deployed | NO |
| Sync Worker deployed | NO |
| Pages deployed | NO |
| offline tests pass | YES |
| Shimamura is ready for production infrastructure | YES |
