# Cruise Studio メンバー限定動画のお知らせ（公開候補）

Port 1.36.0候補。main統合・本番配備・本番登録は未実施。NEWS／Operatorは0.71.0のまま。

## 確認した動画

- チャンネル：アコギ弾き語り専門ラボ / クルーニー。ID `UC4ncQuk56I8SK6lJGZcGwJQ`。
- 動画：**#6【メンバー限定】PCで使える弾き語りアプリ「クルーズスタジオ」**。
- URL：<https://www.youtube.com/watch?v=BKHbxOotq9E>。動画ID `BKHbxOotq9E`。
- 2026-11-18に通常のYouTube画面と認証済みYouTube Studioで照合。Studioの公開設定は「メンバー限定」「すべてのチャンネル メンバー」。公開設定は変更していない。
- 動画本来の公開日は2026-11-15。公開時刻・タイムゾーンはUIから確定できないため、日付精度の `publishedOn` と `publishedAt: null` を保持する。NEWS掲載日は指定された2026-11-18 JST（内部の掲載日境界は2026-11-17T15:00:00Z）。
- 説明の主題：PC版Cruise Studioの入手方法と使い方、Cruise Syncによるスマホ／PCの機材リスト連携。将来の譜面・Pre-DTM機能を公開済み機能として宣伝しない。#5のCruise Port解説動画とは別動画。
- 本番candidate_itemsと公開APIの読取で動画ID・URL・Cruise Studio表記の既存記事は0件。公開API読取時192件。

## 公開候補と既存経路

見出し：**Cruise Studioの解説動画をメンバー限定で公開**。

既存のテーマ紹介と同じ、Port同梱のSound Cruise公式お知らせ（`sourceKind: official`、`category: cruise_apps`）を再利用。記事本文・画像は追加しない。公開候補と動画メタデータは `news-articles.js` に版管理する。根拠は運営者の公式告知指示と上記動画の通常閲覧であり、メーカーの取得receiptやAIの自動掲載証拠ではない。

`news-provider.js` が公開APIのメーカーNEWSと公式お知らせを既存どおり統合する。D1候補・Ledgerへの新規登録はなく、NEWS公開APIの返却記事にはこのローカル公式告知は追加されない。公開承認後のPort配備で告知が表示される。通常の公開日順・HOT・ticker・90日表示期限を共有する。ticker自体は従来どおりNEWS一覧への入口。

公式告知の撤回は既存の同梱コンテンツと同じリリース手順を使う。D1の個別記事takedown対象と偽装しない。メーカー記事のtakedown／期限管理とAPIの全体停止はそのまま維持する。API障害時は既存どおり公式お知らせのみを表示し、API明示停止時は公式お知らせも含めて停止する。

## 外部遷移

この告知だけをボタンとして描画し、ネイティブ `dialog` を開く。直接リンクの中クリック等で確認を迂回するアンカーは設けない。

- タイトル：YouTubeへ移動します
- 本文：この動画はYouTubeのメンバー限定コンテンツです。視聴には対象メンバーシップへの加入が必要です。
- キャンセル／Escape／背景タップ：遷移せず閉じ、記事へフォーカスを戻す。
- YouTubeで見る：検証した正規HTTPSのwatch URLを、同じユーザー操作内で `noopener,noreferrer` 付き別タブで開く。
- 初期フォーカスはキャンセル。確認の二重発火と閉じたダイアログからの遷移を拒否する。通常記事は既存アンカーの動作を維持。
- APIからの動画種別・公式権限の注入は許可しない。ユーザー設定・ローカルストレージ・認証情報を保存しない。

## 検証

- `node --test apps/cruise-port/news*.test.mjs apps/cruise-port/module-cache-keys.test.mjs apps/cruise-port/app-version.test.mjs`：87/87 PASS。
- NEWS Worker `npm test`：2,178/2,178 PASS。Workerコード・設定・migrationは変更なし。
- Port全体：1,301件中1,221 PASS／80 FAIL。変更前mainでも同じ80件の失敗を再現（変更前1,293件中1,213 PASS／80 FAIL）。失敗名の集合は一致、新しい失敗0件。全体PASSとは扱わない。
- 208個の既存非NEWS公開アセットは、許可された版・起動参照の置換だけを戻して既存本番manifestと内容hash一致。既存のメインstyle.cssは未変更。
- 通常版／Pro版の実HTML・CSS・NEWS rendererを使った隔離画面でPC 1280px／390pxを確認。表示、キャンセル、Enter起動、Tab移動、Escape、背景タップ、フォーカス復帰、正しい動画への実遷移を確認。390pxで横はみ出しなし、両ボタン46px高。保存領域は空のまま。
- 隔離サーバー：`node apps/cruise-port/tests/news-members-preview-server.mjs`。両HTMLの通常app boot・認証・Syncは起動せず、API通信をCSPで停止しNEWSだけをマウントする。Pro認証やPort全体のE2Eを実証したものではない。
- iPhone実機Safari／PWA・WebKitは未実証。ネイティブdialogと、確定操作内の同期的なwindow.openを使用してiOSの通常のユーザー操作制約に合わせているが、実機PASSとは報告しない。

## 本番保護と公開前承認

本番は読取のみ。前後で両Workerの設定・配備・Cron、探索記録、controlsが一致。Ledger209件・管理監査641件で不変。11月18日最終探索は検索3回・推論2回・エラー0・lock0の完了記録を保護。Gemma 4・有限3枠・探索ON・手動OFF・自動掲載OFFを変更していない。

公開前に、運営者がこの動画URL・見出し・掲載日・確認表示を確認してPortのmain統合／配備を明示承認すること。NEWS／Operatorの再配備や本番D1書込みは不要。Port現行本番成果との差分と並行main更新を再確認して配備し、通常版／Pro版の本番表示・実機Safariで最終受入する。動画の公開状態が変わった場合は再照合する。
