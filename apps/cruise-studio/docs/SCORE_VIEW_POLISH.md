# ストローク選択と紙面表示の改善

候補0.88.4-dev.1。52fb869dまでのローカル作業を保持。

- ストロークセルはpointer／keyboardのfocus時に内側の枠を表示。:focus-visibleだけに依存せず、クリック後の再描画とfocus復元でも表示する。
- ArrowUpで↑、ArrowDownで↓、x／Xでx。既存u／d入力、Enter／左右／Tab移動を維持。
- 編集欄のコード／ドレミを中央寄せ。歌詞とドレミのfont、size、weight、文字間隔を揃え、同じセルで同じ文字数なら文字位置が揃うようにした。
- 紙面のコード・歌詞・ドレミを同じ表示グリッドに配置。各セルの幅と中央を共有し、イベントのtick自体は変更しない。通常コード譜は現在のルーペと同じ8分／16分表示を利用する。
- 「縮小 −」「倍率（リセット）」「拡大 ＋」を既存の譜面toolbarへ追加。画面幅に合わせた標準表示を100%として50–200%を25%刻みで変更する。拡大時は紙面のviewport内で横スクロール可能。
- 倍率はメモリ内の表示設定だけ。Project・draft・Undo/Redo・保存データに含めない。印刷では既存print.cssがscaleを解除してA4出力する。

検証：新表示suite Chrome5 PASS／WebKit5 PASS。クリックfocus枠、Up／Down／x、390／1440pxでの編集欄・紙面の列中央とfont metrics、ズーム寸法とProject／履歴不変、印刷A4幅とtoolbar除外を確認。画面の画像も確認した。
既存拍別入力9 PASS、Phase 1 browser11 PASS、実18874サーバーのChrome／WebKit各1 PASS、関連Node382 PASS。外部／本番認証／Cloud通信0件。実Safariアプリ・実プリンターは利用者確認待ち。

起動中の18874は再起動せず更新。未保存内容を保存してからページ更新し、ストロークをクリック→↑／↓／x→Enter／Tab移動、同じセルへの「あい」／「ドレ」入力、紙面の中央位置、拡大／縮小／倍率リセットを確認する。

schema2・Repository・認証・Account・Sync・公開Coming soonは不変更。main merge／本番公開なし。変更は同じ開発branchでcommit保全し、pushは別途行う。
