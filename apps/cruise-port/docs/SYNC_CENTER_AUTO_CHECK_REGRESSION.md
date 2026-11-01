# Port 1.24.25 — 過去の自動開始とAccount自動確認の復元

基準main `7a6663ced0a1529fc71f608b4ce3ae2416449cef`。Port 1.24.24 / Studio 0.71.1からの隔離候補。main・既存PR・他worktree・本番を変更しない。

## 履歴で確定したこと

| Git成果 | Account確認 | Portデータ同期の起動 |
|---|---|---|
| `90d2429cdeb551ba29b4b68ecc3f99522ab191d9`（2026-09-14） | Sync Center導入、表示時にremote load | Port構造データSync導入前 |
| `ed7f4e30c1cc300f0d0d7bda74dec64e5322d10b`（2026-09-18）以降 | summary/devicesを取得 | 起動末尾に自動ensure |
| `65ef058336b02c20d74610ad7f7df8a57369a175`（2026-10-11、1.21.3） | 表示時load、Proでは初回orchestrator.resumeと必要なQA admissionも実行 | 起動末尾のensure。Proは必要ならprovision/bootstrap/Sync、Standardは既存capabilityで拒否 |
| `7ebba228646210fbfbc4459d76c4ddd386e78d61`（2026-10-11、1.22.0） | 表示時loadLocalへ変更、初回キャッシュなしではunknown | 自動ensure/resumeを削除。専用開始ボタンだけでactivate |
| 現main、1.24.24 | 上記のlocal-only経路を継承 | 明示開始を継承 |
| この1.24.25候補 | 表示・復帰時の読み取り確認だけ自動化 | 明示開始を維持 |

`git blame`はrenderSyncCenterViewのactivate既定false、専用開始ボタン、loadLocalへの切替を7ebba2286へ帰属させる。同コミットの `PORT_SYNC_RUNTIME_HOST.md` に「起動時の自動ensure、Sync画面表示時のorchestrator.resumeとQA enrollment、表示用summary networkを除去」と明記されている。関連PRをGitHubのcommit/pullsで検索した結果は空で、PR番号を推測しない。

これは**ユーザーの記憶を裏付ける自動開始コード**である。ただし、過去の本番で全操作が毎回同期完了していたことまで再受入したものではない。合成Chromeでは実際の旧1.21.3製品ページでsummary/devices要求とruntime生成を確認し、同条件の1.24.24は要求0・runtimeなし・unknownを再現した。旧版のデータ変更要求はfixtureで拒否し、本番や旧版の危険な採用処理を実行していない。

## 原因判定

- **Cが主因**：データ同期の明示開始化と同時に、表示のAccount確認まで止めた結果、未照会キャッシュを「確認が必要」と表示し続ける。
- **Aの単純なStudio UI破損ではない**：意図されたPort/shared runtime安全化によるUX回帰。Studioの後続UI公開PR #154〜#156がこのPort経路を作ったわけではない。7ebba2286の文書はStudio 0.25.1を挙げるが、本体変更なし・将来の統合準備としている。
- **Bの「元々すべて明示必須」説は否定**：1.21.3までのPro自動ensureとremote loadを確認。Standardのデータ送信制限は以前も存在した。
- **Dは主因ではない**：通常Chromeでも同じ経路で再現。PWA復帰時にもデフォルトlocal-onlyを呼ぶため自然復旧しない。加えて、短いoffline→online/PWA復帰が3秒抑制で捨てられる副問題を合成再現した。

既存のiPhone実測（ホーム画面PWA、Port1.24.24、約12分でAccount/Sync要求0、unknown、runtimeなし、確認範囲でConsoleエラーなし、SW非制御）と一致する。現在はiPhoneのInspectorが利用可能な一覧に現れず、新たな端末調査・再読込・資格使用は行っていない。過去の「5分後に自然回復」した別事象の通信原因は未確定。

## 最小修正

1. `renderSyncCenterView`は通常の表示・復帰・再確認で既存controllerの `load({readOnly:true})` を利用する。AccountClient.summary/devicesと既存normalizer/rendererを再利用。新しいAccount保存正本・API・Syncエンジンはない。
2. readOnlyは世代ごとのin-flightを共有し、応答Accountと保存済みAccount/credentialを再照合する。遅いA応答をBの表示へ採用しない。同じAccountでも後から開始した確認・明示操作の結果を古い応答で上書きしない。これはcontroller内の要求順序であり、新しいOwner資格ではない。通信失敗時の成功表示を残さず、terminal Device拒否でもAccountやフォームを自動削除しない。既存の明示loadによるterminal処理は変更しない。
3. runtime/assetの状態通知はlocal/cacheだけを再描画し、APIを多重起動しない。remote読取り中のローカル描画が最終結果を取り消さないよう、既存のsequence/aria-busyを使い、完了後にlocal statusを一度更新する。
4. 同期未開始を「同期は未開始」と表示する。資格の存在やAccount確認だけで「同期済み」としない。既存の実Sync/画像/競合の成功条件は維持する。CSS・画面構造・SPANの操作体系は変更しない。
5. 既存の3秒復帰抑制は維持。短いonline/復帰イベントを捨てず、一つのtrailing callbackへまとめる。callback自身は再予約せず、非表示/終了時に停止する。通信失敗の自動再送・poll追加ではない。local描画だけでAccount最終確認時刻を進めない。
6. 「もう一度確認」は読み取り確認にし、専用の「同期を開始・最新状態を確認」は従来どおり明示activateを行う。自動ensure、resume、QA enrollment、bootstrap、pull/push、Outbox送信、別Accountへのadoptionは復元しない。

**旧データ自動同期の丸ごと復元はHOLD**：1.22.0はAccount別runtime/DB、旧DB帰属確認、世代・dispose fenceを導入した。旧自動provision/bootstrapやpending resumerを単に戻すことは、別Account・未確定操作を現在の明示採用条件なしで進める可能性がある。今回の完成条件はAccountの自動確認と、既存の正規明示Syncの維持である。既に明示開始済みのownerの既存resume/pollは変更しない。

Portはパッチ版1.24.25。変更したモジュールと親のcache keyだけ更新し、保存形式・shared・Worker・認証・4アプリ・Studio製品34ファイルは変更しない。Studio試験のみ、candidate Port versionの明示指定と、実際のnative/Studioの同義表示をstate属性と併せて検証する形へ更新した。期待値を単に緩めたものではない。

## 合成検証と実機の区別

- 関連Node **167 PASS**。旧commitの実route関数を同じ依存条件で実行した履歴比較、readonlyの成功/拒否/多重呼出し/世代変更/接続情報保持、復帰timerのdisposeを含む。
- Port全体Node **1191 PASS / 4 FAIL / skip0**。4件はmainから取り出した同じtheme試験でも **22 PASS / 同じ4 FAIL**。NEWS badge等の既存CSS構造期待値との差で、CSS hashはmainと一致。今回変更・skipしない。
- 実製品Port Browser **6/6 PASS**、同条件の旧版/現行/修正版比較。Standard/Pro、PWA相当のvisibility/pageshow、遅延中の状態通知、429/503/410/offline・再接続、読取り再確認、A→B→AとA Outbox保持を含む。自動確認の通信はGETのみ、runtime未起動を検証。
- Studio製品Browser **17/17 PASS**。入口、5ツール、4アプリ、NEWS、5テーマ×4幅、中央/右ペイン、音声・未保存保護、Project/Pre-DTM非公開を回帰。
- native Account/Pro暗号と既存Syncを使う合成製品E2E **30/30 PASS**。Port単独/Studio iframe、正常な登録・参加・初回同期、Device/Pro失効、A/Bフォーム、Gear source/final、添付、offline等。
- 既存復旧E2E **12/12 PASS**。ACK喪失・同一operation再送、503、画像再編集/削除、My Apps binary、添付、二端末CASと明示競合解決。
- Jekyll実ビルド：Studio公開34ファイル一致。native出力の全ファイルが候補sourceとbyte一致。試験は使い捨てローカルprofile・合成DB/R2と固定ローカルWorker artifactのみ、Production要求0。

iPhone上での新候補、実Account/Pro、実二端末・Safari実機は未受入。今回の追加調査でInspectorへ到達できなかったため、既存の12分観測と同条件の合成再現を根拠とし、修正版の実機PASSとはしない。

## 公開・告知までの最短工程

Draft差分確認 → 個別承認後にPort1.24.25を公開 → 未保存入力を保全してiPhoneを既存の更新操作で更新し、開くだけでAccount確認が始まり、未開始/同期済みを区別することを確認 → 同一Accountであることを運営者が確認してから明示的に最小双方向Sync → 問題がなければ正式告知判断。

実機で確認要求が始まった後にエラーが出る場合は、そのHTTP statusと所要時間を別問題として調べる。資格・Cookie・回復コード・Account秘密情報を共有しない。Account作成・削除・切替や未同期データの移管を回避策にしない。

機械証跡：[validation.json](sync-center-125/validation.json)。合成の比較画面：[1.24.24](sync-center-125/before-12424.png) / [1.24.25](sync-center-125/after-12425.png)。表示上のAccount番号は伏せている。
