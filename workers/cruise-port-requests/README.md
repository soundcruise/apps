# Cruise Port request API

Cloudflare Workers、D1、Turnstile、Workers Rate Limitingで構成する、Cruise Portのunknownアプリ対応リクエストAPIです。Cruise PortのGitHub Pages frontendとは独立して動作します。

## Public API

`POST /v1/app-requests`

Production URL: `https://cruise-port-requests.cruise-port-requests.workers.dev/v1/app-requests`

許可Originはproductionでは`https://soundcruise.jp`のみです。JSON bodyの上限は2 KiBで、Store IDまたはAndroid packageとrequest keyはWorkerがStore URLから生成します。

```json
{
  "platform": "ios",
  "storeUrl": "https://apps.apple.com/jp/app/example/id123456789",
  "appName": "Example App",
  "requestSourceVersion": "0.9.0",
  "turnstileToken": "TOKEN"
}
```

成功response:

```json
{
  "ok": true,
  "requestKey": "ios:123456789"
}
```

## Local development

実secretは使用しません。Cloudflareの公式test secretだけを、Git管理対象外の`.dev.vars`へ`TURNSTILE_SECRET_KEY`として設定してください。localhost Originとtest key用の検証条件は起動時だけ上書きし、production設定やrepositoryへ保存しません。

```sh
npm install
npm test
npm run migrate:local
npx wrangler dev --local \
  --var ALLOWED_ORIGINS:http://127.0.0.1:4173 \
  --var TURNSTILE_EXPECTED_HOSTNAME: \
  --var TURNSTILE_EXPECTED_ACTION:
```

## Production operations

Turnstile widgetは`cruise-port-requests`（Managed、許可hostname `soundcruise.jp`）です。K3-Bで使用する公開site keyは`0x4AAAAAAEqoOZmmAp4nVr2r`です。secretはCloudflare Worker secretにのみ保存します。

```sh
npm run check
npm run migrate:remote
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler deploy
```

本番migrationはdeploy前に適用します。`.dev.vars`、`.env`、`.wrangler`、`node_modules`はGit管理しません。request body、Turnstile token、IP、secretをログへ出力しません。
