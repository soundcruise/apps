# Structure Chord Form Selection & Adoption UI v1

開発候補 Studio 0.43.0 / Project schema 2 / Adapter v2 / Chord owner 1.21.0。main統合・Pages公開は別工程。

## 所有と導線

Structureの既存小節選択→Inspector→対象コード→「押さえ方」。canonical bar/chord event IDを選択projectionへ追加し、同一小節内の各イベントを拍位置・コード名付きselectで明示選択する。番号・文字列は表示専用。第二workspace・第二Undo・独自CAGED/順位・自動一括適用は作らない。

ownerのmusic-theory→chord-model→caged-formsを1.21.0で読み取り専用loadする。DOM/storage/network/Pro初期化のない正式classic exportのみ。製品版moduleから正式adapter/採用Serviceへ注入する。feature-accessのbasic/intermediate CAGED許可とadapter既存subsetを照合する。高度quality/CAGED自由選択・customChordSave・本棚・認可は接続しない。API成功やmetadataはPro資格ではない。

## 候補・確認・採用

初回は標準6弦 [64,59,55,50,45,40] の明示checkbox、楽器の物理上限の入力を必要とする。古いtuning=null/max欠如を表示だけで更新しない。保存済み物理上限を表示しても、再採用の確認は明示操作。capoは現在projectから読み、相対/物理フレットを分ける。表示viewportを生成条件に渡さない。

明示previewでowner推薦を取得する。使用弦は自動checkしない。noteとして存在する弦だけ指定可。各変更で正式adapterを通し、displayとvoicing-only判定・未解決理由を別表示する。availableだけでは採用許可しない。6/m6等の不足は補完しない。

previewはメモリのみ。UI leaseはProject/Session・document/workspace generation・snapshotVersion・baseRevision・bar/event IDを保持する。曲/選択/Workspace/Undo/Save/IME/競合後の旧previewは採用できない。確定時に正式Service.prepareで再発行し、そのhandleだけをService.applyへ同期的に渡す。raw照合・容量・owner版・入力pending・staleの最終判定はServiceに残す。

採用/差替え/解除はいずれも既存Serviceの1回のrunOperation、単一Undo100件/8MiB。楽器設定と採用は同一操作。保存は既存の明示Saveだけ。UIからProject/Repositoryへ直接書かない。

## 固定フォーム

既存bindingはsnapshotから表示し、owner推薦を再取得しない。現在Projectに対してevaluateして「固定」「要確認」を区別する。不適合snapshot/material/bindingは保持する。変更は明示preview→採用、解除はprepareRemoval/apply。未使用materialは削除しない。解除後はおすすめ未採用へ戻り、再採用しない。unresolvedコードの既存binding解除は可能。

## UI lifecycleと受入

既存Inspectorのscroll/focus/Escape/overlay境界を再利用する。フォームUIの入力DOMは購読ごとに作り直さない。購読はRAFへ集約し、メロディcommandの同期経路でschema検証・owner取得を実行しない。閉じたpane/破棄後のapplyは禁止。4テーマsemantic tokensと390/768/1440/1920px、指板SVG＋テキスト弦一覧、label/aria-live/focus表示、print非表示を対象とする。

Nodeは実owner純粋性・stable ID/UI leaseと既存Service全安全反例を検証する。Browserは製品ロード後の実click/inputを通し、候補/楽器/弦/採用/解除/UndoはProject永続write0、明示SaveだけProject/index許可とする。全reloadをまたぐ追記ledgerを保持し、正当なtheme/currentProject設定writeを別区間として記録する。全正式26 suiteに新UI suiteを追加する。

性能は既存fixture/操作、warmup3＋sample20、nearest-rank p95、64小節command≤16ms/staff≤500msを維持する。測定結果・Git gatesはrepo外証拠で報告する。実OS日本語IME・Safari・実プリンターは別途受入。Rhythm/伴奏五線/TAB/手動運指/本棚は未実装。

## Initialization recovery

未選択Project、未生成/破棄済みSession、未選択小節、空コード配列、削除されたeventは正式empty state。readFormTargetは不在をnullへ正規化し、booleanをtargetへ伝えない。イベントが消えた同じ小節の別イベントを自動選択しない。対象なしではfieldsets/採用/解除/変更を無効化し、handlerもleaseと実在IDを再検証してServiceを呼ばない。初回の単一コード小節選択だけは、その一意なIDを対象とする。

選択/候補はUIのみ。unknown弦は「未確定 / ?」で表示し、ownerが明示したmuted弦と区別する。音が存在する弦だけを発音指定できる。destroy/dispose後のcallbackを無効化する。パネル初期化失敗をcatchして握りつぶさず、cold bootを含む正式Browser回帰で検証する。

pagehideではUI候補を失効させ、所有pagehide listener・購読・RAFを解除する。persisted pageshowで一度だけ再接続し、既存Inspectorと同じBFCache境界を使う。Metronomeの所有listener解放試験を変更せず、新UI側の解放を修正して検証する。

## P2 display and feedback contract

固定表示はsnapshotの座標・運指・バレーを保持したまま、Binding.playedStringsを表示専用に参照する。発音noteは「鳴らす」、未使用noteは「鳴らさない」（中抜き・破線の押弦と―印）、owner mutedは「ミュート / ×」、unknownは「未確定 / ?」。未使用noteを消音へ書換えたりsnapshotから削除しない。要確認でも保存済み使用弦を保持して表示する。候補の未確定使用弦は演奏確定と表示しない。

結果通知はhidden/disabledになる楽器fieldsetの外に一か所だけ置く。role=status / aria-live=polite / aria-atomicで通知し、Inspector内のsticky領域で長文を折返す。通知は一時UI状態だけ。Session.dirtyに従って未保存を示し、Save成功、Undo/Redo、対象/Project/workspace変更時に旧通知を失効させる。Save失敗なら未保存・内容保持を明示し、独自保存フラグを作らない。

Adapter/Service/binding評価のreasonは一つのUI formatterで日本語の原因・次の操作へ変換する。複数reasonを保持し、部分フォーム等の取得/全フォーム不成立を弦選択問題より先に示す。未知reasonは安全な一般案内に置換し、内部codeを生表示しない。フォーム判定・採用可能性には一切介入しない。

C/E、C/G、D/F# capo2の独立MIDI期待値、採用→再表示→Undo/Redo→Save→reload→A/Bを検証する。100件Undo拒否とproject予算拒否の可視通知・全状態不変、明示Save失敗のraw/index復旧・dirty維持を実Chromeで検証し、試験ledgerを消去しない。正式基盤6ファイル、schema2/Adapter v2/0.43.0は不変更。main統合・公開は別承認。
