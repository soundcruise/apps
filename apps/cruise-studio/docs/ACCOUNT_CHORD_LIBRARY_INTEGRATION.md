# 同期Accountのコード本棚を編集カードへ表示する連携案

2026-11-12。利用者の希望は「同期しているAccountの本棚をStudioの同じ編集カードで選択する」。JSONコピーや別タブを前提とする案とは区別する。本書は設計調査で、実Accountへの接続・本番設定変更は未実施。

## 既存の接続を使う

通常Studioには js/modules/series/internal-app.mjs の createNativeSyncHost と mount がある。同じAccount・Pro資格・storage generation・AppDeviceを照合し、既存コードクルーズを内部表示する。seriesApps.chord.nativeWindow とネイティブのChordCruiseSync clientが接続点になる。

Chordの同期は folder / chord / library_order などを既存のSyncへ保存する。ネイティブclientのcaptureSnapshot等を通じた、同期済み端末本棚の読取り投影を使う。新しいSync runtimeや別の本棚保存先をB側に作らない。

## 最小の連携契約

- 既存native hostが認証済みで現在のAccountに属する本棚だけを、読取り専用providerとして渡す。credentials、device資格、Recovery情報をB側へ渡さない。
- providerはフォルダ、コード名、6弦フォーム、順序、削除状態、Account/接続の世代を返す。UIは同じ編集カードへ本棚のフォルダとコード図を描画する。
- カードでのコード選択は既存Sessionへ名前とフォームを1回のUndo単位で採用する。元本棚の保存・削除・並替えやSync pushを行わない。
- 非同期読取り前後と採用時にAccount・世代・Project・bar ID・tick・source revisionを再確認する。切替・失効・未確認の端末帰属・同期競合があれば古い内容を採用しない。
- 端末の同期済み本棚を表示する案と、Cloud上のsnapshotだけを表示する案を混同しない。前者には正当な未送信編集が含まれ得るので、既存native hostの帰属・review判定をそのまま使う。

## 18874で実データを読めない現在の理由

このローカル入口は、依頼された安全条件に従いAccount/Sync bootstrapを除外している。CSPは connect-src none / frame-src none、サーバーもAccount/Cloudの資源を配信しない。Account接続は存在しない。

本番Syncの読取りは GET /v1/sync/snapshot?appId=chord を使い、App資格・Pro資格が必要。リポジトリの本番設定は https://soundcruise.jp を許可originとし、127.0.0.1を許可していない。既存の /v2/pro-auth のhostname制限もある。アカウントデータが読めないのではなく、この検証入口がその認証・通信環境から分離されている。

## 実装前に確認する判断

同じカードの本棚UIとprovider契約は合成Accountでローカル検証できる。しかし、利用者の実Accountを18874から読むには、従来の「本番Account/Syncに接続しない」「本番資格情報を使わない」「localhost専用」の条件を両立できない。

推奨は、既存Studioの認証済みnative接続を再利用する統合として実装し、実アカウント検証用の入口・認証・origin方針を先に決めること。既存本番のCORSへlocalhostを追加する、本番Pro認証を回避する、資格情報を複製する、本番公開する、といった変更はこの作業で行わない。

実データ接続に進む条件が承認されるまではHOLD。現在のJSON／別タブ経路は従来機能であり、この目的の完成とは判定しない。
