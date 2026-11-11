// Excluded local UI fixture. Never a release entry.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {renderDevelopmentEntry} from './generate-development-entry.mjs';
export function renderLocalUIEntry(source) {
 let html=renderDevelopmentEntry(source);
 html=html.replace(/<script\b[^>]*src="[^"]*(?:shared\/(?:pro-device-session|pro-gate-help|pro-gate|sync-account\/sync-account-[^/"?]+)|js\/port-sync-status|js\/cloud\/canary-entry)[^" ]*"[^>]*><\/script>/g,'');
 html=html.replace(/<link[^>]*href="https:[^>]*>/g,'');
 html=html.replace(/<script type="module" src="[^"]*js\/core\/studio-entry.mjs[^" ]*"><\/script>/,'<script type="module" src="/apps/cruise-studio/scripts/local-ui-adapter.js"></script>');
 return html.replace('<head>','<head><meta name="local-ui-fixture" content="0.100.0-dev.1"><style>@media print{[data-local-ui-banner]{display:none!important}}</style>').replace('<body>','<body><div style="position:fixed;bottom:0;left:0;z-index:99999;background:#fff3cd;color:#222;padding:4px;font:12px sans-serif" data-local-ui-banner>LOCAL DEVELOPMENT / 本番認証の検証対象外 — テストデータ専用</div>');
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.stdout.write(renderLocalUIEntry(fs.readFileSync(new URL('../studio-template.html',import.meta.url),'utf8')));
