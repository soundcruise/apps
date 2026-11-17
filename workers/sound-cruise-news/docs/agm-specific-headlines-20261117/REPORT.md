# AGMの人物・主題・記事形式と独自見出し（0.71.0候補）

調査：2026-11-17 13:55〜14:10 JST。本番はNEWS／Operator 0.70.0。main基準 `29116e5dad269ae5b66403a0fc31d7bae73c215b`。本番は読み取りのみ。公開API193件、全approved行201件（期限などを含むためAPI件数とは別）。AGM候補51件、承認済み46件、AGM Ledger59行。

## 原因と証拠

対象は[関取 花の歌い方Q&A](https://acousticguitarmagazine.jp/column/2026-1111-sekitori-hana-utatte-nandakke/)。候補IDは `eaa0693b0f6707b46498cb209d523de3763fd3ce3b0d0a3debcc47613feb4e7e`。保存済みfactsは `agm_permission_metadata_v1` / Column / `topic=singing` のみで、person・focus・formatがなく、facts_provenanceはNULL。公開日保存値は2026-11-11T10:00Z、承認は同日23:15Z、revision1。保持されている本文取得キャッシュに当該記事はない。

1. RSSの人物抽出はタグとの完全一致に加えて、名前直後を「が」「、」などに限定しており、「に聞く」に非対応だった。日本語姓名の空白正規化もなかった。原題の「関取 花に聞く」を再現入力してこの欠落を確認した。当時のRSS本文・タグは保持されていないので、過去のタグ内容までは断定しない。
2. 「弾き語り」に最初に一致した広いtopicを採用し、歌い方やQ&Aの固有情報を保存する欄・抽出がなかった。詳細記事parserも同じ主語構文に非対応だった。
3. Columnでは人物がなくても広いtopicから「読みものを公開」を生成できた。publicationValidationは有効なテンプレート見出しがあれば具体性不足として止めなかった。RSS段階で見出しが成立したため、本文からの復旧へ進む必要も生じなかった。

原記事は通常ブラウザーで確認。可視の原題・導入が関取 花と弾き語りの歌い方を主題とし、導入にQ&A形式が明記され、本文にQ1/A1以降の質問・回答見出しがある。URLスラッグやプロフィールから人物・話題を推測していない。

## 共通修正

- `agm-editorial-subject.js`：主題を示す原題と導入の両方で人物を照合。「に聞く／が語る／が選ぶ」等に対応。日本語姓名の空白を統一、英語の姓名の空白は保持。共同主題は最大3人、導入に全員が存在する場合のみ採用。関連記事・プロフィール・URLは人物の根拠にしない。
- 詳細parserを `agm-article-9` に更新。歌い方は原題・導入・質問見出しで照合し、Q&Aは明示語と質問、または複数の質問・回答構造から判定。ColumnというカテゴリだけでQ&Aやインタビューと決めない。アルバム選出も原題・導入の双方で確認する。
- 新解析の `agm-specific-1` は具体テーマ・モデル等を求める。広い弾き語り・アコギ・宅録だけのColumnや、対象機材のないレビューでは汎用見出しへフォールバックしない。人物を確認できない製品記事へ人物を付けない。
- 未判断／再審査の旧factsにも掲載時の具体性を確認する。不足は既存の `facts_incomplete` と人間確認へ渡す。削除・正式非掲載・推測補完はしない。既存の取得枠・再確認予算・許諾・collectorの取得処理は不変。
- 新しいperson・people・focus・format・labelPolicyは同じURL・v9・応答hashのprovenanceで照合。既存の成功したv4〜v8証拠はその版のまま利用し、証拠を新取得済みと偽装しない。
- 書籍・公演・音源発表の既存専用判定を維持。人物・テーマ不足は既存の候補IDで人間確認できる（確認チェック初期OFF、本人確認後に既存CAS／Ledgerへ）。

隔離生成結果：**関取花、弾き語りの歌い方についてQ&A形式で語る**。

## 本番の抽象的定型見出し10件

広い主題＋定型文という再現可能な棚卸しで10件（9 Column、1試奏）。10件すべて公開API内。現行見出しをすべて不適切と断定するものではなく、具体化のレビュー対象。各ページの主題は通常ブラウザーで再確認した。以下の訂正案は未適用で、記事の日付・掲載判断を変えない。

| 原記事 | 現行NEWS見出し | 確認できた具体的内容 | 改善案（未承認） |
|---|---|---|---|
| [関取花・歌い方](https://acousticguitarmagazine.jp/column/2026-1111-sekitori-hana-utatte-nandakke/) | ギター弾き語りをテーマにした読みものを公開 | 関取 花、歌い方、バンドとの違い・リズム・声などのQ&A | 関取花、弾き語りの歌い方についてQ&A形式で語る |
| [NEW GEAR SOUND CHECK](https://acousticguitarmagazine.jp/gears/2026-1110-new-gear-sound-check-110/) | アコースティック・ギターの試奏・レビュー記事を公開 | 井草聖二による9製品の試奏動画。PR表記あり | 井草聖二が9製品を試奏、演奏動画とレビューを公開 |
| [森大翔・アルバム選出](https://acousticguitarmagazine.jp/column/2026-1021-mori-yamato-meiban/) | 森 大翔、ギター弾き語りをテーマにした読みものを公開 | 本人が弾き語りの参考になる5作品を選出 | 森大翔、弾き語りの参考にしたアルバムを紹介 |
| [関取花・アルバム選出](https://acousticguitarmagazine.jp/column/2026-1016-sekitori-hana-meiban/) | 関取 花、ギター弾き語りをテーマにした読みものを公開 | 同じ企画で本人が5作品を選出 | 関取花、弾き語りの参考にしたアルバムを紹介 |
| [音楽制作入門33](https://acousticguitarmagazine.jp/column/2026-1008-ohitorisama-dtm-033/) | 自宅での音楽制作をテーマにした読みものを公開 | 文＝関口シンゴ、ひとりで演奏する際の表現方法 | 関口シンゴ、ひとりで演奏するギター表現について解説 |
| [眞名子新・アルバム選出](https://acousticguitarmagazine.jp/column/2026-1007-manako-arata-meiban/) | 眞名子 新、ギター弾き語りをテーマにした読みものを公開 | 本人が弾き語りの参考になる5作品を選出 | 眞名子新、弾き語りの参考にしたアルバムを紹介 |
| [音楽制作入門32](https://acousticguitarmagazine.jp/column/2026-0924-ohitorisama-dtm-032/) | ソロ・ギターをテーマにした読みものを公開 | 文＝関口シンゴ、メロディと伴奏を組み合わせる入門例 | 関口シンゴ、ソロギターのアレンジ入門を解説 |
| [トニーニョ・オルタ](https://acousticguitarmagazine.jp/column/2026-0917-toninho-horta/) | トニーニョ・オルタ、ギタリストとしての歩みをテーマにした読みものを公開 | 本人の経歴・作品をたどる解説。本人のインタビューではない | トニーニョ・オルタの作品とギタリストとしての歩みを解説 |
| [音楽制作入門31](https://acousticguitarmagazine.jp/column/2026-0908-ohitorisama-dtm-031/) | ソロ・ギターをテーマにした読みものを公開 | 文＝関口シンゴ、1本でメロディと伴奏を奏でるスタイルの説明 | 関口シンゴ、ギター1本でメロディと伴奏を奏でるスタイルを解説 |
| [音楽制作入門30](https://acousticguitarmagazine.jp/column/2026-0820-ohitorisama-dtm-030/) | アコギのピックアップをテーマにした読みものを公開 | 文＝関口シンゴ、ピックアップ搭載アコギのライン録音 | 関口シンゴ、ピックアップ搭載アコギのライン録音を解説 |

この10件の一括自動訂正はしない。4件（Q&A＋アルバム選出3件）は今回の共通テーマで生成可能な構造。その他の改善案は確認材料であり、今回すべての表現を新しい自動分類へ追加してはいない。製品レビューの機材数上限を変更していない。個別事例専用parserはない。

## 既存掲載の安全な訂正

既存 `scripts/backfill-published-headlines.mjs` にplan→1時間有効のdigest→完全行CAS→監査付きapplyがある。Operatorから承認済み記事を未判断へ戻したり、別候補として登録し直す必要はない。

従来の「全承認記事を一括レビュー・80件以下」のモードは現行201承認行では使えないため、最大8件の `explicit_targets` を追加。承認総数、対象ID・URL・旧label・日付・category・eventの一致、既存のtakedown／publication block、apply時の全行CASを維持する。AGMの既存Column等だけに、独立した管理用 `headlineQuality.kind=editorial` を追加。主題・人名・形式のレビュー証拠は対象原URLに限定し、自由な原文見出しは受け付けない。

[関取花1件の訂正提案](correction-proposal.json) は**本番未承認・未適用**。原factsはそのまま、表示用headlineQualityと付加provenanceのみ。候補ID・掲載日・承認者・承認時刻・既存Ledger／Shadow／教師データは維持し、候補revisionだけを更新し管理監査を追加する。公開APIの表示用読取にsource_idを含め、同じ出典への束縛を確認する。

将来の別承認後：本番の承認総数・対象行を再確認し、提案をレビューしたうえで既存スクリプトの `plan <manifest>` を実施。旧label→新labelとdigestを運営者が承認後に `apply`。変更後は候補ID・Ledger・公開APIの当該label、再適用で二重更新しないことを照合する。今回plan/applyを本番へ実行していない。直接SQL編集・再登録・掲載判断のやり直しは行わない。

## 検証・保全

- 原記事の原題とDOM構造＋本文を保持しない合成導入／質問fixtureで隔離再現。日本語人名の半角・全角・複数空白、英語名、共同主題、主題不在、関連リンク・プロフィールの除外を検証。
- Q&A／インタビュー／Column区分、人物なしの録音解説、汎用テーマ時の正式停止、候補保持と人間確認availability、v9の項目別proof欠落拒否を検証。
- 既存の通常再確認で対象のfactsを復旧し、formal validation PASS。弾き語りColumnの関連性に関する本人編集判断は引き続き必要なので、pending lifecycleの `HUMAN_REVIEW_REQUIRED` を維持する。自動掲載成功とは扱わない。
- 既存の書籍・新作・レビュー・公演・許諾・CAS・Ledger・takedown回帰を実行。実DBの承認済みAGM46件を基準版と比較し、factualLabel／公開表示labelの変更0件。旧parserの成功証拠は再取得・版の書換えをしない。
- 訂正経路は隔離DBで既存人間承認Ledgerを作成し、表示訂正→公開API反映→再送無変更を検証。takedown・出典公開停止・並行更新では更新しない。元facts・ID・承認時刻・Ledger／Shadowを保持。
- 本番AGM候補51件、Ledger59行、記事キャッシュ、controls、source_state、Web実行履歴、両Worker環境設定を前後照合し内容一致。公開記事・判断を変更していない。
- Gemma4／探索ON／手動OFF／B→A OFF／自動掲載OFF、11/18 08:30 JST最終枠を維持。取得範囲・頻度・予算・cron・他アプリに変更なし。有料API呼出なし。migrationなし。

最終回帰：2,178/2,178 PASS（追加20試験）。NEWS／Operator両WorkerのWrangler dry build PASS。公開API193件の前後内容も完全一致。本番統合・配備・過去記事訂正は別承認。本番の新見出し生成・新規掲載・表示訂正は未実証であり、ローカル試験と混同しない。
