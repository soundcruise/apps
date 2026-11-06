# Canonical誤設定の人間確認（NEWS 0.45.0候補）

## 適用範囲と証拠の区別

通常parserのcanonical完全一致検査は変更しない。自動回復・自動掲載の許可でもない。
正式なAccess本人認証・Origin・CSRFを通った管理者だけが、既存候補の一次事実を確認できる例外操作を追加する。
初期対応は、既存の許可された島村Updateと池部new_productのCMS記事ID形式。未知のドメイン・媒体・記事形式へ推測で拡張しない。

- 採用URLは保存済み候補のURLに固定し、クライアントから変更できない。
- HTTPS、registryの公式origin、既知の掲載面、同一CMS記事ID・同じ掲載面を必須とする。
- 異なる記事ID・掲載面、別ドメイン、認証情報付きURL、query/hash、相対URL、未知の形式は拒否。
- canonical先が見つからないページであり、別記事や実在する移転先ではないことを人が確認する。
- 正規の取得処理で取得した、7日以内の同じ候補URL・公開日・fingerprintに対応するHTTP 200 HTMLの取得証拠が必要。robots・opt-out・アクセス禁止による失敗は対象外。対象URLへの新しいHTTPリクエストはこの保存処理から発生しない。
- 過去の限定復旧承認は「当時の取得証拠」としてのみ扱い、追加取得の許可には再利用しない。
- 新しい原記事/canonicalの観察と製品factsは**人間による一次確認**。過去のresponseHashが、今回の人間入力canonicalや全製品factsを機械抽出した証拠であるとは主張しない。

## 操作

候補詳細の概要に「canonicalの誤設定を人が確認して事実を補完」を表示する。
既存取得証拠があり、正式検証の不足がfacts/provenanceだけの候補が対象。出典停止、期限切れ、重複、takedownなどはフォームの対象外。

入力は、原記事に実際に記載されたcanonical、ブランド、主製品、製品種別、出来事。
確認チェックは、公式記事の実在、canonical先の不存在、同じ記事の識別、製品facts、出典条件/紹介禁止/削除要請、転載・推測の不使用。
原見出し・本文・画像を入力/保存しない。掲載価値の再審査はこの操作の目的ではない。
「紹介」を選べば初発表・初発売を推測しない。発売日・限定性など、今回の入力で裏付けていない情報を付け加えない。
既存のbrand/product/type/modelsと矛盾する変更は拒否し、正当なidentity訂正の別の問題として扱う。

`POST /api/canonical-facts-confirm` は人間の確認を保存するだけで、正式NEWSへの承認・公開を行わない。
保存後に通常のpublicationValidationを実行し、通過した候補のみ掲載可になる。

## 保存と原子性

新しいmigration、テーブル、外部キー、triggerは追加しない。
既存`news_facts_rechecks`とその正常なfacts更新triggerを利用する。
保存する情報は、採用URL、元canonical、同一記事の古いパスという不一致理由、人間によるnot-found観察、確認者のAccess principal ID、確認時刻、チェック、過去取得証拠のkey/時刻/hash、構造化facts。
本文やカード画像、Cookie、トークンを保存しない。既存の保存期間・削除契約に従い、永久receiptにしない。

最終INSERT内で候補全行CAS・revision、停止状態、controls、出典health、takedown、参照した取得証拠の同一性を再照合する。
確認記録はfactsと独立した人間の一次証拠になるため、取得キャッシュ整理だけでは失効しない。確認記録自体の削除・改変、factsの改変は検出する。
掲載承認時も、通常の出典/重複/takedown/CASの条件に加え、同じD1 INSERT境界で確認receiptの存在・時刻・payload hash・proof・facts・見出し・分類等を照合する。
人間確認済みのfactsが正常な限り、定期再確認で同じcanonical失敗を再取得し直さない。
ACK喪失時は同一request ID/payloadで照合し、異なるpayloadの再利用は拒否。
旧Workerは新しいhuman_product_noticeを正式な自動parser証拠として扱えず、掲載条件を迂回できない。rollbackしてもreceiptやfactsを手作業で削除・変換しない。

## Freedomの実測とローカル受入

候補URL：`https://www.shimamura.co.jp/update/guitar-bass/2026/11/68956/`
元canonical/OG URL：`https://www.shimamura.co.jp/update/guitar-bass/2026/08/68956/`

2026-11-06の再確認でも11月URLで原記事を表示でき、8月URLはFile not found画面。自動リダイレクトで別記事へ移転する根拠はない。
古い年月パスのcanonicalが残った状態と整合するが、出典内部の移転・編集履歴は未確認。出典自身による「誤設定だった」という回答を取得したとは扱わない。
今回のブラウザ確認ではHTTPステータスの数値は取得していない。保存済みの正規取得経路が、HTTP 200のHTMLを受け取った後にcanonical検証で失敗した証拠を利用する。
公開日2026-11-01、表示更新日2026-11-05、明示発売日2026-09-02は区別する。発売済みの商品を11月初発売と表現しない。
メーカーFreedom Custom Guitar Research／主製品Diamond Cable／楽器用シールドケーブル／記事での紹介、として人間確認する。

本番の249候補（承認済み184件）とtakedown3件、対象の実際の取得証拠を、隔離された永続workerd D1へコピーして検証：

- 実migration 0001〜0025、Operatorと同じcompatibility date 2026-10-02。
- **READY / validation.valid=true / errors=[] / duplicates=[]**。
- 見出し「Freedom Custom Guitar Research、楽器用シールドケーブル『Diamond Cable』を紹介」（実装は独自生成の括弧表記）。
- revision 0→1、本文追加取得0、Ledger書込み0、変更候補はFreedomのみ。
- 再起動後も正式検証PASS。

実行環境：プロジェクト同梱workerdは2026-09-18までのため、その制約を隠さず記録した。公式npmのworkerd **1.20261106.1**をリポジトリ外の隔離試験環境で使用し、実compatibility dateで再試験した。アプリの依存関係・lockfileの依存版は変更しない。

## 本番反映の境界

本工程では本番配備・本番候補変更・公開を行わない。
固定headのmain統合、両Workerを既存設定を保って配備、対象Freedomの人間確認保存1回は、次回の明示承認対象。
migration・追加記事取得・予算変更・Exa/Qwen実行は不要。
Web探索ON/手動OFF、検索・AI上限、cron、7:30日次記録、11月8日09:10 JST終了予約を変更しない。
本番の実際の掲載可は、この保存と正式検証が成功するまで未確認。公開はさらに別の人間判断。

## 最終試験

NEWS/Operator **1,736/1,736 PASS**、Port NEWS **60/60 PASS**、新しいcanonical救済の専用36件PASS。
実workerdの保存・再起動、実データを使ったREADY、HTTPレイヤーの署名付きAccess/CSRF成功、未認証/不正CSRF拒否、同時保存/ACK喪失/CAS、異なる製品・URL・出典停止・重複・takedown拒否、最終掲載SQLでのreceipt削除/時刻変更/JSON破損拒否を含む。
正常な確認後に自動再確認でHTTPを繰り返さないことを検証。
両Worker production-config dry-run、変更JS syntax、git diff --check、変更差分の秘密情報パターン検査PASS。
日次記録・終了予約のファイルhashは変更なし。本工程の本番書込み・配備・公開・有料検索/AI呼び出しは0。
