# Final Pending Resolution Report

## Overall Verdict

**COMPLETE — 掲載可2件、例外保留0件。**

2026-10-09、本番のYAMAHA / LAVAを一次記事の内容に沿ったnon-event
紹介記事として再評価し、両方が `READY_FOR_HUMAN_DECISION` になった。
DBの `pending` は2件のまま。掲載・非掲載の最終判断はユーザーに残し、
本作業ではapprove/rejectを行っていない。

## 1. Starting State

開始実測：`main = origin/main = a120b234`、ahead/behind 0/0、tracked/staged clean。
既知untracked `.claude/` と `workers/sound-cruise-sync/node_modules/` を保持。

NEWS 0.25.1 / Operator 0.24.1 / Port 1.19.6。
候補148件：公開114 / 保留2 / 非掲載32。
Ledger68 / feedback90 / Shadow174。
前回の掲載可6件は既にユーザーが判断済みであり、今回の対象は残る2件のみ。

## 2. YAMAHA TDM-600 Re-Evaluation

一次記事：<https://www.ikebe-gakki-pb.com/new_product/172830/>

記事公開日 **2026-10-07** を維持。
メーカータグ・製品欄：YAMAHA、TDM-600GY、TDM-600BE。
機能と日々の練習、ピッチ・リズム・テンポの確認を具体的に説明する
**製品情報記事**。発売日、新製品性、発表イベントは確認できないため補わない。
2型番は同一ファミリーの製品として保持し、片方をアクセサリー扱いしない。

独自見出し：

> YAMAHA、チューナー・メトロノーム「TDM-600GY / TDM-600BE」を紹介

`articleType=product_information` / `theme=relevance=practice_tools`。
`event_type=product_article` は記事分類であり、発売・発表の主張ではない。
本番validation valid=true、errors=[]、duplicates=[]。

## 3. LAVA Re-Evaluation

一次記事：<https://www.ikebe-gakki-pb.com/new_product/172658/>

記事公開日 **2026-10-01** を維持。
製品欄：LAVA MUSIC、SmartAmp、LAVA STUDIO Stand、Effects Pedal。
本文はLAVA STUDIOでのギター練習・音作り・録音・楽曲制作と、
専用／対応周辺機器を説明する **機材紹介記事**。
SmartAmpとLAVA STUDIOの同一性や発売イベントは推測しない。
見出しは記事内の3つの明示された製品欄をまとめ、単一製品の発売へ絞らない。

独自見出し：

> LAVA MUSIC、機材「SmartAmp / LAVA STUDIO Stand / Effects Pedal」を紹介

`articleType=gear_information` / `theme=relevance=guitar_practice_recording`。
SmartAmpの識別情報を保持し、Stand / Effects Pedalの明示された周辺機器関係を保存。
本番validation valid=true、errors=[]、duplicates=[]。

## 4. Generic Non-Event Article Support

新しい `product-article-evidence.js` が、製品名のホワイトリストなしで
許可済みIkebe一次記事の明示的な製品欄・説明・用途から抽出する。
対応分類：製品情報、機材情報、レビュー、試奏、特集、解説。
記事タイプの動詞は、明示的な記事表現に応じて紹介／レビュー／試奏／特集／解説。

現在実装した関連性テーマは練習ツール、ギターの練習・録音、ギターの音作り。
すべての記事ジャンルを無条件に許可する変更ではない。
モデルだけの列挙、ブランドだけの言及、在庫・再入荷・セール・販促だけの内容、
関連商品カード、隠し要素、曖昧な対象は掲載根拠にしない。

明示的な発売・発表記事は従来のevent parserで確認し、紹介記事に誤分類しない。
同じbounded responseを使うため、fallbackによる追加external fetchは発生しない。
Autonomous Pending Recheckも同じ抽出・検証を使用。
source登録・取得頻度・collection scope・schedulerは変更なし。

## 5. Validation Changes

`other` の一般的なfactsをそのまま許可せず、確認済み `product_article` だけを
新しい経路で検証する。subject、article type、models、theme、relevance、
classificationそれぞれにsource URL・parser version・response hash付きprovenanceを要求。

source/legal gate、source health、公開日、期限、takedown、fingerprint、
独自label、category、duplicateの既存検証を維持。
紹介記事の重複は同じ製品群・記事タイプ・テーマで判定し、既存の独立した発売記事と
同一視しない。別記事の同じアクセサリーだけで重複にしない。

発売記事の既存validationと重複境界は維持。弱い一覧再取得で新しい確認済みfactsを
上書きしない。Operator根拠表示に記事タイプ・モデル群・用途・関連性を表示し、
新経路だけ「記事対象・用途・機能を確認」と案内する。
Access / JWT / CSRF / human decisionの保護は変更なし。

## 6. Final Pending State

| Article | Article Type | Headline | Final State |
|---|---|---|---|
| YAMAHA TDM-600GY / TDM-600BE | product_information | チューナー・メトロノーム2型番を紹介 | READY / pending |
| LAVA関連機材 | gear_information | SmartAmp / LAVA STUDIO Stand / Effects Pedalを紹介 | READY / pending |

掲載可2、例外保留0、DB pending2。両候補のID・URL・公開日・保持期限・
publication decision・公開状態は保持。人間の掲載希望フラグも保持。

## 7. Tests

- NEWS / Operator full suite：**809/809 PASS**（workerd/D1を含む）。
- Port NEWS：**46/46 PASS**。
- 新しいgeneric article回帰：26件。2実例、未知メーカー、レビュー／試奏／特集／解説、
  再入荷・販促、hidden/related、型番列挙、対象不一致、発売誤分類、日付・URL、
  provenance、duplicate、弱い再発見、Autonomous Recheck、READYでもpending維持を確認。
- Operator UI：**21/21 PASS**。紹介記事専用案内を追加検証。
- Syntax / `git diff --check` / explicit staged diff / secret scan：PASS。
- NEWS・Operator Worker dry-run build：PASS。
- 本番snapshotからの隔離DBで実際のfacts receipt trigger・CAS・lifecycle・Shadow・
  冪等性を照合：PASS。teacherと既存公開記事不変。

最初のsandbox内full suiteはローカルポート権限でD1テストが実行できなかった。
ローカルworkerdの実行権限を付けて全件再実行し、最終全件PASSを確認した。

## 8. Production Verification

本番2件の回復は確認済み構造化factsのみを、既存receipt triggerとCASを使って適用。
actorは `system_recheck`。新規human decisionなし。
本文・原文見出し・画像はDBやGitへ保存しない。

前後の全候補・公開API全件・ticker・Ledger・feedback・source state/healthを照合：

| State | Before | After |
|---|---:|---:|
| Candidate total | 148 | 148 |
| Published | 114 | 114 |
| Pending | 2 | 2 |
| Rejected | 32 | 32 |
| Ledger | 68 | 68 |
| Feedback | 90 | 90 |
| Shadow | 174 | 176 |

既存Shadow174件は完全不変、新しいrevision対応の観測2件だけ追加。
facts receipt・facts cache各2件追加。既存triggerがcontrols revisionを462→464へ進め、
`facts-recheck / verified_facts_only` のadmin audit2件を追加した。
collection/api/publication flags、source状態・health・collection runsは不変。
2件以外のcandidate rowと公開API114件・ticker5件は全フィールド不変。

本番Operatorで掲載可2件、両方のvalidation通過と保存facts/provenanceを確認。
Port NEWSの既存カード・category・1.19.6表示も確認。
Port初回の一時的な読み込み失敗はreloadで解消し、以降正常に表示された。
YAMAHA/LAVAは未掲載のためpublic APIに追加しない。

## 9. Versions

- NEWS：0.25.1 → **0.26.0**（generic non-event記事の検証経路追加）。
- Operator：0.24.1 → 0.25.0 → **0.25.1**（根拠案内の補正）。
- Port：**1.19.6維持**。Port / Pages変更不要。

本番NEWS Worker：`46de394d-faac-4394-90bd-2060e1f6fef1`。
最終Operator Worker：`f9a071d2-ab39-4b15-9f9e-1ef06743171b`。
日次 `0 21 * * *`、hourly `17 * * * *` は変更なし。
D1 schema/migration、Account、Sync、認証、公開記事への変更なし。

## 10. Git

実装commit：`ea4c8ac1`。
Operator案内補正commit：`f95ac2ec`。
両方explicit stage → commit → normal push → 必要Worker deploy済み。
本レポートもcloseoutで明示stage・commit・normal push。
最終closeoutではmain=origin/main、ahead/behind 0/0、tracked/staged cleanを確認。
既知untracked2件は保持。禁止Git操作は実行していない。

| Check | YES / NO |
|---|---|
| YAMAHA can be safely classified without inventing an event | YES |
| LAVA can be safely classified without inventing an event | YES |
| generic non-event article support added | YES |
| unsupported release/announcement events guessed | NO |
| both remaining holds became publishable | YES |
| pending exceptional holds reached zero | YES |
| human teacher data contaminated | NO |
| all tests pass | YES |
| production verification passes | YES |
| Git safety followed | YES |
