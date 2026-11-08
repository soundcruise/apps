# Account復旧のiPhone最終受入と公開候補1.30.5

2026-11-08。試験C PASS、正式削除・一時配信撤去完了。一般公開・main merge・Worker変更は実施していない。

## 固定対象と公開版の保全

- 同期修正: Draft PR #235 / a2d53683c17bbc2b3b8ddcc937632bd460d1718b。PRの製品コードは変更していない。
- iPhone配信候補: Port1.30.4 / 91e60cc1ee53a1884cd378f33788df149badd964。47製品ファイルを実iPhoneでSHA256照合。
- 一時パス: https://soundcruise.jp/p1304c/ 。専用manifest、専用SafariプロフィールA/B、専用PWAを使用。Pro/Account認証・CORS・Workerは既存契約のまま。
- 作業中に別ラインが通常Port1.30.4を公開した。公開commit170fa4fdのMidnight新規選択一時停止、保存済みMidnight・Studio投影、最新Studio0.88.0等を保全。
- 最終未公開候補1.30.5は撤去後公開tree09727f71ee29b44a41dfc87f9fb7f213f91b3a31上へ同じ同期修正を統合。同期実装5ファイルの本文はcache query以外、受入済み91e60cc1と一致。追加の保存契約・状態フラグ・同期機構なし。
- 製品差分47ファイル（Port46、共通runtime1）。5同期実装と版表示以外は必要なcache参照更新。AI UI/Privacy/Terms/テーマ設定とCSSは現行公開とcache以外同一。

## 実機結果

専用Safari A/Bは開始時localStorage/IndexedDB/SW/Accountが空。非機密マーカーが別プロフィールへ現れないことを確認。専用PWAもSafariと独立し、開始時Account・マーカー・DB・SWなし、standalone=true。本人のプロフィール・PWA・Account・帰属不明12件を操作していない。

1. 新規使い捨てAccount A/Bを正式作成。Aの初回同期完了後、実保存処理commitPracticeActivityで合成履歴/cycleを保存。手動開始なしでクラウド2件へ反映。同一Account自動同期の最小確認PASS。
2. テスト限定の一時fetchラッパーでAのSync送信だけを失敗させ、ローカル3レコード/クラウドA2件、帰属journal2アンカーを確認。Account APIやBの送信は遮断しない。
3. 正式な現環境解除→Bの正式復旧を完了。明示的なローカル統合や「同期を開始・再開」は押さない。B復旧成功、Aの3ローカルhashとjournal維持、B Outbox/Shadow/サーバー保存0件。
4. 一時ラッパーを復元し、実アプリスイッチャーで専用PWAを強制終了・再起動。旧ページRAMとラッパー消失を確認。同じB、Aの3hash保持、帰属証拠あり、B Outbox/Shadow/サーバー保存は引き続き0件。有効B App Deviceも0件。必要な停止を維持し、AをBへ帰属させない。
5. 対象A/BだけのサーバーSELECT/hash照合で、Aの既送信2件に変化なし、B0件。Account切替C PASS。

復旧コード入力の自動操作で2回のinvalid_request400が出たが、ミラーリング入力が1文字になっていたため。既存フォームへの正しい入力後は正式復旧成功。製品の復旧不具合とは判定しない。秘密値はコンソールコマンド・記録ファイルへ保存していない。

既存A（保存直後終了/再起動）・B（オフライン保存/復帰）の受入は前回PASSを引き継ぐ。今回はC以外の包括実機再試験をしない。

## 後片付け

- A/Bはそれぞれ対象hashを照合後、既存のdelete intent/commit UIで削除。両旧Account資格が410 account_deletingを返すこと、サーバーstate=deleting、有効Account Device0、有効App Device0を確認。
- 物理削除済みではない。Aの既送信合成2件は7日保持。Aは2026-11-15 07:26:34.847 UTC（16:26 JST）、Bは07:24:17.199 UTC（16:24 JST）からpurge対象。実行時刻は既存cronに従う。BのPortレコードは0件。
- テストPro資格も正式revokeし、ローカル資格なし・再試行待ち0を確認。
- PWA内localStorage0、SW0、6DBのうち4DB削除完了/2DBは開いている接続によりdelete要求待ちを確認した後、ユーザーが専用PWAだけを削除。OSのコンテナ破棄後にDBを再作成しての物理残存確認は行っていない。
- 専用SafariプロフィールPORT1304C-A/Bを削除し、一覧が元の個人用/SYNC-P7-A/SYNC-P7-Bだけに戻ったことを実機で確認。
- 一時配信撤去commit09727f71ee29b44a41dfc87f9fb7f213f91b3a31はp1304c以下223ファイルの削除だけ。既存サイト全体の古いtreeへの置換なし。Pages builtと4代表URLの404を確認。
- 通常公開Portの50ファイルとStudioの2ファイルを最新公開treeとHTTP bytes/hash照合し、52/52一致。NEWS/Studio/他4アプリに本作業による製品差分なし。
- Worker v161 / d278abbd-6989-44ab-a9bf-f7539dc0c8d9、100%、AI_SUPPORT_MODE=offを最終読取り確認。PR #225は未変更・Draftのまま。

## ローカル検証・公開判定

初期統合34 PASS/0 FAILを再利用。最終公開版追従ではAccount復旧・同一Account関連9件、統合smoke3件の12 PASS/0 FAIL。5同期本文の一致、最新公開テーマ制御維持、diff checkを確認。

公開受入PASS。最終候補1.30.5は未公開。残る操作は承認後に固定候補の47製品ファイルだけを最新公開treeへ適用し、hash/版/cacheと通常Port起動を確認すること。候補ブランチ全体で公開サイトを置換しない。main merge、Worker配備、AI有効化は不要かつ未承認。公開前に公開treeがさらに変わった場合のみ、該当差分を保全する。
