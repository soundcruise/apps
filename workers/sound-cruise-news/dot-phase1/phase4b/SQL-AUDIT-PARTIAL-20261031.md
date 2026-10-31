> 過去工程の記録です。後続の修正・試験は EXACT-EVIDENCE-HANDOFF.md を参照してください。

# Phase 4B SQL・規模監査（未完了 / HOLD）

基準: PR #116 head f4cae3a68793a76dd2a12994431fe2650985d435、tree 42bf96ca2a3155f674d46615a124225c5e6d5ca2。mainの読み取り値は5c07c7b3d05bc99153113f214babd3a161514bf1。作業branchはcodex/news-dot-phase4b-sql-audit-20261031。既存PR・mainの変更なし。

## 今回の実測

- NEWS/Operator全回帰: 1,594 PASS。Port NEWS: 60 PASS。両Worker dry-run成功。対象JSのsyntax、git diff --check成功。
- 上記全回帰中の永続workerd D1正常系: 561行、Ledger 1,114,620 bytes、262件の架空確認で登録→PASS→承認。gate単体28クエリ、153,610 rows_read、返却249行52,218 bytes、gate wall 277ms。ローカル1回であり実クラウドの性能保証ではない。
- 実migrationを適用したworkerd D1で、候補610件相当、Ledger 312、discovery 202、takedown 6を用いた拡大試験を実行。正常系用の架空履歴確認を520件以上保存した後、PASSを期待した既存assertはHOLDで失敗。blockersはorphan_history_unresolved、history_changed_during_check。シード・確認保存を含む試験全体のwall 40.2秒であり、gate単体性能ではない。候補の削除や履歴省略は行っていない。
- candidateFenceはsummary.evidenceが512件を超える場合、history_read_incompleteとして拒否する。拡大試験はこの制限に到達する構成だが、その他の上限との寄与を個別に切り分けた独立試験は未実施。単なる上限引上げは安全な解決ではない。
- Node SQLiteで実migration後のscopeSqlをEXPLAIN QUERY PLAN: decision ledger、discovery、takedown、candidateのSCANがあり、evidenceはnews_dot_history_exclusion_lookupを使用、照合には自動covering indexと一時B-treeも使用。これはworkerd実行計画ではない。workerdでの別EXPLAIN試行は完了せず中断した。
- legacy duplicate互換は別途513行まで取得し、512件超または1MiB超でfenceSql=0として停止。候補中心の証拠512件制限と別物。
- Cloudflare公式D1制限: 1 invocationあたりFree 50/Paid 1000、1 SQLあたりbind 100。batchはinvocation上1クエリ扱い。https://developers.cloudflare.com/d1/platform/limits/ 。今回の28はgate単体であり、登録〜承認の全呼び出し数・本番プランは未測定。

## コード読取と未検証

operatorDecisionは最終INSERTでcandidate snapshot、receipt、証拠の存在と期限、candidateFenceの2つのSQL結果を再評価する。旧Worker対策は0029のトリガー、削除は0030のトリガーを用いる。既存テストには承認/却下競合、承認/削除競合、ACK喪失・再起動、履歴確認撤回、遅延takedownなどが含まれ、今回の全回帰でも通過した。ただし全ての条件・bind順序・異常JSON・遅延reject/重複・直接SQL・旧Worker全経路の独立な網羅的証明は完了していない。Firestoreと外部サイトの更新をD1トランザクションで防ぐことはできない。

## 次に解決すること

512件を超える独立確認が必要な場合に、証拠の変更・撤回・失効と新たな禁止履歴を最終承認時に原子的に検知しつつ、boundedな証明を作る設計を実装し、実migration・永続workerdで拡大正常系と反証を再試験する。関連性不明の履歴を省略したり、制限だけを緩和したりしない。再現方法はtest/dot-scale-d1.test.jsの305/156/101/3件を610/312/202/6件へ増やす隔離コピーを作り、n>=520とする（元testは変更しない）。

完了後にworkerd EXPLAIN、増加段階別rows_read/時間、登録・確認・承認の全D1呼び出し数とbind数、競合/証拠撤回の独立試験を実施する。262件・520件超のarchiveは架空fixtureであり、実媒体の権利確認ではない。実候補・正式な取得許諾、本番schema、バックアップ、現行クラウド構成は未確認。

Phase 4B実クラウド限定受入はHOLD。依存PR・0025〜0030の適用順、Dot OFF、backup、削除記録とtakedownの復元、限定登録の全書込行、停止と復旧を確定してから別承認を得る。Phase 4C常時接続は別工程。実環境への書込み・配備・migration・IAM/Access変更は行っていない。
