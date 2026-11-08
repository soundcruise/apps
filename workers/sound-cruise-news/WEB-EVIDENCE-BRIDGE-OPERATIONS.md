# 保存済み池部証拠のB→A接続（0.51.0候補）

## 範囲と本番境界

この変更はDraft PRでのオフライン受入まで。本番0.50.1、探索OFF、モデル指定、日次予算、cronは変更していない。検索・AI・出典へのHTTP呼出は0回。migrationも新しい公開エンドポイントも追加しない。

新規候補を作る入口は従来の許可済み一覧collectorだけ。検索タイトル、URL中の日付、検索更新日時、AI推定を正式facts・provenanceとして採用しない。

## 実在する保存証拠（2026-11-08読み取り）

- 池部のdiscovery workは29行、保存証拠12行（成功8、失敗4）。
- 短期facts cacheは`ikebe:`接頭辞付きで3行。Thinlineの成功1件、Tool Kitの旧解析失敗2件。`source_id='ikebe'`だけでは取得できない。
- 保存済みWebヒント58件のうち、池部URLは0件。現在の池部正式候補は全て掲載・非掲載判断済み。
- Thinline 173912は承認済み、Tool Kit 173948は非掲載済み。既存判断への参照例であり、新たなB→A本番成功例ではない。

`test/fixtures/web-ikebe-production-projection.json`は上記2候補と3キャッシュの読み取り投影。元facts・ハッシュ・fingerprintを再署名しない。本文、認証情報、確認者の個人情報、lease tokenは含めない。実Webヒントに存在しなかったURLを、検索で発見したとは扱わない。

## 接続の流れ

1. ヒントURLを安全に正規化し、registryの池部許可面・現在の出典停止条件を確認する。
2. 同一URLの正式候補があれば再利用する。複数一致、takedown、利用停止はCで停止する。
3. 判断Ledgerまたは掲載・非掲載済み候補はAの「既存判断への参照」にする。READYや正式日付確認済みとは表示せず、保存・再確認しない。
4. 未判断候補が既存publicationValidationを満たせばA（正式検証成立）。重複等の他の停止条件があればC。
5. factsだけが未成立なら、正式一覧receiptの候補ID・URL・公開日との一致を要求する。署名検証できるfingerprintと、同じ候補に結び付いた正式取得証拠を確認する。
6. 短期cache、既存recheck receipt、collector workの成功証拠を既存proof validatorで検証する。後の失敗cacheが以前の有効な成功証拠を隠しても、その成功証拠を再利用できる。
7. 条件成立時だけBから既存`recheckFacts`のcache-only経路へ渡す。正式identity・facts・provenance・重複・CAS・takedown・出典条件をそのまま通す。公開・掲載判断は実行しない。

候補ID、snapshot、正式proofで決まるrequest IDを使用する。並行実行・再実行は既存CASとidempotencyにより重複更新しない。同じ証拠で失敗した場合は診断済みCとなり、証拠または候補の変更なしに失敗を書き足さない。

### 候補がない場合

C `formal_candidate_not_created`とし、許可済み通常一覧collectorを案内する。検索から候補や一覧receiptを作らない。現在の保存proofは候補ID・公開日・fingerprintに結び付いているため、行が欠けたURLを検索情報から再作成する契約ではない。通常collectorが正式候補を作成し、その証拠が保存された後に同じ接続が利用可能になる。収集対象や取得範囲を拡張しない。

Yamaha Acompass 60は未許可掲載面のCを維持する。池部用接続へ渡らず、Topicsの許可をニュースリリースへ流用しない。

## 起動・停止と上限

`NEWS_WEB_EVIDENCE_ENABLED=true`の場合だけ、既存6時JSTの通常収集・再確認の後に保存証拠接続を実行する。既定はOFFであり、このPRは本番フラグを追加・有効化しない。Web検索ONとは別のスイッチで、検索・AIを起動しない。Operator閲覧は読み取り専用。

- 1実行に未期限切れヒント最大100件を走査し、正式再確認は最大5候補。関数の明示上限は最大10。
- 出典HTTP、robots確認GET、取得予算予約へのフォールバックなし。出典の停止・backoffは現在のgateを尊重する。
- Operatorの池部正式照合は1要求10URLまで。残りは確認上限を表示する。
- 新規本文・モデル応答・検索結果の複製保存はしない。更新は既存facts recheck receiptとCASで認められた候補factsのみ。既存retention（短期facts cacheは1日、facts recheck記録は90日）を使用し、同じ証拠の失敗は重複保存しない。
- 無効化はこの専用フラグをfalseにする。Web探索、通常NEWS、cron、公開処理の設定を変更する必要はない。

## オフライン受入と限界

専用試験で「ヒントのみC → 許可済み一覧の既存候補作成 → 正式cacheとの一致B → cache-only正式再確認 → A/READY」を検証。実記事と同じ構造の合成HTMLとローカル試験用署名を使うケースは、本番証拠の代用ではない。

実際の本番投影では元ハッシュ・factsの整合性と判断済み候補の無変更参照を確認する。本番HMAC秘密情報をfixtureへ持ち出さないため、本番署名のオフライン再認証・本番READY到達とは報告しない。

同一URL再登録、同一出来事の別URL重複、HH・新色等の別仕様、改変proof、receipt不足、日付不明・期限外、出典停止、takedown、並行CAS、失敗反復防止を確認する。既存の池部優先表示と人間判断保護は変更せず、正式検証を満たした未判断候補に対する既存処理を再利用する。

次の最小受入はこのPRの固定head統合・探索OFF配備。専用接続も最初はOFFに保ち、実在する未判断の池部ヒント・正式候補・有効保存証拠が揃った場合だけ、別途承認されたcache-only受入で更新件数・publisherRequests=0・READY・既存Ledger無変更を確認する。現在は池部ヒント0件のため、本番接続成功を証明する対象はない。対象作りのための有料検索・直接取得・候補捏造はしない。

受入記録：専用8試験PASS、NEWS/Operator全1,812試験PASS、Port NEWS 60試験PASS、NEWS/Operator双方のWrangler dry-run PASS。これらはローカル受入であり、新規B→Aの本番受入は未実施。
