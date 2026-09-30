# Cruise Port NEWS 1.5.0 Production Completion Report

## Overall Verdict

**DEPLOYED — AUTOMATIC NEWS RUNNING** / Release Blocking **0**。
Port 1.5.0、本番News Worker 0.3.0、実ニュースAPI、収集・自動公開・hourly Cronが稼働。
候補11件：AUTO公開3件／REVIEW保留8件。今回のpublisher HTTP requestは島村一覧GET **1回だけ**。

## 1. Initial Baseline

2026-09-30開始実測：元checkout `codex/news-1-5-production-infra`、HEAD `fc57c02c`。
main = origin/main = `be28371f`、NEWS branch ahead 5 / behind 0。
tracked/staged差分なし。既知untracked `.claude/`、`workers/sound-cruise-sync/node_modules/`を保持。
Production Port 1.4.3 / local NEWS 1.5.0 / Worker 0.2.0、候補0、履歴0、API ON、収集・公開OFF、Cron []。

## 2. Release / Worktree Strategy

origin/mainからclean managed worktreeを作成し、`fc57c02c`までfast-forward。
release branch `codex/news-1-5-production-completion`で実装・検証後、同worktreeのmainへfast-forwardしてnormal push。
作業場所：`/Users/murakamimasakuni/.codex/worktrees/news-1-5-release/Cruise_apps`。
元checkoutはbranch/HEAD/内容とも変更せず保護。既存NEWS WIPのlogical commitsを保持し、squashしなかった。

## 3. One-Time 24h Override

初回立ち上げに限る自主ルールの例外をユーザーが明示承認。
理由 `initial_production_collection_2026_09_30`、audit ID `initial-production-collection-2026-09-30`。
CLIだけに実装し、2026-09-30 JST限定・固定audit PK・空DB・停止状態・exclusive local markerで一度だけ消費。
公開HTTP/Cronから呼べず、恒久flagなし。翌日以降も日付gateが拒否するため、audit保持期限後にも再利用不能。
robots/evidence/authorizationは変更しない。取得前healthのpausedはglobal_collection_offのみ、failure_count 0を要求した。

## 4. Initial Production Collection

実GET時刻：**2026-09-30 13:48:27.430 JST**。
HTTP 200 / 126,101 bytes / text/html。parser変更なし、hash `d46d8e00b80e92dbdd65a873d23c80981a63d5fbb9fa76b1e46ca8feb0a8bf4a`。
metadata完備11件。候補sink後、即収集OFFへ戻し、HTML・原見出しメモリを解放。

## 5. Publisher Request Count

| request | count |
|---|---:|
| Shimamura product listing GET | 1 |
| robots / article / image / feed / HEAD | 各0 |
| Sound House / Ikebe / other publisher | 各0 |
| 保存候補の公開・guard検証・API/Pages QAによるpublisher GET | 0 |

undici送信header計測でwireRequests 1、production collection_runs requests合計1、last attempt不変。
通常作業はpublisherを遮断。Wranglerのnpm更新確認とテストのCloudflare telemetryは遮断ログにあるが、publisherではなく送信成功もない。

## 6. Initial Candidates

候補11、AUTO_PUBLISHABLE 3、PUBLISH_REVIEW 8、REJECT 0、duplicate 0。
D1候補分類：acoustic_guitar 1 / electric_guitar_bass 4 / amps_effects 3 / recording_audio 2 / dtm_software 1。
全件source=島村楽器、日付あり、HMAC fingerprintあり。SALE/Artist 0。

## 7. Candidate Quality

許可された公式product-news欄と個別記事URL形のみ。navigation/画像/別一覧/セールURLは保存対象外。
AUTO3件は独立facts template：Fender FSR American Acoustasonic Telecaster、BOSS EX-4、VOX AC MINIの発表。
未知brand/product/eventの8件は審査待ち。暫定カテゴリを確定扱いせず、公開前に人の確認が必要。
URL/topic dedupe・tombstone・現行key fingerprint検証を維持し、不確実な関連記事は捨てずに保持。

## 8. Initial Automatic Publication

収集OFFのまま`completion.mjs publish-stored`で保存済みAUTO **3件**を公開。
REVIEW8件はpending維持。evidence/source/health/category/date/expiry/独自facts/key/tombstoneを再確認。
publisher再アクセス **0**。公開によってinterval stateは変わらない。

## 9. Production API

[Production API](https://sound-cruise-news.cruise-port-requests.workers.dev/v1/news)に実3件。
日付降順、一件ずつcursor paginationの重複なし、nextCursor終端、offset、カテゴリ、tickerを確認。
アコギ1 / アンプ・エフェクター2 / SALE0、tickerは現在の7日範囲2件。
同一問い合わせcache、revisionに伴うkill反映、Cache-Control:no-store、soundcruise.jp CORS、OPTIONS、拒否origin/不正queryを確認。
7/14日・90日・sale inclusive期限境界とcache expiryは合成テストPASS。本番にはSALEを作成していない。

## 10. 24h Minimum Interval Guard

migration 0008の`last_publisher_request_at`を試行基準に、request前にD1へ予約。
`next_at`はMAXで前進のみ。legal gateとatomic leaseの両方が確認し、500/timeout等でも24時間未満は再GETしない。
通常manual/実scheduled coreを本番D1＋拒否fetchで確認：backoff / fetch 0。
next_atを誤って0へ戻したケースもtimestamp guardが拒否。将来別sourceのstate/intervalは独立（テスト確認）。

## 11. Cron

収集 `0 * * * *` / retention `17 * * * *`。hourly起動とsourceの24h GET資格判定を分離。
[Cloudflare公式Cron仕様](https://developers.cloudflare.com/workers/configuration/cron-triggers/)のUTC・反映遅延を確認。
production D1でguard成立後に有効化。2026-09-30 **14:00:08.682 JST**の実scheduled handlerがhealthを更新。
その後もlast attempt/履歴requestsは初回のまま。Cron有効化直後のpublisher追加GET **0**。

## 12. Source Health

Shimamura healthy / ok / failure_count 0。collectionとretentionもhealthy / ok。
last successful publisher collectionは初回GET時刻。guard skipをHTTP異常や新規収集成功と混同しない。
structured operator alertsを維持し、publisher内容や秘密を格納しない。

## 13. Kill Switches

global collection stop：初回後OFF、本番D1 guard test後にもOFFを復元し、最後に明示ON。
API stop：温まったcacheでもlist/ticker 503、復元後3件。
source stop：本番source disabled時にlist/ticker 0件、元へ戻して3件。候補の削除なし。
item takedown：前phaseの本番reserved ID操作記録＋今回のcache/tombstone/復活防止テストPASS。
実ニュースを削除せず、最終controls/stateはすべて意図したON/有効状態。

## 14. Shimamura

承認範囲は`/update/common/new-item/`の製品ニュースだけ。内部的なdocumented_silence判断を維持。
記事側HTML/metaを取得・確認したとは扱わない。独立labelと直接source linksだけ。
**Shimamura SALEは未承認・無効**。

## 15. Sound House

disabled / legal_block / pending_evidence維持。fetch 0、公開0、authorization追加なし。

## 16. Ikebe

disabled / evidence_missing / SALE pending_evidence維持。fetch 0、公開0。

## 17. Static Fixture Final Strategy

本番NEWS_PROVIDER=api。23件fixtureは明示的なdev/test用途のみ。
API error/停止/不正応答で古いfixtureへ黙ってfallbackしない。NEWS表示をerror/unavailableへ、Home tickerは非表示。

## 18. Port 1.5.0 Integration

通常版・Pro版のversion/cache entryは1.5.0。専用News Worker APIが正本。
renderNewsSafelyの独立境界を維持し、API失敗でもHome・他toolsが動く。
他4アプリとShared/Sync source・version・Worker/DBは変更なし。

## 19. Mobile / Desktop QA

release worktreeと実本番を **375 / 393 / 1440px**で実レンダリング。
Home ticker、NEWS一覧の折返し、日付group、category select、横overflowなし、リンク属性、外部画像0を確認。
本番API実通信で3件一致。障害/停止はブラウザで503を注入し、error表示・古いfixture復活なし・Tuner/Metronome動作画面維持を確認。
別4アプリはStandard版の初期画面とpageerror 0を確認（既存Google FontsのみQAで空CSSにしpublisher通信を排除）。
保存済み利用者データを使わないfresh browser profileのsmokeであり、追加実機/マイク/音出しの総当たりは行っていない。

## 20. Tests

| suite | PASS |
|---|---:|
| NEWS | 130 |
| Port | 886 |
| Shared | 226 |
| Sync | 394 |
| Pitch | 30 |
| Fretboard | 25 |
| Rhythm | 19 |
| Chord | 95 |
| **Total** | **1,805** |

全8 suite / fail 0 / skip 0。baseline1799へguard5件＋production provider1件を追加。
Syncは既存と同じ`node --test`自動探索でhelper一件を含む394件。
構文、diff --check、stage明示、secret scan（code834 files／report追加後835 files・match0）もPASS。

## 21. Production Worker

News Worker **0.3.0** / compatibility_date 2026-09-30。
version ID `c6731b2b-cd0d-446d-8708-0790c11cb017`、deployment `58ae5ec9-1843-4464-9cdf-ece1affe05ff`。
collection=production、API=production、allowlist=[shimamura]、secret_text binding存在。
Sync Worker deploy **なし**。

## 22. D1

専用`NEWS_DB` = sound-cruise-news / `13267817-d259-4fde-80d3-37766f8f3f11`。
migrations 0001–0008適用済み。候補11（approved AUTO3 / pending REVIEW8）、collection_runs1（request1）。
source disabled/takedown=0、lease=0、failures=0。controls collection/publication/API=1。
Sync DBにはアクセス・migration・変更なし。

## 23. Git Commits

既存logical commits `dee21597` → `ae619cb0` → `73047555` → `c285d3ce` → `fc57c02c`を保持。
今回code：`90de7774`（attempt guard / one-shot CLI）、`45df0d99`（Port API / hourly config）。
最後にこの実測report・現行operationsの文書commitをmainへnormal push。scratch/squash/force pushなし。

## 24. Pages Deployment

[Pages build/deploy run](https://github.com/soundcruise/apps/actions/runs/36671696258)：code SHA `45df0d99`。
build / deploy / report-build-status各job success。Pages build APIは **built**、error=null、2026-09-30 14:04:31 JST。
run集約APIのみin_progressを返す時点があったが、build/deploy成功・built・公開asset/実画面を個別確認済み。
[Production Port](https://soundcruise.jp/apps/cruise-port/)：Ver 1.5.0 / NEWS_PROVIDER=api。
`workers/`とprivate secret file URLは404（_config.ymlのPages除外）。公開repoのsecret scanも0。
文書closeout push後も同じ公開code・API状態を最終確認する。

## 25. Production Smoke

Home/NEWS/ticker/category/sale空状態/source link/API実3件、Practice Menu/preset selector/Calendar/Tuner/Metronome/Gear/My Apps/Settings、他4Standard apps：PASS。
通常時page errors 0 / console errors 0 / 404等failed HTTP 0 / CORS・mixed content問題なし。
Home初回API1回、NEWSへ明示移動時1回。二重bootstrap取得なし。障害試験の503は意図した注入。

## 26. Publisher Data Retention

raw HTML / original headline / article body / external images：保存 **0**。
HTML・titleは同じCLI process内だけで解析し、永続sinkは独立facts label/URL/date/category/HMAC sketchのみ。
report/logにも原見出しなし。private secretsはignored .local・0600、Git/Pages/公開APIへ露出なし。
90-day API filteringと独立physical purgeを維持。初回例外のauditは通常のstructured operations record。

## 27. Next Eligible Collection

基準：**2026-09-30 13:48:27.430 JST**。
nextEligibleAt：**2026-10-01 13:48:27.430 JST**（1790830107430）。
通常Cronの最初の対象は2026-10-01 **14:00 JST**（24h後の次のhourly tick）。
それ以前のmanual/Cron/retryは0 publisher fetch。policy/robots/health異常ならeligibleでも停止。

## 28. Git Final State

release worktreeのmainとorigin/mainは、このreportを含むcloseout commitで一致、ahead/behind **0/0**。
tracked/staged差分なしをclosing push後に実測。code releaseは`45df0d99`。
元checkoutは`codex/news-1-5-production-infra` / `fc57c02c`のまま、tracked/staged clean（最終origin/main比 ahead 0 / behind 3）。
既知untracked `.claude/`、`workers/sound-cruise-sync/node_modules/`は元checkoutで保持。
release worktreeの検証用node_modules symlink2件は、検証完了後に作成したリンクだけを除去する。
最終commit SHAはCodex完了応答と`git rev-parse main origin/main`で確認できる。

## YES / NO

| check | result |
|---|---|
| one-time initial interval override used | YES |
| override remains permanently enabled | NO |
| initial Shimamura listing GET exactly once | YES |
| second Shimamura GET performed | NO |
| Sound House requested | NO |
| Ikebe requested | NO |
| other publisher requested | NO |
| candidates stored | YES |
| original headlines stored | NO |
| raw HTML stored | NO |
| AUTO candidates published from stored data | YES |
| REVIEW candidates auto-published | NO |
| automatic publication caused publisher request | NO |
| 24h source guard implemented | YES |
| failed publisher request also starts guard | YES |
| normal manual collection respects guard | YES |
| Cron respects guard | YES |
| source intervals are independent | YES |
| Cron enabled | YES |
| Cron immediately triggered Shimamura request | NO |
| collection enabled | YES |
| automatic publication enabled | YES |
| Source Health healthy | YES |
| Shimamura SALE enabled | NO |
| Sound House enabled | NO |
| Ikebe SALE enabled | NO |
| Production API returns real NEWS | YES |
| stale static fixture used as indefinite production fallback | NO |
| Port 1.5.0 deployed | YES |
| Sync Worker changed | NO |
| Sync Worker deployed | NO |
| all tests pass | YES |
| production smoke passes | YES |
| secrets exposed | NO |
| Git safety followed | YES |
| automatic NEWS is running safely | YES |
