# 一時通信エラーの報告 — 限定修正・独立監査資料

## 結論

`notifyLocalSave()`の失敗通知は、既存runtimeがretryingとして自動再試行する通信失敗も
一律errorとしてPortへ送っていた。503/429で修正前に再現した。
既存のretryableErrorとPAUSE_CODES/TERMINAL_CODESを使い、その通信失敗だけpendingへ振り分ける。
自動再試行・同期成功後のclean報告・Outbox処理は変更しない。

本人3件の最新報告は依然として**attention / attentionCount=0**。
今回の通信失敗時の**error**経路とは区別が必要であり、本修正が3件の直接原因を直したとは判断しない。
Midnight旧v1保留は未確定。内容一致terminal整理は実装していない。

## 変更・影響

- 製品ロジックは共有runtimeの1か所だけ。4行追加・3行削除。
- 新しいエラー分類、永続フラグ、DB、schema、同期エンジンは0。
- 400系の恒久エラーはerrorのまま。PAUSEは今回pendingへ変更しない。
  PAUSEは通信エラーと異なり、経路によって自動再試行の有無が違うため、一律に再試行待ちとしない。
- authority拒否・資格失効の既存request/実行guardは不変更。
  guardで報告自体が拒否される場合もあり、クラウドへ必ずerrorを送れると保証しない。
- pendingはcleanではなく、WorkerのremovalSafetyは全有効同期先がcleanのときだけsafe。
  pending混在はunknownのまま。削除・解除の既存確認を回避しない。
- runtime参照は全5入口でv38。音感2.32.4、指板2.27.6、リズム1.23.5、Port1.31.1候補。
  その他の製品差分は版/cacheのみ。Chordは別clientのため不変更。Studio/NEWS/Workerは変更しない。

## 本人3件の観測限界

同じ報告元をAccount限定のSELECT-onlyで再確認。最終attention報告は11/8 JSTの
音感21:34、指板20:38、リズム21:33で、いずれもcount0、同じ報告元の最新cleanではない。
表示名はアプリ名を使った一般名であり、物理端末やSafari/PWAを特定する名前ではなかった。
保存済み本人PortのaccountDeviceIdとは接続元が異なる。ただし現在Portの資格を実機で再取得しておらず、
現時点のisCurrentを断定する観測ではない。古い時刻だけで未使用とも判断しない。

USB接続後のSafari検査一覧でiPhoneを認識したが「検査可能なコンテンツがありません」。
アプリを新規起動していないため、同じ保存領域のOutbox/terminalError/recordType/deleted/
authorityStatus/競合/Shadowおよびアプリ版は未確認。payload本文・資格・復旧コードは収集していない。

次の最小観測は、報告元appDeviceIdと一致する保存領域で上記metadataだけを読むこと。
通常起動は自動Syncを起こし得るため、今回の読み取りとは別の承認が必要。
最新版を一度開くだけで旧v1保留が解消すると、現時点では保証しない。

## 試験

- 新規8件＋関連既存6件、計14件PASS。
- 503/429/通信例外: 保存内容と既存Outboxを保持、実retry timerで送信、成功後だけclean。
- 400・PAUSE・authority拒否・Device失効: 既存の失敗/資格保護を維持、cleanを偽装しない。
- pending混在時のremovalSafety=unknown、全clean時のみsafeを実際のAccount repositoryで確認。
- Port表示のpending関連既存3件PASS。全5入口のv38参照と版/cache整合も確認。
- 本人データの書換え、Account/同期先解除、本番配備、有料推論は0。

再現:
`node --test --test-name-pattern='transient report:|network TypeError|snapshot network failure|blocked authority outbox preserves|generic auth, network failure' apps/shared/sync-account/multi-app-sync-runtime.test.mjs`

## 監査で確認すべき境界

1. pending化の対象が既存retryableErrorの通信失敗に限定され、PAUSE/terminal/authorityを隠していないか。
2. retry timerと保存内容の保持を別々に確認し、単なる表示変更で成功扱いしていないか。
3. cleanは実同期成功からだけ発行され、別同期先のcleanでattentionを消していないか。
4. 本人3件のattentionと今回の一時error報告を混同していないか。

本候補の限定修正はローカルPASS。本番公開は未承認・未実施。
本人3件の原因特定・解消はHOLD。新しいterminal整理や一律PAUSE処理を追加しない。
