# Cruise Port NEWS High-Value Coverage Expansion Report

## Overall Verdict

**COVERAGE MATERIALLY IMPROVED**

公開42→48件。国内Artist、Live/Event、Recordingの供給経路を改善し、本番反映・品質確認まで完了しました。Release Blocking：0。

## 1. Baseline

2026-10-01 10:54 JST実測。Port 1.10.0／NEWS 0.8.2。開始HEAD＝main＝origin/main：`45ae702e8a2b510a1216991baf76eedcfe1016a7`。branch：`codex/news-blocked-source-recovery`。ahead/behind 0/0、staged 0。既存tracked変更2・untracked 5を保持したworktreeで継続しました。

D1：66行、approved 42／pending 6／rejected 18、visible 42。

## 2. Remaining REVIEW Resolution

既存6件は、公開2・却下1・REVIEW維持3に整理。その後、新規Eventの未確認1件が加わり、最終REVIEWは4件です。判定不能なものを推測で公開していません。

## 3. Ikebe Remaining Candidates

- **KORG TM-1：公開。** 公式記事でチューナー／メトロノーム、ギター練習との関係、新登場の文脈を確認。
- **KIKUTANI KTT-01：却下。** 吹奏楽向け練習機能を確認。Recording機材としての分類と、今回必要なギター関連性を裏付けられず、対象外としました。
- **Nu:Tekt NuTube OD-KIT CUSTOM CRAFT BD-S：REVIEW維持。** 製品・組立キットの識別はできましたが、発売ニュースの文脈を確定できませんでした。

各保存済みURLを1回だけ確認。公開日・保存期限は変更していません。

## 4. IK Remaining Candidates

- **item_id=19651：公開。** TONEXのハードウェア／音色パックではなく、ソフトウェア2.0の主要更新と確認。DTMとして独自labelを作成。
- **item_id=19790／19650：REVIEW維持。** 保存URLはHTTP 200でしたが、個別記事本文ではなく一般ニュース一覧が返りました。別言語・別クエリへの再取得は行っていません。

各1 GET、日付・保存期限を保持しました。

## 5. Domestic Artist / Live Strategy

AGMの国内アコギ・インタビューと、Ikebeのギターイベントに限定。人物・具体的な出来事・関連性が確認できる情報を採用し、不足factsはoperator REVIEWへ送ります。

## 6. AGM / Rittor

[公式Interview RSS](https://acousticguitarmagazine.jp/interview/feed/)から大石昌良・竹内アンナの2件を公開しました。

直近60日：discovered 4、relevant/useful 2（50%）、AUTO 2（50%）、REVIEW 0、REJECT 2（50%）。60日より古い6件はpilot対象外。アコギ表現のインタビューと分かる独自labelを使用しています。

Rittor親サイトの「リンク歓迎」を自動収集許可として扱わず、親規約の適用範囲、AGM所有関係、RSS、robotsを別々に評価しました。許諾を取得したという扱いにはしていません。

## 7. Ikebe Event

[公式Event一覧](https://www.ikebe-gakki.com/blog/category/event/)をPB製品listingとは別scopeで評価。

4件中、新規で有用性を確認1件、未確認のギターワークショップ1件、既存掲載済み松本孝弘の展示1件、対象外のアンプ体験1件。relevant 3/4、有用性確認済み2/4（既存掲載を含む）。一覧parserではAUTO 0・初期REVIEW 2。既存展示は追加公開せず保持しました。

[阿部学の公式記事](https://www.ikebe-gakki.com/blog/20261024-eg-workshop/)を1回確認し、10月24日・イケシブ・ギターワークショップのfactsをoperator承認で公開。年をURLから推測していません。

## 8. amass / Artist Official Sources

amassの限定tagを維持。generic feedへの拡大なし。Artist個別crawlerは追加せず、Skream／Natalieも再開していません。

## 9. Artist / Live Production Changes

AGM Interview RSSとIkebe Event固定一覧を本番allowlistへ追加。1日1回の限定discovery、未確認factsのREVIEW、イベント終了時の非表示を実装しました。店舗タグだけでは会場を確定せず、見出しで明示されない会場はREVIEWに保つguardも追加しました。

Artist：1→3件。Live：2→3件。原見出し・本文・画像を公開labelへ転用していません。

## 10. Recording Coverage

Recording：3→4件。[公式代理店のHarrison FLEX 10告知](https://atdistribution.net/information/1047/)を追加しました。オーディオインターフェース／マイクプリの実データを確認し、「発表」と表記。発売予定を実発売と断定せず、公開日8月19日を保持しました。

AT Distribution固定一覧を本番化。直近60日7件中、relevant/useful/AUTO 1（14.3%）、REVIEW 0、REJECT 6（85.7%）。取得総数12件のうち古い5件は対象外。1つの固定ページで有用なRecording告知を得られることを採用理由としました。

## 11. Recording Sources Evaluated

ZOOM：既存3件を維持。最新記事の開発話・重複・小規模更新を新規供給に数えませんでした。

Hookup：公式RSSとApollo記事を確認。チュートリアル、セミナー、既存記事重複を除外し、今回は自動化しませんでした。

Audio-Technica／TASCAM：既存evidenceと検索discoveryを確認しましたが、今回の条件を満たす新しい公式candidateを確保できず、directアクセス・enableとも0。IKは既存稼働経路を利用しました。

## 12. Sale Coverage

Sale：0→0件。明確な対象・割引・期限が揃う高価値Saleは確定できませんでした。0件を避けるための低価値掲載はありません。

## 13. Sale Sources Evaluated

Hookup Apolloは複数機種対象の無償プラグイン特典でした。価格割引ではないため不採用。

Sound Houseは、既存調査にない具体的なUJAMセールURLを検索で発見。その新surface evidenceを理由にrobotsを1回だけ確認しましたが、15秒でタイムアウト。記事GET 0、retry 0、OFF維持です。検索snippetは公開根拠に使用していません。

## 14. Manual Sale Use

追加0件。既存operator workflow・Sale品質条件を保持。以前却下されたAPU Saleも復活させていません。

## 15. Newly Enabled Sources

`agm`、`ikebe-event`、`at-distribution`。

各sourceをEvidence／Technical／Quality／Actual User Valueで評価。公式surfaceの実測parser検証と本番公開を確認しました。Technical確認はMacからの実取得＋collectorテストであり、新sourceのCloudflare cronからのpublisher到達性は次の定時runで確認が必要です。追加の同一listing GETは予算上行っていません。

## 16. Sources Not Enabled

Hookup、Audio-Technica、TASCAM、Sound House、chuya、Skream、Natalieなど。Sleepfreaksは収集停止を維持しました。

## 17. Article Quality

品質ゲートPASS。HIGH VALUE 30→32、USEFUL 8→12、LOW VALUE 4→4、NOISE 0→0。追加6件はHIGH／USEFULのみです。

visible duplicates 0、generic label指標7→7（既存分のみ）、tickerのLOW／NOISE 0。最大source比率は26.2%→25.0%。既存承認・却下済みレコード、legacy grants、takedownを保持しました。

## 18. Freshness

fresh useful：24h 0→0、7d 13→14。24hの件数を増やすための日付変更なし。7日／14日fallbackと90日retentionを保持。インタビューに公演終了期限を付けず、日時を確認したEventだけ終了期限を付けています。

## 19. Current Category Distribution

| Category | Before | After |
|---|---:|---:|
| Acoustic | 6 | 6 |
| Electric | 9 | 10 |
| Amps | 12 | 12 |
| Recording | 3 | 4 |
| DTM | 9 | 10 |
| Sale | 0 | 0 |
| Artist | 1 | 3 |
| Live | 2 | 3 |
| **Total** | **42** | **48** |

## 20. REVIEW Burden

6→4件。内訳：Ikebe 1、IK 2、Ikebe Event 1。新しいsourceの初期REVIEWは2件で、公式確認した1件のみ公開しました。

## 21. Publisher Request Counts

direct GET／試行：**25**。Ikebe pending 3、IK pending 3、AGM/Rittor 4、Ikebe Event 4、ZOOM 2、Hookup 4、AT Distribution 4、Sound House robots 1。

TASK 1は上限6 GETを遵守。各URL再取得0。Sleepfreaks 0、chuya 0。検索discoveryは別枠で、検索エンジンの上流アクセス数は計測できません。

AGM robots／Rittor規約の取得後にローカル処理エラーが2件ありましたが、HTTP 200応答をメモリ内で再処理し、GETを増やしていません。HTML保持用プロセスは終了しました。

## 22. Legal / Robots / Evidence

source/surfaceごとのrobots・適用規約・公開アクセス・opt-outを確認。明示許諾なしだけでBLOCKEDにせず、転載制限を無制限再利用の許可とも扱っていません。

既存research guardを通過したfacts・独自label・URL・時刻・hashだけを保持。raw HTML、本文、原見出し、画像、OGPの保存0。access bypass、403/451回避、unbounded crawl、pagination全巡回、retry loopなし。source evidenceの期限・kill switch・takedownを維持しました。

## 23. Tests

**2,002 PASS／0 FAIL**。

Port 887／Shared 226／Sync 393／Pitch 30／Fretboard 25／Rhythm 19／Chord 95／NEWS 327。baseline 1,959に新規43テストを追加。

parser、facts、具体的label、重複、イベント終了、REVIEW、robots変更、evidence期限、限定article回復、既存判定保持を確認。syntax、diff --check、secret scan、Worker dry-runもPASS。テスト中publisherアクセス0。

## 24. Production Smoke

本番Port 1.11.0／NEWS 0.9.1を確認。375・393・1440pxでHome ticker、NEWS、全カテゴリ、外部リンクを実レンダリングしました。横はみ出し・page errorなし。

cursor paginationは10/10/10/10/8件、48 unique。offset順序も一致。Practice／Calendar／Tuner／Metronome／Gear／My Apps／Settingsの7画面を確認。NEWS停止・障害時も他画面を操作可能でした。

Sleepfreaks：収集OFF、今回アクセス0、既存5件visible。新source healthはoperator検証に基づくhealthy、failure 0。

## 25. Git / Deploy

新しいcoverage機能としてminor bump：Port **1.11.0**／NEWS初回 **0.9.0**、会場証拠guardのpatch後 **0.9.1**。実装commit：`9d155a83492c2a9a5e19ffe905c091a8af171517`。会場guard修正commit：`abb7437055d739993edfbaa0f43921b4805ad203`。Portコードに追加変更はないため1.11.0を維持しました。依存パッケージ・Node engine条件は元のlock内容を保持しています。

normal push・GitHub Pages build・Cloudflare NEWS Worker deployを完了。Worker version ID：`2c426635-de88-49a2-b927-9177be65a978`。NEWS専用D1 bindingを確認。06:00 JST収集cron／毎時retention cronを保持。

最終HEAD＝main＝origin/main、ahead/behind 0/0、staged 0。既存tracked変更2・untracked 5の計7ファイルをhash一致で保持し、今回作成した依存symlinkは撤去しました。元checkoutと既知の未追跡ディレクトリは変更していません。禁止Git操作なし。

## 26. Remaining Gaps

Saleは0件。国内Artistの継続供給量とRecordingの鮮度には改善余地があります。Ikebe Eventの一覧だけで不足するfactsは今後もREVIEWが必要です。残り4件と新sourceの次回cron到達性は未確認事項として残します。

## 27. Recommended Next Step

次の06:00 JST定時runで新3sourceの実到達性・差分・重複・REVIEW増加を確認。その結果から供給頻度を評価し、実際の新製品があるfirst-party Recording surfaceを優先してください。追加source数やSale 0→1を目標にはしません。

## YES / NO

| Check | Result |
|---|---|
| remaining REVIEW reduced | YES |
| useful pending items were lost | NO |
| facts fabricated | NO |
| domestic Artist coverage improved | YES |
| Live/Event coverage improved | YES |
| Recording coverage improved | YES |
| Sale coverage improved | NO |
| low-value Sale added only to avoid zero | NO |
| AGM/Rittor production enabled | YES |
| Ikebe Event production enabled | YES |
| generic entertainment feed enabled | NO |
| new source added only to increase source count | NO |
| new source passed actual user-value gate | YES |
| generic Artist labels can auto-publish | NO |
| Sleepfreaks collection resumed | NO |
| Sleepfreaks approved items remain visible | YES |
| evidence gate preserved | YES |
| robots/access restrictions preserved | YES |
| raw HTML stored | NO |
| original headline stored | NO |
| publisher images stored | NO |
| all tests pass | YES |
| production smoke passes | YES |
| Git safety followed | YES |
