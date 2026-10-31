> 過去工程の記録です。後続の修正・試験は EXACT-EVIDENCE-HANDOFF.md を参照してください。

# 512件超の履歴確認: 試作は危険、未完成

基準PR #116 f4cae3a68793a76dd2a12994431fe2650985d435、tree 42bf96ca2a3155f674d46615a124225c5e6d5ca2。前工程の未追跡SQL-AUDIT-PARTIAL-20261031.mdはそのまま保持し、/tmp/phase4b-partial-preserved-20261031.mdにもコピー。作業branch codex/news-dot-phase4b-evidence-scale-20261031 は未commit。既存PR・mainの変更なし。

## 試作

0031_dot_evidence_events.sqlでhistory_exclusionsへのINSERT/DELETEを追記専用イベントに記録し、scopeSqlの証拠ID配列を件数・候補単位イベント世代・最短期限へ置換。旧Workerが同じテーブルを通して行う証拠書込みもトリガーで捕捉する。本文をWorkerへ戻さない。dot-publication-gate.jsとoperator-review.jsの監査フィールドをcount/versionへ変更。

workerd D1の架空データ1,126行、Ledger約2.23MB、522件の独立subjectを対象に、各subjectについて2回ずつ人間確認を保存し、計1,044件以上の確認で登録→PASS→人間承認は成功。gate単体28クエリ、1,131,243 rows_read、返却37,080 bytes、352ms（1回のローカル測定）。承認関数全体の計測はD1呼出し72回、SQL文72件、最大bind 77、返却89,908 bytes、wall 1,035ms。Access検証など外側の処理は含まない。Freeプランの50回を超えるため、実プラン不明のまま稼働可能と判断しない。0030を含む削除・旧SQL・登録・承認のfocused tests 56件PASS。これらは試作の安全性の証明ではない。

## 具体的な安全上の失敗

履歴subject AとBについて既にそれぞれ確認証拠がある場合、Aのtakedownを削除してBのtakedownを追加すると、証拠テーブルのイベント世代は変わらない。有効証拠件数・最短期限・unresolved/related/blockedも同じ値のままになるため、旧PASSのscopeSql結果が不変。従来の証拠ID配列ならAとBの区別が可能だった。新しいtakedownの追加をPASS後に検知する安全要件を満たさない。

再現: node --test test/dot-evidence-swap-audit.test.js。試作ではnotEqualのassertが失敗する。SQLite fixtureでの反証であり、実際の不正公開を観測したという意味ではない。未commitの0031とJS変更は危険な試作であり、deploy・merge・remote migration禁止。試作版はPR化しない。

## 次に解決する一点

証拠件数・世代だけでなく、検証時に有効だったsubject/evidenceの正確な集合を、履歴本文をWorkerへ送らずD1内の候補・検証単位で固定し、最終承認INSERTと同じ原子的境界で集合の両方向差分、失効、撤回、新規禁止履歴を確認する。DB内の検証snapshotとevidence ID参照を候補と認証済み操作に束ねる方式が候補。既存のGETを意図せず書込みに変えないよう、検証証拠の生成時点・TTL・競合・ACK喪失・削除契約・旧Worker混在を設計する。全履歴表への単純な世代更新トリガーは旧Workerのmeta.changes互換を壊し得るため、代替方式として同等性を実証するまで採用しない。

拡大試験test/dot-scale-extended-d1.test.jsを追加。1,000件超の追加試験と承認関数計測はPASSしたが、重大な反証があるため採用不可。詳細は/tmp/phase4b-evidence-extended-final.log。test/dot-evidence-swap-audit.test.jsは現状失敗する安全回帰。全回帰・dry-runは試作完成後に改めて実行する。前工程の1,594/60はこの試作後のPASSではない。

Phase 4B全体とクラウド受入はHOLD。FirestoreとD1の外部更新競合は残る。本番操作・main merge・既存PR更新・IAM/Access変更は一切行っていない。
