# schema0033 source Worker — 限定互換受入

基準#188 head ec172595d81dff693d8f969cdad98a40ffb8b6da、tree 6700841dd2a1aac884a3adbc9a1b289ee63fc028。
取得main c862e590ead36f41e39574997bf34517120e51dd。#186/#187/#188のheadは変更しない。
Studio累積候補0.76.0、Port/4アプリ/NEWSの製品ファイル・バージョンは変更しない。

**判定：現在source entryのschema0033互換性は隔離受入PASS。Production操作は未実施・別承認。**
既存Asset物理cleanupのHOLDは維持する。HOLD解除のためのDDLや削除方式を追加しない。
これは稼働Production Workerとの全byte同一性や実Account受入のPASSではない。

## 原因と採用元

現在mainの既存candidate wiringには、本番で未導入の次の参照が残っていた。

- writer-admission / writer-fence：minimum_writer_protocol、write_epoch、authority_state、authority_updated_at、
  sync_authority_cutovers、sync_writer_fence_assertion等。非PortのwriterObservationも同じ未導入列を参照。
- Asset：sync_asset_operationsのwriter/sync/epoch列、sync_authority_cleanup_claims、sync_asset_deletions。
- cleanup：sync_changes / tombstone処理からsync_authority_cutoversを参照。

出典は旧#144の257fadbd3c1dee9d9d644af8cbb7104ee733ce52、および#145のc701dd74
（参照Asset復旧と0033 cleanup HOLD）。#145固定70cd871a09c36e3394f112f84c37df6555f0a136で採用済みの
必要ハンクだけを再利用した。旧Worker bundle、maintenance services、別Owner、旧Account候補routeは戻さない。

## 最小差分と資格保護

- asset-database / cleanup-databaseは#145の互換実装を再利用。0033では存在する列だけを使用し、
  参照・所有境界は既存SQLのまま。reservationがない環境で物理削除へ進まない。
- writer-admissionの0033分岐は、旧候補の無条件null returnにはしない。
  既存admission object / checkFence / writerMutationDatabaseの中で最終SQL資格判定を維持する。
- 0033の最終fenceは、既存AppDeviceのHMAC verifier・失効、Account/membershipのID/状態/世代・正規mapping、
  linkされたAccount Deviceの失効、Pro verifier・scope・generation・idle期限・leaseを照合する。
  Port payloadのAsset参照も現在Account/membership/userへ限定する。
  同じD1 batchの前後で判定し、失敗は全batch rollback。認可状態や台帳を新設しない。
- Pro検証結果へ既存のgenerationを内部proofとして渡す。資格値をHTTPへ追加しない。
  NULLは認可根拠にせず必要proof欠損は拒否する。linked AppDeviceをunownedと見なす抜け道も拒否する。
  本当にAccount未所属の既存standalone appのPro保存は維持する。
- 0034以降の旧candidate分岐は保持。0033でauthority protocol指定を受けた場合はunsupported、
  部分的なauthority tableだけがある場合も安全停止する。追加DDLで欠損列を埋めない。
- Port initializing datasetのchanges取得は既存#145の条件に合わせ、初回受信を妨げない。
- 制作ProjectのOwner/codec/schema2/Outbox/Session、Port保存schema・通信payloadを変更しない。

## 受入で使ったentryとschema

旧legacy fixtureは使わず、現在checkoutのsrc/index.jsをbundleした。
製品試験はSTUDIO_PINNED_WORKER未設定で実行し、source受入flagとlegacy artifactの併用をassertで禁止。
esbuild input graphに現在indexが入り、legacy-v137/studio-legacy artifactがないことも確認する。
SOURCE-BUILD.jsonのgraphとbundle hashをacceptance.jsonへ保全。

SQLite試験は#188でread-only取得した本番DDL/journalそのもの。
Miniflare製品試験は同じ102アプリ構造と33 journalを照合し、ローカルplatform固有_cf_METADATAだけを区別する。
本番のデータ行をコピーせず、合成Account/Pro/Device/画像だけを用いる。全外部通信は拒否/fixture intercept。
Account/ProのTurnstile等の外部依存は合成fixtureに置くが、データAPIは現在sourceの正規認証/SQLを通す。

- Worker全体JS Node **940/940**、skip0。
- 本番構造/実entry/final fence/Scheduledの追加受入 **20/20**。
  保存確定直前のAccount世代/削除、membership世代、AppDevice verifier変更/失効、Account Device失効、
  Pro失効/世代/idle/lease切れを注入し、record/changeが0件のまま拒否されることを確認。
  初期OFFの追加DDL後も、Port保存とScheduledがProject pending証拠を変更しない。
- 実製品入口・現在source Workerの既存Port/4アプリ/calendar/Studio制作回帰 **51/51**。
- 現在source Worker＋既存activated factory＋RC4追加DDLのProject製品 **14/14**。
  一覧/別端末受信、更新、自動再開、Offline、CAS、ACK/UNKNOWN、削除/コピー復元、backup/別DB restore、
  Portとの同じDBでの共存、別Account拒否、5テーマ/4幅。page error0。
- Owner境界 **33/33**。Project-only資格でPort membershipが作られない旧境界を維持。
- 画像/添付/ACK/CAS/競合解決の既存製品 **12/12**（現在sourceを使用）。
- RC4追加DDL **1/1**。index / alternate OFF entryのWrangler dry-run成功。
- Jekyll実build：Studio81ファイル/hash一致、native813ファイルbyte一致。Cloud/developer除外を維持。

途中で見つけた試験fixtureの修正：
- dispatch専用app.testのDB doubleがschema照会を実装していなかったため、想定する既存authority profileを明示。
  未知SQLはthrowする。実資格/0033の試験はSQLite/製品E2Eで別に実施し、認可をstubで代替しない。
- #188からのuser_label静的FAILは、migrationファイル名user_labels.sqlの部分文字列に反応したもの。
  監査対象を正確なSQL identifierの単語境界へ修正。既存reader一覧・rename2箇所・copy禁止の期待値は不変。
- 新しい同期エンジンや試験エンジン、timeout延長、期待値の緩和、skip追加はない。

## Asset cleanupの扱い

0033には予約・削除claimの既存構造がないためclaimCleanupをHOLDする。
Scheduledは先に参照中のunreferenced Assetをavailableへ戻し、次の候補も処理する。
未参照物体は保持し、R2 deleteは0件。共有D1 cleanupとPro lockout cleanupは継続する。
HOLDはHOLD_SCHEMA0033_ASSET_CLEANUPとして返す。容量増加は既存運用上の残条件であり、自動削除を新設しない。
0036を含む既存候補profileのreservation/physical-delete経路は既存Node回帰で維持する。

## 83 CREATE / 88文と導入条件

#188のDDLと適用SQLは変更不要。
DDL hash: 9fe8c42228f08df58c165d616780a252b45d7b58590ead1c70e394f6f3de00a9。
88文SQL hash: 2f65ddf9a5b6a564049d7370b4162e3d61b659e90720cc3aa4e30ed87da50017。
共有d1_migrationsは33のまま。ProjectとPort writerの保存・資格・Outboxは分離する。

本番適用時は次の順序で承認範囲を確認する。

1. 直前main/Worker version/bindings/config、schema0033/journalをread-only再固定し、既存の通常backupと復旧先を記録。
2. このsourceを使う同じWorkerのProject初期OFF版を明示承認後に配備。
   既定indexはProject namespace未提供、#188のalternate entryは423 studio_off。HTTP/flagだけでは有効化できない。
   既存Account/Pro/Port/4アプリの稼働を運営者が限定確認する。
3. 別途承認した88文SQLを既存DBへ1回適用。通常migrations applyで0034以降を巻き込まない。
   marker/hash/初期enabled=0/shared journal不変を確認する。
4. 既存validatorと運用policy、Owner canary対象、frontend配布7ファイル/production transportを別途承認し、
   同じfactoryの正式構成として接続する。ここで実Account/Pro・二端末・Safariを限定受入する。

初期OFF段階の障害は直前Worker版へ戻せるようversion/bindingを固定する。
Project有効化後はProject OFFへ戻し、Scheduled proof保護・Project table/journal・Outboxを保持する。
既存CloudデータのTime Travel巻き戻し、逆DDL、R2削除を通常rollbackに含めない。

今回の結果は、#188の「現在sourceは0033で通常APIを提供できない」という具体的HOLDを解消する。
稼働Production artifactとの完全byte同一性、実Account受入、運用値の承認、実配備/DDLは未実施。
旧artifactの完全取得だけを機械的な追加HOLDにはせず、明示承認された段階導入で実契約を受け入れる。
main merge、Pages公開、Production変更、Studio正式リリース宣言は行わない。
