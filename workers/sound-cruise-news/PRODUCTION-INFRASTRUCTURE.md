# NEWS 1.5.0 Production Infrastructure Report

## Overall Verdict

**READY FOR INITIAL PRODUCTION COLLECTION**

News専用D1・Worker・APIの本番基盤を構築し、smoke PASS。
収集・自動公開・CronはOFF。publisher request 0、候補0、収集履歴0。
Port Pagesは1.4.3のまま。

## 1. Git Baseline

開始: main = origin/main = `be28371fbb40a689c6208c0920e25cb4e0f6567e`。
ahead/behind 0/0、staged 0。tracked変更38、untracked 25エントリ。
diff/stat/statusと既存WIPファイルのハッシュを保存し、WIPを保持した。
Production Port 1.4.3 / NEWS Port 1.5.0 WIP / News Worker 0.2.0。

## 2. Recovery / Commit Strategy

mainからローカルの`codex/news-1-5-production-infra`へ移動。
61ファイルの既存WIPを明示stagingして`dee21597`へ保存。
SALE・パーサー・フロントを無理に分割せず、元の状態を一括で復元可能にした。
本番基盤は`ae619cb0`、CLIの結果読み取り修正は`73047555`・`c285d3ce`。
Worker deploy時点のexact sourceは`c285d3ce`に保存済み。
本報告・運用文書は別のローカルdocs commitとして保存。
mainへのpush、feature branchへのpush、Pages deployは実施していない。

## 3. Shimamura Final Validation State

2026-09-30 08:39:30.960 JST、GET 1 / HTTP 200 / 127022 bytes。
パーサー無変更で117リンクから11件抽出、必要metadata全件取得。
AUTO適合3 / REVIEW8、検証時Source Health healthy。
原HTML・原見出しの保存なし。今回の再取得は0。
FINAL-LIVE-VALIDATION.mdを確認し、dumpやsecretを含めていない。

## 4. Production News D1

- name: `sound-cruise-news`
- id: `13267817-d259-4fde-80d3-37766f8f3f11`
- account: `a9f2a3e9fcb6d0f68fd2eaa9df909e33`
- environment: production / APAC
- binding: `NEWS_DB`

開始時に既存DBを確認し、同名なしのため新規作成。
Sync DB `e37759f8-df08-4d2a-92b0-ffdd50de66df`と異なることを確認。
Sync DBへのSQLやmutationは行っていない。

## 5. Migrations

0001_news / 0002_safety / 0003_keyed_fingerprint / 0004_listing_watermark /
0005_decision_health / 0006_automatic_publication / 0007_sale_visibilityを順に適用。
空DBからのmigration chainはローカル実D1テストでもPASS。
本番d1_migrationsで7本すべてを確認。sale_ends_at列を確認。
indexes、unique topic、review/decision/controlのCHECK制約、履歴・takedown・
Source Healthのschemaを事前確認。アプリ独自triggerなし。
SQLite integrity_checkはD1で許可されないため使用せず、schema・migration状態と
実APIのD1アクセスで検証した。

## 6. Production Worker

- name: `sound-cruise-news`
- API: https://sound-cruise-news.cruise-port-requests.workers.dev
- version: `91b4207b-a150-4e37-a414-52e8f0c226b4`
- deployment: `99d600a3-8e21-48e8-a1da-5a3688feb8ca`
- deployed: 2026-09-30 09:03:36 JST
- code version: 0.2.0 / compatibility_date: 2026-09-30

同名Worker不存在をdeployment照会で確認後、新規deploy。
dry-run PASS、Logs/Traces有効。既存Sync Workerは変更・deployしていない。

## 7. Bindings / Secrets

本番settingsをread-only APIで確認。
NEWS_DBは上記News専用ID、NEWS_HEADLINE_PEPPERはsecret_textとして設定。
Fingerprint secret configured: **YES**。値はsource・frontend・SQL・D1・報告に未記載。
既存のprivate local keyをprotected file経由でdeploy時に設定した。

## 8. Collection State

**global collection OFF**。
NEWS_COLLECTION_MODE=off、D1 collection_enabled=0。
manual HTTP collection routeは存在せず404/405。
scheduled handlerはenv hard OFFならD1の誤ったON状態でもfetchへ到達しない。
外部通信遮断テストでpublisher fetch callback 0を確認。

## 9. Automatic Publication State

**OFF**。D1 publication_enabled=0。
自動公開判定はOFF controlsで更新0、scheduled経路もhard OFFで停止。
候補のbootstrap・initial collection・automatic publicationは未実行。

## 10. Cron

**NONE**。本番configは明示的`crons: []`。
本番Cloudflare schedules APIで`schedules: []`を確認。
過去のWIP configにあった将来用Cronは除去してからdeployした。

## 11. Shimamura Production State

product source: PHASE-1 READY。
readiness/evidenceのauthorityを維持し、NEWS_SOURCE_IDSはshimamuraだけ。
runtime source自体はenabled、global/env collection OFFで取得不能。
source_state.next_at=1790811570960、last_discovery_at=0、lease_until=0。
validation-derived robots hashとアクセス間隔のみ登録し、収集成功を偽装していない。
SALEはnone / 未承認。

## 12. Sound House / Ikebe

Sound House: disabled、legalStatus UNKNOWN、legal_block、SALE pending_evidence。
Ikebe: disabled、evidence_missing、SALE pending_evidence。
両方とも今回fetch 0、公開/collectionの対象外。

## 13. Production API

API ON、空DBでcontractVersion=1 / items=[] / nextOffset=null / nextCursor=null、200。
一覧・ticker・category・offset/cursorページ送りをsmoke。
不正category/cursor/limitは400。categoryのSQL条件・cache分離は非空synthetic
データでもoffline検証。SALE表示期限・cache期限は既存SALE suiteで確認。

## 14. CORS

許可Originはhttps://soundcruise.jp。GET/OPTIONS。
悪意のあるOriginとlocalhostは403。`*`は使用しない。
Originなしの通常HTTPアクセスは可。CORSはブラウザ制約でありadmin認証として使わない。

## 15. Kill Switches

cacheが存在する状態でAPI OFF→503/disabled、復帰後200を確認。
kill stateをcacheより先に読む。collection-off / publish-off / source-disable /
source-delete / item-deleteを空のNews専用DBで確認。
最後はAPI ON、collection/publication OFFへ戻した。
sourceは再enable後もnext_atを保持し、readiness-onlyのpaused状態へ復元した。

## 16. Source Health

Shimamura: paused / global_collection_off / failure_count=0。
last_successful_run_at=NULL。READY but not yet collectedを表す。
next_eligible_run_at=1790811570960。collection全体もpaused。
validation時healthyと本番未収集状態を区別している。
状態・alert schemaはproduction D1で動作。notification送信なし。

## 17. Operator CLI

Wrangler OAuthでNews専用D1へstatus/control操作可能。
Public admin UI/endpointやブラウザcredentialは作成していない。
監査7件、予約QA IDのtakedown 1件を保存。実ニュースの削除なし。
初回CLI実機確認で、--fileの進捗表示とbulk import統計を通常query結果として
読み取る問題を検出。--command --jsonへ修正し、結果読み取りの回帰テストも追加。
本番status・controls・source操作・takedown・audit確認は最終PASS。

## 18. Port 1.5.0 Integration Readiness

endpointは上記本番API。offline API transport・ticker・カテゴリ・SALE・cursor・
エラー隔離が準備済み。375/393pxの実ブラウザで表示・横はみ出しなし、
API停止と通信失敗のメッセージ、Homeへ戻る操作を確認。
page errors 0、publisher requests 0。Pages未deploy。
本番app-version.jsをGETし、1.4.3継続を確認。

## 19. Static Fixture Strategy

1.4.3の23件fixtureは維持し、D1へコピーしていない。
1.5.0 WIPのNEWS_PROVIDERはfixtureのまま。別のPages公開phaseでAPI内容の
受入後にapiへ切り替える。APIモードの障害・kill時はNEWSのみメッセージを表示し、
古いfixtureへ戻さない。永続client cacheなし。fixtureは明示的dev用途として残す。

## 20. Tests

| Suite | PASS |
|---|---:|
| NEWS | 125 |
| Port | 885 |
| Shared | 226 |
| Sync | 394 |
| Pitch | 30 |
| Fretboard | 25 |
| Rhythm | 19 |
| Chord | 95 |
| **Total** | **1799** |

8suiteを外部通信遮断下で実行。NEWSは最後のCLI修正後にも再実行。
FAIL/skipped/cancelled 0。さらにoffline実ブラウザAPI acceptance PASS。
syntax / secret scan / diff --check / deploy dry-run PASS。

## 21. Production Smoke

health、空一覧/ticker/category/pagination、CORS、kill/cache、schema、D1 binding、
secret存在、Cronなし、Source Health、operator audit/takedown、収集履歴0を確認。
Worker tailでAPIの4 invocationがすべてok、exceptions 0、scheduled 0。
署名済み秘密値の表示なし。smoke後のcontrolsは0/0/1。

## 22. Publisher Requests

Shimamura 0 / Sound House 0 / Ikebe 0 / other publisher 0。
CLI側はCloudflare操作・自分のAPI/siteのみのnetwork allowlistで監視。
CloudflareのR2 SQL uploadとtail endpointが一度制限に引っ掛かり、
Cloudflare管理通信としてallowlistを補正した。publisherへの試行は0。
Worker側はhard OFF/no Cron、fetch callback 0のテスト、API-only経路、
本番collection_runs=0とtail結果で無収集を確認。remoteの全subrequestを
独立にpacket captureしたという主張ではない。

## 23. Production Mutations

News D1作成/migration/readiness/control/smoke audit/takedown: YES。
News Worker deploy/secret設定: YES。
Sync Worker/Sync D1/Pages変更・deploy: NO。
publisher collection / automatic publication / production Cron enable: NO。
Static fixture・validation候補の本番投入: NO。

## 24. Git State

local branch: codex/news-1-5-production-infra。
main = origin/main = be28371f、main ahead/behind 0/0。
local feature branchには上記4 commitと本報告のdocs commit。
staged 0、trackedの未コミット変更0。既知untrackedの.claude/とSync node_modules
のみ保持。remote pushなし。禁止Gitコマンドは使用していない。
Workerのexact deployed sourceはc285d3ceで復元可能。
正式Port versionは1.4.3、未公開Port WIP 1.5.0を継続。

## 25. Next Safe Collection Time

**NEXT SAFE COLLECTION TIME: 2026-10-01 08:39:30.960 JST**。
final validationの正確なtimestamp + 24h。Production next_atにも記録。
実行予約ではなく、次phaseで許可される最も早い時刻。

## 26. Remaining Steps

1. safe collection timeまで待つ。
2. 別phaseでhard-off configを変更し、Shimamura initial production collectionを1回実施。
3. 候補を確認。
4. 保存済み候補を使うautomatic publicationを有効化。
5. その後Cronを有効化。
6. 内容を含むAPI production validation。
7. Portのproviderをapiへ変更し、1.5.0 Pages release。
8. production smoke。

今回の基盤phaseに残るBLOCKER/HIGHは0。

## YES / NO

| Check | Result |
|---|---|
| production News D1 created | YES |
| all News migrations applied | YES |
| News Worker deployed | YES |
| News Worker D1 binding correct | YES |
| fingerprint secret configured | YES |
| global collection enabled | NO |
| automatic publication enabled | NO |
| production Cron enabled | NO |
| Worker deployment caused publisher request | NO |
| Shimamura product source production-ready | YES |
| Shimamura SALE enabled | NO |
| Sound House enabled | NO |
| Ikebe SALE enabled | NO |
| production API operational | YES |
| CORS restricted | YES |
| API kill switch works | YES |
| collection kill switch works | YES |
| Source Health operational | YES |
| existing Sync Worker changed | NO |
| existing Sync Worker deployed | NO |
| Port Pages 1.5.0 deployed | NO |
| publisher requests made | NO |
| offline tests pass | YES |
| production smoke passes | YES |
| ready for initial production collection | YES |

## CLI documentation verified

Installed Wrangler 4.131.1 help/schema and official documentation only:
[D1 migrations](https://developers.cloudflare.com/workers/wrangler/commands/d1/),
[secret file deployment](https://developers.cloudflare.com/workers/configuration/secrets/),
[explicit empty Cron array](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
