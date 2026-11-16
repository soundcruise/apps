# 2026-11-16 審査支援と池部Events停止の調査

本番読み取り開始10:45 JST。基準main `25fada5282464e6d77b189ff6680ae74fe5d2b11`、本番NEWS/Operator 0.67.0。
本番の掲載・非掲載・見送り・facts保存・停止解除・配備・有料探索は実行していない。

## 現在値と本人の操作

実Accessでは人間判断待ち18件＝正式未判断7件＋Web案11件。正式READY0・技術待ち表示0。
技術待ち0は本人確認フォームへ案内する表示分類であり、正式factsの自動復旧成功ではない。
候補269、Ledger198、Shadow486、Webヒント77、表示可能なAI案37、公開API186件。
対象18件はいずれも未判断のまま。旧Web8件の見送りもしていない。Acompassの既存承認・公開は維持。

分類はA4・B2・C9・D3。Aも正式READY済みという意味ではなく、本人確認後に現行2クリック経路へ進めるもの。
原記事の日付・対象・出来事・紹介条件・独自見出し・重複を本人が確認し、入力済みリンクから「掲載する」→「確認して掲載」。
WILD DOGと小池を優先。110413と110561も本番で最終確認ダイアログまで読み取り受入済み。確定はしていない。
本人による確定後に既存候補IDへfactsを保存し、publicationValidation/CAS/重複/takedown/既存Ledger条件を通す。途中失敗や競合時は公開成功と扱わない。

## 正式候補7件

下記の公開日は既存候補と提供情報を照合した候補値。原記事を本人が確認するまで正式な人間確認証拠ではない。
同一URLの二重候補はなし。既存269候補との照合で同一出来事を確認できないものは、最終保存時の正式重複検証も必要。

|区分|原記事・公開日候補|入力済み独自見出し／対象・出来事|関連性・不足・本人の次操作|
|---|---|---|---|
|A|[WILD DOG](https://acousticguitarmagazine.jp/2026-1113-wild-dog-stomp/) 11/13|WILD DOG STOMP、弾き語り向けフット・ストンプ8機種の発売情報。複数機材の紹介|高。8機種と記事日付・発売情報を確認。単一の新ギター発売にはしない。入力済み→2クリック|
|A|[小池竜暉](https://acousticguitarmagazine.jp/interview/2026-1112-koike-ryuki-cipher/) 11/12|小池竜暉、アコースティック・ギターと作曲を語るインタビューを公開|高。人物・テーマ・記事日付を確認。過去のアルバムを新発売にしない。入力済み→2クリック|
|A|[島村110413](https://www.shimamura.co.jp/update/guitar-bass/2026/11/110413/) 11/12|strandberg*、Boden Essential 6 PBL EX-LTDの特別仕様を紹介（島村限定カラーPrussian Blue）|エレキ中心。通常色と別出来事を保持。掲載価値・色・型番を本人確認して2クリック|
|A|[島村110561](https://www.shimamura.co.jp/update/guitar-bass/2026/11/110561/) 11/11|E.D.GEAR、AG・EG・EBアクセサリーセット2027の刷新を紹介|初心者向け。3セットの刷新という出来事を確認。新ギター発売へ変換しない。入力済み→2クリック|
|B|[島村111613](https://www.shimamura.co.jp/update/amp-effector/2026/11/111613/) 11/5|Animals Pedal、Custom Illustrated RRF 甘春わすれ #01の特別仕様を紹介（限定アートワーク）|エレキ用ファズで低優先。本番では下書き見出し生成停止。0.67.1修正を隔離受入済み、未配備。現行詳細編集は残る。採否は本人判断|
|B|[島村110532](https://www.shimamura.co.jp/update/amp-effector/2026/11/110532/) 11/13|ちいかわクリップチューナーの発表。メーカー未確認なので見出し未確定|メーカー／販売主体を一次情報で本人確認するまで停止。キャラクター名・島村をメーカーへ代用しない|
|C|[島村111462](https://www.shimamura.co.jp/update/dtm-recording/2026/11/111462/) 11/15|Earthworks Audio DK3 / Drumeo Editionの発表|ドラム用マイクキット。アコギ弾き語り関連性が低く見送り検討。種別をギターへ偽装しない。正式候補なので本人の既存「掲載しない」を使用|

## 11/16探索のWeb新着3件（新しく発見した記事、発表日とは別）

いずれも現在のヒントURLは `source_not_registered`、正式保存未対応。日付や出典許諾をAIだけで成立させない。
下記Dは明示的な法的禁止の断定ではなく、現行URL・出典条件が未確認で正式保存できないという運用上の分類。
利用条件の新規開放・取得範囲の拡張は今回行わない。

|区分|原記事・日付の区別|整理した独自見出し案／出来事・価値|不足・最短の次操作|
|---|---|---|---|
|D|[Audient / Computer Music Japan](https://computermusic.jp/2026/11/id-desktop/) 記事表示11/13は公開Web検索返却で確認。ブラウザー直接表示は空画面。一次[Audient発表](https://audient.com/news/2026/11/12/id-desktop-launch/)は11/12|Audient、録音向けiD Desktopシリーズの新世代モデルを発表。弾き語り録音に有用で3件中の新着優先度は高い|正式保存の出典条件と録音機器の種別対応が未解決。一次発表は4機種、国内記事は3機種なので混同しない。国内発売条件・本文の日付は本人再確認。既存候補に同製品は確認できず|
|D|[Recording King / ピアカケ](https://piakakeprivatelesson.com/article/2c717ad2-99be-4b94-a79c-e5800a791206) 記事掲載11/8、発表・更新表示11/2。[メーカー一次発表](https://recordingking.co/news/rk-standard-series/)も11/2|Recording King、オール単板アコギ「RK Standard Series」を発表。関連性は高いが14日前の発表で緊急性は低い|未対応出典の紹介条件・正式保存対応、国内発売日・価格が未確認。検索更新日を公開日に使わない。既存候補に同シリーズは確認できず|
|D|[Headway / ピアカケ](https://piakakeprivatelesson.com/article/e1efa16d-af94-4c8d-bd28-3bafd16f0bf7) 記事掲載11/5、発表・更新表示11/4。[Deviser一次記事](https://www.deviser.co.jp/information/634291)の画面公開日11/4|Headway、One Day Guitar Show 2026の限定アコギを先行紹介。Y’s/F’s Concept・冬桜等。関連性が高く11/22詳細公開前の価値あり|既存公開「四季桜2026」と同一モデルとは断定できない。一次Deviserは既存の本人条件確認・登録範囲内なので、未対応二次出典を開放するより一次記事を使う。今回の保存ヒントは二次URLだけで、一次記事の入力済みAI案はDBに存在しない。既存の「原記事を確認して登録」から本人提供情報の読み込み／貼付経路を使えるが、二次URLの2クリック保存が可能とは報告しない|

一次情報や通常ブラウザーの観測は、collector receipt・本番facts・運営者本人の確認記録ではない。
3件を既存2クリック保存可能と偽装するためのsource登録、日付の書戻し、有料推論は実行していない。

## 従来Web8件（C：本人による見送り推奨）

日付の根拠は[11/11の原記事通常閲覧記録](news-home-20261111/ACCEPTANCE.md)。現在の候補・掲載履歴と再照合し、原記事全件の再取得はしていない。
Web案の「見送る」は表示保留であり、正式Ledgerの非掲載判断ではない。本人が選ぶまで状態を変えない。

|原記事|公開日・対象・出来事／独自見出し案|根拠・不足事項|
|---|---|---|
|[Gibson100周年](https://gibson.jp/news-events/27491)|7/23。Gibson、アコースティック製作100周年の限定5モデルを紹介|90日超。現在の新着に非推奨。個別記事への直接リンク条件も未解決|
|[Yamaha LL56三木200周年](https://www.mikigakki.com/shop/g/gsa260113ll56ctm200/)|記事公開日不明。ヤマハ、三木楽器200周年のLL56限定仕様を紹介|販売開始2025/10/13・完売の過去モデル。URLの日付を公開日にしない。利用条件未確認|
|[Martin浜田省吾](https://www.shimamura.co.jp/update/shops/hamakita/guitar-bass/80633/)|9/9公開、11/4更新。Martin、浜田省吾シグネチャーモデルを紹介|既存承認ID `049a692a2e22733e2583e62487a7304e3c99bf678355277b4e3ecbf105f717fe` と同モデル。追加仕様・別出来事の証拠なし|
|[AGM Eastman/Bourgeois](https://acousticguitarmagazine.jp/gears/eastman-1/)|公開日未確認。EastmanとBourgeoisのギター特集|2023年9月号誌面由来。2024/11/1更新情報を公開日や新発売へ転用しない|
|[Mukae工房訪問](https://www.shimamura.co.jp/update/shops/hakata/guitar-bass/36609/)|3/19。Mukae Guitars、向江良太氏の工房を紹介|90日超の工房記事。新しい出来事の証拠なし|
|[JEUGIA RF-65](https://shop.jeugia.co.jp/c/gr2/gr3/gr6/4580393205665-49)|商品ページ公開日不明。K.Yairi、RF-65 sen-saiの限定仕様を紹介|5月発売・6月の他店紹介がある既存モデル。在庫・掲載日を新発売へ変換しない。紹介条件も未確認|
|[中日Three S](https://www.chunichi.co.jp/article/839468)|2024/1/18。鈴木バイオリン、Three Sの復刻モデルを紹介|旧記事。商用サービスへのリンク条件未確認、会員本文は回避しない|
|[Deviser Bacchus](https://www.deviser.co.jp/information/626551)|11/6。Bacchus、One Day Guitar Show 2026の限定モデルを先行紹介|Handmade/Unique・WOODLINE/DUKEのエレキ／ベース中心で低優先。人間確認経路自体は既存どおり利用可能、無理な採用は勧めない|

## 池部Events停止の確定原因と復旧条件

- `source_id=ikebe-event`。2026/10/15の条件付き許諾と5条件を維持。[既存許諾記録](../NEWS-SOURCE-DECISION-REGISTER.md#source-ikebe-event)。出典明記、原記事へ直接リンク、短い独自facts紹介のみ、訂正削除対応、説明済み取得方法・範囲・頻度を維持。
- 最後の成功：10/28 06:00:30.032 JST。2リクエスト・6カード。
- 停止：10/29 06:00:28.685 JSTのscheduled実行。robots後の固定一覧が同じ一覧URLへの302を返し、06:00:32.496に`redirect-blocked`監査を記録。run `1bcdc4a7-6bc7-4b9c-a9df-31bb2f61bfae`、2 requests、候補0。parser/quality gateへ到達する前のアクセス段階。
- 現在：disabled=1、publication_blocked=0、takedown=0、lease_until=0、failures=1。明示的な人間のstop監査なし。以後のhealthはsource_disabledで上書きされているが、元の停止監査は保存されている。
- redirectは一時的失敗の自動再開対象外。既存maintenance recoveryの対象はAGM/島村だけで、Eventsを勝手に自動復旧しない。
- 11/16 10:47 JST、既存`resumeDiagnostic`をローカルから1回だけ実行。既存UA・manual redirect、robots→固定一覧の計2 GET。robots許可・基準hash一致、一覧200・Locationなし、parser7 entries。本文・原見出し・画像は保存せず、候補・監査・source_stateへ書込みなし。
- ローカル回線で正常でも、Cloudflare Workerの出口で同じ応答になるとは未実証。現在の200だけから10/29の302をメンテナンス・WAF等のどれかに断定しない。
- 収集コードやURLの変更は不要。停止解除は別承認。直前に同じ出典の停止・権利・takedown・robots・redirect条件を再照合し、既存管理の`source-enable / review_complete`を対象1出典だけに適用、監査を残し、次の通常06:00収集のrobots→一覧で実受入する。再redirectなら再停止し、追従・迂回しない。
- `scripts/operator.mjs control`の`operatorPlan`はAPI OFFを前置するため、そのまま単発実行する手順にはしない。既存`administer`/`adminStatements`の監査付き操作を使い、グローバルcontrols・他出典・既存記事を維持する実行内容を承認時にレビューする。今回はSQL書込みや解除操作をしていない。

## 0.67.1の最小修正と検証

111613は下書きでも正式保存用`typeEvidence`を要求していたため、見出しがnullになり最終確認へ進めなかった。
既存`assistedLabel`に明示的な下書き整形モードを追加し、既存Web案・候補投影・提供情報の3箇所だけで使用。
正式呼出しの既定条件は変更なし。下書きへ人間の種別証拠・confirmed・provenanceは生成せず、独自見出しだけ整形する。
publicationValidation、assisted-entryの本人種別確認、Access/CSRF、CAS、Ledger、重複、takedown、自動掲載条件は維持。

- 全回帰2,092 PASS、両Worker dry-run build成功、git diff check成功。
- 本番4件は最終確認ダイアログまで。確定操作なし。
- 隔離UIで111613の見出し初期表示・確認チェック全OFF・2クリック確定・正式validation PASS・同じ候補ID・人間Ledger1件・再読込時の再登録拒否を確認。PC/390px、外部HTTP0。これは本番掲載実績ではない。
- Eventsは隔離試験で同一URL302→停止、200診断だけでは停止を解除しないこと、明示的な既存admin復旧後の通常collector成功・API維持を確認。通常collectorコードは未変更。
- 本番のGemma4・11/18最終枠・通常cron・予算・認証・出典条件・自動掲載OFFを変更しない。次回配備は本番ON・有限計画を必ず読み取り保持する。

## 入力済みリンク

[既存7件の入力済みリンク](human-ready-20261116/LINKS.md)。以下4件は本番最終確認まで受入済み。リンクに認証情報・確認済みフラグなし。

- [koike 入力済み確認画面](https://sound-cruise-news-operator.cruise-port-requests.workers.dev/?assistedUrl=https%3A%2F%2Facousticguitarmagazine.jp%2Finterview%2F2026-1112-koike-ryuki-cipher%2F#assistedDraft=%7B%22version%22%3A1%2C%22url%22%3A%22https%3A%2F%2Facousticguitarmagazine.jp%2Finterview%2F2026-1112-koike-ryuki-cipher%2F%22%2C%22source%22%3A%7B%22label%22%3A%222026%E5%B9%B411%E6%9C%8816%E6%97%A5%20%E5%8E%9F%E8%A8%98%E4%BA%8B%E3%81%AE%E9%80%9A%E5%B8%B8%E9%96%B2%E8%A6%A7%E3%81%AB%E5%9F%BA%E3%81%A5%E3%81%8F%E7%A2%BA%E8%AA%8D%E7%94%A8%E6%83%85%E5%A0%B1%EF%BC%88%E6%9C%AC%E4%BA%BA%E6%9C%AA%E7%A2%BA%E8%AA%8D%EF%BC%89%22%2C%22url%22%3A%22https%3A%2F%2Facousticguitarmagazine.jp%2Finterview%2F2026-1112-koike-ryuki-cipher%2F%22%7D%2C%22fields%22%3A%7B%22brand%22%3A%22%E5%B0%8F%E6%B1%A0%E7%AB%9C%E6%9A%89%22%2C%22product%22%3A%22%E3%82%A2%E3%82%B3%E3%83%BC%E3%82%B9%E3%83%86%E3%82%A3%E3%83%83%E3%82%AF%E3%83%BB%E3%82%AE%E3%82%BF%E3%83%BC%E3%81%A8%E4%BD%9C%E6%9B%B2%22%2C%22productType%22%3A%22interview%22%2C%22action%22%3A%22interview%22%2C%22label%22%3A%22%E5%B0%8F%E6%B1%A0%E7%AB%9C%E6%9A%89%E3%80%81%E3%82%A2%E3%82%B3%E3%83%BC%E3%82%B9%E3%83%86%E3%82%A3%E3%83%83%E3%82%AF%E3%83%BB%E3%82%AE%E3%82%BF%E3%83%BC%E3%81%A8%E4%BD%9C%E6%9B%B2%E3%82%92%E8%AA%9E%E3%82%8B%E3%82%A4%E3%83%B3%E3%82%BF%E3%83%93%E3%83%A5%E3%83%BC%E3%82%92%E5%85%AC%E9%96%8B%22%2C%22publishedAt%22%3A%222026-11-12%22%7D%2C%22notes%22%3A%5B%5D%7D)
- [wild-dog 入力済み確認画面](https://sound-cruise-news-operator.cruise-port-requests.workers.dev/?assistedUrl=https%3A%2F%2Facousticguitarmagazine.jp%2F2026-1113-wild-dog-stomp%2F#assistedDraft=%7B%22version%22%3A1%2C%22url%22%3A%22https%3A%2F%2Facousticguitarmagazine.jp%2F2026-1113-wild-dog-stomp%2F%22%2C%22source%22%3A%7B%22label%22%3A%222026%E5%B9%B411%E6%9C%8816%E6%97%A5%20%E5%8E%9F%E8%A8%98%E4%BA%8B%E3%81%AE%E9%80%9A%E5%B8%B8%E9%96%B2%E8%A6%A7%E3%81%AB%E5%9F%BA%E3%81%A5%E3%81%8F%E7%A2%BA%E8%AA%8D%E7%94%A8%E6%83%85%E5%A0%B1%EF%BC%88%E6%9C%AC%E4%BA%BA%E6%9C%AA%E7%A2%BA%E8%AA%8D%EF%BC%89%22%2C%22url%22%3A%22https%3A%2F%2Facousticguitarmagazine.jp%2F2026-1113-wild-dog-stomp%2F%22%7D%2C%22fields%22%3A%7B%22brand%22%3A%22WILD%20DOG%20STOMP%22%2C%22product%22%3A%22%E3%83%95%E3%83%83%E3%83%88%E3%83%BB%E3%82%B9%E3%83%88%E3%83%B3%E3%83%978%E6%A9%9F%E7%A8%AE%22%2C%22productType%22%3A%22guitar_article%22%2C%22action%22%3A%22introduction%22%2C%22label%22%3A%22WILD%20DOG%20STOMP%E3%80%81%E5%BC%BE%E3%81%8D%E8%AA%9E%E3%82%8A%E5%90%91%E3%81%91%E3%83%95%E3%83%83%E3%83%88%E3%83%BB%E3%82%B9%E3%83%88%E3%83%B3%E3%83%978%E6%A9%9F%E7%A8%AE%E3%81%AE%E7%99%BA%E5%A3%B2%E6%83%85%E5%A0%B1%22%2C%22publishedAt%22%3A%222026-11-13%22%7D%2C%22notes%22%3A%5B%7B%22label%22%3A%22%E5%AF%BE%E8%B1%A1%22%2C%22value%22%3A%22%E8%A4%87%E6%95%B0%E3%81%AE%E3%83%95%E3%83%83%E3%83%88%E3%83%BB%E3%82%B9%E3%83%88%E3%83%B3%E3%83%97%E3%82%92%E7%B4%B9%E4%BB%8B%E3%81%99%E3%82%8B%E8%A8%98%E4%BA%8B%E3%80%82%E5%8D%98%E4%B8%80%E3%81%AE%E3%82%AE%E3%82%BF%E3%83%BC%E6%96%B0%E8%A3%BD%E5%93%81%E3%81%A7%E3%81%AF%E3%81%82%E3%82%8A%E3%81%BE%E3%81%9B%E3%82%93%E3%80%82%22%7D%5D%7D)
- [110413 入力済み確認画面](https://sound-cruise-news-operator.cruise-port-requests.workers.dev/?assistedUrl=https%3A%2F%2Fwww.shimamura.co.jp%2Fupdate%2Fguitar-bass%2F2026%2F11%2F110413%2F#assistedDraft=%7B%22version%22%3A1%2C%22url%22%3A%22https%3A%2F%2Fwww.shimamura.co.jp%2Fupdate%2Fguitar-bass%2F2026%2F11%2F110413%2F%22%2C%22source%22%3A%7B%22label%22%3A%222026%E5%B9%B411%E6%9C%8816%E6%97%A5%20%E5%8E%9F%E8%A8%98%E4%BA%8B%E3%81%AE%E9%80%9A%E5%B8%B8%E9%96%B2%E8%A6%A7%E3%81%AB%E5%9F%BA%E3%81%A5%E3%81%8F%E7%A2%BA%E8%AA%8D%E7%94%A8%E6%83%85%E5%A0%B1%EF%BC%88%E6%9C%AC%E4%BA%BA%E6%9C%AA%E7%A2%BA%E8%AA%8D%EF%BC%89%22%2C%22url%22%3A%22https%3A%2F%2Fwww.shimamura.co.jp%2Fupdate%2Fguitar-bass%2F2026%2F11%2F110413%2F%22%7D%2C%22fields%22%3A%7B%22brand%22%3A%22strandberg*%22%2C%22product%22%3A%22Boden%20Essential%206%20PBL%20EX-LTD%22%2C%22productType%22%3A%22electric_guitar_bass%22%2C%22action%22%3A%22variant_introduction%22%2C%22qualifier%22%3A%22%E5%B3%B6%E6%9D%91%E9%99%90%E5%AE%9A%E3%82%AB%E3%83%A9%E3%83%BCPrussian%20Blue%22%2C%22publishedAt%22%3A%222026-11-12%22%2C%22label%22%3A%22strandberg*%E3%80%81Boden%20Essential%206%20PBL%20EX-LTD%E3%81%AE%E7%89%B9%E5%88%A5%E4%BB%95%E6%A7%98%E3%82%92%E7%B4%B9%E4%BB%8B%EF%BC%88%E5%B3%B6%E6%9D%91%E9%99%90%E5%AE%9A%E3%82%AB%E3%83%A9%E3%83%BCPrussian%20Blue%EF%BC%89%22%7D%2C%22notes%22%3A%5B%5D%7D)
- [110561 入力済み確認画面](https://sound-cruise-news-operator.cruise-port-requests.workers.dev/?assistedUrl=https%3A%2F%2Fwww.shimamura.co.jp%2Fupdate%2Fguitar-bass%2F2026%2F11%2F110561%2F#assistedDraft=%7B%22version%22%3A1%2C%22url%22%3A%22https%3A%2F%2Fwww.shimamura.co.jp%2Fupdate%2Fguitar-bass%2F2026%2F11%2F110561%2F%22%2C%22source%22%3A%7B%22label%22%3A%222026%E5%B9%B411%E6%9C%8816%E6%97%A5%20%E5%8E%9F%E8%A8%98%E4%BA%8B%E3%81%AE%E9%80%9A%E5%B8%B8%E9%96%B2%E8%A6%A7%E3%81%AB%E5%9F%BA%E3%81%A5%E3%81%8F%E7%A2%BA%E8%AA%8D%E7%94%A8%E6%83%85%E5%A0%B1%EF%BC%88%E6%9C%AC%E4%BA%BA%E6%9C%AA%E7%A2%BA%E8%AA%8D%EF%BC%89%22%2C%22url%22%3A%22https%3A%2F%2Fwww.shimamura.co.jp%2Fupdate%2Fguitar-bass%2F2026%2F11%2F110561%2F%22%7D%2C%22fields%22%3A%7B%22brand%22%3A%22E.D.GEAR%22%2C%22product%22%3A%22AG%E3%83%BBEG%E3%83%BBEB%E3%82%A2%E3%82%AF%E3%82%BB%E3%82%B5%E3%83%AA%E3%83%BC%E3%82%BB%E3%83%83%E3%83%882027%22%2C%22productType%22%3A%22guitar_article%22%2C%22action%22%3A%22introduction%22%2C%22label%22%3A%22E.D.GEAR%E3%80%81AG%E3%83%BBEG%E3%83%BBEB%E3%82%A2%E3%82%AF%E3%82%BB%E3%82%B5%E3%83%AA%E3%83%BC%E3%82%BB%E3%83%83%E3%83%882027%E3%81%AE%E5%88%B7%E6%96%B0%E3%82%92%E7%B4%B9%E4%BB%8B%22%2C%22publishedAt%22%3A%222026-11-11%22%7D%2C%22notes%22%3A%5B%5D%7D)
