# 同期先一覧の共通化（Port 1.33.0候補）

公開基準2fc9b71515a640d3b0e2b325f8ee43fa7769ff85からのPort限定差分。公開・本人データ操作は行わない。

②の詳細にあった独自の同期先描画を削除し、③と同じcreateEnvironmentDetailsを使用。登録名、識別情報、最終利用、前回報告、名前変更、個別解除を共通描画する。親パネルだけ既存の②のタブで開閉し、内部一覧のID/データ属性はinfo-接頭辞で③と区別する。全接続解除は従来どおり③だけに追加する。

名前変更・個別解除は既存のrootイベント委譲、既存API、対象名付き確認画面、refreshをそのまま使う。解除前後の「未接続になる」「同期の修復ではない」説明は維持。本人の操作なしに解除しない。Port自身の状態判定は変更しない。

4アプリの✓同期済みは、snapshot=aligned、removalSafety=safe、有効同期先が1件以上で全件の既知の最終報告がcleanの場合だけ。pendingは同期中、attention/errorは確認が必要、応答の不一致は再確認、報告不足は従来のクラウド利用可。既存のmembership判定で有効同期先0件は未接続。解除によりattentionが消えただけではclean報告の証拠にならない。全端末内の現在値を診断した表示ではないことを両入口の説明に記載する。

製品10ファイル、37行追加・48行削除（版/cache/説明文込み）。同期先の重複描画を削減。新しいAPI・DB・永続状態・状態enumなし。既存state=availableをclean成功表示にも使用し、操作権限は変えない。Worker/runtime/Outbox/Shadow/資格/保存形式/他アプリ/Studio/NEWSは変更しない。

検証：新規Node7件PASS、既存rename関連4件PASS。Chromium/WebKit各122チェックPASS（通常/Pro、320/393px、実DOM/IndexedDB、合成Account）。両一覧の情報一致、②からの名前変更、個別解除の確認・キャンセル・確定1件、更新後の件数とclean表示、②に全解除がないこと、③の維持を確認。ネットワークはローカルfixture以外遮断。

既存controller/status/UI計68件は、公開基準60 PASS/8 FAIL→候補61 PASS/7 FAIL。新規失敗0、旧UI/版期待などの既存FAILは今回の範囲外。期待値を緩和していない。

ローカル候補PASS。本番公開・本人端末操作は未実施。公開には別途承認と最新Pages treeへの限定反映、配信hash確認が必要。
