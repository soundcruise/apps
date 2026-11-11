# 記事案の自動入力受入（0.63.0候補）

基準main: 7884cd584b897b65cefdcffeea731c82882ba810（本番0.62.0）。本番70ヒント・32 AI案を読み取りで確認し、公開済みAcompass 60以外の一致する正式候補・一覧receipt・AGM cacheはなかった。元のAI推定を変更せず、既存の表示投影・assisted-draft・人間確認・2クリック判断・Ledgerを再利用する。通常collector、出典条件、公開検証本体、自動掲載条件、探索計画は変更しない。

## 原因と最小変更

1. categoryの完全一致だけで種別を決めていたため、Guitar/musicなどから具体的な種別を引き継げなかった。保存見出しに明示された主対象だけを分類案に使い、混在・矛盾は警告する。サイト名の「アコースティックギター」を本文の主製品種別に流用しない。ギター関連記事とエレキギター・ベース関連を共通の人間確認種別へ追加。
2. 限定・周年などは出来事を無条件に空欄にしていた。先行紹介と、区別できる限定数／周年／シグネチャー／復刻弾の紹介を表現する。発売済み・通常モデル発売へ変換しない。新色名などを特定できない場合は保留を維持する。任意qualifierは既存facts JSONに保存し、topic identityにも残して別の発表を混同しない。migration不要。
3. 公開日は32案の保存検索情報にはなく、一覧receipt／有効cacheから補完できる対象もなかった。更新日時・URLの数字から補わない。既存の正式候補は再登録せず参照する。
4. 自動見出しは訂正時に消えるだけだった。既存のread-only assisted-draftで再生成し、最新の入力だけを反映する。手動編集・古い応答は上書きしない。追加AI呼出は0回。

## Deviserの入力結果

今回の運営者提供情報を既存version 1の確認用情報として読み込む。原記事をBot取得した証拠ではない。

| 項目 | 下書き入力 |
| -- | -- |
| ブランド | Bacchus |
| 対象 | Handmade Series／Unique Series |
| 種別 | エレキギター・ベース関連 |
| 出来事 | 先行紹介 |
| 公開日候補 | 2026-11-06 |
| 発表の区別 | One Day Guitar Show 2026／限定モデル |
| 自動見出し | Bacchus、Handmade Series／Unique Seriesを先行紹介（One Day Guitar Show 2026／限定モデル） |

見出しは既存検証が必要とする主体・対象名を含む独自表現とした。原見出し・本文の転載なし。原記事確認・紹介条件・掲載判断は未選択で、入力補助を正式取得証拠にしない。

**提供情報は本番DBには存在しない。** `test/fixtures/deviser-draft-information.json` と既存の `scripts/assisted-draft-link.mjs` で、導入後のOperator向けリンクを生成できる。最初のリンクを開くと読み込まれ、同じタブでは通常のassistedUrlリンクへ戻っても再入力不要。記事URL専用のruntime分岐はない。未反映の本番0.62.0では新しい種別／出来事を受け入れられないため、先にクリックする運用にはしない。

Deviser通常collectorはOFF・discoveryValid=false。今回の情報で入力補助を成立させられるため追加の原記事HTTP取得を行わなかった。OFFを法的なBot禁止と同一視せず、既存の正規取得・保存条件が成立していないことと区別する。Yamahaへの直接Bot取得も0件。

## 人間判断待ち8件の比較

主要6項目はブランド・対象・種別・出来事・公開日・独自見出し。入力済みは正解率／正式検証の成立を意味しない。仕様区別qualifierやURLを数に上乗せしない。

| 記事 | 0.62.0 | 保存済み情報だけの改善後 | 今回の提供情報読込み後 | 残る確認 |
| -- | -- | -- | -- | -- |
| [Deviser Bacchus](https://www.deviser.co.jp/information/626551) | 2/6 | 2/6 | 6/6 | 保存情報に公開日・具体的シリーズ・先行紹介はない。提供情報を読み込み、本人が原記事と紹介条件を最終確認 |
| [Eastman／Bourgeois](https://acousticguitarmagazine.jp/gears/eastman-1/) | 2/6 | 5/6 | 追加情報なし | 新たな協業発表とはせず関連記事として紹介。日付・対象と記事の新規性を確認 |
| [Mukae工房訪問](https://www.shimamura.co.jp/update/shops/hakata/guitar-bass/36609/) | 2/6 | 5/6 | 追加情報なし | 工房訪問と製品発売を区別。一般的なAI対象名を原記事で確認 |
| [K.Yairi RF-65](https://shop.jeugia.co.jp/c/gr2/gr3/gr6/4580393205665-49) | 2/6 | 5/6 | 追加情報なし | 限定100本の案は新着の証明ではない。原記事日付と発売時期を確認 |
| [Martin浜田省吾](https://www.shimamura.co.jp/update/shops/hamakita/guitar-bass/80633/) | 5/6 | 5/6 | 追加情報なし | 対象名・シグネチャーの区別を改善。記事日付と具体的型式を確認 |
| [LL56三木200周年](https://www.mikigakki.com/shop/g/gsa260113ll56ctm200/) | 3/6 | 5/6 | 追加情報なし | 保存AIのMIKIは残し、Yamahaへの自動補正をしない。メーカーと販売店・日付を原記事で確認 |
| [Gibson100周年](https://gibson.jp/news-events/27491) | 3/6 | 5/6 | 追加情報なし | 100周年を区別。具体的モデル名・公開日を確認 |
| [鈴木バイオリン復刻](https://www.chunichi.co.jp/article/839468) | 2/6 | 3/6 | 追加情報なし | 復刻第2弾を区別。アコギかエレキかは見出しだけでは確定せず種別・日付を確認 |

保存情報だけで8案の合計は21→35欄、提供情報を含めると39欄。正式保存未対応の7出典URLの範囲は変更していない。関連記事の提案値も詳細から確認できるが、新しい公開権限にはしない。

## 32案すべての比較

保存情報のみで94→117欄、入力欄が増えたのは11案。Deviser提供情報を加えた場合121欄。全案に同じ投影を適用し、古い記事・重複・一般ページの審査区分を変えない。新規の探索結果も同じ保存済みestimateと型付きmetadataから生成する。

| 記事URL | 入力欄 変更前→変更後 | 公開日候補 |
| -- | -- | -- |
| [歌声もギターも、ありのままの響きで ── ヤマハがシンガーソングライターのための新型アンプ「Acompass 60」を発表 – Vethel](https://vethel.media/archives/20596/) | 3→3 | 未確認 |
| [進化を続ける国産Bacchusフラッグシップモデル【ディバイザーワンデイ2026】 ／ Deviser ｜株式会社ディバイザー｜長野県松本市のギターメーカー](https://www.deviser.co.jp/information/626551) | 2→2 | 未確認 |
| [シンガーソングライターの歌声とアコースティックギターの自然な響きを忠実に再現　ヤマハ アコースティックギターアンプ『Acompass 60』 - 産経ニュース](https://www.sankei.com/pressrelease/prtimes/RSJW4JMPMJKSJGHUTJXZE2MBOE/) | 3→5 | 未確認 |
| [シンガーソングライターの歌声とアコースティックギターの自然な響きを忠実に再現するアコースティックギターアンプ『Acompass 60』を発売 - ニュースリリース - ヤマハ株式会社](https://www.yamaha.com/ja/news_release/2026/26110601/) | 3→5 | 未確認 |
| [大阪から全国、そして世界へ…！ 気鋭のギター・ブランド：Infiniteの全貌に ...](https://youngguitar.jp/gear/hi-end-music-infinite) | 2→2 | 未確認 |
| [エピフォンのInspired By Gibson Customシリーズより、ギブソンの名器を再現した6つのアコースティック・ギターが登場 ／ ギター・マガジンWEB｜Guitar magazine](https://guitarmagazine.jp/news/2025-0901-epiphone-inspired-by-gibson-custom-ag-2/) | 3→5 | 未確認 |
| [革新のEastman、Bourgeois Guitarsとともに feat.矢後憲太 ／ アコースティック・ギター・マガジンWEB](https://acousticguitarmagazine.jp/gears/eastman-1/) | 2→5 | 未確認 |
| [SeventySeven Guitars新シリーズ発売間近！！ ／ Deviser ｜株式会社ディバイザー｜長野県松本市のギターメーカー](https://archive.deviser.co.jp/en/seventyseven/content/2020422) | 3→3 | 未確認 |
| [2026年10月に登場したアコギ新製品まとめ - アコースティックギター博士](https://nihon-meisho.com/3718/) | 1→2 | 未確認 |
| [秦 基博×Gibson J-45｜モンタナ工房が手掛ける特別な100本限定シグネチャー ／ ギタセレ（Guitar Selection）](https://guitarsele.com/article/news/gibson-hata-motohiro-j-45-20251016/) | 2→2 | 未確認 |
| ["FUJII GUITARS"という哲学｜きっかけは"弾けなかった1本のギター。"『余計なことをしない』という設計思想｜ドルフィンギターズの中の人たち](https://note.com/dolphin_guitars/n/n9d6a578958ce) | 2→2 | 未確認 |
| [「アコギと出会う。」製作家工房訪問記 Vol.1【Mukae Guitars】 ｜ アミュプラザ博多店 - 島村楽器 Update!](https://www.shimamura.co.jp/update/shops/hakata/guitar-bass/36609/) | 2→5 | 未確認 |
| [ヤマハ、アコギ/エレアコの新モデル「FG7/FS7」シリーズを発表](https://news.mynavi.jp/article/20260919-4990579/) | 3→5 | 未確認 |
| [【限定100本】K.Yairi RF-65 sen-saiヤイリ アコースティックギター センサイ スタビライズド・ウッド【Stage-Guitar】 フォークギター 日本製 国産 ／ JEUGIA](https://shop.jeugia.co.jp/c/gr2/gr3/gr6/4580393205665-49) | 2→5 | 未確認 |
| [Momose ／ Deviser ｜株式会社ディバイザー｜長野県松本市のギターメーカー](https://www.deviser.co.jp/feature/2026-special-collections/momose) | 2→2 | 未確認 |
| [【アコースティックギター】Martin 浜田省吾シグネチャーモデル発売！ご予約受付中です。 ｜ プレ葉ウォーク浜北店 - 島村楽器 Update!](https://www.shimamura.co.jp/update/shops/hamakita/guitar-bass/80633/) | 5→5 | 未確認 |
| [ブロモ・ギターズが、ビンテージ味のあるパーラーや木目の美しいミニ・ジャンボなど、新モデル4種をリリース ／ アコースティック・ギター・マガジンWEB](https://acousticguitarmagazine.jp/2025-0926-bromo-guitars/) | 5→5 | 未確認 |
| [Kikuchi Guitars、フレイム・メイプル・ボディとカスタム・ハムバッカーを採用したフルアコを2機種発売 ／ ギター・マガジンWEB｜Guitar magazine](https://guitarmagazine.jp/news/2026-0824-kikuchi-guitars-jf15/) | 5→5 | 未確認 |
| [ヤマハ ／ FG/FS7シリーズ - 製品ラインアップ - FG/FSシリーズ - アコースティックギター - 製品情報 - ギター・ベース・アンプ - 楽器](https://jp.yamaha.com/musical-instruments/guitars-basses-amps/products/acoustic-guitars/fg-series/fg-7/lineup.html) | 3→3 | 未確認 |
| [LL56 Custom ARE -MIKI 200th Anniversary-: アコースティックギター｜三木楽器公式通販サイト](https://www.mikigakki.com/shop/g/gsa260113ll56ctm200/) | 3→5 | 未確認 |
| [日本製 アコースティックギター 在庫有ります！ ★](https://www.watanabe-mi.com/shopping.php/list/c1289/?page=1&s_o=4) | 2→2 | 未確認 |
| [シンガーソングライターの演奏表現を支える新たなハイエンドモデル　ヤマハ アコースティックギター『FG7』『FS7』 - ニュースリリース - ヤマハ株式会社](https://www.yamaha.com/ja/news_release/2026/26091801/) | 5→5 | 未確認 |
| [プロからも愛されたスタッフォードのSAD-2000が数量限定で復刻！ ／ アコースティック・ギター・マガジンWEB](https://acousticguitarmagazine.jp/2025-1016-stafford-sad-2000/) | 3→3 | 未確認 |
| [明快なサウンドと贅沢な装飾を再現　ヤマハ アコースティックギター『L-53 CUSTOM復刻モデル』 - ニュースリリース - ヤマハ株式会社](https://archive.yamaha.com/ja/news_release/2012/12030101.html) | 3→3 | 未確認 |
| [ギブソン・カスタムから、 フラットトップ・アコースティック製作開始から100周年を記念し、 クレモナ・バースト仕上げの限定アニバーサリー・モデル５種がリリース ／ Gibson Japan](https://gibson.jp/news-events/27491) | 3→5 | 未確認 |
| [Kikuchi Guitarsより、アーチトップ・ギターのシリーズが登場初回生産分のボディにはエキゾチック・ウッドを採用 ／ ギター・マガジンWEB｜Guitar magazine](https://guitarmagazine.jp/news/2025-1121-kikuchi-guitars-archtop/) | 3→3 | 未確認 |
| [Epiphone『Inspired By Gibson Custom』新作6モデル登場 ― ヴィンテージの名機を忠実に再現 ／ ギタセレ（Guitar Selection）](https://guitarsele.com/article/news/epiphone-inspired-by-gibson-custom-20250820/) | 5→5 | 未確認 |
| [ヤマハ ／ L-51 CUSTOM - アコースティックギター - 概要](https://jp.yamaha.com/products/musical_instruments/guitars_basses/ac_guitars/l-51_custom/index.html) | 3→3 | 未確認 |
| [70年代のギター復刻版第2弾、大府の鈴木バイオリン　「上品な高音、深みある低音」：中日新聞Web](https://www.chunichi.co.jp/article/839468) | 2→3 | 未確認 |
| [1月15日は「HD-115の日」 ／ Deviser ｜株式会社ディバイザー｜長野県松本市のギターメーカー](https://www.deviser.co.jp/information/137977) | 3→3 | 未確認 |
| [Syezo Acoustics - ドルフィンギターズ](https://www.dolphin-gt.co.jp/luthier/syezo-acoustics/) | 3→3 | 未確認 |
| [ABOUT ／ Syezo Acoustics シェゾアコースティックス](https://www.syezo-acoustics.com/about) | 3→3 | 未確認 |

## 根拠・確認・編集の境界

fieldSourcesに保存AI・検索見出しの分類案・検索公開日候補・提供情報・画面修正・見出し生成を区別し、reference/inputFieldとconfirmed=falseを表示する。元のestimate_json、検索メタデータ、正式provenanceを置換しない。許可済みcollectorの正式候補がある場合は既存候補・判断履歴を再利用する。

提供情報の発売予定・イベント等はnotesで確認できる。notesは正式factsへ自動保存しない。限定や発表のqualifierだけは明示された入力として既存factsへ保存し、最終確認後も人間確認証拠のまま。日時不明のイベントを記事公開日として補完しない。

既存の人間確認・利用条件・正式validation、CAS、takedown、重複、Ledgerの順序を維持。自動掲載はOFFであり、人間確認記事を機械取得済み証拠や自動学習教師へ格上げしない。

## 検証・本番導入

- 全2,046回帰PASS。通常collector・正式検証・Access/CSRF・Acompass既存掲載保護・期限付き有限探索を含む。
- 両Worker dry-run build PASS。新migrationなし。
- DeviserのローカルE2Eで、入力補助→本人確認を模した明示操作→正式candidate→Ledger→公開APIを確認。previewはproduct_article、electric_guitar_bassを維持し、同じqualified previewの重複・別発表の保護と自動掲載対象外を検証。
- PC／390px、6主要項目の初期入力・チェックOFF・訂正時の見出し再生成・手動編集保持・同一タブの再表示・既存2クリック掲載を隔離DBで確認。試験用の公開スイッチがOFFなら保存が拒否されることも確認。外部HTTP0件。有料推論0件。本番での実掲載成功とは扱わない。
- 本番main統合・配備・DB書込み・記事判断は実施しない。導入時は現在の11月13／16／18日08:30 JSTのGemma有限3枠・探索ON、手動OFF・B→A OFF・自動掲載OFFを引き継ぐ。
- 導入後、既存scriptで提供情報リンクを生成し、運営者が原記事・日付・紹介条件を確認して既存の2クリック判断へ進む。確認リンクを開くこと自体は保存や掲載ではない。

本番の最終読み取り（2026-11-11 10:27 JST）: NEWS/Operator 0.62.0の配備・設定・cronは不変、70ヒント・一致する既存候補・探索実行記録も作業開始時と一致。候補262、Ledger195、Shadow470、takedown3、公開API186件は直前の本番受入記録と内容ハッシュ一致。controlsの有効スイッチは不変、revisionのみ1557→1558（既存の毎時retentionもrevisionを増やす）。本作業から本番書込みなし。有限3枠の探索ON・Gemma4、手動OFF・B→A OFFを維持した。
