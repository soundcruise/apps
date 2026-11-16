# 2026-11-17 新着候補・技術待ちの掲載準備

調査開始08:16 JST、本番0.69.1／Port1.35.0。正式候補274、未判断8、Web判断11、公開API188、Ledger203。06:00収集で池部2・AGM3・池部Events1を追加。他出典は新規候補0。6件とも「本日検出」であり「本日公開」ではない。

| 指標 | 調査開始時 | 改善後・隔離初期表示 | 本番実績 |
| --- | ---: | ---: | ---: |
| 掲載可 | 0 | 7 | 0（未配備） |
| 人間確認待ち | 3 | 0 | 3 |
| 技術・出典対応待ち | 6 | 2 | 6 |
| 編集判断 | 10 | 10 | 10 |
| 自動掲載適格 | 0 | 0 | 0 |

7はカード数、独立ニュースは6。池部173981と島村110532は同じちいかわチューナー。正式READYは確認前0のまま。関取花の1件は既存の正式validation PASSだが関連性REVIEWのため準備状態はHUMAN_REVIEW。掲載可へ表示してもDBのfacts・READY・既存判断を変えない。

## 今朝の新着6件

| 原記事／既存候補ID | 日付・内容 | 根拠と不足 | 到達先／編集上の注意 |
| --- | --- | --- | --- |
| [池部174006](https://www.ikebe-gakki-pb.com/new_product/174006/) / `7bb25a1f8095ec330f00571b5d8bee903a63a8fd866441c8141180a095f8ef95` | 11/16。MXR EVH・M400チューナー・限定YJM308G BLACK/GOLDの紹介 | 許可済み取得receiptあり。単一製品parserでidentity／scopeが確定せずfactsなし。通常閲覧で3製品を確認 | 本人確認後に掲載可能。共通guitar_article/introductionを使い、全製品が新発売・限定仕様とはしない。EVHは2015年開発との記載 |
| [池部173981](https://www.ikebe-gakki-pb.com/new_product/173981/) / `300ed58cd8e20a2cfd1d9ad7c975adecab464aa7139a3fd0ddc1fb060f84103e` | 11/16。キョーリツのちいかわクリップチューナー3柄 | receiptあり、機械identity抽出失敗。通常閲覧とキョーリツ一次発表を確認 | 本人確認後に掲載可能。島村110532と同一出来事。代表には池部を推奨し、一方だけ掲載判断 |
| [AGM Baby Dolphin試奏](https://acousticguitarmagazine.jp/gears/2026-1116-parlor-dolphin-guitars-baby-dolphin-chippoke/) / `8dc3d31bc06a13219d412b1cfc5fbf402fe4241498bcea6537978304f2e88568` | 保存collector日11/16 17:00 JST。Dolphin Guitars Baby Dolphinを大橋ちっぽけが試奏 | 対象・試奏は通常閲覧で確認。本文cacheなし、facts/provenanceなし。原記事の日付表示は確認できず、日付は保存collector由来の未確認候補 | 入力済み本人確認へ。ミニアコギの試奏・PRとして有用、新製品発売にはしない。公開日の本人照合が必要 |
| [AGM BOURGEOIS試奏](https://acousticguitarmagazine.jp/gears/2026-1116-new-gear-110-bourgeois/) / `e2c6ee2a8b4a70e52b9b06c782d52a307f8a8fb9db4d4638f98e2db78a87a7ce` | 保存collector日11/16 12:00 JST。Touchstone Series LDB-O The Standard、井草聖二の試奏 | 通常閲覧で対象を確認。既存factsはreviewメタデータのみ。日付表示は確認できず、日付は保存collector由来の未確認候補 | 入力済み本人確認へ。試奏・PR記事として判断。旧Eastman/Bourgeois特集とは別URL・別内容。発売日を創作しない |
| [AGM 関取花・ライブ編](https://acousticguitarmagazine.jp/column/2026-1116-sekitori-hana-hikigatari-live/) / `3c52fcaf3794af761a5548c5453c8f3459d3c91533beedb0d2fdc49072de6c11` | 保存collector日11/16 19:00 JST。弾き語りライブの準備・喉のケア等を語るQ&A | 既存メタデータ契約で正式validation PASS。通常閲覧では既刊ムックからの再録と確認 | 既存の「掲載する」から本人編集判断可能。新しい製品発表ではなく読みものとしての価値を判断。正式READYとは区別 |
| [池部Events 阿部学](https://www.ikebe-gakki.com/blog/20261120-eg-workshop/) / `ebdc54896e4f785f3ee2050f1152ae624d99cf3e4a8293b7edfca929e7e8fc2f` | 記事10/27、開催11/20 19–21時、イケシブPOPUP SPACE（渋谷）。B’z Brotherhoodアルペジオ講座 | 許可済みreceiptあり、parser scope判定で停止。通常閲覧で公開日・会場・開催日・11/19 20時申込締切を確認 | 本人確認後に掲載可能。収集再開で遅れて検出。エレキ中心なのでアコギ弾き語りへの採否は本人判断 |

AGM2件では、保存日付があることと原記事上で本人が公開日を確認したことを区別する。日付を確認できなければ確定しない。日付候補・公開日未照合の注記はフォームに残す。

## 人間確認待ち3件と技術6件

- 人間3件：島村110532の発表・販売主体は[キョーリツ一次発表](https://kyoritsu-group.com/news/news_products/96301/)に基づくキョーリツコーポレーション。3柄、記事11/13と発売予定11/20を分離。AGM試奏2件と併せて未確認の入力済み案を供給する。正式factsを推定で保存しない。
- 技術6件：池部174006・173981・Eventsの3件は、既存の許諾対象である収集候補だけに共通の人間確認を接続。Headwayは既存Deviser一次記事の経路へ接続。残るAudient・Recording Kingの2件は未承認出典を開放せず、下記の具体的確認へ進める。

### Audient：事実不足と出典・種別未対応を分離

[一次発表](https://audient.com/news/2026/11/12/id-desktop-launch/)の表示日11/12、対象はiD1／iD2／iD2+／iD4+の4機種。iD2・iD2+・iD4+はworldwide available、iD1は2027年初頭予定。国内二次記事の3機種を一次発表の全機種と同一視しない。ボーカルと楽器を同時録音できるインターフェースは弾き語り関連性あり。国内発売日・価格は未確認。

[Terms and Conditions](https://audient.com/terms-and-conditions/)は購入・販売条件。これを記事紹介の全面禁止や紹介許諾と解釈しない。客観的事実の短い独自紹介と一次記事への直接リンク、非転載、既存の個別連絡条件の適用確認と、アプリへの人間紹介URL範囲の追加承認が残る。現行種別にはオーディオインターフェースがなく、アンプやアコギへ偽装しない。承認後に共通種別と限定した一次news範囲で対応する案。今回の登録開放はなし。

### Recording King：正式なアコギ種別は既存で足りる

[一次発表](https://recordingking.co/news/rk-standard-series/)の表示日11/2、新しいRK Standard Seriesはオール単板の戦前型デザインのアコースティックギター。国内流通・発売日・価格は未確認であり、海外発表の紹介ならそれらを記載しない。保存済み正式候補・公開見出しとの比較で確定重複は見つからないが、本人の型番・出来事確認は必要。

[Privacy, Terms and Conditions](https://recordingking.co/privacy/)は文章・画像等の著作権を留保する。これは客観的事実による独自紹介の一律禁止を確定する証拠ではない。一方、人間紹介の条件・直接リンクとアプリの一次news範囲の追加は未承認なので、今回無条件に開放しない。必要な判断はこの限定的な紹介条件の確認と対応追加の承認。二次出典を登録対象へ拡張する必要はない。

### Headwayと二次ヒント

[Deviser一次記事](https://www.deviser.co.jp/information/634291)の11/4公開、One Day Guitar Show出展予定のConcept・冬桜2026等を先行紹介、詳細公開予定11/22を維持する。既存の9月の「四季桜2026」と、展示会向け複数モデルの先行紹介を同一視しない。二次ヒントと一次記事の対応関係を調査済みデータで明示し、原ヒントのURL・状態は変更しない。

一次URLが既に登録・判断済みなら既存NEWSの確認へ進め、新規登録・再公開を提案しない。一次掲載後、二次ヒントを自動でapproved・正式非掲載・削除にはせず、編集判断の参照にする。同じ桜モデルを別の新製品として再紹介しない最終確認は本人に残す。

## A〜D：今回の掲載準備対象10カード

| 区分 | 件数 | 説明 |
| --- | ---: | --- |
| A 機械証拠・自動掲載適格 | 0 | 自動掲載の条件は不変 |
| B 自動で正式READY、本人の掲載判断だけが必要 | 0 | 関取花はvalidation PASSだが関連性REVIEWであり、厳密なREADYではない |
| C 本人の確認・編集判断で掲載可能 | 8 | 入力済み7カード＋既存validation PASSの関取花。ちいかわの重複を含むため7出来事 |
| D 技術・出典条件未解決 | 2 | Audient、Recording King |

旧Web8件とドラムマイク島村111462の編集判断9件は別枠。新着としての推奨0という既存評価を維持し、本人の見送り・非掲載を代行しない。

## 共通修正と境界

1. 部分factsがあると確認用情報を一切使わなかった条件を修正。既存入力を上書きせず、不足する項目だけ補助する。候補日付・抽出値・手動見出しと元情報は保持する。
2. 池部は2026-10-15の条件付き許諾（`NEWS-SOURCE-DECISION-REGISTER.md`）を再利用。PB数値記事・既存Eventsギター講座URLの、通常収集で作成済みの候補IDを補完するだけ。新規URL登録、サイト全体、別取得方法・頻度は追加しない。出典・直接リンク・独自短文・転載なし・訂正削除対応等の5条件は不変。
3. 対応関係を確認した一次URLへの読取専用handoffを、既存Web審査カードから利用。出典が未承認・停止・takedownなら正式保存へ開放しない。
4. 既存の重複predicateを未確認案の表示にも再利用し、掲載済み同一出来事の疑いは編集判断へ案内する。DB上の重複確定・非掲載にはしない。新色・限定仕様の区別は既存predicateのまま。

新parser、collector変更、migration、独立記事DB、新掲載エンジンはなし。publicationValidation、正式保存・CAS・Ledger・自動掲載・学習条件は緩和しない。確認用JSONは提供情報であり、本人の確定操作までは正式facts/provenanceではない。

## 試験と本番保護

- NEWS全2,158件PASS、失敗0。今回の新規21件を含む。
- 両Worker dry-run build PASS。設定ファイル・Cron・有限計画の差分なし。
- 隔離DB：6既存候補の各IDを保持して正式READY→人間Ledger→公開APIを個別検証。Headway一次記事も既存保存・掲載経路で検証。ちいかわは両到着順で二重Ledgerを拒否し、候補は残る。
- 実workerd/D1：池部Eventsの本人確認保存、掲載時の障害、未判断READYからの同一request再開・冪等再送を検証。Ledgerは1件。
- 隔離Operator実画面：PC1280px／390px。Baby Dolphin、BOURGEOIS、MXR、Headway、池部ちいかわ、Eventsの異なる6記事を連続確定。本人未確認チェック初期OFF、同一画面で最終確認、フィルター維持、各人間Ledger1件、正式validation PASSを照合。これは本番の本人確認・掲載実績ではない。
- 本番0.69.1の実AccessではAGM2件の提供情報付きリンクの表示のみ確認。入力済み・未確認のままで、確定・保存なし。
- 同一本番snapshotを隔離複製して旧版と候補版を比較。ローカル専用pepperで見出しfingerprintだけ再計算し、元のfacts・provenance・判断・日付・履歴を変えない。旧0/3/6/10、新7/0/2/10。正式READY0、正式validation PASS1、自動掲載適格0は両版同じ。
- 08:24〜08:33 JSTの19テーブル（16保護対象＋取得証拠等）、source_state、source_healthは内容一致。本番公開API188件、内容hash `e786a09a0e4054425615e5d6ed7e4ac95c18a9ebe641954dbbd8baab479d06b3` は08:06の確認記録とも一致。
- NEWS／Operator設定不変。Gemma4、Web ON、手動OFF、B→A OFF、自動掲載OFF。11/18 08:30 JSTの最終枠、日次06:00収集、毎時retentionを維持。Nov16実績は検索3・推論2・エラー0・lock0。追加有料呼出、強制収集、配備なし。

## 運営者の最小操作

[入力済みリンク一覧](LINKS.md)から原記事・日付候補・紹介条件を確認し、必要なら訂正して「掲載する」→「確認して掲載」。現行本番でもAGM2件・島村ちいかわ・Headwayの4リンクを利用できる。池部3候補の共通フォームと自動区分更新は本PRのNEWS／Operator限定配備の承認後。

ちいかわは池部を代表にする場合、島村を重複して掲載しない。AGM2件は公開日の本人照合が必要。Headwayは11/4の先行紹介で、既存四季桜の再発売とはしない。実際の本番掲載数の増加は今回は0。

Audient／Recording Kingの一次出典対応は、紹介条件と限定した人間紹介範囲について別の明示承認が必要。禁止と断定するのでも、許諾済みと推定するのでもない。
