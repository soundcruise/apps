# 残る13件の掲載支援（2026-11-16）

本番読取22:49 JST、NEWS/Operator 0.69.0、main `9310b7af05d3d1f092c074133db6f310ffb3cd25`。実Accessは13件＝正式未判断2＋Web判断対象11。掲載可0／人間確認1／技術・出典3／編集判断9。既存197承認候補・Ledger203・Webヒント77を照合。公開API189件。候補・Web案・既存掲載を重複計上しない。

|今回の準備結果（排他的）|件数|内容|
|---|---:|---|
|本人確認・掲載へ渡せる入力済み案|2|ちいかわは現行本番で利用可。Headwayは本PR配備後。DB上のREADY・掲載実績ではない|
|不足情報の新規転記が必要|0|上の2件は主要欄が入力済み。原記事・紹介条件の本人確認は必須|
|技術・出典条件が残る|2|Audient、Recording King。一次情報は確認できたが、現在の正式保存scopeは未対応|
|本人の編集判断へ渡せる|9|旧Web8＋正式候補111462。自動非掲載・削除・見送り操作なし|

本番キューは今回の読み取り・リンク表示では変わらない。Headwayは二次ヒントを改変せず別の一次URLへ人が進むため、元カードの分類が自動で掲載可に変わる修正ではない。

## 優先4件

|記事／根拠|日付・対象・出来事|評価と次操作|機械自動掲載の可能性|
|---|---|---|---|
|[ちいかわ：島村110532](https://www.shimamura.co.jp/update/amp-effector/2026/11/110532/)／[キョーリツ一次発表](https://kyoritsu-group.com/news/news_products/96301/)|両記事公開11/13。島村更新11/16。発表・販売主体はキョーリツコーポレーション。CKCC-CH/CKCC-HW/CKCC-USのクリップチューナー。発売予定11/20は別日|ギター・ウクレレの音合わせに関連。掲載候補。メーカー工場やキャラクター権利者を主体に推定しない。入力済みリンクから本人が原記事・条件を確認して2クリック。既存候補IDを維持|現在は人間確認。観測内容はcollector receiptでない。将来は許可済みcollectorの正式facts/provenanceと厳格な編集条件成立が必要|
|[Audient一次発表](https://audient.com/news/2026/11/12/id-desktop-launch/)／[現Web案](https://computermusic.jp/2026/11/id-desktop/)|一次公開11/12。iD1・iD2・iD2+・iD4+の4機種。iD2/iD2+/iD4+は即時供給、iD1は2027年初頭予定。国内二次記事の3機種と混同しない|弾き語り録音に有用。独自案「Audient、録音向けiD MK3シリーズ4機種を発表」。国内価格・国内発売日は未確認。ニュース記事URLの人間紹介条件の運用審査と既存assistedの正式scope承認が必要。加えてオーディオインターフェース種別は現在の具体種別一覧にない。ギターアンプへ変換しない|今は不可。機械取得の可否も未審査。人間確認scope・具体種別の承認後も現行自動掲載条件は維持|
|[Recording King一次発表](https://recordingking.co/news/rk-standard-series/)／[現Web案](https://piakakeprivatelesson.com/article/2c717ad2-99be-4b94-a79c-e5800a791206)|一次公開11/2。RK Standard Series、オール単板アコギ。年内は選定販売店、翌年に広く供給予定。二次掲載11/8と発表11/2を分離|高関連性、発表から14日で速報性は低下。独自案「Recording King、オール単板アコギ『RK Standard Series』を発表」。国内販売日・価格は未確認。一次URLの独自facts紹介と直リンクの条件を運用審査し、既存scopeへの追加承認が必要。二次出典は開放しない|今は不可。人間紹介・機械取得を別途審査。アコギ種別は既存で対応できる|
|[Headway一次記事](https://www.deviser.co.jp/information/634291)／[現Web案](https://piakakeprivatelesson.com/article/e1efa16d-af94-4c8d-bd28-3bafd16f0bf7)|一次公開11/4。One Day Guitar Show 2026向けConcept・冬桜等、複数の限定アコギ製作を先行紹介。11/22詳細公開予定。発売完了ではない|アコギ関連性が高く詳細発表前の紹介価値あり。既存Deviser人間確認scopeを再利用。入力済みリンクを用意。四季桜2026の旧掲載だけにまとめて誤重複にしない。一方、同一の桜モデルを新発売として再掲載しないよう本人確認|現在は人間確認。Botの取得範囲・出典条件を広げず、機械証拠として扱わない|

キョーリツ、島村110532、Deviser、Audientの原記事表示は今回の通常ブラウザーでも確認。Recording Kingは公開Web返却のメーカー記事本文表示で確認。原記事本文・写真・原見出しをNEWSに転載せず、客観的事実による短い独自紹介だけを準備した。

### 残る2出典の条件を具体化

[AudientのTerms and Conditions](https://audient.com/terms-and-conditions/)は売買条件であり、ニュース紹介やBot取得の許諾書ではない。[Recording Kingの規約](https://recordingking.co/privacy/)にはコンテンツの著作権保護がある。どちらも、今回確認した記載だけから「客観的事実の独自紹介は法的に禁止」「個別許諾が必須」と一律断定しない。同時に、商用サービスから個別ニュースへリンクする紹介条件や個別の連絡履歴を確認済みとも推定しない。

最小の次工程は、運営者が一次ニュースURLについて「本文・写真・原見出しを使わない短い独自事実紹介＋出典＋直リンク」の条件と個別連絡を確認し、出典審査結果を承認すること。明示的制約や不明点があればメーカーへその点だけ照会する。Codexは送信しない。今回のPRでsource registry・URL scope・Bot許可を追加しない。Audientはその承認と合わせて、既存の型検証へオーディオインターフェースを一般種別として追加する必要がある。RKに新パーサーや専用種別は不要。

## 編集判断9件

日付は既存[11/11通常閲覧記録](../news-home-20261111/ACCEPTANCE.md)と[11/16調査](../REVIEW_EVENTS_20261116.md)を再利用し、本日のD1・判断履歴と照合。原記事全件を再取得したとは扱わない。不明日付は不明のまま。以下の見出しは判断支援用の独自案で、保存済みfactsの改変ではない。

|独自見出し案／原記事|原記事公開日|出来事・関連性／見送り推奨理由|既存経路と本人操作|
|---|---|---|---|
|[Gibson、アコースティック製作100周年の限定5モデルを紹介](https://gibson.jp/news-events/27491)|2026-07-23|アコギで関連性高。ただし90日超の旧発表|直リンク条件未解決・期限外。Web「見送る」は表示保留のみ|
|[ヤマハ、三木楽器200周年のLL56限定仕様を紹介](https://www.mikigakki.com/shop/g/gsa260113ll56ctm200/)|不明|アコギ。2025-10-13販売開始・完売、今回の新発表でない|正式scope・利用条件未確認。Web「見送る」|
|[Martin、浜田省吾シグネチャーモデルを紹介](https://www.shimamura.co.jp/update/shops/hamakita/guitar-bass/80633/)|2026-09-09（11/4は更新）|関連性高だが既存掲載と同じモデル・出来事。別仕様の根拠なし|島村人間確認scopeはあるが重複を通さない。Web「見送る」|
|[EastmanとBourgeois、ギター特集を公開](https://acousticguitarmagazine.jp/gears/eastman-1/)|不明（2024-11-01は更新メタデータ）|アコギ特集、2023年9月号誌面由来。新着でない|AGM人間確認scopeあり。ただし日付を新しく作らない。Web「見送る」|
|[Mukae Guitars、向江良太氏の工房を紹介](https://www.shimamura.co.jp/update/shops/hakata/guitar-bass/36609/)|2026-03-19|アコギ工房。紹介価値はあるが90日超の旧記事|島村人間確認scopeあり、現時点期限外。Web「見送る」|
|[K.Yairi、RF-65 sen-saiの限定仕様を紹介](https://shop.jeugia.co.jp/c/gr2/gr3/gr6/4580393205665-49)|商品ページ公開日不明|アコギ関連性高。5月発売・6月紹介の旧モデル、在庫日を新発売にしない|正式scope・紹介条件未確認。Web「見送る」|
|[鈴木バイオリン、Three Sの復刻モデルを紹介](https://www.chunichi.co.jp/article/839468)|2024-01-18|アコギだが旧記事。会員本文は回避しない|商用リンク条件未確認・期限外。Web「見送る」|
|[Bacchus、One Day Guitar Show 2026の限定モデルを先行紹介](https://www.deviser.co.jp/information/626551)|2026-11-06|Handmade/Unique、WOODLINE/DUKE。エレキ・ベース中心で低関連性。単一新製品の発売ではない|Deviserの入力済み人間確認経路あり、採用するなら本人が関連性評価。見送る場合はWeb「見送る」|
|[Earthworks Audio、DK3 / Drumeo Editionを発表](https://www.shimamura.co.jp/update/dtm-recording/2026/11/111462/)|2026-11-15|ドラム収音用マイクキット。アコギ弾き語りへの関連性が低い|正式未判断ID81c8781472207a598d47fb147b69786263a1ca7ddb60fdb3ec5e4eaf82a3fb2a。本人が審査カードの「掲載しない」を選ぶ。ドラム機材をギター種別へ偽装しない|

Martin重複先 `049a692a2e22733e2583e62487a7304e3c99bf678355277b4e3ecbf105f717fe` は承認済みで保持。Headway四季桜の既存承認は `129529642a22e1c4bc999493d8baeb1be7658cb2ba0b81593cabb0e91f31607e`。D1の全statusを対象にした製品・URL照合で、準備したHeadway一次URL・Audient・RK Standardと同一の既存判断は確認できず。ただし自由記述や別表記の完全な不存在証明ではなく、掲載時の正式重複検証も維持する。

旧8件・111462は、現在の情報では将来の機械自動掲載対象として推奨しない。技術失敗を低価値教師にしない。見送り推奨は本人判断ではなく、Ledgerへ記録しない。

## 最小修正と運用

保存ヒントが存在しない許可済み一次URLでは `assistedDraftForUrl` がnullを返し、既存の入力補助情報を読めなかった。既存候補→保存済みAI案を優先したまま、最後に既存の人間確認URL scopeだけを使って空の未確認下書きを返す。個別URL判定・クロール・DB書込み・新しい記事管理は追加しない。

現行のAccess/CSRF、本人による事実・紹介条件確認、publicationValidation、重複・CAS・Ledger・takedown、正式保存側の出典判定は変更なし。入力補助のregistrationAllowedはURL scopeの対応だけを示し、掲載許可やREADYの成立を示さない。出典停止・既存判断は従来のUI/保存経路で拒否する。

[入力済みリンクと本人操作](LINKS.md)。ちいかわは現行本番で入力済み表示とチェックOFFを確認済み。本番確定は未実施。Headwayは本PRの配備承認後に入力済みリンクを受け入れる。二次ヒントの分類や既存判断を一括書き換えない。人間確認記事は機械証拠や無条件の自動掲載教師にしない。

## 検証

- 全NEWS回帰2,137件PASS（追加7件）。両Worker dry-run build成功。
- 実workerd／隔離D1：ちいかわ既存ID維持、両記事の未確認入力拒否→明示的な合成人間確認→正式READY→既存Ledger各1→公開API各1、再送で二重掲載なし。
- 同じ隔離試験で、出典publication_blocked・takedown、未対応Audient/RK/二次出典URLを拒否。保存済みAI案の優先と非上書きを確認。
- 隔離Operator実画面：PCでHeadway、390pxでちいかわを入力済みリンクから2クリック掲載。公開中表示管理で両記事を確認。チェック初期OFF。外部HTTPは全面拒否したローカルfixtureで実施。
- 本番記事判断・D1編集・配備・有料探索はなし。隔離試験は実ニュースの本番掲載実績ではない。iPhone実機は未試験。
- Gemma4・Web探索ON・11/18 08:30 JST最終枠、通常Cron、手動/B→A/自動掲載OFFを維持。池部Eventsの次回11/17 06:00収集に操作を加えない。

22:56 JSTの事後照合：正式未判断2、既存承認197、Ledger203、Webヒント77、source_stateは調査開始時と内容一致。公開API189件は21:35 JSTの配備受入時と内容hash一致。本番両Workerの設定・配備versionも調査開始時から不変。候補の正式READY化・掲載・見送り・原記事再収集は本番で実行していない。
