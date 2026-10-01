# Cruise Port NEWS Core Quality Repair Report

## Overall Verdict

**QUALITY IMPROVED — MORE WORK NEEDED**

指定修正を本番公開しました。可視NEWSは33→37件、REVIEWは22→12件。Sleepfreaksの既存5件を復元し、収集停止は保持しました。既存Ikebe候補の識別facts欠落は、publisherへの再取得なしでは回復できず残っています。

## 1. Baseline

2026-10-01 08:36 JST実測：Port 1.9.0、NEWS 0.7.1。作業worktreeは `codex/news-blocked-source-recovery`、HEAD=main=origin/main=`931683b7`、ahead/behind 0/0、staged 0。既存tracked変更2ファイル・untracked 5ファイルを保持。元checkoutは `fc57c02c`、0 ahead/17 behindだったため既存worktreeを使用しました。

D1は66件：approved 38、pending 22、rejected 6。可視33件、pendingはIkebe 12・IK 10。

## 2. REVIEW Cleanup

PRESTEPで重複5件・古い低価値4件を正式reject：22→13件。Sleepfreaks復元後、既に公開されたSINPHONICAと重なるIK候補をさらに1件reject：**最終12件（45.5%減）**。

既存 `operatorDecision` / `reviewCandidate` 経由で処理し、review-reject auditを記録。候補を削除せず、通常の90日retentionを保持しました。APUを含む追加reject auditは11件です。

## 3. APU Sale Decision

**REJECT／非公開。Saleは0件。** 保存済み根拠では補助投稿者の公式identityを確立できず、対象も「DTM製品」のみで具体的な製品価値を確認できませんでした。件数維持を理由に残していません。manual Sale workflowは維持。

## 4. Event Expiration

endDate、なければeventDateの **23:59:59.999 JSTまで表示**。翌日00:00からAPI・一覧・カテゴリ・tickerで非表示。interviewは公開日ベースのretentionを維持。

実際の松本孝弘レコードは11/1終了まで表示、11/2から非表示となることをshadow D1とPortで確認。pagination前に除外し、cacheも期限で失効。D1即時削除・公開日変更はありません。

## 5. Ticker Vocabulary / Ranking

Port・Worker・quality gateで `news-quality.js` を共有。展示、公演、ライブ、ツアー、セール、値下げ、具体的な新製品・録音/DTM関連語彙を統一し、utility＋freshnessで順位を決定。

本番top5：松本孝弘の展示 → JAM Pedals Wahcko mk.2 → Fender American Acoustasonic限定モデル → ESP PA-MF-10 → Jackson PC1-E。Artist/Eventは1件で、偏重していません。

Sale labelは検証済みpercentOff・allowlist内のbrand/equipmentを反映可能。誇張表現は追加していません。

## 6. Regression Gate

24h/7d fresh useful、expired event、可視重複、ticker top5全体、fresh HIGH omission、全体/source別の大量消失、REVIEW急増を検出。automatic stopによる大量消失には運用alertも追加。

本番gateはPASS、可視重複0、expired event 0、ticker omission 0。fresh usefulは **24h 0件／7d 11件**。新鮮な記事の件数を捏造していません。

判定baselineには、今回明示的に許可された「既存approved 5件の復元／audit付きAPU 1件の除外」を個別に記録。一般的な回帰例外にはしていません。

## 7. Ikebe Facts Extraction

対象listingに明示されたbrand・隣接model・製品種別・event/dateから独自factual labelを生成。guitar・amp・effects・accessoryの代表4ケースでAUTOまで確認しました。

未知model、無関係な数字、planned release、用途不明はREVIEW。brandやmodelの欠落を辞書で補っていません。N2 safeguardsを維持。

## 8. Ikebe Pending Replay

残った9件を保存済みfactsだけで判定。**昇格0件：8件は識別facts未保存、1件はKTT-01の用途未確認。** 過去のresearch evidenceにも不足factsを復元する情報はありませんでした。

元の見出しはHMACしか保持しないため再構成できません。推測で埋めず、operator reject済みレコードも復活させていません。既存候補の実データ回復は残課題です。

## 9. IK Duplicate Root Cause

保存段階がURL hashをidentityとし、異なるitem_idの同一factsを照合していませんでした。公開時だけの重複判定では、REVIEW候補が残ります。

D1でTONEX Boardの19751/19753、SINPHONICAの19724/19725について、同一brand/model・公開日と異なるURLを確認。これが確認できた実装上の原因です。locale交渉そのものの挙動は未証明であり、原因と断定していません。

## 10. IK Dedupe Fix

保存前にcanonical identityと、同source・検証済みbrand/model/category/version/event family/JST日付を照合。leaseと原子的insert条件も保持。

異なる製品・日付・version、unversioned update、内容不明の追加パックを保持。日本語の追加パックと古い `label_required` factsにも誤判定防止を追加しました。確認可能な同一topicの重複保存は回帰テストで防止。

## 11. Collection Stop vs Publication Block

`disabled`を収集停止、`publication_blocked`を公開停止として分離。timeout、403、5xx、layout/robots変化等では既存approvedを維持。

takedown・明示的publication kill・item killは引き続き非表示。新しいcollection-only operator操作は公開APIも止めません。従来の `source-disable` は明示的な完全killとして保持。

## 12. Sleepfreaks Migration

加算migration `0010_core_quality.sql` をNEWS専用D1へ適用。既存66件・既存fieldを照合し、破損や欠落なし。takedown済みsourceは公開停止を維持。

Sleepfreaksのdisabled、backoff、取得時刻は変更せず、publication_blocked=0として既存approvedの可視性を回復。

## 13. Sleepfreaks Visible Articles

**5/5件復元**：VocAlign 7、NOVA、LUNA 3、SINPHONICA、LAVA STUDIO。新規取得・新規manual追加はありません。

## 14. Sleepfreaks Collection State

**収集停止=true／公開停止=false。** 最終publisher取得時刻・collection run件数は開始時から不変。403原因は **UNKNOWN / likely infrastructure** として保持。

将来のacceptanceではproduction Worker networkからの最小robots確認を検討する運用条件を記録しました。今回は実行していません。

## 15. Tests

| Suite | PASS |
|---|---:|
| Port | 887 |
| Shared | 226 |
| Sync | 393 |
| Pitch | 30 |
| Fretboard | 25 |
| Rhythm | 19 |
| Chord | 95 |
| NEWS | 257 |
| **合計** | **1,932** |

新規34件、FAIL 0。localhost D1を含む全suiteを確認。初回のsandbox待受制限は許可されたローカル実行で解消。最後のNEWS guard修正後はNEWS全257件を再実行しました。

syntax、git diff --check、secret scanもPASS。最終source scanは877ファイル・検出0件。publisher通信禁止guardでテストしました。

## 16. D1 Migration

NEWS専用DB `13267817-d259-4fde-80d3-37766f8f3f11` のみ。Cloud Sync DBは未操作。event deadline・publication block・dedupe関連field/indexを加算し、90日retention guardは維持。

shadow確認後、既存Wrangler migration経路で適用しました（[Cloudflare D1 migration仕様](https://developers.cloudflare.com/d1/reference/migrations/)）。

## 17. Worker Deploy

NEWS 0.8.0を段階適用後、最終guard修正をpatch **0.8.1** として公開。

最終Worker version ID：`7cd66ffb-bbec-40f6-aee0-1cad83d92090`。7 sourceの設定、06:00 JST collection Cron、hourly retention、global controlsを維持。

## 18. Production Article / Queue Counts

**可視37件、D1 66件＝approved 37／pending 12／rejected 17。** pending：Ikebe 9、IK 3。

カテゴリ：アコギ6、ギター・ベース7、アンプ・エフェクター9、録音3、DTM9、Artist1、Live2、Sale0、その他0。

共通語彙での品質判定：HIGH 25、USEFUL 8、LOW 4、NOISE 0。語彙変更後の機械判定であり、新記事を25件追加したという意味ではありません。

## 19. Production Smoke

**PASS。** 本番Portを375/393/1440pxで実レンダリング。Sleep復元、ticker、展示、Sale空カテゴリ、category count、offset/cursor pagination、リンク安全性、横はみ出しなしを確認。

API停止/503時はNEWSを出さず、他ツールを操作可能。練習メニュー・音楽カレンダー・チューナー・メトロノーム・機材・My Apps・設定の7経路を確認。通常版/Pro版を含む更新asset 8件が本番と一致。NEWS内publisher画像0、page error 0。

期限の将来時刻は本番レコードを複製したshadow検証で確認し、productionの時刻やデータは変更していません。

## 20. Git / Deploy

Portはユーザーが気づく順位/期限挙動の改善としてminor **1.10.0**。NEWSは分離/schema改善で0.8.0、最終安全guard修正で0.8.1。

実装commit：`e5f13bd2`、最終guard commit：`e08e7141`。通常push・Pages deploy完了、本番確認済み。完了レポートと証跡も別途commit。

最終作業worktreeはHEAD=main=origin/main、ahead/behind **0/0**、staged **0**。開始時のtracked 2・untracked 5を内容hash不変で保持。元checkoutの未追跡 `.claude/`、Sync node_modulesも保持。git add .、reset --hard、clean、stash、force pushは使用していません。

## 21. Remaining Gaps

- Ikebeの8件の識別facts欠落と1件の用途未確認。新parserを保存済みデータだけに当てても回復できません。
- IKの残り3件は追加内容または識別facts不足で確認が必要。localeの具体的な配信挙動も未確認。
- fresh useful 24hは0件、既存LOW 4件。今回の回復だけで「毎朝見る価値」を完成したとは判定しません。
- Sleepfreaksの403原因・collection再開条件は未解決。安全に停止を維持。

**新規BLOCKER/HIGHなし、Release Blocking 0。**

## 22. Recommended Next Step

source拡大に進む前に、既存Ikebe候補のfacts回復を、人による確認または別途許可された最小のlisting再確認で完了することを推奨します。Sleepfreaksは別taskでWorker networkとterminalの限定robots確認を比較。今回はpublisher requests **0**で終了しました。

## YES / NO

| 確認 | 結果 |
|---|---|
| duplicate/stale REVIEW rows closed | YES |
| useful Ikebe items remain unnecessarily REVIEW | YES* |
| REVIEW burden materially reduced | YES |
| APU Sale remains published only to keep Sale nonzero | NO |
| expired event remains visible after end date | NO |
| fresh HIGH VALUE event can appear in ticker | YES |
| ticker and quality use shared vocabulary | YES |
| regression gate includes freshness | YES |
| regression gate detects mass visibility loss | YES |
| Ikebe facts extraction improved | YES |
| Ikebe normal product news can auto-publish safely | YES |
| IK duplicate root cause identified | YES* |
| IK duplicate storage prevented | YES* |
| temporary collection failure hides old approved articles | NO |
| collection stop separated from publication block | YES |
| Sleepfreaks existing approved items visible | YES |
| Sleepfreaks publisher collection resumed | NO |
| takedown still hides content | YES |
| explicit publication block still hides content | YES |
| new source enabled | NO |
| publisher requests made | NO |
| evidence gate weakened | NO |
| raw HTML stored | NO |
| original publisher headline stored | NO |
| publisher images stored | NO |
| all tests pass | YES |
| production smoke passes | YES |
| Git safety followed | YES |

*Ikebe：監査で有用候補とされた既存データの欠落が残るため、完了扱いにしていません。現在の証拠で安全な昇格はできず、個別の有用性も未再確認です。IK：保存段階のidentity不足は確認済みですがlocale挙動は未証明。重複防止は確認可能なcanonical/同日・同一factsに限定し、不明なpackを勝手に統合していません。
