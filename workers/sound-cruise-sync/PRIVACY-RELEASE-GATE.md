# Sound Cruise Sync Privacy release gate

これは既存Privacy Policyの変更ではなく、一般公開前に正式文言へ反映するための内部チェック項目です。

- Chord、Folder、表示設定、並び順、メモをCloudflareへ保存すること
- メールアドレス等を使わず、匿名Sync identityを発行すること
- containerごとのdevice credential、作成日時、最終同期日時、端末種別から導くlabelを保存すること（個人名を自動収集しない）
- pairing code、recovery code、device secretの平文を保存しないこと
- Device一覧、現在端末表示、他端末の解除、および紛失端末を解除した場合はその端末のlocal Chordデータを消さないこと
- 「同期を解除」は現在端末のcredential・同期メタデータだけを消し、localStorageのChordデータとクラウドデータを残すこと
- 「クラウドデータを削除」は短命delete intentによる二段階確認後に全deviceをrevokeし、各端末のlocalStorageを消さないこと
- cloud deleteは論理削除後7日間の運用graceを経てhard purgeし、ユーザー向けUndoを提供しないこと
- change logは90日、record tombstoneは365日、Pairing／Recovery lifecycleは最大24時間、orphan pending deviceは15分を上限として条件付きcleanupすること
- recovery codeを全deviceとともに失うと復旧不能であること
- Recovery Codeは100-bitで一度だけ表示し、平文をserverへ保存しないこと
- Recovery成功時に旧device・未使用Pairing Codeを失効し、Recovery Code自身をrotationすること
- Recovery prepare/claimの保持期間、失敗試行制限、revoked device metadataの保持目的
- Cloudflare Workers／D1／Turnstileを処理基盤として利用すること
- request payload、資格情報、raw IPをアプリ運用ログへ残さないこと
- Standard／Proの基本同期とquotaの扱い
- 問い合わせ、削除要求、障害時の案内

Pairing、Recovery、device management、cloud deletion、scheduled cleanupの実装完了前、およびWorkers Paid確認前に一般公開しません。
