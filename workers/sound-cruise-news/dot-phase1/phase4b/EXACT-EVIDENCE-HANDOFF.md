# Phase 4B 大量証拠の完全一致ゲート

基準: PR #116 head f4cae3a68793a76dd2a12994431fe2650985d435 / tree 42bf96ca2a3155f674d46615a124225c5e6d5ca2。main読み取り値5c07c7b3d05bc99153113f214babd3a161514bf1。作業branch codex/news-dot-phase4b-exact-witness-20261031。旧WIPと反証コードは /tmp/phase4b-evidence-wip-preserved-20261031/ に保全。従来の未追跡監査資料も歴史資料として保存する。

## 採用方式

件数/世代だけの方式は不採用。`scopeSql`は、候補に有効な証拠request IDをソートした**完全な集合**と、未解決/関連/禁止履歴、証拠変更世代、有効期限をD1内で評価する。集合をWorkerへ返さず、0032の`news_dot_scope_witnesses`へ入力keys/digest/revisionと共に固定する。

同じ候補・同じ入力・同じ集合には有効な既存nonceを再利用し、集合または世代が変われば別nonceになる。最終承認INSERTは、固定したnonce/keysに対応するD1内のstateと、現在のscopeSql結果の**完全一致**を条件とする。count比較や非暗号学的checksumで集合の同一性を代用しない。証拠A/Bの入れ替えは集合が異なるため検知される。

0031の証拠イベント世代を併用する。証拠の同一ID・同一内容をDELETE/INSERTで再作成しても、世代が変わり古いPASSを拒否する。証拠の直接UPDATEは0029の既存immutableガードで拒否する。新しいreject/takedown/正式重複、証拠の撤回や失効、対象候補・receipt・出典確認の変更は、従来の最終SQL条件と対象行CASも再評価する。

Witnessの内容変更はDBで拒否し、承認成功時に同じトランザクションのLedgerトリガーがdecision IDを関連付ける。candidate FKのCASCADEは一時的検証レコードにだけ適用し、0030の永続削除receiptを削除しない。候補削除時にWitnessの集合とkeysも消去される。証拠イベントにはopaque IDと操作種別だけを残す。

有効期限は最大5分。未使用で期限切れのWitnessは次のDot評価時に最大100件ずつ削除する。自動TTLやSchedulerは追加しない。承認済みWitnessは候補に従属して保持し、候補削除時に消去する。監査LedgerにはruleVersion、scopeDigest、Witness ID、証拠数・世代と確認IDを保存し、大量のID配列をLedgerへ再転送しない。

**Dotの診断GETも内部D1検証キャッシュを作成・掃除する。** 候補/facts/人間判断やFirestoreは変更しない。通常NEWSとDot OFFの経路へキャッシュ書込みは加えない。候補ごとの正確な証明を作るための内部副作用であり、元の純SELECT診断からの変更としてレビューすること。作成されたWitness自体は掲載権限ではなく、最終の認証済み人間操作・CSRF・正式facts・policy検証が必須。

## 変更と互換性

- 0031: 証拠INSERT/DELETEの追記専用イベント。旧証拠保存コードはmeta.changesで成否判定せず、保存行のhashを再読取するため、追加書込みと共存する。
- 0032: Witness、検索/期限索引、内容変更ガード、Ledgerとの原子的な関連付け。Dot専用の0029承認ガードをscope-2へ更新する。既存migrationは書き換えない。
- 旧WorkerのDot scope-1承認はDBで拒否する。通常NEWS、人間reject、takedown、0030の直接DELETEと再送拒否は維持する。旧Workerへのrollback時も0030〜0032を残し、Dot OFFを維持する。
- 従来のpre-0026 schema試験は、後代のWitnessトリガーも除去して当時のschemaを正しく再構成するよう修正した。実際の古いDBには後代トリガーは存在しない。
- package/session version: 0.48.0。依存ライブラリは変更していない。

## 検証と計測

`test/dot-evidence-witness-d1.test.js` は実workerd D1の**最終Ledger INSERT直前**へ変更を注入する。A削除/B追加、証拠撤回、同一ID再作成、期限切れ、takedown、正式SAME、human rejectで承認を拒否。新しい完全再検証後の承認は成功する。Witness/証拠改変拒否、候補削除、既存データからの0032移行と再適用も検証する。

既存の561行/262証拠E2Eを維持。拡大fixtureは1,126行、Ledger 2,229,240 bytes、522の独立subjectについて2回の認証済み人間確認を模擬し、1,044件の証拠を保存する。履歴を省略してPASSさせない。登録→PASS→既存Operator POST /api/decision（署名/allowlist/CSRF付きfixture）→人間承認→ACK再送/再起動/後続takedownまで検証する。実Accessトークン、実媒体の権利確認や本番D1による受入証明ではない。

本番NEWS互換日付2026-09-28での一回のローカル測定:

| 項目 | ゲート単体 | 認証済み承認HTTP全体 |
|---|---:|---:|
| D1呼び出し / SQL文 | 30 / 30 | 76 / 76 |
| rows_read | 47,603 | 118,686 |
| rows_written（索引等込みD1 meta） | 4 | 30 |
| Worker受取bytes（計測定義はテスト参照） | 37,182 | 90,594 |
| wall ms | 323 | 990 |
| 最大bind / SQL bytes | — | 79 / 14,515 |

単一回のローカル値で、実クラウドのCPU/通信時間保証ではない。first()の隠れたmetaもall()経由で取得してread/writeを集計する。GET /api/sessionはD1アクセス0。JWTは生成fixtureで、秘密値はログに出さない。EXPLAIN QUERY PLANは実workerdで取得。`k → subjects → evidence`の結合順を固定して既存索引news_dot_history_exclusion_lookup(candidate_id,subject_key,expires_at)を利用する。対象/イベントのPK・candidate索引も利用。Ledger/discovery/takedownの保持subject走査と、集合ソート用一時B-treeは残る。安全条件を削らず、試作の約113万rows_readから約4.8万に削減した。

[D1公式制限](https://developers.cloudflare.com/d1/platform/limits/): Freeはinvocationあたり50、Paidは1000。最大bind100、SQL100,000 bytes、row/string2,000,000 bytes、SQL30秒。76回の現行承認HTTPは**FreeでHOLD、Paidでは測定したD1操作数・bind・SQL長の範囲内**。実アカウントプランは未確認。Freeで使うには独立クエリのbatch化等の別途改善と再測定が必要。Paidでも実クラウド受入は別途必須。上限を増やす設定やプラン変更は今回行わない。

集合はD1の行/SQL資源制限に従い、エラー時はHOLDする。無限の証拠数を保証しない。既存のlegacy duplicate互換512件/1MiB、対象メタデータ64行/64KiBの別の保護は緩和しない。期限切れ/保持範囲外の履歴は復元していない。

## 残条件

最終回帰結果とcommit/tree/PRは完了報告を参照。0030削除回帰とOperator互換日付2026-10-02の競合試験を含む。Port全体の既存CSS4件は今回触らず、Port NEWSを検証する。

Phase 4B全体は実クラウド受入未完のためHOLD。Paid条件またはFree対応改善を確定し、適法な実候補の根拠、本番schema/backup、Dot OFF、0031→0032の適用、実Access、対象D1書込行、遮断/復旧を具体化して別承認を得る。未検証Moon Guitar M1を正式factsや公開へ昇格しない。Firestore/外部出典はD1と単一トランザクションではなく、最終読取後の外部変更リスクは残る。Phase 4Cの常時接続は別工程。本番操作、main merge、IAM/Access変更、定期実行は行っていない。
