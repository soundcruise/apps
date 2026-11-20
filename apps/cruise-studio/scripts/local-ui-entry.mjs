// Excluded local UI fixture. Never a release entry.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {renderDevelopmentEntry} from './generate-development-entry.mjs';
import {ensureOwnerBundle} from './generate-local-chord-owner.mjs';
export function renderLocalUIEntry(source) {
 ensureOwnerBundle();
 let html=renderDevelopmentEntry(source).replace(/((?:theme|print)\.css)\?v=[^"]+/g,'$1?v=0.204.0-dev.1');
 html=html.replace(/<script\b[^>]*src="[^"]*(?:shared\/(?:pro-device-session|pro-gate-help|pro-gate|sync-account\/sync-account-[^/"?]+)|js\/port-sync-status|js\/cloud\/canary-entry)[^" ]*"[^>]*><\/script>/g,'');
 html=html.replace(/((?:melody-editor\.css|melody-editor\.js|(?:melody-commands|melody-staff|melody-notation|schema2|common-music-model|editing-session|score-workspace|operation-adapter|song-model|sheet-renderer|sheet-cruise)\.js)\?v=)[^"]+/g,(_,prefix)=>prefix+'0.204.0-dev.1');
 html=html.replace(/(<select id="sc-time-sig">[\s\S]*?<option value="4\/4">4\/4<\/option>)([\s\S]*?<\/select>)\s*<span class="form-note">他の拍子は将来対応<\/span>/,
   '$1<option value="3/4">3/4</option>$2');
 html=html.replace(/<link[^>]*href="(?:https:|[^"]*shared\/pro-gate\.css)[^>]*>/g,'');
 html=html.replace('<section id="screen-home"', '<section id="screen-score-viewer" class="screen hidden" hidden inert tabindex="-1" aria-label="譜面ビューワー"><header class="screen-header"><h1>譜面ビューワー</h1><button type="button" class="sv-dock-button" data-open-tool="scoreViewer">右窓で表示</button><a class="sv-standalone-link" href="/apps/score-viewer/local/index.html?from=studio">スマホ・オフライン画面</a></header><div id="score-viewer-host"></div></section><section id="screen-home"');
 const viewerCard='<button type="button" id="open-score-viewer" data-home-workspace="scoreViewer" aria-label="譜面ビューワー"><img class="home-port-icon" src="/apps/cruise-studio/assets/tool-sheet.svg" alt=""><strong>譜面ビューワー</strong><span class="home-tool-tip">演奏用の譜面を開く</span></button>';
 html=html.replace(/(<button[^>]*data-home-workspace="portNews"[\s\S]*?<\/button>)/,'$1'+viewerCard);
 html=html.replace(/(<button[^>]*data-workspace="portNews"[\s\S]*?<\/button>)/,'$1<button type="button" data-workspace="scoreViewer" title="譜面ビューワー"><img class="nav-icon home-port-icon" src="/apps/cruise-studio/assets/tool-sheet.svg" alt="">譜面ビューワー<span>演奏用の譜面を読む</span></button>');
 html=html.replace(/(<script src="[^"]*js\/shell\.js[^"]*"><\/script>)/,'<script src="/apps/cruise-studio/scripts/local-viewer-bootstrap.js?v=0.204.0-dev.1"></script>$1');
 html=html.replace('</head>','<link rel="stylesheet" href="/apps/score-viewer/ui/viewer.css?v=0.204.0-dev.1"></head>');

 html=html.replace(/<script type="module" src="[^"]*js\/core\/studio-entry.mjs[^" ]*"><\/script>/,'<script type="module" src="/apps/cruise-studio/scripts/local-ui-adapter.js"></script>');
 return html.replace('<head>','<head><link rel="stylesheet" href="/apps/cruise-studio/assets/chord-owner/fonts.css"><meta name="local-ui-fixture" content="0.204.0-dev.1"><style>@media print{[data-local-ui-banner]{display:none!important}}</style>').replace('<body>','<body><div style="position:fixed;bottom:0;left:0;z-index:99999;background:#fff3cd;color:#222;padding:4px;font:12px sans-serif" data-local-ui-banner>LOCAL DEVELOPMENT / 本番認証の検証対象外 — テストデータ専用</div>');
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.stdout.write(renderLocalUIEntry(fs.readFileSync(new URL('../studio-template.html',import.meta.url),'utf8')));
