# 音感クルーズ 開発概要（AIエディタ引き継ぎ用）

このファイルは、ChatGPT / Claude Code / Cursor / Codex など、どのAIエディタ・どのチャットで作業を再開しても
「音感クルーズ」の現状・設計・注意点を正確に引き継げるようにするための資料です。

**音感クルーズを修正するたびに、`apps/pitch-cruise/ai-handoff/PITCH_CRUISE_OVERVIEW.md`（このファイル）も更新してください。** 更新不要と判断した場合は、完了報告にその理由を書いてください。
ユーザー向けの変更（見た目・文言・機能追加など）を行った場合は、`apps/pitch-cruise/ai-handoff/pitch-cruise-overview.html` も合わせて更新してください。

---

## 1. 基本情報

- アプリ名: 音感クルーズ（Pitch Cruise / Pitch Trainer）
- ディレクトリ: `apps/pitch-cruise/`
- 通常版URL: `https://soundcruise.jp/apps/pitch-cruise/standard/`
- PRO版URL: `https://soundcruise.jp/apps/pitch-cruise/pro_x9v7q2m8/`
- 現在のバージョン: `2.11.1`（`script.js` 内 `PITCH_TRAINER_APP_VERSION`）
- 最新commit（pitch-cruise関連、`git log --oneline -- apps/pitch-cruise/` で確認）:
  - hash: `62b4a3bf`
  - message: `音感クルーズPROカスタムSTAGEの保存導線を整理`
- 通常版/PRO版の構造:
  - 通常版: `apps/pitch-cruise/standard/index.html`
  - PRO版: `apps/pitch-cruise/pro_x9v7q2m8/index.html`
  - 他に `apps/pitch-cruise/beta/`（ベータ版導線）、`apps/pitch-cruise/staging/`（検証用スコープ）も存在する。
- JS/CSSの共有関係:
  - `script.js`（ルート直下）を通常版・PRO版が共有（`../script.js`で参照）。
  - `theme.css`（ルート直下）も同様に共有。
  - **`apps/shared/style.css`・`apps/shared/pro-theme.css`を両版とも読み込む**（`../../shared/`参照）。指板クルーズと同様に`shared/`へ強く依存する設計で、リズムクルーズとは異なる。
  - PRO版のみ `apps/shared/pro-gate.css` / `apps/shared/pro-gate.js` を追加読み込みし、パスワードゲートを構成。**指板クルーズとPROセッション用Cookie（`soundcruise_pro_gate_rid`）を共有している。**
  - `apps/pitch-cruise/auth/pro-gate-config.js` というアプリ固有の認証設定ファイルも存在する（詳細未調査・要確認）。
- service workerの扱い: 通常版・PRO版・beta・stagingそれぞれに専用の`service-worker.js`が存在する（`standard/service-worker.js`・`pro_x9v7q2m8/service-worker.js`・`beta/service-worker.js`・`staging/service-worker.js`）。キャッシュ名はそれぞれ`pitch-trainer-standard-scope-v4-apps-pitch-cruise`・`pitch-trainer-pro-scope-v15-apps-pitch-cruise`等。fetchハンドラは明示的なキャッシュ一覧を持たず、常に`fetch(e.request)`（ネットワーク優先）。activate時に全キャッシュを削除する。PRO版の`GATE_VERSION`（現在`8`）はパスワード変更・ゲート方式変更時に+1し、`PRO_GATE_INVALIDATE`・`INFO_VERSION_UPDATED`メッセージをクライアントに送る。
- manifestの扱い: 通常版・PRO版・beta・stagingそれぞれに`manifest.json`が存在する。

---

## 2. 絶対に守るルール

- 作業対象ディレクトリ: `apps/pitch-cruise/` が基本。
- 触ってよいファイル: `apps/pitch-cruise/`配下の`script.js`・`theme.css`・`standard/index.html`・`pro_x9v7q2m8/index.html`・`beta/index.html`・`info.html`・`terms.html`・`privacy.html`・`pro-access.html`・`recommended-videos.html`・`iphone-safari-guide.html`・各`manifest.json`・各`service-worker.js`。
- 触ってはいけないファイル: `apps/shared/`（style.css・pro-theme.css・pro-gate.css・pro-gate.js）は指板クルーズとも共有しているため、変更する場合は必ず理由とリスクを説明し、ユーザーの確認を取ってから行う。`apps/fretboard_cruise/`・`apps/rhythm-cruise/`・`apps/chord-cruise/`・`apps/cruise-studio/`は対象外。
- `shared/`を触る場合の注意: PROゲートの`GATE_VERSION`は指板クルーズと値を揃える必要がある。
- 他アプリを誤ってstageしないこと。`git add`は変更したファイルを明示的に列挙する。
- 未追跡ファイルを勝手にstageしないこと。
- ユーザーが確認・依頼していない仕様変更をしないこと。
- 大きな構造変更（テストモード・PROカスタムSTAGE・PROゲート等）の前には、必ず既存コードを読んで調査すること。過去に「テストモード」機能でRevert→Reapplyが発生した履歴があり（`git log`参照）、変更の影響範囲は慎重に確認すること。

---

## 3. 主要ファイル構成

| ファイル | 役割 |
|---|---|
| `standard/index.html` | 通常版のエントリーポイント。ヘッダー（戻る/TOP、設定、Pro設定ボタン）、Practice画面相当の本体UI（音符ボタン・コードボタン・応答トグル等）、オーバーレイ内にホーム画面/メロディ選択/コード選択のモーダル群を持つ。 |
| `pro_x9v7q2m8/index.html` | PRO版のエントリーポイント。同様の構成にPRO設定モーダルなどが追加される。 |
| `beta/index.html` | ベータ版のエントリーポイント（検証・先行公開用と推測。詳細は要確認）。 |
| `script.js` | アプリ全体のロジックを1ファイルに集約する`PitchTrainerApp`クラス中心の構成。通常版/PRO版で共有。 |
| `theme.css` | 見た目全体。`shared/style.css`・`shared/pro-theme.css`と併用。 |
| `info.html` | インフォメーションページ。メイン動画リンク（PRO版では文言が「【動画】通常版のクリアの仕方」に変化）、PRO版専用の「【動画】PRO版の使い方」、「おすすめの関連動画リスト」（New badge付き）、YouTube Chトップ、PRO版の入手方法（通常版のみ・New badge付き）、フッターに利用規約/プライバシー/お問い合わせ。 |
| `recommended-videos.html` | 「おすすめの関連動画リスト」ページ（`info.html`から遷移）。 |
| `terms.html` | 利用規約ページ。ホームへ戻る導線あり（直近commitで追加）。 |
| `privacy.html` | プライバシーポリシーページ。同上。 |
| `pro-access.html` | 「PRO版の入手方法」ページ。 |
| `iphone-safari-guide.html` | 「iPhoneでの登録方法」ガイドページ（PWAインストール手順等と推測。詳細要確認）。 |
| `auth/pro-gate-config.js` | PRO認証まわりのアプリ固有設定（詳細未調査・要確認）。 |
| 各`manifest.json` | 通常版/PRO版/beta/stagingそれぞれのPWAマニフェスト。 |
| 各`service-worker.js` | 通常版/PRO版/beta/stagingそれぞれのService Worker。ネットワーク優先・キャッシュ全削除方式。 |
| `staging/` | 検証用スコープ一式（`pro-custom-stage-align.css`・`.js`等、PROカスタムSTAGE整列の検証用ファイルも含む）。 |

---

## 4. 画面構成

`standard/index.html`のDOM構造（オーバーレイ内モーダル）から確認できる主要画面。

- **ゲーム中画面**（`<main>`直下、常時表示）: フィードバック表示、テストモードステータスバー、問題再生/主音確認/音階再生ボタン、音符ボタン群（動的生成）、コードボタン群、回答モードトグル、インフォメーション`i`ボタン（`in-game-info-link`）。
- **ホーム画面**（`#screen-home`）: 設定ボタン、インフォメーション`i`ボタン（`home-info-link--final`。初回だけ「まずはこちらをチェック」の吹き出しとNewバッジが出る仕組みあり）、カテゴリカード「🎵 メロディ音感」「🎸 コード音感」。
- **メロディ ステージ選択画面**（`#screen-melody`）: 設定ボタン、インフォメーション`i`ボタン（`screen-info-link`）、STAGE1〜6のボタン、PROカスタムSTAGEへのteaser導線（通常版では鍵アイコン付きで中身の確認のみ可）、Pro版入手リンク。
- **コード ステージ選択画面**（`#screen-chord`）: 同様の構成＋コード進行パターン（頻出コード進行/完全ランダム）切り替え。
- **Pro設定モーダル**（`#screen-pro-settings`）: 問題の音数スライダー、スケールプリセット選択等（PRO版限定の詳細設定）。
- **設定モーダル**（`#settings-modal`）: テストモードのON/OFFトグル（New badge・説明ボタン付き）等を含む。
- **インフォメーション（`info.html`）・使い方系ページ（`recommended-videos.html`）・利用規約（`terms.html`）・プライバシーポリシー（`privacy.html`）・PRO版入手方法（`pro-access.html`）・iPhone登録ガイド（`iphone-safari-guide.html`）**: いずれも別ページ遷移。

---

## 5. 通常版 / PRO版の違い

- 判定方法: `script.js`側のURLパス判定または`isProEdition`相当のロジックがあると推測されるが、本ドキュメント作成時点で該当関数の詳細確認はしていない（**要確認**）。少なくとも`info.html`内のJSでは、`editionParam`とディレクトリ名の正規表現（`pro_[a-z0-9]{8}`）でPRO/standard/betaを判別している。
- PRO認証: PRO版HTMLのみ`shared/pro-gate.css`・`shared/pro-gate.js`を読み込み、パスワードゲートを構成。**指板クルーズとPROセッション用Cookie（`soundcruise_pro_gate_rid`）を共有している。**
- PROロック対象: PROカスタムSTAGE（メロディ・コードとも）の作成・保存・呼び出し。通常版ではPROカスタムSTAGEのteaserボタンから「中身の確認だけ」ができる（鍵アイコン付き）。
- 通常版で使えるもの: STAGE1〜6（メロディ）・STAGE1〜6相当（コード進行）の固定ステージ練習、テストモード、PROカスタムSTAGEの内容確認（プレイ不可）。
- PRO版で使えるもの: 上記に加え、PROカスタムSTAGEの作成・保存・実際のプレイ、Pro設定（問題の音数・スケールプリセット等の詳細調整）。
- 通常版/PRO版で共有しているJS/CSS: `script.js`・`theme.css`は完全共有。`shared/style.css`・`shared/pro-theme.css`も両版が読み込む。
- PRO版の相対パス注意: PRO版から`info.html`等へ遷移するリンクは`../info.html`のように1階層上へ戻る相対パスになる。新規ページ追加時は通常版`standard/`側と両方確認すること。
- PRO導線やゲートの注意点: `info.html`内のPRO版専用動画リンク（`pro-usage-link`）は`isProEdition`相当の判定でのみ表示される。

---

## 6. アプリ固有の主要機能

- **音感練習**: メロディ音感（単音の聴き取り）とコード音感（コード進行の聴き取り）の2カテゴリ。
- **ステージ**: メロディ・コードそれぞれSTAGE1〜6の固定ステージ＋PROカスタムSTAGE（ID99/199等の特別なステージIDで管理されていると推測。詳細は要確認）。
- **音出し/再生まわり**: 問題再生・主音（ド）確認・音階（ドレミファソラシド）再生のボタンがゲーム中画面に常設。
- **カスタムSTAGEや保存機能**: PROカスタムSTAGE（メロディ・コードそれぞれ）の作成・並び替え・保存に関する導線がある（直近commit「音感クルーズPROカスタムSTAGEの保存導線を整理」参照）。詳細な保存データ構造は要確認。
- **テストモード**: 設定からON/OFFできる特別モード（`test-mode-status-bar`でステータス表示）。過去にリリース後の解答不能バグ修正（v2.9.5）やクリア画面のスクロール不可バグ修正（v2.9.6）が発生した実績があり、**テストモード関連ロジックは特に慎重に扱うこと**。
- **PROロック**: PROカスタムSTAGEの作成・保存・実プレイ、Pro設定の詳細調整。
- **音声再生や判定に触る時の注意点**: 単音・コードの音声合成や判定ロジックは`script.js`に集約されており、変更前に関連関数を`grep`で洗い出すこと。過去に「PROカスタムSTAGEの✓バッジ位置修正・赤ボーダー追加」のような細かい表示不具合の修正履歴が複数あり、実機依存の細かい調整が積み重なっている領域であることに注意。

---

## 7. インフォメーション / 利用規約 / プライバシー

- **インフォメーションページ**: `info.html`として実装済み。指板クルーズよりも導線が多く、以下を掲載:
  - メイン動画リンク（primaryカード。通常版は「【動画】最短でクリアする3つのコツ」＋コメント誘導文言、PRO版は「【動画】通常版のクリアの仕方」に文言変化）
  - PRO版専用「【動画】PRO版の使い方」（PRO版のみ表示）
  - 「おすすめの関連動画リスト」（`recommended-videos.html`へ。New badge付き、PRO版のみバッジ表示ロジックあり）
  - YouTube Chトップリンク
  - PRO版の入手方法（通常版のみ表示、New badge付き）
  - フッターに利用規約/プライバシーポリシー/お問い合わせ
- **使い方ページ**: `recommended-videos.html`が関連動画の案内を兼ねる。独立した「基本的な使い方」ページは無い（要確認: 存在しないと断定してよいか、他ページで代替しているか）。
- **説明動画リンク**: あり（`info.html`内、複数）。
- **YouTube確認カード**: あり。`#pitch-youtube-confirm`で実装。「YouTubeを開きます」の確認ダイアログを挟んでから`window.location.href`で遷移。iOS standalone時の音声セッション対策コメント（「window.location.hrefでの遷移はYouTubeを別Safariプロセスに保つ」）が明記されている点が、指板クルーズ版との差異。
- **利用規約**: `terms.html`として実装済み。直近commitでホームへ戻る導線が追加。
- **プライバシーポリシー**: `privacy.html`として実装済み。同上。
- **お問い合わせ導線**: `info.html`フッターに`mailto:`リンクとして存在。

---

## 8. バージョン更新ルール

- バージョン定数: `script.js`内`PITCH_TRAINER_APP_VERSION`（現在`2.11.1`）。
- `?v=`によるキャッシュ管理:
  - `standard/index.html`・`pro_x9v7q2m8/index.html`それぞれの`../script.js?v=`
  - 同HTML内`../theme.css?v=`（現在`11`という独自連番。アプリバージョンとは別カウンター）
  - 同HTML内`../../shared/style.css?v=`（現在`99`）・`../../shared/pro-theme.css?v=`（現在`98`）。**`shared/`を変更した場合は、指板クルーズ・音感クルーズ両方のHTMLで揃えて更新する必要がある。**
- 通常版/PRO版で更新箇所が分かれているか: `script.js`・`theme.css`は共有のため1箇所直せば両方に反映されるが、`?v=`のクエリ文字列は両方のHTMLで個別に書き換える必要がある。
- service workerの更新: `GATE_VERSION`（現在`8`）はパスワード変更・ゲート方式変更時のみ+1（指板クルーズと値を揃える）。通常のUI修正では不要。
- **バージョン更新漏れしやすい箇所**: `theme.css?v=`が独自連番（`11`）で管理されている点。beta/stagingにも別途`?v=`があるため、触る版を間違えないこと。

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
  curl -s "https://soundcruise.jp/apps/pitch-cruise/standard/index.html" | grep "script.js?v="
  curl -s "https://soundcruise.jp/apps/pitch-cruise/script.js?v=VERSION" | grep "PITCH_TRAINER_APP_VERSION"
  curl -I "https://soundcruise.jp/apps/pitch-cruise/info.html"
  ```
- デプロイ直後（数分以内）はCDN側のキャッシュ伝播タイミングのズレで一時的に古い表示になることがある。deploy自体が成功しているなら、コードの問題と誤認しないこと。

---

## 10. 最近の主要commit履歴（pitch-cruise関連）

`git log --oneline -- apps/pitch-cruise/` で確認した実際の履歴（新しい順・直近15件）。

- `62b4a3bf` PROカスタムSTAGEの保存導線を整理
- `6b19fb8e` 法務ページにホーム導線を追加
- `93106281` Proパス直書きを整理
- `009a916d` 不要なStaging導線を整理
- `22809e4b` （指板クルーズProの共通認証と退室導線を追加。指板クルーズと合同のcommit）
- `ed1603f7` （指板・音感クルーズに利用規約とプライバシーポリシーを追加。指板クルーズと合同のcommit）
- `d78bf25d` YouTubeリンクに確認ダイアログを追加
- `dfd78d8d` PROのパスワード平文露出を改善
- `b6131a0b` fix: v2.9.6 — クリア画面のスクロール不可バグ修正
- `e2dcb4ed` fix: v2.9.5 — テストモード開始時にisAnswerModeを強制ON（解答不能バグ修正）
- `24cf1830` Reapply "Merge feature/pitch-cruise-test-mode: テストモード v2.4.0〜v2.9.4"
- `d92f7cf4` Revert "Merge feature/pitch-cruise-test-mode: テストモード v2.4.0〜v2.9.4"
- `ca66f46d` fix: v2.9.4 — デバッグフラグをfalseに戻し正式リリース状態へ
- `532b5bf1` fix: v2.9.3 — PROカスタムSTAGEの✓バッジ位置・赤枠を再修正
- `02b40406` fix: v2.9.2 — PROカスタムSTAGEの✓バッジ位置修正・赤ボーダー追加

（`22809e4b`・`ed1603f7`は指板クルーズと合同で行われた変更のため、pitch-cruise単体のcommitではない点に注意。また、テストモード機能はRevert→Reapplyが発生した実績があり、変更時は特に慎重な検証が必要。）

---

## 11. 今後の運用ルール

- 音感クルーズを修正したら、`apps/pitch-cruise/ai-handoff/PITCH_CRUISE_OVERVIEW.md` も必要に応じて更新する。
- ユーザー向けに分かる変更を行った場合は、`apps/pitch-cruise/ai-handoff/pitch-cruise-overview.html` も必要に応じて更新する。
- 更新不要と判断した場合は、完了報告にその理由を書く。
- AIエディタへの依頼プロンプトには、このファイルの存在と「触ってよい/悪い」ルールを毎回含めることが望ましい。
- 「調査のみ」と「実装」の依頼ははっきり分けて扱う。
- 不明点・曖昧な指示は、実装前に必ず質問する。推測で仕様を決めない。

---

## 12. よくある事故と回避策

| 事故 | 回避策 |
|---|---|
| 他アプリ（指板クルーズ・リズムクルーズ等）を誤ってstageしてしまう | `git add`は変更したファイルを明示的に列挙する。 |
| `apps/shared/`を不用意に変更する | `shared/`は指板クルーズとも共有。変更前に影響範囲を説明し、ユーザーに確認する。 |
| PRO版の相対パスを間違える | 新規リンク追加時は「通常版は`xxx.html`、PRO版は`../xxx.html`」を必ずセットで確認する。 |
| `shared/style.css` `shared/pro-theme.css`の`?v=`更新漏れ | `shared/`側のファイルを変更した場合は、指板クルーズ・音感クルーズ両方のHTMLで`?v=`を揃える。 |
| `theme.css?v=`の連番管理をアプリバージョンと混同する | `theme.css?v=`は独自連番（`11`）。`PITCH_TRAINER_APP_VERSION`とは別カウンターであることを認識する。 |
| 本番が古いのをコードミスと勘違いする | GitHub Actionsのdeploy結果を確認し、成功しているなら数分待つかキャッシュ回避で再確認する。 |
| `GATE_VERSION`を音感クルーズ側だけ変更する | 指板クルーズと値を揃える必要がある（共有Cookie運用）。 |
| テストモード関連ロジックを不用意に変更する | 過去にRevert→Reapplyが発生した機能。変更前に関連コミット履歴を確認し、慎重にテストする。 |
| beta/staging版と本番版を混同する | `standard/`・`pro_x9v7q2m8/`・`beta/`・`staging/`は別スコープ。作業対象を明確にしてから着手する。 |

---

## 13. 次回作業開始時チェックリスト

1. `git status -sb` で現在の変更状態を確認（他アプリの変更が混ざっていないか）
2. `git log -5 --oneline` および `git log --oneline -- apps/pitch-cruise/` で直近の履歴を確認
3. `git rev-parse HEAD` と `git rev-parse origin/main` を比較
4. 今回の作業対象ファイルを明確にする（本ファイルの「主要ファイル構成」を参照）
5. 未追跡ファイルが対象外であることを再確認
6. 本番バージョンを確認（`curl`で`script.js?v=X`の中身を確認）
7. 通常版/PRO版（必要なら beta/staging も）それぞれの相対パス（`./`と`../`）を意識して変更を反映する
8. `shared/`に触れる変更の場合は、指板クルーズへの影響も必ず確認する
9. 変更後は、通常版・PRO版それぞれでスクリーンショット確認・コンソールエラー確認を行う
10. 変更内容に応じて、`apps/pitch-cruise/ai-handoff/`配下の本ファイルと`pitch-cruise-overview.html`の更新要否を判断する
