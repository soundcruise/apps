# リズムクルーズ 開発概要（AIエディタ引き継ぎ用）

このファイルは、ChatGPT / Claude Code / Cursor / Codex など、どのAIエディタ・どのチャットで作業を再開しても
「リズムクルーズ」の現状・設計・注意点を正確に引き継げるようにするための資料です。

**リズムクルーズを修正するたびに、`apps/rhythm-cruise/ai-handoff/RHYTHM_CRUISE_OVERVIEW.md`（このファイル）も更新してください。** 更新不要と判断した場合は、完了報告にその理由を書いてください。
ユーザー向けの変更（見た目・文言・機能追加など）を行った場合は、`apps/rhythm-cruise/ai-handoff/rhythm-cruise-overview.html` も合わせて更新してください。

---

## 1. 基本情報

- アプリ名: リズムクルーズ（Rhythm Cruise）
- ディレクトリ: `apps/rhythm-cruise/`
- 通常版URL: `https://soundcruise.jp/apps/rhythm-cruise/`
- PRO版URL: `https://soundcruise.jp/apps/rhythm-cruise/pro_a9f4k7q2m8z/`
- 現在のバージョン: `0.13.9`（`script.js` の `RHYTHM_CRUISE_VERSION`）
- このドキュメント作成時点の最新commit（rhythm-cruise関連）:
  - hash: `847eccc`
  - message: `補正テスト動画リンクの時間表記を追加`
  - ※ リポジトリ全体のHEAD/`origin/main`は、`apps/cruise-studio/`など他アプリの作業により、これより進んでいる場合があります。作業開始時は必ず `git log --oneline -- apps/rhythm-cruise/` でこのアプリ単位の最新commitを確認してください。
- 通常版 / PRO版の構造:
  - 通常版: `apps/rhythm-cruise/index.html`（ルート直下）
  - PRO版: `apps/rhythm-cruise/pro_a9f4k7q2m8z/index.html`（サブディレクトリ）
  - PRO版のパスは意図的にランダムな英数字ディレクトリ名（`pro_a9f4k7q2m8z`）になっており、簡易的なアクセス制限として機能しています。ディレクトリ名は変更しないでください。
- `script.js` は通常版・PRO版で完全に同じファイルを共有しています（PRO版は `../script.js` を参照）。編集は1箇所（ルートの `script.js`）のみで、両版に影響します。
- `theme.css` も同様に共有しています（PRO版は `../theme.css` を参照）。
- Service Workerの扱い:
  - `apps/rhythm-cruise/service-worker.js` は**通常版のみ**が登録します（`index.html` 内の `navigator.serviceWorker.register('./service-worker.js', { scope: './' })`）。
  - **PRO版はService Workerを登録していません。**
  - `service-worker.js` はキャッシュリストを持たず、常にネットワーク優先でfetchする実装です（`fetch` イベントで `fetch().catch(() => caches.match())`）。そのため、通常の機能追加・修正では基本的に触る必要がありません。

---

## 2. 絶対に守るルール

- 作業対象は原則 `apps/rhythm-cruise/` のみ。他アプリ（`apps/fretboard_cruise/`, `apps/pitch-cruise/`, `apps/chord-cruise/` など）は参照のみとし、変更しない。
- `apps/shared/` は原則触らない。触る場合は必ず理由とリスク（他アプリ全体への影響）を説明し、ユーザーの確認を取ってから行う。
- `apps/cruise-studio/` は対象外。別アプリであり、リズムクルーズの作業とは無関係。未コミット変更や未pushコミットが存在することがあるが、絶対に混ぜない。
- `apps/rhythm-cruise/rhythm-cruise-icon-proposal.png` / `.svg` は未追跡ファイルとして存在することがあるが、今回のアイコン検討用であり、作業対象外。stage/commitしない。
- 他の未コミット変更や、pushされていないahead commitを勝手にstage/pushしない。作業前に必ず `git status -sb` で現在の状態を確認し、自分が変更したファイルだけをstageする。
- 既存のマイク補正・Practice（練習本編）・PRO認証・録音レビューのロジックを壊さない。動作確認せずに「たぶん大丈夫」で進めない。
- 大きな構造変更（画面遷移、判定ロジック、マイク処理など）の前には、必ず既存コードを読んで調査する。
- ユーザーが明示的に確認・依頼していない仕様変更（文言の言い回し変更、デザインの独自解釈での変更など）はしない。曖昧な場合は質問する。

---

## 3. 主要ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | 通常版のメインHTML。ホーム/Practice/設定の3画面をSPA的にJSで切り替える。`script.js` と `theme.css` をルート相対で読み込む。 |
| `pro_a9f4k7q2m8z/index.html` | PRO版のメインHTML。`index.html` とほぼ同一のDOM構造だが、`<html data-app-edition="Pro">` が付き、`../script.js` `../theme.css` を参照。`shared/pro-gate.css` `shared/pro-gate.js` を追加読み込みし、パスワード認証を行う。 |
| `script.js` | アプリ全体のロジック（画面制御・Practice判定・マイク処理・録音レビュー・PROロック・設定保存など）を1ファイルに集約。通常版/PRO版で共有。 |
| `theme.css` | 見た目全体を1ファイルで完結（`shared/`には依存しない設計）。通常版/PRO版で共有。 |
| `info.html` | インフォメーション入口ページ。説明動画（準備中扱いを解除済み）・基本的な使い方・利用規約・プライバシーポリシーへのリンクを掲載。 |
| `usage.html` | 「基本的な使い方」の説明ページ。アプリ概要・練習の流れ・タップ/ストロークモード・マイク設定・結果カードの見方などを解説。 |
| `mic-correction-help.html` | 「補正テストのやり方」動画ヘルプページ。設定→マイク設定の`?`ボタンから開く。YouTube動画リンク（確認カード経由）を掲載。 |
| `terms.html` | 利用規約ページ。リズムクルーズ専用（指板クルーズ・音感クルーズにはリンクしない、リズムクルーズ内で完結）。 |
| `privacy.html` | プライバシーポリシーページ。同上、リズムクルーズ専用。 |
| `click-input-help.html` | 「マイク位置がわからない場合」の単発ヘルプページ。有線/Bluetoothイヤホン・スマホ本体マイクの位置説明図（SVG）付き。`script.js` の `resume=click-input` パラメータと連動し、戻ると元の設定状態に復元される仕組みがある（やや複雑。触る場合は要調査）。 |
| `mic-restart-help.html` | 「マイクが反応していない場合」の単発ヘルプページ。アプリの完全終了手順（iPhone/Android）を説明。`theme.css?v=0.11.21` を参照したままの古いバージョン指定が残っている（要修正候補だが、今回のドキュメント作業では未修正）。 |
| `service-worker.js` | 通常版のみが登録するService Worker。キャッシュリストなし、常にネットワーク優先。 |
| `manifest.json` | 通常版PWAマニフェスト。name: 「リズムクルーズ」、theme_color: `#ff9f1c`。 |
| `pro_a9f4k7q2m8z/manifest.json` | PRO版PWAマニフェスト。name: 「リズムクルーズ PRO」、内容はほぼ同一。 |

---

## 4. 画面構成

`script.js` 内で `currentScreen`（`'home' | 'practice' | 'settings'`）と `homeView`（ホーム内のサブビュー）で管理。

- **ホームTOP**（`homeView === 'top'`）: 「リズム練をする」「リズムを作る」の2カード＋インフォメーション`i`ボタン。共通ナビ（戻る/TOP）が唯一隠れる画面。
- **リズム練をする**: STAGE1〜6（固定STAGE）＋PROカスタムSTAGE一覧を表示。タップ/ストロークの入力方式トグルあり。
- **リズムを作る**: STAGE1〜5相当の教材的な「作って聴く」機能＋PROカスタムSTAGE管理導線＋保存済みリズム一覧。
- **Practice画面**（`screen-practice`）: スクロール譜面型のリズム判定本編。譜面プレビュー、進行状況、タップ/ストローク入力エリア、開始/停止、結果カードへ遷移。
- **設定画面**（`screen-settings`）: タブ切り替えで以下4つ。
  - **マイク設定**（`settings-tab-mic`）: 補正テストの入口（`#settings-detail-btn`＝「補正テストを始める」＋隣に`?`ヘルプボタン）、保存済みプリセット、手動設定。
  - **タップ設定**（`settings-tab-tap`）: 画面タップ時の音ズレ補正。
  - **判定**（`settings-tab-judge`）: 判定のきびしさ（5段階プリセット）。
  - **クリック音**（`settings-tab-click`）: クリックを鳴らす範囲・拍・裏拍設定。
- **インフォメーションページ**（`info.html`）: ホームTOPの`i`ボタンから遷移。
- **基本的な使い方ページ**（`usage.html`）: `info.html` から遷移。
- **補正テスト動画ヘルプページ**（`mic-correction-help.html`）: マイク設定カードの`?`ボタンから遷移。
- **利用規約/プライバシーポリシー**（`terms.html` / `privacy.html`）: `info.html` から遷移。

---

## 5. 通常版 / PRO版の違い

- 判定方法: `<html>` タグの `data-app-edition="Pro"` 属性の有無。`script.js` の `isProEdition()` がこれを読む。
  ```js
  function isProEdition() {
      return document.documentElement?.dataset?.appEdition === 'Pro';
  }
  ```
- PRO認証: PRO版HTMLのみ `shared/pro-gate.css` / `shared/pro-gate.js` を読み込み、`window.__SOUNDCRUISE_PRO_GATE__ = { passwordHash, gateVersion }` でパスワードゲートを構成。**この認証まわりは `shared/` に属するため、リズムクルーズ側から不用意に変更しない。**
- PROロック対象（`script.js` 内 `RHYTHM_PRO_LOCK_MESSAGES` に定義。通常版でタップすると `window.alert` で案内）:
  - カスタムSTAGEの作成・保存・練習開始（`proCustomStage` / `proCustomStageStart` 等）
  - 作成したリズムの保存・練習開始・プリセット保存（`rhythmCreateSave` / `rhythmCreateStart` / `rhythmCreatePresetSave`）
  - 保存済みリズム・保存済みカスタムSTAGEの呼び出し（`savedRhythms`）
  - クリック音の詳細設定（`proSettings`）
  - Practice設定（BPM・小節数・拡大・くり返し練習）の変更（`proPracticeSettings`）
  - リズム作成設定（BPM・パターン長・小節数・拡大）の変更（`proCreateSettings`）
  - カスタムSTAGE再生設定の変更（`proCustomStageSettings`）
  - コードストローク検出モード（`proStrokeChordMode`）
- 通常版で使えるもの: STAGE1〜6の固定STAGE練習、タップ/ストロークモードでの練習本編、マイク設定・補正テスト全般、判定設定、クリック音設定、インフォメーション/使い方ページ全般。
- PRO版で使えるもの: 上記PROロック対象すべて＋PROカスタムSTAGEの一覧・並び替え・削除。
- 通常版/PRO版で共有しているJS/CSS: `script.js`・`theme.css` は完全共有（1ファイルを両方が読む）。分岐はすべて `isProEdition()` によるランタイム判定。
- PRO版の戻り導線・相対パス注意:
  - PRO版から `info.html` 等へ遷移するリンクは `../info.html?from=home&edition=pro` のように、**1階層上へ戻る相対パス**になる。新しいヘルプページ等を追加する際、通常版は `xxx.html`、PRO版は `../xxx.html` を必ず両方修正すること（片方だけ直すとPRO版が404になる）。
  - 各静的ページ（`info.html` 等）は `edition` パラメータや `document.referrer`、`sessionStorage`（キー: `rhythmCruiseEditionHome`）を使って「どちらの版から来たか」を推定し、ホームへ戻るリンク先を `./index.html` か `./pro_a9f4k7q2m8z/index.html` のどちらかに自動解決する仕組みになっている（`normalizeEditionHome` / `resolveHomePath` という同名の関数が各静的ページに重複実装されている。共通化はされていない）。

---

## 6. リズム練習機能

- **STAGE選択**: 固定STAGE1〜6（例: 基本の4ビート、基本の8ビート、空振りが入る8ビート、弾き語り王道の8ビート/16ビートパターン、小節またぎのシンコペーション）＋PRO版のみPROカスタムSTAGE。
- **タップモード**: 画面のボタン（ダウン/アップ、または統合タップ）をタップしてリズムを取る。マイク不要。
- **ストロークモード**: マイクでギターのストローク音を検出して判定。`state.inputMode === 'stroke'` のときのみマイク関連処理が有効になる。
- **リズムプレビュー**: VexFlowで譜面を描画し、読み取り専用のプレビュー再生ができる（`custom-test-preview-play` ボタン等）。判定・スコアには影響しない。
- **判定**: `state.judgePreset`（`'easy' | 'standard' | 'semiStrict' | 'strict' | 'veryStrict'`。既定値は `'semiStrict'`）で判定幅のきびしさを切り替え。GOOD/EARLY/LATE/MISSの判定はこのプリセットとタイミング補正値をもとに算出。
- **結果カード**: GOOD（緑・ちょうど良いタイミング）/EARLY（青・少し早い）/LATE（赤・少し遅い）の内訳と平均ズレを表示。「過去の結果を見る」から履歴を振り返れる（結果履歴には録音データは含まれない＝録音はそのPracticeだけの一時データ）。
- **小節数/BPM等のロック仕様**: 通常版の固定STAGEはSTAGEごとのデフォルトBPM/小節数に固定され、変更できない（`isStandardEdition()` 判定でlocalStorageの保存値を無視してSTAGEデフォルトへ強制する処理がある）。BPM・小節数・拡大・くり返し練習の変更はPRO版限定。

---

## 7. リズム作成機能

- 通常版でも「リズムを作る」画面自体は開けるが、**保存・練習開始・プリセット保存はPRO版限定**（`rhythmCreateSave` / `rhythmCreateStart` / `rhythmCreatePresetSave` ロック）。通常版はお試し編集・プレビュー再生のみ。
- 保存/カスタムSTAGEの扱い:
  - 「リズムを作る」で作った内容を「練習STAGEとして保存」すると、PROカスタムSTAGE一覧に追加される（PRO限定）。
  - PROカスタムSTAGE編集画面（`home-pro-custom-edit`）では、拍子・最小音符・リズムタイプ（ストレート/シャッフル）・パターン・再生設定（BPM/パターン長/小節/拡大）・プリセット保存・削除ができる。
  - 保存済みリズム一覧（`home-rhythm-create-saved`）は「リズムを作る」から独立した導線として存在。
- 触る時の注意点: STAGE1（固定練習STAGE）とPROカスタムSTAGE・リズム作成の内部状態（`state.routeEditor`・`proCustomEditDraft`・`_stagingMelodySlotOrder`相当の各種一時state）が入り組んでいるため、保存・編集フローを変更する場合は既存コメント（`v0.9.xxx` 形式のバージョン注記が多数残っている）を必ず読んでから着手すること。

---

## 8. マイク設定・補正まわり（重要・特に丁寧に扱うこと）

- **目的**: 端末・イヤホン・環境によって「音を鳴らしてからマイクに届くまでの遅延」や「マイク感度」が大きく異なるため、実機で補正テストを行い、リズム判定が正しく機能する状態に整える。
- **入力環境の種類**: 通常マイク（本体マイク、イヤホンなし）/ 有線イヤホン / Bluetoothイヤホン。設定はこの3種類ごとに保存される。
- **端末による補正テストの考え方**: 補正テストウィザードは「端末選択（iPhone/Android）→入力タイプ→イヤホンの種類→ストローク検出モード」の順に進み、`selectedTestPlatform` にAndroid/iOS(new)などの種別を保持して以降のテスト内容を出し分ける。
- **音ズレ・遅延テスト**: イヤホンのクリック音とマイクで拾う音の実測ズレを測定し、自動で補正値を算出する（`startMicTestFlow` 系）。
- **マイク反応テスト**: 実際のストローク音を拾いやすい感度になっているかを、8回ストローク等で確認する自動フロー（`test-card`）。
- **最終確認テスト**: 一連の設定が本番のPractice画面に近い状態で機能するかを最後に確認するステップ。
- **手動設定**: 「現在の設定を手動で変更」から、タップ補正・マイク感度・クリック音量などをスライダーで直接調整できる（確認用の補正テストを経由しないショートカット）。
- **補正値の考え方**: 判定に使う遅延補正・感度・裏拍設定などはすべて `state` 内に保存され、`localStorage` に永続化される。判定ロジック本体（`schedulePreviewClick` / `scheduleStageClick` 等のタイミング計算）は録音レビュー専用の一時補正（後述）とは完全に分離されている。
- **ストロークモードではマイクを使うこと**: `state.inputMode === 'stroke'` のときのみ `startMic()` / `stopMic()` 系の処理が有効になる。タップモードではマイク関連処理は一切実行されない。
- **iPhone本体スピーカーの音量低下について**: iPhone本体スピーカーを使用中、マイクを同時に使っている（ストロークモード等）と、プレビュー音・クリック音が小さく聞こえる場合がある。これはiOSの音声処理（マイク使用中のスピーカー出力抑制）による可能性が高く、**アプリ側のバグやgain設定の不備ではなく、現状は仕様として扱う**（安易に「音量が小さいのはアプリのgain値の問題」と誤認してgainロジックに手を入れない）。
- **補正テストの動画ヘルプ**（`mic-correction-help.html`）:
  - 「詳しいやり方はこちらの動画（11:35〜）を参照してください。」という案内文＋動画リンクカード1つのみのシンプルな構成。
  - 動画URL: `https://youtu.be/m0a4IAK5N9E?t=695`（11:35 = 695秒。この`?t=695`は必ず維持すること）。
  - リンクボタン文言: `【動画】補正テストのやり方を見る(11:35~)`
  - クリックすると直接YouTubeへは飛ばず、**YouTube確認カードを挟む仕様**（詳細は11章）。
  - 設定→マイク設定カードの「補正テストを始める」ボタンの隣にある小さな`?`アイコン（`.rc-mic-help-link` / `.rc-mic-help-icon`）から遷移する。

---

## 9. 録音レビューまわり（分かる範囲・特に慎重に扱うこと）

- **目的**: Practice終了後の結果カードで、そのPracticeの録音を聴き返せるようにする「振り返り専用」の機能。
- **`MediaRecorder`を使用**: `practiceRecordingMimeType()` で対応MIMEタイプを判定し、ストロークモードでのPractice中にマイクの `MediaStream` を録音にも共用している（判定用ストリームとは別に、録音用に分岐して使っているだけで、判定ロジックには一切接続しない設計）。
- **録音レビューと「後付けクリック」の扱い**: 録音そのものにはBluetoothイヤホン等でクリック音が入りにくいことがあるため、振り返り再生時にクリック音を後から重ねる「後付けクリック（reviewClick）」という仕組みがある。これは録音開始（game-time 0）を基準にした相対時刻で予約再生されるもので、**判定・履歴・localStorageには一切関与しない、表示・体験専用の一時データ**。
- **過去に同期問題があったこと**: コード内コメント（`v0.10.25`〜`v0.10.50` 相当）に、片側チャンネルのみ録音される問題（例: Apple有線EarPodsで右chがほぼ無音）への対応、Bluetoothでクリックが録音に入らない問題への「後付けクリック」対応など、過去に発生した同期・音声経路の問題への対処が多数残っている。
- **現状の注意点**:
  - 本体マイク録音時はPractice自体のクリック音が録音に入りやすいため、後付けクリックの初期音量は0%になっている（有線/Bluetoothは従来値を維持）。
  - 2ch録音で片側がほぼ無音の場合、音のある側をL/R両方に複製して再生する補正がある（これも表示専用、判定には影響しない）。
- **方針**: 手動補正ではなく、内部ロジック（自動判定・自動オフセット計算）で同期させる方針を取っている。**録音レビューまわりは、コード内のコメント（"判定には使わない" "一時state" 等の記載）を必ず確認し、安易に触らない・安易に「シンプル化」しないこと。** 過去に発生した実機依存の細かい問題への対処が積み重なっている領域のため、変更する場合は影響範囲を広めに調査してから着手する。

---

## 10. インフォメーションまわり

- **ホームTOPの丸い `i` ボタン**: 「リズム練をする」「リズムを作る」の下に1箇所だけ配置（指板クルーズ方式を踏襲。ゲーム中画面や複数箇所への設置はしていない）。通常版は `info.html?from=home&edition=standard`、PRO版は `../info.html?from=home&edition=pro` へ遷移。
- **`info.html`**: インフォメーションの入口ページ。「説明動画を見る」（有効化済み、文言は「【動画】正しい使い方と初期設定」、URL `https://youtu.be/m0a4IAK5N9E`）、「基本的な使い方」（シンプルな下線リンク）、「利用規約」「プライバシーポリシー」「お問い合わせ」（`.rc-info-footer-links`。指板クルーズの見た目・配置に合わせた軽量テキストリンク）を掲載。
- **`usage.html`**: アプリ概要・基本の流れ・タップ/ストロークモードの説明・マイク設定について・結果カードの見方・リズムを作る、を掲載。
- **説明動画ボタン**: `info.html` と `mic-correction-help.html` それぞれに専用の動画リンクがあり、URLも文言も別物（`info.html` は概要・使い方の動画、`mic-correction-help.html` は補正テストのやり方の動画で`?t=695`付き）。混同しないこと。
- **YouTube確認カード**: 詳細は11章。
- **`terms.html` / `privacy.html`**: リズムクルーズ専用の内容。指板クルーズ・音感クルーズのページへはリンクしない設計（各アプリ内で完結）。
- **お問い合わせ**: `mailto:soundcruise.inc@gmail.com` 固定。
- **指板クルーズ方式をベースにしていること**: ボタンの見た目・配置思想（丸い`i`アイコン、ホームTOP直下1箇所、別ページ遷移でモーダルは使わない）は `apps/fretboard_cruise/info.html` を参考にしているが、class名は `rc-info-*` としてリズムクルーズ専用に独立させている（`shared/style.css` は使わない）。
- **Newバッジや初回吹き出しは入れていないこと**: 指板クルーズ・音感クルーズにある「New」バッジや初回だけ出る吹き出し演出は、リズムクルーズには意図的に実装していない（今後入れる場合は要検討・要確認）。
- **PRO案内はまだ入れていないこと**: `info.html` 内にPRO版の入手案内リンクは現状ない（指板クルーズ・音感クルーズにはあるが、リズムクルーズはまだ未実装）。

---

## 11. YouTube確認カード仕様

- 動画リンクをクリックしても**すぐにYouTubeを開かない**。
- 代わりに「YouTubeを開きます」という確認カード（オーバーレイ＋ダイアログ）を表示する。
  - タイトル: `YouTubeを開きます`
  - 本文: `アプリを離れて、YouTubeページを開きます。よろしいですか？`
  - ボタン: `キャンセル` / `YouTubeを開く` の2つ
- 閉じる方法: キャンセルボタン／背景（オーバーレイ）クリック／Escapeキー、いずれでも閉じられる。
- 「YouTubeを開く」を押すと `window.location.href = pendingYoutubeUrl` で遷移する（`window.open` は使わない。同一タブでの遷移）。
- 実装箇所: `info.html` と `mic-correction-help.html` の両方に、**ほぼ同一のHTML/CSS/JSがそれぞれ独立して実装されている**（class名は共通で `.rc-info-youtube-confirm*`。CSSは `theme.css` 内で一本化・共有済みだが、JSロジック自体は各HTMLファイルの `<script>` 内に重複して書かれている）。
- **共通化はまだしていない**。static pageごとにJSを複製する方針は、`script.js` や `shared/` に触れずに安全に完結させるため、意図的に選んだもの。
- **将来共通化する場合の注意**: 共通化のために新しい共有JSファイルを作る、あるいは `shared/` 配下に置くという判断をする場合は、他アプリへの影響やキャッシュ・読み込み順序への影響を洗い出したうえで、必ずユーザーに確認してから進めること。安易に「DRYにしたいから」で `shared/` に触らない。

---

## 12. バージョン更新ルール

機能追加・修正・文言変更など、何かを変更したら以下を必ず更新する（文言だけの変更でもキャッシュ整合性のため必須）。

- `script.js` 内の `RHYTHM_CRUISE_VERSION`
- 通常版 `index.html` の `script.js?v=`
- PRO版 `pro_a9f4k7q2m8z/index.html` の `script.js?v=`
- 通常版 `index.html` の `theme.css?v=`
- PRO版 `pro_a9f4k7q2m8z/index.html` の `theme.css?v=`
- `info.html` / `usage.html` / `terms.html` / `privacy.html` / `mic-correction-help.html` の `theme.css?v=`（これらのページは`theme.css`を参照しているため、CSSを変えていなくてもバージョン表記は揃える運用にしている）

補足:
- CSSを一切変えていない回でも、上記ファイル群の `?v=` は新バージョンに揃えるのが、これまでの運用実績（過去のcommit参照）。
- Service Workerは原則変更不要（キャッシュリストを持たないため）。ただし、キャッシュ関連の変更を疑う場合は必ず `service-worker.js` の中身を確認してから判断する。
- `manifest.json` / `pro_a9f4k7q2m8z/manifest.json` の `?v=` は、アイコンやPWA設定自体を変更したときのみ更新対象（通常のUI/文言修正では触らない）。
- `click-input-help.html` / `mic-restart-help.html` は独自に古い `theme.css?v=` を参照したまま更新されていない箇所がある（例: `mic-restart-help.html` は `theme.css?v=0.11.21`）。これらを触る作業を行う場合は、ついでに最新版へ揃えるかどうかユーザーに確認すること（今回のドキュメント整備では未修正のまま）。

---

## 13. GitHub Pages反映トラブル運用

- push後、GitHub Pagesの本番が古いままになることがある（実績あり）。
- 原因は主に、GitHub Pagesの `pages build and deployment` ワークフローの `deploy` jobが失敗する、または `queued` のまま詰まるケース。
- この場合、**コードやpush自体には問題がない**ことがほとんど。空commitや再実装で直そうとしないこと。
- 過去に、`gh` CLIで以下のPages build APIを1回実行し、復旧した実績がある。
  ```bash
  OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
  gh api -X POST "repos/$OWNER_REPO/pages/builds"
  ```
- 確認コマンド例:
  ```bash
  curl -s "https://soundcruise.jp/apps/rhythm-cruise/script.js?v=VERSION" | grep "const RHYTHM_CRUISE_VERSION"
  curl -I "https://soundcruise.jp/apps/rhythm-cruise/usage.html"
  ```
  （`VERSION` は確認したいバージョン番号に置き換える）
- GitHub Actions画面で該当ワークフローをrerunしても `Queued` のまま詰まることがある。その場合はPages build APIの実行が有効な対処。
- `gh` CLIが使えない・未認証の環境では、Pages build APIは実行できない。その場合は「認証済みの `gh` が使える環境で実行してほしい」と明確に報告し、コマンドを提示するに留める（無理にインストール・認証しようとしない）。
- 逆に、pushしてすぐ（デプロイ完了から数分以内）に実機で確認すると、CDN側のキャッシュ伝播タイミングのズレで一時的に古い表示になることがある。これは deploy自体は成功しているケースなので、**コードの問題と誤認しないこと**。数分待つ、または強制リロードしてから再確認する。

---

## 14. 最近の主要commit履歴（rhythm-cruise関連）

`git log --oneline -- apps/rhythm-cruise/` で確認した実際の履歴（新しい順）。

- `847eccc` 補正テスト動画リンクの時間表記を追加
- `541db1c` リズムクルーズの補正テスト動画ヘルプを追加
- `fbeb8ac` リズムクルーズの説明動画リンクを追加
- `2a8fbf9` リズムクルーズのインフォメーション画面のフッターUIを指板クルーズ寄りに調整
- `f0c899b` リズムクルーズのインフォメーション構成を整理
- `bde60e6` リズムクルーズにインフォメーションページを追加
- `a03d973` リズムプレビューのクリック音量を固定
- `062ff9f` Android本体マイク補正テストの補助文を調整
- `b2215c8` Android本体マイク補正テストの案内文を調整
- `12f9882` リズムクルーズの判定設定タブを追加

（この10件はユーザー提示のリストと完全に一致することを`git log`で確認済み。）

より古い履歴（参考・存在確認済み）:
- `81c59d7` リズムクルーズのデザイン参照スクショを追加
- `485700f` デザイン仕様資料に利用時の注意を追記
- `706ac91` リズムクルーズのデザイン仕様を整理
- `8169a43` 通常マイクの表示名をイヤホンなしに変更
- `5d9028a` PROステージカードの進むマークを削除
- `ce3f5de` PROステージカードの進むマークと補助ボタンを調整
- `1980d76` PROステージカードに進むマークを追加
- `4772f91` 通常版のPROステージ開閉ボタンをPractice遷移に統一
- `90c9839` PROステージの開閉ボタンを控えめに調整
- `6276995` 全データ初期化ボタンを追加

---

## 15. 今後の運用ルール

- リズムクルーズを修正したら、`apps/rhythm-cruise/ai-handoff/RHYTHM_CRUISE_OVERVIEW.md` も更新する。
- ユーザー向けの変更（見た目・機能・文言）を行った場合は、`apps/rhythm-cruise/ai-handoff/rhythm-cruise-overview.html` も更新する。
- 更新不要と判断する場合は、完了報告にその理由を書く（例:「今回はバージョン表記の同期のみで、設計・仕様への影響がないため更新不要」など）。
- AIエディタへの依頼プロンプトには、このファイルの存在と「触ってよい/悪い」ルールを毎回含めることが望ましい。
- 不明点・曖昧な指示は、実装前に必ず質問する。「たぶんこうだろう」で進めない。
- 「調査のみ」と「実装」の依頼ははっきり分けて扱う。調査のみと言われた場合はファイルを一切変更しない。

---

## 16. よくある事故と回避策

| 事故 | 回避策 |
|---|---|
| 他アプリ（指板クルーズ・音感クルーズ等）を誤ってstageしてしまう | `git add` は変更したファイルを明示的に列挙する。`git add -A` / `git add .` は使わない。 |
| `apps/cruise-studio/` の未コミット変更・ahead commitを巻き込む | コミット前に必ず `git status -sb` で対象外ファイルが混ざっていないか確認する。 |
| `rhythm-cruise-icon-proposal.*` をstageしてしまう | 同上。未追跡ファイルとして常に存在しうることを前提に確認する。 |
| PRO版HTMLの相対パスを間違える（`./xxx.html` のまま等） | 新規リンク追加時は「通常版は`xxx.html`、PRO版は`../xxx.html`」を必ずセットで確認する。 |
| `theme.css?v=` の更新漏れ | バージョンを上げた回は、`theme.css`を参照する全HTMLファイル（`index.html`両版、`info.html`, `usage.html`, `terms.html`, `privacy.html`, `mic-correction-help.html`）の`?v=`を漏れなく揃える。 |
| 本番が古いのをコードミスと勘違いする | GitHub Actionsのdeploy結果を確認し、成功しているなら数分待つかキャッシュ回避で再確認。失敗しているなら13章のPages build APIを検討。 |
| マイク補正ロジックに不用意に触る | 8章・9章を読んでから着手。既存の`v0.9.xxx`等のコメントに沿って影響範囲を確認する。 |
| YouTubeリンクを即外部遷移にしてしまう | 新しい動画リンクを追加する際も、必ず11章のYouTube確認カードを経由させる。 |
| iPhoneマイク使用中の音量低下をアプリのgain問題と誤認する | 8章の通り、現状は仕様として扱う。安易にgain値を変更しない。 |

---

## 17. 次回作業開始時チェックリスト

1. `git status -sb` で現在の変更状態を確認（他アプリの変更が混ざっていないか）
2. `git log -5 --oneline` および `git log --oneline -- apps/rhythm-cruise/` で直近の履歴を確認
3. `git rev-parse HEAD` と `git rev-parse origin/main` を比較（ずれている場合、原因が自分の作業か他アプリの作業かを切り分ける）
4. 今回の作業対象ファイルを明確にする（このファイルの「主要ファイル構成」を参照）
5. 未追跡ファイル（`rhythm-cruise-icon-proposal.*` 等）が対象外であることを再確認
6. 本番バージョンを確認（`curl -s ".../script.js?v=X" | grep RHYTHM_CRUISE_VERSION"`）し、ローカルと本番の状態を把握
7. 通常版/PRO版それぞれの相対パス（`./` と `../`）を意識して両方に変更を反映する
8. 変更後は、通常版・PRO版それぞれでスクリーンショット確認・コンソールエラー確認・関連導線のクリック確認を行う
9. 変更内容に応じて、`apps/rhythm-cruise/ai-handoff/RHYTHM_CRUISE_OVERVIEW.md` と `apps/rhythm-cruise/ai-handoff/rhythm-cruise-overview.html` の更新要否を判断する
