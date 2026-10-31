# Port iframe と Studio Cloud の保存境界: 合成試験

対象は PR #106 head `00a022ca65402888553e580d3f9d10fb754ae89e`。この文書は実装担当による追加監査であり、独立レビューではない。実Account・実Pro・実ユーザーデータは使用していない。

## P2: Account/世代の切替に対する Port writer admission が未確定

Studio の Port Host は `canWrite=false` だが、同一originの iframe は Port 自身の画面と保存処理を使用する。Host の読取り権限は iframe の Port 書込みを制御しない。隔離Chromeとローカルの合成Cloudで、Port機材追加フォームを開いた後に (1) Studio Clientの合成 `readSession` を別Accountに切替、(2) 合成DBのAccount generationを更新したところ、どちらも開いたPortフォームのローカル保存が成功した。前者はIdentity Hostの実際の切替操作を再現していない。後者はサーバー側generationの変化であり、実機上の失効通知を再現していない。

Account間データ混在や実データ損失の発生は実証していない。しかし、Account境界を同じoriginの共有データにも適用できるという保証は得られないため、Port共通データ同期と統合リリースをHOLDとする。UIだけで保存処理を書き換えたり、独自Account境界を設けたりしない。

Sync/Port ownerへの要求: Port書込みのAccount・Owner・device/Pro generationに対するadmissionとcommit時のfence、切替中の停止・再読込、既存未同期データの保持と明示的な移行、同時タブ/旧build・UNKNOWN時の扱い、写真・アイコンのsource/finalと参照・削除の原子的な契約を定義し、既存Port単独とStudio iframeの双方で反例試験する。Studio Project CAS/OutboxとPort datasetは別々の受入条件である。

P0/P1は今回の範囲で実証していない。P2の上記HOLD以外に問題がないという意味ではない。実Pro失効、実Account、二端末Sync、Account切替中の画像編集と実端末は未検証。

## 合成試験

- ローカル専用Miniflareの新規D1、合成資格、使い捨てChrome profile、拒否される外部通信でIdentity 25、Session 48、Cloudパネル11、Client 28がPASS。
- Client試験を拡張し、commit ACK喪失でProject操作がUNKNOWNの間にPort機材を保存しても、Outbox snapshotとProject revisionが一致し、その後明示reconcileでSYNCEDに至ることを確認した。
- この共存・切替反例は `tests/studio-sync-client.test.mjs` の専用合成fixtureで再現できる。合成Session切替、Account generation変更、device credential version変更の後の保存成功をassertする3件は現状の境界不足を記録するもので、Account安全性のPASSではない。fixtureのPortディレクトリ要求はローカルの `index.html` に解決する。
- 2タブで同じ初期状態の機材フォームを編集し、先の保存後に後続の古いフォームを保存すると、先のデータを保持しエラーを表示した。`tests/port-gear-concurrent.browser.cjs` はloopbackと使い捨てcontextを必須とする。
- 画像本体と参照の合成fixture再読込・削除は既存Port Browser試験の範囲で確認。実Proの画像追加・再編集、切替中の画像操作、binary同期は未受入。
- Pro失効の合成Cloud Client試験はfail closedを確認したが、Port iframe内部の実Pro認証・失効は未検証。

別に再実行したStudio Nodeは1929 PASS / 2 dedicated E2E skip。Port Nodeは既知のテーマ期待値4件が失敗し、別の厳密なテスト修正を一時適用すると1149 PASS。Port製品コードを変更しない。My Apps Browserの起動待ちが早すぎるテストをPort frameのreadyまで待つよう修正し、実際の制限と案内の検査を維持した。
