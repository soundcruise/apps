# 譜面クルーズ ローカルUI検証

現在の模擬Account本棚の操作・起動手順は [MOCK_ACCOUNT_BOOKSHELF.md](MOCK_ACCOUNT_BOOKSHELF.md) を参照。以下は初期入口の記録。

PR #265の1721d190を維持するローカル専用候補0.88.2-dev.2。
通常のSafari／Chromeで開ける。正規Pro認証のテストではない。

```bash
cd /Users/murakamimasakuni/.codex/worktrees/studio-score-local-ui/Cruise_apps
python3 apps/cruise-studio/scripts/serve-local-ui.py
```

開くURL：http://127.0.0.1:18874/

既存18873は停止しない。18874が使用中なら起動は失敗するため、既存プロセスを勝手に停止しない。
HTMLは既存templateとdevelopment generatorからメモリ生成し、生成ファイルの管理は不要。

上部の「譜面クルーズ」→「新規」→曲情報を開いてタイトルとBPM→紙面の小節を選択→コード・歌詞・ドレミ・ストロークを入力する。
小節複製、Undo/Redo、保存、再読込、JSON書出し・読込、印刷ダイアログからPDF保存を確認できる。
テスト用の独自短曲だけを入力し、実ユーザーのJSONを読み込まない。
複数コードの拍別編集、演奏キー／カポ、曲の直接再生は引き続き未完成。

## 分離

- 127.0.0.1だけにbindし、Hostも127.0.0.1:18874に限定。ローカルアダプターはhttp／hostname／port／入口markerを確認して拒否または有効化する。
- 専用portにより、本番soundcruise.jpおよび従来18873のlocalStorageと別origin。保存はこのorigin内のテストProjectだけ。保存のCAS／Web Locksは既存実装のまま。
- 専用入口は実Pro Gate、device session、Account、Cloud初期化スクリプトを除外し、テスト用entryAuthを注入する。公開ソースや通常Pro認証の実装は変更しない。
- CSPのconnect-src noneでfetch／XHR／WebSocket／beacon等を遮断。frame-src none／worker-src none／form-action none、外部script・画像等も許可しない。サーバーはAPIへのproxyを持たず、POSTや追加HTML入口、認証・Cloud資源を提供しない。
- LOCAL DEVELOPMENT / 本番認証の検証対象外の表示を常設。印刷時だけ表示を除く。
- scripts／testsは既存Jekyll除外対象。release allowlistにも含まれない。公開Standard／Proのcreation=falseと既存Pro Gateは維持する。

## 検証

Node専用回帰3件PASS。実際の18874サーバーへroute mockなしで接続し、ChromeとPlaywright WebKit各1件PASS（skipなし）。
新規、BPM、コード／歌詞／ドレミ／ストローク、ルーペ、小節複製、Undo/Redo、保存とreload、JSON実ファイル往復を確認した。
ChromeでPDF生成、両engineで印刷mediaを確認。実プリンターとSafariアプリのOS印刷ダイアログ操作は未確認。
外部リクエスト0件、認証／Cloudリクエスト0件。意図的な本番API fetchもCSPで送信前に拒否することを確認した。
WebKitの結果はSafariアプリそのものの実機受入には数えない。Safari実機は利用者確認HOLD。

```bash
node --test apps/cruise-studio/tests/local-ui-entry.test.mjs
NODE_PATH=/private/tmp/studio-score-phase1-runtime/node_modules node --test apps/cruise-studio/tests/local-ui.browser.cjs
```

ブラウザ試験は使い捨てcontextと独自曲を使うが、手動利用には専用ブラウザや拡張機能は不要。
正規Pro認証・Turnstile・Account・Sync・Cloudの動作保証には使わない。
