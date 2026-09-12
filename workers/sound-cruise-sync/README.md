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

Pairing、Recovery、Conflict解決UI、一般公開は後続Phaseです。P2では明示的なPilot操作だけが初回migrationを開始し、manifest一致後にdatasetを`ready`へ進めます。

## ローカル確認

```sh
npm install
npm test
npm run migrate:local
npm run check
```

`POST /v1/sync/start`はTurnstile、それ以外の同期endpointはdevice credentialで認証します。`TURNSTILE_SECRET_KEY`、`SYNC_CREDENTIAL_PEPPER`、`SYNC_DB`、該当rate limiterのいずれかが不足するとfail closedします。production bypassはありません。

## Remote resource gate

`wrangler.jsonc`のD1 IDは意図的にzero UUIDです。次を確認するまでremote deployしません。

1. 正しいCloudflare accountを`wrangler whoami`で確認
2. `sound-cruise-sync` Worker／D1の名前衝突を確認
3. 専用D1を作成し、zero UUIDを実IDへ置換
4. `TURNSTILE_SECRET_KEY`を専用Workers Secretとして登録
5. 32文字以上の`SYNC_CREDENTIAL_PEPPER`を専用Workers Secretとして登録
6. `sync.soundcruise.jp`の既存DNSとroute衝突を確認
7. 0001＋0002 local migration／dry-run／rollback手順を確認
8. 一般公開前にWorkers Paidをrelease gateとして確認

候補custom domainは`sync.soundcruise.jp`です。P1ではDNS、Worker、D1、secretなどのremote resourceを作成しません。

## Credential

形式は`scd1.<device_id>.<256-bit base64url secret>`です。D1へ保存するのはWorkers Secretのpepperを使ったHMAC-SHA-256 verifierだけです。credential、Turnstile token、request body、raw IPをログへ出してはいけません。

## P1 rollback

Chord側のfeature flagは既定OFFです。Workerを停止しても現在のChord localStorage動作は継続します。remote deploy前なので、P1のrollbackはChordの新規Syncファイルとこの専用Worker directoryのrevertだけで完結します。
