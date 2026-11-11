# Phase 1 実機フィードバック修正①

候補0.88.2-dev.3。PR #267の9712ea7bから分離し、PR #265の1721d190を保持。
開始時origin/mainは7884cd584。#265／#267はいずれもopen Draft。元worktreeはcleanのまま保持。

## 原因と修正

1. 新規作成は同一の既定名を使い、曲名入力欄を開いていなかった。既存Sessionの切替自体は存在したが、見た目で識別しにくかった。保存一覧と全Sessionの名前から未使用の番号を選び、「無題のプロジェクト N」を付ける。新Projectをactiveにし、選択ID・範囲を解除、曲名欄を開いてfocus/selectする。既存の利用者命名は変更せず、新規は未保存のまま。
2. コード／ドレミのルーペkeydownはAlt+左右移動だけを持っていた。Enterを入力確定→次小節の同じ行へ接続。旧一覧の入力にも適用。IME中、229、composition直後、不正入力、staleな入力対象は移動しない。最終小節は増設しない。遅延focusは既存Session／document／content／focus guardを使う。歌詞の経路は不変更。
3. 小節複製のcanonical、ID再発行、参照は正しかった。一方、構造変更のoperation通知で紙面を再生成せず、ルーペだけ現在Projectから描いていた。外部採用／Undo／Redoと同じSession publicationの描画境界へ構造operationを接続した。ボタン側の強制再描画ではない。複製直後の紙面・ルーペ・snapshot、複製先編集、Undo/Redo、保存／JSON／reloadを確認した。

新しいbrowser回帰の主要4ケースは元候補のsheet-cruise.jsに差し替えるとFAILし、修正後PASS。独自短曲だけを使用。

## 未保存確認とAライン契約

B所有の `sheetCruise.requestLeave(continuation)` を追加。
確認不要ならcontinuationをその場で1回実行しtrueを返す。確認待ち／拒否時はfalse。戻り値を既存の「trueなら保留」型APIと混同しない。
呼び出し側は遷移自体をこのcontinuationへ渡し、戻り値にかかわらず別途遷移を実行しない。

- 新規／Project選択／B側のPreDTMボタンを接続。
- 全Sessionのdirtyを列挙し、保存して続行／保存せず続行／キャンセルを表示。
- 保存せず続行でもSessionを破棄しない。ブラウザ終了／reloadで消失し得ると表示。
- 保存して続行は各dirty Sessionを既存commitで順次保存し、全結果と残るdirty・pending・conflictを再検査する。
- 入力未確定・競合・UNKNOWNを含む保存エラー・in-flight時は移動しない。非同期完了時もSession、workspace、認証、modalの所有を確認する。多重表示／二重保存を拒否。確認を閉じた後の保存完了は遷移を実行しない。
- 既存beforeunloadは全Sessionのdirty／保存中／入力未確定を監視するまま維持。

**Aライン連携は必要。** 製品Shellは不変更。A側は `navigate`、`goBack`、公開 `shellHost.navigate`、hash／workspace切替等を共通のcontinuation guardへ接続し、承認後の再入だけ一回通す。単に現在workspaceだけを判定せず、別workspaceに残るdirty Sessionも対象にする。低レベルactivate経由の漏れと初期load時の不要な確認を検証する。

ローカル専用adapterにはbuttonによるWorkspace／戻る／ホーム遷移のcapture接続を追加し、再入を一回だけ許可した。これはAの製品Shell統合の代替ではない。**本番Shellを含む全画面遷移はHOLD**。A受入は、上記全経路の3選択、複数dirty、保存失敗／UNKNOWN、IME、二重click、確認中の遷移、reload警告を含む。

## 保護と検証

schema2、Music Modelの保存形式、Repository CAS／Web Locks、履歴本体、複製の素材／フォーム契約は不変更。Project削除・自動移行・Cloud初期化なし。
本番認証・公開入口・Coming soonは不変更。18874のbind／Host／origin／CSP／外部通信遮断は不変更。

- 関連Node **382 PASS**、skip 0：schema2／Repositoryを含むSession・履歴・構造・コード保護・公開／ローカル境界。
- 新フィードバックbrowser **Chrome 8 PASS、WebKit 8 PASS**（各親1＋子7）。新規3回、名前とactive、取消、全draft保存、Enter／IME／最終小節、複製と編集・履歴・保存／JSON／reload、quota／UNKNOWN／入力未確定／外部競合、ローカルホーム／戻る確認。
- 既存PR #265 browser **11 PASS**。新しい確認に従い保存せず続行を明示するようfixtureを更新。
- 切替後の実18874サーバー **Chrome／WebKit各1 PASS**。route mockなしで編集・保存・reload・JSON・印刷を確認。外部／本番認証／Cloud通信0件。
- Safariアプリの手動受入、実OS日本語IME、本番Shell全遷移はHOLD。WebKitと合成composition試験を実OSの確認済とはしない。
- 全Node全件／旧15 Browser cohortの再実行は対象外。従来の既存失敗をPASSへ変更しない。

## 18874での確認

利用者の明示許可後、元18874サーバーだけを停止し、このworktreeから同じportで再起動した。元worktree／branch／保存originは保持。18873は不触。

URL：http://127.0.0.1:18874/

1. ページを更新。新規→確認でキャンセルし、次に保存せず続行。新規名が連番で変わり、曲名欄が選択されることを確認。
2. コード／ドレミを入力してEnter。同じ行の次小節へ移ること、IME確定時は移らないことを確認。
3. コードC・歌詞・ドレミ・ストロークを入れて小節複製。紙面とルーペを比較し、複製先を編集。Undo/Redo後も一致することを確認。
4. 未保存でホーム／戻る／Project切替を操作し、3選択を確認。複数draftがあれば保存して続行で全てを保存。JSON書出し後、reloadでも内容を確認。

起動し直す場合は既存18874を確認してから、このworktreeで実行する。

```bash
cd /Users/murakamimasakuni/.codex/worktrees/score-feedback-one/Cruise_apps
python3 apps/cruise-studio/scripts/serve-local-ui.py
```
