# 8記事の再評価とホームNEWS実測（2026-11-11）

基準 main: `fe66dbd2eaa0e87282cd206ecf709935d073c549`。本番 NEWS/Operator 0.64.0、Port 1.33.0。変更候補 NEWS/Operator 0.65.0、Port 1.34.0。Web探索の有限3枠、Gemma、通常収集、判断履歴、出典条件を変更していない。

## 結論

* 原記事が11月9日以降の公開NEWSは3件。3件とも **11月11日07:42 JST** に人間が掲載承認した。原記事公開日とNEWS承認日時は別物。
* 本番の通常版・Pro版で、更新前後とも一覧に3件、ホームの5件にも3件が存在した。API欠落・更新失敗・古いキャッシュは今回再現していない。利用者の元端末の状態やSafari PWA固有の挙動は未確認。
* ホームは情報量スコア4＋最大1の鮮度加点だったため、11月6日のAcompassが11月10日の記事より先だった。75秒スクロールの先頭表示、さらに reduced-motion 時は先頭1件だけを表示するCSSが、最新記事を見つけにくくしていた。今回の確認環境では reduced-motion=false。この設定だったと利用者について断定しない。
* 最初の1枠を最新JST日の記事に確保し、残り4枠を既存の重要度順にする。最新日内の手動displayOrder、hot属性、一覧の日別手動順を維持。7日、ゼロ件時のみ14日、最大5件、公開・停止・期限・takedown条件は維持。APIとPortは同じ関数を使う。API内部キャッシュの形式キーも更新する。
* 8件は **今すぐ新着として掲載推奨0件／新着性の追加確認待ち0件／非推奨8件**。非掲載・見送り操作は一切代行していない。技術的な保存経路の開放や90日条件の緩和で件数を増やさない。

## 8件の具体的な判断材料

ここでの原記事調査は通常ブラウザーの読み取り観測。正式collector receiptや運営者本人の確認記録として保存していない。発売日不明は不明のまま。新しい記事本文の保存、Yamaha bot取得、有料検索・推論なし。RF-65の日付確認には通常の公開Web検索1回を利用し、返された島村の一次販売店記事の客観的表記だけを参照。検索結果を本番NEWS証拠として保存していない。

|記事・原記事|確認できた事実／日付|既存NEWSとの照合・評価|次の操作・出典条件|
|---|---|---|---|
|[Gibson 100周年](https://gibson.jp/news-events/27491)|公開2026-07-23。Custom Acoustic Anniversary Collection、J-45／Hummingbird／SJ-200／Dove／Advanced Jumbo。記事時点で発売中だが発売年月日未記載。|既存候補262件に同一製品の登録を確認できず。ただし111日前の記事で90日条件外。新着として非推奨。|個別記事へのリンク条件も未解決。日付を新しく置き換えず見送りを推奨。正式保存範囲を広げない。|
|[Yamaha LL56 三木200周年](https://www.mikigakki.com/shop/g/gsa260113ll56ctm200/)|LL56 Custom ARE MIKI 200th Anniversary、5本限定。[同社公式特集](https://www.mikigakki.com/shop/pg/1ll56ctm-200th/)に販売開始2025-10-13、SOLD OUT。記事公開日は不明。|新規登録なし。2026年11月の新発売ではない。URLの260113から日付を作らない。非推奨。|商用の事実紹介・個別リンク条件も未確認。旧モデルのため今回の新着採用は不要。|
|[Martin 浜田省吾](https://www.shimamura.co.jp/update/shops/hamakita/guitar-bass/80633/)|公開2026-09-09、更新2026-11-04。000JR E SHOGO HAMADA、ピックアップ・チューナー搭載。発売予定／予約案内。確定発売日不明。|**同じシグネチャーモデルを9月30日に承認済み**（下記）。別仕様・追加発表を確認できないため重複として非推奨。|更新日を公開日にせず、既存記事を代表として維持。重複記事の入力補助リンクを新設しない。|
|[AGM Eastman／Bourgeois](https://acousticguitarmagazine.jp/gears/eastman-1/)|本文にVol.97・2023年9月号の誌面由来とある。公開日は表示確認できず。更新メタデータは2024-11-01。|既存候補に該当なし。現在の新製品発表ではなく特集。関連記事欄の2026年誌面を本文の新着性に使わない。非推奨。|既存AGM人間確認経路は利用可能だが、古い記事を新着扱いしない。出版社既存許諾の独自短見出し・出典・リンクの範囲のみ。|
|[島村Mukae工房訪問](https://www.shimamura.co.jp/update/shops/hakata/guitar-bass/36609/)|公開2026-03-19。広島・似島の向江良太氏の工房訪問。新発売日なし。|既存候補に該当なし。紹介価値はあるが90日超の旧記事。新着非推奨。|既存島村人間確認経路は維持。新たな出来事なしに日付を付け直さない。|
|[JEUGIA RF-65 sen-sai](https://shop.jeugia.co.jp/c/gr2/gr3/gr6/4580393205665-49)|K.Yairi、RF-65 sen-sai、100本限定。JEUGIA商品ページ自体の公開日なし・在庫なし。[島村の販売店発表](https://www.shimamura.co.jp/update/guitar-bass/2026/06/gs-698867/)の公開Web検索返却内容には公開2026-06-01、2026年5月より順次発売と明記。検索索引の日付推定ではなく記事内の表記。正式NEWS証拠には採用していない。|現存262候補に同一モデルなし。6月に同じ限定モデルの紹介があり、11月の新発売ではない。新着として**非推奨**。|JEUGIAの商用事実紹介・原記事リンク条件は未解決のまま。11月7日の別店商品登録・入荷情報はモデルの新発売日ではない。新色・仕様変更の証拠なしに再発表扱いしない。|
|[中日新聞 Three S 復刻](https://www.chunichi.co.jp/article/839468)|公開2024-01-18 05:05、同日10:59更新。鈴木バイオリン製造Three Sのトリプルオー型復刻第2弾。発売した旨はあるが正確な発売日不明。会員限定の続きは未閲覧。|既存候補に該当なし。2024年記事で非推奨。|有料本文を回避しない。商用リンク適用条件も未解決。正式保存範囲を開放しない。|
|[Deviser Bacchus](https://www.deviser.co.jp/information/626551)|公開2026-11-06。Handmade Series／Unique Series、WOODLINE／DUKE関連。One Day Guitar Show 2026向け限定モデルの製作風景・先行紹介。単一モデルの発売ではない。|既存Bacchus記事はBLP-FMH/R等の別製品で同一とは断定しない。ただし中心がエレキ・ベースで、アコギ弾き語りNEWSとしては低優先・掲載非推奨。|運営者が関連性を評価して採用する場合は既存の人間確認・2クリック掲載を利用可能。下記リンクは入力補助のみ。事実・紹介条件・重複・関連性・独自表現を本人確認する。|

Martin重複先：`049a692a2e22733e2583e62487a7304e3c99bf678355277b4e3ecbf105f717fe`。原記事日2026-09-01 JST、承認2026-09-30T07:05:03.903Z。公開見出し「Martin、特別仕様のアコースティックギター『000JR E SHOGO HAMADA』を発表」。[既存の原記事](https://www.shimamura.co.jp/update/guitar-bass/2026/09/gs-701376/)。公開APIにも同じIDがある。既存承認の取消・変更はしていない。

Gibson・三木・JEUGIA・中日新聞の未確認事項は、Bot取得の可否、独自の事実紹介／リンクの条件、本文・写真の権利を分ける。個別許諾がないことだけから法律上一律禁止とは断定しない。同時に、この調査で契約・出典条件が解消したとは扱わない。

## 転記不要の入力補助

Deviserは既存 `scripts/assisted-draft-link.mjs` と既存提供情報fixtureを使用。ブランド・対象・種別・出来事・公開日候補・生成見出し・限定モデル区分が入力済み。実Accessで確認済み、チェック未選択・未保存・未公開。今すぐの掲載推奨とは別。

[Deviser入力済み確認画面](https://sound-cruise-news-operator.cruise-port-requests.workers.dev/?assistedUrl=https%3A%2F%2Fwww.deviser.co.jp%2Finformation%2F626551#assistedDraft=%7B%22version%22%3A1%2C%22url%22%3A%22https%3A%2F%2Fwww.deviser.co.jp%2Finformation%2F626551%22%2C%22source%22%3A%7B%22label%22%3A%22%E9%81%8B%E5%96%B6%E8%80%85%E6%8F%90%E4%BE%9B%E3%81%AE%E5%8E%9F%E8%A8%98%E4%BA%8B%E7%A2%BA%E8%AA%8D%E7%94%A8%E6%83%85%E5%A0%B1%EF%BC%882026-11-11%E3%83%BB%E6%9C%80%E7%B5%82%E7%A2%BA%E8%AA%8D%E5%89%8D%EF%BC%89%22%2C%22url%22%3A%22https%3A%2F%2Fwww.deviser.co.jp%2Finformation%2F626551%22%7D%2C%22fields%22%3A%7B%22brand%22%3A%22Bacchus%22%2C%22product%22%3A%22Handmade%20Series%EF%BC%8FUnique%20Series%22%2C%22productType%22%3A%22electric_guitar_bass%22%2C%22action%22%3A%22preview%22%2C%22qualifier%22%3A%22One%20Day%20Guitar%20Show%202026%EF%BC%8F%E9%99%90%E5%AE%9A%E3%83%A2%E3%83%87%E3%83%AB%22%2C%22publishedAt%22%3A%222026-11-06%22%7D%2C%22notes%22%3A%5B%7B%22label%22%3A%22%E7%B4%B9%E4%BB%8B%E5%86%85%E5%AE%B9%22%2C%22value%22%3A%22%E9%99%90%E5%AE%9A%E3%83%A2%E3%83%87%E3%83%AB%E3%81%AE%E5%85%88%E8%A1%8C%E7%B4%B9%E4%BB%8B%E3%80%82%E7%99%BA%E5%A3%B2%E6%B8%88%E3%81%BF%E3%81%A8%E3%81%AF%E6%89%B1%E3%81%84%E3%81%BE%E3%81%9B%E3%82%93%22%7D%5D%7D)

古い記事、正式保存未対応の出典、公開済み重複について「掲載準備完了」と誤認させる入力リンクは作成していない。JEUGIAも旧発表のため新着掲載は勧めない。紹介・リンク条件は今回解消済みとしていない。

## 最新10件のAPI／Port比較

取得時刻：2026-11-11T05:35:27.018Z。日付は原記事の公開日時（JST）。IDは両画面から原記事URLで照合し、公開APIのIDと結合。現行ticker APIと本番Portホームの5件は順序も一致。修正後列は同じデータのオフライン／ローカル表示結果で、本番未反映。

|API順|Port一覧順|現行ticker順|修正後ticker順|ID|独自見出し|原記事公開日時JST|カテゴリ|現行tickerの扱い|
|---|---|---|---|---|---|---|---|---|
|1|1|2|1|8b94b410210244318481a3824a9b38729c256c2f1a20b9a15f533fbcc47fbfa1|アコースティック・ギターの試奏・レビュー記事を公開|2026-11-10T19:00:00+09:00|media_other|選択|
|2|2|3|3|410a199f295681977aa7079fe1d5d29498ee62692f698abb9d4bd4927dd25db4|Universal Audio、プラグイン「UAD Capitol Studios」が登場|2026-11-10T00:00:00+09:00|dtm_software|選択|
|3|3|4|4|2363bdec93ca50b6e7c3f3bd8f7e38fd4a4bd6e0abfe2dcafe05b8e98e386343|Sfidaのペダル用電源「SPS-10」が登場|2026-11-09T00:00:00+09:00|amps_effects|選択|
|4|5|5|5|bd17b6a238942d7b6997de154c6923cd9c3ba303862102d061e106fcd218f9da|沖仁の教則本『沖仁 フラメンコ・ギター・アレンジ術』、12月15日の発売情報|2026-11-06T19:00:00+09:00|media_other|選択|
|5|4|1|2|15683558e2a1e02e4ce4dcc23b508b5cf12566aae4d31896e452800427538616|ヤマハ、ギターアンプ「Acompass 60」を発表|2026-11-06T00:00:00+09:00|amps_effects|選択|
|6|6|—|—|c157e6ae1e8afa79a720179ec3cd32c0a1c265809f3c5b418e30aa7590673a52|Fender Made in Japan、エレキギター「Limited Edition F Hole Telecaster Thinline / Limited Edition F Hole Telecaster Thinline HH」に新色が登場|2026-11-06T00:00:00+09:00|electric_guitar_bass|重要度・鮮度順位の5件上限|
|7|7|—|—|ff9b8092f94d5f2dafa17439a59584cbee167b67092a4eec6ce4b1708fb46a98|Fender、ギター「Fender x MusicNomad Tool Kit」が登場|2026-11-06T00:00:00+09:00|electric_guitar_bass|重要度・鮮度順位の5件上限|
|8|8|—|—|14dd8b4065691c0937c5b0f6060e3437c1c95b9d2092e3b46d0d13a3ed201440|Steinbergの音楽制作ソフトウェア「Cubase 16」、11月5日発売と案内|2026-11-05T00:00:00+09:00|dtm_software|重要度・鮮度順位の5件上限|
|9|9|—|—|daf80ab117cf943dc8749c54f5d73c4617f413e8426b48803378eeb74423b2c7|Morris Guitars、「塗装作業を伴う修理受付の再開（2026年11月9日）」の修理・メンテナンス情報を案内|2026-11-04T00:00:00+09:00|media_other|7日範囲外（7日以内が存在するので14日fallbackなし）|
|10|10|—|—|f43aeab364da2103e49560538e80e1c76f501a3a75333d163587d27d77df087d|Behringerのデジタルミキサー「WING-BK / WING COMPACT / WING RACK」の発売を案内|2026-11-04T00:00:00+09:00|recording_audio|7日範囲外（7日以内が存在するので14日fallbackなし）|

API一覧はtimestamp順。PortはJST日別で手動displayOrderを優先するため、11月6日のAcompassと沖仁本の順だけ異なる。欠落ではなく既存の表示管理仕様で、変更しない。hotは注目バッジであり、従来tickerRankの加点項目ではない。

## 更新・障害・安全条件

* 通常版・Pro版の本番「ページを更新」後、3件を一覧とtickerで確認。PC 1280px／390pxで横あふれなし。`_r`付きページ再読込後に公開APIをno-storeで再取得。
* 公開APIは186件。公開日2026-11-09 JST以降3件。最新10件のAPI/Port一覧のID集合一致。
* 非表示や削除記事をローカルfixtureで補完しない。API停止・取得失敗時の既存のエラー表示／外部fixtureへフォールバックしない契約を維持。
* 新しい個別記事HTTP取得、AI、Exa、登録・掲載・見送り、本番DB書込み、設定変更なし。
* `NEWS_WEB_ENABLED=true`、Gemma4、2026-11-12/15/17の23:30Z（JST13/16/18 08:30）の3枠、manual=false、B→A=false、自動掲載OFF、通常cronを読み取り確認。
* Port本番1.33.0とmain1.28.0の差を確認。NEWSの4実装モジュールは本番とmainがbyte一致。app-version.jsは版文字列以外一致。候補版1.34.0は本番より新しい番号を使用。**本番導入前は1.33.0の並行成果と最新mainの統合状態を既存配備ガードで再照合し、古いmainのPort全体をそのまま上書きしない。** 他のPort機能を今回の変更として取り込まない。

## 回帰と本番導入

NEWS全2,058件PASS（ticker API隔離DB統合を含む）、Port NEWS／更新／キャッシュキー76件PASS、実データ再生を実施。両Worker dry-run build PASS。新着1枠、重要度4枠、手動順、hot、7/14日、未来日、非承認、sale/event期限、API停止・出典停止・takedownを検証。新規selectorは記事の有効性を緩めず、既に有効な配列だけを並べる。

Port全回帰は候補版1,290件中1,278 PASS、12 FAIL。未変更基準mainは1,286件中1,274 PASS、**同じ12 FAIL**。テーマ構造5件、同期画面6件、Standard/Proシェル比較1件。今回差分による新しい失敗なし。これらを「全回帰PASS」と報告しない。無関係なCSS・Sync・Pro認証の修正は含めない。

本番反映は別承認。Workerだけ／Portだけの先行導入ではticker順が一時的に異なり得るため、同じ承認treeのNEWSとPortの配備を揃える。Operatorは版表示のみ。既存本番設定を読み取り保持し、RepositoryのOFF・空計画で有限探索計画を上書きしない。新しいmigrationなし。

運営者の最小操作：旧記事6件と既存掲載済みMartinのWeb案を「見送る」、Bacchusは関連性で判断。これらはWeb表示の整理であり、既存正式記事を再判断しない。Codexは一切代行していない。

## 読み取り終了時の保全照合

候補262、Ledger195、Shadow470、takedown3、Webヒント70、実行記録9、検索記録3。これらを含む13保護テーブルは0.64.0受入記録と内容ハッシュ一致。今回調査の開始・終了の公開API最新10件とticker5件も内容一致。5主要出典はhealthy、失敗数0。

16表のうち残る3表は旧受入時点から差分あり：`news_presentation_requests`／`news_presentation_days`には**調査開始前の14:22 JSTに保存された11月6日の手動表示設定**が1件増加。Acompass hot=true、order=0を含む。`news_controls.revision`は1561→1563で、表示設定のtrigger加算1と14:17 JSTの正常retention加算1に整合し、collection/api/publicationのON値は同一。この正当な既存変更を配備や今回の調査による変更と混同しない。Codexの全D1読取はrows_written=0。手動表示設定を維持したまま比較・実装している。
