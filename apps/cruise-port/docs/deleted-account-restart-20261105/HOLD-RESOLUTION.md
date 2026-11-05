# PR #205 WebKit HOLD最終確認

固定候補: head `910cf8b603af2db8963f11deb3c4798e78b872f4` / tree `32cb14902482d290c1d414fda3a3595e397845c3`。この調査では製品コード・配布ファイル・版・保存・認証は変更しない。

## 先行失敗の読取り

既存のローカル完全ログ `restart-final6-restart-webkit/PROJECT-PRODUCT.json` と同梱失敗記録を比較した。

- 対象はstudio deleted connect、先行9ケースはPASS、pageerrorは0。
- そのprofileではStudio側のsummaryが410 account_deleted。Pro challenge/renewはすべて200。実際の資格拒否や削除判定の誤りを示す応答はない。
- iframeがPortの #sync-center へ遷移した記録は1回のみで、案内待ち中のdetach/replacementは記録されていない。
- iframe遷移後のnative Portが発行するはずのsummary/devicesが記録されていない。このため「410をcontrollerが受けたのに案内を描画しなかった」より前、native起動・認証準備段階へ合理的に絞れる。
- ただし当時のnative文書のPro gate/componentStateを保存していなかったため、厳密な停止理由、実画面非表示かテスト参照先の問題かは断定できない。Frame取り違えやfixture不具合が原因と確定したわけではない。

## 限定再現と試験修正

製品は固定候補のclean packageをそのまま使用。対象ケースのみWebKitで最大3回と定めて実行し、3/3 PASS。実行回数を増やして原因を追うことはしていない。

試験は起動中に取得したFrameへ固定する代わりに、現在の `#port-sync-surface iframe` を追うFrameLocatorで案内表示を判定し、表示後に操作用Frameを取得し直す。**制限時間は同じ20秒、表示必須、判定緩和・例外無視・認証省略なし。** 先行失敗の原因確定としてではなく、起動/再生成中の参照を明確にする変更である。

追加記録はnative起動状態、Pro gateの有無、Account状態、iframe inert/detached、API path/status/codeのみ。ID・資格・token・Project本文は記録しない。失敗時の記録後も元の例外を再throwする。

最終の全ケースはChrome12/12、WebKit12/12 PASS、捕捉エラー0。両方の現在iframeでcomponentState ready、restart表示、410 Account応答を確認。同じ保存保護検証、キャンセル時資格保持、確認後のCAS解除、実作成/接続、旧scope UNKNOWNマーカー・ローカル機材・Project bytes保持、自動B送信なしを維持。Port単独版も含む。

`STUDIO_RESTART_FOCUSED=1` で3回の対象限定確認、既存 `STUDIO_DELETED_RESTART_ONLY=1` で全12ケースを実行する。既存の隔離runtime/Worker/DB/合成資格を使用し、Production通信なし。

## 判断

直接原因の完全確定には至っていないが、先行1件はnative初期化到達前の一過性待ちへ絞られ、削除判定・再スタートの継続的な製品障害は確認されなかった。限定再現3回＋最終Chrome/WebKit受入を根拠に、**PR #205のWebKit HOLDを解除**する。再現しなかったことを根本原因の修正済みとは表現しない。既存の失敗記録も残す。

製品変更がないためNode・Worker削除ライフサイクルの再実行は不要とし、既存200/200・29/29を再利用。実Safariの資格解除・実Account操作は未実施。#204は独立したDraftのまま。将来の単一公開候補統合、個別承認後の実機受入、main merge/Pages公開は別工程であり、このHOLD解除では実施しない。
