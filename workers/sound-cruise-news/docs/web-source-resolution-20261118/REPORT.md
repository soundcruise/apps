# Web出典待ち7件の整理（0.73.0候補）

本番0.72.0のD1を読み取り、既存の対象URLを通常ブラウザーで照合した。Exa/Gemmaの追加実行・検索・本番設定変更・記事判断は行っていない。

|区分|現在の本番|修正後の隔離画面|
|---|---:|---:|
|掲載可|4|4|
|人間確認待ち|0|0|
|技術・出典対応待ち|7|6|
|編集判断・見送り候補|10|11|

**今回新たに掲載可へ進められた記事は0件。** Bromoの比較対象を具体化し、Audient・Recording Kingの事実整理と入力補助を準備した。未承認の出典条件を解除して件数を増やしてはいない。本番の区分は未変更。

## Bromo：4モデルは既存3記事と一致

[ギター・マガジンの記事](https://guitarmagazine.jp/news/2026-1116-buomo-guitars/)は表示公開日2026-11-16で、BAN1V・BAN2V・BAR2R・BAN4CE bkを扱う。通常閲覧で全型番を照合した。

|既存の承認済みNEWS|対象|記事公開日（NEWS保存値）|
|---|---|---|
|[BAN1V / BAN2V](https://www.kikutani.co.jp/news/bromo-guitars-ban1v-ban2v/) / `4da6343355cd02f54fe95fe8c908656f229550bfff410731987d96d43995bd15`|BAN1V・BAN2V|10/21 JST|
|[BAR2R](https://www.kikutani.co.jp/news/bromo-guitars-bar2r/) / `546b539e9b18ba861ffa27501ccbde21e9221d73373ecca460fd2c413efa2a7c`|BAR2R|10/21 JST|
|[BAN4CE bk](https://www.kikutani.co.jp/news/bromo-guitars-ban4ce-bk/) / `f093cec183b4001690fa53aed7822666a8ec743f5afa7e0ca96fc5c2295e3715`|BAN4CE bk|10/21 JST|

現状では同じ4モデルの紹介を改めて掲載する優先度は低い。後発記事に別仕様や新しい発売事実があるかは本人が比較して判断する。**モデル一致を正式な同一出来事の重複判定や非掲載へ変換しない。** 元Webヒントを通常審査に残し、編集判断区分から既存3記事を参照できるようにする。

対応関係は通常閲覧した検索見出しのhashと、現在の承認済みcandidate ID・URL・brand・完全なmodels集合で限定する。見出し変更・別モデル・新色、承認状態の変更、期限、出典停止、takedownがあれば旧対応を使わない。既存の見送りや別判断を上書きしない。

## Audient：二次2URLは国内3機種、一次発表は4機種

- [財経新聞の配信記事](https://www.zaikei.co.jp/releases/3713914/)：公開11/13 10:00。Hotone Japanの国内向けiD2・iD2+・iD4+、国内発売11/15。
- [Computer Music Japan](https://computermusic.jp/2026/11/id-desktop/)：公開11/13。同じ国内3機種を扱う。
- [メーカー一次発表](https://audient.com/news/2026/11/12/id-desktop-launch/)：公開11/12。iD1・iD2・iD2+・iD4+の4機種。iD2/2+/4+は供給開始、iD1は2027年初頭予定。国内の発売日と一次記事の公開日を区別する。

通常閲覧で対象と日付を確認した。2つの国内記事を2件の別製品ニュースとして加算せず、一つの一次発表を参照できるようにする。一次4機種と国内3機種の範囲は統合しない。正式な重複判断・ヒント削除・自動見送りはしない。

独自案は「Audient、録音向けiD Desktopシリーズ4機種を発表」。[audient-information.json](./audient-information.json)に既存assisted-draft形式で未確認入力を準備した。オーディオインターフェースを共通種別として追加し、カテゴリはrecording_audio（DTM・録音・配信）へ対応させる。保存済みタイトルに種別が明記されている場合だけ、未確認の入力補助として再利用する。

**残条件**：Audient一次ニュースURLは現在の人間確認用URL範囲・source registryにない。短い独自事実紹介＋出典＋直リンクの条件、個別連絡・制約の有無を確認し、限定した人間確認範囲の追加承認が必要。Bot取得や転載の許可とは別であり、本PRで開放しない。

## Recording King：11/2の一次発表を準備

[メーカー一次記事](https://recordingking.co/news/rk-standard-series/)は表示公開日11/2。RK Standard Series、オール単板で戦前の設計を意識したアコギであることを通常閲覧で確認した。国内販売日・国内価格は確認できていない。二次記事の掲載日・検索日時を発表日にはしない。

独自案は「Recording King、オール単板アコギ『RK Standard Series』を発表」。[recording-king-information.json](./recording-king-information.json)に既存assisted-draft形式の入力を準備した。アコギ種別は既存で対応できる。新しい製品parserは不要。

**残条件**：一次URLの独自紹介・直リンク条件と、人間確認範囲の追加承認。現在の二次出典を無条件に登録対象へ加えない。情報の有用性はあるが、11/2発表のため新着性の編集判断は必要。

## 出典条件と次の最小操作

現在のsource scope未承認と、法的な掲載禁止・個別許諾が一律に必要という判断は別である。今回の資料だけで法的禁止とも許諾済みとも断定しない。出典条件・既存の個別連絡を審査し、以下2つの一次記事を「本文・写真・原見出し転載なし、短い独自事実紹介＋出典＋リンク、人間の明示確認」という範囲で扱う承認が得られれば、既存のassisted-entryへ限定接続できる。

1. Audientのニュース記事（今回の一次URLを含む限定した記事範囲）。製品種別の不足は本PRで解消する。
2. Recording Kingの公式ニュース記事。既存アコギ種別を利用する。

source registry・assistedSources・Bot条件は本PRで変更しない。両JSONは既存validatorで形式検証済みだが、現在の本番では正式保存できないので、開けると偽る入力リンクは生成しない。条件・範囲が承認された後、既存のassisted-draft-linkで入力済みリンクを生成できる。最終の本人確認・publicationValidation・Ledger/CASは維持する。

残るFender（AERA）、Yamaha業務用audio、加山雄三（MANTAN）の3件も現行の出典範囲外で保持する。今回の優先3ニュースの改善を口実に一括開放しない。

## 実装・検証

- 既存Web記事案・通常審査・詳細表示を再利用。新しいDB・登録エンジン・クローラー・有料処理なし。
- 詳細は既存の折りたたみ1つに収める。一次出典・同じ発表の別URL・既存NEWSへの参照を追加し、通常カードには短い停止理由だけを表示する。
- 保存済みAI案・更新日時・hint snapshotを上書きせず、通常閲覧の入力補助と正式証拠を区別する。原記事の日付は参照欄に示し、元ヒントの未確認公開日を正式値へ変更しない。
- 全**2,202件PASS**、両Worker dry-runビルドPASS。完全一致・別仕様・出典停止・takedown・既存判断・visibility CAS・許可範囲拒否・共通インターフェース種別の隔離保存を検証。人間確認由来を自動掲載適格にしない。
- 隔離OperatorのPC1280px／390pxでBromoの3記事参照、Audientの一次・別URL、RKの日付・残条件、追加の掲載ボタンが出ないこと、横はみ出しなしを確認。実画面用の複製DBのみfingerprint key IDを隔離用に変更し、本番HMAC鍵は持ち出していない。外部HTTPは遮断。
- 本番候補276、Ledger211、Webヒント84、Web実行11、検索9、source_state12、管理監査643の内容ハッシュ一致。両Worker・設定不変。controls revisionだけが通常retentionにより増加し、運用フラグは不変。本番D1書き込み・記事判断・配備・追加探索なし。

## MV360の実機報告

カテゴリは表示上の大分類、種別は見出し・正式facts検証に使う具体的な分類。MV360は「DTM・録音・配信」かつ「USBマイク」で矛盾しない。本番0.72.0の新規画面でUSBマイクの自動選択、ブランド・対象・日付・見出しの入力済み、確認OFFを読み取り確認した。利用者のスクリーンショットは現行と選択肢が異なり、旧画面が残っている可能性があるが、iPhone内の原因を確定したとは扱わない。入力済みリンクから開き直せば新しい選択肢が利用できる。今回Mic用の本番設定・記事は変更していない。
