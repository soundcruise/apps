# ローカルコミット対象 — 2026-11-17

使用モデル：Sol。対象：Studioローカル候補0.151.0-dev.1／Viewer0.8.0-dev.1。

コミット内容：譜面クルーズからの直接書き出し・PDF出力、Viewerの入口・再生UI・未保存確認、ライブラリ整理、BPM追従／カスタム送り。

検証済み：Node2,320成功・既存1skip、関連ブラウザ127成功、Python9成功。今回は実装を変更せず、検証ログ・差分・静的依存の整合性を確認してコミット。本番配信・実アカウント接続・認証／Sync設定は不変更。pushなし。

## ファイル一覧（46件）

- `apps/cruise-studio/ai-handoff/PROJECT_STATE.md`
- `apps/cruise-studio/docs/score-viewer-library-20261116/COMMIT_FILES_20261117.md`
- `apps/cruise-studio/docs/score-viewer-library-20261116/README.md`
- `apps/cruise-studio/docs/score-viewer-library-20261116/chrome-folders.png`
- `apps/cruise-studio/docs/score-viewer-library-20261116/chrome-native-scroll.png`
- `apps/cruise-studio/docs/score-viewer-library-20261116/native-pdf-preview.png`
- `apps/cruise-studio/docs/score-viewer-usability-20261116/README.md`
- `apps/cruise-studio/docs/score-viewer-usability-20261116/chrome-native-selection.png`
- `apps/cruise-studio/docs/score-viewer-usability-20261116/chrome-right-pane.png`
- `apps/cruise-studio/docs/score-viewer-usability-20261116/webkit-pdf.png`
- `apps/cruise-studio/js/modules/sheet-cruise/sheet-cruise.js`
- `apps/cruise-studio/js/shell.js`
- `apps/cruise-studio/scripts/build-local-viewer-offline.mjs`
- `apps/cruise-studio/scripts/local-port-viewer.mjs`
- `apps/cruise-studio/scripts/local-ui-entry.mjs`
- `apps/cruise-studio/scripts/local-viewer-bootstrap.js`
- `apps/cruise-studio/scripts/local-viewer-studio.mjs`
- `apps/cruise-studio/tests/feature-metadata.test.mjs`
- `apps/cruise-studio/tests/helpers/viewer-regression-choices.cjs`
- `apps/cruise-studio/tests/viewer-library-ui.browser.cjs`
- `apps/cruise-studio/tests/viewer-library.test.mjs`
- `apps/cruise-studio/tests/viewer-mobile.browser.cjs`
- `apps/cruise-studio/tests/viewer-offline-cold.browser.cjs`
- `apps/cruise-studio/tests/viewer-pdf.browser.cjs`
- `apps/cruise-studio/tests/viewer-scroll-speed.test.mjs`
- `apps/cruise-studio/tests/viewer-stage1.browser.cjs`
- `apps/cruise-studio/tests/viewer-stage2.browser.cjs`
- `apps/cruise-studio/tests/viewer-sync.browser.cjs`
- `apps/cruise-studio/tests/viewer-usability.browser.cjs`
- `apps/score-viewer/core/file-format.mjs`
- `apps/score-viewer/core/library.mjs`
- `apps/score-viewer/core/scroll-speed.mjs`
- `apps/score-viewer/local/asset-list.js`
- `apps/score-viewer/local/boot.mjs`
- `apps/score-viewer/local/index.html`
- `apps/score-viewer/local/mock-sync.mjs`
- `apps/score-viewer/ui/export-dialogs.mjs`
- `apps/score-viewer/ui/file-menu.mjs`
- `apps/score-viewer/ui/interaction.mjs`
- `apps/score-viewer/ui/library.mjs`
- `apps/score-viewer/ui/pdf-export.mjs`
- `apps/score-viewer/ui/pdf-viewer.mjs`
- `apps/score-viewer/ui/scroll-settings.mjs`
- `apps/score-viewer/ui/settings.mjs`
- `apps/score-viewer/ui/viewer.css`
- `apps/score-viewer/ui/viewer.mjs`
