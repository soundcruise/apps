# 鍵盤の開閉・直接入力オクターブ・全曲試聴

候補 0.97.0-dev.1。00a80658までの成果を保持。

- 再生ヘッドを濃いネイビー、再生中の枠と背景をスチールブルーへ変更した。印刷では再生表示を出さない。
- ドレミ行の下に「鍵盤を開く／鍵盤を閉じる」を同じ位置で切り替えるボタンを配置し、「ドレミ入力」見出しと右端の閉じるを撤去した。同じ帯の←・オクターブ選択・→は、鍵盤を閉じていても利用できる。初期値は既存のtonic octave、範囲は0〜8。モードはSessionごとの一時的なUI設定で、Projectや保存領域に項目を増やさない。
- 直接入力では、新しく入力する音だけに選択オクターブを適用する。既存の文字を残して追加すると、既存音のpitchと安定IDを保持する。全文選択して同じ文字を打ち直した場合は選択オクターブへ変更できる。従来のド↑／ド↓記法は選択オクターブ基準で利用でき、紙面は色だけで識別する。鍵盤で選んだ絶対音高に入力モードを二重適用しない。混在する音高を文字列だけから復元しないため、ドレミの⌘Z／⌘⇧Zは鍵盤・直接入力とも既存Session履歴へ統一した。他の文字入力のnative履歴は維持する。
- 〜は、隣接する前音がある入力済み音を選択した場合、その選択音を前音の伸ばしへ置換する方式とした。例：ド・レ・ミのレを選択して〜ならド〜ミ。選択したレの時間範囲を前のドへ接続し、ドのID・開始位置と残りの音を保持する。既存の空マスへの延長も維持する。ボタンのtitleで置換を説明し、Undoで戻せる。利用者の回答「選択音を伸ばしに置換」により、この動作を確定した。休符・別音への重なり・小節越えを勝手に補修せず、適用できない場合は押した後にも理由を表示する。音数の削除前にdurationを更新し、既存のdetached-draft-reference保護に従う。表示は既存duration／provenanceから〜を導出し、schema2の項目は追加しない。
- 固定カードに「▶ 全曲再生／■ 全曲停止」と再生中の小節番号を追加した。既存のコード×有効ストローク＋Canonicalメロディの小節試聴投影を全小節へ連続して適用する。編集小節や音の選択・Project・履歴を再生で変更しない。コードは引き続き参考ボイシングであり、確認済みフォームへ採用しない。未入力ストローク、未対応の形式・タイ・コードの扱いは既存の試聴条件を維持する。
- 全曲音声は同じAudio Coordinator owner／leaseで、使用する録音だけを先にdecodeし、AudioContext時計を基準に先1秒を短い間隔でscheduleする。61秒を超える曲にも対応し、全曲分のAudioNodeを一度に作らない。停止・編集・Project／Workspace移動・非表示で取り消し、遅延して到着したdecodeや古いtimerから再開させない。scheduleが遅れた場合はずれた演奏を続けず停止する。
- WebKitでは入力から再生ボタンへのfocus移動によるカード更新でclickが失われていた。再生ボタンのprimary pointerdownでfocusを維持し、実18874でも再生開始を確認した。キーボードによるボタン操作は維持する。
- 固定カードの小節操作を文字ラベルに変更し余白を確保。移調は「移調」にまとめ、固定フォーム・未解決コードがある場合は既存の拒否条件に合わせて無効化する。移調成功時に既存Sessionから紙面を更新する。コードフォームは選択小節にコードがある時だけ有効、五線更新は五線表示時だけ表示する。重複する5つの右側ツール起動記号を譜面ツールバーから非表示にし、通常のサイドバー入口は維持。「♫」は「伴奏確認」へ変更した。Studio Shell／template／公開HTMLは変更しない。

検証：Chrome／WebKitで表示・鍵盤・拍入力各55件PASS。既存UI／実18874は22件PASS。本番認証／Cloud／外部通信0件。実18874のHTTP 200、候補meta、CSP connect-src none、host拒否、公開入口へのアクセス拒否、JSON・保存再読込・印刷PDFを確認した。物理スピーカー・実Safariアプリ・日本語IME実機は利用者確認待ち。

広域Nodeは全*.test.mjsを実行し2046 PASS／39 FAIL／5 SKIP。変更前00a80658を一時的な独立worktreeへ展開して同じコマンドを実行すると2041 PASS／39 FAIL／5 SKIPで、失敗した39件の名前が完全一致した。今回追加した試聴・全曲投影・入力照合5件はPASS。前回の選択した試験集合より実行範囲を広げているため、前回の既存4 FAILという数とは対象範囲が異なる。全リポジトリPASSとは判定しない。基線の失敗を隠すためのテスト変更は行わない。

コマンド（worktreeのルートから）：

```sh
NODE_PATH=/private/tmp/studio-score-phase1-runtime/node_modules node --test apps/cruise-studio/tests/score-view.browser.cjs apps/cruise-studio/tests/beat-input.browser.cjs
NODE_PATH=/private/tmp/studio-score-phase1-runtime/node_modules SCORE_ENGINE=webkit node --test apps/cruise-studio/tests/score-view.browser.cjs apps/cruise-studio/tests/beat-input.browser.cjs
NODE_PATH=/private/tmp/studio-score-phase1-runtime/node_modules node --test apps/cruise-studio/tests/score-feedback.browser.cjs apps/cruise-studio/tests/score-phase1.browser.cjs apps/cruise-studio/tests/local-ui.browser.cjs
node --test apps/cruise-studio/tests/*.test.mjs
```

schema2・Music Model基本構造・Repository CAS・Session保存契約・本番認証・Account・Sync・Coming soon・127.0.0.1:18874の安全境界を維持。実ユーザーのProjectやブラウザを試験に使用せず、ユーザーの開いたタブを再読込していない。サーバー再起動・保存領域変更・main merge・本番公開・pushは行わない。Draft PR #268は未更新。

確認URL: http://127.0.0.1:18874/ 。未保存分を保存してから再読込し、0.97.0-dev.1を確認。鍵盤を閉じてオクターブを切り替え、新しいマスへドレミ入力。鍵盤を開いてドレミのうち2音目を選び〜、Undo／Redo。固定カードで全曲再生・停止と再生位置を確認する。

---

以下は前回までの記録。

# マス内の音選択・Delete・ストローク再生と再生位置

候補 0.96.0-dev.1。33fa25c5までの成果を保持。

- 利用者の回答に従い、ドレミの新規休符入力ボタンを一旦非表示にした。ストロークの休符は維持する。「?」は1マスの3音分割などで生じる80tick等をNotation.segmentが表せないことが原因。既存休符のkind／duration／provenanceを保持し、特殊音価には空の表示プレースホルダーと「譜面表記は未確定」の説明を付ける。既存の通常音価の休符記号は維持し、勝手に8分休符や3連符へ置換しない。
- 鍵盤の←→ボタンは、選択中のマス内の安定event IDを順に選び、端で隣のマスへ移動する。前マスへ戻ると末尾の音を選ぶ。＋追加待ちから←なら末尾の既存音へ戻る。移動で音価・履歴・draftを変更しない。小節境界は既存のセル移動経路を使い、遅延した音選択は元のdocument／snapshot／bar／focus位置を確認する。物理キーボードの既存の拍移動・Enter／Tabは維持した。
- 鍵盤の色付き選択中にBackspace／Deleteを押すと、選択中の音だけを既存Session操作で削除する。従来は生のドレミ文字列・オクターブ記号を消そうとし、細かな時間情報のあるreadOnlyセルでは何も消せなかった。残る音のID・位置・音価は維持し、通常の文字入力とIMEはnative編集経路を維持する。
- C2を緑、C6を紫へ変更。C1茶・C3青・C4赤・C5橙・C7ピンク・C8シアンの初期色で識別を改善した。旧appSettingsの初期色が新しい初期色を覆う場合は、その既知の初期値だけを一度更新し、独自の色は維持する。UI設定にsolfegeOctaveColorsVersion=2を記録し、以後は利用者が以前の色を選び直しても再変更しない。Project／Repository／JSONへ色設定やversionを追加しない。
- カードの再生はコード開始位置だけの演奏をやめ、既存の有効ストロークを読み取る。Legacyのstudio-strum-v1と検証済みRhythm owner投影を読み、downは低→高、upは高→低の分散、アクセント、休符、伸ばしのduration、xの短いローカル・ミュート音を反映する。空マスを自動演奏せず、休符で直前の音を止める。各ストロークの位置で有効なコードを選び、duration未指定の前小節のコードは継続する。メロディの音高・位置・音価はCanonicalのまま再生する。
- コードの音は引き続き参考ボイシングであり、確認済みフォームやMIDIへ採用しない。未対応の方向・tieToNextや形式は説明して再生を止め、推測で演奏しない。未対応コードは説明して省く。既存の未知の音価や保存したタイを修復・確定しない。
- 鍵盤にも▶メロディ／■停止を追加。このボタンはギターとストロークを読まず、選択小節のメロディだけを再生する。カード再生との切替は同じAudio Coordinator owner／leaseを使い、古いノート・準備中の開始を取り消す。無音の小節も時計だけを持って再生位置を表示できる。
- 再生ヘッドと拍・音のハイライトを、AudioContext.currentTimeから得る経過秒に合わせて編集カードと紙面へ表示する。表示でSession・選択音・履歴は変更せず、停止・編集・小節／Project／Workspace移動・非表示で消去する。印刷ではヘッドとハイライトを出さない。音源・バックエンド・CSP・Audio Coordinator本体・Studio Shellは不変更。

検証：Chrome／WebKitで表示・鍵盤・拍入力各51件PASS。既存UI／実18874の22件PASS。試聴18件＋Audio Coordinator21件を含む広域Nodeは1095 PASS／既存4 FAIL／1 SKIP。既存4件は前回と同じ固定import／version検査3件と旧Structure redraw正規表現。全リポジトリPASSとは判定しない。

マス内の前後選択、マス・小節境界、＋待ちから戻る操作、readOnlyセルの1音削除とUndo/Redo／IME／native Backspace、80tick休符の保存・JSON・再読込、旧配色の更新と独自色の再保存、8／16表示とは独立した正確なstroke tick・duration、方向・アクセント・休符・x・伸ばし・Rhythm owner sustain、コードの継続、メロディ専用再生、音声時計に沿うヘッド移動、再生切替・全停止・資源解放を確認した。実Web AudioのOfflineAudioContextでも実録音とミュートを混合して確認。物理スピーカー・実Safariアプリ・日本語IME実機は利用者確認待ち。

五線譜化の残課題：任意の音価（例80tick）をどの記譜へ確定するか、複数音をマス内へ仮配分したtimingを利用者がどう確認するか、明示休符と未入力を譜面へどう出すか。今回の表示非表示を理由に既存の休符や未確認timingを削除・丸め・自動確定しない。

schema2・Music Model基本構造・Repository CAS・Sessionの保存契約・本番認証・Account・Sync・Coming soon・127.0.0.1:18874の安全境界を維持。本番認証／Cloud通信0件。未保存分を保存して再読込し、鍵盤の←→・Delete・▶メロディ、カードの▶再生と動くヘッドを確認する。main merge・本番公開・pushは行わない。

---

以下は前回までの記録。

# カード上端移動・休符と伸ばし・小節試聴

候補 0.95.0-dev.1。2f2fa36eまでの成果を保持。

- B側のLoupe上端をviewportの0pxに変更。戻る／ホームに重ねて移動できる。左右境界・下端・Inspectorの制約は維持し、ShellのsafeArea provider本体は変更しない。ヘッダーの「基本に戻す」「Alt+←/→で移動」を削除し、キー操作・既存reset command／保存仕様は維持する。
- ＋の隣に前／次のマスボタンを追加し、休符・〜・⌫を同じ並びへ移動。既存のセルキー操作を経由し、小節境界でも同じ行へ進む。IME・不正入力・古い対象のガードを維持する。
- 休符はCanonicalには存在しても既存Structure投影のmelodyから除外されるため、紙面に出ていなかった。B側の表示callbackでCanonicalの休符を渡し、編集セル・紙面・印刷へ控えめなSVG音楽記号を表示する。全／2分／4分／8分／16分／32分／64分と付点、既存Notation segmentで表現できる複合音価に対応。表現できない特殊音価は「?」と説明で未対応を明示し、既知の音価へ置換しない。schema2や投影の保存契約は変更しない。
- 従来の〜ボタンは選択音のdurationを伸ばしていたが、空の次マスからは使えず、紙面のdurationを表示時に1tickへ縮めたため延長も見えなかった。隣接する前の音を選択中の空マスへ伸ばし、継続するマスに〜を表示する。元の音ID・開始位置は維持。別の音／休符・小節末尾への重なりは拒否し、空欄から孤立した〜を生成しない。鍵盤編集モードでは~／〜／～キーも同じ操作へ委譲し、IMEと通常のテキスト編集は維持する。
- C5初期色をオレンジへ変更。C6は紫、C7はピンク、C1は緑、C8は茶として周辺音域の初期色を区別した。C2・C3・C4と利用者が保存した色設定は維持する。🎨で変更可能。
- カード上部の▶再生で、選択中の1小節のコード開始位置とメロディをBPMどおり試聴する。メロディはCanonicalのpitch・onset・duration、休符は無音。コードは既存Chord Cruiseのquality interval定義から参考ボイシングを一時生成し、Iowa／N. P. Brosowskyのアコギ録音で軽く分散して鳴らす。確認済みフォーム・MIDI出力・Projectへ採用せず、未対応コードは説明して省く。現在はコード開始位置での試聴であり、ストローク行を演奏へ反映する機能や全曲再生は含まない。
- 既存のピアノ試聴owner／Audio Coordinatorを共有してポリフォニーをscheduleする。連打・試聴への切替・編集時のcancel・自動終了・手動停止・全停止・小節／Project／Workspace移動・非表示で停止する。準備中の停止後にdecodeが完了しても鳴らさず、停止失敗時のlease保持を維持する。Audio Coordinator本体やStudio Shellには変更を加えない。
- アコギ13音をCC BY 3.0のtonejs-instruments固定commit 622c2f1c32c8cfce4158ddc3eb26e518ddef37e5から同梱。原音MP3・base64・checksum・原文license/source inventory・再生成コマンドをvendor/guitarとscripts/build-guitar-bank.pyへ保持する。Runtimeは同一originのJSだけを読み込み、CSP connect-src none・外部API遮断・公開package allowlistは不変更。

検証：Chrome／WebKitで表示・鍵盤・拍操作各46件PASS。既存UI／実18874の22件PASS。実18874で実MP3のピアノ・アコギdecodeと再生開始を両エンジンで確認した。実Web Audio OfflineAudioContextで両音源の混合信号と末尾の無音を確認。試聴／小節preview／音源15件＋Audio Coordinator21件を含む広域Nodeは1092 PASS／既存4 FAIL／1 SKIP。既存4件は前回までと同じ固定import／version検査3件と旧Structure redraw正規表現で、リポジトリ全体PASSとは判定しない。

上端0pxへの実drag、ボタンの同一行配置、小節境界の前後移動、不正入力保持、全休符だけの小節とUndo/Redo、印刷SVG、〜の音ID／durationと保存・再読込、自然終了と編集時停止、snapshot／履歴／フォーム採用が試聴で変わらないことを確認。細かな保存タイミングを丸めず、未入力を休符に置換しない。schema2・Music Model基本構造・Repository CAS・本番認証・Account・Sync・Coming soon・サーバー・origin・保存領域は不変更。本番認証／Cloud通信0件。実Safariアプリ・物理スピーカーでの音色は利用者確認待ち。

確認URL: http://127.0.0.1:18874/ 。未保存分を保存して再読込。カードを上端へドラッグし、＋横の←→、空の次マスで〜、休符／消去、▶再生／■停止を確認する。保存データの移行・サーバー再起動・main merge・公開・pushは行わない。

---

以下は前回までの記録。

# グランドピアノ試聴・マス内選択・オクターブ表示色

候補 0.94.0-dev.1。8e86b6acまでの成果を保持。

- 三角波をAlexander HolmのSalamander Grand Piano（Yamaha C5録音、CC BY 3.0）へ置換した。Tonejs/audioのcommit 869b6f8d9cddb47d966238c012041480b1ce517aから30音のMP3を変更せずbase64化して同梱し、最寄りの録音（最大1半音差）をリピッチする。元の録音の減衰を使い、最大1.6秒で短くリリースする。ライセンス／原文／全ファイルのchecksum／再生成コマンドはvendor/pianoとscripts/build-piano-bank.pyに保持し、UIにもクレジットを表示する。再生成だけがネットワークを使い、アプリの再生時は同一originのJSを一度読み込む。CSP・サーバー・外部API遮断・公開package allowlistを変更しない。
- 「小節目・拍目・表裏」と独立した音チップを撤去。鍵盤を開くとドレミのマスを選択して持続枠を表示する。マス内の音を直接選ぶと、その安定event IDだけをハイライトし、鍵盤でその音だけ変更する。＋で同じマス末尾に点線の追加位置を表示する。細かな手動タイミングのマスも音を個別選択でき、音価・位置は保護して＋追加を禁止する。
- 休符SVG・〜・⌫を常時見えるボタンへ変更。休符への変更／空欄への休符挿入／音への復帰／伸ばす／消去／Undo/Redoを確認した。伸ばす先が次の音・休符や小節末尾を越える時はボタンを無効にして理由をtitleへ表示し、失敗時も入力カード内へ説明を出す。タイミングや隣の音を自動変更しない。
- 初期色をC2の水色、C3の従来の青、C4の赤、C5のピンクに変更。🎨でオクターブ別の色を変更でき、「初期色」で戻せる。既存appSettingsへ表示専用の色配列を保存し、Project／Repository／JSON／Undo履歴へ追加しない。紙面・印刷・マス内文字・鍵盤へ同じ色を適用する。
- オクターブ矢印を紙面と色付き表示から除去した。Canonical pitchと直接入力の既存ド↑／ド↓記法は保持し、旧Projectを移行・書換えない。schema2・Music Model・Session／保存契約・Studio Shell・本番認証・Account・Sync・Coming soon・localhost安全境界は不変更。

検証：Chrome／WebKitの表示・鍵盤・拍入力は41件ずつPASS。既存UI・実18874は22件PASS。実18874ではCSP connect-src noneのまま実MP3のdecodeとBufferSource開始を両エンジンで確認し、外部／本番認証／Cloud通信0件。試聴11件＋Audio Coordinator21件を含む広域Nodeは1088 PASS／既存4 FAIL／1 SKIP。4件は前回と同じChord import固定version検査3件と旧Structure redraw正規表現で、前回に変更前HEADでも再現済み。全リポジトリPASSとは判定しない。

録音の実Web Audioオフライン再生で非ゼロ信号、A4周波数、リリース後無音を確認。sample decode待ち中の全停止／連打、decode失敗時の解放も確認した。色変更だけでProjectのdirty／履歴／snapshotが変わらないこと、色設定の再読込、オクターブ矢印除去後の保存・JSONと元の音高一致、1音だけの変更と細かなタイミング保持を確認。390／1024／1440px・拡大時の画面を確認した。物理スピーカーへの出力と実Safariの音色評価は利用者確認待ち。

確認URL: http://127.0.0.1:18874/ 。未保存分を保存してから再読込し、ドレミのマス→鍵盤→音を選択して変更→＋で追加→休符／伸ばす／消去→Undo/Redo→🎨と色の再読込を確認する。サーバー・origin・保存領域は維持。ローカルcommitのみで、公開・main merge・pushは行わない。

---

以下は前回までの記録。

# 3オクターブのドレミ鍵盤と短い試聴音

候補 0.93.0-dev.1。6cf2c188までの成果を保持。

- ドレミ行の入力面と左端を揃え、淡い青の面を直下につなげた。通常は3オクターブ（C3〜C6）を並べ、音域selectと左右ボタンでA0〜C8全域へ移動する。黒鍵の文字を省き、白鍵のドレミと各Cの実音octave、入力済み音の色付きチップに表示を整理した。追加は＋、休符・伸ばす・消去は「編集」内へ移した。
- 鍵盤で受理した音高を0.4秒の短い三角波で試聴する。同じ音を押し直した場合はProjectや履歴を変更せず再試聴する。音ON／OFFはUI状態だけで、保存データへ追加しない。外部音源、通信、マイク入力は使用しない。
- 既存Audio CoordinatorへB側の専用ownerを登録し、音声lease・contextを管理する。他の音声／マイクの所有権を奪わず、連打は直近の1音だけにする。全停止、鍵盤を閉じる、曲／小節／Workspaceの移動、Undo/Redo、タブ非表示／pagehideで停止する。遅延resumeの取り消し、停止失敗時のlease保持と再停止も確認した。Coordinator本体・Shellの所有契約は変更しない。
- Sessionの音高入力経路、ID・拍位置・音価・provenance、保存・Undo/Redoの仕組みを維持。schema2・Music Model・保存契約・本番認証・Account・Sync・Coming soon・localhostの安全境界は不変更。

検証：Chrome／WebKitで表示・鍵盤27件＋拍入力9件ずつPASS。既存UI／実18874サーバー22件PASS。試聴8件＋既存Audio Coordinator21件PASS。実Web AudioのOfflineAudioContextでも非ゼロ信号、A4=440Hz、0.4秒後の無音、context解放を両エンジンで確認した。テストは物理スピーカーへ音を出さず、実Safariの音量・実際の聞こえ方は利用者確認待ち。1440px／1024px／390pxとリサイズの画像・寸法を確認。本番認証／Cloudへの通信0件。

広めの関連Node試験は1056 PASS／4 FAIL／1 SKIP。FAILは既存のChord import／固定version検査3件とStructure redrawの旧ソース正規表現1件で、今回変更前のHEADソースに差し替えても4件とも再現した。前回記載の旧pc-shell-layout静的4件は今回再実行していない。リポジトリ全体PASSとは判定しない。

直接入力の次案（未実装）：低い／基準／高いを選んでドレミを入力する。モードは新たに入力した音だけに適用し、既存音を一括変更しない。明示的なド↑／ド↓を優先し、同じマス内で高さを混在させる場合は音チップで個別選択する。IME中の文字列差分と既存音の同一性を守る設計が必要なため、今回は直接入力の意味を変更しない。

確認URL: http://127.0.0.1:18874/ 。未保存内容を保存してから再読込し、ドレミのマス→鍵盤を開く→音ONで鍵盤を押す。3オクターブの高さ、＋追加、音OFF、保存／再読込、Undo/Redoを確認する。サーバー／origin／保存領域を維持し、公開・main merge・pushは実施しない。

---

以下は前回までの記録。

# 入力セル中央寄せ・記号バランス・ドレミ鍵盤

候補 0.92.0-dev.1。5744966dまでの成果を保持。

- 拍別8／16分ボタンのための下段paddingを除き、各拍グループの右下へ重ねる。セル高は従来の42px／46px×Loupe倍率を維持し、入力と記号の領域をセル全高に広げて上下中央へ揃えた。縦罫線・選択枠も全高に対応する。
- 休符SVGを従来1.3emから0.85emへ縮小し、色を控えめにした。上下矢印は線幅1.65のSVGに統一。楽譜データ・音価は不変。
- ドレミの下に折りたたみ鍵盤を実装。A0〜C8（MIDI21〜108）の範囲を1オクターブずつ表示し、音域select、前後移動、低い／基準／高いの近接ショートカットで移動する。音域選択だけではProject・履歴を変更しない。
- 現在のsolfege tonicと音名綴りに従って鍵盤のドレミ／実音名を表示。入力済みの音をチップで選んで、そのID・開始位置・音価・timing provenanceを保ったままpitchだけを変更する。同じ実音を再度選んだ場合は元の綴りも保持する。
- 空欄への入力と同じマスへの＋追加は既存の拍位置ドレミ入力経路を利用する。既存のauto-assigned／未確定のグループだけを再配分し、手動・確認済み・細かな時間情報があるセルでは追加を止める。音の高さ変更はその場合も安定event IDで1音ずつ行う。休符／伸ばす／消去は同じSession操作履歴を利用し、重なり・境界越えは検証で拒否する。
- オクターブごとの文字色を、編集セル内・選択チップ・鍵盤・紙面に適用。色だけに依存せず、チップと鍵盤には音名＋実音octaveを併記する。鍵盤操作中の複数音も色付きで表示し、文字入力やIMEへ戻ると既存のテキスト編集を維持する。
- 鍵盤操作後の⌘Z／⌘Shift＋Zは既存Session履歴へ局所委譲し、手入力のnative undoを維持する。保存完了後は鍵盤のframeを更新し、古いSession／bar／snapshotのボタンや未確定入力・不正bufferからの書込みを止める。
- 鍵盤を開いたときは画面内に収まる位置へLoupeを補正する。編集4行をflex縮小せず、狭い画面は縦スクロール、ヘッダーはstickyにして操作を保持する。

検証：Chrome／WebKitの表示・鍵盤25件ずつ、拍入力9件ずつPASS。既存UI／実18874サーバー22件PASS。schema2／Repository CAS／Session／履歴／Common Music等633件PASS。中央位置・右下ボタンの寸法、SVG線幅・休符比率、A0／C8、黒鍵・G3 tonic、複数音の1音だけの変更、音価／ID／provenance保持、重なり・IME・古いDOM拒否、保存後の入力継続、Undo/Redo・⌘Z、保存／再読込／JSON、390／1024／1440pxを確認。入力4行と鍵盤を同時に表示した画像も確認した。

既存の旧pc-shell-layout静的4 FAILは前回の変更前でも再現済みで未対応。今回の試験をリポジトリ全体のPASSとは判定しない。実Safariアプリ・物理日本語IMEは利用者確認待ち。

本番認証／Cloudへの通信0件。schema2・Music Model基本構造・保存契約・Studio Shell・本番認証・Account・Sync・Coming soon・localhost安全境界は今回不変更。鍵盤は音高入力用で、音声処理は追加しない。初期案のHTML／PNGは資料として保持する。

確認URL: http://127.0.0.1:18874/ 。保存してから再読込し、ドレミのマス→鍵盤を開く→音域選択→鍵盤→音チップ／＋追加→Tab／保存を確認。公開・main merge・pushは実施しない。

---

以下は前回までの記録。

# 休符・未入力・伸ばしの分離と入力操作

候補 0.91.0-dev.1。a1116c92までの成果を保持。

## 今回の変更

- ストロークは空欄＝イベントなし（未入力）、休符＝既存action:rest＋durationTicks、伸ばし＝直前の演奏イベントのdurationTicks延長として区別する。旧空欄の「・」をセルと紙面から除去。上下／クリック循環は↓・↑・x・伸ばし・休符・未入力の順（上キーは最初の上下順が逆）。R／Spaceで休符、Delete／Backspaceで未入力。休符や未入力の後ろへ孤立した伸ばしは作らない。
- 休符の新規選択は8分マス240tick／16分マス120tickを明示指定する。表示の8／16切替は音価を書き換えない。既存の長い休符は表示区間に分けて描き、内部セルの消去時は前後の休符区間を保持する。既存の未入力を自動的に休符として確定しない。
- 音楽記号がOSのフォントで欠けたため、同梱VexFlow／BravuraのoutlineからSVGを生成し、編集面・紙面・印刷へ同じ記号を使う。フォントの取得・外部通信は追加しない。
- 利用者の明示承認を受け、既存形式の空の小節専用パターンを未入力として扱う最小拡張を実施。setBarStrumSlotsの第4引数keepEmpty:trueを編集カードからだけ指定し、通常の3引数／resetStrumは従来どおり継承へ戻す。getBarEffectiveStrumSlotsは存在する空overrideを基本パターンで埋めない。schema2の項目・Music Modelの基本構造は変更せず、既存データを書き換えない。
- Tab／Shift＋Tabで同じ行の次小節先頭／前小節末尾へ移動。曲の先頭と末尾では留まる。IME／不正入力／遅延focusガードを維持する。
- 歌詞の内容ありセルと行の背景を他の入力面と同じ白へ変更。focus／変換中の表示は維持する。
- Project操作カードへのLoupe重ね移動を許可。B側fallbackとShell safeAreaの上端だけを調整し、戻る／ホームの操作領域、Main境界、Inspector、下端制限は維持する。画面遷移・保存・認証のShell動作は変更しない。

## 検証

Chrome／WebKitの表示・拍入力suite各28件PASS、既存UI・実18874サーバー22件PASS。休符のSVG pathと印刷表示、音価、未入力override、休符の区間分割、Undo/Redo、JSON、保存・再読込、カードのtoolbar重ね移動、歌詞の実際の背景色、既存ド↑／ド↓のpitchとタイミング保持を確認。

Nodeの関連633件PASS。追加した旧pc-shell-layout静的試験は16 PASS／4 FAILで、HEAD a1116c92の変更前ファイルを一時ディレクトリへ展開しても同じ4件がFAIL（Metronome入口、Dockの旧DOM構造、旧CSS検査、旧Modalソース正規表現）。今回の範囲外として試験・実装を書き換えない。全試験PASSとは判定しない。

本番認証／Cloudへの通信0件。localhost安全境界・本番認証・Account・Sync・Coming soonを維持。実Safariアプリ・実プリンターは利用者確認待ち。

## ドレミUI案（未実装）

ui-proposals/doremi-keyboard.html と同PNGが静的な提案。必要な時だけ開く1オクターブ鍵盤＋低い／ふつう／高いを推奨。選んだ音チップの音高だけを変更し、＋で同じマスへ追加、Enter／Tabで次マスへ移動する。現在のキーに対応するドレミと実音octave（C4等）を併記する。五線譜にはオクターブだけでなく拍位置・音価も必要で、複数音の長さを勝手に確定しない。実装は次の判断事項とし、今回はUI案まで。

確認URL: http://127.0.0.1:18874/ 。未保存内容を保存してから再読込。サーバー／originは維持。main merge・公開・pushは実施しない。

---

以下は前回までの記録。

# 拍別コントロールと小節境界のキー操作

候補 0.90.0-dev.1。0fec1e62までの成果を保持。

- ストロークのクリック／上下キー循環へ「〜」を追加。Downは↓→↑→x→〜→空欄、Upは↑→↓→x→〜→空欄。「〜」は既存のstroke durationTicksを延長する。元のない先頭・空欄直後は循環から除外し、直接入力時は説明してデータを保持する。小節をまたぐ伸ばしの新規設計は実施しない。
- コード／ストロークに拍別8／16分ボタンを追加。既存の歌詞用UI状態ストアを行別キーで利用し、Sessionと安定bar IDで分離する。歌詞とドレミは従来どおり連動する。全体設定への自動追従と拍別固定を区別し、Project／JSON／Undo履歴へ表示状態を入れない。
- 粗い表示では細かなイベントを「…」として保護し、分割位置を変更・削除しない。コード／ドレミの既存ガードと同じ考え方をストロークへ適用。ストローク編集は全小節を丸めて再構築せず、既存のexact slotsをコピーして対象位置だけ変更し、従来のStructure operation経由で公開する。別小節が共有する元素材、無関係な音価・accent・tie情報を保持する。
- リサイズハンドルの倍率へ、見出し・拍番号・操作ボタン・8／16分ボタン・余白・ラベル幅も追従させる。編集面に閉じたCSSをBモジュール内で適用し、Studio Shellと公開theme stylesheetは変更しない。切替ボタンの下段スペースを確保して入力文字との重なりを防ぐ。
- 全行で、先頭セルの←は前小節の同じ行の末尾、最終セルの→は次小節の同じ行の先頭へ移動。先頭／末尾小節では留まり、勝手に小節を増やさない。Enter・Tab・Shift＋上下の既存動作とIME／不正入力／遅延focusガードを維持。
- コード欄の縦罫線は、他の行と同じ拍／8分／16分の境界色・幅を利用する。

検証：Chrome／WebKitで表示・操作14 PASSずつ、拍別入力9 PASSずつ。既存UI・実18874試験22 PASS、schema2／Session／Repository CAS／履歴など関連Node382 PASS。伸ばしのcanonical duration、Undo/Redo、JSON出力、保存・再読込、拍別設定のProject間分離、混在解像度での列位置、細かな位置・accentと共有素材の保護、実際のhandle dragによる文字・ボタン倍率を確認。390／1440pxと拡大画像を確認。本番認証・Cloudへの通信0件。実Safariアプリ・物理キーボードは利用者確認待ち。

次の提案（未実装）：Tab／Shift＋Tabでも小節境界を越える統一、F2等で文字内カーソル操作とセル移動を切り替える方式、現在の小節／拍／行とキー一覧の表示。五線譜変換前には「未入力」と「休符」を分ける意味の確認が必要で、今回その保存契約は変更しない。

確認URL: http://127.0.0.1:18874/ 。未保存内容を保存してから再読込する。サーバー・originは維持。schema2／Music Model／保存契約／本番認証／Account／Sync／Coming soon／localhostの安全境界は不変更。ローカルcommitのみでmain merge・本番公開・pushは実施しない。

---

以下は前回までの記録。

# 紙面ズームと編集キーの追加調整

現在のローカル候補: 0.89.0-dev.1。以下は3b0a527dからの実機フィードバック対応。

- 拡大率の基準幅を紙面viewportではなく親ペインから取得し、白い紙面とviewportの幅・高さを同じ倍率で確保する。親ペインで横スクロールするため、紙面内で右側が切れない。縮小・倍率リセットと既存A4印刷を維持する。
- ストロークの上下キーは循環入力。空欄からDown連打で↓→↑→x→空欄、Up連打で↑→↓→x→空欄。d／u／xは直接指定。~／〜／～で直前のストロークを伸ばす。先頭や空欄直後の単独「〜」は既存Music Modelにないため作らず、説明を表示する。
- 歌詞の拍別8／16分ボタンをドレミ行と共有。各セルは時間位置と幅を共有し、見た目の切替だけでイベントのID・位置・音価・provenanceを変更しない。不正入力やIME未確定のbufferがある間は切替を止めて入力欄を保持する。
- 上下キーでコード→ストローク→歌詞→ドレミを移動。ストロークだけ通常の上下キーを記号入力に優先し、Shift＋上下で行移動する。他の行もShift＋上下に対応。解像度が違う行は元のtickを含むセルへ移動し、遅延focusは既存のSession／document／selection／focusガードを利用する。
- 全行の最終セルでEnterを押すと次小節の同じ行の先頭へ進む。曲全体の最後では留まり、小節は増やさない。不正入力・IME変換確定時には移動しない。

検証：ChromeとWebKitで拍入力・表示suite各18 PASS。382件の関連Node試験、既存UI回帰と実18874サーバー試験もPASS。拡大／縮小のviewportと紙面寸法一致、横スクロール、390px表示、A4印刷、混在する拍別解像度、無変更のsnapshot／履歴、ストロークの保存・再読込・Undo/Redo、無効入力保持を確認。実Safariアプリと物理日本語キーボードは利用者確認待ち。

確認URLは http://127.0.0.1:18874/ 。未保存内容を保存してから再読込する。サーバー再起動・origin変更・保存データの移行は不要。schema2・Repository・本番認証・Account・Sync・Coming soon・localhost安全境界は不変更。mainへのmerge／本番公開なし。commitはローカル保全し、pushは未実施。

---

以下は前回候補の記録。

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
