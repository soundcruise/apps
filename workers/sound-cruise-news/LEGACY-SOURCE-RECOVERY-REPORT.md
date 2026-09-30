# Cruise Port NEWS Legacy Source Recovery Sprint Report

## Overall Verdict

**PARTIAL RECOVERY**。Ikebe・IK Multimediaを限定条件で本番復旧。Discover chuya・HookupはOFFを維持しました。Release Blocking：**0**。

## 1. Baseline

開始時実測：`HEAD = main = origin/main = 1acd9516`、branch `codex/news-blocked-source-recovery`、ahead/behind `0/0`。Port **1.7.0**、NEWS Worker **0.5.0**、掲載35件、既存baseline 1,833 PASS。作業worktreeは `news-1-5-release/Cruise_apps`。既存tracked変更2・staged 0・untracked 5の計7ファイルを保持しました。

## 2. Balanced Source Policy Applied

明示許諾の有無だけで停止せず、公式surface・robots・適用policy・低負荷・独立label・直接リンク・90日期限・停止/takedownを個別評価しました。内部承認はpublisherの許諾を意味しません。明示禁止、access control、opt-outを優先する既存gateを維持しています。

## 3. Ikebe

旧Beta最大の7件は、新製品情報局の公式listing・個別日付確認等による選定でした。今回は[固定新製品listing](https://www.ikebe-gakki-pb.com/new_product/)のみを使用し、main-host RSS・記事本文は取得していません。

判定：**ALLOWED WITH BOUNDS**。親サイトの会員/購入規約とPB関係を確認し、今回のfacts・リンク利用に適用される許諾必須条項は確認されませんでした。robots 404は当該hostのreview済み扱い。commercial expansion時の問い合わせは **PERMISSION RECOMMENDED**。

最終分類：discovered **16**、relevant **15**、useful **2**、AUTO **2**、REVIEW **13**、REJECT **1**。Xotic XXP-1・VOX AC MINIの製品発表を取得。BOSS EX-4の年内発売予定やfacts不足はREVIEW、店舗/中古/lesson/coupon等は除外します。既存topicとの重複6件を識別しました。

本番ON、healthy、failures 0。本番runはrobots＋listing **2 requests**、URL重複3、保存候補12、新規公開 **0**。AUTO 2件も既存Xotic・VOXと重複するため追加公開を抑止しました。今回合計 **8 requests**。

## 4. Discover chuya

旧Beta 3件の取得はmonthly listing・RSS・日付確認でした。保存済みrobotsは200・282 bytesの1行で、コメントとUser-agent/Disallowの境界を安全に確定できません。

[RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html)と保存responseで確認し、group境界の推測復元を行いませんでした。判定：**NEEDS EVIDENCE — robots format ambiguous**。publisherによる明示拒否とは判定していません。pilot未実施、OFF、今回 **0 requests**。

## 5. IK Multimedia

旧Beta 1件に使われた[公式Press](https://www.ikmultimedia.com/press/)を固定surfaceとして復旧。publication専用dateを取得し、promo終了日を公開日として使いません。

判定：**ALLOWED WITH BOUNDS**。[公式General Terms](https://www.ikmultimedia.com/legal/index.php?R=terms-and-conditions&PSEL=terms-and-conditions)を実読し、購入契約・software/documentationの義務と今回の公開Press facts利用を区別しました。今回のscopeに適用される自動収集/直接リンクの明示禁止や許諾必須条項は確認されませんでした。

開発pilotは12件、AUTO 2・REVIEW 2・REJECT 8。未知/基底モデルをREVIEWへ寄せた最終分類はdiscovered **12**、relevant **6**、useful **2**、AUTO **2**、REVIEW **4**、REJECT **6**。TONEX Board・SINPHONICAを識別し、ReSingの追加packを本体発売に言い換えません。重複topic 2件を識別しました。

本番ON、healthy、failures 0。本番 **2 requests**、URL重複1、保存候補5、新規公開 **1**：TONEX Board（2026-09-03）。SINPHONICAは既存のブランド未設定レコードと重複するため公開抑止。今回合計 **16 requests**。

## 6. Hookup

旧Beta 1件に使われた公式blog RSSだけをbounded pilot。232,192 bytes、discovered **100**、relevant **1**、useful **0**、AUTO **0**、REVIEW **1**、REJECT **99**、duplicate **1**。

RSS技術取得はPASSですが、製品factsを十分に確定できる新規AUTO候補がなく、総合Quality gateは未PASS。判定：**NEEDS EVIDENCE**。tutorial/interview/how-to/supportを除外し、oversized support feedの再取得なし。本番OFF、今回 **1 request**。

## 7. Quality Regression Gate

source/surface・日付・モデル根拠・event・独立labelを確認し、不足はREVIEW。genericな「製品情報」やevent不明を新規AUTO公開させないcollector/approval境界を追加しました。旧fixture 23件は不変です。

URL・製品facts・確認済み旧独立topicを使い、Xoticのfacts欠損とSINPHONICAのブランド欠損も重複防止に含めました。最終pending 16件の内訳はREVIEW 13、重複公開抑止中のAUTO候補3。未承認候補はNEWSへ出ません。

## 8. Label Quality

旧Sound Cruise独立labelを使い、同一topicの情報量低下を防止。BOSSは「BOSS EX-4 Effects Expander、年内発売予定」を保持し、Fender限定モデル・VOX小型アンプも情報を維持します。元見出しの復元ではありません。日付・リンクは変更していません。

本番照合でAHSに別製品labelが付くAPI表示不具合を検出。欠損factsと未登録辞書のundefined一致が原因でした。Workerを一時rollbackし、実在するfacts/辞書の一致だけを許可する **0.6.1**へ修正・再デプロイ。旧23件×欠損facts4種類、旧35掲載記事の全表示差分、旧41保存レコードの無変更を確認し、解消済みです。

## 9. Ticker Quality

7日対象がある場合は7日、なければ14日の既存期間条件を維持。期間内で具体的な独立labelを優先し、最大5件。実測5件はFender限定5種、Jackson PC1-E、Yamaha RS20MM、Gretsch限定復刻、Fender Player Fusion。低価値generic記事による上位占有を防ぎました。Yamaha FG7の9/18は対象外のままです。

## 10. Sources Newly Enabled

**Ikebe・IK Multimedia**。Evidence＋Technical＋Qualityを個別に通過した固定surfaceのみ。既存5sourceに加え、自動収集対象は **7source**です。

## 11. Sources Not Enabled

**Discover chuya・Hookup**は前記理由でOFF。SONICWIRE・Yamaha・AHS・Rolandの自動収集範囲は今回拡張していません。Natalieの既存内部停止も保持。Ikebe Saleは独立authorizationが未完了のためOFFです。

## 12. Production Article Changes

掲載 **35 → 36件**。追加は[IK Multimedia TONEX Board](https://www.ikmultimedia.com/news/?item_id=19753)の1件。既存記事の削除0、表示label強化3件（BOSS/Fender/VOX）、既存URL・日付・保存factsの変更0。Xotic・VOX・SINPHONICAの重複追加を抑止しました。

## 13. Current Source Distribution

| 表示source | 件数 |
|---|---:|
| 島村楽器 | 11 |
| 池部楽器 | 5 |
| Sleepfreaks | 5 |
| ZOOM | 3 |
| キクタニ / Discover chuya / SONICWIRE / IK Multimedia | 各2 |
| amass / Hookup / Yamaha / AHS | 各1 |
| 合計 | **36** |

表示12sourceには旧承認データも含まれます。自動収集ONの7sourceとは区別しています。

## 14. Coverage Impact

- **Gear**：33 → 34件。アコギ6、エレキ/ベース7、アンプ/エフェクター9。Ikebeの高価値製品surfaceを復旧。
- **DTM**：9件を維持。IK Press復旧、SINPHONICAの重複追加なし。
- **Recording**：3件を維持。新規拡張なし。
- **Sale**：0件、引き続きOFF。
- **Artist/Event**：各1件、既存状態を維持。

## 15. Publisher Request Counts

| source | 開発・調査 | 本番 | 合計 |
|---|---:|---:|---:|
| Ikebe | 6 | 2 | **8** |
| Discover chuya | 0 | 0 | **0** |
| IK Multimedia | 14 | 2 | **16** |
| Hookup | 1 | 0 | **1** |
| 合計 | **21** | **4** | **25** |

IKはpolicy redirectとhelper修正時の再取得もすべて計上しました。過去phaseの同日robots/policy証拠は再利用し、その過去request数は今回25件へ含めていません。tests/画面QAによるpublisher requestは0です。

## 16. Legal / Robots / Evidence

許諾必須・明示禁止の有無を適用scopeごとに評価し、evidence gateを維持。403/451・redirect・robots ambiguityの迂回なし。本文crawl、raw HTML保持、原見出し保存、publisher画像、OGPは0。URL queryはallowlistに限定し、SNS share本文を保存しません。news retention・kill/takedownを維持しています。

## 17. Tests

**1,855 PASS / 0 FAIL**：Port 887、Shared 226、Sync 393、Pitch 30、Fretboard 25、Rhythm 19、Chord 95、NEWS 180。開始baselineから22件追加。構文、`git diff --check`、scoped secret scanもPASS。全8suiteを実行し、修正後は影響するNEWS/Port suiteを必要な範囲で再確認しました。

## 18. Production Smoke

**PASS**。本番を375/393/1440pxで実レンダリングし、source・rich labels・カテゴリ・Ticker・ページング・リンク・90日期限・API停止/障害時の分離を確認。横はみ出し・page error 0。練習メニュー/カレンダー/チューナー/メトロノーム/Gear/My Apps/設定も確認しました。

7配信資産がreleaseとバイト一致、private Worker/secret pathは404。最終API旧35件の照合とAHS/BOSS/TONEXの375pxカード確認もPASS。新sourceを含む次回06:00 scheduled収集の実行観測はまだ行っていません。

## 19. Git / Deploy

Port **1.8.0**、NEWS Worker **0.6.1**。実装 `27b0e619`、欠損factsの重複防止 `a042bdbf`、label照合修正 `c19d05b7`。通常pushとGitHub Pages本番公開、NEWS Worker再デプロイ完了。

最終Worker version ID：`4e77c1ac-0aab-4601-bd4b-b6fd44e88898`、deployment ID：`bdd99ab6-d805-44a9-985f-6dd67e19b2d1`。毎朝06:00 JST収集・毎時17分retentionを維持。Sync Worker/D1、Account、AI Support、他4アプリのsource変更なし。

最終Gitはレポートを含むacceptance commitを通常push後、`HEAD = main = origin/main`、ahead/behind **0/0**。既存tracked変更2・staged 0・untracked 5を維持し、今回だけのnode_modules symlink 2本は除去。既存7ファイルのhash一致を確認。add全体/reset/clean/stash/force pushなし。

## 20. Remaining Gaps

chuyaの有効なrobots group/directive確認、Hookupの構造化製品facts、AHS/Roland parser、Saleは未完了。旧承認済みgeneric labelの一部は残っています。新規候補へのgate強化とTicker優先度で影響を限定しました。新sourceのscheduled runは次回以降の観測事項です。

## 21. Recommended Next Step

次は有効なrobots表現を確認できる場合のchuya復旧、またはHookupの代表製品factsを1ケースで補完する作業を推奨します。publisherへの連絡は実施していません。

## YES / NO

| 確認 | 結果 |
|---|---|
| Ikebe explicit permission required by verified policy | **NO** |
| Ikebe bounded pilot succeeded | **YES** |
| Ikebe production enabled | **YES** |
| chuya publisher explicitly blocks access | **NO** |
| chuya safe parser interpretation established | **NO** |
| chuya production enabled | **NO** |
| IK bounded pilot succeeded | **YES** |
| IK production enabled | **YES** |
| Hookup bounded pilot succeeded | **NO**（技術取得YES、Quality未PASS） |
| Hookup production enabled | **NO** |
| source enabled only to increase count | **NO** |
| rich labels preferred over generic duplicates | **YES** |
| generic empty labels can auto-publish | **NO** |
| evidence gate preserved | **YES** |
| explicit publisher restrictions preserved | **YES** |
| robots/access controls preserved | **YES** |
| raw HTML stored | **NO** |
| original publisher headlines stored | **NO** |
| publisher images stored | **NO** |
| all tests pass | **YES** |
| production smoke passes | **YES** |
| Git safety followed | **YES** |
