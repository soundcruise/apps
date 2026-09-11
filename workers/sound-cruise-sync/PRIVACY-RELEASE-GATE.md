# Sound Cruise Sync Privacy release gate

これは既存Privacy Policyの変更ではなく、一般公開前に正式文言へ反映するための内部チェック項目です。

- Chord、Folder、表示設定、並び順、メモをCloudflareへ保存すること
- メールアドレス等を使わず、匿名Sync identityを発行すること
- containerごとのdevice credential、作成日時、最終同期日時、任意device labelを保存すること
- pairing code、recovery code、device secretの平文を保存しないこと
- change log、tombstone、削除猶予、hard deleteの保持期間
- 「同期を解除」「端末を解除」「クラウドデータを削除」「ローカルデータを削除」の違い
- recovery codeを全deviceとともに失うと復旧不能であること
- Cloudflare Workers／D1／Turnstileを処理基盤として利用すること
- request payload、資格情報、raw IPをアプリ運用ログへ残さないこと
- Standard／Proの基本同期とquotaの扱い
- 問い合わせ、削除要求、障害時の案内

Pairing、Recovery、cloud deletionの実装完了前、およびWorkers Paid確認前に一般公開しません。
