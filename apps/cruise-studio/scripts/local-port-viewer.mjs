import fs from 'node:fs';
export function renderLocalPortViewer(){
    const source=fs.readFileSync(new URL('../../cruise-port/index.html',import.meta.url),'utf8');
    const found=source.match(/<section class="port-section" data-home-section="tools"[\s\S]*?<\/section>/);
    if(!found)throw Error('Port tools section changed');
    let tools=found[0].replace(/href="#[^"]+"/g,'aria-disabled="true" tabindex="-1"');
    tools=tools.replace('<div class="card-grid home-card-grid" aria-label="ツール">','<div class="card-grid home-card-grid" aria-label="ツール"><a id="score-viewer-card" class="port-card skeleton-card tool-card" href="../score-viewer/local/index.html?from=port"><span class="skeleton-icon"><img src="../cruise-studio/assets/tool-sheet.svg" alt=""></span><span class="card-name">譜面ビューワー</span></a>');
    return '<!doctype html><html lang="ja" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="local-port-viewer" content="0.185.0-dev.1"><base href="/apps/cruise-port/"><title>クルーズポート · ローカル</title><link rel="stylesheet" href="style.css"><style>body{padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}[aria-disabled=true]{opacity:.45;pointer-events:none}.local-port-note{padding:12px;color:#dfc985;font-size:13px}.port-header h1{margin-top:20px}</style></head><body><div class="port-shell"><main class="port-view" id="home-view"><header class="port-header"><h1>クルーズポート <small>LOCAL</small></h1><p class="port-concept">弾き語りに必要なアプリを1つに集約。</p></header>'+tools+'<p class="local-port-note">ローカルの譜面ビューワー検証用です。他のツール・実アカウント・Syncには接続しません。</p></main></div></body></html>';
}
if(process.argv[1]&&process.argv[1].endsWith('local-port-viewer.mjs'))process.stdout.write(renderLocalPortViewer());
