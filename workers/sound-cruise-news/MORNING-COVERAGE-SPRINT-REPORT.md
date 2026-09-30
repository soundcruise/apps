# Cruise Port NEWS Morning Run + Coverage Gap Sprint Report

## Overall Verdict

**MORNING RUN HEALTHY — COVERAGE IMPROVED**

Cronと日次guardは正常。Sleepfreaksの403は個別に安全停止され、他6 sourceへ影響していません。Sale 0→1、Live/Event 1→2へ改善しました。Artistは1件のままで、国内Artistの不足は残ります。Source Health全件正常という判定ではありません。

## 1. Production Baseline

開始時実測：Port **1.8.0**、NEWS **0.6.1**、HEAD/main/origin/main **be5c1d77**、ahead/behind **0/0**。作業branchは `codex/news-blocked-source-recovery`。既存tracked変更2件、staged 0件、untracked 5件を保持。既存の作業用worktreeで実施しました。

## 2. 06:00 Scheduled Run

登録Cronは `0 21 * * *`。D1で確認したhandler基準時刻は **2026-10-01 06:01:12.288 JST**。7件のscheduled実績、JST day、全lease解除、collection終了後のhealth記録を確認しました。

**正確な完了秒は取得できませんでした。** 現行DBは開始基準時刻とsourceごとのdurationを保存しますが、終了時刻を保存しません。履歴telemetryのread-only照会はOAuth権限不足で403。**06:47:30.713 JSTの最初のsnapshot時点では完了済み**です。durationを絶対終了時刻へ読み替えていません。

## 3. Source-by-Source Morning Results

全sourceがscheduledで1回ずつ処理され、source単位のscheduled skipはありません。AUTO/REVIEWは**今回新しく保存された候補**の件数です。

| Source | Requests | Discovered | 新規AUTO | 新規REVIEW | REJECT | Duplicates | 新規公開 | Outcome / Health |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Shimamura | 2 | 11 | 0 | 0 | 0 | 2 | 0 | collected / healthy |
| Kikutani | 2 | 20 | 0 | 0 | 17 | 3 | 0 | collected / healthy |
| Sleepfreaks | 1 | 0 | 0 | 0 | 0 | 0 | 0 | http_403 / http_blocked |
| ZOOM | 2 | 12 | 0 | 0 | 9 | 3 | 0 | collected / healthy |
| amass limited tag | 2 | 21 | 0 | 0 | 20 | 1 | 0 | collected / healthy |
| Ikebe product listing | 2 | 16 | 0 | 0 | 1 | 15 | 0 | collected / healthy |
| IK Multimedia Press | 2 | 12 | 0 | 6 | 6 | 0 | 0 | collected / healthy |
| **合計** | **13** | **92** | **0** | **6** | **53** | **24** | **0** | 個別1 source停止 |

Shimamuraは旧日付9件をwatermarkで除外し、2件をduplicate判定。既存duplicate候補のAUTO/REVIEW分類を全件再構成できるログはありません。未計測の分類件数を0と断定していません。REJECTはrun内の除外件数であり、53行がrejectedとしてDBへ保存されたという意味ではありません。

## 4. Duplicate / Guard Verification

全7 sourceの `scheduled_jst_day = 2026-10-01`、`lease_until = 0`。同日の二重scheduled collection、予期しない再試行、guard/evidence bypass、データ破損は検出されませんでした。旧記事の再取得結果を新規公開として数えていません。

## 5. Source Health

6 sourceはhealthy。Sleepfreaksは**robots取得の403**で `disabled=1`、failure 1、`source_auto_disabled` alert。feed取得・再試行はありません。backoff表示は10月2日06:01:13.130 JSTですが、disabled解除なしでは再開しません。

collectionはこの失敗を反映したwarning。retentionはhealthy、Natalieはpausedのまま。成功6 sourceの次回scheduled eligibilityは10月2日06:00 JSTです。Sleepfreaksを無理に再開していません。

## 6. Morning Article Quality

朝の**新規公開0件**。IKの6件はREVIEW待ちで、未審査のまま公開していません。scheduled publication判定経路は終了まで到達しており、新規0件をpublication failureと扱っていません。

朝の可視31件はlegacy backfill 19件＋以前のautomatic collection 12件。Sleepfreaksの既存5件は停止により非表示になりましたが、削除されていません。独立labelによる評価はHIGH VALUE 6、USEFUL 20、LOW VALUE 5、NOISE 0。新規の質評価対象はありません。

## 7. Current Coverage Distribution

| Category | 朝snapshot | 今回終了時 |
|---|---:|---:|
| Acoustic guitar | 6 | 6 |
| Electric guitar / bass | 7 | 7 |
| Amps / effects | 8 | 8 |
| Recording / audio | 3 | 3 |
| DTM | 5 | 5 |
| Sale | 0 | **1** |
| Artist | 1 | **1** |
| Live / Event | 1 | **2** |
| **Total** | **31** | **33** |

公開日基準のfresh 24hは0→0、fresh 7dは12→13。日付を今日へ改変して増やしていません。

最終source分布：島村11、池部6、ZOOM3、キクタニ2、Discover chuya2、SONICWIRE2、IK2、Yamaha1、Hookup1、AHS1、amass1、APU1。過去に審査されたarchive表示と、現在の自動収集ONは別です。

## 8. Sale Strategy

安全な大型Sale自動surfaceは今回成立しませんでした。期限・値下げ利益・対象範囲が確定したmanufacturer告知を手動CLIで補完し、Sale 0を解消しました。小規模販促を件数目的で追加していません。

## 9. Ikebe Sale

[公式Saleカテゴリ](https://www.ikebe-gakki.com/blog/category/sale/)を再評価。確認候補は期限切れ、単店中古、ポイント、ライブショッピング等で、今回の大型Sale条件に合いません。**OFF維持**。PB product listingのauthorizationは流用していません。

## 10. Other Automatic Sale Sources

Sound Houseの既存robots timeout evidenceを再利用し、直接retryは0件。検索で見つかった秋セールも期限を確定できず採用しません。Steinbergの[公式キャンペーン](https://www.steinberg.net/promotion/)は終了済み。島村の単店販促とIkebeのクーポン施策も除外しました。

採用した[APU公式サイト](https://apu.software/)では複数製品の値下げを確認し、[メーカー公式サポート告知](https://www.kvraudio.com/forum/viewtopic.php?t=633574)で全有料製品25%値下げ・10月11日までを確認しました。自動収集はONにしていません。

## 11. Manual Sale Ingestion

**実装・本番投入済み。** CLIがstructured facts、公式URL、公開日、期間、機材/brand範囲、値下げ利益を受け付け、既存Sale classifierと検証を通します。coupon/points/shipping-only、single SKU、単店、期限切れ、利益不明、headline/body/HTML/imageフィールドは拒否します。

APUの終了時刻は **10月11日23:59:59.999 JST**。publisherの終了timezoneが未指定のため、翌日へ延ばさず保守的なJST日付で扱いました。公式home自体には期限記載がなく、上記の公式サポート告知を補助根拠として保持しています。

本番レコードを複製した時計検証で、期限ちょうどまで表示、1ms後にAPI・カテゴリ・edge cache・保存済みPort表示から非表示を確認。実本番の時計やレコードを変更して期限切れを演出していません。90-day physical retentionも維持しました。

## 12. Artist / Live Strategy

具体的なギターイベント・インタビューを優先し、event不明のgeneric Artist情報は今後AUTOではなくREVIEWへ送ります。既存の承認済みArtist1件は維持。汎用feedの大量追加はありません。

## 13. Ikebe Event

別scopeでmain-host公式blog/RSSを確認。EVENTとギタリストtagは高signalですが、RSSだけで日程・会場まで確定するとは限らず、自動収集はOFF維持。

[公式イベント情報](https://www.ikebe-gakki.com/blog/20261013-1101-tak-matsumoto/)から、松本孝弘の使用ギター・機材展示、10月13日〜11月1日、イケシブSHOWCASE（渋谷）、公開日9月28日を確認。手動Live1件を追加しました。本人の来場・出演は主張していません。Jimmy SAKURAIの過去イベント再掲を新規ライブとして追加していません。

## 14. Other Artist Sources

| Candidate | 評価 / 今回の判断 |
|---|---|
| amass追加tag | Brian May等は候補。tag-specific discovery/evidenceが未完成で追加OFF |
| AGM / Rittor | アコギInterview/Newsの高signal surfaceを確認。親hostのリンク歓迎と再利用制限も実読。AGMへの適用scope・robots・dated discoveryは未完成でOFF |
| Skream | 既存の汎用feedはギター根拠が不足。大量取得せずOFF |
| Artist / official event | 明確な未来イベント候補はあるが、公開日や個別surfaceの確認不足を埋めてから採用 |
| Yamaha Artist記事 | 既存robots403を尊重し、直接取得・採用なし |

AGMを「CONTACT分類だから明示permission必須」と再断定していません。[Rittorの実際の規定](https://www.rittor-music.co.jp/agreement/)と[AGMの公開surface](https://acousticguitarmagazine.jp/)を分けて評価しました。親hostのリンク歓迎をAGM自動取得の許可と読み替えていません。確認できていないscopeをONにしていません。

## 15. Manual Artist / Live Ingestion

**実装済み。** artist、公式URL、公開日、具体的event type/name/date/venue、`guitarist`等のrelevance reasonを保存。concert/recital/exhibition/guitar festival/interviewを扱い、interviewはArtist、他はLiveへ分類します。

独立factsからlabel生成。未知event、booleanだけのrelevance、generic label、元見出し等は拒否。実展示1件の登録・配信を確認し、Artistインタビュー経路は自動テストで確認しました。今回、新しい国内Artist記事の本番投入はありません。

## 16. Quality Regression Gate

保存済みの本番31件と候補33件を比較し、各CLI applyでも本番を読み直してgateを通しました。

| Metric | Current | Candidate |
|---|---:|---:|
| HIGH VALUE | 6 | **8** |
| USEFUL | 20 | 20 |
| LOW VALUE | 5 | 5 |
| NOISE | 0 | 0 |
| Generic labels | 5 | 5 |
| Useful categories | 6 | **7** |
| REVIEW burden | 22 | 22 |

Ticker top5は従来の具体的なFender/Jackson/Yamaha/Gretsch/Fender情報を維持し、先頭はHIGH VALUE。判定は独立labelに基づく補助指標で、記事品質の客観的な全量測定ではありません。

HIGH減少、useful category減少、NOISE/generic増加、Ticker先頭LOW/NOISE、review queue急増をrelease拒否条件として実装・テストしました。

## 17. Research Retention Guard

canonical URL、timestamp/status/hash/counts、平坦なallowlist facts、reason codesだけを保存。queryは原則削除し、必要なidentity parameterだけ明示許可。SNS/share URL、raw field、nested content、見出しを紛れ込ませたkeyを拒否します。

保存前のnormalized/near-copy比較で元見出し一致ならwrite fail。実調査でも展示名が元見出しに一致したwriteを拒否し、独立表記へ修正しました。その時点で失われた初回hash/厳密timestampは再構成せず、丸めた再構成時刻と欠測を記録。公開前の必要な再検証では正確なtimestamp/hashを取得しました。元見出しは比較時のメモリ内だけで使用し、artifactには保持していません。

## 18. Sources Newly Enabled

**自動収集source追加0。** 既存7 IDとCronは維持し、Sleepfreaksはdisabledのまま。

operator-onlyの別scope `manual-apu` / `manual-ikebe`を有効化。automatic authorizationは付与していません。停止・takedown・evidence expiryを守ります。

## 19. Production Article Changes

本番追加は2件：

- **APU Software、対象製品の期間限定値下げを10月11日まで実施。DTM製品などが対象**（Sale、公開日9月22日）。
- **松本孝弘、10月13日〜11月1日にイケシブSHOWCASE（渋谷）で使用ギター・機材展示**（Live、公開日9月28日）。

10月1日07:31:03.027 JSTまでにSale、07:31:04.526 JSTまでに展示のCLI登録完了を確認。原headline/body/imageは保存していません。既存可視31件のID、URL、公開日、カテゴリ、labelはすべて保持しました。D1保持行は66件（approved 38、pending 22、rejected 6）で、停止中のSleepfreaks 5件は可視33件に含めていません。

Saleは7日より古く、Ticker表示目的で公開日を変更していません。展示も既存高情報量のtop5を押し出していません。

## 20. Publisher Request Counts

| Surface | 朝scheduled | 今回の直接調査/再検証 |
|---|---:|---:|
| Shimamura | 2 | 0 |
| Kikutani | 2 | 0 |
| Sleepfreaks | 1（403含む） | 0 |
| ZOOM | 2 | 0 |
| amass | 2 | 0 |
| Ikebe PB product | 2 | 0 |
| IK Press | 2 | 0 |
| Ikebe main blog | 0 | 3（RSS1、イベント2） |
| APU | 0 | 3（robots1、home2） |
| Sound House | 0 | 0 |
| **直接計測合計** | **13** | **6** |

**直接計測19 requests**。2ページの再取得は公開前のmeta/X-Robots/canonical確認のためです。失敗attemptを除外していません。CLI投入、全tests、ブラウザQAからpublisherへの直接requestは0。

検索/openツールも利用しましたが、backendのpublisher wire/cache数は取得できません。上の19へ混ぜて総request数と断定していません。AGM termとKVR openのtool取得失敗も、この非計測区分に含まれます。

## 21. Tests

| Suite | PASS |
|---|---:|
| Port | 887 |
| Shared | 226 |
| Sync | 393 |
| Pitch | 30 |
| Fretboard | 25 |
| Rhythm | 19 |
| Chord | 95 |
| NEWS | 223 |
| **Total** | **1,898 / 1,898** |

baseline 1,855＋新規43。全suite確認済み。途中の旧version assertionを更新し、localhost listenのsandbox制限で止まったNEWS suiteはpublisher遮断を維持して再実行しました。最終fail/skip 0。syntax、diff check、secret scan PASS。新CLIのJST朝日付境界も実行で発見し修正・回帰確認済みです。countsの正規化済みキー名への見出し混入も拒否する追加testを通しました。

## 22. Production Smoke

**PASS：375 / 393 / 1440px。** Home ticker、News、Sale/Artist/Liveカテゴリ、具体的label、manual item、pagination、リンクのHTTPS・別タブ・noopener/noreferrerを確認。追加2件の公式URLはHTTP200・robots/opt-out/canonicalを確認済みです。

Practice、Calendar、Gear、Tuner、Metronome、My Apps、Settingsへの遷移と横幅を確認。NEWS停止/503をブラウザで注入して他機能が操作できることを確認しました。本番サービス自体を停止していません。操作によるユーザーデータ変更はありません。

公開asset7件はcommitと一致。Workerソース/secretの公開URLは404、public mutationは拒否。期限境界は本番レコードのローカル複製で検証し、実本番を未来時刻へ変更していません。NEWS上のpublisher画像は0、page error 0。

## 23. Git / Deploy

機能追加としてPort 1.9.0 / NEWS 0.7.0を公開後、保存ガードのキー比較を補強し、最終版は **Port 1.9.0 / NEWS 0.7.1**。実装commit **00185c7b**をnormal pushし、Pages本番buildは07:28:35 JST完了。Worker deployは07:27:57.606〜07:28:02.020 JST、Version ID **829b0eaa-2fbd-4feb-a2bc-7e3e1a48f793**。

保存ガードpatch commit **ac9d325c**もnormal pushし、NEWS 0.7.1を再deploy。最終Worker Version IDは **d650965e-b73d-467d-8abd-924a6f4c1e23**。再deploy時刻は 2026-10-01 07:52:59.446 JST〜2026-10-01 07:53:03.960 JST。途中のCloudflare 7403はwhoamiによるOAuth更新後に解消し、公開33件は0.7.0時点と完全一致しました。

報告・最終evidenceも別commitでnormal push。最終HEAD/main/origin/mainは報告commitへ一致させ、ahead/behind 0/0、staged 0。既存tracked 2件・untracked 5件は7/7 SHA-256一致で保持。作業用の一時node_modules symlinkだけ除去しました。禁止Git操作は使用していません。Cloud Sync/Account/AI Supportと他アプリのsourceには変更していません。

## 24. Remaining Gaps

国内Artistは1件のまま。自動Sale/Event sourceは未成立。Recordingも3件で薄め。既存LOW VALUE/generic 5件は今回増やさず、削除や別内容への書き換えはしていません。

Sleepfreaksの403を解消せずに再開しないこと、朝runの正確な終了秒・全duplicate分類ログが未取得であること、検索backend request数が不明であることを残課題として記録しました。

## 25. Recommended Next Step

国内ギタリスト/SSWの具体的インタビューを、AGMのscope/robots/日付付きsurfaceまたはArtist公式告知から1件ずつ審査し、今回のmanual経路で補完する。Ikebe Eventはmetadataで日程・venueまで確定する限定surfaceが成立してから自動化する。Saleはmanufacturer公式の明確な期限付きcampaignを継続選定する。

Sleepfreaksは403の原因とpublisher方針を確認してから再開判断。Cronの終了timestamp取得も次の監視改善候補です。新しい自動化・定期作業の予約は作成していません。

## YES / NO

| Check | Result |
|---|---|
| 06:00 Cron fired | **YES** |
| scheduled collection completed | **YES**（正確な終了秒は未取得） |
| every enabled source was considered | **YES**（7 source） |
| same source fetched twice in same JST day | **NO**（二重scheduled collectionなし。手動再検証は別集計） |
| unexpected publisher request burst | **NO**（計測したcollection/直接調査） |
| Source Health healthy | **NO**（6 healthy、Sleepfreaks 403、collection warning） |
| morning publication worked | **YES**（判定処理完了、新規公開0） |
| Sale coverage remains zero | **NO**（1件） |
| automatic Sale source added | **NO** |
| manual Sale ingestion implemented | **YES** |
| manual Sale stores original headline | **NO** |
| manual Sale expires automatically | **YES** |
| Artist coverage improved | **NO**（1件維持） |
| Live/Event coverage improved | **YES**（1→2） |
| manual Artist/Live ingestion implemented | **YES** |
| generic Artist label can auto-publish | **NO**（今後の新規候補） |
| public user can mutate NEWS | **NO** |
| quality regression gate implemented | **YES** |
| research original-headline guard implemented | **YES** |
| evidence gate preserved | **YES** |
| robots/access controls preserved | **YES** |
| raw HTML stored | **NO** |
| publisher images stored | **NO** |
| all tests pass | **YES**（1,898） |
| production smoke passes | **YES** |
| Git safety followed | **YES** |
