# 譜面クルーズ Phase 1 初回評価と開発候補

2026-11-11。ストラクチャー譜は基本編集・明示保存・JSONバックアップ・印刷までつながっているが、日常利用できる完成品には未到達。最優先の不足は、拍別の複数コード編集、キー／カポ編集、直接再生。今回は既存コードの時間情報を失う入力と、一括入力パネルをクリックできない問題を修正した。

開発候補は **0.88.2-dev.1**（`sheetCruise.developmentVersion`）。正式Studio／保存メタデータの版は **0.88.1のまま**。Aライン所有の版表示・metadata・HTML／ESMキャッシュ更新は統合時の依頼事項とし、このBラインでは変更しない。schema2の形式変更、旧Projectの自動書換え、本番公開はない。

## 1. mainと作業環境

- fetchで確認したorigin/mainは `a0d44fe64b4b06f57b2d2ef9399349c21ed1288f`。PR #243はmerge済み（merge commit `fed3985f5`）。以降のmainを含む状態から開始した。
- 元のDesktop作業フォルダは `32f4058c` のmain、未push commitなし。未追跡の `.claude/`、Studio prototype、Worker node_modulesを変更・移動・stageしていない。
- `/private/tmp/studio-score-development` はGit登録だけが残り、実体なし。登録や過去branchは削除していない。
- 新worktree：`/Users/murakamimasakuni/.codex/worktrees/studio-score-phase1-20261111/Cruise_apps`
- branch：`codex/studio-score-phase1-20261111`。最新mainから作成し、古いStudioツリーのコピーはしていない。
- 参考PDFは今回の添付領域では参照できず、依頼文のレイアウト要件を基準にした。参照曲の歌詞・旋律は追加していない。

## 2. ストラクチャー譜の到達点

「確認済」は今回の使い捨てChromium／合成Projectによる操作確認を指す。利用者の正規Pro認証後の実機受入とは区別する。

| 利用者の操作 | 分類 | 現在できること／残る問題 |
|---|---|---|
| Projectの新規・一覧・切替 | 実装済・確認済 | 新規作成、保存済／未保存Projectの切替。同一セッション内の別曲draftを保持。新規は既定セクションを持つテンプレート |
| 曲名・アーティスト・BPM | 実装済・確認済 | 入力、紙面反映、保存・JSON往復。BPMは20–400 |
| 原曲キー・演奏キー・カポ | 実装済・改善必要 | 区別して表示できる。schema2では演奏キー／カポ入力がdisabled。実音保持と形の変更を明示する導線が必要。原曲キー表示の変更と実音の移調は同じ操作ではない |
| セクション・小節・拍 | 実装済・改善必要 | セクション追加・命名・小節数変更・削除、小節追加／複製／削除／移動の実装あり。今回、追加・命名・複製・Undoを操作確認。schema2の保存契約は4/4・480PPQ固定。拍子変更は拒否 |
| コード入力・変更 | 実装済・改善必要 | 1小節1入力と複数小節への一括入力。今回、既存コードの正確な位置・長さを保持。複数コードの小節は文字入力で潰さず拒否。**紙面・小節入力は先頭コードしか表示せず、拍別複数コードの作成・編集は未完成** |
| コードフォーム | 実装済・確認済 | 対象コード、楽器条件、候補、使用弦を確認して採用。Undo/Redoと採用フォーム由来のギターMIDIを確認。未確認フォームを演奏可能扱いしない |
| 歌詞と時間位置 | 実装済・改善必要 | 8分／16分と拍別の歌詞セル編集。tick位置を保持。歌詞の一括配置は明示停止中。コード・ドレミと同じ小節内でも、全行が同じ拍別編集UIにはなっていない |
| ドレミ・メロディ | 実装済・改善必要 | 初回の短いドレミ入力、既存音のpitch変更、メロディプレビューの音価・開始位置・休符編集と確認状態。今回、音価変更が後続音を動かさないこと、休符化、Undoを確認。初回文字入力の自動割当時間は未確認であり正確な旋律と断定できない |
| ストローク | 実装済・改善必要 | 基本パターン、個別小節上書き、8分／16分セル、基本へ戻す、Rhythm採用素材の経路。今回セル上書きを確認。採用素材には旧ストローク編集や従来arrangementへ変換できない形式があり、共通再生経路が必要 |
| 楽曲構造の整合 | 実装済・改善必要 | schema2の安定ID、参照検証、操作単位のatomic publication。反復記号・演奏順を定義する製品操作は見当たらず、見た目だけの反復を追加しない |
| Undo/Redo | 実装済・確認済 | Session単一履歴、文字入力group、IME／Modal保護、保存点とのdirty判定。今回コード・小節・フォーム・休符の操作を確認 |
| 保存・再読込 | 実装済・確認済 | 明示保存はRepositoryのraw revision CAS＋Web Locksを使用。失敗・競合・UNKNOWNを成功扱いせずdraftを保持。draftは基本的にメモリ内で、リロードからの自動復旧は未完成 |
| JSON入出力・ファイル | 実装済・確認済 | 未保存内容を含むcanonical StudioProjectをダウンロードし、読込後に明示保存。OSの保存先はブラウザ設定に従う。任意のDesktopパスへの直接上書き・同一ファイル再保存・ファイル優先契約は未実装 |
| 印刷・PDF・操作性 | 実装済・改善必要 | A4コード譜をブラウザ印刷／PDF保存。1440／390pxから独自短曲が1ページになることとPNGレンダリングを確認。一括入力のクリック不可を修正。長曲の改ページ、複数コード、コード・歌詞・ドレミの厳密な横位置は完成受入が必要。五線は印刷対象外 |

作業導線は譜面中心のルーペを再利用できる。一方、基本曲情報が折り畳み内、キー／カポの編集不可、五線側の詳細音価編集とドレミ文字入力の役割分担、使えない歌詞一括項目、上部の多い操作ボタンは初心者に分かりにくい。全面再設計は行っていない。

## 3. 再生の現状と実現方法

譜面／PreDTMには曲を鳴らすtransport・再生開始／停止・再生位置表示がない。PreDTMは伴奏イベントとJSON／MIDI出力であり、音が鳴ることとは別。

再利用できる資産：

- `common-music-model.js` と `structure-conversion.js` は現在のworking Projectから、小節、absolute tick、メロディpitch／音価、休符と空白、コード、ストローク、元ID、診断と確認状態を得られる。4/4は1小節1920tick、480PPQ。秒への変換は `tick / 480 × 60 / BPM`。
- `editing-session.js` のsnapshotとdocument／content世代検査を使い、曲切替や編集後に古いイベントを鳴らさない構成が可能。新しい保存正本は不要。
- `audio-coordinator.js` は音源の所有・停止・競合を扱うが音楽用clockではない。PortメトロノームにはWeb Audioの時刻と先読みschedulerがあるが、現在のStudio接続は独立iframe。曲BPMの自動追従やtransport共有APIはない。
- arrangement-engineはbass／drums／stroke生成、確認済フォームのguitarNotes、MIDI生成を持つ。ただし従来生成は小節先頭コード中心で、全ての拍内コード変更やRhythm素材を正確に扱う再生正本にはできない。推定伴奏と入力済メロディは分ける。

推奨する次の小単位は、独立した開発用transportで「クリック＋確認済メロディ」、開始／停止と小節位置表示を検証すること。未確認の音価を鳴らす場合の表示・明示同意、コード音の生成方針、フォーム未採用時の扱いを先に決める。今回は音色・推定規則を確定せず、新しい再生エンジンも追加していない。

## 4. 保存とクラウド

StudioProjectが単一の正本。譜面は編集ビュー、PreDTMは同じActive Documentのimmutable working snapshotを読む生成ビューであり、独立した曲データを保存しない。伴奏設定にはappSettings側の状態もあるため、現行Project JSONだけで全ての画面設定・生成設定が復元するとは約束しない。

明示保存は `cruiseStudio.project.<id>` と一覧indexを同じWeb Lockの下で更新し、書込前のraw revisionを再確認する。draft／履歴は別のメモリ状態であり、自動保存済と表示しない。既存schema1は読込時に原文を保持してメモリ変換し、明示保存前に永続データを書き換えない。

現行の安全な手元バックアップは **JSON書出し→実ファイルの存在確認→読込／再保存確認**。保存ボタンだけではブラウザ外のバックアップにならない。ローカルファイル優先案は妥当だが、権限・再保存・外部変更検知・別名保存・draft復旧の契約が未決定のため導入していない。

Project CloudにはAccount別catalogue、revision、Outbox、UNKNOWN再照合、競合・削除の既存構造がある。AccountとProは別資格で、さらに運営者admissionが必要。公開creation=falseではcreation repository／Project Cloudを初期化しない。開発入口は既存canary経路を含むが一般公開はしていない。今回はクラウド動作の実機受入や本番Worker／D1／R2操作を実施していない。

## 5. 今回の修正と保護範囲

1. 文字入力／一括入力に `symbolOnly` intentを渡し、単一コードのonset・duration・IDを保持。未指定durationは未指定のまま。同値入力は意味的no-op。
2. 複数コードを持つ小節を単一文字欄で置換・空欄化する操作をエラーにし、全draftを保持。一括入力の途中に該当小節があっても全操作を取り消し、前半だけ反映しない。
3. 既存の明示的な小節全体置換APIとフォーム保護契約は維持。schema2 validator／migration／Repositoryを書き換えていない。
4. 一括入力パネルをviewport基準で配置し、ルーペ内スクロールのclipを回避。親DOM・theme・focus・Escape・print除外は維持。開いたままのresizeでも入力bufferを保持。

変更コードはB所有のSong Modelとsheet-cruise内だけ。Shell、認証、公開feature policy、Port、他4アプリ、共有素材、Workerは不変更。

## 6. 検証結果

| Gate | 結果 |
|---|---|
| 新しいコード保護回帰 | **11 PASS**。修正前は初期8件中7件FAILで再現確認 |
| 保存／schema2／履歴／変換／フォーム等の関連Node | **754 PASS、skip 0** |
| 新しい隔離Chromium統合 | **11 PASS**（親1＋子10）。編集・保存・JSON・フォーム・MIDI・音価／休符・一括入力・5theme×4幅・resize／Escape・印刷 |
| 全Node | **HOLD**。変更前2050件＝2008 PASS／37 FAIL／5 skip。変更後2061件＝2019 PASS／同じ37 FAIL／5 skip。追加された失敗名なし |
| 旧正規15 Browser cohort | **HOLD／未実行**。旧公開入口・旧版・schema1等を前提にしており、現在の公開creation=false／Pro認証下で編集受入として使えない。fixture更新とA側の既存テスト整合は別作業。新suiteの成功で代替PASSとはしない |
| 本物のlocalhost入口 | **Proゲート表示のみ確認**。認証情報を取得・記録していない。正規認証後の利用者操作はHOLD |
| PDF／印刷 | Chromiumで1440／390pxから各1ページのA4 PDF、draft不変。PopplerのPNGで独自短曲の日本語・レイアウト確認。長曲・Safari・実プリンターはHOLD |
| 本番公開受入 | **HOLD**。main merge・Pages公開・本番backend変更なし |

全Nodeの既存失敗は、旧theme数／旧HTML・Shell構成／古いversionや依存の期待値／release件数・license artifact／Git fixtureなど。詳細な失敗名と件数は [results.json](results.json)。既存gateをskip・常時PASSへ変更していない。ブラウザ試験は予約`.invalid` originにローカルコードを配信し、認証依存をテスト用に注入した。正規Pro認証や実ネットワークでの動作保証には数えない。

画面例：[PCの一括入力](bulk-light-1440.png)、[390pxの一括入力](bulk-midnight-390.png)、[印刷プレビュー](print-preview.png)。テストの曲は独自の短い「夜の航路 Original」。

## 7. branchと引継ぎ

成果は `codex/studio-score-phase1-20261111` の単一deliverableとしてcommit・pushし、main向けDraft PRで引き渡す。統合・公開の承認ではない。Aラインには正式patch版、metadata、Shell表示、生成HTMLとESM cache更新、および現行公開版に合う受入fixtureの整理を依頼する。音楽schemaや保存移行をこのUI修正の前提にしない。

## 8. Macでの実機確認

この作業時点では専用serverを起動済み。**[開発版を開く](http://127.0.0.1:18873/)**。正規Pro認証は利用者が既存ゲートで行う。番号・資格・本番storageのコピーは不要。

再起動するときは、18873の既存serverを確認し、この作業で起動したserverだけを停止してから実行する。既存8765／8766は使用しない。generatorは既存出力の上書きを拒否するため、毎回新しい外部ディレクトリを使う。

```bash
cd /Users/murakamimasakuni/.codex/worktrees/studio-score-phase1-20261111/Cruise_apps
SCORE_ENTRY_DIR=$(mktemp -d /private/tmp/studio-score-entry.XXXXXX)
node apps/cruise-studio/scripts/generate-development-entry.mjs "$SCORE_ENTRY_DIR/index.html"
python3 apps/cruise-studio/scripts/serve-development.py "$SCORE_ENTRY_DIR/index.html"
```

確認順：新規→曲情報・BPM→小節を選択→コード／歌詞／ドレミ／ストローク→一括入力をマウスで反映→小節複製とUndo/Redo→Project切替往復→保存→JSONをダウンロード→再読込→JSON読込→印刷でPDF保存。曲の直接再生はまだできない。キー／カポや複数コードの拍別編集も未完成として確認する。テスト用の新規Projectを使い、実ユーザーProjectでの検証はしない。

隔離テストの再実行にはNodeとPlaywright、Chromeが必要。依存はrepo外の `/private/tmp/studio-score-phase1-runtime` に置いた。

```bash
node --test apps/cruise-studio/tests/score-chord-safety.test.mjs
NODE_PATH=/private/tmp/studio-score-phase1-runtime/node_modules node --test apps/cruise-studio/tests/score-phase1.browser.cjs
```

正規認証後のlocalhost確認が難しい場合は、Aラインで本番とは別のhostnameと保存originを用意し、Access等のアクセス制限＋既存Proゲートを維持する検証候補がある。配布物への開発capability同梱の扱いを先に合意し、利用者承認なしにはURLを公開しない。

## 9. 完成までの推奨順序

1. **回帰基盤とデータ保護**：今回の修正を受入。Aと現行入口／version fixtureを整合し、正規Pro認証後の受入を行う。複数コード・手動音価・採用素材を含む独自fixtureを継続利用。
2. **同一時間軸の基本編集**：schema2の既存onset／IDを使った拍別コード追加・変更・削除。紙面にも全コードを配置し、歌詞・ドレミ・ストロークとの位置を揃える。コードフォームへの参照維持を確認。
3. **キー／カポと音価**：実音保持の表示変更と実音移調を区別する導線。ドレミ初回入力の自動割当と、確認済の時間編集を分かりやすくする。4/4以外・反復順序は保存仕様の判断後に別工程。
4. **Phase 1再生**：下記判断後、working snapshot→確認状態を含むイベント→小さなtransport→開始／停止／小節表示。未確定データと推定伴奏を区別して検証。PreDTMエンジンの全採用を前提にしない。
5. **バックアップと仕上げ**：JSONの案内・読込時の同一ID／競合説明、長曲の印刷と多段組／改ページ、狭幅とIME／Safariでの作成完了を受入。ファイル優先・draft復旧は独立した保存契約として進める。
6. Phase 1完成を利用者が承認した後、Aラインで公開を検討する。五線／TABの本格編集とプレDTM拡張はその後。

## 10. 判断が必要な項目

| 判断 | 選択肢と推奨 |
|---|---|
| 最初の再生音 | クリックのみ／クリック＋確認済メロディ／コードとストロークを含む。**小さいtransportの初回はクリック＋確認済メロディを推奨**。最終Phase 1のコード再生要否・音色・フォームなしの扱いは別途確定 |
| 未確認の音価 | 再生しない／明示的な仮再生。**既定は再生対象外とし、仮再生するなら推定であることを表示**。未確認を保存時に勝手に確定しない |
| キー／カポ | 実音保持で表示だけ変更／曲全体を移調。**両操作を区別し、通常のカポ変更は実音保持**。フォームの再選択／再確認が必要な条件も決める |
| ローカルファイル優先 | 現行の明示保存＋JSONバックアップ／File System Access等の同一ファイル再保存。**当面は前者を整備**し、後者はMac／Safariを含む互換性と競合契約を別途決める。クラウドは任意・非公開を維持 |
| 拍子・反復 | Phase 1を4/4の直列小節で受入／他拍子・反復順序も必須。**既存schema2の範囲を先に完成**。範囲拡張はschema／migration判断を伴うため、今回推測で追加しない |

これらは提案であり、製品仕様の承認済決定ではない。
