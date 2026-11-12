# 同じ編集カード内の模擬Account本棚

現在の編集UI・試聴・残課題は [EDITOR_UI_CHECKPOINT.md](EDITOR_UI_CHECKPOINT.md)（0.113.0-dev.1）を参照。

本棚の2段階UIの基準候補 `0.112.0-dev.1`。実Account接続の前段として、既存Sessionへの選択・フォーム採用だけを模擬データで検証する。構成案は [ACCOUNT_CHORD_LIBRARY_INTEGRATION.md](ACCOUNT_CHORD_LIBRARY_INTEGRATION.md)。

## 利用手順

URL： http://127.0.0.1:18874/

1. 未保存のテスト内容を必要に応じて保存してからページを再読み込みする。
2. 譜面クルーズで小節を開き、入力先のコードのマスを選ぶ。
3. コード行の「▼」→「コード本棚を開く」。「詳細設定」を開く必要はない。
4. 最初は本の一覧だけが表示される。「未分類」「テスト」の本を開き、中のコード図を選ぶ。「本棚へ戻る」で本の一覧へ戻れる。
5. 名前とフォームが入力されることを確認する。「テスト」のCは3フレットのフォームで、基本のCと識別できる。
6. 元に戻す／やり直す、明示保存、再読み込み、JSON出力を確認する。右窓でも同じ本棚を利用できる。

模擬本棚は2フォルダ・4件。Cの異なる2フォーム、G7、Amを含む。本棚の表示・フォルダ切替・更新だけではProjectや履歴を変更しない。採用は既存Sessionの1操作で、名前とフォームを一緒にUndo/Redoする。

既存18874サーバーはソースを動的配信するため停止・再起動していない。新しく起動する場合だけ、次を実行する。使用中の18874を停止しない。

```bash
cd /Users/murakamimasakuni/.codex/worktrees/score-feedback-one/Cruise_apps
python3 apps/cruise-studio/scripts/serve-local-ui.py
```

## 実装境界

- `scripts/mock-account-bookshelf.mjs` は固定の合成データを返すだけ。外部通信、資格情報、Account/Sync runtime、localStorageアクセスを持たない。
- factoryと既存local adapterでscheme/host/port/入口markerを検証する。mockは18874以外で拒否。scriptsは公開パッケージとJekyll配信から除外する。
- `book-source.mjs` は資格情報を持たない読取り契約。接続世代・revisionを前後照合し、既存の厳密な名前／フォームvalidatorを再利用する。別のproviderへの切替でもキャッシュを無効化する。
- 応答待ちの閉じる操作・小節/Project切替・編集revision変更で、古い応答を反映しない。接続世代変更時には古いコード図の採用を拒否する。
- 本棚コピーはSessionごとのメモリだけに保持する。元本棚は不変。選択したフォームは既存素材保存契約の `bookshelf` / `fixed` を使う。schema2、Music Model、Repository CASは変更しない。
- 同じカード内で名前とコードクルーズの白黒フォーム図を表示する。余白、図の収まりを浮動カード・右窓の両方で確認する。
- mock入口では旧別タブ／ブックマークの取込みUIを表示せず、旧別タブ起動処理も拒否する。旧JSON互換試験の経路は保持する。
- 18874のbind/Host/CSPは不変。公開Standard/Pro、creation=false、認証・Account/Sync・Worker/D1/R2・外部設定は変更しない。mainへマージしない。

## 検証

```bash
node --test apps/cruise-studio/tests/book-source.test.mjs apps/cruise-studio/tests/local-ui-entry.test.mjs
NODE_PATH=/private/tmp/studio-score-phase1-runtime/node_modules node --test apps/cruise-studio/tests/mock-bookshelf.browser.cjs apps/cruise-studio/tests/local-ui.browser.cjs
```

専用Node試験8件PASS。実18874へroute mockなしで接続する模擬本棚＋既存ローカル試験18件PASS（Chrome/WebKit、skipなし）。本→コードの2段階表示・戻る・採用・Undo/Redo・保存/再読込み/JSON・draft分離・古い応答/接続拒否・読取り失敗からの再試行・閉じる/開き直しを確認。実ユーザーのブラウザ保存領域は使わない。

今回のNode読取り・公開分離・フォーム採用試験17件PASS。コードクルーズUI重点回帰はChrome/WebKit各20件PASS。前候補0.111の譜面編集ブラウザ試験は各73件PASS、Session/Active Document試験93件PASS。

関連Node回帰620件中618件PASS、2件は既存失敗。変更前 `c518e5e1` のファイルを別の一時ディレクトリへ抽出して同じ2件の失敗を再現した。公開HTML内の依存版を固定文字列で検査する `chord-form-adapter.test.mjs` と `chord-form-ui.test.mjs` の試験で、今回の本棚UIとは無関係。試験・公開HTMLを変更してPASS扱いにしていない。

追加確認中にWebKitで一度だけ `The provided value is non-finite` が記録された。各機能のassertionは通過したが、当該実行はconsole試験FAILとして記録した。診断に試験名・stackを追加し、両engineの再試験とWebKit追加3回は全件PASSで再現なし。原因は未特定で、Safari実機受入時にも確認する。

本番認証/Cloud/外部通信と別タブ起動0件を専用ブラウザ試験で確認した。Safariアプリ自体の実機受入、実Account接続、新HTTPS入口、本番側読取りページ・配信・Access/Tunnel設定は **HOLD**。これらは具体的な差分確認後に扱う。

## 0.112の表示調整

編集用コード名は26pxに拡大し、図の上下paddingを圧縮。図のfitは実際のCSS paddingから計算する。コード名は呼出元のfigcaptionだけが所有し、共通drawChordFormはフォームだけを描画する。譜面本体へのフォーム表示は今後の作業とし、保存データは変更していない。

本はコードクルーズ原本の本棚クラス・CSSを再利用する。管理・並替え・列数選択・通常時の更新ボタンは表示しない。模擬データの2冊は未分類3件、テスト1件で、実Accountとは未接続。

Cadd9の原本開放弦修正は84766e44で保全済み。2026-11-12に取得したorigin/main（3d1671b9）にはpreserveOpenTensionCandidatesは未取込み。本番サイトの正式版1.23.5への反映は未確認。このUI作業から本体アプリの配信・mainマージは行わない。
