# 実ブラウザ受入・v161統合準備

2026-11-08 JST。入力PR249 f644d1f0。main fed3985f5、公開tree10449b7d/Port1.30.5、Worker v161/d278abbd-6989-44ab-a9bf-f7539dc0c8d9/AI OFFを開始・終了時に確認。公開/merge/本番データ操作は行っていない。

## 実行環境と保証範囲

Chromium（インストール済みGoogle Chrome）とPlaywright WebKitを使用。新規BrowserContext、実localStorage/IndexedDB、実共有DB adapter、固定旧runtime/旧adapter、候補runtime/adapter、実バックアップDBを使用した。
バックエンドは既存実Worker handlerとSQLite D1 fixtureをローカルHTTPで接続。合成Account/Pro資格・Deviceのみ。本番向け通信はBrowserContextでabortし、認証を本番で回避していない。Cloudflare workerdや実本番Workerへの書込み試験ではない。
アプリ3本の試験ページは保存/同期moduleを実行する専用harnessであり、Standard/Proの画面全体を再受入したとは主張しない。Chordは製品のpairing-uiと製品のfield-merge依存をロードし、実DOMのボタン/radioをPlaywrightで操作した。CSSの視覚受入は範囲外。

## 結果

results.json:52 PASS/0 FAIL、各engine26件。

- A（3アプリ×2engine）:旧v1のoperationをcommit前保留、Outbox/Shadow/cursor保持→reloadでv2→同じoperation IDで送信→ACK後にOutbox0/競合0。
- B（local/remote、3アプリ×2）:旧v1でcommit済みMidnightのverification失敗を再現。保存済み解決途中で実ページをcloseし、新しいページで同じIDBを開き解決継続→収束。remote選択へ変更するケースは既存later操作で以前の選択を解除してから再選択する。
- C:同じcontextの旧新タブで同一localStorage/IndexedDBを共有。旧Dark投影→新版Midnight復元の往復でクラウドrevisionを増やさず保持。旧Light明示変更時、共有Shadowがv2のままだと旧タブが競合確認を作ることがある。その場合もデータを保持し、新版で既存のlocal選択を確認してLightへ収束する。旧タブが常に無確認で成功するとは扱わない。
- E:合成Account contextのassertCurrent callback/実IDB Account namespaceを切替え、AのOutboxをBへ送らない。Aへ戻すと同じoperationを再開。資格失効callbackでも送信せず保持。正式Account復旧UI・本番資格ローテーションの試験ではない。
- F:合成DeviceのDB失効でローカルWorkerが401を返し、Outboxを保持したままreload後も送信しない。
- G:本当にrevisionが進んだ場合は既存のlocal_changed_during_resolutionで意図を拒否し、未解決データを保持。再確認して収束し、他設定値を失わない。
- H:旧新タブのsyncをPromise.allSettledで並行実行。クラウドMidnightを保持し、旧タブ終了後に必要な既存確認を行って新版がOutbox0/競合0へ収束。
- D（Chord×local/remote×2）:旧cursor/Shadowから検証付き再取得。保留OutboxありのUIで要確認→同期内容を確認→localまたはremoteを実radioで採用→検証済み同期完了→reload後も収束。採用前のoperation ID/payload等は維持し、既存conflictマーカーだけ付与。cursor初期化なし。

## 実ブラウザで必要になった限定修正

ChordのrefreshSettingsThemeViewはpendingを返すだけで、既存UIから確認へ進む競合レコードを作らず、保留が行き止まりになっていた。
候補clientにのみ限定修正（15追加/6削除）:
- manifest検証済みsnapshotを取得し、既存settings Outboxをそのまま既存の競合レビューへ接続する。
- 既存Outbox.conflict=trueを先に永続化し、そのoperation IDに結び付けた既存push型conflictを保存。古い未確認operationと確認後のmerge operationを同時に送らない。新しい永続フラグ/DB/schema/APIは追加しない。
- 利用者が明示確認した後、既存mergeのバックアップ・CAS・最終manifest検証と正常確定を利用する。clearCloudStateで初期化して直すものではない。保留中のOutbox/Shadow/cursorは保持され、検証後の通常の消込みだけを行う。
- Chord候補を1.23.4へpatch更新し、app/bootstrap/client/cache参照を同じ版へ更新。UI製品コードは変更しない。

テストharnessで不足していた実backup/field-merge moduleとHTTP charset、非同期フォーム待機も整えた。これらは製品変更ではない。関連ローカル試験34 PASS/0 FAIL。既存のWorker128/Account境界21等は無関係に全再実施していない。以前からのChord CSS selector検査失敗は解消済みとは扱わない。

## 現行Worker統合候補

本番GETで得た5moduleを/private tmpの権限制限領域へ保全。main_moduleはreport-overlay.mjs。production-v148.mjsという名称の基盤moduleも実際のv161から取得したもので、v148へrollbackしたわけではない。

ローカル候補:/tmp/midnight249-worker-candidate/
元module:/tmp/midnight249-production-v161/

prepare-midnight-v161.pyはネットワーク・アップロードを行わず、固定baseline hashを検証して以下の3箇所だけを変更する:
1. settingsの許容テーマ配列にMidnight追加。
2. sync-capabilitiesの候補module（v2 view/旧view/保持/B）。
3. validatePushPayloadの旧v1 Midnight commit前保留。

他の4module（AI/report/canary entry）はbyte一致。STUDIO_CANARY_POLICY export、既存Account/Pro/Device/Owner/通常Sync/cronを含む残りのbundleを保持。binding70、secret binding19、cron15 3 * * *、workers.dev有効・preview無効を読取り保全。settingsは終了時にも完全一致。秘密の値は取得・記録・推測していない。非公開設定snapshotとsecret名保持付きmetadataはrepoへcommitしていない。

候補bundle構文PASS、sourceとのテーマ関数照合15項目PASS、bundle内の実handler/実repositoryをSQLiteへ接続した19項目PASS（Pro資格検証、旧保留、v2送信、投影、Light明示変更、認可拒否、AI OFF404を含む）。外側のreport/AI/canary配線はbyte不変で保全し、全機能の新規実機受入はしていない。

再現例（すべてローカル、公開操作ではない）:

    python3 workers/sound-cruise-sync/scripts/prepare-midnight-v161.py --baseline /tmp/midnight249-production-v161 --output /tmp/midnight249-worker-candidate
    MIDNIGHT_CANDIDATE_DIR=/tmp/midnight249-worker-candidate node workers/sound-cruise-sync/test/production-midnight-integration.mjs
    PLAYWRIGHT_MODULE=/tmp/studio-report-browser-runtime/node_modules/playwright CHROME_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node workers/sound-cruise-sync/test/browser/midnight.browser.mjs

Playwrightは既存インストールを再利用した。別環境ではPLAYWRIGHT_MODULEでインストール済みpackageを指定するか、通常のplaywright解決を使用する。ChromiumはCHROME_EXECUTABLE省略時にPlaywrightのブラウザを使う。成果のhashと件数はworker-integration.jsonに記録。

## 承認後の配備順序

1. 直前にmain/公開tree/Worker deployment ID・5module hash・settings/cron/公開制御を再取得し、この候補と一致することを確認。違う場合はその更新を保全して候補を再作成し、推測で配備しない。
2. 新規Midnight選択停止のまま、保全した5module＋既存main_moduleを使う既存の保全配備手順でWorkerのみを配備。keep_bindingsでsecretを保持し、新規secret/resourceを作らない。既存全binding・Account/Pro/Owner・AI OFF・公開制御・cronを維持する。古いmainのwrangler設定によるWorker全体置換はしない。
3. OFF/通常Sync認証読取り/旧v1保留/v2 viewの配備後受入が通った場合のみ、4クライアントを最新公開treeへ限定反映。adapter v1+v2とruntime v37、Chord1.23.4のbootstrap/clientを同時更新。Port1.30.5/Studio/NEWSのファイルを含めない。共有runtimeの既存Port ACK修正は保持。
4. 旧タブ更新待ちは明示し、Outboxを保持。実本番・iPhoneの最小受入後に別承認で5アプリのMidnight新規選択再開を判断する。今回は本番配備も再公開も行わない。

Worker-first段階では旧4テーマは通常動作、旧v1のMidnightだけ更新待ち。client後続で同じOutboxを再送する。旧4テーマ版へ未知値を渡さず、旧Dark echoで保存Midnightを消さない。rollbackでもこのreader/writer互換境界を保持し、旧Worker全体へ戻さない。

判定:実ブラウザ候補PASS・本番統合準備PASS。承認後の限定OFF配備準備へ進める。本番/iPhoneは未受入で、Midnight選択再開はHOLD。本人Account/帰属不明12件、PR225/235/237、公開Port/Studio/NEWSは未操作。
