# 期限付き単発Web探索（0.52.0候補）

本PRはローカル受入まで。本番0.51.0の探索OFF・手動OFF・専用接続OFF、通常NEWS、cron、モデル、データを変更しない。検索・実推論・migrationは実施しない。

## 既存経路に追加するもの

既存のAccess・管理者allowlist・Origin・CSRFを通した`POST /api/web-discovery/run`だけを使用する。新規エンドポイント、DB、スケジューラーは作らない。

Operatorの既存2フラグがtrueで、次の`NEWS_WEB_MANUAL_PERMIT`が有効な場合だけ開始できる。例は形式説明用であり、本番許可として配置しない。

```json
{
  "issuedAt": "2026-11-08T05:00:00.000Z",
  "expiresAt": "2026-11-08T05:05:00.000Z",
  "maxSearches": 3,
  "maxAiCalls": 5,
  "model": "@cf/google/gemma-4-26b-a4b-it"
}
```

- ISO UTC時刻、有効期間は最大15分。開始前・期限切れ・発行UTC日からの日付変更・モデル不一致・不正設定は拒否する。
- 検索上限は0〜3、AI上限は0〜5（両方0は不可）。既存の日次上限も適用し、小さい方で停止する。上限を増やす設定は拒否する。
- 単発性は既存`news_web_runs.manual_started`で永続的に確保する。1回の開始でそのUTC日を消費し、失敗・ACK喪失・中断でも戻さない。別のpermitを同じ日に発行しても再実行できない。
- cron・manualは既存の全日共通ロックと日次latchを共用する。通常collector・定期探索の既存仕様は変更しない。限定受入ではNEWSの探索フラグをOFFのままとし、Operatorの手動経路だけを一時許可する。
- 各呼出の予約前と、D1予約・記録後の有料呼出直前に期限・UTC日・モデル・許可設定を再検査する。認証処理に掛かった時間も現在時刻へ反映する。
- 予約は送信前に既存の日次カウンターへ記録する。予約後に期限切れなら実送信0でも予約を消費する。安全側の過大計上を許し、失敗を無料扱いして再送しない。
- 単発実行では検索・AI・schema・保存エラーで残りの有料呼出を停止する。旧失敗ヒント（attempts>0）を単発試験で再試行しない。別の新規・未試行ヒントは枠内で処理できる。通常の定期再試行仕様は維持する。

## 終了・OFF復帰・限界

実効許可と設定フラグを区別する。開始時に許可を使用済みにするため、処理終了後にもう一度開始できない。期限またはUTC日が変われば、新しい有料呼出をサーバー側で拒否する。プロセスが消えても永続latchと期限は有効。新規処理を起こす独自タイマーや予約はない。

`scripts/web-manual-session.mjs`の`withManualWebSession`は、既存の配備ガードを使うenable/restoreコールバックと、1回の実行・読取確認を囲む小さなホスト側処理。enableの失敗・実行失敗・応答待ち期限超過でもfinallyでOFF復帰を試みる。変更操作そのものをタイムアウトで競争させ、遅いON変更がOFF後に着地する構造にはしない。

本番の設定変更には、前工程で保存した`pr242-production/deployment-guard.mjs`と`DEPLOYMENT-PROCEDURE.md`の入口を使い、固定main/tree・現在version・成果物・設定保全を確認する。直接の未保護Wrangler呼出へ置き換えない。このhelper自体は認証情報もCloudflare変更APIも持たず、importだけでは何も起動しない。コールバックは次回承認された設定変更計画で既存ガードへ接続する。

最終読取はNEWS探索・手動・専用接続OFF、Operator閲覧ON・手動OFF、実効許可OFF、進行中処理なしを要求する。OFF操作や読取失敗は`manual_session_incomplete`の安全なreportへ残し、成功として扱わない。Operatorにも「生の手動フラグはON／実効許可は期限切れ・使用済み」を別表示する。

期限は送信済みHTTP通信の取消し・請求取消しを保証しない。応答は期限後に到着する場合があり、その結果を保存できるが、次の有料呼出は起動しない。ホスト処理・Macが終了した場合、設定フラグそのもののOFF復帰は保証できない。サーバーの期限・使用済みlatchによる実効停止が残り、設定のOFF読取ができるまでは復帰完了を報告しない。ホストのAbortSignalも実通信の取消し保証にはしない。

## Gateway 403の確認（2026-11-08、読み取りのみ）

確認済みの事実：

- 現在のWrangler OAuthでWorkersとD1の読取りは成功する。
- `GET /accounts/{id}/ai-gateway/gateways/default`は403/code10000。
- 前回の`/ai-gateway/credits/balance`は公開文書の残高APIではなかった。正しい`/ai-gateway/billing/credit-balance`でも同じ認証方式のまま403を確認した。API未対応と権限不足を混同しない。
- 公式Get gateway/Get credit balanceはAI Gateway ReadまたはWrite権限を要求する。現在のOAuth scope一覧にAI Gateway管理のscopeはなく、403は管理面の閲覧権限不足と整合する。新しいトークン取得・別認証・権限追加は行っていない。
- 文書上、正しい残高APIはbalanceとtop-up情報の読取に対応する。ただし実残高、auto top-up、現在gatewayのretry/fallback/請求設定は未確認。残高APIはこの試験のドル請求上限を保証するものではない。

推論・検索の実行面は別に扱う。LLMは既存`AI.run(model,input)`によるWorkers AI経路、Exaは`AI.websearch`から設定済みGatewayを通る。今日の既存保存記録に単件Gemma6試験とExa3検索の成功はあるが、このPRでは新規呼出を行わず、現在の実行面の成功を断定しない。管理APIの403だけから実行面の認証失敗とも断定しない。

根拠：
- [Get gateway](https://developers.cloudflare.com/api/resources/ai_gateway/methods/get/)
- [Get credit balance](https://developers.cloudflare.com/api/resources/ai_gateway/subresources/billing/methods/credit_balance/)
- [Web Search binding/REST permissions](https://developers.cloudflare.com/web-search/how-to-use/)
- [Gateway request handling](https://developers.cloudflare.com/ai-gateway/configuration/request-handling/)
- [Unified Billingの残高に関する注意](https://developers.cloudflare.com/ai-gateway/features/unified-billing/)

## 費用保証の範囲と次回の1回受入

アプリが保証するのは最大3回の検索メソッド起動、最大5回のAIメソッド起動、再試行・別モデル切替なし、既存UTC日次予算との原子的な予約、AIの既存1500 completion token指定。9項目schema、未検証日付、出典条件、正式NEWSへの登録・公開をしない契約は変えない。

Gemmaの公開単価（入力$0.10/M・出力$0.30/M）とExaの通常検索$0.007/回、リクエストUTF-8バイト数＋余裕による保守的な入力トークン見積りでは、3検索＋5推論は約$0.0314。正確なtokenizer計測でもCloudflare側の強制課金上限でもない。料金変更・Gateway側自動再試行・ベンダー内部の請求挙動まではアプリから保証できない。`AI.websearch`の公開binding引数にはretry overrideが文書化されていないため、未検証の追加引数で制御できるとは扱わない。Gemmaへのフォールバック／旧Qwenへの自動切替は追加しない。

次回は固定headの統合・探索OFF配備を別途承認してから、既存ガード経由でOperatorだけに短いpermitとGemma指定を配置する。NEWS探索・専用接続はOFF。Gateway管理APIの可読性を有料実行の認証と混同しない一方、実際の請求上限が未保証であることとGateway retryの未確認を明示した費用判断が必要。読取可能な現在の管理画面または既存の確認記録でretry設定を確認できる場合は使用する。権限の拡張や有料呼出による認証テストを勝手に行わない。

既存手動経路から1回だけ実行し、常にfinallyで元の全設定へ戻す。使用済み・期限切れの実効停止と、生フラグOFF・進行中なしの読取確認を分けて記録する。残高未確認でも実行するかの編集者判断を、システムが勝手に「$0.05の強制上限あり」と置き換えない。
