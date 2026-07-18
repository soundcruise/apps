# 指板クルーズ 開発概要（AIエディタ引き継ぎ用）

このファイルは、ChatGPT / Claude Code / Cursor / Codex など、どのAIエディタ・どのチャットで作業を再開しても
「指板クルーズ」の現状・設計・注意点を正確に引き継げるようにするための資料です。

**指板クルーズを修正するたびに、`apps/fretboard_cruise/ai-handoff/FRETBOARD_CRUISE_OVERVIEW.md`（このファイル）も更新してください。** 更新不要と判断した場合は、完了報告にその理由を書いてください。
ユーザー向けの変更（見た目・文言・機能追加など）を行った場合は、`apps/fretboard_cruise/ai-handoff/fretboard-cruise-overview.html` も合わせて更新してください。

---

## 1. 基本情報

- アプリ名: 指板クルーズ（Fretboard Cruise）
- ディレクトリ: `apps/fretboard_cruise/`
- 通常版URL: `https://soundcruise.jp/apps/fretboard_cruise/standard/`（要確認: トップレベルのリダイレクトが別途あるかは未確認）
- PRO版URL: `https://soundcruise.jp/apps/fretboard_cruise/pro_a9f4k7q2m8z/`
- 現在のバージョン: `2.8.3`（`script.js` 内 `FRETBOARD_CRUISE_APP_VERSION`）
- 最新commit（fretboard_cruise関連、`git log --oneline -- apps/fretboard_cruise/` で確認）:
  - hash: `a75bf6dc`
  - message: `指板クルーズ通常版の設定を公式デフォルトに固定`
- 通常版/PRO版の構造:
  - 通常版: `apps/fretboard_cruise/standard/index.html`
  - PRO版: `apps/fretboard_cruise/pro_a9f4k7q2m8z/index.html`（他のディレクトリと同様、ランダムな英数字ディレクトリ名で簡易的なアクセス制限にしている）
  - どちらもほぼ空のHTML（Loading画面のみ）で、実体は`../script.js`が動的にDOM全体を描画するSPA構造。
- JS/CSSの共有関係:
  - `script.js`（ルート直下、`apps/fretboard_cruise/script.js`）を通常版・PRO版が共有（`../script.js`で参照）。
  - `theme.css`（ルート直下）も同様に共有。
  - **さらに `apps/shared/style.css` と `apps/shared/pro-theme.css` を両版とも読み込んでいる**（`../../shared/style.css` 等）。リズムクルーズとは異なり、指板クルーズは`shared/`に強く依存した設計。`shared/`を変更すると指板クルーズ・音感クルーズの両方に影響する。
  - PRO版のみ `apps/shared/pro-gate.css` / `apps/shared/pro-gate.js` を追加読み込みし、パスワードゲートを構成。
- service workerの扱い: 通常版・PRO版それぞれに専用の `service-worker.js` が存在する（`standard/service-worker.js`、`pro_a9f4k7q2m8z/service-worker.js`）。他に検証用の `staging/service-worker.js` もある。キャッシュ名はそれぞれ `fretboard-cruise-standard-v2.3.0` / `fretboard-cruise-pro-v2.3.0`。fetchハンドラは明示的なキャッシュ一覧を持たず、`navigate`時は`no-cache`指定、それ以外は通常の`fetch`のみ（実質ネットワーク優先）。activate時に全キャッシュを削除し、PRO版はさらに`PRO_GATE_INVALIDATE`メッセージをクライアントに送る。
  - **`GATE_VERSION`（PRO版service worker内）はパスワード変更・ゲート方式変更時に+1する運用。音感クルーズと共有クッキー（`soundcruise_pro_gate_rid`）を使うため、値を揃える必要がある**とコード内コメントに明記あり（＝指板クルーズと音感クルーズのPROゲートは連動している）。
- manifestの扱い: 通常版・PRO版それぞれに `manifest.json` が存在（`standard/manifest.json`、`pro_a9f4k7q2m8z/manifest.json`）。`staging/manifest.json` も別途ある。

---

## 2. 絶対に守るルール

- 作業対象ディレクトリ: `apps/fretboard_cruise/` が基本。
- 触ってよいファイル: `apps/fretboard_cruise/` 配下の `script.js`・`theme.css`・`standard/index.html`・`pro_a9f4k7q2m8z/index.html`・`info.html`・`terms.html`・`privacy.html`・`pro-access.html`・`apps.html`・各`manifest.json`・各`service-worker.js`。
- 触ってはいけないファイル: `apps/shared/`（style.css・pro-theme.css・pro-gate.css・pro-gate.js）は、指板クルーズ・音感クルーズの両方に影響するため、変更する場合は必ず理由とリスクを説明し、ユーザーの確認を取ってから行う。`apps/pitch-cruise/`・`apps/rhythm-cruise/`・`apps/chord-cruise/`・`apps/cruise-studio/`は対象外。
- `shared/`を触る場合の注意: PROゲートの`GATE_VERSION`は音感クルーズと値を揃える必要がある。指板クルーズ側だけ変更すると、音感クルーズ側のログイン状態と不整合が起きる可能性がある。
- 他アプリを誤ってstageしないこと。`git add`は変更したファイルを明示的に列挙する。
- 未追跡ファイルを勝手にstageしないこと。
- ユーザーが確認・依頼していない仕様変更をしないこと。
- 大きな構造変更（画面遷移・判定ロジック・PROゲート等）の前には、必ず既存コードを読んで調査すること。`script.js`は非常に大きい単一ファイルのため、変更前に関連関数を`grep`で洗い出すこと。

---

## 3. 主要ファイル構成

| ファイル | 役割 |
|---|---|
| `standard/index.html` | 通常版のエントリーポイント。ローディング画面のみを持つ薄いHTMLで、実体は`../script.js`が構築する。`../../shared/style.css`・`../../shared/pro-theme.css`・`../theme.css`を読み込む。 |
| `pro_a9f4k7q2m8z/index.html` | PRO版のエントリーポイント。同上の構成に加え、`shared/pro-gate.css`・`shared/pro-gate.js`を追加読み込み。 |
| `script.js` | アプリ全体のロジック（画面制御・指板描画・PROロック・PROゲート連携など）を1ファイルに集約。通常版/PRO版で共有。 |
| `theme.css` | 見た目全体。`shared/style.css`・`shared/pro-theme.css`と併用される（指板クルーズ固有の上書き・追加スタイル）。 |
| `info.html` | インフォメーションページ。動画リンク・「【クルーズアプリ】シリーズ」導線・PRO版の入手方法（通常版のみ表示）・利用規約/プライバシー/お問い合わせを掲載。YouTube確認カードを実装。 |
| `terms.html` | 利用規約ページ。ホームへ戻る導線あり（直近commitで追加）。 |
| `privacy.html` | プライバシーポリシーページ。同上。 |
| `pro-access.html` | 「PRO版の入手方法」ページ。手順1「メンバーシップ「フォルテ」への登録」内に、音感クルーズ（`apps/pitch-cruise/pro-access.html`）と同じ「⚠️ iPhoneをお使いの方」リンク（インラインstyle、`./iphone-safari-guide.html`へ同一タブ遷移）を追加済み。 |
| `iphone-safari-guide.html` | 「iPhoneでの登録方法」案内ページ（新規）。音感クルーズの同名ファイルを無改変で複製。iPhoneのYouTubeアプリ経由だと課金が割高になる旨の警告と、メンバーシップ登録URLのコピー機能（`navigator.clipboard.writeText`、失敗時は`execCommand('copy')`フォールバック）を掲載。`pro-access.html`と同じく`../shared/style.css`・`../shared/pro-gate.css?v=5`を読み込む（機能的には未使用、既存`pro-access.html`との読込構成統一のため）。アプリ固有文言・URLは含まないため、指板クルーズ専用の書き換えは行っていない。 |
| `apps.html` | 「アプリシリーズ」紹介ページ（クルーズシリーズの他アプリへの導線）。 |
| `standard/manifest.json` / `pro_a9f4k7q2m8z/manifest.json` | 通常版/PRO版それぞれのPWAマニフェスト。 |
| `standard/service-worker.js` / `pro_a9f4k7q2m8z/service-worker.js` | 通常版/PRO版それぞれのService Worker。ネットワーク優先・キャッシュ全削除方式。PRO版はPROゲート連携の`postMessage`を送る。 |
| `legacy/` | 過去バージョンの保管ディレクトリ（詳細未調査・触らない）。 |
| `staging/` | 検証用の別スコープ一式（`manifest.json`・`service-worker.js`等）。本番導線とは別。 |
| `script-staging.js` | 検証用スクリプト（詳細未調査）。 |
| `scripts/` | `compute-stageN-shipped-default.mjs` 等、ビルド/検証補助スクリプト（Node想定・詳細未調査）。 |
| `generated-home-icons/` | ホーム画面用アイコン生成物。 |
| `assets/` | 画像等の静的アセット。 |

---

## 4. 画面構成

`script.js` 内 `state.course` の値（`git grep`で確認）で以下の画面（コース）を管理。

- `stageSelect`: STAGE選択画面（モード選択後の入口）
- `memorize`: 「🛳️ 指板をたどる」（暗記クルーズモード）
- `visualize`: 「🧭 指板を見る」（指板ビジュアライズ）
- `basicRules` / `basicRuleStep`: 「🔰 指板の基本ルール」の説明・ステップ画面
- `routeEditor` / `quizEditor`: STAGE編集画面（ルート編集・クイズ編集）。通常版でも編集体験自体は可能（保存はPRO限定）。
- `proCustomRouteEditor` / `proCustomQuizEditor`: PROカスタムSTAGEの編集画面
- `settings`: 設定画面
- `troubleshooting`: トラブルシューティング画面
- ホーム画面: 「🛳️ 指板をたどる」「🎯 指板クイズ」「🧭 指板を見る」の3アクション＋「🔰 指板の基本ルール」ボタン＋インフォメーション`i`ボタン（`renderHome()`関数で構築）。
- インフォメーション（`info.html`）・利用規約（`terms.html`）・プライバシーポリシー（`privacy.html`）・PRO版入手方法（`pro-access.html`）・アプリシリーズ（`apps.html`）は、いずれも別ページ遷移（モーダルではない）。

---

## 5. 通常版 / PRO版の違い

- 判定方法: `script.js`内`isProEdition()`関数（実装詳細は要確認だが、他アプリと同様に`data-app-edition`相当の判定と推測される。本ドキュメント作成時点で関数の中身までは未確認のため要確認）。
- PRO認証: PRO版HTMLのみ`shared/pro-gate.css`・`shared/pro-gate.js`を読み込み、パスワードゲートを構成。**音感クルーズとPROセッション用Cookie（`soundcruise_pro_gate_rid`）を共有している**（`shared/pro-gate.js`参照）。
- PROロック対象: STAGE編集の保存機能（通常版は編集・デモ再生は可能だが保存はPRO限定、とコード内コメントに明記）。PROカスタムSTAGEの作成・編集・保存。他の詳細ロック箇所は要確認。
- 通常版で使えるもの: 固定STAGEでの暗記モード・クイズモード、指板ビジュアライズ、基本ルール、STAGE編集の**体験**（保存不可）。
- PRO版で使えるもの: 上記に加えて、STAGE編集の保存、PROカスタムSTAGEの作成・編集・保存・呼び出し。
- 通常版/PRO版で共有しているJS/CSS: `script.js`・`theme.css`は完全共有。`shared/style.css`・`shared/pro-theme.css`も両版が読み込む。
- PRO版の相対パス注意: PRO版から`info.html`等へ遷移するリンクは`../info.html`のように1階層上へ戻る相対パスになる（`pro_a9f4k7q2m8z/`から見て）。新しいページを追加する際は、通常版`standard/`側と両方のパスを確認すること。
- PRO導線やゲートの注意点: `info.html`内の「PRO版の入手方法」リンクは`standard-pro-access-link`というIDで、通常版でのみ表示される仕組み（JSで`display`切り替え）。

---

## 6. アプリ固有の主要機能

- **指板表示**: 指板をたどる（暗記）モード、指板を見る（ビジュアライズ）モードの2系統で、指板上に音名・度数等を表示するロジックが`script.js`に実装されている（詳細な描画関数名は要確認）。
- **音名表示**: ドレミ表記・CDE表記等の切り替えがあると推測されるが、詳細な設定項目名は要確認。
- **レフティ対応**: 現時点でコード内に該当する明確な実装は本ドキュメント作成時点では確認できていない。**要確認**（左利き対応の有無・設定項目の存在を別途調査すること）。
- **設定項目**: 設定画面（`state.course === 'settings'`）が存在するが、詳細な設定項目一覧は要確認。
- **練習モード**: 「指板をたどる」（cruise/暗記系）、「指板クイズ」（quiz系）、「指板を見る」（visualize系）の3系統。
- **PROロック**: STAGE編集の保存・PROカスタムSTAGEの作成/編集/保存が対象（3章参照）。
- **描画ロジックに触る時の注意点**: `script.js`は非常に大規模な単一ファイル（数万行規模）で、指板描画・STAGE進行・編集・PROロック判定が密結合している。変更前に必ず関連関数を`grep`で洗い出し、影響範囲を確認してから着手すること。「指板クルーズ通常版の設定を公式デフォルトに固定」「指板クルーズSTAGE1の保存ルートを正規化」「指板クルーズの同時タップ判定と救済Perfect表示を改善」など、細かい実機不具合対応の履歴が多数あるため、既存ロジックを壊さないよう特に慎重に扱うこと。

---

## 7. インフォメーション / 利用規約 / プライバシー

- **インフォメーションページ**: `info.html`として実装済み。YouTube動画リンク（primaryカード、コメント誘導文言付き）、「【クルーズアプリ】シリーズ」への導線（`apps.html`）、YouTube Chトップリンク、PRO版の入手方法（通常版のみ表示、Newバッジあり）、フッターに利用規約/プライバシーポリシー/お問い合わせを掲載。
- **使い方ページ**: 独立した使い方ページは無く、`info.html`と`apps.html`が導線を兼ねている（詳細は要確認）。
- **説明動画リンク**: あり。`info.html`のprimaryカード（`data-youtube-confirm`属性付き）。
- **YouTube確認カード**: あり。`.fret-youtube-confirm`クラスで実装。「YouTubeを開きます」の確認ダイアログを挟んでから`window.location.href`で遷移する仕様（リズムクルーズの同種実装はこのアプリの実装を参考にしたもの）。
- **利用規約**: `terms.html`として実装済み。直近commitでホームへ戻る導線が追加されている。
- **プライバシーポリシー**: `privacy.html`として実装済み。同上。
- **お問い合わせ導線**: `info.html`フッターに`mailto:`リンクとして存在。

---

## 8. バージョン更新ルール

- バージョン定数: `script.js`内`FRETBOARD_CRUISE_APP_VERSION`（現在`2.8.3`。`window.FRETBOARD_CRUISE_APP_VERSION`にも同値を代入）。
- `?v=`によるキャッシュ管理:
  - `standard/index.html`・`pro_a9f4k7q2m8z/index.html`それぞれの`../script.js?v=`
  - 同HTML内`../theme.css?v=`（現在`406`という独自の連番。アプリバージョンとは別カウンター）
  - 同HTML内`../../shared/style.css?v=`（現在`97`）・`../../shared/pro-theme.css?v=`（現在`98`）。**これらは`shared/`を参照している全アプリ共通のバージョン番号のため、`shared/style.css`や`shared/pro-theme.css`自体を変更した場合は、指板クルーズ・音感クルーズ両方のHTMLで揃えて更新する必要がある。**
  - `manifest.json?v=`（例: `standard-orientation-any-20260516`という日付混じりの識別子。単純な連番ではないので注意。）
- 通常版/PRO版で更新箇所が分かれているか: `script.js`・`theme.css`は共有のため1箇所直せば両方に反映されるが、`?v=`のクエリ文字列自体は両方のHTMLで個別に書き換える必要がある。
- service workerの更新: `GATE_VERSION`はパスワード変更・ゲート方式変更時のみ+1（音感クルーズと値を揃える）。通常のUI修正では不要。
- **バージョン更新漏れしやすい箇所**: `theme.css?v=`が独自の連番管理（`406`等）になっている点。アプリバージョン（`2.8.3`）と連動していないため、混同しないこと。

今回のドキュメント作成ではバージョンは上げていない。

---

## 9. GitHub Pages反映トラブル運用

- push後、本番が古いままになることがある（実績あり）。
- 原因は主に、GitHub Pagesの`pages build and deployment`ワークフローの`deploy` jobが失敗する、または`queued`のまま詰まるケース。GitHub Actions画面でrerunしても`Queued`のまま詰まることがある。
- **コードやpush自体には問題がないことがほとんど。空commitや再実装で直そうとしないこと。**
- 過去に、`gh` CLIで以下のPages build APIを1回実行し、復旧した実績がある（リズムクルーズでの実績）。
  ```bash
  OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
  gh api -X POST "repos/$OWNER_REPO/pages/builds"
  ```
- 本番確認コマンド例:
  ```bash
  curl -s "https://soundcruise.jp/apps/fretboard_cruise/standard/index.html" | grep "script.js?v="
  curl -s "https://soundcruise.jp/apps/fretboard_cruise/script.js?v=VERSION" | grep "FRETBOARD_CRUISE_APP_VERSION"
  curl -I "https://soundcruise.jp/apps/fretboard_cruise/info.html"
  ```
- デプロイ直後（数分以内）はCDN側のキャッシュ伝播タイミングのズレで一時的に古い表示になることがある。deploy自体が成功しているなら、コードの問題と誤認しないこと。

---

## 10. 最近の主要commit履歴（fretboard_cruise関連）

`git log --oneline -- apps/fretboard_cruise/` で確認した実際の履歴（新しい順・直近15件）。

- `a75bf6dc` 指板クルーズ通常版の設定を公式デフォルトに固定
- `c73fa3ab` 指板クルーズSTAGE1の保存ルートを正規化
- `b819ec85` 指板クルーズのPROカスタムSTAGE操作UIを整理
- `6acd1ce0` 指板クルーズの不要な検証用読み込み分岐を削除
- `ff9d4d93` 指板クルーズの法務ページにホーム導線を追加
- `b28038b0` 指板クルーズProの不要公開導線を整理
- `7d507d40` 指板クルーズInfoにPro版入手導線を追加
- `0920a475` 指板をたどる編集デモの終了集計を初期化
- `f95b6e23` 指板をたどる編集デモのGr自動スクロールを修正
- `b7d973bb` 指板Pro固定STAGE編集のGr情報保持を修正
- `5cbeb6fb` 指板Pro Stagingのホーム画面起動を検証可能にする
- `593331f6` 指板Pro Stagingで固定STAGE編集のGr保持を検証
- `beb5bef6` 指板クルーズの同時タップ判定と救済Perfect表示を改善
- `7b334bfe` 指板Pro Stagingに救済Perfect用オーバーレイを追加
- `2d0a1a1f` 指板Pro Stagingの救済Perfect時ハイライトを修正

（Staging関連のcommitが多いことから、本番導線とは別に`staging/`スコープで機能検証を行ってから本番へ反映する開発フローが定着していることがうかがえる。）

---

## 11. 今後の運用ルール

- 指板クルーズを修正したら、`apps/fretboard_cruise/ai-handoff/FRETBOARD_CRUISE_OVERVIEW.md` も必要に応じて更新する。
- ユーザー向けに分かる変更を行った場合は、`apps/fretboard_cruise/ai-handoff/fretboard-cruise-overview.html` も必要に応じて更新する。
- 更新不要と判断した場合は、完了報告にその理由を書く。
- AIエディタへの依頼プロンプトには、このファイルの存在と「触ってよい/悪い」ルールを毎回含めることが望ましい。
- 「調査のみ」と「実装」の依頼ははっきり分けて扱う。
- 不明点・曖昧な指示は、実装前に必ず質問する。推測で仕様を決めない。

---

## 12. よくある事故と回避策

| 事故 | 回避策 |
|---|---|
| 他アプリ（音感クルーズ・リズムクルーズ等）を誤ってstageしてしまう | `git add`は変更したファイルを明示的に列挙する。 |
| `apps/shared/`を不用意に変更する | `shared/`は音感クルーズとも共有。変更前に影響範囲を説明し、ユーザーに確認する。 |
| PRO版の相対パスを間違える（`./xxx.html`のまま等） | 新規リンク追加時は「通常版は`xxx.html`、PRO版は`../xxx.html`」を必ずセットで確認する。 |
| `shared/style.css` `shared/pro-theme.css`の`?v=`更新漏れ | `shared/`側のファイルを変更した場合は、指板クルーズ・音感クルーズ両方のHTMLで`?v=`を揃える。 |
| `theme.css?v=`の連番管理をアプリバージョンと混同する | `theme.css?v=`は独自連番（例`406`）。`FRETBOARD_CRUISE_APP_VERSION`とは別カウンターであることを認識する。 |
| 本番が古いのをコードミスと勘違いする | GitHub Actionsのdeploy結果を確認し、成功しているなら数分待つかキャッシュ回避で再確認する。 |
| `GATE_VERSION`を指板クルーズ側だけ変更する | 音感クルーズと値を揃える必要がある（共有Cookie運用）。 |
| ユーザー未確認の仕様変更をしてしまう | 大きな構造変更・見た目の独自解釈での変更は、必ず事前に確認する。 |

---

## 13. 次回作業開始時チェックリスト

1. `git status -sb` で現在の変更状態を確認（他アプリの変更が混ざっていないか）
2. `git log -5 --oneline` および `git log --oneline -- apps/fretboard_cruise/` で直近の履歴を確認
3. `git rev-parse HEAD` と `git rev-parse origin/main` を比較
4. 今回の作業対象ファイルを明確にする（本ファイルの「主要ファイル構成」を参照）
5. 未追跡ファイルが対象外であることを再確認
6. 本番バージョンを確認（`curl`で`script.js?v=X`の中身を確認）
7. 通常版/PRO版それぞれの相対パス（`./`と`../`）を意識して両方に変更を反映する
8. `shared/`に触れる変更の場合は、音感クルーズへの影響も必ず確認する
9. 変更後は、通常版・PRO版それぞれでスクリーンショット確認・コンソールエラー確認を行う
10. 変更内容に応じて、`apps/fretboard_cruise/ai-handoff/`配下の本ファイルと`fretboard-cruise-overview.html`の更新要否を判断する
