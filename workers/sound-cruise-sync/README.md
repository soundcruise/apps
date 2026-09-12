# Sound Cruise Sync Worker

Chord Cruise限定pilotの同期基盤です。Cruise Portのアプリ追加リクエストAPI（K3-A）とは、Worker・D1・secret・rate limitを共有しません。

## Phase P1の境界

- `GET /health`
- `POST /v1/sync/start`
- `POST /v1/sync/push`
- `GET /v1/sync/changes`
- `GET /v1/sync/snapshot`
- `POST /v1/sync/migration/complete`
- 匿名`sync_user`とChord専用device credentialのprovisioning
- D1 schemaとローカルmigration試験

P6では端末一覧・個別解除・この端末の同期解除・クラウドデータ削除をPilot限定で追加しています。同期解除はこの端末の同期資格だけを消し、Chord localStorageとクラウドデータを残します。クラウド削除は短命intentを使う二段階確認で全deviceを失効させ、7日後のscheduled hard purgeまで論理削除します。一般公開は後続Phaseです。P2では明示的なPilot操作だけが初回migrationを開始し、manifest一致後にdatasetを`ready`へ進めます。

## ローカル確認

```sh
npm install
npm test
npm run migrate:local
npm run check
```

`POST /v1/sync/start`とRecovery prepareはTurnstile、Recovery commitは短期claim、その他の同期endpointはdevice credentialで認証します。`TURNSTILE_SECRET_KEY`、`SYNC_CREDENTIAL_PEPPER`、`SYNC_RECOVERY_PEPPER`、`SYNC_DB`、該当rate limiterのいずれかが不足するとfail closedします。production bypassはありません。

## Remote Pilot（P2.5）

一般公開前の隔離検証用に、K3-Aと共有しない専用resourceを使用します。

- Worker: `sound-cruise-sync`
- Pilot URL: `https://sound-cruise-sync.cruise-port-requests.workers.dev`
- D1: `sound-cruise-sync` (`e37759f8-df08-4d2a-92b0-ffdd50de66df`)
- binding: `SYNC_DB`
- migrations: `0001_create_sync_foundation.sql` → `0006_add_device_management_and_account_deletion.sql`
- Secrets: `SYNC_CREDENTIAL_PEPPER`、`SYNC_PAIRING_CODE_PEPPER`、`SYNC_RECOVERY_PEPPER`、`TURNSTILE_SECRET_KEY`
- Turnstile: Sync専用widget、Pilot hostname限定

`soundcruise.jp`のDNSはこのCloudflare accountの管理外なので、`sync.soundcruise.jp`は設定していません。Custom DomainはDNS管理者と安全に調整できる後続Phaseまでrelease gateとして残します。本番ChordはFeature Flag既定OFFかつproduction host lockoutを維持し、remote Workerを呼びません。

### Remote rollback

1. `wrangler rollback --name sound-cruise-sync <version-id>`で直前の正常versionへ戻す
2. Pilot停止が必要なら`wrangler delete sound-cruise-sync`で専用Workerだけを削除する
3. Turnstileは専用widgetだけを削除し、K3-A widgetには触れない
4. D1は監査・必要なexport・保持判断を先に行い、schemaをDROPしない
5. Custom Domainは未設定のため解除作業なし

D1とSecretsはWorker削除とは別resourceです。誤削除を避けるため、Pilot完了時も専用D1は原則保持し、QA identityだけをID限定で削除します。一般公開前にはWorkers Paid、Privacy Policy、Custom Domain、Pairing/Recoveryを改めてrelease gateとして確認します。

## Credential

形式は`scd1.<device_id>.<256-bit base64url secret>`です。D1へ保存するのはWorkers Secretのpepperを使ったHMAC-SHA-256 verifierだけです。credential、Turnstile token、request body、raw IPをログへ出してはいけません。

## Recovery

Recovery Codeは紛らわしい文字`I/L/O/U`を除いた32文字alphabetの20文字（100 bit）です。平文はD1へ保存せず、Recovery専用pepperによるHMAC-SHA-256 verifierだけを保存します。復旧はprepareで短期claimと次のcredential/codeを受け取り、ユーザーの保存確認と端末へのcredential先行保存後にcommitします。commitは旧device全失効、未使用Pairing Code取消、新device作成、Recovery Code rotationを1つのD1 batchで行います。

## Device management and deletion

`GET /v1/sync/devices`はcredentialが属する同一anonymous identityのactive deviceだけを返します。`POST /v1/sync/devices/revoke`は同一identity・同一appのdeviceだけをidempotentに解除し、その端末が発行した未使用Pairing Codeも取消します。remote revokeは対象端末のlocal Chord dataを削除しません。

`POST /v1/sync/account/delete-intent`が10分間のone-time intentを発行し、`DELETE /v1/sync/account`がそのintentと現在credentialで論理削除を確定します。確定後は全device・Pairing・Recovery claimを無効化します。DELETE応答が失われても同じintentを再送すると`alreadyDeleted`として安全に確認できます。Cronは毎日03:15 UTCに条件付き・最大100件ずつ、期限切れPairing／attempt／claim、15分以上未claimのpair device、90日超のchange、365日超のtombstone、7日graceを過ぎたlogical-deleted accountをcleanupします。

## Local rollback

Chord側のfeature flagは既定OFFです。Workerを停止しても現在のChord localStorage動作は継続します。ローカル実装のrollbackはChordのSyncファイルとこの専用Worker directoryのrevertに閉じ、Cruise PortやK3-Aへ広げません。
