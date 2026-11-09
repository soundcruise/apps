# Web探索の実用化・0.54.1候補

基準main: 4865c68f63ad31dd2a70721bb1945108c1beb31c。2026-11-09の保存済み新規12 URLを使用。新しい検索・推論・原記事取得は行わない。本番変更なし。

## 12 URLの利用可能性

| 対象 | URL | 現時点の扱い／次工程 |
|---|---|---|
| Yamaha Acompass 60 | https://www.yamaha.com/ja/news_release/2026/26110601/ | 有望。正式候補なし。newsroomの適用許可・公開日・正式facts証拠が必要 |
| 同製品の産経掲載 | https://www.sankei.com/pressrelease/prtimes/RSJW4JMPMJKSJGHUTJXZE2MBOE/ | 同じ出来事の転載候補。独立ニュース数に加算しない。正式採用の出典条件は未成立 |
| 同製品のVethel掲載 | https://vethel.media/archives/20596/ | 同じ製品・出来事の疑い。見出し・更新日が異なるため新しい自動抑止ではまとめない。独立一次証拠と数えない |
| Bacchus旗艦モデル | https://www.deviser.co.jp/information/626551 | 有望だが具体的なモデル／新仕様／公開日不明。registryに存在するが通常収集利用不可、Cを維持 |
| Martin Gram Parsons限定 | https://www.prnewswire.com/news-releases/martin-guitar-honors-gram-parsons-with-limited-edition-00-21-inspired-by-his-original-1963-martin-302930796.html | 限定モデル候補。日本語記事か未確認。出典登録・日付・正式factsが必要 |
| Gibson L-5復刻 | https://gibson.jp/news-events/27755 | メーカー発表候補。更新日は10/15だが公開日とは断定しない。出典条件・日付・facts待ち |
| Gibson Koaモデル | https://guitar-home.net/gibson-sj-200-elegant-koa-hummingbird-elegant-koa/ | 製品記事候補。更新日は10/7、公開日不明。一次情報と出典条件待ち |
| Gibson / Baggs HiFi DNA | https://guitarmagazine.jp/news/2026-1007-gibson-baggs-hifi-dna/ | 更新日は10/7、正式公開日不明。出典登録・新規性確認待ち |
| MOTU OctaLite | https://h-resolution.com/blog/motu-octalite/ | 既存候補6ed4f319…との同一出来事疑い。別URLを新規登録せず既存証拠と照合。推測で正式重複としない |
| UA Volt Gen 2 | https://hashout.jp/gadget/11852/ | 既存候補3999b432…との同一出来事疑い。別仕様・別発表を除外できる正式証拠が必要 |
| 島村アコギタグ一覧 | https://www.shimamura.co.jp/update/guitar-bass-tags/ag/ | 一般ページ。許可済み出典でも個別ニュースではない。候補化しない |
| DTM月別一覧 | https://www.dtmstation.com/archives/2026/10 | 一般ページ。候補化しない |

同一URLで正式登録済み0、現状の許可済み証拠のみで新規候補化可能0、既存候補との出来事重複疑い2、一般ページ2。それ以外も価値不足と断定しない。全件公開日メタデータnull。更新日／URL年月を公開日に置換しない。検索見出しだけでは記事の新着性・内容・日本語本文を証明できない。

## Yamahaの境界

検索サービスのタイトル・URLを未検証ヒントとして保持・参照する既存契約と、原見出しを正式NEWSに転載する許可は別。本文Bot取得は禁止を維持。Topicsでの個別条件を一般ニュースリリースへ拡張しない。newsroomのmetadata・直接リンク・定期配信に適用する条件は既存registerで未確認。法的に一律禁止と新たに断定するものでもない。正式採用には適用範囲の確認と、許可された正式証拠／既存の適用可能な人間確認契約が必要。新しい記事登録エンジンは追加しない。

## 限定修正とオフライン結果

- `qualifiedWebEstimate`で未検証の公開日を明記し、鮮度確定表現を安全な理由へ置換。分類の製品・価値推定は維持。正式factsへ変換しない。
- `hintSyndicationKey`は長い共通見出し冒頭、単一の同じ引用モデル、異なる出来事の明示がないこと、同じ更新ヒント日が揃う場合のみAI送信を保留。正式な重複却下ではなく`same_news_hint_unconfirmed`と参照先URLを保存する。
- 新色・限定・復刻・仕様変更を含む場合は抑止しない。異なる見出し・日付不明もまとめない。
- 実結果のYamaha公式と産経の組だけが一致。Vethelは維持。4分類対象が3対象になり得るが、実推論は再実施しておらず費用・品質改善の実測ではない。
- 固定fixtureとローカルD1で重複抑止・鮮度後処理・正式候補/Ledger無変更を検証する。

## 次の運用

定期再開前に、少なくとも価値のある1出典の適用条件と正式証拠の受け渡し先を確定する。検索回数を増やす代わりに、まず発見済みAcompassの利用範囲を確認する。通常collector、publicationValidation、池部優先、自動掲載OFF、Web探索OFFは維持。通常NEWSと既存の自動掲載read-only前向き評価はこの出典確認と独立して継続できる。
