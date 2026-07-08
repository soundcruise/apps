# Cruise Studio AI Workflow

## 1. 作業開始時の必須手順

1. `ai-handoff/PROJECT_STATE.md` を読む。
2. `ai-handoff/AI_WORKFLOW.md` を読む。
3. `git status -sb` を確認する。
4. 現在のHEADと未commit差分を確認する。
5. 今回の作業範囲を明示する。
6. 不明点があれば実装前に質問する。
7. 作業前に触ってよいファイルを確認する。

## 2. 絶対ルール

- `git add .` 禁止。
- 指示がない限りcommitしない。
- 指示がない限りpushしない。
- 既存アプリ不触。
- `apps/shared` 不触。
- `service-worker` 不触。
- `manifest` 不触。
- PRO認証まわり不触。
- rhythm-cruiseアイコン案2件不触。
- ローカルサーバーや検証プロセスを立てた場合は報告する。
- エラー終了が意図的な停止なら、その旨を報告する。

## 3. モデル/エージェント選択方針

### 利用候補

- Codex GPT-5.5
- Claude Code Opus
- Claude Code Sonnet
- Cursor Auto

### 推奨

- 設計レビュー: Codex GPT-5.5 / Claude Code Opus
- 大きな実装: Codex GPT-5.5 / Claude Code Sonnet
- 譜面/データ構造/PDF/MIDI/五線譜に関わる実装: Codex GPT-5.5 または Claude Code Sonnet以上
- 小さなCSS/文言修正: Cursor Auto可
- 検証・ローカル起動・commit/push: Cursor Auto可
- Cursor Auto単独で大きなデータ構造変更をしない

## 4. commit / push ルール

- commitはユーザーの明示指示後のみ。
- pushもユーザーの明示指示後のみ。
- commit前に `git status -sb` を確認する。
- stage対象を明示する。
- `git add .` 禁止。
- rhythm-cruiseアイコン案2件をstageしない。
- 既存アプリ / `apps/shared` をstageしない。
- commit報告には以下を含める:
  - 使用モデル
  - commit hash
  - commit message
  - commitに含まれたファイル一覧
  - 最終 `git status -sb`
  - 触っていない範囲の確認
- push報告には以下を含める:
  - 使用モデル
  - push結果
  - pushしたcommit hash
  - 最終 `git status -sb`

## 5. フェーズ完了時の更新ルール

フェーズ完了時には、必要に応じて以下を更新する。

- `ai-handoff/PROJECT_STATE.md`
- `ROADMAP.md`
- `DATA_MODEL.md`
- `docs/DECISIONS.md`

特に以下の場合は、必ず `ai-handoff/PROJECT_STATE.md` を更新する。

- バージョンが上がった。
- 新機能を追加した。
- commit / pushした。
- 現在作業中フェーズが変わった。
- 次にやることが変わった。
- 既知課題が増えた。
- 重要な設計判断をした。

ただし、commit / pushだけの作業では `ai-handoff/PROJECT_STATE.md` 更新は不要な場合がある。

## 6. バージョン管理ルール

- 新機能追加は原則マイナーバージョンを上げる。
- 小修正はパッチ、または同フェーズ内修正として扱う。
- 以下を揃える:
  - `APP_VERSION`
  - `index.html` 内の表示
  - `script` / `css` の `?v=`
  - 必要な参照バージョン

## 7. データモデル変更ルール

- `schemaVersion` は安易に上げない。
- 表示専用フィールドは欠損時補完で読む場合がある。
- 音・保存・出力に影響する構造変更は `schemaVersion` 検討が必要。
- migrationを入れる場合は、過去versionからの段階変換を消さない。
- 既存保存データを勝手に破壊しない。
- localStorageキーは `cruiseStudio.` プレフィックスを守る。

## 8. 検証ルール

実装後、必要に応じて以下を確認する。

- 母艦TOP表示
- 譜面クルーズ表示
- A4紙面表示
- 保存/復元
- JSON書き出し/読み込み
- beforeunload
- currentProjectId
- プレDTM読み込み
- MIDI書き出し
- 既存アプリランチャー
- PDF/印刷
- コンソールエラー
- localStorage汚染
- 既存アプリ / `apps/shared` 差分なし
- `_proto` 差分なし

## 9. 既存アプリ保護

既存アプリはクルーズスタジオからランチャーで開く対象であり、今回の開発では原則触らない。

- 音感クルーズ
- 指板クルーズ
- リズムクルーズ
- コードクルーズ

PC対応などを行う場合も、別フェーズ・別プロンプト・別commitで進める。

## 10. ローカル検証サーバー

- 既存サーバーが動いている場合は無理に新規起動しない。
- ポート使用中なら既存URLを報告する。
- サーバー停止のexit codeが停止シグナル由来なら、問題なしとして報告する。
- 検証URLを完了報告に含める。
