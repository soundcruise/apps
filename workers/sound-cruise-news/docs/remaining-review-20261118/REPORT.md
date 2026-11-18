# 残る人間確認4件・技術対応7件（0.72.0候補）

2026-11-18 21:13 JST以降の本番読み取りを基準とする。本番0.71.1の設定・記事判断・候補は変更していない。

|区分|本番開始時|変更後・隔離Operator|本番反映|
|---|---:|---:|---|
|掲載可|2|6|未実施|
|人間確認待ち|4|0|未実施|
|技術・出典対応待ち|7|7|未実施|
|編集判断・見送り候補|10|10|未実施|

新たに4件が「本人確認後に掲載可能」へ進む。機械証拠による正式READYや本番掲載の増加ではない。沖仁・K.YAIRIの既存2件、既存の判断・重複警告・見送り候補を維持する。

## 掲載準備を進めた4件

|記事・既存ID|記事公開日の入力候補|確認用情報と独自見出し|本人に残る確認|
|---|---|---|---|
|[SHURE MV360](https://www.shimamura.co.jp/update/dtm-recording/2026/11/114556/) / `373dc6cde832bbfabc96ff717fb66b157055647dc5450f6d4e3d2d6d626dd41a`|11/18。原記事の「公開」表示と保存済みcollectorが一致|SHURE／MV360／USBマイク／紹介。「SHURE、USBマイク『MV360』を紹介」|音楽録音用途としての掲載価値、事実・日付・紹介条件。発売済みとは断定しない|
|[IRIS The BB Model](https://acousticguitarmagazine.jp/gears/2026-1117-parlor-iris-guitar-company-the-bb-model-sitka-spruce-chippoke/) / `2126903f130cfe0c8a45bbd889a389b9ea5297153912fdfec0e01483a828c21e`|11/17。保存済みcollectorの17:00 JST。通常閲覧では公開日表示を再確認できず|IRIS GUITAR COMPANY／The BB Model Sitka Spruce（Tobacco Burst）／ギター関連記事／紹介。「IRIS GUITAR COMPANY、The BB Model Sitka Spruce（Tobacco Burst）の試奏記事を公開」|大橋ちっぽけの試奏、PR表記、Vol.110にも掲載された記事であること、公開日。新製品発売として扱わない。アコギ関連性が高く優先確認を推奨|
|[関取花・ライブ編](https://acousticguitarmagazine.jp/column/2026-1116-sekitori-hana-hikigatari-live/) / `3c52fcaf3794af761a5548c5453c8f3459d3c91533beedb0d2fdc49072de6c11`|11/16。保存済みcollectorの19:00 JST。通常閲覧では公開日表示を再確認できず|関取花／弾き語りライブの準備／ギター関連記事／紹介。「関取花、弾き語りライブの準備をQ&A形式で語る」|既刊ムックからの再録。11/11の歌い方編と異なるQ&Aであること、読みものとしての価値・公開日。新公演・新作発表にはしない|
|[MXR 3機種](https://www.shimamura.co.jp/update/amp-effector/2026/11/113887/) / `8eef12cb1f0e726faa02dcbcce8ee4183bd3cfc2c4fae6bad4b3e45cde392d71`|11/13。「公開」表示とcollectorが一致。更新11/17、発売予定11/19は別|MXR／M400・EVHMHG・YJM308G／ギター関連記事／紹介。「MXR、M400／EVHMHG／YJM308Gの3機種を紹介」|チューナーと歪みペダルの混在。限定はYJM308Gのみ。M400の有用性と記事全体の関連性を本人が判断。単一新製品・全機種限定・発売済みとは扱わない|

4件とも正式facts/provenanceの自動復旧ではない。通常閲覧で得た情報は、出典を明示した本人未確認の入力補助として既存JSON経路へ載せる。公開日は既存候補を優先し、既存factsや見出しを上書きしない。候補IDを維持して原記事照合後に既存の「掲載する→確認して掲載」を使う。提供情報を認証・許諾・本人確認の証拠にはしない。

[入力済みリンク集](./LINKS.md)を参照。SHUREのUSBマイク種別は本PR配備後に対応する。

## 共通修正

- `candidateAssistedDraft` が保存済みAGMの具体的focus・modelsを未確認の対象欄へ再利用する。人物名から製品ブランドを推定せず、抽象的なsingingだけでテーマを作らない。
- 既存の人間確認種別にUSBマイク（recording_audio）を追加。曖昧な「録音機器」や複数種別を無理に解決しない。collector・自動掲載・出典許可は変えない。
- 既存入力が全て揃っている場合も、提供情報の参考メモを維持する。人間編集した見出し・元の入力元が優先。
- 4件の具体的な入力補助は既存の確認情報JSONへ追加。URL専用parser・新しい登録／掲載エンジン・migrationはない。

## 技術・出典待ち7URL（6ニュースの可能性）

以下は本番の保存済み検索タイトル・Gemma推定と既存出典審査記録に基づく。新たな有料検索・推論や未許可本文取得はしていない。全て正式保存範囲外を維持する。法的な掲載禁止と断定するものではなく、紹介条件が確認済みとも推定しない。

|Web案|保存情報から分かる対象・価値|未確認事項と最小の次工程|
|---|---|---|
|[Fender / AERA](https://dot.asahi.com/articles/-/297112?page=1)|F-Hole Telecaster Thinlineの新色・HH仕様。エレキ中心|原記事公開日、対象仕様、記事リンクと独自事実紹介の条件・人間確認範囲の審査。検索更新日を公開日にしない。アコギNEWSの優先度は低め|
|[Bromo / ギター・マガジン](https://guitarmagazine.jp/news/2026-1116-buomo-guitars/)|アコギ・エレアコ4モデル。関連性は高い|公開日・4型番の確認。既存公開のBAN1V/BAN2V・BAR2R・BAN4CE bkの4モデルと同じか最優先で照合し、未確認の重複を正式判定にしない。AGMの出版社回答を別媒体へ自動拡張せず、ギタマガへの適用を確認|
|[Yamaha / Steinberg](https://jp.yamaha.com/business/audio/news/2026/1111-mgx-urx-cc1.html)|MGX/URX/CC1の更新という保存AI案。制作・配信との関連|記事公開日、更新対象・内容。business/audioは既存Topics／ニュースリリースの人間確認URL範囲外。個別メールの対象範囲と独自紹介条件を確認。直接Bot取得は禁止のまま|
|[加山雄三 / MANTAN](https://mantan-web.jp/prtimes/article/20261116prt00m200000159a.html)|愛用ギターコレクション販売。保存見出しには11/18販売開始とある|記事公開日とは別。一次発表元・対象ギター・現時点の販売状況・紹介条件を確認。アコギ対象が含まれるか未確認|
|[Audient / 財経新聞](https://www.zaikei.co.jp/releases/3713914/)|iD Desktop。録音用途に有用|次のCMJ案と同一出来事の可能性。一次発表4機種と国内3機種を混同しない。一次URLの紹介条件・人間保存範囲を審査し、必要なら共通のオーディオインターフェース種別を追加。二次URLを一括開放しない|
|[Audient / CMJ](https://computermusic.jp/2026/11/id-desktop/)|上記と同じシリーズの保存AI案|[既存調査の一次発表](https://audient.com/news/2026/11/12/id-desktop-launch/)は11/12。機種数・国内発売条件は原記事で確認。2URLを2つの掲載成果へ数えない。現段階では削除・見送り・正式重複判断もしない|
|[Recording King / ピアカケ](https://piakakeprivatelesson.com/article/2c717ad2-99be-4b94-a79c-e5800a791206)|RK Standard Series、オール単板アコギ。関連性は高い|[既存調査の一次記事](https://recordingking.co/news/rk-standard-series/)は11/2。二次掲載日と分離し、速報性・国内販売条件を確認。一次URLの独自紹介・直リンク条件と限定人間保存範囲の審査が必要。アコギ種別自体は既存で足りる|

この7件は単に入力を埋めれば保存可能になる状態ではない。優先するのはBromoの型番重複照合と、Audient／Recording King一次出典の運用審査。運営者が解決する範囲とシステム側scope追加を分け、未承認のURL範囲を本PRで開放しない。元ヒント・審査状態は保持する。

## 検証・本番保護

- NEWS **2,192件PASS**（失敗・スキップ0）、両Worker dry-runビルドPASS。
- 追加11試験：4件の未確認入力→本人確認→既存候補保存→Ledger/API、再送、出典停止、takedown、既存判断、曖昧入力、既存facts・手動見出し・参考メモ保持、未対応7URLの拒否。
- 隔離Operatorの実画面PC1280px／390pxで4件全てが同一画面の最終確認へ進むことを確認。確認チェック初期OFF、確定せずキャンセル、フィルター保持、横はみ出しなし。
- 実画面は保存済み本番DBのローカル複製と既存隔離サーバーを使用。production用HMAC鍵は持ち出さず、複製pending行のfingerprint key IDのみ隔離用キーへ付け替えた。機械証拠・本番成功の新規証明には用いない。外部HTTPは遮断。
- 本番候補276、Ledger209、Webヒント84、実行11、検索9、source_state12、管理監査641の内容ハッシュ一致。両Workerと設定も一致。controlsのcollection/api/publicationは不変。revisionのみ1771→1772で、21:17 JSTの正常retention成功とpurge末尾のrevision加算を照合した。
- 本番記事判断・D1書き込み・配備・有限計画変更・追加有料探索なし。Acompass、沖仁・K.YAIRIを含む既存記事・判断・取得証拠を保持する。

## 次の運用

本PRを別承認で配備した後、まずIRISの試奏と関取花のQ&Aを原記事・日付・既存記事との違いに照らして判断する。USB録音マイクとMXR混合記事は関連性を本人が判断する。7件のscope追加は条件審査・承認を先に行い、掲載ボタンを表示させるためだけに許可を推定しない。
