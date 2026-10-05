# Published NEWS Headline Quality Backfill Report

## Overall Verdict

PASS — 全公開外部59件を一次証拠と照合し、54件の見出しと表示用factsを本番訂正。50件にgeneric productTypeを保存。NEWS 684/684、Port NEWS 41/41、syntax、diff check、secret scan、両Worker build / deploy、本番API・通常版 / Pro版の実表示確認PASS。公開件数・日付・URL・status・Ledger・Shadow・source状態・人間判断を維持。

## 1. Starting State

2026-10-06 JST。main = origin/main = `a29b58332c474dfc2fd6664360c274d6f069045f`、ahead/behind 0/0、tracked/staged clean。既知untracked `.claude/`、`workers/sound-cruise-sync/node_modules/` は保持。

NEWS / Operator 0.20.6、Port 1.19.2。D1 candidate94件＝approved59 / pending13 / rejected22。公開API59件、Portは自社1件を加え60件。Ledger12、Shadow66、source_state11、operator feedback34、legacy grant20。IK / Sleepfreaks / ATの意図的collection停止、Natalieの停止・publication blockを維持。

## 2. Total Articles Reviewed

公開外部59件の全件を監査。A＝type / event確認52件、B＝typeのみ確認4件、C＝人物イベントの出来事確認2件、D＝安全に改善できる証拠不足1件。記事構造・本文の必要範囲・公式製品情報・既存の信頼できるstructured factsを照合。公開日と製品発売日は別々に扱った。

元記事取得がrobots解析不能・403・redirectになったものは回避せず停止。メーカー公式等の一次情報を個別に確認して補足できたものだけ採用。Jackson PC1-EはDのまま。廃止sourceの既存公開記事を今回だけ監査したことは、collectionの再開を意味しない。

全件の独自見出し・分類・証拠URL・確認時刻・取得可能だったページのresponse SHA-256・維持理由は [review manifest](data/published-headline-review-2026-10-06.json) に保存。原文見出し・記事本文・画像は転載しない。

## 3. Product Type Backfill

50製品記事に日本語種別へ対応するgeneric productTypeを保存。既存brand / models / topic / eventType等は書き換えず、product_facts内の `headlineQuality` に追加した。NULLだったfactsも、公開用の型情報だけを持ち、publication eligibilityの新しい証拠にはならない。

公開済み・candidate ID・source URLへ厳密に結び付いた表示用factsだけを使う。categoryから種別を推測しない。製品名別のruntime条件分岐はない。one-time manifestは確認済みデータであり、製品別parserルールではない。

## 4. Event Accuracy

発売と発売予定、発表と製品紹介、入荷と新発売を区別。代表例：ESP PA-MF-10は本文の発売日確認、BOSS EX-4は発売予定（未確認の「年内」を除去）、Yamaha FG7 / FS7は公式の10月発売予定、Yamaha FG7の池部記事は入荷情報。Gibson J-45はHi-Fi DNA搭載仕様、PRS Silver Skyはコラボカラー、Gretsch Bo Diddleyは復刻。ZOOM2件は既存firmware公開状態を変えず更新内容を明確化。

BのPlayer Fusion / ReSing Voices Vol 2 / VocAlign 7 / SINPHONICAは発売イベントを断定せず「製品情報」。既存の公開日・event_type・productEvent・releaseEventは維持し、検証済みの表示actionだけを追加。

## 5. Headline Rewrites

54件を短い独自見出しへ訂正。50件が製品種別追加、ほかは展示・競売・インタビューの具体的テーマ。メーカー・型番の正式な識別factsは維持し、共通の製品名部分を省略する場合も表示文字列だけを短縮した。

本文転載・publisher exact headlineコピーなし。通常の候補抽出、承認条件、duplicate判定、human learning、pending recoveryは変更しない。

## 6. Articles Left Unchanged

5件は見出し変更なし：Jackson PC1-E（D：証拠不足）、松本孝弘の機材展示と阿部学のworkshop（C：既に日時・内容が明確）、SHURE MV6 Gen 2とNovation FLpad（A：既に種別と発売予定日が明確）。この5件のfactsも変更しない。

## 7. Before / After Metrics

| Metric | Before | After |
|---|---:|---:|
| Published external articles | 59 | 59（本番確認済み） |
| Sufficiently clear headline | 11 / 59 (18.6%) | 58 / 59 (98.3%) |
| Ambiguous product type | 37 | 1 |
| Ambiguous event wording in headline | 17 | 1 |
| Launch event / timing still unverified (B) | 4 | 4 |
| Unchanged due to insufficient evidence | — | 1 |

手動評価基準は「明示的な製品種別・用途と、理解できる事実行為」。Interviewは具体的テーマが必要。人物記事ではproduct typeは対象外。重複する曖昧さは個別に数えた。「製品情報」は断定しない情報紹介という範囲であり、発売イベントを確認済みと数える意味ではない。

不明瞭だった48件中47件を改善（97.9%）、明瞭率+79.7ポイント。種別曖昧37→1（97.3%減）、出来事の見出し表現の曖昧さ17→1（94.1%減）。B4件の実際の発売時期・発売イベントは依然未確認であり、表現が明瞭になったことと、発売事実を確認できたことは別々に扱う。

## 8. Representative Before / After


| Article | Before (public) | After |
|---|---|---|
| 1 | ESP、PA-MF-10を発表 | ESP、シグネチャーピック「PA-MF-10」を発売 |
| 4 | Jackson、Flex A-Frame Standを発表 | Jackson、ギタースタンド「Flex A-Frame Stand」を発表 |
| 5 | BOSS EX-4 Effects Expander、年内発売予定 | BOSS、マルチエフェクター「EX-4」を発売予定 |
| 10 | Gibson J-45 StandardにHiFi DNA搭載仕様 | Gibson、アコースティックギター「J-45 Standard」にHi-Fi DNA搭載仕様が登場 |
| 21 | AHSがInstrument Xの1.0.1更新版を公開 | AHS、ソフトウェア「Instrument X」の1.0.1更新版を公開 |
| 26 | Yamaha、FG7 / FS7シリーズの新モデルを発表 | Yamaha、アコースティックギター「FG7 / FS7」を10月に発売予定 |
| 34 | リック・ニールセン、ギター演奏に関する話題 | リック・ニールセン、ギターなどの個人コレクションを競売へ |
| 41 | KORG、TM-1を発表 | KORG、チューナー・メトロノーム「TM-1」を発表 |
| 45 | 大石昌良、アコギ表現を語るインタビュー | 大石昌良、アコギでの作曲・アレンジを語るインタビュー |
| 48 | Harrison Audio、FLEX 10を発表 | Harrison Audio、USBオーディオインターフェース「FLEX 10」を発表 |
| 53 | MONSTER CABLE、電源タップ「MONSTER POWER 8000 / MONSTER POWER 8001」を発表 | MONSTER CABLE、電源タップ「MONSTER POWER 8000 / 8001」を発表 |
| 59 | Yamaha、YAMAHAFG7を発表 | Yamaha、アコースティックギター「FG7」の入荷情報 |

## 9. Regression Tests

- NEWS既存全suite + 新規65件：684/684 PASS（live外部取得を禁止し、mock + isolated local D1を使用）。
- Port NEWS：41/41 PASS。
- 新規テスト：generic types / events / 日付粒度 / 限定・仕様 / multi-model / XSS / 不十分証拠 / ID・URL結び付き / publication eligibility不変 / duplicate identity不変 / full-row CAS / legacy grant保持 / cache invalidation / 59件のmanifest整合。
- syntax、git diff --check、公開・Operator Workerのdry-run build PASS。
- approved以外、publication block / takedown対象、変更済みrowへの適用は拒否。collectionのみ停止された既存公開記事は保持。

旧Betaのexact legacy grantは見出し一致も検証するため、対象19件の既存grantのlabelだけをcandidateと一致させる。grantは作成せず、ID・source・URL・日付・category・digestは変更しない。公開許可の対象や条件は変更しない。inactive legacy sourceの実API保持も回帰テスト済み。

## 10. UI Verification

Portの実CSS・news-ui / news-articles / providerを使ったlocal renderingで確認（自社1＋外部59）。375px：46件が2行、14件が3行。393px：51件が2行、9件が3行。4行以上0、横overflow0、console error0。長い正式名称の3行は精度を優先。種別が早い位置に表示され、元のレイアウトを変更していない。

本番Proの375px / 393pxでもlocalと同じ行数分布。1280pxは56件が1行、4件が2行。各幅で横overflow0。通常版393pxも60件・全見出し一致・横overflow0。通常版 / Pro版 / Operatorともconsole warning / error0。実UIの全59原記事リンクとAPI sourceUrlが一致。アーティスト・イベントfilterは6件、AGM2件を含め正常。

## 11. Production Verification

2026-10-06 JST。tests/build PASS後に明示stage・commit・normal push。両NEWS Worker code-only deploy（--keep-vars）後、期限付きCAS planの54件を8件以内の7バッチで訂正。54件すべて成功。

- 公開NEWS Worker deployment: `f7d2a94c-db08-48ec-81e0-256cc4fd9459`。
- Operator Worker deployment: `24ace5ed-0399-4380-af86-e027d587325e`。
- 本番health: NEWS0.20.7、collection / publication / API ON。既存Cron `0 21 * * *` / `17 * * * *` を保持。
- 認証済みOperator UI: NEWS0.20.7、公開59 / 保留13 / 掲載可0 / 人間判断12。approve / reject / recheck / Shadow評価操作は実行していない。
- 公開API全ページ: 59件、54見出しがmanifestと一致、残り5件は不変。ID・sourceName・sourceUrl・publishedAt・category・publishable・eventEndsAt等、見出し以外の返却fieldは全件完全一致。重複ID0。ticker5件も訂正後見出しに一致。
- APIカテゴリ件数：recording_audio7 / acoustic_guitar8 / electric_guitar_bass13 / dtm_software11 / amps_effects14 / live_guitar3 / artist_guitar3。変更前と同じ。Portの自社1件は不変、合計60。

適用前snapshotはcandidate全94件、Ledger、Shadow、source_state、controls、takedowns、operator feedback、legacy grantsをローカルprivateファイルへ保存。適用直後とUI確認後のfresh snapshotを比較し、許可した54件のlabel / nested facts / provenance / review_revisionだけ、既存19grantのlabelだけ、controlsのcache revision +7だけが変わったことを確認。

全既存root product factsとその他candidate columnsは一致。変更しない5件・全pending13件・全rejected22件はrow全体が完全一致。Ledger12 / Shadow66 / source_state11 / feedback34 / takedowns2は件数・全内容が完全一致。legacy grant20件のID・source・URL・日付・category・digestは不変。新規candidate、削除、migrationなし。

news_admin_auditに54件の `headline-quality-backfill` / `verified_primary_presentation_only` を記録。teacher decision / Decision Ledgerではない。collection-disabled記事も公開維持、停止状態は不変。

## 12. Versions

NEWS / Operator 0.20.6 → 0.20.7（表示精度のpatch修正）。Portはコード・asset変更がないため1.19.2を維持。Access・secret・source config・scheduler・schema・migrationは変更なし。

## 13. Git

開始main / origin一致、tracked/staged clean。今回の実装・manifest・one-time admin tool・テスト・report・Worker patch versionの10ファイルだけを明示stage。実装commit `14d8b4a2`（`fix(news): backfill verified published headline quality`）をnormal push済み。

本番確認結果の追記はこのreportだけのfollow-up documentation commit / normal pushへ保存する。禁止されたGit操作は使用していない。final main = origin/main、ahead/behind0/0、tracked/staged cleanはdocumentation push後に実測して最終返信で報告する。既知untracked `.claude/` と `workers/sound-cruise-sync/node_modules/` は保持。Port code / Pages専用変更なし、必要な2つのNEWS Workerだけをデプロイ。

## 14. Remaining Limitations

Jackson PC1-Eの1件は証拠不足で維持。B4件では発売時期・発表イベント未確認。公式・publisherが同じURLの内容や日付を更新する限界は今回解決しない。一次情報に種別が明示されないものをcategoryだけから補完しない。

今回のone-time backfillは将来の全新規記事を自動で改善するparser拡張ではない。公開用generic表示factsに限り使用し、学習・承認基準へ混ぜない。

### All 59 articles: classification / preserved source / reviewed result

| # | Class | Source evidence | Type / event / date | Reviewed headline | Decision / evidence note |
|---:|:---:|---|---|---|---|

| 1 | A | [shimamura](https://www.shimamura.co.jp/update/guitar-bass/2026/09/85289/) | signature_pick / release | ESP、シグネチャーピック「PA-MF-10」を発売 | 本文のシグネチュアピックと発売日9/26を確認。既存識別PA-MF-10を維持。 |
| 2 | A | [shimamura](https://www.shimamura.co.jp/update/guitar-bass/2026/09/87963/) | hybrid_guitar / announce | Fender、限定ハイブリッドギター「FSR American Acoustasonic Telecaster」を発表 | 本文にアコースティック／エレクトリック融合と限定生産。 |
| 3 | A | [shimamura](https://www.shimamura.co.jp/update/guitar-bass/2026/09/84675/) | cleaning_cloth / information | HISTORY、楽器用クロス「HSLC-1」の製品情報 | 本文でHSLC-1がシンセティックレザークロス。発売断定は行わない。 |
| 4 | A | [shimamura](https://www.shimamura.co.jp/update/guitar-bass/2026/09/85571/) | guitar_stand / announce | Jackson、ギタースタンド「Flex A-Frame Stand」を発表 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 5 | A | [shimamura](https://www.shimamura.co.jp/update/amp-effector/2026/09/87167/) | multi_effect_pedal / scheduled_release | BOSS、マルチエフェクター「EX-4」を発売予定 | マルチ・エフェクト・ペダルと「発売予定日：決定し次第」を確認。年内という旧fixtureの日付は採用しない。 |
| 6 | A | [shimamura](https://www.shimamura.co.jp/update/amp-effector/2026/09/81190/) | guitar_amp / release | VOX、ギターアンプ「AC MINI」を発売 | 本文のギターアンプと発売日9/26を確認。 |
| 7 | A | [kikutani](https://www.kikutani.co.jp/news/godin-century-maho-eq/) | acoustic_guitar / information | Godin、アコースティックギター「Century Maho EQ」の製品情報 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 8 | A | [shimamura](https://www.shimamura.co.jp/update/guitar-bass/2026/09/gs-701376/) | acoustic_guitar / announce | Martin、特別仕様のアコースティックギター「000JR E SHOGO HAMADA」を発表 | 本文の特別仕様アコースティックギター、浜田省吾モデル。表示モデル名は共通部分を短縮。 |
| 9 | A | [shimamura](https://www.shimamura.co.jp/update/guitar-bass/2026/09/69253/) | acoustic_guitar / announce | Headway、限定アコースティックギター「四季桜2026」を発表 | 記事主題とモデル欄で四季桜2026・限定アコースティックギターを確認。 |
| 10 | A | [ikebe](https://www.ikebe-gakki.com/blog/gibson-lrbaggs_hifi-dna/) | acoustic_guitar / spec_change | Gibson、アコースティックギター「J-45 Standard」にHi-Fi DNA搭載仕様が登場 | 9月後半入荷分からのピックアップ仕様変更。新製品発売にはしない。 |
| 11 | A | [ikebe](https://www.ikebe-gakki-pb.com/new_product/172573/) | guitar / reissue | Gretsch、限定ギター「G6138 Bo Diddley」を復刻 | 一次記事でギター・限定復刻。エレキ種別までは断定しない。 |
| 12 | A | [ikebe](https://www.ikebe-gakki-pb.com/new_product/172547/) | electric_guitar / announce | Yamaha、シグネチャー・エレキギター「RS20MM」を発表 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 13 | D | [chuya](https://discover.chuya-online.com/20260925/94854/) | 既存facts・見出し維持 | Jackson PC1-E、Phil Collenシグネチャーモデル | 元記事はrobots解析不能で取得停止。公式ページはモデル／シグネチャー仕様を確認できるが、今回の発売出来事と種別の明示が不十分。変更しない。 |
| 14 | B | [chuya](https://discover.chuya-online.com/20260925/94325/) | electric_guitar / information | Fender、限定エレキギター「Player Fusion」の製品情報 | 元記事の自動取得は中止。メーカー公式で限定モデルとElectric Guitarマニュアルを確認。発売時期は未確認のため製品情報。 |
| 15 | A | [shimamura](https://www.shimamura.co.jp/update/amp-effector/2026/09/84780/) | expression_pedal / announce | Xotic、エクスプレッションペダル「XXP-1」を発表 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 16 | A | [shimamura](https://www.shimamura.co.jp/update/amp-effector/2026/09/80794/) | pedal_power_supply / announce | CAJ、ペダル用電源「AC/DC Station VII」を発表 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 17 | A | [shimamura](https://www.shimamura.co.jp/update/amp-effector/2026/09/83690/) | tube_di / announce | KHAN AUDIO、真空管DI「9VDI」を発表 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 18 | A | [ikebe](https://www.ikebe-gakki-pb.com/new_product/172586/) | wah_pedal / announce | JAM Pedals、ワウペダル「Wahcko mk.2」を発表 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 19 | A | [ikebe](https://www.ikebe-gakki-pb.com/new_product/172516/) | effect_pedal / announce | MXR、グラニュラー／フランジャーエフェクター「M310 / M226R」を発表 | 記事のモデル欄でM310／M226Rとグラニュラー／フランジャー。複数モデル名を短縮表示。 |
| 20 | A | [sleepfreaks](https://sleepfreaks-dtm.com/dtm-materials/lunacy_nova/) | instrument_library / release | Lunacy Audio、音源ライブラリ「NOVA」を発売 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 21 | A | [ahs](https://www.ah-soft.com/inst-x/setup/) | software / update | AHS、ソフトウェア「Instrument X」の1.0.1更新版を公開 | メーカー更新履歴1.0.1。ソフトウェアであることも製品説明で確認。 |
| 22 | A | [hookup](https://hookup.co.jp/blog/1606531) | plugin / release | Rupert Neve Designs、プラグイン「Portico II MBP / 551 / 542」を発売 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 23 | A | [sonicwire](https://sonicwire.com/news/blog/2026/09/centerone3) | stereo_plugin / update | Leapwing、音像調整プラグイン「CenterOne 3」を更新 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 24 | A | [sonicwire](https://sonicwire.com/news/blog/2026/09/dotec-audio-5-deemultiwider) | stereo_imager / announce | DOTEC-AUDIO、ステレオイメージャー「DeeMultiWider」を発表 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 25 | B | [ik](https://www.ikmultimedia.com/news/?item_id=19792) | voice_pack / information | IK Multimedia、追加ボイスパック「ReSing Voices Vol 2」の製品情報 | 一次ページdescriptionは追加英語ボイスを明記。発売出来事を断定せず製品情報。 |
| 26 | A | [yamaha](https://jp.yamaha.com/products/musical_instruments/guitars_basses/ac_guitars/fg_series/fg_7/index.html) | acoustic_guitar / scheduled_release / 2026-10 | Yamaha、アコースティックギター「FG7 / FS7」を10月に発売予定 | メーカー製品ページでアコースティックギター、2026年10月発売を確認。公開日9/18とは分離。 |
| 27 | A | [kikutani](https://www.kikutani.co.jp/news/shinsyu-guitar-2026/) | exhibiting | キクタニ、信州ギター祭り2026にVincitaを出展 | 出展者キクタニとVincitaを確認。開催告知／新発売にしない。保存公開日を維持。 |
| 28 | B | [sleepfreaks](https://sleepfreaks-dtm.com/dtm-materials/vocalign-7/) | vocal_plugin / information | Synchro Arts、ボーカル編集プラグイン「VocAlign 7」の製品情報 | 本文でSynchro Artsとボーカル編集プラグイン。製品紹介を新発売と見なさない。 |
| 29 | A | [sleepfreaks](https://sleepfreaks-dtm.com/dtm-materials/luna-3/) | daw / update | Universal Audio、DAW「LUNA 3」を更新 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 30 | B | [sleepfreaks](https://sleepfreaks-dtm.com/softsynth/sinphonica/) | orchestral_instrument / information | IK Multimedia、オーケストラ音源「SINPHONICA」の製品情報 | 元記事はredirectで停止。メーカー公式でオーケストラ音源を確認。ニュースの発売時期は断定しない。 |
| 31 | A | [sleepfreaks](https://sleepfreaks-dtm.com/dtm-materials/lava-studio/) | smart_amp / early_sale | LAVA MUSIC、スマートアンプ「LAVA STUDIO」を国内先行販売 | 一次記事の国内先行販売とスマートアンプを確認。 |
| 32 | A | [zoom](https://zoomcorp.com/ja/jp/news/tca-1_v110/) | timecode_adapter / firmware | ZOOM、タイムコード・アダプタ「TCA-1」のファームウェア 1.10を更新 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 33 | A | [zoom](https://zoomcorp.com/ja/jp/news/h2essential_v210/) | handy_recorder / firmware | ZOOM、ハンディレコーダー「H2essential」のファームウェア 2.10を更新 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 34 | A | [amass](https://amass.jp/192113/) | guitar_collection_auction | リック・ニールセン、ギターなどの個人コレクションを競売へ | 一次記事主題は私物コレクションのオークション。ギター演奏ニュースではない。 |
| 35 | A | [ikebe](https://www.ikebe-gakki-pb.com/new_product/172605/) | electric_guitar / announce | Ibanez、限定エレキギター「j.custom RG8570EM-NT」を発表 | 一次記事の限定モデルとメーカー公式のElectric Guitars製品分類を照合。NEWS categoryによる推測ではない。 |
| 36 | A | [ikebe](https://www.ikebe-gakki-pb.com/new_product/172597/) | booster_pedal / announce | Fortin Amplification、シグネチャー・ブースターペダル「3.33」を発表 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 37 | A | [ikebe](https://www.ikebe-gakki-pb.com/new_product/172505/) | guitar / announce | Epiphone、シグネチャー・ギター「Joan Jett Olympic Special」を発表 | 一次記事本文のロックンロール・ギターとJoan Jettモデル。エレキ種別を追加推測しない。 |
| 38 | A | [ikebe](https://www.ikebe-gakki-pb.com/new_product/172492/) | distortion_pedal / announce | KORG、歪みペダル「Nu:Tekt HIGH GAIN OD」を発表 | モデル説明の歪み／High Gain、エフェクターペダルを確認。DIYと完成品の違いを発売見出しに混ぜない。 |
| 39 | A | [ikebe](https://www.ikebe-gakki-pb.com/new_product/172475/) | bass_effect_pedal / announce | KORG、ベース用エフェクター「Nu:Tekt BD-S」を発表 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 40 | A | [ikebe](https://www.ikebe-gakki-pb.com/new_product/172417/) | octave_pedal / announce | KLOWRA、オクターブペダル「Leap Octave」を発表 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 41 | A | [ikebe](https://www.ikebe-gakki-pb.com/new_product/172461/) | tuner_metronome / announce | KORG、チューナー・メトロノーム「TM-1」を発表 | 本文のチューナー機能・メトロノーム機能を確認。別売マイクを本体種別に使わない。 |
| 42 | A | [ik](https://www.ikmultimedia.com/news/?item_id=19753) | amp_effect_modeler / announce | IK Multimedia、アンプ・エフェクトモデラー「TONEX Board」を発表 | 一次ページmetadataのlaunchと公式製品本文のアンプ／エフェクトモデリング機能を確認。「発売」断定を「発表」に修正。 |
| 43 | A | [ik](https://www.ikmultimedia.com/news/?item_id=19651) | software / update | IK Multimedia、ソフトウェア「TONEX 2.0」を更新 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 44 | C | [manual-ikebe](https://www.ikebe-gakki.com/blog/20261013-1101-tak-matsumoto/) | 既存facts・見出し維持 | 松本孝弘、10月13日〜11月1日にイケシブSHOWCASE（渋谷）で使用ギター・機材展示 | 使用機材展示・開催期間・会場が既に明確。既存の信頼できるイベントfactsと一次記事で照合。変更なし。 |
| 45 | A | [agm](https://acousticguitarmagazine.jp/interview/2026-0909-oishi-masayoshi/) | interview | 大石昌良、アコギでの作曲・アレンジを語るインタビュー | 記事リードでアコギの作曲・アレンジというインタビューテーマを確認。 |
| 46 | A | [agm](https://acousticguitarmagazine.jp/interview/2026-0824-takeuchi-annna/) | interview | 竹内アンナ、作曲とアコギのアレンジを語るインタビュー | 記事リードで作曲・コードメイク・アコギアレンジを確認。 |
| 47 | C | [ikebe-event](https://www.ikebe-gakki.com/blog/20261024-eg-workshop/) | 既存facts・見出し維持 | 阿部学、10月24日にイケシブでギターワークショップ | 既存ワークショップfactsと一次ページの日時・会場を照合。既に明確、変更なし。 |
| 48 | A | [at-distribution](https://atdistribution.net/information/1047/) | usb_audio_interface / announce | Harrison Audio、USBオーディオインターフェース「FLEX 10」を発表 | 一次記事でUSBオーディオインターフェースと製品発表。予定時期の月末を実際の発売と断定しない。 |
| 49 | A | [shimamura](https://www.shimamura.co.jp/update/guitar-bass/2026/10/89963/) | acoustic_guitar / announce | Gibson、特別仕様のアコースティックギター「SJ-200 / Hummingbird」を発表 | 本文のアコースティックギターと特別材仕様。既存productEventを保持。 |
| 50 | A | [shimamura](https://www.shimamura.co.jp/update/guitar-bass/2026/10/89868/) | electric_guitar / collaboration_color | PRS、エレキギター「Silver Sky」にコラボカラーが登場 | 一次記事コラボカラー、メーカー公式Electric製品ページを照合。 |
| 51 | A | [shimamura](https://www.shimamura.co.jp/update/dtm-recording/2026/10/90252/) | 既存facts・見出し維持 | SHURE、USBマイク「MV6 Gen 2」を10月22日に発売予定 | 既存のUSBマイク・10/22発売予定が明確。一次記事で再確認、変更なし。 |
| 52 | A | [shimamura](https://www.shimamura.co.jp/update/guitar-bass/2026/10/89944/) | electric_guitar / scheduled_release / 2026-10-09 | Yamaha、シグネチャー・エレキギター「RS20MM」を10月9日に発売予定 | 一次記事の発売日10/9とメーカー公式電気ギター／シグネチャーを照合。 |
| 53 | A | [ikebe](https://www.ikebe-gakki-pb.com/new_product/172649/) | power_distribution / announce | MONSTER CABLE、電源タップ「MONSTER POWER 8000 / 8001」を発表 | 既存の電源タップfactsを保持。表示名の共通部分のみ短縮。 |
| 54 | A | [ikebe](https://www.ikebe-gakki-pb.com/new_product/172640/) | distortion_pedal / release | Fulltone、日本限定の歪みペダル「Silver Limited Edition OCD V2 / GE」を発売 | 既存の歪みペダル・日本限定・発売を保持。表示名の共通部分のみ短縮。 |
| 55 | A | [shimamura](https://www.shimamura.co.jp/update/guitar-bass/2026/10/90845/) | electric_guitar / announce | Gretsch、限定エレキギター「G6136TGQM-59」を発表 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 56 | A | [shimamura](https://www.shimamura.co.jp/update/dtm-recording/2026/10/91045/) | 既存facts・見出し維持 | Novation、パッドコントローラー「FLpad」を10月9日に発売予定 | 既存のパッドコントローラー・10/9発売予定が明確。一次記事で再確認、変更なし。 |
| 57 | A | [ikebe](https://www.ikebe-gakki-pb.com/new_product/172671/) | audio_interface / release | Universal Audio、オーディオインターフェース「Volt Gen 2」を発売 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 58 | A | [kikutani](https://www.kikutani.co.jp/news/kikutani-kdp-88p/) | digital_piano / announce | KIKUTANI、折りたたみ式電子ピアノ「KDP-88P」を発表 | 記事主題・モデル欄・製品説明の明示情報を照合。 |
| 59 | A | [ikebe](https://www.ikebe-gakki-pb.com/new_product/172734/) | acoustic_guitar / arrival | Yamaha、アコースティックギター「FG7」の入荷情報 | 本文の主な出来事はピックアップ搭載機の入荷。発売／発表と混同しない。FG7の表示名だけ正規化、元識別子は保存。 |

### Final YES / NO

| Check | Result |
|---|:---:|
| all published articles reviewed | YES |
| verified product types backfilled | YES |
| category used as sole product-type evidence | NO |
| event accuracy verified | YES（断定可能なものを確認、B4件は製品情報、D1件は維持） |
| unsupported facts guessed | NO |
| ambiguous headlines substantially reduced | YES |
| public article count changed | NO |
| human teacher data changed | NO |
| AGM Interview articles preserved | YES |
| all tests pass | YES |
| mobile UI verified | YES（本番375 / 393px） |
| production verification passes | YES |
| Git safety followed | YES |
